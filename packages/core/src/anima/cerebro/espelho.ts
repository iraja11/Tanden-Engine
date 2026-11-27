/*
 * O espelho: o que a pessoa disse, de volta, na segunda pessoa.
 *
 *   "eu briguei com meu irmão hoje"  → "você brigou com seu irmão hoje"
 *   "me sinto um lixo"               → "você se sente um lixo"
 *   "fui no médico e ele me passou um remédio" → "você foi no médico e ele te passou um remédio"
 *
 * É o que separa "hm. 'irmão'. interessante." de uma resposta que mostra que
 * ela ENTENDEU a frase. Gramática de verdade, sem modelo: pronomes (eu, me,
 * mim, comigo, meu...), o reflexivo ("eu me sinto" → "você se sente"), os
 * verbos irregulares mais comuns e as terminações regulares das três
 * conjugações no presente e no pretérito (com os ajustes de grafia:
 * briguei → brigou, fiquei → ficou, comecei → começou, conheço → conhece).
 *
 * Só conjuga palavra em posição de verbo (logo depois de "eu", de um advérbio
 * de "eu" ou no começo da frase sem sujeito), então "carro" nunca vira "carra".
 * Frase que fala DELA (você, te, contigo) não é espelhada: devolve null.
 */

const dob = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 1ª pessoa → "você" (presente, pretérito, futuro com ir). */
const IRREGULARES: Record<string, string> = {
  sou: 'é', estou: 'está', to: 'tá', tou: 'tá', tenho: 'tem', vou: 'vai', fui: 'foi', fiz: 'fez', faco: 'faz', posso: 'pode', pude: 'pôde',
  quero: 'quer', quis: 'quis', sei: 'sabe', soube: 'soube', digo: 'diz', disse: 'disse', vejo: 'vê', vi: 'viu', venho: 'vem', vim: 'veio',
  dou: 'dá', dei: 'deu', trago: 'traz', trouxe: 'trouxe', ponho: 'põe', pus: 'pôs', estive: 'esteve', tive: 'teve', ouco: 'ouve', ouvi: 'ouviu',
  perco: 'perde', peco: 'pede', durmo: 'dorme', consigo: 'consegue', sinto: 'sente', minto: 'mente', sigo: 'segue', prefiro: 'prefere',
  sirvo: 'serve', odeio: 'odeia', leio: 'lê', li: 'leu', creio: 'crê', caio: 'cai', saio: 'sai', sai: 'saiu', cai: 'caiu', rio: 'ri', sorrio: 'sorri',
  subo: 'sobe', fujo: 'foge', cubro: 'cobre', tusso: 'tosse', visto: 'veste', repito: 'repete', valho: 'vale', caibo: 'cabe', perdi: 'perdeu',
  agi: 'agiu', fiquei: 'ficou', estava: 'estava', tava: 'tava', era: 'era', ia: 'ia', tinha: 'tinha', podia: 'podia', queria: 'queria', sabia: 'sabia',
  achava: 'achava', gostava: 'gostava', preciso: 'precisa', passo: 'passa', acho: 'acha', vivo: 'vive', devo: 'deve', como: 'come', bebo: 'bebe',
  escrevo: 'escreve', corro: 'corre', aprendo: 'aprende', entendo: 'entende', recebo: 'recebe', conheco: 'conhece', esqueco: 'esquece',
  pareco: 'parece', mereco: 'merece', cresco: 'cresce', mexo: 'mexe', morro: 'morre', resolvo: 'resolve', escolho: 'escolhe', assisto: 'assiste',
  abro: 'abre', decido: 'decide', parto: 'parte', divido: 'divide', insisto: 'insiste', existo: 'existe', desisto: 'desiste', discuto: 'discute',
  vendo: 'vende', respondo: 'responde', escondo: 'esconde', perdo: 'perde', choro: 'chora', ajudo: 'ajuda', sofro: 'sofre', permito: 'permite',
  dirijo: 'dirige', exijo: 'exige', finjo: 'finge', tenciono: 'tenciona', mantenho: 'mantém', obtenho: 'obtém', contenho: 'contém',
};

