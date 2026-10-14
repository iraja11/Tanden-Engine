<script lang="ts">
  import { untrack } from 'svelte';
  import { theme } from './theme.svelte';

  // Símbolo tanden. Cada movimento quer dizer algo:
  // - parado e alinhado: tudo em dia;
  // - girando: há trabalho rodando, e quanto mais trabalho, mais rápido (a IA pensando acelera);
  // - ao terminar, desacelera como um motor e assenta de volta na posição de descanso com um leve tranco;
  // - uma volta completa (kick): algo chegou ou foi sincronizado;
  // - o anel acende em onda quando um dado entra, e fica vermelho quando algo falha.
  type Flash = { kind: 'in' | 'ok' | 'fail'; n: number } | null;
  let { load = 0, kick = 0, flash = null, size = 44, decel = 720, assemble = false, onclick, onrest }: {
    load?: number; kick?: number; flash?: Flash; size?: number;
    /** °/s² ao desacelerar */
    decel?: number;
    /** as duas metades chegam girando e se encaixam (tela de abertura) */
    assemble?: boolean;
    onclick?: () => void;
    /** chamado quando o símbolo assenta parado */
    onrest?: () => void;
  } = $props();

  let angle = $state(0);
  let v = 0;
  let rest: number | null = 0;
  let raf = 0;
  let last = 0;

  const cruise = (l: number) => {
    const max = theme.motion === 'reduzido' ? 120 : 900;
    return Math.min(max, 280 * (1 + 0.45 * (l - 1)));
  };

  /** próxima volta completa depois do ponto em que o giro pararia sozinho */
  function pickRest(extra = 0): number {
    const stop = angle + (v * v) / (2 * decel);
    return Math.ceil(stop / 360 - 1e-3) * 360 + extra;
  }

  function frame(t: number) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (load > 0) {
      rest = null;
      v += (cruise(load) - v) * (1 - Math.exp(-dt * 3.5));
      angle += v * dt;
    } else {
      if (rest === null) rest = pickRest();
      const dist = rest - angle;
      const cap = theme.motion === 'reduzido' ? Math.max(Math.abs(v), 120) : Math.max(Math.abs(v), 420, decel / 2.5);
      const want = Math.sign(dist) * Math.min(cap, Math.sqrt(2 * decel * Math.abs(dist)));
      // o atraso proposital no ajuste faz passar um pouquinho e voltar: o "tranco" de máquina
      v += (want - v) * (1 - Math.exp(-dt * 12));
      angle += v * dt;
      if (Math.abs(dist) < 0.6 && Math.abs(v) < 15) {
        angle = 0;
        rest = 0;
        v = 0;
        raf = 0;
        onrest?.();
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (!theme.moving) {
      cancelAnimationFrame(raf);
      raf = 0;
      angle = 0;
      v = 0;
      rest = 0;
      if (load === 0) onrest?.();
      return;
    }
    if (load === 0 && rest === 0 && angle === 0 && v === 0) {
      onrest?.();
      return;
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  $effect(() => {
    load;
    theme.motion;
    run();
  });

  // pedido de uma volta: se estava parado, gira uma volta inteira e assenta
  let seenKick = untrack(() => kick);
  $effect(() => {
    if (kick === seenKick) return;
    seenKick = kick;
    if (load > 0 || !theme.moving) return;
    rest = pickRest(rest !== null && Math.abs(rest - angle) > 1 ? 0 : 360);
    run();
  });

  $effect(() => () => cancelAnimationFrame(raf));

  const busy = $derived(load > 0);
  /** metade do yin-yang; a outra é a mesma forma girada meia volta */
  const TEAR = 'M0,-50 A50,50 0 0 1 0,50 A25,25 0 0 1 0,0 A25,25 0 0 0 0,-50 Z';
</script>

<button class="orb" class:busy class:still={!theme.moving} class:assemble={assemble && theme.moving} style:width="{size}px" style:height="{size}px" {onclick}
  aria-label={busy ? 'Trabalhando' : 'Sincronizar agora'} title={busy ? 'Trabalhando…' : 'Sincronizar agora'}>
  <svg viewBox="-60 -60 120 120" aria-hidden="true">
    {#key flash?.n}
      {#if flash && theme.moving}<circle class="wave {flash.kind}" r="57" />{/if}
    {/key}
    <circle class="ring" class:fail={flash?.kind === 'fail'} r="57" />
    <g style:transform="rotate({angle}deg)">
      <g class="half yin">
        <path d={TEAR} fill="var(--yin)" transform="rotate(180)" />
        <circle cy="-25" r="7.5" fill="var(--yang)" />
      </g>
      <g class="half yang">
        <path d={TEAR} fill="var(--yang)" />
        <circle cy="25" r="7.5" fill="var(--yin)" />
        <circle class="eye" cy="25" r="3" />
      </g>
      <circle class="rim" r="50" />
    </g>
  </svg>
</button>

<style>
  .orb { border: 0; padding: 0; background: none; border-radius: 50%; flex: none; transition: transform var(--dur) var(--spring); }
  .orb:active { transform: scale(.92); }
  svg { width: 100%; height: 100%; display: block; overflow: visible; filter: drop-shadow(0 0 6px var(--ember-glow));
    transition: filter var(--dur-slow); }
  .orb:hover svg { filter: drop-shadow(0 0 10px var(--ember-glow)); }
  .busy svg { filter: drop-shadow(0 0 14px var(--ember-glow)) drop-shadow(0 0 4px var(--ember-glow)); }
  .ring { fill: none; stroke: var(--ember); stroke-width: 2.5; transition: stroke var(--dur-slow); }
  .ring.fail { stroke: var(--crit); }
  .eye { fill: var(--ember); transition: fill var(--dur-slow); }
  .busy .eye { fill: var(--ember-soft); }
  .still.busy .ring { stroke-width: 4; }
  .rim { fill: none; stroke: var(--silver); stroke-width: 1.5; }
  .assemble .half { animation: .62s cubic-bezier(.3, 1.25, .5, 1) both; }
  .assemble .yang { animation-name: in-yang; }
  .assemble .yin { animation-name: in-yin; }
  .assemble .rim, .assemble .ring { stroke-dasharray: 360; animation: draw .7s .1s var(--ease) both; }
  @keyframes in-yang { from { opacity: 0; transform: translate(34px, 0) rotate(-120deg); } }
  @keyframes in-yin { from { opacity: 0; transform: translate(-34px, 0) rotate(-120deg); } }
  @keyframes draw { from { stroke-dashoffset: 360; } to { stroke-dashoffset: 0; } }
  .wave { fill: none; stroke: var(--ember); stroke-width: 3; transform-origin: center; animation: wave .7s var(--ease) forwards; }
  .wave.fail { stroke: var(--crit); }
  @keyframes wave { from { opacity: .9; transform: scale(1); } to { opacity: 0; transform: scale(1.45); stroke-width: .5; } }
</style>
