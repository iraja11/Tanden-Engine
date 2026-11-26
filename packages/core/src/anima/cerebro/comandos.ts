/*
 * Comandos: o que ela sabe fazer no app, o que cada coisa significa para ela
 * e como tirar de uma frase os campos de que o comando precisa.
 *
 * Cada comando tem:
 *   gosto       quanto ela gosta de fazer aquilo (-2 odeia … 2 adora)
 *   risco       quanto estraga se der errado (apagar = 3: sempre confirma)
 *   soberano    a pessoa SEMPRE manda (silêncio, esconder, dormir, sync, som):
 *               ela pode reclamar, nunca impedir
 *   travessuras o que ela pode "pôr o dedo" (sempre declarado e desfazível)
 */
import { parseEventCapture } from '../../agenda/capture';
import { parseQuickReminder } from '../../quick-reminder';
import type { Fatos } from '../fatos';
import {
  ambiguo, candidatosNota, casarComando, citacao, duracaoMs, formulaDado, recortar, telaDe, temaDe,
  type ComandoApp, type Tema,
} from './entidades';
import type { Campo } from './memoria';
import { sentido, type Sentido } from './semantica';
import { dobrar, type Texto } from './texto';

export type ComandoId =
  | 'agenda' | 'agenda_ver' | 'lembrete' | 'abrir_nota' | 'criar_nota' | 'apagar_nota' | 'buscar' | 'ir' | 'tema' | 'anotar' | 'timer' | 'dado' | 'moeda'
  | 'sync' | 'agua' | 'treinar' | 'aleatoria' | 'diario' | 'som' | 'calar' | 'esconder' | 'dormir' | 'voltar' | 'mundo' | 'paleta';

export type Travessura =
  | 'minutoExtra' | 'temaDela' | 'nomeDela' | 'dadoTeatro' | 'moedaDela' | 'telaErrada' | 'notaDela' | 'psDela' | 'coracao' | 'eventoExtra';

export interface DefComando {
  id: ComandoId;
  gosto: number;
  risco: 0 | 1 | 2 | 3;
  soberano?: boolean;
  travessuras: Travessura[];
}

export const COMANDOS: Record<ComandoId, DefComando> = {
  agenda: { id: 'agenda', gosto: 0.3, risco: 1, travessuras: ['eventoExtra'] },
  agenda_ver: { id: 'agenda_ver', gosto: 0.8, risco: 0, travessuras: [] },
  lembrete: { id: 'lembrete', gosto: 0.5, risco: 1, travessuras: ['coracao'] },
  abrir_nota: { id: 'abrir_nota', gosto: 0.6, risco: 0, travessuras: [] },
  criar_nota: { id: 'criar_nota', gosto: 1, risco: 0, travessuras: ['nomeDela'] },
  apagar_nota: { id: 'apagar_nota', gosto: -2, risco: 3, travessuras: [] },
  buscar: { id: 'buscar', gosto: 0.4, risco: 0, travessuras: [] },
  ir: { id: 'ir', gosto: 0.2, risco: 0, travessuras: ['telaErrada'] },
  tema: { id: 'tema', gosto: 0.4, risco: 0, travessuras: ['temaDela'] },
  anotar: { id: 'anotar', gosto: 1, risco: 1, travessuras: ['psDela'] },
  timer: { id: 'timer', gosto: 0.8, risco: 0, travessuras: ['minutoExtra'] },
  dado: { id: 'dado', gosto: 1.2, risco: 0, travessuras: ['dadoTeatro'] },
  moeda: { id: 'moeda', gosto: 1, risco: 0, travessuras: ['moedaDela'] },
  sync: { id: 'sync', gosto: 0, risco: 0, soberano: true, travessuras: [] },
  agua: { id: 'agua', gosto: 1.5, risco: 0, soberano: true, travessuras: [] },
  treinar: { id: 'treinar', gosto: 1.5, risco: 0, travessuras: [] },
  aleatoria: { id: 'aleatoria', gosto: 1, risco: 0, travessuras: ['notaDela'] },
  diario: { id: 'diario', gosto: 1.2, risco: 0, travessuras: [] },
  som: { id: 'som', gosto: 0, risco: 0, soberano: true, travessuras: [] },
  calar: { id: 'calar', gosto: -1.5, risco: 0, soberano: true, travessuras: [] },
  esconder: { id: 'esconder', gosto: -1, risco: 0, soberano: true, travessuras: [] },
  dormir: { id: 'dormir', gosto: -1, risco: 0, soberano: true, travessuras: [] },
  voltar: { id: 'voltar', gosto: 2, risco: 0, soberano: true, travessuras: [] },
  mundo: { id: 'mundo', gosto: 1.8, risco: 1, travessuras: [] },
  paleta: { id: 'paleta', gosto: 0.2, risco: 1, travessuras: [] },
};

