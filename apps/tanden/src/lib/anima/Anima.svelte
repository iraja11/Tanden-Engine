<script lang="ts">
  import { HUMORES } from '@tanden/core';
  import { pop, vanish } from '../motion';
  import { theme } from '../theme.svelte';
  import { anima } from './anima.svelte';

  // O corpo da Ânima: dois olhos num círculo escuro, que seguem o ponteiro (no
  // celular, olham em volta sozinhos), piscam e mudam de expressão com a fala.
  //
  // Toque: cutuca (cutucadas seguidas irritam). Esfregar de um lado para o outro:
  // carinho. Arrastar: muda de lugar; soltar com força: ela é jogada e fica tonta;
  // soltar na borda da tela: ela se esconde e só espia. Toque longo ou duplo
  // clique: conversa. O balão traz botões para responder sem abrir a conversa.
  let btn = $state<HTMLButtonElement>();
  let look = $state({ x: 0, y: 0 });
  let blink = $state(false);
  let jitter = $state({ x: 0, y: 0 });
  let drag = $state<{ x: number; y: number } | null>(null);
  let shown = $state(0);
  let draft = $state('');
  let log = $state<HTMLElement>();
  let spin = $state(false);
  let flash = $state(false);

  const g = $derived(anima.gesto);
  const ring = $derived(g === 'raiva' ? '#ff3b4e' : anima.cor);
  const iris = $derived(g === 'raiva' ? '#ff3b4e' : g === 'coracao' ? '#ff6fa8' : anima.cor);
  const stare = $derived(g === 'olhar' || g === 'glitch');
  const still = $derived(theme.motion === 'parado');
  const side = $derived(anima.prefs.lado);
  const hidden = $derived(anima.prefs.escondida && !drag);
  const bottom = $derived(anima.prefs.altura > 0 ? `${anima.prefs.altura}px` : null);
  const text = $derived(anima.balao?.texto ?? '');
  const typed = $derived(still || theme.motion === 'reduzido' ? text : [...text].slice(0, shown).join(''));
  const done = $derived(typed.length >= text.length);

  // o olhar: ponteiro no computador, passeio aleatório no toque
  $effect(() => {
    let raf = 0;
    let wander: ReturnType<typeof setTimeout> | undefined;
    let near = 0;
    const fine = matchMedia('(pointer: fine)').matches;
    const onMove = (e: PointerEvent) => {
      if (raf || !btn) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = btn!.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 220) * 2.6;
        look = { x: (dx / d) * k, y: (dy / d) * k };
        // o ponteiro rondando por perto, sem tocar
        if (d < 80 && d > 30) {
          near ||= Date.now();
          if (Date.now() - near > 700) { near = 0; anima.perto(); }
        } else near = 0;
      });
    };
    const roam = () => {
      look = Math.random() < 0.3 ? { x: 0, y: 0 } : { x: (Math.random() * 2 - 1) * 2.2, y: (Math.random() * 2 - 1) * 1.6 };
      wander = setTimeout(roam, 1800 + Math.random() * 3500);
    };
    if (fine) addEventListener('pointermove', onMove, { passive: true });
    else roam();
    return () => {
      removeEventListener('pointermove', onMove);
      if (wander) clearTimeout(wander);
      cancelAnimationFrame(raf);
    };
  });

  // escondida, ela olha para dentro da tela
  const eye = $derived(hidden ? { x: side === 'esq' ? 2.4 : -2.4, y: 0 } : look);

  // piscar (encarando, ela não pisca: é de propósito)
  $effect(() => {
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(() => {
        if (!stare && !still) {
          blink = true;
          setTimeout(() => (blink = false), 130);
        }
        next();
      }, 2400 + Math.random() * 4200);
    };
    next();
    return () => clearTimeout(t);
  });

  // sem filtro, às vezes ela "pula" uns pixels, como imagem com defeito
  $effect(() => {
    if (anima.prefs.intensidade < 3 || still) return;
    const id = setInterval(() => {
      if (Math.random() > 0.35 || drag) return;
      jitter = { x: (Math.random() * 2 - 1) * 5, y: (Math.random() * 2 - 1) * 4 };
      setTimeout(() => (jitter = { x: 0, y: 0 }), 140);
    }, 45_000);
    return () => clearInterval(id);
  });

  // jogada: gira; surto sem filtro: a tela treme por um instante
  $effect(() => {
    if (!anima.giro || still) return;
    spin = true;
    const t = setTimeout(() => (spin = false), 900);
    return () => clearTimeout(t);
  });
  $effect(() => {
    if (!anima.susto || still || theme.motion === 'reduzido') return;
    flash = true;
    const t = setTimeout(() => (flash = false), 320);
    return () => clearTimeout(t);
  });

  // efeito de digitação do balão, com pausas irregulares nas pontuações
  $effect(() => {
    const full = [...text];
    shown = 0;
    if (!full.length) return;
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      shown++;
      if (shown >= full.length) return;
      const ch = full[shown - 1]!;
      t = setTimeout(step, /[.!?…]/.test(ch) ? 260 : ch === ',' ? 120 : 18 + Math.random() * 24);
    };
    t = setTimeout(step, 120);
    return () => clearTimeout(t);
  });

  // a conversa rola até a última mensagem
  $effect(() => {
    void anima.chat.length;
    void anima.digitando;
    if (log) queueMicrotask(() => log && (log.scrollTop = log.scrollHeight));
  });

  // ------------------------------------------------------------ gestos

  type Press = { x: number; y: number; id: number; trail: Array<{ x: number; y: number; t: number }>; flips: number; dir: number; acted: boolean };
  let press: Press | null = null;
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  /** esfregar com o mouse, sem apertar */
  let rub = { flips: 0, dir: 0, at: 0, lastX: 0 };

  function down(e: PointerEvent) {
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, trail: [{ x: e.clientX, y: e.clientY, t: performance.now() }], flips: 0, dir: 0, acted: false };
    // captura já no toque: um arrasto rápido sai do rosto antes de virar arrasto
    btn?.setPointerCapture(e.pointerId);
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (press && !drag && !press.acted) {
        press.acted = true;
        anima.abrir();
      }
    }, 520);
  }

  function move(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) {
      hoverRub(e);
      return;
    }
    const p = press;
    const last = p.trail.at(-1)!;
    const dx = e.clientX - last.x;
    if (Math.abs(dx) >= 3) {
      const d = Math.sign(dx);
      if (p.dir && d !== p.dir) p.flips++;
      p.dir = d;
    }
    p.trail = [...p.trail.slice(-7), { x: e.clientX, y: e.clientY, t: performance.now() }];
    const far = Math.hypot(e.clientX - p.x, e.clientY - p.y);
    // vai e volta em cima dela: carinho, não arrasto
    if (!drag && !p.acted && p.flips >= 3 && far < 60) {
      p.acted = true;
      clearTimeout(longTimer);
      anima.carinho();
      return;
    }
    if (p.acted && !drag) return;
    if (!drag && (far < 28 || p.flips >= 2)) return;
    if (!drag) clearTimeout(longTimer);
    drag = { x: e.clientX, y: e.clientY };
  }

  function hoverRub(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const now = Date.now();
    if (now - rub.at > 900) rub = { flips: 0, dir: 0, at: now, lastX: e.clientX };
    const dx = e.clientX - rub.lastX;
    if (Math.abs(dx) < 3) return;
    const d = Math.sign(dx);
    if (rub.dir && d !== rub.dir) rub.flips++;
    rub.dir = d;
    rub.lastX = e.clientX;
    if (rub.flips >= 4) {
      rub = { flips: 0, dir: 0, at: now, lastX: e.clientX };
      anima.carinho();
    }
  }

  function up(e: PointerEvent) {
    clearTimeout(longTimer);
    const p = press;
    if (!p || e.pointerId !== p.id) return;
    press = null;
    if (!drag) {
      if (p.acted) return;
      if (anima.prefs.escondida) anima.voltarDoEsconderijo();
      else anima.cutucar();
      return;
    }
    const d = drag;
    drag = null;
    const w = innerWidth, h = innerHeight;
    const lado = d.x < w / 2 ? 'esq' : 'dir';
    const altura = Math.round(Math.max(12, Math.min(h - 80, h - d.y - 26)));
    // velocidade nos últimos ~90 ms
    const now = performance.now();
    const recent = p.trail.filter((pt) => now - pt.t < 90);
    const a = recent[0], b = recent.at(-1);
    const speed = a && b && b.t > a.t ? Math.hypot(b.x - a.x, b.y - a.y) / (b.t - a.t) : 0;
    if (d.x < 24 || d.x > w - 24) anima.esconder(lado, altura);
    else if (speed > 1.3) {
      anima.set({ lado, altura });
      anima.jogar();
    } else {
      anima.set({ lado, altura });
      anima.arrastou();
    }
  }

  function cancel() {
    clearTimeout(longTimer);
    press = null;
    drag = null;
  }

  function send(e: SubmitEvent) {
    e.preventDefault();
    anima.falar(draft);
    draft = '';
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && anima.aberta) { e.preventDefault(); anima.fechar(); }
  }

  const heart = (cx: number, cy: number) => `M${cx},${cy + 2.6} C${cx - 4.6},${cy - 0.6} ${cx - 2.8},${cy - 4.2} ${cx},${cy - 1.6} C${cx + 2.8},${cy - 4.2} ${cx + 4.6},${cy - 0.6} ${cx},${cy + 2.6}Z`;
  const spiral = (cx: number, cy: number) => `M${cx},${cy} m-4.5,0 a4.5,4.5 0 1,1 9,0 a3.4,3.4 0 1,1 -6.8,0 a2.2,2.2 0 1,1 4.4,0 a1,1 0 1,1 -2,0`;
