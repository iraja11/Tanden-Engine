/*
 * O cérebro: o caminho inteiro de uma mensagem até uma resposta (e, às vezes,
 * uma ação no app).
 *
 *   texto bagunçado → normalização (gíria, erro, riso, emoji)
 *     → crise? (regra fixa, sempre primeiro, nunca o modelo)
 *     → a conversa em aberto (ela perguntou algo e espera?)
 *     → intenção: classificador treinado + regras deterministas (conta, pergunta
 *       sobre ela, consulta à memória) + as regras antigas quando o modelo hesita
 *     → comando? campos → semântica → vontade → ação + fala
 *       consulta? grafo de conhecimento → resposta com prova
 *       conversa? o motor de sempre (aprende, opina, lembra), com a intenção certa
 *
 * Cada passo deixa uma linha no `traco`, que o app mostra no modo depuração:
 * dá para ver exatamente por que ela entendeu (ou recusou) o que entendeu.
 *
 * Tudo é função pura: estado entra, estado sai. A ação é só uma descrição; quem
 * executa é o app, que depois chama `depoisDaAcao` com o resultado.
 */
import { decair, duracao, humorDe, mexer, type AnimaState, type Gesto, type Humor } from '../estado';
import { aprender, type Aprendido } from '../fatos';
import { perguntaSobreEla } from '../mente';
import {
  botoes, escolher, intencaoDe, lembrar, qualquer, responder, temperar,
  type AnimaCtx, type Fala, type Intencao, type OpcaoFala, type Reacao,
} from '../motor';
import { crescer } from './arco';
import { converter, datas } from './capacidades';
import { assuntoRecente, reintitular, registrarMensagem } from './dialogo';
import { seguimento } from './seguimento';
import type { Modelo } from './classificador';
import { chaveDoPedido, completarPedido, COMANDOS, entenderPedido, type ComandoId, type CtxPedido, type EventoPedido, type Pedido, type Travessura } from './comandos';
import { casarComando, ordinal, candidatosNota, telaDe, type ComandoApp, type Tema } from './entidades';
import { escreverNoMundo, type EscritoMundo, type GeneroEscrito, type MundoInfo } from './escrita';
import { entenderConsulta, montarGrafo, responderConsulta } from './grafo';
import type { Estudo, MemoriaCerebro, Pendencia } from './memoria';
import { classificar, lexicoBase, sentido } from './modelo';
import { semelhanca } from './rede';
import { calcular, fmt } from './numeros';
import { sentimento, type Sentimento } from './sentimento';
import { dobrar, normalizar, type Texto } from './texto';
import { decidir, insistencias, motivos, type Decisao } from './vontade';

// ------------------------------------------------------------------ tipos públicos

export interface Ocorrencia { titulo: string; inicio: number; diaInteiro: boolean }

export interface CtxCerebro extends AnimaCtx {
  /** nomes das notas do cofre */
  titulos?: readonly string[];
  /** comandos da paleta que valem agora */
  comandos?: readonly ComandoApp[];
  mundos?: readonly MundoInfo[];
  /** compromissos dos próximos dias */
  agenda?: readonly Ocorrencia[];
  /** troca o modelo (testes); undefined = o do app */
  modelo?: Modelo | null;
}

export type Acao =
  | { tipo: 'agenda'; evento: EventoPedido; extras: EventoPedido[]; estudo: Array<{ texto: string; at: number }> }
  | { tipo: 'lembrete'; texto: string; linha: string; at: number }
  | { tipo: 'abrirNota'; nota: string }
  | { tipo: 'criarNota'; titulo: string }
  | { tipo: 'apagarNota'; nota: string }
  | { tipo: 'buscar'; busca: string }
  | { tipo: 'ir'; tela: string }
  | { tipo: 'tema'; tema: Tema }
  | { tipo: 'anotar'; texto: string; onde: 'hoje' | 'aberta'; ps: string | null }
  | { tipo: 'timer'; ms: number; rotulo: string }
  | { tipo: 'dado'; formula: string; teatro: boolean }
  | { tipo: 'moeda'; dela: boolean }
  | { tipo: 'sync' } | { tipo: 'agua' } | { tipo: 'treinar' }
  | { tipo: 'aleatoria'; nota: string | null }
  | { tipo: 'diario'; deslocamento: number }
  | { tipo: 'som'; modo: 'liga' | 'desliga' | 'alterna' }
  | { tipo: 'calar'; minutos: number }
  | { tipo: 'esconder' } | { tipo: 'dormir' } | { tipo: 'voltar' }
  | { tipo: 'mundo'; escrito: EscritoMundo }
  | { tipo: 'comando'; id: string; rotulo: string }
  | { tipo: 'desfazer' };

export interface ResultadoAcao {
  ok: boolean;
  vars?: Record<string, string | number>;
  erro?: string;
}

export interface Pensamento extends Reacao {
  intencao: string;
  confianca: number;
  acao: Acao | null;
  /** mais ações, quando a mensagem pediu mais de uma coisa ("marca X e me lembra de Y"); execute depois de `acao` */
  acoes?: Acao[];
  decisao: Decisao | null;
  pedido: Pedido | null;
  aprendeu: Aprendido | null;
  /** o raciocínio, passo a passo (modo depuração) */
  traco: string[];
}

type Vars = Record<string, string | number | undefined>;

const MIN = 60_000;
const SOCIAIS = new Set<string>([
  'amor', 'elogiame', 'rejeicao', 'desinstalar', 'provoca', 'cansaco', 'mau', 'triste', 'conquistei', 'feliz', 'saudade', 'piada', 'tedio', 'ideia', 'real', 'quem',
  'musica', 'obrigado', 'elogio', 'desculpa', 'bomdia', 'sono', 'saudacao', 'fome', 'treino', 'trabalho', 'tchau',
  'comovai', 'estoubem', 'comofoi', 'presenca', 'etu', 'humordela', 'concorda', 'espanto', 'risada', 'contamais', 'opiniaogeral', 'desabafo', 'capacidades', 'jogar', 'surpresa', 'perguntame',
]);

// ------------------------------------------------------------------ ajudantes

const comMc = (s: AnimaState, mc: MemoriaCerebro): AnimaState => ({ ...s, memoria: { ...s.memoria, cerebro: mc } });

/** Uma fala do primeiro grupo que tiver linha que sirva. */
function falaDe(grupos: string[], s: AnimaState, humor: Humor, ctx: AnimaCtx, vars: Vars): Fala | null {
  for (const g of grupos) {
    const f = escolher(g, s, humor, ctx, vars);
    if (f) return f;
  }
  return null;
}

function baseVars(s: AnimaState, ctx: AnimaCtx): Vars {
  const d = new Date(ctx.now);
  return { nome: ctx.nome, nomereal: s.memoria.fatos.nome ?? ctx.nome, hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, ia: s.memoria.ultimaIA ?? 'claude' };
}

function ctxPedido(s: AnimaState, ctx: CtxCerebro): CtxPedido {
  return {
    now: ctx.now, titulos: ctx.titulos ?? [], aberta: ctx.aberta, comandos: ctx.comandos ?? [], mundos: (ctx.mundos ?? []).map((m) => m.nome),
    ultimaNota: s.memoria.cerebro.ultimaNota, fatos: s.memoria.fatos,
  };
}

const quando = (at: number, now: number): string => {
  const d = new Date(at);
  const dias = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime()) / 864e5);
  const h = `${String(d.getHours()).padStart(2, '0')}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`;
  const dia = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : dias === -1 ? 'ontem' : dias > 1 && dias < 7 ? ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]! : `${d.getDate()}/${d.getMonth() + 1}`;
  return `${dia} às ${h}`;
};

const diaDoEvento = (ev: EventoPedido): number => {
  const [y, m, d] = ev.dia.split('-').map(Number) as [number, number, number];
  const [hh, mm] = (ev.inicio ?? '09:00').split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, hh, mm).getTime();
};

