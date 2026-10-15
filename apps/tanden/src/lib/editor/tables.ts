import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateField, type EditorState, type Range } from '@codemirror/state';
import { parseBlocks } from './blocks';
import { renderInline } from './inline';

/*
 * Tabelas Markdown viram uma grade editável, como no Notion: clica na célula e
 * digita; Tab anda, Enter desce (e cria linha no fim), clique direito abre o
 * menu de linhas e colunas. O arquivo continua sendo uma tabela | a | b |.
 */

type Align = '' | 'left' | 'center' | 'right';
export interface TableData {
  rows: string[][];
  align: Align[];
}

const splitRow = (line: string): string[] => {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === '\\' && t[i + 1] === '|') {
      cur += '\\|';
      i++;
    } else if (c === '|') {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'));
};

export function parseTable(lines: string[]): TableData {
  const head = splitRow(lines[0]!);
  const align = splitRow(lines[1] ?? '').map((c): Align => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : ''));
  const body = lines.slice(2).map(splitRow);
  const width = Math.max(head.length, ...body.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill('')].slice(0, width);
  return { rows: [pad(head), ...body.map(pad)], align: pad(align as string[]) as Align[] };
}

/** Tabela alinhada em colunas, legível no Obsidian e em qualquer editor. */
export function serializeTable(t: TableData): string {
  const cols = t.rows[0]?.length ?? 0;
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const w = Array.from({ length: cols }, (_, c) => Math.max(3, ...t.rows.map((r) => [...cell(r[c] ?? '')].length)));
  const line = (r: string[]) => `| ${r.map((x, c) => cell(x ?? '').padEnd(w[c]!)).join(' | ')} |`;
  const sep = `| ${w.map((n, c) => {
    const a = t.align[c] ?? '';
    const d = '-'.repeat(Math.max(1, n - (a === 'center' ? 2 : a ? 1 : 0)));
    return a === 'center' ? `:${d}:` : a === 'right' ? `${d}:` : a === 'left' ? `:${d}` : d;
  }).join(' | ')} |`;
  return [line(t.rows[0]!), sep, ...t.rows.slice(1).map(line)].join('\n');
}

export function emptyTable(cols = 3, rows = 2): string {
  return serializeTable({ rows: Array.from({ length: rows + 1 }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? `Coluna ${c + 1}` : ''))), align: [] });
}

const doms = new WeakMap<HTMLElement, TableView>();

