import { describe, expect, it } from 'vitest';
import {
  NAME_STYLES, biomeAtPercent, chronicleMarkdown, completeness, conflictsOf, entityTemplate, generateTerrain, mapDistance, mapInfo,
  markovNames, readMarkers, reviewWorld, rollTraits, seededRng, simulateWorld, stanceOf, storyHooks, styledName, suggestSpots,
  tensionsOf, travelTimes, worldIndex, writeMarkers,
} from '../src/index';

const note = (props: string, body = '') => `---\n${props}\n---\n${body}`;

/** Um mundo pequeno, com uma guerra, uma aliança e uns erros de propósito. */
const notes = [
  { path: 'Mundos/Aerth/Aerth.md', text: note('tipo: mundo') },
  { path: 'Mundos/Aerth/Facções/Ordem do Sol.md', text: note('tipo: facção\nmundo: Aerth\nlíder: "[[Kael]]"\npoder: 7\ninimigos: "[[Culto da Cinza]]"\naliados: "[[Liga do Porto]]"', '# Ordem do Sol\n\nCavaleiros que juraram guardar a luz.\n') },
  { path: 'Mundos/Aerth/Facções/Culto da Cinza.md', text: note('tipo: faccao\nmundo: Aerth\nsede: "[[Vale Escuro]]"\npoder: 6', 'Seita que quer apagar o sol.\n') },
  { path: 'Mundos/Aerth/Facções/Liga do Porto.md', text: note('tipo: faccao\nmundo: Aerth\nterritório: "[[Porto Alto]]"', 'Mercadores.\n') },
  { path: 'Mundos/Aerth/Lugares/Vale Escuro.md', text: note('tipo: lugar\nmundo: Aerth\ngovernante: "[[Culto da Cinza]]"', 'Um vale sem sol.\n') },
  { path: 'Mundos/Aerth/Lugares/Porto Alto.md', text: note('tipo: lugar\nmundo: Aerth', 'Cidade portuária.\n') },
  { path: 'Mundos/Aerth/Personagens/Kael.md', text: note('tipo: personagem\nmundo: Aerth\nnascimento: 300\nmorte: 290\nafiliação: "[[Ordem do Sol]]"\nespécie: "[[Humano]]"', '# Kael\n\nUm cavaleiro cansado.\n') },
  { path: 'Mundos/Aerth/Personagens/Mira.md', text: note('tipo: personagem\nmundo: Aerth\nnascimento: 280\nmorte: 320\npai: "[[Kael]]"') },
  { path: 'Mundos/Aerth/Eventos/Batalha da Ponte.md', text: note('tipo: evento\nmundo: Aerth\ndata: 330\nenvolvidos: "[[Mira]]"', 'Muita gente morreu.\n') },
  { path: 'Mundos/Aerth/Conflitos/Guerra das Cinzas.md', text: note('tipo: conflito\nmundo: Aerth\nlados: ["[[Ordem do Sol]]", "[[Culto da Cinza]]"]\nintensidade: 4\nstatus: ativo') },
  { path: 'Mundos/Aerth/Conceitos/Eco.md', text: note('tipo: conceito\nmundo: Aerth') },
];
const world = worldIndex(notes)[0]!;
const P = (name: string) => world.entities.find((e) => e.name === name)!.path;

describe('fichas mais completas', () => {
  it('reconhece os tipos novos e seus apelidos', () => {
    expect(world.entities.find((e) => e.name === 'Guerra das Cinzas')!.type).toBe('conflito');
    expect(worldIndex([{ path: 'Mundos/X/a.md', text: note('tipo: povo\nmundo: X') }])[0]!.entities[0]!.type).toBe('cultura');
  });
  it('mede a completude de 0 a 1', () => {
    const vazio = world.entities.find((e) => e.name === 'Eco')!;
    const kael = world.entities.find((e) => e.name === 'Kael')!;
    expect(vazio.score).toBeLessThan(0.3);
    expect(kael.score).toBeGreaterThan(vazio.score);
    const cheio = completeness({ type: 'conceito', props: { categoria: 'magia', imagem: '[[eco.png]]' }, summary: 'Som que volta.' },
      note('categoria: magia', '## Como funciona\n\nVolta.\n\n## Limites\n\nUma vez por dia.\n'), 3);
    expect(cheio).toBe(1);
  });
  it('modelo de mapa já nasce com semente e tabela de marcadores', () => {
    const t = entityTemplate('Mapa de Aerth', 'Aerth', 'mapa');
    expect(mapInfo(t).seed).not.toBeNull();
    expect(readMarkers(t)).toEqual([]);
    expect(t).toContain('## Marcadores');
  });
});

