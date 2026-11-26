/*
 * Entidades: os pedaços de informação dentro de um pedido. Qual nota, que
 * horas, quanto tempo, que dado, que tela, que tema, que comando da paleta.
 *
 * Tudo trabalha em cima do texto original (para títulos e textos saírem com
 * acento e maiúscula) usando a versão dobrada alinhada para casar padrões.
 */
import { distancia, dobrar, radical, semelhanca, type Texto } from './texto';
import { numeroExtenso } from './numeros';

// ------------------------------------------------------------------ recorte

/** vocativos no começo e no fim ("ânima,", "amor", "ei mo,") */
const VOC_INI = /^(?:(?:ei|oi|ola|o|hey|psiu|escuta|olha)\s*,?\s+)?(?:anima|amor|amorzinho|querida|linda|gata|princesa|bebe|meu bem|vida|mo|mozao|minha anima)\s*[,:!.-]*\s+|^(?:ei|oi|escuta|olha|entao|tipo|mano|por favor)\s*,?\s+/;
/** o que sobra no fim e não faz parte do pedido */
const CAUDA = /(?:[\s,;.!?…]+|\s+(?:pfv|pfvr|pls|plz|por favor|porfa|pf|obg|obrigad[oa]|ai|aí|pra mim|para mim|rapidinho|agora|ja|logo|amor|anima|ânima|meu bem|vai|porra|caralho|sua doida|kk+|haha+|rs)|\s*:\)|\s*🖤|\s*\p{Extended_Pictographic}+)+$/u;

export interface Recorte {
  /** o que sobrou, no original */
  texto: string;
  /** a mesma coisa dobrada */
  dobrado: string;
}

/**
 * Tira do começo as cabeças (regex ancoradas em ^, no texto dobrado) em
 * sequência, e do fim a cauda. Devolve o meio, no original.
 */
export function recortar(t: Texto, cabecas: RegExp[], caudas: RegExp[] = []): Recorte {
  let o = t.original, d = t.alinhado;
  const corta = (ini: number, fim: number) => {
    o = o.slice(ini, fim);
    d = d.slice(ini, fim);
  };
  const tiraIni = (re: RegExp): boolean => {
    const m = re.exec(d);
    if (!m || m.index !== 0 || !m[0].length) return false;
    corta(m[0].length, d.length);
    return true;
  };
  const tiraFim = (re: RegExp): boolean => {
    const m = re.exec(d);
    if (!m || !m[0].length || m.index + m[0].length !== d.length) return false;
    corta(0, m.index);
    return true;
  };
  const caudaToda = () => {
    for (let k = 0; k < 6; k++) {
      let mudou = tiraFim(CAUDA);
      for (const re of caudas) if (tiraFim(re)) mudou = true;
      if (!mudou) break;
    }
  };
  for (let k = 0; k < 3 && (tiraIni(VOC_INI) || tiraIni(/^\s+/)); k++);
  // a cauda sai antes ("faz uma nota nova pra mim": o "pra mim" não é título)
  caudaToda();
  for (let k = 0; k < 6; k++) {
    let mudou = false;
    for (const re of cabecas) if (tiraIni(re)) mudou = true;
    tiraIni(/^[\s,:;-]+/);
    if (!mudou) break;
  }
  caudaToda();
  return { texto: o.trim(), dobrado: d.trim() };
}

/** Texto entre aspas, se houver ("..." “...” '...' «...»). */
export function citacao(original: string): string | null {
  const m = /["“”«](.+?)["“”»]|'(.{2,}?)'/.exec(original);
  return m ? (m[1] ?? m[2] ?? '').trim() || null : null;
}

// ------------------------------------------------------------------ tempo

