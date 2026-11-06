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
 *
 * Apagar segue o desenho dos quadros: cada planilha tem uma geração, quem apaga
 * grava uma lápide (.tanden/sheet/<chave>/del/<aparelho>.json) com as gerações
 * que viu e o vetor de estado do momento. Uma edição feita ao mesmo tempo em
 * outro aparelho (que a lápide não viu) ressuscita a planilha; um .xlsx apagado
 * fora do Tanden também apaga aqui. Sem lápide, o histórico em .tanden/ trazia
 * a planilha de volta no sync seguinte.
 */

const DOCS_DIR = '.tanden/sheet/';
const LOCAL_DIR = '.tanden/local/';
const MIRRORS_KEPT = 8;
const TOMB_SUB = 'del/';
const TOMBS_KEPT = 10;
const TRASH_DIR = '.trash/';
/** muitos .xlsx sumindo de uma vez parecem acidente (pasta desmontada): nada é apagado */
const MASS_REMOVAL = 20;
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
  /** geração da planilha; as de antes das gerações contam como '' */
  gen?: string;
}

interface Tomb {
  gens: string[];
  /** vetor de estado (base64) de tudo o que quem apagou conhecia */
  sv: string;
  at: number;
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
const newGen = (): string => Math.random().toString(36).slice(2, 10);

/** a lápide viu tudo o que existe nesse estado? */
function covers(tomb: Uint8Array, sv: Uint8Array): boolean {
  const t = Y.decodeStateVector(tomb);
  for (const [client, clock] of Y.decodeStateVector(sv)) if (clock > (t.get(client) ?? 0)) return false;
  return true;
}
const keyFor = (path: string): string => hashHex(`sheet:${path}`);
const isSheetPath = (p: string): boolean => /\.xlsx$/i.test(p) && !p.startsWith('.') && !p.includes('/.') && !/(^|\/)~\$/.test(p);
const sheetIdFor = (path: string) => (name: string) => `x${hashHex(`${path}\0${name.toLowerCase()}`).slice(0, 8)}`;

export class SheetStore {
  private docs = new Map<string, Y.Doc>();
  private books = new Map<string, Workbook>();
  private lastWritten = new Map<string, string>();
  private gens = new Map<string, string>();
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

  private emitDeleted(path: string): void {
    this.listeners.forEach((fn) => fn(path, 'remote'));
    this.bus.emit({ type: 'sheet.deleted', path });
  }

  /**
   * Apaga a planilha. Uma cópia do .xlsx vai para .trash/ e os outros
   * aparelhos apagam no próximo sync. Devolve onde ficou a cópia.
   */
  async remove(path: string, opts: { trash?: boolean } = {}): Promise<string | null> {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`Planilha não encontrada: ${path}`);
    let trashed: string | null = null;
    if (opts.trash !== false) {
      const bytes = doc.getArray('order').length ? writeXlsx(this.workbook(path)) : await this.storage.read(path);
      if (bytes) {
        const all = new Set(await this.storage.list(TRASH_DIR));
        const base = `${TRASH_DIR}${path.replace(/\.xlsx$/i, '')}`;
        trashed = `${base}.xlsx`;
        for (let n = 2; all.has(trashed); n++) trashed = `${base} ${n}.xlsx`;
        await this.storage.write(trashed, bytes);
      }
    }
    const key = keyFor(path);
    const tombPath = `${DOCS_DIR}${key}/${TOMB_SUB}${this.deviceId}.json`;
    let old: Tomb[] = [];
    try {
      old = (JSON.parse((await readText(this.storage, tombPath)) ?? '{}') as { tombs?: Tomb[] }).tombs ?? [];
    } catch {
      old = [];
    }
    const gens = new Set([this.gens.get(path) ?? '']);
    for (const f of await this.storage.list(`${DOCS_DIR}${key}/`)) {
      if (f.includes(`/${TOMB_SUB}`) || !f.endsWith('.json')) continue;
      gens.add((await this.readMeta(f))?.gen ?? '');
    }
    const tomb: Tomb = { gens: [...gens], sv: toB64(Y.encodeStateVector(doc)), at: Date.now() };
    await this.storage.write(tombPath, toBytes(JSON.stringify({ path, tombs: [...old, tomb].slice(-TOMBS_KEPT) })));
    await this.storage.remove(path);
    this.forget(path);
    this.emitDeleted(path);
    return trashed;
  }

  private forget(path: string): void {
    this.docs.delete(path);
    this.books.delete(path);
    this.gens.delete(path);
    this.lastWritten.delete(path);
  }

  /** Tira a planilha apagada deste aparelho: o .xlsx e o estado próprio dele. */
  private async dropLocal(path: string, key: string, hasFile: boolean, disk: Record<string, string>): Promise<void> {
    this.forget(path);
    if (hasFile) await this.storage.remove(path);
    for (const f of [`${DOCS_DIR}${key}/${this.deviceId}.bin`, `${DOCS_DIR}${key}/${this.deviceId}.json`]) await this.storage.remove(f);
    delete disk[path];
  }

