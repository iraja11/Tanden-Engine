<script lang="ts">
  import type { MoveFigure } from '@tanden/core';
  import { theme } from '../theme.svelte';
  import { FIGURES, type Point, type Pose } from './figuras';

  // Boneco que mostra o movimento. Parado, fica na posição de esforço.
  let { fig, playing = true, label }: { fig: MoveFigure; playing?: boolean; label: string } = $props();

  const PERIOD = 2400;
  let k = $state(1);
  const figure = $derived(FIGURES[fig]);

  $effect(() => {
    if (!playing || theme.ms(100) === 0) return;
    let raf = 0;
    const from = performance.now();
    const loop = (t: number) => {
      k = (1 - Math.cos(((t - from) / PERIOD) * Math.PI * 2)) / 2;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  const mix = (a: Point, b: Point): Point => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const j = $derived.by(() => {
    const out = {} as Pose;
    for (const key of Object.keys(figure.a) as Array<keyof Pose>) out[key] = mix(figure.a[key], figure.b[key]);
    return out;
  });
  const path = (...pts: Point[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
</script>

<svg viewBox="0 0 200 160" role="img" aria-label={label}>
  {#if figure.scenery === 'parede-direita'}<path class="prop" d="M152 18V140" />
  {:else if figure.scenery === 'parede-esquerda'}<path class="prop" d="M72 18V140" />
  {:else if figure.scenery === 'banco'}<path class="prop" d="M46 96H76M50 96V140M72 96V140" />
  {:else if figure.scenery === 'cadeira'}<path class="prop" d="M74 62V106H106M78 106V140M104 106V140" />{/if}
  <path class="ground" d="M16 140H184" />
  <g class="far">
    <polyline points={path(j.hip, j.kneeB, j.footB)} />
    <polyline points={path(j.neck, j.elbowB, j.handB)} />
  </g>
  <g class="near">
    <polyline points={path(j.neck, j.hip)} />
    <polyline points={path(j.hip, j.kneeA, j.footA)} />
    <polyline points={path(j.neck, j.elbowA, j.handA)} />
    <circle cx={j.head[0]} cy={j.head[1]} r="11" />
  </g>
</svg>

<style>
  svg { display: block; width: 100%; height: 100%; }
  polyline { fill: none; stroke: currentColor; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; }
  .near { color: var(--ember); }
  .near circle { fill: currentColor; }
  .far { color: var(--muted); opacity: .6; }
  .ground, .prop { fill: none; stroke: var(--line); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .prop { stroke: var(--muted); stroke-width: 4; }
</style>
