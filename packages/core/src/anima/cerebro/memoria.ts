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

/** Uma fala dela dentro de um turno: o grupo, o texto e o que ela citou (o vídeo, a música, o fato lembrado). */
export interface Dito {
  g: string;
  t: string;
  ref?: Record<string, string | number>;
  /** terminou em pergunta */
  q?: 1;
}

/**
 * Um turno da conversa (a memória de trabalho do diálogo: dialogo.ts). O dela
 * pode juntar várias falas (resposta + pergunta emendada). `em` = 0 até o
 * próximo turno carimbar a hora (quem guarda a fala não sabe o relógio).
 */
export interface Turno {
  de: 'eu' | 'ela';
  t: string;
  em: number;
  /** intenção (turno da pessoa) */
  i?: string;
  ditos?: Dito[];
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
  /** minutos do dia por categoria de site/app em foco */
  web: { dia: string; minutos: Record<string, number> };
  /** música (Spotify): quantas vezes cada faixa tocou hoje e quantas faixas de cada artista no total */
  musica: { dia: string; faixas: Record<string, number>; artistas: Record<string, number> };
  /**
   * Minecraft: as vezes que ela entrou no jogo com você; o placar dos mobs (dela e seu) e das brincadeiras
   * (esconde-esconde, pega-pega: quem ganhou mais)
   */
  minecraft: { sessoes: number; minutos: number; mortes: number; presentes: number; ultima: number; abates: number; abatesVoce: number; vitorias: number; derrotas: number };
  /** os últimos turnos da conversa, dos dois lados (para "ela quem?", "e você?", "mais uma", "não, eu nunca disse isso") */
  dialogo: Turno[];
  /** a melhor versão: a última vez que a pessoa treinou e quantas vezes ela já cobrou hoje */
  exige: { treinoEm: number; dia: string; treino: number; estudo: number };
}

export const novaMusica = (): MemoriaCerebro['musica'] => ({ dia: '', faixas: {}, artistas: {} });
export const novoMinecraft = (): MemoriaCerebro['minecraft'] => ({ sessoes: 0, minutos: 0, mortes: 0, presentes: 0, ultima: 0, abates: 0, abatesVoce: 0, vitorias: 0, derrotas: 0 });

export const novaMemoriaCerebro = (): MemoriaCerebro => ({
  consciencia: 0, vinculo: 0, pendente: null, ultimoPedido: null, ultimaNota: null, ultimaDecisao: null, ultimaAcao: null, pedidos: [], social: [],
  carinhoEm: 0, declaracaoEm: 0, criseEm: 0, eventosDela: [], escritos: [], estudos: [], quietaAte: 0, capitulo: 0, diaVisto: '', jogos: {}, web: { dia: '', minutos: {} },
  musica: novaMusica(), minecraft: novoMinecraft(), dialogo: [], exige: { treinoEm: 0, dia: '', treino: 0, estudo: 0 },
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
    web: obj(r.web) && typeof r.web.dia === 'string' && obj(r.web.minutos)
      ? { dia: r.web.dia, minutos: Object.fromEntries(Object.entries(r.web.minutos).filter((e): e is [string, number] => typeof e[1] === 'number')) }
      : { dia: '', minutos: {} },
    musica: obj(r.musica) && typeof r.musica.dia === 'string'
      ? { dia: r.musica.dia, faixas: contagens(r.musica.faixas), artistas: contagens(r.musica.artistas) }
      : novaMusica(),
    minecraft: obj(r.minecraft)
      ? { sessoes: num(r.minecraft.sessoes, 0, 0), minutos: num(r.minecraft.minutos, 0, 0), mortes: num(r.minecraft.mortes, 0, 0), presentes: num(r.minecraft.presentes, 0, 0), ultima: num(r.minecraft.ultima, 0),
          abates: num(r.minecraft.abates, 0, 0), abatesVoce: num(r.minecraft.abatesVoce, 0, 0), vitorias: num(r.minecraft.vitorias, 0, 0), derrotas: num(r.minecraft.derrotas, 0, 0) }
      : novoMinecraft(),
    dialogo: arr(r.dialogo, turnoOk, TURNOS),
    exige: obj(r.exige)
      ? { treinoEm: num(r.exige.treinoEm, 0, 0), dia: typeof r.exige.dia === 'string' ? r.exige.dia : '', treino: num(r.exige.treino, 0, 0), estudo: num(r.exige.estudo, 0, 0) }
      : b.exige,
  };
}

/** Quantos turnos a memória de trabalho guarda. */
export const TURNOS = 12;

const ditoOk = (x: unknown): x is Dito => obj(x) && typeof x.g === 'string' && typeof x.t === 'string' && (x.ref === undefined || obj(x.ref));
function turnoOk(x: unknown): x is Turno {
  return obj(x) && (x.de === 'eu' || x.de === 'ela') && typeof x.t === 'string' && typeof x.em === 'number'
    && (x.i === undefined || typeof x.i === 'string') && (x.ditos === undefined || (Array.isArray(x.ditos) && x.ditos.every(ditoOk)));
}

function contagens(v: unknown): Record<string, number> {
  return obj(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === 'number')) : {};
}
