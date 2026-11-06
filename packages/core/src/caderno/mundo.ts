import { asList, asText, bodyOf, parseProps, type Props } from './frontmatter';
import { getSection, linkTarget, noteDir, noteName, sameTitle, wikiLinks } from './markdown';

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
  /** propriedades que entram no modelo ao criar */
  fields: string[];
  /** seções sugeridas no texto */
  sections: string[];
  /** campos que a tela sugere como botão (não entram no modelo, para a nota nascer enxuta) */
  extras?: string[];
  /** valores iniciais dos campos (tipos criados por regra) */
  defaults?: Record<string, string>;
  /** cor e símbolo (tipos criados por regra) */
  color?: string;
  glyph?: string;
}

// tipos declarados nas regras dos mundos (`tipo navio:`), somados aos de fábrica
let custom: EntityType[] = [];

/** Troca os tipos declarados por regra (a tela chama depois de reler as regras). */
export function setCustomTypes(types: EntityType[]): void {
  custom = types.filter((t) => !ENTITY_TYPES.some((x) => x.id === t.id));
}

/** Tipos de fábrica e os criados por regra. */
export const allTypes = (): EntityType[] => [...ENTITY_TYPES, ...custom];

export const ENTITY_TYPES: EntityType[] = [
  { id: 'personagem', label: 'Personagem', plural: 'Personagens', fields: ['espécie', 'nascimento', 'morte', 'origem', 'afiliação', 'status'],
    sections: ['Aparência', 'Personalidade', 'Motivações', 'História'],
    extras: ['sexo', 'profissão', 'traços', 'gostos', 'local', 'cônjuge', 'pai', 'mãe', 'amigos', 'inimigos', 'motivação', 'medo', 'segredo', 'cultura', 'título', 'voz', 'olhos', 'cabelo', 'orientação'] },
  { id: 'lugar', label: 'Lugar', plural: 'Lugares', fields: ['parte de', 'clima', 'governante', 'fundação'], sections: ['Descrição', 'História'],
    extras: ['população', 'cultura', 'recursos', 'perigos', 'controle'] },
  { id: 'faccao', label: 'Facção', plural: 'Facções', fields: ['líder', 'sede', 'fundação', 'ideologia'], sections: ['Objetivos', 'História'],
    extras: ['poder', 'riqueza', 'estabilidade', 'aliados', 'inimigos', 'território', 'símbolo', 'lema'] },
  { id: 'evento', label: 'Evento', plural: 'Eventos', fields: ['data', 'fim', 'local', 'envolvidos'], sections: ['O que aconteceu', 'Consequências'], extras: ['causa', 'mortos'] },
  { id: 'conflito', label: 'Conflito', plural: 'Conflitos', fields: ['lados', 'início', 'fim', 'status', 'intensidade', 'causa'], sections: ['Causa', 'Lados', 'Desdobramentos'],
    extras: ['local', 'vencedor', 'mortos'] },
  { id: 'item', label: 'Item', plural: 'Itens', fields: ['dono', 'categoria', 'raridade', 'valor'], sections: ['Descrição', 'Poderes', 'História', 'Lendas'],
    extras: ['único', 'ajustes', 'concede', 'por mês', 'local', 'cobiçado', 'origem', 'criador', 'poder', 'peso', 'maldição'] },
  { id: 'especie', label: 'Espécie', plural: 'Espécies', fields: ['habitat', 'expectativa de vida', 'maioridade'], sections: ['Biologia', 'Sociedade', 'Cultura', 'Variações'],
    extras: ['altura', 'fertilidade', 'gestação', 'cruza com', 'frequência', 'traços', 'dieta', 'idioma', 'inimigos naturais'] },
  { id: 'cultura', label: 'Cultura', plural: 'Culturas', fields: ['região', 'idioma', 'religião', 'valores'], sections: ['Costumes', 'Arte e festas', 'Tabus'],
    extras: ['comida', 'vestimenta', 'saudação', 'ritos de passagem'] },
  { id: 'conceito', label: 'Conceito', plural: 'Conceitos', fields: ['categoria'], sections: ['Como funciona', 'Limites'], extras: ['custo', 'origem', 'quem usa'] },
  { id: 'criatura', label: 'Criatura', plural: 'Criaturas', fields: ['nd', 'habitat', 'pv', 'pv máx', 'ca'], sections: ['Descrição', 'Ecologia', 'Táticas'],
    extras: ['expectativa de vida', 'maioridade', 'gestação', 'frequência', 'traços', 'dieta', 'fraqueza', 'comportamento'] },
  { id: 'mapa', label: 'Mapa', plural: 'Mapas', fields: ['escala', 'unidade'], sections: ['Marcadores'] },
];