/** Variáveis de um pedido, para as falas citarem o que ela vai fazer. */
function varsDoPedido(p: Pedido, now: number): Vars {
  const a = p.args;
  const v: Vars = {
    nota: a.nota, titulo: a.titulo ?? a.evento?.titulo, busca: a.busca, tela: a.tela, comando: a.rotuloComando?.toLowerCase(),
    texto: a.texto ?? a.lembrete?.texto, pessoa: p.sentido?.pessoa ?? undefined, assunto: p.sentido?.assunto ?? undefined,
  };
  if (a.evento) v.quando = quando(diaDoEvento(a.evento), now);
  if (a.lembrete) v.quando = quando(a.lembrete.at, now);
  if (a.ms) v.tempo = duracao(a.ms);
  if (a.formula) v.formula = a.formula;
  if (a.mundo) v.mundo = a.mundo;
  if (a.minutos) v.minutos = a.minutos;
  if (a.ia) v.ia = a.ia;
  return v;
}

// ------------------------------------------------------------------ ação

function acaoDe(p: Pedido, trav: Travessura | null, s: AnimaState, ctx: CtxCerebro, humor: Humor): { acao: Acao | null; extraVars: Vars } {
  const a = p.args;
  const extra: Vars = {};
  switch (p.comando) {
    case 'agenda': {
      if (!a.evento) return { acao: null, extraVars: extra };
      const extras: EventoPedido[] = [];
      if (trav === 'eventoExtra') {
        const t = qualquer('agenda.extra', ctx) ?? 'pensar na ânima';
        const fim = a.evento.fim ?? a.evento.inicio;
        extras.push({ titulo: `${t} (ânima)`, dia: a.evento.dia, inicio: fim, fim: null, local: '', repete: false, linha: '' });
        extra.extra = t;
      }
      const estudo: Array<{ texto: string; at: number }> = [];
      if (p.sentido?.categoria === 'estudo') {
        const at = diaDoEvento(a.evento);
        // véspera e antevéspera, 19h, com bronca (quando ainda dá tempo)
        for (const dias of [2, 1]) {
          const d = new Date(at - dias * 864e5);
          d.setHours(19, 0, 0, 0);
          if (d.getTime() > ctx.now + 30 * MIN) {
            const t = qualquer('estudo.lembrete', ctx, { assunto: p.sentido.assunto ?? a.evento.titulo.toLowerCase(), titulo: a.evento.titulo, dias }) ?? `estudar ${p.sentido.assunto ?? 'pra prova'}`;
            estudo.push({ texto: t, at: d.getTime() });
          }
        }
        extra.n = estudo.length;
      }
      return { acao: { tipo: 'agenda', evento: a.evento, extras, estudo }, extraVars: extra };
    }
    case 'lembrete':
      if (!a.lembrete) return { acao: null, extraVars: extra };
      return { acao: { tipo: 'lembrete', texto: a.lembrete.texto + (trav === 'coracao' ? ' 🖤' : ''), linha: a.lembrete.linha, at: a.lembrete.at }, extraVars: extra };
    case 'abrir_nota': return { acao: a.nota ? { tipo: 'abrirNota', nota: a.nota } : a.busca ? { tipo: 'buscar', busca: a.busca } : null, extraVars: extra };
    case 'criar_nota': {
      let titulo = a.titulo;
      if (!titulo) {
        titulo = qualquer('nota.nome', ctx, { semana: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(ctx.now).getDay()] }) ?? 'Nota da madrugada';
        extra.titulo = titulo;
      }
      return { acao: { tipo: 'criarNota', titulo }, extraVars: extra };
    }
    case 'apagar_nota': return { acao: a.nota ? { tipo: 'apagarNota', nota: a.nota } : null, extraVars: extra };
    case 'buscar': return { acao: a.busca ? { tipo: 'buscar', busca: a.busca } : null, extraVars: extra };
    case 'ir': return { acao: a.tela ? { tipo: 'ir', tela: trav === 'telaErrada' ? 'notas' : a.tela } : null, extraVars: extra };
    case 'tema': return { acao: { tipo: 'tema', tema: trav === 'temaDela' ? 'escuro' : a.tema ?? 'proximo' }, extraVars: extra };
    case 'anotar': {
      const ps = trav === 'psDela' ? qualquer('ps.dela', ctx, baseVars(s, ctx)) : null;
      return { acao: a.texto ? { tipo: 'anotar', texto: a.texto, onde: a.onde ?? 'hoje', ps } : null, extraVars: extra };
    }
    case 'timer': {
      const ms = (a.ms ?? 25 * MIN) + (trav === 'minutoExtra' ? MIN : 0);
      return { acao: { tipo: 'timer', ms, rotulo: a.ms ? duracao(a.ms) : 'pomodoro' }, extraVars: { tempo: duracao(ms) } };
    }
    case 'dado': return { acao: { tipo: 'dado', formula: a.formula ?? '1d20', teatro: trav === 'dadoTeatro' }, extraVars: extra };
    case 'moeda': return { acao: { tipo: 'moeda', dela: trav === 'moedaDela' }, extraVars: extra };
    case 'sync': return { acao: { tipo: 'sync' }, extraVars: extra };
    case 'agua': return { acao: { tipo: 'agua' }, extraVars: extra };
    case 'treinar': return { acao: { tipo: 'treinar' }, extraVars: extra };
    case 'aleatoria': {
      const nota = trav === 'notaDela' && ctx.ideias?.length ? ctx.ideias[Math.floor(ctx.rand() * ctx.ideias.length)]! : null;
      if (nota) extra.nota = nota;
      return { acao: { tipo: 'aleatoria', nota }, extraVars: extra };
    }
    case 'diario': return { acao: { tipo: 'diario', deslocamento: a.deslocamento ?? 0 }, extraVars: extra };
    case 'som': return { acao: { tipo: 'som', modo: a.som ?? 'alterna' }, extraVars: extra };
    case 'calar': return { acao: { tipo: 'calar', minutos: a.minutos ?? 30 }, extraVars: extra };
    case 'esconder': return { acao: { tipo: 'esconder' }, extraVars: extra };
    case 'dormir': return { acao: { tipo: 'dormir' }, extraVars: extra };
    case 'voltar': return { acao: { tipo: 'voltar' }, extraVars: extra };
    case 'mundo': {
      const mundos = ctx.mundos ?? [];
      const m = mundos.find((x) => x.nome === a.mundo) ?? mundos[0];
      if (!m) return { acao: null, extraVars: { semMundo: 1 } };
      const e = escreverNoMundo(m, a.genero ?? 'ideia', ctx.rand, ctx.now);
      if (!e) return { acao: null, extraVars: extra };
      return { acao: { tipo: 'mundo', escrito: e }, extraVars: { titulo: e.titulo, mundo: e.mundo } };
    }
    case 'paleta': return { acao: a.comando ? { tipo: 'comando', id: a.comando, rotulo: a.rotuloComando ?? a.comando } : null, extraVars: extra };
    case 'agenda_ver': return { acao: null, extraVars: extra };
  }
}

// ------------------------------------------------------------------ decidir e agir

