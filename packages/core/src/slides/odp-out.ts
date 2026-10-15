import { metaXml, ODF_MIME, ODF_NS, odfPackage, XML_HEAD } from '../convert/odf';
import { escXml } from '../convert/xml-lite';
import type { Deck } from './deck';
import { contain, type DeckExportOptions, type SlideImage, type SlideLook } from './look';
import { estimateLines, plain, slideModel, type Block, type Run, type SlideModel } from './model';

/*
 * Apresentação → .odp (LibreOffice Impress; o PowerPoint e o Google Slides
 * também abrem). Mesmo arranjo do .pptx e do PDF: título como marcador de
 * título (aparece no painel de estrutura do Impress), corpo com listas de
 * verdade, tabelas nativas, imagens embutidas e notas do apresentador.
 */

const W = 960;
const H = 540;
const M = 56;
const cm = (pt: number): string => `${((pt * 2.54) / 72).toFixed(3)}cm`;

const FONT_TITLE = 'Chakra Petch';
const FONT_BODY = 'Manrope';
const FONT_MONO = 'JetBrains Mono';

/** Estilos automáticos sem repetição: mesmo conteúdo → mesmo nome. */
class Styles {
  private byKey = new Map<string, string>();
  readonly xml: string[] = [];
  private counts = new Map<string, number>();

  get(prefix: string, family: string, inner: string, extra = ''): string {
    const key = `${prefix}|${family}|${extra}|${inner}`;
    let name = this.byKey.get(key);
    if (!name) {
      const n = (this.counts.get(prefix) ?? 0) + 1;
      this.counts.set(prefix, n);
      name = `${prefix}${n}`;
      this.xml.push(family === 'list' ? `<text:list-style style:name="${name}">${inner}</text:list-style>` : `<style:style style:name="${name}" style:family="${family}"${extra}>${inner}</style:style>`);
      this.byKey.set(key, name);
    }
    return name;
  }
}

class Page {
  shapes: string[] = [];
  constructor(
    readonly st: Styles,
    readonly look: SlideLook,
    private readonly pictures: Record<string, Uint8Array>,
    private readonly media: Map<string, string>,
  ) {}

  private box(x: number, y: number, w: number, h: number): string {
    return `svg:x="${cm(x)}" svg:y="${cm(y)}" svg:width="${cm(w)}" svg:height="${cm(h)}"`;
  }

