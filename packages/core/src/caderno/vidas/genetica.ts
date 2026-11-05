import type { Rng } from '../../rpg/dice';
import type { Genoma, Pessoa, Sexo } from './tipos';

/*
 * Genética da simulação de vidas.
 *
 * Olhos e cabelo são mendelianos: cada pessoa tem dois alelos, um de cada
 * pai, e o dominante aparece (castanho > verde > azul; escuro > loiro > ruivo).
 * Dois pais de olhos castanhos podem ter um filho de olhos azuis, se os dois
 * carregarem o alelo escondido.
 *
 * Altura, força, intelecto, beleza, saúde, fertilidade e longevidade são
 * quantitativos (muitos genes): cada alelo é um número de 0 a 1, o filho
 * herda um de cada pai com uma pequena mutação, e o valor expresso é a média.
 * Os extremos viram traços de nascença (genial, belo, frágil...).
 *
 * O "sangue fraco" é uma doença recessiva: só aparece com dois alelos. Entre
 * parentes, a chance de os dois alelos virem do mesmo ancestral sobe
 * (consanguinidade) e a doença aparece mais.
 */

const OLHOS = 'CVA';
const CABELO = 'ELR';
const QUANT = ['altura', 'forca', 'intelecto', 'beleza', 'saude', 'fertilidade', 'longevidade', 'gemeos'] as const;
type Quant = (typeof QUANT)[number];

export const NOMES_OLHOS: Record<string, string> = { C: 'castanhos', V: 'verdes', A: 'azuis' };
export const NOMES_CABELO: Record<string, string> = { E: 'escuro', L: 'loiro', R: 'ruivo' };

const dominante = (ordem: string, [a, b]: [string, string]) => (ordem.indexOf(a) <= ordem.indexOf(b) ? a : b);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Soma de dois uniformes: um sino simples entre 0 e 1. */
const sino = (rng: Rng) => (rng() + rng()) / 2;

/** Frequência dos alelos numa população qualquer. */
function aleloOlho(rng: Rng): string {
  const r = rng();
  return r < 0.55 ? 'C' : r < 0.7 ? 'V' : 'A';
}
function aleloCabelo(rng: Rng): string {
  const r = rng();
  return r < 0.68 ? 'E' : r < 0.88 ? 'L' : 'R';
}

export function genomaAleatorio(rng: Rng): Genoma {
  const q = () => [sino(rng), sino(rng)] as [number, number];
  return {
    olhos: [aleloOlho(rng), aleloOlho(rng)],
    cabelo: [aleloCabelo(rng), aleloCabelo(rng)],
    altura: q(), forca: q(), intelecto: q(), beleza: q(), saude: q(), fertilidade: q(), longevidade: q(),
    sangue: [rng() < 0.06, rng() < 0.06],
    gemeos: [rng() * 0.6, rng() * 0.6],
  };
}

/**
 * Genoma de um filho. `f` é o coeficiente de consanguinidade (0 a 0,5): a
 * chance de os dois alelos de um gene virem do mesmo ancestral.
 */
export function herdar(mae: Genoma, pai: Genoma, rng: Rng, f = 0): Genoma {
  const um = <T>(par: [T, T]): T => par[rng() < 0.5 ? 0 : 1];
  const par = <T>(a: [T, T], b: [T, T], muta: (x: T) => T): [T, T] => {
    const x = muta(um(a));
    // consanguinidade: o segundo alelo é cópia do primeiro (mesma origem)
    const y = rng() < f ? x : muta(um(b));
    return rng() < 0.5 ? [x, y] : [y, x];
  };
  const discreto = (ordem: string) => (x: string) => (rng() < 0.01 ? ordem[Math.floor(rng() * ordem.length)]! : x);
  const quant = (x: number) => clamp01(x + (rng() - 0.5) * 0.12);
  const g = {
    olhos: par(mae.olhos, pai.olhos, discreto(OLHOS)),
    cabelo: par(mae.cabelo, pai.cabelo, discreto(CABELO)),
    sangue: par(mae.sangue, pai.sangue, (x: boolean) => (rng() < 0.005 ? !x : x)),
  } as Partial<Genoma>;
  for (const k of QUANT) (g as Record<Quant, [number, number]>)[k] = par(mae[k], pai[k], quant);
  return g as Genoma;
}

