import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder, StateField, type EditorState, type Extension } from '@codemirror/state';
import { mount, unmount } from 'svelte';
import BaseView from './BaseView.svelte';
import { files } from '../files/files.svelte';

/*
 * Bancos dentro das notas: cada bloco ```base vira o banco de verdade (tabela,
 * quadro, calendário...). Com o cursor dentro do bloco, o YAML aparece para
 * editar à mão, como no Obsidian.
 */

class BaseWidget extends WidgetType {
  private app: Record<string, unknown> | null = null;
  constructor(readonly path: string, readonly index: number, readonly from: number) {
    super();
  }
  eq(o: BaseWidget) {
    return o.path === this.path && o.index === this.index;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-base';
    const bar = document.createElement('button');
    bar.className = 'cm-base-src';
    bar.type = 'button';
    bar.textContent = '{ } YAML';
    bar.title = 'Editar o bloco como texto';
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    bar.addEventListener('click', () => {
      // põe o cursor dentro do bloco: a decoração some e o texto aparece
      const pos = this.findFrom(view);
      if (pos !== null) view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, pos + view.state.doc.lineAt(pos).length + 1) } });
      view.focus();
    });
    const host = document.createElement('div');
    wrap.append(bar, host);
    this.app = mount(BaseView, { target: host, props: { notePath: this.path, index: this.index, embedded: true, onOpenNote: (p: string) => files.openPath(p) } });
    return wrap;
  }
  private findFrom(view: EditorView): number | null {
    let n = -1;
    let inOther = false;
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const l = view.state.doc.line(i);
      if (/^\s*(`{3,}|~{3,})\s*base\s*$/.test(l.text) && !inOther) {
        if (++n === this.index) return l.from;
        // pula até o fim
        while (i < view.state.doc.lines && !/^\s*(`{3,}|~{3,})\s*$/.test(view.state.doc.line(i + 1).text)) i++;
        i++;
      } else if (/^\s*(`{3,}|~{3,})/.test(l.text)) inOther = !inOther;
    }
    return null;
  }
  destroy() {
    if (this.app) void unmount(this.app);
    this.app = null;
  }
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 320;
  }
}

function build(state: EditorState, path: string | null): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  if (!path || !state.doc.toString().includes('base')) return b.finish();
  const sel = state.selection.main;
  let idx = 0;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const open = /^\s*(`{3,}|~{3,})\s*(\S*)\s*$/.exec(line.text);
    if (!open) continue;
    const fence = open[1]!;
    const close = new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
    let j = i + 1;
    while (j <= state.doc.lines && !close.test(state.doc.line(j).text)) j++;
    if (open[2] === 'base') {
      const from = line.from;
      const to = j <= state.doc.lines ? state.doc.line(j).to : state.doc.length;
      const inside = sel.from <= to && sel.to >= from;
      if (!inside) b.add(from, to, Decoration.replace({ widget: new BaseWidget(path, idx, from), block: true }));
      idx++;
    }
    i = j;
  }
  return b.finish();
}

/** Extensão do editor; `path` diz qual nota está aberta. */
export function baseBlocks(path: () => string | null): Extension {
  return StateField.define<DecorationSet>({
    create: (s) => build(s, path()),
    update: (deco, tr) => (tr.docChanged || tr.selection ? build(tr.state, path()) : deco),
    provide: (f) => EditorView.decorations.from(f),
  });
}
