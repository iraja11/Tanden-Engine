<script lang="ts" module>
  import { speciesDrawing, speciesFigure } from '@tanden/core';

  // Referências de escala: uma pessoa e, para os bichos miúdos, uma maçã.
  const PESSOA = speciesDrawing(speciesFigure({ corpo: 'bípede', altura: '1,75', cabeça: 'humana', orelhas: 'humanas', extremidades: 'mãos' }));
  const PESSOA_D = PESSOA.camadas.flat().filter((s) => s.linha === undefined && s.contorno).map((s) => s.d);
  let nextId = 0;
</script>

<script lang="ts">
  import type { SpeciesFigure, SpeciesPaint, SpeciesShape } from '@tanden/core';

  // Retrato da espécie, desenhado pelo núcleo a partir da ficha. Aqui só se
  // pinta: cada camada ganha um contorno único, a cor, a textura do revestimento
  // e o padrão. Com `compare`, uma referência ao lado mostra o tamanho real.
  let { fig, compare = false, size = 160, label = '' }: { fig: SpeciesFigure; compare?: boolean; size?: number; label?: string } = $props();

  const uid = `esp${++nextId}`;
  const draw = $derived(speciesDrawing(fig));
  const box = $derived(draw.box);

  // ------------------------------------------------ enquadramento
  /** metros por unidade do desenho */
  const mPerUnit = $derived(fig.altura / box.h);
  const tiny = $derived(fig.altura < 0.3);
  const refM = $derived(tiny ? 0.08 : 1.75);
  const refH = $derived(refM / mPerUnit);
  const refW = $derived(tiny ? refH : refH * (PESSOA.box.w / PESSOA.box.h));
  const groundY = $derived(box.y + box.h);
  const lift = $derived(draw.flutua && compare ? box.h * 0.06 : 0);
  const gap = $derived(Math.max(box.w, refW) * 0.12);

  const view = $derived.by(() => {
    if (!compare) {
      const pad = Math.max(box.w, box.h) * 0.05;
      return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
    }
    const tall = Math.max(box.h + lift, refH);
    const padY = tall * 0.13;
    const padX = Math.max(box.w + refW, tall) * 0.05;
    return { x: box.x - gap - refW - padX, y: groundY - tall - padY, w: box.w + gap + refW + padX * 2, h: tall + padY + tall * 0.03 };
  });
  const stroke = $derived((view.h / size) * 1.5);
  const fs = $derived(view.h * 0.05);
  const refX = $derived(box.x - gap - refW);
  const mark = (m: number) => (m >= 10 ? String(Math.round(m)) : m >= 1 ? m.toFixed(1).replace('.', ',') : m >= 0.1 ? m.toFixed(2).replace('.', ',') : m.toFixed(3).replace('.', ','));
  const titulo = $derived(fig.medida < 1 ? `${Math.round(fig.medida * 100)} cm` : `${mark(fig.medida)} m`);

  // ------------------------------------------------ tintas
  const paint = (p: SpeciesPaint) => (p === 'base' ? `url(#${uid}-g)` : draw.cores.paints[p]);
  const hasAura = $derived(fig.marcas.includes('aura'));
  const glowColor = $derived(draw.cores.paints.luz);

  const skin = (l: SpeciesShape[]) => l.filter((s) => s.pele && s.linha === undefined);
  const texId = $derived(fig.textura ? `${uid}-t` : '');
  const patId = $derived(fig.padrao && fig.padrao !== 'ventre claro' && fig.padrao !== 'mascara' && fig.padrao !== 'sela' ? `${uid}-p` : '');
  const ink = $derived(draw.cores.contorno);
  const accent = $derived(fig.cor2);
  const shine = $derived(draw.cores.paints.luz);
</script>