  private frameStyle(family: 'graphic' | 'presentation', anchor: 'top' | 'middle' | 'bottom', fill?: string, inset = 0): string {
    const fillXml = fill ? `draw:fill="solid" draw:fill-color="${fill}"` : 'draw:fill="none"';
    const pad = cm(inset);
    return this.st.get(
      family === 'graphic' ? 'gr' : 'pr',
      family,
      `<style:graphic-properties draw:stroke="none" ${fillXml} draw:textarea-vertical-align="${anchor}" draw:textarea-horizontal-align="justify" draw:auto-grow-height="false" draw:auto-grow-width="false" draw:fit-to-size="false" fo:min-height="0cm" fo:padding-top="${pad}" fo:padding-bottom="${pad}" fo:padding-left="${pad}" fo:padding-right="${pad}" fo:wrap-option="wrap"/>`,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    const gs = this.st.get('gr', 'graphic', `<style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="${color}"/>`);
    this.shapes.push(`<draw:rect draw:style-name="${gs}" draw:layer="layout" ${this.box(x, y, w, h)}/>`);
  }

  ellipse(cx: number, cy: number, r: number, color: string): void {
    const gs = this.st.get('gr', 'graphic', `<style:graphic-properties draw:stroke="none" draw:fill="solid" draw:fill-color="${color}"/>`);
    this.shapes.push(`<draw:ellipse draw:style-name="${gs}" draw:layer="layout" ${this.box(cx - r, cy - r, 2 * r, 2 * r)}/>`);
  }

  text(x: number, y: number, w: number, h: number, paras: string, opts: { title?: boolean; anchor?: 'top' | 'middle' | 'bottom'; fill?: string; inset?: number } = {}): void {
    const anchor = opts.anchor ?? 'top';
    const body = paras || '<text:p/>';
    if (opts.title) {
      const ps = this.frameStyle('presentation', anchor, opts.fill, opts.inset);
      this.shapes.push(`<draw:frame presentation:style-name="${ps}" draw:layer="layout" ${this.box(x, y, w, h)} presentation:class="title" presentation:user-transformed="true"><draw:text-box>${body}</draw:text-box></draw:frame>`);
    } else {
      const gs = this.frameStyle('graphic', anchor, opts.fill, opts.inset);
      this.shapes.push(`<draw:frame draw:style-name="${gs}" draw:layer="layout" ${this.box(x, y, w, h)}><draw:text-box>${body}</draw:text-box></draw:frame>`);
    }
  }

  /** Número do slide como campo (o Impress atualiza se a ordem mudar). */
  pageNumber(x: number, y: number, w: number, h: number, n: number): void {
    const ps = this.frameStyle('presentation', 'top');
    const ts = this.st.get('T', 'text', `<style:text-properties fo:font-size="10pt" fo:color="${this.look.muted}" fo:font-family="'${FONT_BODY}'" fo:font-weight="normal"/>`);
    const field = `<text:span text:style-name="${ts}"><text:page-number>${n}</text:page-number></text:span>`;
    this.shapes.push(`<draw:frame presentation:style-name="${ps}" draw:layer="layout" ${this.box(x, y, w, h)} presentation:class="page-number" presentation:user-transformed="true"><draw:text-box>${this.para(field, 'end')}</draw:text-box></draw:frame>`);
  }

  image(img: SlideImage | null | undefined, target: string, alt: string, bx: number, by: number, bw: number, bh: number): void {
    if (!img) {
      this.text(bx, by + bh / 2 - 14, bw, 28, this.para(this.runs([{ text: `[imagem: ${alt || target}]`, i: true }], 14, this.look.muted, FONT_BODY), 'center'));
      return;
    }
    let path = this.media.get(target);
    if (!path) {
      path = `Pictures/imagem${this.media.size + 1}.${img.mime === 'image/png' ? 'png' : 'jpg'}`;
      this.media.set(target, path);
      this.pictures[path] = img.data;
    }
    const fit = contain(img.w, img.h, bw, bh);
    const gs = this.st.get('gr', 'graphic', '<style:graphic-properties draw:stroke="none" draw:fill="none"/>');
    this.shapes.push(
      `<draw:frame draw:style-name="${gs}" draw:layer="layout" ${this.box(bx + (bw - fit.w) / 2, by + (bh - fit.h) / 2, fit.w, fit.h)}><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"><text:p/></draw:image>${alt ? `<svg:desc>${escXml(alt)}</svg:desc>` : ''}</draw:frame>`,
    );
  }

  table(x: number, y: number, w: number, b: Extract<Block, { t: 'table' }>, size: number): number {
    const cols = Math.max(b.header.length, ...b.rows.map((r) => r.length), 1);
    const rh = size * 1.3 + 12;
    const rows = [b.header, ...b.rows];
    const co = this.st.get('co', 'table-column', `<style:table-column-properties style:column-width="${cm(w / cols)}" style:use-optimal-column-width="false"/>`);
    const ro = this.st.get('ro', 'table-row', `<style:table-row-properties style:row-height="${cm(rh)}" style:use-optimal-row-height="false"/>`);
    const cell = (head: boolean) =>
      this.st.get(
        'ce',
        'table-cell',
        `<loext:graphic-properties draw:fill="${head ? 'solid' : 'none'}"${head ? ` draw:fill-color="${this.look.surface}"` : ''} draw:textarea-vertical-align="middle" fo:padding-top="${cm(5)}" fo:padding-bottom="${cm(5)}" fo:padding-left="${cm(8)}" fo:padding-right="${cm(8)}"/>` +
          `<style:paragraph-properties fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="${head ? '1.5pt' : '0.75pt'} solid ${head ? this.look.accent : this.look.line}"/>`,
      );
    const tr = rows
      .map((row, ri) => {
        const cells = Array.from({ length: cols }, (_, ci) => {
          const runs = (row[ci] ?? []).map((r) => (ri === 0 ? { ...r, b: true } : r));
          return `<table:table-cell table:style-name="${cell(ri === 0)}">${this.para(this.runs(runs, size, this.look.ink, FONT_BODY))}</table:table-cell>`;
        }).join('');
        return `<table:table-row table:style-name="${ro}">${cells}</table:table-row>`;
      })
      .join('');
    const h = rows.length * rh;
    const gs = this.st.get('gr', 'graphic', '<style:graphic-properties draw:stroke="none" draw:fill="none"/>');
    this.shapes.push(
      `<draw:frame draw:style-name="${gs}" draw:layer="layout" ${this.box(x, y, w, h)}><table:table table:use-first-row-styles="true">${Array.from({ length: cols }, () => `<table:table-column table:style-name="${co}"/>`).join('')}${tr}</table:table></draw:frame>`,
    );
    return h;
  }

  /** Pedaços de texto com estilo → <text:span>. */
  runs(runs: Run[], size: number, color: string, font: string): string {
    return runs
      .map((r) => {
        if (!r.text) return '';
        const c = r.link || r.code ? this.look.accent : color;
        const props = [
          `fo:font-size="${Math.round((r.code ? size * 0.9 : size) * 10) / 10}pt"`,
          `fo:color="${c}"`,
          `fo:font-family="'${r.code ? FONT_MONO : font}'"`,
          r.b ? 'fo:font-weight="bold"' : 'fo:font-weight="normal"',
          r.i ? 'fo:font-style="italic"' : '',
          r.s ? 'style:text-line-through-style="solid" style:text-line-through-type="single"' : '',
          r.link ? 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '',
          r.mark ? `fo:background-color="${this.look.dark ? '#5a3a12' : '#ffe2a8'}"` : '',
        ]
          .filter(Boolean)
          .join(' ');
        const ts = this.st.get('T', 'text', `<style:text-properties ${props}/>`);
        const body = r.text
          .split('\n')
          .map((line) =>
            escXml(line)
              .replace(/\t/g, '<text:tab/>')
              .replace(/ {2,}/g, (sp) => ` <text:s text:c="${sp.length - 1}"/>`)
              .replace(/^ /, '<text:s/>'),
          )
          .join('<text:line-break/>');
        const inner = r.link && /^(https?|mailto):/i.test(r.link) ? `<text:a xlink:type="simple" xlink:href="${escXml(r.link)}">${body}</text:a>` : body;
        return `<text:span text:style-name="${ts}">${inner}</text:span>`;
      })
      .join('');
  }

  para(inner: string, align: 'start' | 'center' | 'end' = 'start', before = 0): string {
    const ps = this.st.get('P', 'paragraph', `<style:paragraph-properties fo:text-align="${align}" fo:margin-top="${cm(before)}" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:text-indent="0cm"/>`);
    return `<text:p text:style-name="${ps}">${inner}</text:p>`;
  }

  /** Lista de um nível só, com o marcador na cor de destaque. */
  private listStyle(bullet: string): string {
    const levels = Array.from({ length: 9 }, (_, i) => {
      const indent = `<style:list-level-properties text:space-before="${cm(26 * i)}" text:min-label-width="${cm(bullet === 'n' ? 26 : 18)}"/>`;
      if (bullet === 'n') return `<text:list-level-style-number text:level="${i + 1}" style:num-suffix="." style:num-format="1">${indent}<style:text-properties fo:color="${this.look.accent}" fo:font-size="100%"/></text:list-level-style-number>`;
      return `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="${bullet}">${indent}<style:text-properties fo:font-family="${bullet === '•' ? 'Arial' : 'OpenSymbol'}" fo:color="${this.look.accent}" fo:font-size="100%"/></text:list-level-style-bullet>`;
    }).join('');
    return this.st.get('L', 'list', levels);
  }

  /** Blocos de texto (parágrafos, listas, subtítulos) → parágrafos ODF. */
  paragraphs(blocks: Block[], size: number, align: 'start' | 'center' = 'start', color = this.look.ink): string {
    const out: string[] = [];
    blocks.forEach((b, i) => {
      const before = i === 0 ? 0 : size * 0.5;
      if (b.t === 'p') {
        const runs = b.quote ? b.runs.map((r) => ({ ...r, i: true })) : b.runs;
        const p = this.para(this.runs(runs, size, b.quote ? this.look.muted : color, FONT_BODY), align, before);
        if (!b.bullet && b.level === 0) {
          out.push(p);
          return;
        }
        const numbered = !!b.bullet && /^\d+\.$/.test(b.bullet);
        const kind = numbered ? 'n' : b.bullet ?? '•';
        const depth = Math.max(1, b.level);
        const start = numbered ? ` text:start-value="${parseInt(b.bullet!, 10) || 1}"` : '';
        // parágrafo de continuação dentro do item: vai como cabeçalho de lista (sem marcador)
        const item = b.bullet ? `text:list-item${start}` : 'text:list-header';
        let xml = `<${item}>${p}</${item.split(' ')[0]}>`;
        for (let d = 1; d < depth; d++) xml = `<text:list-item><text:list>${xml}</text:list></text:list-item>`;
        out.push(`<text:list text:style-name="${this.listStyle(kind)}">${xml}</text:list>`);
      } else if (b.t === 'h') {
        const sz = size * (b.depth <= 3 ? 1.15 : 1.05);
        out.push(this.para(this.runs(b.runs.map((r) => ({ ...r, b: true })), sz, this.look.ink, FONT_TITLE), align, before));
      }
    });
    return out.join('');
  }

  xml(name: string, dp: string, master: string, notes: string): string {
    return `<draw:page draw:name="${escXml(name)}" draw:style-name="${dp}" draw:master-page-name="${master}">${this.shapes.join('')}${notes}</draw:page>`;
  }
}

/** Corpo do slide em faixas (texto, tabela, código) empilhadas, com a maior letra que caiba. */
function body(s: Page, blocks: Block[], look: SlideLook, px: number, py: number, w: number, h: number, max: number): void {
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
      const ch = segH(sg, size);
      const lines = sg.code.text.replace(/\t/g, '    ').split('\n');
      s.rect(px, y, 3, ch, look.accent);
      s.text(px + 3, y, w - 3, ch, lines.map((l) => s.para(s.runs([{ text: l || ' ' }], size * 0.8, look.ink, FONT_MONO))).join(''), { fill: look.surface, inset: 10 });
      y += ch;
    } else {
      const th = segH(sg, size);
      s.text(px, y, w, th, s.paragraphs(sg.text, size));
      y += th;
    }
    y += gap(size);
  }
}

