import { describe, expect, it } from 'vitest';
import {
  addItem, campaignIndex, carryCapacity, parseCoins, spendCoins, changeQty, coinsValue, crXp, encounterMultiplier, formatCoins, formatMoney, imageOf, inventoryWeight,
  itemLabel, makeChange, noCoins, parseMoney, parseProps, pay, purseProps, rarityOf, rateEncounter, readInventory, readItemCard,
  readPurse, splitLoot, worldIndex, writeInventory,
} from '../src/index';

describe('moedas', () => {
  it('lê a bolsa das propriedades, com apelidos', () => {
    const p = readPurse(parseProps('---\npo: 12\nPrata: 30\ncobre: 7\n---\n'));
    expect(p.coins).toEqual({ pl: 0, po: 12, pe: 0, pp: 30, pc: 7 });
    expect(p.keys.pp).toBe('Prata');
    expect(coinsValue(p.coins)).toBe(1507);
    expect(p.present.pl).toBe(false);
  });

  it('paga com as moedas pequenas primeiro e dá troco', () => {
    // 5 po 3 pp; custa 2 pp → sobra 5 po 1 pp
    expect(pay({ ...noCoins(), po: 5, pp: 3 }, 20)).toEqual({ ...noCoins(), po: 5, pp: 1 });
    // só ouro; custa 2 pp → quebra 1 po, troco 8 pp
    expect(pay({ ...noCoins(), po: 5 }, 20)).toEqual({ ...noCoins(), po: 4, pp: 8 });
    // 1 pl; custa 1 po 5 pc → troco em ouro, prata e cobre
    expect(pay({ ...noCoins(), pl: 1 }, 105)).toEqual({ ...noCoins(), po: 8, pp: 9, pc: 5 });
    expect(pay({ ...noCoins(), po: 1 }, 101)).toBeNull();
    // o total sempre bate
    const before = { pl: 1, po: 3, pe: 1, pp: 4, pc: 9 };
    const after = pay(before, 777)!;
    expect(coinsValue(before) - coinsValue(after)).toBe(777);
  });

  it('gasta com as moedas escritas quando tem, senão com troco', () => {
    const have = { ...noCoins(), po: 47, pp: 12, pc: 30 };
    expect(spendCoins(have, { ...noCoins(), pp: 3, pc: 5 })).toEqual({ ...noCoins(), po: 47, pp: 9, pc: 25 });
    expect(spendCoins(have, { ...noCoins(), pl: 1 })).toEqual(pay(have, 1000));
    expect(spendCoins({ ...noCoins(), pc: 3 }, { ...noCoins(), po: 1 })).toBeNull();
  });

  it('entende valores escritos à mão', () => {
    expect(parseMoney('12 po')).toBe(1200);
    expect(parseMoney('3po 5pp')).toBe(350);
    expect(parseMoney('1.500 po')).toBe(150000);
    expect(parseMoney('2,5 po')).toBe(250);
    expect(parseMoney('40')).toBe(4000);
    expect(parseMoney('7 pc e 2 pp')).toBe(27);
    expect(parseMoney('dez dragões')).toBeNull();
    expect(parseMoney('5 peças de ouro')).toBe(500);
  });

  it('mantém as moedas como vieram escritas', () => {
    expect(parseCoins('3 po 5 pp')).toEqual({ ...noCoins(), po: 3, pp: 5 });
    expect(parseCoins('40')).toEqual({ ...noCoins(), po: 40 });
    expect(parseCoins('2,5 po')).toEqual({ ...noCoins(), po: 2, pp: 5 });
    expect(parseCoins('2 platina')).toEqual({ ...noCoins(), pl: 2 });
    expect(parseCoins('muito ouro')).toBeNull();
  });

  it('formata, troca e divide tesouro', () => {
    expect(formatMoney(1234)).toBe('12 po 3 pp 4 pc');
    expect(formatCoins(noCoins())).toBe('0 po');
    expect(makeChange(1550)).toEqual({ pl: 1, po: 5, pe: 0, pp: 5, pc: 0 });
    const s = splitLoot(1000, 3);
    expect(s.eachCp).toBe(333);
    expect(s.leftoverCp).toBe(1);
    expect(s.each).toEqual({ ...noCoins(), po: 3, pp: 3, pc: 3 });
  });

  it('só grava as moedas que mudaram ou passaram a existir', () => {
    const p = readPurse(parseProps('---\npo: 5\n---\n'));
    expect(purseProps(p, { ...noCoins(), po: 4, pp: 8 })).toEqual({ po: '4', pp: '8' });
    expect(purseProps(p, { ...noCoins(), po: 5 })).toEqual({});
  });
});

const SHEET = `---
for: 14
---
# Kael

## Inventário
| Item | Qtd | Peso | Notas |
| --- | --- | --- | --- |
| [[Espada Longa\\|minha espada]] | 1 | 1,5 | equipada |
| Ração | 5 | 0,5 | |
| Corda | 1 | | 15 m |
`;

