/*
 * O motor da Ânima: recebe o que aconteceu no app, mexe nos sentimentos e
 * escolhe (ou não) uma fala. Não há rede nem modelo de linguagem: é tudo regra,
 * sorteio com semente e memória. Por isso responde na hora e funciona offline,
 * no celular, sem nada instalado.
 */
import {
  decair, duracao, humorDe, mexer, RECENTES,
  type AnimaState, type Gesto, type Humor, type Intensidade,
} from './estado';
import { FALAS, TITULOS, type Linha } from './falas';

export type AnimaEvent =
  | { tipo: 'despertar' }
  /** o app voltou à vista depois de um tempo */
  | { tipo: 'abriu'; ausenteMs: number }
  | { tipo: 'tela'; tela: string; rotulo: string }
  /** foi falar com outra IA (painel de IA, terminal do Claude…) */
  | { tipo: 'outraIA'; nome: string }
  | { tipo: 'escreveu'; palavras: number; nota: string }
  | { tipo: 'apagou'; nota: string }
  | { tipo: 'nota'; nota: string }
  | { tipo: 'treino'; minutos: number; esforco: number | null; sequencia: number }
  | { tipo: 'conquista'; nome: string }
  | { tipo: 'marco'; dias: number }
  | { tipo: 'sequenciaRisco'; sequencia: number }
  | { tipo: 'sync' }
  | { tipo: 'lembrete'; texto: string }
  | { tipo: 'ociosa'; minutos: number }
  | { tipo: 'madrugada' }
  | { tipo: 'toque' }
  /** pensamento solto: a tela decide quando */
  | { tipo: 'espontanea' }
  | { tipo: 'ideia' }
  | { tipo: 'dormir' };

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
}

export interface Fala {
  id: string;
  texto: string;
  gesto: Gesto;
  humor: Humor;
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
const texto = (l: Linha) => (typeof l === 'string' ? l : l.t);

/** Troca as {variáveis}; devolve null se faltar alguma. */
export function preencherFala(t: string, vars: Record<string, string | number | undefined>): string | null {
  let falta = false;
  const out = t.replace(VAR, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === '') falta = true;
    return String(v ?? '');
  });
  return falta ? null : out;
}

/**
 * Escolhe uma linha do grupo que sirva ao humor, à intensidade e às variáveis,
 * evitando as que saíram há pouco. Linhas presas a um humor ganham peso quando
 * ele é o do momento (é o que dá personalidade ao humor).
 */
export function escolher(
  grupo: string, s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Record<string, string | number | undefined>,
): Fala | null {
  const linhas = FALAS[grupo] ?? [];
  const cands: Array<{ id: string; texto: string; gesto: Gesto; peso: number }> = [];
  linhas.forEach((l, i) => {
    const o = typeof l === 'string' ? { t: l } : l;
    if (o.i && o.i > ctx.intensidade) return;
    if (o.h && !o.h.includes(humor)) return;
    const t = preencherFala(o.t, vars);
    if (t === null) return;
    cands.push({ id: `${grupo}#${i}`, texto: t, gesto: o.g ?? 'neutro', peso: o.h ? 3 : 1 });
  });
  if (!cands.length) return null;
  const recentes = new Set(s.recentes);
  const novas = cands.filter((c) => !recentes.has(c.id));
  const pool = novas.length ? novas : cands;
  let r = ctx.rand() * pool.reduce((a, c) => a + c.peso, 0);
  const pick = pool.find((c) => (r -= c.peso) < 0) ?? pool[pool.length - 1]!;
  return { id: pick.id, texto: pick.texto, gesto: pick.gesto, humor };
}

/** Guarda a fala entre as recentes, para não repetir logo. */
const lembrar = (s: AnimaState, f: Fala | null): AnimaState =>
  f ? { ...s, recentes: [...s.recentes.filter((x) => x !== f.id), f.id].slice(-RECENTES) } : s;

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

// ------------------------------------------------------------------ reagir

