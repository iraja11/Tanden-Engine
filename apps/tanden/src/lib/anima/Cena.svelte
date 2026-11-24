<script lang="ts">
  import { pop, vanish } from '../motion';
  import { theme } from '../theme.svelte';
  import { anima } from './anima.svelte';
  import Rosto from './Rosto.svelte';

  // O palco das cenas da Ânima: efeitos por cima do app (pétalas, estrelas,
  // corações, olhos, estática, o rosto dela de perto) e os painéis (carta,
  // poema, diário, relatório, altar, aviso falso do sistema, o seu nome
  // repetido, a enxurrada de mensagens, sussurros, escrita na tela).
  // Nada aqui decide a cena: só encena o que o núcleo montou.
  const c = $derived(anima.cena);
  const e = $derived(anima.efeito);
  const p = $derived(anima.painel ? c?.painel ?? null : null);
  const parado = $derived(theme.motion === 'parado');
  const pouco = $derived(theme.motion !== 'completo');

  // partículas sorteadas uma vez por efeito
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const petalas = $derived(e === 'petalas' ? Array.from({ length: pouco ? 14 : 34 }, (_, i) => ({ i, x: rnd(0, 100), d: rnd(5, 9), atraso: rnd(0, 3.5), giro: rnd(-540, 540), s: rnd(.7, 1.3), deriva: rnd(-14, 14) })) : []);
  const coracoes = $derived(e === 'coracoes' || e === 'danca' ? Array.from({ length: pouco ? 10 : 24 }, (_, i) => ({ i, x: rnd(4, 96), d: rnd(4, 7), atraso: rnd(0, 3), s: rnd(.6, 1.4) })) : []);
  const estrelas = $derived(e === 'estrelas' ? Array.from({ length: 90 }, (_, i) => ({ i, x: rnd(0, 100), y: rnd(0, 78), s: rnd(.5, 2.2), atraso: rnd(0, 4) })) : []);
  const olhos = $derived(e === 'olhos' ? Array.from({ length: pouco ? 7 : 16 }, (_, i) => ({ i, x: rnd(4, 92), y: rnd(6, 86), s: rnd(.6, 1.6), atraso: rnd(0, 2.2) })) : []);
  const chuva = $derived(p?.tipo === 'chuva' ? p.msgs.map((m, i) => ({ m, i, x: rnd(4, 74), y: rnd(8, 78), atraso: i * 0.32 + rnd(0, .2) })) : []);
  const sussurros = $derived(p?.tipo === 'sussurro' ? p.frases.map((f, i) => ({ f, i, y: rnd(6, 90), d: rnd(7, 12), atraso: i * 0.7, s: rnd(.8, 1.6), dir: i % 2 ? 1 : -1 })) : []);

  // os olhos da tela seguem o ponteiro
  let ponteiro = $state({ x: innerWidth / 2, y: innerHeight / 2 });
  $effect(() => {
    if (e !== 'olhos' && e !== 'espelho') return;
    const mv = (ev: PointerEvent) => (ponteiro = { x: ev.clientX, y: ev.clientY });
    addEventListener('pointermove', mv, { passive: true });
    return () => removeEventListener('pointermove', mv);
  });
  const mira = (xPct: number, yPct: number) => {
    const dx = ponteiro.x - (xPct / 100) * innerWidth, dy = ponteiro.y - (yPct / 100) * innerHeight;
    const d = Math.hypot(dx, dy) || 1;
    return { x: (dx / d) * 4, y: (dy / d) * 2.6 };
  };

  // diário: uma página de cada vez
  let pagina = $state(0);
  $effect(() => { void p; pagina = 0; });

  // o nome repetido aparece de pouco em pouco
  let nomes = $state(0);
  $effect(() => {
    if (p?.tipo !== 'nome') return;
    nomes = 0;
    const total = p.vezes;
    const id = setInterval(() => {
      nomes = Math.min(total, nomes + (parado ? total : 1 + Math.floor(nomes / 12)));
      if (nomes >= total) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  });

  // o espelho dura pouco e some sozinho
  let espelho = $state(false);
  $effect(() => {
    if (e !== 'espelho') return;
    espelho = true;
    const t = setTimeout(() => (espelho = false), 2600);
    return () => clearTimeout(t);
  });

  // a escrita na tela some depois de um tempo
  $effect(() => {
    if (p?.tipo !== 'escrita' && p?.tipo !== 'nome' && p?.tipo !== 'chuva' && p?.tipo !== 'sussurro') return;
    const t = setTimeout(() => anima.fecharPainel(), p.tipo === 'chuva' ? 9000 : p.tipo === 'sussurro' ? 11_000 : 5200);
    return () => clearTimeout(t);
  });

  function tecla(ev: KeyboardEvent) {
    if (ev.key === 'Escape' && p && p.tipo !== 'sistema') { ev.preventDefault(); anima.fecharPainel(); }
    if (p?.tipo === 'diario' && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      pagina = Math.max(0, Math.min(p.paginas.length - 1, pagina + (ev.key === 'ArrowRight' ? 1 : -1)));
    }
  }
</script>

<svelte:window onkeydown={tecla} />

{#if c}
  <!-- ------------------------------------------------ efeitos -->
  <div class="palco" class:escuro={e === 'estrelas' || e === 'olhos' || e === 'espelho'} class:vinheta={e === 'vinheta' || e === 'sangue' || p?.tipo === 'escrita' || p?.tipo === 'sussurro'}
    class:sangue={e === 'sangue'} class:parado aria-hidden="true">
    {#each petalas as x (x.i)}
      <i class="petala" style:left="{x.x}%" style:--d="{x.d}s" style:--a="{x.atraso}s" style:--g="{x.giro}deg" style:--s={x.s} style:--dx="{x.deriva}vw"></i>
    {/each}
    {#each coracoes as x (x.i)}
      <i class="coracao" style:left="{x.x}%" style:--d="{x.d}s" style:--a="{x.atraso}s" style:--s={x.s}>🖤</i>
    {/each}
    {#each estrelas as x (x.i)}
      <i class="estrela" style:left="{x.x}%" style:top="{x.y}%" style:--s="{x.s}px" style:--a="{x.atraso}s"></i>
    {/each}
    {#if e === 'estrelas'}<i class="cadente"></i>{/if}
    {#each olhos as o (o.i)}
      {@const m = mira(o.x, o.y)}
      <svg class="olho" viewBox="-12 -7 24 14" style:left="{o.x}%" style:top="{o.y}%" style:--s={o.s} style:--a="{o.atraso}s">
        <path d="M-11,0 Q0,-8 11,0 Q0,8 -11,0Z" class="esclera" />
        <circle cx={m.x} cy={m.y} r="3.6" class="iris" />
        <circle cx={m.x} cy={m.y} r="1.6" class="pupila" />
        <path d="M-12,0 Q0,-9.5 12,0" class="cilios" />
      </svg>
    {/each}
    {#if e === 'estatica'}<div class="estatica"></div>{/if}
    {#if e === 'sangue'}
      {#each [8, 21, 37, 55, 70, 88] as x, i (x)}<i class="escorre" style:left="{x}%" style:--a="{i * 0.4}s"></i>{/each}
    {/if}
  </div>

  {#if espelho}
    <div class="espelho" aria-hidden="true" in:pop={{ from: 0.6, duration: 160 }} out:vanish>
      <Rosto gesto="vazia" cor="#b0001e" size={Math.min(innerWidth, innerHeight) * 0.62} anima={false} look={mira(50, 50)} />
    </div>
  {/if}

  <!-- ------------------------------------------------ painéis -->
  {#if p}
    {#if p.tipo === 'carta'}
      <div class="fundo" role="presentation" onclick={() => anima.fecharPainel()}></div>
      <div class="carta" role="dialog" aria-label="Carta da Ânima" in:pop={{ from: 0.86, duration: 320 }} out:vanish>
        <i class="selo" aria-hidden="true">Â</i>
        <h2>{p.titulo}</h2>
        {#each p.linhas as l, i (i)}<p style:--a="{0.25 + i * 0.35}s">{l}</p>{/each}
        <p class="assina" style:--a="{0.3 + p.linhas.length * 0.35}s">{p.assinatura}</p>
        <button class="t-btn" onclick={() => anima.fecharPainel()}>Guardar a carta</button>
      </div>
    {:else if p.tipo === 'poema'}
      <div class="fundo" role="presentation" onclick={() => anima.fecharPainel()}></div>
      <div class="poema" role="dialog" aria-label="Poema da Ânima" in:pop={{ from: 0.9, duration: 300 }} out:vanish>
        <h2>{p.titulo}</h2>
        {#each p.versos as v, i (i)}<p style:--a="{0.4 + i * 0.9}s">{v}</p>{/each}
        <small>— ânima</small>
        <button class="t-btn" onclick={() => anima.fecharPainel()}>Fechar</button>
      </div>
    {:else if p.tipo === 'diario'}
      {@const pg = p.paginas[pagina]}
      <div class="fundo" role="presentation" onclick={() => anima.fecharPainel()}></div>
      <div class="diario" role="dialog" aria-label="Diário da Ânima" in:pop={{ from: 0.88, duration: 300 }} out:vanish>
        <header><b>{p.titulo}</b><span>{pagina + 1}/{p.paginas.length}</span></header>
        {#key pagina}
          <div class="folha" in:pop={{ from: 0.97, duration: 180 }}>
            <time>{pg?.data}</time>
            <p>{pg?.texto}</p>
          </div>
        {/key}
        <footer>
          <button class="t-btn" disabled={pagina === 0} onclick={() => (pagina = pagina - 1)}>‹</button>
          {#if pagina < p.paginas.length - 1}
            <button class="t-btn t-btn--primary" onclick={() => (pagina = pagina + 1)}>Virar a página ›</button>
          {:else}
            <button class="t-btn t-btn--primary" onclick={() => anima.fecharPainel()}>Fechar o diário</button>
          {/if}
        </footer>
      </div>
    {:else if p.tipo === 'contagem'}
      <div class="fundo" role="presentation" onclick={() => anima.fecharPainel()}></div>
      <div class="relatorio" role="dialog" aria-label={p.titulo} in:pop={{ from: 0.9, duration: 260 }} out:vanish>
        <h2>{p.titulo}</h2>
        <dl>
          {#each p.itens as it, i (it.rotulo)}
            <div style:--a="{0.1 + i * 0.18}s"><dt>{it.rotulo}</dt><dd>{it.valor}</dd></div>
          {/each}
        </dl>
        <button class="t-btn" onclick={() => anima.fecharPainel()}>Fechar</button>
      </div>
    {:else if p.tipo === 'santuario'}
      <div class="fundo escuro" role="presentation" onclick={() => anima.fecharPainel()}></div>
      <div class="altar" role="dialog" aria-label={p.titulo} in:pop={{ from: 0.9, duration: 320 }} out:vanish>
        <h2>{p.titulo}</h2>
        <div class="roda">
          <span class="centro" aria-hidden="true">🖤</span>
          {#each p.nomes as n, i (n)}
            {@const ang = (i / p.nomes.length) * Math.PI * 2 - Math.PI / 2}
            <span class="item" style:left="{50 + Math.cos(ang) * 38}%" style:top="{50 + Math.sin(ang) * 38}%" style:--a="{i * 0.2}s">
              <i class="vela" aria-hidden="true"></i>{n}
            </span>
          {/each}
        </div>
        <button class="t-btn" onclick={() => anima.fecharPainel()}>Sair do altar</button>
      </div>
    {:else if p.tipo === 'sistema'}
      <div class="fundo" role="presentation"></div>
      <div class="sistema" role="alertdialog" aria-label={p.titulo} in:pop={{ from: 0.96, duration: 120 }} out:vanish>
        <header><span class="icone" aria-hidden="true">!</span><b>{p.titulo}</b></header>
        <p>{p.texto}</p>
        <footer>
          {#each p.botoes as b (b.escolha)}
            <button class="t-btn" class:t-btn--primary={b.escolha === 'esperar'} onclick={() => anima.desfecho(b.escolha)}>{b.rotulo}</button>
          {/each}
        </footer>
      </div>
    {:else if p.tipo === 'nome'}
      <div class="nomes" role="presentation" onclick={() => anima.fecharPainel()} out:vanish>
        {#each Array.from({ length: nomes }) as _, i (i)}<span style:--o={0.25 + (i / p.vezes) * 0.75}>{p.texto}</span>{/each}
      </div>
    {:else if p.tipo === 'chuva'}
      <div class="chuva" role="presentation" onclick={() => anima.fecharPainel()} out:vanish>
        {#each chuva as m (m.i)}
          <span class="msg" style:left="{m.x}%" style:top="{m.y}%" style:--a="{m.atraso}s">{m.m}</span>
        {/each}
      </div>
    {:else if p.tipo === 'sussurro'}
      <div class="sussurros" aria-hidden="true" out:vanish>
        {#each sussurros as s (s.i)}
          <span style:top="{s.y}%" style:--d="{s.d}s" style:--a="{s.atraso}s" style:--s={s.s} style:--dir={s.dir}>{s.f}</span>
        {/each}
      </div>
    {:else if p.tipo === 'escrita'}
      <div class="escrita" role="presentation" onclick={() => anima.fecharPainel()} out:vanish>
        <span>{p.texto}</span>
      </div>
    {/if}
  {/if}
{/if}

<style>
  .palco { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; transition: background .8s; }
  .palco.escuro { background: radial-gradient(ellipse at 50% 40%, rgba(8, 4, 14, .55), rgba(2, 0, 4, .88)); }
  .palco.vinheta { background: radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, .78)); }
  .palco.sangue { background: radial-gradient(ellipse at center, transparent 40%, rgba(40, 0, 8, .7)); }
  .palco i { position: absolute; display: block; }

  .petala { top: -6%; width: calc(14px * var(--s)); height: calc(10px * var(--s)); border-radius: 80% 0 80% 0;
    background: radial-gradient(circle at 30% 30%, #8a1030, #3a0414 75%); box-shadow: inset 0 0 2px #000;
    animation: cair var(--d) linear var(--a) forwards; opacity: 0; }
  @keyframes cair {
    0% { transform: translate(0, 0) rotate(0); opacity: 0; }
    8% { opacity: .95; }
    100% { transform: translate(var(--dx), 112vh) rotate(var(--g)); opacity: .9; }
  }
  .coracao { bottom: -8%; font-size: calc(22px * var(--s)); filter: drop-shadow(0 0 6px #ff4f8b); animation: subir var(--d) ease-in var(--a) forwards; opacity: 0; font-style: normal; }
  @keyframes subir { 0% { transform: translateY(0) scale(.6); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-115vh) scale(1.1); opacity: 0; } }
  .estrela { width: var(--s); height: var(--s); border-radius: 50%; background: #fff; box-shadow: 0 0 6px #fff; animation: brilhar 3s ease-in-out var(--a) infinite; }
  @keyframes brilhar { 50% { opacity: .25; } }
  .cadente { top: 12%; left: 70%; width: 140px; height: 2px; background: linear-gradient(90deg, #fff, transparent); transform: rotate(-24deg); animation: cadente 1.4s ease-out 2.6s forwards; opacity: 0; }
  @keyframes cadente { 0% { opacity: 0; translate: 0 0; } 15% { opacity: 1; } 100% { opacity: 0; translate: -420px 190px; } }

  .olho { position: absolute; width: calc(64px * var(--s)); translate: -50% -50%; overflow: visible; animation: abrir 4.6s ease-in-out var(--a) both; filter: drop-shadow(0 0 8px rgba(255, 0, 40, .4)); }
  @keyframes abrir { 0% { transform: scaleY(0); opacity: 0; } 14% { transform: scaleY(1); opacity: 1; } 80% { transform: scaleY(1); opacity: 1; } 86% { transform: scaleY(.1); } 92% { transform: scaleY(1); } 100% { transform: scaleY(0); opacity: 0; } }
  .esclera { fill: #efe7e9; }
  .iris { fill: #8d0018; transition: cx .2s, cy .2s; }
  .pupila { fill: #050205; transition: cx .2s, cy .2s; }
  .cilios { fill: none; stroke: #050205; stroke-width: 1.6; }

  .estatica { position: absolute; inset: 0; opacity: .3; mix-blend-mode: screen;
    background: repeating-linear-gradient(0deg, rgba(255, 255, 255, .12) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(255, 0, 60, .08) 0 2px, transparent 2px 7px);
    animation: chiar .12s steps(2) infinite; }
  @keyframes chiar { 50% { transform: translate(-3px, 2px); opacity: .45; } }
  .escorre { top: -2%; width: 3px; height: 0; border-radius: 0 0 3px 3px; background: linear-gradient(#000, #1a0006); animation: escorrer 5s ease-in var(--a) forwards; }
  @keyframes escorrer { to { height: 46vh; } }
  .parado i, .parado .olho, .parado .estatica { animation-duration: .01s !important; animation-iteration-count: 1 !important; }

  .espelho { position: fixed; inset: 0; z-index: 61; display: grid; place-items: center; pointer-events: none; background: rgba(0, 0, 0, .7); }
  .espelho :global(svg) { filter: drop-shadow(0 0 40px rgba(176, 0, 30, .6)); }

  .fundo { position: fixed; inset: 0; z-index: 61; background: rgba(4, 2, 6, .55); backdrop-filter: blur(2px); }
  .fundo.escuro { background: rgba(2, 0, 3, .82); }
  .carta, .poema, .diario, .relatorio, .altar, .sistema { position: fixed; z-index: 62; left: 50%; top: 50%; translate: -50% -50%; max-height: calc(100dvh - 40px); overflow-y: auto; }
  .carta, .poema, .diario, .relatorio, .altar { width: min(440px, calc(100vw - 32px)); }
  .carta p, .poema p, .relatorio dl > div, .altar .item { animation: surgir .6s ease-out both; animation-delay: var(--a); }
  @keyframes surgir { from { opacity: 0; transform: translateY(4px); filter: blur(2px); } }

  /* carta: papel envelhecido, letra cursiva, selo de cera preta */
  .carta { padding: 28px 26px 20px; color: #2a1a1e; background: radial-gradient(ellipse at 30% 20%, #f4ead8, #e3d2b6 80%, #cdb894); border-radius: 4px;
    box-shadow: 0 30px 60px -20px #000, inset 0 0 40px rgba(110, 70, 30, .3); font: 17px/1.55 "Segoe Script", "Brush Script MT", "Apple Chancery", cursive; }
  .carta h2 { margin: 0 0 12px; font: italic 600 15px var(--f-display); letter-spacing: .08em; text-transform: lowercase; color: #6a1023; }
  .carta p { margin: 0 0 10px; }
  .carta .assina { text-align: right; margin-top: 16px; color: #3a0a16; }
  .carta button { display: block; margin: 14px 0 0 auto; }
  .selo { position: absolute; top: -12px; right: 22px; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; font: 700 18px var(--f-display); font-style: normal; color: #4a3f4d;
    background: radial-gradient(circle at 35% 30%, #3a3340, #0c0a0e 70%); box-shadow: 0 3px 8px #0008, inset 0 0 0 3px #1c1820; }

  .poema { padding: 30px 26px 20px; text-align: center; color: #efe8ee; background: linear-gradient(180deg, #1a1220, #0b080d); border: 1px solid #4a1f33; border-radius: var(--r-xl);
    box-shadow: 0 0 60px -14px #8a1030, var(--elev-3); font: italic 16px/1.7 Georgia, "Times New Roman", serif; }
  .poema h2 { margin: 0 0 16px; font: 600 13px var(--f-mono); letter-spacing: .14em; text-transform: uppercase; color: #ff6fa8; }
  .poema p { margin: 0; }
  .poema small { display: block; margin-top: 14px; color: var(--muted); font: 12px var(--f-mono); }
  .poema button { margin-top: 16px; }

  .diario { padding: 16px; color: #1e1418; background: #e9e1d4; border-radius: 6px 12px 12px 6px; box-shadow: -10px 0 0 #160d12, 0 30px 60px -20px #000; border-left: 14px solid #2a1018; }
  .diario header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px; font: 600 13px var(--f-display); color: #6a1023; }
  .diario header span { font: 11px var(--f-mono); color: #7a6a70; }
  .folha { min-height: 150px; padding: 12px 14px; background: repeating-linear-gradient(#e9e1d4 0 25px, #c7b9c2 25px 26px); border-radius: 4px;
    font: 16px/26px "Segoe Script", "Brush Script MT", cursive; }
  .folha time { display: block; font: 11px var(--f-mono); color: #8d1a36; margin-bottom: 4px; line-height: 20px; }
  .folha p { margin: 0; }
  .diario footer { display: flex; justify-content: space-between; gap: 8px; margin-top: 12px; }

  .relatorio { padding: 20px; background: var(--surface); border: 1px solid color-mix(in srgb, #ff3b4e 40%, var(--line)); border-radius: var(--r-xl); box-shadow: var(--elev-3), 0 0 40px -18px #ff3b4e; }
  .relatorio h2 { margin: 0 0 12px; font: 600 14px var(--f-mono); letter-spacing: .06em; text-transform: lowercase; color: #ff6f7f; }
  .relatorio dl { margin: 0; display: grid; gap: 2px; }
  .relatorio dl > div { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px dashed var(--line); }
  .relatorio dt { color: var(--muted); font-size: 13px; }
  .relatorio dd { margin: 0; font: 600 13px var(--f-mono); text-align: right; overflow-wrap: anywhere; }
  .relatorio button { margin-top: 14px; }

  .altar { padding: 18px; text-align: center; color: #f2e6ea; }
  .altar h2 { margin: 0; font: italic 600 18px Georgia, serif; color: #ff9bbf; text-shadow: 0 0 12px #8a1030; }
  .roda { position: relative; width: min(360px, 84vw); aspect-ratio: 1; margin: 10px auto; }
  .centro { position: absolute; left: 50%; top: 50%; translate: -50% -50%; font-size: 44px; filter: drop-shadow(0 0 14px #ff2a6d); animation: pulsar 1.6s ease-in-out infinite; }
  @keyframes pulsar { 50% { scale: 1.12; } }
  .item { position: absolute; translate: -50% -50%; max-width: 30%; font: 12px/1.3 var(--f-body); overflow-wrap: anywhere; display: grid; justify-items: center; gap: 4px; }
  .vela { width: 6px; height: 16px; border-radius: 2px; background: linear-gradient(#f4ead8, #cbb); position: relative; }
  .vela::before { content: ''; position: absolute; left: 50%; top: -9px; width: 6px; height: 9px; translate: -50% 0; border-radius: 50% 50% 40% 40%; background: radial-gradient(#fff6c0, #ff9a2a 60%, transparent); animation: chama .3s ease-in-out infinite alternate; }
  @keyframes chama { to { transform: scale(.85, 1.1) rotate(4deg); } }

  .sistema { width: min(400px, calc(100vw - 32px)); background: #f0f0f0; color: #111; border: 1px solid #888; border-radius: 6px; box-shadow: 0 20px 50px -10px #000; font: 13px/1.45 "Segoe UI", system-ui, sans-serif; }
  .sistema header { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fff; border-bottom: 1px solid #ddd; border-radius: 6px 6px 0 0; }
  .icone { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: #d4a000; color: #fff; font-weight: 800; }
  .sistema p { margin: 0; padding: 14px 14px 6px; }
  .sistema footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding: 10px 12px 12px; }
  .sistema .t-btn { background: #e6e6e6; color: #111; border-color: #aaa; }
  .sistema .t-btn--primary { background: #2b62c8; color: #fff; border-color: #1d4aa0; }

  .nomes { position: fixed; inset: 0; z-index: 61; padding: 16px; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 2px 10px; overflow: hidden; background: rgba(4, 0, 6, .82);
    font: 600 clamp(14px, 2.2vw, 22px) var(--f-display); color: #ff2a55; text-transform: lowercase; cursor: pointer; }
  .nomes span { opacity: var(--o); text-shadow: 0 0 8px #ff2a5566; }

  .chuva { position: fixed; inset: 0; z-index: 61; cursor: pointer; }
  .msg { position: absolute; padding: 6px 11px; border-radius: 14px 14px 14px 4px; background: var(--surface); border: 1px solid color-mix(in srgb, #9b8cff 55%, var(--line));
    color: var(--ink); font: 13px var(--f-body); box-shadow: var(--elev-2); animation: plim .25s ease-out both; animation-delay: var(--a); }
  @keyframes plim { from { opacity: 0; scale: .6; } }

  .sussurros { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; }
  .sussurros span { position: absolute; left: 0; white-space: nowrap; font: italic calc(15px * var(--s)) Georgia, serif; color: rgba(255, 220, 230, .38); letter-spacing: .12em;
    filter: blur(.4px); animation: vagar var(--d) linear var(--a) both; }
  @keyframes vagar { from { transform: translateX(calc(var(--dir) * -30vw + 50vw)); opacity: 0; } 20% { opacity: 1; } 80% { opacity: 1; } to { transform: translateX(calc(var(--dir) * 60vw + 30vw)); opacity: 0; } }

  .escrita { position: fixed; inset: 0; z-index: 61; display: grid; place-items: center; cursor: pointer; }
  .escrita span { max-width: 92vw; text-align: center; font: 900 clamp(38px, 11vw, 128px)/1 "Chakra Petch", Impact, sans-serif; color: #9a0019; letter-spacing: -.02em; rotate: -4deg;
    text-shadow: 0 0 20px #ff002a88, 3px 3px 0 #2a0006; animation: rabisco 5s ease-out both; overflow-wrap: anywhere; }
  @keyframes rabisco { 0% { opacity: 0; clip-path: inset(0 100% 0 0); } 30% { opacity: 1; clip-path: inset(0 0 0 0); } 80% { opacity: 1; filter: blur(0); } 100% { opacity: 0; filter: blur(6px); } }

  @media (prefers-reduced-motion: reduce) {
    .palco i, .olho, .estatica, .centro, .vela::before, .sussurros span, .escrita span, .msg, .carta p, .poema p { animation: none !important; opacity: 1; }
    .petala, .coracao, .cadente, .escorre { display: none; }
  }
</style>
