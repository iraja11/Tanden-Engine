<script lang="ts">
  import { WEEKDAY_NAMES, addDays, fmtFactor, isoWeek, mealLabel, menuPath, recipeById, recipeNutrients, type MealKind, type MenuItem, type Recipe } from '@tanden/core';
  import { ask } from '../ask.svelte';
  import Icon from '../ui/Icon.svelte';
  import RecipeSheet from './RecipeSheet.svelte';
  import { alimentacao as a } from './alimentacao.svelte';

  // Planejamento: o cardápio da semana, com troca de pratos e "comi isto".
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  let open = $state<{ recipe: Recipe; factor: number; meal: MealKind } | null>(null);
  const thisWeek = $derived(isoWeek(a.day).monday);
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  async function generate() {
    if (a.hasMenu && !(await ask.confirm('Refazer o cardápio desta semana?', { detail: 'Os pratos atuais serão substituídos. O que já foi marcado na lista de compras fica.', ok: 'Refazer' }))) return;
    a.generate();
  }

  async function write(dayIndex: number, it: MenuItem) {
    const name = await ask.text(`${mealLabel(it.meal)} de ${WEEKDAY_NAMES[dayIndex]}`, it.name, { ok: 'Salvar', placeholder: 'O que vai ter?' });
    if (name) a.setDish(dayIndex, it.meal, name);
  }

  const kcalOf = (it: MenuItem) => {
    const r = it.recipeId ? recipeById(it.recipeId) : undefined;
    return r ? Math.round(recipeNutrients(r, it.factor).kcal) : null;
  };
  const dayKcal = (items: MenuItem[]) => items.reduce((s, it) => s + (kcalOf(it) ?? 0), 0);
</script>

<div class="bar">
  <button class="t-btn t-btn--quiet t-btn--icon" aria-label="Semana anterior" onclick={() => a.goWeek(-1)}><Icon name="voltar" /></button>
  <b>{dm(a.monday)} a {dm(addDays(a.monday, 6))}</b>
  <button class="t-btn t-btn--quiet t-btn--icon next" aria-label="Próxima semana" onclick={() => a.goWeek(1)}><Icon name="voltar" /></button>
  {#if a.monday !== thisWeek}<button class="t-btn t-btn--sm" onclick={() => a.goWeek(Math.round((Date.parse(thisWeek) - Date.parse(a.monday)) / 6048e5))}>Esta semana</button>{/if}
  <span class="sp"></span>
  {#if a.hasMenu}<button class="t-btn t-btn--quiet t-btn--sm" onclick={() => onOpenNote(menuPath(a.monday))}><Icon name="nota" size={15} />Nota</button>{/if}
  <button class="t-btn t-btn--primary" onclick={generate}><Icon name="faisca" size={16} />{a.hasMenu ? 'Refazer' : 'Montar cardápio'}</button>
</div>

{#if !a.hasMenu}
  <section class="t-card empty">
    <Icon name="calendario" size={28} />
    <h3>Nenhum cardápio nesta semana</h3>
    <p>O Tanden monta os sete dias pela sua meta de {a.targets.kcal} kcal, respeita suas restrições, varia os pratos e já prepara a lista de compras.</p>
  </section>
{:else}
  <div class="week">
    {#each a.menu.days as d, i (d.day)}
      <section class="t-card day" class:today={d.day === a.day}>
        <header>
          <h3>{WEEKDAY_NAMES[i]} <small>{dm(d.day)}</small></h3>
          <small class="kcal">{dayKcal(d.items)} kcal</small>
        </header>
        <ul>
          {#each d.items as it (it.meal)}
            {@const r = it.recipeId ? recipeById(it.recipeId) : undefined}
            {@const done = a.eaten(d.day, it)}
            <li class:done>
              <button class="eat" class:on={done} disabled={done} aria-label={done ? `${it.name} registrado` : `Comi ${it.name}`} title={done ? 'Já está no diário' : 'Comi isto'} onclick={() => a.eat(d.day, it)}><Icon name="certo" size={14} /></button>
              <div class="dish">
                <small>{mealLabel(it.meal)}</small>
                {#if r}
                  <button class="name" onclick={() => (open = { recipe: r, factor: it.factor, meal: it.meal })}>{it.name}{#if it.factor !== 1}<em> ×{fmtFactor(it.factor)}</em>{/if}</button>
                {:else}
                  <button class="name" onclick={() => write(i, it)}>{it.name}</button>
                {/if}
              </div>
              <button class="t-btn t-btn--quiet t-btn--sm t-btn--icon" aria-label="Escrever outro prato" title="Escrever outro prato" onclick={() => write(i, it)}><Icon name="escrita" size={14} /></button>
              <button class="t-btn t-btn--quiet t-btn--sm t-btn--icon" aria-label="Sugerir outro prato" title="Sugerir outro prato" onclick={() => a.swap(i, it.meal)}><Icon name="trocar" size={14} /></button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

{#if open}<RecipeSheet recipe={open.recipe} factor={open.factor} meal={open.meal} onclose={() => (open = null)} />{/if}

<style>
  .bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-1) var(--sp-2); margin-bottom: var(--sp-3); }
  .bar b { font: 600 var(--fs-md) var(--f-mono); white-space: nowrap; }
  .bar .next :global(svg) { transform: rotate(180deg); }
  .sp { flex: 1; }
  .empty { display: grid; justify-items: center; gap: var(--sp-2); padding: var(--sp-8) var(--sp-4); text-align: center; color: var(--muted); }
  .empty h3 { margin: 0; font: 600 var(--fs-lg) var(--f-display); color: var(--ink); }
  .empty p { margin: 0; max-width: 46ch; line-height: 1.5; font-size: var(--fs-md); }
  .week { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: var(--sp-3); align-items: start; }
  .day.today { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .day header { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-1); }
  h3 { margin: 0; font: 600 var(--fs-md) var(--f-display); color: var(--ink); }
  h3 small { font: 11.5px var(--f-mono); color: var(--muted); }
  .kcal { font: 11.5px var(--f-mono); color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  li { display: flex; align-items: center; gap: var(--sp-1); padding: 5px 0; border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  li.done .name { color: var(--muted); }
  .eat { flex: none; display: grid; place-items: center; width: 26px; height: 26px; margin-right: var(--sp-1); border: 1.5px solid var(--line); border-radius: 50%; background: none; color: transparent; }
  .eat:hover:not(:disabled) { border-color: var(--ember); color: var(--ember); }
  .eat.on { background: var(--ok); border-color: var(--ok); color: var(--void); }
  .dish { flex: 1; min-width: 0; display: grid; }
  .dish small { font-size: 11px; color: var(--muted); }
  .name { border: 0; background: none; padding: 0; text-align: left; color: var(--ink); font: 500 13.5px/1.3 var(--f-body); overflow-wrap: anywhere; }
  .name:hover { color: var(--ember-soft); }
  .name em { font: normal 11.5px var(--f-mono); color: var(--muted); }
</style>
