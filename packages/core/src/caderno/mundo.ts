import { asList, asText, bodyOf, parseProps, type Props } from './frontmatter';
import { linkTarget, noteDir, noteName, sameTitle, wikiLinks } from './markdown';

/*
 * Caderno de world building.
 *
 * Um mundo é uma pasta ("Mundos/Aerth/") com uma nota do mundo (tipo: mundo)
 * e uma nota por coisa: personagens, lugares, facções, eventos, itens...
 * Cada uma diz no topo de que tipo é e a que mundo pertence:
 *
 *   tipo: personagem
 *   mundo: Aerth
 *   afiliação: "[[Ordem do Sol]]"
 *   nascimento: 312
 *
 * Toda propriedade que aponta para outra nota vira uma ligação com nome
 * ("afiliação"), e os [[links]] soltos no texto viram "menciona". Datas
 * (data, nascimento, morte, fundação...) montam a linha do tempo. Como é
 * tudo propriedade e link do Obsidian, o grafo e as buscas dele também servem.
 */

export interface EntityType {
  id: string;
  label: string;
  plural: string;
  /** propriedades sugeridas ao criar */
  fields: string[];
  /** seções sugeridas no texto */
  sections: string[];
}

export const ENTITY_TYPES: EntityType[] = [
  { id: 'personagem', label: 'Personagem', plural: 'Personagens', fields: ['espécie', 'nascimento', 'morte', 'origem', 'afiliação', 'status'], sections: ['Aparência', 'Personalidade', 'História'] },
  { id: 'lugar', label: 'Lugar', plural: 'Lugares', fields: ['parte de', 'clima', 'governante', 'fundação'], sections: ['Descrição', 'História'] },
  { id: 'faccao', label: 'Facção', plural: 'Facções', fields: ['líder', 'sede', 'fundação', 'ideologia'], sections: ['Objetivos', 'História'] },
  { id: 'evento', label: 'Evento', plural: 'Eventos', fields: ['data', 'fim', 'local', 'envolvidos'], sections: ['O que aconteceu', 'Consequências'] },
  { id: 'item', label: 'Item', plural: 'Itens', fields: ['dono', 'origem', 'poder'], sections: ['Descrição', 'História'] },
  { id: 'especie', label: 'Espécie', plural: 'Espécies', fields: ['habitat', 'expectativa de vida'], sections: ['Biologia', 'Cultura'] },
  { id: 'conceito', label: 'Conceito', plural: 'Conceitos', fields: ['categoria'], sections: ['Como funciona', 'Limites'] },
  { id: 'criatura', label: 'Criatura', plural: 'Criaturas', fields: ['nd', 'habitat', 'pv', 'pv máx', 'ca'], sections: ['Descrição', 'Táticas'] },
];

const TYPE_ALIASES: Record<string, string> = {
  personagens: 'personagem', character: 'personagem', npc: 'personagem',
  lugares: 'lugar', local: 'lugar', location: 'lugar', place: 'lugar', regiao: 'lugar', região: 'lugar', cidade: 'lugar',
  facção: 'faccao', faccoes: 'faccao', facções: 'faccao', faction: 'faccao', organização: 'faccao', organizacao: 'faccao', grupo: 'faccao',
  eventos: 'evento', event: 'evento', acontecimento: 'evento',
  itens: 'item', objeto: 'item', artefato: 'item',
  espécie: 'especie', especies: 'especie', espécies: 'especie', raça: 'especie', raca: 'especie', species: 'especie',
  criaturas: 'criatura', monstro: 'criatura', monstros: 'criatura', monster: 'criatura', creature: 'criatura', besta: 'criatura', inimigo: 'criatura',
  conceitos: 'conceito', magia: 'conceito', sistema: 'conceito', religião: 'conceito', idioma: 'conceito',
};

/** "Facção", "facções", "faction" → "faccao"; tipos desconhecidos ficam como vieram. */
export function normalizeType(t: string): string {
  const k = t.trim().toLowerCase();
  if (ENTITY_TYPES.some((x) => x.id === k)) return k;
  return TYPE_ALIASES[k] ?? k;
}

export const typeInfo = (id: string): EntityType =>
  ENTITY_TYPES.find((t) => t.id === id) ?? { id, label: id.charAt(0).toUpperCase() + id.slice(1), plural: id.charAt(0).toUpperCase() + id.slice(1), fields: [], sections: [] };

