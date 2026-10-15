import { annotationsToMarkdown, bookAuthor, bookTitle, bookToMarkdown, fileKind, fromBytes, pdfFingerprint, safeFileName, toBytes, type Book } from '@tanden/core';
import { engine } from '../engine.svelte';
import { files } from '../files/files.svelte';
import { fold, foldWithMap } from '../pdf/geometry';
import { openPdf } from '../pdf/pdfjs';

/*
 * Biblioteca de PDFs: lista os PDFs do cofre como livros, com capa, título e
 * autor tirados do próprio PDF, e abre o leitor.
 *
 * Os dados de leitura (status, estantes, posição, marcadores) moram no
 * LibraryStore e sincronizam. Capas e texto extraído são cache deste aparelho,
 * em .tanden/local/ (fora do Drive), e se refazem sozinhos quando o PDF muda.
 */

interface CacheEntry {
  /** tamanho + data do arquivo (quando o armazenamento sabe dizer) */
  sig?: string;
  fp: string;
  pages: number;
  title?: string;
  author?: string;
  cover?: boolean;
  /** o PDF não abriu (corrompido ou com senha) */
  broken?: string;
}

export interface ContentHit {
  path: string;
  page: number;
  /** trecho com a ocorrência no meio: antes, achado, depois */
  snippet: [string, string, string];
}

export type Shelf = 'todos' | 'lendo' | 'quero' | 'lido' | 'pausado' | 'favoritos' | `estante:${string}` | `tag:${string}`;
export type Sort = 'recentes' | 'titulo' | 'autor' | 'adicionados' | 'progresso';

const isPdf = (p: string) => fileKind(p) === 'pdf';

class Biblioteca {
  /** sobe quando a biblioteca muda (aqui ou vinda de outro aparelho) */
  rev = $state(0);
  /** PDF aberto no leitor */
  reading = $state<string | null>(null);
  /** busca que o leitor abre ao carregar (veio de um resultado da busca no conteúdo) */
  findOnOpen = $state('');
  covers = $state<Record<string, string>>({});
  scanning = $state<{ done: number; total: number } | null>(null);
  /** busca no conteúdo: quantos PDFs já foram lidos */
  indexing = $state<{ done: number; total: number } | null>(null);
  shelf = $state<Shelf>('todos');
  sort = $state<Sort>('recentes');
  layout = $state<'grade' | 'lista'>('grade');
  /** livro com o painel de detalhes aberto */
  details = $state<string | null>(null);

  private cache: Record<string, CacheEntry> = {};
  private cacheLoading: Promise<void> | null = null;
  private started = false;
  private scanAgain = false;
  private running = false;
  private coverLoads = new Map<string, Promise<string | null>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private get dir(): string {
    return `.tanden/local/${engine.vault.deviceId}/biblioteca`;
  }

  start(): void {
    if (this.started || !engine.ready) return;
    this.started = true;
    try {
      const v = JSON.parse(localStorage.getItem('tanden.biblioteca.view') ?? '{}') as { sort?: Sort; layout?: 'grade' | 'lista' };
      if (v.sort) this.sort = v.sort;
      if (v.layout) this.layout = v.layout;
    } catch {
      // preferência perdida: fica o padrão
    }
    engine.library.onChange(() => this.rev++);
    engine.annots.onChange(() => this.rev++);
    engine.bus.on('sync.finished', () => void this.scan());
    void this.scan();
  }

  savePrefs(): void {
    try {
      localStorage.setItem('tanden.biblioteca.view', JSON.stringify({ sort: this.sort, layout: this.layout }));
    } catch {
      // sem armazenamento: só não lembra
    }
  }

  /* -------------------------------------------------------------- livros */

  /** PDFs do cofre como livros (o que está na pasta agora). */
  get books(): Book[] {
    void this.rev;
    void files.list;
    const out: Book[] = [];
    for (const p of files.list) {
      if (!isPdf(p)) continue;
      const b = engine.library.get(p);
      const c = this.cache[p];
      out.push(b ?? { path: p, added: 0, tags: [], shelves: [], readMs: 0, bookmarks: [], pages: c?.pages, pdfTitle: c?.title, pdfAuthor: c?.author });
    }
    return out;
  }

  book(path: string): Book | null {
    void this.rev;
    return engine.library.get(path);
  }

  title = (b: Book): string => bookTitle(b);
  author = (b: Book): string => bookAuthor(b);
  broken = (path: string): string | undefined => this.cache[path]?.broken;

  /** Abre o PDF no leitor (e conta como aberto, para "continuar lendo"). */
  open(path: string, page?: number | null, find = ''): void {
    this.findOnOpen = find;
    if (!engine.library.has(path)) engine.library.ensure(path);
    engine.library.touch(path);
    this.reading = path;
    this.details = null;
    if (page) files.page = { n: page, seq: Date.now() };
    else files.page = null;
  }

  close(): void {
    this.reading = null;
  }

