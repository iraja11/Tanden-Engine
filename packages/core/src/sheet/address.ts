// Endereços no estilo A1. Linhas e colunas são base 0 por dentro.

export const MAX_ROWS = 1_048_576;
export const MAX_COLS = 16_384;

export function colName(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export const cellKey = (r: number, c: number): string => `${colName(c)}${r + 1}`;

export function parseKey(key: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]{1,3})(\d+)$/.exec(key);
  if (!m) return null;
  const c = colIndex(m[1]!);
  const r = Number(m[2]) - 1;
  if (r < 0 || r >= MAX_ROWS || c < 0 || c >= MAX_COLS) return null;
  return { r, c };
}

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export const rectKey = (x: Rect): string =>
  x.r0 === x.r1 && x.c0 === x.c1 ? cellKey(x.r0, x.c0) : `${cellKey(x.r0, x.c0)}:${cellKey(x.r1, x.c1)}`;

export function parseRect(text: string): Rect | null {
  const [a, b = a] = text.replace(/\$/g, '').split(':');
  const p = parseKey(a!.trim());
  const q = parseKey(b!.trim());
  if (!p || !q) return null;
  return { r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c), r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c) };
}

/** Nome de aba como aparece numa fórmula: entre aspas simples se precisar. */
export function quoteSheet(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Za-z]{1,3}\d+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}
