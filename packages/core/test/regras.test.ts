import { describe, expect, it } from 'vitest';
import { Rules, compileRules, rulesExample, textBankExample, ruleBlocks, seededRng, simulateWorld, tableIndex, worldIndex, worldYear, type RuleHost } from '../src/index';

const note = (props: string, body = '') => `---\n${props}\n---\n${body}`;
const W = 'Mundos/Aerth';

const REGRAS = `
# estruturas de dados
tipo relíquia "Relíquia" "Relíquias":
  símbolo ✶
  cor #e6c86e
  campo dono
  campo maldição = 2

grupo elfos_ambiciosos = personagem onde espécie.nome = "Elfo" e ambição maior que 5

calcular idade em personagem = ano - nascimento

ação "Envelhecer 10 anos" em personagem:
  idade_extra += 10
  se chance(100%):
    crônica "{personagem} sente o peso dos anos."

ação "Abençoar" em personagem onde fé pelo menos 3:
  fé += 1
  avisar "{personagem.nome} agora tem fé {personagem.fé}"

# indivíduo atraído por quem tem o que ele quer: disputa por um item
interação "Cobiça" entre ladrão em elfos_ambiciosos, dono em personagem onde dono.tesouro existe:
  atração = ladrão.ambição + dono.tesouro.valor / 10
  chance = 100%
  seja item = dono.tesouro
  item.dono = ladrão
  ladrão.tesouro = item
  dono.tesouro = vazio
  liga dono, "inimigos", ladrão
  crônica tabela("Roubos")
  disparar roubo(ladrão, dono, item)

quando roubo(quem, vítima, coisa):
  vítima.raiva += 3
  se vítima.raiva >= 3:
    convocar "Abençoar" em vítima

quando ano em personagem onde fé > 10:
  crônica "{personagem.nome} tem visões."
`;

const notes = [
  { path: `${W}/Aerth.md`, text: note('tipo: mundo\nano: 400') },
  { path: `${W}/Regras/Regras.md`, text: `# Regras\n\n\`\`\`regras${REGRAS}\`\`\`\n` },
  { path: `${W}/Espécies/Elfo.md`, text: note('tipo: espécie\nmundo: Aerth') },
  { path: `${W}/Espécies/Humano.md`, text: note('tipo: espécie\nmundo: Aerth') },
  { path: `${W}/Personagens/Lirael.md`, text: note('tipo: personagem\nmundo: Aerth\nespécie: "[[Elfo]]"\nambição: 9\nnascimento: 350') },
  { path: `${W}/Personagens/Toran.md`, text: note('tipo: personagem\nmundo: Aerth\nespécie: "[[Humano]]"\nambição: 2\nfé: 3\ntesouro: "[[Cálice de Prata]]"\nnascimento: 380') },
  { path: `${W}/Personagens/Ilda.md`, text: note('tipo: personagem\nmundo: Aerth\nespécie: "[[Elfo]]"\nambição: 1') },
  { path: `${W}/Itens/Cálice de Prata.md`, text: note('tipo: relíquia\nmundo: Aerth\ndono: "[[Toran]]"\nvalor: 40') },
  { path: 'Tabelas/Textos.md', text: '---\ntipo: tabela\n---\n# Textos\n\n## Roubos\n\n- {ladrão} some na noite com {item}, e {dono} jura vingança.\n- {dono} acorda e {item} não está mais lá. {ladrão} sorri de longe.\n' },
];
const world = worldIndex(notes).find((w) => w.name === 'Aerth')!;
const prog = compileRules(world.scripts ?? []);
const tables = tableIndex(notes);
const P = (n: string) => world.entities.find((e) => e.name === n)!.path;
const host = (over: Partial<RuleHost> = {}): RuleHost => ({ rng: seededRng(3), year: worldYear(world), tables, ...over });

