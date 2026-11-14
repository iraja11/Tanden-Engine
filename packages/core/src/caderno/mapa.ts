import { seededRng } from '../rpg/dice';
import { biomeAtPercent, type Terrain } from './terreno';
import { ACIDENTES, BIOMAS, RECURSOS, altitudeM, type AcidenteId, type PontoAtlas, type RegiaoAtlas, type RegiaoKind } from './clima';
import { NAME_STYLES, styledName } from './gerador';
import { asText, parseProps } from './frontmatter';
import { getSection, linkTarget, readRecords, writeRecords, type Rec } from './markdown';

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
  /** estrutura do marcador sem ficha (coluna "Tipo": cidade, castelo, mina...) */
  kind?: string;
  _i?: number;
}

const COLS = { label: ['Marcador', 'Nome', 'Local', 'Lugar'], x: ['X'], y: ['Y'] };
const COLS_TIPO = { ...COLS, kind: ['Tipo', 'Estrutura'] };
export const MARKERS = 'Marcadores';

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const num = (s: string) => Number(s.replace(',', '.').replace(/[^\d.-]/g, ''));

export function readMarkers(text: string): MapMarker[] {
  return readRecords(text, MARKERS, COLS_TIPO)
    .map((r) => {
      const m = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(r.label);
      const k = r.kind.trim().toLowerCase();
      return { label: r.label, target: m ? linkTarget(m[1]!) : null, x: clamp(num(r.x), 0, 100), y: clamp(num(r.y), 0, 100), ...(k ? { kind: k } : {}), _i: r._i };
    })
    .filter((m) => m.label.trim() && Number.isFinite(m.x) && Number.isFinite(m.y));
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);

export function writeMarkers(text: string, markers: MapMarker[]): string {
  // a coluna "Tipo" só aparece quando algum marcador tem tipo (ou a tabela já tem a coluna)
  const comTipo = markers.some((m) => m.kind) || /\|\s*(Tipo|Estrutura)\s*\|/i.test(getSection(text, MARKERS) ?? '');
  if (!comTipo) {
    const recs: Array<Rec<keyof typeof COLS>> = markers.map((m) => ({ label: m.label, x: fmt(clamp(m.x, 0, 100)), y: fmt(clamp(m.y, 0, 100)), _i: m._i }));
    return writeRecords(text, MARKERS, COLS, recs);
  }
  const recs: Array<Rec<keyof typeof COLS_TIPO>> = markers.map((m) => ({ label: m.label, x: fmt(clamp(m.x, 0, 100)), y: fmt(clamp(m.y, 0, 100)), kind: m.kind ?? '', _i: m._i }));
  return writeRecords(text, MARKERS, COLS_TIPO, recs);
}

/** Tamanhos de mapa: quanto mundo cabe nele e com quantas células ele é gerado. */
export interface TamanhoMapa {
  id: 'ilha' | 'continente' | 'grande' | 'enorme' | 'mundo';
  label: string;
  desc: string;
  /** quanto mundo cabe (1 = um continente) */
  escala: number;
  /** grade do terreno */
  w: number;
  h: number;
  /** largura padrão em km, quando a nota não diz a `escala` */
  km: number;
}

export const TAMANHOS: TamanhoMapa[] = [
  { id: 'ilha', label: 'Ilha ou região', desc: 'Um pedaço de terra visto de perto: uma ilha, um reino pequeno.', escala: 0.7, w: 720, h: 480, km: 300 },
  { id: 'continente', label: 'Continente', desc: 'Um continente com mares em volta (o padrão).', escala: 1, w: 720, h: 480, km: 1000 },
  { id: 'grande', label: 'Vários continentes', desc: 'Dois ou três continentes, arquipélagos e mares entre eles.', escala: 1.7, w: 960, h: 560, km: 4000 },
  { id: 'enorme', label: 'Hemisfério', desc: 'Meio mundo: muitos continentes, do equador ao polo.', escala: 2.4, w: 1200, h: 640, km: 9000 },
  { id: 'mundo', label: 'Mundo inteiro', desc: 'O planeta todo, do polo norte ao polo sul.', escala: 3, w: 1200, h: 600, km: 40000 },
];

