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
