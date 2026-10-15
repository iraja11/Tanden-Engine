import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CARE, EXERCISES, appendCare, availableGear, careDay, careKindOfId, careLine, careLogPath, careNotificationId, estimateMinutes,
  exerciseByName, expectedMl, generatePlan, isCareNotificationId, nextDay, notificationId, nudgeTimes, parseCareConfig, parseCareLog,
  parseDays, parsePlan, parseProfile, parseReminders, parseSession, planNote, removeCare, sessionNote, suggestNext, swapExercise,
  upsertWorkoutReminder, waterMessage, weeklyVolume, workoutReminderLine, writeCareConfig, DEFAULT_PROFILE, historyOf,
  type Profile, type Session,
} from '../src/index';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime(); // outubro de 2026; 15 é quinta

describe('cuidados: configuração', () => {
  it('sem nota usa o padrão, e grava e lê de volta', () => {
    expect(parseCareConfig('')).toEqual(DEFAULT_CARE);
    const c = structuredClone(DEFAULT_CARE);
    c.agua.goalMl = 2500;
    c.agua.every = 45;
    c.pausa.days = [1, 2, 3, 4, 5, 6];
    c.pausa.from = '10:30';
    c.pausa.on = false;
    const text = writeCareConfig('', c);
    expect(text).toContain('# Saúde');
    expect(parseCareConfig(text)).toEqual(c);
    // regravar não duplica chaves e mantém o corpo
    const again = writeCareConfig(text, c);
    expect(again.match(/água_meta_ml/g)).toHaveLength(1);
    expect(again).toContain('# Saúde');
  });

  it('valores quebrados caem no padrão', () => {
    const c = parseCareConfig('---\nágua_intervalo_min: banana\nágua_janela: 22:00-08:00\npausa_intervalo_min: 2\nágua_meta_ml: 1500\n---\n');
    expect(c.agua.every).toBe(60);
    expect([c.agua.from, c.agua.to]).toEqual(['08:00', '22:00']);
    expect(c.pausa.every).toBe(10);
    expect(c.agua.goalMl).toBe(1500);
  });

  it('dias em português', () => {
    expect(parseDays('seg, qua, sex')).toEqual([1, 3, 5]);
    expect(parseDays(['Sábado', 'domingo'])).toEqual([0, 6]);
    expect(parseDays('dias úteis')).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays('todos')).toHaveLength(7);
    expect(parseDays('')).toBeNull();
  });
});

describe('cuidados: registro', () => {
  it('acrescenta, lê, soma o dia e desfaz', () => {
    let t = appendCare('', careLine('agua', at(15, 9, 5), 250), at(15, 9, 5));
    t = appendCare(t, careLine('pausa', at(15, 10), 0), at(15, 10));
    t = appendCare(t, careLine('agua', at(15, 11, 30), 300), at(15, 11, 30));
    t = appendCare(t, careLine('agua', at(14, 20), 250), at(14, 20));
    expect(t.startsWith('# Registro de saúde')).toBe(true);
    const log = parseCareLog(t);
    expect(log).toHaveLength(4);
    const day = careDay(log, '2026-10-15');
    expect(day).toMatchObject({ ml: 550, cups: 2, breaks: 1, lastDrink: at(15, 11, 30), lastBreak: at(15, 10) });
    const undone = removeCare(t, log.filter((e) => e.day === '2026-10-15' && e.kind === 'agua').at(-1)!.raw);
    expect(careDay(parseCareLog(undone), '2026-10-15').ml).toBe(250);
    expect(careLogPath(at(15, 9))).toBe('Saúde/Registro/2026-10.md');
  });

  it('ritmo esperado ao longo da janela', () => {
    const a = DEFAULT_CARE.agua; // 08:00-22:00, 2000 ml
    expect(expectedMl(a, at(15, 7))).toBe(0);
    expect(expectedMl(a, at(15, 15))).toBe(1000);
    expect(expectedMl(a, at(15, 23))).toBe(2000);
    const msg = waterMessage(a, careDay([], '2026-10-15'), at(15, 15));
    expect(msg.body).toContain('atrás do ritmo');
  });
});

