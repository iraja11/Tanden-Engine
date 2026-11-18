<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { MEAL_KINDS, nutrientsOf, recipeByName, searchFoods, type FrequentFood, type MealKind } from '@tanden/core';
  import { back } from '../back';
  import Icon from '../ui/Icon.svelte';
  import { alimentacao, type AnyFood } from './alimentacao.svelte';

  // Folha para registrar o que foi comido: busca, porção e refeição.
  let { meal: initial, onclose }: { meal: MealKind; onclose: () => void } = $props();

  let meal = $state<MealKind>(untrack(() => initial));
  let query = $state('');
  let picked = $state<AnyFood | null>(null);
  let grams = $state(100);
  let input = $state<HTMLInputElement>();

  const results = $derived(searchFoods(query, alimentacao.foods, 12));
  const frequent = $derived(alimentacao.frequent(meal, 6));
  const preview = $derived(picked ? nutrientsOf(picked, grams) : null);
  const PORTIONS = [0.5, 1, 1.5, 2, 3];
  const portionLabel = (n: number) => (n === 0.5 ? '½' : n === 1.5 ? '1½' : String(n));

  onMount(() => {
    input?.focus();
    return back.layer(onclose);
  });

  function pick(f: AnyFood) {
    picked = f;
    grams = f.portion.grams;
  }

  function save() {
    if (!picked || !(grams > 0)) return;
    alimentacao.addFood(picked, grams, meal);
    onclose();
  }

  function repeat(f: FrequentFood) {
    alimentacao.addFrequent(f, meal);
    onclose();
  }

  function free() {
    alimentacao.addFree(query, meal);
    onclose();
  }

  // uma receita conhecida digitada por extenso entra com os números dela
  function saveTyped() {
    const r = recipeByName(query);
    if (r) {
      alimentacao.addRecipe(r, 1, meal);
      onclose();
    } else free();
  }
</script>

<div class="t-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="t-sheet add" role="dialog" aria-modal="true" aria-label="Registrar alimento">
    <h2>Registrar alimento</h2>

    <div class="t-scroll-x meals" role="radiogroup" aria-label="Refeição">
      {#each MEAL_KINDS as m (m.id)}
        <button class="t-chip" class:on={meal === m.id} role="radio" aria-checked={meal === m.id} onclick={() => (meal = m.id)}>{m.label}</button>
      {/each}
    </div>

    {#if picked}
      <div class="picked">
        <button class="t-btn t-btn--quiet t-btn--sm" onclick={() => (picked = null)}><Icon name="voltar" size={15} />Trocar</button>
        <b>{picked.name}</b>
      </div>
      <p class="t-eyebrow">Quanto você comeu</p>
      <div class="portions">
        {#each PORTIONS as n (n)}
          <button class="t-chip" class:on={grams === picked.portion.grams * n} onclick={() => (grams = picked!.portion.grams * n)}>{portionLabel(n)}</button>
        {/each}
        <span class="unit">{picked.portion.label} ({picked.portion.grams} g)</span>
      </div>
      <label class="grams">Gramas
        <input class="t-input" type="number" min="1" max="3000" inputmode="decimal" bind:value={grams} />
      </label>
      {#if preview}
        <p class="preview"><b>{Math.round(preview.kcal)} kcal</b> · proteína {Math.round(preview.p)} g · carboidrato {Math.round(preview.c)} g · gordura {Math.round(preview.g)} g · fibra {Math.round(preview.f)} g</p>
      {/if}
      <div class="t-actions">
        <button class="t-btn t-btn--quiet" onclick={onclose}>Cancelar</button>
        <button class="t-btn t-btn--primary" disabled={!(grams > 0)} onclick={save}>Registrar</button>
      </div>
    {:else}
      <label class="t-search"><Icon name="buscar" size={15} />
        <input bind:this={input} class="t-input" placeholder="Arroz, banana, pão de queijo…" aria-label="Buscar alimento" bind:value={query} />
      </label>
      <div class="list">
        {#if query.trim()}
          {#each results as f (f.id)}
            <button class="t-row" onclick={() => pick(f)}>
              <span>{f.name}<small>{f.portion.label} ({f.portion.grams} g) · {Math.round((f.kcal * f.portion.grams) / 100)} kcal</small></span>
            </button>
          {/each}
          <button class="t-row" onclick={saveTyped}>
            <Icon name="escrita" size={20} />
            <span>Anotar "{query.trim()}"<small>{recipeByName(query) ? 'Receita do Tanden' : 'Sem calorias: fica só o registro'}</small></span>
          </button>
        {:else if frequent.length}
          <p class="t-eyebrow">Você costuma comer</p>
          {#each frequent as f (f.name)}
            <button class="t-row" onclick={() => repeat(f)}>
              <span>{f.name}<small>{f.grams ? `${Math.round(f.grams)} g · ` : ''}{Math.round(f.nutrients.kcal)} kcal</small></span>
              <Icon name="mais_um" size={18} />
            </button>
          {/each}
        {:else}
          <p class="hint">Digite o nome do alimento. O que você registrar com frequência aparece aqui para repetir com um toque.</p>
        {/if}
      </div>
      <div class="t-actions"><button class="t-btn t-btn--quiet" onclick={onclose}>Fechar</button></div>
    {/if}
  </div>
</div>

<style>
  .add { align-content: start; }
  .meals { padding-bottom: 2px; }
  .list { display: grid; gap: 2px; max-height: min(46vh, 340px); overflow-y: auto; min-height: 60px; }
  .list .t-eyebrow { margin: var(--sp-1) 0; }
  .hint { margin: 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.5; }
  .picked { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
  .picked b { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .portions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
  .unit { font-size: var(--fs-sm); color: var(--muted); }
  .grams { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--silver); }
  .grams input { width: 110px; }
  .preview { margin: 0; font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; }
  .preview b { color: var(--ink); font-family: var(--f-mono); }
</style>
