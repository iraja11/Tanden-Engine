<script lang="ts">
  import { untrack } from 'svelte';
  import { typeColor } from './tipos';

  // Grafo de ligações do mundo. O layout é calculado uma vez (forças) e fica
  // parado: só se mexe quando você arrasta. Selecionar uma ficha acende as
  // ligações dela, com o nome de cada uma; o resto apaga.
  type N = { id: string; label: string; type: string };
  type E = { from: string; to: string; label: string };
  let { nodes, edges, selected = null, onselect }: { nodes: N[]; edges: E[]; selected?: string | null; onselect: (id: string | null) => void } = $props();

  type P = { x: number; y: number };
  let pos = $state<Record<string, P>>({});
  let view = $state({ x: -400, y: -300, w: 800, h: 600 });
  let svg = $state<SVGSVGElement>();

  const degree = $derived.by(() => {
    const d: Record<string, number> = {};
    for (const e of edges) { d[e.from] = (d[e.from] ?? 0) + 1; d[e.to] = (d[e.to] ?? 0) + 1; }
    return d;
  });
  const radius = (id: string) => 7 + Math.min(10, Math.sqrt(degree[id] ?? 0) * 3);

  // layout: refaz só quando entram ou saem nós/ligações; quem já tinha lugar fica onde estava
  const shape = $derived(nodes.map((n) => n.id).join('|') + '#' + edges.map((e) => `${e.from}>${e.to}`).join('|'));
  $effect(() => {
    void shape;
    untrack(layout);
  });

  function layout() {
    const prev = $state.snapshot(pos) as Record<string, P>;
    const types = [...new Set(nodes.map((n) => n.type))];
    const p: Record<string, P> = {};
    nodes.forEach((n, i) => {
      if (prev[n.id]) p[n.id] = { ...prev[n.id]! };
      else {
        // começa agrupado por tipo, para o resultado ser estável entre aberturas
        const a = (types.indexOf(n.type) / Math.max(1, types.length)) * Math.PI * 2 + i * 0.37;
        const r = 120 + (i % 7) * 18;
        p[n.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }
    });
    const fresh = nodes.filter((n) => !prev[n.id]).length;
    const steps = fresh === nodes.length ? 320 : fresh ? 120 : 0;
    const ids = nodes.map((n) => n.id);
    const links = edges.filter((e) => p[e.from] && p[e.to] && e.from !== e.to);
    for (let s = 0; s < steps; s++) {
      const t = 1 - s / steps;
      const f: Record<string, P> = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = p[ids[i]!]!, b = p[ids[j]!]!;
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 25);
          const k = 2600 / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          f[ids[i]!]!.x += dx * k; f[ids[i]!]!.y += dy * k;
          f[ids[j]!]!.x -= dx * k; f[ids[j]!]!.y -= dy * k;
        }
      }
      for (const e of links) {
        const a = p[e.from]!, b = p[e.to]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const k = (d - 110) * 0.04;
        f[e.from]!.x += (dx / d) * k; f[e.from]!.y += (dy / d) * k;
        f[e.to]!.x -= (dx / d) * k; f[e.to]!.y -= (dy / d) * k;
      }
      for (const id of ids) {
        if (fresh !== nodes.length && prev[id]) continue; // quem já estava não se mexe
        const q = p[id]!, g = f[id]!;
        g.x -= q.x * 0.01; g.y -= q.y * 0.01; // gravidade fraca para o centro
        const m = Math.min(12, Math.hypot(g.x, g.y)) * t;
        const h = Math.hypot(g.x, g.y) || 1;
        q.x += (g.x / h) * m; q.y += (g.y / h) * m;
      }
    }
    pos = p;
    if (fresh === nodes.length) fit();
  }

  function fit() {
    const ps = Object.values(pos);
    if (!ps.length) return;
    const xs = ps.map((q) => q.x), ys = ps.map((q) => q.y);
    const pad = 70;
    // com poucas fichas, não amplia demais: o texto ficaria gigante
    const w = Math.max(720, Math.max(...xs) - Math.min(...xs) + pad * 2);
    const h = Math.max(460, Math.max(...ys) - Math.min(...ys) + pad * 2);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    view = { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // arrastar nó / mover a vista
  let drag: null | { id: string | null; sx: number; sy: number; ox: number; oy: number; moved: boolean } = null;
  function toWorld(e: PointerEvent): P {
    const r = svg!.getBoundingClientRect();
    const s = Math.max(view.w / r.width, view.h / r.height);
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    return { x: cx + (e.clientX - r.left - r.width / 2) * s, y: cy + (e.clientY - r.top - r.height / 2) * s };
  }
  function down(e: PointerEvent, id: string | null) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const w = toWorld(e);
    drag = id ? { id, sx: w.x, sy: w.y, ox: pos[id]!.x, oy: pos[id]!.y, moved: false } : { id: null, sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    if (drag.id) {
      const w = toWorld(e);
      if (Math.hypot(w.x - drag.sx, w.y - drag.sy) > 3) drag.moved = true;
      pos[drag.id] = { x: drag.ox + w.x - drag.sx, y: drag.oy + w.y - drag.sy };
    } else {
      const r = svg!.getBoundingClientRect();
      const s = Math.max(view.w / r.width, view.h / r.height);
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 3) drag.moved = true;
      view = { ...view, x: drag.ox - (e.clientX - drag.sx) * s, y: drag.oy - (e.clientY - drag.sy) * s };
    }
  }
  function up() {
    if (drag && !drag.moved) onselect(drag.id === selected ? null : drag.id);
    drag = null;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    const k = Math.exp(e.deltaY * 0.0015);
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    const w = Math.min(6000, Math.max(160, view.w * k)), h = (view.h * w) / view.w;
    view = { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  const near = $derived(new Set(selected ? edges.flatMap((e) => (e.from === selected ? [e.to] : e.to === selected ? [e.from] : [])) : []));
  const lit = (e: E) => !!selected && (e.from === selected || e.to === selected);
</script>

<div class="graph">
  <svg bind:this={svg} viewBox="{view.x} {view.y} {view.w} {view.h}" preserveAspectRatio="xMidYMid meet"
    onpointerdown={(e) => down(e, null)} onpointermove={move} onpointerup={up} onwheel={wheel} role="img" aria-label="Grafo de ligações">
    <defs>
      <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="var(--ember)" />
      </marker>
    </defs>
    {#each edges as e, i (i)}
      {@const a = pos[e.from]}
      {@const b = pos[e.to]}
      {#if a && b && e.from !== e.to}
        {@const d = Math.hypot(b.x - a.x, b.y - a.y) || 1}
        {@const rb = radius(e.to) + 3}
        <line x1={a.x} y1={a.y} x2={b.x - ((b.x - a.x) / d) * rb} y2={b.y - ((b.y - a.y) / d) * rb}
          class:lit={lit(e)} class:dim={!!selected && !lit(e)} class:mention={e.label === 'menciona'} marker-end={lit(e) ? 'url(#seta)' : undefined} />
        {#if lit(e)}<text class="elabel" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4}>{e.label}</text>{/if}
      {/if}
    {/each}
    {#each nodes as n (n.id)}
      {@const p = pos[n.id]}
      {#if p}
        <g class="node" class:sel={n.id === selected} class:dim={!!selected && n.id !== selected && !near.has(n.id)}
          transform="translate({p.x} {p.y})" onpointerdown={(e) => down(e, n.id)} role="button" tabindex="0" aria-label={n.label}
          onkeydown={(e) => { if (e.key === 'Enter') onselect(n.id); }}>
          <circle r={radius(n.id)} style:--c={typeColor(n.type)} />
          <text y={radius(n.id) + 13}>{n.label}</text>
        </g>
      {/if}
    {/each}
  </svg>
  <button class="fit" onclick={fit} title="Enquadrar tudo">⤢</button>
</div>

<style>
  .graph { position: relative; flex: 1; min-height: 360px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
    background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--ember) 4%, var(--void)), var(--void) 70%); }
  svg { width: 100%; height: 100%; display: block; touch-action: none; cursor: grab; user-select: none; }
  line { stroke: var(--line); stroke-width: 1.4; transition: stroke .2s, opacity .2s; }
  line.mention { stroke-dasharray: 3 4; }
  line.lit { stroke: var(--ember); stroke-width: 1.8; filter: drop-shadow(0 0 3px var(--ember-glow)); }
  line.dim { opacity: .25; }
  .elabel { fill: var(--ember-soft); font: 10px var(--f-mono); text-anchor: middle; paint-order: stroke; stroke: var(--void); stroke-width: 3px; }
  .node { cursor: pointer; transition: opacity .2s; }
  .node circle { fill: color-mix(in srgb, var(--c) 30%, var(--void)); stroke: var(--c); stroke-width: 1.6; }
  .node.sel circle { fill: var(--c); filter: drop-shadow(0 0 8px var(--c)); }
  .node text { fill: var(--ink); font: 11.5px var(--f-body); text-anchor: middle; paint-order: stroke; stroke: var(--void); stroke-width: 3px; }
  .node.dim { opacity: .3; }
  .node:focus { outline: none; }
  .node:focus-visible circle { stroke-width: 3; }
  .fit { position: absolute; right: 10px; top: 10px; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--muted); }
</style>
