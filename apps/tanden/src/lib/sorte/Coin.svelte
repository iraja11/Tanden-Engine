<script lang="ts">
  import { coinStreak, type CoinSide } from '@tanden/core';
  import { ask } from '../ask.svelte';
  import { sound } from '../sound.svelte';
  import { sorte } from './sorte.svelte';

  // Moeda: o lado é sorteado no núcleo; a moeda gira um número de meias voltas
  // que termina com o lado certo para cima.

  let turns = $state(0);
  let side = $state<CoinSide | null>(sorte.coins.at(-1) ?? null);
  let flying = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const caras = $derived(sorte.coins.filter((c) => c === 'cara').length);
  const coroas = $derived(sorte.coins.length - caras);
  const streak = $derived(coinStreak(sorte.coins));
  const recent = $derived(sorte.coins.slice(-30));
  const pct = (n: number) => (sorte.coins.length ? `${Math.round((n / sorte.coins.length) * 100)}%` : '–');

  function flip() {
    if (flying) return;
    const s = sorte.flip();
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 5 a 7 voltas inteiras; meia volta a mais quando é coroa
    const cur = turns % 360;
    const spins = (5 + Math.floor(Math.random() * 3)) * 360;
    const target = s === 'coroa' ? 180 : 0;
    turns = turns - cur + spins + target;
    if (reduce) {
      side = s;
      sound.play('complete');
      return;
    }
    flying = true;
    side = null;
    sound.play('tick');
    timer = setTimeout(() => {
      flying = false;
      side = s;
      sound.play('complete');
    }, 1150);
  }

  $effect(() => () => { if (timer) clearTimeout(timer); });

  async function reset() {
    if (await ask.confirm('Zerar a contagem da moeda?', { ok: 'Zerar', danger: true })) sorte.resetCoins();
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target;
    const own = t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLButtonElement;
    if ((e.key === ' ' || e.key === 'Enter') && !own && !ask.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      flip();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="coin-tool">
  <button class="coin-btn" onclick={flip} disabled={flying} aria-label="Jogar a moeda">
    <!-- a moeda não é recriada: a transição de giro parte de onde ela parou -->
    <span class="arc" class:fly={flying}>
      <span class="coin" style:transform="rotateX({turns}deg)">
        <span class="face cara"><b>C</b><small>cara</small></span>
        <span class="face coroa"><b>★</b><small>coroa</small></span>
      </span>
    </span>
    <span class="shadow" class:fly={flying}></span>
  </button>

  <div class="result" aria-live="polite">
    {#if side}
      {#key sorte.coins.length}
        <p class="won">{side === 'cara' ? 'Cara' : 'Coroa'}</p>
      {/key}
      {#if streak && streak.n > 1}<p class="dim small">{streak.n} {streak.side === 'cara' ? 'caras' : 'coroas'} seguidas{streak.n >= 5 ? '. Que fase!' : ''}</p>{/if}
    {:else}
      <p class="dim">{flying ? 'No ar…' : 'Toque na moeda ou aperte espaço.'}</p>
    {/if}
  </div>

  {#if sorte.coins.length}
    <div class="stats box">
      <div class="count"><span>Cara</span><b>{caras}</b><span class="dim small">{pct(caras)}</span></div>
      <div class="bar" aria-hidden="true"><i style:width={pct(caras)}></i></div>
      <div class="count r"><span>Coroa</span><b>{coroas}</b><span class="dim small">{pct(coroas)}</span></div>
      <div class="dots" aria-label="Últimas jogadas">
        {#each recent as c, i (sorte.coins.length - recent.length + i)}<i class={c} title={c}></i>{/each}
      </div>
      <button class="ghost sm" onclick={reset}>Zerar</button>
    </div>
  {/if}
</div>

<style>
  .coin-tool { display: grid; justify-items: center; gap: 18px; padding-top: 4vh; }
  .coin-btn { all: unset; cursor: pointer; position: relative; width: 190px; height: 260px; display: grid; place-items: end center; perspective: 900px; }
  .coin-btn:focus-visible { outline: 2px solid var(--ember); outline-offset: 6px; border-radius: 16px; }
  .coin-btn:disabled { cursor: default; }
  .arc { display: block; margin-bottom: 30px; }
  .arc.fly { animation: toss 1.15s cubic-bezier(.3, .7, .4, 1) both; }
  @keyframes toss {
    0% { translate: 0 0; }
    45% { translate: 0 -120px; }
    80% { translate: 0 0; }
    88% { translate: 0 -10px; }
    100% { translate: 0 0; }
  }
  .coin { position: relative; display: block; width: 150px; height: 150px; transform-style: preserve-3d;
    transition: transform 1.1s cubic-bezier(.2, .75, .25, 1); }
  .face { position: absolute; inset: 0; border-radius: 50%; display: grid; place-items: center; align-content: center; gap: 2px;
    backface-visibility: hidden; color: #4a3200;
    background: radial-gradient(circle at 35% 30%, #fff3c4, #f1c75a 45%, #c8901f 85%);
    box-shadow: inset 0 0 0 7px #e2ae3b, inset 0 0 0 9px #a8761a, 0 10px 24px -8px var(--shadow); }
  .face b { font: 700 54px/1 var(--f-display); }
  .face small { font: 600 10px var(--f-display); letter-spacing: .18em; text-transform: uppercase; opacity: .7; }
  .coroa { transform: rotateX(180deg); background: radial-gradient(circle at 35% 30%, #f6f6f6, #c9ccd2 45%, #8d939c 85%); color: #33373d;
    box-shadow: inset 0 0 0 7px #b6bac1, inset 0 0 0 9px #7c828b, 0 10px 24px -8px var(--shadow); }
  .shadow { position: absolute; bottom: 14px; left: 50%; width: 120px; height: 14px; translate: -50% 0; border-radius: 50%;
    background: var(--shadow); opacity: .5; filter: blur(4px); transition: scale .5s, opacity .5s; }
  .shadow.fly { scale: .6; opacity: .25; }

  .result { min-height: 60px; text-align: center; display: grid; gap: 2px; }
  .result p { margin: 0; }
  .won { font: 700 32px/1.1 var(--f-display); animation: land .45s var(--spring) both; }
  @keyframes land { from { opacity: 0; scale: .7; } }

  .stats { width: min(460px, 100%); display: grid; grid-template-columns: auto 1fr auto; gap: 10px 12px; align-items: center; }
  .count { display: grid; justify-items: start; line-height: 1.2; }
  .count.r { justify-items: end; }
  .count b { font: 700 22px var(--f-display); }
  .bar { height: 8px; border-radius: 4px; background: #a3a9b2; overflow: hidden; }
  .bar i { display: block; height: 100%; background: #e2ae3b; transition: width var(--dur-slow) var(--ease); }
  .dots { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
  .dots i { width: 10px; height: 10px; border-radius: 50%; }
  .dots i.cara { background: #e2ae3b; }
  .dots i.coroa { background: #a3a9b2; }
  .stats button { grid-column: 1 / -1; justify-self: end; }

  @media (prefers-reduced-motion: reduce) {
    .coin { transition: none; }
    .won { animation: none; }
  }
</style>
