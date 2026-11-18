/*
 * Ajustes e registro dos exercícios. Os ajustes ficam nas propriedades de
 * Exercícios/Exercícios.md e o registro em notas por mês
 * (Exercícios/Registro/2026-11.md), uma linha por atividade:
 *
 *   - 2026-11-18 07:30 🏃 Corpo inteiro · 20 min · 140 kcal · esforço 6 · foco corpo
 *   - 2026-11-18 19:00 🏃 Caminhada · 30 min · 120 kcal
 *
 * As linhas no fim da nota se juntam sem conflito entre aparelhos.
 */
import { asList, parseProps, setProps, type PropValue } from '../caderno/frontmatter';
import type { Limit } from '../saude/exercicios';
import { addDays, isoWeek } from '../vida';
import { HOME_PROPS, type HomeProp } from './biblioteca';
import { ROUTINE_FOCUS, type RoutineFocus } from './rotinas';

export const MOVE_NOTE = 'Exercícios/Exercícios.md';
export const MOVE_LOG_DIR = 'Exercícios/Registro';

export interface MoveSettings {
  level: 1 | 2 | 3;
  props: HomeProp[];
  avoid: Limit[];
  /** sem saltos */
  quiet: boolean;
  /** duração preferida, em minutos */
  minutes: number;
  /** meta de minutos por semana */
  weekGoal: number;
  /** programa em andamento */
  program: string | null;
}

