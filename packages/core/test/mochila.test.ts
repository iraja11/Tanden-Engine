import { describe, expect, it } from 'vitest';
import {
  CATALOG, attuneItem, catalogEntry, consumeItem, equipItem, forgeFromNote, isAttuned, itemInfo, itemNote, parseProps, readAttackRows,
  readCharacter, readInventory, readItemCard, readSheet, setCharges, transferItem, updateItemNote, weaponAttack, writeInventory,
} from '../src/index';

const note = (props: string, body = '') => `---\n${props.trim()}\n---\n${body}`;
const HERO = note(`
classe: Guerreiro
nível: 3
pv: 10
pv máx: 28
for: 16
des: 14
con: 14
int: 10
sab: 10
car: 10
`);

const withItems = (names: string[]) =>
  writeInventory(HERO, names.map((n) => ({ name: n, link: /^\[\[/.test(n) ? n.slice(2, -2) : null, qty: 1, weight: null, notes: '', equipped: false })));

describe('catálogo SRD', () => {
  it('acha pelo nome, apelido e com bônus mágico', () => {
    expect(catalogEntry('Espada Longa')?.damage).toBe('1d8 cortante');
    expect(catalogEntry('longsword')?.name).toBe('Espada Longa');
    expect(catalogEntry('[[Espada Longa +1]]')?.mastery).toBe('Enfraquecer');
    expect(catalogEntry('Placas')?.kind).toBe('armadura');
    expect(catalogEntry('Poção de Cura')?.heal).toBe('2d4+2');
    expect(catalogEntry('Coisa inventada')).toBeNull();
    // nomes únicos
    const names = CATALOG.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('item comum ganha carta sem precisar de nota', () => {
    const i = itemInfo({ name: 'Rapieira +1', link: null }, null);
    expect(i.kind).toBe('arma');
    expect(i.card).toMatchObject({ rarity: 'incomum', damage: '1d8 perfurante', value: 2500, weight: 1 });
    expect(i.card.properties).toContain('Maestria: Atormentar');
  });
});

describe('equipar', () => {
  it('arma vira ataque com o atributo certo, e sai ao guardar', () => {
    expect(weaponAttack(itemInfo({ name: 'Rapieira', link: null }, null), { for: 3, des: 2 }).hit).toBe('@for+@prof');
    expect(weaponAttack(itemInfo({ name: 'Rapieira', link: null }, null), { for: 1, des: 4 }).hit).toBe('@des+@prof');
    expect(weaponAttack(itemInfo({ name: 'Arco Longo', link: null }, null), { for: 5, des: 1 }).hit).toBe('@des+@prof');
    const a = weaponAttack(itemInfo({ name: 'Espada Longa +1', link: null }, null), { for: 3, des: 2 });
    expect(a).toMatchObject({ hit: '@for+@prof+1', damage: '1d8+@for+1 cortante' });
    expect(a.notes).toContain('Maestria: Enfraquecer');

    let t = withItems(['Espada Longa', 'Corda de Cânhamo (15 m)']);
    t = equipItem(t, 0, itemInfo(readInventory(t)[0]!, null), true);
    expect(readInventory(t)[0]!.equipped).toBe(true);
    expect(t).toContain('| Estado');
    expect(readAttackRows(t).map((r) => r.name)).toEqual(['Espada Longa']);
    t = equipItem(t, 0, itemInfo(readInventory(t)[0]!, null), false);
    expect(readAttackRows(t)).toEqual([]);
    expect(readInventory(t)[0]!.equipped).toBe(false);
  });

  it('armadura e escudo mudam a CA; só uma armadura por vez', () => {
    let t = withItems(['Cota de malha', 'Escudo', 'Couro']);
    const info = (i: number) => itemInfo(readInventory(t)[i]!, null);
    t = equipItem(t, 0, info(0), true);
    t = equipItem(t, 1, info(1), true);
    expect(readSheet(t).ac).toBe(18);
    t = equipItem(t, 2, info(2), true);
    expect(readInventory(t).map((x) => x.equipped)).toEqual([false, true, true]);
    expect(readCharacter(t).armor).toBe('Couro');
    expect(readSheet(t).ac).toBe(11 + 2 + 2);
  });

  it('sem nada equipado a tabela não ganha coluna nova', () => {
    expect(withItems(['Tocha'])).not.toContain('Estado');
  });
});

describe('usar, sintonizar, cargas, passar adiante', () => {
  it('poção cura e some da mochila', () => {
    let t = writeInventory(HERO, [{ name: 'Poção de Cura', link: null, qty: 2, weight: 0.25, notes: '', equipped: false }]);
    t = consumeItem(t, 0, 7);
    expect(parseProps(t)['pv']).toBe('17');
    expect(readInventory(t)[0]!.qty).toBe(1);
    t = consumeItem(t, 0, 50);
    expect(parseProps(t)['pv']).toBe('28');
    expect(readInventory(t)).toEqual([]);
  });

  it('sintonização tem limite de 3', () => {
    let t = HERO;
    for (const n of ['Anel', 'Capa', 'Botas']) t = attuneItem(t, n, true).text;
    const r = attuneItem(t, 'Elmo', true);
    expect(r.full).toBe(true);
    expect(isAttuned(t, 'Capa')).toBe(true);
    t = attuneItem(t, 'Capa', false).text;
    expect(readCharacter(t).attunement).toEqual(['Anel', 'Botas']);
  });

  it('cargas ficam entre 0 e o máximo', () => {
    const item = itemNote({ name: 'Varinha', rarity: 'raro', category: 'Varinha', value: '', weight: '', damage: '', ac: '', attunement: false, properties: '', charges: '7/7', image: '', description: '' });
    expect(readItemCard('Varinha', setCharges(item, 5)).charges).toEqual({ left: 5, max: 7 });
    expect(readItemCard('Varinha', setCharges(item, 99)).charges).toEqual({ left: 7, max: 7 });
    expect(readItemCard('Varinha', setCharges(item, -2)).charges).toEqual({ left: 0, max: 7 });
  });

  it('passa item para outra ficha e guarda o que estava equipado', () => {
    let a = withItems(['Espada Longa']);
    a = equipItem(a, 0, itemInfo(readInventory(a)[0]!, null), true);
    const r = transferItem(a, HERO, 0, 1, itemInfo(readInventory(a)[0]!, null));
    expect(readInventory(r.from)).toEqual([]);
    expect(readAttackRows(r.from)).toEqual([]);
    expect(readInventory(r.to).map((x) => x.name)).toEqual(['Espada Longa']);
  });

  it('edita a nota do item sem perder o resto', () => {
    const base = itemNote({ name: 'Anel', rarity: 'incomum', category: 'Anel', value: '', weight: '', damage: '', ac: '', attunement: true, properties: '', charges: '', image: '', description: 'Brilha.' }) + '\n## História\n\nForjado em Aerth.\n';
    const f = forgeFromNote('Anel', base);
    expect(f).toMatchObject({ rarity: 'incomum', attunement: true, description: 'Brilha.' });
    const out = updateItemNote(base, { ...f, rarity: 'raro', ac: '+1', attunement: false, description: 'Brilha mais.' });
    const c = readItemCard('Anel', out);
    expect(c).toMatchObject({ rarity: 'raro', ac: '+1', attunement: false, description: 'Brilha mais.' });
    expect(out).toContain('Forjado em Aerth.');
  });
});
