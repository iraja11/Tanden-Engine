/*
 * Números em português: "vinte e cinco", "cento e doze", "dois mil e vinte e
 * seis", "meia", "2,5", "1.500". E uma calculadora que entende frases:
 * "quanto é 15% de 80", "raiz de 144", "dois mais dois vezes três",
 * "o dobro de 21", "2 elevado a 10", "7 ao quadrado".
 *
 * A calculadora é um analisador de precedência (Pratt), sem eval: só
 * números, operadores conhecidos e parênteses passam.
 */

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
  seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900,
  meia: 0.5, meio: 0.5,
};
const MULT: Record<string, number> = { mil: 1000, milhao: 1e6, milhoes: 1e6, bilhao: 1e9, bilhoes: 1e9 };

/** "1.500", "2,5", "3.14", "10" → número (vírgula decimal brasileira). */
export function numeroDigitos(w: string): number | null {
  if (!/^\d[\d.,]*$/.test(w)) return null;
  let s = w;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê um número por extenso a partir de `toks[i]`. Devolve o valor e quantos
 * tokens consumiu, ou null. "meia" sozinha só vale como número se `meia` for true.
 */
export function numeroExtenso(toks: string[], i: number, meia = false): { valor: number; usados: number } | null {
  let total = 0;
  let grupo = 0;
  let j = i;
  let achou = false;
  while (j < toks.length) {
    const w = toks[j]!;
    const d = numeroDigitos(w);
    if (d !== null && !achou) {
      grupo = d;
      achou = true;
      j++;
      if (MULT[toks[j] ?? '']) {
        total += grupo * MULT[toks[j]!]!;
        grupo = 0;
        j++;
      }
      break;
    }
    if (w in UNIDADES && (w !== 'meia' && w !== 'meio' || meia || achou)) {
      if (w === 'meia' || w === 'meio') {
        if (achou) break;
        grupo = 0.5;
        achou = true;
        j++;
        break;
      }
      grupo += UNIDADES[w]!;
      achou = true;
      j++;
    } else if (MULT[w] && (achou || w === 'mil')) {
      total += (grupo || 1) * MULT[w]!;
      grupo = 0;
      achou = true;
      j++;
    } else if (w === 'e' && achou && j + 1 < toks.length && (toks[j + 1]! in UNIDADES) && toks[j + 1] !== 'meia') {
      j++;
    } else break;
  }
  if (!achou) return null;
  return { valor: total + grupo, usados: j - i };
}

/** Todos os números de uma lista de tokens, na ordem. */
export function numerosEm(toks: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < toks.length;) {
    const n = numeroExtenso(toks, i);
    if (n) {
      out.push(n.valor);
      i += n.usados;
    } else i++;
  }
  return out;
}

// ------------------------------------------------------------------ calculadora

type Tok = { t: 'n'; v: number } | { t: 'op'; v: string } | { t: '(' } | { t: ')' };

/** frases de operação → símbolo (as mais longas primeiro) */
const OPS: Array<[string, string]> = [
  ['multiplicado por', '*'], ['dividido por', '/'], ['elevado ao', '^'], ['elevado a', '^'], ['elevado', '^'], ['somado a', '+'], ['somado com', '+'],
  ['ao quadrado', '²'], ['ao cubo', '³'], ['por cento de', '%de'], ['por cento', '%'], ['raiz quadrada de', '√'], ['raiz cubica de', '∛'], ['raiz de', '√'], ['raiz', '√'],
  ['o dobro de', 'dobro'], ['dobro de', 'dobro'], ['o triplo de', 'triplo'], ['triplo de', 'triplo'], ['a metade de', 'metade'], ['metade de', 'metade'],
  ['mais', '+'], ['menos', '-'], ['vezes', '*'], ['x', '*'], ['sobre', '/'], ['dividido', '/'],
];
const LIXO = new Set(['quanto', 'quantos', 'e', 'da', 'de', 'do', 'eh', 'calcula', 'calcule', 'qual', 'o', 'a', 'resultado', 'faz', 'conta', 'me', 'diz', 'fala', 'ai', 'pra', 'para', 'mim', 'por', 'favor', 'anima', 'amor', 'sabe', 'voce', 'quanta', 'deu', 'da', 'igual', 'a', 'ae']);

