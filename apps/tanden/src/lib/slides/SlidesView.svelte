<script lang="ts">
  import { TRANSITIONS, isDeck, parseDeck, slideAtLine, type Transition } from '@tanden/core';
  import { engine } from '../engine.svelte';
  import Editor from '../Editor.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { files } from '../files/files.svelte';
  import { sound } from '../sound.svelte';
  import { pop } from '../motion';
  import Slide from './Slide.svelte';
  import { slides } from './slides.svelte';

  // Tela de slides: texto da apresentação à esquerda, slide atual em destaque
  // e a fila de miniaturas. O cursor no texto escolhe o slide mostrado.
  let menu = $state<'export' | 'note' | 'deck' | null>(null);
  let query = $state('');
  let cur = $state(0);
  let showText = $state(true);
  let input = $state<HTMLInputElement>();
  let dragging = $state(0);
  let strip = $state<HTMLElement>();

  // abre a última apresentação usada (ou a primeira) ao entrar
  $effect(() => {
    if (!slides.active && slides.list.length) slides.open(slides.list[0]!);
    else if (slides.active && engine.active !== slides.active) slides.open(slides.active);
  });

  const path = $derived(slides.active);
  // apresentação trocada: volta para o primeiro slide
  let seen: string | null = null;
  $effect(() => {
    if (path !== seen) {
      seen = path;
      cur = 0;
    }
  });
  const deck = $derived(path && engine.active === path ? parseDeck(engine.content, name(path)) : null);
  const total = $derived(deck?.slides.length ?? 0);
  $effect(() => { if (cur > total - 1) cur = Math.max(0, total - 1); });
  // miniatura do slide atual sempre visível
  $effect(() => {
    void cur;
    strip?.querySelector('.thumb.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });

  const notes = $derived(engine.notes.filter((p) => !isDeck(p, engine.vault.read(p))));
  const found = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return (q ? notes.filter((p) => p.toLowerCase().includes(q)) : notes).slice(0, 40);
  });

  function name(p: string) {
    return p.split('/').pop()!.replace(/\.md$/, '');
  }

  function pick(i: number) {
    if (!deck) return;
    if (i !== cur) sound.play('tick');
    cur = i;
    editorBridge.goto(deck.slides[i]!.line);
  }

  function onCursor(line: number) {
    if (deck) cur = slideAtLine(deck, line);
  }

  async function onPick(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    for (const f of el.files ?? []) await slides.importFile(f);
    el.value = '';
  }

  function onDrop(e: DragEvent) {
    dragging = 0;
    const list = Array.from(e.dataTransfer?.files ?? []).filter((f) => /\.(pptx|pdf)$/i.test(f.name));
    if (!list.length) return;
    e.preventDefault();
    void (async () => { for (const f of list) await slides.importFile(f); })();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') menu = null;
    if (e.key === 'F5' && path) {
      e.preventDefault();
      slides.present(path, e.shiftKey ? cur : 0);
    }
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={(e) => { if (!(e.target as Element).closest?.('.menu-wrap')) menu = null; }} />

<div class="slides-view" class:drag={dragging > 0} role="region" aria-label="Apresentações"
  ondragenter={(e) => { if (e.dataTransfer?.types.includes('Files')) dragging++; }}
  ondragleave={() => (dragging = Math.max(0, dragging - 1))}
  ondragover={(e) => { if (dragging) e.preventDefault(); }}
  ondrop={onDrop}>
  <header class="tools">
    <div class="menu-wrap">
      <button class="deck-pick" onclick={() => (menu = menu === 'deck' ? null : 'deck')} aria-haspopup="menu" disabled={!slides.list.length}>
        <b>{path ? name(path) : 'Nenhuma apresentação'}</b> ▾
      </button>
      {#if menu === 'deck'}
        <div class="menu" role="menu" transition:pop>
          {#each slides.list as p (p)}
            <button role="menuitem" class:on={p === path} onclick={() => { menu = null; cur = 0; slides.open(p); sound.play('tick'); }}>
              {name(p)}<small>{p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''}</small>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="icon" onclick={() => slides.create()} title="Nova apresentação" aria-label="Nova apresentação">+</button>
    <div class="menu-wrap">
      <button onclick={() => { menu = menu === 'note' ? null : 'note'; query = ''; }} aria-haspopup="menu" title="Criar slides a partir de uma nota">Da nota…</button>
      {#if menu === 'note'}
        <div class="menu notes" role="menu" transition:pop>
          <!-- svelte-ignore a11y_autofocus -->
          <input bind:value={query} placeholder="Buscar nota…" autofocus />
          {#each found as p (p)}
            <button role="menuitem" onclick={() => { menu = null; slides.fromNote(p); }}>{name(p)}<small>{p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''}</small></button>
          {:else}
            <p class="none">Nenhuma nota encontrada.</p>
          {/each}
        </div>
      {/if}
    </div>
    <button onclick={() => input?.click()} title="Importar .pptx ou PDF">Importar</button>
    <input bind:this={input} type="file" accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" multiple hidden onchange={onPick} />

    {#if path && deck}
      <span class="sep"></span>
      <label class="trans" title={TRANSITIONS.find((t) => t.id === deck.transition)?.hint}>
        <span>Transição</span>
        <select value={deck.transition} onchange={(e) => slides.setTransition(path, e.currentTarget.value as Transition)}>
          {#each TRANSITIONS as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
        </select>
      </label>
      <button class:on={showText} onclick={() => (showText = !showText)} title="Mostrar ou esconder o texto">Texto</button>
      <div class="menu-wrap">
        <button onclick={() => (menu = menu === 'export' ? null : 'export')} aria-haspopup="menu">Exportar ▾</button>
        {#if menu === 'export'}
          <div class="menu right" role="menu" transition:pop>
            <button role="menuitem" onclick={() => { menu = null; void slides.export(path, 'pptx'); }}>PowerPoint (.pptx)<small>Slides, Impress</small></button>
            <button role="menuitem" onclick={() => { menu = null; void slides.export(path, 'pdf'); }}>PDF<small>com o tema do app</small></button>
            <button role="menuitem" onclick={() => { menu = null; void slides.export(path, 'pdf-claro'); }}>PDF claro<small>para imprimir</small></button>
          </div>
        {/if}
      </div>
      <button class="play" onclick={() => slides.present(path, cur)} title="Apresentar a partir deste slide (F5 do começo, Shift+F5 daqui)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg> Apresentar
      </button>
    {/if}
  </header>

  {#if path && deck}
    <div class="work" class:no-text={!showText}>
      <ol class="strip" bind:this={strip} aria-label="Slides">
        {#each deck.slides as s, i (i)}
          <li>
            <button class="thumb" class:on={i === cur} onclick={() => pick(i)} ondblclick={() => slides.present(path, i)} aria-label="Slide {i + 1}: {s.title}">
              <span class="n">{i + 1}</span>
              <Slide slide={s} index={i} {total} />
            </button>
          </li>
        {/each}
      </ol>
      {#if showText}
        <div class="text">
          <Editor value={engine.content} docKey={path} onchange={(v) => engine.edit(v)} oncursor={onCursor}
            host={files.host} onfiles={(f) => void files.importFiles(f, { attach: true })} />
        </div>
      {/if}
      <div class="stage">
        {#if deck.slides[cur]}
          {@const s = deck.slides[cur]}
          <div class="big"><Slide slide={s} index={cur} {total} /></div>
          <div class="meta">
            <span>Slide {cur + 1} de {total}</span>
            <span class="layout">{s.layout}</span>
            {#if s.notes}<p class="speaker" title="Notas do apresentador">{s.notes}</p>{/if}
          </div>
        {:else}
          <p class="hint">Escreva o texto à esquerda. Cada linha com <code>---</code> separa um slide.</p>
        {/if}
      </div>
    </div>
  {:else}
    <div class="empty">
      <h2>Apresentações</h2>
      <p>Uma apresentação é uma nota comum: cada <code>---</code> separa um slide, e o Obsidian abre do mesmo jeito.</p>
      <div class="cards">
        <button onclick={() => slides.create()}><b>Nova</b><small>começa de um modelo</small></button>
        <button onclick={() => { menu = 'note'; query = ''; }}><b>A partir de uma nota</b><small>cada seção vira um slide</small></button>
        <button onclick={() => input?.click()}><b>Importar</b><small>.pptx ou PDF, ou arraste aqui</small></button>
      </div>
    </div>
  {/if}
  {#if dragging}<div class="drop">Solte o .pptx ou o PDF para virar apresentação</div>{/if}
</div>

<style>
  .slides-view { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 12px 18px; border-bottom: 1px solid var(--line); }
  .tools button, .trans select { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 9px; padding: 5px 10px; font-size: 12.5px;
    transition: border-color var(--dur), color var(--dur), background var(--dur); }
  .tools button:hover:not(:disabled) { border-color: var(--ember); }
  .tools button.on { color: var(--ember); border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .tools .icon { width: 30px; padding: 5px 0; font-size: 16px; line-height: 1; }
  .deck-pick { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .deck-pick b { font: 600 13px var(--f-display); letter-spacing: .02em; }
  .sep { flex: 1; }
  .trans { display: inline-flex; align-items: center; gap: 6px; font: 11px var(--f-mono); color: var(--muted); }
  .play { display: inline-flex; align-items: center; gap: 6px; background: var(--ember) !important; color: var(--on-ember) !important; border-color: var(--ember) !important;
    font-weight: 600; box-shadow: 0 0 18px -6px var(--ember-glow); }
  .play svg { width: 13px; height: 13px; fill: currentColor; }
  .play:hover { transform: translateY(-1px); }

  .menu-wrap { position: relative; }
  .menu { position: absolute; z-index: 30; top: calc(100% + 6px); left: 0; min-width: 240px; max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px; padding: 6px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 40px -16px #000, 0 0 0 1px var(--ember-glow); }
  .menu.right { left: auto; right: 0; }
  .menu button { display: flex; justify-content: space-between; gap: 12px; width: 100%; text-align: left; border: 0; background: none; color: var(--ink); padding: 6px 10px; border-radius: 8px; font-size: 13px; }
  .menu button:hover, .menu button.on { background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .menu small { color: var(--muted); font: 11px var(--f-mono); white-space: nowrap; }
  .menu input { margin: 2px 2px 6px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--void); color: var(--ink); font: inherit; }
  .menu .none { margin: 6px 10px; color: var(--muted); font-size: 12px; }

  .work { flex: 1; min-height: 0; display: grid; grid-template-columns: 168px minmax(280px, 1fr) minmax(360px, 1.35fr); }
  .work.no-text { grid-template-columns: 168px 1fr; }
  .strip { list-style: none; margin: 0; padding: 12px 12px 40px; overflow-y: auto; display: grid; gap: 10px; align-content: start; border-right: 1px solid var(--line); counter-reset: s; }
  .thumb { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; border-radius: 8px; cursor: pointer;
    transition: transform var(--dur) var(--spring); }
  .thumb :global(.slide) { pointer-events: none; transition: box-shadow var(--dur) var(--ease); }
  .thumb:hover { transform: translateY(-1px); }
  .thumb.on :global(.slide) { box-shadow: inset 0 0 0 1px var(--ember), 0 0 18px -6px var(--ember-glow); }
  .thumb .n { position: absolute; left: -2px; top: -4px; z-index: 1; font: 10px var(--f-mono); color: var(--muted); background: var(--void); padding: 0 3px; border-radius: 4px; }
  .thumb.on .n { color: var(--ember); }
  .text { min-width: 0; min-height: 0; border-right: 1px solid var(--line); }
  .text :global(.cm-content) { max-width: none; padding: 0 18px; }
  .stage { min-width: 0; min-height: 0; overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 12px; }
  .big { width: 100%; max-width: 1100px; margin: 0 auto; filter: drop-shadow(0 24px 40px rgba(0, 0, 0, .35)); }
  .meta { width: 100%; max-width: 1100px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; font: 11px var(--f-mono); color: var(--muted); }
  .meta .layout { text-transform: uppercase; letter-spacing: .1em; color: var(--ember-soft); }
  .speaker { flex-basis: 100%; margin: 6px 0 0; padding: 10px 12px; border-left: 2px solid var(--ember); background: var(--surface); border-radius: 0 10px 10px 0;
    font: 13px/1.5 var(--f-body); color: var(--ink); white-space: pre-wrap; }
  .hint { margin: auto; color: var(--muted); }
  code { font-family: var(--f-mono); color: var(--ember-soft); }

  .empty { margin: auto; max-width: 640px; padding: 24px; text-align: center; }
  .empty h2 { font: 600 20px var(--f-display); letter-spacing: .04em; margin: 0 0 8px; }
  .empty p { color: var(--muted); margin: 0 0 20px; }
  .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .cards button { display: grid; gap: 4px; padding: 18px 14px; border: 1px solid var(--line); background: var(--surface); border-radius: 14px; text-align: left;
    transition: border-color var(--dur), transform var(--dur) var(--spring); }
  .cards button:hover { border-color: var(--ember); transform: translateY(-2px); }
  .cards b { font: 600 14px var(--f-display); }
  .cards small { color: var(--muted); font-size: 12px; }

  .drop { position: absolute; inset: 8px; z-index: 40; display: grid; place-items: center; border: 2px dashed var(--ember); border-radius: 16px; pointer-events: none;
    background: color-mix(in srgb, var(--void) 80%, transparent); color: var(--ember); font: 600 15px var(--f-display); }

  @media (max-width: 1100px) {
    .work, .work.no-text { grid-template-columns: 1fr; grid-template-rows: auto auto minmax(240px, 1fr); }
    .stage { order: 1; overflow: visible; padding: 14px 14px 6px; }
    .strip { order: 2; display: flex; overflow-x: auto; overflow-y: hidden; padding: 6px 14px 10px; border-right: 0; border-bottom: 1px solid var(--line); }
    .strip li { flex: 0 0 132px; }
    .text { order: 3; border-right: 0; }
    .work { overflow-y: auto; }
  }
  @media (max-width: 720px) {
    .tools { padding: 10px 12px; }
    .trans span { display: none; }
    .cards { grid-template-columns: 1fr; }
  }
</style>