/** "25 min", "meia hora", "uma hora e meia", "1h30", "90 segundos" → ms. */
export function duracaoMs(t: Texto): number | null {
  const s = dobrar(t.original);
  let m = /(\d{1,2})\s*h\s*(\d{1,2})\b/.exec(s);
  if (m) return (+m[1]! * 60 + +m[2]!) * 60_000;
  if (/\bpomodoro\b/.test(s) && !/\d|minut|hora|segund/.test(s)) return 25 * 60_000;
  const toks = s.replace(/[^a-z0-9,. ]/g, ' ').split(/\s+/).filter(Boolean);
  let total = 0;
  let achou = false;
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i]!;
    if (w === 'meia' && /^hora/.test(toks[i + 1] ?? '')) {
      total += 30 * 60_000;
      achou = true;
      i++;
      continue;
    }
    const n = numeroExtenso(toks, i);
    if (!n) continue;
    const u = toks[i + n.usados] ?? '';
    const mult = /^(h|hr|hrs|hora|horas)$/.test(u) ? 3_600_000 : /^(min|mins|minuto|minutos|m)$/.test(u) ? 60_000 : /^(s|seg|segs|segundo|segundos)$/.test(u) ? 1000 : 0;
    if (!mult) continue;
    total += n.valor * mult;
    achou = true;
    i += n.usados;
    // "uma hora e meia"
    if (mult === 3_600_000 && toks[i + 1] === 'e' && (toks[i + 2] === 'meia' || toks[i + 2] === 'meio')) {
      total += 30 * 60_000;
      i += 2;
    }
  }
  if (!achou) {
    m = /\b(\d{1,3})\s*(min|m|h|s)\b/.exec(s);
    if (m) return +m[1]! * (m[2] === 'h' ? 3_600_000 : m[2] === 's' ? 1000 : 60_000);
  }
  return achou && total > 0 ? Math.min(total, 24 * 3_600_000) : null;
}

// ------------------------------------------------------------------ dados

/** "d20", "2d6+3", "um d20", "dois dados", "dado de 6", "iniciativa" → fórmula de dado. */
export function formulaDado(t: Texto): string | null {
  const s = dobrar(t.original);
  const m = /\b(\d{0,2})\s*d\s*(\d{1,3}|%)\s*((?:[+-]\s*\d+)?)\s*(vantagem|desvantagem)?/.exec(s);
  if (m) return `${m[1] || '1'}d${m[2]}${m[3]?.replace(/\s/g, '') ?? ''}${m[4] ? ` ${m[4]}` : ''}`;
  const toks = s.split(/\s+/);
  const i = toks.findIndex((w) => /^(d|dado|dados)$/.test(w) || /^d\d+$/.test(w));
  if (i > 0) {
    const n = numeroExtenso(toks, i - 1) ?? numeroExtenso(toks, Math.max(0, i - 2));
    const faces = /dados? de (\d+|\w+)/.exec(s);
    const f = faces ? (numeroExtenso([faces[1]!], 0)?.valor ?? 6) : 6;
    if (n && n.valor >= 1 && n.valor <= 20) return `${n.valor}d${f}`;
  }
  const faces = /\bdado de (\d+|\w+)/.exec(s);
  if (faces) return `1d${numeroExtenso([faces[1]!], 0)?.valor ?? 6}`;
  if (/\biniciativa\b/.test(s)) return '1d20';
  if (/\bdois dados\b/.test(s)) return '2d6';
  return null;
}

// ------------------------------------------------------------------ telas

