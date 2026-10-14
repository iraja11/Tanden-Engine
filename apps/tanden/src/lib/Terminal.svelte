<script lang="ts">
  import { Channel, invoke } from '@tauri-apps/api/core';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import '@xterm/xterm/css/xterm.css';
  import { engine } from './engine.svelte';
  import { theme } from './theme.svelte';
  import { untrack } from 'svelte';

  // Um terminal de verdade dentro do app. `program` vazio abre o shell comum.
  let { program, visible }: { program: '' | 'claude' | 'gemini'; visible: boolean } = $props();
  let el: HTMLDivElement;
  let ended = $state(false);
  let failed = $state('');

  type PtyEvent = { kind: 'data'; bytes: number[] } | { kind: 'exit'; code: number | null };
  let term: Terminal | undefined;

  /** cores do terminal a partir do tema; no tema claro, a paleta ANSI escurece para ser legível */
  function colors() {
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const ansi = theme.dark
      ? { black: '#151518', brightBlack: '#5c5a66', red: '#ff6b6b', green: '#7fd1a8', yellow: '#ffc08a', blue: '#8fb4ff',
          magenta: '#d7a6ff', cyan: '#7fd8d8', white: '#c8c7cf', brightWhite: '#ecebf0', brightRed: '#ff8a8a',
          brightGreen: '#a3e4c4', brightYellow: '#ffd3a8', brightBlue: '#b0caff', brightMagenta: '#e6c4ff', brightCyan: '#a8e8e8' }
      : { black: '#1d1b18', brightBlack: '#6b665c', red: '#c0262d', green: '#17784e', yellow: '#9a6200', blue: '#2557c7',
          magenta: '#8a3fb8', cyan: '#0f7c86', white: '#c9c3b5', brightWhite: '#fbf9f4', brightRed: '#d7443f',
          brightGreen: '#1f8a5b', brightYellow: '#b57700', brightBlue: '#3a6fe0', brightMagenta: '#9d55c9', brightCyan: '#16939e' };
    return { background: v('--void'), foreground: v('--ink'), cursor: v('--ember'), cursorAccent: v('--void'),
      selectionBackground: v('--ember-glow') === 'transparent' ? `${v('--ember')}55` : v('--ember-glow'), ...ansi };
  }

  $effect(() => {
    theme.rev;
    if (term) term.options.theme = colors();
  });

  $effect(() => {
    const css = getComputedStyle(document.documentElement);
    term = new Terminal({
      fontFamily: css.getPropertyValue('--f-mono').trim(),
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      // sem rastrear: trocar o tema não pode recriar o terminal (mataria a sessão)
      theme: untrack(colors),
    });
    const t = term;
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(el);
    fit.fit();

    let id: number | null = null;
    let lastPulse = 0;
    const events = new Channel<PtyEvent>();
    events.onmessage = (e) => {
      if (e.kind === 'data') {
        t.write(Uint8Array.from(e.bytes));
        // a IA está escrevendo: um pulso por segundo, no máximo
        const now = Date.now();
        if (now - lastPulse > 1000) { lastPulse = now; engine.pulse('editor', 'out'); }
      } else {
        ended = true;
      }
    };
    invoke<number>('pty_spawn', { program, cols: t.cols, rows: t.rows, events })
      .then((n) => (id = n))
      .catch((e) => (failed = String(e)));
    const input = t.onData((data) => { if (id !== null) void invoke('pty_write', { id, data }); });
    const resize = t.onResize(({ cols, rows }) => { if (id !== null) void invoke('pty_resize', { id, cols, rows }); });
    const observer = new ResizeObserver(() => { if (el.offsetParent) fit.fit(); });
    observer.observe(el);
    return () => {
      observer.disconnect();
      input.dispose();
      resize.dispose();
      if (id !== null) void invoke('pty_kill', { id });
      t.dispose();
      term = undefined;
    };
  });
</script>

<div class="term" class:hidden={!visible}>
  {#if failed}<p class="msg">Não consegui abrir o terminal: {failed}</p>{/if}
  {#if ended}<p class="msg">Sessão encerrada.</p>{/if}
  <div class="screen" bind:this={el}></div>
</div>

<style>
  .term { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  .term.hidden { display: none; }
  .screen { flex: 1; min-height: 0; padding: 8px 4px 8px 12px; }
  .msg { margin: 8px 12px 0; font: 12px var(--f-mono); color: var(--muted); }
</style>
