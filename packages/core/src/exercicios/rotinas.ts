/*
 * Monta treinos guiados por tempo: aquecimento, circuito e volta à calma.
 * A mesma entrada (com a mesma semente) sempre gera o mesmo treino.
 *
 * Também define os programas de várias semanas e a linha do tempo que a tela do
 * treino percorre (preparar → fazer → descansar).
 */
import type { Limit } from '../saude/exercicios';
import { HOME_MOVES, homeMoveById, type HomeMove, type HomeProp, type MoveArea } from './biblioteca';

export type RoutineFocus = 'corpo' | 'pernas' | 'superior' | 'core' | 'cardio' | 'mobilidade' | 'alongar' | 'pausa';

export const ROUTINE_FOCUS: Array<{ id: RoutineFocus; label: string; hint: string; strength: boolean }> = [
  { id: 'corpo', label: 'Corpo inteiro', hint: 'Força e fôlego num treino só', strength: true },
  { id: 'pernas', label: 'Pernas e glúteos', hint: 'Agachar, avançar e elevar o quadril', strength: true },
  { id: 'superior', label: 'Peito, costas e braços', hint: 'Empurrar e puxar', strength: true },
  { id: 'core', label: 'Abdômen', hint: 'Estabilidade e postura', strength: true },
  { id: 'cardio', label: 'Cardio', hint: 'Suar sem sair de casa', strength: false },
  { id: 'mobilidade', label: 'Mobilidade', hint: 'Soltar o corpo travado', strength: false },
  { id: 'alongar', label: 'Alongamento', hint: 'Relaxar e respirar', strength: false },
  { id: 'pausa', label: 'Pausa na cadeira', hint: 'Sem levantar da mesa de trabalho', strength: false },
];

export const focusLabel = (f: RoutineFocus): string => ROUTINE_FOCUS.find((x) => x.id === f)?.label ?? f;

const SLOTS: Record<'corpo' | 'pernas' | 'superior' | 'core' | 'cardio', MoveArea[]> = {
  corpo: ['pernas', 'peito', 'gluteos', 'costas', 'core', 'cardio'],
  pernas: ['pernas', 'gluteos', 'pernas', 'gluteos', 'pernas', 'core'],
  superior: ['peito', 'costas', 'ombros', 'bracos', 'peito', 'costas'],
  core: ['core', 'core', 'core', 'gluteos', 'core', 'core'],
  cardio: ['cardio', 'cardio', 'cardio', 'cardio', 'cardio', 'cardio'],
};

export interface RoutineOptions {
  focus: RoutineFocus;
  minutes: number;
  level: 1 | 2 | 3;
  props: HomeProp[];
  avoid: Limit[];
  /** sem saltos: bom para apartamento */
  quiet: boolean;
  seed: string;
  /** movimentos do treino anterior, para variar */
  recent?: string[];
}

export type RoutineBlock = 'aquecimento' | 'circuito' | 'volta';

export interface RoutineStep {
  moveId: string;
  seconds: number;
  /** descanso depois deste movimento */
  rest: number;
  block: RoutineBlock;
  /** rodada do circuito, começando em 1 (0 fora do circuito) */
  round: number;
}

export interface Routine {
  title: string;
  focus: RoutineFocus;
  level: 1 | 2 | 3;
  steps: RoutineStep[];
  /** quantas rodadas tem o circuito */
  rounds: number;
  /** programa e posição, quando faz parte de um */
  program?: { id: string; index: number };
}

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** O movimento serve a este nível, objetos, limitações e vizinhança? */
export function moveAllowed(m: HomeMove, o: Pick<RoutineOptions, 'level' | 'props' | 'avoid' | 'quiet'>): boolean {
  return m.level <= o.level
    && (m.props ?? []).every((p) => o.props.includes(p))
    && !(m.avoid ?? []).some((a) => o.avoid.includes(a))
    && !(o.quiet && m.noisy);
}

const FALLBACK = 'marcha-parada';

interface Picker {
  take(areas: MoveArea[]): HomeMove;
}

/** Escolhe sem repetir enquanto houver opção, preferindo o nível da pessoa. */
function picker(o: RoutineOptions, rand: () => number): Picker {
  const used = new Set<string>();
  const recent = new Set(o.recent ?? []);
  return {
    take(areas) {
      const pool = HOME_MOVES.filter((m) => areas.includes(m.area) && moveAllowed(m, o));
      const order = shuffled(pool, rand).sort((a, b) =>
        Number(used.has(a.id)) - Number(used.has(b.id))
        || Number(recent.has(a.id)) - Number(recent.has(b.id))
        || Math.abs(o.level - a.level) - Math.abs(o.level - b.level));
      const pick = order[0] ?? homeMoveById(FALLBACK)!;
      used.add(pick.id);
      return pick;
    },
  };
}

