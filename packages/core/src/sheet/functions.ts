import type { Node } from './formula';
import type { Rect } from './address';
import {
  Abort, CellError, Matrix, compare, dateToSerial, err, fail, formatNumber, isErr, jsToSerial, scalar,
  serialToDate, toBool, toNum, toStr, type Result, type Scalar,
} from './values';

/*
 * Biblioteca de funções. Cada uma tem o nome do Excel (o que vai para o .xlsx),
 * o nome do Sheets/Excel em português, a assinatura e uma explicação curta,
 * que a barra de fórmulas mostra enquanto você digita.
 */

export interface Arg {
  node: Node;
  /** avalia o argumento (preguiçoso: SE só avalia o ramo escolhido) */
  get(): Result;
}

export interface FnCtx {
  row: number;
  col: number;
  now(): Date;
  /** célula ou intervalo a que um argumento se refere, se for referência */
  rectOf(node: Node): Rect | null;
}

export interface FnDef {
  name: string;
  pt: string;
  sig: string;
  desc: string;
  cat: 'Matemática' | 'Estatística' | 'Lógica' | 'Texto' | 'Data e hora' | 'Pesquisa' | 'Informação' | 'Finanças';
  min?: number;
  max?: number;
  /** precisa de recálculo sempre (HOJE, ALEATÓRIO) */
  volatile?: boolean;
  /** só existe nas versões novas do Excel: grava com prefixo _xlfn. */
  xlfn?: boolean;
  fn(a: Arg[], ctx: FnCtx): Result;
}

// ---------------------------------------------------------------------------
// ajudantes

const v = (a: Arg | undefined): Scalar => (a ? scalar(a.get()) : null);
const num = (a: Arg | undefined, dflt?: number): number => {
  if ((!a || (a.node.t === 'name' && a.node.v === '')) && dflt !== undefined) return dflt;
  return toNum(v(a));
};
const str = (a: Arg | undefined): string => toStr(v(a));
const bool = (a: Arg | undefined, dflt?: boolean): boolean => {
  if ((!a || (a.node.t === 'name' && a.node.v === '')) && dflt !== undefined) return dflt;
  return toBool(v(a));
};
const matrix = (a: Arg): Matrix => {
  const r = a.get();
  return r instanceof Matrix ? r : new Matrix([[r]]);
};

/** Números dos argumentos: em intervalos ignora texto e vazio; direto, converte. */
function numbers(args: Arg[], opts: { errors?: 'throw' | 'skip' } = {}): number[] {
  const out: number[] = [];
  for (const a of args) {
    const r = a.get();
    if (r instanceof Matrix) {
      for (const x of r.values()) {
        if (typeof x === 'number') out.push(x);
        else if (isErr(x) && opts.errors !== 'skip') throw new Abort(x);
      }
    } else if (r !== null) out.push(toNum(r));
  }
  return out;
}

function* each(args: Arg[]): Iterable<Scalar> {
  for (const a of args) {
    const r = a.get();
    if (r instanceof Matrix) yield* r.values();
    else yield r;
  }
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : fail('#DIV/0!', 'nenhum número'));

function variance(xs: number[], sample: boolean): number {
  if (xs.length < (sample ? 2 : 1)) return fail('#DIV/0!');
  const m = sum(xs) / xs.length;
  return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - (sample ? 1 : 0));
}

function roundTo(x: number, digits: number, mode: 'near' | 'up' | 'down'): number {
  const f = 10 ** Math.trunc(digits);
  // corrige 1.005*100 = 100.49999 antes de arredondar
  const y = Number((Math.abs(x) * f).toPrecision(15));
  const r = mode === 'near' ? Math.round(y) : mode === 'up' ? Math.ceil(y) : Math.floor(y);
  return (Math.sign(x) * r) / f;
}

/** Critério de SOMASE/CONT.SE: ">5", "<>x", "maç*", 10 */
export function criterion(c: Scalar): (x: Scalar) => boolean {
  if (typeof c !== 'string') return (x) => x !== null && !isErr(x) && compare(x, c) === 0 && typeof x === typeof c;
  const m = /^(<=|>=|<>|=|<|>)?(.*)$/s.exec(c)!;
  const op = m[1] ?? '=';
  const rhsRaw = m[2]!;
  const rhsNum = rhsRaw.trim() !== '' && !Number.isNaN(Number(rhsRaw.replace(',', '.'))) ? Number(rhsRaw.replace(',', '.')) : null;
  const wild = /[*?]/.test(rhsRaw)
    ? new RegExp(`^${rhsRaw.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\\\*/g, '\u0001').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*')}$`, 'is')
    : null;
  return (x) => {
    if (isErr(x)) return false;
    if (rhsNum !== null && (op !== '=' || typeof x === 'number')) {
      if (typeof x !== 'number') return op === '<>';
      const d = x - rhsNum;
      return op === '=' ? d === 0 : op === '<>' ? d !== 0 : op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0;
    }
    if (op === '=' || op === '<>') {
      let eq: boolean;
      if (rhsRaw === '') eq = x === null || x === '';
      else if (wild) eq = typeof x === 'string' && wild.test(x);
      else eq = typeof x === 'string' ? x.toLowerCase() === rhsRaw.toLowerCase() : typeof x === 'boolean' ? String(x).toUpperCase() === rhsRaw.toUpperCase() : false;
      return op === '=' ? eq : !eq;
    }
    if (typeof x !== 'string') return false;
    const d = compare(x, rhsRaw);
    return op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0;
  };
}

/** Pares (intervalo, critério) de SOMASES/CONT.SES → máscara de linhas×colunas. */
function maskOf(pairs: Arg[], h: number, w: number): boolean[][] {
  const mask = Array.from({ length: h }, () => Array<boolean>(w).fill(true));
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const m = matrix(pairs[i]!);
    if (m.h !== h || m.w !== w) fail('#VALUE!', 'intervalos de tamanhos diferentes');
    const test = criterion(v(pairs[i + 1]));
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (mask[r]![c] && !test(m.at(r, c))) mask[r]![c] = false;
  }
  return mask;
}

function lookupIndex(needle: Scalar, list: Scalar[], approx: boolean): number {
  if (!approx) {
    const test = typeof needle === 'string' && /[*?]/.test(needle) ? criterion(needle) : null;
    for (let i = 0; i < list.length; i++) {
      const x = list[i]!;
      if (test ? test(x) : x !== null && !isErr(x) && typeof x === typeof needle && compare(x, needle) === 0) return i;
    }
    return -1;
  }
  // aproximado: maior valor <= procurado, numa lista em ordem crescente
  let lo = 0;
  let hi = list.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const x = list[mid]!;
    if (x === null || isErr(x) || typeof x !== typeof needle) {
      // pula buracos procurando linearmente
      let found = -1;
      for (let i = lo; i <= hi; i++) {
        const y = list[i]!;
        if (y !== null && !isErr(y) && typeof y === typeof needle && compare(y, needle) <= 0) found = i;
      }
      return found >= 0 ? found : best;
    }
    if (compare(x, needle) <= 0) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

const ymd = (serial: number) => {
  const d = serialToDate(Math.floor(serial));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay() };
};

function addMonths(serial: number, months: number, endOfMonth: boolean): number {
  const { y, m, d } = ymd(serial);
  const total = y * 12 + (m - 1) + Math.trunc(months);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return dateToSerial(ny, nm, endOfMonth ? last : Math.min(d, last));
}

