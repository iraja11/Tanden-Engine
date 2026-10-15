import { Lexer, type Token, type Tokens } from 'marked';
import { decode, EMBED_PREFIX, imageSize, obsidianToCommonMark, type ExportOptions } from './export';
import { metaXml, ODF_MIME, ODF_NS, odfPackage, XML_HEAD } from './odf';
import { escXml } from './xml-lite';

/*
 * Nota → .odt (LibreOffice Writer, e também Word e Google Docs). Usa os
 * estilos com os nomes do próprio Writer (Título 1, Corpo do texto, Citações,
 * Texto pré-formatado...), então o documento continua fácil de editar lá:
 * o navegador de títulos, o sumário e as listas funcionam como num arquivo
 * feito no Writer.
 */

interface Look {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
  mark?: boolean;
}

const MAX_W_CM = 17; // largura útil da página A4 com margens de 2 cm

class OdtWriter {
  private auto = new Map<string, string>(); // chave do visual → nome do estilo T1, T2...
  private autoXml: string[] = [];
  private paraStyles = new Map<string, string>();
  private pictures: Record<string, Uint8Array> = {};
  private pics = 0;
  private tables = 0;

  constructor(private readonly opts: ExportOptions) {}

  private textStyle(look: Look): string | null {
    const key = `${look.b ? 'b' : ''}${look.i ? 'i' : ''}${look.s ? 's' : ''}${look.code ? 'c' : ''}${look.mark ? 'm' : ''}`;
    if (!key) return null;
    let name = this.auto.get(key);
    if (!name) {
      name = `T${this.auto.size + 1}`;
      const p = [
        look.b ? 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"' : '',
        look.i ? 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"' : '',
        look.s ? 'style:text-line-through-style="solid" style:text-line-through-type="single"' : '',
        look.code ? 'style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\'" style:font-family-generic="modern" style:font-pitch="fixed" fo:background-color="#f3f2f6"' : '',
        look.mark ? 'fo:background-color="#ffe2a8"' : '',
      ]
        .filter(Boolean)
        .join(' ');
      this.autoXml.push(`<style:style style:name="${name}" style:family="text"><style:text-properties ${p}/></style:style>`);
      this.auto.set(key, name);
    }
    return name;
  }

  /** Parágrafo com alinhamento próprio (células de tabela). */
  private paraStyle(parent: string, align: 'center' | 'end'): string {
    const key = `${parent}|${align}`;
    let name = this.paraStyles.get(key);
    if (!name) {
      name = `P${this.paraStyles.size + 1}`;
      this.autoXml.push(`<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties fo:text-align="${align}"/></style:style>`);
      this.paraStyles.set(key, name);
    }
    return name;
  }

  /** Texto com espaços repetidos, tabulações e quebras de linha do jeito do ODF. */
  private chars(text: string): string {
    return text
      .split('\n')
      .map((line) =>
        escXml(line)
          .replace(/\t/g, '<text:tab/>')
          .replace(/ {2,}/g, (sp) => ` <text:s text:c="${sp.length - 1}"/>`)
          .replace(/^ /, '<text:s/>'),
      )
      .join('<text:line-break/>');
  }

  private run(text: string, look: Look): string {
    if (!text) return '';
    const st = this.textStyle(look);
    const body = this.chars(text);
    return st ? `<text:span text:style-name="${st}">${body}</text:span>` : body;
  }

  private picture(target: string, alt: string): string {
    const img = this.opts.image?.(target);
    const size = img ? imageSize(img.data) : null;
    if (!img || !size || !/png|jpe?g|gif/.test(img.mime)) return this.run(`[${alt || target}]`, { i: true });
    const ext = img.mime.includes('png') ? 'png' : img.mime.includes('gif') ? 'gif' : 'jpg';
    const n = ++this.pics;
    const path = `Pictures/imagem${n}.${ext}`;
    this.pictures[path] = img.data;
    // 96 dpi, encolhendo para caber na largura da página
    let w = (size.w * 2.54) / 96;
    let h = (size.h * 2.54) / 96;
    if (w > MAX_W_CM) {
      h = (h * MAX_W_CM) / w;
      w = MAX_W_CM;
    }
    const name = escXml(alt || `Imagem ${n}`);
    return `<draw:frame draw:style-name="fr1" draw:name="Imagem${n}" text:anchor-type="as-char" svg:width="${w.toFixed(3)}cm" svg:height="${h.toFixed(3)}cm" draw:z-index="0"><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${alt ? `<svg:desc>${escXml(alt)}</svg:desc>` : ''}<svg:title>${name}</svg:title></draw:frame>`;
  }

