<script lang="ts">
  import {
    MASTERIES, attuneItem, changeQty, consumeItem, equipItem, isAttuned, noteName, readInventory, readSheet, resolveBonus, setCharges, setProps, sheetVars,
    transferItem, weaponAttack, writeInventory, type InventoryItem, type ItemInfo,
  } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { files } from '../files/files.svelte';
  import { mesa } from './mesa.svelte';
  import ItemCard from './ItemCard.svelte';

  // O que dá para fazer com um item da mochila: a carta dele e as ações ao lado.
  let { path, text, index, item, info, notePath, onedit, oncreate, onclose, onOpenNote }: {
    /** ficha dona da mochila */
    path: string;
    text: string;
    index: number;
    item: InventoryItem;
    info: ItemInfo;
    /** nota do item, se tem */
    notePath: string | null;
    onedit: () => void;
    oncreate: () => void;
    onclose: () => void;
    onOpenNote?: (p: string) => void;
  } = $props();

  const who = $derived(noteName(path));
  const card = $derived(info.card);
  const equipable = $derived(info.kind === 'arma' || info.kind === 'armadura' || info.kind === 'escudo' || info.kind === 'foco');
  const attuned = $derived(isAttuned(text, info.label));
  const mastery = $derived(card.properties.find((p) => /^maestria/i.test(p))?.replace(/^maestria:\s*/i, '') ?? '');
  const others = $derived((mesa.campaign?.sheets ?? []).filter((s) => s.path !== path));
  const atk = $derived.by(() => {
    if (info.kind !== 'arma' || !card.damage) return null;
    const s = readSheet(text);
    const mod = (k: string) => s.attrs.find((a) => a.key === k)?.mod ?? 0;
    return weaponAttack(info, { for: mod('for'), des: mod('des') });
  });

  const vars = $derived(sheetVars(readSheet(text)));
  /** "1d8+@for cortante" → "1d8+3 cortante" */
  const shown = (f: string) => f.replace(/@([\p{L}_]+)/gu, (m, n: string) => String(vars(n) ?? m)).replace(/\+-/g, '−').replace(/\+0(?!\d)/g, '');
  let msg = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;
  function flash(m: string) {
    msg = m;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (msg = ''), 3500);
  }
  function update(fn: (t: string) => string) {
    cadernos.update(path, fn);
  }

  function equip() {
    const on = !item.equipped;
    update((t) => equipItem(t, index, info, on));
    flash(on
      ? info.kind === 'arma' ? `${info.label} na mão: entrou nos ataques` : info.kind === 'armadura' ? `Vestiu ${info.label}: a CA foi recalculada` : info.kind === 'escudo' ? 'Escudo empunhado: +2 na CA' : `${info.label} em uso`
      : `${info.label} guardado`);
  }
  function attune() {
    let full = false;
    update((t) => { const r = attuneItem(t, info.label, !attuned); full = r.full; return r.text; });
    flash(full ? 'Já há 3 itens sintonizados: desfaça um antes' : attuned ? 'Sintonização desfeita' : 'Sintonizado (leva um descanso curto em jogo)');
  }
  function use() {
    let heal = 0;
    if (card.heal) {
      const r = mesa.roll(card.heal, { who, label: info.label, from: path });
      if (typeof r === 'string' || !r[0]) return;
      heal = r[0].total;
    }
    update((t) => consumeItem(t, index, heal));
    flash(heal ? `${info.label}: +${heal} PV` : `Usou ${info.label}`);
    if (item.qty <= 1) onclose();
  }
  function charge(delta: number) {
    if (!notePath || !card.charges) return;
    const left = card.charges.left + delta;
    cadernos.update(notePath, (t) => setCharges(t, left));
    if (delta < 0) flash(`${info.label}: ${Math.max(0, left)} carga${Math.max(0, left) === 1 ? '' : 's'}`);
  }
  function remove() {
    update((t) => {
      let out = item.equipped ? equipItem(t, index, info, false) : t;
      out = writeInventory(out, readInventory(out).filter((_, i) => i !== index));
      return out;
    });
    onclose();
  }
  function setNotes(v: string) {
    if (v.trim() === item.notes) return;
    update((t) => writeInventory(t, readInventory(t).map((x, i) => (i === index ? { ...x, notes: v.trim() } : x))));
  }
  let giveTo = $state('');
  let giveQty = $state(1);
  function give() {
    const to = others.find((s) => s.path === giveTo);
    if (!to) return;
    const r = transferItem(cadernos.read(path), cadernos.read(to.path), index, giveQty, info);
    cadernos.update(to.path, () => r.to);
    cadernos.update(path, () => r.from);
    flash(`${giveQty}× ${info.label} para ${to.name}`);
    giveTo = '';
    if (giveQty >= item.qty) onclose();
  }
  function photo() {
    if (!notePath) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const img = await files.attachFile(f);
      cadernos.update(notePath!, (t) => setProps(t, { imagem: `[[${img}]]` }));
    };
    input.click();
  }
  const roll = (f: string, label: string) => mesa.roll(f, { who, label, from: path });
