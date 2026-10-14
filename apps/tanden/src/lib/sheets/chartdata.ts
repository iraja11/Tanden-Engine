import { parseRect, type ChartSpec, type Workbook } from '@tanden/core';

// Do intervalo da planilha para séries de gráfico, adivinhando cabeçalhos e rótulos como o Sheets.

export interface Series {
  name: string;
  values: Array<number | null>;
}

export interface ChartData {
  categories: string[];
  /** x numérico (dispersão) */
  xs: Array<number | null>;
  series: Series[];
  /** formato de número da primeira série, para os rótulos */
  nf?: string;
}

/** Paleta categórica validada para o tema escuro (ordem fixa; nunca reciclar). */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const MAX_SERIES = SERIES_COLORS.length;

export function chartData(wb: Workbook, spec: ChartSpec): ChartData | { error: string } {
  const x = parseRect(spec.range);
  if (!x) return { error: `Intervalo inválido: ${spec.range}` };
  if (!wb.sheets().some((s) => s.id === spec.sheet)) return { error: 'A aba deste gráfico foi apagada.' };
  const b = wb.bounds(spec.sheet);
  const r1 = Math.min(x.r1, Math.max(x.r0, b.rows - 1));
  const c1 = Math.min(x.c1, Math.max(x.c0, b.cols - 1));
  // matriz de [valor, texto exibido, é data]
  let grid: Array<Array<{ v: unknown; t: string; date: boolean }>> = [];
  for (let r = x.r0; r <= r1; r++) {
    const row = [];
    for (let c = x.c0; c <= c1; c++) row.push({ v: wb.value(spec.sheet, r, c), t: wb.display(spec.sheet, r, c), date: wb.isDate(spec.sheet, r, c) });
    grid.push(row);
  }
  if (spec.byRow) grid = grid[0]!.map((_, c) => grid.map((row) => row[c]!));
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (!h || !w) return { error: 'O intervalo está vazio.' };

  const isNum = (cell: { v: unknown }) => typeof cell.v === 'number';
  const text = (cell: { v: unknown }) => typeof cell.v === 'string' && cell.v !== '';
  // cabeçalho: primeira linha com texto e números abaixo
  const header = h > 1 && grid[0]!.some(text) && grid.slice(1).some((row) => row.some(isNum));
  const body = header ? grid.slice(1) : grid;
  // rótulos: primeira coluna com texto ou datas (ou a dispersão usa ela como x)
  const col0 = body.map((row) => row[0]!);
  const labels =
    w > 1 &&
    (spec.type === 'scatter' || col0.some(text) || col0.some((c) => c.date) || (header && !text(grid[0]![0]!) && col0.every((c) => isNum(c) || c.v === null)));
  const first = labels ? 1 : 0;

  const categories = labels ? col0.map((c) => c.t) : body.map((_, i) => String(i + 1));
  const xs = col0.map((c) => (typeof c.v === 'number' ? c.v : null));
  const series: Series[] = [];
  for (let c = first; c < w; c++) {
    const values = body.map((row) => (typeof row[c]!.v === 'number' ? (row[c]!.v as number) : null));
    if (values.every((v) => v === null)) continue;
    series.push({ name: header ? grid[0]![c]!.t || `Série ${series.length + 1}` : `Série ${series.length + 1}`, values });
  }
  if (!series.length) return { error: 'Nenhum número no intervalo para desenhar.' };
  const nfRow = header ? x.r0 + 1 : x.r0;
  const nf = wb.format(spec.sheet, spec.byRow ? x.r0 + first : nfRow, spec.byRow ? (header ? x.c0 + 1 : x.c0) : x.c0 + first).nf;
  return { categories, xs, series, ...(nf ? { nf } : {}) };
}
