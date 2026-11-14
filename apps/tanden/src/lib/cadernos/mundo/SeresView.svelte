<script lang="ts">
  import {
    NAME_STYLES, foodWeb, rollSpecies, seededRng, speciesBlurb, speciesFigure, speciesFilled, speciesTable, speciesValue, styledName,
    type Entity, type SpeciesFigure, type SpeciesRow, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { typeColor } from '../tipos';
  import EspecieFigura from './EspecieFigura.svelte';

  // Seres: as espécies e criaturas do mundo como galeria (silhuetas), em
  // escala lado a lado, numa tabela para comparar e numa teia de quem come quem.
  let { world, onopen, oncreate }: {
    world: World;
    onopen: (path: string) => void;
    oncreate: (name: string, type: string, extra: { props: Record<string, string>; sections: string[] }) => void;
  } = $props();

  let types = $state<string[]>(['especie', 'criatura']);
  const beings = $derived(world.entities.filter((e) => types.includes(e.type)));
  let look = $state<'galeria' | 'escala' | 'tabela' | 'teia'>('galeria');

  // ------------------------------------------------ sortear uma espécie nova
  let seed = $state(Math.floor(Math.random() * 1e6));
  let sapiente = $state(true);
  const draft = $derived.by(() => {
    const rng = seededRng(seed);
    const props = rollSpecies(rng, {}, { sapiente });
    const st = NAME_STYLES[Math.floor(rng() * NAME_STYLES.length)]!;
    return { name: styledName(st, rng), props };
  });
  const draftFig = $derived(speciesFigure(draft.props));
  function keep() {
    oncreate(draft.name, sapiente ? 'especie' : 'criatura', { props: { ...draft.props, 'inteligência': draft.props['inteligência'] ?? (sapiente ? 'sapiente' : 'animal') }, sections: ['Biologia'] });
  }

  // ------------------------------------------------ escala
  const HUMAN: SpeciesFigure = { ...speciesFigure({ corpo: 'bípede', altura: '1,75', cor: 'cinza' }), cor: '#9a9ca3', cor2: '#6a6c72' };
  const figs = $derived(beings.map((e) => ({ e, fig: speciesFigure(e.props) })).sort((a, b) => a.fig.altura - b.fig.altura));
  const tallest = $derived(Math.max(1.75, ...figs.map((f) => f.fig.altura)));
  const scaleH = 220;

  // ------------------------------------------------ tabela
  let sortKey = $state<keyof SpeciesRow>('altura');
  let asc = $state(false);
  const rows = $derived.by(() => {
    const r = speciesTable(world, types);
    const k = sortKey;
    return [...r].sort((a, b) => {
      const x = a[k], y = b[k];
      const c = typeof x === 'number' || typeof y === 'number' ? ((x as number | null) ?? -1) - ((y as number | null) ?? -1) : String(k === 'entity' ? a.entity.name : x ?? '').localeCompare(String(k === 'entity' ? b.entity.name : y ?? ''), 'pt-BR');
      return asc ? c : -c;
    });
  });
  const sortBy = (k: keyof SpeciesRow) => { if (sortKey === k) asc = !asc; else { sortKey = k; asc = k === 'entity'; } };
  const num = (n: number | null, unit = '') => (n === null ? '—' : `${n.toLocaleString('pt-BR')}${unit}`);
  const maxOf = (k: 'altura' | 'peso' | 'vida') => Math.max(1, ...rows.map((r) => r[k] ?? 0));

  // ------------------------------------------------ teia
  const web = $derived(foodWeb(world));
  const webNodes = $derived(web.nodes.filter((n) => types.includes(n.entity.type) && web.edges.some((e) => e.eater === n.entity.path || e.eaten === n.entity.path)));
  const levels = $derived(Math.max(1, ...webNodes.map((n) => n.level)));
  const W = 640;
  const ROW = 92;
  const pos = $derived.by(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (let l = 1; l <= levels; l++) {
      const at = webNodes.filter((n) => n.level === l);
      at.forEach((n, i) => m.set(n.entity.path, { x: ((i + 1) / (at.length + 1)) * W, y: 40 + (levels - l) * ROW }));
    }
    return m;
  });
  const LEVEL_NAME = ['', 'Base', 'Consumidores', 'Predadores', 'Superpredadores', 'Topo'];

  const blurb = (e: Entity) => speciesBlurb(e.name, e.props).split('. ')[0] ?? '';
</script>

