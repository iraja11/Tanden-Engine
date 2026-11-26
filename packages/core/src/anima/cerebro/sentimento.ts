/*
 * Sentimento: quão boa ou ruim é a mensagem, com que força e qual emoção
 * domina. É o desenho do VADER (léxico com valências, negação que inverte,
 * intensificadores que empurram, "mas" que muda o peso das metades,
 * exclamação e caixa alta que aumentam), adaptado ao português do Brasil.
 *
 * Ela usa isso para três coisas: perceber o tom de uma mensagem que nenhuma
 * intenção pegou, ajustar os sentimentos dela e decidir se cumpre um pedido
 * feito com grosseria.
 */
import type { Texto } from './texto';

export type Emocao = 'alegria' | 'tristeza' | 'raiva' | 'medo' | 'amor' | 'cansaco' | 'tedio' | 'nojo';

export interface Sentimento {
  /** de -1 (péssimo) a 1 (ótimo) */
  valencia: number;
  /** de 0 a 1: quão forte é a mensagem (intensificadores, !, caixa alta) */
  forca: number;
  emocoes: Partial<Record<Emocao, number>>;
  dominante: Emocao | null;
}

/** valência de -4 a 4, como no VADER; já dobrado */
const VAL: Record<string, number> = {
  // bons
  amo: 3.2, ama: 3, adoro: 3, adorei: 3, amei: 3.2, gosto: 1.8, gostei: 2, curto: 1.5, curti: 1.8, feliz: 3, felicidade: 3, alegre: 2.5, alegria: 2.8,
  otimo: 3, otima: 3, bom: 1.9, boa: 1.9, legal: 1.8, massa: 1.8, top: 2, show: 2, incrivel: 3, maravilhoso: 3.2, maravilhosa: 3.2, maravilha: 3, lindo: 2.6, linda: 2.6,
  perfeito: 3, perfeita: 3, demais: 0.5, obrigado: 2, obrigada: 2, valeu: 1.8, agradecido: 2.2, grato: 2.4, grata: 2.4, consegui: 2.6, passei: 2.6, aprovado: 3, aprovada: 3,
  ganhei: 2.6, venci: 2.8, vitoria: 3, sucesso: 3, orgulho: 2.6, orgulhoso: 2.8, orgulhosa: 2.8, animado: 2.5, animada: 2.5, empolgado: 2.6, empolgada: 2.6,
  calmo: 1.4, calma: 1.4, tranquilo: 1.5, tranquila: 1.5, paz: 2, descansado: 1.6, descansada: 1.6, divertido: 2.2, divertida: 2.2, engracado: 2, engracada: 2, fofo: 2.2, fofa: 2.2,
  carinho: 2.4, amor: 3, saudavel: 1.6, sorte: 1.6, sortudo: 1.8, bonito: 2, bonita: 2, gostoso: 2, gostosa: 2, delicia: 2.4, relaxado: 1.6, aliviado: 1.8, aliviada: 1.8,
  sorrindo: 2.2, sorri: 2, rindo: 2, beleza: 1.2, certo: 0.6, positivo: 1.6, esperanca: 2, confiante: 2.2, inspirado: 2.4, inspirada: 2.4, produtivo: 2, produtiva: 2,
  // ruins
  triste: -3, tristeza: -3.2, mal: -2.2, ruim: -2.4, pessimo: -3.2, pessima: -3.2, horrivel: -3.4, terrivel: -3.4, odeio: -3.2, odio: -3.2, raiva: -3, nervoso: -2.2, nervosa: -2.2,
  chato: -2, chata: -2, chateado: -2.4, chateada: -2.4, cansado: -1.8, cansada: -1.8, exausto: -2.8, exausta: -2.8, esgotado: -2.8, esgotada: -2.8, sozinho: -2.2, sozinha: -2.2,
  ansioso: -2.4, ansiosa: -2.4, ansiedade: -2.6, medo: -2.2, assustado: -2.4, assustada: -2.4, chorando: -3, chorei: -3, choro: -2.8, deprimido: -3.6, deprimida: -3.6, depressao: -3.6,
  merda: -2.4, droga: -2, saco: -1.6, tedio: -1.6, entediado: -1.6, entediada: -1.6, irritado: -2.6, irritada: -2.6, estressado: -2.6, estressada: -2.6, preocupado: -2.1, preocupada: -2.1,
  dor: -2.2, doente: -2.2, doendo: -2.4, falhei: -2.4, perdi: -2.2, reprovei: -3, reprovado: -3, reprovada: -3, demitido: -3.2, demitida: -3.2, briguei: -2.4, briga: -2.2,
  decepcionado: -2.8, decepcionada: -2.8, decepcao: -2.8, frustrado: -2.6, frustrada: -2.6, culpa: -2.2, vergonha: -1.8, inutil: -2.8, lixo: -2.6, burro: -2.2, burra: -2.2,
  odiei: -3, nojo: -2.6, nojento: -2.8, insuportavel: -3, desanimado: -2.4, desanimada: -2.4, pior: -2.6, sofrendo: -3, sofrimento: -3.2, solidao: -2.8, perdido: -1.8, perdida: -1.8,
  morrer: -3, morte: -3, sumir: -2.2, desistir: -2.4, cansaco: -1.8, sono: -0.8, fome: -0.6, atrasado: -1.4, atrasada: -1.4, prova: -0.4, prazo: -0.6, chefe: -0.3,
  porra: -1.2, caralho: -1, aff: -1.2, afe: -1.2, ugh: -1.4, credo: -1.2, saudade: -0.6,
};

