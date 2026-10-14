import * as Y from 'yjs';
import { EventBus } from './events';
import { hashBytesHex, hashHex } from './hash';
import { readText, toBytes, type Storage } from './storage';
import type { SyncOptions } from './vault';

/*
 * Quadros do Tanden: mapas mentais, workflows e desenho.
 *
 * Cada quadro é um arquivo .canvas no formato JSON Canvas, o mesmo do Obsidian:
 * caixas de texto, notas, links e grupos (nodes) ligados por setas (edges).
 * O que o JSON Canvas não tem (o tipo do quadro e os traços de desenho) vai
 * no campo "x-tanden", que o Obsidian ignora.
 *
 * Layout na pasta:
 *   **\/*.canvas                            quadros, abertos também pelo Obsidian
 *   .tanden/board/<chave>/<aparelho>.bin   estado CRDT que aquele aparelho conhece
 *   .tanden/board/<chave>/<aparelho>.json  o que aquele aparelho escreveu no .canvas
 *
 * O merge é por campo: um aparelho move uma caixa enquanto outro muda o texto
 * dela, e as duas mudanças ficam. Edições feitas fora do Tanden (Obsidian)
 * viram uma diferença de três vias contra a versão de onde partiram, então
 * apagar uma caixa no Obsidian apaga aqui, e uma caixa criada em outro
 * aparelho no meio tempo não some.
 */

export type BoardKind = 'mapa' | 'fluxo' | 'livre';

export interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  /** "1" a "6" (paleta do Obsidian) ou "#rrggbb" */
  color?: string;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
  [extra: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: 'top' | 'right' | 'bottom' | 'left';
  toSide?: 'top' | 'right' | 'bottom' | 'left';
  fromEnd?: 'none' | 'arrow';
  toEnd?: 'none' | 'arrow';
  color?: string;
  label?: string;
  [extra: string]: unknown;
}

/** Um traço de desenho. Traços não se editam: ou existem, ou foram apagados. */
export interface InkStroke {
  id: string;
  /** 'pen' é mão livre; os outros são formas técnicas definidas por dois pontos */
  tool: 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse';
  /** x, y, pressão (0 a 1), repetidos */
  points: number[];
  color: string;
  width: number;
}

export interface BoardData {
  kind: BoardKind;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  ink: InkStroke[];
}

/** Operações de edição de um quadro, aplicadas numa transação só. */
export interface BoardEdit {
  setNode(node: Partial<CanvasNode> & { id: string }): void;
  /** apaga a caixa e as setas ligadas a ela */
  deleteNode(id: string): void;
  setEdge(edge: Partial<CanvasEdge> & { id: string }): void;
  deleteEdge(id: string): void;
  addInk(stroke: InkStroke): void;
  deleteInk(id: string): void;
  setKind(kind: BoardKind): void;
  /** traz a caixa para cima das outras */
  raise(id: string): void;
}

const BOARD_DIR = '.tanden/board/';
const MIRRORS_KEPT = 8;
const EXT = '.canvas';

const isBoardPath = (p: string): boolean => p.endsWith(EXT) && !p.startsWith('.tanden/');
const keyFor = (path: string): string => hashHex(path);
const newDoc = (): Y.Doc => new Y.Doc({ gc: false });
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const toB64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Campo interno de ordem (z). Não vai para o .canvas: lá a ordem do array já é o z. */
const Z = '_z';

function maps(doc: Y.Doc) {
  return {
    nodes: doc.getMap<Y.Map<unknown>>('nodes'),
    edges: doc.getMap<Y.Map<unknown>>('edges'),
    ink: doc.getMap<InkStroke>('ink'),
    meta: doc.getMap<unknown>('meta'),
  };
}

function plain(m: Y.Map<unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of m.entries()) o[k] = v;
  return o;
}

const NODE_ORDER = ['id', 'type', 'text', 'file', 'subpath', 'url', 'label', 'x', 'y', 'width', 'height', 'color'];
const EDGE_ORDER = ['id', 'fromNode', 'fromSide', 'fromEnd', 'toNode', 'toSide', 'toEnd', 'color', 'label'];

