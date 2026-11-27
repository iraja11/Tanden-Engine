/*
 * O seguimento: a mensagem que só faz sentido com a conversa de antes.
 *
 * A rede diz O QUE a pessoa fez ("pediu esclarecimento", "disse sim", "e
 * você?"); aqui se resolve SOBRE O QUÊ, olhando a memória de trabalho
 * (dialogo.ts): o que ela acabou de dizer, de onde veio e o que citou.
 *
 *   ela: "quem é ela?" (comentando o vídeo)      você: "ela quem?"
 *     → explica: a do vídeo, com o título         (explica.web...)
 *   ela: "ainda gosta de dance?"                  você: "não sei quem é dance"
 *     → corrige a memória: apaga "dance"          (corrige.esqueci)
 *   ela: "conta uma piada"... "mais uma"          → outra piada do mesmo grupo
 *   você: "tô com fome" ... "e você?"             → a versão dela          (etu.fome)
 *   ela: "pipoca?" (pergunta)  você: "sim"        → resposta à pergunta dela (web.video.sim → resposta.sim)
 *   ela opinou  você: "por quê?"                  → o porquê               (<grupo>.porque → porque.dela)
 *
 * Função pura: devolve os grupos de fala (do mais específico ao mais geral),
 * as variáveis e, quando corrige, os fatos novos. Quem fala é o cerebro.ts.
 */
import { esquecerFato, fatosCitados, type FatoCitado, type Fatos, type TipoFato } from '../fatos';
import type { AnimaState } from '../estado';
import { temaDe } from '../mente';
import { ditoPrincipal, mensagemAnterior, prefixos, ultimoDela } from './dialogo';
import type { Dito, Turno } from './memoria';
import type { Texto } from './texto';

export type TipoSeguimento = 'esclarecer' | 'corrige' | 'responde' | 'mais' | 'etu' | 'porque' | 'reacao' | 'favorito' | 'curto';

export interface Seguimento {
  tipo: TipoSeguimento;
  grupos: string[];
  vars: Record<string, string | number>;
  /** a memória corrigida (corrige, ou "não" a "ainda gosta de X?") */
  fatos?: Fatos;
  /** uma linha para o /pensamento */
  traco: string;
  /** a intenção que fica no diálogo (quando o seguimento entende melhor do que a rede) */
  intencao?: string;
}

/** O grupo de onde saiu uma lembrança, e o tipo de fato que ela cita. */
const FATO_DO_GRUPO: Array<[RegExp, TipoFato, string]> = [
  [/^lembra\.gosta|^aprende\.gosta|^opiniao\.sua$/, 'gosta', 'coisa'], [/^lembra\.odeia|^aprende\.odeia|^opiniao\.suaodeia/, 'odeia', 'coisa'],
  [/^lembra\.medo|^aprende\.medo/, 'medo', 'coisa'], [/^lembra\.sonho|^aprende\.sonho/, 'sonho', 'coisa'], [/^lembra\.trabalho|^aprende\.trabalho/, 'trabalho', 'coisa'],
  [/^lembra\.cidade|^aprende\.cidade/, 'cidade', 'coisa'], [/^lembra\.nome|^aprende\.nome/, 'nome', 'nomereal'], [/^lembra\.bicho|^aprende\.bicho/, 'bicho', 'bicho'],
  [/^lembra\.(pessoa|suspeito)|^aprende\.(pessoa|suspeito|relacao)/, 'pessoa', 'pessoa'],
];

/** O fato que um dito dela cita (se citou). */
export function fatoDoDito(d: Dito): FatoCitado | null {
  for (const [re, tipo, chave] of FATO_DO_GRUPO) {
    if (!re.test(d.g)) continue;
    const v = d.ref?.[chave];
    if (typeof v === 'string' && v) return { tipo, valor: v };
  }
  return null;
}

/** Grupos que dá para pedir "mais uma" (cada vez sai uma diferente, o motor evita as recentes). */
const REPETIVEL = /^(conversa\.(piada|ideia|surpresa|musica|jogar)|ideia$|papo\.(poema|historia|cantada|meme|cantar|filme|anime|livro|videogame|filosofia|desenho|escolhe)|responde\.curiosidade)/;

/** Esclarecimento que a gramática não precisa adivinhar. */
const ESCLARECE = /^(como assim|como e que e|q|que|oq|o que|o q|ha|hein|ahn|hm\?|quem|qual|quais|onde|ue|oi\?|perdao)\??$|^(ela|ele|elas|eles|isso|essa|esse|quem|qual) (quem|qual|o que|oq|ai)\??$|(do|de) que (voce|vc|ce) (ta|esta) falando|de quem (voce|vc|ce) (ta|esta) falando|^nao entendi|^n entendi|nao captei|nao peguei|^boiei|falando de quem|que papo e esse|o que (voce|vc) quis dizer/;

