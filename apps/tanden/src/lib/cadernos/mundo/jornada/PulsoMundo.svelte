<script lang="ts">
  import { reviewWorld, storyIndex, NON_CARD_TYPES, type World } from '@tanden/core';
  import { jornada, totalDeConquistas } from './jornada.svelte';
  import Planeta from './Planeta.svelte';

  // O pulso do mundo no cabeçalho: planeta, era, nível, sequência e missões.
  let { world, vivo, onabrir, onmissoes }: {
    world: World;
    /** média de preenchimento das fichas, de 0 a 1 */
    vivo: number;
    onabrir: (aba: 'mundo' | 'conquistas' | 'constancia') => void;
    onmissoes: () => void;
  } = $props();

  const e = $derived(jornada.estado(world));
  const seq = $derived(jornada.sequencia);
  const m = $derived(jornada.missoes(world.name));
  const fichas = $derived(world.entities.filter((x) => !NON_CARD_TYPES.has(x.type)).length);
  const historias = $derived(storyIndex(world).length);
  const tempestades = $derived(reviewWorld(world).filter((i) => i.level === 'erro').length);
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  $effect(() => { jornada.garantirMissoes(world); });
</script>

<div class="pulso">
  <button class="astro" onclick={() => onabrir('mundo')} title="Ver a crônica do mundo" aria-label="Ver a crônica do mundo">
    <Planeta nome={world.name} genero={e.genero} era={e.indiceEra} {fichas} {historias} {tempestades} size={58} />
  </button>
  <div class="info">
    <button class="era" onclick={() => onabrir('mundo')} title={e.era.desc}>
      <b>{e.era.nome}</b><span>Nível {e.nivel.nivel}</span>
    </button>
    <div class="barra" title={`${fmt(e.nivel.xp - e.nivel.piso)} de ${fmt(e.nivel.teto - e.nivel.piso)} ${e.genero.moeda} para o próximo nível`}>
      <i style:width="{Math.round(e.nivel.fracao * 100)}%" style:background={e.genero.cores.luz}></i>
    </div>
    <div class="chips">
      <button class="chip" class:aceso={seq.hojeFeito} onclick={() => onabrir('constancia')} title={seq.hojeFeito ? 'Meta de hoje cumprida' : `Escreva ${jornada.meta} palavras hoje para manter a sequência`}>
        <span aria-hidden="true">🔥</span>{seq.atual}<span class="sr"> dias seguidos</span>
      </button>
      <button class="chip" onclick={onmissoes} title="Missões de hoje">
        <span aria-hidden="true">◎</span>{m.feitas.length}/{m.lista.length || 3}<span class="sr"> missões de hoje</span>
      </button>
      <button class="chip" onclick={() => onabrir('conquistas')} title={`${jornada.totalConquistas} de ${totalDeConquistas} conquistas`}>
        <span aria-hidden="true">🏆</span>{jornada.totalConquistas}<span class="sr"> conquistas</span>
      </button>
      <span class="vivo" title="Média de preenchimento das fichas">{Math.round(vivo * 100)}% vivo</span>
    </div>
  </div>
</div>

<style>
  .pulso { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-2); min-width: 0; }
  .astro { border: 0; background: none; padding: 0; border-radius: 50%; flex: none; transition: transform .25s var(--ease); }
  .astro:hover { transform: scale(1.08); }
  .info { display: grid; gap: 4px; min-width: 0; flex: 1; max-width: 340px; }
  .era { display: flex; align-items: baseline; gap: var(--sp-2); border: 0; background: none; padding: 0; color: var(--ink); text-align: left; min-width: 0; }
  .era b { font: 600 13.5px var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .era span { flex: none; font: 11px var(--f-mono); color: var(--muted); }
  .barra { height: 5px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .barra i { display: block; height: 100%; border-radius: 3px; transition: width .8s var(--ease); }
  .chips { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; min-height: 24px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--r-pill); background: var(--surface); color: var(--ink); font: 600 11.5px var(--f-mono); }
  .chip:hover { border-color: var(--ember); }
  .chip:not(.aceso):first-child span:first-child { filter: grayscale(1); opacity: .65; }
  .chip.aceso { border-color: color-mix(in srgb, var(--ember) 55%, var(--line)); background: color-mix(in srgb, var(--ember) 10%, var(--surface)); }
  .vivo { font: 11px var(--f-mono); color: var(--muted); margin-left: 4px; white-space: nowrap; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
