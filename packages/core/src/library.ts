import * as Y from 'yjs';
import { EventBus } from './events';
import { hashBytesHex } from './hash';
import { type Storage } from './storage';
import type { SyncOptions } from './vault';

/*
 * Biblioteca de PDFs: status de leitura, estantes, etiquetas, nota, posição,
 * marcadores e tempo de leitura de cada PDF do cofre.
 *
 * O PDF nunca é reescrito. Tudo mora num CRDT só, por aparelho, e se funde
 * como as notas:
 *
 *   .tanden/library/<aparelho>.bin
 *
 * O mapa é plano, uma chave por campo ("<caminho>\u0000<campo>"), para que dois
 * aparelhos mexendo no mesmo livro offline não percam nada: status trocado no
 * celular e estante trocada no PC ficam os dois. A posição e o tempo de leitura
 * têm uma chave por aparelho; vale a posição mais recente e o tempo somado.
 */

export type ReadStatus = 'quero' | 'lendo' | 'lido' | 'pausado';

export const READ_STATUS: Record<ReadStatus, string> = {
  quero: 'Quero ler',
  lendo: 'Lendo',
  lido: 'Lido',
  pausado: 'Pausado',
};

export interface Bookmark {
  id: string;
  page: number;
  label: string;
  created: number;
}

export interface Book {
  path: string;
  /** impressão digital do arquivo (acha o livro de novo se ele mudar de pasta) */
  fingerprint?: string;
  /** título e autor escritos por você (vencem os do PDF) */
  title?: string;
  author?: string;
  /** título, autor e páginas lidos do próprio PDF */
  pdfTitle?: string;
  pdfAuthor?: string;
  pages?: number;
  status?: ReadStatus;
  /** 1 a 5 */
  rating?: number;
  favorite?: boolean;
  tags: string[];
  shelves: string[];
  /** página onde parou (a mais recente entre os aparelhos) */
  page?: number;
  pageAt?: number;
  pageDevice?: string;
  /** página mais adiante já alcançada */
  maxPage?: number;
  added: number;
  opened?: number;
  started?: number;
  finished?: number;
  /** tempo de leitura somado de todos os aparelhos (ms) */
  readMs: number;
  bookmarks: Bookmark[];
}

export type BookPatch = Partial<
  Pick<Book, 'fingerprint' | 'title' | 'author' | 'pdfTitle' | 'pdfAuthor' | 'pages' | 'status' | 'rating' | 'favorite' | 'tags' | 'shelves'>
>;

const DIR = '.tanden/library/';
const SEP = '\u0000';
const k = (path: string, field: string) => `${path}${SEP}${field}`;
const PLAIN: Array<keyof BookPatch | 'added' | 'opened' | 'started' | 'finished'> = [
  'fingerprint', 'title', 'author', 'pdfTitle', 'pdfAuthor', 'pages', 'status', 'rating', 'favorite', 'tags', 'shelves',
  'added', 'opened', 'started', 'finished',
];

/**
 * Impressão digital barata de um PDF: tamanho + começo + fim do arquivo.
 * Não lê o arquivo todo de novo como texto (PDFs grandes) e não muda quando o
 * arquivo só troca de nome ou de pasta.
 */
export function pdfFingerprint(bytes: Uint8Array): string {
  const span = 65536;
  const head = bytes.subarray(0, span);
  const tail = bytes.length > span ? bytes.subarray(Math.max(span, bytes.length - span)) : new Uint8Array();
  return `${bytes.length.toString(36)}-${hashBytesHex(head)}${hashBytesHex(tail)}`;
}

