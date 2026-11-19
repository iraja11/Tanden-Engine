import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { styleAt, styleEdit, type StylePatch, type TextStyle } from '@tanden/core';
import { showPopover } from './menu';

/*
 * Cor, tamanho e fonte do trecho selecionado (painel "Aa" da barra de seleção).
 * Grava <span style="…"> no .md, que o Obsidian também mostra.
 */

export const COLORS: Array<[string, string]> = [
  ['Vermelho', '#e5484d'], ['Laranja', '#f76b15'], ['Amarelo', '#e2a336'], ['Verde', '#46a758'],
  ['Azul', '#0090ff'], ['Roxo', '#8e4ec6'], ['Rosa', '#d6409f'], ['Cinza', '#8b8d98'],
];
export const SIZES: Array<[string, string | null]> = [['P', '0.85em'], ['Normal', null], ['G', '1.25em'], ['GG', '1.6em']];
export const FONTS: Array<[string, string | null, string]> = [
  ['Padrão', null, 'var(--f-body)'], ['Serifa', 'serif', 'serif'], ['Mono', 'monospace', 'monospace'], ['Manuscrita', 'cursive', 'cursive'],
];

/** Aplica o estilo em cada trecho selecionado. */
export function applyTextStyle(view: EditorView, patch: StylePatch): void {
  const text = view.state.doc.toString();
  // de trás para frente: as posições de antes continuam valendo
  const ranges = view.state.selection.ranges.filter((r) => !r.empty).sort((a, b) => b.from - a.from);
  if (!ranges.length) return;
  const edits = ranges.map((r) => styleEdit(text, r.from, r.to, patch));
  let shift = 0;
  const sel = [...edits].reverse().map((e) => {
    const s = EditorSelection.range(e.anchor + shift, e.head + shift);
    shift += e.insert.length - (e.to - e.from);
    return s;
  });
  view.dispatch({
    changes: edits.map((e) => ({ from: e.from, to: e.to, insert: e.insert })),
    selection: EditorSelection.create(sel),
    userEvent: 'input.format',
  });
}

function current(view: EditorView): TextStyle {
  const r = view.state.selection.main;
  return styleAt(view.state.doc.toString(), r.from, r.to);
}

/** Abre o painel de cor, tamanho e fonte perto de `at`. */
export function showStylePanel(view: EditorView, at: { x: number; y: number }): void {
  showPopover(at, (close) => {
    const cur = current(view);
    const root = document.createElement('div');
    root.className = 'tdn-style';
    const section = (title: string) => {
      const t = document.createElement('div');
      t.className = 'tdn-menu-title';
      t.textContent = title;
      root.append(t);
      const row = document.createElement('div');
      row.className = 'row';
      root.append(row);
      return row;
    };
    const button = (row: HTMLElement, label: string, title: string, on: boolean, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      if (on) b.classList.add('on');
      b.addEventListener('click', () => {
        run();
        view.focus();
        close();
      });
      row.append(b);
      return b;
    };

    const colors = section('Cor');
    for (const [name, hex] of COLORS) {
      const b = button(colors, '', name, cur.color === hex, () => applyTextStyle(view, { color: hex }));
      b.className = `sw${cur.color === hex ? ' on' : ''}`;
      b.style.setProperty('--c', hex);
    }
    const none = button(colors, '∅', 'Sem cor', !cur.color, () => applyTextStyle(view, { color: null }));
    none.classList.add('sw', 'none');

    const sizes = section('Tamanho');
    for (const [label, v] of SIZES) {
      const b = button(sizes, label, v ? `Tamanho ${v}` : 'Tamanho normal', (cur.size ?? null) === v, () => applyTextStyle(view, { size: v }));
      if (v) b.style.fontSize = `calc(13px * ${parseFloat(v)})`;
    }

    const fonts = section('Fonte');
    for (const [label, v, family] of FONTS) {
      const b = button(fonts, label, `Fonte ${label.toLowerCase()}`, (cur.font ?? null) === v, () => applyTextStyle(view, { font: v }));
      b.style.fontFamily = family;
    }

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'clear';
    clear.textContent = 'Limpar estilo';
    clear.addEventListener('click', () => {
      applyTextStyle(view, { color: null, size: null, font: null });
      view.focus();
      close();
    });
    root.append(clear);
    return root;
  });
}
