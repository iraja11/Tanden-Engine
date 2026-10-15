import type { MathNode } from 'mathjs';
import { splitLabel, stripComment } from './lang';
import type { Fn } from './numeric';
import { translateError, type CalcSheet } from './sheet';
import { dependsOn, expandSymbolic, fnOf, fnOf2, toNumber, withCtx } from './symbolic';

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
 * Em 3D (basta uma linha 3D para o bloco inteiro virar 3D):
 *
 *   z = x^2 - y^2              superfície (ou só "sen(x) * cos(y)", ou "g(x; y)")
 *   (cos(t); sen(t); t/4)      curva paramétrica em t
 *   (cos(u)*sen(v); sen(u)*sen(v); cos(v))   superfície paramétrica em u e v
 *   pontos: (1; 2; 3) (0; 0; 1)
 *   z: -1..1   u: 0..2pi   v: 0..pi   malha: 60   3d: sim
 *
 * As funções e variáveis das linhas de cálculo acima do bloco valem aqui.
 */

export type Fn2 = (u: number, v: number) => number;
export type Range = [number, number];

export type PlotSeries =
  | { kind: 'fx'; label: string; f: Fn }
  | { kind: 'param'; label: string; fx: Fn; fy: Fn; t: [number, number] }
  | { kind: 'polar'; label: string; f: Fn; t: [number, number] }
  | { kind: 'points'; label: string; points: [number, number][] }
  | { kind: 'vline'; label: string; x: number }
  | { kind: 'surface'; label: string; f: Fn2 }
  | { kind: 'curve3'; label: string; fx: Fn; fy: Fn; fz: Fn; t: Range }
  | { kind: 'psurface'; label: string; fx: Fn2; fy: Fn2; fz: Fn2; u: Range; v: Range }
  | { kind: 'points3'; label: string; points: [number, number, number][] };

const KINDS_3D = new Set(['surface', 'curve3', 'psurface', 'points3']);
export const is3D = (s: PlotSeries): boolean => KINDS_3D.has(s.kind);

export interface PlotSpec {
  series: PlotSeries[];
  x?: [number, number];
  y?: [number, number];
  /** só em 3D */
  z?: [number, number];
  /** 3D: a primeira linha 3D (ou "3d: sim") vira o bloco inteiro */
  dim?: 2 | 3;
  /** 3D: pontos por lado da malha das superfícies */
  mesh?: number;
  title?: string;
  equal: boolean;
  grid: boolean;
  errors: { line: number; message: string }[];
}

const RANGE = /^(x|y|z|t|θ|u|v)\s*[:=]\s*(.+?)\s*(?:\.\.|…|\ba\b|\baté\b)\s*(.+)$/u;
/** (a; b) ou (a; b; c), com um nível de parênteses dentro */
const TUPLE_N = /\(((?:[^()]|\([^()]*(?:\([^()]*\)[^()]*)*\))*)\)/g;

