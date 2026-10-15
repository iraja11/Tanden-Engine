import {
  CARE_LOG_DIR, CARE_NOTE, DEFAULT_PROFILE, PLAN_NOTE, REMINDERS_NOTE, SESSIONS_DIR,
  appendCare, breakIdea, careDay, careKindOfId, careLine, careLogPath, careNotificationId, expectedMl, freePath, generatePlan,
  historyOf, isCareNotificationId, isTrainingDay, nextDay, nudgeTimes, parseCareConfig, parseCareLog, parsePlan, parseProfile,
  parseSession, planNote, removeCare, sessionNote, sessionPath, suggestNext, swapExercise, today, upsertWorkoutReminder,
  waterMessage, workoutReminderLine, writeCareConfig,
  type CareConfig, type CareDay, type CareEntry, type ExerciseLog, type NudgeKind, type NudgeState, type Plan, type PlanDay,
  type Profile, type Session, type Suggestion, type Unit,
} from '@tanden/core';
import * as notif from '@tauri-apps/plugin-notification';
import { engine } from '../engine.svelte';
import { desktop } from '../platform';
import { isTauri } from '../storage-tauri';
import { feel } from '../feel.svelte';
import { sound } from '../sound.svelte';
import { files } from '../files/files.svelte';
import { reminders } from '../reminders.svelte';
import { vida } from '../vida/vida.svelte';
import { CARE_ACTION_AGUA, CARE_ACTION_PAUSA } from './acoes';

/*
 * Saúde: água, pausas e treino.
 *
 * Tudo que importa entre aparelhos mora em notas (Saúde/Saúde.md, o registro do
 * mês, Saúde/Treino.md e Saúde/Treinos/). Só fica neste aparelho o que é dele:
 * se ele avisa, adiamentos, "hoje não" e o treino em andamento.
 *
 * Avisos:
 * - Computador e web: o app confere a cada minuto e avisa na hora.
 * - Android: os próximos avisos vão para o agendador do sistema (como os
 *   lembretes), e são refeitos a cada copo, pausa ou mudança de configuração.
 */

const android = isTauri() && !desktop;
const CHANNEL = 'cuidados';
/** Android: quanto tempo à frente fica agendado */
const SYSTEM_WINDOW_MS = 36 * 3600_000;
/** um aviso atrasado (computador suspenso) ainda vale até isto */
const LATE_MS = 10 * 60_000;
const SNOOZE_MS: Record<NudgeKind, number> = { agua: 30 * 60_000, pausa: 15 * 60_000 };

const KEY_LOCAL = 'tanden.saude.aparelho';
const KEY_DRAFT = 'tanden.saude.treinoEmAndamento';

interface LocalState {
  /** este aparelho avisa? (por tipo) */
  notify: Record<NudgeKind, boolean>;
  snoozeUntil: Partial<Record<NudgeKind, number>>;
  /** dia (AAAA-MM-DD) em que este aparelho não avisa mais */
  quietDay: Partial<Record<NudgeKind, string>>;
  /** último aviso mostrado pelo app (computador/web) */
  lastShown: Partial<Record<NudgeKind, number>>;
  /** Android: id → aviso agendado */
  scheduled: Record<string, { kind: NudgeKind; at: number }>;
}

export interface DraftSet {
  value: number | null;
  done: boolean;
}

export interface DraftItem {
  name: string;
  unit: Unit;
  sets: DraftSet[];
  load: number | null;
  target: number;
  suggestion: Suggestion;
  rest: number;
}

export interface Draft {
  day: string;
  key: string;
  title: string;
  startedAt: number;
  items: DraftItem[];
  effort: number | null;
  notes: string;
}

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
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: só perde preferências deste aparelho */
  }
}

const defaultLocal = (): LocalState => ({
  // no celular a pausa (de cadeira) começa desligada, para não avisar em dobro com o PC
  notify: { agua: true, pausa: !android },
  snoozeUntil: {},
  quietDay: {},
  lastShown: {},
  scheduled: {},
});

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (t: number): string => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

