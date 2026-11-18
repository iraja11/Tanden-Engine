import { NON_CARD_TYPES, timeline, type Entity, type World } from '../mundo';
import { generoDoMundo, type Era, type Genero } from './generos';

/*
 * Progresso do mundo: experiência, nível, era e a raridade de cada ficha.
 *
 * Quase tudo é calculado do que o mundo TEM, não de um placar guardado: apagar
 * uma ficha tira os pontos dela, e dois aparelhos sempre chegam ao mesmo número.
 * Só o que não deixa rastro nas notas (sprints, missões, dias de escrita) vem do
 * registro de atividade.
 */

export const NIVEL_MAX = 99;

/** Experiência total para chegar ao nível `n`. */
export const xpParaNivel = (n: number): number => (n <= 1 ? 0 : Math.round(60 * Math.pow(Math.min(n, NIVEL_MAX) - 1, 1.7)));

export interface Nivel {
  nivel: number;
  xp: number;
  /** experiência em que o nível atual começou */
  piso: number;
  /** experiência em que o próximo nível começa (igual ao piso no nível máximo) */
  teto: number;
  /** quanto do nível atual já foi andado, de 0 a 1 */
  fracao: number;
}

export function nivelDe(xp: number): Nivel {
  const total = Math.max(0, Math.floor(xp));
  let nivel = 1;
  while (nivel < NIVEL_MAX && xpParaNivel(nivel + 1) <= total) nivel++;
  const piso = xpParaNivel(nivel);
  const teto = nivel >= NIVEL_MAX ? piso : xpParaNivel(nivel + 1);
  return { nivel, xp: total, piso, teto, fracao: teto > piso ? (total - piso) / (teto - piso) : 1 };
}

/** Nível em que cada uma das sete eras começa. */
export const NIVEIS_DAS_ERAS = [1, 4, 8, 14, 22, 32, 45] as const;

export function eraDe(nivel: number): number {
  let era = 0;
  NIVEIS_DAS_ERAS.forEach((n, i) => { if (nivel >= n) era = i; });
  return era;
}

// ------------------------------------------------------------------ raridade

export type Raridade = 'comum' | 'incomum' | 'rara' | 'epica' | 'lendaria';

export const RARIDADES: Array<{ id: Raridade; label: string; pontos: number; cor: string }> = [
  { id: 'comum', label: 'Comum', pontos: 0, cor: '#9aa3ad' },
  { id: 'incomum', label: 'Incomum', pontos: 25, cor: '#5fbf77' },
  { id: 'rara', label: 'Rara', pontos: 45, cor: '#4f9de8' },
  { id: 'epica', label: 'Épica', pontos: 65, cor: '#b277ee' },
  { id: 'lendaria', label: 'Lendária', pontos: 85, cor: '#f5b342' },
];

export const infoRaridade = (r: Raridade) => RARIDADES.find((x) => x.id === r)!;

export interface Profundidade {
  /** de 0 a 100 */
  pontos: number;
  raridade: Raridade;
  /** ligações resolvidas, de ida e de volta */
  ligacoes: number;
  /** próxima raridade e quantos pontos faltam (nula quando já é lendária) */
  proxima: { raridade: Raridade; faltam: number } | null;
  /** o que mais renderia pontos agora */
  dica: string;
}

const PALAVRAS_CHEIAS = 500;
const LIGACOES_CHEIAS = 8;

/**
 * A raridade mede profundidade: quanto a ficha está preenchida, quanto foi
 * escrito nela e o quanto o resto do mundo depende dela.
 */
export function profundidade(e: Pick<Entity, 'score' | 'words'>, ligacoes: number): Profundidade {
  const preenchida = e.score * 40;
  const escrita = Math.min(e.words / PALAVRAS_CHEIAS, 1) * 30;
  const ligada = Math.min(ligacoes / LIGACOES_CHEIAS, 1) * 30;
  const pontos = Math.round(preenchida + escrita + ligada);
  let i = 0;
  RARIDADES.forEach((r, k) => { if (pontos >= r.pontos) i = k; });
  const prox = RARIDADES[i + 1];
  const folgas = [
    { falta: 40 - preenchida, dica: 'Preencha os campos e as seções que faltam.' },
    { falta: 30 - escrita, dica: `Escreva mais sobre ela: conta até ${PALAVRAS_CHEIAS} palavras.` },
    { falta: 30 - ligada, dica: 'Ligue esta ficha a outras com [[links]].' },
  ].sort((a, b) => b.falta - a.falta);
  return {
    pontos,
    raridade: RARIDADES[i]!.id,
    ligacoes,
    proxima: prox ? { raridade: prox.id, faltam: Math.max(1, prox.pontos - pontos) } : null,
    dica: folgas[0]!.falta > 0.5 ? folgas[0]!.dica : 'Esta ficha já está no máximo.',
  };
}

