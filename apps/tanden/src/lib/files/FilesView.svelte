<script lang="ts">
  import { fileKind, type FileKind } from '@tanden/core';
  import { invoke } from '@tauri-apps/api/core';
  import { engine } from '../engine.svelte';
  import { isTauri } from '../storage-tauri';
  import { updater } from '../updater.svelte';
  import PdfView from '../pdf/PdfView.svelte';
  import { files } from './files.svelte';
  import WebClipDialog from './WebClipDialog.svelte';

  let input = $state<HTMLInputElement>();
  let filter = $state('');
  let dragging = $state(0);
  let clip = $state(false);
  let imageUrl = $state<string | null>(null);
  let info = $state<{ size: number } | null>(null);

  const GROUPS: Array<{ kind: FileKind; label: string }> = [
    { kind: 'pdf', label: 'PDFs' },
    { kind: 'image', label: 'Imagens' },
    { kind: 'document', label: 'Documentos' },
    { kind: 'slides', label: 'Apresentações' },
    { kind: 'book', label: 'Livros' },
    { kind: 'web', label: 'Páginas' },
    { kind: 'sheet', label: 'Planilhas' },
    { kind: 'board', label: 'Quadros' },
    { kind: 'audio', label: 'Áudio' },
    { kind: 'video', label: 'Vídeo' },
    { kind: 'text', label: 'Texto e código' },
    { kind: 'other', label: 'Outros' },
  ];
  const ICON: Partial<Record<FileKind, string>> = {
    pdf: 'PDF', image: 'IMG', document: 'DOC', slides: 'PPT', book: 'EPUB', web: 'HTML', sheet: 'XLS', board: 'MAPA', audio: 'SOM', video: 'VID', text: 'TXT',
  };

  const groups = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const list = files.list.filter((p) => !q || p.toLowerCase().includes(q));
    return GROUPS.map((g) => ({ ...g, items: list.filter((p) => fileKind(p) === g.kind) })).filter((g) => g.items.length);
  });
  const total = $derived(groups.reduce((n, g) => n + g.items.length, 0));
  const openKind = $derived(files.open ? fileKind(files.open) : null);
  const base = (p: string) => p.split('/').pop()!;
  const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const desktop = $derived(isTauri() && !updater.android);

  $effect(() => {
    const p = files.open;
    imageUrl = null;
    info = null;
    if (!p) return;
    if (fileKind(p) === 'image') void files.url(p).then((u) => { if (files.open === p) imageUrl = u; });
    if (fileKind(p) !== 'pdf') void files.read(p).then((b) => { if (files.open === p && b) info = { size: b.length }; });
  });

  async function onPick(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    if (el.files?.length) await files.importFiles(el.files);
    el.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = 0;
    const list = e.dataTransfer?.files;
    if (list?.length) void files.importFiles(list);
    else {
      // link arrastado do navegador
      const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain');
      if (url && /^https?:\/\//.test(url.trim())) void files.clip(url.trim(), 'note', null);
    }
  }

  async function convertOpen() {
    const p = files.open;
    if (!p) return;
    const data = await files.read(p);
    if (!data) return;
    const f = new File([data as BlobPart], base(p));
    await files.importFiles([f], { convert: true });
  }

  const size = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
  const convertible = (p: string) => /\.(docx|pptx|odt|odp|epub|html?|xhtml|txt)$/i.test(p);
  const spreadsheet = (p: string) => /\.(xlsx|xlsm|ods|csv|tsv)$/i.test(p);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="files" class:drag={dragging > 0} class:viewing={!!files.open}
  ondragenter={(e) => { if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('text/uri-list')) { e.preventDefault(); dragging++; } }}
  ondragover={(e) => { if (dragging) e.preventDefault(); }}
  ondragleave={() => (dragging = Math.max(0, dragging - 1))}
  ondrop={onDrop}>

  <aside class="list">
    <header>
      <h2>Arquivos <span>{files.list.length}</span></h2>
      <div class="acts">
        <button class="pri" onclick={() => input?.click()} title="Importar PDFs, documentos, apresentações, imagens…">Importar</button>
        <button onclick={() => (clip = true)} title="Salvar uma página da web">Página web</button>
      </div>
      <input class="filter" bind:value={filter} placeholder="Filtrar" aria-label="Filtrar arquivos" />
    </header>
    <div class="scroll">
      {#each groups as g (g.kind)}
        <section>
          <h3>{g.label} <span>{g.items.length}</span></h3>
          <ul>
            {#each g.items as p (p)}
              <li>
                <button class:on={p === files.open} onclick={() => files.openPath(p)} title={p}>
                  <i class="tag {g.kind}">{ICON[g.kind] ?? 'ARQ'}</i>
                  <span class="nm"><b>{base(p)}</b>{#if dir(p)}<small>{dir(p)}</small>{/if}</span>
                  {#if g.kind === 'pdf' && engine.annots.list(p).length}<em title="anotações">{engine.annots.list(p).length}</em>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {:else}
        <p class="none">{filter ? 'Nada com esse nome.' : 'Nenhum arquivo ainda.'}</p>
      {/each}
    </div>
  </aside>

  <section class="view">
    {#if files.open && openKind === 'pdf'}
      <button class="back" onclick={() => (files.open = null)}>‹ Arquivos</button>
      {#key files.open}<PdfView path={files.open} />{/key}
    {:else if files.open}
      <button class="back" onclick={() => (files.open = null)}>‹ Arquivos</button>
      <div class="preview">
        {#if openKind === 'image'}
          {#if imageUrl}<img src={imageUrl} alt={base(files.open)} />{/if}
        {:else if openKind === 'audio' && imageUrl === null}
          {#await files.url(files.open) then u}{#if u}<audio controls src={u}></audio>{/if}{/await}
        {:else if openKind === 'video'}
          {#await files.url(files.open) then u}{#if u}<!-- svelte-ignore a11y_media_has_caption --><video controls src={u}></video>{/if}{/await}
        {:else}
          <div class="card">
            <i class="tag big {openKind}">{ICON[openKind ?? 'other'] ?? 'ARQ'}</i>
            <h2>{base(files.open)}</h2>
            <p class="muted">{dir(files.open) || 'pasta principal'}{#if info} · {size(info.size)}{/if}</p>
            {#if /\.(pptx|odp)$/i.test(files.open)}
              <p>Vire esta apresentação slides do Tanden para editar, apresentar e exportar de novo. O original continua aqui.</p>
            {:else if convertible(files.open)}
              <p>Vire este arquivo uma nota para ler, buscar, anotar e mandar para a IA. O original continua aqui.</p>
            {:else if spreadsheet(files.open)}
              <p>Abra esta planilha nas Planilhas para editar, com fórmulas e gráficos. O original continua aqui.</p>
            {:else if /\.(doc|ppt|xls|rtf)$/i.test(files.open)}
              <p>Este é um formato antigo. Abra no programa do sistema (Office ou LibreOffice) e salve como .docx, .xlsx e .pptx ou .odt, .ods e .odp para converter.</p>
            {/if}
          </div>
        {/if}
        <footer>
          {#if /\.(pptx|odp)$/i.test(files.open)}<button class="pri" onclick={() => void convertOpen()}>Abrir nos Slides</button>
          {:else if convertible(files.open)}<button class="pri" onclick={() => void convertOpen()}>Converter em nota</button>
          {:else if spreadsheet(files.open)}<button class="pri" onclick={() => void convertOpen()}>Abrir nas Planilhas</button>{/if}
          {#if desktop}<button onclick={() => void invoke('vault_open_external', { path: files.open }).catch((e) => files.say(String(e), { error: true }))}>Abrir no programa padrão</button>{/if}
          <button onclick={() => void navigator.clipboard.writeText(`![[${files.open}]]`).then(() => files.say('Link copiado: cole numa nota.'))}>Copiar link para nota</button>
        </footer>
      </div>
    {:else}
      <div class="empty">
        <svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><path d="M14 8h24l12 12v36H14z" /><path d="M38 8v12h12M22 34h20M22 42h20M22 26h8" /></svg>
        <h2>Arquivos</h2>
        <p>Solte aqui PDFs, documentos do Word e do LibreOffice, apresentações, planilhas, livros, páginas e imagens. PDFs abrem com anotações que sincronizam; documentos viram notas que o Obsidian também lê.</p>
        <div class="row">
          <button class="pri" onclick={() => input?.click()}>Importar arquivos</button>
          <button onclick={() => (clip = true)}>Salvar página web</button>
        </div>
        <p class="formats">PDF · DOCX · ODT · EPUB · HTML · TXT · imagens · PPTX/ODP vão para Slides · XLSX/ODS/CSV vão para Planilhas</p>
      </div>
    {/if}
  </section>

  {#if dragging}
    <div class="drop" aria-hidden="true"><div><b>Solte para importar</b><span>PDFs abrem aqui; documentos viram notas</span></div></div>
  {/if}
  <input bind:this={input} type="file" multiple hidden onchange={onPick} />
</div>

{#if clip}<WebClipDialog onclose={() => (clip = false)} />{/if}

<style>
  .files { flex: 1; min-height: 0; display: flex; position: relative; }
  .list { width: 300px; flex: none; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); background: var(--surface); }
  .list header { padding: 14px 12px 8px; display: grid; gap: 10px; }
  h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  h2 span, h3 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; margin-left: 6px; }
  .acts { display: flex; gap: 6px; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 6px 11px; font-size: 12.5px; color: var(--ink); }
  button:hover { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .pri { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }
  .pri:hover { box-shadow: 0 0 18px -6px var(--ember); }
  .filter { border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 8px; padding: 6px 10px; font: inherit; }
  .filter:focus { outline: none; border-color: var(--ember); }
  .scroll { overflow-y: auto; padding: 0 8px 16px; }
  h3 { margin: 12px 6px 4px; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  li button { width: 100%; display: flex; align-items: center; gap: 9px; text-align: left; border: 0; border-left: 2px solid transparent; border-radius: 8px;
    background: none; padding: 6px 8px; }
  li button:hover { background: var(--surface-2); }
  li button.on { background: var(--surface-2); border-left-color: var(--ember); }
  .nm { display: grid; min-width: 0; flex: 1; }
  .nm b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm small { color: var(--muted); font: 10.5px var(--f-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li em { font: normal 10.5px var(--f-mono); color: var(--ember); border: 1px solid color-mix(in srgb, var(--ember) 40%, transparent); border-radius: 6px; padding: 0 5px; }
  .tag { flex: none; width: 34px; text-align: center; font: 600 8.5px/18px var(--f-mono); font-style: normal; letter-spacing: .04em; border-radius: 5px;
    color: var(--silver); background: var(--surface-2); border: 1px solid var(--line); }
  .tag.pdf { color: var(--on-ember); background: var(--ember); border-color: var(--ember); }
  .tag.image { color: var(--ok); }
  .tag.document, .tag.book { color: #8ab4ff; }
  .tag.slides { color: #ffb37a; }
  .tag.big { width: 64px; font-size: 13px; line-height: 34px; border-radius: 9px; }
  .none { color: var(--muted); padding: 10px; font-size: 12.5px; }

  .view { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
  .back { display: none; }
  .preview { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; overflow: auto; }
  .preview img, .preview video { max-width: 100%; max-height: calc(100% - 60px); border-radius: 12px; box-shadow: 0 24px 50px -24px #000; border: 1px solid var(--line); }
  .card { display: grid; justify-items: center; gap: 8px; text-align: center; max-width: 440px; }
  .card h2 { font: 600 17px var(--f-display); letter-spacing: .02em; text-transform: none; color: var(--ink); word-break: break-word; }
  .card p { margin: 0; color: var(--silver); }
  .muted { color: var(--muted) !important; font: 12px var(--f-mono); }
  .preview footer { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

  .empty { margin: auto; max-width: 480px; text-align: center; display: grid; justify-items: center; gap: 12px; padding: 24px; }
  .empty svg { fill: none; stroke: var(--ember); stroke-width: 1.6; stroke-linejoin: round; filter: drop-shadow(0 0 10px var(--ember-glow)); }
  .empty h2 { font-size: 18px; color: var(--ink); }
  .empty p { margin: 0; color: var(--muted); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .formats { font: 11px var(--f-mono); }

  .drop { position: absolute; inset: 10px; z-index: 50; display: grid; place-items: center; pointer-events: none; border-radius: 18px;
    border: 2px dashed var(--ember); background: color-mix(in srgb, var(--void) 78%, transparent); backdrop-filter: blur(2px); animation: fade .12s; }
  .drop div { display: grid; gap: 4px; text-align: center; }
  .drop b { font: 600 16px var(--f-display); letter-spacing: .06em; color: var(--ember-soft); }
  .drop span { color: var(--muted); font-size: 12.5px; }
  @keyframes fade { from { opacity: 0; } }

  @media (max-width: 720px) {
    .list { width: 100%; border-right: 0; }
    .view { display: none; }
    .viewing .list { display: none; }
    .viewing .view { display: flex; }
    .back { display: block; align-self: flex-start; margin: 6px 8px; border: 0; background: none; color: var(--ember-soft); padding: 4px 6px; }
  }
</style>
