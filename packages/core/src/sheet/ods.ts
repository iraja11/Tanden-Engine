import { strFromU8, unzipSync } from 'fflate';
import { lengthToPx, metaXml, ODF_MIME, ODF_NS, odfPackage, pxToCm, XML_HEAD } from '../convert/odf';
import { el, els, escXml, find, parseXml, textOf, type XNode } from '../convert/xml-lite';
import { cellKey, MAX_COLS, MAX_ROWS, parseKey, quoteSheet } from './address';
import { parseFormula, type Node, type RefPart } from './formula';
import { isErr, isDateFormat, parseInput, serialToDate, NF, type Scalar } from './values';
import { DEFAULT_COL_WIDTH, type CellFormat, type Workbook } from './workbook';
import { bookData, type BookData, type SheetData } from './xlsx';

/*
 * Planilhas do LibreOffice Calc (.ods), nos dois sentidos, com o mesmo
 * alcance do .xlsx: abas, valores, fórmulas (com o último valor calculado),
 * negrito, itálico, alinhamento, formato de número e largura das colunas.
 *
 * As fórmulas do .ods seguem o OpenFormula: [.A1], [$Aba.A1:.B2] e ";" entre
 * argumentos. Na leitura viram a escrita do Excel, que é a que o Tanden usa.
 */

// ---------------------------------------------------------------------------
// fórmulas

/** Funções que o LibreOffice grava com o prefixo COM.MICROSOFT. */
const MS_PREFIXED = new Set(['MAXIFS', 'MINIFS', 'IFS', 'SWITCH', 'CONCAT', 'TEXTJOIN', 'XLOOKUP', 'XMATCH', 'FILTER', 'SORT', 'SORTBY', 'UNIQUE', 'SEQUENCE', 'LET', 'RANDARRAY']);

/** Parte de referência OpenFormula ("$Aba.$A$1", ".B", ".3") → "Aba!$A$1". */
function odfRefPart(part: string): { sheet?: string; cell: string } | null {
  const m = /^\$?(?:'((?:[^']|'')*)'|([^.']*))\.(.*)$/.exec(part.trim());
  if (!m) return null;
  const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2] || undefined;
  return { sheet, cell: m[3]! };
}

function odfRef(inner: string): string {
  if (/#REF!/i.test(inner)) return '#REF!';
  // separa no ":" que não está dentro de aspas
  let cut = -1;
  let q = false;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "'") q = !q;
    else if (inner[i] === ':' && !q) {
      cut = i;
      break;
    }
  }
  const a = odfRefPart(cut < 0 ? inner : inner.slice(0, cut));
  const b = cut < 0 ? null : odfRefPart(inner.slice(cut + 1));
  if (!a || (cut >= 0 && !b)) return '#REF!';
  const sheet = a.sheet ? `${quoteSheet(a.sheet)}!` : '';
  return b ? `${sheet}${a.cell}:${b.cell}` : `${sheet}${a.cell}`;
}

/** Fórmula do .ods ("of:=SOMA([.A1:.A3])") → escrita do Excel, sem o "=". */
export function odfToExcelFormula(f: string): string {
  let src = f.trim();
  const ns = /^([a-z]+):(?==)/i.exec(src)?.[1]?.toLowerCase();
  if (ns) src = src.slice(ns.length + 1);
  src = src.replace(/^=/, '');
  if (ns === 'msoxl') return src; // já está na escrita do Excel
  let out = '';
  for (let i = 0; i < src.length; ) {
    const ch = src[i]!;
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && !(src[j] === '"' && src[j + 1] !== '"')) j += src[j] === '"' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (ch === '[') {
      let j = i + 1;
      let q = false;
      while (j < src.length && (src[j] !== ']' || q)) {
        if (src[j] === "'") q = !q;
        j++;
      }
      out += odfRef(src.slice(i + 1, j));
      i = j + 1;
    } else if (ch === ';') {
      out += ',';
      i++;
    } else if (ch === '!' ) {
      out += ' '; // interseção
      i++;
    } else {
      out += ch;
      i++;
    }
  }
  return out.replace(/\b(?:COM\.MICROSOFT\.|_xlfn\.|_xlws\.)/gi, '');
}

const odfSheetName = (s: string): string => (/^[A-Za-z_À-ɏ][\w À-ɏ]*$/.test(s) && !/\s/.test(s) ? s : `'${s.replace(/'/g, "''")}'`);

function odfPart(p: RefPart): string {
  let s = '';
  if (p.col !== undefined) s += (p.absCol ? '$' : '') + colLetters(p.col);
  if (p.row !== undefined) s += (p.absRow ? '$' : '') + String(p.row + 1);
  return s;
}

