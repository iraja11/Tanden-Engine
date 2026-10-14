import { hashHex } from './hash';

/*
 * Lembretes do Tanden.
 *
 * Um lembrete é uma tarefa dentro de qualquer nota, no formato que o Obsidian
 * já entende (plugins Reminder e Tasks):
 *
 *   - [ ] Comprar pão (@2026-10-15 09:00)
 *   - [ ] Academia 🔁 every week on Monday, Thursday (@2026-10-16 07:30)
 *   - [ ] Entregar relatório ⏫ 📅 2026-10-20          (sem hora: 09:00)
 *
 * Como mora nas notas, o lembrete sincroniza pelo mesmo merge do cofre: marcar
 * como feito no celular desmarca o alarme no PC no próximo sync. Cada aparelho
 * só guarda localmente quais lembretes já mostrou, para não repetir o aviso.
 */

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export interface Repeat {
  every: number;
  unit: RepeatUnit;
  /** dias da semana (0 = domingo) para "every week on ..." e "every weekday" */
  weekdays?: number[];
}

export interface Reminder {
  /** estável enquanto o texto do lembrete não muda (adiar não muda a chave) */
  key: string;
  path: string;
  /** linha (0-based) onde estava na última leitura */
  line: number;
  /** a linha inteira, para achá-la de novo antes de editar */
  raw: string;
  text: string;
  /** horário em ms (hora local do aparelho) */
  at: number;
  done: boolean;
  repeat: Repeat | null;
  /** 0 normal, 1 baixa, 2 média, 3 alta, 4 máxima */
  priority: number;
}

export const DEFAULT_HOUR = 9;
export const REMINDERS_NOTE = 'Lembretes.md';

