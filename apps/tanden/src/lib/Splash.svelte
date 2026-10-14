<script lang="ts">
  import { onMount } from 'svelte';
  import Orb from './Orb.svelte';
  import { sound } from './sound.svelte';
  import { theme } from './theme.svelte';

  // Tela de abertura. Não é enfeite: as metades se encaixam quando o motor liga,
  // o símbolo gira enquanto o cofre abre de verdade, e quando fica pronto ele
  // desacelera, assenta e voa até o lugar dele na barra lateral.
  let { ready, error = '', target, ondone }:
    { ready: boolean; error?: string; target?: HTMLElement; ondone: () => void } = $props();

  type Phase = 'assemble' | 'wait' | 'settle' | 'fly';
  let phase = $state<Phase>(theme.moving ? 'assemble' : 'wait');
  let orbEl = $state<HTMLElement>();
  let fly = $state('');
  let fading = $state(false);
  const started = performance.now();
  const MIN_MS = theme.motion === 'completo' ? 700 : 250;

  onMount(() => {
    if (!theme.moving) return;
    const lock = setTimeout(() => sound.play('boot'), 470);
    const t = setTimeout(() => { if (phase === 'assemble') phase = 'wait'; }, 650);
    return () => { clearTimeout(t); clearTimeout(lock); };
  });

  // cofre aberto (ou falhou): pode parar de girar
  $effect(() => {
    if (phase !== 'wait' || !(ready || error)) return;
    const left = Math.max(0, MIN_MS - (performance.now() - started));
    const t = setTimeout(() => {
      if (!theme.moving) finish();
      else phase = 'settle';
    }, left);
    return () => clearTimeout(t);
  });

  function onrest() {
    if (phase === 'settle') launch();
  }

  /** voa do centro até o símbolo da barra lateral (FLIP) */
  function launch() {
    phase = 'fly';
    const from = orbEl?.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    if (from && to && to.width > 0) {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      fly = `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`;
    }
    fading = true;
    setTimeout(finish, theme.ms(430));
  }

  function finish() {
    fading = true;
    setTimeout(ondone, theme.ms(120));
  }
</script>

<div class="splash" class:fading class:fly={phase === 'fly'} role="status" aria-live="polite">
  <div class="logo" bind:this={orbEl} style:transform={fly}>
    <Orb size={132} load={phase === 'wait' ? 1.6 : 0} decel={1800} assemble {onrest} />
  </div>
  <h1 aria-label="Tanden Engine">{#each 'TANDEN ENGINE' as ch, i (i)}<span style:animation-delay="{120 + i * 28}ms">{ch === ' ' ? ' ' : ch}</span>{/each}</h1>
  <p class:err={!!error}>{error ? `Não consegui abrir o cofre: ${error}` : ready ? 'Pronto' : 'Abrindo o cofre…'}</p>
</div>

<style>
  .splash { position: fixed; inset: 0; z-index: 100; display: grid; place-content: center; justify-items: center; gap: 22px;
    transition: opacity var(--dur-slow) var(--ease); }
  .splash::before { content: ''; position: absolute; inset: 0; z-index: -1; transition: opacity .45s var(--ease);
    background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--ember) 7%, var(--void)), var(--void) 60%); }
  .splash.fly::before { opacity: 0; }
  .splash.fly h1, .splash.fly p { opacity: 0; transform: translateY(6px); }
  .splash.fading:not(.fly) { opacity: 0; }
  .logo { transition: transform .45s cubic-bezier(.6, 0, .2, 1); will-change: transform; }
  h1 { margin: 0; font: 600 15px/1 var(--f-display); letter-spacing: .5em; color: var(--ink); padding-left: .5em;
    transition: opacity .2s, transform .2s; }
  h1 span { display: inline-block; white-space: pre; animation: letter .5s var(--ease) both; }
  :global([data-motion='parado']) h1 span { animation: none; }
  @keyframes letter { from { opacity: 0; transform: translateY(8px); filter: blur(4px); } }
  p { margin: 0; min-height: 1.4em; font: 11px var(--f-mono); color: var(--muted); letter-spacing: .08em; transition: opacity .2s; }
  p.err { color: var(--crit); max-width: 80vw; text-align: center; }
</style>
