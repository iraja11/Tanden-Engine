import * as Y from 'yjs';
import { EventBus } from './events';
import { hashBytesHex, hashHex } from './hash';
import { readText, toBytes, type Storage } from './storage';
import type { SyncOptions } from './vault';

/*
 * Anotações de PDF: realces, sublinhados, riscos, comentários, caixas e
 * traços de caneta.
 *
 * O PDF em si nunca é reescrito: as anotações moram num CRDT ao lado, por
 * aparelho, e se fundem como as notas (comentário editado no celular e cor
 * trocada no PC ficam as duas). Para levar para outro programa, o app exporta
 * um PDF com anotações de verdade (que qualquer leitor mostra) ou uma nota.
 *
 *   .tanden/annot/<chave>/<aparelho>.bin    estado CRDT que aquele aparelho conhece
 *   .tanden/annot/<chave>/<aparelho>.json   { path } para achar o PDF a partir da chave
 *
 * Coordenadas em pontos do PDF (origem no canto inferior esquerdo da página,
 * sem rotação), as mesmas de uma anotação nativa. Não dependem de zoom.
 */

export type AnnotKind = 'highlight' | 'underline' | 'strike' | 'note' | 'ink' | 'box';

export interface PdfAnnotation {
  id: string;
  /** página, começando em 1 */
  page: number;
  kind: AnnotKind;
  color: string;
  /** realce/sublinhado/risco: um retângulo por linha; caixa: um só; nota: o ponto [x, y, x, y] */
  rects?: number[][];
  /** caneta: um traço por item, x/y alternados */
  ink?: number[][];
  width?: number;
  /** trecho do PDF que foi marcado */
  text?: string;
  /** o que você escreveu sobre ele */
  comment?: string;
  created: number;
  device: string;
}

export interface AnnotEdit {
  add(a: Omit<PdfAnnotation, 'created' | 'device'> & Partial<Pick<PdfAnnotation, 'created' | 'device'>>): void;
  update(id: string, patch: Partial<Omit<PdfAnnotation, 'id'>>): void;
  remove(id: string): void;
}

const DIR = '.tanden/annot/';
const keyFor = (path: string): string => hashHex(path);
const newDoc = (): Y.Doc => new Y.Doc({ gc: true });
const items = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('annotations');

function read(doc: Y.Doc): PdfAnnotation[] {
  const out: PdfAnnotation[] = [];
  for (const m of items(doc).values()) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of m.entries()) o[k] = v;
    if (typeof o.id === 'string' && typeof o.page === 'number') out.push(o as unknown as PdfAnnotation);
  }
  // ordem de leitura: página, de cima para baixo, da esquerda para a direita
  const top = (a: PdfAnnotation) => a.rects?.[0]?.[3] ?? a.ink?.[0]?.[1] ?? 0;
  const left = (a: PdfAnnotation) => a.rects?.[0]?.[0] ?? a.ink?.[0]?.[0] ?? 0;
  return out.sort((a, b) => a.page - b.page || top(b) - top(a) || left(a) - left(b) || a.created - b.created);
}

export class AnnotationStore {
  readonly bus: EventBus;
  private docs = new Map<string, Y.Doc>();
  private lastWritten = new Map<string, string>();
  private listeners = new Set<(path: string, origin: 'local' | 'remote') => void>();