/** Correção explícita de memória ("nunca disse isso", "não sei quem é X", "não gosto de X"). */
const NEGA = /\b(nao|n|nunca|nem|jamais)\b.*\b(sei|conheco|gosto|gostei|curto|curti|tenho|moro|trabalho|disse|falei|e)\b|^(mentira|errado|nada a ver|de onde)\b|inventou|confundiu|lembrou errado|entendeu errado/;

/** Negação que já começa negando: vale mesmo quando a consulta à memória casou ("não sei quem é X" não é pergunta). */
const NEGA_FORTE = /^(eu )?(nao|n|nunca|jamais) (sei|conheco|gosto|curto|tenho|disse|falei|moro|trabalho)\b|\b(nunca|nao) (disse|falei) (isso|nada|isso ai)\b|^(mentira|errado|nada a ver|de onde (voce|vc) tirou)|inventou|confundiu|lembrou errado|entendeu errado/;

/**
 * Reação curta ao que ela acabou de dizer. Sem isto, "que legal" virava
 * "estoubem" e "nunca vi esse" virava "corrige" ("eu me confundi").
 */
const REACAO: Array<[string, RegExp]> = [
  ['desconhece', /^(eu )?(nunca|nao|n|nem) (vi|assisti|li|ouvi|joguei|conheco|conhecia|provei|experimentei|fui)( (esse|essa|isso|ele|ela|nao|ainda|falar|de|disso|desse|dessa|nunca|na vida))*$/],
  ['conhece', /^(eu )?(ja (vi|assisti|li|ouvi|joguei|provei|conhecia|conheco)|conheco|eu conheco|amo esse|amo essa|adoro esse|adoro essa)( (esse|essa|isso|ele|ela|sim|tambem|ja|varias vezes|muito))*$/],
  ['vai', /^(entao )?(eu )?(vou|vo|irei|quero) (ver|assistir|ler|ouvir|jogar|testar|tentar|provar|procurar|conhecer)( (esse|essa|isso|ele|ela|entao|depois|hoje|amanha|sim|um dia|qualquer dia|ai))*$/],
  ['positiva', /^(que|q) (legal|massa|bom|otimo|show|daora|top|incrivel|lindo|linda|fofo|fofa|bonito|interessante|maneiro|irado|perfeito|demais|maravilha|chique|foda)( (demais|mesmo|hein|ne))?$|^(legal|massa|show|top|daora|adorei|amei|gostei|demais|irado|maneiro|perfeito|incrivel|interessante|foda|brabo|braba)( (demais|mesmo|hein|ne))?$/],
  ['vago', /^(sei la|sl|nao sei|n sei|sei nao|nem sei|tanto faz|qualquer coisa|qualquer um|sei la mano|sei la cara)$/],
  ['negativa', /^(que|q) (chato|droga|saco|estranho|bizarro|esquisito|nojo|medo)( (mesmo|hein|ne))?$|^(credo|eca|bizarro|estranho|esquisito|sinistro)$/],
];

/** "qual o seu favorito?" sem dizer de quê: o tema vem da conversa. */
const FAVORITO_VAGO = /\b(qual|quais|e) (e |eh |sao )?(o |a |os |as )?(seu|sua|teu|tua|seus|suas) (favorit[oa]s?|preferid[oa]s?)\b|\b(voce|vc|ce) tem (algum|alguma|um|uma) (favorit|preferid)|\bqual (voce|vc|ce) (mais gosta|prefere|curte mais|ama mais)\b|^e (o|a) (seu|sua) (favorit[oa]|preferid[oa])?\??$/;

/** Intenções depois das quais uma resposta de uma palavra é continuação ("pizza" → "calabresa"). */
const CONTINUA_CURTO = new Set(['fome', 'trabalho', 'treino', 'tedio', 'musica', 'jogar', 'cansaco', 'feliz', 'conquistei', 'mau', 'triste', 'desabafo', 'comofoi', 'estoubem']);

const tok = (t: Texto) => t.tokens.join(' ');

/**
 * Decide se a mensagem é um seguimento da conversa. `rotulo` e `conf` vêm do
 * classificador; `agora` é a hora; `msg` o texto original.
 */
