import {
  REMINDERS_NOTE,
  appendReminder,
  completeIn,
  firedKey,
  notificationId,
  parseQuickReminder,
  parseReminders,
  plan,
  reminderLine,
  rescheduleIn,
  CATCH_UP_MS,
  type Reminder,
  type Repeat,
} from '@tanden/core';
import { invoke } from '@tauri-apps/api/core';
import * as notif from '@tauri-apps/plugin-notification';
import * as autostart from '@tauri-apps/plugin-autostart';
import { engine } from './engine.svelte';
import { desktop } from './platform';
import { isTauri } from './storage-tauri';

// Lembretes: lê as tarefas com data de todas as notas e avisa na hora.
// - Computador: o app avisa enquanto roda (na bandeja, se a janela for fechada).
// - Android: cada lembrete é entregue ao agendador do sistema, que avisa mesmo
//   com o app fechado ou o celular reiniciado.
// - Web: avisa enquanto a aba estiver aberta.

const android = isTauri() && !desktop;
const ACTION_TYPE = 'lembrete';
const CHANNEL = 'lembretes';
/** quantos lembretes futuros ficam com o agendador do Android */
const SYSTEM_AHEAD = 60;
const SYSTEM_WINDOW_MS = 45 * 864e5;
const SNOOZE_MS = 10 * 60_000;

const KEY_FIRED = 'tanden.lembretes.avisados';
const KEY_SCHEDULED = 'tanden.lembretes.agendados';
const KEY_BACKGROUND = 'tanden.lembretes.segundoPlano';
const KEY_AUTOSTART_INIT = 'tanden.lembretes.inicioAutomatico';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: só perde a memória de avisos já mostrados */
  }
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayStart = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function whenLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const diff = Math.round((dayStart(at) - dayStart(now)) / 864e5);
  if (diff === 0) return `hoje ${hhmm(d)}`;
  if (diff === 1) return `amanhã ${hhmm(d)}`;
  if (diff === -1) return `ontem ${hhmm(d)}`;
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const year = d.getFullYear() !== new Date(now).getFullYear() ? `/${d.getFullYear()}` : '';
  return `${WD[d.getDay()]}, ${date}${year} ${hhmm(d)}`;
}

export function repeatLabel(r: Repeat): string {
  const n = r.every;
  if (r.unit === 'week' && r.weekdays?.length) {
    if (r.weekdays.join() === '1,2,3,4,5' && n === 1) return 'dias úteis';
    const days = r.weekdays.map((d) => WD[d]).join(', ');
    return n === 1 ? `toda ${days}` : `a cada ${n} semanas (${days})`;
  }
  const names = { day: ['todo dia', 'dias'], week: ['toda semana', 'semanas'], month: ['todo mês', 'meses'], year: ['todo ano', 'anos'] };
  return n === 1 ? names[r.unit][0]! : `a cada ${n} ${names[r.unit][1]}`;
}

class ReminderCenter {
  items = $state<Reminder[]>([]);
  now = $state(Date.now());
  /** notificações bloqueadas pelo sistema (Android 13+ ou navegador) */
  blocked = $state(false);
  /** computador: fica na bandeja ao fechar a janela */
  background = $state(load(KEY_BACKGROUND, true));
  /** a bandeja existe neste sistema? sem ela, fechar a janela encerra o app */
  trayOk = $state(true);
  autostart = $state(false);
  /** sobe a cada pedido para mostrar a tela de lembretes (clique num aviso) */
  openRequests = $state(0);
  error = $state('');

  private fired = new Set<string>(load<string[]>(KEY_FIRED, []));
  /** Android: id da notificação agendada → aviso que ela representa */
  private scheduled = load<Record<string, { k: string; at: number }>>(KEY_SCHEDULED, {});
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  get pending(): Reminder[] {
    return this.items.filter((r) => !r.done);
  }
  /** atrasados + de hoje, para o selo no menu */
  get attention(): number {
    const end = dayStart(this.now) + 864e5;
    return this.items.filter((r) => !r.done && r.at < end).length;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.scan();
    engine.bus.on('note.changed', () => this.scanSoon());
    engine.bus.on('note.created', () => this.scanSoon());
    engine.bus.on('sync.finished', () => this.scanSoon());
    if (isTauri()) {
      try {
        await this.setupNative();
      } catch (e) {
        this.error = `Notificações indisponíveis: ${e}`;
      }
    } else if (typeof Notification !== 'undefined') {
      this.blocked = Notification.permission === 'denied';
    }
    this.tick();
  }