function buildPage(m: SlideModel, index: number, total: number, opts: DeckExportOptions, page: Page): void {
  const look = opts.look;
  const s = page;
  const title = m.title ?? [];
  const titleP = (sz: number, align: 'start' | 'center') => s.para(s.runs(title.map((r) => ({ ...r, b: true })), sz, look.ink, FONT_TITLE), align);
  const texts = m.blocks.filter((b) => b.t !== 'img');
  const imgs = m.blocks.filter((b): b is Extract<Block, { t: 'img' }> => b.t === 'img');
  const img = (im: Extract<Block, { t: 'img' }>, x: number, y: number, w: number, h: number) => s.image(opts.image?.(im.target), im.target, im.alt, x, y, w, h);

  if (m.layout === 'capa') {
    s.text(M, 120, W - 2 * M, 170, titleP(50, 'center'), { title: true, anchor: 'bottom' });
    s.rect(W / 2 - 36, 304, 72, 3, look.accent);
    s.text(M + 40, 326, W - 2 * M - 80, 130, s.paragraphs(texts, 20, 'center', look.muted));
    s.ellipse(W - M, H - M + 8, 7, look.accent);
    s.ellipse(W - M, H - M + 8, 4.5, look.bg);
  } else if (m.layout === 'seção') {
    s.rect(M, 190, 5, 160, look.accent);
    s.text(M + 30, 150, W - 2 * M - 30, 130, titleP(42, 'start'), { title: true, anchor: 'bottom' });
    s.text(M + 30, 290, W - 2 * M - 30, 90, s.paragraphs(texts, 20, 'start', look.muted));
  } else if (m.layout === 'imagem' && !title.length) {
    if (imgs[0]) img(imgs[0], 0, 0, W, H);
    return;
  } else if (m.layout === 'imagem') {
    s.text(M, 20, W - 2 * M, 40, titleP(24, 'start'), { title: true, anchor: 'middle' });
    if (imgs[0]) img(imgs[0], 28, 70, W - 56, H - 100);
  } else {
    let y = 40;
    if (title.length) {
      const two = plain(title).length > 46;
      s.text(M, y, W - 2 * M, two ? 84 : 46, titleP(two ? 28 : 32, 'start'), { title: true, anchor: 'bottom' });
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
      imgs.forEach((im, i) => img(im, ix, y + i * (each + 12), W - M - ix, each));
    } else body(s, texts, look, M, y, W - 2 * M, bottom - y, 26);
  }

  // rodapé: número e linha de progresso
  s.pageNumber(W - M - 60, H - 30, 60, 18, index + 1);
  s.rect(0, H - 3, W, 3, look.line);
  s.rect(0, H - 3, (W * (index + 1)) / total, 3, look.accent);
}

