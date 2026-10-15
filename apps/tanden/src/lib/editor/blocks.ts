import type { EditorState, Text } from '@codemirror/state';

/*
 * Blocos da nota, no sentido do Notion: parágrafo, título, item de lista (com
 * os filhos), citação/callout, tabela, bloco de código, fórmula, divisor.
 * É só leitura do Markdown: nada aqui muda o formato do arquivo.
 */

export type BlockKind =
  | 'frontmatter'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'callout'
  | 'code'
  | 'math'
  | 'table'
  | 'hr'
  | 'embed';

export interface Block {
  kind: BlockKind;
  /** linhas (a partir de 1), inclusivas */
  start: number;
  end: number;
}

export const FENCE = /^\s*(`{3,}|~{3,})/;
export const LIST = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)/;
export const TASK = /^(\s*)([-*+]|\d{1,9}[.)])\s+\[([ xX/-])\](\s|$)/;
export const HEADING = /^(#{1,6})\s/;
export const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
export const CALLOUT = /^\s*>\s*\[!([\w-]+)\]([+-]?)\s*(.*)$/;
export const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
export const EMBED_LINE = /^\s*(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\))\s*$/;

const indentOf = (t: string) => t.match(/^\s*/)![0].replace(/\t/g, '    ').length;
const isTableRow = (t: string) => /^\s*\|/.test(t);

/** Fim das propriedades (linha do --- de baixo), ou 0 se a nota não tem. */
export function frontmatterEnd(doc: Text): number {
  if (doc.lines < 2 || !/^---\s*$/.test(doc.line(1).text)) return 0;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) if (/^---\s*$/.test(doc.line(i).text)) return i;
  return 0;
}

const cache = new WeakMap<Text, Block[]>();

/** Blocos de cima para baixo (só os de fora; itens de lista contam um a um). */
export function parseBlocks(doc: Text): Block[] {
  const hit = cache.get(doc);
  if (hit) return hit;
  const out: Block[] = [];
  const line = (n: number) => doc.line(n).text;
  let i = 1;
  const fm = frontmatterEnd(doc);
  if (fm) {
    out.push({ kind: 'frontmatter', start: 1, end: fm });
    i = fm + 1;
  }
  const startsBlock = (t: string, n: number) =>
    FENCE.test(t) || HEADING.test(t) || LIST.test(t) || /^\s*>/.test(t) || /^\s*\$\$/.test(t) || HR.test(t) ||
    (isTableRow(t) && n < doc.lines && TABLE_SEP.test(line(n + 1)));
  while (i <= doc.lines) {
    const t = line(i);
    if (!t.trim()) {
      i++;
      continue;
    }
    const f = FENCE.exec(t);
    if (f) {
      const mark = f[1]!;
      let j = i + 1;
      while (j <= doc.lines) {
        const c = FENCE.exec(line(j));
        if (c && c[1]![0] === mark[0] && c[1]!.length >= mark.length && !line(j).trim().slice(c[1]!.length).trim()) break;
        j++;
      }
      out.push({ kind: 'code', start: i, end: Math.min(j, doc.lines) });
      i = j + 1;
      continue;
    }
    if (/^\s*\$\$/.test(t)) {
      const rest = t.trim().slice(2);
      let j = i;
      if (!rest.includes('$$')) {
        j = i + 1;
        while (j <= doc.lines && !line(j).includes('$$')) j++;
      }
      out.push({ kind: 'math', start: i, end: Math.min(j, doc.lines) });
      i = j + 1;
      continue;
    }
    if (isTableRow(t) && i < doc.lines && TABLE_SEP.test(line(i + 1))) {
      let j = i + 2;
      while (j <= doc.lines && isTableRow(line(j))) j++;
      out.push({ kind: 'table', start: i, end: j - 1 });
      i = j;
      continue;
    }
    if (/^\s*>/.test(t)) {
      let j = i + 1;
      while (j <= doc.lines && /^\s*>/.test(line(j))) j++;
      out.push({ kind: CALLOUT.test(t) ? 'callout' : 'quote', start: i, end: j - 1 });
      i = j;
      continue;
    }
    if (HEADING.test(t)) {
      out.push({ kind: 'heading', start: i, end: i });
      i++;
      continue;
    }
    if (HR.test(t)) {
      out.push({ kind: 'hr', start: i, end: i });
      i++;
      continue;
    }
    if (LIST.test(t)) {
      const end = listItemEnd(doc, i);
      out.push({ kind: 'list', start: i, end });
      i = end + 1;
      continue;
    }
    if (EMBED_LINE.test(t)) {
      out.push({ kind: 'embed', start: i, end: i });
      i++;
      continue;
    }
    let j = i + 1;
    while (j <= doc.lines && line(j).trim() && !startsBlock(line(j), j)) j++;
    out.push({ kind: 'paragraph', start: i, end: j - 1 });
    i = j;
  }
  cache.set(doc, out);
  return out;
}

/** Última linha do item de lista que começa em `n` (com os filhos e as continuações). */
export function listItemEnd(doc: Text, n: number): number {
  const base = indentOf(doc.line(n).text);
  let end = n;
  let j = n + 1;
  while (j <= doc.lines) {
    const t = doc.line(j).text;
    if (!t.trim()) {
      // linha em branco só continua o item se a próxima estiver mais recuada
      const next = j < doc.lines ? doc.line(j + 1).text : '';
      if (next.trim() && indentOf(next) > base) {
        j++;
        continue;
      }
      break;
    }
    if (indentOf(t) <= base) break;
    end = j;
    j++;
  }
  return end;
}

/** Bloco que contém a linha `n`. Dentro de uma lista, o item mais interno (com filhos). */
export function blockAt(state: EditorState, n: number): Block | null {
  const doc = state.doc;
  const b = parseBlocks(doc).find((x) => x.start <= n && x.end >= n);
  if (!b) return null;
  if (b.kind === 'list') {
    // sobe até o item que começa nesta linha ou acima dela
    for (let k = n; k >= b.start; k--) {
      const t = doc.line(k).text;
      if (LIST.test(t)) {
        const end = listItemEnd(doc, k);
        if (end >= n) return { kind: 'list', start: k, end };
      }
    }
  }
  return b;
}

/** Posições (from, to) do bloco no documento. */
export function blockRange(doc: Text, b: Block): { from: number; to: number } {
  return { from: doc.line(b.start).from, to: doc.line(b.end).to };
}

/** Faixas de código cercado (para não decorar o que está dentro). */
export function codeLines(doc: Text): Set<number> {
  const s = new Set<number>();
  for (const b of parseBlocks(doc)) if (b.kind === 'code' || b.kind === 'frontmatter') for (let i = b.start; i <= b.end; i++) s.add(i);
  return s;
}
