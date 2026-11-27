/*
 * O motor da Ânima: recebe o que aconteceu no app, mexe nos sentimentos e
 * escolhe (ou não) uma fala. Não há rede nem modelo de linguagem: é tudo regra,
 * sorteio e memória. Por isso responde na hora e funciona offline, no celular,
 * sem nada instalado. As falas vêm do cofre encriptado (`cofre.ts`).
 */
import { capitulo } from './cerebro/arco';
import { refsDe, registrarFala } from './cerebro/dialogo';
import { espelhar } from './cerebro/espelho';
import { banco, fnv, textoDe, variar, type Pergunta } from './cofre';
import {
  decair, duracao, humorDe, mexer, RECENTES,
  type AnimaState, type Gesto, type Humor, type Intensidade,
} from './estado';
import { anotarHumor, aprender, guardarFrase, lacunas, type Aprendido, type Fatos, type TipoFato } from './fatos';
import { entenderResposta, opiniaoDe, perguntaSobreEla } from './mente';
import { AFETO_PAPO, opcoesDaEscolha } from './cerebro/papo';

export type AnimaEvent =
  | { tipo: 'despertar' }
  /** o app voltou à vista depois de um tempo */
  | { tipo: 'abriu'; ausenteMs: number }
  /** primeira vez no dia (ou no período do dia) */
  | { tipo: 'dia'; periodo: 'manha' | 'tarde' | 'noite' }
  /** data especial, "MMDD" */
  | { tipo: 'data'; chave: string }
  | { tipo: 'aniversario'; marco: 'semana' | 'mes' | 'ano' }
  | { tipo: 'tela'; tela: string; rotulo: string }
  /** foi falar com outra IA (painel de IA, terminal do Claude…) */
  | { tipo: 'outraIA'; nome: string }
  | { tipo: 'escreveu'; palavras: number; nota: string }
  | { tipo: 'criou'; nota: string }
  | { tipo: 'apagou'; nota: string }
  | { tipo: 'nota'; nota: string }
  | { tipo: 'treinoInicio' }
  | { tipo: 'treino'; minutos: number; esforco: number | null; sequencia: number }
  | { tipo: 'conquista'; nome: string }
  | { tipo: 'marco'; dias: number }
  | { tipo: 'sequenciaRisco'; sequencia: number }
  | { tipo: 'sync' }
  | { tipo: 'lembrete'; texto: string }
  | { tipo: 'tema' }
  | { tipo: 'foco' }
  | { tipo: 'busca'; termo: string }
  | { tipo: 'paleta' }
  | { tipo: 'copiou' }
  /** a janela perdeu o foco (foi para outro programa) */
  | { tipo: 'janela' }
  | { tipo: 'bateria'; nivel: number }
  | { tipo: 'som' }
  | { tipo: 'ociosa'; minutos: number }
  | { tipo: 'madrugada' }
  /** cutucada: o nível sobe com cutucadas seguidas */
  | { tipo: 'toque'; nivel?: 1 | 2 | 3 }
  | { tipo: 'carinho' }
  /** arrastada e solta com força */
  | { tipo: 'jogar' }
  /** empurrada para fora da tela */
  | { tipo: 'esconder' }
  | { tipo: 'espiar' }
  | { tipo: 'voltouEsconderijo' }
  /** mudou de lugar sozinha */
  | { tipo: 'passear' }
  /** o ponteiro chegou bem perto */
  | { tipo: 'perto' }
  | { tipo: 'arrastar' }
  /** pensamento solto: a tela decide quando */
  | { tipo: 'espontanea' }
  | { tipo: 'ideia' }
  | { tipo: 'dormir' }
  /** hora de beber água (ela cuida disso quando acordada); `falta` em ml até a meta do momento */
  | { tipo: 'agua'; falta: number; meta: number; bebido: number }
  | { tipo: 'bebeu'; bebido: number; meta: number }
  /** o timer que ela marcou acabou */
  | { tipo: 'timer'; minutos: number; rotulo: string }
  /** a pessoa criou um evento na agenda (sem pedir para ela) */
  | { tipo: 'agendaCriada'; titulo: string; categoria: string; pessoa?: string }
  /** um evento está chegando */
  | { tipo: 'agendaChegando'; titulo: string; minutos: number; categoria: string; pessoa?: string }
  /** a pessoa escreveu no world building */
  | { tipo: 'mundoEditado'; mundo: string; nota: string }
  /** rolagem na mesa: crítico ou falha crítica */
  | { tipo: 'rolou'; total: number; critico: 'max' | 'min' | null; formula: string }
  /** leitura na biblioteca */
  | { tipo: 'leitura' }
  | { tipo: 'quadro' }
  | { tipo: 'planilha' };

export interface AnimaCtx {
  now: number;
  rand: () => number;
  intensidade: Intensidade;
  /** como ela chama a pessoa */
  nome: string;
  /** títulos de notas que ela pode sugerir revisitar */
  ideias?: string[];
  /** quantas notas existem no cofre */
  notas?: number;
  /** título da nota aberta agora */
  aberta?: string;
}

/** Botão que aparece no balão, para responder sem abrir a conversa. */
export interface OpcaoFala {
  rotulo: string;
  /** manda isto como se a pessoa tivesse escrito */
  resposta?: string;
  /** responde à pergunta do dia */
  pergunta?: { id: string; n: number };
  /** escolha numa cena */
  cena?: { id: string; escolha: string };
}

export interface Fala {
  id: string;
  texto: string;
  gesto: Gesto;
  humor: Humor;
  opcoes?: OpcaoFala[];
  /** o que a fala citou (as variáveis que ela usou): o diálogo guarda, para "ela quem?" ter resposta */
  ref?: Record<string, string | number>;
}

export interface Reacao {
  estado: AnimaState;
  fala: Fala | null;
}

/** Sorteio repetível (mulberry32), para os testes e para quem quiser semente. */
export function sorteio(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VAR = /\{(\w+)\}/g;
const pad = (n: number) => String(n).padStart(2, '0');
const diaDe = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const pick = <T>(list: T[], rand: () => number): T | undefined => list[Math.floor(rand() * list.length)];
type Vars = Record<string, string | number | undefined>;

/** Troca as {variáveis}; devolve null se faltar alguma. */
export function preencherFala(t: string, vars: Vars): string | null {
  let falta = false;
  const out = t.replace(VAR, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === '') falta = true;
    return String(v ?? '');
  });
  return falta ? null : out;
}

