<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { analyzeNote, plotFn, type PlotSeries } from '@tanden/core/src/calc';
  import { engine } from '../engine.svelte';
  import Editor from '../Editor.svelte';
  import { files } from '../files/files.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { sound } from '../sound.svelte';
  import { PlotView } from './plot-view';
  import { PLOT_HELP, REFERENCE, TEX_HELP } from './reference';

  /*
   * Aba Cálculo: folhas de cálculo (notas "tipo: cálculo" em Cálculo/), com
   * um gráfico grande das funções definidas na folha e a cola de sintaxe.
   */

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const FOLDER = 'Cálculo/';
  const sheets = $derived(engine.notes.filter((p) => p.startsWith(FOLDER) && p.endsWith('.md')));
  let side = $state<'grafico' | 'cola'>('grafico');
  let extra = $state('');
  let extraError = $state('');
  let plotEl = $state<HTMLDivElement>();
  let plot: PlotView | null = null;
  let funcs = $state<{ name: string; param: string; text: string }[]>([]);

  const TEMPLATE = (title: string) => `---
tipo: cálculo
---
# ${title}

Uma conta por linha; o resultado aparece à direita. A cola está no painel ao lado.

Preço: 12,90 * 3
Frete: 15
total

v = 100 km/h em m/s
f(x) = x^2 - 3x + 2
resolver(f(x) = 0; x)
derivada(f(x); x)
`;

  function newSheet() {
    let n = 1;
    let path = `${FOLDER}Folha.md`;
    while (engine.notes.includes(path)) path = `${FOLDER}Folha ${++n}.md`;
    engine.writeNote(path, TEMPLATE(path.slice(FOLDER.length, -3)));
    engine.open(path);
    sound.play('create');
  }

  // abre uma folha ao entrar (a ativa, se já for uma folha; senão a primeira; senão cria)
  $effect(() => {
    if (!engine.ready) return;
    const active = engine.active;
    if (active && active.startsWith(FOLDER)) return;
    if (sheets.length) engine.open(sheets[0]!);
    else newSheet();
  });

  // o gráfico acompanha a folha, um instante depois de parar de digitar
  let timer = 0;
  $effect(() => {
    const text = engine.content;
    const extraSrc = extra;
    clearTimeout(timer);
    timer = window.setTimeout(() => redraw(text, extraSrc), 160);
  });

  function redraw(text: string, extraSrc: string) {
    if (!plot) return;
    const { sheet } = analyzeNote(text);
    funcs = sheet.functions();
    const series: PlotSeries[] = [];
    for (const f of funcs) {
      try {
        series.push({ kind: 'fx', label: `${f.name}(${f.param}) = ${f.text}`, f: plotFn(sheet, `${f.name}(x)`) });
      } catch { /* função com parâmetros extras: fica fora do gráfico */ }
    }
    extraError = '';
    if (extraSrc.trim()) {
      try {
        const src = extraSrc.replace(/^\s*y\s*=\s*/, '');
        const fn = plotFn(sheet, src);
        fn(0.5);
        series.unshift({ kind: 'fx', label: `y = ${src}`, f: fn });
      } catch (e) {
        extraError = e instanceof Error ? e.message : String(e);
      }
    }
    plot.setSpec({ series, equal: false, grid: true, errors: [] });
  }

  $effect(() => {
    if (!plotEl || side !== 'grafico') return;
    plot = new PlotView({ wheel: 'always' });
    plot.el.classList.add('big');
    plotEl.appendChild(plot.el);
    untrack(() => redraw(engine.content, extra));
    return () => {
      plot?.destroy();
      plot?.el.remove();
      plot = null;
    };
  });

  onDestroy(() => clearTimeout(timer));

  function use(ex: string) {
    if (!editorBridge.insert(ex)) return;
    sound.play('tick');
  }

  const title = (p: string) => p.slice(FOLDER.length).replace(/\.md$/, '');
</script>

