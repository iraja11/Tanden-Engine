import type { Rng } from '../rpg/dice';
import { asText } from './frontmatter';
import { sameTitle } from './markdown';
import type { Entity, World } from './mundo';

/*
 * Bestiário: o perigo de cada criatura, a tabela de encontros de cada região e
 * a rolagem de um encontro com quantidade, humor e complicação.
 *
 * Uma criatura vive onde o `habitat` aponta (`habitat: "[[Mata Funda]]"`), e
 * vale também para os lugares que ficam dentro dele (`parte de`). A chance
 * de aparecer vem de `frequência` (comum, rara, praga...) e o perigo de `nd`
 * (nível de desafio, como na mesa) ou de `perigo`/`ameaça` por extenso.
 */

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Pick<Entity, 'props'>, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) {
      const v = asText(e.props[key]).replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1').trim();
      if (v) return v;
    }
  }
  return '';
};

export const FAIXAS_AMEACA = [
  { min: 0, label: 'Inofensiva', cor: '#8fbf9f' },
  { min: 0.5, label: 'Baixa', cor: '#5fbf77' },
  { min: 2, label: 'Moderada', cor: '#e8c547' },
  { min: 5, label: 'Alta', cor: '#f2a65a' },
  { min: 11, label: 'Mortal', cor: '#e5484d' },
  { min: 17, label: 'Lendária', cor: '#b277ee' },
] as const;

/** Nível de desafio (0 a 30): `nd` numérico ("1/2" vale 0,5) ou o perigo por extenso. */
export function ameacaDe(e: Pick<Entity, 'props'>): number | null {
  const nd = prop(e, 'nd', 'cr', 'nível de desafio', 'nivel de desafio');
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(nd);
  if (frac) return Number(frac[1]) / Math.max(1, Number(frac[2]));
  const n = Number(nd.replace(',', '.'));
  if (nd && Number.isFinite(n)) return Math.max(0, Math.min(30, n));
  const p = fold(prop(e, 'perigo', 'ameaça', 'ameaca', 'periculosidade'));
  if (!p) return null;
  if (/lendari|apocal|divin/.test(p)) return 20;
  if (/mortal|letal|extrem/.test(p)) return 13;
  if (/alt|grave|muito/.test(p)) return 7;
  if (/medi|moder/.test(p)) return 3;
  if (/baix|pouc|leve/.test(p)) return 1;
  if (/nenhum|inofens|manso|docil/.test(p)) return 0;
  return null;
}

export const faixaDe = (nd: number) => [...FAIXAS_AMEACA].reverse().find((f) => nd >= f.min)!;

/** Peso de aparecer numa tabela (praga 14 … lendário 1). */
export function pesoDe(e: Pick<Entity, 'props'>): number {
  const f = fold(prop(e, 'frequência', 'frequencia', 'raridade', 'população'));
  if (!f) return 6;
  if (/praga|infest|abundan|enxame/.test(f)) return 14;
  if (/muito comum/.test(f)) return 12;
  if (/raris|muito rar|lendari|unic|extint/.test(f)) return 1;
  if (/incomum/.test(f)) return 5;
  if (/rar/.test(f)) return 2;
  if (/comum/.test(f)) return 10;
  return 6;
}

/** Lugares onde a criatura vive, pelo `habitat` (e afins). */
export function habitatsDe(e: Entity): string[] {
  return e.relations.filter((r) => r.to && /^(habitat|habitats|vive em|regiao|territorio|ninho|covil|onde vive)$/.test(fold(r.label))).map((r) => r.to!);
}

/** O lugar e todos os lugares maiores que o contêm (pela `parte de`). */
export function ancestrais(w: World, path: string): string[] {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const out: string[] = [path];
  let atual = byPath.get(path);
  for (let i = 0; atual && i < 8; i++) {
    const pai = atual.relations.find((r) => r.to && fold(r.label) === 'parte de');
    if (!pai || out.includes(pai.to!)) break;
    out.push(pai.to!);
    atual = byPath.get(pai.to!);
  }
  return out;
}

export interface Encontro {
  criatura: Entity | null;
  /** faixa da rolagem (d100) */
  de: number;
  ate: number;
  peso: number;
  nd: number | null;
}

export interface TabelaEncontros {
  lugar: Entity | null;
  linhas: Encontro[];
  /** ameaça média ponderada pela chance */
  perigo: number;
}

