import { seededRng, type Rng } from '../rpg/dice';
import { asList, asText } from './frontmatter';
import { readRecords, writeRecords, type Rec } from './markdown';

/*
 * Idiomas inventados.
 *
 * Um idioma é uma ficha `tipo: idioma` com um `som` (um dos jeitos prontos:
 * suave, áspero, sibilante...) ou com as próprias `consoantes`, `vogais` e
 * `sílabas` (padrões como CV, CVC, V). Com a `semente`, cada significado vira
 * sempre a mesma palavra: "água" em Élfico Alto é a mesma palavra em
 * qualquer aparelho, e o dicionário da nota (tabela "## Dicionário") vale
 * mais que o sorteio: o que a pessoa escreveu ali é a palavra.
 *
 * Serve para nomes: de gente, de lugar (com a palavra para "rio", "monte"...)
 * e para traduzir frases curtas, palavra por palavra.
 */

export interface Phonology {
  id: string;
  label: string;
  desc: string;
  consoantes: string[];
  vogais: string[];
  /** padrões de sílaba: C = consoante, V = vogal, N = nasal/líquida no fim */
  silabas: string[];
  /** consoantes que fecham sílaba (N) */
  finais: string[];
  /** sílabas por palavra: pesos para 1, 2, 3, 4 */
  tamanho: [number, number, number, number];
}

export const PHONOLOGIES: Phonology[] = [
  { id: 'suave', label: 'Suave', desc: 'Fluido e musical, cheio de L, R e vogais abertas.', consoantes: ['l', 'r', 'n', 'm', 's', 'th', 'v', 'f', 'el', 'y'], vogais: ['a', 'e', 'i', 'o', 'ae', 'ia', 'ie'], silabas: ['CV', 'CV', 'V', 'CVN'], finais: ['n', 'l', 'r', 's', 'th'], tamanho: [1, 4, 4, 2] },
  { id: 'aspero', label: 'Áspero', desc: 'Duro e cortante, consoantes batidas e grupos pesados.', consoantes: ['k', 'g', 'r', 'd', 't', 'z', 'kh', 'gr', 'dr', 'b', 'th'], vogais: ['a', 'u', 'o', 'i'], silabas: ['CVC', 'CV', 'CVC', 'CCVC'], finais: ['k', 'g', 'r', 'z', 'd', 'th', 'm'], tamanho: [3, 5, 2, 0] },
  { id: 'sibilante', label: 'Sibilante', desc: 'Sussurrado, de serpente: S, SH, Z e vogais finas.', consoantes: ['s', 'sh', 'z', 'ss', 'h', 'k', 't', 'x'], vogais: ['i', 'e', 'a', 'ei'], silabas: ['CV', 'CVC', 'VC'], finais: ['s', 'sh', 'th', 'x'], tamanho: [1, 4, 3, 1] },
  { id: 'cantado', label: 'Cantado', desc: 'Aberto e redondo, quase sem consoante no fim da sílaba.', consoantes: ['m', 'n', 'l', 'y', 'w', 'h', 'k', 'p', 't'], vogais: ['a', 'i', 'u', 'o', 'e', 'ai', 'au'], silabas: ['CV', 'CV', 'V'], finais: ['n'], tamanho: [0, 3, 5, 3] },
  { id: 'gutural', label: 'Gutural', desc: 'Do fundo da garganta: GH, KH, Q, R arrastado.', consoantes: ['gh', 'kh', 'q', 'r', 'x', 'g', 'k', 'rr', 'b', 'm'], vogais: ['a', 'u', 'o', 'aa', 'uu'], silabas: ['CVC', 'CV', 'VC'], finais: ['k', 'g', 'kh', 'q', 'rr', 'm', 'n'], tamanho: [3, 5, 2, 0] },
  { id: 'nasal', label: 'Nasal', desc: 'Macio e anasalado, com NG, NY e vogais longas.', consoantes: ['ng', 'n', 'ny', 'm', 'b', 'd', 'j', 'w', 'y', 'p'], vogais: ['a', 'o', 'u', 'e', 'i', 'oa', 'ua'], silabas: ['CV', 'CVN', 'V'], finais: ['n', 'ng', 'm'], tamanho: [1, 4, 4, 1] },
  { id: 'antigo', label: 'Antigo', desc: 'Solene, de inscrição de pedra: grupos raros e terminações longas.', consoantes: ['th', 'v', 'k', 'r', 'n', 's', 'd', 'm', 'l', 'ph', 'x', 'z'], vogais: ['a', 'e', 'o', 'u', 'y', 'ae', 'eo'], silabas: ['CV', 'CVC', 'V', 'CCV'], finais: ['n', 'x', 'th', 's', 'r'], tamanho: [1, 3, 4, 3] },
  { id: 'tupi', label: 'Tupi', desc: 'Com o som das línguas tupi: vogais claras, I e Y, sílabas abertas.', consoantes: ['p', 't', 'k', 'm', 'n', 'r', 's', 'g', 'y', 'j', 'mb', 'nd'], vogais: ['a', 'e', 'i', 'o', 'u', 'y'], silabas: ['CV', 'CV', 'V'], finais: [], tamanho: [1, 4, 4, 2] },
];

