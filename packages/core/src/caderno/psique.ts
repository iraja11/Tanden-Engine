import { asList, asText } from './frontmatter';
import { sameTitle } from './markdown';
import { tensionsOf } from './conflitos';
import type { Entity, World } from './mundo';
import { catalogo, tracoDoTexto, type Catalogo, type Traco } from './vidas/catalogo';

/*
 * Psique das personagens: os traços escritos na ficha (`traços: leal, ciumenta,
 * corajosa`) viram um perfil dos cinco grandes fatores, um arquétipo, as
 * contradições internas e a química com cada outra personagem.
 *
 * O catálogo de traços é o mesmo da simulação de vidas, então o que a ficha diz
 * aqui é o que a simulação vai usar depois. Nada é gravado: tudo sai da ficha.
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

export const FATORES = [
  { id: 'abertura', label: 'Abertura', alto: 'curiosa, imaginativa', baixo: 'prática, tradicional' },
  { id: 'consciencia', label: 'Conscienciosidade', alto: 'disciplinada, confiável', baixo: 'impulsiva, desleixada' },
  { id: 'extroversao', label: 'Extroversão', alto: 'expansiva, falante', baixo: 'reservada, quieta' },
  { id: 'amabilidade', label: 'Amabilidade', alto: 'gentil, cooperativa', baixo: 'dura, desconfiada' },
  { id: 'neuroticismo', label: 'Instabilidade', alto: 'ansiosa, explosiva', baixo: 'serena, firme' },
] as const;

export interface Arquetipo { id: string; nome: string; desc: string; naHistoria: string; v: [number, number, number, number, number] }

export const ARQUETIPOS: Arquetipo[] = [
  { id: 'heroi', nome: 'O Herói', desc: 'Age quando os outros hesitam.', naHistoria: 'Ponha algo que ele ama no caminho do dever.', v: [55, 72, 65, 70, 28] },
  { id: 'rebelde', nome: 'O Rebelde', desc: 'Não aceita a ordem das coisas.', naHistoria: 'Dê a ele uma regra justa para quebrar, e veja o custo.', v: [82, 28, 66, 34, 55] },
  { id: 'sabio', nome: 'O Sábio', desc: 'Busca entender antes de agir.', naHistoria: 'Faça o saber dele chegar tarde demais.', v: [86, 72, 32, 60, 28] },
  { id: 'guardiao', nome: 'O Guardião', desc: 'Protege o que existe e quem confia nele.', naHistoria: 'Obrigue-o a escolher entre duas pessoas que jurou proteger.', v: [32, 86, 44, 72, 34] },
  { id: 'trapaceiro', nome: 'O Trapaceiro', desc: 'Dobra as regras com charme.', naHistoria: 'Faça a mentira dele ganhar vida própria.', v: [76, 24, 76, 40, 40] },
  { id: 'governante', nome: 'O Governante', desc: 'Organiza o mundo à sua volta.', naHistoria: 'Tire dele o controle por uma cena inteira.', v: [44, 82, 70, 34, 34] },
  { id: 'inocente', nome: 'O Inocente', desc: 'Acredita no melhor dos outros.', naHistoria: 'A primeira traição dele é um ponto de virada.', v: [56, 50, 62, 86, 46] },
  { id: 'explorador', nome: 'O Explorador', desc: 'Precisa ver o que há além.', naHistoria: 'Prenda-o num lugar pequeno e conte as horas.', v: [92, 40, 60, 50, 34] },
  { id: 'amante', nome: 'O Amante', desc: 'Vive pelos laços e pelas paixões.', naHistoria: 'O amor dele é a fraqueza que o vilão usa.', v: [66, 40, 76, 76, 62] },
  { id: 'sombra', nome: 'A Sombra', desc: 'Frio, paciente, sem culpa.', naHistoria: 'Mostre o momento em que ele escolheu não sentir.', v: [50, 68, 34, 14, 32] },
  { id: 'atormentado', nome: 'O Atormentado', desc: 'Carrega uma tempestade por dentro.', naHistoria: 'Deixe a tempestade estourar na pior hora.', v: [62, 34, 30, 50, 88] },
  { id: 'bufao', nome: 'O Bufão', desc: 'Ri para não chorar, e faz rir.', naHistoria: 'A piada dele, um dia, não tem graça nenhuma.', v: [70, 30, 86, 66, 40] },
];

export interface PerfilPsique {
  tracos: Traco[];
  /** traços escritos que o catálogo não conhece (ficam como texto livre) */
  soltos: string[];
  /** cinco grandes, de 0 a 100 */
  big5: [number, number, number, number, number];
  arquetipo: Arquetipo;
  segundo: Arquetipo;
  /** pares de traços opostos na mesma ficha: rendem conflito interno */
  contradicoes: Array<[Traco, Traco]>;
  /** de 0 a 1: quanto do perfil vem de traços reconhecidos */
  confianca: number;
}

