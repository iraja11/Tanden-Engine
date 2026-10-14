import type { Rect } from './address';
import { FormulaError, parseFormula, type Node, type RefPart } from './formula';
import { FUNCTIONS, type Arg, type FnCtx } from './functions';
import {
  Abort, Matrix, compare, err, isErr, parseInput, scalar, toNum, toStr, type Result, type Scalar,
} from './values';

/*
 * Calculadora preguiçosa: só calcula a célula quando alguém pede o valor (a
 * grade pede só o que está na tela) e guarda o resultado até a próxima mudança.
 *
 * Cadeias longas (A2=A1+1, A3=A2+1, ... por milhares de linhas) estourariam a
 * pilha numa recursão ingênua. Quando a profundidade passa do limite, a célula
 * pedida é adiada: calculamos ela primeiro, a partir do topo, e repetimos.
 */

export interface SheetSource {
  /** id da aba pelo nome (sem diferenciar maiúsculas) */
  sheetId(name: string): string | null;
  raw(sheet: string, r: number, c: number): string | undefined;
  /** linhas e colunas usadas (para A:A não varrer um milhão de linhas) */
  bounds(sheet: string): { rows: number; cols: number };
}

const MAX_DEPTH = 300;

class Deferred {
  constructor(
    readonly sheet: string,
    readonly r: number,
    readonly c: number,
    /** células que estavam esperando por esta quando ela foi adiada */
    readonly waiting: string[] = [],
  ) {}
}

interface Ctx {
  sheet: string;
  row: number;
  col: number;
}

export class Calculator {
  private ast = new Map<string, Node | FormulaError>();
  private values = new Map<string, Scalar>();
  private computing = new Set<string>();
  private depth = 0;
  /** células que dependem da que está sendo calculada agora (adiadas no caminho) */
  private waiting = new Set<string>();
  now: () => Date = () => new Date();

  constructor(private src: SheetSource) {}

  /** Esquece tudo que foi calculado (algo mudou). As fórmulas interpretadas ficam. */
  invalidate(): void {
    this.values.clear();
  }

  /** Valor calculado de uma célula. */
  value(sheet: string, r: number, c: number): Scalar {
    const stack: Deferred[] = [new Deferred(sheet, r, c)];
    while (stack.length) {
      const t = stack[stack.length - 1]!;
      try {
        this.depth = 0;
        // quem espera por esta célula não pode ser pedido por ela: seria um ciclo
        this.waiting = new Set(stack.flatMap((s) => s.waiting));
        this.get(t.sheet, t.r, t.c);
        stack.pop();
      } catch (e) {
        if (!(e instanceof Deferred)) throw e;
        const k = key(e.sheet, e.r, e.c);
        if (stack.some((s) => key(s.sheet, s.r, s.c) === k)) {
          this.values.set(k, err('#CYCLE!', 'referência circular'));
        } else stack.push(e);
      }
    }
    this.waiting.clear();
    return this.values.get(key(sheet, r, c)) ?? null;
  }

  /** Fórmula interpretada (ou o erro de sintaxe), com cache por texto. */
  parse(formula: string): Node | FormulaError {
    let n = this.ast.get(formula);
    if (!n) {
      try {
        n = parseFormula(formula);
      } catch (e) {
        n = e instanceof FormulaError ? e : new FormulaError(String(e));
      }
      if (this.ast.size > 50_000) this.ast.clear();
      this.ast.set(formula, n);
    }
    return n;
  }

  /** Avalia uma fórmula solta como se estivesse numa célula (barra de status, gráficos). */
  evaluate(formula: string, at: Ctx): Scalar {
    const n = this.parse(formula);
    if (n instanceof FormulaError) return err('#NAME?', n.message);
    try {
      return scalar(this.eval(n, at));
    } catch (e) {
      if (e instanceof Abort) return e.e;
      throw e;
    }
  }

  private get(sheet: string, r: number, c: number): Scalar {
    const k = key(sheet, r, c);
    const hit = this.values.get(k);
    if (hit !== undefined) return hit;
    if (this.computing.has(k) || this.waiting.has(k)) return err('#CYCLE!', 'referência circular');
    if (this.depth > MAX_DEPTH) throw new Deferred(sheet, r, c, [...this.computing]);
    const raw = this.src.raw(sheet, r, c);
    let out: Scalar;
    if (raw === undefined || raw === '') out = null;
    else {
      const p = parseInput(raw);
      if (p.formula === undefined) out = p.value;
      else {
        this.computing.add(k);
        this.depth++;
        try {
          out = this.evaluateCell(p.formula, { sheet, row: r, col: c });
        } finally {
          this.computing.delete(k);
          this.depth--;
        }
      }
    }
    this.values.set(k, out);
    return out;
  }