describe('inventário', () => {
  it('lê a tabela, links e pesos com vírgula', () => {
    const inv = readInventory(SHEET);
    expect(inv.map((x) => x.qty)).toEqual([1, 5, 1]);
    expect(inv[0]!.link).toBe('Espada Longa');
    expect(itemLabel(inv[0]!.name)).toBe('minha espada');
    expect(inv[2]!.weight).toBeNull();
    expect(inventoryWeight(inv)).toBe(4);
    expect(carryCapacity(14).max).toBe(105);
  });

  it('soma itens iguais, muda quantidade e grava sem perder notas', () => {
    let inv = readInventory(SHEET);
    inv = addItem(inv, { name: 'ração', link: null, qty: 2, weight: 0.5, notes: '' });
    expect(inv[1]!.qty).toBe(7);
    inv = addItem(inv, { name: '[[Poção de Cura]]', link: 'Poção de Cura', qty: 2, weight: 0.25, notes: '' });
    inv = changeQty(inv, 2, -1);
    expect(inv.map((x) => itemLabel(x.name))).toEqual(['minha espada', 'Ração', 'Poção de Cura']);
    const out = writeInventory(SHEET, inv);
    expect(out).toContain('# Kael');
    const again = readInventory(out);
    expect(again.map((x) => [x.qty, x.weight])).toEqual([[1, 1.5], [7, 0.5], [2, 0.25]]);
    expect(again[0]!.notes).toBe('equipada');
  });
});

describe('cartas de item', () => {
  it('lê raridade, valor, imagem e descrição', () => {
    const c = readItemCard('Lâmina Solar', `---
tipo: item
raridade: Very Rare
categoria: arma
dano: 1d8+2 radiante
valor: 1.200 po
peso: 1,5
sintonização: sim
propriedades: [acuidade, versátil]
imagem: "[[lamina.png]]"
---
# Lâmina Solar

## Descrição
Um cabo sem lâmina que acende ao toque de quem é **digno**.

Outro parágrafo.
`);
    expect(c.rarity).toBe('muito raro');
    expect(c.value).toBe(120000);
    expect(c.weight).toBe(1.5);
    expect(c.attunement).toBe(true);
    expect(c.properties).toEqual(['acuidade', 'versátil']);
    expect(c.image).toBe('lamina.png');
    expect(c.description).toBe('Um cabo sem lâmina que acende ao toque de quem é digno.');
  });

  it('raridades e imagens em vários formatos', () => {
    expect(rarityOf('Lendario')).toBe('lendário');
    expect(rarityOf('uncommon')).toBe('incomum');
    expect(rarityOf('')).toBe('comum');
    expect(imageOf(parseProps('---\nretrato: "![[kael.jpg]]"\n---\n'))).toBe('kael.jpg');
    expect(imageOf(parseProps('---\nimage: https://x.com/a.png\n---\n'))).toBe('https://x.com/a.png');
    expect(imageOf(parseProps('---\nnome: x\n---\n'))).toBeNull();
  });
});

describe('dificuldade de encontro (5e)', () => {
  it('XP por ND', () => {
    expect(crXp('1/4')).toBe(50);
    expect(crXp('0,5')).toBe(100);
    expect(crXp('ND 5')).toBe(1800);
    expect(crXp('31')).toBeNull();
  });

  it('multiplicador ajusta pelo tamanho do grupo', () => {
    expect(encounterMultiplier(1, 4)).toBe(1);
    expect(encounterMultiplier(4, 4)).toBe(2);
    expect(encounterMultiplier(4, 2)).toBe(2.5);
    expect(encounterMultiplier(1, 6)).toBe(0.5);
    expect(encounterMultiplier(20, 4)).toBe(4);
  });

  it('avalia o encontro do grupo', () => {
    // 4 personagens nível 3: fácil 300, médio 600, difícil 900, mortal 1600
    const r = rateEncounter([3, 3, 3, 3], ['1/4', '1/4', '1/4', '1/4', '1']);
    expect(r.xp).toBe(400);
    expect(r.multiplier).toBe(2);
    expect(r.adjusted).toBe(800);
    expect(r.difficulty).toBe('médio');
    expect(r.xpEach).toBe(100);
    expect(rateEncounter([3, 3, 3, 3], ['5']).difficulty).toBe('mortal');
    expect(rateEncounter([3, 3, 3, 3], ['1/8']).difficulty).toBe('trivial');
    expect(rateEncounter([1], [null, '1/4']).unknown).toBe(1);
  });
});

describe('campanha', () => {
  it('itens com CA não viram fichas da campanha', () => {
    const c = campaignIndex([
      { path: 'Campanhas/X/X.md', text: '---\ntipo: campanha\n---\n' },
      { path: 'Campanhas/X/Escudo.md', text: '---\ntipo: item\nca: 2\n---\n' },
      { path: 'Campanhas/X/Kael.md', text: '---\ntipo: personagem\nca: 17\npv: 20\n---\n' },
    ]);
    expect(c[0]!.sheets.map((s) => s.name)).toEqual(['Kael']);
  });
});

describe('mundos', () => {
  it('a imagem não vira ligação nem ficha que falta', () => {
    const [w] = worldIndex([
      { path: 'Mundos/A/A.md', text: '---\ntipo: mundo\n---\n' },
      { path: 'Mundos/A/Kael.md', text: '---\ntipo: personagem\nimagem: "[[kael.png]]"\nafiliação: "[[Ordem]]"\n---\n' },
    ]);
    expect(w!.relations.map((r) => r.target)).toEqual(['Ordem']);
  });
});

describe('item especial', () => {
  it('cria a nota e lê de volta como carta', async () => {
    const { itemNote, readItemCard } = await import('../src/index');
    const t = itemNote({ name: 'Cajado do Inverno', rarity: 'raro', category: 'Cajado', value: '5000 po', weight: '2', damage: '1d6 concussão',
      ac: '', attunement: true, properties: 'Versátil, Arcano', charges: '7/10', image: 'Anexos/cajado.png', description: 'Frio que não derrete.' });
    const c = readItemCard('Cajado do Inverno', t);
    expect(c).toMatchObject({ rarity: 'raro', category: 'Cajado', weight: 2, attunement: true, properties: ['Versátil', 'Arcano'],
      charges: { left: 7, max: 10 }, image: 'Anexos/cajado.png', description: 'Frio que não derrete.', value: 500000 });
  });
});