  /**
   * Nota do livro em Livros/ (propriedades que o Obsidian e os Bancos leem,
   * marcadores e anotações). Se já existe, só abre: a nota é sua depois de criada.
   */
  bookNote(path: string): void {
    const b = engine.library.get(path) ?? { path, added: Date.now(), tags: [], shelves: [], readMs: 0, bookmarks: [] };
    const note = `Livros/${safeFileName(bookTitle(b)) || 'Livro'}.md`;
    if (engine.vault.has(note)) {
      files.say(`A nota do livro já existe: ${note}.`, { path: note });
      files.openPath(note);
      return;
    }
    const list = engine.annots.list(path);
    const annots = list.length
      ? `## Anotações\n\n${annotationsToMarkdown(path, list).split('\n').slice(1).join('\n').replace(/^## /gm, '### ').trim()}`
      : '';
    engine.writeNote(note, bookToMarkdown(b, annots));
    files.say(`Nota do livro criada em ${note}.`, { path: note });
    files.openPath(note);
  }

  /* ---------------------------------------------------- varredura e capas */

  private loadCache(): Promise<void> {
    this.cacheLoading ??= (async () => {
      try {
        const raw = await engine.storage.read(`${this.dir}/indice.json`);
        if (raw) this.cache = JSON.parse(fromBytes(raw)) as Record<string, CacheEntry>;
      } catch {
        this.cache = {};
      }
      this.rev++;
    })();
    return this.cacheLoading;
  }

