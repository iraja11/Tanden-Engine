<script lang="ts">
  import { untrack } from 'svelte';
  import { TONS_SINAL, type AcaoSinal, type Sinal, type TomSinal, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import Icon from '../../../ui/Icon.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import { jornada } from '../jornada/jornada.svelte';

  // O arauto do mundo: o que está acontecendo, lido das fichas. Monopólios,
  // escassez, poderes quebrados, feras perto de vilas, luas cheias juntas,
  // ódios no elenco, marcos de população. Cada sinal leva aonde agir.
  let { world, onclose, onacao }: { world: World; onclose: () => void; onacao: (a: AcaoSinal) => void } = $props();

  const sinais = $derived.by(() => { void cadernos.rev; return jornada.sinais(world); });
  // o que já estava lido quando o painel abriu (o resto ganha a marca de novo)
  const lidosAntes: Record<string, number> = untrack(() => ({ ...jornada.lidos(world.name) }));
  $effect(() => {
    const ids = sinais.map((s) => s.id);
    const t = setTimeout(() => jornada.lerSinais(world.name, ids), 1200);
    return () => clearTimeout(t);
  });
  let tom = $state<TomSinal | 'todos'>('todos');
  const contagem = $derived(Object.fromEntries((Object.keys(TONS_SINAL) as TomSinal[]).map((t) => [t, sinais.filter((s) => s.tom === t).length])) as Record<TomSinal, number>);
  const vistos = $derived(sinais.filter((s) => tom === 'todos' || s.tom === tom));
  const novos = $derived(sinais.filter((s) => !lidosAntes[s.id]).length);
  const ROTULO: Record<AcaoSinal['tipo'], string> = { abrir: 'Abrir', aba: 'Ver', criar: 'Criar' };
  function agir(s: Sinal) {
    if (!s.acao) return;
    onacao(s.acao);
    onclose();
  }
</script>

<div class="t-scrim fundo" role="presentation" onclick={(ev) => { if (ev.target === ev.currentTarget) onclose(); }} onkeydown={(ev) => { if (ev.key === 'Escape') onclose(); }}>
  <div class="painel" role="dialog" aria-modal="true" aria-label={`O arauto de ${world.name}`} in:rise={{ y: 12 }}>
    <header class="topo">
      <span class="sino" aria-hidden="true">🔔</span>
      <div><h2>O arauto de {world.name}</h2><p>{sinais.length} {sinais.length === 1 ? 'sinal' : 'sinais'}{novos ? ` · ${novos} ${novos === 1 ? 'novo' : 'novos'}` : ''}</p></div>
      <button class="t-btn t-btn--sm t-btn--icon t-btn--quiet" onclick={onclose} aria-label="Fechar"><Icon name="fechar" size={16} /></button>
    </header>

    <div class="tons t-scroll-x" role="group" aria-label="Tom">
      <button class="t-chip" class:on={tom === 'todos'} onclick={() => (tom = 'todos')}>Todos<small>{sinais.length}</small></button>
      {#each Object.entries(TONS_SINAL) as [id, t] (id)}
        {#if contagem[id as TomSinal]}
          <button class="t-chip" class:on={tom === id} style:--c={t.cor} onclick={() => (tom = id as TomSinal)}><span aria-hidden="true">{t.glifo}</span>{t.label}<small>{contagem[id as TomSinal]}</small></button>
        {/if}
      {/each}
    </div>

    {#if vistos.length}
      <ol class="lista">
        {#each vistos as s, i (s.id)}
          {@const t = TONS_SINAL[s.tom]}
          <li class="sinal" class:novo={!lidosAntes[s.id]} style:--c={t.cor} in:rise={{ delay: Math.min(i, 12) * 30, y: 6 }}>
            <span class="g" aria-hidden="true">{t.glifo}</span>
            <div class="txt">
              <small>{t.label}{#if !lidosAntes[s.id]}<em>novo</em>{/if}<span class="peso" title={`Importância ${s.peso} de 5`}>{'●'.repeat(s.peso)}<span>{'●'.repeat(5 - s.peso)}</span></span></small>
              <b>{s.titulo}</b>
              <p>{s.texto}</p>
            </div>
            {#if s.acao}<button class="t-btn t-btn--sm" onclick={() => agir(s)}>{ROTULO[s.acao.tipo]}</button>{/if}
          </li>
        {/each}
      </ol>
    {:else}
      <div class="calmo">
        <span aria-hidden="true">☀</span>
        <p><b>Tudo calmo em {world.name}.</b> O arauto lê as fichas: quando houver monopólio, escassez, poder sem custo, fera perto de vila ou luas cheias juntas, ele avisa aqui.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .fundo { place-items: stretch end; padding: 0; }
  .painel { width: min(500px, 100%); height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4) var(--sp-5) var(--sp-6); background: var(--surface); border-left: 1px solid var(--line); box-shadow: var(--elev-2); }
  .painel > * { flex-shrink: 0; }
  .topo { display: flex; align-items: center; gap: var(--sp-3); }
  .topo > div { flex: 1; min-width: 0; }
  .sino { width: 42px; height: 42px; display: grid; place-items: center; font-size: 20px; border-radius: 50%; background: color-mix(in srgb, var(--ember) 14%, transparent); animation: badala 1.6s ease-in-out 1; transform-origin: 50% 15%; }
  @keyframes badala { 0%, 100% { rotate: 0deg; } 15% { rotate: 18deg; } 30% { rotate: -14deg; } 45% { rotate: 9deg; } 60% { rotate: -5deg; } }
  h2 { margin: 0; font: 600 18px var(--f-display); overflow-wrap: anywhere; }
  .topo p { margin: 0; font: 12px var(--f-mono); color: var(--muted); }
  .tons { display: flex; gap: 4px; }
  .tons small { margin-left: 4px; font: 10px var(--f-mono); color: var(--muted); }
  .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .sinal { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 12px; border-radius: var(--r-lg);
    border: 1px solid color-mix(in srgb, var(--c) 30%, var(--line)); background: linear-gradient(115deg, color-mix(in srgb, var(--c) 8%, var(--surface)), var(--surface) 65%); }
  .sinal.novo { border-color: color-mix(in srgb, var(--c) 65%, var(--line)); box-shadow: 0 0 20px -10px var(--c); }
  .g { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; font-size: 17px; color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); }
  .txt { display: grid; gap: 2px; min-width: 0; }
  .txt small { display: flex; align-items: center; gap: 6px; font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--c); }
  .txt em { font: normal 600 9.5px var(--f-mono); letter-spacing: 0; text-transform: none; color: var(--surface); background: var(--c); border-radius: var(--r-pill); padding: 0 6px; }
  .peso { margin-left: auto; font-size: 7px; letter-spacing: 1px; }
  .peso span { color: var(--line); }
  .txt b { font: 600 14.5px/1.3 var(--f-display); }
  .txt p { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
  .sinal .t-btn { align-self: center; }
  .calmo { display: flex; gap: var(--sp-3); align-items: center; padding: var(--sp-4); border: 1px dashed var(--line); border-radius: var(--r-lg); }
  .calmo span { font-size: 30px; color: #e8c547; }
  .calmo p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .calmo b { color: var(--ink); }
  @media (prefers-reduced-motion: reduce) { .sino { animation: none; } }
</style>
