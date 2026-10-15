<script lang="ts">
  import { untrack } from 'svelte';
  import Editor from '../Editor.svelte';
  import NoteTools from '../files/NoteTools.svelte';
  import WebClipDialog from '../files/WebClipDialog.svelte';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { sound } from '../sound.svelte';
  import { notes } from './notes.svelte';
  import { versions } from './versions.svelte';
  import { noteName } from './host';
  import { showMenu } from './menu';
  import NoteAside from './NoteAside.svelte';
  import History from './History.svelte';
  import PropertiesPanel from '../bases/PropertiesPanel.svelte';
  import { bases } from '../bases/bases.svelte';

  // A nota aberta: título editável (é o nome do arquivo), ferramentas, editor e painel lateral.
  let { path }: { path: string } = $props();

  const dir = $derived(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  let title = $state(untrack(() => noteName(path)));
  let titleEl = $state<HTMLTextAreaElement>();
  let line = $state(0);

  $effect(() => {
    title = noteName(path);
  });

  // nota recém-criada: o cursor vai para o título
  $effect(() => {
    if (engine.titleFocus !== path) return;
    engine.titleFocus = null;
    setTimeout(() => {
      titleEl?.focus();
      titleEl?.select();
    }, 30);
  });

  $effect(() => {
    const p = path;
    untrack(() => {
      notes.visited(p);
      void versions.snapshot(p, engine.content, true);
    });
  });

  let renaming = false;
  async function commitTitle() {
    // Enter renomeia e o blur que vem logo depois não pode renomear de novo
    if (renaming || !engine.vault.has(path)) return;
    const clean = title.replace(/[\n\r]+/g, ' ').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) {
      title = noteName(path);
      return;
    }
    if (clean === noteName(path)) {
      title = clean;
      return;
    }
    renaming = true;
    const next = await notes.rename(path, `${dir ? `${dir}/` : ''}${clean}.md`).finally(() => (renaming = false));
    if (!next) title = noteName(path);
  }

  function titleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && !e.shiftKey)) {
      e.preventDefault();
      void commitTitle().then(() => editorBridge.focus());
    } else if (e.key === 'Escape') {
      title = noteName(path);
      titleEl?.blur();
    }
  }

  function grow(el: HTMLTextAreaElement) {
    const fit = () => {
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    el.addEventListener('input', fit);
    return { destroy: () => ro.disconnect() };
  }

  function moreMenu(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fav = notes.favorites.includes(path);
    showMenu({ x: r.right - 250, y: r.bottom + 6 }, [
      { label: fav ? 'Tirar das favoritas' : 'Favoritar', icon: fav ? '★' : '☆', run: () => notes.toggleFavorite(path) },
      { label: 'Renomear', icon: '✎', hint: 'clique no título', run: () => { titleEl?.focus(); titleEl?.select(); } },
      { label: 'Mover para pasta…', icon: '↦', run: () => movePrompt() },
      { label: 'Duplicar', icon: '⧉', run: () => notes.duplicate(path) },
      { label: 'Copiar link [[ ]]', icon: '🔗', run: () => void navigator.clipboard?.writeText(`[[${noteName(path)}]]`) },
      null,
      { label: 'Sumário', icon: '≡', on: notes.aside === 'sumario', run: () => notes.setAside(notes.aside === 'sumario' ? null : 'sumario') },
      { label: 'Conexões e backlinks', icon: '⇆', on: notes.aside === 'conexoes', run: () => notes.setAside(notes.aside === 'conexoes' ? null : 'conexoes') },
      { label: 'Histórico de versões', icon: '⟲', run: () => (notes.history = path) },
      { label: notes.preview ? 'Ver Markdown (código-fonte)' : 'Voltar à prévia ao vivo', icon: notes.preview ? 'MD' : '👁', hint: 'Ctrl+Shift+E', run: () => notes.setPreview(!notes.preview) },
      null,
      { label: 'Apagar nota', icon: '🗑', danger: true, run: () => void confirmDelete() },
    ]);
  }

  function movePrompt() {
    const to = prompt('Mover para qual pasta? (vazio = raiz do cofre)', dir);
    if (to === null) return;
    const clean = to.trim().replace(/^\/+|\/+$/g, '');
    void notes.rename(path, `${clean ? `${clean}/` : ''}${noteName(path)}.md`);
  }

  async function confirmDelete() {
    const back = notes.backlinks(path).length;
    const msg = back ? `Apagar "${noteName(path)}"? ${back} ${back === 1 ? 'nota tem link' : 'notas têm links'} para ela. Uma cópia fica na lixeira (.trash).` : `Apagar "${noteName(path)}"? Uma cópia fica na lixeira (.trash).`;
    if (!confirm(msg)) return;
    sound.play('close');
    await notes.remove(path);
  }

  const words = $derived.by(() => {
    const body = engine.content.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/```[\s\S]*?```/g, ' ');
    return (body.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  });
</script>

<div class="page">
  <header class="head">
    <div class="crumbs">
      {#if dir}
        {#each dir.split('/') as part, i (i)}
          <span class="dir">{part}</span><span class="sep">/</span>
        {/each}
      {/if}
      <span class="words" title="Palavras · leitura">{words} {words === 1 ? 'palavra' : 'palavras'} · {Math.max(1, Math.round(words / 220))} min</span>
    </div>
    <div class="actions">
      <NoteTools {path} />
      <button class="icon" class:on={notes.favorites.includes(path)} title="Favoritar" onclick={() => notes.toggleFavorite(path)}>{notes.favorites.includes(path) ? '★' : '☆'}</button>
      <button class="icon" class:on={!!notes.aside} title="Sumário e conexões" onclick={() => notes.setAside(notes.aside ? null : 'sumario')}>
        <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2" /><path d="M10 3v10" /></svg>
      </button>
      <button class="icon" title="Mais" onclick={moreMenu}>⋯</button>
    </div>
  </header>
  <div class="body">
    <div class="col">
      <textarea class="title" rows="1" bind:this={titleEl} bind:value={title} use:grow placeholder="Sem título" spellcheck="true"
        onkeydown={titleKey} onblur={() => void commitTitle()} aria-label="Título da nota"></textarea>
      <div class="props"><PropertiesPanel {path} onopen={(p) => (bases.peek = p)} /></div>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="ed" onclick={(e) => { if (e.target === e.currentTarget) editorBridge.focus(true); }}>
        <Editor value={engine.content} docKey={path} onchange={(v) => engine.edit(v)} rich livePreview={notes.preview}
          host={notes.host} oncursor={(l) => (line = l)} onfiles={(f) => void files.importFiles(f, { attach: true })} />
      </div>
    </div>
    {#if notes.aside}
      <NoteAside {path} {line} />
    {/if}
  </div>
</div>

{#if notes.clip}<WebClipDialog attachTo={path} onclose={() => (notes.clip = false)} />{/if}
{#if notes.history === path}<History {path} onclose={() => (notes.history = null)} />{/if}

<style>
  .page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 18px 0 24px; min-height: 40px; }
  .crumbs { display: flex; align-items: center; gap: 4px; min-width: 0; font: 11.5px var(--f-mono); color: var(--muted); overflow: hidden; white-space: nowrap; }
  .dir { overflow: hidden; text-overflow: ellipsis; }
  .sep { opacity: .5; }
  .words { margin-left: 8px; opacity: .7; }
  .crumbs .dir + .sep + .words { margin-left: 10px; }
  .actions { display: flex; align-items: center; gap: 2px; flex: none; }
  .icon { width: 30px; height: 28px; display: grid; place-items: center; border: 0; background: none; border-radius: 8px; color: var(--muted); font-size: 16px; }
  .icon:hover { background: var(--surface); color: var(--ink); }
  .icon.on { color: var(--ember); }
  .icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; }
  .body { position: relative; flex: 1; min-height: 0; display: flex; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; scroll-padding: 80px 0; }
  .title { flex: none; display: block; width: 100%; max-width: 780px; margin: 18px auto 4px; padding: 0 56px 0 34px; resize: none; overflow: hidden; border: 0; outline: none; background: none;
    font: 700 2.2rem/1.2 var(--f-display); color: var(--ink); letter-spacing: -.01em; }
  .title::placeholder { color: color-mix(in srgb, var(--muted) 60%, transparent); }
  .props { flex: none; width: 100%; max-width: 780px; margin: 0 auto; padding: 0 56px 0 34px; }
  .ed { flex: 1 0 auto; display: flex; flex-direction: column; padding-bottom: 30vh; cursor: text; }
  .ed :global(.editor) { flex: 1; }
  @media (max-width: 720px) {
    .head { padding: 8px 10px 0 14px; }
    .words { display: none; }
    .title { padding: 0 18px 0 24px; font-size: 1.7rem; margin-top: 10px; }
    .props { padding: 0 18px 0 24px; }
  }
</style>
