<script lang="ts">
  import { seededRng, type EstiloPlaneta, type Genero } from '@tanden/core';
  import { theme } from '../../../theme.svelte';

  // O mundo visto de longe. Nasce como uma brasa e cresce a cada era: ganha chão,
  // mares, nuvens, anéis e luas. Cada ficha acende uma luz, cada história vira uma
  // lua, e contradições aparecem como tempestades.
  let { nome, genero, era, fichas = 0, historias = 0, tempestades = 0, size = 64, adorno }: {
    nome: string;
    genero: Genero;
    /** índice da era, de 0 a 6 */
    era: number;
    fichas?: number;
    historias?: number;
    tempestades?: number;
    size?: number;
    /** relíquia escolhida na vitrine (lua de prata, cometa, aurora...) */
    adorno?: string;
  } = $props();

  const uid = $props.id();
  const RAIOS = [30, 52, 66, 76, 82, 84, 86];
  const raio = $derived(RAIOS[Math.min(6, Math.max(0, era))]!);
  const detalhe = $derived(size >= 96);
  const anima = $derived(theme.motion === 'completo');
  const c = $derived(genero.cores);

  function semente(s: string): number {
    let h = 7;
    for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i) | 0;
    return Math.abs(h);
  }

  /** Mancha orgânica: raio irregular em volta de um centro, com cantos suaves. */
  function mancha(rng: () => number, x: number, y: number, r: number): string {
    const n = 11;
    const pts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const d = r * (0.62 + rng() * 0.6);
      return [x + Math.cos(a) * d * 1.25, y + Math.sin(a) * d] as const;
    });
    const meio = (p: readonly [number, number], q: readonly [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
    const ini = meio(pts[n - 1]!, pts[0]!);
    let d = `M${ini[0].toFixed(1)} ${ini[1].toFixed(1)}`;
    pts.forEach((p, i) => {
      const m = meio(p, pts[(i + 1) % n]!);
      d += `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
    });
    return `${d}Z`;
  }

  // a superfície é uma faixa de 200 de largura, repetida para girar sem emenda
  const terras = $derived.by(() => {
    const rng = seededRng(semente(nome));
    const qtd = 3 + Math.min(era, 5);
    return Array.from({ length: qtd }, (_, i) => {
      const x = ((i + rng() * 0.7) / qtd) * 200;
      const y = 45 + rng() * 110;
      const r = 13 + rng() * 17;
      return { x, y, r, d: mancha(rng, x, y, r) };
    });
  });
  const nuvens = $derived.by(() => {
    const rng = seededRng(semente(nome) + 9);
    return Array.from({ length: 6 }, () => mancha(rng, rng() * 200, 30 + rng() * 140, 6 + rng() * 10));
  });
  const luzes = $derived.by(() => {
    const rng = seededRng(semente(nome) + 3);
    const lista = terras;
    return Array.from({ length: Math.min(fichas, detalhe ? 54 : 12) }, () => {
      const t = lista[Math.floor(rng() * lista.length)]!;
      return { x: t.x + (rng() - 0.5) * t.r * 1.4, y: t.y + (rng() - 0.5) * t.r, r: 0.8 + rng() * 1.1, d: rng() * 3 };
    });
  });
  const LINHAS: EstiloPlaneta[] = ['neon', 'engrenagem', 'antigo', 'orbital'];
  const temAnel = $derived(era >= 4 || (era >= 2 && (genero.estilo === 'orbital' || genero.estilo === 'estelar' || genero.estilo === 'engrenagem')));
  const luas = $derived(Math.min(3, historias));
  // estrelas da constelação e faíscas dos fogos: fixas pelo nome
  const estrelas = $derived.by(() => {
    const rng = seededRng(semente(nome) + 21);
    return Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.4;
      const d = 92 + rng() * 10;
      return { x: 100 + Math.cos(a) * d, y: 100 + Math.sin(a) * d, r: 1.2 + rng() * 1.6 };
    });
  });
  const fogos = $derived.by(() => {
    const rng = seededRng(semente(nome) + 33);
    return Array.from({ length: 4 }, (_, i) => ({ x: 100 + Math.cos(i * 1.7 + 0.6) * 96, y: 100 + Math.sin(i * 1.7 + 0.6) * 90, cor: ['#ffd166', '#ef476f', '#06d6a0', '#a78bfa'][i]!, d: rng() * 2.4 }));
  });
</script>

{#snippet superficie()}
  {#each terras as t, i (i)}
    <path d={t.d} fill={era >= 2 ? c.terra : `color-mix(in srgb, ${c.terra} 45%, #4a4038)`} />
    {#if genero.estilo === 'cristal' && era >= 2}<path d={`M${t.x - t.r * .5} ${t.y}L${t.x} ${t.y - t.r * .6}L${t.x + t.r * .5} ${t.y}L${t.x} ${t.y + t.r * .6}Z`} fill={c.luz} opacity=".28" />{/if}
    {#if genero.estilo === 'engrenagem' && era >= 2}<circle cx={t.x} cy={t.y} r={t.r * .55} fill="none" stroke={c.luz} stroke-width="2.4" stroke-dasharray="3 3" opacity=".6" />{/if}
    {#if genero.estilo === 'ruina' && era >= 1}<path d={`M${t.x - t.r} ${t.y - 4}l${t.r * .6} 6l${t.r * .5} -7l${t.r * .7} 8`} fill="none" stroke={c.luz} stroke-width="1.2" opacity=".75" />{/if}
    {#if genero.estilo === 'abismo' && era >= 2}<path d={`M${t.x - t.r * .8} ${t.y}q${t.r * .4} ${-t.r * .7} ${t.r * .8} 0t${t.r * .8} 0`} fill="none" stroke={c.luz} stroke-width=".9" opacity=".55" />{/if}
    {#if genero.estilo === 'coracao' && era >= 2}<path d={`M${t.x} ${t.y + 5}c-7 -5 -7 -11 -2.5 -11c1.5 0 2.5 1 2.5 2c0 -1 1 -2 2.5 -2c4.5 0 4.5 6 -2.5 11Z`} fill={c.luz} opacity=".7" />{/if}
    {#if genero.estilo === 'jardim' && era >= 2}<circle cx={t.x - 4} cy={t.y} r="2.4" fill={c.luz} opacity=".8" /><circle cx={t.x + 5} cy={t.y + 4} r="1.8" fill="#fff" opacity=".6" />{/if}
    {#if genero.estilo === 'estranho' && era >= 2}<circle cx={t.x} cy={t.y} r={t.r * .32} fill="none" stroke={c.luz} stroke-width="1.5" opacity=".7" /><circle cx={t.x} cy={t.y} r={t.r * .1} fill={c.luz} />{/if}
  {/each}
  {#if LINHAS.includes(genero.estilo) && era >= 2}
    {#each [40, 80, 120, 160] as y (y)}<line x1="0" x2="200" y1={y} y2={y} stroke={c.luz} stroke-width=".5" opacity=".28" />{/each}
    {#each [25, 75, 125, 175] as x (x)}<line x1={x} x2={x} y1="0" y2="200" stroke={c.luz} stroke-width=".5" opacity=".28" />{/each}
  {/if}
  {#if era >= 2}
    {#each luzes as l, i (i)}<circle class="luz" cx={l.x} cy={l.y} r={l.r} fill={c.luz} style:animation-delay="{l.d}s" />{/each}
  {/if}
{/snippet}

<svg class="planeta" class:anima width={size} height={size} viewBox="0 0 200 200" role="img" aria-label={`${nome}: planeta na era ${era + 1} de 7`}>
  <defs>
    <clipPath id="{uid}-disco"><circle cx="100" cy="100" r={raio} /></clipPath>
    <radialGradient id="{uid}-aura"><stop offset=".55" stop-color={era === 0 ? c.luz : c.ar} stop-opacity=".5" /><stop offset="1" stop-color={c.ar} stop-opacity="0" /></radialGradient>
    <radialGradient id="{uid}-sombra" cx=".36" cy=".32" r=".82"><stop offset="0" stop-color="#fff" stop-opacity=".2" /><stop offset=".42" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".72" /></radialGradient>
    <filter id="{uid}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
    <linearGradient id="{uid}-aurora" x1="0" x2="1"><stop offset="0" stop-color="#06d6a0" stop-opacity="0" /><stop offset=".3" stop-color="#06d6a0" /><stop offset=".65" stop-color="#7b6cf6" /><stop offset="1" stop-color="#ef6f9a" stop-opacity="0" /></linearGradient>
    <linearGradient id="{uid}-cometa" x1="1" x2="0"><stop offset="0" stop-color="#fff" /><stop offset=".25" stop-color="#9ad7ff" stop-opacity=".8" /><stop offset="1" stop-color="#9ad7ff" stop-opacity="0" /></linearGradient>
    <radialGradient id="{uid}-brasa"><stop offset="0" stop-color="#fff" /><stop offset=".35" stop-color={c.luz} /><stop offset="1" stop-color={c.terra} /></radialGradient>
  </defs>

 {#if adorno === 'nebulosa'}
    <g class="adorno nebulosa" opacity=".55">
      <ellipse cx="62" cy="70" rx="46" ry="30" fill="#b277ee" filter="url(#{uid}-blur)" />
      <ellipse cx="140" cy="128" rx="50" ry="28" fill="#4fc1c9" filter="url(#{uid}-blur)" />
      <ellipse cx="128" cy="58" rx="30" ry="20" fill="#ef6f9a" filter="url(#{uid}-blur)" />
    </g>
  {:else if adorno === 'coroa-solar'}
    <g class="adorno coroa-solar" style:transform-origin="100px 100px">
      {#each Array.from({ length: 24 }) as _, i (i)}<path d="M100 {100 - raio - 4}l-3 -14l3 4l3 -4z" fill="#ffb347" opacity=".85" transform="rotate({i * 15} 100 100)" />{/each}
      <circle cx="100" cy="100" r={raio + 8} fill="none" stroke="#ffd166" stroke-width="3" opacity=".55" filter="url(#{uid}-blur)" />
    </g>
  {:else if adorno === 'olho-cosmico'}
    <g class="adorno olho-cosmico">
      <path d="M2 100Q100 18 198 100Q100 182 2 100Z" fill="none" stroke="#b277ee" stroke-width="2.2" opacity=".8" />
      <path d="M14 100Q100 34 186 100Q100 166 14 100Z" fill="#b277ee" opacity=".12" />
    </g>
  {:else if adorno === 'constelacao'}
    <g class="adorno constelacao">
      <polyline points={estrelas.map((e) => `${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(' ')} fill="none" stroke={c.luz} stroke-width=".7" opacity=".45" />
      {#each estrelas as e, i (i)}<circle class="estrela" cx={e.x} cy={e.y} r={e.r} fill="#fff" style:animation-delay="{i * .4}s" />{/each}
    </g>
  {/if}

  <circle class="aura" cx="100" cy="100" r={Math.min(99, raio + 14 + era * 1.2)} fill="url(#{uid}-aura)" />

  {#if temAnel}<ellipse cx="100" cy="100" rx={Math.min(98, raio + 13)} ry="15" fill="none" stroke={c.luz} stroke-width="3" opacity=".42" transform="rotate(-18 100 100)" />{/if}

  {#if era === 0}
    <circle class="brasa" cx="100" cy="100" r={raio} fill="url(#{uid}-brasa)" />
    {#each [0, 72, 144, 216, 288] as a (a)}<circle class="poeira" cx="100" cy={100 - raio - 12} r="1.8" fill={c.luz} style:transform-origin="100px 100px" style:rotate="{a}deg" />{/each}
  {:else}
    <g clip-path="url(#{uid}-disco)">
      <rect width="200" height="200" fill={c.mar} />
      <g class="gira">
        {@render superficie()}
        <g transform="translate(200 0)">{@render superficie()}</g>
      </g>
      {#if era >= 3 && detalhe}
        <g class="nuvens" fill="#fff" opacity=".22">
          {#each nuvens as d, i (i)}<path {d} />{/each}
          <g transform="translate(200 0)">{#each nuvens as d, i (i)}<path {d} />{/each}</g>
        </g>
      {/if}
      {#each Array.from({ length: Math.min(tempestades, 4) }) as _, i (i)}
        <circle class="tempestade" cx={70 + i * 24} cy={74 + (i % 2) * 44} r={detalhe ? 12 : 16} fill="#d9363e" opacity=".55" />
      {/each}
      <circle cx="100" cy="100" r={raio} fill="url(#{uid}-sombra)" />
    </g>
    <circle cx="100" cy="100" r={raio} fill="none" stroke={c.ar} stroke-width="1.5" opacity=".65" />
    {#if genero.estilo === 'abismo' && era >= 5}
      <path class="olho" d="M72 100q28 -22 56 0q-28 22 -56 0Z" fill="#061413" stroke={c.luz} stroke-width="1.4" /><ellipse cx="100" cy="100" rx="3.4" ry="10" fill={c.luz} />
    {/if}
  {/if}

  {#if temAnel}
    <path d={`M${100 - Math.min(98, raio + 13)} 100a${Math.min(98, raio + 13)} 15 0 0 0 ${2 * Math.min(98, raio + 13)} 0`} fill="none" stroke={c.luz} stroke-width="3" opacity=".8" transform="rotate(-18 100 100)" />
  {/if}

  {#each Array.from({ length: luas }) as _, i (i)}
    <g class="orbita" style:animation-duration="{14 + i * 7}s" style:transform-origin="100px 100px">
      <circle cx="100" cy={Math.max(5, 100 - raio - 8 - i * 3)} r={4 - i * .6} fill="#e9e6da" />
    </g>
  {/each}

 {#if adorno === 'lua-prata'}
    <g class="adorno orbita" style:animation-duration="30s" style:transform-origin="100px 100px">
      <circle cx="100" cy="6" r="7" fill="#dfe6ee" /><circle cx="97.5" cy="4" r="1.6" fill="#b8c2cc" /><circle cx="102.5" cy="8.5" r="1.1" fill="#b8c2cc" />
    </g>
  {:else if adorno === 'cometa'}
    <g class="adorno cometa"><path d="M178 26 108 52" stroke="url(#{uid}-cometa)" stroke-width="4" stroke-linecap="round" /><circle cx="178" cy="26" r="3.6" fill="#fff" /></g>
  {:else if adorno === 'aurora'}
    <g class="adorno aurora" opacity=".85">
      <path d="M{100 - raio * .8} {100 - raio * .78}q{raio * .4} -16 {raio * .8} -4t{raio * .8} 2" fill="none" stroke="url(#{uid}-aurora)" stroke-width="5" stroke-linecap="round" />
      <path d="M{100 - raio * .6} {100 - raio * .9}q{raio * .3} -12 {raio * .6} -3t{raio * .6} 1" fill="none" stroke="url(#{uid}-aurora)" stroke-width="3" stroke-linecap="round" opacity=".7" />
    </g>
  {:else if adorno === 'aneis'}
    <g class="adorno" fill="none" stroke-width="2.2" opacity=".8">
      <ellipse cx="100" cy="100" rx={Math.min(98, raio + 16)} ry="20" stroke="#e8c547" transform="rotate(28 100 100)" />
      <ellipse cx="100" cy="100" rx={Math.min(98, raio + 16)} ry="20" stroke="#9ad7ff" transform="rotate(-28 100 100)" />
    </g>
  {:else if adorno === 'satelites'}
    {#each [0, 1, 2, 3, 4] as i (i)}
      <g class="adorno orbita" style:animation-duration="{8 + i * 3}s" style:animation-direction={i % 2 ? 'reverse' : 'normal'} style:transform-origin="100px 100px" style:rotate="{i * 70}deg">
        <circle cx="100" cy={100 - raio - 10 - i * 3} r="1.8" fill={c.luz} />
      </g>
    {/each}
  {:else if adorno === 'fogos'}
    {#each fogos as f, i (i)}
      <g class="adorno fogo" style:animation-delay="{f.d}s" style:transform-origin="{f.x}px {f.y}px">
        {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}<line x1={f.x} y1={f.y} x2={f.x} y2={f.y - 8} stroke={f.cor} stroke-width="1.6" stroke-linecap="round" transform="rotate({a} {f.x} {f.y})" />{/each}
      </g>
    {/each}
  {/if}

  {#if era >= 6}<circle class="coroa" cx="100" cy="100" r={raio + 5} fill="none" stroke={c.luz} stroke-width="1.5" stroke-dasharray="2 9" style:transform-origin="100px 100px" />{/if}
</svg>

<style>
  .planeta { display: block; flex: none; overflow: visible; }
  .aura { opacity: .75; }
  .luz { opacity: .95; }
  .anima .gira { animation: girar 70s linear infinite; }
  .anima .nuvens { animation: girar 42s linear infinite; }
  .anima .luz { animation: piscar 3.6s ease-in-out infinite; }
  .anima .brasa { animation: pulsar 2.8s ease-in-out infinite; transform-origin: 100px 100px; }
  .anima .aura { animation: respirar 5s ease-in-out infinite; transform-origin: 100px 100px; }
  .anima .orbita { animation: orbitar linear infinite; }
  .anima .coroa { animation: orbitar 40s linear infinite; }
  .anima .poeira { animation: orbitar 12s linear infinite; }
  .anima .tempestade { animation: piscar 2s ease-in-out infinite; }
  .anima .coroa-solar { animation: orbitar 60s linear infinite; }
  .anima .nebulosa { animation: respirar 9s ease-in-out infinite; transform-origin: 100px 100px; }
  .anima .estrela { animation: piscar 2.6s ease-in-out infinite; }
  .anima .cometa { animation: cometa 7s ease-in-out infinite; }
  .anima .aurora { animation: piscar 4s ease-in-out infinite; }
  .anima .fogo { animation: estourar 2.8s ease-out infinite; }
  .anima .olho-cosmico { animation: respirar 6s ease-in-out infinite; transform-origin: 100px 100px; }
  @keyframes cometa { 0% { translate: 40px -20px; opacity: 0; } 15% { opacity: 1; } 60% { translate: -60px 30px; opacity: 0; } 100% { translate: -60px 30px; opacity: 0; } }
  @keyframes estourar { 0% { scale: .2; opacity: 0; } 15% { opacity: 1; } 60% { scale: 1.15; opacity: 0; } 100% { opacity: 0; } }
  @keyframes girar { to { transform: translateX(-200px); } }
  @keyframes orbitar { to { transform: rotate(360deg); } }
  @keyframes piscar { 50% { opacity: .35; } }
  @keyframes pulsar { 50% { transform: scale(1.1); } }
  @keyframes respirar { 50% { opacity: .45; transform: scale(1.04); } }
</style>
