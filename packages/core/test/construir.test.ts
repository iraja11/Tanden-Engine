import { describe, expect, it } from 'vitest';
import {
  BEAT_SHEETS, CHECKLISTS, DEEP_QUESTIONS, DICAS, typeInfo, ELEMENTS, ELEMENT_FAMILIES, addToDictionary, castGrid, elementById, elementCoverage, familyCoverage, foodWeb,
  languageOf, languagePlaces, manuscript, proximosPassos, readChecks, readDictionary, rollSpecies, sceneTemplate, scenesByBeat, scenePrompts,
  seededRng, speciesBlurb, speciesFigure, speciesTable, storyIndex, storyTemplate, toggleCheck, translate, wordFor, worldIndex,
} from '../src/index';

const note = (props: string, body = '') => `---\n${props}\n---\n${body}`;

const texts: Record<string, string> = {
  'Mundos/Vael/Vael.md': note('tipo: mundo\nfora do mundo: Vida alienígena'),
  'Mundos/Vael/Personagens/Iris.md': note('tipo: personagem\nmundo: Vael\nmotivação: vingar o irmão\nsegredo: um pacto com o mar\nespécie: "[[Ondinos]]"'),
  'Mundos/Vael/Personagens/Tomé.md': note('tipo: personagem\nmundo: Vael\nmedo: o escuro'),
  'Mundos/Vael/Lugares/Porto Cinza.md': note('tipo: lugar\nmundo: Vael\ncategoria: cidade portuária'),
  'Mundos/Vael/Culturas/Povo do Sal.md': note('tipo: cultura\nmundo: Vael\ntabus: comer peixe cru\nfestas: Noite das Velas', '# Povo do Sal\n\nPescadores.\n'),
  'Mundos/Vael/Espécies/Ondinos.md': note('tipo: espécie\nmundo: Vael\ncorpo: aquático\naltura: 1,6\ndieta: carnívoro\ncome: "[[Peixe-lanterna]]"\ninteligência: sapiente'),
  'Mundos/Vael/Criaturas/Peixe-lanterna.md': note('tipo: criatura\nmundo: Vael\ncorpo: aquático\naltura: 0,3\ndieta: filtrador\ntraços físicos: brilho'),
  'Mundos/Vael/Criaturas/Leviatã.md': note('tipo: criatura\nmundo: Vael\naltura: 40\npresas: "[[Ondinos]]"\ndieta: carnívoro'),
  'Mundos/Vael/Idiomas/Salgado.md': note('tipo: idioma\nmundo: Vael\nsom: sibilante\nfalado por: "[[Povo do Sal]]"', '# Salgado\n\n## Dicionário\n\n| Palavra | Significado | Classe |\n| --- | --- | --- |\n| ssira | mar | substantivo |\n'),
  'Mundos/Vael/Histórias/A Maré.md': storyTemplate('A Maré', 'Vael', { estrutura: 'tres-atos', meta: 1000 }),
  'Mundos/Vael/Histórias/A Maré/Cena 1.md': sceneTemplate('Cena 1', 'Vael', 'A Maré', 1, { beat: 'Gancho', pov: 'Iris', local: 'Porto Cinza' }) + 'Iris olha o mar e espera.\n',
  'Mundos/Vael/Histórias/A Maré/Cena 2.md': sceneTemplate('Cena 2', 'Vael', 'A Maré', 2, { beat: 'Ponto médio', pov: 'Tomé' }) + 'Tomé encontra a carta. [[Iris]] não sabe.\n',
  'Mundos/Vael/Histórias/A Maré/Solta.md': sceneTemplate('Solta', 'Vael', 'A Maré', 3) + 'Sem batida.\n',
};
const world = worldIndex(Object.entries(texts).map(([path, text]) => ({ path, text })))[0]!;

describe('tabela de elementos', () => {
  it('tem famílias, ids únicos e perguntas', () => {
    expect(ELEMENTS.length).toBeGreaterThan(90);
    expect(new Set(ELEMENTS.map((e) => e.id)).size).toBe(ELEMENTS.length);
    for (const e of ELEMENTS) {
      expect(ELEMENT_FAMILIES.some((f) => f.id === e.family)).toBe(true);
      expect(e.perguntas.length).toBeGreaterThan(0);
    }
    expect(elementById('tabus')?.nome).toBe('Tabus');
    expect(elementById('Tabus')?.id).toBe('tabus');
  });

  it('mede a cobertura do mundo e respeita o que está fora', () => {
    const cov = elementCoverage(world);
    const lv = (id: string) => cov.find((c) => c.element.id === id)!.level;
    expect(lv('tabus')).not.toBe('vazio');
    expect(lv('idiomas')).not.toBe('vazio');
    expect(lv('vida-alienigena')).toBe('fora');
    expect(lv('sociedades-secretas')).toBe('vazio');
    const fams = familyCoverage(cov);
    expect(fams.find((f) => f.family.id === 'cultura')!.done).toBeGreaterThan(0);
  });

  it('uma ficha conta para o elemento que declara', () => {
    const w2 = worldIndex([{ path: 'Mundos/X/Conceitos/Sino.md', text: note('tipo: conceito\nmundo: X\nelemento: Profecias') }])[0]!;
    expect(elementCoverage(w2).find((c) => c.element.id === 'profecias')!.level).toBe('iniciado');
  });
});