describe('cuidados: quando avisar', () => {
  const water = { ...DEFAULT_CARE.agua, every: 60, from: '08:00', to: '12:00', days: [0, 1, 2, 3, 4, 5, 6] };

  it('a cada intervalo dentro da janela', () => {
    expect(nudgeTimes(water, at(15, 7), at(15, 23, 59))).toEqual([at(15, 9), at(15, 10), at(15, 11), at(15, 12)]);
    // a partir de agora, sem repetir o passado
    expect(nudgeTimes(water, at(15, 10, 30), at(15, 23))).toEqual([at(15, 11), at(15, 12)]);
  });

  it('recomeça a contar do último copo e do adiamento', () => {
    expect(nudgeTimes(water, at(15, 9, 40), at(15, 23), { last: at(15, 9, 40) })).toEqual([at(15, 10, 40), at(15, 11, 40)]);
    expect(nudgeTimes(water, at(15, 9, 0), at(15, 23), { snoozeUntil: at(15, 9, 15) })).toEqual([at(15, 9, 15), at(15, 10, 15), at(15, 11, 15)]);
    // registro de ontem não mexe no dia de hoje
    expect(nudgeTimes(water, at(15, 7), at(15, 23), { last: at(14, 11, 50) })[0]).toBe(at(15, 9));
  });

  it('respeita dias, dias pulados e desligado', () => {
    const weekdays = { ...water, days: [1, 2, 3, 4, 5] };
    const t = nudgeTimes(weekdays, at(16, 13), at(19, 23)); // sexta à tarde até segunda
    expect(t.every((x) => new Date(x).getDate() === 19)).toBe(true);
    expect(nudgeTimes(water, at(15, 7), at(16, 23), { skipDays: ['2026-10-15'] }).every((x) => new Date(x).getDate() === 16)).toBe(true);
    expect(nudgeTimes({ ...water, on: false }, at(15, 7), at(16, 23))).toEqual([]);
  });

  it('ids próprios, que não colidem com os lembretes', () => {
    const id = careNotificationId('pausa', at(15, 10));
    expect(isCareNotificationId(id)).toBe(true);
    expect(careKindOfId(id)).toBe('pausa');
    expect(careKindOfId(careNotificationId('agua', at(15, 10)))).toBe('agua');
    expect(id).toBeLessThan(2 ** 31);
    for (let i = 0; i < 200; i++) expect(isCareNotificationId(notificationId({ key: `k${i}`, at: i }))).toBe(false);
  });
});

const profile = (p: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, ...p });