const EMOCAO: Record<Emocao, RegExp> = {
  alegria: /^(feliz|felicidade|alegr\w*|otim[oa]|incrivel|maravilh\w*|consegui|passei|aprovad[oa]|ganhei|venci|vitoria|animad[oa]|empolgad[oa]|<riso>|riso|rindo|sorri\w*|divertid[oa]|orgulh\w*)$/,
  tristeza: /^(trist\w*|chor\w*|deprimid[oa]|depressao|sozinh[oa]|solidao|saudade|decepc\w*|desanimad[oa]|sofr\w*|perdi|reprov\w*|<triste>|mal)$/,
  raiva: /^(raiva|odeio|odio|odiei|irritad[oa]|estressad[oa]|nervos[oa]|merda|porra|caralho|droga|insuportavel|<raiva>|briga|briguei|puto|puta)$/,
  medo: /^(medo|assustad[oa]|ansios[oa]|ansiedade|preocupad[oa]|pavor|panico|<medo>|nervos[oa])$/,
  amor: /^(amo|ama|amei|adoro|amor|carinho|<amor>|saudade|beijo|beijos|abraco|fofo|fofa|linda|lindo)$/,
  cansaco: /^(cansad[oa]|exaust[oa]|esgotad[oa]|cansaco|sono|dormir|morto|morta|acabad[oa])$/,
  tedio: /^(tedio|entediad[oa]|chato|chata|<tedio>|nada|saco|aff|afe)$/,
  nojo: /^(nojo|nojent[oa]|credo|eca)$/,
};

const NEGA = new Set(['nao', 'nunca', 'nem', 'jamais', 'sem', 'ninguem', 'nenhum', 'nenhuma', 'tampouco']);
const AUMENTA = new Set(['muito', 'muita', 'super', 'mega', 'ultra', 'mo', 'bem', 'tao', 'extremamente', 'totalmente', 'completamente', 'absurdamente', 'demais', 'bastante', 'mt', 'hiper', 'puta', 'mto']);
const DIMINUI = new Set(['pouco', 'meio', 'quase', 'levemente', 'ligeiramente', 'meia', 'tipo', 'talvez', 'acho']);
const VIRADA = new Set(['mas', 'porem', 'contudo', 'entretanto', 'so que', 'todavia']);

const MARCA_VAL: Record<string, number> = { '<riso>': 1.6, '<amor>': 2.6, '<triste>': -2.6, '<raiva>': -2.6, '<medo>': -1.8, '<tedio>': -1.2 };

export function sentimento(t: Texto): Sentimento {
  const toks = t.limpo.split(' ').filter(Boolean);
  const pesos: number[] = [];
  let virada = -1;
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i]!;
    if (VIRADA.has(w)) virada = i;
    const marca = w in MARCA_VAL;
    let v = VAL[w] ?? MARCA_VAL[w] ?? 0;
    // "bem" é intensificador antes de outra palavra com valência ("bem cansado"); sozinho, é bom ("tô bem")
    if (w === 'bem' && !(VAL[toks[i + 1] ?? ''] ?? 0)) v = 1.4;
    if (!v) {
      pesos.push(0);
      continue;
    }
    if (marca) {
      pesos.push(v);
      continue;
    }
    // olha até 3 palavras para trás: negação inverte (e enfraquece), intensificador empurra
    for (let k = 1; k <= 3 && i - k >= 0; k++) {
      const p = toks[i - k]!;
      if (NEGA.has(p)) v *= -0.74;
      else if (AUMENTA.has(p)) v += Math.sign(v) * 0.293 * (k === 1 ? 1 : 0.6);
      else if (DIMINUI.has(p)) v -= Math.sign(v) * 0.293 * (k === 1 ? 1 : 0.6);
    }
    // "triste demais", "feliz pra caramba"
    const prox = toks[i + 1];
    if (prox === 'demais' || (prox === 'pra' && toks[i + 2] === 'caramba') || prox === 'pacas') v += Math.sign(v) * 0.293;
    pesos.push(v);
  }
  // "mas": o que vem antes pesa metade, o que vem depois pesa 1,5
  if (virada >= 0) for (let i = 0; i < pesos.length; i++) pesos[i] = pesos[i]! * (i < virada ? 0.5 : i > virada ? 1.5 : 1);
  let soma = pesos.reduce((a, b) => a + b, 0);
  const excl = Math.min(4, (t.original.match(/!/g) ?? []).length);
  if (soma) soma += Math.sign(soma) * excl * 0.292;
  if (t.marcas.has('grito') && soma) soma *= 1.2;
  const valencia = soma / Math.sqrt(soma * soma + 15);

  const emocoes: Partial<Record<Emocao, number>> = {};
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i]!;
    const negada = [1, 2].some((k) => NEGA.has(toks[i - k] ?? ''));
    for (const [e, re] of Object.entries(EMOCAO) as Array<[Emocao, RegExp]>) if (re.test(w) && !negada) emocoes[e] = (emocoes[e] ?? 0) + 1;
  }
  let dominante: Emocao | null = null;
  let max = 0;
  for (const [e, n] of Object.entries(emocoes) as Array<[Emocao, number]>) if (n > max) [dominante, max] = [e, n];
  const aumentos = toks.filter((w) => AUMENTA.has(w)).length;
  const forca = Math.min(1, Math.abs(valencia) * 0.6 + excl * 0.08 + aumentos * 0.08 + (t.marcas.has('grito') ? 0.2 : 0));
  return { valencia, forca, emocoes, dominante };
}
