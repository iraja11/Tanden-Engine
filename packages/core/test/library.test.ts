import { describe, expect, it } from 'vitest';
import {
  AnnotationStore,
  LibraryStore,
  MemoryRemote,
  MemoryStorage,
  Replicator,
  Vault,
  bookProgress,
  bookTitle,
  bookToMarkdown,
  fullSync,
  pdfFingerprint,
} from '../src/index';

function device(drive: MemoryRemote, id: string) {
  const disk = new MemoryStorage();
  const vault = new Vault(disk, id);
  const lib = new LibraryStore(disk, id, vault.bus);
  const replicator = new Replicator(disk, drive, id);
  return { disk, vault, lib, sync: () => fullSync(vault, replicator, [lib]) };
}

const P = 'PDFs/Clean Code.pdf';

describe('Biblioteca de PDFs', () => {
  it('guarda status, estantes, etiquetas e marca início e fim', () => {
    const lib = new LibraryStore(new MemoryStorage(), 'arch');
    lib.ensure(P, { pages: 400, pdfTitle: 'Clean Code', fingerprint: 'fp1' });
    expect(lib.get(P)).toMatchObject({ pages: 400, pdfTitle: 'Clean Code', tags: [], shelves: [], readMs: 0 });
    lib.update(P, { status: 'lendo', shelves: ['Programação', ' Programação ', ''], tags: ['#código'] });
    const b = lib.get(P)!;
    expect(b.shelves).toEqual(['Programação']);
    expect(b.tags).toEqual(['código']);
    expect(b.started).toBeGreaterThan(0);
    expect(b.finished).toBeUndefined();
    lib.update(P, { status: 'lido', rating: 5 });
    expect(lib.get(P)!.finished).toBeGreaterThan(0);
    expect(bookProgress(lib.get(P)!)).toBe(1);
    lib.update(P, { status: 'lendo', rating: undefined, shelves: [] });
    expect(lib.get(P)).toMatchObject({ status: 'lendo', shelves: [] });
    expect(lib.get(P)!.rating).toBeUndefined();
    expect(lib.get(P)!.finished).toBeUndefined();
    expect(lib.shelves()).toEqual([]);
  });

  it('posição: passar da primeira página muda "Quero ler" para "Lendo" e guarda a mais adiante', () => {
    const lib = new LibraryStore(new MemoryStorage(), 'arch');
    lib.update(P, { status: 'quero' });
    lib.setPosition(P, 1, 100);
    expect(lib.get(P)!.status).toBe('quero');
    lib.setPosition(P, 40, 100);
    lib.setPosition(P, 12);
    const b = lib.get(P)!;
    expect(b).toMatchObject({ status: 'lendo', page: 12, maxPage: 40, pages: 100 });
    expect(bookProgress(b)).toBeCloseTo(39 / 99);
  });

  it('não grava nada quando a posição não muda (rolagem não enche o CRDT)', () => {
    const lib = new LibraryStore(new MemoryStorage(), 'arch');
    lib.setPosition(P, 5, 10);
    let n = 0;
    lib.onChange(() => n++);
    for (let i = 0; i < 50; i++) lib.setPosition(P, 5, 10);
    expect(n).toBe(0);
  });

  it('marcadores: liga, desliga, renomeia', () => {
    const lib = new LibraryStore(new MemoryStorage(), 'arch');
    expect(lib.toggleBookmark(P, 7, 'Capítulo 2')).toBe(true);
    const id = lib.addBookmark(P, 3);
    lib.renameBookmark(P, id, 'Prefácio');
    expect(lib.get(P)!.bookmarks.map((b) => [b.page, b.label])).toEqual([[3, 'Prefácio'], [7, 'Capítulo 2']]);
    expect(lib.toggleBookmark(P, 7)).toBe(false);
    lib.removeBookmark(P, id);
    expect(lib.get(P)!.bookmarks).toEqual([]);
  });

  it('funde dois aparelhos offline sem perder campo nenhum', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.lib.ensure(P, { pages: 300 });
    await pc.sync();
    await phone.sync();
    expect(phone.lib.has(P)).toBe(true);

    // offline nos dois
    pc.lib.update(P, { shelves: ['Programação'] });
    pc.lib.setPosition(P, 20);
    pc.lib.addReading(P, 10 * 60_000);
    pc.lib.addBookmark(P, 20, 'pc');
    phone.lib.update(P, { rating: 4 });
    phone.lib.addReading(P, 5 * 60_000);
    phone.lib.addBookmark(P, 50, 'celular');
    await new Promise((r) => setTimeout(r, 5));
    phone.lib.setPosition(P, 55); // lido depois, no ônibus

    await pc.sync();
    await phone.sync();
    await pc.sync();
    for (const d of [pc, phone]) {
      const b = d.lib.get(P)!;
      expect(b.shelves).toEqual(['Programação']);
      expect(b.rating).toBe(4);
      expect(b.readMs).toBe(15 * 60_000);
      expect(b.bookmarks.map((m) => m.label)).toEqual(['pc', 'celular']);
      expect(b.page).toBe(55);
      expect(b.pageDevice).toBe('redmi');
      expect(b.maxPage).toBe(55);
    }
  });

  it('acha o livro de novo quando o PDF muda de pasta, com as anotações', () => {
    const disk = new MemoryStorage();
    const lib = new LibraryStore(disk, 'arch');
    const annots = new AnnotationStore(disk, 'arch');
    lib.ensure(P, { fingerprint: 'abc' });
    lib.update(P, { status: 'lendo', shelves: ['Trabalho'] });
    lib.addBookmark(P, 9, 'aqui');
    annots.edit(P, (e) => e.add({ id: 'a1', page: 9, kind: 'highlight', color: '#ff0', rects: [[0, 0, 10, 10]], text: 'nomes' }));
    const to = 'Livros/Programação/Clean Code.pdf';
    // o app já viu o arquivo novo e criou um livro vazio para ele
    lib.ensure(to, { fingerprint: 'abc', pages: 400 });
    const moved = lib.reconcile(new Map([[to, 'abc'], ['PDFs/outro.pdf', 'zzz']]));
    expect(moved).toEqual([[P, to]]);
    for (const [a, b] of moved) annots.move(a, b);
    expect(lib.has(P)).toBe(false);
    expect(lib.get(to)).toMatchObject({ status: 'lendo', shelves: ['Trabalho'], pages: 400 });
    expect(lib.get(to)!.bookmarks[0]!.label).toBe('aqui');
    expect(annots.list(P)).toEqual([]);
    expect(annots.list(to).map((a) => a.text)).toEqual(['nomes']);
  });

  it('não move quando há dois arquivos iguais (não dá para saber qual)', () => {
    const lib = new LibraryStore(new MemoryStorage(), 'arch');
    lib.ensure(P, { fingerprint: 'abc' });
    expect(lib.reconcile(new Map([['a.pdf', 'abc'], ['b.pdf', 'abc']]))).toEqual([]);
    expect(lib.has(P)).toBe(true);
  });

  it('impressão digital não depende do nome e muda com o conteúdo', () => {
    const a = new Uint8Array(200_000).map((_, i) => i % 251);
    const b = a.slice();
    b[150_000] = 7; // meio do arquivo: fora da amostra, mas o tamanho é igual
    const c = a.slice();
    c[199_999] = 9;
    expect(pdfFingerprint(a)).toBe(pdfFingerprint(a.slice()));
    expect(pdfFingerprint(c)).not.toBe(pdfFingerprint(a));
    expect(pdfFingerprint(a.subarray(0, 1000))).not.toBe(pdfFingerprint(a));
    expect(typeof pdfFingerprint(b)).toBe('string');
  });

  it('título: o seu, o do PDF, ou o nome do arquivo quando o do PDF é lixo', () => {
    expect(bookTitle({ path: 'x/Livro.pdf', pdfTitle: 'Microsoft Word - rascunho.docx' })).toBe('Livro');
    expect(bookTitle({ path: 'x/Livro.pdf', pdfTitle: 'Untitled' })).toBe('Livro');
    expect(bookTitle({ path: 'x/Livro.pdf', pdfTitle: 'Estruturas de Dados' })).toBe('Estruturas de Dados');
    expect(bookTitle({ path: 'x/Livro.pdf', pdfTitle: 'Estruturas', title: 'Meu título' })).toBe('Meu título');
  });

  it('nota do livro com propriedades que o Obsidian lê', () => {
    const lib = new LibraryStore(new MemoryStorage(), 'arch');
    lib.ensure(P, { pages: 101, pdfAuthor: 'Robert C. Martin' });
    lib.update(P, { status: 'lendo', rating: 4, shelves: ['Programação'], tags: ['código'] });
    lib.setPosition(P, 51);
    lib.addBookmark(P, 10, 'Nomes significativos');
    lib.addReading(P, 95 * 60_000);
    const md = bookToMarkdown(lib.get(P)!);
    expect(md).toContain('titulo: "Clean Code"');
    expect(md).toContain('autor: "Robert C. Martin"');
    expect(md).toContain('arquivo: "[[PDFs/Clean Code.pdf]]"');
    expect(md).toContain('status: "Lendo"');
    expect(md).toContain('progresso: 50');
    expect(md).toContain('estantes:\n  - "Programação"');
    expect(md).toContain('tags:\n  - livro\n  - "código"');
    expect(md).toContain('[[PDFs/Clean Code.pdf#page=51|continuar na página 51]]');
    expect(md).toContain('- [[PDFs/Clean Code.pdf#page=10|p. 10]] Nomes significativos');
    expect(md).toContain('Tempo de leitura: 1 h 35 min');
  });

  it('tirar da biblioteca apaga só os dados dela', async () => {
    const disk = new MemoryStorage();
    const lib = new LibraryStore(disk, 'arch');
    lib.ensure(P);
    lib.addBookmark(P, 3);
    await lib.sync();
    lib.remove(P);
    await lib.sync();
    const again = new LibraryStore(disk, 'arch');
    await again.sync();
    expect(again.list()).toEqual([]);
  });
});
