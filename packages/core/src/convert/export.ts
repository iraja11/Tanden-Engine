import { Lexer, Marked, type Token, type Tokens } from 'marked';
import { strToU8, zipSync } from 'fflate';
import { escapeHtml } from './dom';

/*
 * Nota → arquivos para outras pessoas e programas: HTML (abre em qualquer
 * navegador e imprime em PDF) e .docx (Word, Google Docs, LibreOffice).
 * A sintaxe do Obsidian é traduzida: [[links]] viram texto, ![[imagem]]
 * entra no arquivo, ==realce== vira marca-texto e callouts viram citações.
 */

export interface ExportOptions {
  title: string;
  /** bytes de uma imagem do cofre (caminho como escrito no ![[...]]) */
  image?: (target: string) => { data: Uint8Array; mime: string } | null;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const EMBED_PREFIX = 'tanden-embed:';

/** Troca a sintaxe do Obsidian por Markdown comum, fora dos blocos de código. */
export function obsidianToCommonMark(md: string): string {
  const body = md.replace(FRONTMATTER, '');
  const parts = body.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // bloco de código: intocado
      return part
        .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target: string, alt?: string) => {
          const a = alt && !/^\d+(x\d+)?$/.test(alt) ? alt : '';
          return `![${a.replace(/[[\]]/g, '')}](<${EMBED_PREFIX}${target.trim()}>)`;
        })
        .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => {
          if (alias) return alias;
          const [file, sub] = target.split('#');
          const name = file!.split('/').pop()!.replace(/\.md$/i, '');
          return sub ? `${name} › ${sub.replace(/^\^/, '')}` : name;
        })
        .replace(/(^|[^=])==(?=\S)([^=\n]+?)==(?!=)/g, '$1<mark>$2</mark>')
        .replace(/^(\s*>\s*)\[!(\w+)\][+-]?\s*(.*)$/gm, (_m, q: string, kind: string, title: string) => `${q}**${title || kind[0]!.toUpperCase() + kind.slice(1)}**`)
        .replace(/(^|\s)%%[\s\S]*?%%/g, '$1'); // comentários do Obsidian
    })
    .join('');
}

const b64 = (data: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < data.length; i += 4096) s += String.fromCharCode(...data.subarray(i, i + 4096));
  return btoa(s);
};

const HTML_CSS = `
  :root { color-scheme: light; --ember: #e0702a; --ink: #1d1c21; --muted: #6b6975; --line: #e4e2ea; }
  body { margin: 0; background: #fff; color: var(--ink); font: 16px/1.7 "Manrope", "Segoe UI", system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 24px 96px; }
  h1, h2, h3, h4 { font-family: "Chakra Petch", "Segoe UI", system-ui, sans-serif; line-height: 1.25; margin: 1.6em 0 .5em; }
  h1 { font-size: 2em; border-bottom: 2px solid var(--ember); padding-bottom: .2em; }
  h2 { font-size: 1.45em; } h3 { font-size: 1.2em; }
  a { color: var(--ember); }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  blockquote { margin: 1em 0; padding: .4em 1em; border-left: 3px solid var(--ember); background: #fbf6f2; color: #3a3840; }
  code { font: .9em "JetBrains Mono", ui-monospace, monospace; background: #f3f2f6; padding: .1em .35em; border-radius: 4px; }
  pre { background: #f3f2f6; padding: 12px 16px; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; margin: 1em 0; width: 100%; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f7f6f9; }
  mark { background: #ffe2a8; padding: 0 .1em; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
  li.task { list-style: none; margin-left: -1.3em; }
  @media print { main { padding: 0; } a { color: inherit; } }
`;

/** Nota → página HTML completa, com as imagens embutidas (um arquivo só). */
export function markdownToHtml(md: string, opts: ExportOptions): string {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      image({ href, text }) {
        if (href.startsWith(EMBED_PREFIX)) {
          const target = href.slice(EMBED_PREFIX.length);
          const img = opts.image?.(target);
          if (!img) return `<em>[${escapeHtml(text || target)}]</em>`;
          return `<img src="data:${img.mime};base64,${b64(img.data)}" alt="${escapeHtml(text)}">`;
        }
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">`;
      },
    },
  });
  const body = marked.parse(obsidianToCommonMark(md), { async: false }) as string;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Tanden Engine">
