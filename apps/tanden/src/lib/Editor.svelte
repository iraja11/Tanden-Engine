<script lang="ts">
  import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { tags as t } from '@lezer/highlight';
  import diff from 'fast-diff';
  import { untrack } from 'svelte';

  let { value, docKey, onchange }: { value: string; docKey: string | null; onchange: (v: string) => void } = $props();
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

  const extensions = [
    history(), drawSelection(), highlightActiveLine(), EditorView.lineWrapping,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown(), syntaxHighlighting(look), theme,
    EditorView.updateListener.of((u) => { if (u.docChanged) onchange(u.state.doc.toString()); }),
  ];

  $effect(() => {
    view = new EditorView({ parent: el, state: EditorState.create({ doc: untrack(() => value), extensions }) });
    return () => view?.destroy();
  });

  // Nota trocada: substitui tudo e zera o histórico de desfazer.
  $effect(() => {
    docKey;
    view?.setState(EditorState.create({ doc: untrack(() => value), extensions }));
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
</style>