class TableView {
  dom: HTMLElement;
  table: HTMLTableElement;
  data: TableData;
  timer = 0;
  menu: HTMLElement | null = null;
  constructor(public view: EditorView, data: TableData) {
    this.data = structuredClone(data);
    this.dom = document.createElement('div');
    this.dom.className = 'cm-table-wrap';
    this.dom.contentEditable = 'false';
    this.table = document.createElement('table');
    this.table.className = 'cm-table';
    const scroller = document.createElement('div');
    scroller.className = 'cm-table-scroll';
    scroller.append(this.table);
    const addRow = document.createElement('button');
    addRow.className = 'cm-table-add row';
    addRow.title = 'Nova linha';
    addRow.textContent = '+';
    addRow.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.insertRow(this.data.rows.length);
    });
    const addCol = document.createElement('button');
    addCol.className = 'cm-table-add col';
    addCol.title = 'Nova coluna';
    addCol.textContent = '+';
    addCol.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.insertCol(this.data.rows[0]!.length);
    });
    this.dom.append(scroller, addCol, addRow);
    this.render();
    this.dom.addEventListener('keydown', (e) => this.onKey(e));
    this.dom.addEventListener('contextmenu', (e) => this.onMenu(e));
    doms.set(this.dom, this);
  }

  cellAt(r: number, c: number): HTMLElement | null {
    return this.table.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  }

  render(): void {
    const focus = this.focused();
    this.table.textContent = '';
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    this.data.rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((text, c) => {
        const td = document.createElement(r === 0 ? 'th' : 'td');
        td.dataset.r = String(r);
        td.dataset.c = String(c);
        td.contentEditable = 'true';
        td.spellcheck = true;
        if (this.data.align[c]) td.style.textAlign = this.data.align[c]!;
        this.paint(td, text);
        td.addEventListener('focus', () => {
          td.classList.add('editing');
          td.textContent = this.data.rows[r]![c]!;
          placeEnd(td);
        });
        td.addEventListener('blur', () => {
          td.classList.remove('editing');
          this.paint(td, this.data.rows[r]![c]!);
          this.flush();
        });
        td.addEventListener('input', () => {
          this.data.rows[r]![c] = td.innerText.replace(/\n+$/, '').replace(/\n/g, '<br>');
          this.schedule();
        });
        td.addEventListener('paste', (e) => {
          e.preventDefault();
          const t = e.clipboardData?.getData('text/plain') ?? '';
          document.execCommand('insertText', false, t.replace(/\r?\n/g, ' '));
        });
        tr.append(td);
      });
      (r === 0 ? thead : tbody).append(tr);
    });
    this.table.append(thead, tbody);
    if (focus) this.cellAt(focus.r, focus.c)?.focus();
  }

  paint(td: HTMLElement, text: string): void {
    if (td.classList.contains('editing')) return;
    td.innerHTML = text ? renderInline(text) : '';
  }

  focused(): { r: number; c: number } | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !this.table.contains(a) || a.dataset.r === undefined) return null;
    return { r: Number(a.dataset.r), c: Number(a.dataset.c) };
  }

  /** chegou versão nova do texto (desfazer, outro aparelho): atualiza sem tirar o foco */
  update(data: TableData): void {
    const same = data.rows.length === this.data.rows.length && data.rows[0]!.length === this.data.rows[0]!.length && data.align.join() === this.data.align.join();
    const f = this.focused();
    this.data = structuredClone(data);
    if (!same) return this.render();
    data.rows.forEach((row, r) =>
      row.forEach((text, c) => {
        const td = this.cellAt(r, c);
        if (!td || (f && f.r === r && f.c === c)) return;
        this.paint(td, text);
      }),
    );
  }

  range(): { from: number; to: number } | null {
    let pos: number;
    try {
      pos = this.view.posAtDOM(this.dom);
    } catch {
      return null;
    }
    const doc = this.view.state.doc;
    const n = doc.lineAt(pos).number;
    const b = parseBlocks(doc).find((x) => x.kind === 'table' && x.start <= n && x.end >= n);
    return b ? { from: doc.line(b.start).from, to: doc.line(b.end).to } : null;
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), 300);
  }

  flush(): void {
    clearTimeout(this.timer);
    const r = this.range();
    if (!r) return;
    const text = serializeTable(this.data);
    if (this.view.state.doc.sliceString(r.from, r.to) === text) return;
    this.view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, userEvent: 'input.table' });
  }

  move(r: number, c: number): void {
    const rows = this.data.rows.length;
    const cols = this.data.rows[0]!.length;
    if (c >= cols) {
      r++;
      c = 0;
    }
    if (c < 0) {
      r--;
      c = cols - 1;
    }
    if (r >= rows) {
      this.insertRow(rows, c);
      return;
    }
    if (r < 0) return this.leave(-1);
    this.cellAt(r, c)?.focus();
  }

  leave(dir: 1 | -1): void {
    this.flush();
    const r = this.range();
    (document.activeElement as HTMLElement | null)?.blur();
    if (!r) return;
    const doc = this.view.state.doc;
    let pos: number;
    if (dir > 0) {
      const last = doc.lineAt(r.to);
      if (last.number === doc.lines) {
        this.view.dispatch({ changes: { from: r.to, insert: '\n' }, selection: { anchor: r.to + 1 } });
        this.view.focus();
        return;
      }
      pos = doc.line(last.number + 1).from;
    } else {
      const first = doc.lineAt(r.from);
      if (first.number === 1) {
        this.view.dispatch({ changes: { from: 0, insert: '\n' }, selection: { anchor: 0 } });
        this.view.focus();
        return;
      }
      pos = doc.line(first.number - 1).to;
    }
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.view.focus();
  }

  onKey(e: KeyboardEvent): void {
    const f = this.focused();
    if (!f) return;
    const td = this.cellAt(f.r, f.c)!;
    if (e.key === 'Tab') {
      e.preventDefault();
      this.move(f.r, f.c + (e.shiftKey ? -1 : 1));
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.move(f.r + 1, f.c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.leave(1);
    } else if (e.key === 'ArrowUp' && atEdge(td, 'start')) {
      e.preventDefault();
      if (f.r === 0) this.leave(-1);
      else this.cellAt(f.r - 1, f.c)?.focus();
    } else if (e.key === 'ArrowDown' && atEdge(td, 'end')) {
      e.preventDefault();
      if (f.r === this.data.rows.length - 1) this.leave(1);
      else this.cellAt(f.r + 1, f.c)?.focus();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) {
      // desfazer fica com o editor, que guarda o histórico da nota
      e.preventDefault();
      this.flush();
      this.view.focus();
    }
    e.stopPropagation();
  }

  insertRow(at: number, focusCol = 0): void {
    const cols = this.data.rows[0]!.length;
    this.data.rows.splice(Math.max(1, at), 0, Array(cols).fill(''));
    this.render();
    this.flush();
    this.cellAt(Math.max(1, at), focusCol)?.focus();
  }

  insertCol(at: number): void {
    this.data.rows.forEach((r, i) => r.splice(at, 0, i === 0 ? `Coluna ${this.data.rows[0]!.length + 1}` : ''));
    this.data.align.splice(at, 0, '');
    this.render();
    this.flush();
    this.cellAt(0, at)?.focus();
  }

  closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }

  onMenu(e: MouseEvent): void {
    const td = (e.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
    if (!td) return;
    e.preventDefault();
    this.closeMenu();
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const items: Array<[string, () => void] | null> = [
      ['Inserir linha acima', () => this.insertRow(r)],
      ['Inserir linha abaixo', () => this.insertRow(r + 1)],
      ['Inserir coluna à esquerda', () => this.insertCol(c)],
      ['Inserir coluna à direita', () => this.insertCol(c + 1)],
      null,
      ['Alinhar à esquerda', () => this.setAlign(c, 'left')],
      ['Centralizar', () => this.setAlign(c, 'center')],
      ['Alinhar à direita', () => this.setAlign(c, 'right')],
      ['Ordenar A → Z por esta coluna', () => this.sort(c, 1)],
      ['Ordenar Z → A por esta coluna', () => this.sort(c, -1)],
      null,
      ...(r > 0 ? [['Apagar linha', () => this.removeRow(r)] as [string, () => void]] : []),
      ...(this.data.rows[0]!.length > 1 ? [['Apagar coluna', () => this.removeCol(c)] as [string, () => void]] : []),
      ['Editar como Markdown', () => this.editSource()],
    ];
    const m = document.createElement('div');
    m.className = 'cm-menu';
    for (const it of items) {
      if (!it) {
        m.append(Object.assign(document.createElement('hr'), {}));
        continue;
      }
      const b = document.createElement('button');
      b.textContent = it[0];
      b.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.closeMenu();
        it[1]();
      });
      m.append(b);
    }
    const box = this.dom.getBoundingClientRect();
    m.style.left = `${e.clientX - box.left}px`;
    m.style.top = `${e.clientY - box.top}px`;
    this.dom.append(m);
    const off = (ev: Event) => {
      if (!m.contains(ev.target as Node)) {
        this.closeMenu();
        removeEventListener('pointerdown', off, true);
      }
    };
    addEventListener('pointerdown', off, true);
  }

  setAlign(c: number, a: Align): void {
    this.data.align[c] = this.data.align[c] === a ? '' : a;
    this.render();
    this.flush();
  }

  sort(c: number, dir: 1 | -1): void {
    const [head, ...body] = this.data.rows;
    const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
    body.sort((a, b) => {
      const x = a[c] ?? '';
      const y = b[c] ?? '';
      const nx = num(x);
      const ny = num(y);
      if (x && y && !Number.isNaN(nx) && !Number.isNaN(ny)) return (nx - ny) * dir;
      return x.localeCompare(y, 'pt-BR', { numeric: true }) * dir;
    });
    this.data.rows = [head!, ...body];
    this.render();
    this.flush();
  }

  removeRow(r: number): void {
    this.data.rows.splice(r, 1);
    if (this.data.rows.length === 1) this.data.rows.push(Array(this.data.rows[0]!.length).fill(''));
    this.render();
    this.flush();
  }

  removeCol(c: number): void {
    this.data.rows.forEach((r) => r.splice(c, 1));
    this.data.align.splice(c, 1);
    this.render();
    this.flush();
  }

  editSource(): void {
    const r = this.range();
    if (!r) return;
    this.view.dispatch({ selection: { anchor: this.view.state.doc.lineAt(r.from).to } });
    this.view.focus();
  }
}

