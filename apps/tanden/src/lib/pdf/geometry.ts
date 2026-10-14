import type { PdfAnnotation } from '@tanden/core';

// Contas de geometria das anotações, em pontos do PDF (origem embaixo à esquerda).

export type Rect = [number, number, number, number];

/** Junta os retângulos da seleção em um por linha (o navegador devolve um por pedaço de texto). */
export function mergeLineRects(rects: Rect[]): Rect[] {
  const sorted = rects
    .map(([a, b, c, d]) => [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)] as Rect)
    .filter(([x1, y1, x2, y2]) => x2 - x1 > 0.5 && y2 - y1 > 0.5)
    .sort((p, q) => q[3] - p[3] || p[0] - q[0]);
  const out: Rect[] = [];
  for (const r of sorted) {
    const h = r[3] - r[1];
    const line = out.find((o) => {
      const overlap = Math.min(o[3], r[3]) - Math.max(o[1], r[1]);
      const oh = o[3] - o[1];
      return overlap > Math.min(h, oh) * 0.5 && r[0] <= o[2] + Math.max(h, oh) * 1.2 && r[2] >= o[0] - Math.max(h, oh) * 1.2;
    });
    if (line) {
      line[0] = Math.min(line[0], r[0]);
      line[1] = Math.min(line[1], r[1]);
      line[2] = Math.max(line[2], r[2]);
      line[3] = Math.max(line[3], r[3]);
    } else out.push([...r]);
  }
  return out.sort((p, q) => q[3] - p[3] || p[0] - q[0]);
}

const inside = (x: number, y: number, [x1, y1, x2, y2]: number[], pad = 0) =>
  x >= Math.min(x1!, x2!) - pad && x <= Math.max(x1!, x2!) + pad && y >= Math.min(y1!, y2!) - pad && y <= Math.max(y1!, y2!) + pad;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Anotação sob o ponto (a de cima primeiro). `tol` em pontos do PDF. */
export function hitTest(list: PdfAnnotation[], x: number, y: number, tol: number): PdfAnnotation | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i]!;
    if (a.kind === 'note' && a.rects?.[0]) {
      const [nx, ny] = a.rects[0];
      if (inside(x, y, [nx!, ny! - 20, nx! + 20, ny!], tol)) return a;
    } else if (a.kind === 'box' && a.rects?.[0]) {
      const [x1, y1, x2, y2] = a.rects[0] as Rect;
      const onEdge = inside(x, y, a.rects[0], tol) && !inside(x, y, [x1 + tol, y1 + tol, x2 - tol, y2 - tol]);
      if (onEdge || (a.comment && inside(x, y, a.rects[0]))) return a;
    } else if (a.kind === 'ink' && a.ink) {
      for (const s of a.ink) {
        for (let k = 0; k + 3 < s.length; k += 2) if (segDist(x, y, s[k]!, s[k + 1]!, s[k + 2]!, s[k + 3]!) <= tol + (a.width ?? 2) / 2) return a;
        if (s.length === 2 && Math.hypot(x - s[0]!, y - s[1]!) <= tol + 2) return a;
      }
    } else if (a.rects?.some((r) => inside(x, y, r, tol * 0.3))) return a;
  }
  return null;
}

/** Simplifica um traço (Ramer–Douglas–Peucker) para o arquivo não crescer à toa. */
export function simplify(points: number[], eps = 0.6): number[] {
  if (points.length <= 4) return points;
  const n = points.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let dist = eps;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[2 * i]!, points[2 * i + 1]!, points[2 * a]!, points[2 * a + 1]!, points[2 * b]!, points[2 * b + 1]!);
      if (d > dist) [best, dist] = [i, d];
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(points[2 * i]! * 100) / 100, Math.round(points[2 * i + 1]! * 100) / 100);
  return out;
}

/** Normaliza para busca sem acento e sem maiúsculas, guardando de onde veio cada letra. */
export function foldWithMap(s: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const f = s[i]!.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let k = 0; k < f.length; k++) map.push(i);
    text += f;
  }
  map.push(s.length);
  return { text, map };
}

export const fold = (s: string): string => foldWithMap(s).text;

export const COLORS = [
  { hex: '#ffd400', name: 'Amarelo' },
  { hex: '#ff8a3d', name: 'Laranja' },
  { hex: '#7fd1a8', name: 'Verde' },
  { hex: '#6cb6ff', name: 'Azul' },
  { hex: '#f472b6', name: 'Rosa' },
  { hex: '#ff6b6b', name: 'Vermelho' },
];