function colLetters(c: number): string {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const fmtNum = (n: number): string => (Number.isInteger(n) || Math.abs(n) >= 1e-6 ? String(n) : n.toExponential());

/** Árvore da fórmula → OpenFormula (sem o "of:="). */
export function printOdfFormula(n: Node): string {
  const p = printOdfFormula;
  const sheet = (s?: string) => (s === undefined ? '' : `$${odfSheetName(s)}`);
  switch (n.t) {
    case 'num':
      return fmtNum(n.v);
    case 'str':
      return `"${n.v.replace(/"/g, '""')}"`;
    case 'bool':
      return n.v ? 'TRUE()' : 'FALSE()';
    case 'err':
      return n.v === '#CYCLE!' ? '#REF!' : n.v;
    case 'ref':
      return `[${sheet(n.sheet)}.${odfPart(n.a)}]`;
    case 'range':
      return `[${sheet(n.sheet)}.${odfPart(n.a)}:.${odfPart(n.b)}]`;
    case 'name':
      return n.v;
    case 'fn': {
      const name = MS_PREFIXED.has(n.canon) ? `COM.MICROSOFT.${n.canon}` : n.canon;
      return `${name}(${n.args.map(p).join(';')})`;
    }
    case 'un':
      return n.op === '%' ? `${p(n.e)}%` : `${n.op}${p(n.e)}`;
    case 'bin':
      return n.op === ' ' ? `${p(n.l)}!${p(n.r)}` : `${p(n.l)}${n.op}${p(n.r)}`;
    case 'paren':
      return `(${p(n.e)})`;
  }
}

// ---------------------------------------------------------------------------
// formatos de número: ODF ↔ código do Excel

const quoteLit = (s: string): string => (s ? `"${s.replace(/"/g, '')}"` : '');

function numberCode(n: XNode | null): string {
  if (!n) return '0';
  const dec = Number(n.attrs['number:decimal-places'] ?? 0) || 0;
  const minDec = Number(n.attrs['number:min-decimal-places'] ?? dec);
  const minInt = Number(n.attrs['number:min-integer-digits'] ?? 1);
  const group = n.attrs['number:grouping'] === 'true';
  let int = minInt > 0 ? '0'.repeat(minInt) : '#';
  if (group) int = minInt > 1 ? `#,${'0'.repeat(Math.max(3, minInt)).slice(-3)}` : `#,##${minInt ? '0' : '#'}`;
  const frac = dec ? `.${'0'.repeat(Math.min(minDec, dec))}${'#'.repeat(Math.max(0, dec - minDec))}` : '';
  return int + frac;
}

/** Estilo de número do ODF → código de formato do Excel ("" = Geral). */
export function odfNumberStyleCode(st: XNode): string {
  const kind = st.name.replace(/^number:/, '');
  if (kind === 'boolean-style') return '';
  if (kind === 'text-style') return '@';
  let out = '';
  let hadHour = false;
  for (const k of els(st)) {
    const long = k.attrs['number:style'] === 'long';
    switch (k.name) {
      case 'number:number':
        out += numberCode(k);
        break;
      case 'number:scientific-number': {
        const dec = Number(k.attrs['number:decimal-places'] ?? 2);
        out += `0${dec ? `.${'0'.repeat(dec)}` : ''}E+${'0'.repeat(Math.max(2, Number(k.attrs['number:min-exponent-digits'] ?? 2)))}`;
        break;
      }
      case 'number:fraction':
        out += '# ?/?';
        break;
      case 'number:text': {
        const t = textOf(k);
        const dateish = kind === 'date-style' || kind === 'time-style';
        if (dateish && /^[/\-:., ()]*$/.test(t)) out += t;
        else out += kind === 'percentage-style' ? t.split('%').map(quoteLit).join('%') : quoteLit(t);
        break;
      }
      case 'number:fill-character':
        break;
      case 'number:currency-symbol':
        out += quoteLit(textOf(k) || 'R$');
        break;
      case 'number:day':
        out += long ? 'dd' : 'd';
        break;
      case 'number:day-of-week':
        out += long ? 'dddd' : 'ddd';
        break;
      case 'number:month':
        out += k.attrs['number:textual'] === 'true' ? (long ? 'mmmm' : 'mmm') : long ? 'mm' : 'm';
        break;
      case 'number:year':
        out += long ? 'yyyy' : 'yy';
        break;
      case 'number:hours':
        out += kind === 'time-style' && st.attrs['number:truncate-on-overflow'] === 'false' ? (long ? '[hh]' : '[h]') : long ? 'hh' : 'h';
        hadHour = true;
        break;
      case 'number:minutes':
        out += long || hadHour ? 'mm' : 'm';
        break;
      case 'number:seconds': {
        const dec = Number(k.attrs['number:decimal-places'] ?? 0);
        out += (long ? 'ss' : 's') + (dec ? `.${'0'.repeat(dec)}` : '');
        break;
      }
      case 'number:am-pm':
        out += 'AM/PM';
        break;
      case 'number:text-content':
        out += '@';
        break;
      default:
        break;
    }
  }
  if (kind === 'percentage-style' && !out.includes('%')) out += '%';
  // "R$ " como texto colado ao número: junta as aspas vizinhas
  out = out.replace(/""/g, '');
  if (out === '0' || out === '#') return kind === 'number-style' ? '0' : out;
  return out;
}

type Piece = { lit: string } | { tok: string };

function codePieces(code: string): Piece[] {
  const out: Piece[] = [];
  const re = /"([^"]*)"|\\(.)|(\[h+\]|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss(?:\.0+)?|s|AM\/PM|A\/P|E\+0+|[0#?,.]+|%|@)|(\[[^\]]*\])|(.)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1] !== undefined) out.push({ lit: m[1] });
    else if (m[2] !== undefined) out.push({ lit: m[2] });
    else if (m[3] !== undefined) out.push({ tok: m[3] });
    else if (m[4] !== undefined) continue; // [Red], [$-416]
    else if (m[5] === '_' || m[5] === '*') re.lastIndex++; // espaço do tamanho do próximo caractere
    else out.push({ lit: m[5]! });
  }
  return out;
}

