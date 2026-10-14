import { DEFAULT_HOUR, nextOccurrence, type Repeat } from './reminders';

/*
 * Captura rápida em português: "amanhã 9h comprar pão", "em 20 min tirar o bolo",
 * "toda segunda 7h30 academia", "15/11 18:30 aniversário da Ana".
 * Tira do texto o que for data, hora e repetição; o que sobra é o lembrete.
 */

export interface QuickReminder {
  text: string;
  at: number;
  repeat: Repeat | null;
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/domingos?/, 0],
  [/segundas?(?:-feiras?)?/, 1],
  [/ter[çc]as?(?:-feiras?)?/, 2],
  [/quartas?(?:-feiras?)?/, 3],
  [/quintas?(?:-feiras?)?/, 4],
  [/sextas?(?:-feiras?)?/, 5],
  [/s[áa]bados?/, 6],
];
const WD = `(${WEEKDAYS.map(([r]) => r.source).join('|')})`;
const weekdayOf = (w: string): number => WEEKDAYS.find(([r]) => new RegExp(`^${r.source}$`).test(w))![1];

const UNITS: Record<string, number> = { min: 60_000, minuto: 60_000, h: 3600_000, hora: 3600_000, dia: 864e5, semana: 7 * 864e5 };

/** Normaliza para casar padrões, mantendo o mesmo comprimento do original. */
const norm = (s: string) => s.toLowerCase();