function placeEnd(el: HTMLElement): void {
  const s = getSelection();
  if (!s) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  s.removeAllRanges();
  s.addRange(r);
}

/** O cursor está na primeira (ou última) linha visual da célula? */
function atEdge(el: HTMLElement, edge: 'start' | 'end'): boolean {
  const s = getSelection();
  if (!s || !s.rangeCount || !s.isCollapsed) return false;
  const rect = s.getRangeAt(0).getBoundingClientRect();
  const box = el.getBoundingClientRect();
  if (!rect.height) return true; // célula vazia
  return edge === 'start' ? rect.top - box.top < 20 : box.bottom - rect.bottom < 20;
}

class TableWidget extends WidgetType {
  constructor(readonly data: TableData, readonly text: string) {
    super();
  }
  eq(o: TableWidget) {
    return o.text === this.text;
  }
  toDOM(view: EditorView) {
    return new TableView(view, this.data).dom;
  }
  updateDOM(dom: HTMLElement) {
    const tv = doms.get(dom);
    if (!tv) return false;
    tv.update(this.data);
    return true;
  }
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return 36 * this.data.rows.length + 12;
  }
}

function build(state: EditorState): DecorationSet {
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  for (const b of parseBlocks(doc)) {
    if (b.kind !== 'table') continue;
    const from = doc.line(b.start).from;
    const to = doc.line(b.end).to;
    // o cursor parado na borda (antes ou depois) não abre o texto
    const inside = state.selection.ranges.some((r) => r.to > from && r.from < to && !(r.empty && (r.head === from || r.head === to)));
    if (inside) {
      for (let i = b.start; i <= b.end; i++) out.push(Decoration.line({ class: 'cm-table-src' }).range(doc.line(i).from));
      continue;
    }
    const lines: string[] = [];
    for (let i = b.start; i <= b.end; i++) lines.push(doc.line(i).text);
    const text = lines.join('\n');
    out.push(Decoration.replace({ widget: new TableWidget(parseTable(lines), text), block: true }).range(from, to));
  }
  return Decoration.set(out, true);
}

export const tables = StateField.define<DecorationSet>({
  create: build,
  update: (v, tr) => (tr.docChanged || tr.selection ? build(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});
