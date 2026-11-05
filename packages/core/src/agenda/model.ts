import { asList, asText, parseProps, setProps, splitFrontmatter, type Props } from '../caderno/frontmatter';
import { safeFileName } from '../convert/types';

/*
 * Agenda do Tanden.
 *
 * Um evento é uma nota em `Agenda/`, no formato do plugin Full Calendar do
 * Obsidian (então o mesmo evento aparece no calendário dele):
 *
 *   ---
 *   title: Dentista
 *   allDay: false
 *   date: 2026-11-10
 *   startTime: "14:00"
 *   endTime: "15:00"
 *   local: Clínica Sorriso          ← extra do Tanden; o Full Calendar ignora
 *   ---
 *   Levar os exames.                ← o corpo é a descrição
 *
 * Repetição: `type: recurring` com `daysOfWeek: [M, W]` (+ `startRecur` e
 * `endRecur`) ou `type: rrule` com `rrule: FREQ=MONTHLY;INTERVAL=1` e
 * `startDate`. `skipDates` pula ocorrências. Como mora nas notas, o evento
 * sincroniza pelo mesmo merge do cofre.
 */

export const AGENDA_FOLDER = 'Agenda';

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface EventRepeat {
  freq: Freq;
  /** a cada N dias/semanas/meses/anos */
  interval: number;
  /** semanal: dias da semana (0 = domingo); vazio = o dia da semana do início */
  weekdays: number[];
  /** último dia (AAAA-MM-DD, inclusivo) */
  until: string | null;
  /** número de ocorrências (RRULE COUNT) */
  count: number | null;
}

/** Os campos de um evento, sem dizer onde ele mora. */
export interface EventInput {
  title: string;
  /** primeiro dia (AAAA-MM-DD) */
  date: string;
  /** último dia, inclusivo, para eventos de vários dias */
  endDate: string | null;
  allDay: boolean;
  /** HH:mm */
  start: string | null;
  end: string | null;
  repeat: EventRepeat | null;
  location: string;
  description: string;
}

export interface AgendaEvent extends EventInput {
  path: string;
  /** dias pulados de um evento repetido */
  skip: string[];
}

/** Uma ocorrência concreta, pronta para desenhar. Vale para eventos do cofre, do Google e tarefas. */
export interface Occurrence {
  key: string;
  source: 'tanden' | 'google' | 'tarefa';
  /** caminho da nota, id do evento no Google ou chave da tarefa */
  ref: string;
  /** agenda do Google (null nas outras fontes) */
  calendar: string | null;
  title: string;
  allDay: boolean;
  /** ms, hora local */
  start: number;
  /** ms, exclusivo */
  end: number;
  /** dia em que começa (AAAA-MM-DD) */
  day: string;
  location: string;
  description: string;
  color: string | null;
  recurring: boolean;
  /** Google: id do evento-mãe de uma repetição (para apagar a série inteira) */
  series: string | null;
  editable: boolean;
}

// ------------------------------------------------------------------ datas

const pad = (n: number) => String(n).padStart(2, '0');
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** AAAA-MM-DD do dia local. */
export const dayOf = (d: Date | number): string => {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Meia-noite local do dia. */
export function dayDate(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) return new Date(NaN);
  return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
}

export const shiftDay = (day: string, n: number): string => {
  const d = dayDate(day);
  d.setDate(d.getDate() + n);
  return dayOf(d);
};

/** Dias entre dois dias (b - a), imune ao horário de verão. */
export const daysApart = (a: string, b: string): number => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);

