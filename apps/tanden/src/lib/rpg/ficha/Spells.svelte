<script lang="ts">
  import { ATTRS, readSpells, signed, slotFor, useSlot, writeSpells, type Spell } from '@tanden/core';
  import type { FichaCtx } from './ctx';

  // Conjuração: atributo, CD, ataque, espaços por círculo e a lista de magias.
  let { x }: { x: FichaCtx } = $props();

  const c = $derived(x.c);
  const spells = $derived(readSpells(x.text));
  const levels = $derived([...new Set(spells.map((s) => s.level))].sort((a, b) => a - b));
  const ordinal = (n: number) => (n === 0 ? 'Truques' : `${n}º círculo`);
  let filter = $state<'todas' | 'preparadas'>('todas');
  let msg = $state('');

  const blank = (): Spell => ({ level: 1, name: '', time: '1 ação', range: '', concentration: false, ritual: false, material: false, prepared: true, notes: '' });
  let draft = $state<Spell>(blank());
  let adding = $state(false);
  let editing = $state<number | null>(null);

  function save(next: Spell[]) {
    x.update((t) => writeSpells(t, next));
  }
  function commit() {
    const n = draft.name.trim();
    if (!n) { adding = false; editing = null; return; }
    const sp = { ...draft, name: n, level: Math.max(0, Math.min(9, Math.round(Number(draft.level) || 0))) };
    save(editing !== null ? spells.map((v, i) => (i === editing ? sp : v)) : [...spells, sp]);
    adding = false;
    editing = null;
  }
  function remove(i: number) {
    save(spells.filter((_, j) => j !== i));
    editing = null;
  }
  function togglePrep(i: number) {
    save(spells.map((v, j) => (j === i ? { ...v, prepared: !v.prepared } : v)));
  }

  function cast(sp: Spell) {
    if (sp.level === 0) { flash(`${sp.name}: truque, não gasta espaço`); return; }
    const w = slotFor(c, sp.level);
    if (!w) { flash(`Sem espaços livres de ${sp.level}º círculo ou maior`); return; }
    x.update((t) => useSlot(t, w));
    flash(`${sp.name}: gastou um espaço de ${w.level}º círculo${w.kind === 'pact' ? ' (pacto)' : ''}${w.level > sp.level ? ' (conjurada num círculo maior)' : ''}`);
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  function flash(m: string) {
    msg = m;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (msg = ''), 3500);
  }

  function setAbility(v: string) {
    x.write({ [c.keys.spellAbility]: v || null });
  }
  /** clicar no losango n: marca até ele, ou desmarca se já era o último marcado */
  function pick(kind: 'slot' | 'pact', level: number, n: number, spent: number) {
    const target = spent === n ? n - 1 : n;
    x.update((t) => useSlot(t, { kind, level }, target - spent));
  }
  const auto = $derived(c.classes.find((v) => v.ability)?.ability ?? null);
</script>

