<script lang="ts">
  import { TONS_SINAL, infoRaridade } from '@tanden/core';
  import { pop } from '../../../motion';
  import { jornada } from './jornada.svelte';

  // Avisos de progresso. Só aparecem quando a escrita pausa (ver `soltarAvisos`).
  let { onconquistas }: { onconquistas: () => void } = $props();
  const raios = Array.from({ length: 10 }, (_, i) => i * 36);
</script>

<div class="pilha" role="status" aria-live="polite">
  {#each jornada.avisos as a (a.id)}
    <div class="aviso {a.tipo}" in:pop style:--r={a.tipo === 'conquista' ? infoRaridade(a.conquista.raridade).cor : a.tipo === 'sinal' ? TONS_SINAL[a.sinal.tom].cor : a.tipo === 'bau' ? '#e8c547' : 'var(--ember)'}>
      {#if a.tipo === 'era' || (a.tipo === 'conquista' && (a.conquista.raridade === 'lendaria' || a.conquista.raridade === 'epica'))}
        <span class="explosao" aria-hidden="true">{#each raios as g (g)}<i style:rotate="{g}deg"></i>{/each}</span>
      {/if}
      {#if a.tipo === 'conquista'}
        <button class="corpo" onclick={() => { jornada.dispensar(a.id); onconquistas(); }}>
          <span class="glifo" aria-hidden="true">{a.conquista.glifo}</span>
          <span class="txt"><small>{infoRaridade(a.conquista.raridade).label}{a.conquista.secreta ? ' · secreta' : ''}</small><b>{a.conquista.nome}</b><span>{a.conquista.desc}</span>{#if a.mais}<em>+{a.mais} {a.mais === 1 ? 'conquista' : 'conquistas'}</em>{/if}</span>
        </button>
      {:else if a.tipo === 'lote'}
        <button class="corpo" onclick={() => { jornada.dispensar(a.id); onconquistas(); }}>
          <span class="glifo" aria-hidden="true">🏆</span>
          <span class="txt"><small>Seus mundos já contavam história</small><b>{a.n} conquistas desbloqueadas</b><span>Toque para ver o que você já tinha feito.</span></span>
        </button>
      {:else if a.tipo === 'bau'}
        <button class="corpo" onclick={() => { jornada.dispensar(a.id); jornada.pedido = { tipo: 'tesouro' }; }}>
          <span class="glifo bau" aria-hidden="true">⛋</span>
          <span class="txt"><small>Baú ganho{a.n > 1 ? ` · ${a.n} fechados` : ''}</small><b>{a.titulo}</b><span>Toque para abrir e tirar uma carta de inspiração.</span></span>
        </button>
      {:else if a.tipo === 'sinal'}
        <button class="corpo" onclick={() => { jornada.dispensar(a.id); jornada.pedido = { tipo: 'arauto', mundo: a.mundo }; }}>
          <span class="glifo" aria-hidden="true">{TONS_SINAL[a.sinal.tom].glifo}</span>
          <span class="txt"><small>O arauto de {a.mundo} · {TONS_SINAL[a.sinal.tom].label}</small><b>{a.sinal.titulo}</b><span>{a.sinal.texto}</span></span>
        </button>
      {:else if a.tipo === 'era'}
        <div class="corpo"><span class="glifo" aria-hidden="true">{a.glifo}</span><span class="txt"><small>{a.mundo} entrou numa nova era</small><b>{a.era}</b><span>{a.desc}</span></span></div>
      {:else if a.tipo === 'nivel'}
        <div class="corpo"><span class="glifo" aria-hidden="true">▲</span><span class="txt"><small>{a.mundo}</small><b>Nível {a.nivel}</b></span></div>
      {:else}
        <div class="corpo"><span class="glifo" aria-hidden="true">◎</span><span class="txt"><small>Missão cumprida · +{a.xp} {a.moeda}</small><span>{a.texto}</span></span></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .pilha { position: absolute; right: var(--sp-4); bottom: var(--sp-4); z-index: 12; width: min(340px, calc(100% - 32px)); display: grid; gap: var(--sp-2); pointer-events: none; }
  .aviso { position: relative; overflow: hidden; pointer-events: auto; border: 1px solid color-mix(in srgb, var(--r) 60%, var(--line)); border-radius: var(--r-lg); box-shadow: var(--elev-2), 0 0 26px -10px var(--r);
    background: linear-gradient(120deg, color-mix(in srgb, var(--r) 16%, var(--surface)), var(--surface) 62%); }
  .corpo { position: relative; width: 100%; display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3); border: 0; background: none; color: var(--ink); text-align: left; }
  .glifo { flex: none; width: 40px; height: 40px; display: grid; place-items: center; font-size: 20px; color: var(--r); border-radius: 50%; background: color-mix(in srgb, var(--r) 14%, transparent); }
  .txt { display: grid; gap: 1px; min-width: 0; font-size: 12.5px; line-height: 1.35; color: var(--muted); }
  .txt small { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--r); }
  .txt b { font: 600 15px var(--f-display); color: var(--ink); }
  .txt em { font: normal 600 11px var(--f-mono); color: var(--ember-soft); }
  .glifo.bau { animation: sacode 1.4s ease-in-out 2; }
  @keyframes sacode { 0%, 100% { rotate: 0deg; } 10%, 30% { rotate: -9deg; } 20%, 40% { rotate: 9deg; } 50% { rotate: 0deg; scale: 1.12; } }
  .explosao { position: absolute; left: 32px; top: 50%; pointer-events: none; }
  .explosao i { position: absolute; left: 0; top: 0; width: 2px; height: 16px; background: var(--r); transform-origin: 0 0; animation: raio .9s ease-out both; }
  @keyframes raio { 0% { translate: 0 0; opacity: 0; scale: 1 .2; } 30% { opacity: 1; } 100% { translate: 0 0; opacity: 0; scale: 1 3; } }
  @media (prefers-reduced-motion: reduce) { .explosao { display: none; } .glifo.bau { animation: none; } }
  /* no celular, dois avisos por vez para não cobrir a tela */
  @media (max-width: 720px) { .pilha { right: 16px; bottom: 84px; } .aviso:nth-child(n + 3) { display: none; } }
</style>
