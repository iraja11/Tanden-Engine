import type { ErrorCode } from './formula';

/*
 * Valores de célula, conversões entre tipos (com as regras do Excel), datas
 * como número serial e o formatador de números em pt-BR.
 */

export class CellError {
  constructor(
    readonly code: ErrorCode,
    readonly why?: string,
  ) {}
  toString(): string {
    return this.code;
  }
}

export type Scalar = number | string | boolean | null | CellError;

/** Intervalo avaliado: linhas × colunas. */
export class Matrix {
  constructor(readonly rows: Scalar[][]) {}
  get h(): number {
    return this.rows.length;
  }
  get w(): number {
    return this.rows[0]?.length ?? 0;
  }
  at(r: number, c: number): Scalar {
    return this.rows[r]?.[c] ?? null;
  }
  *values(): Iterable<Scalar> {
    for (const row of this.rows) yield* row;
  }
}

export type Result = Scalar | Matrix;

export const isErr = (v: unknown): v is CellError => v instanceof CellError;
export const err = (code: ErrorCode, why?: string): CellError => new CellError(code, why);

/** Erro que interrompe a função e vira o resultado dela. */
export class Abort {
  constructor(readonly e: CellError) {}
}
export const fail = (code: ErrorCode, why?: string): never => {
  throw new Abort(err(code, why));
};

/** Um valor só (canto superior esquerdo de um intervalo). */
export function scalar(r: Result): Scalar {
  if (r instanceof Matrix) return r.h === 1 && r.w === 1 ? r.at(0, 0) : r.h === 0 ? null : r.at(0, 0);
  return r;
}

export function toNum(v: Scalar): number {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) throw new Abort(v);
  const p = parseInput(v);
  if (typeof p.value === 'number') return p.value;
  return fail('#VALUE!', `"${v}" não é número`);
}

export function toStr(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErr(v)) throw new Abort(v);
  return formatGeneral(v, '.');
}

export function toBool(v: Scalar): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isErr(v)) throw new Abort(v);
  const u = v.toUpperCase();
  if (u === 'TRUE' || u === 'VERDADEIRO') return true;
  if (u === 'FALSE' || u === 'FALSO') return false;
  return fail('#VALUE!', `"${v}" não é VERDADEIRO/FALSO`);
}

/** Comparação do Excel: números < texto < lógicos; texto sem diferenciar maiúsculas. */
export function compare(a: Scalar, b: Scalar): number {
  if (isErr(a)) throw new Abort(a);
  if (isErr(b)) throw new Abort(b);
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const rank = (x: Scalar) => (typeof x === 'number' ? 0 : typeof x === 'string' ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === 'string') {
    const x = a.toLowerCase();
    const y = (b as string).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = Number(a);
  const y = Number(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Datas: número serial do Excel (dias desde 30/12/1899; a fração é a hora).

const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

export const dateToSerial = (y: number, m: number, d: number): number => (Date.UTC(y, m - 1, d) - EPOCH) / DAY;
export const jsToSerial = (d: Date): number =>
  (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - EPOCH) / DAY;
export function serialToDate(serial: number): Date {
  // arredonda para o segundo, para 0,5 dia virar 12:00:00 e não 11:59:59
  return new Date(EPOCH + Math.round(serial * 86400) * 1000);
}

// ---------------------------------------------------------------------------
// O que a pessoa digita numa célula.

export interface Parsed {
  /** fórmula sem o "=" */
  formula?: string;
  value: Scalar;
  /** formato sugerido pelo que foi digitado (10% → 0%, 14/10/2026 → data) */
  nf?: string;
}

export const NF = {
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
  time: 'hh:mm',
  pct: '0%',
  pct2: '0.00%',
  brl: '"R$" #,##0.00',
  num2: '#,##0.00',
  int: '#,##0',
} as const;

const PT_NUM = /^[-+]?(\d{1,3}(\.\d{3})+(,\d+)?|\d+,\d+)$/;
const EN_NUM = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function numberish(s: string): number | null {
  const t = s.replace(/\s/g, '');
  if (EN_NUM.test(t)) return Number(t);
  if (PT_NUM.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  return null;
}

export function parseInput(raw: string): Parsed {
  if (raw === '') return { value: null };
  if (raw.startsWith("'")) return { value: raw.slice(1) };
  if (raw.startsWith('=') && raw.length > 1) return { formula: raw.slice(1), value: null };
  const s = raw.trim();
  const up = s.toUpperCase();
  if (up === 'TRUE' || up === 'VERDADEIRO') return { value: true };
  if (up === 'FALSE' || up === 'FALSO') return { value: false };
  if (/^#(DIV\/0!|N\/A|NAME\?|NULL!|NUM!|REF!|VALUE!)$/.test(up)) return { value: err(up as ErrorCode) };

  const n = numberish(s);
  if (n !== null) return { value: n };

  let m: RegExpExecArray | null;
  if ((m = /^([-+]?[\d.,\s]+)%$/.exec(s))) {
    const v = numberish(m[1]!);
    if (v !== null) return { value: v / 100, nf: /[.,]\d/.test(m[1]!) ? NF.pct2 : NF.pct };
  }
  if ((m = /^(-?)\s*R\$\s*(-?[\d.,]+)$/.exec(s))) {
    const v = numberish(m[2]!);
    if (v !== null) return { value: m[1] ? -v : v, nf: NF.brl };
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (m[3]!.length === 2) y += y < 50 ? 2000 : 1900;
    if (validDate(y, mo, d)) {
      const t = m[4] ? (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6] ?? 0)) / 86400 : 0;
      return { value: dateToSerial(y, mo, d) + t, nf: m[4] ? NF.datetime : NF.date };
    }
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s))) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (validDate(y, mo, d)) {
      const t = m[4] ? (Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6] ?? 0)) / 86400 : 0;
      return { value: dateToSerial(y, mo, d) + t, nf: m[4] ? NF.datetime : NF.date };
    }
  }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s))) {
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h < 24 && mi < 60) return { value: (h * 3600 + mi * 60 + Number(m[3] ?? 0)) / 86400, nf: NF.time };
  }
  return { value: raw };
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Exibição.

