import { describe, expect, it } from 'vitest';
import {
  applyClassDefaults, casterLevel, computeAc, deathSave, levelForXp, levelUp, longRest, pactSlots, parseClasses, parseProps,
  readCharacter, readSheet, readSpells, shortRest, slotFor, speciesOf, spellSlots, spendHitDie, useSlot, writeSpells,
} from '../src/index';

const note = (props: string, body = '') => `---\n${props.trim()}\n---\n${body}`;

const WIZ = note(`
classe: Mago
nível: 5
xp: 6600
espécie: Elfo da Floresta
for: 8
des: 14
con: 14
int: 18
sab: 12
car: 10
`);

describe('regras 5e (2024)', () => {
  it('nível por XP', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(299)).toBe(1);
    expect(levelForXp(300)).toBe(2);
    expect(levelForXp(6500)).toBe(5);
    expect(levelForXp(400000)).toBe(20);
  });

  it('lê classes com e sem níveis', () => {
    expect(parseClasses('Mago', 5).map((c) => [c.info?.key, c.level])).toEqual([['mago', 5]]);
    expect(parseClasses('Guerreiro 3 / Mago 2', null).map((c) => [c.info?.key, c.level])).toEqual([['guerreiro', 3], ['mago', 2]]);
    expect(parseClasses('Ladino 3 (Trapaceiro Arcano)', null)[0]!.caster).toBe('terço');
    expect(parseClasses('Guerreiro', 7, 'Cavaleiro Arcano')[0]!.ability).toBe('int');
  });

  it('espaços de magia de conjurador completo, meio, terço e multiclasse', () => {
    expect(spellSlots(parseClasses('Mago 5', null))).toEqual([4, 3, 2]);
    expect(spellSlots(parseClasses('Paladino 1', null))).toEqual([2]);
    expect(spellSlots(parseClasses('Paladino 5', null))).toEqual([4, 2]);
    expect(spellSlots(parseClasses('Guerreiro 2', null, 'Cavaleiro Arcano'))).toEqual([]);
    expect(spellSlots(parseClasses('Guerreiro 3', null, 'Cavaleiro Arcano'))).toEqual([2]);
    // multiclasse: Paladino 3 (2) + Feiticeiro 3 (3) = nível de conjurador 5
    expect(casterLevel(parseClasses('Paladino 3 / Feiticeiro 3', null))).toBe(5);
    expect(spellSlots(parseClasses('Mago 20', null))).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('magia de pacto', () => {
    expect(pactSlots(parseClasses('Bruxo 1', null))).toEqual({ total: 1, level: 1 });
    expect(pactSlots(parseClasses('Bruxo 5', null))).toEqual({ total: 2, level: 3 });
    expect(pactSlots(parseClasses('Bruxo 17', null))).toEqual({ total: 4, level: 5 });
    expect(pactSlots(parseClasses('Mago 5', null))).toBeNull();
  });

  it('espécie pelo começo do nome', () => {
    expect(speciesOf('Elfo da Floresta')?.speed).toBe(10.5);
    expect(speciesOf('Anã')?.name).toBe('Anão');
    expect(speciesOf('Halfling Pés-Leves')?.size).toBe('Pequeno');
    expect(speciesOf('Coisa estranha')).toBeNull();
  });

  it('CA por armadura, escudo e defesa sem armadura', () => {
    const cls = (s: string) => parseClasses(s, 1);
    expect(computeAc({ mods: { des: 3 }, armor: 'Couro batido', shield: false, classes: [] })).toBe(15);
    expect(computeAc({ mods: { des: 3 }, armor: 'Meia-armadura', shield: true, classes: [] })).toBe(19);
    expect(computeAc({ mods: { des: 3 }, armor: 'Placas +1', shield: false, classes: [] })).toBe(19);
    expect(computeAc({ mods: { des: 2, con: 3 }, armor: '', shield: true, classes: cls('Bárbaro') })).toBe(17);
    expect(computeAc({ mods: { des: 3, sab: 2 }, armor: '', shield: false, classes: cls('Monge') })).toBe(15);
  });
});

