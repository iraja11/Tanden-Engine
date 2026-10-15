/*
 * Planner de treino.
 *
 * O perfil (objetivo, nível, dias, tempo, equipamento, limitações) fica no topo
 * de Saúde/Treino.md, e o plano é o corpo da mesma nota, em Markdown comum:
 *
 *   ## A · Corpo inteiro
 *   - Leg press · 3×6-10 · 120s
 *   - Prancha · 2×20-30s · 45s
 *   - Bicicleta ergométrica · 15 min
 *
 * Dá para editar à mão (trocar exercício, séries, descanso) e o Tanden lê de
 * novo. Cada treino feito vira uma nota em Saúde/Treinos/, e o próximo treino
 * sugere carga e repetições pela progressão dupla: bateu o topo da faixa em
 * todas as séries, sobe a carga; ficou abaixo da faixa duas vezes, baixa.
 */
import { asList, parseProps, setProps, splitFrontmatter, withBody, type PropValue } from '../caderno/frontmatter';
import { nextOccurrence, reminderLine, type Repeat } from '../reminders';
import { formatDays, parseClock, parseDays } from './cuidados';
import {
  EXERCISES, GEAR_CHOICES, LOAD_STEP, MUSCLES, exerciseById, exerciseByName, sameExercise,
  type Exercise, type Gear, type GearChoice, type Limit, type Muscle, type Pattern,
} from './exercicios';

export const PLAN_NOTE = 'Saúde/Treino.md';
export const SESSIONS_DIR = 'Saúde/Treinos';

export type Goal = 'hipertrofia' | 'forca' | 'condicionamento' | 'emagrecer' | 'saude';

export const GOALS: Array<{ id: Goal; label: string; word: string }> = [
  { id: 'hipertrofia', label: 'Ganhar massa', word: 'hipertrofia' },
  { id: 'forca', label: 'Ficar mais forte', word: 'força' },
  { id: 'condicionamento', label: 'Condicionamento', word: 'condicionamento' },
  { id: 'emagrecer', label: 'Emagrecer', word: 'emagrecer' },
  { id: 'saude', label: 'Saúde e disposição', word: 'saúde' },
];

export const LEVELS = ['iniciante', 'intermediário', 'avançado'] as const;

export interface Profile {
  goal: Goal;
  level: 1 | 2 | 3;
  /** dias de treino (0 = domingo) */
  days: number[];
  /** minutos por sessão */
  minutes: number;
  gear: GearChoice[];
  avoid: Limit[];
  /** hora do lembrete de treino, 'HH:MM', ou null sem lembrete */
  time: string | null;
}

