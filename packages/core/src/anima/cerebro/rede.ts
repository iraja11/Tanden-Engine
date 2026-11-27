/*
 * A rede neural da Ânima: um Transformer pequeno que entende o que você
 * escreveu. Roda inteira aqui, em TypeScript puro, sem rede e sem GPU (alguns
 * milissegundos na CPU por mensagem; ~20 ms numa frase longa). Treinada na GPU por
 * scripts/anima-cerebro/rede.py; o formato do arquivo é o que aquele script grava.
 *
 *   texto normalizado → tokens (até L-1) + um token global (marcas, tamanho)
 *   cada token → média das linhas de suas características (a palavra e os
 *     pedaços de 3 e 4 letras, por hash: sem vocabulário fixo, então palavra
 *     nova, gíria e erro de digitação ainda caem perto das certas)
 *   + posição aprendida
 *   → N camadas de Transformer (pré-LN: atenção de várias cabeças + FFN GELU)
 *   → LN final → [token global ; média dos outros] → linear → softmax (temperatura calibrada)
 *
 * Diferente do classificador de bolsa de palavras (classificador.ts), a
 * atenção vê a ordem e o contexto: "não tô bem" ≠ "tô bem", "me lembra" ≠
 * "lembra de mim", "e você?" depende do resto.
 *
 * Tamanho: as linhas de embedding vão quantizadas por produto (4 números → 1
 * byte) e as matrizes em int8 com escala por linha. Fica em ~6 MB, carregado
 * sob demanda (`prepararRede` em modelo.ts).
 */
import { hash32, numeroTok, type LinhasEmb, type Previsao } from './classificador';
import type { Texto } from './texto';

export interface CamadaRede {
  ln1g: Float32Array; ln1b: Float32Array;
  /** q, k e v empilhados: 3d × d */
  Wqkv: Float32Array; bqkv: Float32Array;
  Wo: Float32Array; bo: Float32Array;
  ln2g: Float32Array; ln2b: Float32Array;
  W1: Float32Array; b1: Float32Array;
  W2: Float32Array; b2: Float32Array;
}

export interface Rede {
  rotulos: string[];
  buckets: number;
  d: number;
  /** tokens no máximo (o global incluso) */
  L: number;
  cabecas: number;
  ffn: number;
  T: number;
  emb: Extract<LinhasEmb, { tipo: 'pq' }>;
  pos: Float32Array;
  camadas: CamadaRede[];
  lnfg: Float32Array; lnfb: Float32Array;
  /** saída: rotulos × 2d */
  Wc: Float32Array; bc: Float32Array;
  /**
   * A cabeça de significado (opcional): leva o [global ; média] ao espaço do
   * modelo de frases que ensinou a rede no treino (o professor). Duas frases
   * que querem dizer a mesma coisa ficam perto, mesmo sem palavra em comum:
   * é o que a memória por significado usa (`vetorDaRede`).
   */
  proj?: { W: Float32Array; b: Float32Array; dim: number };
}

// ------------------------------------------------------------------ características por token

const faixa = (n: number) => (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : n <= 10 ? 10 : 99);

/** As características de cada token (o primeiro é o global), como strings. */
export function tokensDaRede(t: Texto, L: number): string[][] {
  const toks = t.tokens.map(numeroTok).slice(0, L - 1);
  const out: string[][] = [['g:', ...[...t.marcas].map((m) => `m:${m}`), `n:${faixa(t.tokens.length)}`]];
  for (const w of toks) {
    const f = [`w:${w}`];
    const g = `<${w}>`;
    if (w.length >= 3 && w !== '<num>') for (let k = 3; k <= 4; k++) for (let j = 0; j + k <= g.length; j++) f.push(`c:${g.slice(j, j + k)}`);
    else f.push(`c:${g}`);
    out.push(f);
  }
  return out;
}

/** Os mesmos tokens em índices do hash (o que o treino na GPU recebe). */
export function idsDaRede(t: Texto, L: number, buckets: number): number[][] {
  return tokensDaRede(t, L).map((f) => [...new Set(f.map((c) => hash32(c) % buckets))]);
}