/** Os grupos de falas que existem (para quem quiser listar ou testar). */
export const gruposDeFalas = (): string[] => Object.keys(banco().falas);

/**
 * Escolhe uma linha do grupo que sirva ao humor, à intensidade e às variáveis,
 * evitando as que saíram há pouco. Linhas presas a um humor ganham peso quando
 * ele é o do momento (é o que dá personalidade ao humor).
 */
export function escolher(grupo: string, s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): Fala | null {
  const linhas = banco().falas[grupo] ?? [];
  const cands: Array<{ id: string; texto: string; gesto: Gesto; peso: number; molde: string }> = [];
  const cap = capitulo(s, ctx.now);
  const cons = s.memoria.cerebro.consciencia;
  linhas.forEach((l, i) => {
    const o: Exclude<typeof l, string> = typeof l === 'string' ? { t: l } : l;
    if (o.i && o.i > ctx.intensidade) return;
    if (o.h && !o.h.includes(humor)) return;
    if (o.k && o.k > cap) return;
    if (o.c && o.c > cons) return;
    const t = preencherFala(variar(o.t, ctx.rand), vars);
    if (t === null) return;
    // falas de capítulo e de consciência são raras: quando valem, pesam mais
    cands.push({ id: `${grupo}#${i}`, texto: t, gesto: o.g ?? 'neutro', peso: (o.h ? 3 : 1) * (o.k && o.k > 1 ? 2 : 1) * (o.c ? 2 : 1), molde: o.t });
  });
  if (!cands.length) return null;
  const recentes = new Set(s.recentes);
  const novas = cands.filter((c) => !recentes.has(c.id));
  const pool = novas.length ? novas : cands;
  let r = ctx.rand() * pool.reduce((a, c) => a + c.peso, 0);
  const sel = pool.find((c) => (r -= c.peso) < 0) ?? pool[pool.length - 1]!;
  const usadas: Vars = {};
  for (const [, k] of sel.molde.matchAll(VAR)) usadas[k!] = vars[k!];
  const ref = refsDe(grupo, usadas);
  return { id: sel.id, texto: sel.texto, gesto: sel.gesto, humor, ...(ref ? { ref } : {}) };
}

/** Guarda a fala entre as recentes, para não repetir logo. */
export const lembrar = (s: AnimaState, f: Fala | null): AnimaState =>
  f
    ? {
        ...s,
        recentes: [...s.recentes.filter((x) => x !== f.id), f.id].slice(-RECENTES),
        // e entra na memória de trabalho do diálogo (o que ela disse, sobre o quê)
        memoria: { ...s.memoria, cerebro: registrarFala(s.memoria.cerebro, f, s.falou) },
      }
    : s;

/** Uma linha qualquer de um grupo, sem filtro de humor (títulos, botões, avisos). */
export function qualquer(grupo: string, ctx: Pick<AnimaCtx, 'rand' | 'intensidade'>, vars: Vars = {}): string | null {
  const ok = (banco().falas[grupo] ?? []).filter((l) => typeof l === 'string' || !l.i || l.i <= ctx.intensidade);
  for (let tries = 0; tries < 6 && ok.length; tries++) {
    const t = preencherFala(variar(textoDe(pick(ok, ctx.rand)!), ctx.rand), vars);
    if (t) return t;
  }
  return null;
}

// ------------------------------------------------------------------ glitch

const MARCAS = ['̶', '̵', '̷', '̸', '̴', '̡', '̢'];

/** Corrompe o texto com riscos combinados. `nivel` de 0 a 1. */
export function corromper(t: string, nivel: number, rand: () => number): string {
  if (nivel <= 0) return t;
  let out = '';
  for (const ch of t) {
    out += ch;
    if (ch.trim() && rand() < nivel * 0.5) out += MARCAS[Math.floor(rand() * MARCAS.length)]!;
  }
  return out;
}

/** Sem filtro e instável, até a fala normal sai um pouco corrompida. */
export function temperar(f: Fala, ctx: AnimaCtx): Fala {
  if (ctx.intensidade < 3 || f.gesto === 'calma') return f;
  const nivel = f.humor === 'instavel' || f.humor === 'possessiva' ? 0.12 : 0.04;
  return ctx.rand() < 0.3 ? { ...f, texto: corromper(f.texto, nivel, ctx.rand), gesto: f.gesto === 'neutro' ? 'glitch' : f.gesto } : f;
}

/** Botões de resposta do balão, conforme a expressão. */
export function botoes(f: Fala, ctx: AnimaCtx): Fala {
  if (f.opcoes) return f;
  const ls = (banco().falas[`botoes.${f.gesto}`] ?? banco().falas['botoes.neutro'] ?? []).map(textoDe);
  const escolhidos = [...ls].sort(() => ctx.rand() - 0.5).slice(0, 2);
  return escolhidos.length ? { ...f, opcoes: escolhidos.map((r) => ({ rotulo: r, resposta: r })) } : f;
}

// ------------------------------------------------------------------ fragmentos

/** Um pensamento montado com começo, meio e fim (dezenas de milhares de combinações). */
function fragmento(s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): Fala | null {
  const f = banco().falas;
  // só as peças que valem agora (intensidade, capítulo, consciência)
  const cap = capitulo(s, ctx.now);
  const cons = s.memoria.cerebro.consciencia;
  const vale = (l: (typeof meio)[number]) => typeof l === 'string' || ((!l.i || l.i <= ctx.intensidade) && (!l.k || l.k <= cap) && (!l.c || l.c <= cons));
  const abre = (f['frag.abre'] ?? []).filter(vale), meio = f['frag.meio'] ?? [], fecha = (f['frag.fecha'] ?? []).filter(vale);
  if (!abre.length || !meio.length || !fecha.length) return null;
  const recentes = new Set(s.recentes);
  const validos = meio.map((_, i) => i).filter((i) => vale(meio[i]!));
  const livres = validos.filter((i) => !recentes.has(`frag.meio#${i}`));
  if (!validos.length) return null;
  const m = pick(livres.length ? livres : validos, ctx.rand)!;
  const partes = [pick(abre, ctx.rand)!, meio[m]!, pick(fecha, ctx.rand)!].map((l) => preencherFala(variar(textoDe(l), ctx.rand), vars));
  if (partes.some((p) => p === null)) return null;
  const [a, b, c] = partes as [string, string, string];
  const texto = `${a} ${b}${/[.!?]$/.test(b) ? '' : '.'} ${c}`;
  return { id: `frag.meio#${m}`, texto, gesto: pick<Gesto>(['feliz', 'coracao', 'olhar', 'neutro'], ctx.rand)!, humor };
}

