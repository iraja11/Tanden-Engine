import * as Y from 'yjs';
import type { EventBus } from '../events';
import { clientIdFor, hashBytesHex, hashHex } from '../hash';
import { readText, toBytes, type Storage } from '../storage';
import { Workbook } from './workbook';
import { applyBookDiff, loadBook, readXlsx, writeXlsx, type BookData } from './xlsx';

/*
 * Planilhas no cofre, com o mesmo esquema de merge das notas:
 *
 *   **\/*.xlsx                          a planilha, legível no Excel, Sheets e LibreOffice
 *   .tanden/sheet/<chave>/<aparelho>.bin  estado CRDT completo que aquele aparelho conhece
 *   .tanden/sheet/<chave>/<aparelho>.json o que aquele aparelho gravou no .xlsx
 *
 * Cada aparelho só escreve os próprios arquivos em .tanden/sheet/; ao ler, funde
 * o estado de todos. Um .xlsx editado fora do Tanden (Excel, Sheets) é comparado
 * com a versão de onde partiu, e só as células que mudaram lá entram no merge.
 * Um .xlsx que apareceu na pasta sem histórico é adotado como está e só é
 * regravado quando a planilha for editada no Tanden.
 */

const DOCS_DIR = '.tanden/sheet/';
const LOCAL_DIR = '.tanden/local/';
const MIRRORS_KEPT = 8;
export const SHEETS_FOLDER = 'Planilhas/';

interface Mirror {
  /** hash do .xlsx */
  h: string;
  /** assinatura do estado CRDT que corresponde a esse arquivo */
  st: string;
  /** snapshot Yjs (base64) para reconstruir aquela versão */
  s: string;
}

interface DeviceMeta {
  path: string;
  kind: 'sheet';
  writtenAt: number;
  mirrors: Mirror[];
}

export interface SheetSyncReport {
  merged: number;
  external: number;
  written: number;
}

const toB64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const newDoc = (): Y.Doc => new Y.Doc({ gc: false });
const keyFor = (path: string): string => hashHex(`sheet:${path}`);
const isSheetPath = (p: string): boolean => /\.xlsx$/i.test(p) && !p.startsWith('.') && !p.includes('/.') && !/(^|\/)~\$/.test(p);
const sheetIdFor = (path: string) => (name: string) => `x${hashHex(`${path}\0${name.toLowerCase()}`).slice(0, 8)}`;

export class SheetStore {
  private docs = new Map<string, Y.Doc>();
  private books = new Map<string, Workbook>();
  private lastWritten = new Map<string, string>();
  private listeners = new Set<(path: string, origin: 'local' | 'remote' | 'external') => void>();

  constructor(
    readonly storage: Storage,
    readonly deviceId: string,
    readonly bus: EventBus,
  ) {}

