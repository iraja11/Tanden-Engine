<script lang="ts">
  import { MEAL_KINDS, addDays, mealLabel, type DiaryEntry, type MealKind } from '@tanden/core';
  import { saude } from '../saude/saude.svelte';
  import Icon from '../ui/Icon.svelte';
  import WeekBars from '../ui/WeekBars.svelte';
  import AddFoodSheet from './AddFoodSheet.svelte';
  import { alimentacao as a } from './alimentacao.svelte';

  // Acompanhamento: o dia em números, as refeições, as dicas e o peso.
  let adding = $state<MealKind | null>(null);
  let kg = $state('');

  const t = $derived(a.dayTotals);
  const goal = $derived(a.targets);
  const left = $derived(goal.kcal - t.kcal);
  const pct = $derived(Math.min(1, t.kcal / Math.max(1, goal.kcal)));
  const isToday = $derived(a.cursor === a.day);
  const R = 52;
  const C = 2 * Math.PI * R;

  const macros = $derived([
    { id: 'p', label: 'Proteína', value: t.p, goal: goal.p },
    { id: 'c', label: 'Carboidrato', value: t.c, goal: goal.c },
    { id: 'g', label: 'Gordura', value: t.g, goal: goal.g },
    { id: 'f', label: 'Fibra', value: t.f, goal: goal.f },
  ]);

  // as refeições do perfil, mais qualquer outra que tenha registro neste dia
  const meals = $derived(MEAL_KINDS.map((m) => m.id).filter((m) => a.profile.meals.includes(m) || a.dayEntries.some((e) => e.meal === m)));
  const ofMeal = (m: MealKind): DiaryEntry[] => a.dayEntries.filter((e) => e.meal === m);
  const kcalOf = (list: DiaryEntry[]) => Math.round(list.reduce((s, e) => s + e.kcal, 0));

  const dayTitle = $derived(isToday ? 'Hoje' : a.cursor === addDays(a.day, -1) ? 'Ontem' : new Date(`${a.cursor}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }));
  const bars = $derived(a.week.map((d) => ({
    key: d.day,
    label: new Date(`${d.day}T12:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' }),
    value: d.kcal,
    current: d.day === a.cursor,
    title: new Date(`${d.day}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' }),
  })));

  // peso: últimas 12 pesagens
  const series = $derived(a.weights.slice(-12));
  const line = $derived.by(() => {
    if (series.length < 2) return null;
    const vals = series.map((w) => w.kg);
    const lo = Math.min(...vals);
    const span = Math.max(0.5, Math.max(...vals) - lo);
    const pts = series.map((w, i) => ({ x: 6 + (i / (series.length - 1)) * 228, y: 50 - ((w.kg - lo) / span) * 40, w }));
    return { pts, path: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') };
  });
  const lastKg = $derived(series.at(-1)?.kg ?? a.profile.weightKg);
  const deltaKg = $derived(series.length >= 2 ? series.at(-1)!.kg - series[0]!.kg : null);
  const br = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

  function saveWeight(e: SubmitEvent) {
    e.preventDefault();
    const v = parseFloat(kg.replace(',', '.'));
    if (!(v >= 35 && v <= 300)) return;
    a.logWeight(v);
    kg = '';
  }
</script>

<div class="daybar">
  <button class="t-btn t-btn--quiet t-btn--icon" aria-label="Dia anterior" onclick={() => (a.cursor = addDays(a.cursor, -1))}><Icon name="voltar" /></button>
  <b>{dayTitle}</b>
  <button class="t-btn t-btn--quiet t-btn--icon next" aria-label="Próximo dia" disabled={isToday} onclick={() => (a.cursor = addDays(a.cursor, 1))}><Icon name="voltar" /></button>
  {#if !isToday}<button class="t-btn t-btn--sm" onclick={() => (a.cursor = a.day)}>Voltar para hoje</button>{/if}
</div>

<div class="layout">
  <div class="col">
    <section class="t-card summary">
      <svg class="ring" viewBox="0 0 128 128" role="img" aria-label="{Math.round(t.kcal)} de {goal.kcal} quilocalorias">
        <circle cx="64" cy="64" r={R} class="track" />
        <circle cx="64" cy="64" r={R} class="fill" stroke-dasharray={C} stroke-dashoffset={C * (1 - pct)} />
        <text x="64" y="62" class="big">{Math.round(t.kcal)}</text>
        <text x="64" y="80" class="small">de {goal.kcal} kcal</text>
      </svg>
      <div class="macros">
        <p class="left">{#if left >= 0}Restam <b>{Math.round(left)} kcal</b>{:else}<b>{Math.round(-left)} kcal</b> acima da estimativa{/if}</p>
        {#each macros as m (m.id)}
          <div class="macro">
            <span>{m.label}</span><em>{Math.round(m.value)} / {m.goal} g</em>
            <div class="meter" role="meter" aria-label={m.label} aria-valuenow={Math.round(m.value)} aria-valuemin="0" aria-valuemax={m.goal}><i style:width="{Math.min(1, m.value / Math.max(1, m.goal)) * 100}%"></i></div>
          </div>
        {/each}
      </div>
    </section>

    {#if !goal.personal}
      <p class="note">Estas metas são uma referência geral de 2000 kcal. Preencha a aba <b>Metas</b> para calcular as suas.</p>
    {/if}

    {#each meals as m (m)}
      {@const list = ofMeal(m)}
      <section class="t-card meal">
        <header>
          <h3>{mealLabel(m)}</h3>
          {#if list.length}<small>{kcalOf(list)} kcal</small>{/if}
          <button class="t-btn t-btn--sm" onclick={() => (adding = m)} aria-label="Registrar em {mealLabel(m)}"><Icon name="mais_um" size={15} />Registrar</button>
        </header>
        {#if list.length}
          <ul>
            {#each list as e (e.raw)}
              <li>
                <span class="nm">{e.name}{#if e.factor && e.factor !== 1}<small> ×{String(e.factor).replace('.', ',')}</small>{/if}</span>
                <small>{e.grams ? `${Math.round(e.grams)} g · ` : ''}{e.kcal ? `${Math.round(e.kcal)} kcal` : 'sem calorias'}</small>
                <button class="t-btn t-btn--quiet t-btn--sm t-btn--icon" aria-label="Tirar {e.name}" onclick={() => a.remove(e)}><Icon name="fechar" size={14} /></button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>

  <div class="col">
    {#if isToday}
      {#if a.insights.length}
        <section class="t-card">
          <h3>Dicas de hoje</h3>
          <ul class="tips">
            {#each a.insights as tip (tip.text)}
              <li class={tip.kind}><Icon name={tip.kind === 'bom' ? 'certo' : tip.kind === 'atencao' ? 'alerta' : 'ideias'} size={16} /><span>{tip.text}</span></li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class="t-card water">
        <h3>Água</h3>
        <div class="wrow">
          <p><b>{saude.todayCare.ml}</b> de {saude.config.agua.goalMl} ml</p>
          <button class="t-btn t-btn--sm" onclick={() => saude.drink()}><Icon name="mais_um" size={15} />Copo de {saude.config.agua.cupMl} ml</button>
        </div>
      </section>
    {/if}

    <section class="t-card">
      <h3>Últimos 7 dias</h3>
      <WeekBars items={bars} goal={goal.kcal} unit="kcal" label="Calorias nos últimos 7 dias" />
    </section>

    <section class="t-card">
      <h3>Peso</h3>
      <div class="wrow">
        <p>{#if lastKg}<b>{br(lastKg)}</b> kg{#if deltaKg !== null}<small> · {deltaKg > 0 ? '+' : ''}{br(deltaKg)} kg em {series.length} pesagens</small>{/if}{:else}Sem pesagens ainda{/if}</p>
      </div>
      {#if line}
        <svg class="spark" viewBox="0 0 240 60" role="img" aria-label="Evolução do peso nas últimas {series.length} pesagens">
          <polyline points={line.path} />
          {#each line.pts as p (p.w.raw)}<circle cx={p.x} cy={p.y} r="3"><title>{p.w.day.slice(8, 10)}/{p.w.day.slice(5, 7)}: {br(p.w.kg)} kg</title></circle>{/each}
        </svg>
      {/if}
      <form class="wform" onsubmit={saveWeight}>
        <input class="t-input" inputmode="decimal" placeholder="Peso de hoje (kg)" aria-label="Peso de hoje em quilos" bind:value={kg} />
        <button class="t-btn" disabled={!kg.trim()}>Registrar</button>
      </form>
    </section>
  </div>
</div>

{#if adding}<AddFoodSheet meal={adding} onclose={() => (adding = null)} />{/if}

<style>
  .daybar { display: flex; align-items: center; gap: var(--sp-1); margin-bottom: var(--sp-3); }
  .daybar b { font: 600 var(--fs-lg) var(--f-display); text-transform: capitalize; min-width: 0; }
  .daybar .next :global(svg) { transform: rotate(180deg); }
  .daybar .t-btn--sm { margin-left: auto; }
  .layout { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: var(--sp-3); align-items: start; }
  .col { display: grid; gap: var(--sp-3); min-width: 0; }
  h3 { margin: 0 0 var(--sp-2); font: 600 11px/1.2 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  small { font-size: 12px; color: var(--muted); }
  .note { margin: 0; font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; }
  .note b { color: var(--ink); }

  .summary { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; }
  .ring { width: 124px; height: 124px; flex: none; transform: rotate(-90deg); margin: 0 auto; }
  .ring circle { fill: none; stroke-width: 10; }
  .ring .track { stroke: var(--void); }
  .ring .fill { stroke: var(--ember); stroke-linecap: round; transition: stroke-dashoffset var(--dur-slow) var(--ease); }
  .ring text { transform: rotate(90deg); transform-origin: 64px 64px; text-anchor: middle; }
  .ring .big { font: 700 26px var(--f-display); fill: var(--ink); }
  .ring .small { font: 11px var(--f-mono); fill: var(--muted); }
  .macros { flex: 1 1 200px; min-width: 0; display: grid; gap: var(--sp-2); }
  .left { margin: 0; font-size: var(--fs-md); color: var(--silver); }
  .left b { color: var(--ink); font-family: var(--f-mono); }
  .macro { display: grid; grid-template-columns: 1fr auto; gap: 3px var(--sp-2); font-size: var(--fs-sm); color: var(--silver); }
  .macro em { font: normal 11.5px var(--f-mono); color: var(--muted); }
  .meter { grid-column: 1 / -1; height: 6px; border-radius: var(--r-pill); background: var(--void); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: inherit; background: var(--ember); transition: width var(--dur-slow) var(--ease); }

  .meal header { display: flex; align-items: center; gap: var(--sp-2); }
  .meal h3 { margin: 0; flex: 1; min-width: 0; font-size: 12px; color: var(--silver); }
  .meal ul { list-style: none; margin: var(--sp-2) 0 0; padding: 0; display: grid; }
  .meal li { display: flex; align-items: center; gap: var(--sp-2); padding: 4px 0; border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); font-size: var(--fs-md); }
  .meal .nm { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .meal li > small { white-space: nowrap; font-family: var(--f-mono); font-size: 11.5px; }

  .tips { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); font-size: var(--fs-sm); line-height: 1.45; color: var(--silver); }
  .tips li { display: flex; gap: var(--sp-2); }
  .tips li :global(svg) { margin-top: 1px; color: var(--muted); }
  .tips li.bom :global(svg) { color: var(--ok); }
  .tips li.atencao :global(svg) { color: var(--ember); }

  .wrow { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
  .wrow p { margin: 0; font-size: var(--fs-sm); color: var(--muted); }
  .wrow b { font: 600 var(--fs-lg) var(--f-mono); color: var(--ink); }
  .spark { display: block; width: 100%; height: 64px; margin-top: var(--sp-2); }
  .spark polyline { fill: none; stroke: var(--ember); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .spark circle { fill: var(--ember); stroke: var(--surface); stroke-width: 2; }
  .wform { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
  .wform input { flex: 1; width: 100%; }

  @container alimentacao (max-width: 760px) { .layout { grid-template-columns: minmax(0, 1fr); } }
</style>
