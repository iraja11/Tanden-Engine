import { strToU8, zipSync } from 'fflate';
import type { Deck } from './deck';
import { contain, type DeckExportOptions, type SlideImage, type SlideLook } from './look';
import { estimateLines, plain, slideModel, type Block, type Run, type SlideModel } from './model';

/*
 * Apresentação → .pptx (PowerPoint, Google Slides, LibreOffice Impress).
 * Os slides saem com o mesmo arranjo do PDF: título como marcador de título
 * (o importador e o modo de tópicos do PowerPoint entendem), corpo em caixa
 * de texto com marcadores de verdade, tabelas nativas, imagens embutidas e
 * as notas do apresentador nas anotações de cada slide.
 */

const W = 960;
const H = 540;
const M = 56;
const EMU = 12700; // 1 pt
const e = (pt: number) => Math.round(pt * EMU);

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const FONT_TITLE = 'Chakra Petch';
const FONT_BODY = 'Manrope';
const FONT_MONO = 'JetBrains Mono';

const x = (s: string): string =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const col = (c: string) => c.replace('#', '').toUpperCase();
const fill = (c: string) => `<a:solidFill><a:srgbClr val="${col(c)}"/></a:solidFill>`;

class SlideXml {
  shapes: string[] = [];
  rels: Array<{ id: string; type: string; target: string; external?: boolean }> = [];
  private nextId = 2;

  constructor(readonly look: SlideLook) {}

  id(): number {
    return this.nextId++;
  }

  rel(type: string, target: string, external = false): string {
    const hit = this.rels.find((r) => r.type === type && r.target === target);
    if (hit) return hit.id;
    const id = `rId${this.rels.length + 1}`;
    this.rels.push({ id, type, target, external });
    return id;
  }