  list(): string[] {
    return [...this.docs.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  /** A pasta de trabalho viva (a mesma instância sempre, para a interface). */
  workbook(path: string): Workbook {
    let wb = this.books.get(path);
    if (!wb) {
      const doc = this.docs.get(path);
      if (!doc) throw new Error(`Planilha não encontrada: ${path}`);
      wb = new Workbook(doc);
      wb.onChange((origin) => {
        if (origin === 'local' || origin === 'init') this.emit(path, 'local');
      });
      this.books.set(path, wb);
    }
    return wb;
  }

  onChange(fn: (path: string, origin: 'local' | 'remote' | 'external') => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(path: string, origin: 'local' | 'remote' | 'external'): void {
    this.listeners.forEach((fn) => fn(path, origin));
    this.bus.emit({ type: 'sheet.changed', path, origin });
  }

  /** Planilha nova e vazia (ou com o conteúdo importado). */
  create(path: string, data?: BookData): Workbook {
    if (!isSheetPath(path)) throw new Error(`Caminho de planilha inválido: ${path}`);
    if (this.docs.has(path)) throw new Error(`Planilha já existe: ${path}`);
    const doc = newDoc();
    this.docs.set(path, doc);
    const wb = this.workbook(path);
    if (data) {
      doc.transact(() => loadBook(wb, data), 'init');
    } else Workbook.create(doc);
    wb.undo.clear();
    this.emit(path, 'local');
    return wb;
  }

  /** Nome livre na pasta Planilhas/. */
  freePath(base: string): string {
    const clean = base.replace(/\.(xlsx|csv|tsv)$/i, '').replace(/[\\/:*?"<>|]/g, '').trim() || 'Planilha';
    let path = `${SHEETS_FOLDER}${clean}.xlsx`;
    for (let n = 2; this.docs.has(path); n++) path = `${SHEETS_FOLDER}${clean} ${n}.xlsx`;
    return path;
  }

  sync(): Promise<SheetSyncReport> {
    return this.bus.process(`sheets:${this.deviceId}`, 'Sincronizando planilhas', () => this.doSync());
  }

  private get diskPath(): string {
    return `${LOCAL_DIR}${this.deviceId}/sheets.json`;
  }

  private async doSync(): Promise<SheetSyncReport> {
    const report: SheetSyncReport = { merged: 0, external: 0, written: 0 };
    const all = await this.storage.list();
    let disk: Record<string, string> = {};
    try {
      disk = JSON.parse((await readText(this.storage, this.diskPath)) ?? '{}') as Record<string, string>;
    } catch {
      disk = {};
    }
    const byKey = new Map<string, string[]>();
    for (const p of all) {
      if (!p.startsWith(DOCS_DIR)) continue;
      const k = p.slice(DOCS_DIR.length).split('/')[0]!;
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(p);
    }
    const paths = new Set<string>(all.filter(isSheetPath));
    for (const p of this.docs.keys()) paths.add(p);
    for (const files of byKey.values()) {
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const m = await this.readMeta(f);
        if (m?.kind === 'sheet' && isSheetPath(m.path)) paths.add(m.path);
      }
    }
    for (const path of [...paths].sort()) {
      try {
        const r = await this.syncOne(path, byKey.get(keyFor(path)) ?? [], disk);
        if (r.merged) report.merged++;
        if (r.external) report.external++;
        if (r.written) report.written++;
      } catch (e) {
        // uma planilha corrompida não pode travar as outras
        console.warn(`Planilha ${path}:`, e);
      }
    }
    await this.storage.write(this.diskPath, toBytes(JSON.stringify(disk)));
    return report;
  }

  private async readMeta(file: string): Promise<DeviceMeta | null> {
    const raw = await readText(this.storage, file);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as DeviceMeta;
    } catch {
      return null;
    }
  }

  private async syncOne(path: string, files: string[], disk: Record<string, string>) {
    const key = keyFor(path);
    let doc = this.docs.get(path);
    const isNew = !doc;
    if (!doc) {
      doc = newDoc();
      this.docs.set(path, doc);
    }
    const beforeSig = hashBytesHex(Y.encodeStateAsUpdate(doc));

    // 1. funde o estado de todos os aparelhos
    const metas: Array<DeviceMeta & { device: string }> = [];
    for (const f of files) {
      const device = f.slice(f.lastIndexOf('/') + 1).replace(/\.(bin|json)$/, '');
      if (f.endsWith('.bin')) {
        const b = await this.storage.read(f);
        if (b) Y.applyUpdate(doc, b, 'remote');
      } else if (f.endsWith('.json')) {
        const m = await this.readMeta(f);
        if (m) metas.push({ ...m, device });
      }
    }
    const merged = !isNew && hashBytesHex(Y.encodeStateAsUpdate(doc)) !== beforeSig;

    // 2. o .xlsx mudou fora do Tanden?
    const mirrors = metas.flatMap((m) => m.mirrors ?? []);
    let ownMirrors = metas.find((m) => m.device === this.deviceId)?.mirrors ?? [];
    const file = await this.storage.read(path);
    const fileHash = file ? hashBytesHex(file) : null;
    let external = false;
    if (file && fileHash && !mirrors.some((m) => m.h === fileHash)) {
      let data: BookData | null = null;
      try {
        data = readXlsx(file);
      } catch (e) {
        console.warn(`Ignorando ${path}: ${String(e)}`);
      }
      if (data) {
        const empty = doc.share.size === 0 || doc.getArray('order').length === 0;
        const rebuild = (m: Mirror): Y.Doc | null => {
          try {
            return Y.createDocFromSnapshot(doc, Y.decodeSnapshot(fromB64(m.s)), newDoc());
          } catch {
            return null;
          }
        };
        let base: { m: Mirror; fork: Y.Doc } | null = null;
        // de qual versão a edição partiu: a que este aparelho viu por último, senão a mais recente
        const order = [...mirrors.filter((m) => m.h === disk[path]), ...[...mirrors].reverse()];
        for (const m of order) {
          const fork = rebuild(m);
          if (fork) {
            base = { m, fork };
            break;
          }
        }
        if (base || empty) {
          const fork = base?.fork ?? newDoc();
          fork.clientID = clientIdFor(`${path}\0${base?.m.h ?? ''}\0${fileHash}`);
          const wb = new Workbook(fork);
          const baseData = base ? readXlsx(writeXlsx(wb)) : { sheets: [] };
          applyBookDiff(wb, baseData, data, sheetIdFor(path));
          Y.applyUpdate(doc, Y.encodeStateAsUpdate(fork), 'external');
          external = true;
          // o arquivo de fora passa a ser o espelho deste estado: não regravar à toa
          ownMirrors = [...ownMirrors, { h: fileHash, st: hashBytesHex(Y.encodeStateAsUpdate(doc)), s: toB64(Y.encodeSnapshot(Y.snapshot(doc))) }];
        }
      }
    }

    // 3. grava o que este aparelho sabe
    const state = Y.encodeStateAsUpdate(doc);
    const sig = hashBytesHex(state);
    const known = [...mirrors, ...ownMirrors];
    const fileIsCurrent = fileHash !== null && known.some((m) => m.h === fileHash && m.st === sig);
    let written = false;
    let finalHash = fileHash;
    if (doc.getArray('order').length > 0 && (!fileIsCurrent || this.lastWritten.get(path) !== sig)) {
      if (!fileIsCurrent) {
        const bytes = writeXlsx(this.workbook(path));
        finalHash = hashBytesHex(bytes);
        if (finalHash !== fileHash) await this.storage.write(path, bytes);
        ownMirrors = [...ownMirrors.filter((m) => m.h !== finalHash), { h: finalHash, st: sig, s: toB64(Y.encodeSnapshot(Y.snapshot(doc))) }];
      }
      await this.storage.write(`${DOCS_DIR}${key}/${this.deviceId}.bin`, state);
      const meta: DeviceMeta = { path, kind: 'sheet', writtenAt: Date.now(), mirrors: ownMirrors.slice(-MIRRORS_KEPT) };
      await this.storage.write(`${DOCS_DIR}${key}/${this.deviceId}.json`, toBytes(JSON.stringify(meta)));
      this.lastWritten.set(path, sig);
      written = true;
    }
    if (finalHash) disk[path] = finalHash;

    if (isNew) this.emit(path, external ? 'external' : 'remote');
    else if (merged) this.emit(path, 'remote');
    else if (external) this.emit(path, 'external');
    return { merged, external, written };
  }
}