export interface Language {
  name: string;
  phon: Phonology;
  seed: number;
  /** palavra → significado, do dicionário da nota (vence o sorteio) */
  dict: Map<string, string>;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const prop = (props: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(props).find((p) => fold(p) === fold(k));
    if (key) {
      const v = asText(props[key] as never).trim();
      if (v) return v;
    }
  }
  return '';
};
const list = (props: Record<string, unknown>, ...keys: string[]): string[] => {
  for (const k of keys) {
    const key = Object.keys(props).find((p) => fold(p) === fold(k));
    if (key) {
      const v = asList(props[key] as never).flatMap((x) => x.split(/[\s,]+/)).map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (v.length) return v;
    }
  }
  return [];
};

export const phonology = (id: string | null | undefined): Phonology => {
  const k = fold(id ?? '');
  return PHONOLOGIES.find((p) => p.id === k || fold(p.label) === k) ?? PHONOLOGIES[0]!;
};

/** Idioma a partir da ficha (propriedades e o texto da nota, para o dicionário). */
export function languageOf(name: string, props: Record<string, unknown>, text = ''): Language {
  const base = phonology(prop(props, 'som', 'sonoridade', 'estilo'));
  const cons = list(props, 'consoantes');
  const vog = list(props, 'vogais');
  const sil = list(props, 'sílabas', 'silabas').map((x) => x.toUpperCase()).filter((x) => /^[CVN]+$/.test(x));
  const phon: Phonology = { ...base, consoantes: cons.length ? cons : base.consoantes, vogais: vog.length ? vog : base.vogais, silabas: sil.length ? sil : base.silabas };
  const raw = prop(props, 'semente', 'seed');
  const seed = raw && Number.isFinite(Number(raw)) ? Math.trunc(Number(raw)) : hashStr(fold(name));
  const dict = new Map<string, string>();
  for (const r of readDictionary(text)) if (r.palavra && r.significado) dict.set(fold(r.significado), r.palavra);
  return { name, phon, seed, dict };
}

function weighted(rng: Rng, w: readonly number[]): number {
  const total = w.reduce((a, b) => a + b, 0) || 1;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r <= 0) return i;
  }
  return w.length - 1;
}
const pickR = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

function syllable(p: Phonology, pattern: string, rng: Rng, first: boolean): string {
  let s = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === 'V') s += pickR(rng, p.vogais);
    else if (c === 'N') s += p.finais.length ? pickR(rng, p.finais) : '';
    else if (c === 'C') {
      // consoante no fim da sílaba (CVC): prefere as finais
      const end = i === pattern.length - 1 && i > 0;
      s += end && p.finais.length && rng() < 0.7 ? pickR(rng, p.finais) : pickR(rng, p.consoantes);
    }
  }
  void first;
  return s;
}

/** Palavra nova com o som do idioma (sorteada pelo `rng`). */
export function makeWord(p: Phonology, rng: Rng, sylls?: number): string {
  const n = sylls ?? 1 + weighted(rng, p.tamanho);
  let w = '';
  for (let i = 0; i < n; i++) w += syllable(p, pickR(rng, p.silabas), rng, i === 0);
  // sem letras triplicadas nem vogal repetida demais
  return w.replace(/(.)\1\1+/g, '$1$1').replace(/([aeiouy])\1{2,}/g, '$1$1');
}

