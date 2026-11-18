<script lang="ts">
  import { MANUAL_ACTIVITIES, activityKcal, addDays } from '@tanden/core';
  import Icon from '../ui/Icon.svelte';
  import WeekBars from '../ui/WeekBars.svelte';
  import { exercicios as ex } from './exercicios.svelte';

  // Progresso: a semana, as últimas semanas e o registro.
  let activity = $state(MANUAL_ACTIVITIES[0]!.id);
  let minutes = $state(30);
  const chosen = $derived(MANUAL_ACTIVITIES.find((a) => a.id === activity)!);
  const recent = $derived([...ex.logs].reverse().slice(0, 20));
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  const stats = $derived([
    { label: 'Minutos na semana', value: ex.week.minutes, note: `meta de ${ex.settings.weekGoal}` },
    { label: 'Dias de força', value: ex.week.strengthDays, note: 'recomendado: 2 ou mais' },
    { label: 'Dias ativos', value: ex.streaks.totalDays, note: 'desde o começo' },
  ]);
  const WD = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  const s = $derived(ex.streaks);
  const flameNote = $derived(
    s.current === 0 ? (s.best ? `Seu recorde é ${s.best}. Dá para começar de novo hoje.` : 'Treine hoje e acenda a primeira chama.')
    : s.atRisk ? `Treine hoje para não apagar. Faltam ${s.next - s.current} para ${s.next}.`
    : `Faltam ${s.next - s.current} ${s.next - s.current === 1 ? 'dia' : 'dias'} para o marco de ${s.next}.`,
  );
  const bars = $derived(ex.history.map((w, i) => ({
    key: w.monday,
    label: dm(w.monday).slice(0, 2),
    value: w.minutes,
    current: i === ex.history.length - 1,
    title: `semana de ${dm(w.monday)} a ${dm(addDays(w.monday, 6))}`,
  })));

  function add(e: SubmitEvent) {
    e.preventDefault();
    if (!(minutes > 0)) return;
    ex.logManual(chosen.label, chosen.met, minutes);
  }
</script>

