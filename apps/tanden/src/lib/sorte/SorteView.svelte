<script lang="ts">
  import { SORTE_NOTE } from '@tanden/core';
  import Coin from './Coin.svelte';
  import Draw from './Draw.svelte';
  import EightBall from './EightBall.svelte';
  import Wheel from './Wheel.svelte';
  import { hhmm, sorte, type SorteTab, type SorteTool } from './sorte.svelte';
  import '../rpg/mesa.css';

  let { onOpenNote, onDice }: { onOpenNote: (path: string) => void; onDice: () => void } = $props();

  const TABS: Array<[SorteTab, string]> = [['roleta', 'Roleta'], ['sorteio', 'Sorteio'], ['moeda', 'Moeda'], ['bola8', 'Bola 8']];
  const ICON: Record<SorteTool, string> = { roleta: '◎', sorteio: '☰', moeda: '◉', bola8: '➑' };

  function pick(t: SorteTab) {
    sorte.tab = t;
    sorte.save();
  }
</script>

<div class="rpg sorte">
  <div class="mainc">
    <header class="top">
      <h1>Sorte</h1>
      <div class="acts">
        <button class="ghost sm" onclick={onDice} title="Dados de RPG ficam na Mesa">Dados</button>
        {#if sorte.lists.length}<button class="ghost sm" onclick={() => onOpenNote(SORTE_NOTE)}>Nota das listas</button>{/if}
      </div>
    </header>

    <div class="tabs" role="tablist">
      {#each TABS as [id, label] (id)}
        <button role="tab" aria-selected={sorte.tab === id} class:on={sorte.tab === id} onclick={() => pick(id)}>{label}</button>
      {/each}
    </div>

    <div class="content">
      {#if sorte.tab === 'roleta'}
        <Wheel />
      {:else if sorte.tab === 'sorteio'}
        <Draw />
      {:else if sorte.tab === 'moeda'}
        <Coin />
      {:else}
        <EightBall />
      {/if}
    </div>
  </div>

  <aside class="side">
    <div class="sh">
      <h2>Histórico</h2>
      {#if sorte.log.length}<button class="icon" onclick={() => sorte.clearLog()} title="Limpar histórico" aria-label="Limpar histórico">×</button>{/if}
    </div>
    {#if sorte.log.length}
      <ul class="log">
        {#each sorte.log as e (e.id)}
          <li>
            <span class="ic" aria-hidden="true">{ICON[e.tool]}</span>
            <span class="tx"><b>{e.text}</b>{#if e.detail}<small class="dim">{e.detail}</small>{/if}</span>
            <time class="dim small">{hhmm(e.at)}</time>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="dim small">Os resultados ficam aqui (só neste aparelho).</p>
    {/if}
  </aside>
</div>

<style>
  .sorte { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 280px; }
  .mainc { min-width: 0; overflow-y: auto; padding: 22px 28px 40px; display: flex; flex-direction: column; }
  .side { border-left: 1px solid var(--line); padding: 18px 14px 12px; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  h1 { margin: 0; font: 600 26px/1.15 var(--f-display); letter-spacing: .02em; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 18px; overflow-x: auto; scrollbar-width: none; flex: none; }
  .tabs button { border: 0; background: none; padding: 9px 12px; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap;
    font: 600 12px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .content { flex: 1; min-height: 0; }

  .sh { display: flex; justify-content: space-between; align-items: center; }
  .log { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; gap: 2px; align-content: start; }
  .log li { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 6px 4px; border-radius: 8px; }
  .log li:hover { background: var(--surface-2); }
  .ic { color: var(--ember-soft); text-align: center; }
  .tx { display: grid; min-width: 0; }
  .tx b { font-weight: 600; font-size: 13.5px; overflow-wrap: anywhere; }
  .tx small { font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media (max-width: 900px) {
    .sorte { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
    .side { border-left: 0; border-top: 1px solid var(--line); max-height: 28vh; padding: 10px 16px; }
    .mainc { padding: 16px 16px 24px; }
  }
</style>
