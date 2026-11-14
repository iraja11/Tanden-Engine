<script lang="ts">
  import type { SpeciesFigure } from '@tanden/core';

  // Silhueta da espécie desenhada a partir das propriedades (plano do corpo,
  // altura, cores, traços). Com `compare`, um humano de 1,75 m ao lado dá a escala.
  let { fig, compare = false, size = 160, label = '' }: { fig: SpeciesFigure; compare?: boolean; size?: number; label?: string } = $props();

  // Cada plano: limites em x (unidades locais, altura total = 100), cabeça e linha das costas.
  type Plan = { x0: number; x1: number; head: { x: number; y: number; r: number }; back: Array<[number, number]>; ground: boolean };
  const PLANS: Record<SpeciesFigure['plano'], Plan> = {
    bipede: { x0: -22, x1: 22, head: { x: 0, y: 12, r: 10 }, back: [[-9, 26], [-11, 40], [-10, 54]], ground: true },
    quadrupede: { x0: -60, x1: 66, head: { x: 50, y: 22, r: 12 }, back: [[-30, 30], [-10, 28], [10, 29], [28, 30]], ground: true },
    centauroide: { x0: -36, x1: 48, head: { x: -20, y: 11, r: 8 }, back: [[0, 50], [18, 50], [34, 52]], ground: true },
    hexapode: { x0: -54, x1: 40, head: { x: 26, y: 55, r: 9 }, back: [[-40, 46], [-24, 44], [-8, 47], [6, 47]], ground: true },
    serpentino: { x0: -52, x1: 50, head: { x: 36, y: 20, r: 9 }, back: [[-30, 83], [-6, 80], [22, 74], [30, 52]], ground: true },
    alado: { x0: -60, x1: 60, head: { x: 20, y: 30, r: 9 }, back: [[-12, 42], [0, 41]], ground: true },
    aquatico: { x0: -68, x1: 54, head: { x: 34, y: 46, r: 12 }, back: [[-20, 30], [0, 28], [18, 31]], ground: false },
    radial: { x0: -38, x1: 38, head: { x: 0, y: 30, r: 26 }, back: [[-20, 10], [0, 6], [20, 10]], ground: false },
    amorfo: { x0: -44, x1: 44, head: { x: 6, y: 42, r: 14 }, back: [[-26, 34], [0, 26], [24, 34]], ground: true },
  };

  const HUMAN = 1.75;
  const plan = $derived(PLANS[fig.plano]);
  const winged = $derived(fig.asas && fig.plano !== 'alado');
  const lx0 = $derived(plan.x0 - (winged ? 26 : 0));
  const lx1 = $derived(plan.x1 + (winged ? 26 : 0));
  // escala: 92 unidades de tela para a maior altura em cena
  const maxH = $derived(compare ? Math.max(fig.altura, HUMAN) : fig.altura);
  const unit = $derived(92 / maxH);
  const s = $derived((fig.altura * unit) / 100);
  const humanW = $derived(compare ? 0.5 * HUMAN * unit + 8 : 0);
  const width = $derived(Math.max(40, humanW + (lx1 - lx0) * s + 8));
  const cx = $derived(humanW + 4 - lx0 * s);
  const top = $derived(96 - fig.altura * unit);
  const hs = $derived(HUMAN * unit / 100);
  const uid = $derived(`f${Math.round(fig.altura * 100)}${fig.plano}${fig.cor.slice(1)}`);
  const mark = (m: number) => (m >= 10 ? Math.round(m) : m >= 1 ? m.toFixed(1).replace('.', ',') : m.toFixed(2).replace('.', ','));
  const shade = $derived(`color-mix(in srgb, ${fig.cor} 70%, #000)`);
</script>

