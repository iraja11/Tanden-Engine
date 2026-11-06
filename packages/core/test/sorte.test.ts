import { describe, expect, it } from 'vitest';
import {
  EIGHT_BALL, coinStreak, drawFrom, drawNumbers, flipCoin, parseLists, parseOptions, removeList, seededRng, setList,
  shakeEightBall, shuffle, sliceAt, spinWheel, splitTeams, weightedIndex, wheelSlices, SorteError,
} from '../src/index';

describe('opções da roleta', () => {
  it('lê uma por linha, com marcadores e pesos', () => {
    expect(parseOptions('- Pizza\n* Sushi *2\n\n1. Marmita x3\n# comentário\nTaco ×1,5')).toEqual([
      { label: 'Pizza', weight: 1 },
      { label: 'Sushi', weight: 2 },
      { label: 'Marmita', weight: 3 },
      { label: 'Taco', weight: 1.5 },
    ]);
  });

  it('aceita vírgulas numa linha só', () => {
    expect(parseOptions('a, b ,c').map((o) => o.label)).toEqual(['a', 'b', 'c']);
  });

  it('não confunde texto com peso', () => {
    expect(parseOptions('Pizza x tudo')).toEqual([{ label: 'Pizza x tudo', weight: 1 }]);
  });

  it('as fatias seguem o peso e fecham 360°', () => {
    const s = wheelSlices(parseOptions('a\nb *3'));
    expect(s[0]).toMatchObject({ start: 0, end: 90 });
    expect(s[1]).toMatchObject({ start: 90, end: 360 });
  });
});

describe('giro', () => {
  it('para dentro da fatia sorteada, de qualquer posição inicial', () => {
    const opts = parseOptions('a\nb\nc *2\nd');
    const slices = wheelSlices(opts);
    const rng = seededRng(7);
    let from = 0;
    for (let i = 0; i < 300; i++) {
      const s = spinWheel(opts, { from, rng });
      expect(s.delta).toBeGreaterThan(360 * 4);
      expect(s.rotation).toBeCloseTo(from + s.delta);
      expect(sliceAt(slices, s.rotation)).toBe(s.index);
      from = s.rotation;
    }
  });

  it('respeita o peso', () => {
    const rng = seededRng(3);
    const n = [0, 0];
    for (let i = 0; i < 4000; i++) n[weightedIndex([1, 3], rng)]!++;
    expect(n[1]! / 4000).toBeGreaterThan(0.7);
    expect(n[1]! / 4000).toBeLessThan(0.8);
  });

  it('roleta vazia é erro', () => {
    expect(() => spinWheel([])).toThrow(SorteError);
  });
});

describe('sorteios', () => {
  const nomes = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fê', 'Gui'];

  it('embaralhar mantém os itens e não mexe no original', () => {
    const copia = [...nomes];
    const s = shuffle(nomes, seededRng(1));
    expect(nomes).toEqual(copia);
    expect([...s].sort()).toEqual([...nomes].sort());
  });

  it('tira sem repetir', () => {
    const d = drawFrom(nomes, 3, seededRng(2));
    expect(d).toHaveLength(3);
    expect(new Set(d).size).toBe(3);
    expect(drawFrom(nomes, 99, seededRng(2))).toHaveLength(nomes.length);
  });

  it('times equilibrados', () => {
    const t = splitTeams(nomes, 3, seededRng(4));
    expect(t.map((x) => x.length).sort()).toEqual([2, 2, 3]);
    expect(t.flat().sort()).toEqual([...nomes].sort());
    expect(() => splitTeams(['a'], 2)).toThrow(SorteError);
  });

  it('números únicos no intervalo, nos dois caminhos', () => {
    for (const [min, max, n] of [[1, 60, 6], [1, 10, 10], [10, 1, 5]] as const) {
      const d = drawNumbers(min, max, n, { rng: seededRng(5) });
      expect(d).toHaveLength(n);
      expect(new Set(d).size).toBe(n);
      for (const x of d) {
        expect(x).toBeGreaterThanOrEqual(Math.min(min, max));
        expect(x).toBeLessThanOrEqual(Math.max(min, max));
      }
    }
    expect(() => drawNumbers(1, 5, 6)).toThrow(/Só existem 5/);
    expect(drawNumbers(1, 2, 20, { unique: false })).toHaveLength(20);
  });
});

describe('moeda e bola 8', () => {
  it('moeda justa', () => {
    const rng = seededRng(9);
    let caras = 0;
    for (let i = 0; i < 4000; i++) if (flipCoin(rng) === 'cara') caras++;
    expect(caras / 4000).toBeGreaterThan(0.46);
    expect(caras / 4000).toBeLessThan(0.54);
  });

  it('sequência', () => {
    expect(coinStreak([])).toBeNull();
    expect(coinStreak(['cara', 'coroa', 'coroa'])).toEqual({ side: 'coroa', n: 2 });
  });

  it('bola 8 clássica e sem repetir a anterior', () => {
    expect(EIGHT_BALL).toHaveLength(20);
    expect(EIGHT_BALL.filter((a) => a.mood === 'sim')).toHaveLength(10);
    const rng = seededRng(11);
    let last = '';
    for (let i = 0; i < 200; i++) {
      const a = shakeEightBall(rng, last);
      expect(a.text).not.toBe(last);
      last = a.text;
    }
  });
});

describe('listas na nota', () => {
  const md = `# Sorteios

Texto solto.

## Almoço
Para os dias de preguiça.
- Pizza
- Sushi *2

## Filmes
1. Duna
2. [ ] Matrix
`;

  it('lê as seções', () => {
    expect(parseLists(md)).toEqual([
      { name: 'Almoço', items: ['Pizza', 'Sushi *2'] },
      { name: 'Filmes', items: ['Duna', 'Matrix'] },
    ]);
  });

  it('troca uma lista sem mexer no resto', () => {
    const out = setList(md, 'almoço', ['Taco', 'Pastel']);
    expect(parseLists(out)).toEqual([
      { name: 'almoço', items: ['Taco', 'Pastel'] },
      { name: 'Filmes', items: ['Duna', 'Matrix'] },
    ]);
    expect(out).toContain('Texto solto.');
    expect(out).toContain('Para os dias de preguiça.');
  });

  it('acrescenta e apaga', () => {
    const out = setList(md, 'Times', ['Ana', 'Bia']);
    expect(parseLists(out).map((l) => l.name)).toEqual(['Almoço', 'Filmes', 'Times']);
    const gone = removeList(out, 'Filmes');
    expect(parseLists(gone).map((l) => l.name)).toEqual(['Almoço', 'Times']);
    expect(gone).not.toContain('Duna');
    expect(setList('', 'Nova', ['x'])).toBe('## Nova\n- x\n');
  });
});
