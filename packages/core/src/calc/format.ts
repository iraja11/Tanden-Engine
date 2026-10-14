import type { MathNode } from 'mathjs';
import { math } from './math';

/*
 * Resultados na escrita brasileira: vírgula decimal, milhar com espaço fino
 * (assim o resultado colado de volta é lido do mesmo jeito), unidades com
 * expoente (m/s²) e notação científica com × 10ⁿ.
 */

const THIN = ' ';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (s: string) => s.replace(/\d/g, (d) => SUP[+d]!).replace(/-/g, '⁻').replace(/\./g, '·');

function group(int: string): string {
  return int.length > 4 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN) : int;
}

/** Número em pt-BR com até `digits` algarismos significativos. */
export function formatNumber(v: number, digits = 10): string {
  if (Number.isNaN(v)) return 'indefinido';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v === 0) return '0';
  const neg = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-6) {
    const [m, e] = a.toExponential(digits - 1).split('e');
    const mant = m!.replace(/\.?0+$/, '').replace('.', ',');
    return `${neg}${mant} × 10${sup(String(Number(e)))}`;
  }
  const s = Number(a.toPrecision(digits)).toString();
  if (s.includes('e')) return formatNumber(v, digits); // toString de números grandes
  const [int, frac] = s.split('.');
  return `${neg}${group(int!)}${frac ? `,${frac}` : ''}`;
}

/** Texto de unidade do mathjs ("kg m / s^2") → "kg·m/s²". */
export function prettyUnit(u: string): string {
  const fix = (part: string) =>
    part
      .trim()
      .split(/\s+/)
      .map((tok) =>
        tok
          .replace(/^\(|\)$/g, '')
          .replace(/^degC$/, '°C')
          .replace(/^degF$/, '°F')
          .replace(/^deg$/, '°')
          .replace(/ohm$/, 'Ω')
          .replace(/^u(?=[A-Za-zΩ])/, 'µ')
          .replace(/\^\(?(-?[\d.]+)\)?/, (_m, e: string) => sup(e)),
      )
      .join('·');
  const [num, ...den] = u.split(' / ');
  if (!den.length) return fix(num!);
  const d = den.map(fix).join('·');
  const n = num!.trim() === '1' ? '1' : fix(num!);
  return `${n}/${den.length > 1 || /·/.test(d) ? `(${d})` : d}`;
}

function formatUnit(u: unknown): string {
  const s = math.format(u as never, { precision: 12 });
  const m = /^(\S+)\s+(.*)$/.exec(s);
  if (!m) return s;
  const n = Number(m[1]);
  return `${Number.isFinite(n) || Number.isNaN(n) ? formatNumber(n) : m[1]} ${prettyUnit(m[2]!)}`;
}

function formatComplex(c: { re: number; im: number }): string {
  if (Math.abs(c.im) < 1e-14 * Math.max(1, Math.abs(c.re))) return formatNumber(c.re);
  const im = Math.abs(c.im) === 1 ? '' : formatNumber(Math.abs(c.im));
  if (Math.abs(c.re) < 1e-14 * Math.abs(c.im)) return `${c.im < 0 ? '−' : ''}${im}i`;
  return `${formatNumber(c.re)} ${c.im < 0 ? '−' : '+'} ${im}i`;
}

/** Qualquer valor do mathjs como texto curto. */
export function formatValue(v: unknown): string {
  const t = math.typeOf(v);
  switch (t) {
    case 'number':
      return formatNumber(v as number);
    case 'boolean':
      return v ? 'verdadeiro' : 'falso';
    case 'string':
      return `"${v as string}"`;
    case 'Unit':
      return formatUnit(v);
    case 'Complex':
      return formatComplex(v as { re: number; im: number });
    case 'Fraction':
    case 'BigNumber':
      return formatNumber(Number(v));
    case 'DenseMatrix':
    case 'SparseMatrix':
    case 'Array': {
      const arr = (t === 'Array' ? v : (v as { toArray(): unknown[] }).toArray()) as unknown[];
      if (arr.length && Array.isArray(arr[0])) return `[${(arr as unknown[][]).map((r) => r.map(formatValue).join('  ')).join('; ')}]`;
      return `[${arr.map(formatValue).join('; ')}]`;
    }
    case 'Function':
      return 'ƒ';
    case 'ResultSet':
      return formatValue((v as { entries: unknown[] }).entries.at(-1));
    case 'undefined':
    case 'null':
      return '';
    default:
      return String(v);
  }
}

/** TeX para matrizes e vetores; null quando o texto já basta. */
export function valueTex(v: unknown): string | null {
  const t = math.typeOf(v);
  if (t !== 'DenseMatrix' && t !== 'Array') return null;
  const arr = (t === 'Array' ? v : (v as { toArray(): unknown[] }).toArray()) as unknown[];
  const rows = arr.length && Array.isArray(arr[0]) ? (arr as unknown[][]) : arr.map((x) => [x]);
  const cell = (x: unknown) => formatValue(x).replace(/,/g, '{,}').replace(/ × 10(\S+)/, (_m, e: string) => `\\times 10^{${e.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => (c === '⁻' ? '-' : String(SUP.indexOf(c))))}}`).replace(/−/g, '-').replace(/ /g, '\\,');
  return `\\begin{bmatrix}${rows.map((r) => r.map(cell).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`;
}

const TEX_NAMES: Record<string, string> = { sin: 'sen', tan: 'tg', asin: 'arcsen', atan: 'arctg', sinh: 'senh', tanh: 'tgh', cot: 'cotg', csc: 'cossec' };

/** Expressão simbólica em TeX, com sen/tg e vírgula decimal. */
export function nodeTex(node: MathNode): string {
  const tex = node.toTex({
    parenthesis: 'auto',
    implicit: 'hide',
    handler: (n: MathNode, options: object) => {
      if (n.type === 'FunctionNode') {
        const f = n as unknown as { fn: { name?: string }; args: MathNode[] };
        const pt = f.fn.name && TEX_NAMES[f.fn.name];
        if (pt) return `\\operatorname{${pt}}\\left(${f.args.map((a) => a.toTex(options)).join(',')}\\right)`;
      }
      return undefined;
    },
  } as never);
  return tex
    .replace(/(\d)\.(\d)/g, '$1{,}$2')
    // 3·x vira 3x: o ponto só fica entre dois números
    .replace(/(\d|\})\\cdot(?=\s*(?:\{\s*[a-zA-Z\\]|[a-zA-Z]|\\left|\\operatorname|\\sin|\\cos|\\tan|\\ln|\\log|\\exp|\\sqrt|\\pi))/g, '$1\\,');
}

/** Expressão simbólica em texto que pode ser colado de volta numa linha. */
export function nodeText(node: MathNode): string {
  return node
    .toString({ parenthesis: 'auto', implicit: 'hide' })
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/, /g, '; ')
    .replace(/ \^ /g, '^')
    .replace(/\blog\(/g, 'ln(')
    .replace(/\blog10\(/g, 'log(')
    .replace(/\bsin\(/g, 'sen(')
    .replace(/\btan\(/g, 'tg(');
}
