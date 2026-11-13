<script lang="ts">
  import CalcView from './CalcView.svelte';
  import Calculator from './Calculator.svelte';
  import FinanceView from './FinanceView.svelte';
  import { calcPrefs, type CalcMode } from './calc.svelte';
  import { sound } from '../sound.svelte';

  /*
   * Aba Cálculo: três modos no mesmo lugar. Folhas (contas linha a linha com
   * gráfico), Calculadora (uma conta por vez, científica, com Σ, ∫ e d/dx) e
   * Financeira (investimento, financiamento, VPL/TIR, taxas).
   */

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const MODES: { id: CalcMode; label: string; title: string }[] = [
    { id: 'folhas', label: 'Folhas', title: 'Folhas de cálculo com gráfico' },
    { id: 'calculadora', label: 'Calculadora', title: 'Calculadora científica: uma conta por vez' },
    { id: 'financas', label: 'Financeira', title: 'Juros, financiamento, VPL, TIR e taxas' },
  ];

  function go(m: CalcMode) {
    if (m !== calcPrefs.mode) sound.play('tick');
    calcPrefs.set({ mode: m });
  }
</script>

<div class="tab">
  <header>
    <div class="t-seg" role="tablist" aria-label="Modo do cálculo">
      {#each MODES as m (m.id)}
        <button role="tab" aria-selected={calcPrefs.mode === m.id} class:on={calcPrefs.mode === m.id} title={m.title} onclick={() => go(m.id)}>{m.label}</button>
      {/each}
    </div>
  </header>
  {#if calcPrefs.mode === 'folhas'}
    <CalcView {onOpenNote} />
  {:else if calcPrefs.mode === 'calculadora'}
    <Calculator />
  {:else}
    <FinanceView />
  {/if}
</div>

<style>
  .tab { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; padding: var(--sp-2) var(--gutter); border-bottom: 1px solid var(--line); }
  .tab > :global(:not(header)) { flex: 1; min-height: 0; }
  @media (max-width: 720px) {
    header .t-seg { width: 100%; }
    header .t-seg > button { flex: 1; justify-content: center; }
  }
</style>
