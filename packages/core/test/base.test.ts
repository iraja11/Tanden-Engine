import { describe, expect, it } from 'vitest';
import {
  DB_TEMPLATES, Link, NoteIndex, createDatabase, evaluate, exprToSimple, fillTemplate, findBaseBlocks, instantiate, noteRecord,
  pageTree, parseBase, parseProps, replaceBaseBlock, runView, serializeBase, simpleToExpr, summarize, writeCell, display, baseFolder,
  type Scope, type Value,
} from '../src';

const scope = (vars: Record<string, Value>): Scope => ({ lookup: (n) => vars[n], now: new Date(2026, 9, 15, 10, 0) });

describe('expressões', () => {
  it('aritmética, comparações e lógica', () => {
    const s = scope({ a: 2, b: 3, nome: 'Tanden' });
    expect(evaluate('a + b * 2', s)).toBe(8);
    expect(evaluate('(a + b) * 2', s)).toBe(10);
    expect(evaluate('a > 1 && b < 3', s)).toBe(false);
    expect(evaluate('a > 1 || b < 3', s)).toBe(true);
    expect(evaluate('!(a == 2)', s)).toBe(false);
    expect(evaluate('a == 2 ? "dois" : "outro"', s)).toBe('dois');
    expect(evaluate('if(b > 2, "grande", "pequeno")', s)).toBe('grande');
    expect(evaluate('nome.lower().contains("tand")', s)).toBe(true);
    expect(evaluate('"Ação".contains("acao")', s)).toBe(true);
    expect(evaluate('10 / 4', s)).toBe(2.5);
    expect(evaluate('(10 / 3).round(2)', s)).toBe(3.33);
  });

  it('erros viram valor, não exceção', () => {
    const s = scope({});
    expect(String(evaluate('1 +', s))).toMatch(/#erro/);
    expect(String(evaluate('foo()', s))).toMatch(/desconhecida/);
    expect(String(evaluate('1 / 0', s))).toMatch(/zero/);
  });

  it('datas e durações', () => {
    const s = scope({ d: new Date(2026, 9, 10) });
    expect((evaluate('d + "7d"', s) as Date).getDate()).toBe(17);
    expect((evaluate('d + "1M"', s) as Date).getMonth()).toBe(10);
    expect(evaluate('d < today()', s)).toBe(true);
    expect(evaluate('d.format("DD/MM/YYYY")', s)).toBe('10/10/2026');
    expect(evaluate('days(d)', s)).toBe(5);
    expect(evaluate('d.relative()', s)).toBe('há 5 dias');
    expect(evaluate('date("2026-10-15") == today()', s)).toBe(true);
  });

  it('listas, filter e map com value', () => {
    const s = scope({ l: [1, 2, 3, 4], tags: ['a', 'b'] });
    expect(evaluate('l.sum()', s)).toBe(10);
    expect(evaluate('l.filter(value > 2).length', s)).toBe(2);
    expect(evaluate('l.map(value * 10).max()', s)).toBe(40);
    expect(evaluate('tags.contains("b")', s)).toBe(true);
    expect(evaluate('tags.join(" / ")', s)).toBe('a / b');
    expect(evaluate('progress([true, false, true, true])', s)).toBe(0.75);
    expect(evaluate('"★".repeat(3)', s)).toBe('★★★');
  });
});

const NOTES: Record<string, string> = {
  'Tarefas.md': '---\ntipo: banco\n---\n# Tarefas\n\n```base\nfilters:\n  and:\n    - file.inFolder("Tarefas")\nviews:\n  - type: table\n    name: Tabela\n```\n',
  'Tarefas/Comprar pão.md': '---\nstatus: A fazer\nhoras: 1\nprazo: 2026-10-14\nprojeto: "[[Casa]]"\n---\n# Comprar pão\n#urgente\n',
  'Tarefas/Escrever relatório.md': '---\nstatus: Feito\nhoras: 5\nprazo: 2026-10-20\nprojeto: "[[Trabalho]]"\n---\nTexto ![[capa.png]]',
  'Tarefas/Ler artigo.md': '---\nstatus: Em andamento\nhoras: 2\ntags: [estudo]\nprojeto: "[[Trabalho]]"\n---\n',
  'Projetos/Trabalho.md': '---\nárea: Empresa\n---\n# Trabalho\n',
  'Projetos/Casa.md': '---\nárea: Pessoal\n---\n',
  'Solta.md': 'nada aqui [[Comprar pão]]',
};
const index = () => new NoteIndex(Object.entries(NOTES).map(([p, t]) => noteRecord(p, t)));

describe('bancos', () => {
  it('lê e regrava o bloco sem perder chaves desconhecidas', () => {
    const src = 'filters:\n  and:\n    - file.inFolder("X")\nextra: 1\nviews:\n  - type: cards\n    name: Galeria\n    image: note.capa\n    algo: sim\n';
    const { def, error } = parseBase(src);
    expect(error).toBeNull();
    expect(def.views[0]!.image).toBe('note.capa');
    const out = serializeBase(def);
    expect(out).toContain('extra: 1');
    expect(out).toContain('algo: sim');
    expect(out).toContain('image: capa');
    expect(parseBase(out).def).toEqual(def);
  });

  it('YAML quebrado não derruba', () => {
    const { def, error } = parseBase('views: [\n  - a: ');
    expect(error).toBeTruthy();
    expect(def.views).toHaveLength(1);
  });

  it('acha e troca blocos base, pulando outros blocos de código', () => {
    const text = '# x\n```js\n```base\n```\n```base\nviews: []\n```\ntexto\n~~~base\nfoo: 1\n~~~\n';
    const blocks = findBaseBlocks(text);
    expect(blocks.map((b) => b.source)).toEqual(['views: []', 'foo: 1']);
    const t2 = replaceBaseBlock(text, 1, 'bar: 2\n');
    expect(t2).toContain('~~~base\nbar: 2\n~~~');
    expect(t2).toContain('```base\nviews: []\n```');
  });

  it('filtra, ordena, calcula fórmulas e rollups', () => {
    const { def } = parseBase(`filters:
  and:
    - file.inFolder("Tarefas")
formulas:
  dobro: horas * 2
  area: projeto.área
  atrasada: prazo < today() && status != "Feito"
properties:
  horas:
    type: number
views:
  - type: table
    name: T
    sort:
      - property: horas
        direction: DESC
    filters:
      and:
        - status != "Feito"
`);
    const r = runView(def, def.views[0]!, index(), { now: new Date(2026, 9, 15) });
    expect(r.rows.map((x) => x.rec.name)).toEqual(['Ler artigo', 'Comprar pão']);
    expect(r.rows[0]!.get('formula.dobro')).toBe(4);
    expect(r.rows[1]!.get('formula.area')).toBe('Pessoal');
    expect(r.rows[1]!.get('formula.atrasada')).toBe(true);
    expect(r.rows[0]!.get('formula.atrasada')).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it('agrupa na ordem das opções e mostra grupos vazios', () => {
    const { def } = parseBase(`filters: 'file.inFolder("Tarefas")'
properties:
  status:
    type: status
    options:
      - value: A fazer
      - value: Em andamento
      - value: Feito
      - value: Cancelado
views:
  - type: board
    name: Q
    groupBy:
      property: status
      direction: ASC
`);
    const r = runView(def, def.views[0]!, index());
    expect(r.groups!.map((g) => [g.label, g.rows.length])).toEqual([['A fazer', 1], ['Em andamento', 1], ['Feito', 1], ['Cancelado', 0]]);
  });

  it('tags, links, backlinks e capa', () => {
    const idx = index();
    const { def } = parseBase('views: [{ type: table, name: T }]');
    const r = runView(def, { type: 'table', name: 'T', filters: 'file.hasTag("urgente") || file.hasTag("estudo")' }, idx);
    expect(r.rows.map((x) => x.rec.name).sort()).toEqual(['Comprar pão', 'Ler artigo']);
    const pao = runView(def, { type: 'table', name: 'T', filters: 'file.name == "Comprar pão"' }, idx).rows[0]!;
    expect((pao.get('file.backlinks') as Link[]).map((l) => l.target)).toEqual(['Solta']);
    expect(idx.byPath.get('Tarefas/Escrever relatório.md')!.image).toBe('capa.png');
    const linked = runView(def, { type: 'table', name: 'T', filters: 'file.hasLink("Trabalho")' }, idx);
    expect(linked.rows).toHaveLength(2);
  });

  it('tarefas da página viram progresso e o resolvedor do app acha apelidos', () => {
    const recs = [
      noteRecord('P/Alfa.md', '---\naliases: [A1]\n---\n- [x] um\n- [ ] dois\n- [-] cancelada\n- [ ] \n```\n- [ ] no código\n```'),
      noteRecord('P/Beta.md', 'Liga [[A1]]'),
    ];
    const idx = new NoteIndex(recs, (t) => (t.toLowerCase() === 'a1' ? 'P/Alfa.md' : null));
    const { def } = parseBase('formulas:\n  pct: if(file.tasks > 0, file.tasksDone / file.tasks, 0)\nviews: [{ type: table, name: T }]');
    const rows = runView(def, def.views[0]!, idx).rows;
    const alfa = rows.find((r) => r.rec.name === 'Alfa')!;
    expect([alfa.get('file.tasks'), alfa.get('file.tasksDone'), alfa.get('file.progress'), alfa.get('formula.pct')]).toEqual([2, 1, 0.5, 0.5]);
    expect((alfa.get('file.backlinks') as Link[]).map((l) => l.target)).toEqual(['P/Beta']);
  });

  it('this aponta para a nota do bloco', () => {
    const notes = { ...NOTES, 'Projetos/Trabalho.md': '---\nárea: Empresa\n---\n```base\nfilters: projeto == this\nviews: [{type: table, name: T}]\n```' };
    const idx = new NoteIndex(Object.entries(notes).map(([p, t]) => noteRecord(p, t)));
    const { def } = parseBase('filters: projeto == this\nviews: [{type: table, name: T}]');
    const r = runView(def, def.views[0]!, idx, { thisPath: 'Projetos/Trabalho.md' });
    expect(r.rows.map((x) => x.rec.name).sort()).toEqual(['Escrever relatório', 'Ler artigo']);
  });

  it('resumos do rodapé', () => {
    expect(summarize('Sum', [1, 2, null, 3])).toBe(6);
    expect(summarize('Average', [1, 2, 3])).toBe(2);
    expect(summarize('Empty', [1, null, ''])).toBe(2);
    expect(summarize('PercentChecked', [true, false, true, true])).toBe('75%');
    expect(summarize('Unique', [['a', 'b'], ['b'], 'c'])).toBe(3);
  });

  it('grava células no topo da nota com o tipo certo', () => {
    let t = '---\nstatus: A fazer\n---\ncorpo';
    t = writeCell(t, 'note.status', 'Feito');
    t = writeCell(t, 'note.feito', true, { type: 'checkbox' });
    t = writeCell(t, 'note.prazo', new Date(2026, 0, 5), { type: 'date' });
    t = writeCell(t, 'note.projeto', [new Link('Casa')], { type: 'relation' });
    t = writeCell(t, 'formula.x', 3);
    expect(parseProps(t)).toEqual({ status: 'Feito', feito: 'true', prazo: '2026-01-05', projeto: ['[[Casa]]'] });
    expect(t.endsWith('corpo')).toBe(true);
    t = writeCell(t, 'note.status', null);
    expect(parseProps(t).status).toBeUndefined();
  });

  it('formata números', () => {
    expect(display(1234.5, { type: 'number', format: 'real:2' })).toMatch(/R\$\s?1\.234,50/);
    expect(display(0.4, { type: 'number', format: 'percent' })).toBe('40%');
  });

  it('filtros simples vão e voltam como expressão', () => {
    for (const f of [
      { prop: 'note.status', op: 'is', value: 'Feito' },
      { prop: 'note.horas', op: 'gt', value: '3' },
      { prop: 'note.último contato', op: 'empty', value: '' },
      { prop: 'file.name', op: 'contains', value: 'pão' },
      { prop: 'note.feito', op: 'checked', value: '' },
      { prop: 'note.prazo', op: 'next7', value: '' },
      { prop: 'formula.x', op: 'isnt', value: 'a"b' },
    ] as const) {
      expect(exprToSimple(simpleToExpr(f))).toEqual(f);
    }
    expect(exprToSimple('a + b > c')).toBeNull();
  });

  it('modelos de banco geram bancos que funcionam', () => {
    for (const tpl of DB_TEMPLATES) {
      const { note, files } = createDatabase(tpl.name, 'Bancos', tpl, new Date(2026, 9, 15));
      const [block] = findBaseBlocks(note);
      const { def, error } = parseBase(block!.source);
      expect(error).toBeNull();
      expect(baseFolder(def)).toBe(`Bancos/${tpl.name}`);
      const idx = new NoteIndex([noteRecord(`Bancos/${tpl.name}.md`, note), ...files.map((f) => noteRecord(f.path, f.text))]);
      for (const v of def.views) {
        const r = runView(def, v, idx, { thisPath: `Bancos/${tpl.name}.md`, now: new Date(2026, 9, 15) });
        expect(r.errors, `${tpl.name}/${v.name}`).toEqual([]);
        for (const row of r.rows) for (const c of [...(v.order ?? []), ...Object.keys(def.formulas ?? {}).map((f) => `formula.${f}`)]) {
          expect(String(row.get(c)), `${tpl.name} ${c}`).not.toMatch(/#erro/);
        }
      }
      expect(runView(def, def.views[0]!, idx).total).toBe((tpl.samples ?? []).length);
    }
  });

  it('modelos de página aplicam variáveis e soltam o banco', () => {
    const now = new Date(2026, 9, 15, 9, 5);
    expect(fillTemplate('# {{title}} {{date}} {{time}} {{date:DD/MM}} {{date:dddd}}', { title: 'X', now })).toBe('# X 2026-10-15 09:05 15/10 quinta');
    const t = instantiate('---\nmodelo-para: "[[Leituras]]"\nstatus: Lendo\n---\n# {{title}}', 'Duna', now);
    expect(parseProps(t)).toEqual({ status: 'Lendo' });
    expect(t).toContain('# Duna');
  });
});

describe('páginas aninhadas', () => {
  it('nota com pasta de mesmo nome vira mãe das subpáginas', () => {
    const tree = pageTree(['Projetos.md', 'Projetos/A.md', 'Projetos/B.md', 'Projetos/B/C.md', 'Pasta/D.md', 'Z.md']);
    const simple = (ns: ReturnType<typeof pageTree>): unknown => ns.map((n) => [n.name, n.path, simple(n.children)]);
    expect(simple(tree)).toEqual([
      ['Pasta', null, [['D', 'Pasta/D.md', []]]],
      ['Projetos', 'Projetos.md', [['A', 'Projetos/A.md', []], ['B', 'Projetos/B.md', [['C', 'Projetos/B/C.md', []]]]]],
      ['Z', 'Z.md', []],
    ]);
  });
});
