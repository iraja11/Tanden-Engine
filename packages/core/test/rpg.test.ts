import { describe, expect, it } from 'vitest';
import {
  addCombatants, addSheet, appendLog, applyHp, attackFormula, campaignIndex, chanceAtLeast, changeHp, checkRoll, encounterTemplate,
  expandRolls, findTable, findTables, nextTurn, parseRange, parseRoll, prevTurn, readEncounter, readSheet, removeCombatant,
  roll, rollInitiative, rollOnce, rollStats, rollTable, rollText, saveBonus, seededRng, sessionTemplate, sheetVars, skillBonus,
  sortByInit, splitDamage, starterTables, tableIndex, toggleCondition, update, worldIndex, writeEncounter, type Encounter, type Rng,
} from '../src/index';

/** rng que devolve as faces pedidas, em ordem (para um dado de `sides` lados) */
function faces(sides: number, ...vals: number[]): Rng {
  let i = 0;
  return () => {
    const v = vals[i++ % vals.length]!;
    return (v - 1 + 0.5) / sides;
  };
}

describe('dados: notação', () => {
  it('soma, modificador e rótulo', () => {
    const r = rollOnce('1d20+5 # ataque', { rng: faces(20, 17) });
    expect(r.total).toBe(22);
    expect(r.label).toBe('ataque');
    expect(r.detail).toBe('1d20 [17] + 5');
    expect(r.critical).toBeNull();
  });

  it('d20 sem número, d%, dF e espaços', () => {
    expect(rollOnce('d20', { rng: faces(20, 20) }).critical).toBe('max');
    expect(rollOnce('d%', { rng: faces(100, 42) }).total).toBe(42);
    const f = rollOnce('4dF', { rng: faces(3, 1, 2, 3, 3) });
    expect(f.total).toBe(-1 + 0 + 1 + 1);
    // d4 com o mesmo rng: 3/6 do caminho → 2
    expect(rollOnce(' 2d6 + 1d4 - 2 ', { rng: faces(6, 3) }).total).toBe(3 + 3 + 2 - 2);
  });

  it('vantagem e desvantagem', () => {
    const adv = rollOnce('1d20+3 vantagem', { rng: faces(20, 4, 15) });
    expect(adv.formula).toBe('2d20kh1+3');
    expect(adv.total).toBe(18);
    expect(adv.groups[0]!.dice.map((d) => d.kept)).toEqual([false, true]);
    const dis = rollOnce('d20 com desvantagem', { rng: faces(20, 4, 15) });
    expect(dis.formula).toBe('2d20kl1');
    expect(dis.total).toBe(4);
    expect(rollOnce('d20 adv', { rng: faces(20, 1, 20) }).critical).toBe('max');
    expect(rollOnce('d20 dis', { rng: faces(20, 1, 20) }).critical).toBe('min');
    expect(checkRoll('2d6 vantagem')).toMatch(/d20/);
  });

  it('manter e descartar', () => {
    const r = rollOnce('4d6dl1', { rng: faces(6, 3, 1, 6, 4) });
    expect(r.total).toBe(13);
    expect(r.groups[0]!.dice.map((d) => d.kept)).toEqual([true, false, true, true]);
    expect(rollOnce('4d6kh3', { rng: faces(6, 3, 1, 6, 4) }).total).toBe(13);
    expect(rollOnce('3d6dh1', { rng: faces(6, 2, 6, 5) }).total).toBe(7);
    // empates: mantém o que saiu primeiro
    const t = rollOnce('3d6kh1', { rng: faces(6, 5, 5, 2) });
    expect(t.groups[0]!.dice.map((d) => d.kept)).toEqual([true, false, false]);
    expect(checkRoll('2d6kh3')).toMatch(/manter ou descartar/);
    expect(checkRoll('2d6kh1dl1')).toMatch(/não os dois/);
  });

  it('explosão e rerrolagem', () => {
    const e = rollOnce('2d6!', { rng: faces(6, 6, 6, 2, 3) });
    expect(e.total).toBe(6 + 6 + 2 + 3);
    expect(e.groups[0]!.dice.filter((d) => d.exploded)).toHaveLength(2);
    const r = rollOnce('2d6r1', { rng: faces(6, 1, 1, 4, 5) });
    expect(r.total).toBe(9);
    expect(r.groups[0]!.dice[0]!.rerolled).toEqual([1, 1]);
    const once = rollOnce('1d6ro<2', { rng: faces(6, 1, 2) });
    expect(once.total).toBe(2);
    expect(checkRoll('1d6r<7')).toMatch(/todo resultado/);
    expect(checkRoll('1d1!')).toMatch(/explodir/);
    // dado que explode sempre não trava
    expect(rollOnce('1d6!', { rng: () => 0.99 }).total).toBeGreaterThan(100);
  });

  it('sucessos', () => {
    const r = rollOnce('5d10>=7', { rng: faces(10, 7, 3, 10, 6, 9) });
    expect(r.total).toBe(3);
    expect(rollOnce('3d6<3', { rng: faces(6, 1, 2, 3) }).total).toBe(2);
    expect(rollOnce('4d6=6', { rng: faces(6, 6, 6, 1, 6) }).total).toBe(3);
  });

  it('parênteses, multiplicação, divisão e sinais', () => {
    expect(rollOnce('(1d6+2)*2', { rng: faces(6, 4) }).total).toBe(12);
    expect(rollOnce('7/2').total).toBe(3);
    expect(rollOnce('-1d4+10', { rng: faces(4, 3) }).total).toBe(7);
    expect(checkRoll('1/0')).toBeNull();
    expect(() => rollOnce('1/0')).toThrow(/zero/);
    expect(checkRoll('(1d6')).toMatch(/parêntese/);
  });

  it('repetição', () => {
    const rs = roll('6x 4d6dl1', { rng: seededRng(7) });
    expect(rs).toHaveLength(6);
    for (const r of rs) {
      expect(r.total).toBeGreaterThanOrEqual(3);
      expect(r.total).toBeLessThanOrEqual(18);
    }
    expect(roll('1d20 x3', { rng: seededRng(1) })).toHaveLength(3);
    expect(checkRoll('99x 1d6')).toMatch(/repetir/);
  });

  it('variáveis da ficha', () => {
    const vars = (n: string) => ({ des: 3, prof: 2 })[n];
    expect(rollOnce('1d20+@des+@prof', { rng: faces(20, 10), vars }).total).toBe(15);
    expect(() => rollOnce('1d20+@for', { vars })).toThrow(/@for/);
  });

  it('mensagens de erro em português', () => {
    expect(checkRoll('')).toMatch(/fórmula/);
    expect(checkRoll('1d20+')).toMatch(/terminou/);
    expect(checkRoll('1d20 banana')).toMatch(/banana/);
    expect(checkRoll('0d6')).toMatch(/pelo menos/);
    expect(checkRoll('1000d6')).toMatch(/máximo/);
    expect(checkRoll('1d6 x')).not.toBeNull();
  });

  it('texto de uma linha', () => {
    const r = rollOnce('2d20kh1+1 # Furtividade', { rng: faces(20, 3, 12) });
    expect(rollText(r)).toBe('Furtividade: 2d20kh1+1 = 13 (2d20kh1 [3̶, 12] + 1)');
  });

  it('justiça do gerador: d6 equilibrado', () => {
    const rng = seededRng(42);
    const count = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) count[rollOnce('1d6', { rng }).total - 1]!++;
    for (const c of count) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });
});

