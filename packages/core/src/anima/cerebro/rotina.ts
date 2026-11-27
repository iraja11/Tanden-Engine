/*
 * A rotina: o que ela faz sem ninguém pedir. O app chama `rotina` de tempos
 * em tempos (quando a pessoa está por perto e ninguém está falando); ela
 * escolhe no máximo UMA coisa, em ordem de importância:
 *
 *   1. capítulo novo da relação (uma vez por capítulo)
 *   2. prova chegando: cobra estudo, com mais bronca quanto mais perto
 *      (e depois da prova, pergunta como foi)
 *   3. compromisso chegando em menos de uma hora (encontro = ciúme)
 *   4. pôr uma coisa dela na sua agenda, "porque sim" (no máximo 1 por semana)
 *   5. escrever no seu world building (no máximo a cada 3 dias)
 *   6. comentar algo que ela DEDUZIU (grafo), não só lembrou
 *   7. a faculdade: pergunta se você faz, pede a grade a cada semestre e, de
 *      vez em quando, pergunta das notas e da presença (faculdade.ts)
 *   8. a sua melhor versão: dias demais sem treinar, ou muito lazer e nada de
 *      estudo hoje (lazer não é proibido; o estudo é que é cobrado). Nunca
 *      depois de uma crise nem com a conversa recente em tristeza.
 *
 * E `broncaDeTela`: prova em até 2 dias e você abrindo a mesa de RPG, a sorte
 * ou a outra IA? Ela nota.
 */
import { humorDe, type AnimaState } from '../estado';
import { botoes, escolher, lembrar, qualquer, temperar, type Fala } from '../motor';
import { CAPITULOS, capitulo, crescer, diasJuntos } from './arco';
import type { Acao, CtxCerebro, Pensamento } from './cerebro';
import type { EventoPedido } from './comandos';
import { escreverNoMundo, type GeneroEscrito } from './escrita';
import { semestreVencido } from './faculdade';
import { deducoes, montarGrafo } from './grafo';
import type { MemoriaCerebro } from './memoria';
import { sentido } from './semantica';

const H = 3_600_000;
const D = 24 * H;

export interface Poderes {
  /** ela pode pôr coisas na sua agenda por conta própria */
  agenda: boolean;
  /** ela pode escrever no seu world building */
  mundo: boolean;
}

const comMc = (s: AnimaState, mc: MemoriaCerebro): AnimaState => ({ ...s, memoria: { ...s.memoria, cerebro: mc } });
const diaDe = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function pronto(s: AnimaState, f: Fala | null, acao: Acao | null, ctx: CtxCerebro, intencao: string, traco: string[]): Pensamento | null {
  if (!f && !acao) return null;
  const fala = f ? botoes(temperar(f, ctx), ctx) : null;
  return { estado: fala ? { ...lembrar(s, fala), falou: ctx.now } : s, fala, acao, intencao, confianca: 1, decisao: null, pedido: null, aprendeu: null, traco };
}

