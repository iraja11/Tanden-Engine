<script lang="ts">
  import type { Gesto } from '@tanden/core';

  // O rosto da Ânima: busto gótico num camafeu. Cabelo preto longo com franja
  // reta, pele muito pálida, delineado em asa, batom preto, piercings (ponte,
  // septo, narinas e lábio), tatuagens no pescoço e no peito, blusa de renda
  // vinho. Os olhos seguem o ponteiro, piscam e mudam com a expressão; chorando,
  // o rímel escorre.
  let { gesto = 'neutro', look = { x: 0, y: 0 }, blink = false, cor = '#ff6fa8', chorando = false, size = 64, anima = true }: {
    gesto?: Gesto;
    look?: { x: number; y: number };
    blink?: boolean;
    cor?: string;
    /** rímel escorrendo (a cena das lágrimas deixa mais forte) */
    chorando?: boolean;
    size?: number;
    /** cabelo balançando e respiração */
    anima?: boolean;
  } = $props();

  const uid = $props.id();
  const g = $derived(gesto);
  const stare = $derived(g === 'olhar' || g === 'vazia' || g === 'glitch');
  const k = $derived(stare ? 0.15 : 1);
  const lx = $derived(Math.max(-1.7, Math.min(1.7, look.x * 0.65)) * k);
  const ly = $derived(Math.max(-1.1, Math.min(1.1, look.y * 0.45)) * k);
  const fechado = $derived(blink && g !== 'vazia' && g !== 'olhar' && g !== 'tonta' && g !== 'coracao');
  const iris = $derived(g === 'raiva' ? '#ff3b4e' : g === 'coracao' || g === 'corada' ? '#ff4f8b' : cor);
  const corada = $derived(g === 'corada' || g === 'coracao');
  const lagrima = $derived(chorando || g === 'triste');

  const heart = (cx: number, cy: number, r = 1) =>
    `M${cx},${cy + 2.1 * r} C${cx - 3.6 * r},${cy - 0.4 * r} ${cx - 2.2 * r},${cy - 3.3 * r} ${cx},${cy - 1.2 * r} C${cx + 2.2 * r},${cy - 3.3 * r} ${cx + 3.6 * r},${cy - 0.4 * r} ${cx},${cy + 2.1 * r}Z`;
  const spiral = (cx: number, cy: number) => `M${cx},${cy} m-3.4,0 a3.4,3.4 0 1,1 6.8,0 a2.5,2.5 0 1,1 -5,0 a1.6,1.6 0 1,1 3.2,0 a.7,.7 0 1,1 -1.4,0`;

  // olho esquerdo em 41, direito em 59; o lado diz para onde vai a asa do delineado
  const OLHOS = [{ cx: 41, lado: -1 }, { cx: 59, lado: 1 }] as const;
  const EY = 48.5;
  /** amêndoa do olho */
  const amendoa = (cx: number, lado: number, abertura: number) => {
    const a = cx - 6 * lado, b = cx + 6 * lado;
    return `M${a},${EY} Q${cx},${EY - 4.9 * abertura} ${b},${EY - 0.7} Q${cx},${EY + 3.3 * abertura} ${a},${EY}Z`;
  };
  /** delineado em asa, grosso como no retrato: sobe para fora e afina */
  const asa = (cx: number, lado: number) => {
    const ini = cx - 6.8 * lado, fim = cx + 6.4 * lado, ponta = cx + 14 * lado;
    return `M${ini},${EY + 0.6} Q${cx - 1.2 * lado},${EY - 7.4} ${fim},${EY - 2.2} L${ponta},${EY - 6.6} L${cx + 6 * lado},${EY + 0.8} Q${cx},${EY - 3.9} ${ini},${EY + 0.6}Z`;
  };
  const boca = $derived.by(() => {
    switch (g) {
      case 'feliz': case 'coracao':
        return { fora: 'M41.5,61.8 Q50,64.6 58.5,61.8 Q56.6,68.6 50,69 Q43.4,68.6 41.5,61.8Z', dentes: 'M43.6,62.9 Q50,64.9 56.4,62.9 Q55,65.6 50,65.9 Q45,65.6 43.6,62.9Z' };
      case 'sorriso':
        return { fora: 'M37.5,59.8 Q50,65.6 62.5,59.8 Q60,70.2 50,70.8 Q40,70.2 37.5,59.8Z', dentes: 'M40.4,61.6 Q50,66.4 59.6,61.6 Q58,66.4 50,67 Q42,66.4 40.4,61.6Z' };
      case 'corada':
        return { fora: 'M44.5,63 Q50,64.6 55.5,63 Q53.6,66.4 50,66.6 Q46.4,66.4 44.5,63Z', dentes: null };
      case 'triste':
        return { fora: 'M44,65.2 Q50,62.4 56,65.2 Q50,64.6 44,65.2Z', dentes: null };
      case 'raiva':
        return { fora: 'M43.5,64.4 L56.5,63.4 Q50,66.6 43.5,64.4Z', dentes: null };
      case 'vazia': case 'glitch':
        return { fora: 'M47.2,63.6 Q50,61.6 52.8,63.6 Q52.6,67.2 50,67.4 Q47.4,67.2 47.2,63.6Z', dentes: null };
      case 'tonta':
        return { fora: 'M44,64 q3,-1.8 6,0 q3,1.8 6,0 q-3,2.4 -6,0.6 q-3,-1.8 -6,-0.6Z', dentes: null };
      default:
        return { fora: 'M43.6,63.4 Q47,61.9 50,62.7 Q53,61.9 56.4,63.4 Q53.4,66.6 50,66.7 Q46.6,66.6 43.6,63.4Z', dentes: null };
    }
  });