describe('dados: estatística', () => {
  it('exata para somas simples', () => {
    const s = rollStats('2d6');
    expect(s.approx).toBe(false);
    expect(s.min).toBe(2);
    expect(s.max).toBe(12);
    expect(s.mean).toBeCloseTo(7, 6);
    expect(s.dist.find((d) => d.value === 7)!.p).toBeCloseTo(6 / 36, 6);
    expect(chanceAtLeast(s, 10)).toBeCloseTo(6 / 36, 6);
  });
  it('exata com vantagem e 4d6dl1', () => {
    const adv = rollStats('d20 vantagem');
    expect(adv.approx).toBe(false);
    expect(adv.mean).toBeCloseTo(13.825, 3);
    expect(rollStats('4d6dl1').mean).toBeCloseTo(12.2446, 3);
  });
  it('simula quando não dá para contar', () => {
    const s = rollStats('1d6!', { rng: seededRng(3), samples: 20000 });
    expect(s.approx).toBe(true);
    expect(s.mean).toBeGreaterThan(3.9);
    expect(s.mean).toBeLessThan(4.3);
  });
});

describe('tabelas de rolagem', () => {
  const note = `---
tags: [rpg]
---
# Estrada

## Encontros
| d6 | Encontro |
| --- | --- |
| 1-2 | {1d4+1} lobos |
| 3 | Mercador de [[Valdren]] |
| 4–6 | Nada; o clima: {@Clima} |

## Clima
| d% | Clima |
|---|---|
| 01-50 | Sol |
| 51-00 | Chuva |

\`\`\`
| d6 | dentro de código não conta |
|---|---|
| 1 | x |
\`\`\`
`;

  it('acha tabelas com dado no cabeçalho, com faixas e 00', () => {
    const ts = findTables('Tabelas/Estrada.md', note);
    expect(ts.map((t) => t.name)).toEqual(['Encontros', 'Clima']);
    expect(ts[0]!.entries).toEqual([
      { from: 1, to: 2, text: '{1d4+1} lobos' },
      { from: 3, to: 3, text: 'Mercador de [[Valdren]]' },
      { from: 4, to: 6, text: 'Nada; o clima: {@Clima}' },
    ]);
    expect(ts[1]!.entries[1]).toEqual({ from: 51, to: 100, text: 'Chuva' });
    expect(parseRange('11+')).toEqual({ from: 11, to: Number.POSITIVE_INFINITY });
    expect(parseRange('abc')).toBeNull();
  });

  it('rola com dados e tabelas aninhadas', () => {
    const ts = findTables('Tabelas/Estrada.md', note);
    // d6 = 5 → "Nada; o clima: {@Clima}" e d100 = 80 → Chuva
    let i = 0;
    const seq = [(5 - 0.5) / 6, 0.795];
    const rng: Rng = () => seq[i++]!;
    const r = rollTable(ts[0]!, { rng, tables: ts });
    expect(r.value).toBe(5);
    expect(r.text).toBe('Nada; o clima: Chuva');
    const seq2 = [0.5 / 6, 2.5 / 4];
    let j = 0;
    const w = rollTable(ts[0]!, { rng: () => seq2[j++]!, tables: ts });
    expect(w.text).toBe('4 lobos');
  });

  it('listas em notas tipo tabela; nomes repetidos', () => {
    const t = `---
tipo: tabela
---
## Nomes
- Ana
- [ ] Bia
  - detalhe que não conta
- Caio

Texto no meio.

## Nomes
1. Davi
2. Eva
`;
    const ts = findTables('T.md', t);
    expect(ts.map((x) => x.name)).toEqual(['Nomes', 'Nomes 2']);
    expect(ts[0]!.entries.map((e) => e.text)).toEqual(['Ana', 'Bia', 'Caio']);
    expect(ts[0]!.dice).toBeNull();
    expect(rollTable(ts[1]!, { rng: () => 0.99 }).text).toBe('Eva');
    // listas em notas comuns não viram tabela
    expect(findTables('N.md', '## Nomes\n- a\n- b\n')).toEqual([]);
  });

  it('acha por nota#título, título ou nota', () => {
    const all = tableIndex([{ path: 'Tabelas/Estrada.md', text: note }, { path: 'Outra.md', text: '## Clima\n| d4 | x |\n|-|-|\n| 1-4 | Neve |\n' }]);
    expect(findTable(all, 'Estrada#Clima')!.path).toBe('Tabelas/Estrada.md');
    expect(findTable(all, '[[Outra#Clima]]')!.path).toBe('Outra.md');
    expect(findTable(all, 'clima', 'Outra.md')!.path).toBe('Outra.md');
    expect(findTable(all, 'Estrada')!.name).toBe('Encontros');
    expect(findTable(all, 'Nada')).toBeNull();
    expect(findTable(all, '[[Estrada^tabela-1]]')!.name).toBe('Encontros');
  });

  it('geradores de exemplo funcionam inteiros', () => {
    const ts = findTables('Tabelas/Geradores.md', starterTables());
    expect(ts.length).toBeGreaterThanOrEqual(10);
    const rng = seededRng(9);
    for (let i = 0; i < 200; i++) {
      for (const t of ts) {
        const r = rollTable(t, { rng, tables: ts });
        expect(r.text).not.toMatch(/[{}]/);
        expect(r.text).not.toMatch(/nada na tabela/);
      }
    }
    expect(expandRolls('{@Nome}', { rng, tables: ts })).toMatch(/^[A-Z][a-z]+$/);
  });

  it('tabela que se chama não trava', () => {
    const ts = findTables('L.md', '---\ntipo: tabela\n---\n## Loop\n- de novo {@Loop}\n');
    expect(rollTable(ts[0]!, { tables: ts }).text).toMatch(/^de novo/);
  });
});

