import type { Rng } from '../rpg/dice';
import { asList, asText, bodyOf } from './frontmatter';
import { getSection, sameTitle } from './markdown';
import type { Entity, World } from './mundo';

/*
 * Poderes: dons, técnicas, feitiços com nome próprio, implantes, bênçãos.
 *
 * Cada poder é uma ficha (`tipo: poder`) com fonte, nível (1 a 10), custo,
 * pré-requisito (`requer: [[Outro poder]]`) e quem o tem. Aqui se mede o
 * equilíbrio (o que o poder faz contra o que ele cobra), a "assinatura" que a
 * tela desenha em radar, a árvore de pré-requisitos (as constelações) e uma
 * forja que sorteia poderes coerentes para destravar a imaginação.
 *
 * A regra de ofício por trás: poder sem custo e sem limite resolve qualquer
 * cena, e uma história em que tudo se resolve não tem tensão.
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
const palavras = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

export const CATEGORIAS_PODER = [
  { id: 'ataque', label: 'Ataque', glifo: '⚔', cor: '#e5654b' },
  { id: 'defesa', label: 'Defesa', glifo: '⛨', cor: '#5b9bd5' },
  { id: 'cura', label: 'Cura', glifo: '✚', cor: '#5fbf77' },
  { id: 'mente', label: 'Mente', glifo: '◉', cor: '#b277ee' },
  { id: 'movimento', label: 'Movimento', glifo: '➶', cor: '#4fc1c9' },
  { id: 'percepcao', label: 'Percepção', glifo: '◎', cor: '#e8c547' },
  { id: 'transformacao', label: 'Transformação', glifo: '❖', cor: '#d98fb0' },
  { id: 'invocacao', label: 'Invocação', glifo: '✶', cor: '#9d7bea' },
  { id: 'criacao', label: 'Criação', glifo: '✺', cor: '#f2a65a' },
  { id: 'utilidade', label: 'Utilidade', glifo: '✧', cor: '#9aa3ad' },
] as const;
export type CategoriaPoder = (typeof CATEGORIAS_PODER)[number]['id'];

const PALAVRAS_CATEGORIA: Array<[CategoriaPoder, RegExp]> = [
  ['cura', /cur|regener|sar(a|ar)|vida|restaur|ressusc/],
  ['defesa', /defe|escud|prote|barreir|armadur|resist|imun/],
  ['mente', /ment|psiq|telepat|control|domin|ilus|sonh|memor|emoc|persuas|encant/],
  ['movimento', /mov|teleport|voo|voar|velocid|salto|passo|atravess|portal|viagem/],
  ['percepcao', /perce|vis(ao|ion)|sentid|detect|prev|clarivid|adivinh|rastre|olho/],
  ['transformacao', /transf|metamorf|forma|muta|licantrop|metal|pele/],
  ['invocacao', /invoc|conjur|chamad|espirit|demon|fera|servo|necro/],
  ['criacao', /cria|forj|constru|materializ|gera|cresc/],
  ['ataque', /ataq|dano|fogo|raio|golpe|destru|explos|lamina|veneno|chama|gelo/],
];

export interface Poder {
  e: Entity;
  /** 1 a 10 */
  nivel: number;
  fonte: string;
  custo: string;
  categoria: CategoriaPoder;
  /** 1 (toque) a 5 (ilimitado) */
  alcance: number;
  /** 1 (instantâneo) a 5 (permanente) */
  duracao: number;
  /** palavras escritas nas seções de limites e contramedidas */
  limites: number;
  fraqueza: string;
  colateral: string;
  efeito: number;
  /** caminhos dos poderes exigidos antes */
  requer: string[];
}

function nivelDe(raw: string): number {
  const n = Number(raw.replace(',', '.').match(/-?\d+(\.\d+)?/)?.[0]);
  if (Number.isFinite(n) && raw.match(/\d/)) return Math.max(1, Math.min(10, Math.round(n)));
  const f = fold(raw);
  if (/divin|absolut|cosmic|lendari/.test(f)) return 10;
  if (/maior|mestre|epic|superior|alto/.test(f)) return 7;
  if (/medi|intermedi|adept/.test(f)) return 5;
  if (/menor|inicia|basic|baixo|truque/.test(f)) return 2;
  return 3;
}

