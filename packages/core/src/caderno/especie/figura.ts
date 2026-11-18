import { asList } from '../frontmatter';
import { SPECIES_COLORS, SPECIES_PLANS, speciesPlan, type SpeciesPlan } from './catalogo';

/*
 * Lê a ficha e devolve os parâmetros do desenho. Aceita fichas antigas: quem só
 * marcou "chifres" ou "asas" nos traços ganha a forma padrão daquele corpo.
 */

export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Valor de um campo da espécie na ficha (aceita a chave sem acento). */
export function speciesValue(props: Record<string, unknown>, key: string): string {
  const k = Object.keys(props).find((p) => fold(p) === fold(key));
  return k ? asList(props[k] as never).join(', ') : '';
}

export interface SpeciesFigure {
  plano: SpeciesPlan;
  /** altura visível em metros (é o que vale na comparação de escala) */
  altura: number;
  /** o número digitado na ficha */
  medida: number;
  eixo: 'altura' | 'comprimento';
  cor: string;
  cor2: string;
  cor3: string;
  revestimento: string;
  textura: string;
  padrao: string;
  /** 1 = médio; menos é esguio, mais é pesado */
  porte: number;
  cabeca: string;
  cabecas: number;
  olhos: number;
  pupila: string;
  orelha: string;
  chifre: string;
  dentes: string;
  bracos: number;
  extremidade: string;
  asa: string;
  rabo: string;
  /** traços da ficha, sem acento */
  marcas: string[];
  chifres: boolean;
  cauda: boolean;
  asas: boolean;
  antenas: boolean;
  tentaculos: boolean;
  brilho: boolean;
  espinhos: boolean;
  juba: boolean;
  /** corpo de fumaça, luz ou vidro: o fundo aparece através dele */
  translucido: boolean;
}

const COLOR_TABLE: Record<string, string> = Object.fromEntries(Object.entries(SPECIES_COLORS).map(([k, v]) => [fold(k), v]));
const colorWords = (s: string) =>
  fold(s).split(/[^a-z]+/).filter((w) => w.length > 2)
    .map((w) => COLOR_TABLE[w] ?? Object.entries(COLOR_TABLE).find(([k]) => w.startsWith(k.slice(0, 5)))?.[1])
    .filter((x): x is string => !!x);