  rect(px: number, py: number, w: number, h: number, color: string): void {
    const id = this.id();
    this.shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Traço ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(px)}" y="${e(py)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill(color)}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`,
    );
  }

  ellipse(cx: number, cy: number, r: number, color: string): void {
    const id = this.id();
    this.shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Marca ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(cx - r)}" y="${e(cy - r)}"/><a:ext cx="${e(2 * r)}" cy="${e(2 * r)}"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>${fill(color)}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`,
    );
  }

  text(px: number, py: number, w: number, h: number, paras: string, opts: { title?: boolean; anchor?: 't' | 'ctr' | 'b'; fillColor?: string; inset?: number } = {}): void {
    const id = this.id();
    const nv = opts.title
      ? `<p:nvSpPr><p:cNvPr id="${id}" name="Título ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>`
      : `<p:nvSpPr><p:cNvPr id="${id}" name="Texto ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`;
    const ins = e(opts.inset ?? 0);
    this.shapes.push(
      `<p:sp>${nv}<p:spPr><a:xfrm><a:off x="${e(px)}" y="${e(py)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${opts.fillColor ? fill(opts.fillColor) : '<a:noFill/>'}</p:spPr>` +
        `<p:txBody><a:bodyPr wrap="square" lIns="${ins}" tIns="${ins}" rIns="${ins}" bIns="${ins}" anchor="${opts.anchor ?? 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras || '<a:p><a:endParaRPr lang="pt-BR"/></a:p>'}</p:txBody></p:sp>`,
    );
  }

  slideNumber(px: number, py: number, w: number, h: number, n: number): void {
    const id = this.id();
    this.shapes.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Número do slide ${id}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="12"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(px)}" y="${e(py)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm></p:spPr>` +
        `<p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/><a:p><a:pPr algn="r"/><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="pt-BR" sz="1000">${fill(this.look.muted)}<a:latin typeface="${FONT_BODY}"/></a:rPr><a:t>${n}</a:t></a:fld></a:p></p:txBody></p:sp>`,
    );
  }

  picture(px: number, py: number, w: number, h: number, relId: string, alt: string): void {
    const id = this.id();
    this.shapes.push(
      `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Imagem ${id}" descr="${x(alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
        `<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr><a:xfrm><a:off x="${e(px)}" y="${e(py)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
    );
  }

  table(px: number, py: number, w: number, b: Extract<Block, { t: 'table' }>, size: number): number {
    const id = this.id();
    const cols = Math.max(b.header.length, ...b.rows.map((r) => r.length), 1);
    const cw = Math.floor(e(w) / cols);
    const rh = size * 1.3 + 12;
    const rows = [b.header, ...b.rows];
    const tr = rows
      .map((row, ri) => {
        const cells = Array.from({ length: cols }, (_, ci) => {
          const runs = (row[ci] ?? []).map((r) => (ri === 0 ? { ...r, b: true } : r));
          const p = `<a:p>${this.runs(runs, size, this.look.ink, FONT_BODY)}<a:endParaRPr lang="pt-BR" sz="${Math.round(size * 100)}"/></a:p>`;
          const line = `<a:lnB w="${ri === 0 ? 19050 : 9525}">${fill(ri === 0 ? this.look.accent : this.look.line)}</a:lnB>`;
          return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${p}</a:txBody><a:tcPr marL="${e(8)}" marR="${e(8)}" marT="${e(5)}" marB="${e(5)}">${line}${ri === 0 ? fill(this.look.surface) : '<a:noFill/>'}</a:tcPr></a:tc>`;
        }).join('');
        return `<a:tr h="${e(rh)}">${cells}</a:tr>`;
      })
      .join('');
    const grid = Array.from({ length: cols }, () => `<a:gridCol w="${cw}"/>`).join('');
    const h = rows.length * rh;
    this.shapes.push(
      `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Tabela ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
        `<p:xfrm><a:off x="${e(px)}" y="${e(py)}"/><a:ext cx="${cw * cols}" cy="${e(h)}"/></p:xfrm>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid>${grid}</a:tblGrid>${tr}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
    );
    return h;
  }

  /** Pedaços de texto com estilo → <a:r>. */
  runs(runs: Run[], size: number, color: string, font: string): string {
    return runs
      .flatMap((r) => r.text.split('\n').map((t, i) => ({ ...r, text: t, br: i > 0 })))
      .map((r) => {
        const attrs = [`lang="pt-BR"`, `sz="${Math.round((r.code ? size * 0.9 : size) * 100)}"`];
        if (r.b) attrs.push('b="1"');
        if (r.i) attrs.push('i="1"');
        if (r.s) attrs.push('strike="sngStrike"');
        if (r.link) attrs.push('u="sng"');
        attrs.push('dirty="0"');
        const c = r.link || r.code ? this.look.accent : color;
        const hl = r.mark ? `<a:highlight><a:srgbClr val="${this.look.dark ? '5A3A12' : 'FFE2A8'}"/></a:highlight>` : '';
        const typeface = r.code ? FONT_MONO : font;
        const link = r.link && /^(https?|mailto):/i.test(r.link) ? `<a:hlinkClick r:id="${this.rel(`${REL}/hyperlink`, r.link, true)}"/>` : '';
        const run = r.text ? `<a:r><a:rPr ${attrs.join(' ')}>${fill(c)}${hl}<a:latin typeface="${typeface}"/>${link}</a:rPr><a:t>${x(r.text)}</a:t></a:r>` : '';
        return (r.br ? `<a:br><a:rPr lang="pt-BR" sz="${Math.round(size * 100)}"/></a:br>` : '') + run;
      })
      .join('');
  }

  xml(): string {
    return `${HEAD}<p:sld ${NS}><p:cSld><p:bg><p:bgPr>${fill(this.look.bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${this.shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
}

/** Blocos de texto (parágrafos, listas, subtítulos, código) → parágrafos <a:p>. */
function paragraphs(s: SlideXml, blocks: Block[], size: number, look: SlideLook, align: 'l' | 'ctr' = 'l', color = look.ink): string {
  const out: string[] = [];
  blocks.forEach((b, i) => {
    const before = i === 0 ? 0 : Math.round(size * 0.5 * 100);
    const spc = `<a:spcBef><a:spcPts val="${before}"/></a:spcBef>`;
    if (b.t === 'p') {
      const indent = b.level > 0 ? e(26 * b.level) : 0;
      let bu = '<a:buNone/>';
      if (b.bullet === '•') bu = `<a:buClr><a:srgbClr val="${col(look.accent)}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>`;
      else if (b.bullet === '☐' || b.bullet === '☑') bu = `<a:buClr><a:srgbClr val="${col(look.accent)}"/></a:buClr><a:buFont typeface="Segoe UI Symbol"/><a:buChar char="${b.bullet}"/>`;
      else if (b.bullet) bu = `<a:buClr><a:srgbClr val="${col(look.accent)}"/></a:buClr><a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod" startAt="${parseInt(b.bullet, 10) || 1}"/>`;
      const lv = b.level > 1 ? ` lvl="${Math.min(8, b.level - 1)}"` : '';
      const hang = b.bullet && b.bullet !== '•' && b.bullet !== '☐' && b.bullet !== '☑' ? 26 : 18;
      const mar = (b.bullet ? `marL="${indent + e(hang - 18)}" indent="${-e(hang)}"` : `marL="${indent}" indent="0"`) + lv;
      const runs = b.quote ? b.runs.map((r) => ({ ...r, i: true })) : b.runs;
      out.push(`<a:p><a:pPr ${mar} algn="${align}">${spc}${bu}</a:pPr>${s.runs(runs, size, b.quote ? look.muted : color, FONT_BODY)}<a:endParaRPr lang="pt-BR" sz="${Math.round(size * 100)}"/></a:p>`);
    } else if (b.t === 'h') {
      const sz = size * (b.depth <= 3 ? 1.15 : 1.05);
      out.push(`<a:p><a:pPr marL="0" indent="0" algn="${align}">${spc}<a:buNone/></a:pPr>${s.runs(b.runs.map((r) => ({ ...r, b: true })), sz, look.ink, FONT_TITLE)}</a:p>`);
    }
  });
  return out.join('');
}