export function parseQuickReminder(input: string, now = Date.now()): QuickReminder | null {
  let s = ` ${input.trim()} `;
  const cut = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(norm(s));
    if (m) s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    return m;
  };

  const base = new Date(now);
  let date: Date | null = null;
  let hour: number | null = null;
  let minute = 0;
  let repeat: Repeat | null = null;
  let relative: number | null = null;

  // --- repetição
  let m: RegExpExecArray | null;
  if ((m = cut(/\s(?:todos? os dias [úu]teis|todo dia [úu]til|(?:em |nos )?dias [úu]teis)(?=\s)/))) {
    repeat = { every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5] };
  } else if ((m = cut(new RegExp(`\\s(?:tod[oa]s? (?:as? |os? )?)${WD}(?:\\s*(?:,|e)\\s*${WD})?(?:\\s*(?:,|e)\\s*${WD})?(?=\\s)`)))) {
    const days = [m[1], m[2], m[3]].filter(Boolean).map((w) => weekdayOf(w!));
    repeat = { every: 1, unit: 'week', weekdays: [...new Set(days)].sort() };
  } else if ((m = cut(/\s(?:todo dia|todos os dias|diariamente)(?=\s)/))) {
    repeat = { every: 1, unit: 'day' };
  } else if ((m = cut(/\s(?:toda semana|todas as semanas|semanalmente)(?=\s)/))) {
    repeat = { every: 1, unit: 'week' };
  } else if ((m = cut(/\s(?:todo m[êe]s|todos os meses|mensalmente)(?=\s)/))) {
    repeat = { every: 1, unit: 'month' };
  } else if ((m = cut(/\s(?:todo ano|todos os anos|anualmente)(?=\s)/))) {
    repeat = { every: 1, unit: 'year' };
  } else if ((m = cut(/\sa cada (\d+) (dia|semana|m[êe]s|mes|ano)(?:e?s)?(?=\s)/))) {
    const u = m[2]!.startsWith('d') ? 'day' : m[2]!.startsWith('s') ? 'week' : m[2]!.startsWith('a') ? 'year' : 'month';
    repeat = { every: Math.max(1, +m[1]!), unit: u };
  }

  // --- relativo: "em 20 min", "daqui a 2 horas", "em 1h30"
  if ((m = cut(/\s(?:em|daqui a|daqui)\s+(\d+)\s*h(?:oras?)?\s*(\d+)\s*(?:m|min|minutos?)?(?=\s)/))) {
    relative = +m[1]! * 3600_000 + +m[2]! * 60_000;
  } else if ((m = cut(/\s(?:em|daqui a|daqui)\s+(\d+|uma?|meia)\s*(min|minutos?|h|horas?|dias?|semanas?)(?=\s)/))) {
    const n = m[1] === 'meia' ? 0.5 : /^uma?$/.test(m[1]!) ? 1 : +m[1]!;
    const unit = m[2]!.replace(/s$/, '').replace(/utos?$/, '');
    relative = n * (UNITS[unit] ?? UNITS[unit.slice(0, 3)] ?? 60_000);
  }

  // --- dia
  if ((m = cut(/\sdepois de amanh[ãa](?=\s)/))) {
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2);
  } else if ((m = cut(/\samanh[ãa](?=\s)/))) {
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  } else if ((m = cut(/\shoje(?=\s)/))) {
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  } else if ((m = cut(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/))) {
    date = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  } else if ((m = cut(/\s(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : base.getFullYear();
    date = new Date(y, +m[2]! - 1, +m[1]!);
    if (!m[3] && date.getTime() < new Date(base.getFullYear(), base.getMonth(), base.getDate()).getTime()) {
      date.setFullYear(y + 1);
    }
  } else if ((m = cut(/\sdia\s+(\d{1,2})(?=\s)/))) {
    date = new Date(base.getFullYear(), base.getMonth(), +m[1]!);
    if (+m[1]! < base.getDate()) date = new Date(base.getFullYear(), base.getMonth() + 1, +m[1]!);
  } else if (!repeat && (m = cut(new RegExp(`\\s(?:(?:na|no|nesta|neste|nessa|nesse|pr[óo]xim[ao])\\s+)?${WD}(?:\\s+que vem)?(?=\\s)`)))) {
    const wd = weekdayOf(m[1]!);
    let add = (wd - base.getDay() + 7) % 7;
    if (add === 0) add = 7;
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + add);
  }

  // --- hora: "9h", "9h30", "09:30", "às 18h", "3 da tarde", "meio-dia"
  if ((m = cut(/\s(?:[àa]s?\s+|ao\s+)?meio[- ]dia(?:\s+e\s+meia)?(?=\s)/))) {
    hour = 12;
    minute = /meia$/.test(m[0]) ? 30 : 0;
  } else if ((m = cut(/\s(?:[àa]\s+)?meia[- ]noite(?=\s)/))) {
    hour = 0;
  } else if ((m = cut(/\s(?:[àa]s?\s+)?(\d{1,2})(?::(\d{2})|h(\d{2})?|\s*horas?)(?:\s+(?:da|de)\s+(manh[ãa]|tarde|noite))?(?=\s)/))) {
    hour = +m[1]!;
    minute = +(m[2] ?? m[3] ?? 0);
    if (m[4] && /tarde|noite/.test(m[4]) && hour < 12) hour += 12;
  } else if ((m = cut(/\s(?:[àa]s?\s+)(\d{1,2})(?:\s+(?:da|de)\s+(manh[ãa]|tarde|noite))?(?=\s)/))) {
    hour = +m[1]!;
    if (m[2] && /tarde|noite/.test(m[2]) && hour < 12) hour += 12;
  } else if ((m = cut(/\s(\d{1,2})\s+(?:da|de)\s+(manh[ãa]|tarde|noite)(?=\s)/))) {
    hour = +m[1]!;
    if (/tarde|noite/.test(m[2]!) && hour < 12) hour += 12;
  } else if ((m = cut(/\s(?:de\s+|pela\s+|à\s+|a\s+)?(manh[ãa]|tarde|noite)(?=\s)/))) {
    hour = /manh/.test(m[1]!) ? 9 : /tarde/.test(m[1]!) ? 15 : 20;
  }
  if (hour !== null && (hour > 23 || minute > 59)) return null;

  let at: number;
  if (relative !== null) {
    at = now + relative;
    // sem segundos quebrados no arquivo
    at = Math.round(at / 60_000) * 60_000;
  } else if (date || hour !== null || repeat) {
    const d = date ?? new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setHours(hour ?? DEFAULT_HOUR, hour === null ? 0 : minute, 0, 0);
    at = d.getTime();
    if (repeat && !date) {
      // "toda segunda 7h": primeira ocorrência válida a partir de agora
      const start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), d.getHours(), d.getMinutes()).getTime();
      at = repeat.weekdays?.length && !repeat.weekdays.includes(new Date(start).getDay())
        ? nextOccurrence(start, repeat, now)
        : start <= now ? nextOccurrence(start, repeat, now) : start;
    } else if (!date && at <= now) {
      // só a hora e ela já passou hoje: amanhã
      d.setDate(d.getDate() + 1);
      at = d.getTime();
    }
  } else {
    return null;
  }

  const text = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:me\s+)?(?:lembr(?:ar|e|a)(?:-me)?\s+)?(?:de\s+|que\s+|para\s+|pra\s+)?/i, '')
    .replace(/^[,.;:-]+|[,.;:-]+$/g, '')
    .trim();
  return { text: text ? text[0]!.toUpperCase() + text.slice(1) : 'Lembrete', at, repeat };
}
