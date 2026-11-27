/*
 * O classificador de intenções da Ânima: um fastText escrito à mão.
 *
 *   texto → características (palavras, pares de palavras, pedaços de 3 e 4
 *   letras, marcas) → cada uma vira um número por hash → a média dos vetores
 *   dessas linhas (embedding bag) → [camada oculta opcional] → softmax
 *
 * Os pedaços de letras são o que deixa ela entender "abri", "abra", "abree"
 * como a mesma coisa e sobreviver a erro de digitação; os pares de palavras
 * guardam um pouco de ordem ("não quero" ≠ "quero").
 *
 * Treino: SGD com taxa que cai em linha reta (como o fastText), entropia
 * cruzada, tudo determinístico com semente. Depois do treino:
 *   1. corte: só as K linhas de maior norma sobrevivem, e o modelo treina
 *      mais um pouco só com elas (o resto do hash vira zero);
 *   2. quantização de produto: cada vetor é cortado em pedaços de 4 números e
 *      cada pedaço vira o índice (1 byte) do centróide mais perto, achado por
 *      k-médias. 32 floats (128 bytes) viram 8 bytes;
 *   3. temperatura: um número que calibra a confiança no conjunto de validação,
 *      para "70% de certeza" querer dizer 70% de acerto.
 *
 * O mesmo formato aceita uma camada oculta (treinada na GPU, ver
 * scripts/anima-cerebro/treinar.py), e a inferência aqui roda os dois.
 */
import type { Texto } from './texto';

// ------------------------------------------------------------------ características

/** FNV-1a de 32 bits sobre as unidades UTF-16 (rápido; o texto já vem dobrado). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export const numeroTok = (w: string) => (/^\d+([.,]\d+)?$/.test(w) ? '<num>' : w);

/** As características de um texto, como strings (para depurar) . */
export function caracteristicas(t: Texto): string[] {
  const toks = t.tokens.map(numeroTok);
  const out: string[] = [];
  const n = toks.length;
  for (let i = 0; i < n; i++) {
    const w = toks[i]!;
    out.push(`w:${w}`);
    out.push(`b:${i === 0 ? '^' : toks[i - 1]}_${w}`);
    if (w.length >= 3 && w !== '<num>') {
      const g = `<${w}>`;
      for (let k = 3; k <= 4; k++) for (let j = 0; j + k <= g.length; j++) out.push(`c:${g.slice(j, j + k)}`);
    }
  }
  if (n) out.push(`b:${toks[n - 1]}_$`);
  if (n >= 1) out.push(`p:${toks[0]}`);
  if (n >= 2) out.push(`p2:${toks[0]}_${toks[1]}`);
  for (const m of t.marcas) out.push(`m:${m}`);
  out.push(`n:${n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : n <= 10 ? 10 : 99}`);
  return out;
}

/** Os índices (únicos, ordenados) das características num espaço de `buckets`. */
export function indices(t: Texto, buckets: number): Uint32Array {
  const set = new Set<number>();
  for (const c of caracteristicas(t)) set.add(hash32(c) % buckets);
  return Uint32Array.from([...set].sort((a, b) => a - b));
}

// ------------------------------------------------------------------ modelo

export interface Modelo {
  v: 1;
  rotulos: string[];
  buckets: number;
  dim: number;
  /** neurônios da camada oculta (0 = linear, como o fastText) */
  oculta: number;
  /** temperatura do softmax (calibração) */
  T: number;
  /** linhas que existem (ordenadas) e o vetor de cada uma */
  linhas: LinhasEmb;
  W1: Float32Array | null;
  b1: Float32Array | null;
  /** saída: rotulos.length × (oculta || dim) */
  W: Float32Array;
  b: Float32Array;
}

/** As linhas do embedding: densas (treino) ou quantizadas por produto (o que vai no app). */
export type LinhasEmb =
  | { tipo: 'densa'; idx: Uint32Array; vet: Float32Array }
  | { tipo: 'pq'; idx: Uint32Array; sub: number; codigos: Uint8Array; centroides: Float32Array };

export interface Previsao {
  rotulo: string;
  p: number;
  top: Array<[string, number]>;
  /** quantas características o modelo conhecia */
  conhecidas: number;
}

