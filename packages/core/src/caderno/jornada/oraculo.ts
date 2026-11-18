import type { Rng } from '../../rpg/dice';
import type { Entity, World } from '../mundo';
import type { Genero } from './generos';

/*
 * Oráculo: dados e cartas para destravar a escrita.
 *
 * A leitura combina as tabelas do gênero com as fichas reais do mundo. A pergunta
 * de sim ou não funciona como nos RPGs sem mestre: um d100 e uma chance, com
 * resultados que sempre empurram a história ("sim, mas...", "não, e pior...").
 */

export interface LeituraOraculo {
  gancho: string;
  reviravolta: string;
  complicacao: string;
  detalhe: string;
}

const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

/** Troca {P}, {P2}, {L}, {F} e {I} por [[fichas]] do mundo, ou pelo genérico do gênero. */
export function preencher(modelo: string, w: World, g: Genero, rng: Rng): string {
  const de = (t: string) => w.entities.filter((e) => e.type === t);
  const link = (e: Entity | undefined, vago: string) => (e ? `[[${e.name}]]` : vago);
  const umDe = (t: string) => { const l = de(t); return l.length ? pick(rng, l) : undefined; };
  // sorteia duas pessoas diferentes para {P} e {P2}
  const pessoas = de('personagem').map((e) => [rng(), e] as const).sort((a, b) => a[0] - b[0]).map(([, e]) => e);
  const trocas: Record<string, string> = {
    P: link(pessoas[0], g.vago.P),
    P2: link(pessoas[1], 'outra pessoa'),
    L: link(umDe('lugar'), g.vago.L),
    F: link(umDe('faccao'), g.vago.F),
    I: link(umDe('item'), g.vago.I),
  };
  const texto = modelo.replace(/\{(P2|P|L|F|I)\}/g, (_, k: string) => trocas[k]!);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Uma leitura completa: gancho, reviravolta, complicação e um detalhe para os sentidos. */
export function lerOraculo(w: World, g: Genero, rng: Rng): LeituraOraculo {
  return {
    gancho: preencher(pick(rng, g.ganchos), w, g, rng),
    reviravolta: preencher(pick(rng, g.reviravoltas), w, g, rng),
    complicacao: preencher(pick(rng, g.complicacoes), w, g, rng),
    detalhe: pick(rng, g.detalhes),
  };
}

export type ChanceOraculo = 'improvavel' | 'talvez' | 'provavel';

export const CHANCES: Array<{ id: ChanceOraculo; label: string; alvo: number }> = [
  { id: 'improvavel', label: 'Improvável', alvo: 25 },
  { id: 'talvez', label: 'Talvez', alvo: 50 },
  { id: 'provavel', label: 'Provável', alvo: 75 },
];

export interface Resposta {
  d100: number;
  alvo: number;
  sim: boolean;
  /** extremo: o resultado veio com um bônus ou um castigo */
  critico: boolean;
  titulo: string;
  texto: string;
}

/** Sim ou não com tempero: perto do limite vem um "mas"; nos extremos, um "e". */
export function perguntarOraculo(chance: ChanceOraculo, rng: Rng): Resposta {
  const alvo = CHANCES.find((c) => c.id === chance)!.alvo;
  const d100 = Math.floor(rng() * 100) + 1;
  const sim = d100 <= alvo;
  const critico = d100 <= Math.ceil(alvo / 5) || d100 > 100 - Math.ceil((100 - alvo) / 5);
  const apertado = Math.abs(d100 - alvo) <= 10;
  if (sim && critico) return { d100, alvo, sim, critico, titulo: 'Sim, e mais', texto: 'Dá certo e ainda traz uma vantagem que ninguém esperava.' };
  if (sim && apertado) return { d100, alvo, sim, critico, titulo: 'Sim, mas', texto: 'Dá certo, só que cobra um preço.' };
  if (sim) return { d100, alvo, sim, critico, titulo: 'Sim', texto: 'Acontece como se imaginava.' };
  if (critico) return { d100, alvo, sim, critico, titulo: 'Não, e pior', texto: 'Não acontece, e a situação se agrava.' };
  if (apertado) return { d100, alvo, sim, critico, titulo: 'Não, mas', texto: 'Não acontece, mas surge uma saída inesperada.' };
  return { d100, alvo, sim, critico, titulo: 'Não', texto: 'Não acontece. O que fazer agora?' };
}

/** Pedido para a IA local improvisar em cima da leitura (só é usado se o Ollama estiver ligado). */
export function pedidoImproviso(w: World, g: Genero, l: LeituraOraculo): string {
  const elenco = w.entities.filter((e) => e.summary).slice(0, 12).map((e) => `- ${e.name} (${e.type}): ${e.summary}`).join('\n');
  return [
    `Você é um parceiro de escrita num mundo de ${g.label.toLowerCase()} chamado ${w.name}.`,
    elenco ? `Fichas do mundo:\n${elenco}` : '',
    `Gancho: ${l.gancho}\nReviravolta: ${l.reviravolta}\nComplicação: ${l.complicacao}\nDetalhe: ${l.detalhe}`,
    'Em português do Brasil, escreva em até 120 palavras a abertura de uma cena que use esses elementos. Só o texto da cena, sem títulos nem explicações.',
  ].filter(Boolean).join('\n\n');
}
