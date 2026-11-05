import { describe, expect, it } from 'vitest';
import {
  dayTime, eventNoteText, moveInput, eventPath, expandEvent, formatRRule, fromGoogle, layoutDay, monthDays, occurrenceInput, occurrencesOn,
  parseEventCapture, parseEventNote, parseProps, parseRRule, rfc3339, shiftDay, skipOccurrence, toGoogle, weekDays, writeEventNote,
  GoogleCalendar, CalendarError, type AgendaEvent, type CalendarInfo, type EventInput, type Occurrence,
} from '../src/index';

const range = (a: string, b: string) => [dayTime(a, null), dayTime(b, null)] as const;
const days = (occ: Occurrence[]) => occ.map((o) => o.day);

const base: EventInput = { title: 'Dentista', date: '2026-11-10', endDate: null, allDay: false, start: '14:00', end: '15:00', repeat: null, location: '', description: '' };

describe('nota de evento (formato Full Calendar)', () => {
  it('lê um evento simples com hora', () => {
    const ev = parseEventNote('Agenda/2026-11-10 Dentista.md', '---\ntitle: Dentista\nallDay: false\ndate: 2026-11-10\nstartTime: "14:00"\nendTime: 15:30\nlocal: Clínica\n---\nLevar exames.\n')!;
    expect(ev).toMatchObject({ title: 'Dentista', date: '2026-11-10', allDay: false, start: '14:00', end: '15:30', location: 'Clínica', description: 'Levar exames.', repeat: null });
  });

  it('sem hora é dia inteiro; título sai do nome do arquivo', () => {
    const ev = parseEventNote('Agenda/2026-12-24 Ceia de Natal.md', '---\ndate: 2026-12-24\nendDate: 2026-12-25\n---\n')!;
    expect(ev).toMatchObject({ title: 'Ceia de Natal', allDay: true, start: null, endDate: '2026-12-25' });
  });

  it('nota sem data não é evento', () => {
    expect(parseEventNote('Agenda/ideia.md', '# só uma nota\n')).toBeNull();
    expect(parseEventNote('Agenda/x.md', '---\ntype: recurring\n---\n')).toBeNull();
  });

  it('lê "recurring" com daysOfWeek e "rrule"', () => {
    const rec = parseEventNote('Agenda/Academia.md', '---\ntitle: Academia\ntype: recurring\ndaysOfWeek: [M, W, F]\nstartRecur: 2026-11-02\nendRecur: 2026-12-31\nstartTime: 07:00\nendTime: 08:00\n---\n')!;
    expect(rec.repeat).toEqual({ freq: 'weekly', interval: 1, weekdays: [1, 3, 5], until: '2026-12-31', count: null });
    expect(rec.date).toBe('2026-11-02');
    const rr = parseEventNote('Agenda/Aluguel.md', '---\ntitle: Aluguel\ntype: rrule\nstartDate: 2026-01-05\nrrule: "DTSTART:20260105T000000Z\\nRRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=12"\nallDay: true\n---\n')!;
    expect(rr.repeat).toMatchObject({ freq: 'monthly', interval: 1, count: 12 });
  });

  it('escreve e relê o mesmo evento', () => {
    const text = eventNoteText({ ...base, location: 'Rua: 10', description: 'Levar exames' });
    expect(text).toContain('allDay: false');
    expect(text).toContain('startTime: "14:00"');
    expect(text).toContain('local: "Rua: 10"');
    const back = parseEventNote('Agenda/a.md', text)!;
    expect(back).toMatchObject({ ...base, location: 'Rua: 10', description: 'Levar exames' });
    // o YAML que o Obsidian lê: allDay é booleano, não texto
    expect(parseProps(text).allDay).toBe('false');
    expect(text).not.toContain('"false"');
  });

  it('repetição semanal simples vira "recurring"; o resto vira "rrule"', () => {
    const weekly = eventNoteText({ ...base, repeat: { freq: 'weekly', interval: 1, weekdays: [1, 4], until: null, count: null } });
    expect(weekly).toContain('type: recurring');
    expect(weekly).toContain('daysOfWeek: [M, R]');
    const monthly = eventNoteText({ ...base, repeat: { freq: 'monthly', interval: 2, weekdays: [], until: '2027-06-30', count: null } });
    expect(monthly).toContain('type: rrule');
    expect(parseEventNote('Agenda/m.md', monthly)!.repeat).toEqual({ freq: 'monthly', interval: 2, weekdays: [], until: '2027-06-30', count: null });
  });

  it('regravar mantém as chaves que o Tanden não conhece', () => {
    const before = '---\ntitle: Velho\ndate: 2026-11-10\ntags:\n  - trabalho\nprojeto: "[[Tanden]]"\n---\nCorpo antigo\n';
    const after = writeEventNote(before, { ...base, title: 'Novo', description: 'Corpo novo' });
    const p = parseProps(after);
    expect(p.tags).toEqual(['trabalho']);
    expect(p.projeto).toBe('[[Tanden]]');
    expect(p.title).toBe('Novo');
    expect(after.trimEnd().endsWith('Corpo novo')).toBe(true);
  });

  it('caminho novo não sobrescreve', () => {
    const taken = new Set(['Agenda/2026-11-10 Dentista.md']);
    expect(eventPath('Dentista', '2026-11-10', (p) => taken.has(p))).toBe('Agenda/2026-11-10 Dentista 2.md');
    expect(eventPath('a/b: c?', '2026-11-10', () => false)).toBe('Agenda/2026-11-10 a b c.md');
  });
});