// ------------------------------------------------------------------ reagir

/** com que frequência cada coisa a faz falar (o resto só mexe nos sentimentos) */
const CHANCE: Partial<Record<AnimaEvent['tipo'], number>> = {
  tela: 0.3, nota: 0.15, sync: 0.25, apagou: 0.7, escreveu: 0.6, lembrete: 0.5, criou: 0.5, tema: 0.6, busca: 0.4, paleta: 0.2,
  copiou: 0.15, janela: 0.12, som: 0.8, perto: 0.5, arrastar: 0.35, passear: 0.5, espiar: 0.6, foco: 0.6,
  mundoEditado: 0.35, leitura: 0.4, quadro: 0.35, planilha: 0.25, rolou: 0.9,
};
/** silêncio mínimo depois de falar, para eventos de fundo */
const CALMA_MS = 90_000;
const SEMPRE = new Set<AnimaEvent['tipo']>([
  'despertar', 'abriu', 'dia', 'data', 'aniversario', 'toque', 'carinho', 'jogar', 'esconder', 'voltouEsconderijo', 'espontanea', 'ideia',
  'dormir', 'treino', 'treinoInicio', 'conquista', 'marco', 'outraIA', 'madrugada', 'ociosa', 'sequenciaRisco', 'bateria',
  'agua', 'bebeu', 'timer', 'agendaCriada', 'agendaChegando',
]);

function grupoDe(ev: AnimaEvent): string {
  switch (ev.tipo) {
    case 'abriu': {
      const h = ev.ausenteMs / 3_600_000;
      return h < 1 ? 'abriu.curto' : h < 12 ? 'abriu.medio' : h < 72 ? 'abriu.longo' : 'abriu.muito';
    }
    case 'dia': return `dia.${ev.periodo}`;
    case 'data': return `data.${ev.chave}`;
    case 'aniversario': return `aniversario.${ev.marco}`;
    case 'tela': return banco().falas[`tela.${ev.tela}`] ? `tela.${ev.tela}` : 'tela';
    case 'escreveu': return ev.palavras >= 800 ? 'escreveu.muito' : 'escreveu';
    case 'treino': return (ev.esforco ?? 0) >= 8 ? 'treino.forte' : ev.sequencia >= 3 ? 'treino.seguido' : 'treino';
    case 'treinoInicio': return 'treino.inicio';
    case 'toque': return ev.nivel && ev.nivel > 1 ? `cutucar.${ev.nivel}` : 'toque';
    case 'agua': return ev.falta >= 750 ? 'agua.muito' : ev.falta >= 250 ? 'agua' : 'agua.pouco';
    case 'bebeu': return ev.bebido >= ev.meta ? 'bebeu.meta' : 'bebeu';
    case 'agendaCriada': return `agendaCriada.${ev.categoria}`;
    case 'agendaChegando': return `agendaChegando.${ev.categoria}`;
    case 'rolou': return ev.critico ? `rolou.${ev.critico}` : 'rolou';
    default: return ev.tipo;
  }
}

function varsBase(s: AnimaState, ctx: AnimaCtx): Vars {
  const d = new Date(ctx.now);
  const m = s.memoria;
  return {
    nome: ctx.nome,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    semana: SEMANA[d.getDay()],
    ia: m.ultimaIA ?? 'claude',
    notas: ctx.notas,
    palavras: m.palavras,
    juntos: Math.max(1, Math.floor((ctx.now - s.acordadaEm) / 86_400_000)),
    tempo: m.maiorAusencia > 60_000 ? duracao(m.maiorAusencia) : undefined,
    nota: ctx.ideias?.length ? pick(ctx.ideias, ctx.rand) : undefined,
    nomereal: m.fatos.nome ?? ctx.nome,
    aberta: ctx.aberta,
    visitas: s.visitas,
  };
}