export interface EventoPedido {
  titulo: string;
  /** "YYYY-MM-DD" */
  dia: string;
  inicio: string | null;
  fim: string | null;
  local: string;
  repete: boolean;
  /** a frase que a agenda entende ("sexta 14h dentista") */
  linha: string;
}

export interface Args {
  nota?: string;
  titulo?: string;
  texto?: string;
  busca?: string;
  evento?: EventoPedido;
  lembrete?: { texto: string; at: number; repete: boolean; linha: string };
  tela?: string;
  tema?: Tema;
  ms?: number;
  formula?: string;
  comando?: string;
  rotuloComando?: string;
  onde?: 'hoje' | 'aberta';
  deslocamento?: number;
  som?: 'liga' | 'desliga' | 'alterna';
  minutos?: number;
  mundo?: string;
  genero?: 'profecia' | 'lenda' | 'rumor' | 'personagem' | 'segredo' | 'ideia';
  periodo?: { de: number; ate: number; rotulo: string };
  /** a outra IA citada ("abre o chatgpt") */
  ia?: string;
}

export interface Pedido {
  comando: ComandoId;
  args: Args;
  sentido: Sentido | null;
  /** o campo que falta (ela pergunta) */
  falta: Campo | null;
  /** notas parecidas demais (ela pergunta qual) */
  opcoes: string[] | null;
  /** a mensagem que originou o pedido */
  texto: string;
}

export interface CtxPedido {
  now: number;
  titulos: readonly string[];
  aberta?: string;
  comandos: readonly ComandoApp[];
  mundos: readonly string[];
  ultimaNota: string | null;
  fatos?: Fatos;
}

// ------------------------------------------------------------------ pedaços de regex

const POLIDO = /^(?:(?:voce|vc|ce)\s+)?(?:pode|poderia|podia|consegue|conseguiria|da pra|dava pra|seria possivel|quero que voce|preciso que voce|faz um favor|me faz um favor|por favor|pfv|por gentileza)\s+(?:e\s+|me\s+)?/;
const ARTIGO = /^(?:a|o|as|os|um|uma|minha|meu|minhas|meus|aquela|aquele|essa|esse|esta|este)\s+/;
const PREP = /^(?:de|da|do|das|dos|sobre|chamada|chamado|com o nome(?: de)?|com titulo|com o titulo|intitulada|titulo|nome)\s*:?\s+/;
const DOIS_PONTOS = /^[:\-–]\s*/;

const pad = (n: number) => String(n).padStart(2, '0');
const diaDe = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// ------------------------------------------------------------------ extração

/** Junta título + data num evento da agenda (usa o mesmo leitor da captura rápida da agenda). */
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * Arruma a frase para o leitor da agenda: "às 10" → "às 10h", "dia 20" → "20/11",
 * "pra quinta" → "quinta", tira "na agenda" do meio.
 */
