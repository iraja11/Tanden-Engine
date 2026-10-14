import { colIndex, colName, MAX_COLS, MAX_ROWS, quoteSheet } from './address';
import { canonicalName } from './functions';

/*
 * Fórmulas: tokenizador, parser (precedência do Excel) e serializador.
 *
 * Aceita a escrita do Excel e a do Sheets em português: SOMA ou SUM, ";" ou ","
 * entre argumentos, VERDADEIRO/FALSO. O nome digitado é preservado ao copiar e
 * preencher; na exportação para .xlsx tudo vira o nome canônico em inglês.
 */

export type ErrorCode = '#DIV/0!' | '#N/A' | '#NAME?' | '#NULL!' | '#NUM!' | '#REF!' | '#VALUE!' | '#CYCLE!';
export const ERROR_CODES: ErrorCode[] = ['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!', '#CYCLE!'];

/** Parte de uma referência. row/col ausentes = coluna ou linha inteira. */
export interface RefPart {
  row?: number;
  col?: number;
  absRow?: boolean;
  absCol?: boolean;
}

export type Node =
  | { t: 'num'; v: number; raw?: string }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: ErrorCode }
  | { t: 'ref'; sheet?: string; a: RefPart }
  | { t: 'range'; sheet?: string; a: RefPart; b: RefPart }
  | { t: 'name'; v: string }
  | { t: 'fn'; name: string; canon: string; args: Node[]; semi?: boolean }
  | { t: 'un'; op: '-' | '+' | '%'; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'paren'; e: Node };

export class FormulaError extends Error {}

type Tok =
  | { k: 'num'; v: number; raw: string }
  | { k: 'str'; v: string }
  | { k: 'err'; v: ErrorCode }
  | { k: 'sheet'; v: string }
  | { k: 'cell'; v: RefPart }
  | { k: 'cols'; a: RefPart; b: RefPart }
  | { k: 'rows'; a: RefPart; b: RefPart }
  | { k: 'id'; v: string }
  | { k: 'op'; v: string }
  | { k: '(' }
  | { k: ')' }
  | { k: 'sep'; semi: boolean }
  | { k: ':' };

const ID_CHAR = /[A-Za-z0-9_.À-ɏ]/;

function tokenize(src: string, decimalComma = false): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const rest = () => src.slice(i);
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if (ch === '"') {
      let s = '';
      i++;
      for (;;) {
        if (i >= src.length) throw new FormulaError('Aspas sem fechar');
        if (src[i] === '"') {
          if (src[i + 1] === '"') {
            s += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        s += src[i++];
      }
      out.push({ k: 'str', v: s });
      continue;
    }
    if (ch === "'") {
      // 'Nome da aba'!
      let s = '';
      let j = i + 1;
      for (;;) {
        if (j >= src.length) throw new FormulaError('Aspas sem fechar');
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            s += "'";
            j += 2;
            continue;
          }
          break;
        }
        s += src[j++];
      }
      if (src[j + 1] !== '!') throw new FormulaError('Esperava ! depois do nome da aba');
      out.push({ k: 'sheet', v: s });
      i = j + 2;
      continue;
    }
    if (ch === '#') {
      const code = ERROR_CODES.find((c) => src.startsWith(c, i)) ?? (src.startsWith('#N/D', i) ? '#N/A' : null);
      if (!code) throw new FormulaError('Erro desconhecido');
      out.push({ k: 'err', v: code });
      i += src.startsWith('#N/D', i) ? 4 : code.length;
      continue;
    }
    if ((m = /^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(.!])/.exec(rest()))) {
      out.push({ k: 'cols', a: { col: colIndex(m[2]!), absCol: !!m[1] }, b: { col: colIndex(m[4]!), absCol: !!m[3] } });
      i += m[0].length;
      continue;
    }
    if ((m = /^(\$?)(\d+):(\$?)(\d+)(?![\d.])/.exec(rest())) && expectsOperand(out)) {
      out.push({ k: 'rows', a: { row: Number(m[2]) - 1, absRow: !!m[1] }, b: { row: Number(m[4]) - 1, absRow: !!m[3] } });
      i += m[0].length;
      continue;
    }
    if ((m = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(.!])/.exec(rest()))) {
      const col = colIndex(m[2]!);
      const row = Number(m[4]) - 1;
      if (row >= 0 && row < MAX_ROWS && col < MAX_COLS) {
        out.push({ k: 'cell', v: { col, row, absCol: !!m[1], absRow: !!m[3] } });
        i += m[0].length;
        continue;
      }
    }
    if ((m = (decimalComma ? /^(\d+([.,]\d+)?|\.\d+)([eE][+-]?\d+)?/ : /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/).exec(rest()))) {
      out.push({ k: 'num', v: Number(m[0].replace(',', '.')), raw: m[0] });
      i += m[0].length;
      continue;
    }
    if (ID_CHAR.test(ch)) {
      let j = i;
      while (j < src.length && ID_CHAR.test(src[j]!)) j++;
      const id = src.slice(i, j);
      i = j;
      if (src[i] === '!') {
        out.push({ k: 'sheet', v: id });
        i++;
      } else out.push({ k: 'id', v: id });
      continue;
    }
    if ((m = /^(<=|>=|<>|[-+*/^&=<>%])/.exec(rest()))) {
      out.push({ k: 'op', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ':') {
      out.push({ k: ch });
      i++;
      continue;
    }
    if (ch === ',' || ch === ';') {
      out.push({ k: 'sep', semi: ch === ';' });
      i++;
      continue;
    }
    throw new FormulaError(`Caractere inesperado: ${ch}`);
  }
  return out;
}

