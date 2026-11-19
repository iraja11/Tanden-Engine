import { describe, expect, it } from 'vitest';
import {
  addCombatants, areaCells, autoPlace, cellName, colName, distanceLabel, encounterTemplate, gridDistance, gridProps, makeArea,
  moveCombatant, parseCell, parseProps, parseScale, parseTokenSize, pathDistance, readEncounter, readGrid, setProps, speedSquares, tokenDistance,
  tokensHit, writeEncounter, type Combatant,
} from '../src/index';

const base = (name: string, side = 'inimigo'): Omit<Combatant, '_i'> => ({
  name, init: null, mod: 0, hp: 7, hpMax: 7, ac: 12, conditions: [], side,
});

describe('grade: nomes de casa', () => {
  it('colunas como planilha', () => {
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colName(27)).toBe('AB');
    expect(colName(52)).toBe('BA');
  });

  it('ida e volta', () => {
    for (const c of [{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 26, y: 9 }, { x: 77, y: 99 }]) expect(parseCell(cellName(c))).toEqual(c);
    expect(parseCell('c 4')).toEqual({ x: 2, y: 3 });
    expect(parseCell('C0')).toBeNull();
    expect(parseCell('4C')).toBeNull();
    expect(parseCell('')).toBeNull();
  });
});

describe('grade: configuração', () => {
  it('lê das propriedades, com padrão no que falta', () => {
    const g = readGrid(parseProps('---\ngrade: 30x20\nquadrado: 5 pés\ndiagonal: alternada\nmapa: "[[cripta.png]]"\n---\n'));
    expect(g).toEqual({ cols: 30, rows: 20, scale: 5, unit: 'ft', diagonal: 'alternada', image: 'cripta.png' });
    const d = readGrid(parseProps('---\ntipo: encontro\n---\n'));
    expect(d.cols).toBe(24);
    expect(d.scale).toBe(1.5);
    expect(d.diagonal).toBe('padrao');
  });

  it('escala com vírgula e tamanho fora do limite', () => {
    expect(parseScale('1,5 m')).toEqual({ scale: 1.5, unit: 'm' });
    expect(parseScale('3 metros')).toEqual({ scale: 3, unit: 'm' });
    expect(parseScale('abc')).toBeNull();
    expect(readGrid(parseProps('---\ngrade: 1x999\n---\n'))).toMatchObject({ cols: 4, rows: 100 });
  });

  it('grava só o que não é padrão', () => {
    const p = gridProps({ cols: 24, rows: 16, scale: 1.5, unit: 'm', diagonal: 'padrao', image: '' });
    expect(p).toEqual({ grade: '24x16', quadrado: null, diagonal: null, mapa: null });
    const text = setProps('---\ntipo: encontro\n---\n# X\n', gridProps({ cols: 10, rows: 8, scale: 1.5, unit: 'ft', diagonal: 'real', image: 'mapa.png' }));
    expect(readGrid(parseProps(text))).toEqual({ cols: 10, rows: 8, scale: 1.5, unit: 'ft', diagonal: 'real', image: 'mapa.png' });
  });

  it('tamanho de criatura', () => {
    expect(parseTokenSize('')).toBe(1);
    expect(parseTokenSize('Médio')).toBe(1);
    expect(parseTokenSize('grande')).toBe(2);
    expect(parseTokenSize('Enorme')).toBe(3);
    expect(parseTokenSize('imenso')).toBe(4);
    expect(parseTokenSize('3')).toBe(3);
  });
});

describe('grade: distância', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 4, y: 3 };
  it('cada regra de diagonal', () => {
    expect(gridDistance(a, b, 'padrao')).toBe(4);
    // 3 diagonais (1+2+1) + 1 reta
    expect(gridDistance(a, b, 'alternada')).toBe(5);
    expect(gridDistance(a, b, 'real')).toBe(5);
    expect(gridDistance(a, b, 'manhattan')).toBe(7);
  });

  it('alternada lembra da paridade entre trechos', () => {
    // 1 diagonal + 1 diagonal = 1 + 2, não 1 + 1
    expect(pathDistance([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 'alternada')).toBe(3);
    expect(pathDistance([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], 'padrao')).toBe(2);
    expect(pathDistance([{ x: 0, y: 0 }], 'padrao')).toBe(0);
  });

  it('entre fichas mede de borda a borda', () => {
    // ogro 2x2 em (0,0) e goblin em (3,0): sobra 1 casa no meio → 2 quadrados
    expect(tokenDistance({ x: 0, y: 0 }, 2, { x: 3, y: 0 }, 1, 'padrao')).toBe(2);
    expect(tokenDistance({ x: 0, y: 0 }, 1, { x: 1, y: 1 }, 1, 'padrao')).toBe(1);
    expect(tokenDistance({ x: 0, y: 0 }, 2, { x: 1, y: 1 }, 1, 'padrao')).toBe(0);
  });

  it('deslocamento da ficha em quadrados', () => {
    const m = { scale: 1.5, unit: 'm' };
    expect(speedSquares('9 m', m)).toBe(6);
    expect(speedSquares('30 ft', m)).toBe(6);
    expect(speedSquares('9 m, voo 18 m', m)).toBe(6);
    expect(speedSquares('7,5', m)).toBe(5);
    expect(speedSquares('30 pés', { scale: 5, unit: 'ft' })).toBe(6);
    expect(speedSquares('9 m', { scale: 5, unit: 'ft' })).toBe(6);
    expect(speedSquares('', m)).toBeNull();
  });

  it('rótulo em quadrados e na medida da mesa', () => {
    expect(distanceLabel(6, { scale: 1.5, unit: 'm' })).toBe('6 q · 9 m');
    expect(distanceLabel(5, { scale: 1.5, unit: 'm' })).toBe('5 q · 7,5 m');
    expect(distanceLabel(4, { scale: 5, unit: 'ft' })).toBe('4 q · 20 ft');
  });
});

