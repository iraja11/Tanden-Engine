import { ForceLayout, type LayoutParams } from '@tanden/core/src/graph';
import './graph.css';

/*
 * Grafo em canvas, para milhares de nós (o de notas e o de Mundos).
 * Layout de forças vivo (Barnes-Hut no núcleo) que esfria e para sozinho.
 * Roda/pinça aproxima no cursor, arrastar o fundo passeia, arrastar um nó
 * leva ele (os vizinhos acompanham), passar o mouse acende o nó e as
 * ligações dele, clique seleciona e dois cliques abrem.
 */

export interface GNode {
  id: string;
  label: string;
  /** cor do nó (qualquer cor CSS, inclusive var(--x)) */
  color: string;
  /** desenho: cheio, anel (tag) ou tracejado (nota que não existe) */
  shape?: 'dot' | 'ring' | 'ghost';
  /** peso extra no tamanho, além do número de ligações */
  weight?: number;
}

export interface GEdge {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
}

export interface GraphCanvasOptions {
  onSelect?: (id: string | null) => void;
  onOpen?: (id: string) => void;
  /** setas nas ligações (sempre, ou só nas acesas) */
  arrows?: 'always' | 'lit' | 'never';
  /** nome das ligações acesas (Mundos) */
  edgeLabels?: boolean;
  /** tamanho dos nós (1 = padrão) */
  nodeScale?: number;
  /** espessura das ligações (1 = padrão) */
  linkWidth?: number;
  /** quando os nomes aparecem: 0 = sempre, 1 = padrão, maior = só bem de perto; -1 = nunca (só os em foco) */
  labelFade?: number;
}

type Cam = { x: number; y: number; k: number };

/** Converte qualquer cor CSS (var(), color-mix(), hsl()) em rgb() que o canvas entende. */
const colorMemo = new Map<string, string>();
function cssColor(el: Element, c: string): string {
  const memoKey = c;
  const hit = colorMemo.get(memoKey);
  if (hit) return hit;
  const probe = document.createElement('i');
  probe.style.color = c;
  probe.style.display = 'none';
  el.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#888888';
  g.fillStyle = computed;
  g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  const out = `rgb(${r},${gg},${b})`;
  colorMemo.set(memoKey, out);
  return out;
}

export class GraphCanvas {
  readonly el: HTMLDivElement;
  readonly layout = new ForceLayout();
  private canvas: HTMLCanvasElement;
  private nodes: GNode[] = [];
  private edges: GEdge[] = [];
  private byId = new Map<string, number>();
  /** índices dos pares ligados, alinhados com layout */
  private ea = new Uint32Array(0);
  private eb = new Uint32Array(0);
  private adj: number[][] = [];
  private radius = new Float32Array(0);
  private cam: Cam = { x: 0, y: 0, k: 1 };
  private camAnim = 0;
  private sim = 0;
  private frame = 0;
  private hover = -1;
  private selected = -1;
  private highlight: Set<number> | null = null;
  private drag: null | { node: number; sx: number; sy: number; moved: boolean; ox: number; oy: number } = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: number | null = null;
  private ro: ResizeObserver;
  private mo: MutationObserver;
  private colors: { ink: string; muted: string; line: string; ember: string; bg: string; mono: string; body: string; nodes: string[] } | null = null;
  private fitted = false;
  /** quanto as cores se apagam quando há foco (hover, seleção, busca) */
  private fade = 0;
  private fadeTarget = 0;

  constructor(private opts: GraphCanvasOptions = {}) {
    this.el = document.createElement('div');
    this.el.className = 'tgraph';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Grafo de ligações');
    this.el.appendChild(this.canvas);
    this.bind();
    this.ro = new ResizeObserver(() => {
      if (!this.fitted && this.nodes.length) this.fit(false);
      this.draw();
    });
    this.ro.observe(this.el);
    this.mo = new MutationObserver(() => {
      colorMemo.clear();
      this.colors = null;
      this.draw();
    });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  }

