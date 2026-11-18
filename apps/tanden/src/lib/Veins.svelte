<script lang="ts">
  import type { Pulse } from './engine.svelte';
  import { roundedPath, route, type Box } from './veias';

  // Veias do núcleo até cada área. Paradas = circuito visível.
  // Fluxo contínuo enquanto há processo rodando; pulso quando um dado viaja.
  // O traçado é reto e corre pelas bordas dos painéis, sem cruzar o conteúdo (ver veias.ts).
  type Targets = Record<Pulse['target'], HTMLElement | undefined>;
  let { host, orb, targets, avoid = [], flowing, pulses }: {
    host?: HTMLElement; orb?: HTMLElement; targets: Targets;
    /** áreas com conteúdo que as veias contornam, além dos próprios destinos */
    avoid?: Array<HTMLElement | undefined>;
    flowing: boolean; pulses: Pulse[];
  } = $props();

  let size = $state({ w: 0, h: 0 });
  let paths = $state<Partial<Record<Pulse['target'], string>>>({});

  function layout() {
    if (!host || !orb) return;
    const a = host.getBoundingClientRect();
    const o = orb.getBoundingClientRect();
    const start = { x: Math.round(o.left - a.left + o.width / 2), y: Math.round(o.top - a.top + o.height / 2) };
    const w = a.width, h = a.height;
    size = { w, h };
    const box = (el: HTMLElement): Box | null => {
      if (el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      const b = { left: r.left - a.left, top: r.top - a.top, right: r.right - a.left, bottom: r.bottom - a.top };
      // fora da tela (a gaveta de notas fechada no celular) não ganha veia
      return b.right - b.left < 2 || b.bottom - b.top < 2 || b.right <= 1 || b.left >= w - 1 || b.bottom <= 1 || b.top >= h - 1 ? null : b;
    };
    const boxes = new Map<Pulse['target'], Box>();
    for (const [key, el] of Object.entries(targets) as [Pulse['target'], HTMLElement | undefined][]) {
      const b = el && box(el);
      if (b) boxes.set(key, b);
    }
    const extra = avoid.flatMap((el) => (el ? [box(el)].filter((b): b is Box => !!b) : []));
    const next: typeof paths = {};
    for (const [key, t] of boxes) {
      // um painel por cima do símbolo (a gaveta aberta no celular) não precisa de veia
      if (start.x > t.left && start.x < t.right && start.y > t.top && start.y < t.bottom) continue;
      const prefer = { x: t.left, y: t.top + Math.min(24, (t.bottom - t.top) / 2) };
      const others = [...boxes].filter(([k]) => k !== key).map(([, b]) => b);
      const pts = route(start, t, prefer, [...others, ...extra], { w, h });
      if (!pts || pts.length < 2) continue;
      // a veia nasce na borda do símbolo, não no meio dele
      const [p0, p1] = [pts[0]!, pts[1]!];
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const r = Math.min(o.width / 2, len - 1);
      if (len > 0 && r > 0) pts[0] = { x: p0.x + ((p1.x - p0.x) / len) * r, y: p0.y + ((p1.y - p0.y) / len) * r };
      next[key] = roundedPath(pts, 12);
    }
    paths = next;
  }

  $effect(() => {
    if (!host) return;
    const ro = new ResizeObserver(layout);
    ro.observe(host);
    Object.values(targets).forEach((el) => el && ro.observe(el));
    avoid.forEach((el) => el && ro.observe(el));
    // a gaveta e as barras se mexem com transform, que o ResizeObserver não vê
    const moved = (e: TransitionEvent) => {
      if (e.propertyName === 'transform' && (Object.values(targets) as unknown[]).includes(e.target)) layout();
    };
    host.addEventListener('transitionend', moved);
    layout();
    return () => {
      ro.disconnect();
      host?.removeEventListener('transitionend', moved);
    };
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
  .v { fill: none; stroke: var(--ember); stroke-width: 1.2; stroke-linejoin: round; opacity: .14; transition: opacity .4s; }
  .v.flowing { opacity: .55; stroke-dasharray: 3 5; animation: flow .9s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -8; } }
  .p { fill: none; stroke: var(--ember-soft); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 10 120;
    filter: drop-shadow(0 0 6px var(--ember)); animation: .8s cubic-bezier(.5, 0, .3, 1) forwards; }
  .p.out { animation-name: out; }
  .p.in { animation-name: in; }
  @keyframes out { from { stroke-dashoffset: 10; } to { stroke-dashoffset: -100; } }
  @keyframes in { from { stroke-dashoffset: -100; } to { stroke-dashoffset: 10; } }
</style>
