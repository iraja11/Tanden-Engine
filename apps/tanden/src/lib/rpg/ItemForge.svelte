<script lang="ts">
  import { RARITIES, itemNote, readItemCard, type NewItem } from '@tanden/core';
  import { untrack } from 'svelte';
  import { files } from '../files/files.svelte';
  import ItemCard from './ItemCard.svelte';

  // Forja: cria (ou edita) um item especial, com foto, raridade, cargas e a carta montando ao vivo do lado.
  let { world, initial, oncreate, onclose }: {
    world?: string;
    /** com isto, edita um item que já existe (o nome fica fixo: é o nome da nota) */
    initial?: NewItem;
    oncreate: (it: NewItem, qty: number) => void;
    onclose: () => void;
  } = $props();

  const editing = untrack(() => !!initial);
  const CATEGORIES = ['Arma', 'Armadura', 'Escudo', 'Poção', 'Pergaminho', 'Anel', 'Amuleto', 'Varinha', 'Cajado', 'Bastão', 'Maravilhoso', 'Ferramenta', 'Equipamento', 'Tesouro'];
  let it = $state<NewItem>(untrack(() => initial ? { ...initial, heal: initial.heal ?? '' } : {
    name: '', rarity: 'incomum', category: 'Maravilhoso', value: '', weight: '', damage: '', ac: '', attunement: false,
    properties: '', charges: '', heal: '', image: '', description: '', world,
  }));
  let qty = $state(1);
  let busy = $state(false);

  const preview = $derived(readItemCard(it.name || 'Item sem nome', itemNote(it)));
  const isPotion = $derived(/po[cç][aã]o|potion|elixir/i.test(it.category));

  async function useFile(f: File) {
    busy = true;
    try { it.image = await files.attachFile(f); } finally { busy = false; }
  }
  function pickPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => { const f = input.files?.[0]; if (f) void useFile(f); };
    input.click();
  }
  /** colar (Ctrl+V) ou arrastar uma imagem também vira a foto */
  function onpaste(e: ClipboardEvent) {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (!f) return;
    e.preventDefault();
    void useFile(f);
  }
  let over = $state(false);
  function ondrop(e: DragEvent) {
    e.preventDefault();
    over = false;
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (f) void useFile(f);
  }
  function submit() {
    if (!it.name.trim() || busy) return;
    oncreate({ ...it, name: it.name.trim() }, Math.max(1, qty));
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog forge" role="dialog" aria-modal="true" aria-label={editing ? 'Editar item' : 'Novo item'} tabindex="-1" {onpaste}>
    <h2>{editing ? `Editar ${it.name}` : 'Forjar item'}</h2>
    <div class="cols">
      <form onsubmit={(e) => { e.preventDefault(); submit(); }}>
        {#if !editing}
          <!-- svelte-ignore a11y_autofocus -->
          <label class="w2">Nome<input class="field" bind:value={it.name} placeholder="Cajado do Inverno" autofocus /></label>
        {/if}
        <label>Categoria
          <input class="field" bind:value={it.category} list="forge-cat" />
          <datalist id="forge-cat">{#each CATEGORIES as c (c)}<option value={c}></option>{/each}</datalist>
        </label>
        <label>Raridade
          <select class="field" bind:value={it.rarity}>{#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}</select>
        </label>
        <label>Dano<input class="field mono" bind:value={it.damage} placeholder="1d8+1 cortante" /></label>
        <label>CA / bônus<input class="field mono" bind:value={it.ac} placeholder="+1" /></label>
        <label>Valor<input class="field mono" bind:value={it.value} placeholder="500 po" /></label>
        <label>Peso (kg)<input class="field mono" bind:value={it.weight} inputmode="decimal" placeholder="1,5" /></label>
        <label>Cargas<input class="field mono" bind:value={it.charges} placeholder="7/7" /></label>
        {#if isPotion || it.heal}
          <label>Cura ao usar<input class="field mono" bind:value={it.heal} placeholder="2d4+2" /></label>
        {/if}
        {#if !editing}<label>Quantidade<input class="field mono" type="number" min="1" bind:value={qty} /></label>{/if}
        <label class="w2">Propriedades<input class="field" bind:value={it.properties} placeholder="Versátil, Acuidade, Arremesso" /></label>
        <label class="w2">Descrição<textarea class="field" rows="3" bind:value={it.description} placeholder="O que faz, de onde veio, a frase gravada no cabo…"></textarea></label>
        <div class="w2 row">
          <button type="button" class="chip" class:on={it.attunement} onclick={() => (it.attunement = !it.attunement)}>◈ Exige sintonização</button>
        </div>
        <div class="w2 formacts">
          <button type="button" class="ghost" onclick={onclose}>Cancelar</button>
          <button class="primary" disabled={!it.name.trim() || busy}>{editing ? 'Salvar' : 'Criar e guardar'}</button>
        </div>
      </form>
      <div class="side">
        <ItemCard name={it.name || 'Item sem nome'} card={preview} {qty} />
        <button type="button" class="drop" class:over class:has={!!it.image} onclick={pickPhoto} disabled={busy}
          ondragover={(e) => { e.preventDefault(); over = true; }} ondragleave={() => (over = false)} {ondrop}>
          {#if busy}Enviando…{:else if it.image}<b>Trocar foto</b><small>clique, arraste ou cole</small>{:else}<b>📷 Pôr uma foto</b><small>clique, arraste ou cole (Ctrl+V)</small>{/if}
        </button>
        {#if it.image}<button type="button" class="lnk" onclick={() => (it.image = '')}>Tirar a foto</button>{/if}
      </div>
    </div>
  </div>
</div>

<style>
  .forge { width: min(780px, 100%) !important; }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; }
  form { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px !important; }
  .w2 { grid-column: 1 / -1; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  textarea { resize: vertical; }
  .side { position: sticky; top: 0; display: grid; gap: 8px; justify-items: center; width: 216px; }
  .drop { width: 100%; display: grid; gap: 2px; justify-items: center; padding: 12px 8px; border: 1.5px dashed var(--line); border-radius: 12px;
    background: var(--void); color: var(--ink); transition: border-color var(--dur), background var(--dur); }
  .drop b { font-size: 13px; }
  .drop small { font-size: 11px; color: var(--muted); }
  .drop:hover, .drop.over { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 8%, var(--void)); }
  .lnk { border: 0; background: none; padding: 0; color: var(--muted); font-size: 12px; text-decoration: underline dotted; }
  @media (max-width: 640px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
    .side { order: -1; position: static; justify-self: center; }
  }
</style>
