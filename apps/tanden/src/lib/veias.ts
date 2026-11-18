/*
 * Traçado das veias: caminhos retos, só na horizontal e na vertical, que correm
 * pelas bordas dos painéis (as linhas que já existem na tela) e nunca atravessam
 * o conteúdo. É um Dijkstra numa grade pequena feita das bordas de cada painel:
 * cada trecho custa o comprimento, cada curva custa caro, e um trecho que corta
 * o miolo de um painel é proibido.
 */

export interface Pt { x: number; y: number }
export interface Box { left: number; top: number; right: number; bottom: number }

/** quanto o miolo de um painel encolhe: a borda e uma faixa fina dela ficam livres */
const PAD = 3;
/** custo de uma curva, em pixels: prefere um caminho um pouco mais longo e mais reto */
const BEND = 40;
/** quanto pesa chegar longe do ponto preferido do painel de destino */
const DRIFT = 0.35;

const uniq = (list: number[]) => [...new Set(list.map((v) => Math.round(v * 2) / 2))].sort((a, b) => a - b);

/** O trecho passa pelo miolo de algum obstáculo? */
function blocked(a: Pt, b: Pt, obs: Box[]): boolean {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return obs.some((o) => x0 < o.right && x1 > o.left && y0 < o.bottom && y1 > o.top);
}

const onBorder = (p: Pt, r: Box) =>
  ((p.x === r.left || p.x === r.right) && p.y >= r.top && p.y <= r.bottom)
  || ((p.y === r.top || p.y === r.bottom) && p.x >= r.left && p.x <= r.right);

/**
 * Pontos de virada do caminho de `start` até a borda de `target`, ou null se
 * não houver caminho limpo. `prefer` é onde a veia idealmente encosta.
 */
export function route(start: Pt, target: Box, prefer: Pt, panels: Box[], size: { w: number; h: number }): Pt[] | null {
  const clampX = (v: number) => Math.max(1, Math.min(size.w - 1, v));
  const clampY = (v: number) => Math.max(1, Math.min(size.h - 1, v));
  const t: Box = { left: clampX(target.left), right: clampX(target.right), top: clampY(target.top), bottom: clampY(target.bottom) };
  const all = [...panels, t];
  // o painel onde a veia nasce não é obstáculo (ela precisa sair dele)
  const obs = all
    .filter((r) => !(start.x > r.left && start.x < r.right && start.y > r.top && start.y < r.bottom))
    .map((r) => ({ left: r.left + PAD, right: r.right - PAD, top: r.top + PAD, bottom: r.bottom - PAD }))
    .filter((r) => r.right > r.left && r.bottom > r.top);
  const xs = uniq([start.x, clampX(prefer.x), 1, size.w - 1, ...all.flatMap((r) => [clampX(r.left), clampX(r.right)])]);
  const ys = uniq([start.y, clampY(prefer.y), 1, size.h - 1, ...all.flatMap((r) => [clampY(r.top), clampY(r.bottom)])]);
  const W = xs.length, H = ys.length;
  const at = (i: number, j: number): Pt => ({ x: xs[i]!, y: ys[j]! });
  const si = xs.indexOf(Math.round(start.x * 2) / 2), sj = ys.indexOf(Math.round(start.y * 2) / 2);
  if (si < 0 || sj < 0) return null;

  // estado: nó + direção de chegada (0 →, 1 ←, 2 ↓, 3 ↑, 4 nenhuma)
  const N = W * H * 5;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const key = (i: number, j: number, d: number) => (j * W + i) * 5 + d;
  const startKey = key(si, sj, 4);
  cost[startKey] = 0;
  const STEPS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let best = -1;
  let bestTotal = Infinity;
  // a grade é pequena (dezenas de nós): uma busca linear pelo menor basta
  for (;;) {
    let k = -1;
    let c = Infinity;
    for (let n = 0; n < N; n++) if (!done[n] && cost[n]! < c) { c = cost[n]!; k = n; }
    if (k < 0 || c >= bestTotal) break;
    done[k] = 1;
    const d = k % 5, node = (k - d) / 5, i = node % W, j = (node - i) / W;
    const p = at(i, j);
    if (k !== startKey && onBorder(p, t)) {
      const total = c + DRIFT * (Math.abs(p.x - prefer.x) + Math.abs(p.y - prefer.y));
      if (total < bestTotal) { bestTotal = total; best = k; }
      continue; // chegou: a veia não atravessa o destino
    }
    STEPS.forEach(([di, dj], nd) => {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) return;
      const q = at(ni, nj);
      if (blocked(p, q, obs)) return;
      const step = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + (d !== 4 && d !== nd ? BEND : 0);
      const nk = key(ni, nj, nd);
      if (c + step < cost[nk]!) { cost[nk] = c + step; prev[nk] = k; }
    });
  }
  if (best < 0) return null;
  const pts: Pt[] = [];
  for (let k = best; k >= 0; k = prev[k]!) {
    const node = (k - (k % 5)) / 5;
    pts.unshift(at(node % W, (node - (node % W)) / W));
  }
  return simplify(pts);
}

/** Tira pontos repetidos e os do meio de uma reta. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const a = out.at(-2), b = out.at(-1);
    if (b && b.x === p.x && b.y === p.y) continue;
    if (a && b && ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Caminho SVG com as quinas arredondadas. */
export function roundedPath(pts: Pt[], radius = 10): string {
  if (pts.length < 2) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!;
    const lin = Math.hypot(b.x - a.x, b.y - a.y), lout = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    const p1 = { x: b.x - ((b.x - a.x) / lin) * r, y: b.y - ((b.y - a.y) / lin) * r };
    const p2 = { x: b.x + ((c.x - b.x) / lout) * r, y: b.y + ((c.y - b.y) / lout) * r };
    d += ` L${f(p1.x)},${f(p1.y)} Q${f(b.x)},${f(b.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  const z = pts.at(-1)!;
  return `${d} L${f(z.x)},${f(z.y)}`;
}