/** Valor expresso de um gene quantitativo (0 a 1). */
export const expresso = (g: Genoma, k: Quant): number => (g[k][0] + g[k][1]) / 2;

export const olhosDe = (g: Genoma): string => NOMES_OLHOS[dominante(OLHOS, g.olhos)]!;
export const cabeloDe = (g: Genoma): string => NOMES_CABELO[dominante(CABELO, g.cabelo)]!;

/** Altura em centímetros (adulto). */
export const alturaDe = (g: Genoma, sexo: Sexo): number => Math.round(150 + expresso(g, 'altura') * 42 + (sexo === 'm' ? 10 : 0));

/** Traços de nascença que os genes expressam. */
export function tracosDosGenes(g: Genoma, f = 0): string[] {
  const out: string[] = [];
  const v = (k: Quant) => expresso(g, k);
  if (v('intelecto') > 0.86) out.push('genial');
  else if (v('intelecto') < 0.14) out.push('lento');
  if (v('beleza') > 0.86) out.push('belo');
  else if (v('beleza') < 0.14) out.push('feio');
  if (v('saude') > 0.86) out.push('robusto');
  else if (v('saude') < 0.14) out.push('fragil');
  if (v('altura') > 0.9) out.push('gigante');
  else if (v('altura') < 0.1) out.push('miudo');
  if (v('fertilidade') < 0.08) out.push('esteril');
  if (v('longevidade') > 0.86) out.push('longevo');
  if (g.sangue[0] && g.sangue[1]) out.push('sangue fraco');
  if (f >= 0.12) out.push('consanguineo');
  return out;
}

/**
 * Consanguinidade de um filho de `a` e `b`: soma, para cada ancestral comum,
 * de (1/2)^(passos até a + passos até b + 1). Irmãos → 0,25; primos → 0,0625.
 */
export function consanguinidade(a: string, b: string, pais: (id: string) => [string | null, string | null] | undefined, fundo = 6): number {
  const anc = (id: string) => {
    const m = new Map<string, number[]>();
    const walk = (x: string, d: number) => {
      if (d > fundo) return;
      m.set(x, [...(m.get(x) ?? []), d]);
      for (const p of pais(x) ?? []) if (p) walk(p, d + 1);
    };
    walk(id, 0);
    return m;
  };
  const A = anc(a);
  const B = anc(b);
  let f = 0;
  for (const [x, da] of A) {
    const db = B.get(x);
    if (!db) continue;
    for (const i of da) for (const j of db) f += Math.pow(0.5, i + j + 1);
  }
  return Math.min(0.5, f);
}

/** Atributos visíveis de uma pessoa (0 a 1), já com idade e marcas do corpo. */
export function atributos(p: Pessoa, idade: number): { forca: number; agilidade: number; intelecto: number; beleza: number; fertilidade: number } {
  const g = p.genes;
  const escala = 70 / Math.max(20, p.vida);
  const i = idade * escala;
  // força cresce até ~25 e cai depois dos 50
  const curva = i < 16 ? 0.35 + i / 30 : i < 50 ? 1 : Math.max(0.35, 1 - (i - 50) / 45);
  const marcas = (id: string, x: number) => (p.tracos.includes(id) ? x : 0);
  return {
    forca: clamp01(expresso(g, 'forca') * curva + p.hab.combate / 80 - marcas('mutilado', 0.25)),
    agilidade: clamp01((1 - expresso(g, 'altura') * 0.3) * curva + p.hab.combate / 60 - marcas('manco', 0.3)),
    intelecto: clamp01(expresso(g, 'intelecto') + p.hab.saber / 100),
    beleza: clamp01(expresso(g, 'beleza') - Math.max(0, i - 40) / 120 - marcas('cicatriz', 0.05) - marcas('caolho', 0.1)),
    fertilidade: p.tracos.includes('esteril') ? 0 : clamp01(expresso(g, 'fertilidade') * 0.7 + 0.3),
  };
}

