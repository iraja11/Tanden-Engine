<script lang="ts">
  import { onMount } from 'svelte';
  import { cubicOut, cubicIn } from 'svelte/easing';
  import type { TransitionConfig } from 'svelte/transition';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { engine } from '../engine.svelte';
  import { desktop } from '../platform';
  import { sound } from '../sound.svelte';
  import { theme } from '../theme.svelte';
  import Slide from './Slide.svelte';
  import { slides } from './slides.svelte';

  // Modo apresentação: tela cheia, um slide por vez, com a transição escolhida
  // na apresentação. A linha do rodapé é o caminho da apresentação; a cada
  // troca, um pulso corre nela do slide de onde você saiu até onde chegou.
  let { path, start = 0 }: { path: string; start?: number } = $props();

  const deck = $derived.by(() => {
    void engine.content; // edição em outro aparelho chega aqui também
    return slides.deck(path);
  });
  const total = $derived(deck.slides.length);
  let index = $state(0);
  let dir = $state(1);
  let notes = $state(false);
  let black = $state(false);
  let typed = $state('');
  let started = $state(Date.now());
  let now = $state(Date.now());
  let host = $state<HTMLElement>();
  let pulse = $state<{ from: number; to: number; seq: number } | null>(null);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  // tela cheia: no app de desktop é a janela inteira; no navegador e no celular, o elemento
  async function fullscreen(on: boolean) {
    try {
      if (desktop) await getCurrentWindow().setFullscreen(on);
      else if (on) await host?.requestFullscreen?.();
      else if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // sem permissão de tela cheia: segue ocupando a janela
    }
  }

  onMount(() => {
    index = Math.max(0, Math.min(start, total - 1));
    void fullscreen(true);
    const t = setInterval(() => (now = Date.now()), 1000);
    const onFs = () => { if (!document.fullscreenElement && fsWasOn) slides.stop(); };
    let fsWasOn = false;
    const fsCheck = setTimeout(() => (fsWasOn = !!document.fullscreenElement), 600);
    document.addEventListener('fullscreenchange', onFs);
    wake();
    return () => {
      clearInterval(t);
      clearTimeout(fsCheck);
      document.removeEventListener('fullscreenchange', onFs);
      void fullscreen(false);
    };
  });

  $effect(() => { if (index > total - 1) index = Math.max(0, total - 1); });

  function go(to: number) {
    const next = Math.max(0, Math.min(total - 1, to));
    if (next === index) return;
    dir = next > index ? 1 : -1;
    pulse = { from: index, to: next, seq: (pulse?.seq ?? 0) + 1 };
    index = next;
    black = false;
    sound.play('tick');
  }

  function wake() {
    idle = false;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => (idle = true), 2500);
  }

  function onKey(e: KeyboardEvent) {
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k) && !(k === 'Enter' && typed)) { e.preventDefault(); go(index + 1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); go(index - 1); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(total - 1);
    else if (k === 'Escape') slides.stop();
    else if (k.toLowerCase() === 'n') notes = !notes;
    else if (k.toLowerCase() === 'b' || k === '.') black = !black;
    else if (k.toLowerCase() === 'f') void (desktop ? getCurrentWindow().isFullscreen().then((f) => fullscreen(!f)) : fullscreen(!document.fullscreenElement));
    else if (/^\d$/.test(k)) { typed += k; return; }
    else if (k === 'Enter' && typed) { go(Number(typed) - 1); }
    typed = '';
  }

  // toque: arrastar para o lado troca; tocar na esquerda volta, no resto avança
  let touch: { x: number; y: number } | null = null;
  function down(e: PointerEvent) {
    touch = { x: e.clientX, y: e.clientY };
  }
  function up(e: PointerEvent) {
    if (!touch || (e.target as Element).closest('button, a, .notes')) return;
    const dx = e.clientX - touch.x;
    const dy = e.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) go(index + (e.clientX < innerWidth / 3 ? -1 : 1));
  }

  // ── transições ─────────────────────────────────────────────────────
  const kind = $derived(theme.motion === 'parado' ? 'nenhuma' : deck.transition);
  function enter(_n: Element): TransitionConfig {
    const d = theme.ms(kind === 'núcleo' ? 520 : kind === 'deslizar' ? 460 : 380);
    if (!d || kind === 'nenhuma') return { duration: 0 };
    if (kind === 'deslizar') return { duration: d, easing: cubicOut, css: (_t, u) => `transform:translateX(${u * dir * 100}%)` };
    if (kind === 'esmaecer') return { duration: d, css: (t) => `opacity:${t}` };
    const blur = theme.motion === 'completo' ? 8 : 0;
    return { duration: d, easing: cubicOut, css: (t, u) => `opacity:${Math.min(1, t * 1.4)};transform:scale(${0.9 + 0.1 * t});filter:blur(${u * blur}px) brightness(${1 + u * 0.6})` };
  }
  function leave(_n: Element): TransitionConfig {
    const d = theme.ms(kind === 'núcleo' ? 300 : kind === 'deslizar' ? 460 : 380);
    if (!d || kind === 'nenhuma') return { duration: 0 };
    if (kind === 'deslizar') return { duration: d, easing: cubicOut, css: (_t, u) => `transform:translateX(${-u * dir * 100}%)` };
    if (kind === 'esmaecer') return { duration: d, css: (t) => `opacity:${t}` };
    return { duration: d, easing: cubicIn, css: (t, u) => `opacity:${t};transform:scale(${1 + u * 0.05})` };
  }

  const current = $derived(deck.slides[index]);
  const upcoming = $derived(deck.slides[index + 1]);
  const elapsed = $derived.by(() => {
    const s = Math.max(0, Math.floor((now - started) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  const clock = $derived(new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
</script>

<svelte:window onkeydown={onKey} onpointermove={wake} />

<div class="presenter" class:idle class:with-notes={notes} bind:this={host} role="presentation"
  onpointerdown={down} onpointerup={up}>
  <div class="stage">
    <div class="screen">
      {#if current}
        {#key index}
          <div class="layer" in:enter out:leave>
            <Slide slide={current} {index} {total} live />
          </div>
        {/key}
        {#if kind === 'núcleo'}
          {#key index}<span class="burst" aria-hidden="true"></span>{/key}
        {/if}
        {#if pulse && kind !== 'nenhuma'}
          {#key pulse.seq}
            <span class="spark" aria-hidden="true" style:--a="{((pulse.from + 0.5) / total) * 100}%" style:--b="{((pulse.to + 0.5) / total) * 100}%"></span>
          {/key}
        {/if}
      {:else}
        <p class="empty">Esta apresentação está vazia.</p>
      {/if}
      {#if black}<div class="black" aria-label="Tela apagada (B volta)"></div>{/if}
    </div>
  </div>

  {#if notes}
    <aside class="notes">
      <header>
        <b>{index + 1}<span>/{total}</span></b>
        <span class="time" title="Tempo de apresentação">{elapsed}</span>
        <span class="clock">{clock}</span>
        <button onclick={() => (started = Date.now())} title="Zerar o cronômetro">↺</button>
      </header>
      <div class="text">
        {#if current?.notes}{current.notes}{:else}<em>Sem notas neste slide.</em>{/if}
      </div>
      {#if upcoming}
        <div class="next"><small>Próximo</small><Slide slide={upcoming} index={index + 1} {total} /></div>
      {:else}
        <div class="next end"><small>Fim da apresentação</small></div>
      {/if}
    </aside>
  {/if}

  <nav class="hud" aria-label="Controles">
    <button onclick={() => go(index - 1)} disabled={index === 0} aria-label="Anterior">‹</button>
    <span>{typed ? `ir para ${typed}…` : `${index + 1} / ${total}`}</span>
    <button onclick={() => go(index + 1)} disabled={index >= total - 1} aria-label="Próximo">›</button>
    <button class:on={notes} onclick={() => (notes = !notes)} title="Notas do apresentador (N)">Notas</button>
    <button onclick={() => slides.stop()} title="Sair (Esc)" aria-label="Sair">✕</button>
  </nav>
</div>

<style>
  .presenter { position: fixed; inset: 0; z-index: 200; background: #000; display: grid; grid-template-columns: 1fr; touch-action: none; user-select: none;
    animation: dim-in var(--dur-slow) var(--ease); }
  .presenter.with-notes { grid-template-columns: 1fr min(380px, 34vw); background: var(--void); }
  @keyframes dim-in { from { opacity: 0; } }
  .stage { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; padding: 0; }
  .with-notes .stage { padding: 24px; }
  .screen { position: relative; width: min(100%, calc(100vh * 16 / 9)); aspect-ratio: 16 / 9; overflow: hidden; background: var(--void); }
  .with-notes .screen { width: min(100%, calc((100vh - 48px) * 16 / 9)); border-radius: 10px; box-shadow: 0 30px 80px -30px #000, 0 0 0 1px var(--line); }
  .layer { position: absolute; inset: 0; will-change: transform, opacity; }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); }
  .black { position: absolute; inset: 0; background: #000; z-index: 3; }

  /* Núcleo: o slide novo nasce de um anel de energia que se abre do centro */
  .burst { position: absolute; left: 50%; top: 50%; width: 10%; aspect-ratio: 1; border-radius: 50%; pointer-events: none; z-index: 2;
    border: 2px solid var(--ember); box-shadow: 0 0 40px var(--ember-glow), inset 0 0 30px var(--ember-glow);
    transform: translate(-50%, -50%) scale(.2); opacity: 0; animation: burst calc(var(--dur-slow) * 1.5) var(--ease); }
  @keyframes burst { 0% { opacity: .9; transform: translate(-50%, -50%) scale(.2); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(9); } }

  /* pulso na linha de progresso: viaja do slide anterior até o atual */
  .spark { position: absolute; bottom: 0; left: var(--b); width: 7%; height: .45%; min-height: 3px; z-index: 2; pointer-events: none; transform: translateX(-50%);
    background: radial-gradient(closest-side, #fff, var(--ember) 45%, transparent); filter: drop-shadow(0 0 6px var(--ember));
    animation: spark var(--dur-slow) var(--ease) forwards; }
  @keyframes spark { from { left: var(--a); opacity: 1; } to { left: var(--b); opacity: 0; } }

  .notes { display: flex; flex-direction: column; gap: 14px; min-height: 0; padding: 22px 22px 22px 0; color: var(--ink); }
  .notes header { display: flex; align-items: baseline; gap: 14px; font: 12px var(--f-mono); color: var(--muted); }
  .notes header b { font: 600 22px var(--f-display); color: var(--ink); }
  .notes header b span { font-size: 14px; color: var(--muted); }
  .notes .time { font: 600 18px var(--f-mono); color: var(--ember); }
  .notes header button { margin-left: auto; border: 1px solid var(--line); background: var(--surface); border-radius: 8px; color: var(--muted); padding: 2px 8px; }
  .notes .text { flex: 1; min-height: 0; overflow-y: auto; white-space: pre-wrap; font-size: 17px; line-height: 1.55; padding: 14px 16px;
    border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .notes .text em { color: var(--muted); }
  .notes .next { display: grid; gap: 6px; opacity: .85; }
  .notes .next small { font: 11px var(--f-mono); color: var(--muted); text-transform: uppercase; letter-spacing: .1em; }
  .notes .next.end { padding: 18px 0; }

  .hud { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 4px; padding: 5px;
    background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px solid var(--line); border-radius: 12px; backdrop-filter: blur(8px);
    font: 12px var(--f-mono); color: var(--muted); transition: opacity var(--dur-slow) var(--ease), transform var(--dur-slow) var(--ease); }
  .hud span { min-width: 64px; text-align: center; }
  .hud button { border: 0; background: none; border-radius: 8px; padding: 4px 10px; color: var(--ink); font: 13px var(--f-body); }
  .hud button:hover:not(:disabled) { background: var(--surface-2); }
  .hud button:disabled { opacity: .3; }
  .hud button.on { color: var(--ember); }
  .idle .hud { opacity: 0; transform: translate(-50%, 8px); pointer-events: none; }
  .idle { cursor: none; }

  @media (max-width: 720px) {
    .presenter.with-notes { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    .with-notes .stage { padding: 10px; }
    .notes { padding: 0 12px 70px; }
    .notes .next { display: none; }
  }
</style>
