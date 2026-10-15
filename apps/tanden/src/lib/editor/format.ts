import { EditorSelection, type ChangeSpec, type EditorState, type Text } from '@codemirror/state';
import type { Command, EditorView, KeyBinding } from '@codemirror/view';
import { moveLineDown, moveLineUp } from '@codemirror/commands';
import { LIST, blockAt, listItemEnd } from './blocks';

/*
 * Formatação como no Notion, gravando Markdown comum: negrito, títulos,
 * listas, tarefas, mover e duplicar blocos. Tudo entra no desfazer.
 */

const MARKS = { bold: '**', italic: '*', strike: '~~', code: '`', highlight: '==', math: '$' } as const;
export type Mark = keyof typeof MARKS;

/** Liga ou desliga uma marca em volta da seleção (ou insere vazia no cursor). */
export function toggleMark(view: EditorView, kind: Mark): boolean {
  const m = MARKS[kind];
  const { state } = view;
  const tr = state.changeByRange((r) => {
    const doc = state.doc;
    const before = doc.sliceString(Math.max(0, r.from - m.length), r.from);
    const after = doc.sliceString(r.to, r.to + m.length);
    const inner = doc.sliceString(r.from, r.to);
    // já marcado por fora: tira
    if (before === m && after === m && !(kind === 'italic' && doc.sliceString(r.from - 2, r.from) === '**' && doc.sliceString(r.to, r.to + 2) === '**' && doc.sliceString(r.from - 3, r.from) !== '***')) {
      return {
        changes: [{ from: r.from - m.length, to: r.from }, { from: r.to, to: r.to + m.length }],
        range: EditorSelection.range(r.from - m.length, r.to - m.length),
      };
    }
    // seleção incluindo as marcas: tira
    if (inner.length >= m.length * 2 && inner.startsWith(m) && inner.endsWith(m)) {
      return { changes: { from: r.from, to: r.to, insert: inner.slice(m.length, -m.length) }, range: EditorSelection.range(r.from, r.to - m.length * 2) };
    }
    if (r.empty) {
      // sem seleção: marca a palavra sob o cursor, ou abre um par vazio
      const word = state.wordAt(r.head);
      if (word && word.from < r.head && word.to > r.head) {
        return {
          changes: [{ from: word.from, insert: m }, { from: word.to, insert: m }],
          range: EditorSelection.cursor(r.head + m.length),
        };
      }
      return { changes: { from: r.from, insert: m + m }, range: EditorSelection.cursor(r.from + m.length) };
    }
    // não leva espaços das pontas para dentro da marca
    const lead = inner.length - inner.trimStart().length;
    const trail = inner.length - inner.trimEnd().length;
    const a = r.from + lead;
    const b = r.to - trail;
    return { changes: [{ from: a, insert: m }, { from: b, insert: m }], range: EditorSelection.range(a + m.length, b + m.length) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

/** [texto](endereço): com seleção, o cursor vai para o endereço. */
export function insertLink(view: EditorView, url = ''): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to);
      if (/^https?:\/\/\S+$/.test(text)) {
        const ins = `[](${text})`;
        return { changes: { from: r.from, to: r.to, insert: ins }, range: EditorSelection.cursor(r.from + 1) };
      }
      const ins = `[${text}](${url})`;
      return { changes: { from: r.from, to: r.to, insert: ins }, range: url ? EditorSelection.cursor(r.from + ins.length) : EditorSelection.cursor(r.from + text.length + 3) };
    }),
    { userEvent: 'input.format' },
  );
  return true;
}

/** [[nota]] em volta da seleção. */
export function insertWikiLink(view: EditorView): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((r) => {
      const text = state.sliceDoc(r.from, r.to).replace(/[\[\]|#]/g, ' ').trim();
      return { changes: { from: r.from, to: r.to, insert: `[[${text}]]` }, range: EditorSelection.cursor(r.from + 2 + text.length + (text ? 2 : 0)) };
    }),
    { userEvent: 'input.format' },
  );
  return true;
}

export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'ul' | 'ol' | 'task' | 'quote' | 'callout' | 'toggle' | 'code';