  constructor(
    readonly storage: Storage,
    readonly deviceId: string,
    bus?: EventBus,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) throw new Error('deviceId deve ter só letras, números, - ou _');
    this.bus = bus ?? new EventBus();
  }

  /** PDFs que têm anotações (em qualquer aparelho). */
  annotated(): string[] {
    return [...this.docs].filter(([, d]) => items(d).size > 0).map(([p]) => p).sort();
  }

  list(path: string): PdfAnnotation[] {
    const d = this.docs.get(path);
    return d ? read(d) : [];
  }

  onChange(fn: (path: string, origin: 'local' | 'remote') => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private doc(path: string): Y.Doc {
    let d = this.docs.get(path);
    if (!d) this.docs.set(path, (d = newDoc()));
    return d;
  }

  edit(path: string, fn: (e: AnnotEdit) => void): void {
    const doc = this.doc(path);
    const map = items(doc);
    doc.transact(() => {
      fn({
        add: (a) => {
          const m = new Y.Map<unknown>();
          map.set(a.id, m);
          for (const [k, v] of Object.entries({ created: Date.now(), device: this.deviceId, ...a })) if (v !== undefined) m.set(k, v);
        },
        update: (id, patch) => {
          const m = map.get(id);
          if (!m) return;
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '') m.delete(k);
            else if (JSON.stringify(m.get(k)) !== JSON.stringify(v)) m.set(k, v);
          }
        },
        remove: (id) => map.delete(id),
      });
    }, 'local');
    this.bus.emit({ type: 'annot.changed', path, origin: 'local' });
    for (const l of this.listeners) l(path, 'local');
  }

  /** Desfazer/refazer só o que este aparelho fez. */
  undoManager(path: string): Y.UndoManager {
    return new Y.UndoManager(items(this.doc(path)), { trackedOrigins: new Set(['local']), captureTimeout: 300 });
  }

  sync(_opts: SyncOptions = {}): Promise<{ merged: number; written: number }> {
    return this.bus.process(`sync-annot:${this.deviceId}`, 'Sincronizando anotações', () => this.doSync());
  }

  private async doSync() {
    const report = { merged: 0, written: 0 };
    const files = await this.storage.list(DIR);
    const byKey = new Map<string, string[]>();
    for (const f of files) {
      const key = f.slice(DIR.length).split('/')[0]!;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(f);
    }
    const paths = new Set(this.docs.keys());
    for (const fs of byKey.values()) {
      for (const f of fs) {
        if (!f.endsWith('.json')) continue;
        try {
          const meta = JSON.parse((await readText(this.storage, f)) ?? '{}') as { path?: string };
          if (meta.path) paths.add(meta.path);
        } catch {
          // arquivo pela metade: o próximo sync acerta
        }
      }
    }
    for (const path of [...paths].sort()) {
      const key = keyFor(path);
      const doc = this.doc(path);
      const before = hashBytesHex(Y.encodeStateVector(doc));
      for (const f of byKey.get(key) ?? []) {
        if (!f.endsWith('.bin')) continue;
        const b = await this.storage.read(f);
        if (b) {
          try {
            Y.applyUpdate(doc, b, 'remote');
          } catch {
            // estado corrompido de outro aparelho: ignora, o dele se refaz no próximo envio
          }
        }
      }
      const merged = hashBytesHex(Y.encodeStateVector(doc)) !== before;
      if (merged) {
        report.merged++;
        this.bus.emit({ type: 'annot.changed', path, origin: 'remote' });
        for (const l of this.listeners) l(path, 'remote');
      }
      const state = Y.encodeStateAsUpdate(doc);
      const sig = hashBytesHex(state);
      if (this.lastWritten.get(path) !== sig) {
        const own = `${DIR}${key}/${this.deviceId}`;
        const known = await this.storage.read(`${own}.bin`);
        if (!known || hashBytesHex(known) !== sig) {
          // documento sem nenhuma anotação nem histórico não vira arquivo
          if (items(doc).size > 0 || known) {
            await this.storage.write(`${own}.bin`, state);
            await this.storage.write(`${own}.json`, toBytes(JSON.stringify({ path })));
            report.written++;
          }
        }
        this.lastWritten.set(path, sig);
      }
    }
    return report;
  }
}

/* ------------------------------------------------------------ exportar */

const pdfLink = (pdf: string, page: number, label: string) => `[[${pdf}#page=${page}|${label}]]`;
const CALLOUT: Record<AnnotKind, string> = {
  highlight: 'quote',
  underline: 'quote',
  strike: 'quote',
  note: 'note',
  ink: 'abstract',
  box: 'example',
};

/** Nota com as anotações, em ordem, com links que abrem o PDF na página (Obsidian e Tanden). */
export function annotationsToMarkdown(pdfPath: string, list: PdfAnnotation[], opts: { title?: string } = {}): string {
  const name = pdfPath.split('/').pop()!.replace(/\.pdf$/i, '');
  const out = [`# ${opts.title ?? `Anotações: ${name}`}`, '', `Arquivo: [[${pdfPath}]] · ${list.length} anotaç${list.length === 1 ? 'ão' : 'ões'}`];
  let page = -1;
  for (const a of list) {
    if (a.page !== page) {
      page = a.page;
      out.push('', `## ${pdfLink(pdfPath, page, `Página ${page}`)}`);
    }
    const head =
      a.kind === 'note'
        ? 'Comentário'
        : a.kind === 'ink'
          ? 'Desenho'
          : a.kind === 'box'
            ? 'Área marcada'
            : a.kind === 'strike'
              ? 'Riscado'
              : a.kind === 'underline'
                ? 'Sublinhado'
                : 'Realce';
    const lines = [`> [!${CALLOUT[a.kind]}] ${head} · ${pdfLink(pdfPath, a.page, `p. ${a.page}`)}`];
    if (a.text) lines.push(...a.text.trim().split('\n').map((l) => `> ${a.kind === 'strike' ? `~~${l}~~` : a.kind === 'highlight' ? `==${l}==` : l}`));
    if (a.comment) {
      if (a.text) lines.push('>');
      lines.push(...a.comment.trim().split('\n').map((l) => `> ${l}`));
    }
    out.push('', lines.join('\n'));
  }
  return `${out.join('\n')}\n`;
}
