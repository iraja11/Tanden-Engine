<script lang="ts">
  import './bases.css';
  import { ancestors, bodyOf, noteName, parseProps, safeName, withBody } from '@tanden/core';
  import { engine } from '../engine.svelte';
  import Editor from '../Editor.svelte';
  import PropertiesPanel from './PropertiesPanel.svelte';
  import { bases } from './bases.svelte';
  import { files } from '../files/files.svelte';
  import { sound } from '../sound.svelte';
  import { onMount } from 'svelte';

  // Painel lateral (como o "abrir ao lado" do Notion): propriedades e texto da linha.
  let { path, onOpenNote }: { path: string; onOpenNote: (p: string) => void } = $props();

  const text = $derived.by(() => { void bases.rev; return bases.read(path); });
  const archived = $derived(parseProps(text).arquivado === 'true');
  let body = $derived(bodyOf(text));
  function typed(b: string) {
    body = b;
    bases.typed(path, withBody(bases.read(path), b));
  }
  function close() {
    bases.peek = null;
    sound.play('close');
  }
  onMount(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.db-pop')) close(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });
  let wide = $state(false);

  // renomear depende do Vault saber renomear (lápide no caminho antigo)
  const vault = engine.vault as unknown as { rename?: (from: string, to: string) => void };
  const canRename = typeof vault.rename === 'function';
  function rename(name: string) {
    const clean = safeName(name);
    if (!clean || clean === noteName(path)) return;
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const to = `${dir}${clean}.md`;
    if (bases.exists(to)) return;
    vault.rename!(path, to);
    if (engine.active === path) engine.open(to);
    engine.refresh();
    void engine.syncNow();
    bases.rebuild();
    bases.peek = to;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" onclick={close}></div>
<aside class="peek" class:wide aria-label="Página {noteName(path)}">
  <header>
    <div class="crumbs">
      {#each ancestors(path) as a (a)}<span>{a.split('/').pop()}</span><i>/</i>{/each}
    </div>
    <div class="acts">
      <button class="db-btn" title="Abrir como página" onclick={() => { const p = path; bases.peek = null; onOpenNote(p); }}>Abrir ⤢</button>
      <button class="db-btn" title={wide ? 'Estreitar' : 'Alargar'} onclick={() => (wide = !wide)}>{wide ? '⇥' : '⇤'}</button>
      <button class="db-btn" title="Duplicar" onclick={() => (bases.peek = bases.duplicate(path))}>⧉</button>
      <button class="db-btn danger" title={archived ? 'Restaurar' : 'Arquivar'} onclick={() => bases.archive(path, !archived)}>{archived ? 'Restaurar' : 'Arquivar'}</button>
      <button class="db-btn" aria-label="Fechar" onclick={close}>✕</button>
    </div>
  </header>
  {#if !bases.exists(path)}
    <p class="db-hint">Esta nota não existe mais.</p>
  {:else}
    <div class="scroll">
      {#if canRename}
        <input class="title" value={noteName(path)} aria-label="Título"
          onchange={(e) => rename((e.currentTarget as HTMLInputElement).value)}
          onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
      {:else}
        <h1>{noteName(path)}</h1>
      {/if}
      {#if archived}<p class="arch">Arquivada: não aparece nas views do banco.</p>{/if}
      <PropertiesPanel {path} onopen={(p) => (bases.peek = p)} />
      <div class="ed">
        {#key path}
          <Editor value={body} docKey={path} onchange={typed} host={files.host} />
        {/key}
      </div>
    </div>
  {/if}
</aside>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: color-mix(in srgb, var(--scrim) 40%, transparent); animation: fade .2s ease-out; }
  .peek { position: fixed; z-index: 61; top: 0; right: 0; bottom: 0; width: min(640px, 100vw); background: var(--void); border-left: 1px solid var(--line);
    box-shadow: -30px 0 60px -30px var(--shadow); display: flex; flex-direction: column; animation: slide .28s var(--ease); transition: width var(--dur-slow) var(--ease); }
  .peek.wide { width: min(1000px, 100vw); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line);
    padding-top: max(10px, env(safe-area-inset-top)); }
  .crumbs { font: 11px var(--f-mono); color: var(--muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; min-width: 0; }
  .crumbs i { font-style: normal; margin: 0 4px; opacity: .5; }
  .acts { display: flex; gap: 2px; flex: none; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 28px 0; display: flex; flex-direction: column; }
  h1 { margin: 0 0 6px; font: 600 28px/1.15 var(--f-display); letter-spacing: .01em; overflow-wrap: anywhere; }
  .title { margin: 0 0 6px; font: 600 28px/1.15 var(--f-display); letter-spacing: .01em; background: none; border: 0; color: var(--ink); outline: none; padding: 0; width: 100%; }
  .title:focus { border-bottom: 1px dashed var(--line); }
  .arch { margin: 0 0 6px; color: var(--crit); font-size: 12.5px; }
  .ed { flex: 1; min-height: 50vh; margin: 0 -24px; border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); padding-top: 6px; }
  .ed :global(.cm-scroller) { padding-bottom: 20vh; }
  @keyframes slide { from { transform: translateX(40px); opacity: 0; } }
  @keyframes fade { from { opacity: 0; } }
  @media (max-width: 720px) { .scroll { padding: 14px 16px 0; } .ed { margin: 0 -16px; } .acts .db-btn { padding: 4px 6px; } }
</style>
