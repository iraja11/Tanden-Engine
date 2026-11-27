/*
 * A memória de trabalho do diálogo: os últimos turnos dos dois lados.
 *
 * Antes, cada mensagem era uma ilha: ela dizia "quem é ela?" sobre o vídeo que
 * você via, você respondia "ela quem?" e ela entendia "quem é você?". Agora
 * toda fala dela fica guardada com o grupo de onde saiu e o que citou (o
 * vídeo, a música, o fato que ela lembrou), e cada mensagem sua com a
 * intenção. Quem usa isto:
 *
 *   seguimento.ts  "ela quem?", "como assim?", "e você?", "mais uma", "sim" à
 *                  pergunta dela, "eu nunca disse isso" (corrige a memória)
 *   cerebro.ts     o assunto da conversa segura a intenção quando a rede hesita
 *
 * Aqui só há funções puras sobre `MemoriaCerebro`; nada de falas (motor.ts).
 */
import type { Fala } from '../motor';
import { TURNOS, type Dito, type MemoriaCerebro, type Turno } from './memoria';

/** Variáveis que não dizem do QUE ela falou (sempre presentes). */
const GENERICAS = new Set(['nome', 'nomereal', 'hora', 'palavras', 'ia', 'acorda']);

/** O que vale guardar das variáveis que a fala usou. */
export function refsDe(grupo: string, usadas: Record<string, string | number | undefined>): Record<string, string | number> | undefined {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(usadas)) if (v !== undefined && v !== '' && !GENERICAS.has(k)) out[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  return Object.keys(out).length ? out : undefined;
}

const grupoDe = (id: string): string => id.split('#')[0] ?? id;

/**
 * Guarda uma fala dela no diálogo. Fala emendada ("resposta. pergunta?") chega
 * depois das partes: se o texto novo contém as falas do último turno dela,
 * o turno é refeito na ordem do texto, sem duplicar.
 */
export function registrarFala(mc: MemoriaCerebro, f: Fala, falou: number): MemoriaCerebro {
  const g = grupoDe(f.id);
  const ref = f.ref;
  const novo: Dito = { g, t: f.texto, ...(ref ? { ref } : {}), ...(/\?\s*[)"'”]?\s*$/.test(f.texto) ? { q: 1 as const } : {}) };
  // a emenda vem logo depois das partes, antes de qualquer carimbo
  const ult = mc.dialogo.at(-1);
  if (ult?.de === 'ela' && ult.em === 0 && ult.ditos?.length) {
    const contidas = ult.ditos.filter((x) => x.t.length >= 6 && f.texto.length > x.t.length && f.texto.includes(x.t));
    if (contidas.length) {
      // o que sobra do texto novo, tirando as partes já guardadas, é a fala principal
      let resto = f.texto;
      for (const x of contidas) resto = resto.replace(x.t, ' ');
      resto = resto.replace(/\s+/g, ' ').trim();
      const partes = [...(resto ? [{ ...novo, t: resto, q: undefined }] : []), ...contidas]
        .map((x) => ({ x, pos: f.texto.indexOf(x.t) }))
        .sort((a, b) => a.pos - b.pos)
        .map(({ x }) => limpar(x));
      return { ...mc, dialogo: [...mc.dialogo.slice(0, -1), { de: 'ela', t: f.texto.slice(0, 300), em: 0, ditos: partes }] };
    }
  }
  const d = carimbar(mc.dialogo, falou);
  return { ...mc, dialogo: [...d, { de: 'ela' as const, t: f.texto.slice(0, 300), em: 0, ditos: [novo] }].slice(-TURNOS) };
}

const limpar = (x: Dito): Dito => {
  const o: Dito = { g: x.g, t: x.t };
  if (x.ref) o.ref = x.ref;
  if (x.q || /\?\s*[)"'”]?\s*$/.test(x.t)) o.q = 1;
  return o;
};

/** O turno dela que ainda não tem hora ganha a hora em que ela falou. */
function carimbar(d: Turno[], falou: number): Turno[] {
  const ult = d.at(-1);
  if (!ult || ult.de !== 'ela' || ult.em !== 0) return d;
  return [...d.slice(0, -1), { ...ult, em: falou || 1 }];
}

/** Guarda a mensagem da pessoa (com a intenção que o cérebro entendeu). */
export function registrarMensagem(mc: MemoriaCerebro, texto: string, intencao: string, now: number, falou: number): MemoriaCerebro {
  const d = carimbar(mc.dialogo, falou);
  return { ...mc, dialogo: [...d, { de: 'eu' as const, t: texto.slice(0, 200), em: now, i: intencao }].slice(-TURNOS) };
}

/** Troca a intenção do último turno da pessoa (quando o seguimento entende melhor do que a rede). */
export function reintitular(mc: MemoriaCerebro, intencao: string): MemoriaCerebro {
  const d = [...mc.dialogo];
  for (let i = d.length - 1; i >= 0; i--) {
    if (d[i]!.de === 'eu') {
      d[i] = { ...d[i]!, i: intencao };
      break;
    }
  }
  return { ...mc, dialogo: d };
}

/** Quando o turno aconteceu (o dela sem carimbo é a última fala: `falou`). */
export const quandoFoi = (t: Turno, falou: number): number => t.em || falou;

/**
 * O último turno dela antes da mensagem atual (a mais recente da pessoa é
 * ignorada se já foi registrada), dentro da janela.
 */
export function ultimoDela(mc: MemoriaCerebro, now: number, falou: number, janelaMs = 20 * 60_000): Turno | null {
  for (let i = mc.dialogo.length - 1; i >= 0; i--) {
    const t = mc.dialogo[i]!;
    if (t.de === 'eu' && i === mc.dialogo.length - 1) continue;
    if (t.de === 'eu') return null;
    return now - quandoFoi(t, falou) <= janelaMs ? t : null;
  }
  return null;
}

/** A mensagem anterior da pessoa (antes da atual), dentro da janela. */
export function mensagemAnterior(mc: MemoriaCerebro, now: number, janelaMs = 10 * 60_000): Turno | null {
  // a mais nova é a mensagem atual (o cérebro registra antes de resolver o seguimento)
  let vistaAtual = false;
  for (let i = mc.dialogo.length - 1; i >= 0; i--) {
    const t = mc.dialogo[i]!;
    if (t.de !== 'eu') continue;
    if (!vistaAtual) {
      vistaAtual = true;
      continue;
    }
    return now - t.em <= janelaMs ? t : null;
  }
  return null;
}

/** As intenções recentes da pessoa (a mais nova primeiro), para o assunto da conversa. */
export function assuntoRecente(mc: MemoriaCerebro, now: number, janelaMs = 6 * 60_000): string[] {
  return mc.dialogo.filter((t) => t.de === 'eu' && t.i && now - t.em <= janelaMs).map((t) => t.i!).reverse();
}

/** O dito mais "falável" de um turno: o último com assunto, senão o último. */
export function ditoPrincipal(t: Turno): Dito | null {
  const ds = t.ditos ?? [];
  return [...ds].reverse().find((d) => d.ref) ?? ds.at(-1) ?? null;
}

/** Os prefixos de um grupo, do mais específico ao mais geral: web.video.youtube → web.video.youtube, web.video, web. */
export function prefixos(g: string): string[] {
  const ps = g.split('.');
  return ps.map((_, i) => ps.slice(0, ps.length - i).join('.'));
}
