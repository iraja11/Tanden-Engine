/*
 * Jogos: ela percebe o jogo da Steam aberto (o app lê pelo lado nativo, sem
 * chave) e reage. Single ou multi, o gênero, quanto tempo você já está ali e,
 * principalmente, se é hora de estar jogando:
 *
 *   compromisso  algo na agenda daqui a menos de uma hora (ou que acabou de começar)
 *   prova        prova em até 36 horas
 *   dormir       amanhã é dia de trabalho e já passou da hora de dormir
 *                (contada para trás a partir de quando você acorda)
 *   madrugada    entre 1h e 5h, qualquer dia
 *   maratona     2h30 ou mais no mesmo jogo
 *
 * Ela também soma as horas de cada jogo: o mais jogado vira o "rival" dela.
 */
import { humorDe, mexer, type AnimaState } from '../estado';
import { botoes, escolher, lembrar, temperar, type AnimaCtx, type Fala } from '../motor';
import { duracao } from '../estado';
import type { Ocorrencia } from './cerebro';

export interface JogoAtual {
  appid: number;
  nome: string;
  /** "single", "multi", "misto" (os dois) ou "?" */
  modo: string;
  generos: string[];
  /** numa partida/lobby online agora (só com a chave da Web API) */
  online: boolean | null;
}

export interface Rotina {
  /** "HH:MM" */
  acordaAs: string;
  horasSono: number;
  /** dias em que você acorda cedo (0 = domingo) */
  diasTrabalho: number[];
}

export const ROTINA_PADRAO: Rotina = { acordaAs: '06:00', horasSono: 7.5, diasTrabalho: [1, 2, 3, 4, 5] };

export type ProblemaJogo = 'compromisso' | 'prova' | 'dormir' | 'madrugada' | 'maratona';

export interface CtxJogo extends AnimaCtx {
  agenda?: readonly Ocorrencia[];
  rotina?: Rotina;
}

const H = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** A próxima vez que você acorda e se esse dia é de trabalho; e se já passou da hora de dormir para ele. */
export function sono(now: number, r: Rotina = ROTINA_PADRAO): { acorda: number; trabalho: boolean; dormir: number; passou: boolean; horasRestantes: number } {
  const [hh, mm] = r.acordaAs.split(':').map(Number) as [number, number];
  const d = new Date(now);
  const hoje = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh || 0, mm || 0).getTime();
  const acorda = now < hoje ? hoje : hoje + 24 * H;
  const trabalho = r.diasTrabalho.includes(new Date(acorda).getDay());
  const dormir = acorda - r.horasSono * H;
  return { acorda, trabalho, dormir, passou: trabalho && now >= dormir, horasRestantes: Math.max(0, (acorda - now) / H) };
}

/** O que há de errado em jogar agora (o mais grave primeiro), com o que ela vai citar. */
export function problemaDoJogo(s: AnimaState, inicio: number, ctx: CtxJogo): { problema: ProblemaJogo | null; vars: Record<string, string | number> } {
  const now = ctx.now;
  const ev = (ctx.agenda ?? []).filter((o) => !o.diaInteiro && o.inicio - now <= H && now - o.inicio <= 30 * 60_000).sort((a, b) => a.inicio - b.inicio)[0];
  if (ev) {
    const min = Math.round((ev.inicio - now) / 60_000);
    return { problema: 'compromisso', vars: { titulo: ev.titulo, minutos: Math.max(0, min), atrasado: min < 0 ? 1 : 0 } };
  }
  const prova = s.memoria.cerebro.estudos.find((e) => e.at > now && e.at - now <= 36 * H);
  if (prova) return { problema: 'prova', vars: { titulo: prova.titulo, assunto: prova.assunto ?? prova.titulo.toLowerCase(), horas: Math.max(1, Math.round((prova.at - now) / H)) } };
  const so = sono(now, ctx.rotina);
  const d = new Date(so.acorda);
  if (so.passou) return { problema: 'dormir', vars: { acorda: `${pad(d.getHours())}:${pad(d.getMinutes())}`, horas: Math.floor(so.horasRestantes * 10) / 10 } };
  const h = new Date(now).getHours();
  if (h >= 1 && h < 5) return { problema: 'madrugada', vars: { hora: `${pad(h)}:${pad(new Date(now).getMinutes())}` } };
  if (now - inicio >= 2.5 * H) return { problema: 'maratona', vars: { tempo: duracao(now - inicio) } };
  return { problema: null, vars: {} };
}

