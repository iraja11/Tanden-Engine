<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { MEAL_KINDS, fmtFactor, foodById, recipeNutrients, type MealKind, type Recipe } from '@tanden/core';
  import { back } from '../back';
  import { alimentacao } from './alimentacao.svelte';

  // Receita aberta: ingredientes na porção escolhida, modo de fazer e "comi isto".
  let { recipe, factor: initial = 1, meal: initialMeal, onclose }: { recipe: Recipe; factor?: number; meal: MealKind; onclose: () => void } = $props();

  let factor = $state(untrack(() => initial));
  let meal = $state<MealKind>(untrack(() => (recipe.meals.includes(initialMeal) ? initialMeal : recipe.meals[0]!)));
  const n = $derived(recipeNutrients(recipe, factor));
  const FACTORS = [0.75, 1, 1.25, 1.5, 2];

  onMount(() => back.layer(onclose));

  function eat() {
    alimentacao.addRecipe(recipe, factor, meal, alimentacao.day);
    onclose();
  }
</script>

<div class="t-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="t-sheet" role="dialog" aria-modal="true" aria-label={recipe.name}>
    <h2>{recipe.name}</h2>
    <p class="meta">{recipe.minutes} min · {Math.round(n.kcal)} kcal · proteína {Math.round(n.p)} g · fibra {Math.round(n.f)} g</p>

    <p class="t-eyebrow">Porção</p>
    <div class="row">
      {#each FACTORS as f (f)}<button class="t-chip" class:on={factor === f} onclick={() => (factor = f)}>×{fmtFactor(f)}</button>{/each}
    </div>

    <p class="t-eyebrow">Ingredientes</p>
    <ul>
      {#each recipe.items as [id, g] (id)}
        <li><span>{foodById(id)?.name ?? id}</span><b>{Math.round(g * factor)} g</b></li>
      {/each}
    </ul>

    <p class="t-eyebrow">Como fazer</p>
    <ol>{#each recipe.steps as s (s)}<li>{s}</li>{/each}</ol>

    <label class="meal">Refeição
      <select class="t-select" bind:value={meal}>
        {#each MEAL_KINDS as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
      </select>
    </label>
    <div class="t-actions">
      <button class="t-btn t-btn--quiet" onclick={onclose}>Fechar</button>
      <button class="t-btn t-btn--primary" onclick={eat}>Comi isto</button>
    </div>
  </div>
</div>

<style>
  .meta { margin: 0; font-size: var(--fs-sm); color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  ul, ol { margin: 0; padding: 0; display: grid; gap: var(--sp-1); font-size: var(--fs-md); color: var(--silver); }
  ul { list-style: none; }
  ol { padding-left: 20px; line-height: 1.5; }
  ul li { display: flex; justify-content: space-between; gap: var(--sp-3); }
  ul b { font: 500 var(--fs-sm) var(--f-mono); color: var(--muted); white-space: nowrap; }
  .meal { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--silver); }
  .meal select { flex: 1; }
</style>
