import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Compendium, abilityOptions, addSheet, applyCreation, applyLevelUp, applyOption, casterLevel, classLevelInfo, entriesToHtml, entriesToMarkdown,
  equipmentGroups, evalPrepared, expandPacks, parseClasses, pointsSpent, readAbilities, readAttackRows, readCharacter, readInventory, readSpells,
  renderInline, skillPick, spellRange, spellTime, stripTags, subclassLevel, type CompendiumData,
} from '../src/index';

describe('texto do 5etools', () => {
  it('tira as tags e mostra o texto certo', () => {
    expect(stripTags('Take {@damage 2d6} {@variantrule Sphere [Area of Effect]|XPHB} {@spell Fire Bolt|XPHB|fire bolts}')).toBe('Take 2d6 Sphere fire bolts');
    expect(stripTags('{@dc 15} {@hit 5} {@recharge 5} {@chance 25}')).toBe('DC 15 +5 (Recharge 5–6) 25%');
    expect(stripTags('{@b {@spell Shield}}')).toBe('Shield');
  });

  it('HTML escapa o texto e vira link nas coisas consultáveis', () => {
    const h = renderInline('<x> {@condition Prone|XPHB}', 'html');
    expect(h).toContain('&lt;x&gt;');
    expect(h).toContain('<a class="cref" href="#" data-ref="condition|Prone|XPHB">Prone</a>');
  });

  it('blocos viram markdown e HTML', () => {
    const e = [{ type: 'entries', name: 'Rage', entries: ['You {@b rage}.', { type: 'list', items: ['a', { type: 'item', name: 'B', entry: 'b' }] }] },
      { type: 'table', colLabels: ['Lv', 'X'], rows: [['1', { type: 'cell', roll: { min: 1, max: 3 } }]] }];
    const md = entriesToMarkdown(e);
    expect(md).toContain('***Rage.*** You **rage**.');
    expect(md).toContain('- **B.** b');
    expect(md).toContain('| 1 | 1–3 |');
    expect(entriesToHtml(e)).toContain('<b class="ename">Rage.</b>');
  });
});

describe('regras', () => {
  it('meio conjurador de 2014 só conjura do 2º nível', () => {
    expect(casterLevel(parseClasses('Paladino 1', 1), '2014')).toBe(0);
    expect(casterLevel(parseClasses('Paladino 1', 1), '2024')).toBe(1);
    expect(casterLevel(parseClasses('Paladino 3', 3), '2014')).toBe(2);
    expect(casterLevel(parseClasses('Artífice 1', 1), '2014')).toBe(1);
  });

  it('fórmula de magias preparadas de 2014', () => {
    expect(evalPrepared('<$level$> + <$int_mod$>', 3, { int: 3 })).toBe(6);
    expect(evalPrepared('<$level$> / 2 + <$cha_mod$>', 5, { cha: 2 })).toBe(4);
    expect(evalPrepared('<$level$> / 2 + <$cha_mod$>', 1, { cha: -1 })).toBe(1);
  });

  it('compra de pontos', () => {
    expect(pointsSpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 })).toBe(27);
  });

  it('bônus do antecedente de 2024', () => {
    const opts = abilityOptions('2024', null, { name: 'Sage', source: 'XPHB', ed: '2024', entries: [],
      ability: [{ choose: { weighted: { from: ['con', 'int', 'wis'], weights: [2, 1] } } }, { choose: { weighted: { from: ['con', 'int', 'wis'], weights: [1, 1, 1] } } }] });
    expect(opts).toHaveLength(2);
    expect(applyOption(opts[0]!, [['int'], ['con']])).toEqual({ int: 2, con: 1 });
    expect(applyOption(opts[1]!, [['con', 'int', 'wis']])).toEqual({ con: 1, int: 1, wis: 1 });
  });

  it('perícias da classe', () => {
    expect(skillPick([{ choose: { from: ['athletics', 'perception'], count: 2 } }])).toEqual({ fixed: [], choose: [{ count: 2, from: ['athletics', 'perception'] }] });
    expect(skillPick([{ arcana: true, history: true }]).fixed).toEqual(['arcana', 'history']);
  });
});

// ---------------------------------------------------------------- com o compêndio de verdade (só na máquina que tem o 5etools)

const FILE = resolve(__dirname, '../../../apps/tanden/public/compendio/5e.json');
const has = existsSync(FILE);

