import type { CanvasEdge, CanvasNode, InkStroke } from '@tanden/core';

// Geometria dos quadros: âncoras das setas, traços, formas e o layout do mapa mental.

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Pt = { x: number; y: number };
export type Box = Pick<CanvasNode, 'x' | 'y' | 'width' | 'height'>;

/** Paleta do JSON Canvas ("1" a "6") traduzida para o tema Núcleo. */
export const PALETTE: Record<string, string> = {
  '1': '#ff6b6b',
  '2': '#ff8a3d',
  '3': '#f2c55c',
  '4': '#7fd1a8',
  '5': '#6cc6e0',
  '6': '#b292f0',
};
export const colorOf = (c: string | undefined): string | undefined => (c ? (PALETTE[c] ?? c) : undefined);

export const center = (b: Box): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

export function anchor(b: Box, side: Side): Pt {
  switch (side) {
    case 'top': return { x: b.x + b.width / 2, y: b.y };
    case 'bottom': return { x: b.x + b.width / 2, y: b.y + b.height };
    case 'left': return { x: b.x, y: b.y + b.height / 2 };
    case 'right': return { x: b.x + b.width, y: b.y + b.height / 2 };
  }
}

const normal: Record<Side, Pt> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** Lado de `a` que olha para `b`. */
export function facing(a: Box, b: Box): Side {
  const ca = center(a), cb = center(b);
  const dx = (cb.x - ca.x) / Math.max(1, a.width + b.width), dy = (cb.y - ca.y) / Math.max(1, a.height + b.height);
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
}

