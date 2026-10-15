import {
  CLIP_UNREAD, DB_TEMPLATES, LIFE_TEMPLATE, addDays, appendReminder, bumpGoal, createDatabase, habitRowText, instantiate,
  lifeSnapshot, parseCapture, setProp, setTaskDone, taskRowText, today, weeklyReview,
  type LifeKind, type LifeSnapshot, type LifeTask,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { bases } from '../bases/bases.svelte';
import { reminders } from '../reminders.svelte';
import { notes } from '../editor/notes.svelte';
import { files } from '../files/files.svelte';
import { feel } from '../feel.svelte';
import { sound } from '../sound.svelte';

/*
 * Tela Hoje: o painel de vida em cima dos bancos e das tarefas do cofre.
 * Não guarda nada próprio; cada ação grava na nota de onde o dado veio.
 */

/** Notas sem banco caem aqui (uma lista de "- [ ]", que o Obsidian também lê). */
export const INBOX_NOTE = 'Caixa de entrada.md';

export interface ReadItem {
  path: string;
  title: string;
  site: string;
  created: string;
}

class Vida {
  /** relógio da tela, avança a cada minuto (vira o dia sozinho) */
  now = $state(new Date());
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Foto do momento, refeita quando o índice dos bancos muda. */
  get snap(): LifeSnapshot {
    void bases.rev;
    return lifeSnapshot(bases.index, (p) => bases.read(p), this.now);
  }

  /** Páginas salvas da web que ainda estão "Para ler". */
  get reading(): ReadItem[] {
    void bases.rev;
    return bases.index.notes
      .filter((n) => n.props.status === CLIP_UNREAD && typeof n.props.source === 'string')
      .map((n) => ({ path: n.path, title: typeof n.props.title === 'string' ? n.props.title : n.name, site: typeof n.props.site === 'string' ? n.props.site : '', created: typeof n.props.created === 'string' ? n.props.created : '' }))
      .sort((a, b) => b.created.localeCompare(a.created));
  }

  tick(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const n = new Date();
      if (n.getMinutes() !== this.now.getMinutes()) this.now = n;
    }, 15_000);
  }

  private write(path: string, fn: (t: string) => string): void {
    bases.update(path, fn, true);
  }

  /** Modelo de linha ligado ao banco (Modelos/<Banco>/...), se houver. */
  private template(kind: LifeKind): string | null {
    const db = this.snap.dbs[kind];
    if (!db) return null;
    const link = typeof db.def.template === 'string' ? db.def.template.replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '') : null;
    const t = (link && bases.templates.find((x) => x.path?.replace(/\.md$/, '') === link)) || bases.templatesFor(db.note)[0];
    return t?.text ?? null;
  }

  // ---------------------------------------------------------------- tarefas

  setDone(t: LifeTask, done: boolean): void {
    feel.local(() => this.write(t.path, (text) => setTaskDone(text, t, done, this.snap.dbs, new Date())));
    sound.play(done ? 'complete' : 'tick');
    if (t.reminder) reminders.scan();
  }

  /** Muda o prazo de uma tarefa do banco (adiar para amanhã, por exemplo). */
  setDue(t: LifeTask, day: string | null): void {
    if (t.source !== 'banco') return;
    feel.local(() => this.write(t.path, (text) => setProp(text, 'prazo', day)));
    sound.play('tick');
  }

  /**
   * Captura rápida. Com hora ("sexta 18h"), vira lembrete com aviso; sem hora,
   * vira tarefa no banco de tarefas (ou na Caixa de entrada, sem banco).
   */
  capture(input: string): string | null {
    const c = parseCapture(input, new Date());
    if (!c) return null;
    if (c.reminder) {
      return reminders.add(input.replace(/\s*!{1,3}\s*$/, '')) ? 'lembrete' : null;
    }
    const db = this.snap.dbs.tarefas;
    if (db) {
      const path = bases.freePath(db.folder, c.title);
      const text = taskRowText(db, c, this.template('tarefas'), new Date());
      feel.local(() => engine.writeNote(path, text));
      bases.rebuild();
    } else {
      const cur = bases.read(INBOX_NOTE);
      const line = `- [ ] ${c.title}${c.priority >= 3 ? ' ⏫' : ''}${c.due ? ` 📅 ${c.due}` : ''}`;
      feel.local(() => engine.writeNote(INBOX_NOTE, cur.trim() ? appendReminder(cur, line) : `# Caixa de entrada\n\n${line}\n`));
      bases.rebuild();
    }
    sound.play('create');
    engine.pulse('notes', 'in');
    return 'tarefa';
  }

  // ---------------------------------------------------------------- hábitos

  toggleHabit(key: string, day: string): void {
    const s = this.snap;
    const db = s.dbs.habitos;
    if (!db) return;
    const row = s.habitRows.get(day);
    const now = new Date();
    feel.local(() => {
      if (row) {
        this.write(row, (t) => {
          const on = /^(true|x|sim|yes|1)$/i.test(String(bases.index.byPath.get(row)?.props[key] ?? ''));
          return setProp(t, key, on ? 'false' : 'true');
        });
      } else {
        // o nome não é só a data, para não confundir com a nota do diário
        const path = bases.freePath(db.folder, `${day} hábitos`);
        engine.writeNote(path, setProp(habitRowText(db, day, this.template('habitos'), now), key, 'true'));
        bases.rebuild();
      }
    });
    sound.play('complete');
  }

  /**
   * Marca um hábito como feito no dia, se o banco tiver uma caixa com um destes
   * nomes (sem acento, sem maiúscula). Já marcado ou sem banco: não faz nada.
   */
  markHabit(names: string[], day: string): void {
    const s = this.snap;
    if (!s.dbs.habitos) return;
    const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const want = new Set(names.map(fold));
    const h = s.habits.find((x) => want.has(fold(x.key)) || want.has(fold(x.label)));
    if (!h) return;
    const row = s.habitRows.get(day);
    if (row && /^(true|x|sim|yes|1)$/i.test(String(bases.index.byPath.get(row)?.props[h.key] ?? ''))) return;
    this.toggleHabit(h.key, day);
  }

  // ---------------------------------------------------------------- metas

  bump(path: string, delta: number): void {
    feel.local(() => this.write(path, (t) => bumpGoal(t, delta)));
    sound.play(delta > 0 ? 'complete' : 'tick');
  }

  // ---------------------------------------------------------------- diário

  /** Nota do dia: linha do banco Diário (com o modelo dele), ou Diário/AAAA-MM-DD. */
  dailyPath(day = today(new Date()), s: LifeSnapshot = this.snap): string | null {
    const db = s.dbs.diario;
    if (!db) return engine.notes.find((p) => p === `Diário/${day}.md`) ?? null;
    return engine.notes.find((p) => p.startsWith(`${db.folder}/`) && (p.endsWith(`/${day}.md`) || bases.index.byPath.get(p)?.props.data === day)) ?? null;
  }

  openDaily(): string {
    const day = today(new Date());
    const db = this.snap.dbs.diario;
    if (!db) {
      notes.daily(0);
      return engine.active ?? '';
    }
    let path = this.dailyPath(day);
    if (!path) {
      path = `${db.folder}/${day}.md`;
      const tpl = this.template('diario');
      const text = setProp(tpl ? instantiate(tpl, day, new Date()) : `# ${day}\n\n`, 'data', day);
      feel.local(() => engine.writeNote(path!, text));
      bases.rebuild();
      sound.play('create');
    }
    engine.open(path);
    return path;
  }

  setMood(value: string): void {
    const path = this.dailyPath() ?? this.openDaily();
    if (!path) return;
    feel.local(() => this.write(path, (t) => setProp(t, 'humor', value)));
    sound.play('tick');
  }

  // ---------------------------------------------------------------- sistema

  missing(): LifeKind[] {
    const dbs = this.snap.dbs;
    return (Object.keys(LIFE_TEMPLATE) as LifeKind[]).filter((k) => !dbs[k]);
  }

  /** Cria os bancos que faltam (Tarefas, Projetos, Hábitos, Metas, Diário), sem linhas de exemplo. */
  setup(kinds = this.missing()): string[] {
    const made: string[] = [];
    const now = new Date();
    feel.local(() => {
      for (const k of kinds) {
        const tpl = DB_TEMPLATES.find((t) => t.id === LIFE_TEMPLATE[k].id);
        if (!tpl) continue;
        const notePath = bases.freePath('Bancos', tpl.name);
        const name = notePath.split('/').pop()!.replace(/\.md$/, '');
        const { note, files: rows } = createDatabase(name, 'Bancos', { ...tpl, samples: [] }, now);
        engine.writeNote(notePath, note);
        for (const f of rows) if (!engine.vault.has(f.path)) engine.writeNote(f.path, f.text);
        made.push(notePath);
      }
    });
    if (made.length) {
      sound.play('create');
      engine.pulse('notes', 'in');
    }
    bases.rebuild();
    return made;
  }

  /** Gera (ou abre) a revisão desta semana em Revisões/. */
  review(): string {
    const r = weeklyReview(this.snap);
    if (!engine.vault.has(r.path)) {
      feel.local(() => engine.writeNote(r.path, r.text));
      sound.play('create');
      files.say(`Revisão da semana criada em ${r.path}.`, { path: r.path });
    }
    engine.open(r.path);
    return r.path;
  }

  markRead(path: string): void {
    feel.local(() => this.write(path, (t) => setProp(t, 'status', 'Lido')));
    sound.play('complete');
  }
}

export const vida = new Vida();

/** "hoje", "amanhã", "ontem", "seg 19/10". */
export function dayLabel(day: string, ref: string): string {
  if (day === ref) return 'hoje';
  if (day === addDays(ref, 1)) return 'amanhã';
  if (day === addDays(ref, -1)) return 'ontem';
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const wd = dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${wd} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