</script>

<div class="detail">
  <div class="cardcol">
    <ItemCard name={info.label} card={card} qty={item.qty} badge={item.equipped ? 'Em uso' : attuned ? 'Sintonizado' : ''} />
  </div>
  <div class="acts">
    {#if msg}<p class="toast" role="status">{msg}</p>{/if}

    <div class="primary-row">
      {#if equipable}
        <button class={item.equipped ? 'ghost' : 'primary'} onclick={equip}>
          {item.equipped ? 'Guardar' : info.kind === 'armadura' ? 'Vestir' : info.kind === 'escudo' ? 'Empunhar' : 'Equipar'}
        </button>
      {/if}
      {#if card.attunement}
        <button class="ghost att" class:on={attuned} onclick={attune}>◈ {attuned ? 'Sintonizado' : 'Sintonizar'}</button>
      {/if}
      {#if info.kind === 'consumível' || card.heal}
        <button class="primary" onclick={use}>{card.heal ? `Beber (♥ ${card.heal})` : 'Usar um'}</button>
      {/if}
    </div>

    {#if atk}
      <div class="group">
        <span class="lbl">Ataque{item.equipped ? '' : ' (equipe para entrar na ficha)'}</span>
        <div class="row">
          <button class="roll-btn pill" onclick={() => roll(`1d20+${atk.hit}`, `${info.label}: acerto`)}>Acerto <code>{resolveBonus(atk.hit, vars)}</code></button>
          <button class="roll-btn pill" onclick={() => roll(atk.damage.split(' ')[0]!, `${info.label}: dano`)}>Dano <code>{shown(atk.damage)}</code></button>
        </div>
        {#if mastery && !card.description.includes(MASTERIES[mastery] ?? '§')}<p class="mast"><b>Maestria — {mastery}.</b> {MASTERIES[mastery] ?? ''}</p>{/if}
      </div>
    {/if}

    {#if card.charges && notePath}
      <div class="group">
        <span class="lbl">Cargas</span>
        <div class="row charges">
          <button class="icon" onclick={() => charge(-1)} disabled={card.charges.left <= 0} aria-label="Gastar uma carga">−</button>
          <span class="dias">
            {#each Array.from({ length: Math.min(card.charges.max ?? card.charges.left, 20) }, (_, i) => i + 1) as n (n)}
              <i class:on={n <= card.charges.left}></i>
            {/each}
          </span>
          <b class="mono">{card.charges.left}{#if card.charges.max !== null}/{card.charges.max}{/if}</b>
          <button class="icon" onclick={() => charge(1)} disabled={card.charges.max !== null && card.charges.left >= card.charges.max} aria-label="Recuperar uma carga">+</button>
        </div>
      </div>
    {/if}

    <div class="group">
      <span class="lbl">Quantidade e notas</span>
      <div class="row">
        <span class="qty">
          <button class="icon" onclick={() => update((t) => writeInventory(t, changeQty(readInventory(t), index, -1)))} aria-label="Um a menos">−</button>
          <b class="mono">{item.qty}</b>
          <button class="icon" onclick={() => update((t) => writeInventory(t, changeQty(readInventory(t), index, 1)))} aria-label="Um a mais">+</button>
        </span>
        <input class="field notes" value={item.notes} placeholder="Notas: gravura, de quem era, onde achou…" aria-label="Notas"
          onblur={(e) => setNotes((e.currentTarget as HTMLInputElement).value)} onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
      </div>
    </div>

    {#if others.length}
      <div class="group">
        <span class="lbl">Dar para</span>
        <div class="row">
          <select class="field" bind:value={giveTo} aria-label="Personagem">
            <option value="">Escolha alguém do grupo…</option>
            {#each others as o (o.path)}<option value={o.path}>{o.name}</option>{/each}
          </select>
          {#if item.qty > 1}<input class="field mono q" type="number" min="1" max={item.qty} bind:value={giveQty} aria-label="Quantas" />{/if}
          <button class="ghost sm" disabled={!giveTo} onclick={give}>Entregar</button>
        </div>
      </div>
    {/if}

    <div class="foot">
      {#if notePath}
        <button class="ghost sm" onclick={onedit}>✎ Editar</button>
        <button class="ghost sm" onclick={photo}>📷 {card.image ? 'Trocar foto' : 'Foto'}</button>
        {#if onOpenNote}<button class="ghost sm" onclick={() => onOpenNote?.(notePath!)}>Abrir nota</button>{/if}
      {:else}
        <button class="ghost sm" onclick={oncreate} title="Vira uma nota de item, com foto, raridade e descrição">✦ Personalizar (criar carta)</button>
      {/if}
      <button class="ghost sm danger" onclick={remove}>Jogar fora</button>
      <button class="icon close" onclick={onclose} aria-label="Fechar">✕</button>
    </div>
  </div>
</div>

<style>
  .detail { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; padding: 12px; border: 1px solid var(--line); border-radius: 16px;
    background: linear-gradient(160deg, color-mix(in srgb, var(--ember) 5%, var(--surface)), var(--surface) 50%); animation: in var(--dur-slow) var(--ease); }
  @keyframes in { from { opacity: 0; transform: translateY(-4px); } }
  .acts { display: grid; gap: 12px; align-content: start; min-width: 0; }
  .toast { margin: 0; padding: 6px 10px; border-radius: 9px; font-size: 12.5px; background: color-mix(in srgb, var(--ember) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--ember) 35%, transparent); }
  .primary-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .primary-row:empty { display: none; }
  .att.on { border-color: #b07cff; color: #cfb3ff; background: color-mix(in srgb, #b07cff 14%, var(--surface-2)); }
  .group { display: grid; gap: 6px; }
  .lbl { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .pill { padding: 5px 10px !important; font-size: 12.5px; display: inline-flex; gap: 6px; align-items: baseline; }
  .pill code { font-size: 11.5px; }
  .mast { margin: 0; font-size: 12px; color: var(--silver); line-height: 1.45; }
  .mast b { color: var(--ember-soft); }
  .charges .dias { display: flex; gap: 4px; flex-wrap: wrap; }
  .charges i { width: 10px; height: 10px; transform: rotate(45deg); border: 1.5px solid #4f9cff; border-radius: 2px; }
  .charges i.on { background: #4f9cff; box-shadow: 0 0 6px #4f9cff; }
  .qty { display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--line); border-radius: 9px; padding: 1px; }
  .qty b { min-width: 24px; text-align: center; }
  .notes { flex: 1 1 180px; padding: 5px 9px !important; font-size: 13px !important; }
  .q { width: 64px; }
  .row select { flex: 1 1 160px; padding: 5px 9px; font-size: 13px; }
  .foot { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding-top: 10px; border-top: 1px dashed var(--line); }
  .danger:hover { border-color: var(--crit) !important; color: var(--crit); }
  .close { margin-left: auto; }
  @container (max-width: 560px) {
    .detail { grid-template-columns: minmax(0, 1fr); }
    .cardcol { justify-self: center; }
  }
</style>
