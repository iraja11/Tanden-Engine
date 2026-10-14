import type { PlotSeries, PlotSpec } from '@tanden/core/src/calc';
import { sampleFx, sampleParam } from '@tanden/core/src/calc/plot';
import './plot.css';

/*
 * Gráfico de funções em canvas, sem biblioteca. Arrastar passeia, a roda
 * (ou Ctrl+roda dentro de uma nota) aproxima em volta do cursor, dois dedos
 * fazem pinça e dois cliques voltam ao enquadramento inicial. Passar o mouse
 * mostra o ponto da curva mais próxima.
 */

type View = { x0: number; x1: number; y0: number; y1: number };

export interface PlotOptions {
  height?: number;
  /** a roda aproxima sempre (aba Cálculo) ou só com Ctrl (dentro de uma nota) */
  wheel?: 'always' | 'ctrl';
}

const PALETTE = ['--ember', '#5aa9ff', '#7fd1a8', '#c792ff', '#ffd166', '#ff6b8b', '#4dd0e1'];

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
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
  if (abs >= 1e6 || abs < 1e-4) return v.toExponential(1).replace('.', ',').replace('e+', 'e');
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(dec).replace('.', ',').replace('-', '−');
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-4)) return v.toExponential(3).replace('.', ',').replace('e+', 'e');
  return Number(v.toPrecision(5)).toString().replace('.', ',').replace('-', '−');
}

export class PlotView {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLDivElement;
  private legend: HTMLDivElement;
  private errors: HTMLDivElement;
  private title: HTMLDivElement;
  private spec: PlotSpec | null = null;
  private home: View = { x0: -10, x1: 10, y0: -6, y1: 6 };
  private view: View = { ...this.home };
  private touched = false;
  private hidden = new Set<number>();
  private hover: { x: number; y: number } | null = null;
  private frame = 0;
  private ro: ResizeObserver;
  private mo: MutationObserver;
  private pointers = new Map<number, { x: number; y: number }>();
  private height: number;

