<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { GraphCanvas } from '../grafo/graph-canvas';
  import { typeColor } from './tipos';

  // Grafo de ligações do mundo, no mesmo motor do grafo das notas (canvas,
  // aguenta milhares de fichas). Selecionar uma ficha acende as ligações
  // dela, com o nome de cada uma; dois cliques abrem a ficha.
  type N = { id: string; label: string; type: string };
  type E = { from: string; to: string; label: string };
  let { nodes, edges, selected = null, onselect, onopen }: { nodes: N[]; edges: E[]; selected?: string | null; onselect: (id: string | null) => void; onopen?: (id: string) => void } = $props();

  let host = $state<HTMLDivElement>();
  let gc: GraphCanvas | null = null;
  let query = $state('');

  $effect(() => {
    const ns = nodes;
    const es = edges;
    untrack(() => {
      if (!host) return;
      if (!gc) {
        gc = new GraphCanvas({ arrows: 'lit', edgeLabels: true, onSelect: (id) => onselect(id), onOpen: (id) => onopen?.(id) });
        gc.setParams({ repel: 1.4, linkDistance: 95 });
        host.appendChild(gc.el);
      }
      gc.setData(
        ns.map((n) => ({ id: n.id, label: n.label, color: typeColor(n.type) })),
        es.map((e) => ({ from: e.from, to: e.to, label: e.label, dashed: e.label === 'menciona' })),
      );
      gc.select(selected);
    });
  });
  $effect(() => {
    const s = selected;
    untrack(() => gc?.select(s));
  });

  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hits = $derived(query.trim() ? nodes.filter((n) => norm(n.label).includes(norm(query.trim()))) : []);
  $effect(() => {
    const h = hits;
    const q = query.trim();
    untrack(() => gc?.setHighlight(q ? h.map((n) => n.id) : null));
  });
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && hits[0]) {
      onselect(hits[0].id);
      gc?.select(hits[0].id, true);
    }
    if (e.key === 'Escape') query = '';
  }

  onDestroy(() => gc?.destroy());
</script>

<div class="graph">
  <div class="host" bind:this={host}></div>
  <label class="find">
    <span aria-hidden="true">⌕</span>
    <input bind:value={query} onkeydown={onKey} placeholder="Buscar ficha" spellcheck="false" />
    {#if query.trim()}<small>{hits.length}</small>{/if}
  </label>
  <div class="tools">
    <button onclick={() => gc?.fit()} title="Enquadrar tudo">⤢</button>
    <button onclick={() => gc?.zoomBy(1.4)} title="Aproximar">+</button>
    <button onclick={() => gc?.zoomBy(1 / 1.4)} title="Afastar">−</button>
  </div>
</div>

<style>
  .graph { position: relative; flex: 1; min-height: 360px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
    background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--ember) 4%, var(--void)), var(--void) 70%); }
  .host { position: absolute; inset: 0; }
  .find { position: absolute; left: 10px; top: 10px; display: flex; align-items: center; gap: 6px; width: min(220px, calc(100% - 70px)); border: 1px solid var(--line);
    border-radius: 9px; padding: 0 8px; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(6px); color: var(--muted); }
  .find:focus-within { border-color: var(--ember); }
  .find input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--ink); font: 12.5px var(--f-body); padding: 6px 0; }
  .find small { font: 11px var(--f-mono); }
  .tools { position: absolute; right: 10px; top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .tools button { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); padding: 0; font: 600 14px/1 var(--f-mono); }
  .tools button:hover { color: var(--ember); border-color: var(--ember); }
</style>