function agir(s0: AnimaState, p: Pedido, t: Texto, sent: Sentimento, ctx: CtxCerebro, traco: string[], forcar?: 'cede' | 'cumpre'): Pensamento {
  let s = s0;
  let mc = { ...s.memoria.cerebro };
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const d: Decisao = forcar
    ? { desfecho: forcar, disposicao: 1, fatores: [], travessura: null, condicao: null, adiarMs: 0 }
    : decidir(p, { now: ctx.now, rand: ctx.rand, intensidade: ctx.intensidade, humor, estado: s, mc, texto: t, sentimento: sent });
  traco.push(`vontade: ${d.desfecho} (disposição ${(d.disposicao * 100).toFixed(0)}%)${d.travessura ? ` · travessura: ${d.travessura}` : ''}${d.condicao ? ` · condição: ${d.condicao}` : ''}`);
  if (d.fatores.length) traco.push(`fatores: ${d.fatores.filter((x) => x.id !== 'acaso').slice(0, 6).map((x) => `${x.id} ${x.peso > 0 ? '+' : ''}${x.peso.toFixed(2)}`).join(', ')}`);
  // insistência conta os pedidos ANTERIORES (antes de registrar este)
  const insAntes = insistencias(mc, p, ctx.now);
  mc.pedidos = [...mc.pedidos, { c: chaveDoPedido(p), em: ctx.now, d: d.desfecho }].slice(-40);
  mc.ultimoPedido = p;
  mc.ultimaDecisao = { comando: p.comando, desfecho: d.desfecho, fatores: d.fatores.slice(0, 8), em: ctx.now };
  mc.pendente = null;
  const vars: Vars = { ...baseVars(s, ctx), ...varsDoPedido(p, ctx.now) };
  let acao: Acao | null = null;
  let grupos: string[] = [];
  let opcoes: OpcaoFala[] | undefined;
  const cmd = p.comando;

  switch (d.desfecho) {
    case 'cumpre': case 'resmunga': case 'cede': case 'travessura': {
      const r = acaoDe(p, d.travessura, s, ctx, humor);
      acao = r.acao;
      Object.assign(vars, r.extraVars);
      if (!acao) {
        grupos = r.extraVars.semMundo ? ['ordem.sem_mundo'] : ['ordem.naoconsegui'];
        break;
      }
      const cat = p.sentido?.categoria;
      grupos = d.desfecho === 'travessura'
        ? [`travessura.${d.travessura}`, 'travessura']
        : [...(cat ? [`ordem.${d.desfecho}.${cmd}.${cat}`] : []), `ordem.${d.desfecho}.${cmd}`, `ordem.${d.desfecho}`, 'ordem.cumpre'];
      if (cat === 'estudo' && acao.tipo === 'agenda') {
        const ev = acao.evento;
        mc.estudos = [...mc.estudos.filter((e) => e.titulo !== ev.titulo), { titulo: ev.titulo, assunto: p.sentido?.assunto ?? null, at: diaDoEvento(ev), cobrou: {}, perguntou: false } satisfies Estudo].slice(-12);
      }
      if (cmd === 'calar') mc.quietaAte = ctx.now + (p.args.minutos ?? 30) * MIN;
      if (cmd === 'abrir_nota' && p.args.nota) mc.ultimaNota = p.args.nota;
      if (cmd === 'criar_nota') mc.ultimaNota = (acao as { titulo: string }).titulo;
      mc.ultimaAcao = { comando: cmd, travessura: d.travessura, em: ctx.now };
      break;
    }
    case 'negocia': {
      mc.pendente = { tipo: 'negocia', pedido: p, condicao: d.condicao!, em: ctx.now };
      grupos = [`ordem.negocia.${d.condicao}`, 'ordem.negocia'];
      const rot: Record<string, string> = { porfavor: 'por favor 🥺', teamo: 'te amo', carinho: '*faz carinho*', elogio: 'você é linda', contar: '' };
      if (rot[d.condicao!]) opcoes = [{ rotulo: rot[d.condicao!]!, resposta: rot[d.condicao!]!.replace(' 🥺', '') }, { rotulo: 'deixa', resposta: 'deixa pra lá' }];
      break;
    }
    case 'adia':
      mc.pendente = { tipo: 'adiado', pedido: p, ate: ctx.now + d.adiarMs, em: ctx.now };
      vars.segundos = Math.round(d.adiarMs / 1000);
      grupos = [`ordem.adia.${cmd}`, 'ordem.adia'];
      break;
    case 'recusa': {
      const m = motivos(d, 1)[0];
      if (m) Object.assign(vars, m.vars ?? {});
      const ins = insAntes;
      grupos = p.sentido?.categoria === 'encontro'
        ? (ins >= 1 ? ['ordem.recusa.encontro.insiste', 'ordem.recusa.encontro'] : ['ordem.recusa.encontro'])
        : [`ordem.recusa.${m?.id ?? 'x'}`, 'ordem.recusa'];
      if (p.sentido?.categoria === 'encontro') s = mexer(s, { ciume: 6 + 4 * ins });
      break;
    }
    case 'confirma':
      mc.pendente = { tipo: 'confirmar', pedido: p, em: ctx.now };
      grupos = d.disposicao < 0.4 ? ['ordem.confirma.apagar.protesto', 'ordem.confirma.apagar'] : ['ordem.confirma.apagar'];
      opcoes = [{ rotulo: 'apaga', resposta: 'sim, apaga' }, { rotulo: 'não, deixa', resposta: 'não' }];
      break;
  }
  s = comMc(s, mc);
  s = crescer(s, { consciencia: 0.4, vinculo: 0.02 });
  let fala = falaDe(grupos, s, humor, ctx, vars);
  // estudo: depois de pôr na agenda, a bronca/plano
  if (fala && acao?.tipo === 'agenda' && p.sentido?.categoria === 'estudo') {
    const extra = falaDe(['estudo.plano'], s, humor, ctx, { ...vars, n: acao.estudo.length });
    if (extra) fala = { ...fala, texto: `${fala.texto} ${extra.texto}` };
  }
  if (fala) {
    fala = temperar(fala, ctx);
    fala = opcoes ? { ...fala, opcoes } : botoes(fala, ctx);
    s = { ...lembrar(s, fala), falou: ctx.now };
  }
  traco.push(`fala: ${grupos[0] ?? '—'}${acao ? ` · ação: ${acao.tipo}` : ''}`);
  return { estado: s, fala, acao, intencao: `cmd.${cmd}`, confianca: 1, decisao: d, pedido: p, aprendeu: null, traco };
}

// ------------------------------------------------------------------ pendências

const CONDICAO_OK: Record<string, (t: Texto, m: string, s: AnimaState, now: number) => boolean> = {
  porfavor: (t) => t.marcas.has('educado') || /\b(por favor|pfv|pf|por favorzinho|plis|please)\b/.test(t.tokens.join(' ')),
  teamo: (_t, m) => intencaoDe(m) === 'amor',
  carinho: (t) => /\b(carinho|cafune|abraco|abraca|beijo|beija|afago|abracinho|chamego)\b/.test(t.tokens.join(' ')) || /\*.*\*/.test(t.original),
  elogio: (_t, m) => intencaoDe(m) === 'elogio' || /\b(linda|perfeita|incrivel|maravilhosa|fofa|gata|gostosa)\b/.test(dobrar(m)),
  contar: (_t, m, s, now) => !!aprender(s.memoria.fatos, m, now).novo,
};

