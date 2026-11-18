import { seededRng, type Rng } from '../../rpg/dice';
import { NON_CARD_TYPES, timeline, typeInfo, type Entity, type World } from '../mundo';
import { reviewWorld } from '../revisao';
import { contarLigacoes } from './progresso';
import type { ContadoresDia } from './registro';

/*
 * Missões do dia: três tarefas tiradas do que falta no mundo de verdade.
 *
 * A lista é sorteada uma vez por dia e guardada no registro, para não mudar
 * enquanto o mundo muda. Cada missão guarda o valor de partida (`base`) e é
 * conferida contra o mundo atual, então cumprir por qualquer caminho vale: no
 * Tanden, no Obsidian ou em outro aparelho.
 */

export type TipoMissao =
  | 'palavras' | 'sprint' | 'oraculo' | 'respostas' | 'aprofundar' | 'ligar'
  | 'faltante' | 'contradicao' | 'criar' | 'datar' | 'cena';

export type AcaoMissao =
  | { tipo: 'abrir'; path: string }
  | { tipo: 'aba'; aba: string }
  | { tipo: 'criar'; ficha: string; nome?: string }
  | { tipo: 'sprint' }
  | { tipo: 'entrevista'; path: string };

export interface Missao {
  id: string;
  tipo: TipoMissao;
  texto: string;
  /** quanto precisa avançar a partir de `base` */
  alvo: number;
  /** valor no momento do sorteio */
  base: number;
  /** ficha, tipo ou nome a que a missão se refere */
  ref?: string;
  xp: number;
  acao: AcaoMissao;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;
const contaTipo = (w: World, t: string) => w.entities.filter((e) => e.type === t).length;
const erros = (w: World) => reviewWorld(w).filter((i) => i.level === 'erro').length;
const quebradas = (w: World, alvo: string) => w.relations.filter((r) => !r.to && r.target === alvo).length;

/** Tipos que todo mundo costuma querer, na ordem em que a falta deles mais pesa. */
const TIPOS_BASICOS = ['personagem', 'lugar', 'faccao', 'evento', 'cultura', 'conflito', 'item', 'especie', 'divindade'];

/** Sorteia as três missões do dia: uma de escrita, uma de profundidade e uma de expansão. */
export function gerarMissoes(w: World, dia: string, meta: number): Missao[] {
  const rng = seededRng(hash(`${dia}:${w.name}`));
  const fichas = w.entities.filter((e) => !NON_CARD_TYPES.has(e.type));
  const links = contarLigacoes(w);

  // 1. escrita: sempre existe
  const escrita: Array<Omit<Missao, 'id'>> = [
    { tipo: 'palavras', texto: `Escreva ${meta} palavras neste mundo hoje.`, alvo: meta, base: 0, xp: 30, acao: { tipo: 'sprint' } },
    { tipo: 'sprint', texto: 'Termine um sprint de escrita.', alvo: 1, base: 0, xp: 35, acao: { tipo: 'sprint' } },
  ];
  const cenas = w.entities.filter((e) => e.type === 'cena');
  if (contaTipo(w, 'historia')) escrita.push({ tipo: 'cena', texto: 'Comece uma cena nova na sua história.', alvo: 1, base: cenas.length, xp: 35, acao: { tipo: 'aba', aba: 'escrita' } });

  // 2. profundidade: o que já existe e está raso
  const fundo: Array<Omit<Missao, 'id'>> = [];
  const rasas = [...fichas].sort((a, b) => a.words - b.words || a.score - b.score).slice(0, 4);
  if (rasas.length) {
    const e = pick(rng, rasas);
    fundo.push({ tipo: 'aprofundar', texto: `Escreva mais 80 palavras sobre ${e.name}.`, alvo: 80, base: e.words, ref: e.path, xp: 30, acao: { tipo: 'abrir', path: e.path } });
  }
  const pessoas = fichas.filter((e) => e.type === 'personagem');
  if (pessoas.length) {
    const e = pick(rng, pessoas);
    fundo.push({ tipo: 'respostas', texto: `Entreviste ${e.name}: responda a 3 perguntas.`, alvo: 3, base: 0, ref: e.path, xp: 30, acao: { tipo: 'entrevista', path: e.path } });
  }
  const soltas = fichas.filter((e) => !links.get(e.path));
  if (soltas.length && fichas.length > 1) {
    const e = pick(rng, soltas);
    fundo.push({ tipo: 'ligar', texto: `${e.name} está solta no mundo: ligue-a a outra ficha.`, alvo: 1, base: 0, ref: e.path, xp: 25, acao: { tipo: 'abrir', path: e.path } });
  }
  const faltando = [...new Set(w.relations.filter((r) => !r.to).map((r) => r.target))];
  if (faltando.length) {
    const nome = pick(rng, faltando);
    fundo.push({ tipo: 'faltante', texto: `${nome} é citado, mas não existe: crie a ficha.`, alvo: 1, base: 0, ref: nome, xp: 25, acao: { tipo: 'criar', ficha: 'personagem', nome } });
  }
  const nErros = erros(w);
  if (nErros) fundo.push({ tipo: 'contradicao', texto: 'Resolva uma contradição apontada pela revisão.', alvo: 1, base: nErros, xp: 40, acao: { tipo: 'aba', aba: 'ideias' } });
  if (!fundo.length) fundo.push({ tipo: 'criar', texto: 'Crie a primeira personagem deste mundo.', alvo: 1, base: 0, ref: 'personagem', xp: 25, acao: { tipo: 'criar', ficha: 'personagem' } });

  // 3. expansão: algo novo entra no mundo
  const novo: Array<Omit<Missao, 'id'>> = [
    { tipo: 'oraculo', texto: 'Consulte o oráculo em busca de uma ideia.', alvo: 1, base: 0, xp: 15, acao: { tipo: 'aba', aba: 'ideias' } },
    { tipo: 'datar', texto: 'Dê uma data a algo: a linha do tempo precisa de mais um marco.', alvo: 1, base: timeline(w).length, xp: 20, acao: { tipo: 'aba', aba: 'tempo' } },
  ];
  const ausente = TIPOS_BASICOS.filter((t) => !contaTipo(w, t));
  const tipoNovo = ausente[0] ?? pick(rng, TIPOS_BASICOS);
  const info = typeInfo(tipoNovo);
  novo.push({
    tipo: 'criar', texto: ausente.length ? `Este mundo ainda não tem ${info.plural.toLowerCase()}: crie o primeiro registro.` : `Acrescente mais uma ficha de ${info.label.toLowerCase()}.`,
    alvo: 1, base: contaTipo(w, tipoNovo), ref: tipoNovo, xp: 25, acao: { tipo: 'criar', ficha: tipoNovo },
  });

  return [pick(rng, escrita), pick(rng, fundo), pick(rng, novo)].map((m, i) => ({ ...m, id: `${dia}-${i}-${m.tipo}` }));
}

const entidade = (w: World, path?: string): Entity | undefined => w.entities.find((e) => e.path === path);

/** Quanto da missão já foi cumprido, de 0 até `alvo`. */
export function medirMissao(m: Missao, w: World, hoje: ContadoresDia): number {
  const avanco = (): number => {
    switch (m.tipo) {
      case 'palavras': return hoje.palavras ?? 0;
      case 'sprint': return hoje.sprints ?? 0;
      case 'oraculo': return hoje.oraculo ?? 0;
      case 'respostas': return hoje.respostas ?? 0;
      case 'aprofundar': return (entidade(w, m.ref)?.words ?? m.base) - m.base;
      case 'ligar': return m.ref ? contarLigacoes(w).get(m.ref) ?? 0 : 0;
      case 'faltante': return m.ref && quebradas(w, m.ref) === 0 ? 1 : 0;
      case 'contradicao': return m.base - erros(w);
      case 'criar': return contaTipo(w, m.ref ?? '') - m.base;
      case 'datar': return timeline(w).length - m.base;
      case 'cena': return contaTipo(w, 'cena') - m.base;
    }
  };
  return Math.max(0, Math.min(m.alvo, avanco()));
}