<div class="calc">
  <aside class="list">
    <header>
      <h2>Folhas</h2>
      <button class="new" onclick={newSheet} title="Nova folha de cálculo" aria-label="Nova folha">+</button>
    </header>
    <ul>
      {#each sheets as p (p)}
        <li><button class:on={p === engine.active} onclick={() => { if (p !== engine.active) sound.play('tick'); engine.open(p); }}>{title(p)}</button></li>
      {/each}
    </ul>
    <p class="hint">Blocos <code>```calc</code> e <code>```grafico</code> funcionam em qualquer nota, e <code>$…$</code> vira fórmula. Use <b>∑ Inserir</b> na nota.</p>
  </aside>

  <section class="sheet">
    {#if engine.active && engine.active.startsWith(FOLDER)}
      {#key engine.active}
        <div class="crumb">
          <span>{engine.active}</span>
          <button onclick={() => onOpenNote(engine.active!)} title="Abrir em Notas">Abrir em Notas</button>
        </div>
        <Editor value={engine.content} docKey={engine.active} onchange={(v) => engine.edit(v)} host={files.host} />
      {/key}
    {/if}
  </section>

  <aside class="panel">
    <nav>
      <button class:on={side === 'grafico'} onclick={() => (side = 'grafico')}>Gráfico</button>
      <button class:on={side === 'cola'} onclick={() => (side = 'cola')}>Cola</button>
    </nav>
    {#if side === 'grafico'}
      <label class="extra">
        <span>y =</span>
        <input bind:value={extra} placeholder="outra curva, ex.: derivada(f(x); x)" spellcheck="false" />
      </label>
      {#if extraError}<p class="err">{extraError}</p>{/if}
      <div class="plot" bind:this={plotEl}></div>
      {#if !funcs.length && !extra.trim()}
        <p class="hint">Defina uma função na folha, como <code>f(x) = x^2</code>, e ela aparece aqui. Arraste para mover, roda para aproximar.</p>
      {/if}
    {:else}
      <div class="ref">
        {#each REFERENCE as sec}
          <h3>{sec.title}</h3>
          {#each sec.items as it}
            <button class="ex" onclick={() => use(it.ex)} title="Inserir na folha"><code>{it.ex}</code><small>{it.note}</small></button>
          {/each}
        {/each}
        <h3>Bloco de gráfico (em notas)</h3>
        {#each PLOT_HELP as [ex, note]}<div class="ex static"><code>{ex}</code><small>{note}</small></div>{/each}
        <h3>Fórmulas</h3>
        {#each TEX_HELP as [ex, note]}<div class="ex static"><code>{ex}</code><small>{note}</small></div>{/each}
      </div>
    {/if}
  </aside>
</div>

<style>
  .calc { flex: 1; min-height: 0; display: grid; grid-template-columns: 200px minmax(0, 1fr) minmax(320px, 40%); }
  .list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
  .list header { display: flex; align-items: center; justify-content: space-between; padding: 16px 14px 8px; }
  h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .new { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 16px; line-height: 1;
    transition: border-color var(--dur), color var(--dur), transform var(--dur) var(--spring); }
  .new:hover { border-color: var(--ember); color: var(--ember); transform: rotate(90deg); }
  .list ul { list-style: none; margin: 0; padding: 0 8px; overflow-y: auto; }
  .list li button { width: 100%; text-align: left; border: 0; background: none; border-radius: 8px; padding: 7px 10px; border-left: 2px solid transparent;
    color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background var(--dur); }
  .list li button:hover { background: var(--surface-2); }
  .list li button.on { background: var(--surface-2); border-left-color: var(--ember); }
  .hint { margin: auto 14px 14px; font-size: 12px; line-height: 1.5; color: var(--muted); }
  code { font: 11.5px var(--f-mono); color: var(--ember-soft); }

  .sheet { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .crumb { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px 0; font: 11px var(--f-mono); color: var(--muted);
    max-width: 808px; width: 100%; margin: 0 auto; }
  .crumb button { border: 1px solid transparent; background: none; border-radius: 8px; padding: 3px 8px; font: 11.5px var(--f-mono); color: var(--muted); }
  .crumb button:hover { color: var(--ink); border-color: var(--line); }
  .sheet :global(.editor) { flex: 1; }

  .panel { display: flex; flex-direction: column; gap: 10px; min-height: 0; padding: 14px 16px 16px; border-left: 1px solid var(--line); }
  nav { display: flex; gap: 4px; }
  nav button { border: 1px solid var(--line); background: none; border-radius: 9px; padding: 5px 12px; font: 500 11px var(--f-display); letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); transition: color var(--dur), border-color var(--dur), background var(--dur); }
  nav button.on { color: var(--ember); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 9%, transparent); }
  .extra { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 10px; padding: 4px 10px; background: var(--surface);
    font: 13px var(--f-mono); color: var(--muted); transition: border-color var(--dur); }
  .extra:focus-within { border-color: var(--ember); }
  .extra input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--ink); font: inherit; padding: 4px 0; }
  .err { margin: 0; font: 11.5px var(--f-mono); color: var(--crit); }
  .plot { flex: 1; min-height: 240px; display: flex; }
  .plot :global(.tplot.big) { flex: 1; }
  .panel > .hint { margin: 0; }

  .ref { overflow-y: auto; display: grid; gap: 3px; padding-right: 4px; }
  h3 { margin: 14px 0 4px; font: 600 11px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h3:first-child { margin-top: 0; }
  .ex { display: grid; gap: 1px; text-align: left; border: 1px solid transparent; background: none; border-radius: 9px; padding: 5px 9px; }
  button.ex:hover { border-color: var(--line); background: var(--surface-2); }
  button.ex:hover code { color: var(--ember); }
  .ex code { font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
  .ex small { color: var(--muted); font-size: 11.5px; }

  @media (max-width: 980px) {
    .calc { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr) minmax(280px, 45%); }
    .list { border-right: 0; border-bottom: 1px solid var(--line); }
    .list ul { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 8px; }
    .list li button { width: auto; }
    .list .hint { display: none; }
    .panel { border-left: 0; border-top: 1px solid var(--line); }
  }
</style>