function busca(idx: Uint32Array, x: number): number {
  let lo = 0, hi = idx.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    const v = idx[m]!;
    if (v === x) return m;
    if (v < x) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

/** Soma o vetor da linha `r` em `acc`. */
function somarLinha(L: LinhasEmb, dim: number, r: number, acc: Float32Array): void {
  if (L.tipo === 'densa') {
    const o = r * dim;
    for (let k = 0; k < dim; k++) acc[k]! += L.vet[o + k]!;
    return;
  }
  const nsub = dim / L.sub;
  for (let s = 0; s < nsub; s++) {
    const c = L.codigos[r * nsub + s]!;
    const base = (s * 256 + c) * L.sub;
    for (let k = 0; k < L.sub; k++) acc[s * L.sub + k]! += L.centroides[base + k]!;
  }
}

function softmax(z: Float32Array, T = 1): Float32Array {
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  let soma = 0;
  const out = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) soma += out[i] = Math.exp((z[i]! - max) / T);
  for (let i = 0; i < z.length; i++) out[i]! /= soma;
  return out;
}

/** Os logits de um conjunto de índices. */
export function logits(m: Modelo, ids: Uint32Array): { z: Float32Array; conhecidas: number } {
  const h = new Float32Array(m.dim);
  let conhecidas = 0;
  for (const id of ids) {
    const r = busca(m.linhas.idx, id);
    if (r < 0) continue;
    somarLinha(m.linhas, m.dim, r, h);
    conhecidas++;
  }
  // divide pelo total (como no treino), não só pelas conhecidas: característica nova não vale nada
  if (ids.length) for (let k = 0; k < m.dim; k++) h[k]! /= ids.length;
  let x = h;
  if (m.oculta && m.W1 && m.b1) {
    const z1 = new Float32Array(m.oculta);
    for (let j = 0; j < m.oculta; j++) {
      let s = m.b1[j]!;
      for (let k = 0; k < m.dim; k++) s += m.W1[j * m.dim + k]! * h[k]!;
      z1[j] = s > 0 ? s : 0;
    }
    x = z1;
  }
  const d = x.length;
  const z = new Float32Array(m.rotulos.length);
  for (let c = 0; c < z.length; c++) {
    let s = m.b[c]!;
    for (let k = 0; k < d; k++) s += m.W[c * d + k]! * x[k]!;
    z[c] = s;
  }
  return { z, conhecidas };
}

export function prever(m: Modelo, t: Texto, k = 3): Previsao {
  const ids = indices(t, m.buckets);
  const { z, conhecidas } = logits(m, ids);
  const p = softmax(z, m.T);
  const ordem = [...p.keys()].sort((a, b) => p[b]! - p[a]!);
  const top = ordem.slice(0, k).map((i) => [m.rotulos[i]!, p[i]!] as [string, number]);
  return { rotulo: top[0]![0], p: top[0]![1], top, conhecidas };
}

// ------------------------------------------------------------------ treino

export interface OpcoesTreino {
  dim?: number;
  buckets?: number;
  epocas?: number;
  lr?: number;
  oculta?: number;
  semente?: number;
  /** quantas linhas sobrevivem ao corte (0 = sem corte) */
  corte?: number;
  /** épocas de retreino depois do corte */
  retreino?: number;
  /** quantiza por produto no fim */
  pq?: boolean;
  /** pedaço do vetor por centróide (dim precisa ser múltiplo) */
  sub?: number;
  aoProgresso?: (msg: string) => void;
}

export interface Amostra { ids: Uint32Array; y: number }

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Treina um modelo do zero. `amostras` já vêm como índices (ver `indices`),
 * o que deixa o mesmo conjunto servir ao treino aqui e na GPU.
 */
