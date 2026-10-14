import {
  FUNCTIONS, cellKey, parseCsv, rectKey, shiftFormula, suggest, type CellFormat, type ChartType, type FnDef,
  type Rect, type Workbook,
} from '@tanden/core';

/*
 * Controle de uma planilha aberta: seleção, edição, área de transferência,
 * preenchimento e o autocompletar de fórmulas. A grade e a barra de fórmulas
 * são só desenho em cima disto.
 */

export interface Sel {
  ar: number;
  ac: number;
  fr: number;
  fc: number;
}

export interface Edit {
  r: number;
  c: number;
  text: string;
  /** 'enter': começou digitando (setas confirmam); 'edit': F2/duplo clique (setas andam no texto) */
  mode: 'enter' | 'edit';
}

interface Clip {
  tsv: string;
  cells: Array<{ dr: number; dc: number; raw: string; fmt: CellFormat }>;
  h: number;
  w: number;
  r0: number;
  c0: number;
  cut: { wb: Workbook; sheet: string; rect: Rect } | null;
}

const REF_BEFORE = /[=(;,+\-*/^&<>:\s]$/;

export class SheetCtl {
  wb = $state.raw<Workbook | null>(null);
  sheet = $state('');
  sel = $state<Sel>({ ar: 0, ac: 0, fr: 0, fc: 0 });
  edit = $state<Edit | null>(null);
  /** posição do cursor no texto em edição */
  caret = $state(0);
  /** sugestão destacada no autocompletar */
  pick = $state(0);
  /** trecho da fórmula que veio de clicar numa célula (arrastar substitui) */
  private refSpan: { start: number; end: number; ar: number; ac: number } | null = null;
  private clip: Clip | null = null;
  /** o input em edição pede foco de volta depois de inserir referência */
  focusTick = $state(0);

  get rect(): Rect {
    const s = this.sel;
    return { r0: Math.min(s.ar, s.fr), c0: Math.min(s.ac, s.fc), r1: Math.max(s.ar, s.fr), c1: Math.max(s.ac, s.fc) };
  }

  get name(): string {
    return rectKey(this.rect);
  }

  /** O que a barra de fórmulas mostra quando não está editando. */
  get rawAtFocus(): string {
    return this.wb ? this.wb.raw(this.sheet, this.sel.fr, this.sel.fc) : '';
  }

  open(wb: Workbook, sheet?: string): void {
    this.wb = wb;
    this.sheet = sheet && wb.sheets().some((s) => s.id === sheet) ? sheet : wb.sheets()[0]!.id;
    this.sel = { ar: 0, ac: 0, fr: 0, fc: 0 };
    this.edit = null;
  }

  setSheet(id: string): void {
    this.commit(0, 0);
    this.sheet = id;
    this.sel = { ar: 0, ac: 0, fr: 0, fc: 0 };
  }

  select(r: number, c: number, extend = false): void {
    r = Math.max(0, r);
    c = Math.max(0, c);
    this.sel = extend ? { ...this.sel, fr: r, fc: c } : { ar: r, ac: c, fr: r, fc: c };
  }

  selectRect(x: Rect): void {
    this.sel = { ar: x.r0, ac: x.c0, fr: x.r1, fc: x.c1 };
  }

  move(dr: number, dc: number, extend = false): void {
    this.select(this.sel.fr + dr, this.sel.fc + dc, extend);
    if (!extend) this.sel = { ...this.sel, ar: this.sel.fr, ac: this.sel.fc };
  }

  /** Ctrl+seta: pula até a borda do bloco de dados, como no Excel. */
  jump(dr: number, dc: number, extend = false): void {
    if (!this.wb) return;
    const filled = (r: number, c: number) => this.wb!.raw(this.sheet, r, c) !== '';
    const b = this.wb.bounds(this.sheet);
    let { fr: r, fc: c } = this.sel;
    const limitR = Math.max(b.rows, r + 1);
    const limitC = Math.max(b.cols, c + 1);
    const inside = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr < limitR && cc < limitC;
    if (!inside(r + dr, c + dc)) return this.select(dr ? (dr < 0 ? 0 : r) : r, dc ? (dc < 0 ? 0 : c) : c, extend);
    const startFilled = filled(r, c) && filled(r + dr, c + dc);
    if (startFilled) {
      while (inside(r + dr, c + dc) && filled(r + dr, c + dc)) [r, c] = [r + dr, c + dc];
    } else {
      [r, c] = [r + dr, c + dc];
      while (inside(r, c) && !filled(r, c) && inside(r + dr, c + dc)) [r, c] = [r + dr, c + dc];
    }
    this.select(r, c, extend);
  }

  selectAll(): void {
    if (!this.wb) return;
    const b = this.wb.bounds(this.sheet);
    this.sel = { ar: 0, ac: 0, fr: Math.max(0, b.rows - 1), fc: Math.max(0, b.cols - 1) };
  }

  // --- edição ---------------------------------------------------------------

  begin(text?: string, mode: Edit['mode'] = text === undefined ? 'edit' : 'enter'): void {
    if (!this.wb) return;
    const { fr: r, fc: c } = this.sel;
    const t = text ?? this.wb.raw(this.sheet, r, c);
    this.edit = { r, c, text: t, mode };
    this.caret = t.length;
    this.refSpan = null;
    this.pick = 0;
  }

  setText(text: string, caret: number): void {
    if (!this.edit) this.begin('', 'edit');
    this.edit = { ...this.edit!, text };
    this.caret = caret;
    this.refSpan = null;
    this.pick = 0;
  }

  /** Confirma a edição e anda (Enter desce, Tab vai para a direita). */
  commit(dr = 1, dc = 0): void {
    const e = this.edit;
    if (!e || !this.wb) return;
    this.edit = null;
    this.refSpan = null;
    let text = e.text;
    // fecha parênteses esquecidos: =SOMA(A1:A3 → =SOMA(A1:A3)
    if (text.startsWith('=')) {
      const open = (text.replace(/"[^"]*"/g, '').match(/\(/g) ?? []).length - (text.replace(/"[^"]*"/g, '').match(/\)/g) ?? []).length;
      if (open > 0) text += ')'.repeat(open);
    }
    if (text !== this.wb.raw(this.sheet, e.r, e.c)) this.wb.set(this.sheet, e.r, e.c, text);
    this.sel = { ar: e.r, ac: e.c, fr: e.r, fc: e.c };
    if (dr || dc) this.move(dr, dc);
  }

  cancel(): void {
    this.edit = null;
    this.refSpan = null;
  }

  /** Em edição de fórmula, clicar numa célula insere a referência. */
  wantsRef(): boolean {
    const e = this.edit;
    if (!e || !e.text.startsWith('=')) return false;
    if (this.refSpan && this.caret === this.refSpan.end) return true;
    return REF_BEFORE.test(e.text.slice(0, this.caret));
  }

  insertRef(r: number, c: number, extend = false): void {
    const e = this.edit;
    if (!e) return;
    let start: number;
    let end: number;
    let ar = r;
    let ac = c;
    if (this.refSpan && (extend || this.caret === this.refSpan.end)) {
      ({ start, end } = this.refSpan);
      if (extend) ({ ar, ac } = this.refSpan);
    } else {
      start = end = this.caret;
    }
    const ref = extend ? rectKey({ r0: Math.min(ar, r), c0: Math.min(ac, c), r1: Math.max(ar, r), c1: Math.max(ac, c) }) : cellKey(r, c);
    const text = e.text.slice(0, start) + ref + e.text.slice(end);
    this.edit = { ...e, text, mode: 'edit' };
    this.caret = start + ref.length;
    this.refSpan = { start, end: start + ref.length, ar, ac };
    this.focusTick++;
  }

  // --- autocompletar --------------------------------------------------------

  /** Nome de função sendo digitado logo antes do cursor. */
  get typing(): { start: number; word: string } | null {
    const e = this.edit;
    if (!e || !e.text.startsWith('=')) return null;
    const before = e.text.slice(0, this.caret);
    if ((before.match(/"/g) ?? []).length % 2) return null;
    const m = /(^|[=(;,+\-*/^&<>\s])([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.]*)$/.exec(before);
    if (!m || /^[A-Za-z]{1,3}\d+$/.test(m[2]!)) return null;
    return { start: before.length - m[2]!.length, word: m[2]! };
  }

  get suggestions(): FnDef[] {
    const t = this.typing;
    return t ? suggest(t.word, 7) : [];
  }

  /** Função cujos parênteses envolvem o cursor, e em qual argumento ele está. */
  get callHelp(): { fn: FnDef; arg: number } | null {
    const e = this.edit;
    if (!e || !e.text.startsWith('=')) return null;
    const before = e.text.slice(0, this.caret);
    const stack: Array<{ name: string; arg: number }> = [];
    let q = false;
    let word = '';
    for (const ch of before) {
      if (ch === '"') q = !q;
      if (q) continue;
      if (ch === '(') {
        stack.push({ name: word, arg: 0 });
        word = '';
      } else if (ch === ')') {
        stack.pop();
        word = '';
      } else if ((ch === ';' || ch === ',') && stack.length) {
        stack[stack.length - 1]!.arg++;
        word = '';
      } else if (/[A-Za-zÀ-ÿ0-9._]/.test(ch)) word += ch;
      else word = '';
    }
    const top = stack[stack.length - 1];
    if (!top) return null;
    const def = suggest(top.name, 1)[0];
    const exact = def && (def.pt.toUpperCase() === top.name.toUpperCase() || def.name === top.name.toUpperCase()) ? def : FUNCTIONS.get(top.name.toUpperCase());
    return exact ? { fn: exact, arg: top.arg } : null;
  }

  accept(fn: FnDef): void {
    const e = this.edit;
    const t = this.typing;
    if (!e || !t) return;
    const name = t.word === t.word.toLowerCase() ? fn.pt.toLowerCase() : fn.pt;
    const after = e.text.slice(this.caret);
    const insert = after.startsWith('(') ? name : `${name}(`;
    const text = e.text.slice(0, t.start) + insert + after;
    this.edit = { ...e, text, mode: 'edit' };
    this.caret = t.start + insert.length + (after.startsWith('(') ? 1 : 0);
    this.pick = 0;
    this.focusTick++;
  }

  /** Teclas comuns aos dois campos de edição (célula e barra de fórmulas). */
  onEditKey(ev: KeyboardEvent): void {
    const sug = this.suggestions;
    if (sug.length && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      ev.preventDefault();
      this.pick = (this.pick + (ev.key === 'ArrowDown' ? 1 : sug.length - 1)) % sug.length;
      return;
    }
    if (sug.length && (ev.key === 'Tab' || (ev.key === 'Enter' && this.typing!.word.length >= 2 && !ev.ctrlKey))) {
      ev.preventDefault();
      this.accept(sug[this.pick] ?? sug[0]!);
      return;
    }
    if (ev.key === 'Enter' && !ev.altKey) {
      ev.preventDefault();
      this.commit(ev.shiftKey ? -1 : 1, 0);
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      this.commit(0, ev.shiftKey ? -1 : 1);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancel();
    } else if (this.edit?.mode === 'enter' && ev.key.startsWith('Arrow') && !ev.shiftKey) {
      if (this.wantsRef()) {
        // seta em fórmula: aponta células, como no Excel
        ev.preventDefault();
        const base = this.refSpan ? { r: this.refSpanCell().r, c: this.refSpanCell().c } : { r: this.edit.r, c: this.edit.c };
        const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[ev.key]!;
        this.insertRef(Math.max(0, base.r + d[0]!), Math.max(0, base.c + d[1]!));
        return;
      }
      ev.preventDefault();
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[ev.key]!;
      this.commit(d[0], d[1]);
    }
  }

  private refSpanCell(): { r: number; c: number } {
    const e = this.edit!;
    const txt = e.text.slice(this.refSpan!.start, this.refSpan!.end);
    const m = /([A-Z]+)(\d+)$/.exec(txt)!;
    let c = 0;
    for (const ch of m[1]!) c = c * 26 + ch.charCodeAt(0) - 64;
    return { r: Number(m[2]) - 1, c: c - 1 };
  }

  // --- ações sobre a seleção ------------------------------------------------

  clear(): void {
    this.wb?.clear(this.sheet, this.rect);
  }

  /** Ctrl+D (para baixo) e Ctrl+R (para a direita). */
  fillFrom(dir: 'down' | 'right'): void {
    if (!this.wb) return;
    const x = this.rect;
    if (dir === 'down') {
      if (x.r0 === x.r1) return;
      this.wb.fill(this.sheet, { ...x, r1: x.r0 }, x);
    } else {
      if (x.c0 === x.c1) return;
      this.wb.fill(this.sheet, { ...x, c1: x.c0 }, x);
    }
  }

  /** Alça de preenchimento: estende a seleção até o alvo. */
  fillTo(target: Rect): void {
    if (!this.wb) return;
    this.wb.fill(this.sheet, this.rect, target);
    this.selectRect(target);
  }

  copy(cut = false): string {
    if (!this.wb) return '';
    const x = this.rect;
    const cells: Clip['cells'] = [];
    const lines: string[] = [];
    for (let r = x.r0; r <= x.r1; r++) {
      const line: string[] = [];
      for (let c = x.c0; c <= x.c1; c++) {
        const raw = this.wb.raw(this.sheet, r, c);
        const fmt = this.wb.format(this.sheet, r, c);
        if (raw || Object.keys(fmt).length) cells.push({ dr: r - x.r0, dc: c - x.c0, raw, fmt });
        const shown = this.wb.display(this.sheet, r, c);
        line.push(/[\t\n"]/.test(shown) ? `"${shown.replace(/"/g, '""')}"` : shown);
      }
      lines.push(line.join('\t'));
    }
    const tsv = lines.join('\n');
    this.clip = { tsv, cells, h: x.r1 - x.r0 + 1, w: x.c1 - x.c0 + 1, r0: x.r0, c0: x.c0, cut: cut ? { wb: this.wb, sheet: this.sheet, rect: x } : null };
    return tsv;
  }

  paste(text: string): void {
    const wb = this.wb;
    if (!wb) return;
    const x = this.rect;
    const clip = this.clip;
    if (clip && text.replace(/\r/g, '') === clip.tsv) {
      // cópia de dentro do Tanden: leva fórmulas (deslocadas) e formato
      const reps = (n: number, size: number) => (n % size === 0 ? n / size : 1);
      const rh = reps(x.r1 - x.r0 + 1, clip.h);
      const rw = reps(x.c1 - x.c0 + 1, clip.w);
      wb.transact(() => {
        if (clip.cut) clip.cut.wb.clear(clip.cut.sheet, clip.cut.rect);
        for (let i = 0; i < rh; i++) {
          for (let j = 0; j < rw; j++) {
            const r0 = x.r0 + i * clip.h;
            const c0 = x.c0 + j * clip.w;
            const out = clip.cells.map((cell) => {
              const r = r0 + cell.dr;
              const c = c0 + cell.dc;
              const raw = clip.cut ? cell.raw : shiftFormula(cell.raw, r - (clip.r0 + cell.dr), c - (clip.c0 + cell.dc));
              return { r, c, raw };
            });
            wb.clear(this.sheet, { r0, c0, r1: r0 + clip.h - 1, c1: c0 + clip.w - 1 });
            wb.setMany(this.sheet, out);
            for (const cell of clip.cells) {
              const rr = { r0: r0 + cell.dr, c0: c0 + cell.dc, r1: r0 + cell.dr, c1: c0 + cell.dc };
              for (const p of ['b', 'i', 'al', 'nf'] as const) wb.setFormat(this.sheet, rr, p, cell.fmt[p]);
            }
          }
        }
      });
      this.selectRect({ r0: x.r0, c0: x.c0, r1: x.r0 + clip.h * rh - 1, c1: x.c0 + clip.w * rw - 1 });
      if (clip.cut) this.clip = null;
      return;
    }
    // texto de fora (Sheets, Excel, um site): tabela separada por tab
    const rows = text.includes('\t') || text.includes('\n') ? parseCsv(text.replace(/\n$/, ''), '\t') : [[text]];
    const out: Array<{ r: number; c: number; raw: string }> = [];
    rows.forEach((row, i) => row.forEach((v, j) => out.push({ r: x.r0 + i, c: x.c0 + j, raw: v.trim() === '' ? '' : v })));
    wb.setMany(this.sheet, out);
    const w = Math.max(...rows.map((r) => r.length));
    this.selectRect({ r0: x.r0, c0: x.c0, r1: x.r0 + rows.length - 1, c1: x.c0 + w - 1 });
  }

  toggle(prop: 'b' | 'i'): void {
    if (!this.wb) return;
    const on = !this.wb.format(this.sheet, this.sel.fr, this.sel.fc)[prop];
    this.wb.setFormat(this.sheet, this.rect, prop, on ? true : undefined);
  }

  align(al: CellFormat['al'] | undefined): void {
    this.wb?.setFormat(this.sheet, this.rect, 'al', al);
  }

  numberFormat(nf: string | undefined): void {
    this.wb?.setFormat(this.sheet, this.rect, 'nf', nf);
  }

  /** Gráfico a partir da seleção (ou do bloco de dados em volta do cursor). */
  addChart(type: ChartType = 'column'): string | null {
    const wb = this.wb;
    if (!wb) return null;
    let x = this.rect;
    if (x.r0 === x.r1 && x.c0 === x.c1) x = this.region(x.r0, x.c0);
    if (x.r0 === x.r1 && x.c0 === x.c1) return null;
    return wb.addChart({ sheet: this.sheet, range: rectKey(x), type });
  }

  /** Bloco contínuo de dados em volta de uma célula (como o Ctrl+A do Excel). */
  region(r: number, c: number): Rect {
    const wb = this.wb!;
    const has = (rr: number, cc: number) => rr >= 0 && cc >= 0 && wb.raw(this.sheet, rr, cc) !== '';
    const x = { r0: r, c0: c, r1: r, c1: c };
    for (let grew = true; grew; ) {
      grew = false;
      const rowHas = (rr: number) => { for (let cc = x.c0 - 1; cc <= x.c1 + 1; cc++) if (has(rr, cc)) return true; return false; };
      const colHas = (cc: number) => { for (let rr = x.r0 - 1; rr <= x.r1 + 1; rr++) if (has(rr, cc)) return true; return false; };
      if (x.r0 > 0 && rowHas(x.r0 - 1)) { x.r0--; grew = true; }
      if (rowHas(x.r1 + 1)) { x.r1++; grew = true; }
      if (x.c0 > 0 && colHas(x.c0 - 1)) { x.c0--; grew = true; }
      if (colHas(x.c1 + 1)) { x.c1++; grew = true; }
    }
    return x;
  }

  /** Soma, média e contagem da seleção, para o rodapé. */
  stats(): { count: number; nums: number; sum: number } | null {
    const wb = this.wb;
    const x = this.rect;
    if (!wb || (x.r0 === x.r1 && x.c0 === x.c1)) return null;
    if ((x.r1 - x.r0 + 1) * (x.c1 - x.c0 + 1) > 200_000) return null;
    const b = wb.bounds(this.sheet);
    let count = 0;
    let nums = 0;
    let sum = 0;
    for (let r = x.r0; r <= Math.min(x.r1, b.rows - 1); r++) {
      for (let c = x.c0; c <= Math.min(x.c1, b.cols - 1); c++) {
        const v = wb.value(this.sheet, r, c);
        if (v === null || v === '') continue;
        count++;
        if (typeof v === 'number') {
          nums++;
          sum += v;
        }
      }
    }
    return { count, nums, sum };
  }
}

