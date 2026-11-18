import { asText } from '../frontmatter';
import type { Entity, World } from '../mundo';
import { SPECIES_FIELDS, SPECIES_PLANS, speciesPlan } from './catalogo';
import { fold, speciesValue } from './figura';

/*
 * Construtor de espécies e raças.
 *
 * Tudo vira propriedade comum da ficha (`corpo: quadrúpede`, `revestimento:
 * escamas`, `dieta: carnívoro`...), então continua legível no Obsidian. Os
 * arquivos daqui: `catalogo` (campos e opções), `moldes` (pontos de partida),
 * `sorteio` (preenche o que falta com coerência), `notas` (o que não fecha),
 * `figura` + `desenho` + `partes` + `pena` (o retrato da espécie). Neste índice
 * ficam a teia alimentar, a comparação e o texto de biologia.
 */

export * from './catalogo';
export { speciesFigure, speciesValue, type SpeciesFigure } from './figura';
export { speciesDrawing, type SpeciesDrawing, type SpeciesPalette } from './desenho';
export type { SpeciesPaint, SpeciesShape } from './pena';
export { rollSpecies, speciesWeightGuess, SPECIES_LOOK_KEYS, type SpeciesSeed } from './sorteio';
export * from './moldes';
export * from './notas';

// ------------------------------------------------------------------ teia alimentar

export interface FoodNode {
  entity: Entity;
  /** nível na cadeia: 1 = come plantas (ou nada do mundo), 2 = come quem come plantas... */
  level: number;
  dieta: string;
}

export interface FoodEdge {
  /** quem come */
  eater: string;
  /** quem é comido */
  eaten: string;
}

/**
 * Quem come quem entre espécies e criaturas: `come`/`presas`/`dieta` com
 * [[links]] (quem come → comido) e `predadores`/`inimigos naturais` (o
 * contrário). O nível sobe um degrau acima da presa mais alta.
 */
export function foodWeb(w: World): { nodes: FoodNode[]; edges: FoodEdge[] } {
  const beings = w.entities.filter((e) => e.type === 'especie' || e.type === 'criatura');
  const ids = new Set(beings.map((e) => e.path));
  const edges = new Map<string, FoodEdge>();
  for (const e of beings) {
    for (const r of e.relations) {
      if (!r.to || !ids.has(r.to) || r.to === e.path) continue;
      const l = fold(r.label);
      if (/^(come|presas?|dieta|caca|alimenta-se de)$/.test(l)) edges.set(`${e.path}>${r.to}`, { eater: e.path, eaten: r.to });
      else if (/^(predadores?|inimigos naturais|cacado por|comido por)$/.test(l)) edges.set(`${r.to}>${e.path}`, { eater: r.to, eaten: e.path });
    }
  }
  const list = [...edges.values()];
  const level = new Map<string, number>();
  const visit = (p: string, depth: number): number => {
    if (level.has(p)) return level.get(p)!;
    if (depth > 30) return 1;
    const preys = list.filter((x) => x.eater === p).map((x) => x.eaten);
    const dieta = fold(speciesValue(beings.find((b) => b.path === p)?.props ?? {}, 'dieta'));
    const base = /carn|necro/.test(dieta) ? 2 : 1;
    const lv = preys.length ? 1 + Math.max(...preys.map((q) => visit(q, depth + 1))) : base;
    level.set(p, lv);
    return lv;
  };
  const nodes = beings.map((e) => ({ entity: e, level: visit(e.path, 0), dieta: speciesValue(e.props, 'dieta') }));
  return { nodes, edges: list };
}

/** Número de um campo ("1,8 m" → 1.8; "80 anos" → 80). */
export function speciesNumber(props: Record<string, unknown>, key: string): number | null {
  const raw = speciesValue(props, key);
  const m = /-?\d+(?:[.,]\d+)?/.exec(raw.replace(/\.(?=\d{3}\b)/g, ''));
  return m ? Number(m[0].replace(',', '.')) : null;
}

