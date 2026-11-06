/*
 * Terreno gerado pela semente: relevo, umidade, lagos e rios.
 *
 * O relevo é uma função contínua (dá para pedir detalhe em qualquer escala:
 * a tela usa isso para redesenhar a parte visível quando aproxima). Em cima
 * de uma grade, a hidrologia é calculada de verdade:
 *
 *  1. as depressões são preenchidas (priority-flood): toda gota de chuva tem
 *     um caminho até o mar, e o que ficou "afogado" vira lago;
 *  2. cada célula manda a água para o vizinho mais baixo e a vazão acumula
 *     morro abaixo;
 *  3. onde a vazão passa de um limite nasce um rio, que escava o leito e
 *     umedece as margens. Por isso os rios descem os vales que a pintura mostra.
 *
 * Mesma semente, mesmo mapa, em qualquer aparelho.
 */

export interface RiverSeg {
  /** pontos em % da largura (x) e da altura (y) */
  pts: Array<{ x: number; y: number }>;
  /** largura em % da altura do mapa (cresce com a vazão) */
  w: number;
}

export interface Terrain {
  seed: number;
  w: number;
  h: number;
  /** altura 0..1 por célula (linha a linha), já com o leito dos rios escavado */
  height: Float32Array;
  /** umidade 0..1 por célula */
  moisture: Float32Array;
  /** nível do mar (abaixo disso é água) */
  sea: number;
  /** 1 onde há lago */
  lake: Uint8Array;
  /** vazão acumulada (em células de chuva) */
  flow: Float32Array;
  /** vazão a partir da qual a célula é rio */
  riverMin: number;
  /** 1 colado no mar, caindo a 0 a poucas células da costa (onde o detalhe pode recortar a costa) */
  shore: Float32Array;
  /** rios em trechos de largura parecida, da nascente para a foz */
  rivers: RiverSeg[];
}

export interface TerrainOpts {
  /** fração do mapa coberta por mar (0,2 a 0,8; padrão 0,55) */
  sea?: number;
  /** densidade de rios: 0 (nenhum) a 3 (muitos); padrão 1 */
  rivers?: number;
}

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const SEA = 0.42;

// ------------------------------------------------------------------ ruído

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ruído de valor sem repetição (hash por canto), interpolação quíntica. 0..1. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, oct: number, from = 0): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < from + oct; o++) {
    if (o >= from) {
      s += amp * noise(x * f, y * f, seed + o * 101);
      norm += amp;
    }
    amp *= 0.5;
    f *= 2.07;
  }
  return s / norm;
}

/** Cristas: 1 − |ruído| ao quadrado, para cordilheiras com espinhaço. */
function ridged(x: number, y: number, seed: number, oct: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  let w = 1;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(noise(x * f, y * f, seed + o * 131) * 2 - 1);
    n *= n * w;
    w = clamp(n * 1.6, 0, 1);
    s += amp * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.13;
  }
  return s / norm;
}

const smooth = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/**
 * Altura "crua" num ponto (u, v de 0 a 1), antes de achar o nível do mar.
 * `aspect` = largura / altura do mapa (o ruído não estica).
 */
function rawHeight(u: number, v: number, seed: number, aspect: number): number {
  const S = 2.6;
  const X = u * aspect * S;
  const Y = v * S;
  // o espaço é torcido por outro ruído: costas e vales menos "redondos"
  const qx = fbm(X + 5.2, Y + 1.3, seed + 11, 4) - 0.5;
  const qy = fbm(X + 1.7, Y + 9.2, seed + 23, 4) - 0.5;
  const wx = X + qx * 1.5;
  const wy = Y + qy * 1.5;
  const base = fbm(wx, wy, seed, 6);
  // cordilheiras só onde a "zona de montanha" deixa
  const zone = smooth(0.48, 0.68, fbm(wx * 0.55 + 40, wy * 0.55 + 7, seed + 37, 3));
  const ridge = ridged(wx * 1.4 + 3, wy * 1.4 + 8, seed + 53, 5);
  // borda vira mar: distância "quadrada arredondada" ao centro, com a forma torcida
  const nx = (u - 0.5) * 2 + qx * 0.5;
  const ny = (v - 0.5) * 2 + qy * 0.5;
  const d = Math.min(1.4, Math.pow(Math.pow(Math.abs(nx), 3) + Math.pow(Math.abs(ny), 3), 1 / 3));
  return base * 0.9 + ridge * zone * 0.42 - d * d * 0.62;
}

