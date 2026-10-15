<script lang="ts">
  import { isDeck } from '@tanden/core';
  import { engine } from '../engine.svelte';
  import { slides } from '../slides/slides.svelte';
  import { files } from './files.svelte';
  import WebClipDialog from './WebClipDialog.svelte';
  import { editorBridge } from './editor-bridge';

  // Botões da nota aberta: anexar arquivo ou página web, exportar.
  let { path }: { path: string } = $props();

  let menu = $state<'attach' | 'export' | 'insert' | null>(null);

  // modelos de bloco: o cursor fica onde se começa a escrever
  const blocks = {
    calc: ['```calc\n', '\n```'],
    plot: ['```grafico\ny = ', '\nx: -10..10\n```'],
    plot3d: ['```grafico\nz = ', '\nx: -3..3   y: -3..3\n```'],
    tex: ['$$\n', '\n$$'],
  } as const;
  function insertBlock(kind: keyof typeof blocks) {
    menu = null;
    const [a, b] = blocks[kind];
    editorBridge.insert(a + b, a.length);
  }
  let clip = $state(false);
  let input = $state<HTMLInputElement>();

  async function onPick(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    if (el.files?.length) await files.importFiles(el.files, { attach: true });
    el.value = '';
  }
</script>

<svelte:window onpointerdown={(e) => { if (menu && !(e.target as Element).closest?.('.note-tools')) menu = null; }} />

<div class="note-tools">
  <div class="wrap">
    <button onclick={() => (menu = menu === 'attach' ? null : 'attach')} aria-haspopup="menu" title="Anexar arquivo ou página web">
      <svg viewBox="0 0 24 24"><path d="M20 11.5 12.5 19a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7L10.3 16.6a1.7 1.7 0 0 1-2.4-2.4l6.8-6.8" /></svg>
      Anexar
    </button>
    {#if menu === 'attach'}
      <div class="menu" role="menu">
        <button role="menuitem" onclick={() => { menu = null; input?.click(); }}>Arquivo…<small>ou arraste para a nota</small></button>
        <button role="menuitem" onclick={() => { menu = null; clip = true; }}>Página web…<small>nota ou cartão</small></button>
      </div>
    {/if}
  </div>
  <div class="wrap">
    <button onclick={() => (menu = menu === 'insert' ? null : 'insert')} aria-haspopup="menu" title="Inserir conta, gráfico ou fórmula">∑ Inserir</button>
    {#if menu === 'insert'}
      <div class="menu" role="menu">
        <button role="menuitem" onclick={() => insertBlock('calc')}>Bloco de cálculo<small>contas e unidades</small></button>
        <button role="menuitem" onclick={() => insertBlock('plot')}>Gráfico<small>funções e pontos</small></button>
        <button role="menuitem" onclick={() => insertBlock('plot3d')}>Gráfico 3D<small>superfícies e curvas</small></button>
        <button role="menuitem" onclick={() => insertBlock('tex')}>Fórmula<small>LaTeX</small></button>
      </div>
    {/if}
  </div>
  <div class="wrap">
    <button onclick={() => (menu = menu === 'export' ? null : 'export')} aria-haspopup="menu" title="Exportar esta nota">Exportar ▾</button>
    {#if menu === 'export'}
      <div class="menu" role="menu">
        <button role="menuitem" onclick={() => { menu = null; void files.exportNote(path, 'docx'); }}>Word (.docx)<small>Word, Google Docs</small></button>
        <button role="menuitem" onclick={() => { menu = null; void files.exportNote(path, 'odt'); }}>LibreOffice (.odt)<small>Writer, com os estilos dele</small></button>
        <button role="menuitem" onclick={() => { menu = null; void files.exportNote(path, 'pdf'); }}>PDF<small>pela janela de impressão</small></button>
        <button role="menuitem" onclick={() => { menu = null; void files.exportNote(path, 'html'); }}>Página (.html)<small>abre em qualquer lugar</small></button>
        <button role="menuitem" onclick={() => { menu = null; void files.exportNote(path, 'md'); }}>Markdown (.md)<small>Obsidian, GitHub</small></button>
        {#if isDeck(path, engine.content)}
          <button role="menuitem" onclick={() => { menu = null; slides.show(path); }}>Abrir nos slides<small>apresentar, .pptx, PDF</small></button>
        {:else}
          <button role="menuitem" onclick={() => { menu = null; slides.fromNote(path); }}>Slides<small>cada seção vira um slide</small></button>
        {/if}
      </div>
    {/if}
  </div>
  <input bind:this={input} type="file" multiple hidden onchange={onPick} />
</div>

{#if clip}<WebClipDialog attachTo={path} onclose={() => (clip = false)} />{/if}

<style>
  .note-tools { display: flex; gap: 6px; }
  .wrap { position: relative; }
  button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid transparent; background: none; border-radius: 8px; padding: 3px 8px;
    font: 11.5px var(--f-mono); color: var(--muted); }
  button:hover { color: var(--ink); border-color: var(--line); background: var(--surface); }
  svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .menu { position: absolute; z-index: 30; top: calc(100% + 6px); right: 0; min-width: 230px; display: grid; gap: 2px; padding: 6px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 40px -16px #000, 0 0 0 1px var(--ember-glow);
    animation: rise .14s cubic-bezier(.2, .8, .2, 1); }
  .menu button { width: 100%; justify-content: space-between; font: 13px var(--f-body); color: var(--ink); padding: 6px 10px; }
  .menu button:hover { background: color-mix(in srgb, var(--ember) 10%, transparent); border-color: transparent; }
  .menu small { color: var(--muted); font: 11px var(--f-mono); }
  @keyframes rise { from { opacity: 0; transform: translateY(-4px); } }
</style>
