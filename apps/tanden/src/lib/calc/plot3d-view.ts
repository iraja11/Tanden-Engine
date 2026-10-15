import type { PlotSeries, PlotSpec } from '@tanden/core/src/calc';
import { sampleSurface } from '@tanden/core/src/calc/plot';
import type { PlotOptions } from './plot-view';
import './plot.css';

/*
 * Gráfico 3D em canvas, sem biblioteca (roda igual no PC e no Android).
 * Superfícies são malhas desenhadas de trás para frente (algoritmo do
 * pintor), com cor pela altura e luz que acompanha a câmera. Arrastar gira
 * (com inércia), a roda ou a pinça aproxima, Shift+arrastar ou dois dedos
 * movem, dois cliques voltam à vista inicial. Passar o mouse mostra o ponto
 * da superfície mais perto do cursor.
 */

type V3 = [number, number, number];
type Range = [number, number];

const PALETTE = ['--ember', '#5aa9ff', '#7fd1a8', '#c792ff', '#ffd166', '#ff6b8b', '#4dd0e1'];
/** mapa de cores da altura (frio embaixo, quente em cima) */
const HEIGHT_STOPS: V3[] = [
  [59, 76, 192],
  [62, 140, 220],
  [72, 194, 180],
  [154, 214, 110],
  [255, 209, 102],
  [255, 138, 61],
];
const SHADES = 24;
const LEVELS = 32;

interface Mesh {
  series: number;
  n: number;
  /** vértices no espaço dos dados */
  pts: Float64Array;
  /** vértices normalizados no cubo da vista */
  unit: Float32Array;
  /** normal de cada quadrado (unitária) */
  normals: Float32Array;
  /** altura normalizada (0..1) de cada quadrado, ou -1 se ficou fora */
  level: Float32Array;
  /** tabela de cores [nível * SHADES + luz] */
  colors: string[];
}

interface Line3 {
  series: number;
  unit: Float32Array;
  pts: Float64Array;
}

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function parseColor(c: string): V3 {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (m) {
    const n = parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const r = /rgba?\(([^)]+)\)/.exec(c);
  if (r) {
    const [a, b, d] = r[1]!.split(',').map((x) => parseFloat(x));
    return [a ?? 255, b ?? 138, d ?? 61];
  }
  return [255, 138, 61];
}

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function tickLabel(v: number, step: number): string {
  if (Math.abs(v) < step * 1e-6) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-4) return v.toExponential(1).replace('.', ',').replace('e+', 'e');
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(dec).replace('.', ',').replace('-', '−');
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-4)) return v.toExponential(3).replace('.', ',').replace('e+', 'e');
  return Number(v.toPrecision(4)).toString().replace('.', ',').replace('-', '−');
}

function mix(a: V3, b: V3, t: number): V3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function heightColor(t: number): V3 {
  const x = Math.min(0.9999, Math.max(0, t)) * (HEIGHT_STOPS.length - 1);
  const i = Math.floor(x);
  return mix(HEIGHT_STOPS[i]!, HEIGHT_STOPS[i + 1]!, x - i);
}

/** percentil de uma lista (para o enquadramento ignorar picos) */
function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]!;
}

const HOME = { yaw: -0.75, pitch: 0.5, zoom: 1, panX: 0, panY: 0 };

export class Plot3DView {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLDivElement;
  private legend: HTMLDivElement;
  private errors: HTMLDivElement;
  private title: HTMLDivElement;
  private spinBtn: HTMLButtonElement;
  private wireBtn: HTMLButtonElement;
  private spec: PlotSpec | null = null;
  private box: { x: Range; y: Range; z: Range } = { x: [-5, 5], y: [-5, 5], z: [-5, 5] };
  /** meia-largura de cada eixo no cubo da vista (proporção) */
  private half: V3 = [1, 1, 0.8];
  private meshes: Mesh[] = [];
  private lines: Line3[] = [];
  private dots: { series: number; unit: V3; pt: V3 }[] = [];
  private cam = { ...HOME };
  private hidden = new Set<number>();
  private hover: { x: number; y: number } | null = null;
  private spin = false;
  private wire = true;
  private vel = { yaw: 0, pitch: 0 };
  private frame = 0;
  private animating = 0;
  private ro: ResizeObserver;
  private mo: MutationObserver;
  private pointers = new Map<number, { x: number; y: number }>();
  private colorCache: { base: V3[]; ink: string; muted: string; line: string; mono: string; surface: string } | null = null;