/** Mesma ordem de campos sempre, para o arquivo não mudar à toa. */
function ordered(o: Record<string, unknown>, order: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of order) if (o[k] !== undefined) out[k] = o[k];
  for (const k of Object.keys(o).sort()) if (!(k in out) && k !== Z && o[k] !== undefined) out[k] = o[k];
  return out;
}

export function readBoard(doc: Y.Doc): BoardData {
  const m = maps(doc);
  const nodes = [...m.nodes.values()]
    .map(plain)
    .sort((a, b) => (Number(a[Z]) || 0) - (Number(b[Z]) || 0) || String(a.id).localeCompare(String(b.id)))
    .map((n) => ordered(n, NODE_ORDER) as CanvasNode);
  const ids = new Set(nodes.map((n) => n.id));
  // seta para uma caixa apagada em outro aparelho ao mesmo tempo: some junto
  const edges = [...m.edges.values()]
    .map(plain)
    .filter((e) => ids.has(e.fromNode as string) && ids.has(e.toNode as string))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((e) => ordered(e, EDGE_ORDER) as CanvasEdge);
  const ink = [...m.ink.values()].sort((a, b) => a.id.localeCompare(b.id));
  const kind = (m.meta.get('kind') as BoardKind | undefined) ?? 'livre';
  return { kind, nodes, edges, ink };
}

/**
 * JSON Canvas legível: um item por linha, tabulação como o Obsidian.
 * Fica fácil de ler num diff e o Obsidian abre normalmente.
 */
export function serializeBoard(b: BoardData): string {
  const list = (items: unknown[]) => (items.length ? `[\n${items.map((i) => `\t\t${JSON.stringify(i)}`).join(',\n')}\n\t]` : '[]');
  const ink = b.ink.length ? `[\n${b.ink.map((s) => `\t\t\t${JSON.stringify(s)}`).join(',\n')}\n\t\t]` : '[]';
  return `{\n\t"nodes":${list(b.nodes)},\n\t"edges":${list(b.edges)},\n\t"x-tanden":{\n\t\t"kind":${JSON.stringify(b.kind)},\n\t\t"ink":${ink}\n\t}\n}\n`;
}

/** Quadro lido de um .canvas. `ink`/`kind` ausentes = o arquivo não fala deles (ex.: salvo pelo Obsidian). */
interface ParsedBoard {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  ink?: InkStroke[];
  kind?: BoardKind;
}

export function parseBoard(text: string): ParsedBoard | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    if (!j || typeof j !== 'object') return null;
    const arr = <T>(v: unknown): T[] =>
      Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') as T[]) : [];
    const x = (j['x-tanden'] ?? null) as { kind?: unknown; ink?: unknown } | null;
    const kind = x && ['mapa', 'fluxo', 'livre'].includes(x.kind as string) ? (x.kind as BoardKind) : undefined;
    return {
      nodes: arr<CanvasNode>(j.nodes),
      edges: arr<CanvasEdge>(j.edges),
      ink: x && Array.isArray(x.ink) ? arr<InkStroke>(x.ink) : undefined,
      kind,
    };
  } catch {
    return null; // arquivo pela metade ou corrompido: o CRDT vence
  }
}