  /** Planilha nova e vazia (ou com o conteúdo importado). */
  create(path: string, data?: BookData): Workbook {
    if (!isSheetPath(path)) throw new Error(`Caminho de planilha inválido: ${path}`);
    if (this.docs.has(path)) throw new Error(`Planilha já existe: ${path}`);
    const doc = newDoc();
    this.docs.set(path, doc);
    this.gens.set(path, newGen());
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
        if (!f.endsWith('.json') || f.includes(`/${TOMB_SUB}`)) continue;
        const m = await this.readMeta(f);
        if (m?.kind === 'sheet' && isSheetPath(m.path)) paths.add(m.path);
      }
    }
    // .xlsx que este aparelho já tinha visto e que sumiu da pasta: apagado por fora
    const present = new Set(all);
    const missing = [...paths].filter((p) => !present.has(p) && disk[p] !== undefined);
    const mass = missing.length > MASS_REMOVAL && missing.length > Object.keys(disk).length / 2;
    const goneOutside = new Set(mass ? [] : missing);
    for (const path of [...paths].sort()) {
      try {
        const r = await this.syncOne(path, byKey.get(keyFor(path)) ?? [], disk, goneOutside.has(path));
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

  private async syncOne(path: string, files: string[], disk: Record<string, string>, goneOutside = false) {
    const key = keyFor(path);
    const none = { merged: false, external: false, written: false };

    // 0. estado, metas e lápides de cada aparelho
    const states = new Map<string, Uint8Array>();
    const allMetas: Array<DeviceMeta & { device: string }> = [];
    const tombs: Tomb[] = [];
    for (const f of files) {
      const device = f.slice(f.lastIndexOf('/') + 1).replace(/\.(bin|json)$/, '');
      if (f.includes(`/${TOMB_SUB}`)) {
        if (!f.endsWith('.json')) continue;
        try {
          tombs.push(...((JSON.parse((await readText(this.storage, f)) ?? '{}') as { tombs?: Tomb[] }).tombs ?? []));
        } catch {
          // lápide ilegível: ignora (nunca apaga por engano)
        }
      } else if (f.endsWith('.bin')) {
        const b = await this.storage.read(f);
        if (b) states.set(device, b);
      } else if (f.endsWith('.json')) {
        const m = await this.readMeta(f);
        if (m) allMetas.push({ ...m, device });
      }
    }
    const genOf = (device: string) => allMetas.find((m) => m.device === device)?.gen ?? '';
    let doc = this.docs.get(path);

    // gerações mortas: a lápide cobre tudo o que existe delas
    const dead = new Set<string>();
    for (const t of tombs) {
      const probe = newDoc();
      for (const [dev, b] of states) if (t.gens.includes(genOf(dev))) Y.applyUpdate(probe, b);
      if (doc && t.gens.includes(this.gens.get(path) ?? '')) Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc));
      if (covers(fromB64(t.sv), Y.encodeStateVector(probe))) for (const g of t.gens) dead.add(g);
    }
    const live = [...states].filter(([dev]) => !dead.has(genOf(dev)));
    const metas = allMetas.filter((m) => !dead.has(m.gen ?? ''));
    let replaced = false;
    if (doc && dead.has(this.gens.get(path) ?? '')) {
      if (!live.length) {
        await this.dropLocal(path, key, (await this.storage.read(path)) !== null, disk);
        this.emitDeleted(path);
        return none;
      }
      // apagada e criada de novo no mesmo caminho em outro aparelho
      this.forget(path);
      doc = undefined;
      replaced = true;
    }
    if (!doc && dead.size && !live.length) {
      // sobrou só o .xlsx da geração apagada? então ele também vai
      const raw = await this.storage.read(path);
      const h = raw ? hashBytesHex(raw) : null;
      const stale = h === null || h === disk[path] || allMetas.some((m) => dead.has(m.gen ?? '') && m.mirrors?.some((x) => x.h === h));
      if (stale) {
        await this.dropLocal(path, key, raw !== null, disk);
        return none;
      }
    }

    const isNew = !doc;
    if (!doc) {
      doc = newDoc();
      this.docs.set(path, doc);
      const newest = metas.filter((m) => states.has(m.device)).sort((a, b) => b.writtenAt - a.writtenAt)[0];
      this.gens.set(path, newest ? newest.gen ?? '' : dead.size ? newGen() : '');
    }
    const beforeSig = hashBytesHex(Y.encodeStateAsUpdate(doc));

    // 1. funde o estado de todos os aparelhos (menos o das gerações apagadas)
    for (const [, b] of live) Y.applyUpdate(doc, b, 'remote');
    const merged = !isNew && hashBytesHex(Y.encodeStateAsUpdate(doc)) !== beforeSig;

    // 2. o .xlsx mudou fora do Tanden?
    const mirrors = metas.flatMap((m) => m.mirrors ?? []);
    const gen = this.gens.get(path) ?? '';
    let ownMirrors = metas.find((m) => m.device === this.deviceId && (m.gen ?? '') === gen)?.mirrors ?? [];
    const file = await this.storage.read(path);
    const fileHash = file ? hashBytesHex(file) : null;

    // apagado fora do Tanden, e nada mudou desde o último .xlsx que este aparelho viu
    if (goneOutside && !file && !merged) {
      const sigNow = hashBytesHex(Y.encodeStateAsUpdate(doc));
      if (mirrors.some((m) => m.h === disk[path] && m.st === sigNow)) {
        await this.remove(path);
        delete disk[path];
        return none;
      }
    }
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
      const meta: DeviceMeta = { path, kind: 'sheet', writtenAt: Date.now(), mirrors: ownMirrors.slice(-MIRRORS_KEPT), gen };
      await this.storage.write(`${DOCS_DIR}${key}/${this.deviceId}.json`, toBytes(JSON.stringify(meta)));
      this.lastWritten.set(path, sig);
      written = true;
    }
    if (finalHash) disk[path] = finalHash;

    if (replaced) this.emit(path, 'remote');
    else if (isNew) this.emit(path, external ? 'external' : 'remote');
    else if (merged) this.emit(path, 'remote');
    else if (external) this.emit(path, 'external');
    return { merged, external, written };
  }
}
