<script lang="ts">
  import { setSheetText, toggleInList } from '@tanden/core';
  import EditField from './EditField.svelte';
  import TextBlock from './TextBlock.svelte';
  import type { FichaCtx } from './ctx';

  // Aparência, história e personalidade, alinhamento e idiomas.
  let { x }: { x: FichaCtx } = $props();
  const c = $derived(x.c);

  const ALIGNMENTS = ['Leal e Bom', 'Neutro e Bom', 'Caótico e Bom', 'Leal e Neutro', 'Neutro', 'Caótico e Neutro', 'Leal e Mau', 'Neutro e Mau', 'Caótico e Mau'];
  const LANGUAGES = ['Comum', 'Língua de Sinais Comum', 'Dracônico', 'Anão', 'Élfico', 'Gigante', 'Gnômico', 'Goblin', 'Halfling', 'Orc',
    'Abissal', 'Celestial', 'Dialeto Subterrâneo', 'Druídico', 'Gíria de Ladrão', 'Infernal', 'Primordial', 'Silvestre', 'Subcomum'];
  let lang = $state('');

  function addLang() {
    const l = lang.trim();
    if (!l) return;
    if (!c.languages.some((v) => v.toLowerCase() === l.toLowerCase())) x.update((t) => toggleInList(t, 'languages', l));
    lang = '';
  }
</script>

<div class="story">
  <div class="col">
    <TextBlock title="Aparência" value={c.texts.appearance} rows={5} placeholder="Altura, olhos, cabelo, marcas, como se veste…" onsave={(v) => x.update((t) => setSheetText(t, 'appearance', v))} />
    <section class="card">
      <h4>Idiomas</h4>
      <div class="langs">
        {#each c.languages as l (l)}
          <span class="tag">{l}<button onclick={() => x.update((t) => toggleInList(t, 'languages', l))} aria-label={`Tirar ${l}`}>×</button></span>
        {/each}
        {#if !c.languages.length}<span class="dim small">Nenhum ainda.</span>{/if}
      </div>
      <form class="addl" onsubmit={(e) => { e.preventDefault(); addLang(); }}>
        <input class="field" bind:value={lang} list="ficha-idiomas" placeholder="Adicionar idioma" aria-label="Idioma" />
        <datalist id="ficha-idiomas">{#each LANGUAGES.filter((l) => !c.languages.includes(l)) as l (l)}<option value={l}></option>{/each}</datalist>
        <button class="ghost sm" disabled={!lang.trim()}>Adicionar</button>
      </form>
    </section>
  </div>
  <div class="col">
    <TextBlock title="História e personalidade" value={c.texts.story} rows={12}
      placeholder={'De onde veio, o que quer, de que tem medo…\n\nTraços de personalidade, ideais, vínculos e defeitos.'}
      onsave={(v) => x.update((t) => setSheetText(t, 'story', v))} />
    <EditField label="Alinhamento" value={c.alignment} placeholder="Ex.: Caótico e Bom" options={ALIGNMENTS} onsave={(v) => x.write({ [c.keys.alignment]: v || null })} />
  </div>
</div>

<style>
  .story { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 14px; align-items: start; }
  .col { display: grid; gap: 14px; min-width: 0; }
  .card { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 10px 12px 12px; display: grid; gap: 8px; }
  h4 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); text-align: center; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  .langs { display: flex; flex-wrap: wrap; gap: 6px; }
  .addl { display: flex; gap: 6px; }
  .addl input { flex: 1; padding: 5px 9px; font-size: 13px; }
</style>
