/*
 * Texto: a primeira coisa que a Ânima faz com o que a pessoa digita é
 * arrumar a bagunça. Gente escreve "vc", "pq", "nãooo", "kkkk", "abri a nota"
 * (querendo dizer "abre"), "porfavor", com emoji, sem acento e em CAIXA ALTA.
 *
 * Aqui sai um `Texto`: o original, uma versão dobrada (minúscula, sem acento,
 * com a MESMA posição de cada letra do original, para recortar trechos com as
 * maiúsculas certas), os tokens já com gíria expandida e erro de digitação
 * corrigido, e marcas (riso, grito, educação, emojis de amor/tristeza/raiva).
 *
 * O corretor é um SymSpell: para cada palavra do léxico guardamos as versões
 * com até duas letras apagadas; uma palavra desconhecida acha as candidatas
 * apagando letras dela também. É O(1) por consulta, sem varrer o léxico.
 */

// ------------------------------------------------------------------ dobrar

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

/** minúsculo e sem acento (pode mudar o comprimento em casos raros) */
export const dobrar = (t: string): string => t.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase();

/**
 * Dobra letra por letra, mantendo o comprimento: `dobrarAlinhado(s)[i]` é a
 * letra `s[i]` dobrada. Com isso uma regex no texto dobrado dá índices que
 * valem no original.
 */
export function dobrarAlinhado(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const d = c.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase();
    out += d.length === 1 ? d : c.length === 1 ? c.toLowerCase().slice(0, 1) || c : c;
  }
  return out.length === s.length ? out : s.toLowerCase();
}

// ------------------------------------------------------------------ gírias

