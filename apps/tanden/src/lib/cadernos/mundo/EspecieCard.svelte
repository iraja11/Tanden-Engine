<script lang="ts">
  import {
    BIOMAS, SPECIES_FIELDS, SPECIES_GROUPS, rollSpecies, setProp, setProps, setSection, speciesBlurb, speciesFigure, speciesFilled, speciesValue,
    type Entity, type PropValue, type World,
  } from '@tanden/core';
  import { sound } from '../../sound.svelte';
  import { cadernos } from '../cadernos.svelte';
  import EspecieFigura from './EspecieFigura.svelte';

  // Construtor de espécies dentro da ficha: corpo, ciclo de vida, sentidos,
  // mente e ambiente em botões, a silhueta ao lado (com um humano para escala)
  // e um dado que sorteia só o que falta, coerente com o que já foi decidido.
  let { entity, fm, world }: { entity: Entity; fm: Record<string, PropValue>; world: World } = $props();

  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const keyOf = (k: string) => Object.keys(fm).find((x) => fold(x) === fold(k)) ?? k;
  const val = (k: string) => speciesValue(fm, k);
  const fig = $derived(speciesFigure(fm));
  const filled = $derived(speciesFilled(fm));
  let group = $state<(typeof SPECIES_GROUPS)[number]['id']>('corpo');
  const fields = $derived(SPECIES_FIELDS.filter((f) => f.group === group));
  const places = $derived(world.entities.filter((e) => e.type === 'lugar').map((e) => e.name));

  function put(k: string, v: PropValue | null) {
    cadernos.update(entity.path, (t) => setProp(t, keyOf(k), v));
  }
  function choose(k: string, opt: string, multi: boolean) {
    const cur = val(k).split(',').map((x) => x.trim()).filter(Boolean);
    if (!multi) {
      put(k, cur.length === 1 && fold(cur[0]!) === fold(opt) ? '' : opt);
      return;
    }
    const has = cur.some((c) => fold(c) === fold(opt));
    const next = has ? cur.filter((c) => fold(c) !== fold(opt)) : [...cur, opt];
    put(k, next.join(', '));
  }
  const on = (k: string, opt: string) => val(k).split(',').some((x) => fold(x) === fold(opt));

  function roll() {
    const have: Record<string, string> = {};
    for (const f of SPECIES_FIELDS) have[f.key] = val(f.key);
    const out = rollSpecies(Math.random, have, { sapiente: entity.type === 'especie' ? undefined : false });
    const patch: Record<string, string> = {};
    for (const [k, v] of Object.entries(out)) if (!val(k).trim()) patch[keyOf(k)] = v;
    if (!Object.keys(patch).length) {
      cadernos.say('Tudo já está decidido. Apague um campo para sortear de novo.');
      return;
    }
    cadernos.update(entity.path, (t) => setProps(t, patch));
    sound.play('tick');
    cadernos.say(`Sorteado: ${Object.keys(patch).length} campos.`);
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
</script>

<div class="esp t-card">
  <header>
    <h3 class="t-eyebrow">Construtor de {entity.type === 'criatura' ? 'criatura' : 'espécie'}</h3>
    <span class="pct" title="Campos do construtor preenchidos"><i style:width="{Math.round(filled * 100)}%"></i></span>
    <small class="dim">{Math.round(filled * 100)}%</small>
    <span class="grow"></span>
    <button class="t-btn t-btn--sm" onclick={roll} title="Sorteia só os campos vazios, coerente com o que já existe">🎲 Sortear o que falta</button>
    <button class="t-btn t-btn--sm" onclick={writeBiology} title="Escreve um parágrafo na seção Biologia a partir dos campos">✎ Escrever biologia</button>
  </header>
  <div class="grid">
    <figure class="figwrap">
      <EspecieFigura {fig} compare size={170} label={`Silhueta de ${entity.name}`} />
      <figcaption class="dim">ao lado de um humano de 1,75 m</figcaption>
    </figure>
    <div class="fields">
      <div class="t-seg groups" role="tablist" aria-label="Partes do construtor">
        {#each SPECIES_GROUPS as g (g.id)}
          {@const n = SPECIES_FIELDS.filter((f) => f.group === g.id)}
          {@const done = n.filter((f) => val(f.key).trim()).length}
          <button role="tab" aria-selected={group === g.id} class:on={group === g.id} onclick={() => (group = g.id)} title={g.desc}>
            {g.label}<small class:full={done === n.length}>{done}/{n.length}</small>
          </button>
        {/each}
      </div>
      {#each fields as f (f.key)}
        <div class="fld">
          <span class="lbl">{f.label}{#if f.multi}<small> · vários</small>{/if}</span>
          {#if f.options}
            <div class="opts">
              {#each f.options as o (o)}
                <button class="t-chip" class:on={on(f.key, o)} onclick={() => choose(f.key, o, !!f.multi)}>{o}</button>
              {/each}
            </div>
          {:else}
            <input class="t-input" value={val(f.key)} placeholder={f.hint ?? ''} list={f.key === 'habitat' ? 'esp-habitats' : undefined}
              onchange={(e) => put(f.key, (e.currentTarget as HTMLInputElement).value.trim())} aria-label={f.label} />
          {/if}
        </div>
      {/each}
      <datalist id="esp-habitats">
        {#each places as p (p)}<option value={`[[${p}]]`}></option>{/each}
        {#each BIOMAS.filter((b) => !b.agua || b.id === 'mar' || b.id === 'recife' || b.id === 'lago') as b (b.id)}<option value={b.label.toLowerCase()}></option>{/each}
      </datalist>
    </div>
  </div>
</div>

<style>
  .esp { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-3); }
  header { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .grow { flex: 1; }
  .pct { width: 70px; height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .pct i { display: block; height: 100%; background: var(--ember); }
  .grid { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  .figwrap { margin: 0; display: grid; justify-items: center; gap: 4px; padding: var(--sp-2); border-radius: var(--r-md); background: var(--surface-2); min-width: 150px; }
  figcaption { font-size: 11px; }
  .fields { display: grid; gap: var(--sp-2); min-width: 0; }
  .groups { flex-wrap: wrap; max-width: 100%; }
  .groups small { font: 10px var(--f-mono); color: var(--muted); margin-left: 4px; }
  .groups small.full { color: var(--ok); }
  .fld { display: grid; gap: 4px; }
  .lbl { font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .lbl small { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .opts { display: flex; flex-wrap: wrap; gap: 4px; }
  .opts .t-chip { min-height: 26px; padding: 2px 10px; font-size: 12.5px; }
  .dim { color: var(--muted); }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>