function tokenizar(limpo: string): Tok[] | null {
  // separa símbolos colados: "2+2", "15%", "(3*4)"
  let s = ` ${limpo.replace(/[?!=]+/g, ' ').replace(/,(?!\d)/g, ' ').replace(/(\d)\s*x\s*(\d)/g, '$1 * $2').replace(/([+\-*/^%()²³√])/g, ' $1 ').replace(/\s+/g, ' ')} `;
  s = s.replace(/%\s+(?:de|do|da)\s/g, ' %de ');
  for (const [frase, op] of OPS) s = s.replace(new RegExp(`\\s${frase.replace(/ /g, '\\s')}(?=\\s)`, 'g'), ` ${op} `);
  const ws = s.trim().split(/\s+/).filter(Boolean);
  const out: Tok[] = [];
  let i = 0;
  let temNumero = false;
  while (i < ws.length) {
    const w = ws[i]!;
    if (w === '(' || w === ')') {
      out.push({ t: w });
      i++;
      continue;
    }
    if (['+', '-', '*', '/', '^', '²', '³', '%', '%de', '√', '∛', 'dobro', 'triplo', 'metade'].includes(w)) {
      out.push({ t: 'op', v: w });
      i++;
      continue;
    }
    const n = numeroExtenso(ws, i, true);
    if (n) {
      out.push({ t: 'n', v: n.valor });
      temNumero = true;
      i += n.usados;
      continue;
    }
    if (LIXO.has(w) || w === '?' || w === '=') {
      i++;
      continue;
    }
    return null; // palavra que não é conta: não é uma conta
  }
  return temNumero ? out : null;
}

/** Calcula uma frase. Devolve null se não for uma conta (ou se não tiver nenhum operador). */
export function calcular(limpo: string): { valor: number; expressao: string } | null {
  const lidos = tokenizar(limpo);
  if (!lidos || !lidos.some((t) => t.t === 'op')) return null;
  const toks: Tok[] = lidos;
  let p = 0;
  const peek = () => toks[p];
  const LBP: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, '%de': 25, '^': 30, '²': 40, '³': 40, '%': 40 };

  function nud(): number {
    const t = toks[p++];
    if (!t) throw new Error('fim');
    if (t.t === 'n') return t.v;
    if (t.t === '(') {
      const v = expr(0);
      if (peek()?.t === ')') p++;
      return v;
    }
    if (t.t === 'op') {
      if (t.v === '-') return -expr(35);
      if (t.v === '+') return expr(35);
      if (t.v === '√') return Math.sqrt(expr(35));
      if (t.v === '∛') return Math.cbrt(expr(35));
      if (t.v === 'dobro') return 2 * expr(35);
      if (t.v === 'triplo') return 3 * expr(35);
      if (t.v === 'metade') return expr(35) / 2;
    }
    throw new Error('inesperado');
  }
  function expr(rbp: number): number {
    let left = nud();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op') break;
      const lbp = LBP[t.v] ?? 0;
      if (lbp <= rbp) break;
      p++;
      switch (t.v) {
        case '+': left += expr(10); break;
        case '-': left -= expr(10); break;
        case '*': left *= expr(20); break;
        case '/': left /= expr(20); break;
        case '^': left = left ** expr(29); break;
        case '²': left = left ** 2; break;
        case '³': left = left ** 3; break;
        case '%': left = left / 100; break;
        case '%de': left = (left / 100) * expr(25); break;
        default: throw new Error('op');
      }
    }
    return left;
  }
  try {
    const valor = expr(0);
    if (p < toks.length || !Number.isFinite(valor)) return null;
    const expressao = toks.map((t) => (t.t === 'n' ? fmt(t.v) : t.t === 'op' ? ({ '%de': '% de', dobro: 'o dobro de', triplo: 'o triplo de', metade: 'metade de', '*': '×', '/': '÷' } as Record<string, string>)[t.v] ?? t.v : t.t)).join(' ')
      .replace(/\s+([%²³)])/g, '$1').replace(/\(\s+/g, '(').replace(/√\s+/g, '√');
    return { valor, expressao };
  } catch {
    return null;
  }
}

/** Número em português, com vírgula e no máximo 6 casas ("3,14", "1.024", "0,333333"). */
export function fmt(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('pt-BR');
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
}
