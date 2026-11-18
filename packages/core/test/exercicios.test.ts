import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOVE_SETTINGS, HOME_MOVES, HOME_PROGRAMS, HOME_PROPS, MOVE_AREAS, ROUTINE_FOCUS, activeStreak, activityKcal, activityLine, appendActivity,
  buildRoutine, homeMoveById, moveAllowed, moveLogPath, parseActivityLine, parseActivityLog, parseMoveSettings, phaseAt, phaseStart, programDone,
  programLength, programRoutine, removeActivity, routineKcal, routineSeconds, routineTimeline, suggestWorkout, toActiveDays, weekSummary, weeksHistory,
  writeMoveSettings,
  type ActivityLog, type Limit, type MoveSettings, type RoutineOptions,
} from '../src/index';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime(); // novembro de 2026; 18 é quarta
const opts = (x: Partial<RoutineOptions> = {}): RoutineOptions => ({ focus: 'corpo', minutes: 20, level: 1, props: [], avoid: [], quiet: true, seed: 's', ...x });

const log = (day: string, x: Partial<ActivityLog> = {}): ActivityLog => ({ day, time: '07:00', name: 'Treino', minutes: 20, kcal: null, effort: null, focus: 'corpo', program: null, raw: '', ...x });

describe('biblioteca', () => {
  it('ids únicos e variações que existem', () => {
    expect(new Set(HOME_MOVES.map((m) => m.id)).size).toBe(HOME_MOVES.length);
    for (const m of HOME_MOVES) {
      if (m.easier) expect(homeMoveById(m.easier), `${m.id} → ${m.easier}`).toBeDefined();
      if (m.harder) expect(homeMoveById(m.harder), `${m.id} → ${m.harder}`).toBeDefined();
      expect(m.steps.length, m.id).toBeGreaterThan(0);
      expect(m.met, m.id).toBeGreaterThan(1);
    }
  });

  it('toda área tem exercício para iniciante sem objeto nenhum', () => {
    for (const a of MOVE_AREAS) {
      const free = HOME_MOVES.filter((m) => m.area === a.id && moveAllowed(m, { level: 1, props: [], avoid: [], quiet: true }));
      expect(free.length, a.id).toBeGreaterThan(0);
    }
  });

  it('o que faz barulho fica de fora no modo sem saltos', () => {
    expect(HOME_MOVES.some((m) => m.noisy)).toBe(true);
    const r = buildRoutine(opts({ focus: 'cardio', level: 3, quiet: true, minutes: 30 }));
    for (const s of r.steps) expect(homeMoveById(s.moveId)!.noisy, s.moveId).toBeFalsy();
  });
});