const WORK: Record<1 | 2 | 3, [number, number]> = { 1: [30, 30], 2: [40, 20], 3: [45, 15] };
const ROUND_REST = 45;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Melhor combinação de estações e rodadas para caber no tempo. */
function fitCircuit(seconds: number, work: number, rest: number): { stations: number; rounds: number } {
  let best = { stations: 3, rounds: 1, time: -1 };
  for (let stations = 3; stations <= 6; stations++) {
    for (let rounds = 1; rounds <= 6; rounds++) {
      const time = rounds * stations * (work + rest) + (rounds - 1) * ROUND_REST;
      if (time > seconds) continue;
      const better = time > best.time + 20 || (time >= best.time - 20 && rounds >= 2 && stations > best.stations && best.rounds >= 2);
      if (better) best = { stations, rounds, time };
    }
  }
  return best;
}

function flow(o: RoutineOptions, areas: MoveArea[], seconds: number, rand: () => number): RoutineStep[] {
  const pick = picker(o, rand);
  const steps: RoutineStep[] = [];
  let total = 0;
  while (total < seconds - 15) {
    const m = pick.take(areas);
    const s = m.sides ? 50 : 40;
    steps.push({ moveId: m.id, seconds: s, rest: 5, block: 'circuito', round: 0 });
    total += s + 5;
  }
  if (steps.length) steps[steps.length - 1]!.rest = 0;
  return steps;
}

/** Monta o treino completo a partir das opções. */
export function buildRoutine(o: RoutineOptions): Routine {
  const minutes = clamp(Math.round(o.minutes), 3, 60);
  const total = minutes * 60;
  const rand = rng(`${o.focus}|${minutes}|${o.level}|${o.seed}`);
  const title = focusLabel(o.focus);
  if (o.focus === 'mobilidade' || o.focus === 'alongar' || o.focus === 'pausa') {
    const areas: MoveArea[] = o.focus === 'mobilidade' ? ['mobilidade', 'alongamento'] : o.focus === 'alongar' ? ['alongamento'] : ['sentado'];
    return { title, focus: o.focus, level: o.level, steps: flow(o, areas, total, rand), rounds: 1 };
  }
  const pick = picker(o, rand);
  const warmSec = clamp(total * 0.15, 90, 300);
  const coolSec = clamp(total * 0.12, 60, 240);
  const warmCount = Math.max(2, Math.round(warmSec / 35));
  const coolCount = Math.max(2, Math.round(coolSec / 35));
  const steps: RoutineStep[] = [];
  for (let i = 0; i < warmCount; i++) {
    const m = pick.take(i === warmCount - 1 ? ['cardio', 'mobilidade'] : ['mobilidade']);
    steps.push({ moveId: m.id, seconds: 30, rest: 5, block: 'aquecimento', round: 0 });
  }
  const [work, rest] = WORK[o.level];
  const mainSec = total - warmCount * 35 - coolCount * 35;
  // treinos longos viram dois circuitos, para não repetir os mesmos movimentos
  const circuits = mainSec > 1200 ? 2 : 1;
  const slots = SLOTS[o.focus];
  let rounds = 1;
  let roundBase = 0;
  for (let c = 0; c < circuits; c++) {
    const fit = fitCircuit(Math.max(120, mainSec / circuits - (c ? ROUND_REST : 0)), work, rest);
    rounds = fit.rounds;
    const station: HomeMove[] = [];
    for (let i = 0; i < fit.stations; i++) {
      const area = slots[(i + c * 2) % slots.length]!;
      station.push(pick.take([area]));
    }
    for (let r = 1; r <= fit.rounds; r++) {
      station.forEach((m, i) => {
        const last = i === station.length - 1;
        steps.push({ moveId: m.id, seconds: work, rest: last ? ROUND_REST : rest, block: 'circuito', round: roundBase + r });
      });
    }
    roundBase += fit.rounds;
  }
  rounds = roundBase;
  for (let i = 0; i < coolCount; i++) {
    const m = pick.take(['alongamento']);
    steps.push({ moveId: m.id, seconds: 30, rest: i === coolCount - 1 ? 0 : 5, block: 'volta', round: 0 });
  }
  return { title, focus: o.focus, level: o.level, steps, rounds };
}

export const routineSeconds = (r: Pick<Routine, 'steps'>): number => r.steps.reduce((a, s) => a + s.seconds + s.rest, 0);

/** Calorias estimadas: MET × 3,5 × peso / 200 por minuto. */
export function routineKcal(r: Pick<Routine, 'steps'>, kg: number): number {
  let total = 0;
  for (const s of r.steps) {
    const met = homeMoveById(s.moveId)?.met ?? 3;
    total += ((met * 3.5 * kg) / 200) * (s.seconds / 60) + ((1.5 * 3.5 * kg) / 200) * (s.rest / 60);
  }
  return Math.round(total);
}

// ------------------------------------------------------------------ linha do tempo

export type PhaseKind = 'preparar' | 'fazer' | 'descansar';

export interface Phase {
  kind: PhaseKind;
  seconds: number;
  /** passo do treino que está sendo feito ou que vem a seguir */
  step: number;
}

