import type { Rng } from '../rpg/dice';
import { asList, asText } from './frontmatter';
import type { Entity, World } from './mundo';

/*
 * Construtor de espécies e raças.
 *
 * Tudo vira propriedade comum da ficha (`corpo: quadrúpede`, `revestimento:
 * escamas`, `dieta: carnívoro`...), então continua legível no Obsidian. A tela
 * agrupa os campos em corpo, vida, sentidos, mente e ambiente, sorteia o que
 * falta de um jeito coerente (bicho do frio tem pelo e gordura, do deserto é
 * noturno e de escamas), desenha a silhueta e compara o tamanho com uma
 * pessoa. A teia alimentar sai dos campos `come`, `presas` e `predadores`.
 */

export interface SpeciesField {
  key: string;
  label: string;
  group: 'corpo' | 'vida' | 'sentidos' | 'mente' | 'ambiente';
  options?: string[];
  /** aceita várias opções, separadas por vírgula */
  multi?: boolean;
  hint?: string;
}

export const SPECIES_GROUPS: Array<{ id: SpeciesField['group']; label: string; desc: string }> = [
  { id: 'corpo', label: 'Corpo', desc: 'Forma, tamanho e o que cobre a pele.' },
  { id: 'vida', label: 'Ciclo de vida', desc: 'Comer, crescer, reproduzir, morrer.' },
  { id: 'sentidos', label: 'Sentidos', desc: 'Como percebem o mundo.' },
  { id: 'mente', label: 'Mente e sociedade', desc: 'Como pensam, falam e vivem juntos.' },
  { id: 'ambiente', label: 'Ambiente', desc: 'Onde vivem e quando estão acordados.' },
];

export const SPECIES_FIELDS: SpeciesField[] = [
  { key: 'corpo', label: 'Plano do corpo', group: 'corpo', options: ['bípede', 'quadrúpede', 'centauroide', 'hexápode', 'serpentino', 'alado', 'aquático', 'radial', 'amorfo'] },
  { key: 'altura', label: 'Altura', group: 'corpo', hint: 'em metros: 1,7' },
  { key: 'peso', label: 'Peso', group: 'corpo', hint: 'em kg: 70' },
  { key: 'revestimento', label: 'Revestimento', group: 'corpo', options: ['pele nua', 'pelos', 'penas', 'escamas', 'quitina', 'casca', 'cristal', 'casca vegetal', 'pedra', 'gosma'] },
  { key: 'cor', label: 'Cores', group: 'corpo', hint: 'verde e dourado' },
  { key: 'traços físicos', label: 'Traços', group: 'corpo', multi: true, options: ['chifres', 'cauda', 'asas', 'garras', 'presas', 'antenas', 'guelras', 'brilho', 'carapaça', 'tentáculos', 'olhos extras', 'orelhas longas', 'juba', 'espinhos'] },
  { key: 'dieta', label: 'Dieta', group: 'vida', options: ['herbívoro', 'carnívoro', 'onívoro', 'necrófago', 'filtrador', 'fotossintético', 'de magia', 'de emoções'] },
  { key: 'metabolismo', label: 'Metabolismo', group: 'vida', options: ['sangue quente', 'sangue frio', 'hiberna', 'não dorme'] },
  { key: 'reprodução', label: 'Reprodução', group: 'vida', options: ['vivíparo', 'ovíparo', 'esporos', 'brotamento', 'sementes', 'ritual mágico'] },
  { key: 'sexos', label: 'Sexos', group: 'vida', options: ['dois', 'um só', 'três ou mais', 'muda com a idade', 'nenhum'] },
  { key: 'gestação', label: 'Gestação', group: 'vida', hint: 'meses: 9' },
  { key: 'ninhada', label: 'Filhos por vez', group: 'vida', hint: '1, 2-4, centenas' },
  { key: 'maioridade', label: 'Maioridade', group: 'vida', hint: 'anos: 16' },
  { key: 'expectativa de vida', label: 'Vive', group: 'vida', hint: 'anos: 80' },
  { key: 'sentidos', label: 'Sentidos especiais', group: 'sentidos', multi: true, options: ['visão no escuro', 'faro aguçado', 'audição fina', 'ecolocalização', 'sente calor', 'sente tremores', 'sente magia', 'telepatia', 'cego'] },
  { key: 'inteligência', label: 'Inteligência', group: 'mente', options: ['animal', 'astuta', 'sapiente', 'mente coletiva', 'ancestral'] },
  { key: 'sociedade', label: 'Vive em', group: 'mente', options: ['solidão', 'casais', 'bandos', 'clãs', 'tribos', 'colmeia', 'cidades', 'nação', 'nômade'] },
  { key: 'comunicação', label: 'Comunicação', group: 'mente', multi: true, options: ['fala', 'canto', 'gestos', 'cheiros', 'cores', 'luzes', 'telepatia', 'escrita'] },
  { key: 'temperamento', label: 'Temperamento', group: 'mente', options: ['pacífico', 'curioso', 'desconfiado', 'territorial', 'agressivo', 'brincalhão', 'solene'] },
  { key: 'habitat', label: 'Habitat', group: 'ambiente', hint: '[[Lugar]] ou bioma: floresta, deserto...' },
  { key: 'clima', label: 'Clima', group: 'ambiente', options: ['gelado', 'frio', 'temperado', 'quente', 'tórrido', 'qualquer'] },
  { key: 'atividade', label: 'Ativo de', group: 'ambiente', options: ['dia', 'noite', 'crepúsculo', 'qualquer hora'] },
  { key: 'frequência', label: 'Quantos há', group: 'ambiente', options: ['lendário', 'raríssimo', 'raro', 'incomum', 'comum', 'abundante', 'praga'] },
];

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