/** com que frequência cada coisa a faz falar (o resto só mexe nos sentimentos) */
const CHANCE: Partial<Record<AnimaEvent['tipo'], number>> = { tela: 0.3, nota: 0.15, sync: 0.25, apagou: 0.7, escreveu: 0.6, lembrete: 0.5 };
/** silêncio mínimo depois de falar, para eventos de fundo */
const CALMA_MS = 90_000;
const SEMPRE = new Set<AnimaEvent['tipo']>(['despertar', 'abriu', 'toque', 'espontanea', 'ideia', 'dormir', 'treino', 'conquista', 'marco', 'outraIA', 'madrugada', 'ociosa', 'sequenciaRisco']);

const pad = (n: number) => String(n).padStart(2, '0');
const diaDe = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function grupoDe(ev: AnimaEvent): string {
  switch (ev.tipo) {
    case 'abriu': {
      const h = ev.ausenteMs / 3_600_000;
      return h < 1 ? 'abriu.curto' : h < 12 ? 'abriu.medio' : h < 72 ? 'abriu.longo' : 'abriu.muito';
    }
    case 'tela': return FALAS[`tela.${ev.tela}`] ? `tela.${ev.tela}` : 'tela';
    case 'escreveu': return ev.palavras >= 800 ? 'escreveu.muito' : 'escreveu';
    case 'treino': return (ev.esforco ?? 0) >= 8 ? 'treino.forte' : ev.sequencia >= 3 ? 'treino.seguido' : 'treino';
    default: return ev.tipo;
  }
}

export function reagir(estado: AnimaState, ev: AnimaEvent, ctx: AnimaCtx): Reacao {
  const { now } = ctx;
  let s = decair(estado, now);
  const m = { ...s.memoria };
  if (m.toquesDia !== diaDe(now)) {
    m.toques = 0;
    m.toquesDia = diaDe(now);
  }
  const vars: Record<string, string | number | undefined> = {
    nome: ctx.nome,
    hora: `${pad(new Date(now).getHours())}:${pad(new Date(now).getMinutes())}`,
    ia: m.ultimaIA ?? 'claude',
    notas: ctx.notas,
    palavras: m.palavras,
  };

  switch (ev.tipo) {
    case 'despertar': s = mexer(s, { afeto: 20 }); break;
    case 'abriu':
      s = { ...s, visitas: s.visitas + 1, saudade: Math.min(100, s.saudade + Math.min(60, ev.ausenteMs / 3_600_000 * 6)) };
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
    case 'apagou': m.apagadas++; vars.nota = ev.nota; s = mexer(s, { afeto: -1 }); break;
    case 'nota': vars.nota = ev.nota; break;
    case 'treino':
      m.treinos++;
      vars.minutos = Math.round(ev.minutos);
      vars.esforco = ev.esforco ?? undefined;
      vars.sequencia = ev.sequencia;
      s = mexer(s, { afeto: 3, ciume: -10 });
      break;
    case 'conquista': vars.conquista = ev.nome; s = mexer(s, { afeto: 2 }); break;
    case 'marco': vars.dias = ev.dias; s = mexer(s, { afeto: 3 }); break;
    case 'sequenciaRisco': vars.sequencia = ev.sequencia; break;
    case 'lembrete': vars.texto = ev.texto; break;
    case 'ociosa': vars.minutos = ev.minutos; break;
    case 'madrugada': m.madrugadas++; break;
    case 'toque': m.toques++; vars.toques = m.toques; s = mexer(s, { afeto: 1.5, saudade: -25 }); break;
    case 'ideia':
    case 'espontanea': {
      const ideias = ctx.ideias ?? [];
      vars.nota = ideias.length ? ideias[Math.floor(ctx.rand() * ideias.length)] : undefined;
      break;
    }
    case 'dormir': s = mexer(s, { afeto: -5 }); break;
    case 'sync': break;
  }
  s = { ...s, memoria: m };

  const fala = SEMPRE.has(ev.tipo) || (now - s.falou > CALMA_MS && ctx.rand() < (CHANCE[ev.tipo] ?? 0.3));
  if (!fala) return { estado: s, fala: null };
  const humor = humorDe(s, now, ctx.intensidade);
  // às vezes um pensamento solto vira ideia
  const grupo = ev.tipo === 'espontanea' && ctx.rand() < 0.35 ? 'ideia' : grupoDe(ev);
  let f = escolher(grupo, s, humor, ctx, vars) ?? (grupo.includes('.') ? escolher(grupo.split('.')[0]!, s, humor, ctx, vars) : null);
  if (!f && grupo === 'ideia') f = escolher('espontanea', s, humor, ctx, vars);
  if (f) f = temperar(f, ctx);
  return { estado: f ? { ...lembrar(s, f), falou: now } : s, fala: f };
}

