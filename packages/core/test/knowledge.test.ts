import { describe, expect, it } from 'vitest';
import { ensureBlockId, noteSection, retargetLinks, scanNote, VaultIndex } from '../src/knowledge';
import { highlightRanges, parseQuery, searchVault } from '../src/search';

const vault = (notes: Record<string, string>, files: string[] = []) => {
  const ix = new VaultIndex();
  for (const [p, t] of Object.entries(notes)) ix.set(p, t);
  ix.setFiles(files);
  return ix;
};

describe('leitura de uma nota', () => {
  it('acha links, embeds, tags, apelidos, títulos, blocos e tarefas, ignorando código', () => {
    const s = scanNote([
      '---',
      'aliases: [TE, Motor]',
      'tags: [projeto, app/pessoal]',
      'dono: "[[Ana]]"',
      '---',
      '# Tanden',
      'Ver [[Ideias|as ideias]] e ![[foto.png|300]] e [doc](Docs/Guia%20r%C3%A1pido.md#Parte).',
      '```js',
      '// [[NaoConta]] #naoconta',
      '```',
      'Texto com #inline e `#codigo` e $#formula$ e %% #comentario [[Oculto]] %%.',
      '- [ ] comprar pão #compras',
      '- [x] feito ^tarefa1',
      'url http://x.com/#ancora e #2024 não.',
      '$$',
      '#dentro_da_formula',
      '$$',
    ].join('\n'));
    expect(s.aliases).toEqual(['TE', 'Motor']);
    expect(s.tags.sort()).toEqual(['app/pessoal', 'compras', 'inline', 'projeto']);
    expect(s.links.map((l) => [l.target, l.embed, l.kind])).toEqual([
      ['Ana', false, 'prop'],
      ['Ideias', false, 'wiki'],
      ['foto.png', true, 'wiki'],
      ['Docs/Guia rápido.md', false, 'md'],
    ]);
    expect(s.links[1]!.alias).toBe('as ideias');
    expect(s.links[3]!.sub).toBe('Parte');
    expect(s.headings).toEqual([{ level: 1, text: 'Tanden', line: 5 }]);
    expect(s.blocks).toEqual([{ id: 'tarefa1', line: 12 }]);
    expect(s.tasks.map((t) => [t.done, t.text])).toEqual([[false, 'comprar pão #compras'], [true, 'feito ^tarefa1']]);
  });
});

describe('trechos de nota', () => {
  const text = ['# A', 'texto a', '## B', 'texto b', '### C', 'texto c', '## D', 'parágrafo um', 'continua aqui ^p1', '', '- item ^li', '  - filho', '- outro', '', '| x | y |', '|---|---|', '| 1 | 2 |', '', '^tab'].join('\n');
  it('pega um título com os subtítulos, até o próximo do mesmo nível', () => {
    expect(noteSection(text, 'B')).toBe('## B\ntexto b\n### C\ntexto c');
    expect(noteSection(text, 'A#B#C')).toBe('### C\ntexto c');
    expect(noteSection(text, 'Nada')).toBeNull();
  });
  it('pega blocos: parágrafo, item com filhos e tabela com id embaixo', () => {
    expect(noteSection(text, '^p1')).toBe('parágrafo um\ncontinua aqui');
    expect(noteSection(text, '^li')).toBe('- item\n  - filho');
    expect(noteSection(text, '^tab')).toBe('| x | y |\n|---|---|\n| 1 | 2 |');
  });
  it('cria um id de bloco quando falta, sem duplicar', () => {
    const r = ensureBlockId('linha um\nlinha dois', 1);
    expect(r.text).toBe(`linha um\nlinha dois ^${r.id}`);
    expect(ensureBlockId(r.text, 1)).toEqual(r);
    const t = ensureBlockId('| a |\n| - |\n| 1 |\ndepois', 0);
    expect(t.text).toBe(`| a |\n| - |\n| 1 |\n\n^${t.id}\ndepois`);
  });
});

