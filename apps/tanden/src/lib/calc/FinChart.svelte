<script lang="ts" module>
  export interface FinSeries {
    label: string;
    /** cor CSS (use tokens: var(--ember), var(--silver)...) */
    color: string;
    values: number[];
    /** preenche a área embaixo da linha */
    area?: boolean;
  }
</script>

<script lang="ts">
  /*
   * Gráfico de linhas simples para a aba Financeira (saldo ao longo dos meses,
   * parcelas de um financiamento). SVG puro; passar o dedo ou o mouse mostra os valores.
   */

  let { series, xLabel, fmt }: { series: FinSeries[]; xLabel: (i: number) => string; fmt: (v: number) => string } = $props();

  let w = $state(600);
  const h = 220;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  let hover = $state<number | null>(null);

  const n = $derived(Math.max(0, ...series.map((s) => s.values.length)));
  const max = $derived(Math.max(1e-9, ...series.flatMap((s) => s.values.filter(Number.isFinite))));
  const min = $derived(Math.min(0, ...series.flatMap((s) => s.values.filter(Number.isFinite))));
  const X = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r));
  const Y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (h - pad.t - pad.b);

  function path(vals: number[]): string {
    return vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  }
  function area(vals: number[]): string {
    if (!vals.length) return '';
    return `${path(vals)}L${X(vals.length - 1).toFixed(1)},${Y(Math.max(min, 0)).toFixed(1)}L${X(0).toFixed(1)},${Y(Math.max(min, 0)).toFixed(1)}Z`;
  }
  const ticks = $derived.by(() => {
    if (n < 2) return [];
    const want = Math.max(2, Math.floor(w / 110));
    const step = Math.max(1, Math.ceil((n - 1) / want));
    const out: number[] = [];
    for (let i = 0; i < n; i += step) out.push(i);
    return out;
  });

  function move(e: PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    if (n < 2) return;
    hover = Math.max(0, Math.min(n - 1, Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (n - 1))));
  }
</script>

<figure class="fchart" bind:clientWidth={w}>
  <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} onpointermove={move} onpointerleave={() => (hover = null)} role="img" aria-label="Gráfico">
    <line class="base" x1={pad.l} x2={w - pad.r} y1={Y(Math.max(min, 0))} y2={Y(Math.max(min, 0))} />
    {#each series as s (s.label)}
      {#if s.area}<path d={area(s.values)} fill={s.color} opacity=".14" />{/if}
      <path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" />
    {/each}
    {#each ticks as t (t)}<text class="tick" x={X(t)} y={h - 6} text-anchor={t === 0 ? 'start' : 'middle'}>{xLabel(t)}</text>{/each}
    {#if hover !== null}
      <line class="cursor" x1={X(hover)} x2={X(hover)} y1={pad.t} y2={h - pad.b} />
      {#each series as s (s.label)}
        {#if s.values[hover] !== undefined}<circle cx={X(hover)} cy={Y(s.values[hover]!)} r="3.5" fill={s.color} />{/if}
      {/each}
    {/if}
  </svg>
  <figcaption>
    {#if hover !== null}<b>{xLabel(hover)}</b>{/if}
    {#each series as s (s.label)}
      <span><i style:background={s.color}></i>{s.label}{#if hover !== null && s.values[hover] !== undefined}: <b>{fmt(s.values[hover]!)}</b>{/if}</span>
    {/each}
  </figcaption>
</figure>

<style>
  .fchart { margin: 0; min-width: 0; display: grid; gap: 6px; }
  svg { display: block; touch-action: pan-y; }
  .base { stroke: var(--line); }
  .cursor { stroke: var(--muted); stroke-dasharray: 3 3; }
  .tick { font: 10px var(--f-mono); fill: var(--muted); }
  figcaption { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: var(--fs-xs); color: var(--muted); min-height: 1.5em; }
  figcaption b { color: var(--ink); font: 500 var(--fs-xs) var(--f-mono); }
  figcaption i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
</style>
