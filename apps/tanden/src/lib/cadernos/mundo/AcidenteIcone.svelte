<script lang="ts">
  import type { AcidenteId } from '@tanden/core';

  // Ícone de um acidente geográfico do atlas (vulcão, cachoeira, oásis...),
  // no mesmo traço de atlas das estruturas: tinta escura e miolo de papel.
  let { kind, size = 20 }: { kind: AcidenteId; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#if kind === 'vulcao'}
    <path class="w" d="M2.5 21 9 9h6l6.5 12Z" />
    <path class="hot" d="M9 9h6l-1.4 3.2-1.2-1.2-1 2.2-1-2.4-.8 1Z" />
    <path class="smoke" d="M12 7c-1-1.5.6-2.3-.2-3.8M14.5 7c.8-1.3 2.4-1.1 2.2-3" />
  {:else if kind === 'fonte_termal' || kind === 'geiser'}
    <path class="water" d="M3 19c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0" />
    {#if kind === 'geiser'}<path class="spray" d="M12 17V5M9 9c1-2 2-3 3-4 1 1 2 2 3 4" />{:else}<path class="smoke" d="M8 15c-1-2 1-3 0-5M12 15c-1-2 1-3 0-5M16 15c-1-2 1-3 0-5" />{/if}
  {:else if kind === 'cachoeira'}
    <path class="w" d="M3 6h7v14H3Z" />
    <path class="w" d="M14 6h7v14h-7Z" />
    <path class="water" d="M10 6h4v14h-4ZM9 21c1-.8 2-.8 3 0s2 .8 3 0" />
  {:else if kind === 'caverna'}
    <path class="w" d="M2 20C3 11 7 6 12 6s9 5 10 14Z" />
    <path class="dark" d="M8 20c0-4 1.8-7 4-7s4 3 4 7Z" />
  {:else if kind === 'oasis'}
    <ellipse class="water" cx="12" cy="18" rx="7" ry="2.4" />
    <path class="tree" d="M12 17V9M12 9c-2-1.5-4.5-1-5.5.5M12 9c2-1.5 4.5-1 5.5.5M12 9c-.5-2 .5-3.5 2-4" />
  {:else if kind === 'cratera'}
    <ellipse class="w" cx="12" cy="14" rx="9" ry="5.5" />
    <ellipse class="dark" cx="12" cy="14.6" rx="5.4" ry="3" />
  {:else if kind === 'delta'}
    <path class="water" d="M12 3v7M12 10l-6 10M12 10l6 10M12 10v10M12 13l-3 7M12 13l3 7" />
  {:else if kind === 'canion'}
    <path class="w" d="M2 7h7l1 13H2ZM22 7h-7l-1 13h8Z" />
    <path class="water" d="M11 20c.3-4 .8-8 1-13 .2 5 .7 9 1 13" />
  {:else}
    <path class="w" d="M2 20 7 5l3 8 2-6 3 7 2-4 5 10Z" />
    <path class="water" d="M10 20c1-4 1.5-6 2-9 .5 3 1 5 2 9Z" />
  {/if}
</svg>

<style>
  svg { display: block; filter: drop-shadow(0 1px 1.5px #0009); }
  path, ellipse { stroke: #2b1d12; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
  .w { fill: #efe3c6; }
  .dark { fill: #3a2a1e; }
  .hot { fill: #e2572b; }
  .smoke { fill: none; stroke: #8f8478; }
  .spray { fill: none; stroke: #4c8fc2; }
  .water { fill: #6aa8d0; }
  .tree { fill: none; stroke: #3d6b2f; stroke-width: 1.6; }
</style>
