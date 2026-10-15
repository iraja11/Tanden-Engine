import { PAGE_TEMPLATES, TEMPLATES_DIR, VaultIndex, ensureBlockId, instantiate, markdownToFragment, resolveLink, retargetLinks, sectionRange, type Backref } from '@tanden/core';
import { engine } from '../engine.svelte';
import { files } from '../files/files.svelte';
import { editorBridge } from '../files/editor-bridge';
import { fold, noteName, type EditorHost } from './host';
import { isoDate } from './slash';
import { versions } from './versions.svelte';

/*
 * Ações sobre notas (renomear com links, apagar, duplicar, mover, nota do dia),
 * índice de links (backlinks e tags) e o estado das telas do editor.
 */

export type Backlink = Backref;

const FAV_KEY = 'tanden.favoritas';
const RECENT_KEY = 'tanden.recentes';
const PREVIEW_KEY = 'tanden.previa';
const ASIDE_KEY = 'tanden.painel';

const load = <T>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // modo privado: só não lembra
  }
};

const sanitize = (html: string): string => {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach((e) => e.remove());
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name) || (a.name === 'href' && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      el.setAttribute('data-href', decodeURIComponent(href.replace(/^tanden-link:/, '')));
      el.removeAttribute('href');
    }
  }
  return doc.body.innerHTML;
};

/**
 * [[links]] viram links clicáveis para o HTML das prévias e embeds; código
 * fica como está e os ^ids de bloco somem, como na leitura do Obsidian.
 */
