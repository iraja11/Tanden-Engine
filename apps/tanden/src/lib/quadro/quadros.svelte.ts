import { boardFromGraph, mindMapFromNote, noteFromBoard, type BoardEdit, type BoardKind, type GraphItem } from '@tanden/core';
import { engine } from '../engine.svelte';

/*
 * Quadros vistos de fora da tela de quadros: abrir um quadro pelo nome (links,
 * paleta, grafo), criar a partir de uma nota ou de um pedaço do grafo, e as
 * operações de arquivo (renomear, duplicar, apagar, virar nota).
 */

const LAST = 'tanden.quadro.last';
const strip = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
export const boardTitle = (p: string) => p.replace(/\.canvas$/, '').split('/').pop()!;

class Quadros {
  /** pedido para a tela de quadros abrir este quadro */
  request = $state<{ path: string; seq: number; organize?: boolean } | null>(null);
  /** pedido para o app trocar para a tela de quadros */
  goto = $state(0);
  private seq = 0;

  open(path: string, opts: { organize?: boolean } = {}): void {
    try {
      localStorage.setItem(LAST, path);
    } catch {
      /* sem armazenamento: abre só agora */
    }
    this.request = { path, seq: ++this.seq, ...opts };
    this.goto++;
  }

  /** Caminho livre em Quadros/ com esse nome. */
  freePath(name: string, folder = 'Quadros'): string {
    const base = strip(name) || 'Quadro';
    let p = `${folder}/${base}.canvas`;
    let n = 1;
    while (engine.boards.has(p)) p = `${folder}/${base} ${++n}.canvas`;
    return p;
  }

  create(name: string, kind: BoardKind, fill?: (e: BoardEdit) => void, opts: { organize?: boolean } = {}): string {
    const p = this.freePath(name);
    engine.boards.create(p, kind, fill);
    engine.boardList = engine.boards.list();
    engine.boardEdited();
    this.open(p, opts);
    return p;
  }

  /** Títulos e listas da nota viram um mapa mental. A nota não muda. */
  fromNote(notePath: string): string {
    const title = notePath.replace(/\.md$/, '').split('/').pop()!;
    const m = mindMapFromNote(title, engine.vault.read(notePath));
    // a raiz aponta para a nota: dois cliques abrem, e o grafo liga a nota ao mapa
    const target = notePath.replace(/\.md$/, '');
    m.nodes[0]!.text = target === title ? `[[${title}]]` : `[[${target}|${title}]]`;
    return this.create(`Mapa de ${title}`, 'mapa', (e) => {
      for (const n of m.nodes) e.setNode(n);
      for (const x of m.edges) e.setEdge(x);
    }, { organize: true });
  }

  /** O que está no grafo (com as posições dele) vira um quadro de cartões ligados. */
  fromGraph(name: string, items: GraphItem[], links: { from: string; to: string }[], center?: string): string {
    const b = boardFromGraph(items, links, { center });
    return this.create(name, 'fluxo', (e) => {
      for (const n of b.nodes) e.setNode(n);
      for (const x of b.edges) e.setEdge(x);
    });
  }

  /** O mapa (ou quadro) vira uma nota em tópicos, ao lado dos quadros. */
  toNote(path: string): string {
    const text = noteFromBoard(engine.boards.read(path));
    const base = strip(boardTitle(path)) || 'Quadro';
    let p = `${base}.md`;
    let n = 1;
    while (engine.vault.has(p)) p = `${base} ${++n}.md`;
    engine.writeNote(p, text);
    return p;
  }

  async rename(from: string, name: string): Promise<string | null> {
    const clean = strip(name);
    if (!clean) return null;
    const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
    const to = `${dir}${clean}.canvas`;
    if (to === from) return from;
    if (engine.boards.has(to)) throw new Error(`Já existe um quadro chamado "${clean}".`);
    await engine.boards.rename(from, to);
    engine.boardList = engine.boards.list();
    engine.boardEdited();
    this.open(to);
    return to;
  }

  duplicate(from: string): string {
    const to = this.freePath(`${boardTitle(from)} (cópia)`, from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : 'Quadros');
    engine.boards.duplicate(from, to);
    engine.boardList = engine.boards.list();
    engine.boardEdited();
    this.open(to);
    return to;
  }

  /** Apaga (cópia em .trash/). Devolve onde ficou a cópia. */
  async remove(path: string): Promise<string | null> {
    const trashed = await engine.boards.remove(path);
    engine.boardList = engine.boards.list();
    engine.boardEdited();
    return trashed;
  }
}

export const quadros = new Quadros();