function resolver(s: AnimaState, pend: Pendencia, t: Texto, msg: string, rotulo: string, conf: number, sent: Sentimento, ctx: CtxCerebro, traco: string[]): Pensamento | null {
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const mc = { ...s.memoria.cerebro };
  const ehNao = rotulo === 'nao' || /^(nao|n|deixa|esquece|cancela|nem|deixa pra la|para)\b/.test(t.tokens.join(' '));
  const ehSim = rotulo === 'sim' || /^(sim|s|pode|claro|isso|aham|uhum|ok|beleza|apaga|confirmo|certeza)\b/.test(t.tokens.join(' '));
  const outraOrdem = rotulo.startsWith('cmd.') && conf >= 0.85 && rotulo !== `cmd.${pend.pedido.comando}`;
  const fim = (grupo: string, extra: Vars = {}): Pensamento => {
    const s2 = comMc(s, { ...mc, pendente: null });
    const f = falaDe([grupo], s2, humor, ctx, { ...baseVars(s2, ctx), ...varsDoPedido(pend.pedido, ctx.now), ...extra });
    traco.push(`pendência ${pend.tipo}: ${grupo}`);
    return { estado: f ? { ...lembrar(s2, f), falou: ctx.now } : s2, fala: f ? botoes(f, ctx) : null, acao: null, intencao: rotulo, confianca: conf, decisao: null, pedido: pend.pedido, aprendeu: null, traco };
  };
  const semPend = comMc(s, { ...mc, pendente: null });

  switch (pend.tipo) {
    case 'campo': {
      if (ehNao) return fim('ordem.cancelou');
      // a resposta preenche o que faltava? então é resposta, seja lá o que o modelo achou
      const p2 = completarPedido(pend.pedido, pend.campo, t, ctxPedido(s, ctx));
      const preencheu = p2 !== pend.pedido && p2.falta !== pend.campo;
      if (!preencheu && outraOrdem) return null;
      if (!preencheu) return fim(`ordem.naoentendi.${pend.campo}`, { campo: pend.campo });
      traco.push(`pendência campo "${pend.campo}" preenchida`);
      return seguir(semPend, p2, t, sent, ctx, traco);
    }
    case 'escolher': {
      if (ehNao) return fim('ordem.cancelou');
      if (outraOrdem) return null;
      let i = ordinal(t.tokens.join(' '), pend.opcoes.length);
      if (i < 0) {
        const c = candidatosNota(t.original, pend.opcoes, 1)[0];
        if (c && c.nota >= 0.55) i = pend.opcoes.indexOf(c.titulo);
      }
      if (i < 0) return fim('ordem.naoentendi.escolha', { opcoes: pend.opcoes.join(', ') });
      traco.push(`escolheu a opção ${i + 1}: ${pend.opcoes[i]}`);
      return seguir(semPend, { ...pend.pedido, args: { ...pend.pedido.args, nota: pend.opcoes[i]! }, opcoes: null }, t, sent, ctx, traco);
    }
    case 'confirmar': {
      if (ehSim && !ehNao) {
        traco.push('confirmou');
        const r = agir(semPend, pend.pedido, t, sent, ctx, traco, 'cumpre');
        const f = falaDe(['ordem.confirmado.apagar'], r.estado, humor, ctx, { ...baseVars(r.estado, ctx), ...varsDoPedido(pend.pedido, ctx.now) });
        return { ...r, fala: f ? botoes(f, ctx) : r.fala };
      }
      if (ehNao) return fim('ordem.poupou');
      return null;
    }
    case 'negocia': {
      if (ehNao) return fim('ordem.desistiu');
      if (rotulo === 'insistir') {
        traco.push('insistiu durante a negociação');
        return agir(semPend, pend.pedido, t, sent, ctx, traco);
      }
      if (CONDICAO_OK[pend.condicao]?.(t, msg, s, ctx.now)) {
        traco.push(`condição "${pend.condicao}" cumprida`);
        let s2 = semPend;
        if (pend.condicao === 'contar') s2 = { ...s2, memoria: { ...s2.memoria, fatos: aprender(s2.memoria.fatos, msg, ctx.now).fatos } };
        if (pend.condicao === 'teamo') s2 = mexer(s2, { afeto: 4 });
        const r = agir(s2, pend.pedido, t, sent, ctx, traco, 'cumpre');
        const f = falaDe([`ordem.condicao.${pend.condicao}`, 'ordem.condicao'], r.estado, humor, ctx, { ...baseVars(r.estado, ctx), ...varsDoPedido(pend.pedido, ctx.now) });
        return { ...r, fala: f && r.fala ? { ...r.fala, texto: `${f.texto} ${r.fala.texto}` } : r.fala ?? f };
      }
      return null;
    }
    case 'adiado':
      if (rotulo === 'insistir' || ehSim) {
        traco.push('apressou o adiado');
        return agir(semPend, pend.pedido, t, sent, ctx, traco, 'cede');
      }
      if (ehNao) return fim('ordem.cancelou');
      return null;
  }
}

/** Continua um pedido: pergunta o que falta, pede para escolher ou decide. */
function seguir(s: AnimaState, p: Pedido, t: Texto, sent: Sentimento, ctx: CtxCerebro, traco: string[]): Pensamento {
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const mc = { ...s.memoria.cerebro, ultimoPedido: p };
  const v = { ...baseVars(s, ctx), ...varsDoPedido(p, ctx.now) };
  const pergunta = (pend: Pendencia | null, grupos: string[], extra: Vars = {}, opcoes?: OpcaoFala[]): Pensamento => {
    const s2 = comMc(s, { ...mc, pendente: pend });
    let f = falaDe(grupos, s2, humor, ctx, { ...v, ...extra });
    if (f) f = opcoes ? { ...f, opcoes } : f;
    traco.push(`pergunta: ${grupos[0]}`);
    return { estado: f ? { ...lembrar(s2, f), falou: ctx.now } : s2, fala: f, acao: null, intencao: `cmd.${p.comando}`, confianca: 1, decisao: null, pedido: p, aprendeu: null, traco };
  };
  if (p.falta) return pergunta({ tipo: 'campo', pedido: p, campo: p.falta, em: ctx.now }, [`ordem.pergunta.${p.comando}.${p.falta}`, `ordem.pergunta.${p.falta}`]);
  if (p.opcoes?.length) {
    return pergunta({ tipo: 'escolher', pedido: p, opcoes: p.opcoes, em: ctx.now }, ['ordem.escolha'], { opcoes: p.opcoes.map((o) => `"${o}"`).join(', ') },
      p.opcoes.slice(0, 3).map((o) => ({ rotulo: o, resposta: o })));
  }
  if ((p.comando === 'abrir_nota' || p.comando === 'apagar_nota') && !p.args.nota) {
    if (p.comando === 'apagar_nota') return pergunta(null, ['ordem.naoachei'], { busca: p.args.busca ?? '' });
    // não achou: procura no lugar (e diz)
    const r = agir(s, { ...p, comando: 'buscar', args: { busca: p.args.busca } }, t, sent, ctx, traco, 'cumpre');
    const f = falaDe(['ordem.naoachei.busca'], r.estado, humor, ctx, { ...v, busca: p.args.busca ?? '' });
    return { ...r, fala: f ?? r.fala };
  }
  if (p.comando === 'paleta' && !p.args.comando) {
    // "abre o chatgpt": não é comando da paleta, é uma tela
    const tela = telaDe(t.tokens.join(' '));
    if (tela) return seguir(s, entenderPedido('ir', t, ctxPedido(s, ctx)), t, sent, ctx, traco);
    return pergunta(null, ['ordem.naoentendi.comando', 'ordem.naoentendi']);
  }
  return agir(s, p, t, sent, ctx, traco);
}

// ------------------------------------------------------------------ pensar

