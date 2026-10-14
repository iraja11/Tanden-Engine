import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { cellKey, colName, parseKey } from './address';
import { parseFormula, printFormula, shiftFormula } from './formula';
import { needsXlfn } from './functions';
import { isErr, parseInput, type Scalar } from './values';
import { DEFAULT_COL_WIDTH, type CellFormat, type Workbook } from './workbook';

/*
 * Leitura e escrita de .xlsx (Office Open XML) sem dependências pesadas: um zip
 * (fflate) e XML montado à mão. Abre no Excel, no Google Sheets e no LibreOffice.
 *
 * O que vai e volta: abas, valores, fórmulas (com o último valor calculado),
 * negrito, itálico, alinhamento, formato de número e largura das colunas.
 * Gráficos ficam só no Tanden por enquanto.
 *
 * A escrita é determinística (mesmo conteúdo → mesmos bytes), para o sync
 * reconhecer o arquivo que ele mesmo gravou.
 */

/** Conteúdo de uma pasta, no formato que entra e sai do .xlsx. */
export interface BookData {
  sheets: SheetData[];
}

export interface SheetData {
  name: string;
  /** "A1" → texto como seria digitado */
  cells: Map<string, string>;
  fmt: Map<string, CellFormat>;
  /** coluna → largura em px */
  widths: Map<number, number>;
}

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const FIXED_TIME = new Date(Date.UTC(2020, 0, 1));

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // caracteres de controle não são permitidos em XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const unesc = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()]!;
  });

// px ↔ largura do Excel (em caracteres do "0" da fonte padrão)
const pxToChars = (px: number) => Math.round(((px - 5) / 7) * 100) / 100;
const charsToPx = (w: number) => Math.round(w * 7 + 5);

// ---------------------------------------------------------------------------
// Workbook ↔ BookData

