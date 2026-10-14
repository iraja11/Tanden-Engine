import * as Y from 'yjs';
import { cellKey, parseKey, type Rect } from './address';
import { Calculator } from './calc';
import { shiftFormula } from './formula';
import { formatValue, isDateFormat, parseInput, type Scalar } from './values';

/*
 * Pasta de trabalho guardada num documento Yjs. Cada célula é uma entrada de
 * mapa (o que foi digitado, texto cru); duas pessoas editando células
 * diferentes nunca conflitam, e na mesma célula vence a última edição.
 *
 * Tudo fica em tipos de topo do documento (nunca mapas dentro de mapas), porque
 * dois aparelhos criando o mesmo mapa aninhado ao mesmo tempo perderiam um deles.
 *
 *   order            Y.Array<string>        ids das abas, em ordem
 *   sheet:<id>       Y.Map                  name, w:<coluna> = largura em px
 *   cells:<id>       Y.Map<string>          "A1" → "=SOMA(B1:B3)"
 *   fmt:<id>         Y.Map<CellFormat>      "A1" → { b: true, nf: "0%" }
 *   charts           Y.Map<ChartSpec>       id → gráfico
 */

export interface CellFormat {
  /** negrito */
  b?: true;
  /** itálico */
  i?: true;
  al?: 'l' | 'c' | 'r';
  /** código de formato de número do Excel: "0.00", "0%", "dd/mm/yyyy" */
  nf?: string;
}

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'scatter';

export interface ChartSpec {
  id: string;
  sheet: string;
  /** intervalo de dados, ex. "A1:C13" */
  range: string;
  type: ChartType;
  title?: string;
  /** séries em colunas (padrão) ou em linhas */
  byRow?: boolean;
  stacked?: boolean;
}

export interface SheetInfo {
  id: string;
  name: string;
}

export const DEFAULT_COL_WIDTH = 100;
const LOCAL = 'local';

const newId = (): string => Math.random().toString(36).slice(2, 10);

export class Workbook {
  readonly calc: Calculator;
  readonly undo: Y.UndoManager;
  private boundsCache = new Map<string, { rows: number; cols: number }>();
  private listeners = new Set<(origin: unknown) => void>();

  constructor(readonly doc: Y.Doc = new Y.Doc({ gc: false })) {
    this.calc = new Calculator({
      sheetId: (name) => this.sheets().find((s) => s.name.toLowerCase() === name.toLowerCase())?.id ?? null,
      raw: (sheet, r, c) => this.cellsOf(sheet).get(cellKey(r, c)),
      bounds: (sheet) => this.bounds(sheet),
    });
    this.undo = new Y.UndoManager([this.order, this.charts], { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 });
    for (const s of this.sheets()) this.track(s.id);
    doc.on('afterTransaction', (tr: Y.Transaction) => {
      if (tr.changed.size === 0) return;
      this.boundsCache.clear();
      this.calc.invalidate();
      // aba criada por outro aparelho: passa a valer para desfazer também
      for (const s of this.sheets()) this.track(s.id);
      this.listeners.forEach((fn) => fn(tr.origin));
    });
  }

  /** Pasta nova, com uma aba vazia. */
  static create(doc?: Y.Doc): Workbook {
    const wb = new Workbook(doc);
    wb.doc.transact(() => wb.addSheet('Planilha1'), 'init');
    return wb;
  }

  private get order(): Y.Array<string> {
    return this.doc.getArray<string>('order');
  }
  private get charts(): Y.Map<ChartSpec> {
    return this.doc.getMap<ChartSpec>('charts');
  }
  private propsOf(id: string): Y.Map<unknown> {
    return this.doc.getMap(`sheet:${id}`);
  }
  private cellsOf(id: string): Y.Map<string> {
    return this.doc.getMap<string>(`cells:${id}`);
  }
  private fmtOf(id: string): Y.Map<CellFormat> {
    return this.doc.getMap<CellFormat>(`fmt:${id}`);
  }

  private tracked = new Set<string>();
  private track(id: string): void {
    if (this.tracked.has(id)) return;
    this.tracked.add(id);
    this.undo.addToScope([this.propsOf(id), this.cellsOf(id), this.fmtOf(id)]);
  }