</script>

<svg viewBox="0 0 100 100" width={size} height={size} class="rosto" class:anima class:vazia={g === 'vazia'} style:--cor={cor} aria-hidden="true">
  <defs>
    <clipPath id="{uid}-c"><circle cx="50" cy="50" r="47" /></clipPath>
    <radialGradient id="{uid}-pele" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#f6eff0" />
      <stop offset=".72" stop-color="#e9dde0" />
      <stop offset="1" stop-color="#cdbcc2" />
    </radialGradient>
    <radialGradient id="{uid}-fundo" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#241a26" />
      <stop offset="1" stop-color="#09070b" />
    </radialGradient>
    <linearGradient id="{uid}-renda" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5c0d22" />
      <stop offset="1" stop-color="#2a0611" />
    </linearGradient>
    <pattern id="{uid}-tela" width="3" height="3" patternUnits="userSpaceOnUse">
      <path d="M0,0 L3,3 M3,0 L0,3" stroke="#0a0508" stroke-width=".45" />
    </pattern>
  </defs>

  <circle cx="50" cy="50" r="47.5" fill="url(#{uid}-fundo)" />
  <g clip-path="url(#{uid}-c)">
  <g transform="translate(50 43) scale(1.1) translate(-50 -46)">
    <!-- cabelo de trás -->
    <path class="cabelo" d="M23,40 Q22,14 50,11 Q78,14 77,40 Q80,66 86,104 L14,104 Q20,66 23,40Z" />
    <g class="corpo">
      <!-- pescoço e colo -->
      <path fill="url(#{uid}-pele)" d="M42.6,64 L57.4,64 L58,75 Q72,77 84,85 L86,104 L14,104 L16,85 Q28,77 42,75Z" />
      <path d="M42.6,66 Q50,71 57.4,66 L57.6,69.4 Q50,73.6 42.4,69.4Z" fill="#cdbcc2" opacity=".55" />
      <!-- tatuagem do pescoço: letras pontudas -->
      <g class="tinta">
        <path d="M50,73.6 l-1,2.2 l1,2.2 l1,-2.2Z" class="cheio" />
        <path d="M43.4,74.6 q3.6,2.2 5.4,.8 M56.6,74.6 q-3.6,2.2 -5.4,.8 M44.6,75.2 l-.8,-1.8 M46.5,75.8 l-.4,-2 M55.4,75.2 l.8,-1.8 M53.5,75.8 l.4,-2 M47.2,77.6 l2.8,1.1 l2.8,-1.1" />
      </g>
      <!-- tatuagem do colo: dois traços curvos e um ramo -->
      <g class="tinta fina">
        <path d="M46.4,79 q-1.6,4.6 -.6,9 M53.6,79 q1.9,4.6 .8,9" />
        <path d="M19,85 q4.6,-4.4 10,-3.4 M21.6,83.6 l-1.2,-1.9 M24.6,82.4 l-.4,-2.1 M27.4,81.8 l.4,-2" />
        <path d="M61.6,79.2 h5.6 v2.2 h-5.6Z M63.5,79.2 v2.2 M65.3,79.2 v2.2" />
      </g>
      <!-- blusa de renda vinho com alcinhas -->
      <path fill="url(#{uid}-renda)" d="M10,104 L12,87.6 Q28,83 38,86.6 Q50,91 62,86.6 Q72,83 88,87.6 L90,104Z" />
      <path fill="url(#{uid}-tela)" opacity=".9" d="M10,104 L12,87.6 Q28,83 38,86.6 Q50,91 62,86.6 Q72,83 88,87.6 L90,104Z" />
      <path d="M12,87.6 Q28,83 38,86.6 Q50,91 62,86.6 Q72,83 88,87.6" class="borda-renda" />
      <path d="M25,85 L30.4,76.6 M75,85 L69.6,76.6" class="alca" />
    </g>

    <!-- mechas da frente, por cima dos ombros -->
    <path class="cabelo mecha esq" d="M28.4,34 Q24,60 21,102 L30.6,102 Q31.8,64 33.6,38Z" />
    <path class="cabelo mecha dir" d="M71.6,34 Q76,60 79,102 L69.4,102 Q68.2,64 66.4,38Z" />

    <!-- rosto -->
    <path fill="url(#{uid}-pele)" d="M31.4,44 Q31,27 50,26.4 Q69,27 68.6,44 Q68.6,58 61,67.4 Q55.8,73 50,73.4 Q44.2,73 39,67.4 Q31.4,58 31.4,44Z" />
    <!-- sombra embaixo da franja -->
    <path d="M32,41 Q50,44.4 68,41 L68,43.2 Q50,46.4 32,43.2Z" fill="#b9a7ae" opacity=".35" />

    <!-- mechas que emolduram o rosto -->
    <path class="cabelo" d="M28.2,38 Q28.6,58 34,72.6 L30.2,75 Q24.6,58 25.4,38Z" />
    <path class="cabelo" d="M71.8,38 Q71.4,58 66,72.6 L69.8,75 Q75.4,58 74.6,38Z" />

    {#if corada}
      <ellipse cx="37.4" cy="57" rx="4.4" ry="2.2" class="blush" />
      <ellipse cx="62.6" cy="57" rx="4.4" ry="2.2" class="blush" />
    {/if}

    <!-- olhos -->
    {#each OLHOS as o (o.cx)}
      <path d={asa(o.cx, o.lado)} class="delineado" />
      {#if g === 'tonta'}
        <path d={spiral(o.cx, EY)} class="espiral" />
      {:else if g === 'calma' || fechado}
        <path d="M{o.cx - 5.6},{EY} Q{o.cx},{EY + 3.4} {o.cx + 5.6},{EY - 0.4}" class="fechado" />
        <path d="M{o.cx - 3},{EY + 2} l-.8,1.8 M{o.cx},{EY + 2.5} l0,2 M{o.cx + 3},{EY + 2} l.8,1.8" class="cilio" />
      {:else if g === 'feliz' || g === 'sorriso'}
        <path d="M{o.cx - 5.6},{EY + 1} Q{o.cx},{EY - 4.2} {o.cx + 5.6},{EY + 0.6}" class="fechado" />
      {:else}
        {@const ab = g === 'olhar' ? 0.42 : g === 'raiva' ? 0.6 : g === 'corada' ? 0.85 : g === 'vazia' ? 1.12 : 1}
        <path d={amendoa(o.cx, o.lado, ab)} class="branco" class:preto={g === 'vazia'} />
        {#if g === 'vazia'}
          <circle cx={o.cx} cy={EY - 0.2} r=".7" class="ponto" />
        {:else if g === 'coracao' || g === 'corada'}
          <path d={heart(o.cx + lx, EY - 0.4 + ly, 0.95)} fill={iris} />
        {:else}
          <circle cx={o.cx + lx} cy={EY - 0.3 + ly} r={g === 'olhar' ? 1.9 : 2.5} fill={iris} />
          <circle cx={o.cx + lx} cy={EY - 0.3 + ly} r={g === 'olhar' ? 0.9 : 1.2} class="pupila" />
          <circle cx={o.cx + lx + 0.9} cy={EY - 1.3 + ly} r=".55" class="brilho" />
        {/if}
        <!-- pálpebra de cima, pesada de sombra -->
        <path d="M{o.cx - 5.8},{EY + 0.2} Q{o.cx},{EY - 4.8 * ab} {o.cx + 5.8},{EY - 0.4}" class="palpebra" />
        {#if g === 'raiva'}
          <path d="M{o.cx - 6.4 * o.lado},{EY - 5.2} L{o.cx + 4.6 * o.lado},{EY - 2.4}" class="bravo" />
        {/if}
      {/if}
    {/each}

    {#if lagrima}
      <path d="M38.4,51.6 q-.8,4 .4,7.6 q-.6,3 .2,6" class="rimel" class:forte={chorando} />
      <path d="M61.8,51.6 q.8,4.4 -.2,8 q.6,2.6 -.2,5" class="rimel" class:forte={chorando} />
    {/if}

    <!-- nariz, septo e narinas -->
    <path d="M50.4,50.6 q-1.2,4.6 -2.4,6.4 q2,1.2 4.2,.2" class="nariz" />
    <circle cx="46.9" cy="56.9" r=".62" class="prata" />
    <circle cx="53.1" cy="56.9" r=".62" class="prata" />
    <path d="M48.7,58.4 q1.3,1.9 2.6,0" class="argola" />

    <!-- boca de batom preto -->
    <path d={boca.fora} class="batom" />
    {#if boca.dentes}<path d={boca.dentes} class="dentes" />{/if}
    {#if g !== 'vazia' && g !== 'glitch' && g !== 'triste'}<path d="M46.4,63.6 q3.6,-.8 7.2,0" class="brilho-batom" />{/if}
    <!-- piercings de lábio (snakebites) e da ponte -->
    <circle cx="44.4" cy="67.6" r=".7" class="prata" />
    <circle cx="55.6" cy="67.6" r=".7" class="prata" />

    <!-- franja reta, cortada na altura das sobrancelhas -->
    <path class="cabelo franja" d="M28.6,41.4 Q27.6,17.4 50,16.4 Q72.4,17.4 71.4,41.4 L69,42 L66,41.4 L63,42.1 L60,41.5 L57,42.2 L54,41.5 L51,42.2 L48,41.5 L45,42.2 L42,41.5 L39,42.1 L36,41.4 L33,42 L30.6,41Z" />
    <path d="M36,22 Q44,19.4 52,20.6 M56,21 Q62,21.6 66,24.6 M33,28 Q35,24 38.4,22.4" class="reflexo" />
    <circle cx="46.6" cy="44" r=".7" class="prata" />
    <circle cx="53.4" cy="44" r=".7" class="prata" />
  </g>
  </g>
  <circle cx="50" cy="50" r="47.5" class="aro" />
</svg>

<style>
  .rosto { display: block; overflow: visible; }
  .aro { fill: none; stroke: var(--cor); stroke-width: 2.2; }
  .cabelo { fill: #0b090d; }
  .franja { fill: #0d0b10; }
  .reflexo { fill: none; stroke: #3a3242; stroke-width: 1; stroke-linecap: round; opacity: .8; }
  .tinta path { fill: none; stroke: #2c2531; stroke-width: .8; stroke-linecap: round; stroke-linejoin: round; }
  .tinta.fina path { stroke-width: .6; opacity: .85; }
  .tinta .cheio { fill: #2c2531; }
  .borda-renda { fill: none; stroke: #8b1d3a; stroke-width: .8; stroke-dasharray: 1.2 .8; }
  .alca { stroke: #1a0a10; stroke-width: 1.1; }
  .delineado { fill: #050306; }
  .branco { fill: #f3eeef; }
  .branco.preto { fill: #030203; }
  .ponto { fill: #fff; filter: drop-shadow(0 0 1.2px var(--cor)); }
  .pupila { fill: #050306; }
  .brilho { fill: #fff; opacity: .9; }
  .palpebra { fill: none; stroke: #120c14; stroke-width: 1.5; stroke-linecap: round; }
  .fechado { fill: none; stroke: #050306; stroke-width: 1.8; stroke-linecap: round; }
  .cilio { fill: none; stroke: #050306; stroke-width: .8; stroke-linecap: round; }
  .bravo { stroke: #050306; stroke-width: 1.6; stroke-linecap: round; }
  .espiral { fill: none; stroke: #050306; stroke-width: 1.1; }
  .blush { fill: #ff6fa8; opacity: .45; }
  .nariz { fill: none; stroke: #b29ea6; stroke-width: .7; stroke-linecap: round; }
  .prata { fill: #dedce4; stroke: #8d8a96; stroke-width: .25; }
  .argola { fill: none; stroke: #dedce4; stroke-width: .7; stroke-linecap: round; }
  .batom { fill: #0a070b; }
  .dentes { fill: #f1ece3; }
  .brilho-batom { fill: none; stroke: #5b5162; stroke-width: .5; stroke-linecap: round; opacity: .7; }
  .rimel { fill: none; stroke: #070507; stroke-width: 1; stroke-linecap: round; stroke-dasharray: 26; stroke-dashoffset: 26; animation: escorre 2.4s ease-in forwards; }
  .rimel.forte { stroke-width: 1.6; animation-duration: 4s; }
  @keyframes escorre { to { stroke-dashoffset: 0; } }

  .anima .mecha { transform-box: fill-box; transform-origin: 50% 0; animation: balanca 6.5s ease-in-out infinite; }
  .anima .mecha.dir { animation-delay: -3.1s; }
  .anima .corpo { animation: respira 4.8s ease-in-out infinite; }
  @keyframes balanca { 50% { transform: rotate(1.6deg); } }
  @keyframes respira { 50% { transform: translateY(-.8px); } }
  .vazia .aro { stroke: #b0001e; filter: drop-shadow(0 0 3px #ff1b3d); }
  @media (prefers-reduced-motion: reduce) { .anima .mecha, .anima .corpo, .rimel { animation: none; stroke-dashoffset: 0; } }
</style>
