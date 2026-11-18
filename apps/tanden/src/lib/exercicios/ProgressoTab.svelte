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
    { label: 'Dias seguidos', value: ex.streak, note: ex.streak ? 'continue assim' : 'comece hoje' },
  ]);
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
    .layout { grid-template-columns: minmax(0, 1fr); }
    .stat { padding: var(--sp-2) var(--sp-3); }
    .stat b { font-size: var(--fs-xl); }
    .stat :global(.t-eyebrow) { font-size: 10px; letter-spacing: .06em; }
    .stat small { display: none; }
  }
</style>
