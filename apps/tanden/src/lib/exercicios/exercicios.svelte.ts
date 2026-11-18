import {
  DEFAULT_MOVE_SETTINGS, MOVE_LOG_DIR, MOVE_NOTE, activeStreak, activityKcal, activityLine, appendActivity, buildRoutine, homeProgramById, moveLogPath, parseActivityLog,
  parseMoveSettings, programDone, programLength, programRoutine, removeActivity, routineKcal, routineSeconds, suggestWorkout, toActiveDays, today, weekSummary, weeksHistory,
  writeMoveSettings,
  type ActiveDay, type ActivityLog, type HomeProgram, type MoveSettings, type Routine, type RoutineFocus,
} from '@tanden/core';
import { alimentacao } from '../alimentacao/alimentacao.svelte';
import { engine } from '../engine.svelte';
import { feel } from '../feel.svelte';
import { files } from '../files/files.svelte';
import { saude } from '../saude/saude.svelte';
import { sound } from '../sound.svelte';
import { vida } from '../vida/vida.svelte';

/*
 * Exercícios em casa: treinos guiados, programas e registro.
 * Ajustes e histórico moram em notas da pasta Exercícios/.
 */

/** Treino em andamento: sobrevive a fechar o app no meio. */
export interface WorkoutSession {
  routine: Routine;
  /** posição na linha do tempo, em segundos */
  elapsed: number;
  /** tempo realmente treinado (pular um exercício não conta) */
  worked: number;
}

const SESSION_KEY = 'tanden.exercicios.emAndamento';
const RECENT_KEY = 'tanden.exercicios.recentes';

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function keep(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o treino só não é retomado depois */
  }
}

class Exercicios {
  settings = $state<MoveSettings>({ ...DEFAULT_MOVE_SETTINGS });
  logs = $state<ActivityLog[]>([]);
  session = $state<WorkoutSession | null>(null);
  /** a tela do treino está aberta */
  playing = $state(false);
  now = $state(Date.now());
  tab = $state('treinar');
  openRequests = $state(0);

  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly day = $derived(today(new Date(this.now)));
  readonly bodyKg = $derived(alimentacao.profile.weightKg ?? 70);
  /** treinos daqui e os da aba Saúde contam juntos para a meta da semana */
  readonly activeDays = $derived<ActiveDay[]>([
    ...toActiveDays(this.logs),
    ...saude.sessions.map((s) => ({ day: s.day, minutes: s.minutes ?? 0, strength: true })),
  ]);
  readonly week = $derived(weekSummary(this.activeDays, this.day));
  readonly history = $derived(weeksHistory(this.activeDays, this.day, 8));
  readonly streak = $derived(activeStreak(this.activeDays, this.day));
  readonly idea = $derived(suggestWorkout(this.logs, this.settings, this.day));
  readonly program = $derived(this.settings.program ? homeProgramById(this.settings.program) ?? null : null);

  start(): void {
    if (this.started) return;
    this.started = true;
    this.session = load<WorkoutSession>(SESSION_KEY);
    this.reload();
    const touch = (p: string) => {
      if (p.startsWith('Exercícios/')) this.reloadSoon();
    };
    engine.bus.on('note.changed', (e) => touch(e.path));
    engine.bus.on('note.created', (e) => touch(e.path));
    engine.bus.on('note.deleted', (e) => touch(e.path));
    engine.bus.on('sync.finished', () => this.reloadSoon());
    setInterval(() => (this.now = Date.now()), 60_000);
  }