/** Número sem formato: até 11 dígitos significativos, vírgula decimal. */
export function formatGeneral(n: number, dec = ','): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e11 || abs < 1e-9) s = n.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', 'E+').replace('e-', 'E-');
  else s = String(Number(n.toPrecision(11)));
  return dec === '.' ? s : s.replace('.', dec);
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function groupThousands(int: string, sep: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Separa um código em literais e o miolo (fora de aspas). */
function sections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of code) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const isDateCode = (code: string): boolean => /[dyh]|(^|[^"])m{1,4}([^"]|$)/i.test(code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')) && !/[0#]/.test(code.replace(/"[^"]*"/g, ''));

export function isDateFormat(code: string | undefined): boolean {
  return !!code && isDateCode(code);
}

function formatDate(serial: number, code: string): string {
  const d = serialToDate(serial);
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth();
  const D = d.getUTCDate();
  const h = d.getUTCHours();
  const mi = d.getUTCMinutes();
  const s = d.getUTCSeconds();
  let out = '';
  let lastWasHour = false;
  const re = /"([^"]*)"|\\(.)|(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM)|(.)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1] !== undefined) out += m[1];
    else if (m[2] !== undefined) out += m[2];
    else if (m[4] !== undefined) {
      if (m[4] !== '[' && m[4] !== ']') out += m[4];
    } else {
      const tok = m[3]!.toLowerCase();
      // "mm" logo depois de hora (ou antes de segundos) é minuto
      const rest = code.slice(re.lastIndex);
      const minute = (tok === 'm' || tok === 'mm') && (lastWasHour || /^[^dyhm]*s/i.test(rest));
      switch (tok) {
        case 'yyyy': out += pad(Y, 4); break;
        case 'yy': out += pad(Y % 100); break;
        case 'mmmm': out += MONTHS[M]; break;
        case 'mmm': out += MONTHS[M]!.slice(0, 3); break;
        case 'mm': out += minute ? pad(mi) : pad(M + 1); break;
        case 'm': out += minute ? String(mi) : String(M + 1); break;
        case 'dddd': out += WEEKDAYS[d.getUTCDay()]; break;
        case 'ddd': out += WEEKDAYS[d.getUTCDay()]!.slice(0, 3); break;
        case 'dd': out += pad(D); break;
        case 'd': out += String(D); break;
        case 'hh': out += pad(h); break;
        case 'h': out += String(h); break;
        case 'ss': out += pad(s); break;
        case 's': out += String(s); break;
        case 'am/pm': out += h < 12 ? 'AM' : 'PM'; break;
      }
      lastWasHour = tok === 'h' || tok === 'hh';
    }
  }
  return out;
}

/** Formata um número com um código de formato do Excel, no padrão brasileiro. */
export function formatNumber(n: number, code: string): string {
  if (!code || code.toLowerCase() === 'general' || code === '@') return formatGeneral(n);
  const secs = sections(code);
  let sec = secs[0]!;
  let neg = n < 0;
  if (n < 0 && secs[1] !== undefined) {
    sec = secs[1];
    neg = false;
  } else if (n === 0 && secs[2] !== undefined) sec = secs[2];
  const v = Math.abs(n);
  sec = sec.replace(/\[(Red|Black|Blue|Green|Color\d+|Vermelho)\]/gi, '');
  if (isDateCode(sec)) return formatDate(n, sec);

  const pct = (sec.replace(/"[^"]*"/g, '').match(/%/g) ?? []).length;
  let x = v * 100 ** pct;
  // miolo numérico: do primeiro 0/#/? ao último
  const core = /[0#?][0#?,.]*/.exec(sec.replace(/"[^"]*"/g, (q) => '\u0000'.repeat(q.length)));
  if (!core) return sec.replace(/"/g, '');
  const pattern = core[0];
  const [intPat = '', decPat = ''] = pattern.split('.');
  const decimals = decPat.replace(/[^0#?]/g, '').length;
  const minDecimals = decPat.replace(/[^0]/g, '').length;
  const thousands = intPat.includes(',');
  // vírgulas no fim do inteiro dividem por mil (#,##0, → milhares)
  const scale = /,+$/.exec(intPat)?.[0].length ?? 0;
  x /= 1000 ** scale;
  let [i, d = ''] = x.toFixed(decimals).split('.');
  d = d.replace(new RegExp(`0{0,${decimals - minDecimals}}$`), '');
  const minInt = intPat.replace(/[^0]/g, '').length;
  i = i!.padStart(minInt, '0');
  if (minInt === 0 && i === '0') i = '';
  if (thousands) i = groupThousands(i, '.');
  const body = (i || (d ? '0' : '')) + (d ? `,${d}` : '') || '0';
  const before = sec.slice(0, core.index).replace(/"([^"]*)"/g, '$1').replace(/[\\_*]/g, '');
  const after = sec.slice(core.index + pattern.length).replace(/"([^"]*)"/g, '$1').replace(/[\\_*]/g, '');
  return `${neg ? '-' : ''}${before}${body}${after}`;
}

export function formatValue(v: Scalar, nf?: string): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (isErr(v)) return v.code;
  if (typeof v === 'string') return v;
  return nf ? formatNumber(v, nf) : formatGeneral(v);
}
