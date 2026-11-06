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
  /** controle de uma trama em etapas: seguir, falhar, concluir, repetir, ir para "Etapa", esperar N (meses) */
  | { t: 'flow'; kind: FlowKind; arg: Expr | null }
);

export type FlowKind = 'seguir' | 'falhar' | 'concluir' | 'repetir' | 'ir' | 'esperar';

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
  return parseTemplate(s, src);
}

/**
 * Texto com partes trocáveis entre chaves:
 *  - `{a}`, `{a.nome}`, `{dado("1d6")}`: o valor de uma expressão;
 *  - `{rico|abastado|cheio da grana}`: uma das opções, sorteada (pode ter `{a}` dentro);
 *  - `{a:cansado/cansada}` ou `{a:o/a/e}`: a forma do gênero de quem é `a`.
 * `tolerant`: uma chave que não dá para ler fica como está (bancos de texto).
 */
export function parseTemplate(s: string, src: Src, tolerant = false): Expr {
  if (!s.includes('{')) return { t: 'lit', v: s };
  const parts: Array<string | Expr> = [];
  let buf = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] !== '{') {
      buf += s[i++];
      continue;
    }
    let d = 0;
    let j = i;
    for (; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}' && --d === 0) break;
    }
    if (j >= s.length) {
      buf += s.slice(i);
      break;
    }
    const inner = s.slice(i + 1, j);
    let e: Expr;
    try {
      e = braceExpr(inner, src, tolerant);
    } catch (err) {
      if (!tolerant) throw err;
      e = { t: 'lit', v: `{${inner}}` };
    }
    if (buf) parts.push(buf);
    buf = '';
    parts.push(e);
    i = j + 1;
  }
  if (buf) parts.push(buf);
  return { t: 'tpl', parts };
}

/** Divide no separador só no nível de fora das chaves. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let d = 0;
  let cur = '';
  for (const c of s) {
    if (c === '{') d++;
    else if (c === '}') d--;
    if (c === sep && d === 0) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function braceExpr(inner: string, src: Src, tolerant: boolean): Expr {
  const opts = splitTop(inner, '|');
  if (opts.length > 1) return { t: 'call', name: '__escolha', raw: '', args: opts.map((o) => parseTemplate(o, src, tolerant)) };
  const g = /^\s*([\p{L}_][\p{L}\p{M}\p{N}_.]*)\s*:\s*([^{}:]*\/[^{}:]*)$/u.exec(inner);
  if (g) {
    const p = new P(lexLine(g[1]!, src), src);
    const who = p.expr();
    p.end();
    return { t: 'call', name: '__genero', raw: '', args: [who, ...g[2]!.split('/').map((f): Expr => ({ t: 'lit', v: f.trim() }))] };
  }
  const p = new P(lexLine(inner, src), src);
  const e = p.expr();
  p.end();
  return e;
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
  // controle das tramas (só vale dentro de uma etapa; o interpretador confere)
  const FLOW: Record<string, FlowKind> = {
    seguir: 'seguir', avancar: 'seguir', prosseguir: 'seguir', falhar: 'falhar', fracassar: 'falhar', concluir: 'concluir', encerrar: 'concluir',
    repetir: 'repetir', ir: 'ir', esperar: 'esperar', aguardar: 'esperar',
  };
  if (FLOW[k] && l.toks[1]?.v !== '(' && l.toks[1]?.v !== '=' && l.toks[1]?.v !== '.' && !/^[+\-*/]=$/.test(l.toks[1]?.v ?? '')) {
    const kind = FLOW[k]!;
    p.next();
    if (kind === 'ir') p.key('para', 'a', 'pra');
    let arg: Expr | null = null;
    if (!p.done()) arg = p.expr();
    // "esperar 3 meses" / "repetir em 2 meses"
    if (p.isKey('mes', 'meses')) p.next();
    p.end();
    noKids();
    if ((kind === 'ir' || kind === 'esperar') && !arg) throw p.err(kind === 'ir' ? 'ir para qual etapa? (ex.: ir para "Convite")' : 'esperar quantos meses? (ex.: esperar 2)');
    return { src, t: 'flow', kind, arg };
  }
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
  /** ajustes enquanto tem o traço: força, intelecto, combate, atributos... */
  mods: Record<string, number>;
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

