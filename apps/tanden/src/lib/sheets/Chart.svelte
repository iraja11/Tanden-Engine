<script lang="ts">
  import { formatNumber, formatGeneral, isDateFormat, type ChartType } from '@tanden/core';
  import { SERIES_COLORS, type ChartData } from './chartdata';

  // Gráfico em SVG: traços finos, grade discreta, legenda quando há 2+ séries,
  // dica ao passar o mouse. Nada de animação gratuita: só a entrada dos dados.
  let { data, type, stacked = false, height = 240 }: { data: ChartData; type: ChartType; stacked?: boolean; height?: number } = $props();

  let wrap = $state<HTMLDivElement>();
  let width = $state(420);
  let hover = $state<{ i: number; x: number; y: number } | null>(null);

  $effect(() => {
    if (!wrap) return;
    const ro = new ResizeObserver(() => (width = wrap!.clientWidth));
    ro.observe(wrap);
    return () => ro.disconnect();
  });

  const series = $derived(type === 'scatter' ? data.series.slice(0, 3) : data.series.slice(0, SERIES_COLORS.length));
  const color = (i: number) => (series.length === 1 && type !== 'pie' ? 'var(--ember)' : SERIES_COLORS[i % SERIES_COLORS.length]!);
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmt = (v: number | null) => (v === null ? '–' : data.nf ? formatNumber(v, data.nf) : formatGeneral(Math.round(v * 1e6) / 1e6));
  const tick = (v: number) => (data.nf && (isDateFormat(data.nf) || data.nf.includes('%')) ? formatNumber(v, data.nf) : Math.abs(v) >= 10000 ? compact.format(v) : formatGeneral(v));

  function niceTicks(lo: number, hi: number, n = 5): number[] {
    if (lo === hi) { hi = lo + 1; lo = Math.min(0, lo); }
    const span = hi - lo;
    const step0 = span / n;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!;
    const out: number[] = [];
    for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step);
    if (out[out.length - 1]! < hi) out.push(out[out.length - 1]! + step);
    return out;
  }

  const n = $derived(data.categories.length);
  const horizontal = $derived(type === 'bar');

  // escala de valores
  const range = $derived.by(() => {
    let lo = 0, hi = 0;
    if (stacked && (type === 'column' || type === 'bar' || type === 'area')) {
      for (let i = 0; i < n; i++) {
        let pos = 0, neg = 0;
        for (const s of series) { const v = s.values[i] ?? 0; if (v >= 0) pos += v; else neg += v; }
        hi = Math.max(hi, pos); lo = Math.min(lo, neg);
      }
    } else {
      for (const s of series) for (const v of s.values) if (v !== null) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
      if (type === 'line' || type === 'scatter') {
        // linha e dispersão não precisam começar no zero
        const vals = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
        const mn = Math.min(...vals), mx = Math.max(...vals);
        if (mn > 0 && mn > (mx - mn) * 1.5) lo = mn - (mx - mn) * 0.1, hi = mx;
      }
    }
    return niceTicks(lo, hi);
  });

  const xRange = $derived.by(() => {
    if (type !== 'scatter') return [0, 1];
    const v = data.xs.filter((x): x is number => x !== null);
    return niceTicks(Math.min(...v), Math.max(...v));
  });

  const legendH = $derived(series.length > 1 && type !== 'pie' ? 26 : 0);
  const labelW = $derived(horizontal ? Math.min(140, Math.max(...data.categories.map((c) => c.length)) * 7 + 12) : Math.max(...range.map((t) => tick(t).length)) * 7 + 14);
  const pad = $derived({ l: labelW, r: 14, t: 10 + legendH, b: horizontal ? 24 : 28 });
  const pw = $derived(Math.max(10, width - pad.l - pad.r));
  const ph = $derived(Math.max(10, height - pad.t - pad.b));
  const lo = $derived(range[0]!);
  const hi = $derived(range[range.length - 1]!);
  const val = (v: number) => (horizontal ? pad.l + ((v - lo) / (hi - lo)) * pw : pad.t + ph - ((v - lo) / (hi - lo)) * ph);
  const xval = (v: number) => pad.l + ((v - xRange[0]!) / (xRange[xRange.length - 1]! - xRange[0]!)) * pw;
  const band = $derived((horizontal ? ph : pw) / Math.max(1, n));
  const cat = (i: number) => (horizontal ? pad.t : pad.l) + band * (i + 0.5);

  // a cada quantos rótulos mostrar um, para não amontoar
  const every = $derived(Math.max(1, Math.ceil((horizontal ? 16 : Math.max(...data.categories.map((c) => c.length)) * 6.5 + 10) / band)));

  /** barra com ponta arredondada (4px) e base reta */
  function barPath(x: number, y: number, w: number, h: number, dir: 'up' | 'down' | 'right' | 'left'): string {
    const r = Math.min(4, (dir === 'up' || dir === 'down' ? w : h) / 2, (dir === 'up' || dir === 'down' ? h : w));
    if (r <= 0.5) return `M${x},${y}h${w}v${h}h${-w}Z`;
    if (dir === 'up') return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    if (dir === 'down') return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    if (dir === 'right') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }

  type Bar = { d: string; s: number; i: number };
  const bars = $derived.by(() => {
    if (type !== 'column' && type !== 'bar') return [] as Bar[];
    const out: Bar[] = [];
    const groups = stacked ? 1 : series.length;
    const thick = Math.min(24, (band * 0.72) / groups);
    const gap = 2;
    for (let i = 0; i < n; i++) {
      let pos = 0, neg = 0;
      series.forEach((s, si) => {
        const v = s.values[i];
        if (v === null || v === undefined) return;
        let a: number, b: number;
        if (stacked) { const base = v >= 0 ? pos : neg; a = base; b = base + v; if (v >= 0) pos += v; else neg += v; }
        else { a = 0; b = v; }
        const p0 = val(Math.max(lo, Math.min(a, b))), p1 = val(Math.max(a, b));
        const off = stacked ? -thick / 2 : -((thick + gap) * groups - gap) / 2 + si * (thick + gap);
        const c = cat(i) + off;
        // em pilha, 2px de respiro entre segmentos
        const inset = stacked && si > 0 ? 1 : 0;
        if (horizontal) {
          const x0 = Math.min(p0, p1) + (v >= 0 ? inset : 0), w = Math.abs(p1 - p0) - inset;
          out.push({ d: barPath(x0, c, Math.max(0, w), thick, v >= 0 ? 'right' : 'left'), s: si, i });
        } else {
          const y0 = Math.min(p0, p1), h = Math.abs(p1 - p0) - inset;
          out.push({ d: barPath(c, y0, thick, Math.max(0, h), v >= 0 ? 'up' : 'down'), s: si, i });
        }
      });
    }
    return out;
  });

  const lines = $derived.by(() => {
    if (type !== 'line' && type !== 'area') return [];
    const acc = new Array(n).fill(0);
    return series.map((s, si) => {
      const pts: Array<[number, number] | null> = s.values.map((v, i) => {
        if (v === null) return null;
        const y = stacked && type === 'area' ? (acc[i] += v) : v;
        return [cat(i), val(y)];
      });
      let d = '';
      let pen = false;
      for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${p[0]},${p[1]}`; pen = true; }
      const valid = pts.filter((p): p is [number, number] => !!p);
      const area = valid.length ? `${d}L${valid[valid.length - 1]![0]},${val(Math.max(lo, 0))}L${valid[0]![0]},${val(Math.max(lo, 0))}Z` : '';
      return { d, area, pts, si };
    });
  });

  const slices = $derived.by(() => {
    if (type !== 'pie') return [];
    const vals = series[0]!.values.map((v, i) => ({ v: Math.max(0, v ?? 0), name: data.categories[i]!, i }));
    // mais de 7 fatias: o resto vira "Outros"
    const sorted = [...vals].sort((a, b) => b.v - a.v);
    const shown = sorted.length > SERIES_COLORS.length ? [...sorted.slice(0, SERIES_COLORS.length - 1), { v: sorted.slice(SERIES_COLORS.length - 1).reduce((s, x) => s + x.v, 0), name: 'Outros', i: -1 }] : vals;
    const total = shown.reduce((s, x) => s + x.v, 0) || 1;
    let a = -Math.PI / 2;
    return shown.filter((x) => x.v > 0).map((x, k) => {
      const a0 = a, a1 = a + (x.v / total) * Math.PI * 2;
      a = a1;
      return { ...x, a0, a1, k, pct: x.v / total };
    });
  });
  const pie = $derived({ cx: width / 2 - (width > 420 ? 90 : 0), cy: height / 2, r: Math.min(height / 2 - 12, width / 2 - 20) });

  function arc(a0: number, a1: number, r: number, r0: number): string {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rr: number) => `${pie.cx + rr * Math.cos(a)},${pie.cy + rr * Math.sin(a)}`;
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
    return `M${p(a0, r)}A${r},${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, r0)}A${r0},${r0} 0 ${large} 0 ${p(a0, r0)}Z`;
  }

  function onMove(e: PointerEvent) {
    const b = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - b.left, y = e.clientY - b.top;
    if (type === 'pie' || type === 'scatter') return;
    const pos = horizontal ? y - pad.t : x - pad.l;
    const i = Math.floor(pos / band);
    hover = i >= 0 && i < n && x >= pad.l - 4 && y <= pad.t + ph + 4 ? { i, x, y } : null;
  }
</script>

<div class="chart" bind:this={wrap}>
  <svg width={Math.max(0, width - 1)} {height} viewBox="0 0 {width} {height}" role="img" aria-label="Gráfico"
    onpointermove={onMove} onpointerleave={() => (hover = null)}>
    {#if legendH}
      <g class="legend">
        {#each series as s, si (si)}
          {@const lx = pad.l + series.slice(0, si).reduce((acc, x) => acc + Math.min(140, x.name.length * 6.6 + 26), 0)}
          <rect x={lx} y="6" width="10" height="10" rx="2" fill={color(si)} />
          <text x={lx + 15} y="15">{s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name}</text>
        {/each}
      </g>
    {/if}

    {#if type === 'pie'}
      {#each slices as sl (sl.k)}
        <path d={arc(sl.a0, sl.a1, pie.r, pie.r * 0.58)} fill={SERIES_COLORS[sl.k % SERIES_COLORS.length]} class="slice"
          class:dim={hover && hover.i !== sl.k} stroke="var(--surface)" stroke-width="2"
          onpointerenter={() => (hover = { i: sl.k, x: 0, y: 0 })} role="presentation" />
      {/each}
      <text class="total" x={pie.cx} y={pie.cy - 2} text-anchor="middle">{fmt(slices.reduce((s, x) => s + x.v, 0))}</text>
      <text class="axis" x={pie.cx} y={pie.cy + 14} text-anchor="middle">total</text>
      <g class="legend">
        {#each slices as sl, k (sl.k)}
          {@const lx = width > 420 ? pie.cx + pie.r + 26 : 12}
          {@const ly = width > 420 ? pie.cy - slices.length * 10 + k * 20 : height + k * 20}
          {#if width > 420}
            <rect x={lx} y={ly - 9} width="10" height="10" rx="2" fill={SERIES_COLORS[sl.k % SERIES_COLORS.length]} />
            <text x={lx + 15} y={ly}>{sl.name.length > 16 ? `${sl.name.slice(0, 15)}…` : sl.name} <tspan class="muted">{Math.round(sl.pct * 100)}%</tspan></text>
          {/if}
        {/each}
      </g>
    {:else}
      <!-- grade e eixo de valores -->
      {#each range as t (t)}
        {#if horizontal}
          <line class="grid" class:zero={t === 0} x1={val(t)} x2={val(t)} y1={pad.t} y2={pad.t + ph} />
          <text class="axis" x={val(t)} y={pad.t + ph + 16} text-anchor="middle">{tick(t)}</text>
        {:else}
          <line class="grid" class:zero={t === 0} x1={pad.l} x2={pad.l + pw} y1={val(t)} y2={val(t)} />
          <text class="axis" x={pad.l - 8} y={val(t) + 4} text-anchor="end">{tick(t)}</text>
        {/if}
      {/each}
      <!-- rótulos das categorias -->
      {#if type === 'scatter'}
        {#each xRange as t (t)}
          <text class="axis" x={xval(t)} y={pad.t + ph + 18} text-anchor="middle">{formatGeneral(t)}</text>
        {/each}
      {:else}
        {#each data.categories as c, i (i)}
          {#if i % every === 0}
            {#if horizontal}
              <text class="axis" x={pad.l - 8} y={cat(i) + 4} text-anchor="end">{c.length > 18 ? `${c.slice(0, 17)}…` : c}</text>
            {:else}
              <text class="axis" x={cat(i)} y={pad.t + ph + 18} text-anchor="middle">{c.length > 12 ? `${c.slice(0, 11)}…` : c}</text>
            {/if}
          {/if}
        {/each}
      {/if}

      {#if hover && type !== 'scatter'}
        {#if horizontal}
          <rect class="band" x={pad.l} y={pad.t + band * hover.i} width={pw} height={band} />
        {:else if type === 'line' || type === 'area'}
          <line class="cross" x1={cat(hover.i)} x2={cat(hover.i)} y1={pad.t} y2={pad.t + ph} />
        {:else}
          <rect class="band" x={pad.l + band * hover.i} y={pad.t} width={band} height={ph} />
        {/if}
      {/if}

      {#each bars as b (`${b.s}:${b.i}`)}
        <path d={b.d} fill={color(b.s)} class="bar" />
      {/each}
      {#each lines as l (l.si)}
        {#if type === 'area'}<path d={l.area} fill={color(l.si)} opacity=".12" />{/if}
        <path d={l.d} fill="none" stroke={color(l.si)} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="line" />
        {#if hover}
          {@const p = l.pts[hover.i]}
          {#if p}<circle cx={p[0]} cy={p[1]} r="4.5" fill={color(l.si)} stroke="var(--surface)" stroke-width="2" />{/if}
        {:else if n <= 40}
          {@const last = [...l.pts].reverse().find((p) => p)}
          {#if last}<circle cx={last[0]} cy={last[1]} r="4" fill={color(l.si)} stroke="var(--surface)" stroke-width="2" />{/if}
        {/if}
      {/each}
      {#if type === 'scatter'}
        {#each series as s, si (si)}
          {#each s.values as v, i (i)}
            {#if v !== null && data.xs[i] !== null}
              <circle cx={xval(data.xs[i]!)} cy={val(v)} r="4.5" fill={color(si)} stroke="var(--surface)" stroke-width="2" class="dot"
                onpointerenter={(e) => (hover = { i: i * 10 + si, x: xval(data.xs[i]!), y: val(v) })} role="presentation" />
            {/if}
          {/each}
        {/each}
      {/if}
    {/if}
  </svg>

  {#if type === 'pie' && width <= 420}
    <ul class="plegend">
      {#each slices as sl (sl.k)}
        <li><i style:background={SERIES_COLORS[sl.k % SERIES_COLORS.length]}></i>{sl.name} <span>{Math.round(sl.pct * 100)}%</span></li>
      {/each}
    </ul>
  {/if}

  {#if hover}
    {#if type === 'pie'}
      {@const sl = slices.find((s) => s.k === hover!.i)}
      {#if sl}<div class="tip" style:left="{pie.cx}px" style:top="{pie.cy - pie.r - 6}px"><b>{sl.name}</b><span>{fmt(sl.v)} · {Math.round(sl.pct * 1000) / 10}%</span></div>{/if}
    {:else if type === 'scatter'}
      {@const i = Math.floor(hover.i / 10)}
      {@const si = hover.i % 10}
      <div class="tip" style:left="{hover.x}px" style:top="{hover.y - 10}px"><b>{series[si]?.name}</b><span>x {formatGeneral(data.xs[i] ?? 0)} · y {fmt(series[si]?.values[i] ?? null)}</span></div>
    {:else}
      <div class="tip" style:left="{Math.min(Math.max(hover.x, 80), width - 80)}px" style:top="{Math.max(hover.y - 12, 30)}px">
        <b>{data.categories[hover.i]}</b>
        {#each series as s, si (si)}
          <span><i style:background={color(si)}></i>{series.length > 1 ? `${s.name}: ` : ''}{fmt(s.values[hover.i] ?? null)}</span>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .chart { position: relative; width: 100%; min-width: 0; }
  svg { display: block; overflow: visible; touch-action: pan-y; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .grid.zero { stroke: color-mix(in srgb, var(--muted) 60%, var(--line)); }
  .axis { fill: var(--muted); font: 10.5px var(--f-mono); font-variant-numeric: tabular-nums; }
  .legend text { fill: var(--silver); font: 11.5px var(--f-body); }
  .muted { fill: var(--muted); }
  .total { fill: var(--ink); font: 600 16px var(--f-display); }
  .band { fill: color-mix(in srgb, var(--ink) 4%, transparent); }
  .cross { stroke: var(--muted); stroke-width: 1; opacity: .6; }
  .bar, .line, .slice { animation: grow .5s cubic-bezier(.2, .8, .2, 1) both; transform-box: fill-box; }
  .bar { transform-origin: bottom; }
  .slice { transform-origin: center; transition: opacity .15s; }
  .slice.dim { opacity: .45; }
  .line { stroke-dasharray: 2000; animation-name: draw; animation-duration: .9s; }
  @keyframes grow { from { transform: scale(.96); opacity: 0; } }
  @keyframes draw { from { stroke-dashoffset: 2000; } to { stroke-dashoffset: 0; } }
  .plegend { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font: 11.5px var(--f-body); color: var(--silver); }
  .plegend li { display: flex; align-items: center; gap: 6px; }
  .plegend i { width: 10px; height: 10px; border-radius: 2px; }
  .plegend span { color: var(--muted); font-variant-numeric: tabular-nums; }
  .tip { position: absolute; transform: translate(-50%, -100%); pointer-events: none; z-index: 2; display: grid; gap: 2px;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: 9px; padding: 6px 9px; white-space: nowrap;
    font: 12px var(--f-body); color: var(--ink); box-shadow: 0 10px 24px -10px #000; }
  .tip b { font-weight: 600; }
  .tip span { display: flex; align-items: center; gap: 6px; color: var(--silver); font-variant-numeric: tabular-nums; }
  .tip i { width: 8px; height: 8px; border-radius: 2px; flex: none; }
</style>
