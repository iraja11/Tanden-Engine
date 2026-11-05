import {
  CalendarError, GoogleCalendar, byStart, dayOf, dayTime, eventNoteText, eventPath, expandEvent, isEventPath, moveInput,
  occurrenceInput, parseEventCapture, parseEventNote, shiftDay, skipOccurrence, writeEventNote,
  type AgendaEvent, type CalendarInfo, type EventInput, type Occurrence,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { notes } from '../editor/notes.svelte';
import { files } from '../files/files.svelte';
import { google } from '../google.svelte';
import { sound } from '../sound.svelte';
import { vida } from '../vida/vida.svelte';

/*
 * Agenda: junta três fontes numa grade só.
 * - Eventos do cofre: notas em Agenda/ (formato Full Calendar do Obsidian),
 *   que sincronizam como qualquer nota.
 * - Google Agenda: lido da API para a janela visível e guardado só neste
 *   aparelho (o Google já sincroniza os seus aparelhos).
 * - Tarefas com prazo (banco de tarefas e lembretes), só para ver.
 */

export type Mode = 'mes' | 'semana' | 'dia' | 'lista';
/** onde o evento mora: 'tanden' (nota no cofre) ou o id de uma agenda do Google */
export type Target = string;
export const TANDEN = 'tanden';
export const TASKS = 'tarefas';

interface Prefs {
  mode: Mode;
  /** 0 domingo, 1 segunda */
  weekStart: 0 | 1;
  /** fontes escondidas: 'tanden', 'tarefas' ou ids de agendas do Google */
  hidden: string[];
  /** onde os eventos novos vão por padrão */
  target: Target;
}

interface Cache {
  calendars: CalendarInfo[];
  events: Occurrence[];
  from: number;
  to: number;
  account: string | null;
}

export interface Draft {
  /** a ocorrência sendo editada (null = evento novo) */
  occ: Occurrence | null;
  input: EventInput;
  target: Target;
}

const KEY = 'tanden.agenda';
const KEY_CACHE = 'tanden.agenda.google';
/** quanto tempo a leitura do Google vale antes de buscar de novo */
const STALE_MS = 5 * 60_000;

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: só perde preferências e o cache do Google */
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

class Agenda {
  prefs = $state<Prefs>(load<Prefs>(KEY, { mode: 'mes', weekStart: 0, hidden: [], target: TANDEN }));
  /** dia em foco: a grade mostra o mês/semana/dia dele */
  cursor = $state(dayOf(new Date()));
  /** relógio da tela (linha do agora, "hoje") */
  now = $state(Date.now());
  calendars = $state<CalendarInfo[]>([]);
  private remote = $state<Occurrence[]>([]);
  loading = $state(false);
  error = $state('');
  /** o login do Google não tem o escopo da agenda */
  needsConsent = $state(false);
  draft = $state<Draft | null>(null);
  /** outra tela pediu para abrir a agenda */
  goto = $state(0);

  private window: { from: number; to: number; at: number } | null = null;
  private seq = 0;
  private started = false;
  private cache = new Map<string, { text: string; ev: AgendaEvent | null }>();

  constructor() {
    const c = load<Cache>(KEY_CACHE, { calendars: [], events: [], from: 0, to: 0, account: null });
    this.calendars = c.calendars;
    this.remote = c.events;
  }

  /** O Google Agenda está ligado neste aparelho? */
  get googleOn(): boolean {
    return google.available && google.status.signed_in && google.status.calendar;
  }

  /** Agendas do Google onde dá para escrever. */
  get writable(): CalendarInfo[] {
    return this.googleOn ? this.calendars.filter((c) => c.writable) : [];
  }

  private client: GoogleCalendar | null = null;
  private get gc(): GoogleCalendar {
    return (this.client ??= new GoogleCalendar({ getToken: google.token }));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // contas diferentes não misturam o cache
    const c = load<Cache>(KEY_CACHE, { calendars: [], events: [], from: 0, to: 0, account: null });
    if (c.account && c.account !== google.status.email) {
      this.calendars = [];
      this.remote = [];
    }
    setInterval(() => {
      this.now = Date.now();
      const today = dayOf(this.now);
      if (this.today !== today) this.today = today;
    }, 30_000);
    addEventListener('focus', () => void this.refresh());
    void this.refresh();
  }

  /** dia de hoje (muda à meia-noite) */
  today = $state(dayOf(new Date()));

  setPrefs(patch: Partial<Prefs>): void {
    this.prefs = { ...this.prefs, ...patch };
    save(KEY, this.prefs);
  }

  toggle(source: string): void {
    const h = this.prefs.hidden;
    this.setPrefs({ hidden: h.includes(source) ? h.filter((x) => x !== source) : [...h, source] });
  }

  // -------------------------------------------------------------- leitura

  /** Eventos do cofre, relidos só nas notas que mudaram. */
  get events(): AgendaEvent[] {
    void notes.rev;
    const paths = engine.notes.filter(isEventPath);
    const out: AgendaEvent[] = [];
    const keep = new Set<string>();
    for (const p of paths) {
      if (!engine.vault.has(p)) continue;
      keep.add(p);
      const text = engine.vault.read(p);
      let hit = this.cache.get(p);
      if (!hit || hit.text !== text) this.cache.set(p, (hit = { text, ev: parseEventNote(p, text) }));
      if (hit.ev) out.push(hit.ev);
    }
    for (const k of this.cache.keys()) if (!keep.has(k)) this.cache.delete(k);
    return out;
  }

  /** Tarefas com prazo (banco de tarefas e lembretes das notas). */
  private tasks(from: number, to: number): Occurrence[] {
    const out: Occurrence[] = [];
    for (const t of vida.snap.tasks) {
      if (t.done || !t.due) continue;
      const start = dayTime(t.due, t.time);
      const end = t.time ? start + 30 * 60_000 : dayTime(shiftDay(t.due, 1), null);
      if (!(start < to && end > from)) continue;
      out.push({
        key: `k:${t.key}`, source: 'tarefa', ref: t.path, calendar: null, title: t.title, allDay: !t.time, start, end, day: t.due,
        location: '', description: '', color: null, recurring: false, series: null, editable: false,
      });
    }
    return out;
  }

  /** Tudo o que cruza [from, to), já filtrado pelas fontes visíveis. */
  occurrences(from: number, to: number): Occurrence[] {
    const hidden = new Set(this.prefs.hidden);
    const out: Occurrence[] = [];
    if (!hidden.has(TANDEN)) for (const ev of this.events) out.push(...expandEvent(ev, from, to));
    if (this.googleOn) {
      for (const o of this.remote) if (o.start < to && o.end > from && !hidden.has(o.calendar ?? '')) out.push(o);
    }
    if (!hidden.has(TASKS)) out.push(...this.tasks(from, to));
    return out.sort(byStart);
  }

  colorOf(o: Occurrence): string {
    if (o.source === 'tarefa') return 'var(--ok)';
    return o.color ?? 'var(--ember)';
  }

  // -------------------------------------------------------------- Google

  /**
   * Busca o Google para a janela [from, to) com folga, se ela ainda não foi
   * lida há pouco. Sem `from`, relê a última janela.
   */
  async refresh(from?: number, to?: number, force = false): Promise<void> {
    await google.refresh().catch(() => {});
    if (!google.available || !google.status.signed_in) return;
    if (!google.status.calendar) {
      this.needsConsent = true;
      return;
    }
    this.needsConsent = false;
    const w = this.window;
    from ??= w?.from ?? dayTime(shiftDay(this.cursor, -45), null);
    to ??= w?.to ?? dayTime(shiftDay(this.cursor, 60), null);
    if (!force && w && from >= w.from && to <= w.to && Date.now() - w.at < STALE_MS) return;
    // folga dos dois lados: andar um mês para frente ou para trás não busca de novo
    const wFrom = Math.min(from, dayTime(shiftDay(dayOf(from), -35), null));
    const wTo = Math.max(to, dayTime(shiftDay(dayOf(to), 42), null));
    const seq = ++this.seq;
    this.loading = true;
    try {
      const cals = await this.gc.calendars();
      const lists = await Promise.all(cals.map((c) => this.gc.events(c, wFrom, wTo).catch(() => [] as Occurrence[])));
      if (seq !== this.seq) return;
      this.calendars = cals;
      this.remote = lists.flat();
      this.window = { from: wFrom, to: wTo, at: Date.now() };
      this.error = '';
      if (!cals.some((c) => c.id === this.prefs.target) && this.prefs.target !== TANDEN) this.setPrefs({ target: TANDEN });
      save(KEY_CACHE, { calendars: cals, events: this.remote, from: wFrom, to: wTo, account: google.status.email } satisfies Cache);
    } catch (e) {
      if (seq !== this.seq) return;
      this.fail(e);
    } finally {
      if (seq === this.seq) this.loading = false;
    }
  }

  private fail(e: unknown): void {
    if (e instanceof CalendarError && e.needsConsent) this.needsConsent = true;
    this.error = e instanceof Error ? e.message : String(e);
  }

  /** Entra de novo no Google para liberar a agenda. */
  async connect(): Promise<void> {
    if (await google.signIn()) {
      this.client = null;
      this.window = null;
      await this.refresh(undefined, undefined, true);
      if (google.status.calendar) files.say('Google Agenda conectado.');
      else this.error = 'O Google não liberou a agenda. Na tela de login, deixe marcada a permissão do Google Agenda.';
    } else if (google.error) this.error = google.error;
  }

  // -------------------------------------------------------------- edição

  /** Próxima hora cheia (hoje) ou 09:00 (outro dia), para um evento novo com hora. */
  nextSlot(day = this.cursor): string {
    if (day !== this.today) return '09:00';
    return `${pad(Math.min(23, new Date().getHours() + 1))}:00`;
  }

  /** Abre o formulário de um evento novo. */
  create(day = this.cursor, start: string | null = this.nextSlot(day), allDay = start === null): void {
    const end = start ? `${pad((+start.slice(0, 2) + 1) % 24)}${start.slice(2)}` : null;
    const target = this.prefs.target === TANDEN || this.writable.some((c) => c.id === this.prefs.target) ? this.prefs.target : TANDEN;
    this.draft = {
      occ: null,
      input: { title: '', date: day, endDate: null, allDay, start, end, repeat: null, location: '', description: '' },
      target,
    };
  }

  /** Abre o formulário com uma ocorrência existente. Tarefas não se editam aqui. */
  edit(o: Occurrence): void {
    if (o.source === 'tanden') {
      const ev = this.events.find((e) => e.path === o.ref);
      if (!ev) return;
      const { path: _p, skip: _s, ...input } = ev;
      this.draft = { occ: o, input: { ...input, repeat: input.repeat ? { ...input.repeat, weekdays: [...input.repeat.weekdays] } : null }, target: TANDEN };
    } else if (o.source === 'google') {
      this.draft = { occ: o, input: occurrenceInput(o), target: o.calendar ?? TANDEN };
    }
  }

  /** Captura rápida: "sexta das 14h às 15h dentista @ clínica". */
  async quick(text: string): Promise<boolean> {
    const input = parseEventCapture(text, new Date());
    if (!input) return false;
    const target = this.prefs.target === TANDEN || this.writable.some((c) => c.id === this.prefs.target) ? this.prefs.target : TANDEN;
    const ok = await this.save({ occ: null, input, target });
    if (ok) this.cursor = input.date;
    return ok;
  }

  private writeNew(input: EventInput): string {
    const path = eventPath(input.title, input.date, (p) => engine.vault.has(p));
    engine.writeNote(path, eventNoteText(input));
    return path;
  }

  /** Grava o rascunho onde ele deve morar (e tira do lugar antigo, se mudou). */
  async save(d: Draft): Promise<boolean> {
    const { occ, target } = d;
    const input: EventInput = { ...d.input, title: d.input.title.trim() || 'Evento' };
    if (input.endDate && input.endDate <= input.date) input.endDate = null;
    if (input.allDay) {
      input.start = null;
      input.end = null;
    }
    try {
      if (target === TANDEN) {
        if (occ?.source === 'tanden') {
          const ev = this.events.find((e) => e.path === occ.ref);
          engine.writeNote(occ.ref, writeEventNote(engine.vault.read(occ.ref), input, ev?.skip ?? []));
        } else {
          this.writeNew(input);
          if (occ?.source === 'google') await this.removeRemote(occ, 'uma');
        }
      } else if (occ?.source === 'google' && occ.calendar === target) {
        await this.gc.update(target, occ.ref, input, !occ.recurring);
        this.patchRemote(occ, input);
      } else {
        await this.gc.create(target, input);
        if (occ?.source === 'tanden') await engine.deleteNote(occ.ref);
        if (occ?.source === 'google') await this.removeRemote(occ, 'uma');
      }
      if (!occ) this.setPrefs({ target });
      sound.play(occ ? 'tick' : 'create');
      this.draft = null;
      this.error = '';
      if (target !== TANDEN || occ?.source === 'google') void this.refresh(undefined, undefined, true);
      return true;
    } catch (e) {
      this.fail(e);
      files.say(`Não consegui salvar o evento: ${this.error}`, { error: true });
      return false;
    }
  }

  /** Mostra a mudança na hora, antes de o Google responder a releitura. */
  private patchRemote(occ: Occurrence, input: EventInput): void {
    const [o] = expandEvent({ ...input, repeat: null, path: '', skip: [] }, -Infinity, Infinity);
    if (!o) return;
    this.remote = this.remote.map((x) => (x.key === occ.key ? { ...x, title: input.title, start: o.start, end: o.end, day: o.day, allDay: o.allDay, location: input.location, description: input.description } : x));
  }

  private async removeRemote(o: Occurrence, scope: 'uma' | 'todas'): Promise<void> {
    if (!o.calendar) return;
    const id = scope === 'todas' && o.series ? o.series : o.ref;
    await this.gc.remove(o.calendar, id);
    this.remote = this.remote.filter((x) => (scope === 'todas' && o.series ? x.series !== o.series : x.key !== o.key));
  }

  /** Apaga o evento (ou só este dia, num evento repetido). */
  async remove(o: Occurrence, scope: 'uma' | 'todas' = 'todas'): Promise<void> {
    try {
      if (o.source === 'tanden') {
        const ev = this.events.find((e) => e.path === o.ref);
        if (ev?.repeat && scope === 'uma') engine.writeNote(o.ref, skipOccurrence(engine.vault.read(o.ref), ev, o.day));
        else await engine.deleteNote(o.ref);
      } else if (o.source === 'google') await this.removeRemote(o, scope);
      sound.play('close');
      this.draft = null;
    } catch (e) {
      this.fail(e);
      files.say(`Não consegui apagar: ${this.error}`, { error: true });
    }
  }

  /** Dá para arrastar? (repetições do cofre mudam pelo formulário) */
  movable(o: Occurrence): boolean {
    return o.editable && !(o.source === 'tanden' && o.recurring);
  }

  /** Arrastar na grade: leva o evento para começar em `newStart`. */
  async move(o: Occurrence, newStart: number): Promise<void> {
    if (!this.movable(o) || newStart === o.start) return;
    if (o.source === 'tanden') {
      const ev = this.events.find((e) => e.path === o.ref);
      if (!ev) return;
      const { path: _p, skip, ...input } = ev;
      engine.writeNote(o.ref, writeEventNote(engine.vault.read(o.ref), moveInput(input, o.start, o.end, newStart), skip));
      sound.play('tick');
      return;
    }
    if (o.source === 'google' && o.calendar) {
      const input = moveInput(occurrenceInput(o), o.start, o.end, newStart);
      this.patchRemote(o, input);
      try {
        await this.gc.update(o.calendar, o.ref, input);
        sound.play('tick');
      } catch (e) {
        this.fail(e);
        files.say(`Não consegui mover: ${this.error}`, { error: true });
        void this.refresh(undefined, undefined, true);
      }
    }
  }
}

export const agenda = new Agenda();
