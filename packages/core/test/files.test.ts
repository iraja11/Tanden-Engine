import { describe, expect, it } from 'vitest';
import { DOMParser } from 'linkedom';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import {
  AnnotationStore,
  MemoryRemote,
  MemoryStorage,
  Replicator,
  Vault,
  annotationsToMarkdown,
  clipToMarkdown,
  convertToNote,
  exportAnnotatedPdf,
  fileKind,
  freePath,
  fullSync,
  resolveLink,
  htmlToMarkdown,
  linkCard,
  markdownToDocx,
  markdownToHtml,
  normalizeUrl,
  obsidianToCommonMark,
  pdfTextToMarkdown,
  prepareClip,
  safeFileName,
  type PdfAnnotation,
} from '../src/index';

const parse = (t: string, type: 'text/html' | 'application/xml') => new DOMParser().parseFromString(t, type === 'application/xml' ? 'text/xml' : type) as unknown as Document;
const opts = (assetDir = 'Anexos/Doc') => ({ parse, assetDir });
/** PNG 1x1 de verdade (assinatura + IHDR), para imagens de teste. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

describe('HTML → Markdown', () => {
  it('converte títulos, listas, tarefas, tabelas, código e links relativos', () => {
    const md = htmlToMarkdown(
      `<h1>Oi</h1><p>Texto <b>forte</b>, <i>leve</i> e <a href="/x">link</a>.</p>
      <ul><li><input type="checkbox" checked> feito</li><li>b<ol><li>c</li><li>d</li></ol></li></ul>
      <table><tr><td>Nome</td><td>Valor</td></tr><tr><td>a|b</td><td>2</td></tr></table>
      <pre><code class="language-python">print("oi")\n</code></pre><mark>importante</mark><script>alert(1)</script>`,
      { parse, baseUrl: 'https://ex.com/a/b' },
    );
    expect(md).toContain('# Oi');
    expect(md).toContain('Texto **forte**, *leve* e [link](https://ex.com/x).');
    expect(md).toContain('- [x] feito\n- b\n  1. c\n  2. d');
    expect(md).toContain('| Nome | Valor |\n| --- | --- |\n| a\\|b | 2 |');
    expect(md).toContain('```python\nprint("oi")\n```');
    expect(md).toContain('==importante==');
    expect(md).not.toContain('alert');
  });

  it('troca imagens por anexos do cofre quando o app pede', () => {
    const md = htmlToMarkdown('<p><img src="foto.png" alt="Praia [1]"> <img src="https://cdn.x/y.jpg"></p>', {
      parse,
      baseUrl: 'https://site.com/post/',
      image: (src) => (src === 'https://site.com/post/foto.png' ? 'Anexos/Post/foto.png' : null),
    });
    expect(md).toContain('![[Anexos/Post/foto.png|Praia  1 ]]'.replace('  1 ', ' 1'));
    expect(md).toContain('![](https://cdn.x/y.jpg)');
  });
});

describe('Nota → .docx → nota', () => {
  const md = `---
tags: [teste]
---
# Relatório

Um parágrafo com **negrito**, *itálico*, ~~riscado~~, \`código\` e um [link](https://tanden.dev).

## Lista

- um
- dois
  - dois e meio
- [ ] tarefa

1. primeiro
2. segundo

> Uma citação

| Nome | Nota |
| --- | --: |
| Ana | 10 |
| Rui | 8 |

![[Anexos/pixel.png|Pixel]]

Veja [[Outra nota]] e ==isto==.
`;

  it('gera um .docx válido que volta como a mesma estrutura', async () => {
    const docx = markdownToDocx(md, { title: 'Relatório', image: (t) => (t.endsWith('pixel.png') ? { data: PNG, mime: 'image/png' } : null) });
    const zip = unzipSync(docx);
    for (const part of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml']) {
      expect(zip[part], part).toBeDefined();
      // XML bem formado
      expect(() => parse(strFromU8(zip[part]!), 'application/xml')).not.toThrow();
    }
    expect(Object.keys(zip).some((k) => k.startsWith('word/media/'))).toBe(true);
    const xml = strFromU8(zip['word/document.xml']!);
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).not.toContain('[[');

    const back = await convertToNote('Relatório.docx', docx, opts('Anexos/Relatório'));
    expect(back.title).toBe('Relatório');
    expect(back.markdown).toContain('# Relatório');
    expect(back.markdown).toContain('## Lista');
    expect(back.markdown).toContain('**negrito**');
    expect(back.markdown).toContain('*itálico*');
    expect(back.markdown).toContain('[link](https://tanden.dev)');
    expect(back.markdown).toMatch(/- um\n- dois\n {2}- dois e meio\n- ☐ tarefa/);
    expect(back.markdown).toMatch(/1\. primeiro\n2\. segundo/);
    expect(back.markdown).toContain('| Nome | Nota |');
    expect(back.markdown).toContain('| Ana | 10 |');
    expect(back.markdown).toContain('Veja Outra nota e');
    expect(back.assets).toHaveLength(1);
    expect(back.assets[0]!.path).toBe('Anexos/Relatório/imagem 1.png');
    expect(back.markdown).toContain('![[Anexos/Relatório/imagem 1.png');
  });

  it('exporta HTML de um arquivo só, com a imagem embutida', () => {
    const html = markdownToHtml(md, { title: 'Relatório', image: () => ({ data: PNG, mime: 'image/png' }) });
    expect(html).toContain('<title>Relatório</title>');
    expect(html).toContain('<h1>Relatório</h1>');
    expect(html).toContain('src="data:image/png;base64,');
    expect(html).toContain('<mark>isto</mark>');
    expect(html).toContain('<input checked="" disabled="" type="checkbox">'.replace('checked="" ', '')); // tarefa aberta
    expect(html).not.toContain('tags: [teste]');
  });

  it('traduz a sintaxe do Obsidian, mas não dentro de blocos de código', () => {
    const out = obsidianToCommonMark('[[a/b.md|B]] [[c#Seção]]\n> [!tip] Dica\n```\n[[x]] ==y==\n```\n%% oculto %%');
    expect(out).toContain('B c › Seção');
    expect(out).toContain('> **Dica**');
    expect(out).toContain('```\n[[x]] ==y==\n```');
    expect(out).not.toContain('oculto');
  });
});

describe('PowerPoint, LibreOffice e EPUB', () => {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const rels = (items: string) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
  const sp = (ph: string | null, paras: string, y = 0) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="${y}"/></a:xfrm></p:spPr><p:txBody>${paras}</p:txBody></p:sp>`;
  const para = (t: string, lvl = 0, extra = '') => `<a:p><a:pPr lvl="${lvl}">${extra}</a:pPr><a:r><a:rPr${t.startsWith('*') ? ' b="1"' : ''}/><a:t>${t.replace(/^\*/, '')}</a:t></a:r></a:p>`;

  function pptx(): Uint8Array {
    const slide1 = `<p:sld ${NS}><p:cSld><p:spTree>
      ${sp('body', para('Primeiro ponto') + para('Detalhe', 1) + para('*Forte'), 3000000)}
      ${sp('title', para('Visão geral'), 100)}
      <p:pic><p:nvPicPr><p:cNvPr id="5" name="foto" descr="Logo"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="6000000"/></a:xfrm></p:spPr></p:pic>
      <p:graphicFrame><p:xfrm><a:off x="0" y="7000000"/></p:xfrm><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Golpe</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Frames</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Soco</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>4</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
      ${sp('sldNum', para('1'), 9000000)}
    </p:spTree></p:cSld></p:sld>`;
    const slide2 = `<p:sld ${NS}><p:cSld><p:spTree>${sp(null, para('Texto solto') + para('com marcador', 0, '<a:buChar char="•"/>'))}</p:spTree></p:cSld></p:sld>`;
    const notes = `<p:notes ${NS}><p:cSld><p:spTree>${sp('body', para('Lembrar da demo'))}</p:spTree></p:cSld></p:notes>`;
    return zipSync({
      'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`),
      'ppt/_rels/presentation.xml.rels': strToU8(rels('<Relationship Id="rId2" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="x/slide" Target="slides/slide2.xml"/>')),
      'ppt/slides/slide1.xml': strToU8(slide1),
      'ppt/slides/slide2.xml': strToU8(slide2),
      'ppt/slides/_rels/slide1.xml.rels': strToU8(rels('<Relationship Id="rId2" Type="x/image" Target="../media/image1.png"/><Relationship Id="rId9" Type="http://schemas/notesSlide" Target="../notesSlides/notesSlide1.xml"/>')),
      'ppt/notesSlides/notesSlide1.xml': strToU8(notes),
      'ppt/media/image1.png': PNG,
      'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="c" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Aula de SF5</dc:title></cp:coreProperties>'),
    });
  }

  it('.pptx vira seções por slide, na ordem da apresentação', async () => {
    const r = await convertToNote('aula.pptx', pptx(), opts('Anexos/Aula'));
    expect(r.title).toBe('Aula de SF5');
    const [s1, s2] = r.markdown.split('\n---\n') as [string, string];
    expect(s1).toContain('## 1. Slide 1'); // o slide2.xml vem primeiro na apresentação
    expect(s1).toContain('Texto solto\n- com marcador');
    expect(s2).toContain('## 2. Visão geral');
    expect(s2).toContain('- Primeiro ponto\n  - Detalhe\n- **Forte**');
    expect(s2).toContain('![[Anexos/Aula/image1.png|Logo]]');
    expect(s2).toContain('| Golpe | Frames |\n| --- | --- |\n| Soco | 4 |');
    expect(s2).toContain('> [!note] Notas do apresentador\n> Lembrar da demo');
    expect(s2).not.toMatch(/^1$/m); // número do slide some
    expect(s2.indexOf('Primeiro ponto')).toBeLessThan(s2.indexOf('![[')); // ordem de leitura
    expect(r.assets.map((a) => a.path)).toEqual(['Anexos/Aula/image1.png']);
  });

  it('.odt vira nota com títulos, negrito, listas numeradas, tabela e imagem', async () => {
    const content = `<office:document-content xmlns:office="o" xmlns:text="t" xmlns:style="s" xmlns:fo="f" xmlns:table="tb" xmlns:draw="d" xmlns:xlink="x">
      <office:automatic-styles>
        <style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
        <text:list-style style:name="L1"><text:list-level-style-number text:level="1"/></text:list-style>
      </office:automatic-styles>
      <office:body><office:text>
        <text:h text:outline-level="1">Capítulo</text:h>
        <text:p>Um <text:span text:style-name="T1">golpe</text:span><text:s text:c="2"/>forte e <text:a xlink:href="https://x.dev">link</text:a>.</text:p>
        <text:list text:style-name="L1"><text:list-item><text:p>a</text:p></text:list-item><text:list-item><text:p>b</text:p><text:list><text:list-item><text:p>b1</text:p></text:list-item></text:list></text:list-item></text:list>
        <table:table><table:table-row><table:table-cell><text:p>x</text:p></table:table-cell><table:table-cell><text:p>y</text:p></table:table-cell></table:table-row></table:table>
        <text:p><draw:frame><draw:image xlink:href="Pictures/f.png"/></draw:frame></text:p>
      </office:text></office:body></office:document-content>`;
    const r = await convertToNote('mundo.odt', zipSync({ 'content.xml': strToU8(content), 'Pictures/f.png': PNG }), opts('Anexos/Mundo'));
    expect(r.title).toBe('mundo');
    expect(r.markdown).toContain('# Capítulo');
    expect(r.markdown).toContain('Um **golpe**  forte e [link](https://x.dev).');
    expect(r.markdown).toContain('1. a\n2. b\n  1. b1');
    expect(r.markdown).toContain('| x | y |');
    expect(r.markdown).toContain('![[Anexos/Mundo/f.png]]');
  });

  it('.epub junta os capítulos na ordem de leitura', async () => {
    const epub = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
      'OEBPS/content.opf': strToU8(`<package><metadata><dc:title xmlns:dc="dc">O Livro</dc:title><dc:creator xmlns:dc="dc">Autora</dc:creator></metadata>
        <manifest><item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine><itemref idref="c2"/><itemref idref="c1"/></spine></package>`),
      'OEBPS/text/c1.xhtml': strToU8('<html><body><h2>Dois</h2><p>Fim.</p></body></html>'),
      'OEBPS/text/c2.xhtml': strToU8('<html><body><h2>Um</h2><p>Início <img src="../img/a.png" alt="mapa"/></p></body></html>'),
      'OEBPS/img/a.png': PNG,
    });
    const r = await convertToNote('livro.epub', epub, opts('Anexos/Livro'));
    expect(r.title).toBe('O Livro');
    expect(r.markdown.indexOf('## Um')).toBeLessThan(r.markdown.indexOf('## Dois'));
    expect(r.markdown).toContain('*Autora*');
    expect(r.markdown).toContain('![[Anexos/Livro/a.png|mapa]]');
  });

  it('avisa em português quando o formato é o antigo do Office', async () => {
    await expect(convertToNote('velho.doc', new Uint8Array([1]), opts())).rejects.toThrow(/antigo do Office/);
  });

  it('lê .txt do Windows antigo (Windows-1252)', async () => {
    const r = await convertToNote('nota.txt', Uint8Array.from([0x63, 0x61, 0x66, 0xe9]), opts());
    expect(r.markdown).toBe('café\n');
  });
});

