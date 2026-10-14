import { PDFDocument, StandardFonts, rgb as pdfRgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { Deck } from './deck';
import { contain, type DeckExportOptions, type SlideLook } from './look';
import { slideModel, type Block, type Run, type SlideModel } from './model';

/*
 * Apresentação → PDF, um slide por página (16:9), no visual do Tanden:
 * fundo do tema, títulos fortes com um traço da cor de destaque e uma linha
 * de progresso no rodapé, como a do modo apresentação. O texto é texto de
 * verdade (dá para selecionar e buscar) e encolhe até caber no slide.
 */

const W = 960;
const H = 540;
const M = 56;

interface Fonts {
  r: PDFFont;
  b: PDFFont;
  i: PDFFont;
  bi: PDFFont;
  mono: PDFFont;
}

type Op =
  | { k: 'text'; x: number; y: number; text: string; font: PDFFont; size: number; color: string; under?: boolean; mark?: string }
  | { k: 'rect'; x: number; y: number; w: number; h: number; color: string; stroke?: string; opacity?: number }
  | { k: 'dot'; x: number; y: number; r: number; color: string }
  | { k: 'img'; x: number; y: number; w: number; h: number; target: string };

const hex = (c: string) => {
  const n = parseInt(c.replace('#', ''), 16) || 0;
  return pdfRgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/* As fontes padrão do PDF só conhecem o alfabeto WinAnsi (português inteiro cabe). */
const WIN_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const SWAP: Record<string, string> = {
  '→': '->', '←': '<-', '⇒': '=>', '⇐': '<=', '↔': '<->', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '★': '*', '☆': '*', '−': '-', '‐': '-', '‑': '-', ' ': ' ', '\t': '    ',
};
export function winAnsi(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff) || WIN_EXTRA.includes(ch)) out += ch;
    else if (SWAP[ch] !== undefined) out += SWAP[ch];
    else if (c === 0x0a) out += '\n';
    else if (c > 0xffff || (c >= 0x2600 && c <= 0x27bf) || (c >= 0xfe00 && c <= 0xfe0f) || c === 0x200d) continue; // emoji
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base && base.codePointAt(0)! < 0x7f ? base : '?';
    }
  }
  return out;
}

const fontOf = (f: Fonts, r: Run): PDFFont => (r.code ? f.mono : r.b && r.i ? f.bi : r.b ? f.b : r.i ? f.i : f.r);

interface Piece {
  text: string;
  font: PDFFont;
  size: number;
  color: string;
  w: number;
  under?: boolean;
  mark?: string;
}
type Line = { pieces: Piece[]; w: number };

/** Quebra os pedaços de texto em linhas que cabem em `maxW`. */
function wrap(runs: Run[], f: Fonts, size: number, maxW: number, look: SlideLook, base?: { color?: string; font?: PDFFont }): Line[] {
  const lines: Line[] = [{ pieces: [], w: 0 }];
  const put = (p: Piece) => {
    const line = lines[lines.length - 1]!;
    const last = line.pieces[line.pieces.length - 1];
    if (last && last.font === p.font && last.color === p.color && last.size === p.size && last.under === p.under && last.mark === p.mark) {
      last.text += p.text;
      last.w += p.w;
    } else line.pieces.push({ ...p });
    line.w += p.w;
  };
  for (const r of runs) {
    const font = base?.font && !r.code && !r.b && !r.i ? base.font : fontOf(f, r);
    const sz = r.code ? size * 0.9 : size;
    const color = r.link ? look.accent : r.code ? look.accent : (base?.color ?? look.ink);
    const text = winAnsi(r.text);
    const mark = r.mark ? (look.dark ? '#5a3a12' : '#ffe2a8') : undefined;
    for (const part of text.split(/(\n|\s+)/)) {
      if (!part) continue;
      if (part === '\n') {
        lines.push({ pieces: [], w: 0 });
        continue;
      }
      const line = lines[lines.length - 1]!;
      const space = /^\s+$/.test(part);
      if (space && !line.pieces.length) continue;
      let w = font.widthOfTextAtSize(space ? ' ' : part, sz);
      if (!space && line.w + w > maxW && line.pieces.length) {
        // tira o espaço do fim da linha e começa outra
        const lp = line.pieces[line.pieces.length - 1]!;
        if (/\s$/.test(lp.text)) {
          const sw = lp.font.widthOfTextAtSize(' ', lp.size);
          lp.text = lp.text.replace(/\s+$/, '');
          lp.w -= sw;
          line.w -= sw;
        }
        lines.push({ pieces: [], w: 0 });
      }
      if (!space && w > maxW) {
        // palavra maior que a linha: corta em pedaços
        let chunk = '';
        for (const ch of part) {
          const cw = font.widthOfTextAtSize(chunk + ch, sz);
          if (cw > maxW && chunk) {
            put({ text: chunk, font, size: sz, color, w: font.widthOfTextAtSize(chunk, sz), under: !!r.link, mark });
            lines.push({ pieces: [], w: 0 });
            chunk = ch;
          } else chunk += ch;
        }
        w = font.widthOfTextAtSize(chunk, sz);
        put({ text: chunk, font, size: sz, color, w, under: !!r.link, mark });
        continue;
      }
      put({ text: space ? ' ' : part, font, size: sz, color, w, under: !!r.link, mark });
    }
  }
  return lines;
}