  private inline(tokens: Token[] | undefined, look: Look = {}): string {
    if (!tokens) return '';
    let out = '';
    for (const t of tokens) {
      switch (t.type) {
        case 'text':
          out += (t as Tokens.Text).tokens ? this.inline((t as Tokens.Text).tokens, look) : this.run(decode((t as Tokens.Text).text ?? ''), look);
          break;
        case 'escape':
          out += this.run((t as Tokens.Escape).text, look);
          break;
        case 'strong':
          out += this.inline((t as Tokens.Strong).tokens, { ...look, b: true });
          break;
        case 'em':
          out += this.inline((t as Tokens.Em).tokens, { ...look, i: true });
          break;
        case 'del':
          out += this.inline((t as Tokens.Del).tokens, { ...look, s: true });
          break;
        case 'codespan':
          out += this.run(decode((t as Tokens.Codespan).text), { ...look, code: true });
          break;
        case 'br':
          out += '<text:line-break/>';
          break;
        case 'link': {
          const l = t as Tokens.Link;
          const inner = this.inline(l.tokens, look);
          out += /^(https?|mailto):/i.test(l.href)
            ? `<text:a xlink:type="simple" xlink:href="${escXml(l.href)}" text:style-name="Internet_20_link" text:visited-style-name="Visited_20_Internet_20_Link">${inner}</text:a>`
            : inner;
          break;
        }
        case 'image': {
          const im = t as Tokens.Image;
          out += im.href.startsWith(EMBED_PREFIX) ? this.picture(im.href.slice(EMBED_PREFIX.length), im.text) : this.run(`[${im.text || im.href}]`, { ...look, i: true });
          break;
        }
        case 'html': {
          const h = (t as Tokens.HTML).text;
          if (/^<mark>$/i.test(h)) look = { ...look, mark: true };
          else if (/^<\/mark>$/i.test(h)) look = { ...look, mark: false };
          else if (/^<br\s*\/?>$/i.test(h)) out += '<text:line-break/>';
          else out += this.run(decode(h.replace(/<[^>]+>/g, '')), look);
          break;
        }
        default:
          if ('tokens' in t && Array.isArray(t.tokens)) out += this.inline(t.tokens as Token[], look);
          else if ('text' in t && typeof t.text === 'string') out += this.run(decode(t.text), look);
      }
    }
    return out;
  }

  private p(body: string, style = 'Text_20_body'): string {
    return `<text:p text:style-name="${style}">${body}</text:p>`;
  }

  private list(l: Tokens.List, quote: boolean): string {
    const style = l.ordered ? 'Numbering_20_123' : 'List_20_1';
    let out = `<text:list text:style-name="${style}">`;
    l.items.forEach((item, i) => {
      const start = i === 0 && l.ordered && Number(l.start) > 1 ? ` text:start-value="${Number(l.start)}"` : '';
      out += `<text:list-item${start}>`;
      let first = true;
      for (const t of item.tokens) {
        if (t.type === 'space' || t.type === 'checkbox') continue;
        if (t.type === 'list') {
          out += this.list(t as Tokens.List, quote);
          continue;
        }
        if (t.type === 'code' || t.type === 'table' || t.type === 'blockquote') {
          out += this.blocks([t], quote);
          continue;
        }
        const box = first && item.task ? this.run(item.checked ? '☑ ' : '☐ ', {}) : '';
        const tokens = (t as Tokens.Text).tokens ?? [{ type: 'text', raw: (t as Tokens.Text).raw, text: (t as Tokens.Text).text } as Tokens.Text];
        out += this.p(box + this.inline(tokens), quote ? 'Quotations' : 'List_20_Contents');
        first = false;
      }
      if (first) out += this.p('', 'List_20_Contents');
      out += '</text:list-item>';
    });
    return `${out}</text:list>`;
  }