/** Curva da seta entre duas caixas, nos lados gravados ou nos que se olham. */
export function edgePath(e: CanvasEdge, from: Box, to: Box): { d: string; a: Pt; b: Pt; mid: Pt; angle: number } {
  const fs = (e.fromSide as Side | undefined) ?? facing(from, to);
  const ts = (e.toSide as Side | undefined) ?? facing(to, from);
  const a = anchor(from, fs), tip = anchor(to, ts);
  // a ponta para um pouco antes da borda, para não sumir debaixo dela
  const b = { x: tip.x + normal[ts].x * 3, y: tip.y + normal[ts].y * 3 };
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const k = Math.min(160, Math.max(30, dist * 0.45));
  const c1 = { x: a.x + normal[fs].x * k, y: a.y + normal[fs].y * k };
  const c2 = { x: b.x + normal[ts].x * k, y: b.y + normal[ts].y * k };
  // ponto do meio da curva de Bézier (t = 0,5), para o rótulo
  const mid = { x: (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8, y: (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8 };
  const angle = Math.atan2(b.y - c2.y, b.x - c2.x);
  return { d: `M${a.x},${a.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${b.x},${b.y}`, a, b, mid, angle };
}

/** Ponta de seta como triângulo, na direção `angle`. */
export function arrowHead(p: Pt, angle: number, size = 9): string {
  const l = angle + Math.PI - 0.42, r = angle + Math.PI + 0.42;
  return `M${p.x},${p.y} L${p.x + Math.cos(l) * size},${p.y + Math.sin(l) * size} L${p.x + Math.cos(r) * size},${p.y + Math.sin(r) * size} Z`;
}

// ---------- traços ----------

export function strokePoints(s: Pick<InkStroke, 'points'>): Array<Pt & { p: number }> {
  const out: Array<Pt & { p: number }> = [];
  for (let i = 0; i + 1 < s.points.length; i += 3) out.push({ x: s.points[i]!, y: s.points[i + 1]!, p: s.points[i + 2] ?? 0.5 });
  return out;
}

/**
 * Contorno preenchido de um traço à mão, com a largura seguindo a pressão da
 * caneta (mesa digitalizadora). Sem pressão (mouse), a largura é constante.
 */
export function inkOutline(s: InkStroke): string {
  const pts = strokePoints(s);
  if (pts.length === 0) return '';
  const w = (p: number) => (s.width * (0.35 + p * 1.3)) / 2;
  if (pts.length === 1) {
    const { x, y, p } = pts[0]!;
    const r = w(p);
    return `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0`;
  }
  const left: Pt[] = [], right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!, next = pts[Math.min(pts.length - 1, i + 1)]!;
    let nx = -(next.y - prev.y), ny = next.x - prev.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const r = w(pts[i]!.p);
    left.push({ x: pts[i]!.x + nx * r, y: pts[i]!.y + ny * r });
    right.push({ x: pts[i]!.x - nx * r, y: pts[i]!.y - ny * r });
  }
  const smooth = (ps: Pt[]) => {
    let d = '';
    for (let i = 1; i < ps.length - 1; i++) {
      const m = { x: (ps[i]!.x + ps[i + 1]!.x) / 2, y: (ps[i]!.y + ps[i + 1]!.y) / 2 };
      d += ` Q${ps[i]!.x.toFixed(1)},${ps[i]!.y.toFixed(1)} ${m.x.toFixed(1)},${m.y.toFixed(1)}`;
    }
    const last = ps[ps.length - 1]!;
    return d + ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  };
  const back = right.reverse();
  const end = pts[pts.length - 1]!, start = pts[0]!;
  const re = w(end.p), rs = w(start.p);
  return `M${left[0]!.x.toFixed(1)},${left[0]!.y.toFixed(1)}${smooth(left)} A${re},${re} 0 0,1 ${back[0]!.x.toFixed(1)},${back[0]!.y.toFixed(1)}${smooth(back)} A${rs},${rs} 0 0,1 ${left[0]!.x.toFixed(1)},${left[0]!.y.toFixed(1)} Z`;
}

/** Desenho de uma forma técnica (linha, seta, retângulo, elipse) a partir de dois pontos. */
export function shapePath(s: InkStroke): string {
  const [x1 = 0, y1 = 0, , x2 = 0, y2 = 0] = s.points;
  switch (s.tool) {
    case 'line':
      return `M${x1},${y1} L${x2},${y2}`;
    case 'arrow': {
      const head = arrowHead({ x: x2, y: y2 }, Math.atan2(y2 - y1, x2 - x1), 6 + s.width * 3);
      return `M${x1},${y1} L${x2},${y2} ${head}`;
    }
    case 'rect': {
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      return `M${x},${y} h${Math.abs(x2 - x1)} v${Math.abs(y2 - y1)} h${-Math.abs(x2 - x1)} Z`;
    }
    case 'ellipse': {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
    }
    default:
      return '';
  }
}

/** Retângulo que contém o traço. */
export function strokeBox(s: InkStroke): Box {
  const pts = strokePoints(s);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Distância do ponto ao traço (para a borracha). */
export function strokeHit(s: InkStroke, p: Pt, radius: number): boolean {
  const pts = s.tool === 'pen' ? strokePoints(s) : shapeSamples(s);
  const r = radius + s.width;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[Math.min(i + 1, pts.length - 1)]!;
    if (segDist(p, a, b) <= r) return true;
  }
  return false;
}

function shapeSamples(s: InkStroke): Pt[] {
  const [x1 = 0, y1 = 0, , x2 = 0, y2 = 0] = s.points;
  if (s.tool === 'line' || s.tool === 'arrow') return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  if (s.tool === 'rect') return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 }];
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
  return Array.from({ length: 33 }, (_, i) => ({ x: cx + Math.cos((i / 32) * Math.PI * 2) * rx, y: cy + Math.sin((i / 32) * Math.PI * 2) * ry }));
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Ajuste de forma: um rabisco quase reto vira linha, um contorno fechado vira
 * retângulo ou elipse. Devolve null quando o traço não parece forma nenhuma.
 */
export function recognize(s: InkStroke): InkStroke | null {
  const pts = strokePoints(s);
  if (pts.length < 4) return null;
  const box = strokeBox(s);
  const size = Math.hypot(box.width, box.height);
  if (size < 24) return null;
  const first = pts[0]!, last = pts[pts.length - 1]!;
  let pathLen = 0;
  for (let i = 1; i < pts.length; i++) pathLen += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const chord = Math.hypot(last.x - first.x, last.y - first.y);

  // quase reto: o caminho mal passa do segmento entre as pontas
  if (chord / pathLen > 0.94) {
    const maxDev = Math.max(...pts.map((p) => segDist(p, first, last)));
    if (maxDev < Math.max(6, chord * 0.06)) return { ...s, tool: 'line', points: [first.x, first.y, 0.5, last.x, last.y, 0.5] };
  }
  // fechado: terminou perto de onde começou
  if (chord < size * 0.22 && box.width > 16 && box.height > 16) {
    // quanto do contorno corre colado à borda da caixa? retângulo ~ alto, elipse ~ baixo
    const edge = Math.min(box.width, box.height) * 0.12;
    const onBorder = pts.filter((p) =>
      Math.min(Math.abs(p.x - box.x), Math.abs(p.x - box.x - box.width), Math.abs(p.y - box.y), Math.abs(p.y - box.y - box.height)) < edge,
    ).length / pts.length;
    const tool = onBorder > 0.72 ? 'rect' : 'ellipse';
    return { ...s, tool, points: [box.x, box.y, 0.5, box.x + box.width, box.y + box.height, 0.5] };
  }
  return null;
}

