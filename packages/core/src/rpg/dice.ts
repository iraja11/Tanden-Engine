/*
 * Dados de RPG: notação, rolagem e estatística.
 *
 *   1d20+5            soma e modificador
 *   2d20kh1 / 2d20kl1 vantagem e desvantagem (kh = mantém os maiores, kl = os menores)
 *   4d6dl1            descarta o menor (dh descarta o maior)
 *   1d20 vantagem     o mesmo que 2d20kh1 (também "adv", "desvantagem", "dis")
 *   3d6!              dado explode no valor máximo e rola de novo
 *   2d6r1 / 2d6ro<2   rola de novo os 1 (r repete até sair outro; ro só uma vez)
 *   8d10>=7           conta sucessos (também >, <, <=, =)
 *   4dF  d%           dados Fudge (-1, 0, +1) e percentual (d100)
 *   (1d6+2)*2         parênteses, * e / (a divisão arredonda para baixo)
 *   6x 4d6dl1         repete a rolagem: seis atributos de uma vez
 *   1d20+@des         variável da ficha (o resolvedor diz quanto vale @des)
 *   1d20+5 # ataque   o que vem depois do # é o rótulo
 *
 * É a mesma notação do Roll20 e do plugin Dice Roller do Obsidian, para as
 * fórmulas escritas nas notas funcionarem nos dois.
 */

export type Rng = () => number;

/** Aleatório justo: usa o gerador criptográfico quando existe. */
export const fairRng: Rng = (() => {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(64);
    let i = buf.length;
    return () => {
      if (i >= buf.length) {
        c.getRandomValues!(buf);
        i = 0;
      }
      return buf[i++]! / 4294967296;
    };
  }
  return Math.random;
})();

/** Gerador com semente (testes, rolagens repetíveis). */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DiceError extends Error {}

// ---------------------------------------------------------------- árvore

type Cmp = '>' | '>=' | '<' | '<=' | '=';

interface DiceNode {
  kind: 'dice';
  count: number;
  /** lados; 0 = Fudge */
  sides: number;
  keep?: { high: boolean; n: number };
  drop?: { high: boolean; n: number };
  explode?: boolean;
  reroll?: { cmp: Cmp; n: number; once: boolean };
  success?: { cmp: Cmp; n: number };
  /** texto da notação, para mostrar */
  src: string;
}