describe('conflitos e tensões', () => {
  it('lê a postura pelo nome da ligação', () => {
    expect(stanceOf('inimigos')).toBe('hostil');
    expect(stanceOf('Aliança com')).toBe('aliado');
    expect(stanceOf('afiliação')).toBe('neutro');
  });
  it('junta conflitos e ligações hostis no mesmo par', () => {
    const c = conflictsOf(world);
    expect(c).toHaveLength(1);
    expect(c[0]!.sides).toEqual([P('Ordem do Sol'), P('Culto da Cinza')]);
    expect(c[0]!.active).toBe(true);
    const ts = tensionsOf(world);
    const war = ts.find((t) => t.stance === 'hostil')!;
    expect([war.a, war.b].sort()).toEqual([P('Ordem do Sol'), P('Culto da Cinza')].sort());
    expect(war.weight).toBe(5); // ligação (1) + intensidade 4
    expect(war.sources).toContain('Guerra das Cinzas');
    expect(ts.some((t) => t.stance === 'aliado')).toBe(true);
  });
});

describe('revisão do mundo', () => {
  const issues = reviewWorld(world);
  const msgs = issues.map((i) => i.message).join('\n');
  it('acha contradições de datas', () => {
    expect(msgs).toMatch(/Kael: morre \(290\) antes de começar \(300\)/);
    expect(msgs).toMatch(/Mira nasce \(280\) antes de Kael/);
    expect(msgs).toMatch(/Mira participa de Batalha da Ponte \(330\), mas já tinha morrido/);
  });
  it('sugere fichas que faltam com o tipo certo', () => {
    const humano = issues.find((i) => i.create?.name === 'Humano');
    expect(humano?.create?.type).toBe('especie');
  });
  it('erros vêm antes de ideias', () => {
    expect(issues[0]!.level).toBe('erro');
    expect(issues.at(-1)!.level).toBe('ideia');
  });
});

describe('mapas', () => {
  const base = note('tipo: mapa\nmundo: Aerth\nescala: 600\nunidade: km\nimagem: "[[mapa.png]]"', '# Mapa\n\n## Marcadores\n\n| Marcador | X | Y | Nota |\n| --- | --- | --- | --- |\n| [[Vale Escuro]] | 10 | 20 | sombrio |\n| Aqui há dragões | 50,5 | 140 | |\n');
  it('lê marcadores e propriedades do mapa', () => {
    const m = readMarkers(base);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ target: 'Vale Escuro', x: 10, y: 20 });
    expect(m[1]).toMatchObject({ target: null, x: 50.5, y: 100 });
    expect(mapInfo(base)).toMatchObject({ scale: 600, unit: 'km', image: 'mapa.png', seed: null });
  });
  it('grava mantendo colunas extras', () => {
    const m = readMarkers(base);
    m[0]!.x = 33.33;
    const out = writeMarkers(base, [...m, { label: '[[Porto Alto]]', target: 'Porto Alto', x: 80, y: 70 }]);
    expect(out).toContain('sombrio');
    expect(readMarkers(out).map((x) => x.x)).toEqual([33.3, 50.5, 80]);
  });
  it('mede distâncias e tempo de viagem', () => {
    expect(mapDistance({ x: 0, y: 0 }, { x: 50, y: 0 }, 600, 1.5)).toBe(300);
    expect(mapDistance({ x: 0, y: 0 }, { x: 0, y: 30 }, 600, 2)).toBe(90);
    expect(travelTimes(60, 'km')![0]).toEqual({ how: 'a pé', days: 2 });
    expect(travelTimes(10, 'dias')).toBeNull();
  });
  it('gera o mesmo terreno com a mesma semente, com mar nas bordas', () => {
    const a = generateTerrain(42, 80, 50);
    const b = generateTerrain(42, 80, 50);
    expect(a.height).toEqual(b.height);
    expect(biomeAtPercent(a, 0, 0)).toMatch(/mar|fundo/);
    const land = Array.from(a.height).filter((h) => h >= a.sea).length / a.height.length;
    expect(land).toBeGreaterThan(0.1);
    expect(land).toBeLessThan(0.9);
    const spots = suggestSpots(a, 5, []);
    expect(spots.length).toBeGreaterThan(0);
    for (const s of spots) expect(biomeAtPercent(a, s.x, s.y)).not.toMatch(/^(mar|fundo)$/);
  });
});