  /** Avisa a cada mudança (local, de outro aparelho ou de importação). */
  onChange(fn: (origin: unknown) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  transact(fn: () => void): void {
    this.doc.transact(fn, LOCAL);
  }

  // --- abas -----------------------------------------------------------------

  sheets(): SheetInfo[] {
    const seen = new Set<string>();
    const out: SheetInfo[] = [];
    // dois aparelhos podem inserir o mesmo id (importação externa idêntica)
    for (const id of this.order.toArray()) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: String(this.propsOf(id).get('name') ?? id) });
    }
    return out;
  }

  addSheet(name?: string, id = newId()): string {
    const names = new Set(this.sheets().map((s) => s.name.toLowerCase()));
    let n = name ?? `Planilha${this.sheets().length + 1}`;
    for (let k = 2; names.has(n.toLowerCase()); k++) n = `${name ?? 'Planilha'}${name ? ` ${k}` : k}`;
    this.track(id);
    this.transact(() => {
      this.propsOf(id).set('name', n);
      this.order.push([id]);
    });
    return id;
  }

  renameSheet(id: string, name: string): void {
    const clean = name.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31);
    if (!clean || this.sheets().some((s) => s.id !== id && s.name.toLowerCase() === clean.toLowerCase())) return;
    this.transact(() => this.propsOf(id).set('name', clean));
  }

  removeSheet(id: string): void {
    if (this.sheets().length <= 1) return;
    this.transact(() => {
      const arr = this.order.toArray();
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] === id) this.order.delete(i, 1);
      this.cellsOf(id).clear();
      this.fmtOf(id).clear();
      for (const c of this.charts.values()) if (c.sheet === id) this.charts.delete(c.id);
    });
  }

  moveSheet(id: string, to: number): void {
    const arr = this.order.toArray();
    const from = arr.indexOf(id);
    if (from < 0 || from === to) return;
    this.transact(() => {
      this.order.delete(from, 1);
      this.order.insert(Math.min(to, this.order.length), [id]);
    });
  }

  // --- células ----------------------------------------------------------------

  raw(sheet: string, r: number, c: number): string {
    return this.cellsOf(sheet).get(cellKey(r, c)) ?? '';
  }

  /** Grava o que foi digitado. Se for "10%" ou uma data, sugere o formato. */
  set(sheet: string, r: number, c: number, raw: string): void {
    this.transact(() => this.setInTx(sheet, r, c, raw));
  }

  private setInTx(sheet: string, r: number, c: number, raw: string): void {
    const k = cellKey(r, c);
    const cells = this.cellsOf(sheet);
    if (raw === '') {
      if (cells.has(k)) cells.delete(k);
      return;
    }
    if (cells.get(k) !== raw) cells.set(k, raw);
    const p = parseInput(raw);
    const f = this.fmtOf(sheet).get(k);
    if (p.nf && !f?.nf) this.fmtOf(sheet).set(k, { ...f, nf: p.nf });
  }

  /** Várias células de uma vez (colar, importar). Um só passo de desfazer. */
  setMany(sheet: string, entries: Array<{ r: number; c: number; raw: string }>): void {
    this.transact(() => {
      for (const e of entries) this.setInTx(sheet, e.r, e.c, e.raw);
    });
  }

  clear(sheet: string, rect: Rect): void {
    this.transact(() => {
      for (const k of [...this.cellsOf(sheet).keys()]) {
        const p = parseKey(k);
        if (p && p.r >= rect.r0 && p.r <= rect.r1 && p.c >= rect.c0 && p.c <= rect.c1) this.cellsOf(sheet).delete(k);
      }
    });
  }

  /** Todas as células preenchidas da aba (para exportar e copiar). */
  entries(sheet: string): Array<{ r: number; c: number; raw: string }> {
    const out: Array<{ r: number; c: number; raw: string }> = [];
    for (const [k, raw] of this.cellsOf(sheet)) {
      const p = parseKey(k);
      if (p && raw !== '') out.push({ ...p, raw });
    }
    return out.sort((a, b) => a.r - b.r || a.c - b.c);
  }

  /**
   * Copia um bloco para outro lugar, deslocando as referências relativas
   * (o mesmo que copiar e colar no Excel). O destino é preenchido repetindo o
   * bloco, como Ctrl+D / Ctrl+R.
   */
  fill(sheet: string, from: Rect, to: Rect): void {
    const h = from.r1 - from.r0 + 1;
    const w = from.c1 - from.c0 + 1;
    const out: Array<{ r: number; c: number; raw: string }> = [];
    for (let r = to.r0; r <= to.r1; r++) {
      for (let c = to.c0; c <= to.c1; c++) {
        const sr = from.r0 + ((((r - from.r0) % h) + h) % h);
        const sc = from.c0 + ((((c - from.c0) % w) + w) % w);
        if (sr === r && sc === c) continue;
        out.push({ r, c, raw: shiftFormula(this.raw(sheet, sr, sc), r - sr, c - sc) });
      }
    }
    this.transact(() => {
      for (const e of out) this.setInTx(sheet, e.r, e.c, e.raw);
      for (const e of out) {
        const sr = from.r0 + ((((e.r - from.r0) % h) + h) % h);
        const sc = from.c0 + ((((e.c - from.c0) % w) + w) % w);
        const f = this.format(sheet, sr, sc);
        if (Object.keys(f).length) this.fmtOf(sheet).set(cellKey(e.r, e.c), f);
      }
    });
  }

  /** Linhas e colunas usadas. */
  bounds(sheet: string): { rows: number; cols: number } {
    let b = this.boundsCache.get(sheet);
    if (!b) {
      b = { rows: 0, cols: 0 };
      for (const k of this.cellsOf(sheet).keys()) {
        const p = parseKey(k);
        if (!p) continue;
        if (p.r + 1 > b.rows) b.rows = p.r + 1;
        if (p.c + 1 > b.cols) b.cols = p.c + 1;
      }
      this.boundsCache.set(sheet, b);
    }
    return b;
  }

  value(sheet: string, r: number, c: number): Scalar {
    return this.calc.value(sheet, r, c);
  }

  /** Texto que a célula mostra, já formatado. */
  display(sheet: string, r: number, c: number): string {
    const v = this.value(sheet, r, c);
    return formatValue(v, this.format(sheet, r, c).nf);
  }

  // --- formato --------------------------------------------------------------

  format(sheet: string, r: number, c: number): CellFormat {
    return this.fmtOf(sheet).get(cellKey(r, c)) ?? {};
  }

  /** Aplica (ou tira, com undefined) uma propriedade de formato em todo o retângulo. */
  setFormat<K extends keyof CellFormat>(sheet: string, rect: Rect, prop: K, value: CellFormat[K] | undefined): void {
    this.transact(() => {
      const map = this.fmtOf(sheet);
      for (let r = rect.r0; r <= rect.r1; r++) {
        for (let c = rect.c0; c <= rect.c1; c++) {
          const k = cellKey(r, c);
          const next: CellFormat = { ...map.get(k) };
          if (value === undefined) delete next[prop];
          else next[prop] = value;
          if (Object.keys(next).length) map.set(k, next);
          else if (map.has(k)) map.delete(k);
        }
      }
    });
  }

  formatEntries(sheet: string): Array<{ r: number; c: number; f: CellFormat }> {
    const out: Array<{ r: number; c: number; f: CellFormat }> = [];
    for (const [k, f] of this.fmtOf(sheet)) {
      const p = parseKey(k);
      if (p) out.push({ ...p, f });
    }
    return out;
  }

  isDate(sheet: string, r: number, c: number): boolean {
    return isDateFormat(this.format(sheet, r, c).nf);
  }

  colWidth(sheet: string, c: number): number {
    const w = this.propsOf(sheet).get(`w:${c}`);
    return typeof w === 'number' ? w : DEFAULT_COL_WIDTH;
  }

  setColWidth(sheet: string, c: number, px: number): void {
    this.transact(() => this.propsOf(sheet).set(`w:${c}`, Math.max(24, Math.min(800, Math.round(px)))));
  }

  colWidths(sheet: string): Map<number, number> {
    const out = new Map<number, number>();
    for (const [k, w] of this.propsOf(sheet)) if (k.startsWith('w:') && typeof w === 'number') out.set(Number(k.slice(2)), w);
    return out;
  }

  // --- gráficos -------------------------------------------------------------

  chartList(sheet?: string): ChartSpec[] {
    const all = [...this.charts.values()].filter((c) => this.order.toArray().includes(c.sheet));
    return (sheet ? all.filter((c) => c.sheet === sheet) : all).sort((a, b) => a.id.localeCompare(b.id));
  }

  addChart(spec: Omit<ChartSpec, 'id'>): string {
    const id = `${Date.now().toString(36)}${newId().slice(0, 4)}`;
    this.transact(() => this.charts.set(id, { ...spec, id }));
    return id;
  }

  updateChart(id: string, patch: Partial<Omit<ChartSpec, 'id'>>): void {
    const c = this.charts.get(id);
    if (c) this.transact(() => this.charts.set(id, { ...c, ...patch }));
  }

  removeChart(id: string): void {
    this.transact(() => this.charts.delete(id));
  }
}
