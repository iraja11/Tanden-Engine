import { markdownToFragment, resolveLink } from '@tanden/core';
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

const LINK = /!?\[\[([^\]\n]+?)\]\]|\[[^\]\n]*\]\(([^)\s]+\.md)\)/g;
const TAG = /(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

export interface Backlink {
  path: string;
  /** trechos (linhas) que citam a nota */
  lines: Array<{ n: number; text: string }>;
}

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
  private index: { rev: number; links: Map<string, Set<string>>; tags: Map<string, number> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    engine.bus.on('*', (e) => {
      if (e.type === 'note.changed') versions.touch(e.path);
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'note.deleted') {
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

  private build() {
    if (this.index && this.index.rev === this.rev) return this.index;
    const links = new Map<string, Set<string>>();
    const tags = new Map<string, number>();
    const paths = engine.notes;
    const all = [...paths, ...files.list];
    for (const p of paths) {
      let text: string;
      try {
        text = engine.vault.read(p);
      } catch {
        continue;
      }
      const out = new Set<string>();
      for (const m of text.matchAll(LINK)) {
        const raw = (m[1] ?? decodeURIComponent(m[2]!)).split('|')[0]!;
        const hit = resolveLink(raw, all);
        if (hit && hit.path !== p) out.add(hit.path);
      }
      links.set(p, out);
      const fm = /^---\n([\s\S]*?)\n---/.exec(text);
      if (fm) {
        const t = /^tags?\s*:\s*(.*)$/m.exec(fm[1]!);
        if (t) {
          const inline = t[1]!.replace(/[[\]"']/g, '').split(/[,\s]+/).filter(Boolean);
          const list = inline.length ? inline : [...fm[1]!.slice(fm[1]!.indexOf(t[0]) + t[0].length).matchAll(/^\s+-\s+(.+)$/gm)].map((x) => x[1]!.trim());
          for (const tag of list) tags.set(tag.replace(/^#/, ''), (tags.get(tag.replace(/^#/, '')) ?? 0) + 1);
        }
      }
      const body = text.replace(/```[\s\S]*?```/g, '');
      for (const m of body.matchAll(TAG)) if (!/^\d+$/.test(m[1]!)) tags.set(m[1]!, (tags.get(m[1]!) ?? 0) + 1);
    }
    this.index = { rev: this.rev, links, tags };
    return this.index;
  }

  tags(): string[] {
    return [...this.build().tags].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }

  outgoing(path: string): string[] {
    return [...(this.build().links.get(path) ?? [])].sort();
  }

  backlinks(path: string): Backlink[] {
    const idx = this.build();
    const out: Backlink[] = [];
    const name = fold(noteName(path));
    for (const [from, to] of idx.links) {
      if (!to.has(path)) continue;
      const lines: Backlink['lines'] = [];
      engine.vault.read(from).split('\n').forEach((text, n) => {
        for (const m of text.matchAll(LINK)) {
          const raw = (m[1] ?? m[2]!).split(/[|#]/)[0]!;
          if (fold(noteName(raw)) === name) {
            lines.push({ n, text: text.trim() });
            break;
          }
        }
      });
      out.push({ path: from, lines: lines.slice(0, 4) });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
  }

  /** notas que citam o nome desta sem link (para virar link com um clique) */
  unlinked(path: string): Backlink[] {
    const name = noteName(path);
    if (name.length < 3) return [];
    const re = new RegExp(`(^|[^\\p{L}\\p{N}\\[|])(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}\\p{N}\\]])`, 'iu');
    const linked = new Set(this.backlinks(path).map((b) => b.path));
    const out: Backlink[] = [];
    for (const p of engine.notes) {
      if (p === path || linked.has(p)) continue;
      const lines: Backlink['lines'] = [];
      engine.vault.read(p).split('\n').forEach((text, n) => {
        if (lines.length < 3 && re.test(text) && !/^\s*(```|---)/.test(text)) lines.push({ n, text: text.trim() });
      });
      if (lines.length) out.push({ path: p, lines });
      if (out.length >= 30) break;
    }
    return out;
  }

  /** Transforma as menções sem link de uma nota em [[link]]. */
  linkMentions(inPath: string, target: string): void {
    const name = noteName(target);
    const re = new RegExp(`(^|[^\\p{L}\\p{N}\\[|])(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}\\p{N}\\]])`, 'giu');
    const text = engine.vault.read(inPath);
    let inCode = false;
    const next = text
      .split('\n')
      .map((l) => {
        if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
        return inCode ? l : l.replace(re, (_m, pre: string, word: string) => `${pre}[[${name}${word === name ? '' : `|${word}`}]]`);
      })
      .join('\n');
    if (next !== text) engine.writeNote(inPath, next);
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

  /** Nota do dia em Diário/AAAA-MM-DD.md (o padrão do plugin Daily notes do Obsidian). */
  daily(offset = 0): void {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const iso = isoDate(d);
    const existing = engine.notes.find((p) => noteName(p) === iso);
    if (existing) return engine.open(existing);
    const title = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    engine.writeNote(`Diário/${iso}.md`, `# ${title[0]!.toUpperCase()}${title.slice(1)}\n\n- [ ] \n`);
    engine.open(`Diário/${iso}.md`);
  }

  /**
   * Renomeia ou move. Os [[links]] e [](...md) das outras notas acompanham,
   * como no Obsidian. Devolve o caminho novo ou null se não deu.
   */
  async rename(from: string, to: string): Promise<string | null> {
    to = to.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!to.toLowerCase().endsWith('.md')) to += '.md';
    if (to === from) return from;
    if (engine.vault.has(to) && to.toLowerCase() !== from.toLowerCase()) {
      files.say(`Já existe uma nota "${noteName(to)}" ali.`, { error: true });
      return null;
    }
    const oldName = noteName(from);
    const newName = noteName(to);
    const others = engine.notes.filter((p) => p !== from);
    // o link curto continua valendo se o nome novo não colidir com outra nota
    const clash = others.some((p) => p !== to && noteName(p).toLowerCase() === newName.toLowerCase());
    const newTarget = clash ? to.replace(/\.md$/, '') : newName;
    const wasActive = engine.active === from;
    await versions.moved(from, to);
    await engine.renameNote(from, to);
    const all = [...engine.notes, ...files.list];
    let touched = 0;
    for (const p of engine.notes) {
      const text = engine.vault.read(p);
      let changed = false;
      const next = text
        .replace(/(!?)\[\[([^\]\n|#]+)(#[^\]\n|]*)?(\|[^\]\n]*)?\]\]/g, (m, bang: string, t: string, sub = '', alias = '') => {
          // o link apontava para a nota antiga?
          const tt = t.trim();
          const pointsOld = tt.toLowerCase() === oldName.toLowerCase() || tt.replace(/\.md$/i, '').toLowerCase() === from.replace(/\.md$/, '').toLowerCase();
          if (!pointsOld) return m;
          // um link curto que agora resolve para outra nota com o mesmo nome antigo fica como está
          const still = resolveLink(tt, all);
          if (still && still.path !== to && still.path.toLowerCase() !== from.toLowerCase()) return m;
          changed = true;
          return `${bang}[[${newTarget}${sub}${alias}]]`;
        })
        .replace(/\]\(([^)\s]+\.md)\)/g, (m, href: string) => {
          if (decodeURIComponent(href).replace(/^\.?\//, '').toLowerCase() !== from.toLowerCase()) return m;
          changed = true;
          return `](${encodeURI(to)})`;
        });
      if (changed) {
        engine.writeNote(p, next);
        touched++;
      }
    }
    this.favorites = this.favorites.map((p) => (p === from ? to : p));
    this.recent = this.recent.map((p) => (p === from ? to : p));
    save(FAV_KEY, this.favorites);
    save(RECENT_KEY, this.recent);
    if (wasActive) engine.open(to);
    if (touched) files.say(`Renomeada. Links atualizados em ${touched} ${touched === 1 ? 'nota' : 'notas'}.`);
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
    const hit = resolveLink(target, [...engine.notes, ...files.list]);
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
    const lines = text.split('\n');
    const want = fold(sub.replace(/^\^/, ''));
    let n = sub.startsWith('^')
      ? lines.findIndex((l) => new RegExp(`\\s\\^${sub.slice(1)}\\s*$`).test(l))
      : lines.findIndex((l) => /^#{1,6}\s/.test(l) && fold(l.replace(/^#+\s*/, '').trim()) === want);
    if (n < 0) n = lines.findIndex((l) => fold(l).includes(want));
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
      const hit = resolveLink(target, engine.notes);
      if (!hit) return null;
      try {
        return engine.vault.read(hit.path);
      } catch {
        return null;
      }
    },
    render: (md) => sanitize(markdownToFragment(md.replace(/\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g, (_m, t: string, a: string) => `[${a}](tanden-link:${encodeURIComponent(t)})`).replace(/(?<!!)\[\[([^\]\n]+)\]\]/g, (_m, t: string) => `[${t.split('#')[0]!.split('/').pop()}](tanden-link:${encodeURIComponent(t)})`))),
    current: () => engine.active,
  };
}

export const notes = new Notes();