/** abreviações de internet → forma por extenso (já dobrada) */
export const GIRIAS: Record<string, string> = {
  vc: 'voce', vcs: 'voces', voce: 'voce', ce: 'voce', cê: 'voce', oce: 'voce', tu: 'tu',
  q: 'que', qe: 'que', ql: 'qual', qlq: 'qualquer', qq: 'qualquer', pq: 'porque', pqp: 'puta que pariu', porq: 'porque',
  tb: 'tambem', tbm: 'tambem', tmb: 'tambem', tbem: 'tambem',
  n: 'nao', ñ: 'nao', nn: 'nao', naum: 'nao', nada: 'nada', nom: 'nao', num: 'nao',
  s: 'sim', ss: 'sim', sss: 'sim', simm: 'sim', aham: 'sim', uhum: 'sim', ahan: 'sim',
  msm: 'mesmo', mt: 'muito', mto: 'muito', mtu: 'muito', mta: 'muita', mts: 'muitos', mtas: 'muitas',
  td: 'tudo', tds: 'todos', tdo: 'tudo', cmg: 'comigo', ctg: 'contigo', kd: 'cade', cade: 'cade',
  blz: 'beleza', vlw: 'valeu', vlww: 'valeu', obg: 'obrigado', obgd: 'obrigado', obgda: 'obrigada', brigado: 'obrigado', brigada: 'obrigada',
  pfv: 'por favor', pfvr: 'por favor', pf: 'por favor', pls: 'por favor', plz: 'por favor', porfavor: 'por favor', porfa: 'por favor',
  hj: 'hoje', hje: 'hoje', amn: 'amanha', amnh: 'amanha', dps: 'depois', dpois: 'depois', agr: 'agora', agra: 'agora',
  qnd: 'quando', qdo: 'quando', qndo: 'quando', qto: 'quanto', qnt: 'quanto', qnto: 'quanto', oq: 'o que', oque: 'o que', pra: 'para', pro: 'para o', pras: 'para as', pros: 'para os',
  mds: 'meu deus', mdss: 'meu deus', tlgd: 'ta ligado', sla: 'sei la', slk: 'sei la', fds: 'fim de semana', bjs: 'beijos', bj: 'beijo', bjo: 'beijo',
  tmj: 'tamo junto', eh: 'e', ta: 'esta', tah: 'esta', to: 'estou', tou: 'estou', tava: 'estava', tamo: 'estamos', tao: 'tao',
  d: 'de', p: 'para', c: 'com', nd: 'nada', ngm: 'ninguem', alg: 'alguem', cm: 'como', dnv: 'de novo', aq: 'aqui', ent: 'entao', entt: 'entao',
  vdd: 'verdade', vdc: 'voce', tlg: 'ta ligado', mn: 'mano', mna: 'mana', vey: 'vei', vei: 'vei', mano: 'mano', blza: 'beleza', fz: 'faz', fzr: 'fazer',
  qr: 'quer', qro: 'quero', qer: 'quer', axo: 'acho', aki: 'aqui', ai: 'ai', iai: 'e ai', eae: 'e ai', eai: 'e ai', salve: 'salve',
  bom: 'bom', bdia: 'bom dia', bnoite: 'boa noite', btarde: 'boa tarde', gnt: 'gente', gnte: 'gente', ngn: 'ninguem',
  min: 'minutos', mins: 'minutos', seg: 'segundos', segs: 'segundos', hr: 'hora', hrs: 'horas',
  nota: 'nota', notinha: 'nota', app: 'app', aplicativo: 'app', config: 'configuracoes', configs: 'configuracoes',
  delete: 'apaga', deleta: 'apaga', deletar: 'apagar', exclui: 'apaga', excluir: 'apagar', exclua: 'apaga', apague: 'apaga',
  abra: 'abre', abri: 'abre', abree: 'abre', crie: 'cria', crea: 'cria', criaa: 'cria', faca: 'faz', faça: 'faz', bota: 'poe', bote: 'poe', coloque: 'coloca', ponha: 'poe',
  procure: 'procura', pesquise: 'pesquisa', busque: 'busca', mostre: 'mostra', mude: 'muda', troque: 'troca', ligue: 'liga', desligue: 'desliga', role: 'rola', jogue: 'joga',
  lembre: 'lembra', lembrar: 'lembrar', anote: 'anota', escreva: 'escreve', toque: 'toque', va: 'vai', vá: 'vai', vamo: 'vamos', bora: 'vamos', simbora: 'vamos embora',
  te: 'te', ti: 'ti', mim: 'mim', anima: 'anima', animinha: 'anima', ani: 'anima',
};

// ------------------------------------------------------------------ emoji e emoticons

export type Marca =
  | 'riso' | 'amor' | 'triste' | 'raiva' | 'medo' | 'tedio' | 'surpresa' | 'grito' | 'pergunta' | 'exclamacao' | 'educado' | 'grosso' | 'vocativo' | 'reticencias';