// ------------------------------------------------------------------ inferência

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

function layerNorm(x: Float32Array, o: number, d: number, g: Float32Array, b: Float32Array, out: Float32Array, oo: number): void {
  let m = 0;
  for (let k = 0; k < d; k++) m += x[o + k]!;
  m /= d;
  let v = 0;
  for (let k = 0; k < d; k++) v += (x[o + k]! - m) ** 2;
  const inv = 1 / Math.sqrt(v / d + 1e-5);
  for (let k = 0; k < d; k++) out[oo + k] = (x[o + k]! - m) * inv * g[k]! + b[k]!;
}

/** y[n×out] = x[n×in] · Wᵀ + b */
function linear(x: Float32Array, n: number, din: number, W: Float32Array, b: Float32Array, dout: number): Float32Array {
  const y = new Float32Array(n * dout);
  for (let i = 0; i < n; i++) {
    const xo = i * din, yo = i * dout;
    for (let j = 0; j < dout; j++) {
      let s = b[j]!;
      const wo = j * din;
      for (let k = 0; k < din; k++) s += W[wo + k]! * x[xo + k]!;
      y[yo + j] = s;
    }
  }
  return y;
}

const C_GELU = Math.sqrt(2 / Math.PI);
const gelu = (x: number) => 0.5 * x * (1 + Math.tanh(C_GELU * (x + 0.044715 * x * x * x)));

/** O vetor de entrada de cada token. Devolve também quantas características a rede conhecia. */
function entrada(r: Rede, ids: number[][]): { x: Float32Array; conhecidas: number } {
  const { d } = r;
  const n = ids.length;
  const x = new Float32Array(n * d);
  const nsub = d / r.emb.sub;
  let conhecidas = 0;
  ids.forEach((tok, i) => {
    const o = i * d;
    for (const id of tok) {
      const row = busca(r.emb.idx, id);
      if (row < 0) continue;
      conhecidas++;
      for (let s = 0; s < nsub; s++) {
        const base = (s * 256 + r.emb.codigos[row * nsub + s]!) * r.emb.sub;
        for (let k = 0; k < r.emb.sub; k++) x[o + s * r.emb.sub + k]! += r.emb.centroides[base + k]!;
      }
    }
    // divide pelo total, como no treino: característica desconhecida conta como zero
    const div = tok.length || 1;
    for (let k = 0; k < d; k++) x[o + k] = x[o + k]! / div + r.pos[i * d + k]!;
  });
  return { x, conhecidas };
}

