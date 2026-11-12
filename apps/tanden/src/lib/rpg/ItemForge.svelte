<script lang="ts">
  import { RARITIES, itemNote, readItemCard, type NewItem } from '@tanden/core';
  import { untrack } from 'svelte';
  import { files } from '../files/files.svelte';
  import ItemCard from './ItemCard.svelte';

  // Forja: cria um item especial (nota com foto, raridade, cargas...) com a carta ao vivo do lado.
  let { world, oncreate, onclose }: {
    world?: string;
    oncreate: (it: NewItem, qty: number) => void;
    onclose: () => void;
  } = $props();

  const CATEGORIES = ['Arma', 'Armadura', 'Escudo', 'Poção', 'Pergaminho', 'Anel', 'Amuleto', 'Varinha', 'Cajado', 'Bastão', 'Maravilhoso', 'Ferramenta', 'Equipamento', 'Tesouro'];
  let it = $state<NewItem>({ name: '', rarity: 'incomum', category: 'Maravilhoso', value: '', weight: '', damage: '', ac: '', attunement: false,
    properties: '', charges: '', image: '', description: '', world: untrack(() => world) });
  let qty = $state(1);
  let busy = $state(false);

  const preview = $derived(readItemCard(it.name || 'Item sem nome', itemNote(it)));

  function pickPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      busy = true;
      try { it.image = await files.attachFile(f); } finally { busy = false; }
    };
    input.click();
  }
  /** colar uma imagem (Ctrl+V) também vira a foto */
  async function onpaste(e: ClipboardEvent) {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
    if (!f) return;
    e.preventDefault();
    busy = true;
    try { it.image = await files.attachFile(f); } finally { busy = false; }
  }
</script>

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog forge" role="dialog" aria-modal="true" aria-label="Novo item" tabindex="-1" {onpaste}>
    <h2>Forjar item</h2>
    <div class="cols">
      <form onsubmit={(e) => { e.preventDefault(); if (it.name.trim()) oncreate({ ...it, name: it.name.trim() }, Math.max(1, qty)); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <label class="w2">Nome<input class="field" bind:value={it.name} placeholder="Cajado do Inverno" autofocus /></label>
        <label>Categoria
          <input class="field" bind:value={it.category} list="forge-cat" />
          <datalist id="forge-cat">{#each CATEGORIES as c (c)}<option value={c}></option>{/each}</datalist>
        </label>
        <label>Raridade
          <select class="field" bind:value={it.rarity}>{#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}</select>
        </label>
        <label>Dano<input class="field mono" bind:value={it.damage} placeholder="1d8 cortante" /></label>
        <label>CA / bônus<input class="field mono" bind:value={it.ac} placeholder="+1" /></label>
        <label>Valor<input class="field mono" bind:value={it.value} placeholder="500 po" /></label>
        <label>Peso (kg)<input class="field mono" bind:value={it.weight} inputmode="decimal" placeholder="1,5" /></label>
        <label>Cargas<input class="field mono" bind:value={it.charges} placeholder="7/7" /></label>
        <label>Quantidade<input class="field mono" type="number" min="1" bind:value={qty} /></label>
        <label class="w2">Propriedades<input class="field" bind:value={it.properties} placeholder="Versátil, Acuidade, Arremesso" /></label>
        <label class="w2">Descrição<textarea class="field" rows="3" bind:value={it.description} placeholder="O que faz, de onde veio, a frase gravada no cabo…"></textarea></label>
        <div class="w2 row">
          <button type="button" class="chip" class:on={it.attunement} onclick={() => (it.attunement = !it.attunement)}>Exige sintonização</button>
          <button type="button" class="ghost sm" onclick={pickPhoto} disabled={busy}>{busy ? 'Enviando…' : it.image ? 'Trocar foto' : '📷 Foto'}</button>
          {#if it.image}<button type="button" class="ghost sm" onclick={() => (it.image = '')}>Tirar foto</button>{/if}
        </div>
        <p class="w2 dim small hint">Dica: cole uma imagem (Ctrl+V) aqui para usar como foto. O item vira uma nota em <code>Itens/</code> e pode ser reaproveitado por outras fichas.</p>
        <div class="w2 formacts">
          <button type="button" class="ghost" onclick={onclose}>Cancelar</button>
          <button class="primary" disabled={!it.name.trim() || busy}>Criar e guardar</button>
        </div>
      </form>
      <div class="prev"><ItemCard name={it.name || 'Item sem nome'} card={preview} {qty} /></div>
    </div>
  </div>
</div>

<style>
  .forge { width: min(760px, 100%) !important; }
  .cols { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px; align-items: start; }
  form { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px !important; }
  .w2 { grid-column: 1 / -1; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .hint { margin: 0; }
  textarea { resize: vertical; }
  .prev { position: sticky; top: 0; padding-top: 4px; }
  @media (max-width: 640px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
    .prev { order: -1; justify-self: center; position: static; }
  }
</style>
