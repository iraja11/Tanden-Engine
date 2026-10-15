/*
 * Linguagem das fórmulas e filtros dos bancos de dados, no mesmo formato das
 * Bases do Obsidian:
 *
 *   status != "feito" && prazo < today()
 *   if(horas > 8, "longo", "curto")
 *   tarefas.horas.sum()                  ← soma "horas" das notas ligadas (rollup)
 *   file.hasTag("leitura") && file.inFolder("Livros")
 *   tags.filter(value.startsWith("a")).length
 *
 * Valores: texto, número, sim/não, data, link, lista, nulo. Uma propriedade com
 * [[link]] é um link; pedir uma propriedade de um link lê a nota ligada, e pedir
 * de uma lista aplica em cada item. Erros viram um valor de erro, nunca exceção
 * para fora: uma fórmula quebrada mostra "#erro" só na própria célula.
 */

export class Link {
  constructor(readonly target: string, readonly label?: string) {}
  toString(): string {
    return this.label || this.target;
  }
}

export class ExprError {
  constructor(readonly message: string) {}
  toString(): string {
    return `#erro: ${this.message}`;
  }
}

export type Value = string | number | boolean | null | Date | Link | ExprError | Value[] | Obj;
/** objeto com campos calculados sob demanda (file, note, formula, uma nota ligada) */
export interface Obj {
  readonly kind: 'obj';
  get(name: string): Value;
  call?(name: string, args: Value[]): Value | undefined;
  label?: string;
}

export const isObj = (v: Value): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v) && (v as Obj).kind === 'obj';

// ------------------------------------------------------------------ análise

type Node =
  | { t: 'lit'; v: Value }
  | { t: 'id'; name: string }
  | { t: 'list'; items: Node[] }
  | { t: 'get'; obj: Node; name: string }
  | { t: 'idx'; obj: Node; index: Node }
  | { t: 'call'; fn: Node; args: Node[] }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'cond'; c: Node; a: Node; b: Node };

interface Tok {
  k: 'num' | 'str' | 'id' | 'op' | 'end';
  v: string;
  at: number;
}

const ID_START = /[\p{L}_$]/u;
const ID_PART = /[\p{L}\p{N}_$]/u;
const OPS = ['===', '!==', '==', '!=', '>=', '<=', '&&', '||', '??', '+', '-', '*', '/', '%', '>', '<', '!', '(', ')', '[', ']', ',', '.', '?', ':'];

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;
      out.push({ k: 'num', v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const n = src[++j]!;
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
        } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new SyntaxError('texto sem aspas de fechamento');
      out.push({ k: 'str', v: s, at: i });
      i = j + 1;
      continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < src.length && ID_PART.test(src[j]!)) j++;
      out.push({ k: 'id', v: src.slice(i, j), at: i });
      i = j;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new SyntaxError(`símbolo inesperado "${c}"`);
    out.push({ k: 'op', v: op, at: i });
    i += op.length;
  }
  out.push({ k: 'end', v: '', at: src.length });
  return out;
}

const PREC: Record<string, number> = {
  '??': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '===': 4, '!==': 4,
  '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7,
};
const WORD_OPS: Record<string, string> = { and: '&&', or: '||', e: '&&', ou: '||' };

