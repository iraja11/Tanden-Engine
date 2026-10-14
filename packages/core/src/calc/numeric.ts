/*
 * Métodos numéricos: integral (Gauss-Kronrod adaptativa, aceita limites
 * infinitos), raízes (polinômios exatos até grau 2, Durand-Kerner acima disso,
 * varredura com refinamento para o resto) e limite por aproximação.
 */

export type Fn = (x: number) => number;

const XGK = [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0];
const WGK = [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728];
const WG = [0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469];

function gk15(f: Fn, a: number, b: number): [number, number] {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  let k = fc * WGK[7]!;
  let g = fc * WG[3]!;
  for (let i = 0; i < 7; i++) {
    const dx = h * XGK[i]!;
    const s = f(c - dx) + f(c + dx);
    k += WGK[i]! * s;
    if (i % 2 === 1) g += WG[(i - 1) / 2]! * s;
  }
  return [k * h, Math.abs((k - g) * h)];
}

/** Integral definida de f entre a e b. */
export function integrate(f: Fn, a: number, b: number, tol = 1e-10): number {
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a, tol);
  // limites infinitos: troca de variável para um intervalo finito
  if (a === -Infinity && b === Infinity) return integrate((t) => { const u = 1 - t * t; return (f(t / u) * (1 + t * t)) / (u * u); }, -1, 1, tol);
  if (b === Infinity) return integrate((t) => f(a + t / (1 - t)) / ((1 - t) * (1 - t)), 0, 1, tol);
  if (a === -Infinity) return integrate((t) => f(b - (1 - t) / t) / (t * t), 0, 1, tol);
  const safe: Fn = (x) => {
    const y = f(x);
    return Number.isFinite(y) ? y : 0;
  };
  let total = 0;
  let evals = 0;
  const stack: [number, number, number][] = [[a, b, 0]];
  while (stack.length) {
    const [lo, hi, depth] = stack.pop()!;
    const [v, err] = gk15(safe, lo, hi);
    evals++;
    if (err <= Math.max(tol, tol * Math.abs(v)) || depth > 40 || evals > 20000) total += v;
    else {
      const mid = (lo + hi) / 2;
      stack.push([lo, mid, depth + 1], [mid, hi, depth + 1]);
    }
  }
  if (!Number.isFinite(total)) throw new Error('A integral não converge');
  return total;
}

export interface Complex { re: number; im: number }

/** Raízes de um polinômio; coeficientes do grau maior para o menor. */
export function polyRoots(coef: number[]): Complex[] {
  const c = [...coef];
  while (c.length && Math.abs(c[0]!) < 1e-300) c.shift();
  const n = c.length - 1;
  if (n < 1) return [];
  if (n === 1) return [{ re: -c[1]! / c[0]!, im: 0 }];
  if (n === 2) {
    const [a, b, k] = c as [number, number, number];
    const d = b * b - 4 * a * k;
    if (Math.abs(d) < 1e-14 * b * b) return [{ re: -b / (2 * a), im: 0 }];
    if (d > 0) {
      // forma estável: evita cancelamento
      const q = -(b + Math.sign(b || 1) * Math.sqrt(d)) / 2;
      return [{ re: q / a, im: 0 }, { re: k / q, im: 0 }].sort((p, r) => p.re - r.re);
    }
    const s = Math.sqrt(-d) / (2 * Math.abs(a));
    return [{ re: -b / (2 * a), im: -s }, { re: -b / (2 * a), im: s }];
  }
  // Durand-Kerner
  const lead = c[0]!;
  const p = c.map((x) => x / lead);
  const evalp = (z: Complex): Complex => {
    let re = 1;
    let im = 0;
    for (let i = 1; i <= n; i++) {
      const r = re * z.re - im * z.im + p[i]!;
      im = re * z.im + im * z.re;
      re = r;
    }
    return { re, im };
  };
  const radius = 1 + Math.max(...p.slice(1).map(Math.abs));
  let z: Complex[] = Array.from({ length: n }, (_, k) => ({ re: radius * Math.cos((2 * Math.PI * k) / n + 0.4), im: radius * Math.sin((2 * Math.PI * k) / n + 0.4) }));
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    z = z.map((zi, i) => {
      let dr = 1;
      let di = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ar = zi.re - z[j]!.re;
        const ai = zi.im - z[j]!.im;
        const r = dr * ar - di * ai;
        di = dr * ai + di * ar;
        dr = r;
      }
      const v = evalp(zi);
      const den = dr * dr + di * di || 1e-300;
      const qr = (v.re * dr + v.im * di) / den;
      const qi = (v.im * dr - v.re * di) / den;
      delta = Math.max(delta, Math.hypot(qr, qi));
      return { re: zi.re - qr, im: zi.im - qi };
    });
    if (delta < 1e-14 * radius) break;
  }
  for (const r of z) {
    if (Math.abs(r.im) < 1e-9 * Math.max(1, Math.abs(r.re))) r.im = 0;
  }
  return z.sort((p1, p2) => p1.re - p2.re || p1.im - p2.im);
}

function bisect(f: Fn, a: number, b: number, fa: number): number {
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0 || Math.abs(b - a) <= 1e-15 * Math.max(1, Math.abs(m))) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

