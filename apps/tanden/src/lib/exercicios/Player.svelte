<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { homeMoveById, phaseAt, phaseStart, routineTimeline, type HomeMove } from '@tanden/core';
  import { back } from '../back';
  import { sound } from '../sound.svelte';
  import Icon from '../ui/Icon.svelte';
  import Figura from './Figura.svelte';
  import { exercicios as ex, type WorkoutSession } from './exercicios.svelte';

  // Tela do treino guiado: conta o tempo, mostra o movimento e avisa as trocas.
  let { session }: { session: WorkoutSession } = $props();

  // o treino não muda enquanto esta tela existe (ela é recriada a cada treino)
  const first = untrack(() => ({ routine: session.routine, elapsed: session.elapsed, worked: session.worked }));
  const routine = first.routine;
  const timeline = routineTimeline(routine);
  const total = timeline.reduce((s, p) => s + p.seconds, 0);

  let elapsed = $state(first.elapsed);
  let worked = $state(first.worked);
  let running = $state(true);
  let leaving = $state(false);
  let finished = $state(false);
  let effort = $state<number | null>(null);

  const pos = $derived(phaseAt(timeline, elapsed));
  const step = $derived(routine.steps[pos.phase.step]!);
  const move = $derived<HomeMove | undefined>(homeMoveById(step.moveId));
  const nextStep = $derived(routine.steps[pos.phase.step + (pos.phase.kind === 'fazer' ? 1 : 0)]);
  const nextMove = $derived(nextStep ? homeMoveById(nextStep.moveId) : undefined);
  const secs = $derived(Math.ceil(pos.remaining));
  const halfway = $derived(pos.phase.kind === 'fazer' && !!move?.sides && pos.remaining <= pos.phase.seconds / 2 && pos.remaining > pos.phase.seconds / 2 - 4);
  const phaseWord = $derived(pos.phase.kind === 'preparar' ? 'Prepare-se' : pos.phase.kind === 'descansar' ? 'Descanse' : step.block === 'aquecimento' ? 'Aquecimento' : step.block === 'volta' ? 'Volta à calma' : routine.rounds > 1 && step.round > 0 ? `Rodada ${step.round} de ${routine.rounds}` : 'Agora');
  const tally = $derived(ex.tally({ routine, elapsed, worked }));
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  let offBack: (() => void) | null = null;
  function armBack() {
    offBack = back.layer(() => {
      offBack = null;
      running = false;
      leaving = true;
    });
  }

  // avisos: últimos segundos, troca de fase e troca de lado
  let lastSec = -1;
  let lastPhase = untrack(() => pos.index);
  let sideCalled = -1;
  function cues() {
    if (secs !== lastSec) {
      lastSec = secs;
      if (secs > 0 && secs <= 3) sound.play('tick', { force: true });
    }
    if (pos.index !== lastPhase) {
      lastPhase = pos.index;
      sound.play(pos.phase.kind === 'fazer' ? 'open' : 'close', { force: true });
    }
    if (halfway && sideCalled !== pos.index) {
      sideCalled = pos.index;
      sound.play('alert', { force: true });
    }
  }

  onMount(() => {
    armBack();
    let last = performance.now();
    let saved = 0;
    const tick = setInterval(() => {
      const now = performance.now();
      // o aparelho pode dormir no meio: esse tempo não conta como treino
      const dt = Math.min(90, (now - last) / 1000);
      last = now;
      if (!running || finished) return;
      elapsed = Math.min(total, elapsed + dt);
      worked += dt;
      if (elapsed >= total) {
        finished = true;
        ex.checkpoint(elapsed, worked);
        sound.play('complete', { force: true });
        return;
      }
      cues();
      if (now - saved > 5000) {
        saved = now;
        ex.checkpoint(elapsed, worked);
      }
    }, 200);

    // mantém a tela acesa durante o treino, onde o aparelho permitir
    let lock: WakeLockSentinel | null = null;
    const wake = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* sem permissão: a tela segue a regra do aparelho */
      }
    };
    void wake();
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', wake);
      void lock?.release().catch(() => {});
      offBack?.();
    };
  });

  function seek(index: number) {
    if (index >= timeline.length) {
      elapsed = total;
      finished = true;
      ex.checkpoint(elapsed, worked);
      return;
    }
    elapsed = phaseStart(timeline, Math.max(0, index));
    ex.checkpoint(elapsed, worked);
    sound.play('tick');
  }
  const previous = () => seek(pos.phase.seconds - pos.remaining > 3 ? pos.index : pos.index - 1);
  const skip = () => seek(pos.index + 1);
  function toggle() {
    running = !running;
    sound.play('tick');
  }
  function askLeave() {
    running = false;
    leaving = true;
  }
  function stay() {
    leaving = false;
    running = true;
    if (!offBack) armBack();
  }
  function saveEarly() {
    ex.checkpoint(elapsed, worked);
    ex.finish(null, false);
  }
  function leave() {
    ex.checkpoint(elapsed, worked);
    ex.playing = false;
  }

  function onkey(e: KeyboardEvent) {
    if (finished || leaving) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') skip();
    else if (e.key === 'ArrowLeft') previous();
    else if (e.key === 'Escape') askLeave();
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="player" class:rest={pos.phase.kind !== 'fazer'} role="dialog" aria-modal="true" aria-label="Treino: {routine.title}">
  {#if finished}
    <div class="end">
      <span class="badge"><Icon name="certo" size={30} /></span>
      <h2>Treino concluído</h2>
      <p class="sum"><b>{tally.minutes}</b> min · cerca de <b>{tally.kcal}</b> kcal</p>
      <p class="t-eyebrow">Como foi o esforço?</p>
      <div class="effort" role="radiogroup" aria-label="Esforço de 1 a 10">
        {#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
          <button role="radio" aria-checked={effort === n} class:on={effort === n} onclick={() => (effort = n)}>{n}</button>
        {/each}
      </div>
      <p class="scale"><span>Bem leve</span><span>No limite</span></p>
      <!-- pular quase tudo não avança o programa -->
      <button class="t-btn t-btn--primary wide" onclick={() => ex.finish(effort, worked >= total / 2)}>Salvar treino</button>
      <button class="t-btn t-btn--quiet wide" onclick={() => ex.discard()}>Não salvar</button>
    </div>
  {:else}
    <header>
      <button class="t-btn t-btn--quiet t-btn--icon" aria-label="Encerrar treino" onclick={askLeave}><Icon name="fechar" /></button>
      <div class="ttl"><b>{routine.title}</b><small>Faltam {clock(total - elapsed)} de {clock(total)}</small></div>
    </header>
    <div class="progress" role="progressbar" aria-label="Progresso do treino" aria-valuenow={Math.round((elapsed / total) * 100)} aria-valuemin="0" aria-valuemax="100"><i style:width="{(elapsed / total) * 100}%"></i></div>

    <main>
      <div class="stage">
        {#if move}<Figura fig={move.fig} playing={running} label="Demonstração de {move.name}" />{/if}
      </div>
      <div class="info">
        <p class="phase">{phaseWord}</p>
        <p class="count" aria-live="off">{secs}</p>
        <h2>{pos.phase.kind === 'fazer' ? move?.name : `A seguir: ${move?.name}`}</h2>
        {#if halfway}
          <p class="swap" role="status"><Icon name="trocar" size={18} />Troque de lado</p>
        {:else if move}
          <ol>{#each move.steps as s (s)}<li>{s}</li>{/each}</ol>
          {#if move.tip}<p class="tip">{move.tip}</p>{/if}
        {/if}
        {#if pos.phase.kind === 'fazer' && nextMove}<p class="next">Depois: {nextMove.name}</p>{/if}
      </div>
    </main>

    <footer>
      <button class="t-btn t-btn--icon ctl" aria-label="Voltar" onclick={previous}><Icon name="recuar" /></button>
      <button class="t-btn t-btn--primary t-btn--icon ctl big" aria-label={running ? 'Pausar' : 'Continuar'} onclick={toggle}><Icon name={running ? 'pausar' : 'tocar'} size={24} /></button>
      <button class="t-btn t-btn--icon ctl" aria-label="Pular" onclick={skip}><Icon name="seguir" /></button>
    </footer>
  {/if}

  {#if leaving}
    <div class="t-scrim" role="presentation">
      <div class="t-sheet" role="alertdialog" aria-modal="true" aria-label="Encerrar treino">
        <h2>Encerrar o treino?</h2>
        <p class="msg">Você treinou {tally.minutes} {tally.minutes === 1 ? 'minuto' : 'minutos'}. Pode salvar o que fez ou deixar para continuar depois.</p>
        <div class="stack">
          <button class="t-btn t-btn--primary" onclick={stay}>Continuar treinando</button>
          <button class="t-btn" onclick={saveEarly}>Salvar o que fiz</button>
          <button class="t-btn" onclick={leave}>Sair e continuar depois</button>
          <button class="t-btn t-btn--quiet" onclick={() => ex.discard()}>Descartar treino</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .player { position: fixed; inset: 0; z-index: 900; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; background: var(--void); color: var(--ink);
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
  header { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); }
  .ttl { min-width: 0; display: grid; }
  .ttl b { font: 600 var(--fs-md) var(--f-display); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ttl small { font: 11.5px var(--f-mono); color: var(--muted); }
  .progress { height: 4px; background: var(--surface-2); }
  .progress i { display: block; height: 100%; background: var(--ember); }
  main { min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--sp-5); align-items: center; width: min(1040px, 100%); margin-inline: auto; padding: var(--sp-4); }
  .stage { aspect-ratio: 5 / 4; max-height: 62vh; width: 100%; justify-self: center; }
  .rest .stage { opacity: .55; }
  .info { min-width: 0; display: grid; gap: var(--sp-2); }
  .phase { margin: 0; font: 600 12px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .count { margin: 0; font: 700 clamp(64px, 14vh, 112px)/1 var(--f-mono); font-variant-numeric: tabular-nums; }
  h2 { margin: 0; font: 600 var(--fs-xl) var(--f-display); }
  ol { margin: 0; padding-left: 20px; display: grid; gap: var(--sp-1); font-size: var(--fs-md); line-height: 1.5; color: var(--silver); }
  .tip { margin: 0; font-size: var(--fs-sm); line-height: 1.5; color: var(--muted); }
  .next { margin: var(--sp-1) 0 0; font-size: var(--fs-sm); color: var(--muted); }
  .swap { display: flex; align-items: center; gap: var(--sp-2); margin: 0; font: 600 var(--fs-lg) var(--f-display); color: var(--ember-soft); }
  footer { display: flex; justify-content: center; align-items: center; gap: var(--sp-4); padding: var(--sp-3); }
  .ctl { width: 52px; height: 52px; border-radius: 50%; }
  .ctl.big { width: 68px; height: 68px; }

  .end { grid-row: 1 / -1; align-self: center; justify-self: center; width: min(440px, 100%); display: grid; justify-items: center; gap: var(--sp-3); padding: var(--sp-5); text-align: center; }
  .badge { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
  .sum { margin: 0; color: var(--muted); }
  .sum b { font: 700 var(--fs-xl) var(--f-mono); color: var(--ink); }
  .effort { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 3px; width: 100%; }
  .effort button { min-height: 40px; padding: 0; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface); color: var(--silver); font: 600 13px var(--f-mono); }
  .effort button.on { background: var(--ember); border-color: var(--ember); color: var(--void); }
  .scale { display: flex; justify-content: space-between; width: 100%; margin: calc(var(--sp-2) * -1) 0 0; font-size: 12px; color: var(--muted); }
  .wide { width: 100%; }
  .msg { margin: 0; font-size: var(--fs-md); line-height: 1.5; color: var(--silver); }
  .stack { display: grid; gap: var(--sp-2); }

  @media (max-width: 720px), (max-height: 520px) and (max-width: 900px) {
    main { grid-template-columns: minmax(0, 1fr); align-items: start; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4); }
    .stage { max-height: 30vh; aspect-ratio: auto; height: 30vh; }
    .info { justify-items: center; text-align: center; }
    .count { font-size: clamp(56px, 11vh, 84px); }
    ol { text-align: left; }
  }
</style>