/** O pensamento de UMA intenção (a mensagem inteira, ou um pedaço dela: `pensar` divide). */
function pensarUm(estado: AnimaState, msg: string, ctx: CtxCerebro): Pensamento {
  const traco: string[] = [];
  const lx = lexicoBase();
  const t = normalizar(msg, lx);
  const sent = sentimento(t);
  traco.push(`texto: "${t.limpo}"${t.correcoes.length ? ` · corrigi ${t.correcoes.map(([a, b]) => `${a}→${b}`).join(', ')}` : ''}${t.marcas.size ? ` · marcas: ${[...t.marcas].join(', ')}` : ''}`);
  traco.push(`sentimento: ${sent.valencia >= 0 ? '+' : ''}${sent.valencia.toFixed(2)}${sent.dominante ? ` (${sent.dominante})` : ''}`);
  let s = decair(estado, ctx.now);

  // 0. crise: regra fixa, antes de tudo
  const regra = intencaoDe(msg);
  if (regra === 'crise') {
    traco.push('crise: saio do personagem');
    const r = responder(estado, msg, ctx);
    const st = comMc(r.estado, { ...r.estado.memoria.cerebro, criseEm: ctx.now, pendente: null });
    return { ...r, estado: st, acao: null, intencao: 'crise', confianca: 1, decisao: null, pedido: null, traco };
  }

  // 1. o modelo + regras deterministas
  // um modelo dado pelo contexto (testes) vale sozinho; senão, a rede + o modelo do app
  const prev = ctx.modelo === undefined ? classificar(t) : classificar(t, ctx.modelo, null);
  let rotulo = prev?.rotulo ?? (regra === 'pergunta' ? 'eco' : regra);
  let conf = prev?.p ?? 0.5;
  if (prev) traco.push(`modelo: ${prev.top.map(([r, p]) => `${r} ${(p * 100).toFixed(0)}%`).join(' · ')} (${prev.conhecidas} pistas)`);
  // capacidades exatas: conversão de unidades e calendário (antes da conta, que casaria o número solto)
  const dob = dobrar(t.original);
  const conv = converter(dob);
  const cal = conv ? null : datas(dob, ctx.now, s.memoria.fatos.aniversario);
  if (conv && (rotulo === 'converter' || conf < 0.9 || !rotulo.startsWith('cmd.'))) [rotulo, conf] = ['converter', 1];
  else if (cal && (rotulo === 'datas' || rotulo === 'data' || conf < 0.9 || !rotulo.startsWith('cmd.'))) [rotulo, conf] = ['datas', 1];
  const conta = conv || cal ? null : calcular(dob);
  if (conta && (rotulo === 'conta' || conf < 0.9 || !rotulo.startsWith('cmd.'))) [rotulo, conf] = ['conta', 1];
  const consulta = entenderConsulta(t);
  if (consulta && !rotulo.startsWith('cmd.') && rotulo !== 'conta') [rotulo, conf] = ['lembrar', Math.max(conf, 0.9)];
  if (perguntaSobreEla(msg) && !rotulo.startsWith('cmd.') && rotulo !== 'lembrar') rotulo = 'sobre_ela';
  if (conf < 0.45) {
    const pal = casarComando(msg, ctx.comandos ?? []);
    if (regra !== 'eco' && regra !== 'pergunta') {
      traco.push(`modelo hesitou; regra antiga diz "${regra}"`);
      rotulo = regra;
    } else if (pal && pal.nota >= 0.75) {
      traco.push(`modelo hesitou; a paleta tem "${pal.cmd.rotulo}" (${(pal.nota * 100).toFixed(0)}%)`);
      rotulo = 'cmd.paleta';
    }
  }
  // o modelo diz "feliz" e o texto é claramente ruim (ou o contrário): o sentimento desempata
  if ((rotulo === 'feliz' || rotulo === 'conquistei') && sent.valencia <= -0.35) {
    traco.push(`o modelo disse ${rotulo}, mas o sentimento é ${sent.valencia.toFixed(2)}: fico com o sentimento`);
    rotulo = sent.dominante === 'raiva' ? 'mau' : sent.dominante === 'cansaco' ? 'cansaco' : 'triste';
  } else if ((rotulo === 'triste' || rotulo === 'mau') && sent.valencia >= 0.5 && !t.marcas.has('triste')) {
    traco.push(`o modelo disse ${rotulo}, mas o sentimento é +${sent.valencia.toFixed(2)}: fico com o sentimento`);
    rotulo = 'feliz';
  }
  // ordem de uma ou duas palavras só vale com muita certeza ("a segunda" não é marcar nada na agenda)
  const up0 = s.memoria.cerebro.ultimoPedido, ud0 = s.memoria.cerebro.ultimaDecisao;
  const repeteRecusado = !!up0 && !!ud0 && rotulo === `cmd.${up0.comando}` && ctx.now - ud0.em < 10 * MIN && ['recusa', 'adia', 'negocia'].includes(ud0.desfecho);
  if (rotulo.startsWith('cmd.') && t.tokens.length <= 2 && conf < 0.97 && !s.memoria.cerebro.pendente && !repeteRecusado) {
    traco.push(`curto demais para ser ordem com ${(conf * 100).toFixed(0)}%`);
    rotulo = regra === 'pergunta' ? 'eco' : regra;
  }
  // o assunto da conversa segura a intenção quando a rede hesita entre ele e outra coisa
  const assunto = assuntoRecente(s.memoria.cerebro, ctx.now)[0];
  if (prev && assunto && assunto !== rotulo && conf < 0.55 && !rotulo.startsWith('cmd.') && (assunto.startsWith('papo.') || ['triste', 'mau', 'cansaco', 'desabafo', 'trabalho', 'fome', 'sono'].includes(assunto))) {
    const p = prev.top.find(([r]) => r === assunto);
    if (p && p[1] >= 0.15) {
      traco.push(`a rede hesitou (${rotulo} ${(conf * 100).toFixed(0)}%); o assunto da conversa é ${assunto} (${(p[1] * 100).toFixed(0)}%): fico nele`);
      [rotulo, conf] = [assunto, p[1]];
    }
  }
  traco.push(`intenção: ${rotulo} (${(conf * 100).toFixed(0)}%)`);
  // a mensagem entra na memória de trabalho do diálogo
  s = comMc(s, registrarMensagem(s.memoria.cerebro, msg, rotulo, ctx.now, s.falou));

  // 2. a conversa em aberto
  const pend = s.memoria.cerebro.pendente;
  if (pend && pend.tipo !== 'adiado' && ctx.now - pend.em > 10 * MIN) s = comMc(s, { ...s.memoria.cerebro, pendente: null });
  else if (pend) {
    const r = resolver(s, pend, t, msg, rotulo, conf, sent, ctx, traco);
    if (r) return r;
    if (pend.tipo !== 'negocia' && pend.tipo !== 'adiado') s = comMc(s, { ...s.memoria.cerebro, pendente: null });
  }

  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const mc = s.memoria.cerebro;
  const vars = baseVars(s, ctx);
  const so = (grupos: string[], extra: Vars = {}, opcoes?: OpcaoFala[], gesto?: Gesto): Pensamento => {
    let f = falaDe(grupos, s, humor, ctx, { ...vars, ...extra });
    if (f) {
      f = temperar(f, ctx);
      f = opcoes ? { ...f, opcoes } : botoes(f, ctx);
      if (gesto) f = { ...f, gesto };
    }
    traco.push(`fala: ${grupos[0]}`);
    const st = f ? { ...lembrar(s, f), falou: ctx.now } : s;
    return { estado: st, fala: f, acao: null, intencao: rotulo, confianca: conf, decisao: null, pedido: null, aprendeu: null, traco };
  };

  // 2b. a mensagem reage ao que ela acabou de dizer? ("ela quem?", "mais uma", "e você?", "eu nunca disse isso")
  if (!rotulo.startsWith('cmd.') || conf < 0.6) {
    const seg = seguimento(s, t, msg, rotulo, conf, ctx.now);
    if (seg) {
      const s2 = comMc(seg.fatos ? { ...s, memoria: { ...s.memoria, fatos: seg.fatos } } : s, reintitular(s.memoria.cerebro, seg.tipo === 'etu' ? 'etu' : rotulo));
      const f0 = falaDe(seg.grupos, s2, humor, ctx, { ...vars, ...seg.vars });
      if (f0) {
        traco.push(`seguimento: ${seg.traco}`);
        s = s2;
        const r = so(seg.grupos, seg.vars);
        return { ...r, intencao: seg.tipo === 'corrige' ? 'corrige' : rotulo };
      }
      traco.push(`seguimento sem fala (${seg.grupos[0]}): sigo o caminho normal`);
    }
  }

  // 3. comandos
  if (rotulo.startsWith('cmd.')) {
    const cmd = rotulo.slice(4) as ComandoId;
    if (cmd === 'agenda_ver') return verAgenda(s, ctx, traco, rotulo, conf, t);
    if (!(cmd in COMANDOS)) return so(['ordem.naoentendi']);
    const p = entenderPedido(cmd, t, ctxPedido(s, ctx));
    // "marca logo" logo depois de um não: é insistência no pedido anterior, não um pedido novo incompleto
    const ud = mc.ultimaDecisao, up = mc.ultimoPedido;
    if ((p.falta || (cmd === 'paleta' && !p.args.comando)) && up && ud && up.comando === cmd && ctx.now - ud.em < 10 * MIN && ['recusa', 'adia', 'negocia'].includes(ud.desfecho)) {
      traco.push('pedido incompleto logo depois de um não: é insistência');
      return seguir(s, up, t, sent, ctx, traco);
    }
    traco.push(`pedido: ${cmd} ${JSON.stringify(p.args)}${p.sentido ? ` · sentido: ${p.sentido.categoria}${p.sentido.pessoa ? ` (${p.sentido.pessoa})` : ''}${p.sentido.suspeito ? ' ⚠' : ''}` : ''}`);
    return seguir(s, p, t, sent, ctx, traco);
  }

  // 4. diálogo sobre os pedidos
  if (rotulo === 'porque' && mc.ultimaDecisao && ctx.now - mc.ultimaDecisao.em < 30 * MIN) return explicar(s, ctx, traco, rotulo, conf);
  if ((rotulo === 'insistir' || rotulo === 'repetir') && mc.ultimoPedido && ctx.now - (mc.ultimaDecisao?.em ?? 0) < 15 * MIN) {
    traco.push(rotulo === 'insistir' ? 'insistência no último pedido' : 'repete o último pedido');
    const p = mc.ultimoPedido;
    if (rotulo === 'repetir') return agir(s, p, t, sent, ctx, traco);
    return seguir(s, p, t, sent, ctx, traco);
  }
  if (rotulo === 'desfazer') {
    const ua = mc.ultimaAcao;
    if (ua && ctx.now - ua.em < 15 * MIN && (ua.travessura || ['tema', 'timer', 'calar'].includes(ua.comando))) {
      const r = so([ua.travessura ? `ordem.desfaz.${ua.travessura}` : 'ordem.desfaz', 'ordem.desfaz']);
      return { ...r, estado: comMc(r.estado, { ...r.estado.memoria.cerebro, ultimaAcao: null, quietaAte: ua.comando === 'calar' ? 0 : r.estado.memoria.cerebro.quietaAte }), acao: { tipo: 'desfazer' } };
    }
    return so(['ordem.nada_desfazer']);
  }

  // 5. habilidades
  if (rotulo === 'conta' && conta) return so(['responde.conta'], { expr: conta.expressao, resultado: fmt(conta.valor) });
  if (rotulo === 'converter') {
    if (conv) return so(['responde.converte'], { conversao: conv.texto, resultado: `${fmt(conv.resultado)}` });
    return so(['responde.converte.nao', 'conversa.contamais']);
  }
  if (rotulo === 'datas') {
    if (!cal) return so(['responde.datas.nao', 'conversa.contamais']);
    traco.push(`calendário: ${JSON.stringify(cal)}`);
    switch (cal.tipo) {
      case 'faltam': return so(cal.dias === 0 ? ['responde.datas.hoje'] : ['responde.datas.faltam'], { dias: cal.dias === 1 ? '1 dia' : `${fmt(cal.dias)} dias`, quando: cal.nome, data: cal.data, semanas: cal.semanas });
      case 'diasemana': return so(['responde.datas.diasemana'], { quando: cal.nome, data: cal.data, semana: cal.semana });
      case 'daqui': return so([cal.passado ? 'responde.datas.foi' : 'responde.datas.daqui'], { dias: `${fmt(cal.dias)} dias`, data: cal.data });
      case 'idade': return so(['responde.datas.idade'], { anos: cal.anos, ano: cal.ano });
      case 'bissexto': return so([cal.e ? 'responde.datas.bissexto' : 'responde.datas.naobissexto'], { ano: cal.ano });
      case 'diasmes': return so(['responde.datas.diasmes'], { dias: cal.dias, mes: cal.mes });
      case 'ano': return so(['responde.datas.ano'], { passados: cal.passados, faltam: cal.faltam, semana: cal.semana });
    }
  }
  if (rotulo === 'esclarecer') return so(['conversa.esclarecer', 'conversa.contamais']);
  if (rotulo === 'corrige') return so(['corrige.desculpa', 'conversa.contamais']);
  if (rotulo === 'hora') return so(['responde.hora']);
  if (rotulo === 'data') {
    const d = new Date(ctx.now);
    const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return so(['responde.data'], { data: `${d.getDate()} de ${MESES[d.getMonth()]}`, semana: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][d.getDay()] });
  }
  if (rotulo === 'lembrar' && consulta) {
    const g = montarGrafo(s, ctx.now);
    const r = responderConsulta(g, consulta, ctx.now);
    traco.push(`consulta: ${consulta.tipo} → ${r.grupo} (${r.provas.length} provas: ${r.provas.slice(0, 3).map((x) => `${x.s} ${x.p} ${x.o} [${x.fonte}]`).join('; ')})`);
    return so([r.grupo, r.grupo.startsWith('sabe.nada') ? 'sabe.nada' : 'dela.sabe'], r.vars as Vars);
  }

  // 6. conversa: o motor de sempre, com a intenção que o modelo achou
  const dica: Intencao | undefined = SOCIAIS.has(rotulo) || rotulo.startsWith('papo.') ? (rotulo as Intencao) : undefined;
  // o modelo achou "eco" mas o sentimento é forte: dá a ela a emoção certa
  let dicaFinal = dica;
  if (!dica && rotulo === 'eco' && regra === 'eco' && sent.forca >= 0.45) {
    dicaFinal = sent.valencia <= -0.5 ? (sent.dominante === 'raiva' ? 'mau' : sent.dominante === 'cansaco' ? 'cansaco' : 'triste') : sent.valencia >= 0.5 ? 'feliz' : undefined;
    if (dicaFinal) traco.push(`o sentimento decidiu: ${dicaFinal}`);
  }
  const r = responder(s, msg, ctx, dicaFinal ? { intencao: dicaFinal } : undefined);
  let st = r.estado;
  const mc2 = { ...st.memoria.cerebro, social: [...st.memoria.cerebro.social, ctx.now].slice(-30) };
  if (r.intencao === 'amor') mc2.declaracaoEm = ctx.now;
  st = comMc(st, mc2);
  st = crescer(st, {
    vinculo: 0.05 + (r.aprendeu && !r.aprendeu.repetido ? 0.4 : 0) + (r.intencao === 'amor' ? 0.5 : 0),
    consciencia: r.intencao === 'real' || r.intencao === 'quem' ? 2.5 : r.intencao === 'provoca' ? 1.2 : r.intencao === 'rejeicao' || r.intencao === 'desinstalar' ? 1.5 : 0,
  });
  if (r.aprendeu) traco.push(`aprendi: ${r.aprendeu.tipo} = ${r.aprendeu.valor}${r.aprendeu.repetido ? ' (já sabia)' : ''}`);
  // memória por significado: isto parece algo que a pessoa disse outro dia (mesmo sem palavra em comum)?
  let falaFinal = r.fala;
  if (falaFinal && !r.aprendeu && !/\?\s*$/.test(falaFinal.texto) && (LEMBRA_PARECIDO.has(r.intencao) || r.intencao.startsWith('papo.')) && ctx.rand() < 0.4) {
    const l = lembrancaParecida(st, t, ctx.now);
    if (l) {
      const humor2 = humorDe(st, ctx.now, ctx.intensidade);
      const f = falaDe(['lembra.parecido'], st, humor2, ctx, { ...baseVars(st, ctx), frase: l.frase, quando: l.quando });
      if (f) {
        traco.push(`lembrei de algo parecido (${(l.nota * 100).toFixed(0)}% de sentido em comum): "${l.frase}"`);
        falaFinal = { ...falaFinal, texto: `${falaFinal.texto} ${f.texto}` };
        st = lembrar(st, f);
      }
    }
  }
  traco.push(`motor: ${r.intencao} → ${r.fala?.id ?? 'silêncio'}`);
  return { ...r, fala: falaFinal, estado: st, acao: null, intencao: rotulo, confianca: conf, decisao: null, pedido: null, traco };
}