export function parseExpr(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p]!;
  const next = () => toks[p++]!;
  const isOp = (v: string) => peek().k === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new SyntaxError(`esperava "${v}"`);
    p++;
  };
  const binOp = (): string | null => {
    const t = peek();
    if (t.k === 'op' && t.v in PREC) return t.v;
    if (t.k === 'id' && t.v.toLowerCase() in WORD_OPS) return WORD_OPS[t.v.toLowerCase()]!;
    return null;
  };

  function expr(): Node {
    const c = binary(0);
    if (isOp('?')) {
      p++;
      const a = expr();
      expect(':');
      const b = expr();
      return { t: 'cond', c, a, b };
    }
    return c;
  }
  function binary(min: number): Node {
    let a = unary();
    for (;;) {
      const op = binOp();
      if (!op || PREC[op]! <= min) return a;
      p++;
      const b = binary(PREC[op]!);
      a = { t: 'bin', op, a, b };
    }
  }
  function unary(): Node {
    if (isOp('!') || isOp('-') || isOp('+')) return { t: 'un', op: next().v, a: unary() };
    if (peek().k === 'id' && /^(not|não|nao)$/i.test(peek().v) && toks[p + 1]?.k !== 'op') {
      p++;
      return { t: 'un', op: '!', a: unary() };
    }
    return postfix(primary());
  }
  function postfix(n: Node): Node {
    for (;;) {
      if (isOp('.')) {
        p++;
        const t = next();
        if (t.k !== 'id' && t.k !== 'num') throw new SyntaxError('esperava um nome depois do ponto');
        n = { t: 'get', obj: n, name: t.v };
      } else if (isOp('[')) {
        p++;
        const index = expr();
        expect(']');
        n = { t: 'idx', obj: n, index };
      } else if (isOp('(')) {
        p++;
        const args: Node[] = [];
        if (!isOp(')')) {
          do args.push(expr());
          while (isOp(',') && ++p);
        }
        expect(')');
        n = { t: 'call', fn: n, args };
      } else return n;
    }
  }
  function primary(): Node {
    const t = next();
    if (t.k === 'num') return { t: 'lit', v: Number(t.v) };
    if (t.k === 'str') return { t: 'lit', v: t.v };
    if (t.k === 'id') {
      const low = t.v.toLowerCase();
      if (low === 'true' || low === 'verdadeiro') return { t: 'lit', v: true };
      if (low === 'false' || low === 'falso') return { t: 'lit', v: false };
      if (low === 'null' || low === 'nulo') return { t: 'lit', v: null };
      return { t: 'id', name: t.v };
    }
    if (t.k === 'op' && t.v === '(') {
      const e = expr();
      expect(')');
      return e;
    }
    if (t.k === 'op' && t.v === '[') {
      const items: Node[] = [];
      if (!isOp(']')) {
        do items.push(expr());
        while (isOp(',') && ++p);
      }
      expect(']');
      return { t: 'list', items };
    }
    throw new SyntaxError(t.k === 'end' ? 'a expressão terminou cedo' : `"${t.v}" fora do lugar`);
  }

  const n = expr();
  if (peek().k !== 'end') throw new SyntaxError(`"${peek().v}" sobrando`);
  return n;
}

