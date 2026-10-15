import { asList, parseProps, splitFrontmatter } from '../caderno/frontmatter';

/*
 * Grafo de ligações das notas, como o do Obsidian: [[links]], ![[embeds]],
 * links Markdown para arquivos do cofre e #tags (no texto e em "tags:").
 * Código (```blocos``` e `trechos`) não conta.
 */

export interface NoteLinks {
  links: string[];
  embeds: string[];
  tags: string[];
}

const WIKI = /(!?)\[\[([^\]\n]+?)\]\]/g;
const MDLINK = /(!?)\[[^\]\n]*\]\(<?([^)>\n]+)>?\)/g;
const TAG = /(?:^|[\s(,;])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

/** Texto sem blocos de código, trechos `inline` e comentários %% %%. */
function stripCode(body: string): string {
  return body
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/%%[\s\S]*?%%/g, '');
}

function cleanTarget(raw: string): string {
  return raw.split('|')[0]!.split('#')[0]!.trim();
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function extractLinks(text: string): NoteLinks {
  const { body } = splitFrontmatter(text);
  const props = parseProps(text);
  const links = new Set<string>();
  const embeds = new Set<string>();
  const tags = new Set<string>();
  // propriedades com [[link]] também ligam (afiliação: "[[Ordem do Sol]]")
  for (const [k, v] of Object.entries(props)) {
    const key = k.toLowerCase();
    if (key === 'tags' || key === 'tag') {
      for (const t of asList(v)) for (const one of t.split(/[,\s]+/)) if (one.replace(/^#/, '')) tags.add(one.replace(/^#/, ''));
      continue;
    }
    for (const item of asList(v)) for (const m of item.matchAll(WIKI)) if (cleanTarget(m[2]!)) links.add(cleanTarget(m[2]!));
  }
  const src = stripCode(body);
  for (const m of src.matchAll(WIKI)) {
    const t = cleanTarget(m[2]!);
    if (!t) continue;
    (m[1] ? embeds : links).add(t);
  }
  for (const m of src.matchAll(MDLINK)) {
    const raw = m[2]!.trim().split(/\s+"/)[0]!;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) continue;
    const t = cleanTarget(safeDecode(raw));
    if (t) (m[1] ? embeds : links).add(t);
  }
  for (const m of src.matchAll(TAG)) tags.add(m[1]!.replace(/\/+$/, ''));
  return { links: [...links], embeds: [...embeds], tags: [...tags] };
}

/**
 * Resolve [[links]] como o Obsidian (caminho exato, com ou sem .md, ou o
 * arquivo com aquele nome em qualquer pasta, o de caminho mais curto), com
 * índices prontos: milhares de notas resolvem em milissegundos.
 */
export class LinkResolver {
  private exact = new Map<string, string>();
  private byName = new Map<string, string>();

  constructor(paths: readonly string[]) {
    const sorted = [...paths].sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
    for (const p of sorted) {
      const low = p.toLowerCase();
      this.exact.set(low, p);
      const name = low.slice(low.lastIndexOf('/') + 1);
      if (!this.byName.has(name)) this.byName.set(name, p);
    }
  }

  resolve(raw: string): string | null {
    const file = cleanTarget(raw).replace(/^\.?\//, '').toLowerCase();
    if (!file) return null;
    const hasExt = /\.[a-z0-9]{1,5}$/i.test(file);
    const candidates = hasExt ? [file, `${file}.md`] : [`${file}.md`, file];
    for (const c of candidates) {
      const hit = this.exact.get(c);
      if (hit) return hit;
    }
    for (const c of candidates) {
      // "pasta/nota" acha "outra/pasta/nota.md"
      if (c.includes('/')) {
        for (const [low, p] of this.exact) if (low.endsWith(`/${c}`)) return p;
        continue;
      }
      const hit = this.byName.get(c);
      if (hit) return hit;
    }
    return null;
  }
}

export type GraphNodeKind = 'note' | 'tag' | 'missing' | 'file' | 'board';

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  /** pasta da nota (vazio = raiz) */
  folder: string;
  tags: string[];
  /** ligações que saem e que chegam */
  out: number;
  in: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: 'link' | 'embed' | 'tag';
}

export interface NoteGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphOptions {
  /** tags viram nós ligados às notas */
  tags?: boolean;
  /** links para notas que ainda não existem */
  missing?: boolean;
  /** anexos (PDF, imagens...) citados pelas notas */
  files?: boolean;
  /** todos os caminhos do cofre (notas e arquivos), para resolver anexos */
  allPaths?: readonly string[];
  /** quadros (.canvas) com o texto do arquivo: viram nós ligados às notas que mostram */
  boards?: readonly { path: string; text: string }[];
}

/** Destinos de um .canvas: cartões de arquivo e [[links]] escritos nas caixas. */
export function boardTargets(text: string): { files: string[]; links: string[] } {
  const files = new Set<string>();
  const links = new Set<string>();
  try {
    const j = JSON.parse(text) as { nodes?: Array<{ type?: string; file?: string; text?: string }> };
    for (const n of Array.isArray(j.nodes) ? j.nodes : []) {
      if (n?.type === 'file' && typeof n.file === 'string' && n.file) files.add(n.file);
      else if (n?.type === 'text' && typeof n.text === 'string') {
        const l = extractLinks(n.text);
        for (const t of [...l.links, ...l.embeds]) links.add(t);
      }
    }
  } catch {
    // .canvas pela metade: sem ligações por enquanto
  }
  return { files: [...files], links: [...links] };
}

const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.(md|canvas)$/i, '');
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export function buildNoteGraph(notes: readonly { path: string; text: string }[], opts: GraphOptions = {}): NoteGraph {
  const notePaths = notes.map((n) => n.path);
  const boardPaths = (opts.boards ?? []).map((b) => b.path);
  const resolver = new LinkResolver([...new Set([...notePaths, ...boardPaths, ...(opts.allPaths ?? [])])]);
  const isBoard = new Set(boardPaths);
  const isNote = new Set(notePaths);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (n: Omit<GraphNode, 'out' | 'in'>) => {
    if (!nodes.has(n.id)) nodes.set(n.id, { ...n, out: 0, in: 0 });
    return nodes.get(n.id)!;
  };
  const link = (from: string, to: string, kind: GraphEdge['kind']) => {
    if (from === to) return;
    const key = `${from}\u0000${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
    nodes.get(from)!.out++;
    nodes.get(to)!.in++;
  };
  const parsed = notes.map((n) => ({ path: n.path, l: extractLinks(n.text) }));
  for (const { path, l } of parsed) add({ id: path, label: nameOf(path), kind: 'note', folder: dirOf(path), tags: l.tags });
  for (const b of opts.boards ?? []) add({ id: b.path, label: nameOf(b.path), kind: 'board', folder: dirOf(b.path), tags: [] });
  for (const { path, l } of parsed) {
    for (const [targets, kind] of [[l.links, 'link'], [l.embeds, 'embed']] as const) {
      for (const raw of targets) {
        const hit = resolver.resolve(raw);
        if (hit && isNote.has(hit)) link(path, hit, kind);
        else if (hit && isBoard.has(hit)) link(path, hit, kind);
        else if (hit) {
          if (!opts.files) continue;
          add({ id: hit, label: hit.slice(hit.lastIndexOf('/') + 1), kind: 'file', folder: dirOf(hit), tags: [] });
          link(path, hit, kind);
        } else if (opts.missing && (!/\.[a-z0-9]{1,5}$/i.test(raw) || /\.md$/i.test(raw))) {
          const id = `?${raw.toLowerCase().replace(/\.md$/i, '')}`;
          add({ id, label: nameOf(raw), kind: 'missing', folder: '', tags: [] });
          link(path, id, kind);
        }
      }
    }
    if (opts.tags) {
      for (const t of l.tags) {
        const id = `#${t.toLowerCase()}`;
        add({ id, label: `#${t}`, kind: 'tag', folder: '', tags: [] });
        link(path, id, 'tag');
      }
    }
  }
  for (const b of opts.boards ?? []) {
    const t = boardTargets(b.text);
    for (const [targets, kind] of [[t.files, 'embed'], [t.links, 'link']] as const) {
      for (const raw of targets) {
        const hit = resolver.resolve(raw);
        if (hit && (isNote.has(hit) || isBoard.has(hit))) link(b.path, hit, kind);
        else if (hit && opts.files) {
          add({ id: hit, label: hit.slice(hit.lastIndexOf('/') + 1), kind: 'file', folder: dirOf(hit), tags: [] });
          link(b.path, hit, kind);
        }
      }
    }
  }
  return { nodes: [...nodes.values()], edges };
}

/** Notas a até `depth` ligações de `center` (nos dois sentidos): o grafo local. */
export function neighborhood(graph: NoteGraph, center: string, depth: number): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const out = new Set([center]);
  let frontier = [center];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const n of adj.get(id) ?? []) if (!out.has(n)) (out.add(n), next.push(n));
    frontier = next;
  }
  return out;
}