/** Os logits da rede para um texto já normalizado (e o [global ; média] de onde saíram). */
export function logitsDaRede(r: Rede, t: Texto): { z: Float32Array; conhecidas: number; pool: Float32Array } {
  const { d, cabecas: H } = r;
  const ids = idsDaRede(t, r.L, r.buckets);
  const n = ids.length;
  const { x, conhecidas } = entrada(r, ids);
  const dh = d / H;
  const esc = 1 / Math.sqrt(dh);
  const h = new Float32Array(n * d);
  for (const c of r.camadas) {
    // atenção
    for (let i = 0; i < n; i++) layerNorm(x, i * d, d, c.ln1g, c.ln1b, h, i * d);
    const qkv = linear(h, n, d, c.Wqkv, c.bqkv, 3 * d);
    const att = new Float32Array(n * d);
    const sc = new Float32Array(n);
    for (let hh = 0; hh < H; hh++) {
      const qo = hh * dh, ko = d + hh * dh, vo = 2 * d + hh * dh;
      for (let i = 0; i < n; i++) {
        let max = -Infinity;
        for (let j = 0; j < n; j++) {
          let s = 0;
          for (let k = 0; k < dh; k++) s += qkv[i * 3 * d + qo + k]! * qkv[j * 3 * d + ko + k]!;
          s *= esc;
          sc[j] = s;
          if (s > max) max = s;
        }
        let soma = 0;
        for (let j = 0; j < n; j++) soma += sc[j] = Math.exp(sc[j]! - max);
        for (let j = 0; j < n; j++) {
          const p = sc[j]! / soma;
          for (let k = 0; k < dh; k++) att[i * d + qo + k]! += p * qkv[j * 3 * d + vo + k]!;
        }
      }
    }
    const o = linear(att, n, d, c.Wo, c.bo, d);
    for (let k = 0; k < n * d; k++) x[k]! += o[k]!;
    // FFN
    for (let i = 0; i < n; i++) layerNorm(x, i * d, d, c.ln2g, c.ln2b, h, i * d);
    const f1 = linear(h, n, d, c.W1, c.b1, r.ffn);
    for (let k = 0; k < f1.length; k++) f1[k] = gelu(f1[k]!);
    const f2 = linear(f1, n, r.ffn, c.W2, c.b2, d);
    for (let k = 0; k < n * d; k++) x[k]! += f2[k]!;
  }
  for (let i = 0; i < n; i++) layerNorm(x, i * d, d, r.lnfg, r.lnfb, h, i * d);
  // [global ; média dos tokens] (sem tokens: a média é zero)
  const pool = new Float32Array(2 * d);
  for (let k = 0; k < d; k++) pool[k] = h[k]!;
  if (n > 1) {
    for (let i = 1; i < n; i++) for (let k = 0; k < d; k++) pool[d + k]! += h[i * d + k]!;
    for (let k = 0; k < d; k++) pool[d + k]! /= n - 1;
  }
  const z = linear(pool, 1, 2 * d, r.Wc, r.bc, r.rotulos.length);
  return { z, conhecidas, pool };
}

/**
 * O significado de uma frase: um vetor unitário no espaço do professor (a
 * cabeça de destilação que o treino guarda). null se a rede não tem a cabeça.
 * Semelhança = produto escalar (`semelhanca`).
 */
export function vetorDaRede(r: Rede, t: Texto): Float32Array | null {
  if (!r.proj) return null;
  const { pool } = logitsDaRede(r, t);
  const v = linear(pool, 1, 2 * r.d, r.proj.W, r.proj.b, r.proj.dim);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

/** Cosseno entre dois vetores unitários. */
export function semelhanca(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length && i < b.length; i++) s += a[i]! * b[i]!;
  return s;
}

export function softmaxT(z: Float32Array, T: number): Float32Array {
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  let soma = 0;
  const p = new Float32Array(z.length);
  for (let i = 0; i < z.length; i++) soma += p[i] = Math.exp((z[i]! - max) / T);
  for (let i = 0; i < z.length; i++) p[i]! /= soma;
  return p;
}

/** As probabilidades de cada intenção (na ordem de `r.rotulos`). */
export function probabilidadesDaRede(r: Rede, t: Texto): { p: Float32Array; conhecidas: number } {
  const { z, conhecidas } = logitsDaRede(r, t);
  return { p: softmaxT(z, r.T), conhecidas };
}

export function preverComRede(r: Rede, t: Texto, k = 3): Previsao {
  const { p, conhecidas } = probabilidadesDaRede(r, t);
  const ordem = [...p.keys()].sort((a, b) => p[b]! - p[a]!);
  const top = ordem.slice(0, k).map((i) => [r.rotulos[i]!, p[i]!] as [string, number]);
  return { rotulo: top[0]![0], p: top[0]![1], top, conhecidas };
}

// ------------------------------------------------------------------ arquivo

/*
 * Formato (o que rede.py grava, em base64 no rede.dat.ts):
 *   "ANR1" · u32 tamanho do cabeçalho · cabeçalho JSON (utf-8) · preenchimento até múltiplo de 4 · blocos
 * O cabeçalho lista os blocos na ordem: { nome, tipo: 'f32' | 'u8' | 'i8q' | 'idx', n, linhas? }.
 *   f32  n floats
 *   u8   n bytes
 *   i8q  matriz linhas × (n / linhas) em int8 + uma escala f32 por linha (escalas primeiro)
 *   idx  n índices crescentes em varint de diferenças
 * Cada bloco começa alinhado a 4 bytes.
 */

