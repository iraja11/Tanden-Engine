/*
 * Conquistas dos exercícios. Mesmo desenho das conquistas dos Mundos: cada uma é
 * um limite sobre uma métrica (`métrica >= alvo`), então o progresso de todas sai
 * do mesmo código. As métricas vêm só do registro (e dos treinos da aba Saúde),
 * por isso não há estado extra para sincronizar: dois aparelhos chegam sempre às
 * mesmas conquistas, e a data de cada uma é refeita repassando o histórico.
 */
import { RARIDADES, type Raridade } from '../caderno/jornada/progresso';
import { addDays } from '../vida';
import type { ActiveDay, ActivityLog } from './registro';
import { HOME_PROGRAMS, programLength, ROUTINE_FOCUS } from './rotinas';
import { longestRun, weekStreaks } from './sequencias';

export type MoveBadgeGroup = 'constancia' | 'volume' | 'variedade' | 'programas' | 'horarios' | 'segredos';

export const MOVE_BADGE_GROUPS: Array<{ id: MoveBadgeGroup; label: string }> = [
  { id: 'constancia', label: 'Constância' },
  { id: 'volume', label: 'Volume' },
  { id: 'variedade', label: 'Variedade' },
  { id: 'programas', label: 'Programas' },
  { id: 'horarios', label: 'Horários' },
  { id: 'segredos', label: 'Segredos' },
];

export interface MoveBadge {
  id: string;
  name: string;
  desc: string;
  group: MoveBadgeGroup;
  rarity: Raridade;
  glyph: string;
  metric: MoveMetric;
  target: number;
  /** só mostra o nome depois de obtida */
  secret?: boolean;
}

export type MoveMetric =
  | 'sessions' | 'minutes' | 'kcal' | 'streakBest' | 'weekStreakBest' | 'activeDays' | 'longest'
  | 'focuses' | 'manualKinds' | 'programs' | 'earlyBirds' | 'nightOwls' | 'weekendDays' | 'maxEffort'
  | 'comeback' | 'sameDay' | 'monthDays';

export type MoveMetrics = Record<MoveMetric, number>;

const out: MoveBadge[] = [];
const ORDER = RARIDADES.map((r) => r.id);

/** Raridade pela posição na série: o começo é comum, o fim é raro de verdade. */
function tier(i: number, n: number): Raridade {
  const p = n > 1 ? i / (n - 1) : 0;
  return ORDER[p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.7 ? 2 : p < 0.95 ? 3 : 4]!;
}

function series(group: MoveBadgeGroup, metric: MoveMetric, glyph: string, desc: (n: number) => string, items: Array<[number, string]>): void {
  items.forEach(([target, name], i) => out.push({ id: `${metric}-${target}`, name, desc: desc(target), group, rarity: tier(i, items.length), glyph, metric, target }));
}

