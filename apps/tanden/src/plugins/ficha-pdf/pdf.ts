/*
 * PDF mínimo: uma imagem JPEG por página A4, ocupando a página inteira.
 * Escrito à mão (cabeçalho, objetos, xref) para não depender de biblioteca
 * nem de internet.
 */

export interface PdfPage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

const A4 = { w: 595.28, h: 841.89 };
const enc = new TextEncoder();

/** Texto para o dicionário Info: UTF-16BE em hexadecimal (acentos funcionam). */
function pdfText(s: string): string {
  let hex = 'FEFF';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c > 0xffff) {
      const v = c - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else hex += c.toString(16).padStart(4, '0');
  }
  return `<${hex.toUpperCase()}>`;
}

export function jpegPdf(pages: PdfPage[], info: { title: string; subject?: string; creator?: string }): Blob {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const put = (x: string | Uint8Array) => {
    const b = typeof x === 'string' ? enc.encode(x) : x;
    chunks.push(b);
    size += b.length;
  };
  const obj = (n: number, body: string | Array<string | Uint8Array>) => {
    offsets[n] = size;
    put(`${n} 0 obj\n`);
    for (const part of Array.isArray(body) ? body : [body]) put(part);
    put('\nendobj\n');
  };

  // 1 catálogo, 2 páginas, 3 info; cada página usa 3 objetos (página, imagem, conteúdo)
  const pageObj = (i: number) => 4 + i * 3;
  put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_p, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`);
  const now = new Date();
  const d = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  obj(3, `<< /Title ${pdfText(info.title)}${info.subject ? ` /Subject ${pdfText(info.subject)}` : ''} /Creator ${pdfText(info.creator ?? 'Tanden')} /Producer ${pdfText('Tanden · Ficha em PDF')} /CreationDate (${d}) >>`);
  pages.forEach((p, i) => {
    const n = pageObj(i);
    const content = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im0 Do Q`;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    obj(n + 1, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
    obj(n + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 4 + pages.length * 3;
  const xref = size;
  put(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) put(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}
