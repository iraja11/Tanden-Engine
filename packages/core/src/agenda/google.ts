import { dayTime, dayOf, formatRRule, shiftDay, type EventInput, type Occurrence } from './model';

/*
 * Google Agenda pela API REST v3 (só fetch, como o Drive).
 *
 * Os eventos do Google não entram no cofre: o Google já sincroniza os seus
 * aparelhos, e copiar para notas criaria duas verdades. O Tanden lê a janela
 * que está na tela e escreve direto lá quando você cria ou muda um evento.
 *
 * Escopos OAuth esperados:
 *   calendar.events                  ler e escrever eventos
 *   calendar.calendarlist.readonly   saber quais agendas você tem (e as cores)
 */

const API = 'https://www.googleapis.com/calendar/v3';

export interface CalendarInfo {
  id: string;
  name: string;
  color: string;
  primary: boolean;
  /** dá para criar e mudar eventos nela */
  writable: boolean;
}

export class CalendarError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** o login não tem o escopo da agenda: é preciso entrar de novo */
    readonly needsConsent = false,
  ) {
    super(message);
  }
}

export interface GoogleCalendarOptions {
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
  /** fuso das datas enviadas (padrão: o do aparelho) */
  timeZone?: string;
}

/** O que a API devolve de um evento (só o que o Tanden usa). */
export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  recurringEventId?: string;
  recurrence?: string[];
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

/** Cores de evento do Google (colorId → cor), para eventos com cor própria. */
const EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

/** Evento do Google → ocorrência. Eventos cancelados viram null. */
export function fromGoogle(e: GEvent, cal: CalendarInfo): Occurrence | null {
  if (e.status === 'cancelled') return null;
  let start: number;
  let end: number;
  const allDay = !!e.start.date;
  if (e.start.date) {
    start = dayTime(e.start.date, null);
    end = e.end?.date ? dayTime(e.end.date, null) : dayTime(shiftDay(e.start.date, 1), null);
  } else if (e.start.dateTime) {
    start = Date.parse(e.start.dateTime);
    end = e.end?.dateTime ? Date.parse(e.end.dateTime) : start + 3_600_000;
  } else return null;
  if (Number.isNaN(start)) return null;
  if (!(end > start)) end = allDay ? dayTime(shiftDay(dayOf(start), 1), null) : start + 30 * 60_000;
  return {
    key: `g:${cal.id}:${e.id}`,
    source: 'google',
    ref: e.id,
    calendar: cal.id,
    title: e.summary?.trim() || '(sem título)',
    allDay,
    start,
    end,
    day: dayOf(start),
    location: e.location ?? '',
    description: e.description ?? '',
    color: (e.colorId && EVENT_COLORS[e.colorId]) || cal.color || null,
    recurring: !!e.recurringEventId || !!e.recurrence?.length,
    series: e.recurringEventId ?? null,
    editable: cal.writable,
  };
}

/** Campos de um evento → corpo da API. `recurrence` só vai na criação. */
export function toGoogle(ev: EventInput, timeZone: string, withRecurrence = true): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: ev.title.trim() || 'Evento',
    location: ev.location.trim(),
    description: ev.description.trim(),
  };
  const last = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
  if (ev.allDay || !ev.start) {
    // no Google o fim de um evento de dia inteiro é exclusivo
    body.start = { date: ev.date };
    body.end = { date: shiftDay(last, 1) };
  } else {
    const end = ev.end ?? `${String((+ev.start.slice(0, 2) + 1) % 24).padStart(2, '0')}${ev.start.slice(2)}`;
    const endDay = end <= ev.start && last === ev.date ? shiftDay(last, 1) : last;
    body.start = { dateTime: `${ev.date}T${ev.start}:00`, timeZone };
    body.end = { dateTime: `${endDay}T${end}:00`, timeZone };
  }
  if (withRecurrence && ev.repeat) body.recurrence = [`RRULE:${formatRRule(ev.repeat, ev.allDay || !ev.start)}`];
  return body;
}