function emitLines(ops: Op[], lines: Line[], x: number, y: number, lh: number, align: 'left' | 'center' = 'left', boxW = 0): number {
  for (const line of lines) {
    let px = align === 'center' ? x + (boxW - line.w) / 2 : x;
    for (const p of line.pieces) {
      if (p.mark) ops.push({ k: 'rect', x: px - 1, y: y + lh * 0.12, w: p.w + 2, h: lh * 0.82, color: p.mark });
      ops.push({ k: 'text', x: px, y: y + lh * 0.78, text: p.text, font: p.font, size: p.size, color: p.color, under: p.under });
      px += p.w;
    }
    y += lh;
  }
  return y;
}

interface Ctx {
  f: Fonts;
  look: SlideLook;
  image?: DeckExportOptions['image'];
}

/** Desenha os blocos a partir de (x, y) com a letra `size`; devolve as operações e a altura usada. */
function layoutBlocks(blocks: Block[], ctx: Ctx, x: number, y0: number, w: number, size: number, maxImgH: number): { ops: Op[]; h: number } {
  const ops: Op[] = [];
  const { f, look } = ctx;
  const lh = size * 1.32;
  const gap = size * 0.5;
  let y = y0;
  blocks.forEach((b, bi) => {
    if (bi > 0) y += gap;
    if (b.t === 'p') {
      const indent = b.level > 0 ? 26 * b.level : 0;
      const tx = x + indent + (b.quote ? 18 : 0);
      const tw = w - indent - (b.quote ? 18 : 0);
      const lines = wrap(b.runs, f, size, tw, look, b.quote ? { color: look.muted, font: f.i } : undefined);
      const top = y;
      if (b.bullet) {
        const cy = y + lh * 0.52;
        const bx = x + indent - 15;
        if (b.bullet === '•') ops.push({ k: 'dot', x: bx, y: cy, r: Math.max(2.2, size * 0.13), color: look.accent });
        else if (b.bullet === '☐' || b.bullet === '☑') {
          const s = size * 0.62;
          ops.push({ k: 'rect', x: bx - s / 2, y: cy - s / 2, w: s, h: s, color: b.bullet === '☑' ? look.accent : look.bg, stroke: look.accent });
        } else {
          const t = winAnsi(b.bullet);
          const tw2 = f.b.widthOfTextAtSize(t, size * 0.85);
          ops.push({ k: 'text', x: bx + 6 - tw2, y: y + lh * 0.78, text: t, font: f.b, size: size * 0.85, color: look.accent });
        }
      }
      y = emitLines(ops, lines, tx, y, lh);
      if (b.quote) ops.push({ k: 'rect', x: x + indent, y: top + 2, w: 3, h: y - top - 4, color: look.accent });
    } else if (b.t === 'h') {
      const s = size * (b.depth <= 3 ? 1.15 : 1.05);
      const lines = wrap(b.runs.map((r) => ({ ...r, b: true })), f, s, w, look);
      y = emitLines(ops, lines, x, y, s * 1.3);
    } else if (b.t === 'code') {
      const s = size * 0.78;
      const clh = s * 1.4;
      const charW = f.mono.widthOfTextAtSize('m', s);
      const cols = Math.max(10, Math.floor((w - 28) / charW));
      const rows: string[] = [];
      for (const l of winAnsi(b.text).split('\n')) {
        if (!l.length) rows.push('');
        for (let i = 0; i < l.length; i += cols) rows.push(l.slice(i, i + cols));
      }
      const hh = rows.length * clh + 20;
      ops.push({ k: 'rect', x, y, w, h: hh, color: look.surface, stroke: look.line });
      ops.push({ k: 'rect', x, y, w: 3, h: hh, color: look.accent });
      let cy = y + 10;
      for (const r of rows) {
        if (r) ops.push({ k: 'text', x: x + 16, y: cy + clh * 0.75, text: r, font: f.mono, size: s, color: look.ink });
        cy += clh;
      }
      y += hh;
    } else if (b.t === 'table') {
      const s = size * 0.8;
      const tlh = s * 1.3;
      const cols = Math.max(b.header.length, ...b.rows.map((r) => r.length));
      const cw = w / cols;
      const rowsAll = [b.header, ...b.rows];
      rowsAll.forEach((row, ri) => {
        const cells = Array.from({ length: cols }, (_, ci) => wrap((row[ci] ?? []).map((r) => (ri === 0 ? { ...r, b: true } : r)), f, s, cw - 16, look));
        const rh = Math.max(1, ...cells.map((c) => c.length)) * tlh + 12;
        if (ri === 0) ops.push({ k: 'rect', x, y, w, h: rh, color: look.surface });
        cells.forEach((c, ci) => emitLines(ops, c, x + ci * cw + 8, y + 6, tlh));
        ops.push({ k: 'rect', x, y: y + rh - 0.5, w, h: ri === 0 ? 1.5 : 0.75, color: ri === 0 ? look.accent : look.line });
        y += rh;
      });
    } else if (b.t === 'img') {
      const img = ctx.image?.(b.target);
      if (!img) {
        const lines = wrap([{ text: `[imagem: ${b.alt || b.target}]`, i: true }], f, size * 0.8, w, look, { color: look.muted });
        y = emitLines(ops, lines, x, y, size * 1.1);
      } else {
        const fit = contain(img.w, img.h, w, maxImgH);
        ops.push({ k: 'img', x: x + (w - fit.w) / 2, y, w: fit.w, h: fit.h, target: b.target });
        y += fit.h;
      }
    }
  });
  return { ops, h: y - y0 };
}