describe('geradores', () => {
  it('nomes por estilo são repetíveis com semente', () => {
    const a = Array.from({ length: 5 }, ((r) => () => styledName(NAME_STYLES[0]!, r))(seededRng(7)));
    const b = Array.from({ length: 5 }, ((r) => () => styledName(NAME_STYLES[0]!, r))(seededRng(7)));
    expect(a).toEqual(b);
    for (const n of a) expect(n).toMatch(/^\p{Lu}\p{Ll}+$/u);
  });
  it('aprende o estilo dos nomes do mundo e não repete os que já existem', () => {
    const samples = ['Aranel', 'Arathorn', 'Elanor', 'Elrond', 'Aragorn', 'Arwen', 'Earendil', 'Elendil', 'Anarion'];
    const out = markovNames(samples, 6, seededRng(3));
    expect(out.length).toBeGreaterThan(0);
    for (const n of out) expect(samples).not.toContain(n);
    expect(markovNames(['Ana'], 3, seededRng(1))).toEqual([]);
  });
  it('traços e ganchos usam as fichas do mundo', () => {
    expect(Object.keys(rollTraits(seededRng(1)))).toContain('segredo');
    const hooks = storyHooks(world, 4, seededRng(9));
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.join(' ')).toMatch(/\[\[[^\]]+\]\]/);
  });
});

describe('simulação', () => {
  it('é repetível e escreve uma crônica com [[links]]', () => {
    const a = simulateWorld(world, { seed: 11, years: 60, chaos: 0.7 });
    const b = simulateWorld(world, { seed: 11, years: 60, chaos: 0.7 });
    expect(a.events).toEqual(b.events);
    expect(a.problem).toBeUndefined();
    expect(a.start).toBe(331); // depois da última data do mundo
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.history[0]!.year).toBe(331);
    expect(Object.keys(a.history[0]!.power)).toHaveLength(3);
    // a guerra que já existe aparece
    expect(a.events.some((e) => e.actors.includes(P('Ordem do Sol')) && e.actors.includes(P('Culto da Cinza')))).toBe(true);
    const md = chronicleMarkdown(world, a);
    expect(md).toContain('semente: 11');
    expect(md).toMatch(/## \d+/);
  });
  it('território vem de governante, sede e território', () => {
    const r = simulateWorld(world, { seed: 1, years: 1, chaos: 0 });
    const culto = r.actors.find((x) => x.name === 'Culto da Cinza')!;
    const liga = r.actors.find((x) => x.name === 'Liga do Porto')!;
    expect(r.history[0]!.power[culto.path]).toBe(60);
    expect(liga.territory.length + culto.territory.length).toBeGreaterThanOrEqual(1);
  });
  it('avisa quando não há facções suficientes', () => {
    const w = worldIndex([{ path: 'Mundos/Y/a.md', text: note('tipo: faccao\nmundo: Y') }])[0]!;
    expect(simulateWorld(w, { seed: 1 }).problem).toMatch(/duas facções/);
  });
});
