<script lang="ts">
  import type { Entity, World } from '@tanden/core';
  import FaccoesSim from './FaccoesSim.svelte';
  import VidasView from './vidas/VidasView.svelte';

  // Simulação do mundo em duas escalas: a vida das pessoas (mês a mês:
  // romance, família, brigas, segredos) e o jogo das facções (ano a ano).
  let { world, byPath, onopen, onOpenNote, onregras }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    onOpenNote: (path: string) => void;
    onregras: () => void;
  } = $props();

  let modo = $state<'vidas' | 'faccoes'>('vidas');
</script>

<div class="simwrap">
  <div class="modos" role="tablist" aria-label="Escala da simulação">
    <button role="tab" aria-selected={modo === 'vidas'} class:on={modo === 'vidas'} onclick={() => (modo = 'vidas')}>👥 Vidas <small>mês a mês</small></button>
    <button role="tab" aria-selected={modo === 'faccoes'} class:on={modo === 'faccoes'} onclick={() => (modo = 'faccoes')}>⚑ Facções <small>ano a ano</small></button>
  </div>
  {#if modo === 'vidas'}
    <VidasView {world} {onopen} {onOpenNote} {onregras} />
  {:else}
    <FaccoesSim {world} {byPath} {onopen} />
  {/if}
</div>

<style>
  .simwrap { display: grid; gap: 12px; }
  .modos { display: inline-flex; gap: 4px; padding: 3px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); justify-self: start; }
  .modos button { border: 0; background: none; color: var(--muted); padding: 6px 14px; border-radius: 9px; font: 600 13px var(--f-display); }
  .modos button small { font: 11px var(--f-mono); opacity: .75; margin-left: 4px; }
  .modos button.on { background: color-mix(in srgb, var(--ember) 18%, var(--surface-2)); color: var(--ink); }
</style>