/** Quantas ligações resolvidas cada ficha tem, somando as que saem e as que chegam. */
export function contarLigacoes(w: World): Map<string, number> {
  const pares = new Map<string, Set<string>>();
  const liga = (a: string, b: string) => {
    const s = pares.get(a) ?? new Set<string>();
    s.add(b);
    pares.set(a, s);
  };
  for (const r of w.relations) {
    if (!r.to || r.to === r.from) continue;
    liga(r.from, r.to);
    liga(r.to, r.from);
  }
  return new Map([...pares].map(([k, v]) => [k, v.size]));
}

/** Profundidade de cada ficha do mundo (mapas, histórias e cenas não entram). */
export function profundidades(w: World): Map<string, Profundidade> {
  const links = contarLigacoes(w);
  const out = new Map<string, Profundidade>();
  for (const e of w.entities) if (!NON_CARD_TYPES.has(e.type)) out.set(e.path, profundidade(e, links.get(e.path) ?? 0));
  return out;
}

// ------------------------------------------------------------------ experiência

/** O que o registro de atividade soma para um mundo. */
export interface AtividadeMundo {
  sprints: number;
  missoes: number;
  respostas: number;
  oraculo: number;
  diasAtivos: number;
  /** pontos das conquistas obtidas neste mundo */
  conquistas: number;
}

export const ATIVIDADE_VAZIA: AtividadeMundo = { sprints: 0, missoes: 0, respostas: 0, oraculo: 0, diasAtivos: 0, conquistas: 0 };

export interface PartesXp {
  fichas: number;
  escrita: number;
  historia: number;
  atividade: number;
  conquistas: number;
}

export function xpDoMundo(w: World, a: AtividadeMundo = ATIVIDADE_VAZIA): PartesXp {
  const links = contarLigacoes(w);
  let fichas = 0;
  let escrita = 0;
  for (const e of w.entities) {
    fichas += 10 + Math.round(e.score * 30) + Math.min(links.get(e.path) ?? 0, 20) * 3;
    if (e.type === 'mapa') fichas += 30;
    // cena vale mais por palavra: é o mundo virando história
    escrita += Math.floor(Math.min(e.words, e.type === 'cena' ? 8000 : 3000) / (e.type === 'cena' ? 5 : 10));
  }
  return {
    fichas,
    escrita,
    historia: timeline(w).length * 2,
    atividade: a.sprints * 15 + a.missoes * 20 + a.respostas * 3 + Math.min(a.oraculo, a.diasAtivos * 5) + a.diasAtivos * 10,
    conquistas: a.conquistas,
  };
}

export const somaXp = (p: PartesXp): number => p.fichas + p.escrita + p.historia + p.atividade + p.conquistas;

export interface EstadoMundo {
  genero: Genero;
  partes: PartesXp;
  nivel: Nivel;
  /** índice da era atual, de 0 a 6 */
  indiceEra: number;
  era: Era;
  proximaEra: { era: Era; nivel: number } | null;
}

/** Tudo o que a interface mostra sobre o progresso de um mundo. */
export function estadoDoMundo(w: World, a: AtividadeMundo = ATIVIDADE_VAZIA): EstadoMundo {
  const genero = generoDoMundo(w);
  const partes = xpDoMundo(w, a);
  const nivel = nivelDe(somaXp(partes));
  const indiceEra = eraDe(nivel.nivel);
  const prox = genero.eras[indiceEra + 1];
  return {
    genero, partes, nivel, indiceEra,
    era: genero.eras[indiceEra]!,
    proximaEra: prox ? { era: prox, nivel: NIVEIS_DAS_ERAS[indiceEra + 1]! } : null,
  };
}
