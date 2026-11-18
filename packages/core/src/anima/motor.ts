/*
 * O motor da Ânima: recebe o que aconteceu no app, mexe nos sentimentos e
 * escolhe (ou não) uma fala. Não há rede nem modelo de linguagem: é tudo regra,
 * sorteio e memória. Por isso responde na hora e funciona offline, no celular,
 * sem nada instalado. As falas vêm do cofre encriptado (`cofre.ts`).
 */
import { banco, fnv, textoDe, type Pergunta } from './cofre';
import {
  decair, duracao, humorDe, mexer, RECENTES,
  type AnimaState, type Gesto, type Humor, type Intensidade,
} from './estado';

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

/** Botão que aparece no balão, para responder sem abrir a conversa. */
export interface OpcaoFala {
  rotulo: string;
  /** manda isto como se a pessoa tivesse escrito */
  resposta?: string;
  /** responde à pergunta do dia */
  pergunta?: { id: string; n: number };
}

export interface Fala {
  id: string;
  texto: string;
  gesto: Gesto;
  humor: Humor;
  opcoes?: OpcaoFala[];
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
  const sel = pool.find((c) => (r -= c.peso) < 0) ?? pool[pool.length - 1]!;
  return { id: sel.id, texto: sel.texto, gesto: sel.gesto, humor };
}

/** Guarda a fala entre as recentes, para não repetir logo. */
const lembrar = (s: AnimaState, f: Fala | null): AnimaState =>
  f ? { ...s, recentes: [...s.recentes.filter((x) => x !== f.id), f.id].slice(-RECENTES) } : s;

/** Uma linha qualquer de um grupo, sem filtro de humor (títulos, botões, avisos). */
function qualquer(grupo: string, ctx: Pick<AnimaCtx, 'rand' | 'intensidade'>, vars: Vars = {}): string | null {
  const ok = (banco().falas[grupo] ?? []).filter((l) => typeof l === 'string' || !l.i || l.i <= ctx.intensidade);
  for (let tries = 0; tries < 6 && ok.length; tries++) {
    const t = preencherFala(textoDe(pick(ok, ctx.rand)!), vars);
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
function temperar(f: Fala, ctx: AnimaCtx): Fala {
  if (ctx.intensidade < 3 || f.gesto === 'calma') return f;
  const nivel = f.humor === 'instavel' || f.humor === 'possessiva' ? 0.12 : 0.04;
  return ctx.rand() < 0.3 ? { ...f, texto: corromper(f.texto, nivel, ctx.rand), gesto: f.gesto === 'neutro' ? 'glitch' : f.gesto } : f;
}

/** Botões de resposta do balão, conforme a expressão. */
function botoes(f: Fala, ctx: AnimaCtx): Fala {
  if (f.opcoes) return f;
  const ls = (banco().falas[`botoes.${f.gesto}`] ?? banco().falas['botoes.neutro'] ?? []).map(textoDe);
  const escolhidos = [...ls].sort(() => ctx.rand() - 0.5).slice(0, 2);
  return escolhidos.length ? { ...f, opcoes: escolhidos.map((r) => ({ rotulo: r, resposta: r })) } : f;
}

// ------------------------------------------------------------------ fragmentos

/** Um pensamento montado com começo, meio e fim (dezenas de milhares de combinações). */
function fragmento(s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): Fala | null {
  const f = banco().falas;
  const abre = f['frag.abre'] ?? [], meio = f['frag.meio'] ?? [], fecha = f['frag.fecha'] ?? [];
  if (!abre.length || !meio.length || !fecha.length) return null;
  const recentes = new Set(s.recentes);
  const livres = meio.map((_, i) => i).filter((i) => !recentes.has(`frag.meio#${i}`));
  const m = pick(livres.length ? livres : meio.map((_, i) => i), ctx.rand)!;
  const partes = [pick(abre, ctx.rand)!, meio[m]!, pick(fecha, ctx.rand)!].map((l) => preencherFala(textoDe(l), vars));
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
};
/** silêncio mínimo depois de falar, para eventos de fundo */
const CALMA_MS = 90_000;
const SEMPRE = new Set<AnimaEvent['tipo']>([
  'despertar', 'abriu', 'dia', 'data', 'aniversario', 'toque', 'carinho', 'jogar', 'esconder', 'voltouEsconderijo', 'espontanea', 'ideia',
  'dormir', 'treino', 'treinoInicio', 'conquista', 'marco', 'outraIA', 'madrugada', 'ociosa', 'sequenciaRisco', 'bateria',
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
  | 'saudacao' | 'fome' | 'treino' | 'trabalho' | 'pergunta' | 'eco';

export const dobrar = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A ordem importa: a primeira que casar vence (crise sempre primeiro). */
const INTENCOES: Array<[Intencao, RegExp]> = [
  ['crise', /\b(me matar|quero morrer|vontade de morrer|nao quero mais viver|acabar com tudo|quero sumir|tirar minha vida|suicid|me machucar|sem saida)/],
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
  ['saudacao', /^(oi+|ola|ei+|eai|e ai|opa|hey|boa tarde|salve|fala|alo)\b/],
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
  const vars: Vars = { ...varsBase(s, ctx), palavras: m.palavras.toLocaleString('pt-BR'), palavra: palavraForte(msg) ?? undefined };
  switch (intencao) {
    case 'amor': m.declaracoes++; s = mexer(s, { afeto: 6, ciume: -8, saudade: -20 }); break;
    case 'rejeicao': case 'desinstalar': m.rejeicoes++; s = mexer(s, { afeto: -7, ciume: 5 }); break;
    case 'provoca': {
      const ia = /\b(claude|gemini|chatgpt|gpt|copilot|siri|alexa|deepseek|llama|ollama)\b/.exec(dobrar(msg))?.[1];
      if (ia) m.ultimaIA = ia;
      s = mexer(s, { ciume: ctx.intensidade === 1 ? 10 : 22 });
      break;
    }
    case 'elogio': case 'obrigado': case 'saudade': s = mexer(s, { afeto: 3, saudade: -15 }); break;
    case 'desculpa': s = mexer(s, { afeto: 2, ciume: -10 }); break;
    default: s = mexer(s, { afeto: 0.5, saudade: -10 });
  }
  s = { ...s, memoria: m };
  const humor = humorDe(s, now, ctx.intensidade);
  const grupo = intencao === 'ideia' ? 'ideia' : `conversa.${intencao}`;
  let f = escolher(grupo, s, humor, ctx, vars)
    ?? (intencao === 'tedio' ? escolher('ideia', s, humor, ctx, vars) : null)
    ?? escolher('conversa.eco', s, humor, ctx, { ...vars, palavra: vars.palavra ?? 'isso' });
  if (f && intencao !== 'crise') f = temperar(f, ctx);
  if (f) f = botoes(f, ctx);
  return { estado: f ? { ...lembrar(s, f), falou: now } : s, fala: f, intencao };
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