  private async setupNative(): Promise<void> {
    if (!(await notif.isPermissionGranted())) {
      this.blocked = (await notif.requestPermission()) !== 'granted';
    }
    if (android) {
      await notif.createChannel({
        id: CHANNEL,
        name: 'Lembretes',
        description: 'Avisos dos lembretes do Tanden',
        importance: notif.Importance.High,
        vibration: true,
        lights: true,
        lightColor: '#ff8a3d',
      });
    }
    await notif.registerActionTypes([
      { id: ACTION_TYPE, actions: [{ id: 'feito', title: 'Feito' }, { id: 'adiar', title: 'Adiar 10 min' }] },
    ]);
    await notif.onAction((a) => {
      const id = a.notification?.id;
      const r = this.items.find((x) => notificationId(x) === id);
      if (a.actionId === 'feito' && r) this.complete(r);
      else if (a.actionId === 'adiar' && r) this.snooze(r, Date.now() + SNOOZE_MS);
      else this.openRequests++;
    });
    if (desktop) {
      this.trayOk = await invoke<boolean>('background_set', { enabled: this.background });
      // primeira vez: abre com o sistema, minimizado, para os lembretes valerem desde o login
      if (!load(KEY_AUTOSTART_INIT, false)) {
        save(KEY_AUTOSTART_INIT, true);
        if (this.trayOk) await autostart.enable().catch(() => {});
      }
      this.autostart = await autostart.isEnabled().catch(() => false);
    }
    await this.syncSystemSchedule();
  }

  async setBackground(on: boolean): Promise<void> {
    this.background = on;
    save(KEY_BACKGROUND, on);
    if (desktop) this.trayOk = await invoke<boolean>('background_set', { enabled: on });
  }

  async setAutostart(on: boolean): Promise<void> {
    try {
      await (on ? autostart.enable() : autostart.disable());
      this.autostart = await autostart.isEnabled();
    } catch (e) {
      this.error = `Não consegui mudar o início automático: ${e}`;
    }
  }

  async askPermission(): Promise<void> {
    if (isTauri()) this.blocked = (await notif.requestPermission()) !== 'granted';
    else if (typeof Notification !== 'undefined') this.blocked = (await Notification.requestPermission()) !== 'granted';
  }