</script>

<svelte:window onkeydown={onkey} />

{#if flash}<div class="susto" aria-hidden="true"></div>{/if}

<div class="anima" class:esq={side === 'esq'} class:free={!!drag} class:alto={anima.tela === 'ia' && !bottom} style:--alt={bottom} style:--ring={ring}
  style:left={drag ? `${drag.x - 26}px` : null} style:top={drag ? `${drag.y - 26}px` : null}
  style:translate={drag ? null : `${jitter.x}px ${jitter.y}px`}>
  {#if anima.aberta && !drag}
    <div class="chat" role="dialog" aria-label="Conversa com a Ânima" in:pop={{ from: 0.9 }} out:vanish>
      <header>
        <b>Ânima</b><small style:color={anima.cor}>{HUMORES[anima.humor].label}</small>
        <button class="x" aria-label="Fechar conversa" onclick={() => anima.fechar()}>×</button>
      </header>
      <div class="log" bind:this={log} aria-live="polite">
        {#each anima.chat as m (m.id)}
          <p class="msg {m.de}" class:glitch={m.gesto === 'glitch'}>{m.texto}</p>
        {/each}
        {#if anima.digitando}<p class="msg ela dots" aria-label="digitando"><i></i><i></i><i></i></p>{/if}
      </div>
      <div class="quick t-scroll-x">
        {#each anima.rapidas as q (q)}
          <button class="t-chip" onclick={() => anima.falar(q)}>{q}</button>
        {/each}
      </div>
      <form onsubmit={send}>
        <input class="t-input" bind:value={draft} placeholder="fala comigo…" aria-label="Mensagem para a Ânima" autocomplete="off" enterkeyhint="send" />
        <button class="t-btn t-btn--primary" disabled={!draft.trim()}>Enviar</button>
      </form>
    </div>
  {:else if anima.balao && !drag}
    {@const b = anima.balao}
    {#key b.id + anima.chat.length}
      <div class="bubble" class:glitch={b.gesto === 'glitch'} class:ask={b.id.startsWith('pergunta#')} in:pop={{ from: 0.85 }} out:vanish role="status" aria-live="polite">
        <button class="say" onclick={() => anima.abrir()} title="Abrir a conversa"><span aria-hidden="true">{typed}</span><span class="sr">{text}</span></button>
        <button class="close" aria-label="Dispensar" onclick={() => anima.dispensarBalao()}>×</button>
        {#if b.opcoes?.length && done}
          <div class="opts" in:pop={{ from: 0.9 }}>
            {#each b.opcoes as o (o.rotulo)}
              <button class="opt" onclick={() => anima.escolher(o)}>{o.rotulo}</button>
            {/each}
          </div>
        {/if}
      </div>
    {/key}
  {:else if anima.digitando && !anima.aberta}
    <div class="bubble typing" aria-label="digitando"><p class="dots"><i></i><i></i><i></i></p></div>
  {/if}

  <button bind:this={btn} class="face" class:glitch={g === 'glitch'} class:dragging={!!drag} class:breathe={!still && !spin} class:spin class:hidden
    aria-label="Ânima. Toque para cutucar; toque longo ou duplo clique para conversar." aria-expanded={anima.aberta}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={cancel} ondblclick={() => anima.abrir()}
    oncontextmenu={(e) => e.preventDefault()}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" class="bg" />
      {#if g === 'raiva'}
        <path d="M9,13 L21,17 M39,13 L27,17" class="brow" />
      {/if}
      {#each [16, 32] as cx (cx)}
        {#if g === 'tonta'}
          <path d={spiral(cx, 23)} class="spiral" />
        {:else if g === 'feliz'}
          <path d="M{cx - 6},24.5 Q{cx},16.5 {cx + 6},24.5" class="arc" />
        {:else if g === 'calma' || blink}
          <path d="M{cx - 6},23 Q{cx},27 {cx + 6},23" class="arc" />
        {:else}
          <ellipse {cx} cy="23" rx="7" ry={stare ? 4.2 : g === 'corada' ? 6.2 : 7.8} class="white" />
          {#if g === 'coracao' || g === 'corada'}
            <path d={heart(cx + eye.x * 0.6, 23 + eye.y * 0.6)} fill={g === 'corada' ? '#ff6fa8' : iris} />
          {:else}
            {@const k = stare ? 0 : 1}
            <circle cx={cx + eye.x * k} cy={23 + eye.y * k} r={stare ? 2.6 : 4.2} fill={iris} />
            <circle cx={cx + eye.x * k} cy={23 + eye.y * k} r={stare ? 1.1 : 1.9} class="pupil" />
            <circle cx={cx + eye.x * k + 1.4} cy={21.5 + eye.y * k} r="0.9" class="spark" />
          {/if}
        {/if}
      {/each}
      {#if g === 'corada'}<ellipse cx="11" cy="32" rx="4" ry="2" class="blush" /><ellipse cx="37" cy="32" rx="4" ry="2" class="blush" />{/if}
      {#if g === 'triste'}<path d="M13,30 q1.4,2.6 0,4 q-1.4,-1.4 0,-4Z" class="tear" />{/if}
      {#if g === 'feliz' || g === 'coracao' || g === 'corada'}<path d="M19,34 Q24,37.5 29,34" class="mouth" />{/if}
      {#if g === 'tonta'}<path d="M18,35 q3,-2 6,0 q3,2 6,0" class="mouth" />{/if}
      {#if anima.humor === 'possessiva' && g !== 'calma' && g !== 'tonta'}<path d="M14,34 Q24,40 34,34" class="mouth wide" />{/if}
    </svg>
  </button>
</div>

<style>
  .anima { position: fixed; z-index: 60; right: 14px; bottom: var(--alt, calc(52px + env(safe-area-inset-bottom))); display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    pointer-events: none; transition: translate .14s steps(2), bottom .9s var(--ease); }
  /* no painel de IA ela espia por cima do ombro, longe do campo de enviar */
  .anima.alto { bottom: calc(132px + env(safe-area-inset-bottom)); }
  .anima.esq { right: auto; left: 14px; align-items: flex-start; }
  @media (max-width: 720px) {
    .anima { bottom: var(--alt, calc(112px + env(safe-area-inset-bottom))); }
    .anima.alto { bottom: calc(150px + env(safe-area-inset-bottom)); }
  }
  .anima > * { pointer-events: auto; }
  .anima.free { right: auto; bottom: auto; transition: none; }

  .face { width: 52px; height: 52px; padding: 0; border: 0; border-radius: 50%; background: none; cursor: grab; touch-action: none; -webkit-touch-callout: none; user-select: none;
    filter: drop-shadow(0 6px 14px var(--shadow)) drop-shadow(0 0 10px color-mix(in srgb, var(--ring) 45%, transparent)); transition: translate .5s var(--spring); }
  .face.dragging { cursor: grabbing; }
  /* escondida: metade para fora da tela, espiando */
  .face.hidden { translate: 64% 0; opacity: .92; }
  .esq .face.hidden { translate: -64% 0; }
  .face svg { width: 100%; height: 100%; overflow: visible; }
  .breathe svg { animation: breathe 4.8s ease-in-out infinite; }
  @keyframes breathe { 50% { transform: scale(1.04); } }
  .spin svg { animation: spin .9s cubic-bezier(.2, .7, .3, 1); }
  @keyframes spin { from { transform: rotate(0); } to { transform: rotate(900deg); } }
  .bg { fill: #0e0a10; stroke: var(--ring); stroke-width: 1.6; }
  .white { fill: #f4eef2; transition: ry .12s; }
  .pupil { fill: #050306; }
  .spark { fill: #fff; opacity: .85; }
  .arc, .brow, .mouth, .spiral { fill: none; stroke: #f4eef2; stroke-width: 2; stroke-linecap: round; }
  .spiral { stroke-width: 1.5; }
  .brow { stroke: #ff3b4e; }
  .mouth { stroke-width: 1.4; opacity: .8; }
  .mouth.wide { stroke: var(--ring); opacity: .9; }
  .blush { fill: #ff6fa8; opacity: .55; }
  .tear { fill: #8fd3ff; animation: tear 1.6s ease-in infinite; }
  @keyframes tear { from { transform: translateY(0); opacity: 1; } to { transform: translateY(6px); opacity: 0; } }
  .glitch svg, .bubble.glitch, .msg.glitch { animation: glitch .5s steps(3) 3; }
  @keyframes glitch {
    0% { transform: translate(0); filter: none; }
    33% { transform: translate(-2px, 1px); filter: drop-shadow(2px 0 0 #ff2a6d) drop-shadow(-2px 0 0 #05d9e8); }
    66% { transform: translate(2px, -1px); filter: drop-shadow(-2px 0 0 #ff2a6d) drop-shadow(2px 0 0 #05d9e8); }
  }
  .susto { position: fixed; inset: 0; z-index: 59; pointer-events: none; mix-blend-mode: screen;
    background: repeating-linear-gradient(0deg, rgba(255, 42, 109, .07) 0 2px, transparent 2px 5px); animation: susto .32s steps(4); }
  @keyframes susto { 0% { transform: translateX(-6px); opacity: 1; } 50% { transform: translateX(5px); } 100% { transform: none; opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .breathe svg, .glitch svg, .bubble.glitch, .msg.glitch, .tear, .spin svg { animation: none; } .susto { display: none; } }

  .bubble { position: relative; max-width: min(300px, calc(100vw - 28px)); padding: 0; color: var(--ink);
    font: 13.5px/1.45 var(--f-body); background: var(--surface); border: 1px solid color-mix(in srgb, var(--ring) 55%, var(--line));
    border-radius: 14px 14px 4px 14px; box-shadow: var(--elev-2), 0 0 24px -12px var(--ring); overflow-wrap: anywhere; white-space: pre-wrap; }
  .bubble.ask { border-width: 1.5px; }
  .esq .bubble { border-radius: 14px 14px 14px 4px; }
  .say { display: block; width: 100%; padding: 10px 28px 10px 12px; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
  .close { position: absolute; top: 3px; right: 4px; border: 0; background: none; color: var(--muted); font-size: 16px; line-height: 1; padding: 3px 5px; }
  .opts { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 10px 10px; }
  .opt { border: 1px solid color-mix(in srgb, var(--ring) 45%, var(--line)); background: color-mix(in srgb, var(--ring) 9%, var(--surface-2)); color: var(--ink);
    border-radius: 999px; padding: 4px 11px; font: 12.5px var(--f-body); min-height: 30px; }
  .opt:hover { border-color: var(--ring); }
  .typing { padding: 0 2px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  .chat { width: min(360px, calc(100vw - 28px)); max-height: min(62vh, 500px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto;
    background: var(--surface); border: 1px solid color-mix(in srgb, var(--ring) 50%, var(--line)); border-radius: var(--r-xl);
    box-shadow: var(--elev-3), 0 0 32px -14px var(--ring); overflow: hidden; }
  .chat header { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--line); }
  .chat header b { font: 600 14px var(--f-display); letter-spacing: .04em; }
  .chat header small { font: 11px var(--f-mono); }
  .x { margin-left: auto; border: 0; background: none; color: var(--muted); font-size: 20px; line-height: 1; }
  .log { overflow-y: auto; padding: 10px 12px; display: grid; gap: 6px; align-content: start; overscroll-behavior: contain; }
  .msg { margin: 0; max-width: 85%; padding: 7px 10px; border-radius: 12px; font-size: 13.5px; line-height: 1.45; overflow-wrap: anywhere; white-space: pre-wrap; }
  .msg.ela { justify-self: start; background: color-mix(in srgb, var(--ring) 12%, var(--surface-2)); border-bottom-left-radius: 4px; }
  .msg.voce { justify-self: end; background: var(--surface-2); color: var(--ink); border-bottom-right-radius: 4px; }
  .dots { display: flex; gap: 4px; margin: 0; padding: 10px 12px; }
  .dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: dot 1s infinite; }
  .dots i:nth-child(2) { animation-delay: .15s; }
  .dots i:nth-child(3) { animation-delay: .3s; }
  @keyframes dot { 50% { opacity: .25; transform: translateY(-2px); } }
  .quick { padding: 6px 12px 0; }
  .chat form { display: flex; gap: 6px; padding: 8px 12px 12px; }
  .chat form input { flex: 1; min-width: 0; }
</style>
