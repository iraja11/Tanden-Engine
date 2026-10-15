import { describe, expect, it } from 'vitest';
import { buildNoteGraph, extractLinks, ForceLayout, LinkResolver, neighborhood } from '../src/graph';

describe('links das notas', () => {
  it('acha [[links]], embeds, links Markdown e tags, ignorando código', () => {
    const l = extractLinks([
      '---',
      'tags: [projeto, ideia]',
      'autor: "[[Fulano]]"',
      '---',
      'Ver [[Outra nota|apelido]] e [[Pasta/Nota#Seção]].',
      '![[foto.png]] e [link](Docs/Guia%20rápido.md) e [site](https://x.com)',
      'Tags #estudo/cálculo e #2024 não; email a#b não.',
      '```',
      '[[Dentro do código]] #nao',
      '```',
      'Trecho `[[também não]]`.',
    ].join('\n'));
    expect(l.links.sort()).toEqual(['Docs/Guia rápido.md', 'Fulano', 'Outra nota', 'Pasta/Nota'].sort());
    expect(l.embeds).toEqual(['foto.png']);
    expect(l.tags.sort()).toEqual(['estudo/cálculo', 'ideia', 'projeto']);
  });

  it('resolve como o Obsidian: caminho exato ou o nome de caminho mais curto', () => {
    const r = new LinkResolver(['a/b/Nota.md', 'Nota.md', 'x/Outra.md', 'Anexos/foto.png', 'p/Pasta/Coisa.md']);
    expect(r.resolve('Nota')).toBe('Nota.md');
    expect(r.resolve('a/b/Nota')).toBe('a/b/Nota.md');
    expect(r.resolve('outra')).toBe('x/Outra.md');
    expect(r.resolve('foto.png')).toBe('Anexos/foto.png');
    expect(r.resolve('Pasta/Coisa')).toBe('p/Pasta/Coisa.md');
    expect(r.resolve('Nada')).toBeNull();
  });

  it('monta o grafo com tags, links sem nota e anexos quando pedido', () => {
    const notes = [
      { path: 'A.md', text: '[[B]] [[C]] [[Fantasma]] ![[foto.png]] #tag' },
      { path: 'Pasta/B.md', text: '[[A]] #tag' },
      { path: 'C.md', text: '' },
      { path: 'Solta.md', text: 'sem links' },
    ];
    const g = buildNoteGraph(notes);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(['A.md>C.md', 'A.md>Pasta/B.md', 'Pasta/B.md>A.md']);
    const full = buildNoteGraph(notes, { tags: true, missing: true, files: true, allPaths: ['Anexos/foto.png'] });
    const kinds = Object.fromEntries(full.nodes.map((n) => [n.id, n.kind]));
    expect(kinds['#tag']).toBe('tag');
    expect(kinds['?fantasma']).toBe('missing');
    expect(kinds['Anexos/foto.png']).toBe('file');
    expect(full.nodes.find((n) => n.id === '#tag')!.in).toBe(2);
    expect([...neighborhood(g, 'C.md', 1)].sort()).toEqual(['A.md', 'C.md']);
    expect([...neighborhood(g, 'C.md', 2)].sort()).toEqual(['A.md', 'C.md', 'Pasta/B.md']);
  });
});