function newton(f: (x: number) => number, guess: number): number {
  let x = guess;
  for (let i = 0; i < 100; i++) {
    const y = f(x);
    if (Math.abs(y) < 1e-10) return x;
    const h = 1e-7;
    const d = (f(x + h) - y) / h;
    if (d === 0 || !Number.isFinite(d)) break;
    const nx = x - y / d;
    if (Math.abs(nx - x) < 1e-12) return nx;
    x = nx;
  }
  return fail('#NUM!', 'não convergiu');
}

// ---------------------------------------------------------------------------

const F: FnDef[] = [
  // Matemática
  { name: 'SUM', pt: 'SOMA', sig: 'valor1; [valor2; ...]', desc: 'Soma os números.', cat: 'Matemática', min: 1, fn: (a) => sum(numbers(a)) },
  { name: 'PRODUCT', pt: 'MULT', sig: 'valor1; [valor2; ...]', desc: 'Multiplica os números.', cat: 'Matemática', min: 1, fn: (a) => numbers(a).reduce((p, x) => p * x, 1) },
  { name: 'ROUND', pt: 'ARRED', sig: 'número; [casas]', desc: 'Arredonda para o número de casas decimais.', cat: 'Matemática', min: 1, max: 2, fn: (a) => roundTo(num(a[0]), num(a[1], 0), 'near') },
  { name: 'ROUNDUP', pt: 'ARREDONDAR.PARA.CIMA', sig: 'número; [casas]', desc: 'Arredonda para longe do zero.', cat: 'Matemática', min: 1, max: 2, fn: (a) => roundTo(num(a[0]), num(a[1], 0), 'up') },
  { name: 'ROUNDDOWN', pt: 'ARREDONDAR.PARA.BAIXO', sig: 'número; [casas]', desc: 'Arredonda em direção ao zero.', cat: 'Matemática', min: 1, max: 2, fn: (a) => roundTo(num(a[0]), num(a[1], 0), 'down') },
  { name: 'TRUNC', pt: 'TRUNCAR', sig: 'número; [casas]', desc: 'Corta as casas decimais sem arredondar.', cat: 'Matemática', min: 1, max: 2, fn: (a) => roundTo(num(a[0]), num(a[1], 0), 'down') },
  { name: 'INT', pt: 'INT', sig: 'número', desc: 'Arredonda para baixo até o inteiro.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.floor(num(a[0])) },
  { name: 'CEILING', pt: 'TETO', sig: 'número; [múltiplo]', desc: 'Arredonda para cima até o múltiplo.', cat: 'Matemática', min: 1, max: 2, fn: (a) => { const s = num(a[1], 1); return s === 0 ? 0 : Math.ceil(num(a[0]) / s) * s; } },
  { name: 'FLOOR', pt: 'ARREDMULTB', sig: 'número; [múltiplo]', desc: 'Arredonda para baixo até o múltiplo.', cat: 'Matemática', min: 1, max: 2, fn: (a) => { const s = num(a[1], 1); return s === 0 ? fail('#DIV/0!') : Math.floor(num(a[0]) / s) * s; } },
  { name: 'MROUND', pt: 'MARRED', sig: 'número; múltiplo', desc: 'Arredonda para o múltiplo mais próximo.', cat: 'Matemática', min: 2, max: 2, fn: (a) => { const s = num(a[1]); return s === 0 ? 0 : Math.round(num(a[0]) / s) * s; } },
  { name: 'ABS', pt: 'ABS', sig: 'número', desc: 'Valor absoluto (sem sinal).', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.abs(num(a[0])) },
  { name: 'SIGN', pt: 'SINAL', sig: 'número', desc: '1 se positivo, -1 se negativo, 0 se zero.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.sign(num(a[0])) },
  { name: 'SQRT', pt: 'RAIZ', sig: 'número', desc: 'Raiz quadrada.', cat: 'Matemática', min: 1, max: 1, fn: (a) => { const x = num(a[0]); return x < 0 ? fail('#NUM!') : Math.sqrt(x); } },
  { name: 'POWER', pt: 'POTÊNCIA', sig: 'base; expoente', desc: 'Eleva a base ao expoente.', cat: 'Matemática', min: 2, max: 2, fn: (a) => num(a[0]) ** num(a[1]) },
  { name: 'EXP', pt: 'EXP', sig: 'número', desc: 'e elevado ao número.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.exp(num(a[0])) },
  { name: 'LN', pt: 'LN', sig: 'número', desc: 'Logaritmo natural.', cat: 'Matemática', min: 1, max: 1, fn: (a) => { const x = num(a[0]); return x <= 0 ? fail('#NUM!') : Math.log(x); } },
  { name: 'LOG', pt: 'LOG', sig: 'número; [base]', desc: 'Logaritmo (base 10 se omitida).', cat: 'Matemática', min: 1, max: 2, fn: (a) => { const x = num(a[0]); const b = num(a[1], 10); return x <= 0 || b <= 0 || b === 1 ? fail('#NUM!') : Math.log(x) / Math.log(b); } },
  { name: 'LOG10', pt: 'LOG10', sig: 'número', desc: 'Logaritmo na base 10.', cat: 'Matemática', min: 1, max: 1, fn: (a) => { const x = num(a[0]); return x <= 0 ? fail('#NUM!') : Math.log10(x); } },
  { name: 'MOD', pt: 'MOD', sig: 'número; divisor', desc: 'Resto da divisão (com o sinal do divisor).', cat: 'Matemática', min: 2, max: 2, fn: (a) => { const n = num(a[0]); const d = num(a[1]); return d === 0 ? fail('#DIV/0!') : n - d * Math.floor(n / d); } },
  { name: 'QUOTIENT', pt: 'QUOCIENTE', sig: 'numerador; denominador', desc: 'Parte inteira da divisão.', cat: 'Matemática', min: 2, max: 2, fn: (a) => { const d = num(a[1]); return d === 0 ? fail('#DIV/0!') : Math.trunc(num(a[0]) / d); } },
  { name: 'PI', pt: 'PI', sig: '', desc: 'O número π.', cat: 'Matemática', max: 0, fn: () => Math.PI },
  { name: 'SIN', pt: 'SEN', sig: 'ângulo em radianos', desc: 'Seno.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.sin(num(a[0])) },
  { name: 'COS', pt: 'COS', sig: 'ângulo em radianos', desc: 'Cosseno.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.cos(num(a[0])) },
  { name: 'TAN', pt: 'TAN', sig: 'ângulo em radianos', desc: 'Tangente.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.tan(num(a[0])) },
  { name: 'ASIN', pt: 'ASEN', sig: 'número', desc: 'Arco seno, em radianos.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.asin(num(a[0])) },
  { name: 'ACOS', pt: 'ACOS', sig: 'número', desc: 'Arco cosseno, em radianos.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.acos(num(a[0])) },
  { name: 'ATAN', pt: 'ATAN', sig: 'número', desc: 'Arco tangente, em radianos.', cat: 'Matemática', min: 1, max: 1, fn: (a) => Math.atan(num(a[0])) },
  { name: 'ATAN2', pt: 'ATAN2', sig: 'x; y', desc: 'Ângulo do ponto (x, y), em radianos.', cat: 'Matemática', min: 2, max: 2, fn: (a) => Math.atan2(num(a[1]), num(a[0])) },
  { name: 'DEGREES', pt: 'GRAUS', sig: 'radianos', desc: 'Converte radianos em graus.', cat: 'Matemática', min: 1, max: 1, fn: (a) => (num(a[0]) * 180) / Math.PI },
  { name: 'RADIANS', pt: 'RADIANOS', sig: 'graus', desc: 'Converte graus em radianos.', cat: 'Matemática', min: 1, max: 1, fn: (a) => (num(a[0]) * Math.PI) / 180 },
  { name: 'FACT', pt: 'FATORIAL', sig: 'número', desc: 'Fatorial.', cat: 'Matemática', min: 1, max: 1, fn: (a) => { const n = Math.floor(num(a[0])); if (n < 0) fail('#NUM!'); let p = 1; for (let i = 2; i <= n; i++) p *= i; return p; } },
  { name: 'COMBIN', pt: 'COMBIN', sig: 'n; k', desc: 'Combinações de n itens tomados k a k.', cat: 'Matemática', min: 2, max: 2, fn: (a) => { const n = Math.floor(num(a[0])); const k = Math.floor(num(a[1])); if (k < 0 || n < k) fail('#NUM!'); let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); } },
  { name: 'GCD', pt: 'MDC', sig: 'número1; [número2; ...]', desc: 'Máximo divisor comum.', cat: 'Matemática', min: 1, fn: (a) => numbers(a).map((x) => Math.floor(Math.abs(x))).reduce((g, x) => { while (x) [g, x] = [x, g % x]; return g; }, 0) },
  { name: 'LCM', pt: 'MMC', sig: 'número1; [número2; ...]', desc: 'Mínimo múltiplo comum.', cat: 'Matemática', min: 1, fn: (a) => numbers(a).map((x) => Math.floor(Math.abs(x))).reduce((l, x) => { if (!l || !x) return 0; let g = l, y = x; while (y) [g, y] = [y, g % y]; return (l * x) / g; }, 1) },
  { name: 'RAND', pt: 'ALEATÓRIO', sig: '', desc: 'Número aleatório entre 0 e 1. Muda a cada recálculo.', cat: 'Matemática', max: 0, volatile: true, fn: () => Math.random() },
  { name: 'RANDBETWEEN', pt: 'ALEATÓRIOENTRE', sig: 'mínimo; máximo', desc: 'Inteiro aleatório entre os dois valores (ótimo para dados de RPG).', cat: 'Matemática', min: 2, max: 2, volatile: true, fn: (a) => { const lo = Math.ceil(num(a[0])); const hi = Math.floor(num(a[1])); return lo > hi ? fail('#NUM!') : lo + Math.floor(Math.random() * (hi - lo + 1)); } },
  { name: 'SUMPRODUCT', pt: 'SOMARPRODUTO', sig: 'intervalo1; [intervalo2; ...]', desc: 'Multiplica os intervalos item a item e soma.', cat: 'Matemática', min: 1, fn: (a) => {
    const ms = a.map(matrix);
    const { h, w } = ms[0]!;
    if (ms.some((m) => m.h !== h || m.w !== w)) fail('#VALUE!', 'intervalos de tamanhos diferentes');
    let s = 0;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) s += ms.reduce((p, m) => { const x = m.at(r, c); if (isErr(x)) throw new Abort(x); return p * (typeof x === 'number' ? x : 0); }, 1);
    return s;
  } },
  { name: 'SUMIF', pt: 'SOMASE', sig: 'intervalo; critério; [intervalo_soma]', desc: 'Soma onde o critério bate. Ex.: SOMASE(A:A; "Mercado"; B:B).', cat: 'Matemática', min: 2, max: 3, fn: (a) => {
    const rng = matrix(a[0]!); const sumR = a[2] ? matrix(a[2]) : rng; const test = criterion(v(a[1]));
    let s = 0;
    for (let r = 0; r < rng.h; r++) for (let c = 0; c < rng.w; c++) if (test(rng.at(r, c))) { const x = sumR.at(r, c); if (typeof x === 'number') s += x; }
    return s;
  } },
  { name: 'SUMIFS', pt: 'SOMASES', sig: 'intervalo_soma; intervalo1; critério1; [...]', desc: 'Soma onde todos os critérios batem.', cat: 'Matemática', min: 3, fn: (a) => {
    const sumR = matrix(a[0]!); const mask = maskOf(a.slice(1), sumR.h, sumR.w);
    let s = 0;
    for (let r = 0; r < sumR.h; r++) for (let c = 0; c < sumR.w; c++) if (mask[r]![c]) { const x = sumR.at(r, c); if (typeof x === 'number') s += x; }
    return s;
  } },

  // Estatística
  { name: 'AVERAGE', pt: 'MÉDIA', sig: 'valor1; [valor2; ...]', desc: 'Média aritmética.', cat: 'Estatística', min: 1, fn: (a) => mean(numbers(a)) },
  { name: 'MEDIAN', pt: 'MED', sig: 'valor1; [valor2; ...]', desc: 'Valor do meio.', cat: 'Estatística', min: 1, fn: (a) => { const xs = numbers(a).sort((x, y) => x - y); if (!xs.length) fail('#NUM!'); const m = xs.length >> 1; return xs.length % 2 ? xs[m]! : (xs[m - 1]! + xs[m]!) / 2; } },
  { name: 'MODE', pt: 'MODO', sig: 'valor1; [valor2; ...]', desc: 'Valor mais frequente.', cat: 'Estatística', min: 1, fn: (a) => { const c = new Map<number, number>(); let best: number | null = null; let n = 1; for (const x of numbers(a)) { const k = (c.get(x) ?? 0) + 1; c.set(x, k); if (k > n) { n = k; best = x; } } return best ?? fail('#N/A'); } },
  { name: 'MIN', pt: 'MÍNIMO', sig: 'valor1; [valor2; ...]', desc: 'Menor número.', cat: 'Estatística', min: 1, fn: (a) => { const xs = numbers(a); return xs.length ? Math.min(...xs) : 0; } },
  { name: 'MAX', pt: 'MÁXIMO', sig: 'valor1; [valor2; ...]', desc: 'Maior número.', cat: 'Estatística', min: 1, fn: (a) => { const xs = numbers(a); return xs.length ? Math.max(...xs) : 0; } },
  { name: 'COUNT', pt: 'CONT.NÚM', sig: 'valor1; [valor2; ...]', desc: 'Quantas células têm número.', cat: 'Estatística', min: 1, fn: (a) => { let n = 0; for (const x of each(a)) if (typeof x === 'number') n++; return n; } },
  { name: 'COUNTA', pt: 'CONT.VALORES', sig: 'valor1; [valor2; ...]', desc: 'Quantas células não estão vazias.', cat: 'Estatística', min: 1, fn: (a) => { let n = 0; for (const x of each(a)) if (x !== null && x !== '') n++; return n; } },
  { name: 'COUNTBLANK', pt: 'CONTAR.VAZIO', sig: 'intervalo', desc: 'Quantas células estão vazias.', cat: 'Estatística', min: 1, max: 1, fn: (a) => { let n = 0; for (const x of matrix(a[0]!).values()) if (x === null || x === '') n++; return n; } },
  { name: 'COUNTIF', pt: 'CONT.SE', sig: 'intervalo; critério', desc: 'Conta onde o critério bate. Ex.: CONT.SE(C:C; ">=7").', cat: 'Estatística', min: 2, max: 2, fn: (a) => { const t = criterion(v(a[1])); let n = 0; for (const x of matrix(a[0]!).values()) if (t(x)) n++; return n; } },
  { name: 'COUNTIFS', pt: 'CONT.SES', sig: 'intervalo1; critério1; [...]', desc: 'Conta onde todos os critérios batem.', cat: 'Estatística', min: 2, fn: (a) => { const m = matrix(a[0]!); return maskOf(a, m.h, m.w).flat().filter(Boolean).length; } },
  { name: 'AVERAGEIF', pt: 'MÉDIASE', sig: 'intervalo; critério; [intervalo_média]', desc: 'Média onde o critério bate.', cat: 'Estatística', min: 2, max: 3, fn: (a) => {
    const rng = matrix(a[0]!); const avgR = a[2] ? matrix(a[2]) : rng; const t = criterion(v(a[1])); const xs: number[] = [];
    for (let r = 0; r < rng.h; r++) for (let c = 0; c < rng.w; c++) if (t(rng.at(r, c))) { const x = avgR.at(r, c); if (typeof x === 'number') xs.push(x); }
    return mean(xs);
  } },
  { name: 'AVERAGEIFS', pt: 'MÉDIASES', sig: 'intervalo_média; intervalo1; critério1; [...]', desc: 'Média onde todos os critérios batem.', cat: 'Estatística', min: 3, fn: (a) => {
    const m = matrix(a[0]!); const mask = maskOf(a.slice(1), m.h, m.w); const xs: number[] = [];
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) if (mask[r]![c]) { const x = m.at(r, c); if (typeof x === 'number') xs.push(x); }
    return mean(xs);
  } },
  { name: 'MAXIFS', pt: 'MÁXIMOSES', sig: 'intervalo_max; intervalo1; critério1; [...]', desc: 'Maior valor onde os critérios batem.', cat: 'Estatística', min: 3, xlfn: true, fn: (a) => {
    const m = matrix(a[0]!); const mask = maskOf(a.slice(1), m.h, m.w); let best: number | null = null;
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) { const x = m.at(r, c); if (mask[r]![c] && typeof x === 'number') best = best === null ? x : Math.max(best, x); }
    return best ?? 0;
  } },
  { name: 'MINIFS', pt: 'MÍNIMOSES', sig: 'intervalo_min; intervalo1; critério1; [...]', desc: 'Menor valor onde os critérios batem.', cat: 'Estatística', min: 3, xlfn: true, fn: (a) => {
    const m = matrix(a[0]!); const mask = maskOf(a.slice(1), m.h, m.w); let best: number | null = null;
    for (let r = 0; r < m.h; r++) for (let c = 0; c < m.w; c++) { const x = m.at(r, c); if (mask[r]![c] && typeof x === 'number') best = best === null ? x : Math.min(best, x); }
    return best ?? 0;
  } },
  { name: 'LARGE', pt: 'MAIOR', sig: 'intervalo; k', desc: 'O k-ésimo maior valor.', cat: 'Estatística', min: 2, max: 2, fn: (a) => { const xs = numbers([a[0]!]).sort((x, y) => y - x); const k = Math.ceil(num(a[1])); return k < 1 || k > xs.length ? fail('#NUM!') : xs[k - 1]!; } },
  { name: 'SMALL', pt: 'MENOR', sig: 'intervalo; k', desc: 'O k-ésimo menor valor.', cat: 'Estatística', min: 2, max: 2, fn: (a) => { const xs = numbers([a[0]!]).sort((x, y) => x - y); const k = Math.ceil(num(a[1])); return k < 1 || k > xs.length ? fail('#NUM!') : xs[k - 1]!; } },
  { name: 'RANK', pt: 'ORDEM', sig: 'número; intervalo; [crescente]', desc: 'Posição do número na lista (1 = maior).', cat: 'Estatística', min: 2, max: 3, fn: (a) => { const x = num(a[0]); const xs = numbers([a[1]!]); const asc = num(a[2], 0) !== 0; if (!xs.includes(x)) fail('#N/A'); return 1 + xs.filter((y) => (asc ? y < x : y > x)).length; } },
  { name: 'STDEV', pt: 'DESVPAD', sig: 'valor1; [valor2; ...]', desc: 'Desvio padrão de uma amostra.', cat: 'Estatística', min: 1, fn: (a) => Math.sqrt(variance(numbers(a), true)) },
  { name: 'STDEVP', pt: 'DESVPADP', sig: 'valor1; [valor2; ...]', desc: 'Desvio padrão da população inteira.', cat: 'Estatística', min: 1, fn: (a) => Math.sqrt(variance(numbers(a), false)) },
  { name: 'VAR', pt: 'VAR', sig: 'valor1; [valor2; ...]', desc: 'Variância de uma amostra.', cat: 'Estatística', min: 1, fn: (a) => variance(numbers(a), true) },
  { name: 'VARP', pt: 'VARP', sig: 'valor1; [valor2; ...]', desc: 'Variância da população inteira.', cat: 'Estatística', min: 1, fn: (a) => variance(numbers(a), false) },
  { name: 'CORREL', pt: 'CORREL', sig: 'intervalo1; intervalo2', desc: 'Correlação entre duas séries (-1 a 1).', cat: 'Estatística', min: 2, max: 2, fn: (a) => {
    const [xs, ys] = pairedNumbers(a[0]!, a[1]!); const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { const dx = x - mx, dy = ys[i]! - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; });
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : fail('#DIV/0!');
  } },
  { name: 'SLOPE', pt: 'INCLINAÇÃO', sig: 'ys; xs', desc: 'Inclinação da reta de tendência.', cat: 'Estatística', min: 2, max: 2, fn: (a) => linreg(a[0]!, a[1]!).m },
  { name: 'INTERCEPT', pt: 'INTERCEPÇÃO', sig: 'ys; xs', desc: 'Onde a reta de tendência corta o eixo Y.', cat: 'Estatística', min: 2, max: 2, fn: (a) => linreg(a[0]!, a[1]!).b },
  { name: 'FORECAST', pt: 'PREVISÃO', sig: 'x; ys; xs', desc: 'Prevê y para x pela reta de tendência.', cat: 'Estatística', min: 3, max: 3, fn: (a) => { const { m, b } = linreg(a[1]!, a[2]!); return m * num(a[0]) + b; } },

  // Lógica
  { name: 'IF', pt: 'SE', sig: 'teste; se_verdadeiro; [se_falso]', desc: 'Escolhe um valor conforme o teste.', cat: 'Lógica', min: 2, max: 3, fn: (a) => (bool(a[0]) ? a[1]!.get() : a[2] ? a[2].get() : false) },
  { name: 'IFS', pt: 'SES', sig: 'teste1; valor1; [teste2; valor2; ...]', desc: 'Primeiro valor cujo teste é verdadeiro.', cat: 'Lógica', min: 2, xlfn: true, fn: (a) => { for (let i = 0; i + 1 < a.length; i += 2) if (bool(a[i])) return a[i + 1]!.get(); return err('#N/A', 'nenhum teste foi verdadeiro'); } },
  { name: 'IFERROR', pt: 'SEERRO', sig: 'valor; se_erro', desc: 'Usa o segundo valor se o primeiro der erro.', cat: 'Lógica', min: 2, max: 2, fn: (a) => { try { const r = a[0]!.get(); return isErr(scalar(r)) ? a[1]!.get() : r; } catch (e) { if (e instanceof Abort) return a[1]!.get(); throw e; } } },
  { name: 'IFNA', pt: 'SENÃODISP', sig: 'valor; se_nd', desc: 'Usa o segundo valor se o primeiro for #N/D.', cat: 'Lógica', min: 2, max: 2, xlfn: true, fn: (a) => { const r = a[0]!.get(); const s = scalar(r); return isErr(s) && s.code === '#N/A' ? a[1]!.get() : r; } },
  { name: 'AND', pt: 'E', sig: 'lógico1; [lógico2; ...]', desc: 'Verdadeiro se todos forem verdadeiros.', cat: 'Lógica', min: 1, fn: (a) => { for (const x of each(a)) if (x !== null && typeof x !== 'string' && !toBool(x)) return false; return true; } },
  { name: 'OR', pt: 'OU', sig: 'lógico1; [lógico2; ...]', desc: 'Verdadeiro se algum for verdadeiro.', cat: 'Lógica', min: 1, fn: (a) => { for (const x of each(a)) if (x !== null && typeof x !== 'string' && toBool(x)) return true; return false; } },
  { name: 'XOR', pt: 'OUEXCL', sig: 'lógico1; [lógico2; ...]', desc: 'Verdadeiro se um número ímpar for verdadeiro.', cat: 'Lógica', min: 1, xlfn: true, fn: (a) => { let n = 0; for (const x of each(a)) if (x !== null && typeof x !== 'string' && toBool(x)) n++; return n % 2 === 1; } },
  { name: 'NOT', pt: 'NÃO', sig: 'lógico', desc: 'Inverte verdadeiro e falso.', cat: 'Lógica', min: 1, max: 1, fn: (a) => !bool(a[0]) },
  { name: 'TRUE', pt: 'VERDADEIRO', sig: '', desc: 'O valor VERDADEIRO.', cat: 'Lógica', max: 0, fn: () => true },
  { name: 'FALSE', pt: 'FALSO', sig: '', desc: 'O valor FALSO.', cat: 'Lógica', max: 0, fn: () => false },
  { name: 'SWITCH', pt: 'PARÂMETRO', sig: 'expressão; caso1; valor1; [...]; [padrão]', desc: 'Compara com cada caso e devolve o valor dele.', cat: 'Lógica', min: 3, xlfn: true, fn: (a) => { const x = v(a[0]); let i = 1; for (; i + 1 < a.length; i += 2) if (compare(x, v(a[i])) === 0) return a[i + 1]!.get(); return i < a.length ? a[i]!.get() : err('#N/A'); } },
  { name: 'CHOOSE', pt: 'ESCOLHER', sig: 'índice; valor1; [valor2; ...]', desc: 'O valor da posição indicada.', cat: 'Lógica', min: 2, fn: (a) => { const i = Math.floor(num(a[0])); return i < 1 || i >= a.length ? fail('#VALUE!') : a[i]!.get(); } },

  // Texto
  { name: 'CONCAT', pt: 'CONCAT', sig: 'texto1; [texto2; ...]', desc: 'Junta textos (aceita intervalos).', cat: 'Texto', min: 1, xlfn: true, fn: (a) => { let s = ''; for (const x of each(a)) s += toStr(x); return s; } },
  { name: 'CONCATENATE', pt: 'CONCATENAR', sig: 'texto1; [texto2; ...]', desc: 'Junta textos.', cat: 'Texto', min: 1, fn: (a) => a.map(str).join('') },
  { name: 'TEXTJOIN', pt: 'UNIRTEXTO', sig: 'separador; ignorar_vazios; texto1; [...]', desc: 'Junta textos com um separador.', cat: 'Texto', min: 3, xlfn: true, fn: (a) => { const sep = str(a[0]); const skip = bool(a[1]); const parts: string[] = []; for (const x of each(a.slice(2))) { const s = toStr(x); if (!skip || s !== '') parts.push(s); } return parts.join(sep); } },
  { name: 'LEN', pt: 'NÚM.CARACT', sig: 'texto', desc: 'Quantidade de caracteres.', cat: 'Texto', min: 1, max: 1, fn: (a) => [...str(a[0])].length },
  { name: 'LEFT', pt: 'ESQUERDA', sig: 'texto; [n]', desc: 'Os primeiros n caracteres.', cat: 'Texto', min: 1, max: 2, fn: (a) => { const n = num(a[1], 1); return n < 0 ? fail('#VALUE!') : [...str(a[0])].slice(0, n).join(''); } },
  { name: 'RIGHT', pt: 'DIREITA', sig: 'texto; [n]', desc: 'Os últimos n caracteres.', cat: 'Texto', min: 1, max: 2, fn: (a) => { const n = num(a[1], 1); const t = [...str(a[0])]; return n < 0 ? fail('#VALUE!') : n === 0 ? '' : t.slice(-n).join(''); } },
  { name: 'MID', pt: 'EXT.TEXTO', sig: 'texto; início; n', desc: 'n caracteres a partir da posição início.', cat: 'Texto', min: 3, max: 3, fn: (a) => { const s = num(a[1]); const n = num(a[2]); return s < 1 || n < 0 ? fail('#VALUE!') : [...str(a[0])].slice(s - 1, s - 1 + n).join(''); } },
  { name: 'UPPER', pt: 'MAIÚSCULA', sig: 'texto', desc: 'TUDO EM MAIÚSCULAS.', cat: 'Texto', min: 1, max: 1, fn: (a) => str(a[0]).toLocaleUpperCase('pt-BR') },
  { name: 'LOWER', pt: 'MINÚSCULA', sig: 'texto', desc: 'tudo em minúsculas.', cat: 'Texto', min: 1, max: 1, fn: (a) => str(a[0]).toLocaleLowerCase('pt-BR') },
  { name: 'PROPER', pt: 'PRI.MAIÚSCULA', sig: 'texto', desc: 'Primeira Letra De Cada Palavra.', cat: 'Texto', min: 1, max: 1, fn: (a) => str(a[0]).toLocaleLowerCase('pt-BR').replace(/(^|[^\p{L}])(\p{L})/gu, (_, p, c: string) => p + c.toLocaleUpperCase('pt-BR')) },
  { name: 'TRIM', pt: 'ARRUMAR', sig: 'texto', desc: 'Tira espaços sobrando.', cat: 'Texto', min: 1, max: 1, fn: (a) => str(a[0]).trim().replace(/ {2,}/g, ' ') },
  { name: 'SUBSTITUTE', pt: 'SUBSTITUIR', sig: 'texto; antigo; novo; [ocorrência]', desc: 'Troca um trecho por outro.', cat: 'Texto', min: 3, max: 4, fn: (a) => {
    const t = str(a[0]); const old = str(a[1]); const neu = str(a[2]);
    if (!old) return t;
    if (!a[3]) return t.split(old).join(neu);
    const k = num(a[3]); let idx = -1;
    for (let i = 0; i < k; i++) { idx = t.indexOf(old, idx + 1); if (idx < 0) return t; }
    return t.slice(0, idx) + neu + t.slice(idx + old.length);
  } },
  { name: 'REPLACE', pt: 'MUDAR', sig: 'texto; início; n; novo', desc: 'Troca n caracteres a partir de início.', cat: 'Texto', min: 4, max: 4, fn: (a) => { const t = [...str(a[0])]; const s = num(a[1]) - 1; t.splice(s, num(a[2]), str(a[3])); return t.join(''); } },
  { name: 'FIND', pt: 'PROCURAR', sig: 'procurado; texto; [início]', desc: 'Posição do trecho (diferencia maiúsculas).', cat: 'Texto', min: 2, max: 3, fn: (a) => { const i = str(a[1]).indexOf(str(a[0]), num(a[2], 1) - 1); return i < 0 ? fail('#VALUE!', 'não encontrado') : i + 1; } },
  { name: 'SEARCH', pt: 'LOCALIZAR', sig: 'procurado; texto; [início]', desc: 'Posição do trecho (ignora maiúsculas, aceita * e ?).', cat: 'Texto', min: 2, max: 3, fn: (a) => {
    const pat = str(a[0]); const t = str(a[1]); const start = num(a[2], 1) - 1;
    const re = new RegExp(pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');
    const m = re.exec(t.slice(start)); return m ? m.index + start + 1 : fail('#VALUE!', 'não encontrado');
  } },
  { name: 'TEXT', pt: 'TEXTO', sig: 'valor; formato', desc: 'Número como texto formatado. Ex.: TEXTO(A1; "dd/mm/yyyy").', cat: 'Texto', min: 2, max: 2, fn: (a) => { const x = v(a[0]); return typeof x === 'number' ? formatNumber(x, str(a[1])) : toStr(x); } },
  { name: 'VALUE', pt: 'VALOR', sig: 'texto', desc: 'Converte texto em número.', cat: 'Texto', min: 1, max: 1, fn: (a) => toNum(v(a[0])) },
  { name: 'REPT', pt: 'REPT', sig: 'texto; vezes', desc: 'Repete o texto. Bom para barrinhas: REPT("█"; A1).', cat: 'Texto', min: 2, max: 2, fn: (a) => str(a[0]).repeat(Math.max(0, Math.floor(num(a[1])))) },
  { name: 'EXACT', pt: 'EXATO', sig: 'texto1; texto2', desc: 'Iguais, diferenciando maiúsculas?', cat: 'Texto', min: 2, max: 2, fn: (a) => str(a[0]) === str(a[1]) },
  { name: 'CHAR', pt: 'CARACT', sig: 'código', desc: 'Caractere do código.', cat: 'Texto', min: 1, max: 1, fn: (a) => String.fromCodePoint(num(a[0])) },
  { name: 'CODE', pt: 'CÓDIGO', sig: 'texto', desc: 'Código do primeiro caractere.', cat: 'Texto', min: 1, max: 1, fn: (a) => str(a[0]).codePointAt(0) ?? fail('#VALUE!') },

  // Data e hora
  { name: 'TODAY', pt: 'HOJE', sig: '', desc: 'Data de hoje.', cat: 'Data e hora', max: 0, volatile: true, fn: (_a, c) => Math.floor(jsToSerial(c.now())) },
  { name: 'NOW', pt: 'AGORA', sig: '', desc: 'Data e hora de agora.', cat: 'Data e hora', max: 0, volatile: true, fn: (_a, c) => jsToSerial(c.now()) },
  { name: 'DATE', pt: 'DATA', sig: 'ano; mês; dia', desc: 'Monta uma data. Meses e dias além do limite viram o próximo.', cat: 'Data e hora', min: 3, max: 3, fn: (a) => { const d = new Date(Date.UTC(num(a[0]), num(a[1]) - 1, num(a[2]))); return dateToSerial(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } },
  { name: 'TIME', pt: 'TEMPO', sig: 'hora; minuto; segundo', desc: 'Monta um horário.', cat: 'Data e hora', min: 3, max: 3, fn: (a) => (((num(a[0]) * 3600 + num(a[1]) * 60 + num(a[2])) / 86400) % 1 + 1) % 1 },
  { name: 'YEAR', pt: 'ANO', sig: 'data', desc: 'Ano da data.', cat: 'Data e hora', min: 1, max: 1, fn: (a) => ymd(num(a[0])).y },
  { name: 'MONTH', pt: 'MÊS', sig: 'data', desc: 'Mês da data (1 a 12).', cat: 'Data e hora', min: 1, max: 1, fn: (a) => ymd(num(a[0])).m },
  { name: 'DAY', pt: 'DIA', sig: 'data', desc: 'Dia do mês.', cat: 'Data e hora', min: 1, max: 1, fn: (a) => ymd(num(a[0])).d },
  { name: 'HOUR', pt: 'HORA', sig: 'horário', desc: 'Hora (0 a 23).', cat: 'Data e hora', min: 1, max: 1, fn: (a) => serialToDate(num(a[0])).getUTCHours() },
  { name: 'MINUTE', pt: 'MINUTO', sig: 'horário', desc: 'Minuto (0 a 59).', cat: 'Data e hora', min: 1, max: 1, fn: (a) => serialToDate(num(a[0])).getUTCMinutes() },
  { name: 'SECOND', pt: 'SEGUNDO', sig: 'horário', desc: 'Segundo (0 a 59).', cat: 'Data e hora', min: 1, max: 1, fn: (a) => serialToDate(num(a[0])).getUTCSeconds() },
  { name: 'WEEKDAY', pt: 'DIA.DA.SEMANA', sig: 'data; [tipo]', desc: 'Dia da semana (1 = domingo, ou tipo 2: 1 = segunda).', cat: 'Data e hora', min: 1, max: 2, fn: (a) => { const d = ymd(num(a[0])).dow; const t = num(a[1], 1); return t === 2 ? ((d + 6) % 7) + 1 : t === 3 ? (d + 6) % 7 : d + 1; } },
  { name: 'WEEKNUM', pt: 'NÚMSEMANA', sig: 'data; [tipo]', desc: 'Número da semana no ano.', cat: 'Data e hora', min: 1, max: 2, fn: (a) => { const s = Math.floor(num(a[0])); const { y } = ymd(s); const jan1 = dateToSerial(y, 1, 1); const off = num(a[1], 1) === 2 ? (ymd(jan1).dow + 6) % 7 : ymd(jan1).dow; return Math.floor((s - jan1 + off) / 7) + 1; } },
  { name: 'DAYS', pt: 'DIAS', sig: 'data_final; data_inicial', desc: 'Dias entre duas datas.', cat: 'Data e hora', min: 2, max: 2, xlfn: true, fn: (a) => Math.floor(num(a[0])) - Math.floor(num(a[1])) },
  { name: 'DATEDIF', pt: 'DATADIF', sig: 'início; fim; unidade', desc: 'Diferença em "Y" anos, "M" meses ou "D" dias. Ex.: idade.', cat: 'Data e hora', min: 3, max: 3, fn: (a) => {
    const s = ymd(num(a[0])); const e = ymd(num(a[1])); const u = str(a[2]).toUpperCase();
    if (num(a[0]) > num(a[1])) fail('#NUM!');
    const months = (e.y - s.y) * 12 + (e.m - s.m) - (e.d < s.d ? 1 : 0);
    if (u === 'Y') return Math.floor(months / 12);
    if (u === 'M') return months;
    if (u === 'D') return Math.floor(num(a[1])) - Math.floor(num(a[0]));
    if (u === 'YM') return months % 12;
    if (u === 'MD') return e.d >= s.d ? e.d - s.d : e.d + new Date(Date.UTC(e.y, e.m - 1, 0)).getUTCDate() - s.d;
    return fail('#NUM!', 'unidade deve ser Y, M, D, YM ou MD');
  } },
  { name: 'EDATE', pt: 'DATAM', sig: 'data; meses', desc: 'A mesma data, n meses depois.', cat: 'Data e hora', min: 2, max: 2, fn: (a) => addMonths(num(a[0]), num(a[1]), false) },
  { name: 'EOMONTH', pt: 'FIMMÊS', sig: 'data; meses', desc: 'Último dia do mês, n meses depois.', cat: 'Data e hora', min: 2, max: 2, fn: (a) => addMonths(num(a[0]), num(a[1]), true) },
  { name: 'NETWORKDAYS', pt: 'DIATRABALHOTOTAL', sig: 'início; fim; [feriados]', desc: 'Dias úteis (seg a sex) entre as datas, inclusive.', cat: 'Data e hora', min: 2, max: 3, fn: (a) => {
    let s = Math.floor(num(a[0])); let e = Math.floor(num(a[1])); const sign = s > e ? -1 : 1; if (s > e) [s, e] = [e, s];
    const hol = new Set(a[2] ? numbers([a[2]]).map(Math.floor) : []); let n = 0;
    for (let d = s; d <= e; d++) { const w = ymd(d).dow; if (w !== 0 && w !== 6 && !hol.has(d)) n++; }
    return sign * n;
  } },
  { name: 'WORKDAY', pt: 'DIATRABALHO', sig: 'início; dias; [feriados]', desc: 'A data depois de n dias úteis.', cat: 'Data e hora', min: 2, max: 3, fn: (a) => {
    let d = Math.floor(num(a[0])); let n = Math.trunc(num(a[1])); const step = n < 0 ? -1 : 1; const hol = new Set(a[2] ? numbers([a[2]]).map(Math.floor) : []);
    while (n !== 0) { d += step; const w = ymd(d).dow; if (w !== 0 && w !== 6 && !hol.has(d)) n -= step; }
    return d;
  } },

  // Pesquisa
  { name: 'VLOOKUP', pt: 'PROCV', sig: 'procurado; tabela; coluna; [aproximado]', desc: 'Procura na 1ª coluna da tabela e devolve a coluna indicada. Use FALSO para busca exata.', cat: 'Pesquisa', min: 3, max: 4, fn: (a) => {
    const t = matrix(a[1]!); const col = Math.floor(num(a[2])); if (col < 1 || col > t.w) fail('#REF!', 'coluna fora da tabela');
    const i = lookupIndex(v(a[0]), t.rows.map((r) => r[0] ?? null), bool(a[3], true));
    return i < 0 ? err('#N/A', 'não encontrado') : t.at(i, col - 1);
  } },
  { name: 'HLOOKUP', pt: 'PROCH', sig: 'procurado; tabela; linha; [aproximado]', desc: 'Procura na 1ª linha da tabela e devolve a linha indicada.', cat: 'Pesquisa', min: 3, max: 4, fn: (a) => {
    const t = matrix(a[1]!); const row = Math.floor(num(a[2])); if (row < 1 || row > t.h) fail('#REF!');
    const i = lookupIndex(v(a[0]), t.rows[0] ?? [], bool(a[3], true));
    return i < 0 ? err('#N/A', 'não encontrado') : t.at(row - 1, i);
  } },
  { name: 'XLOOKUP', pt: 'PROCX', sig: 'procurado; onde_procurar; o_que_devolver; [se_não_achar]; [modo]', desc: 'Procura e devolve o item correspondente. Mais simples que PROCV.', cat: 'Pesquisa', min: 3, max: 5, xlfn: true, fn: (a) => {
    const look = matrix(a[1]!); const ret = matrix(a[2]!); const list = [...look.values()]; const needle = v(a[0]); const mode = num(a[4], 0);
    let i = lookupIndex(needle, list, false);
    if (i < 0 && (mode === -1 || mode === 1)) {
      let best = -1;
      list.forEach((x, k) => { if (typeof x !== typeof needle || x === null || isErr(x)) return; const d = compare(x, needle); if ((mode === -1 && d < 0 && (best < 0 || compare(x, list[best]!) > 0)) || (mode === 1 && d > 0 && (best < 0 || compare(x, list[best]!) < 0))) best = k; });
      i = best;
    }
    if (i < 0) return a[3] ? a[3].get() : err('#N/A', 'não encontrado');
    if (look.w === 1) return ret.w === 1 ? ret.at(i, 0) : new Matrix([ret.rows[i] ?? []]);
    return ret.h === 1 ? ret.at(0, i) : new Matrix(ret.rows.map((r) => [r[i] ?? null]));
  } },
  { name: 'INDEX', pt: 'ÍNDICE', sig: 'intervalo; linha; [coluna]', desc: 'Valor na linha e coluna do intervalo.', cat: 'Pesquisa', min: 2, max: 3, fn: (a) => {
    const m = matrix(a[0]!); let r = Math.floor(num(a[1])); let c = Math.floor(num(a[2], 0));
    if (m.h === 1 && !a[2]) [r, c] = [1, r];
    if (r === 0 && c > 0) return new Matrix(m.rows.map((row) => [row[c - 1] ?? null]));
    if (c === 0 && m.w > 1) return new Matrix([m.rows[r - 1] ?? []]);
    if (c === 0) c = 1;
    return r < 1 || r > m.h || c < 1 || c > m.w ? fail('#REF!') : m.at(r - 1, c - 1);
  } },
  { name: 'MATCH', pt: 'CORRESP', sig: 'procurado; intervalo; [tipo]', desc: 'Posição do valor no intervalo. Tipo 0 = exato.', cat: 'Pesquisa', min: 2, max: 3, fn: (a) => {
    const list = [...matrix(a[1]!).values()]; const t = num(a[2], 1); const needle = v(a[0]);
    let i: number;
    if (t === 0) i = lookupIndex(needle, list, false);
    else if (t > 0) i = lookupIndex(needle, list, true);
    else { i = -1; for (let k = 0; k < list.length; k++) { const x = list[k]!; if (x !== null && !isErr(x) && compare(x, needle) >= 0) i = k; else break; } }
    return i < 0 ? err('#N/A', 'não encontrado') : i + 1;
  } },
  { name: 'ROWS', pt: 'LINS', sig: 'intervalo', desc: 'Quantas linhas o intervalo tem.', cat: 'Pesquisa', min: 1, max: 1, fn: (a) => matrix(a[0]!).h },
  { name: 'COLUMNS', pt: 'COLS', sig: 'intervalo', desc: 'Quantas colunas o intervalo tem.', cat: 'Pesquisa', min: 1, max: 1, fn: (a) => matrix(a[0]!).w },
  { name: 'ROW', pt: 'LIN', sig: '[referência]', desc: 'Número da linha.', cat: 'Pesquisa', max: 1, fn: (a, c) => (a[0] ? (c.rectOf(a[0].node) ?? fail('#VALUE!')).r0 : c.row) + 1 },
  { name: 'COLUMN', pt: 'COL', sig: '[referência]', desc: 'Número da coluna.', cat: 'Pesquisa', max: 1, fn: (a, c) => (a[0] ? (c.rectOf(a[0].node) ?? fail('#VALUE!')).c0 : c.col) + 1 },

  // Informação
  { name: 'ISBLANK', pt: 'ÉCÉL.VAZIA', sig: 'valor', desc: 'A célula está vazia?', cat: 'Informação', min: 1, max: 1, fn: (a) => v(a[0]) === null },
  { name: 'ISNUMBER', pt: 'ÉNÚM', sig: 'valor', desc: 'É número?', cat: 'Informação', min: 1, max: 1, fn: (a) => typeof v(a[0]) === 'number' },
  { name: 'ISTEXT', pt: 'ÉTEXTO', sig: 'valor', desc: 'É texto?', cat: 'Informação', min: 1, max: 1, fn: (a) => typeof v(a[0]) === 'string' },
  { name: 'ISLOGICAL', pt: 'ÉLÓGICO', sig: 'valor', desc: 'É VERDADEIRO ou FALSO?', cat: 'Informação', min: 1, max: 1, fn: (a) => typeof v(a[0]) === 'boolean' },
  { name: 'ISERROR', pt: 'ÉERROS', sig: 'valor', desc: 'É algum erro?', cat: 'Informação', min: 1, max: 1, fn: (a) => { try { return isErr(v(a[0])); } catch (e) { if (e instanceof Abort) return true; throw e; } } },
  { name: 'ISNA', pt: 'É.NÃO.DISP', sig: 'valor', desc: 'É #N/D?', cat: 'Informação', min: 1, max: 1, fn: (a) => { const x = v(a[0]); return isErr(x) && x.code === '#N/A'; } },
  { name: 'ISEVEN', pt: 'ÉPAR', sig: 'número', desc: 'É par?', cat: 'Informação', min: 1, max: 1, fn: (a) => Math.floor(Math.abs(num(a[0]))) % 2 === 0 },
  { name: 'ISODD', pt: 'ÉIMPAR', sig: 'número', desc: 'É ímpar?', cat: 'Informação', min: 1, max: 1, fn: (a) => Math.floor(Math.abs(num(a[0]))) % 2 === 1 },
  { name: 'NA', pt: 'NÃO.DISP', sig: '', desc: 'O erro #N/D, de propósito.', cat: 'Informação', max: 0, fn: () => err('#N/A') },
  { name: 'N', pt: 'N', sig: 'valor', desc: 'Converte em número (texto vira 0).', cat: 'Informação', min: 1, max: 1, fn: (a) => { const x = v(a[0]); return typeof x === 'number' ? x : typeof x === 'boolean' ? +x : isErr(x) ? x : 0; } },

  // Finanças
  { name: 'PMT', pt: 'PGTO', sig: 'taxa; períodos; valor_presente; [valor_futuro]; [tipo]', desc: 'Parcela de um financiamento. Taxa por período (ex.: 1% ao mês).', cat: 'Finanças', min: 3, max: 5, fn: (a) => {
    const r = num(a[0]); const n = num(a[1]); const pv = num(a[2]); const fv = num(a[3], 0); const t = num(a[4], 0);
    if (r === 0) return -(pv + fv) / n;
    const f = (1 + r) ** n; return (-r * (pv * f + fv)) / ((1 + r * t) * (f - 1));
  } },
  { name: 'FV', pt: 'VF', sig: 'taxa; períodos; pagamento; [valor_presente]; [tipo]', desc: 'Quanto um investimento vai valer. Aportes como negativos.', cat: 'Finanças', min: 3, max: 5, fn: (a) => {
    const r = num(a[0]); const n = num(a[1]); const pmt = num(a[2]); const pv = num(a[3], 0); const t = num(a[4], 0);
    if (r === 0) return -(pv + pmt * n);
    const f = (1 + r) ** n; return -(pv * f + (pmt * (1 + r * t) * (f - 1)) / r);
  } },
  { name: 'PV', pt: 'VP', sig: 'taxa; períodos; pagamento; [valor_futuro]; [tipo]', desc: 'Valor presente de uma série de pagamentos.', cat: 'Finanças', min: 3, max: 5, fn: (a) => {
    const r = num(a[0]); const n = num(a[1]); const pmt = num(a[2]); const fv = num(a[3], 0); const t = num(a[4], 0);
    if (r === 0) return -(fv + pmt * n);
    const f = (1 + r) ** n; return -(fv + (pmt * (1 + r * t) * (f - 1)) / r) / f;
  } },
  { name: 'NPER', pt: 'NPER', sig: 'taxa; pagamento; valor_presente; [valor_futuro]; [tipo]', desc: 'Quantos períodos até quitar ou atingir a meta.', cat: 'Finanças', min: 3, max: 5, fn: (a) => {
    const r = num(a[0]); const pmt = num(a[1]); const pv = num(a[2]); const fv = num(a[3], 0); const t = num(a[4], 0);
    if (r === 0) return -(pv + fv) / pmt;
    const k = pmt * (1 + r * t); return Math.log((k - fv * r) / (k + pv * r)) / Math.log(1 + r);
  } },
  { name: 'RATE', pt: 'TAXA', sig: 'períodos; pagamento; valor_presente; [valor_futuro]; [tipo]; [estimativa]', desc: 'Taxa de juros por período.', cat: 'Finanças', min: 3, max: 6, fn: (a) => {
    const n = num(a[0]); const pmt = num(a[1]); const pv = num(a[2]); const fv = num(a[3], 0); const t = num(a[4], 0);
    return newton((r) => (Math.abs(r) < 1e-12 ? pv + pmt * n + fv : pv * (1 + r) ** n + (pmt * (1 + r * t) * ((1 + r) ** n - 1)) / r + fv), num(a[5], 0.1));
  } },
  { name: 'NPV', pt: 'VPL', sig: 'taxa; valor1; [valor2; ...]', desc: 'Valor presente líquido de fluxos futuros.', cat: 'Finanças', min: 2, fn: (a) => { const r = num(a[0]); return numbers(a.slice(1)).reduce((s, x, i) => s + x / (1 + r) ** (i + 1), 0); } },
  { name: 'IRR', pt: 'TIR', sig: 'fluxos; [estimativa]', desc: 'Taxa interna de retorno.', cat: 'Finanças', min: 1, max: 2, fn: (a) => { const xs = numbers([a[0]!]); return newton((r) => xs.reduce((s, x, i) => s + x / (1 + r) ** i, 0), num(a[1], 0.1)); } },
];

function pairedNumbers(ya: Arg, xa: Arg): [number[], number[]] {
  const ys = [...matrix(ya).values()];
  const xs = [...matrix(xa).values()];
  if (ys.length !== xs.length) fail('#N/A', 'tamanhos diferentes');
  const X: number[] = [];
  const Y: number[] = [];
  ys.forEach((y, i) => {
    const x = xs[i]!;
    if (typeof x === 'number' && typeof y === 'number') {
      X.push(x);
      Y.push(y);
    }
  });
  return [Y, X];
}

function linreg(ya: Arg, xa: Arg): { m: number; b: number } {
  const [ys, xs] = pairedNumbers(ya, xa);
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) ** 2;
  });
  if (sxx === 0) fail('#DIV/0!');
  const m = sxy / sxx;
  return { m, b: my - m * mx };
}

// ---------------------------------------------------------------------------

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const FUNCTIONS = new Map<string, FnDef>(F.map((f) => [f.name, f]));
const ALIASES = new Map<string, string>();
for (const f of F) {
  ALIASES.set(f.pt, f.name);
  ALIASES.set(strip(f.pt), f.name); // aceita sem acento: MEDIA, MAXIMO
}
// nomes antigos ou de outros apps
for (const [k, val] of Object.entries({ 'CONT.NUM': 'COUNT', 'STDEV.S': 'STDEV', 'STDEV.P': 'STDEVP', 'VAR.S': 'VAR', 'VAR.P': 'VARP', 'MODE.SNGL': 'MODE', 'CEILING.MATH': 'CEILING', 'FLOOR.MATH': 'FLOOR', 'PROCX': 'XLOOKUP', 'SEERRO': 'IFERROR', 'NAO': 'NOT' }))
  ALIASES.set(k, val);

export function canonicalName(upper: string): string {
  const u = upper.replace(/^_XLFN\.|^_XLWS\./, '');
  if (FUNCTIONS.has(u)) return u;
  return ALIASES.get(u) ?? ALIASES.get(strip(u)) ?? u;
}

export const needsXlfn = (canon: string): string => (FUNCTIONS.get(canon)?.xlfn ? `_xlfn.${canon}` : canon);

/** Para o autocompletar: funções cujo nome (em pt ou en) começa com o prefixo. */
export function suggest(prefix: string, limit = 8): FnDef[] {
  const p = strip(prefix.toUpperCase());
  if (!p) return [];
  const starts = F.filter((f) => strip(f.pt).startsWith(p) || f.name.startsWith(p));
  const contains = F.filter((f) => !starts.includes(f) && (strip(f.pt).includes(p) || f.name.includes(p) || (p.length >= 4 && strip(f.desc.toUpperCase()).includes(p))));
  return [...starts, ...contains].slice(0, limit);
}

export { CellError };