export const BLOCK_LABELS: Record<BlockType, string> = {
  p: 'Texto',
  h1: 'Título 1',
  h2: 'Título 2',
  h3: 'Título 3',
  h4: 'Título 4',
  ul: 'Lista',
  ol: 'Lista numerada',
  task: 'Lista de tarefas',
  quote: 'Citação',
  callout: 'Destaque (callout)',
  toggle: 'Toggle (recolhível)',
  code: 'Código',
};

const PREFIX = /^(\s*)(#{1,6}\s+|>\s*\[![\w-]+\][+-]?\s*|>\s?|(?:[-*+]|\d{1,9}[.)])\s+\[[ xX/-]\]\s+|(?:[-*+]|\d{1,9}[.)])\s+)?/;

/** Tipo atual da linha (para marcar no menu "Transformar em"). */
export function lineType(text: string): BlockType {
  const t = text.trimStart();
  const h = /^(#{1,6})\s/.exec(t);
  if (h) return (`h${Math.min(4, h[1]!.length)}`) as BlockType;
  if (/^>\s*\[!toggle\]/i.test(t)) return 'toggle';
  if (/^>\s*\[!/.test(t)) return 'callout';
  if (t.startsWith('>')) return 'quote';
  if (/^(?:[-*+]|\d+[.)])\s+\[[ xX/-]\]/.test(t)) return 'task';
  if (/^\d+[.)]\s/.test(t)) return 'ol';
  if (/^[-*+]\s/.test(t)) return 'ul';
  if (/^(```|~~~)/.test(t)) return 'code';
  return 'p';
}

/** Muda o tipo das linhas selecionadas (ou do bloco do cursor). */
export function setBlockType(view: EditorView, type: BlockType, lines?: { from: number; to: number }): boolean {
  const { state } = view;
  const doc = state.doc;
  let a: number;
  let b: number;
  if (lines) {
    a = lines.from;
    b = lines.to;
  } else {
    const r = state.selection.main;
    a = doc.lineAt(r.from).number;
    b = doc.lineAt(r.to).number;
    if (a === b) {
      const blk = blockAt(state, a);
      if (blk && (blk.kind === 'paragraph' || blk.kind === 'quote' || blk.kind === 'callout')) {
        a = blk.start;
        b = blk.end;
      }
    }
  }
  if (type === 'code') {
    const from = doc.line(a).from;
    const to = doc.line(b).to;
    const body = doc.sliceString(from, to).split('\n').map((l) => l.replace(PREFIX, '$1')).join('\n');
    view.dispatch({ changes: { from, to, insert: `\`\`\`\n${body}\n\`\`\`` }, selection: { anchor: from + 3 }, userEvent: 'input.format' });
    return true;
  }
  const changes: ChangeSpec[] = [];
  let n = 1;
  for (let i = a; i <= b; i++) {
    const line = doc.line(i);
    if (!line.text.trim() && a !== b) continue;
    const m = PREFIX.exec(line.text)!;
    const indent = type.startsWith('h') ? '' : m[1]!;
    const first = i === a;
    let p = '';
    if (type === 'h1') p = '# ';
    else if (type === 'h2') p = '## ';
    else if (type === 'h3') p = '### ';
    else if (type === 'h4') p = '#### ';
    else if (type === 'ul') p = '- ';
    else if (type === 'ol') p = `${n++}. `;
    else if (type === 'task') p = '- [ ] ';
    else if (type === 'quote') p = '> ';
    else if (type === 'callout') p = first ? '> [!nota] ' : '> ';
    else if (type === 'toggle') p = first ? '> [!toggle]- ' : '> ';
    changes.push({ from: line.from, to: line.from + m[0].length, insert: indent + p });
  }
  view.dispatch({ changes, userEvent: 'input.format', scrollIntoView: true });
  // cursor no fim da linha se ela estava vazia (como no Notion)
  const line = view.state.doc.line(Math.min(a, view.state.doc.lines));
  if (a === b && view.state.selection.main.head < line.from + (PREFIX.exec(line.text)?.[0].length ?? 0)) {
    view.dispatch({ selection: { anchor: line.to } });
  }
  return true;
}