describe('escrita', () => {
  const [story] = storyIndex(world);

  it('acha a história e as cenas em ordem, com ponto de vista e local', () => {
    expect(story!.name).toBe('A Maré');
    expect(story!.sheet?.id).toBe('tres-atos');
    expect(story!.goal).toBe(1000);
    expect(story!.scenes.map((s) => s.name)).toEqual(['Cena 1', 'Cena 2', 'Solta']);
    const c1 = story!.scenes[0]!;
    expect(world.entities.find((e) => e.path === c1.pov)?.name).toBe('Iris');
    expect(world.entities.find((e) => e.path === c1.local)?.name).toBe('Porto Cinza');
    expect(story!.words).toBeGreaterThan(5);
  });

  it('agrupa as cenas pelas batidas da estrutura (e as soltas no fim)', () => {
    const cols = scenesByBeat(story!);
    expect(cols.find((c) => c.beat?.nome === 'Gancho')!.scenes.map((s) => s.name)).toEqual(['Cena 1']);
    expect(cols.find((c) => c.beat?.nome === 'Ponto médio')!.scenes.map((s) => s.name)).toEqual(['Cena 2']);
    expect(cols[cols.length - 1]!.beat).toBeNull();
  });

  it('elenco: quem aparece em cada cena', () => {
    const grid = castGrid(story!, world);
    const iris = grid.find((r) => r.entity.name === 'Iris')!;
    expect(iris.scenes).toEqual([true, true, false]);
    expect(iris.povs).toBe(1);
  });

  it('monta o manuscrito na ordem', () => {
    const md = manuscript(story!, (p) => texts[p] ?? '');
    expect(md.indexOf('Iris olha')).toBeLessThan(md.indexOf('Tomé encontra'));
    expect(md).toContain('### Cena 1');
  });

  it('todas as estruturas têm batidas em ordem de 0 a 1', () => {
    for (const s of BEAT_SHEETS) {
      expect(s.beats.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < s.beats.length; i++) expect(s.beats[i]!.pos).toBeGreaterThanOrEqual(s.beats[i - 1]!.pos);
    }
  });

  it('ideias de cena usam as fichas do mundo', () => {
    const p = scenePrompts(world, seededRng(3), 4);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => /\[\[/.test(x.text))).toBe(true);
  });
});

describe('espécies', () => {
  it('sorteia só o que falta e é coerente com o habitat', () => {
    const r = rollSpecies(seededRng(1), { corpo: 'bípede' }, { bioma: 'tundra', sapiente: true });
    expect(r['corpo']).toBeUndefined();
    expect(r['clima']).toMatch(/fri|gelad/);
    expect(r['revestimento']).toMatch(/pelo|pena/);
    expect(Number(r['altura']!.replace(',', '.'))).toBeGreaterThan(0.5);
  });

  it('desenha a partir das propriedades', () => {
    const f = speciesFigure({ corpo: 'quadrúpede', altura: '2,4', cor: 'vermelho e dourado', 'traços físicos': 'chifres, asas' });
    expect(f.plano).toBe('quadrupede');
    expect(f.altura).toBeCloseTo(2.4);
    expect(f.chifres && f.asas).toBe(true);
    expect(f.cor).not.toBe(f.cor2);
  });

  it('monta a teia alimentar em níveis', () => {
    const web = foodWeb(world);
    const lv = (n: string) => web.nodes.find((x) => x.entity.name === n)!.level;
    expect(lv('Peixe-lanterna')).toBe(1);
    expect(lv('Ondinos')).toBe(2);
    expect(lv('Leviatã')).toBe(3);
    expect(web.edges.length).toBe(2);
  });

  it('compara e descreve', () => {
    const rows = speciesTable(world, ['especie', 'criatura']);
    expect(rows.find((r) => r.entity.name === 'Leviatã')!.altura).toBe(40);
    expect(speciesBlurb('Ondinos', { corpo: 'aquático', dieta: 'carnívoro', altura: '1,6' })).toMatch(/Ondinos são aquáticos de cerca de 1,6 m/);
    expect(speciesBlurb('Etéreos', { dieta: 'de magia' })).toContain('Alimentam-se de magia');
  });
});

