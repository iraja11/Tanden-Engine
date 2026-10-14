<script lang="ts">
  import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
  import { Compartment, EditorState } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { tags as t } from '@lezer/highlight';
  import diff from 'fast-diff';
  import { untrack } from 'svelte';
  import { embeds, linkAt, type EmbedHost } from './embeds';
  import { editorBridge } from './files/editor-bridge';
  import { calcLoaded, loadCalc } from './calc/load';

  let { value, docKey, onchange, host, onfiles, oncursor }: {
    value: string;
    docKey: string | null;
    onchange: (v: string) => void;
    /** prévia de anexos e abertura de links (Ctrl+clique) */
    host?: EmbedHost;
    /** arquivos soltos ou colados na nota: quem chama anexa e insere no cursor */
    onfiles?: (files: File[]) => void;
    /** linha (a partir de 0) onde o cursor está, a cada movimento */
    oncursor?: (line: number) => void;
  } = $props();
  let el: HTMLDivElement;
  let view: EditorView | undefined;

  const look = HighlightStyle.define([
    { tag: t.heading1, fontFamily: 'var(--f-display)', fontSize: '1.6em', fontWeight: '600', color: 'var(--ink)' },
    { tag: t.heading2, fontFamily: 'var(--f-display)', fontSize: '1.3em', fontWeight: '600', color: 'var(--ink)' },
    { tag: [t.heading3, t.heading4], fontFamily: 'var(--f-display)', fontWeight: '600' },
    { tag: t.strong, fontWeight: '700', color: 'var(--ink)' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: [t.link, t.url], color: 'var(--ember-soft)' },
    { tag: t.monospace, fontFamily: 'var(--f-mono)', color: 'var(--ember-soft)' },
    { tag: [t.processingInstruction, t.meta, t.list], color: 'var(--ember)' },
    { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
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

  // o host é fixo durante a vida do editor
  const embedHost = untrack(() => host);
  // cálculo, fórmulas e gráficos: entram quando o pedaço deles termina de carregar
  const calcSlot = new Compartment();
  const extensions = () => [
    history(), drawSelection(), highlightActiveLine(), EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown(), syntaxHighlighting(look), theme, attachments,
    ...(embedHost ? [embeds(embedHost)] : []),
    calcSlot.of(calcLoaded() ?? []),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onchange(u.state.doc.toString());
      if ((u.docChanged || u.selectionSet) && oncursor) oncursor(u.state.doc.lineAt(u.state.selection.main.head).number - 1);
    }),
  ];

  $effect(() => {
    view = new EditorView({ parent: el, state: EditorState.create({ doc: untrack(() => value), extensions: extensions() }) });
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
      },
    });
    return () => {
      detach();
      view?.destroy();
    };
  });

  // Nota trocada: substitui tudo e zera o histórico de desfazer.
  $effect(() => {
    docKey;
    view?.setState(EditorState.create({ doc: untrack(() => value), extensions: extensions() }));
  });

  // Mesma nota, mudança vinda de outro aparelho: aplica só a diferença, preservando o cursor.
  $effect(() => {
    const next = value;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur === next) return;
    const changes: { from: number; to?: number; insert?: string }[] = [];
    let pos = 0;
    for (const [op, chunk] of diff(cur, next)) {
      if (op === diff.EQUAL) pos += chunk.length;
      else if (op === diff.DELETE) { changes.push({ from: pos, to: pos + chunk.length }); pos += chunk.length; }
      else changes.push({ from: pos, insert: chunk });
    }
    view.dispatch({ changes });
  });
</script>

<div class="editor" bind:this={el}></div>

<style>
  .editor { height: 100%; overflow: hidden; }
  .editor :global(.cm-editor) { height: 100%; }
  .editor :global(.cm-embed-img) { padding: 6px 0 10px; }
  .editor :global(.cm-embed-img img) { display: block; max-width: 100%; max-height: 70vh; border-radius: 10px; border: 1px solid var(--line);
    box-shadow: 0 14px 30px -20px #000; cursor: zoom-in; }
  .editor :global(.cm-embed-img.missing) { color: var(--muted); font: 12px var(--f-mono); }
  .editor :global(.cm-embed-file) { display: inline-flex; align-items: center; gap: 10px; margin: 4px 0 10px; padding: 8px 12px; max-width: 100%;
    border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: 13px var(--f-body); }
  .editor :global(.cm-embed-file:hover) { border-color: var(--ember); }
  .editor :global(.cm-embed-file .ext) { font: 600 10px var(--f-mono); color: #160b03; background: var(--ember); border-radius: 5px; padding: 3px 6px; }
  .editor :global(.cm-embed-file .name) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .editor :global(.cm-embed-file .go) { color: var(--ember-soft); font-size: 12px; }
</style>
