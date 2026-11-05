import type { Rng } from '../rpg/dice';
import { tensionsOf } from './conflitos';
import type { Entity, World } from './mundo';

/*
 * Geradores para destravar a escrita: nomes (num estilo ou aprendidos dos
 * nomes que o mundo já tem), traços de personagem e ganchos de história
 * feitos com as fichas de verdade do mundo. Tudo com Rng por parâmetro,
 * para os testes (e a "semente" da tela) repetirem o mesmo resultado.
 */

const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ nomes

export interface NameStyle {
  id: string;
  label: string;
  start: string[];
  mid: string[];
  end: string[];
}

export const NAME_STYLES: NameStyle[] = [
  { id: 'elfico', label: 'Élfico', start: ['ae', 'el', 'ith', 'lae', 'syl', 'gal', 'cel', 'fae', 'ny', 'ara', 'thal', 'ely'], mid: ['ri', 'la', 'nae', 'thi', 'wen', 'li', 'ro', 'ael', 'is'], end: ['wyn', 'iel', 'as', 'ion', 'ra', 'eth', 'ys', 'adriel', 'ien', 'ith'] },
  { id: 'anao', label: 'Anão', start: ['thor', 'dur', 'bal', 'gim', 'brok', 'dain', 'grun', 'mor', 'kaz', 'bor'], mid: ['ga', 'in', 'ru', 'ok', 'da', 'um'], end: ['in', 'ar', 'ok', 'grim', 'dun', 'rak', 'li', 'mund', 'dor'] },
  { id: 'nordico', label: 'Nórdico', start: ['bjor', 'sig', 'rag', 'ulf', 'hal', 'thy', 'ey', 'sva', 'ein', 'gun', 'ast'], mid: ['na', 'ri', 'vi', 'ge', 'ul'], end: ['n', 'rid', 'ar', 'vald', 'hild', 'ulf', 'mund', 'dis', 'leif', 'a'] },
  { id: 'latino', label: 'Latino', start: ['au', 'cae', 'mar', 'lu', 'oc', 'val', 'ser', 'fla', 'cor', 'tib', 'jul'], mid: ['re', 'li', 'ta', 'vi', 'ce', 'ri'], end: ['us', 'ia', 'ius', 'ina', 'or', 'illa', 'anus', 'ix', 'a'] },
  { id: 'oriental', label: 'Oriental', start: ['ka', 'shi', 'ryu', 'mei', 'hai', 'jin', 'ko', 'sa', 'ta', 'yu', 'li'], mid: ['ra', 'no', 'ki', 'ma', 'zu', 'ya'], end: ['ko', 'shi', 'ro', 'ka', 'mi', 'n', 'ji', 'ra', 'yan'] },
  { id: 'sombrio', label: 'Sombrio', start: ['mor', 'vex', 'zar', 'nyx', 'kael', 'drak', 'mal', 'vor', 'xan', 'sz'], mid: ['ga', 'tho', 'ze', 'rax', 'u', 'ul'], end: ['oth', 'ax', 'ys', 'goth', 'ra', 'zul', 'ek', 'ith', 'or'] },
  { id: 'tupi', label: 'Tupi', start: ['ara', 'ita', 'jaci', 'yby', 'pira', 'tai', 'gua', 'ubi', 'cau', 'tupa', 'mo'], mid: ['ra', 'ju', 'pi', 'ta', 'ca', 'po'], end: ['tã', 'ra', 'ju', 'ci', 'tinga', 'mirim', 'guaçu', 'pora', 'í'] },
];

/** Nome por sílabas de um estilo. */
export function styledName(style: NameStyle, rng: Rng): string {
  const parts = [pick(rng, style.start)];
  if (rng() < 0.45) parts.push(pick(rng, style.mid));
  parts.push(pick(rng, style.end));
  // evita letras triplicadas na junção ("thorrrak")
  return cap(parts.join('').replace(/(.)\1\1+/g, '$1$1'));
}

/**
 * Nomes "no estilo do mundo": uma cadeia de Markov de letras treinada nos
 * nomes que já existem. Precisa de uns 6 nomes para soar parecido; com menos,
 * devolve vazio e quem chama usa um estilo.
 */
