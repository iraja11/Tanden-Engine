import { cellKey } from './address';
import { formatGeneral, formatValue, isDateFormat, isErr } from './values';
import type { Workbook } from './workbook';
import type { SheetData } from './xlsx';

/*
 * CSV: lê com detecção do separador (",", ";" ou tab), aspas e BOM.
 * Exporta em dois sabores: padrão (vírgula, ponto decimal) e o do Excel
 * brasileiro (ponto e vírgula, vírgula decimal).
 */

export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 20_000).split(/\r?\n/).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = sample.filter((l) => l.trim()).map((l) => splitLine(l, d).length);
    if (!counts.length) continue;
    const first = counts[0]!;
    // separador bom: várias colunas e o mesmo número em todas as linhas
    const consistent = counts.filter((c) => c === first).length / counts.length;
    const score = first > 1 ? first * consistent : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  return parseCsv(line, d)[0] ?? [];
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const t = text.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(t);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < t.length) {
    const ch = t[i]!;
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
    } else if (ch === d) {
      row.push(field);
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && t[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Conteúdo de um CSV como uma aba (o texto entra como se fosse digitado). */
export function csvSheet(name: string, text: string): SheetData {
  const cells = new Map<string, string>();
  parseCsv(text).forEach((row, r) =>
    row.forEach((v, c) => {
      if (v !== '') cells.set(cellKey(r, c), v);
    }),
  );
  return { name, cells, fmt: new Map(), widths: new Map() };
}

export interface CsvOptions {
  /** "," (padrão) ou ";" (Excel em português, com vírgula decimal) */
  delimiter?: ',' | ';' | '\t';
}

/** Exporta os valores calculados de uma aba. */
export function writeCsv(wb: Workbook, sheet: string, opts: CsvOptions = {}): string {
  const d = opts.delimiter ?? ',';
  const ptBR = d === ';';
  const { rows, cols } = wb.bounds(sheet);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const out: string[] = [];
    for (let c = 0; c < cols; c++) {
      const v = wb.value(sheet, r, c);
      const nf = wb.format(sheet, r, c).nf;
      let s: string;
      if (typeof v === 'number') s = isDateFormat(nf) ? formatValue(v, nf) : formatGeneral(v, ptBR ? ',' : '.');
      else if (typeof v === 'boolean') s = ptBR ? formatValue(v) : v ? 'TRUE' : 'FALSE';
      else if (isErr(v)) s = v.code;
      else s = v ?? '';
      out.push(/["\r\n]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s);
    }
    lines.push(out.join(d));
  }
  return `${lines.join('\r\n')}\r\n`;
}