/** Detalhe fino (−1..1) para desenhar perto: costas recortadas e textura do chão. */
export function terrainDetail(seed: number, u: number, v: number, aspect: number, freq = 160): number {
  return fbm(u * aspect * freq, v * freq, seed + 997, 3) * 2 - 1;
}

// ------------------------------------------------------------------ fila de prioridade (heap binário)

class Heap {
  private idx: Int32Array;
  private key: Float32Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.key = new Float32Array(cap);
  }
  push(i: number, k: number): void {
    let n = this.size++;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (this.key[p]! <= k) break;
      this.idx[n] = this.idx[p]!;
      this.key[n] = this.key[p]!;
      n = p;
    }
    this.idx[n] = i;
    this.key[n] = k;
  }
  pop(): number {
    const top = this.idx[0]!;
    const li = this.idx[--this.size]!;
    const lk = this.key[this.size]!;
    let n = 0;
    for (;;) {
      let c = 2 * n + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.key[c + 1]! < this.key[c]!) c++;
      if (this.key[c]! >= lk) break;
      this.idx[n] = this.idx[c]!;
      this.key[n] = this.key[c]!;
      n = c;
    }
    this.idx[n] = li;
    this.key[n] = lk;
    return top;
  }
}

const DX = [1, -1, 0, 0, 1, -1, 1, -1];
const DY = [0, 0, 1, -1, 1, -1, -1, 1];
const DD = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

// ------------------------------------------------------------------ geração

/** Cache das últimas grades (gerar custa algumas centenas de ms). */
const cache = new Map<string, Terrain>();