/** A palavra do idioma para um significado: a do dicionário, ou sempre a mesma sorteada. */
export function wordFor(lang: Language, meaning: string): string {
  const k = fold(meaning);
  const fixed = lang.dict.get(k);
  if (fixed) return fixed;
  const rng = seededRng((lang.seed ^ hashStr(k)) >>> 0);
  // palavras do dia a dia são curtas
  const short = CORE_WORDS.indexOf(k) >= 0 && CORE_WORDS.indexOf(k) < 40;
  return makeWord(lang.phon, rng, short ? 1 + Math.floor(rng() * 2) : undefined);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Nomes de pessoas no idioma. */
export function languageNames(lang: Language, n: number, rng: Rng): string[] {
  const out = new Set<string>();
  for (let k = 0; k < n * 10 && out.size < n; k++) {
    const w = makeWord(lang.phon, rng, 2 + Math.floor(rng() * 2));
    if (w.length >= 3 && w.length <= 12) out.add(cap(w));
  }
  return [...out];
}

const PLACE_ROOTS = ['rio', 'monte', 'floresta', 'cidade', 'lago', 'mar', 'pedra', 'fortaleza', 'vale', 'terra', 'estrela', 'sol', 'lua', 'fogo', 'gelo'];
const PLACE_ADJ = ['grande', 'velho', 'novo', 'negro', 'branco', 'alto', 'sagrado', 'vermelho', 'dourado', 'frio'];

/** Nomes de lugar que querem dizer alguma coisa: "Kaar-dun" (Monte Negro). */
export function languagePlaces(lang: Language, n: number, rng: Rng): Array<{ nome: string; sentido: string }> {
  const out: Array<{ nome: string; sentido: string }> = [];
  for (let k = 0; k < n * 6 && out.length < n; k++) {
    const root = pickR(rng, PLACE_ROOTS);
    const adj = pickR(rng, PLACE_ADJ);
    const a = wordFor(lang, root);
    const b = wordFor(lang, adj);
    const glue = rng() < 0.4 ? '' : rng() < 0.5 ? '-' : ' ';
    const nome = rng() < 0.5 ? cap(a) + glue + (glue === ' ' ? cap(b) : b) : cap(b) + glue + (glue === ' ' ? cap(a) : a);
    const sentido = `${cap(root)} ${fem(root, adj) ? adj.replace(/o$/, 'a') : adj}`;
    if (!out.some((o) => o.nome === nome)) out.push({ nome, sentido });
  }
  return out;
}
const FEM = new Set(['floresta', 'cidade', 'pedra', 'fortaleza', 'terra', 'estrela', 'lua']);
const fem = (root: string, adj: string) => FEM.has(root) && /o$/.test(adj);

/** Palavras que não se traduzem (viram nada): artigos e preposições curtas. */
const SKIP = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'que']);

/** Tradução palavra por palavra (o significado de cada palavra é o seu, em minúsculas). */
export function translate(lang: Language, phrase: string): Array<{ from: string; to: string }> {
  return phrase
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter(Boolean)
    .filter((w) => !SKIP.has(fold(w)))
    .map((w) => ({ from: w, to: wordFor(lang, w) }));
}

/** Significados básicos para começar um dicionário (os primeiros são as palavras curtas do dia a dia). */
export const CORE_WORDS = [
  'eu', 'tu', 'nós', 'sim', 'não', 'um', 'dois', 'três', 'água', 'fogo', 'terra', 'ar', 'sol', 'lua', 'dia', 'noite', 'mãe', 'pai', 'filho', 'casa',
  'comer', 'beber', 'ir', 'ver', 'dar', 'bom', 'mau', 'grande', 'pequeno', 'velho', 'novo', 'mão', 'olho', 'sangue', 'nome', 'pedra', 'árvore', 'rio', 'mar', 'céu',
  'estrela', 'montanha', 'floresta', 'cidade', 'caminho', 'povo', 'rei', 'rainha', 'deus', 'morte', 'vida', 'amor', 'guerra', 'paz', 'amigo', 'inimigo', 'ferro', 'ouro',
  'luz', 'sombra', 'vento', 'chuva', 'gelo', 'falar', 'lutar', 'dormir', 'morrer', 'nascer', 'lembrar', 'esquecer', 'honra', 'coragem', 'medo', 'magia', 'espírito',
];

// ------------------------------------------------------------------ dicionário da nota

const DICT_COLS = { palavra: ['Palavra', 'Termo'], significado: ['Significado', 'Sentido', 'Tradução'], classe: ['Classe', 'Tipo'], nota: ['Nota', 'Notas', 'Uso'] };
export const DICT_SECTION = 'Dicionário';

export function readDictionary(text: string): Array<Rec<keyof typeof DICT_COLS>> {
  return readRecords(text, DICT_SECTION, DICT_COLS).filter((r) => r.palavra.trim());
}

/** Acrescenta (ou troca) palavras no dicionário da nota, mantendo o resto da tabela. */
export function addToDictionary(text: string, entries: Array<{ palavra: string; significado: string; classe?: string }>): string {
  const cur = readRecords(text, DICT_SECTION, DICT_COLS);
  for (const e of entries) {
    const i = cur.findIndex((r) => fold(r.significado) === fold(e.significado));
    const rec = { palavra: e.palavra, significado: e.significado, classe: e.classe ?? '', nota: '' };
    if (i >= 0) cur[i] = { ...cur[i]!, palavra: e.palavra, ...(e.classe ? { classe: e.classe } : {}) };
    else cur.push(rec);
  }
  return writeRecords(text, DICT_SECTION, DICT_COLS, cur.sort((a, b) => a.palavra.localeCompare(b.palavra, 'pt-BR')));
}

/** Uma amostra do idioma: algumas palavras, para mostrar como soa. */
export function languageSample(lang: Language, n = 8): Array<{ significado: string; palavra: string }> {
  return CORE_WORDS.slice(8, 8 + n).map((m) => ({ significado: m, palavra: wordFor(lang, m) }));
}
