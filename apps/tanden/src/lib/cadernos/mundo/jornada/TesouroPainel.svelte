<script lang="ts">
  import {
    CARTAS, NAIPES, RELIQUIAS, cartaPorId, estadoReliquias, infoRaridade, reviewWorld, storyIndex, NON_CARD_TYPES,
    type Bau, type Carta, type Metricas, type TipoReliquia, type World,
  } from '@tanden/core';
  import { pop, rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import CartaInspiracao from './CartaInspiracao.svelte';
  import { jornada } from './jornada.svelte';
  import Planeta from './Planeta.svelte';

  // O tesouro do autor: baús ganhos escrevendo, a coleção de 96 cartas de
  // inspiração e a vitrine de relíquias (adorno do planeta, moldura das
  // cartas e título). Nada aqui se compra: tudo vem de escrever e construir.
  let { world, metricas, onusar }: { world: World; metricas: Metricas; onusar?: (c: Carta) => void } = $props();

  type Sub = 'baus' | 'colecao' | 'vitrine';
  let sub = $state<Sub>('baus');

  const baus = $derived.by(() => { void jornada.rev; void cadernos.rev; return jornada.baus(); });
  const fechados = $derived(baus.filter((b) => !b.aberto));
  const abertos = $derived(baus.filter((b) => b.aberto).slice(0, 18));
  const colecao = $derived.by(() => { void jornada.rev; return jornada.colecao(); });
  const COR_BAU: Record<Bau['origem'], string> = { missoes: '#c98a4b', sequencia: '#ff8a3d', nivel: '#e8c547' };
  const ORIGEM: Record<Bau['origem'], string> = { missoes: 'Missões do dia', sequencia: 'Sequência', nivel: 'Nível do mundo' };
  const quando = (t: number) => new Date(t).toLocaleDateString('pt-BR');

  // ------------------------------------------------ abrir um baú
  let abrindo = $state<{ bau: Bau; carta: Carta; aberto: boolean; nova: boolean } | null>(null);
  function abrir(b: Bau) {
    const tinha = new Set(colecao.keys());
    const carta = jornada.abrirBau(b);
    const nova = !tinha.has(carta.id);
    abrindo = { bau: b, carta, aberto: false, nova };
    sound.play('open');
    setTimeout(() => { if (abrindo && abrindo.bau.id === b.id) { abrindo.aberto = true; sound.play('complete'); } }, 950);
  }

  // ------------------------------------------------ coleção
  let naipeSel = $state<string>('todos');
  const porNaipe = $derived(NAIPES.map((n) => ({ n, cartas: CARTAS.filter((c) => c.naipe === n.id), tem: CARTAS.filter((c) => c.naipe === n.id && colecao.has(c.id)).length })));
  let lendo = $state<Carta | null>(null);

  // ------------------------------------------------ vitrine
  const reliq = $derived(estadoReliquias(metricas));
  const vit = $derived.by(() => { void jornada.rev; return jornada.vitrine(world.name); });
  const TIPOS: Array<{ id: TipoReliquia; label: string; desc: string }> = [
    { id: 'adorno', label: 'Adornos do planeta', desc: 'Enfeitam o planeta do mundo, no cabeçalho e na crônica.' },
    { id: 'moldura', label: 'Molduras das cartas', desc: 'Contornam as cartas das fichas deste mundo.' },
    { id: 'titulo', label: 'Títulos', desc: 'Aparecem sob o nome do mundo.' },
  ];
  function escolher(tipo: TipoReliquia, id: string) {
    const v = { adorno: vit.adorno, moldura: vit.moldura, titulo: vit.titulo };
    v[tipo] = v[tipo] === id ? undefined : id;
    jornada.definirVitrine(world.name, v);
    sound.play('tick');
  }
  const abertasN = $derived(reliq.filter((x) => x.ok).length);
  const e = $derived(jornada.estado(world));
  const fichas = $derived(world.entities.filter((x) => !NON_CARD_TYPES.has(x.type)).length);
  const historias = $derived(storyIndex(world).length);
  const tempestades = $derived(reviewWorld(world).filter((i) => i.level === 'erro').length);
</script>

{#snippet bau(cor: string, aberto: boolean, tamanho: number)}
  <svg class="bau-svg" class:aberto width={tamanho} height={tamanho} viewBox="0 0 64 64" aria-hidden="true" style:--b={cor}>
    {#if aberto}<g class="raios">{#each [0, 30, 60, 90, 120, 150] as a (a)}<rect x="31" y="2" width="2" height="22" rx="1" fill={cor} opacity=".6" transform="rotate({a - 75} 32 30)" />{/each}</g>{/if}
    <rect x="8" y="30" width="48" height="26" rx="3" fill={cor} stroke="#2a1608" stroke-width="1.5" />
    <rect x="9" y="44" width="46" height="11" rx="2" fill="#2a1608" opacity=".28" />
    <rect x="8" y="38" width="48" height="4" fill="#2a1608" opacity=".35" />
    <g class="tampa">
      <path d="M8 30v-8a10 10 0 0 1 10-10h28a10 10 0 0 1 10 10v8z" fill={cor} stroke="#2a1608" stroke-width="1.5" />
      <path d="M10 22a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8" fill="none" stroke="#fff" stroke-width="1.5" opacity=".3" />
      <path d="M20 12v18M44 12v18" stroke="#e8c547" stroke-width="2.5" opacity=".85" />
    </g>
    <path d="M20 30v26M44 30v26" stroke="#e8c547" stroke-width="2.5" opacity=".85" />
    <rect x="28" y="27" width="8" height="10" rx="2" fill="#e8c547" stroke="#2a1608" stroke-width="1.2" />
    <circle cx="32" cy="32" r="1.4" fill="#2a1608" />
  </svg>
{/snippet}

<div class="tesouro">
  <div class="t-seg" role="tablist" aria-label="Tesouro">
    <button role="tab" aria-selected={sub === 'baus'} class:on={sub === 'baus'} onclick={() => (sub = 'baus')}>Baús{#if fechados.length}<span class="t-badge">{fechados.length}</span>{/if}</button>
    <button role="tab" aria-selected={sub === 'colecao'} class:on={sub === 'colecao'} onclick={() => (sub = 'colecao')}>Coleção <small>{colecao.size}/96</small></button>
    <button role="tab" aria-selected={sub === 'vitrine'} class:on={sub === 'vitrine'} onclick={() => (sub = 'vitrine')}>Vitrine <small>{abertasN}/{RELIQUIAS.length}</small></button>
  </div>

  {#if sub === 'baus'}
    {#if fechados.length}
      <div class="fechados">
        {#each fechados as b, i (b.id)}
          <div class="bau-card" class:sortudo={b.sorte >= 1} style:--b={COR_BAU[b.origem]} in:rise={{ delay: Math.min(i, 8) * 40, y: 6 }}>
            <span class="pula">{@render bau(COR_BAU[b.origem], false, 64)}</span>
            <span class="txt"><small>{ORIGEM[b.origem]}{b.sorte >= 1 ? ' · sorte alta' : ''}</small><b>{b.titulo}</b></span>
            <button class="t-btn t-btn--sm t-btn--primary" onclick={() => abrir(b)}>Abrir</button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="vazio">
        {@render bau('#8a8a8a', false, 72)}
        <p><b>Nenhum baú fechado.</b> Ganhe baús cumprindo as três missões do dia, a cada 7 dias de sequência e a cada 5 níveis de um mundo.</p>
      </div>
    {/if}
    <section>
      <h3>Como se ganha</h3>
      <ul class="como">
        <li style:--b={COR_BAU.missoes}>{@render bau(COR_BAU.missoes, false, 28)}<span><b>Missões</b> Cumpra as três missões de hoje num mundo.</span></li>
        <li style:--b={COR_BAU.sequencia}>{@render bau(COR_BAU.sequencia, false, 28)}<span><b>Sequência</b> A cada 7 dias seguidos batendo a meta. Quanto maior, mais sorte.</span></li>
        <li style:--b={COR_BAU.nivel}>{@render bau(COR_BAU.nivel, false, 28)}<span><b>Níveis</b> A cada 5 níveis de um mundo; no 25, 50... sorte máxima.</span></li>
      </ul>
    </section>
    {#if abertos.length}
      <section>
        <h3>Abertos</h3>
        <div class="mini">
          {#each abertos as b (b.id)}
            {@const c = cartaPorId(b.aberto!.carta)}
            {#if c}<button class="mini-c" onclick={() => (lendo = c)} title={`${b.titulo} · ${quando(b.aberto!.em)}`}><CartaInspiracao carta={c} /></button>{/if}
          {/each}
        </div>
      </section>
    {/if}
  {:else if sub === 'colecao'}
    <div class="progresso">
      <span class="barra"><i style:width="{(colecao.size / CARTAS.length) * 100}%"></i></span>
      <small>{colecao.size} de {CARTAS.length} cartas · {Math.round((colecao.size / CARTAS.length) * 100)}%</small>
    </div>
    <div class="naipes t-scroll-x" role="group" aria-label="Naipe">
      <button class="t-chip" class:on={naipeSel === 'todos'} onclick={() => (naipeSel = 'todos')}>Todos</button>
      {#each porNaipe as p (p.n.id)}
        <button class="t-chip" class:on={naipeSel === p.n.id} style:--c={p.n.cor} onclick={() => (naipeSel = p.n.id)}><span aria-hidden="true">{p.n.glifo}</span>{p.n.label}<small>{p.tem}/16</small></button>
      {/each}
    </div>
    {#each porNaipe.filter((p) => naipeSel === 'todos' || p.n.id === naipeSel) as p (p.n.id)}
      <section>
        <h3 style:color={p.n.cor}>{p.n.glifo} {p.n.label} <span class="dim">· {p.n.desc}</span></h3>
        <div class="grade">
          {#each p.cartas as c (c.id)}
            {@const tem = colecao.get(c.id)}
            <button class="mini-c" disabled={!tem} onclick={() => (lendo = c)} aria-label={tem ? c.nome : 'Carta não colecionada'}>
              <CartaInspiracao carta={c} oculta={!tem} vezes={tem?.vezes ?? 0} />
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {:else}
    <div class="previa" style:--luz={e.genero.cores.luz}>
      <Planeta nome={world.name} genero={e.genero} era={e.indiceEra} {fichas} {historias} {tempestades} size={128} adorno={vit.adorno} />
      <div>
        <b>{world.name}</b>
        {#if vit.titulo}<small class="titulo">{RELIQUIAS.find((r) => r.id === vit.titulo)?.nome}</small>{/if}
        <p class="dim">A vitrine vale para este mundo. Toque numa relíquia aberta para usar; toque de novo para tirar.</p>
      </div>
    </div>
    {#each TIPOS as t (t.id)}
      <section>
        <h3>{t.label}</h3>
        <p class="dim nota">{t.desc}</p>
        <div class="reliquias">
          {#each reliq.filter((x) => x.r.tipo === t.id) as x (x.r.id)}
            {@const usando = vit[t.id] === x.r.id}
            <button class="rel {x.r.raridade}" class:ok={x.ok} class:usando disabled={!x.ok} style:--r={infoRaridade(x.r.raridade).cor} onclick={() => escolher(t.id, x.r.id)}
              title={x.ok ? x.r.desc : `${x.r.como} · ${Math.round(x.progresso * 100)}%`}>
              <span class="g" aria-hidden="true">{x.ok ? x.r.glifo : '🔒'}</span>
              <span class="t"><b>{x.r.nome}</b><small>{x.ok ? (usando ? 'Em uso' : infoRaridade(x.r.raridade).label) : x.r.como}</small>
                {#if !x.ok}<span class="p"><i style:width="{x.progresso * 100}%"></i></span>{/if}</span>
              {#if t.id === 'moldura' && x.ok}<i class="amostra m-{x.r.id}" aria-hidden="true"></i>{/if}
            </button>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

{#if abrindo}
  <div class="abertura" role="dialog" aria-modal="true" aria-label="Baú aberto" in:pop>
    <div class="palco" style:--r={infoRaridade(abrindo.carta.raridade).cor}>
      {#if !abrindo.aberto}
        <span class="tremendo">{@render bau(COR_BAU[abrindo.bau.origem], false, 150)}</span>
        <p class="dim">{abrindo.bau.titulo}</p>
      {:else}
        <span class="explosao" aria-hidden="true"></span>
        <div class="revela" in:pop={{ duration: 420, from: 0.6 }}>
          <CartaInspiracao carta={abrindo.carta} grande />
        </div>
        <p class="rar"><b style:color={infoRaridade(abrindo.carta.raridade).cor}>{infoRaridade(abrindo.carta.raridade).label}</b>{abrindo.nova ? ' · nova na coleção!' : ' · repetida'}</p>
        <div class="t-actions">
          {#if onusar}<button class="t-btn" onclick={() => { onusar!(abrindo!.carta); abrindo = null; }}>Virar ficha</button>{/if}
          <button class="t-btn t-btn--primary" onclick={() => (abrindo = null)}>Guardar</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if lendo}
  <div class="abertura" role="dialog" aria-modal="true" aria-label={lendo.nome} tabindex="-1" in:pop onclick={(ev) => { if (ev.target === ev.currentTarget) lendo = null; }} onkeydown={(ev) => { if (ev.key === 'Escape') lendo = null; }}>
    <div class="palco" style:--r={infoRaridade(lendo.raridade).cor}>
      <div class="revela"><CartaInspiracao carta={lendo} grande vezes={colecao.get(lendo.id)?.vezes ?? 0} /></div>
      <div class="t-actions">
        {#if onusar}<button class="t-btn" onclick={() => { onusar!(lendo!); lendo = null; }}>Virar ficha</button>{/if}
        <button class="t-btn t-btn--primary" onclick={() => (lendo = null)}>Fechar</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tesouro { display: grid; gap: var(--sp-4); }
  .tesouro > .t-seg { justify-self: start; max-width: 100%; }
  .t-seg small { margin-left: 4px; font: 10px var(--f-mono); color: var(--muted); }
  h3 { margin: 0 0 var(--sp-2); font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h3 .dim { text-transform: none; letter-spacing: 0; font: 12px var(--f-body); }
  .dim { color: var(--muted); }
  .nota { margin: -4px 0 var(--sp-2); font-size: 12px; }

  .fechados { display: grid; gap: var(--sp-2); }
  .bau-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-lg);
    border: 1px solid color-mix(in srgb, var(--b) 45%, var(--line)); background: linear-gradient(110deg, color-mix(in srgb, var(--b) 14%, var(--surface)), var(--surface) 70%); }
  .bau-card.sortudo { box-shadow: 0 0 22px -8px #b277ee; border-color: color-mix(in srgb, #b277ee 55%, var(--line)); }
  .pula { display: grid; animation: pula 2.6s ease-in-out infinite; }
  @keyframes pula { 0%, 80%, 100% { translate: 0 0; } 86% { translate: 0 -5px; } 92% { translate: 0 0; } 96% { translate: 0 -2px; } }
  .txt { display: grid; gap: 1px; min-width: 0; }
  .txt small { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--b); }
  .txt b { font: 600 15px var(--f-display); overflow-wrap: anywhere; }
  .vazio { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border: 1px dashed var(--line); border-radius: var(--r-lg); }
  .vazio p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .vazio b { color: var(--ink); }
  .como { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .como li { display: flex; align-items: center; gap: var(--sp-2); font-size: 12.5px; color: var(--muted); line-height: 1.4; }
  .como b { color: var(--ink); margin-right: 4px; }
  .mini, .grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(74px, 100%), 1fr)); gap: 8px; }
  .mini-c { border: 0; background: none; padding: 0; text-align: inherit; transition: transform .2s var(--ease); }
  .mini-c:not(:disabled):hover { transform: translateY(-4px) rotate(-1.5deg); }
  .mini-c:disabled { cursor: default; }

  .progresso { display: grid; gap: 4px; }
  .barra { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .barra i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #f2a65a, #5fbf77, #e5654b, #4f9de8, #b277ee, #9aa3ad); transition: width .6s var(--ease); }
  .progresso small { font: 11px var(--f-mono); color: var(--muted); }
  .naipes { display: flex; gap: 4px; }
  .naipes small { margin-left: 4px; font: 10px var(--f-mono); color: var(--muted); }

  .previa { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; padding: var(--sp-3) var(--sp-4); border-radius: var(--r-lg);
    background: radial-gradient(circle at 20% 50%, color-mix(in srgb, var(--luz) 16%, transparent), transparent 60%), var(--void); }
  .previa > div { flex: 1 1 180px; display: grid; gap: 2px; min-width: 0; }
  .previa b { font: 600 20px var(--f-display); }
  .previa p { margin: 4px 0 0; font-size: 12px; }
  .titulo { font: italic 600 13px var(--f-display); color: var(--luz); }
  .reliquias { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 6px; }
  .rel { position: relative; overflow: hidden; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: var(--sp-2); padding: 8px 10px; text-align: left; color: var(--ink);
    border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); }
  .rel.ok { border-color: color-mix(in srgb, var(--r) 45%, var(--line)); background: linear-gradient(120deg, color-mix(in srgb, var(--r) 10%, var(--surface)), var(--surface) 70%); }
  .rel.ok:hover { border-color: var(--r); }
  .rel.usando { box-shadow: 0 0 0 2px var(--r), 0 0 18px -6px var(--r); }
  .rel:disabled { opacity: .75; cursor: default; }
  .rel .g { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; font-size: 17px; color: var(--r); background: color-mix(in srgb, var(--r) 14%, transparent); }
  .rel:disabled .g { filter: grayscale(1); font-size: 13px; }
  .rel .t { display: grid; gap: 2px; min-width: 0; }
  .rel b { font: 600 13px var(--f-display); }
  .rel small { font-size: 11px; color: var(--muted); line-height: 1.3; }
  .rel .p { height: 3px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .rel .p i { display: block; height: 100%; background: var(--r); }
  .amostra { position: absolute; right: 8px; top: 8px; width: 14px; height: 20px; border-radius: 3px; background: var(--m); }
  .m-bronze { --m: linear-gradient(135deg, #8c5a2b, #e0a466, #7a4a20); }
  .m-prata { --m: linear-gradient(135deg, #8a949c, #f4f7f9, #9aa4ad); }
  .m-runica { --m: repeating-linear-gradient(90deg, #8b7cf6 0 3px, #2d2550 3px 5px); }
  .m-ouro { --m: linear-gradient(135deg, #9c7a1f, #ffe08a, #b8892a); }
  .m-vitral { --m: conic-gradient(#ef476f, #ffd166, #06d6a0, #118ab2, #a78bfa, #ef476f); }
  .m-obsidiana { --m: linear-gradient(135deg, #0b0b10, #ff6b3d, #0b0b10); }
  .m-holo { --m: linear-gradient(115deg, #ff7ad9, #7af0ff, #fff27a); }
  .m-astral { --m: radial-gradient(#fff .6px, transparent 1px) 0 0 / 4px 4px, linear-gradient(135deg, #1b1f4b, #4b2f7a); }

  .abertura { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: var(--sp-4); background: color-mix(in srgb, var(--void) 82%, transparent); backdrop-filter: blur(6px); }
  .palco { position: relative; display: grid; justify-items: center; gap: var(--sp-3); width: min(320px, 100%); }
  .tremendo { display: grid; animation: treme .9s ease-in-out both; filter: drop-shadow(0 0 30px color-mix(in srgb, var(--r) 60%, transparent)); }
  @keyframes treme { 0% { scale: .8; } 15%, 45%, 75% { rotate: -7deg; } 30%, 60%, 90% { rotate: 7deg; } 100% { rotate: 0deg; scale: 1.08; } }
  .revela { width: min(260px, 80vw); position: relative; z-index: 1; animation: gira-entra .7s cubic-bezier(.2, .9, .3, 1.2) both; }
  @keyframes gira-entra { from { transform: perspective(700px) rotateY(160deg) scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }
  .explosao { position: absolute; top: 40%; left: 50%; width: 520px; height: 520px; margin: -260px 0 0 -260px; border-radius: 50%; pointer-events: none;
    background: repeating-conic-gradient(color-mix(in srgb, var(--r) 40%, transparent) 0 6deg, transparent 6deg 18deg); mask: radial-gradient(circle, #000 10%, transparent 65%); animation: gira 14s linear infinite, aparece .6s ease-out both; }
  @keyframes gira { to { rotate: 360deg; } }
  @keyframes aparece { from { opacity: 0; scale: .3; } }
  .rar { margin: 0; font-size: 13px; color: var(--muted); position: relative; z-index: 1; }
  .palco .t-actions { position: relative; z-index: 1; }
  .bau-svg { display: block; overflow: visible; }
  .bau-svg .tampa { transform-origin: 8px 30px; transition: transform .4s; }
  .bau-svg.aberto .tampa { transform: rotate(-24deg); }
  @media (prefers-reduced-motion: reduce) { .pula, .tremendo, .revela, .explosao { animation: none; } }
</style>