const escala = (raw: string, tabela: Array<[RegExp, number]>, padrao: number): number => {
  const f = fold(raw);
  if (!f) return padrao;
  for (const [re, v] of tabela) if (re.test(f)) return v;
  return padrao;
};
const ALCANCE: Array<[RegExp, number]> = [[/ilimit|qualquer|mundo|planet|infinit/, 5], [/longo|horizonte|quilom|leguas?/, 4], [/medio|visao|vista|metros/, 3], [/curto|perto|proxim|sala/, 2], [/toque|propri|si mesm|contato|pessoal/, 1]];
const DURACAO: Array<[RegExp, number]> = [[/perman|eterno|para sempre|irrevers/, 5], [/dia|semana|mes|ano/, 4], [/hora/, 3], [/minuto|cena|turno|rodada/, 2], [/instant|imediat|segundo/, 1]];

export function categoriaDe(e: Pick<Entity, 'props' | 'name'>, efeito = ''): CategoriaPoder {
  const c = fold(prop(e, 'categoria', 'tipo de poder', 'escola'));
  for (const x of CATEGORIAS_PODER) if (c && (fold(x.label) === c || c.startsWith(x.id.slice(0, 4)))) return x.id;
  const t = fold(`${c} ${e.name} ${efeito}`);
  for (const [id, re] of PALAVRAS_CATEGORIA) if (re.test(t)) return id;
  return 'utilidade';
}

/** Lê a ficha de um poder. `texto` é a nota inteira (as seções contam para os limites). */
export function lerPoder(e: Entity, texto: string): Poder {
  const corpo = bodyOf(texto);
  const efeito = getSection(corpo, 'Efeito') ?? '';
  const lim = (getSection(corpo, 'Limites') ?? '') + ' ' + (getSection(corpo, 'Contramedidas') ?? '');
  return {
    e,
    nivel: nivelDe(prop(e, 'nível', 'nivel', 'tier', 'grau')),
    fonte: prop(e, 'fonte', 'origem') || 'sem fonte',
    custo: prop(e, 'custo', 'preço', 'preco'),
    categoria: categoriaDe(e, efeito),
    alcance: escala(prop(e, 'alcance'), ALCANCE, 2),
    duracao: escala(prop(e, 'duração', 'duracao'), DURACAO, 2),
    limites: palavras(lim),
    fraqueza: prop(e, 'fraqueza', 'contra'),
    colateral: prop(e, 'efeito colateral', 'colateral'),
    efeito: palavras(efeito),
    requer: e.relations.filter((r) => r.to && /^(requer|pre-?requisito|exige|depois de)$/.test(fold(r.label))).map((r) => r.to!),
  };
}

// ------------------------------------------------------------------ equilíbrio

export type Veredito = 'quebrado' | 'forte' | 'equilibrado' | 'caro';

export const VEREDITOS: Record<Veredito, { label: string; cor: string; desc: string }> = {
  quebrado: { label: 'Quebrado', cor: '#e5484d', desc: 'Faz muito e não cobra quase nada. Vai resolver cenas sozinho.' },
  forte: { label: 'Forte', cor: '#f2a65a', desc: 'Ainda barato para o que entrega. Um limite a mais e fica redondo.' },
  equilibrado: { label: 'Equilibrado', cor: '#5fbf77', desc: 'O preço acompanha a força. Rende escolhas difíceis.' },
  caro: { label: 'Caro demais', cor: '#5b9bd5', desc: 'Cobra mais do que entrega. Ótimo para tragédia; ruim se for para usar sempre.' },
};

const CUSTO_PESADO = /vida|sangue|anos|memori|lembran|sanidade|alma|morte|carne|olho|membro|nome|amor|sono eterno|filh/;
const CUSTO_MEDIO = /dor|ferid|fadiga|exaust|febre|tempo|sacrif|oferend|juramento|pacto|divida|fome|sede|enlouquec/;
const CUSTO_LEVE = /cansa|ouro|moeda|mana|energia|foco|concentr|component|ingredient|\bpo\b|cristal|gema|carga|bateria|combustiv/;

/** Quanto pesa um custo escrito por extenso, de 0 a 30. */
export function pesoDoCusto(custo: string): number {
  const f = fold(custo);
  if (!f || /^(nenhum|nada|gratis|sem custo|-|—|0)$/.test(f)) return 0;
  let p = 6;
  if (CUSTO_PESADO.test(f)) p = 26;
  else if (CUSTO_MEDIO.test(f)) p = 17;
  else if (CUSTO_LEVE.test(f)) p = 10;
  if (/permanent|para sempre|irrevers/.test(f)) p += 4;
  return Math.min(30, p);
}

