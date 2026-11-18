<script lang="ts">
  import { ROUTINE_FOCUS, focusLabel, homeMoveById, routineKcal, routineSeconds, type HomeMove, type Routine, type RoutineBlock, type RoutineFocus } from '@tanden/core';
  import Icon from '../ui/Icon.svelte';
  import MoveSheet from './MoveSheet.svelte';
  import { exercicios as ex } from './exercicios.svelte';

  // Treinar: a ideia de hoje, ou um treino montado na hora.
  let focus = $state<RoutineFocus>(ex.idea.focus);
  let minutes = $state(ex.idea.minutes);
  let draft = $state<Routine | null>(null);
  let open = $state<HomeMove | null>(null);

  const LENGTHS = [5, 10, 15, 20, 30, 45];
  const BLOCKS: Array<[RoutineBlock, string]> = [['aquecimento', 'Aquecimento'], ['circuito', 'Circuito'], ['volta', 'Volta à calma']];
  const pct = $derived(Math.min(1, ex.week.minutes / Math.max(1, ex.settings.weekGoal)));

  /** Passos do bloco, sem repetir as rodadas do circuito. */
  function stepsOf(r: Routine, block: RoutineBlock) {
    const seen = new Set<string>();
    return r.steps.filter((s) => s.block === block && !seen.has(s.moveId) && !!seen.add(s.moveId));
  }

  function quick() {
    ex.begin(ex.build(ex.idea.focus, ex.idea.minutes));
  }
  function make() {
    draft = ex.build(focus, minutes);
  }
</script>

{#if ex.session}
  <section class="t-card resume">
    <div><p class="t-eyebrow">Treino pela metade</p><b>{ex.session.routine.title}</b></div>
    <div class="row">
      <button class="t-btn t-btn--quiet" onclick={() => ex.discard()}>Descartar</button>
      <button class="t-btn t-btn--primary" onclick={() => ex.resume()}><Icon name="tocar" size={16} />Continuar</button>
    </div>
  </section>
{/if}

<div class="top">
  <section class="t-card today">
    <p class="t-eyebrow">Sugestão de hoje</p>
    <h2>{focusLabel(ex.idea.focus)} <small>{ex.idea.minutes} min</small></h2>
    <p class="why">{ex.idea.reason}</p>
    <button class="t-btn t-btn--primary" onclick={quick}><Icon name="tocar" size={16} />Começar agora</button>
  </section>

  <section class="t-card goal">
    <p class="t-eyebrow">Esta semana</p>
    <p class="big"><b>{ex.week.minutes}</b> de {ex.settings.weekGoal} min</p>
    <div class="meter" role="meter" aria-label="Minutos da semana" aria-valuenow={ex.week.minutes} aria-valuemin="0" aria-valuemax={ex.settings.weekGoal}><i style:width="{pct * 100}%"></i></div>
    <p class="why">{ex.streak > 1 ? `${ex.streak} dias seguidos em movimento.` : ex.week.sessions ? `${ex.week.sessions} ${ex.week.sessions === 1 ? 'treino' : 'treinos'} na semana.` : 'Nenhum treino ainda nesta semana.'}</p>
  </section>
</div>

<section class="t-card build">
  <h3>Montar um treino</h3>
  <div class="focus">
    {#each ROUTINE_FOCUS as f (f.id)}
      <button class="pick" class:on={focus === f.id} aria-pressed={focus === f.id} onclick={() => { focus = f.id; draft = null; }}>
        <b>{f.label}</b><small>{f.hint}</small>
      </button>
    {/each}
  </div>
  <p class="t-eyebrow">Duração</p>
  <div class="len">
    {#each LENGTHS as n (n)}<button class="t-chip" class:on={minutes === n} onclick={() => { minutes = n; draft = null; }}>{n} min</button>{/each}
  </div>
  <div class="end"><button class="t-btn" onclick={make}><Icon name="faisca" size={16} />{draft ? 'Montar outro' : 'Montar treino'}</button></div>

  {#if draft}
    <div class="draft">
      <p class="sum"><b>{draft.title}</b> · {Math.round(routineSeconds(draft) / 60)} min · cerca de {routineKcal(draft, ex.bodyKg)} kcal{draft.rounds > 1 ? ` · ${draft.rounds} rodadas` : ''}</p>
      {#each BLOCKS as [id, label] (id)}
        {@const list = stepsOf(draft, id)}
        {#if list.length}
          <p class="t-eyebrow">{label}</p>
          <ul>
            {#each list as s (s.moveId)}
              {@const m = homeMoveById(s.moveId)}
              {#if m}<li><button onclick={() => (open = m)}><span>{m.name}</span><small>{s.seconds} s</small></button></li>{/if}
            {/each}
          </ul>
        {/if}
      {/each}
      <button class="t-btn t-btn--primary start" onclick={() => draft && ex.begin(draft)}><Icon name="tocar" size={16} />Começar este treino</button>
    </div>
  {/if}
</section>

{#if open}<MoveSheet move={open} onclose={() => (open = null)} onpick={(m) => (open = m)} />{/if}

<style>
  .resume { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .row { display: flex; gap: var(--sp-2); }
  .top { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
  .today, .goal { display: grid; gap: var(--sp-2); align-content: start; justify-items: start; }
  h2 { margin: 0; font: 600 var(--fs-xl) var(--f-display); color: var(--ink); }
  h2 small { font: 500 var(--fs-sm) var(--f-mono); color: var(--muted); }
  h3 { margin: 0; font: 600 11px/1.2 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .why { margin: 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--muted); }
  .big { margin: 0; font-size: var(--fs-md); color: var(--muted); }
  .big b { font: 700 var(--fs-2xl) var(--f-display); color: var(--ink); }
  .meter { width: 100%; height: 8px; border-radius: var(--r-pill); background: var(--void); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: inherit; background: var(--ember); transition: width var(--dur-slow) var(--ease); }
  .build { display: grid; gap: var(--sp-3); }
  .focus { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: var(--sp-2); }
  .pick { display: grid; gap: 2px; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-md); background: none; text-align: left; color: var(--ink); }
  .pick:hover { background: var(--surface-2); }
  .pick.on { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .pick b { font: 600 13.5px var(--f-body); }
  .pick small { font-size: 12px; line-height: 1.3; color: var(--muted); }
  .len { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: calc(var(--sp-2) * -1); }
  .end { display: flex; justify-content: flex-end; }
  .draft { display: grid; gap: var(--sp-2); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
  .sum { margin: 0; font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; }
  .sum b { color: var(--ink); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  li button { display: flex; justify-content: space-between; gap: var(--sp-2); width: 100%; min-height: var(--h-md); align-items: center; padding: 0 var(--sp-1); border: 0; border-radius: var(--r-sm); background: none; color: var(--ink); text-align: left; font: 13.5px var(--f-body); }
  li button:hover { background: var(--surface-2); }
  li small { font: 11.5px var(--f-mono); color: var(--muted); white-space: nowrap; }
  .start { justify-self: end; margin-top: var(--sp-1); }
</style>