describe.skipIf(!has)('compêndio gerado do 5etools', () => {
  const comp = has ? new Compendium(JSON.parse(readFileSync(FILE, 'utf8')) as CompendiumData) : (null as unknown as Compendium);

  it('acha classes pelo nome em português e separa as edições', () => {
    expect(comp.classFor('Guerreiro', '2024')?.source).toBe('XPHB');
    expect(comp.classFor('Mago', '2014')?.source).toBe('PHB');
    expect(comp.classes('2024').length).toBeGreaterThanOrEqual(12);
    const fireball = comp.spellFor('Fireball', '2024')!;
    expect(fireball.source).toBe('XPHB');
    expect(spellTime(fireball)).toBe('1 ação');
    expect(spellRange(fireball)).toBe('45 m');
  });

  it('nível de classe: subclasse, melhoria, magias', () => {
    const wiz = comp.classFor('Wizard', '2024')!;
    expect(subclassLevel(wiz)).toBe(3);
    const l1 = classLevelInfo(wiz, null, 1);
    expect(l1.cantrips).toBe(3);
    expect(l1.spells).toBe(4);
    expect(l1.maxSpellLevel).toBe(1);
    expect(classLevelInfo(wiz, null, 3).chooseSubclass).toBe(true);
    expect(classLevelInfo(wiz, null, 4).asi).toBe(true);
    const war = comp.classFor('Warlock', '2024')!;
    expect(classLevelInfo(war, null, 2).options[0]).toMatchObject({ total: 3, gained: 2 });
    const barb = comp.classFor('Barbarian', '2024')!;
    expect(classLevelInfo(barb, null, 3).columns.find((c) => c.label === 'Rages')).toMatchObject({ value: '3', prev: '2' });
  });

  it('cria um Guerreiro de 1º nível pronto para jogar e sobe para o 4º', () => {
    const ed = '2024';
    const cls = comp.classFor('Fighter', ed)!;
    const species = comp.speciesFor('Dwarf', ed)!;
    const bg = comp.backgroundFor('Soldier', ed)!;
    const groups = equipmentGroups(comp, cls.equipment?.defaultData, ed);
    const optA = groups[0]!.find((o) => o.key === 'A')!;
    const bgA = equipmentGroups(comp, bg.startingEquipment, ed)[0]!.find((o) => o.key === 'A')!;
    const items = expandPacks(comp, [...optA.lines, ...bgA.lines], ed);
    let text = addSheet('---\ntipo: personagem\n---\n# Thorin\n');
    text = applyCreation(text, comp, {
      ed, cls, sub: null, species, background: bg,
      scores: { str: 17, dex: 12, con: 16, int: 8, wis: 13, cha: 10 },
      skills: ['athletics', 'intimidation', 'perception', 'survival'],
      languages: ['Common', 'Dwarvish'], tools: [], feats: ['Savage Attacker'],
      spells: [], items, cp: optA.cp + bgA.cp,
    });
    const c = readCharacter(text);
    expect(c.edition).toBe('2024');
    expect(c.classes[0]?.info?.name).toBe('Guerreiro');
    expect(c.sheet.hpMax).toBe(10 + 3 + 1); // d10 + Con + Robustez Anã
    expect(c.armor).toMatch(/cota de malha|chain mail/i);
    expect(c.sheet.ac).toBe(16);
    expect(c.sheet.skills).toContain('Atletismo');
    expect(c.speed).toBe('9 m');
    expect(readAttackRows(text).some((r) => /espada grande|greatsword/i.test(r.name))).toBe(true);
    expect(readAbilities(text).map((a) => a.name)).toContain('Retomar o Fôlego');
    expect(readInventory(text).length).toBeGreaterThan(5);

    text = applyLevelUp(text, comp, {}).text;
    expect(readAbilities(text).map((a) => a.name)).toContain('Surto de Ação');
    text = applyLevelUp(text, comp, { subclass: 'Champion' }).text;
    expect(readCharacter(text).subclass).toBe('Champion');
    const r = applyLevelUp(text, comp, { feat: 'Ability Score Improvement', asi: { con: 2 } });
    const c4 = readCharacter(r.text);
    expect(c4.level).toBe(4);
    expect(c4.sheet.attrs.find((a) => a.key === 'con')?.score).toBe(18);
    // PV: 14 + 3×(6+3+1) + 4 (Con +1 retroativo)
    expect(c4.sheet.hpMax).toBe(14 + 30 + 4);
  });

  it('cria um Mago com magias e espaços', () => {
    const ed = '2024';
    const cls = comp.classFor('Wizard', ed)!;
    let text = addSheet('# Elara\n');
    const spells = ['Fire Bolt', 'Mage Hand', 'Light', 'Magic Missile', 'Shield', 'Sleep', 'Detect Magic'].map((n) => comp.spellFor(n, ed)!);
    text = applyCreation(text, comp, {
      ed, cls, sub: null, species: comp.speciesFor('Elf', ed), background: comp.backgroundFor('Sage', ed),
      scores: { str: 8, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history', 'investigation', 'insight'],
      languages: ['Common', 'Elvish'], tools: [], feats: ['Magic Initiate (Wizard)'], spells, items: [], cp: 0,
    });
    const c = readCharacter(text);
    expect(c.casting?.dc).toBe(13);
    expect(c.slots[0]).toMatchObject({ level: 1, total: 2 });
    const sp = readSpells(text);
    expect(sp.find((s) => s.name === 'Fire Bolt')).toMatchObject({ level: 0, range: '36 m' });
    expect(sp.find((s) => s.name === 'Shield')?.time).toBe('1 reação');
    expect(readAbilities(text).map((a) => a.name)).toContain('Recuperação Arcana');
    expect(c.sheet.ac).toBe(12);
  });

  it('lutador desarmado: Tavern Brawler, Unarmed Fighting e Tough', () => {
    const ed = '2024';
    const cls = comp.classFor('Fighter', ed)!;
    const bg = comp.backgroundFor('Sailor', ed)!;
    const optA = equipmentGroups(comp, cls.equipment?.defaultData, ed)[0]!.find((o) => o.key === 'A')!;
    const bgA = equipmentGroups(comp, bg.startingEquipment, ed)[0]!.find((o) => o.key === 'A')!;
    let text = applyCreation(addSheet('# Thok\n'), comp, {
      ed, cls, sub: null, species: comp.speciesFor('Human', ed), background: bg,
      scores: { str: 17, dex: 14, con: 15, int: 8, wis: 12, cha: 8 },
      skills: ['acrobatics', 'perception', 'athletics', 'intimidation', 'insight'],
      languages: ['Common', 'Orc', 'Giant'], tools: ["Navigator's Tools"], feats: ['Tavern Brawler', 'Tough', 'Unarmed Fighting'],
      spells: [], items: expandPacks(comp, [...optA.lines, ...bgA.lines], ed), cp: optA.cp + bgA.cp,
    });
    const soco = readAttackRows(text).find((r) => r.name === 'Desarmado')!;
    expect(soco.damage).toBe('1d8+@for concussão');
    expect(soco.notes).toMatch(/rerrola/);
    expect(readCharacter(text).sheet.hpMax).toBe(10 + 2 + 2);
    text = applyLevelUp(text, comp, {}).text;
    const c = readCharacter(text);
    expect(c.sheet.hpMax).toBe(14 + 6 + 2 + 2);
    expect(c.sheet.ac).toBe(16);
    if (process.env.FICHA_OUT) writeFileSync(process.env.FICHA_OUT, text);
  });

  it('talento de soco no nível refaz o ataque desarmado', () => {
    let text = applyCreation(addSheet('# X\n'), comp, {
      ed: '2024', cls: comp.classFor('Fighter', '2024')!, sub: null, species: null, background: null,
      scores: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 10 }, skills: [], languages: [], tools: [], feats: [], spells: [], items: [], cp: 0,
    });
    expect(readAttackRows(text).find((r) => r.name === 'Desarmado')?.damage).toBe('1+@for concussão');
    for (let i = 0; i < 3; i++) text = applyLevelUp(text, comp, i === 1 ? { subclass: 'Champion' } : {}).text;
    text = applyLevelUp(text, comp, { feat: 'Grappler', featAsi: { str: 1 } }).text;
    expect(readAttackRows(text).find((r) => r.name === 'Desarmado')?.notes).toMatch(/agarrar no mesmo golpe/);
  });

  it('2014: bônus de atributo vêm da espécie', () => {
    const elf = comp.speciesFor('Elf (High)', '2014')!;
    const opts = abilityOptions('2014', elf, null);
    expect(applyOption(opts[0]!, [])).toEqual({ dex: 2, int: 1 });
  });
});