export function prepararQuando(texto: string, now: number): string {
  const hoje = new Date(now);
  let s = ` ${texto} `
    .replace(/\s(?:na|no)\s+(?:minha\s+|meu\s+)?(?:agenda|calend[aá]rio)\b/gi, ' ')
    .replace(/\s(?:pra|para|pro)\s+(?=(?:hoje|amanh[ãa]|depois|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|dia|semana|o dia|\d))/gi, ' ')
    .replace(/\s(?:o dia|no dia)\s+(?=\d)/gi, ' dia ');
  // "dia 3 de dezembro" / "dia 20" → data com barra (o leitor da agenda entende "20/11")
  s = s.replace(/\sdia\s+(\d{1,2})(?:\s+de\s+([a-zç]+))?(?![\d/:h])/gi, (m, d: string, mes?: string) => {
    let mm = mes ? MESES.indexOf(mes.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()) + 1 : 0;
    if (mes && mm <= 0) return m;
    if (!mm) mm = +d < hoje.getDate() ? ((hoje.getMonth() + 1) % 12) + 1 : hoje.getMonth() + 1;
    return ` ${+d}/${mm} `;
  });
  s = s.replace(/\s(?:à|a)s\s+(\d{1,2})(?![\d:h])/gi, ' às $1h').replace(/\s(\d{1,2})\s+horas?\b/gi, ' $1h');
  // "20/11 às 15h": sem "das ... às ...", o "às" só atrapalha (a agenda leria como faixa 11–15h)
  if (!/\bdas?\s+\d/i.test(s)) s = s.replace(/\s(?:à|a)s\s+(\d{1,2}(?:h\d{0,2}|:\d{2}))/gi, ' $1');
  return s.replace(/\s+/g, ' ').trim();
}

function evento(texto: string, now: number): EventoPedido | null {
  texto = prepararQuando(texto, now);
  const ev = parseEventCapture(texto, new Date(now));
  if (!ev) return null;
  let titulo = ev.title.trim().replace(/^(?:que\s+)?(?:eu\s+)?(?:tenho|vou ter|vou|terei|tem)\s+/i, '').replace(/^(?:um|uma|a|o|minha|meu)\s+/i, '').replace(/\s*,\s*$/, '');
  titulo = titulo.replace(/\s+(?:na|no)\s+(?:agenda|calendario|calendário|minha agenda|meu calendário|meu calendario)\b/i, '').trim();
  // título vazio ou o padrão da agenda ("Lembrete", "Evento"): não sabemos o que marcar
  if (!titulo || /^(lembrete|evento|compromisso)$/i.test(titulo)) return null;
  // sem data nem hora no texto: a agenda põe hoje; para ela, isso é "falta o quando"
  const temQuando = /\d|hoje|amanh|depois|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo|semana|m[eê]s|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|noite|manh|tarde/i.test(texto);
  return { titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), dia: ev.date, inicio: ev.start, fim: ev.end, local: ev.location, repete: !!ev.repeat, linha: temQuando ? texto : '' };
}

function lembrete(texto: string, now: number): Args['lembrete'] | null {
  texto = prepararQuando(texto, now);
  const q = parseQuickReminder(texto, now);
  if (!q || !q.text.trim()) return null;
  return { texto: q.text.trim().replace(/^(?:de|pra|para|que)\s+/i, ''), at: q.at, repete: !!q.repeat, linha: texto };
}

