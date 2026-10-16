import {
  NoteIndex, PAGE_TEMPLATES, TEMPLATES_DIR, baseFolder, blankRow, createDatabase, findBaseBlocks, instantiate, isoDate,
  noteDir, noteName, noteRecord, parseBase, parseProps, propConfig, replaceBaseBlock, safeName, serializeBase, setProp, setProps, templateTarget,
  withDefaults, writeCell, DB_TEMPLATES, type BaseDef, type NoteRec, type PropConfig, type Value,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { notes } from '../editor/notes.svelte';
import { feel } from '../feel.svelte';
import { sound } from '../sound.svelte';

// Estado dos bancos de dados. Tudo vem das notas do cofre: o índice é refeito
// quando uma nota muda, aqui ou em outro aparelho, e as telas derivam dele.

export interface DbEntry {
  path: string;
  name: string;
  blocks: number;
}

export interface TemplateEntry {
  /** caminho no cofre, ou null para um modelo embutido ainda não salvo */
  path: string | null;
  name: string;
  text: string;
  /** banco ao qual o modelo pertence */
  target: string | null;
}

class Bases {
  rev = $state(0);
  index = $state.raw<NoteIndex>(new NoteIndex([]));
  databases = $state<DbEntry[]>([]);
  templates = $state<TemplateEntry[]>([]);
  /** nota aberta no painel lateral (peek) */
  peek = $state<string | null>(null);
  /** linha recém-criada: o painel abre com o cursor no título */
  fresh: string | null = null;
  /** pedido para abrir um banco na tela Bancos */
  goto = $state<{ path: string; seq: number } | null>(null);
  private seq = 0;
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private mtimes: Record<string, number> = {};

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'note.deleted') this.schedule();
      if (e.type === 'sync.finished') {
        // só refaz o índice (leitura de todo o cofre) se algo mudou de fato
        if (e.merged || e.external || e.written) {
          void this.loadTimes();
          this.schedule();
        }
      }
    });
    this.rebuild();
    void this.loadTimes();
  }

  private async loadTimes(): Promise<void> {
    try {
      const st = await engine.storage.stat?.();
      if (!st) return;
      this.mtimes = Object.fromEntries(Object.entries(st).filter(([p]) => p.endsWith('.md')).map(([p, [, ms]]) => [p, ms]));
      this.schedule();
    } catch {
      // sem datas de arquivo: as colunas de criação e edição ficam vazias
    }
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild();
    }, 120);
  }

  /** registro de cada nota, refeito só quando o texto (ou a data) muda */
  private recs = new Map<string, { text: string; mtime: number | undefined; rec: NoteRec }>();

  rebuild(): void {
    const recs: NoteRec[] = [];
    const dbs: DbEntry[] = [];
    const tpls: TemplateEntry[] = [];
    const ix = notes.brain;
    const seen = new Set<string>();
    for (const path of engine.vault.list()) {
      seen.add(path);
      const text = engine.vault.read(path);
      const mtime = this.mtimes[path];
      let hit = this.recs.get(path);
      if (!hit || hit.text !== text || hit.mtime !== mtime) {
        const scan = ix.text(path) === text ? ix.scan(path) ?? undefined : undefined;
        hit = { text, mtime, rec: noteRecord(path, text, mtime, scan) };
        this.recs.set(path, hit);
      }
      recs.push(hit.rec);
      if (text.includes('base')) {
        const n = findBaseBlocks(text).length;
        if (n) dbs.push({ path, name: noteName(path), blocks: n });
      }
      if (path.startsWith(`${TEMPLATES_DIR}/`)) tpls.push({ path, name: noteName(path), text, target: templateTarget(text) });
    }
    for (const p of [...this.recs.keys()]) if (!seen.has(p)) this.recs.delete(p);
    for (const b of PAGE_TEMPLATES) {
      if (!tpls.some((t) => t.path === `${TEMPLATES_DIR}/${b.name}.md`)) tpls.push({ path: null, name: b.name, text: b.text, target: null });
    }
    // [[links]] e relações resolvem como no editor (apelidos, caminhos parciais)
    this.index = new NoteIndex(recs, (t) => ix.resolve(t));
    this.databases = dbs.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.templates = tpls.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    this.rev++;
  }

  read(path: string): string {
    return engine.vault.has(path) ? engine.vault.read(path) : '';
  }

  exists(path: string): boolean {
    return engine.vault.has(path);
  }

  /** Lê a versão mais nova, aplica e grava (o merge cuida do resto). */
  update(path: string, fn: (text: string) => string, quiet = false): void {
    const cur = this.read(path);
    const next = fn(cur);
    if (next === cur) return;
    feel.local(() => engine.writeNote(path, next));
    if (!quiet) sound.play('tick');
    engine.pulse('editor', 'in');
    this.rebuild();
  }

  /** Digitação contínua (corpo no painel lateral): grava já e sincroniza depois. */
  typed(path: string, text: string): void {
    if (!engine.vault.has(path) || engine.vault.read(path) === text) return;
    engine.vault.write(path, text);
    if (engine.active === path) engine.content = text;
    engine.boardEdited();
  }

  /** Bloco base número `index` de uma nota, já lido. */
  block(notePath: string, index: number): { def: BaseDef; error: string | null; source: string } | null {
    void this.rev;
    const b = findBaseBlocks(this.read(notePath))[index];
    if (!b) return null;
    return { ...parseBase(b.source), source: b.source };
  }

  saveBlock(notePath: string, index: number, def: BaseDef): void {
    this.update(notePath, (t) => replaceBaseBlock(t, index, serializeBase(def)), true);
  }

  setCell(path: string, id: string, value: Value, cfg: PropConfig = {}): void {
    this.update(path, (t) => {
      let next = writeCell(t, id, value, cfg);
      if (next !== t && cfg.type !== 'edited') next = this.touch(next);
      return next;
    });
  }

  /** Marca a hora da edição se a nota já guarda "editado". */
  private touch(text: string): string {
    return /^editado:/m.test(text.split('\n---')[0] ?? '') ? setProp(text, 'editado', isoDate(new Date(), true)) : text;
  }

  /** Caminho livre: "Sem título", "Sem título 2"... */
  freePath(folder: string, name: string): string {
    const base = safeName(name);
    const at = (x: string) => `${folder ? `${folder}/` : ''}${x}.md`;
    let n = 1;
    let final = base;
    while (engine.vault.has(at(final))) final = `${base} ${++n}`;
    return at(final);
  }

  /** Pasta das linhas de um banco. */
  rowsFolder(def: BaseDef, notePath: string): string {
    return baseFolder(def) ?? `${noteDir(notePath) ? `${noteDir(notePath)}/` : ''}${noteName(notePath)}`;
  }

  /** Modelos de linha de um banco. */
  templatesFor(notePath: string): TemplateEntry[] {
    const name = noteName(notePath).toLowerCase();
    return this.templates.filter((t) => t.path && t.target && (t.target.toLowerCase() === name || t.target.toLowerCase() === notePath.replace(/\.md$/, '').toLowerCase()));
  }

  /** Cria uma linha (nota) no banco e devolve o caminho. */
  createRow(def: BaseDef, notePath: string, opts: { name?: string; defaults?: Record<string, string | string[]>; template?: TemplateEntry | null } = {}): string {
    const folder = this.rowsFolder(def, notePath);
    const path = this.freePath(folder, opts.name?.trim() || 'Sem título');
    const title = noteName(path);
    const tplLink = typeof def.template === 'string' ? def.template.replace(/^\[\[|\]\]$/g, '') : null;
    const tpl = opts.template === undefined ? (tplLink ? this.templates.find((t) => t.path && t.path.replace(/\.md$/, '') === tplLink.replace(/\.md$/, '')) : null) : opts.template;
    let text = tpl ? instantiate(tpl.text, title) : blankRow(title, {});
    text = withDefaults(text, opts.defaults ?? {});
    text = setProp(text, 'criado', isoDate(new Date(), true));
    feel.local(() => engine.writeNote(path, text));
    sound.play('create');
    engine.pulse('notes', 'in');
    this.rebuild();
    return path;
  }

  /** Arquiva (some das views; volta pelo filtro "arquivado"). */
  archive(path: string, on = true): void {
    this.update(path, (t) => setProp(t, 'arquivado', on ? 'true' : null));
    if (on && this.peek === path) this.peek = null;
  }

  /** Duplica uma linha com o mesmo topo e corpo. */
  duplicate(path: string): string {
    const text = this.read(path);
    const copy = this.freePath(noteDir(path), `${noteName(path)} (cópia)`);
    feel.local(() => engine.writeNote(copy, setProp(text, 'criado', isoDate(new Date(), true))));
    sound.play('create');
    this.rebuild();
    return copy;
  }

  /** Banco novo a partir de um modelo da galeria. */
  createDatabase(name: string, tplId: string, folder = 'Bancos'): string {
    const tpl = DB_TEMPLATES.find((t) => t.id === tplId) ?? DB_TEMPLATES[0]!;
    const notePath = this.freePath(folder, name || tpl.name);
    const finalName = noteName(notePath);
    const { note, files } = createDatabase(finalName, folder, tpl);
    feel.local(() => {
      engine.writeNote(notePath, note);
      for (const f of files) if (!engine.vault.has(f.path)) engine.writeNote(f.path, f.text);
    });
    sound.play('create');
    engine.pulse('notes', 'in');
    this.rebuild();
    return notePath;
  }

  /** Página nova (sub-página de `parent` quando dado), opcionalmente de um modelo. */
  newPage(parent: string | null, template?: TemplateEntry | null, name = 'Sem título'): string {
    const dir = parent ? parent.replace(/\.md$/, '') : '';
    const path = this.freePath(dir, name);
    const title = noteName(path);
    const text = template ? instantiate(template.text, title) : `# ${title}\n\n`;
    feel.local(() => engine.writeNote(path, text));
    sound.play('create');
    engine.pulse('notes', 'in');
    this.rebuild();
    return path;
  }

  /** Salva um modelo embutido em Modelos/ para a pessoa poder editar. */
  saveTemplate(t: TemplateEntry): string {
    if (t.path) return t.path;
    const path = `${TEMPLATES_DIR}/${t.name}.md`;
    if (!engine.vault.has(path)) feel.local(() => engine.writeNote(path, t.text));
    this.rebuild();
    return path;
  }

  /** Junta as propriedades de um topo (de um modelo) às da nota, sem trocar as que ela já tem; tags se somam. */
  mergeProps(text: string, head: string): string {
    const add = parseProps(head);
    const have = parseProps(text);
    const patch: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(add)) {
      if (!(k in have) || have[k] === '') patch[k] = v;
      else if ((k === 'tags' || k === 'aliases') && Array.isArray(v)) {
        const cur = Array.isArray(have[k]) ? (have[k] as string[]) : String(have[k]).split(/,\s*/).filter(Boolean);
        const merged = [...new Set([...cur, ...v])];
        if (merged.length !== cur.length) patch[k] = merged;
      }
    }
    return Object.keys(patch).length ? setProps(text, patch) : text;
  }

  /** Banco que contém uma nota (pela pasta), para tipar o painel de propriedades. */
  configFor(path: string): { def: BaseDef; notePath: string } | null {
    void this.rev;
    for (const db of this.databases) {
      const b = this.block(db.path, 0);
      if (!b) continue;
      const folder = this.rowsFolder(b.def, db.path);
      if (path.startsWith(`${folder}/`)) return { def: b.def, notePath: db.path };
    }
    return null;
  }

  private doneCache = new Map<string, boolean>();
  private doneRev = -1;
  /**
   * A linha já está concluída? (status num grupo "concluído", ou uma caixa
   * feito/concluído marcada). Datas de linhas concluídas não ficam vermelhas.
   */
  isDone(path: string, props: Record<string, string | string[]>): boolean {
    if (this.doneRev !== this.rev) {
      this.doneCache.clear();
      this.doneRev = this.rev;
    }
    const hit = this.doneCache.get(path);
    if (hit !== undefined) return hit;
    let done = false;
    const def = this.configFor(path)?.def;
    for (const [id, c] of Object.entries(def?.properties ?? {})) {
      if (c.type !== 'status') continue;
      const v = props[id.replace(/^note\./, '')];
      if (typeof v === 'string' && c.options?.some((o) => o.value === v && o.group === 'done')) done = true;
    }
    if (!done) {
      for (const [k, v] of Object.entries(props)) {
        const key = k.toLowerCase();
        if (['feito', 'concluído', 'concluido', 'done', 'completed'].includes(key) && v === 'true') done = true;
        if (['status', 'situação'].includes(key) && typeof v === 'string' && /^(feito|conclu[íi]d[oa]|done|pronto|lido|pago|entregue)$/i.test(v.trim())) done = true;
      }
    }
    this.doneCache.set(path, done);
    return done;
  }

  openDatabase(path: string): void {
    this.goto = { path, seq: ++this.seq };
  }
}

export const bases = new Bases();

/** Cores das opções, legíveis no tema escuro e no claro. */
export const OPTION_HEX: Record<string, string> = {
  gray: '#9b9a97', brown: '#a27763', orange: '#e0813a', yellow: '#d6a92b', green: '#4dab7e',
  blue: '#4a8fd9', purple: '#9a6dd7', pink: '#d0629f', red: '#e2574c',
};

const AUTO = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'red', 'brown', 'gray'];
/** Cor de um valor: a configurada, ou uma estável pelo texto. */
export function optionColor(cfg: PropConfig, value: string): string {
  const o = cfg.options?.find((x) => x.value === value);
  if (o?.color) return OPTION_HEX[o.color] ?? OPTION_HEX.gray!;
  let h = 0;
  for (const c of value) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return OPTION_HEX[AUTO[h % AUTO.length]!]!;
}

export { propConfig };