/** "9:00", "09:00:00", "9h" → "09:00"; inválido → null. */
export function normTime(v: string): string | null {
  const m = /^(\d{1,2})(?:[:h](\d{2}))?(?::\d{2})?h?$/i.exec(v.trim());
  if (!m) return null;
  const h = +m[1]!;
  const min = +(m[2] ?? 0);
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

/** "14:30" → 870 */
export const minutesOf = (t: string): number => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/** ms do dia + hora local. */
export function dayTime(day: string, time: string | null): number {
  const d = dayDate(day);
  if (time) d.setHours(+time.slice(0, 2), +time.slice(3, 5), 0, 0);
  return d.getTime();
}

/** Os dias de uma grade de mês (semanas inteiras, começando em `weekStart`). */
export function monthDays(year: number, month: number, weekStart = 0): string[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((lead + total) / 7);
  const start = dayOf(new Date(year, month, 1 - lead));
  return Array.from({ length: weeks * 7 }, (_, i) => shiftDay(start, i));
}

/** Os 7 dias da semana que contém `day`. */
export function weekDays(day: string, weekStart = 0): string[] {
  const d = dayDate(day);
  const start = shiftDay(day, -((d.getDay() - weekStart + 7) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
}

// ------------------------------------------------------------------ repetição

/** Letras do Full Calendar: U M T W R F S (domingo a sábado). */
const FC_DAYS = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];
const RR_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQS: Record<string, Freq> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };

const rrDay = (s: string): string | null => {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** Lê uma RRULE (com ou sem "RRULE:", com ou sem DTSTART antes). Não entende tudo; o comum basta. */
export function parseRRule(s: string): EventRepeat | null {
  const line = s.split(/\r?\n/).find((l) => /FREQ=/i.test(l));
  if (!line) return null;
  const parts = new Map(line.replace(/^RRULE:/i, '').split(';').map((p) => {
    const [k, v] = p.split('=');
    return [k!.trim().toUpperCase(), (v ?? '').trim()] as const;
  }));
  const freq = FREQS[parts.get('FREQ')?.toUpperCase() ?? ''];
  if (!freq) return null;
  const weekdays = (parts.get('BYDAY') ?? '').split(',').map((d) => RR_DAYS.indexOf(d.replace(/^[+-]?\d+/, '').toUpperCase())).filter((i) => i >= 0);
  const count = Number(parts.get('COUNT'));
  return {
    freq,
    interval: Math.max(1, Number(parts.get('INTERVAL')) || 1),
    weekdays: freq === 'weekly' ? [...new Set(weekdays)].sort() : [],
    until: parts.get('UNTIL') ? rrDay(parts.get('UNTIL')!) : null,
    count: count > 0 ? count : null,
  };
}

/** RRULE (sem o "RRULE:"). O Google quer UNTIL como data em eventos de dia inteiro e como instante UTC nos outros. */
export function formatRRule(r: EventRepeat, allDay = true): string {
  const out = [`FREQ=${r.freq.toUpperCase()}`];
  if (r.interval > 1) out.push(`INTERVAL=${r.interval}`);
  if (r.freq === 'weekly' && r.weekdays.length) out.push(`BYDAY=${r.weekdays.map((d) => RR_DAYS[d]).join(',')}`);
  if (r.until) out.push(`UNTIL=${r.until.replace(/-/g, '')}${allDay ? '' : 'T235959Z'}`);
  else if (r.count) out.push(`COUNT=${r.count}`);
  return out.join(';');
}

const WD_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function eventRepeatLabel(r: EventRepeat): string {
  const n = r.interval;
  let s: string;
  if (r.freq === 'weekly' && r.weekdays.length) {
    if (r.weekdays.join() === '1,2,3,4,5' && n === 1) s = 'dias úteis';
    else if (r.weekdays.length === 7 && n === 1) s = 'todo dia';
    else s = `${n === 1 ? 'toda' : `a cada ${n} semanas:`} ${r.weekdays.map((d) => WD_PT[d]).join(', ')}`;
  } else {
    const names: Record<Freq, [string, string]> = { daily: ['todo dia', 'dias'], weekly: ['toda semana', 'semanas'], monthly: ['todo mês', 'meses'], yearly: ['todo ano', 'anos'] };
    s = n === 1 ? names[r.freq][0] : `a cada ${n} ${names[r.freq][1]}`;
  }
  if (r.until) s += ` até ${r.until.slice(8, 10)}/${r.until.slice(5, 7)}/${r.until.slice(0, 4)}`;
  else if (r.count) s += `, ${r.count} vezes`;
  return s;
}

// ------------------------------------------------------------------ nota ⇄ evento

const isDay = (v: string) => DAY_RE.test(v);
const truthy = (v: string) => /^(true|yes|sim|1)$/i.test(v.trim());

/** Título do arquivo sem o "AAAA-MM-DD " do começo (o Full Calendar nomeia assim). */
const titleFromPath = (path: string) => path.split('/').pop()!.replace(/\.md$/i, '').replace(/^\d{4}-\d{2}-\d{2}\s+/, '');

/** Lê o evento de uma nota; null se ela não tiver data de evento. */
export function parseEventNote(path: string, text: string): AgendaEvent | null {
  const p: Props = parseProps(text);
  const get = (k: string) => asText(p[k]).trim();
  const type = get('type').toLowerCase() || 'single';
  const start = normTime(get('startTime'));
  const end = normTime(get('endTime'));
  let date = '';
  let endDate: string | null = null;
  let repeat: EventRepeat | null = null;

  if (type === 'recurring') {
    const weekdays = asList(p.daysOfWeek).map((d) => FC_DAYS.indexOf(d.trim().toUpperCase())).filter((i) => i >= 0);
    if (!weekdays.length) return null;
    date = [get('startRecur'), get('date')].find(isDay) ?? '2000-01-01';
    const until = get('endRecur');
    repeat = { freq: 'weekly', interval: 1, weekdays: [...new Set(weekdays)].sort(), until: isDay(until) ? until.slice(0, 10) : null, count: null };
  } else if (type === 'rrule') {
    const raw = get('rrule');
    repeat = parseRRule(raw);
    if (!repeat) return null;
    const dt = /DTSTART[^:]*:(\d{8})/i.exec(raw)?.[1];
    date = [get('startDate'), get('date')].find(isDay) ?? (dt ? rrDay(dt)! : '');
  } else {
    date = get('date');
    const e = get('endDate');
    if (isDay(e)) endDate = e.slice(0, 10);
  }
  if (!isDay(date)) return null;
  date = date.slice(0, 10);
  if (endDate && endDate < date) endDate = null;
  if (endDate === date) endDate = null;
  const allDayProp = get('allDay');
  const allDay = allDayProp ? truthy(allDayProp) || !start : !start;
  return {
    path,
    title: get('title') || titleFromPath(path),
    date,
    endDate,
    allDay,
    start: allDay ? null : start,
    end: allDay ? null : end,
    repeat,
    skip: asList(p.skipDates).filter(isDay).map((d) => d.slice(0, 10)),
    location: get('local') || get('location'),
    description: splitFrontmatter(text).body.trim(),
  };
}

/** As chaves que o Tanden escreve (as outras ficam como estão). */
const MANAGED = ['title', 'allDay', 'date', 'endDate', 'startTime', 'endTime', 'type', 'daysOfWeek', 'startRecur', 'endRecur', 'rrule', 'startDate', 'skipDates', 'local', 'completed'];

const SAFE_PLAIN = /^[\p{L}\p{N}][\p{L}\p{N} .,()'!?&+/-]*$/u;
const yamlStr = (v: string) => (SAFE_PLAIN.test(v) && !/^(true|false|null|yes|no)$/i.test(v) && !/\s$/.test(v) ? v : JSON.stringify(v));

/** Repetição que o "recurring" do Full Calendar sabe guardar (semanal simples). */
const fitsRecurring = (r: EventRepeat) => r.interval === 1 && !r.count && (r.freq === 'daily' || (r.freq === 'weekly' && r.weekdays.length > 0));

function eventLines(ev: EventInput, skip: string[]): string[] {
  const out = [`title: ${yamlStr(ev.title.trim() || 'Evento')}`, `allDay: ${ev.allDay}`];
  const r = ev.repeat;
  if (!r) {
    out.push(`date: ${ev.date}`);
    if (ev.endDate && ev.endDate > ev.date) out.push(`endDate: ${ev.endDate}`);
  } else if (fitsRecurring(r)) {
    const days = r.freq === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : r.weekdays;
    out.push('type: recurring', `daysOfWeek: [${days.map((d) => FC_DAYS[d]).join(', ')}]`, `startRecur: ${ev.date}`);
    if (r.until) out.push(`endRecur: ${r.until}`);
  } else {
    out.push('type: rrule', `startDate: ${ev.date}`, `rrule: ${JSON.stringify(formatRRule(r))}`);
  }
  if (!ev.allDay && ev.start) {
    out.push(`startTime: "${ev.start}"`);
    if (ev.end) out.push(`endTime: "${ev.end}"`);
  }
  if (r && skip.length) out.push(`skipDates: [${skip.join(', ')}]`);
  if (ev.location.trim()) out.push(`local: ${yamlStr(ev.location.trim())}`);
  return out;
}

/** Texto de uma nota de evento nova. */
export function eventNoteText(ev: EventInput): string {
  const body = ev.description.trim();
  return `---\n${eventLines(ev, []).join('\n')}\n---\n${body ? `${body}\n` : ''}`;
}

/**
 * Regrava os campos do evento numa nota existente. Chaves que o Tanden não
 * conhece (tags, links, propriedades de outros plugins) continuam no lugar.
 */
export function writeEventNote(text: string, ev: EventInput, skip: string[] = []): string {
  const cleared = setProps(text, Object.fromEntries(MANAGED.map((k) => [k, null])));
  const { head } = splitFrontmatter(cleared);
  const body = ev.description.trim();
  const rest = (head ?? []).filter((l, i, a) => l.trim() !== '' || i < a.length - 1);
  return `---\n${[...eventLines(ev, skip), ...rest].join('\n')}\n---\n${body ? `${body}\n` : ''}`;
}

/** Pula uma ocorrência de um evento repetido (vai para skipDates). */
export function skipOccurrence(text: string, ev: AgendaEvent, day: string): string {
  const skip = [...new Set([...ev.skip, day])].sort();
  return writeEventNote(text, ev, skip);
}

/** Caminho livre para um evento novo: Agenda/AAAA-MM-DD Título.md */
export function eventPath(title: string, date: string, exists: (path: string) => boolean): string {
  const name = safeFileName(title.trim() || 'Evento') || 'Evento';
  let path = `${AGENDA_FOLDER}/${date} ${name}.md`;
  for (let n = 2; exists(path); n++) path = `${AGENDA_FOLDER}/${date} ${name} ${n}.md`;
  return path;
}

export const isEventPath = (path: string): boolean => path.startsWith(`${AGENDA_FOLDER}/`) && path.endsWith('.md');

// ------------------------------------------------------------------ ocorrências

/** O dia `day` é uma ocorrência da repetição que começa em `first`? */
function matches(r: EventRepeat, first: string, day: string): boolean {
  const diff = daysApart(first, day);
  if (diff < 0) return false;
  const a = dayDate(first);
  const b = dayDate(day);
  switch (r.freq) {
    case 'daily':
      return diff % r.interval === 0;
    case 'weekly': {
      const days = r.weekdays.length ? r.weekdays : [a.getDay()];
      if (!days.includes(b.getDay())) return false;
      // semanas contadas a partir da segunda-feira (WKST=MO, o padrão da RRULE)
      const monday = (d: string) => shiftDay(d, -((dayDate(d).getDay() + 6) % 7));
      return (daysApart(monday(first), monday(day)) / 7) % r.interval === 0;
    }
    case 'monthly': {
      const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
      return b.getDate() === a.getDate() && months % r.interval === 0;
    }
    case 'yearly':
      return b.getMonth() === a.getMonth() && b.getDate() === a.getDate() && (b.getFullYear() - a.getFullYear()) % r.interval === 0;
  }
}

/** Início e fim (ms) de uma ocorrência que começa no dia `day`. */
function span(ev: EventInput, day: string): [number, number] {
  const days = ev.endDate ? daysApart(ev.date, ev.endDate) : 0;
  if (ev.allDay || !ev.start) return [dayTime(day, null), dayTime(shiftDay(day, days + 1), null)];
  const start = dayTime(day, ev.start);
  if (!ev.end) return [start, start + 3_600_000];
  let end = dayTime(shiftDay(day, days), ev.end);
  // termina antes de começar: atravessa a meia-noite
  if (end <= start) end = dayTime(shiftDay(day, days + 1), ev.end);
  return [start, end];
}

/** Limite de dias percorridos atrás de COUNT, para uma nota maluca não travar a tela. */
const MAX_SCAN = 40_000;

/** As ocorrências do evento que cruzam [from, to). */
export function expandEvent(ev: AgendaEvent, from: number, to: number): Occurrence[] {
  const make = (day: string): Occurrence => {
    const [start, end] = span(ev, day);
    return {
      key: `t:${ev.path}:${day}`, source: 'tanden', ref: ev.path, calendar: null, title: ev.title, allDay: ev.allDay || !ev.start,
      start, end, day, location: ev.location, description: ev.description, color: null, recurring: !!ev.repeat, series: null, editable: true,
    };
  };
  const r = ev.repeat;
  if (!r) {
    const o = make(ev.date);
    return o.start < to && o.end > from ? [o] : [];
  }
  const out: Occurrence[] = [];
  const [s0, e0] = span(ev, ev.date);
  const lenDays = Math.ceil((e0 - s0) / 864e5);
  const lastDay = dayOf(to - 1);
  // com COUNT é preciso contar desde o começo; sem ele, pula direto para perto do intervalo
  let day = r.count ? ev.date : [ev.date, shiftDay(dayOf(from), -lenDays)].sort().pop()!;
  let seen = 0;
  for (let i = 0; i < MAX_SCAN && day <= lastDay; i++, day = shiftDay(day, 1)) {
    if (r.until && day > r.until) break;
    if (!matches(r, ev.date, day)) continue;
    seen++;
    if (r.count && seen > r.count) break;
    if (ev.skip.includes(day)) continue;
    const o = make(day);
    if (o.start < to && o.end > from) out.push(o);
  }
  return out;
}

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Leva um evento para começar em `newStart` mantendo a duração (arrastar na
 * grade). `occStart`/`occEnd` são da ocorrência arrastada.
 */
export function moveInput(ev: EventInput, occStart: number, occEnd: number, newStart: number): EventInput {
  if (ev.allDay || !ev.start) {
    const shift = daysApart(dayOf(occStart), dayOf(newStart));
    return { ...ev, date: shiftDay(ev.date, shift), endDate: ev.endDate ? shiftDay(ev.endDate, shift) : null };
  }
  const newEnd = newStart + (occEnd - occStart);
  const date = dayOf(newStart);
  const endDay = dayOf(newEnd);
  // virar a meia-noite uma vez já é entendido sem endDate (fim antes do início = dia seguinte)
  const wraps = daysApart(date, endDay) === 1 && hhmm(newEnd) <= hhmm(newStart);
  const endDate = endDay === date || wraps ? null : endDay;
  return { ...ev, date, endDate, start: hhmm(newStart), end: hhmm(newEnd) };
}

/** Ordem de leitura: dia inteiro primeiro, depois por hora, depois os mais longos. */
export const byStart = (a: Occurrence, b: Occurrence): number =>
  a.start - b.start || Number(b.allDay) - Number(a.allDay) || b.end - a.end || a.title.localeCompare(b.title, 'pt-BR');

/** As ocorrências que tocam o dia (para a grade do mês e a lista). */
export function occurrencesOn(occs: Occurrence[], day: string): Occurrence[] {
  const s = dayTime(day, null);
  const e = dayTime(shiftDay(day, 1), null);
  return occs.filter((o) => o.start < e && o.end > s).sort(byStart);
}

export interface Placed {
  occ: Occurrence;
  /** minutos desde a meia-noite do dia */
  top: number;
  /** duração visível em minutos */
  height: number;
  /** coluna e total de colunas do grupo que se sobrepõe */
  lane: number;
  lanes: number;
}

/**
 * Posiciona os eventos com hora de um dia numa grade de 24 h. Eventos que se
 * sobrepõem dividem a largura em colunas, como no Google Agenda.
 */
export function layoutDay(occs: Occurrence[], day: string, minHeight = 20): Placed[] {
  const s = dayTime(day, null);
  const e = dayTime(shiftDay(day, 1), null);
  const dayLen = Math.round((e - s) / 60_000);
  const timed = occs.filter((o) => !o.allDay && o.start < e && o.end > s).sort(byStart);
  const out: Placed[] = [];
  let group: Placed[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const close = () => {
    for (const p of group) p.lanes = laneEnds.length;
    group = [];
    laneEnds = [];
  };
  for (const o of timed) {
    const top = Math.max(0, Math.round((o.start - s) / 60_000));
    const bottom = Math.min(dayLen, Math.round((o.end - s) / 60_000));
    const height = Math.max(minHeight, bottom - top);
    // o espaço que ocupa na tela (com a altura mínima) decide a sobreposição
    if (top >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= top);
    if (lane < 0) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = top + height;
    groupEnd = Math.max(groupEnd, top + height);
    const p: Placed = { occ: o, top, height, lane, lanes: 1 };
    group.push(p);
    out.push(p);
  }
  close();
  return out;
}

