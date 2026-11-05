import { RangeSetBuilder, type EditorState, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/*
 * Foco no parágrafo: só o parágrafo do cursor fica aceso; o resto esmaece.
 * E o cursor fica no meio da tela enquanto se escreve (máquina de escrever),
 * para os olhos não descerem até o pé da página.
 */

const dim = Decoration.line({ class: 'cm-unfocused' });

/** Linhas do parágrafo do cursor: sobe e desce até achar linha em branco. */
function paragraph(state: EditorState): { from: number; to: number } {
  const doc = state.doc;
  const here = doc.lineAt(state.selection.main.head);
  if (!here.text.trim()) return { from: here.number, to: here.number };
  let a = here.number;
  let b = here.number;
  while (a > 1 && doc.line(a - 1).text.trim()) a--;
  while (b < doc.lines && doc.line(b + 1).text.trim()) b++;
  return { from: a, to: b };
}

function build(view: EditorView): DecorationSet {
  const out = new RangeSetBuilder<Decoration>();
  const { from, to } = paragraph(view.state);
  for (const r of view.visibleRanges) {
    let pos = r.from;
    while (pos <= r.to) {
      const line = view.state.doc.lineAt(pos);
      if (line.number < from || line.number > to) out.add(line.from, line.from, dim);
      pos = line.to + 1;
    }
  }
  return out.finish();
}

const dimmer = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ao digitar (não ao clicar), leva a linha do cursor para o meio da tela
const typewriter = EditorView.updateListener.of((u) => {
  if (!u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete') || (tr.isUserEvent('select') && !tr.isUserEvent('select.pointer')))) return;
  const head = u.state.selection.main.head;
  requestAnimationFrame(() => {
    if (u.view.dom.isConnected) u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
  });
});

export const paragraphFocus: Extension = [dimmer, typewriter];