describe('texto de PDF', () => {
  it('monta parágrafos, títulos, listas e desfaz hifenização', () => {
    const it2 = (str: string, x: number, y: number, h = 10) => ({ str, x, y, h, w: str.length * h * 0.5 });
    const md = pdfTextToMarkdown([
      [
        it2('Introdução', 72, 750, 20),
        it2('O Tanden junta notas e', 72, 700),
        it2('planilhas num app só, com sincroni-', 72, 688),
        it2('zação entre aparelhos.', 72, 676),
        it2('• primeiro item', 72, 640),
        it2('• segundo', 72, 628),
        it2('1', 300, 40),
      ],
    ]);
    expect(md).toBe('# Introdução\n\nO Tanden junta notas e planilhas num app só, com sincronização entre aparelhos.\n\n- primeiro item\n\n- segundo\n');
  });
});

describe('páginas web', () => {
  const page = `<html lang="pt-BR"><head><title>Guia de Frame Data | Blog FGC</title>
    <meta property="og:title" content="Guia de Frame Data">
    <meta property="og:site_name" content="Blog FGC">
    <meta name="description" content="Tudo sobre vantagem de frames.">
    <meta name="author" content="Maria">
    <meta property="article:published_time" content="2026-09-30T10:00:00Z">
    <meta property="og:image" content="/capa.jpg"></head>
    <body><nav><a href="/">Início</a><a href="/sobre">Sobre</a></nav>
    <article><h1>Guia de Frame Data</h1>
    ${'<p>Frame data é a contagem de quadros de cada golpe, e entender isso muda o jogo. '.repeat(8)}</p>
    <p>Veja a tabela: <img data-src="/img/tabela.png" src="data:image/gif;base64,R0lGOD" alt="tabela"></p>
    <h2>Vantagem</h2><p>Um golpe <strong>+2</strong> deixa você agir primeiro. ${'Mais texto explicando. '.repeat(10)}</p></article>
    <footer>© 2026 Blog FGC · Política de privacidade</footer></body></html>`;

  it('separa o artigo, baixa as imagens e grava propriedades do Obsidian', () => {
    const clip = prepareClip(page, 'https://blog.fgc.dev/guia', parse);
    expect(clip.meta).toMatchObject({
      title: 'Guia de Frame Data',
      siteName: 'Blog FGC',
      author: 'Maria',
      published: '2026-09-30',
      image: 'https://blog.fgc.dev/capa.jpg',
    });
    expect(clip.images).toEqual(['https://blog.fgc.dev/img/tabela.png']);
    const md = clipToMarkdown(clip, { parse, images: new Map([['https://blog.fgc.dev/img/tabela.png', 'Anexos/Guia/tabela.png']]), now: new Date(2026, 9, 14, 21, 30) });
    expect(md.startsWith('---\ntitle: Guia de Frame Data\nsource: https://blog.fgc.dev/guia\nauthor: Maria\npublished: "2026-09-30"\ncreated: "2026-10-14T21:30"\n')).toBe(true);
    expect(md).toContain('tags:\n  - web\n---');
    expect(md).toContain('> [!info] [Blog FGC](https://blog.fgc.dev/guia) · Maria · 2026-09-30');
    expect(md).toContain('![[Anexos/Guia/tabela.png|tabela]]');
    expect(md).toContain('## Vantagem');
    expect(md).toContain('**+2**');
    expect(md).not.toContain('Política de privacidade');
    expect(md).not.toContain('[Sobre]');
    expect(md.match(/# Guia de Frame Data/g)).toHaveLength(1);
  });

  it('faz um cartão de link e reconhece endereços sem https', () => {
    const clip = prepareClip(page, 'https://blog.fgc.dev/guia', parse);
    expect(linkCard(clip.meta, { note: 'Web/Guia de Frame Data' })).toBe(
      '> [!link] [Guia de Frame Data](https://blog.fgc.dev/guia)\n> Tudo sobre vantagem de frames.\n> → [[Web/Guia de Frame Data]]\n> *Blog FGC*\n',
    );
    expect(normalizeUrl('blog.fgc.dev/guia?x=1')).toBe('https://blog.fgc.dev/guia?x=1');
    expect(normalizeUrl('http://a.com')).toBe('http://a.com/');
    expect(normalizeUrl('não é link')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('anotações de PDF', () => {
  function device(drive: MemoryRemote, id: string) {
    const disk = new MemoryStorage();
    const vault = new Vault(disk, id);
    const annots = new AnnotationStore(disk, id, vault.bus);
    const replicator = new Replicator(disk, drive, id);
    return { disk, annots, sync: () => fullSync(vault, replicator, [annots]) };
  }
  const hl = (id: string, page: number, y: number): Omit<PdfAnnotation, 'created' | 'device'> => ({
    id,
    page,
    kind: 'highlight',
    color: '#ffd400',
    rects: [[72, y, 300, y + 12]],
    text: `trecho ${id}`,
  });

  it('funde anotações de dois aparelhos, campo a campo', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.annots.edit('PDFs/livro.pdf', (e) => e.add(hl('a', 1, 700)));
    await pc.sync();
    await phone.sync();
    expect(phone.annots.list('PDFs/livro.pdf').map((a) => a.id)).toEqual(['a']);

    // offline: o PC muda a cor, o celular comenta e cria outra
    pc.annots.edit('PDFs/livro.pdf', (e) => e.update('a', { color: '#7fd1a8' }));
    phone.annots.edit('PDFs/livro.pdf', (e) => {
      e.update('a', { comment: 'rever isso' });
      e.add(hl('b', 2, 500));
    });
    await pc.sync();
    await phone.sync();
    await pc.sync();
    for (const d of [pc, phone]) {
      const list = d.annots.list('PDFs/livro.pdf');
      expect(list.map((a) => a.id)).toEqual(['a', 'b']);
      expect(list[0]).toMatchObject({ color: '#7fd1a8', comment: 'rever isso', device: 'arch' });
    }

    // apagar num aparelho apaga no outro
    phone.annots.edit('PDFs/livro.pdf', (e) => e.remove('a'));
    await phone.sync();
    await pc.sync();
    expect(pc.annots.list('PDFs/livro.pdf').map((a) => a.id)).toEqual(['b']);
    // o PDF nunca foi tocado; só o estado em .tanden/annot
    expect((await pc.disk.list()).filter((p) => p.endsWith('.pdf'))).toEqual([]);
  });

  it('desfaz só o que este aparelho fez', () => {
    const s = new AnnotationStore(new MemoryStorage(), 'arch');
    const undo = s.undoManager('a.pdf');
    s.edit('a.pdf', (e) => e.add(hl('x', 1, 100)));
    undo.stopCapturing();
    s.edit('a.pdf', (e) => e.update('x', { comment: 'oi' }));
    undo.undo();
    expect(s.list('a.pdf')[0]!.comment).toBeUndefined();
    undo.undo();
    expect(s.list('a.pdf')).toEqual([]);
  });

  it('vira uma nota com links para a página', () => {
    const list = [
      { ...hl('a', 3, 700), comment: 'importante', created: 1, device: 'arch' },
      { id: 'n', page: 5, kind: 'note' as const, color: '#ff8a3d', rects: [[100, 200, 100, 200]], comment: 'dúvida\nsegunda linha', created: 2, device: 'arch' },
    ];
    const md = annotationsToMarkdown('PDFs/livro.pdf', list);
    expect(md).toContain('# Anotações: livro');
    expect(md).toContain('## [[PDFs/livro.pdf#page=3|Página 3]]');
    expect(md).toContain('> [!quote] Realce · [[PDFs/livro.pdf#page=3|p. 3]]\n> ==trecho a==\n>\n> importante');
    expect(md).toContain('> [!note] Comentário · [[PDFs/livro.pdf#page=5|p. 5]]\n> dúvida\n> segunda linha');
  });

  it('exporta um PDF com anotações nativas e troca só as do Tanden', async () => {
    const src = await PDFDocument.create();
    src.addPage([595, 842]);
    src.addPage([595, 842]);
    // anotação de outro programa, que tem de sobreviver
    const foreign = src.context.register(src.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], NM: PDFString.of('acrobat-1') }));
    src.getPages()[0]!.node.addAnnot(foreign);
    const original = await src.save();

    const now = Date.now();
    const list: PdfAnnotation[] = [
      { ...hl('h', 1, 700), comment: 'ver', created: now, device: 'arch' },
      { id: 'u', page: 1, kind: 'underline', color: '#ff0000', rects: [[72, 600, 200, 612]], created: now, device: 'arch' },
      { id: 'i', page: 2, kind: 'ink', color: '#000000', ink: [[10, 10, 50, 60, 90, 20]], width: 2, created: now, device: 'arch' },
      { id: 'n', page: 2, kind: 'note', color: '#ff8a3d', rects: [[100, 300, 100, 300]], comment: 'oi', created: now, device: 'arch' },
      { id: 'b', page: 2, kind: 'box', color: '#3366ff', rects: [[50, 50, 150, 120]], created: now, device: 'arch' },
    ];
    const once = await exportAnnotatedPdf(original, list);
    const names = async (bytes: Uint8Array) => {
      const d = await PDFDocument.load(bytes);
      return d.getPages().map((p) => {
        const arr = p.node.Annots();
        return arr
          ? arr.asArray().map((_, i) => {
              const a = arr.lookup(i) as PDFDict;
              return `${(a.lookup(PDFName.of('Subtype')) as PDFName).asString()}:${(a.lookup(PDFName.of('NM')) as PDFString).decodeText()}`;
            })
          : [];
      });
    };
    expect(await names(once)).toEqual([
      ['/Text:acrobat-1', '/Highlight:tanden-h', '/Underline:tanden-u'],
      ['/Ink:tanden-i', '/Text:tanden-n', '/Square:tanden-b'],
    ]);
    // exportar de novo sobre o resultado não duplica
    const twice = await exportAnnotatedPdf(once, list.slice(0, 1));
    expect(await names(twice)).toEqual([['/Text:acrobat-1', '/Highlight:tanden-h'], []]);
  });
});

describe('nomes e pastas', () => {
  it('limpa nomes e acha caminhos livres', () => {
    expect(safeFileName('Relatório: "final" #2 [v3]?.docx')).toBe('Relatório final 2 v3 .docx'.replace(' .docx', '.docx'));
    expect(safeFileName('..oculto')).toBe('oculto');
    const taken = new Set(['PDFs/Livro.pdf', 'PDFs/Livro 2.pdf']);
    expect(freePath((p) => taken.has(p), 'PDFs', 'Livro', 'pdf')).toBe('PDFs/Livro 3.pdf');
    expect(freePath(() => false, '', 'a/b', 'md')).toBe('a b.md');
    expect(fileKind('x/Aula.PDF')).toBe('pdf');
    expect(fileKind('foto.jpeg')).toBe('image');
    expect(fileKind('slides.pptx')).toBe('slides');
    expect(fileKind('z.bin')).toBe('other');
  });

  it('resolve [[links]] como o Obsidian', () => {
    const paths = ['Bem-vinda.md', 'mundo/Aurath.md', 'PDFs/Livro.pdf', 'Anexos/Livro.pdf', 'a/b/Aurath.md', 'Planilhas/Gastos.xlsx'];
    expect(resolveLink('Aurath', paths)).toEqual({ path: 'mundo/Aurath.md', sub: '', page: null });
    expect(resolveLink('a/b/Aurath|apelido', paths)!.path).toBe('a/b/Aurath.md');
    expect(resolveLink('livro.pdf#page=12', paths)).toEqual({ path: 'PDFs/Livro.pdf', sub: 'page=12', page: 12 });
    expect(resolveLink('PDFs/Livro.pdf', paths)!.path).toBe('PDFs/Livro.pdf');
    expect(resolveLink('Bem-vinda#Seção', paths)).toEqual({ path: 'Bem-vinda.md', sub: 'Seção', page: null });
    expect(resolveLink('Gastos.xlsx', paths)!.path).toBe('Planilhas/Gastos.xlsx');
    expect(resolveLink('Nada', paths)).toBeNull();
  });
});