export interface Equilibrio {
  forca: number;
  preco: number;
  /** preço ÷ força */
  razao: number;
  veredito: Veredito;
  dicas: string[];
}

export function equilibrio(p: Poder): Equilibrio {
  const extra = p.categoria === 'mente' || p.categoria === 'criacao' ? 5 : p.categoria === 'utilidade' || p.categoria === 'percepcao' ? -3 : 0;
  const forca = Math.max(4, p.nivel * 8 + p.alcance * 4 + p.duracao * 4 + extra);
  const preco = pesoDoCusto(p.custo) + Math.min(22, p.limites / 4) + (p.fraqueza ? 10 : 0) + (p.colateral ? 9 : 0) + (p.requer.length ? 5 : 0);
  const razao = preco / forca;
  const veredito: Veredito = razao < 0.3 ? 'quebrado' : razao < 0.55 ? 'forte' : razao <= 1.25 ? 'equilibrado' : 'caro';
  const dicas: string[] = [];
  if (!pesoDoCusto(p.custo)) dicas.push('Dê um custo: o que dói, cansa ou se perde quando o poder é usado?');
  if (p.limites < 12) dicas.push('Escreva os limites: o que este poder não consegue fazer de jeito nenhum?');
  if (!p.fraqueza && p.nivel >= 6) dicas.push('Poder alto pede fraqueza: o que anula, fere ou engana quem o usa?');
  if (p.alcance >= 5 && p.duracao >= 5) dicas.push('Alcance ilimitado e efeito permanente juntos viram poder de deus. É essa a intenção?');
  if (veredito === 'caro') dicas.push('Ninguém usaria isto à toa. Bom para um último recurso; para uso comum, alivie o custo.');
  if (!p.colateral && veredito !== 'caro') dicas.push('Um efeito colateral (sinais, cheiro, marcas) deixa o poder visível e rende cena.');
  if (p.efeito < 8) dicas.push('Descreva o efeito na seção "Efeito": o leitor precisa entender as regras antes do clímax.');
  return { forca: Math.round(forca), preco: Math.round(preco), razao: Math.round(razao * 100) / 100, veredito, dicas: dicas.slice(0, 4) };
}

/** Seis eixos de 0 a 1 para o radar: potência, alcance, duração, custo, controle e raridade. */
export function assinatura(p: Poder): Array<{ eixo: string; v: number }> {
  const raro = fold(prop(p.e, 'raridade', 'aprendizado'));
  return [
    { eixo: 'Potência', v: p.nivel / 10 },
    { eixo: 'Alcance', v: p.alcance / 5 },
    { eixo: 'Duração', v: p.duracao / 5 },
    { eixo: 'Custo', v: pesoDoCusto(p.custo) / 30 },
    { eixo: 'Controle', v: Math.min(1, (p.limites / 4 + (p.fraqueza ? 10 : 0)) / 30) },
    { eixo: 'Raridade', v: /lendari|unic|perdid/.test(raro) ? 1 : /rar|dificil|secret/.test(raro) ? 0.75 : /incomum|treino|anos/.test(raro) ? 0.5 : raro ? 0.3 : 0.2 },
  ];
}

// ------------------------------------------------------------------ portadores e árvore

/** Quem tem o poder: o campo `quem tem` do poder e o campo `poderes` das fichas. */
export function portadores(w: World, path: string): Entity[] {
  const byPath = new Map(w.entities.map((e) => [e.path, e]));
  const out = new Set<string>();
  const p = byPath.get(path);
  for (const r of p?.relations ?? []) if (r.to && /^(quem tem|portadores?|usuarios?|praticantes)$/.test(fold(r.label))) out.add(r.to);
  for (const e of w.entities) for (const r of e.relations) if (r.to === path && /^(poderes?|habilidades?|dons?)$/.test(fold(r.label))) out.add(e.path);
  return [...out].map((x) => byPath.get(x)).filter((x): x is Entity => !!x);
}

