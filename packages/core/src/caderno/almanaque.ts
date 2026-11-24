import { asText } from './frontmatter';
import { sameTitle } from './markdown';
import { numeroDe } from './economia';
import { NON_CARD_TYPES, parseWorldDate, timeline, worldYear, type Entity, type World } from './mundo';
import { contarLigacoes } from './jornada/progresso';

/*
 * Almanaque: o mundo em números.
 *
 * Censo (população de cada lugar, somada pela hierarquia `parte de`), quem
 * são as personagens (espécie, cultura, facção, idade, situação), quanto se
 * escreveu em cada tipo de ficha e os recordes: a ficha mais longa, a mais
 * ligada, o personagem mais velho, a guerra mais longa. Tudo calculado das
 * notas, na hora.
 */

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Pick<Entity, 'props'>, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) {
      const v = asText(e.props[key]).trim();
      if (v) return v;
    }
  }
  return '';
};

// ------------------------------------------------------------------ censo

export interface NoCenso {
  lugar: Entity;
  /** o que a ficha diz */
  propria: number | null;
  /** própria, ou a soma dos lugares de dentro (o maior dos dois) */
  total: number;
  filhos: NoCenso[];
}

export interface Censo {
  raizes: NoCenso[];
  total: number;
  /** lugares com população escrita */
  contados: number;
  maiores: Array<{ lugar: Entity; total: number }>;
}

export function censo(w: World): Censo {
  const lugares = w.entities.filter((e) => e.type === 'lugar');
  const ids = new Set(lugares.map((l) => l.path));
  const pai = new Map<string, string>();
  for (const l of lugares) {
    const r = l.relations.find((x) => x.to && fold(x.label) === 'parte de' && ids.has(x.to));
    if (r && r.to !== l.path) pai.set(l.path, r.to!);
  }
  // ciclos de "parte de" viram raízes, para não girar para sempre
  const naRaiz = (p: string) => { const visto = new Set<string>(); let a: string | undefined = p; while (a && !visto.has(a)) { visto.add(a); a = pai.get(a); } return !!a; };
  for (const l of lugares) if (naRaiz(l.path)) pai.delete(l.path);
  const filhos = new Map<string, Entity[]>();
  for (const l of lugares) { const p = pai.get(l.path); if (p) filhos.set(p, [...(filhos.get(p) ?? []), l]); }
  const montar = (l: Entity, prof: number): NoCenso => {
    const fs = prof > 12 ? [] : (filhos.get(l.path) ?? []).map((f) => montar(f, prof + 1));
    const propria = numeroDe(prop(l, 'população', 'populacao', 'habitantes', 'pop'));
    const soma = fs.reduce((s, f) => s + f.total, 0);
    return { lugar: l, propria, total: Math.max(propria ?? 0, soma), filhos: fs.sort((a, b) => b.total - a.total) };
  };
  const raizes = lugares.filter((l) => !pai.has(l.path)).map((l) => montar(l, 0)).sort((a, b) => b.total - a.total);
  const todos: NoCenso[] = [];
  const andar = (n: NoCenso) => { todos.push(n); n.filhos.forEach(andar); };
  raizes.forEach(andar);
  return {
    raizes, total: raizes.reduce((s, r) => s + r.total, 0), contados: todos.filter((n) => n.propria !== null).length,
    maiores: todos.filter((n) => n.total > 0).sort((a, b) => b.total - a.total).slice(0, 8).map((n) => ({ lugar: n.lugar, total: n.total })),
  };
}

// ------------------------------------------------------------------ quem são

export interface Fatia { nome: string; n: number; path?: string }

export interface Demografia {
  pessoas: number;
  vivas: number;
  mortas: number;
  especies: Fatia[];
  culturas: Fatia[];
  faccoes: Fatia[];
  sexos: Fatia[];
  /** faixas de idade no "agora" do mundo */
  idades: Fatia[];
  idadeMedia: number | null;
}

const morta = (e: Entity) => !!prop(e, 'morte', 'morreu') || /mort|falec|execut|assassin/.test(fold(prop(e, 'status')));

function contarPor(pessoas: Entity[], re: RegExp, byPath: Map<string, Entity>): Fatia[] {
  const m = new Map<string, Fatia>();
  let sem = 0;
  for (const p of pessoas) {
    const alvos = p.relations.filter((r) => re.test(fold(r.label)));
    if (!alvos.length) {
      const livre = Object.entries(p.props).find(([k]) => re.test(fold(k)))?.[1];
      const t = livre ? asText(livre).replace(/\[\[|\]\]/g, '').trim() : '';
      if (t) { const k = fold(t); m.set(k, { nome: t, n: (m.get(k)?.n ?? 0) + 1 }); } else sem++;
      continue;
    }
    const r = alvos[0]!;
    const nome = r.to ? byPath.get(r.to)?.name ?? r.target : r.target;
    const k = r.to ?? fold(r.target);
    m.set(k, { nome, n: (m.get(k)?.n ?? 0) + 1, ...(r.to ? { path: r.to } : {}) });
  }
  const out = [...m.values()].sort((a, b) => b.n - a.n);
  if (sem) out.push({ nome: 'Não informado', n: sem });
  return out;
}

const FAIXAS: Array<[number, string]> = [[0, 'Crianças'], [15, 'Jovens'], [30, 'Adultos'], [50, 'Maduros'], [70, 'Idosos'], [120, 'Antigos']];