<title>${escapeHtml(opts.title)}</title>
<style>${HTML_CSS}</style>
</head>
<body>
<main>
${body}</main>
</body>
</html>
`;
}

/* ---------------------------------------------------------------- .docx */

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Largura e altura (px) de PNG, JPEG ou GIF; null se não souber ler. */
export function imageSize(data: Uint8Array): { w: number; h: number } | null {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };
  if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49) return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1]!;
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: dv.getUint16(i + 7), h: dv.getUint16(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

interface RunLook {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
  mark?: boolean;
  link?: string;
}

class DocxWriter {
  private rels: Array<{ id: string; type: string; target: string; external?: boolean }> = [];
  private media: Array<{ path: string; data: Uint8Array }> = [];
  private nums: string[] = [];
  private nextNum = 3; // 1 = marcadores, 2 = reservado; numeradas começam no 3
  private pics = 0;

  constructor(private readonly opts: ExportOptions) {}

  private rel(type: string, target: string, external = false): string {
    const id = `rId${this.rels.length + 10}`;
    this.rels.push({ id, type, target, external });
    return id;
  }

  private run(text: string, look: RunLook): string {
    if (!text) return '';
    const pr = [
      look.code ? '<w:rStyle w:val="CodigoChar"/>' : look.link ? '<w:rStyle w:val="Hyperlink"/>' : '',
      look.b ? '<w:b/>' : '',
      look.i ? '<w:i/>' : '',
      look.s ? '<w:strike/>' : '',
      look.mark ? '<w:highlight w:val="yellow"/>' : '',
    ].join('');
    const parts = text.split('\n');
    const body = parts
      .map((t, i) => `${i ? '<w:br/>' : ''}${t.split('\t').map((x, j) => `${j ? '<w:tab/>' : ''}<w:t xml:space="preserve">${xml(x)}</w:t>`).join('')}`)
      .join('');
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${body}</w:r>`;
  }

  private picture(target: string, alt: string): string {
    const img = this.opts.image?.(target);
    const size = img ? imageSize(img.data) : null;
    if (!img || !size || !/png|jpe?g|gif/.test(img.mime)) return this.run(`[${alt || target}]`, { i: true });
    const ext = img.mime.includes('png') ? 'png' : img.mime.includes('gif') ? 'gif' : 'jpeg';
    const n = ++this.pics;
    const path = `media/imagem${n}.${ext}`;
    this.media.push({ path: `word/${path}`, data: img.data });
    const rid = this.rel('image', path);
    const maxW = 5_943_600; // 16,5 cm de largura útil
    let cx = size.w * 9525;
    let cy = size.h * 9525;
    if (cx > maxW) {
      cy = Math.round((cy * maxW) / cx);
      cx = maxW;
    }
    const name = xml(alt || `Imagem ${n}`);
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="${name}" descr="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  private inline(tokens: Token[] | undefined, look: RunLook = {}): string {
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
          out += '<w:r><w:br/></w:r>';
          break;
        case 'link': {
          const l = t as Tokens.Link;
          if (/^(https?|mailto):/i.test(l.href)) {
            const id = this.rel('hyperlink', l.href, true);
            out += `<w:hyperlink r:id="${id}" w:history="1">${this.inline(l.tokens, { ...look, link: l.href })}</w:hyperlink>`;
          } else out += this.inline(l.tokens, look);
          break;
        }
        case 'image': {
          const im = t as Tokens.Image;
          if (im.href.startsWith(EMBED_PREFIX)) out += this.picture(im.href.slice(EMBED_PREFIX.length), im.text);
          else out += this.run(`[${im.text || im.href}]`, { ...look, i: true });
          break;
        }
        case 'html': {
          const h = (t as Tokens.HTML).text;
          if (/^<mark>$/i.test(h)) look = { ...look, mark: true };
          else if (/^<\/mark>$/i.test(h)) look = { ...look, mark: false };
          else if (/^<br\s*\/?>$/i.test(h)) out += '<w:r><w:br/></w:r>';
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

  private para(runs: string, style?: string, extra = ''): string {
    const pr = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}`;
    return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${runs}</w:p>`;
  }

  private list(l: Tokens.List, level: number, numId: string | null, quote: boolean): string {
    let id = numId;
    if (l.ordered) {
      id = String(this.nextNum++);
      this.nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="${level}"><w:startOverride w:val="${Number(l.start) || 1}"/></w:lvlOverride></w:num>`);
    } else id = '1';
    let out = '';
    for (const item of l.items) {
      const numPr = `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${id}"/></w:numPr>`;
      let first = true;
      for (const t of item.tokens) {
        if (t.type === 'space' || t.type === 'checkbox') continue;
        if (t.type === 'list') {
          out += this.list(t as Tokens.List, level + 1, null, quote);
          continue;
        }
        const box = first && item.task ? this.run(item.checked ? '☑ ' : '☐ ', {}) : '';
        const runs = box + this.inline((t as Tokens.Text).tokens ?? [{ type: 'text', raw: (t as Tokens.Text).raw, text: (t as Tokens.Text).text } as Tokens.Text]);
        if (first) out += this.para(runs, quote ? 'Citacao' : 'ListParagraph', numPr);
        else out += this.para(runs, quote ? 'Citacao' : 'ListParagraph', `<w:ind w:left="${720 * (level + 1)}"/>`);
        first = false;
      }
    }
    return out;
  }

  private table(t: Tokens.Table): string {
    const cols = t.header.length;
    const width = Math.floor(9000 / Math.max(1, cols));
    const jc = (i: number) => (t.align[i] === 'center' ? '<w:jc w:val="center"/>' : t.align[i] === 'right' ? '<w:jc w:val="right"/>' : '');
    const cell = (c: Tokens.TableCell, i: number) =>
      `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${this.para(this.inline(c.tokens), undefined, `<w:spacing w:before="40" w:after="40"/>${jc(i)}`)}</w:tc>`;
    const head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${t.header.map((c, i) => cell(c, i)).join('')}</w:tr>`;
    const rows = t.rows.map((r) => `<w:tr>${r.map((c, i) => cell(c, i)).join('')}</w:tr>`).join('');
    const grid = `<w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
    return `<w:tbl><w:tblPr><w:tblStyle w:val="Tabela"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="0420" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>${grid}${head}${rows}</w:tbl>${this.para('')}`;
  }

  blocks(tokens: Token[], quote = false): string {
    let out = '';
    for (const t of tokens) {
      switch (t.type) {
        case 'heading': {
          const h = t as Tokens.Heading;
          out += this.para(this.inline(h.tokens), `Ttulo${Math.min(6, h.depth)}`);
          break;
        }
        case 'paragraph':
          out += this.para(this.inline((t as Tokens.Paragraph).tokens), quote ? 'Citacao' : undefined);
          break;
        case 'text':
          out += this.para(this.inline((t as Tokens.Text).tokens ?? [t]), quote ? 'Citacao' : undefined);
          break;
        case 'list':
          out += this.list(t as Tokens.List, 0, null, quote);
          break;
        case 'blockquote':
          out += this.blocks((t as Tokens.Blockquote).tokens, true);
          break;
        case 'code':
          out += this.para(this.run((t as Tokens.Code).text, {}), 'Codigo');
          break;
        case 'table':
          out += this.table(t as Tokens.Table);
          break;
        case 'hr':
          out += this.para('', undefined, '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D9D7DF"/></w:pBdr>');
          break;
        case 'html': {
          const text = decode((t as Tokens.HTML).text.replace(/<[^>]+>/g, '')).trim();
          if (text) out += this.para(this.run(text, {}));
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  build(md: string): Uint8Array {
    const tokens = new Lexer({ gfm: true }).lex(obsidianToCommonMark(md));
    const body = this.blocks(tokens);
    const NS =
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/>${this.rels
      .map((r) => `<Relationship Id="${r.id}" Type="${R}/${r.type}" Target="${xml(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`)
      .join('')}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const files: Record<string, Uint8Array> = {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROOT_RELS),
      'docProps/core.xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(this.opts.title)}</dc:title><dc:creator>Tanden Engine</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
      ),
      'word/document.xml': strToU8(document),
      'word/styles.xml': strToU8(STYLES),
      'word/numbering.xml': strToU8(numbering(this.nums)),
      'word/_rels/document.xml.rels': strToU8(docRels),
    };
    for (const m of this.media) files[m.path] = m.data;
    return zipSync(files, { level: 6 });
  }
}

/** Entidades que o marked deixa no texto (&amp;, &quot;...). */
function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Nota → .docx que abre no Word, no Google Docs e no LibreOffice. */
export function markdownToDocx(md: string, opts: ExportOptions): Uint8Array {
  return new DocxWriter(opts).build(md);
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const heading = (n: number, size: number, before: number) =>
  `<w:style w:type="paragraph" w:styleId="Ttulo${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${before}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:b/><w:color w:val="${n === 1 ? '1D1C21' : '2B2A31'}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${heading(1, 36, 360)}${heading(2, 30, 320)}${heading(3, 26, 280)}${heading(4, 24, 240)}${heading(5, 22, 200)}${heading(6, 22, 200)}<w:style w:type="paragraph" w:styleId="Citacao"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="E0702A"/></w:pBdr><w:ind w:left="284"/></w:pPr><w:rPr><w:i/><w:color w:val="3A3840"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Codigo"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F2F6"/><w:spacing w:after="140" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style><w:style w:type="character" w:styleId="CodigoChar"><w:name w:val="Code Char"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:shd w:val="clear" w:color="auto" w:fill="F3F2F6"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="C2561B"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style><w:style w:type="table" w:styleId="Tabela"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D9D7DF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D9D7DF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D9D7DF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D9D7DF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D7DF"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D7DF"/></w:tblBorders><w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F3F2F6"/></w:tcPr></w:tblStylePr></w:style></w:styles>`;

function numbering(nums: string[]): string {
  const bullets = ['•', '◦', '▪'];
  const lvls = (fmt: (i: number) => string) => Array.from({ length: 9 }, (_, i) => fmt(i)).join('');
  const bullet = lvls(
    (i) =>
      `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bullets[i % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`,
  );
  const fmts = ['decimal', 'lowerLetter', 'lowerRoman'];
  const decimal = lvls(
    (i) =>
      `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmts[i % 3]}"/><w:lvlText w:val="%${i + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr></w:lvl>`,
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullet}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${decimal}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>${nums.join('')}</w:numbering>`;
}