function one(group: MoveBadgeGroup, metric: MoveMetric, target: number, glyph: string, name: string, desc: string, rarity: Raridade, secret = false): void {
  out.push({ id: `${metric}-${target}`, name, desc, group, rarity, glyph, metric, target, secret });
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const pl = (n: number, um: string, varios: string) => `${fmt(n)} ${n === 1 ? um : varios}`;

// ------------------------------------------------------------------ constância

series('constancia', 'streakBest', '🔥', (n) => `Mexa-se ${pl(n, 'dia', 'dias')} seguidos.`, [
  [2, 'De novo amanhã'], [3, 'Faísca'], [7, 'Semana acesa'], [14, 'Duas semanas de brasa'], [21, 'Hábito formado'],
  [30, 'Mês em chamas'], [50, 'Cinquentão'], [100, 'Centenário'], [200, 'Fornalha'], [365, 'Um ano sem apagar'],
]);
series('constancia', 'weekStreakBest', '📅', (n) => `Bata a meta da semana ${pl(n, 'vez', 'semanas seguidas')}.`, [
  [1, 'Meta batida'], [2, 'Duas em seguida'], [4, 'Um mês na meta'], [8, 'Dois meses firmes'], [12, 'Trimestre redondo'], [26, 'Meio ano de meta'], [52, 'Ano inteiro na meta'],
]);
series('constancia', 'activeDays', '◆', (n) => `Tenha ${pl(n, 'dia', 'dias')} com atividade no total.`, [
  [1, 'Primeiro passo'], [10, 'Dez dias de suor'], [30, 'Trinta marcas'], [60, 'Sessenta dias'], [100, 'Cem dias'], [200, 'Duzentos dias'], [365, 'Um ano de dias'],
]);
series('constancia', 'monthDays', '🗓', (n) => `Treine em ${pl(n, 'dia', 'dias')} do mesmo mês.`, [
  [8, 'Duas vezes por semana'], [12, 'Três por semana'], [20, 'Mês cheio'], [28, 'Quase todo dia'],
]);

// ------------------------------------------------------------------ volume

series('volume', 'sessions', '🏃', (n) => `Registre ${pl(n, 'atividade', 'atividades')}.`, [
  [1, 'O começo de tudo'], [5, 'Pegando o jeito'], [10, 'Dez na conta'], [25, 'Vinte e cinco'], [50, 'Meia centena'], [100, 'Cem treinos'], [250, 'Atleta de sala'], [500, 'Quinhentos'],
]);
series('volume', 'minutes', '⏱', (n) => `Acumule ${pl(n, 'minuto', 'minutos')} de atividade.`, [
  [60, 'Primeira hora'], [300, 'Cinco horas'], [600, 'Dez horas'], [1500, 'Um dia inteiro mexendo'], [3000, 'Cinquenta horas'], [6000, 'Cem horas'], [15000, 'Duzentas e cinquenta horas'],
]);
series('volume', 'kcal', '⚡', (n) => `Gaste cerca de ${fmt(n)} kcal nos treinos.`, [
  [500, 'Aquecendo'], [2000, 'Fornalha acesa'], [5000, 'Usina'], [15000, 'Termelétrica'], [40000, 'Pequeno sol'],
]);
series('volume', 'longest', '⌛', (n) => `Faça uma atividade de ${pl(n, 'minuto', 'minutos')} ou mais.`, [
  [20, 'Vinte minutos'], [30, 'Meia hora firme'], [45, 'Quarenta e cinco'], [60, 'Uma hora inteira'], [90, 'Maratona caseira'],
]);
series('volume', 'maxEffort', '💢', (n) => `Termine um treino marcando esforço ${n}.`, [[8, 'Puxado'], [10, 'Tudo o que tinha']]);

// ------------------------------------------------------------------ variedade

series('variedade', 'focuses', '✦', (n) => `Treine ${pl(n, 'tipo', 'tipos')} diferentes de treino guiado.`, [
  [2, 'Experimentando'], [4, 'Eclético'], [6, 'Corpo completo'], [ROUTINE_FOCUS.length, 'Todos os sabores'],
]);
series('variedade', 'manualKinds', '⚽', (n) => `Anote ${pl(n, 'atividade diferente', 'atividades diferentes')} fora dos treinos guiados.`, [
  [1, 'Fora da sala'], [3, 'Multiesportista'], [6, 'Faz de tudo'],
]);
series('variedade', 'weekendDays', '☀', (n) => `Mexa-se em ${pl(n, 'dia', 'dias')} de fim de semana.`, [
  [4, 'Sábado ativo'], [16, 'Fim de semana sagrado'], [52, 'Guerreiro de fim de semana'],
]);

// ------------------------------------------------------------------ programas

series('programas', 'programs', '🎓', (n) => `Conclua ${pl(n, 'programa', 'programas')} até o último treino.`, [
  [1, 'Formado'], [2, 'Pós-graduado'], [4, 'Mestre da sala'], [HOME_PROGRAMS.length, 'Todos os programas'],
]);

// ------------------------------------------------------------------ horários

series('horarios', 'earlyBirds', '🌅', (n) => `Treine antes das 7h em ${pl(n, 'dia', 'dias')}.`, [[1, 'Madrugador'], [10, 'Galo da casa'], [30, 'O sol que espere']]);
series('horarios', 'nightOwls', '🌙', (n) => `Treine depois das 22h em ${pl(n, 'dia', 'dias')}.`, [[1, 'Coruja'], [10, 'Turno da noite'], [30, 'Vampiro fitness']]);

// ------------------------------------------------------------------ segredos

one('segredos', 'comeback', 14, '↺', 'A volta por cima', 'Volte a treinar depois de duas semanas parado.', 'rara', true);
one('segredos', 'sameDay', 3, '∞', 'Não sabe parar', 'Registre três atividades no mesmo dia.', 'epica', true);

export const MOVE_BADGES: readonly MoveBadge[] = out;

// ------------------------------------------------------------------ métricas

export interface MoveMetricsInput {
  logs: ActivityLog[];
  /** dias ativos de qualquer origem (casa + aba Saúde) */
  active: ActiveDay[];
  weekGoal: number;
}

const isWeekend = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const w = new Date(y!, m! - 1, d!).getDay();
  return w === 0 || w === 6;
};