/** Código do Excel → <number:*-style> com o nome dado; null se for Geral. */
export function excelCodeToOdfStyle(name: string, code: string): string | null {
  const first = code.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/)[0]!.trim();
  if (!first || first.toLowerCase() === 'general') return null;
  const pieces = codePieces(first);
  const text = (s: string) => (s ? `<number:text>${escXml(s)}</number:text>` : '');
  if (first === '@') return `<number:text-style style:name="${name}"><number:text-content/></number:text-style>`;

  if (isDateFormat(first)) {
    const timeOnly = !/[dy]/i.test(first.replace(/"[^"]*"/g, '')) && !/(^|[^h:])m{3,}/i.test(first);
    const parts: string[] = [];
    let lastHour = false;
    let lit = '';
    const flush = () => {
      if (lit) parts.push(text(lit));
      lit = '';
    };
    pieces.forEach((pc, i) => {
      if ('lit' in pc) {
        lit += pc.lit;
        return;
      }
      const t = pc.tok.toLowerCase();
      const later = pieces.slice(i + 1).find((x) => 'tok' in x) as { tok: string } | undefined;
      const minute = (t === 'm' || t === 'mm') && (lastHour || /^s/i.test(later?.tok ?? ''));
      flush();
      if (t === 'yyyy') parts.push('<number:year number:style="long"/>');
      else if (t === 'yy') parts.push('<number:year/>');
      else if (t === 'mmmm') parts.push('<number:month number:style="long" number:textual="true"/>');
      else if (t === 'mmm') parts.push('<number:month number:textual="true"/>');
      else if (t === 'mm') parts.push(minute ? '<number:minutes number:style="long"/>' : '<number:month number:style="long"/>');
      else if (t === 'm') parts.push(minute ? '<number:minutes/>' : '<number:month/>');
      else if (t === 'dddd') parts.push('<number:day-of-week number:style="long"/>');
      else if (t === 'ddd') parts.push('<number:day-of-week/>');
      else if (t === 'dd') parts.push('<number:day number:style="long"/>');
      else if (t === 'd') parts.push('<number:day/>');
      else if (/^\[?hh/.test(t)) parts.push('<number:hours number:style="long"/>');
      else if (/^\[?h/.test(t)) parts.push('<number:hours/>');
      else if (t.startsWith('ss')) parts.push(`<number:seconds number:style="long"${t.includes('.') ? ` number:decimal-places="${t.length - 3}"` : ''}/>`);
      else if (t === 's') parts.push('<number:seconds/>');
      else if (t === 'am/pm' || t === 'a/p') parts.push('<number:am-pm/>');
      else lit += pc.tok;
      lastHour = t.startsWith('h') || t.startsWith('[h');
    });
    flush();
    const tag = timeOnly ? 'number:time-style' : 'number:date-style';
    const overflow = timeOnly && /\[h/i.test(first) ? ' number:truncate-on-overflow="false"' : '';
    return `<${tag} style:name="${name}"${overflow}>${parts.join('')}</${tag}>`;
  }

  const pct = pieces.some((p) => 'tok' in p && p.tok === '%');
  const sci = pieces.find((p) => 'tok' in p && /^E\+/i.test(p.tok));
  const numIdx = pieces.findIndex((p) => 'tok' in p && /^[0#?,.]+$/.test(p.tok) && /[0#?]/.test(p.tok));
  if (numIdx < 0) return null;
  const pattern = (pieces[numIdx] as { tok: string }).tok;
  const [intPat = '', decPat = ''] = pattern.split('.');
  const dec = decPat.replace(/[^0#?]/g, '').length;
  const minDec = decPat.replace(/[^0]/g, '').length;
  const minInt = intPat.replace(/[^0]/g, '').length;
  const group = intPat.replace(/,+$/, '').includes(',');
  const before = pieces.slice(0, numIdx).map((p) => ('lit' in p ? p.lit : '')).join('');
  const after = pieces
    .slice(numIdx + 1)
    .filter((p) => !('tok' in p && (p.tok === '%' || /^E\+/i.test(p.tok))))
    .map((p) => ('lit' in p ? p.lit : ''))
    .join('');
  if (sci) {
    const exp = (sci as { tok: string }).tok.length - 2;
    return `<number:number-style style:name="${name}">${text(before)}<number:scientific-number number:decimal-places="${dec}" number:min-decimal-places="${minDec}" number:min-integer-digits="${Math.max(1, minInt)}" number:min-exponent-digits="${exp}"/>${text(after)}</number:number-style>`;
  }
  const num = `<number:number number:decimal-places="${dec}" number:min-decimal-places="${minDec}" number:min-integer-digits="${minInt}"${group ? ' number:grouping="true"' : ''}/>`;
  const tag = pct ? 'number:percentage-style' : 'number:number-style';
  return `<${tag} style:name="${name}">${text(before)}${num}${text(after + (pct ? '%' : ''))}</${tag}>`;
}

// ---------------------------------------------------------------------------
// leitura

interface CellStyle {
  parent?: string;
  b?: boolean;
  i?: boolean;
  al?: 'l' | 'c' | 'r';
  data?: string;
}

function readCellStyles(docs: XNode[], into: Map<string, CellStyle>): void {
  for (const doc of docs) {
    for (const st of [...find(doc, 'style:style'), ...find(doc, 'style:default-style')]) {
      if (st.attrs['style:family'] !== 'table-cell') continue;
      const name = st.name === 'style:default-style' ? '#default' : st.attrs['style:name'];
      if (!name) continue;
      const tp = el(st, 'style:text-properties');
      const pp = el(st, 'style:paragraph-properties');
      const s: CellStyle = { parent: st.attrs['style:parent-style-name'] ?? (name === '#default' ? undefined : '#default') };
      const w = tp?.attrs['fo:font-weight'];
      if (w) s.b = w === 'bold' || Number(w) >= 600;
      const it = tp?.attrs['fo:font-style'];
      if (it) s.i = it === 'italic' || it === 'oblique';
      const al = pp?.attrs['fo:text-align'];
      if (al) s.al = al === 'center' ? 'c' : al === 'end' || al === 'right' ? 'r' : al === 'start' || al === 'left' ? 'l' : undefined;
      if (st.attrs['style:data-style-name']) s.data = st.attrs['style:data-style-name'];
      into.set(name, s);
    }
  }
}

function resolveStyle(name: string | undefined, styles: Map<string, CellStyle>, codes: Map<string, string>, cache: Map<string, CellFormat>): CellFormat {
  const key = name ?? '#default';
  const hit = cache.get(key);
  if (hit) return hit;
  const chain: CellStyle[] = [];
  const seen = new Set<string>();
  for (let n: string | undefined = key; n && !seen.has(n); ) {
    seen.add(n);
    const s = styles.get(n);
    if (!s) break;
    chain.push(s);
    n = s.parent;
  }
  const f: CellFormat = {};
  // do mais geral para o mais específico
  for (const s of chain.reverse()) {
    if (s.b !== undefined) s.b ? (f.b = true) : delete f.b;
    if (s.i !== undefined) s.i ? (f.i = true) : delete f.i;
    if (s.al !== undefined) f.al = s.al;
    if (s.data !== undefined) {
      const code = codes.get(s.data);
      if (code) f.nf = code;
      else delete f.nf;
    }
  }
  cache.set(key, f);
  return f;
}

/** Texto de um <text:p>, com espaços, tabulações e quebras. */
function paraText(n: XNode): string {
  let out = '';
  for (const k of n.kids) {
    if (typeof k === 'string') out += k;
    else if (k.name === 'text:s') out += ' '.repeat(Math.max(1, Number(k.attrs['text:c'] ?? 1) || 1));
    else if (k.name === 'text:tab') out += '\t';
    else if (k.name === 'text:line-break') out += '\n';
    else if (k.name === 'office:annotation' || k.name === 'text:note') continue;
    else out += paraText(k);
  }
  return out;
}

const isoToSerial = (iso: string): number | null => {
  const m = /^(-?\d{4,})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), 0) + Number(m[6] ?? 0) * 1000;
  return (ms - Date.UTC(1899, 11, 30)) / 86_400_000;
};

const durationToDays = (d: string): number | null => {
  const m = /^(-)?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(d.trim());
  if (!m) return null;
  const v = Number(m[2] ?? 0) + (Number(m[3] ?? 0) * 3600 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)) / 86400;
  return m[1] ? -v : v;
};

/** Número como o Tanden guarda (sem lixo de ponto flutuante). */
const numRaw = (n: number): string => String(Number.isInteger(n) ? n : Number(n.toPrecision(15)));

/** Texto que, digitado, seria lido como outra coisa ganha um apóstrofo. */
function textRaw(s: string): string {
  if (s === '') return s;
  const p = parseInput(s);
  return p.formula === undefined && p.value === s ? s : `'${s}`;
}

/** Valor de uma célula (sem a fórmula) → texto como seria digitado. */
function cellRaw(c: XNode): string | null {
  const a = c.attrs;
  const type = a['office:value-type'] ?? a['calcext:value-type'];
  switch (type) {
    case 'float':
    case 'percentage':
    case 'currency': {
      const n = Number(a['office:value']);
      return Number.isFinite(n) ? numRaw(n) : null;
    }
    case 'date': {
      const n = isoToSerial(a['office:date-value'] ?? '');
      return n === null ? null : numRaw(n);
    }
    case 'time': {
      const n = durationToDays(a['office:time-value'] ?? '');
      return n === null ? null : numRaw(n);
    }
    case 'boolean':
      return a['office:boolean-value'] === 'true' ? 'TRUE' : 'FALSE';
    default: {
      const ps = els(c, 'text:p');
      const s = ps.length ? ps.map(paraText).join('\n') : a['office:string-value'] ?? '';
      return s === '' ? null : textRaw(s);
    }
  }
}

/** Formato que o tipo do valor pede quando o estilo não diz nada. */
function typeFormat(c: XNode): string | undefined {
  const type = c.attrs['office:value-type'];
  if (type === 'date') return /T\d/.test(c.attrs['office:date-value'] ?? '') ? NF.datetime : NF.date;
  if (type === 'time') return NF.time;
  if (type === 'percentage') return NF.pct;
  if (type === 'currency') return NF.brl;
  return undefined;
}

/** Linhas e colunas dentro de grupos (<table:table-row-group>, cabeçalhos...). */
function flatten(n: XNode, leaf: string, out: XNode[] = []): XNode[] {
  for (const k of els(n)) {
    if (k.name === leaf) out.push(k);
    else if (/^table:table-(header-)?(rows|columns)$|^table:table-(row|column)-group$/.test(k.name)) flatten(k, leaf, out);
  }
  return out;
}

/** Limites para não estourar a memória com repetições do LibreOffice. */
const MAX_REPEAT_FILLED = 10_000;
const MAX_CELLS = 2_000_000;

/** Lê um .ods. Lança erro com mensagem em português se o arquivo não servir. */
export function readOds(bytes: Uint8Array): BookData {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('O arquivo não é um .ods válido.');
  }
  if (!zip['content.xml']) throw new Error('O arquivo não tem o conteúdo de uma planilha (content.xml).');
  const mime = zip.mimetype ? strFromU8(zip.mimetype).trim() : '';
  if (mime && !mime.includes('spreadsheet')) throw new Error('Este arquivo do LibreOffice não é uma planilha.');
  const content = parseXml(strFromU8(zip['content.xml']));
  const stylesDoc = zip['styles.xml'] ? parseXml(strFromU8(zip['styles.xml'])) : null;
  const docs = stylesDoc ? [stylesDoc, content] : [content];

  const codes = new Map<string, string>();
  for (const doc of docs)
    for (const kind of ['number', 'percentage', 'currency', 'date', 'time', 'text', 'boolean'])
      for (const st of find(doc, `number:${kind}-style`)) if (st.attrs['style:name']) codes.set(st.attrs['style:name'], odfNumberStyleCode(st));

  const cellStyles = new Map<string, CellStyle>();
  readCellStyles(docs, cellStyles);
  const fmtCache = new Map<string, CellFormat>();
  const fmtOf = (name: string | undefined) => resolveStyle(name, cellStyles, codes, fmtCache);

  const colWidth = new Map<string, number>();
  for (const st of find(content, 'style:style')) {
    if (st.attrs['style:family'] !== 'table-column') continue;
    const px = lengthToPx(el(st, 'style:table-column-properties')?.attrs['style:column-width']);
    if (px !== null && st.attrs['style:name']) colWidth.set(st.attrs['style:name'], Math.round(px));
  }

  const sheets: SheetData[] = [];
  let total = 0;
  const spreadsheet = find(content, 'office:spreadsheet')[0];
  for (const t of els(spreadsheet, 'table:table')) {
    const sheet: SheetData = { name: t.attrs['table:name'] || `Planilha${sheets.length + 1}`, cells: new Map(), fmt: new Map(), widths: new Map() };
    // colunas: largura e estilo padrão das células
    const colDefault: string[] = [];
    const columns = flatten(t, 'table:table-column').map((col) => ({
      rep: Math.max(1, Number(col.attrs['table:number-columns-repeated'] ?? 1) || 1),
      w: colWidth.get(col.attrs['table:style-name'] ?? ''),
      def: col.attrs['table:default-cell-style-name'],
    }));
    // a largura da maior sequência de colunas é a padrão da aba: essa não é gravada
    const base = columns.reduce<{ rep: number; w?: number }>((a, x) => (x.rep > a.rep ? x : a), { rep: 0 }).w;
    let c = 0;
    for (const col of columns) {
      for (let k = 0; k < col.rep && c < 1024; k++, c++) {
        if (col.w !== undefined && col.w !== base && Math.abs(col.w - DEFAULT_COL_WIDTH) > 1) sheet.widths.set(c, col.w);
        if (col.def) colDefault[c] = col.def;
      }
      if (c >= 1024) break;
    }

    let r = 0;
    for (const row of flatten(t, 'table:table-row')) {
      const rowRep = Math.max(1, Number(row.attrs['table:number-rows-repeated'] ?? 1) || 1);
      const rowDefault = row.attrs['table:default-cell-style-name'];
      const cells: Array<{ c: number; raw: string | null; fmt: CellFormat }> = [];
      let cc = 0;
      for (const cell of els(row)) {
        if (cell.name !== 'table:table-cell' && cell.name !== 'table:covered-table-cell') continue;
        const rep = Math.max(1, Number(cell.attrs['table:number-columns-repeated'] ?? 1) || 1);
        const formula = cell.attrs['table:formula'];
        const raw = formula ? `=${odfToExcelFormula(formula)}` : cellRaw(cell);
        const styleName = cell.attrs['table:style-name'] ?? rowDefault ?? colDefault[cc];
        // célula vazia só guarda formato se tiver estilo próprio e não for repetida às centenas
        if (raw !== null || (cell.attrs['table:style-name'] && rep <= 64)) {
          let fmt = fmtOf(styleName);
          if (raw !== null && !fmt.nf && !formula) {
            const nf = typeFormat(cell);
            if (nf) fmt = { ...fmt, nf };
          }
          for (let k = 0; k < Math.min(rep, MAX_REPEAT_FILLED) && cc + k < MAX_COLS; k++) cells.push({ c: cc + k, raw, fmt });
        }
        cc += rep;
        if (cc >= MAX_COLS) break;
      }
      const times = cells.length ? Math.min(rowRep, MAX_REPEAT_FILLED) : 0;
      for (let k = 0; k < times && r + k < MAX_ROWS; k++) {
        for (const x of cells) {
          const key = cellKey(r + k, x.c);
          if (x.raw !== null) sheet.cells.set(key, x.raw);
          if (Object.keys(x.fmt).length) sheet.fmt.set(key, x.fmt);
          if (++total > MAX_CELLS) throw new Error('A planilha é grande demais para abrir aqui (mais de 2 milhões de células).');
        }
      }
      r += rowRep;
      if (r >= MAX_ROWS) break;
    }
    sheets.push(sheet);
  }
  if (!sheets.length) throw new Error('A planilha não tem nenhuma aba.');
  return { sheets };
}

// ---------------------------------------------------------------------------
// escrita

const ISO = (serial: number): string => serialToDate(serial).toISOString().replace(/\.\d+Z$/, '').replace(/T00:00:00$/, '');

function duration(serial: number): string {
  const secs = Math.round(Math.abs(serial) * 86400);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${serial < 0 ? '-' : ''}PT${h}H${String(m).padStart(2, '0')}M${String(s).padStart(2, '0')}S`;
}

/** Texto da célula em <text:p>, com espaços repetidos e tabulações preservados. */
function paras(s: string): string {
  return s
    .split('\n')
    .map((line) => {
      const body = escXml(line)
        .replace(/\t/g, '<text:tab/>')
        .replace(/ {2,}/g, (sp) => ` <text:s text:c="${sp.length - 1}"/>`)
        .replace(/^ /, '<text:s/>');
      return `<text:p>${body}</text:p>`;
    })
    .join('');
}

function numberValue(v: number, nf: string | undefined): string {
  const n = Number.isFinite(v) ? v : 0;
  if (nf && isDateFormat(nf)) {
    const timeOnly = !/[dy]/i.test(nf.replace(/"[^"]*"/g, '')) && !/(^|[^h:])m{3,}/i.test(nf);
    if (timeOnly) return `office:value-type="time" office:time-value="${duration(n)}"`;
    return `office:value-type="date" office:date-value="${ISO(n)}"`;
  }
  if (nf && /%/.test(nf.replace(/"[^"]*"/g, ''))) return `office:value-type="percentage" office:value="${numRaw(n)}"`;
  return `office:value-type="float" office:value="${numRaw(n)}"`;
}

function valueAttrs(v: Scalar, nf: string | undefined): { attrs: string; text: string } {
  if (v === null) return { attrs: '', text: '' };
  if (typeof v === 'number') return { attrs: numberValue(v, nf), text: '' };
  if (typeof v === 'boolean') return { attrs: `office:value-type="boolean" office:boolean-value="${v}"`, text: v ? 'VERDADEIRO' : 'FALSO' };
  if (isErr(v)) return { attrs: 'office:value-type="string" office:string-value=""', text: v.code === '#CYCLE!' ? '#REF!' : v.code };
  return { attrs: `office:value-type="string"`, text: v };
}

/** Grava a pasta como .ods. `wb` dá os valores calculados das fórmulas. */
export function writeOds(wb: Workbook, title = ''): Uint8Array {
  const book = bookData(wb);
  const ids = wb.sheets().map((s) => s.id);
  const numStyles: string[] = [];
  const numIdx = new Map<string, string>();
  const cellStyles: string[] = [];
  const cellIdx = new Map<string, string>();
  const colStyles: string[] = [];
  const colIdx = new Map<number, string>();

  const dataStyle = (code: string): string | null => {
    let n = numIdx.get(code);
    if (n === undefined) {
      const name = `N${numStyles.length + 100}`;
      const xml = excelCodeToOdfStyle(name, code);
      n = xml ? name : '';
      if (xml) numStyles.push(xml);
      numIdx.set(code, n);
    }
    return n || null;
  };
  const cellStyle = (f: CellFormat | undefined): string | null => {
    if (!f || !Object.keys(f).length) return null;
    const key = `${f.b ? 1 : 0}|${f.i ? 1 : 0}|${f.al ?? ''}|${f.nf ?? ''}`;
    let name = cellIdx.get(key);
    if (name === undefined) {
      name = `ce${cellStyles.length + 1}`;
      const ds = f.nf ? dataStyle(f.nf) : null;
      const tp = f.b || f.i ? `<style:text-properties${f.b ? ' fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"' : ''}${f.i ? ' fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : ''}/>` : '';
      const al = f.al === 'c' ? 'center' : f.al === 'r' ? 'end' : f.al === 'l' ? 'start' : '';
      const pp = al ? `<style:table-cell-properties style:text-align-source="fix"/><style:paragraph-properties fo:text-align="${al}"/>` : '';
      cellStyles.push(`<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${ds ? ` style:data-style-name="${ds}"` : ''}>${pp}${tp}</style:style>`);
      cellIdx.set(key, name);
    }
    return name;
  };
  const colStyle = (px: number): string => {
    const w = Math.round(px);
    let name = colIdx.get(w);
    if (!name) {
      name = `co${colStyles.length + 1}`;
      colStyles.push(`<style:style style:name="${name}" style:family="table-column"><style:table-column-properties fo:break-before="auto" style:column-width="${pxToCm(w)}"/></style:style>`);
      colIdx.set(w, name);
    }
    return name;
  };
  colStyle(DEFAULT_COL_WIDTH);

  const tables = book.sheets.map((sheet, si) => {
    const id = ids[si]!;
    const keys = new Set([...sheet.cells.keys(), ...[...sheet.fmt.keys()].filter((k) => Object.keys(sheet.fmt.get(k)!).length)]);
    const byRow = new Map<number, Array<{ k: string; c: number }>>();
    let maxC = 0;
    for (const k of keys) {
      const p = parseKey(k);
      if (!p) continue;
      const list = byRow.get(p.r) ?? [];
      list.push({ k, c: p.c });
      byRow.set(p.r, list);
      maxC = Math.max(maxC, p.c);
    }
    for (const c of sheet.widths.keys()) maxC = Math.max(maxC, c);

    // colunas: estilos de largura agrupados quando iguais
    const cols: string[] = [];
    for (let c = 0; c <= maxC; ) {
      const w = sheet.widths.get(c) ?? DEFAULT_COL_WIDTH;
      let n = 1;
      while (c + n <= maxC && (sheet.widths.get(c + n) ?? DEFAULT_COL_WIDTH) === w) n++;
      cols.push(`<table:table-column table:style-name="${colStyle(w)}"${n > 1 ? ` table:number-columns-repeated="${n}"` : ''} table:default-cell-style-name="Default"/>`);
      c += n;
    }

    const rows: string[] = [];
    let next = 0;
    for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
      if (r > next) rows.push(`<table:table-row table:style-name="ro1"${r - next > 1 ? ` table:number-rows-repeated="${r - next}"` : ''}><table:table-cell/></table:table-row>`);
      let line = '<table:table-row table:style-name="ro1">';
      let cc = 0;
      for (const { k, c } of byRow.get(r)!.sort((a, b) => a.c - b.c)) {
        if (c > cc) line += `<table:table-cell${c - cc > 1 ? ` table:number-columns-repeated="${c - cc}"` : ''}/>`;
        const fmt = sheet.fmt.get(k);
        const st = cellStyle(fmt);
        const sAttr = st ? ` table:style-name="${st}"` : '';
        const raw = sheet.cells.get(k);
        let formula = '';
        let v: Scalar = null;
        if (raw !== undefined) {
          const p = parseInput(raw);
          if (p.formula !== undefined) {
            try {
              formula = ` table:formula="${escXml(`of:=${printOdfFormula(parseFormula(p.formula))}`)}"`;
              v = wb.value(id, r, c);
            } catch {
              v = raw; // fórmula que nem o Tanden entende: vai como texto
            }
          } else v = p.value;
        }
        const val = valueAttrs(v, fmt?.nf);
        const text = val.text || (typeof v === 'number' || v === null ? '' : String(v));
        const shown = text ? paras(text) : typeof v === 'number' ? `<text:p>${escXml(numRaw(v))}</text:p>` : '';
        line += `<table:table-cell${sAttr}${formula}${val.attrs ? ` ${val.attrs}` : ''}${shown ? `>${shown}</table:table-cell>` : '/>'}`;
        cc = c + 1;
      }
      rows.push(`${line}</table:table-row>`);
      next = r + 1;
    }
    if (!rows.length) rows.push('<table:table-row table:style-name="ro1"><table:table-cell/></table:table-row>');
    return `<table:table table:name="${escXml(sheet.name)}" table:style-name="ta1">${cols.join('')}${rows.join('')}</table:table>`;
  });

  const content =
    `${XML_HEAD}<office:document-content ${ODF_NS} office:version="1.3">` +
    '<office:font-face-decls/>' +
    '<office:automatic-styles>' +
    colStyles.join('') +
    '<style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:use-optimal-row-height="true" fo:break-before="auto"/></style:style>' +
    '<style:style style:name="ta1" style:family="table" style:master-page-name="Default"><style:table-properties table:display="true" style:writing-mode="lr-tb"/></style:style>' +
    numStyles.join('') +
    cellStyles.join('') +
    '</office:automatic-styles>' +
    `<office:body><office:spreadsheet>${tables.join('')}</office:spreadsheet></office:body></office:document-content>`;

  const styles =
    `${XML_HEAD}<office:document-styles ${ODF_NS} office:version="1.3"><office:styles>` +
    '<style:default-style style:family="table-cell"><style:paragraph-properties style:tab-stop-distance="1.25cm"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt" fo:language="pt" fo:country="BR"/></style:default-style>' +
    '<style:style style:name="Default" style:family="table-cell"/>' +
    '</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait"/></style:page-layout></office:automatic-styles>' +
    '<office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';

  return odfPackage(ODF_MIME.ods, {
    'content.xml': content,
    'styles.xml': styles,
    'meta.xml': metaXml(title, escXml),
  });
}