  private scanSoon(): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => {
      this.scan();
      this.tick();
      void this.syncSystemSchedule();
    }, 250);
  }

  scan(): void {
    if (!engine.vault) return;
    const all: Reminder[] = [];
    for (const path of engine.vault.list()) all.push(...parseReminders(path, engine.vault.read(path)));
    all.sort((a, b) => a.at - b.at || b.priority - a.priority);
    this.items = all;
  }

  /** Avisa o que venceu e marca o próximo despertar. */
  private tick(): void {
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();
    this.now = now;
    // Android: o que o sistema já avisou não avisa de novo pelo app
    for (const [id, s] of Object.entries(this.scheduled)) {
      if (s.at <= now) {
        this.fired.add(s.k);
        delete this.scheduled[id];
      }
    }
    const { due, nextAt } = plan(this.items, now, this.fired);
    for (const r of due) {
      this.fired.add(firedKey(r));
      this.show(r);
      engine.bus.emit({ type: 'reminder.fired', path: r.path, text: r.text, at: r.at });
    }
    if (due.length) {
      // esquece avisos antigos para a lista não crescer para sempre
      const keep = [...this.fired].filter((k) => now - Number(k.slice(k.lastIndexOf('@') + 1)) < 2 * CATCH_UP_MS);
      this.fired = new Set(keep);
      save(KEY_FIRED, keep);
      save(KEY_SCHEDULED, this.scheduled);
    }
    // acorda no próximo lembrete, mas confere ao menos a cada minuto (suspensão, relógio)
    const wait = nextAt === null ? 60_000 : Math.min(Math.max(nextAt - now, 250), 60_000);
    this.timer = setTimeout(() => this.tick(), wait);
  }

  private body(r: Reminder): string {
    const parts = [hhmm(new Date(r.at))];
    if (r.repeat) parts.push(repeatLabel(r.repeat));
    if (r.path !== REMINDERS_NOTE) parts.push(r.path.replace(/\.md$/, ''));
    return parts.join(' · ');
  }

  private show(r: Reminder): void {
    if (isTauri()) {
      notif.sendNotification({
        id: notificationId(r),
        title: r.text,
        body: this.body(r),
        actionTypeId: ACTION_TYPE,
        channelId: android ? CHANNEL : undefined,
        autoCancel: true,
      });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(r.text, { body: this.body(r), tag: firedKey(r), icon: '/tanden.svg' });
    }
  }

  /** Android: entrega os próximos lembretes ao agendador do sistema. */
  private async syncSystemSchedule(): Promise<void> {
    if (!android) return;
    const now = Date.now();
    const want = new Map<string, Reminder>();
    for (const r of this.items) {
      if (r.done || r.at <= now || r.at > now + SYSTEM_WINDOW_MS) continue;
      if (want.size >= SYSTEM_AHEAD) break;
      want.set(String(notificationId(r)), r);
    }
    const cancel = Object.keys(this.scheduled).filter((id) => !want.has(id)).map(Number);
    try {
      if (cancel.length) await notif.cancel(cancel);
      for (const id of cancel) delete this.scheduled[id];
      for (const [id, r] of want) {
        if (this.scheduled[id]) continue;
        notif.sendNotification({
          id: Number(id),
          title: r.text,
          body: this.body(r),
          actionTypeId: ACTION_TYPE,
          channelId: CHANNEL,
          autoCancel: true,
          schedule: notif.Schedule.at(new Date(r.at), false, true),
        });
        this.scheduled[id] = { k: firedKey(r), at: r.at };
      }
    } finally {
      save(KEY_SCHEDULED, this.scheduled);
    }
  }

  private change(r: Reminder, edit: (content: string) => string): boolean {
    try {
      engine.writeNote(r.path, edit(engine.vault.read(r.path)));
      this.error = '';
      this.scan();
      this.tick();
      void this.syncSystemSchedule();
      return true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.scan();
      return false;
    }
  }

  complete(r: Reminder): boolean {
    return this.change(r, (c) => completeIn(c, r));
  }

  /** Desmarcar um feito (só não repetidos chegam riscados). */
  reopen(r: Reminder): boolean {
    return this.change(r, (c) => {
      const lines = c.split('\n');
      if (lines[r.line] !== r.raw) throw new Error('Esse lembrete mudou na nota. Abra a lista de novo.');
      lines[r.line] = r.raw.replace(/\[[xX]\]/, '[ ]');
      return lines.join('\n');
    });
  }

  snooze(r: Reminder, at: number): boolean {
    return this.change(r, (c) => rescheduleIn(c, r, Math.round(at / 60_000) * 60_000));
  }

  /** Captura rápida: "amanhã 9h comprar pão". Acrescenta em Lembretes.md. */
  add(input: string): boolean {
    const q = parseQuickReminder(input);
    if (!q) {
      this.error = 'Diga quando: "amanhã 9h", "sexta 18h30", "em 20 min", "toda segunda 7h"...';
      return false;
    }
    const current = engine.vault.has(REMINDERS_NOTE) ? engine.vault.read(REMINDERS_NOTE) : '';
    engine.writeNote(REMINDERS_NOTE, appendReminder(current, reminderLine(q.text, q.at, q.repeat)));
    this.error = '';
    if (!isTauri() && typeof Notification !== 'undefined' && Notification.permission === 'default') void this.askPermission();
    this.scan();
    this.tick();
    void this.syncSystemSchedule();
    return true;
  }
}

export const reminders = new ReminderCenter();
