import type { MathNode } from 'mathjs';
import { math } from './math';
import { findRoots, integrate, limit, polyRoots, tidy, type Fn } from './numeric';

/*
 * Cálculo simbólico básico sobre a árvore do mathjs.
 *
 * Antes de avaliar uma linha, as chamadas simbólicas (derivada, simplificar,
 * expandir, integral indefinida, taylor) são trocadas pela expressão que
 * produzem. Assim "v(t) = derivada(s(t); t)" guarda a derivada já pronta.
 * As numéricas (resolver, limite, integral definida, somatório) rodam na
 * avaliação, com o escopo da hora, e funcionam dentro de funções.
 */

export interface Def {
  params: string[];
  expr: MathNode;
}

export interface Ctx {
  scope: Map<string, unknown>;
  defs: Map<string, Def>;
}

/** Folha em avaliação: as funções numéricas leem as definições daqui. */
let current: Ctx | null = null;
export function withCtx<T>(ctx: Ctx, fn: () => T): T {
  const prev = current;
  current = ctx;
  try {
    return fn();
  } finally {
    current = prev;
  }
}

type AnyNode = MathNode & { name?: string; fn?: { name?: string; type: string }; args?: MathNode[]; op?: string; content?: MathNode; value?: unknown };

const isSym = (n: MathNode, name?: string) => n.type === 'SymbolNode' && (name === undefined || (n as AnyNode).name === name);
const fnName = (n: MathNode) => (n.type === 'FunctionNode' ? ((n as AnyNode).fn?.name ?? null) : null);

export function dependsOn(node: MathNode, v: string): boolean {
  return node.filter((n, _p, parent) => isSym(n, v) && !(parent && parent.type === 'FunctionNode' && (parent as AnyNode).fn === n)).length > 0;
}

function isUnitName(name: string): boolean {
  try {
    return math.Unit.isValuelessUnit(name);
  } catch {
    return false;
  }
}

/** Símbolos soltos: não estão no escopo, não são constantes do mathjs nem unidades. */
export function freeSymbols(node: MathNode, scope: Map<string, unknown>): string[] {
  const out = new Set<string>();
  node.traverse((n, _p, parent) => {
    if (n.type !== 'SymbolNode') return;
    if (parent && parent.type === 'FunctionNode' && (parent as AnyNode).fn === n) return;
    const name = (n as AnyNode).name!;
    if (scope.has(name) || name in math || isUnitName(name)) return;
    out.add(name);
  });
  return [...out];
}

/** Troca símbolos por nós (entre parênteses, para manter a precedência). */
export function substitute(node: MathNode, map: Record<string, MathNode>): MathNode {
  return node.transform((n) => {
    if (n.type === 'SymbolNode') {
      const r = map[(n as AnyNode).name!];
      if (r) return new math.ParenthesisNode(r.cloneDeep());
    }
    return n;
  });
}

const tmpl = (src: string, map: Record<string, MathNode>) => substitute(math.parse(src), map);
const num = (v: number) => new math.ConstantNode(v);

/**
 * Expande funções definidas na folha e troca variáveis numéricas pelo valor,
 * menos as de `keep` (a variável da derivada, os parâmetros de uma função).
 */
export function inline(node: MathNode, ctx: Ctx, keep: Set<string>, depth = 0): MathNode {
  if (depth > 30) throw new Error('Definições recursivas demais');
  return node.transform((n) => {
    if (n.type === 'FunctionNode') {
      const name = fnName(n);
      const def = name ? ctx.defs.get(name) : undefined;
      if (def && def.params.length === (n as AnyNode).args!.length) {
        const args = (n as AnyNode).args!.map((a) => inline(a, ctx, keep, depth + 1));
        const body = substitute(def.expr, Object.fromEntries(def.params.map((p, i) => [p, args[i]!])));
        return new math.ParenthesisNode(inline(body, ctx, keep, depth + 1));
      }
      if (def) return n;
    }
    if (n.type === 'SymbolNode' && !keep.has((n as AnyNode).name!)) {
      const v = ctx.scope.get((n as AnyNode).name!);
      if (typeof v === 'number') return num(v);
    }
    return n;
  }).transform((n) => fold(n, ctx, keep));
}