/** Corpo do slide em faixas (texto, tabela, código...) empilhadas, com a maior letra que caiba. */
function body(s: SlideXml, blocks: Block[], look: SlideLook, px: number, py: number, w: number, h: number, max: number): void {
  type Seg = { table: Extract<Block, { t: 'table' }> } | { code: Extract<Block, { t: 'code' }> } | { text: Block[] };
  const segs: Seg[] = [];
  for (const b of blocks) {
    if (b.t === 'img') continue;
    if (b.t === 'table') segs.push({ table: b });
    else if (b.t === 'code') segs.push({ code: b });
    else {
      const last = segs[segs.length - 1];
      if (last && 'text' in last) last.text.push(b);
      else segs.push({ text: [b] });
    }
  }
  const segH = (sg: Seg, sz: number) => {
    if ('table' in sg) return (sg.table.rows.length + 1) * (sz * 0.8 * 1.3 + 12);
    if ('code' in sg) return sg.code.text.split('\n').length * sz * 0.8 * 1.25 + 20;
    return estimateLines(sg.text, Math.floor(w / (sz * 0.52))) * sz * 1.32;
  };
  const gap = (sz: number) => sz * 0.6;
  const total = (sz: number) => segs.reduce((n, sg) => n + segH(sg, sz) + gap(sz), 0);
  let size = max;
  while (size > 11 && total(size) > h) size -= 1;
  let y = py;
  for (const sg of segs) {
    if ('table' in sg) y += s.table(px, y, w, sg.table, size * 0.8);
    else if ('code' in sg) {
      const lines = sg.code.text.replace(/\t/g, '    ').split('\n');
      const runs = lines.flatMap((l, i) => [...(i ? [{ text: '\n' }] : []), { text: l || ' ' }]);
      const ch = segH(sg, size);
      s.rect(px, y, 3, ch, look.accent);
      s.text(px + 3, y, w - 3, ch, `<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr>${s.runs(runs, size * 0.8, look.ink, FONT_MONO)}</a:p>`, { fillColor: look.surface, inset: 10 });
      y += ch;
    } else {
      const th = segH(sg, size);
      s.text(px, y, w, th, paragraphs(s, sg.text, size, look));
      y += th;
    }
    y += gap(size);
  }
}

