/*
 * Vida: tarefas, projetos, hábitos, metas e diário juntos na tela Hoje.
 *
 * Nada aqui tem formato próprio. Os dados são os bancos comuns (Tarefas,
 * Projetos, Hábitos, Metas, Diário, criados pela galeria de Bancos ou à mão)
 * e as tarefas "- [ ]" com data em qualquer nota, no formato do plugin Tasks.
 * Os bancos são reconhecidos pelas propriedades, não pelo nome: um banco com
 * "prazo" e "status" é de tarefas, um com "alvo" é de metas, e assim por diante.
 * Tudo continua abrindo no Obsidian igual.
 */
import { asList, parseProps, setProp, setProps, splitFrontmatter, type PropValue } from '../caderno/frontmatter';
import { linkTarget, noteDir, noteName } from '../caderno/markdown';
import { formatDate, isoDate, parseDate } from '../base/expr';
import { baseFolder, findBaseBlocks, parseBase, propConfig, propKey, type BaseDef, type PropConfig } from '../base/model';
import { runView, type NoteIndex, type NoteRec } from '../base/query';
import { blankRow, instantiate } from '../base/templates';
import { completeIn, parseReminders, type Reminder } from '../reminders';
import { parseQuickReminder } from '../quick-reminder';

export type LifeKind = 'tarefas' | 'projetos' | 'habitos' | 'metas' | 'diario';

export interface LifeDb {
  kind: LifeKind;
  /** nota do banco */
  note: string;
  /** pasta das linhas */
  folder: string;
  def: BaseDef;
}

export type LifeDbs = Partial<Record<LifeKind, LifeDb>>;

/** Nome que cada tipo de banco ganha na galeria (e no "Montar meu sistema"). */
export const LIFE_TEMPLATE: Record<LifeKind, { id: string; name: string }> = {
  tarefas: { id: 'tarefas', name: 'Tarefas' },
  projetos: { id: 'projetos', name: 'Projetos' },
  habitos: { id: 'habitos', name: 'Hábitos' },
  metas: { id: 'metas', name: 'Metas' },
  diario: { id: 'diario', name: 'Diário' },
};

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function keysOf(def: BaseDef): Map<string, PropConfig> {
  const m = new Map<string, PropConfig>();
  for (const [k, v] of Object.entries(def.properties ?? {})) {
    if (k.startsWith('formula.') || k.startsWith('file.')) continue;
    m.set(fold(propKey(k)), v);
  }
  return m;
}

function kindOf(def: BaseDef): LifeKind | null {
  const k = keysOf(def);
  const has = (...xs: string[]) => xs.every((x) => k.has(fold(x)));
  if (has('alvo')) return 'metas';
  if (has('prazo', 'status')) return 'tarefas';
  if (has('status') && (has('início', 'fim') || has('progresso'))) return 'projetos';
  if (has('humor')) return 'diario';
  if (has('data') && [...k.values()].some((c) => c.type === 'checkbox')) return 'habitos';
  return null;
}

/**
 * Acha os bancos de vida no cofre. Se houver mais de um do mesmo tipo, vale o
 * que tem o nome do tipo ("Tarefas"), senão o primeiro em ordem alfabética.
 */
export function detectLifeDbs(notes: Iterable<{ path: string; text: string }>): LifeDbs {
  const out: LifeDbs = {};
  const found: LifeDb[] = [];
  for (const n of notes) {
    if (!n.text.includes('```base')) continue;
    const b = findBaseBlocks(n.text)[0];
    if (!b) continue;
    const { def, error } = parseBase(b.source);
    if (error) continue;
    const kind = kindOf(def);
    if (!kind) continue;
    found.push({ kind, note: n.path, folder: baseFolder(def) ?? `${noteDir(n.path) ? `${noteDir(n.path)}/` : ''}${noteName(n.path)}`, def });
  }
  found.sort((a, b) => a.note.localeCompare(b.note, 'pt-BR'));
  for (const f of found) {
    const cur = out[f.kind];
    const named = fold(noteName(f.note)) === fold(LIFE_TEMPLATE[f.kind].name);
    if (!cur || (named && fold(noteName(cur.note)) !== fold(LIFE_TEMPLATE[f.kind].name))) out[f.kind] = f;
  }
  return out;
}