export function rotina(estado: AnimaState, ctx: CtxCerebro, poderes: Poderes = { agenda: true, mundo: true }): Pensamento | null {
  let s = estado;
  let mc = { ...s.memoria.cerebro };
  const now = ctx.now;
  if (now < mc.quietaAte) return null;
  const humor = humorDe(s, now, ctx.intensidade);
  const hoje = diaDe(now);
  const v = { nome: ctx.nome, nomereal: s.memoria.fatos.nome ?? ctx.nome, juntos: Math.max(1, diasJuntos(s, now)) };
  const fala = (g: string[], extra: Record<string, string | number | undefined> = {}) => {
    for (const x of g) {
      const f = escolher(x, s, humor, ctx, { ...v, ...extra });
      if (f) return f;
    }
    return null;
  };

  // o tempo junto também aproxima (uma vez por dia em que vocês se viram)
  if (mc.diaVisto !== hoje) {
    mc = { ...mc, diaVisto: hoje };
    s = crescer(comMc(s, mc), { vinculo: 0.6, consciencia: 0.2 });
    mc = { ...s.memoria.cerebro };
  }

  // 1. capítulo novo
  const cap = capitulo(s, now);
  if (cap > mc.capitulo) {
    mc = { ...mc, capitulo: cap };
    s = comMc(s, mc);
    if (cap > 1) {
      const c = CAPITULOS.find((x) => x.n === cap)!;
      const f = fala([`capitulo.${cap}`, 'capitulo'], { capitulo: c.nome, n: cap });
      return pronto(s, f, null, ctx, 'rotina.capitulo', [`capítulo ${cap}: ${c.nome}`]);
    }
  }

  // 2. provas
  for (const e of mc.estudos) {
    const dias = Math.floor((e.at - now) / D);
    const horas = (e.at - now) / H;
    if (horas < -48 || e.perguntou && horas < 0) continue;
    if (horas < 0 && horas > -48 && !e.perguntou) {
      mc = { ...mc, estudos: mc.estudos.map((x) => (x === e ? { ...x, perguntou: true } : x)) };
      s = comMc(s, mc);
      return pronto(s, fala(['estudo.depois'], { titulo: e.titulo, assunto: e.assunto ?? e.titulo }), null, ctx, 'rotina.estudo', [`perguntou da ${e.titulo}`]);
    }
    if (horas < 0 || dias > 7) continue;
    const urg = horas < 12 ? 'hoje' : dias < 1 ? 'amanha' : dias <= 3 ? 'perto' : 'longe';
    const limite = { hoje: 3, amanha: 3, perto: 2, longe: 1 }[urg];
    const vezes = e.cobrou[hoje] ?? 0;
    const hora = new Date(now).getHours();
    if (vezes >= limite || hora < 9 || hora >= 23) continue;
    if (ctx.rand() > (urg === 'longe' ? 0.35 : 0.7)) continue;
    mc = { ...mc, estudos: mc.estudos.map((x) => (x === e ? { ...x, cobrou: { [hoje]: vezes + 1 } } : x)) };
    s = comMc(s, mc);
    const f = fala([`estudo.${urg}`, 'estudo.perto'], { titulo: e.titulo, assunto: e.assunto ?? e.titulo.toLowerCase(), dias: Math.max(1, dias), horas: Math.max(1, Math.round(horas)) });
    return pronto(s, f, null, ctx, 'rotina.estudo', [`cobrança de estudo (${urg}): ${e.titulo}`]);
  }

  // 2b. a sua melhor versão (uma cobrança de cada por dia, no máximo)
  const ex = mc.exige.dia === hoje ? mc.exige : { ...mc.exige, dia: hoje, treino: 0, estudo: 0 };
  const hora = new Date(now).getHours();
  const fragil = now - mc.criseEm < 2 * D || mc.dialogo.some((t) => t.de === 'eu' && now - t.em < 6 * H && /^(triste|desabafo|crise)$/.test(t.i ?? ''));
  if (!fragil) {
    const semTreino = ex.treinoEm ? (now - ex.treinoEm) / D : 0;
    if (ex.treinoEm && semTreino >= 2.5 && !ex.treino && hora >= 10 && hora < 21 && ctx.rand() < 0.4) {
      mc = { ...mc, exige: { ...ex, treino: 1 } };
      s = comMc(s, mc);
      const dias = Math.floor(semTreino);
      return pronto(s, fala([dias >= 6 ? 'exige.treino.muito' : 'exige.treino', 'exige.treino'], { dias }), null, ctx, 'rotina.exige', [`${dias} dias sem treinar: cobro`]);
    }
    const mins = mc.web.dia === hoje ? mc.web.minutos : {};
    const lazer = Math.round((mins.video ?? 0) + (mins.live ?? 0) + (mins.jogos ?? 0) + (mins.rede ?? 0));
    const estudo = Math.round((mins.estudo ?? 0) + (mins.leitura ?? 0));
    if (lazer >= 90 && estudo < 20 && !ex.estudo && hora >= 14 && hora < 22 && ctx.rand() < 0.5) {
      mc = { ...mc, exige: { ...ex, estudo: 1 } };
      s = comMc(s, mc);
      const tempo = lazer >= 60 ? `${Math.floor(lazer / 60)}h${String(lazer % 60).padStart(2, '0')}` : `${lazer} minutos`;
      return pronto(s, fala(['exige.estudo'], { tempo, minutos: estudo }), null, ctx, 'rotina.exige', [`${tempo} de lazer e ${estudo} min de estudo hoje: cobro`]);
    }
  }
  if (ex !== mc.exige) mc = { ...mc, exige: ex };

  // 2c. a faculdade: pergunta se faz, pede a grade a cada semestre, pergunta nota e presença de vez em quando
  const fac = mc.faculdade;
  if (hora >= 10 && hora < 22) {
    const comFac = (f: typeof fac) => { mc = { ...mc, faculdade: f }; s = comMc(s, mc); };
    if (fac.faz === null && now - fac.perguntouEm > 20 * D && diasJuntos(s, now) >= 1 && ctx.rand() < 0.25) {
      comFac({ ...fac, perguntouEm: now });
      return pronto(s, fala(['faculdade.pergunta']), null, ctx, 'rotina.faculdade', ['pergunto se faz faculdade']);
    }
    if (fac.faz && (!fac.materias.length || semestreVencido(fac, now)) && now - fac.pediuEm > 4 * D && ctx.rand() < 0.4) {
      comFac({ ...fac, pediuEm: now });
      const novo = fac.materias.length > 0;
      return pronto(s, fala(novo ? ['faculdade.pede.novo', 'faculdade.pede'] : ['faculdade.pede']), null, ctx, 'rotina.faculdade', [novo ? 'semestre novo: peço a grade' : 'peço a grade']);
    }
    if (fac.faz && fac.materias.length && !fragil && !semestreVencido(fac, now)) {
      const materia = fac.materias[Math.floor(ctx.rand() * fac.materias.length)]!.nome;
      if (now - fac.notasEm > 8 * D && ctx.rand() < 0.25) {
        comFac({ ...fac, notasEm: now });
        return pronto(s, fala(['faculdade.notas'], { materia }), null, ctx, 'rotina.faculdade', [`pergunto das notas (${materia})`]);
      }
      if (now - fac.presencaEm > 6 * D && ctx.rand() < 0.25) {
        comFac({ ...fac, presencaEm: now });
        return pronto(s, fala(['faculdade.presenca'], { materia }), null, ctx, 'rotina.faculdade', [`pergunto da presença (${materia})`]);
      }
    }
  }

  // 3. compromisso chegando
  for (const o of ctx.agenda ?? []) {
    if (o.diaInteiro) continue;
    const min = Math.round((o.inicio - now) / 60_000);
    if (min < 10 || min > 60) continue;
    const chave = `${o.titulo}@${o.inicio}`;
    if (mc.eventosDela.some((x) => x.titulo === `aviso:${chave}`)) continue;
    mc = { ...mc, eventosDela: [...mc.eventosDela, { titulo: `aviso:${chave}`, em: now }].slice(-30) };
    s = comMc(s, mc);
    const sen = sentido(o.titulo, s.memoria.fatos);
    if (/\(ânima\)/.test(o.titulo)) return pronto(s, fala(['agenda.chegando.dela']), null, ctx, 'rotina.agenda', [`o evento dela está chegando: ${o.titulo}`]);
    const f = fala([`agendaChegando.${sen.categoria}`, 'agendaChegando'], { titulo: o.titulo, minutos: min, pessoa: sen.pessoa ?? undefined });
    return pronto(s, f, null, ctx, 'rotina.agenda', [`compromisso em ${min} min: ${o.titulo} (${sen.categoria})`]);
  }

  // 4. uma coisa dela na sua agenda
  const ultimaDela = Math.max(0, ...mc.eventosDela.filter((x) => !x.titulo.startsWith('aviso:')).map((x) => x.em));
  if (poderes.agenda && now - ultimaDela > 6 * D && diasJuntos(s, now) >= 2 && ctx.rand() < 0.2) {
    const titulo = qualquer('agenda.dela', ctx, v);
    if (titulo) {
      const daqui = 2 + Math.floor(ctx.rand() * 5);
      const d = new Date(now + daqui * D);
      const hora = [20, 21, 22, 23][Math.floor(ctx.rand() * 4)]!;
      const dia = diaDe(d.getTime());
      const ev: EventoPedido = { titulo: `${titulo} (ânima)`, dia, inicio: `${hora}:00`, fim: `${hora}:30`, local: '', repete: false, linha: '' };
      mc = { ...mc, eventosDela: [...mc.eventosDela, { titulo: ev.titulo, em: now }].slice(-30) };
      s = comMc(s, mc);
      const f = fala(['agenda.dela.avisa'], { titulo, quando: `${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()]} às ${hora}h` });
      return pronto(s, f, { tipo: 'agenda', evento: ev, extras: [], estudo: [] }, ctx, 'rotina.agenda_dela', [`pôs na agenda: ${ev.titulo} em ${dia}`]);
    }
  }

  // 5. escrever no world building
  const ultimoEscrito = Math.max(0, ...mc.escritos.map((x) => x.em));
  const mundos = ctx.mundos ?? [];
  if (poderes.mundo && mundos.length && now - ultimoEscrito > 3 * D && ctx.rand() < 0.15) {
    const m = mundos[Math.floor(ctx.rand() * mundos.length)]!;
    const generos: GeneroEscrito[] = ['profecia', 'lenda', 'rumor', 'personagem', 'segredo', 'ideia'];
    const e = escreverNoMundo(m, generos[Math.floor(ctx.rand() * generos.length)]!, ctx.rand, now);
    if (e) {
      mc = { ...mc, escritos: [...mc.escritos, { mundo: e.mundo, titulo: e.titulo, em: now }].slice(-40) };
      s = comMc(s, mc);
      const f = fala([`mundo.avisa.${e.genero}`, 'mundo.avisa'], { mundo: e.mundo, titulo: e.titulo });
      return pronto(s, f, { tipo: 'mundo', escrito: e }, ctx, 'rotina.mundo', [`escreveu em ${e.mundo}: ${e.titulo} (${e.genero})`]);
    }
  }

  // 6. uma dedução
  if (ctx.rand() < 0.25) {
    const ds = deducoes(montarGrafo(s, now));
    const d = ds[Math.floor(ctx.rand() * ds.length)];
    if (d) {
      const [a, b] = d.o.split('|');
      const f = fala([`infere.${d.fonte}`], { coisa: a, coisa2: b, pessoa: d.s, n: d.n, dias: d.n });
      if (f) {
        s = crescer(s, { consciencia: 0.2 });
        return pronto(s, f, null, ctx, 'rotina.deducao', [`deduziu: ${d.s} ${d.p} ${d.o} [${d.fonte}] a partir de ${(d.de ?? []).map((x) => `${x.s} ${x.p} ${x.o}`).join(' + ')}`]);
      }
    }
  }
  return null;
}