/** Atributo numérico das pessoas (sanidade, fé, envergadura...), com faixa, herança e espécie. */
export interface RuleAttribute {
  id: string;
  name: string;
  min: number;
  max: number;
  mean: number;
  sd: number;
  /** quanto vem dos pais (0 a 1) */
  inherit: number;
  /** físico, mental, social... (só para mostrar) */
  category: string;
  /** muda sozinho a cada ano */
  perYear: number;
  /** só estas espécies têm (vazio = todos) */
  only: string[];
  desc: string;
  src: Src;
}
/** Espécie (ou criatura) da simulação: vida, maioridade, fertilidade, corpo, cruzamentos. */
export interface RuleSpecies {
  id: string;
  name: string;
  plural: string;
  /** expectativa de vida em anos */
  life: number | null;
  /** idade adulta em anos */
  adult: number | null;
  /** multiplicador da fertilidade */
  fertility: number | null;
  /** meses de gestação */
  gestation: number | null;
  /** altura média em cm */
  height: number | null;
  /** ajustes de atributos e características (força, intelecto, beleza, saúde, ou atributos declarados) */
  mods: Record<string, number>;
  /** traços de nascença de todos da espécie */
  traits: string[];
  /** traços que cada um pode ter ao nascer (traço → chance) */
  maybe: Record<string, number>;
  crosses: Array<{ with: string; gives: string | null }>;
  /** criatura: não conversa, não namora, não trabalha; só briga e se reproduz com a própria espécie */
  creature: boolean;
  /** fração dos figurantes gerados que nasce desta espécie */
  frequency: number;
  desc: string;
  src: Src;
}
/** Item do mundo (comum ou único, como as relíquias de Skyrim), com efeitos enquanto alguém o tem. */
export interface RuleItem {
  id: string;
  name: string;
  plural: string;
  /** só existe um no mundo */
  unique: boolean;
  /** arma, joia, livro, relíquia... */
  kind: string;
  rarity: string;
  value: number;
  desc: string;
  /** ajustes enquanto possui: combate +5, força +10, sanidade -10 */
  mods: Record<string, number>;
  /** muda todo mês enquanto possui: humor, estresse, saúde, dinheiro ou atributos */
  perMonth: Record<string, number>;
  /** traços que a pessoa ganha enquanto tem o item */
  traits: string[];
  /** quem tem no começo (nome) */
  owner: string | null;
  /** onde está largado no começo (nome do lugar), se ninguém tem */
  place: string | null;
  /** atrai ladrões e cobiça */
  coveted: boolean;
  onGain: Stmt[];
  onLose: Stmt[];
  monthly: Stmt[];
  src: Src;
}
/** Evento do mundo com duração (como festa, peste, fome), declarado nas regras. */
export interface RuleEvent {
  id: string;
  name: string;
  /** chance por ano de começar sozinho (0 = só à mão ou por `começar_evento`) */
  chance: number;
  /** meses que dura */
  months: number;
  /** um lugar sorteado (padrão) ou o mundo todo */
  global: boolean;
  /** só começa onde/quando isto vale (`lugar` é o lugar sorteado) */
  where: Expr | null;
  desc: string;
  onStart: Stmt[];
  /** roda todo mês para cada pessoa no lugar (`personagem`, `lugar`) */
  monthly: Stmt[];
  onEnd: Stmt[];
  /** ajusta o peso das interações enquanto dura (id → ×) */
  weights: Record<string, number>;
  src: Src;
}
/** Uma etapa de trama: corre quando chega a vez dela e espera `months` antes da próxima. */
export interface RuleStage { name: string; months: Expr | null; body: Stmt[]; src: Src }
/** Interação em várias etapas, que dura meses (uma sedução, uma conspiração, uma vingança). */
export interface RuleScheme {
  name: string;
  a: RuleParty;
  b: RuleParty | null;
  where: Expr | null;
  attraction: Expr | null;
  chance: Expr | null;
  stages: RuleStage[];
  onFail: Stmt[];
  onDone: Stmt[];
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
  attributes: RuleAttribute[];
  species: RuleSpecies[];
  schemes: RuleScheme[];
  items: RuleItem[];
  events: RuleEvent[];
  issues: RuleIssue[];
}

