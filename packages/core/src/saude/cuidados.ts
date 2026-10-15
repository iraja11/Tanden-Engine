/*
 * Cuidados do dia: lembretes de beber água e de levantar da cadeira.
 *
 * A configuração mora no topo de Saúde/Saúde.md e o registro em notas por mês
 * (Saúde/Registro/2026-10.md), uma linha por copo ou pausa:
 *
 *   - 2026-10-15 14:30 💧 250 ml
 *   - 2026-10-15 15:10 🧍 pausa
 *
 * Linhas acrescentadas no fim se juntam sem conflito no merge entre aparelhos,
 * e o Obsidian lê tudo como uma lista comum.
 *
 * Os avisos são "inteligentes" de um jeito simples e previsível: contam a partir
 * do último copo (ou pausa) registrado, só dentro da janela de horário e dos
 * dias escolhidos, e a água para de avisar quando a meta do dia é batida.
 */
import { parseProps, setProps, type PropValue } from '../caderno/frontmatter';

export type NudgeKind = 'agua' | 'pausa';

export interface Nudge {
  on: boolean;
  /** minutos entre avisos */
  every: number;
  /** janela do dia, 'HH:MM' */
  from: string;
  to: string;
  /** dias da semana (0 = domingo) */
  days: number[];
}

export interface CareConfig {
  agua: Nudge & { goalMl: number; cupMl: number };
  pausa: Nudge;
}

export const CARE_NOTE = 'Saúde/Saúde.md';
export const CARE_LOG_DIR = 'Saúde/Registro';

export const DEFAULT_CARE: CareConfig = {
  agua: { on: true, every: 60, from: '08:00', to: '22:00', days: [0, 1, 2, 3, 4, 5, 6], goalMl: 2000, cupMl: 250 },
  pausa: { on: true, every: 50, from: '09:00', to: '18:00', days: [1, 2, 3, 4, 5] },
};

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = (n: number) => String(n).padStart(2, '0');

export const weekdayName = (d: number): string => WD[d]!;

/** "seg, qua, sex" → [1, 3, 5]; aceita "todos" e "dias úteis". */
export function parseDays(v: PropValue | undefined): number[] | null {
  const items = (Array.isArray(v) ? v : (v ?? '').split(/[,;]/)).map(fold).filter(Boolean);
  if (!items.length) return null;
  if (items.some((x) => /^(todos|todo dia|todos os dias|diario)$/.test(x))) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const x of items) {
    if (/^dias? uteis$/.test(x)) [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (/^fim de semana$/.test(x)) [0, 6].forEach((d) => out.add(d));
    else {
      const i = WD.findIndex((w) => fold(w) === x.slice(0, 3));
      if (i >= 0) out.add(i);
    }
  }
  return out.size ? [...out].sort((a, b) => a - b) : null;
}

export const formatDays = (days: number[]): string => [...days].sort((a, b) => a - b).map((d) => WD[d]).join(', ');

/** 'HH:MM' válido ou null. Aceita "8h", "8", "08:30". */
export function parseClock(s: string | undefined): string | null {
  const m = /^\s*(\d{1,2})(?:[:h](\d{2})?)?\s*$/i.exec(s ?? '');
  if (!m) return null;
  const h = +m[1]!;
  const mi = +(m[2] ?? 0);
  return h <= 23 && mi <= 59 ? `${pad(h)}:${pad(mi)}` : null;
}

const minutesOf = (hhmm: string) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);

