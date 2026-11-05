<script lang="ts">
  import {
    addItem, asText, carryCapacity, changeQty, inventoryWeight, itemLabel, itemTemplate, linkOf, normalizeType, parseProps, readInventory, readItemCard,
    resolveLink, writeInventory,
    type InventoryItem, type ItemCard as Card,
  } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { engine } from '../engine.svelte';
  import ItemCard from './ItemCard.svelte';

  // Inventário da ficha (tabela "## Inventário"): lista ou cartas, peso e carga.
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
  /** nota e carta de cada item com [[link]] */
  const cards = $derived.by(() => {
    void cadernos.rev;
    return items.map((it): { path: string | null; card: Card | null } => {
      const hit = it.link ? resolveLink(it.link, engine.notes) : null;
      return hit ? { path: hit.path, card: readItemCard(itemLabel(it.name), cadernos.read(hit.path)) } : { path: null, card: null };
    });
  });
  const weight = $derived(inventoryWeight(items.map((it, i) => ({ ...it, weight: it.weight ?? cards[i]?.card?.weight ?? null }))));
  const cap = $derived(strength ? carryCapacity(strength) : null);
  const load = $derived(cap ? Math.min(1, weight / cap.max) : null);

  let name = $state('');
  let qty = $state('1');
  let kg = $state('');
  let open = $state<number | null>(null);

  const kgText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

  function save(next: InventoryItem[]) {
    cadernos.update(path, (t) => writeInventory(t, next));
  }

  function add() {
    const n = name.trim();
    if (!n) return;
    const w = Number(kg.replace(',', '.'));
    // nome igual a uma nota de item: vira link (e a carta aparece sozinha)
    const note = !linkOf(n) ? resolveLink(n, engine.notes) : null;
    const label = note && isItem(note.path) ? `[[${n}]]` : n;
    save(addItem(items, { name: label, link: linkOf(label), qty: Math.max(1, Math.round(Number(qty) || 1)), weight: kg.trim() && Number.isFinite(w) ? w : null, notes: '' }));
    name = '';
    qty = '1';
    kg = '';
  }

  function isItem(p: string): boolean {
    const props = parseProps(cadernos.read(p));
    return normalizeType(asText(props['tipo'] ?? props['type'])) === 'item';
  }

  /** cria a nota da carta e liga o item a ela */
  function createCard(i: number) {
    const it = items[i];
    if (!it) return;
    const label = itemLabel(it.name);
    const world = /^Mundos\/([^/]+)\//.exec(path)?.[1];
    const folder = world ? `Mundos/${world}/Itens` : 'Itens';
    const created = cadernos.create(folder, label, (n) => itemTemplate(n, { world }));
    const final = created.split('/').pop()!.replace(/\.md$/, '');
    save(items.map((x, j) => (j === i ? { ...x, name: `[[${final}]]`, link: final } : x)));
    onOpenNote?.(created);
  }
</script>