/** Dica do que escrever em cada campo (aparece no campo vazio). */
export const FIELD_HINTS: Record<string, string> = {
  'espécie': '[[Humano]]', nascimento: 'ano: 312, -50, 50 a.C.', morte: 'ano, ou vazio se vive', origem: '[[Lugar]] onde nasceu',
  'afiliação': '[[Facção]] a que pertence', status: 'vivo, morto, desaparecido…', 'motivação': 'o que quer mais que tudo',
  medo: 'o que evita a qualquer custo', segredo: 'o que ninguém sabe', aliados: '[[Alguém]], [[Outro]]', inimigos: '[[Alguém]], [[Facção]]',
  pai: '[[Personagem]]', 'mãe': '[[Personagem]]', 'parte de': '[[Região maior]]', governante: '[[Personagem]] ou [[Facção]]',
  'fundação': 'ano', 'líder': '[[Personagem]]', sede: '[[Lugar]]', ideologia: 'em que acreditam', poder: '1 a 10 (simulação)',
  riqueza: '1 a 10 (simulação)', estabilidade: '1 a 10 (simulação)', 'território': '[[Lugar]], [[Lugar]]', data: 'ano ou dd/mm/ano',
  fim: 'ano', local: '[[Lugar]]', envolvidos: '[[Personagem]], [[Facção]]', lados: '[[Facção A]], [[Facção B]]',
  'início': 'ano', intensidade: '1 a 5', causa: 'o estopim', dono: '[[Personagem]]', habitat: '[[Lugar]] ou bioma',
  'expectativa de vida': 'anos, ex.: 80', 'região': '[[Lugar]]', idioma: '[[Idioma]]', 'religião': '[[Fé]]', valores: 'honra, liberdade…',
  escala: 'largura do mapa, ex.: 1200', unidade: 'km, léguas, dias…', vencedor: '[[Lado]]', controle: '[[Facção]] que manda aqui',
};

/**
 * Perguntas para aprofundar uma ficha. Respondê-las rende mais que preencher
 * campos: dão motivo, contradição e gancho de história.
 */
export const DEEP_QUESTIONS: Record<string, string[]> = {
  personagem: [
    'O que essa pessoa quer, e o que ela realmente precisa?', 'Qual mentira ela conta para si mesma?',
    'De quem ela sente falta?', 'O que faria ela trair um aliado?', 'Que cheiro, som ou mania a denuncia numa sala?',
    'Qual foi o pior dia da vida dela?', 'Quem a odeia com razão?', 'O que ela faria com poder ilimitado por um dia?',
  ],
  lugar: [
    'Como é chegar aqui pela primeira vez: o que se vê, ouve e cheira?', 'Quem manda de verdade, e quem acha que manda?',
    'Do que as pessoas daqui têm medo?', 'O que só os moradores sabem?', 'Que lugar daqui não aparece nos mapas?', 'O que mudou nos últimos dez anos?',
  ],
  faccao: [
    'O que a facção promete, e o que entrega de fato?', 'Quem quer derrubar o líder por dentro?', 'Como se entra, e como se sai (se é que se sai)?',
    'Qual foi a maior vergonha da facção?', 'Do que vivem: quem paga as contas?', 'Que símbolo os outros pintam nas paredes para provocá-los?',
  ],
  evento: ['Quem saiu ganhando, e quem foi esquecido?', 'Como os vencedores contam a história? E os vencidos?', 'Que pequeno acaso mudou tudo?', 'O que ainda dói hoje por causa disso?'],
  conflito: ['O que cada lado acha que está defendendo?', 'Quem lucra com a guerra continuar?', 'Que acordo acabaria com isso amanhã, e por que ninguém aceita?', 'Quem está preso no meio?'],
  item: ['Quem o fez, e por quê?', 'Que preço cobra de quem o usa?', 'Quem mais o procura agora?', 'Que lenda falsa contam sobre ele?'],
  especie: ['Como nascem, crescem e morrem?', 'O que as outras espécies entendem errado sobre eles?', 'O que comem, e o que os come?', 'Qual o tabu da espécie?'],
  cultura: ['Como se cumprimentam e como se insultam?', 'O que se come numa festa, e numa despedida?', 'Como tratam os mortos?', 'Que história toda criança aprende?'],
  conceito: ['Quem pode usar isso, e quem é proibido?', 'Qual o custo de usar?', 'O que acontece quando dá errado?', 'Quem descobriu, e quem esconde a verdade?'],
  criatura: ['Por que ataca: fome, território, ordem de alguém?', 'Como os moradores se protegem dela?', 'Que parte dela vale ouro?', 'Ela pensa?'],
};