/**
 * Troca por número os pedaços que não dependem das variáveis mantidas e dão um
 * número puro: q/(1 kN/m) com q = 12 kN/m vira 12, e a derivada fica limpa.
 */
function fold(n: MathNode, ctx: Ctx, keep: Set<string>): MathNode {
  if (n.type === 'ConstantNode' || n.type === 'SymbolNode') return n;
  if (n.filter((m) => m.type === 'SymbolNode').length === 0) return n;
  if ([...keep].some((k) => dependsOn(n, k))) return n;
  if (n.filter((m) => m.type === 'FunctionNode' && !!ctx.defs.get(fnName(m) ?? '')).length) return n;
  try {
    const v = n.compile().evaluate(new Map(ctx.scope));
    if (typeof v === 'number' && Number.isFinite(v)) return num(v);
  } catch {
    /* fica como está */
  }
  return n;
}

function symbolArg(n: MathNode | undefined, fallback: string, what: string): string {
  if (!n) return fallback;
  if (n.type === 'ParenthesisNode') return symbolArg((n as AnyNode).content, fallback, what);
  if (!isSym(n)) throw new Error(`${what}: o segundo argumento é o nome da variável, como x`);
  return (n as AnyNode).name!;
}

/** Variável provável quando não foi dita: a única solta, ou x. */
function guessVar(node: MathNode, ctx: Ctx): string {
  const free = freeSymbols(node, ctx.scope);
  return free.length === 1 ? free[0]! : 'x';
}

/** Simplifica; se der um polinômio numa variável, escreve em ordem do maior grau (36 − 12x). */
const simplify = (n: MathNode): MathNode => {
  const s = math.simplify(n);
  try {
    const r = math.rationalize(s, {}, true) as unknown as { coefficients: number[]; variables: string[]; denominator: MathNode | null };
    if (!r.denominator && r.variables.length === 1 && r.coefficients.length && r.coefficients.every(Number.isFinite)) return polyNode(r.coefficients, r.variables[0]!);
  } catch {
    /* não é polinômio */
  }
  return s;
};

// ---------- integral indefinida ----------

function linearCoef(arg: MathNode, v: string): MathNode | null {
  const d = math.simplify(math.derivative(arg, v));
  if (dependsOn(d, v)) return null;
  if (d.type === 'ConstantNode' && (d as AnyNode).value === 0) return null;
  return d;
}

function factors(n: MathNode): MathNode[] {
  if (n.type === 'ParenthesisNode') return factors((n as AnyNode).content!);
  if (n.type === 'OperatorNode' && (n as AnyNode).op === '*' && (n as AnyNode).args!.length === 2) return (n as AnyNode).args!.flatMap(factors);
  return [n];
}

const FAIL = 'Não sei integrar isso de forma simbólica. Para o valor, use integral(expr; x; a; b)';

function polyIntegral(n: MathNode, v: string): MathNode | null {
  try {
    const r = math.rationalize(n, {}, true) as unknown as { coefficients: number[]; variables: string[]; denominator: MathNode | null };
    if (r.denominator || r.variables.length !== 1 || r.variables[0] !== v || !r.coefficients.length) return null;
    const terms = r.coefficients
      .map((c, k) => (c === 0 ? null : `(${c}) / ${k + 1} * ${v}^${k + 1}`))
      .filter(Boolean)
      .reverse();
    return terms.length ? math.parse(terms.join(' + ')) : num(0);
  } catch {
    return null;
  }
}

function polyDegree(n: MathNode, v: string): number {
  try {
    const r = math.rationalize(n, {}, true) as unknown as { coefficients: number[]; variables: string[]; denominator: MathNode | null };
    if (r.denominator || r.variables.length !== 1 || r.variables[0] !== v) return -1;
    return r.coefficients.length - 1;
  } catch {
    return -1;
  }
}

