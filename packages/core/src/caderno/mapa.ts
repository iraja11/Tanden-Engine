import { seededRng, type Rng } from '../rpg/dice';
import { asText, parseProps } from './frontmatter';
import { linkTarget, readRecords, writeRecords, type Rec } from './markdown';

/*
 * Mapas do mundo.
 *
 * Um mapa é uma ficha `tipo: mapa`. O fundo é uma imagem (`imagem: [[mapa.png]]`)
 * ou, sem imagem, um terreno gerado pela `semente`. Os marcadores ficam numa
 * tabela comum, legível no Obsidian:
 *
 *   ## Marcadores
 *   | Marcador        | X    | Y    |
 *   | [[Vale Escuro]] | 42.5 | 61   |
 *
 * X e Y são porcentagens da largura e da altura, então valem para qualquer
 * tamanho de imagem. `escala` é a largura do mapa na `unidade` (km, léguas...).
 */

export interface MapMarker {
  /** texto da célula: "[[Vale]]" ou um rótulo solto */
  label: string;
  /** alvo do link, se for um [[link]] */
  target: string | null;
  x: number;
  y: number;
  _i?: number;
}

const COLS = { label: ['Marcador', 'Nome', 'Local', 'Lugar'], x: ['X'], y: ['Y'] };
export const MARKERS = 'Marcadores';

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const num = (s: string) => Number(s.replace(',', '.').replace(/[^\d.-]/g, ''));

export function readMarkers(text: string): MapMarker[] {
  return readRecords(text, MARKERS, COLS)
    .map((r) => {
      const m = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(r.label);
      return { label: r.label, target: m ? linkTarget(m[1]!) : null, x: clamp(num(r.x), 0, 100), y: clamp(num(r.y), 0, 100), _i: r._i };
    })
    .filter((m) => m.label.trim() && Number.isFinite(m.x) && Number.isFinite(m.y));
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export function writeMarkers(text: string, markers: MapMarker[]): string {
  const recs: Array<Rec<keyof typeof COLS>> = markers.map((m) => ({ label: m.label, x: fmt(clamp(m.x, 0, 100)), y: fmt(clamp(m.y, 0, 100)), _i: m._i }));
  return writeRecords(text, MARKERS, COLS, recs);
}

export interface MapInfo {
  /** largura do mapa na unidade */
  scale: number;
  unit: string;
  seed: number | null;
  image: string | null;
}

export function mapInfo(text: string): MapInfo {
  const p = parseProps(text);
  const get = (...ks: string[]) => {
    for (const k of ks) {
      const key = Object.keys(p).find((x) => x.toLowerCase() === k);
      if (key) return asText(p[key]).trim();
    }
    return '';
  };
  const scale = num(get('escala', 'scale'));
  const seed = num(get('semente', 'seed'));
  const img = get('imagem', 'image', 'capa', 'img');
  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1000,
    unit: get('unidade', 'unit') || 'km',
    seed: Number.isFinite(seed) && get('semente', 'seed') ? Math.trunc(seed) : null,
    image: img ? img.replace(/^!?\[\[|\]\]$/g, '').split('|')[0]!.trim() : null,
  };
}

/** Distância entre dois pontos (em %) na unidade do mapa. `aspect` = largura / altura. */
export function mapDistance(a: { x: number; y: number }, b: { x: number; y: number }, scale: number, aspect: number): number {
  const dx = ((b.x - a.x) / 100) * scale;
  const dy = ((b.y - a.y) / 100) * (scale / aspect);
  return Math.hypot(dx, dy);
}

/** Tempo de viagem a pé, a cavalo e de barco (unidade em km ou léguas). */
export function travelTimes(distance: number, unit: string): Array<{ how: string; days: number }> | null {
  const km = /l[ée]gua/i.test(unit) ? distance * 6 : /milha/i.test(unit) ? distance * 1.6 : /^km|quil/i.test(unit) ? distance : null;
  if (km === null) return null;
  return [
    { how: 'a pé', days: km / 30 },
    { how: 'a cavalo', days: km / 60 },
    { how: 'de barco', days: km / 120 },
  ];
}

// ------------------------------------------------------------------ terreno

export interface Terrain {
  w: number;
  h: number;
  /** altura 0..1 por célula (linha a linha) */
  height: Float32Array;
  /** umidade 0..1 por célula */
  moisture: Float32Array;
  sea: number;
  /** rios como linhas em % (x, y) */
  rivers: Array<Array<{ x: number; y: number }>>;
}