function addImage(s: SlideXml, img: SlideImage | null | undefined, media: Map<string, string>, target: string, alt: string, bx: number, by: number, bw: number, bh: number, files: Record<string, Uint8Array>): void {
  if (!img) {
    s.text(bx, by + bh / 2 - 14, bw, 28, `<a:p><a:pPr algn="ctr"/>${s.runs([{ text: `[imagem: ${alt || target}]`, i: true }], 14, s.look.muted, FONT_BODY)}</a:p>`);
    return;
  }
  let name = media.get(target);
  if (!name) {
    name = `image${media.size + 1}.${img.mime === 'image/png' ? 'png' : 'jpeg'}`;
    media.set(target, name);
    files[`ppt/media/${name}`] = img.data;
  }
  const rid = s.rel(`${REL}/image`, `../media/${name}`);
  const fit = contain(img.w, img.h, bw, bh);
  s.picture(bx + (bw - fit.w) / 2, by + (bh - fit.h) / 2, fit.w, fit.h, rid, alt);
}

function buildSlide(m: SlideModel, index: number, total: number, opts: DeckExportOptions, media: Map<string, string>, files: Record<string, Uint8Array>): SlideXml {
  const look = opts.look;
  const s = new SlideXml(look);
  const title = m.title ?? [];
  const titleP = (sz: number, align: 'l' | 'ctr') => `<a:p><a:pPr algn="${align}"/>${s.runs(title, sz, look.ink, FONT_TITLE)}<a:endParaRPr lang="pt-BR" sz="${sz * 100}"/></a:p>`;
  const texts = m.blocks.filter((b) => b.t !== 'img');
  const imgs = m.blocks.filter((b): b is Extract<Block, { t: 'img' }> => b.t === 'img');

  if (m.layout === 'capa') {
    s.text(M, 120, W - 2 * M, 170, titleP(50, 'ctr'), { title: true, anchor: 'b' });
    s.rect(W / 2 - 36, 304, 72, 3, look.accent);
    s.text(M + 40, 326, W - 2 * M - 80, 130, paragraphs(s, texts, 20, look, 'ctr', look.muted));
    s.ellipse(W - M, H - M + 8, 7, look.accent);
    s.ellipse(W - M, H - M + 8, 4.5, look.bg);
  } else if (m.layout === 'seção') {
    s.rect(M, 190, 5, 160, look.accent);
    s.text(M + 30, 150, W - 2 * M - 30, 130, titleP(42, 'l'), { title: true, anchor: 'b' });
    s.text(M + 30, 290, W - 2 * M - 30, 90, paragraphs(s, texts, 20, look, 'l', look.muted));
  } else if (m.layout === 'imagem' && !title.length) {
    // só a imagem (ex.: página de PDF importado): ocupa o slide inteiro, sem rodapé
    const im = imgs[0];
    if (im) addImage(s, opts.image?.(im.target), media, im.target, im.alt, 0, 0, W, H, files);
    return s;
} else if (m.layout === 'imagem') {
    let top = 28;
    if (title.length) {
      s.text(M, 20, W - 2 * M, 40, titleP(24, 'l'), { title: true, anchor: 'ctr' });
      top = 70;
    }
    const im = imgs[0];
    if (im) addImage(s, opts.image?.(im.target), media, im.target, im.alt, 28, top, W - 56, H - top - 30, files);
  } else {
    let y = 40;
    if (title.length) {
      const two = plain(title).length > 46;
      s.text(M, y, W - 2 * M, two ? 84 : 46, titleP(two ? 28 : 32, 'l'), { title: true, anchor: 'b' });
      y += two ? 90 : 52;
      s.rect(M, y, 56, 3, look.accent);
      y += 22;
    }
    const bottom = H - 44;
    if (imgs.length) {
      const colW = (W - 2 * M) * 0.54;
      body(s, texts, look, M, y, colW, bottom - y, 24);
      const ix = M + colW + 32;
      const each = (bottom - y - (imgs.length - 1) * 12) / imgs.length;
      imgs.forEach((im, i) => addImage(s, opts.image?.(im.target), media, im.target, im.alt, ix, y + i * (each + 12), W - M - ix, each, files));
    } else body(s, texts, look, M, y, W - 2 * M, bottom - y, 26);
  }

  // rodapé: número e linha de progresso
  s.slideNumber(W - M - 60, H - 30, 60, 18, index + 1);
  s.rect(0, H - 3, W, 3, look.line);
  s.rect(0, H - 3, (W * (index + 1)) / total, 3, look.accent);
  return s;
}

/* ----------------------------------------------------- peças fixas */