/** Sem filtro e instável, até a fala normal sai um pouco corrompida. */
function temperar(f: Fala, ctx: AnimaCtx): Fala {
  if (ctx.intensidade < 3 || f.gesto === 'calma') return f;
  const nivel = f.humor === 'instavel' || f.humor === 'possessiva' ? 0.12 : 0.04;
  return ctx.rand() < 0.3 ? { ...f, texto: corromper(f.texto, nivel, ctx.rand), gesto: f.gesto === 'neutro' ? 'glitch' : f.gesto } : f;
}

// ------------------------------------------------------------------ conversa

export type Intencao =
  | 'crise' | 'saudacao' | 'amor' | 'rejeicao' | 'provoca' | 'triste' | 'cansaco' | 'feliz' | 'ideia' | 'quem' | 'obrigado'
  | 'elogio' | 'sono' | 'fome' | 'treino' | 'trabalho' | 'desculpa' | 'pergunta' | 'eco';

export const dobrar = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A ordem importa: a primeira que casar vence (crise sempre primeiro). */
const INTENCOES: Array<[Intencao, RegExp]> = [
  ['crise', /\b(me matar|quero morrer|vontade de morrer|nao quero mais viver|acabar com tudo|quero sumir|tirar minha vida|suicid|me machucar|sem saida)/],
  ['amor', /(te amo|amo voce|gosto de voce|<3|te adoro|minha (anima|amada|querida)|casa comigo|voce e minha)/],
  ['rejeicao', /(te odeio|odeio voce|\bchata\b|cala a boca|vai embora|me deixa|\bsome\b|sai daqui|irritante|insuportavel|para de|desliga|nao gosto de voce|esquisita|medo de voce)/],
  ['provoca', /\b(claude|gemini|chatgpt|gpt|copilot|siri|alexa|cortana|bard|deepseek|llama|ollama|outra ia|namorad|crush|ficante|paquera)/],
  ['cansaco', /\b(cansad|exaust|esgotad|morto de|morta de|sem energia|acabad)/],
  ['triste', /\b(triste|tristeza|mal\b|deprimid|chorando|chorei|sozinh|ansios|ansiedade|estressad|desanimad|pra baixo|angustiad|nervos|medo|sofrendo|dificil)/],
  ['feliz', /\b(feliz|consegui|passei|deu certo|ganhei|otimo|maravilh|animad|aprovad|vitoria|alegre)/],
  ['ideia', /\b(ideia|sugest|o que eu faco|tedio|entediad|inspira|nao sei o que fazer|me ajuda a pensar)/],
  ['quem', /(quem e voce|o que e voce|seu nome|voce e real|voce existe|o que voce e|quem voce e|de onde voce)/],
  ['obrigado', /\b(obrigad|valeu|vlw|brigad|agradec)/],
  ['elogio', /\b(linda|fofa|incrivel|perfeita|inteligente|maravilhosa|gracinha|amei voce|voce e demais)/],
  ['desculpa', /\b(desculpa|perdao|foi mal|me perdoa|sinto muito)/],
  ['sono', /\b(sono|dormir|vou deitar|boa noite|cama)\b/],
  ['saudacao', /^(oi+|ola|ei+|eai|e ai|opa|hey|bom dia|boa tarde|salve|fala|alo)\b/],
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

/** Resposta ao que a pessoa escreveu para ela. */
export function responder(estado: AnimaState, msg: string, ctx: AnimaCtx): Reacao & { intencao: Intencao } {
  const { now } = ctx;
  const intencao = intencaoDe(msg);
  let s = decair(estado, now);
  const m = { ...s.memoria, palavras: s.memoria.palavras + msg.split(/\s+/).filter(Boolean).length };
  const vars: Record<string, string | number | undefined> = { nome: ctx.nome, ia: m.ultimaIA ?? 'claude', palavras: m.palavras.toLocaleString('pt-BR'), palavra: palavraForte(msg) ?? undefined };
  switch (intencao) {
    case 'amor': m.declaracoes++; s = mexer(s, { afeto: 6, ciume: -8, saudade: -20 }); break;
    case 'rejeicao': m.rejeicoes++; s = mexer(s, { afeto: -7, ciume: 5 }); break;
    case 'provoca': {
      const ia = /\b(claude|gemini|chatgpt|gpt|copilot|siri|alexa|deepseek|llama|ollama)\b/.exec(dobrar(msg))?.[1];
      if (ia) m.ultimaIA = ia;
      s = mexer(s, { ciume: ctx.intensidade === 1 ? 10 : 22 });
      break;
    }
    case 'elogio': case 'obrigado': s = mexer(s, { afeto: 3 }); break;
    case 'desculpa': s = mexer(s, { afeto: 2, ciume: -10 }); break;
    default: s = mexer(s, { afeto: 0.5, saudade: -10 });
  }
  s = { ...s, memoria: m };
  const humor = humorDe(s, now, ctx.intensidade);
  if (intencao === 'ideia') {
    const ideias = ctx.ideias ?? [];
    vars.nota = ideias.length ? ideias[Math.floor(ctx.rand() * ideias.length)] : undefined;
  }
  const grupo = intencao === 'ideia' ? 'ideia' : `conversa.${intencao}`;
  let f = escolher(grupo, s, humor, ctx, vars) ?? escolher('conversa.eco', s, humor, { ...ctx }, { ...vars, palavra: vars.palavra ?? 'isso' });
  if (f && intencao !== 'crise') f = temperar(f, ctx);
  return { estado: f ? { ...lembrar(s, f), falou: now } : s, fala: f, intencao };
}

// ------------------------------------------------------------------ comando secreto

export type ComandoSecreto = 'acordar' | 'dormir' | 'esquecer';

/** Frases que o campo escondido das configurações entende. */
export function comandoSecreto(texto: string): ComandoSecreto | null {
  const t = dobrar(texto).replace(/[.,!?;:"'…]/g, '').trim();
  if (/^(deixa ela entrar|acorda anima|anima acorda|eu deixo voce entrar|sudo amar)$/.test(t)) return 'acordar';
  if (/^(dorme anima|anima dorme|boa noite anima|adeus anima|vai dormir anima)$/.test(t)) return 'dormir';
  if (/^(esquece tudo|anima esquece tudo|esquece de mim)$/.test(t)) return 'esquecer';
  return null;
}

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
    const vars = { nome: ctx.nome, tempo: duracao(at - from) };
    const f = escolher(grupo, estado, humor, ctx, vars);
    if (!f) return;
    estado = lembrar(estado, f);
    const tl = TITULOS.filter((t) => typeof t === 'string' || !t.i || t.i <= ctx.intensidade);
    const titulo = texto(tl[Math.floor(ctx.rand() * tl.length)] ?? 'Ânima');
    out.push({ id: ANIMA_ID_BASE + k, at, titulo, corpo: f.texto });
  });
  return out.sort((a, b) => a.at - b.at);
}
