<script lang="ts">
  // Anel de completude da ficha (0 a 1). Fecha em verde quando a ficha está viva.
  let { value, size = 22, title = '' }: { value: number; size?: number; title?: string } = $props();
  const r = 9;
  const len = 2 * Math.PI * r;
  const pct = $derived(Math.round(value * 100));
</script>

<svg class="ring" class:full={value >= 0.85} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={`${pct}% preenchida`}>
  <title>{title || `${pct}% preenchida`}</title>
  <circle cx="12" cy="12" r={r} class="bg" />
  <circle cx="12" cy="12" r={r} class="fg" stroke-dasharray={len} stroke-dashoffset={len * (1 - value)} />
</svg>

<style>
  .ring { flex: none; transform: rotate(-90deg); }
  circle { fill: none; stroke-width: 3.4; }
  .bg { stroke: color-mix(in srgb, var(--muted) 30%, transparent); }
  .fg { stroke: var(--ember); stroke-linecap: round; transition: stroke-dashoffset .6s var(--ease, ease), stroke .3s; }
  .full .fg { stroke: var(--ok); filter: drop-shadow(0 0 3px var(--ok)); }
</style>