class Saude {
  config = $state<CareConfig>(parseCareConfig(''));
  entries = $state<CareEntry[]>([]);
  profile = $state<Profile>({ ...DEFAULT_PROFILE });
  hasPlan = $state(false);
  plan = $state<Plan>({ days: [] });
  sessions = $state<Session[]>([]);
  local = $state<LocalState>(load(KEY_LOCAL, defaultLocal()));
  draft = $state<Draft | null>(load<Draft | null>(KEY_DRAFT, null));
  now = $state(Date.now());
  /** sobe a cada pedido para abrir a tela Saúde (aviso tocado, cartão do Hoje) */
  openRequests = $state(0);
  error = $state('');

  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private nativeReady = false;

  get day(): string {
    return today(new Date(this.now));
  }

  get todayCare(): CareDay {
    return careDay(this.entries, this.day);
  }

  /** ml por dia nos últimos 7 dias, do mais antigo para hoje */
  get week(): CareDay[] {
    const out: CareDay[] = [];
    const d = new Date(this.now);
    for (let i = 6; i >= 0; i--) out.push(careDay(this.entries, today(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i))));
    return out;
  }

  /** Próximo aviso de cada tipo neste aparelho (null: nenhum hoje/amanhã). */
  nextAt(kind: NudgeKind): number | null {
    if (!this.local.notify[kind]) return null;
    return nudgeTimes(this.config[kind], this.now, this.now + 2 * 864e5, this.state(kind))[0] ?? null;
  }

  get behindMl(): number {
    return Math.max(0, expectedMl(this.config.agua, this.now) - this.todayCare.ml);
  }

  // ------------------------------------------------------------ ciclo

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.reload();
    const touch = (p: string) => {
      if (p.startsWith('Saúde/') || p === REMINDERS_NOTE) this.reloadSoon();
    };
    engine.bus.on('note.changed', (e) => touch(e.path));
    engine.bus.on('note.created', (e) => touch(e.path));
    engine.bus.on('note.deleted', (e) => touch(e.path));
    engine.bus.on('sync.finished', () => this.reloadSoon());
    if (isTauri()) {
      try {
        await this.setupNative();
      } catch (e) {
        this.error = `Avisos indisponíveis: ${e}`;
      }
    }
    this.tick();
  }

  private async setupNative(): Promise<void> {
    if (android) {
      await notif.createChannel({
        id: CHANNEL,
        name: 'Água e pausas',
        description: 'Lembretes de beber água e de levantar',
        importance: notif.Importance.Default,
        vibration: true,
      });
    }
    // os tipos de ação são registrados junto com os dos lembretes (reminders.svelte)
    await notif.onAction((a) => {
      const id = a.notification?.id;
      if (id === undefined || !isCareNotificationId(id)) return;
      const kind = careKindOfId(id)!;
      if (a.actionId === 'bebi') this.drink();
      else if (a.actionId === 'levantei') this.stood();
      else if (a.actionId === 'adiar') this.snooze(kind);
      else this.openRequests++;
    });
    this.nativeReady = true;
    await this.syncSystemSchedule();
  }

  private reloadSoon(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reload();
      this.tick();
    }, 300);
  }

  reload(): void {
    if (!engine.vault) return;
    const v = engine.vault;
    const read = (p: string) => (v.has(p) ? v.read(p) : '');
    this.config = parseCareConfig(read(CARE_NOTE));
    // registro: este mês e o anterior bastam para hoje e a semana
    const d = new Date();
    const months = [careLogPath(d.getTime()), careLogPath(new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime())];
    this.entries = months.flatMap((p) => parseCareLog(read(p))).sort((a, b) => a.at - b.at);
    const planText = read(PLAN_NOTE);
    this.hasPlan = !!planText.trim();
    this.profile = parseProfile(planText);
    this.plan = parsePlan(planText);
    const sessions: Session[] = [];
    for (const p of v.list()) {
      if (!p.startsWith(`${SESSIONS_DIR}/`)) continue;
      const s = parseSession(p, v.read(p));
      if (s) sessions.push(s);
    }
    this.sessions = sessions.sort((a, b) => a.day.localeCompare(b.day) || a.path.localeCompare(b.path));
  }

  private state(kind: NudgeKind): NudgeState {
    const t = this.todayCare;
    const skip: string[] = [];
    const quiet = this.local.quietDay[kind];
    if (quiet) skip.push(quiet);
    // meta de água batida: hoje não avisa mais
    if (kind === 'agua' && t.ml >= this.config.agua.goalMl) skip.push(this.day);
    return {
      last: kind === 'agua' ? t.lastDrink : t.lastBreak,
      snoozeUntil: this.local.snoozeUntil[kind] ?? null,
      skipDays: skip,
    };
  }

  private persist(): void {
    save(KEY_LOCAL, this.local);
  }

  /** Computador e web: mostra o que venceu e marca o próximo despertar. */
  private tick(): void {
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();
    this.now = now;
    let next = now + 60_000;
    if (!android) {
      for (const kind of ['agua', 'pausa'] as const) {
        if (!this.local.notify[kind]) continue;
        const st = this.state(kind);
        const shown = this.local.lastShown[kind] ?? 0;
        const due = nudgeTimes(this.config[kind], Math.max(now - LATE_MS, shown), now, st).at(-1);
        if (due !== undefined && due > shown) {
          this.local.lastShown[kind] = due;
          this.persist();
          this.show(kind, due);
        }
        const upcoming = nudgeTimes(this.config[kind], now, now + 2 * 864e5, st)[0];
        if (upcoming !== undefined) next = Math.min(next, upcoming);
      }
    }
    // confere ao menos a cada minuto (suspensão, relógio, virada do dia)
    this.timer = setTimeout(() => this.tick(), Math.min(Math.max(next - now, 250), 60_000));
  }

  private message(kind: NudgeKind, at: number): { title: string; body: string } {
    if (kind === 'agua') {
      return android
        ? { title: 'Hora de beber água 💧', body: `Meta de hoje: ${this.config.agua.goalMl} ml. Toque em "Bebi" para registrar ${this.config.agua.cupMl} ml.` }
        : waterMessage(this.config.agua, this.todayCare, at);
    }
    return { title: 'Hora de levantar 🧍', body: breakIdea(at) };
  }

  private show(kind: NudgeKind, at: number): void {
    const m = this.message(kind, at);
    sound.play('alert');
    if (isTauri()) {
      notif.sendNotification({
        id: careNotificationId(kind, at),
        title: m.title,
        body: m.body,
        actionTypeId: kind === 'agua' ? CARE_ACTION_AGUA : CARE_ACTION_PAUSA,
        autoCancel: true,
      });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(m.title, { body: m.body, tag: `saude-${kind}`, icon: '/tanden.svg' });
      n.onclick = () => {
        window.focus();
        this.openRequests++;
      };
    }
  }

  /** Android: entrega os próximos avisos ao agendador do sistema. */
  private async syncSystemSchedule(): Promise<void> {
    if (!android || !this.nativeReady) return;
    const now = Date.now();
    const want = new Map<string, { kind: NudgeKind; at: number }>();
    for (const kind of ['agua', 'pausa'] as const) {
      if (!this.local.notify[kind]) continue;
      for (const at of nudgeTimes(this.config[kind], now, now + SYSTEM_WINDOW_MS, this.state(kind)).slice(0, 40)) {
        want.set(String(careNotificationId(kind, at)), { kind, at });
      }
    }
    const scheduled = this.local.scheduled;
    for (const [id, s] of Object.entries(scheduled)) if (s.at <= now) delete scheduled[id];
    const cancel = Object.keys(scheduled).filter((id) => !want.has(id));
    try {
      if (cancel.length) await notif.cancel(cancel.map(Number));
      for (const id of cancel) delete scheduled[id];
      for (const [id, s] of want) {
        if (scheduled[id]) continue;
        const m = this.message(s.kind, s.at);
        notif.sendNotification({
          id: Number(id),
          title: m.title,
          body: m.body,
          actionTypeId: s.kind === 'agua' ? CARE_ACTION_AGUA : CARE_ACTION_PAUSA,
          channelId: CHANNEL,
          autoCancel: true,
          schedule: notif.Schedule.at(new Date(s.at), false, true),
        });
        scheduled[id] = s;
      }
    } catch (e) {
      this.error = `Não consegui agendar os avisos: ${e}`;
    } finally {
      this.persist();
    }
  }

  /** Depois de qualquer mudança: relê, recalcula e reagenda. */
  private changed(): void {
    this.reload();
    this.tick();
    void this.syncSystemSchedule();
  }

  // ------------------------------------------------------------ água e pausas

  private log(kind: NudgeKind, ml = 0): void {
    // web: o primeiro registro (um clique) é a hora de pedir para avisar
    if (!isTauri() && typeof Notification !== 'undefined' && Notification.permission === 'default' && this.local.notify[kind]) {
      void Notification.requestPermission();
    }
    const at = Date.now();
    const path = careLogPath(at);
    const cur = engine.vault.has(path) ? engine.vault.read(path) : '';
    feel.local(() => engine.writeNote(path, appendCare(cur, careLine(kind, at, ml), at)));
    // registrar desfaz o adiamento: a contagem recomeça daqui
    delete this.local.snoozeUntil[kind];
    this.persist();
    engine.pulse('notes', 'in');
  }

  drink(ml = this.config.agua.cupMl): void {
    const before = this.todayCare.ml;
    this.log('agua', ml);
    sound.play('complete');
    this.changed();
    const goal = this.config.agua.goalMl;
    if (before < goal && this.todayCare.ml >= goal) {
      files.say(`Meta de água batida: ${this.todayCare.ml} ml hoje. 💧`);
      vida.markHabit(['agua', 'água'], this.day);
    }
  }

  /** Desfaz o último copo de hoje. */
  undoDrink(): void {
    const last = this.entries.filter((e) => e.kind === 'agua' && e.day === this.day).at(-1);
    if (!last) return;
    const path = careLogPath(last.at);
    feel.local(() => engine.writeNote(path, removeCare(engine.vault.read(path), last.raw)));
    sound.play('tick');
    this.changed();
  }

  stood(): void {
    this.log('pausa');
    sound.play('complete');
    this.changed();
  }

  snooze(kind: NudgeKind, ms = SNOOZE_MS[kind]): void {
    this.local.snoozeUntil[kind] = Date.now() + ms;
    this.persist();
    sound.play('tick');
    this.tick();
    void this.syncSystemSchedule();
  }

  /** "Hoje não": este aparelho para de avisar até amanhã (ou volta a avisar). */
  setQuietToday(kind: NudgeKind, on: boolean): void {
    if (on) this.local.quietDay[kind] = this.day;
    else delete this.local.quietDay[kind];
    this.persist();
    this.tick();
    void this.syncSystemSchedule();
  }

  quietToday(kind: NudgeKind): boolean {
    return this.local.quietDay[kind] === this.day;
  }

  setNotify(kind: NudgeKind, on: boolean): void {
    this.local.notify[kind] = on;
    this.persist();
    if (on && !isTauri() && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    this.tick();
    void this.syncSystemSchedule();
  }

  /** Muda a configuração (vale para todos os aparelhos, pela nota). */
  setConfig(fn: (c: CareConfig) => void): void {
    const c = $state.snapshot(this.config) as CareConfig;
    fn(c);
    const cur = engine.vault.has(CARE_NOTE) ? engine.vault.read(CARE_NOTE) : '';
    feel.local(() => engine.writeNote(CARE_NOTE, writeCareConfig(cur, c)));
    this.changed();
  }

  // ------------------------------------------------------------ treino

  /** Treino sugerido agora (o próximo do rodízio). */
  get nextWorkout(): PlanDay | null {
    return nextDay(this.plan, this.sessions);
  }

  get trainingToday(): boolean {
    return isTrainingDay(this.profile, this.day);
  }

  get doneToday(): Session[] {
    return this.sessions.filter((s) => s.day === this.day);
  }

  /** Cria (ou refaz) o plano a partir do perfil. Mudanças à mão no plano são substituídas. */
  makePlan(p: Profile): void {
    const cur = engine.vault.has(PLAN_NOTE) ? engine.vault.read(PLAN_NOTE) : '';
    const text = planNote(p, generatePlan(p), this.day, cur);
    feel.local(() => engine.writeNote(PLAN_NOTE, text));
    this.syncWorkoutReminder(p);
    sound.play('create');
    engine.pulse('notes', 'in');
    this.changed();
  }

  /** O lembrete de treino vive em Lembretes.md, com os outros (avisa no PC e no Android). */
  private syncWorkoutReminder(p: Profile): void {
    const cur = engine.vault.has(REMINDERS_NOTE) ? engine.vault.read(REMINDERS_NOTE) : '';
    const next = upsertWorkoutReminder(cur, workoutReminderLine(p));
    if (next !== cur) {
      engine.writeNote(REMINDERS_NOTE, next);
      reminders.scan();
    }
  }

  swap(key: string, index: number): boolean {
    const text = swapExercise(engine.vault.read(PLAN_NOTE), key, index, this.profile);
    if (!text) {
      files.say('Não há outro exercício desse tipo para o seu equipamento e limitações.');
      return false;
    }
    feel.local(() => engine.writeNote(PLAN_NOTE, text));
    sound.play('tick');
    this.changed();
    return true;
  }

  suggestionFor(name: string, it: PlanDay['items'][number]): Suggestion {
    return suggestNext(it, historyOf(name, this.sessions));
  }

  startWorkout(day: PlanDay): void {
    const items: DraftItem[] = day.items.map((it) => {
      const s = suggestNext(it, historyOf(it.name, this.sessions));
      return {
        name: it.name,
        unit: it.unit,
        sets: Array.from({ length: it.unit === 'min' ? 1 : it.sets }, () => ({ value: null, done: false })),
        load: s.load,
        target: s.target,
        suggestion: s,
        rest: it.rest,
      };
    });
    this.draft = { day: this.day, key: day.key, title: `${day.key} · ${day.name}`, startedAt: Date.now(), items, effort: null, notes: '' };
    this.saveDraft();
    sound.play('open');
  }

  saveDraft(): void {
    save(KEY_DRAFT, this.draft ? $state.snapshot(this.draft) : null);
  }

  cancelWorkout(): void {
    this.draft = null;
    this.saveDraft();
    sound.play('close');
  }

  /** Grava a sessão em Saúde/Treinos/ e marca o hábito de exercício. */
  finishWorkout(): string | null {
    const d = this.draft;
    if (!d) return null;
    const items: ExerciseLog[] = d.items.map((it) => {
      const values = it.sets.filter((s) => s.done && s.value !== null && s.value > 0).map((s) => s.value!);
      return { name: it.name, done: values.length > 0, values, unit: it.unit, load: it.unit === 'min' ? null : it.load };
    });
    if (!items.some((i) => i.done)) {
      files.say('Marque ao menos uma série feita antes de concluir.', { error: true });
      return null;
    }
    const minutes = Math.min(240, Math.max(1, Math.round((Date.now() - d.startedAt) / 60_000)));
    const text = sessionNote({ day: d.day, key: d.key, title: d.title, minutes, effort: d.effort, items }, d.notes);
    const v = engine.vault;
    const wanted = sessionPath(d.day, d.key);
    const path = v.has(wanted) ? freePath((p) => v.has(p), SESSIONS_DIR, wanted.slice(SESSIONS_DIR.length + 1).replace(/\.md$/, ''), 'md') : wanted;
    feel.local(() => engine.writeNote(path, text));
    vida.markHabit(['exercicio', 'exercício', 'treino'], d.day);
    this.draft = null;
    this.saveDraft();
    sound.play('complete');
    engine.pulse('notes', 'in');
    files.say(`Treino ${d.key} salvo. 💪`, { path });
    this.changed();
    return path;
  }
}

export const saude = new Saude();