/** Valor de um campo da espécie na ficha (aceita a chave sem acento). */
export function speciesValue(props: Record<string, unknown>, key: string): string {
  const k = Object.keys(props).find((p) => fold(p) === fold(key));
  return k ? asList(props[k] as never).join(', ') : '';
}

export interface SpeciesSeed {
  sapiente?: boolean;
  /** bioma onde vive (id de clima.ts: deserto, taiga, selva...) */
  bioma?: string;
}

/**
 * Sorteia o que falta de uma espécie, coerente com o que já existe:
 * o bioma puxa o clima, o revestimento e a atividade; o tamanho puxa o
 * peso, a vida longa puxa a maioridade tardia e a ninhada pequena.
 */
export function rollSpecies(rng: Rng, have: Record<string, string> = {}, seed: SpeciesSeed = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const cur = (k: string) => out[k] ?? have[k] ?? '';
  const set = (k: string, v: string) => {
    if (!cur(k)) out[k] = v;
  };
  const bio = fold(seed.bioma ?? have['habitat'] ?? '');
  const cold = /gelo|tundra|taiga|neve|artic|polar|gelad/.test(bio);
  const hot = /desert|ermo|savana|vulcan/.test(bio);
  const wet = /selva|pantano|mangue|floresta/.test(bio);
  const sea = /mar|oceano|recife|lago|rio/.test(bio);
  const sap = seed.sapiente ?? /sapiente|coletiva|ancestral/.test(fold(have['inteligência'] ?? have['inteligencia'] ?? ''));

  set('corpo', sea ? 'aquático' : sap ? pick(rng, ['bípede', 'bípede', 'bípede', 'centauroide', 'alado', 'quadrúpede']) : pick(rng, ['quadrúpede', 'quadrúpede', 'hexápode', 'serpentino', 'alado', 'bípede', 'radial', 'amorfo']));
  const corpo = fold(cur('corpo'));
  set('revestimento', cold ? pick(rng, ['pelos', 'penas', 'pelos']) : hot ? pick(rng, ['escamas', 'quitina', 'pele nua']) : sea ? pick(rng, ['escamas', 'pele nua', 'gosma']) : corpo === 'hexapode' ? 'quitina' : corpo === 'alado' ? 'penas' : pick(rng, ['pele nua', 'pelos', 'escamas', 'penas', 'casca']));
  const size = sap ? 1.1 + rng() * 1.2 : Math.exp((rng() - 0.5) * 4.4);
  set('altura', (Math.round(size * 100) / 100).toLocaleString('pt-BR'));
  const h = Number(cur('altura').replace(',', '.')) || size;
  set('peso', String(Math.max(1, Math.round(Math.pow(h, 2.6) * 26 * (corpo === 'serpentino' ? 0.4 : 1)))));
  const cores = cold ? ['branco', 'cinza', 'prateado'] : hot ? ['ocre', 'dourado', 'marrom'] : wet ? ['verde', 'marrom', 'musgo'] : sea ? ['azul', 'prateado', 'verde'] : ['marrom', 'cinza', 'vermelho', 'preto', 'dourado', 'roxo'];
  set('cor', `${pick(rng, cores)} e ${pick(rng, ['preto', 'branco', 'dourado', 'vermelho', 'azul', 'creme'])}`);
  const tr = new Set<string>();
  const n = 1 + Math.floor(rng() * 3);
  const pool = [...(sea ? ['guelras', 'espinhos', 'brilho', 'tentáculos'] : []), ...(cold ? ['juba', 'garras'] : []), ...(hot ? ['espinhos', 'carapaça'] : []), 'chifres', 'cauda', 'garras', 'presas', 'orelhas longas', 'olhos extras', 'antenas'];
  while (tr.size < n) tr.add(pick(rng, pool));
  if (corpo === 'alado') tr.add('asas');
  set('traços físicos', [...tr].join(', '));

  set('dieta', sap ? pick(rng, ['onívoro', 'onívoro', 'herbívoro', 'carnívoro']) : h > 2.5 ? pick(rng, ['herbívoro', 'carnívoro']) : pick(rng, ['herbívoro', 'carnívoro', 'onívoro', 'necrófago', 'filtrador']));
  set('metabolismo', cold ? pick(rng, ['sangue quente', 'hiberna']) : /escamas|quitina/.test(fold(cur('revestimento'))) ? 'sangue frio' : 'sangue quente');
  set('reprodução', /escamas|penas|quitina/.test(fold(cur('revestimento'))) ? 'ovíparo' : pick(rng, ['vivíparo', 'vivíparo', 'ovíparo', 'brotamento']));
  set('sexos', pick(rng, ['dois', 'dois', 'dois', 'um só', 'muda com a idade', 'três ou mais']));
  // vida: bicho grande e mente grande vivem mais
  const life = Math.round((sap ? 60 + rng() * 240 : 4 + h * 12 + rng() * 30) / 5) * 5;
  set('expectativa de vida', String(life));
  const L = Number(cur('expectativa de vida').replace(/\D/g, '')) || life;
  set('maioridade', String(Math.max(1, Math.round(L * (0.14 + rng() * 0.08)))));
  set('gestação', String(Math.max(1, Math.round((h * 4 + rng() * 4) * (fold(cur('reprodução')) === 'oviparo' ? 0.5 : 1)))));
  set('ninhada', L > 120 ? '1' : h < 0.5 ? `${2 + Math.floor(rng() * 6)}-${8 + Math.floor(rng() * 10)}` : pick(rng, ['1', '1-2', '2-4']));
  const sens = new Set<string>();
  if (/noite/.test(fold(cur('atividade'))) || hot) sens.add('visão no escuro');
  sens.add(pick(rng, ['faro aguçado', 'audição fina', 'sente tremores', 'sente calor', 'sente magia', 'ecolocalização']));
  set('sentidos', [...sens].join(', '));
  set('inteligência', sap ? pick(rng, ['sapiente', 'sapiente', 'mente coletiva', 'ancestral']) : pick(rng, ['animal', 'animal', 'astuta']));
  set('sociedade', sap ? pick(rng, ['clãs', 'tribos', 'cidades', 'nação', 'nômade', 'colmeia']) : pick(rng, ['solidão', 'casais', 'bandos', 'bandos', 'colmeia']));
  set('comunicação', sap ? pick(rng, ['fala', 'fala, gestos', 'canto', 'fala, escrita', 'cores, luzes', 'telepatia']) : pick(rng, ['cheiros', 'canto', 'gestos', 'cores']));
  set('temperamento', pick(rng, ['pacífico', 'curioso', 'desconfiado', 'territorial', 'agressivo', 'brincalhão', 'solene']));
  set('clima', cold ? 'frio' : hot ? 'quente' : pick(rng, ['temperado', 'quente', 'frio', 'qualquer']));
  set('atividade', hot ? pick(rng, ['noite', 'crepúsculo']) : pick(rng, ['dia', 'dia', 'noite', 'crepúsculo']));
  set('frequência', sap ? pick(rng, ['comum', 'incomum', 'raro']) : pick(rng, ['comum', 'abundante', 'incomum', 'raro', 'raríssimo']));
  return out;
}

