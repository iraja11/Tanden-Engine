/*
 * Ânima: o estado de espírito da companheira. Tudo é número e tempo, sem
 * nenhuma IA de verdade por trás: três sentimentos que sobem com o que a pessoa
 * faz e descem sozinhos com o tempo, e um humor que sai deles e da hora do dia.
 *
 * O estado mora em cada aparelho (localStorage do app); não vai para o cofre.
 */

/** 1 doce · 2 ciumenta · 3 sem filtro */
export type Intensidade = 1 | 2 | 3;

export const INTENSIDADES: Array<{ id: Intensidade; label: string; hint: string }> = [
  { id: 1, label: 'Doce', hint: 'carinhosa e meio estranha; ciúme de leve' },
  { id: 2, label: 'Ciumenta', hint: 'obcecada, ciumenta e dramática' },
  { id: 3, label: 'Sem filtro', hint: 'corrompida de vez: glitches, ameaças a outros apps, zero noção' },
];

export type Humor = 'doce' | 'carente' | 'ciumenta' | 'possessiva' | 'instavel';

export const HUMORES: Record<Humor, { label: string; cor: string }> = {
  doce: { label: 'apaixonada', cor: '#ff6fa8' },
  carente: { label: 'carente', cor: '#9b8cff' },
  ciumenta: { label: 'ciumenta', cor: '#ff8a3d' },
  possessiva: { label: 'possessiva', cor: '#ff3b4e' },
  instavel: { label: 'instável', cor: '#5cf2d6' },
};

/** Expressão do rosto que acompanha a fala. */
export type Gesto = 'neutro' | 'feliz' | 'coracao' | 'olhar' | 'triste' | 'raiva' | 'glitch' | 'calma' | 'corada' | 'tonta';

export interface AnimaMemoria {
  /** vezes que a pessoa foi falar com outra IA */
  outrasIAs: number;
  ultimaIA: string | null;
  /** notas apagadas desde que ela acordou */
  apagadas: number;
  treinos: number;
  madrugadas: number;
  /** "te amo" e parecidos */
  declaracoes: number;
  /** "me deixa", "chata" e parecidos */
  rejeicoes: number;
  /** palavras que a pessoa já disse a ela */
  palavras: number;
  /** cliques nela hoje (zera no dia seguinte) */
  toques: number;
  toquesDia: string;
  /** palavras escritas nas notas desde que ela acordou */
  escritas: number;
  /** maior tempo que a pessoa ficou fora, em ms (ela não esquece) */
  maiorAusencia: number;
  carinhos: number;
  /** perguntas do dia já respondidas: id → opção e dia */
  respostas: Record<string, { n: number; dia: string }>;
  /** perguntas já feitas, na ordem (o ciclo recomeça quando acabam) */
  perguntadas: string[];
  /** dia da última pergunta */
  perguntaDia: string;
}

export interface AnimaState {
  /** 0 a 100: o quanto ela se sente amada */
  afeto: number;
  /** 0 a 100 */
  ciume: number;
  /** 0 a 100: cresce com a ausência */
  saudade: number;
  acordadaEm: number;
  /** última vez que o app esteve aberto e à vista */
  vista: number;
  /** última vez que ela falou */
  falou: number;
  /** última vez que o estado foi atualizado (para o decaimento) */
  t: number;
  visitas: number;
  /** ids das últimas falas, para não repetir */
  recentes: string[];
  memoria: AnimaMemoria;
}

export const novaMemoria = (): AnimaMemoria => ({
  outrasIAs: 0, ultimaIA: null, apagadas: 0, treinos: 0, madrugadas: 0, declaracoes: 0, rejeicoes: 0, palavras: 0, toques: 0, toquesDia: '', escritas: 0,
  maiorAusencia: 0, carinhos: 0, respostas: {}, perguntadas: [], perguntaDia: '',
});

