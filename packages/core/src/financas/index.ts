/*
 * Matemática financeira: valor do dinheiro no tempo (como a HP-12C e o Excel),
 * VPL e TIR, tabelas Price e SAC, taxas equivalentes, simulação de investimento
 * com aportes e IR regressivo, e as contas de porcentagem do dia a dia.
 *
 * Tudo em números puros, sem mathjs: a aba Financeira e as funções das folhas
 * (pgto, vf, vpl, tir...) usam daqui.
 *
 * Convenção de sinais (a mesma do Excel e da HP-12C) nas funções de valor do
 * dinheiro: dinheiro que entra é positivo, o que sai é negativo. Pegar R$ 1.000
 * emprestado (vp = 1000) dá uma parcela negativa (você paga). As taxas vão em
 * fração por período: 1% ao mês = 0.01.
 */

/** 0: pagamento no fim do período (postecipado); 1: no começo (antecipado) */
export type PayWhen = 0 | 1;

const growth = (rate: number, n: number) => Math.pow(1 + rate, n);

/** Valor futuro (VF do Excel). */
export function fv(rate: number, n: number, pmt: number, pv = 0, when: PayWhen = 0): number {
  if (rate === 0) return -(pv + pmt * n);
  const g = growth(rate, n);
  return -(pv * g + (pmt * (1 + rate * when) * (g - 1)) / rate);
}

/** Valor presente (VP do Excel). */
export function pv(rate: number, n: number, pmt: number, fvalue = 0, when: PayWhen = 0): number {
  if (rate === 0) return -(fvalue + pmt * n);
  const g = growth(rate, n);
  return -(fvalue + (pmt * (1 + rate * when) * (g - 1)) / rate) / g;
}

/** Parcela (PGTO do Excel). */
export function pmt(rate: number, n: number, pvalue: number, fvalue = 0, when: PayWhen = 0): number {
  if (n === 0) throw new Error('O número de períodos não pode ser zero');
  if (rate === 0) return -(pvalue + fvalue) / n;
  const g = growth(rate, n);
  return (-(pvalue * g + fvalue) * rate) / ((1 + rate * when) * (g - 1));
}

/** Número de períodos (NPER do Excel). */
export function nper(rate: number, pmtv: number, pvalue: number, fvalue = 0, when: PayWhen = 0): number {
  if (rate === 0) {
    if (pmtv === 0) throw new Error('Sem taxa e sem parcela, o valor nunca muda');
    return -(pvalue + fvalue) / pmtv;
  }
  const z = (pmtv * (1 + rate * when)) / rate;
  const ratio = (z - fvalue) / (pvalue + z);
  if (!(ratio > 0)) throw new Error('Com esses valores a dívida nunca termina (a parcela não cobre os juros)');
  return Math.log(ratio) / Math.log(1 + rate);
}

/** Resto da equação do valor do dinheiro: zero quando a taxa está certa. */
function tvmGap(rate: number, n: number, pmtv: number, pvalue: number, fvalue: number, when: PayWhen): number {
  if (Math.abs(rate) < 1e-12) return pvalue + pmtv * n + fvalue;
  const g = growth(rate, n);
  return pvalue * g + (pmtv * (1 + rate * when) * (g - 1)) / rate + fvalue;
}

/**
 * Raiz de f entre lo e hi: Newton (derivada numérica) e, se ele fugir,
 * bisseção no primeiro trecho em que f troca de sinal.
 */