/** Integração por partes em tabela: polinômio × (exp, sen, cos de algo linear). */
function byParts(p: MathNode, g: MathNode, v: string): MathNode | null {
  const deg = polyDegree(p, v);
  if (deg < 1 || deg > 8) return null;
  const name = fnName(g);
  const isExp = (g.type === 'OperatorNode' && (g as AnyNode).op === '^' && !dependsOn((g as AnyNode).args![0]!, v)) || name === 'exp';
  if (!isExp && name !== 'sin' && name !== 'cos' && name !== 'sinh' && name !== 'cosh') return null;
  let acc: MathNode | null = null;
  let dp = p;
  let gi = g;
  for (let k = 0; k <= deg; k++) {
    gi = math.simplify(integrateSymbolic(gi, v));
    const term = tmpl('D * G', { D: dp, G: gi });
    acc = acc ? tmpl(k % 2 ? 'A - T' : 'A + T', { A: acc, T: term }) : term;
    dp = math.simplify(math.derivative(dp, v));
  }
  return acc;
}

export function integrateSymbolic(n: MathNode, v: string): MathNode {
  const x = new math.SymbolNode(v);
  if (!dependsOn(n, v)) return tmpl('C * X', { C: n, X: x });
  if (n.type === 'ParenthesisNode') return integrateSymbolic((n as AnyNode).content!, v);
  if (isSym(n, v)) return tmpl('X^2 / 2', { X: x });
  const poly = polyIntegral(n, v);
  if (poly) return poly;
  const a = n as AnyNode;
  if (n.type === 'OperatorNode') {
    const args = a.args!;
    if (args.length === 1) {
      if (a.op === '-') return tmpl('-I', { I: integrateSymbolic(args[0]!, v) });
      if (a.op === '+') return integrateSymbolic(args[0]!, v);
    }
    if (a.op === '+' || a.op === '-') return tmpl(`P ${a.op} Q`, { P: integrateSymbolic(args[0]!, v), Q: integrateSymbolic(args[1]!, v) });
    if (a.op === '*') {
      const fs = factors(n);
      const k = fs.filter((f) => !dependsOn(f, v));
      const d = fs.filter((f) => dependsOn(f, v));
      if (d.length === 1) {
        const inner = integrateSymbolic(d[0]!, v);
        return k.length ? tmpl('K * I', { K: k.reduce((p, q) => tmpl('P * Q', { P: p, Q: q })), I: inner }) : inner;
      }
      if (d.length === 2) {
        const parts = byParts(d[0]!, d[1]!, v) ?? byParts(d[1]!, d[0]!, v);
        if (parts) return k.length ? tmpl('K * I', { K: k.reduce((p, q) => tmpl('P * Q', { P: p, Q: q })), I: parts }) : parts;
      }
      throw new Error(FAIL);
    }
    if (a.op === '/') {
      const [top, bottom] = args as [MathNode, MathNode];
      if (!dependsOn(bottom, v)) return tmpl('I / B', { I: integrateSymbolic(top, v), B: bottom });
      if (!dependsOn(top, v)) {
        const lin = linearCoef(bottom, v);
        if (lin) return tmpl('T / A * log(abs(B))', { T: top, A: lin, B: bottom });
        // 1 / (k x² + c) → arctg
        try {
          const r = math.rationalize(bottom, {}, true) as unknown as { coefficients: number[]; variables: string[] };
          const [c, b, kk] = r.coefficients;
          if (r.variables.length === 1 && r.coefficients.length === 3 && b === 0 && kk! > 0 && c! > 0) {
            return tmpl('T / sqrt(K * C) * atan(X * sqrt(K / C))', { T: top, K: num(kk!), C: num(c!), X: x });
          }
        } catch { /* não é polinômio */ }
      }
      return integrateSymbolic(tmpl('T * B ^ (-1)', { T: top, B: bottom }), v);
    }
    if (a.op === '^') {
      const [base, exp] = args as [MathNode, MathNode];
      if (!dependsOn(exp, v)) {
        const lin = linearCoef(base, v);
        if (!lin) throw new Error(FAIL);
        const e = Number(exp.evaluate());
        if (e === -1) return tmpl('log(abs(B)) / A', { B: base, A: lin });
        return tmpl('B ^ (E + 1) / ((E + 1) * A)', { B: base, E: exp, A: lin });
      }
      if (!dependsOn(base, v)) {
        const lin = linearCoef(exp, v);
        if (!lin) throw new Error(FAIL);
        if (isSym(base, 'e')) return tmpl('e ^ E / A', { E: exp, A: lin });
        return tmpl('B ^ E / (A * log(B))', { B: base, E: exp, A: lin });
      }
    }
  }
  if (n.type === 'FunctionNode' && a.args!.length === 1) {
    const u = a.args![0]!;
    const lin = linearCoef(u, v);
    if (lin) {
      const rules: Record<string, string> = {
        sin: '-cos(U) / A', cos: 'sin(U) / A', tan: '-log(abs(cos(U))) / A', exp: 'exp(U) / A',
        sqrt: '2 / 3 * U ^ (3 / 2) / A', cbrt: '3 / 4 * U ^ (4 / 3) / A',
        log: '(U * log(U) - U) / A', log10: '(U * log(U) - U) / (A * log(10))',
        sinh: 'cosh(U) / A', cosh: 'sinh(U) / A', tanh: 'log(cosh(U)) / A',
        sec: 'log(abs(sec(U) + tan(U))) / A', csc: '-log(abs(csc(U) + cot(U))) / A', cot: 'log(abs(sin(U))) / A',
      };
      const r = rules[fnName(n)!];
      if (r) return tmpl(r, { U: u, A: lin });
    }
  }
  throw new Error(FAIL);
}