/** Sinônimos de cada tela do app (o id é o que o comando `ir.<id>` usa). */
export const TELAS: Record<string, string[]> = {
  hoje: ['hoje', 'tela de hoje', 'inicio', 'painel', 'tarefas'],
  notas: ['notas', 'nota', 'editor', 'cofre', 'anotacoes'],
  bancos: ['bancos', 'banco de dados', 'bases', 'tabelas'],
  grafo: ['grafo', 'grafico de notas', 'conexoes', 'mapa de notas'],
  ia: ['ia', 'chat', 'chat da ia', 'claude', 'chatgpt', 'gemini', 'ollama', 'outra ia', 'assistente', 'terminal'],
  lembretes: ['lembretes', 'lembrete', 'avisos'],
  saude: ['saude', 'agua', 'pausas'],
  alimentacao: ['alimentacao', 'comida', 'dieta', 'refeicoes', 'cardapio', 'nutricao', 'compras'],
  exercicios: ['exercicios', 'exercicio', 'treino', 'treinos', 'academia', 'malhar'],
  quadros: ['quadros', 'quadro', 'canvas', 'mapa mental', 'desenho'],
  agenda: ['agenda', 'calendario', 'compromissos', 'eventos'],
  planilhas: ['planilhas', 'planilha', 'excel', 'tabela'],
  calculo: ['calculo', 'calculadora', 'calculos', 'financas', 'contas'],
  flashcards: ['flashcards', 'flashcard', 'cartoes', 'anki', 'revisao'],
  slides: ['slides', 'apresentacao', 'apresentacoes'],
  mundos: ['mundos', 'mundo', 'world building', 'worldbuilding', 'lore', 'universo'],
  mesa: ['mesa', 'mesa de rpg', 'rpg', 'dados', 'fichas', 'campanha'],
  sorte: ['sorte', 'roleta', 'sorteio', 'bola 8'],
  luta: ['luta', 'lutas', 'combate', 'arena'],
  biblioteca: ['biblioteca', 'livros', 'leitura', 'pdf', 'pdfs'],
  arquivos: ['arquivos', 'pastas', 'arquivo'],
  plugins: ['plugins', 'plugin', 'extensoes'],
};

/** A tela citada no texto (a frase mais longa que casar vence). */
export function telaDe(dobrado: string): string | null {
  let melhor: string | null = null;
  let tam = 0;
  for (const [id, sin] of Object.entries(TELAS)) {
    for (const s of sin) {
      if (s.length > tam && new RegExp(`\\b${s}\\b`).test(dobrado)) {
        melhor = id;
        tam = s.length;
      }
    }
  }
  return melhor;
}

// ------------------------------------------------------------------ tema

export type Tema = 'escuro' | 'claro' | 'proximo' | 'estilo';

export function temaDe(dobrado: string): Tema {
  if (/\b(escur\w*|dark|noturn\w*|noite|preto|apaga a luz|muito claro|ta claro|doendo o olho|dói o olho)\b/.test(dobrado) && !/muito escuro|ta escuro/.test(dobrado)) return 'escuro';
  if (/\b(clar\w*|light|diurn\w*|branco|muito escuro|ta escuro|clareia)\b/.test(dobrado)) return 'claro';
  if (/\b(estilo|skin|visual)\b/.test(dobrado)) return 'estilo';
  return 'proximo';
}

// ------------------------------------------------------------------ notas

export interface Candidato { titulo: string; nota: number }

const VAZIAS_TITULO = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'minha', 'meu', 'nota', 'notas', 'sobre', 'aquela', 'aquele', 'uma', 'um', 'e', 'que', 'com', 'na', 'no']);

const palavrasDe = (s: string) => dobrar(s).split(/[^a-z0-9]+/).filter((w) => w && !VAZIAS_TITULO.has(w));

/**
 * As notas que mais parecem com a consulta. Junta três medidas: igualdade
 * (ou contém), palavras em comum (com radical e erro de 1 letra) e trigramas.
 */
export function candidatosNota(consulta: string, titulos: readonly string[], max = 5): Candidato[] {
  const q = dobrar(consulta).trim();
  if (!q) return [];
  const qp = palavrasDe(consulta);
  const out: Candidato[] = [];
  for (const titulo of titulos) {
    const t = dobrar(titulo);
    let nota = 0;
    if (t === q) nota = 1;
    else {
      if (t.includes(q) && q.length >= 3) nota = Math.max(nota, 0.72 + 0.2 * (q.length / t.length));
      else if (q.includes(t) && t.length >= 4) nota = Math.max(nota, 0.66 + 0.2 * (t.length / q.length));
      const tp = palavrasDe(titulo);
      if (qp.length && tp.length) {
        let soma = 0;
        for (const a of qp) {
          let best = 0;
          for (const b of tp) {
            const v = a === b ? 1 : radical(a) === radical(b) ? 0.9 : a.length >= 5 && distancia(a, b, 1) <= 1 ? 0.8 : b.startsWith(a) && a.length >= 3 ? 0.7 : 0;
            if (v > best) best = v;
          }
          soma += best;
        }
        const cobQ = soma / qp.length;
        const cobT = Math.min(1, soma / tp.length);
        nota = Math.max(nota, 0.7 * cobQ + 0.3 * cobT);
      }
      nota = Math.max(nota, semelhanca(q, t) * 0.95);
    }
    if (nota >= 0.45) out.push({ titulo, nota });
  }
  return out.sort((a, b) => b.nota - a.nota || a.titulo.length - b.titulo.length).slice(0, max);
}