let base: Catalogo | null = null;
const cat0 = () => (base ??= catalogo());

export function tracosEscritos(e: Pick<Entity, 'props'>): string[] {
  for (const k of ['traços', 'tracos', 'traço', 'personalidade', 'traits']) {
    const key = Object.keys(e.props).find((p) => sameTitle(p, k));
    if (key) return asList(e.props[key]).flatMap((x) => x.split(/,|;/)).map((x) => x.replace(/\[\[|\]\]/g, '').trim()).filter(Boolean);
  }
  return [];
}

export function perfilPsique(e: Pick<Entity, 'props'>, cat: Catalogo = cat0()): PerfilPsique {
  const tracos: Traco[] = [];
  const soltos: string[] = [];
  for (const t of tracosEscritos(e)) {
    const id = tracoDoTexto(cat, t);
    const tr = id ? cat.tracos.get(id) : undefined;
    if (tr && !tracos.includes(tr)) tracos.push(tr);
    else if (!tr) soltos.push(t);
  }
  const v = [50, 50, 50, 50, 50];
  for (const t of tracos) if (t.big5) t.big5.forEach((x, i) => (v[i]! += x * 1.4));
  const big5 = v.map((x) => Math.max(0, Math.min(100, Math.round(x)))) as PerfilPsique['big5'];
  const dist = (a: Arquetipo) => a.v.reduce((s, x, i) => s + (x - big5[i]!) ** 2, 0);
  const ordem = [...ARQUETIPOS].sort((a, b) => dist(a) - dist(b));
  const contradicoes: Array<[Traco, Traco]> = [];
  for (const t of tracos) {
    const o = t.oposto ? tracos.find((x) => x.id === t.oposto) : undefined;
    if (o && !contradicoes.some(([a, b]) => b === t && a === o)) contradicoes.push([t, o]);
  }
  const comBig5 = tracos.filter((t) => t.big5).length;
  return { tracos, soltos, big5, arquetipo: ordem[0]!, segundo: ordem[1]!, contradicoes, confianca: Math.min(1, comBig5 / 4) };
}

/** Traços de personalidade do catálogo, em pares de opostos (para o seletor da tela). */
export function paresDeTracos(cat: Catalogo = cat0()): Array<[Traco, Traco | null]> {
  const out: Array<[Traco, Traco | null]> = [];
  const visto = new Set<string>();
  for (const t of cat.tracos.values()) {
    if (t.cat !== 'personalidade' || visto.has(t.id)) continue;
    const o = t.oposto ? cat.tracos.get(t.oposto) ?? null : null;
    visto.add(t.id);
    if (o) visto.add(o.id);
    out.push([t, o]);
  }
  return out;
}

export const nomeDoTraco = (t: Traco, genero: 'f' | 'm' = 'm'): string => (genero === 'f' ? t.f : t.m);

/** Gênero gramatical provável da ficha, para escrever "corajosa" ou "corajoso". */
export function generoDaFicha(e: Pick<Entity, 'props'>): 'f' | 'm' {
  const s = fold(prop(e, 'sexo', 'gênero', 'genero', 'pronome'));
  return /^(f|fem|mulher|ela|menina|dama)/.test(s) ? 'f' : 'm';
}

// ------------------------------------------------------------------ química

export interface Quimica {
  pontos: number;
  rotulo: 'Laço forte' | 'Simpatia' | 'Neutro' | 'Atrito' | 'Ódio';
  razoes: string[];
}

const LACOS: Array<[RegExp, number, string]> = [
  [/^(aliados?|amigos?|amigas?|companheir)/, 25, 'amizade declarada'],
  [/^(inimig|rivais|rival|nemesis|adversari)/, -38, 'inimizade declarada'],
  [/^(conjuge|esposa|esposo|marido|mulher|amante|amor|noiv)/, 30, 'amor'],
  [/^(pai|mae|filh|irma|irmao|avo|neto|neta|primo|prima|tio|tia)/, 14, 'família'],
  [/^(mentor|mestre|aprendiz|discipul|protegid)/, 16, 'mestre e aprendiz'],
  [/^(traiu|traidor|assassino de|matou)/, -45, 'traição ou sangue'],
];

