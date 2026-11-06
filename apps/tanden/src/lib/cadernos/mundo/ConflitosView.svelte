<script lang="ts">
  import { conflictsOf, stanceBetween, tensionsOf, type Entity, type World } from '@tanden/core';
  import { rise } from '../../motion';
  import { typeColor } from '../tipos';

  // Conflitos, rivalidades e alianças do mundo. Vêm das fichas `conflito`
  // (com `lados`) e do nome das ligações: `inimigos`, `rival`, `aliados`...
  let { world, byPath, onopen, onnew }: { world: World; byPath: Map<string, Entity>; onopen: (path: string) => void; onnew: () => void } = $props();

  const conflicts = $derived(conflictsOf(world));
  const tensions = $derived(tensionsOf(world));
  const hostile = $derived(tensions.filter((t) => t.stance === 'hostil'));
  const allied = $derived(tensions.filter((t) => t.stance === 'aliado'));
  const maxW = $derived(Math.max(1, ...tensions.map((t) => t.weight)));
  const factions = $derived(world.entities.filter((e) => e.type === 'faccao'));

  const nameOf = (p: string) => byPath.get(p)?.name ?? p;
  const colorOf = (p: string) => (byPath.get(p) ? typeColor(byPath.get(p)!.type) : 'var(--muted)');
</script>