describe('ficha completa', () => {
  it('faz as contas: proficiência, conjuração, espaços, PV, deslocamento, passivas', () => {
    const c = readCharacter(WIZ);
    expect(c.level).toBe(5);
    expect(c.sheet.prof).toBe(3);
    expect(c.casting).toMatchObject({ ability: 'int', mod: 4, dc: 15, attack: 7 });
    expect(c.slots.map((s) => s.total)).toEqual([4, 3, 2]);
    // 6+2 no 1º, depois (4+2) × 4
    expect(c.hpMaxAuto).toBe(32);
    expect(c.speed).toBe('10,5 m');
    expect(c.speedAuto).toBe(true);
    expect(c.size).toBe('Médio');
    expect(c.hitDice).toEqual([{ die: 6, total: 5, spent: 0 }]);
    expect(c.passive.perception).toBe(11);
    expect(c.canLevelUp).toBe(false);
    expect(c.xpNext).toBe(14000);
  });

  it('CA automática quando a nota não tem ca', () => {
    const t = note('classe: Guerreiro\nnível: 1\nfor: 16\ndes: 12\ncon: 14\narmadura vestida: Cota de malha\nescudo: sim');
    const s = readSheet(t);
    expect(s.ac).toBe(18);
    expect(s.acAuto).toBe(true);
    expect(readSheet(note('ca: 13\ndes: 18\nfor: 10\ncon: 10')).ac).toBe(13);
  });

  it('avisa quando o XP já dá para subir e sobe somando PV', () => {
    const t = note('classe: Guerreiro\nnível: 1\nxp: 350\npv: 12\npv máx: 12\nfor: 16\ndes: 12\ncon: 14');
    const c = readCharacter(t);
    expect(c.canLevelUp).toBe(true);
    const up = levelUp(t);
    expect(up.level).toBe(2);
    expect(up.gain).toBe(8); // 6 (média do d10) + 2
    const p = parseProps(up.text);
    expect(p['nível']).toBe('2');
    expect(p['classe']).toBe('Guerreiro');
    expect(p['pv máx']).toBe('20');
    expect(p['pv']).toBe('20');
  });

  it('multiclasse: entra numa classe nova', () => {
    const t = note('classe: Guerreiro 3\nnível: 3\npv máx: 28\npv: 28\ncon: 14\ndes: 10\nfor: 16');
    const up = levelUp(t, { klass: 'Mago' });
    const p = parseProps(up.text);
    expect(p['classe']).toBe('Guerreiro 3 / Mago 1');
    expect(p['nível']).toBe('4');
    expect(up.gain).toBe(6);
    const c = readCharacter(up.text);
    expect(c.hitDice).toEqual([{ die: 10, total: 3, spent: 0 }, { die: 6, total: 1, spent: 0 }]);
  });

  it('gasta espaços e devolve no descanso longo', () => {
    let t = WIZ;
    const c = readCharacter(t);
    expect(slotFor(c, 2)).toEqual({ kind: 'slot', level: 2 });
    t = useSlot(t, { kind: 'slot', level: 2 });
    t = useSlot(t, { kind: 'slot', level: 2 });
    t = useSlot(t, { kind: 'slot', level: 2 });
    t = useSlot(t, { kind: 'slot', level: 2 });
    let c2 = readCharacter(t);
    expect(c2.slots[1]).toEqual({ level: 2, total: 3, spent: 3 });
    // sem espaço de 2º: sobe para o 3º
    expect(slotFor(c2, 2)).toEqual({ kind: 'slot', level: 3 });
    t = spendHitDie(t, 6);
    c2 = readCharacter(t);
    expect(c2.hitDice[0]!.spent).toBe(1);
    t = longRest(t);
    c2 = readCharacter(t);
    expect(c2.slots.every((s) => s.spent === 0)).toBe(true);
    expect(c2.hitDice[0]!.spent).toBe(0);
  });

  it('bruxo recupera o pacto no descanso curto', () => {
    let t = note('classe: Bruxo\nnível: 5\ncar: 16');
    t = useSlot(t, { kind: 'pact', level: 3 });
    expect(readCharacter(t).pact).toEqual({ level: 3, total: 2, spent: 1 });
    expect(readCharacter(shortRest(t)).pact!.spent).toBe(0);
  });

  it('descanso longo cura, tira exaustão e não cria propriedades à toa', () => {
    const t = note('pv: 3\npv máx: 20\nexaustão: 2\ncon: 10\ndes: 10\nfor: 10');
    const out = longRest(t);
    const p = parseProps(out);
    expect(p['pv']).toBe('20');
    expect(p['exaustão']).toBe('1');
    expect('espaços gastos' in p).toBe(false);
  });

  it('testes contra a morte', () => {
    expect(deathSave({ success: 0, fail: 0 }, 12)).toMatchObject({ success: 1, fail: 0 });
    expect(deathSave({ success: 0, fail: 1 }, 1)).toMatchObject({ fail: 3, dead: true });
    expect(deathSave({ success: 2, fail: 0 }, 15)).toMatchObject({ stable: true });
    expect(deathSave({ success: 1, fail: 2 }, 20)).toMatchObject({ revived: true, success: 0, fail: 0 });
  });

  it('preenche salvaguardas e treinos da classe sem apagar nada', () => {
    const t = applyClassDefaults(note('classe: Paladino\nnível: 1'));
    const p = parseProps(t);
    expect(p['salvaguardas']).toEqual(['sab', 'car']);
    expect(p['treino em armaduras']).toEqual(['leve', 'média', 'pesada', 'escudos']);
    expect(p['treino em armas']).toEqual(['simples', 'marciais']);
    const kept = applyClassDefaults(note('classe: Paladino\nsalvaguardas: [for]'));
    expect(parseProps(kept)['salvaguardas']).toEqual(['for']);
  });

  it('magias numa tabela que o Obsidian lê', () => {
    let t = WIZ;
    t = writeSpells(t, [
      { level: 3, name: 'Bola de Fogo', time: '1 ação', range: '45 m', concentration: false, ritual: false, material: true, prepared: true, notes: '8d6 fogo' },
      { level: 0, name: 'Raio de Fogo', time: '1 ação', range: '36 m', concentration: false, ritual: false, material: false, prepared: true, notes: '' },
    ]);
    expect(t).toContain('## Magias');
    const s = readSpells(t);
    expect(s.map((x) => x.name)).toEqual(['Raio de Fogo', 'Bola de Fogo']);
    expect(s[1]).toMatchObject({ level: 3, material: true, concentration: false, prepared: true });
  });
});

describe('ataques da ficha', () => {
  it('soma bônus com @ e grava a tabela', async () => {
    const { readAttackRows, resolveBonus, sheetVars, writeAttackRows } = await import('../src/index');
    const s = readSheet(note('nível: 5\nfor: 16\ndes: 10\ncon: 10'));
    const v = sheetVars(s);
    expect(resolveBonus('@for+@prof', v)).toBe('+6');
    expect(resolveBonus('+2', v)).toBe('+2');
    expect(resolveBonus('1d4+@for', v)).toBe('1d4+@for');
    const t = writeAttackRows(note('for: 10'), [{ name: 'Espada longa', hit: '@for+@prof', damage: '1d8+@for cortante', notes: 'Versátil' }]);
    expect(readAttackRows(t)).toMatchObject([{ name: 'Espada longa', hit: '@for+@prof', damage: '1d8+@for cortante', notes: 'Versátil' }]);
  });
});
