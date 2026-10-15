import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DOMParser } from 'linkedom';
import { convertToNote, deckToOdp, LOOK_PAPEL, parseDeck, excelCodeToOdfStyle, loadBook, markdownToOdt, odfNumberStyleCode, odfToExcelFormula, readOds, Workbook, writeOds } from '../src';
import { parseXml } from '../src/convert/xml-lite';

const parse = (t: string, type: 'text/html' | 'application/xml') => new DOMParser().parseFromString(t, type === 'application/xml' ? 'text/xml' : type) as unknown as Document;
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

describe('planilhas do LibreOffice (.ods)', () => {
  it('lê o .ods gravado pelo LibreOffice: valores, fórmulas, formatos e larguras', () => {
    const book = readOds(fixture('calc.ods'));
    expect(book.sheets.map((s) => s.name)).toEqual(['Gastos', 'Outra Aba']);
    const g = book.sheets[0]!;
    expect(g.cells.get('A1')).toBe('Item');
    expect(g.fmt.get('A1')).toEqual({ b: true });
    expect(g.fmt.get('B1')).toEqual({ b: true, i: true, al: 'c' });
    expect(g.cells.get('B2')).toBe('123.45');
    expect(g.fmt.get('B2')?.nf).toBe('#,##0.00');
    expect(g.cells.get('B3')).toBe('0.25');
    expect(g.fmt.get('B3')?.nf).toBe('0%');
    expect(g.fmt.get('B4')?.nf).toBe('dd/mm/yyyy');
    expect(g.cells.get('B5')).toBe('=SUM(B2:B3)');
    expect(g.cells.get('C5')).toBe('=IF(B5>100,"alto","baixo")');
    expect(g.fmt.get('D2')?.nf).toBe('"R$ "#,##0.00');
    expect(g.cells.get('A7')).toBe('linha1\nlinha2');
    expect(g.cells.get('A8')).toBe('=TRUE()');
    expect(g.cells.get('E2')).toBe('=ROUND(B2*1.5,2)');
    expect(g.widths.get(0)).toBeGreaterThan(200);
    expect(g.widths.has(1)).toBe(false); // a largura padrão não vira largura própria
    const o = book.sheets[1]!;
    expect(o.cells.get('A1')).toBe('=Gastos!B2*2');
    expect(o.cells.get('A2')).toBe('=SUM(Gastos!B2:B3)');
    expect(o.cells.get('A3')).toBe('=AVERAGE(Gastos!B:B)');

    // e as contas fecham no Tanden
    const wb = new Workbook();
    loadBook(wb, book);
    const [gid, oid] = wb.sheets().map((s) => s.id) as [string, string];
    expect(wb.value(gid, 4, 1)).toBeCloseTo(123.7);
    expect(wb.value(gid, 4, 2)).toBe('alto');
    expect(wb.value(gid, 7, 0)).toBe(true);
    expect(wb.value(oid, 0, 0)).toBeCloseTo(246.9);
    expect(wb.display(gid, 3, 1)).toBe('15/10/2026');
  });

  it('traduz as fórmulas do OpenFormula', () => {
    expect(odfToExcelFormula('of:=SUM([.A1:.B2];[$Plan2.$C$3])')).toBe('SUM(A1:B2,Plan2!$C$3)');
    expect(odfToExcelFormula("of:=[$'Minha aba'.A1]&\"[x];y\"")).toBe("'Minha aba'!A1&\"[x];y\"");
    expect(odfToExcelFormula('of:=COM.MICROSOFT.IFS([.A1]>0;1;TRUE();2)')).toBe('IFS(A1>0,1,TRUE(),2)');
    expect(odfToExcelFormula('of:=[.#REF!]+1')).toBe('#REF!+1');
    expect(odfToExcelFormula('msoxl:=SUM(A1:A2)')).toBe('SUM(A1:A2)');
  });

  it('converte formatos de número nos dois sentidos', () => {
    const back = (code: string) => {
      const xml = excelCodeToOdfStyle('N1', code);
      expect(xml).not.toBeNull();
      const st = parseXml(xml!).kids[0];
      return odfNumberStyleCode(st as never);
    };
    expect(back('0.00')).toBe('0.00');
    expect(back('#,##0.00')).toBe('#,##0.00');
    expect(back('0%')).toBe('0%');
    expect(back('0.00%')).toBe('0.00%');
    expect(back('dd/mm/yyyy')).toBe('dd/mm/yyyy');
    expect(back('dd/mm/yyyy hh:mm')).toBe('dd/mm/yyyy hh:mm');
    expect(back('hh:mm')).toBe('hh:mm');
    expect(back('"R$" #,##0.00')).toBe('"R$ "#,##0.00');
    expect(back('0.00E+00')).toBe('0.00E+00');
    expect(back('@')).toBe('@');
    expect(excelCodeToOdfStyle('N1', 'General')).toBeNull();
  });

  it('grava .ods válido que volta igual', () => {
    const wb = Workbook.create();
    const id = wb.sheets()[0]!.id;
    wb.renameSheet(id, 'Contas');
    wb.setMany(id, [
      { r: 0, c: 0, raw: 'Nome' },
      { r: 0, c: 1, raw: 'Valor' },
      { r: 1, c: 0, raw: 'Aluguel' },
      { r: 1, c: 1, raw: '1500' },
      { r: 2, c: 0, raw: "'007" },
      { r: 2, c: 1, raw: '0.1' },
      { r: 3, c: 1, raw: '=SOMA(B2:B3)' },
      { r: 4, c: 1, raw: '=SE(B4>1000;"caro";"ok")' },
      { r: 5, c: 0, raw: 'a  b\tc\nd' },
      { r: 6, c: 1, raw: '46310.5' },
      { r: 7, c: 1, raw: 'TRUE' },
      { r: 9, c: 3, raw: '=1/0' },
    ]);
    wb.setFormat(id, { r0: 0, c0: 0, r1: 0, c1: 1 }, 'b', true);
    wb.setFormat(id, { r0: 1, c0: 1, r1: 1, c1: 1 }, 'nf', '"R$" #,##0.00');
    wb.setFormat(id, { r0: 2, c0: 1, r1: 2, c1: 1 }, 'nf', '0%');
    wb.setFormat(id, { r0: 6, c0: 1, r1: 6, c1: 1 }, 'nf', 'dd/mm/yyyy hh:mm');
    wb.setFormat(id, { r0: 4, c0: 1, r1: 4, c1: 1 }, 'al', 'r');
    wb.setColWidth(id, 0, 180);
    const two = wb.addSheet('Outra aba');
    wb.setMany(two, [{ r: 0, c: 0, raw: '=Contas!B4*2' }]);

    const bytes = writeOds(wb, 'Contas da casa');
    const zip = unzipSync(bytes);
    expect(Object.keys(zip)[0]).toBe('mimetype');
    expect(strFromU8(zip.mimetype!)).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(strFromU8(zip['content.xml']!)).toContain('table:formula="of:=SUM([.B2:.B3])"');
    expect(strFromU8(zip['content.xml']!)).toContain("of:=[$Contas.B4]*2");
    expect(writeOds(wb, 'Contas da casa')).toEqual(bytes); // determinístico

    const book = readOds(bytes);
    const s = book.sheets[0]!;
    expect(book.sheets.map((x) => x.name)).toEqual([wb.sheets()[0]!.name, 'Outra aba']);
    expect(s.cells.get('B2')).toBe('1500');
    expect(s.cells.get('A3')).toBe("'007");
    expect(s.cells.get('B4')).toBe('=SUM(B2:B3)');
    expect(s.cells.get('B5')).toBe('=IF(B4>1000,"caro","ok")');
    expect(s.cells.get('A6')).toBe('a  b\tc\nd');
    expect(Number(s.cells.get('B7'))).toBeCloseTo(46310.5);
    expect(s.cells.get('B8')).toBe('TRUE');
    expect(s.cells.get('D10')).toBe('=1/0');
    expect(s.fmt.get('A1')).toEqual({ b: true });
    expect(s.fmt.get('B2')?.nf).toBe('"R$ "#,##0.00');
    expect(s.fmt.get('B3')?.nf).toBe('0%');
    expect(s.fmt.get('B7')?.nf).toBe('dd/mm/yyyy hh:mm');
    expect(s.fmt.get('B5')?.al).toBe('r');
    expect(s.widths.get(0)).toBe(180);
    expect(book.sheets[1]!.cells.get('A1')).toBe('=Contas!B4*2');
  });

  it('não explode com as repetições do LibreOffice', () => {
    const content = `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x"><office:body><office:spreadsheet><table:table table:name="A"><table:table-column table:number-columns-repeated="16384"/><table:table-row table:number-rows-repeated="3"><table:table-cell office:value-type="float" office:value="7"/><table:table-cell table:number-columns-repeated="16383"/></table:table-row><table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="16384"/></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`;
    
    const book = readOds(zipSync({ mimetype: strToU8('application/vnd.oasis.opendocument.spreadsheet'), 'content.xml': strToU8(content) }));
    expect([...book.sheets[0]!.cells]).toEqual([
      ['A1', '7'],
      ['A2', '7'],
      ['A3', '7'],
    ]);
  });

  it('recusa o que não é planilha, em português', () => {
    expect(() => readOds(new Uint8Array([1, 2, 3]))).toThrow(/não é um \.ods válido/);
  });
});

