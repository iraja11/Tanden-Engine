import * as Y from 'yjs';
import diff from 'fast-diff';
import { EventBus } from './events';
import { clientIdFor, hashBytesHex, hashHex } from './hash';
import { readText, toBytes, type Storage } from './storage';

/*
 * Cofre do Tanden.
 *
 * Layout na pasta (no Drive ou no disco):
 *   **\/*.md                                notas, legíveis por qualquer app (Obsidian incluso)
 *   .tanden/crdt/<chave>/<aparelho>.bin    estado CRDT completo que aquele aparelho conhece
 *   .tanden/crdt/<chave>/<aparelho>.json   o que aquele aparelho escreveu no .md e quando
 *
 * Cada aparelho só escreve os próprios arquivos em .tanden/, então dois aparelhos
 * nunca brigam pelo mesmo arquivo. O merge acontece ao ler: o CRDT funde
 * todas as versões sem perder nada.
 *
 * Edições feitas fora do Tanden (Obsidian, editor do Drive) são detectadas
 * comparando o .md com o que os aparelhos declararam ter escrito. A diferença
 * vira operações CRDT sobre a versão de onde ela partiu, com um clientID
 * determinístico: se dois aparelhos detectarem a mesma edição externa, geram
 * operações idênticas e o CRDT não duplica o texto.
 */

const META_DIR = '.tanden/';
const CRDT_DIR = '.tanden/crdt/';

interface DeviceMeta {
  path: string;
  /** hash do .md que este aparelho escreveu por último */
  mdHash: string;
  writtenAt: number;
}

export interface SyncReport {
  /** notas que receberam mudanças de outros aparelhos */
  merged: number;
  /** notas com edições feitas fora do Tanden */
  external: number;
  /** notas cujo .md ou estado foi reescrito por este aparelho */
  written: number;
}

const keyFor = (path: string): string => hashHex(path);
const isNotePath = (p: string): boolean => p.endsWith('.md') && !p.startsWith(META_DIR);

function textOf(doc: Y.Doc): Y.Text {
  return doc.getText('body');
}

/** Aplica a diferença entre o texto atual de `t` e `target`, com o mínimo de operações. */
function applyDiff(t: Y.Text, target: string): void {
  const current = t.toString();
  if (current === target) return;
  let pos = 0;
  for (const [op, chunk] of diff(current, target)) {
    if (op === diff.EQUAL) pos += chunk.length;
    else if (op === diff.DELETE) t.delete(pos, chunk.length);
    else {
      t.insert(pos, chunk);
      pos += chunk.length;
    }
  }
}

export class Vault {
  readonly bus: EventBus;
  private docs = new Map<string, Y.Doc>();
  /** estado que este aparelho gravou por último, para não reescrever à toa */
  private lastWritten = new Map<string, { state: string; mdHash: string }>();

