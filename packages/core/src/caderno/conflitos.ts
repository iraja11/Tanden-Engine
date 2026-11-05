import { asList, asText } from './frontmatter';
import { sameTitle, wikiLinks } from './markdown';
import { parseWorldDate, type Entity, type World } from './mundo';

/*
 * Conflitos e alianças de um mundo.
 *
 * Saem de dois lugares, sem formato novo:
 *  - fichas `tipo: conflito` com `lados: [[A]], [[B]]` (e status, intensidade);
 *  - o nome das ligações: `inimigos: [[X]]` é hostil, `aliados: [[Y]]` é aliança.
 *
 * O resultado alimenta a aba de conflitos, a revisão e a simulação.
 */

export type Stance = 'hostil' | 'aliado' | 'neutro';

const HOSTILE = /inimig|rival|advers|contra|guerra|oposi|odeia|odio|ódio|caça|caca|persegu|nêmesis|nemesis|traiu|vingan|ameaça|ameaca/;
const ALLIED = /aliad|alian|amig|parceir|protege|protetor|apoia|apoio|leal|serve|vassal|mentor|pupil|irmão|irma|cônjuge|conjuge|espos|amante/;

/** Hostil, aliado ou neutro, pelo nome da ligação ("inimigos", "aliança com"...). */
export function stanceOf(label: string): Stance {
  const l = label.normalize('NFC').toLowerCase();
  if (HOSTILE.test(l)) return 'hostil';
  if (ALLIED.test(l)) return 'aliado';
  return 'neutro';
}

export interface Tension {
  /** caminhos das duas fichas, em ordem alfabética */
  a: string;
  b: string;
  stance: Exclude<Stance, 'neutro'>;
  /** força: soma das ligações e da intensidade dos conflitos */
  weight: number;
  /** de onde veio: nomes das ligações e dos conflitos */
  sources: string[];
}

export interface Conflict {
  path: string;
  name: string;
  /** cada lado: caminhos das fichas (ou o texto do link, se a ficha não existe) */
  sides: string[];
  status: string;
  /** 1 a 5 */
  intensity: number;
  start: string;
  end: string;
  active: boolean;
  summary: string;
}

const prop = (e: Pick<Entity, 'props'>, ...keys: string[]): string => {
  for (const k of keys) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) return asText(e.props[key]);
  }
  return '';
};

const ENDED = /resolvid|encerrad|acabou|termin|fim|paz|vencid|derrot|extint/i;

/** Fichas de conflito, com os lados resolvidos para caminhos quando der. */
export function conflictsOf(w: World): Conflict[] {
  const out: Conflict[] = [];
  for (const e of w.entities) {
    if (e.type !== 'conflito') continue;
    const key = Object.keys(e.props).find((p) => ['lados', 'envolvidos', 'partes'].some((k) => sameTitle(p, k)));
    const raw = key ? asList(e.props[key]) : [];
    const sides: string[] = [];
    for (const v of raw) {
      const links = wikiLinks(v);
      for (const t of links.length ? links : [v.trim()]) {
        if (!t) continue;
        const r = e.relations.find((x) => x.target === t);
        sides.push(r?.to ?? t);
      }
    }
    const status = prop(e, 'status', 'estado');
    const end = prop(e, 'fim', 'término');
    const n = Number(prop(e, 'intensidade', 'escala').replace(',', '.'));
    out.push({
      path: e.path, name: e.name, sides, status, start: prop(e, 'início', 'inicio', 'data'), end,
      intensity: Number.isFinite(n) && n > 0 ? Math.min(5, Math.max(1, Math.round(n))) : 3,
      active: !ENDED.test(status) && !(end && parseWorldDate(end) !== null && !status),
      summary: e.summary,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || b.intensity - a.intensity || a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Tensões e alianças entre pares de fichas. Cada par aparece uma vez por
 * postura; ligação dos dois lados ("A inimigo de B" e "B inimigo de A") soma.
 */
export function tensionsOf(w: World): Tension[] {
  const pairs = new Map<string, Tension>();
  const add = (x: string, y: string, stance: Tension['stance'], weight: number, source: string) => {
    if (x === y) return;
    const [a, b] = x < y ? [x, y] : [y, x];
    const k = `${stance}\u0000${a}\u0000${b}`;
    const t = pairs.get(k) ?? { a, b, stance, weight: 0, sources: [] };
    t.weight += weight;
    if (!t.sources.includes(source)) t.sources.push(source);
    pairs.set(k, t);
  };
  const ids = new Set(w.entities.map((e) => e.path));
  for (const r of w.relations) {
    if (!r.to || !ids.has(r.to)) continue;
    const s = stanceOf(r.label);
    if (s !== 'neutro') add(r.from, r.to, s, 1, r.label);
  }
  for (const c of conflictsOf(w)) {
    const real = c.sides.filter((s) => ids.has(s));
    const weight = c.active ? c.intensity : Math.max(1, Math.round(c.intensity / 2));
    for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) add(real[i]!, real[j]!, 'hostil', weight, c.name);
  }
  return [...pairs.values()].sort((x, y) => y.weight - x.weight);
}

/** Postura entre duas fichas (a mais forte, se houver as duas). */
export function stanceBetween(tensions: Tension[], x: string, y: string): Stance {
  let best: Tension | null = null;
  for (const t of tensions) {
    if (!((t.a === x && t.b === y) || (t.a === y && t.b === x))) continue;
    if (!best || t.weight > best.weight) best = t;
  }
  return best?.stance ?? 'neutro';
}