function wikiToMarkdown(md: string): string {
  return md
    .split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[^\n]*$|`[^`\n]+`)/gm)
    .map((part, i) =>
      i % 2
        ? part
        : part
            .replace(/(^|\s)\^[A-Za-z0-9-]+[ \t]*$/gm, '$1')
            .replace(/(?<!!)\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, (_m, t: string, a: string) => `[${a}](tanden-link:${encodeURIComponent(t)})`)
            .replace(/(?<!!)\[\[([^\]\n]+)\]\]/g, (_m, t: string) => {
              const [file, ...sub] = t.split('#');
              const label = [file!.split('/').pop(), ...sub].filter(Boolean).join(' › ');
              return `[${label}](tanden-link:${encodeURIComponent(t)})`;
            }),
    )
    .join('');
}

class Notes {
  /** sobe a cada mudança em qualquer nota (o índice refaz sob demanda) */
  rev = $state(0);
  favorites = $state<string[]>(load(FAV_KEY, []));
  recent = $state<string[]>(load(RECENT_KEY, []));
  /** prévia ao vivo (false: Markdown cru, "modo código-fonte") */
  preview = $state<boolean>(load(PREVIEW_KEY, true));
  /** painel lateral da nota: sumário, conexões ou fechado */
  aside = $state<'sumario' | 'conexoes' | null>(load(ASIDE_KEY, null));
  palette = $state<{ mode: 'tudo' | 'comandos' | 'busca'; seq: number } | null>(null);
  history = $state<string | null>(null);
  clip = $state(false);
  /** título para rolar depois de abrir uma nota por [[nota#título]] */
  pendingHeading: string | null = null;
  /** aba do painel da esquerda */
  sidebar = $state<'paginas' | 'busca' | 'tags'>('paginas');
  /** pedido de busca vindo de outra tela (clique numa #tag, por exemplo) */
  search = $state<{ q: string; seq: number } | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    engine.bus.on('*', (e) => {
      if (e.type === 'note.changed') versions.touch(e.path);
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'note.deleted') {
        this.dirty.add(e.path);
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.rev++, 600);
      }
      if (e.type === 'note.deleted') {
        this.favorites = this.favorites.filter((p) => p !== e.path);
        this.recent = this.recent.filter((p) => p !== e.path);
      }
    });
  }

  setPreview(on: boolean): void {
    this.preview = on;
    save(PREVIEW_KEY, on);
  }

  setAside(v: 'sumario' | 'conexoes' | null): void {
    this.aside = v;
    save(ASIDE_KEY, v);
  }

  openPalette(mode: 'tudo' | 'comandos' | 'busca' = 'tudo'): void {
    this.palette = { mode, seq: (this.palette?.seq ?? 0) + 1 };
  }

  visited(path: string): void {
    this.recent = [path, ...this.recent.filter((p) => p !== path)].slice(0, 30);
    save(RECENT_KEY, this.recent);
  }

  toggleFavorite(path: string): void {
    this.favorites = this.favorites.includes(path) ? this.favorites.filter((p) => p !== path) : [...this.favorites, path];
    save(FAV_KEY, this.favorites);
  }

  /* ------------------------------------------------------ índice */

  /**
   * O índice do cofre (links, backlinks, tags, apelidos, blocos), o mesmo para
   * todas as telas. Só as notas cujo texto mudou são relidas.
   */
  readonly vix = new VaultIndex();
  private synced: { notes: readonly string[]; files: readonly string[] } | null = null;
  /** notas mudadas desde a última consulta (o índice relê só elas) */
  private dirty = new Set<string>();

  get brain(): VaultIndex {
    const s = this.synced;
    const read = (p: string) => (engine.vault.has(p) ? engine.vault.read(p) : null);
    if (!s || s.notes !== engine.notes) {
      this.vix.sync(engine.notes, read);
      this.dirty.clear();
    } else if (this.dirty.size) {
      for (const p of this.dirty) {
        const t = read(p);
        if (t === null) this.vix.delete(p);
        else this.vix.set(p, t);
      }
      this.dirty.clear();
    }
    if (!s || s.files !== files.list) this.vix.setFiles(files.list);
    this.synced = { notes: engine.notes, files: files.list };
    return this.vix;
  }

  tags(): string[] {
    return this.brain.tags().map((t) => t.tag);
  }

  outgoing(path: string): string[] {
    return this.brain.outgoing(path);
  }

  backlinks(path: string): Backlink[] {
    return this.brain.backlinks(path);
  }

  /** notas que citam o nome (ou um apelido) desta sem link (para virar link com um clique) */
  unlinked(path: string): Backlink[] {
    return this.brain.unlinkedMentions(path);
  }

  /** [[links]] desta nota para notas que ainda não existem */
  missing(path: string): string[] {
    const ix = this.brain;
    const out = new Set<string>();
    for (const l of ix.scan(path)?.links ?? []) {
      if (!l.target || ix.resolve(l.target)) continue;
      if (/\.[a-z0-9]{1,5}$/i.test(l.target) && !/\.md$/i.test(l.target)) continue;
      out.add(l.target.replace(/\.md$/i, ''));
    }
    return [...out];
  }

  /** Transforma as menções sem link (nome ou apelido) de uma nota em [[link]]. */
  linkMentions(inPath: string, target: string): void {
    const name = noteName(target);
    const words = [name, ...this.brain.aliases(target)].filter((w) => w.length >= 3).sort((a, b) => b.length - a.length);
    const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${words.map(esc).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    // links, código e endereços ficam intactos
    const keep = /(!?\[\[[^\]\n]*\]\]|!?\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`|https?:\/\/\S+)/;
    const text = engine.vault.read(inPath);
    const lines = text.split('\n');
    const body = this.brain.scan(inPath)?.bodyLine ?? 0;
    let inCode = false;
    const next = lines
      .map((l, i) => {
        if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
        if (inCode || i < body) return l;
        return l
          .split(keep)
          .map((part, k) => (k % 2 ? part : part.replace(re, (_m, pre: string, word: string) => `${pre}[[${name}${word === name ? '' : `|${word}`}]]`)))
          .join('');
      })
      .join('\n');
    if (next !== text) engine.writeNote(inPath, next);
  }

  /** Abre a busca do painel lateral já com um texto (ex.: "tag:#projeto"). */
  searchFor(q: string): void {
    this.search = { q, seq: (this.search?.seq ?? 0) + 1 };
    this.sidebar = 'busca';
  }

  /** Garante um ^id na linha `line` da nota e devolve o id (para [[nota#^id]]). */
  ensureBlock(target: string, line: number): string | null {
    const path = this.brain.resolve(target) ?? (target ? null : engine.active);
    if (!path || !engine.vault.has(path)) return null;
    const cur = engine.vault.read(path);
    const r = ensureBlockId(cur, line);
    if (!r.id) return null;
    if (r.text !== cur) engine.writeNote(path, r.text);
    return r.id;
  }

  /* ------------------------------------------------------ ações */

  private free(dir: string, name: string): string {
    const base = `${dir ? `${dir}/` : ''}${name.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sem título'}`;
    let p = `${base}.md`;
    let n = 1;
    while (engine.vault.has(p)) p = `${base} ${++n}.md`;
    return p;
  }

  /** Nova nota (opcionalmente numa pasta), aberta e com o foco no título. */
  create(dir = '', title = 'Sem título', text = ''): string {
    const path = this.free(dir, title);
    engine.writeNote(path, text);
    engine.open(path);
    engine.titleFocus = path;
    return path;
  }

  /** Cria sem abrir (subpáginas, [[link]] para nota nova). */
  createQuiet(title: string, text = ''): string {
    const slash = title.lastIndexOf('/');
    const path = this.free(slash >= 0 ? title.slice(0, slash) : '', slash >= 0 ? title.slice(slash + 1) : title);
    engine.writeNote(path, text);
    return path;
  }

  /**
   * Nota do dia em Diário/AAAA-MM-DD.md (o padrão do plugin Daily notes do
   * Obsidian), feita com o modelo "Nota diária" (o de Modelos/, se existir).
   * Com uma nota diária aberta, ontem/amanhã contam a partir dela.
   */
  daily(offset = 0): void {
    const d = new Date();
    const open = engine.active ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(noteName(engine.active)) : null;
    if (open && offset !== 0) d.setFullYear(Number(open[1]), Number(open[2]) - 1, Number(open[3]));
    d.setDate(d.getDate() + offset);
    const iso = isoDate(d);
    const existing = engine.notes.find((p) => noteName(p) === iso);
    if (existing) return engine.open(existing);
    const path = `Diário/${iso}.md`;
    const tpl = engine.vault.has(`${TEMPLATES_DIR}/Nota diária.md`) ? engine.vault.read(`${TEMPLATES_DIR}/Nota diária.md`) : PAGE_TEMPLATES.find((t) => t.name === 'Nota diária')?.text;
    const text = tpl ? instantiate(tpl, iso, d) : `# ${iso}\n\n- [ ] \n`;
    engine.writeNote(path, text);
    engine.open(path);
  }

  /**
   * Renomeia ou move. Os [[links]] e [](...md) das outras notas acompanham,
   * como no Obsidian. Devolve o caminho novo ou null se não deu.
   */
  async rename(from: string, to: string, opts: { quiet?: boolean } = {}): Promise<string | null> {
    to = to.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!to.toLowerCase().endsWith('.md')) to += '.md';
    if (to === from) return from;
    if (engine.vault.has(to) && to.toLowerCase() !== from.toLowerCase()) {
      files.say(`Já existe uma nota "${noteName(to)}" ali.`, { error: true });
      return null;
    }
    const ix = this.brain;
    // quais alvos de link, em cada nota, levavam à nota antiga (antes de mexer)
    const pointing = new Map<string, Set<string>>();
    for (const b of ix.backlinks(from)) {
      const set = new Set<string>();
      for (const l of ix.scan(b.path)?.links ?? []) if (l.target && ix.resolve(l.target) === from) set.add(l.target);
      pointing.set(b.path, set);
    }
    const newName = noteName(to);
    // o link curto continua valendo se o nome novo não colidir com outra nota
    const clash = engine.notes.some((p) => p !== from && p !== to && noteName(p).toLowerCase() === newName.toLowerCase());
    const newTarget = clash ? to.replace(/\.md$/, '') : newName;
    const wasActive = engine.active === from;
    await versions.moved(from, to);
    await engine.renameNote(from, to);
    let touched = 0;
    for (const [p0, targets] of pointing) {
      const p = p0 === from ? to : p0;
      if (!engine.vault.has(p)) continue;
      const text = engine.vault.read(p);
      const next = retargetLinks(text, (t) => targets.has(t), newTarget, to);
      if (next !== text) {
        engine.writeNote(p, next);
        touched++;
      }
    }
    // subpáginas (a pasta com o mesmo nome da nota, como no Notion) vão junto
    const oldDir = from.replace(/\.md$/, '');
    const newDir = to.replace(/\.md$/, '');
    const children = engine.notes.filter((p) => p.startsWith(`${oldDir}/`));
    for (const c of children) {
      const r = await this.rename(c, `${newDir}/${c.slice(oldDir.length + 1)}`, { quiet: true });
      if (r) touched++;
    }
    if (children.length) {
      // bancos que filtravam a pasta antiga
      const re = new RegExp(`(file\\.inFolder\\(\\s*["'])${oldDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=["'/])`, 'g');
      for (const p of engine.notes) {
        const text = engine.vault.read(p);
        if (!text.includes('inFolder')) continue;
        const next = text.replace(re, `$1${newDir}`);
        if (next !== text) engine.writeNote(p, next);
      }
    }
    this.favorites = this.favorites.map((p) => (p === from ? to : p));
    this.recent = this.recent.map((p) => (p === from ? to : p));
    save(FAV_KEY, this.favorites);
    save(RECENT_KEY, this.recent);
    if (wasActive) engine.open(to);
    if (touched && !opts.quiet) files.say(`Renomeada. Links atualizados em ${touched} ${touched === 1 ? 'nota' : 'notas'}.`);
    return to;
  }

  async remove(path: string): Promise<void> {
    const trashed = await engine.deleteNote(path);
    files.say(trashed ? `"${noteName(path)}" foi para a lixeira (${trashed}).` : `"${noteName(path)}" apagada.`, trashed ? { path: undefined } : {});
  }

  duplicate(path: string): string {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const p = this.free(dir, `${noteName(path)} (cópia)`);
    engine.writeNote(p, engine.vault.read(path));
    engine.open(p);
    return p;
  }

  folders(): string[] {
    const s = new Set<string>();
    for (const p of engine.notes) {
      const parts = p.split('/').slice(0, -1);
      for (let i = 1; i <= parts.length; i++) s.add(parts.slice(0, i).join('/'));
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /* ------------------------------------------------------ editor */

  /** Abre um [[link]]: nota (criando se não existir), título, arquivo ou site. */
  openLink(raw: string): void {
    const target = raw.split('|')[0]!.trim();
    if (/^(https?:|mailto:)/i.test(target) || /^www\./i.test(target)) {
      files.openLink(target.startsWith('www.') ? `https://${target}` : target);
      return;
    }
    const hash = target.indexOf('#');
    const file = hash < 0 ? target : target.slice(0, hash);
    const sub = hash < 0 ? '' : target.slice(hash + 1);
    if (!file && sub) return this.gotoHeading(sub);
    // apelidos (aliases:) também levam à nota
    const viaIndex = this.brain.resolve(file);
    const hit = viaIndex?.endsWith('.md') ? { path: viaIndex, page: null } : resolveLink(target, [...engine.notes, ...files.list]);
    if (hit) {
      if (hit.path.endsWith('.md')) {
        this.pendingHeading = sub || null;
        engine.open(hit.path);
        files.openPath(hit.path);
        if (sub) setTimeout(() => this.gotoHeading(sub), 120);
        return;
      }
      files.openPath(hit.path, hit.page);
      return;
    }
    if (/\.[a-z0-9]{2,5}$/i.test(file) && !/\.md$/i.test(file)) {
      files.say(`Não achei "${file}" no cofre.`, { error: true });
      return;
    }
    // nota que ainda não existe: cria, como no Obsidian
    const path = this.createQuiet(file, '');
    engine.open(path);
    files.openPath(path);
  }

  gotoHeading(sub: string): void {
    const text = engine.content;
    let n = sectionRange(text, sub)?.from ?? -1;
    if (n < 0) {
      const want = fold(sub.replace(/^\^/, '').split('#').pop()!);
      n = text.split('\n').findIndex((l) => fold(l).includes(want));
    }
    if (n >= 0) editorBridge.goto(n);
  }

  /** O que o editor precisa do app. */
  readonly host: EditorHost = {
    image: (t) => files.imageUrl(t),
    open: (t) => this.openLink(t),
    notes: () => engine.notes,
    tags: () => this.tags(),
    pickFiles: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = () => {
        if (input.files?.length) void files.importFiles(input.files, { attach: true });
      };
      input.click();
    },
    webClip: () => (this.clip = true),
    createNote: (title, text = '') => this.createQuiet(title, text),
    noteText: (target) => {
      const path = target.trim() ? this.brain.resolve(target) : engine.active;
      if (!path || !engine.vault.has(path)) return null;
      return engine.vault.read(path);
    },
    resolve: (target) => this.brain.resolve(target),
    aliases: () => this.brain.allAliases(),
    openTag: (tag) => this.searchFor(`tag:#${tag}`),
    ensureBlock: (target, line) => this.ensureBlock(target, line),
    render: (md) => sanitize(markdownToFragment(wikiToMarkdown(md))),
    current: () => engine.active,
  };
}

export const notes = new Notes();
