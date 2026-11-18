<script lang="ts">
  import { untrack } from 'svelte';
  import { pop } from '../../../motion';
  import { jornada } from './jornada.svelte';

  // Barra discreta em cima do editor: palavras do dia, sequência e sprint.
  // Enquanto se escreve, aqui só mudam os números e uma faísca; nada pula na tela.
  let { mundo, path, corpo }: { mundo: string; path: string; corpo: string } = $props();

  // só ao trocar de texto: digitar não reabre
  $effect(() => {
    void path;
    untrack(() => jornada.abrirTexto(path, corpo));
    jornada.editorAberto(true);
    return () => jornada.editorAberto(false);
  });

  const hoje = $derived(jornada.palavrasHoje());
  const meta = $derived(jornada.meta);
  const seq = $derived(jornada.sequencia);
  const s = $derived(jornada.sprint);
  const r = $derived(jornada.resultado);
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const relogio = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

  let configurando = $state(false);
  let minutos = $state(15);
  let alvo = $state(300);
  let duro = $state(false);
  const TEMPOS = [5, 15, 25];

  $effect(() => { if (jornada.querSprint) { configurando = true; jornada.querSprint = false; } });

  function escolher(m: number) {
    minutos = m;
    alvo = m * 20;
  }
  function iniciar() {
    configurando = false;
    jornada.iniciarSprint(mundo, { minutos, meta: Math.max(0, alvo), duro });
  }
  const anel = $derived(Math.min(1, hoje / Math.max(1, meta)));
  const C = 2 * Math.PI * 8;
</script>

