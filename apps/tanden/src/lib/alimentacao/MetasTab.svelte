<script lang="ts">
  import { ACTIVITIES, FOOD_GOALS, FOOD_NOTE, MEAL_KINDS, RESTRICTIONS, foodTargets, profileComplete, type FoodProfile, type MealKind, type Restriction } from '@tanden/core';
  import { files } from '../files/files.svelte';
  import { alimentacao as a } from './alimentacao.svelte';

  // Perfil, metas e alimentos próprios.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  let form = $state<FoodProfile>(structuredClone($state.snapshot(a.profile)) as FoodProfile);
  let dislikes = $state(a.profile.dislikes.join(', '));
  const preview = $derived(foodTargets({ ...form }));
  const blank = { name: '', grams: 100, kcal: 0, p: 0, c: 0, g: 0, f: 0 };
  let food = $state({ ...blank });

  const toggle = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const numOrNull = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  function toggleMeal(m: MealKind) {
    const next = toggle(form.meals, m);
    if (next.length) form.meals = MEAL_KINDS.map((x) => x.id).filter((x) => next.includes(x));
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (form.age !== null && form.age < 18) {
      files.say('O cálculo de metas vale para adultos. Para menores de 18 anos, procure um nutricionista.', { error: true });
      return;
    }
    const p = $state.snapshot(form) as FoodProfile;
    a.saveProfile({ ...p, dislikes: dislikes.split(',').map((x) => x.trim()).filter(Boolean) });
    files.say('Perfil salvo.');
  }

  function addFood(e: SubmitEvent) {
    e.preventDefault();
    if (!food.name.trim() || !(food.grams > 0)) return;
    a.addCustom($state.snapshot(food));
    food = { ...blank };
  }
</script>