// ------------------------------------------------------------------ valores

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** "2026-10-15" ou "2026-10-15T14:30" → Date local; outra coisa → null */
export function parseDate(s: string): Date | null {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const hasTime = (d: Date): boolean => d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
/** Data no formato das propriedades do Obsidian. */
export function isoDate(d: Date, withTime = hasTime(d)): string {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Formato no estilo Moment, que é o que as Bases usam: "DD/MM/YYYY HH:mm". */
export function formatDate(d: Date, fmt: string): string {
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|mm|ss/g, (t, lit: string | undefined) => {
    if (lit !== undefined) return lit;
    switch (t) {
      case 'YYYY': return String(d.getFullYear());
      case 'YY': return pad(d.getFullYear() % 100);
      case 'MMMM': return MESES_LONGOS[d.getMonth()]!;
      case 'MMM': return MESES[d.getMonth()]!;
      case 'MM': return pad(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'DD': return pad(d.getDate());
      case 'D': return String(d.getDate());
      case 'dddd': return DIAS[d.getDay()]!;
      case 'ddd': return DIAS[d.getDay()]!.slice(0, 3);
      case 'HH': return pad(d.getHours());
      case 'H': return String(d.getHours());
      case 'mm': return pad(d.getMinutes());
      case 'ss': return pad(d.getSeconds());
    }
    return t;
  });
}

/** "1d", "2 semanas", "-3 months", "1h" → milissegundos */
export function parseDuration(s: string): number | null {
  const units: Array<[RegExp, number]> = [
    [/^(y|yr|years?|anos?|a)$/, 365 * 864e5], [/^(M|mo|months?|m[eê]s|meses)$/, 30 * 864e5],
    [/^(w|wk|weeks?|semanas?|sem)$/, 7 * 864e5], [/^(d|days?|dias?)$/, 864e5],
    [/^(h|hr|hours?|horas?)$/, 36e5], [/^(m|min|minutes?|minutos?)$/, 6e4], [/^(s|sec|seconds?|segundos?)$/, 1e3],
  ];
  let total = 0;
  let any = false;
  for (const m of s.trim().matchAll(/([+-]?\d+(?:\.\d+)?)\s*([a-zA-Zçêã]+)/g)) {
    const u = units.find(([re]) => re.test(m[2]!) || re.test(m[2]!.toLowerCase()));
    if (!u) return null;
    total += Number(m[1]) * u[1];
    any = true;
  }
  return any ? total : null;
}

/** Soma uma duração respeitando meses e anos de calendário. */
function addDuration(d: Date, s: string, sign = 1): Date | null {
  const out = new Date(d);
  let any = false;
  for (const m of s.trim().matchAll(/([+-]?\d+)\s*([a-zA-Zçêã]+)/g)) {
    const n = Number(m[1]) * sign;
    const u = m[2]!;
    any = true;
    if (/^(y|yr|years?|anos?|a)$/i.test(u)) out.setFullYear(out.getFullYear() + n);
    else if (u === 'M' || /^(mo|months?|m[eê]s|meses)$/i.test(u)) out.setMonth(out.getMonth() + n);
    else {
      const ms = parseDuration(`${m[1]}${u}`);
      if (ms === null) return null;
      out.setTime(out.getTime() + ms * sign);
    }
  }
  return any ? out : null;
}

/** Texto de uma propriedade → valor tipado (números, sim/não, datas, links). */
export function autoValue(raw: string | string[] | undefined): Value {
  if (raw === undefined) return null;
  if (Array.isArray(raw)) return raw.map((x) => autoValue(x));
  const s = raw.trim();
  if (s === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  const link = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/.exec(s);
  if (link) return new Link(link[1]!.trim(), link[2]?.trim());
  const d = parseDate(s);
  if (d) return d;
  return s;
}

export function truthy(v: Value): boolean {
  if (v instanceof ExprError) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Date) return true;
  if (v instanceof Link) return true;
  return !!v;
}

export function isEmpty(v: Value): boolean {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'number' && Number.isNaN(v));
}

/** Valor como texto para mostrar ou comparar. */
export function show(v: Value): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDate(v);
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (isObj(v)) return v.label ?? '';
  return String(v);
}

function toNum(v: Value): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  if (v === null) return 0;
  return NaN;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function eq(a: Value, b: Value): boolean {
  if (a instanceof Link || b instanceof Link) return fold(linkName(a)) === fold(linkName(b));
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date && typeof b === 'string') return isoDate(a) === b || isoDate(a, true) === b;
  if (b instanceof Date && typeof a === 'string') return eq(b, a);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]!));
  if (isEmpty(a) && isEmpty(b)) return true;
  if (typeof a === 'number' && typeof b === 'string') return a === toNum(b);
  if (typeof b === 'number' && typeof a === 'string') return b === toNum(a);
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  return a === b;
}

function linkName(v: Value): string {
  if (v instanceof Link) return v.target.split('/').pop()!.replace(/\.md$/i, '');
  return show(v).replace(/^\[\[|\]\]$/g, '').split('/').pop()!.replace(/\.md$/i, '');
}