/** 150 minutos por semana é a recomendação mínima da OMS para adultos. */
export const DEFAULT_MOVE_SETTINGS: MoveSettings = { level: 1, props: ['cadeira', 'parede'], avoid: [], quiet: true, minutes: 20, weekGoal: 150, program: null };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const str = (v: PropValue | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const list = (v: PropValue | undefined) => asList(v).flatMap((x) => x.split(',')).map(fold).filter(Boolean);
const LIMIT_IDS: Limit[] = ['joelho', 'lombar', 'ombro', 'punho'];
const LEVEL_WORDS = ['iniciante', 'intermediário', 'avançado'];

export function parseMoveSettings(text: string): MoveSettings {
  const p = parseProps(text);
  const d = DEFAULT_MOVE_SETTINGS;
  const lv = fold(str(p['nível'] ?? p.nivel));
  const level = (lv.startsWith('ava') ? 3 : lv.startsWith('inter') ? 2 : lv.startsWith('ini') ? 1 : d.level) as 1 | 2 | 3;
  const hasProps = p.objetos !== undefined;
  const props = list(p.objetos).map((x) => HOME_PROPS.find((h) => h.id === x || fold(h.label) === x)?.id).filter((x): x is HomeProp => !!x);
  const quiet = fold(str(p.sem_saltos));
  const minutes = Math.round(Number(str(p.minutos)));
  const goal = Math.round(Number(str(p.meta_semana_min)));
  return {
    level,
    props: hasProps ? [...new Set(props)] : [...d.props],
    avoid: [...new Set(list(p.evitar).filter((x): x is Limit => (LIMIT_IDS as string[]).includes(x)))],
    quiet: /^(false|nao|no|0)$/.test(quiet) ? false : /^(true|sim|yes|1)$/.test(quiet) ? true : d.quiet,
    minutes: minutes >= 3 && minutes <= 60 ? minutes : d.minutes,
    weekGoal: goal >= 10 && goal <= 1500 ? goal : d.weekGoal,
    program: str(p.programa) || null,
  };
}

export function writeMoveSettings(text: string, s: MoveSettings): string {
  const base = text.trim() ? text : '# Exercícios\n\nAjustes dos treinos em casa. O Tanden lê as propriedades do topo desta nota.\n';
  return setProps(base, {
    tipo: 'ajustes de exercícios',
    'nível': LEVEL_WORDS[s.level - 1]!,
    objetos: s.props.length ? [...s.props] : [],
    evitar: s.avoid.length ? [...s.avoid] : [],
    sem_saltos: s.quiet ? 'sim' : 'não',
    minutos: String(s.minutes),
    meta_semana_min: String(s.weekGoal),
    programa: s.program,
  });
}

// ------------------------------------------------------------------ registro

export interface ActivityLog {
  day: string;
  time: string;
  name: string;
  minutes: number;
  kcal: number | null;
  /** 1 a 10 */
  effort: number | null;
  focus: RoutineFocus | null;
  program: string | null;
  raw: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeOf = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const moveLogPath = (at: number): string => `${MOVE_LOG_DIR}/${dayOf(at).slice(0, 7)}.md`;

export function activityLine(a: Omit<ActivityLog, 'raw' | 'day' | 'time'>, at: number): string {
  const parts = [a.name.replace(/\s*·\s*/g, ', '), `${Math.round(a.minutes)} min`];
  if (a.kcal !== null) parts.push(`${Math.round(a.kcal)} kcal`);
  if (a.effort !== null) parts.push(`esforço ${a.effort}`);
  if (a.focus) parts.push(`foco ${a.focus}`);
  if (a.program) parts.push(`programa ${a.program}`);
  return `- ${dayOf(at)} ${timeOf(at)} 🏃 ${parts.join(' · ')}`;
}

const LOG_RE = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+🏃\S*\s*(.+?)\s*$/u;

export function parseActivityLine(line: string): ActivityLog | null {
  const m = LOG_RE.exec(line);
  if (!m) return null;
  const parts = m[3]!.split(/\s+·\s+/);
  const name = parts[0]?.trim();
  if (!name) return null;
  let minutes = 0;
  let kcal: number | null = null;
  let effort: number | null = null;
  let focus: RoutineFocus | null = null;
  let program: string | null = null;
  for (const raw of parts.slice(1)) {
    const t = raw.trim();
    let x: RegExpExecArray | null;
    if ((x = /^(\d+(?:[.,]\d+)?)\s*min/i.exec(t))) minutes = Number(x[1]!.replace(',', '.'));
    else if ((x = /^(\d+)\s*kcal/i.exec(t))) kcal = +x[1]!;
    else if ((x = /^esfor[cç]o\s+(\d+)/i.exec(t))) effort = Math.min(10, +x[1]!);
    else if ((x = /^foco\s+(\S+)/i.exec(t))) focus = ROUTINE_FOCUS.find((f) => f.id === x![1])?.id ?? null;
    else if ((x = /^programa\s+(\S+)/i.exec(t))) program = x[1]!;
  }
  if (!(minutes > 0)) return null;
  return { day: m[1]!, time: m[2]!.padStart(5, '0'), name, minutes, kcal, effort, focus, program, raw: line };
}

export function parseActivityLog(text: string): ActivityLog[] {
  const out: ActivityLog[] = [];
  for (const line of text.split('\n')) {
    const a = parseActivityLine(line);
    if (a) out.push(a);
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
}

export function appendActivity(text: string, line: string, at: number): string {
  const head = text.trim() ? text.replace(/\n*$/, '\n') : `# Registro de exercícios ${dayOf(at).slice(0, 7)}\n\n`;
  return `${head}${line}\n`;
}

export function removeActivity(text: string, raw: string): string {
  const lines = text.split('\n');
  const i = lines.indexOf(raw);
  if (i >= 0) lines.splice(i, 1);
  return lines.join('\n');
}

/** Atividades que a pessoa pode anotar à mão, com o gasto relativo (MET). */
export const MANUAL_ACTIVITIES: Array<{ id: string; label: string; met: number }> = [
  { id: 'caminhada', label: 'Caminhada', met: 3.5 },
  { id: 'escadas', label: 'Subir escadas', met: 8 },
  { id: 'danca', label: 'Dança', met: 5 },
  { id: 'ioga', label: 'Ioga', met: 2.5 },
  { id: 'pilates', label: 'Pilates', met: 3 },
  { id: 'faxina', label: 'Faxina pesada', met: 3.5 },
  { id: 'jardim', label: 'Jardinagem', met: 3.8 },
  { id: 'brincar', label: 'Brincar com crianças ou pets', met: 3.5 },
  { id: 'bicicleta', label: 'Bicicleta', met: 6 },
  { id: 'corrida', label: 'Corrida', met: 9 },
  { id: 'natacao', label: 'Natação', met: 6 },
  { id: 'futebol', label: 'Futebol', met: 7 },
];

export const activityKcal = (met: number, minutes: number, kg: number): number => Math.round(((met * 3.5 * kg) / 200) * minutes);

// ------------------------------------------------------------------ progresso

/** Atividade vinda de qualquer lugar (registro de casa ou treino da aba Saúde). */
export interface ActiveDay {
  day: string;
  minutes: number;
  strength: boolean;
}

export function toActiveDays(logs: ActivityLog[]): ActiveDay[] {
  return logs.map((l) => ({ day: l.day, minutes: l.minutes, strength: !!ROUTINE_FOCUS.find((f) => f.id === l.focus)?.strength }));
}

export interface WeekSummary {
  monday: string;
  minutes: number;
  sessions: number;
  /** dias diferentes com treino de força */
  strengthDays: number;
  activeDays: string[];
}

export function weekSummary(items: ActiveDay[], day: string): WeekSummary {
  const { monday, sunday } = isoWeek(day);
  const inWeek = items.filter((x) => x.day >= monday && x.day <= sunday);
  return {
    monday,
    minutes: Math.round(inWeek.reduce((a, x) => a + x.minutes, 0)),
    sessions: inWeek.length,
    strengthDays: new Set(inWeek.filter((x) => x.strength).map((x) => x.day)).size,
    activeDays: [...new Set(inWeek.map((x) => x.day))].sort(),
  };
}

/** Minutos das últimas `n` semanas, da mais antiga para a atual. */
export function weeksHistory(items: ActiveDay[], day: string, n = 8): WeekSummary[] {
  const { monday } = isoWeek(day);
  return Array.from({ length: n }, (_, i) => weekSummary(items, addDays(monday, -7 * (n - 1 - i))));
}

/** Dias seguidos com atividade; hoje ainda vazio não quebra a sequência. */
export function activeStreak(items: ActiveDay[], day: string): number {
  const days = new Set(items.map((x) => x.day));
  let cur = days.has(day) ? day : addDays(day, -1);
  let n = 0;
  while (days.has(cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

export interface TodayIdea {
  focus: RoutineFocus;
  minutes: number;
  reason: string;
}

/** O que treinar hoje, olhando os últimos dias. */
export function suggestWorkout(logs: ActivityLog[], settings: MoveSettings, day: string): TodayIdea {
  const sorted = [...logs].sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
  const doneToday = sorted.filter((l) => l.day === day);
  if (doneToday.length) return { focus: 'alongar', minutes: 8, reason: 'Você já se mexeu hoje. Um alongamento fecha bem o dia.' };
  const last = sorted.at(-1);
  if (!last) return { focus: 'corpo', minutes: Math.min(settings.minutes, 15), reason: 'Primeiro treino: curto, para o corpo pegar o jeito.' };
  let gap = 0;
  for (let d = day; d > last.day && gap < 60; d = addDays(d, -1)) gap++;
  if (gap >= 5) return { focus: 'corpo', minutes: Math.min(settings.minutes, 15), reason: `Faz ${gap} dias sem treinar. Voltar leve é o melhor caminho.` };
  const strong = ['pernas', 'superior', 'core', 'cardio', 'corpo'] as RoutineFocus[];
  const recent = sorted.filter((l) => l.day >= addDays(day, -3)).map((l) => l.focus);
  const yesterdayHard = sorted.some((l) => l.day === addDays(day, -1) && (l.effort ?? 0) >= 8);
  if (yesterdayHard) return { focus: 'mobilidade', minutes: Math.min(settings.minutes, 12), reason: 'Ontem foi puxado. Hoje, soltar o corpo ajuda a recuperar.' };
  const next = strong.find((f) => !recent.includes(f)) ?? 'corpo';
  return { focus: next, minutes: settings.minutes, reason: `${ROUTINE_FOCUS.find((f) => f.id === next)!.label} é o que você menos treinou nos últimos dias.` };
}

/** Quantos treinos do programa já foram feitos. */
export const programDone = (logs: ActivityLog[], id: string): number => logs.filter((l) => l.program === id).length;
