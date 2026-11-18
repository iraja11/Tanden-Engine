<script lang="ts">
  import { MEAL_KINDS, RECIPES, fmtFactor, foldText, mealLabel, recipeAllowed, recipeNutrients, type MealKind, type MealSuggestion, type Recipe } from '@tanden/core';
  import Icon from '../ui/Icon.svelte';
  import RecipeSheet from './RecipeSheet.svelte';
  import { alimentacao as a } from './alimentacao.svelte';

  // Sugestões: o que comer agora, com o que há em casa, e todas as receitas.
  let meal = $state<MealKind>(a.mealNow);
  let pantryText = $state('');
  let quick = $state(false);
  let find = $state('');
  let open = $state<{ recipe: Recipe; factor: number } | null>(null);

  const pantry = $derived(pantryText.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean));
  const list = $derived<MealSuggestion[]>(a.suggest({ meal, pantry, maxMinutes: quick ? 15 : undefined, limit: 6 }));

  const allowed = $derived(RECIPES.filter((r) => recipeAllowed(r, a.profile.restrictions, a.profile.dislikes)));
  const found = $derived.by(() => {
    const q = foldText(find);
    return q ? allowed.filter((r) => foldText(r.name).includes(q)).slice(0, 12) : [];
  });
</script>

<section class="t-card ask">
  <div class="t-scroll-x meals" role="radiogroup" aria-label="Refeição">
    {#each MEAL_KINDS as m (m.id)}
      <button class="t-chip" class:on={meal === m.id} role="radio" aria-checked={meal === m.id} onclick={() => (meal = m.id)}>{m.label}</button>
    {/each}
  </div>
  <label class="pantry">
    <span class="t-eyebrow">O que você tem em casa?</span>
    <input class="t-input" placeholder="ovo, arroz, tomate (opcional)" bind:value={pantryText} />
  </label>
  <label class="sw"><input type="checkbox" bind:checked={quick} /> Só receitas de até 15 minutos</label>
</section>

{#if list.length}
  <div class="cards">
    {#each list as s (s.recipe.id)}
      <button class="t-card sug" onclick={() => (open = { recipe: s.recipe, factor: s.factor })}>
        <b>{s.recipe.name}{#if s.factor !== 1}<em> ×{fmtFactor(s.factor)}</em>{/if}</b>
        <span class="nums">{Math.round(s.nutrients.kcal)} kcal · {Math.round(s.nutrients.p)} g de proteína · {s.recipe.minutes} min</span>
        <ul>{#each s.reasons as r (r)}<li><Icon name="certo" size={14} />{r}</li>{/each}</ul>
        {#if s.missing.length}<small>Falta: {s.missing.join(', ')}</small>{/if}
      </button>
    {/each}
  </div>
{:else}
  <p class="none">Nada combina com esses filtros em {mealLabel(meal).toLowerCase()}. Tente tirar um filtro ou acrescentar ingredientes.</p>
{/if}

<section class="book">
  <h3>Todas as receitas <small>{allowed.length}</small></h3>
  <label class="t-search"><Icon name="buscar" size={15} /><input class="t-input" placeholder="Buscar receita" aria-label="Buscar receita" bind:value={find} /></label>
  {#if found.length}
    <div class="found">
      {#each found as r (r.id)}
        <button class="t-row" onclick={() => (open = { recipe: r, factor: 1 })}>
          <span>{r.name}<small>{r.minutes} min · {Math.round(recipeNutrients(r).kcal)} kcal</small></span>
        </button>
      {/each}
    </div>
  {:else if find.trim()}
    <p class="none">Nenhuma receita com esse nome.</p>
  {/if}
</section>

{#if open}<RecipeSheet recipe={open.recipe} factor={open.factor} {meal} onclose={() => (open = null)} />{/if}

<style>
  .ask { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-3); }
  .pantry { display: grid; gap: var(--sp-1); }
  .pantry input { width: 100%; }
  .sw { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--silver); }
  .sw input { accent-color: var(--ember); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: var(--sp-3); }
  .sug { display: grid; align-content: start; gap: var(--sp-1); text-align: left; color: var(--ink); transition: border-color var(--dur) var(--ease); }
  .sug:hover { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .sug b { font: 600 15px/1.3 var(--f-display); }
  .sug em { font: normal 12px var(--f-mono); color: var(--muted); }
  .nums { font: 11.5px var(--f-mono); color: var(--muted); }
  .sug ul { list-style: none; margin: var(--sp-1) 0 0; padding: 0; display: grid; gap: 3px; font-size: var(--fs-sm); color: var(--silver); }
  .sug li { display: flex; gap: var(--sp-1); align-items: flex-start; }
  .sug li :global(svg) { margin-top: 2px; color: var(--ok); }
  .sug small { font-size: 12px; color: var(--muted); }
  .none { color: var(--muted); font-size: var(--fs-md); }
  .book { display: grid; gap: var(--sp-2); margin-top: var(--sp-5); }
  .book h3 { margin: 0; font: 600 11px/1.2 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .book h3 small { font-family: var(--f-mono); letter-spacing: 0; }
  .found { display: grid; gap: 2px; }
</style>