  constructor(private opts: PlotOptions = {}) {
    this.height = opts.height ?? 0;
    this.el = document.createElement('div');
    this.el.className = 'tplot';
    this.el.innerHTML = `<div class="tplot-title"></div><div class="tplot-box"><canvas></canvas><div class="tplot-legend"></div>
      <div class="tplot-tools"><button data-z="in" title="Aproximar">+</button><button data-z="out" title="Afastar">−</button><button data-z="home" title="Voltar ao início (dois cliques)">⟲</button></div>
      <div class="tplot-tip"></div></div><div class="tplot-errors"></div>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.tip = this.el.querySelector('.tplot-tip')!;
    this.legend = this.el.querySelector('.tplot-legend')!;
    this.errors = this.el.querySelector('.tplot-errors')!;
    this.title = this.el.querySelector('.tplot-title')!;
    const box = this.el.querySelector<HTMLDivElement>('.tplot-box')!;
    if (opts.height) {
      box.style.height = `${this.height}px`;
      box.style.flex = 'none';
    }
    this.el.querySelectorAll<HTMLButtonElement>('.tplot-tools button').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        const z = b.dataset.z;
        if (z === 'home') this.reset();
        else this.zoomAt(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2, z === 'in' ? 0.6 : 1 / 0.6);
      }),
    );
    // o editor não deve tratar cliques e arrastos do gráfico como edição
    for (const t of ['mousedown', 'pointerdown', 'click', 'dblclick'] as const) this.el.addEventListener(t, (e) => e.stopPropagation());
    this.bind();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(box);
    // troca de tema: redesenha com as cores novas
    this.mo = new MutationObserver(() => this.draw());
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  }

  destroy(): void {
    this.ro.disconnect();
    this.mo.disconnect();
    cancelAnimationFrame(this.frame);
  }

  setSpec(spec: PlotSpec): void {
    this.spec = spec;
    this.home = this.fit(spec);
    if (!this.touched) this.view = { ...this.home };
    this.title.textContent = spec.title ?? '';
    this.title.style.display = spec.title ? '' : 'none';
    this.errors.innerHTML = '';
    for (const e of spec.errors) {
      const d = document.createElement('div');
      d.textContent = `linha ${e.line + 1}: ${e.message}`;
      this.errors.appendChild(d);
    }
    this.renderLegend();
    this.draw();
  }

  reset(): void {
    this.touched = false;
    this.view = { ...this.home };
    this.draw();
  }

  private color(i: number): string {
    const c = PALETTE[i % PALETTE.length]!;
    return c.startsWith('--') ? cssVar(this.el, c, '#ff8a3d') : c;
  }

  private renderLegend(): void {
    const s = this.spec?.series ?? [];
    this.legend.innerHTML = '';
    if (s.length < 2 && !(s[0] && s[0].label && !/^y\s*=|^\(|^r\s*=/.test(s[0].label))) return;
    s.forEach((series, i) => {
      const b = document.createElement('button');
      b.className = 'tplot-key';
      b.classList.toggle('off', this.hidden.has(i));
      b.innerHTML = `<i></i><span></span>`;
      b.querySelector('i')!.style.background = this.color(i);
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

  /** Enquadramento inicial: o pedido no bloco ou o que mostra bem as curvas. */
  private fit(spec: PlotSpec): View {
    let [x0, x1] = spec.x ?? [NaN, NaN];
    const xs: number[] = [];
    const ys: number[] = [];
    const t = (s: PlotSeries) => ('t' in s ? s.t : [0, 2 * Math.PI]) as [number, number];
    for (const s of spec.series) {
      if (s.kind === 'points') s.points.forEach(([x, y]) => (xs.push(x), ys.push(y)));
      else if (s.kind === 'vline') xs.push(s.x);
      else if (s.kind === 'param' || s.kind === 'polar') {
        const [a, b] = t(s);
        const fx = s.kind === 'param' ? s.fx : (u: number) => s.f(u) * Math.cos(u);
        const fy = s.kind === 'param' ? s.fy : (u: number) => s.f(u) * Math.sin(u);
        for (const seg of sampleParam(fx, fy, a, b, 400)) seg.forEach(([x, y]) => (xs.push(x), ys.push(y)));
      }
    }
    if (!Number.isFinite(x0)) {
      if (xs.length) {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        const pad = (hi - lo || 2) * 0.12;
        [x0, x1] = [lo - pad, hi + pad];
        if (spec.series.some((s) => s.kind === 'fx')) [x0, x1] = [Math.min(x0, -10), Math.max(x1, 10)];
      } else [x0, x1] = [-10, 10];
    }
    for (const s of spec.series) {
      if (s.kind !== 'fx') continue;
      for (let i = 0; i <= 240; i++) {
        const y = s.f(x0! + ((x1! - x0!) * i) / 240);
        if (Number.isFinite(y)) ys.push(y);
      }
    }
    let y0: number;
    let y1: number;
    if (spec.y) [y0, y1] = spec.y;
    else if (ys.length) {
      // ignora picos de assíntotas: usa do 3º ao 97º percentil
      const sorted = [...ys].sort((a, b) => a - b);
      const lo = sorted[Math.floor(sorted.length * 0.03)]!;
      const hi = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.97))]!;
      const pad = (hi - lo || Math.max(1, Math.abs(lo))) * 0.15;
      [y0, y1] = [lo - pad, hi + pad];
      if (y0 > 0 && y0 < (y1 - y0) * 0.6) y0 = -pad; // inclui o eixo quando está perto
      if (y1 < 0 && -y1 < (y1 - y0) * 0.6) y1 = pad;
    } else [y0, y1] = [-(x1! - x0!) * 0.3, (x1! - x0!) * 0.3];
    return { x0: x0!, x1: x1!, y0, y1 };
  }

  private size() {
    return { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
  }

  /** Com "proporção: igual", ajusta y para a mesma escala de x. */
  private effective(): View {
    const v = this.view;
    if (!this.spec?.equal) return v;
    const { w, h } = this.size();
    if (!w || !h) return v;
    const sx = (v.x1 - v.x0) / w;
    const cy = (v.y0 + v.y1) / 2;
    return { ...v, y0: cy - (sx * h) / 2, y1: cy + (sx * h) / 2 };
  }

  private toPx(v: View, w: number, h: number) {
    return {
      px: (x: number) => ((x - v.x0) / (v.x1 - v.x0)) * w,
      py: (y: number) => h - ((y - v.y0) / (v.y1 - v.y0)) * h,
      wx: (px: number) => v.x0 + (px / w) * (v.x1 - v.x0),
      wy: (py: number) => v.y0 + ((h - py) / h) * (v.y1 - v.y0),
    };
  }

  draw(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.paint());
  }

  private paint(): void {
    const { w, h } = this.size();
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const v = this.effective();
    const { px, py, wx } = this.toPx(v, w, h);
    const ink = cssVar(this.el, '--ink', '#ecebf0');
    const muted = cssVar(this.el, '--muted', '#8c8a96');
    const line = cssVar(this.el, '--line', '#2b2a31');
    const mono = cssVar(this.el, '--f-mono', 'monospace');

    // grade
    const sx = niceStep(v.x1 - v.x0, w / 90);
    const sy = niceStep(v.y1 - v.y0, h / 60);
    if (this.spec?.grid !== false) {
      g.strokeStyle = line;
      g.globalAlpha = 0.35;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = Math.ceil(v.x0 / (sx / 5)) * (sx / 5); x <= v.x1; x += sx / 5) { const p = Math.round(px(x)) + 0.5; g.moveTo(p, 0); g.lineTo(p, h); }
      for (let y = Math.ceil(v.y0 / (sy / 5)) * (sy / 5); y <= v.y1; y += sy / 5) { const p = Math.round(py(y)) + 0.5; g.moveTo(0, p); g.lineTo(w, p); }
      g.stroke();
      g.globalAlpha = 1;
      g.beginPath();
      for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) { const p = Math.round(px(x)) + 0.5; g.moveTo(p, 0); g.lineTo(p, h); }
      for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) { const p = Math.round(py(y)) + 0.5; g.moveTo(0, p); g.lineTo(w, p); }
      g.stroke();
    }
    // eixos
    const ax = Math.min(Math.max(py(0), 0), h);
    const ay = Math.min(Math.max(px(0), 0), w);
    g.strokeStyle = muted;
    g.lineWidth = 1.2;
    g.beginPath();
    if (v.y0 <= 0 && v.y1 >= 0) { g.moveTo(0, Math.round(ax) + 0.5); g.lineTo(w, Math.round(ax) + 0.5); }
    if (v.x0 <= 0 && v.x1 >= 0) { g.moveTo(Math.round(ay) + 0.5, 0); g.lineTo(Math.round(ay) + 0.5, h); }
    g.stroke();
    g.fillStyle = muted;
    g.font = `10.5px ${mono}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const ly = Math.min(Math.max(ax + 4, 2), h - 14);
    for (let x = Math.ceil(v.x0 / sx) * sx; x <= v.x1; x += sx) {
      if (Math.abs(x) < sx / 2 || px(x) < 12 || px(x) > w - 12) continue;
      g.fillText(tickLabel(x, sx), px(x), ly);
    }
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    const lx = Math.min(Math.max(ay - 5, 30), w - 4);
    for (let y = Math.ceil(v.y0 / sy) * sy; y <= v.y1; y += sy) {
      if (Math.abs(y) < sy / 2 || py(y) < 8 || py(y) > h - 8) continue;
      g.fillText(tickLabel(y, sy), lx, py(y));
    }

    // curvas
    const series = this.spec?.series ?? [];
    const span = v.y1 - v.y0;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    series.forEach((s, i) => {
      if (this.hidden.has(i)) return;
      const color = this.color(i);
      g.strokeStyle = color;
      g.fillStyle = color;
      g.lineWidth = 2.2;
      let segs: [number, number][][] = [];
      if (s.kind === 'fx') segs = sampleFx(s.f, v.x0, v.x1, Math.ceil(w), span * 4);
      else if (s.kind === 'param') segs = sampleParam(s.fx, s.fy, s.t[0], s.t[1], 1500);
      else if (s.kind === 'polar') segs = sampleParam((u) => s.f(u) * Math.cos(u), (u) => s.f(u) * Math.sin(u), s.t[0], s.t[1], 1500);
      else if (s.kind === 'vline') {
        g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(px(s.x), 0);
        g.lineTo(px(s.x), h);
        g.stroke();
        g.setLineDash([]);
        return;
      } else if (s.kind === 'points') {
        for (const [x, y] of s.points) {
          g.beginPath();
          g.arc(px(x), py(y), 4, 0, Math.PI * 2);
          g.fill();
        }
        return;
      }
      const clamp = (y: number) => Math.max(-1e5, Math.min(1e5, y));
      for (const seg of segs) {
        g.beginPath();
        seg.forEach(([x, y], k) => (k ? g.lineTo(px(x), clamp(py(y))) : g.moveTo(px(x), clamp(py(y)))));
        g.stroke();
      }
    });

    // ponto sob o cursor
    this.tip.style.display = 'none';
    if (this.hover) {
      const x = wx(this.hover.x);
      let best: { d: number; y: number; i: number } | null = null;
      series.forEach((s, i) => {
        if (s.kind !== 'fx' || this.hidden.has(i)) return;
        const y = s.f(x);
        if (!Number.isFinite(y)) return;
        const d = Math.abs(py(y) - this.hover!.y);
        if (!best || d < best.d) best = { d, y, i };
      });
      const b = best as { d: number; y: number; i: number } | null;
      if (b && b.d < 40) {
        const cx = px(x);
        const cy = py(b.y);
        g.strokeStyle = muted;
        g.globalAlpha = 0.5;
        g.setLineDash([3, 4]);
        g.beginPath();
        g.moveTo(cx, 0);
        g.lineTo(cx, h);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        g.fillStyle = this.color(b.i);
        g.strokeStyle = ink;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, 5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        this.tip.textContent = `(${fmt(x)}; ${fmt(b.y)})`;
        this.tip.style.display = '';
        this.tip.style.transform = `translate(${Math.min(cx + 10, w - 140)}px, ${Math.max(cy - 30, 4)}px)`;
      }
    }
  }