/** Mistura duas cores #rrggbb. */
export function mixHex(a: string, b: string, t: number): string {
  const n = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(n(a, i) + (n(b, i) - n(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

const COAT: Array<[RegExp, string, string]> = [
  [/escama/, '#4f8a4b', '#d4a53c'], [/pena/, '#c08a3e', '#5f3f2a'], [/pelo/, '#7a5236', '#2b2a2e'], [/^la$/, '#efe1bf', '#7a5236'],
  [/quitina/, '#5f3f2a', '#d9772b'], [/casca veg|musgo/, '#5d6b3a', '#7a5236'], [/casca/, '#a8713a', '#5f3f2a'], [/placa/, '#8a8c92', '#55585f'],
  [/couro/, '#6e6256', '#3a3b40'], [/gosma/, '#3aa6a0', '#7fb6dc'], [/coral/, '#e0705a', '#efe1bf'], [/cristal/, '#46b4c4', '#a98ad0'],
  [/pedra/, '#8a8c92', '#55585f'], [/metal/, '#b8c0c8', '#a8713a'], [/gelo/, '#7fb6dc', '#ece8df'], [/osso/, '#e6dcc0', '#55585f'],
  [/chama/, '#d9772b', '#e2c044'], [/lava/, '#3a3b40', '#d9772b'], [/sombra/, '#3a3b40', '#6e4c9a'], [/luz/, '#e2c044', '#ece8df'], [/nevoa/, '#b8c0c8', '#7fb6dc'],
];

const TEXTURES: Array<[RegExp, string]> = [
  [/escama/, 'escamas'], [/pelo|^la$/, 'pelo'], [/pena/, 'penas'], [/quitina|placa/, 'placas'], [/casca veg/, 'casca'], [/musgo/, 'musgo'], [/casca/, 'placas'],
  [/cristal|gelo/, 'facetas'], [/pedra|lava|coral/, 'rachaduras'], [/metal/, 'metal'], [/gosma/, 'bolhas'], [/couro/, 'couro'],
];

const COUNT: Record<string, number> = { nenhum: 0, nenhuma: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, muitos: 14 };
const strip = (s: string) => s.replace(/^(de|do|da|no|na)\s+/, '');

function defaultHead(plano: SpeciesPlan, rev: string): string {
  if (plano === 'alado') return /escama|placa|couro|pele/.test(rev) ? 'draconica' : /pelo|la/.test(rev) ? 'canina' : 'bico';
  if (plano === 'quadrupede' && /escama/.test(rev)) return 'reptiliana';
  return fold(SPECIES_PLANS[plano].cabeca ?? '');
}

function defaultEar(cabeca: string): string {
  return ({ humana: 'humanas', canina: 'caninas', felina: 'felinas', equina: 'caninas', bovina: 'caidas', tromba: 'caidas' } as Record<string, string>)[cabeca] ?? '';
}

function defaultLimb(plano: SpeciesPlan, cabeca: string, rev: string): string {
  if (/humana|caveira|sem rosto/.test(cabeca) && /bipede|centauroide|naga|sereiano|aracnoide|colosso/.test(plano)) return plano === 'centauroide' ? 'cascos' : 'maos';
  if (/equina|bovina/.test(cabeca)) return 'cascos';
  if (/escama|quitina|placa/.test(rev) || plano === 'dragao' || plano === 'teropode' || plano === 'alado') return 'garras';
  return plano === 'bipede' || plano === 'primata' ? 'maos' : 'patas';
}

/** Parâmetros do desenho da espécie a partir das propriedades. */
export function speciesFigure(props: Record<string, unknown>): SpeciesFigure {
  const v = (k: string) => fold(speciesValue(props, k));
  const plano = speciesPlan(v('corpo'));
  const info = SPECIES_PLANS[plano];
  const rev = v('revestimento');
  const typed = Number(v('altura').replace(',', '.').replace(/[^\d.]/g, ''));
  const medida = Number.isFinite(typed) && typed > 0 ? typed : info.altura;
  const altura = info.comprido ? medida * info.comprido : medida;

  const cores = colorWords(speciesValue(props, 'cor'));
  const coat = COAT.find(([re]) => re.test(rev));
  const cor = cores[0] ?? coat?.[1] ?? '#a07a5a';
  const cor2 = cores[1] ?? coat?.[2] ?? mixHex(cor, '#000000', 0.45);
  const cor3 = cores[2] ?? mixHex(cor, '#f3ead6', 0.62);

  const marcas = `${v('traços físicos')},${v('tracos fisicos')}`.split(',').map((t) => t.trim()).filter(Boolean);
  const tem = (re: RegExp) => marcas.some((m) => re.test(m));

  const cabeca = v('cabeça') || v('cabeca') || defaultHead(plano, rev);
  const cabecasTxt = v('cabeças') || v('cabecas');
  const cabecas = COUNT[cabecasTxt] ?? 1;

  const olhosTxt = v('olhos');
  const olhos = olhosTxt in COUNT ? COUNT[olhosTxt]! : tem(/olhos extras/) ? 4 : /\bcego\b/.test(v('sentidos')) || cabeca === 'sem rosto' ? 0 : 2;

  const chifreTxt = v('chifres');
  const chifre = chifreTxt.startsWith('sem') ? '' : chifreTxt ? strip(chifreTxt) : tem(/^chifres?$/) ? 'touro' : '';

  const orelhaTxt = v('orelhas');
  const orelha = orelhaTxt.startsWith('sem') ? '' : orelhaTxt ? strip(orelhaTxt) : tem(/orelhas? longas?/) ? 'longas' : defaultEar(cabeca);

  const asaTxt = v('asas');
  const asa = asaTxt.startsWith('sem') ? '' : asaTxt ? strip(asaTxt) : tem(/^asas?$/) || plano === 'alado' || plano === 'dragao' ? (/pena/.test(rev) ? 'penas' : 'membrana') : '';

  const caudaTxt = v('cauda');
  const rabo = caudaTxt.startsWith('sem') ? '' : caudaTxt ? strip(caudaTxt) : info.cauda ? strip(fold(info.cauda)) : tem(/^cauda$/) ? 'chicote' : '';

  const bracosTxt = v('braços') || v('bracos');
  const bracos = COUNT[bracosTxt] ?? 2;

  const porteTxt = v('porte');
  const peso = Number(v('peso').replace(',', '.').replace(/[^\d.]/g, ''));
  const porte = ({ esguio: 0.8, agil: 0.9, medio: 1, robusto: 1.2, massivo: 1.42 } as Record<string, number>)[porteTxt]
    ?? (peso > 0 && !info.comprido ? Math.min(1.42, Math.max(0.8, Math.cbrt(peso / Math.pow(medida, 3) / 13))) : 1);

  const padrao = v('padrão') || v('padrao');
  const luminoso = /chama|lava|luz/.test(rev);
  const translucido = /nevoa|sombra|luz/.test(rev) || tem(/translucido/) || plano === 'espectral';

  return {
    plano, altura, medida, eixo: info.comprido ? 'comprimento' : 'altura', cor, cor2, cor3, revestimento: rev,
    textura: TEXTURES.find(([re]) => re.test(rev))?.[1] ?? '', padrao: padrao === 'liso' ? '' : padrao, porte,
    cabeca, cabecas: Math.max(1, cabecas), olhos, pupila: v('pupila'), orelha, chifre,
    dentes: v('dentição') || v('denticao'), bracos, extremidade: v('extremidades') || defaultLimb(plano, cabeca, rev), asa, rabo, marcas,
    chifres: !!chifre, cauda: !!rabo, asas: !!asa, antenas: tem(/antena/) || plano === 'hexapode', tentaculos: tem(/^tentaculos$/) || plano === 'radial',
    brilho: luminoso || tem(/brilho|biolum/) || padrao === 'veios brilhantes', espinhos: tem(/espinho/), juba: tem(/juba/), translucido,
  };
}