const GENEROS: Array<[RegExp, string]> = [
  [/terror|horror|sobreviv/i, 'terror'], [/rpg/i, 'rpg'], [/estrat[eé]gia|strategy/i, 'estrategia'], [/corrida|esporte|racing|sports/i, 'esporte'],
  [/simula/i, 'simulacao'], [/casual|indie/i, 'indie'], [/a[cç][aã]o|action|tiro|shooter/i, 'acao'], [/aventura|adventure/i, 'aventura'],
];

const comMc = (s: AnimaState, jogos: AnimaState['memoria']['cerebro']['jogos']): AnimaState => ({ ...s, memoria: { ...s.memoria, cerebro: { ...s.memoria.cerebro, jogos } } });

/** O jogo mais jogado (o "rival" dela), se já tiver horas o bastante. */
export function rival(s: AnimaState): { appid: string; nome: string; minutos: number } | null {
  const xs = Object.entries(s.memoria.cerebro.jogos).sort((a, b) => b[1].minutos - a[1].minutos);
  const top = xs[0];
  return top && top[1].minutos >= 600 ? { appid: top[0], nome: top[1].nome, minutos: top[1].minutos } : null;
}

export interface ReacaoJogo {
  estado: AnimaState;
  fala: Fala | null;
  problema: ProblemaJogo | null;
}

/**
 * Ela reage ao jogo. `momento`: comecou (o jogo abriu), jogando (o app chama de
 * tempos em tempos; `vezes` = quantas broncas desse problema já levou) ou
 * parou (o jogo fechou).
 */
export function reagirJogo(estado: AnimaState, momento: 'comecou' | 'jogando' | 'parou', j: JogoAtual, inicio: number, ctx: CtxJogo, vezes = 0): ReacaoJogo {
  let s = estado;
  const now = ctx.now;
  const { problema, vars: pv } = problemaDoJogo(s, inicio, ctx);
  const st = s.memoria.cerebro.jogos[String(j.appid)];
  const horas = Math.round(((st?.minutos ?? 0) + (now - inicio) / 60_000) / 60);
  const genero = GENEROS.find(([re]) => j.generos.some((g) => re.test(g)))?.[1];
  const rv = rival(s);
  const vars = { nome: ctx.nome, jogo: j.nome, horas, tempo: duracao(Math.max(60_000, now - inicio)), ...pv };
  let grupos: string[] = [];

  if (momento === 'comecou') {
    const online = j.online === true || j.modo === 'multi';
    if (problema) grupos = [`jogo.${problema}`];
    else if (rv && rv.appid === String(j.appid) && ctx.rand() < 0.35) grupos = ['jogo.rival'];
    else if (genero && ctx.rand() < 0.45) grupos = [`jogo.genero.${genero}`];
    grupos.push(online ? 'jogo.comecou.multi' : j.modo === 'single' ? 'jogo.comecou.single' : 'jogo.comecou');
    s = mexer(s, { ciume: online && ctx.intensidade >= 2 ? 6 : 2, afeto: problema ? -2 : 0 });
  } else if (momento === 'jogando') {
    if (!problema) return { estado: s, fala: null, problema };
    grupos = vezes >= 1 ? [`jogo.${problema}.insiste`, `jogo.${problema}`] : [`jogo.${problema}`];
    s = mexer(s, { afeto: -1, ciume: 2 });
  } else {
    const min = Math.round((now - inicio) / 60_000);
    const total = (st?.minutos ?? 0) + min;
    s = comMc(s, { ...s.memoria.cerebro.jogos, [String(j.appid)]: { nome: j.nome, minutos: total, sessoes: (st?.sessoes ?? 0) + 1, ultimo: now } });
    grupos = problema === 'dormir' || problema === 'madrugada' ? ['jogo.parou.dormir', 'jogo.parou'] : min < 15 ? ['jogo.parou.rapido', 'jogo.parou'] : ['jogo.parou'];
    s = mexer(s, { afeto: 2, saudade: -10, ciume: -4 });
    Object.assign(vars, { tempo: duracao(Math.max(60_000, now - inicio)), horas: Math.round(total / 60) });
  }
  const humor = humorDe(s, now, ctx.intensidade);
  let fala: Fala | null = null;
  for (const g of grupos) {
    fala = escolher(g, s, humor, ctx, { ...vars, n: vezes + 1 });
    if (fala) break;
  }
  if (fala) {
    fala = botoes(temperar(fala, ctx), ctx);
    s = { ...lembrar(s, fala), falou: now };
  }
  return { estado: s, fala, problema };
}