// ------------------------------------------------------------------ texto

const pct = (x: number) => Math.round(x * 100);

/** "olhos C/V · cabelo E/R · altura 61/57 · ..." — legível e relido por `lerGenoma`. */
export function genomaTexto(g: Genoma): string {
  const q = (k: Quant, nome: string) => `${nome} ${pct(g[k][0])}/${pct(g[k][1])}`;
  return [
    `olhos ${g.olhos[0]}/${g.olhos[1]}`, `cabelo ${g.cabelo[0]}/${g.cabelo[1]}`, q('altura', 'altura'), q('forca', 'força'), q('intelecto', 'intelecto'),
    q('beleza', 'beleza'), q('saude', 'saúde'), q('fertilidade', 'fertilidade'), q('longevidade', 'longevidade'), q('gemeos', 'gêmeos'),
    `sangue ${g.sangue[0] ? 's' : '-'}/${g.sangue[1] ? 's' : '-'}`,
  ].join(' · ');
}

/** Lê o que `genomaTexto` escreveu; genes que faltam vêm de `base`. */
export function lerGenoma(texto: string, base: Genoma): Genoma {
  const g: Genoma = JSON.parse(JSON.stringify(base)) as Genoma;
  const s = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const disc = (nome: string, ordem: string, k: 'olhos' | 'cabelo') => {
    const m = new RegExp(`${nome}\\s+([a-z])\\s*/\\s*([a-z])`).exec(s);
    if (m && ordem.includes(m[1]!.toUpperCase()) && ordem.includes(m[2]!.toUpperCase())) g[k] = [m[1]!.toUpperCase(), m[2]!.toUpperCase()];
  };
  disc('olhos', OLHOS, 'olhos');
  disc('cabelo', CABELO, 'cabelo');
  const nomes: Record<string, Quant> = { altura: 'altura', forca: 'forca', intelecto: 'intelecto', beleza: 'beleza', saude: 'saude', fertilidade: 'fertilidade', longevidade: 'longevidade', gemeos: 'gemeos' };
  for (const [n, k] of Object.entries(nomes)) {
    const m = new RegExp(`${n}\\s+(\\d+)\\s*/\\s*(\\d+)`).exec(s);
    if (m) g[k] = [clamp01(Number(m[1]) / 100), clamp01(Number(m[2]) / 100)];
  }
  const sg = /sangue\s+([s-])\s*\/\s*([s-])/.exec(s);
  if (sg) g.sangue = [sg[1] === 's', sg[2] === 's'];
  return g;
}

/** Acerta os alelos para bater com a aparência escrita na ficha ("olhos: azuis"). */
export function ajustarAparencia(g: Genoma, olhos: string, cabelo: string, rng: Rng): Genoma {
  const out: Genoma = { ...g, olhos: [...g.olhos], cabelo: [...g.cabelo] };
  const fit = (texto: string, nomes: Record<string, string>, ordem: string, k: 'olhos' | 'cabelo') => {
    const t = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (!t) return;
    const alvo = Object.entries(nomes).find(([, n]) => t.includes(n.normalize('NFD').replace(/\p{M}/gu, '').slice(0, 4)))?.[0];
    if (!alvo) return;
    // o alvo precisa ser o dominante: um alelo é ele; o outro, ele ou algo mais recessivo
    const recessivos = ordem.slice(ordem.indexOf(alvo));
    out[k] = [alvo, recessivos[Math.floor(rng() * recessivos.length)]!];
  };
  fit(olhos, NOMES_OLHOS, OLHOS, 'olhos');
  fit(cabelo, NOMES_CABELO, CABELO, 'cabelo');
  return out;
}