export function treinar(amostras: Amostra[], rotulos: string[], o: OpcoesTreino = {}): Modelo {
  const H = o.oculta ?? 0;
  // com camada oculta a taxa boa é bem menor (0,4 mata os neurônios ReLU logo no começo)
  const dim = o.dim ?? 32, buckets = o.buckets ?? 1 << 18, epocas = o.epocas ?? 10, lr0 = o.lr ?? (H ? 0.05 : 0.4);
  const rand = mulberry(o.semente ?? 1);
  const C = rotulos.length;
  const E = new Float32Array(buckets * dim);
  const tocada = new Uint8Array(buckets);
  for (const a of amostras) for (const id of a.ids) tocada[id] = 1;
  for (let i = 0; i < buckets; i++) if (tocada[i]) for (let k = 0; k < dim; k++) E[i * dim + k] = (rand() * 2 - 1) / dim;
  const D = H || dim;
  const W1 = H ? Float32Array.from({ length: H * dim }, () => (rand() * 2 - 1) * Math.sqrt(6 / dim)) : null;
  const b1 = H ? new Float32Array(H) : null;
  const W = H ? Float32Array.from({ length: C * D }, () => (rand() * 2 - 1) * Math.sqrt(6 / (D + C))) : new Float32Array(C * D);
  const b = new Float32Array(C);

  const ordem = amostras.map((_, i) => i);
  let mascara: Uint8Array | null = null;
  const total = (epocas + (o.corte ? o.retreino ?? 3 : 0)) * amostras.length;
  let passo = 0;

  const h = new Float32Array(dim), z1 = new Float32Array(H), gz1 = new Float32Array(H), gh = new Float32Array(dim), z = new Float32Array(C), g = new Float32Array(C);
  const epoca = (lrFim: number) => {
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ordem[i], ordem[j]] = [ordem[j]!, ordem[i]!];
    }
    for (const ai of ordem) {
      const a = amostras[ai]!;
      const lr = Math.max(lrFim, lr0 * (1 - passo++ / total));
      const ids = mascara ? a.ids.filter((id) => mascara![id]) : a.ids;
      const n = a.ids.length || 1;
      h.fill(0);
      for (const id of ids) for (let k = 0; k < dim; k++) h[k]! += E[id * dim + k]!;
      for (let k = 0; k < dim; k++) h[k]! /= n;
      const x = H ? z1 : h;
      if (H) {
        for (let j = 0; j < H; j++) {
          let s = b1![j]!;
          for (let k = 0; k < dim; k++) s += W1![j * dim + k]! * h[k]!;
          z1[j] = s > 0 ? s : 0;
        }
      }
      let max = -Infinity;
      for (let c = 0; c < C; c++) {
        let s = b[c]!;
        for (let k = 0; k < D; k++) s += W[c * D + k]! * x[k]!;
        z[c] = s;
        if (s > max) max = s;
      }
      let soma = 0;
      for (let c = 0; c < C; c++) soma += g[c] = Math.exp(z[c]! - max);
      for (let c = 0; c < C; c++) g[c] = g[c]! / soma - (c === a.y ? 1 : 0);
      // gradiente de volta para a entrada da camada de saída
      const gx = H ? gz1 : gh;
      gx.fill(0);
      for (let c = 0; c < C; c++) {
        const gc = g[c]!;
        if (Math.abs(gc) < 1e-7) continue;
        for (let k = 0; k < D; k++) {
          gx[k]! += W[c * D + k]! * gc;
          W[c * D + k]! -= lr * gc * x[k]!;
        }
        b[c]! -= lr * gc;
      }
      if (H) {
        gh.fill(0);
        for (let j = 0; j < H; j++) {
          if (z1[j]! <= 0) continue;
          const gj = gz1[j]!;
          for (let k = 0; k < dim; k++) {
            gh[k]! += W1![j * dim + k]! * gj;
            W1![j * dim + k]! -= lr * gj * h[k]!;
          }
          b1![j]! -= lr * gj;
        }
      }
      for (const id of ids) for (let k = 0; k < dim; k++) E[id * dim + k]! -= (lr * gh[k]!) / n;
    }
  };

  for (let e = 0; e < epocas; e++) {
    epoca(0);
    o.aoProgresso?.(`época ${e + 1}/${epocas}`);
  }

  // corte: as K linhas de maior norma ficam, o resto zera, e treina mais um pouco
  let idx: number[] = [];
  for (let i = 0; i < buckets; i++) if (tocada[i]) idx.push(i);
  if (o.corte && idx.length > o.corte) {
    const norma = (i: number) => {
      let s = 0;
      for (let k = 0; k < dim; k++) s += E[i * dim + k]! ** 2;
      return s;
    };
    idx = idx.map((i) => [i, norma(i)] as const).sort((a, b) => b[1] - a[1]).slice(0, o.corte).map(([i]) => i).sort((a, b) => a - b);
    mascara = new Uint8Array(buckets);
    for (const i of idx) mascara[i] = 1;
    for (let i = 0; i < buckets; i++) if (!mascara[i]) E.fill(0, i * dim, (i + 1) * dim);
    const re = o.retreino ?? 3;
    for (let e = 0; e < re; e++) {
      epoca(0);
      o.aoProgresso?.(`retreino ${e + 1}/${re} com ${idx.length} linhas`);
    }
  }

  const vet = new Float32Array(idx.length * dim);
  idx.forEach((i, r) => vet.set(E.subarray(i * dim, (i + 1) * dim), r * dim));
  let m: Modelo = { v: 1, rotulos, buckets, dim, oculta: H, T: 1, linhas: { tipo: 'densa', idx: Uint32Array.from(idx), vet }, W1, b1, W, b };
  if (o.pq) {
    o.aoProgresso?.('quantizando por produto');
    m = { ...m, linhas: quantizar(m.linhas as Extract<LinhasEmb, { tipo: 'densa' }>, dim, o.sub ?? 4, mulberry((o.semente ?? 1) + 7)) };
  }
  return m;
}

