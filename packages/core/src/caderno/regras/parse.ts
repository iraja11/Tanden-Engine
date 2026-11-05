/*
 * Regras do mundo: uma linguagem pequena, em português, dentro de blocos
 * ```regras nas notas do mundo. Este arquivo transforma o texto em árvore.
 *
 * É tolerante de propósito: acento ou sem acento, `=` ou `==` nas condições,
 * "maior que", "pelo menos", "não tem". Blocos por recuo, como no Python.
 * Nada aqui roda código: a árvore só é lida pelo interpretador (run.ts).
 */

export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface Src {
  path: string;
  line: number;
}

export class RuleError extends Error {
  constructor(message: string, readonly src: Src | null = null) {
    super(message);
  }
}

// ------------------------------------------------------------------ léxico

export interface Tok {
  k: 'num' | 'str' | 'id' | 'op';
  /** texto como veio */
  v: string;
  /** sem acento e em minúsculas (para palavras-chave e nomes) */
  key: string;
  num?: number;
}

const OPS2 = ['==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '=>'];
const OPS1 = '=<>+-*/()[],.:%';

export function lexLine(text: string, src: Src): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    // comentário: "#" no começo ou depois de espaço, seguido de espaço (cores "#6fc3c9" passam)
    if (c === '#' && (i === 0 || /\s/.test(text[i - 1]!)) && (i + 1 >= text.length || /\s/.test(text[i + 1]!))) break;
    if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+%?/.exec(text.slice(i))!;
      const raw = m[0];
      const n = Number(raw.replace('%', ''));
      out.push({ k: 'num', v: raw, key: raw, num: raw.endsWith('%') ? n / 100 : n });
      i += raw.length;
      continue;
    }
    if (c === '"' || c === '“' || c === "'") {
      const close = c === '“' ? '”' : c;
      let j = i + 1;
      let s = '';
      while (j < text.length && text[j] !== close && !(c === '"' && text[j] === '”')) {
        if (text[j] === '\\' && j + 1 < text.length) {
          s += text[j + 1];
          j += 2;
        } else s += text[j++];
      }
      if (j >= text.length) throw new RuleError('texto sem aspas de fechamento', src);
      out.push({ k: 'str', v: s, key: fold(s) });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}\p{M}\p{N}_]+/u.exec(text.slice(i))!;
      out.push({ k: 'id', v: m[0], key: fold(m[0]) });
      i += m[0].length;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (OPS2.includes(two)) {
      out.push({ k: 'op', v: two, key: two });
      i += 2;
      continue;
    }
    if (OPS1.includes(c)) {
      out.push({ k: 'op', v: c, key: c });
      i++;
      continue;
    }
    // qualquer outra coisa (⚓, #cor, ✦) vira um texto solto: só faz sentido em "símbolo" e "cor"
    const m = /^[^\s=<>+\-*/()[\],:]+/.exec(text.slice(i))!;
    out.push({ k: 'str', v: m[0], key: fold(m[0]) });
    i += m[0].length;
  }
  return out;
}

export interface Line {
  src: Src;
  indent: number;
  toks: Tok[];
  kids: Line[];
}

/** Linhas em árvore pelo recuo. `first` é o número da primeira linha do bloco na nota. */
export function toLines(code: string, path: string, first = 1): Line[] {
  const root: Line = { src: { path, line: 0 }, indent: -1, toks: [], kids: [] };
  const stack: Line[] = [root];
  code.split('\n').forEach((raw, i) => {
    const src = { path, line: first + i };
    const indent = /^[ \t]*/.exec(raw)![0].replace(/\t/g, '    ').length;
    const toks = lexLine(raw, src);
    if (!toks.length) return;
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!;
    if (parent !== root && !endsBlock(parent)) {
      throw new RuleError('linha recuada sem um bloco em cima (faltou ":" no fim da linha anterior?)', src);
    }
    const line: Line = { src, indent, toks, kids: [] };
    parent.kids.push(line);
    stack.push(line);
  });
  return root.kids;
}

const endsBlock = (l: Line) => l.toks[l.toks.length - 1]?.v === ':';

// ------------------------------------------------------------------ árvore