// ---------- taylor ----------

function fraction(v: number): [number, number] | null {
  for (let q = 1; q <= 100000; q++) {
    const p = Math.round(v * q);
    if (Math.abs(v * q - p) < 1e-9 * q) return [p, q];
  }
  return null;
}

function coefNode(c: number): MathNode {
  const f = fraction(c);
  if (f && f[1] !== 1) return tmpl('P / Q', { P: num(f[0]), Q: num(f[1]) });
  return num(f ? f[0] : tidy(c));
}

function taylor(expr: MathNode, v: string, at: number, order: number): MathNode {
  let d = expr;
  const x = new math.SymbolNode(v);
  const base = at === 0 ? x : tmpl('X - A', { X: x, A: num(at) });
  let fact = 1;
  const terms: { neg: boolean; node: MathNode }[] = [];
  for (let k = 0; k <= order; k++) {
    if (k > 0) {
      d = math.simplify(math.derivative(d, v));
      fact *= k;
    }
    const val = tidy(Number(d.evaluate({ [v]: at })) / fact);
    if (!Number.isFinite(val)) throw new Error(`A série de Taylor não existe em ${v} = ${at}`);
    if (val === 0) continue;
    const pow = k === 0 ? null : k === 1 ? base : tmpl('B ^ K', { B: base, K: num(k) });
    const c = coefNode(Math.abs(val));
    const mag = !pow ? c : Math.abs(val) === 1 ? pow : tmpl('C * P', { C: c, P: pow });
    terms.push({ neg: val < 0, node: mag });
  }
  if (!terms.length) return num(0);
  const [first, ...rest] = terms;
  let acc = first!.neg ? tmpl('-P', { P: first!.node }) : first!.node;
  for (const t of rest) acc = new math.OperatorNode(t.neg ? '-' : '+', t.neg ? 'subtract' : 'add', [acc, t.node]);
  return acc;
}

// ---------- frações de polinômios ----------

/** Coeficientes do menor para o maior grau. */
type Poly = number[];

function trim(p: Poly): Poly {
  const scale = Math.max(1e-300, ...p.map(Math.abs));
  const q = p.map((c) => (Math.abs(c) < 1e-10 * scale ? 0 : c));
  while (q.length > 1 && q[q.length - 1] === 0) q.pop();
  return q;
}

function polyDiv(a: Poly, b: Poly): [Poly, Poly] {
  let r = trim([...a]);
  const d = trim(b);
  if (r.length < d.length) return [[0], r];
  const q: Poly = new Array(r.length - d.length + 1).fill(0);
  while (r.length >= d.length && !(r.length === 1 && r[0] === 0)) {
    const k = r.length - d.length;
    const c = r[r.length - 1]! / d[d.length - 1]!;
    q[k] = c;
    for (let i = 0; i < d.length; i++) r[i + k]! -= c * d[i]!;
    r[r.length - 1] = 0;
    r = trim(r);
    if (k === 0) break;
  }
  return [q, r];
}