/** Ctrl+Enter: marca/desmarca a tarefa; numa linha comum, vira tarefa. */
export const toggleTask: Command = (view) => {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let i = state.doc.lineAt(r.from).number; i <= state.doc.lineAt(r.to).number; i++) {
      if (seen.has(i)) continue;
      seen.add(i);
      const line = state.doc.line(i);
      const t = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX/-])\]/.exec(line.text);
      if (t) {
        const at = line.from + t[1]!.length + 1;
        changes.push({ from: at, to: at + 1, insert: t[2] === ' ' ? 'x' : ' ' });
        continue;
      }
      const l = /^(\s*(?:[-*+]|\d+[.)])\s+)/.exec(line.text);
      if (l) changes.push({ from: line.from + l[1]!.length, insert: '[ ] ' });
      else {
        const ind = /^\s*/.exec(line.text)![0];
        changes.push({ from: line.from + ind.length, insert: '- [ ] ' });
      }
    }
  }
  view.dispatch({ changes, userEvent: 'input.check' });
  return true;
};

const indentOf = (t: string) => t.match(/^\s*/)![0].replace(/\t/g, '    ').length;

/** Bloco vizinho (acima ou abaixo), no mesmo nível de recuo quando é lista. */
function sibling(state: EditorState, start: number, end: number, dir: -1 | 1): { start: number; end: number } | null {
  const doc = state.doc;
  const myIndent = indentOf(doc.line(start).text);
  const isList = LIST.test(doc.line(start).text);
  let k = dir < 0 ? start - 1 : end + 1;
  while (k >= 1 && k <= doc.lines && !doc.line(k).text.trim()) k += dir;
  if (k < 1 || k > doc.lines) return null;
  if (isList && myIndent > 0) {
    if (dir < 0) {
      for (let j = k; j >= 1; j--) {
        const t = doc.line(j).text;
        if (!t.trim()) continue;
        const ind = indentOf(t);
        if (ind < myIndent) return null; // chegou no pai
        if (ind === myIndent && LIST.test(t)) return { start: j, end: listItemEnd(doc, j) };
      }
      return null;
    }
    const t = doc.line(k).text;
    if (indentOf(t) !== myIndent || !LIST.test(t)) return null;
    return { start: k, end: listItemEnd(doc, k) };
  }
  if (dir < 0) {
    // sobe até o começo do bloco de cima (no nível de fora)
    const b = blockAt(state, k);
    if (!b) return null;
    if (b.kind === 'list') {
      let j = k;
      for (; j >= 1; j--) {
        const t = doc.line(j).text;
        if (t.trim() && indentOf(t) === 0 && LIST.test(t)) break;
      }
      return { start: j, end: listItemEnd(doc, j) };
    }
    return { start: b.start, end: b.end };
  }
  const b = blockAt(state, k);
  return b ? { start: b.start, end: b.kind === 'list' ? listItemEnd(doc, b.start) : b.end } : null;
}

const linesText = (doc: Text, a: number, b: number) => doc.sliceString(doc.line(a).from, doc.line(b).to);

/** Move o bloco do cursor (com filhos) para cima ou para baixo. */
export function moveBlock(view: EditorView, dir: -1 | 1, at?: number): boolean {
  const { state } = view;
  const doc = state.doc;
  const sel = state.selection.main;
  const n = at ?? doc.lineAt(sel.head).number;
  // seleção de várias linhas ou linha em branco: move linhas, como sempre
  if (at === undefined && doc.lineAt(sel.from).number !== doc.lineAt(sel.to).number) return dir < 0 ? moveLineUp(view) : moveLineDown(view);
  if (!doc.line(n).text.trim()) return dir < 0 ? moveLineUp(view) : moveLineDown(view);
  const b = blockAt(state, n);
  if (!b || b.kind === 'frontmatter') return false;
  const sib = sibling(state, b.start, b.end, dir);
  if (!sib || (dir < 0 && sib.end >= b.start) || (dir > 0 && sib.start <= b.end)) return true;
  const top = dir < 0 ? sib : b;
  const bottom = dir < 0 ? b : sib;
  const sep = doc.sliceString(doc.line(top.end).to, doc.line(bottom.start).from);
  const from = doc.line(top.start).from;
  const to = doc.line(bottom.end).to;
  const insert = linesText(doc, bottom.start, bottom.end) + sep + linesText(doc, top.start, top.end);
  const blockFrom = doc.line(b.start).from;
  const offsetA = sel.anchor - blockFrom;
  const offsetH = sel.head - blockFrom;
  const newStart = dir < 0 ? from : from + linesText(doc, sib.start, sib.end).length + sep.length;
  view.dispatch({
    changes: { from, to, insert },
    selection: at === undefined ? EditorSelection.range(newStart + offsetA, newStart + offsetH) : undefined,
    scrollIntoView: true,
    userEvent: 'move.line',
  });
  return true;
}

