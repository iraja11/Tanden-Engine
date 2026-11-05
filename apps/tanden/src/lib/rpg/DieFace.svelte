<script lang="ts" module>
  /** contorno e facetas de cada dado, num quadrado 0–100 */
  const SHAPES: Record<number, { outline: string; facets: string; text: number }> = {
    4: { outline: 'M50 6 95 88H5Z', facets: 'M50 6 50 62M5 88 50 62 95 88', text: 64 },
    6: { outline: 'M14 10h72q6 0 6 6v68q0 6-6 6H14q-6 0-6-6V16q0-6 6-6Z', facets: 'M20 20h60v60H20Z', text: 58 },
    8: { outline: 'M50 4 94 50 50 96 6 50Z', facets: 'M6 50h88M50 4 28 50 50 96 72 50Z', text: 57 },
    10: { outline: 'M50 4 94 42 50 96 6 42Z', facets: 'M6 42 50 58 94 42M50 58v38', text: 46 },
    12: { outline: 'M50 4 95 36 78 92H22L5 36Z', facets: 'M50 22 74 40 65 70H35L26 40ZM50 4v18M95 36 74 40M78 92 65 70M22 92 35 70M5 36 26 40', text: 56 },
    20: { outline: 'M50 3 93 27v46L50 97 7 73V27Z', facets: 'M50 22 78 70H22ZM50 3v19M93 27 78 70M7 27 22 70M50 97 22 70 78 70ZM7 73 22 70M93 73 78 70', text: 58 },
  };
  const shapeOf = (sides: number) => SHAPES[sides] ?? (sides === 100 ? SHAPES[10]! : sides <= 2 ? null : SHAPES[20]!);
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  // Um dado que cai na bandeja: gira, embaralha a face e assenta com um quique.
  let {
    sides, value, kept = true, success = false, exploded = false, index = 0, size = 46, animate = true,
  }: {
    sides: number;
    value: number;
    kept?: boolean;
    success?: boolean;
    exploded?: boolean;
    /** ordem na rolagem (escalona a queda) */
    index?: number;
    size?: number;
    animate?: boolean;
  } = $props();

  const shape = $derived(shapeOf(sides));
  const fudge = $derived(sides === 0);
  const max = $derived(sides > 1 && value === sides && kept);
  const min = $derived(sides > 1 && value === 1 && kept);
  const label = (v: number) => (fudge ? (v > 0 ? '+' : v < 0 ? '−' : '0') : String(v));

  // giro e desvio aleatórios para cada dado não cair igual
  const spin = Math.round((Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 360));
  const drift = Math.round((Math.random() - 0.5) * 60);
  const delay = Math.min(index, 10) * 45;
  let shown = $state(0);
  let rolling = $state(false);

  onMount(() => {
    shown = value;
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    rolling = true;
    const top = sides > 1 ? sides : 3;
    let ticks = 0;
    const timer = setInterval(() => {
      shown = fudge ? Math.floor(Math.random() * 3) - 1 : 1 + Math.floor(Math.random() * top);
      if (++ticks * 55 > 480 + delay) {
        clearInterval(timer);
        shown = value;
        rolling = false;
      }
    }, 55);
    return () => clearInterval(timer);
  });
</script>

<span class="die" class:rolling class:drop={!kept} class:max={max && !rolling} class:min={min && !rolling} class:hit={success} class:boom={exploded}
  class:anim={animate} style:--s="{size}px" style:--spin="{spin}deg" style:--drift="{drift}px" style:--delay="{delay}ms"
  title={`d${sides === 0 ? 'F' : sides}: ${label(value)}`}>
  {#if shape}
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path class="body" d={shape.outline} />
      <path class="facet" d={shape.facets} />
    </svg>
    <b style:top="{shape.text}%">{label(shown)}</b>
  {:else}
    <span class="coin">{label(shown)}</span>
  {/if}
  {#if exploded}<i class="spark" aria-hidden="true">✦</i>{/if}
</span>

<style>
  .die { position: relative; display: inline-block; width: var(--s); height: var(--s); flex: none; color: var(--ink); }
  .die svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .body { fill: color-mix(in srgb, var(--ember) 16%, var(--surface-2)); stroke: color-mix(in srgb, var(--ember) 70%, var(--line)); stroke-width: 3; stroke-linejoin: round;
    filter: drop-shadow(0 3px 4px var(--shadow, rgba(0, 0, 0, .35))); transition: fill var(--dur), stroke var(--dur); }
  .facet { fill: none; stroke: color-mix(in srgb, var(--ember) 35%, transparent); stroke-width: 1.4; stroke-linejoin: round; }
  b { position: absolute; left: 50%; transform: translate(-50%, -50%); font: 700 calc(var(--s) * .34)/1 var(--f-mono); font-variant-numeric: tabular-nums;
    text-shadow: 0 1px 2px rgba(0, 0, 0, .35); }
  .coin { position: absolute; inset: 12%; display: grid; place-items: center; border-radius: 50%; font: 700 calc(var(--s) * .34)/1 var(--f-mono);
    background: color-mix(in srgb, var(--ember) 16%, var(--surface-2)); border: 2px solid color-mix(in srgb, var(--ember) 70%, var(--line)); }

  /* queda: entra de cima girando, quica e assenta */
  .anim { animation: tumble .62s cubic-bezier(.2, .7, .3, 1.25) var(--delay) both; }
  .rolling b { color: var(--muted); }
  @keyframes tumble {
    0% { transform: translate(var(--drift), -42px) rotate(var(--spin)) scale(.6); opacity: 0; }
    55% { transform: translate(calc(var(--drift) * -.2), 4px) rotate(calc(var(--spin) * .08)) scale(1.04); opacity: 1; }
    75% { transform: translate(0, -5px) rotate(-4deg); }
    100% { transform: none; }
  }

  .drop { opacity: .38; }
  .drop .body { fill: var(--surface-2); stroke: var(--line); }
  .drop b { text-decoration: line-through; }
  .hit .body { stroke: var(--ok); fill: color-mix(in srgb, var(--ok) 16%, var(--surface-2)); }
  .boom .body { stroke-dasharray: 6 4; }
  .spark { position: absolute; top: -6px; right: -4px; font-style: normal; font-size: 12px; color: var(--ember); animation: twinkle 1.2s ease-in-out infinite; }
  @keyframes twinkle { 50% { opacity: .3; transform: scale(.7) rotate(45deg); } }

  /* face máxima brilha; o 1 racha */
  .max .body { fill: color-mix(in srgb, #ffcf5a 34%, var(--surface-2)); stroke: #ffcf5a; filter: drop-shadow(0 0 8px rgba(255, 200, 80, .65)); }
  .max b { color: #fff3cf; }
  .anim.max { animation: tumble .62s cubic-bezier(.2, .7, .3, 1.25) var(--delay) both, glow 1.6s ease-in-out .7s 2; }
  @keyframes glow { 50% { transform: scale(1.12); } }
  .min .body { stroke: var(--crit); fill: color-mix(in srgb, var(--crit) 16%, var(--surface-2)); }
  .min b { color: var(--crit); }

  @media (prefers-reduced-motion: reduce) { .anim, .max, .spark { animation: none; } }
</style>
