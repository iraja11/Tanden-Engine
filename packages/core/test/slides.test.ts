import { describe, expect, it } from 'vitest';
import { DOMParser } from 'linkedom';
import { strFromU8, unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import {
  LOOK_NUCLEO,
  convertToNote,
  deckFromImported,
  deckFromNote,
  deckFromPdf,
  deckToPdf,
  deckToPptx,
  isDeck,
  parseDeck,
  slideAtLine,
  slideModel,
  winAnsi,
} from '../src/index';

const parse = (t: string, type: 'text/html' | 'application/xml') => new DOMParser().parseFromString(t, type === 'application/xml' ? 'text/xml' : type) as unknown as Document;

const DECK = `---
tipo: apresentação
transição: deslizar
---

# Fundamentos de Rust
Para quem vem de C++

---

## Por que Rust

- **Memória** segura sem coletor
- Concorrência sem medo
  - o compilador ajuda
- [Livro](https://doc.rust-lang.org/book/)

> [!note] Notas do apresentador
> Lembrar de mostrar o borrow checker.
> Perguntar quem já usou.

---

## Código

\`\`\`rust
fn main() {
    println!("olá");
}
---
\`\`\`

---

## Comparação

| Linguagem | GC |
| --- | --- |
| Rust | não |
| Go | sim |

---

## Diagrama

![[Anexos/arq.png]]

---

## Arquitetura

![[Anexos/arq.png]]

O núcleo fala com a interface por eventos.

notas:
Isto também é nota do apresentador.
`;

describe('apresentações: leitura', () => {
  it('separa slides por --- e ignora o --- dentro de código', () => {
    const d = parseDeck(DECK);
    expect(d.slides.map((s) => s.title)).toEqual(['Fundamentos de Rust', 'Por que Rust', 'Código', 'Comparação', 'Diagrama', 'Arquitetura']);
    expect(d.transition).toBe('deslizar');
    expect(d.title).toBe('Fundamentos de Rust');
    expect(d.slides[2]!.md).toContain('println!');
    expect(d.slides[2]!.md).toContain('---');
  });

  it('tira as notas do apresentador do slide (callout e "notas:")', () => {
    const d = parseDeck(DECK);
    expect(d.slides[1]!.notes).toBe('Lembrar de mostrar o borrow checker.\nPerguntar quem já usou.');
    expect(d.slides[1]!.md).not.toContain('borrow');
    expect(d.slides[5]!.notes).toBe('Isto também é nota do apresentador.');
    expect(d.slides[5]!.md).not.toContain('Isto também');
  });

  it('deduz o arranjo de cada slide', () => {
    expect(parseDeck(DECK).slides.map((s) => s.layout)).toEqual(['capa', 'conteúdo', 'conteúdo', 'conteúdo', 'imagem', 'dividido']);
    expect(parseDeck('## Só uma seção').slides[0]!.layout).toBe('seção');
  });

  it('sem ---, cada # ou ## começa um slide', () => {
    const d = parseDeck('# Título\nabertura\n\n## A\ntexto a\n\n### detalhe\nmais\n\n## B\ntexto b');
    expect(d.slides.map((s) => s.title)).toEqual(['Título', 'A', 'B']);
    expect(d.slides[1]!.md).toContain('### detalhe');
  });

  it('acha o slide da linha do cursor', () => {
    const d = parseDeck(DECK);
    const lines = DECK.split('\n');
    expect(slideAtLine(d, lines.indexOf('## Comparação'))).toBe(3);
    expect(slideAtLine(d, 0)).toBe(0);
  });

  it('reconhece apresentações pelo tipo ou pela pasta', () => {
    expect(isDeck('x.md', DECK)).toBe(true);
    expect(isDeck('Apresentações/aula.md', '# oi')).toBe(true);
    expect(isDeck('Notas/aula.md', '# oi')).toBe(false);
  });

  it('monta o modelo de blocos com estilos, listas e tabela', () => {
    const d = parseDeck(DECK);
    const m = slideModel(d.slides[1]!);
    expect(m.title?.map((r) => r.text).join('')).toBe('Por que Rust');
    const ps = m.blocks.filter((b) => b.t === 'p');
    expect(ps[0]).toMatchObject({ bullet: '•', level: 1 });
    expect(ps[0]!.t === 'p' && ps[0]!.runs[0]).toMatchObject({ text: 'Memória', b: true });
    expect(ps[2]).toMatchObject({ bullet: '•', level: 2 });
    expect(ps[3]!.t === 'p' && ps[3]!.runs[0]!.link).toBe('https://doc.rust-lang.org/book/');
    const t = slideModel(d.slides[3]!).blocks[0]!;
    expect(t.t).toBe('table');
    expect(t.t === 'table' && t.rows.length).toBe(2);
    const img = slideModel(parseDeck('![[PDFs/aula.pdf#page=3]]').slides[0]!).blocks[0];
    expect(img).toEqual({ t: 'img', target: 'PDFs/aula.pdf#page=3', alt: '' });
  });
});

describe('apresentações: nota → slides', () => {
  const NOTE = `---
tags: [estudo]
---
# Redes neurais

Resumo da aula 3.

## Perceptron
Uma unidade que soma entradas com pesos.

## Treino
${Array.from({ length: 14 }, (_, i) => `- passo ${i + 1} do treino com uma explicação razoavelmente longa`).join('\n')}

## Fim
`;

  it('capa com título e abertura, uma seção por slide, seções longas continuam', () => {
    const md = deckFromNote(NOTE, { title: 'x', source: 'Estudo/Redes.md' });
    expect(md).toMatch(/^---\ntipo: apresentação\ntransição: núcleo\nfonte: "\[\[Estudo\/Redes\]\]"\n---/);
    const d = parseDeck(md);
    expect(d.slides[0]).toMatchObject({ title: 'Redes neurais', layout: 'capa' });
    expect(d.slides[0]!.md).toContain('Resumo da aula 3.');
    expect(d.slides.map((s) => s.title)).toEqual(['Redes neurais', 'Perceptron', 'Treino', 'Treino (cont.)', 'Fim']);
    expect(d.slides[4]!.layout).toBe('seção');
    expect(md).not.toContain('tags:');
  });

  it('nota que já tem --- fica como está', () => {
    const md = deckFromNote('# A\n\n---\n\n## B', { title: 'x' });
    expect(parseDeck(md).slides.map((s) => s.title)).toEqual(['A', 'B']);
  });

  it('PDF vira um slide por página', () => {
    const d = parseDeck(deckFromPdf('PDFs/aula.pdf', 3, 'Aula'));
    expect(d.title).toBe('Aula');
    expect(d.slides.map((s) => s.md)).toEqual(['![[PDFs/aula.pdf#page=1]]', '![[PDFs/aula.pdf#page=2]]', '![[PDFs/aula.pdf#page=3]]']);
    expect(d.slides.every((s) => s.layout === 'imagem')).toBe(true);
  });
});

const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP432UrIiIBAAojAgezs/GqAAAAAElFTkSuQmCC'),
  (c) => c.charCodeAt(0),
);
const image = (t: string) => (t === 'Anexos/arq.png' ? { data: PNG, mime: 'image/png' as const, w: 2, h: 1 } : null);