  private saveCache(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void engine.storage.write(`${this.dir}/indice.json`, toBytes(JSON.stringify(this.cache))).catch(() => {});
    }, 800);
  }

  /**
   * Confere os PDFs da pasta: lê capa, título, autor e páginas dos novos ou
   * mudados, põe na biblioteca e acha livros que mudaram de pasta.
   */
  async scan(): Promise<void> {
    if (this.running) {
      this.scanAgain = true;
      return;
    }
    this.running = true;
    try {
      await this.loadCache();
      await files.refresh();
      const pdfs = files.list.filter(isPdf);
      let stat: Record<string, [string, number]> = {};
      try {
        stat = (await engine.storage.stat?.()) ?? {};
      } catch {
        stat = {};
      }
      const todo = pdfs.filter((p) => {
        const c = this.cache[p];
        if (!c) return true;
        return stat[p] ? c.sig !== stat[p]![0] : false;
      });
      if (todo.length) {
        this.scanning = { done: 0, total: todo.length };
        await engine.bus.process('biblioteca:scan', `Lendo ${todo.length} PDF${todo.length > 1 ? 's' : ''} da biblioteca`, async () => {
          for (const p of todo) {
            await this.inspect(p, stat[p]?.[0]);
            this.scanning = { done: this.scanning!.done + 1, total: todo.length };
            this.rev++;
            this.saveCache();
          }
        });
      }
      // livros que mudaram de pasta levam status, marcadores e anotações junto
      const present = new Map(pdfs.map((p) => [p, this.cache[p]?.fp]));
      const moved = engine.library.reconcile(present);
      for (const [from, to] of moved) {
        engine.annots.move(from, to);
        if (this.reading === from) this.reading = to;
      }
      for (const p of pdfs) {
        const c = this.cache[p];
        if (c && !c.broken) engine.library.ensure(p, { fingerprint: c.fp, pages: c.pages || undefined, pdfTitle: c.title, pdfAuthor: c.author });
      }
      // cache de arquivos que sumiram
      let dropped = false;
      for (const p of Object.keys(this.cache)) {
        if (!pdfs.includes(p)) {
          delete this.cache[p];
          dropped = true;
        }
      }
      if (dropped || todo.length) this.saveCache();
      if (moved.length) {
        files.say(moved.length === 1 ? `"${moved[0]![1].split('/').pop()}" mudou de pasta; a leitura e as anotações foram junto.` : `${moved.length} livros mudaram de pasta; leitura e anotações foram junto.`);
        void engine.syncNow();
      }
    } finally {
      this.scanning = null;
      this.running = false;
      if (this.scanAgain) {
        this.scanAgain = false;
        void this.scan();
      }
    }
  }

  private async inspect(path: string, sig: string | undefined): Promise<void> {
    const data = await files.read(path);
    if (!data) return;
    const fp = pdfFingerprint(data);
    const old = this.cache[path];
    if (old && old.fp === fp && !old.broken) {
      this.cache[path] = { ...old, sig };
      return;
    }
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null;
    try {
      doc = await openPdf(data);
      const meta = await doc.getMetadata().catch(() => null);
      const info = (meta?.info ?? {}) as { Title?: unknown; Author?: unknown };
      const entry: CacheEntry = {
        sig,
        fp,
        pages: doc.numPages,
        title: typeof info.Title === 'string' ? info.Title.trim().slice(0, 300) : undefined,
        author: typeof info.Author === 'string' ? info.Author.trim().slice(0, 200) : undefined,
      };
      const jpeg = await this.renderCover(doc).catch(() => null);
      if (jpeg) {
        await engine.storage.write(`${this.dir}/capas/${fp}.jpg`, jpeg);
        entry.cover = true;
        this.dropCover(path);
      }
      this.cache[path] = entry;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.cache[path] = { sig, fp, pages: 0, broken: /password/i.test(msg) ? 'protegido por senha' : 'não abriu' };
    } finally {
      void doc?.loadingTask.destroy();
    }
  }

  private async renderCover(doc: Awaited<ReturnType<typeof openPdf>>): Promise<Uint8Array | null> {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 360 / base.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.min(Math.floor(vp.height), 720);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8));
    canvas.width = 0;
    canvas.height = 0;
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  }

  private dropCover(path: string): void {
    const u = this.covers[path];
    if (u) URL.revokeObjectURL(u);
    const { [path]: _, ...rest } = this.covers;
    this.covers = rest;
    for (const k of [...this.coverLoads.keys()]) if (k.startsWith(`${path}\u0000`)) this.coverLoads.delete(k);
  }

  /** Capa do livro (carrega na primeira vez que aparece na tela). */
  async cover(path: string): Promise<string | null> {
    const hit = this.covers[path];
    if (hit) return hit;
    await this.loadCache();
    const c = this.cache[path];
    if (!c?.cover) return null;
    // uma leitura por capa, mesmo com vários pedidos ao mesmo tempo
    const key = `${path}\u0000${c.fp}`;
    let p = this.coverLoads.get(key);
    if (!p) {
      p = (async () => {
        const data = await engine.storage.read(`${this.dir}/capas/${c.fp}.jpg`);
        if (!data) return null;
        const u = URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/jpeg' }));
        const old = this.covers[path];
        if (old) URL.revokeObjectURL(old);
        this.covers = { ...this.covers, [path]: u };
        return u;
      })();
      this.coverLoads.set(key, p);
      void p.then((u) => {
        if (!u) this.coverLoads.delete(key);
      });
    }
    return p;
  }

  hasCover = (path: string): boolean => !!this.cache[path]?.cover;

  /* ------------------------------------------------- busca no conteúdo */

  private texts = new Map<string, string[]>();

  private async pageTexts(path: string): Promise<string[] | null> {
    const c = this.cache[path];
    if (!c || c.broken) return null;
    const hit = this.texts.get(c.fp);
    if (hit) return hit;
    const file = `${this.dir}/texto/${c.fp}.json`;
    try {
      const raw = await engine.storage.read(file);
      if (raw) {
        const t = JSON.parse(fromBytes(raw)) as string[];
        this.texts.set(c.fp, t);
        return t;
      }
    } catch {
      // cache estragado: extrai de novo
    }
    const data = await files.read(path);
    if (!data) return null;
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null;
    try {
      doc = await openPdf(data);
      const out: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const tc = await (await doc.getPage(i)).getTextContent();
        out.push(tc.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join('').replace(/[ \t]+/g, ' '));
      }
      this.texts.set(c.fp, out);
      await engine.storage.write(file, toBytes(JSON.stringify(out)));
      return out;
    } catch {
      return null;
    } finally {
      void doc?.loadingTask.destroy();
    }
  }

  /**
   * Procura o texto dentro de todos os PDFs. Na primeira vez extrai o texto de
   * cada um (fica guardado neste aparelho); depois é instantâneo.
   * `onHits` recebe os resultados parciais enquanto lê.
   */
  async searchContent(query: string, onHits: (hits: ContentHit[]) => void, isCurrent: () => boolean, limit = 400): Promise<ContentHit[]> {
    const needle = fold(query.trim());
    if (needle.length < 2) return [];
    const paths = this.books.map((b) => b.path);
    const hits: ContentHit[] = [];
    const need = paths.filter((p) => !this.texts.has(this.cache[p]?.fp ?? ''));
    if (need.length) this.indexing = { done: 0, total: paths.length };
    try {
      for (const [n, p] of paths.entries()) {
        if (!isCurrent()) return hits;
        const pages = await this.pageTexts(p);
        if (this.indexing) this.indexing = { done: n + 1, total: paths.length };
        if (!pages) continue;
        for (let i = 0; i < pages.length && hits.length < limit; i++) {
          const raw = pages[i]!;
          const { text: folded, map } = foldWithMap(raw);
          for (let at = folded.indexOf(needle), shown = 0; at >= 0 && shown < 3; at = folded.indexOf(needle, at + needle.length), shown++) {
            const a = map[at]!;
            const b = map[at + needle.length]!;
            const s = Math.max(0, a - 60);
            const e = Math.min(raw.length, b + 80);
            const clean = (x: string) => x.replace(/\s+/g, ' ');
            hits.push({ path: p, page: i + 1, snippet: [(s > 0 ? '…' : '') + clean(raw.slice(s, a)), clean(raw.slice(a, b)), clean(raw.slice(b, e)) + (e < raw.length ? '…' : '')] });
          }
        }
        if (n % 3 === 2) onHits([...hits]);
      }
      onHits([...hits]);
      return hits;
    } finally {
      this.indexing = null;
    }
  }
}

export const biblioteca = new Biblioteca();

// só no modo de desenvolvimento: deixa os testes de interface olharem a biblioteca
if (import.meta.env.DEV) (globalThis as { __biblioteca?: Biblioteca }).__biblioteca = biblioteca;