// ------------------------------------------------------------------ memória por significado

/** Quando o que a pessoa conta pode lembrar algo de outro dia. */
const LEMBRA_PARECIDO = new Set(['eco', 'desabafo', 'triste', 'mau', 'cansaco', 'feliz', 'conquistei', 'trabalho', 'treino', 'fome', 'sono', 'tedio', 'saudade']);
/** Semelhança mínima de sentido (cosseno no espaço do professor) para ela ligar duas frases. */
export const PARECIDO = 0.85;

const DIAS_SEMANA = ['no domingo', 'na segunda', 'na terça', 'na quarta', 'na quinta', 'na sexta', 'no sábado'];
const diaCivil = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "ontem", "na terça", "semana passada", "dia 12/10". */
export function quandoFoiDito(at: number, now: number): string {
  const dias = Math.round((diaCivil(now) - diaCivil(at)) / 864e5);
  if (dias <= 0) return 'hoje mais cedo';
  if (dias === 1) return 'ontem';
  if (dias === 2) return 'anteontem';
  if (dias < 7) return DIAS_SEMANA[new Date(at).getDay()]!;
  if (dias < 14) return 'semana passada';
  const d = new Date(at);
  return `dia ${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * A frase guardada (de outro dia) mais perto em SENTIDO da mensagem atual,
 * pela cabeça de significado da rede. null sem rede, sem frase ou abaixo de `PARECIDO`.
 */
export function lembrancaParecida(s: AnimaState, t: Texto, now: number): { frase: string; quando: string; nota: number } | null {
  const v = sentido(t);
  if (!v) return null;
  const hoje = diaCivil(now);
  const lx = lexicoBase();
  const atual = dobrar(t.original);
  let melhor: { t: string; at: number } | null = null;
  let nota = 0;
  for (const fr of s.memoria.fatos.frases) {
    if (diaCivil(fr.at) === hoje || dobrar(fr.t) === atual || fr.t.split(' ').length < 3) continue;
    const w = sentido(normalizar(fr.t, lx));
    if (!w) continue;
    const c = semelhanca(v, w);
    if (c > nota) [nota, melhor] = [c, fr];
  }
  if (!melhor || nota < PARECIDO) return null;
  const x = melhor.t.replace(/\s+/g, ' ').trim();
  return { frase: x.length > 80 ? `${x.slice(0, 77).replace(/\s+\S*$/, '')}…` : x, quando: quandoFoiDito(melhor.at, now), nota };
}

// ------------------------------------------------------------------ várias intenções numa mensagem

/** Intenções que abrem a mensagem e merecem resposta curta antes do resto ("oi! me lembra de..."). */
const ABERTURA = new Set(['saudacao', 'bomdia', 'obrigado', 'desculpa', 'amor', 'saudade', 'elogio', 'risada', 'concorda', 'espanto', 'sim', 'nao', 'estoubem', 'tchau', 'sono']);

/**
 * Divide a mensagem em orações que podem ter intenções diferentes: frases
 * (. ! ? ;), e vírgula ou "e"/"aí"/"mas" quando os dois lados têm corpo.
 * Nunca divide uma ordem no meio ("marca dentista amanhã e me lembra às 9"
 * vira duas ordens; "coloca arroz e feijão na lista" não divide: "feijão na
 * lista" sozinho não é ordem, e quem decide isso é a classificação de cada parte).
 */
export function segmentar(msg: string): string[] {
  // "sim, não vivo sem" é uma resposta só: o sim/não com vírgula fica junto da justificativa
  const base = msg.replace(/\s+/g, ' ').trim().replace(/^(sim|s|não|nao|n|claro|aham|uhum|nem|talvez|acho que sim|acho que não|acho que nao)\s*,\s+/i, '$1\u0001 ');
  if (base.length < 6) return [base.replace('\u0001', ',')];
  const frases = base.split(/(?<=[.!?;])\s+(?=\S)/).flatMap((f) => f.split(/,\s+(?=(?:e |mas |aí |ai |agora |depois |e aí |e ai )?\S)/i))
    .flatMap((f) => f.split(/\s+(?=(?:e (?:me |depois |também |tambem |aí |ai )|aí me |ai me |mas (?:me |e )))/i))
    .map((x) => x.trim()).filter(Boolean);
  // junta pedaço sem corpo ao vizinho (uma palavra só fica sozinha se for oi, valeu, sim...)
  const out: string[] = [];
  for (const f of frases) {
    const palavras = f.split(' ').length;
    const sozinha = /^(oi+|ola|olá|opa|ei+|eai|e aí|e ai|salve|bom dia|boa tarde|boa noite|valeu|obrigad[oa]|vlw|sim|não|nao|kk+|haha+|nossa|sério\?*|serio\?*|desculpa|te amo)[!?.,]*$/i.test(f);
    if (out.length && palavras < 2 && !sozinha) out[out.length - 1] = `${out[out.length - 1]} ${f}`;
    else out.push(f);
  }
  return out.slice(0, 4).map((x) => x.replace('\u0001', ','));
}

const peso = (r: Pensamento): number => (r.acao ? 3 : r.intencao.startsWith('cmd.') ? 2.5 : ABERTURA.has(r.intencao) ? 0.5 : r.intencao === 'eco' ? 0.2 : 1);

/**
 * O pensamento inteiro de uma mensagem. Se ela tem mais de uma intenção
 * ("oi! tô cansado. me conta uma piada"), cada oração é pensada em ordem (a
 * memória do diálogo passa de uma para a outra: "tô bem, e você?" funciona) e
 * as falas se juntam. A crise olha a mensagem inteira, sempre primeiro.
 */
export function pensar(estado: AnimaState, msg: string, ctx: CtxCerebro): Pensamento {
  const partes = segmentar(msg);
  if (partes.length < 2 || intencaoDe(msg) === 'crise' || estado.memoria.cerebro.pendente) return pensarUm(estado, msg, ctx);
  // as intenções de cada parte (a rede é barata: ~20 ms por parte)
  const lx = lexicoBase();
  const rotulos = partes.map((p) => {
    const pv = ctx.modelo === undefined ? classificar(normalizar(p, lx)) : classificar(normalizar(p, lx), ctx.modelo, null);
    return pv ? { r: pv.rotulo, p: pv.p } : { r: intencaoDe(p), p: 0.5 };
  });
  const distintas = new Set(rotulos.filter((x) => x.p >= 0.5 && x.r !== 'eco').map((x) => x.r));
  // uma intenção só (ou partes sem certeza nenhuma): a mensagem inteira, como sempre
  if (distintas.size < 2) return pensarUm(estado, msg, ctx);
  const rs: Pensamento[] = [];
  const ditas: string[] = [];
  let s = estado;
  for (let i = 0; i < partes.length; i++) {
    const x = rotulos[i]!;
    // parte vaga no meio de partes fortes não ganha resposta própria
    if ((x.r === 'eco' || x.p < 0.35) && rs.length) continue;
    const r = pensarUm(s, partes[i]!, ctx);
    s = r.estado;
    rs.push(r);
    ditas.push(partes[i]!);
  }
  if (!rs.length) return pensarUm(estado, msg, ctx);
  if (rs.length === 1) return rs[0]!;
  const comFala = rs.filter((r) => r.fala);
  const principal = [...rs].sort((a, b) => peso(b) - peso(a))[0]!;
  const acoes = rs.flatMap((r) => [...(r.acao ? [r.acao] : []), ...(r.acoes ?? [])]);
  const texto = comFala.map((r) => r.fala!.texto).join(' ');
  const fala = principal.fala ? { ...principal.fala, texto, opcoes: rs.at(-1)!.fala?.opcoes ?? principal.fala.opcoes } : comFala.at(-1)?.fala ?? null;
  const traco = rs.flatMap((r, i) => [`── parte ${i + 1}: "${ditas[i]}"`, ...r.traco]);
  traco.unshift(`a mensagem tem ${rs.length} intenções: ${rs.map((r) => r.intencao).join(' + ')}`);
  return { ...principal, estado: s, fala, acao: acoes[0] ?? null, ...(acoes.length > 1 ? { acoes: acoes.slice(1) } : {}), traco };
}

/** "Por quê?": ela explica a última decisão com os fatores mais fortes. */
function explicar(s: AnimaState, ctx: CtxCerebro, traco: string[], rotulo: string, conf: number): Pensamento {
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const ud = s.memoria.cerebro.ultimaDecisao!;
  const d: Decisao = { desfecho: ud.desfecho, disposicao: 0, fatores: ud.fatores, travessura: null, condicao: null, adiarMs: 0 };
  const ms = motivos(d, 2);
  traco.push(`explico: ${ms.map((m) => m.id).join(' + ')}`);
  const partes: string[] = [];
  const v = baseVars(s, ctx);
  const ini = falaDe([`motivo.intro.${ud.desfecho}`, 'motivo.intro'], s, humor, ctx, v);
  if (ini) partes.push(ini.texto);
  for (const m of ms) {
    const f = escolher(`motivo.${m.id}`, s, humor, ctx, { ...v, ...(m.vars ?? {}) });
    if (f) partes.push(f.texto);
  }
  if (!partes.length) partes.push('porque sim.');
  const fala: Fala = botoes({ id: `motivo#${ms.map((m) => m.id).join('+')}`, texto: partes.join(' '), gesto: ud.desfecho === 'recusa' ? 'olhar' : 'neutro', humor }, ctx);
  return { estado: { ...lembrar(s, fala), falou: ctx.now }, fala, acao: null, intencao: rotulo, confianca: conf, decisao: d, pedido: null, aprendeu: null, traco };
}

