/*
 * A "caneta" do desenho das espécies. Um corpo é feito de tubos: uma linha de
 * nós (x, y, raio) vira um contorno orgânico fechado, sem cantos. Os traços são
 * guardados em camadas, e o resultado é só dado: quem mostra é a interface.
 */

export type P = readonly [number, number];
/** nó de um tubo: x, y, raio */
export type N = readonly [number, number, number];

export type SpeciesPaint =
  | 'base' | 'longe' | 'detalhe' | 'ventre' | 'chifre' | 'osso' | 'escuro' | 'olho' | 'pupila' | 'luz' | 'membrana' | 'vidro' | 'folha';

export interface SpeciesShape {
  z: number;
  d: string;
  paint: SpeciesPaint;
  /** participa do contorno escuro da camada */
  contorno: boolean;
  /** recebe a textura do revestimento e o padrão */
  pele: boolean;
  /** traço aberto, com esta espessura */
  linha?: number;
  opacidade?: number;
  /** recortado pela pele da própria camada (ventre, sombras) */
  preso?: boolean;
}

export interface Xf {
  x?: number;
  y?: number;
  s?: number;
  rot?: number;
  flip?: boolean;
}

interface Opts {
  contorno?: boolean;
  pele?: boolean;
  opacidade?: number;
  preso?: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Curva de Catmull-Rom passando pelos nós, raio interpolado junto. */
function spline(nodes: readonly N[], steps: number): N[] {
  if (nodes.length < 3) {
    const [a, b] = [nodes[0]!, nodes[nodes.length - 1]!];
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as N;
    });
  }
  const out: N[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const p0 = nodes[Math.max(0, i - 1)]!;
    const p1 = nodes[i]!;
    const p2 = nodes[i + 1]!;
    const p3 = nodes[Math.min(nodes.length - 1, i + 2)]!;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const c = (k: 0 | 1 | 2) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t);
      out.push([c(0), c(1), Math.max(0.05, c(2))]);
    }
  }
  out.push(nodes[nodes.length - 1]!);
  return out;
}

/** Contorno fechado de um tubo. */
function tubeOutline(nodes: readonly N[], steps = 5): P[] {
  const c = spline(nodes, steps);
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)]!;
    const b = c[Math.min(c.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const [nx, ny] = [-dy / l, dx / l];
    const [x, y, r] = c[i]!;
    left.push([x + nx * r, y + ny * r]);
    right.push([x - nx * r, y - ny * r]);
  }
  const cap = (at: N, from: N, n = 4): P[] => {
    const ang = Math.atan2(at[1] - from[1], at[0] - from[0]);
    return Array.from({ length: n }, (_, i) => {
      const a = ang + Math.PI / 2 - (Math.PI * (i + 1)) / (n + 1);
      return [at[0] + Math.cos(a) * at[2], at[1] + Math.sin(a) * at[2]] as P;
    });
  };
  const end = cap(c[c.length - 1]!, c[c.length - 2]!);
  const start = cap(c[0]!, c[1]!);
  return [...left, ...end, ...right.reverse(), ...start];
}