const str = (v: PropValue | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const int = (v: PropValue | undefined, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(str(v).replace(',', '.')));
  return Number.isFinite(n) && str(v) !== '' ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (v: PropValue | undefined, fallback: boolean) => {
  const s = fold(str(v));
  if (/^(true|sim|yes|1|x|ligado)$/.test(s)) return true;
  if (/^(false|nao|no|0|desligado)$/.test(s)) return false;
  return fallback;
};

function nudgeFrom(p: Record<string, PropValue>, prefix: string, d: Nudge): Nudge {
  const [a, b] = str(p[`${prefix}_janela`]).split(/\s*[-–a]\s*/);
  let from = parseClock(a) ?? d.from;
  let to = parseClock(b) ?? d.to;
  if (minutesOf(to) <= minutesOf(from)) ({ from, to } = d);
  return {
    on: bool(p[`${prefix}_lembrete`], d.on),
    every: int(p[`${prefix}_intervalo_min`], 10, 240, d.every),
    from,
    to,
    days: parseDays(p[`${prefix}_dias`]) ?? d.days,
  };
}

/** Lê a configuração do topo da nota; o que faltar ou vier errado usa o padrão. */
export function parseCareConfig(noteText: string): CareConfig {
  const p = parseProps(noteText);
  const d = DEFAULT_CARE;
  return {
    agua: {
      ...nudgeFrom(p, 'água', d.agua),
      goalMl: int(p['água_meta_ml'], 250, 8000, d.agua.goalMl),
      cupMl: int(p['água_copo_ml'], 50, 2000, d.agua.cupMl),
    },
    pausa: nudgeFrom(p, 'pausa', d.pausa),
  };
}

const NOTE_BODY = `# Saúde

Configuração dos lembretes de água e de pausa do Tanden (as propriedades acima).
Pode editar aqui ou na tela Saúde. O registro de cada copo e pausa fica em [[Saúde/Registro]],
um arquivo por mês, e o plano de treino em [[Saúde/Treino]].
`;

/** Grava a configuração no topo da nota (cria a nota se for preciso). */
export function writeCareConfig(noteText: string, c: CareConfig): string {
  const base = noteText.trim() ? noteText : NOTE_BODY;
  const n = (prefix: string, x: Nudge) => ({
    [`${prefix}_lembrete`]: x.on ? 'true' : 'false',
    [`${prefix}_intervalo_min`]: String(x.every),
    [`${prefix}_janela`]: `${x.from}-${x.to}`,
    [`${prefix}_dias`]: formatDays(x.days),
  });
  return setProps(base, {
    'água_meta_ml': String(c.agua.goalMl),
    'água_copo_ml': String(c.agua.cupMl),
    ...n('água', c.agua),
    ...n('pausa', c.pausa),
  });
}

// ------------------------------------------------------------------ registro

export interface CareEntry {
  kind: NudgeKind;
  /** AAAA-MM-DD */
  day: string;
  /** ms, hora local */
  at: number;
  ml: number;
  /** a linha exata, para desfazer */
  raw: string;
}

const LOG_RE = /^\s*[-*]\s+(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s+(💧|🧍)(?:\s+(\d+)\s*ml)?/u;

export function parseCareLog(text: string): CareEntry[] {
  const out: CareEntry[] = [];
  for (const raw of text.split('\n')) {
    const m = LOG_RE.exec(raw);
    if (!m) continue;
    const at = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!).getTime();
    if (Number.isNaN(at)) continue;
    const kind: NudgeKind = m[6] === '💧' ? 'agua' : 'pausa';
    out.push({ kind, day: `${m[1]}-${m[2]}-${m[3]}`, at, ml: kind === 'agua' ? +(m[7] ?? 0) : 0, raw });
  }
  return out.sort((a, b) => a.at - b.at);
}

const dayOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Nota do registro do mês de um instante. */
export const careLogPath = (at: number): string => `${CARE_LOG_DIR}/${dayOf(at).slice(0, 7)}.md`;

export function careLine(kind: NudgeKind, at: number, ml = 0): string {
  const d = new Date(at);
  const when = `${dayOf(at)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return kind === 'agua' ? `- ${when} 💧 ${Math.round(ml)} ml` : `- ${when} 🧍 pausa`;
}

/** Acrescenta uma linha ao registro do mês (cria o cabeçalho se a nota for nova). */
export function appendCare(noteText: string, line: string, at: number): string {
  if (!noteText.trim()) {
    const d = new Date(at);
    const month = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return `# Registro de saúde · ${month}\n\n${line}\n`;
  }
  return noteText.replace(/\n*$/, '\n') + line + '\n';
}

/** Tira a última linha igual a `raw` (desfazer o último copo). */
export function removeCare(noteText: string, raw: string): string {
  const lines = noteText.split('\n');
  const i = lines.lastIndexOf(raw);
  if (i < 0) return noteText;
  lines.splice(i, 1);
  return lines.join('\n');
}

export interface CareDay {
  day: string;
  ml: number;
  cups: number;
  breaks: number;
  lastDrink: number | null;
  lastBreak: number | null;
}

export function careDay(entries: CareEntry[], day: string): CareDay {
  const mine = entries.filter((e) => e.day === day);
  const water = mine.filter((e) => e.kind === 'agua');
  const breaks = mine.filter((e) => e.kind === 'pausa');
  return {
    day,
    ml: water.reduce((a, e) => a + e.ml, 0),
    cups: water.length,
    breaks: breaks.length,
    lastDrink: water.at(-1)?.at ?? null,
    lastBreak: breaks.at(-1)?.at ?? null,
  };
}

