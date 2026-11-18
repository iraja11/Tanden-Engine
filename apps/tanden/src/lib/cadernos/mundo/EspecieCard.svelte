<script lang="ts">
  import {
    BIOMAS, SPECIES_COLORS, SPECIES_FIELDS, SPECIES_GROUPS, SPECIES_LOOK_KEYS, SPECIES_PLANS, SPECIES_SIZES, SPECIES_TEMPLATE_GROUPS, SPECIES_TEMPLATES,
    rollSpecies, setProp, setProps, setSection, speciesBlurb, speciesFigure, speciesFilled, speciesNotes, speciesPlan, speciesTemplatePatch, speciesValue, speciesWeightGuess,
    type Entity, type PropValue, type SpeciesField, type SpeciesRealm, type SpeciesSection, type SpeciesTemplate, type SpeciesTemplateGroup, type World,
  } from '@tanden/core';
  import { sound } from '../../sound.svelte';
  import { cadernos } from '../cadernos.svelte';
  import EspecieFigura from './EspecieFigura.svelte';

  // Construtor de espécies dentro da ficha: moldes prontos, o retrato ao lado
  // (com uma referência de tamanho), características reais e fantásticas em
  // botões, e um dado que sorteia só o que falta, coerente com o já decidido.
  let { entity, fm, world }: { entity: Entity; fm: Record<string, PropValue>; world: World } = $props();

  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const keyOf = (k: string) => Object.keys(fm).find((x) => fold(x) === fold(k)) ?? k;
  const val = (k: string) => speciesValue(fm, k);
  const list = (k: string) => val(k).split(',').map((x) => x.trim()).filter(Boolean);
  const fig = $derived(speciesFigure(fm));
  const filled = $derived(speciesFilled(fm));
  const notes = $derived(speciesNotes(fm));
  const places = $derived(world.entities.filter((e) => e.type === 'lugar').map((e) => e.name));

  let group = $state<(typeof SPECIES_GROUPS)[number]['id']>('corpo');
  let view = $state<'retrato' | 'escala'>('retrato');
  let realm = $state<'tudo' | SpeciesRealm>('tudo');
  let query = $state('');
  let adding = $state<string | null>(null);

  // ------------------------------------------------ o que aparece na lista
  const q = $derived(fold(query));
  const hit = (s: string) => fold(s).includes(q);

  function sectionsOf(f: SpeciesField): SpeciesSection[] {
    const all = (f.sections ?? []).filter((s) => realm === 'tudo' || s.tipo === realm);
    if (!q || hit(f.label)) return all;
    return all.map((s) => ({ ...s, options: s.options.filter(hit) })).filter((s) => s.options.length);
  }
  const fields = $derived.by(() => {
    if (!q) return SPECIES_FIELDS.filter((f) => f.group === group && (!f.sections || sectionsOf(f).length || extras(f).length));
    return SPECIES_FIELDS.filter((f) => hit(f.label) || sectionsOf(f).length);
  });
  /** valores da ficha que não estão entre os botões visíveis */
  function extras(f: SpeciesField): string[] {
    if (!f.sections) return [];
    const shown = (f.sections ?? []).filter((s) => realm === 'tudo' || s.tipo === realm).flatMap((s) => s.options).map(fold);
    return list(f.key).filter((x) => !shown.includes(fold(x)));
  }

  // ------------------------------------------------ escrever na ficha
  function put(k: string, v: PropValue | null) {
    cadernos.update(entity.path, (t) => setProp(t, keyOf(k), v === '' ? null : v));
  }
  /** Grava vários campos; o que ficou vazio sai da ficha, para não sujar a nota. */
  function putMany(patch: Record<string, string>) {
    const full = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== ''));
    const empty = Object.keys(patch).filter((k) => patch[k] === '');
    cadernos.update(entity.path, (t) => empty.reduce((text, k) => setProp(text, k, null), setProps(t, full)));
  }
  function choose(k: string, opt: string, multi: boolean) {
    const cur = list(k);
    if (!multi) {
      put(k, cur.length === 1 && fold(cur[0]!) === fold(opt) ? '' : opt);
      return;
    }
    const has = cur.some((c) => fold(c) === fold(opt));
    const next = has ? cur.filter((c) => fold(c) !== fold(opt)) : [...cur, opt];
    put(k, next.join(', '));
  }
  const on = (k: string, opt: string) => list(k).some((x) => fold(x) === fold(opt));

  function addCustom(f: SpeciesField, raw: string) {
    const v = raw.trim().replace(/,/g, ' ');
    adding = null;
    if (!v) return;
    if (f.multi) {
      if (!on(f.key, v)) put(f.key, [...list(f.key), v].join(', '));
    } else put(f.key, v);
  }

  /** Troca vários campos de uma vez, guardando como estavam para poder desfazer. */
  let undo = $state<{ label: string; before: Record<string, string> } | null>(null);
  function apply(patch: Record<string, string>, label: string) {
    const before: Record<string, string> = {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      before[k] = val(k);
      out[keyOf(k)] = v;
    }
    putMany(out);
    undo = { label, before };
  }
  function revert() {
    if (!undo) return;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(undo.before)) out[keyOf(k)] = v;
    putMany(out);
    cadernos.say(`Desfeito: ${undo.label}.`);
    undo = null;
  }

  const sapiente = $derived(entity.type === 'especie' ? undefined : false);
  function roll() {
    const have: Record<string, string> = {};
    for (const f of SPECIES_FIELDS) have[f.key] = val(f.key);
    const out = rollSpecies(Math.random, have, { sapiente, realista: realm === 'real' });
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(out)) if (!val(k).trim()) patch[k] = v;
    if (!Object.keys(patch).length) {
      cadernos.say('Tudo já está decidido. Use "Variar a aparência" ou apague um campo.');
      return;
    }
    apply(patch, 'sorteio');
    sound.play('tick');
    cadernos.say(`Sorteado: ${Object.keys(patch).length} campos.`);
  }

  /** Sorteia outra aparência mantendo o plano do corpo e o tamanho. */
  function vary() {
    const keep = new Set(['corpo', 'altura', 'peso']);
    const have: Record<string, string> = {};
    for (const f of SPECIES_FIELDS) have[f.key] = SPECIES_LOOK_KEYS.includes(f.key) && !keep.has(f.key) ? '' : val(f.key);
    const out = rollSpecies(Math.random, have, { sapiente, realista: realm === 'real' });
    const patch: Record<string, string> = {};
    for (const k of SPECIES_LOOK_KEYS) if (!keep.has(k) && out[k] !== undefined) patch[k] = out[k]!;
    apply(patch, 'nova aparência');
    sound.play('tick');
  }

  function writeBiology() {
    const txt = speciesBlurb(entity.name, fm);
    if (!txt) {
      cadernos.say('Escolha pelo menos o corpo ou a dieta antes.');
      return;
    }
    cadernos.update(entity.path, (t) => setSection(t, 'Biologia', txt));
    cadernos.say('Escrito em "Biologia". Edite à vontade: é só um começo.');
  }

  // ------------------------------------------------ moldes
  let showTemplates = $state(false);
  let tplGroup = $state<SpeciesTemplateGroup>('povos');
  const templates = $derived(SPECIES_TEMPLATES.filter((t) => t.grupo === tplGroup && (realm === 'tudo' || t.tipo === realm)));
  const tplFigs = new Map<string, ReturnType<typeof speciesFigure>>();
  const tplFig = (t: SpeciesTemplate) => {
    let f = tplFigs.get(t.id);
    if (!f) tplFigs.set(t.id, (f = speciesFigure(t.props)));
    return f;
  };
  function useTemplate(t: SpeciesTemplate) {
    apply(speciesTemplatePatch(t), `molde ${t.nome}`);
    showTemplates = false;
    sound.play('tick');
    cadernos.say(`Molde "${t.nome}" aplicado. Agora é só mudar o que quiser.`);
  }

  // ------------------------------------------------ cores
  const SLOTS = ['Principal', 'Detalhe', 'Ventre'];
  let slot = $state(0);
  const palette = Object.entries(SPECIES_COLORS);
  const colorParts = $derived(val('cor').split(/,|\se\s/).map((x) => x.trim()).filter(Boolean));
  const hexOf = (name: string | undefined) => (name ? SPECIES_COLORS[name] ?? palette.find(([k]) => fold(k) === fold(name))?.[1] : undefined);
  function setColor(name: string) {
    const parts = [...colorParts];
    while (parts.length < slot) parts.push(parts[parts.length - 1] ?? name);
    parts[slot] = name;
    put('cor', parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0]!);
    slot = Math.min(2, slot + 1);
  }

  // ------------------------------------------------ tamanho
  const plan = $derived(SPECIES_PLANS[speciesPlan(val('corpo'))]);
  const sizeLabel = $derived(plan.comprido ? 'Comprimento' : 'Altura');
  const weightGuess = $derived(speciesWeightGuess(plan.id, fig.medida, fig.porte));