describe('apresentações: exportar', () => {
  it('.pptx abre de volta no importador com títulos, listas, tabela, imagem e notas', async () => {
    const bytes = deckToPptx(parseDeck(DECK), { look: LOOK_NUCLEO, image });
    const zip = unzipSync(bytes);
    expect(Object.keys(zip).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(6);
    expect(zip['ppt/media/image1.png']).toBeDefined();
    expect(Object.keys(zip).filter((k) => k.startsWith('ppt/media/'))).toHaveLength(1); // a mesma imagem não repete
    expect(strFromU8(zip['ppt/slides/_rels/slide2.xml.rels']!)).toContain('https://doc.rust-lang.org/book/');

    const back = await convertToNote('aula.pptx', bytes, { parse, assetDir: 'Anexos/Aula' });
    expect(back.markdown).toContain('## 1. Fundamentos de Rust');
    expect(back.markdown).toContain('## 2. Por que Rust');
    expect(back.markdown).toMatch(/- \*\*Memória\*\* segura sem coletor/);
    expect(back.markdown).toContain('  - o compilador ajuda');
    expect(back.markdown).toContain('| Rust | não |');
    expect(back.markdown).toContain('> [!note] Notas do apresentador\n> Lembrar de mostrar o borrow checker.');
    expect(back.markdown).toContain('```\nfn main() {\n    println!("olá");\n}\n---\n```');
    expect(back.markdown).not.toMatch(/^\d+$/m); // o número do slide não vira texto
    expect(back.assets).toHaveLength(1);

    // e de volta para apresentação
    const again = parseDeck(deckFromImported(back.markdown, 'Anexos/Aula/aula.pptx'));
    expect(again.slides[0]).toMatchObject({ title: 'Fundamentos de Rust', layout: 'capa' });
    expect(again.slides[1]!.notes).toContain('borrow checker');
  });

  it('PDF tem uma página 16:9 por slide e o texto pode ser lido', async () => {
    const bytes = await deckToPdf(parseDeck(DECK), { look: LOOK_NUCLEO, image });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(6);
    expect(doc.getPage(0).getSize()).toEqual({ width: 960, height: 540 });
    expect(doc.getTitle()).toBe('Fundamentos de Rust');
  });

  it('PDF aguenta slide lotado, emoji e símbolos fora do alfabeto do PDF', async () => {
    const long = `## Muito texto 🚀 → ✓\n\n${Array.from({ length: 40 }, (_, i) => `- item ${i} ★ com ≥ texto`).join('\n')}`;
    const bytes = await deckToPdf(parseDeck(long), { look: LOOK_NUCLEO });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    expect(winAnsi('ação → ok ✓ 🚀 “aspas” ☃')).toBe('ação -> ok v  “aspas” ');
  });
});
