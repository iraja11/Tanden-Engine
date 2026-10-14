import type { MathNode } from 'mathjs';
import { splitLabel, stripComment } from './lang';
import type { Fn } from './numeric';
import { translateError, type CalcSheet } from './sheet';
import { expandSymbolic, fnOf, toNumber, withCtx } from './symbolic';

/*
 * Bloco ```grafico: uma curva por linha.
 *
 *   y = x^2 - 1          função de x (ou só "x^2 - 1", ou "f(x)")
 *   Velocidade: v(x)     com nome na legenda
 *   (cos(t); sin(t))     paramétrica em t
 *   r = 1 + cos(θ)       polar (θ ou t)
 *   x = 2                reta vertical
 *   pontos: (1; 2) (3; 4)
 *   x: -5..5   y: -2 a 2   t: 0..2pi
 *   título: Meu gráfico   proporção: igual   grade: não
 *
 * As funções e variáveis das linhas de cálculo acima do bloco valem aqui.
 */

export type PlotSeries =
  | { kind: 'fx'; label: string; f: Fn }
  | { kind: 'param'; label: string; fx: Fn; fy: Fn; t: [number, number] }
  | { kind: 'polar'; label: string; f: Fn; t: [number, number] }
  | { kind: 'points'; label: string; points: [number, number][] }
  | { kind: 'vline'; label: string; x: number };

export interface PlotSpec {
  series: PlotSeries[];
  x?: [number, number];
  y?: [number, number];
  title?: string;
  equal: boolean;
  grid: boolean;
  errors: { line: number; message: string }[];
}

const RANGE = /^(x|y|t|θ)\s*[:=]\s*(.+?)\s*(?:\.\.|…|\ba\b|\baté\b)\s*(.+)$/u;
const TUPLE = /\(([^()]*(?:\([^()]*\)[^()]*)*);([^()]*(?:\([^()]*\)[^()]*)*)\)/g;

function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Parse e expansão simbólica com o escopo da folha naquele ponto. */
function prepare(sheet: CalcSheet, src: string, keep: string[]): MathNode {
  return withCtx(sheet, () => expandSymbolic(sheet.parse(src), sheet, new Set(keep)).node);
}

