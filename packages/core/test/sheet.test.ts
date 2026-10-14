import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { hashBytesHex } from '../src/hash';
import {
  EventBus, MemoryRemote, MemoryStorage, Replicator, SheetStore, Workbook, formatNumber, formatValue, parseCsv,
  parseInput, readXlsx, shiftFormula, writeCsv, writeXlsx, csvSheet, loadBook,
} from '../src/index';
import { parseRect } from '../src/sheet/address';

/** Pasta com uma aba e as células dadas ({ A1: '10', B1: '=A1*2' }). */
function book(cells: Record<string, string>) {
  const wb = Workbook.create();
  const id = wb.sheets()[0]!.id;
  for (const [k, raw] of Object.entries(cells)) {
    const r = parseRect(k)!;
    wb.set(id, r.r0, r.c0, raw);
  }
  const at = (k: string) => {
    const r = parseRect(k)!;
    return wb.value(id, r.r0, r.c0);
  };
  const show = (k: string) => {
    const r = parseRect(k)!;
    return wb.display(id, r.r0, r.c0);
  };
  return { wb, id, at, show };
}

describe('fórmulas', () => {
  it('faz contas com a precedência do Excel', () => {
    const { at } = book({ A1: '=1+2*3', A2: '=(1+2)*3', A3: '=2^3^2', A4: '=-2^2', A5: '=10%+1', A6: '="a"&1+1', A7: '=1/0' });
    expect(at('A1')).toBe(7);
    expect(at('A2')).toBe(9);
    expect(at('A3')).toBe(64); // ^ é associativo à esquerda no Excel
    expect(at('A4')).toBe(4);
    expect(at('A5')).toBeCloseTo(1.1);
    expect(at('A6')).toBe('a2');
    expect(String(at('A7'))).toBe('#DIV/0!');
  });

  it('entende os nomes em português, sem acento e com ponto e vírgula', () => {
    const { at } = book({
      A1: '10', A2: '20', A3: '30',
      B1: '=SOMA(A1:A3)', B2: '=MÉDIA(A1:A3)', B3: '=media(A1;A2)', B4: '=SE(B1>50;"alto";"baixo")', B5: '=SUM(A1:A3, 1)',
      B6: '=MÁXIMO(A1:A3)-MINIMO(A1:A3)', B7: '=CONT.SE(A1:A3;">15")', B8: '=ARRED(10/3;2)',
    });
    expect(at('B1')).toBe(60);
    expect(at('B2')).toBe(20);
    expect(at('B3')).toBe(15);
    expect(at('B4')).toBe('alto');
    expect(at('B5')).toBe(61);
    expect(at('B6')).toBe(20);
    expect(at('B7')).toBe(2);
    expect(at('B8')).toBe(3.33);
  });

  it('SOMASE, PROCV, PROCX, ÍNDICE e CORRESP numa planilha de gastos', () => {
    const { at } = book({
      A1: 'Categoria', B1: 'Valor',
      A2: 'Mercado', B2: '120,50',
      A3: 'Jogos', B3: '89,90',
      A4: 'Mercado', B4: '45',
      A5: 'Transporte', B5: '30',
      D1: '=SOMASE(A:A;"Mercado";B:B)',
      D2: '=PROCV("Jogos";A2:B5;2;FALSO)',
      D3: '=PROCX("Transporte";A2:A5;B2:B5)',
      D4: '=ÍNDICE(B2:B5;CORRESP("Jogos";A2:A5;0))',
      D5: '=PROCV("Viagem";A2:B5;2;FALSO)',
      D6: '=SEERRO(D5;"sem gasto")',
      D7: '=CONT.SES(A2:A5;"Merc*";B2:B5;">50")',
      D8: '=SOMASES(B2:B5;A2:A5;"<>Mercado")',
    });
    expect(at('D1')).toBeCloseTo(165.5);
    expect(at('D2')).toBeCloseTo(89.9);
    expect(at('D3')).toBe(30);
    expect(at('D4')).toBeCloseTo(89.9);
    expect(String(at('D5'))).toBe('#N/A');
    expect(at('D6')).toBe('sem gasto');
    expect(at('D7')).toBe(1);
    expect(at('D8')).toBeCloseTo(119.9);
  });

  it('datas: digitadas no padrão brasileiro e calculadas', () => {
    const { at, show } = book({
      A1: '14/10/2026', A2: '=A1+30', A3: '=DATADIF(DATA(2004;3;15);A1;"Y")', A4: '=FIMMÊS(A1;0)', A5: '=DIA.DA.SEMANA(A1)',
      A6: '=TEXTO(A1;"dd/mm/yyyy")', A7: '=DIATRABALHOTOTAL(A1;A1+13)',
    });
    expect(show('A1')).toBe('14/10/2026');
    expect(formatValue(at('A2'), 'dd/mm/yyyy')).toBe('13/11/2026');
    expect(at('A3')).toBe(22);
    expect(formatValue(at('A4'), 'dd/mm/yyyy')).toBe('31/10/2026');
    expect(at('A5')).toBe(4); // quarta-feira
    expect(at('A6')).toBe('14/10/2026');
    expect(at('A7')).toBe(10);
  });

  it('finanças: parcela, valor futuro e taxa', () => {
    const { at } = book({ A1: '=PGTO(1%;12;-1000)', A2: '=VF(0,8%;24;-500)', A3: '=TAXA(12;-88,85;1000)' });
    expect(at('A1')).toBeCloseTo(88.85, 2);
    expect(at('A2')).toBeCloseTo(13171.58, 1);
    expect(at('A3')).toBeCloseTo(0.01, 4);
    const { at: at2 } = book({ A1: '10', A2: '=A1*0,8', A3: '=SOMA(A1;0,5)' });
    expect(at2('A2')).toBe(8);
    expect(at2('A3')).toBe(10.5);
  });

  it('referência circular vira erro, sem travar', () => {
    const { at } = book({ A1: '=B1+1', B1: '=A1+1', C1: '=C1' });
    expect(String(at('A1'))).toBe('#CYCLE!');
    expect(String(at('C1'))).toBe('#CYCLE!');
  });

  it('cadeias longas (saldo acumulado em 20 mil linhas) não estouram a pilha', () => {
    const wb = Workbook.create();
    const id = wb.sheets()[0]!.id;
    const rows = Array.from({ length: 20_000 }, (_, r) => ({ r, c: 0, raw: r === 0 ? '1' : `=A${r}+1` }));
    wb.setMany(id, rows);
    expect(wb.value(id, 19_999, 0)).toBe(20_000);
    // um ciclo longo também é detectado
    wb.set(id, 0, 0, '=A20000');
    expect(String(wb.value(id, 19_999, 0))).toBe('#CYCLE!');
  });

  it('referência a outra aba, inclusive com espaço no nome', () => {
    const wb = Workbook.create();
    const a = wb.sheets()[0]!.id;
    const b = wb.addSheet('Metas do mês');
    wb.set(b, 0, 0, '500');
    wb.set(a, 0, 0, "='Metas do mês'!A1*2");
    wb.set(a, 0, 1, '=Inexistente!A1');
    expect(wb.value(a, 0, 0)).toBe(1000);
    expect(String(wb.value(a, 0, 1))).toBe('#REF!');
  });

  it('erros de sintaxe e funções desconhecidas', () => {
    const { at } = book({ A1: '=SOMA(1;', A2: '=NAOEXISTE(1)', A3: '=SE(1)' });
    expect(String(at('A1'))).toBe('#NAME?');
    expect(String(at('A2'))).toBe('#NAME?');
    expect(String(at('A3'))).toBe('#N/A');
  });

  it('copiar e preencher deslocam só as referências relativas', () => {
    expect(shiftFormula('=A1+$B$1+B$2+$C3', 2, 1)).toBe('=B3+$B$1+C$2+$C5');
    expect(shiftFormula('=SOMA(A1:A3; 1)', 1, 0)).toBe('=SOMA(A2:A4; 1)');
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!');
    const { wb, id, at } = book({ A1: '1', A2: '2', A3: '3', B1: '=A1*10' });
    wb.fill(id, parseRect('B1')!, parseRect('B1:B3')!);
    expect(at('B3')).toBe(30);
    expect(wb.raw(id, 2, 1)).toBe('=A3*10');
  });

  it('desfazer e refazer', () => {
    const { wb, id, at } = book({});
    wb.undo.clear();
    wb.set(id, 0, 0, '5');
    wb.undo.stopCapturing();
    wb.set(id, 0, 0, '7');
    expect(at('A1')).toBe(7);
    wb.undo.undo();
    expect(at('A1')).toBe(5);
    wb.undo.redo();
    expect(at('A1')).toBe(7);
  });
});

