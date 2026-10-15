import { EditorView, ViewPlugin, showTooltip, type Tooltip } from '@codemirror/view';
import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { BLOCK_LABELS, insertLink, insertWikiLink, lineType, setBlockType, toggleMark, type BlockType, type Mark } from './format';
import { showMenu } from './menu';

/*
 * Barra de formatação que aparece sobre o texto selecionado, como no Notion:
 * tipo do bloco, negrito, itálico, riscado, código, realce, link, [[nota]], fórmula.
 * Só aparece depois que o mouse solta (não pisca enquanto se arrasta).
 */

const selecting = StateEffect.define<boolean>();

const mouseDown = StateField.define<boolean>({
  create: () => false,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(selecting)) return e.value;
    return v;
  },
});

const BUTTONS: Array<{ mark: Mark | 'link' | 'wiki'; label: string; title: string; cls?: string }> = [
  { mark: 'bold', label: 'B', title: 'Negrito (Ctrl+B)', cls: 'b' },
  { mark: 'italic', label: 'i', title: 'Itálico (Ctrl+I)', cls: 'i' },
  { mark: 'strike', label: 'S', title: 'Riscado (Ctrl+Shift+X)', cls: 's' },
  { mark: 'code', label: '</>', title: 'Código (Ctrl+E)', cls: 'c' },
  { mark: 'highlight', label: '▍', title: 'Realce (Ctrl+Shift+H)', cls: 'h' },
  { mark: 'link', label: '🔗', title: 'Link (Ctrl+K)' },
  { mark: 'wiki', label: '[[ ]]', title: 'Link para nota (Ctrl+Shift+K)', cls: 'w' },
  { mark: 'math', label: '√x', title: 'Fórmula (Ctrl+Shift+M)', cls: 'm' },
];

function bar(state: EditorState): readonly Tooltip[] {
  const r = state.selection.main;
  if (r.empty || state.field(mouseDown) || state.selection.ranges.length > 1) return [];
  const text = state.sliceDoc(r.from, r.to);
  if (!text.trim()) return [];
  return [
    {
      pos: r.from,
      end: r.to,
      above: true,
      strictSide: false,
      arrow: false,
      create: (view) => {
        const dom = document.createElement('div');
        dom.className = 'cm-bubble';
        dom.addEventListener('mousedown', (e) => e.preventDefault());
        const type = document.createElement('button');
        type.className = 'type';
        const cur = lineType(view.state.doc.lineAt(r.from).text);
        type.textContent = `${BLOCK_LABELS[cur]} ▾`;
        type.title = 'Transformar em';
        type.addEventListener('click', () => {
          const b = type.getBoundingClientRect();
          const list: BlockType[] = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'task', 'toggle', 'callout', 'quote', 'code'];
          showMenu({ x: b.left, y: b.bottom + 4 }, list.map((t) => ({ label: BLOCK_LABELS[t], on: t === cur, run: () => setBlockType(view, t) })));
        });
        dom.append(type);
        const sep = document.createElement('i');
        dom.append(sep);
        for (const b of BUTTONS) {
          const el = document.createElement('button');
          el.textContent = b.label;
          el.title = b.title;
          if (b.cls) el.className = b.cls;
          el.addEventListener('click', () => {
            if (b.mark === 'link') insertLink(view);
            else if (b.mark === 'wiki') insertWikiLink(view);
            else toggleMark(view, b.mark);
            view.focus();
          });
          dom.append(el);
        }
        return { dom, offset: { x: 0, y: 6 } };
      },
    },
  ];
}

const bubbleField = StateField.define<readonly Tooltip[]>({
  create: bar,
  update(v, tr) {
    if (!tr.docChanged && !tr.selection && !tr.effects.some((e) => e.is(selecting))) return v;
    return bar(tr.state);
  },
  provide: (f) => showTooltip.computeN([f], (s) => s.field(f)),
});

/** marca quando o mouse está segurando uma seleção */
const tracker = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      addEventListener('mouseup', this.up, true);
    }
    up = () => {
      if (this.view.state.field(mouseDown)) setTimeout(() => this.view.dispatch({ effects: selecting.of(false) }));
    };
    destroy() {
      removeEventListener('mouseup', this.up, true);
    }
  },
  {
    eventHandlers: {
      mousedown(e, view) {
        if (e.button === 0) view.dispatch({ effects: selecting.of(true) });
      },
    },
  },
);

export const bubble = [mouseDown, bubbleField, tracker];