/**
 * Quanto já deveria ter bebido a esta hora para fechar a meta no fim da janela
 * (ritmo linear). Fora da janela: 0 antes, a meta inteira depois.
 */
export function expectedMl(c: CareConfig['agua'], now: number): number {
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  const a = minutesOf(c.from);
  const b = minutesOf(c.to);
  if (m <= a) return 0;
  if (m >= b) return c.goalMl;
  return Math.round((c.goalMl * (m - a)) / (b - a));
}

// ------------------------------------------------------------------ quando avisar

export interface NudgeState {
  /** último copo/pausa registrado: a contagem recomeça dali */
  last?: number | null;
  /** adiado até este instante */
  snoozeUntil?: number | null;
  /** dias (AAAA-MM-DD) em que não avisa mais (meta batida, pausado hoje) */
  skipDays?: Iterable<string>;
}

/**
 * Próximos avisos entre `now` (exclusivo) e `until`. Em cada dia permitido, os
 * avisos caem em âncora + k × intervalo, dentro da janela; a âncora é o começo
 * da janela ou o último registro (ou adiamento) que caiu nela.
 */
export function nudgeTimes(n: Nudge, now: number, until: number, st: NudgeState = {}): number[] {
  if (!n.on || n.every <= 0 || !n.days.length) return [];
  const skip = new Set(st.skipDays ?? []);
  const step = n.every * 60_000;
  // adiar = fingir que o último registro foi um intervalo antes do fim do adiamento
  const anchors = [st.last ?? null, st.snoozeUntil != null ? st.snoozeUntil - step : null].filter((x): x is number => x !== null);
  const out: number[] = [];
  const start = new Date(now);
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d.getTime() <= until; d.setDate(d.getDate() + 1)) {
    if (!n.days.includes(d.getDay()) || skip.has(dayOf(d.getTime()))) continue;
    const ws = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +n.from.slice(0, 2), +n.from.slice(3)).getTime();
    const we = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +n.to.slice(0, 2), +n.to.slice(3)).getTime();
    const inside = anchors.filter((a) => a >= ws && a < we);
    const anchor = inside.length ? Math.max(...inside) : ws;
    for (let t = anchor + step; t <= we && t <= until; t += step) if (t > now) out.push(t);
  }
  return out;
}

/** Ids de notificação dos cuidados: fora da faixa dos lembretes (até 0x0fffffff). */
export const CARE_ID_BASE = 300_000_000;

export function careNotificationId(kind: NudgeKind, at: number): number {
  return CARE_ID_BASE + (kind === 'agua' ? 0 : 1_000_000) + (Math.floor(at / 60_000) % 1_000_000);
}

export const isCareNotificationId = (id: number): boolean => id >= CARE_ID_BASE && id < CARE_ID_BASE + 2_000_000;

export function careKindOfId(id: number): NudgeKind | null {
  if (!isCareNotificationId(id)) return null;
  return id < CARE_ID_BASE + 1_000_000 ? 'agua' : 'pausa';
}

/** Ideias rápidas para a pausa, em rodízio pelo horário. */
export const BREAK_IDEAS = [
  'Levante, alongue os braços acima da cabeça e respire fundo 5 vezes.',
  'Caminhe 2 minutos e encha o copo d\'água.',
  'Faça 10 agachamentos devagar.',
  'Gire os ombros para trás 10 vezes e solte o pescoço.',
  'Olhe pela janela, longe, por 20 segundos (descanso para os olhos).',
  'Alongue a panturrilha na parede, 30 segundos de cada lado.',
  'Abra o peito: mãos entrelaçadas atrás das costas, 20 segundos.',
  'Suba e desça um lance de escada.',
];

export const breakIdea = (at: number): string => BREAK_IDEAS[Math.floor(at / 60_000 / 7) % BREAK_IDEAS.length]!;

/** Texto do aviso de água, com o ritmo do dia. */
export function waterMessage(c: CareConfig['agua'], today: CareDay, at: number): { title: string; body: string } {
  const behind = expectedMl(c, at) - today.ml;
  const left = Math.max(0, c.goalMl - today.ml);
  const body = behind >= c.cupMl
    ? `${today.ml} de ${c.goalMl} ml hoje, ${behind} ml atrás do ritmo. Que tal ${Math.min(2, Math.ceil(behind / c.cupMl))} copo${behind > c.cupMl ? 's' : ''}?`
    : `${today.ml} de ${c.goalMl} ml hoje, faltam ${left} ml.`;
  return { title: 'Hora de beber água 💧', body };
}