export function generateTerrain(seed: number, w = 720, h = 480, opts: TerrainOpts = {}): Terrain {
  const key = `${seed}:${w}:${h}:${opts.sea ?? ''}:${opts.rivers ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = build(seed, w, h, opts);
  cache.set(key, t);
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  return t;
}

function build(seed: number, w: number, h: number, opts: TerrainOpts): Terrain {
  const N = w * h;
  const aspect = w / h;
  const raw = new Float32Array(N);
  const moisture = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      raw[y * w + x] = rawHeight(u, v, seed, aspect);
      moisture[y * w + x] = fbm(u * aspect * 3.2 + 31, v * 3.2 + 17, seed + 71, 5);
    }
  }

  // nível do mar pela fração de mar pedida; terra e mar reescalados para 0..1
  const seaFrac = clamp(opts.sea ?? 0.55, 0.2, 0.85);
  const sorted = Float32Array.from(raw).sort();
  const lo = sorted[0]!;
  const hi = sorted[N - 1]!;
  const qs = sorted[Math.floor(seaFrac * (N - 1))]!;
  const height = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = raw[i]!;
    height[i] = r < qs
      ? SEA * Math.pow((r - lo) / Math.max(1e-6, qs - lo), 1.4)
      : SEA + (1 - SEA) * Math.pow((r - qs) / Math.max(1e-6, hi - qs), 1.5);
  }

  // mar "de verdade" é o que toca a borda; bacias abaixo do nível do mar no interior viram lago
  const ocean = new Uint8Array(N);
  {
    const st: number[] = [];
    for (let i = 0; i < N; i++) {
      const x = i % w;
      const y = (i / w) | 0;
      if (height[i]! < SEA && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) {
        ocean[i] = 1;
        st.push(i);
      }
    }
    while (st.length) {
      const i = st.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k]!;
        const ny = y + DY[k]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!ocean[j] && height[j]! < SEA) {
          ocean[j] = 1;
          st.push(j);
        }
      }
    }
  }
  const inland = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (height[i]! < SEA && !ocean[i]) {
      inland[i] = 1;
      height[i] = SEA + 0.0005;
    }
  }

  // 1. preencher depressões a partir do mar e das bordas
  const filled = Float32Array.from(height);
  const seen = new Uint8Array(N);
  const order = new Int32Array(N);
  let n = 0;
  const heap = new Heap(N);
  for (let i = 0; i < N; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    if (height[i]! < SEA || x === 0 || y === 0 || x === w - 1 || y === h - 1) {
      seen[i] = 1;
      heap.push(i, filled[i]!);
    }
  }
  const EPS = 1e-5;
  while (heap.size) {
    const i = heap.pop();
    order[n++] = i;
    const x = i % w;
    const y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k]!;
      const ny = y + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j]) continue;
      seen[j] = 1;
      if (filled[j]! <= filled[i]!) filled[j] = filled[i]! + EPS;
      heap.push(j, filled[j]!);
    }
  }
  // lago: depressão preenchida; as pequenas demais (um poço de poucas células) viram terra de novo
  const lake = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (height[i]! >= SEA && filled[i]! - height[i]! > 0.003) lake[i] = 1;
  dropSmall(lake, w, h, Math.max(6, Math.round(N / 14000)), (i) => filled[i]! - height[i]! + (inland[i] ? 1 : 0), 0.01);

  // 2. para onde cada célula escoa (o vizinho mais íngreme na superfície preenchida)
  const down = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (height[i]! < SEA) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let best = -1;
    let slope = 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k]!;
      const ny = y + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      const s = (filled[i]! - filled[j]!) / DD[k]!;
      if (s > slope) {
        slope = s;
        best = j;
      }
    }
    down[i] = best;
  }

  // vazão: do mais alto para o mais baixo (a ordem do preenchimento ao contrário)
  const flow = new Float32Array(N);
  for (let i = 0; i < N; i++) if (height[i]! >= SEA) flow[i] = 0.4 + moisture[i]! * 1.2;
  for (let o = n - 1; o >= 0; o--) {
    const i = order[o]!;
    const d = down[i]!;
    if (d >= 0) flow[d]! += flow[i]!;
  }

  // 3. rios: limite proporcional ao tamanho da grade (a mesma semente dá os mesmos rios em qualquer resolução)
  const dens = clamp(opts.rivers ?? 1, 0, 3);
  const riverMin = dens <= 0 ? Infinity : (N / 900) / dens;
  for (let i = 0; i < N; i++) {
    const f = flow[i]!;
    if (f < riverMin || height[i]! < SEA || lake[i]) continue;
    // leito escavado (sem virar mar) e margens úmidas
    const cut = Math.min(0.03, 0.006 * Math.log2(f / riverMin + 1));
    height[i] = Math.max(SEA + 0.004, height[i]! - cut);
    const x = i % w;
    const y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k]!;
      const ny = y + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      moisture[j] = Math.min(1, moisture[j]! + 0.05);
    }
    moisture[i] = Math.min(1, moisture[i]! + 0.12);
  }
  for (let i = 0; i < N; i++) if (lake[i]) moisture[i] = 1;

  // perto do mar: o desenho de perto pode recortar a costa ali (e só ali)
  const shore = new Float32Array(N);
  for (let i = 0; i < N; i++) shore[i] = ocean[i] ? 1 : 0;
  blur(shore, w, h, 3);
  blur(shore, w, h, 3);
  for (let i = 0; i < N; i++) shore[i] = Math.min(1, shore[i]! * 2.5);

  return { seed, w, h, height, moisture, sea: SEA, lake, flow, riverMin, shore, rivers: traceRivers(w, h, height, lake, flow, down, riverMin) };
}

/** Média numa caixa (2r+1)², em duas passadas. */
export function blur(a: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w) continue;
        s += a[y * w + xx]!;
        n++;
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h) continue;
        s += tmp[yy * w + x]!;
        n++;
      }
      a[y * w + x] = s / n;
    }
  }
}

/** Apaga manchas (componentes de 8 vizinhos) com menos de `min` células. */
function dropSmall(mask: Uint8Array, w: number, h: number, min: number, depth?: (i: number) => number, minDepth = 0): void {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const comp: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    comp.length = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i / w) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k]!;
        const ny = y + DY[k]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    let deep = depth ? 0 : Infinity;
    if (depth) for (const i of comp) deep = Math.max(deep, depth(i));
    if (comp.length < min || deep < minDepth) for (const i of comp) mask[i] = 0;
  }
}

function traceRivers(w: number, h: number, height: Float32Array, lake: Uint8Array, flow: Float32Array, down: Int32Array, min: number): RiverSeg[] {
  const N = w * h;
  const isRiver = (i: number) => flow[i]! >= min && height[i]! >= SEA;
  // nascentes: células de rio sem nenhum rio chegando nelas
  const fed = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isRiver(i) && down[i]! >= 0) fed[down[i]!] = 1;
  const done = new Uint8Array(N);
  const out: RiverSeg[] = [];
  const pt = (i: number) => ({ x: (((i % w) + 0.5) / w) * 100, y: ((((i / w) | 0) + 0.5) / h) * 100 });
  // largura em % da altura: um fio na nascente, ~0,6% no rio grande
  const width = (f: number) => {
    const r = Math.sqrt(f / min);
    return r < 1.6 ? 0.1 : r < 2.6 ? 0.16 : r < 4 ? 0.24 : r < 6.5 ? 0.34 : r < 10 ? 0.46 : 0.6;
  };
  const sources: number[] = [];
  for (let i = 0; i < N; i++) if (isRiver(i) && !fed[i] && !lake[i]) sources.push(i);
  // os maiores primeiro (o tronco desenhado antes dos afluentes)
  sources.sort((a, b) => flow[b]! - flow[a]!);
  // nascente: sobe o vale pelo afluente de maior vazão até a água ficar pouca (um fio fino)
  const head = (s: number): Array<{ x: number; y: number }> => {
    const pts: Array<{ x: number; y: number }> = [];
    let i = s;
    for (let n = 0; n < 40; n++) {
      const x = i % w;
      const y = (i / w) | 0;
      let best = -1;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k]!;
        const ny = y + DY[k]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (down[j] === i && !lake[j] && (best < 0 || flow[j]! > flow[best]!)) best = j;
      }
      if (best < 0 || flow[best]! < min / 5) break;
      pts.unshift(pt(best));
      i = best;
    }
    return pts;
  };
  for (const s of sources) {
    const nasc = head(s);
    if (nasc.length > 1) out.push({ pts: [...nasc, pt(s)], w: 0.06 });
    let i = s;
    let seg: RiverSeg | null = null;
    let prev = -1;
    for (let guard = 0; guard < N; guard++) {
      if (done[i] && i !== s) {
        // encontrou outro rio: vira afluente (termina no ponto do tronco, com a própria largura)
        if (seg) seg.pts.push(pt(i));
        else if (prev >= 0) seg = { pts: [pt(prev), pt(i)], w: width(flow[prev]!) };
        break;
      }
      if (lake[i]) {
        // entra no lago: o trecho acaba na margem e recomeça na saída
        if (seg && seg.pts.length > 1) out.push(seg);
        seg = null;
      } else {
        const wd = width(flow[i]!);
        if (!seg || seg.w !== wd) {
          if (seg && seg.pts.length > 1) out.push(seg);
          seg = { pts: prev >= 0 ? [pt(prev)] : [], w: wd };
        }
        seg.pts.push(pt(i));
      }
      done[i] = 1;
      const d = down[i]!;
      if (d < 0 || height[i]! < SEA) break;
      prev = i;
      i = d;
      if (height[i]! < SEA) {
        // foz: um passo dentro do mar, para encostar na costa
        seg?.pts.push(pt(i));
        break;
      }
    }
    if (seg && seg.pts.length > 1) out.push(seg);
  }
  return out.map((r) => ({ ...r, pts: chaikin(relax(relax(r.pts))) }));
}

/** Média móvel de 3 pontos (pontas fixas): desfaz a escadinha das 8 direções. */
function relax(p: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (p.length < 3) return p;
  return p.map((q, i) => (i === 0 || i === p.length - 1 ? q : { x: (p[i - 1]!.x + q.x * 2 + p[i + 1]!.x) / 4, y: (p[i - 1]!.y + q.y * 2 + p[i + 1]!.y) / 4 }));
}

/** Suaviza a linha de células em curva (duas voltas de Chaikin), mantendo as pontas. */
function chaikin(p: Array<{ x: number; y: number }>, rounds = 2): Array<{ x: number; y: number }> {
  let pts = p;
  for (let r = 0; r < rounds && pts.length > 2; r++) {
    const next = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts.map((q) => ({ x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000 }));
}

// ------------------------------------------------------------------ leitura

/** Altura interpolada (bilinear) num ponto u, v de 0 a 1. */
export function heightAt(t: Terrain, u: number, v: number): number {
  return bilinear(t.height, t.w, t.h, u, v);
}
export function moistureAt(t: Terrain, u: number, v: number): number {
  return bilinear(t.moisture, t.w, t.h, u, v);
}
/** Lago suavizado (0..1): a margem sai redonda em vez de serrilhada. */
const lakeSoft = new WeakMap<Terrain, Float32Array>();
export function lakeAt(t: Terrain, u: number, v: number): number {
  let soft = lakeSoft.get(t);
  if (!soft) {
    soft = Float32Array.from(t.lake);
    blur(soft, t.w, t.h, 1);
    lakeSoft.set(t, soft);
  }
  return bilinear(soft, t.w, t.h, u, v);
}
export function shoreAt(t: Terrain, u: number, v: number): number {
  return bilinear(t.shore, t.w, t.h, u, v);
}

function bilinear(a: ArrayLike<number>, w: number, h: number, u: number, v: number): number {
  const fx = clamp(u * w - 0.5, 0, w - 1);
  const fy = clamp(v * h - 0.5, 0, h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const p = a[y0 * w + x0]!;
  const q = a[y0 * w + x1]!;
  const r = a[y1 * w + x0]!;
  const s = a[y1 * w + x1]!;
  return (p + (q - p) * tx) * (1 - ty) + (r + (s - r) * tx) * ty;
}

export type Biome = 'fundo' | 'mar' | 'lago' | 'praia' | 'deserto' | 'campo' | 'floresta' | 'pantano' | 'colina' | 'montanha' | 'neve';

/** Bioma pela altura e umidade. */
export function biomeOf(e: number, m: number, sea = SEA, isLake = false): Biome {
  if (isLake) return 'lago';
  if (e < sea - 0.12) return 'fundo';
  if (e < sea) return 'mar';
  if (e < sea + 0.012) return 'praia';
  if (e > 0.9) return 'neve';
  if (e > 0.76) return 'montanha';
  if (e > 0.63) return 'colina';
  if (m < 0.36) return 'deserto';
  if (m > 0.64 && e < sea + 0.07) return 'pantano';
  if (m > 0.5) return 'floresta';
  return 'campo';
}

/** Bioma de uma célula. */
export function biomeAt(t: Terrain, x: number, y: number): Biome {
  const i = y * t.w + x;
  return biomeOf(t.height[i]!, t.moisture[i]!, t.sea, !!t.lake[i]);
}

/** Bioma num ponto em % (para o texto do marcador: "fica numa floresta"). */
export const biomeAtPercent = (t: Terrain, px: number, py: number): Biome =>
  biomeAt(t, clamp(Math.floor((px / 100) * t.w), 0, t.w - 1), clamp(Math.floor((py / 100) * t.h), 0, t.h - 1));

/** Há água (mar, lago ou rio) a até `r` % do ponto? Serve para dizer que um lugar é porto. */
export function nearWater(t: Terrain, px: number, py: number, r = 1.2): 'mar' | 'lago' | 'rio' | null {
  const cx = Math.floor((px / 100) * t.w);
  const cy = Math.floor((py / 100) * t.h);
  const rad = Math.max(1, Math.round((r / 100) * t.h));
  let found: 'mar' | 'lago' | 'rio' | null = null;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= t.w || y >= t.h || dx * dx + dy * dy > rad * rad) continue;
      const i = y * t.w + x;
      if (t.height[i]! < t.sea) return 'mar';
      if (t.lake[i]) found = 'lago';
      else if (!found && t.flow[i]! >= t.riverMin * 4) found = 'rio';
    }
  }
  return found;
}

// ------------------------------------------------------------------ estradas

/**
 * Caminho por terra entre dois pontos (em %), evitando água e montanha: A*
 * numa grade mais grossa que a do terreno. Atravessa rios (pontes) com custo.
 * Devolve a linha em %, ou a reta se não achar caminho.
 */
export function roadPath(t: Terrain, a: { x: number; y: number }, b: { x: number; y: number }, step = 3): Array<{ x: number; y: number }> {
  const gw = Math.max(2, Math.floor(t.w / step));
  const gh = Math.max(2, Math.floor(t.h / step));
  const cell = (p: { x: number; y: number }) => clamp(Math.floor((p.y / 100) * gh), 0, gh - 1) * gw + clamp(Math.floor((p.x / 100) * gw), 0, gw - 1);
  const hAt = (gx: number, gy: number) => t.height[Math.min(t.h - 1, gy * step + (step >> 1)) * t.w + Math.min(t.w - 1, gx * step + (step >> 1))]!;
  const cost = (gx: number, gy: number): number => {
    const i = Math.min(t.h - 1, gy * step + (step >> 1)) * t.w + Math.min(t.w - 1, gx * step + (step >> 1));
    const e = t.height[i]!;
    if (e < t.sea || t.lake[i]) return Infinity;
    let c = 1;
    if (e > 0.76) c += 14;
    else if (e > 0.64) c += 3;
    if (t.flow[i]! >= t.riverMin) c += 6; // ponte
    return c;
  };
  const start = cell(a);
  const goal = cell(b);
  const gx = goal % gw;
  const gy = (goal / gw) | 0;
  const G = new Float32Array(gw * gh).fill(Infinity);
  const from = new Int32Array(gw * gh).fill(-1);
  const heap = new Heap(gw * gh * 8);
  G[start] = 0;
  heap.push(start, 0);
  let budget = gw * gh * 4;
  while (heap.size && budget-- > 0) {
    const i = heap.pop();
    if (i === goal) break;
    const x = i % gw;
    const y = (i / gw) | 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX[k]!;
      const ny = y + DY[k]!;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const j = ny * gw + nx;
      const c = j === goal ? 1 : cost(nx, ny);
      if (!Number.isFinite(c)) continue;
      const slope = Math.abs(hAt(nx, ny) - hAt(x, y)) * 60;
      const g = G[i]! + (c + slope) * DD[k]!;
      if (g >= G[j]!) continue;
      G[j] = g;
      from[j] = i;
      heap.push(j, g + Math.hypot(nx - gx, ny - gy));
    }
  }
  if (from[goal]! < 0 && goal !== start) return [a, b];
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = goal; i >= 0; i = from[i]!) {
    pts.push({ x: (((i % gw) + 0.5) / gw) * 100, y: ((((i / gw) | 0) + 0.5) / gh) * 100 });
    if (i === start) break;
  }
  pts.reverse();
  pts[0] = a;
  pts[pts.length - 1] = b;
  return chaikin(simplify(pts), 2);
}

/** Tira pontos em linha reta (a grade dá escadinha). */
function simplify(p: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (p.length < 3) return p;
  const out = [p[0]!];
  for (let i = 1; i < p.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(cross) > 0.02) out.push(b);
  }
  out.push(p[p.length - 1]!);
  return out;
}