function makeEdit(doc: Y.Doc): BoardEdit {
  const m = maps(doc);
  const topZ = () => Math.max(0, ...[...m.nodes.values()].map((n) => Number(n.get(Z)) || 0));
  const put = (target: Y.Map<Y.Map<unknown>>, obj: Record<string, unknown> & { id: string }, isNode: boolean) => {
    let item = target.get(obj.id);
    if (!item) {
      item = new Y.Map<unknown>();
      target.set(obj.id, item);
      if (isNode && obj[Z] === undefined) item.set(Z, topZ() + 1);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) item.delete(k);
      else if (!same(item.get(k), v)) item.set(k, v);
    }
  };
  return {
    setNode: (n) => put(m.nodes, n, true),
    deleteNode(id) {
      m.nodes.delete(id);
      for (const [eid, e] of m.edges.entries()) if (e.get('fromNode') === id || e.get('toNode') === id) m.edges.delete(eid);
    },
    setEdge: (e) => put(m.edges, e, false),
    deleteEdge: (id) => m.edges.delete(id),
    addInk: (s) => m.ink.set(s.id, s),
    deleteInk: (id) => m.ink.delete(id),
    setKind: (k) => {
      if (m.meta.get('kind') !== k) m.meta.set('kind', k);
    },
    raise(id) {
      const n = m.nodes.get(id);
      if (n && Number(n.get(Z)) !== topZ()) n.set(Z, topZ() + 1);
    },
  };
}

/**
 * Aplica no documento o que mudou de `base` para `next` (diferença de três vias).
 * Sem base, só acrescenta e atualiza: nada é apagado por falta de contexto.
 */
function applyThreeWay(doc: Y.Doc, base: BoardData | null, next: ParsedBoard): void {
  const ed = makeEdit(doc);
  const m = maps(doc);
  const diffItems = <T extends { id: string }>(
    baseItems: T[] | undefined,
    nextItems: T[],
    set: (patch: Record<string, unknown> & { id: string }) => void,
    del: (id: string) => void,
  ) => {
    const before = new Map((baseItems ?? []).map((i) => [i.id, i as Record<string, unknown>]));
    for (const item of nextItems) {
      const b = before.get(item.id);
      const patch: Record<string, unknown> & { id: string } = { id: item.id };
      const keys = new Set([...Object.keys(item), ...(b ? Object.keys(b) : [])]);
      for (const k of keys) {
        if (k === Z) continue;
        const v = (item as Record<string, unknown>)[k];
        if (!b || !same(b[k], v)) patch[k] = v;
      }
      if (Object.keys(patch).length > 1 || !b) set(patch);
    }
    if (baseItems) {
      const now = new Set(nextItems.map((i) => i.id));
      for (const id of before.keys()) if (!now.has(id)) del(id);
    }
  };
  // a ordem no arquivo é o z: se mudou (ou não há base), renumera pela ordem do arquivo
  const order = next.nodes.map((n) => n.id);
  const reorder = !base || !same(order, base.nodes.map((n) => n.id));
  doc.transact(() => {
    diffItems(base?.nodes, next.nodes, (p) => ed.setNode(p), (id) => m.nodes.delete(id));
    if (reorder) order.forEach((id, i) => m.nodes.get(id)?.set(Z, i + 1));
    diffItems(base?.edges, next.edges, (p) => ed.setEdge(p), (id) => m.edges.delete(id));
    if (next.ink) {
      diffItems(base ? base.ink : undefined, next.ink, (p) => m.ink.set(p.id, p as unknown as InkStroke), (id) => m.ink.delete(id));
    }
    if (next.kind && next.kind !== base?.kind) ed.setKind(next.kind);
  }, 'external');
}

/** Distância grosseira entre dois quadros, só para escolher a base mais provável. */
function boardDistance(a: BoardData, b: ParsedBoard): number {
  const ids = (x: { id: string }[]) => new Map(x.map((i) => [i.id, JSON.stringify(i)]));
  let n = 0;
  for (const [x, y] of [
    [a.nodes, b.nodes],
    [a.edges, b.edges],
  ] as const) {
    const A = ids(x);
    const B = ids(y);
    for (const [k, v] of A) if (B.get(k) !== v) n++;
    for (const k of B.keys()) if (!A.has(k)) n++;
  }
  return n;
}

interface DeviceMeta {
  path: string;
  hash: string;
  writtenAt: number;
  mirrors?: Array<{ h: string; s: string }>;
  absorbed?: string[];
}

export class BoardStore {
  readonly bus: EventBus;
  private docs = new Map<string, Y.Doc>();
  private lastWritten = new Map<string, string>();