/** Linhas do banco (os filtros do próprio banco valem; os das views, não). */
export function lifeRows(db: LifeDb, index: NoteIndex, now = new Date()): NoteRec[] {
  return runView(db.def, { type: 'table', name: '' }, index, { thisPath: db.note, now }).rows.map((r) => r.rec).filter((r) => r.path !== db.note);
}

// ------------------------------------------------------------------ status

const DONE_RE = /^(feit[oa]|conclu[ií]d[oa]|done|alcan[cç]ad[oa]|pronto|entregue|fechad[oa])$/i;
const DOING_RE = /^(em andamento|ativ[oa]|fazendo|doing|in progress|em progresso)$/i;
const DROPPED_RE = /^(cancelad[oa]|abandonad[oa]|pausad[oa])$/i;

export type StatusGroup = 'todo' | 'doing' | 'done';

export function statusGroup(def: BaseDef, key: string, value: string): StatusGroup {
  const o = propConfig(def, key).options?.find((x) => x.value === value);
  if (o?.group) return o.group;
  if (DONE_RE.test(value.trim())) return 'done';
  if (DOING_RE.test(value.trim())) return 'doing';
  return 'todo';
}

/** Opção de status para "feito" (ou para "a fazer") do banco. */
export function statusValue(def: BaseDef, key: string, group: StatusGroup): string {
  const opts = propConfig(def, key).options ?? [];
  const o = opts.find((x) => x.group === group) ?? opts.find((x) => (group === 'done' ? DONE_RE : group === 'doing' ? DOING_RE : /a fazer|to ?do|pendente|ideia|planejad/i).test(x.value));
  if (o) return o.value;
  return group === 'done' ? 'Feito' : group === 'doing' ? 'Em andamento' : 'A fazer';
}