describe('entrada e exibição', () => {
  it('interpreta números em pt-BR, porcentagem, moeda e hora', () => {
    expect(parseInput('1.234,56').value).toBe(1234.56);
    expect(parseInput('3,5').value).toBe(3.5);
    expect(parseInput('3.5').value).toBe(3.5);
    expect(parseInput('15%')).toEqual({ value: 0.15, nf: '0%' });
    expect(parseInput('R$ 1.500,00')).toMatchObject({ value: 1500, nf: '"R$" #,##0.00' });
    expect(parseInput('08:30').value).toBeCloseTo(8.5 / 24);
    expect(parseInput("'123").value).toBe('123');
    expect(parseInput('31/02/2026').value).toBe('31/02/2026'); // data impossível fica como texto
    expect(parseInput('verdadeiro').value).toBe(true);
  });

  it('formata no padrão brasileiro', () => {
    expect(formatNumber(1234567.891, '#,##0.00')).toBe('1.234.567,89');
    expect(formatNumber(0.256, '0.0%')).toBe('25,6%');
    expect(formatNumber(-1500, '"R$" #,##0.00')).toBe('-R$ 1.500,00');
    expect(formatNumber(46309.5, 'dd/mm/yyyy hh:mm')).toBe('14/10/2026 12:00');
    expect(formatNumber(46309, 'dddd, d "de" mmmm')).toBe('quarta-feira, 14 de outubro');
    expect(formatValue(1 / 3)).toBe('0,33333333333');
    expect(formatValue(true)).toBe('VERDADEIRO');
  });
});