function valueNoise(rng: Rng, size = 64): (x: number, y: number) => number {
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (x: number, y: number) => g[((y % size) + size) % size * size + (((x % size) + size) % size)]!;
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = fade(x - xi);
    const ty = fade(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * tx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += amp * n(x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / norm;
}

/**
 * Terreno de um continente (ou arquipélago) a partir da semente: ruído em
 * camadas, puxado para baixo nas bordas para virar mar, mais rios descendo
 * das montanhas. Mesma semente, mesmo mapa, em qualquer aparelho.
 */
export function generateTerrain(seed: number, w = 240, h = 160, opts: { sea?: number; rivers?: number } = {}): Terrain {
  const rng = seededRng(seed);
  const n1 = valueNoise(rng);
  const n2 = valueNoise(rng);
  const height = new Float32Array(w * h);
  const moisture = new Float32Array(w * h);
  const sea = opts.sea ?? 0.42;
  const freq = 4 / Math.max(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w - 0.5;
      const ny = y / h - 0.5;
      // borda vira mar: distância "quadrada arredondada" ao centro
      const d = Math.min(1, Math.pow(Math.pow(Math.abs(nx) * 2, 3) + Math.pow(Math.abs(ny) * 2, 3), 1 / 3));
      const e = fbm(n1, x * freq * 1.6, y * freq * 1.6, 6);
      height[y * w + x] = clamp(e * 1.15 - d * d * 0.55 + 0.08, 0, 1);
      moisture[y * w + x] = fbm(n2, x * freq * 1.2 + 31, y * freq * 1.2 + 17, 4);
    }
  }
  return { w, h, height, moisture, sea, rivers: traceRivers(height, w, h, sea, opts.rivers ?? 7, rng) };
}

function traceRivers(height: Float32Array, w: number, h: number, sea: number, count: number, rng: Rng) {
  const out: Array<Array<{ x: number; y: number }>> = [];
  const used = new Uint8Array(w * h);
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    let x = Math.floor(rng() * w);
    let y = Math.floor(rng() * h);
    if (height[y * w + x]! < sea + 0.25) continue;
    const path: Array<{ x: number; y: number }> = [];
    for (let step = 0; step < w + h; step++) {
      path.push({ x: (x / w) * 100, y: (y / h) * 100 });
      const i = y * w + x;
      if (height[i]! < sea) break;
      if (used[i] && path.length > 3) break; // encontrou outro rio: vira afluente
      used[i] = 1;
      let best = i;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (height[j]! < height[best]!) best = j;
      }
      if (best === i) break; // poço: vira lago
      x = best % w;
      y = Math.floor(best / w);
    }
    const last = path[path.length - 1]!;
    if (path.length > 12 && height[Math.floor((last.y / 100) * h) * w + Math.floor((last.x / 100) * w)]! < sea + 0.02) out.push(path);
  }
  return out;
}

export type Biome = 'fundo' | 'mar' | 'praia' | 'deserto' | 'campo' | 'floresta' | 'pantano' | 'colina' | 'montanha' | 'neve';

/** Bioma de uma célula pela altura e umidade. */
export function biomeAt(t: Terrain, x: number, y: number): Biome {
  const i = y * t.w + x;
  const e = t.height[i]!;
  const m = t.moisture[i]!;
  if (e < t.sea - 0.12) return 'fundo';
  if (e < t.sea) return 'mar';
  if (e < t.sea + 0.025) return 'praia';
  if (e > 0.86) return 'neve';
  if (e > 0.74) return 'montanha';
  if (e > 0.63) return 'colina';
  if (m < 0.38) return 'deserto';
  if (m > 0.62 && e < t.sea + 0.08) return 'pantano';
  if (m > 0.5) return 'floresta';
  return 'campo';
}

/** Bioma num ponto em % (para o texto do marcador: "fica numa floresta"). */
export const biomeAtPercent = (t: Terrain, px: number, py: number): Biome =>
  biomeAt(t, clamp(Math.floor((px / 100) * t.w), 0, t.w - 1), clamp(Math.floor((py / 100) * t.h), 0, t.h - 1));

/**
 * Lugares bons para pôr marcadores: em terra, nem no pico, longe uns dos
 * outros e dos que já existem. Serve para "espalhar" os lugares no mapa.
 */
export function suggestSpots(t: Terrain, n: number, taken: Array<{ x: number; y: number }>, seed = 1): Array<{ x: number; y: number }> {
  const rng = seededRng(seed);
  const out: Array<{ x: number; y: number }> = [];
  let minD = 14;
  for (let tries = 0; out.length < n && tries < n * 400; tries++) {
    if (tries && tries % (n * 80) === 0) minD *= 0.75;
    const x = 4 + rng() * 92;
    const y = 4 + rng() * 92;
    const b = biomeAtPercent(t, x, y);
    if (b === 'mar' || b === 'fundo' || b === 'neve') continue;
    if ([...taken, ...out].some((p) => Math.hypot(p.x - x, p.y - y) < minD)) continue;
    out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }
  return out;
}
