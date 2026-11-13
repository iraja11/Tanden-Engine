<script lang="ts">
  import { CATALOG, MASTERIES, formatMoney, parseMoney, type CatalogEntry } from '@tanden/core';
  import ItemIcon from './ItemIcon.svelte';

  // Catálogo do equipamento comum (SRD 2024): procurar, guardar na mochila ou comprar com as moedas da bolsa.
  let { purse, onadd, onbuy, onclose }: {
    /** dinheiro da ficha, em cobre */
    purse: number;
    onadd: (e: CatalogEntry, qty: number) => void;
    /** compra: devolve uma mensagem de erro, ou null se deu certo */
    onbuy: (e: CatalogEntry, qty: number) => string | null;
    onclose: () => void;
  } = $props();

  type Tab = 'armas' | 'armaduras' | 'aventura' | 'consumiveis' | 'ferramentas';
  const TABS: Array<[Tab, string]> = [['armas', 'Armas'], ['armaduras', 'Armaduras'], ['aventura', 'Aventura'], ['consumiveis', 'Poções e consumíveis'], ['ferramentas', 'Ferramentas e focos']];
  let tab = $state<Tab>('armas');
  let q = $state('');
  let msg = $state<{ ok: boolean; text: string } | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const inTab = (e: CatalogEntry, t: Tab) =>
    t === 'armas' ? e.kind === 'arma'
      : t === 'armaduras' ? e.kind === 'armadura' || e.kind === 'escudo'
        : t === 'consumiveis' ? e.kind === 'consumível'
          : t === 'ferramentas' ? e.kind === 'ferramenta' || e.kind === 'foco'
            : e.kind === 'equipamento' || e.kind === 'munição';
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = $derived.by(() => {
    const n = norm(q.trim());
    const pool = n ? CATALOG.filter((e) => norm([e.name, ...e.aliases, e.category, e.mastery].join(' ')).includes(n)) : CATALOG.filter((e) => inTab(e, tab));
    const groups = new Map<string, CatalogEntry[]>();
    for (const e of pool) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
    return [...groups.entries()];
  });

  const kg = (n: number) => (n ? `${String(n).replace('.', ',')} kg` : '—');
  function flash(ok: boolean, text: string) {
    msg = { ok, text };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (msg = null), 3000);
  }
  function add(e: CatalogEntry) {
    onadd(e, 1);
    flash(true, `${e.name} na mochila`);
  }
  function buy(e: CatalogEntry) {
    const err = onbuy(e, 1);
    flash(!err, err ?? `Comprou ${e.name} por ${e.price}`);
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog cat" role="dialog" aria-modal="true" aria-label="Catálogo de equipamento" tabindex="-1">
    <header class="ch">
      <h2>Catálogo de equipamento</h2>
      <span class="purse mono" title="Dinheiro na bolsa da ficha">◉ {formatMoney(purse)}</span>
    </header>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={q} placeholder="Procurar: espada, poção, Acuidade, Derrubar…" aria-label="Procurar no catálogo" autofocus />
    {#if !q.trim()}
      <div class="tabs" role="tablist">
        {#each TABS as [id, label] (id)}
          <button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => (tab = id)}>{label}</button>
        {/each}
      </div>
    {/if}
    {#if msg}<p class="msg" class:bad={!msg.ok} role="status">{msg.text}</p>{/if}

    <div class="scroll">
      {#each list as [group, entries] (group)}
        <h5>{group}</h5>
        <ul>
          {#each entries as e (e.name)}
            {@const cost = e.price ? parseMoney(e.price) : null}
            <li data-rarity={e.rarity}>
              <span class="ic"><ItemIcon hint={`${e.category} ${e.name}`} size={22} /></span>
              <div class="info">
                <b>{e.name}</b>
                <small>
                  {#if e.damage}<span class="mono">{e.damage}</span>{/if}
                  {#if e.ac}<span class="mono">CA {e.ac}</span>{/if}
                  {#if e.heal}<span class="mono">♥ {e.heal}</span>{/if}
                  {#if e.properties.length}<span>{e.properties.join(', ')}</span>{/if}
                  {#if !e.damage && !e.ac && !e.heal && e.description}<span>{e.description}</span>{/if}
                </small>
              </div>
              {#if e.mastery}<span class="mast" title={MASTERIES[e.mastery]}>{e.mastery}</span>{:else}<span class="mast none"></span>{/if}
              <span class="w mono">{kg(e.weight)}</span>
              <span class="p mono">{e.price || '—'}</span>
              <span class="acts">
                <button class="ghost sm" onclick={() => add(e)} title="Guardar na mochila (sem pagar)">+</button>
                <button class="primary sm" disabled={cost === null || cost > purse} onclick={() => buy(e)}
                  title={cost === null ? 'Sem preço de tabela' : cost > purse ? 'Moedas insuficientes' : `Paga ${e.price} da bolsa`}>Comprar</button>
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="dim small">Nada com esse nome. Para algo único, use <b>Forjar item</b>.</p>
      {/each}
    </div>
    <div class="formacts"><button class="ghost" onclick={onclose}>Fechar</button></div>
  </div>
</div>

<style>
  .cat { width: min(820px, 100%) !important; max-height: min(86vh, 900px) !important; display: flex !important; flex-direction: column; overflow: hidden !important; }
  .ch { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .purse { font-size: 13px; color: #f5c26b; }
  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; flex: none; }
  .tabs button { border: 0; background: none; padding: 8px 10px; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap;
    font: 600 11px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .msg { margin: 0; padding: 6px 10px; border-radius: 9px; font-size: 12.5px; background: color-mix(in srgb, var(--ok) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent); }
  .msg.bad { background: color-mix(in srgb, var(--crit) 12%, transparent); border-color: color-mix(in srgb, var(--crit) 40%, transparent); }
  .scroll { overflow-y: auto; min-height: 0; flex: 1; margin: 0 -6px; padding: 0 6px; }
  h5 { margin: 12px 0 4px; font: 600 10px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--ember-soft); position: sticky; top: 0;
    background: var(--surface); padding: 4px 0; z-index: 1; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li { --c: #9aa3ad; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 56px 64px auto; gap: 10px; align-items: center; padding: 6px 6px; border-radius: 10px; }
  li:hover { background: var(--surface-2); }
  li[data-rarity='incomum'] { --c: #4fc37b; } li[data-rarity='raro'] { --c: #4f9cff; } li[data-rarity='muito raro'] { --c: #b07cff; }
  .ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: var(--c);
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--c) 26%, var(--surface-2)), var(--void) 90%); border: 1px solid color-mix(in srgb, var(--c) 40%, var(--line)); }
  .info { display: grid; min-width: 0; }
  .info b { font-size: 13.5px; font-weight: 600; }
  .info small { display: flex; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--muted); }
  .info small .mono { color: var(--silver); }
  .mast { font: 600 9.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--ember-soft); padding: 2px 7px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ember) 35%, transparent); cursor: help; white-space: nowrap; }
  .mast.none { visibility: hidden; border: 0; }
  .w, .p { font-size: 12px; color: var(--silver); text-align: right; white-space: nowrap; }
  .p { color: #f5c26b; }
  .acts { display: flex; gap: 4px; }
  @media (max-width: 640px) {
    li { grid-template-columns: 34px minmax(0, 1fr) auto; row-gap: 4px; }
    .mast, .w { display: none; }
    .p { grid-column: 2; text-align: left; }
    .acts { grid-column: 3; grid-row: 1 / span 2; flex-direction: column; }
  }
</style>