describe('layout de forças', () => {
  it('assenta: ligados ficam perto, soltos se afastam, sem NaN', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `n${i}`);
    // dois grupos de 20 em anel
    const edges: [string, string][] = [];
    for (let g = 0; g < 2; g++) for (let i = 0; i < 20; i++) edges.push([`n${g * 20 + i}`, `n${g * 20 + ((i + 1) % 20)}`]);
    const L = new ForceLayout();
    L.setGraph(ids, edges);
    L.run(400);
    expect(L.settled).toBe(true);
    for (let i = 0; i < 40; i++) expect(Number.isFinite(L.x[i]!) && Number.isFinite(L.y[i]!)).toBe(true);
    const d = (a: number, b: number) => Math.hypot(L.x[a]! - L.x[b]!, L.y[a]! - L.y[b]!);
    let linked = 0;
    for (const [a, b] of edges) linked += d(L.index.get(a)!, L.index.get(b)!);
    linked /= edges.length;
    expect(linked).toBeGreaterThan(30);
    expect(linked).toBeLessThan(140);
  });

  it('mantém quem já tinha lugar ao entrar um nó novo', () => {
    const L = new ForceLayout();
    L.setGraph(['a', 'b'], [['a', 'b']]);
    L.run();
    const ax = L.x[0]!;
    L.setGraph(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]);
    expect(L.x[L.index.get('a')!]).toBe(ax);
    expect(L.alpha).toBeLessThan(1);
  });

  it('é rápido com 5000 nós', () => {
    const n = 5000;
    const ids = Array.from({ length: n }, (_, i) => String(i));
    const edges: [string, string][] = [];
    for (let i = 1; i < n; i++) edges.push([String(i), String(Math.floor(Math.random() * i))]);
    const L = new ForceLayout();
    L.setGraph(ids, edges);
    const t0 = performance.now();
    for (let s = 0; s < 10; s++) L.tick();
    const per = (performance.now() - t0) / 10;
    expect(per).toBeLessThan(60);
    for (let i = 0; i < n; i += 97) expect(Number.isFinite(L.x[i]!)).toBe(true);
  });
});

import { boardFromGraph, graphQuery, mindMapFromNote, noteFromBoard } from '../src/graph';