function polyGcd(a: Poly, b: Poly): Poly {
  let x = trim(a);
  let y = trim(b);
  for (let i = 0; i < 50 && !(y.length === 1 && y[0] === 0); i++) [x, y] = [y, polyDiv(x, y)[1]];
  return x;
}

function polyNode(p: Poly, v: string): MathNode {
  const terms: string[] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const c = tidy(p[k]!);
    if (c === 0) continue;
    const f = fraction(c);
    const cs = f && f[1] !== 1 ? `(${f[0]} / ${f[1]})` : String(f ? f[0] : c);
    const pow = k === 0 ? '' : k === 1 ? v : `${v}^${k}`;
    terms.push(!pow ? cs : c === 1 ? pow : c === -1 ? `-${pow}` : `${cs} * ${pow}`);
  }
  return math.parse(terms.length ? terms.join(' + ').replace(/\+ -/g, '- ') : '0');
}

/** Corta fatores comuns de uma fração de polinômios: (x² − 1)/(x − 1) → x + 1. */
function cancelRational(body: MathNode): MathNode | null {
  try {
    type R = { numerator: MathNode; denominator: MathNode | null; variables: string[]; coefficients: number[] };
    const r = math.rationalize(body, {}, true) as unknown as R;
    if (!r.denominator || r.variables.length !== 1) return null;
    const v = r.variables[0]!;
    const num = (math.rationalize(r.numerator, {}, true) as unknown as R).coefficients;
    const den = (math.rationalize(r.denominator, {}, true) as unknown as R).coefficients;
    if (!num.length || !den.length) return null;
    const g = polyGcd(num, den);
    if (g.length <= 1) return null;
    const qn = polyDiv(num, g)[0];
    const qd = trim(polyDiv(den, g)[0]);
    if (qd.length === 1) return polyNode(qn.map((c) => c / qd[0]!), v);
    const lead = qd[qd.length - 1]!;
    return tmpl('N / D', { N: polyNode(qn.map((c) => c / lead), v), D: polyNode(qd.map((c) => c / lead), v) });
  } catch {
    return null;
  }
}

// ---------- passo de expansão ----------

const LETTERS = ['x', 'y', 'z', 't', 'θ'];

export const SYMBOLIC = new Set(['derivada', 'simplificar', 'expandir', 'integral', 'taylor']);

export interface Expansion {
  node: MathNode;
  /** a linha tinha alguma operação simbólica */
  symbolic: boolean;
  /** variáveis usadas pelas operações (x da derivada etc.) */
  vars: Set<string>;
  /** integral indefinida: mostrar + C */
  indefinite: boolean;
}

export function expandSymbolic(node: MathNode, ctx: Ctx, keep: Set<string>): Expansion {
  const out: Expansion = { node, symbolic: false, vars: new Set(), indefinite: false };
  const visit = (n: MathNode): MathNode =>
    n.transform((m) => {
      const name = fnName(m);
      if (!name || !SYMBOLIC.has(name) || ctx.defs.has(name)) return m;
      const raw = (m as AnyNode).args!.map(visit);
      if (name === 'integral' && raw.length >= 4) return new math.FunctionNode(new math.SymbolNode('integral'), raw);
      if (!raw.length) throw new Error(`${name}: falta a expressão`);
      out.symbolic = true;
      const k = new Set(keep);
      switch (name) {
        case 'derivada': {
          const v = symbolArg(raw[1], guessVar(raw[0]!, ctx), 'derivada');
          k.add(v);
          out.vars.add(v);
          const d = simplify(math.derivative(inline(raw[0]!, ctx, k), v));
          return raw[2] ? substitute(d, { [v]: raw[2] }) : d;
        }
        case 'integral': {
          const v = symbolArg(raw[1], guessVar(raw[0]!, ctx), 'integral');
          k.add(v);
          out.vars.add(v);
          out.indefinite = true;
          return simplify(integrateSymbolic(simplify(inline(raw[0]!, ctx, k)), v));
        }
        case 'taylor': {
          const v = symbolArg(raw[1], guessVar(raw[0]!, ctx), 'taylor');
          k.add(v);
          out.vars.add(v);
          const at = raw[2] ? Number(raw[2].evaluate(ctx.scope)) : 0;
          const order = raw[3] ? Number(raw[3].evaluate(ctx.scope)) : 5;
          if (!Number.isInteger(order) || order < 0 || order > 30) throw new Error('taylor: a ordem vai de 0 a 30');
          return taylor(inline(raw[0]!, ctx, k), v, at, order);
        }
        case 'simplificar':
        case 'expandir': {
          // x, y, z e t ficam como letras mesmo com valor na folha; as outras variáveis entram pelo valor
          for (const l of LETTERS) k.add(l);
          const body = inline(raw[0]!, ctx, k);
          for (const s of freeSymbols(body, ctx.scope)) out.vars.add(s);
          for (const l of LETTERS) if (dependsOn(body, l)) out.vars.add(l);
          if (name === 'expandir') {
            try {
              return (math.rationalize(body, {}, true) as unknown as { expression: MathNode }).expression;
            } catch {
              return simplify(body);
            }
          }
          return simplify(cancelRational(body) ?? body);
        }
      }
      return m;
    });
  out.node = visit(node);
  return out;
}