describe('treino: plano', () => {
  it('lê o perfil da nota', () => {
    const p = parseProfile('---\nobjetivo: força\nnível: intermediário\ndias: seg, ter, qui, sex\nminutos: 60\nequipamento:\n  - academia\nevitar: [joelho]\nhora: "7h"\n---\n');
    expect(p).toEqual({ goal: 'forca', level: 2, days: [1, 2, 4, 5], minutes: 60, gear: ['academia'], avoid: ['joelho'], time: '07:00' });
    expect(parseProfile('')).toEqual(DEFAULT_PROFILE);
  });

  it('divide a semana pelo número de dias', () => {
    const n = (k: number) => generatePlan(profile({ days: [0, 1, 2, 3, 4, 5].slice(0, k), gear: ['academia'], minutes: 90 })).days.map((d) => d.name);
    expect(n(2)).toEqual(['Corpo inteiro', 'Corpo inteiro']);
    expect(n(3)).toHaveLength(3);
    expect(n(4)).toEqual(['Superiores', 'Inferiores', 'Superiores', 'Inferiores']);
    expect(n(6)[0]).toMatch(/Empurrar/);
  });

  it('só usa o equipamento que existe e evita as limitações', () => {
    for (const gear of [[], ['halteres'], ['elastico'], ['academia'], ['halteres', 'barra-fixa']] as Profile['gear'][]) {
      for (const avoid of [[], ['joelho', 'ombro'], ['lombar', 'punho']] as Profile['avoid'][]) {
        for (const level of [1, 2, 3] as const) {
          const p = profile({ gear, avoid, level, days: [1, 3, 5], goal: 'hipertrofia', minutes: 75 });
          const have = availableGear(p);
          const plan = generatePlan(p);
          expect(plan.days).toHaveLength(3);
          for (const d of plan.days) {
            expect(d.items.length).toBeGreaterThanOrEqual(3);
            expect(new Set(d.items.map((i) => i.name)).size).toBe(d.items.length);
            for (const it of d.items) {
              const ex = exerciseByName(it.name)!;
              expect(ex, it.name).toBeTruthy();
              expect(ex.gear.every((g) => have.has(g)), `${it.name} com ${gear}`).toBe(true);
              expect((ex.avoid ?? []).some((a) => avoid.includes(a)), `${it.name} evita ${avoid}`).toBe(false);
              expect(ex.level).toBeLessThanOrEqual(level);
            }
          }
        }
      }
    }
  });

  it('cabe no tempo e é determinístico', () => {
    for (const minutes of [20, 30, 45, 60]) {
      const p = profile({ minutes, gear: ['academia'], goal: 'emagrecer', days: [1, 3, 5] });
      const plan = generatePlan(p);
      for (const d of plan.days) expect(estimateMinutes(d) <= minutes || d.items.length <= 3).toBe(true);
      expect(generatePlan(p)).toEqual(plan);
    }
  });

  it('dias diferentes variam os exercícios do mesmo padrão', () => {
    const plan = generatePlan(profile({ gear: ['academia'], days: [1, 2, 4, 5], level: 2 }));
    expect(plan.days[0]!.items[0]!.name).not.toBe(plan.days[2]!.items[1]!.name);
  });

  it('força tem faixas baixas e descanso longo; cardio entra no condicionamento', () => {
    const f = generatePlan(profile({ goal: 'forca', level: 2, gear: ['academia'], minutes: 90 })).days[0]!.items[0]!;
    expect([f.lo, f.hi, f.rest, f.sets]).toEqual([3, 6, 180, 4]);
    const c = generatePlan(profile({ goal: 'condicionamento', minutes: 60 })).days[0]!;
    expect(c.items.at(-1)!.unit).toBe('min');
  });

  it('a nota do plano vai e volta igual, e o Obsidian lê o perfil', () => {
    const p = profile({ goal: 'hipertrofia', level: 2, gear: ['halteres', 'barra-fixa'], avoid: ['ombro'], days: [1, 3, 5], minutes: 60, time: '07:30' });
    const plan = generatePlan(p);
    const note = planNote(p, plan, '2026-10-15');
    expect(parsePlan(note)).toEqual(plan);
    expect(parseProfile(note)).toEqual(p);
    // gerar de novo por cima mantém propriedades estranhas ao Tanden
    const edited = note.replace('---\n', '---\ncssclasses: treino\n');
    const again = planNote({ ...p, minutes: 45 }, generatePlan({ ...p, minutes: 45 }), '2026-10-16', edited);
    expect(again).toContain('cssclasses: treino');
    expect(parseProfile(again).minutes).toBe(45);
    expect(again.match(/^# Treino$/gm)).toHaveLength(1);
  });

  it('lê um plano escrito à mão', () => {
    const plan = parsePlan('# Meu treino\n\n## Segunda\n- Agachamento goblet · 4x10 · 2 min\n- Prancha · 3×40s · 30s\n- Corrida · 20 min\n- [ ] não é exercício\n- solto sem esquema\n\n## B · Costas\n- Remada · 3×8–12\n');
    expect(plan.days.map((d) => d.key)).toEqual(['Segunda', 'B']);
    expect(plan.days[0]!.items).toEqual([
      { name: 'Agachamento goblet', sets: 4, lo: 10, hi: 10, unit: 'reps', rest: 120 },
      { name: 'Prancha', sets: 3, lo: 40, hi: 40, unit: 's', rest: 30 },
      { name: 'Corrida', sets: 1, lo: 20, hi: 20, unit: 'min', rest: 0 },
    ]);
    expect(plan.days[1]!.items[0]).toMatchObject({ lo: 8, hi: 12, rest: 90 });
  });

  it('troca um exercício por outro do mesmo padrão', () => {
    const p = profile({ gear: ['academia'], level: 2, days: [1, 3, 5] });
    const note = planNote(p, generatePlan(p), '2026-10-15');
    const before = parsePlan(note).days[0]!.items[0]!;
    const swapped = swapExercise(note, 'A', 0, p)!;
    const after = parsePlan(swapped).days[0]!.items[0]!;
    expect(after.name).not.toBe(before.name);
    expect(exerciseByName(after.name)!.pattern).toBe(exerciseByName(before.name)!.pattern);
    expect({ ...after, name: '' }).toEqual({ ...before, name: '' });
    expect(parsePlan(swapped).days[1]).toEqual(parsePlan(note).days[1]);
    expect(swapExercise(note, 'Z', 0, p)).toBeNull();
  });
});

describe('treino: sessões e progressão', () => {
  const p = profile({ gear: ['halteres'], days: [1, 3, 5], goal: 'hipertrofia' });
  const plan = generatePlan(p);

  function session(day: string, key: string, items: Session['items']): Session {
    const s = { day, key, title: `${key} · ${plan.days.find((d) => d.key === key)?.name ?? ''}`, minutes: 50, effort: 7, items };
    const path = `Saúde/Treinos/${day} ${key}.md`;
    return parseSession(path, sessionNote(s, 'pegou bem'))!;
  }

  it('nota da sessão vai e volta', () => {
    const items: Session['items'] = [
      { name: 'Agachamento goblet', done: true, values: [12, 11, 10], unit: 'reps', load: 16 },
      { name: 'Prancha', done: true, values: [30, 30], unit: 's', load: null },
      { name: 'Elevação lateral com halteres', done: false, values: [], unit: 'reps', load: null },
      { name: 'Caminhada rápida ou trote leve', done: true, values: [15], unit: 'min', load: null },
      { name: 'Supino com halteres', done: true, values: [8, 8], unit: 'reps', load: 12.5 },
    ];
    const s = session('2026-10-15', 'A', items);
    expect(s.items).toEqual(items);
    expect(s).toMatchObject({ day: '2026-10-15', key: 'A', minutes: 50, effort: 7 });
    expect(parseSession('x.md', '# nota comum')).toBeNull();
  });

  it('rodízio: o próximo depois do último feito', () => {
    expect(nextDay(plan, [])!.key).toBe('A');
    expect(nextDay(plan, [session('2026-10-12', 'A', []), session('2026-10-14', 'B', [])])!.key).toBe('C');
    expect(nextDay(plan, [session('2026-10-14', 'C', [])])!.key).toBe('A');
  });

  it('progressão dupla com carga', () => {
    const it = { name: 'Agachamento goblet', sets: 3, lo: 8, hi: 12, unit: 'reps' as const, rest: 90 };
    const log = (day: string, values: number[], load: number) => session(day, 'A', [{ name: it.name, done: true, values, unit: 'reps', load }]);
    expect(suggestNext(it, []).kind).toBe('novo');
    const hist = (...s: Session[]) => historyOf(it.name, s);
    expect(suggestNext(it, hist(log('2026-10-12', [12, 12, 12], 16)))).toMatchObject({ kind: 'subir', load: 18, target: 8 });
    expect(suggestNext(it, hist(log('2026-10-12', [12, 11, 10], 16)))).toMatchObject({ kind: 'manter', load: 16, target: 11 });
    // abaixo da faixa uma vez: mantém; duas: baixa
    expect(suggestNext(it, hist(log('2026-10-12', [9, 7, 6], 20))).kind).toBe('manter');
    const two = suggestNext(it, hist(log('2026-10-10', [8, 7, 6], 20), log('2026-10-12', [8, 7, 6], 20)));
    expect(two.kind).toBe('reduzir');
    expect(two.load).toBe(18);
    // menos séries que o plano não conta como bater o topo
    expect(suggestNext(it, hist(log('2026-10-12', [12, 12], 16))).kind).toBe('manter');
  });

  it('peso do corpo e tempo', () => {
    const push = { name: 'Flexão de braço', sets: 3, lo: 8, hi: 12, unit: 'reps' as const, rest: 60 };
    const h = (values: number[]) => [{ name: push.name, done: true, values, unit: 'reps' as const, load: null }];
    expect(suggestNext(push, h([12, 12, 13]))).toMatchObject({ kind: 'subir', target: 13 });
    expect(suggestNext(push, h([16, 15, 15])).hint).toMatch(/Flexão declinada/);
    expect(suggestNext(push, h([10, 9, 8]))).toMatchObject({ kind: 'manter', target: 9 });
    const plank = { name: 'Prancha', sets: 2, lo: 20, hi: 30, unit: 's' as const, rest: 45 };
    expect(suggestNext(plank, [{ name: 'Prancha', done: true, values: [30, 30], unit: 's', load: null }])).toMatchObject({ kind: 'subir', target: 35 });
  });

  it('volume da semana por músculo', () => {
    const v = weeklyVolume([
      session('2026-10-14', 'A', [{ name: 'Supino reto com halteres', done: true, values: [10, 10, 10], unit: 'reps', load: 14 }]),
      session('2026-10-01', 'B', [{ name: 'Supino reto com halteres', done: true, values: [10, 10, 10], unit: 'reps', load: 14 }]),
    ], '2026-10-15');
    expect(v.peito).toBe(3);
    expect(v['tríceps']).toBe(1.5);
  });

  it('todo exercício da biblioteca tem nome único', () => {
    expect(new Set(EXERCISES.map((e) => e.name.toLowerCase())).size).toBe(EXERCISES.length);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) if (e.harder) expect(EXERCISES.some((x) => x.id === e.harder), e.id).toBe(true);
  });
});

describe('treino: lembrete', () => {
  it('vira um lembrete repetido que os Lembretes entendem', () => {
    const p = profile({ days: [1, 3, 5], time: '07:00' });
    const line = workoutReminderLine(p, at(15, 10))!; // quinta 10h: próximo é sexta 7h
    const [r] = parseReminders('Lembretes.md', line);
    expect(r!.at).toBe(at(16, 7));
    expect(r!.repeat).toEqual({ every: 1, unit: 'week', weekdays: [1, 3, 5] });
    const note = upsertWorkoutReminder('# Lembretes\n\n- [ ] Dentista (@2026-10-20 10:00)\n', line);
    expect(parseReminders('Lembretes.md', note)).toHaveLength(2);
    const changed = upsertWorkoutReminder(note, workoutReminderLine({ ...p, time: '18:00' }, at(15, 10)));
    expect(parseReminders('Lembretes.md', changed)).toHaveLength(2);
    expect(changed).toContain('18:00');
    expect(upsertWorkoutReminder(changed, null)).toBe('# Lembretes\n\n- [ ] Dentista (@2026-10-20 10:00)\n');
    expect(workoutReminderLine({ ...p, time: null })).toBeNull();
  });
});