describe('grade: áreas', () => {
  const g = { cols: 20, rows: 20 };
  it('círculo de raio 1 a partir de um cruzamento pega 2x2', () => {
    const a = makeArea('circulo', { x: 5, y: 5 }, { x: 6, y: 5 });
    expect(a.size).toBe(1);
    expect(areaCells(a, g).map(cellName).sort()).toEqual(['E5', 'E6', 'F5', 'F6']);
  });

  it('cone de 3 cresce até a largura do comprimento', () => {
    const a = makeArea('cone', { x: 5, y: 5.5 }, { x: 8, y: 5.5 });
    const cells = areaCells(a, g);
    // a coluna mais longe tem 3 casas, a mais perto 1
    const byCol = (x: number) => cells.filter((c) => c.x === x).length;
    expect(byCol(5)).toBe(1);
    expect(byCol(7)).toBe(3);
    expect(cells.every((c) => c.x >= 5)).toBe(true);
  });

  it('linha de 1 quadrado de largura', () => {
    const a = makeArea('linha', { x: 2, y: 2.5 }, { x: 8, y: 2.5 });
    const cells = areaCells(a, g);
    expect(cells).toHaveLength(6);
    expect(cells.every((c) => c.y === 2)).toBe(true);
  });

  it('cubo cresce para o lado do arrasto e fica dentro da grade', () => {
    const a = makeArea('quadrado', { x: 3, y: 3 }, { x: 1, y: 1 });
    expect(areaCells(a, g).map(cellName).sort()).toEqual(['B2', 'B3', 'C2', 'C3']);
    const edge = makeArea('quadrado', { x: 0, y: 0 }, { x: -3, y: -3 });
    expect(areaCells(edge, g)).toEqual([]);
  });

  it('acerta fichas grandes por qualquer casa', () => {
    const tokens = [
      { name: 'Ogro', pos: { x: 4, y: 4 }, size: 2 },
      { name: 'Goblin', pos: { x: 10, y: 10 }, size: 1 },
      { name: 'Fora', pos: null },
    ];
    const hit = tokensHit([{ x: 5, y: 5 }], tokens);
    expect(hit.map((t) => t.name)).toEqual(['Ogro']);
  });
});

describe('grade: no encontro', () => {
  it('colunas Pos e Tam só aparecem quando usadas, e voltam iguais', () => {
    let text = encounterTemplate('Emboscada');
    let e = addCombatants(readEncounter(text), base('Goblin'), 2);
    text = writeEncounter(text, e);
    expect(text).not.toContain('| Pos');
    e = moveCombatant(readEncounter(text), 'Goblin 1', { x: 2, y: 3 });
    e = { ...e, list: e.list.map((c) => (c.name === 'Goblin 2' ? { ...c, size: 2 } : c)) };
    text = writeEncounter(text, e);
    expect(text).toContain('| Pos');
    expect(text).toContain('| Tam');
    expect(text).toMatch(/Goblin 1 .*\| C4 /);
    const back = readEncounter(text);
    expect(back.list.find((c) => c.name === 'Goblin 1')!.pos).toEqual({ x: 2, y: 3 });
    expect(back.list.find((c) => c.name === 'Goblin 2')!.size).toBe(2);
    // tirar da grade limpa a casa, mas a coluna continua
    text = writeEncounter(text, moveCombatant(back, 'Goblin 1', null));
    expect(readEncounter(text).list.find((c) => c.name === 'Goblin 1')!.pos).toBeNull();
    expect(text).toContain('| Pos');
  });

  it('colunas escritas à mão continuam', () => {
    const text = `---\ntipo: encontro\n---\n## Combatentes\n| Nome | Casa | Notas |\n| --- | --- | --- |\n| Orc | d7 | líder |\n`;
    const e = readEncounter(text);
    expect(e.list[0]!.pos).toEqual({ x: 3, y: 6 });
    const out = writeEncounter(text, moveCombatant(e, 'Orc', { x: 0, y: 0 }));
    expect(out).toMatch(/\| Orc .*\| A1 .*\| líder/);
  });

  it('distribui: grupo à esquerda, inimigos à direita, sem sobrepor', () => {
    let e = readEncounter(encounterTemplate('X'));
    e = addCombatants(e, base('Kael', 'grupo'));
    e = addCombatants(e, base('Lia', 'grupo'));
    e = addCombatants(e, { ...base('Ogro'), size: 2 });
    e = addCombatants(e, base('Goblin'), 3);
    const placed = autoPlace(e, { cols: 12, rows: 8 });
    expect(placed.list.every((c) => c.pos)).toBe(true);
    const kael = placed.list.find((c) => c.name === 'Kael')!;
    const ogro = placed.list.find((c) => c.name === 'Ogro')!;
    expect(kael.pos!.x).toBeLessThan(3);
    expect(ogro.pos!.x).toBeGreaterThan(8);
    expect(ogro.pos!.x + 2).toBeLessThanOrEqual(12);
    const cells = placed.list.flatMap((c) => {
      const s = c.size ?? 1;
      const out: string[] = [];
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) out.push(`${c.pos!.x + dx},${c.pos!.y + dy}`);
      return out;
    });
    expect(new Set(cells).size).toBe(cells.length);
  });
});