/** Separa "a; b; c" nos ";" de fora dos parênteses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ';' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** O texto é exatamente uma tupla "(…; …)"? Volta as partes. */
function wholeTuple(body: string): string[] | null {
  const m = /^\((.*)\)$/.exec(body.trim());
  if (!m) return null;
  let depth = 0;
  for (const ch of m[1]!) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return null;
  }
  const parts = splitTop(m[1]!);
  return parts.length >= 2 && parts.length <= 3 && parts.every(Boolean) ? parts : null;
}

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
  let tRange: Range = [0, 2 * Math.PI];
  let uRange: Range | null = null;
  let vRange: Range | null = null;
  let force3d = false;
  const pending: { line: number; make: () => PlotSeries }[] = [];
  /** linha de cada série 2D, para avisar se o bloco virar 3D */
  const lineOf = new Map<PlotSeries, number>();
  const flat = (i: number) => lineOf.set(spec.series[spec.series.length - 1]!, i);

  const OPTION = /^(t[ií]tulo|title|propor[cç][aã]o|eixos|grade|grid|malha|mesh|3d)\s*:/i;
  const directives = (line: string): string[] => {
    // várias opções na mesma linha, separadas por dois espaços: "x: -3..3   y: -3..3"
    const chunks = line.split(/\s{2,}/);
    return chunks.length > 1 && chunks.every((c) => RANGE.test(c) || OPTION.test(c)) ? chunks : [line];
  };
  lines.forEach((rawLine, i) => {
    const whole = stripComment(rawLine).trim();
    if (!whole) return;
    for (const line of directives(whole)) handle(line, i);
  });

  function handle(line: string, i: number): void {
    try {
      const r = RANGE.exec(line);
      if (r) {
        const range: Range = [num(r[2]!), num(r[3]!)];
        if (!(range[0] < range[1])) throw new Error('O início do intervalo precisa ser menor que o fim');
        if (r[1] === 'x') spec.x = range;
        else if (r[1] === 'y') spec.y = range;
        else if (r[1] === 'z') spec.z = range;
        else if (r[1] === 'u') uRange = range;
        else if (r[1] === 'v') vRange = range;
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
      if (key === '3d') {
        force3d = !/^(nao|sem|off|false|0)$/.test(plain(body));
        return;
      }
      if (key === 'malha' || key === 'mesh' || key === 'resolucao') {
        spec.mesh = Math.round(Math.min(160, Math.max(8, num(body))));
        return;
      }
      const tuples = [...body.matchAll(TUPLE_N)].map((m) => splitTop(m[1]!));
      const isPoints = key === 'pontos' || key === 'points' || (/^\s*\(/.test(body) && tuples.length > 0 && !/[a-zA-Zθ]/.test(body.replace(/pi|e\b/g, '')));
      if (isPoints) {
        const ptLabel = label && key !== 'pontos' && key !== 'points' ? label : 'pontos';
        if (!tuples.length) throw new Error('Escreva os pontos como (1; 2) (3; 4) ou (1; 2; 3)');
        if (tuples.every((t) => t.length === 3)) {
          spec.series.push({ kind: 'points3', label: ptLabel, points: tuples.map((t) => [num(t[0]!), num(t[1]!), num(t[2]!)] as [number, number, number]) });
          return;
        }
        if (!tuples.every((t) => t.length === 2)) throw new Error('Os pontos precisam ter todos 2 ou todos 3 coordenadas');
        spec.series.push({ kind: 'points', label: ptLabel, points: tuples.map((t) => [num(t[0]!), num(t[1]!)] as [number, number]) });
        flat(i);
        return;
      }
      const parts = wholeTuple(body);
      if (parts) {
        if (parts.length === 3) {
          const nodes = parts.map((p) => prepare(sheet, p, ['t', 'u', 'v']));
          const surf = nodes.some((n) => dependsOn(n, 'u') || dependsOn(n, 'v'));
          if (surf) {
            nodes.forEach((n) => n.compile().evaluate(new Map([...scope, ['u', 0.5], ['v', 0.5]])));
            pending.push({
              line: i,
              make: () => {
                const [fx, fy, fz] = nodes.map((n) => fnOf2(n, scope, 'u', 'v')) as [Fn2, Fn2, Fn2];
                return { kind: 'psurface', label: label ?? body, fx, fy, fz, u: uRange ?? [0, 2 * Math.PI], v: vRange ?? [0, Math.PI] };
              },
            });
          } else {
            nodes.forEach((n) => n.compile().evaluate(new Map([...scope, ['t', 0.5]])));
            pending.push({
              line: i,
              make: () => {
                const [fx, fy, fz] = nodes.map((n) => fnOf(n, scope, 't')) as [Fn, Fn, Fn];
                return { kind: 'curve3', label: label ?? body, fx, fy, fz, t: tRange };
              },
            });
          }
          return;
        }
        const fx = prepare(sheet, parts[0]!, ['t']);
        const fy = prepare(sheet, parts[1]!, ['t']);
        pending.push({ line: i, make: () => ({ kind: 'param', label: label ?? body, fx: fnOf(fx, scope, 't'), fy: fnOf(fy, scope, 't'), t: tRange }) });
        return;
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
        flat(i);
        return;
      }
      const zEq = /^z\s*=\s*(.+)$/.exec(body);
      const yEq = /^y\s*=\s*/.test(body);
      const expr = body.replace(/^[yz]\s*=\s*/, '');
      const n = prepare(sheet, expr, ['x', 'y']);
      // sem "y =" na frente, uma expressão com x e y é uma superfície
      if (zEq || (!yEq && dependsOn(n, 'y') && !scope.has('y'))) {
        n.compile().evaluate(new Map([...scope, ['x', 0.5], ['y', 0.5]]));
        spec.series.push({ kind: 'surface', label: label ?? (zEq ? body : `z = ${body}`), f: fnOf2(n, scope, 'x', 'y') });
        return;
      }
      // testa num ponto para acusar nomes que não existem já na hora
      n.compile().evaluate(new Map([...scope, ['x', 0.5]]));
      spec.series.push({ kind: 'fx', label: label ?? body, f: fnOf(n, scope, 'x') });
      flat(i);
    } catch (e) {
      spec.errors.push({ line: i, message: translateError(e) });
    }
  }
  for (const p of pending) {
    try {
      spec.series.push(p.make());
      lineOf.set(spec.series[spec.series.length - 1]!, p.line);
    } catch (e) {
      spec.errors.push({ line: p.line, message: translateError(e) });
    }
  }
  spec.dim = force3d || spec.series.some(is3D) ? 3 : 2;
  if (spec.dim === 3) {
    const kept: PlotSeries[] = [];
    for (const s of spec.series) {
      if (is3D(s)) kept.push(s);
      // num gráfico 3D, y = f(x) vira a curva no chão (z = 0)
      else if (s.kind === 'fx') {
        const x = spec.x ?? [-5, 5];
        const f = s.f;
        kept.push({ kind: 'curve3', label: s.label, fx: (t) => t, fy: f, fz: () => 0, t: x });
      } else if (s.kind === 'param') kept.push({ kind: 'curve3', label: s.label, fx: s.fx, fy: s.fy, fz: () => 0, t: s.t });
      else if (s.kind === 'points') kept.push({ kind: 'points3', label: s.label, points: s.points.map(([x, y]) => [x, y, 0]) });
      else spec.errors.push({ line: lineOf.get(s) ?? 0, message: `"${s.label}" só existe em 2D; num gráfico 3D use z = …, (x; y; z) ou pontos (x; y; z)` });
    }
    spec.series = kept;
  }
  return spec;
}

/** Função de x a partir de um texto, com o escopo final da folha (gráfico da aba Cálculo). */
export function plotFn(sheet: CalcSheet, src: string): Fn {
  const n = prepare(sheet, src, ['x']);
  return fnOf(n, sheet.scope, 'x');
}

/** Função de duas variáveis (gráfico 3D da aba Cálculo). */
export function plotFn2(sheet: CalcSheet, src: string, a = 'x', b = 'y'): Fn2 {
  const n = prepare(sheet, src, [a, b]);
  return fnOf2(n, sheet.scope, a, b);
}

/**
 * Malha de uma superfície: (n+1)² vértices em [x, y, z] por linha, com NaN
 * onde a função não existe. Paramétrica: f devolve os três componentes.
 */
export function sampleSurface(f: (a: number, b: number) => [number, number, number], a: Range, b: Range, n: number): Float64Array {
  const out = new Float64Array((n + 1) * (n + 1) * 3);
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const v = b[0] + ((b[1] - b[0]) * j) / n;
    for (let i = 0; i <= n; i++) {
      const u = a[0] + ((a[1] - a[0]) * i) / n;
      const p = f(u, v);
      out[k++] = p[0];
      out[k++] = p[1];
      out[k++] = p[2];
    }
  }
  return out;
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