/** O que sobra depois de tirar as palavras de comando (pelo comando). */
const CABECAS: Partial<Record<ComandoId, RegExp[]>> = {
  agenda: [POLIDO, /^(?:me\s+)?(?:coloca|coloque|poe|põe|bota|marca|adiciona|agenda|salva|anota|registra|cria|faz|inclui|quero marcar)\s+(?:la\s+|ai\s+)?(?:(?:na|no)\s+(?:minha\s+|meu\s+)?(?:agenda|calendario)\s*:?\s*)?(?:um evento(?: de)?\s+|que\s+)?/, /^(?:na|no)\s+(?:minha\s+|meu\s+)?(?:agenda|calendario)\s*:?\s*/, ARTIGO],
  lembrete: [POLIDO, /^(?:me\s+)?(?:lembra|lembre|lembrete|avisa|cobra|cria um lembrete|faz um lembrete|coloca um lembrete|poe um lembrete|nao (?:me )?deixa (?:eu )?esquecer)\s*(?:de|pra|para|que|:)?\s*/],
  abrir_nota: [POLIDO, /^(?:me\s+)?(?:abre|mostra|puxa|quero ver|vai na|vai pra|me leva (?:na|pra|para a)|cade|onde ta|acha)\s+/, ARTIGO, /^(?:nota|notas|arquivo|pagina)\s+/, PREP],
  criar_nota: [POLIDO, /^(?:me\s+)?(?:cria|crie|faz|faca|abre|comeca|inicia|quero|preciso de)\s+(?:uma\s+|a\s+)?(?:nota|pagina|arquivo)\s*(?:nova|em branco)?\s*/, /^(?:nova\s+nota|nota\s+nova)\s*/, PREP, /^(?:pra|para)\s+(?:eu\s+escrever\s+)?(?:sobre\s+)?/, DOIS_PONTOS],
  apagar_nota: [POLIDO, /^(?:apaga|deleta|exclui|remove|joga|manda|some com|pode apagar|pode excluir)\s+/, ARTIGO, /^(?:nota|arquivo|pagina)\s+/, PREP],
  buscar: [POLIDO, /^(?:me\s+)?(?:procura|busca|pesquisa|acha|encontra)\s+(?:pra mim\s+)?(?:por\s+)?/, /^(?:onde|em que nota)\s+(?:eu\s+)?(?:escrevi|anotei|falei|ta|tem)\s+(?:sobre|de|do|da|o|a)?\s*/, /^tem (?:alguma\s+)?nota\s+(?:sobre|com|falando (?:de|do|da)|que fala (?:de|do|da))\s+/, /^(?:minhas\s+)?(?:anotacoes|notas)\s+(?:sobre|de)\s+/, DOIS_PONTOS],
  anotar: [POLIDO, /^(?:anota|escreve|registra|guarda|acrescenta|toma nota|coloca)\s*(?:ai|isso|essa ideia|pra mim)?\s*(?:no diario|no meu diario|na nota de hoje|na nota aberta|na nota que ta aberta|na nota)?\s*:?\s*(?:que\s+)?/, DOIS_PONTOS],
};
const CAUDAS: Partial<Record<ComandoId, RegExp[]>> = {
  agenda: [/\s*,?\s*(?:coloca|poe|põe|marca|salva|agenda)?\s*(?:na agenda|no calendario|na minha agenda|no meu calendario)(?:\s+pra mim)?$/, /\s*,\s*(?:agenda|marca|coloca)(?: pra mim)?$/],
  lembrete: [/\s*,?\s*me lembra$/],
  buscar: [/\s+(?:nas notas|no cofre|nas minhas notas|pra mim)$/],
  abrir_nota: [/\s+de novo$/],
  apagar_nota: [/\s+(?:no lixo|na lixeira|fora|pra lixeira)$/, /\s*,\s*apaga$/],
};

