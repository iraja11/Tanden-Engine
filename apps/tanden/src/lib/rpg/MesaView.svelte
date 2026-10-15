<script lang="ts">
  import { cadernos } from '../cadernos/cadernos.svelte';
  import CombatTracker from './CombatTracker.svelte';
  import DiceTray from './DiceTray.svelte';
  import { mesa, type MesaTab } from './mesa.svelte';
  import PartyPanel from './PartyPanel.svelte';
  import RollLog from './RollLog.svelte';
  import SessionsPanel from './SessionsPanel.svelte';
  import TablesPanel from './TablesPanel.svelte';
  import './mesa.css';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const camp = $derived(mesa.campaign);
  let dialog = $state(false);
  let name = $state('');
  let world = $state('');
  let system = $state('5e');

  const TABS: Array<[MesaTab, string]> = [['dados', 'Dados'], ['combate', 'Combate'], ['fichas', 'Personagens'], ['tabelas', 'Tabelas'], ['sessoes', 'Sessões']];

  function pick(t: MesaTab) {
    mesa.tab = t;
    mesa.save();
  }

  function startCampaign() {
    dialog = true;
    name = '';
    world = cadernos.worlds[0]?.name ?? '';
    system = '5e';
  }

  function create() {
    if (!name.trim()) return;
    mesa.createCampaign(name, world, system);
    dialog = false;
  }
</script>

<div class="rpg mesa">
  <div class="mainc">
    <header class="top">
      <div class="title">
        <h1>Mesa</h1>
        {#if mesa.campaigns.length}
          <select class="field" value={camp?.path ?? ''} onchange={(e) => mesa.pickCampaign((e.currentTarget as HTMLSelectElement).value)} aria-label="Campanha">
            {#each mesa.campaigns as c (c.path)}<option value={c.path}>{c.name}</option>{/each}
          </select>
        {/if}
      </div>
      <div class="acts">
        {#if camp}
          <span class="dim small">{camp.world ? `Mundo ${camp.world}` : 'Sem mundo'} · {camp.system}</span>
          <button class="ghost sm" onclick={() => onOpenNote(camp.path)}>Nota da campanha</button>
        {/if}
        <button class="ghost sm" onclick={startCampaign}>Nova campanha</button>
      </div>
    </header>

    <div class="tabs" role="tablist">
      {#each TABS as [id, label] (id)}
        <button role="tab" aria-selected={mesa.tab === id} class:on={mesa.tab === id} onclick={() => pick(id)}>{label}</button>
      {/each}
    </div>

    <div class="content">
      {#if mesa.tab === 'dados'}
        <DiceTray autofocus />
      {:else if mesa.tab === 'combate'}
        <CombatTracker {onOpenNote} />
      {:else if mesa.tab === 'tabelas'}
        <TablesPanel {onOpenNote} />
      {:else if !camp}
        <div class="empty-state">
          <p>Uma campanha junta as sessões, os encontros e as fichas de jogo. Ligada a um mundo dos <b>Mundos</b>, os personagens e criaturas de lá entram na mesa.</p>
          <button class="primary" onclick={startCampaign}>Criar campanha</button>
        </div>
      {:else if mesa.tab === 'fichas'}
        <PartyPanel campaign={camp} {onOpenNote} />
      {:else}
        <SessionsPanel campaign={camp} {onOpenNote} />
      {/if}
    </div>
  </div>

  <aside class="side">
    <RollLog {onOpenNote} />
  </aside>

  {#if dialog}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dialog = false; }}>
      <div class="dialog" role="dialog" aria-modal="true">
        <h2>Nova campanha</h2>
        <form onsubmit={(e) => { e.preventDefault(); create(); }}>
          <!-- svelte-ignore a11y_autofocus -->
          <label>Nome<input class="field" bind:value={name} placeholder="A Mina Perdida" autofocus /></label>
          <label>Mundo
            <select class="field" bind:value={world}>
              <option value="">Nenhum</option>
              {#each cadernos.worlds as w (w.name)}<option value={w.name}>{w.name}</option>{/each}
            </select>
            <span class="hint dim">Os personagens e criaturas com ficha de jogo nesse mundo entram na campanha.</span>
          </label>
          <label>Sistema
            <select class="field" bind:value={system}>
              <option value="5e">D&amp;D 5e, Tormenta e parecidos (modificador = (valor − 10) ÷ 2)</option>
              <option value="livre">Livre (o valor do atributo já é o modificador)</option>
            </select>
          </label>
          <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = false)}>Cancelar</button><button class="primary" disabled={!name.trim()}>Criar</button></div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .mesa { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 300px; }
  .mainc { min-width: 0; overflow-y: auto; padding: 22px 28px 40px; display: flex; flex-direction: column; }
  .side { border-left: 1px solid var(--line); padding: 18px 14px 12px; min-height: 0; display: flex; flex-direction: column; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font: 600 26px/1.15 var(--f-display); letter-spacing: .02em; }
  .title select { max-width: 260px; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 16px; overflow-x: auto; scrollbar-width: none; flex: none; }
  .tabs button { border: 0; background: none; padding: 9px 12px; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap;
    font: 600 12px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .content { flex: 1; min-height: 0; }

  @media (max-width: 900px) {
    .mesa { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
    .side { border-left: 0; border-top: 1px solid var(--line); max-height: 34vh; padding: 10px 16px; }
    .mainc { padding: 16px 16px 24px; }
  }
</style>