/** Propriedades que não viram ligação nem aparecem como campo comum. */
export const RESERVED = new Set(['tipo', 'type', 'mundo', 'world', 'aliases', 'apelidos', 'tags', 'cssclasses']);

export interface Relation {
  from: string;
  /** caminho da nota de destino, ou null se o link aponta para uma nota que ainda não existe */
  to: string | null;
  target: string;
  /** nome da propriedade, ou "menciona" para links no texto */
  label: string;
}

export interface Entity {
  path: string;
  name: string;
  world: string;
  type: string;
  props: Props;
  aliases: string[];
  /** primeira frase do texto, para os cartões */
  summary: string;
  relations: Relation[];
}

export interface World {
  name: string;
  path: string | null;
  entities: Entity[];
  relations: Relation[];
}

const unlink = (v: string): string => linkTarget(v.replace(/^\s*\[\[|\]\]\s*$/g, ''));

function summaryOf(text: string): string {
  for (const raw of bodyOf(text).split('\n')) {
    const l = raw.trim();
    if (!l || /^(#|\||>|-{3,}|```|!\[)/.test(l)) continue;
    const plain = l.replace(/^[-*+]\s+/, '').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[*_`]/g, '');
    return plain.length > 140 ? `${plain.slice(0, 137).trimEnd()}…` : plain;
  }
  return '';
}

function worldOf(path: string, props: Props): string {
  const p = unlink(asText(props['mundo'] ?? props['world']));
  if (p) return p;
  const parts = path.split('/');
  return parts.length >= 3 && sameTitle(parts[0]!, 'Mundos') ? parts[1]! : '';
}

/** Monta mundos, entidades e ligações a partir das notas do cofre. */
export function worldIndex(notes: Array<{ path: string; text: string }>): World[] {
  const worlds = new Map<string, World>();
  const get = (name: string): World => {
    const k = name.toLowerCase();
    let w = worlds.get(k);
    if (!w) worlds.set(k, (w = { name, path: null, entities: [], relations: [] }));
    return w;
  };
  // nome → caminhos, para resolver [[links]] como o Obsidian (pelo nome do arquivo ou apelido)
  const byName = new Map<string, string[]>();
  const add = (name: string, path: string) => {
    const k = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const l = byName.get(k) ?? [];
    if (!l.includes(path)) l.push(path);
    byName.set(k, l);
  };
  const pending: Array<{ e: Entity; text: string }> = [];

  for (const { path, text } of notes) {
    add(noteName(path), path);
    add(path.replace(/\.md$/i, ''), path);
    if (!text.startsWith('---')) continue;
    const props = parseProps(text);
    const aliases = asList(props['aliases'] ?? props['apelidos']);
    for (const a of aliases) add(a, path);
    const tipo = normalizeType(asText(props['tipo'] ?? props['type']));
    if (!tipo) continue;
    if (tipo === 'mundo' || tipo === 'world') {
      const w = get(noteName(path));
      w.path = path;
      continue;
    }
    const world = worldOf(path, props);
    if (!world) continue;
    const e: Entity = { path, name: noteName(path), world, type: tipo, props, aliases, summary: summaryOf(text), relations: [] };
    get(world).entities.push(e);
    pending.push({ e, text });
  }

  const resolve = (target: string, from: string): string | null => {
    const k = target.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const l = byName.get(k) ?? byName.get(k.replace(/\.md$/, ''));
    if (!l?.length) return null;
    if (l.length === 1) return l[0]!;
    // vários com o mesmo nome: o mais perto da nota que aponta
    const dir = noteDir(from);
    return [...l].sort((a, b) => common(b, dir) - common(a, dir))[0]!;
  };

  for (const { e, text } of pending) {
    const seen = new Set<string>();
    for (const [key, value] of Object.entries(e.props)) {
      if (RESERVED.has(key.toLowerCase())) continue;
      for (const v of asList(value)) {
        for (const t of wikiLinks(v)) {
          const to = resolve(t, e.path);
          e.relations.push({ from: e.path, to, target: t, label: key });
          seen.add((to ?? t).toLowerCase());
        }
      }
    }
    for (const t of wikiLinks(bodyOf(text))) {
      const to = resolve(t, e.path);
      if (seen.has((to ?? t).toLowerCase()) || to === e.path) continue;
      seen.add((to ?? t).toLowerCase());
      e.relations.push({ from: e.path, to, target: t, label: 'menciona' });
    }
    get(e.world).relations.push(...e.relations);
  }

  for (const w of worlds.values()) w.entities.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return [...worlds.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function common(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Quem aponta para esta nota (ligações de entrada). */
export const backlinks = (w: World, path: string): Relation[] => w.relations.filter((r) => r.to === path && r.from !== path);

// ---------------------------------------------------------------- tempo

/**
 * Data de um mundo inventado, como número para ordenar: "342" → 342,
 * "-50" ou "50 a.C." → -50, "342-03" → 342,17, "12/03/342" → 342,17.
 * O texto original é o que aparece na tela.
 */
export function parseWorldDate(raw: string): number | null {
  const s = raw.replace(/[−–]/g, '-').trim();
  if (!s) return null;
  let m: RegExpExecArray | null;
  const before = /\b(a\.\s?c\.?|antes de)/i.test(s) ? -1 : 1;
  if ((m = /(\d{1,2})\/(\d{1,2})\/(-?\d+)/.exec(s))) return Number(m[3]) * before + (Number(m[2]) - 1) / 12 + (Number(m[1]) - 1) / 365;
  if ((m = /(-?\d+)-(\d{1,2})(?:-(\d{1,2}))?(?!\d)/.exec(s)) && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    return Number(m[1]) * before + (Number(m[2]) - 1) / 12 + (m[3] ? (Number(m[3]) - 1) / 365 : 0);
  }
  if ((m = /-?\d+(?:[.,]\d+)?/.exec(s))) {
    const n = Number(m[0].replace(',', '.'));
    return n < 0 ? n : n * before;
  }
  return null;
}

export interface TimeSpan {
  path: string;
  name: string;
  type: string;
  /** o que está escrito na nota */
  label: string;
  at: number;
  /** fim, para vidas, reinados e guerras */
  end?: number;
  endLabel?: string;
  /** de onde veio: data, nascimento, fundação... */
  field: string;
}

const START = ['data', 'início', 'inicio', 'nascimento', 'fundação', 'fundacao', 'começo'];
const END = ['fim', 'término', 'termino', 'morte', 'queda', 'dissolução'];

/** Tudo que tem data no mundo, em ordem. */
export function timeline(w: World): TimeSpan[] {
  const out: TimeSpan[] = [];
  for (const e of w.entities) {
    const get = (keys: string[]) => {
      for (const k of keys) {
        const key = Object.keys(e.props).find((p) => sameTitle(p, k));
        const v = key ? asText(e.props[key]) : '';
        if (v && parseWorldDate(v) !== null) return { key: key!, v };
      }
      return null;
    };
    const s = get(START);
    const f = get(END);
    if (!s && !f) continue;
    const first = s ?? f!;
    const span: TimeSpan = { path: e.path, name: e.name, type: e.type, label: first.v, at: parseWorldDate(first.v)!, field: first.key };
    if (s && f) {
      span.end = parseWorldDate(f.v)!;
      span.endLabel = f.v;
    }
    out.push(span);
  }
  return out.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name, 'pt-BR'));
}

// ---------------------------------------------------------------- modelos

export function worldTemplate(name: string): string {
  return `---
tipo: mundo
---
# ${name}

## Visão geral

## Regras do mundo

`;
}

export function entityTemplate(name: string, world: string, type: string): string {
  const t = typeInfo(type);
  const fields = t.fields.map((f) => `${/[:#]/.test(f) ? `"${f}"` : f}: `).join('\n');
  const sections = t.sections.map((s) => `## ${s}\n\n`).join('');
  return `---
tipo: ${type}
mundo: ${world}${fields ? `\n${fields}` : ''}
---
# ${name}

${sections}`;
}

/** Pasta padrão das notas de um tipo dentro do mundo. */
export function entityFolder(w: Pick<World, 'name' | 'path'>, type: string): string {
  const base = w.path ? noteDir(w.path) : `Mundos/${w.name}`;
  return `${base}/${typeInfo(type).plural}`;
}