/** Linha da comparação entre espécies. */
export interface SpeciesRow {
  entity: Entity;
  altura: number | null;
  peso: number | null;
  vida: number | null;
  maioridade: number | null;
  dieta: string;
  inteligencia: string;
  habitat: string;
}

export function speciesTable(w: World, types = ['especie']): SpeciesRow[] {
  return w.entities.filter((e) => types.includes(e.type)).map((e) => ({
    entity: e, altura: speciesNumber(e.props, 'altura'), peso: speciesNumber(e.props, 'peso'), vida: speciesNumber(e.props, 'expectativa de vida'),
    maioridade: speciesNumber(e.props, 'maioridade'), dieta: speciesValue(e.props, 'dieta'), inteligencia: speciesValue(e.props, 'inteligência'),
    habitat: speciesValue(e.props, 'habitat').replace(/\[\[|\]\]/g, ''),
  }));
}

/** Quanto do construtor está preenchido (0..1). */
export function speciesFilled(props: Record<string, unknown>): number {
  return SPECIES_FIELDS.filter((f) => speciesValue(props, f.key).trim()).length / SPECIES_FIELDS.length;
}

/** Texto curto que descreve a espécie, para a seção "Biologia" (quem escreve edita depois). */
export function speciesBlurb(name: string, props: Record<string, unknown>): string {
  const v = (k: string) => speciesValue(props, k);
  const parts: string[] = [];
  const corpo = v('corpo');
  const alt = v('altura');
  const info = SPECIES_PLANS[speciesPlan(corpo)];
  const porte = fold(v('porte'));
  const medida = info.comprido ? ` de cerca de ${alt} m de comprimento` : ` de cerca de ${alt} m`;
  const adj = /esguio|agil|robusto|massivo/.test(porte) ? `${v('porte').toLowerCase().replace(/o$/, 'os').replace(/il$/, 'eis')} ` : '';
  const semNada = (k: string) => { const x = fold(v(k)); return !x || x.startsWith('sem ') || x === 'nenhum'; };
  if (corpo || alt) parts.push(`${name} ${corpo ? `são ${adj}${info.plural}` : 'são seres'}${alt ? medida : ''}${v('revestimento') ? `, cobertos de ${v('revestimento').toLowerCase()}` : ''}${v('cor') ? ` em tons de ${v('cor').toLowerCase()}` : ''}.`);
  const marcas = [
    !semNada('cabeça') && v('cabeça') ? `cabeça ${v('cabeça').toLowerCase()}` : '',
    !semNada('chifres') ? `chifres ${v('chifres').toLowerCase()}` : '',
    !semNada('asas') ? `asas ${v('asas').toLowerCase()}` : '',
    !semNada('cauda') ? `cauda ${v('cauda').toLowerCase()}` : '',
    v('traços físicos').toLowerCase(),
  ].filter(Boolean);
  if (marcas.length) parts.push(`Chamam a atenção: ${marcas.join(', ')}.`);
  const dieta = v('dieta').toLowerCase();
  const come = !dieta ? 'São' : /^de /.test(dieta) ? `Alimentam-se ${dieta}` : /o$/.test(dieta) ? `São ${dieta}s` : `São ${dieta}`;
  if (dieta || v('atividade')) parts.push(`${come}${v('atividade') ? `${dieta ? ' e' : ''} ativos de ${v('atividade').toLowerCase()}` : ''}.`);
  if (v('expectativa de vida')) parts.push(`Vivem uns ${v('expectativa de vida')} anos${v('maioridade') ? ` e são adultos aos ${v('maioridade')}` : ''}.`);
  if (v('sentidos')) parts.push(`Sentidos especiais: ${v('sentidos').toLowerCase()}.`);
  if (v('sociedade')) parts.push(`Vivem em ${v('sociedade').toLowerCase()}${v('comunicação') ? ` e se comunicam por ${v('comunicação').toLowerCase()}` : ''}.`);
  return parts.join(' ');
}

export const asStr = (v: unknown): string => asText(v as never);