const THEME = (look: SlideLook, name: string) => `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${name}"><a:themeElements>
<a:clrScheme name="Tanden"><a:dk1><a:srgbClr val="${col(look.dark ? look.bg : look.ink)}"/></a:dk1><a:lt1><a:srgbClr val="${col(look.dark ? look.ink : look.bg)}"/></a:lt1><a:dk2><a:srgbClr val="${col(look.dark ? look.surface : look.muted)}"/></a:dk2><a:lt2><a:srgbClr val="${col(look.dark ? look.muted : look.surface)}"/></a:lt2><a:accent1><a:srgbClr val="${col(look.accent)}"/></a:accent1><a:accent2><a:srgbClr val="8C8A96"/></a:accent2><a:accent3><a:srgbClr val="7FD1A8"/></a:accent3><a:accent4><a:srgbClr val="4CC9F0"/></a:accent4><a:accent5><a:srgbClr val="FF6B6B"/></a:accent5><a:accent6><a:srgbClr val="C8C7CF"/></a:accent6><a:hlink><a:srgbClr val="${col(look.accent)}"/></a:hlink><a:folHlink><a:srgbClr val="${col(look.muted)}"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Tanden"><a:majorFont><a:latin typeface="${FONT_TITLE}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT_BODY}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Tanden"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const ph = (id: number, name: string, type: string, idx: string, px: number, py: number, w: number, h: number) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${type}"${idx ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(px)}" y="${e(py)}"/><a:ext cx="${e(w)}" cy="${e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="pt-BR"/></a:p></p:txBody></p:sp>`;
const lvl = (sz: number, color: string, font: string, bold = false) => `<a:lvl1pPr><a:defRPr sz="${sz}"${bold ? ' b="1"' : ''}>${fill(color)}<a:latin typeface="${font}"/></a:defRPr></a:lvl1pPr>`;
const CLRMAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