describe('linguagem das regras: leitura', () => {
  it('acha os blocos ```regras e diz a linha certa', () => {
    const b = ruleBlocks('a.md', 'texto\n```regras\nseja x = 1\n```\n');
    expect(b).toEqual([{ path: 'a.md', code: 'seja x = 1', line: 3 }]);
    expect(world.scripts).toHaveLength(1);
  });
  it('compila o programa de exemplo sem erros', () => {
    expect(prog.issues).toEqual([]);
    expect(prog.types[0]).toMatchObject({ id: 'reliquia', label: 'Relíquia', glyph: '✶', color: '#e6c86e', defaults: { maldição: '2' } });
    expect(prog.groups.map((g) => g.name)).toEqual(['elfos_ambiciosos']);
    expect(prog.actions.map((a) => a.name)).toEqual(['Envelhecer 10 anos', 'Abençoar']);
    expect(prog.interactions[0]!.b?.type).toBe('personagem');
  });
  it('erros vêm com nota, linha e mensagem em português', () => {
    const p = compileRules([{ path: 'x.md', code: 'quando ano:\n  se poder >:\n    poder += 1\nvoar alto', line: 10 }]);
    expect(p.issues).toHaveLength(2);
    expect(p.issues[0]).toMatchObject({ path: 'x.md', line: 11 });
    expect(p.issues[1]!.message).toMatch(/não sei começar com "voar"/);
  });
  it('é tolerante: sem acento, "=" na condição, "maior que", "não tem", "é"', () => {
    const r = new Rules(prog, world, host());
    expect(r.evalSource('contar(personagem)')).toBe('3');
    expect(r.evalSource('[p em personagem onde p.especie = "elfo"].nome')).toBe('Ilda, Lirael');
    expect(r.evalSource('ficha("Toran").ambicao maior que 1 e nao ficha("Toran") é especie')).toBe('sim');
    expect(r.evalSource('[1, 2] não tem 3')).toBe('sim');
    expect(r.evalSource('ficha("Cálice de Prata") é relíquia')).toBe('sim');
  });
});

describe('dados das fichas', () => {
  const r = new Rules(prog, world, host());
  it('segue os [[links]] como fichas', () => {
    expect(r.evalSource('ficha("Toran").tesouro.dono.nome')).toBe('Toran');
    expect(r.evalSource('quem("dono", ficha("Toran")).nome')).toBe('Cálice de Prata');
    expect(r.evalSource('ficha("Ilda").tesouro não existe')).toBe('sim');
  });
  it('grupos filtram por características', () => {
    expect(r.membersOf('elfos_ambiciosos').map((e) => e.name)).toEqual(['Lirael']);
  });
  it('campos calculados usam o ano do mundo', () => {
    expect(r.computedFor(P('Lirael'))).toEqual([{ name: 'idade', value: '50' }]);
  });
  it('ações aparecem só onde valem e guardam as mudanças', () => {
    const said: string[] = [];
    const r2 = new Rules(prog, world, host({ notify: (t) => said.push(t), chronicle: (t) => said.push(t) }));
    expect(r2.actionsFor(P('Toran'))).toEqual(['Envelhecer 10 anos', 'Abençoar']);
    expect(r2.actionsFor(P('Ilda'))).toEqual(['Envelhecer 10 anos']);
    r2.runAction('Abençoar', P('Toran'));
    r2.runAction('Envelhecer 10 anos', P('Toran'));
    expect(said).toEqual(['Toran agora tem fé 4', '[[Toran]] sente o peso dos anos.']);
    expect(r2.changes()).toEqual([{ path: P('Toran'), props: { fé: '4', 'idade extra': '10' } }]);
  });
});