export function seguimento(s: AnimaState, t: Texto, msg: string, rotulo: string, conf: number, now: number): Seguimento | null {
  const mc = s.memoria.cerebro;
  const ela = ultimoDela(mc, now, s.falou);
  const frase = tok(t);
  const fatos = s.memoria.fatos;

  // 1. corrigir a memória: "não sei quem é dance", "eu nunca disse isso", "não" a "ainda gosta de X?"
  const citadosDela = (ela?.ditos ?? []).map(fatoDoDito).filter((x): x is FatoCitado => !!x);
  const citadosAgora = fatosCitados(fatos, msg);
  const forte = rotulo === 'corrige' || NEGA_FORTE.test(frase);
  const nega = forte || NEGA.test(frase);
  if (nega && (forte || rotulo === 'nao' || rotulo === 'esclarecer' || rotulo === 'eco' || rotulo === 'fato' || conf < 0.7)) {
    // o alvo: o fato que ela citou e a pessoa repetiu; senão o que ela citou; senão o que a pessoa citou
    const alvo = citadosDela.find((c) => citadosAgora.some((x) => x.valor === c.valor)) ?? (citadosDela.length && rotulo !== 'fato' ? citadosDela[0] : null)
      ?? (forte || /\b(nao|nunca) (sei|conheco)\b/.test(frase) ? citadosAgora[0] : null);
    if (alvo) {
      return { tipo: 'corrige', grupos: [`corrige.esqueci.${alvo.tipo}`, 'corrige.esqueci'], vars: { coisa: alvo.valor }, fatos: esquecerFato(fatos, alvo.valor, alvo.tipo), traco: `corrige a memória: esqueço ${alvo.tipo} "${alvo.valor}"` };
    }
    if (forte && ela && /\b(disse|falei|inventou|confundiu|errado|tirou)\b/.test(frase)) {
      const d = ditoPrincipal(ela);
      return { tipo: 'corrige', grupos: ['corrige.desculpa'], vars: { dito: d?.t ?? '' }, traco: 'corrige: não sei o quê; peço para explicar' };
    }
  }

  // 1b. "qual o seu favorito?" sem dizer de quê: o tema é o da conversa
  if (FAVORITO_VAGO.test(frase) && !temaDe(frase)) {
    const antes = mensagemAnterior(mc, now);
    const fontes = [...(ela?.ditos ?? []).flatMap((d) => [String(d.ref?.coisa ?? ''), d.t]).reverse(), antes?.t ?? '', antes?.i?.replace(/^papo\./, '') ?? ''];
    const tema = fontes.map((x) => (x ? temaDe(x) : null)).find((x) => !!x);
    if (tema) return { tipo: 'favorito', grupos: [`dela.${tema}`], vars: {}, intencao: 'sobre_ela', traco: `favorito sem tema: o da conversa é ${tema}` };
  }

  if (!ela) {
    // sem fala dela recente, "e você?" ainda pode responder à mensagem anterior da pessoa
    return etu(rotulo, frase, mc, now) ?? curto(t, frase, rotulo, conf, mc, now);
  }
  const ultimo = ela.ditos?.at(-1);
  const principal = ditoPrincipal(ela);

  // 2. esclarecer o que ela disse
  const queX = /^(que|qual|quem e|quem eh|quem|como assim) ([\p{L}]{3,})\??$/u.exec(frase);
  const citouX = !!queX && dobra(ela.t).includes(queX[2]!);
  if (rotulo === 'esclarecer' || ESCLARECE.test(frase) || citouX || (rotulo === 'quem' && /^(ela|ele) quem|quem e (ela|ele)\b/.test(frase))) {
    const d = principal ?? ultimo;
    if (d) {
      const grupos = [...prefixos(d.g).map((p) => `explica.${p}`), 'explica'];
      return { tipo: 'esclarecer', grupos, vars: { ...(d.ref ?? {}), dito: aspas(d.t) }, traco: `esclareço o que eu disse (${d.g})` };
    }
  }

  // 3. resposta à pergunta dela (as perguntas de curiosidade, segue.*, o motor já resolve)
  if (ultimo?.q && !ultimo.g.startsWith('segue.') && !ultimo.g.startsWith('ordem.') && (rotulo === 'sim' || rotulo === 'nao' || rotulo === 'concorda' || (rotulo === 'eco' && /^(sim|s|nao|n|claro|aham|uhum|nem)\b/.test(frase)))) {
    // a primeira palavra manda ("sim, não vivo sem" é sim); sem ela, o classificador
    const sim = /^(sim|s|claro|aham|uhum|com certeza|ainda|demais|muito)\b/.test(frase) ? true : /^(nao|n|nem|nunca|jamais)\b/.test(frase) ? false : rotulo !== 'nao';
    const lado = sim ? 'sim' : 'nao';
    const f = fatoDoDito(ultimo);
    // "ainda gosta de X?" "não" → risca da lista
    if (!sim && f && (f.tipo === 'gosta' || f.tipo === 'medo' || f.tipo === 'sonho')) {
      return { tipo: 'responde', grupos: [`resposta.nao.lembra.${f.tipo}`, 'resposta.nao.lembra'], vars: { coisa: f.valor }, fatos: esquecerFato(fatos, f.valor, f.tipo), traco: `respondeu não a "${ultimo.g}": risco ${f.tipo} "${f.valor}"` };
    }
    const grupos = [...prefixos(ultimo.g).map((p) => `${p}.${lado}`), `resposta.${lado}`];
    return { tipo: 'responde', grupos, vars: { ...(ultimo.ref ?? {}), pergunta: aspas(ultimo.t) }, traco: `respondeu ${lado} à pergunta dela (${ultimo.g})` };
  }

  // 3b. reação curta ao que ela disse ("que legal", "nunca vi esse", "vou assistir")
  if (t.tokens.length <= 7 && !/\?\s*$/.test(msg.trim())) {
    const r = REACAO.find(([, re]) => re.test(frase));
    const d = principal ?? ultimo;
    if (r && d && !(ultimo?.q && (r[0] === 'positiva' || r[0] === 'negativa'))) {
      const grupos = [...prefixos(d.g).map((p) => `${p}.${r[0]}`), `reacao.${r[0]}`];
      return { tipo: 'reacao', grupos, vars: { ...(d.ref ?? {}), dito: aspas(d.t) }, intencao: 'reacao', traco: `reação (${r[0]}) ao que eu disse (${d.g})` };
    }
  }

  // 4. "mais uma", "outra", "continua"
  const recenteCmd = mc.ultimaDecisao && now - mc.ultimaDecisao.em < 15 * 60_000 && mc.ultimaDecisao.em >= (ela.em || s.falou) - 1000;
  if ((rotulo === 'repetir' || rotulo === 'contamais' || /^(mais uma|outra|outro|manda outra|conta outra|mais um|de novo|continua)\b/.test(frase)) && !recenteCmd) {
    const d = (ela.ditos ?? []).find((x) => REPETIVEL.test(x.g));
    if (d) return { tipo: 'mais', grupos: rotulo === 'contamais' ? [`${d.g}.mais`, d.g] : [d.g], vars: { ...(d.ref ?? {}) }, traco: `mais uma do mesmo: ${d.g}` };
  }

  // 5. "e você?"
  const e = etu(rotulo, frase, mc, now);
  if (e) return e;

  // 6. "por quê?" depois de uma fala dela (a decisão sobre um pedido, o cerebro.ts explica antes)
  if (rotulo === 'porque' && principal && !recenteCmd) {
    return { tipo: 'porque', grupos: [...prefixos(principal.g).map((p) => `${p}.porque`), 'porque.dela'], vars: { ...(principal.ref ?? {}), dito: aspas(principal.t) }, traco: `por quê do que eu disse (${principal.g})` };
  }

  // 7. resposta de uma ou duas palavras que continua o assunto ("vou pedir pizza" ... "calabresa")
  return curto(t, frase, rotulo, conf, mc, now);
}