describe('ficha de jogo', () => {
  const kael = `---
tipo: personagem
mundo: Aerth
jogador: Girlene
nível: 5
classe: Guerreira
pv: 38
pv máx: 44
ca: 18 (cota de malha)
for: 16
des: 13
con: 14
int: 8
sab: 12
car: 10
salvaguardas: [for, con]
perícias:
  - Atletismo
  - Percepção
especialidades: [Atletismo]
---
# Kael

## Ataques
| Ataque | Acerto | Dano | Notas |
| --- | --- | --- | --- |
| Espada longa | +6 | 1d8+3 cortante | versátil |
| Arco | @des+@prof | 1d6+@des perfurante | |

## Rolagens
| Rolagem | Fórmula |
| --- | --- |
| Retomar o fôlego | 1d10+@nível |
`;

  it('lê atributos, modificadores, proficiência e listas', () => {
    const s = readSheet(kael);
    expect(s.level).toBe(5);
    expect(s.prof).toBe(3);
    expect(s.ac).toBe(18);
    expect(s.hp).toBe(38);
    expect(s.hpMax).toBe(44);
    expect(s.player).toBe('Girlene');
    expect(s.attrs.map((a) => a.mod)).toEqual([3, 1, 2, -1, 1, 0]);
    expect(s.init).toBe(1);
    expect(saveBonus(s, 'for')).toBe(6);
    expect(saveBonus(s, 'des')).toBe(1);
    expect(skillBonus(s, { name: 'Atletismo', attr: 'for' })).toEqual({ bonus: 9, level: 2 });
    expect(skillBonus(s, { name: 'Percepção', attr: 'sab' })).toEqual({ bonus: 4, level: 1 });
    expect(skillBonus(s, { name: 'Furtividade', attr: 'des' })).toEqual({ bonus: 1, level: 0 });
  });

  it('ataques e rolagens viram fórmulas que rolam', () => {
    const s = readSheet(kael);
    const vars = sheetVars(s);
    expect(s.attacks).toHaveLength(2);
    expect(s.attacks[0]).toMatchObject({ name: 'Espada longa', damage: '1d8+3', damageType: 'cortante', notes: 'versátil' });
    expect(attackFormula(s.attacks[0]!)).toBe('1d20+6');
    expect(attackFormula(s.attacks[1]!)).toBe('1d20+@des+@prof');
    expect(rollOnce(attackFormula(s.attacks[1]!)!, { rng: faces(20, 10), vars }).total).toBe(14);
    expect(rollOnce(s.attacks[1]!.damage, { rng: faces(6, 2), vars }).total).toBe(3);
    expect(rollOnce(s.rolls[0]!.formula, { rng: faces(10, 5), vars }).total).toBe(10);
  });

  it('sistema livre usa o valor como modificador', () => {
    const s = readSheet('---\nsistema: livre\nfor: 2\ndes: 3\ncon: 1\n---\n');
    expect(s.attrs.map((a) => a.mod)).toEqual([2, 3, 1]);
    expect(s.prof).toBe(0);
    expect(readSheet('---\nfor: 2\ndes: 3\ncon: 1\n---\n', 'livre').attrs[0]!.mod).toBe(2);
  });

  it('dano com tipo e sem', () => {
    expect(splitDamage('2d6 + 4 fogo e gelo')).toEqual({ formula: '2d6 + 4', type: 'fogo e gelo' });
    expect(splitDamage('7')).toEqual({ formula: '7', type: '' });
    expect(splitDamage('especial')).toEqual({ formula: '', type: 'especial' });
  });

  it('acrescenta ficha sem apagar o que existe', () => {
    const base = '---\ntipo: personagem\nmundo: Aerth\nfor: 18\n---\n# Lia\n\nTexto.\n';
    const out = addSheet(base);
    const s = readSheet(out);
    expect(s.attrs.find((a) => a.key === 'for')!.score).toBe(18);
    expect(s.attrs).toHaveLength(6);
    expect(s.hpMax).toBe(10);
    expect(s.attacks[0]!.name).toBe('Desarmado');
    expect(out).toContain('Texto.');
    expect(addSheet(out)).toBe(out);
  });

  it('PV: temporários primeiro, sem passar do máximo nem de zero', () => {
    expect(applyHp({ hp: 10, hpMax: 20, hpTemp: 5 }, 8)).toEqual({ hp: 7, hpTemp: 0 });
    expect(applyHp({ hp: 3, hpMax: 20, hpTemp: 0 }, 10)).toEqual({ hp: 0, hpTemp: 0 });
    expect(applyHp({ hp: 15, hpMax: 20, hpTemp: 2 }, -10)).toEqual({ hp: 20, hpTemp: 2 });
  });
});