export function markovNames(samples: string[], count: number, rng: Rng, order = 2): string[] {
  const words = [...new Set(samples.flatMap((s) => s.toLowerCase().split(/[\s\-']+/)).filter((w) => /^\p{L}{3,}$/u.test(w)))];
  if (words.length < 6) return [];
  const table = new Map<string, string[]>();
  for (const w of words) {
    const s = '^'.repeat(order) + w + '$';
    for (let i = 0; i + order < s.length; i++) {
      const k = s.slice(i, i + order);
      const l = table.get(k) ?? [];
      l.push(s[i + order]!);
      table.set(k, l);
    }
  }
  const known = new Set(words);
  const out = new Set<string>();
  for (let tries = 0; out.size < count && tries < count * 40; tries++) {
    let cur = '^'.repeat(order);
    let w = '';
    while (w.length < 14) {
      const next = table.get(cur.slice(-order));
      if (!next) break;
      const c = pick(rng, next);
      if (c === '$') break;
      w += c;
      cur += c;
    }
    if (w.length >= 3 && w.length <= 12 && !known.has(w)) out.add(cap(w));
  }
  return [...out];
}

const PLACE_FORMS = [
  (n: string) => n, (n: string) => `Vale de ${n}`, (n: string) => `Porto ${n}`, (n: string) => `${n}fell`, (n: string) => `Torre de ${n}`,
  (n: string) => `Montes ${n}`, (n: string) => `Bosque de ${n}`, (n: string) => `Forte ${n}`, (n: string) => `Lago ${n}`, (n: string) => `Ruínas de ${n}`,
];

/** Nome de lugar: um nome do estilo num molde ("Vale de…", "Porto…"). */
export const placeName = (style: NameStyle, rng: Rng): string => pick(rng, PLACE_FORMS)(styledName(style, rng));

const FACTION_FORMS = [
  (a: string, b: string) => `Ordem do ${a} ${b}`, (a: string, b: string) => `Irmandade da ${b}`, (a: string) => `Casa ${a}`,
  (a: string, b: string) => `Guilda dos ${b}s`, (a: string) => `Círculo de ${a}`, (a: string, b: string) => `Os ${b}s de ${a}`, (a: string) => `Companhia ${a}`,
];
const FACTION_WORDS = ['Sol', 'Lua', 'Ferro', 'Cinza', 'Véu', 'Corvo', 'Espinho', 'Brasa', 'Maré', 'Lâmina', 'Rosa', 'Chave', 'Serpente', 'Aurora'];

export const factionName = (style: NameStyle, rng: Rng): string => pick(rng, FACTION_FORMS)(styledName(style, rng), pick(rng, FACTION_WORDS));

// ------------------------------------------------------------------ traços

export const TRAIT_TABLES = {
  'motivação': ['vingar a família', 'provar seu valor ao pai', 'pagar uma dívida impossível', 'encontrar um lugar para pertencer', 'proteger um irmão mais novo',
    'recuperar uma terra perdida', 'descobrir a verdade sobre a própria origem', 'ficar rico antes dos trinta', 'redimir um erro antigo', 'ser lembrado depois de morto',
    'libertar o próprio povo', 'quebrar uma maldição'],
  medo: ['ser esquecido', 'água funda', 'perder o controle', 'ficar sozinho', 'o próprio reflexo', 'multidões', 'fogo', 'decepcionar o mentor', 'envelhecer', 'ser descoberto', 'o escuro', 'pássaros'],
  segredo: ['é filho bastardo de quem odeia', 'matou alguém por engano', 'não sabe ler', 'serve a dois mestres', 'já morreu uma vez', 'roubou o próprio nome',
    'está doente e ninguém sabe', 'ama o inimigo', 'foi quem começou o incêndio', 'guarda um mapa que não devia existir', 'ouve vozes', 'é muito mais velho do que parece'],
  maneirismo: ['fala de si na terceira pessoa', 'coleciona ossinhos', 'cantarola quando mente', 'nunca senta de costas para a porta', 'conta tudo em pares', 'cheira a cravo',
    'ri nas horas erradas', 'gagueja quando se irrita', 'nunca usa o nome verdadeiro', 'come só de noite', 'ajeita objetos tortos', 'cita provérbios inventados'],
  'virtude': ['leal até o fim', 'honesto de doer', 'paciente', 'generoso', 'corajoso', 'curioso', 'gentil com estranhos', 'disciplinado', 'engraçado', 'protetor'],
  'defeito': ['orgulhoso', 'ciumento', 'impulsivo', 'mentiroso compulsivo', 'covarde no aperto', 'cruel com os fracos', 'ganancioso', 'teimoso', 'desconfiado', 'preguiçoso'],
} as const;

export type TraitKey = keyof typeof TRAIT_TABLES;

/** Um de cada tabela: motivação, medo, segredo, maneirismo, virtude, defeito. */
export function rollTraits(rng: Rng): Record<TraitKey, string> {
  const out = {} as Record<TraitKey, string>;
  for (const k of Object.keys(TRAIT_TABLES) as TraitKey[]) out[k] = pick(rng, TRAIT_TABLES[k]);
  return out;
}

// ------------------------------------------------------------------ ganchos

const link = (e: Entity) => `[[${e.name}]]`;

type Pool = Record<'personagem' | 'lugar' | 'faccao' | 'item' | 'evento' | 'criatura' | 'conceito', Entity[]>;

const HOOKS: Array<{ need: Array<keyof Pool>; make: (x: Entity[]) => string }> = [
  { need: ['personagem', 'faccao'], make: ([p, f]) => `${link(p!)} descobre que ${link(f!)} esconde algo sobre a própria família.` },
  { need: ['personagem', 'item'], make: ([p, i]) => `${link(i!)} desaparece, e todas as pistas apontam para ${link(p!)}.` },
  { need: ['lugar', 'criatura'], make: ([l, c]) => `Viajantes param de voltar de ${link(l!)}. Os sobreviventes falam de ${link(c!)}.` },
  { need: ['personagem', 'personagem'], make: ([a, b]) => `${link(a!)} precisa da ajuda de ${link(b!)}, a última pessoa que gostaria de ver.` },
  { need: ['faccao', 'lugar'], make: ([f, l]) => `${link(f!)} reivindica ${link(l!)}, e ninguém sabe com que direito.` },
  { need: ['evento', 'personagem'], make: ([e, p]) => `Uma testemunha de ${link(e!)} aparece e diz que ${link(p!)} mentiu sobre o que aconteceu.` },
  { need: ['conceito', 'personagem'], make: ([c, p]) => `${link(p!)} usa ${link(c!)} de um jeito que deveria ser impossível.` },
  { need: ['item', 'lugar'], make: ([i, l]) => `Um mapa antigo diz que ${link(i!)} está escondido sob ${link(l!)}.` },
  { need: ['personagem', 'lugar'], make: ([p, l]) => `${link(p!)} volta a ${link(l!)} depois de anos e encontra tudo mudado; ninguém lembra do seu nome.` },
  { need: ['faccao'], make: ([f]) => `Um racha divide ${link(f!)}: metade quer guerra, metade quer fugir.` },
  { need: ['personagem'], make: ([p]) => `Alguém oferece a ${link(p!)} exatamente o que mais deseja, por um preço que só vai cobrar depois.` },
  { need: ['lugar'], make: ([l]) => `Em ${link(l!)}, os mortos da última guerra começam a ser vistos nas ruas.` },
];

/** Ganchos de história com as fichas do mundo (e as rivalidades que já existem). */
export function storyHooks(w: World, count: number, rng: Rng): string[] {
  const pool: Pool = { personagem: [], lugar: [], faccao: [], item: [], evento: [], criatura: [], conceito: [] };
  for (const e of w.entities) if (e.type in pool) pool[e.type as keyof Pool].push(e);
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const out = new Set<string>();

  // rivalidades de verdade rendem os melhores ganchos
  const hostile = tensionsOf(w).filter((t) => t.stance === 'hostil');
  for (const t of hostile.slice(0, 6)) {
    if (out.size >= Math.ceil(count / 2) || rng() < 0.3) continue;
    const a = byPath.get(t.a)!;
    const b = byPath.get(t.b)!;
    const place = pool.lugar.length ? pick(rng, pool.lugar) : null;
    out.add(pick(rng, [
      `A rixa entre ${link(a)} e ${link(b)} chega a ${place ? link(place) : 'um lugar neutro'}, e alguém vai ter de escolher um lado.`,
      `${link(a)} e ${link(b)} são forçados a uma trégua contra uma ameaça maior.`,
      `Alguém de ${link(a)} quer trocar de lado e passar para ${link(b)}.`,
    ]));
  }

  const usable = HOOKS.filter((h) => h.need.every((k, i) => pool[k].length > h.need.slice(0, i).filter((x) => x === k).length));
  for (let tries = 0; out.size < count && usable.length && tries < count * 20; tries++) {
    const h = pick(rng, usable);
    const used = new Set<string>();
    const xs: Entity[] = [];
    for (const k of h.need) {
      const free = pool[k].filter((e) => !used.has(e.path));
      const e = pick(rng, free);
      used.add(e.path);
      xs.push(e);
    }
    out.add(h.make(xs));
  }
  return [...out];
}