/** Resposta curta (sem verbo de pedido, sem pergunta) que só faz sentido com a mensagem anterior. */
function curto(t: Texto, frase: string, rotulo: string, conf: number, mc: AnimaState['memoria']['cerebro'], now: number): Seguimento | null {
  if (t.tokens.length > 3 || /\?\s*$/.test(t.original.trim()) || (rotulo !== 'eco' && conf >= 0.6)) return null;
  if (/^(sim|s|nao|n|ok|blz|ta|hm+|kk+|oi|e|eu|voce|vc|nada|sei la|nao sei|n sei|tanto faz|qualquer|qualquer um|qualquer coisa|nenhum|nenhuma)$/.test(frase)) return null;
  const antes = mensagemAnterior(mc, now, 4 * 60_000);
  if (!antes?.i || !CONTINUA_CURTO.has(antes.i)) return null;
  const coisa = t.original.trim().replace(/[.!]+$/, '');
  return { tipo: 'curto', grupos: [`curto.${antes.i}`, 'curto'], vars: { coisa }, intencao: antes.i, traco: `resposta curta: continua "${antes.i}" ("${antes.t.slice(0, 40)}")` };
}

/** "e você?": a versão dela do que a pessoa acabou de dizer. */
function etu(rotulo: string, frase: string, mc: AnimaState['memoria']['cerebro'], now: number): Seguimento | null {
  if (rotulo !== 'etu' && !/^(e (voce|vc|tu|ce)|e contigo|e com voce)\??$/.test(frase)) return null;
  const antes: Turno | null = mensagemAnterior(mc, now);
  if (!antes?.i || antes.i === 'etu') return null;
  return { tipo: 'etu', grupos: [`etu.${antes.i}`], vars: { assunto: antes.t.slice(0, 60) }, traco: `e eu? sobre "${antes.i}"` };
}

const dobra = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O que ela disse, curto, para citar entre aspas. */
function aspas(t: string): string {
  const x = t.replace(/\s+/g, ' ').trim();
  return x.length > 90 ? `${x.slice(0, 87).replace(/\s+\S*$/, '')}…` : x;
}