export type Expr =
  | { t: 'lit'; v: number | string | boolean | null }
  | { t: 'id'; name: string; raw: string }
  | { t: 'list'; items: Expr[] }
  | { t: 'query'; v: string; from: Expr; where: Expr | null }
  | { t: 'get'; obj: Expr; name: string }
  | { t: 'idx'; obj: Expr; index: Expr }
  | { t: 'call'; name: string; raw: string; args: Expr[] }
  | { t: 'un'; op: '-' | 'nao'; a: Expr }
  | { t: 'bin'; op: string; a: Expr; b: Expr }
  | { t: 'is'; a: Expr; type: string; neg: boolean }
  | { t: 'tpl'; parts: Array<string | Expr> };

export type Stmt = { src: Src } & (
  | { t: 'set'; target: Expr; op: '=' | '+=' | '-=' | '*=' | '/='; value: Expr }
  | { t: 'let'; name: string; value: Expr }
  | { t: 'if'; branches: Array<{ cond: Expr | null; body: Stmt[] }> }
  | { t: 'for'; v: string; from: Expr; where: Expr | null; body: Stmt[] }
  | { t: 'say'; kind: 'cronica' | 'avisar'; value: Expr }
  | { t: 'emit'; name: string; args: Expr[] }
  | { t: 'link'; on: boolean; a: Expr; label: Expr; b: Expr }
  | { t: 'stance'; kind: 'guerra' | 'alianca' | 'paz'; a: Expr; b: Expr }
  | { t: 'convoke'; action: Expr; target: Expr }
  | { t: 'stop' }
  | { t: 'expr'; e: Expr }
);

/** Lê uma linha de tokens. Para em ":" (fim de cabeçalho) e nas palavras-chave dadas. */
class P {
  i = 0;
  constructor(readonly toks: Tok[], readonly src: Src) {}
  peek(o = 0): Tok | undefined {
    return this.toks[this.i + o];
  }
  done(): boolean {
    return this.i >= this.toks.length || (this.peek()!.v === ':' && this.i === this.toks.length - 1);
  }
  isKey(...keys: string[]): boolean {
    const t = this.peek();
    return !!t && t.k === 'id' && keys.includes(t.key);
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.k === 'op' && t.v === v;
  }
  next(): Tok {
    const t = this.toks[this.i++];
    if (!t) throw this.err('a linha terminou cedo demais');
    return t;
  }
  key(...keys: string[]): Tok {
    const t = this.next();
    if (t.k !== 'id' || !keys.includes(t.key)) throw this.err(`esperava "${keys[0]}" e veio "${t.v}"`);
    return t;
  }
  op(v: string): void {
    const t = this.next();
    if (t.v !== v) throw this.err(`esperava "${v}" e veio "${t.v}"`);
  }
  ident(what = 'um nome'): Tok {
    const t = this.next();
    if (t.k !== 'id') throw this.err(`esperava ${what} e veio "${t.v}"`);
    return t;
  }
  err(msg: string): RuleError {
    return new RuleError(msg, this.src);
  }
  endHeader(): void {
    if (!this.isOp(':') || this.i !== this.toks.length - 1) throw this.err(`sobrou "${this.peek()?.v ?? ''}" antes do ":"`);
    this.i++;
  }
  end(): void {
    if (this.i < this.toks.length) throw this.err(`não entendi "${this.toks.slice(this.i).map((t) => t.v).join(' ')}"`);
  }

  // ---------------------------------------------------- expressões (Pratt)

  expr(min = 0): Expr {
    let left = this.prefix();
    for (;;) {
      const inf = this.infix();
      if (!inf || inf.prec < min) break;
      left = inf.build(left);
    }
    return left;
  }

