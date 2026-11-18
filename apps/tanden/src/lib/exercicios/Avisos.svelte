<script lang="ts">
  import { infoRaridade } from '@tanden/core';
  import { pop } from '../motion';
  import { exercicios as ex } from './exercicios.svelte';

  // Conquistas e marcos da sequência recém-obtidos. Somem sozinhos.
  let { onopen }: { onopen: () => void } = $props();
  const rays = Array.from({ length: 10 }, (_, i) => i * 36);
</script>

<div class="stack" role="status" aria-live="polite">
  {#each ex.notices as n (n.id)}
    {@const color = 'badge' in n ? infoRaridade(n.badge.rarity).cor : 'var(--ember)'}
    {@const big = 'days' in n || n.badge.rarity === 'epica' || n.badge.rarity === 'lendaria'}
    <button class="note" style:--r={color} in:pop onclick={() => { ex.dismiss(n.id); onopen(); }}>
      {#if big}<span class="burst" aria-hidden="true">{#each rays as g (g)}<i style:rotate="{g}deg"></i>{/each}</span>{/if}
      {#if 'badge' in n}
        <span class="glyph" aria-hidden="true">{n.badge.glyph}</span>
        <span class="txt"><small>Conquista · {infoRaridade(n.badge.rarity).label}</small><b>{n.badge.name}</b><span>{n.badge.desc}</span></span>
      {:else}
        <span class="glyph" aria-hidden="true">🔥</span>
        <span class="txt"><small>Sequência</small><b>{n.days} dias seguidos</b><span>Amanhã tem mais. A chama é sua.</span></span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .stack { position: absolute; right: var(--sp-4); bottom: var(--sp-4); z-index: 12; width: min(340px, calc(100% - 32px)); display: grid; gap: var(--sp-2); pointer-events: none; }
  .note { position: relative; overflow: hidden; pointer-events: auto; display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); text-align: left; color: var(--ink);
    border: 1px solid color-mix(in srgb, var(--r) 60%, var(--line)); border-radius: var(--r-lg); box-shadow: var(--elev-2), 0 0 26px -10px var(--r);
    background: linear-gradient(120deg, color-mix(in srgb, var(--r) 16%, var(--surface)), var(--surface) 62%); }
  .glyph { flex: none; width: 40px; height: 40px; display: grid; place-items: center; font-size: 20px; border-radius: 50%; background: color-mix(in srgb, var(--r) 14%, transparent); }
  .txt { display: grid; gap: 1px; min-width: 0; font-size: 12.5px; line-height: 1.35; color: var(--muted); }
  .txt small { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--r); }
  .txt b { font: 600 15px var(--f-display); color: var(--ink); }
  .burst { position: absolute; left: 32px; top: 50%; pointer-events: none; }
  .burst i { position: absolute; left: 0; top: 0; width: 2px; height: 16px; background: var(--r); transform-origin: 0 0; animation: ray .9s ease-out both; }
  @keyframes ray { 0% { opacity: 0; scale: 1 .2; } 30% { opacity: 1; } 100% { opacity: 0; scale: 1 3; } }
  @media (prefers-reduced-motion: reduce) { .burst { display: none; } }
  /* no celular, acima da barra de abas e no máximo dois */
  @container exercicios (max-width: 640px) { .stack { right: 12px; left: 12px; width: auto; bottom: 76px; } .note:nth-child(n + 3) { display: none; } }
</style>