describe('combate', () => {
  const start = (): Encounter => {
    let e = readEncounter(encounterTemplate('Emboscada', 'A Mina'));
    e = addCombatants(e, { name: '[[Kael]]', init: 17, mod: 1, hp: 38, hpMax: 44, ac: 18, conditions: [], side: 'grupo' });
    e = addCombatants(e, { name: 'Goblin', init: null, mod: 2, hp: 7, hpMax: 7, ac: 15, conditions: [], side: 'inimigo' }, 2);
    return e;
  };

  it('nomes numerados e iniciativa rolada só para quem falta', () => {
    let e = start();
    expect(e.list.map((c) => c.name)).toEqual(['[[Kael]]', 'Goblin 1', 'Goblin 2']);
    e = rollInitiative(e, (mod) => 10 + mod);
    expect(e.list.map((c) => [c.name, c.init])).toEqual([['[[Kael]]', 17], ['Goblin 1', 12], ['Goblin 2', 12]]);
    e = addCombatants(e, { name: 'Goblin', init: 5, mod: 0, hp: 7, hpMax: 7, ac: 15, conditions: [], side: 'inimigo' });
    expect(e.list.at(-1)!.name).toBe('Goblin');
    e = addCombatants(e, { name: 'Goblin', init: 5, mod: 0, hp: 7, hpMax: 7, ac: 15, conditions: [], side: 'inimigo' });
    expect(e.list.at(-1)!.name).toBe('Goblin 3');
  });

  it('desempate pelo modificador; quem não rolou vai pro fim', () => {
    const l = sortByInit([
      { name: 'A', init: null, mod: 5, hp: null, hpMax: null, ac: null, conditions: [], side: 'grupo' },
      { name: 'B', init: 12, mod: 1, hp: null, hpMax: null, ac: null, conditions: [], side: 'grupo' },
      { name: 'C', init: 12, mod: 3, hp: null, hpMax: null, ac: null, conditions: [], side: 'grupo' },
    ]);
    expect(l.map((c) => c.name)).toEqual(['C', 'B', 'A']);
  });

  it('turnos e rodadas, pulando inimigos caídos', () => {
    let e = rollInitiative(start(), (mod) => 10 + mod);
    e = nextTurn(e);
    expect([e.round, e.turn]).toEqual([1, '[[Kael]]']);
    e = nextTurn(e);
    expect(e.turn).toBe('Goblin 1');
    e = changeHp(e, 'Goblin 2', 50);
    expect(e.list.find((c) => c.name === 'Goblin 2')!.hp).toBe(0);
    e = nextTurn(e);
    expect([e.round, e.turn]).toEqual([2, '[[Kael]]']);
    e = prevTurn(e);
    expect([e.round, e.turn]).toEqual([1, 'Goblin 1']);
    e = prevTurn(e);
    e = prevTurn(e);
    expect([e.round, e.turn]).toEqual([0, null]);
  });

  it('PV entre 0 e o máximo; cura tira "caído"', () => {
    let e = start();
    e = changeHp(e, '[[Kael]]', 100);
    e = toggleCondition(e, '[[Kael]]', 'caído');
    expect(e.list[0]!.hp).toBe(0);
    e = changeHp(e, '[[Kael]]', -500);
    expect(e.list[0]!.hp).toBe(44);
    expect(e.list[0]!.conditions).toEqual([]);
  });

  it('renomear e remover quem está na vez', () => {
    let e = nextTurn(rollInitiative(start(), (m) => 10 + m));
    // nome já usado ganha o próximo número livre
    e = update(e, '[[Kael]]', { name: 'Goblin 1' });
    expect(e.turn).toBe('Goblin 3');
    expect(e.list.map((c) => c.name)).toEqual(['Goblin 3', 'Goblin 1', 'Goblin 2']);
    e = removeCombatant(e, 'Goblin 3');
    expect(e.list).toHaveLength(2);
    expect(e.turn).toBe('Goblin 1');
  });

  it('grava e lê de volta, com colunas extras preservadas', () => {
    let text = encounterTemplate('Emboscada', 'A Mina');
    let e = nextTurn(rollInitiative(start(), (m) => 10 + m));
    e = toggleCondition(e, 'Goblin 1', 'envenenado');
    text = writeEncounter(text, e);
    expect(text).toContain('rodada: 1');
    expect(text).toContain('vez: "[[Kael]]"');
    // coluna criada à mão no Obsidian
    text = text.replace('| Lado    |', '| Lado    | Nota |').replace(/(\| -+ \|)\n/, '$1 --- |\n');
    const back = readEncounter(text);
    expect(back.round).toBe(1);
    expect(back.turn).toBe('[[Kael]]');
    expect(back.list.map((c) => c.name)).toEqual(['[[Kael]]', 'Goblin 1', 'Goblin 2']);
    expect(back.list[1]!.conditions).toEqual(['envenenado']);
    expect(back.list[0]).toMatchObject({ init: 17, mod: 1, hp: 38, hpMax: 44, ac: 18, side: 'grupo' });
    // nomes com | (apelido do Obsidian) sobrevivem
    const withAlias = writeEncounter(text, update(back, '[[Kael]]', { name: '[[Kael|K]]' }));
    expect(readEncounter(withAlias).list[0]!.name).toBe('[[Kael|K]]');
  });

  it('registro acrescenta linhas sem apagar as anteriores', () => {
    let t = encounterTemplate('X');
    t = appendLog(t, 'R1 · Kael acerta');
    t = appendLog(t, 'R1 · Goblin erra');
    expect(t).toMatch(/## Registro\n\n- R1 · Kael acerta\n- R1 · Goblin erra\n?$/);
  });
});

describe('campanhas', () => {
  const notes = [
    { path: 'Mundos/Aerth/Aerth.md', text: '---\ntipo: mundo\n---\n# Aerth\n' },
    { path: 'Mundos/Aerth/Personagens/Kael.md', text: '---\ntipo: personagem\nmundo: Aerth\njogador: Girlene\npv: 10\nca: 15\n---\n' },
    { path: 'Mundos/Aerth/Personagens/Rei.md', text: '---\ntipo: personagem\nmundo: Aerth\n---\nsem ficha\n' },
    { path: 'Mundos/Aerth/Criaturas/Goblin.md', text: '---\ntipo: monstro\nmundo: Aerth\npv: 7\nca: 15\n---\n' },
    { path: 'Mundos/Outro/Personagens/Zed.md', text: '---\ntipo: personagem\nmundo: Outro\npv: 7\n---\n' },
    { path: 'Campanhas/A Mina/A Mina.md', text: campaignTemplateText() },
    { path: 'Campanhas/A Mina/Sessões/Sessão 2.md', text: sessionTemplate(2, 'A Mina', '2026-10-20') },
    { path: 'Campanhas/A Mina/Sessões/Sessão 1.md', text: sessionTemplate(1, 'A Mina', '2026-10-13') },
    { path: 'Campanhas/A Mina/Encontros/Emboscada.md', text: encounterTemplate('Emboscada') },
    { path: 'Campanhas/A Mina/NPCs/Taverneiro.md', text: '---\ntipo: personagem\npv: 4\n---\n' },
  ];
  function campaignTemplateText() {
    return '---\ntipo: campanha\nmundo: "[[Aerth]]"\nsistema: 5e\n---\n# A Mina\n';
  }

  it('junta sessões, encontros e fichas do mundo e da pasta', () => {
    const [c] = campaignIndex(notes);
    expect(c!.name).toBe('A Mina');
    expect(c!.world).toBe('Aerth');
    expect(c!.sessions.map((s) => s.number)).toEqual([1, 2]);
    expect(c!.encounters.map((s) => s.name)).toEqual(['Emboscada']);
    expect(c!.sheets.map((s) => [s.name, s.pc, s.type])).toEqual([['Kael', true, 'personagem'], ['Goblin', false, 'criatura'], ['Taverneiro', false, 'personagem']]);
  });

  it('a criatura entra no world building como tipo próprio', () => {
    const w = worldIndex(notes).find((x) => x.name === 'Aerth')!;
    expect(w.entities.find((e) => e.name === 'Goblin')!.type).toBe('criatura');
  });

  it('modelo de sessão traz o resumo da anterior', () => {
    const t = sessionTemplate(3, 'A Mina', '2026-10-27', { name: 'Sessão 2', recap: 'O grupo achou a mina.\nKael caiu.' });
    expect(t).toContain('> [!quote] Na sessão anterior ([[Sessão 2]])\n> O grupo achou a mina.\n> Kael caiu.');
    expect(t).toContain('número: 3');
  });
});