export function rotuloQuimica(p: number): Quimica['rotulo'] {
  return p >= 50 ? 'Laço forte' : p >= 18 ? 'Simpatia' : p > -18 ? 'Neutro' : p > -50 ? 'Atrito' : 'Ódio';
}

/** Química entre duas personagens: traços que se atraem ou se repelem, laços escritos, facções e culturas. */
export function quimica(a: Entity, b: Entity, w: World, cat: Catalogo = cat0(), tensoes = tensionsOf(w)): Quimica {
  const pa = perfilPsique(a, cat);
  const pb = perfilPsique(b, cat);
  const razoes: Array<[number, string]> = [];
  let pts = 0;
  const soma = (n: number, r: string) => { if (!n) return; pts += n; razoes.push([n, r]); };
  for (const [x, y] of [[pa, pb], [pb, pa]] as const) {
    for (const t of x.tracos) for (const u of y.tracos) {
      const n = t.afinidade?.[u.id === t.id ? '' : u.id] ?? (u.id === t.id ? t.afinidade?.[''] : undefined);
      if (n) soma(Math.round(n * 0.8), `${t.m} ${n > 0 ? 'gosta de' : 'não suporta'} ${u.id === t.id ? 'quem é igual' : u.m}`);
    }
  }
  for (const [x, y] of [[a, b], [b, a]] as const) {
    for (const r of x.relations) {
      if (r.to !== y.path) continue;
      const l = LACOS.find(([re]) => re.test(fold(r.label)));
      if (l) soma(l[1], l[2]);
    }
  }
  const alvos = (e: Entity, re: RegExp) => new Set(e.relations.filter((r) => r.to && re.test(fold(r.label))).map((r) => r.to!));
  const fa = alvos(a, /^(afiliacao|faccao|ordem|casa|cla|guilda)$/);
  const fb = alvos(b, /^(afiliacao|faccao|ordem|casa|cla|guilda)$/);
  if ([...fa].some((f) => fb.has(f))) soma(10, 'mesma facção');
  for (const t of tensoes) {
    const cruza = ([...fa].includes(t.a) && fb.has(t.b)) || ([...fa].includes(t.b) && fb.has(t.a));
    if (!cruza) continue;
    if (t.stance === 'hostil') soma(-20, 'facções em guerra');
    else if (t.stance === 'aliado') soma(8, 'facções aliadas');
  }
  const ca = alvos(a, /^(cultura|povo|origem)$/);
  if ([...alvos(b, /^(cultura|povo|origem)$/)].some((c) => ca.has(c))) soma(6, 'mesma origem');
  const amaveis = pa.big5[3] + pb.big5[3];
  if (pa.confianca > 0 && pb.confianca > 0) {
    if (amaveis >= 140) soma(6, 'duas almas gentis');
    if (pa.big5[4] >= 70 && pb.big5[4] >= 70) soma(-6, 'dois temperamentos explosivos');
  }
  const pontos = Math.max(-100, Math.min(100, Math.round(pts)));
  return { pontos, rotulo: rotuloQuimica(pontos), razoes: razoes.sort((x, y) => Math.abs(y[0]) - Math.abs(x[0])).slice(0, 4).map(([n, r]) => `${n > 0 ? '+' : ''}${n} ${r}`) };
}

export interface ElencoQuimica {
  pessoas: Entity[];
  /** matriz simétrica de pontos, na ordem de `pessoas` */
  matriz: number[][];
  /** o par mais próximo e o mais explosivo */
  melhor: { a: Entity; b: Entity; q: Quimica } | null;
  pior: { a: Entity; b: Entity; q: Quimica } | null;
}