describe('ocorrências', () => {
  const ev = (over: Partial<AgendaEvent>): AgendaEvent => ({ ...base, path: 'Agenda/x.md', skip: [], ...over });

  it('evento simples só aparece no seu dia', () => {
    expect(days(expandEvent(ev({}), ...range('2026-11-01', '2026-12-01')))).toEqual(['2026-11-10']);
    expect(expandEvent(ev({}), ...range('2026-11-11', '2026-11-12'))).toEqual([]);
  });

  it('dia inteiro de vários dias cruza a janela', () => {
    const o = expandEvent(ev({ allDay: true, start: null, end: null, endDate: '2026-11-12' }), ...range('2026-11-11', '2026-11-12'));
    expect(o).toHaveLength(1);
    expect(o[0]!.end).toBe(dayTime('2026-11-13', null));
  });

  it('semanal em vários dias, com fim e dias pulados', () => {
    const e = ev({ date: '2026-11-02', repeat: { freq: 'weekly', interval: 1, weekdays: [1, 3], until: '2026-11-18', count: null }, skip: ['2026-11-09'] });
    expect(days(expandEvent(e, ...range('2026-11-01', '2026-12-01')))).toEqual(['2026-11-02', '2026-11-04', '2026-11-11', '2026-11-16', '2026-11-18']);
  });

  it('a cada 2 semanas conta a partir da semana do início', () => {
    const e = ev({ date: '2026-11-04', repeat: { freq: 'weekly', interval: 2, weekdays: [], until: null, count: null } });
    expect(days(expandEvent(e, ...range('2026-11-01', '2026-12-10')))).toEqual(['2026-11-04', '2026-11-18', '2026-12-02']);
  });

  it('mensal pula meses sem o dia; COUNT limita', () => {
    const e = ev({ date: '2026-01-31', allDay: true, start: null, end: null, repeat: { freq: 'monthly', interval: 1, weekdays: [], until: null, count: null } });
    expect(days(expandEvent(e, ...range('2026-01-01', '2026-06-01')))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    const c = ev({ date: '2026-01-10', repeat: { freq: 'daily', interval: 1, weekdays: [], until: null, count: 3 } });
    expect(days(expandEvent(c, ...range('2026-01-01', '2026-02-01')))).toEqual(['2026-01-10', '2026-01-11', '2026-01-12']);
  });

  it('janela longe do começo não percorre desde o início', () => {
    const e = ev({ date: '2020-01-01', repeat: { freq: 'daily', interval: 1, weekdays: [], until: null, count: null } });
    expect(expandEvent(e, ...range('2026-11-05', '2026-11-06'))).toHaveLength(1);
  });

  it('atravessar a meia-noite termina no dia seguinte', () => {
    const [o] = expandEvent(ev({ start: '23:00', end: '01:00' }), ...range('2026-11-10', '2026-11-12'));
    expect(o!.end).toBe(dayTime('2026-11-11', '01:00'));
    expect(occurrencesOn([o!], '2026-11-11')).toHaveLength(1);
  });

  it('pular uma ocorrência grava skipDates', () => {
    const e = ev({ date: '2026-11-02', repeat: { freq: 'daily', interval: 1, weekdays: [], until: null, count: null } });
    const text = skipOccurrence(eventNoteText(e), e, '2026-11-03');
    expect(parseEventNote('Agenda/x.md', text)!.skip).toEqual(['2026-11-03']);
  });

  it('anuários', () => {
    expect(formatRRule({ freq: 'weekly', interval: 1, weekdays: [1, 3], until: '2026-12-31', count: null }, false)).toBe('FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z');
    expect(parseRRule('RRULE:FREQ=YEARLY;UNTIL=20300101')).toMatchObject({ freq: 'yearly', until: '2030-01-01' });
  });
});

describe('grade', () => {
  it('mês com semanas inteiras', () => {
    const g = monthDays(2026, 10); // novembro de 2026 começa num domingo
    expect(g[0]).toBe('2026-11-01');
    expect(g.length % 7).toBe(0);
    expect(monthDays(2026, 10, 1)[0]).toBe('2026-10-26');
  });

  it('semana a partir do domingo ou da segunda', () => {
    expect(weekDays('2026-11-05')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(weekDays('2026-11-01', 1)[0]).toBe('2026-10-26');
  });

  it('eventos sobrepostos dividem colunas', () => {
    const mk = (k: string, s: string, e: string): Occurrence => ({
      key: k, source: 'tanden', ref: k, calendar: null, title: k, allDay: false, start: dayTime('2026-11-10', s), end: dayTime('2026-11-10', e),
      day: '2026-11-10', location: '', description: '', color: null, recurring: false, series: null, editable: true,
    });
    const placed = layoutDay([mk('a', '09:00', '11:00'), mk('b', '10:00', '10:30'), mk('c', '10:30', '11:30'), mk('d', '14:00', '15:00')], '2026-11-10');
    const by = Object.fromEntries(placed.map((p) => [p.occ.key, p]));
    expect(by.a).toMatchObject({ top: 540, height: 120, lane: 0, lanes: 2 });
    expect(by.b!.lane).toBe(1);
    expect(by.c!.lane).toBe(1); // reaproveita a coluna de b
    expect(by.d).toMatchObject({ lane: 0, lanes: 1 });
  });
});

describe('captura rápida', () => {
  const now = new Date(2026, 10, 5, 10, 0); // quinta, 05/11/2026

  it('dia e hora', () => {
    const e = parseEventCapture('sexta 14h dentista', now)!;
    expect(e).toMatchObject({ date: '2026-11-06', start: '14:00', end: '15:00', allDay: false });
    expect(e.title.toLowerCase()).toBe('dentista');
  });

  it('faixa de horário e local', () => {
    const e = parseEventCapture('amanhã das 9h às 10h30 reunião de pauta @ sala 2', now)!;
    expect(e).toMatchObject({ date: '2026-11-06', start: '09:00', end: '10:30', location: 'sala 2' });
    expect(e.title.toLowerCase()).toContain('reunião de pauta');
  });

  it('sem hora vira dia inteiro', () => {
    const e = parseEventCapture('15/11 aniversário da Ana', now)!;
    expect(e).toMatchObject({ date: '2026-11-15', allDay: true, start: null });
  });

  it('toda segunda e quarta repete', () => {
    const e = parseEventCapture('toda segunda e quarta 7h academia', now)!;
    expect(e.repeat).toMatchObject({ freq: 'weekly', weekdays: [1, 3] });
    expect(e.start).toBe('07:00');
  });
});

describe('Google Agenda', () => {
  const cal: CalendarInfo = { id: 'eu@gmail.com', name: 'Eu', color: '#039be5', primary: true, writable: true };

  it('converte eventos com hora e de dia inteiro', () => {
    const t = fromGoogle({ id: 'x', summary: 'Call', start: { dateTime: '2026-11-10T14:00:00-03:00' }, end: { dateTime: '2026-11-10T15:00:00-03:00' } }, cal)!;
    expect(t.end - t.start).toBe(3_600_000);
    expect(t).toMatchObject({ source: 'google', allDay: false, color: '#039be5', editable: true, recurring: false });
    const d = fromGoogle({ id: 'y', start: { date: '2026-11-10' }, end: { date: '2026-11-12' }, recurringEventId: 'base' }, cal)!;
    expect(d).toMatchObject({ allDay: true, title: '(sem título)', recurring: true, series: 'base', day: '2026-11-10' });
    expect(occurrenceInput(d)).toMatchObject({ date: '2026-11-10', endDate: '2026-11-11', allDay: true });
    expect(fromGoogle({ id: 'z', status: 'cancelled', start: {}, end: {} }, cal)).toBeNull();
  });

  it('monta o corpo com fim exclusivo e repetição', () => {
    const allDay = toGoogle({ ...base, allDay: true, start: null, end: null, endDate: '2026-11-11' }, 'America/Sao_Paulo');
    expect(allDay.start).toEqual({ date: '2026-11-10' });
    expect(allDay.end).toEqual({ date: '2026-11-12' });
    const timed = toGoogle({ ...base, repeat: { freq: 'weekly', interval: 1, weekdays: [2], until: null, count: null } }, 'America/Sao_Paulo');
    expect(timed.start).toEqual({ dateTime: '2026-11-10T14:00:00', timeZone: 'America/Sao_Paulo' });
    expect(timed.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU']);
    expect(toGoogle({ ...base, start: '23:00', end: '00:30' }, 'UTC').end).toEqual({ dateTime: '2026-11-11T00:30:00', timeZone: 'UTC' });
  });

  it('rfc3339 com o fuso local', () => {
    expect(rfc3339(dayTime('2026-11-05', '08:30'))).toMatch(/^2026-11-05T08:30:00[+-]\d{2}:\d{2}$/);
  });

  it('lista, cria e explica falta de escopo', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/calendarList')) return new Response(JSON.stringify({ items: [{ id: 'b', summary: 'Feriados', accessRole: 'reader' }, { id: 'a', summary: 'Eu', primary: true, accessRole: 'owner', backgroundColor: '#123456' }] }));
      if (url.includes('/events?') && url.includes('pageToken=p2')) return new Response(JSON.stringify({ items: [{ id: '2', summary: 'Dois', start: { date: '2026-11-11' }, end: { date: '2026-11-12' } }] }));
      if (url.includes('/events?')) return new Response(JSON.stringify({ nextPageToken: 'p2', items: [{ id: '1', summary: 'Um', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } }] }));
      if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'novo' }));
      return new Response('{"error":{"status":"PERMISSION_DENIED","details":[{"reason":"ACCESS_TOKEN_SCOPE_INSUFFICIENT"}]}}', { status: 403 });
    }) as typeof fetch;
    const g = new GoogleCalendar({ getToken: async () => 'tok', fetch: fake, timeZone: 'UTC' });
    const cals = await g.calendars();
    expect(cals.map((c) => [c.name, c.writable])).toEqual([['Eu', true], ['Feriados', false]]);
    const evs = await g.events(cals[0]!, ...range('2026-11-01', '2026-12-01'));
    expect(evs.map((e) => e.title)).toEqual(['Um', 'Dois']);
    expect(await g.create('a', base)).toBe('novo');
    expect((calls.at(-1)!.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const err = await g.update('a', '1', base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CalendarError);
    expect((err as CalendarError).needsConsent).toBe(true);
  });

  it('arrastar mantém a duração', () => {
    const s = dayTime('2026-11-10', '14:00');
    const e = dayTime('2026-11-10', '15:30');
    expect(moveInput(base, s, e, dayTime('2026-11-12', '09:15'))).toMatchObject({ date: '2026-11-12', start: '09:15', end: '10:45', endDate: null });
    // 23:30–01:00: o fim cai no dia seguinte, mas a nota não precisa de endDate
    expect(moveInput(base, s, e, dayTime('2026-11-12', '23:30'))).toMatchObject({ date: '2026-11-12', start: '23:30', end: '01:00', endDate: null });
    const allDay = { ...base, allDay: true, start: null, end: null, endDate: '2026-11-11' };
    expect(moveInput(allDay, dayTime('2026-11-10', null), dayTime('2026-11-12', null), dayTime('2026-11-20', null))).toMatchObject({ date: '2026-11-20', endDate: '2026-11-21' });
  });

  it('shiftDay atravessa o fim do mês', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
  });
});