  private reloadSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reload(), 300);
  }

  private read(path: string): string {
    return engine.vault.has(path) ? engine.vault.read(path) : '';
  }

  reload(): void {
    if (!engine.vault) return;
    this.settings = parseMoveSettings(this.read(MOVE_NOTE));
    const logs: ActivityLog[] = [];
    for (const p of engine.vault.list()) {
      if (p.startsWith(`${MOVE_LOG_DIR}/`)) logs.push(...parseActivityLog(engine.vault.read(p)));
    }
    this.logs = logs.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
  }

  private write(path: string, text: string): void {
    feel.local(() => engine.writeNote(path, text));
    engine.pulse('notes', 'in');
    this.reload();
  }

  saveSettings(next: Partial<MoveSettings>): void {
    const merged = { ...($state.snapshot(this.settings) as MoveSettings), ...next };
    this.write(MOVE_NOTE, writeMoveSettings(this.read(MOVE_NOTE), merged));
  }

  // ------------------------------------------------------------ treino

  /** Monta um treino novo, evitando repetir os movimentos do anterior. */
  build(focus: RoutineFocus, minutes: number, quiet = this.settings.quiet): Routine {
    const s = $state.snapshot(this.settings) as MoveSettings;
    return buildRoutine({ focus, minutes, level: s.level, props: s.props, avoid: s.avoid, quiet, seed: String(Date.now()), recent: load<string[]>(RECENT_KEY) ?? [] });
  }

  begin(routine: Routine): void {
    this.session = { routine, elapsed: 0, worked: 0 };
    keep(SESSION_KEY, this.session);
    keep(RECENT_KEY, [...new Set(routine.steps.filter((s) => s.block === 'circuito').map((s) => s.moveId))]);
    this.playing = true;
    sound.play('open');
  }

  resume(): void {
    if (this.session) this.playing = true;
  }

  /** Guarda onde o treino parou. */
  checkpoint(elapsed: number, worked: number): void {
    if (!this.session) return;
    this.session.elapsed = elapsed;
    this.session.worked = worked;
    keep(SESSION_KEY, $state.snapshot(this.session));
  }

  /** Quanto o treino em andamento rendeu até agora. */
  tally(s: WorkoutSession): { minutes: number; kcal: number } {
    const total = Math.max(1, routineSeconds(s.routine));
    return {
      minutes: Math.max(1, Math.round(s.worked / 60)),
      kcal: Math.round(routineKcal(s.routine, this.bodyKg) * Math.min(1, s.worked / total)),
    };
  }

  /** Encerra e anota no registro. Só treino completo avança o programa. */
  finish(effort: number | null, complete: boolean): void {
    const s = this.session;
    if (!s) return;
    const at = Date.now();
    const { minutes, kcal } = this.tally(s);
    const line = activityLine({
      name: s.routine.title, minutes, kcal, effort, focus: s.routine.focus,
      program: complete ? s.routine.program?.id ?? null : null,
    }, at);
    const path = moveLogPath(at);
    this.write(path, appendActivity(this.read(path), line, at));
    vida.markHabit(['exercicio', 'exercício', 'treino'], this.day);
    this.discard();
    sound.play('complete');
  }

  discard(): void {
    this.session = null;
    this.playing = false;
    keep(SESSION_KEY, null);
  }

  // ------------------------------------------------------------ programas

  programNext(p: HomeProgram): number {
    return programDone(this.logs, p.id);
  }

  startProgram(p: HomeProgram): void {
    if (this.settings.program !== p.id) this.saveSettings({ program: p.id });
    const done = this.programNext(p);
    if (done >= programLength(p)) return;
    const s = $state.snapshot(this.settings) as MoveSettings;
    this.begin(programRoutine(p, done, { props: s.props, avoid: s.avoid, quiet: s.quiet }));
  }

  // ------------------------------------------------------------ registro à mão

  logManual(name: string, met: number, minutes: number): void {
    const at = Date.now();
    const path = moveLogPath(at);
    const line = activityLine({ name, minutes, kcal: activityKcal(met, minutes, this.bodyKg), effort: null, focus: null, program: null }, at);
    this.write(path, appendActivity(this.read(path), line, at));
    vida.markHabit(['exercicio', 'exercício', 'treino'], this.day);
    sound.play('complete');
  }

  remove(log: ActivityLog): void {
    const [y, m, d] = log.day.split('-').map(Number);
    const at = new Date(y!, m! - 1, d!).getTime();
    const path = moveLogPath(at);
    this.write(path, removeActivity(this.read(path), log.raw));
    sound.play('tick');
    files.say(`"${log.name}" tirado do registro.`, { action: { label: 'Desfazer', run: () => this.write(path, appendActivity(this.read(path), log.raw, at)) } });
  }
}

export const exercicios = new Exercicios();