/** Escolhe a maior letra (de `max` até `min`) com que os blocos cabem na altura. */
function fit(blocks: Block[], ctx: Ctx, x: number, y: number, w: number, h: number, max: number, min = 11): Op[] {
  let last: { ops: Op[]; h: number } | null = null;
  for (let s = max; s >= min; s -= 1) {
    last = layoutBlocks(blocks, ctx, x, y, w, s, Math.min(h, 300));
    if (last.h <= h) return last.ops;
  }
  return last!.ops;
}

function slideOps(m: SlideModel, ctx: Ctx, index: number, total: number): Op[] {
  const { f, look } = ctx;
  const ops: Op[] = [{ k: 'rect', x: 0, y: 0, w: W, h: H, color: look.bg }];
  const titleRuns = m.title ?? [];
  const blocks = m.blocks;

  if (m.layout === 'capa' || m.layout === 'seção') {
    const capa = m.layout === 'capa';
    const ts = capa ? 50 : 42;
    const tw = capa ? W - 2 * M - 80 : W - 2 * M - 40;
    const tLines = wrap(titleRuns.map((r) => ({ ...r, b: true })), f, ts, tw, look);
    const sub = blocks.filter((b): b is Extract<Block, { t: 'p' }> => b.t === 'p');
    const sLines = sub.flatMap((b) => wrap(b.runs, f, 20, tw, look, { color: look.muted }));
    const blockH = tLines.length * ts * 1.15 + (sLines.length ? 34 + sLines.length * 28 : 0);
    let y = (H - blockH) / 2 - 10;
    if (capa) {
      y = emitLines(ops, tLines, (W - tw) / 2, y, ts * 1.15, 'center', tw);
      ops.push({ k: 'rect', x: W / 2 - 36, y: y + 12, w: 72, h: 3, color: look.accent });
      emitLines(ops, sLines, (W - tw) / 2, y + 34, 28, 'center', tw);
      // marca discreta: o anel do tanden no canto
      ops.push({ k: 'dot', x: W - M, y: H - M + 8, r: 7, color: look.accent });
      ops.push({ k: 'dot', x: W - M, y: H - M + 8, r: 4.5, color: look.bg });
    } else {
      ops.push({ k: 'rect', x: M, y, w: 5, h: blockH, color: look.accent });
      y = emitLines(ops, tLines, M + 30, y, ts * 1.15);
      emitLines(ops, sLines, M + 30, y + 20, 28);
    }
  } else if (m.layout === 'imagem' && !titleRuns.length) {
    // só a imagem (ex.: página de PDF importado): ocupa o slide inteiro, sem rodapé
    const img = blocks.find((b) => b.t === 'img');
    if (img) ops.push(...layoutBlocks([img], ctx, 0, 0, W, 18, H).ops);
    const one = ops.find((o) => o.k === 'img');
    if (one) one.y = (H - one.h) / 2;
    return ops;
} else if (m.layout === 'imagem') {
    const img = blocks.find((b) => b.t === 'img');
    let top = 28;
    if (titleRuns.length) {
      const tl = wrap(titleRuns.map((r) => ({ ...r, b: true })), f, 24, W - 2 * M, look);
      top = emitLines(ops, tl.slice(0, 2), M, 26, 30) + 10;
    }
    if (img) ops.push(...layoutBlocks([img], ctx, 28, top, W - 56, 18, H - top - 30).ops);
  } else {
    // conteúdo e dividido: título no alto, corpo embaixo
    let y = 40;
    if (titleRuns.length) {
      const tl = wrap(titleRuns.map((r) => ({ ...r, b: true })), f, 32, W - 2 * M, look);
      y = emitLines(ops, tl.slice(0, 2), M, y, 38);
      ops.push({ k: 'rect', x: M, y: y + 8, w: 56, h: 3, color: look.accent });
      y += 30;
    }
    const bottom = H - 44;
    if (m.layout === 'dividido') {
      const img = blocks.find((b) => b.t === 'img')!;
      const rest = blocks.filter((b) => b !== img);
      const colW = (W - 2 * M) * 0.54;
      ops.push(...fit(rest, ctx, M, y, colW, bottom - y, 24));
      const ix = M + colW + 32;
      ops.push(...layoutBlocks([img], ctx, ix, y, W - M - ix, 18, bottom - y).ops);
    } else {
      ops.push(...fit(blocks, ctx, M, y, W - 2 * M, bottom - y, 26));
    }
  }

  // rodapé: número e a linha de progresso
  const num = `${index + 1}`;
  ops.push({ k: 'text', x: W - M - f.r.widthOfTextAtSize(num, 10), y: H - 16, text: num, font: f.r, size: 10, color: look.muted });
  ops.push({ k: 'rect', x: 0, y: H - 3, w: W, h: 3, color: look.line });
  ops.push({ k: 'rect', x: 0, y: H - 3, w: (W * (index + 1)) / total, h: 3, color: look.accent });
  return ops;
}