  constructor(
    readonly storage: Storage,
    readonly deviceId: string,
    bus?: EventBus,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) throw new Error('deviceId deve ter só letras, números, - ou _');
    this.bus = bus ?? new EventBus();
  }

  list(): string[] {
    return [...this.docs.keys()].sort();
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  read(path: string): BoardData {
    return readBoard(this.doc(path));
  }

  private doc(path: string): Y.Doc {
    const d = this.docs.get(path);
    if (!d) throw new Error(`Quadro não encontrado: ${path}`);
    return d;
  }

  create(path: string, kind: BoardKind, fill?: (e: BoardEdit) => void): void {
    if (!isBoardPath(path)) throw new Error(`Caminho de quadro inválido: ${path}`);
    if (this.docs.has(path)) throw new Error(`Quadro já existe: ${path}`);
    const doc = newDoc();
    doc.transact(() => {
      const e = makeEdit(doc);
      e.setKind(kind);
      fill?.(e);
    }, 'local');
    this.docs.set(path, doc);
    this.bus.emit({ type: 'board.created', path });
  }

  edit(path: string, fn: (e: BoardEdit) => void): void {
    const doc = this.doc(path);
    doc.transact(() => fn(makeEdit(doc)), 'local');
    this.bus.emit({ type: 'board.changed', path, origin: 'local' });
  }

  /** Desfazer/refazer só das edições deste aparelho, nunca as que chegaram de outro. */
  undoManager(path: string): Y.UndoManager {
    const m = maps(this.doc(path));
    return new Y.UndoManager([m.nodes, m.edges, m.ink, m.meta], { trackedOrigins: new Set(['local']), captureTimeout: 400 });
  }

  sync(opts: SyncOptions = {}): Promise<{ merged: number; external: number; written: number }> {
    return this.bus.process(`sync-board:${this.deviceId}`, 'Sincronizando quadros', () => this.doSync(opts));
  }

  private get diskPath(): string {
    return `.tanden/local/${this.deviceId}/boards.json`;
  }

  private async doSync(opts: SyncOptions) {
    const report = { merged: 0, external: 0, written: 0 };
    const all = await this.storage.list();
    let disk: Record<string, string> = {};
    try {
      disk = JSON.parse((await readText(this.storage, this.diskPath)) ?? '{}') as Record<string, string>;
    } catch {
      disk = {};
    }
    const byKey = new Map<string, string[]>();
    for (const p of all) {
      if (!p.startsWith(BOARD_DIR)) continue;
      const key = p.slice(BOARD_DIR.length).split('/')[0]!;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(p);
    }
    const paths = new Set<string>(all.filter(isBoardPath));
    for (const p of this.docs.keys()) paths.add(p);
    for (const files of byKey.values())
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const meta = await this.readMeta(f);
        if (meta && isBoardPath(meta.path)) paths.add(meta.path);
      }
    for (const path of [...paths].sort()) {
      const r = await this.syncBoard(path, byKey.get(keyFor(path)) ?? [], disk, opts);
      if (r.merged) report.merged++;
      if (r.external) report.external++;
      if (r.written) report.written++;
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

  private async syncBoard(path: string, files: string[], disk: Record<string, string>, opts: SyncOptions) {
    const key = keyFor(path);
    let doc = this.docs.get(path);
    const isNew = !doc;
    if (!doc) {
      doc = newDoc();
      this.docs.set(path, doc);
    }
    const before = serializeBoard(readBoard(doc));

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
    const merged = !isNew && serializeBoard(readBoard(doc)) !== before;

    // 2. o .canvas mudou fora do Tanden?
    let external = false;
    let absorbedNow: string | null = null;
    const raw = await readText(this.storage, path);
    const parsed = raw === null ? null : parseBoard(raw);
    if (parsed) {
      // compara já normalizado: o Obsidian reescreve com outra formatação
      const ext: BoardData = { kind: parsed.kind ?? readBoard(doc).kind, nodes: parsed.nodes, edges: parsed.edges, ink: parsed.ink ?? readBoard(doc).ink };
      const extNorm = serializeBoard(normalize(ext));
      const extHash = hashHex(extNorm);
      if (extNorm !== serializeBoard(readBoard(doc))) {
        const mirrors = metas.flatMap((m) => m.mirrors ?? []);
        const known = metas.some((m) => m.hash === extHash || m.absorbed?.includes(extHash)) || mirrors.some((m) => m.h === extHash);
        if (!known) {
          const hints: string[] = [];
          if (opts.downloaded?.has(path) && opts.previousVersions) {
            for (const t of await opts.previousVersions(path)) {
              const p = parseBoard(t);
              if (p) hints.push(hashHex(serializeBoard(normalize({ kind: p.kind ?? 'livre', nodes: p.nodes, edges: p.edges, ink: p.ink ?? [] }))));
            }
          } else if (disk[path]) {
            hints.push(disk[path]);
          }
          const rebuild = (m: { h: string; s: string }): BoardData | null => {
            try {
              return readBoard(Y.createDocFromSnapshot(doc, Y.decodeSnapshot(fromB64(m.s)), newDoc()));
            } catch {
              return null;
            }
          };
          let base: { h: string; data: BoardData } | null = null;
          for (const h of hints) {
            const m = mirrors.find((x) => x.h === h);
            const data = m && rebuild(m);
            if (m && data) {
              base = { h, data };
              break;
            }
          }
          if (!base) {
            let best = Infinity;
            for (const m of mirrors) {
              const data = rebuild(m);
              if (!data) continue;
              const d = boardDistance(data, parsed);
              if (d < best) [best, base] = [d, { h: m.h, data }];
            }
          }
          applyThreeWay(doc, base?.data ?? null, parsed);
          external = true;
          absorbedNow = extHash;
        }
      }
    }

    // 3. grava o que este aparelho sabe
    const finalText = serializeBoard(readBoard(doc));
    const state = Y.encodeStateAsUpdate(doc);
    const sig = hashBytesHex(state);
    const hash = hashHex(finalText);
    let written = false;
    if (this.lastWritten.get(path) !== sig || raw !== finalText) {
      await this.storage.write(`${BOARD_DIR}${key}/${this.deviceId}.bin`, state);
      const own = metas.find((m) => m.device === this.deviceId);
      const mirrors = [...(own?.mirrors ?? []).filter((m) => m.h !== hash), { h: hash, s: toB64(Y.encodeSnapshot(Y.snapshot(doc))) }];
      const absorbed = [...(own?.absorbed ?? []), ...(absorbedNow ? [absorbedNow] : [])].slice(-MIRRORS_KEPT * 2);
      const meta: DeviceMeta = { path, hash, writtenAt: Date.now(), mirrors: mirrors.slice(-MIRRORS_KEPT), absorbed };
      await this.storage.write(`${BOARD_DIR}${key}/${this.deviceId}.json`, toBytes(JSON.stringify(meta)));
      if (raw !== finalText) await this.storage.write(path, toBytes(finalText));
      this.lastWritten.set(path, sig);
      written = true;
    }
    disk[path] = hash;

    if (isNew) this.bus.emit({ type: 'board.created', path });
    else if (merged) this.bus.emit({ type: 'board.changed', path, origin: 'remote' });
    if (external) this.bus.emit({ type: 'board.changed', path, origin: 'external' });
    return { merged, external, written };
  }
}

/** Mesma forma que readBoard produziria: ordem de campos e de itens. */
function normalize(b: BoardData): BoardData {
  return {
    kind: b.kind,
    nodes: b.nodes.map((n) => ordered(n, NODE_ORDER) as CanvasNode),
    edges: [...b.edges].sort((x, y) => x.id.localeCompare(y.id)).map((e) => ordered(e, EDGE_ORDER) as CanvasEdge),
    ink: [...b.ink].sort((x, y) => x.id.localeCompare(y.id)),
  };
}