const TYPE_ALIASES: Record<string, string> = {
  personagens: 'personagem', character: 'personagem', npc: 'personagem',
  lugares: 'lugar', local: 'lugar', location: 'lugar', place: 'lugar', regiao: 'lugar', região: 'lugar', cidade: 'lugar',
  facção: 'faccao', faccoes: 'faccao', facções: 'faccao', faction: 'faccao', organização: 'faccao', organizacao: 'faccao', grupo: 'faccao',
  eventos: 'evento', event: 'evento', acontecimento: 'evento',
  itens: 'item', objeto: 'item', artefato: 'item',
  espécie: 'especie', especies: 'especie', espécies: 'especie', raça: 'especie', raca: 'especie', species: 'especie',
  criaturas: 'criatura', monstro: 'criatura', monstros: 'criatura', monster: 'criatura', creature: 'criatura', besta: 'criatura', inimigo: 'criatura',
  conceitos: 'conceito', magia: 'conceito', sistema: 'conceito', religião: 'conceito', idioma: 'conceito',
  conflitos: 'conflito', guerra: 'conflito', guerras: 'conflito', rivalidade: 'conflito', conflict: 'conflito', war: 'conflito',
  culturas: 'cultura', povo: 'cultura', povos: 'cultura', culture: 'cultura', tradição: 'cultura',
  mapas: 'mapa', map: 'mapa',
};

/** "Facção", "facções", "faction" → "faccao"; tipos desconhecidos ficam como vieram. */
export function normalizeType(t: string): string {
  const k = t.trim().toLowerCase();
  if (ENTITY_TYPES.some((x) => x.id === k)) return k;
  const plain = k.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (custom.some((x) => x.id === plain)) return plain;
  return TYPE_ALIASES[k] ?? k;
}

export const typeInfo = (id: string): EntityType =>
  ENTITY_TYPES.find((t) => t.id === id) ?? custom.find((t) => t.id === id || t.id === id.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) ?? { id, label: id.charAt(0).toUpperCase() + id.slice(1), plural: id.charAt(0).toUpperCase() + id.slice(1), fields: [], sections: [] };

/** Propriedades que não viram ligação nem aparecem como campo comum (a imagem vira o retrato). */
export const RESERVED = new Set(['tipo', 'type', 'mundo', 'world', 'aliases', 'apelidos', 'tags', 'cssclasses',
  'imagem', 'retrato', 'capa', 'image', 'portrait', 'cover', 'img', 'foto', 'semente']);

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
  /** palavras do texto (sem as propriedades) */
  words: number;
  /** quanto a ficha está preenchida, de 0 a 1 (ver `completeness`) */
  score: number;
}

export interface World {
  name: string;
  path: string | null;
  entities: Entity[];
  relations: Relation[];
  /** propriedades da nota do mundo (ex.: `ano` atual) */
  props?: Props;
  /** blocos ```regras das notas do mundo, com a linha onde começam */
  scripts?: Array<{ path: string; code: string; line: number }>;
  /** notas de simulação de vidas (`tipo: simulação`) */
  sims?: string[];
}

/** Blocos ```regras de uma nota, com a linha (a partir de 1) da primeira linha de código. */
export function ruleBlocks(path: string, text: string): Array<{ path: string; code: string; line: number }> {
  if (!text.includes('```regras')) return [];
  const out: Array<{ path: string; code: string; line: number }> = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```regras\s*$/.test(lines[i]!)) continue;
    let j = i + 1;
    while (j < lines.length && !/^\s*```\s*$/.test(lines[j]!)) j++;
    out.push({ path, code: lines.slice(i + 1, j).join('\n'), line: i + 2 });
    i = j;
  }
  return out;
}

