import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString, type PDFRef } from 'pdf-lib';
import type { PdfAnnotation } from './annotations';

/*
 * Grava as anotações do Tanden dentro de uma cópia do PDF, como anotações
 * nativas (Highlight, Underline, StrikeOut, Text, Ink, Square) com aparência
 * própria, para aparecerem no Acrobat, no navegador, no Drive e no Obsidian.
 * Cada uma leva o nome "tanden-<id>": exportar de novo sobre o mesmo arquivo
 * troca as do Tanden e preserva as que vieram de outros programas.
 */

const PREFIX = 'tanden-';

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0xffd400;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

function bbox(rects: number[][], pad = 0): [number, number, number, number] {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    for (let i = 0; i + 1 < r.length; i += 2) {
      x1 = Math.min(x1, r[i]!);
      x2 = Math.max(x2, r[i]!);
      y1 = Math.min(y1, r[i + 1]!);
      y2 = Math.max(y2, r[i + 1]!);
    }
  }
  return [x1 - pad, y1 - pad, x2 + pad, y2 + pad];
}

/** Data no formato do PDF: D:AAAAMMDDHHmmSS */
const pdfDate = (ms: number) => `D:${new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

export async function exportAnnotatedPdf(pdfBytes: Uint8Array, annotations: PdfAnnotation[], opts: { author?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const pages = doc.getPages();
  const author = opts.author ?? 'Tanden Engine';

  // tira as anotações que o Tanden gravou antes
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const a = annots.lookup(i);
      if (!(a instanceof PDFDict)) continue;
      const nm = a.lookup(PDFName.of('NM'));
      const name = nm instanceof PDFString || nm instanceof PDFHexString ? nm.decodeText() : '';
      if (name.startsWith(PREFIX)) annots.remove(i);
    }
  }

  const gsMultiply: PDFDict = ctx.obj({ Type: 'ExtGState', BM: 'Multiply', ca: 0.45, CA: 0.45 });
  const gsOpaque: PDFDict = ctx.obj({ Type: 'ExtGState', ca: 1, CA: 1 });

  for (const a of annotations) {
    const page = pages[a.page - 1];
    if (!page) continue;
    const [r, g, b] = rgb(a.color);
    const color = `${f(r)} ${f(g)} ${f(b)}`;
    const base: Record<string, unknown> = {
      Type: 'Annot',
      F: 4,
      C: [r, g, b],
      NM: PDFString.of(`${PREFIX}${a.id}`),
      T: PDFHexString.fromText(author),
      M: PDFString.of(pdfDate(a.created)),
      CreationDate: PDFString.of(pdfDate(a.created)),
    };
    if (a.comment) base.Contents = PDFHexString.fromText(a.comment);
    else if (a.text) base.Contents = PDFHexString.fromText(a.text);

    let dict: Record<string, unknown> | null = null;
    let rect: [number, number, number, number];
    let ap = '';
    let gs: PDFDict = gsOpaque;

    if ((a.kind === 'highlight' || a.kind === 'underline' || a.kind === 'strike') && a.rects?.length) {
      rect = bbox(a.rects, 1);
      const quads: number[] = [];
      for (const [x1, y1, x2, y2] of a.rects as [number, number, number, number][]) quads.push(x1, y2, x2, y2, x1, y1, x2, y1);
      const subtype = a.kind === 'highlight' ? 'Highlight' : a.kind === 'underline' ? 'Underline' : 'StrikeOut';
      dict = { ...base, Subtype: subtype, QuadPoints: quads };
      if (a.kind === 'highlight') {
        gs = gsMultiply;
        ap = `/GS0 gs ${color} rg ${a.rects.map(([x1, y1, x2, y2]) => `${f(x1!)} ${f(y1!)} ${f(x2! - x1!)} ${f(y2! - y1!)} re`).join(' ')} f`;
      } else {
        const lines = a.rects.map(([x1, y1, x2, y2]) => {
          const h = y2! - y1!;
          const y = a.kind === 'underline' ? y1! + h * 0.08 : y1! + h * 0.45;
          return `${f(x1!)} ${f(y)} m ${f(x2!)} ${f(y)} l S`;
        });
        const w = Math.max(0.8, (a.rects[0]![3]! - a.rects[0]![1]!) * 0.07);
        ap = `/GS0 gs ${color} RG ${f(w)} w ${lines.join(' ')}`;
      }
    } else if (a.kind === 'ink' && a.ink?.length) {
      const w = a.width ?? 2;
      rect = bbox(a.ink, w);
      dict = { ...base, Subtype: 'Ink', InkList: a.ink, BS: { W: w, S: 'S' } };
      ap = `/GS0 gs ${color} RG ${f(w)} w 1 J 1 j ${a.ink
        .map((s) => {
          let p = `${f(s[0]!)} ${f(s[1]!)} m`;
          for (let i = 2; i + 1 < s.length; i += 2) p += ` ${f(s[i]!)} ${f(s[i + 1]!)} l`;
          if (s.length === 2) p += ` ${f(s[0]! + 0.1)} ${f(s[1]!)} l`;
          return p;
        })
        .join(' ')} S`;
    } else if (a.kind === 'box' && a.rects?.length) {
      const w = a.width ?? 1.5;
      const [x1, y1, x2, y2] = a.rects[0] as [number, number, number, number];
      rect = [x1 - w, y1 - w, x2 + w, y2 + w];
      dict = { ...base, Subtype: 'Square', BS: { W: w, S: 'S' } };
      ap = `/GS0 gs ${color} RG ${f(w)} w ${f(x1)} ${f(y1)} ${f(x2 - x1)} ${f(y2 - y1)} re S`;
    } else if (a.kind === 'note' && a.rects?.length) {
      const [x, y] = a.rects[0] as [number, number];
      rect = [x, y - 20, x + 20, y];
      dict = { ...base, Subtype: 'Text', Name: 'Comment', Open: false };
      // balão de comentário
      ap = `/GS0 gs ${color} rg 0.25 0.22 0.2 RG 0.8 w ${f(x + 1)} ${f(y - 15)} 18 13.5 re B ${f(x + 5)} ${f(y - 15)} m ${f(x + 3)} ${f(y - 19)} l ${f(x + 9)} ${f(y - 15)} l f 0.25 0.22 0.2 RG ${f(x + 4)} ${f(y - 6)} m ${f(x + 16)} ${f(y - 6)} l ${f(x + 4)} ${f(y - 10)} m ${f(x + 13)} ${f(y - 10)} l S`;
    } else continue;

    const appearance = ctx.stream(ap, {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: rect,
      Resources: { ExtGState: { GS0: gs } },
    });
    const annot = ctx.obj({ ...dict, Rect: rect, AP: { N: ctx.register(appearance) } } as never);
    const ref: PDFRef = ctx.register(annot);
    page.node.addAnnot(ref);
  }
  return doc.save({ useObjectStreams: false });
}