export const DEFAULT_PROFILE: Profile = { goal: 'saude', level: 1, days: [1, 3, 5], minutes: 45, gear: [], avoid: [], time: null };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const str = (v: PropValue | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const list = (v: PropValue | undefined) => asList(v).flatMap((x) => x.split(',')).map((x) => fold(x)).filter(Boolean);

export function parseProfile(noteText: string): Profile {
  const p = parseProps(noteText);
  const d = DEFAULT_PROFILE;
  const g = fold(str(p.objetivo));
  const goal = GOALS.find((x) => fold(x.word) === g || x.id === g || fold(x.label) === g)?.id ?? d.goal;
  const lv = fold(str(p['nível'] ?? p.nivel));
  const level = lv.startsWith('ava') ? 3 : lv.startsWith('inter') ? 2 : lv.startsWith('ini') ? 1 : d.level;
  const days = (parseDays(p.dias) ?? d.days).slice(0, 6);
  const minutes = Math.round(Number(str(p.minutos))) || d.minutes;
  const gear = list(p.equipamento)
    .map((x) => GEAR_CHOICES.find((c) => c.id === x || fold(c.label) === x || fold(c.label).startsWith(x))?.id)
    .filter((x): x is GearChoice => !!x);
  const avoid = list(p.evitar).filter((x): x is Limit => ['joelho', 'lombar', 'ombro', 'punho'].includes(x));
  return {
    goal,
    level: level as 1 | 2 | 3,
    days,
    minutes: Math.min(150, Math.max(15, minutes)),
    gear: [...new Set(gear)],
    avoid: [...new Set(avoid)],
    time: parseClock(str(p.hora)),
  };
}

export function profileProps(p: Profile): Record<string, PropValue | null> {
  return {
    tipo: 'plano de treino',
    objetivo: GOALS.find((g) => g.id === p.goal)!.word,
    'nível': LEVELS[p.level - 1]!,
    dias: formatDays(p.days),
    minutos: String(p.minutes),
    equipamento: p.gear.length ? [...p.gear] : [],
    evitar: p.avoid.length ? [...p.avoid] : [],
    hora: p.time,
  };
}

// ------------------------------------------------------------------ plano

export type Unit = 'reps' | 's' | 'min';

export interface PlanItem {
  name: string;
  sets: number;
  lo: number;
  hi: number;
  unit: Unit;
  /** descanso entre séries, em segundos */
  rest: number;
}

export interface PlanDay {
  /** letra do treino: A, B, C... */
  key: string;
  name: string;
  items: PlanItem[];
}

export interface Plan {
  days: PlanDay[];
}

/** 1 principal, 2 composto de apoio, 3 isolado (o primeiro a sair quando falta tempo) */
type Rank = 1 | 2 | 3;

interface Slot {
  p: Pattern;
  rank: Rank;
}

const COMPOUND = new Set<Pattern>(['agachar', 'dobrar', 'avanco', 'empurrar-h', 'empurrar-v', 'puxar-h', 'puxar-v']);
const S = (p: Pattern, main = false): Slot => ({ p, rank: main ? 1 : COMPOUND.has(p) ? 2 : 3 });
const LOADED = new Set(['barra', 'halter', 'maquina', 'polia']);
const TEMPLATES: Record<string, { name: string; slots: Slot[] }> = {
  fa: { name: 'Corpo inteiro', slots: [S('agachar', true), S('empurrar-h', true), S('puxar-h'), S('dobrar'), S('ombro-lateral'), S('core')] },
  fb: { name: 'Corpo inteiro', slots: [S('dobrar', true), S('empurrar-v', true), S('puxar-v'), S('avanco'), S('biceps'), S('triceps'), S('core')] },
  fc: { name: 'Corpo inteiro', slots: [S('avanco', true), S('empurrar-h', true), S('puxar-v'), S('gluteo'), S('ombro-posterior'), S('panturrilha'), S('core')] },
  ua: { name: 'Superiores', slots: [S('empurrar-h', true), S('puxar-h', true), S('empurrar-v'), S('puxar-v'), S('biceps'), S('triceps')] },
  la: { name: 'Inferiores', slots: [S('agachar', true), S('dobrar', true), S('avanco'), S('flexora'), S('panturrilha'), S('core')] },
  ub: { name: 'Superiores', slots: [S('puxar-v', true), S('empurrar-h', true), S('puxar-h'), S('ombro-lateral'), S('ombro-posterior'), S('triceps'), S('biceps')] },
  lb: { name: 'Inferiores', slots: [S('dobrar', true), S('agachar', true), S('avanco'), S('gluteo'), S('panturrilha'), S('core')] },
  push: { name: 'Empurrar (peito, ombros, tríceps)', slots: [S('empurrar-h', true), S('empurrar-v', true), S('empurrar-h'), S('peito-iso'), S('ombro-lateral'), S('triceps')] },
  pull: { name: 'Puxar (costas, bíceps)', slots: [S('puxar-v', true), S('puxar-h', true), S('puxar-h'), S('ombro-posterior'), S('biceps'), S('core')] },
  legs: { name: 'Pernas', slots: [S('agachar', true), S('dobrar', true), S('avanco'), S('flexora'), S('panturrilha'), S('core')] },
};

const SPLITS: Record<number, string[]> = {
  1: ['fa'],
  2: ['fa', 'fb'],
  3: ['fa', 'fb', 'fc'],
  4: ['ua', 'la', 'ub', 'lb'],
  5: ['push', 'pull', 'legs', 'ua', 'la'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

/** Faixas por objetivo: [mín, máx, descanso em s] para principais e acessórios; minutos de cardio. */
const SCHEME: Record<Goal, { main: [number, number, number]; acc: [number, number, number]; cardio: number }> = {
  forca: { main: [3, 6, 180], acc: [6, 10, 90], cardio: 0 },
  hipertrofia: { main: [6, 10, 120], acc: [10, 15, 75], cardio: 0 },
  condicionamento: { main: [10, 15, 60], acc: [12, 20, 45], cardio: 15 },
  emagrecer: { main: [8, 12, 75], acc: [12, 15, 60], cardio: 20 },
  saude: { main: [8, 12, 90], acc: [10, 15, 60], cardio: 10 },
};

export function availableGear(p: Profile): Set<Gear> {
  const out = new Set<Gear>(['corpo']);
  for (const c of p.gear) for (const g of GEAR_CHOICES.find((x) => x.id === c)?.gives ?? []) out.add(g);
  return out;
}

/** Exercícios que servem ao perfil num padrão, na ordem de preferência. */
export function candidates(p: Profile, pattern: Pattern): Exercise[] {
  const gear = availableGear(p);
  return EXERCISES.filter((e) => e.pattern === pattern && e.level <= p.level && e.gear.every((g) => gear.has(g)) && !(e.avoid ?? []).some((a) => p.avoid.includes(a)));
}

function itemFor(e: Exercise, p: Profile, main: boolean): PlanItem {
  const sc = SCHEME[p.goal];
  let [lo, hi, rest] = main ? sc.main : sc.acc;
  if (main && p.goal === 'forca' && p.level === 1) [lo, hi] = [5, 8];
  // isolados e abdominais não vão bem com faixas de força
  if (!main && !COMPOUND.has(e.pattern) && lo < 8) [lo, hi] = [8, 12];
  if (e.pattern === 'core') [lo, hi] = [10, 15];
  if (e.reps) [lo, hi] = e.reps;
  const sets = main ? (p.level === 1 ? 3 : p.goal === 'forca' ? p.level + 2 : p.level + 1) : p.level === 1 ? 2 : 3;
  if (e.load === 'tempo') {
    const [a, b] = p.level === 1 ? [20, 30] : p.level === 2 ? [30, 45] : [45, 60];
    return { name: e.name, sets, lo: a, hi: b, unit: 's', rest: 45 };
  }
  // movimentos pequenos e peso do corpo cansam menos: descanso menor
  if (!main) rest = Math.min(rest, 75);
  return { name: e.name, sets, lo, hi, unit: 'reps', rest };
}

/** Minutos estimados de uma sessão (aquecimento incluso). */
export function estimateMinutes(day: PlanDay): number {
  let s = 6 * 60;
  for (const it of day.items) {
    if (it.unit === 'min') s += it.hi * 60;
    else s += it.sets * ((it.unit === 's' ? it.hi : 40) + it.rest);
  }
  return Math.round(s / 60);
}

const LETTERS = 'ABCDEFGHIJ';

/** Monta o plano da semana a partir do perfil. Mesmo perfil, mesmo plano. */
export function generatePlan(p: Profile): Plan {
  const n = Math.min(6, Math.max(1, p.days.length || 3));
  const used = new Map<Pattern, number>();
  const days: PlanDay[] = SPLITS[n]!.map((t, i) => {
    const tpl = TEMPLATES[t]!;
    const items: Array<PlanItem & { rank: Rank }> = [];
    const names = new Set<string>();
    for (const slot of tpl.slots) {
      let c = candidates(p, slot.p);
      // o principal pede carga quando há equipamento para isso
      if (slot.rank === 1) {
        const strong = c.filter((e) => !e.accessory);
        if (strong.length) c = strong;
        const loaded = c.filter((e) => LOADED.has(e.load) || e.gear.includes('barra-fixa'));
        if (loaded.length) c = loaded;
      }
      if (!c.length) continue;
      const start = used.get(slot.p) ?? 0;
      let pick: Exercise | undefined;
      for (let k = 0; k < c.length; k++) {
        const e = c[(start + k) % c.length]!;
        if (!names.has(e.id)) {
          pick = e;
          break;
        }
      }
      if (!pick) continue;
      used.set(slot.p, start + 1);
      names.add(pick.id);
      items.push({ ...itemFor(pick, p, slot.rank === 1), rank: slot.rank });
    }
    const sc = SCHEME[p.goal];
    if (sc.cardio) {
      const cardio = candidates(p, 'cardio');
      const pick = (p.goal === 'condicionamento' && cardio.find((e) => e.id === 'intervalado')) || cardio[0];
      if (pick) items.push({ name: pick.name, sets: 1, lo: sc.cardio, hi: sc.cardio, unit: 'min', rest: 0, rank: 2 });
    }
    const day: PlanDay = { key: LETTERS[i]!, name: tpl.name, items };
    // cabe no tempo: tira isolados do fim, encurta o cardio, tira compostos de
    // apoio, tira o cardio e, por fim, séries dos principais (até 2)
    const fits = () => estimateMinutes({ ...day, items }) <= p.minutes;
    const dropLast = (rank: Rank) => {
      for (let j = items.length - 1; j >= 0; j--) if (items[j]!.rank === rank && items[j]!.unit !== 'min') return items.splice(j, 1).length > 0;
      return false;
    };
    while (!fits()) {
      const cardio = items.findIndex((x) => x.unit === 'min');
      if (dropLast(3)) continue;
      if (cardio >= 0 && items[cardio]!.hi > 10) {
        items[cardio]!.lo = items[cardio]!.hi = 10;
        continue;
      }
      if (items.filter((x) => x.unit !== 'min').length > 3 && dropLast(2)) continue;
      if (cardio >= 0) {
        items.splice(cardio, 1);
        continue;
      }
      const big = items.find((x) => x.sets > 2);
      if (!big) break;
      big.sets--;
    }
    return { ...day, items: items.map(({ rank: _r, ...it }) => it) };
  });
  return { days };
}

export function formatItem(it: PlanItem): string {
  if (it.unit === 'min') return `- ${it.name} · ${it.hi} min`;
  const range = it.lo === it.hi ? `${it.hi}` : `${it.lo}-${it.hi}`;
  return `- ${it.name} · ${it.sets}×${range}${it.unit === 's' ? 's' : ''} · ${it.rest}s`;
}

const ITEM_RE = /^\s*[-*+]\s+(?!\[[ xX]\])(.+?)\s+·\s+(.+?)\s*$/;
const SCHEME_RE = /^(\d+)\s*[×xX]\s*(\d+)(?:\s*(?:-|–|a)\s*(\d+))?\s*(s|seg|segundos)?$/;
const HEAD_RE = /^##\s+(.+?)\s*$/;

export function parsePlan(noteText: string): Plan {
  const days: PlanDay[] = [];
  let cur: PlanDay | null = null;
  let inCode = false;
  for (const line of splitFrontmatter(noteText).body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const h = HEAD_RE.exec(line);
    if (h) {
      const m = /^([A-Z0-9]{1,3})\s*[·:\-–]\s*(.+)$/.exec(h[1]!);
      cur = { key: m ? m[1]! : h[1]!, name: m ? m[2]! : h[1]!, items: [] };
      days.push(cur);
      continue;
    }
    if (/^#\s/.test(line)) cur = null;
    if (!cur) continue;
    const it = ITEM_RE.exec(line);
    if (!it) continue;
    const [scheme, restPart] = it[2]!.split(/\s+·\s+/);
    const mins = /^(\d+)\s*min/.exec(scheme!.trim());
    if (mins) {
      cur.items.push({ name: it[1]!.trim(), sets: 1, lo: +mins[1]!, hi: +mins[1]!, unit: 'min', rest: 0 });
      continue;
    }
    const s = SCHEME_RE.exec(scheme!.trim());
    if (!s) continue;
    const lo = +s[2]!;
    const hi = s[3] ? Math.max(lo, +s[3]) : lo;
    const rest = /(\d+)\s*(s|seg|min)?/.exec(restPart ?? '');
    cur.items.push({
      name: it[1]!.trim(),
      sets: Math.max(1, +s[1]!),
      lo,
      hi,
      unit: s[4] ? 's' : 'reps',
      rest: rest ? +rest[1]! * (rest[2] === 'min' ? 60 : 1) : 90,
    });
  }
  return { days: days.filter((d) => d.items.length) };
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** Nota inteira do plano: perfil no topo, treinos no corpo. */
export function planNote(p: Profile, plan: Plan, day: string, current = ''): string {
  const goal = GOALS.find((g) => g.id === p.goal)!;
  const lines = [
    '# Treino',
    '',
    `> [!info] Plano gerado pelo Tanden em ${dm(day)}: ${goal.label.toLowerCase()}, nível ${LEVELS[p.level - 1]}, ${p.days.length} ${p.days.length === 1 ? 'dia' : 'dias'} por semana (${formatDays(p.days)}), cerca de ${p.minutes} min.`,
    '> Pode editar à vontade: trocar exercícios, séries (3×8-12) e descanso (90s). O Tanden lê esta nota. Os treinos feitos ficam em [[Saúde/Treinos]].',
    '',
    'Aquecimento: 5 minutos de cardio leve e uma ou duas séries leves do primeiro exercício.',
    'Progressão: quando fizer o topo da faixa em todas as séries, a carga sobe na próxima vez.',
    '',
  ];
  for (const d of plan.days) {
    lines.push(`## ${d.key} · ${d.name}`, ...d.items.map(formatItem), '');
  }
  const body = lines.join('\n');
  const base = current.trim() ? withBody(current, `\n${body}`) : body;
  return setProps(base, profileProps(p));
}

/**
 * Troca o exercício `index` do treino `key` pelo próximo do mesmo padrão que
 * sirva ao perfil, mantendo séries e faixa. Null quando não há alternativa.
 */
export function swapExercise(noteText: string, key: string, index: number, p: Profile): string | null {
  const plan = parsePlan(noteText);
  const day = plan.days.find((d) => d.key === key);
  const it = day?.items[index];
  if (!day || !it) return null;
  const ex = exerciseByName(it.name);
  if (!ex) return null;
  const c = candidates(p, ex.pattern).filter((e) => e.id === ex.id || !day.items.some((x) => sameExercise(x.name, e.name)));
  if (c.length < 2) return null;
  const i = c.findIndex((e) => e.id === ex.id);
  const next = c[(i + 1) % c.length]!;
  const repl = { ...it, name: next.name };
  if (next.load === 'tempo' && it.unit !== 's') Object.assign(repl, itemFor(next, p, false), { sets: it.sets });
  if (next.load !== 'tempo' && it.unit === 's') Object.assign(repl, itemFor(next, p, false), { sets: it.sets });
  // acha a linha dentro da seção certa
  const lines = noteText.split('\n');
  let inDay = false;
  let n = -1;
  for (let k = 0; k < lines.length; k++) {
    const h = HEAD_RE.exec(lines[k]!);
    if (h) inDay = new RegExp(`^${key}\\s*[·:\\-–]`).test(h[1]!) || h[1] === key;
    else if (inDay && ITEM_RE.exec(lines[k]!)) {
      const parsed = parsePlan(`## ${key} · x\n${lines[k]}`).days[0]?.items[0];
      if (!parsed) continue;
      if (++n === index) {
        lines[k] = formatItem(repl);
        return lines.join('\n');
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ sessões

export interface ExerciseLog {
  name: string;
  done: boolean;
  /** repetições, segundos ou minutos de cada série */
  values: number[];
  unit: Unit;
  /** kg, quando houver carga */
  load: number | null;
}

export interface Session {
  path: string;
  /** AAAA-MM-DD */
  day: string;
  /** letra do treino no plano */
  key: string;
  title: string;
  minutes: number | null;
  /** esforço percebido, 1 a 10 */
  effort: number | null;
  items: ExerciseLog[];
}

const LOG_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)(?::\s*(.*))?$/;

const numStr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const toNum = (s: string) => Number(s.replace(',', '.'));

export function formatLog(l: ExerciseLog): string {
  if (!l.done || !l.values.length) return `- [ ] ${l.name}`;
  const vals = l.unit === 'min' ? `${l.values[0]} min` : l.values.map((v) => `${v}${l.unit === 's' ? 's' : ''}`).join(', ');
  return `- [x] ${l.name}: ${vals}${l.load !== null && l.unit !== 'min' ? ` @ ${numStr(l.load)} kg` : ''}`;
}

export function parseLogLine(line: string): ExerciseLog | null {
  const m = LOG_RE.exec(line);
  if (!m) return null;
  const name = m[2]!.trim();
  const rest = (m[3] ?? '').trim();
  const lm = /@\s*([\d.,]+)\s*kg/i.exec(rest);
  const load = lm ? toNum(lm[1]!) : null;
  const vals = (lm ? rest.slice(0, lm.index) : rest).trim();
  const mins = /^(\d+(?:[.,]\d+)?)\s*min/.exec(vals);
  let unit: Unit = 'reps';
  let values: number[] = [];
  if (mins) {
    unit = 'min';
    values = [toNum(mins[1]!)];
  } else if (vals) {
    if (/\d\s*s\b/.test(vals)) unit = 's';
    values = vals.split(/[,;]/).map((x) => toNum(x.replace(/s|seg/g, '').trim())).filter((x) => Number.isFinite(x) && x > 0);
  }
  return { name, done: m[1] !== ' ' && values.length > 0, values, unit, load: load !== null && Number.isFinite(load) ? load : null };
}

export function parseSession(path: string, text: string): Session | null {
  const p = parseProps(text);
  if (fold(str(p.tipo)) !== 'treino') return null;
  const day = /^\d{4}-\d{2}-\d{2}/.exec(str(p.data))?.[0];
  if (!day) return null;
  const title = str(p.treino);
  const key = /^([A-Z0-9]{1,3})\s*[·:\-–]/.exec(title)?.[1] ?? title;
  const items: ExerciseLog[] = [];
  let inCode = false;
  for (const line of splitFrontmatter(text).body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const l = parseLogLine(line);
    if (l) items.push(l);
  }
  const n = (v: PropValue | undefined) => {
    const x = Number(str(v).replace(',', '.'));
    return str(v) && Number.isFinite(x) ? x : null;
  };
  return { path, day, key, title, minutes: n(p['duração_min'] ?? p.duracao_min), effort: n(p['esforço'] ?? p.esforco), items };
}

export const sessionPath = (day: string, key: string): string => `${SESSIONS_DIR}/${day} ${key}.md`;

export function sessionNote(s: Omit<Session, 'path'>, notes = ''): string {
  const props: Record<string, PropValue | null> = {
    tipo: 'treino',
    data: s.day,
    treino: s.title,
    'duração_min': s.minutes === null ? null : String(Math.round(s.minutes)),
    'esforço': s.effort === null ? null : String(s.effort),
    tags: ['treino'],
  };
  const body = [`# Treino ${s.title} · ${dm(s.day)}`, '', ...s.items.map(formatLog), '', ...(notes.trim() ? ['## Notas', notes.trim(), ''] : [])].join('\n');
  return setProps(body, props);
}

/** Próximo treino do rodízio: o seguinte ao último feito (A → B → C → A). */
export function nextDay(plan: Plan, sessions: Session[]): PlanDay | null {
  if (!plan.days.length) return null;
  const last = [...sessions].sort((a, b) => a.day.localeCompare(b.day) || a.path.localeCompare(b.path)).at(-1);
  const i = last ? plan.days.findIndex((d) => d.key === last.key) : -1;
  return plan.days[(i + 1) % plan.days.length]!;
}

const weekday = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).getDay();
};
export const isTrainingDay = (p: Profile, day: string): boolean => p.days.includes(weekday(day));

// ------------------------------------------------------------------ progressão

export type SuggestKind = 'novo' | 'subir' | 'manter' | 'reduzir';

export interface Suggestion {
  kind: SuggestKind;
  /** carga sugerida em kg (null: sem carga ou primeira vez) */
  load: number | null;
  /** repetições (ou segundos, minutos) a buscar em cada série */
  target: number;
  hint: string;
}

const kg = (n: number) => `${numStr(n)} kg`;
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

/** Histórico feito de um exercício, do mais recente para o mais antigo. */
export function historyOf(name: string, sessions: Session[]): Array<ExerciseLog & { day: string }> {
  return [...sessions]
    .sort((a, b) => b.day.localeCompare(a.day) || b.path.localeCompare(a.path))
    .flatMap((s) => s.items.filter((l) => l.done && sameExercise(l.name, name)).map((l) => ({ ...l, day: s.day })));
}

export function suggestNext(it: PlanItem, history: ExerciseLog[]): Suggestion {
  const ex = exerciseByName(it.name);
  const step = ex ? LOAD_STEP[ex.load] : 2.5;
  const last = history[0];
  if (it.unit === 'min') {
    return { kind: last ? 'manter' : 'novo', load: null, target: it.hi, hint: 'Num ritmo em que ainda dá para conversar.' };
  }
  if (!last) {
    const hint = it.unit === 's'
      ? `Segure ${it.lo} a ${it.hi} segundos com boa postura.`
      : step && ex?.load !== 'corpo'
        ? 'Primeira vez: escolha um peso que deixe umas 2 repetições de sobra na última série.'
        : `Faça ${it.lo} a ${it.hi} repetições com boa forma.`;
    return { kind: 'novo', load: null, target: it.hi, hint };
  }
  const vals = last.values;
  const min = Math.min(...vals);
  const allTop = vals.length >= it.sets && vals.every((v) => v >= it.hi);
  const low = (l: ExerciseLog) => l.values.some((v) => v < it.lo);
  const unit = it.unit === 's' ? 's' : '';
  if (it.unit === 's') {
    const target = allTop ? min + 5 : Math.max(it.lo, Math.min(it.hi, min + 5));
    return { kind: allTop ? 'subir' : 'manter', load: null, target, hint: allTop ? `Fez ${it.hi}s em todas: tente ${target}s.` : `Tente ${target}s em cada série.` };
  }
  if (last.load !== null && step) {
    if (allTop) {
      const load = last.load + step;
      return { kind: 'subir', load, target: it.lo, hint: `Bateu ${it.hi} em todas as séries: suba para ${kg(load)}.` };
    }
    const prev = history[1];
    if (low(last) && prev && low(prev) && (prev.load ?? 0) >= last.load) {
      const load = Math.min(last.load - step, roundTo(last.load * 0.9, step));
      return { kind: 'reduzir', load: Math.max(0, load), target: it.hi, hint: `Duas vezes abaixo de ${it.lo}: baixe para ${kg(Math.max(0, load))} e reconstrua.` };
    }
    const target = Math.max(it.lo, Math.min(it.hi, min + 1));
    return { kind: 'manter', load: last.load, target, hint: `Mantenha ${kg(last.load)} e busque ${target} repetições em cada série.` };
  }
  // peso do corpo e elástico: mais repetições, depois uma variação mais difícil
  const target = allTop ? min + 1 : Math.max(it.lo, Math.min(it.hi, min + 1));
  if (allTop) {
    const harder = ex?.harder ? exerciseById(ex.harder) : undefined;
    const hint = harder && min >= it.hi + 3
      ? `Ficou fácil: experimente ${harder.name}.`
      : ex?.load === 'elastico'
        ? `Bateu ${it.hi} em todas: passe para um elástico mais forte ou faça ${target}.`
        : `Bateu ${it.hi} em todas: tente ${target} em cada série.`;
    return { kind: 'subir', load: last.load, target, hint };
  }
  return { kind: 'manter', load: last.load, target, hint: `Tente ${target}${unit} em cada série.` };
}

// ------------------------------------------------------------------ semana

/** Séries por músculo nos últimos `days` dias (principal conta 1, os outros meia). */
export function weeklyVolume(sessions: Session[], today: string, days = 7): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const [y, m, d] = today.split('-').map(Number);
  const from = new Date(y!, m! - 1, d! - days + 1);
  const start = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  for (const s of sessions) {
    if (s.day < start || s.day > today) continue;
    for (const l of s.items) {
      if (!l.done || l.unit === 'min') continue;
      const ex = exerciseByName(l.name);
      if (!ex) continue;
      ex.muscles.forEach((mu, i) => (out[mu] += l.values.length * (i === 0 ? 1 : 0.5)));
    }
  }
  return out;
}

/** Faixa de séries semanais por músculo que o objetivo pede. */
export function volumeTarget(goal: Goal): [number, number] {
  return goal === 'hipertrofia' ? [10, 20] : goal === 'forca' ? [6, 15] : [4, 12];
}

// ------------------------------------------------------------------ lembrete

export const WORKOUT_REMINDER = 'Hora do treino 🏋';

/** Linha de lembrete repetido nos dias de treino, no formato dos Lembretes. */
export function workoutReminderLine(p: Profile, now = Date.now()): string | null {
  if (!p.time || !p.days.length) return null;
  const repeat: Repeat = { every: 1, unit: 'week', weekdays: [...p.days].sort((a, b) => a - b) };
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +p.time.slice(0, 2), +p.time.slice(3)).getTime();
  const at = start > now && p.days.includes(d.getDay()) ? start : nextOccurrence(start, repeat, now);
  return reminderLine(WORKOUT_REMINDER, at, repeat);
}

/** Põe, troca ou tira o lembrete de treino numa nota de lembretes. */
export function upsertWorkoutReminder(noteText: string, line: string | null): string {
  const lines = noteText.split('\n');
  const i = lines.findIndex((l) => /^\s*[-*+]\s+\[[ xX]\]\s/.test(l) && l.includes(WORKOUT_REMINDER));
  if (i >= 0) {
    if (line) lines[i] = line;
    else lines.splice(i, 1);
    return lines.join('\n');
  }
  if (!line) return noteText;
  if (!noteText.trim()) return `# Lembretes\n\n${line}\n`;
  return noteText.replace(/\n*$/, '\n') + line + '\n';
}
