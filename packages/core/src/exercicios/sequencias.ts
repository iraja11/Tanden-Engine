/*
 * Sequências (streaks) e o calendário de atividade dos exercícios.
 *
 * Tudo sai do registro: nada é guardado à parte, então não há o que fundir entre
 * aparelhos. Duas sequências contam:
 * - a diária: dias seguidos com alguma atividade (hoje ainda vazio não quebra);
 * - a semanal: semanas seguidas batendo a meta de minutos (a semana atual só
 *   entra quando a meta já foi batida, e não quebra enquanto não acabou).
 */
import { addDays, isoWeek } from '../vida';
import type { ActiveDay } from './registro';

export interface StreakInfo {
  /** dias seguidos até hoje (ou até ontem, se hoje ainda está vazio) */
  current: number;
  /** maior sequência diária de todos os tempos */
  best: number;
  /** já treinou hoje */
  todayDone: boolean;
  /** a sequência está viva mas acaba se hoje passar em branco */
  atRisk: boolean;
  /** semanas seguidas batendo a meta */
  weeks: number;
  weeksBest: number;
  /** dias diferentes com atividade, desde sempre */
  totalDays: number;
  /** próximo marco da sequência diária */
  next: number;
}

/** Marcos que a tela comemora. */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365, 500, 730, 1000];

export const nextMilestone = (n: number): number => STREAK_MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 100) * 100;

/** Dias distintos, em ordem. */
const daysOf = (items: ActiveDay[]): string[] => [...new Set(items.filter((x) => x.minutes > 0).map((x) => x.day))].sort();

/** Maior sequência de dias consecutivos numa lista ordenada de dias. */
export function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

/** Minutos por semana (segunda-feira → minutos). */
function minutesByWeek(items: ActiveDay[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of items) {
    const { monday } = isoWeek(x.day);
    out.set(monday, (out.get(monday) ?? 0) + x.minutes);
  }
  return out;
}

/** Semanas seguidas com a meta batida: a atual e a melhor. */
export function weekStreaks(items: ActiveDay[], day: string, goal: number): { current: number; best: number } {
  if (!items.length || goal <= 0) return { current: 0, best: 0 };
  const byWeek = minutesByWeek(items);
  const first = isoWeek([...items].sort((a, b) => a.day.localeCompare(b.day))[0]!.day).monday;
  const thisWeek = isoWeek(day).monday;
  let best = 0;
  let run = 0;
  for (let w = first; w <= thisWeek; w = addDays(w, 7)) {
    const hit = (byWeek.get(w) ?? 0) >= goal;
    if (hit) run++;
    else if (w !== thisWeek) run = 0;
    if (run > best) best = run;
  }
  return { current: run, best };
}

export function streakInfo(items: ActiveDay[], day: string, weekGoal: number): StreakInfo {
  const days = daysOf(items);
  const set = new Set(days);
  const todayDone = set.has(day);
  let cur = todayDone ? day : addDays(day, -1);
  let current = 0;
  while (set.has(cur)) {
    current++;
    cur = addDays(cur, -1);
  }
  const weeks = weekStreaks(items, day, weekGoal);
  return {
    current,
    best: Math.max(current, longestRun(days)),
    todayDone,
    atRisk: !todayDone && current > 0,
    weeks: weeks.current,
    weeksBest: weeks.best,
    totalDays: days.length,
    next: nextMilestone(current),
  };
}

// ------------------------------------------------------------------ calendário

export interface CalendarCell {
  day: string;
  minutes: number;
  /** 0 nada, 1 a 4 de pouco a muito */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

export const calendarLevel = (minutes: number): CalendarCell['level'] =>
  minutes <= 0 ? 0 : minutes < 10 ? 1 : minutes < 20 ? 2 : minutes < 40 ? 3 : 4;

/**
 * Grade de atividade das últimas `weeks` semanas, uma coluna por semana
 * (segunda a domingo), terminando na semana de `day`.
 */
export function activityCalendar(items: ActiveDay[], day: string, weeks = 15): CalendarCell[][] {
  const byDay = new Map<string, number>();
  for (const x of items) byDay.set(x.day, (byDay.get(x.day) ?? 0) + x.minutes);
  const { monday } = isoWeek(day);
  const start = addDays(monday, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, w * 7 + i);
      const minutes = Math.round(byDay.get(d) ?? 0);
      return { day: d, minutes, level: calendarLevel(minutes), future: d > day };
    }));
}