export interface ArvorePoderes {
  poderes: Poder[];
  /** fontes na ordem em que aparecem (cada uma vira uma constelação) */
  fontes: string[];
  ligacoes: Array<{ de: string; para: string }>;
  /** caminhos que fazem parte de um ciclo de pré-requisitos */
  ciclos: string[];
}

export function arvorePoderes(w: World, ler: (path: string) => string): ArvorePoderes {
  const poderes = w.entities.filter((e) => e.type === 'poder').map((e) => lerPoder(e, ler(e.path)));
  const ids = new Set(poderes.map((p) => p.e.path));
  const ligacoes = poderes.flatMap((p) => p.requer.filter((r) => ids.has(r)).map((r) => ({ de: r, para: p.e.path })));
  const fontes = [...new Set(poderes.map((p) => p.fonte))].sort((a, b) => (a === 'sem fonte' ? 1 : b === 'sem fonte' ? -1 : a.localeCompare(b, 'pt-BR')));
  // ciclos: busca em profundidade pelos pré-requisitos
  const req = new Map(poderes.map((p) => [p.e.path, p.requer.filter((r) => ids.has(r))]));
  const ciclos = new Set<string>();
  const visita = (no: string, pilha: string[]) => {
    const i = pilha.indexOf(no);
    if (i >= 0) { for (const x of pilha.slice(i)) ciclos.add(x); return; }
    if (pilha.length > 40) return;
    for (const r of req.get(no) ?? []) visita(r, [...pilha, no]);
  };
  for (const p of poderes) visita(p.e.path, []);
  return { poderes, fontes, ligacoes, ciclos: [...ciclos] };
}

// ------------------------------------------------------------------ forja

const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

const FORJA: Record<CategoriaPoder, { nomes: string[]; efeitos: string[] }> = {
  ataque: { nomes: ['Lâmina de {x}', 'Toque de {x}', 'Fúria de {x}', 'Lança de {x}'], efeitos: ['Concentra {x} num golpe que atravessa armaduras.', 'Lança uma rajada de {x} que queima o que toca.', 'Faz o próprio sangue virar {x} e ferir quem o derrama.'] },
  defesa: { nomes: ['Muralha de {x}', 'Pele de {x}', 'Véu de {x}', 'Égide de {x}'], efeitos: ['Ergue uma barreira de {x} que segura um golpe por vez.', 'Endurece a pele como {x} por alguns instantes.', 'Desvia o primeiro ataque de cada luta, como {x} que escorre.'] },
  cura: { nomes: ['Mãos de {x}', 'Fôlego de {x}', 'Seiva de {x}', 'Canção de {x}'], efeitos: ['Fecha feridas transferindo o dano para {x}.', 'Devolve o fôlego a quem está à beira da morte.', 'Faz o corpo lembrar como era antes do ferimento.'] },
  mente: { nomes: ['Sussurro de {x}', 'Olhar de {x}', 'Teia de {x}', 'Eco de {x}'], efeitos: ['Planta uma ideia que a vítima jura que é dela.', 'Lê a emoção mais forte de quem está por perto.', 'Apaga uma lembrança curta, mas deixa um gosto de {x}.'] },
  movimento: { nomes: ['Passo de {x}', 'Asa de {x}', 'Trilha de {x}', 'Salto de {x}'], efeitos: ['Atravessa uma parede fina como se fosse {x}.', 'Some numa sombra e reaparece em outra, à vista.', 'Corre sobre água, telhados e {x} sem deixar marca.'] },
  percepcao: { nomes: ['Olho de {x}', 'Faro de {x}', 'Vigília de {x}', 'Presságio de {x}'], efeitos: ['Vê o rastro que as pessoas deixam no ar por um dia.', 'Ouve mentiras como um zumbido de {x}.', 'Enxerga três segundos do futuro, sempre o pior deles.'] },
  transformacao: { nomes: ['Forma de {x}', 'Carne de {x}', 'Muda de {x}', 'Máscara de {x}'], efeitos: ['Toma a forma de um animal que já comeu.', 'Copia o rosto de quem tocou na última hora.', 'Transforma o próprio braço em {x} por uma cena.'] },
  invocacao: { nomes: ['Chamado de {x}', 'Pacto de {x}', 'Coro de {x}', 'Servo de {x}'], efeitos: ['Chama um espírito de {x} que obedece a uma ordem.', 'Ergue um eco de alguém que morreu ali perto.', 'Convoca uma criatura que cobra o favor depois.'] },
  criacao: { nomes: ['Forja de {x}', 'Semente de {x}', 'Tecer de {x}', 'Molde de {x}'], efeitos: ['Dá forma a {x} com as mãos, mas a peça não dura um dia.', 'Faz brotar uma ponte, uma escada ou uma porta onde não havia.', 'Cria um objeto pequeno que já viu de perto.'] },
  utilidade: { nomes: ['Arte de {x}', 'Dom de {x}', 'Saber de {x}', 'Truque de {x}'], efeitos: ['Fala com qualquer animal, mas eles nem sempre têm algo útil a dizer.', 'Acende e apaga chamas próximas com um estalar de dedos.', 'Encontra o caminho de volta de qualquer lugar.'] },
};
const ELEMENTOS = ['cinza', 'sombra', 'brasa', 'névoa', 'ferro', 'espinho', 'maré', 'vidro', 'osso', 'estrela', 'tempestade', 'âmbar', 'sal', 'eco', 'aurora', 'raiz'];
const CUSTOS = ['um ano de vida a cada uso', 'uma lembrança feliz', 'sangue, um pouco a cada vez', 'febre por um dia inteiro', 'cansaço que derruba após a cena', 'o calor do corpo: as mãos ficam geladas por horas', 'uma moeda de prata, que some', 'a voz, até o amanhecer', 'dor nos olhos e visão turva', 'um favor devido a quem ensinou'];
const LIMITES = ['Não funciona sob a luz do sol.', 'Só afeta quem olha nos olhos de quem usa.', 'Não atravessa ferro frio.', 'Uma vez por dia, no máximo.', 'Exige silêncio absoluto para começar.', 'Não funciona em quem sabe o nome verdadeiro de quem usa.', 'Precisa tocar a pele do alvo.', 'Falha perto de água corrente.'];
const SINAIS = ['cheiro de ozônio', 'as pupilas ficam brancas', 'velas se apagam em volta', 'um zumbido grave no ar', 'geada nas bordas das coisas', 'marcas que brilham na pele', 'animais fogem', 'o sangue escurece'];