<div class="conf">
  <section>
    <header><h3>Conflitos</h3><button class="ghost sm" onclick={onnew}>+ Conflito</button></header>
    {#if conflicts.length}
      <div class="wars">
        {#each conflicts as c, i (c.path)}
          <button class="war" class:active={c.active} onclick={() => onopen(c.path)} in:rise={{ delay: i * 40 }}>
            <span class="state">{#if c.active}<i class="live"></i>em curso{:else}encerrado{/if}{#if c.status && !/ativ|curso/i.test(c.status)} · {c.status}{/if}</span>
            <b>{c.name}</b>
            <span class="sides">
              {#each c.sides as s, j (j)}
                {#if j > 0}<span class="vs">⚔</span>{/if}
                <span class="side" style:--c={colorOf(s)}>{nameOf(s)}</span>
              {:else}<span class="dim">sem lados definidos</span>{/each}
            </span>
            <span class="heat" title={`Intensidade ${c.intensity} de 5`}>{#each { length: 5 } as _, k (k)}<i class:on={k < c.intensity}></i>{/each}</span>
            {#if c.start || c.end}<span class="dim small">{c.start}{c.end ? ` – ${c.end}` : c.start ? ' – …' : ''}</span>{/if}
            {#if c.summary}<span class="sum">{c.summary}</span>{/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="dim">Nenhuma ficha de conflito. Crie uma com <code>lados: [[A]], [[B]]</code>, ou ligue fichas com campos como <code>inimigos</code> e <code>aliados</code>.</p>
    {/if}
  </section>

  <div class="two">
    <section>
      <h3>Rivalidades</h3>
      {#each hostile as t, i (t.a + t.b)}
        <div class="pair" in:rise={{ delay: i * 30 }}>
          <span class="names">
            <button style:--c={colorOf(t.a)} onclick={() => onopen(t.a)}>{nameOf(t.a)}</button>
            <span class="vs">⚔</span>
            <button style:--c={colorOf(t.b)} onclick={() => onopen(t.b)}>{nameOf(t.b)}</button>
          </span>
          <span class="bar hostil"><i style:width="{(t.weight / maxW) * 100}%"></i></span>
          <span class="src">{t.sources.join(' · ')}</span>
        </div>
      {:else}<p class="dim small">Ninguém se odeia ainda. Que tédio.</p>{/each}
    </section>
    <section>
      <h3>Alianças</h3>
      {#each allied as t, i (t.a + t.b)}
        <div class="pair" in:rise={{ delay: i * 30 }}>
          <span class="names">
            <button style:--c={colorOf(t.a)} onclick={() => onopen(t.a)}>{nameOf(t.a)}</button>
            <span class="vs ally">✚</span>
            <button style:--c={colorOf(t.b)} onclick={() => onopen(t.b)}>{nameOf(t.b)}</button>
          </span>
          <span class="bar aliado"><i style:width="{(t.weight / maxW) * 100}%"></i></span>
          <span class="src">{t.sources.join(' · ')}</span>
        </div>
      {:else}<p class="dim small">Sem alianças. Use campos como <code>aliados</code> ou <code>aliança com</code>.</p>{/each}
    </section>
  </div>

  {#if factions.length >= 2}
    <section>
      <h3>Entre as facções</h3>
      <div class="matrix" style:--n={factions.length}>
        <span></span>
        {#each factions as f (f.path)}<span class="col" title={f.name}>{f.name}</span>{/each}
        {#each factions as a (a.path)}
          <span class="row" title={a.name}>{a.name}</span>
          {#each factions as b (b.path)}
            {@const s = a === b ? 'self' : stanceBetween(tensions, a.path, b.path)}
            <span class="cell {s}" title={a === b ? '' : `${a.name} e ${b.name}: ${s}`}>{s === 'hostil' ? '⚔' : s === 'aliado' ? '✚' : ''}</span>
          {/each}
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  .conf { display: grid; gap: 18px; padding-bottom: 40px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0 0 8px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  header h3 { margin: 0; }
  .wars { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: 10px; margin-top: 8px; }
  .war { position: relative; display: grid; gap: 6px; text-align: left; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); overflow: hidden;
    background: linear-gradient(160deg, color-mix(in srgb, var(--crit) 6%, var(--surface)), var(--surface) 60%); }
  .war.active { border-color: color-mix(in srgb, var(--crit) 45%, var(--line)); }
  .war.active::after { content: ''; position: absolute; inset: auto -20% -60% -20%; height: 80%; pointer-events: none;
    background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--crit) 22%, transparent), transparent 70%); animation: embers 3.5s ease-in-out infinite alternate; }
  @keyframes embers { to { opacity: .45; transform: translateY(6px); } }
  .war:hover { border-color: var(--crit); }
  .war b { font: 600 16px var(--f-display); }
  .state { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .war.active .state { color: var(--crit); }
  .live { width: 7px; height: 7px; border-radius: 50%; background: var(--crit); box-shadow: 0 0 0 0 var(--crit); animation: pulse 1.6s infinite; }
  @keyframes pulse { 70% { box-shadow: 0 0 0 7px transparent; } }
  .sides { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
  .side { border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 12%, transparent); border-radius: 999px; padding: 0 8px; font-size: 12.5px; }
  .vs { color: var(--crit); font-size: 12px; }
  .vs.ally { color: var(--ok); }
  .heat { display: flex; gap: 3px; }
  .heat i { width: 14px; height: 5px; border-radius: 3px; background: var(--line); }
  .heat i.on { background: linear-gradient(90deg, var(--ember), var(--crit)); box-shadow: 0 0 6px color-mix(in srgb, var(--crit) 60%, transparent); }
  .sum { color: var(--muted); font-size: 12.5px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .pair { display: grid; gap: 3px; padding: 7px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
  .names { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .names button { border: 0; background: none; padding: 0; color: var(--ink); font: 600 13.5px var(--f-display); box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--c) 60%, transparent); }
  .bar { height: 4px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 3px; transition: width .6s var(--ease, ease); }
  .bar.hostil i { background: linear-gradient(90deg, var(--ember), var(--crit)); }
  .bar.aliado i { background: linear-gradient(90deg, #4fa37b, var(--ok)); }
  .src { font: 11px var(--f-mono); color: var(--muted); }
  .matrix { display: grid; grid-template-columns: minmax(80px, 140px) repeat(var(--n), minmax(28px, 44px)); gap: 3px; overflow-x: auto; font-size: 12px; }
  .col { writing-mode: vertical-rl; transform: rotate(180deg); justify-self: center; max-height: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .row { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; align-self: center; color: var(--muted); }
  .cell { aspect-ratio: 1; border-radius: 6px; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--line); font-size: 12px; }
  .cell.hostil { background: color-mix(in srgb, var(--crit) 30%, var(--surface)); border-color: var(--crit); }
  .cell.aliado { background: color-mix(in srgb, var(--ok) 25%, var(--surface)); border-color: var(--ok); }
  .cell.self { background: repeating-linear-gradient(45deg, var(--line) 0 2px, transparent 2px 6px); }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .ghost { border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); color: var(--ink); }
  .ghost.sm { padding: 4px 10px; font-size: 12.5px; }
  .ghost:hover { border-color: var(--ember); }
  @media (max-width: 720px) { .two { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { .war.active::after, .live { animation: none; } }
</style>
