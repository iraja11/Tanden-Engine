import { parseCapture } from '../vida';
import { dayOf, normTime, type EventInput } from './model';

/*
 * Evento numa frase, em português:
 *
 *   "sexta 14h dentista"                    → sexta, 14:00–15:00
 *   "amanhã das 9h às 10h30 reunião"        → amanhã, 09:00–10:30
 *   "15/11 aniversário da Ana"              → dia inteiro
 *   "toda segunda 7h academia @ Smart Fit"  → repete, com local
 *
 * A data e a hora vêm do mesmo leitor dos lembretes; aqui só entram a faixa
 * de horário ("das X às Y", "X-Y") e o local depois de "@".
 */

const RANGE = /(?:\bdas?\s+)?\b(\d{1,2})(?:[:h](\d{2}))?(h?)\s*(?:-|–|\s(?:às|as|até|ate)\s)\s*(\d{1,2})(?:[:h](\d{2}))?(h?)(?=\s|$)/i;

export function parseEventCapture(input: string, now = new Date()): EventInput | null {
  let s = input.trim();
  if (!s) return null;
  let location = '';
  const loc = /\s@\s*(.+)$/.exec(s);
  if (loc) {
    location = loc[1]!.trim();
    s = s.slice(0, loc.index).trim();
  }
  let end: string | null = null;
  const r = RANGE.exec(s);
  // só é faixa de horário se algum lado tiver "h" ou ":" (senão "3 a 5" de qualquer coisa vira hora)
  if (r && (r[2] || r[3] || r[5] || r[6] || /h|:/i.test(r[0]))) {
    const start = normTime(`${r[1]}:${r[2] ?? '00'}`);
    end = normTime(`${r[4]}:${r[5] ?? '00'}`);
    if (start && end) s = `${s.slice(0, r.index)} ${start} ${s.slice(r.index + r[0].length)}`.replace(/\s+/g, ' ').trim();
    else end = null;
  }
  const c = parseCapture(s, now);
  if (!c || !c.title.trim()) return null;
  const date = c.due ?? dayOf(now);
  const start = c.time;
  if (start && !end) {
    const h = (+start.slice(0, 2) + 1) % 24;
    end = `${String(h).padStart(2, '0')}${start.slice(2)}`;
  }
  const repeat = /\b(tod[ao]s?|cada)\b/i.test(input) ? weeklyGuess(input, date) : null;
  return { title: c.title, date, endDate: null, allDay: !start, start, end: start ? end : null, repeat, location, description: '' };
}

const WD_WORDS: Array<[RegExp, number]> = [
  [/\bdomingos?\b/i, 0], [/\bsegundas?(-feira)?\b/i, 1], [/\bterças?(-feira)?\b/i, 2], [/\bquartas?(-feira)?\b/i, 3],
  [/\bquintas?(-feira)?\b/i, 4], [/\bsextas?(-feira)?\b/i, 5], [/\bsábados?\b/i, 6],
];

/** "toda segunda e quarta", "todo dia", "todo mês", "dias úteis". */
function weeklyGuess(input: string, date: string): EventInput['repeat'] {
  const s = input.toLowerCase();
  if (/dias? úte?is/.test(s)) return { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], until: null, count: null };
  if (/tod[oa]s? (o )?dias?\b/.test(s)) return { freq: 'daily', interval: 1, weekdays: [], until: null, count: null };
  if (/tod[oa]s? (o )?m[eê]s/.test(s)) return { freq: 'monthly', interval: 1, weekdays: [], until: null, count: null };
  if (/tod[oa]s? (o )?ano/.test(s)) return { freq: 'yearly', interval: 1, weekdays: [], until: null, count: null };
  const days = WD_WORDS.filter(([re]) => re.test(s)).map(([, d]) => d);
  if (days.length || /tod[ao]s? (a )?semana/.test(s)) return { freq: 'weekly', interval: 1, weekdays: days.length ? days : [new Date(`${date}T12:00`).getDay()], until: null, count: null };
  return null;
}