<div class="layout">
  <form class="t-card profile" onsubmit={save}>
    <h3>Sobre você</h3>
    <div class="fields">
      <label>Base do cálculo
        <select class="t-select" bind:value={form.base}>
          <option value={null}>Escolher</option><option value="feminino">Feminina</option><option value="masculino">Masculina</option>
        </select>
      </label>
      <label>Idade<input class="t-input" type="number" min="18" max="110" value={form.age ?? ''} oninput={(e) => (form.age = numOrNull(e.currentTarget.value))} /></label>
      <label>Altura (cm)<input class="t-input" type="number" min="120" max="230" value={form.heightCm ?? ''} oninput={(e) => (form.heightCm = numOrNull(e.currentTarget.value))} /></label>
      <label>Peso (kg)<input class="t-input" type="number" min="35" max="300" step="0.1" value={form.weightKg ?? ''} oninput={(e) => (form.weightKg = numOrNull(e.currentTarget.value))} /></label>
    </div>

    <p class="t-eyebrow">Atividade no dia a dia</p>
    <div class="chips">{#each ACTIVITIES as x (x.id)}<button type="button" class="t-chip" class:on={form.activity === x.id} title={x.hint} onclick={() => (form.activity = x.id)}>{x.label}</button>{/each}</div>
    <p class="t-eyebrow">Objetivo</p>
    <div class="chips">{#each FOOD_GOALS as x (x.id)}<button type="button" class="t-chip" class:on={form.goal === x.id} onclick={() => (form.goal = x.id)}>{x.label}</button>{/each}</div>
    <p class="t-eyebrow">Refeições do dia</p>
    <div class="chips">{#each MEAL_KINDS as x (x.id)}<button type="button" class="t-chip" class:on={form.meals.includes(x.id)} aria-pressed={form.meals.includes(x.id)} onclick={() => toggleMeal(x.id)}>{x.label}</button>{/each}</div>
    <p class="t-eyebrow">Restrições</p>
    <div class="chips">{#each RESTRICTIONS as x (x.id)}<button type="button" class="t-chip" class:on={form.restrictions.includes(x.id)} aria-pressed={form.restrictions.includes(x.id)} onclick={() => (form.restrictions = toggle<Restriction>(form.restrictions, x.id))}>{x.label}</button>{/each}</div>

    <div class="fields">
      <label class="wide">Não como (separe por vírgula)<input class="t-input" placeholder="jiló, fígado" bind:value={dislikes} /></label>
      <label>Pessoas na casa<input class="t-input" type="number" min="1" max="12" bind:value={form.people} /></label>
      <label>Meta própria (kcal)<input class="t-input" type="number" min="1200" max="6000" placeholder="automática" value={form.manualKcal ?? ''} oninput={(e) => (form.manualKcal = numOrNull(e.currentTarget.value))} /></label>
      <label>Meta de proteína (g)<input class="t-input" type="number" min="20" max="300" placeholder="automática" value={form.manualProtein ?? ''} oninput={(e) => (form.manualProtein = numOrNull(e.currentTarget.value))} /></label>
    </div>
    <div class="end">
      <button type="button" class="t-btn t-btn--quiet" onclick={() => onOpenNote(FOOD_NOTE)}>Abrir a nota</button>
      <button class="t-btn t-btn--primary">Salvar</button>
    </div>
  </form>

  <div class="col">
    <section class="t-card">
      <h3>Suas metas por dia</h3>
      <p class="big"><b>{preview.kcal}</b> kcal</p>
      <dl>
        <div><dt>Proteína</dt><dd>{preview.p} g</dd></div>
        <div><dt>Carboidrato</dt><dd>{preview.c} g</dd></div>
        <div><dt>Gordura</dt><dd>{preview.g} g</dd></div>
        <div><dt>Fibra</dt><dd>{preview.f} g</dd></div>
        {#if preview.bmr}<div><dt>Gasto em repouso</dt><dd>{preview.bmr} kcal</dd></div>{/if}
        {#if preview.tdee}<div><dt>Gasto no dia</dt><dd>{preview.tdee} kcal</dd></div>{/if}
      </dl>
      <p class="hint">
        {#if !profileComplete(form) && form.manualKcal === null}Preencha base, idade, altura e peso para calcular. Até lá vale a referência geral de 2000 kcal.
        {:else}Estimativa pela fórmula de Mifflin-St Jeor. O Tanden não propõe comer abaixo do gasto em repouso.{/if}
        Não substitui um nutricionista. Em gestação, doença ou histórico de transtorno alimentar, procure acompanhamento antes de seguir metas.
      </p>
    </section>

    <form class="t-card custom" onsubmit={addFood}>
      <h3>Meus alimentos</h3>
      <p class="hint">Copie os números do rótulo para usar no diário.</p>
      <label class="wide">Nome<input class="t-input" placeholder="Iogurte da marca X" bind:value={food.name} /></label>
      <div class="nums">
        <label>Porção (g)<input class="t-input" type="number" min="1" step="any" bind:value={food.grams} /></label>
        <label>Calorias<input class="t-input" type="number" min="0" step="any" bind:value={food.kcal} /></label>
        <label>Proteína<input class="t-input" type="number" min="0" step="any" bind:value={food.p} /></label>
        <label>Carboidrato<input class="t-input" type="number" min="0" step="any" bind:value={food.c} /></label>
        <label>Gordura<input class="t-input" type="number" min="0" step="any" bind:value={food.g} /></label>
        <label>Fibra<input class="t-input" type="number" min="0" step="any" bind:value={food.f} /></label>
      </div>
      <div class="end"><button class="t-btn" disabled={!food.name.trim()}>Acrescentar</button></div>
      {#if a.custom.length}<ul>{#each a.custom as f (f.id)}<li>{f.name}<small>{Math.round((f.kcal * f.portion.grams) / 100)} kcal por {f.portion.grams} g</small></li>{/each}</ul>{/if}
    </form>
  </div>
</div>

<style>
  .layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--sp-3); align-items: start; }
  .col { display: grid; gap: var(--sp-3); min-width: 0; }
  .profile, .custom { display: grid; gap: var(--sp-3); }
  h3 { margin: 0; font: 600 11px/1.2 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: var(--sp-3); }
  .nums { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(96px, 100%), 1fr)); gap: var(--sp-2); }
  label { display: grid; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--silver); min-width: 0; }
  label :global(input), label :global(select) { width: 100%; }
  .wide { grid-column: 1 / -1; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: calc(var(--sp-2) * -1); }
  .end { display: flex; justify-content: flex-end; gap: var(--sp-2); }
  .big { margin: var(--sp-2) 0; font-size: var(--fs-md); color: var(--muted); }
  .big b { font: 700 var(--fs-2xl) var(--f-display); color: var(--ink); }
  dl { margin: 0; display: grid; gap: var(--sp-1); }
  dl div { display: flex; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-md); }
  dt { color: var(--silver); }
  dd { margin: 0; font-family: var(--f-mono); font-size: var(--fs-sm); color: var(--ink); }
  .hint { margin: var(--sp-2) 0 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
  .custom .hint { margin: 0; }
  .custom ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-1); font-size: var(--fs-sm); }
  .custom li { display: flex; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
  .custom small { font-family: var(--f-mono); color: var(--muted); }
  @container alimentacao (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
