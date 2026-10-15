/*
 * Páginas aninhadas, como no Notion, usando pastas como o Obsidian:
 * as subpáginas de "Projetos.md" moram em "Projetos/". Uma pasta sem nota
 * de mesmo nome aparece como uma pasta comum.
 */

export interface PageNode {
  /** caminho da nota, ou null para uma pasta sem nota */
  path: string | null;
  /** caminho da pasta dos filhos */
  dir: string;
  name: string;
  children: PageNode[];
}

const cmp = (a: PageNode, b: PageNode) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });

/** Árvore de páginas a partir dos caminhos das notas. */
export function pageTree(paths: string[]): PageNode[] {
  const root: PageNode = { path: null, dir: '', name: '', children: [] };
  const dirs = new Map<string, PageNode>([['', root]]);
  const dirNode = (dir: string): PageNode => {
    const hit = dirs.get(dir);
    if (hit) return hit;
    const parentDir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    const parent = dirNode(parentDir);
    const name = dir.split('/').pop()!;
    // a nota "Pasta.md" ao lado da pasta vira a dona dela
    let node = parent.children.find((c) => c.path !== null && c.dir === dir);
    if (!node) {
      node = { path: null, dir, name, children: [] };
      parent.children.push(node);
    }
    dirs.set(dir, node);
    return node;
  };
  for (const p of [...paths].sort()) {
    const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
    const name = p.split('/').pop()!.replace(/\.md$/i, '');
    const own = dir ? `${dir}/${name}` : name;
    const parent = dirNode(dir);
    const folder = parent.children.find((c) => c.path === null && c.dir === own);
    if (folder) {
      folder.path = p;
      folder.name = name;
    } else {
      const node: PageNode = { path: p, dir: own, name, children: [] };
      parent.children.push(node);
      if (!dirs.has(own)) dirs.set(own, node);
    }
  }
  const sort = (n: PageNode) => {
    n.children.sort(cmp);
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

/** Caminhos-pai de uma nota, para a trilha no topo: "A/B/C.md" → ["A", "A/B"]. */
export function ancestors(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}