describe('documentos do LibreOffice (.odt)', () => {
  const md = `---
tags: [teste]
---
# Relatório

Um parágrafo com **negrito**, *itálico*, ~~riscado~~, \`código\`, ==realce== e um [link](https://tanden.dev).

## Lista

- um
- dois
  - dois e meio
- [ ] tarefa

3. terceiro
4. quarto

> Uma citação

\`\`\`python
def oi():
    return  "oi"
\`\`\`

| Nome | Nota |
| --- | --: |
| Ana | 10 |
| Rui | 8 |

---

![[Anexos/pixel.png|Pixel]]

Veja [[Outra nota]] & mais.
`;

  it('nota → .odt válido → nota com a mesma estrutura', async () => {
    const odt = markdownToOdt(md, { title: 'Relatório', image: (t) => (t.endsWith('pixel.png') ? { data: PNG, mime: 'image/png' } : null) });
    const zip = unzipSync(odt);
    expect(Object.keys(zip)[0]).toBe('mimetype');
    expect(strFromU8(zip.mimetype!)).toBe('application/vnd.oasis.opendocument.text');
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      expect(zip[part], part).toBeDefined();
      const doc = new DOMParser().parseFromString(strFromU8(zip[part]!), 'text/xml');
      expect(doc.documentElement, part).toBeTruthy();
    }
    expect(Object.keys(zip).filter((k) => k.startsWith('Pictures/'))).toEqual(['Pictures/imagem1.png']);
    expect(strFromU8(zip['META-INF/manifest.xml']!)).toContain('Pictures/imagem1.png');

    const back = await convertToNote('Relatório.odt', odt, { parse, assetDir: 'Anexos/Relatório' });
    expect(back.title).toBe('Relatório');
    const m = back.markdown;
    expect(m).toContain('# Relatório');
    expect(m).toContain('## Lista');
    expect(m).toContain('**negrito**');
    expect(m).toContain('*itálico*');
    expect(m).toContain('~~riscado~~');
    expect(m).toContain('`código`');
    expect(m).toContain('==realce==');
    expect(m).toContain('[link](https://tanden.dev)');
    expect(m).toMatch(/- um\n- dois\n {2}- dois e meio\n- ☐ tarefa/);
    expect(m).toMatch(/3\. terceiro\n4\. quarto/);
    expect(m).toContain('> Uma citação');
    expect(m).toContain('```\ndef oi():\n    return  "oi"\n```');
    expect(m).toContain('| Nome | Nota |');
    expect(m).toContain('| Ana | 10 |');
    expect(m).toContain('\n---\n');
    expect(m).toContain('Veja Outra nota & mais.');
    expect(back.assets.map((a) => a.path)).toEqual(['Anexos/Relatório/imagem1.png']);
    expect(m).toContain('![[Anexos/Relatório/imagem1.png|Pixel]]');
  });
});