// ---------- funções numéricas (avaliadas com o escopo da hora) ----------

/** Escopo filho: a variável local por cima do escopo de quem chamou. */
class Overlay {
  private local = new Map<string, unknown>();
  constructor(private parent: { get(k: string): unknown; has(k: string): boolean; keys(): Iterable<string> }) {}
  get(k: string) { return this.local.has(k) ? this.local.get(k) : this.parent.get(k); }
  has(k: string) { return this.local.has(k) || this.parent.has(k); }
  set(k: string, v: unknown) { this.local.set(k, v); return this; }
  delete(k: string) { return this.local.delete(k); }
  clear() { this.local.clear(); }
  keys() { return new Set([...this.parent.keys(), ...this.local.keys()]).values(); }
  forEach(cb: (v: unknown, k: string) => void) { for (const k of this.keys()) cb(this.get(k), k); }
  get size() { return [...this.keys()].length; }
  [Symbol.iterator]() { return [...this.keys()].map((k) => [k, this.get(k)] as [string, unknown])[Symbol.iterator](); }
}

type Scope = ConstructorParameters<typeof Overlay>[0];

export function toNumber(r: unknown): number {
  if (typeof r === 'number') return r;
  const t = math.typeOf(r);
  if (t === 'Unit') return (r as { value: number }).value;
  if (t === 'Complex') {
    const c = r as { re: number; im: number };
    return Math.abs(c.im) < 1e-12 ? c.re : NaN;
  }
  if (t === 'BigNumber' || t === 'Fraction') return Number(r);
  return NaN;
}

/** Compila uma expressão como função de uma variável. */
export function fnOf(node: MathNode, scope: Scope, v: string, strictUnits = false): Fn {
  const code = node.compile();
  const sc = new Overlay(scope);
  return (x: number) => {
    sc.set(v, x);
    try {
      const r = code.evaluate(sc as never);
      if (strictUnits && math.typeOf(r) === 'Unit') throw new Error('A conta numérica ainda não aceita unidades aqui');
      return toNumber(r);
    } catch (e) {
      if (strictUnits && e instanceof Error && /unidades/.test(e.message)) throw e;
      return NaN;
    }
  };
}

/** Compila uma expressão como função de duas variáveis (superfícies 3D). */
export function fnOf2(node: MathNode, scope: Scope, a: string, b: string): (u: number, v: number) => number {
  const code = node.compile();
  const sc = new Overlay(scope);
  return (u: number, v: number) => {
    sc.set(a, u).set(b, v);
    try {
      return toNumber(code.evaluate(sc as never));
    } catch {
      return NaN;
    }
  };
}

const evalNum = (n: MathNode, scope: Scope, what: string) => {
  const v = toNumber(n.compile().evaluate(scope as never));
  if (Number.isNaN(v)) throw new Error(`${what} precisa ser um número`);
  return v;
};