<div class="seres">
  <div class="bar">
    <div class="t-seg" role="radiogroup" aria-label="Visão">
      {#each [['galeria', 'Galeria'], ['escala', 'Escala'], ['tabela', 'Comparar'], ['teia', 'Teia alimentar']] as [id, l] (id)}
        <button role="radio" aria-checked={look === id} class:on={look === id} onclick={() => (look = id as typeof look)}>{l}</button>
      {/each}
    </div>
    <span class="grow"></span>
    {#each [['especie', 'Espécies e povos'], ['criatura', 'Criaturas']] as [t, l] (t)}
      <button class="t-chip" class:on={types.includes(t!)} style:--c={typeColor(t!)} onclick={() => (types = types.includes(t!) ? types.filter((x) => x !== t) : [...types, t!])}><i></i>{l}<small>{world.entities.filter((e) => e.type === t).length}</small></button>
    {/each}
  </div>

  <section class="forge t-card">
    <div class="fdraw"><EspecieFigura fig={draftFig} compare size={130} label="Espécie sorteada" /></div>
    <div class="ftext">
      <small class="t-eyebrow">Forja de espécies</small>
      <b>{draft.name}</b>
      <p>{speciesBlurb(draft.name, draft.props)}</p>
      <div class="facts">
        {#each ['dieta', 'reprodução', 'expectativa de vida', 'sentidos', 'sociedade', 'habitat'] as k (k)}
          {#if draft.props[k]}<span><small>{k}</small>{draft.props[k]}{k === 'expectativa de vida' ? ' anos' : ''}</span>{/if}
        {/each}
      </div>
      <div class="fbtn">
        <div class="t-seg">
          <button class:on={sapiente} onclick={() => (sapiente = true)}>Povo</button>
          <button class:on={!sapiente} onclick={() => (sapiente = false)}>Fera</button>
        </div>
        <button class="t-btn" onclick={() => (seed += 1)}>🎲 Outra</button>
        <button class="t-btn t-btn--primary" onclick={keep}>Criar ficha</button>
      </div>
    </div>
  </section>

  {#if !beings.length}
    <p class="dim pad">Nenhum ser ainda. Use a forja acima, ou crie uma ficha de espécie ou criatura: a ficha traz um construtor com corpo, ciclo de vida, sentidos, mente e ambiente.</p>
  {:else if look === 'galeria'}
    <div class="gal">
      {#each beings as e, i (e.path)}
        {@const f = speciesFigure(e.props)}
        <button class="g" style:--c={typeColor(e.type)} onclick={() => onopen(e.path)} in:rise={{ delay: Math.min(i, 20) * 25, y: 8 }}>
          <span class="pic"><EspecieFigura fig={f} size={110} label={e.name} /></span>
          <b>{e.name}</b>
          <small>{[speciesValue(e.props, 'corpo'), speciesValue(e.props, 'dieta'), speciesValue(e.props, 'habitat').replace(/\[\[|\]\]/g, '')].filter(Boolean).join(' · ') || blurb(e) || 'Ainda sem biologia'}</small>
          <span class="fill"><i style:width="{speciesFilled(e.props) * 100}%"></i></span>
        </button>
      {/each}
    </div>
  {:else if look === 'escala'}
    <div class="lineup t-scroll-x">
      <figure class="ln human">
        <EspecieFigura fig={HUMAN} size={Math.max(14, scaleH * (1.75 / tallest))} label="Humano" />
        <figcaption>Humano</figcaption>
      </figure>
      {#each figs as { e, fig } (e.path)}
        <figure class="ln">
          <button onclick={() => onopen(e.path)} title={e.name}><EspecieFigura {fig} size={Math.max(14, scaleH * (fig.altura / tallest))} label={e.name} /></button>
          <figcaption>{e.name}</figcaption>
        </figure>
      {/each}
    </div>
    <p class="dim small">Todos na mesma escala, do menor ao maior. A altura vem do campo <code>altura</code> (em metros).</p>
  {:else if look === 'tabela'}
    <div class="tbl t-scroll-x">
      <table>
        <thead>
          <tr>
            {#each [['entity', 'Ser'], ['altura', 'Altura'], ['peso', 'Peso'], ['vida', 'Vive'], ['maioridade', 'Adulto aos'], ['dieta', 'Dieta'], ['inteligencia', 'Mente'], ['habitat', 'Habitat']] as [k, l] (k)}
              <th><button onclick={() => sortBy(k as keyof SpeciesRow)}>{l}{sortKey === k ? (asc ? ' ↑' : ' ↓') : ''}</button></th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each rows as r (r.entity.path)}
            <tr>
              <th><button class="who" style:--t={typeColor(r.entity.type)} onclick={() => onopen(r.entity.path)}>{r.entity.name}</button></th>
              <td><span class="mbar" style:--w="{((r.altura ?? 0) / maxOf('altura')) * 100}%">{num(r.altura, ' m')}</span></td>
              <td><span class="mbar" style:--w="{((r.peso ?? 0) / maxOf('peso')) * 100}%">{num(r.peso, ' kg')}</span></td>
              <td><span class="mbar" style:--w="{((r.vida ?? 0) / maxOf('vida')) * 100}%">{num(r.vida, ' anos')}</span></td>
              <td>{num(r.maioridade)}</td>
              <td>{r.dieta || '—'}</td>
              <td>{r.inteligencia || '—'}</td>
              <td>{r.habitat || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    {#if web.edges.length}
      <div class="web t-scroll-x">
        <svg viewBox="0 0 {W} {levels * ROW + 20}" width={W} role="img" aria-label="Teia alimentar">
          <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="var(--muted)" /></marker></defs>
          {#each Array.from({ length: levels }, (_, i) => i + 1) as l (l)}
            <text x="6" y={40 + (levels - l) * ROW - 22} class="lvl">{LEVEL_NAME[Math.min(l, 5)]}</text>
            <line x1="0" x2={W} y1={40 + (levels - l) * ROW + 30} y2={40 + (levels - l) * ROW + 30} class="sep" />
          {/each}
          {#each web.edges as ed (ed.eater + ed.eaten)}
            {@const a = pos.get(ed.eaten)}
            {@const b = pos.get(ed.eater)}
            {#if a && b}
              {@const dx = b.x - a.x}
              {@const dy = b.y - a.y}
              {@const d = Math.hypot(dx, dy) || 1}
              <line x1={a.x + (dx / d) * 16} y1={a.y + (dy / d) * 16} x2={b.x - (dx / d) * 18} y2={b.y - (dy / d) * 18} class="edge" marker-end="url(#arr)" />
            {/if}
          {/each}
          {#each webNodes as n (n.entity.path)}
            {@const p = pos.get(n.entity.path)}
            {#if p}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <g class="node" transform="translate({p.x} {p.y})" onclick={() => onopen(n.entity.path)} style:--t={typeColor(n.entity.type)}>
                <circle r="14" />
                <text y="30" text-anchor="middle">{n.entity.name}</text>
              </g>
            {/if}
          {/each}
        </svg>
      </div>
      <p class="dim small">As setas vão de quem é comido para quem come (a energia sobe). Ligue com <code>come: [[Presa]]</code> ou <code>predadores: [[Caçador]]</code> nas fichas.</p>
    {:else}
      <p class="dim pad">Sem cadeia alimentar ainda. Nas fichas, escreva <code>come: [[Outra espécie]]</code> (ou <code>presas</code>, <code>predadores</code>) e a teia se monta aqui, em níveis.</p>
    {/if}
  {/if}
</div>

<style>
  .seres { display: grid; gap: var(--sp-3); padding-bottom: 40px; }
  .bar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .grow { flex: 1; }
  .forge { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--sp-4); align-items: center; background: radial-gradient(circle at 0 100%, color-mix(in srgb, var(--ember) 10%, var(--surface)), var(--surface) 55%); }
  .fdraw { padding: 8px; border-radius: var(--r-md); background: var(--surface-2); }
  .ftext { display: grid; gap: 6px; min-width: 0; }
  .ftext b { font: 600 22px var(--f-display); }
  .ftext p { margin: 0; line-height: 1.5; font-size: 14px; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 13px; }
  .facts span { display: grid; }
  .facts small { font: 600 9.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .fbtn { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 8px; }
  .g { display: grid; gap: 4px; justify-items: start; text-align: left; padding: 10px; border-radius: var(--r-lg); border: 1px solid var(--line); background: linear-gradient(180deg, color-mix(in srgb, var(--c) 7%, var(--surface)), var(--surface)); color: var(--ink); }
  .g:hover { border-color: var(--c); }
  .pic { justify-self: stretch; display: grid; place-items: center; height: 120px; border-radius: var(--r-md); background: var(--surface-2); overflow: hidden; }
  .g b { font: 600 15px var(--f-display); }
  .g small { color: var(--muted); font-size: 12px; line-height: 1.35; }
  .fill { justify-self: stretch; height: 3px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .fill i { display: block; height: 100%; background: var(--c); }
  .lineup { display: flex; align-items: flex-end; gap: 14px; padding: 16px 8px 4px; border-bottom: 2px solid var(--line); min-height: 260px; }
  .ln { margin: 0; display: grid; justify-items: center; gap: 4px; flex: none; }
  .ln button { border: 0; background: none; padding: 0; }
  .ln figcaption { font-size: 11.5px; color: var(--muted); max-width: 110px; text-align: center; }
  .ln.human figcaption { font-style: italic; }
  .tbl table { border-collapse: collapse; width: 100%; font-size: 13px; }
  .tbl th, .tbl td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
  .tbl thead button { border: 0; background: none; color: var(--muted); font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; padding: 0; }
  .who { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 10%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 1px 9px; font-size: 12.5px; }
  .mbar { display: inline-block; min-width: 90px; padding: 1px 6px; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 28%, transparent) var(--w), transparent var(--w)); font-family: var(--f-mono); font-size: 12px; }
  .web { padding: 8px 0; }
  .web svg { display: block; max-width: none; }
  .lvl { font: 600 9px var(--f-display); letter-spacing: .1em; text-transform: uppercase; fill: var(--muted); }
  .sep { stroke: var(--line); stroke-dasharray: 2 4; }
  .edge { stroke: var(--muted); stroke-width: 1.2; opacity: .8; }
  .node { cursor: pointer; }
  .node circle { fill: color-mix(in srgb, var(--t) 40%, var(--surface)); stroke: var(--t); stroke-width: 2; }
  .node text { font: 600 11px var(--f-body); fill: var(--ink); }
  .node:hover circle { stroke-width: 3; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  .pad { padding: 8px 0; margin: 0; }
  @media (max-width: 560px) { .forge { grid-template-columns: 1fr; justify-items: center; } }
</style>