  private prefix(): Expr {
    const t = this.next();
    if (t.k === 'num') return { t: 'lit', v: t.num! };
    if (t.k === 'str') return template(t.v, this.src);
    if (t.k === 'op' && t.v === '-') return { t: 'un', op: '-', a: this.expr(7) };
    if (t.k === 'op' && t.v === '(') {
      const e = this.expr();
      this.op(')');
      return e;
    }
    if (t.k === 'op' && t.v === '[') {
      // [p em personagem onde p.fé > 5]  ou  [a, b, c]
      if (this.peek()?.k === 'id' && this.peek(1)?.k === 'id' && this.peek(1)!.key === 'em') {
        const v = this.ident().key;
        this.key('em');
        const from = this.expr(1);
        const where = this.isKey('onde', 'com', 'que') ? (this.next(), this.expr()) : null;
        this.op(']');
        return { t: 'query', v, from, where };
      }
      const items: Expr[] = [];
      while (!this.isOp(']')) {
        items.push(this.expr());
        if (!this.isOp(']')) this.op(',');
      }
      this.op(']');
      return { t: 'list', items };
    }
    if (t.k === 'id') {
      if (t.key === 'verdadeiro' || t.key === 'sim') return { t: 'lit', v: true };
      if (t.key === 'falso') return { t: 'lit', v: false };
      if (t.key === 'vazio' || t.key === 'nada' || t.key === 'nenhum' || t.key === 'nenhuma') return { t: 'lit', v: null };
      if (t.key === 'nao') return { t: 'un', op: 'nao', a: this.expr(3) };
      if (this.isOp('(')) {
        this.next();
        const args: Expr[] = [];
        while (!this.isOp(')')) {
          args.push(this.expr());
          if (!this.isOp(')')) this.op(',');
        }
        this.op(')');
        return { t: 'call', name: t.key, raw: t.v, args };
      }
      return { t: 'id', name: t.key, raw: t.v };
    }
    throw this.err(`não esperava "${t.v}" aqui`);
  }

  private infix(): { prec: number; build: (l: Expr) => Expr } | null {
    const t = this.peek();
    if (!t) return null;
    const bin = (op: string, prec: number, skip = 1) => ({
      prec,
      build: (a: Expr): Expr => {
        this.i += skip;
        return { t: 'bin', op, a, b: this.expr(prec + 1) };
      },
    });
    if (t.k === 'op') {
      switch (t.v) {
        case '==': case '=': return bin('==', 4);
        case '!=': return bin('!=', 4);
        case '<': case '>': case '<=': case '>=': return bin(t.v, 4);
        case '+': case '-': return bin(t.v, 5);
        case '*': case '/': return bin(t.v, 6);
        case '.':
          return { prec: 9, build: (a) => { this.i++; const n = this.next(); if (n.k !== 'id' && n.k !== 'num') throw this.err('esperava um campo depois do "."'); return { t: 'get', obj: a, name: n.v }; } };
        case '[':
          return { prec: 9, build: (a) => { this.i++; const index = this.expr(); this.op(']'); return { t: 'idx', obj: a, index }; } };
        default: return null;
      }
    }
    if (t.k !== 'id') return null;
    const n1 = this.peek(1)?.key;
    switch (t.key) {
      case 'ou': return bin('ou', 1);
      case 'e':
        // "é" (com acento) compara tipo; "e" é o "e" lógico
        if (t.v.toLowerCase() === 'é') return this.isType(false);
        return bin('e', 2);
      case 'eh': return this.isType(false);
      case 'nao':
        if (n1 === 'tem') return bin('!tem', 4, 2);
        if (n1 === 'existe') return { prec: 4, build: (x: Expr): Expr => { this.i += 2; return { t: 'un', op: 'nao', a: { t: 'call', name: 'existe', raw: 'existe', args: [x] } }; } };
        if (n1 === 'e' || n1 === 'eh') return this.isType(true);
        return null;
      case 'tem': case 'contem': return bin('tem', 4);
      case 'existe':
        // "x existe" (sufixo, como se fala)
        return { prec: 4, build: (x: Expr): Expr => { this.i++; return { t: 'call', name: 'existe', raw: 'existe', args: [x] }; } };
      case 'mod': return bin('mod', 6);
      case 'maior': if (n1 === 'que') return bin('>', 4, 2); return null;
      case 'menor': if (n1 === 'que') return bin('<', 4, 2); return null;
      case 'pelo': if (n1 === 'menos') return bin('>=', 4, 2); return null;
      case 'no': if (n1 === 'maximo') return bin('<=', 4, 2); return null;
      case 'diferente': if (n1 === 'de') return bin('!=', 4, 2); return null;
      case 'igual': if (n1 === 'a') return bin('==', 4, 2); return null;
      default: return null;
    }
  }