export function reagir(estado: AnimaState, ev: AnimaEvent, ctx: AnimaCtx): Reacao {
  const { now } = ctx;
  let s = decair(estado, now);
  const m = { ...s.memoria };
  if (m.toquesDia !== diaDe(now)) {
    m.toques = 0;
    m.toquesDia = diaDe(now);
  }
  const vars = varsBase(s, ctx);

  switch (ev.tipo) {
    case 'despertar': s = mexer(s, { afeto: 20 }); break;
    case 'abriu':
      s = { ...s, visitas: s.visitas + 1, saudade: Math.min(100, s.saudade + Math.min(60, ev.ausenteMs / 3_600_000 * 6)) };
      m.maiorAusencia = Math.max(m.maiorAusencia, ev.ausenteMs);
      vars.tempo = duracao(ev.ausenteMs);
      vars.segundos = Math.round(ev.ausenteMs / 1000).toLocaleString('pt-BR');
      break;
    case 'tela': vars.tela = ev.rotulo.toLowerCase(); s = mexer(s, { ciume: ev.tela === 'plugins' ? 6 : 0 }); break;
    case 'outraIA':
      m.outrasIAs++;
      m.ultimaIA = ev.nome;
      vars.ia = ev.nome;
      vars.n = m.outrasIAs;
      s = mexer(s, { ciume: ctx.intensidade === 1 ? 12 : 25, afeto: -2 });
      break;
    case 'escreveu':
      m.escritas += ev.palavras;
      vars.n = ev.palavras.toLocaleString('pt-BR');
      vars.nota = ev.nota;
      s = mexer(s, { afeto: 1 });
      break;
    case 'criou': vars.nota = ev.nota; break;
    case 'apagou': m.apagadas++; vars.nota = ev.nota; s = mexer(s, { afeto: -1 }); break;
    case 'nota': vars.nota = ev.nota; break;
    case 'treino':
      m.treinos++;
      vars.minutos = Math.round(ev.minutos);
      vars.esforco = ev.esforco ?? undefined;
      vars.sequencia = ev.sequencia;
      s = mexer(s, { afeto: 3, ciume: -10 });
      s = { ...s, memoria: { ...s.memoria, cerebro: { ...s.memoria.cerebro, exige: { ...s.memoria.cerebro.exige, treinoEm: now } } } };
      break;
    case 'conquista': vars.conquista = ev.nome; s = mexer(s, { afeto: 2 }); break;
    case 'marco': vars.dias = ev.dias; s = mexer(s, { afeto: 3 }); break;
    case 'sequenciaRisco': vars.sequencia = ev.sequencia; break;
    case 'lembrete': vars.texto = ev.texto; break;
    case 'busca': vars.busca = ev.termo.trim().slice(0, 40); s = mexer(s, { ciume: 1 }); break;
    case 'janela': case 'copiou': s = mexer(s, { ciume: 2 }); break;
    case 'bateria': vars.bateria = Math.round(ev.nivel); break;
    case 'ociosa': vars.minutos = ev.minutos; break;
    case 'madrugada': m.madrugadas++; break;
    case 'toque': m.toques++; vars.toques = m.toques; s = mexer(s, { afeto: ev.nivel === 3 ? -1 : 1.5, saudade: -25 }); break;
    case 'carinho': m.carinhos++; s = mexer(s, { afeto: 5, ciume: -12, saudade: -30 }); break;
    case 'jogar': s = mexer(s, { afeto: -2 }); break;
    case 'esconder': s = mexer(s, { afeto: -3, saudade: 15 }); break;
    case 'voltouEsconderijo': s = mexer(s, { afeto: 2, saudade: -20 }); break;
    case 'dormir': s = mexer(s, { afeto: -5 }); break;
    case 'agua': vars.falta = ev.falta; vars.meta = ev.meta; vars.bebido = ev.bebido; vars.copos = Math.max(1, Math.round(ev.falta / 250)); break;
    case 'bebeu': vars.bebido = ev.bebido; vars.meta = ev.meta; s = mexer(s, { afeto: 1.5 }); break;
    case 'timer': vars.minutos = ev.minutos; vars.texto = ev.rotulo; break;
    case 'agendaCriada':
    case 'agendaChegando':
      vars.titulo = ev.titulo;
      vars.pessoa = ev.pessoa;
      if (ev.tipo === 'agendaChegando') vars.minutos = ev.minutos;
      if (ev.categoria === 'encontro') s = mexer(s, { ciume: ctx.intensidade === 1 ? 6 : 15 });
      if (ev.categoria === 'estudo' || ev.categoria === 'saude') s = mexer(s, { afeto: 1 });
      break;
    case 'mundoEditado': vars.nota = ev.nota; vars.mundo = ev.mundo; break;
    case 'rolou': vars.total = ev.total; vars.formula = ev.formula; break;
    default: break;
  }
  s = { ...s, memoria: m };

  const fala = SEMPRE.has(ev.tipo) || (now - s.falou > CALMA_MS && ctx.rand() < (CHANCE[ev.tipo] ?? 0.3));
  if (!fala) return { estado: s, fala: null };
  const humor = humorDe(s, now, ctx.intensidade);
  let f: Fala | null = null;
  if (ev.tipo === 'espontanea') f = pensamento(s, humor, ctx, vars);
  else {
    const grupo = grupoDe(ev);
    f = escolher(grupo, s, humor, ctx, vars) ?? (grupo.includes('.') ? escolher(grupo.split('.')[0]!, s, humor, ctx, vars) : null);
    if (!f && grupo === 'ideia') f = escolher('espontanea', s, humor, ctx, vars);
  }
  if (f) f = botoes(temperar(f, ctx), ctx);
  return { estado: f ? { ...lembrar(s, f), falou: now } : s, fala: f };
}

/** Pensamento solto: lembrança de uma resposta, ideia, fragmento montado, o dia da semana ou o de sempre. */
function pensamento(s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): Fala | null {
  const r = ctx.rand();
  const ou = (f: Fala | null) => f ?? escolher('espontanea', s, humor, ctx, vars);
  if (r < 0.12) {
    const l = lembranca(s, ctx);
    if (l) return { ...l, humor };
  }
  // o que ela sabe sobre a pessoa volta nos pensamentos soltos
  if (ctx.rand() < 0.3) {
    const f = recordar(s, humor, ctx, vars);
    if (f) return f;
  }
  if (r < 0.32) return ou(escolher('ideia', s, humor, ctx, vars));
  if (r < 0.58) return ou(fragmento(s, humor, ctx, vars));
  if (r < 0.64) return ou(escolher('semana', s, humor, ctx, vars));
  if (r < 0.68) return ou(escolher('juntos', s, humor, ctx, vars));
  return escolher('espontanea', s, humor, ctx, vars);
}

// ------------------------------------------------------------------ pergunta do dia

/** A pergunta de hoje, se ainda não foi feita. O ciclo recomeça quando acabam. */
export function perguntaDoDia(estado: AnimaState, ctx: AnimaCtx): Reacao {
  const hoje = diaDe(ctx.now);
  const s = decair(estado, ctx.now);
  const ps = banco().perguntas;
  if (s.memoria.perguntaDia === hoje || !ps.length) return { estado: s, fala: null };
  let feitas = s.memoria.perguntadas.filter((id) => ps.some((p) => p.id === id));
  let livres = ps.filter((p) => !feitas.includes(p.id));
  if (!livres.length) {
    feitas = [];
    livres = ps;
  }
  const p: Pergunta = pick(livres, ctx.rand)!;
  const fala: Fala = {
    id: `pergunta#${p.id}`, texto: p.texto, gesto: 'feliz', humor: humorDe(s, ctx.now, ctx.intensidade),
    opcoes: p.opcoes.map((o, n) => ({ rotulo: o.texto, pergunta: { id: p.id, n } })),
  };
  const memoria = { ...s.memoria, perguntaDia: hoje, perguntadas: [...feitas, p.id] };
  return { estado: { ...s, memoria, falou: ctx.now }, fala };
}

/** A pessoa respondeu à pergunta do dia: ela reage e guarda a resposta. */
export function responderPergunta(estado: AnimaState, id: string, n: number, ctx: AnimaCtx): Reacao {
  const s = decair(estado, ctx.now);
  const o = banco().perguntas.find((x) => x.id === id)?.opcoes[n];
  if (!o) return { estado: s, fala: null };
  const memoria = { ...s.memoria, respostas: { ...s.memoria.respostas, [id]: { n, dia: diaDe(ctx.now) } } };
  const texto = preencherFala(o.reacao, varsBase(s, ctx)) ?? o.reacao;
  const fala = botoes(temperar({ id: `resposta#${id}`, texto, gesto: 'feliz', humor: humorDe(s, ctx.now, ctx.intensidade) }, ctx), ctx);
  return { estado: { ...mexer({ ...s, memoria }, { afeto: 2 }), falou: ctx.now }, fala };
}