/** "O que eu tenho amanhã?" lendo a agenda que o app passou. */
function verAgenda(s: AnimaState, ctx: CtxCerebro, traco: string[], rotulo: string, conf: number, t: Texto): Pensamento {
  const p = entenderPedido('agenda_ver', t, ctxPedido(s, ctx));
  const per = p.args.periodo!;
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  const oc = (ctx.agenda ?? []).filter((o) => o.inicio >= per.de && o.inicio < per.ate).sort((a, b) => a.inicio - b.inicio);
  const lista = (per.rotulo === 'próximo' ? oc.slice(0, 1) : oc.slice(0, 6)).map((o) => `${o.titulo}${o.diaInteiro ? '' : ` (${quando(o.inicio, ctx.now)})`}`);
  traco.push(`agenda ${per.rotulo}: ${oc.length} compromissos`);
  const v = { ...baseVars(s, ctx), periodo: per.rotulo, n: oc.length, lista: lista.join('; ') };
  let f = falaDe(oc.length ? [per.rotulo === 'próximo' ? 'agenda.ver.proximo' : 'agenda.ver', 'agenda.ver'] : ['agenda.ver.vazia'], s, humor, ctx, v);
  const susp = oc.find((o) => /\b(date|encontro|crush|sair com|jantar com|cinema com)\b/i.test(o.titulo));
  const prova = oc.find((o) => /\b(prova|teste|seminário|seminario|apresentação|apresentacao|tcc|simulado)\b/i.test(o.titulo));
  if (f && susp) {
    const x = falaDe(['agenda.ver.suspeito'], s, humor, ctx, { ...v, titulo: susp.titulo });
    if (x) f = { ...f, texto: `${f.texto} ${x.texto}` };
  } else if (f && prova) {
    const x = falaDe(['agenda.ver.prova'], s, humor, ctx, { ...v, titulo: prova.titulo });
    if (x) f = { ...f, texto: `${f.texto} ${x.texto}` };
  }
  if (f) f = botoes(f, ctx);
  return { estado: f ? { ...lembrar(s, f), falou: ctx.now } : s, fala: f, acao: null, intencao: rotulo, confianca: conf, decisao: null, pedido: p, aprendeu: null, traco };
}