  private table(t: Tokens.Table): string {
    const n = ++this.tables;
    const cols = t.header.length;
    const align = (i: number, parent: string) =>
      t.align[i] === 'center' ? this.paraStyle(parent, 'center') : t.align[i] === 'right' ? this.paraStyle(parent, 'end') : parent;
    const cell = (c: Tokens.TableCell, i: number, head: boolean) =>
      `<table:table-cell table:style-name="Tabela.C" office:value-type="string">${this.p(this.inline(c.tokens), align(i, head ? 'Table_20_Heading' : 'Table_20_Contents'))}</table:table-cell>`;
    const head = `<table:table-header-rows><table:table-row>${t.header.map((c, i) => cell(c, i, true)).join('')}</table:table-row></table:table-header-rows>`;
    const rows = t.rows.map((r) => `<table:table-row>${Array.from({ length: cols }, (_, i) => cell(r[i] ?? { text: '', tokens: [] } as unknown as Tokens.TableCell, i, false)).join('')}</table:table-row>`).join('');
    return `<table:table table:name="Tabela${n}" table:style-name="Tabela"><table:table-column table:style-name="Tabela.A"${cols > 1 ? ` table:number-columns-repeated="${cols}"` : ''}/>${head}${rows}</table:table>`;
  }

  blocks(tokens: Token[], quote = false): string {
    let out = '';
    for (const t of tokens) {
      switch (t.type) {
        case 'heading': {
          const h = t as Tokens.Heading;
          const d = Math.min(6, h.depth);
          out += `<text:h text:style-name="Heading_20_${d}" text:outline-level="${d}">${this.inline(h.tokens)}</text:h>`;
          break;
        }
        case 'paragraph':
          out += this.p(this.inline((t as Tokens.Paragraph).tokens), quote ? 'Quotations' : 'Text_20_body');
          break;
        case 'text':
          out += this.p(this.inline((t as Tokens.Text).tokens ?? [t]), quote ? 'Quotations' : 'Text_20_body');
          break;
        case 'list':
          out += this.list(t as Tokens.List, quote);
          break;
        case 'blockquote':
          out += this.blocks((t as Tokens.Blockquote).tokens, true);
          break;
        case 'code':
          for (const line of (t as Tokens.Code).text.split('\n')) out += this.p(this.chars(line), 'Preformatted_20_Text');
          break;
        case 'table':
          out += this.table(t as Tokens.Table);
          break;
        case 'hr':
          out += this.p('', 'Horizontal_20_Line');
          break;
        case 'html': {
          const text = decode((t as Tokens.HTML).text.replace(/<[^>]+>/g, '')).trim();
          if (text) out += this.p(this.run(text, {}));
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  build(md: string): Uint8Array {
    const body = this.blocks(new Lexer({ gfm: true }).lex(obsidianToCommonMark(md))) || this.p('');
    const content =
      `${XML_HEAD}<office:document-content ${ODF_NS} office:version="1.3">${FONTS}` +
      `<office:automatic-styles>${TABLE_STYLES}<style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>${this.autoXml.join('')}</office:automatic-styles>` +
      `<office:body><office:text>${body}</office:text></office:body></office:document-content>`;
    return odfPackage(ODF_MIME.odt, {
      'content.xml': content,
      'styles.xml': STYLES,
      'meta.xml': metaXml(this.opts.title, escXml),
      ...this.pictures,
    });
  }
}

/** Nota → .odt que abre no LibreOffice Writer, no Word e no Google Docs. */
export function markdownToOdt(md: string, opts: ExportOptions): Uint8Array {
  return new OdtWriter(opts).build(md);
}

/* ------------------------------------------------------------- estilos */

const FONTS =
  '<office:font-face-decls>' +
  '<style:font-face style:name="Liberation Serif" svg:font-family="\'Liberation Serif\'" style:font-family-generic="roman" style:font-pitch="variable"/>' +
  '<style:font-face style:name="Liberation Sans" svg:font-family="\'Liberation Sans\'" style:font-family-generic="swiss" style:font-pitch="variable"/>' +
  '<style:font-face style:name="Liberation Mono" svg:font-family="\'Liberation Mono\'" style:font-family-generic="modern" style:font-pitch="fixed"/>' +
  '</office:font-face-decls>';

const TABLE_STYLES =
  '<style:style style:name="Tabela" style:family="table"><style:table-properties style:width="17cm" table:align="margins" fo:margin-top="0.1cm" fo:margin-bottom="0.3cm"/></style:style>' +
  '<style:style style:name="Tabela.A" style:family="table-column"><style:table-column-properties style:rel-column-width="1*"/></style:style>' +
  '<style:style style:name="Tabela.C" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #d9d7df"/></style:style>';

const heading = (n: number, size: string) =>
  `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="${n}" style:class="text"><style:paragraph-properties fo:margin-top="${n <= 2 ? '0.42cm' : '0.35cm'}" fo:margin-bottom="0.21cm"/><style:text-properties fo:font-size="${size}" fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>`;

const bulletLevels = Array.from({ length: 10 }, (_, i) => {
  const ch = ['•', '◦', '▪'][i % 3];
  return `<text:list-level-style-bullet text:level="${i + 1}" text:style-name="Bullet_20_Symbols" text:bullet-char="${ch}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.635 * (i + 1)).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * (i + 1)).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-bullet>`;
}).join('');

const numberLevels = Array.from({ length: 10 }, (_, i) => {
  const fmt = ['1', 'a', 'i'][i % 3];
  return `<text:list-level-style-number text:level="${i + 1}" text:style-name="Numbering_20_Symbols" style:num-suffix="." style:num-format="${fmt}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.635 * (i + 1)).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * (i + 1)).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-number>`;
}).join('');

const STYLES =
  `${XML_HEAD}<office:document-styles ${ODF_NS} office:version="1.3">${FONTS}<office:styles>` +
  '<style:default-style style:family="paragraph"><style:paragraph-properties style:tab-stop-distance="1.25cm" style:writing-mode="page"/><style:text-properties style:font-name="Liberation Serif" fo:font-size="12pt" fo:language="pt" fo:country="BR" style:letter-kerning="true" fo:hyphenate="false"/></style:default-style>' +
  '<style:default-style style:family="table"><style:table-properties table:border-model="collapsing"/></style:default-style>' +
  '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>' +
  '<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.423cm" fo:margin-bottom="0.212cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-family="\'Liberation Sans\'" style:font-family-generic="swiss" fo:font-size="14pt"/></style:style>' +
  '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.247cm" fo:line-height="115%"/></style:style>' +
  '<style:style style:name="List_20_Contents" style:display-name="List Contents" style:family="paragraph" style:parent-style-name="Text_20_body" style:class="list"><style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>' +
  heading(1, '130%') + heading(2, '115%') + heading(3, '101%') + heading(4, '95%') + heading(5, '85%') + heading(6, '85%') +
  '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="0.6cm" fo:margin-right="0.6cm" fo:margin-top="0cm" fo:margin-bottom="0.283cm" fo:padding-left="0.3cm" fo:border-left="2.25pt solid #e0702a" fo:border-right="none" fo:border-top="none" fo:border-bottom="none"/><style:text-properties fo:font-style="italic" fo:color="#3a3840"/></style:style>' +
  '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:background-color="#f3f2f6"/><style:text-properties style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\'" style:font-family-generic="modern" style:font-pitch="fixed" fo:font-size="10pt"/></style:style>' +
  '<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"/>' +
  '<style:style style:name="Table_20_Heading" style:display-name="Table Heading" style:family="paragraph" style:parent-style-name="Table_20_Contents" style:class="extra"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>' +
  '<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.5cm" fo:padding="0cm" fo:border-left="none" fo:border-right="none" fo:border-top="none" fo:border-bottom="0.5pt solid #d9d7df"/><style:text-properties fo:font-size="6pt"/></style:style>' +
  '<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#c2561b" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>' +
  '<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text"><style:text-properties fo:color="#800000" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>' +
  '<style:style style:name="Bullet_20_Symbols" style:display-name="Bullet Symbols" style:family="text"/>' +
  '<style:style style:name="Numbering_20_Symbols" style:display-name="Numbering Symbols" style:family="text"/>' +
  '<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="paragraph" svg:x="0cm" svg:y="0cm" style:wrap="none" style:vertical-pos="top" style:vertical-rel="paragraph" style:horizontal-pos="center" style:horizontal-rel="paragraph"/></style:style>' +
  `<text:list-style style:name="List_20_1" style:display-name="List 1">${bulletLevels}</text:list-style>` +
  `<text:list-style style:name="Numbering_20_123" style:display-name="Numbering 123">${numberLevels}</text:list-style>` +
  '<text:outline-style style:name="Outline">' +
  Array.from({ length: 10 }, (_, i) => `<text:outline-level-style text:level="${i + 1}" style:num-format=""><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab"/></style:list-level-properties></text:outline-level-style>`).join('') +
  '</text:outline-style>' +
  '</office:styles>' +
  '<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout></office:automatic-styles>' +
  '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>' +
  '</office:document-styles>';
