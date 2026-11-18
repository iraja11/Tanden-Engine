<script lang="ts">
  import { onMount } from 'svelte';
  import { HOME_PROPS, LIMITS, MOVE_AREAS, homeMoveById, type HomeMove } from '@tanden/core';
  import { back } from '../back';
  import Figura from './Figura.svelte';

  // Detalhe de um exercício: animação, passo a passo e variações.
  let { move, onclose, onpick }: { move: HomeMove; onclose: () => void; onpick: (m: HomeMove) => void } = $props();

  const LEVELS = ['Iniciante', 'Intermediário', 'Avançado'];
  const easier = $derived(move.easier ? homeMoveById(move.easier) : undefined);
  const harder = $derived(move.harder ? homeMoveById(move.harder) : undefined);
  const propNames = $derived((move.props ?? []).map((p) => HOME_PROPS.find((x) => x.id === p)?.label ?? p));
  const avoidNames = $derived((move.avoid ?? []).map((l) => LIMITS.find((x) => x.id === l)?.label.toLowerCase() ?? l));

  onMount(() => back.layer(onclose));
</script>

<div class="t-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="t-sheet" role="dialog" aria-modal="true" aria-label={move.name}>
    <h2>{move.name}</h2>
    <div class="fig"><Figura fig={move.fig} label="Demonstração de {move.name}" /></div>
    <p class="meta">
      {MOVE_AREAS.find((a) => a.id === move.area)?.label} · {LEVELS[move.level - 1]}{move.sides ? ' · um lado de cada vez' : ''}{move.noisy ? ' · tem impacto' : ' · sem impacto'}
    </p>
    <ol>{#each move.steps as s (s)}<li>{s}</li>{/each}</ol>
    {#if move.tip}<p class="tip"><b>Cuidado:</b> {move.tip}</p>{/if}
    {#if propNames.length}<p class="tip"><b>Você vai usar:</b> {propNames.join(', ')}</p>{/if}
    {#if avoidNames.length}<p class="tip"><b>Evite se sentir dor em:</b> {avoidNames.join(', ')}</p>{/if}
    {#if easier || harder}
      <div class="vars">
        {#if easier}<button class="t-btn t-btn--sm" onclick={() => onpick(easier)}>Mais fácil: {easier.name}</button>{/if}
        {#if harder}<button class="t-btn t-btn--sm" onclick={() => onpick(harder)}>Mais difícil: {harder.name}</button>{/if}
      </div>
    {/if}
    <div class="t-actions"><button class="t-btn t-btn--quiet" onclick={onclose}>Fechar</button></div>
  </div>
</div>

<style>
  .fig { height: 180px; border-radius: var(--r-md); background: var(--void); padding: var(--sp-2); }
  .meta { margin: 0; font-size: var(--fs-sm); color: var(--muted); }
  ol { margin: 0; padding-left: 20px; display: grid; gap: var(--sp-1); font-size: var(--fs-md); line-height: 1.5; color: var(--silver); }
  .tip { margin: 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--muted); }
  .tip b { color: var(--silver); font-weight: 600; }
  .vars { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .vars .t-btn { height: auto; min-height: var(--h-sm); white-space: normal; text-align: left; }
</style>