function equation(n: MathNode): MathNode {
  const a = n as AnyNode;
  if (n.type === 'OperatorNode' && a.op === '==') return tmpl('(L) - (R)', { L: a.args![0]!, R: a.args![1]! });
  if (n.type === 'ParenthesisNode') return equation(a.content!);
  return n;
}

function resolver(args: MathNode[], _m: unknown, scope: Scope): unknown[] {
  if (!args.length) throw new Error('resolver: falta a equação');
  const ctx = current ?? { scope: new Map(), defs: new Map() };
  const f0 = equation(args[0]!);
  const v = symbolArg(args[1], guessVar(f0, ctx), 'resolver');
  const lo = args[2] ? evalNum(args[2], scope, 'O início do intervalo') : -1000;
  const hi = args[3] ? evalNum(args[3], scope, 'O fim do intervalo') : 1000;
  const f = fnOf(f0, scope, v);
  // polinômio: raízes exatas (e complexas, se não houver reais)
  if (!args[2]) {
    try {
      const body = inline(f0, ctx, new Set([v]));
      const r = math.rationalize(body, {}, true) as unknown as { coefficients: number[]; variables: string[] };
      if (r.variables.length === 1 && r.variables[0] === v && r.coefficients.length > 1 && r.coefficients.every(Number.isFinite)) {
        const roots = polyRoots([...r.coefficients].reverse());
        const real = roots.filter((z) => z.im === 0).map((z) => tidy(z.re)).filter((x) => Number.isFinite(f(x)) || true);
        const uniq = real.filter((x, i) => real.findIndex((y) => Math.abs(y - x) < 1e-9 * Math.max(1, Math.abs(x))) === i);
        if (uniq.length) return uniq;
        return roots.map((z) => math.complex(tidy(z.re), tidy(z.im)));
      }
    } catch { /* não é polinômio: segue para o numérico */ }
  }
  return findRoots(f, lo, hi).map(tidy);
}
resolver.rawArgs = true;

function integralNum(args: MathNode[], _m: unknown, scope: Scope): number {
  if (args.length < 4) throw new Error(FAIL);
  const v = symbolArg(args[1], 'x', 'integral');
  const a = evalNum(args[2]!, scope, 'O limite inferior');
  const b = evalNum(args[3]!, scope, 'O limite superior');
  return tidy(integrate(fnOf(args[0]!, scope, v, true), a, b));
}
integralNum.rawArgs = true;

function limite(args: MathNode[], _m: unknown, scope: Scope): number {
  if (args.length < 3) throw new Error('limite(expr; x; a)');
  const v = symbolArg(args[1], 'x', 'limite');
  const a = evalNum(args[2]!, scope, 'O ponto');
  let side: -1 | 0 | 1 = 0;
  if (args[3]) {
    const s = args[3].compile().evaluate(scope as never);
    side = s === '+' || s === 'direita' || s === 1 ? 1 : s === '-' || s === 'esquerda' || s === -1 ? -1 : 0;
  }
  return limit(fnOf(args[0]!, scope, v), a, side);
}
limite.rawArgs = true;

function serie(kind: 'sum' | 'prod') {
  const f = (args: MathNode[], _m: unknown, scope: Scope): unknown => {
    if (args.length < 4) throw new Error(`${kind === 'sum' ? 'somatorio' : 'produtorio'}(expr; k; início; fim)`);
    const v = symbolArg(args[1], 'k', 'série');
    const a = evalNum(args[2]!, scope, 'O início');
    const b = evalNum(args[3]!, scope, 'O fim');
    if (b - a > 1e6) throw new Error('Termos demais (máximo 1 milhão)');
    const code = args[0]!.compile();
    const sc = new Overlay(scope);
    let acc: unknown = kind === 'sum' ? 0 : 1;
    for (let k = Math.ceil(a); k <= b; k++) {
      sc.set(v, k);
      const t = code.evaluate(sc as never);
      acc = kind === 'sum' ? math.add(acc as never, t as never) : math.multiply(acc as never, t as never);
    }
    return acc;
  };
  f.rawArgs = true;
  return f;
}

math.import(
  { resolver, integral: integralNum, limite, somatorio: serie('sum'), produtorio: serie('prod') },
  { override: true },
);
