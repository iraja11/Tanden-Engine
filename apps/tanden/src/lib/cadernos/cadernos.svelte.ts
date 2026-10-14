import { fightIndex, safeName, worldIndex, type Game, type World } from '@tanden/core';
import { engine } from '../engine.svelte';

// Estado dos cadernos (luta e world building). Tudo vem das notas do cofre:
// os índices são refeitos quando uma nota muda, aqui ou em outro aparelho.

class Cadernos {
  /** sobe a cada mudança de nota; as telas derivam os índices dele */
  rev = $state(0);
  games = $state<Game[]>([]);
  worlds = $state<World[]>([]);
  message = $state('');
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'sync.finished') this.schedule();
    });
    this.rebuild();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild();
    }, 120);
  }

  rebuild(): void {
    const notes = engine.vault.list().map((path) => ({ path, text: engine.vault.read(path) }));
    this.games = fightIndex(notes);
    this.worlds = worldIndex(notes);
    this.rev++;
  }

  read(path: string): string {
    return engine.vault.has(path) ? engine.vault.read(path) : '';
  }

  /** Lê a versão mais nova da nota, aplica a mudança e grava (o merge cuida do resto). */
  update(path: string, fn: (text: string) => string): void {
    const cur = this.read(path);
    const next = fn(cur);
    if (next === cur) return;
    engine.writeNote(path, next);
    engine.pulse('editor', 'in');
    this.rebuild();
  }

  /** Digitação contínua (texto de uma ficha): grava já e sincroniza depois de uma pausa. */
  typed(path: string, text: string): void {
    if (!engine.vault.has(path) || engine.vault.read(path) === text) return;
    engine.vault.write(path, text);
    engine.boardEdited();
  }

  /** Cria uma nota num caminho livre (acrescenta " 2", " 3" se o nome já existir). */
  create(folder: string, name: string, text: (finalName: string) => string): string {
    const base = safeName(name);
    let n = 1;
    let final = base;
    const at = (x: string) => `${folder ? `${folder}/` : ''}${x}.md`;
    while (engine.vault.has(at(final))) final = `${base} ${++n}`;
    engine.writeNote(at(final), text(final));
    engine.pulse('notes', 'in');
    this.rebuild();
    return at(final);
  }

  exists(path: string): boolean {
    return engine.vault.has(path);
  }

  say(msg: string): void {
    this.message = msg;
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => (this.message = ''), 5000);
  }
}

export const cadernos = new Cadernos();
