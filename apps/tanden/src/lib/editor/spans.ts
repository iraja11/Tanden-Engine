import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { STYLED_SPAN, safeCss } from '@tanden/core';
import { revealRanges } from './reveal';

/*
 * Texto com cor, tamanho ou fonte (<span style="…">texto</span>): a prévia ao
 * vivo some com as tags e pinta o texto. Com o cursor dentro, as tags voltam
 * (esmaecidas) para dar para editar à mão.
 */

const hidden = Decoration.replace({});
const tag = Decoration.mark({ class: 'cm-span-tag' });

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const out: Range<Decoration>[] = [];
  const cursors = revealRanges(state);
  const tree = syntaxTree(state);
  for (const { from, to } of view.visibleRanges) {
    const text = state.sliceDoc(from, to);
    for (const m of text.matchAll(STYLED_SPAN)) {
      const a = from + m.index;
      const b = a + m[0].length;
      // dentro de código (`…` ou ```) é texto literal
      const node = tree.resolveInner(a, 1).name;
      if (/Code|CodeText|CodeMark|Comment/.test(node)) continue;
      const css = safeCss(m[1]!);
      const openEnd = a + m[0].indexOf('>') + 1;
      const closeStart = b - '</span>'.length;
      if (css && closeStart > openEnd) out.push(Decoration.mark({ attributes: { style: css }, class: 'cm-styled' }).range(openEnd, closeStart));
      if (cursors.some((r) => r.from <= b && r.to >= a)) {
        out.push(tag.range(a, openEnd), tag.range(closeStart, b));
      } else {
        out.push(hidden.range(a, openEnd), hidden.range(closeStart, b));
      }
    }
  }
  return Decoration.set(out, true);
}

export const styledSpans = ViewPlugin.fromClass(
  class {
    deco: DecorationSet;
    constructor(view: EditorView) {
      this.deco = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.deco = build(u.view);
    }
  },
  { decorations: (v) => v.deco },
);