const foldT = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
/** Tamanho pelo nome (`tamanho: mundo`, `grande`, `hemisfério`...). */
export function tamanhoMapa(raw: string | null | undefined): TamanhoMapa {
  const k = foldT(raw ?? '');
  const alias: Record<string, TamanhoMapa['id']> = { regiao: 'ilha', pequeno: 'ilha', reino: 'ilha', medio: 'continente', normal: 'continente', continentes: 'grande', hemisferio: 'enorme', planeta: 'mundo', global: 'mundo' };
  return TAMANHOS.find((t) => t.id === k || foldT(t.label) === k) ?? TAMANHOS.find((t) => t.id === alias[k]) ?? TAMANHOS[1]!;
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
  /** relevo por placas tectônicas (`tectônica: sim`) */
  plates: boolean;
  /** faixa de clima (`clima: tropical`) */
  clima: string | null;
  /** graus a mais ou a menos (`calor: -5`) */
  calor: number | null;
  /** estilo da pintura (`estilo: pergaminho`) */
  estilo: 'relevo' | 'atlas' | 'pergaminho' | null;
  /** estilo dos nomes automáticos (`nomes: élfico`), ou `não` para nenhum */
  nomes: string | null;
  /** tamanho do mapa (`tamanho: mundo`) */
  tamanho: TamanhoMapa;
  /** natureza do plano (`natureza: infernal`); sem isso, a do plano ligado */
  natureza: string | null;
  /** plano ou mundo a que o mapa pertence (`plano: "[[Feéria]]"`), para o atlas */
  plano: string | null;
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
  const tamanho = tamanhoMapa(get('tamanho', 'size'));
  const plano = get('plano', 'plane', 'reino');
  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : tamanho.km,
    unit: get('unidade', 'unit') || 'km',
    seed: Number.isFinite(seed) && get('semente', 'seed') ? Math.trunc(seed) : null,
    sea: pctOf(get('mar', 'sea')),
    rivers: get('rios', 'rivers') && Number.isFinite(num(get('rios', 'rivers'))) ? num(get('rios', 'rivers')) : null,
    image: img ? img.replace(/^!?\[\[|\]\]$/g, '').split('|')[0]!.trim() : null,
    plates: /^(sim|s|true|1|placas|yes)$/i.test(get('tectônica', 'tectonica', 'placas')),
    clima: get('clima') || null,
    calor: Number.isFinite(num(get('calor'))) && get('calor') ? num(get('calor')) : null,
    estilo: (['relevo', 'atlas', 'pergaminho'] as const).find((e) => e === get('estilo').toLowerCase()) ?? null,
    nomes: get('nomes', 'names') || null,
    tamanho,
    natureza: get('natureza', 'nature') || null,
    plano: plano ? plano.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim() || null : null,
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

// ------------------------------------------------------------------ nomes do atlas

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Estilo de nome pelo texto da nota (`élfico`, `nordico`...), ou um pela semente. */
export function nameStyleFor(id: string | null, seed: number) {
  const k = id ? fold(id) : '';
  return NAME_STYLES.find((s) => fold(s.id) === k || fold(s.label) === k) ?? NAME_STYLES[Math.abs(seed) % NAME_STYLES.length]!;
}

const FORMAS: Record<RegiaoKind, string[]> = {
  cordilheira: ['Montes {n}', 'Serra de {n}', 'Cordilheira {n}', 'Picos de {n}', 'Montanhas de {n}'],
  deserto: ['Deserto de {n}', 'Areias de {n}', 'Ermos de {n}'],
  floresta: ['Floresta de {n}', 'Bosque de {n}', 'Mata {n}'],
  selva: ['Selva de {n}', 'Selva {n}'],
  pantano: ['Pântano de {n}', 'Brejos de {n}', 'Charcos de {n}'],
  tundra: ['Tundra de {n}', 'Terras Geladas de {n}'],
  pradaria: ['Campos de {n}', 'Planícies de {n}', 'Estepes de {n}'],
  mar: ['Mar de {n}', 'Mar {n}', 'Oceano {n}'],
  lago: ['Lago {n}', 'Lago de {n}'],
  ilha: ['Ilha de {n}', '{n}', 'Ilha {n}'],
  continente: ['{n}', 'Terras de {n}'],
  geleira: ['Gelos de {n}', 'Geleira de {n}'],
};

/** Nomes para as regiões do atlas (mesma semente e estilo, mesmos nomes). */
/** Como se chama o "mar" em cada natureza de plano. */
const MAR_DO_PLANO: Record<string, [string, string]> = {
  infernal: ['Mar de Lava {n}', 'Lago de Fogo {n}'], umbral: ['Bruma {n}', 'Névoa de {n}'], astral: ['Vazio de {n}', 'Abismo Estrelado {n}'], subterraneo: ['Abismo de {n}', 'Fenda {n}'],
};

export function nomearRegioes(regions: RegiaoAtlas[], styleId: string | null, seed: number, natureza = 'material'): string[] {
  const style = nameStyleFor(styleId, seed);
  const rng = seededRng(seed * 13 + 7);
  const used = new Set<string>();
  return regions.map((r) => {
    for (let k = 0; k < 8; k++) {
      const n = styledName(style, rng);
      const forms = FORMAS[r.kind];
      // o maior oceano pede "Oceano"; o resto, "Mar"
      const outro = (r.kind === 'mar' || r.kind === 'lago') ? MAR_DO_PLANO[natureza] : undefined;
      const f = outro ? outro[r.area > 0.2 ? 0 : 1] : r.kind === 'mar' && r.area > 0.2 ? 'Oceano {n}' : forms[Math.floor(rng() * forms.length)]!;
      const name = f.replace('{n}', n);
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
    return styledName(style, rng);
  });
}

/** Nome de um acidente geográfico ("Monte Thorak", "Quedas de Aelwyn"). */
export function nomearAcidentes(feats: Array<PontoAtlas<AcidenteId>>, styleId: string | null, seed: number): string[] {
  const style = nameStyleFor(styleId, seed);
  const rng = seededRng(seed * 17 + 3);
  return feats.map((f) => {
    const pre = ACIDENTES[f.kind].nome;
    return `${pre[Math.floor(rng() * pre.length)]!} ${styledName(style, rng)}`;
  });
}

// ------------------------------------------------------------------ povoar

export interface PovoadoMapa {
  nome: string;
  x: number;
  y: number;
  kind: Estrutura;
  /** por que aqui: água, terra boa, minério... */
  motivo: string;
}

/**
 * Onde um povo de verdade construiria: perto de água doce, em terra boa e
 * plana, no litoral abrigado, junto de minério. Devolve `n` povoados (a
 * maior cidade vira capital, cidades costeiras viram porto, minas ficam
 * nos veios e fortes nas passagens das serras), longe dos marcadores que
 * já existem.
 */
export function povoarMapa(t: Terrain, n: number, taken: Array<{ x: number; y: number }>, opts: { seed?: number; nomes?: string | null } = {}): PovoadoMapa[] {
  const a = t.atlas;
  const seed = opts.seed ?? t.seed;
  const rng = seededRng(seed * 31 + 1);
  const style = nameStyleFor(opts.nomes ?? null, t.seed);
  const S = Math.max(1, Math.round(t.w / 120));
  const FERTIL: Record<string, number> = {
    pradaria: 1, floresta: 0.8, mediterraneo: 1, savana: 0.75, floresta_seca: 0.7, floresta_umida: 0.55, selva: 0.4, taiga: 0.35,
    pantano: 0.25, mangue: 0.3, tundra: 0.12, alpino: 0.2, ermos: 0.15, deserto: 0.06, deserto_frio: 0.08, praia: 0.5, vulcanico: 0.3,
  };
  const cands: Array<{ x: number; y: number; score: number; agua: string; costa: boolean }> = [];
  for (let y = S; y < t.h - S; y += S) {
    for (let x = S; x < t.w - S; x += S) {
      const i = y * t.w + x;
      if (t.height[i]! < t.sea || t.lake[i]) continue;
      const alt = altitudeM(t.height[i]!, t.sea);
      if (alt > 2200) continue;
      const bio = a ? BIOMAS[a.biome[i]!]!.id : 'pradaria';
      let s = FERTIL[bio] ?? 0.3;
      let agua = '';
      let costa = false;
      // água: rio, lago ou mar por perto
      let rio = 0;
      let mar = false;
      let lago = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const j = (y + dy) * t.w + x + dx;
        if (j < 0 || j >= t.w * t.h) continue;
        if (t.height[j]! < t.sea) mar = true;
        else if (t.lake[j]) lago = true;
        else rio = Math.max(rio, t.flow[j]! / t.riverMin);
      }
      if (rio >= 1) {
        s += Math.min(1.2, 0.35 + Math.log2(rio) * 0.2);
        agua = 'rio';
      }
      if (lago) {
        s += 0.4;
        agua ||= 'lago';
      }
      if (mar) {
        s += 0.45;
        costa = true;
        agua ||= 'mar';
      }
      if (!agua) s *= 0.35;
      s -= alt / 4000;
      s += (rng() - 0.5) * 0.25;
      cands.push({ x: (x + 0.5) / t.w * 100, y: (y + 0.5) / t.h * 100, score: s, agua, costa });
    }
  }
  cands.sort((p, q) => q.score - p.score);
  const out: PovoadoMapa[] = [];
  const all = [...taken];
  let gap = 9;
  const usados = new Set<string>();
  const nome = () => {
    for (let k = 0; k < 10; k++) {
      const v = styledName(style, rng);
      if (!usados.has(v)) {
        usados.add(v);
        return v;
      }
    }
    return styledName(style, rng);
  };
  const round = (v: number) => Math.round(v * 10) / 10;
  for (let pass = 0; pass < 3 && out.length < n; pass++) {
    for (const c of cands) {
      if (out.length >= n) break;
      if (all.some((p) => Math.hypot(p.x - c.x, (p.y - c.y) / (t.w / t.h)) < gap)) continue;
      const rank = out.length;
      let kind: Estrutura = rank === 0 ? 'capital' : rank < 1 + Math.ceil(n / 6) ? 'cidade' : rank < Math.ceil(n / 2) ? 'vila' : 'aldeia';
      if (c.costa && (kind === 'cidade' || kind === 'vila') && rng() < 0.6) kind = 'porto';
      const motivo = c.agua === 'rio' ? 'à beira de um rio' : c.agua === 'lago' ? 'junto a um lago' : c.agua === 'mar' ? 'no litoral' : 'terra boa, longe da água';
      const p = { nome: nome(), x: round(c.x), y: round(c.y), kind, motivo };
      out.push(p);
      all.push(p);
    }
    gap *= 0.7;
  }
  // minas junto do minério, fortes nas serras, templos e ruínas aqui e ali
  if (a) {
    const metal = a.resources.filter((r) => ['ferro', 'cobre', 'ouro', 'prata', 'estanho', 'gemas', 'carvao'].includes(r.kind));
    for (const r of metal.slice(0, Math.max(1, Math.round(n / 5)))) {
      if (all.some((p) => Math.hypot(p.x - r.x, p.y - r.y) < 4)) continue;
      const p = { nome: `Mina de ${nome()}`, x: r.x, y: r.y, kind: 'mina' as Estrutura, motivo: `veio de ${RECURSOS[r.kind].label.toLowerCase()}` };
      out.push(p);
      all.push(p);
    }
    const serras = a.regions.filter((r) => r.kind === 'cordilheira').slice(0, 2);
    for (const r of serras) {
      const d = (r.length / 2) * (rng() < 0.5 ? -1 : 1);
      const ang = (r.angle * Math.PI) / 180;
      const p = { nome: `Forte ${nome()}`, x: round(clamp(r.x + Math.cos(ang) * d, 2, 98)), y: round(clamp(r.y + Math.sin(ang) * d * (t.w / t.h), 2, 98)), kind: 'forte' as Estrutura, motivo: 'guarda a passagem da serra' };
      if (!all.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 4)) {
        out.push(p);
        all.push(p);
      }
    }
  }
  const extras: Array<[Estrutura, string, string]> = [['templo', 'Templo de', 'lugar sagrado'], ['ruina', 'Ruínas de', 'o que sobrou de outra era'], ['torre', 'Torre de', 'vigia ou mago solitário']];
  for (const [kind, pre, motivo] of extras) {
    for (let k = 0; k < 60; k++) {
      const c = cands[Math.floor(rng() * Math.min(cands.length, 400))];
      if (!c || all.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 6)) continue;
      const p = { nome: `${pre} ${nome()}`, x: round(c.x), y: round(c.y), kind, motivo };
      out.push(p);
      all.push(p);
      break;
    }
  }
  return out;
}