describe('montagem do treino', () => {
  const LIMITS: Limit[][] = [[], ['joelho'], ['lombar'], ['ombro', 'punho'], ['joelho', 'lombar', 'ombro', 'punho']];

  it('toda combinação gera um treino válido e dentro do tempo', () => {
    for (const f of ROUTINE_FOCUS) {
      for (const level of [1, 2, 3] as const) {
        for (const minutes of [5, 10, 15, 20, 30, 45, 60]) {
          for (const avoid of LIMITS) {
            for (const props of [[], HOME_PROPS.map((p) => p.id)]) {
              const r = buildRoutine(opts({ focus: f.id, level, minutes, avoid, props }));
              const label = `${f.id} n${level} ${minutes}min ${avoid.join('+')} ${props.length}`;
              expect(r.steps.length, label).toBeGreaterThan(0);
              const secs = routineSeconds(r);
              expect(secs, label).toBeLessThanOrEqual(minutes * 60 * 1.15 + 45);
              expect(secs, label).toBeGreaterThanOrEqual(minutes * 60 * 0.55);
              for (const s of r.steps) {
                const m = homeMoveById(s.moveId)!;
                expect(m, label).toBeDefined();
                if (m.id !== 'marcha-parada') expect(moveAllowed(m, { level, props, avoid, quiet: true }), `${label}: ${m.id}`).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('é repetível e muda com a semente', () => {
    expect(buildRoutine(opts())).toEqual(buildRoutine(opts()));
    const seeds = new Set(['a', 'b', 'c', 'd', 'e'].map((seed) => buildRoutine(opts({ seed })).steps.map((s) => s.moveId).join()));
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('tem aquecimento, circuito e volta à calma, nesta ordem', () => {
    const r = buildRoutine(opts({ minutes: 25 }));
    const blocks = r.steps.map((s) => s.block);
    expect(blocks[0]).toBe('aquecimento');
    expect(blocks.at(-1)).toBe('volta');
    expect(blocks.indexOf('volta')).toBeGreaterThan(blocks.lastIndexOf('circuito'));
    expect(blocks.lastIndexOf('aquecimento')).toBeLessThan(blocks.indexOf('circuito'));
    expect(r.rounds).toBeGreaterThanOrEqual(2);
    expect(r.steps.at(-1)!.rest).toBe(0);
  });

  it('a pausa na cadeira usa só movimentos sentados', () => {
    const r = buildRoutine(opts({ focus: 'pausa', minutes: 5, props: ['cadeira'] }));
    for (const s of r.steps) expect(homeMoveById(s.moveId)!.area).toBe('sentado');
  });

  it('varia em relação ao treino anterior', () => {
    const first = buildRoutine(opts({ seed: 'x' }));
    const recent = first.steps.filter((s) => s.block === 'circuito').map((s) => s.moveId);
    const next = buildRoutine(opts({ seed: 'x', recent, props: HOME_PROPS.map((p) => p.id), level: 2 }));
    const again = next.steps.filter((s) => s.block === 'circuito').map((s) => s.moveId);
    expect(again.filter((id) => recent.includes(id)).length).toBeLessThan(new Set(again).size);
  });

  it('estima calorias pelo peso', () => {
    const r = buildRoutine(opts());
    expect(routineKcal(r, 80)).toBeGreaterThan(routineKcal(r, 60));
    expect(routineKcal(r, 70)).toBeGreaterThan(40);
    expect(activityKcal(3.5, 30, 70)).toBe(129);
  });
});

describe('linha do tempo', () => {
  const r = buildRoutine(opts({ minutes: 10 }));
  const tl = routineTimeline(r);

  it('começa preparando e cobre todos os passos', () => {
    expect(tl[0]!.kind).toBe('preparar');
    expect(tl.filter((p) => p.kind === 'fazer')).toHaveLength(r.steps.length);
    expect(tl.at(-1)!.kind).toBe('fazer');
  });

  it('acha a fase pelo tempo decorrido e termina', () => {
    expect(phaseAt(tl, 0)).toMatchObject({ index: 0, remaining: tl[0]!.seconds, done: false });
    expect(phaseAt(tl, 3).remaining).toBe(tl[0]!.seconds - 3);
    expect(phaseAt(tl, tl[0]!.seconds)).toMatchObject({ index: 1, done: false });
    const total = tl.reduce((a, p) => a + p.seconds, 0);
    expect(phaseAt(tl, total - 1).done).toBe(false);
    expect(phaseAt(tl, total)).toMatchObject({ done: true, remaining: 0 });
    expect(phaseAt(tl, phaseStart(tl, 3)).index).toBe(3);
  });
});

describe('programas', () => {
  it('todo treino de todo programa existe e fica no caminho certo', () => {
    for (const p of HOME_PROGRAMS) {
      for (let i = 0; i < programLength(p); i++) {
        const r = programRoutine(p, i, { props: [], avoid: ['joelho'], quiet: false });
        expect(r.steps.length, `${p.id} ${i}`).toBeGreaterThan(0);
        expect(r.program).toEqual({ id: p.id, index: i });
      }
    }
  });

  it('o programa de iniciante cresce aos poucos e não tem salto', () => {
    const p = HOME_PROGRAMS.find((x) => x.id === 'comecar')!;
    const first = programRoutine(p, 0, { props: [], avoid: [], quiet: false });
    const last = programRoutine(p, programLength(p) - 1, { props: [], avoid: [], quiet: false });
    expect(routineSeconds(last)).toBeGreaterThan(routineSeconds(first));
    for (const s of last.steps) expect(homeMoveById(s.moveId)!.noisy).toBeFalsy();
  });

  it('conta os treinos feitos', () => {
    expect(programDone([log('2026-11-16', { program: 'comecar' }), log('2026-11-17', { program: 'coluna' }), log('2026-11-18', { program: 'comecar' })], 'comecar')).toBe(2);
  });
});

describe('ajustes e registro', () => {
  it('grava e lê os ajustes', () => {
    const s: MoveSettings = { level: 2, props: ['mochila', 'sofa'], avoid: ['joelho'], quiet: false, minutes: 30, weekGoal: 200, program: 'forca-casa' };
    const text = writeMoveSettings('', s);
    expect(text).toContain('# Exercícios');
    expect(parseMoveSettings(text)).toEqual(s);
    expect(parseMoveSettings('')).toEqual(DEFAULT_MOVE_SETTINGS);
    expect(parseMoveSettings(writeMoveSettings('', { ...s, props: [] })).props).toEqual([]);
  });

  it('registra, lê e desfaz', () => {
    const line = activityLine({ name: 'Corpo inteiro', minutes: 20, kcal: 140, effort: 6, focus: 'corpo', program: 'comecar' }, at(18, 7, 30));
    const text = appendActivity('', line, at(18, 7, 30));
    expect(text.startsWith('# Registro de exercícios 2026-11')).toBe(true);
    const list = parseActivityLog(text);
    expect(list).toMatchObject([{ day: '2026-11-18', time: '07:30', name: 'Corpo inteiro', minutes: 20, kcal: 140, effort: 6, focus: 'corpo', program: 'comecar' }]);
    expect(parseActivityLog(removeActivity(text, list[0]!.raw))).toEqual([]);
    expect(moveLogPath(at(18, 7))).toBe('Exercícios/Registro/2026-11.md');
  });

  it('aceita linha escrita à mão e ignora o resto', () => {
    expect(parseActivityLine('- 2026-11-18 19:00 🏃 Caminhada · 30 min')).toMatchObject({ name: 'Caminhada', minutes: 30, kcal: null, focus: null });
    expect(parseActivityLine('- 2026-11-18 19:00 🏃 Caminhada')).toBeNull();
    expect(parseActivityLine('- [ ] correr')).toBeNull();
  });
});

describe('progresso', () => {
  it('resume a semana de segunda a domingo', () => {
    const items = toActiveDays([log('2026-11-15'), log('2026-11-16'), log('2026-11-16', { focus: 'pernas' }), log('2026-11-18', { focus: 'cardio', minutes: 30 }), log('2026-11-23')]);
    expect(weekSummary(items, '2026-11-18')).toMatchObject({ monday: '2026-11-16', minutes: 70, sessions: 3, strengthDays: 1, activeDays: ['2026-11-16', '2026-11-18'] });
  });

  it('histórico termina na semana atual', () => {
    const w = weeksHistory(toActiveDays([log('2026-11-18'), log('2026-11-04')]), '2026-11-18', 3);
    expect(w.map((x) => x.minutes)).toEqual([20, 0, 20]);
    expect(w.at(-1)!.monday).toBe('2026-11-16');
  });

  it('a sequência não quebra enquanto hoje não acabou', () => {
    const items = toActiveDays([log('2026-11-15'), log('2026-11-16'), log('2026-11-17')]);
    expect(activeStreak(items, '2026-11-18')).toBe(3);
    expect(activeStreak(items, '2026-11-17')).toBe(3);
    expect(activeStreak(items, '2026-11-19')).toBe(0);
  });

  it('a sugestão do dia acompanha o histórico', () => {
    const s = DEFAULT_MOVE_SETTINGS;
    expect(suggestWorkout([], s, '2026-11-18')).toMatchObject({ focus: 'corpo', minutes: 15 });
    expect(suggestWorkout([log('2026-11-18')], s, '2026-11-18').focus).toBe('alongar');
    expect(suggestWorkout([log('2026-11-01')], s, '2026-11-18').reason).toMatch(/17 dias/);
    expect(suggestWorkout([log('2026-11-17', { effort: 9 })], s, '2026-11-18').focus).toBe('mobilidade');
    expect(suggestWorkout([log('2026-11-17', { focus: 'pernas' })], s, '2026-11-18').focus).not.toBe('pernas');
  });
});
