<script lang="ts">
  import type { Pulse } from './engine.svelte';

  // Veias do núcleo até cada área. Paradas = circuito visível.
  // Fluxo contínuo enquanto há processo rodando; pulso quando um dado viaja.
  type Targets = Record<Pulse['target'], HTMLElement | undefined>;
  let { host, orb, targets, flowing, pulses }:
    { host?: HTMLElement; orb?: HTMLElement; targets: Targets; flowing: boolean; pulses: Pulse[] } = $props();

  let size = $state({ w: 0, h: 0 });
  let paths = $state<Partial<Record<Pulse['target'], string>>>({});

  function layout() {
    if (!host || !orb) return;
    const a = host.getBoundingClientRect();
    const o = orb.getBoundingClientRect();
    const ox = o.left - a.left + o.width / 2, oy = o.top - a.top + o.height / 2;
    size = { w: a.width, h: a.height };
    const next: typeof paths = {};
    for (const [key, el] of Object.entries(targets) as [Pulse['target'], HTMLElement | undefined][]) {
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      // a veia termina na borda do painel, onde ele "se conecta" ao núcleo
      const tx = r.left - a.left, ty = r.top - a.top + Math.min(24, r.height / 2);
      const mx = (ox + tx) / 2;
      next[key] = `M${ox},${oy} C${mx},${oy} ${mx},${ty} ${tx},${ty}`;
    }
    paths = next;
  }

  $effect(() => {
    if (!host) return;
    const ro = new ResizeObserver(layout);
    ro.observe(host);
    Object.values(targets).forEach((el) => el && ro.observe(el));
    layout();
    return () => ro.disconnect();
  });
</script>

<svg class="veins" width={size.w} height={size.h} viewBox="0 0 {size.w} {size.h}" aria-hidden="true">
  {#each Object.entries(paths) as [key, d] (key)}
    <path class="v" class:flowing {d} pathLength="100" />
  {/each}
  {#each pulses as p (p.id)}
    {#if paths[p.target]}
      <path class="p {p.dir}" d={paths[p.target]} pathLength="100" />
    {/if}
  {/each}
</svg>

<style>
  .veins { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: visible; }
  .v { fill: none; stroke: var(--ember); stroke-width: 1.2; opacity: .14; transition: opacity .4s; }
  .v.flowing { opacity: .55; stroke-dasharray: 3 5; animation: flow .9s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -8; } }
  .p { fill: none; stroke: var(--ember-soft); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 10 120;
    filter: drop-shadow(0 0 6px var(--ember)); animation: .8s cubic-bezier(.5, 0, .3, 1) forwards; }
  .p.out { animation-name: out; }
  .p.in { animation-name: in; }
  @keyframes out { from { stroke-dashoffset: 10; } to { stroke-dashoffset: -100; } }
  @keyframes in { from { stroke-dashoffset: -100; } to { stroke-dashoffset: 10; } }
</style>