/** O "agora" do mundo: `ano` na nota do mundo, ou a última data da linha do tempo. */
export function worldYear(w: World): number {
  const raw = w.props ? asText(w.props['ano'] ?? w.props['ano atual'] ?? w.props['hoje']) : '';
  const n = raw ? parseWorldDate(raw) : null;
  if (n !== null) return Math.floor(n);
  const t = timeline(w);
  return t.length ? Math.floor(Math.max(...t.map((s) => s.end ?? s.at))) : 0;
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

  const scripts: Array<{ world: string; block: { path: string; code: string; line: number } }> = [];
  for (const { path, text } of notes) {
    add(noteName(path), path);
    add(path.replace(/\.md$/i, ''), path);
    const blocks = ruleBlocks(path, text);
    if (blocks.length) {
      const fm = text.startsWith('---') ? parseProps(text) : {};
      const isWorld = normalizeType(asText(fm['tipo'] ?? fm['type'])) === 'mundo';
      const wn = isWorld ? noteName(path) : worldOf(path, fm);
      if (wn) for (const b of blocks) scripts.push({ world: wn, block: b });
    }
    if (!text.startsWith('---')) continue;
    const props = parseProps(text);
    const aliases = asList(props['aliases'] ?? props['apelidos']);
    for (const a of aliases) add(a, path);
    const tipo = normalizeType(asText(props['tipo'] ?? props['type']));
    // bancos de texto (tabelas de rolagem) não são fichas, mesmo dentro da pasta do mundo
    if (!tipo || tipo === 'tabela') continue;
    // simulações de vidas também não: ficam numa lista à parte
    if (tipo.normalize('NFD').replace(/[̀-ͯ]/g, '') === 'simulacao') {
      const wn = worldOf(path, props);
      if (wn) (get(wn).sims ??= []).push(path);
      continue;
    }
    if (tipo === 'mundo' || tipo === 'world') {
      const w = get(noteName(path));
      w.path = path;
      w.props = props;
      continue;
    }
    const world = worldOf(path, props);
    if (!world) continue;
    const body = bodyOf(text);
    const e: Entity = {
      path, name: noteName(path), world, type: tipo, props, aliases, summary: summaryOf(text), relations: [],
      words: (body.match(/[\p{L}\p{N}]+/gu) ?? []).length, score: 0,
    };
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
  // quem é citado por quantos (uma vez por ficha que cita)
  const incoming = new Map<string, number>();
  for (const { e } of pending) {
    for (const to of new Set(e.relations.map((r) => r.to))) if (to && to !== e.path) incoming.set(to, (incoming.get(to) ?? 0) + 1);
  }
  for (const { e, text } of pending) {
    e.score = completeness(e, text, e.relations.filter((r) => r.to).length + (incoming.get(e.path) ?? 0));
  }

  for (const s of scripts) (get(s.world).scripts ??= []).push(s.block);
  for (const w of worlds.values()) w.entities.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return [...worlds.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

const IMAGE_KEYS = ['imagem', 'retrato', 'capa', 'image', 'portrait', 'cover', 'img', 'foto'];

/**
 * Quanto uma ficha está "viva", de 0 a 1: tem uma frase de resumo, imagem,
 * os campos do tipo preenchidos, texto nas seções sugeridas e ligações.
 * Serve para o anel nos cartões e para sugerir o que falta.
 */
export function completeness(e: Pick<Entity, 'type' | 'props' | 'summary'>, text: string, links: number): number {
  const t = typeInfo(e.type);
  const filled = (k: string) => {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    return key !== undefined && asText(e.props[key]).trim() !== '';
  };
  let s = e.summary ? 0.15 : 0;
  if (IMAGE_KEYS.some(filled) || e.type === 'mapa' && filled('semente')) s += 0.1;
  s += t.fields.length ? (0.3 * t.fields.filter(filled).length) / t.fields.length : 0.3;
  if (t.sections.length) {
    const body = bodyOf(text);
    const ok = t.sections.filter((sec) => (getSection(body, sec) ?? '').replace(/[|\s-]/g, '').length > 0).length;
    s += (0.25 * ok) / t.sections.length;
  } else s += 0.25;
  s += links >= 3 ? 0.2 : links >= 1 ? 0.1 : 0;
  return Math.round(Math.min(1, s) * 100) / 100;
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
  if (type === 'mapa') {
    let seed = 7;
    for (const c of name) seed = (seed * 31 + c.charCodeAt(0)) % 99991;
    return `---
tipo: mapa
mundo: ${world}
escala: 1000
unidade: km
semente: ${seed}
---
# ${name}

## Marcadores

| Marcador | X | Y |
| -------- | - | - |
`;
  }
  const fields = t.fields.map((f) => `${/[:#]/.test(f) ? `"${f}"` : f}: ${t.defaults?.[f] ?? ''}`.trimEnd()).join('\n');
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