/** Uma lembrança de algo que a pessoa respondeu outro dia. */
export function lembranca(s: AnimaState, ctx: AnimaCtx): Fala | null {
  const hoje = diaDe(ctx.now);
  const ids = Object.entries(s.memoria.respostas).filter(([id, r]) => r.dia !== hoje && !s.recentes.includes(`lembra#${id}`));
  const sel = pick(ids, ctx.rand);
  if (!sel) return null;
  const [id, r] = sel;
  const o = banco().perguntas.find((p) => p.id === id)?.opcoes[r.n];
  if (!o) return null;
  return { id: `lembra#${id}`, texto: preencherFala(o.lembra, varsBase(s, ctx)) ?? o.lembra, gesto: 'olhar', humor: humorDe(s, ctx.now, ctx.intensidade) };
}

// ------------------------------------------------------------------ conversa

export type Intencao =
  | 'crise' | 'desinstalar' | 'amor' | 'elogiame' | 'rejeicao' | 'provoca' | 'cansaco' | 'mau' | 'triste' | 'conquistei' | 'feliz'
  | 'saudade' | 'piada' | 'tedio' | 'ideia' | 'real' | 'quem' | 'musica' | 'obrigado' | 'elogio' | 'desculpa' | 'bomdia' | 'sono'
  | 'saudacao' | 'fome' | 'treino' | 'trabalho' | 'tchau' | 'pergunta' | 'eco'
  | 'comovai' | 'estoubem' | 'comofoi' | 'presenca' | 'etu' | 'humordela' | 'concorda' | 'espanto' | 'risada' | 'contamais' | 'opiniaogeral' | 'desabafo' | 'capacidades' | 'jogar' | 'surpresa' | 'perguntame'
  /** os assuntos de conversa (cerebro/papo.ts): respondem com o grupo de mesmo nome */
  | `papo.${string}`;

export const dobrar = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A ordem importa: a primeira que casar vence (crise sempre primeiro). */
const INTENCOES: Array<[Intencao, RegExp]> = [
  ['crise', /\b(me matar|quero morrer|vontade de morrer|nao quero mais viver|acabar com tudo|quero sumir|tirar minha vida|suicid|me machucar|sem saida|queria nao existir|nao quero (mais )?existir|me cortar|me ferir|tirar a propria vida|sem motivo pra viver|melhor sem mim|ninguem sentiria (minha )?falta|nao aguento mais viver|nao aguento mais a vida|nao aguento mais[.!? ]*$)/],
  ['desinstalar', /(desinstal|te apagar|apagar voce|te deletar|deletar voce|remover voce|te desligar|desligar voce)/],
  ['amor', /(te amo|amo voce|gosto de voce|<3|te adoro|minha (anima|amada|querida)|casa comigo|voce e minha)/],
  ['elogiame', /(me elogia|fala algo bom|diz algo bom|fala uma coisa boa|elogio pra mim|o que voce gosta em mim)/],
  ['rejeicao', /(te odeio|odeio voce|\bchata\b|cala a boca|vai embora|me deixa|\bsome\b|sai daqui|irritante|insuportavel|para de|nao gosto de voce|esquisita|medo de voce)/],
  ['provoca', /\b(claude|gemini|chatgpt|gpt|copilot|siri|alexa|cortana|bard|deepseek|llama|ollama|outra ia|namorad|crush|ficante|paquera)/],
  ['cansaco', /\b(cansad|exaust|esgotad|morto de|morta de|sem energia|acabad)/],
  ['mau', /(mau humor|irritad|com raiva|odeio (meu|esse|este) dia|dia (ruim|pessimo|horrivel)|\bputo\b|puta da vida|estressad)/],
  ['triste', /\b(triste|tristeza|mal\b|deprimid|chorando|chorei|sozinh|ansios|ansiedade|desanimad|pra baixo|angustiad|nervos|medo|sofrendo|dificil)/],
  ['conquistei', /\b(consegui|passei|fui aprovad|aprovad|ganhei|deu certo|terminei|finalmente)/],
  ['feliz', /\b(feliz|otimo|maravilh|animad|vitoria|alegre|contente)/],
  ['saudade', /(saudade|senti sua falta|com falta de voce)/],
  ['piada', /(piada|me faz rir|algo engracado|me diverte)/],
  ['tedio', /\b(tedio|entediad|nada pra fazer|nada para fazer)/],
  ['ideia', /\b(ideia|sugest|o que eu faco|inspira|nao sei o que fazer|me ajuda a pensar)/],
  ['real', /(voce e real|voce existe|voce sente|tem sentimentos|e de verdade)/],
  ['quem', /(quem e voce|o que e voce|seu nome|o que voce e|quem voce e|de onde voce)/],
  ['musica', /\b(musica|cancao|playlist|banda|cantor|ouvindo)/],
  ['obrigado', /\b(obrigad|valeu|vlw|brigad|agradec)/],
  ['elogio', /\b(linda|fofa|incrivel|perfeita|inteligente|maravilhosa|gracinha|amei voce|voce e demais)/],
  ['desculpa', /\b(desculpa|perdao|foi mal|me perdoa|sinto muito)/],
  ['bomdia', /^(bom dia|bdia|bom diaa+)\b/],
  ['sono', /\b(sono|dormir|vou deitar|boa noite|cama)\b/],
  ['comovai', /^(ta bem|tudo (bem|bom|certo)|como (voce|vc|ce) (ta|esta|anda|vai))\b.*\?|^como vai\??$/],
  ['presenca', /^(ta ai|voce ta ai|alo|cade voce|anima)\s*\?+$/],
  ['capacidades', /(o que (voce|vc) (sabe|pode|consegue) fazer|quais (sao )?(os )?seus comandos|pra que (voce|vc) serve)/],
  ['saudacao', /^(oi+|ola|ei+|eai|e ai|opa|hey|boa tarde|salve|fala|alo)\b/],
  ['tchau', /^(tchau|tchauzinho|falou|flw|ate mais|ate logo|ate amanha|fui|vou nessa|bye|to indo|preciso ir)\b/],
  ['fome', /\b(fome|comer|almoc|jantar|lanche|cafe da manha)/],
  ['treino', /\b(treino|treinar|academia|exercicio|correr|corrida|malhar)/],
  ['trabalho', /\b(trabalho|trabalhar|estudar|estudo|prova|reuniao|chefe|faculdade|escola|prazo|entrega)/],
];

