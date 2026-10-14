import type { MathNode } from 'mathjs';
import { math } from './math';

/*
 * Escrita brasileira para o mathjs.
 *
 * Texto: vírgula decimal (1,5 e 1.234,56), ";" entre argumentos, "em"/"para"/"->"
 * para converter unidades, símbolos digitados (×, ÷, π, √, ², °C, Ω, µ) e "="
 * dentro de parênteses como equação (resolver(x^2 = 4; x)).
 * Árvore: nomes em português (sen, tg, raiz, ln, log na base 10...) viram os do mathjs.
 */

const SUPER: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+',
};

/** Troca os pedaços fora de aspas; dentro de "texto" nada muda. */
function outsideStrings(src: string, fn: (s: string) => string): string {
  return src.split(/("(?:[^"\\]|\\.)*")/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}

function symbols(s: string): string {
  return s
    .replace(/[×⋅∙]/g, '*')
    .replace(/·(?=\s*[\p{L}(\d])/gu, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/∞/g, 'Infinity')
    .replace(/≠/g, '!=')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[°º]\s*C\b/g, 'degC')
    .replace(/[°º]\s*F\b/g, 'degF')
    .replace(/[°º]/g, ' deg')
    .replace(/Ω/g, 'ohm')
    .replace(/[µμ](?=[A-Za-z])/g, 'u')
    .replace(/√\s*(\d+(?:[.,]\d+)?|[\p{L}_][\p{L}\p{N}_]*)(?!\s*\()/gu, 'sqrt($1)')
    .replace(/√/g, 'sqrt')
    .replace(/∛\s*(\d+(?:[.,]\d+)?|[\p{L}_][\p{L}\p{N}_]*)(?!\s*\()/gu, 'cbrt($1)')
    .replace(/∛/g, 'cbrt')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (m) => `^(${[...m].map((c) => SUPER[c]).join('')})`);
}

function numbers(s: string): string {
  return s
    // milhar separado por espaço (comum, fino ou não separável): 12 345,6
    .replace(/(?<![\p{L}\p{N}_.,])\d{1,3}(?:[ \u2009\u202f\u00a0]\d{3})+(?!\p{N})/gu, (m) => m.replace(/[ \u2009\u202f\u00a0]/g, ''))
    // 1.234,56 → 1234.56 (só com vírgula no fim, para não confundir com 1.234 decimal)
    .replace(/(?<![\p{L}\p{N}_.])(\d{1,3}(?:\.\d{3})+),(\d+)/gu, (_m, int: string, frac: string) => `${int.replace(/\./g, '')}.${frac}`)
    // 1,5 → 1.5 (vírgula colada entre dígitos é decimal)
    .replace(/(?<![\p{L}_])(\d+),(\d+)/gu, '$1.$2');
}

/** ";" separa argumentos dentro de ( ), mas separa linhas de matriz dentro de [ ]. "=" dentro de ( ) é equação. */
function separators(s: string): string {
  let out = '';
  const stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '(' || c === '[' || c === '{') stack.push(c);
    else if (c === ')' || c === ']' || c === '}') stack.pop();
    const top = stack[stack.length - 1];
    if (c === ';' && top === '(') {
      out += ',';
      continue;
    }
    if (c === '=' && top === '(' && !/[=<>!:]/.test(s[i - 1] ?? '') && s[i + 1] !== '=') {
      out += '==';
      continue;
    }
    out += c;
  }
  return out;
}

function words(s: string): string {
  return s
    .replace(/\s*(?:->|→|=>)\s*/g, ' to ')
    .replace(/\s+(?:em|para)\s+(?=[\p{L}°ºµΩ(])/gu, ' to ');
}

/** Corta comentários: // e # até o fim da linha. */
export function stripComment(line: string): string {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== '\\') inStr = !inStr;
    if (inStr) continue;
    if (c === '#' || (c === '/' && line[i + 1] === '/')) return line.slice(0, i);
  }
  return line;
}

/** Texto em português → texto que o parser do mathjs entende. */
export function preprocess(src: string): string {
  return outsideStrings(src, (s) => words(separators(numbers(symbols(s)))));
}

/** Nomes de função em português (e apelidos comuns) → nome no mathjs. */
export const FN_ALIASES: Record<string, string> = {
  sen: 'sin', seno: 'sin', cosseno: 'cos', tg: 'tan', cotg: 'cot', cossec: 'csc',
  arcsen: 'asin', asen: 'asin', arccos: 'acos', arctg: 'atan', atg: 'atan', arctan: 'atan', arcsin: 'asin',
  senh: 'sinh', tgh: 'tanh', arcsenh: 'asinh', asenh: 'asinh', arctgh: 'atanh', arccosh: 'acosh',
  raiz: 'sqrt', raizq: 'sqrt', raizc: 'cbrt', raiz3: 'cbrt',
  arred: 'round', arredondar: 'round', piso: 'floor', teto: 'ceil', trunc: 'fix', truncar: 'fix',
  fat: 'factorial', fatorial: 'factorial', mdc: 'gcd', mmc: 'lcm', sinal: 'sign',
  media: 'mean', média: 'mean', mediana: 'median', moda: 'mode', desvpad: 'std', variancia: 'variance', variância: 'variance',
  soma: 'sum', produto: 'prod', comb: 'combinations', combinacao: 'combinations', combinação: 'combinations',
  arranjo: 'permutations', perm: 'permutations', transp: 'transpose', transposta: 'transpose', inversa: 'inv',
  determinante: 'det', vetorial: 'cross', escalar: 'dot', norma: 'norm', imag: 'im', conjugado: 'conj',
  aleatorio: 'random', aleatório: 'random', hipot: 'hypot', resto: 'mod', abs: 'abs', modulo: 'abs', módulo: 'abs',
  derivative: 'derivada', deriv: 'derivada', diff: 'derivada', simplify: 'simplificar', expand: 'expandir',
  solve: 'resolver', raizes: 'resolver', raízes: 'resolver', integrar: 'integral', integrate: 'integral',
  limit: 'limite', lim: 'limite', somatorio: 'somatorio', somatório: 'somatorio', sum_: 'somatorio', produtorio: 'produtorio', produtório: 'produtorio',
};

/** Renomeia funções na árvore. log(x) é na base 10 (como no Brasil); ln é o natural. */
export function localize(node: MathNode): MathNode {
  return node.transform((n) => {
    if (n.type !== 'FunctionNode') return n;
    const f = n as unknown as { fn: { type: string; name: string }; args: MathNode[] };
    if (f.fn.type !== 'SymbolNode') return n;
    let name = f.fn.name;
    if (name === 'log' && f.args.length === 1) name = 'log10';
    else if (name === 'ln') name = 'log';
    else name = FN_ALIASES[name] ?? name;
    if (name === f.fn.name) return n;
    return new math.FunctionNode(new math.SymbolNode(name), f.args.map((a) => localize(a)));
  });
}

/** Rótulo no começo da linha, no estilo "Aluguel: 1500". */
export function splitLabel(line: string): { label: string | null; body: string } {
  const m = /^\s*([\p{L}][\p{L}\p{N} _'/.-]*?)\s*:\s+(.+)$/u.exec(line);
  if (m && !/^(x|y|t|θ)$/.test(m[1]!)) return { label: m[1]!, body: m[2]! };
  return { label: null, body: line };
}