<div class="sp">
  <div class="cast">
    <div class="ability">
      <span class="lbl">Atributo de conjuração</span>
      <select class="field" value={ATTRS.find((a) => a.key === c.casting?.ability && c.casting?.ability !== auto)?.key ?? ''} onchange={(e) => setAbility((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">{auto ? `${ATTRS.find((a) => a.key === auto)?.label} (pela classe)` : 'Nenhum'}</option>
        {#each ATTRS as a (a.key)}<option value={a.key}>{a.label}</option>{/each}
      </select>
    </div>
    <div class="trio">
      <div class="k"><b>{c.casting ? signed(c.casting.mod) : '—'}</b><span>Modificador</span></div>
      <div class="k"><b>{c.casting?.dc ?? '—'}</b><span>CD de resistência</span></div>
      <button class="k roll-btn" disabled={!c.casting} onclick={() => x.rollD20(c.casting!.attack, 'Ataque mágico')}><b>{c.casting ? signed(c.casting.attack) : '—'}</b><span>Ataque mágico</span></button>
    </div>
  </div>

  {#if c.slots.length || c.pact}
    <div class="slots">
      <h4>Espaços de magia</h4>
      <div class="sgrid">
        {#each c.slots as s (s.level)}
          <div class="slot">
            <span class="sl">{s.level}º</span>
            <span class="dias">
              {#each Array.from({ length: s.total }, (_, i) => i + 1) as n (n)}
                <button class="dia" class:on={n <= s.spent} onclick={() => pick('slot', s.level, n, s.spent)} aria-label={`Espaço ${n} de ${s.level}º círculo${n <= s.spent ? ' (gasto)' : ''}`}></button>
              {/each}
            </span>
            <small class="dim">{s.total - s.spent}/{s.total}</small>
          </div>
        {/each}
        {#if c.pact}
          <div class="slot pact">
            <span class="sl" title="Magia de pacto: volta no descanso curto">Pacto {c.pact.level}º</span>
            <span class="dias">
              {#each Array.from({ length: c.pact.total }, (_, i) => i + 1) as n (n)}
                <button class="dia" class:on={n <= c.pact.spent} onclick={() => pick('pact', c.pact!.level, n, c.pact!.spent)} aria-label={`Espaço de pacto ${n}`}></button>
              {/each}
            </span>
            <small class="dim">{c.pact.total - c.pact.spent}/{c.pact.total}</small>
          </div>
        {/if}
      </div>
      <p class="dim small hint">Calculados pela classe e nível (multiclasse inclusa). Losango cheio = gasto. O descanso longo devolve tudo.</p>
    </div>
  {:else if c.casting}
    <p class="dim small">Sem espaços de magia neste nível.</p>
  {/if}

  <div class="listhead">
    <h4>Truques e magias preparadas</h4>
    <span class="seg" role="radiogroup" aria-label="Filtro">
      <button role="radio" aria-checked={filter === 'todas'} class:on={filter === 'todas'} onclick={() => (filter = 'todas')}>Todas</button>
      <button role="radio" aria-checked={filter === 'preparadas'} class:on={filter === 'preparadas'} onclick={() => (filter = 'preparadas')}>Preparadas</button>
    </span>
  </div>
  {#if msg}<p class="toast" role="status">{msg}</p>{/if}

  {#each levels as lv (lv)}
    {@const list = spells.map((s, i) => ({ s, i })).filter(({ s }) => s.level === lv && (filter === 'todas' || s.prepared))}
    {#if list.length}
      <section class="lv">
        <h5>{ordinal(lv)}</h5>
        {#each list as { s, i } (i)}
          {#if editing === i}
            {@render form()}
          {:else}
            <div class="spell" class:unprep={!s.prepared}>
              {#if s.level > 0}
                <button class="pip" class:on={s.prepared} onclick={() => togglePrep(i)} aria-label={s.prepared ? 'Preparada' : 'Não preparada'} title={s.prepared ? 'Preparada (clique para tirar)' : 'Preparar'}></button>
              {:else}<span class="pip fixed" title="Truque: sempre pronto"></span>{/if}
              <button class="sname" onclick={() => { adding = false; editing = i; draft = { ...s }; }} title="Editar">{s.name}</button>
              <span class="meta">
                {#if s.time}<span>{s.time}</span>{/if}
                {#if s.range}<span>{s.range}</span>{/if}
              </span>
              <span class="crm">
                <i class:on={s.concentration} title="Concentração">C</i><i class:on={s.ritual} title="Ritual">R</i><i class:on={s.material} title="Componente material">M</i>
              </span>
              <button class="ghost sm castb" onclick={() => cast(s)} title={s.level ? 'Conjurar (gasta o menor espaço livre)' : 'Truque'}>Conjurar</button>
              {#if s.notes}<span class="snotes dim">{s.notes}</span>{/if}
            </div>
          {/if}
        {/each}
      </section>
    {/if}
  {/each}
  {#if !spells.length && !adding}<p class="dim small">Nenhuma magia ainda. Elas ficam na tabela <code>## Magias</code> da nota.</p>{/if}
  {#if adding}{@render form()}{/if}
  {#if !adding && editing === null}<button class="ghost sm addsp" onclick={() => { adding = true; draft = blank(); }}>+ Magia</button>{/if}
</div>

{#snippet form()}
  <form class="sform" onsubmit={(e) => { e.preventDefault(); commit(); }}>
    <label class="lvl">Círculo
      <select class="field" bind:value={draft.level}>{#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as n (n)}<option value={n}>{n === 0 ? 'Truque' : `${n}º`}</option>{/each}</select>
    </label>
    <!-- svelte-ignore a11y_autofocus -->
    <label class="nm">Nome<input class="field" bind:value={draft.name} placeholder="Mísseis Mágicos" autofocus /></label>
    <label>Tempo<input class="field" bind:value={draft.time} placeholder="1 ação" /></label>
    <label>Alcance<input class="field" bind:value={draft.range} placeholder="36 m" /></label>
    <div class="flags">
      <button type="button" class="chip" class:on={draft.concentration} onclick={() => (draft.concentration = !draft.concentration)}>Concentração</button>
      <button type="button" class="chip" class:on={draft.ritual} onclick={() => (draft.ritual = !draft.ritual)}>Ritual</button>
      <button type="button" class="chip" class:on={draft.material} onclick={() => (draft.material = !draft.material)}>Material</button>
    </div>
    <label class="full">Notas<input class="field" bind:value={draft.notes} placeholder="3 dardos, 1d4+1 de energia cada" /></label>
    <div class="fa">
      {#if editing !== null}<button type="button" class="icon danger" onclick={() => remove(editing!)} aria-label="Apagar magia" title="Apagar">✕</button>{/if}
      <button type="button" class="ghost sm" onclick={() => { adding = false; editing = null; }}>Cancelar</button>
      <button class="primary sm">Salvar</button>
    </div>
  </form>
{/snippet}

<style>
  .sp { display: grid; gap: 14px; }
  .addsp { justify-self: start; }
  .lbl { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h4 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h5 { margin: 4px 0 2px; font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--ember-soft); }
  .cast { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 10px; align-items: stretch; }
  .ability { display: grid; gap: 6px; align-content: center; border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: var(--surface); }
  .trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .k { display: grid; justify-items: center; align-content: center; gap: 3px; border: 1px solid var(--line); border-radius: 14px; padding: 8px 4px; background: var(--surface); text-align: center; }
  .k b { font: 700 22px/1 var(--f-display); font-variant-numeric: tabular-nums; }
  .k span { font: 600 8.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .slots { border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: var(--surface); display: grid; gap: 8px; }
  .sgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 6px 16px; }
  .slot { display: flex; align-items: center; gap: 8px; }
  .sl { font: 600 12px var(--f-mono); min-width: 26px; color: var(--silver); }
  .pact .sl { min-width: 0; color: var(--ember-soft); }
  .dias { display: flex; gap: 4px; flex: 1; }
  .dia { width: 13px; height: 13px; transform: rotate(45deg); border: 1.5px solid var(--muted); background: none; padding: 0; border-radius: 2px;
    transition: background var(--dur), border-color var(--dur); }
  .dia:hover { border-color: var(--ember); }
  .dia.on { background: var(--ember); border-color: var(--ember); }
  .hint { margin: 0; }
  .listhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); }
  .seg button { border: 0; background: none; border-radius: 7px; padding: 2px 9px; font-size: 12px; color: var(--muted); }
  .seg button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }
  .toast { margin: 0; padding: 6px 10px; border-radius: 9px; font-size: 12.5px; background: color-mix(in srgb, var(--ember) 12%, transparent); border: 1px solid color-mix(in srgb, var(--ember) 35%, transparent); }
  .lv { display: grid; gap: 2px; }
  .spell { display: grid; grid-template-columns: 14px minmax(0, 1.4fr) minmax(0, 1fr) auto auto; gap: 4px 10px; align-items: center; padding: 5px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  .spell.unprep .sname { color: var(--muted); }
  .pip { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--muted); background: none; padding: 0; }
  .pip.on, .pip.fixed { background: var(--ember); border-color: var(--ember); }
  .pip.fixed { opacity: .5; }
  .sname { border: 0; background: none; padding: 0; text-align: left; font-weight: 600; font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sname:hover { color: var(--ember-soft); }
  .meta { display: flex; gap: 8px; font-size: 12px; color: var(--silver); min-width: 0; overflow: hidden; white-space: nowrap; }
  .meta span + span::before { content: '·'; margin-right: 8px; color: var(--muted); }
  .crm { display: inline-flex; gap: 3px; }
  .crm i { font: 600 10px var(--f-mono); font-style: normal; width: 17px; height: 17px; display: grid; place-items: center; border-radius: 5px;
    border: 1px solid var(--line); color: var(--muted); opacity: .45; }
  .crm i.on { opacity: 1; color: var(--ember-soft); border-color: color-mix(in srgb, var(--ember) 45%, var(--line)); }
  .castb { padding: 3px 9px !important; }
  .snotes { grid-column: 2 / -1; font-size: 12px; }
  .sform { display: grid; grid-template-columns: 90px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px; padding: 10px; border: 1px solid var(--ember);
    border-radius: 12px; background: var(--surface); }
  .sform label { display: grid; gap: 3px; font: 600 9.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); min-width: 0; }
  .sform .field { padding: 5px 8px; font-size: 13px; }
  .flags { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
  .full, .fa { grid-column: 1 / -1; }
  .fa { display: flex; justify-content: flex-end; gap: 6px; align-items: center; }
  @media (max-width: 720px) {
    .spell { grid-template-columns: 14px minmax(0, 1fr) auto; }
    .meta { grid-column: 2 / -1; grid-row: 2; }
    .crm { display: none; }
    .sform { grid-template-columns: 80px minmax(0, 1fr); }
  }
</style>