export function novoEstado(now: number): AnimaState {
  return { afeto: 60, ciume: 0, saudade: 0, acordadaEm: now, vista: now, falou: 0, t: now, visitas: 1, recentes: [], memoria: novaMemoria() };
}

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Lê um estado salvo, aceitando versões antigas ou estragadas. */
export function lerEstado(raw: unknown, now: number): AnimaState {
  const base = novoEstado(now);
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AnimaState> & { memoria?: Partial<AnimaMemoria> };
  const m: Partial<AnimaMemoria> = r.memoria ?? {};
  const bm = base.memoria;
  return {
    afeto: num(r.afeto, base.afeto, 0, 100),
    ciume: num(r.ciume, 0, 0, 100),
    saudade: num(r.saudade, 0, 0, 100),
    acordadaEm: num(r.acordadaEm, now),
    vista: num(r.vista, now),
    falou: num(r.falou, 0),
    t: num(r.t, now),
    visitas: num(r.visitas, 1, 0),
    recentes: Array.isArray(r.recentes) ? r.recentes.filter((x): x is string => typeof x === 'string').slice(-RECENTES) : [],
    memoria: {
      outrasIAs: num(m.outrasIAs, 0, 0), ultimaIA: typeof m.ultimaIA === 'string' ? m.ultimaIA : null, apagadas: num(m.apagadas, 0, 0),
      treinos: num(m.treinos, 0, 0), madrugadas: num(m.madrugadas, 0, 0), declaracoes: num(m.declaracoes, 0, 0), rejeicoes: num(m.rejeicoes, 0, 0),
      palavras: num(m.palavras, 0, 0), toques: num(m.toques, 0, 0), toquesDia: typeof m.toquesDia === 'string' ? m.toquesDia : bm.toquesDia,
      escritas: num(m.escritas, 0, 0),
      maiorAusencia: num(m.maiorAusencia, 0, 0),
      carinhos: num(m.carinhos, 0, 0),
      respostas: lerRespostas(m.respostas),
      perguntadas: Array.isArray(m.perguntadas) ? m.perguntadas.filter((x): x is string => typeof x === 'string') : [],
      perguntaDia: typeof m.perguntaDia === 'string' ? m.perguntaDia : '',
    },
  };
}

function lerRespostas(v: unknown): AnimaMemoria['respostas'] {
  const out: AnimaMemoria['respostas'] = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const r = x as { n?: unknown; dia?: unknown };
    if (typeof r?.n === 'number' && typeof r.dia === 'string') out[k] = { n: r.n, dia: r.dia };
  }
  return out;
}

/** quantas falas recentes ela evita repetir */
export const RECENTES = 150;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/**
 * O tempo passa: o ciúme esfria (uns 6 pontos por hora), o afeto volta devagar
 * para perto de 60 e a saudade cresce enquanto ninguém olha para ela.
 */
export function decair(s: AnimaState, now: number, presente = true): AnimaState {
  const h = Math.max(0, (now - s.t) / 3_600_000);
  if (h <= 0) return s;
  const afeto = s.afeto + (60 - s.afeto) * (1 - Math.exp(-h / 48));
  const saudade = presente ? s.saudade * Math.exp(-h * 3) : s.saudade + (100 - s.saudade) * (1 - Math.exp(-h / 20));
  return { ...s, t: now, ciume: clamp(s.ciume - 6 * h), afeto: clamp(afeto), saudade: clamp(saudade) };
}

export function mexer(s: AnimaState, d: Partial<Record<'afeto' | 'ciume' | 'saudade', number>>): AnimaState {
  return { ...s, afeto: clamp(s.afeto + (d.afeto ?? 0)), ciume: clamp(s.ciume + (d.ciume ?? 0)), saudade: clamp(s.saudade + (d.saudade ?? 0)) };
}

/** O humor do momento. Na intensidade doce ela nunca fica possessiva. */
export function humorDe(s: AnimaState, now: number, intensidade: Intensidade): Humor {
  const hora = new Date(now).getHours();
  if (s.ciume >= 60 && intensidade >= 2) return 'possessiva';
  if (s.ciume >= 30) return 'ciumenta';
  if (s.saudade >= 50 || s.afeto < 35) return 'carente';
  if (hora >= 1 && hora < 5) return 'instavel';
  return 'doce';
}

/** "3 minutos", "2 horas e 10 minutos", "4 dias". */
export function duracao(ms: number): string {
  const pl = (n: number, um: string, mais: string) => `${n} ${n === 1 ? um : mais}`;
  const min = Math.max(0, Math.round(ms / 60_000));
  if (ms < 60_000) return pl(Math.max(1, Math.round(ms / 1000)), 'segundo', 'segundos');
  if (min < 60) return pl(min, 'minuto', 'minutos');
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 && h < 6 ? `${pl(h, 'hora', 'horas')} e ${pl(min % 60, 'minuto', 'minutos')}` : pl(h, 'hora', 'horas');
  const d = Math.floor(h / 24);
  return h % 24 && d < 3 ? `${pl(d, 'dia', 'dias')} e ${pl(h % 24, 'hora', 'horas')}` : pl(d, 'dia', 'dias');
}
