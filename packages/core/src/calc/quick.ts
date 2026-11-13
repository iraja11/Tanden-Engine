import { CalcSheet, type CalcResult } from './sheet';

/*
 * Calculadora rápida: uma linha por vez, sem folha. Usa o mesmo motor das
 * folhas (vírgula decimal, unidades, derivada, integral, somatório...) e
 * guarda variáveis e o "ans" de uma conta para a outra.
 *
 * Modo grau: sen, cos e tg recebem graus e as inversas devolvem graus.
 * Linhas de cálculo (derivada, integral, limite, taylor) seguem em radianos,
 * porque a derivada de sen(x) em graus não é cos(x).
 */

export type AngleMode = 'rad' | 'deg';

export interface QuickEntry {
  expr: string;
  result: CalcResult;
}

const CALCULUS = /\b(derivada|deriv|derivar|derive|diff|derivative|integral|integrar|integrate|limite|lim|limit|taylor)\s*\(/;
const D = Math.PI / 180;

const direct = (f: (x: number) => number) => (x: unknown) => (typeof x === 'number' ? f(x * D) : NaN);
const inverse = (f: (x: number) => number) => (x: unknown) => (typeof x === 'number' ? f(x) / D : NaN);
const DEG_FNS: Record<string, (x: unknown) => number> = {
  sin: direct(Math.sin),
  cos: direct(Math.cos),
  tan: direct(Math.tan),
  sec: direct((x) => 1 / Math.cos(x)),
  csc: direct((x) => 1 / Math.sin(x)),
  cot: direct((x) => 1 / Math.tan(x)),
  asin: inverse(Math.asin),
  acos: inverse(Math.acos),
  atan: inverse(Math.atan),
};

/** Conta com unidade de ângulo (30 deg, 30°) não passa por aqui: o mathjs já converte. */
function withAngles(sheet: CalcSheet, mode: AngleMode, expr: string, fn: () => CalcResult): CalcResult {
  if (mode === 'rad' || CALCULUS.test(expr) || /°|º|\bdeg\b|\brad\b/.test(expr)) return fn();
  const saved = new Map<string, unknown>();
  for (const [k, f] of Object.entries(DEG_FNS)) {
    if (sheet.scope.has(k)) saved.set(k, sheet.scope.get(k));
    sheet.scope.set(k, f);
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(DEG_FNS)) {
      if (saved.has(k)) sheet.scope.set(k, saved.get(k));
      else sheet.scope.delete(k);
    }
  }
}

export class QuickCalc {
  sheet = new CalcSheet();
  history: QuickEntry[] = [];
  angle: AngleMode = 'rad';

  /** Avalia e guarda no histórico (variáveis e ans ficam valendo). */
  run(expr: string): CalcResult {
    const src = expr.trim();
    if (!src) return { kind: 'empty' };
    const result = withAngles(this.sheet, this.angle, src, () => this.sheet.run(src));
    if (result.kind !== 'empty') {
      this.history.push({ expr: src, result });
      if (this.history.length > 200) this.history.shift();
    }
    return result;
  }

  /** Resultado de uma conta sem mexer em nada (para mostrar enquanto digita). */
  preview(expr: string): CalcResult {
    const src = expr.trim();
    if (!src) return { kind: 'empty' };
    const tmp = new CalcSheet();
    tmp.scope = new Map(this.sheet.scope);
    tmp.defs = new Map(this.sheet.defs);
    return withAngles(tmp, this.angle, src, () => tmp.run(src));
  }

  /** Esquece variáveis, funções e histórico. */
  clear(): void {
    this.sheet = new CalcSheet();
    this.history = [];
  }
}