</script>

<div class="esp t-card">
  <header>
    <h3 class="t-eyebrow">Construtor de {entity.type === 'criatura' ? 'criatura' : 'espécie'}</h3>
    <span class="pct" title="Campos do construtor preenchidos"><i style:width="{Math.round(filled * 100)}%"></i></span>
    <small class="dim">{Math.round(filled * 100)}%</small>
    <span class="grow"></span>
    {#if undo}
      <button class="t-btn t-btn--sm t-btn--quiet" onclick={revert} title="Volta os campos como estavam">↶ Desfazer {undo.label}</button>
    {/if}
    <button class="t-btn t-btn--sm" class:t-btn--on={showTemplates} onclick={() => (showTemplates = !showTemplates)} aria-expanded={showTemplates}>▦ Moldes</button>
    <button class="t-btn t-btn--sm" onclick={vary} title="Sorteia outra aparência, mantendo o corpo e o tamanho">✦ Variar a aparência</button>
    <button class="t-btn t-btn--sm" onclick={roll} title="Sorteia só os campos vazios, coerente com o que já existe">🎲 Sortear o que falta</button>
    <button class="t-btn t-btn--sm" onclick={writeBiology} title="Escreve um parágrafo na seção Biologia a partir dos campos">✎ Escrever biologia</button>
  </header>

  {#if showTemplates}
    <section class="tpl" aria-label="Moldes de espécie">
      <div class="tpl-head">
        <div class="t-seg tabs" role="tablist" aria-label="Tipos de molde">
          {#each SPECIES_TEMPLATE_GROUPS as g (g.id)}
            <button role="tab" aria-selected={tplGroup === g.id} class:on={tplGroup === g.id} onclick={() => (tplGroup = g.id)}>{g.label}</button>
          {/each}
        </div>
        <small class="dim">O molde troca a aparência inteira. Dá para desfazer.</small>
      </div>
      {#if templates.length}
        <div class="tpl-grid">
          {#each templates as t (t.id)}
            <button class="tpl-card" onclick={() => useTemplate(t)} title={t.desc}>
              <span class="tpl-pic"><EspecieFigura fig={tplFig(t)} size={78} label={t.nome} /></span>
              <b>{t.nome}</b>
              <small>{t.desc}</small>
            </button>
          {/each}
        </div>
      {:else}
        <p class="dim empty">Nenhum molde deste tipo com o filtro atual.</p>
      {/if}
    </section>
  {/if}

  <div class="grid">
    <aside class="side">
      <figure class="figwrap">
        <div class="t-seg mode" role="tablist" aria-label="Como ver a espécie">
          <button role="tab" aria-selected={view === 'retrato'} class:on={view === 'retrato'} onclick={() => (view = 'retrato')}>Retrato</button>
          <button role="tab" aria-selected={view === 'escala'} class:on={view === 'escala'} onclick={() => (view = 'escala')}>Escala</button>
        </div>
        <div class="stage">
          <EspecieFigura {fig} compare={view === 'escala'} size={230} label={`Retrato de ${entity.name}`} />
        </div>
        {#if view === 'escala'}
          <figcaption class="dim">{fig.altura < 0.3 ? 'ao lado de uma maçã de 8 cm' : 'ao lado de um humano de 1,75 m'}</figcaption>
        {/if}
      </figure>
      {#if notes.length}
        <ul class="notes" aria-label="Observações sobre a biologia">
          {#each notes as n, i (i)}
            <li class={n.tipo}><b>{n.tipo === 'aviso' ? 'Não fecha' : 'Ideia'}</b> {n.texto}</li>
          {/each}
        </ul>
      {/if}
    </aside>

    <div class="fields">
      <div class="tools">
        <input class="t-input find" type="search" bind:value={query} placeholder="Buscar característica: garras, veneno, telepatia..." aria-label="Buscar característica" />
        <div class="t-seg" role="radiogroup" aria-label="Tipo de característica">
          <button role="radio" aria-checked={realm === 'tudo'} class:on={realm === 'tudo'} onclick={() => (realm = 'tudo')}>Tudo</button>
          <button role="radio" aria-checked={realm === 'real'} class:on={realm === 'real'} onclick={() => (realm = 'real')} title="Só o que existe na natureza">Reais</button>
          <button role="radio" aria-checked={realm === 'fantasia'} class:on={realm === 'fantasia'} onclick={() => (realm = 'fantasia')} title="Só o que é inventado">Fantásticas</button>
        </div>
      </div>

      {#if !q}
        <div class="t-seg groups" role="tablist" aria-label="Partes do construtor">
          {#each SPECIES_GROUPS as g (g.id)}
            {@const n = SPECIES_FIELDS.filter((f) => f.group === g.id)}
            {@const done = n.filter((f) => val(f.key).trim()).length}
            <button role="tab" aria-selected={group === g.id} class:on={group === g.id} onclick={() => (group = g.id)} title={g.desc}>
              {g.label}<small class:full={done === n.length}>{done}/{n.length}</small>
            </button>
          {/each}
        </div>
      {/if}

      {#each fields as f (f.key)}
        <div class="fld">
          <span class="lbl">{f.key === 'altura' ? sizeLabel : f.label}{#if f.multi}<small> · vários</small>{/if}</span>
          {#if f.sections}
            {@const secs = sectionsOf(f)}
            {#each secs as s (s.label)}
              <div class="opts">
                {#if secs.length > 1}<span class="sec" class:magic={s.tipo === 'fantasia'}>{s.label}</span>{/if}
                {#each s.options as o (o)}
                  <button class="t-chip" class:on={on(f.key, o)} aria-pressed={on(f.key, o)} onclick={() => choose(f.key, o, !!f.multi)}>{o}</button>
                {/each}
              </div>
            {/each}
            <div class="opts">
              {#each extras(f) as x (x)}
                <button class="t-chip on" aria-pressed="true" onclick={() => choose(f.key, x, !!f.multi)} title="Clique para tirar">{x}</button>
              {/each}
              {#if adding === f.key}
                <!-- svelte-ignore a11y_autofocus -->
                <input class="t-input add" autofocus placeholder="Escreva e tecle Enter" aria-label={`Outro valor para ${f.label}`}
                  onkeydown={(e) => { if (e.key === 'Enter') addCustom(f, e.currentTarget.value); if (e.key === 'Escape') adding = null; }}
                  onblur={(e) => addCustom(f, e.currentTarget.value)} />
              {:else}
                <button class="t-chip more" onclick={() => (adding = f.key)}>+ outro</button>
              {/if}
            </div>
          {:else if f.key === 'cor'}
            <div class="colors">
              <div class="slots" role="radiogroup" aria-label="Qual cor escolher">
                {#each SLOTS as s, i (s)}
                  <button role="radio" aria-checked={slot === i} class="t-chip" class:on={slot === i} onclick={() => (slot = i)}>
                    <i style:background={hexOf(colorParts[i]) ?? 'transparent'}></i>{s}
                  </button>
                {/each}
              </div>
              <div class="swatches">
                {#each palette as [name, hex] (name)}
                  <button class="sw" class:cur={fold(colorParts[slot] ?? '') === fold(name)} style:background={hex} title={name} aria-label={name} onclick={() => setColor(name)}></button>
                {/each}
              </div>
              <input class="t-input" value={val('cor')} placeholder={f.hint ?? ''} onchange={(e) => put('cor', e.currentTarget.value.trim())} aria-label="Cores por escrito" />
            </div>
          {:else}
            <input class="t-input" value={val(f.key)} placeholder={f.hint ?? ''} list={f.key === 'habitat' ? 'esp-habitats' : undefined}
              onchange={(e) => put(f.key, e.currentTarget.value.trim())} aria-label={f.label} />
            {#if f.key === 'altura'}
              <div class="opts">
                {#each SPECIES_SIZES as m (m.label)}
                  <button class="t-chip" class:on={val('altura') === m.altura} onclick={() => put('altura', m.altura)} title={`${m.altura} m`}>{m.label}</button>
                {/each}
              </div>
            {:else if f.key === 'peso' && String(weightGuess) !== val('peso')}
              <div class="opts">
                <button class="t-chip" onclick={() => put('peso', String(weightGuess))} title="Estimativa pelo tamanho e pelo corpo">Usar ≈ {weightGuess.toLocaleString('pt-BR')} kg</button>
              </div>
            {/if}
          {/if}
        </div>
      {:else}
        <p class="dim empty">Nada encontrado. Use "+ outro" em qualquer campo para escrever o que quiser.</p>
      {/each}
      <datalist id="esp-habitats">
        {#each places as p (p)}<option value={`[[${p}]]`}></option>{/each}
        {#each BIOMAS.filter((b) => !b.agua || b.id === 'mar' || b.id === 'recife' || b.id === 'lago') as b (b.id)}<option value={b.label.toLowerCase()}></option>{/each}
      </datalist>
    </div>
  </div>
</div>

<style>
  .esp { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-3); min-width: 0; }
  header { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .grow { flex: 1; }
  .pct { width: 70px; height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .pct i { display: block; height: 100%; background: var(--ember); }
  .dim { color: var(--muted); }
  .empty { margin: 0; padding: var(--sp-3) 0; font-size: var(--fs-sm); }

  /* moldes */
  .tpl { display: grid; gap: var(--sp-2); padding: var(--sp-3); border-radius: var(--r-md); background: var(--surface-2); min-width: 0; }
  .tpl-head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .tpl-head small { font-size: var(--fs-xs); }
  .tabs { flex-wrap: wrap; max-width: 100%; }
  .tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(128px, 100%), 1fr)); gap: var(--sp-2); max-height: 380px; overflow-y: auto; }
  .tpl-card { display: grid; gap: 2px; justify-items: center; align-content: start; padding: var(--sp-2); text-align: center; color: var(--ink); cursor: pointer;
    border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease); min-width: 0; }
  .tpl-card:hover { border-color: var(--ember); transform: translateY(-1px); }
  .tpl-pic { display: grid; place-items: center; height: 84px; width: 100%; overflow: hidden; }
  .tpl-card b { font: 600 var(--fs-sm) var(--f-display); }
  .tpl-card small { font-size: var(--fs-xs); line-height: 1.25; color: var(--muted); }

  /* corpo da tela */
  .grid { display: grid; grid-template-columns: minmax(0, 290px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  .side { display: grid; gap: var(--sp-2); position: sticky; top: var(--sp-2); min-width: 0; }
  .figwrap { margin: 0; display: grid; justify-items: center; gap: var(--sp-2); padding: var(--sp-2); border-radius: var(--r-md); min-width: 0;
    background: radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--ink) 9%, var(--surface-2)), var(--surface-2) 72%); }
  .mode { justify-self: end; }
  .mode > button { min-height: 24px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
  .stage { display: grid; place-items: center; width: 100%; min-height: 236px; overflow: hidden; }
  figcaption { font-size: var(--fs-xs); }

  .notes { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .notes li { font-size: var(--fs-xs); line-height: 1.4; padding: 6px var(--sp-2); border-radius: var(--r-sm); border-left: 3px solid var(--line); background: var(--surface-2); color: var(--silver); }
  .notes li b { display: block; font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .notes li.aviso { border-left-color: var(--crit); }
  .notes li.aviso b { color: var(--crit); }
  .notes li.ideia { border-left-color: var(--ember); }
  .notes li.ideia b { color: var(--ember-soft); }

  .fields { display: grid; gap: var(--sp-3); min-width: 0; }
  .tools { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
  .find { flex: 1 1 200px; min-width: 0; width: auto; }
  .tools .t-seg > button { padding: 0 var(--sp-2); font-size: var(--fs-sm); }
  .groups { flex-wrap: wrap; max-width: 100%; }
  .groups small { font: 10px var(--f-mono); color: var(--muted); margin-left: 4px; }
  .groups small.full { color: var(--ok); }
  .fld { display: grid; gap: 5px; min-width: 0; }
  .lbl { font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .lbl small { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .opts { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-width: 0; }
  .opts:empty { display: none; }
  .opts .t-chip { min-height: 26px; padding: 2px 10px; font-size: 12.5px; flex: 0 1 auto; max-width: 100%; }
  .sec { font: 500 10.5px var(--f-body); color: var(--muted); margin-right: 2px; }
  .sec.magic { color: var(--ember-soft); }
  .more { border-style: dashed; color: var(--muted); }
  .add { width: 190px; max-width: 100%; min-height: 26px; height: 26px; font-size: 12.5px; }

  .colors { display: grid; gap: var(--sp-2); min-width: 0; }
  .slots { display: flex; gap: 4px; flex-wrap: wrap; }
  .slots .t-chip { min-height: 26px; padding: 2px 10px; font-size: 12.5px; }
  .slots .t-chip > i { width: 12px; height: 12px; box-shadow: inset 0 0 0 1px var(--line); }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, 24px); gap: 5px; }
  .sw { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--ink) 22%, transparent); cursor: pointer; transition: transform var(--dur) var(--ease); }
  .sw:hover { transform: scale(1.14); }
  .sw.cur { outline: 2px solid var(--ember); outline-offset: 2px; }

  @media (max-width: 760px) {
    .grid { grid-template-columns: minmax(0, 1fr); }
    .side { position: static; }
  }
  @media (pointer: coarse) {
    .swatches { grid-template-columns: repeat(auto-fill, 32px); }
    .sw { width: 32px; height: 32px; }
  }
</style>