describe('idiomas', () => {
  const salgado = world.entities.find((e) => e.name === 'Salgado')!;
  const lang = languageOf(salgado.name, salgado.props, texts['Mundos/Vael/Idiomas/Salgado.md']);

  it('o dicionário vence o sorteio, e o resto é sempre igual', () => {
    expect(lang.phon.id).toBe('sibilante');
    expect(wordFor(lang, 'mar')).toBe('ssira');
    expect(wordFor(lang, 'fogo')).toBe(wordFor(lang, 'fogo'));
    expect(wordFor(lang, 'fogo')).not.toBe(wordFor(lang, 'água'));
  });

  it('traduz palavra a palavra, pulando artigos', () => {
    const tr = translate(lang, 'O mar e o fogo');
    expect(tr.map((x) => x.from)).toEqual(['mar', 'fogo']);
    expect(tr[0]!.to).toBe('ssira');
  });

  it('nomes de lugar significam algo', () => {
    const p = languagePlaces(lang, 4, seededRng(2));
    expect(p.length).toBe(4);
    for (const x of p) expect(x.sentido).toMatch(/^[A-ZÁ-Ú]/);
  });

  it('acrescenta ao dicionário sem perder o que havia', () => {
    const t = addToDictionary(texts['Mundos/Vael/Idiomas/Salgado.md']!, [{ palavra: 'vesh', significado: 'fogo' }]);
    const d = readDictionary(t);
    expect(d.map((r) => r.palavra).sort()).toEqual(['ssira', 'vesh']);
    expect(d.find((r) => r.palavra === 'ssira')!.classe).toBe('substantivo');
  });
});

describe('guia', () => {
  it('checklists ficam na nota como tarefas do markdown', () => {
    const item = CHECKLISTS[0]!.itens[0]!;
    let t = note('tipo: mundo', '# Vael\n\nTexto.\n');
    t = toggleCheck(t, item, true);
    expect(t).toContain(`- [x] ${item}`);
    expect(readChecks(t).has(item)).toBe(true);
    t = toggleCheck(t, item, false);
    expect(readChecks(t).has(item)).toBe(false);
    expect(t).toContain(`- [ ] ${item}`);
    expect(t).toContain('Texto.');
  });

  it('próximos passos olham o que falta', () => {
    const p = proximosPassos(world, elementCoverage(world));
    expect(p.length).toBeGreaterThan(0);
    expect(p.some((x) => x.acao === 'criar' && x.tipo === 'mapa')).toBe(true);
    // já tem idioma e história: não sugere de novo
    expect(p.some((x) => x.acao === 'aba' && x.aba === 'escrita')).toBe(false);
  });

  it('as dicas têm tema, título e texto', () => {
    expect(DICAS.length).toBeGreaterThan(20);
    for (const d of DICAS) expect(d.tema && d.titulo && d.texto.length > 20).toBeTruthy();
  });
});

describe('fichas de fé, magia, livros, feitos, profecias e planos', () => {
  const n = (t: string) => worldIndex([{ path: 'Mundos/Z/x.md', text: `---\ntipo: ${t}\nmundo: Z\n---\n` }])[0]!.entities[0]!.type;

  it('reconhece os tipos e seus apelidos', () => {
    expect(n('religião')).toBe('religiao');
    expect(n('fé')).toBe('religiao');
    expect(n('livro')).toBe('livro');
    expect(n('grimório')).toBe('livro');
    expect(n('magia')).toBe('magia');
    expect(n('façanha')).toBe('feito');
    expect(n('profecia')).toBe('profecia');
    expect(n('dimensão')).toBe('plano');
    expect(n('romance')).toBe('historia');
  });

  it('cada tipo novo tem campos, seções e perguntas para aprofundar', () => {
    for (const t of ['religiao', 'feito', 'livro', 'magia', 'profecia', 'plano']) {
      const info = typeInfo(t);
      expect(info.fields.length).toBeGreaterThan(2);
      expect(info.sections.length).toBeGreaterThan(2);
      expect(DEEP_QUESTIONS[t]!.length).toBeGreaterThan(3);
    }
  });

  it('toda religião, magia ou plano conta na tabela de elementos, mesmo sem palavra-chave', () => {
    const w = worldIndex([
      { path: 'Mundos/Z/Religiões/Os Velados.md', text: '---\ntipo: religião\nmundo: Z\n---\n' },
      { path: 'Mundos/Z/Magias/Cantochão.md', text: '---\ntipo: magia\nmundo: Z\n---\n' },
      { path: 'Mundos/Z/Planos/O Fundo.md', text: '---\ntipo: plano\nmundo: Z\nnatureza: subterrâneo\n---\n' },
    ])[0]!;
    const cov = elementCoverage(w);
    const lv = (id: string) => cov.find((c) => c.element.id === id)!.level;
    expect(lv('religioes')).not.toBe('vazio');
    expect(lv('magia')).not.toBe('vazio');
    expect(lv('outros-planos')).not.toBe('vazio');
    expect(lv('feitos')).toBe('vazio');
  });
});