/** Métricas até o dia `upTo` (incluso), ou de todo o histórico. */
export function moveMetrics(input: MoveMetricsInput, upTo?: string): MoveMetrics {
  const logs = upTo ? input.logs.filter((l) => l.day <= upTo) : input.logs;
  const active = (upTo ? input.active.filter((a) => a.day <= upTo) : input.active).filter((a) => a.minutes > 0);
  const days = [...new Set(active.map((a) => a.day))].sort();
  const perDay = new Map<string, number>();
  for (const a of active) perDay.set(a.day, (perDay.get(a.day) ?? 0) + 1);
  const perMonth = new Map<string, number>();
  for (const d of days) perMonth.set(d.slice(0, 7), (perMonth.get(d.slice(0, 7)) ?? 0) + 1);
  let comeback = 0;
  for (let i = 1; i < days.length; i++) {
    let gap = 0;
    for (let d = days[i - 1]!; d < days[i]! && gap < 400; d = addDays(d, 1)) gap++;
    if (gap - 1 > comeback) comeback = gap - 1;
  }
  const programs = HOME_PROGRAMS.filter((p) => logs.filter((l) => l.program === p.id).length >= programLength(p)).length;
  const distinctDays = (pred: (l: ActivityLog) => boolean) => new Set(logs.filter(pred).map((l) => l.day)).size;
  return {
    sessions: active.length,
    minutes: Math.round(active.reduce((a, x) => a + x.minutes, 0)),
    kcal: Math.round(logs.reduce((a, l) => a + (l.kcal ?? 0), 0)),
    streakBest: longestRun(days),
    weekStreakBest: weekStreaks(active, upTo ?? days.at(-1) ?? '1970-01-01', input.weekGoal).best,
    activeDays: days.length,
    longest: Math.round(Math.max(0, ...active.map((a) => a.minutes))),
    focuses: new Set(logs.map((l) => l.focus).filter(Boolean)).size,
    manualKinds: new Set(logs.filter((l) => !l.focus).map((l) => l.name.toLowerCase())).size,
    programs,
    earlyBirds: distinctDays((l) => l.time < '07:00'),
    nightOwls: distinctDays((l) => l.time >= '22:00'),
    weekendDays: days.filter(isWeekend).length,
    maxEffort: Math.max(0, ...logs.map((l) => l.effort ?? 0)),
    comeback,
    sameDay: Math.max(0, ...perDay.values()),
    monthDays: Math.max(0, ...perMonth.values()),
  };
}

export interface BadgeState {
  badge: MoveBadge;
  done: boolean;
  value: number;
  /** de 0 a 1 */
  progress: number;
  /** dia em que foi obtida */
  since: string | null;
}

/**
 * Estado de todas as conquistas. A data de cada uma é o primeiro dia do
 * histórico em que a métrica passou do alvo.
 */
export function moveBadges(input: MoveMetricsInput): BadgeState[] {
  const now = moveMetrics(input);
  const done = MOVE_BADGES.filter((b) => now[b.metric] >= b.target);
  const since = new Map<string, string>();
  if (done.length) {
    const days = [...new Set([...input.active.map((a) => a.day), ...input.logs.map((l) => l.day)])].sort();
    let left = [...done];
    for (const d of days) {
      if (!left.length) break;
      const m = moveMetrics(input, d);
      left = left.filter((b) => {
        if (m[b.metric] < b.target) return true;
        since.set(b.id, d);
        return false;
      });
    }
  }
  return MOVE_BADGES.map((badge) => {
    const value = now[badge.metric];
    const ok = value >= badge.target;
    return { badge, done: ok, value, progress: Math.min(1, value / badge.target), since: ok ? since.get(badge.id) ?? null : null };
  });
}

/** A conquista ainda fechada mais perto de sair (para a tela de treino animar). */
export function nextBadge(states: BadgeState[]): BadgeState | null {
  return states.filter((s) => !s.done && !s.badge.secret).sort((a, b) => b.progress - a.progress)[0] ?? null;
}