/** Entende os campos de um comando já reconhecido. */
export function entenderPedido(comando: ComandoId, t: Texto, ctx: CtxPedido): Pedido {
  const d = t.alinhado;
  const args: Args = {};
  let falta: Campo | null = null;
  let opcoes: string[] | null = null;
  let sen: Sentido | null = null;
  const resto = () => recortar(t, CABECAS[comando] ?? [POLIDO], CAUDAS[comando] ?? []);

  switch (comando) {
    case 'agenda': {
      const r = resto();
      const ev = evento(r.texto, ctx.now);
      if (!ev) falta = 'evento';
      else {
        args.evento = ev;
        if (!ev.linha) falta = 'quando';
        // o sentido vem do título; o resto da frase só ajuda quando o título não diz nada
        sen = sentido(ev.titulo, ctx.fatos);
        if (sen.categoria === 'outro') sen = sentido(r.texto, ctx.fatos);
      }
      break;
    }
    case 'agenda_ver': {
      const now = new Date(ctx.now);
      const ini = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const DIA = 864e5;
      if (/\bamanha\b/.test(d)) args.periodo = { de: ini + DIA, ate: ini + 2 * DIA, rotulo: 'amanhã' };
      else if (/\bsemana\b/.test(d)) args.periodo = { de: ctx.now, ate: ini + 8 * DIA, rotulo: 'essa semana' };
      else if (/\bfim de semana\b|\bsabado\b|\bdomingo\b/.test(d)) {
        const ate = (6 - now.getDay() + 7) % 7;
        args.periodo = { de: ini + ate * DIA, ate: ini + (ate + 2) * DIA, rotulo: 'no fim de semana' };
      } else if (/\bproxim[oa]\b/.test(d)) args.periodo = { de: ctx.now, ate: ctx.now + 60 * DIA, rotulo: 'próximo' };
      else args.periodo = { de: ctx.now, ate: ini + DIA, rotulo: 'hoje' };
      break;
    }
    case 'lembrete': {
      const r = resto();
      const l = lembrete(r.texto, ctx.now);
      if (l) {
        args.lembrete = l;
        sen = sentido(l.texto, ctx.fatos);
      } else {
        args.texto = r.texto || undefined;
        falta = r.texto ? 'quando' : 'texto';
        if (r.texto) sen = sentido(r.texto, ctx.fatos);
      }
      break;
    }
    case 'abrir_nota':
    case 'apagar_nota': {
      const cit = citacao(t.original);
      const r = resto();
      const q = cit ?? r.texto;
      const pronome = /^(?:ela|essa|esta|isso|aquela|a ultima|a mesma|de novo|nota|essa nota|esta nota|a nota|arquivo|pagina)?$/.test(dobrar(q).trim());
      if (pronome) {
        const alvo = comando === 'apagar_nota' ? ctx.aberta ?? ctx.ultimaNota : ctx.ultimaNota ?? ctx.aberta;
        if (alvo) args.nota = alvo;
        else falta = 'nota';
      } else {
        const cs = candidatosNota(q, ctx.titulos);
        if (!cs.length) {
          args.busca = q;
          falta = null;
        } else if (ambiguo(cs)) opcoes = cs.slice(0, 4).map((c) => c.titulo);
        else args.nota = cs[0]!.titulo;
        sen = sentido(q, ctx.fatos);
      }
      break;
    }
    case 'criar_nota': {
      const cit = citacao(t.original);
      const r = resto();
      const titulo = (cit ?? r.texto).replace(/^[:\s]+|[.!?\s]+$/g, '');
      if (titulo && !/^(?:nova|em branco|uma nota|nota)$/i.test(titulo)) args.titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
      if (args.titulo) sen = sentido(args.titulo, ctx.fatos);
      break;
    }
    case 'buscar': {
      const cit = citacao(t.original);
      const r = resto();
      const b = (cit ?? r.texto).replace(/[?!.]+$/, '').trim();
      if (b) {
        args.busca = b;
        sen = sentido(b, ctx.fatos);
      } else falta = 'busca';
      break;
    }
    case 'ir': {
      const tela = telaDe(t.tokens.join(' '));
      if (tela) args.tela = tela;
      else falta = 'tela';
      if (tela === 'ia') {
        sen = { categoria: 'ia', pessoa: null, suspeito: true, assunto: null };
        const m = /\b(claude|chatgpt|gpt|gemini|copilot|ollama|deepseek)\b/.exec(d);
        if (m) args.ia = m[1] === 'gpt' ? 'chatgpt' : m[1];
      }
      break;
    }
    case 'tema': args.tema = temaDe(t.tokens.join(' ')); break;
    case 'anotar': {
      const r = recortar(t, CABECAS.anotar!, []);
      const texto = (citacao(t.original) ?? r.texto).trim();
      args.onde = /\bnota (?:aberta|que ta aberta)\b|\bnessa nota\b/.test(d) ? 'aberta' : 'hoje';
      if (texto) {
        args.texto = texto;
        sen = sentido(texto, ctx.fatos);
      } else falta = 'texto';
      break;
    }
    case 'timer': {
      const ms = duracaoMs(t);
      if (ms) args.ms = ms;
      else falta = 'duracao';
      break;
    }
    case 'dado': args.formula = formulaDado(t) ?? '1d20'; break;
    case 'diario': args.deslocamento = /\bontem\b/.test(d) ? -1 : /\bamanha\b/.test(d) ? 1 : 0; break;
    case 'som': args.som = /\bdesliga|\bmuta|\bsilencia|\bsem som|\btira|\bcorta/.test(d) ? 'desliga' : /\bliga\b/.test(d) ? 'liga' : 'alterna'; break;
    case 'calar': {
      const ms = duracaoMs(t);
      args.minutos = ms ? Math.round(ms / 60_000) : /um pouco|um tempo|rapidinho/.test(d) ? 20 : 45;
      break;
    }
    case 'mundo': {
      const w = ctx.mundos.find((m) => new RegExp(`\\b${dobrar(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(d));
      if (w) args.mundo = w;
      else if (ctx.mundos.length === 1) args.mundo = ctx.mundos[0];
      else if (ctx.mundos.length) args.mundo = ctx.mundos[Math.floor(ctx.now / 7) % ctx.mundos.length];
      args.genero = /profeci/.test(d) ? 'profecia' : /lenda|mito/.test(d) ? 'lenda' : /rumor|boato|fofoca/.test(d) ? 'rumor' : /personagem|npc/.test(d) ? 'personagem' : /segredo/.test(d) ? 'segredo' : 'ideia';
      break;
    }
    case 'paleta': {
      const r = recortar(t, [POLIDO, /^(?:executa|roda|aciona|usa|faz|ativa|liga|abre)\s+(?:o comando\s+|a\s+|o\s+)?/], []);
      const c = casarComando(r.texto || t.original, ctx.comandos);
      if (c && c.nota >= 0.5) {
        args.comando = c.cmd.id;
        args.rotuloComando = c.cmd.rotulo;
      }
      break;
    }
    default: break;
  }
  return { comando, args, sentido: sen, falta, opcoes, texto: t.original };
}

/** Preenche o campo que faltava com a resposta da pessoa. */
export function completarPedido(p: Pedido, campo: Campo, t: Texto, ctx: CtxPedido): Pedido {
  const r = recortar(t, [], []);
  const resp = r.texto.replace(/[.!?]+$/, '').trim();
  const args = { ...p.args };
  switch (campo) {
    case 'quando': {
      if (p.comando === 'agenda' && args.evento) {
        const ev = evento(`${resp} ${args.evento.titulo}`, ctx.now);
        if (ev && ev.linha) return { ...p, args: { ...args, evento: { ...ev, titulo: args.evento.titulo } }, falta: null, sentido: p.sentido };
      }
      if (p.comando === 'lembrete' && args.texto) {
        const l = lembrete(`${resp} ${args.texto}`, ctx.now);
        if (l) return { ...p, args: { ...args, lembrete: { ...l, texto: args.texto } }, falta: null };
      }
      return p;
    }
    case 'texto':
      if (p.comando === 'lembrete') return entenderPedido('lembrete', t, ctx).args.lembrete ? { ...p, args: { lembrete: entenderPedido('lembrete', t, ctx).args.lembrete }, falta: null } : { ...p, args: { ...args, texto: resp }, falta: 'quando' };
      return { ...p, args: { ...args, texto: resp }, falta: null };
    case 'titulo': return { ...p, args: { ...args, titulo: resp }, falta: null };
    case 'busca': return { ...p, args: { ...args, busca: resp }, falta: null };
    case 'evento': {
      const ev = evento(resp, ctx.now);
      return ev ? { ...p, args: { ...args, evento: ev }, falta: ev.linha ? null : 'quando', sentido: sentido(`${ev.titulo} ${resp}`, ctx.fatos) } : p;
    }
    case 'duracao': {
      const ms = duracaoMs(t);
      return ms ? { ...p, args: { ...args, ms }, falta: null } : p;
    }
    case 'tela': {
      const tela = telaDe(t.tokens.join(' '));
      return tela ? { ...p, args: { ...args, tela }, falta: null } : p;
    }
    case 'nota': {
      const cs = candidatosNota(resp, ctx.titulos);
      if (!cs.length) return p;
      if (ambiguo(cs)) return { ...p, opcoes: cs.slice(0, 4).map((c) => c.titulo), falta: null };
      return { ...p, args: { ...args, nota: cs[0]!.titulo }, falta: null, opcoes: null };
    }
  }
}

/** Uma chave curta do pedido, para notar quando a pessoa pede a mesma coisa de novo. */
export const chaveDoPedido = (p: Pedido): string =>
  `${p.comando}:${p.args.nota ?? p.args.titulo ?? p.args.busca ?? p.args.evento?.titulo ?? p.args.lembrete?.texto ?? p.args.tela ?? p.args.tema ?? p.args.comando ?? ''}`;

export { diaDe };
