<script lang="ts">
  import type { EightBallMood } from '@tanden/core';
  import { sound } from '../sound.svelte';
  import { sorte } from './sorte.svelte';

  // Bola 8: faça a pergunta, sacuda, e a resposta sobe do líquido.

  let question = $state('');
  let answer = $state<{ text: string; mood: EightBallMood } | null>(null);
  /** como o dado boia no líquido desta vez: nunca sobe igual */
  let pose = $state({ rot: 0, dx: 0, dy: 0, scale: 1, depth: 1, bob: 0 });
  let shaking = $state(false);
  let shakes = $state(0);
  let input = $state<HTMLInputElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => { input?.focus(); });
  $effect(() => () => { if (timer) clearTimeout(timer); });

  const between = (a: number, b: number) => a + Math.random() * (b - a);

  function float() {
    pose = { rot: between(-16, 16), dx: between(-4, 4), dy: between(-3, 5), scale: between(0.92, 1.03), depth: between(0.72, 1), bob: between(0, 2) };
  }

  function shake() {
    if (shaking) return;
    const a = sorte.shake(question);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    float();
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
        {#key answer}
          <span class="die" style:--rot="{pose.rot}deg" style:--dx="{pose.dx}%" style:--dy="{pose.dy}%" style:--s={pose.scale} style:--depth={pose.depth} style:--bob="{pose.bob}s">
            <span class="tri {answer.mood}"></span>
            <span class="txt"><span>{answer.text}</span></span>
          </span>
        {/key}
      {:else if !shaking}
        <span class="eight">8</span>
      {/if}
      <span class="rim"></span>
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
  /* o vidro: o dado fica atrás da borda, nunca por cima dela */
  .window { position: relative; width: 60%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; overflow: hidden;
    container-type: inline-size; background: radial-gradient(circle at 50% 42%, #1d2d73, #0a1033 72%); }
  .rim { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle at 50% 50%, transparent 52%, rgba(4, 8, 30, .7) 100%);
    box-shadow: inset 0 0 0 5px #1a1a1f, inset 0 7px 18px rgba(0, 0, 0, .85); }
  .eight { width: 76%; aspect-ratio: 1; border-radius: 50%; background: #f4f4f2; color: #111; display: grid; place-items: center;
    font: 700 clamp(40px, 12vw, 64px)/1 var(--f-display); box-shadow: inset 0 -6px 12px rgba(0, 0, 0, .25); }

  /*
   * O dado: triângulo equilátero de ponta para baixo, inscrito num círculo de
   * raio 0,43 da janela e com o centróide no centro dela. Assim os cantos ficam
   * longe da borda e o texto, no centro, cai no meio do triângulo.
   * Altura = 1,5 × 0,43 = 64,5%; lado = 74,5%; o topo fica 1/3 da altura acima do centro.
   */
  .die { position: absolute; inset: 0; opacity: var(--depth);
    translate: var(--dx) var(--dy); rotate: var(--rot); scale: var(--s);
    filter: blur(calc((1 - var(--depth)) * 1.6px));
    animation: surface 1.4s cubic-bezier(.2, .7, .2, 1) both, bob 5s ease-in-out var(--bob) infinite; }
  .tri { position: absolute; left: 12.75%; top: 28.5%; width: 74.5%; height: 64.5%;
    clip-path: polygon(50% 100%, 0 0, 100% 0); background: linear-gradient(180deg, #3550d6, #2236a8); }
  .tri.talvez { background: linear-gradient(180deg, #6a4fc7, #4a3299); }
  .tri.nao { background: linear-gradient(180deg, #a3395f, #7a2645); }
  /* o texto fica centrado no centróide (o centro da janela), estreito o bastante para caber nas linhas de baixo */
  .txt { position: absolute; left: 29%; width: 42%; top: 38%; height: 24%; display: grid; place-items: center; }
  .txt span { text-align: center; color: #e9eeff; font: 600 clamp(7px, 4.8cqw, 12px)/1.12 var(--f-display);
    letter-spacing: .02em; text-transform: uppercase; text-wrap: balance; overflow-wrap: anywhere;
    text-shadow: 0 0 6px rgba(160, 190, 255, .55); }
  @keyframes surface {
    from { opacity: 0; translate: var(--dx) 30%; rotate: calc(var(--rot) - 35deg); scale: .6; filter: blur(5px); }
    to { opacity: var(--depth); }
  }
  @keyframes bob {
    0%, 100% { transform: translate(0, 0) rotate(0deg); }
    50% { transform: translate(1.5%, -1.5%) rotate(2deg); }
  }
  .hint { margin: 0; text-align: center; min-height: 1.4em; max-width: 520px; overflow-wrap: anywhere; }

  @media (prefers-reduced-motion: reduce) {
    .ball.shake, .die { animation: none; }
  }
</style>
