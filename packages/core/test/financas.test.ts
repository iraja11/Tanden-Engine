import { describe, expect, it } from 'vitest';
import {
  amortize, applyPercent, beforePercent, change, effectiveRate, equivalentRate, formatBRL, formatPercent, fv, incomeTaxRate, irr,
  monthlyFor, nper, npv, parseNumberBR, payback, pmt, pv, rate, realRate, shareOf, simulateInvestment, solveTvm,
} from '../src/financas';
import { CalcSheet, QuickCalc } from '../src/calc';

describe('valor do dinheiro (como o Excel)', () => {
  it('pgto, vp, vf, nper e taxa', () => {
    // PGTO(1%; 12; 1000) = -88,85
    expect(pmt(0.01, 12, 1000)).toBeCloseTo(-88.8487886, 6);
    expect(fv(0.01, 12, -100)).toBeCloseTo(1268.250301, 5);
    expect(pv(0.01, 12, -88.8487886)).toBeCloseTo(1000, 5);
    expect(nper(0.01, -88.8487886, 1000)).toBeCloseTo(12, 6);
    expect(rate(12, -88.8487886, 1000)).toBeCloseTo(0.01, 9);
    // antecipado
    expect(pmt(0.01, 12, 1000, 0, 1)).toBeCloseTo(-87.97, 2);
    // sem juros
    expect(pmt(0, 10, 1000)).toBe(-100);
  });
  it('resolve qualquer incógnita, como a HP-12C', () => {
    const t = { n: 360, i: 0.008, pv: 300_000, pmt: 0, fv: 0 };
    const r = solveTvm('pmt', t);
    expect(r.pmt).toBeCloseTo(-2544.48, 2);
    expect(solveTvm('i', { ...r, i: 0 }).i).toBeCloseTo(0.008, 9);
    expect(solveTvm('n', { ...r, n: 0 }).n).toBeCloseTo(360, 6);
  });
  it('avisa quando a parcela não cobre os juros', () => {
    expect(() => nper(0.02, -10, 1000)).toThrow(/nunca termina/);
  });
});

describe('fluxo de caixa', () => {
  it('vpl, tir e payback', () => {
    const f = [-1000, 300, 400, 500];
    expect(npv(0.1, f)).toBeCloseTo(-21.04, 2);
    expect(irr(f)).toBeCloseTo(0.0889633946934, 11);
    expect(npv(irr(f), f)).toBeCloseTo(0, 8);
    expect(payback(f)).toBeCloseTo(2.6, 9);
    expect(payback([-100, 10])).toBeNull();
    expect(() => irr([100, 200])).toThrow(/entrada e uma saída/);
  });
});

describe('financiamento', () => {
  it('Price: parcela fixa e saldo zerado', () => {
    const t = amortize('price', 10_000, 0.02, 12);
    expect(t.rows).toHaveLength(12);
    expect(t.rows[0]!.payment).toBeCloseTo(945.6, 1);
    expect(t.rows[0]!.interest).toBeCloseTo(200, 9);
    expect(t.rows.at(-1)!.balance).toBe(0);
    expect(t.totalInterest).toBeCloseTo(945.596 * 12 - 10_000, 0);
  });
  it('SAC: amortização fixa, parcela caindo, juros menores que na Price', () => {
    const s = amortize('sac', 12_000, 0.01, 12);
    expect(s.rows.every((r) => Math.abs(r.amortization - 1000) < 1e-9)).toBe(true);
    expect(s.rows[0]!.payment).toBeCloseTo(1120, 9);
    expect(s.rows.at(-1)!.payment).toBeCloseTo(1010, 9);
    expect(s.totalInterest).toBeCloseTo(780, 9);
    expect(s.totalInterest).toBeLessThan(amortize('price', 12_000, 0.01, 12).totalInterest);
  });
});

describe('taxas', () => {
  it('equivalente, efetiva, real e IR regressivo', () => {
    expect(equivalentRate(0.01, 12)).toBeCloseTo(0.126825, 6);
    expect(equivalentRate(0.12, 1 / 12)).toBeCloseTo(0.009488793, 8);
    expect(effectiveRate(0.12, 12)).toBeCloseTo(0.126825, 6);
    expect(realRate(0.1, 0.04)).toBeCloseTo(0.0576923, 6);
    expect([90, 180, 181, 360, 361, 720, 721].map(incomeTaxRate)).toEqual([0.225, 0.225, 0.2, 0.2, 0.175, 0.175, 0.15]);
  });
});