/** Duplica o bloco do cursor logo abaixo. */
export function duplicateBlock(view: EditorView, at?: number): boolean {
  const { state } = view;
  const doc = state.doc;
  const n = at ?? doc.lineAt(state.selection.main.head).number;
  const b = blockAt(state, n);
  if (!b || b.kind === 'frontmatter') return false;
  const text = linesText(doc, b.start, b.end);
  const end = doc.line(b.end).to;
  const blank = b.kind === 'list' ? '\n' : '\n\n';
  view.dispatch({ changes: { from: end, insert: blank + text }, selection: { anchor: end + blank.length }, scrollIntoView: true, userEvent: 'input.duplicate' });
  return true;
}

/** Apaga o bloco (com filhos). */
export function deleteBlock(view: EditorView, at: number): boolean {
  const { state } = view;
  const doc = state.doc;
  const b = blockAt(state, at);
  if (!b) return false;
  let from = doc.line(b.start).from;
  let to = doc.line(b.end).to;
  if (b.end < doc.lines) to += 1;
  else if (b.start > 1) from -= 1;
  view.dispatch({ changes: { from, to }, userEvent: 'delete.block' });
  return true;
}

/** Ctrl+Alt+1..3 etc. */
const typeKey = (type: BlockType): Command => (view) => setBlockType(view, type);

export const formatKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: (v) => toggleMark(v, 'bold') },
  { key: 'Mod-i', run: (v) => toggleMark(v, 'italic') },
  { key: 'Mod-Shift-x', run: (v) => toggleMark(v, 'strike') },
  { key: 'Mod-Shift-s', run: (v) => toggleMark(v, 'strike') },
  { key: 'Mod-e', run: (v) => toggleMark(v, 'code') },
  { key: 'Mod-Shift-h', run: (v) => toggleMark(v, 'highlight') },
  { key: 'Mod-Shift-m', run: (v) => toggleMark(v, 'math') },
  { key: 'Mod-k', run: (v) => (v.state.selection.main.empty ? false : insertLink(v)) },
  { key: 'Mod-Shift-k', run: insertWikiLink },
  { key: 'Mod-Enter', run: toggleTask },
  { key: 'Mod-Alt-0', run: typeKey('p') },
  { key: 'Mod-Alt-1', run: typeKey('h1') },
  { key: 'Mod-Alt-2', run: typeKey('h2') },
  { key: 'Mod-Alt-3', run: typeKey('h3') },
  { key: 'Mod-Alt-4', run: typeKey('task') },
  { key: 'Mod-Alt-5', run: typeKey('ul') },
  { key: 'Mod-Alt-6', run: typeKey('ol') },
  { key: 'Mod-Alt-7', run: typeKey('toggle') },
  { key: 'Mod-Alt-8', run: typeKey('code') },
  { key: 'Mod-Alt-9', run: typeKey('quote') },
  { key: 'Mod-Shift-7', run: typeKey('ol') },
  { key: 'Mod-Shift-8', run: typeKey('ul') },
  { key: 'Mod-Shift-9', run: typeKey('task') },
  { key: 'Mod-d', run: (v) => duplicateBlock(v) },
  { key: 'Alt-ArrowUp', run: (v) => moveBlock(v, -1) },
  { key: 'Alt-ArrowDown', run: (v) => moveBlock(v, 1) },
  { key: 'Mod-Shift-ArrowUp', run: (v) => moveBlock(v, -1) },
  { key: 'Mod-Shift-ArrowDown', run: (v) => moveBlock(v, 1) },
];