  constructor(
    readonly storage: Storage,
    readonly deviceId: string,
    bus?: EventBus,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) throw new Error('deviceId deve ter só letras, números, - ou _');
    this.bus = bus ?? new EventBus();
  }

  /** Caminhos das notas conhecidas por este aparelho, em ordem. */
  list(): string[] {
    return [...this.docs.keys()].sort();
  }

  read(path: string): string {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`Nota não encontrada: ${path}`);
    return textOf(doc).toString();
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  /** Cria uma nota nova neste aparelho. Ela vai para a pasta no próximo sync. */
  create(path: string, content = ''): void {
    if (!isNotePath(path)) throw new Error(`Caminho de nota inválido: ${path}`);
    if (this.docs.has(path)) throw new Error(`Nota já existe: ${path}`);
    const doc = new Y.Doc();
    textOf(doc).insert(0, content);
    this.docs.set(path, doc);
    this.bus.emit({ type: 'note.created', path });
  }

  /** Substitui o conteúdo da nota; só a diferença vira operação CRDT. */
  write(path: string, content: string): void {
    this.edit(path, (t) => applyDiff(t, content));
  }

  /** Edição direta no texto CRDT (inserir, apagar em posições). */
  edit(path: string, fn: (text: Y.Text) => void): void {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`Nota não encontrada: ${path}`);
    doc.transact(() => fn(textOf(doc)), 'local');
    this.bus.emit({ type: 'note.changed', path, origin: 'local' });
  }

  /** Lê a pasta, funde tudo e grava o estado e os .md deste aparelho. */
  sync(): Promise<SyncReport> {
    return this.bus.process(`sync:${this.deviceId}`, 'Sincronizando', () => this.doSync());
  }

  private async doSync(): Promise<SyncReport> {
    const report: SyncReport = { merged: 0, external: 0, written: 0 };
    const all = await this.storage.list();

    // agrupa os arquivos de estado por nota
    const crdtByKey = new Map<string, string[]>();
    for (const p of all) {
      if (!p.startsWith(CRDT_DIR)) continue;
      const key = p.slice(CRDT_DIR.length).split('/')[0]!;
      (crdtByKey.get(key) ?? crdtByKey.set(key, []).get(key)!).push(p);
    }

    // descobre o caminho de cada nota: .md existentes, metas de outros aparelhos e notas locais
    const paths = new Set<string>(all.filter(isNotePath));
    for (const p of this.docs.keys()) paths.add(p);
    for (const files of crdtByKey.values()) {
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const meta = await this.readMeta(f);
        if (meta) paths.add(meta.path);
      }
    }

    for (const path of [...paths].sort()) {
      const r = await this.syncNote(path, crdtByKey.get(keyFor(path)) ?? []);
      if (r.merged) report.merged++;
      if (r.external) report.external++;
      if (r.written) report.written++;
    }
    this.bus.emit({ type: 'sync.finished', ...report });
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

  private async syncNote(path: string, files: string[]) {
    const key = keyFor(path);
    let doc = this.docs.get(path);
    const isNew = !doc;
    if (!doc) {
      doc = new Y.Doc();
      this.docs.set(path, doc);
    }
    const text = textOf(doc);
    const before = text.toString();

    // 1. funde o estado de todos os aparelhos
    const states = new Map<string, Uint8Array>();
    const metas: Array<DeviceMeta & { device: string }> = [];
    for (const f of files) {
      const device = f.slice(f.lastIndexOf('/') + 1).replace(/\.(bin|json)$/, '');
      if (f.endsWith('.bin')) {
        const b = await this.storage.read(f);
        if (b) states.set(device, b);
      } else if (f.endsWith('.json')) {
        const m = await this.readMeta(f);
        if (m) metas.push({ ...m, device });
      }
    }
    for (const b of states.values()) Y.applyUpdate(doc, b, 'remote');
    const merged = text.toString() !== before;

    // 2. o .md mudou fora do Tanden?
    let external = false;
    const md = await readText(this.storage, path);
    if (md !== null && md !== text.toString()) {
      const mdHash = hashHex(md);
      const mirroredBySomeone = metas.some((m) => m.mdHash === mdHash);
      if (!mirroredBySomeone) {
        // parte da versão de quem escreveu o .md por último
        const author = metas.filter((m) => states.has(m.device)).sort((a, b) => b.writtenAt - a.writtenAt)[0];
        const baseState = author ? states.get(author.device)! : null;
        if (baseState || text.length === 0) {
          const fork = new Y.Doc();
          if (baseState) Y.applyUpdate(fork, baseState);
          fork.clientID = clientIdFor(`${path}\0${baseState ? hashBytesHex(baseState) : ''}\0${md}`);
          applyDiff(textOf(fork), md);
          Y.applyUpdate(doc, Y.encodeStateAsUpdate(fork), 'external');
          external = true;
        }
        // sem histórico e com conteúdo local: o .md é antigo, o CRDT vence
      }
    }

    // 3. grava o que este aparelho sabe
    const finalText = text.toString();
    const state = Y.encodeStateAsUpdate(doc);
    const stateSig = hashBytesHex(state);
    const mdHash = hashHex(finalText);
    const prev = this.lastWritten.get(path);
    let written = false;
    if (!prev || prev.state !== stateSig || md !== finalText) {
      await this.storage.write(`${CRDT_DIR}${key}/${this.deviceId}.bin`, state);
      const meta: DeviceMeta = { path, mdHash, writtenAt: Date.now() };
      await this.storage.write(`${CRDT_DIR}${key}/${this.deviceId}.json`, toBytes(JSON.stringify(meta)));
      if (md !== finalText) await this.storage.write(path, toBytes(finalText));
      this.lastWritten.set(path, { state: stateSig, mdHash });
      written = true;
    }

    if (isNew) this.bus.emit({ type: 'note.created', path });
    else if (merged) this.bus.emit({ type: 'note.changed', path, origin: 'remote' });
    if (external) this.bus.emit({ type: 'note.changed', path, origin: 'external' });
    return { merged, external, written };
  }
}