export const emptyProgram = (): Program => ({
  types: [], groups: [], computed: [], actions: [], handlers: [], interactions: [], globals: [], traits: [], professions: [], tastes: [],
  attributes: [], species: [], schemes: [], items: [], events: [], issues: [],
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
      const { a, b, where } = parties(p);
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
        id: fold(m).trim(), m, f, opposite: null, inherit: 0, desc: '', category: 'personalidade', weights: {}, affinity: {}, mood: 0, stress: 0, mods: {},
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
        else if (kk === 'ajuste' || kk === 'bonus') {
          const words: string[] = [];
          while (q.peek() && (q.peek()!.k === 'id' || q.peek()!.k === 'str')) words.push(fold(q.next().v).trim());
          if (!words.length) throw q.err('ajuste de quê? (ex.: ajuste força +10)');
          t.mods[words.join(' ').replace(/_/g, ' ')] = signed(q);
        } else throw q.err(`dentro de "traço" vale oposto, herdável, descrição, categoria, peso, afinidade, humor, estresse, ajuste, surge e chance; veio "${kid.toks[0]!.v}"`);
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
    case 'trama': {
      // trama "Sedução lenta" entre a em personagem, b em personagem onde ...:
      p.next();
      const name = str(p, 'o nome da trama entre aspas');
      const { a, b, where } = parties(p);
      p.endHeader();
      needKids(p, l);
      const sc: RuleScheme = { name, a, b, where, attraction: null, chance: null, stages: [], onFail: [], onDone: [], src };
      for (const kid of l.kids) {
        const f = kid.toks[0]!;
        const q = new P(kid.toks, kid.src);
        if (f.k === 'id' && (f.key === 'atracao' || f.key === 'chance' || f.key === 'peso') && kid.toks[1]?.v === '=') {
          const r = new P(kid.toks.slice(2), kid.src);
          const e = r.expr();
          r.end();
          if (f.key === 'chance') sc.chance = e;
          else sc.attraction = e;
        } else if (f.k === 'id' && f.key === 'etapa') {
          q.next();
          const nome = str(q, 'o nome da etapa entre aspas');
          q.endHeader();
          needKids(q, kid);
          let months: Expr | null = null;
          const rest: Line[] = [];
          for (const g of kid.kids) {
            if (g.toks[0]?.k === 'id' && (g.toks[0].key === 'dura' || g.toks[0].key === 'duracao') && !g.kids.length) {
              const r = new P(g.toks.slice(1), g.src);
              months = r.expr();
              if (r.isKey('mes', 'meses')) r.next();
              r.end();
            } else rest.push(g);
          }
          sc.stages.push({ name: nome, months, body: parseBlock(rest), src: kid.src });
        } else if (f.k === 'id' && (f.key === 'ao' || f.key === 'se') && ['falhar', 'fracassar', 'concluir', 'fim', 'terminar'].includes(kid.toks[1]?.key ?? '')) {
          q.next();
          const w = q.next().key;
          q.endHeader();
          needKids(q, kid);
          if (w === 'falhar' || w === 'fracassar') sc.onFail = parseBlock(kid.kids);
          else sc.onDone = parseBlock(kid.kids);
        } else {
          throw q.err(`dentro de "trama" vale chance =, atração =, etapa "Nome":, ao falhar: e ao concluir:; veio "${f.v}"`);
        }
      }
      if (!sc.stages.length) throw p.err('a trama precisa de pelo menos uma etapa (etapa "Nome":)');
      prog.schemes.push(sc);
      return;
    }
    case 'item':
    case 'objeto':
    case 'artefato':
    case 'reliquia': {
      // item "Espada de Aurora":
      p.next();
      const name = str(p, 'o nome do item entre aspas');
      const plural = p.done() || p.isOp(':') ? name : str(p, 'o plural entre aspas');
      const it: RuleItem = {
        id: fold(name).trim(), name, plural, unique: k === 'artefato' || k === 'reliquia', kind: k === 'item' || k === 'objeto' ? 'item' : k, rarity: '', value: 10, desc: '',
        mods: {}, perMonth: {}, traits: [], owner: null, place: null, coveted: false, onGain: [], onLose: [], monthly: [], src,
      };
      if (p.isOp(':')) {
        p.endHeader();
        for (const kid of l.kids) {
          const q = new P(kid.toks, kid.src);
          const kk = kid.toks[0]!.key;
          const k2 = kid.toks[1]?.key ?? '';
          // blocos: ao ganhar / ao perder / todo mês
          if ((kk === 'ao' || kk === 'quando') && ['ganhar', 'ganha', 'receber', 'recebe', 'perder', 'perde'].includes(k2)) {
            q.next();
            q.next();
            q.endHeader();
            needKids(q, kid);
            if (k2.startsWith('ganh') || k2.startsWith('receb')) it.onGain = parseBlock(kid.kids);
            else it.onLose = parseBlock(kid.kids);
            continue;
          }
          if (kk === 'todo' && k2 === 'mes') {
            q.next();
            q.next();
            q.endHeader();
            needKids(q, kid);
            it.monthly = parseBlock(kid.kids);
            continue;
          }
          q.next();
          if (kk === 'unico' || kk === 'unica') it.unique = true;
          else if (kk === 'comum') it.unique = false;
          else if (kk === 'cobicado' || kk === 'cobicada') it.coveted = true;
          else if (kk === 'tipo' || kk === 'categoria') it.kind = fold(q.next().v);
          else if (kk === 'raridade') {
            it.rarity = q.next().v;
            if (/^(lend|unic|artef|mitic)/.test(fold(it.rarity))) it.unique = true;
          } else if (kk === 'valor' || kk === 'preco') it.value = signed(q);
          else if (kk === 'descricao') it.desc = str(q, 'a descrição entre aspas');
          else if (kk === 'dono' || kk === 'dona') it.owner = str(q, 'o nome de quem tem o item');
          else if (kk === 'em' || kk === 'local' || kk === 'onde' || kk === 'perdido' || kk === 'perdida') {
            if (q.isKey('em')) q.next();
            it.place = str(q, 'o lugar entre aspas');
          } else if (kk === 'traco' || kk === 'tracos' || kk === 'concede') {
            for (;;) {
              it.traits.push(fold(str(q, 'o traço entre aspas')).trim());
              if (!q.isOp(',')) break;
              q.next();
            }
          } else if (kk === 'por' && q.isKey('mes')) {
            q.next();
            const words: string[] = [];
            while (q.peek() && (q.peek()!.k === 'id' || q.peek()!.k === 'str')) words.push(fold(q.next().v).trim());
            if (!words.length) throw q.err('por mês o quê? (ex.: por mês sanidade -1)');
            it.perMonth[words.join(' ').replace(/_/g, ' ')] = signed(q);
          } else {
            // ajuste enquanto possui: "combate +5"
            q.i = 0;
            if (q.isKey('ajuste', 'bonus')) q.next();
            const words: string[] = [];
            while (q.peek() && (q.peek()!.k === 'id' || q.peek()!.k === 'str')) words.push(fold(q.next().v).trim());
            if (!words.length || !q.peek()) {
              throw q.err(`dentro de "item" vale único, tipo, raridade, valor, descrição, dono, em "lugar", traço, cobiçado, por mês, ao ganhar:, ao perder:, todo mês: ou um ajuste como "combate +5"; veio "${kid.toks[0]!.v}"`);
            }
            it.mods[words.join(' ').replace(/_/g, ' ')] = signed(q);
          }
          q.end();
        }
      } else p.end();
      prog.items.push(it);
      return;
    }
    case 'evento': {
      // evento "Lua de Sangue":
      p.next();
      const name = str(p, 'o nome do evento entre aspas');
      p.endHeader();
      const ev: RuleEvent = { id: fold(name).trim(), name, chance: 0, months: 1, global: false, where: null, desc: '', onStart: [], monthly: [], onEnd: [], weights: {}, src };
      for (const kid of l.kids) {
        const q = new P(kid.toks, kid.src);
        const kk = kid.toks[0]!.key;
        const k2 = kid.toks[1]?.key ?? '';
        if ((kk === 'ao' || kk === 'quando') && ['comecar', 'inicio', 'acabar', 'fim', 'terminar'].includes(k2)) {
          q.next();
          q.next();
          q.endHeader();
          needKids(q, kid);
          if (k2 === 'comecar' || k2 === 'inicio') ev.onStart = parseBlock(kid.kids);
          else ev.onEnd = parseBlock(kid.kids);
          continue;
        }
        if (kk === 'todo' && k2 === 'mes') {
          q.next();
          q.next();
          if (q.isKey('em')) {
            q.next();
            q.ident('um tipo');
          }
          q.endHeader();
          needKids(q, kid);
          ev.monthly = parseBlock(kid.kids);
          continue;
        }
        q.next();
        if (kk === 'chance') ev.chance = pct(q);
        else if (kk === 'dura' || kk === 'duracao') {
          ev.months = Math.max(1, signed(q));
          if (q.isKey('mes', 'meses')) q.next();
        } else if (kk === 'global' || kk === 'mundo') ev.global = true;
        else if (kk === 'onde' || kk === 'se' || kk === 'quando') ev.where = q.expr();
        else if (kk === 'descricao') ev.desc = str(q, 'a descrição entre aspas');
        else if (kk === 'peso') ev.weights[fold(q.ident('o nome de uma interação (ex.: flertar)').v)] = multiplier(q);
        else throw q.err(`dentro de "evento" vale chance, dura, global, onde, descrição, peso, ao começar:, todo mês:, ao acabar:; veio "${kid.toks[0]!.v}"`);
        q.end();
      }
      prog.events.push(ev);
      return;
    }
    case 'atributo': {
      // atributo "Sanidade":   (ou numa linha: atributo "Fé" 0 a 10)
      p.next();
      const name = str(p, 'o nome do atributo entre aspas');
      const at: RuleAttribute = { id: fold(name).trim(), name, min: 0, max: 100, mean: NaN, sd: NaN, inherit: 0, category: 'geral', perYear: 0, only: [], desc: '', src };
      const faixa = (q: P) => {
        if (q.isKey('de', 'entre')) q.next();
        at.min = signed(q);
        q.key('a', 'e', 'ate');
        at.max = signed(q);
      };
      if (!p.done() && !p.isOp(':')) faixa(p);
      if (p.isOp(':')) {
        p.endHeader();
        for (const kid of l.kids) {
          const q = new P(kid.toks, kid.src);
          const kk = kid.toks[0]!.key;
          q.next();
          if (kk === 'faixa' || kk === 'escala' || kk === 'vai') faixa(q);
          else if (kk === 'media' || kk === 'inicial' || kk === 'comeca') at.mean = signed(q);
          else if (kk === 'desvio' || kk === 'variacao' || kk === 'espalhamento') at.sd = signed(q);
          else if (kk === 'herdavel' || kk === 'heranca' || kk === 'hereditario') at.inherit = pct(q);
          else if (kk === 'categoria' || kk === 'tipo') at.category = fold(str(q, 'a categoria'));
          else if (kk === 'por' && q.isKey('ano')) {
            q.next();
            at.perYear = signed(q);
          } else if (kk === 'descricao') at.desc = str(q, 'a descrição entre aspas');
          else if (kk === 'so' || kk === 'apenas' || kk === 'somente') {
            // só para "Dragão", "Wyvern"
            if (q.isKey('para', 'de', 'em')) q.next();
            for (;;) {
              at.only.push(fold(str(q, 'a espécie entre aspas')).trim());
              if (!q.isOp(',')) break;
              q.next();
            }
          } else throw q.err(`dentro de "atributo" vale faixa, média, desvio, herdável, categoria, por ano, só para e descrição; veio "${kid.toks[0]!.v}"`);
          q.end();
        }
      } else p.end();
      if (at.max <= at.min) throw p.err('a faixa do atributo precisa ir de um número menor para um maior (ex.: faixa 0 a 100)');
      if (!Number.isFinite(at.mean)) at.mean = (at.min + at.max) / 2;
      if (!Number.isFinite(at.sd)) at.sd = (at.max - at.min) / 6;
      prog.attributes.push(at);
      return;
    }
    case 'especie':
    case 'raca':
    case 'criatura': {
      // espécie "Elfo" "Elfos":   /   criatura "Lobo" "Lobos":
      p.next();
      const name = str(p, 'o nome da espécie entre aspas');
      const plural = p.done() || p.isOp(':') ? `${name}s` : str(p, 'o plural entre aspas');
      const sp: RuleSpecies = {
        id: fold(name).trim(), name, plural, life: null, adult: null, fertility: null, gestation: null, height: null, mods: {}, traits: [], maybe: {}, crosses: [],
        creature: k === 'criatura', frequency: 0, desc: '', src,
      };
      if (p.isOp(':')) {
        p.endHeader();
        for (const kid of l.kids) {
          const q = new P(kid.toks, kid.src);
          const kk = kid.toks[0]!.key;
          if (kk === 'criatura' || kk === 'animal' || kk === 'fera' || kk === 'monstro') {
            q.next();
            sp.creature = true;
          } else if (kk === 'vida' || kk === 'longevidade' || kk === 'expectativa') {
            q.next();
            if (q.isKey('de')) q.next();
            if (q.isKey('vida')) q.next();
            sp.life = signed(q);
            if (q.isKey('anos', 'ano')) q.next();
          } else if (kk === 'maioridade' || kk === 'adulto' || kk === 'adulta') {
            q.next();
            if (q.isKey('aos', 'com')) q.next();
            sp.adult = signed(q);
            if (q.isKey('anos', 'ano')) q.next();
          } else if (kk === 'fertilidade') {
            q.next();
            sp.fertility = pct(q);
          } else if (kk === 'gestacao' || kk === 'gravidez') {
            q.next();
            sp.gestation = signed(q);
            if (q.isKey('mes', 'meses')) q.next();
          } else if (kk === 'altura' || kk === 'tamanho') {
            q.next();
            sp.height = signed(q);
            if (q.isKey('cm')) q.next();
          } else if (kk === 'traco' || kk === 'tracos') {
            q.next();
            for (;;) {
              sp.traits.push(fold(str(q, 'o traço entre aspas')).trim());
              if (!q.isOp(',')) break;
              q.next();
            }
          } else if (kk === 'pode' && q.peek(1)?.key === 'ter') {
            // pode ter "asas negras" 20%, "olhos de gato" 5%
            q.next();
            q.next();
            for (;;) {
              const t = fold(str(q, 'o traço entre aspas')).trim();
              sp.maybe[t] = q.peek()?.k === 'num' ? pct(q) : 0.25;
              if (!q.isOp(',')) break;
              q.next();
            }
          } else if (kk === 'cruza') {
            q.next();
            q.key('com');
            const w = fold(str(q, 'a espécie entre aspas')).trim();
            let gives: string | null = null;
            if (q.isKey('gera', 'da', 'nasce', 'vira')) {
              q.next();
              gives = str(q, 'a espécie dos filhos entre aspas');
            }
            sp.crosses.push({ with: w, gives });
          } else if (kk === 'frequencia' || kk === 'comum' || kk === 'proporcao') {
            q.next();
            sp.frequency = pct(q);
          } else if (kk === 'descricao') {
            q.next();
            sp.desc = str(q, 'a descrição entre aspas');
          } else {
            // ajuste: "força +10", "atributo sanidade -20", "beleza -5"
            if (kk === 'atributo' || kk === 'ajuste') q.next();
            const words: string[] = [];
            while (q.peek() && (q.peek()!.k === 'id' || q.peek()!.k === 'str')) words.push(fold(q.next().v).trim());
            if (!words.length || !q.peek()) throw q.err(`dentro de "espécie" vale vida, maioridade, fertilidade, gestação, altura, traço, cruza com, criatura, frequência, descrição ou um ajuste como "força +10"; veio "${kid.toks[0]!.v}"`);
            sp.mods[words.join(' ').replace(/_/g, ' ')] = signed(q);
          }
          q.end();
        }
      } else p.end();
      prog.species.push(sp);
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
  throw p.err(`não sei começar com "${l.toks[0]!.v}". Use tipo, grupo, calcular, ação, quando, interação, trama, traço, atributo, espécie, criatura, item, evento, profissão, gosto ou seja`);
}

/** "entre a em X, b em Y onde ..." ou "de p em X onde ..." */
function parties(p: P): { a: RuleParty; b: RuleParty | null; where: Expr | null } {
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
  return { a, b, where };
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
