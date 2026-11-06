import { seededRng } from '../rpg/dice';
import { biomeAtPercent, type Terrain } from './terreno';
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
  /** fração de mar do terreno gerado (`mar: 55%`) */
  sea: number | null;
  /** densidade de rios do terreno gerado (`rios: 1`, de 0 a 3) */
  rivers: number | null;
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
    sea: pctOf(get('mar', 'sea')),
    rivers: get('rios', 'rivers') && Number.isFinite(num(get('rios', 'rivers'))) ? num(get('rios', 'rivers')) : null,
    image: img ? img.replace(/^!?\[\[|\]\]$/g, '').split('|')[0]!.trim() : null,
  };
}

function pctOf(s: string): number | null {
  if (!s) return null;
  const n = num(s);
  if (!Number.isFinite(n)) return null;
  return s.includes('%') || n > 1 ? n / 100 : n;
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

export * from './terreno';

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
    if (b === 'mar' || b === 'fundo' || b === 'neve' || b === 'lago') continue;
    if ([...taken, ...out].some((p) => Math.hypot(p.x - x, p.y - y) < minD)) continue;
    out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  }
  return out;
}

// ------------------------------------------------------------------ territórios

/**
 * Regiões de cada dono no mapa: cada célula de terra fica com o dono do
 * marcador mais perto (até `reach` % de distância). Devolve o índice do dono
 * por célula (-1 = mar ou terra de ninguém), linha a linha.
 *
 * `land` diz se a célula é terra; sem terreno (mapa de imagem), tudo é terra.
 */
export function territoryGrid(
  w: number, h: number, sites: Array<{ x: number; y: number; owner: number }>,
  opts: { land?: (x: number, y: number) => boolean; reach?: number; aspect?: number } = {},
): Int16Array {
  const out = new Int16Array(w * h).fill(-1);
  if (!sites.length) return out;
  const reach = opts.reach ?? 16;
  const aspect = opts.aspect ?? w / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opts.land && !opts.land(x, y)) continue;
      const px = ((x + 0.5) / w) * 100;
      const py = ((y + 0.5) / h) * 100;
      let best = -1;
      let bd = reach;
      for (const s of sites) {
        // distância em "largura": o eixo y vale menos quando o mapa é largo
        const d = Math.hypot(s.x - px, (s.y - py) / aspect);
        if (d < bd) {
          bd = d;
          best = s.owner;
        }
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

// ------------------------------------------------------------------ estruturas

/** O que desenhar no mapa para um lugar. */
export type Estrutura = 'capital' | 'cidade' | 'vila' | 'aldeia' | 'castelo' | 'forte' | 'porto' | 'templo' | 'torre' | 'ruina' | 'mina' | 'caverna' | 'floresta' | 'montanha' | 'regiao' | 'acampamento' | 'ponto';

const ESTRUTURA_PALAVRAS: Array<[Estrutura, RegExp]> = [
  ['capital', /\bcapital\b|\btrono\b/],
  ['ruina', /\bru[ií]nas?\b|\babandonad|\bdestru[ií]d/],
  ['castelo', /\bcastelo|\bpal[aá]cio|\bcidadela|\bfortaleza\b/],
  ['forte', /\bforte\b|\bfortim|\bposto\b|\bguarni[cç]|\bmuralha/],
  ['porto', /\bporto\b|\bcais\b|\bba[ií]a\b|\bancoradouro/],
  ['templo', /\btemplo|\bmosteiro|\bsantu[aá]rio|\bcatedral|\babadia|\bcapela|\bsantu/],
  ['torre', /\btorre\b|\bobservat/],
  ['mina', /\bmina\b|\bminas\b|\bpedreira|\bforja/],
  ['caverna', /\bcaverna|\bgruta|\bcovil|\bmasmorra|\bcatacumba/],
  ['acampamento', /\bacampamento|\bposto avan|\bnômade|\bnomade/],
  ['floresta', /\bfloresta|\bbosque|\bselva|\bmata\b/],
  ['montanha', /\bmontanha|\bpico\b|\bmonte\b|\bserra\b|\bvulc/],
  ['regiao', /\breino\b|\bimp[eé]rio|\bregi[aã]o|\bprov[ií]ncia|\bterras?\b|\bcontinente|\bducado|\bcondado/],
  ['cidade', /\bcidade|\bmetr[oó]pole|\burbe\b/],
  ['vila', /\bvila\b|\bburgo\b|\bvilarejo/],
  ['aldeia', /\baldeia|\bpovoado|\blugarejo|\bfazenda|\bherdade/],
];

/**
 * Estrutura de um lugar: pelo campo `estrutura`/`categoria`/`tipo de lugar`/`porte`,
 * depois pelo nome ("Porto Sal", "Castelo Negro"), pela `população` e, por
 * fim, pela água ao lado (cidade costeira vira porto).
 */
export function estruturaDe(e: { name: string; props: Record<string, unknown> }, perto?: { agua?: 'mar' | 'lago' | 'rio' | null }): Estrutura {
  const prop = (...ks: string[]) => {
    for (const k of Object.keys(e.props)) if (ks.includes(k.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase())) return asText(e.props[k] as never).toLowerCase();
    return '';
  };
  const explicito = prop('estrutura', 'categoria', 'tipo de lugar', 'porte', 'tamanho', 'subtipo');
  for (const texto of [explicito, e.name.toLowerCase()]) {
    if (!texto) continue;
    for (const [k, re] of ESTRUTURA_PALAVRAS) if (re.test(texto)) return k;
  }
  // "12.000" é doze mil (milhar com ponto, como se escreve em português)
  const pop = num(prop('populacao', 'habitantes').replace(/\.(?=\d{3}(?!\d))/g, ''));
  let k: Estrutura = Number.isFinite(pop) && pop > 0 ? (pop >= 50000 ? 'capital' : pop >= 5000 ? 'cidade' : pop >= 500 ? 'vila' : 'aldeia') : 'vila';
  if (perto?.agua === 'mar' && (k === 'vila' || k === 'cidade')) k = 'porto';
  return k;
}

/** Tamanho relativo do ícone (1 = vila). */
export const ESTRUTURA_TAMANHO: Record<Estrutura, number> = {
  capital: 1.6, cidade: 1.35, castelo: 1.3, porto: 1.2, vila: 1, forte: 1.05, templo: 1.05, torre: 0.95, ruina: 0.95, mina: 0.9, caverna: 0.9,
  aldeia: 0.8, acampamento: 0.8, floresta: 1, montanha: 1.1, regiao: 1, ponto: 0.7,
};

/** Pares de lugares ligados por `rotas`/`estradas`/`caminhos` (cada par uma vez). */
export function rotasDoMundo(entities: Array<{ path: string; type: string; relations: Array<{ label: string; to: string | null }> }>): Array<[string, string]> {
  const RE = /^(rotas?|estradas?|caminhos?|ligado a|liga a|vizinhos?)$/i;
  const tipo = new Map(entities.map((e) => [e.path, e.type]));
  const out = new Map<string, [string, string]>();
  for (const e of entities) {
    if (e.type !== 'lugar') continue;
    for (const r of e.relations) {
      if (!r.to || r.to === e.path || !RE.test(r.label.trim()) || tipo.get(r.to) !== 'lugar') continue;
      const par: [string, string] = e.path < r.to ? [e.path, r.to] : [r.to, e.path];
      out.set(par.join('\u0000'), par);
    }
  }
  return [...out.values()];
}