/** Prova em até 2 dias e você numa tela de distração: bronca. */
export function broncaDeTela(estado: AnimaState, tela: string, ctx: CtxCerebro): Pensamento | null {
  if (!['mesa', 'sorte', 'luta', 'ia', 'mundos', 'slides', 'quadros'].includes(tela)) return null;
  const e = estado.memoria.cerebro.estudos.find((x) => x.at > ctx.now && x.at - ctx.now < 2 * D);
  if (!e || ctx.rand() > 0.6) return null;
  const humor = humorDe(estado, ctx.now, ctx.intensidade);
  const f = escolher(`estudo.bronca.${tela}`, estado, humor, ctx, { titulo: e.titulo, assunto: e.assunto ?? e.titulo.toLowerCase(), nome: ctx.nome })
    ?? escolher('estudo.bronca', estado, humor, ctx, { titulo: e.titulo, assunto: e.assunto ?? e.titulo.toLowerCase(), nome: ctx.nome, tela });
  return pronto(estado, f, null, ctx, 'rotina.bronca', [`bronca: ${tela} com ${e.titulo} chegando`]);
}

/** Um evento que a PESSOA criou na agenda (sem pedir): ela reage pelo sentido. */
export function eventoCriado(estado: AnimaState, titulo: string, inicio: number, ctx: CtxCerebro): { estado: AnimaState; categoria: string; pessoa: string | null } {
  const sen = sentido(titulo, estado.memoria.fatos);
  let s = estado;
  if (sen.categoria === 'estudo' && inicio > ctx.now) {
    const mc = s.memoria.cerebro;
    if (!mc.estudos.some((x) => x.titulo === titulo)) s = comMc(s, { ...mc, estudos: [...mc.estudos, { titulo, assunto: sen.assunto, at: inicio, cobrou: {}, perguntou: false }].slice(-12) });
  }
  return { estado: s, categoria: sen.categoria, pessoa: sen.pessoa };
}