function notesXml(st: Styles, text: string, n: number): string {
  if (!text.trim()) return '';
  const ps = st.get('P', 'paragraph', '<style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.1cm"/>');
  const ts = st.get('T', 'text', `<style:text-properties fo:font-size="14pt" fo:color="#1d1b18" fo:font-family="'${FONT_BODY}'"/>`);
  const paras = text
    .split('\n')
    .map((l) => `<text:p text:style-name="${ps}"><text:span text:style-name="${ts}">${escXml(l)}</text:span></text:p>`)
    .join('');
  return `<presentation:notes><draw:page-thumbnail draw:layer="layout" svg:width="14cm" svg:height="7.875cm" svg:x="3.5cm" svg:y="2cm" draw:page-number="${n}" presentation:class="page"/><draw:frame draw:layer="layout" svg:width="17cm" svg:height="15cm" svg:x="2cm" svg:y="11cm" presentation:class="notes" presentation:user-transformed="true"><draw:text-box>${paras}</draw:text-box></draw:frame></presentation:notes>`;
}

const TRANSITION: Record<string, string> = {
  esmaecer: 'smil:type="fade" smil:subtype="crossfade"',
  deslizar: 'smil:type="slideWipe" smil:subtype="fromRight"',
  núcleo: 'smil:type="irisWipe" smil:subtype="diamond"',
};

