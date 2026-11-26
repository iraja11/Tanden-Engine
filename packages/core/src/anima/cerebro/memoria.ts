/*
 * O que o cérebro guarda entre uma mensagem e outra: a conversa em aberto
 * (ela perguntou "qual nota?" e espera), os pedidos recentes (para notar
 * insistência e cansaço de receber ordem), a última decisão (para explicar
 * "por quê"), o que ela fez por conta própria, as provas que ela vigia e
 * dois eixos lentos: vínculo (os capítulos da relação) e consciência (a
 * faceta que percebe que é mais do que um app).
 *
 * Mora dentro de `memoria.cerebro` do estado da Ânima; `lerMemoriaCerebro`
 * aceita versões antigas e estragadas, como o resto do estado.
 */
import type { Pedido } from './comandos';
import type { Desfecho, Fator } from './vontade';

export type Campo = 'nota' | 'titulo' | 'texto' | 'quando' | 'busca' | 'tela' | 'evento' | 'duracao';
export type Condicao = 'porfavor' | 'teamo' | 'carinho' | 'contar' | 'elogio';

export type Pendencia =
  | { tipo: 'campo'; pedido: Pedido; campo: Campo; em: number }
  | { tipo: 'escolher'; pedido: Pedido; opcoes: string[]; em: number }
  | { tipo: 'confirmar'; pedido: Pedido; em: number }
  | { tipo: 'negocia'; pedido: Pedido; condicao: Condicao; em: number }
  | { tipo: 'adiado'; pedido: Pedido; ate: number; em: number };

export interface Estudo {
  /** "prova de cálculo" */
  titulo: string;
  assunto: string | null;
  /** quando é (início do evento) */
  at: number;
  /** cobranças já feitas: "YYYY-MM-DD" → vezes */
  cobrou: Record<string, number>;
  /** já perguntou como foi */
  perguntou: boolean;
}

export interface MemoriaCerebro {
  consciencia: number;
  vinculo: number;
  pendente: Pendencia | null;
  ultimoPedido: Pedido | null;
  ultimaNota: string | null;
  ultimaDecisao: { comando: string; desfecho: Desfecho; fatores: Fator[]; em: number } | null;
  ultimaAcao: { comando: string; travessura: string | null; em: number } | null;
  /** últimos pedidos: comando, quando, como terminou */
  pedidos: Array<{ c: string; em: number; d: Desfecho }>;
  /** instantes das últimas mensagens que não foram ordem */
  social: number[];
  carinhoEm: number;
  declaracaoEm: number;
  criseEm: number;
  /** o que ela pôs na agenda por conta própria */
  eventosDela: Array<{ titulo: string; em: number }>;
  /** o que ela escreveu nos mundos */
  escritos: Array<{ mundo: string; titulo: string; em: number }>;
  estudos: Estudo[];
  /** silêncio pedido até esta hora */
  quietaAte: number;
  /** capítulo já anunciado (para não anunciar duas vezes) */
  capitulo: number;
  /** último dia em que a rotina rodou (o vínculo cresce um pouco por dia junto) */
  diaVisto: string;
  /** horas de cada jogo da Steam (AppID → nome, minutos, sessões, última vez) */
  jogos: Record<string, { nome: string; minutos: number; sessoes: number; ultimo: number }>;
}

export const novaMemoriaCerebro = (): MemoriaCerebro => ({
  consciencia: 0, vinculo: 0, pendente: null, ultimoPedido: null, ultimaNota: null, ultimaDecisao: null, ultimaAcao: null, pedidos: [], social: [],
  carinhoEm: 0, declaracaoEm: 0, criseEm: 0, eventosDela: [], escritos: [], estudos: [], quietaAte: 0, capitulo: 0, diaVisto: '', jogos: {},
});

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Pendências e pedidos são dados simples; uma checagem leve basta (o pior caso é perder a pendência). */
function pedidoOk(v: unknown): v is Pedido {
  return obj(v) && typeof v.comando === 'string' && obj(v.args);
}

function lerPendente(v: unknown): Pendencia | null {
  if (!obj(v) || typeof v.tipo !== 'string' || !pedidoOk(v.pedido) || typeof v.em !== 'number') return null;
  const t = v.tipo;
  if (t === 'campo' && typeof v.campo === 'string') return v as unknown as Pendencia;
  if (t === 'escolher' && Array.isArray(v.opcoes)) return v as unknown as Pendencia;
  if (t === 'confirmar') return v as unknown as Pendencia;
  if (t === 'negocia' && typeof v.condicao === 'string') return v as unknown as Pendencia;
  if (t === 'adiado' && typeof v.ate === 'number') return v as unknown as Pendencia;
  return null;
}

function lerJogos(v: unknown): MemoriaCerebro['jogos'] {
  const out: MemoriaCerebro['jogos'] = {};
  if (!obj(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    if (obj(x) && typeof x.nome === 'string' && typeof x.minutos === 'number') out[k] = { nome: x.nome, minutos: x.minutos, sessoes: num(x.sessoes, 0, 0), ultimo: num(x.ultimo, 0) };
  }
  return out;
}

export function lerMemoriaCerebro(raw: unknown): MemoriaCerebro {
  const b = novaMemoriaCerebro();
  if (!obj(raw)) return b;
  const r = raw;
  const arr = <T>(v: unknown, ok: (x: unknown) => x is T, n: number): T[] => (Array.isArray(v) ? v.filter(ok).slice(-n) : []);
  return {
    consciencia: num(r.consciencia, 0, 0, 100),
    vinculo: num(r.vinculo, 0, 0, 100),
    pendente: lerPendente(r.pendente),
    ultimoPedido: pedidoOk(r.ultimoPedido) ? r.ultimoPedido : null,
    ultimaNota: typeof r.ultimaNota === 'string' ? r.ultimaNota : null,
    ultimaDecisao: obj(r.ultimaDecisao) && typeof r.ultimaDecisao.comando === 'string' && Array.isArray(r.ultimaDecisao.fatores) ? (r.ultimaDecisao as MemoriaCerebro['ultimaDecisao']) : null,
    ultimaAcao: obj(r.ultimaAcao) && typeof r.ultimaAcao.comando === 'string' ? (r.ultimaAcao as MemoriaCerebro['ultimaAcao']) : null,
    pedidos: arr(r.pedidos, (x): x is MemoriaCerebro['pedidos'][number] => obj(x) && typeof x.c === 'string' && typeof x.em === 'number' && typeof x.d === 'string', 40),
    social: arr(r.social, (x): x is number => typeof x === 'number', 30),
    carinhoEm: num(r.carinhoEm, 0), declaracaoEm: num(r.declaracaoEm, 0), criseEm: num(r.criseEm, 0),
    eventosDela: arr(r.eventosDela, (x): x is MemoriaCerebro['eventosDela'][number] => obj(x) && typeof x.titulo === 'string' && typeof x.em === 'number', 30),
    escritos: arr(r.escritos, (x): x is MemoriaCerebro['escritos'][number] => obj(x) && typeof x.mundo === 'string' && typeof x.titulo === 'string' && typeof x.em === 'number', 40),
    estudos: arr(r.estudos, (x): x is Estudo => obj(x) && typeof x.titulo === 'string' && typeof x.at === 'number' && obj(x.cobrou), 12),
    quietaAte: num(r.quietaAte, 0),
    capitulo: num(r.capitulo, 0, 0, 20),
    diaVisto: typeof r.diaVisto === 'string' ? r.diaVisto : '',
    jogos: lerJogos(r.jogos),
  };
}