describe('índice do cofre', () => {
  const ix = vault({
    'Projetos/Tanden.md': '---\naliases: [TE]\ntags: [projeto/app]\n---\nLiga [[Ideias]] e [[Pessoas/Ana|Ana]] e [[Fantasma]].\n```\n[[Ideias]]\n```\n',
    'Ideias.md': 'Sobre [[TE]] e [[Tanden#Seção]]. Tanden sem link. ![[foto.png]]\n#projeto',
    'Pessoas/Ana.md': '---\nempresa: "[[Tanden]]"\n---\nAna.',
    'Solta.md': 'nada aqui. Fala do tanden sem link.',
    'Outra/Funda/Tanden.md': 'homônima mais funda',
  }, ['Anexos/foto.png']);

  it('resolve como o Obsidian, com apelidos e caminhos parciais', () => {
    expect(ix.resolve('Tanden')).toBe('Projetos/Tanden.md');
    expect(ix.resolve('Funda/Tanden')).toBe('Outra/Funda/Tanden.md');
    expect(ix.resolve('te')).toBe('Projetos/Tanden.md');
    expect(ix.resolve('foto.png')).toBe('Anexos/foto.png');
    expect(ix.resolve('Ana#x|y')).toBe('Pessoas/Ana.md');
    expect(ix.resolve('Nada')).toBeNull();
  });

  it('backlinks com as linhas, incluindo propriedades e apelidos', () => {
    const back = ix.backlinks('Projetos/Tanden.md');
    expect(back.map((b) => b.path)).toEqual(['Ideias.md', 'Pessoas/Ana.md']);
    expect(back[0]!.lines).toEqual([{ n: 0, text: 'Sobre [[TE]] e [[Tanden#Seção]]. Tanden sem link. ![[foto.png]]', embed: false }]);
    expect(back[1]!.lines[0]!.n).toBe(1);
    expect(ix.outgoing('Projetos/Tanden.md')).toEqual(['Ideias.md', 'Pessoas/Ana.md']);
  });

  it('links sem nota, órfãs, tags com pais e menções sem link', () => {
    expect(ix.unresolved()).toEqual([{ target: 'Fantasma', from: ['Projetos/Tanden.md'] }]);
    expect(ix.orphans()).toEqual(['Outra/Funda/Tanden.md', 'Solta.md']);
    expect(ix.tags()).toEqual([{ tag: 'projeto', count: 1 }, { tag: 'projeto/app', count: 1 }]);
    expect(ix.tags({ parents: true })).toEqual([{ tag: 'projeto', count: 2 }, { tag: 'projeto/app', count: 1 }]);
    expect(ix.withTag('#projeto')).toEqual(['Ideias.md', 'Projetos/Tanden.md']);
    expect(ix.unlinkedMentions('Projetos/Tanden.md').map((u) => u.path)).toEqual(['Solta.md']);
  });

  it('só relê o que mudou', () => {
    const v = ix.version;
    expect(ix.sync(ix.paths(), (p) => ix.text(p))).toBe(false);
    expect(ix.version).toBe(v);
    ix.set('Solta.md', 'agora liga [[Ideias]]');
    expect(ix.orphans()).toEqual(['Outra/Funda/Tanden.md']);
    expect(ix.backlinkCount('Ideias.md')).toBe(2);
    ix.delete('Solta.md');
    expect(ix.backlinkCount('Ideias.md')).toBe(1);
  });
});

describe('renomear links', () => {
  it('troca wiki e Markdown, mantém seção, apelido e embed', () => {
    const text = 'a [[Velha]] b [[velha#Sec|ap]] c ![[Velha]] d [[Outra]] e [x](Pasta/Velha.md#t) f [y](https://Velha.md)';
    const isOld = (t: string) => ['velha', 'pasta/velha.md'].includes(t.toLowerCase());
    expect(retargetLinks(text, isOld, 'Nova Nota', 'Pasta/Nova Nota.md')).toBe(
      'a [[Nova Nota]] b [[Nova Nota#Sec|ap]] c ![[Nova Nota]] d [[Outra]] e [x](Pasta/Nova%20Nota.md#t) f [y](https://Velha.md)',
    );
  });
});

describe('busca', () => {
  const ix = vault({
    'Receitas/Bolo de cenoura.md': '---\ntipo: receita\nnota: 5\n---\n# Bolo\nCenoura, açúcar e farinha.\n- [ ] comprar cenoura\n#cozinha',
    'Mercado.md': 'Lista: cenoura e café.\n- [x] comprar café',
    'Trabalho/Reunião.md': '# Pauta\nDiscutir orçamento #trabalho/rh',
  });

  it('entende os operadores', () => {
    const q = parseQuery('cenoura -café "açúcar e" tag:#cozinha path:receitas [tipo:receita] OR /orç.mento/');
    expect(q.groups).toHaveLength(2);
    expect(q.groups[0]!.map((t) => t.kind)).toEqual(['text', 'text', 'text', 'tag', 'path', 'prop']);
    expect(q.groups[0]![1]!.neg).toBe(true);
    expect(q.groups[1]![0]!.kind).toBe('regex');
  });

  it('acha por texto sem acento, com o nome primeiro', () => {
    const r = searchVault(ix, 'cenoura');
    expect(r.map((h) => h.path)).toEqual(['Receitas/Bolo de cenoura.md', 'Mercado.md']);
    expect(r[0]!.reason).toBe('name');
    expect(searchVault(ix, 'acucar').map((h) => h.path)).toEqual(['Receitas/Bolo de cenoura.md']);
  });

  it('filtra por tag, pasta, propriedade, tarefa, exclusão e OR', () => {
    expect(searchVault(ix, '#trabalho').map((h) => h.path)).toEqual(['Trabalho/Reunião.md']);
    expect(searchVault(ix, 'cenoura -café').map((h) => h.path)).toEqual(['Receitas/Bolo de cenoura.md']);
    expect(searchVault(ix, '[nota:5]').map((h) => h.path)).toEqual(['Receitas/Bolo de cenoura.md']);
    expect(searchVault(ix, 'afazer:comprar').map((h) => h.path)).toEqual(['Receitas/Bolo de cenoura.md']);
    expect(searchVault(ix, 'feita:café').map((h) => h.path)).toEqual(['Mercado.md']);
    expect(searchVault(ix, 'orçamento OU farinha').map((h) => h.path).sort()).toEqual(['Receitas/Bolo de cenoura.md', 'Trabalho/Reunião.md']);
    expect(searchVault(ix, 'pasta:trabalho pauta')[0]!.lines).toEqual([{ n: 0, text: '# Pauta' }]);
  });

  it('marca os trechos para destacar', () => {
    expect(highlightRanges('Cenoura e cenoura', 'cenoura')).toEqual([[0, 7], [10, 17]]);
    expect(highlightRanges('Orçamento', 'orcamento')).toEqual([[0, 9]]);
  });
});