function draw(page: PDFPage, ops: Op[], images: Map<string, PDFImage>): void {
  for (const o of ops) {
    if (o.k === 'rect') {
      page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: hex(o.color), ...(o.stroke ? { borderColor: hex(o.stroke), borderWidth: 0.75 } : {}) });
    } else if (o.k === 'dot') {
      page.drawCircle({ x: o.x, y: H - o.y, size: o.r, color: hex(o.color) });
    } else if (o.k === 'text') {
      if (!o.text.trim()) continue;
      page.drawText(o.text, { x: o.x, y: H - o.y, size: o.size, font: o.font, color: hex(o.color) });
      if (o.under) page.drawLine({ start: { x: o.x, y: H - o.y - 2 }, end: { x: o.x + o.font.widthOfTextAtSize(o.text, o.size), y: H - o.y - 2 }, thickness: 0.6, color: hex(o.color) });
    } else if (o.k === 'img') {
      const im = images.get(o.target);
      if (im) page.drawImage(im, { x: o.x, y: H - o.y - o.h, width: o.w, height: o.h });
    }
  }
}

export async function deckToPdf(deck: Deck, opts: DeckExportOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(deck.title || 'Apresentação'));
  doc.setCreator('Tanden Engine');
  doc.setProducer('Tanden Engine');
  if (opts.author) doc.setAuthor(winAnsi(opts.author));
  const f: Fonts = {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
    bi: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const ctx: Ctx = { f, look: opts.look, image: opts.image };
  const images = new Map<string, PDFImage>();
  const models = deck.slides.map(slideModel);
  for (const m of models) {
    for (const b of m.blocks) {
      if (b.t !== 'img' || images.has(b.target)) continue;
      const img = opts.image?.(b.target);
      if (!img) continue;
      try {
        images.set(b.target, img.mime === 'image/png' ? await doc.embedPng(img.data) : await doc.embedJpg(img.data));
      } catch {
        // imagem corrompida: o slide sai sem ela
      }
    }
  }
  if (!models.length) models.push({ layout: 'capa', title: [{ text: deck.title || 'Apresentação' }], titleDepth: 1, blocks: [], notes: '' });
  models.forEach((m, i) => {
    const page = doc.addPage([W, H]);
    draw(page, slideOps(m, ctx, i, models.length), images);
  });
  return doc.save();
}