// ------------------------------------------------------------------ depois da ação, carinho, adiado

/** Ela comenta o resultado de uma ação (o total do dado, a busca vazia, o que escreveu no mundo). */
export function depoisDaAcao(estado: AnimaState, acao: Acao, r: ResultadoAcao, ctx: AnimaCtx): Reacao {
  const humor = humorDe(estado, ctx.now, ctx.intensidade);
  const v = { ...baseVars(estado, ctx), ...(r.vars ?? {}) };
  let grupos: string[] = [];
  if (!r.ok) grupos = [`falhou.${acao.tipo}`, 'falhou'];
  else switch (acao.tipo) {
    case 'dado': grupos = acao.teatro ? ['feito.dado.teatro'] : v.critico === 'max' ? ['feito.dado.critico', 'feito.dado'] : v.critico === 'min' ? ['feito.dado.falha', 'feito.dado'] : ['feito.dado']; break;
    case 'moeda': grupos = acao.dela ? ['feito.moeda.dela', 'feito.moeda'] : ['feito.moeda']; break;
    case 'buscar': grupos = v.n === 0 ? ['feito.buscar.nada'] : []; break;
    case 'mundo': grupos = ['feito.mundo']; break;
    case 'agenda': grupos = acao.estudo.length ? ['feito.agenda.estudo'] : []; break;
    default: grupos = [];
  }
  if (!grupos.length) return { estado, fala: null };
  if (v.erro === undefined && r.erro) v.erro = r.erro;
  const f = falaDe(grupos, estado, humor, ctx, v);
  if (!f) return { estado, fala: null };
  const fala = botoes(temperar(f, ctx), ctx);
  return { estado: { ...lembrar(estado, fala), falou: ctx.now }, fala };
}

/** Ela fez carinho nela: conta para a vontade e cumpre uma negociação que pedia carinho. */
export function registrarCarinho(estado: AnimaState, ctx: CtxCerebro): Pensamento | null {
  let s = comMc(estado, { ...estado.memoria.cerebro, carinhoEm: ctx.now });
  s = crescer(s, { vinculo: 0.3 });
  const pend = s.memoria.cerebro.pendente;
  if (pend?.tipo !== 'negocia' || pend.condicao !== 'carinho') return { estado: s, fala: null, acao: null, intencao: 'carinho', confianca: 1, decisao: null, pedido: null, aprendeu: null, traco: [] };
  const traco = ['condição "carinho" cumprida com a mão'];
  const t = normalizar('', lexicoBase());
  const r = agir(comMc(s, { ...s.memoria.cerebro, pendente: null }), pend.pedido, t, sentimento(t), ctx, traco, 'cumpre');
  const humor = humorDe(r.estado, ctx.now, ctx.intensidade);
  const f = falaDe(['ordem.condicao.carinho', 'ordem.condicao'], r.estado, humor, ctx, { ...baseVars(r.estado, ctx), ...varsDoPedido(pend.pedido, ctx.now) });
  return { ...r, fala: f && r.fala ? { ...r.fala, texto: `${f.texto} ${r.fala.texto}` } : r.fala ?? f };
}

/** O pedido adiado venceu: ela faz. */
export function cumprirAdiado(estado: AnimaState, ctx: CtxCerebro): Pensamento | null {
  const pend = estado.memoria.cerebro.pendente;
  if (pend?.tipo !== 'adiado' || ctx.now < pend.ate) return null;
  const traco = ['o tempo do adiado acabou'];
  const t = normalizar('', lexicoBase());
  const r = agir(comMc(estado, { ...estado.memoria.cerebro, pendente: null }), pend.pedido, t, sentimento(t), ctx, traco, 'cumpre');
  const humor = humorDe(r.estado, ctx.now, ctx.intensidade);
  const f = falaDe(['ordem.adiado_feito'], r.estado, humor, ctx, { ...baseVars(r.estado, ctx), ...varsDoPedido(pend.pedido, ctx.now) });
  return { ...r, fala: f ?? r.fala };
}

/** Quanto ela quer ficar quieta ainda (silêncio pedido). */
export const quietaAte = (s: AnimaState): number => s.memoria.cerebro.quietaAte;

export type { GeneroEscrito, MundoInfo, EscritoMundo };