export function parsePlot(lines: string[], sheet: CalcSheet): PlotSpec {
  const spec: PlotSpec = { series: [], equal: false, grid: true, errors: [] };
  // cópia: o que vier depois do bloco não muda o gráfico
  const scope = new Map(sheet.scope);
  const num = (src: string) => {
    const v = toNumber(sheet.parse(src).compile().evaluate(scope));
    if (!Number.isFinite(v)) throw new Error(`"${src}" não é um número`);
    return v;
  };
  let tRange: [number, number] = [0, 2 * Math.PI];
  const pending: { line: number; make: () => PlotSeries }[] = [];

  lines.forEach((rawLine, i) => {
    const line = stripComment(rawLine).trim();
    if (!line) return;
    try {
      const r = RANGE.exec(line);
      if (r) {
        const range: [number, number] = [num(r[2]!), num(r[3]!)];
        if (!(range[0] < range[1])) throw new Error('O início do intervalo precisa ser menor que o fim');
        if (r[1] === 'x') spec.x = range;
        else if (r[1] === 'y') spec.y = range;
        else tRange = range;
        return;
      }
      const { label, body } = splitLabel(line);
      const key = label ? plain(label) : '';
      if (key === 'titulo' || key === 'title') {
        spec.title = body;
        return;
      }
      if (key === 'proporcao' || key === 'eixos') {
        spec.equal = /igua|1:1|equal/i.test(plain(body));
        return;
      }
      if (key === 'grade' || key === 'grid') {
        spec.grid = !/^(nao|sem|off|false|0)$/.test(plain(body));
        return;
      }
      if (key === 'pontos' || key === 'points' || /^\s*\(/.test(body) && [...body.matchAll(TUPLE)].length && !/[a-zA-Zθ]/.test(body.replace(/pi|e\b/g, ''))) {
        const pts = [...body.matchAll(TUPLE)].map((m) => [num(m[1]!), num(m[2]!)] as [number, number]);
        if (!pts.length) throw new Error('Escreva os pontos como (1; 2) (3; 4)');
        spec.series.push({ kind: 'points', label: label && key !== 'pontos' && key !== 'points' ? label : 'pontos', points: pts });
        return;
      }
      const tup = /^\((.*)\)$/.exec(body);
      if (tup) {
        const parts = [...body.matchAll(TUPLE)];
        if (parts.length === 1 && parts[0]![0] === body) {
          const fx = prepare(sheet, parts[0]![1]!, ['t']);
          const fy = prepare(sheet, parts[0]![2]!, ['t']);
          pending.push({ line: i, make: () => ({ kind: 'param', label: label ?? body, fx: fnOf(fx, scope, 't'), fy: fnOf(fy, scope, 't'), t: tRange }) });
          return;
        }
      }
      const polar = /^r\s*=\s*(.+)$/.exec(body);
      if (polar) {
        const n = prepare(sheet, polar[1]!.replace(/θ/g, 't'), ['t']);
        pending.push({ line: i, make: () => ({ kind: 'polar', label: label ?? body, f: fnOf(n, scope, 't'), t: tRange }) });
        return;
      }
      const vline = /^x\s*=\s*(.+)$/.exec(body);
      if (vline) {
        spec.series.push({ kind: 'vline', label: label ?? body, x: num(vline[1]!) });
        return;
      }
      const expr = body.replace(/^y\s*=\s*/, '');
      const n = prepare(sheet, expr, ['x']);
      // testa num ponto para acusar nomes que não existem já na hora
      n.compile().evaluate(new Map([...scope, ['x', 0.5]]));
      spec.series.push({ kind: 'fx', label: label ?? body, f: fnOf(n, scope, 'x') });
    } catch (e) {
      spec.errors.push({ line: i, message: translateError(e) });
    }
  });
  for (const p of pending) {
    try {
      spec.series.push(p.make());
    } catch (e) {
      spec.errors.push({ line: p.line, message: translateError(e) });
    }
  }
  return spec;
}

/** Função de x a partir de um texto, com o escopo final da folha (gráfico da aba Cálculo). */
export function plotFn(sheet: CalcSheet, src: string): Fn {
  const n = prepare(sheet, src, ['x']);
  return fnOf(n, sheet.scope, 'x');
}

/**
 * Amostra y = f(x) em [x0, x1] com n pontos, cortando a linha em assíntotas
 * e onde a função não existe. Volta trechos de [x, y].
 */
export function sampleFx(f: Fn, x0: number, x1: number, n: number, ySpan: number): [number, number][][] {
  const out: [number, number][][] = [];
  let seg: [number, number][] = [];
  let prev: [number, number] | null = null;
  const dx = (x1 - x0) / n;
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * dx;
    const y = f(x);
    if (!Number.isFinite(y)) {
      if (seg.length > 1) out.push(seg);
      seg = [];
      prev = null;
      continue;
    }
    if (prev && Math.abs(y - prev[1]) > ySpan * 0.5) {
      // salto grande: confere no meio se é contínua (curva íngreme) ou assíntota
      const ym = f((x + prev[0]) / 2);
      const lo = Math.min(y, prev[1]);
      const hi = Math.max(y, prev[1]);
      if (!(Number.isFinite(ym) && ym >= lo && ym <= hi)) {
        if (seg.length > 1) out.push(seg);
        seg = [];
      }
    }
    seg.push([x, y]);
    prev = [x, y];
  }
  if (seg.length > 1) out.push(seg);
  return out;
}

/** Amostra uma curva paramétrica (ou polar já convertida). */
export function sampleParam(fx: Fn, fy: Fn, t0: number, t1: number, n: number): [number, number][][] {
  const out: [number, number][][] = [];
  let seg: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const x = fx(t);
    const y = fy(t);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (seg.length > 1) out.push(seg);
      seg = [];
      continue;
    }
    seg.push([x, y]);
  }
  if (seg.length > 1) out.push(seg);
  return out;
}