/** Instante local em RFC 3339 com fuso ("2026-11-05T00:00:00-03:00"). */
export function rfc3339(ms: number): string {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${dayOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${off >= 0 ? '+' : '-'}${pad(off / 60)}:${pad(off % 60)}`;
}

function explain(status: number, body: string): CalendarError {
  if (status === 403 && /insufficient|SCOPE_INSUFFICIENT|insufficientPermissions/i.test(body)) {
    return new CalendarError(status, 'A conta Google foi conectada sem acesso à agenda. Entre de novo para liberar.', true);
  }
  if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(body)) {
    return new CalendarError(status, 'A Google Calendar API está desligada no seu projeto do Google Cloud. Ative em APIs e serviços → Biblioteca.');
  }
  if (status === 401) return new CalendarError(status, 'O Google recusou o acesso. Entre com a conta de novo.', true);
  if (status === 404) return new CalendarError(status, 'Evento ou agenda não encontrado (talvez já tenha sido apagado).');
  return new CalendarError(status, `Google Agenda respondeu ${status}: ${body.slice(0, 300)}`);
}

export class GoogleCalendar {
  private readonly fetch: typeof fetch;
  readonly timeZone: string;

  constructor(private readonly opts: GoogleCalendarOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeZone = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.opts.getToken();
      const res = await this.fetch(url, {
        ...init,
        headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      });
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
        continue;
      }
      throw explain(res.status, await res.text());
    }
  }

  /** As agendas da conta; a principal primeiro. */
  async calendars(): Promise<CalendarInfo[]> {
    const out: CalendarInfo[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ maxResults: '250', minAccessRole: 'reader' });
      if (pageToken) q.set('pageToken', pageToken);
      const page = (await (await this.call(`${API}/users/me/calendarList?${q}`)).json()) as {
        nextPageToken?: string;
        items?: Array<{ id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean; accessRole?: string; deleted?: boolean }>;
      };
      for (const c of page.items ?? []) {
        if (c.deleted) continue;
        out.push({
          id: c.id,
          name: c.summaryOverride || c.summary || c.id,
          color: c.backgroundColor ?? '#4285f4',
          primary: !!c.primary,
          writable: c.accessRole === 'owner' || c.accessRole === 'writer',
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name, 'pt-BR'));
  }

  /** Ocorrências de uma agenda em [from, to), com as repetições já abertas pelo Google. */
  async events(cal: CalendarInfo, from: number, to: number): Promise<Occurrence[]> {
    const out: Occurrence[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({
        timeMin: rfc3339(from),
        timeMax: rfc3339(to),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
        fields: 'nextPageToken,items(id,status,summary,description,location,colorId,recurringEventId,start,end)',
      });
      if (pageToken) q.set('pageToken', pageToken);
      const page = (await (await this.call(`${API}/calendars/${encodeURIComponent(cal.id)}/events?${q}`)).json()) as { nextPageToken?: string; items?: GEvent[] };
      for (const e of page.items ?? []) {
        const o = fromGoogle(e, cal);
        if (o) out.push(o);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  async create(calendarId: string, ev: EventInput): Promise<string> {
    const res = await this.call(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(toGoogle(ev, this.timeZone)) });
    return ((await res.json()) as { id: string }).id;
  }

  /** Muda um evento (ou só uma ocorrência, se o id for de uma ocorrência). */
  async update(calendarId: string, eventId: string, ev: EventInput, withRecurrence = false): Promise<void> {
    await this.call(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(toGoogle(ev, this.timeZone, withRecurrence)),
    });
  }

  async remove(calendarId: string, eventId: string): Promise<void> {
    try {
      await this.call(`${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
    } catch (e) {
      // 410: já estava apagado
      if (!(e instanceof CalendarError && (e.status === 410 || e.status === 404))) throw e;
    }
  }
}

/** Dia (AAAA-MM-DD) e hora (HH:mm) locais de uma ocorrência, para o formulário. */
export function occurrenceInput(o: Occurrence): EventInput {
  const pad = (n: number) => String(n).padStart(2, '0');
  const s = new Date(o.start);
  const e = new Date(o.end);
  const lastDay = o.allDay ? shiftDay(dayOf(e), -1) : dayOf(e);
  const date = dayOf(s);
  return {
    title: o.title,
    date,
    endDate: lastDay > date ? lastDay : null,
    allDay: o.allDay,
    start: o.allDay ? null : `${pad(s.getHours())}:${pad(s.getMinutes())}`,
    end: o.allDay ? null : `${pad(e.getHours())}:${pad(e.getMinutes())}`,
    repeat: null,
    location: o.location,
    description: o.description,
  };
}