  private zoomAt(cx: number, cy: number, f: number): void {
    const { w, h } = this.size();
    const v = this.effective();
    const { wx, wy } = this.toPx(v, w, h);
    const X = wx(cx);
    const Y = wy(cy);
    this.view = { x0: X - (X - v.x0) * f, x1: X + (v.x1 - X) * f, y0: Y - (Y - v.y0) * f, y1: Y + (v.y1 - Y) * f };
    this.touched = true;
    this.draw();
  }

  private panBy(dx: number, dy: number): void {
    const { w, h } = this.size();
    const v = this.effective();
    const kx = (v.x1 - v.x0) / w;
    const ky = (v.y1 - v.y0) / h;
    this.view = { x0: v.x0 - dx * kx, x1: v.x1 - dx * kx, y0: v.y0 + dy * ky, y1: v.y1 + dy * ky };
    this.touched = true;
    this.draw();
  }

  private bind(): void {
    const c = this.canvas;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let pinch: number | null = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
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
      if (this.pointers.size === 2 && pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (d > 0) this.zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, pinch / d);
        pinch = d;
        return;
      }
      this.hover = e.pointerType === 'mouse' ? p : null;
      this.panBy(p.x - prev.x, p.y - prev.y);
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.draw();
    });
    c.addEventListener('dblclick', () => this.reset());
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.opts.wheel !== 'always' && !e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const p = local(e);
        this.zoomAt(p.x, p.y, Math.exp(e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }
}
