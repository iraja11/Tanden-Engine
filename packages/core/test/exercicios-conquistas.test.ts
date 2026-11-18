import { describe, expect, it } from 'vitest';
import {
  HOME_PROGRAMS, MOVE_BADGES, activityCalendar, addDays, calendarLevel, longestRun, moveBadges, moveMetrics, nextBadge, nextMilestone, programLength,
  streakInfo, toActiveDays, weekStreaks,
  type ActivityLog,
} from '../src/index';

const log = (day: string, x: Partial<ActivityLog> = {}): ActivityLog => ({ day, time: '07:30', name: 'Treino', minutes: 20, kcal: 100, effort: null, focus: 'corpo', program: null, raw: '', ...x });
const run = (from: string, n: number, x: Partial<ActivityLog> = {}) => Array.from({ length: n }, (_, i) => log(addDays(from, i), x));

describe('sequências', () => {
  it('conta a maior sequência e a atual', () => {
    expect(longestRun(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06'])).toBe(3);
    const items = toActiveDays([...run('2026-11-01', 5), ...run('2026-11-15', 3)]);
    const s = streakInfo(items, '2026-11-18', 150);
    expect(s).toMatchObject({ current: 3, best: 5, todayDone: false, atRisk: true, totalDays: 8, next: 7 });
    expect(streakInfo(items, '2026-11-17', 150)).toMatchObject({ current: 3, todayDone: true, atRisk: false });
    expect(streakInfo(items, '2026-11-19', 150).current).toBe(0);
  });

  it('semana em andamento não quebra a sequência de metas', () => {
    // semanas de 26/10, 02/11 e 09/11 com 140 min; a de 16/11 ainda está no começo
    const items = toActiveDays([...run('2026-10-26', 7), ...run('2026-11-02', 7), ...run('2026-11-09', 7), log('2026-11-16')]);
    expect(weekStreaks(items, '2026-11-18', 140)).toEqual({ current: 3, best: 3 });
    expect(weekStreaks(items, '2026-11-18', 150)).toEqual({ current: 0, best: 0 });
    // uma semana vazia no meio zera
    const gap = toActiveDays([...run('2026-10-26', 7), ...run('2026-11-09', 7)]);
    expect(weekStreaks(gap, '2026-11-18', 140)).toEqual({ current: 1, best: 1 });
  });

  it('marcos sobem sempre', () => {
    expect(nextMilestone(0)).toBe(3);
    expect(nextMilestone(7)).toBe(14);
    expect(nextMilestone(1000)).toBeGreaterThan(1000);
  });

  it('calendário termina na semana de hoje e marca o futuro', () => {
    const cal = activityCalendar(toActiveDays([log('2026-11-18', { minutes: 45 }), log('2026-11-02', { minutes: 5 })]), '2026-11-18', 4);
    expect(cal).toHaveLength(4);
    expect(cal.every((w) => w.length === 7)).toBe(true);
    expect(cal[3]![0]!.day).toBe('2026-11-16');
    expect(cal[3]![2]).toMatchObject({ day: '2026-11-18', level: 4, future: false });
    expect(cal[3]![3]!.future).toBe(true);
    expect(cal[1]![0]).toMatchObject({ day: '2026-11-02', level: 1 });
    expect([0, 5, 15, 30, 60].map(calendarLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('conquistas', () => {
  it('ids únicos e alvos positivos', () => {
    const ids = MOVE_BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(MOVE_BADGES.every((b) => b.target > 0 && b.name && b.desc)).toBe(true);
  });

  it('sem histórico nada é obtido', () => {
    const st = moveBadges({ logs: [], active: [], weekGoal: 150 });
    expect(st.some((s) => s.done)).toBe(false);
    expect(nextBadge(st)).not.toBeNull();
  });

  it('mede o histórico e data cada conquista', () => {
    const logs = [
      ...run('2026-11-01', 7),
      log('2026-11-08', { time: '06:10', focus: 'pernas', effort: 10, minutes: 60 }),
      log('2026-11-20', { time: '22:30', focus: null, name: 'Caminhada' }),
      log('2026-11-20', { time: '23:00', focus: null, name: 'Dança' }),
      log('2026-11-20', { time: '23:30', focus: 'cardio' }),
    ];
    const input = { logs, active: toActiveDays(logs), weekGoal: 150 };
    const m = moveMetrics(input);
    expect(m).toMatchObject({ sessions: 11, streakBest: 8, earlyBirds: 1, nightOwls: 1, maxEffort: 10, manualKinds: 2, sameDay: 3, comeback: 11, longest: 60, focuses: 3 });
    const st = moveBadges(input);
    const by = (id: string) => st.find((s) => s.badge.id === id)!;
    expect(by('streakBest-7')).toMatchObject({ done: true, since: '2026-11-07' });
    expect(by('streakBest-3').since).toBe('2026-11-03');
    expect(by('sameDay-3')).toMatchObject({ done: true, since: '2026-11-20' });
    expect(by('comeback-14').done).toBe(false);
    expect(by('streakBest-14').progress).toBeCloseTo(8 / 14);
  });

  it('programa só conta quando termina', () => {
    const p = HOME_PROGRAMS.find((x) => x.id === 'comecar')!;
    const logs = run('2026-10-01', programLength(p) - 1, { program: p.id });
    expect(moveMetrics({ logs, active: toActiveDays(logs), weekGoal: 150 }).programs).toBe(0);
    logs.push(log('2026-11-01', { program: p.id }));
    expect(moveMetrics({ logs, active: toActiveDays(logs), weekGoal: 150 }).programs).toBe(1);
  });
});
