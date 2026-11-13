<script lang="ts">
  import {
    CATALOG, addItem, asText, carryCapacity, catalogEntry, changeQty, coinsValue, forgeFromNote, formatMoney, inventoryValue, inventoryWeight, itemInfo,
    itemLabel, itemNote, linkOf, normalizeType, parseMoney, parseProps, pay, purseProps, readInventory, readItemCard, readPurse, resolveLink, setProps,
    updateItemNote, writeInventory, type CatalogEntry, type InventoryItem, type ItemInfo, type NewItem,
  } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { engine } from '../engine.svelte';
  import Catalog from './Catalog.svelte';
  import ItemCard from './ItemCard.svelte';
  import ItemDetail from './ItemDetail.svelte';
  import ItemForge from './ItemForge.svelte';
  import ItemIcon from './ItemIcon.svelte';
  import Portrait from './Portrait.svelte';

  // Inventário da ficha (tabela "## Inventário"): mochila com carga e valor, itens em uso,
  // cartas com foto, catálogo do SRD para comprar e a forja para itens únicos.
  let { path, text, strength = null, compact = false, onOpenNote }: {
    path: string;
    text: string;
    /** valor de Força (5e), para a carga */
    strength?: number | null;
    compact?: boolean;
    onOpenNote?: (p: string) => void;
  } = $props();

  const KEY = 'tanden.inventario.modo';
  let mode = $state<'lista' | 'cartas'>((() => { try { return localStorage.getItem(KEY) === 'cartas' ? 'cartas' : 'lista'; } catch { return 'lista'; } })());
  function setMode(m: 'lista' | 'cartas') {
    mode = m;
    try { localStorage.setItem(KEY, m); } catch { /* sem armazenamento */ }
  }

  const items = $derived(readInventory(text));
  /** nota (se tem) e tudo o que se sabe de cada item */
  const rows = $derived.by(() => {
    void cadernos.rev;
    return items.map((it, i) => {
      const hit = it.link ? resolveLink(it.link, engine.notes) : null;
      const note = hit ? readItemCard(itemLabel(it.name), cadernos.read(hit.path)) : null;
      return { i, it, notePath: hit?.path ?? null, info: itemInfo(it, note) };
    });
  });
  type Row = (typeof rows)[number];

  const weight = $derived(inventoryWeight(rows.map((r) => ({ ...r.it, weight: r.it.weight ?? r.info.card.weight ?? null }))));
  const worth = $derived(inventoryValue(rows.map((r) => ({ qty: r.it.qty, card: r.info.card }))));
  const cap = $derived(strength ? carryCapacity(strength) : null);
  const load = $derived(cap ? Math.min(1, weight / cap.max) : null);
  const loadState = $derived(!cap ? '' : weight > cap.max ? 'Acima da carga máxima' : weight > cap.heavy ? 'Muito pesado: −6 m e desvantagem' : weight > cap.encumbered ? 'Pesado: −3 m de deslocamento' : 'Carga leve');
  const purse = $derived(readPurse(parseProps(text)));
  const money = $derived(coinsValue(purse.coins));

  // ---------------------------------------------------------------- filtros
  type Filter = 'tudo' | 'uso' | 'armas' | 'armaduras' | 'consumiveis' | 'magicos' | 'outros';
  const FILTERS: Array<[Filter, string]> = [['tudo', 'Tudo'], ['uso', 'Em uso'], ['armas', 'Armas'], ['armaduras', 'Proteção'], ['consumiveis', 'Consumíveis'], ['magicos', 'Mágicos'], ['outros', 'Outros']];
  let filter = $state<Filter>('tudo');
  let q = $state('');
  const magic = (r: Row) => r.info.card.rarity !== 'comum' || r.info.card.attunement || !!r.info.card.charges;
  const pass = (r: Row, f: Filter) =>
    f === 'tudo' ? true
      : f === 'uso' ? r.it.equipped
        : f === 'armas' ? r.info.kind === 'arma' || r.info.kind === 'munição'
          : f === 'armaduras' ? r.info.kind === 'armadura' || r.info.kind === 'escudo'
            : f === 'consumiveis' ? r.info.kind === 'consumível'
              : f === 'magicos' ? magic(r)
                : !['arma', 'munição', 'armadura', 'escudo', 'consumível'].includes(r.info.kind);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = $derived(rows.filter((r) => pass(r, filter) && (!q.trim() || norm(`${r.info.label} ${r.info.card.category} ${r.it.notes}`).includes(norm(q.trim())))));
  const inUse = $derived(shown.filter((r) => r.it.equipped));
  const pack = $derived(shown.filter((r) => !r.it.equipped));
  const count = (f: Filter) => rows.filter((r) => pass(r, f)).length;

  let open = $state<number | null>(null);

  // ---------------------------------------------------------------- escrita
  function save(next: InventoryItem[]) {
    cadernos.update(path, (t) => writeInventory(t, next));
  }
  const world = $derived(/^Mundos\/([^/]+)\//.exec(path)?.[1]);
  const itemFolder = $derived(world ? `Mundos/${world}/Itens` : 'Itens');

  let name = $state('');
  let qty = $state('1');
  let kg = $state('');
  /** sugestões: catálogo e notas de item que já existem */
  const suggestions = $derived.by(() => {
    void cadernos.rev;
    const notes = engine.notes.filter((p) => /\/Itens\//.test(p) || p.startsWith('Itens/')).map((p) => `[[${p.split('/').pop()!.replace(/\.md$/, '')}]]`);
    return [...notes, ...CATALOG.map((e) => e.name)];
  });
  const sugId = `inv-sug-${Math.random().toString(36).slice(2, 9)}`;
  const kgText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

  function isItemNote(p: string): boolean {
    const props = parseProps(cadernos.read(p));
    return normalizeType(asText(props['tipo'] ?? props['type'])) === 'item';
  }
  function add() {
    const n = name.trim();
    if (!n) return;
    const w = Number(kg.replace(',', '.'));
    // nome igual a uma nota de item: vira link (e a carta aparece sozinha)
    const note = !linkOf(n) ? resolveLink(n, engine.notes) : null;
    const label = note && isItemNote(note.path) ? `[[${n}]]` : n;
    const entry = catalogEntry(n);
    const weight = kg.trim() && Number.isFinite(w) ? w : null;
    save(addItem(items, { name: entry && !note ? entry.name : label, link: linkOf(label), qty: Math.max(1, Math.round(Number(qty) || 1)), weight, notes: '' }));
    name = '';
    qty = '1';
    kg = '';
  }

  // catálogo
  let catalog = $state(false);
  function addEntry(e: CatalogEntry, n: number, t: string): string {
    return writeInventory(t, addItem(readInventory(t), { name: e.name, link: null, qty: n, weight: null, notes: '' }));
  }
  function buy(e: CatalogEntry, n: number): string | null {
    const cost = parseMoney(e.price);
    if (cost === null) return 'Sem preço de tabela';
    const next = pay(purse.coins, cost * n);
    if (!next) return 'Moedas insuficientes';
    cadernos.update(path, (t) => setProps(addEntry(e, n, t), purseProps(readPurse(parseProps(t)), next)));
    return null;
  }

  // forja (novo ou editar)
  let forge = $state<{ edit: Row | null; from?: Row } | null>(null);
  function forged(it: NewItem, n: number) {
    const f = forge;
    forge = null;
    if (f?.edit?.notePath) {
      cadernos.update(f.edit.notePath, (t) => updateItemNote(t, it));
      return;
    }
    const created = cadernos.create(itemFolder, it.name, (nm) => itemNote({ ...it, name: nm, world }));
    const final = created.split('/').pop()!.replace(/\.md$/, '');
    if (f?.from) {
      // item comum que virou carta: troca o nome pelo link, mantendo quantidade e estado
      const from = f.from;
      save(items.map((x, j) => (j === from.i ? { ...x, name: `[[${final}]]`, link: final } : x)));
    } else {
      save(addItem(items, { name: `[[${final}]]`, link: final, qty: n, weight: null, notes: '' }));
    }
  }
  /** campos da forja a partir de um item comum (para personalizar) */
  function fromRow(r: Row): NewItem {
    const c = r.info.card;
    return {
      name: r.info.label, rarity: c.rarity, category: c.category, value: c.valueText, weight: c.weight !== null ? kgText(c.weight) : '', damage: c.damage, ac: c.ac,
      attunement: c.attunement, properties: c.properties.join(', '), charges: '', heal: c.heal, image: '', description: c.description, world,
    };
  }
  const forgeInitial = $derived(forge?.edit?.notePath ? forgeFromNote(forge.edit.info.label, cadernos.read(forge.edit.notePath)) : forge?.from ? fromRow(forge.from) : undefined);

  const meta = (r: Row) => {
    const c = r.info.card;
    return [c.damage, c.ac && `CA ${c.ac}`, c.heal && `♥ ${c.heal}`, c.charges && `✦ ${c.charges.left}${c.charges.max !== null ? `/${c.charges.max}` : ''}`].filter(Boolean).join(' · ');
  };
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open !== null && mode === 'cartas' && !forge && !catalog) open = null; }} />