/** Tabela d100 de uma região (ou do mundo todo). Sempre guarda ~15% para "nada, só sinais". */
export function tabelaEncontros(w: World, lugar: Entity | null): TabelaEncontros {
  const seres = w.entities.filter((e) => e.type === 'criatura' || (e.type === 'especie' && !/sapien|intelig|civiliz/.test(fold(prop(e, 'inteligência', 'inteligencia')))));
  let doLugar: Entity[];
  if (lugar) {
    const acima = new Set(ancestrais(w, lugar.path));
    doLugar = seres.filter((c) => habitatsDe(c).some((h) => acima.has(h)));
  } else doLugar = seres.filter((c) => c.type === 'criatura');
  const pesos = doLugar.map((c) => ({ c, p: pesoDe(c) })).sort((a, b) => b.p - a.p || a.c.name.localeCompare(b.c.name, 'pt-BR')).slice(0, 80);
  const soma = pesos.reduce((s, x) => s + x.p, 0);
  const linhas: Encontro[] = [];
  const espaco = soma ? 85 : 0;
  let acum = 0;
  let prev = 0;
  pesos.forEach(({ c, p }, i) => {
    acum += p;
    const restantes = pesos.length - 1 - i;
    const ate = Math.max(prev + 1, Math.min(espaco - restantes, Math.round((acum / soma) * espaco)));
    linhas.push({ criatura: c, de: prev + 1, ate, peso: p, nd: ameacaDe(c) });
    prev = ate;
  });
  linhas.push({ criatura: null, de: prev + 1, ate: 100, peso: 0, nd: null });
  const comNd = pesos.filter((x) => ameacaDe(x.c) !== null);
  const perigo = comNd.length ? comNd.reduce((s, x) => s + ameacaDe(x.c)! * x.p, 0) / comNd.reduce((s, x) => s + x.p, 0) : 0;
  return { lugar, linhas, perigo: Math.round(perigo * 10) / 10 };
}

const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

const HUMORES = ['faminta, rondando há dias', 'territorial: avisa uma vez, depois ataca', 'fugindo de algo ainda pior', 'curiosa, segue de longe', 'ferida, e por isso perigosa', 'protegendo filhotes', 'em bando de caça', 'adormecida, por enquanto', 'doente: age de um jeito estranho', 'marcada por alguém: tem um sinal na pele'];
const SINAIS = ['pegadas frescas na lama', 'ossos roídos num círculo perfeito', 'um silêncio repentino, sem pássaros', 'árvores arranhadas na altura de um homem', 'um cheiro doce e enjoativo', 'restos de uma fogueira que ninguém acendeu', 'um uivo distante que responde a outro', 'penas, escamas ou pelos presos num galho'];
const COMPLICACOES = ['O terreno ajuda a criatura: neblina, lama ou escuridão.', 'Há outra pessoa em perigo no meio do caminho.', 'Alguém do grupo reconhece a criatura de uma história ruim.', 'A criatura carrega algo valioso preso ao corpo.', 'Um caçador rival quer a mesma presa.', 'A lua ou o tempo mudam bem na hora.', 'Não é uma, é a primeira de várias.', 'Ela não ataca: quer levar o grupo a algum lugar.'];

export interface Rolagem {
  d100: number;
  encontro: Encontro;
  quantidade: number;
  humor: string;
  sinal: string;
  complicacao: string;
  texto: string;
}

/** Rola na tabela: quanto mais perigosa a criatura, menos delas aparecem. */
export function rolarEncontro(t: TabelaEncontros, rng: Rng): Rolagem {
  const d100 = 1 + Math.floor(rng() * 100);
  const encontro = t.linhas.find((l) => d100 >= l.de && d100 <= l.ate) ?? t.linhas[t.linhas.length - 1]!;
  const nd = encontro.nd ?? 1;
  const quantidade = !encontro.criatura ? 0 : nd >= 10 ? 1 : nd >= 4 ? 1 + Math.floor(rng() * 2) : nd >= 1 ? 1 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 6);
  const humor = pick(rng, HUMORES);
  const sinal = pick(rng, SINAIS);
  const complicacao = pick(rng, COMPLICACOES);
  const onde = t.lugar ? ` em ${t.lugar.name}` : '';
  const texto = encontro.criatura
    ? `${quantidade > 1 ? `${quantidade}× ` : ''}${encontro.criatura.name}${onde}, ${humor}. Antes, ${sinal}. ${complicacao}`
    : `Nenhuma criatura${onde}, mas há sinais: ${sinal}.`;
  return { d100, encontro, quantidade, humor, sinal, complicacao, texto };
}

export interface PerigoDoLugar {
  lugar: Entity;
  perigo: number;
  maior: { criatura: Entity; nd: number } | null;
  criaturas: number;
}

/** Os lugares mais perigosos do mundo, pela criatura mais forte que vive ali (ou acima). */
export function perigoPorLugar(w: World): PerigoDoLugar[] {
  const out: PerigoDoLugar[] = [];
  for (const l of w.entities.filter((e) => e.type === 'lugar')) {
    const t = tabelaEncontros(w, l);
    const vivos = t.linhas.filter((x) => x.criatura);
    if (!vivos.length) continue;
    const maior = vivos.filter((x) => x.nd !== null).sort((a, b) => b.nd! - a.nd!)[0];
    out.push({ lugar: l, perigo: t.perigo, maior: maior ? { criatura: maior.criatura!, nd: maior.nd! } : null, criaturas: vivos.length });
  }
  return out.sort((a, b) => (b.maior?.nd ?? 0) - (a.maior?.nd ?? 0) || b.perigo - a.perigo);
}

/** Criaturas sem habitat: não aparecem em nenhuma tabela regional. */
export const semHabitat = (w: World): Entity[] => w.entities.filter((e) => e.type === 'criatura' && !habitatsDe(e).length);
