<script lang="ts" module>
  import type { EditorState as State } from '@codemirror/state';
  // estado de cada nota (cursor, rolagem e desfazer) para voltar a ela como estava
  const kept = new Map<string, { json: unknown; scroll: number }>();
  export type { State };
</script>

<script lang="ts">
  import { EditorView, keymap, drawSelection, highlightActiveLine, dropCursor } from '@codemirror/view';
  import { Compartment, EditorState, Transaction } from '@codemirror/state';
  import { defaultKeymap, history, historyField, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { tags as t } from '@lezer/highlight';
  import diff from 'fast-diff';
  import { untrack } from 'svelte';
  import { embeds, linkAt, type EmbedHost } from './embeds';
  import { editorBridge } from './files/editor-bridge';
  import { calcLoaded, loadCalc } from './calc/load';
  import { notionLike, preview, previewSlot, type EditorHost } from './editor';

  let { value, docKey, onchange, host, onfiles, oncursor, rich = false, livePreview = true }: {
    value: string;
    docKey: string | null;
    onchange: (v: string) => void;
    /** prévia de anexos e abertura de links (Ctrl+clique); com `rich`, o host completo do editor */
    host?: EmbedHost | EditorHost;
    /** arquivos soltos ou colados na nota: quem chama anexa e insere no cursor */
    onfiles?: (files: File[]) => void;
    /** linha (a partir de 0) onde o cursor está, a cada movimento */
    oncursor?: (line: number) => void;
    /** editor completo de notas: prévia ao vivo, menu /, alça de bloco, tabelas... */
    rich?: boolean;
    /** com `rich`: false mostra o Markdown cru (modo código-fonte) */
    livePreview?: boolean;
  } = $props();
  let el: HTMLDivElement;
  let view: EditorView | undefined;

  const look = HighlightStyle.define([
    { tag: t.heading1, fontFamily: 'var(--f-display)', fontSize: '1.6em', fontWeight: '600', color: 'var(--ink)' },
    { tag: t.heading2, fontFamily: 'var(--f-display)', fontSize: '1.3em', fontWeight: '600', color: 'var(--ink)' },
    { tag: [t.heading3, t.heading4], fontFamily: 'var(--f-display)', fontWeight: '600' },
    { tag: t.strong, fontWeight: '700', color: 'var(--ink)' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: [t.link, t.url], color: 'var(--ember-soft)' },
    { tag: t.monospace, fontFamily: 'var(--f-mono)', color: 'var(--ember-soft)' },
    { tag: [t.processingInstruction, t.meta], color: 'var(--ember)' },
    { tag: t.contentSeparator, color: 'var(--muted)' },
    { tag: t.quote, color: 'var(--silver)' },
  ]);
  // na prévia ao vivo, o tamanho dos títulos vem das linhas (editor.css)
  const richLook = HighlightStyle.define([
    { tag: t.strong, fontWeight: '700', color: 'var(--ink)' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: [t.link, t.url], color: 'var(--ember-soft)' },
    { tag: t.monospace, fontFamily: 'var(--f-mono)' },
    { tag: [t.processingInstruction, t.meta], color: 'color-mix(in srgb, var(--ember) 70%, var(--muted))' },
    { tag: t.contentSeparator, color: 'var(--muted)' },
  ]);

  const theme = EditorView.theme({
    '&': { height: '100%', color: 'var(--ink)', backgroundColor: 'transparent', fontSize: '15px' },
    '.cm-scroller': { fontFamily: 'var(--f-body)', lineHeight: '1.7', padding: '8px 0 40vh' },
    '.cm-content': { maxWidth: '760px', margin: '0 auto', padding: '0 24px', caretColor: 'var(--ember)' },
    '.cm-cursor': { borderLeftColor: 'var(--ember)', borderLeftWidth: '2px' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--ink) 3%, transparent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--ember) 28%, transparent) !important' },
    '&.cm-focused': { outline: 'none' },
  }, { dark: true });

  // editor completo: texto maior, mais ar entre as linhas, sem faixa na linha ativa
  const richTheme = EditorView.theme({
    '&': { fontSize: '16px' },
    '.cm-scroller': { lineHeight: '1.75', padding: '4px 0 45vh' },
    '.cm-content': { maxWidth: '780px', padding: '0 56px' },
    '.cm-line': { padding: '1px 0' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '@media (max-width: 720px)': { '.cm-content': { padding: '0 18px 0 30px' } },
  });

  const files = (dt: DataTransfer | null) => Array.from(dt?.files ?? []);

  const attachments = EditorView.domEventHandlers({
    drop(e, v) {
      const list = files(e.dataTransfer);
      if (!list.length || !onfiles) return false;
      e.preventDefault();
      const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) v.dispatch({ selection: { anchor: pos } });
      onfiles(list);
      return true;
    },
    paste(e) {
      const list = files(e.clipboardData);
      if (!list.length || !onfiles) return false;
      e.preventDefault();
      onfiles(list);
      return true;
    },
    mousedown(e, v) {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0 || !host) return false;
      const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
      const target = pos === null ? null : linkAt(v.state, pos);
      if (!target) return false;
      e.preventDefault();
      host.open(target);
      return true;
    },
  });

  // o host e o modo são fixos durante a vida do editor
  const embedHost = untrack(() => host);
  const isRich = untrack(() => rich && !!host && 'notes' in host);
  // cálculo, fórmulas e gráficos: entram quando o pedaço deles termina de carregar
  const calcSlot = new Compartment();
  const extensions = () => [
    history(), drawSelection(), dropCursor(), ...(isRich ? [] : [highlightActiveLine()]), EditorView.lineWrapping,
    ...(isRich ? [notionLike(embedHost as EditorHost, { preview: untrack(() => livePreview) })] : []),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown({ base: markdownLanguage }), syntaxHighlighting(isRich ? richLook : look), theme, ...(isRich ? [richTheme] : []), attachments,
    ...(embedHost ? [embeds(embedHost)] : []),
    calcSlot.of(calcLoaded() ?? []),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onchange(u.state.doc.toString());
      if ((u.docChanged || u.selectionSet) && oncursor) oncursor(u.state.doc.lineAt(u.state.selection.main.head).number - 1);
    }),
  ];

  /** estado novo, ou o que a nota tinha quando saímos dela (cursor e desfazer) */
  function stateFor(key: string | null, doc: string): EditorState {
    const saved = isRich && key ? kept.get(key) : undefined;
    if (saved) {
      try {
        const s = EditorState.fromJSON(saved.json, { extensions: extensions() }, { history: historyField });
        if (s.doc.toString() === doc) return s;
        // a nota mudou enquanto estava fechada: mantém o desfazer e aplica a diferença
        return s.update({ changes: diffChanges(s.doc.toString(), doc), annotations: Transaction.addToHistory.of(false) }).state;
      } catch {
        // estado antigo incompatível: começa limpo
      }
    }
    return EditorState.create({ doc, extensions: extensions(), selection: isRich ? { anchor: firstLineEnd(doc) } : undefined });
  }

  /** cursor inicial: depois das propriedades, no fim da primeira linha de texto */
  function firstLineEnd(doc: string): number {
    const fm = /^---\n[\s\S]*?\n---\n?/.exec(doc);
    const start = fm ? fm[0].length : 0;
    const nl = doc.indexOf('\n', start);
    return nl < 0 ? doc.length : nl;
  }

  /** quem rola: no modo rico é a página da nota (o título rola junto), senão o próprio editor */
  function scroller(): HTMLElement | undefined {
    if (!view) return undefined;
    for (let p = el?.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
    return view.scrollDOM;
  }

  function remember(): void {
    if (!isRich || !view || !docKey) return;
    kept.set(docKey, { json: view.state.toJSON({ history: historyField }), scroll: scroller()?.scrollTop ?? 0 });
    if (kept.size > 40) kept.delete(kept.keys().next().value!);
  }

  function diffChanges(cur: string, next: string) {
    const changes: { from: number; to?: number; insert?: string }[] = [];
    let pos = 0;
    for (const [op, chunk] of diff(cur, next)) {
      if (op === diff.EQUAL) pos += chunk.length;
      else if (op === diff.DELETE) { changes.push({ from: pos, to: pos + chunk.length }); pos += chunk.length; }
      else changes.push({ from: pos, insert: chunk });
    }
    return changes;
  }

  let currentKey: string | null = null;

  $effect(() => {
    currentKey = untrack(() => docKey);
    view = new EditorView({ parent: el, state: stateFor(currentKey, untrack(() => value)) });
    const scroll = currentKey ? kept.get(currentKey)?.scroll : undefined;
    if (scroll) requestAnimationFrame(() => { const sc = scroller(); if (sc) sc.scrollTop = scroll; });
    if (!calcLoaded()) void loadCalc().then((ext) => view?.dispatch({ effects: calcSlot.reconfigure(ext) }));
    // anexos e páginas web entram no cursor, em linha própria
    const detach = editorBridge.attach({
      insert(text, caret) {
        if (!view) return false;
        const { from, to } = view.state.selection.main;
        const line = view.state.doc.lineAt(from);
        // logo depois de uma tabela, a linha nova viraria uma linha da tabela
        const prev = from === line.from ? (line.number > 1 ? view.state.doc.line(line.number - 1).text : '') : line.text;
        const before = (from === line.from ? '' : '\n') + (/^\s*\|/.test(prev) ? '\n' : '');
        const after = '\n';
        const insert = `${before}${text}${after}`;
        const at = caret === undefined ? insert.length : before.length + caret;
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + at } });
        view.focus();
        return true;
      },
      goto(line) {
        if (!view) return;
        const l = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, line + 1)));
        view.dispatch({ selection: { anchor: l.to }, effects: EditorView.scrollIntoView(l.from, { y: 'start', yMargin: 24 }) });
        view.focus();
      },
      focus(atEnd) {
        if (!view) return;
        if (atEnd) view.dispatch({ selection: { anchor: view.state.doc.length } });
        view.focus();
      },
    });
    return () => {
      remember();
      detach();
      view?.destroy();
    };
  });

  // Nota trocada: guarda o estado da anterior e abre a nova como estava.
  $effect(() => {
    const key = docKey;
    if (!view || key === currentKey) return;
    untrack(() => {
      remember();
      currentKey = key;
      view!.setState(stateFor(key, value));
    });
  });

  // Prévia ao vivo ligada/desligada sem perder nada.
  $effect(() => {
    const on = livePreview;
    if (view && isRich) view.dispatch({ effects: previewSlot.reconfigure(on ? preview : []) });
  });

  // Mesma nota, mudança vinda de outro aparelho: aplica só a diferença, preservando o cursor.
  $effect(() => {
    const next = value;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === next) return;
    view.dispatch({ changes: diffChanges(cur, next) });
  });
</script>

<div class="editor" class:rich={isRich} bind:this={el}></div>

<style>
  .editor { height: 100%; overflow: hidden; }
  .editor :global(.cm-editor) { height: 100%; }
  /* modo rico: cresce com o texto e quem rola é a página (como no Notion) */
  .editor.rich { height: auto; overflow: visible; }
  .editor.rich :global(.cm-editor) { height: auto; min-height: 100%; }
  .editor.rich :global(.cm-scroller) { overflow: visible; }
</style>