const EMOJIS: Array<[RegExp, Marca]> = [
  [/[❤♥️]|❤|💕|💖|💗|💓|💞|💘|😍|🥰|😘|😻|🖤|💜|💙|💚|💛|🤍|🤎|♥/u, 'amor'],
  [/😂|🤣|😆|😹|😄|😁|😃|😅/u, 'riso'],
  [/😭|😢|😞|😔|☹|🙁|😿|💔|🥺|😓|😥/u, 'triste'],
  [/😡|🤬|😠|💢|👿/u, 'raiva'],
  [/😨|😰|😱|😧|😟/u, 'medo'],
  [/🙄|😒|🥱|😴|😑|😐/u, 'tedio'],
  [/😮|😯|😲|🤯|😳/u, 'surpresa'],
];
const EMOTICONS: Array<[RegExp, Marca]> = [
  [/(^|\s)(<3+|s2)(?=\s|$)/i, 'amor'],
  [/(^|\s)(:-?\)+|:-?d+|=\)+|\^\^|\(:)(?=\s|$)/i, 'riso'],
  [/(^|\s)(:-?\(+|:'\(|t_t|;_;|=\(+|\):)(?=\s|$)/i, 'triste'],
  [/(^|\s)(>:\(|>:\[)(?=\s|$)/i, 'raiva'],
  [/(^|\s)(-_-|¬¬|:-?\/|:\|)(?=\s|$)/i, 'tedio'],
];

const RISO = /\b(?:k{2,}[a-z]*|(?:ha){2,}h?|(?:he){2,}h?|(?:hi){2,}|(?:hu){2,}|rs(?:rs)+|rsrs|aha(?:ha)+|ahua\w*|huehue\w*|kakaka\w*|lol|lmao|hahah\w*)\b/g;

const EDUCADO = /\b(por favor|por gentileza|se puder|se nao for incomodo|poderia|podia|seria possivel|faz um favor|me faz um favor|obrigad[oa]|valeu|agradeco)\b/;
const GROSSO = /\b(porra|caralho|merda|cacete|krl|crl|pqp|puta que pariu|anda logo|vai logo|faz logo|obedece|ande|desgraca|inutil|burra|idiota|lixo|imbecil|estupida|fdp|vsf|vai se fuder|cala a boca)\b/;
const VOCATIVO = /^(?:(?:ei|oi|ola|hey|psiu|alo|o)\s+)?(?:anima|amor|amorzinho|querida|linda|gata|gatinha|princesa|bebe|meu bem|vida|minha vida|mo|mozao|mozi)\b\s*[,!:.-]?\s*|\s*[,]\s*(?:anima|amor|querida|linda|meu bem|vida|mo|mozao)\s*[.!?]*$/;

// ------------------------------------------------------------------ distância

/** Damerau–Levenshtein (transposição de vizinhas conta 1), com teto: passou do teto, devolve teto + 1. */
export function distancia(a: string, b: string, teto = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  const n = a.length, m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  let cur = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let menor = cur[0];
    for (let j = 1; j <= m; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      cur[j] = v;
      if (v < menor) menor = v;
    }
    if (menor > teto) return teto + 1;
    [prev2, prev, cur] = [prev, cur, prev2];
  }
  return Math.min(prev[m]!, teto + 1);
}

/** Semelhança por trigramas de letras (Jaccard), de 0 a 1. Boa para títulos com palavras trocadas de lugar. */
export function trigramas(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
export function semelhanca(a: string, b: string): number {
  const A = trigramas(a), B = trigramas(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

// ------------------------------------------------------------------ radical (stemmer leve, estilo RSLP)

const SUFIXOS = [
  'amentos', 'imentos', 'amento', 'imento', 'adoras', 'adores', 'acoes', 'icoes', 'mente', 'adora', 'ador', 'acao', 'icao', 'ancia', 'encia',
  'issemos', 'assemos', 'essemos', 'aremos', 'eremos', 'iremos', 'ariam', 'eriam', 'iriam', 'ando', 'endo', 'indo', 'ados', 'idos', 'adas', 'idas',
  'ado', 'ido', 'ada', 'ida', 'ava', 'avam', 'aram', 'eram', 'iram', 'emos', 'amos', 'imos', 'ar', 'er', 'ir', 'ou', 'eu', 'iu', 'am', 'em',
  'oes', 'aes', 'es', 'as', 'os', 'is', 'a', 'e', 'o', 's',
];

/** O radical de uma palavra dobrada ("exportar", "exporta", "exportando" → "export"). Nunca menor que 3 letras. */
export function radical(w: string): string {
  if (w.length <= 4) return w.replace(/s$/, '');
  for (const s of SUFIXOS) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  return w;
}

// ------------------------------------------------------------------ léxico e corretor (SymSpell)

/** Palavras que nunca são corrigidas nem tratadas como erro (curtas, nomes de função). */
const PROTEGIDAS = new Set(['oi', 'ola', 'nao', 'sim', 'que', 'eu', 'tu', 'ele', 'ela', 'nos', 'de', 'da', 'do', 'em', 'no', 'na', 'um', 'uma', 'me', 'te', 'se', 'o', 'a', 'e']);

export class Lexico {
  private freq = new Map<string, number>();
  private deletes = new Map<string, string[]>();
  /** palavras reais que nunca são "consertadas" (mas também não viram sugestão: o índice fica pequeno) */
  private validas = new Set<string>();
  private pronto = false;
  readonly maxDist: number;
  constructor(maxDist = 2) {
    this.maxDist = maxDist;
  }

  get tamanho(): number { return this.freq.size; }
  tem(w: string): boolean { return this.freq.has(w); }
  /** existe (no léxico ou no vocabulário)? */
  conhece(w: string): boolean { return this.freq.has(w) || this.validas.has(w); }

  /** Palavras (já dobradas) que existem e não devem ser corrigidas. */
  reconhecer(palavras: Iterable<string>): void {
    for (const w of palavras) this.validas.add(w);
  }
  frequencia(w: string): number { return this.freq.get(w) ?? 0; }

  /** Acrescenta palavras (texto livre; tudo é dobrado e quebrado em palavras). */
  ensinar(texto: string, peso = 1): void {
    for (const w of dobrar(texto).match(/[a-z]{2,}/g) ?? []) {
      this.freq.set(w, (this.freq.get(w) ?? 0) + peso);
      if (this.pronto) this.indexar(w);
    }
  }

  private indexar(w: string): void {
    for (const d of apagamentos(w, this.maxDist)) {
      const l = this.deletes.get(d);
      if (!l) this.deletes.set(d, [w]);
      else if (!l.includes(w)) l.push(w);
    }
  }

  private montar(): void {
    if (this.pronto) return;
    for (const w of this.freq.keys()) this.indexar(w);
    this.pronto = true;
  }

  /**
   * A melhor correção para uma palavra desconhecida, ou null. Conservador:
   * palavras curtas (< 4) nunca; distância 1 até 6 letras, 2 a partir de 7.
   */
  corrigir(w: string): string | null {
    if (w.length < 4 || this.freq.has(w) || this.validas.has(w) || PROTEGIDAS.has(w) || /\d/.test(w)) return null;
    this.montar();
    const teto = w.length >= 7 ? 2 : 1;
    const vistos = new Set<string>();
    let melhor: string | null = null;
    let melhorD = teto + 1;
    let melhorF = -1;
    for (const d of [w, ...apagamentos(w, teto)]) {
      for (const c of this.deletes.get(d) ?? []) {
        if (vistos.has(c)) continue;
        vistos.add(c);
        const dist = distancia(w, c, teto);
        if (dist > teto) continue;
        // empate: mais frequente; depois, a que começa com a mesma letra
        const f = (this.freq.get(c) ?? 0) * (c[0] === w[0] ? 2 : 1);
        if (dist < melhorD || (dist === melhorD && f > melhorF)) {
          melhor = c;
          melhorD = dist;
          melhorF = f;
        }
      }
    }
    return melhor;
  }
}

/** Todas as versões de `w` com 1..k letras apagadas. */
function apagamentos(w: string, k: number): Set<string> {
  const out = new Set<string>();
  let nivel = [w];
  for (let d = 0; d < k; d++) {
    const prox: string[] = [];
    for (const x of nivel) {
      if (x.length <= 2) continue;
      for (let i = 0; i < x.length; i++) {
        const y = x.slice(0, i) + x.slice(i + 1);
        if (!out.has(y)) {
          out.add(y);
          prox.push(y);
        }
      }
    }
    nivel = prox;
  }
  return out;
}

// ------------------------------------------------------------------ o Texto

export interface Texto {
  /** como a pessoa escreveu (NFC, espaços normalizados) */
  original: string;
  /** o original dobrado letra a letra (mesmo comprimento) */
  alinhado: string;
  /** dobrado, com gírias expandidas, risos e emojis como palavras-marca, correções aplicadas */
  limpo: string;
  tokens: string[];
  marcas: Set<Marca>;
  /** o que o corretor trocou: [como veio, como ficou] */
  correcoes: Array<[string, string]>;
  /** fração de letras maiúsculas (grito quando alta) */
  caixaAlta: number;
}

const ESPACOS = /\s+/g;

/**
 * Normaliza uma mensagem. Com `lexico`, corrige erros de digitação de
 * palavras desconhecidas (nunca as que parecem nomes próprios).
 */
export function normalizar(msg: string, lexico?: Lexico): Texto {
  const original = msg.normalize('NFC').replace(ESPACOS, ' ').trim();
  const alinhado = dobrarAlinhado(original);
  const marcas = new Set<Marca>();

  const letras = original.replace(/[^\p{L}]/gu, '');
  const maiusculas = original.replace(/[^\p{Lu}]/gu, '').length;
  const caixaAlta = letras.length ? maiusculas / letras.length : 0;
  if (letras.length >= 6 && caixaAlta >= 0.7) marcas.add('grito');
  if (/\?\s*$|\?\s*[!.]*\s*$/.test(original) || /^\s*(?:¿)/.test(original)) marcas.add('pergunta');
  if (/!/.test(original)) marcas.add('exclamacao');
  if (/(\.\.\.|…)\s*$/.test(original)) marcas.add('reticencias');

  let s = original;
  for (const [re, mk] of EMOJIS) if (re.test(s)) marcas.add(mk);
  s = s.replace(/\p{Extended_Pictographic}/gu, ' ');
  for (const [re, mk] of EMOTICONS) {
    if (re.test(s)) {
      marcas.add(mk);
      s = s.replace(re, ' ');
    }
  }

  let d = dobrar(s);
  if (RISO.test(d)) marcas.add('riso');
  RISO.lastIndex = 0;
  d = d.replace(RISO, ' ');
  // letras esticadas: "nãooooo" → "nao", "simmm" → "sim", "oiiii" → "oi"
  d = d.replace(/([a-z])\1{2,}/g, '$1').replace(/\b([a-z]*?)([aeiou])\2+\b/g, '$1$2').replace(/\b(sim|oi|ai|ei)m+\b/g, '$1');

  if (EDUCADO.test(d) || /\b(pfv|pfvr|pls|plz|porfa|porfavor|obg|obgd|vlw)\b/.test(d)) marcas.add('educado');
  if (GROSSO.test(d) || /\b(pqp|krl|crl|vsf|fdp)\b/.test(d)) marcas.add('grosso');
  if (VOCATIVO.test(d)) marcas.add('vocativo');

  const brutos = d.match(/[a-z0-9]+(?:[-'][a-z0-9]+)*|[%+*/^=<>-]/g) ?? [];
  const correcoes: Array<[string, string]> = [];
  // palavras que começam com maiúscula no original (fora do começo) parecem nomes: não corrige
  const nomes = new Set<string>();
  for (const m of original.matchAll(/(?<=\s)\p{Lu}\p{Ll}+/gu)) nomes.add(dobrar(m[0]));

  const tokens: string[] = [];
  for (const b of brutos) {
    const g = GIRIAS[b];
    if (g !== undefined) {
      tokens.push(...g.split(' '));
      continue;
    }
    if (lexico && !nomes.has(b)) {
      const c = lexico.corrigir(b);
      if (c) {
        correcoes.push([b, c]);
        tokens.push(...(GIRIAS[c] ?? c).split(' '));
        continue;
      }
    }
    tokens.push(b);
  }
  const extras = [...marcas].filter((m) => m === 'riso' || m === 'amor' || m === 'triste' || m === 'raiva' || m === 'medo' || m === 'tedio');
  const limpo = [...tokens, ...extras.map((m) => `<${m}>`)].join(' ');
  return { original, alinhado, limpo, tokens, marcas, correcoes, caixaAlta };
}

/** Só as palavras (sem as marcas), juntas. */
export const frase = (t: Texto): string => t.tokens.join(' ');