function solveRate(f: (r: number) => number, guess: number, lo = -0.9999, hi = 10): number {
  let r = guess;
  for (let i = 0; i < 60; i++) {
    const y = f(r);
    if (!Number.isFinite(y)) break;
    if (y === 0) return r;
    const h = 1e-7 * Math.max(1, Math.abs(r));
    const d = (f(r + h) - f(r - h)) / (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    const next = r - y / d;
    if (!Number.isFinite(next) || next <= lo || next > hi) break;
    if (Math.abs(next - r) < 1e-13) return next;
    r = next;
  }
  // varredura: acha um trecho com troca de sinal e faz bisseção
  const N = 2000;
  let a = lo;
  let fa = f(a);
  for (let i = 1; i <= N; i++) {
    // passos mais finos perto de zero, onde ficam as taxas de verdade
    let b = lo + (hi - lo) * Math.pow(i / N, 3);
    const fb = f(b);
    if (Number.isFinite(fa) && Number.isFinite(fb) && Math.sign(fa) !== Math.sign(fb)) {
      for (let k = 0; k < 200; k++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (Math.abs(b - a) < 1e-14 || fm === 0) return m;
        if (Math.sign(fm) === Math.sign(fa)) {
          a = m;
          fa = fm;
        } else b = m;
      }
      return (a + b) / 2;
    }
    a = b;
    fa = fb;
  }
  throw new Error('Não achei uma taxa que feche essa conta');
}

/** Taxa por período (TAXA do Excel). */
export function rate(n: number, pmtv: number, pvalue: number, fvalue = 0, when: PayWhen = 0, guess = 0.01): number {
  if (n <= 0) throw new Error('O número de períodos precisa ser positivo');
  return solveRate((r) => tvmGap(r, n, pmtv, pvalue, fvalue, when), guess);
}

/** O que resolver na calculadora de valor do dinheiro (estilo HP-12C). */
export type TvmKey = 'n' | 'i' | 'pv' | 'pmt' | 'fv';
export interface Tvm {
  n: number;
  /** taxa por período, em fração */
  i: number;
  pv: number;
  pmt: number;
  fv: number;
  when?: PayWhen;
}

/** Resolve a incógnita `key` com os outros quatro valores; devolve todos. */
export function solveTvm(key: TvmKey, t: Tvm): Tvm {
  const when = t.when ?? 0;
  const out = { ...t, when };
  switch (key) {
    case 'n': out.n = nper(t.i, t.pmt, t.pv, t.fv, when); break;
    case 'i': out.i = rate(t.n, t.pmt, t.pv, t.fv, when); break;
    case 'pv': out.pv = pv(t.i, t.n, t.pmt, t.fv, when); break;
    case 'pmt': out.pmt = pmt(t.i, t.n, t.pv, t.fv, when); break;
    case 'fv': out.fv = fv(t.i, t.n, t.pmt, t.pv, when); break;
  }
  return out;
}

// ---------- fluxo de caixa ----------

/** Valor presente líquido. O primeiro fluxo é o do momento zero (como o CF0 da HP-12C). */
export function npv(rate: number, flows: number[]): number {
  let acc = 0;
  for (let k = 0; k < flows.length; k++) acc += flows[k]! / growth(rate, k);
  return acc;
}

/** Taxa interna de retorno: a taxa em que o VPL dá zero. */
export function irr(flows: number[], guess = 0.1): number {
  if (!flows.some((v) => v > 0) || !flows.some((v) => v < 0)) throw new Error('A TIR precisa de pelo menos uma entrada e uma saída de dinheiro');
  return solveRate((r) => npv(r, flows), guess);
}

/** Payback descontado: em que período (fracionário) o fluxo acumulado vira positivo. null se nunca. */
export function payback(flows: number[], rate = 0): number | null {
  let acc = 0;
  for (let k = 0; k < flows.length; k++) {
    const v = flows[k]! / growth(rate, k);
    if (acc < 0 && acc + v >= 0 && k > 0) return k - 1 + -acc / v;
    acc += v;
    if (k === 0 && acc >= 0) return 0;
  }
  return null;
}

// ---------- financiamento ----------

export type AmortKind = 'price' | 'sac';

export interface AmortRow {
  /** número da parcela, de 1 a n */
  k: number;
  payment: number;
  interest: number;
  amortization: number;
  /** saldo devedor depois da parcela */
  balance: number;
}

export interface AmortTable {
  rows: AmortRow[];
  totalPaid: number;
  totalInterest: number;
}

/** Tabela de amortização Price (parcela fixa) ou SAC (amortização fixa). Taxa por período. */
export function amortize(kind: AmortKind, principal: number, rate: number, n: number): AmortTable {
  if (!Number.isInteger(n) || n < 1) throw new Error('O número de parcelas precisa ser inteiro e positivo');
  if (n > 1200) throw new Error('Parcelas demais (máximo 1200)');
  const rows: AmortRow[] = [];
  let balance = principal;
  const fixed = kind === 'price' ? -pmt(rate, n, principal) : principal / n;
  for (let k = 1; k <= n; k++) {
    const interest = balance * rate;
    const amortization = kind === 'price' ? fixed - interest : fixed;
    const payment = kind === 'price' ? fixed : fixed + interest;
    balance -= amortization;
    // a última parcela zera o saldo (sem resto de arredondamento)
    if (k === n) balance = 0;
    rows.push({ k, payment, interest, amortization, balance });
  }
  const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
  return { rows, totalPaid, totalInterest: totalPaid - principal };
}

// ---------- taxas ----------

/** Taxa equivalente: `periods` períodos da taxa dada (1% a.m. → a.a.: periods = 12). */
export function equivalentRate(rate: number, periods: number): number {
  return growth(rate, periods) - 1;
}

/** Taxa real descontada a inflação (equação de Fisher). */
export function realRate(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}

/** Taxa nominal capitalizada `per` vezes → taxa efetiva no mesmo prazo (12% a.a. cap. mensal → 12,68%). */
export function effectiveRate(nominal: number, per: number): number {
  return growth(nominal / per, per) - 1;
}

/** Alíquota do IR regressivo da renda fixa pelo prazo em dias. */
export function incomeTaxRate(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.2;
  if (days <= 720) return 0.175;
  return 0.15;
}

// ---------- investimento ----------

export interface InvestInput {
  initial: number;
  /** aporte no fim de cada mês */
  monthly: number;
  /** taxa ao ano, em fração (convertida para mensal equivalente) */
  annualRate: number;
  months: number;
  /** desconta o IR regressivo da renda fixa no resgate (cada aporte pelo prazo dele) */
  incomeTax?: boolean;
}

export interface InvestPoint {
  month: number;
  invested: number;
  balance: number;
}

export interface InvestResult {
  points: InvestPoint[];
  invested: number;
  gross: number;
  interest: number;
  tax: number;
  net: number;
  monthlyRate: number;
}

export function simulateInvestment(inp: InvestInput): InvestResult {
  const months = Math.round(inp.months);
  if (months < 0 || months > 1200) throw new Error('O prazo vai de 0 a 1200 meses');
  const i = equivalentRate(inp.annualRate, 1 / 12);
  const points: InvestPoint[] = [{ month: 0, invested: inp.initial, balance: inp.initial }];
  let balance = inp.initial;
  let invested = inp.initial;
  for (let m = 1; m <= months; m++) {
    balance = balance * (1 + i) + inp.monthly;
    invested += inp.monthly;
    points.push({ month: m, invested, balance });
  }
  let tax = 0;
  if (inp.incomeTax) {
    // cada depósito rende pelo próprio prazo e paga a alíquota desse prazo
    const deposits: [number, number][] = [[inp.initial, months]];
    for (let m = 1; m <= months; m++) deposits.push([inp.monthly, months - m]);
    for (const [v, age] of deposits) {
      const gain = v * (growth(i, age) - 1);
      if (gain > 0) tax += gain * incomeTaxRate(age * 30);
    }
  }
  return { points, invested, gross: balance, interest: balance - invested, tax, net: balance - tax, monthlyRate: i };
}

/** Quanto aportar por mês para chegar a `target` (sem IR). */
export function monthlyFor(target: number, initial: number, annualRate: number, months: number): number {
  const i = equivalentRate(annualRate, 1 / 12);
  return -pmt(i, months, -initial, target);
}

// ---------- porcentagem ----------

/** p% de x (p em fração). */
export const percentOf = (p: number, x: number): number => p * x;
/** Quanto x é de y, em fração. */
export const shareOf = (x: number, y: number): number => {
  if (y === 0) throw new Error('Divisão por zero');
  return x / y;
};
/** Variação de a para b, em fração. */
export const change = (a: number, b: number): number => {
  if (a === 0) throw new Error('A variação a partir de zero não existe');
  return (b - a) / a;
};
/** x com p aplicado (aumento se p > 0, desconto se p < 0). */
export const applyPercent = (x: number, p: number): number => x * (1 + p);
/** Valor antes de um aumento (ou desconto) p: o que virou x. */
export const beforePercent = (x: number, p: number): number => {
  if (p === -1) throw new Error('Desconto de 100% não volta');
  return x / (1 + p);
};

// ---------- entrada e saída ----------

/**
 * Número escrito à brasileira: "1.234,56", "R$ 1 234,56", "12,5%", "-3". Também
 * aceita "1234.56". Porcentagem não vira fração aqui (12,5% → 12.5). NaN se não for número.
 */
export function parseNumberBR(src: string): number {
  let s = src.trim().replace(/^(?:R\$|US\$|\$|€)\s*/i, '').replace(/%$/, '').replace(/[\s   ]/g, '').replace(/[−–]/g, '-');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s) ? Number(s) : NaN;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** R$ 1.234,56 (sem espaço estranho do Intl). */
export function formatBRL(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return brl.format(Object.is(v, -0) ? 0 : v).replace(/ /g, ' ');
}

/** 12,68% com as casas pedidas. Recebe fração. */
export function formatPercent(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}
