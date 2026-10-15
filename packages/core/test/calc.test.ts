import { describe, expect, it } from 'vitest';
import { analyzeNote, CalcSheet, formatNumber, integrate, polyRoots, preprocess } from '../src/calc';

const run = (lines: string[]) => {
  const s = new CalcSheet();
  return lines.map((l) => s.run(l));
};
const last = (lines: string[]) => run(lines).at(-1)!;

describe('escrita brasileira', () => {
  it('vírgula decimal, milhar e ponto-e-vírgula', () => {
    expect(preprocess('1,5 + 1.234,56')).toBe('1.5 + 1234.56');
    expect(preprocess('max(1; 2,5)')).toBe('max(1, 2.5)');
    expect(preprocess('[1; 2]')).toBe('[1; 2]');
    expect(last(['2,5 * 2'])).toMatchObject({ kind: 'value', text: '5' });
    expect(last(['1.234,5 + 0,5'])).toMatchObject({ text: '1235' });
    expect(last(['12 345,5 * 2'])).toMatchObject({ text: '24 691' });
  });
  it('funções em português', () => {
    expect(last(['sen(30°)'])).toMatchObject({ text: '0,5' });
    expect(last(['raiz(16) + log(1000) + ln(e)'])).toMatchObject({ text: '8' });
    expect(last(['tg(45 deg)'])).toMatchObject({ text: '1' });
    expect(last(['mdc(12; 18)'])).toMatchObject({ text: '6' });
    expect(last(['√9 + 2²'])).toMatchObject({ text: '7' });
  });
  it('formata números', () => {
    expect(formatNumber(1234567.891)).toBe('1 234 567,891');
    expect(formatNumber(0.1 + 0.2)).toBe('0,3');
    expect(formatNumber(6.02e23)).toBe('6,02 × 10²³');
    expect(formatNumber(-1.5e-9)).toBe('−1,5 × 10⁻⁹');
  });
});

describe('unidades', () => {
  it('converte com "em"', () => {
    expect(last(['100 km/h em m/s'])).toMatchObject({ text: '27,77777778 m/s' });
    expect(last(['3 m * 4 m'])).toMatchObject({ text: '12 m²' });
    expect(last(['25 °C para °F'])).toMatchObject({ text: '77 °F' });
    expect(last(['2 cv em kW'])).toMatchObject({ text: '1,4709975 kW' });
    expect(last(['10 kgf em N'])).toMatchObject({ text: '98,0665 N' });
    expect(last(['5 kΩ * 2 mA em V'])).toMatchObject({ text: '10 V' });
  });
  it('acusa unidades incompatíveis', () => {
    expect(last(['2 m + 3 s'])).toMatchObject({ kind: 'error', error: 'Unidades incompatíveis' });
  });
  it('constantes', () => {
    expect(last(['70 kg * g0 em N'])).toMatchObject({ text: '686,4655 N' });
  });
});

describe('folha', () => {
  it('variáveis, funções, rótulos e total', () => {
    const r = run(['Aluguel: 1500', 'luz = 200,50', 'f(x) = x^2 + 1', 'f(3) + luz', 'total', 'ans * 2']);
    expect(r[0]).toMatchObject({ kind: 'value', label: 'Aluguel', text: '1500' });
    expect(r[1]).toMatchObject({ kind: 'assign', name: 'luz', trivial: true });
    expect(r[2]).toMatchObject({ kind: 'function', name: 'f' });
    expect(r[3]).toMatchObject({ text: '210,5' });
    expect(r[4]).toMatchObject({ text: '1911' });
    expect(r[5]).toMatchObject({ text: '3822' });
  });
  it('comentários e erros em português', () => {
    expect(last(['2 + 2 // quatro'])).toMatchObject({ text: '4' });
    expect(last(['y + 1'])).toMatchObject({ kind: 'error', error: 'y não está definido' });
    expect(last(['(2 + 3'])).toMatchObject({ kind: 'error' });
  });
  it('dinheiro e apelidos em inglês', () => {
    expect(last(['preço = 120 reais', 'qtd = 7', 'preço * qtd'])).toMatchObject({ text: '840' });
    expect(last(['R$ 10,50 + US$ 2'])).toMatchObject({ text: '12,5' });
    expect(last(['derive(x^3; x)'])).toMatchObject({ kind: 'symbolic' });
  });
  it('matrizes e complexos', () => {
    expect(last(['det([1, 2; 3, 4])'])).toMatchObject({ text: '−2' });
    expect(last(['raiz(-4)'])).toMatchObject({ text: '2i' });
    expect(last(['A = [1, 2; 3, 4]', 'A * 2']).tex).toContain('bmatrix');
  });
});