<div class="inv">
  <div class="head">
    <span class="w" title={cap ? `Carga máxima ${kgText(cap.max)} kg (Força × 7,5)` : 'Peso total'}>
      ⚖ <b>{kgText(weight)}</b>{#if cap} / {kgText(cap.max)}{/if} kg
    </span>
    {#if load !== null}
      <div class="loadbar" title={weight > cap!.heavy ? 'Muito pesado: −6 m de deslocamento e desvantagem' : weight > cap!.encumbered ? 'Pesado: −3 m de deslocamento' : 'Carga leve'}>
        <i style:width="{load * 100}%" class:mid={weight > cap!.encumbered} class:low={weight > cap!.heavy}></i>
      </div>
    {/if}
    {#if !compact}
      <span class="seg" role="radiogroup" aria-label="Ver como">
        <button role="radio" aria-checked={mode === 'lista'} class:on={mode === 'lista'} onclick={() => setMode('lista')}>Lista</button>
        <button role="radio" aria-checked={mode === 'cartas'} class:on={mode === 'cartas'} onclick={() => setMode('cartas')}>Cartas</button>
      </span>
    {/if}
  </div>

  {#if mode === 'cartas' && !compact}
    <div class="deck">
      {#each items as it, i (i)}
        {@const c = cards[i]}
        <ItemCard name={itemLabel(it.name)} card={c?.card ?? null} qty={it.qty}
          onopen={c?.path && onOpenNote ? () => onOpenNote!(c.path!) : undefined} oncreate={() => createCard(i)} />
      {:else}
        <p class="dim small">Mochila vazia.</p>
      {/each}
    </div>
  {:else}
    <ul class="list">
      {#each items as it, i (i)}
        {@const c = cards[i]}
        <li data-rarity={c?.card?.rarity ?? ''}>
          <button class="iname" onclick={() => (open = open === i ? null : i)} aria-expanded={open === i}>
            <i class="pip" aria-hidden="true"></i>{itemLabel(it.name)}{#if it.notes}<small>{it.notes}</small>{/if}
          </button>
          <span class="kg dim mono">{(it.weight ?? c?.card?.weight) != null ? `${kgText((it.weight ?? c?.card?.weight ?? 0) * it.qty)} kg` : ''}</span>
          <span class="qty">
            <button class="icon" onclick={() => save(changeQty(items, i, -1))} aria-label={`Um ${itemLabel(it.name)} a menos`}>−</button>
            <b class="mono">{it.qty}</b>
            <button class="icon" onclick={() => save(changeQty(items, i, 1))} aria-label={`Um ${itemLabel(it.name)} a mais`}>+</button>
          </span>
        </li>
        {#if open === i}
          <li class="peek">
            <ItemCard name={itemLabel(it.name)} card={c?.card ?? null} qty={it.qty}
              onopen={c?.path && onOpenNote ? () => onOpenNote!(c.path!) : undefined} oncreate={() => createCard(i)} />
          </li>
        {/if}
      {:else}
        <li class="dim small none">Mochila vazia.</li>
      {/each}
    </ul>
  {/if}

  <form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
    <input class="field" bind:value={name} placeholder="Item (ou [[nota do item]])" aria-label="Item" />
    <input class="field mono q" bind:value={qty} inputmode="numeric" aria-label="Quantidade" title="Quantidade" />
    <input class="field mono q" bind:value={kg} inputmode="decimal" placeholder="kg" aria-label="Peso (kg)" title="Peso de cada um (kg)" />
    <button class="ghost sm" disabled={!name.trim()}>+ Item</button>
  </form>
</div>

<style>
  .inv { display: grid; gap: 8px; }
  .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .w { font: 12.5px var(--f-mono); color: var(--muted); white-space: nowrap; }
  .w b { color: var(--ink); }
  .loadbar { flex: 1 1 80px; height: 5px; border-radius: 3px; background: var(--void); overflow: hidden; }
  .loadbar i { display: block; height: 100%; background: var(--ok); transition: width var(--dur-slow) var(--ease); }
  .loadbar i.mid { background: #f5c26b; }
  .loadbar i.low { background: var(--crit); }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); margin-left: auto; }
  .seg button { border: 0; background: none; border-radius: 7px; padding: 2px 9px; font-size: 12px; color: var(--muted); }
  .seg button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  .list li { --c: var(--line); display: flex; align-items: center; gap: 8px; padding: 2px 4px; border-radius: 8px; }
  .list li:hover { background: var(--surface-2); }
  .list li[data-rarity='comum'] { --c: #9aa3ad; }
  .list li[data-rarity='incomum'] { --c: #4fc37b; }
  .list li[data-rarity='raro'] { --c: #4f9cff; }
  .list li[data-rarity='muito raro'] { --c: #b07cff; }
  .list li[data-rarity='lendário'] { --c: #ffb54a; }
  .list li[data-rarity='artefato'] { --c: #ff5f5f; }
  .list li.peek { padding: 6px 4px 10px 22px; }
  .list li.peek:hover { background: none; }
  .none { padding: 6px 4px; }
  .iname { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 7px; border: 0; background: none; padding: 3px 0; text-align: left; font-size: 13.5px; color: var(--ink); }
  .iname small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pip { width: 8px; height: 8px; flex: none; transform: rotate(45deg) translateY(-1px); border-radius: 2px; background: var(--c); box-shadow: 0 0 6px color-mix(in srgb, var(--c) 70%, transparent); }
  .kg { font-size: 11.5px; white-space: nowrap; }
  .qty { display: inline-flex; align-items: center; gap: 2px; }
  .qty .icon { width: 22px; height: 22px; font-size: 14px; }
  .qty b { min-width: 20px; text-align: center; font-size: 13px; }
  .deck { display: flex; flex-wrap: wrap; gap: 14px; padding: 4px 2px 8px; }
  .add { display: flex; gap: 6px; }
  .add .field:first-child { flex: 1; min-width: 0; }
  .add .q { width: 54px; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
  .mono { font-family: var(--f-mono); }
</style>