// ------------------------------------------------------------------ silhueta

export interface SpeciesFigure {
  plano: 'bipede' | 'quadrupede' | 'centauroide' | 'hexapode' | 'serpentino' | 'alado' | 'aquatico' | 'radial' | 'amorfo';
  altura: number;
  cor: string;
  cor2: string;
  revestimento: string;
  chifres: boolean;
  cauda: boolean;
  asas: boolean;
  antenas: boolean;
  tentaculos: boolean;
  brilho: boolean;
  espinhos: boolean;
  olhos: number;
  orelhas: boolean;
  juba: boolean;
}

const COR: Record<string, string> = {
  verde: '#4f8a4b', musgo: '#5d6b3a', azul: '#3f6fb0', vermelho: '#b23a3a', preto: '#2b2a2e', branco: '#e9e6df', cinza: '#8a8c92', marrom: '#7a5236',
  dourado: '#d4a53c', prateado: '#b8c0c8', roxo: '#6e4c9a', rosa: '#d77fa1', laranja: '#d9772b', amarelo: '#e2c044', ocre: '#c08a3e', creme: '#efe1bf',
  turquesa: '#3aa6a0', bronze: '#a8713a', violeta: '#7e57c2',
};
const colorWords = (s: string) => fold(s).split(/[^a-z]+/).map((w) => COR[w] ?? Object.entries(COR).find(([k]) => w.startsWith(k.slice(0, 5)))?.[1]).filter((x): x is string => !!x);