/** Pretérito em -i que é da 2ª conjugação (comi → comeu); o resto em -i é da 3ª (parti → partiu). */
const PRET_ER = /(?:eci|endi|bi|olhi|ovi|ervi|evi|omi|orri|ivi|exi|uci|eli)$/;
/** Presente em -o da 2ª/3ª conjugação que não está nos irregulares: pelos finais mais comuns. */
const PRES_ER = /(?:endo|ebo|evo|ovo|olho|ezo|isto|abro|ido|ubro|orro|ordo|ompo)$/;

/** Advérbios que podem ficar entre "eu" e o verbo. */
const ADV = new Set(['nao', 'ja', 'ainda', 'so', 'tambem', 'sempre', 'nunca', 'quase', 'meio', 'realmente', 'ate', 'mal', 'acho', 'tipo', 'tb', 'n', 'nem', 'mesmo']);

/** Palavras que nunca são verbo no começo da frase (para não conjugar "hoje" ou "ontem"). */
const NAO_VERBO = new Set(['hoje', 'ontem', 'amanha', 'agora', 'depois', 'antes', 'aqui', 'isso', 'isto', 'esse', 'essa', 'meu', 'minha', 'o', 'a', 'os', 'as', 'um', 'uma',
  'no', 'na', 'de', 'do', 'da', 'pra', 'para', 'com', 'que', 'e', 'mas', 'muito', 'tanto', 'novo', 'pouco', 'ele', 'ela', 'eles', 'elas', 'gente', 'tudo', 'nada', 'carro',
  'cedo', 'tarde', 'logo', 'quando', 'porque', 'pq', 'entao', 'sei', 'nossa', 'cara', 'mano', 'velho', 'bicho', 'aquilo', 'aquele', 'aquela', 'tipo', 'so']);

const PRONOMES: Record<string, string> = { eu: 'você', mim: 'você', comigo: 'com você', meu: 'seu', minha: 'sua', meus: 'seus', minhas: 'suas', mo: 'te' };

/** Conjuga uma palavra da 1ª pessoa para "você" (null = não parece verbo da 1ª pessoa). */
export function conjugar(palavra: string): string | null {
  const d = dob(palavra);
  if (IRREGULARES[d]) return IRREGULARES[d]!;
  if (d.length < 3) return null;
  // pretérito da 1ª: -ei → -ou, com os ajustes de grafia
  if (d.endsWith('ei') && d.length >= 4) {
    const raiz = palavra.slice(0, -2);
    if (d.endsWith('guei')) return `${palavra.slice(0, -4)}gou`;
    if (d.endsWith('quei')) return `${palavra.slice(0, -4)}cou`;
    if (d.endsWith('cei')) return `${palavra.slice(0, -3)}çou`;
    return `${raiz}ou`;
  }
  // pretérito da 2ª e 3ª: -i
  if (d.endsWith('i') && d.length >= 4 && !/[aeiou]i$/.test(d)) return PRET_ER.test(d) ? `${palavra.slice(0, -1)}eu` : `${palavra.slice(0, -1)}iu`;
  // futuro: falarei → falará, comerei → comerá
  if (/[aei]rei$/.test(d)) return `${palavra.slice(0, -3)}rá`;
  // presente: -o
  if (d.endsWith('o') && d.length >= 4) {
    if (d.endsWith('co') && palavra.endsWith('ço')) return `${palavra.slice(0, -2)}ce`;
    if (d.endsWith('jo')) return `${palavra.slice(0, -2)}ge`;
    return PRES_ER.test(d) ? `${palavra.slice(0, -1)}e` : `${palavra.slice(0, -1)}a`;
  }
  // imperfeito: igual na 3ª pessoa
  if (/(?:ava|ia)$/.test(d)) return palavra;
  return null;
}

const PLURAL: Record<string, string> = { foi: 'foram', e: 'são', ta: 'tão', esta: 'estão', tem: 'têm', vai: 'vão', fez: 'fizeram', pode: 'podem', quer: 'querem', era: 'eram', tava: 'tavam', estava: 'estavam', ia: 'iam', teve: 'tiveram', viu: 'viram', deu: 'deram', ficou: 'ficaram', sabe: 'sabem' };