describe('investimento', () => {
  it('juros compostos com aportes', () => {
    const r = simulateInvestment({ initial: 1000, monthly: 100, annualRate: equivalentRate(0.01, 12), months: 12 });
    expect(r.monthlyRate).toBeCloseTo(0.01, 12);
    expect(r.points).toHaveLength(13);
    expect(r.invested).toBe(2200);
    expect(r.gross).toBeCloseTo(1000 * 1.01 ** 12 + fv(0.01, 12, -100), 6);
    expect(r.tax).toBe(0);
  });
  it('IR por prazo de cada aporte', () => {
    // só o inicial, 2 anos: 15% do ganho
    const r = simulateInvestment({ initial: 1000, monthly: 0, annualRate: 0.1, months: 25, incomeTax: true });
    expect(r.tax).toBeCloseTo(r.interest * 0.15, 6);
    expect(r.net).toBeCloseTo(r.gross - r.tax, 9);
  });
  it('aporte para chegar numa meta', () => {
    const m = monthlyFor(100_000, 5000, 0.1, 120);
    const r = simulateInvestment({ initial: 5000, monthly: m, annualRate: 0.1, months: 120 });
    expect(r.gross).toBeCloseTo(100_000, 4);
  });
});

describe('porcentagem e escrita', () => {
  it('contas do dia a dia', () => {
    expect(shareOf(30, 120)).toBe(0.25);
    expect(change(80, 100)).toBe(0.25);
    expect(applyPercent(200, -0.15)).toBe(170);
    expect(beforePercent(110, 0.1)).toBeCloseTo(100, 12);
  });
  it('lê e escreve números à brasileira', () => {
    expect(parseNumberBR('R$ 1.234,56')).toBe(1234.56);
    expect(parseNumberBR('1 234,5')).toBe(1234.5);
    expect(parseNumberBR('12,5%')).toBe(12.5);
    expect(parseNumberBR('1.000')).toBe(1000);
    expect(parseNumberBR('1.5')).toBe(1.5);
    expect(parseNumberBR('−3')).toBe(-3);
    expect(parseNumberBR('abc')).toBeNaN();
    expect(parseNumberBR('')).toBeNaN();
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatPercent(0.126825)).toBe('12,68%');
  });
});

describe('funções financeiras nas folhas', () => {
  const last = (lines: string[]) => {
    const s = new CalcSheet();
    return lines.map((l) => s.run(l)).at(-1)!;
  };
  it('pgto, vf, vpl e tir com a escrita da folha', () => {
    expect(last(['pgto(1%; 12; 1000)'])).toMatchObject({ text: '−88,84878868' });
    expect(last(['vf(0,5%; 24; -200)'])).toMatchObject({ kind: 'value' });
    expect(last(['vpl(10%; [-1000, 300, 400, 500])']).text).toBe('−21,03681443');
    expect(last(['tir(-1000; 300; 400; 500)']).text).toBe('0,08896339469');
    // variável com o mesmo nome continua valendo
    expect(last(['taxa = 2%', 'taxa * 100'])).toMatchObject({ text: '2' });
  });
});

describe('calculadora rápida', () => {
  it('guarda ans, variáveis e histórico', () => {
    const q = new QuickCalc();
    q.run('2 + 3');
    expect(q.run('ans * 2')).toMatchObject({ text: '10' });
    q.run('r = 4');
    expect(q.run('pi * r^2').text).toBe('50,26548246');
    expect(q.history).toHaveLength(4);
  });
  it('prévia não muda nada', () => {
    const q = new QuickCalc();
    q.run('a = 1');
    expect(q.preview('a = 5').text).toBe('5');
    expect(q.run('a').text).toBe('1');
    expect(q.history).toHaveLength(2);
  });
  it('modo grau só nas funções trigonométricas', () => {
    const q = new QuickCalc();
    q.angle = 'deg';
    expect(q.run('sen(30)').text).toBe('0,5');
    expect(q.run('arcsen(0,5)').text).toBe('30');
    expect(q.run('cos(60°)').text).toBe('0,5');
    // cálculo segue em radianos
    expect(q.run('integral(sen(x); x; 0; pi)').text).toBe('2');
    expect(q.run('derivada(sen(x); x; 0)').text).toBe('1');
    q.angle = 'rad';
    expect(q.run('sen(pi/2)').text).toBe('1');
  });
  it('somatório, integral e derivada', () => {
    const q = new QuickCalc();
    expect(q.run('somatorio(k^2; k; 1; 10)').text).toBe('385');
    expect(q.run('integral(x^2; x; 0; 3)').text).toBe('9');
    expect(q.run('derivada(x^3; x)')).toMatchObject({ kind: 'symbolic', text: '3 * x^2' });
  });
});