  constructor(private opts: PlotOptions = {}) {
    this.el = document.createElement('div');
    this.el.className = 'tplot tplot-3d';
    this.el.innerHTML = `<div class="tplot-title"></div><div class="tplot-box"><canvas></canvas><div class="tplot-legend"></div>
      <div class="tplot-tools"><button data-z="spin" title="Girar sozinho">⟳</button><button data-z="wire" title="Mostrar ou esconder a malha">▦</button><button data-z="top" title="Ver de cima">⊤</button>
      <button data-z="in" title="Aproximar">+</button><button data-z="out" title="Afastar">−</button><button data-z="home" title="Voltar ao início (dois cliques)">⟲</button></div>
      <div class="tplot-tip"></div></div><div class="tplot-errors"></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.canvas.title = 'Arraste para girar · Shift+arrastar move · roda (ou Ctrl+roda na nota) aproxima';
    this.tip = this.el.querySelector('.tplot-tip')!;
    this.legend = this.el.querySelector('.tplot-legend')!;
    this.errors = this.el.querySelector('.tplot-errors')!;
    this.title = this.el.querySelector('.tplot-title')!;
    this.spinBtn = this.el.querySelector('[data-z="spin"]')!;
    this.wireBtn = this.el.querySelector('[data-z="wire"]')!;
    this.wireBtn.classList.add('on');
    const box = this.el.querySelector<HTMLDivElement>('.tplot-box')!;
    if (opts.height) {
      box.style.height = `${opts.height}px`;
      box.style.flex = 'none';
    }
    this.el.querySelectorAll<HTMLButtonElement>('.tplot-tools button').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const z = b.dataset.z;
        if (z === 'home') this.reset();
        else if (z === 'spin') this.toggleSpin();
        else if (z === 'wire') {
          this.wire = !this.wire;
          b.classList.toggle('on', this.wire);
          this.draw();
        } else if (z === 'top') this.animateTo({ yaw: 0, pitch: Math.PI / 2 - 0.001 });
        else this.zoomBy(z === 'in' ? 1 / 0.75 : 0.75);
      }),
    );
    for (const t of ['mousedown', 'pointerdown', 'click', 'dblclick'] as const) this.el.addEventListener(t, (e) => e.stopPropagation());
    this.bind();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(box);
    this.mo = new MutationObserver(() => {
      this.colorCache = null;
      this.recolor();
      this.draw();
    });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  }

  destroy(): void {
    this.ro.disconnect();
    this.mo.disconnect();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.animating);
  }

  setSpec(spec: PlotSpec): void {
    this.spec = spec;
    this.title.textContent = spec.title ?? '';
    this.title.style.display = spec.title ? '' : 'none';
    this.errors.innerHTML = '';
    for (const e of spec.errors) {
      const d = document.createElement('div');
      d.textContent = `linha ${e.line + 1}: ${e.message}`;
      this.errors.appendChild(d);
    }
    this.build();
    this.renderLegend();
    this.draw();
  }

  reset(): void {
    this.spin = false;
    this.spinBtn.classList.remove('on');
    this.vel = { yaw: 0, pitch: 0 };
    this.animateTo({ ...HOME });
  }

  /* ------------------------------------------------------------ dados */

  private colors() {
    if (this.colorCache) return this.colorCache;
    const base = PALETTE.map((c) => parseColor(c.startsWith('--') ? cssVar(this.el, c, '#ff8a3d') : c));
    this.colorCache = {
      base,
      ink: cssVar(this.el, '--ink', '#ecebf0'),
      muted: cssVar(this.el, '--muted', '#8c8a96'),
      line: cssVar(this.el, '--line', '#2b2a31'),
      mono: cssVar(this.el, '--f-mono', 'monospace'),
      surface: cssVar(this.el, '--surface', '#16151a'),
    };
    return this.colorCache;
  }

  private color(i: number): string {
    const [r, g, b] = this.colors().base[i % PALETTE.length]!;
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  /** Amostra tudo uma vez por mudança do bloco; girar só reprojeta. */
  private build(): void {
    const spec = this.spec!;
    const series = spec.series;
    const n = spec.mesh ?? 44;
    const xr: Range = spec.x ?? [-5, 5];
    const yr: Range = spec.y ?? xr;
    const raw: { series: number; pts: Float64Array; n: number }[] = [];
    const curves: { series: number; pts: Float64Array }[] = [];
    const dots: { series: number; pt: V3 }[] = [];
    series.forEach((s, i) => {
      if (s.kind === 'surface') raw.push({ series: i, n, pts: sampleSurface((x, y) => [x, y, s.f(x, y)], xr, yr, n) });
      else if (s.kind === 'psurface') raw.push({ series: i, n, pts: sampleSurface((u, v) => [s.fx(u, v), s.fy(u, v), s.fz(u, v)], s.u, s.v, n) });
      else if (s.kind === 'curve3') {
        const m = 600;
        const pts = new Float64Array((m + 1) * 3);
        for (let k = 0; k <= m; k++) {
          const t = s.t[0] + ((s.t[1] - s.t[0]) * k) / m;
          pts[k * 3] = s.fx(t);
          pts[k * 3 + 1] = s.fy(t);
          pts[k * 3 + 2] = s.fz(t);
        }
        curves.push({ series: i, pts });
      } else if (s.kind === 'points3') for (const p of s.points) dots.push({ series: i, pt: p });
    });

    // enquadramento: o pedido no bloco ou o que mostra bem tudo
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const take = (a: Float64Array) => {
      for (let k = 0; k < a.length; k += 3) {
        if (!Number.isFinite(a[k]!) || !Number.isFinite(a[k + 1]!) || !Number.isFinite(a[k + 2]!)) continue;
        xs.push(a[k]!);
        ys.push(a[k + 1]!);
        zs.push(a[k + 2]!);
      }
    };
    raw.forEach((r) => take(r.pts));
    curves.forEach((c) => take(c.pts));
    dots.forEach((d) => (xs.push(d.pt[0]), ys.push(d.pt[1]), zs.push(d.pt[2])));
    const span = (vals: number[], lo: number, hi: number, fallback: Range): Range => {
      if (!vals.length) return fallback;
      const s = [...vals].sort((a, b) => a - b);
      let a = pct(s, lo);
      let b = pct(s, hi);
      // só corta as pontas quando são picos de verdade (assíntotas)
      if (s[s.length - 1]! - s[0]! <= (b - a) * 3) {
        a = s[0]!;
        b = s[s.length - 1]!;
      }
      if (b - a < 1e-9) {
        const d = Math.max(1, Math.abs(a) * 0.5);
        a -= d;
        b += d;
      }
      const pad = (b - a) * 0.04;
      return [a - pad, b + pad];
    };
    const onlySurfaces = raw.length > 0 && raw.every((r) => series[r.series]!.kind === 'surface');
    const x: Range = spec.x ?? (onlySurfaces ? xr : span(xs, 0, 1, xr));
    const y: Range = spec.y ?? (onlySurfaces ? yr : span(ys, 0, 1, yr));
    // em z, ignora picos (assíntotas): usa do 2º ao 98º percentil
    const z: Range = spec.z ?? span(zs, 0.02, 0.98, [-1, 1]);
    this.box = { x, y, z };
    if (spec.equal) {
      const m = Math.max(x[1] - x[0], y[1] - y[0], z[1] - z[0]);
      this.half = [(x[1] - x[0]) / m, (y[1] - y[0]) / m, (z[1] - z[0]) / m];
    } else {
      // x e y na mesma escala quando parecidos; z com altura agradável
      const rx = x[1] - x[0];
      const ry = y[1] - y[0];
      const m = Math.max(rx, ry);
      this.half = [Math.max(0.35, rx / m), Math.max(0.35, ry / m), 0.75];
    }

    const unitOf = (a: Float64Array) => {
      const u = new Float32Array(a.length);
      for (let k = 0; k < a.length; k += 3) {
        u[k] = (((a[k]! - x[0]) / (x[1] - x[0])) * 2 - 1) * this.half[0];
        u[k + 1] = (((a[k + 1]! - y[0]) / (y[1] - y[0])) * 2 - 1) * this.half[1];
        u[k + 2] = (((a[k + 2]! - z[0]) / (z[1] - z[0])) * 2 - 1) * this.half[2];
      }
      return u;
    };
    this.meshes = raw.map((r) => {
      const unit = unitOf(r.pts);
      const q = r.n * r.n;
      const normals = new Float32Array(q * 3);
      const level = new Float32Array(q);
      const N = r.n + 1;
      for (let j = 0; j < r.n; j++) {
        for (let i = 0; i < r.n; i++) {
          const a = (j * N + i) * 3;
          const b = (j * N + i + 1) * 3;
          const c = ((j + 1) * N + i + 1) * 3;
          const d = ((j + 1) * N + i) * 3;
          const k = j * r.n + i;
          let ok = true;
          let zsum = 0;
          for (const v of [a, b, c, d]) {
            const zv = r.pts[v + 2]!;
            if (!Number.isFinite(zv) || !Number.isFinite(r.pts[v]!) || !Number.isFinite(r.pts[v + 1]!) || zv < z[0] - 1e-9 || zv > z[1] + 1e-9) ok = false;
            zsum += zv;
          }
          if (!ok) {
            level[k] = -1;
            continue;
          }
          level[k] = (zsum / 4 - z[0]) / (z[1] - z[0]);
          // normal pelas diagonais
          const e1 = [unit[c]! - unit[a]!, unit[c + 1]! - unit[a + 1]!, unit[c + 2]! - unit[a + 2]!];
          const e2 = [unit[d]! - unit[b]!, unit[d + 1]! - unit[b + 1]!, unit[d + 2]! - unit[b + 2]!];
          let nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
          let ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
          let nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
          const len = Math.hypot(nx, ny, nz) || 1;
          nx /= len;
          ny /= len;
          nz /= len;
          normals[k * 3] = nx;
          normals[k * 3 + 1] = ny;
          normals[k * 3 + 2] = nz;
        }
      }
      return { series: r.series, n: r.n, pts: r.pts, unit, normals, level, colors: [] };
    });
    this.lines = curves.map((c) => ({ series: c.series, pts: c.pts, unit: unitOf(c.pts) }));
    this.dots = dots.map((d) => {
      const u = unitOf(new Float64Array(d.pt));
      return { series: d.series, pt: d.pt, unit: [u[0]!, u[1]!, u[2]!] as V3 };
    });
    this.recolor();
  }

  /** Tabelas de cor: a primeira superfície usa o mapa de altura; as outras, a cor da série. */
  private recolor(): void {
    const surfaces = this.meshes.length;
    this.meshes.forEach((m, idx) => {
      const base = this.colors().base[m.series % PALETTE.length]!;
      const table: string[] = [];
      for (let l = 0; l < LEVELS; l++) {
        const t = l / (LEVELS - 1);
        const c = idx === 0 || surfaces === 1 ? heightColor(t) : mix(mix(base, [0, 0, 0], 0.35), mix(base, [255, 255, 255], 0.3), t);
        for (let s = 0; s < SHADES; s++) {
          const k = 0.38 + 0.62 * (s / (SHADES - 1));
          table.push(`rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`);
        }
      }
      m.colors = table;
    });
  }

  private renderLegend(): void {
    const s = this.spec?.series ?? [];
    this.legend.innerHTML = '';
    if (s.length < 2 && !(s[0] && s[0].label && !/^z\s*=|^\(/.test(s[0].label))) return;
    s.forEach((series: PlotSeries, i) => {
      const b = document.createElement('button');
      b.className = 'tplot-key';
      b.classList.toggle('off', this.hidden.has(i));
      b.innerHTML = `<i></i><span></span>`;
      const first = this.meshes[0]?.series === i;
      b.querySelector('i')!.style.background = first
        ? `linear-gradient(90deg, ${HEIGHT_STOPS.map((c) => `rgb(${c.join(',')})`).join(',')})`
        : this.color(i);
      b.querySelector('span')!.textContent = series.label;
      b.title = 'Mostrar ou esconder';
      b.addEventListener('click', () => {
        if (this.hidden.has(i)) this.hidden.delete(i);
        else this.hidden.add(i);
        b.classList.toggle('off', this.hidden.has(i));
        this.draw();
      });
      this.legend.appendChild(b);
    });
  }

  /* ------------------------------------------------------------ câmera */

  private size() {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  /** Projeção: gira em z (yaw), inclina (pitch), perspectiva leve. Volta [sx, sy, profundidade]. */
  private projector(w: number, h: number) {
    const { yaw, pitch, zoom, panX, panY } = this.cam;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const scale = Math.min(w / 3.3, h / 3.4) * zoom;
    const dist = 5.5;
    const ox = w / 2 + panX;
    const oy = h / 2 + panY;
    return (x: number, y: number, z: number, out: Float32Array, o: number) => {
      const rx = x * cy - y * sy;
      const ry = x * sy + y * cy;
      // câmera olhando de -y girado, inclinada pelo pitch
      const depth = ry * cp - z * sp; // maior = mais longe do observador
      const up = ry * sp + z * cp;
      const f = dist / (dist + depth);
      out[o] = ox + rx * scale * f;
      out[o + 1] = oy - up * scale * f;
      out[o + 2] = depth;
    };
  }

  draw(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.paint());
  }

  private toggleSpin(): void {
    this.spin = !this.spin;
    this.spinBtn.classList.toggle('on', this.spin);
    if (this.spin) this.tick();
  }

  /** inércia e giro automático */
  private tick(): void {
    cancelAnimationFrame(this.animating);
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(50, now - last) / 16.7;
      last = now;
      if (!this.el.isConnected) return;
      let moving = false;
      if (this.spin) {
        this.cam.yaw += 0.006 * dt;
        moving = true;
      }
      if (Math.abs(this.vel.yaw) > 0.0004 || Math.abs(this.vel.pitch) > 0.0004) {
        this.rotate(this.vel.yaw * dt, this.vel.pitch * dt);
        const k = Math.pow(0.92, dt);
        this.vel.yaw *= k;
        this.vel.pitch *= k;
        moving = true;
      }
      this.paint();
      if (moving && !this.pointers.size) this.animating = requestAnimationFrame(step);
    };
    this.animating = requestAnimationFrame(step);
  }

  private animateTo(target: Partial<typeof HOME>): void {
    cancelAnimationFrame(this.animating);
    const from = { ...this.cam };
    const to = { ...this.cam, ...target };
    // gira pelo caminho mais curto
    const tau = Math.PI * 2;
    to.yaw = from.yaw + ((((to.yaw - from.yaw) % tau) + tau * 1.5) % tau) - Math.PI;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 420);
      const e = 1 - Math.pow(1 - t, 3);
      for (const k of Object.keys(to) as (keyof typeof HOME)[]) this.cam[k] = from[k] + (to[k] - from[k]) * e;
      this.paint();
      if (t < 1) this.animating = requestAnimationFrame(step);
      else if (this.spin) this.tick();
    };
    this.animating = requestAnimationFrame(step);
  }

  private rotate(dyaw: number, dpitch: number): void {
    this.cam.yaw += dyaw;
    this.cam.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, this.cam.pitch + dpitch));
  }

  private zoomBy(f: number): void {
    this.cam.zoom = Math.max(0.25, Math.min(8, this.cam.zoom * f));
    this.draw();
  }

  /* ------------------------------------------------------------ desenho */

  private paint(): void {
    const { w, h } = this.size();
    if (!w || !h || !this.spec) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const col = this.colors();
    const proj = this.projector(w, h);
    const [hx, hy, hz] = this.half;
    const tmp = new Float32Array(3);
    const P = (x: number, y: number, z: number): [number, number, number] => {
      proj(x, y, z, tmp, 0);
      return [tmp[0]!, tmp[1]!, tmp[2]!];
    };

    // caixa: faces do fundo com grade, para dar noção de profundidade
    const { yaw, pitch } = this.cam;
    // vetor que aponta para o observador, no espaço da vista
    const toEye: V3 = [-Math.sin(yaw) * Math.cos(pitch), -Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
    // face de fundo de cada eixo: o lado oposto ao observador
    const backX = toEye[0] > 0 ? -hx : hx;
    const backY = toEye[1] > 0 ? -hy : hy;
    const floorZ = toEye[2] > 0 ? -hz : hz;
    const { x: bx, y: by, z: bz } = this.box;
    const sxStep = niceStep(bx[1] - bx[0], 5);
    const syStep = niceStep(by[1] - by[0], 5);
    const szStep = niceStep(bz[1] - bz[0], 4);
    const ux = (v: number) => (((v - bx[0]) / (bx[1] - bx[0])) * 2 - 1) * hx;
    const uy = (v: number) => (((v - by[0]) / (by[1] - by[0])) * 2 - 1) * hy;
    const uz = (v: number) => (((v - bz[0]) / (bz[1] - bz[0])) * 2 - 1) * hz;
    const ticks = (r: Range, step: number) => {
      const out: number[] = [];
      for (let v = Math.ceil(r[0] / step) * step; v <= r[1] + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
      return out;
    };
    const tx = ticks(bx, sxStep);
    const ty = ticks(by, syStep);
    const tz = ticks(bz, szStep);
    const seg = (a: [number, number, number], b: [number, number, number]) => {
      const p = P(...a);
      const q = P(...b);
      g.moveTo(p[0], p[1]);
      g.lineTo(q[0], q[1]);
    };
    if (this.spec.grid !== false) {
      g.strokeStyle = col.line;
      g.lineWidth = 1;
      g.globalAlpha = 0.7;
      g.beginPath();
      // chão (ou teto, olhando de baixo)
      for (const v of tx) seg([ux(v), -hy, floorZ], [ux(v), hy, floorZ]);
      for (const v of ty) seg([-hx, uy(v), floorZ], [hx, uy(v), floorZ]);
      // parede do fundo em x
      for (const v of ty) seg([backX, uy(v), -hz], [backX, uy(v), hz]);
      for (const v of tz) seg([backX, -hy, uz(v)], [backX, hy, uz(v)]);
      // parede do fundo em y
      for (const v of tx) seg([ux(v), backY, -hz], [ux(v), backY, hz]);
      for (const v of tz) seg([-hx, backY, uz(v)], [hx, backY, uz(v)]);
      g.stroke();
      g.globalAlpha = 1;
    }
    // arestas da caixa nas faces do fundo
    g.strokeStyle = col.muted;
    g.globalAlpha = 0.55;
    g.lineWidth = 1;
    g.beginPath();
    seg([-hx, -hy, floorZ], [hx, -hy, floorZ]);
    seg([-hx, hy, floorZ], [hx, hy, floorZ]);
    seg([-hx, -hy, floorZ], [-hx, hy, floorZ]);
    seg([hx, -hy, floorZ], [hx, hy, floorZ]);
    seg([backX, backY, -hz], [backX, backY, hz]);
    seg([backX, -hy, -floorZ], [backX, hy, -floorZ]);
    seg([-hx, backY, -floorZ], [hx, backY, -floorZ]);
    g.stroke();
    g.globalAlpha = 1;

    // primitivas ordenadas de trás para frente
    type Prim = { d: number; draw: () => void };
    const prims: Prim[] = [];
    const light: V3 = [toEye[0] * 0.6 + 0.3, toEye[1] * 0.6 + 0.2, toEye[2] * 0.6 + 0.6];
    const ll = Math.hypot(...light);
    light[0] /= ll;
    light[1] /= ll;
    light[2] /= ll;
    const wireColor = col.surface;
    const hoverHits: { sx: number; sy: number; d: number; pt: V3; series: number }[] = [];

    for (const m of this.meshes) {
      if (this.hidden.has(m.series)) continue;
      const N = m.n + 1;
      const scr = new Float32Array(N * N * 3);
      for (let k = 0; k < N * N; k++) proj(m.unit[k * 3]!, m.unit[k * 3 + 1]!, m.unit[k * 3 + 2]!, scr, k * 3);
      if (this.hover) {
        for (let k = 0; k < N * N; k++) {
          const zv = m.pts[k * 3 + 2]!;
          if (!Number.isFinite(zv) || zv < bz[0] || zv > bz[1]) continue;
          hoverHits.push({ sx: scr[k * 3]!, sy: scr[k * 3 + 1]!, d: scr[k * 3 + 2]!, pt: [m.pts[k * 3]!, m.pts[k * 3 + 1]!, zv], series: m.series });
        }
      }
      const thin = m.n > 70 || !this.wire;
      for (let j = 0; j < m.n; j++) {
        for (let i = 0; i < m.n; i++) {
          const k = j * m.n + i;
          const lv = m.level[k]!;
          if (lv < 0) continue;
          const a = (j * N + i) * 3;
          const b = (j * N + i + 1) * 3;
          const c = ((j + 1) * N + i + 1) * 3;
          const d = ((j + 1) * N + i) * 3;
          const depth = (scr[a + 2]! + scr[b + 2]! + scr[c + 2]! + scr[d + 2]!) / 4;
          const dot = Math.abs(m.normals[k * 3]! * light[0] + m.normals[k * 3 + 1]! * light[1] + m.normals[k * 3 + 2]! * light[2]);
          const fill = m.colors[Math.min(LEVELS - 1, (lv * LEVELS) | 0) * SHADES + Math.min(SHADES - 1, (dot * SHADES) | 0)]!;
          prims.push({
            d: depth,
            draw: () => {
              g.beginPath();
              g.moveTo(scr[a]!, scr[a + 1]!);
              g.lineTo(scr[b]!, scr[b + 1]!);
              g.lineTo(scr[c]!, scr[c + 1]!);
              g.lineTo(scr[d]!, scr[d + 1]!);
              g.closePath();
              g.fillStyle = fill;
              g.fill();
              // contorno da mesma cor fecha as frestas entre quadrados
              g.strokeStyle = thin ? fill : wireColor;
              g.globalAlpha = thin ? 1 : 0.28;
              g.lineWidth = thin ? 0.6 : 0.7;
              g.stroke();
              g.globalAlpha = 1;
            },
          });
        }
      }
    }
    for (const l of this.lines) {
      if (this.hidden.has(l.series)) continue;
      const color = this.color(l.series);
      const cnt = l.unit.length / 3;
      const scr = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k++) proj(l.unit[k * 3]!, l.unit[k * 3 + 1]!, l.unit[k * 3 + 2]!, scr, k * 3);
      // trechos de 6 pontos: poucos o bastante para ordenar bem, muitos para ser rápido
      for (let k = 0; k < cnt - 1; k += 6) {
        const end = Math.min(cnt - 1, k + 6);
        let ok = true;
        for (let q = k; q <= end; q++) if (!Number.isFinite(scr[q * 3]!) || !Number.isFinite(l.pts[q * 3 + 2]!) || l.pts[q * 3 + 2]! < bz[0] || l.pts[q * 3 + 2]! > bz[1]) ok = false;
        if (!ok) continue;
        prims.push({
          d: (scr[k * 3 + 2]! + scr[end * 3 + 2]!) / 2 - 0.01,
          draw: () => {
            g.beginPath();
            g.moveTo(scr[k * 3]!, scr[k * 3 + 1]!);
            for (let q = k + 1; q <= end; q++) g.lineTo(scr[q * 3]!, scr[q * 3 + 1]!);
            g.strokeStyle = color;
            g.lineWidth = 2.6;
            g.lineCap = 'round';
            g.lineJoin = 'round';
            g.stroke();
          },
        });
      }
      if (this.hover) for (let k = 0; k < cnt; k += 3) hoverHits.push({ sx: scr[k * 3]!, sy: scr[k * 3 + 1]!, d: scr[k * 3 + 2]! - 0.01, pt: [l.pts[k * 3]!, l.pts[k * 3 + 1]!, l.pts[k * 3 + 2]!], series: l.series });
    }
    for (const dt of this.dots) {
      if (this.hidden.has(dt.series)) continue;
      const p = P(...dt.unit);
      const color = this.color(dt.series);
      prims.push({
        d: p[2] - 0.02,
        draw: () => {
          g.beginPath();
          g.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
          g.fillStyle = color;
          g.fill();
          g.strokeStyle = col.ink;
          g.lineWidth = 1.2;
          g.stroke();
        },
      });
      if (this.hover) hoverHits.push({ sx: p[0], sy: p[1], d: p[2] - 0.02, pt: dt.pt, series: dt.series });
    }
    // profundidade maior = mais longe do observador: desenha primeiro
    prims.sort((a, b) => b.d - a.d);
    for (const p of prims) p.draw();

    // eixos com números nas arestas da frente-baixo
    g.font = `10.5px ${col.mono}`;
    g.fillStyle = col.muted;
    const frontY = -backY;
    const frontX = -backX;
    const lowZ = floorZ;
    const label = (pos: [number, number, number], text: string, dx = 0, dy = 0) => {
      const p = P(...pos);
      g.fillText(text, p[0] + dx, p[1] + dy);
    };
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const out = 0.12;
    for (const v of tx) label([ux(v), frontY + Math.sign(frontY) * out, lowZ], tickLabel(v, sxStep));
    for (const v of ty) label([frontX + Math.sign(frontX) * out, uy(v), lowZ], tickLabel(v, syStep));
    g.textAlign = 'right';
    for (const v of tz) label([frontX, backY, uz(v)], tickLabel(v, szStep), -8);
    g.fillStyle = col.ink;
    g.font = `600 12px ${col.mono}`;
    g.textAlign = 'center';
    label([0, frontY + Math.sign(frontY) * 0.32, lowZ], 'x');
    label([frontX + Math.sign(frontX) * 0.32, 0, lowZ], 'y');
    label([frontX, backY, hz + 0.16], 'z');

    // ponto sob o cursor
    this.tip.style.display = 'none';
    if (this.hover && hoverHits.length) {
      // entre os pontos perto do cursor, o da frente (o que se vê)
      let best: (typeof hoverHits)[number] | null = null;
      for (const hit of hoverHits) {
        const d = (hit.sx - this.hover.x) ** 2 + (hit.sy - this.hover.y) ** 2;
        if (d > 14 * 14) continue;
        if (!best || hit.d < best.d - 0.02 || (Math.abs(hit.d - best.d) <= 0.02 && d < (best.sx - this.hover.x) ** 2 + (best.sy - this.hover.y) ** 2)) best = hit;
      }
      if (best) {
        g.beginPath();
        g.arc(best.sx, best.sy, 5, 0, Math.PI * 2);
        g.fillStyle = col.ink;
        g.fill();
        g.strokeStyle = col.surface;
        g.lineWidth = 2;
        g.stroke();
        this.tip.textContent = `(${fmt(best.pt[0])}; ${fmt(best.pt[1])}; ${fmt(best.pt[2])})`;
        this.tip.style.display = '';
        const tw = this.tip.offsetWidth || 190;
        this.tip.style.transform = `translate(${best.sx + 12 + tw > w ? best.sx - tw - 12 : best.sx + 12}px, ${Math.max(best.sy - 30, 4)}px)`;
      }
    }
  }

  /* ------------------------------------------------------------ gestos */

  private bind(): void {
    const c = this.canvas;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let pinch: number | null = null;
    let lastMove = 0;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
      cancelAnimationFrame(this.animating);
      this.vel = { yaw: 0, pitch: 0 };
      this.el.classList.add('used');
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      const prev = this.pointers.get(e.pointerId);
      if (!prev) {
        if (e.pointerType === 'mouse') {
          this.hover = p;
          this.draw();
        }
        return;
      }
      this.pointers.set(e.pointerId, p);
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      if (this.pointers.size === 2 && pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (d > 0) this.cam.zoom = Math.max(0.25, Math.min(8, this.cam.zoom * (d / pinch)));
        pinch = d;
        // dois dedos também movem
        this.cam.panX += dx / 2;
        this.cam.panY += dy / 2;
        this.draw();
        return;
      }
      this.hover = null;
      if (e.shiftKey || e.buttons === 4 || e.buttons === 2) {
        this.cam.panX += dx;
        this.cam.panY += dy;
      } else {
        const k = 0.008;
        this.rotate(dx * k, dy * k);
        const now = performance.now();
        const dt = Math.max(1, now - lastMove) / 16.7;
        lastMove = now;
        this.vel = { yaw: (dx * k) / dt, pitch: (dy * k) / dt };
      }
      this.draw();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
      // solta com velocidade: continua girando e desacelera
      if (!this.pointers.size && performance.now() - lastMove < 80 && (Math.abs(this.vel.yaw) > 0.002 || Math.abs(this.vel.pitch) > 0.002)) this.tick();
      else if (!this.pointers.size && this.spin) this.tick();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', () => this.reset());
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.opts.wheel !== 'always' && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.zoomBy(Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }
}