/** Título bonito: o seu, o do PDF (se não for lixo como "Microsoft Word - x.doc") ou o nome do arquivo. */
export function bookTitle(b: Pick<Book, 'path' | 'title' | 'pdfTitle'>): string {
  if (b.title?.trim()) return b.title.trim();
  const t = b.pdfTitle?.trim() ?? '';
  const junk = !t || t.length < 3 || /^(untitled|sem t[ií]tulo|document\d*|microsoft (word|powerpoint)\b|\S+\.(docx?|pptx?|tex|dvi|indd|pdf))/i.test(t);
  return junk ? b.path.split('/').pop()!.replace(/\.pdf$/i, '') : t;
}

export function bookAuthor(b: Pick<Book, 'author' | 'pdfAuthor'>): string {
  return (b.author?.trim() || b.pdfAuthor?.trim() || '').replace(/\s+/g, ' ');
}

/** Progresso de 0 a 1 (lido conta como 1). */
export function bookProgress(b: Pick<Book, 'status' | 'page' | 'maxPage' | 'pages'>): number {
  if (b.status === 'lido') return 1;
  if (!b.pages || b.pages <= 1) return 0;
  const p = Math.max(b.page ?? 0, b.maxPage ?? 0);
  return Math.max(0, Math.min(1, (p - 1) / (b.pages - 1)));
}

export class LibraryStore {
  readonly bus: EventBus;
  readonly doc = new Y.Doc({ gc: true });
  private lastWritten = '';
  private listeners = new Set<(origin: 'local' | 'remote') => void>();