describe('apresentações do LibreOffice (.odp)', () => {
  it('lê o .odp gravado pelo LibreOffice: títulos, listas, tabela, imagem e notas', async () => {
    const r = await convertToNote('aula.odp', fixture('impress.odp'), { parse, assetDir: 'Anexos/Aula' });
    const [s1, s2, s3] = r.markdown.split('\n---\n') as [string, string, string];
    expect(s1).toContain('## 1. Minha Capa');
    expect(s1).toContain('*subtítulo aqui*');
    expect(s2).toContain('## 2. Tópicos');
    expect(s2).toContain('- primeiro\n- segundo\n  - sub item\n- **negrito**');
    expect(s2).toContain('> [!note] Notas do apresentador\n> lembrar de falar disso');
    expect(s3).toContain('## 3. Tabela e imagem');
    expect(s3).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(s3).toMatch(/!\[\[Anexos\/Aula\/[^\]]+\.png\]\]/);
    expect(s3).toContain('texto solto');
    expect(r.assets).toHaveLength(1);
  });

  it('apresentação → .odp válido → volta com títulos, listas, tabela, imagem e notas', async () => {
    const text = `---\ntipo: apresentação\ntransição: esmaecer\n---\n\n# Capa\n\nsubtítulo\n\n---\n\n## Tópicos\n\n- um **forte**\n- dois\n  - dois e meio\n\n1. primeiro\n2. segundo\n\n> [!note] Notas do apresentador\n> falar devagar\n\n---\n\n## Dados\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![[p.png|Foto]]\n`;
    const odp = deckToOdp(parseDeck(text, 'Deck'), { look: LOOK_PAPEL, image: () => ({ data: PNG, mime: 'image/png', w: 10, h: 10 }) });
    const zip = unzipSync(odp);
    expect(Object.keys(zip)[0]).toBe('mimetype');
    expect(strFromU8(zip.mimetype!)).toBe('application/vnd.oasis.opendocument.presentation');
    for (const part of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      const doc = new DOMParser().parseFromString(strFromU8(zip[part]!), 'text/xml');
      expect(doc.documentElement, part).toBeTruthy();
    }
    expect(strFromU8(zip['content.xml']!)).toContain('smil:type="fade"');
    const r = await convertToNote('Deck.odp', odp, { parse, assetDir: 'Anexos/Deck' });
    const [s1, s2, s3] = r.markdown.split('\n---\n') as [string, string, string];
    expect(s1).toContain('## 1. Capa');
    expect(s1).toContain('subtítulo');
    expect(s2).toContain('## 2. Tópicos');
    expect(s2).toContain('- um **forte**\n- dois\n  - dois e meio');
    expect(s2).toContain('1. primeiro\n2. segundo');
    expect(s2).toContain('> [!note] Notas do apresentador\n> falar devagar');
    expect(s3).toContain('| A | B |');
    expect(s3).toContain('![[Anexos/Deck/imagem1.png|Foto]]');
  });
});