<div class="stats">
  {#each stats as s (s.label)}
    <section class="t-card stat"><p class="t-eyebrow">{s.label}</p><b>{s.value}</b><small>{s.note}</small></section>
  {/each}
</div>

<section class="t-card streak" class:lit={s.current > 0} class:risk={s.atRisk}>
  <div class="flame" aria-hidden="true">🔥</div>
  <div class="cur"><b>{s.current}</b><span>{s.current === 1 ? 'dia seguido' : 'dias seguidos'}</span></div>
  <dl>
    <div><dt>Recorde</dt><dd>{s.best}</dd></div>
    <div><dt>Semanas na meta</dt><dd>{s.weeks}</dd></div>
    <div><dt>Melhor série de semanas</dt><dd>{s.weeksBest}</dd></div>
  </dl>
  <p class="hint">{flameNote}</p>
</section>

<section class="t-card cal">
  <h3>Últimas 15 semanas</h3>
  <div class="heat" role="img" aria-label="Calendário de atividade das últimas 15 semanas">
    <span class="wd" aria-hidden="true">{#each WD as d, i (i)}<i>{i % 2 ? '' : d}</i>{/each}</span>
    {#each ex.calendar as week (week[0]!.day)}
      <span class="col">
        {#each week as c (c.day)}
          <i class="l{c.level}" class:future={c.future} class:today={c.day === ex.day} title="{dm(c.day)}: {c.minutes} min"></i>
        {/each}
      </span>
    {/each}
  </div>
  <p class="legend" aria-hidden="true">menos <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> mais</p>
</section>

<div class="layout">
  <section class="t-card">
    <h3>Minutos por semana</h3>
    <WeekBars items={bars} goal={ex.settings.weekGoal} unit="min" label="Minutos de atividade nas últimas 8 semanas" />
    <p class="hint">Inclui os treinos registrados na aba Saúde. Os números do eixo são o dia da segunda-feira de cada semana.</p>
  </section>

  <form class="t-card manual" onsubmit={add}>
    <h3>Anotar outra atividade</h3>
    <label>Atividade
      <select class="t-select" bind:value={activity}>{#each MANUAL_ACTIVITIES as a (a.id)}<option value={a.id}>{a.label}</option>{/each}</select>
    </label>
    <label>Minutos<input class="t-input" type="number" min="1" max="600" bind:value={minutes} /></label>
    <p class="hint">Cerca de {minutes > 0 ? activityKcal(chosen.met, minutes, ex.bodyKg) : 0} kcal</p>
    <button class="t-btn"><Icon name="mais_um" size={15} />Anotar</button>
  </form>
</div>

<section class="t-card log">
  <h3>Registro</h3>
  {#if recent.length}
    <ul>
      {#each recent as l (l.raw)}
        <li>
          <span class="when">{dm(l.day)}</span>
          <span class="nm">{l.name}<small>{l.minutes} min{l.kcal !== null ? ` · ${l.kcal} kcal` : ''}{l.effort !== null ? ` · esforço ${l.effort}` : ''}</small></span>
          <button class="t-btn t-btn--quiet t-btn--sm t-btn--icon" aria-label="Tirar {l.name} do registro" onclick={() => ex.remove(l)}><Icon name="fechar" size={14} /></button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">Seus treinos aparecem aqui depois de concluídos.</p>
  {/if}
</section>

<style>
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
  .stat { display: grid; gap: 2px; min-width: 0; }
  .stat b { font: 700 var(--fs-2xl) var(--f-display); color: var(--ink); }
  .stat small { font-size: 12px; color: var(--muted); }
  .streak { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: var(--sp-2) var(--sp-4); margin-bottom: var(--sp-3); }
  .streak .hint { grid-column: 1 / -1; margin: 0; }
  .flame { font-size: 34px; filter: grayscale(1) opacity(.45); transition: filter var(--dur-slow); }
  .lit .flame { filter: drop-shadow(0 0 10px var(--ember-glow)); animation: flicker 2.4s ease-in-out infinite; }
  .risk .flame { animation-duration: .9s; filter: drop-shadow(0 0 6px var(--ember-glow)) saturate(.6); }
  @keyframes flicker { 50% { transform: scale(1.07) rotate(-3deg); } }
  @media (prefers-reduced-motion: reduce) { .lit .flame { animation: none; } }
  .cur { display: grid; }
  .cur b { font: 700 calc(var(--fs-2xl) * 1.3)/1 var(--f-display); color: var(--ink); }
  .cur span { font-size: 12px; color: var(--muted); }
  dl { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
  dl div { min-width: 0; }
  dt { font-size: 11px; color: var(--muted); overflow-wrap: anywhere; }
  dd { margin: 0; font: 600 var(--fs-lg) var(--f-display); color: var(--ink); }
  .cal { margin-bottom: var(--sp-3); }
  .heat { display: flex; gap: 3px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .col, .wd { display: grid; grid-template-rows: repeat(7, 1fr); gap: 3px; flex: 1 0 12px; max-width: 22px; }
  .wd { flex: 0 0 12px; }
  .wd i { font: 9px/12px var(--f-mono); color: var(--muted); font-style: normal; }
  .col i, .legend i { aspect-ratio: 1; min-height: 12px; border-radius: 3px; background: var(--surface-2); }
  .col i.l1, .legend i.l1 { background: color-mix(in srgb, var(--ember) 30%, var(--surface-2)); }
  .col i.l2, .legend i.l2 { background: color-mix(in srgb, var(--ember) 55%, var(--surface-2)); }
  .col i.l3, .legend i.l3 { background: color-mix(in srgb, var(--ember) 78%, var(--surface-2)); }
  .col i.l4, .legend i.l4 { background: var(--ember); box-shadow: 0 0 8px -3px var(--ember-glow); }
  .col i.future { opacity: .25; }
  .col i.today { outline: 1.5px solid var(--ink); outline-offset: 1px; }
  .legend { display: flex; align-items: center; justify-content: flex-end; gap: 3px; margin: var(--sp-2) 0 0; font-size: 11px; color: var(--muted); }
  .legend i { display: inline-block; width: 11px; min-height: 11px; }
  .layout { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: var(--sp-3); align-items: start; margin-bottom: var(--sp-3); }
  h3 { margin: 0 0 var(--sp-2); font: 600 11px/1.2 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .hint { margin: var(--sp-2) 0 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
  .manual { display: grid; gap: var(--sp-2); justify-items: stretch; }
  .manual h3, .manual .hint { margin: 0; }
  .manual label { display: grid; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--silver); }
  .manual :global(input), .manual :global(select) { width: 100%; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  li { display: flex; align-items: center; gap: var(--sp-3); padding: 6px 0; border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  li:first-child { border-top: 0; }
  .when { flex: none; font: 11.5px var(--f-mono); color: var(--muted); }
  .nm { flex: 1; min-width: 0; display: grid; font-size: var(--fs-md); overflow-wrap: anywhere; }
  .nm small { font-size: 12px; color: var(--muted); }
  @container exercicios (max-width: 640px) {
    .streak { grid-template-columns: auto minmax(0, 1fr); }
    .streak dl { grid-column: 1 / -1; }
    .layout { grid-template-columns: minmax(0, 1fr); }
    .stat { padding: var(--sp-2) var(--sp-3); }
    .stat b { font-size: var(--fs-xl); }
    .stat :global(.t-eyebrow) { font-size: 10px; letter-spacing: .06em; }
    .stat small { display: none; }
  }
</style>