export function compare(a: Value, b: Value): number {
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea || eb) return ea && eb ? 0 : ea ? 1 : -1; // vazios sempre no fim
  if (a instanceof Date || b instanceof Date) {
    const da = a instanceof Date ? a : parseDate(show(a));
    const db = b instanceof Date ? b : parseDate(show(b));
    if (da && db) return da.getTime() - db.getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const na = toNum(a);
  const nb = toNum(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && typeof a !== 'string' && typeof b !== 'string') return na - nb;
  return show(a).localeCompare(show(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

// ------------------------------------------------------------------ avaliação

export interface Scope {
  /** nome solto (sem "note." na frente): propriedade, variável ou objeto global */
  lookup(name: string): Value | undefined;
  /** propriedade de uma nota ligada, para rollups (tarefas.horas) */
  resolve?(link: Link): Obj | null;
  now?: Date;
}

type Lazy = () => Value;

const err = (m: string) => new ExprError(m);

function numOp(op: string, a: Value, b: Value): Value {
  // data ± duração
  if (a instanceof Date && (op === '+' || op === '-')) {
    if (typeof b === 'string') return addDuration(a, b, op === '-' ? -1 : 1) ?? err(`duração inválida "${b}"`);
    if (typeof b === 'number') return new Date(a.getTime() + (op === '-' ? -b : b));
    if (b instanceof Date && op === '-') return a.getTime() - b.getTime();
  }
  if (op === '+' && (typeof a === 'string' || typeof b === 'string' || a instanceof Link || b instanceof Link)) return show(a) + show(b);
  if (op === '+' && Array.isArray(a)) return [...a, ...(Array.isArray(b) ? b : [b])];
  const x = toNum(a);
  const y = toNum(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return err(`"${op}" precisa de números`);
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': return y === 0 ? err('divisão por zero') : x / y;
    case '%': return y === 0 ? err('divisão por zero') : x % y;
  }
  return err(op);
}

function evalNode(n: Node, s: Scope, locals: Record<string, Value>): Value {
  switch (n.t) {
    case 'lit': return n.v;
    case 'list': return n.items.map((x) => evalNode(x, s, locals));
    case 'id': {
      if (n.name in locals) return locals[n.name]!;
      const v = s.lookup(n.name);
      return v === undefined ? null : v;
    }
    case 'un': {
      const a = evalNode(n.a, s, locals);
      if (a instanceof ExprError) return a;
      if (n.op === '!') return !truthy(a);
      const x = toNum(a);
      return Number.isNaN(x) ? err('sinal em algo que não é número') : n.op === '-' ? -x : x;
    }
    case 'cond': return truthy(evalNode(n.c, s, locals)) ? evalNode(n.a, s, locals) : evalNode(n.b, s, locals);
    case 'bin': {
      if (n.op === '&&') { const a = evalNode(n.a, s, locals); return truthy(a) ? truthy(evalNode(n.b, s, locals)) : false; }
      if (n.op === '||') { const a = evalNode(n.a, s, locals); return truthy(a) ? true : truthy(evalNode(n.b, s, locals)); }
      if (n.op === '??') { const a = evalNode(n.a, s, locals); return isEmpty(a) ? evalNode(n.b, s, locals) : a; }
      const a = evalNode(n.a, s, locals);
      const b = evalNode(n.b, s, locals);
      if (a instanceof ExprError) return a;
      if (b instanceof ExprError) return b;
      switch (n.op) {
        case '==': case '===': return eq(a, b);
        case '!=': case '!==': return !eq(a, b);
        case '<': return !isEmpty(a) && !isEmpty(b) && compare(a, b) < 0;
        case '>': return !isEmpty(a) && !isEmpty(b) && compare(a, b) > 0;
        case '<=': return !isEmpty(a) && !isEmpty(b) && compare(a, b) <= 0;
        case '>=': return !isEmpty(a) && !isEmpty(b) && compare(a, b) >= 0;
      }
      return numOp(n.op, a, b);
    }
    case 'get': {
      const o = evalNode(n.obj, s, locals);
      return member(o, n.name, s);
    }
    case 'idx': {
      const o = evalNode(n.obj, s, locals);
      const i = evalNode(n.index, s, locals);
      if (Array.isArray(o) && typeof i === 'number') return o[i < 0 ? o.length + i : i] ?? null;
      if (typeof o === 'string' && typeof i === 'number') return o[i < 0 ? o.length + i : i] ?? null;
      return member(o, show(i), s);
    }
    case 'call': {
      const args: Lazy[] = n.args.map((a) => () => evalNode(a, s, locals));
      // os métodos de lista (filter, map...) avaliam o argumento com "value" de cada item
      const lambda = (item: Value, index: number) => n.args[0] ? evalNode(n.args[0], s, { ...locals, value: item, index, valor: item }) : null;
      if (n.fn.t === 'get') {
        const recv = evalNode(n.fn.obj, s, locals);
        if (recv instanceof ExprError) return recv;
        return method(recv, n.fn.name, args, lambda, s);
      }
      if (n.fn.t === 'id') return globalFn(n.fn.name, args, s);
      return err('chamada inválida');
    }
  }
}

function member(o: Value, name: string, s: Scope): Value {
  if (o instanceof ExprError) return o;
  if (o === null) return null;
  if (isObj(o)) return o.get(name);
  if (o instanceof Link) {
    const target = s.resolve?.(o);
    if (name === 'name' || name === 'nome') return target?.get('file.name') ?? linkName(o);
    return target ? target.get(name) : null;
  }
  if (Array.isArray(o)) {
    if (name === 'length' || name === 'tamanho') return o.length;
    // rollup: a mesma propriedade de cada item, achatada
    return o.flatMap((x) => {
      const v = member(x, name, s);
      return Array.isArray(v) ? v : [v];
    });
  }
  if (typeof o === 'string' && (name === 'length' || name === 'tamanho')) return o.length;
  if (o instanceof Date) {
    switch (name) {
      case 'year': case 'ano': return o.getFullYear();
      case 'month': case 'mes': case 'mês': return o.getMonth() + 1;
      case 'day': case 'dia': return o.getDate();
      case 'hour': case 'hora': return o.getHours();
      case 'minute': case 'minuto': return o.getMinutes();
      case 'weekday': case 'diaDaSemana': return o.getDay();
    }
  }
  return null;
}

const listOf = (v: Value): Value[] => (Array.isArray(v) ? v : isEmpty(v) ? [] : [v]);
const nums = (v: Value[]): number[] => v.flatMap((x) => (Array.isArray(x) ? x : [x])).map(toNum).filter((x) => !Number.isNaN(x));

function aggregate(name: string, list: Value[]): Value | undefined {
  const ns = () => nums(list);
  switch (name) {
    case 'sum': case 'soma': return ns().reduce((a, b) => a + b, 0);
    case 'mean': case 'average': case 'avg': case 'media': case 'média': { const x = ns(); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null; }
    case 'min': case 'minimo': case 'mínimo': { const x = list.filter((v) => !isEmpty(v)); return x.length ? x.reduce((a, b) => (compare(a, b) <= 0 ? a : b)) : null; }
    case 'max': case 'maximo': case 'máximo': { const x = list.filter((v) => !isEmpty(v)); return x.length ? x.reduce((a, b) => (compare(a, b) >= 0 ? a : b)) : null; }
    case 'median': case 'mediana': { const x = ns().sort((a, b) => a - b); if (!x.length) return null; const m = x.length >> 1; return x.length % 2 ? x[m]! : (x[m - 1]! + x[m]!) / 2; }
    case 'count': case 'contar': return list.filter((v) => !isEmpty(v)).length;
    case 'countUnique': case 'unicos': return new Set(list.filter((v) => !isEmpty(v)).map(show)).size;
  }
  return undefined;
}

function method(recv: Value, name: string, args: Lazy[], lambda: (v: Value, i: number) => Value, s: Scope): Value {
  const a = (i: number) => args[i]?.() ?? null;
  const str = (i: number) => show(a(i));
  if (isObj(recv)) {
    const r = recv.call?.(name, args.map((f) => f()));
    if (r !== undefined) return r;
  }
  // comuns a todos
  switch (name) {
    case 'isEmpty': case 'vazio': return isEmpty(recv);
    case 'isTruthy': return truthy(recv);
    case 'toString': case 'texto': return show(recv);
    case 'isType': { const t = str(0).toLowerCase(); return typeName(recv) === t; }
  }
  if (Array.isArray(recv)) {
    const agg = aggregate(name, recv);
    if (agg !== undefined) return agg;
    switch (name) {
      case 'contains': case 'contem': case 'contém': { const x = a(0); return recv.some((v) => eq(v, x)); }
      case 'containsAll': { const xs = listOf(a(0)); return xs.every((x) => recv.some((v) => eq(v, x))); }
      case 'containsAny': { const xs = args.length > 1 ? args.map((f) => f()) : listOf(a(0)); return xs.some((x) => recv.some((v) => eq(v, x))); }
      case 'join': case 'juntar': return recv.map(show).join(args.length ? str(0) : ', ');
      case 'unique': return recv.filter((v, i) => recv.findIndex((w) => eq(v, w)) === i);
      case 'sort': return [...recv].sort(compare);
      case 'reverse': return [...recv].reverse();
      case 'flat': return recv.flat() as Value[];
      case 'first': case 'primeiro': return recv[0] ?? null;
      case 'last': case 'ultimo': case 'último': return recv[recv.length - 1] ?? null;
      case 'slice': return recv.slice(toNum(a(0)) || 0, args.length > 1 ? toNum(a(1)) : undefined);
      case 'filter': case 'filtrar': return recv.filter((v, i) => truthy(lambda(v, i)));
      case 'map': case 'mapear': return recv.map((v, i) => lambda(v, i));
      case 'length': return recv.length;
    }
    return err(`lista não tem "${name}()"`);
  }
  if (recv instanceof Date) {
    switch (name) {
      case 'format': case 'formatar': return formatDate(recv, args.length ? str(0) : 'DD/MM/YYYY');
      case 'date': case 'data': { const d = new Date(recv); d.setHours(0, 0, 0, 0); return d; }
      case 'time': case 'hora': return formatDate(recv, 'HH:mm');
      case 'relative': case 'relativo': return relative(recv, s.now ?? new Date());
      case 'isToday': return isoDate(recv, false) === isoDate(s.now ?? new Date(), false);
    }
    return err(`data não tem "${name}()"`);
  }
  if (typeof recv === 'number') {
    switch (name) {
      case 'round': case 'arredondar': { const d = args.length ? toNum(a(0)) : 0; const f = 10 ** d; return Math.round(recv * f) / f; }
      case 'floor': return Math.floor(recv);
      case 'ceil': return Math.ceil(recv);
      case 'abs': return Math.abs(recv);
      case 'toFixed': return recv.toFixed(toNum(a(0)) || 0);
    }
    return err(`número não tem "${name}()"`);
  }
  if (recv instanceof Link) {
    switch (name) {
      case 'asFile': return s.resolve?.(recv)?.get('file') ?? null;
      case 'linksTo': return eq(recv, a(0));
    }
    // métodos de texto valem para o nome do link
    return method(linkName(recv), name, args, lambda, s);
  }
  if (recv === null) {
    if (name === 'contains' || name === 'startsWith' || name === 'endsWith' || name === 'containsAny' || name === 'containsAll') return false;
    if (name === 'length') return 0;
    return null;
  }
  if (typeof recv === 'boolean') return err(`sim/não não tem "${name}()"`);
  const t = String(recv);
  switch (name) {
    case 'contains': case 'contem': case 'contém': return fold(t).includes(fold(str(0)));
    case 'containsAll': return args.every((f) => fold(t).includes(fold(show(f()))));
    case 'containsAny': return args.some((f) => fold(t).includes(fold(show(f()))));
    case 'startsWith': case 'comecaCom': return fold(t).startsWith(fold(str(0)));
    case 'endsWith': case 'terminaCom': return fold(t).endsWith(fold(str(0)));
    case 'lower': case 'minusculas': return t.toLowerCase();
    case 'upper': case 'maiusculas': return t.toUpperCase();
    case 'title': return t.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
    case 'trim': return t.trim();
    case 'replace': case 'trocar': return t.split(str(0)).join(str(1));
    case 'split': case 'dividir': return t.split(str(0));
    case 'slice': return t.slice(toNum(a(0)) || 0, args.length > 1 ? toNum(a(1)) : undefined);
    case 'repeat': return t.repeat(Math.max(0, toNum(a(0)) || 0));
    case 'length': return t.length;
    case 'reverse': return [...t].reverse().join('');
    case 'toNumber': case 'numero': return toNum(t);
  }
  return err(`texto não tem "${name}()"`);
}

function typeName(v: Value): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Date) return 'date';
  if (v instanceof Link) return 'link';
  if (isObj(v)) return 'object';
  return typeof v;
}

function relative(d: Date, now: Date): string {
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 864e5);
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days === -1) return 'ontem';
  const abs = Math.abs(days);
  const txt = abs < 14 ? `${abs} dias` : abs < 60 ? `${Math.round(abs / 7)} semanas` : abs < 730 ? `${Math.round(abs / 30)} meses` : `${Math.round(abs / 365)} anos`;
  return days > 0 ? `em ${txt}` : `há ${txt}`;
}
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function globalFn(name: string, args: Lazy[], s: Scope): Value {
  const a = (i: number) => args[i]?.() ?? null;
  const all = () => args.map((f) => f());
  const now = s.now ?? new Date();
  switch (name) {
    case 'if': case 'se': return truthy(a(0)) ? a(1) : args.length > 2 ? a(2) : null;
    case 'now': case 'agora': return new Date(now);
    case 'today': case 'hoje': { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    case 'date': case 'data': { const v = a(0); if (v instanceof Date) return v; return parseDate(show(v)) ?? err(`data inválida "${show(v)}"`); }
    case 'number': case 'numero': case 'número': { const v = a(0); const n = v instanceof Date ? v.getTime() : toNum(v); return Number.isNaN(n) ? err('não é número') : n; }
    case 'string': case 'texto': return show(a(0));
    case 'list': case 'lista': return listOf(a(0));
    case 'link': return new Link(show(a(0)), args.length > 1 ? show(a(1)) : undefined);
    case 'duration': case 'duracao': return parseDuration(show(a(0))) ?? err('duração inválida');
    case 'days': case 'dias': {
      // dias entre duas datas (b - a); com uma, dias até hoje
      const x = a(0); const y = args.length > 1 ? a(1) : now;
      if (!(x instanceof Date) || !(y instanceof Date)) return null;
      return Math.round((startOfDay(y) - startOfDay(x)) / 864e5);
    }
    case 'min': case 'max': case 'sum': case 'soma': case 'mean': case 'average': case 'media': case 'média': case 'count':
      return aggregate(name, all().flatMap(listOf)) ?? null;
    case 'round': case 'arredondar': { const n = toNum(a(0)); const f = 10 ** (args.length > 1 ? toNum(a(1)) : 0); return Math.round(n * f) / f; }
    case 'abs': return Math.abs(toNum(a(0)));
    case 'floor': return Math.floor(toNum(a(0)));
    case 'ceil': return Math.ceil(toNum(a(0)));
    case 'sqrt': return Math.sqrt(toNum(a(0)));
    case 'pow': return toNum(a(0)) ** toNum(a(1));
    case 'concat': return all().map(show).join('');
    case 'empty': case 'vazio': return isEmpty(a(0));
    case 'escape': return show(a(0));
    case 'progress': case 'progresso': {
      // fração de itens marcados: progress(lista_de_sim_nao) ou progress(feitos, total)
      if (args.length > 1) { const t = toNum(a(1)); return t ? toNum(a(0)) / t : 0; }
      const l = listOf(a(0)); return l.length ? l.filter(truthy).length / l.length : 0;
    }
  }
  const v = s.lookup(name);
  if (v !== undefined && isObj(v)) return v.call?.('', all()) ?? err(`"${name}" não é função`);
  return err(`função desconhecida "${name}()"`);
}

const cache = new Map<string, Node | SyntaxError>();

/** Compila (com cache) e avalia. Nunca lança: erros viram ExprError. */
export function evaluate(src: string, scope: Scope, locals: Record<string, Value> = {}): Value {
  let n = cache.get(src);
  if (!n) {
    try {
      n = parseExpr(src);
    } catch (e) {
      n = e instanceof SyntaxError ? e : new SyntaxError(String(e));
    }
    if (cache.size > 2000) cache.clear();
    cache.set(src, n);
  }
  if (n instanceof SyntaxError) return err(n.message);
  try {
    return evalNode(n, scope, locals);
  } catch (e) {
    return err(e instanceof RangeError ? 'fórmula recursiva demais' : String((e as Error)?.message ?? e));
  }
}

/** Erro de sintaxe da expressão, ou null se ela compila. */
export function checkExpr(src: string): string | null {
  try {
    parseExpr(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