/** A consulta é ambígua? (as duas primeiras são boas e quase iguais) */
export const ambiguo = (cs: Candidato[]): boolean => cs.length >= 2 && cs[0]!.nota < 0.99 && cs[0]!.nota - cs[1]!.nota < 0.06 && cs[1]!.nota >= 0.6;

/** "a primeira", "2", "a segunda", "a outra", "a última" → índice na lista (ou -1). */
export function ordinal(dobrado: string, n: number): number {
  const s = dobrado.trim();
  if (/^(a |o )?(primeir[oa]|1|1a|1o|um|uma)\b/.test(s)) return 0;
  if (/^(a |o )?(segund[oa]|2|2a|2o|dois|duas)\b/.test(s)) return 1;
  if (/^(a |o )?(terceir[oa]|3|3a|3o|tres)\b/.test(s)) return 2;
  if (/^(a |o )?(quart[oa]|4)\b/.test(s)) return 3;
  if (/^(a |o )?(ultim[oa]|derradeira)\b/.test(s)) return n - 1;
  if (/^(a |o )?outr[oa]\b/.test(s) && n === 2) return 1;
  return -1;
}

// ------------------------------------------------------------------ comandos da paleta

export interface ComandoApp { id: string; rotulo: string; chaves?: string }

const PARADAS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'pra', 'para', 'por', 'com', 'um', 'uma', 'essa', 'esse', 'isso', 'esta', 'este',
  'me', 'mim', 'eu', 'voce', 'quero', 'preciso', 'faz', 'executa', 'roda', 'aciona', 'usa', 'ativa', 'comando', 'o', 'ai', 'favor', 'pfv', 'anima', 'amor', 'agora', 'da', 'pode', 'consegue']);

const tokensCmd = (s: string) => dobrar(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !PARADAS.has(w));
/** palavras que aparecem em quase todo comando: só contam se forem as únicas */
const GENERICAS = new Set(['nota', 'notas', 'tela', 'abrir', 'abre', 'mostrar', 'mostra', 'novo', 'nova']);

/**
 * O comando da paleta que mais parece com o pedido, com uma nota de 0 a 1.
 * Peso por raridade (IDF): "pdf" diz mais que "nota", que aparece em tudo.
 */
export function casarComando(pedido: string, comandos: readonly ComandoApp[]): { cmd: ComandoApp; nota: number } | null {
  const todos = tokensCmd(pedido);
  const especificos = todos.filter((w) => !GENERICAS.has(w));
  const q = especificos.length ? especificos : todos;
  if (!q.length || !comandos.length) return null;
  const docs = comandos.map((c) => tokensCmd(`${c.rotulo} ${c.chaves ?? ''}`));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d.map(radical))) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + comandos.length / (df.get(radical(w)) ?? 0.5));
  let melhor: { cmd: ComandoApp; nota: number } | null = null;
  comandos.forEach((c, i) => {
    const d = docs[i]!;
    const rot = tokensCmd(c.rotulo);
    let ganho = 0, possivel = 0, cobreRot = 0;
    for (const a of q) {
      const w = idf(a);
      possivel += w;
      let best = 0;
      for (const b of d) {
        const v = a === b ? 1 : radical(a) === radical(b) ? 0.92 : a.length >= 5 && b.length >= 5 && distancia(a, b, 1) <= 1 ? 0.8 : 0;
        if (v > best) best = v;
      }
      ganho += best * w;
    }
    for (const b of rot) if (q.some((a) => a === b || radical(a) === radical(b))) cobreRot++;
    const nota = 0.75 * (ganho / (possivel || 1)) + 0.25 * (rot.length ? cobreRot / rot.length : 0);
    if (!melhor || nota > melhor.nota) melhor = { cmd: c, nota };
  });
  return melhor;
}