export function demografia(w: World): Demografia {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const pessoas = w.entities.filter((e) => e.type === 'personagem');
  const agora = worldYear(w);
  const idades: number[] = [];
  for (const p of pessoas) {
    const n = parseWorldDate(prop(p, 'nascimento', 'nasceu'));
    if (n === null) continue;
    const fim = parseWorldDate(prop(p, 'morte', 'morreu')) ?? agora;
    if (fim >= n) idades.push(Math.floor(fim - n));
  }
  const faixas = FAIXAS.map(([min, nome], i) => ({ nome, n: idades.filter((x) => x >= min && x < (FAIXAS[i + 1]?.[0] ?? Infinity)).length })).filter((f) => f.n);
  const sexos = new Map<string, number>();
  for (const p of pessoas) {
    const s = fold(prop(p, 'sexo', 'gênero', 'genero'));
    const k = /^(f|fem|mulher)/.test(s) ? 'Mulheres' : /^(m|masc|homem)/.test(s) ? 'Homens' : s ? 'Outros' : 'Não informado';
    sexos.set(k, (sexos.get(k) ?? 0) + 1);
  }
  const mortas = pessoas.filter(morta).length;
  return {
    pessoas: pessoas.length, vivas: pessoas.length - mortas, mortas,
    especies: contarPor(pessoas, /^(especie|raca|species)$/, byPath),
    culturas: contarPor(pessoas, /^(cultura|povo|etnia)$/, byPath),
    faccoes: contarPor(pessoas, /^(afiliacao|faccao|ordem|casa|guilda)$/, byPath),
    sexos: [...sexos].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n),
    idades: faixas,
    idadeMedia: idades.length ? Math.round(idades.reduce((a, b) => a + b, 0) / idades.length) : null,
  };
}

// ------------------------------------------------------------------ escrita e recordes

export function palavrasPorTipo(w: World): Array<{ type: string; n: number; palavras: number }> {
  const m = new Map<string, { n: number; palavras: number }>();
  for (const e of w.entities) {
    const x = m.get(e.type) ?? { n: 0, palavras: 0 };
    x.n++;
    x.palavras += e.words;
    m.set(e.type, x);
  }
  return [...m].map(([type, x]) => ({ type, ...x })).sort((a, b) => b.palavras - a.palavras || b.n - a.n);
}

export interface Recorde {
  id: string;
  titulo: string;
  glifo: string;
  valor: string;
  e: Entity;
}

export function recordes(w: World): Recorde[] {
  const out: Recorde[] = [];
  const fichas = w.entities.filter((e) => !NON_CARD_TYPES.has(e.type));
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const maior = <T>(l: T[], f: (x: T) => number) => l.reduce<T | null>((a, x) => (a === null || f(x) > f(a) ? x : a), null);
  const longa = maior(fichas, (e) => e.words);
  if (longa && longa.words > 0) out.push({ id: 'longa', titulo: 'A ficha mais longa', glifo: '✎', valor: `${fmt(longa.words)} palavras`, e: longa });
  const links = contarLigacoes(w);
  const ligada = maior(fichas, (e) => links.get(e.path) ?? 0);
  if (ligada && (links.get(ligada.path) ?? 0) > 1) out.push({ id: 'ligada', titulo: 'O centro da teia', glifo: '✺', valor: `${links.get(ligada.path)} ligações`, e: ligada });
  const agora = worldYear(w);
  const idade = (e: Entity) => {
    const n = parseWorldDate(prop(e, 'nascimento', 'nasceu'));
    if (n === null) return -1;
    return (parseWorldDate(prop(e, 'morte', 'morreu')) ?? agora) - n;
  };
  const velho = maior(w.entities.filter((e) => e.type === 'personagem'), idade);
  if (velho && idade(velho) > 0) out.push({ id: 'velho', titulo: morta(velho) ? 'Quem mais viveu' : 'A pessoa mais velha', glifo: '⌛', valor: `${fmt(Math.floor(idade(velho)))} anos`, e: velho });
  const tl = timeline(w);
  if (tl.length) {
    const prim = tl[0]!;
    const e = w.entities.find((x) => x.path === prim.path);
    if (e) out.push({ id: 'antigo', titulo: 'O registro mais antigo', glifo: '⧗', valor: prim.label, e });
  }
  const guerras = w.entities.filter((e) => e.type === 'conflito');
  const dur = (e: Entity) => { const a = parseWorldDate(prop(e, 'início', 'inicio', 'data')); const b = parseWorldDate(prop(e, 'fim')) ?? agora; return a === null ? -1 : b - a; };
  const longaG = maior(guerras, dur);
  if (longaG && dur(longaG) > 0) out.push({ id: 'guerra', titulo: 'O conflito mais longo', glifo: '⚔', valor: `${fmt(Math.round(dur(longaG)))} anos`, e: longaG });
  const c = censo(w);
  if (c.maiores[0]) out.push({ id: 'populosa', titulo: 'O lugar mais populoso', glifo: '⌂', valor: `${fmt(c.maiores[0].total)} habitantes`, e: c.maiores[0].lugar });
  const citada = maior(fichas, (e) => w.relations.filter((r) => r.to === e.path && r.from !== e.path).length);
  if (citada) { const n = w.relations.filter((r) => r.to === citada.path && r.from !== citada.path).length; if (n > 1) out.push({ id: 'citada', titulo: 'A mais citada', glifo: '❝', valor: `citada por ${n}`, e: citada }); }
  return out;
}

/** Um número curto: 12,4 mil · 3,2 mi · 1,1 bi. */
export function numeroCurto(n: number): string {
  const f = (x: number, s: string) => `${(Math.round(x * 10) / 10).toLocaleString('pt-BR')} ${s}`;
  if (n >= 1e9) return f(n / 1e9, 'bi');
  if (n >= 1e6) return f(n / 1e6, 'mi');
  if (n >= 1e4) return f(n / 1e3, 'mil');
  return Math.round(n).toLocaleString('pt-BR');
}