<svg class="fig" viewBox="{view.x} {view.y} {view.w} {view.h}" width={size * (view.w / view.h)} height={size} role="img" aria-label={label || 'Retrato da espécie'} style:max-width="100%">
  <defs>
    <linearGradient id="{uid}-g" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={box.y} y2={box.y + box.h}>
      <stop offset="0" stop-color={draw.cores.claro} />
      <stop offset=".5" stop-color={draw.cores.base} />
      <stop offset="1" stop-color={draw.cores.sombra} />
    </linearGradient>
    {#if hasAura}
      <radialGradient id="{uid}-a"><stop offset=".35" stop-color={glowColor} stop-opacity=".42" /><stop offset="1" stop-color={glowColor} stop-opacity="0" /></radialGradient>
    {/if}

    <!-- textura do revestimento -->
    {#if fig.textura === 'escamas'}
      <pattern id={texId} width="7" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 0a3.5 3.5 0 0 0 7 0M-3.5 3a3.5 3.5 0 0 0 7 0M3.5 3a3.5 3.5 0 0 0 7 0" fill="none" stroke={ink} stroke-width=".55" opacity=".5" />
      </pattern>
    {:else if fig.textura === 'pelo'}
      <pattern id={texId} width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M1 1l-1.5 3.5M5 0l-1.5 3.5M3 4.5l-1.5 3.5M7 4l-1.5 3.5" fill="none" stroke={ink} stroke-width=".55" stroke-linecap="round" opacity=".42" />
      </pattern>
    {:else if fig.textura === 'penas'}
      <pattern id={texId} width="10" height="9" patternUnits="userSpaceOnUse">
        <path d="M0 0q5 8 10 0M-5 4.5q5 8 10 0M5 4.5q5 8 10 0" fill="none" stroke={ink} stroke-width=".6" opacity=".45" />
      </pattern>
    {:else if fig.textura === 'placas'}
      <pattern id={texId} width="17" height="15" patternUnits="userSpaceOnUse">
        <path d="M4 0L0 7.5L4 15M4 0H13L17 7.5L13 15H4M0 7.5H-4M17 7.5h4" fill="none" stroke={ink} stroke-width=".8" opacity=".5" />
      </pattern>
    {:else if fig.textura === 'facetas'}
      <pattern id={texId} width="22" height="22" patternUnits="userSpaceOnUse">
        <path d="M0 0L11 7L22 0M11 7L6 22M11 7L22 15L6 22M0 12L6 22M0 12L11 7" fill="none" stroke="#fff" stroke-width=".6" opacity=".4" />
        <path d="M11 7L22 15L22 0Z" fill="#fff" opacity=".1" />
      </pattern>
    {:else if fig.textura === 'rachaduras'}
      <pattern id={texId} width="34" height="30" patternUnits="userSpaceOnUse">
        <path d="M3 0l5 8l-3 7l8 6l-2 9M8 8l11-3l6 8l9-2M13 21l10-1l4 10M25 13l-2 7" fill="none" stroke={fig.revestimento.includes('lava') ? '#f08a2c' : ink} stroke-width={fig.revestimento.includes('lava') ? 1.3 : .8} opacity=".75" />
      </pattern>
    {:else if fig.textura === 'casca'}
      <pattern id={texId} width="9" height="26" patternUnits="userSpaceOnUse">
        <path d="M2 0q2 6 0 13t0 13M6.5 0q-2 7 0 13t0 13" fill="none" stroke={ink} stroke-width=".8" opacity=".55" />
      </pattern>
    {:else if fig.textura === 'musgo'}
      <pattern id={texId} width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="2" fill="#7c9a4a" opacity=".55" /><circle cx="9" cy="8" r="2.6" fill="#5f7f3a" opacity=".5" /><circle cx="2" cy="10" r="1.2" fill="#93ae58" opacity=".5" />
      </pattern>
    {:else if fig.textura === 'metal'}
      <pattern id={texId} width="30" height="16" patternUnits="userSpaceOnUse">
        <path d="M0 0H30M0 8H30" stroke={ink} stroke-width=".5" opacity=".5" /><circle cx="5" cy="4" r=".8" fill={ink} opacity=".6" /><circle cx="25" cy="12" r=".8" fill={ink} opacity=".6" />
        <path d="M0 3H30" stroke="#fff" stroke-width="1" opacity=".16" />
      </pattern>
    {:else if fig.textura === 'bolhas'}
      <pattern id={texId} width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="6" cy="7" r="2.6" fill="#fff" opacity=".16" /><circle cx="18" cy="16" r="1.7" fill="#fff" opacity=".2" /><circle cx="17" cy="4" r="1" fill="#fff" opacity=".22" />
      </pattern>
    {:else if fig.textura === 'couro'}
      <pattern id={texId} width="12" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 3q3 2 6 0t6 0M0 8q3-2 6 0t6 0" fill="none" stroke={ink} stroke-width=".45" opacity=".4" />
      </pattern>
    {/if}

    <!-- padrão da pelagem -->
    {#if fig.padrao === 'listras'}
      <pattern id={patId} width="14" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(12)"><path d="M3 0q3 10 0 20h4q3-10 0-20Z" fill={accent} opacity=".85" /></pattern>
    {:else if fig.padrao === 'manchas'}
      <pattern id={patId} width="30" height="26" patternUnits="userSpaceOnUse"><path d="M4 6q5-5 10 0t-2 8q-8 1-8-8ZM20 16q5-3 8 1t-3 7q-7-1-5-8Z" fill={accent} opacity=".85" /></pattern>
    {:else if fig.padrao === 'pintas'}
      <pattern id={patId} width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.8" fill={accent} opacity=".9" /><circle cx="10" cy="9.5" r="1.4" fill={accent} opacity=".9" /></pattern>
    {:else if fig.padrao === 'rosetas'}
      <pattern id={patId} width="20" height="18" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="3.6" fill="none" stroke={accent} stroke-width="1.7" stroke-dasharray="4 1.4" /><circle cx="16" cy="14" r="3" fill="none" stroke={accent} stroke-width="1.5" stroke-dasharray="3.4 1.3" /></pattern>
    {:else if fig.padrao === 'aneis'}
      <pattern id={patId} width="20" height="10" patternUnits="userSpaceOnUse"><rect width="8" height="10" fill={accent} opacity=".9" /></pattern>
    {:else if fig.padrao === 'runas'}
      <pattern id={patId} width="30" height="30" patternUnits="userSpaceOnUse"><path d="M6 5v11l5-5l-5-3M20 14l5 5l-5 5v-10M9 22h7l-3.5 6Z" fill="none" stroke={shine} stroke-width="1.1" stroke-linejoin="round" /></pattern>
    {:else if fig.padrao === 'veios brilhantes'}
      <pattern id={patId} width="40" height="36" patternUnits="userSpaceOnUse"><path d="M0 8q10 3 15 12t25 6M15 20q6-8 12-20M15 20q-3 8-1 16" fill="none" stroke={shine} stroke-width="1.1" /></pattern>
    {:else if fig.padrao === 'constelacoes'}
      <pattern id={patId} width="38" height="34" patternUnits="userSpaceOnUse"><path d="M6 8L15 14L26 8L31 20M15 14L12 26" fill="none" stroke={shine} stroke-width=".45" opacity=".7" /><g fill={shine}><circle cx="6" cy="8" r="1.1" /><circle cx="15" cy="14" r="1.4" /><circle cx="26" cy="8" r="1" /><circle cx="31" cy="20" r="1.2" /><circle cx="12" cy="26" r="1" /></g></pattern>
    {:else if fig.padrao === 'iridescente'}
      <linearGradient id={patId} gradientUnits="userSpaceOnUse" x1={box.x} y1={box.y} x2={box.x + box.w} y2={box.y + box.h}>
        <stop offset="0" stop-color="#ff5fa2" stop-opacity=".42" /><stop offset=".33" stop-color="#5fd0ff" stop-opacity=".42" /><stop offset=".66" stop-color="#7dff9c" stop-opacity=".38" /><stop offset="1" stop-color="#c58bff" stop-opacity=".42" />
      </linearGradient>
    {/if}

    {#each draw.camadas as l, i (i)}
      {@const pele = skin(l)}
      {#if pele.length}
        <clipPath id="{uid}-c{i}">{#each pele as s, j (j)}<path d={s.d} />{/each}</clipPath>
      {/if}
    {/each}
  </defs>

  {#if compare}
    <line x1={view.x} x2={view.x + view.w} y1={groundY} y2={groundY} class="ground" stroke-width={stroke * .7} />
    <g class="ref">
      {#if tiny}
        <circle cx={refX + refW / 2} cy={groundY - refH * .45} r={refH * .45} />
        <path d="M{refX + refW / 2} {groundY - refH * .85}q{refH * .05} {-refH * .15} {refH * .18} {-refH * .15}" fill="none" stroke-width={refH * .06} />
      {:else}
        <g transform="translate({refX - PESSOA.box.x * (refH / PESSOA.box.h)} {groundY - refH}) scale({refH / PESSOA.box.h}) translate(0 {-PESSOA.box.y})">
          {#each PESSOA_D as d, i (i)}<path {d} />{/each}
        </g>
      {/if}
      <text x={refX + refW / 2} y={groundY - refH - fs * .4} font-size={fs} text-anchor="middle">{tiny ? '8 cm' : '1,75 m'}</text>
    </g>
    <text x={box.x + box.w / 2} y={groundY - Math.max(box.h + lift, 0) - fs * .4} font-size={fs * 1.1} text-anchor="middle" class="size">{titulo}{fig.eixo === 'comprimento' ? ' de comprimento' : ''}</text>
  {/if}

  <g transform="translate(0 {-lift})" class:translucido={fig.translucido} style:filter={fig.brilho ? `drop-shadow(0 0 ${size / 34}px ${glowColor})` : undefined}>
    {#if hasAura}
      <ellipse cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w * .72} ry={box.h * .68} fill="url(#{uid}-a)" />
    {/if}
    {#each draw.camadas as l, i (i)}
      {@const pele = skin(l)}
      <g>
        <!-- contorno único: todas as peças da camada se fundem numa silhueta só -->
        {#each l as s, j (j)}
          {#if s.contorno}
            <path d={s.d} fill={s.linha === undefined ? ink : 'none'} stroke={ink} stroke-width={s.linha === undefined ? stroke * 2 : s.linha + stroke * 2} stroke-linejoin="round" stroke-linecap="round" opacity={s.opacidade} />
          {/if}
        {/each}
        {#each l as s, j (j)}
          {#if s.linha !== undefined}
            <path d={s.d} fill="none" stroke={paint(s.paint)} stroke-width={s.linha} stroke-linecap="round" stroke-linejoin="round" opacity={s.opacidade} />
          {:else if !s.preso}
            <path d={s.d} fill={paint(s.paint)} opacity={s.opacidade} />
          {/if}
        {/each}
        {#if pele.length}
          <g clip-path="url(#{uid}-c{i})">
            {#each l as s, j (j)}
              {#if s.preso}<path d={s.d} fill={paint(s.paint)} opacity={s.opacidade} />{/if}
            {/each}
            {#if patId}<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#{patId})" />{/if}
            {#if texId}<rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#{texId})" />{/if}
          </g>
        {/if}
      </g>
    {/each}
  </g>
</svg>

<style>
  .fig { display: block; overflow: visible; }
  .ground { stroke: var(--line); }
  .ref { fill: color-mix(in srgb, var(--muted) 34%, transparent); stroke: color-mix(in srgb, var(--muted) 34%, transparent); }
  .ref text { fill: var(--muted); stroke: none; font-family: var(--f-mono); }
  .size { fill: var(--ink); font-family: var(--f-mono); }
  .translucido { opacity: .84; }
</style>