export interface PoderForjado {
  nome: string;
  props: Record<string, string>;
  efeito: string;
  limites: string;
}

/** Sorteia um poder coerente: categoria, efeito, custo, limite e o sinal que o denuncia. */
export function forjarPoder(rng: Rng, opts: { categoria?: CategoriaPoder; fonte?: string; nivel?: number } = {}): PoderForjado {
  const cat = opts.categoria ?? pick(rng, CATEGORIAS_PODER).id;
  const x = pick(rng, ELEMENTOS);
  const tabela = FORJA[cat];
  const nome = pick(rng, tabela.nomes).replace('{x}', x.charAt(0).toUpperCase() + x.slice(1));
  const nivel = opts.nivel ?? 1 + Math.floor(rng() * 8);
  const custo = nivel >= 6 ? pick(rng, CUSTOS.slice(0, 5)) : pick(rng, CUSTOS);
  const label = CATEGORIAS_PODER.find((c) => c.id === cat)!.label.toLowerCase();
  return {
    nome,
    props: {
      categoria: label, 'nível': String(nivel), custo, alcance: pick(rng, ['toque', 'curto', 'médio', 'longo']), 'duração': pick(rng, ['instantâneo', 'minutos', 'uma cena', 'horas']),
      sinal: pick(rng, SINAIS), ...(opts.fonte ? { fonte: opts.fonte } : {}),
    },
    efeito: pick(rng, tabela.efeitos).replace('{x}', x),
    limites: pick(rng, LIMITES),
  };
}

/** Poderes de um mundo, já lidos e medidos (para a vitrine e para o arauto). */
export function poderesDoMundo(w: World, ler: (path: string) => string): Array<Poder & { eq: Equilibrio; portadores: number }> {
  return w.entities.filter((e) => e.type === 'poder').map((e) => {
    const p = lerPoder(e, ler(e.path));
    return { ...p, eq: equilibrio(p), portadores: portadores(w, e.path).length };
  });
}

/** Lista de poderes citados no campo `poderes` de uma ficha (para o cartão da personagem). */
export const poderesDe = (e: Entity): string[] => asList(e.props['poderes'] ?? e.props['habilidades']).map((x) => x.replace(/\[\[|\]\]/g, '').trim()).filter(Boolean);
