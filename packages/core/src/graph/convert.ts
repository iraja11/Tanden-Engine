import type { BoardData, CanvasEdge, CanvasNode } from '../board';
import { splitFrontmatter } from '../caderno/frontmatter';
import type { GraphNode } from './links';

/*
 * Pontes entre o grafo, as notas e os quadros:
 * - busca do grafo (grupos de cor e filtro), no estilo do Obsidian;
 * - um pedaço do grafo vira um quadro (.canvas) com as notas como cartões;
 * - os títulos e listas de uma nota viram um mapa mental, e um mapa vira nota.
 */

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca do grafo. Termos separados por espaço valem todos ao mesmo tempo:
 * `path:Projetos` (pasta ou caminho), `tag:#estudo` (ou só `#estudo`),
 * `file:ata` (nome), `-termo` exclui e o resto procura no nome e no caminho.
 * Aspas juntam palavras: `path:"Mundos/Aurath"`.
 */
export function graphQuery(query: string): (n: Pick<GraphNode, 'id' | 'label' | 'tags' | 'kind'>) => boolean {
  const terms = [...query.matchAll(/(-?)(?:(path|tag|file):)?(?:"([^"]*)"|(\S+))/gi)]
    .map((m) => ({ neg: m[1] === '-', field: (m[2] ?? '').toLowerCase(), value: fold((m[3] ?? m[4] ?? '').trim()) }))
    .filter((t) => t.value || t.field);
  if (!terms.length) return () => false;
  return (n) =>
    terms.every((t) => {
      const name = fold(n.label);
      const path = fold(n.id);
      const tags = n.tags.map((x) => fold(x));
      let hit: boolean;
      if (t.field === 'tag' || (!t.field && t.value.startsWith('#'))) {
        const v = t.value.replace(/^#/, '');
        hit = tags.some((x) => x === v || x.startsWith(`${v}/`)) || (n.kind === 'tag' && name.replace(/^#/, '') === v);
      } else if (t.field === 'path') hit = path.includes(t.value);
      else if (t.field === 'file') hit = name.includes(t.value);
      else hit = name.includes(t.value) || path.includes(t.value);
      return t.neg ? !hit : hit;
    });
}

export interface GraphItem {
  id: string;
  label: string;
  kind: GraphNode['kind'];
  x: number;
  y: number;
}

/**
 * Um pedaço do grafo (posições do layout) vira um quadro: notas e anexos como
 * cartões de arquivo, tags e links sem nota como caixas de texto, ligações como
 * setas. As posições são esticadas para os cartões não se sobreporem.
 */
export function boardFromGraph(items: GraphItem[], links: { from: string; to: string }[], opts: { center?: string } = {}): Pick<BoardData, 'nodes' | 'edges'> {
  const W = 260;
  const H = 140;
  if (!items.length) return { nodes: [], edges: [] };
  const c = items.find((i) => i.id === opts.center) ?? {
    x: items.reduce((s, i) => s + i.x, 0) / items.length,
    y: items.reduce((s, i) => s + i.y, 0) / items.length,
  };
  // distância mínima entre vizinhos no layout: estica até caber um cartão
  let min = Infinity;
  for (let i = 0; i < items.length && i < 400; i++)
    for (let j = i + 1; j < items.length && j < 400; j++) min = Math.min(min, Math.hypot(items[i]!.x - items[j]!.x, items[i]!.y - items[j]!.y));
  const k = Number.isFinite(min) && min > 0 ? Math.min(12, Math.max(2.2, 320 / min)) : 3;
  const ids = new Map<string, string>();
  const nodes: CanvasNode[] = items.map((it, i) => {
    const id = `g${i.toString(36)}${Math.abs(hash(it.id)).toString(36)}`.slice(0, 16);
    ids.set(it.id, id);
    const x = Math.round(((it.x - c.x) * k - W / 2) / 20) * 20;
    const y = Math.round(((it.y - c.y) * k - H / 2) / 20) * 20;
    if (it.kind === 'note' || it.kind === 'file' || it.kind === 'board') return { id, type: 'file', file: it.id, x, y, width: W, height: H };
    return { id, type: 'text', text: it.kind === 'tag' ? it.label : `[[${it.label}]]`, x, y, width: 200, height: 60, color: it.kind === 'tag' ? '5' : undefined };
  });
  for (const n of nodes) if (n.color === undefined) delete n.color;
  if (opts.center && ids.has(opts.center)) {
    const n = nodes.find((x) => x.id === ids.get(opts.center!))!;
    n.color = '1';
  }
  const seen = new Set<string>();
  const edges: CanvasEdge[] = [];
  for (const l of links) {
    const a = ids.get(l.from);
    const b = ids.get(l.to);
    if (!a || !b || a === b || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`);
    edges.push({ id: `e${edges.length.toString(36)}${a.slice(-4)}${b.slice(-4)}`, fromNode: a, toNode: b, toEnd: 'arrow' });
  }
  return { nodes, edges };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Os títulos (#, ##, ###...) e as listas de uma nota viram um mapa mental: o
 * título da nota é a raiz, cada título um galho e cada item de lista uma folha
 * do título em que está (listas indentadas descem mais um nível). Os galhos da
 * raiz se alternam entre direita e esquerda; o app organiza depois.
 */
export function mindMapFromNote(title: string, markdown: string): Pick<BoardData, 'nodes' | 'edges'> {
  const { body } = splitFrontmatter(markdown);
  type Item = { id: string; text: string; depth: number };
  const items: Item[] = [];
  let headingDepth = 0;
  let inCode = false;
  let n = 0;
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) continue;
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      headingDepth = h[1]!.length;
      items.push({ id: `m${(n++).toString(36)}`, text: clean(h[2]!), depth: headingDepth });
      continue;
    }
    const li = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/.exec(line);
    if (li) {
      const indent = Math.floor(li[1]!.replace(/\t/g, '  ').length / 2);
      items.push({ id: `m${(n++).toString(36)}`, text: clean(li[2]!), depth: headingDepth + 1 + indent + 0.5 });
    }
  }
  // um único # igual ao título da nota não vira um nível a mais
  if (items[0] && items[0].depth === 1 && items.filter((i) => i.depth === 1).length === 1) items.shift();
  const root = { id: 'raiz', text: title, depth: 0 };
  const nodes: CanvasNode[] = [{ id: root.id, type: 'text', text: title, x: -90, y: -30, width: Math.min(320, Math.max(140, title.length * 10 + 46)), height: 50 }];
  const edges: CanvasEdge[] = [];
  const stack: Item[] = [root];
  let side = 0;
  for (const it of items) {
    while (stack.length > 1 && stack[stack.length - 1]!.depth >= it.depth) stack.pop();
    const parent = stack[stack.length - 1]!;
    const level = stack.length;
    const dir = parent === root ? (side++ % 2 ? -1 : 1) : 1;
    nodes.push({ id: it.id, type: 'text', text: it.text, x: dir * level * 300, y: nodes.length * 40, width: Math.min(260, Math.max(72, it.text.length * 8 + 40)), height: 38 });
    edges.push({ id: `l${it.id}`, fromNode: parent.id, fromSide: dir > 0 ? 'right' : 'left', toNode: it.id, toSide: dir > 0 ? 'left' : 'right', toEnd: 'none' });
    stack.push(it);
  }
  return { nodes, edges };
}

const clean = (t: string) => t.replace(/\s+\^[\w-]+$/, '').trim();

/**
 * O caminho inverso: um mapa mental (ou qualquer quadro com setas) vira uma
 * nota em tópicos, a partir da raiz. Cartões de nota viram [[links]]; caixas
 * soltas, sem seta, entram no fim.
 */
export function noteFromBoard(board: Pick<BoardData, 'nodes' | 'edges'>, root?: string): string {
  const byId = new Map(board.nodes.filter((n) => n.type !== 'group').map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of board.edges) {
    if (!byId.has(e.fromNode) || !byId.has(e.toNode) || hasParent.has(e.toNode)) continue;
    hasParent.add(e.toNode);
    (children.get(e.fromNode) ?? children.set(e.fromNode, []).get(e.fromNode)!).push(e.toNode);
  }
  const textOf = (n: CanvasNode): string => {
    if (n.type === 'file') return `[[${(n.file ?? '').replace(/\.md$/i, '')}]]`;
    if (n.type === 'link') return n.url ?? '';
    return (n.text ?? '').replace(/^#+\s*/, '').replace(/\n+/g, ' ').trim();
  };
  const byPos = (ids: string[]) => [...ids].sort((a, b) => byId.get(a)!.y - byId.get(b)!.y || byId.get(a)!.x - byId.get(b)!.x);
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = byId.get(id)!;
    // a raiz de um mapa feito de uma nota é o link para ela; como título, vale o nome
    const title = () => textOf(n).replace(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/, (_, t: string, a?: string) => a ?? t.split('/').pop()!);
    out.push(depth === 0 ? `# ${title()}\n` : depth === 1 ? `\n## ${textOf(n)}\n` : `${'  '.repeat(depth - 2)}- ${textOf(n)}`);
    for (const k of byPos(children.get(id) ?? [])) walk(k, depth + 1);
  };
  const roots = root && byId.has(root) ? [root] : byPos([...byId.keys()].filter((id) => !hasParent.has(id) && children.has(id)));
  roots.forEach((r, i) => walk(r, i === 0 ? 0 : 1));
  const loose = byPos([...byId.keys()].filter((id) => !seen.has(id)));
  if (loose.length) {
    out.push(seen.size ? '\n## Soltos\n' : '');
    for (const id of loose) out.push(`- ${textOf(byId.get(id)!)}`);
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