// ------------------------------------------------------------------ quantização de produto

/** k-médias por subespaço: cada pedaço de `sub` números vira o índice de um de 256 centróides. */
export function quantizar(L: Extract<LinhasEmb, { tipo: 'densa' }>, dim: number, sub: number, rand: () => number, iter = 12): Extract<LinhasEmb, { tipo: 'pq' }> {
  const n = L.idx.length;
  const nsub = dim / sub;
  if (!Number.isInteger(nsub)) throw new Error('dim precisa ser múltiplo de sub');
  const K = Math.min(256, n);
  const codigos = new Uint8Array(n * nsub);
  const centroides = new Float32Array(nsub * 256 * sub);
  for (let s = 0; s < nsub; s++) {
    const pt = (r: number, k: number) => L.vet[r * dim + s * sub + k]!;
    const cen = new Float32Array(K * sub);
    // começa com pontos sorteados (k-means++ seria melhor; com 12 iterações não faz diferença aqui)
    for (let c = 0; c < K; c++) {
      const r = Math.floor(rand() * n);
      for (let k = 0; k < sub; k++) cen[c * sub + k] = pt(r, k);
    }
    const atrib = new Uint16Array(n);
    for (let it = 0; it < iter; it++) {
      for (let r = 0; r < n; r++) {
        let melhor = 0, md = Infinity;
        for (let c = 0; c < K; c++) {
          let d = 0;
          for (let k = 0; k < sub; k++) {
            const x = pt(r, k) - cen[c * sub + k]!;
            d += x * x;
          }
          if (d < md) [md, melhor] = [d, c];
        }
        atrib[r] = melhor;
      }
      const soma = new Float32Array(K * sub), cont = new Uint32Array(K);
      for (let r = 0; r < n; r++) {
        const c = atrib[r]!;
        cont[c]!++;
        for (let k = 0; k < sub; k++) soma[c * sub + k]! += pt(r, k);
      }
      for (let c = 0; c < K; c++) {
        if (!cont[c]) {
          const r = Math.floor(rand() * n);
          for (let k = 0; k < sub; k++) cen[c * sub + k] = pt(r, k);
          continue;
        }
        for (let k = 0; k < sub; k++) cen[c * sub + k] = soma[c * sub + k]! / cont[c]!;
      }
    }
    for (let r = 0; r < n; r++) codigos[r * nsub + s] = atrib[r]!;
    centroides.set(cen, s * 256 * sub);
  }
  return { tipo: 'pq', idx: L.idx, sub, codigos, centroides };
}

// ------------------------------------------------------------------ calibração e avaliação

/** Acha a temperatura que minimiza a perda no conjunto de validação. */
export function calibrar(m: Modelo, val: Amostra[]): number {
  const zs = val.map((a) => logits(m, a.ids).z);
  let melhorT = 1, melhor = Infinity;
  for (let T = 0.4; T <= 4.01; T += 0.1) {
    let nll = 0;
    zs.forEach((z, i) => {
      nll -= Math.log(Math.max(1e-9, softmax(z, T)[val[i]!.y]!));
    });
    if (nll < melhor) [melhor, melhorT] = [nll, T];
  }
  return Math.round(melhorT * 100) / 100;
}

export interface Avaliacao {
  acerto: number;
  n: number;
  /** os pares (certo → previsto) que mais erram */
  confusoes: Array<{ certo: string; previsto: string; n: number }>;
  /** acerto por faixa de confiança, para ver a calibração */
  faixas: Array<{ de: number; ate: number; n: number; acerto: number }>;
}