/** Caminho suave e fechado que passa perto dos pontos. */
function smoothClosed(pts: readonly P[]): string {
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = pts.length;
  const m0 = mid(pts[n - 1]!, pts[0]!);
  let d = `M${r1(m0[0])} ${r1(m0[1])}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % n]!);
    d += `Q${r1(p[0])} ${r1(p[1])} ${r1(m[0])} ${r1(m[1])}`;
  }
  return `${d}Z`;
}

function smoothOpen(pts: readonly P[]): string {
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${r1(pts[0]![0])} ${r1(pts[0]![1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = mid(pts[i]!, pts[i + 1]!);
    d += `Q${r1(pts[i]![0])} ${r1(pts[i]![1])} ${r1(m[0])} ${r1(m[1])}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${r1(last[0])} ${r1(last[1])}`;
}

export class Pen {
  shapes: SpeciesShape[] = [];
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  private xf = { x: 0, y: 0, s: 1, rot: 0, flip: false };
  private far = false;

  private w(p: P): P {
    const { x, y, s, rot, flip } = this.xf;
    const px = (flip ? -p[0] : p[0]) * s;
    const py = p[1] * s;
    const [c, n] = [Math.cos(rot), Math.sin(rot)];
    return [x + px * c - py * n, y + px * n + py * c];
  }

  private track(pts: readonly P[], margin = 0) {
    for (const p of pts) {
      this.x0 = Math.min(this.x0, p[0] - margin);
      this.y0 = Math.min(this.y0, p[1] - margin);
      this.x1 = Math.max(this.x1, p[0] + margin);
      this.y1 = Math.max(this.y1, p[1] + margin);
    }
  }

  /** Desenha com origem, escala, giro e espelho próprios. */
  at(t: Xf, fn: () => void) {
    const old = this.xf;
    const [px, py] = this.w([t.x ?? 0, t.y ?? 0]);
    const rot = (old.flip ? -(t.rot ?? 0) : (t.rot ?? 0)) + old.rot;
    this.xf = { x: px, y: py, s: old.s * (t.s ?? 1), rot, flip: old.flip !== !!t.flip };
    fn();
    this.xf = old;
  }

  /** Tudo aqui dentro fica do lado de lá do corpo, mais escuro. */
  longe(fn: () => void) {
    const old = this.far;
    this.far = true;
    fn();
    this.far = old;
  }

  private paint(p: SpeciesPaint): SpeciesPaint {
    return this.far && (p === 'base' || p === 'detalhe' || p === 'ventre' || p === 'membrana' || p === 'chifre') ? 'longe' : p;
  }

  private add(z: number, d: string, paint: SpeciesPaint, o: Opts, linha?: number) {
    const painted = this.paint(paint);
    this.shapes.push({
      z, d, paint: painted, contorno: o.contorno ?? linha === undefined, pele: (o.pele ?? paint === 'base') && painted === 'base',
      ...(linha !== undefined ? { linha: r1(linha * this.xf.s * 10) / 10 } : {}),
      ...(o.opacidade !== undefined ? { opacidade: o.opacidade } : {}),
      ...(o.preso ? { preso: true } : {}),
    });
  }

  tube(z: number, nodes: readonly N[], paint: SpeciesPaint = 'base', o: Opts = {}) {
    const pts = tubeOutline(nodes).map((p) => this.w(p));
    this.track(pts);
    this.add(z, smoothClosed(pts), paint, o);
  }

  blob(z: number, pts: readonly P[], paint: SpeciesPaint = 'base', o: Opts = {}) {
    const world = pts.map((p) => this.w(p));
    this.track(world);
    this.add(z, smoothClosed(world), paint, o);
  }

  poly(z: number, pts: readonly P[], paint: SpeciesPaint = 'base', o: Opts = {}) {
    const world = pts.map((p) => this.w(p));
    this.track(world);
    this.add(z, `M${world.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L')}Z`, paint, o);
  }

  line(z: number, pts: readonly P[], paint: SpeciesPaint, width: number, o: Opts = {}) {
    const world = pts.map((p) => this.w(p));
    this.track(world, (width * this.xf.s) / 2);
    this.add(z, smoothOpen(world), paint, o, width);
  }

  circle(z: number, x: number, y: number, r: number, paint: SpeciesPaint = 'base', o: Opts = {}) {
    this.ellipse(z, x, y, r, r, paint, o);
  }

  ellipse(z: number, x: number, y: number, rx: number, ry: number, paint: SpeciesPaint = 'base', o: Opts = {}) {
    const pts: P[] = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      // o caminho suave encolhe um pouco o polígono; compensa aqui
      return [x + Math.cos(a) * rx * 1.05, y + Math.sin(a) * ry * 1.05] as P;
    });
    this.blob(z, pts, paint, o);
  }
}