describe('grafo e quadros conversam', () => {
  it('quadros entram no grafo ligados às notas que mostram', () => {
    const canvas = JSON.stringify({
      nodes: [
        { id: 'a', type: 'file', file: 'Projetos/Tanden.md', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', type: 'text', text: 'ver [[Ideias]] e ![[foto.png]]', x: 0, y: 0, width: 10, height: 10 },
        { id: 'c', type: 'link', url: 'https://x.com', x: 0, y: 0, width: 10, height: 10 },
      ],
      edges: [],
    });
    const g = buildNoteGraph(
      [
        { path: 'Projetos/Tanden.md', text: 'plano em [[Plano.canvas]]' },
        { path: 'Ideias.md', text: '' },
      ],
      { boards: [{ path: 'Quadros/Plano.canvas', text: canvas }], files: true, allPaths: ['Anexos/foto.png'] },
    );
    const board = g.nodes.find((n) => n.id === 'Quadros/Plano.canvas')!;
    expect(board.kind).toBe('board');
    expect(board.label).toBe('Plano');
    expect(g.edges.map((e) => `${e.from}>${e.to}:${e.kind}`).sort()).toEqual([
      'Projetos/Tanden.md>Quadros/Plano.canvas:link',
      'Quadros/Plano.canvas>Anexos/foto.png:link',
      'Quadros/Plano.canvas>Ideias.md:link',
      'Quadros/Plano.canvas>Projetos/Tanden.md:embed',
    ]);
    // .canvas quebrado não derruba o grafo
    expect(() => buildNoteGraph([], { boards: [{ path: 'x.canvas', text: '{' }] })).not.toThrow();
  });

  it('busca do grafo: path:, tag:, #tag, file:, negação e aspas', () => {
    const n = (id: string, tags: string[] = []) => ({ id, label: id.split('/').pop()!.replace('.md', ''), tags, kind: 'note' as const });
    const a = n('Mundos/Aurath/Veyra.md', ['lugar']);
    const b = n('Projetos/Tanden.md', ['estudo/cálculo']);
    const c = n('Diário/2026-10-15.md');
    expect(graphQuery('path:mundos')(a)).toBe(true);
    expect(graphQuery('path:"Mundos/Aurath"')(a)).toBe(true);
    expect(graphQuery('tag:#estudo')(b)).toBe(true);
    expect(graphQuery('#estudo/calculo')(b)).toBe(true);
    expect(graphQuery('#estudo/calc')(b)).toBe(false);
    expect(graphQuery('file:veyra')(a)).toBe(true);
    expect(graphQuery('-path:diário')(c)).toBe(false);
    expect(graphQuery('tanden -tag:lugar')(b)).toBe(true);
    expect(graphQuery('')(a)).toBe(false);
  });

  it('um pedaço do grafo vira um quadro sem cartões sobrepostos', () => {
    const items = [
      { id: 'A.md', label: 'A', kind: 'note' as const, x: 0, y: 0 },
      { id: 'B.md', label: 'B', kind: 'note' as const, x: 30, y: 0 },
      { id: '#tag', label: '#tag', kind: 'tag' as const, x: 0, y: 30 },
      { id: '?nada', label: 'Nada', kind: 'missing' as const, x: -30, y: 0 },
    ];
    const b = boardFromGraph(items, [{ from: 'A.md', to: 'B.md' }, { from: 'A.md', to: '#tag' }, { from: 'A.md', to: 'B.md' }, { from: 'X', to: 'A.md' }], { center: 'A.md' });
    expect(b.nodes.map((n) => n.type)).toEqual(['file', 'file', 'text', 'text']);
    expect(b.nodes[0]!.color).toBe('1');
    expect(b.nodes[3]!.text).toBe('[[Nada]]');
    expect(b.edges).toHaveLength(2);
    const [a, bb] = b.nodes;
    expect(Math.abs(a!.x - bb!.x)).toBeGreaterThanOrEqual(260);
    expect(new Set(b.nodes.map((n) => n.id)).size).toBe(4);
  });

  it('nota vira mapa mental e mapa vira nota', () => {
    const md = ['---', 'tipo: plano', '---', '# Viagem', 'intro solta', '## Antes', '- passaporte', '  - foto 3x4', '- [ ] reservar hotel', '## Durante', '1. museu', '```', '# não é título', '```'].join('\n');
    const m = mindMapFromNote('Viagem', md);
    const text = (id: string) => m.nodes.find((n) => n.id === id)!.text;
    const parentOf = (t: string) => {
      const id = m.nodes.find((n) => n.text === t)!.id;
      return text(m.edges.find((e) => e.toNode === id)!.fromNode);
    };
    expect(m.nodes.map((n) => n.text)).toEqual(['Viagem', 'Antes', 'passaporte', 'foto 3x4', 'reservar hotel', 'Durante', 'museu']);
    expect(parentOf('Antes')).toBe('Viagem');
    expect(parentOf('foto 3x4')).toBe('passaporte');
    expect(parentOf('reservar hotel')).toBe('Antes');
    expect(parentOf('museu')).toBe('Durante');
    // galhos da raiz dos dois lados
    const antes = m.nodes.find((n) => n.text === 'Antes')!;
    const durante = m.nodes.find((n) => n.text === 'Durante')!;
    expect(Math.sign(antes.x)).not.toBe(Math.sign(durante.x));

    const back = noteFromBoard(m, 'raiz');
    expect(back).toBe('# Viagem\n\n## Antes\n\n- passaporte\n  - foto 3x4\n- reservar hotel\n\n## Durante\n\n- museu\n');
  });

  it('quadro com cartões de nota e caixas soltas vira nota com links', () => {
    const out = noteFromBoard({
      nodes: [
        { id: 'r', type: 'text', text: '# Tema', x: 0, y: 0, width: 1, height: 1 },
        { id: 'f', type: 'file', file: 'Pasta/Leitura.md', x: 0, y: 50, width: 1, height: 1 },
        { id: 's', type: 'text', text: 'solta', x: 0, y: 99, width: 1, height: 1 },
      ],
      edges: [{ id: 'e', fromNode: 'r', toNode: 'f' }],
    });
    expect(out).toBe('# Tema\n\n## [[Pasta/Leitura]]\n\n## Soltos\n\n- solta\n');
  });
});
