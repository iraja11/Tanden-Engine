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
const LOCAL_DIR = '.tanden/local/';
const MIRRORS_KEPT = 8;

interface DeviceMeta {
  path: string;
  /** hash do .md que este aparelho escreveu por último */
  mdHash: string;
  writtenAt: number;
  /**
   * Últimos .md que este aparelho escreveu: hash e snapshot Yjs (base64).
   * Um snapshot é pequeno (vetor de estado + apagamentos) e, com o histórico
   * completo do documento, reconstrói exatamente aquele texto. É a base de
   * qualquer edição feita fora do Tanden a partir daquele .md.
   */
  mirrors?: Array<{ h: string; s: string }>;
  /** hashes de .md editados fora do Tanden que este aparelho já incorporou */
  absorbed?: string[];
}

const toB64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// gc desligado: o documento guarda o que foi apagado, para reconstruir versões antigas
const newDoc = (): Y.Doc => new Y.Doc({ gc: false });

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

/**
 * Aplica a diferença entre o texto atual de `t` e `target`. Com `semantic`, os
 * trechos são agrupados em palavras inteiras em vez de letras soltas, o que deixa
 * a fusão com edições concorrentes previsível (usado em edições externas).
 */
function applyDiff(t: Y.Text, target: string, semantic = false): void {
  const current = t.toString();
  if (current === target) return;
  let pos = 0;
  for (const [op, chunk] of diff(current, target, undefined, semantic)) {
    if (op === diff.EQUAL) pos += chunk.length;
    else if (op === diff.DELETE) t.delete(pos, chunk.length);
    else {
      t.insert(pos, chunk);
      pos += chunk.length;
    }
  }
}

/** Quantas linhas separam dois textos (inseridas + apagadas). Só para desempate. */
function lineDistance(a: string, b: string): number {
  const ids = new Map<string, string>();
  const enc = (t: string) =>
    t.split('\n').map((l) => ids.get(l) ?? (ids.set(l, String.fromCharCode(0xe000 + ids.size)), ids.get(l)!)).join('');
  let n = 0;
  for (const [op, chunk] of diff(enc(a), enc(b))) if (op !== diff.EQUAL) n += chunk.length;
  return n;
}

export interface SyncOptions {
  /**
   * Notas cujo .md acabou de chegar de outro lugar (ex.: baixado do Drive) e,
   * para cada uma, os conteúdos anteriores daquele arquivo lá, do mais novo ao
   * mais antigo. Diz de qual versão uma edição externa partiu.
   */
  previousVersions?: (path: string) => Promise<string[]>;
  downloaded?: ReadonlySet<string>;
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
    const doc = newDoc();
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
  sync(opts: SyncOptions = {}): Promise<SyncReport> {
    return this.bus.process(`sync:${this.deviceId}`, 'Sincronizando', () => this.doSync(opts));
  }

  private get diskPath(): string {
    return `${LOCAL_DIR}${this.deviceId}/disk.json`;
  }

  private async doSync(opts: SyncOptions): Promise<SyncReport> {
    const report: SyncReport = { merged: 0, external: 0, written: 0 };
    const all = await this.storage.list();
    // hash do .md que este aparelho deixou no disco no último sync, por nota
    let disk: Record<string, string> = {};
    try {
      disk = JSON.parse((await readText(this.storage, this.diskPath)) ?? '{}') as Record<string, string>;
    } catch {
      disk = {};
    }

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
      const r = await this.syncNote(path, crdtByKey.get(keyFor(path)) ?? [], disk, opts);
      if (r.merged) report.merged++;
      if (r.external) report.external++;
      if (r.written) report.written++;
    }
    await this.storage.write(this.diskPath, toBytes(JSON.stringify(disk)));
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

  private async syncNote(path: string, files: string[], disk: Record<string, string>, opts: SyncOptions) {
    const key = keyFor(path);
    let doc = this.docs.get(path);
    const isNew = !doc;
    if (!doc) {
      doc = newDoc();
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
    let absorbedNow: string | null = null;
    const md = await readText(this.storage, path);
    if (md !== null && md !== text.toString()) {
      const mdHash = hashHex(md);
      const mirrors = metas.flatMap((m) => m.mirrors ?? []);
      // já é um espelho conhecido, ou outro aparelho já incorporou esta mesma edição
      // (as operações dele chegaram junto com o estado que acabamos de fundir)
      const known =
        metas.some((m) => m.mdHash === mdHash || m.absorbed?.includes(mdHash)) || mirrors.some((m) => m.h === mdHash);
      if (!known) {
        // A edição partiu de algum .md que um aparelho escreveu antes. Qual?
        // - .md baixado agora: a versão anterior daquele arquivo no Drive;
        // - .md editado neste disco: o que este aparelho deixou nele no último sync.
        // Se nenhuma for um espelho conhecido, usa o espelho mais parecido.
        const hints: string[] = [];
        if (opts.downloaded?.has(path) && opts.previousVersions) {
          for (const t of await opts.previousVersions(path)) hints.push(hashHex(t));
        } else if (disk[path]) {
          hints.push(disk[path]);
        }
        const rebuild = (m: { h: string; s: string }): Y.Doc | null => {
          try {
            return Y.createDocFromSnapshot(doc, Y.decodeSnapshot(fromB64(m.s)), newDoc());
          } catch {
            return null; // histórico daquele aparelho ainda incompleto aqui
          }
        };
        let base: { h: string; fork: Y.Doc } | null = null;
        for (const h of hints) {
          const m = mirrors.find((x) => x.h === h);
          const fork = m && rebuild(m);
          if (m && fork) {
            base = { h: m.h, fork };
            break;
          }
        }
        if (!base) {
          let best = Infinity;
          for (const m of mirrors) {
            const fork = rebuild(m);
            if (!fork) continue;
            const dist = lineDistance(textOf(fork).toString(), md);
            if (dist < best) [best, base] = [dist, { h: m.h, fork }];
          }
        }
        if (base || text.length === 0) {
          const fork = base?.fork ?? newDoc();
          fork.clientID = clientIdFor(`${path}\0${base?.h ?? ''}\0${md}`);
          applyDiff(textOf(fork), md);
          Y.applyUpdate(doc, Y.encodeStateAsUpdate(fork), 'external');
          external = true;
          absorbedNow = mdHash;
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
      const own = metas.find((m) => m.device === this.deviceId);
      const mirrors = [...(own?.mirrors ?? []).filter((m) => m.h !== mdHash), { h: mdHash, s: toB64(Y.encodeSnapshot(Y.snapshot(doc))) }];
      const absorbed = [...(own?.absorbed ?? []), ...(absorbedNow ? [absorbedNow] : [])].slice(-MIRRORS_KEPT * 2);
      const meta: DeviceMeta = { path, mdHash, writtenAt: Date.now(), mirrors: mirrors.slice(-MIRRORS_KEPT), absorbed };
      await this.storage.write(`${CRDT_DIR}${key}/${this.deviceId}.json`, toBytes(JSON.stringify(meta)));
      if (md !== finalText) await this.storage.write(path, toBytes(finalText));
      this.lastWritten.set(path, { state: stateSig, mdHash });
      written = true;
    }

    disk[path] = mdHash;

    if (isNew) this.bus.emit({ type: 'note.created', path });
    else if (merged) this.bus.emit({ type: 'note.changed', path, origin: 'remote' });
    if (external) this.bus.emit({ type: 'note.changed', path, origin: 'external' });
    return { merged, external, written };
  }
}
