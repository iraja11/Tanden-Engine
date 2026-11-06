import {
  Rules, compileRules, emptyProgram, fairRng, fold, readMarkers, safeName, setCustomTypes, setProps, setSection, tableIndex, worldIndex, worldYear,
  fightIndex, getSection, type Game, type Program, type RollTable, type RuleHost, type SimResult, type World,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { feel } from '../feel.svelte';
import { sound } from '../sound.svelte';

// Estado dos cadernos (luta e world building). Tudo vem das notas do cofre:
// os índices são refeitos quando uma nota muda, aqui ou em outro aparelho.

class Cadernos {
  /** sobe a cada mudança de nota; as telas derivam os índices dele */
  rev = $state(0);
  games = $state<Game[]>([]);
  worlds = $state<World[]>([]);
  /** regras compiladas de cada mundo (pelo nome) */
  programs = $state<Map<string, Program>>(new Map());
  /** última simulação de cada mundo (o mapa pinta os territórios dela) */
  lastSim = $state<Map<string, SimResult>>(new Map());
  /** tabelas de rolagem do cofre: os bancos de texto das regras */
  tables: RollTable[] = [];
  message = $state('');
  private started = false;
  private customIds: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'note.deleted' || e.type === 'sync.finished') this.schedule();
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
    let worlds = worldIndex(notes);
    const programs = new Map<string, Program>();
    for (const w of worlds) programs.set(w.name, compileRules(w.scripts ?? []));
    const types = [...programs.values()].flatMap((p) => p.types);
    const before = JSON.stringify(this.customIds);
    setCustomTypes(types);
    this.customIds = types.map((t) => t.id);
    // tipo novo declarado por regra: reindexa para as fichas desse tipo acharem o tipo certo
    if (JSON.stringify(this.customIds) !== before) worlds = worldIndex(notes);
    this.worlds = worlds;
    this.programs = programs;
    this.tables = tableIndex(notes);
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
    feel.local(() => engine.writeNote(path, next));
    sound.play('tick');
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
    feel.local(() => engine.writeNote(at(final), text(final)));
    sound.play('create');
    engine.pulse('notes', 'in');
    this.rebuild();
    return at(final);
  }

  exists(path: string): boolean {
    return engine.vault.has(path);
  }

  program(w: World): Program {
    return this.programs.get(w.name) ?? emptyProgram();
  }

  /** Posição de cada ficha no primeiro mapa em que ela aparece (para distância()). */
  positions(w: World): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    const byName = new Map<string, string>();
    for (const e of w.entities) for (const n of [e.name, ...e.aliases]) byName.set(fold(n), e.path);
    for (const m of w.entities.filter((e) => e.type === 'mapa')) {
      for (const mk of readMarkers(this.read(m.path))) {
        const path = mk.target ? byName.get(fold(mk.target.split('/').pop()!)) : undefined;
        if (path && !out.has(path)) out.set(path, { x: mk.x, y: mk.y });
      }
    }
    return out;
  }

  /** Um interpretador das regras do mundo, pronto para ações e console. */
  rules(w: World, host: Partial<RuleHost> = {}): Rules {
    return new Rules(this.program(w), w, { rng: fairRng, year: worldYear(w), tables: this.tables, positions: this.positions(w), ...host });
  }

  /** Grava nas fichas o que as regras mudaram (e a crônica, na seção "Registro" de quem foi citado). */
  applyChanges(changes: Array<{ path: string; props: Record<string, string | string[] | null> }>, log: Array<{ path: string; line: string }> = []): void {
    for (const c of changes) if (this.exists(c.path)) this.update(c.path, (t) => setProps(t, c.props));
    for (const { path, line } of log) {
      if (!this.exists(path)) continue;
      this.update(path, (t) => {
        const cur = (getSection(t, 'Registro') ?? '').replace(/\s+$/, '');
        return setSection(t, 'Registro', `${cur ? `${cur}\n` : ''}- ${line}`);
      });
    }
  }

  say(msg: string): void {
    this.message = msg;
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => (this.message = ''), 5000);
  }
}

export const cadernos = new Cadernos();