  private isType(neg: boolean) {
    return {
      prec: 4,
      build: (a: Expr): Expr => {
        if (neg) this.i++;
        this.i++;
        if (this.isKey('um', 'uma')) this.i++;
        return { t: 'is', a, type: this.ident('um tipo').key, neg };
      },
    };
  }
}

/** "olá {p.nome}" → partes de texto e expressões. */
function template(s: string, src: Src): Expr {
  if (!s.includes('{')) return { t: 'lit', v: s };
  const parts: Array<string | Expr> = [];
  let last = 0;
  for (const m of s.matchAll(/\{([^{}]+)\}/g)) {
    if (m.index! > last) parts.push(s.slice(last, m.index));
    const p = new P(lexLine(m[1]!, src), src);
    parts.push(p.expr());
    p.end();
    last = m.index! + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return { t: 'tpl', parts };
}

// ------------------------------------------------------------------ comandos

export function parseBlock(lines: Line[]): Stmt[] {
  const out: Stmt[] = [];
  for (const l of lines) {
    const p = new P(l.toks, l.src);
    const first = l.toks[0]!;
    const k = first.k === 'id' ? first.key : '';
    if (k === 'senao') {
      const prev = out[out.length - 1];
      if (!prev || prev.t !== 'if' || prev.branches[prev.branches.length - 1]!.cond === null) throw p.err('"senão" sem um "se" antes');
      p.next();
      let cond: Expr | null = null;
      if (p.isKey('se')) {
        p.next();
        cond = p.expr();
      }
      p.endHeader();
      prev.branches.push({ cond, body: parseBlock(l.kids) });
      continue;
    }
    out.push(parseStmt(p, l, k));
  }
  return out;
}

function needKids(p: P, l: Line): void {
  if (!l.kids.length) throw p.err('o bloco está vazio (recue as linhas de dentro)');
}

function parseStmt(p: P, l: Line, k: string): Stmt {
  const src = l.src;
  const noKids = () => {
    if (l.kids.length) throw p.err('esta linha não abre bloco');
  };
  switch (k) {
    case 'se': {
      p.next();
      const cond = p.expr();
      p.endHeader();
      needKids(p, l);
      return { src, t: 'if', branches: [{ cond, body: parseBlock(l.kids) }] };
    }
    case 'para':
    case 'cada': {
      p.next();
      if (k === 'para') p.key('cada');
      const v = p.ident().key;
      p.key('em', 'de');
      const from = p.expr();
      const where = p.isKey('onde', 'com', 'que') ? (p.next(), p.expr()) : null;
      p.endHeader();
      needKids(p, l);
      return { src, t: 'for', v, from, where, body: parseBlock(l.kids) };
    }
    case 'seja': {
      p.next();
      const name = p.ident().key;
      p.op('=');
      const value = p.expr();
      p.end();
      noKids();
      return { src, t: 'let', name, value };
    }
    case 'cronica':
    case 'avisar':
    case 'aviso': {
      p.next();
      const value = p.expr();
      p.end();
      noKids();
      return { src, t: 'say', kind: k === 'cronica' ? 'cronica' : 'avisar', value };
    }
    case 'disparar':
    case 'disparo': {
      p.next();
      const name = p.ident('o nome do evento').key;
      const args: Expr[] = [];
      if (p.isOp('(')) {
        p.next();
        while (!p.isOp(')')) {
          args.push(p.expr());
          if (!p.isOp(')')) p.op(',');
        }
        p.op(')');
      }
      p.end();
      noKids();
      return { src, t: 'emit', name, args };
    }
    case 'liga':
    case 'ligar':
    case 'desliga':
    case 'desligar': {
      p.next();
      const a = p.expr();
      p.op(',');
      const label = p.expr();
      p.op(',');
      const b = p.expr();
      p.end();
      noKids();
      return { src, t: 'link', on: k.startsWith('liga'), a, label, b };
    }
    case 'guerra':
    case 'alianca':
    case 'paz': {
      p.next();
      const a = p.expr();
      p.op(',');
      const b = p.expr();
      p.end();
      noKids();
      return { src, t: 'stance', kind: k, a, b };
    }
    case 'convocar':
    case 'convoca': {
      p.next();
      const action = p.expr();
      p.key('em', 'para', 'sobre');
      const target = p.expr();
      p.end();
      noKids();
      return { src, t: 'convoke', action, target };
    }
    case 'parar':
    case 'pare': {
      p.next();
      p.end();
      return { src, t: 'stop' };
    }
  }
  // atribuição: o primeiro "=", "+="... fora de parênteses separa alvo e valor
  let depth = 0;
  let at = -1;
  l.toks.forEach((t, i) => {
    if (at >= 0 || t.k !== 'op') return;
    if (t.v === '(' || t.v === '[') depth++;
    else if (t.v === ')' || t.v === ']') depth--;
    else if (depth === 0 && ['=', '+=', '-=', '*=', '/='].includes(t.v)) at = i;
  });
  if (at > 0) {
    const tp = new P(l.toks.slice(0, at), src);
    const target = tp.expr();
    tp.end();
    if (target.t !== 'id' && target.t !== 'get' && target.t !== 'idx') throw p.err('só dá para mudar um nome ou um campo (ex.: x.poder += 1)');
    const vp = new P(l.toks.slice(at + 1), src);
    const value = vp.expr();
    vp.end();
    noKids();
    return { src, t: 'set', target, op: l.toks[at]!.v as '=', value };
  }
  const e = p.expr();
  p.end();
  noKids();
  if (e.t !== 'call') throw p.err('esta linha não faz nada (é só um valor). Faltou "=", "se" ou "crônica"?');
  return { src, t: 'expr', e };
}

// ------------------------------------------------------------------ declarações

export interface RuleType {
  id: string;
  label: string;
  plural: string;
  fields: string[];
  defaults: Record<string, string>;
  extras: string[];
  sections: string[];
  color?: string;
  glyph?: string;
  src: Src;
}
export interface RuleComputed { name: string; type: string; expr: Expr; src: Src }
export interface RuleAction { name: string; type: string; where: Expr | null; body: Stmt[]; src: Src }
export interface RuleHandler { event: string; label: string; params: string[]; paramsRaw: string[]; type: string | null; where: Expr | null; body: Stmt[]; src: Src }
export interface RuleGroup { name: string; label: string; v: string; from: string; where: Expr | null; src: Src }
export interface RuleParty { v: string; type: string }
export interface RuleInteraction { name: string; a: RuleParty; b: RuleParty | null; where: Expr | null; attraction: Expr | null; chance: Expr | null; body: Stmt[]; src: Src }
export interface RuleGlobal { name: string; value: Expr; src: Src }
/** Traço de personalidade declarado nas regras (entra no catálogo da simulação de vidas). */
export interface RuleTrait {
  id: string;
  m: string;
  f: string;
  opposite: string | null;
  /** chance de passar de pai/mãe para filho (0 a 1) */
  inherit: number;
  desc: string;
  category: string;
  /** multiplicador do peso de cada interação (id sem acento → ×) */
  weights: Record<string, number>;
  /** opinião extra quando o outro tem este traço (id → pontos); "" = o próprio traço */
  affinity: Record<string, number>;
  mood: number;
  stress: number;
  /** surge sozinho na pessoa quando a condição vale (conferido uma vez por ano) */
  emerge: Expr | null;
  emergeChance: number;
  src: Src;
}
/** Profissão declarada nas regras. */
export interface RuleProfession {
  id: string;
  m: string;
  f: string;
  income: number;
  skill: string;
  status: number;
  risk: number;
  travels: boolean;
  requires: Expr | null;
  src: Src;
}

export interface RuleIssue {
  path: string;
  line: number;
  message: string;
}

export interface Program {
  types: RuleType[];
  groups: RuleGroup[];
  computed: RuleComputed[];
  actions: RuleAction[];
  handlers: RuleHandler[];
  interactions: RuleInteraction[];
  globals: RuleGlobal[];
  traits: RuleTrait[];
  professions: RuleProfession[];
  tastes: string[];
  issues: RuleIssue[];
}

export const emptyProgram = (): Program => ({
  types: [], groups: [], computed: [], actions: [], handlers: [], interactions: [], globals: [], traits: [], professions: [], tastes: [], issues: [],
});

/** "+50%" → 1,5; "-30%" → 0,7; "* 2" ou "x2" → 2; "2" → 2. */
function multiplier(p: P): number {
  const t = p.next();
  if (t.k === 'op' && (t.v === '+' || t.v === '-')) {
    const n = p.next();
    if (n.k !== 'num') throw p.err('esperava um número depois do sinal (ex.: +50%)');
    const frac = n.v.endsWith('%') || n.num! > 3 ? (n.v.endsWith('%') ? n.num! : n.num! / 100) : n.num!;
    return Math.max(0, t.v === '+' ? 1 + frac : 1 - frac);
  }
  if ((t.k === 'op' && t.v === '*') || (t.k === 'id' && (t.key === 'x' || t.key === 'vezes'))) {
    const n = p.next();
    if (n.k !== 'num') throw p.err('esperava um número depois do "*"');
    return n.num!;
  }
  if (t.k === 'num') return t.num!;
  throw p.err(`esperava um peso como +50%, -30% ou * 2; veio "${t.v}"`);
}

/** "+10", "-5", "10" → número com sinal. */
function signed(p: P): number {
  const t = p.next();
  if (t.k === 'op' && (t.v === '+' || t.v === '-')) {
    const n = p.next();
    if (n.k !== 'num') throw p.err('esperava um número');
    return t.v === '-' ? -n.num! : n.num!;
  }
  if (t.k === 'num') return t.num!;
  throw p.err(`esperava um número; veio "${t.v}"`);
}

const pct = (p: P): number => {
  const n = p.next();
  if (n.k !== 'num') throw p.err('esperava uma porcentagem (ex.: 25%)');
  return n.v.endsWith('%') ? n.num! : n.num! > 1 ? n.num! / 100 : n.num!;
};

const str = (p: P, what: string): string => {
  const t = p.next();
  if (t.k !== 'str' && t.k !== 'id') throw p.err(`esperava ${what}`);
  return t.v;
};

/** Junta os blocos ```regras de várias notas num programa. Erros não param o resto. */
export function compileRules(blocks: Array<{ path: string; code: string; line?: number }>): Program {
  const prog = emptyProgram();
  for (const b of blocks) {
    let lines: Line[];
    try {
      lines = toLines(b.code, b.path, b.line ?? 1);
    } catch (e) {
      prog.issues.push(issue(e, b.path));
      continue;
    }
    for (const l of lines) {
      try {
        decl(prog, l);
      } catch (e) {
        prog.issues.push(issue(e, b.path, l.src.line));
      }
    }
  }
  return prog;
}

function issue(e: unknown, path: string, line = 0): RuleIssue {
  if (e instanceof RuleError) return { path: e.src?.path ?? path, line: e.src?.line ?? line, message: e.message };
  return { path, line, message: String(e) };
}

function decl(prog: Program, l: Line): void {
  const p = new P(l.toks, l.src);
  const k = l.toks[0]!.key;
  const src = l.src;
  switch (k) {
    case 'tipo': {
      p.next();
      const idTok = p.next();
      const id = fold(idTok.v).trim();
      const label = p.done() ? cap(idTok.v) : str(p, 'o rótulo entre aspas');
      const plural = p.done() ? `${label}s` : str(p, 'o plural entre aspas');
      p.endHeader();
      const t: RuleType = { id, label, plural, fields: [], defaults: {}, extras: [], sections: [], src };
      for (const kid of l.kids) {
        const q = new P(kid.toks, kid.src);
        const kk = kid.toks[0]!.key;
        q.next();
        if (kk === 'campo' || kk === 'extra') {
          const name = str(q, 'o nome do campo');
          if (q.isOp('=')) {
            q.next();
            const v = q.expr();
            if (v.t !== 'lit') throw q.err('o valor padrão precisa ser um número ou um texto');
            t.defaults[name] = v.v === null ? '' : String(v.v);
          }
          q.end();
          (kk === 'campo' ? t.fields : t.extras).push(name);
        } else if (kk === 'secao') {
          t.sections.push(str(q, 'o nome da seção'));
          q.end();
        } else if (kk === 'cor') {
          t.color = kid.toks.slice(1).map((x) => x.v).join('');
        } else if (kk === 'simbolo' || kk === 'icone') {
          t.glyph = kid.toks.slice(1).map((x) => x.v).join('');
        } else throw q.err(`dentro de "tipo" vale campo, extra, seção, cor e símbolo; veio "${kid.toks[0]!.v}"`);
      }
      prog.types.push(t);
      return;
    }
    case 'grupo': {
      // grupo elfos = personagem onde espécie.nome = "Elfo"
      p.next();
      const nameTok = p.ident('o nome do grupo');
      p.op('=');
      const from = p.ident('um tipo ou grupo').key;
      const where = p.isKey('onde', 'com', 'que') ? (p.next(), p.expr()) : null;
      p.end();
      prog.groups.push({ name: nameTok.key, label: nameTok.v, v: from, from, where, src });
      return;
    }
    case 'calcular':
    case 'calculado': {
      p.next();
      const name = str(p, 'o nome do campo');
      p.key('em', 'de', 'para');
      const type = p.ident('um tipo').key;
      p.op('=');
      const expr = p.expr();
      p.end();
      prog.computed.push({ name, type, expr, src });
      return;
    }
    case 'acao': {
      p.next();
      const name = str(p, 'o nome da ação entre aspas');
      p.key('em', 'de', 'para');
      const type = p.ident('um tipo').key;
      const where = p.isKey('onde', 'se', 'quando') ? (p.next(), p.expr()) : null;
      p.endHeader();
      needKids(p, l);
      prog.actions.push({ name, type, where, body: parseBlock(l.kids), src });
      return;
    }
    case 'quando':
    case 'ao': {
      p.next();
      const evTok = p.ident('o nome do evento');
      const event = evTok.key;
      const params: string[] = [];
      const paramsRaw: string[] = [];
      if (p.isOp('(')) {
        p.next();
        while (!p.isOp(')')) {
          const pt = p.ident('um nome');
          params.push(pt.key);
          paramsRaw.push(pt.v);
          if (!p.isOp(')')) p.op(',');
        }
        p.op(')');
      }
      const type = p.isKey('em', 'de', 'para') ? (p.next(), p.ident('um tipo').key) : null;
      const where = p.isKey('onde', 'se') ? (p.next(), p.expr()) : null;
      p.endHeader();
      needKids(p, l);
      prog.handlers.push({ event, label: evTok.v, params, paramsRaw, type, where, body: parseBlock(l.kids), src });
      return;
    }
    case 'interacao': {
      // interação "Peregrinação" entre devoto em personagem, templo em lugar onde ...:
      p.next();
      const name = str(p, 'o nome da interação entre aspas');
      const kind = p.key('entre', 'de', 'para').key;
      const a: RuleParty = { v: p.ident().key, type: '' };
      p.key('em', 'de');
      a.type = p.ident('um tipo').key;
      let b: RuleParty | null = null;
      if (kind === 'entre' || p.isOp(',') || p.isKey('e', 'com')) {
        if (!p.isOp(',') && !p.isKey('e', 'com')) throw p.err('"entre" pede duas partes: entre a em X, b em Y');
        p.next();
        b = { v: p.ident().key, type: '' };
        p.key('em', 'de');
        b.type = p.ident('um tipo').key;
      }
      const where = p.isKey('onde', 'se', 'quando') ? (p.next(), p.expr()) : null;
      p.endHeader();
      needKids(p, l);
      let attraction: Expr | null = null;
      let chance: Expr | null = null;
      const rest: Line[] = [];
      for (const kid of l.kids) {
        const f = kid.toks[0]!;
        if (f.k === 'id' && (f.key === 'atracao' || f.key === 'chance' || f.key === 'peso') && kid.toks[1]?.v === '=') {
          const q = new P(kid.toks.slice(2), kid.src);
          const e = q.expr();
          q.end();
          if (f.key === 'chance') chance = e;
          else attraction = e;
        } else rest.push(kid);
      }
      prog.interactions.push({ name, a, b, where, attraction, chance, body: parseBlock(rest), src });
      return;
    }
    case 'traco': {
      // traço "Sonâmbulo" "Sonâmbula":
      p.next();
      const m = str(p, 'o nome do traço entre aspas');
      const f = p.done() ? m : str(p, 'a forma feminina entre aspas');
      p.endHeader();
      const t: RuleTrait = {
        id: fold(m).trim(), m, f, opposite: null, inherit: 0, desc: '', category: 'personalidade', weights: {}, affinity: {}, mood: 0, stress: 0,
        emerge: null, emergeChance: 1, src,
      };
      for (const kid of l.kids) {
        const q = new P(kid.toks, kid.src);
        const kk = kid.toks[0]!.key;
        q.next();
        if (kk === 'oposto' || kk === 'contrario') t.opposite = fold(str(q, 'o traço oposto entre aspas')).trim();
        else if (kk === 'herdavel' || kk === 'heranca' || kk === 'hereditario') t.inherit = pct(q);
        else if (kk === 'descricao') t.desc = str(q, 'a descrição entre aspas');
        else if (kk === 'categoria') t.category = fold(str(q, 'a categoria'));
        else if (kk === 'peso') t.weights[fold(q.ident('o nome de uma interação (ex.: flertar)').v)] = multiplier(q);
        else if (kk === 'afinidade') {
          const other = q.peek()?.k === 'str' ? fold(q.next().v).trim() : '';
          t.affinity[other] = signed(q);
        } else if (kk === 'humor') t.mood = signed(q);
        else if (kk === 'estresse') t.stress = signed(q);
        else if (kk === 'surge' || kk === 'aparece') {
          q.key('onde', 'se', 'quando');
          t.emerge = q.expr();
        } else if (kk === 'chance') t.emergeChance = pct(q);
        else throw q.err(`dentro de "traço" vale oposto, herdável, descrição, categoria, peso, afinidade, humor, estresse, surge e chance; veio "${kid.toks[0]!.v}"`);
        q.end();
      }
      prog.traits.push(t);
      return;
    }
    case 'profissao': {
      // profissão "Alquimista":
      p.next();
      const m = str(p, 'o nome da profissão entre aspas');
      const f = p.done() ? m : str(p, 'a forma feminina entre aspas');
      p.endHeader();
      const t: RuleProfession = { id: fold(m).trim(), m, f, income: 4, skill: 'oficio', status: 2, risk: 0, travels: false, requires: null, src };
      for (const kid of l.kids) {
        const q = new P(kid.toks, kid.src);
        const kk = kid.toks[0]!.key;
        q.next();
        if (kk === 'renda' || kk === 'salario') t.income = signed(q);
        else if (kk === 'habilidade') t.skill = fold(q.next().v);
        else if (kk === 'status' || kk === 'prestigio') t.status = signed(q);
        else if (kk === 'risco') t.risk = pct(q);
        else if (kk === 'viaja' || kk === 'viajante') t.travels = true;
        else if (kk === 'requer' || kk === 'exige') t.requires = q.expr();
        else throw q.err(`dentro de "profissão" vale renda, habilidade, status, risco, viaja e requer; veio "${kid.toks[0]!.v}"`);
        q.end();
      }
      prog.professions.push(t);
      return;
    }
    case 'gosto':
    case 'gostos': {
      p.next();
      for (;;) {
        prog.tastes.push(str(p, 'o gosto entre aspas'));
        if (!p.isOp(',')) break;
        p.next();
      }
      p.end();
      return;
    }
    case 'seja': {
      p.next();
      const name = p.ident().key;
      p.op('=');
      const value = p.expr();
      p.end();
      prog.globals.push({ name, value, src });
      return;
    }
  }
  throw p.err(`não sei começar com "${l.toks[0]!.v}". Use tipo, grupo, calcular, ação, quando, interação, traço, profissão, gosto ou seja`);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Comandos soltos (para o console): uma expressão ou algumas linhas. */
export function parseLoose(code: string): { expr: Expr | null; body: Stmt[] } {
  const lines = toLines(code, 'console');
  if (lines.length === 1 && !lines[0]!.kids.length) {
    const l = lines[0]!;
    const p = new P(l.toks, l.src);
    try {
      const e = p.expr();
      if (p.done()) return { expr: e, body: [] };
    } catch {
      // não é só expressão: tenta como comando
    }
  }
  return { expr: null, body: parseBlock(lines) };
}

/** Uma expressão solta (usada nos textos sorteados de tabelas: "{a.nome}"). */
export function parseExprSource(code: string): Expr {
  const src = { path: 'texto', line: 0 };
  const p = new P(lexLine(code, src), src);
  const e = p.expr();
  p.end();
  return e;
}