  destroy(): void {
    this.ro.disconnect();
    this.mo.disconnect();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.sim);
    cancelAnimationFrame(this.camAnim);
  }

  /* ------------------------------------------------------------ dados */

  setData(nodes: GNode[], edges: GEdge[]): void {
    const prevSel = this.selected >= 0 ? this.nodes[this.selected]?.id : null;
    const prevIds = new Set(this.nodes.map((n) => n.id));
    this.nodes = nodes;
    this.edges = edges.filter((e) => e.from !== e.to);
    this.byId = new Map(nodes.map((n, i) => [n.id, i]));
    this.edges = this.edges.filter((e) => this.byId.has(e.from) && this.byId.has(e.to));
    const firstTime = !prevIds.size;
    this.layout.setGraph(
      nodes.map((n) => n.id),
      this.edges.map((e) => [e.from, e.to] as const),
    );
    this.ea = new Uint32Array(this.edges.map((e) => this.byId.get(e.from)!));
    this.eb = new Uint32Array(this.edges.map((e) => this.byId.get(e.to)!));
    this.adj = nodes.map(() => []);
    for (let k = 0; k < this.ea.length; k++) {
      this.adj[this.ea[k]!]!.push(this.eb[k]!);
      this.adj[this.eb[k]!]!.push(this.ea[k]!);
    }
    this.sizeNodes();
    this.selected = prevSel ? (this.byId.get(prevSel) ?? -1) : -1;
    this.hover = -1;
    this.colors = null;
    if (firstTime) {
      // abre já quase arrumado: alguns passos antes do primeiro quadro
      const budget = performance.now() + 120;
      let s = 0;
      while (s++ < 300 && performance.now() < budget && !this.layout.settled) this.layout.tick();
      this.fitted = false;
      this.fit(false);
    }
    this.run();
  }

  setOptions(o: Partial<GraphCanvasOptions>): void {
    const resize = o.nodeScale !== undefined && o.nodeScale !== this.opts.nodeScale;
    Object.assign(this.opts, o);
    if (resize) this.sizeNodes();
    this.draw();
  }

  private sizeNodes(): void {
    const scale = this.opts.nodeScale ?? 1;
    this.radius = new Float32Array(this.nodes.length);
    this.nodes.forEach((n, i) => {
      const deg = this.layout.degree[i] ?? 0;
      this.radius[i] = (4 + Math.min(14, Math.sqrt(deg + (n.weight ?? 0)) * 2.2)) * scale;
    });
  }

  /** Posições atuais do layout (para levar o grafo para um quadro). */
  positions(): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    this.layout.ids.forEach((id, i) => out.set(id, { x: this.layout.x[i]!, y: this.layout.y[i]! }));
    return out;
  }

  /** O que está na tela, como imagem PNG (com o fundo do tema). */
  async png(): Promise<Blob | null> {
    this.paint();
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const g = out.getContext('2d');
    if (!g) return null;
    g.fillStyle = this.palette().bg;
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(this.canvas, 0, 0);
    return new Promise((res) => out.toBlob((b) => res(b), 'image/png'));
  }

  setParams(p: Partial<LayoutParams>): void {
    Object.assign(this.layout.params, p);
    this.layout.reheat(0.5);
    this.run();
  }

  /** Seleciona um nó (sem avisar de volta). */
  select(id: string | null, focus = false): void {
    this.selected = id ? (this.byId.get(id) ?? -1) : -1;
    if (focus && this.selected >= 0) this.focus(id!);
    this.updateFade();
    this.draw();
  }

  /** Acende só estes nós (resultado de busca); null limpa. */
  setHighlight(ids: Iterable<string> | null): void {
    if (!ids) this.highlight = null;
    else {
      const s = new Set<number>();
      for (const id of ids) {
        const i = this.byId.get(id);
        if (i !== undefined) s.add(i);
      }
      this.highlight = s;
    }
    this.updateFade();
    this.draw();
  }

  /* ------------------------------------------------------------ câmera */

  private size() {
    return { w: this.el.clientWidth, h: this.el.clientHeight };
  }

  private bounds(only?: Set<number>) {
    const L = this.layout;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < L.size; i++) {
      if (only && !only.has(i)) continue;
      x0 = Math.min(x0, L.x[i]!);
      x1 = Math.max(x1, L.x[i]!);
      y0 = Math.min(y0, L.y[i]!);
      y1 = Math.max(y1, L.y[i]!);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }

  fit(animate = true, only?: Iterable<string>): void {
    const { w, h } = this.size();
    if (!w || !h) return;
    const set = only ? new Set([...only].map((id) => this.byId.get(id)).filter((i): i is number => i !== undefined)) : undefined;
    const b = this.bounds(set);
    if (!b) return;
    this.fitted = true;
    const pad = 60;
    const k = Math.min(2.2, Math.max(0.05, Math.min((w - pad * 2) / Math.max(1, b.x1 - b.x0), (h - pad * 2) / Math.max(1, b.y1 - b.y0))));
    this.moveCam({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, k }, animate);
  }

  focus(id: string): void {
    const i = this.byId.get(id);
    if (i === undefined) return;
    this.moveCam({ x: this.layout.x[i]!, y: this.layout.y[i]!, k: Math.max(this.cam.k, 1.1) }, true);
  }

  zoomBy(f: number): void {
    this.moveCam({ ...this.cam, k: Math.min(8, Math.max(0.03, this.cam.k * f)) }, true);
  }

  private moveCam(to: Cam, animate: boolean): void {
    cancelAnimationFrame(this.camAnim);
    if (!animate) {
      this.cam = to;
      this.draw();
      return;
    }
    const from = { ...this.cam };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 380);
      const e = 1 - Math.pow(1 - t, 3);
      // zoom em escala logarítmica fica mais natural
      this.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e) };
      this.paint();
      if (t < 1) this.camAnim = requestAnimationFrame(step);
    };
    this.camAnim = requestAnimationFrame(step);
  }

  private toWorld(px: number, py: number) {
    const { w, h } = this.size();
    return { x: this.cam.x + (px - w / 2) / this.cam.k, y: this.cam.y + (py - h / 2) / this.cam.k };
  }

  /* ------------------------------------------------------------ simulação */

  private simulating = false;

  private run(): void {
    cancelAnimationFrame(this.sim);
    this.simulating = true;
    const step = () => {
      if (!this.el.isConnected) {
        this.simulating = false;
        return;
      }
      const t0 = performance.now();
      // quantos passos couberem em ~8 ms (grafos pequenos assentam rápido)
      let n = 0;
      do {
        this.layout.tick();
        n++;
      } while (!this.layout.settled && n < (this.layout.size > 1500 ? 1 : 4) && performance.now() - t0 < 8);
      if (this.drag && this.drag.node >= 0) {
        this.layout.x[this.drag.node] = this.drag.ox;
        this.layout.y[this.drag.node] = this.drag.oy;
      }
      cancelAnimationFrame(this.frame);
      this.paint();
      if (!this.layout.settled || this.drag) this.sim = requestAnimationFrame(step);
      else this.simulating = false;
    };
    this.sim = requestAnimationFrame(step);
  }

  draw(): void {
    // com a simulação rodando, o próximo passo já desenha
    if (this.simulating) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.paint());
  }

  private updateFade(): void {
    this.fadeTarget = this.hover >= 0 || this.selected >= 0 || this.highlight ? 1 : 0;
  }

  /* ------------------------------------------------------------ desenho */

  private palette() {
    if (this.colors) return this.colors;
    const cs = getComputedStyle(this.el);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    this.colors = {
      ink: v('--ink', '#ecebf0'),
      muted: v('--muted', '#8c8a96'),
      line: v('--line', '#2b2a31'),
      ember: v('--ember', '#ff8a3d'),
      bg: v('--void', '#0b0b0d'),
      mono: v('--f-mono', 'monospace'),
      body: v('--f-body', 'sans-serif'),
      nodes: this.nodes.map((n) => cssColor(this.el, n.color)),
    };
    return this.colors;
  }

  private paint(): void {
    const { w, h } = this.size();
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    const g = this.canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const c = this.palette();
    const L = this.layout;
    const { x: cx, y: cy, k } = this.cam;
    const sx = (x: number) => (x - cx) * k + w / 2;
    const sy = (y: number) => (y - cy) * k + h / 2;
    // fade suave entre "tudo aceso" e "foco"
    this.fade += (this.fadeTarget - this.fade) * 0.25;
    const fading = Math.abs(this.fadeTarget - this.fade) > 0.01;
    if (!fading) this.fade = this.fadeTarget;

    // nós em foco: hover (ou seleção) e vizinhos
    const focus = this.hover >= 0 ? this.hover : this.selected;
    const near = new Set<number>();
    if (focus >= 0) {
      near.add(focus);
      for (const n of this.adj[focus] ?? []) near.add(n);
    }
    const lit = (i: number) => (focus >= 0 ? near.has(i) : this.highlight ? this.highlight.has(i) : true);
    const dimA = 1 - this.fade * 0.82;
    const pad = 40;
    const visible = (i: number) => {
      const X = sx(L.x[i]!);
      const Y = sy(L.y[i]!);
      return X > -pad && X < w + pad && Y > -pad && Y < h + pad;
    };

    // ligações: primeiro as apagadas num só traço, depois as acesas
    const dense = this.ea.length > 4000;
    const lw = this.opts.linkWidth ?? 1;
    g.lineWidth = Math.max(0.5, Math.min(1.6, 1.1 * Math.sqrt(k))) * lw;
    const strokeBatch = (pick: (e: number) => boolean, dashed: boolean, color: string, alpha: number) => {
      g.beginPath();
      let any = false;
      for (let e = 0; e < this.ea.length; e++) {
        if (!!this.edges[e]!.dashed !== dashed || !pick(e)) continue;
        const a = this.ea[e]!;
        const b = this.eb[e]!;
        if (!visible(a) && !visible(b)) {
          // os dois fora: ainda pode cruzar a tela, mas só vale a pena checar se for longa
          const ax = sx(L.x[a]!);
          const bx = sx(L.x[b]!);
          const ay = sy(L.y[a]!);
          const by = sy(L.y[b]!);
          if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h)) continue;
        }
        g.moveTo(sx(L.x[a]!), sy(L.y[a]!));
        g.lineTo(sx(L.x[b]!), sy(L.y[b]!));
        any = true;
      }
      if (!any) return;
      g.setLineDash(dashed ? [3, 4] : []);
      g.strokeStyle = color;
      g.globalAlpha = alpha;
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    };
    const isLitEdge = (e: number) => focus >= 0 && (this.ea[e] === focus || this.eb[e] === focus);
    const edgeAlpha = (dense ? 0.45 : 0.75) * (focus >= 0 || this.highlight ? dimA : 1);
    for (const dashed of [false, true]) strokeBatch((e) => !isLitEdge(e), dashed, c.muted, edgeAlpha * 0.6);
    if (focus >= 0) {
      g.lineWidth = Math.max(1.2, Math.min(2.4, 1.6 * Math.sqrt(k))) * lw;
      g.shadowColor = c.ember;
      g.shadowBlur = 6;
      for (const dashed of [false, true]) strokeBatch(isLitEdge, dashed, c.ember, 0.95);
      g.shadowBlur = 0;
    }
    // setas
    const arrows = this.opts.arrows ?? 'lit';
    if (arrows !== 'never' && k > 0.35) {
      g.fillStyle = c.ember;
      for (let e = 0; e < this.ea.length; e++) {
        const on = isLitEdge(e);
        if (arrows === 'lit' && !on) continue;
        const a = this.ea[e]!;
        const b = this.eb[e]!;
        if (!visible(b)) continue;
        const ax = sx(L.x[a]!);
        const ay = sy(L.y[a]!);
        const bx = sx(L.x[b]!);
        const by = sy(L.y[b]!);
        const d = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / d;
        const uy = (by - ay) / d;
        const r = this.radius[b]! * Math.sqrt(k) + 2;
        const tx = bx - ux * r;
        const ty = by - uy * r;
        const s = on ? 7 : 5;
        g.globalAlpha = on ? 1 : edgeAlpha;
        g.fillStyle = on ? c.ember : c.muted;
        g.beginPath();
        g.moveTo(tx, ty);
        g.lineTo(tx - ux * s - uy * s * 0.5, ty - uy * s + ux * s * 0.5);
        g.lineTo(tx - ux * s + uy * s * 0.5, ty - uy * s - ux * s * 0.5);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
    }

    // nós
    const rs = Math.sqrt(k);
    const order: number[] = [];
    for (let i = 0; i < L.size; i++) if (visible(i)) order.push(i);
    // nós em lote: um caminho por cor e estado (milhares de círculos num só fill)
    const tiny = k * 4 < 1.2;
    const batches = new Map<string, { col: string; on: boolean; shape: GNode['shape']; idx: number[] }>();
    for (const i of order) {
      const n = this.nodes[i]!;
      const on = lit(i);
      const col = c.nodes[i] ?? c.muted;
      const key = `${col}|${on ? 1 : 0}|${n.shape ?? 'dot'}`;
      (batches.get(key) ?? batches.set(key, { col, on, shape: n.shape, idx: [] }).get(key)!).idx.push(i);
    }
    // apagados primeiro, acesos por cima
    const list = [...batches.values()].sort((a, b) => Number(a.on) - Number(b.on));
    for (const bt of list) {
      g.globalAlpha = bt.on ? 1 : dimA;
      g.beginPath();
      for (const i of bt.idx) {
        const X = sx(L.x[i]!);
        const Y = sy(L.y[i]!);
        const r = Math.max(1.6, this.radius[i]! * rs);
        if (tiny) g.rect(X - r, Y - r, r * 2, r * 2);
        else {
          g.moveTo(X + r, Y);
          g.arc(X, Y, r, 0, Math.PI * 2);
        }
      }
      if (bt.shape === 'ring') {
        g.fillStyle = c.bg;
        g.fill();
        g.lineWidth = Math.max(1, 1.8 * rs);
        g.strokeStyle = bt.col;
        g.stroke();
      } else if (bt.shape === 'ghost') {
        g.setLineDash([2, 2]);
        g.lineWidth = 1.2;
        g.strokeStyle = c.muted;
        g.stroke();
        g.setLineDash([]);
      } else {
        g.fillStyle = bt.col;
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // anéis de seleção, hover e busca
    for (const i of order) {
      const sel = i === this.selected || i === this.hover;
      const hl = !sel && focus < 0 && !!this.highlight?.has(i);
      if (!sel && !hl) continue;
      const X = sx(L.x[i]!);
      const Y = sy(L.y[i]!);
      const r = Math.max(1.6, this.radius[i]! * rs);
      g.lineWidth = 2;
      g.strokeStyle = sel ? c.ink : c.ember;
      if (sel) {
        g.shadowColor = c.nodes[i] ?? c.ember;
        g.shadowBlur = 14;
      }
      g.beginPath();
      g.arc(X, Y, r + (sel ? 2.5 : 3), 0, Math.PI * 2);
      g.stroke();
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;

    // nomes: os importantes primeiro; um nome que cobriria outro já escrito fica de fora
    const many = order.length > 600;
    const fadeOpt = this.opts.labelFade ?? 1;
    const labelK = (many ? 1.1 : 0.55) * Math.max(0, fadeOpt);
    const fontPx = Math.max(10, Math.min(15, 11.5 * Math.pow(k, 0.25)));
    g.font = `${fontPx}px ${c.body}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.lineJoin = 'round';
    const fadeIn = fadeOpt < 0 ? 0 : labelK === 0 ? 1 : Math.max(0, Math.min(1, (k - labelK * 0.7) / (labelK * 0.3)));
    const isSpecial = (i: number) => i === this.selected || i === this.hover || (focus >= 0 && near.has(i)) || (this.highlight?.has(i) ?? false);
    const byImportance = [...order].sort((a, b) => Number(isSpecial(b)) - Number(isSpecial(a)) || this.radius[b]! - this.radius[a]!);
    // grade de ocupação na tela (células de 48 px)
    const CELL = 48;
    const taken = new Map<number, [number, number, number, number][]>();
    const cellKey = (cx2: number, cy2: number) => cx2 * 100003 + cy2;
    const free = (x0: number, y0: number, x1: number, y1: number) => {
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
        for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++)
          for (const r of taken.get(cellKey(gx, gy)) ?? []) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
      return true;
    };
    const take = (x0: number, y0: number, x1: number, y1: number) => {
      for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
        for (let gy = Math.floor(y0 / CELL); gy <= Math.floor(y1 / CELL); gy++) {
          const key = cellKey(gx, gy);
          (taken.get(key) ?? taken.set(key, []).get(key)!).push([x0, y0, x1, y1]);
        }
    };
    let budget = 900;
    for (const i of byImportance) {
      const special = isSpecial(i);
      const big = fadeOpt >= 0 && this.radius[i]! >= 11 * (this.opts.nodeScale ?? 1) && k > labelK * 0.45;
      let a = special ? 1 : big ? Math.max(fadeIn, 0.85) : fadeIn;
      if (!special && !lit(i)) a *= dimA;
      if (a < 0.05) continue;
      if (!special && budget-- <= 0) break;
      const X = sx(L.x[i]!);
      const Y = sy(L.y[i]!) + Math.max(1.6, this.radius[i]! * rs) + 4;
      let text = this.nodes[i]!.label;
      if (text.length > 32 && !special) text = `${text.slice(0, 30)}…`;
      const tw = g.measureText(text).width;
      const box = [X - tw / 2 - 2, Y - 1, X + tw / 2 + 2, Y + fontPx + 2] as const;
      if (!special && !free(...box)) continue;
      take(...box);
      g.globalAlpha = a;
      g.strokeStyle = c.bg;
      g.lineWidth = 3;
      g.strokeText(text, X, Y);
      g.fillStyle = c.ink;
      g.fillText(text, X, Y);
    }
    g.globalAlpha = 1;

    // nome das ligações acesas (Mundos)
    if (this.opts.edgeLabels && focus >= 0) {
      g.font = `10px ${c.mono}`;
      g.textBaseline = 'bottom';
      for (let e = 0; e < this.ea.length; e++) {
        const label = this.edges[e]!.label;
        if (!label || !isLitEdge(e)) continue;
        const a = this.ea[e]!;
        const b = this.eb[e]!;
        const X = (sx(L.x[a]!) + sx(L.x[b]!)) / 2;
        const Y = (sy(L.y[a]!) + sy(L.y[b]!)) / 2 - 3;
        g.strokeStyle = c.bg;
        g.lineWidth = 3;
        g.strokeText(label, X, Y);
        g.fillStyle = c.ember;
        g.fillText(label, X, Y);
      }
    }
    if (fading) this.draw();
  }

  /* ------------------------------------------------------------ gestos */

  private hit(px: number, py: number): number {
    const p = this.toWorld(px, py);
    const L = this.layout;
    const rs = Math.sqrt(this.cam.k);
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < L.size; i++) {
      const dx = L.x[i]! - p.x;
      const dy = L.y[i]! - p.y;
      const d = dx * dx + dy * dy;
      // raio na tela, com folga para o dedo
      const r = (Math.max(1.6, this.radius[i]! * rs) + 6) / this.cam.k;
      if (d < r * r && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private bind(): void {
    const c = this.canvas;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      cancelAnimationFrame(this.camAnim);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (this.drag && this.drag.node >= 0) this.layout.fixed[this.drag.node] = 0;
        this.drag = null;
        return;
      }
      const node = this.hit(p.x, p.y);
      if (node >= 0) {
        this.layout.fixed[node] = 1;
        this.drag = { node, sx: p.x, sy: p.y, moved: false, ox: this.layout.x[node]!, oy: this.layout.y[node]! };
      } else this.drag = { node: -1, sx: p.x, sy: p.y, moved: false, ox: this.cam.x, oy: this.cam.y };
    });
    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      if (!this.pointers.has(e.pointerId)) {
        if (e.pointerType !== 'mouse') return;
        const hv = this.hit(p.x, p.y);
        if (hv !== this.hover) {
          this.hover = hv;
          c.style.cursor = hv >= 0 ? 'pointer' : 'grab';
          this.updateFade();
          this.draw();
        }
        return;
      }
      const prev = this.pointers.get(e.pointerId)!;
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        if (d > 0) this.zoomAt(mid.x, mid.y, d / this.pinch);
        this.pinch = d;
        this.cam.x -= (p.x - prev.x) / 2 / this.cam.k;
        this.cam.y -= (p.y - prev.y) / 2 / this.cam.k;
        this.draw();
        return;
      }
      const d = this.drag;
      if (!d) return;
      if (Math.hypot(p.x - d.sx, p.y - d.sy) > 4) d.moved = true;
      if (!d.moved) return;
      if (d.node >= 0) {
        const w = this.toWorld(p.x, p.y);
        d.ox = w.x;
        d.oy = w.y;
        this.layout.x[d.node] = w.x;
        this.layout.y[d.node] = w.y;
        this.layout.alphaTarget = 0.25;
        this.layout.reheat(0.25);
        if (this.hover !== d.node) {
          this.hover = d.node;
          this.updateFade();
        }
        this.run();
      } else {
        this.cam.x = d.ox - (p.x - d.sx) / this.cam.k;
        this.cam.y = d.oy - (p.y - d.sy) / this.cam.k;
        this.draw();
      }
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const d = this.drag;
      if (!d || this.pointers.size) return;
      this.drag = null;
      this.layout.alphaTarget = 0;
      if (d.node >= 0) {
        this.layout.fixed[d.node] = 0;
        if (!d.moved) this.click(d.node);
        else this.run();
      } else if (!d.moved) this.click(-1);
      if (e.pointerType !== 'mouse') {
        this.hover = -1;
        this.updateFade();
        this.draw();
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      if (this.drag) return;
      this.hover = -1;
      this.updateFade();
      this.draw();
    });
    c.addEventListener('dblclick', (e) => {
      const p = local(e);
      const node = this.hit(p.x, p.y);
      if (node >= 0) this.opts.onOpen?.(this.nodes[node]!.id);
      else this.fit();
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e);
        this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
      },
      { passive: false },
    );
  }

  private click(node: number): void {
    this.selected = node === this.selected ? -1 : node;
    this.updateFade();
    this.draw();
    this.opts.onSelect?.(this.selected >= 0 ? this.nodes[this.selected]!.id : null);
  }

  private zoomAt(px: number, py: number, f: number): void {
    const before = this.toWorld(px, py);
    this.cam.k = Math.min(8, Math.max(0.03, this.cam.k * f));
    const after = this.toWorld(px, py);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.draw();
  }
}