export function avaliar(m: Modelo, amostras: Amostra[]): Avaliacao {
  let ok = 0;
  const conf = new Map<string, number>();
  const faixas = [0, 0.3, 0.5, 0.7, 0.9, 1.01].slice(0, -1).map((de, i, arr) => ({ de, ate: [0.3, 0.5, 0.7, 0.9, 1.01][i]!, n: 0, ok: 0, _: arr }));
  for (const a of amostras) {
    const p = softmax(logits(m, a.ids).z, m.T);
    let best = 0;
    for (let c = 1; c < p.length; c++) if (p[c]! > p[best]!) best = c;
    const f = faixas.find((x) => p[best]! >= x.de && p[best]! < x.ate)!;
    f.n++;
    if (best === a.y) {
      ok++;
      f.ok++;
    } else {
      const k = `${m.rotulos[a.y]}→${m.rotulos[best]}`;
      conf.set(k, (conf.get(k) ?? 0) + 1);
    }
  }
  return {
    acerto: amostras.length ? ok / amostras.length : 0,
    n: amostras.length,
    confusoes: [...conf].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => {
      const [certo, previsto] = k.split('→') as [string, string];
      return { certo, previsto, n };
    }),
    faixas: faixas.map((f) => ({ de: f.de, ate: Math.min(1, f.ate), n: f.n, acerto: f.n ? f.ok / f.n : 0 })),
  };
}

// ------------------------------------------------------------------ serialização

const b64 = (u8: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
const f32 = (a: Float32Array) => b64(new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength)));
const deF32 = (s: string) => new Float32Array(deB64(s).buffer);

/** Índices ordenados como diferenças em varint (quase sempre 1 byte cada). */
function varints(idx: Uint32Array): Uint8Array {
  const out: number[] = [];
  let prev = 0;
  for (const v of idx) {
    let d = v - prev;
    prev = v;
    while (d >= 0x80) {
      out.push((d & 0x7f) | 0x80);
      d >>>= 7;
    }
    out.push(d);
  }
  return Uint8Array.from(out);
}
function deVarints(u: Uint8Array, n: number): Uint32Array {
  const out = new Uint32Array(n);
  let p = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    let v = 0, s = 0, b: number;
    do {
      b = u[p++]!;
      v |= (b & 0x7f) << s;
      s += 7;
    } while (b & 0x80);
    prev += v >>> 0;
    out[i] = prev;
  }
  return out;
}

/** Texto compacto (JSON + base64) com o modelo. Só aceita linhas quantizadas ou densas. */
export function serializar(m: Modelo): string {
  const L = m.linhas;
  const base = { v: m.v, rotulos: m.rotulos, buckets: m.buckets, dim: m.dim, oculta: m.oculta, T: m.T, n: L.idx.length, idx: b64(varints(L.idx)), W: f32(m.W), b: f32(m.b), W1: m.W1 ? f32(m.W1) : null, b1: m.b1 ? f32(m.b1) : null };
  if (L.tipo === 'pq') return JSON.stringify({ ...base, tipo: 'pq', sub: L.sub, codigos: b64(L.codigos), centroides: f32(L.centroides) });
  return JSON.stringify({ ...base, tipo: 'densa', vet: f32(L.vet) });
}

export function carregar(texto: string): Modelo {
  const j = JSON.parse(texto) as Record<string, unknown> & { tipo: 'pq' | 'densa'; n: number; idx: string; rotulos: string[]; buckets: number; dim: number; oculta: number; T: number; W: string; b: string; W1: string | null; b1: string | null; sub?: number; codigos?: string; centroides?: string; vet?: string };
  const idx = deVarints(deB64(j.idx), j.n);
  const linhas: LinhasEmb = j.tipo === 'pq'
    ? { tipo: 'pq', idx, sub: j.sub!, codigos: deB64(j.codigos!), centroides: deF32(j.centroides!) }
    : { tipo: 'densa', idx, vet: deF32(j.vet!) };
  return { v: 1, rotulos: j.rotulos, buckets: j.buckets, dim: j.dim, oculta: j.oculta, T: j.T, linhas, W: deF32(j.W), b: deF32(j.b), W1: j.W1 ? deF32(j.W1) : null, b1: j.b1 ? deF32(j.b1) : null };
}