/** Simplifica pontos muito próximos (traços de mesa digitalizadora geram muitos). */
export function thin(points: number[], minDist: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    const n = out.length;
    if (n >= 3 && Math.hypot(points[i]! - out[n - 3]!, points[i + 1]! - out[n - 2]!) < minDist && i < points.length - 3) continue;
    out.push(Math.round(points[i]! * 10) / 10, Math.round(points[i + 1]! * 10) / 10, Math.round((points[i + 2] ?? 0.5) * 100) / 100);
  }
  return out;
}

// ---------- mapa mental ----------

export interface Tree {
  root: string;
  children: Map<string, string[]>;
  parent: Map<string, string>;
}

/** Árvore do mapa a partir das setas (pai → filho). A raiz é quem não tem pai. */
export function treeOf(nodes: CanvasNode[], edges: CanvasEdge[], start: string): Tree {
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (!ids.has(e.fromNode) || !ids.has(e.toNode) || parent.has(e.toNode) || e.toNode === e.fromNode) continue;
    parent.set(e.toNode, e.fromNode);
    (children.get(e.fromNode) ?? children.set(e.fromNode, []).get(e.fromNode)!).push(e.toNode);
  }
  let root = start;
  const seen = new Set<string>();
  while (parent.has(root) && !seen.has(root)) {
    seen.add(root);
    root = parent.get(root)!;
  }
  return { root, children, parent };
}

/**
 * Organiza o mapa: filhos da raiz divididos entre direita e esquerda pelo
 * tamanho, cada subárvore empilhada sem sobrepor. Devolve as posições novas.
 */
export function layoutMindMap(nodes: CanvasNode[], edges: CanvasEdge[], start: string, gapX = 70, gapY = 18) {
  const tree = treeOf(nodes, edges, start);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = (id: string) => (tree.children.get(id) ?? []).filter((k) => byId.has(k));
  const heights = new Map<string, number>();
  const visiting = new Set<string>();
  const height = (id: string): number => {
    if (heights.has(id)) return heights.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const own = byId.get(id)!.height;
    const sub = kids(id).reduce((s, k, i) => s + height(k) + (i ? gapY : 0), 0);
    const h = Math.max(own, sub);
    heights.set(id, h);
    return h;
  };
  const out = new Map<string, { x: number; y: number; side: 'left' | 'right' }>();
  const root = byId.get(tree.root)!;
  out.set(root.id, { x: root.x, y: root.y, side: 'right' });

  // cada galho fica do lado em que já está; dentro do lado, na ordem de cima para baixo
  const byY = (ids: string[]) => [...ids].sort((a, b) => byId.get(a)!.y - byId.get(b)!.y);
  const rc = center(root);
  const rootKids = kids(root.id);
  const right = byY(rootKids.filter((k) => center(byId.get(k)!).x >= rc.x));
  const left = byY(rootKids.filter((k) => center(byId.get(k)!).x < rc.x));

  const place = (ids: string[], parentBox: Box, side: 'left' | 'right') => {
    const span = ids.reduce((s, k, i) => s + height(k) + (i ? gapY : 0), 0);
    let y = parentBox.y + parentBox.height / 2 - span / 2;
    for (const id of ids) {
      if (out.has(id)) continue;
      const n = byId.get(id)!;
      const h = height(id);
      const x = side === 'right' ? parentBox.x + parentBox.width + gapX : parentBox.x - gapX - n.width;
      const ny = y + h / 2 - n.height / 2;
      out.set(id, { x: Math.round(x), y: Math.round(ny), side });
      place(byY(kids(id)), { x, y: ny, width: n.width, height: n.height }, side);
      y += h + gapY;
    }
  };
  place(right, root, 'right');
  place(left, root, 'left');
  return out;
}

export const uid = (): string => Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