describe('interações, eventos em cadeia e bancos de texto', () => {
  it('o ambicioso cobiça o tesouro, a vítima reage, a crônica sai do banco de texto', () => {
    const story: string[] = [];
    const r = new Rules(prog, world, host({ chronicle: (t) => story.push(t) }));
    r.tick(401);
    expect(r.issues).toEqual([]);
    // Lirael (elfa ambiciosa) rouba o cálice de Toran
    expect(story).toHaveLength(1);
    expect(story[0]).toMatch(/\[\[Lirael\]\]/);
    expect(story[0]).toMatch(/\[\[Cálice de Prata\]\]/);
    const ch = Object.fromEntries(r.changes().map((c) => [c.path.split('/').pop(), c.props]));
    expect(ch['Cálice de Prata.md']).toEqual({ dono: '[[Lirael]]' });
    expect(ch['Lirael.md']).toEqual({ tesouro: '[[Cálice de Prata]]' });
    // o evento roubo() deixou Toran com raiva e convocou a bênção (fé 3 → 4)
    expect(ch['Toran.md']).toMatchObject({ tesouro: null, inimigos: '[[Lirael]]', raiva: '3', fé: '4' });
    // no ano seguinte ninguém mais tem tesouro para roubar
    r.tick(402);
    expect(story).toHaveLength(1);
  });
  it('laço sem fim para no limite, sem travar', () => {
    const p = compileRules([{ path: 'x.md', code: 'quando ano:\n  seja i = 0\n  para cada x em [1]:\n    disparar ano' }]);
    const r = new Rules(p, world, host({ budget: 5000 }));
    r.tick(1);
    expect(r.issues.some((i) => /cadeia demais|limite/.test(i.message))).toBe(true);
  });
});

describe('regras dentro da simulação', () => {
  it('roda só com regras (sem facções) e devolve as mudanças', () => {
    const r = simulateWorld(world, { seed: 4, years: 3, rules: prog, tables });
    expect(r.problem).toBeUndefined();
    expect(r.events.some((e) => e.kind === 'regra')).toBe(true);
    expect(r.changes?.length).toBeGreaterThan(0);
    expect(r.ruleIssues).toEqual([]);
  });
  it('mexe no poder das facções na escala das fichas', () => {
    const ns = [
      ...notes,
      { path: `${W}/Facções/A.md`, text: note('tipo: facção\nmundo: Aerth\npoder: 5\ninimigos: "[[B]]"') },
      { path: `${W}/Facções/B.md`, text: note('tipo: facção\nmundo: Aerth\npoder: 5') },
      { path: `${W}/Regras/Facções.md`, text: '```regras\nquando inicio:\n  ficha("A").poder = 9\n  crônica "A cresce: {ficha(\\"A\\").poder}"\n```' },
    ];
    const w = worldIndex(ns).find((x) => x.name === 'Aerth')!;
    const r = simulateWorld(w, { seed: 1, years: 1, rules: compileRules(w.scripts ?? []), tables });
    expect(r.events[0]!.text).toBe('A cresce: 9');
    expect(r.ruleIssues).toEqual([]);
  });
});

describe('modelo de exemplo', () => {
  it('compila, roda e conta uma história com os bancos de texto', () => {
    const n = (p: string) => `---\n${p}\n---\n`;
    const ns = [
      { path: 'Mundos/A/Regras/Regras.md', text: rulesExample('A') },
      { path: 'Mundos/A/Regras/Textos.md', text: textBankExample() },
      { path: 'Mundos/A/P/Kael.md', text: n('tipo: personagem\nmundo: A\nambição: 8\nhabilidade: 4') },
      { path: 'Mundos/A/P/Mira.md', text: n('tipo: personagem\nmundo: A\nambição: 2\ntesouro: "[[Cálice]]"') },
      { path: 'Mundos/A/I/Cálice.md', text: n('tipo: relíquia\nmundo: A\nvalor: 50\ndono: "[[Mira]]"') },
    ];
    const w = worldIndex(ns)[0]!;
    expect(w.entities.some((e) => e.name === 'Textos')).toBe(false);
    const p = compileRules(w.scripts ?? []);
    expect(p.issues).toEqual([]);
    const r = simulateWorld(w, { seed: 7, years: 40, rules: p, tables: tableIndex(ns) });
    expect(r.ruleIssues).toEqual([]);
    expect(r.events.filter((e) => e.kind === 'regra').length).toBeGreaterThan(2);
    expect(r.events.every((e) => !/\{[a-zà-ú]+\}/i.test(e.text))).toBe(true); // nenhum {nome} sobrando
  });
});