/** 3ª do singular ("a gente foi") → 3ª do plural ("vocês foram"). */
function plural(v: string): string {
  const d = dob(v);
  if (PLURAL[d]) return PLURAL[d]!;
  if (d.endsWith('ou')) return `${v.slice(0, -2)}aram`;
  if (d.endsWith('eu')) return `${v.slice(0, -2)}eram`;
  if (d.endsWith('iu')) return `${v.slice(0, -2)}iram`;
  if (/[ae]$/.test(d)) return `${v}m`;
  return v;
}

/** A frase fala com ela ou dela (aí espelhar fica estranho). */
const FALA_DELA = /\b(voce|vc|vcs|ce|tu|te|contigo|teu|tua|anima|seu|sua)\b/;

/**
 * O espelho da primeira oração da frase que fala da própria pessoa, ou null.
 * Limita a umas 14 palavras (ela repete o essencial, não a frase inteira).
 */
export function espelhar(msg: string, maxPalavras = 14): string | null {
  const limpo = msg.replace(/\s+/g, ' ').trim();
  if (!limpo || /\?\s*$/.test(limpo)) return null;
  // a primeira oração com primeira pessoa
  const oracoes = limpo.split(/(?<=[.!;])\s+|\s+(?=mas\s)/i).map((x) => x.replace(/[.!;,…]+$/, '').trim()).filter(Boolean);
  for (const o of oracoes) {
    const r = espelharOracao(o, maxPalavras);
    if (r) return r;
  }
  return null;
}

function espelharOracao(o: string, max: number): string | null {
  if (FALA_DELA.test(dob(o))) return null;
  const ws = o.split(' ').filter(Boolean);
  if (ws.length < 2) return null;
  const out: string[] = [];
  let mudou = false;
  let sujeito = false; // vimos "eu": o próximo verbo é da 1ª pessoa
  for (let i = 0; i < ws.length && out.length < max; i++) {
    const w = ws[i]!;
    const pont = /[,:]$/.test(w) ? w.slice(-1) : '';
    const base = pont ? w.slice(0, -1) : w;
    const d = dob(base);
    const ini = i === 0;
    if (d === 'eu') {
      // "acho que eu tô" → "você acha que tá" (o sujeito já foi dito)
      const jaDito = i > 0 && dob(ws[i - 1]!) === 'que' && out.includes('você');
      if (!jaDito) out.push('você' + pont);
      mudou = sujeito = true;
      continue;
    }
    if (d === 'me') {
      // "eu me sinto" / "me sinto" (reflexivo) → "se"; "ele me ligou" → "te"
      const reflexivo = sujeito || ini;
      if (ini && !sujeito) out.push('você');
      out.push((reflexivo ? 'se' : 'te') + pont);
      mudou = true;
      if (reflexivo) sujeito = true;
      continue;
    }
    if (d === 'a' && dob(ws[i + 1] ?? '') === 'gente') {
      // "a gente foi" → "vocês foram": o verbo seguinte vai para o plural
      out.push('vocês');
      i++;
      const v = ws[i + 1];
      if (v && /^[\p{L}]+$/u.test(v)) {
        out.push(plural(v));
        i++;
      }
      mudou = true;
      sujeito = false;
      continue;
    }
    if (PRONOMES[d]) {
      out.push(PRONOMES[d]! + pont);
      mudou = true;
      continue;
    }
    if (sujeito && ADV.has(d) && !(d === 'acho' && i + 1 < ws.length && dob(ws[i + 1]!) === 'que')) {
      out.push(base + pont);
      continue;
    }
    // verbo: logo depois do sujeito (ou dos advérbios dele), ou abrindo a frase sem sujeito
    if ((sujeito || (ini && !NAO_VERBO.has(d))) && /^[\p{L}]+$/u.test(base)) {
      const c = conjugar(base);
      if (c) {
        if (ini && !sujeito) out.push('você');
        out.push(c + pont);
        mudou = true;
        sujeito = false;
        continue;
      }
    }
    sujeito = false;
    out.push(w);
  }
  if (!mudou) return null;
  const txt = out.join(' ').replace(/\s+/g, ' ').trim();
  // "você tá" no começo: tira a maiúscula do original
  return txt.charAt(0).toLowerCase() + txt.slice(1);
}