  private evaluateCell(formula: string, ctx: Ctx): Scalar {
    const n = this.parse(formula);
    if (n instanceof FormulaError) return err('#NAME?', n.message);
    try {
      const v = scalar(this.eval(n, ctx));
      // célula que só aponta para uma vazia mostra 0, como no Excel
      if (v === null) return 0;
      if (typeof v === 'number' && !Number.isFinite(v)) return err('#NUM!');
      return v;
    } catch (e) {
      if (e instanceof Abort) return e.e;
      throw e;
    }
  }

  private sheetOf(name: string | undefined, ctx: Ctx): string {
    if (name === undefined) return ctx.sheet;
    const id = this.src.sheetId(name);
    if (!id) throw new Abort(err('#REF!', `aba "${name}" não existe`));
    return id;
  }

  rect(n: Node, ctx: Ctx): { sheet: string; rect: Rect } | null {
    if (n.t === 'ref') {
      const sheet = this.sheetOf(n.sheet, ctx);
      return { sheet, rect: { r0: n.a.row!, c0: n.a.col!, r1: n.a.row!, c1: n.a.col! } };
    }
    if (n.t === 'range') {
      const sheet = this.sheetOf(n.sheet, ctx);
      const b = this.src.bounds(sheet);
      const lo = (p: RefPart, q: RefPart, k: 'row' | 'col') => Math.min(p[k] ?? 0, q[k] ?? 0);
      const hi = (p: RefPart, q: RefPart, k: 'row' | 'col', max: number) =>
        p[k] === undefined || q[k] === undefined ? Math.max(0, max - 1) : Math.max(p[k]!, q[k]!);
      return {
        sheet,
        rect: { r0: lo(n.a, n.b, 'row'), c0: lo(n.a, n.b, 'col'), r1: hi(n.a, n.b, 'row', b.rows), c1: hi(n.a, n.b, 'col', b.cols) },
      };
    }
    if (n.t === 'paren') return this.rect(n.e, ctx);
    return null;
  }

  private eval(n: Node, ctx: Ctx): Result {
    switch (n.t) {
      case 'num':
      case 'str':
      case 'bool':
        return n.v;
      case 'err':
        return err(n.v);
      case 'paren':
        return this.eval(n.e, ctx);
      case 'name':
        return n.v === '' ? null : err('#NAME?', `nome desconhecido: ${n.v}`);
      case 'ref': {
        const sheet = this.sheetOf(n.sheet, ctx);
        return this.get(sheet, n.a.row!, n.a.col!);
      }
      case 'range': {
        const { sheet, rect } = this.rect(n, ctx)!;
        const rows: Scalar[][] = [];
        for (let r = rect.r0; r <= rect.r1; r++) {
          const row: Scalar[] = [];
          for (let c = rect.c0; c <= rect.c1; c++) row.push(this.get(sheet, r, c));
          rows.push(row);
        }
        return new Matrix(rows);
      }
      case 'un': {
        const x = scalar(this.eval(n.e, ctx));
        if (isErr(x)) return x;
        if (n.op === '%') return toNum(x) / 100;
        return n.op === '-' ? -toNum(x) : toNum(x);
      }
      case 'bin':
        return this.binary(n.op, scalar(this.eval(n.l, ctx)), scalar(this.eval(n.r, ctx)));
      case 'fn': {
        const def = FUNCTIONS.get(n.canon);
        if (!def) return err('#NAME?', `função desconhecida: ${n.name}`);
        if ((def.min !== undefined && n.args.length < def.min) || (def.max !== undefined && n.args.length > def.max))
          return err('#N/A', `${n.name} recebeu ${n.args.length} argumento(s)`);
        const args: Arg[] = n.args.map((node) => ({ node, get: () => this.eval(node, ctx) }));
        const fctx: FnCtx = {
          row: ctx.row,
          col: ctx.col,
          now: this.now,
          rectOf: (node) => this.rect(node, ctx)?.rect ?? null,
        };
        try {
          return def.fn(args, fctx);
        } catch (e) {
          if (e instanceof Abort) return e.e;
          throw e;
        }
      }
    }
  }

  private binary(op: string, a: Scalar, b: Scalar): Scalar {
    if (isErr(a)) return a;
    if (isErr(b)) return b;
    switch (op) {
      case '+':
        return toNum(a) + toNum(b);
      case '-':
        return toNum(a) - toNum(b);
      case '*':
        return toNum(a) * toNum(b);
      case '/': {
        const d = toNum(b);
        return d === 0 ? err('#DIV/0!') : toNum(a) / d;
      }
      case '^': {
        const r = toNum(a) ** toNum(b);
        return Number.isFinite(r) ? r : err('#NUM!');
      }
      case '&':
        return toStr(a) + toStr(b);
      case '=':
        return compare(a, b) === 0;
      case '<>':
        return compare(a, b) !== 0;
      case '<':
        return compare(a, b) < 0;
      case '>':
        return compare(a, b) > 0;
      case '<=':
        return compare(a, b) <= 0;
      case '>=':
        return compare(a, b) >= 0;
    }
    return err('#VALUE!');
  }
}

const key = (sheet: string, r: number, c: number) => `${sheet}\u0000${r}\u0000${c}`;