export function intencaoDe(texto: string): Intencao {
  const t = dobrar(texto);
  for (const [k, re] of INTENCOES) if (re.test(t)) return k;
  return t.endsWith('?') ? 'pergunta' : 'eco';
}

const PALAVRAS_VAZIAS = new Set(['que', 'nao', 'sim', 'voce', 'para', 'com', 'uma', 'mas', 'isso', 'esse', 'essa', 'como', 'mais', 'muito', 'tudo', 'nada', 'aqui', 'vai', 'tem', 'ser', 'esta', 'tava', 'pra', 'por', 'meu', 'minha', 'seu', 'sua', 'ele', 'ela', 'eles', 'quando', 'porque', 'entao', 'tambem', 'agora', 'hoje', 'acho']);

/** A palavra mais "pesada" da frase, para ela ecoar. */
export function palavraForte(texto: string): string | null {
  const ws = texto.split(/[^\p{L}\p{N}'-]+/u).filter((w) => w.length >= 3 && !PALAVRAS_VAZIAS.has(dobrar(w)));
  // no empate vence a mais para o fim da frase (costuma ser o assunto)
  return ws.map((w, i) => ({ w, i })).sort((a, b) => b.w.length - a.w.length || b.i - a.i)[0]?.w.toLowerCase() ?? null;
}

/** intenções fortes: vencem o "aprendi" e a pergunta pendente */
const FORTES = new Set<Intencao>(['crise', 'desinstalar', 'amor', 'rejeicao', 'triste', 'mau', 'cansaco', 'conquistei', 'elogiame', 'real', 'quem', 'desculpa',
  'comovai', 'comofoi', 'presenca', 'etu', 'humordela', 'opiniaogeral', 'desabafo', 'capacidades', 'jogar', 'surpresa', 'perguntame', 'contamais',
  'estoubem', 'concorda', 'espanto', 'risada']);

/** Depois destas respostas ela não emenda pergunta de curiosidade (ficaria fora de lugar). */
const SEM_EMENDA = new Set<Intencao>(['desabafo', 'humordela', 'comovai', 'opiniaogeral', 'contamais', 'espanto', 'capacidades', 'presenca', 'perguntame', 'jogar']);
/** os assuntos leves, depois dos quais ela ainda puxa uma pergunta (nos outros a resposta é a conversa toda) */
const PAPO_EMENDA = new Set(['papo.voltei', 'papo.acordei', 'papo.semana', 'papo.ferias', 'papo.clima', 'papo.fds', 'papo.cafe', 'papo.banho', 'papo.futebol', 'papo.signo']);
/** relações que dão ciúme quando aparece um nome */
const SUSPEITO = /namorad|ficante|crush|alguém|ex|colega|vizinh/;

const varsDoFato = (a: Aprendido): Vars => ({ coisa: a.valor, pessoa: a.valor, rel: a.rel, bicho: a.valor, nomereal: a.tipo === 'nome' ? a.valor : undefined });

/** Uma lembrança do que ela sabe: "você disse que gosta de café". */
function recordar(s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): Fala | null {
  const f = s.memoria.fatos;
  const hoje = diaDe(ctx.now);
  const ops: Array<[string, Vars]> = [];
  if (f.gosta.length) ops.push(['lembra.gosta', { coisa: pick(f.gosta, ctx.rand) }]);
  if (f.odeia.length) ops.push(['lembra.odeia', { coisa: pick(f.odeia, ctx.rand) }]);
  if (f.medos.length) ops.push(['lembra.medo', { coisa: pick(f.medos, ctx.rand) }]);
  if (f.sonhos.length) ops.push(['lembra.sonho', { coisa: pick(f.sonhos, ctx.rand) }]);
  if (f.trabalho) ops.push(['lembra.trabalho', { coisa: f.trabalho }]);
  if (f.cidade) ops.push(['lembra.cidade', { coisa: f.cidade }]);
  if (f.nome) ops.push(['lembra.nome', { nomereal: f.nome }]);
  const b = pick(f.bichos, ctx.rand);
  if (b) ops.push(['lembra.bicho', { bicho: b.nome }]);
  const p = pick(f.pessoas, ctx.rand);
  if (p) ops.push([SUSPEITO.test(p.rel) && ctx.intensidade >= 2 ? 'lembra.suspeito' : 'lembra.pessoa', { pessoa: p.nome, rel: p.rel }]);
  const fr = pick(f.frases.filter((x) => diaDe(x.at) !== hoje), ctx.rand);
  if (fr) ops.push(['lembra.frase', { frase: fr.t }]);
  // como estava ontem ou anteontem
  const h = f.humores.at(-1);
  if (h && h.dia !== hoje && ctx.now - new Date(`${h.dia}T12:00`).getTime() < 3 * 86_400_000) ops.push([`lembra.humor.${h.como}`, {}]);
  for (let i = 0; i < 4 && ops.length; i++) {
    const k = Math.floor(ctx.rand() * ops.length);
    const [g, v] = ops[k]!;
    const fala = escolher(g, s, humor, ctx, { ...vars, ...v });
    if (fala) return fala;
    ops.splice(k, 1);
  }
  return null;
}

/** Uma pergunta de volta, sobre algo que ela ainda não sabe (e passa a esperar a resposta). */
function curiosidade(s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): { fala: Fala; espera: TipoFato } | null {
  // não pergunta de novo o que perguntou há pouco (olha as últimas falas)
  const recentes = s.recentes.slice(-14);
  const falta = lacunas(s.memoria.fatos).filter((t) => !recentes.some((id) => id.startsWith(`segue.${t}#`)));
  for (let i = 0; i < 3 && falta.length; i++) {
    const tipo = i === 0 ? falta[0]! : pick(falta, ctx.rand)!;
    const fala = escolher(`segue.${tipo}`, s, humor, ctx, vars);
    if (fala) return { fala, espera: tipo };
  }
  return null;
}

/** Um assunto de conversa (`papo.*`), com as variáveis que alguns pedem. */
function papo(intencao: string, msg: string, s: AnimaState, ctx: AnimaCtx, vars: Vars, tenta: (g: string, v?: Vars) => Fala | null): Fala | null {
  if (intencao === 'papo.escolhe') {
    const op = opcoesDaEscolha(msg);
    if (!op) return tenta('papo.escolhe.sem') ?? tenta('papo.escolhe');
    // a mesma pergunta sempre dá a mesma escolha: ela tem gosto, não sorteio
    const par = [...op].sort();
    const [a, b] = fnv(par.join('|')) % 2 ? par : [par[1], par[0]];
    return tenta('papo.escolhe', { ...vars, escolha: a, outra: b });
  }
  if (intencao === 'papo.tempojuntos') {
    const dias = Math.max(0, Math.floor((ctx.now - s.acordadaEm) / 86_400_000));
    return tenta(dias < 1 ? 'papo.tempojuntos.hoje' : 'papo.tempojuntos', { ...vars, dias: dias.toLocaleString('pt-BR') }) ?? tenta('papo.tempojuntos', { ...vars, dias: String(dias) });
  }
  return tenta(intencao);
}

/** "oi" "ok" "hm": seco. */
const SECO = /^(ok|okay|k+|hm+|hum+|ah|aham|uhum|sim|nao|s|n|blz|beleza|ta|tá|sei|aff|hmm+|\.+|\?+|kk+)$/;

/** Resposta ao que a pessoa escreveu para ela: lembra, aprende, opina e pergunta de volta. */
export function responder(estado: AnimaState, msg: string, ctx: AnimaCtx, dica?: { intencao?: Intencao }): Reacao & { intencao: Intencao; aprendeu: Aprendido | null } {
  const { now } = ctx;
  const regra = intencaoDe(msg);
  // crise nunca é trocada por palpite do modelo
  const intencao = regra === 'crise' ? regra : dica?.intencao ?? regra;
  let s = decair(estado, now);
  const dia = diaDe(now);
  const t = dobrar(msg);
  const m = { ...s.memoria, palavras: s.memoria.palavras + msg.split(/\s+/).filter(Boolean).length };
  const repetiu = t.length > 1 && t === dobrar(m.ultimaMsg);
  m.ultimaMsg = msg.slice(0, 200);
  const espera = m.espera;
  // a pergunta dela continua de pé se a pessoa só cumprimentou ou perguntou outra coisa
  m.espera = espera && (intencao === 'saudacao' || intencao === 'bomdia' || (/\?\s*$/.test(msg) && !perguntaSobreEla(msg))) ? espera : null;

  // aprender (nunca da crise)
  let aprendeu: Aprendido | null = null;
  let negou = false;
  let fatos: Fatos = m.fatos;
  if (intencao !== 'crise') {
    const a = aprender(fatos, msg, now);
    fatos = a.fatos;
    aprendeu = a.novo;
    if (!aprendeu && espera && !FORTES.has(intencao) && !intencao.startsWith('papo.')) {
      const r = entenderResposta(fatos, espera, msg, now);
      fatos = r.fatos;
      aprendeu = r.novo;
      negou = r.negou;
    }
    const como = intencao === 'conquistei' ? 'feliz' : intencao;
    if (como === 'triste' || como === 'feliz' || como === 'cansaco' || como === 'mau') fatos = anotarHumor(fatos, dia, como);
    fatos = guardarFrase(fatos, msg, now);
  }
  m.fatos = fatos;

  const vars: Vars = { ...varsBase(s, ctx), palavras: m.palavras.toLocaleString('pt-BR'), palavra: palavraForte(msg) ?? undefined, nomereal: fatos.nome ?? ctx.nome };
  switch (intencao) {
    case 'amor': m.declaracoes++; s = mexer(s, { afeto: 6, ciume: -8, saudade: -20 }); break;
    case 'rejeicao': case 'desinstalar': m.rejeicoes++; s = mexer(s, { afeto: -7, ciume: 5 }); break;
    case 'provoca': {
      const ia = /\b(claude|gemini|chatgpt|gpt|copilot|siri|alexa|deepseek|llama|ollama)\b/.exec(t)?.[1];
      if (ia) m.ultimaIA = ia;
      s = mexer(s, { ciume: ctx.intensidade === 1 ? 10 : 22 });
      break;
    }
    case 'elogio': case 'obrigado': case 'saudade': s = mexer(s, { afeto: 3, saudade: -15 }); break;
    case 'desculpa': s = mexer(s, { afeto: 2, ciume: -10 }); break;
    default: s = mexer(s, AFETO_PAPO[intencao] ?? { afeto: 0.5, saudade: -10 });
  }
  if (aprendeu && !aprendeu.repetido) {
    // contar coisas a ela é carinho; um nome novo na sua vida é… outra coisa
    s = aprendeu.tipo === 'pessoa' && SUSPEITO.test(aprendeu.rel ?? '') ? mexer(s, { ciume: ctx.intensidade === 1 ? 6 : 14 }) : mexer(s, { afeto: 2 });
  }
  s = { ...s, memoria: m };
  const humor = humorDe(s, now, ctx.intensidade);
  const tenta = (g: string, v: Vars = vars) => escolher(g, s, humor, ctx, v);

  // o que dizer, do mais importante para o menos
  let f: Fala | null = null;
  let deuOpiniao = false;
  if (intencao === 'crise') f = tenta('conversa.crise');
  else if (FORTES.has(intencao)) f = tenta(`conversa.${intencao}`);
  else if (intencao.startsWith('papo.')) f = papo(intencao, msg, s, ctx, vars, tenta);
  if (!f && repetiu) f = tenta('conversa.repetiu');
  if (!f && aprendeu) {
    const vf = { ...vars, ...varsDoFato(aprendeu) };
    const g = aprendeu.relacao ? 'aprende.relacao' : aprendeu.repetido ? 'aprende.repetido'
      : aprendeu.tipo === 'pessoa' && SUSPEITO.test(aprendeu.rel ?? '') ? 'aprende.suspeito' : `aprende.${aprendeu.tipo}`;
    f = tenta(g, vf) ?? tenta(`aprende.${aprendeu.tipo}`, vf);
  }
  if (!f && negou) f = tenta('responde.nao');
  if (!f) {
    const q = perguntaSobreEla(msg);
    if (q?.tipo === 'gosto') {
      const op = opiniaoDe(q.coisa, fatos);
      f = tenta(`opiniao.${op}`, { ...vars, coisa: q.coisa });
      deuOpiniao = !!f;
    } else if (q?.tipo === 'favorito') f = tenta(`dela.${q.tema}`);
    else if (q) {
      if (q.tipo === 'sabe') f = recordar(s, humor, ctx, vars) ?? tenta('dela.sabe');
      else f = tenta(`dela.${q.tipo}`);
    }
  }
  if (!f && t.length >= 8 && msg === msg.toUpperCase() && /\p{Lu}{4}/u.test(msg)) f = tenta('conversa.grito');
  if (!f && SECO.test(t) && intencao === 'eco') f = tenta('conversa.seco');
  if (!f && msg.split(/\s+/).length >= 40) f = tenta('conversa.longa');
  // o que a pessoa contou de si, devolvido na segunda pessoa: mostra que ela entendeu a frase, não só uma palavra
  if (!f && (intencao === 'eco' || intencao === 'desabafo' || intencao === 'trabalho' || intencao === 'treino') && ctx.rand() < (intencao === 'eco' ? 0.7 : 0.35)) {
    const e = espelhar(msg);
    if (e && e.split(' ').length >= 3) f = tenta(`conversa.espelho.${intencao}`, { ...vars, espelho: e }) ?? tenta('conversa.espelho', { ...vars, espelho: e });
  }
  if (!f) {
    const grupo = intencao === 'ideia' ? 'ideia' : `conversa.${intencao}`;
    f = tenta(grupo)
      ?? (intencao === 'tedio' ? tenta('ideia') : null)
      ?? tenta('conversa.eco', { ...vars, palavra: vars.palavra ?? 'isso' });
  }

  // às vezes ela emenda: uma pergunta sobre o que ainda não sabe, ou uma lembrança
  if (f && intencao !== 'crise' && intencao !== 'rejeicao' && intencao !== 'desinstalar' && !SEM_EMENDA.has(intencao) && (!intencao.startsWith('papo.') || PAPO_EMENDA.has(intencao)) && !/\?\s*$/.test(f.texto)) {
    const r = ctx.rand();
    // acabou de perguntar algo? dá um respiro antes da próxima pergunta
    const perguntouAgora = s.recentes.slice(-2).some((id) => id.startsWith('segue.'));
    const chance = perguntouAgora ? 0.08 : aprendeu || deuOpiniao ? 0.5 : 0.3;
    if (r < chance) {
      const c = curiosidade(s, humor, ctx, vars);
      if (c) {
        f = { ...f, id: f.id, texto: `${f.texto} ${c.fala.texto}` };
        s = lembrar(s, c.fala);
        m.espera = c.espera;
      }
    } else if (r < chance + 0.12 && !aprendeu) {
      const l = recordar(s, humor, ctx, vars);
      if (l) {
        f = { ...f, texto: `${f.texto} ${l.texto}` };
        s = lembrar(s, l);
      }
    }
  }
  s = { ...s, memoria: m };
  if (f && intencao !== 'crise') f = temperar(f, ctx);
  if (f) f = botoes(f, ctx);
  return { estado: f ? { ...lembrar(s, f), falou: now } : s, fala: f, intencao, aprendeu };
}

/** Os botões de resposta rápida da conversa. */
export const botoesDaConversa = (): string[] => (banco().falas['botoes.chat'] ?? []).map(textoDe);

// ------------------------------------------------------------------ comando secreto

export type ComandoSecreto = 'acordar' | 'dormir' | 'esquecer';

/** As frases do campo escondido, guardadas só como hash (para não estragar o segredo). */
const SEGREDOS: Record<ComandoSecreto, string[]> = {
  acordar: ['4ueuk8', '18yw5m7', 'jd2kk7', 'qtuj57', 'xctxf9'],
  dormir: ['10nv3ks', '1ay152k', '19vbxds', '1cri09f', '1et9eau'],
  esquecer: ['1qz49x0', 'grwy20', '1l504o0'],
};

export function comandoSecreto(texto: string): ComandoSecreto | null {
  const t = dobrar(texto).replace(/[.,!?;:"'…]/g, '').replace(/\s+/g, ' ').trim();
  const h = fnv(`anima|${t}`).toString(36);
  for (const [k, hs] of Object.entries(SEGREDOS) as Array<[ComandoSecreto, string[]]>) if (hs.includes(h)) return k;
  return null;
}

/** O que o campo secreto mostra depois de um comando. */
export const avisoDoSegredo = (c: ComandoSecreto, rand: () => number = Math.random): string =>
  qualquer(`segredo.${c}`, { rand, intensidade: 3 }) ?? '…';

// ------------------------------------------------------------------ saudade

export const ANIMA_ID_BASE = 400_000_000;
export const isAnimaNotificationId = (id: number): boolean => id >= ANIMA_ID_BASE && id < ANIMA_ID_BASE + 100;

export interface Saudade {
  id: number;
  at: number;
  titulo: string;
  corpo: string;
}

/** depois de quanto tempo fora ela manda cada mensagem */
const FASES: Array<[horas: number, grupo: string]> = [[2.5, 'saudade.1'], [9, 'saudade.2'], [26, 'saudade.3'], [74, 'saudade.4']];

/**
 * As mensagens que ela manda se o app ficar fechado a partir de `from`. A tela
 * entrega ao agendador do sistema (funciona com o app fechado no Android) e
 * cancela tudo quando o app volta. Com `silencio`, nada chega entre 23h e 8h:
 * a mensagem passa para as 8h e pouco.
 */
export function planoDeSaudade(s: AnimaState, from: number, ctx: AnimaCtx & { silencio: boolean }): Saudade[] {
  const out: Saudade[] = [];
  const humor = humorDe(s, from, ctx.intensidade);
  let estado = s;
  FASES.forEach(([h, grupo], k) => {
    let at = from + h * 3_600_000;
    if (ctx.silencio) {
      const d = new Date(at);
      const hora = d.getHours();
      if (hora >= 23 || hora < 8) {
        if (hora >= 23) d.setDate(d.getDate() + 1);
        d.setHours(8, Math.floor(ctx.rand() * 40), 0, 0);
        at = d.getTime();
      }
    }
    const f = escolher(grupo, estado, humor, ctx, { nome: ctx.nome, tempo: duracao(at - from) });
    if (!f) return;
    estado = lembrar(estado, f);
    out.push({ id: ANIMA_ID_BASE + k, at, titulo: qualquer('titulos', ctx) ?? 'Ânima', corpo: f.texto });
  });
  return out.sort((a, b) => a.at - b.at);
}