type Node =
  | DiceNode
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'neg'; arg: Node }
  | { kind: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { kind: 'paren'; arg: Node };

export interface ParsedRoll {
  /** fórmula como foi escrita (sem o rótulo nem a repetição) */
  formula: string;
  label: string;
  repeat: number;
  ast: Node;
}

const MAX_DICE = 500;
const MAX_SIDES = 100000;
const MAX_REPEAT = 50;
const MAX_REROLLS = 100;

/** Palavras de vantagem e desvantagem viram kh1/kl1 no primeiro d20. */
function advantage(src: string): string {
  const adv = /\s*\b(com\s+)?(vantagem|adv|advantage)\b/i;
  const dis = /\s*\b(com\s+)?(desvantagem|dis|disadvantage)\b/i;
  const mode = adv.test(src) ? 'kh1' : dis.test(src) ? 'kl1' : null;
  if (!mode) return src;
  const clean = src.replace(adv, '').replace(dis, '');
  let done = false;
  const out = clean.replace(/(^|[^\w])(1?)d20(?![\d!kdhlr<>=])/i, (_m, pre: string) => {
    done = true;
    return `${pre}2d20${mode}`;
  });
  if (!done) throw new DiceError('Vantagem e desvantagem pedem um d20 na fórmula.');
  return out;
}

/** Lê uma fórmula. Lança DiceError com uma mensagem em português se não der. */
export function parseRoll(input: string): ParsedRoll {
  let src = input.trim();
  let label = '';
  const hash = src.indexOf('#');
  if (hash >= 0) {
    label = src.slice(hash + 1).trim();
    src = src.slice(0, hash).trim();
  }
  let repeat = 1;
  const rep = /^(\d+)\s*x\s+(.+)$/i.exec(src) ?? /^(.+?)\s+x\s*(\d+)$/i.exec(src);
  if (rep) {
    const [n, rest] = /^\d+$/.test(rep[1]!) ? [rep[1]!, rep[2]!] : [rep[2]!, rep[1]!];
    repeat = Number(n);
    src = rest.trim();
    if (repeat < 1 || repeat > MAX_REPEAT) throw new DiceError(`Dá para repetir de 1 a ${MAX_REPEAT} vezes.`);
  }
  if (!src) throw new DiceError('Escreva uma fórmula, como 1d20+5.');
  const formula = advantage(src);
  const p = new Parser(formula);
  const ast = p.expr();
  p.end();
  return { formula: formula.replace(/\s+/g, ''), label, repeat, ast };
}

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  private ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }
  private peek(): string {
    this.ws();
    return this.s[this.i] ?? '';
  }
  end() {
    this.ws();
    if (this.i < this.s.length) throw new DiceError(`Não entendi "${this.s.slice(this.i)}" na fórmula.`);
  }

  expr(): Node {
    let left = this.term();
    for (let c = this.peek(); c === '+' || c === '-'; c = this.peek()) {
      this.i++;
      left = { kind: 'bin', op: c, left, right: this.term() };
    }
    return left;
  }

  private term(): Node {
    let left = this.unary();
    for (let c = this.peek(); c === '*' || c === '/' || c === '×' || c === '÷'; c = this.peek()) {
      this.i++;
      const op = c === '*' || c === '×' ? '*' : '/';
      left = { kind: 'bin', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Node {
    const c = this.peek();
    if (c === '-') {
      this.i++;
      return { kind: 'neg', arg: this.unary() };
    }
    if (c === '+') {
      this.i++;
      return this.unary();
    }
    return this.atom();
  }

  private atom(): Node {
    const c = this.peek();
    if (c === '(') {
      this.i++;
      const arg = this.expr();
      if (this.peek() !== ')') throw new DiceError('Falta fechar um parêntese.');
      this.i++;
      return { kind: 'paren', arg };
    }
    if (c === '@') {
      const m = /^@([\p{L}\p{N}_.-]*[\p{L}\p{N}_])/u.exec(this.s.slice(this.i));
      if (!m) throw new DiceError('Depois do @ vem o nome de um valor da ficha, como @des.');
      this.i += m[0].length;
      return { kind: 'var', name: m[1]! };
    }
    const rest = this.s.slice(this.i);
    const d = /^(\d*)\s*[dD](%|[fF](?![a-z])|\d+)/.exec(rest);
    if (d) {
      const start = this.i;
      this.i += d[0].length;
      const count = d[1] ? Number(d[1]) : 1;
      const sides = d[2] === '%' ? 100 : /f/i.test(d[2]!) ? 0 : Number(d[2]);
      if (count < 1) throw new DiceError('Role pelo menos um dado.');
      if (count > MAX_DICE) throw new DiceError(`No máximo ${MAX_DICE} dados por grupo.`);
      if (sides !== 0 && sides < 1) throw new DiceError('Um dado precisa ter pelo menos um lado.');
      if (sides > MAX_SIDES) throw new DiceError('Dado com lados demais.');
      const node: DiceNode = { kind: 'dice', count, sides, src: '' };
      this.modifiers(node);
      node.src = this.s.slice(start, this.i).replace(/\s+/g, '');
      return node;
    }
    const n = /^\d+(?:[.,]\d+)?/.exec(rest);
    if (n) {
      this.i += n[0].length;
      return { kind: 'num', value: Number(n[0].replace(',', '.')) };
    }
    if (!c) throw new DiceError('A fórmula terminou no meio.');
    throw new DiceError(`Não entendi "${rest.split(/\s/)[0]}" na fórmula.`);
  }

  private cmp(): { cmp: Cmp; n: number } | null {
    const m = /^(>=|<=|>|<|=)?(\d+)/.exec(this.s.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return { cmp: (m[1] as Cmp | undefined) ?? '=', n: Number(m[2]) };
  }

  private modifiers(node: DiceNode) {
    for (;;) {
      const rest = this.s.slice(this.i);
      let m: RegExpExecArray | null;
      if ((m = /^(k|kh|kl)(\d+)/i.exec(rest))) {
        this.i += m[0].length;
        node.keep = { high: m[1]!.toLowerCase() !== 'kl', n: Number(m[2]) };
      } else if ((m = /^(dh|dl)(\d+)/i.exec(rest))) {
        this.i += m[0].length;
        node.drop = { high: m[1]!.toLowerCase() === 'dh', n: Number(m[2]) };
      } else if (rest.startsWith('!')) {
        this.i++;
        node.explode = true;
      } else if ((m = /^r(o?)/i.exec(rest))) {
        this.i += m[0].length;
        const c = this.cmp();
        if (!c) throw new DiceError('Depois do r vem o valor a rolar de novo, como r1 ou r<2.');
        node.reroll = { ...c, once: m[1] !== '' };
      } else if (/^(>=|<=|>|<|=)\d/.test(rest)) {
        node.success = this.cmp()!;
      } else break;
    }
    if (node.keep && node.drop) throw new DiceError('Use manter (kh/kl) ou descartar (dh/dl), não os dois.');
    const n = node.keep?.n ?? node.drop?.n;
    if (n !== undefined && (n < 0 || n > node.count)) throw new DiceError(`Não dá para manter ou descartar ${n} de ${node.count} dados.`);
    if (node.explode && node.sides <= 1) throw new DiceError('Esse dado não pode explodir.');
    if (node.reroll && node.sides > 0 && node.sides <= 1) throw new DiceError('Esse dado não tem o que rolar de novo.');
    if (node.reroll && node.sides > 0 && everyFace(node.sides, node.reroll)) throw new DiceError('Assim todo resultado seria rolado de novo.');
  }
}

const test = (v: number, c: { cmp: Cmp; n: number }): boolean =>
  c.cmp === '>' ? v > c.n : c.cmp === '>=' ? v >= c.n : c.cmp === '<' ? v < c.n : c.cmp === '<=' ? v <= c.n : v === c.n;

function everyFace(sides: number, c: { cmp: Cmp; n: number }): boolean {
  for (let v = 1; v <= sides; v++) if (!test(v, c)) return false;
  return true;
}

// ---------------------------------------------------------------- rolagem

export interface Die {
  value: number;
  /** conta no total (não foi descartado) */
  kept: boolean;
  /** veio de uma explosão */
  exploded?: boolean;
  /** valores que saíram antes e foram rolados de novo */
  rerolled?: number[];
  /** sucesso, quando a fórmula conta sucessos */
  success?: boolean;
}

export interface DiceGroup {
  notation: string;
  sides: number;
  dice: Die[];
  /** soma dos mantidos, ou número de sucessos */
  total: number;
}

export interface RollResult {
  input: string;
  formula: string;
  label: string;
  total: number;
  groups: DiceGroup[];
  /** a conta com os dados abertos: "1d20 [17] + 5" */
  detail: string;
  /** d20 natural 20 ou 1 (com um só d20 valendo na fórmula) */
  critical: 'max' | 'min' | null;
}

export type Resolver = (name: string) => number | undefined;

export interface RollOptions {
  rng?: Rng;
  vars?: Resolver;
}

function face(sides: number, rng: Rng): number {
  if (sides === 0) return Math.floor(rng() * 3) - 1;
  return 1 + Math.floor(rng() * sides);
}

function rollGroup(n: DiceNode, rng: Rng): DiceGroup {
  const dice: Die[] = [];
  const max = n.sides === 0 ? 1 : n.sides;
  for (let i = 0; i < n.count; i++) {
    let first = true;
    let chain = 0;
    do {
      const d: Die = { value: face(n.sides, rng), kept: true };
      if (!first) d.exploded = true;
      if (n.reroll) {
        let tries = 0;
        while (test(d.value, n.reroll) && tries < MAX_REROLLS) {
          (d.rerolled ??= []).push(d.value);
          d.value = face(n.sides, rng);
          tries++;
          if (n.reroll.once) break;
        }
      }
      dice.push(d);
      first = false;
      if (!(n.explode && d.value === max)) break;
    } while (++chain < MAX_REROLLS);
  }
  // manter / descartar: pelos valores, mantendo a ordem em que saíram
  const k = n.keep ?? (n.drop ? { high: !n.drop.high, n: dice.length - n.drop.n } : null);
  if (k) {
    const order = dice.map((d, i) => ({ v: d.value, i })).sort((a, b) => (k.high ? b.v - a.v : a.v - b.v) || a.i - b.i);
    const keep = new Set(order.slice(0, Math.max(0, k.n)).map((x) => x.i));
    dice.forEach((d, i) => (d.kept = keep.has(i)));
  }
  let total = 0;
  for (const d of dice) {
    if (!d.kept) continue;
    if (n.success) {
      d.success = test(d.value, n.success);
      if (d.success) total++;
    } else total += d.value;
  }
  return { notation: n.src, sides: n.sides, dice, total };
}

function show(d: Die, sides: number): string {
  let v = sides === 0 ? (d.value > 0 ? '+' : d.value < 0 ? '−' : '0') : String(d.value);
  if (d.rerolled?.length) v = `${d.rerolled.map((r) => `~~${r}~~`).join(' ')} ${v}`;
  if (d.exploded) v = `${v}!`;
  if (!d.kept) v = `~~${v}~~`;
  else if (d.success) v = `**${v}**`;
  return v;
}

function evaluate(node: Node, rng: Rng, vars: Resolver | undefined, groups: DiceGroup[]): { v: number; s: string } {
  switch (node.kind) {
    case 'num':
      return { v: node.value, s: String(node.value) };
    case 'var': {
      const v = vars?.(node.name);
      if (v === undefined || !Number.isFinite(v)) throw new DiceError(`A ficha não tem o valor @${node.name}.`);
      return { v, s: `${v}` };
    }
    case 'neg': {
      const a = evaluate(node.arg, rng, vars, groups);
      return { v: -a.v, s: `-${a.s}` };
    }
    case 'paren': {
      const a = evaluate(node.arg, rng, vars, groups);
      return { v: a.v, s: `(${a.s})` };
    }
    case 'dice': {
      const g = rollGroup(node, rng);
      groups.push(g);
      return { v: g.total, s: `${node.src} [${g.dice.map((d) => show(d, node.sides)).join(', ')}]` };
    }
    case 'bin': {
      const a = evaluate(node.left, rng, vars, groups);
      const b = evaluate(node.right, rng, vars, groups);
      if (node.op === '/' && b.v === 0) throw new DiceError('Divisão por zero.');
      const v = node.op === '+' ? a.v + b.v : node.op === '-' ? a.v - b.v : node.op === '*' ? a.v * b.v : Math.floor(a.v / b.v);
      const sym = node.op === '*' ? '×' : node.op === '/' ? '÷' : node.op;
      return { v, s: `${a.s} ${sym} ${b.s}` };
    }
  }
}

function criticalOf(groups: DiceGroup[]): RollResult['critical'] {
  const d20 = groups.filter((g) => g.sides === 20).flatMap((g) => g.dice.filter((d) => d.kept));
  if (d20.length !== 1 || groups.some((g) => g.sides === 20 && g.dice.some((d) => d.success !== undefined))) return null;
  return d20[0]!.value === 20 ? 'max' : d20[0]!.value === 1 ? 'min' : null;
}

/** Rola uma fórmula já lida. */
export function rollParsed(p: ParsedRoll, opts: RollOptions = {}): RollResult[] {
  const rng = opts.rng ?? fairRng;
  const out: RollResult[] = [];
  for (let i = 0; i < p.repeat; i++) {
    const groups: DiceGroup[] = [];
    const r = evaluate(p.ast, rng, opts.vars, groups);
    const total = Math.round(r.v * 1000) / 1000;
    out.push({ input: p.formula, formula: p.formula, label: p.label, total, groups, detail: r.s, critical: criticalOf(groups) });
  }
  return out;
}

/** Lê e rola. Com repetição ("6x 4d6dl1"), devolve uma rolagem por vez. */
export function roll(input: string, opts: RollOptions = {}): RollResult[] {
  return rollParsed(parseRoll(input), opts).map((r) => ({ ...r, input }));
}

/** Uma rolagem só (a primeira, se a fórmula repetir). */
export const rollOnce = (input: string, opts: RollOptions = {}): RollResult => roll(input, opts)[0]!;

/** A fórmula é válida? Devolve a mensagem de erro, ou null. */
export function checkRoll(input: string): string | null {
  try {
    parseRoll(input);
    return null;
  } catch (e) {
    return e instanceof DiceError ? e.message : String(e);
  }
}

/** Parece uma fórmula de dados (para reconhecer "d6" no cabeçalho de uma tabela)? */
export const looksLikeDice = (s: string): boolean => /^\s*\d*\s*d\s*(\d+|%)\s*([+-]\s*\d+)?\s*$/i.test(s);

/** Resultado em uma linha: "1d20+5 = 22 (1d20 [17] + 5)". Dados descartados ficam entre parênteses. */
export function rollText(r: RollResult): string {
  const plain = r.detail.replace(/~~([^~]+)~~/g, '($1)').replace(/\*\*/g, '');
  const crit = r.critical === 'max' ? ' · crítico!' : r.critical === 'min' ? ' · falha crítica' : '';
  return `${r.label ? `${r.label}: ` : ''}${r.formula} = ${r.total}${r.groups.length ? ` (${plain})` : ''}${crit}`;
}

// ---------------------------------------------------------------- estatística

export interface RollStats {
  min: number;
  max: number;
  mean: number;
  /** valor → chance (0 a 1) */
  dist: Array<{ value: number; p: number }>;
  /** true quando veio de simulação (fórmulas com explosão, rerrolagem ou variáveis) */
  approx: boolean;
}

/** Distribuição exata de um grupo simples (sem explosão nem rerrolagem). */
function exactGroup(n: DiceNode): Map<number, number> | null {
  if (n.explode || n.reroll) return null;
  const faces = n.sides === 0 ? [-1, 0, 1] : Array.from({ length: n.sides }, (_, i) => i + 1);
  const value = (v: number) => (n.success ? (test(v, n.success) ? 1 : 0) : v);
  const keepN = n.keep ? n.keep.n : n.drop ? n.count - n.drop.n : n.count;
  if (keepN === n.count) {
    // soma de dados independentes: convolução
    let acc = new Map<number, number>([[0, 1]]);
    const one = new Map<number, number>();
    for (const f of faces) one.set(value(f), (one.get(value(f)) ?? 0) + 1 / faces.length);
    for (let i = 0; i < n.count; i++) {
      const next = new Map<number, number>();
      for (const [a, pa] of acc) for (const [b, pb] of one) next.set(a + b, (next.get(a + b) ?? 0) + pa * pb);
      acc = next;
    }
    return acc;
  }
  // manter/descartar: enumera se couber (vantagem, 4d6dl1...)
  if (Math.pow(faces.length, n.count) > 200000) return null;
  const high = n.keep ? n.keep.high : !n.drop!.high;
  const out = new Map<number, number>();
  const cur: number[] = new Array(n.count).fill(0);
  const p = Math.pow(1 / faces.length, n.count);
  const rec = (i: number) => {
    if (i === n.count) {
      const s = [...cur].sort((a, b) => (high ? b - a : a - b)).slice(0, keepN);
      const t = s.reduce((a, v) => a + value(v), 0);
      out.set(t, (out.get(t) ?? 0) + p);
      return;
    }
    for (const f of faces) {
      cur[i] = f;
      rec(i + 1);
    }
  };
  rec(0);
  return out;
}

function exact(node: Node, vars?: Resolver): Map<number, number> | null {
  switch (node.kind) {
    case 'num':
      return new Map([[node.value, 1]]);
    case 'var': {
      const v = vars?.(node.name);
      return v === undefined ? null : new Map([[v, 1]]);
    }
    case 'paren':
      return exact(node.arg, vars);
    case 'neg': {
      const a = exact(node.arg, vars);
      return a && new Map([...a].map(([v, p]) => [-v, p]));
    }
    case 'dice':
      return exactGroup(node);
    case 'bin': {
      const a = exact(node.left, vars);
      const b = exact(node.right, vars);
      if (!a || !b || a.size * b.size > 400000) return null;
      const out = new Map<number, number>();
      for (const [x, px] of a) {
        for (const [y, py] of b) {
          if (node.op === '/' && y === 0) return null;
          const v = node.op === '+' ? x + y : node.op === '-' ? x - y : node.op === '*' ? x * y : Math.floor(x / y);
          out.set(v, (out.get(v) ?? 0) + px * py);
        }
      }
      return out;
    }
  }
}

/** Mínimo, máximo, média e a chance de cada resultado. */
export function rollStats(input: string, opts: RollOptions & { samples?: number } = {}): RollStats {
  const p = parseRoll(input);
  let m = exact(p.ast, opts.vars);
  let approx = false;
  if (!m) {
    approx = true;
    const rng = opts.rng ?? fairRng;
    const n = opts.samples ?? 20000;
    m = new Map();
    for (let i = 0; i < n; i++) {
      const v = Math.round(evaluate(p.ast, rng, opts.vars, []).v * 1000) / 1000;
      m.set(v, (m.get(v) ?? 0) + 1 / n);
    }
  }
  const dist = [...m].map(([value, pr]) => ({ value, p: pr })).sort((a, b) => a.value - b.value);
  const mean = dist.reduce((a, d) => a + d.value * d.p, 0);
  return { min: dist[0]!.value, max: dist[dist.length - 1]!.value, mean, dist, approx };
}

/** Chance (0 a 1) de tirar pelo menos `target`. */
export const chanceAtLeast = (s: RollStats, target: number): number => s.dist.filter((d) => d.value >= target).reduce((a, d) => a + d.p, 0);