describe('xlsx e csv', () => {
  it('vai e volta pelo .xlsx sem perder nada', () => {
    const { wb, id } = book({
      A1: 'Item', B1: 'Valor', C1: 'Data',
      A2: 'Teclado', B2: '350', C2: '14/10/2026',
      A3: 'Mouse', B3: '120,5', C3: '01/11/2026',
      A4: 'Total', B4: '=SOMA(B2:B3)', D4: '=PROCX("Mouse";A2:A3;B2:B3)',
      A5: "'007", B5: 'VERDADEIRO', C5: '=SE(B4>400;"caro";"ok")', D5: '=A6',
    });
    wb.setFormat(id, parseRect('A1:C1')!, 'b', true);
    wb.setFormat(id, parseRect('B2:B4')!, 'nf', '"R$" #,##0.00');
    wb.setFormat(id, parseRect('A4')!, 'al', 'r');
    wb.setColWidth(id, 0, 180);
    const second = wb.addSheet('Notas & "aspas"');
    wb.set(second, 2, 3, "=Planilha1!B4*2");

    const bytes = writeXlsx(wb);
    expect(hashBytesHex(writeXlsx(wb))).toBe(hashBytesHex(bytes)); // determinístico
    const back = new Workbook();
    loadBook(back, readXlsx(bytes));
    const [s1, s2] = back.sheets();
    expect(back.sheets().map((s) => s.name)).toEqual(['Planilha1', 'Notas & "aspas"']);
    expect(back.value(s1!.id, 3, 1)).toBeCloseTo(470.5);
    expect(back.raw(s1!.id, 3, 1)).toBe('=SUM(B2:B3)'); // no arquivo vai o nome em inglês
    expect(back.raw(s1!.id, 3, 3)).toBe('=XLOOKUP("Mouse", A2:A3, B2:B3)');
    expect(back.value(s1!.id, 3, 3)).toBeCloseTo(120.5);
    expect(back.value(s1!.id, 4, 0)).toBe('007');
    expect(back.value(s1!.id, 4, 1)).toBe(true);
    expect(back.display(s1!.id, 1, 2)).toBe('14/10/2026');
    expect(back.display(s1!.id, 2, 1)).toBe('R$ 120,50');
    expect(back.format(s1!.id, 0, 0).b).toBe(true);
    expect(back.format(s1!.id, 3, 0).al).toBe('r');
    expect(back.colWidth(s1!.id, 0)).toBe(180);
    expect(back.value(s2!.id, 2, 3)).toBeCloseTo(941);
  });

  it('o .xlsx gravado tem as fórmulas novas com prefixo _xlfn e o recálculo ligado', async () => {
    const { wb } = book({ A1: '=PROCX(1;B1:B2;C1:C2)', A2: '=SOMA(1;2)' });
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(writeXlsx(wb));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain('<f>_xlfn.XLOOKUP(1, B1:B2, C1:C2)</f>');
    expect(sheet).toContain('<f>SUM(1, 2)</f><v>3</v>');
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('fullCalcOnLoad="1"');
  });

  it('lê fórmulas compartilhadas e strings ricas como o Excel grava', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const xml = (s: string) => strToU8(`<?xml version="1.0"?>${s}`);
    const bytes = zipSync({
      'xl/workbook.xml': xml('<workbook xmlns:r="r"><sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': xml('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': xml('<sst><si><r><t>Olá </t></r><r><rPr><b/></rPr><t>mundo</t></r></si></sst>'),
      'xl/worksheets/sheet1.xml': xml(
        '<worksheet><sheetData>' +
          '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f t="shared" ref="B1:B3" si="0">A1*2</f><v>2</v></c></row>' +
          '<row r="2"><c r="A2"><v>2</v></c><c r="B2"><f t="shared" si="0"/><v>4</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>0</v></c><c r="B3"><f t="shared" si="0"/></c></row>' +
          '</sheetData></worksheet>',
      ),
    });
    const data = readXlsx(bytes);
    expect(data.sheets[0]!.cells.get('B2')).toBe('=A2*2');
    expect(data.sheets[0]!.cells.get('B3')).toBe('=A3*2');
    expect(data.sheets[0]!.cells.get('A3')).toBe('Olá mundo');
  });

  it('csv: detecta ";" do Excel brasileiro e exporta nos dois sabores', () => {
    const rows = parseCsv('﻿nome;valor;obs\r\nCafé;12,50;"tem ""aspas""; e ;"\r\n');
    expect(rows).toEqual([['nome', 'valor', 'obs'], ['Café', '12,50', 'tem "aspas"; e ;']]);
    const wb = new Workbook();
    loadBook(wb, { sheets: [csvSheet('Importado', 'nome;valor\nCafé;12,50\nPão;3\n')] });
    const id = wb.sheets().find((s) => s.name === 'Importado')!.id;
    wb.set(id, 3, 1, '=SOMA(B2:B3)');
    expect(wb.value(id, 3, 1)).toBeCloseTo(15.5);
    expect(writeCsv(wb, id)).toBe('nome,valor\r\nCafé,12.5\r\nPão,3\r\n,15.5\r\n');
    expect(writeCsv(wb, id, { delimiter: ';' })).toBe('nome;valor\r\nCafé;12,5\r\nPão;3\r\n;15,5\r\n');
  });
});

// ---------------------------------------------------------------------------

function device(drive: MemoryRemote, id: string) {
  const disk = new MemoryStorage();
  const store = new SheetStore(disk, id, new EventBus());
  const replicator = new Replicator(disk, drive, id);
  const sync = async () => {
    await store.sync();
    const r = await replicator.sync();
    if (r.downloaded.length) {
      await store.sync();
      await replicator.sync();
    }
  };
  return { disk, store, replicator, sync };
}

describe('planilhas sincronizadas entre aparelhos', () => {
  it('leva a planilha do PC ao celular e funde edições offline em células diferentes', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    const wb = pc.store.create('Planilhas/Gastos.xlsx');
    const s = wb.sheets()[0]!.id;
    wb.set(s, 0, 0, '100');
    await pc.sync();
    expect(drive.files.has('Planilhas/Gastos.xlsx')).toBe(true);
    await phone.sync();
    const wb2 = phone.store.workbook('Planilhas/Gastos.xlsx');
    expect(wb2.value(s, 0, 0)).toBe(100);

    wb.set(s, 1, 0, '50');
    wb2.set(s, 2, 0, '=SOMA(A1:A2)');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(wb.value(s, 2, 0)).toBe(150);
    expect(wb2.value(s, 2, 0)).toBe(150);
    // os dois gravam o mesmo .xlsx: nada fica indo e voltando
    const before = drive.files.get('Planilhas/Gastos.xlsx')!.rev;
    await phone.sync();
    await pc.sync();
    expect(drive.files.get('Planilhas/Gastos.xlsx')!.rev).toBe(before);
  });

  it('absorve uma edição feita no Excel/Sheets sem desfazer o que o celular fez offline', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    const wb = pc.store.create('Planilhas/Notas.xlsx');
    const s = wb.sheets()[0]!.id;
    wb.setMany(s, [{ r: 0, c: 0, raw: 'Prova' }, { r: 0, c: 1, raw: '7' }, { r: 1, c: 0, raw: 'Trabalho' }, { r: 1, c: 1, raw: '8' }]);
    await pc.sync();
    await phone.sync();

    // celular offline muda B2; alguém edita o .xlsx no Sheets mudando B1 e criando C1
    const wb2 = phone.store.workbook('Planilhas/Notas.xlsx');
    wb2.set(s, 1, 1, '9,5');
    const edited = new Workbook();
    loadBook(edited, readXlsx(drive.files.get('Planilhas/Notas.xlsx')!.data));
    const es = edited.sheets().find((x) => x.name === 'Planilha1')!.id;
    edited.set(es, 0, 1, '10');
    edited.set(es, 0, 2, '=B1*2');
    await drive.upload('Planilhas/Notas.xlsx', writeXlsx(edited));

    await pc.sync();
    await phone.sync();
    await pc.sync();
    for (const w of [wb, wb2]) {
      expect(w.value(s, 0, 1)).toBe(10);
      expect(w.value(s, 0, 2)).toBe(20);
      expect(w.value(s, 1, 1)).toBe(9.5);
    }
  });

  it('adota um .xlsx que apareceu na pasta sem regravá-lo', async () => {
    const drive = new MemoryRemote();
    const other = Workbook.create(new Y.Doc());
    other.set(other.sheets()[0]!.id, 0, 0, 'veio do Excel');
    const original = writeXlsx(other);
    await drive.upload('Faculdade/horário.xlsx', original);
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.store.list()).toEqual(['Faculdade/horário.xlsx']);
    const wb = pc.store.workbook('Faculdade/horário.xlsx');
    expect(wb.value(wb.sheets()[0]!.id, 0, 0)).toBe('veio do Excel');
    expect(drive.files.get('Faculdade/horário.xlsx')!.data).toEqual(original);
    // os dois aparelhos adotaram com operações idênticas: sem abas duplicadas
    expect(phone.store.workbook('Faculdade/horário.xlsx').sheets().length).toBe(1);
  });
});