  constructor(
    readonly storage: Storage,
    readonly deviceId: string,
    bus?: EventBus,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) throw new Error('deviceId deve ter só letras, números, - ou _');
    this.bus = bus ?? new EventBus();
  }

  private get map(): Y.Map<unknown> {
    return this.doc.getMap('books');
  }

  onChange(fn: (origin: 'local' | 'remote') => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(origin: 'local' | 'remote'): void {
    this.bus.emit({ type: 'library.changed', origin });
    for (const l of this.listeners) l(origin);
  }

  private tx(fn: (m: Y.Map<unknown>) => void): void {
    this.doc.transact(() => fn(this.map), 'local');
    this.changed('local');
  }

  /** Caminhos com livro na biblioteca. */
  paths(): string[] {
    const out = new Set<string>();
    for (const key of this.map.keys()) if (key.endsWith(`${SEP}added`)) out.add(key.slice(0, key.indexOf(SEP)));
    return [...out].sort();
  }

  has(path: string): boolean {
    return this.map.has(k(path, 'added'));
  }

  get(path: string): Book | null {
    if (!this.has(path)) return null;
    const m = this.map;
    const b: Book = { path, added: 0, tags: [], shelves: [], readMs: 0, bookmarks: [] };
    const prefix = `${path}${SEP}`;
    let posAt = -1;
    for (const [key, v] of m.entries()) {
      if (!key.startsWith(prefix)) continue;
      const f = key.slice(prefix.length);
      if (f.startsWith('pos:')) {
        const p = v as { page?: number; at?: number };
        if (typeof p?.page === 'number' && (p.at ?? 0) > posAt) {
          posAt = p.at ?? 0;
          b.page = p.page;
          b.pageAt = p.at;
          b.pageDevice = f.slice(4);
        }
      } else if (f.startsWith('max:')) {
        // o mais adiante entre os aparelhos (cada um grava o seu, para não brigar no merge)
        if (typeof v === 'number' && v > (b.maxPage ?? 0)) b.maxPage = v;
      } else if (f.startsWith('time:')) {
        if (typeof v === 'number' && v > 0) b.readMs += v;
      } else if (f.startsWith('bm:')) {
        const x = v as Partial<Bookmark>;
        if (typeof x?.page === 'number') b.bookmarks.push({ id: f.slice(3), page: x.page, label: x.label ?? '', created: x.created ?? 0 });
      } else if ((PLAIN as string[]).includes(f)) {
        (b as unknown as Record<string, unknown>)[f] = Array.isArray(v) ? [...v] : v;
      }
    }
    b.bookmarks.sort((x, y) => x.page - y.page || x.created - y.created);
    return b;
  }

  list(): Book[] {
    return this.paths().map((p) => this.get(p)!);
  }

  /** Estantes e etiquetas em uso, para sugerir. */
  shelves(): string[] {
    return [...new Set(this.list().flatMap((b) => b.shelves))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  tags(): string[] {
    return [...new Set(this.list().flatMap((b) => b.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /** Garante o livro na biblioteca (PDF novo na pasta). */
  ensure(path: string, info: Pick<BookPatch, 'fingerprint' | 'pages' | 'pdfTitle' | 'pdfAuthor'> = {}): void {
    const fresh = !this.has(path);
    const cur = fresh ? null : this.get(path)!;
    const patch: Record<string, unknown> = {};
    for (const [f, v] of Object.entries(info)) if (v !== undefined && v !== '' && (cur as Record<string, unknown> | null)?.[f] !== v) patch[f] = v;
    if (!fresh && !Object.keys(patch).length) return;
    this.tx((m) => {
      if (fresh) m.set(k(path, 'added'), Date.now());
      for (const [f, v] of Object.entries(patch)) m.set(k(path, f), v);
    });
  }

  update(path: string, patch: BookPatch): void {
    const cur = this.get(path);
    this.tx((m) => {
      if (!cur) m.set(k(path, 'added'), Date.now());
      for (const [f, v] of Object.entries(patch)) {
        const empty = v === undefined || v === '' || v === null || v === false || (Array.isArray(v) && !v.length);
        if (f === 'tags' || f === 'shelves') {
          const clean = [...new Set((v as string[] | undefined ?? []).map((s) => s.trim().replace(/^#/, '')).filter(Boolean))];
          if (clean.length) m.set(k(path, f), clean);
          else m.delete(k(path, f));
        } else if (empty) m.delete(k(path, f));
        else if (JSON.stringify(m.get(k(path, f))) !== JSON.stringify(v)) m.set(k(path, f), v);
      }
      if (patch.status && patch.status !== cur?.status) {
        const now = Date.now();
        if ((patch.status === 'lendo' || patch.status === 'lido') && !cur?.started) m.set(k(path, 'started'), now);
        if (patch.status === 'lido') m.set(k(path, 'finished'), now);
        else m.delete(k(path, 'finished'));
      }
    });
  }

  /**
   * Página onde parou neste aparelho. Abrir um livro em "Quero ler" e passar da
   * primeira página muda o status para "Lendo".
   */
  setPosition(path: string, page: number, pages?: number): void {
    const cur = this.get(path);
    const p = Math.max(1, Math.round(page));
    const mine = this.map.get(k(path, `pos:${this.deviceId}`)) as { page?: number } | undefined;
    const needs =
      !cur || mine?.page !== p || cur.page !== p || (pages && cur.pages !== pages) || (cur.maxPage ?? 0) < p || (p > 1 && (!cur.status || cur.status === 'quero'));
    if (!needs) return;
    this.tx((m) => {
      const now = Date.now();
      if (!cur) m.set(k(path, 'added'), now);
      m.set(k(path, `pos:${this.deviceId}`), { page: p, at: now });
      if (pages && cur?.pages !== pages) m.set(k(path, 'pages'), pages);
      if ((cur?.maxPage ?? 0) < p) m.set(k(path, `max:${this.deviceId}`), p);
      if (p > 1 && (!cur?.status || cur.status === 'quero')) {
        m.set(k(path, 'status'), 'lendo');
        if (!cur?.started) m.set(k(path, 'started'), now);
      }
    });
  }

  /** Marca a hora em que o livro foi aberto (ordena "continuar lendo"). */
  touch(path: string): void {
    this.tx((m) => {
      if (!this.has(path)) m.set(k(path, 'added'), Date.now());
      m.set(k(path, 'opened'), Date.now());
    });
  }

  /** Soma tempo de leitura deste aparelho. */
  addReading(path: string, ms: number): void {
    if (!(ms > 0) || !this.has(path)) return;
    const key = k(path, `time:${this.deviceId}`);
    const before = (this.map.get(key) as number | undefined) ?? 0;
    this.tx((m) => m.set(key, Math.round(before + ms)));
  }

  addBookmark(path: string, page: number, label = ''): string {
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    this.tx((m) => {
      if (!this.has(path)) m.set(k(path, 'added'), Date.now());
      m.set(k(path, `bm:${id}`), { page: Math.max(1, Math.round(page)), label: label.trim(), created: Date.now() });
    });
    return id;
  }

  renameBookmark(path: string, id: string, label: string): void {
    const cur = this.map.get(k(path, `bm:${id}`)) as Bookmark | undefined;
    if (!cur || cur.label === label.trim()) return;
    this.tx((m) => m.set(k(path, `bm:${id}`), { ...cur, label: label.trim() }));
  }

  removeBookmark(path: string, id: string): void {
    if (!this.map.has(k(path, `bm:${id}`))) return;
    this.tx((m) => m.delete(k(path, `bm:${id}`)));
  }

  /** Liga/desliga o marcador da página. Devolve se ficou marcada. */
  toggleBookmark(path: string, page: number, label = ''): boolean {
    const hit = this.get(path)?.bookmarks.filter((b) => b.page === page) ?? [];
    if (hit.length) {
      this.tx((m) => {
        for (const b of hit) m.delete(k(path, `bm:${b.id}`));
      });
      return false;
    }
    this.addBookmark(path, page, label);
    return true;
  }

  /** Tira o livro da biblioteca (o PDF continua na pasta). */
  remove(path: string): void {
    const prefix = `${path}${SEP}`;
    const keys = [...this.map.keys()].filter((key) => key.startsWith(prefix));
    if (!keys.length) return;
    this.tx((m) => {
      for (const key of keys) m.delete(key);
    });
  }

  /** O PDF mudou de nome ou de pasta: o livro vai junto, com tudo. */
  move(from: string, to: string): void {
    if (from === to || !this.has(from)) return;
    const prefix = `${from}${SEP}`;
    const entries = [...this.map.entries()].filter(([key]) => key.startsWith(prefix));
    const target = this.get(to);
    this.tx((m) => {
      for (const [key, v] of entries) {
        const f = key.slice(prefix.length);
        // o destino já tinha algo seu (aberto antes do sync): mantém o que ele tem de mais novo
        const keep = target && m.has(k(to, f)) && !/^(bm|time|pos|max):/.test(f) && f !== 'added';
        if (!keep) m.set(k(to, f), f === 'added' ? Math.min(v as number, target?.added ?? Infinity) : v);
        m.delete(key);
      }
    });
  }

  /**
   * Confere a biblioteca com os PDFs da pasta. `present` diz a impressão
   * digital de cada PDF (quando conhecida). Livro cujo arquivo sumiu e cuja
   * impressão digital aparece num caminho novo é movido para lá.
   * Devolve os pares movidos (para mover as anotações junto).
   */
  reconcile(present: Map<string, string | undefined>): Array<[from: string, to: string]> {
    const moved: Array<[string, string]> = [];
    const byFp = new Map<string, string[]>();
    for (const [p, fp] of present) if (fp) (byFp.get(fp) ?? byFp.set(fp, []).get(fp)!).push(p);
    for (const b of this.list()) {
      if (present.has(b.path) || !b.fingerprint) continue;
      const cands = (byFp.get(b.fingerprint) ?? []).filter((p) => {
        const there = this.get(p);
        // destino sem nada seu além do que o app mesmo preencheu
        return !there || (!there.status && !there.bookmarks.length && !there.shelves.length && !there.tags.length && !there.rating && !there.favorite);
      });
      if (cands.length !== 1) continue;
      this.move(b.path, cands[0]!);
      moved.push([b.path, cands[0]!]);
      byFp.set(b.fingerprint, []);
    }
    return moved;
  }

  sync(_opts: SyncOptions = {}): Promise<{ merged: number; written: number }> {
    return this.bus.process(`sync-library:${this.deviceId}`, 'Sincronizando a biblioteca', () => this.doSync());
  }

  private async doSync() {
    const report = { merged: 0, written: 0 };
    const before = hashBytesHex(Y.encodeStateVector(this.doc));
    for (const f of await this.storage.list(DIR)) {
      if (!f.endsWith('.bin')) continue;
      const b = await this.storage.read(f);
      if (!b) continue;
      try {
        Y.applyUpdate(this.doc, b, 'remote');
      } catch {
        // estado corrompido de outro aparelho: ignora, o dele se refaz no próximo envio
      }
    }
    if (hashBytesHex(Y.encodeStateVector(this.doc)) !== before) {
      report.merged = 1;
      this.changed('remote');
    }
    const state = Y.encodeStateAsUpdate(this.doc);
    const sig = hashBytesHex(state);
    if (this.lastWritten !== sig) {
      const own = `${DIR}${this.deviceId}.bin`;
      const known = await this.storage.read(own);
      if ((!known || hashBytesHex(known) !== sig) && (this.map.size > 0 || known)) {
        await this.storage.write(own, state);
        report.written = 1;
      }
      this.lastWritten = sig;
    }
    return report;
  }
}

/* ------------------------------------------------------------ nota do livro */

const yamlStr = (s: string) => JSON.stringify(s);
const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Duração legível: "45 min", "3 h 20 min". */
export function readingTime(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

/**
 * Nota do livro, no formato que o Obsidian (e os Bancos do Tanden) entendem:
 * propriedades no topo, link para o PDF e os marcadores com links de página.
 * As anotações entram depois, pela nota de anotações.
 */
export function bookToMarkdown(b: Book, extra = ''): string {
  const title = bookTitle(b);
  const author = bookAuthor(b);
  const props: string[] = ['---', `titulo: ${yamlStr(title)}`];
  if (author) props.push(`autor: ${yamlStr(author)}`);
  props.push(`arquivo: ${yamlStr(`[[${b.path}]]`)}`);
  if (b.status) props.push(`status: ${yamlStr(READ_STATUS[b.status])}`);
  if (b.rating) props.push(`nota: ${b.rating}`);
  if (b.pages) props.push(`paginas: ${b.pages}`);
  if (b.page) props.push(`pagina-atual: ${b.page}`);
  props.push(`progresso: ${Math.round(bookProgress(b) * 100)}`);
  if (b.started) props.push(`inicio: ${day(b.started)}`);
  if (b.finished) props.push(`fim: ${day(b.finished)}`);
  if (b.shelves.length) props.push('estantes:', ...b.shelves.map((s) => `  - ${yamlStr(s)}`));
  props.push('tags:', '  - livro', ...b.tags.filter((t) => t !== 'livro').map((t) => `  - ${yamlStr(t)}`));
  props.push('---');
  const out = [...props, '', `# ${title}`, ''];
  if (author) out.push(`*${author}*`, '');
  out.push(`Abrir: [[${b.path}#page=${b.page ?? 1}|${b.page && b.page > 1 ? `continuar na página ${b.page}` : 'começar a leitura'}]]`);
  if (b.readMs > 0) out.push('', `Tempo de leitura: ${readingTime(b.readMs)}`);
  if (b.bookmarks.length) {
    out.push('', '## Marcadores', '');
    for (const m of b.bookmarks) out.push(`- [[${b.path}#page=${m.page}|p. ${m.page}]]${m.label ? ` ${m.label}` : ''}`);
  }
  if (extra.trim()) out.push('', extra.trim());
  return `${out.join('\n')}\n`;
}

