/*
 * Pedaços de Markdown que os cadernos leem e escrevem: [[links]], seções
 * "## Título" e tabelas. Tudo continua sendo texto comum que o Obsidian
 * mostra igual; o Tanden só sabe onde mexer.
 */

/** "Nome", "Nome|apelido", "Nome#Seção" → "Nome" */
export function linkTarget(raw: string): string {
  return raw.split('|')[0]!.split('#')[0]!.trim();
}

/** Alvos de todos os [[links]] do texto, sem repetir, na ordem em que aparecem. */
export function wikiLinks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/!?\[\[([^\]\n]+?)\]\]/g)) {
    const t = linkTarget(m[1]!);
    if (t) out.add(t);
  }
  return [...out];
}

/** Nome da nota pelo caminho: "Mundos/Aerth/Lugares/Vale.md" → "Vale" */
export const noteName = (path: string): string => path.split('/').pop()!.replace(/\.md$/i, '');

/** Pasta da nota: "Mundos/Aerth/Lugares/Vale.md" → "Mundos/Aerth/Lugares" */
export const noteDir = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/** Nome seguro para arquivo (tira / \ : * ? " < > | e afins). */
export function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sem nome';
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Mesmo título, ignorando acentos, maiúsculas e espaços nas pontas. */
export const sameTitle = (a: string, b: string): boolean => norm(a) === norm(b);

interface Range {
  /** linha do título */
  head: number;
  /** primeira linha depois da seção (exclusivo) */
  end: number;
}

function findSection(lines: string[], title: string, level = 2): Range | null {
  const re = new RegExp(`^#{${level}}\\s+(.+?)\\s*#*\\s*$`);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i]!)) inFence = !inFence;
    if (inFence) continue;
    const m = re.exec(lines[i]!);
    if (!m || !sameTitle(m[1]!, title)) continue;
    let end = i + 1;
    let fence = false;
    for (; end < lines.length; end++) {
      if (/^(```|~~~)/.test(lines[end]!)) fence = !fence;
      if (fence) continue;
      const h = /^(#{1,6})\s/.exec(lines[end]!);
      if (h && h[1]!.length <= level) break;
    }
    return { head: i, end };
  }
  return null;
}

/** Conteúdo da seção "## título" (sem a linha do título), ou null se não existir. */
export function getSection(text: string, title: string, level = 2): string | null {
  const lines = text.split('\n');
  const r = findSection(lines, title, level);
  return r ? lines.slice(r.head + 1, r.end).join('\n') : null;
}

/** Troca o conteúdo da seção; cria no fim da nota se não existir. */
export function setSection(text: string, title: string, content: string, level = 2): string {
  const lines = text.split('\n');
  const r = findSection(lines, title, level);
  const block = content.replace(/^\n+|\n+$/g, '').split('\n');
  if (r) {
    const after = lines.slice(r.end);
    const mid = ['', ...block, ...(after.length ? [''] : [])];
    return [...lines.slice(0, r.head + 1), ...mid, ...after].join('\n');
  }
  let base = text.replace(/\n+$/, '');
  base = base ? `${base}\n\n` : '';
  return `${base}${'#'.repeat(level)} ${title}\n\n${block.join('\n')}\n`;
}

export interface Table {
  header: string[];
  rows: string[][];
}

const isRow = (l: string): boolean => l.includes('|') && l.trim() !== '';
const isRule = (l: string): boolean => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l);

function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '`') {
      code = !code;
      cur += c;
    } else if (c === '|' && !code) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** A primeira tabela do texto (cabeçalho, régua, linhas). */
export function parseTable(text: string): Table | null {
  const lines = text.split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isRow(lines[i]!) || !isRule(lines[i + 1]!)) continue;
    const header = cells(lines[i]!);
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length && isRow(lines[j]!) && !isRule(lines[j]!); j++) {
      const c = cells(lines[j]!);
      while (c.length < header.length) c.push('');
      rows.push(c.slice(0, Math.max(header.length, c.length)));
    }
    return { header, rows };
  }
  return null;
}