describe('simbólico', () => {
  it('derivada', () => {
    expect(last(['derivada(x^3 + 2x; x)'])).toMatchObject({ kind: 'symbolic', text: '3 * x^2 + 2' });
    expect(last(['f(x) = sen(x) * x', 'derivada(f(x); x)']).text).toBe('cos(x) * x + sen(x)');
    expect(last(['derivada(x^2; x; 3)'])).toMatchObject({ kind: 'value', text: '6' });
    expect(last(['s(t) = 5 t^2', 'v(t) = derivada(s(t); t)', 'v(2)'])).toMatchObject({ text: '20' });
    expect(last(['a = 3', 'derivada(a * x^2; x)']).text).toBe('6 * x');
  });
  it('mantém a variável simbólica mesmo se ela tiver valor', () => {
    expect(last(['x = 5', 'derivada(x^2; x)'])).toMatchObject({ kind: 'symbolic', text: '2 * x' });
  });
  it('integral indefinida e definida', () => {
    expect(last(['integral(3x^2; x)'])).toMatchObject({ kind: 'symbolic', text: 'x^3 + C' });
    expect(last(['integral(cos(2x); x)']).text).toBe('sen(2 x) / 2 + C');
    expect(last(['integral(1/x; x)']).text).toBe('ln(abs(x)) + C');
    expect(last(['integral(x^2; x; 0; 3)'])).toMatchObject({ kind: 'value', text: '9' });
    expect(last(['integral(e^(-x^2); x; -inf; inf)']).text).toBe(formatNumber(Math.sqrt(Math.PI)));
    expect(last(['F(b) = integral(t; t; 0; b)', 'F(4)'])).toMatchObject({ text: '8' });
  });
  it('simplificar, expandir e taylor', () => {
    expect(last(['simplificar((x^2 - 1)/(x - 1))']).text).toBe('x + 1');
    expect(last(['expandir((x + 1)^2)']).text).toBe('x^2 + 2 * x + 1');
    expect(last(['taylor(e^x; x; 0; 3)']).text).toBe('1 + x + 1 / 2 * x^2 + 1 / 6 * x^3');
  });
  it('por partes, unidades dentro da função e polinômios em ordem', () => {
    expect(last(['integral(x*e^x; x)']).text).toBe('e^x * (x - 1) + C');
    expect(last(['q = 12 kN/m', 'f(x) = q/(1 kN/m) * x * (6 - x) / 2', 'derivada(f(x); x)']).text).toBe('-12 * x + 36');
    expect(last(['x = 3', 'expandir((x + 1)^2)'])).toMatchObject({ kind: 'symbolic', text: 'x^2 + 2 * x + 1' });
    expect(run(['q = 12 kN/m'])[0]).toMatchObject({ trivial: true });
  });
  it('resolver', () => {
    expect(last(['resolver(x^2 = 4; x)'])).toMatchObject({ kind: 'solutions', text: 'x = −2  ou  x = 2' });
    expect(last(['resolver(2x + 1 = 7)'])).toMatchObject({ text: 'x = 3' });
    expect(last(['resolver(x^2 + 1 = 0; x)']).text).toBe('x = −i  ou  x = i');
    expect(last(['resolver(cos(x) = x; x)']).text).toBe('x = 0,7390851332');
    expect(last(['resolver(x^3 - 6x^2 + 11x - 6 = 0; x)']).text).toBe('x = 1  ou  x = 2  ou  x = 3');
    expect(last(['resolver(sen(x) = 0; x; 0; 7)']).text).toBe('x = 0  ou  x = 3,141592654  ou  x = 6,283185307');
  });
  it('limite e somatório', () => {
    expect(last(['limite(sen(x)/x; x; 0)'])).toMatchObject({ text: '1' });
    expect(last(['limite((1 + 1/n)^n; n; inf)']).text).toBe('2,71828183');
    expect(last(['limite(1/x; x; 0)'])).toMatchObject({ kind: 'error' });
    expect(last(['somatorio(k^2; k; 1; 10)'])).toMatchObject({ text: '385' });
  });
});

describe('numérico', () => {
  it('raízes de polinômio', () => {
    expect(polyRoots([1, 0, -4]).map((z) => z.re)).toEqual([-2, 2]);
  });
  it('integral', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 10);
    expect(integrate((x) => Math.exp(-x), 0, Infinity)).toBeCloseTo(1, 9);
  });
});

describe('nota', () => {
  const note = [
    '# Projeto',
    '',
    '```calc',
    'L = 2 m',
    'q = 5 kN/m',
    'M = q * L^2 / 8 em kN*m',
    '```',
    'Texto qualquer.',
    '```grafico',
    'y = sen(x)',
    'Momento: q/(1 kN/m) * x',
    'x: 0..2pi',
    '```',
  ].join('\n');
  it('avalia blocos calc e lê o gráfico com as variáveis de cima', () => {
    const r = analyzeNote(note);
    expect(r.results.get(5)).toMatchObject({ text: '2,5 kN·m' });
    expect(r.results.has(7)).toBe(false);
    expect(r.plots).toHaveLength(1);
    const p = r.plots[0]!;
    expect(p.start).toBe(8);
    expect(p.end).toBe(12);
    expect(p.spec.errors).toEqual([]);
    expect(p.spec.x![1]).toBeCloseTo(2 * Math.PI);
    expect(p.spec.series).toHaveLength(2);
    const s = p.spec.series[1]!;
    expect(s.kind === 'fx' && s.f(2)).toBe(10);
  });
  it('nota inteira de cálculo com "tipo: cálculo"', () => {
    const r = analyzeNote(['---', 'tipo: cálculo', '---', '# Compras', 'Pão: 8,50', 'Leite: 6', 'total', 'Anotação sem conta', '# Outra', '2 * 3', 'total'].join('\n'));
    expect(r.whole).toBe(true);
    expect(r.results.get(6)).toMatchObject({ text: '14,5' });
    expect(r.results.get(7)).toMatchObject({ kind: 'text' });
    expect(r.results.get(10)).toMatchObject({ text: '6' });
  });
  it('gráfico paramétrico, polar, pontos e erros', () => {
    const r = analyzeNote(['```grafico', '(cos(t); sen(t))', 'r = 1 + cos(θ)', 'pontos: (1; 2) (3; 4)', 'x = 2', 'y = zzz(x)', 'título: Teste', '```'].join('\n'));
    const spec = r.plots[0]!.spec;
    expect(spec.series.map((s) => s.kind).sort()).toEqual(['param', 'points', 'polar', 'vline']);
    expect(spec.title).toBe('Teste');
    expect(spec.errors).toHaveLength(1);
  });
});