<svg class="fig" viewBox="0 0 {width} 100" width={size * (width / 100)} height={size} role="img" aria-label={label || 'Silhueta da espécie'} style:max-width="100%">
  <defs>
    <linearGradient id="{uid}-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color={fig.cor} />
      <stop offset="1" stop-color={shade} />
    </linearGradient>
    {#if fig.brilho}
      <filter id="{uid}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
    {/if}
  </defs>
  <line x1="0" x2={width} y1="96" y2="96" class="ground" />
  {#if compare}
    <!-- humano de referência -->
    <g transform="translate({4 + 0.25 * HUMAN * unit} {96 - HUMAN * unit}) scale({hs})" class="human">
      <circle cx="0" cy="11" r="9" />
      <rect x="-12" y="22" width="24" height="36" rx="9" />
      <rect x="-11" y="52" width="9" height="48" rx="4" />
      <rect x="2" y="52" width="9" height="48" rx="4" />
      <rect x="-19" y="24" width="7" height="32" rx="3.5" />
      <rect x="12" y="24" width="7" height="32" rx="3.5" />
    </g>
    <text x={4 + 0.25 * HUMAN * unit} y={96 - HUMAN * unit - 2} class="lbl" text-anchor="middle">1,75 m</text>
  {/if}

  <g transform="translate({cx} {top}) scale({s})" fill="url(#{uid}-g)" stroke={fig.cor2} stroke-width={1.6 / Math.max(s, 0.05) * 0.6} stroke-linejoin="round" filter={fig.brilho ? `url(#${uid}-glow)` : undefined}>
    {#if winged}
      <path d="M-8 30 L-48 10 L-40 34 L-50 44 L-10 46 Z M8 30 L48 10 L40 34 L50 44 L10 46 Z" fill={fig.cor2} opacity=".75" />
    {/if}
    {#if fig.cauda && (fig.plano === 'bipede' || fig.plano === 'amorfo')}
      <path d="M-4 54 Q-30 70 -34 94 Q-24 78 4 60 Z" />
    {/if}

    {#if fig.plano === 'bipede'}
      <rect x="-12" y="22" width="24" height="36" rx="9" />
      <rect x="-11" y="52" width="9" height="48" rx="4" />
      <rect x="2" y="52" width="9" height="48" rx="4" />
      <rect x="-19" y="24" width="7" height="32" rx="3.5" />
      <rect x="12" y="24" width="7" height="32" rx="3.5" />
    {:else if fig.plano === 'quadrupede'}
      <path d="M-46 64 Q-48 40 -30 33 Q0 26 30 31 Q46 34 44 58 Q20 66 -46 64 Z" />
      <path d="M30 34 Q40 18 48 14 L58 26 Q48 32 42 46 Z" />
      <rect x="-42" y="56" width="10" height="44" rx="4" /><rect x="-26" y="58" width="10" height="42" rx="4" />
      <rect x="22" y="56" width="10" height="44" rx="4" /><rect x="34" y="54" width="10" height="46" rx="4" />
      {#if fig.cauda}<path d="M-46 40 Q-62 46 -58 70 Q-54 52 -44 48 Z" />{/if}
    {:else if fig.plano === 'centauroide'}
      <path d="M-14 72 Q-16 50 4 48 Q30 46 40 52 Q46 62 40 74 Q14 80 -14 72 Z" />
      <rect x="-28" y="20" width="16" height="44" rx="7" />
      <rect x="-12" y="68" width="8" height="32" rx="3.5" /><rect x="0" y="70" width="8" height="30" rx="3.5" />
      <rect x="26" y="68" width="8" height="32" rx="3.5" /><rect x="36" y="66" width="8" height="34" rx="3.5" />
      <rect x="-34" y="22" width="6" height="28" rx="3" />
      {#if fig.cauda}<path d="M40 56 Q56 60 50 84 Q46 66 38 62 Z" />{/if}
    {:else if fig.plano === 'hexapode'}
      <g fill="none" stroke={fig.cor2} stroke-width="3" stroke-linecap="round">
        <path d="M-14 62 L-26 76 L-34 100" /><path d="M0 64 L-4 80 L-8 100" /><path d="M10 62 L18 80 L24 100" />
        <path d="M-10 62 L-16 80 L-18 100" /><path d="M4 64 L8 82 L10 100" /><path d="M14 60 L28 74 L36 100" />
      </g>
      <ellipse cx="-30" cy="58" rx="24" ry="14" />
      <circle cx="4" cy="58" r="11" />
    {:else if fig.plano === 'serpentino'}
      <path d="M-50 94 C-30 100 -20 80 -2 88 S 30 100 34 72 S 24 36 36 24" fill="none" stroke="url(#{uid}-g)" stroke-width="13" stroke-linecap="round" />
      <path d="M-50 94 C-30 100 -20 80 -2 88 S 30 100 34 72 S 24 36 36 24" fill="none" stroke={fig.cor2} stroke-width="1.5" stroke-dasharray="3 5" opacity=".6" />
    {:else if fig.plano === 'alado'}
      <path d="M-6 44 L-56 12 L-48 38 L-58 50 L-8 56 Z" fill={fig.cor2} opacity=".8" />
      <ellipse cx="0" cy="54" rx="22" ry="14" />
      <path d="M-18 56 L-44 66 L-20 62 Z" />
      <path d="M12 46 Q18 34 20 30 L26 34 Q22 44 18 52 Z" />
      <path d="M6 44 L56 12 L48 38 L58 50 L8 56 Z" fill={fig.cor2} opacity=".9" />
      <g fill="none" stroke={fig.cor2} stroke-width="2.6" stroke-linecap="round"><path d="M-4 66 L-6 100 M6 66 L8 100" /></g>
    {:else if fig.plano === 'aquatico'}
      <path d="M-46 46 L-68 26 L-62 48 L-68 70 Z" />
      <ellipse cx="0" cy="48" rx="50" ry="22" />
      <path d="M-10 28 Q4 10 16 28 Z" />
      <path d="M0 62 Q6 76 16 66 Z" fill={fig.cor2} />
    {:else if fig.plano === 'radial'}
      <g fill="none" stroke="url(#{uid}-g)" stroke-width="4" stroke-linecap="round">
        {#each [-28, -18, -8, 2, 12, 22, 30] as x, i (i)}<path d="M{x} 40 q{i % 2 ? 6 : -6} 18 0 30 q{i % 2 ? -5 : 5} 14 {i % 2 ? 2 : -2} 26" />{/each}
      </g>
      <path d="M-36 42 Q-36 4 0 4 Q36 4 36 42 Q18 48 0 44 Q-18 48 -36 42 Z" />
    {:else}
      <path d="M-40 100 Q-46 70 -26 58 Q-30 30 -4 28 Q24 22 30 48 Q46 62 40 100 Z" />
    {/if}

    {#if fig.espinhos}
      {#each plan.back as [x, y], i (i)}<path d="M{x - 4} {y + 2} L{x} {y - 10} L{x + 4} {y + 2} Z" fill={fig.cor2} />{/each}
    {/if}
    {#if fig.juba}<circle cx={plan.head.x} cy={plan.head.y + 2} r={plan.head.r * 1.5} fill={fig.cor2} />{/if}
    {#if fig.orelhas}
      <path d="M{plan.head.x - plan.head.r * 0.6} {plan.head.y - plan.head.r * 0.4} L{plan.head.x - plan.head.r * 1.8} {plan.head.y - plan.head.r * 1.6} L{plan.head.x - plan.head.r * 0.1} {plan.head.y - plan.head.r * 0.9} Z" />
      <path d="M{plan.head.x + plan.head.r * 0.6} {plan.head.y - plan.head.r * 0.4} L{plan.head.x + plan.head.r * 1.8} {plan.head.y - plan.head.r * 1.6} L{plan.head.x + plan.head.r * 0.1} {plan.head.y - plan.head.r * 0.9} Z" />
    {/if}
    {#if fig.plano !== 'radial' && fig.plano !== 'serpentino'}
      <circle cx={plan.head.x} cy={plan.head.y} r={plan.head.r} />
    {:else if fig.plano === 'serpentino'}
      <ellipse cx={plan.head.x + 2} cy={plan.head.y} rx={plan.head.r * 1.2} ry={plan.head.r * 0.8} />
    {/if}
    {#if fig.chifres}
      <g fill={fig.cor2} stroke="none">
        <path d="M{plan.head.x - plan.head.r * 0.5} {plan.head.y - plan.head.r * 0.7} q{-plan.head.r * 0.9} {-plan.head.r * 0.6} {-plan.head.r * 0.5} {-plan.head.r * 1.8} q{plan.head.r * 0.1} {plan.head.r * 0.9} {plan.head.r * 0.9} {plan.head.r * 1.4} Z" />
        <path d="M{plan.head.x + plan.head.r * 0.5} {plan.head.y - plan.head.r * 0.7} q{plan.head.r * 0.9} {-plan.head.r * 0.6} {plan.head.r * 0.5} {-plan.head.r * 1.8} q{-plan.head.r * 0.1} {plan.head.r * 0.9} {-plan.head.r * 0.9} {plan.head.r * 1.4} Z" />
      </g>
    {/if}
    {#if fig.antenas}
      <g fill="none" stroke={fig.cor2} stroke-width="2" stroke-linecap="round">
        <path d="M{plan.head.x - 2} {plan.head.y - plan.head.r} q-6 -12 -2 -20" /><path d="M{plan.head.x + 2} {plan.head.y - plan.head.r} q8 -10 6 -20" />
      </g>
    {/if}
    {#if fig.tentaculos && fig.plano !== 'radial'}
      <g fill="none" stroke={fig.cor2} stroke-width="2.4" stroke-linecap="round">
        <path d="M{plan.head.x - 3} {plan.head.y + plan.head.r * 0.8} q-3 8 1 14" /><path d="M{plan.head.x} {plan.head.y + plan.head.r} q0 8 -2 15" /><path d="M{plan.head.x + 3} {plan.head.y + plan.head.r * 0.8} q4 7 0 14" />
      </g>
    {/if}
    {#if fig.olhos}
      <g fill="#fff8e0" stroke="none" class="eyes">
        {#each Array.from({ length: fig.olhos }, (_, i) => i) as i (i)}
          {@const n = fig.olhos}
          {@const dx = (i - (n - 1) / 2) * plan.head.r * (n > 2 ? 0.42 : 0.7)}
          {@const dy = n > 2 && i % 2 ? -plan.head.r * 0.35 : -plan.head.r * 0.05}
          <circle cx={plan.head.x + dx} cy={plan.head.y + dy} r={plan.head.r * 0.17} />
        {/each}
      </g>
    {/if}
  </g>
  <text x={cx + ((lx0 + lx1) / 2) * s} y={Math.max(7, top - 2)} class="lbl strong" text-anchor="middle">{mark(fig.altura)} m</text>
</svg>

<style>
  .fig { display: block; overflow: visible; }
  .ground { stroke: var(--line); stroke-width: .6; }
  .human { fill: color-mix(in srgb, var(--muted) 22%, transparent); stroke: var(--muted); stroke-width: 1.2; stroke-dasharray: 3 2; }
  .lbl { font: 5px var(--f-mono); fill: var(--muted); }
  .lbl.strong { fill: var(--ink); }
</style>