function expectsOperand(out: Tok[]): boolean {
  const last = out[out.length - 1];
  return !last || last.k === 'op' || last.k === '(' || last.k === 'sep' || last.k === 'sheet';
}

const BIN_PREC: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

class Parser {
  private i = 0;
  constructor(private toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private next(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw new FormulaError('Fórmula incompleta');
    return t;
  }

  parse(): Node {
    const n = this.expr(0);
    if (this.i < this.toks.length) throw new FormulaError('Sobrou algo no fim da fórmula');
    return n;
  }

  private expr(min: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (!t || t.k !== 'op' || t.v === '%') break;
      const p = BIN_PREC[t.v];
      if (p === undefined || p < min) break;
      this.i++;
      // ^ no Excel é associativo à esquerda
      const right = this.expr(p + 1);
      left = { t: 'bin', op: t.v, l: left, r: right };
    }
    return left;
  }

  private unary(): Node {
    const t = this.peek();
    if (t?.k === 'op' && (t.v === '-' || t.v === '+')) {
      this.i++;
      return { t: 'un', op: t.v, e: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let n = this.primary();
    while (this.peek()?.k === 'op' && (this.peek() as { v: string }).v === '%') {
      this.i++;
      n = { t: 'un', op: '%', e: n };
    }
    return n;
  }

  private primary(): Node {
    const t = this.next();
    switch (t.k) {
      case 'num':
        return { t: 'num', v: t.v, raw: t.raw };
      case 'str':
        return { t: 'str', v: t.v };
      case 'err':
        return { t: 'err', v: t.v };
      case '(': {
        const e = this.expr(0);
        if (this.next().k !== ')') throw new FormulaError('Faltou fechar parêntese');
        return { t: 'paren', e };
      }
      case 'sheet': {
        const r = this.next();
        if (r.k === 'cell') return this.maybeRange(r.v, t.v);
        if (r.k === 'cols' || r.k === 'rows') return { t: 'range', sheet: t.v, a: r.a, b: r.b };
        throw new FormulaError('Esperava uma célula depois da aba');
      }
      case 'cell':
        return this.maybeRange(t.v);
      case 'cols':
      case 'rows':
        return { t: 'range', a: t.a, b: t.b };
      case 'id': {
        const up = t.v.toUpperCase();
        if (this.peek()?.k === '(') {
          this.i++;
          const args: Node[] = [];
          let semi = false;
          if (this.peek()?.k !== ')') {
            for (;;) {
              // argumento vazio: SE(A1;;2)
              const p = this.peek();
              if (p?.k === 'sep' || p?.k === ')') args.push({ t: 'name', v: '' });
              else args.push(this.expr(0));
              const s = this.next();
              if (s.k === ')') break;
              if (s.k !== 'sep') throw new FormulaError('Esperava ; ou ) entre argumentos');
              semi ||= s.semi;
            }
          } else this.i++;
          return { t: 'fn', name: t.v, canon: canonicalName(up), args, ...(semi ? { semi } : {}) };
        }
        if (up === 'TRUE' || up === 'VERDADEIRO') return { t: 'bool', v: true };
        if (up === 'FALSE' || up === 'FALSO') return { t: 'bool', v: false };
        return { t: 'name', v: t.v };
      }
      default:
        throw new FormulaError('Fórmula mal formada');
    }
  }

  private maybeRange(a: RefPart, sheet?: string): Node {
    if (this.peek()?.k === ':') {
      this.i++;
      const b = this.next();
      if (b.k !== 'cell') throw new FormulaError('Intervalo inválido');
      return { t: 'range', ...(sheet !== undefined ? { sheet } : {}), a, b: b.v };
    }
    return { t: 'ref', ...(sheet !== undefined ? { sheet } : {}), a };
  }
}

/** Interpreta o texto depois do "=". */
export function parseFormula(src: string): Node {
  // Com ";" separando argumentos (padrão brasileiro), a vírgula é decimal: SE(A1>0,5; ...).
  const semi = /;/.test(src.replace(/"[^"]*"|'[^']*'/g, ''));
  try {
    return new Parser(tokenize(src, semi)).parse();
  } catch (e) {
    // =A1*0,8 sem nenhum ";": tenta de novo lendo a vírgula como decimal
    if (semi || !/\d,\d/.test(src)) throw e;
    return new Parser(tokenize(src, true)).parse();
  }
}

// ---------------------------------------------------------------------------

function partText(p: RefPart): string {
  let s = '';
  if (p.col !== undefined) s += (p.absCol ? '$' : '') + colName(p.col);
  if (p.row !== undefined) s += (p.absRow ? '$' : '') + String(p.row + 1);
  return s;
}

export interface PrintOptions {
  /** nomes em inglês e "," entre argumentos (formato do .xlsx) */
  canonical?: boolean;
  /** prefixo exigido pelo Excel para funções novas (_xlfn.) */
  xlfn?: (canon: string) => string;
}

const fmtNum = (n: number): string => (Number.isInteger(n) || Math.abs(n) >= 1e-6 ? String(n) : n.toExponential());

export function printFormula(n: Node, o: PrintOptions = {}): string {
  const p = (x: Node): string => printFormula(x, o);
  const sheet = (s?: string) => (s === undefined ? '' : `${quoteSheet(s)}!`);
  switch (n.t) {
    case 'num':
      return o.canonical || !n.raw ? fmtNum(n.v) : n.raw;
    case 'str':
      return `"${n.v.replace(/"/g, '""')}"`;
    case 'bool':
      return n.v ? 'TRUE' : 'FALSE';
    case 'err':
      return n.v === '#CYCLE!' ? '#REF!' : n.v;
    case 'ref':
      return sheet(n.sheet) + partText(n.a);
    case 'range':
      return `${sheet(n.sheet)}${partText(n.a)}:${partText(n.b)}`;
    case 'name':
      return n.v;
    case 'fn': {
      const name = o.canonical ? (o.xlfn?.(n.canon) ?? n.canon) : n.name;
      const sep = !o.canonical && n.semi ? '; ' : ', ';
      return `${name}(${n.args.map(p).join(sep)})`;
    }
    case 'un':
      return n.op === '%' ? `${p(n.e)}%` : `${n.op}${p(n.e)}`;
    case 'bin':
      return `${p(n.l)}${n.op}${p(n.r)}`;
    case 'paren':
      return `(${p(n.e)})`;
  }
}

/** Percorre a árvore, trocando nós (usado para deslocar referências). */
export function mapNode(n: Node, fn: (n: Node) => Node): Node {
  switch (n.t) {
    case 'fn':
      return fn({ ...n, args: n.args.map((a) => mapNode(a, fn)) });
    case 'un':
    case 'paren':
      return fn({ ...n, e: mapNode(n.e, fn) });
    case 'bin':
      return fn({ ...n, l: mapNode(n.l, fn), r: mapNode(n.r, fn) });
    default:
      return fn(n);
  }
}

function shiftPart(p: RefPart, dr: number, dc: number): RefPart | null {
  const q = { ...p };
  if (q.row !== undefined && !q.absRow) q.row += dr;
  if (q.col !== undefined && !q.absCol) q.col += dc;
  if ((q.row !== undefined && (q.row < 0 || q.row >= MAX_ROWS)) || (q.col !== undefined && (q.col < 0 || q.col >= MAX_COLS)))
    return null;
  return q;
}

/**
 * Desloca as referências relativas de uma fórmula (copiar, colar, preencher).
 * `raw` inclui o "=". Texto que não é fórmula volta igual.
 */
export function shiftFormula(raw: string, dr: number, dc: number): string {
  if (!raw.startsWith('=') || (dr === 0 && dc === 0)) return raw;
  let ast: Node;
  try {
    ast = parseFormula(raw.slice(1));
  } catch {
    return raw;
  }
  const out = mapNode(ast, (n) => {
    if (n.t === 'ref') {
      const a = shiftPart(n.a, dr, dc);
      return a ? { ...n, a } : { t: 'err', v: '#REF!' };
    }
    if (n.t === 'range') {
      const a = shiftPart(n.a, dr, dc);
      const b = shiftPart(n.b, dr, dc);
      return a && b ? { ...n, a, b } : { t: 'err', v: '#REF!' };
    }
    return n;
  });
  return `=${printFormula(out)}`;
}