const text = (v: PropValue | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const num = (v: PropValue | undefined): number | null => {
  const s = text(v).replace('%', '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return text(v).includes('%') ? n / 100 : n;
};
const dayOf = (v: PropValue | undefined): string | null => {
  const s = text(v);
  const d = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (d) return d[1]!;
  const p = s ? parseDate(s) : null;
  return p ? isoDate(p, false) : null;
};
const linkOf = (v: PropValue | undefined): string[] =>
  asList(v)
    .map((x) => (/^\[\[/.test(x.trim()) ? linkTarget(x.trim().replace(/^\[\[|\]\]$/g, '')) : x.trim()))
    .filter(Boolean);

export const today = (now = new Date()): string => isoDate(now, false);
export const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return isoDate(new Date(y!, m! - 1, d! + n), false);
};

// ------------------------------------------------------------------ tarefas

export interface LifeTask {
  key: string;
  title: string;
  path: string;
  /** banco (uma nota por tarefa) ou linha "- [ ]" dentro de uma nota */
  source: 'banco' | 'nota';
  /** dia do prazo (AAAA-MM-DD) */
  due: string | null;
  /** hora, quando a tarefa é um lembrete com horário */
  time: string | null;
  done: boolean;
  /** 0 nenhuma, 1 baixa, 2 média, 3 alta, 4 máxima */
  priority: number;
  /** nota do projeto (caminho) */
  project: string | null;
  status: string;
  /** dia em que foi concluída, quando se sabe */
  doneOn: string | null;
  reminder?: Reminder;
}

function priorityOf(v: string): number {
  const s = fold(v);
  if (/max|urgent|critic/.test(s)) return 4;
  if (/alta|high|^!+$/.test(s)) return 3;
  if (/media|medium|normal/.test(s)) return 2;
  if (/baixa|low/.test(s)) return 1;
  return 0;
}

const DONE_ON_KEYS = ['concluída', 'concluído', 'concluido', 'concluida', 'feito em', 'completed'];
const DONE_ON_RE = /✅\s*(\d{4}-\d{2}-\d{2})/u;

/** Tarefas do banco de tarefas e lembretes com data de todas as notas. */
export function collectTasks(dbs: LifeDbs, index: NoteIndex, read: (path: string) => string, now = new Date()): LifeTask[] {
  const out: LifeTask[] = [];
  const db = dbs.tarefas;
  const rowPaths = new Set<string>();
  if (db) {
    for (const r of lifeRows(db, index, now)) {
      rowPaths.add(r.path);
      const status = text(r.props.status);
      const proj = linkOf(r.props.projeto ?? r.props.project)[0];
      const due = text(r.props.prazo);
      out.push({
        key: `db:${r.path}`,
        title: r.name,
        path: r.path,
        source: 'banco',
        due: dayOf(r.props.prazo),
        time: /T(\d{2}:\d{2})/.exec(due)?.[1] ?? null,
        done: statusGroup(db.def, 'status', status) === 'done' || /^(true|x|sim)$/i.test(text(r.props.feito)),
        priority: priorityOf(text(r.props.prioridade ?? r.props.priority)),
        project: proj ? index.find(proj)?.path ?? null : null,
        status,
        doneOn: DONE_ON_KEYS.map((k) => dayOf(r.props[k])).find(Boolean) ?? null,
      });
    }
  }
  for (const rec of index.notes) {
    if (rec.path.startsWith('.') || rec.path.startsWith('Modelos/')) continue;
    const t = read(rec.path);
    if (!/- \[[ xX]\]/.test(t)) continue;
    for (const rem of parseReminders(rec.path, t)) {
      const d = new Date(rem.at);
      out.push({
        key: `rem:${rem.key}`,
        title: rem.text,
        path: rec.path,
        source: 'nota',
        due: isoDate(d, false),
        time: /\(@\d{4}-\d{2}-\d{2}[ T]\d/.test(rem.raw) ? formatDate(d, 'HH:mm') : null,
        done: rem.done,
        priority: rem.priority,
        project: null,
        status: rem.done ? 'Feito' : '',
        doneOn: DONE_ON_RE.exec(rem.raw)?.[1] ?? null,
        reminder: rem,
      });
    }
  }
  return out;
}

export type TaskBucket = 'atrasadas' | 'hoje' | 'semana' | 'depois' | 'sem data' | 'feitas';

export function taskBucket(t: LifeTask, day: string): TaskBucket {
  if (t.done) return 'feitas';
  if (!t.due) return 'sem data';
  if (t.due < day) return 'atrasadas';
  if (t.due === day) return 'hoje';
  if (t.due <= addDays(day, 7)) return 'semana';
  return 'depois';
}

/** Ordem da lista: prazo, depois prioridade, depois nome. */
export const byUrgency = (a: LifeTask, b: LifeTask): number =>
  (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99') || b.priority - a.priority || a.title.localeCompare(b.title, 'pt-BR');

/**
 * Marca (ou desmarca) a tarefa no texto da nota dela. No banco, troca o status
 * e grava o dia da conclusão; numa linha "- [ ]", marca o x e põe ✅ data, como
 * o plugin Tasks (lembrete repetido pula para a próxima vez).
 */
export function setTaskDone(noteText: string, t: LifeTask, done: boolean, dbs: LifeDbs, now = new Date()): string {
  if (t.source === 'banco') {
    const def = dbs.tarefas?.def ?? { views: [] };
    return setProps(noteText, { status: statusValue(def, 'status', done ? 'done' : 'todo'), concluída: done ? today(now) : null });
  }
  const r = t.reminder!;
  if (done) {
    const next = completeIn(noteText, r, now.getTime());
    if (r.repeat) return next;
    const lines = next.split('\n');
    const i = lines.findIndex((l, k) => k >= r.line - 2 && l.includes(r.text) && /- \[[xX]\]/.test(l));
    if (i >= 0 && !DONE_ON_RE.test(lines[i]!)) lines[i] = `${lines[i]!.trimEnd()} ✅ ${today(now)}`;
    return lines.join('\n');
  }
  const lines = noteText.split('\n');
  const i = lines[r.line] === r.raw ? r.line : lines.indexOf(r.raw);
  if (i < 0) return noteText;
  lines[i] = lines[i]!.replace(/\[[xX]\]/, '[ ]').replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, '');
  return lines.join('\n');
}

// ------------------------------------------------------------------ captura rápida

export interface Capture {
  title: string;
  due: string | null;
  /** hora dita na frase ("9h", "18:30", "em 20 min") */
  time: string | null;
  priority: number;
  /** a frase pede um lembrete com hora (vai para Lembretes, que avisa) */
  reminder: boolean;
}

const HAS_TIME = /\b\d{1,2}\s*(?:h\s*\d{0,2}|:\d{2})\b|\bem\s+\d+\s*(?:min|minutos?|h|horas?)\b|\b(?:ao\s+)?meio[- ]dia\b/i;

/**
 * "amanhã revisar slides !" → tarefa com prazo amanhã e prioridade alta.
 * "!" no fim é alta e "!!" é máxima; data e hora em português como nos lembretes.
 */
export function parseCapture(input: string, now = new Date()): Capture | null {
  let s = input.trim();
  if (!s) return null;
  let priority = 0;
  const bang = /\s*(!{1,3})\s*$/.exec(s);
  if (bang) {
    priority = bang[1]!.length >= 2 ? 4 : 3;
    s = s.slice(0, bang.index).trim();
  }
  const q = parseQuickReminder(s, now.getTime());
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  if (!q || !q.text.trim()) return s ? { title: cap(s), due: null, time: null, priority, reminder: false } : null;
  const at = new Date(q.at);
  const time = HAS_TIME.test(s) ? formatDate(at, 'HH:mm') : null;
  return { title: cap(q.text.trim()), due: isoDate(at, false), time, priority, reminder: !!time || !!q.repeat };
}

const PRIORITY_LABEL = ['', 'Baixa', 'Média', 'Alta', 'Alta'];

/** Nota nova do banco de tarefas para uma captura. */
export function taskRowText(db: LifeDb, c: Capture, template: string | null, now = new Date()): string {
  const props: Record<string, string> = { status: statusValue(db.def, 'status', 'todo') };
  if (c.due) props.prazo = c.time ? `${c.due}T${c.time}` : c.due;
  if (c.priority) {
    const opts = propConfig(db.def, 'prioridade').options ?? [];
    const want = PRIORITY_LABEL[c.priority]!;
    props.prioridade = opts.find((o) => fold(o.value) === fold(want))?.value ?? want;
  }
  let t = template ? instantiate(template, c.title, now) : blankRow(c.title, {});
  t = setProps(t, props);
  return setProp(t, 'criado', isoDate(now, true));
}

// ------------------------------------------------------------------ projetos

export interface LifeProject {
  path: string;
  name: string;
  status: string;
  group: StatusGroup;
  area: string;
  start: string | null;
  end: string | null;
  /** 0 a 1, pelas tarefas ligadas e as caixas da nota; sem tarefas, a propriedade progresso */
  progress: number | null;
  tasksDone: number;
  tasksTotal: number;
  /** próxima tarefa aberta */
  next: string | null;
  overdue: number;
  /** meta (caminho) */
  goal: string | null;
}

const CHECK_RE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;

/** Caixas "- [ ]" de uma nota, fora de blocos de código. */
export function checkboxes(noteText: string): Array<{ done: boolean; text: string }> {
  const out: Array<{ done: boolean; text: string }> = [];
  let inCode = false;
  for (const line of splitFrontmatter(noteText).body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const m = CHECK_RE.exec(line);
    if (m && m[2]!.trim()) out.push({ done: m[1] !== ' ', text: m[2]!.trim() });
  }
  return out;
}

export function collectProjects(dbs: LifeDbs, index: NoteIndex, tasks: LifeTask[], read: (path: string) => string, now = new Date()): LifeProject[] {
  const db = dbs.projetos;
  if (!db) return [];
  const day = today(now);
  return lifeRows(db, index, now).map((r) => {
    const status = text(r.props.status);
    const linked = tasks.filter((t) => t.project === r.path);
    const boxes = checkboxes(read(r.path));
    const total = linked.length + boxes.length;
    const done = linked.filter((t) => t.done).length + boxes.filter((b) => b.done).length;
    const open = [...linked.filter((t) => !t.done).sort(byUrgency).map((t) => t.title), ...boxes.filter((b) => !b.done).map((b) => b.text)];
    const goal = linkOf(r.props.meta ?? r.props.goal)[0];
    return {
      path: r.path,
      name: r.name,
      status,
      group: statusGroup(db.def, 'status', status),
      area: text(r.props.área ?? r.props.area),
      start: dayOf(r.props.início ?? r.props.inicio),
      end: dayOf(r.props.fim),
      progress: total ? done / total : num(r.props.progresso),
      tasksDone: done,
      tasksTotal: total,
      next: open[0] ?? null,
      overdue: linked.filter((t) => !t.done && t.due && t.due < day).length,
      goal: goal ? index.find(goal)?.path ?? null : null,
    };
  });
}

// ------------------------------------------------------------------ hábitos

export interface LifeHabit {
  key: string;
  label: string;
  /** do mais antigo para hoje */
  days: Array<{ day: string; done: boolean }>;
  /** dias seguidos até hoje (ou até ontem, se hoje ainda não foi) */
  streak: number;
  best: number;
  /** fração dos últimos 30 dias */
  rate: number;
}

/** Dia de uma linha do banco de hábitos: a propriedade data ou um nome de arquivo com data. */
function rowDay(r: NoteRec): string | null {
  return dayOf(r.props.data ?? r.props.date) ?? (/^\d{4}-\d{2}-\d{2}$/.test(r.name) ? r.name : null);
}

const isTrue = (v: PropValue | undefined) => /^(true|x|sim|yes|1)$/i.test(text(v));

/** Colunas de hábito: as propriedades de caixa do banco. */
export function habitKeys(db: LifeDb): Array<{ key: string; label: string }> {
  return Object.entries(db.def.properties ?? {})
    .filter(([k, v]) => v.type === 'checkbox' && !k.startsWith('formula.') && !k.startsWith('file.'))
    .map(([k, v]) => ({ key: propKey(k), label: v.displayName || propKey(k) }));
}

export function collectHabits(dbs: LifeDbs, index: NoteIndex, now = new Date(), span = 7): { habits: LifeHabit[]; rows: Map<string, string> } {
  const db = dbs.habitos;
  const rows = new Map<string, string>();
  if (!db) return { habits: [], rows };
  const byDay = new Map<string, NoteRec>();
  for (const r of lifeRows(db, index, now)) {
    const d = rowDay(r);
    if (d && !byDay.has(d)) byDay.set(d, r);
  }
  for (const [d, r] of byDay) rows.set(d, r.path);
  const day = today(now);
  const habits = habitKeys(db).map(({ key, label }) => {
    const on = (d: string) => isTrue(byDay.get(d)?.props[key]);
    const days = Array.from({ length: span }, (_, i) => addDays(day, i - span + 1)).map((d) => ({ day: d, done: on(d) }));
    let streak = 0;
    for (let d = on(day) ? day : addDays(day, -1); on(d); d = addDays(d, -1)) streak++;
    let best = 0;
    let run = 0;
    for (const d of [...byDay.keys()].sort()) {
      run = on(d) && byDay.has(addDays(d, -1)) && on(addDays(d, -1)) ? run + 1 : on(d) ? 1 : 0;
      best = Math.max(best, run);
    }
    let hits = 0;
    for (let i = 0; i < 30; i++) if (on(addDays(day, -i))) hits++;
    return { key, label, days, streak, best: Math.max(best, streak), rate: hits / 30 };
  });
  return { habits, rows };
}

/** Texto da linha do dia (nova, com todos os hábitos desmarcados, ou do modelo do banco). */
export function habitRowText(db: LifeDb, day: string, template: string | null, now = new Date()): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!, now.getHours(), now.getMinutes());
  let t = template ? instantiate(template, day, date) : blankRow(day, {});
  const patch: Record<string, string> = { data: day };
  for (const h of habitKeys(db)) if (parseProps(t)[h.key] === undefined) patch[h.key] = 'false';
  return setProps(t, patch);
}

// ------------------------------------------------------------------ metas

export interface LifeGoal {
  path: string;
  name: string;
  status: string;
  group: StatusGroup;
  area: string;
  target: number | null;
  current: number | null;
  unit: string;
  due: string | null;
  progress: number | null;
  projects: string[];
}

export function collectGoals(dbs: LifeDbs, index: NoteIndex, projects: LifeProject[], now = new Date()): LifeGoal[] {
  const db = dbs.metas;
  if (!db) return [];
  return lifeRows(db, index, now).map((r) => {
    const status = text(r.props.status);
    const target = num(r.props.alvo);
    const current = num(r.props.atual);
    const mine = projects.filter((p) => p.goal === r.path);
    const fromProjects = mine.filter((p) => p.progress !== null);
    const progress = target && target > 0 && current !== null
      ? Math.max(0, Math.min(1, current / target))
      : fromProjects.length ? fromProjects.reduce((a, p) => a + p.progress!, 0) / fromProjects.length : null;
    return {
      path: r.path,
      name: r.name,
      status,
      group: statusGroup(db.def, 'status', status),
      area: text(r.props.área ?? r.props.area),
      target,
      current,
      unit: text(r.props.unidade),
      due: dayOf(r.props.prazo),
      progress,
      projects: mine.map((p) => p.path),
    };
  });
}

/** Soma (ou define) o valor atual de uma meta numérica. */
export function bumpGoal(noteText: string, delta: number): string {
  const cur = num(parseProps(noteText).atual) ?? 0;
  const next = Math.round((cur + delta) * 1000) / 1000;
  return setProp(noteText, 'atual', String(next));
}

// ------------------------------------------------------------------ painel

export interface LifeSnapshot {
  day: string;
  dbs: LifeDbs;
  tasks: LifeTask[];
  projects: LifeProject[];
  habits: LifeHabit[];
  habitRows: Map<string, string>;
  goals: LifeGoal[];
}

export function lifeSnapshot(index: NoteIndex, read: (path: string) => string, now = new Date()): LifeSnapshot {
  const dbs = detectLifeDbs(index.notes.filter((n) => !n.path.startsWith('Modelos/')).map((n) => ({ path: n.path, text: read(n.path) })));
  const tasks = collectTasks(dbs, index, read, now);
  const projects = collectProjects(dbs, index, tasks, read, now);
  const { habits, rows } = collectHabits(dbs, index, now);
  const goals = collectGoals(dbs, index, projects, now);
  return { day: today(now), dbs, tasks, projects, habits, habitRows: rows, goals };
}

// ------------------------------------------------------------------ revisão semanal

/** Segunda-feira da semana do dia e o número ISO da semana. */
export function isoWeek(day: string): { year: number; week: number; monday: string; sunday: string } {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = date.getUTCDay() || 7;
  const monday = addDays(day, 1 - dow);
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return { year: date.getUTCFullYear(), week, monday, sunday: addDays(monday, 6) };
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const link = (p: string) => `[[${p.replace(/\.md$/, '')}|${noteName(p)}]]`;

/**
 * Nota da revisão semanal: o que foi feito, o que atrasou, o que vem, hábitos,
 * projetos e metas, e espaço para pensar a próxima semana.
 */
export function weeklyReview(s: LifeSnapshot, opts: { habitsWeek?: LifeHabit[] } = {}): { path: string; text: string } {
  const w = isoWeek(s.day);
  const inWeek = (d: string | null) => !!d && d >= w.monday && d <= w.sunday;
  const done = s.tasks.filter((t) => t.done && inWeek(t.doneOn));
  const late = s.tasks.filter((t) => !t.done && t.due && t.due < s.day).sort(byUrgency);
  const nextWeek = s.tasks.filter((t) => !t.done && t.due && t.due >= s.day && t.due <= addDays(w.sunday, 7)).sort(byUrgency);
  const line = (t: LifeTask, box: string) => `- [${box}] ${t.title}${t.due ? ` · ${dm(t.due)}` : ''}${t.project ? ` · ${link(t.project)}` : ''}${t.source === 'banco' ? ` · ${link(t.path)}` : ` (em ${link(t.path)})`}`;
  const out: string[] = [];
  out.push(`---\ntipo: revisão\nsemana: ${w.year}-W${String(w.week).padStart(2, '0')}\ndata: ${s.day}\ntags:\n  - revisão\n---`);
  out.push(`# Revisão da semana ${w.week} (${dm(w.monday)} a ${dm(w.sunday)})`);
  out.push(`## Feito (${done.length})\n${done.length ? done.map((t) => line(t, 'x')).join('\n') : '- nada marcado como feito nesta semana'}`);
  if (late.length) out.push(`## Atrasado (${late.length})\n${late.map((t) => line(t, ' ')).join('\n')}`);
  out.push(`## Próximos dias\n${nextWeek.length ? nextWeek.map((t) => line(t, ' ')).join('\n') : '- nada com prazo'}`);
  const habits = opts.habitsWeek ?? s.habits;
  if (habits.length) {
    out.push(`## Hábitos\n| Hábito | Semana | Sequência | 30 dias |\n| --- | --- | --: | --: |\n${habits
      .map((h) => {
        const week = h.days.filter((d) => inWeek(d.day));
        return `| ${h.label} | ${week.map((d) => (d.done ? '●' : '○')).join(' ')} | ${h.streak} | ${pct(h.rate)} |`;
      })
      .join('\n')}`);
  }
  const active = s.projects.filter((p) => p.group !== 'done');
  if (active.length) out.push(`## Projetos\n${active.map((p) => `- ${link(p.path)} · ${p.status || 'sem status'} · ${pct(p.progress)}${p.next ? ` · próximo: ${p.next}` : ''}${p.overdue ? ` · ⚠ ${p.overdue} atrasada${p.overdue > 1 ? 's' : ''}` : ''}`).join('\n')}`);
  const goals = s.goals.filter((g) => g.group !== 'done');
  if (goals.length) out.push(`## Metas\n${goals.map((g) => `- ${link(g.path)} · ${pct(g.progress)}${g.target !== null ? ` (${g.current ?? 0}/${g.target}${g.unit ? ` ${g.unit}` : ''})` : ''}${g.due ? ` · até ${dm(g.due)}` : ''}`).join('\n')}`);
  out.push('## O que funcionou\n- ');
  out.push('## O que mudar\n- ');
  out.push('## Foco da próxima semana\n- [ ] ');
  return { path: `Revisões/${w.year}-W${String(w.week).padStart(2, '0')}.md`, text: `${out.join('\n\n')}\n` };
}