<div class="inv">
  <header class="ihead">
    <div class="load" title={cap ? `Carga máxima ${kgText(cap.max)} kg (Força × 7,5)` : 'Peso total'}>
      <span class="lbl">Carga</span>
      <span class="wnum mono"><b>{kgText(weight)}</b>{#if cap}&nbsp;/ {kgText(cap.max)}{/if} kg</span>
      {#if load !== null && cap}
        <div class="loadbar">
          <i style:width="{load * 100}%" class:mid={weight > cap.encumbered} class:low={weight > cap.heavy}></i>
          <s style:left="{(cap.encumbered / cap.max) * 100}%"></s><s style:left="{(cap.heavy / cap.max) * 100}%"></s>
        </div>
        <small class="dim">{loadState}</small>
      {/if}
    </div>
    <div class="worth" title="Valor de tabela dos itens (sem contar a bolsa)">
      <span class="lbl">Valor</span>
      <b class="mono">{formatMoney(worth)}</b>
      <small class="dim">{rows.length} {rows.length === 1 ? 'item' : 'itens'} · {rows.filter((r) => r.it.equipped).length} em uso</small>
    </div>
    {#if !compact}
      <span class="seg" role="radiogroup" aria-label="Ver como">
        <button role="radio" aria-checked={mode === 'lista'} class:on={mode === 'lista'} onclick={() => setMode('lista')}>Lista</button>
        <button role="radio" aria-checked={mode === 'cartas'} class:on={mode === 'cartas'} onclick={() => setMode('cartas')}>Cartas</button>
      </span>
    {/if}
  </header>

  {#if rows.length > 3}
    <div class="tools">
      <input class="field search" bind:value={q} placeholder="Procurar na mochila" aria-label="Procurar na mochila" />
      <div class="filters">
        {#each FILTERS as [id, label] (id)}
          {@const n = count(id)}
          {#if id === 'tudo' || n}
            <button class="chip" class:on={filter === id} onclick={() => (filter = id)}>{label} <small>{n}</small></button>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  {#if mode === 'cartas' && !compact}
    <div class="deck">
      {#each shown as r (r.i)}
        <div class="slot" class:sel={open === r.i} role="button" tabindex="0" aria-expanded={open === r.i} aria-label={r.info.label}
          onclick={() => (open = open === r.i ? null : r.i)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open = open === r.i ? null : r.i; } }}>
          <ItemCard name={r.info.label} card={r.info.card} qty={r.it.qty} badge={r.it.equipped ? 'Em uso' : ''} />
        </div>
      {:else}
        <p class="dim small empty">{rows.length ? 'Nada com esse filtro.' : 'Mochila vazia.'}</p>
      {/each}
    </div>
    {#if open !== null && rows[open]}
      <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) open = null; }}>
        <div class="popdetail" role="dialog" aria-modal="true" aria-label={rows[open]!.info.label} tabindex="-1">
          {@render detail(rows[open]!)}
        </div>
      </div>
    {/if}
  {:else}
    {#if inUse.length}
      <h5>Em uso</h5>
      <ul class="list">{#each inUse as r (r.i)}{@render row(r)}{/each}</ul>
    {/if}
    {#if pack.length || !inUse.length}
      {#if inUse.length}<h5>Mochila</h5>{/if}
      <ul class="list">
        {#each pack as r (r.i)}{@render row(r)}{:else}<li class="dim small empty">{rows.length ? 'Nada com esse filtro.' : 'Mochila vazia. Escreva um item abaixo, abra o catálogo ou forje algo único.'}</li>{/each}
      </ul>
    {/if}
  {/if}

  <form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
    <input class="field" bind:value={name} placeholder="Item: Espada Longa, Poção de Cura, [[nota]]…" aria-label="Item" list={sugId} />
    <datalist id={sugId}>{#each suggestions as s (s)}<option value={s}></option>{/each}</datalist>
    <input class="field mono q" bind:value={qty} inputmode="numeric" aria-label="Quantidade" title="Quantidade" />
    <input class="field mono q" bind:value={kg} inputmode="decimal" placeholder="kg" aria-label="Peso (kg)" title="Peso de cada um (vazio: o do catálogo)" />
    <button class="ghost sm" disabled={!name.trim()}>+ Item</button>
    <span class="more">
      <button type="button" class="ghost sm" onclick={() => (catalog = true)} title="Armas, armaduras, poções e equipamento do SRD, com preço">📖 Catálogo</button>
      <button type="button" class="primary sm" onclick={() => (forge = { edit: null })} title="Item único com foto, raridade, cargas…">✦ Forjar item</button>
    </span>
  </form>

  {#if forge}
    <ItemForge {world} initial={forgeInitial} oncreate={forged} onclose={() => (forge = null)} />
  {/if}
  {#if catalog}
    <Catalog purse={money} onadd={(e, n) => cadernos.update(path, (t) => addEntry(e, n, t))} onbuy={buy} onclose={() => (catalog = false)} />
  {/if}
</div>

{#snippet row(r: Row)}
  {@const c = r.info.card}
  <li class="item" data-rarity={c.rarity} class:open={open === r.i}>
    <button class="main" onclick={() => (open = open === r.i ? null : r.i)} aria-expanded={open === r.i}>
      <span class="thumb">
        {#if c.image}<Portrait target={c.image} name={r.info.label} size={40} square />{:else}<ItemIcon hint={`${c.category} ${r.info.label}`} size={22} />{/if}
      </span>
      <span class="txt">
        <span class="nm">{r.info.label}{#if c.attunement}<em class="at" title="Exige sintonização"> ◈</em>{/if}</span>
        <small>{#if c.rarity !== 'comum'}<span class="rar">{c.rarity}</span>{/if}{meta(r) || c.category}{#if r.it.notes}<span class="note">&nbsp;— {r.it.notes}</span>{/if}</small>
      </span>
    </button>
    <span class="kg dim mono">{(r.it.weight ?? c.weight) != null ? `${kgText((r.it.weight ?? c.weight ?? 0) * r.it.qty)} kg` : ''}</span>
    <span class="qty">
      <button class="icon" onclick={() => save(changeQty(items, r.i, -1))} aria-label={`Um ${r.info.label} a menos`}>−</button>
      <b class="mono">{r.it.qty}</b>
      <button class="icon" onclick={() => save(changeQty(items, r.i, 1))} aria-label={`Um ${r.info.label} a mais`}>+</button>
    </span>
  </li>
  {#if open === r.i}
    <li class="peek">{@render detail(r)}</li>
  {/if}
{/snippet}

{#snippet detail(r: Row)}
  <ItemDetail {path} {text} index={r.i} item={r.it} info={r.info as ItemInfo} notePath={r.notePath} {onOpenNote}
    onedit={() => (forge = { edit: r })} oncreate={() => (forge = { edit: null, from: r })} onclose={() => (open = null)} />
{/snippet}

<style>
  .inv { display: grid; gap: 10px; container-type: inline-size; }
  .lbl { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .ihead { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto; gap: 10px; align-items: stretch; }
  .load, .worth { display: grid; gap: 4px; align-content: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--void); }
  .wnum { font-size: 12.5px; color: var(--muted); }
  .wnum b, .worth b { color: var(--ink); font-size: 15px; }
  .worth b { color: #f5c26b; }
  .load small, .worth small { font-size: 11px; }
  .loadbar { position: relative; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .loadbar i { display: block; height: 100%; background: var(--ok); transition: width var(--dur-slow) var(--ease); }
  .loadbar i.mid { background: #f5c26b; }
  .loadbar i.low { background: var(--crit); }
  .loadbar s { position: absolute; top: 0; bottom: 0; width: 1px; background: color-mix(in srgb, var(--ink) 35%, transparent); }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); align-self: center; }
  .seg button { border: 0; background: none; border-radius: 7px; padding: 3px 10px; font-size: 12px; color: var(--muted); }
  .seg button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }

  .tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .search { flex: 0 1 220px; padding: 5px 10px !important; font-size: 13px !important; }
  .filters { display: flex; gap: 5px; flex-wrap: wrap; }
  .filters small { color: var(--muted); }

  h5 { margin: 4px 0 0; font: 600 10px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--ember-soft); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .item { --c: #9aa3ad; display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 5px; border-radius: 12px; border: 1px solid transparent;
    transition: background var(--dur), border-color var(--dur); }
  .item:hover, .item.open { background: var(--surface-2); border-color: var(--line); }
  .item[data-rarity='incomum'] { --c: #4fc37b; } .item[data-rarity='raro'] { --c: #4f9cff; } .item[data-rarity='muito raro'] { --c: #b07cff; }
  .item[data-rarity='lendário'] { --c: #ffb54a; } .item[data-rarity='artefato'] { --c: #ff5f5f; }
  .main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; border: 0; background: none; padding: 0; text-align: left; color: var(--ink); }
  .thumb { width: 40px; height: 40px; flex: none; border-radius: 10px; overflow: hidden; display: grid; place-items: center; color: var(--c);
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--c) 28%, var(--surface-2)), var(--void) 90%);
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, transparent), 0 0 12px -6px var(--c); }
  .thumb :global(.portrait) { border-radius: 0 !important; }
  .txt { display: grid; min-width: 0; }
  .nm { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .at { font-style: normal; color: #b07cff; margin-left: 5px; }
  .txt small { font: 11.5px var(--f-mono); color: var(--silver); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rar { color: var(--c); font-family: var(--f-display); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 9.5px; margin-right: 6px; }
  .note { color: var(--muted); font-family: var(--f-body); }
  .kg { font-size: 11.5px; white-space: nowrap; }
  .qty { display: inline-flex; align-items: center; gap: 2px; }
  .qty .icon { width: 24px; height: 24px; font-size: 14px; }
  .qty b { min-width: 22px; text-align: center; font-size: 13px; }
  .peek { padding: 2px 0 8px; }
  .empty { padding: 10px 4px; }

  .deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px 10px; justify-items: center; align-items: start; padding: 4px 0 8px; }
  .popdetail { width: min(760px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; container-type: inline-size; border-radius: 16px;
    box-shadow: 0 30px 80px -20px var(--shadow); background: var(--surface); }
  .slot { cursor: pointer; border-radius: 16px; outline-offset: 4px; transition: transform var(--dur) var(--spring); }
  .slot.sel { outline: 2px solid var(--ember); }

  .add { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 10px; border-top: 1px dashed var(--line); }
  .add .field:first-child { flex: 1 1 200px; min-width: 0; }
  .add .q { width: 54px; }
  .more { display: flex; gap: 6px; margin-left: auto; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
  .mono { font-family: var(--f-mono); }

  @container (max-width: 520px) {
    .ihead { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .seg { grid-column: 1 / -1; justify-self: end; }
    .kg { display: none; }
    .add .field:first-child { flex-basis: 100%; }
    .add .q { flex: 1; }
    .more { margin-left: 0; width: 100%; }
    .more button { flex: 1; }
    .deck { grid-template-columns: minmax(0, 1fr); }
  }
</style>