export function bookData(wb: Workbook): BookData {
  return {
    sheets: wb.sheets().map((s) => ({
      name: s.name,
      cells: new Map(wb.entries(s.id).map((e) => [cellKey(e.r, e.c), e.raw])),
      fmt: new Map(wb.formatEntries(s.id).map((e) => [cellKey(e.r, e.c), e.f])),
      widths: wb.colWidths(s.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// escrita

interface Style {
  font: number;
  nf: number;
  al?: string;
}

const BUILTIN_NF: Record<string, number> = {
  General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '0.00E+00': 11, '@': 49,
};

/** Grava a pasta como .xlsx. `wb` dá os valores calculados das fórmulas. */
export function writeXlsx(wb: Workbook): Uint8Array {
  const book = bookData(wb);
  const ids = wb.sheets().map((s) => s.id);
  const strings: string[] = [];
  const stringIdx = new Map<string, number>();
  const sst = (s: string) => {
    let i = stringIdx.get(s);
    if (i === undefined) {
      i = strings.length;
      strings.push(s);
      stringIdx.set(s, i);
    }
    return i;
  };

  const customNf = new Map<string, number>();
  const styles: Style[] = [{ font: 0, nf: 0 }];
  const styleIdx = new Map<string, number>([['0|0|', 0]]);
  const styleOf = (f: CellFormat | undefined): number => {
    if (!f) return 0;
    const font = (f.b ? 1 : 0) + (f.i ? 2 : 0);
    let nf = 0;
    if (f.nf) {
      nf = BUILTIN_NF[f.nf] ?? customNf.get(f.nf) ?? 0;
      if (!nf && !(f.nf in BUILTIN_NF)) {
        nf = 164 + customNf.size;
        customNf.set(f.nf, nf);
      }
    }
    const al = f.al === 'l' ? 'left' : f.al === 'c' ? 'center' : f.al === 'r' ? 'right' : '';
    const k = `${font}|${nf}|${al}`;
    let i = styleIdx.get(k);
    if (i === undefined) {
      i = styles.length;
      styles.push({ font, nf, ...(al ? { al } : {}) });
      styleIdx.set(k, i);
    }
    return i;
  };

  const files: Zippable = {};
  book.sheets.forEach((sheet, si) => {
    const id = ids[si]!;
    const keys = new Set([...sheet.cells.keys(), ...[...sheet.fmt.keys()].filter((k) => Object.keys(sheet.fmt.get(k)!).length)]);
    const cells = [...keys].map((k) => ({ k, ...parseKey(k)! })).sort((a, b) => a.r - b.r || a.c - b.c);
    const rows: string[] = [];
    let cur = -1;
    let line = '';
    let maxR = 0;
    let maxC = 0;
    for (const { k, r, c } of cells) {
      if (r !== cur) {
        if (line) rows.push(`${line}</row>`);
        line = `<row r="${r + 1}">`;
        cur = r;
      }
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
      const s = styleOf(sheet.fmt.get(k));
      const sAttr = s ? ` s="${s}"` : '';
      const raw = sheet.cells.get(k);
      if (raw === undefined) {
        line += `<c r="${k}"${sAttr}/>`;
        continue;
      }
      const p = parseInput(raw);
      if (p.formula !== undefined) {
        let f: string | null = null;
        try {
          f = printFormula(parseFormula(p.formula), { canonical: true, xlfn: needsXlfn });
        } catch {
          f = null;
        }
        if (f !== null) {
          line += formulaCell(k, sAttr, f, wb.value(id, r, c));
          continue;
        }
        line += `<c r="${k}"${sAttr} t="s"><v>${sst(raw)}</v></c>`;
        continue;
      }
      line += valueCell(k, sAttr, p.value, sst);
    }
    if (line) rows.push(`${line}</row>`);

    const cols = [...sheet.widths].filter(([, w]) => w !== DEFAULT_COL_WIDTH).sort((a, b) => a[0] - b[0]);
    const colsXml = cols.length
      ? `<cols>${cols.map(([c, w]) => `<col min="${c + 1}" max="${c + 1}" width="${pxToChars(w)}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const dim = cells.length ? `A1:${colName(maxC)}${maxR + 1}` : 'A1';
    files[`xl/worksheets/sheet${si + 1}.xml`] = strToU8(
      `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><dimension ref="${dim}"/>` +
        `<sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${rows.join('')}</sheetData></worksheet>`,
    );
  });

  const n = book.sheets.length;
  files['[Content_Types].xml'] = strToU8(
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      book.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>',
  );
  files['_rels/.rels'] = strToU8(
    `${HEAD}<Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
      '</Relationships>',
  );
  files['docProps/app.xml'] = strToU8(
    `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tanden Engine</Application></Properties>`,
  );
  files['xl/workbook.xml'] = strToU8(
    `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>` +
      book.sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      // o Excel recalcula ao abrir: o valor guardado é só o que o Tanden viu
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `${HEAD}<Relationships xmlns="${PKG_REL}">` +
      book.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
      '</Relationships>',
  );
  files['xl/sharedStrings.xml'] = strToU8(
    `${HEAD}<sst xmlns="${MAIN}" count="${strings.length}" uniqueCount="${strings.length}">` +
      strings.map((s) => `<si><t${/^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : ''}>${esc(s)}</t></si>`).join('') +
      '</sst>',
  );
  const font = (b: boolean, i: boolean) => `<font>${b ? '<b/>' : ''}${i ? '<i/>' : ''}<sz val="11"/><name val="Calibri"/><family val="2"/></font>`;
  files['xl/styles.xml'] = strToU8(
    `${HEAD}<styleSheet xmlns="${MAIN}">` +
      (customNf.size ? `<numFmts count="${customNf.size}">${[...customNf].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${esc(code)}"/>`).join('')}</numFmts>` : '') +
      `<fonts count="4">${font(false, false)}${font(true, false)}${font(false, true)}${font(true, true)}</fonts>` +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${styles.length}">` +
      styles.map((s) =>
        `<xf numFmtId="${s.nf}" fontId="${s.font}" fillId="0" borderId="0" xfId="0"` +
        `${s.nf ? ' applyNumberFormat="1"' : ''}${s.font ? ' applyFont="1"' : ''}` +
        (s.al ? ` applyAlignment="1"><alignment horizontal="${s.al}"/></xf>` : '/>'),
      ).join('') +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  );

  for (const k of Object.keys(files)) files[k] = [files[k] as Uint8Array, { mtime: FIXED_TIME }];
  return zipSync(files, { level: 6 });
}

function formulaCell(k: string, sAttr: string, f: string, v: Scalar): string {
  const fx = `<f>${esc(f)}</f>`;
  if (v === null) return `<c r="${k}"${sAttr}>${fx}</c>`;
  if (typeof v === 'number') return `<c r="${k}"${sAttr}>${fx}<v>${numText(v)}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${k}"${sAttr} t="b">${fx}<v>${v ? 1 : 0}</v></c>`;
  if (isErr(v)) return `<c r="${k}"${sAttr} t="e">${fx}<v>${v.code === '#CYCLE!' ? '#REF!' : v.code}</v></c>`;
  return `<c r="${k}"${sAttr} t="str">${fx}<v>${esc(v)}</v></c>`;
}

function valueCell(k: string, sAttr: string, v: Scalar, sst: (s: string) => number): string {
  if (v === null) return `<c r="${k}"${sAttr}/>`;
  if (typeof v === 'number') return `<c r="${k}"${sAttr}><v>${numText(v)}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${k}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
  if (isErr(v)) return `<c r="${k}"${sAttr} t="e"><v>${v.code}</v></c>`;
  return `<c r="${k}"${sAttr} t="s"><v>${sst(v)}</v></c>`;
}

const numText = (n: number): string => (Number.isFinite(n) ? String(n) : '0');

// ---------------------------------------------------------------------------
// leitura

const BUILTIN_CODES: Record<number, string> = {
  1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'hh:mm',
  21: 'hh:mm:ss', 22: 'dd/mm/yyyy hh:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)',
  40: '#,##0.00;[Red](#,##0.00)', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 48: '##0.0E+0', 49: '@',
};

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) out[m[1]!] = unesc(m[2]!);
  return out;
}

const textOf = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1]!)).join('');

/** Tira prefixos de namespace das tags (<x:c> → <c>). */
const noNs = (xml: string) => xml.replace(/<(\/?)[A-Za-z]\w*:(?=[A-Za-z])/g, '<$1');

/** Lê um .xlsx. Lança erro se o arquivo não for uma planilha válida. */
export function readXlsx(bytes: Uint8Array): BookData {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('O arquivo não é um .xlsx válido.');
  }
  const file = (p: string): string | null => {
    const k = Object.keys(zip).find((x) => x.toLowerCase() === p.toLowerCase());
    return k ? strFromU8(zip[k]!) : null;
  };
  const wbXml = file('xl/workbook.xml');
  if (!wbXml) throw new Error('O arquivo não tem uma pasta de trabalho (xl/workbook.xml).');
  const rels = new Map<string, string>();
  for (const m of (file('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    if (a.Id && a.Target) rels.set(a.Id, a.Target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const shared = [...noNs(file('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    textOf(m[1]!.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')),
  );

  // estilos: índice do xf → formato da célula
  const stylesXml = noNs(file('xl/styles.xml') ?? '');
  const codes = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    if (a.numFmtId && a.formatCode !== undefined) codes.set(Number(a.numFmtId), a.formatCode);
  }
  const fonts = [...(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml)?.[1] ?? '').matchAll(/<font\b[^>]*?(?:\/>|>([\s\S]*?)<\/font>)/g)].map((m) => ({
    b: /<b(\s+val="(1|true)")?\s*\/>/.test(m[1] ?? ''),
    i: /<i(\s+val="(1|true)")?\s*\/>/.test(m[1] ?? ''),
  }));
  const xfs: CellFormat[] = [...(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '').matchAll(/<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((m) => {
    const a = attrs(m[1]!);
    const f: CellFormat = {};
    const font = fonts[Number(a.fontId ?? 0)];
    if (font?.b) f.b = true;
    if (font?.i) f.i = true;
    const id = Number(a.numFmtId ?? 0);
    const code = codes.get(id) ?? BUILTIN_CODES[id];
    if (id && code && code !== 'General') f.nf = code;
    const h = /<alignment\b[^>]*horizontal="(\w+)"/.exec(m[2] ?? '')?.[1];
    if (h === 'left' || h === 'center' || h === 'right') f.al = h[0] as 'l' | 'c' | 'r';
    return f;
  });

  const sheets: SheetData[] = [];
  for (const m of noNs(wbXml).matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]!);
    const target = rels.get(a['r:id'] ?? '') ?? '';
    const xml = noNs(file(`xl/${target}`) ?? '');
    const sheet: SheetData = { name: a.name ?? `Planilha${sheets.length + 1}`, cells: new Map(), fmt: new Map(), widths: new Map() };
    for (const cm of xml.matchAll(/<col\b([^>]*)\/?>/g)) {
      const ca = attrs(cm[1]!);
      if (!ca.width || ca.customWidth === '0') continue;
      const px = charsToPx(Number(ca.width));
      const lo = Number(ca.min) - 1;
      const hi = Math.min(Number(ca.max) - 1, lo + 255);
      for (let c = lo; c <= hi; c++) sheet.widths.set(c, px);
    }
    const sharedF = new Map<string, { r: number; c: number; f: string }>();
    let auto = { r: 0, c: -1 };
    let rowNo = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const ra = attrs(rm[1]!);
      rowNo = ra.r ? Number(ra.r) - 1 : rowNo + 1;
      auto = { r: rowNo, c: -1 };
      for (const c of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ca = attrs(c[1]!);
        const pos = ca.r ? parseKey(ca.r) : { r: auto.r, c: auto.c + 1 };
        if (!pos) continue;
        auto = pos;
        const k = cellKey(pos.r, pos.c);
        const body = c[2] ?? '';
        const style = xfs[Number(ca.s ?? 0)];
        if (style && Object.keys(style).length) sheet.fmt.set(k, style);

        const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(body);
        if (fm) {
          const fa = attrs(fm[1]!);
          let f = fm[2] !== undefined ? unesc(fm[2]) : '';
          if (fa.t === 'shared' && fa.si !== undefined) {
            const master = sharedF.get(fa.si);
            if (f) sharedF.set(fa.si, { ...pos, f });
            else if (master) f = shiftFormula(`=${master.f}`, pos.r - master.r, pos.c - master.c).slice(1);
          }
          if (f) {
            sheet.cells.set(k, `=${f.replace(/_xlfn\.|_xlws\./g, '')}`);
            continue;
          }
        }
        const vm = /<v>([\s\S]*?)<\/v>/.exec(body);
        const v = vm ? unesc(vm[1]!) : null;
        let raw: string | null = null;
        switch (ca.t) {
          case 's':
            raw = v === null ? null : textRaw(shared[Number(v)] ?? '');
            break;
          case 'inlineStr':
            raw = textRaw(textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? ''));
            break;
          case 'str':
            raw = v === null ? null : textRaw(v);
            break;
          case 'b':
            raw = v === null ? null : v === '1' || v === 'true' ? 'TRUE' : 'FALSE';
            break;
          case 'e':
            raw = v;
            break;
          case 'd':
            raw = v;
            break;
          default:
            raw = v === null ? null : String(Number(v));
        }
        if (raw !== null && raw !== '') sheet.cells.set(k, raw);
      }
    }
    sheets.push(sheet);
  }
  if (!sheets.length) throw new Error('A planilha não tem nenhuma aba.');
  return { sheets };
}

/** Texto que, digitado, seria interpretado como outra coisa ganha um apóstrofo. */
function textRaw(s: string): string {
  if (s === '') return s;
  const p = parseInput(s);
  return p.formula === undefined && p.value === s ? s : `'${s}`;
}

// ---------------------------------------------------------------------------

/** Monta uma pasta nova a partir do conteúdo lido. */
export function loadBook(wb: Workbook, data: BookData): void {
  wb.transact(() => {
    for (const s of data.sheets) {
      const id = wb.addSheet(s.name);
      writeSheet(wb, id, s);
    }
  });
}

function writeSheet(wb: Workbook, id: string, s: SheetData): void {
  wb.setMany(id, [...s.cells].map(([k, raw]) => ({ ...parseKey(k)!, raw })));
  for (const [k, f] of s.fmt) {
    const p = parseKey(k)!;
    for (const prop of Object.keys(f) as Array<keyof CellFormat>) wb.setFormat(id, { r0: p.r, c0: p.c, r1: p.r, c1: p.c }, prop, f[prop]);
  }
  for (const [c, w] of s.widths) wb.setColWidth(id, c, w);
}

/**
 * Aplica na pasta só o que mudou de `base` para `next` (edição feita fora do
 * Tanden, no Excel ou no Sheets). Células que ninguém mexeu lá fora continuam
 * com o que os aparelhos escreveram.
 */
export function applyBookDiff(wb: Workbook, base: BookData, next: BookData, idFor: (name: string) => string): void {
  const byName = (d: BookData) => new Map(d.sheets.map((s) => [s.name.toLowerCase(), s]));
  const b = byName(base);
  const n = byName(next);
  const empty = (name: string): SheetData => ({ name, cells: new Map(), fmt: new Map(), widths: new Map() });
  wb.transact(() => {
    for (const [lname, ns] of n) {
      let id = wb.sheets().find((s) => s.name.toLowerCase() === lname)?.id;
      const bs = b.get(lname) ?? empty(ns.name);
      if (!id) id = wb.addSheet(ns.name, idFor(ns.name));
      const cellChanges: Array<{ r: number; c: number; raw: string }> = [];
      for (const k of new Set([...bs.cells.keys(), ...ns.cells.keys()])) {
        const was = bs.cells.get(k) ?? '';
        const now = ns.cells.get(k) ?? '';
        if (was !== now) cellChanges.push({ ...parseKey(k)!, raw: now });
      }
      wb.setMany(id, cellChanges);
      for (const k of new Set([...bs.fmt.keys(), ...ns.fmt.keys()])) {
        const was = bs.fmt.get(k) ?? {};
        const now = ns.fmt.get(k) ?? {};
        const p = parseKey(k)!;
        const rect = { r0: p.r, c0: p.c, r1: p.r, c1: p.c };
        for (const prop of ['b', 'i', 'al', 'nf'] as const) if (was[prop] !== now[prop]) wb.setFormat(id, rect, prop, now[prop]);
      }
      for (const c of new Set([...bs.widths.keys(), ...ns.widths.keys()])) {
        const now = ns.widths.get(c) ?? DEFAULT_COL_WIDTH;
        if ((bs.widths.get(c) ?? DEFAULT_COL_WIDTH) !== now) wb.setColWidth(id, c, now);
      }
    }
    for (const [lname] of b) {
      if (n.has(lname)) continue;
      const id = wb.sheets().find((s) => s.name.toLowerCase() === lname)?.id;
      if (id) wb.removeSheet(id);
    }
  });
}
