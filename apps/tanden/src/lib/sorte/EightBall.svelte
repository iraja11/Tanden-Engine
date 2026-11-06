<script lang="ts">
  import type { EightBallMood } from '@tanden/core';
  import { sound } from '../sound.svelte';
  import { sorte } from './sorte.svelte';

  // Bola 8: faça a pergunta, sacuda, e a resposta sobe do líquido.

  let question = $state('');
  let answer = $state<{ text: string; mood: EightBallMood } | null>(null);
  let shaking = $state(false);
  let shakes = $state(0);
  let input = $state<HTMLInputElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => { input?.focus(); });
  $effect(() => () => { if (timer) clearTimeout(timer); });

  function shake() {
    if (shaking) return;
    const a = sorte.shake(question);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      answer = a;
      sound.play('complete');
      return;
    }
    answer = null;
    shaking = true;
    shakes++;
    sound.play('open');
    timer = setTimeout(() => {
      shaking = false;
      answer = a;
      sound.play(a.mood === 'nao' ? 'close' : 'complete');
    }, 1100);
  }
</script>

<div class="ball-tool">
  <form class="ask" onsubmit={(e) => { e.preventDefault(); shake(); }}>
    <input bind:this={input} class="field" bind:value={question} placeholder="Faça uma pergunta de sim ou não…" aria-label="Pergunta" />
    <button class="primary" disabled={shaking}>Perguntar</button>
  </form>

  <button class="ball" class:shake={shaking} onclick={shake} disabled={shaking} aria-label="Sacudir a bola 8">
    {#key shakes}<span class="gloss"></span>{/key}
    <span class="window">
      {#if answer}
        <span class="tri {answer.mood}"><span>{answer.text}</span></span>
      {:else if !shaking}
        <span class="eight">8</span>
      {/if}
    </span>
  </button>

  <p class="dim small hint" aria-live="polite">
    {#if shaking}Sacudindo…{:else if answer}{question.trim() ? `“${question.trim()}”` : 'Pergunte de novo quando quiser.'}{:else}Pense na pergunta e toque na bola.{/if}
  </p>
</div>

<style>
  .ball-tool { display: grid; justify-items: center; gap: 22px; padding-top: 2vh; }
  .ask { display: flex; gap: 8px; width: min(520px, 100%); }
  .ask input { flex: 1; }
  .ball { all: unset; cursor: pointer; position: relative; width: min(300px, 76vw); aspect-ratio: 1; border-radius: 50%;
    background: radial-gradient(circle at 34% 28%, #5a5f6b 0%, #23252b 28%, #0b0c0f 70%, #000 100%);
    box-shadow: 0 30px 60px -18px rgba(0, 0, 0, .65), inset -18px -24px 50px rgba(0, 0, 0, .7);
    display: grid; place-items: center; }
  .ball:focus-visible { outline: 2px solid var(--ember); outline-offset: 6px; }
  .ball:disabled { cursor: default; }
  .ball.shake { animation: shake 1.1s cubic-bezier(.36, .07, .19, .97) both; }
  @keyframes shake {
    10%, 90% { translate: -3px 0; rotate: -2deg; }
    20%, 80% { translate: 6px -2px; rotate: 4deg; }
    30%, 50%, 70% { translate: -10px 2px; rotate: -6deg; }
    40%, 60% { translate: 10px -3px; rotate: 6deg; }
  }
  .gloss { position: absolute; top: 9%; left: 20%; width: 34%; height: 20%; border-radius: 50%;
    background: radial-gradient(ellipse, rgba(255, 255, 255, .35), transparent 70%); pointer-events: none; }
  .window { width: 54%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
    background: radial-gradient(circle at 50% 45%, #1b2a6b, #0a1033 70%); box-shadow: inset 0 0 0 5px #1a1a1f, inset 0 6px 18px rgba(0, 0, 0, .8); }
  .eight { width: 78%; aspect-ratio: 1; border-radius: 50%; background: #f4f4f2; color: #111; display: grid; place-items: center;
    font: 700 clamp(40px, 12vw, 64px)/1 var(--f-display); box-shadow: inset 0 -6px 12px rgba(0, 0, 0, .25); }
  .tri { width: 92%; aspect-ratio: 1 / .87; clip-path: polygon(50% 100%, 0 0, 100% 0); background: #2d47c9;
    display: grid; justify-items: center; align-content: start; padding-top: 7%; box-sizing: border-box;
    animation: surface 1.3s ease-out both; }
  .tri.sim { background: #2d47c9; }
  .tri.talvez { background: #5a3fb3; }
  .tri.nao { background: #8f2f52; }
  .tri span { width: 70%; text-align: center; color: #e9eeff; font: 600 clamp(9px, 2.4vw, 11.5px)/1.12 var(--f-display);
    letter-spacing: .02em; text-transform: uppercase; text-wrap: balance; text-shadow: 0 0 6px rgba(160, 190, 255, .55); }
  @keyframes surface {
    from { opacity: 0; scale: .7; rotate: -25deg; filter: blur(4px); }
    to { opacity: 1; scale: 1; rotate: 0deg; filter: blur(0); }
  }
  .hint { margin: 0; text-align: center; min-height: 1.4em; max-width: 520px; overflow-wrap: anywhere; }

  @media (prefers-reduced-motion: reduce) {
    .ball.shake, .tri { animation: none; }
  }
</style>