/** As personagens mais ligadas do mundo e a química de todos com todos. */
export function elencoQuimica(w: World, max = 10, cat: Catalogo = cat0()): ElencoQuimica {
  const ligacoes = new Map<string, number>();
  for (const r of w.relations) if (r.to) { ligacoes.set(r.from, (ligacoes.get(r.from) ?? 0) + 1); ligacoes.set(r.to, (ligacoes.get(r.to) ?? 0) + 1); }
  const pessoas = w.entities.filter((e) => e.type === 'personagem').sort((a, b) => (ligacoes.get(b.path) ?? 0) - (ligacoes.get(a.path) ?? 0) || a.name.localeCompare(b.name, 'pt-BR')).slice(0, max);
  const tensoes = tensionsOf(w);
  const matriz = pessoas.map(() => pessoas.map(() => 0));
  let melhor: ElencoQuimica['melhor'] = null;
  let pior: ElencoQuimica['pior'] = null;
  for (let i = 0; i < pessoas.length; i++) for (let j = i + 1; j < pessoas.length; j++) {
    const q = quimica(pessoas[i]!, pessoas[j]!, w, cat, tensoes);
    matriz[i]![j] = matriz[j]![i] = q.pontos;
    if (q.pontos > 0 && (!melhor || q.pontos > melhor.q.pontos)) melhor = { a: pessoas[i]!, b: pessoas[j]!, q };
    if (q.pontos < 0 && (!pior || q.pontos < pior.q.pontos)) pior = { a: pessoas[i]!, b: pessoas[j]!, q };
  }
  return { pessoas, matriz, melhor, pior };
}

// ------------------------------------------------------------------ arco

export const CAMPOS_ARCO = [
  { campo: 'quer', label: 'Quer', pergunta: 'O que persegue com todas as forças?' },
  { campo: 'precisa', label: 'Precisa', pergunta: 'O que de fato lhe falta (e ainda não sabe)?' },
  { campo: 'mentira', label: 'Mentira', pergunta: 'Que crença errada guia as escolhas?' },
  { campo: 'ferida', label: 'Ferida', pergunta: 'Que dor do passado criou essa mentira?' },
  { campo: 'medo', label: 'Medo', pergunta: 'O que evita a qualquer custo?' },
] as const;

export interface Arco {
  preenchidos: number;
  total: number;
  /** a frase do arco, com o que já está escrito */
  frase: string;
  faltam: Array<(typeof CAMPOS_ARCO)[number]>;
}

export function arcoDe(e: Entity): Arco {
  const v = Object.fromEntries(CAMPOS_ARCO.map((c) => [c.campo, prop(e, c.campo, ...(c.campo === 'quer' ? ['motivação', 'motivacao', 'objetivo'] : []))])) as Record<(typeof CAMPOS_ARCO)[number]['campo'], string>;
  const faltam = CAMPOS_ARCO.filter((c) => !v[c.campo]);
  const partes: string[] = [];
  if (v.quer) partes.push(`${e.name} quer ${v.quer.replace(/\.$/, '')}`);
  if (v.precisa) partes.push(`${partes.length ? 'mas ' : `${e.name} `}precisa de ${v.precisa.replace(/^de\s+/i, '').replace(/\.$/, '')}`);
  let frase = partes.length ? `${partes.join(', ')}.` : '';
  if (v.mentira) frase += ` Acredita que ${v.mentira.replace(/^que\s+/i, '').replace(/\.$/, '')}${v.ferida ? `, desde ${v.ferida.replace(/\.$/, '')}` : ''}.`;
  if (v.medo) frase += ` Teme ${v.medo.replace(/\.$/, '')}.`;
  return { preenchidos: CAMPOS_ARCO.length - faltam.length, total: CAMPOS_ARCO.length, frase: frase.trim(), faltam };
}

/** Sugestões para deixar a personagem mais viva, a partir do perfil e do arco. */
export function sugestoesPsique(p: PerfilPsique, a: Arco, e: Entity, cat: Catalogo = cat0()): string[] {
  const out: string[] = [];
  if (p.tracos.length + p.soltos.length < 3) out.push('Escreva pelo menos três traços em "traços": é o que dá cor ao perfil e à química.');
  if (p.tracos.length >= 2 && !p.contradicoes.length) {
    const t = p.tracos.find((x) => x.oposto && cat.tracos.get(x.oposto));
    if (t) out.push(`Pessoas memoráveis se contradizem: e se ${e.name} também fosse ${cat.tracos.get(t.oposto!)!.m} em algum assunto?`);
  }
  if (p.big5[4] >= 70 && a.faltam.some((f) => f.campo === 'medo')) out.push('Perfil instável sem medo definido: do que essa pessoa foge?');
  if (a.faltam.some((f) => f.campo === 'mentira') && a.preenchidos >= 2) out.push('Falta a mentira: a crença errada é o motor do arco de mudança.');
  if (p.big5[3] <= 25) out.push('Muito pouco amável: quem, apesar disso, gosta dela? Esse laço humaniza.');
  if (p.big5[0] >= 80) out.push('Abertura altíssima: dê um segredo que ela descobriu e não devia.');
  return out.slice(0, 3);
}