const TASK_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/;
const AT_RE = /\(@(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?\)/;
const DUE_RE = /📅\s*(\d{4})-(\d{2})-(\d{2})/;
const REPEAT_RE = /🔁\s*(every\s+[a-z0-9 ,]+?)(?=\s*(?:[📅⏳🛫✅➕⏫🔼🔽🔺⏬]|\(@|$))/iu;
const PRIORITY: Record<string, number> = { '⏬': 1, '🔽': 1, '🔼': 2, '⏫': 3, '🔺': 4 };

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

export function formatAt(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseRepeat(s: string): Repeat | null {
  const m = /^every\s+(?:(\d+)\s+)?(day|week|month|year|weekday)s?(?:\s+on\s+([a-z ,]+))?$/i.exec(s.trim());
  if (!m) return null;
  const every = m[1] ? Math.max(1, Number(m[1])) : 1;
  const unit = m[2]!.toLowerCase();
  if (unit === 'weekday') return { every: 1, unit: 'week', weekdays: [1, 2, 3, 4, 5] };
  const r: Repeat = { every, unit: unit as RepeatUnit };
  if (m[3] && unit === 'week') {
    const days = m[3]
      .toLowerCase()
      .split(/[\s,]+|and/)
      .map((w) => WEEKDAYS_EN.indexOf(w))
      .filter((i) => i >= 0);
    if (days.length) r.weekdays = [...new Set(days)].sort();
  }
  return r;
}

export function formatRepeat(r: Repeat): string {
  if (r.unit === 'week' && r.weekdays?.join() === '1,2,3,4,5' && r.every === 1) return 'every weekday';
  const unit = r.every === 1 ? r.unit : `${r.every} ${r.unit}s`;
  const on = r.unit === 'week' && r.weekdays?.length
    ? ` on ${r.weekdays.map((d) => WEEKDAYS_EN[d]![0]!.toUpperCase() + WEEKDAYS_EN[d]!.slice(1)).join(', ')}`
    : '';
  return `every ${unit}${on}`;
}

/** Lê os lembretes de uma nota. Tarefas sem data não são lembretes. */
export function parseReminders(path: string, content: string): Reminder[] {
  const out: Reminder[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const m = TASK_RE.exec(raw);
    if (!m) continue;
    const body = m[4]!;
    let at: number | null = null;
    const a = AT_RE.exec(body);
    if (a) {
      at = new Date(+a[1]!, +a[2]! - 1, +a[3]!, a[4] ? +a[4] : DEFAULT_HOUR, a[5] ? +a[5] : 0).getTime();
    } else {
      const d = DUE_RE.exec(body);
      if (d) at = new Date(+d[1]!, +d[2]! - 1, +d[3]!, DEFAULT_HOUR, 0).getTime();
    }
    if (at === null || Number.isNaN(at)) continue;
    const rep = REPEAT_RE.exec(body);
    let priority = 0;
    for (const [e, p] of Object.entries(PRIORITY)) if (body.includes(e)) priority = Math.max(priority, p);
    const text = body
      .replace(AT_RE, '')
      .replace(REPEAT_RE, '')
      .replace(/[📅⏳🛫✅➕]\s*\d{4}-\d{2}-\d{2}/gu, '')
      .replace(/[⏫🔼🔽🔺⏬]/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    out.push({
      key: hashHex(`${path}\0${text}`),
      path,
      line: i,
      raw,
      text: text || '(sem título)',
      at,
      done: m[2] !== ' ',
      repeat: rep ? parseRepeat(rep[1]!) : null,
      priority,
    });
  }
  return out;
}

function addUnits(at: number, r: Repeat, n: number): number {
  const d = new Date(at);
  if (r.unit === 'day') d.setDate(d.getDate() + n * r.every);
  else if (r.unit === 'week') d.setDate(d.getDate() + 7 * n * r.every);
  else {
    const day = d.getDate();
    d.setDate(1);
    if (r.unit === 'month') d.setMonth(d.getMonth() + n * r.every);
    else d.setFullYear(d.getFullYear() + n * r.every);
    // 31/01 + 1 mês = 28 ou 29/02
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d.getTime();
}

/** Próxima ocorrência de um lembrete repetido, estritamente depois de `after`. */
export function nextOccurrence(at: number, r: Repeat, after: number): number {
  if (r.unit === 'week' && r.weekdays?.length) {
    // anda dia a dia, no mesmo horário, até cair num dia permitido;
    // com every > 1, só valem as semanas múltiplas de `every` a partir da original
    const start = new Date(at);
    const weekOf = (t: number) => Math.floor((t - start.getTime() + start.getDay() * 864e5) / (7 * 864e5));
    const d = new Date(at);
    for (let i = 0; i < 366 * 7 * r.every; i++) {
      d.setDate(d.getDate() + 1);
      const t = d.getTime();
      if (t <= after) continue;
      if (r.weekdays.includes(d.getDay()) && weekOf(t) % r.every === 0) return t;
    }
  }
  let n = 1;
  let next = addUnits(at, r, n);
  while (next <= after) next = addUnits(at, r, ++n);
  return next;
}

function findLine(lines: string[], r: Reminder): number {
  if (lines[r.line] === r.raw) return r.line;
  const i = lines.indexOf(r.raw);
  if (i >= 0) return i;
  throw new Error('Esse lembrete mudou na nota. Abra a lista de novo.');
}

function replaceAt(body: string, at: number): string {
  const token = `(@${formatAt(at)})`;
  return AT_RE.test(body) ? body.replace(AT_RE, token) : `${body.trimEnd()} ${token}`;
}

/**
 * Marca como feito. Um lembrete repetido não é riscado: avança para a próxima
 * ocorrência depois de agora, e a mesma linha segue valendo.
 */
export function completeIn(content: string, r: Reminder, now = Date.now()): string {
  const lines = content.split('\n');
  const i = findLine(lines, r);
  const m = TASK_RE.exec(lines[i]!)!;
  if (r.repeat) lines[i] = m[1]! + ' ' + m[3]! + replaceAt(m[4]!, nextOccurrence(r.at, r.repeat, Math.max(now, r.at)));
  else lines[i] = m[1]! + 'x' + m[3]! + m[4]!;
  return lines.join('\n');
}

/** Muda o horário (adiar). Linhas só com 📅 ganham o (@...), que tem precedência. */
export function rescheduleIn(content: string, r: Reminder, at: number): string {
  const lines = content.split('\n');
  const i = findLine(lines, r);
  const m = TASK_RE.exec(lines[i]!)!;
  lines[i] = m[1]! + ' ' + m[3]! + replaceAt(m[4]!, at);
  return lines.join('\n');
}

export function reminderLine(text: string, at: number, repeat?: Repeat | null): string {
  return `- [ ] ${text.trim()}${repeat ? ` 🔁 ${formatRepeat(repeat)}` : ''} (@${formatAt(at)})`;
}

/** Acrescenta um lembrete ao fim de uma nota, sem colar na linha anterior. */
export function appendReminder(content: string, line: string): string {
  if (!content.trim()) return `# Lembretes\n\n${line}\n`;
  return content.replace(/\n*$/, '\n') + line + '\n';
}

// ---------------------------------------------------------------------------
// Quando avisar

/** Lembretes perdidos com o app fechado só avisam se forem desta janela para cá. */
export const CATCH_UP_MS = 12 * 3600_000;

/** Identidade de um aviso: o mesmo lembrete adiado gera um aviso novo. */
export const firedKey = (r: Pick<Reminder, 'key' | 'at'>): string => `${r.key}@${r.at}`;

/**
 * Lembretes que devem avisar agora e quando acordar de novo.
 * `fired` são os avisos que este aparelho já mostrou.
 */
export function plan(
  reminders: Reminder[],
  now: number,
  fired: ReadonlySet<string>,
): { due: Reminder[]; nextAt: number | null } {
  const due: Reminder[] = [];
  let nextAt: number | null = null;
  for (const r of reminders) {
    if (r.done) continue;
    if (r.at <= now) {
      if (now - r.at <= CATCH_UP_MS && !fired.has(firedKey(r))) due.push(r);
    } else if (nextAt === null || r.at < nextAt) {
      nextAt = r.at;
    }
  }
  due.sort((a, b) => a.at - b.at);
  return { due, nextAt };
}

export type Bucket = 'atrasados' | 'hoje' | 'amanha' | 'semana' | 'depois' | 'feitos';

export function bucketOf(r: Reminder, now: number): Bucket {
  if (r.done) return 'feitos';
  if (r.at < now) return 'atrasados';
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const diff = Math.round((day(r.at) - day(now)) / 864e5);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'amanha';
  if (diff < 7) return 'semana';
  return 'depois';
}

/** Id numérico (32 bits, positivo) para o agendador do sistema. */
export function notificationId(r: Pick<Reminder, 'key' | 'at'>): number {
  return parseInt(hashHex(firedKey(r)).slice(0, 7), 16);
}