/** Parâmetros do desenho da espécie a partir das propriedades. */
export function speciesFigure(props: Record<string, unknown>): SpeciesFigure {
  const v = (k: string) => fold(speciesValue(props, k));
  const corpo = v('corpo');
  const plano = (['bipede', 'quadrupede', 'centauroide', 'hexapode', 'serpentino', 'alado', 'aquatico', 'radial', 'amorfo'] as const).find((p) => corpo.startsWith(p.slice(0, 5))) ?? 'bipede';
  const alt = Number(v('altura').replace(',', '.').replace(/[^\d.]/g, ''));
  const cores = colorWords(speciesValue(props, 'cor'));
  const rev = v('revestimento');
  const base = cores[0] ?? (/escama/.test(rev) ? COR.verde! : /pena/.test(rev) ? COR.ocre! : /quitina/.test(rev) ? COR.marrom! : /cristal/.test(rev) ? COR.turquesa! : /pedra/.test(rev) ? COR.cinza! : '#a07a5a');
  const tr = v('traços físicos') + ' ' + v('tracos fisicos');
  const olhos = /olhos extras/.test(tr) ? 4 : /cego/.test(v('sentidos')) ? 0 : 2;
  return {
    plano, altura: Number.isFinite(alt) && alt > 0 ? alt : plano === 'bipede' ? 1.7 : 1, cor: base, cor2: cores[1] ?? '#2b2a2e', revestimento: rev,
    chifres: /chifre/.test(tr), cauda: /cauda/.test(tr) || plano === 'quadrupede' || plano === 'centauroide', asas: /asa/.test(tr) || plano === 'alado',
    antenas: /antena/.test(tr) || plano === 'hexapode', tentaculos: /tentac/.test(tr) || plano === 'radial', brilho: /brilho|biolum/.test(tr), espinhos: /espinho/.test(tr),
    olhos, orelhas: /orelha/.test(tr), juba: /juba/.test(tr),
  };
}

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
  const plural = (w: string) => (/l$/.test(w) ? w.replace(/l$/, 'is') : /s$/.test(w) ? w : `${w}s`);
  if (corpo || alt) parts.push(`${name} ${corpo ? `são ${plural(corpo.toLowerCase())}` : 'são seres'}${alt ? ` de cerca de ${alt} m` : ''}${v('revestimento') ? `, cobertos de ${v('revestimento').toLowerCase()}` : ''}${v('cor') ? ` ${v('cor').toLowerCase()}` : ''}.`);
  if (v('traços físicos')) parts.push(`Chamam a atenção: ${v('traços físicos').toLowerCase()}.`);
  const dieta = v('dieta').toLowerCase();
  const come = !dieta ? 'São' : /^de /.test(dieta) ? `Alimentam-se ${dieta}` : /o$/.test(dieta) ? `São ${dieta}s` : `São ${dieta}`;
  if (dieta || v('atividade')) parts.push(`${come}${v('atividade') ? `${dieta ? ' e' : ''} ativos de ${v('atividade').toLowerCase()}` : ''}.`);
  if (v('expectativa de vida')) parts.push(`Vivem uns ${v('expectativa de vida')} anos${v('maioridade') ? ` e são adultos aos ${v('maioridade')}` : ''}.`);
  if (v('sociedade')) parts.push(`Vivem em ${v('sociedade').toLowerCase()}${v('comunicação') ? ` e se comunicam por ${v('comunicação').toLowerCase()}` : ''}.`);
  return parts.join(' ');
}

export const asStr = (v: unknown): string => asText(v as never);