function goldenMin(f: Fn, a: number, b: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  for (let i = 0; i < 120; i++) {
    if (Math.abs(f(c)) < Math.abs(f(d))) b = d;
    else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return (a + b) / 2;
}

/** Raízes reais de f em [a, b] por varredura (mais densa perto do zero) e refinamento. */
export function findRoots(f: Fn, a = -1000, b = 1000, max = 50): number[] {
  const N = 40000;
  const xs: number[] = [];
  if (a < 0 && b > 0) {
    // grade em sinh: fina perto de 0, larga longe dele
    const ua = Math.asinh(a);
    const ub = Math.asinh(b);
    for (let i = 0; i <= N; i++) xs.push(Math.sinh(ua + ((ub - ua) * i) / N));
  } else for (let i = 0; i <= N; i++) xs.push(a + ((b - a) * i) / N);
  const ys = xs.map((x) => {
    try {
      return f(x);
    } catch {
      return NaN;
    }
  });
  const roots: number[] = [];
  const push = (r: number) => {
    const fr = f(r);
    if (!Number.isFinite(fr)) return;
    if (roots.some((x) => Math.abs(x - r) <= 1e-9 * Math.max(1, Math.abs(r)))) return;
    roots.push(r);
  };
  for (let i = 1; i < xs.length && roots.length < max; i++) {
    const y0 = ys[i - 1]!;
    const y1 = ys[i]!;
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) push(xs[i - 1]!);
    else if (Math.sign(y0) !== Math.sign(y1) && y1 !== 0) {
      const r = bisect(f, xs[i - 1]!, xs[i]!, y0);
      // troca de sinal por assíntota (tg, 1/x) não é raiz
      const scale = Math.max(Math.abs(y0), Math.abs(y1));
      if (Math.abs(f(r)) <= 1e-6 * Math.max(1, scale)) push(r);
    } else if (i > 1 && Number.isFinite(ys[i - 2]!)) {
      // raiz que só encosta no zero (x² em 0)
      const ym = ys[i - 1]!;
      if (Math.abs(ym) < Math.abs(ys[i - 2]!) && Math.abs(ym) < Math.abs(y1) && Math.sign(ys[i - 2]!) === Math.sign(ym) && Math.sign(ym) === Math.sign(y1)) {
        const r = goldenMin(f, xs[i - 2]!, xs[i]!);
        if (Math.abs(f(r)) < 1e-10) push(r);
      }
    }
  }
  return roots.sort((p, q) => p - q);
}

/** Arredonda ruído de ponto flutuante: 0,99999999997 → 1. */
export function tidy(v: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const r = Number(v.toPrecision(12));
  return Math.abs(r) < 1e-13 ? 0 : r;
}

/** Limite de f quando x → a (lado: 0 ambos, 1 direita, -1 esquerda). */
export function limit(f: Fn, a: number, side: -1 | 0 | 1 = 0): number {
  const seq = (dir: 1 | -1): number[] => {
    const out: number[] = [];
    for (let k = 2; k <= 9; k++) {
      const x = Number.isFinite(a) ? a + dir * Math.pow(10, -k) * Math.max(1, Math.abs(a)) : Math.sign(a) * Math.pow(10, k);
      out.push(f(x));
    }
    return out;
  };
  const settle = (s: number[]): number => {
    const last = s.slice(-4);
    if (last.every((v) => v > 1e8) && last.every((v, i) => i === 0 || v >= last[i - 1]!)) return Infinity;
    if (last.every((v) => v < -1e8) && last.every((v, i) => i === 0 || v <= last[i - 1]!)) return -Infinity;
    const v = last[last.length - 1]!;
    const spread = Math.max(...last) - Math.min(...last);
    if (!Number.isFinite(v) || spread > 1e-4 * Math.max(1, Math.abs(v))) return NaN;
    return v;
  };
  const tidyLimit = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(9)) : v);
  // extrapolação de Richardson: o erro cai com o passo, então 2·f(h/2) − f(h) acerta mais casas
  const refine = (v: number, dir: 1 | -1): number => {
    if (!Number.isFinite(v)) return v;
    const h = Number.isFinite(a) ? 1e-4 * Math.max(1, Math.abs(a)) : 0;
    const r = Number.isFinite(a) ? 2 * f(a + (dir * h) / 2) - f(a + dir * h) : 2 * f(dir * 2e5) - f(dir * 1e5);
    return Number.isFinite(r) && Math.abs(r - v) <= 1e-4 * Math.max(1, Math.abs(v)) ? r : v;
  };
  if (!Number.isFinite(a)) {
    const r = settle(seq(1));
    if (Number.isNaN(r)) throw new Error('O limite não existe');
    return tidyLimit(refine(r, a > 0 ? 1 : -1));
  }
  const right = side >= 0 ? refine(settle(seq(1)), 1) : NaN;
  const left = side <= 0 ? refine(settle(seq(-1)), -1) : NaN;
  if (side === 1) {
    if (Number.isNaN(right)) throw new Error('O limite pela direita não existe');
    return tidyLimit(right);
  }
  if (side === -1) {
    if (Number.isNaN(left)) throw new Error('O limite pela esquerda não existe');
    return tidyLimit(left);
  }
  if (Number.isNaN(left) || Number.isNaN(right)) throw new Error('O limite não existe');
  if (left === right || Math.abs(left - right) <= 1e-5 * Math.max(1, Math.abs(left))) return tidyLimit((left + right) / 2);
  throw new Error(`Os limites laterais diferem (esquerda ${tidyLimit(left)}, direita ${tidyLimit(right)})`);
}