<div class="barra">
  {#if s}
    <div class="corrida" class:perigo={s.sumir > 0}>
      <b class="tempo">{relogio(s.restante)}</b>
      <span class="trilho"><i style:width="{s.meta ? Math.min(100, (s.palavras / s.meta) * 100) : 0}%"></i></span>
      <span class="num">{fmt(s.palavras)}{s.meta ? ` / ${fmt(s.meta)}` : ''} palavras</span>
      {#if s.sumir > 0}<span class="aviso" role="alert">Continue escrevendo!</span>{/if}
      <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => jornada.cancelarSprint()}>Parar</button>
    </div>
  {:else}
    <span class="meta" title={`${fmt(hoje)} de ${fmt(meta)} palavras na meta de hoje`}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" class="fundo" /><circle cx="10" cy="10" r="8" class="cheio" class:ok={anel >= 1} stroke-dasharray={C} stroke-dashoffset={C * (1 - anel)} /></svg>
      <span class="num">{fmt(hoje)}<small>/{fmt(meta)}</small></span>
    </span>
    <span class="seq" class:aceso={seq.hojeFeito} title={`${seq.atual} ${seq.atual === 1 ? 'dia seguido' : 'dias seguidos'}`}><span aria-hidden="true">🔥</span>{seq.atual}</span>
    {#if jornada.sessao}<span class="sessao" title="Palavras novas nesta sessão">+{fmt(jornada.sessao)}</span>{/if}
    {#key jornada.faisca}{#if jornada.faisca}<span class="faisca" aria-hidden="true">✦</span>{/if}{/key}
    <span class="vao"></span>
    <button class="t-btn t-btn--sm" class:t-btn--on={configurando} onclick={() => (configurando = !configurando)} aria-expanded={configurando}>⏱ Sprint</button>
  {/if}
</div>

{#if configurando && !s}
  <form class="painel t-card" in:pop onsubmit={(e) => { e.preventDefault(); iniciar(); }}>
    <div class="linha">
      <span class="t-eyebrow">Tempo</span>
      <div class="t-seg" role="radiogroup" aria-label="Duração do sprint">
        {#each TEMPOS as m (m)}<button type="button" role="radio" aria-checked={minutos === m} class:on={minutos === m} onclick={() => escolher(m)}>{m} min</button>{/each}
      </div>
    </div>
    <label class="linha"><span class="t-eyebrow">Meta de palavras</span><input class="t-input" type="number" min="0" step="50" bind:value={alvo} /></label>
    <label class="duro"><input type="checkbox" bind:checked={duro} /><span><b>Escreva ou Desapareça</b><small>Parou por mais de 8 segundos, o texto começa a sumir da vista. Nada é apagado: só o sprint se perde.</small></span></label>
    <div class="t-actions"><button type="button" class="t-btn" onclick={() => (configurando = false)}>Cancelar</button><button class="t-btn t-btn--primary">Começar</button></div>
  </form>
{/if}

{#if r}
  <div class="fim t-card" class:falhou={!r.ok} in:pop role="status">
    {#if r.ok}
      <b>{r.meta && r.palavras >= r.meta ? 'Meta batida!' : 'Sprint concluído'}</b>
      <p><span class="grande">{fmt(r.palavras)}</span> palavras · {r.ppm} por minuto{#if r.recorde} · <em>novo recorde</em>{/if}</p>
    {:else}
      <b>O texto desapareceu</b>
      <p>Ele voltou inteiro, fique tranquilo. Foram {fmt(r.palavras)} palavras antes da pausa.</p>
    {/if}
    <button class="t-btn t-btn--sm" onclick={() => (jornada.resultado = null)}>Fechar</button>
  </div>
{/if}

<style>
  .barra { display: flex; align-items: center; gap: var(--sp-3); min-height: 38px; padding: 3px var(--sp-1); font-size: 12px; color: var(--muted); }
  .meta, .seq { display: inline-flex; align-items: center; gap: 5px; }
  .num { font: 600 12px var(--f-mono); color: var(--ink); white-space: nowrap; }
  .num small { font-weight: 400; color: var(--muted); font-size: 11px; }
  svg { transform: rotate(-90deg); flex: none; }
  svg circle { fill: none; stroke-width: 3; }
  .fundo { stroke: var(--line); }
  .cheio { stroke: var(--ember); stroke-linecap: round; transition: stroke-dashoffset .4s var(--ease); }
  .cheio.ok { stroke: var(--ok); }
  .seq { font: 600 12px var(--f-mono); color: var(--ink); }
  .seq:not(.aceso) span { filter: grayscale(1); opacity: .6; }
  .sessao { font: 12px var(--f-mono); color: var(--ember-soft); }
  .faisca { color: var(--ember); animation: faisca .9s ease-out both; }
  @keyframes faisca { 0% { opacity: 0; transform: scale(.4); } 30% { opacity: 1; transform: scale(1.3) rotate(40deg); } 100% { opacity: 0; transform: translateY(-8px) scale(.7) rotate(120deg); } }
  .vao { flex: 1; }
  .corrida { flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3); min-width: 0; }
  .tempo { font: 700 16px var(--f-mono); color: var(--ember); }
  .trilho { flex: 1; min-width: 60px; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .trilho i { display: block; height: 100%; background: linear-gradient(90deg, var(--ember), var(--ok)); transition: width .3s var(--ease); }
  .perigo .tempo { color: var(--crit); }
  .aviso { color: var(--crit); font-weight: 600; animation: bate .8s ease-in-out infinite; }
  @keyframes bate { 50% { opacity: .45; } }
  .painel, .fim { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-2); }
  .linha { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); }
  .linha .t-input { width: 110px; }
  .duro { display: flex; align-items: flex-start; gap: var(--sp-2); cursor: pointer; }
  .duro input { margin-top: 3px; accent-color: var(--crit); }
  .duro span { display: grid; gap: 2px; }
  .duro b { font-size: 13.5px; }
  .duro small { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .fim { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); justify-items: start; gap: var(--sp-1); }
  .fim.falhou { border-color: color-mix(in srgb, var(--crit) 50%, var(--line)); }
  .fim b { font: 600 15px var(--f-display); }
  .fim p { margin: 0 0 var(--sp-1); color: var(--muted); font-size: 13px; }
  .grande { font: 700 20px var(--f-mono); color: var(--ink); }
  .fim em { color: var(--ember); font-style: normal; font-weight: 600; }
  @media (prefers-reduced-motion: reduce) { .faisca, .aviso { animation: none; } }
</style>