interface Bloco { nome: string; tipo: 'f32' | 'u8' | 'i8q' | 'idx'; n: number; linhas?: number; bytes: number }
interface Cabecalho {
  rotulos: string[]; buckets: number; d: number; L: number; cabecas: number; ffn: number; camadas: number; T: number; sub: number;
  blocos: Bloco[];
}

const deB64 = (s: string): Uint8Array => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

export function carregarRede(b64: string): Rede {
  const u = deB64(b64);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  if (String.fromCharCode(u[0]!, u[1]!, u[2]!, u[3]!) !== 'ANR1') throw new Error('rede: formato desconhecido');
  const hl = dv.getUint32(4, true);
  const cab = JSON.parse(new TextDecoder().decode(u.subarray(8, 8 + hl))) as Cabecalho;
  let off = (8 + hl + 3) & ~3;
  const blocos = new Map<string, Float32Array | Uint8Array | Uint32Array>();
  for (const b of cab.blocos) {
    if (b.tipo === 'f32') {
      blocos.set(b.nome, new Float32Array(u.buffer.slice(u.byteOffset + off, u.byteOffset + off + b.n * 4)));
    } else if (b.tipo === 'u8') {
      blocos.set(b.nome, u.slice(off, off + b.n));
    } else if (b.tipo === 'i8q') {
      const linhas = b.linhas!;
      const cols = b.n / linhas;
      const esc = new Float32Array(u.buffer.slice(u.byteOffset + off, u.byteOffset + off + linhas * 4));
      const q = new Int8Array(u.buffer, u.byteOffset + off + linhas * 4, b.n);
      const w = new Float32Array(b.n);
      for (let i = 0; i < linhas; i++) for (let j = 0; j < cols; j++) w[i * cols + j] = q[i * cols + j]! * esc[i]!;
      blocos.set(b.nome, w);
    } else {
      const idx = new Uint32Array(b.n);
      let p = off, prev = 0;
      for (let i = 0; i < b.n; i++) {
        let v = 0, sh = 0, byte: number;
        do {
          byte = u[p++]!;
          v += (byte & 0x7f) * 2 ** sh;
          sh += 7;
        } while (byte & 0x80);
        prev += v;
        idx[i] = prev;
      }
      blocos.set(b.nome, idx);
    }
    off = (off + b.bytes + 3) & ~3;
  }
  const f = (k: string) => {
    const v = blocos.get(k);
    if (!(v instanceof Float32Array)) throw new Error(`rede: falta ${k}`);
    return v;
  };
  const camadas: CamadaRede[] = [];
  for (let i = 0; i < cab.camadas; i++) {
    const p = `c${i}.`;
    camadas.push({
      ln1g: f(`${p}ln1g`), ln1b: f(`${p}ln1b`), Wqkv: f(`${p}Wqkv`), bqkv: f(`${p}bqkv`), Wo: f(`${p}Wo`), bo: f(`${p}bo`),
      ln2g: f(`${p}ln2g`), ln2b: f(`${p}ln2b`), W1: f(`${p}W1`), b1: f(`${p}b1`), W2: f(`${p}W2`), b2: f(`${p}b2`),
    });
  }
  const idx = blocos.get('emb.idx');
  const codigos = blocos.get('emb.codigos');
  if (!(idx instanceof Uint32Array) || !(codigos instanceof Uint8Array)) throw new Error('rede: embedding incompleto');
  return {
    rotulos: cab.rotulos, buckets: cab.buckets, d: cab.d, L: cab.L, cabecas: cab.cabecas, ffn: cab.ffn, T: cab.T,
    emb: { tipo: 'pq', idx, sub: cab.sub, codigos, centroides: f('emb.centroides') },
    pos: f('pos'), camadas, lnfg: f('lnfg'), lnfb: f('lnfb'), Wc: f('Wc'), bc: f('bc'),
    ...(blocos.get('proj') instanceof Float32Array && blocos.get('bproj') instanceof Float32Array
      ? { proj: { W: f('proj'), b: f('bproj'), dim: f('bproj').length } }
      : {}),
  };
}