export function deckToOdp(deck: Deck, opts: DeckExportOptions): Uint8Array {
  const look = opts.look;
  const models = deck.slides.map(slideModel);
  if (!models.length) models.push({ layout: 'capa', title: [{ text: deck.title || 'Apresentação' }], titleDepth: 1, blocks: [], notes: '' });
  const st = new Styles();
  const pictures: Record<string, Uint8Array> = {};
  const media = new Map<string, string>();
  const trans = TRANSITION[deck.transition];
  const dp = st.get(
    'dp',
    'drawing-page',
    `<style:drawing-page-properties presentation:background-visible="true" presentation:background-objects-visible="true" draw:fill="solid" draw:fill-color="${look.bg}"${trans ? ` presentation:transition-speed="medium" ${trans}` : ''}/>`,
  );
  const pages = models.map((m, i) => {
    const page = new Page(st, look, pictures, media);
    buildPage(m, i, models.length, opts, page);
    const name = plain(m.title ?? []).trim() || `Slide ${i + 1}`;
    return page.xml(name, dp, 'Tanden', notesXml(st, m.notes, i + 1));
  });

  const content =
    `${XML_HEAD}<office:document-content ${ODF_NS} office:version="1.3"><office:automatic-styles>${st.xml.join('')}</office:automatic-styles>` +
    `<office:body><office:presentation>${pages.join('')}</office:presentation></office:body></office:document-content>`;

  const styles =
    `${XML_HEAD}<office:document-styles ${ODF_NS} office:version="1.3"><office:styles>` +
    `<style:default-style style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/><style:paragraph-properties style:writing-mode="lr-tb"/><style:text-properties fo:font-family="'${FONT_BODY}'" fo:font-size="18pt" fo:language="pt" fo:country="BR"/></style:default-style>` +
    '</office:styles><office:automatic-styles>' +
    `<style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${cm(W)}" fo:page-height="${cm(H)}" style:print-orientation="landscape"/></style:page-layout>` +
    `<style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:background-size="full" draw:fill="solid" draw:fill-color="${look.bg}"/></style:style>` +
    '</office:automatic-styles><office:master-styles>' +
    '<style:master-page style:name="Tanden" style:page-layout-name="PM1" draw:style-name="Mdp1"/>' +
    '</office:master-styles></office:document-styles>';

  return odfPackage(ODF_MIME.odp, {
    'content.xml': content,
    'styles.xml': styles,
    'meta.xml': metaXml(deck.title, escXml),
    ...pictures,
  });
}
