import { seededRng } from '../../rpg/dice';
import { asText, parseProps, setProp, type Props } from '../frontmatter';
import { getSection, setSection } from '../markdown';
import { DEEP_QUESTIONS, type Entity } from '../mundo';
import type { Genero } from './generos';

/*
 * Entrevista: uma pergunta por vez, e cada resposta vai direto para a ficha.
 *
 * A resposta vira uma seção da nota (com a pergunta como título) ou preenche uma
 * propriedade conhecida, como `medo` e `segredo`. É markdown comum: o Obsidian
 * mostra igual.
 */

export interface PerguntaEntrevista {
  texto: string;
  /** propriedade que a resposta preenche, em vez de virar seção */
  prop?: string;
}

const DE_PERSONAGEM: PerguntaEntrevista[] = [
  { texto: 'O que você quer mais do que tudo?', prop: 'motivação' },
  { texto: 'Do que você tem medo de verdade?', prop: 'medo' },
  { texto: 'Que segredo você levaria para o túmulo?', prop: 'segredo' },
  { texto: 'Que mania denuncia você numa sala cheia?', prop: 'maneirismo' },
];

const GERAIS: Record<string, string[]> = {
  lugar: ['O que um visitante nota primeiro ao chegar aqui?', 'Quem manda neste lugar de verdade?', 'O que é proibido aqui, e quem faz mesmo assim?', 'Que cheiro e que som definem este lugar?'],
  faccao: ['O que este grupo promete a quem entra?', 'O que acontece com quem tenta sair?', 'Quem financia tudo isso?', 'Qual é a mentira que todos aqui repetem?'],
  evento: ['Quem saiu ganhando com o que aconteceu?', 'Que versão oficial foi contada?', 'O que mudou para as pessoas comuns?'],
  item: ['Quem morreria para ter isto?', 'Qual é o preço de usar?', 'Por onde isto passou antes de chegar aqui?'],
};
const GENERICAS = ['O que quase ninguém sabe sobre isto?', 'Quem sairia perdendo se isto desaparecesse?', 'Como isto mudou nos últimos anos?', 'O que isto tem de contraditório?'];

/** Como a tela chama a entrevista, conforme o que está sendo entrevistado. */
export function rotuloEntrevista(tipo: string): { botao: string; titulo: string } {
  if (tipo === 'personagem' || tipo === 'divindade') return { botao: 'Entrevistar', titulo: 'Entrevista' };
  if (tipo === 'lugar' || tipo === 'plano') return { botao: 'Visitar', titulo: 'Visita guiada' };
  if (tipo === 'faccao' || tipo === 'religiao' || tipo === 'cultura') return { botao: 'Infiltrar', titulo: 'Infiltração' };
  return { botao: 'Investigar', titulo: 'Investigação' };
}

const propVazia = (props: Props, k: string): boolean => {
  const key = Object.keys(props).find((p) => p.toLowerCase() === k.toLowerCase());
  return !key || !asText(props[key]).trim();
};

/** Já tem resposta: a propriedade está cheia ou a seção tem texto. */
export function jaRespondida(texto: string, p: PerguntaEntrevista): boolean {
  if (p.prop && !propVazia(parseProps(texto), p.prop)) return true;
  return (getSection(texto, p.texto) ?? '').trim().length > 0;
}

/** Monta o roteiro: primeiro o essencial do tipo, depois o gênero, sem repetir o que já foi respondido. */
export function roteiroEntrevista(e: Pick<Entity, 'type'>, g: Genero, texto: string, semente: number, max = 6): PerguntaEntrevista[] {
  const rng = seededRng(semente);
  const mistura = <T>(l: T[]): T[] => l.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const fixas = e.type === 'personagem' ? DE_PERSONAGEM : [];
  const doTipo = [...(DEEP_QUESTIONS[e.type] ?? []), ...(GERAIS[e.type] ?? GENERICAS)].map((t) => ({ texto: t }));
  const doGenero = e.type === 'personagem' ? g.perguntas.map((t) => ({ texto: t })) : [];
  const vistas = new Set<string>();
  const out: PerguntaEntrevista[] = [];
  for (const p of [...mistura([...fixas]), ...mistura(doGenero), ...mistura(doTipo)]) {
    if (vistas.has(p.texto) || jaRespondida(texto, p)) continue;
    vistas.add(p.texto);
    out.push(p);
  }
  return out.slice(0, max);
}

/** Grava a resposta na nota: na propriedade, se houver uma vazia; senão, numa seção. */
export function gravarResposta(texto: string, p: PerguntaEntrevista, resposta: string): string {
  const r = resposta.trim();
  if (!r) return texto;
  if (p.prop && propVazia(parseProps(texto), p.prop) && !r.includes('\n')) return setProp(texto, p.prop, r);
  return setSection(texto, p.texto, r);
}

/** Pedido para a IA local sugerir uma resposta na voz da ficha (só com o Ollama ligado). */
export function pedidoResposta(e: Pick<Entity, 'name' | 'type' | 'summary'>, g: Genero, corpo: string, p: PerguntaEntrevista): string {
  return [
    `Mundo de ${g.label.toLowerCase()}. Ficha: ${e.name} (${e.type}).`,
    corpo.trim() ? `O que já se sabe:\n${corpo.trim().slice(0, 1800)}` : e.summary,
    `Pergunta: ${p.texto}`,
    e.type === 'personagem' ? 'Responda em primeira pessoa, na voz desta personagem, em até 60 palavras, em português do Brasil.' : 'Responda em até 60 palavras, em português do Brasil, de forma concreta e específica.',
  ].filter(Boolean).join('\n\n');
}