const MASTER = (look: SlideLook) =>
  `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr>${fill(look.bg)}<a:effectLst/></p:bgPr></p:bg><p:spTree>${GRP}${ph(2, 'Título', 'title', '', M, 40, W - 2 * M, 46)}${ph(3, 'Texto', 'body', '1', M, 118, W - 2 * M, H - 162)}${ph(4, 'Número do slide', 'sldNum', '12', W - M - 60, H - 30, 60, 18)}</p:spTree></p:cSld>` +
  `<p:clrMap ${CLRMAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>` +
  `<p:txStyles><p:titleStyle>${lvl(3200, look.ink, FONT_TITLE, true)}</p:titleStyle><p:bodyStyle>${lvl(2400, look.ink, FONT_BODY)}</p:bodyStyle><p:otherStyle>${lvl(1800, look.ink, FONT_BODY)}</p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT = `${HEAD}<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="Só título"><p:spTree>${GRP}${ph(2, 'Título', 'title', '', M, 40, W - 2 * M, 46)}${ph(3, 'Número do slide', 'sldNum', '12', W - M - 60, H - 30, 60, 18)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const NOTES_MASTER = `${HEAD}<p:notesMaster ${NS}><p:cSld><p:spTree>${GRP}${ph(2, 'Imagem do slide', 'sldImg', '', 54, 54, 432, 243)}${ph(3, 'Anotações', 'body', '1', 54, 320, 432, 380)}</p:spTree></p:cSld><p:clrMap ${CLRMAP}/></p:notesMaster>`;

const notesSlide = (text: string) => {
  const paras = text
    .split('\n')
    .map((l) => `<a:p><a:r><a:rPr lang="pt-BR" dirty="0"/><a:t>${x(l)}</a:t></a:r></a:p>`)
    .join('');
  return `${HEAD}<p:notes ${NS}><p:cSld><p:spTree>${GRP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Imagem do slide"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Anotações"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
};

const rels = (list: Array<{ id: string; type: string; target: string; external?: boolean }>) =>
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${x(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`)
    .join('')}</Relationships>`;

export function deckToPptx(deck: Deck, opts: DeckExportOptions): Uint8Array {
  const look = opts.look;
  const models = deck.slides.map(slideModel);
  if (!models.length) models.push({ layout: 'capa', title: [{ text: deck.title || 'Apresentação' }], titleDepth: 1, blocks: [], notes: '' });
  const files: Record<string, Uint8Array> = {};
  const put = (p: string, s: string) => (files[p] = strToU8(s));
  const media = new Map<string, string>();
  const ct: string[] = [];
  const presRels: Array<{ id: string; type: string; target: string }> = [
    { id: 'rId1', type: `${REL}/slideMaster`, target: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: `${REL}/notesMaster`, target: 'notesMasters/notesMaster1.xml' },
    { id: 'rId3', type: `${REL}/theme`, target: 'theme/theme1.xml' },
    { id: 'rId4', type: `${REL}/presProps`, target: 'presProps.xml' },
    { id: 'rId5', type: `${REL}/viewProps`, target: 'viewProps.xml' },
    { id: 'rId6', type: `${REL}/tableStyles`, target: 'tableStyles.xml' },
  ];
  const sldIds: string[] = [];

  models.forEach((m, i) => {
    const n = i + 1;
    const s = buildSlide(m, i, models.length, opts, media, files);
    s.rel(`${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml');
    if (m.notes) {
      s.rel(`${REL}/notesSlide`, `../notesSlides/notesSlide${n}.xml`);
      put(`ppt/notesSlides/notesSlide${n}.xml`, notesSlide(m.notes));
      put(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, rels([
        { id: 'rId1', type: `${REL}/notesMaster`, target: '../notesMasters/notesMaster1.xml' },
        { id: 'rId2', type: `${REL}/slide`, target: `../slides/slide${n}.xml` },
      ]));
      ct.push(`<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`);
    }
    put(`ppt/slides/slide${n}.xml`, s.xml());
    put(`ppt/slides/_rels/slide${n}.xml.rels`, rels(s.rels));
    ct.push(`<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    const rid = `rId${presRels.length + 1}`;
    presRels.push({ id: rid, type: `${REL}/slide`, target: `slides/slide${n}.xml` });
    sldIds.push(`<p:sldId id="${255 + n}" r:id="${rid}"/>`);
  });

  put('ppt/presentation.xml', `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${sldIds.join('')}</p:sldIdLst><p:sldSz cx="${e(W)}" cy="${e(H)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${lvl(1800, look.ink, FONT_BODY)}</p:defaultTextStyle></p:presentation>`);
  put('ppt/_rels/presentation.xml.rels', rels(presRels));
  put('ppt/slideMasters/slideMaster1.xml', MASTER(look));
  put('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([
    { id: 'rId1', type: `${REL}/slideLayout`, target: '../slideLayouts/slideLayout1.xml' },
    { id: 'rId2', type: `${REL}/theme`, target: '../theme/theme1.xml' },
  ]));
  put('ppt/slideLayouts/slideLayout1.xml', LAYOUT);
  put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([{ id: 'rId1', type: `${REL}/slideMaster`, target: '../slideMasters/slideMaster1.xml' }]));
  put('ppt/notesMasters/notesMaster1.xml', NOTES_MASTER);
  put('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([{ id: 'rId1', type: `${REL}/theme`, target: '../theme/theme2.xml' }]));
  put('ppt/theme/theme1.xml', THEME(look, 'Tanden'));
  put('ppt/theme/theme2.xml', THEME({ ...look, bg: '#ffffff', ink: '#1d1b18', surface: '#f3f1ec', muted: '#6b665c', dark: false }, 'Tanden anotações'));
  put('ppt/presProps.xml', `${HEAD}<p:presentationPr ${NS}/>`);
  put('ppt/viewProps.xml', `${HEAD}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  put('ppt/tableStyles.xml', `${HEAD}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  put('docProps/core.xml', `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(deck.title)}</dc:title><dc:creator>${x(opts.author ?? 'Tanden Engine')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  put('docProps/app.xml', `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tanden Engine</Application><Slides>${models.length}</Slides></Properties>`);
  put('_rels/.rels', rels([
    { id: 'rId1', type: `${REL}/officeDocument`, target: 'ppt/presentation.xml' },
    { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
    { id: 'rId3', type: `${REL}/extended-properties`, target: 'docProps/app.xml' },
  ]));
  put('[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>` +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    `<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    `<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>` +
    `<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>` +
    `<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `${ct.join('')}</Types>`);

  return zipSync(files, { level: 6 });
}