export const PREPARE_SECONDS = 10;

export function routineTimeline(r: Pick<Routine, 'steps'>): Phase[] {
  const out: Phase[] = [];
  r.steps.forEach((s, i) => {
    if (i === 0) out.push({ kind: 'preparar', seconds: PREPARE_SECONDS, step: 0 });
    out.push({ kind: 'fazer', seconds: s.seconds, step: i });
    if (s.rest > 0 && i < r.steps.length - 1) out.push({ kind: 'descansar', seconds: s.rest, step: i + 1 });
  });
  return out;
}

export interface PhasePosition {
  index: number;
  phase: Phase;
  /** segundos que faltam nesta fase */
  remaining: number;
  done: boolean;
}

/** Onde o treino está depois de `elapsed` segundos. */
export function phaseAt(timeline: Phase[], elapsed: number): PhasePosition {
  let t = Math.max(0, elapsed);
  for (let i = 0; i < timeline.length; i++) {
    const p = timeline[i]!;
    if (t < p.seconds) return { index: i, phase: p, remaining: p.seconds - t, done: false };
    t -= p.seconds;
  }
  const last = timeline.length - 1;
  return { index: last, phase: timeline[last]!, remaining: 0, done: true };
}

/** Segundo em que a fase `index` começa. */
export function phaseStart(timeline: Phase[], index: number): number {
  let t = 0;
  for (let i = 0; i < index && i < timeline.length; i++) t += timeline[i]!.seconds;
  return t;
}

// ------------------------------------------------------------------ programas

export interface ProgramSession {
  focus: RoutineFocus;
  minutes: number;
  level: 1 | 2 | 3;
}

export interface HomeProgram {
  id: string;
  name: string;
  hint: string;
  weeks: number;
  perWeek: number;
  /** treino da semana `week` (a partir de 0), posição `slot` dentro da semana */
  session: (week: number, slot: number) => ProgramSession;
}

const cycle = <T>(list: T[], i: number): T => list[i % list.length]!;

export const HOME_PROGRAMS: HomeProgram[] = [
  {
    id: 'comecar', name: 'Comece do zero', hint: 'Três treinos curtos por semana para criar o hábito, sem saltos.', weeks: 4, perWeek: 3,
    session: (w, s) => ({ focus: cycle<RoutineFocus>(['corpo', 'mobilidade', 'corpo'], s), minutes: s === 1 ? 10 : 10 + w * 4, level: 1 }),
  },
  {
    id: 'forca-casa', name: 'Força em casa', hint: 'Quatro treinos por semana alternando pernas, tronco e abdômen.', weeks: 6, perWeek: 4,
    session: (w, s) => ({ focus: cycle<RoutineFocus>(['pernas', 'superior', 'core', 'corpo'], s), minutes: 20 + Math.min(w, 5) * 2, level: w >= 3 ? 3 : 2 }),
  },
  {
    id: 'apartamento', name: 'Cardio de apartamento', hint: 'Sua a camisa sem pular e sem incomodar o vizinho.', weeks: 4, perWeek: 3,
    session: (w, s) => ({ focus: cycle<RoutineFocus>(['cardio', 'corpo', 'cardio'], s), minutes: 15 + w * 3, level: w >= 2 ? 2 : 1 }),
  },
  {
    id: 'coluna', name: 'Coluna e postura', hint: 'Para quem passa o dia sentado: mobilidade e abdômen, poucos minutos por dia.', weeks: 3, perWeek: 5,
    session: (w, s) => ({ focus: cycle<RoutineFocus>(['mobilidade', 'core', 'alongar', 'mobilidade', 'core'], s), minutes: 8 + w * 2, level: 1 }),
  },
  {
    id: 'alongar-14', name: '14 dias de alongamento', hint: 'Um pouco todo dia para ganhar flexibilidade e dormir melhor.', weeks: 2, perWeek: 7,
    session: (w, s) => ({ focus: cycle<RoutineFocus>(['alongar', 'mobilidade'], s), minutes: 8 + w * 3, level: 1 }),
  },
];

export const homeProgramById = (id: string): HomeProgram | undefined => HOME_PROGRAMS.find((p) => p.id === id);
export const programLength = (p: HomeProgram): number => p.weeks * p.perWeek;

/** Treino de número `index` (a partir de 0) do programa. */
export function programRoutine(p: HomeProgram, index: number, o: Pick<RoutineOptions, 'props' | 'avoid' | 'quiet'>): Routine {
  const i = Math.max(0, Math.min(programLength(p) - 1, index));
  const week = Math.floor(i / p.perWeek);
  const slot = i % p.perWeek;
  const s = p.session(week, slot);
  const quiet = p.id === 'comecar' || p.id === 'apartamento' ? true : o.quiet;
  const r = buildRoutine({ ...s, props: o.props, avoid: o.avoid, quiet, seed: `${p.id}-${i}` });
  return { ...r, title: `${p.name} · semana ${week + 1}, treino ${slot + 1}`, program: { id: p.id, index: i } };
}