const esc = (s: string): string => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

/** Tabela Markdown alinhada, para ficar legível também como texto puro. */
export function formatTable(t: Table): string {
  const n = t.header.length;
  const all = [t.header, ...t.rows].map((r) => Array.from({ length: n }, (_, i) => esc(r[i] ?? '')));
  const w = Array.from({ length: n }, (_, i) => Math.max(3, ...all.map((r) => [...r[i]!].length)));
  const line = (r: string[]) => `| ${r.map((c, i) => c + ' '.repeat(w[i]! - [...c].length)).join(' | ')} |`;
  return [line(all[0]!), `| ${w.map((x) => '-'.repeat(x)).join(' | ')} |`, ...all.slice(1).map(line)].join('\n');
}

/**
 * Troca a primeira tabela da seção, mantendo o texto em volta dela
 * (uma frase antes, notas depois). Sem tabela, ela entra no começo da seção.
 */
export function setSectionTable(text: string, title: string, t: Table): string {
  const cur = getSection(text, title);
  const table = formatTable(t);
  if (cur === null) return setSection(text, title, table);
  const lines = cur.split('\n');
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!isRow(lines[i]!) || !isRule(lines[i + 1]!)) continue;
    let j = i + 2;
    while (j < lines.length && isRow(lines[j]!) && !isRule(lines[j]!)) j++;
    return setSection(text, title, [...lines.slice(0, i), table, ...lines.slice(j)].join('\n'));
  }
  const rest = cur.replace(/^\n+|\n+$/g, '');
  return setSection(text, title, rest ? `${table}\n\n${rest}` : table);
}

/** Uma linha da tabela como objeto; _i é a posição original, para preservar colunas extras. */
export type Rec<K extends string> = Record<K, string> & { _i?: number };

/** Lê a tabela da seção como objetos, achando as colunas pelos apelidos. */
export function readRecords<K extends string>(text: string, title: string, columns: Record<K, string[]>): Array<Rec<K>> {
  const sec = getSection(text, title);
  const t = sec === null ? null : parseTable(sec);
  if (!t) return [];
  const idx = {} as Record<K, number>;
  for (const k of Object.keys(columns) as K[]) {
    idx[k] = t.header.findIndex((h) => columns[k].some((a) => sameTitle(h, a)));
  }
  const out: Array<Rec<K>> = [];
  t.rows.forEach((r, i) => {
    if (!r.some((c) => c !== '')) return;
    const o = { _i: i } as Rec<K>;
    for (const k of Object.keys(columns) as K[]) (o as Record<K, string>)[k] = idx[k] >= 0 ? (r[idx[k]] ?? '') : '';
    out.push(o);
  });
  return out;
}

/**
 * Grava objetos na tabela da seção. Colunas que a pessoa criou à mão e o
 * Tanden não conhece continuam lá: cada objeto lido traz a linha de onde
 * veio (_i), e os valores extras seguem com ele mesmo se a ordem mudar.
 */
export function writeRecords<K extends string>(
  text: string,
  title: string,
  columns: Record<K, string[]>,
  records: Array<Rec<K>>,
): string {
  const sec = getSection(text, title);
  const old = sec === null ? null : parseTable(sec);
  const keys = Object.keys(columns) as K[];
  const header = old ? [...old.header] : keys.map((k) => columns[k][0]!);
  const at = {} as Record<K, number>;
  for (const k of keys) {
    let i = header.findIndex((h) => columns[k].some((a) => sameTitle(h, a)));
    if (i < 0) {
      header.push(columns[k][0]!);
      i = header.length - 1;
    }
    at[k] = i;
  }
  const rows = records.map((rec) => {
    const src = rec._i !== undefined ? old?.rows[rec._i] : undefined;
    const r = Array.from({ length: header.length }, (_, i) => src?.[i] ?? '');
    for (const k of keys) r[at[k]] = (rec as Record<K, string>)[k] ?? '';
    return r;
  });
  return setSectionTable(text, title, { header, rows });
}
