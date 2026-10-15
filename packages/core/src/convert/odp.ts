import { strFromU8, unzipSync } from 'fflate';
import { tidyMarkdown } from './html';
import { lengthToPx } from './odf';
import { AssetBag, type ConvertOptions, type Converted } from './types';
import { el, els, find, parseXml, textOf, type XNode } from './xml-lite';

/*
 * .odp (LibreOffice Impress) → nota, no mesmo formato do importador de .pptx:
 * cada slide vira "## n. Título", os textos na ordem de leitura, listas,
 * tabelas em Markdown, imagens como anexos e as notas do apresentador num
 * callout. A tela de Slides transforma isso em apresentação.
 */

interface Look {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
}

interface Ctx {
  zip: Record<string, Uint8Array>;
  bag: AssetBag;
  looks: Map<string, Look>;
  numbered: Set<string>;
  hidden: Set<string>;
}

const escMd = (s: string) => s.replace(/([*_`[\]\\])/g, '\\$1');
const MONO = /mono|consol|courier|menlo|monaco|code|inconsolata/i;

function readLooks(docs: XNode[]): Map<string, Look> {
  const out = new Map<string, Look>();
  for (const d of docs) {
    for (const st of find(d, 'style:style')) {
      const name = st.attrs['style:name'];
      const tp = el(st, 'style:text-properties');
      if (!name || !tp) continue;
      const w = tp.attrs['fo:font-weight'];
      out.set(name, {
        b: w === 'bold' || Number(w) >= 600,
        i: tp.attrs['fo:font-style'] === 'italic',
        s: !!tp.attrs['style:text-line-through-style'] && tp.attrs['style:text-line-through-style'] !== 'none',
        code: MONO.test(tp.attrs['fo:font-family'] ?? tp.attrs['style:font-name'] ?? ''),
      });
    }
  }
  return out;
}

/** Texto de um parágrafo com negrito, itálico, links e quebras. */
function inline(n: XNode, ctx: Ctx, look: Look = {}): string {
  let out = '';
  for (const k of n.kids) {
    if (typeof k === 'string') {
      out += escMd(k);
      continue;
    }
    switch (k.name) {
      case 'text:s':
        out += ' '.repeat(Math.max(1, Number(k.attrs['text:c'] ?? 1) || 1));
        break;
      case 'text:tab':
        out += '\t';
        break;
      case 'text:line-break':
        out += '<br>';
        break;
      case 'text:span': {
        const lk = { ...look, ...(ctx.looks.get(k.attrs['text:style-name'] ?? '') ?? {}) };
        let t = inline(k, ctx);
        const lead = t.match(/^\s*/)![0];
        const trail = t.match(/\s*$/)![0];
        let core = t.trim();
        if (core) {
          if (lk.code) core = `\`${core.replace(/\\([*_`[\]\\])/g, '$1')}\``;
          else {
            if (lk.b) core = `**${core}**`;
            if (lk.i) core = `*${core}*`;
            if (lk.s) core = `~~${core}~~`;
          }
          t = `${lead}${core}${trail}`;
        }
        out += t;
        break;
      }
      case 'text:a': {
        const href = k.attrs['xlink:href'] ?? '';
        const text = inline(k, ctx, look).trim();
        out += /^(https?|mailto):/i.test(href) && text ? `[${text}](${href.replace(/[()\s]/g, encodeURIComponent)})` : text;
        break;
      }
      case 'text:page-number':
      case 'text:date':
      case 'text:time':
      case 'presentation:footer':
      case 'presentation:date-time':
      case 'office:annotation':
        break;
      default:
        out += inline(k, ctx, look);
    }
  }
  // marcadores vizinhos se fundem: **a** **b** → **a b**
  return out.replace(/\*\*(\s*)\*\*/g, '$1');
}

interface Para {
  text: string;
  depth: number;
  /** marcador: null = parágrafo comum */
  bullet: '-' | 'n' | null;
}

/** Parágrafos e listas de uma caixa de texto, achatados com a profundidade. */
function paras(box: XNode, ctx: Ctx, bulletsByDefault: boolean, out: Para[] = [], depth = 0, listStyle: string | null = null): Para[] {
  for (const k of els(box)) {
    if (k.name === 'text:p' || k.name === 'text:h') {
      const text = inline(k, ctx).trim();
      if (!text) continue;
      const inList = depth > 0;
      const bullet = inList ? (listStyle && ctx.numbered.has(listStyle) ? 'n' : '-') : bulletsByDefault ? '-' : null;
      out.push({ text, depth: Math.max(0, depth - 1), bullet });
    } else if (k.name === 'text:list') {
      const style = k.attrs['text:style-name'] ?? listStyle;
      for (const item of els(k)) {
        if (item.name === 'text:list-item' || item.name === 'text:list-header') paras(item, ctx, bulletsByDefault, out, depth + 1, style);
      }
    }
  }
  return out;
}

function parasToMd(ps: Para[]): string {
  const lines: string[] = [];
  const counters: number[] = [];
  for (const p of ps) {
    const indent = '  '.repeat(p.depth);
    if (p.bullet === 'n') {
      counters.length = p.depth + 1;
      counters[p.depth] = (counters[p.depth] ?? 0) + 1;
      lines.push(`${indent}${counters[p.depth]}. ${p.text}`);
    } else if (p.bullet === '-') {
      counters.length = p.depth;
      lines.push(`${indent}- ${p.text}`);
    } else {
      counters.length = 0;
      lines.push(lines.length ? `\n${p.text}` : p.text);
    }
  }
  return lines.join('\n');
}

function table(t: XNode, ctx: Ctx): string {
  const rows: string[][] = [];
  for (const r of find(t, 'table:table-row')) {
    rows.push(
      els(r)
        .filter((c) => c.name === 'table:table-cell')
        .map((c) => els(c, 'text:p').map((p) => inline(p, ctx).trim()).filter(Boolean).join('<br>').replace(/\|/g, '\\|')),
    );
  }
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array(cols - r.length).fill('')].join(' | ')} |`;
  // o cabeçalho costuma vir todo em negrito; no Markdown ele já é destacado
  rows[0] = rows[0]!.map((c) => c.replace(/^\*\*([^*]+)\*\*$/, '$1'));
  return [line(rows[0]!), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line)].join('\n');
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

function image(frame: XNode, ctx: Ctx): string {
  const imgs = els(frame, 'draw:image');
  const pick = imgs.find((i) => IMAGE.test(i.attrs['xlink:href'] ?? '') && !/\.svg$/i.test(i.attrs['xlink:href']!)) ?? imgs.find((i) => IMAGE.test(i.attrs['xlink:href'] ?? ''));
  const href = pick?.attrs['xlink:href']?.replace(/^\.\//, '');
  const data = href ? ctx.zip[href] : undefined;
  if (!href || !data) return '';
  const alt = textOf(el(frame, 'svg:desc') ?? el(frame, 'svg:title') ?? { name: '', attrs: {}, kids: [] })
    .replace(/[[\]\n|]/g, ' ')
    .trim();
  const path = ctx.bag.add(href.split('/').pop()!, data, href);
  // o LibreOffice guarda o nome original da imagem na descrição; isso não é texto alternativo
  const useAlt = alt && !IMAGE.test(alt) ? `|${alt}` : '';
  return `![[${path}${useAlt}]]`;
}

interface Block {
  x: number;
  y: number;
  title: boolean;
  md: string;
}

function shapes(parent: XNode, ctx: Ctx, out: Block[] = []): Block[] {
  for (const k of els(parent)) {
    const x = lengthToPx(k.attrs['svg:x']) ?? 0;
    const y = lengthToPx(k.attrs['svg:y']) ?? 0;
    const cls = k.attrs['presentation:class'] ?? '';
    if (k.name === 'draw:g') {
      shapes(k, ctx, out);
      continue;
    }
    if (['page-number', 'date-time', 'footer', 'header'].includes(cls)) continue;
    if (k.name === 'draw:frame') {
      const tbl = el(k, 'table:table');
      if (tbl) {
        const md = table(tbl, ctx);
        if (md) out.push({ x, y, title: false, md });
        continue;
      }
      if (el(k, 'draw:image') && !el(k, 'draw:text-box')) {
        const md = image(k, ctx);
        if (md) out.push({ x, y, title: false, md });
        continue;
      }
      const box = el(k, 'draw:text-box');
      if (!box) continue;
      if (cls === 'title') {
        const md = paras(box, ctx, false)
          .map((p) => p.text)
          .join(' ')
          .replace(/<br>/g, ' ')
          .replace(/^\*\*(.+)\*\*$/, '$1'); // título já é negrito por natureza
        if (md) out.push({ x, y, title: true, md });
        continue;
      }
      const ps = paras(box, ctx, cls === 'outline');
      const md = cls === 'subtitle' ? (ps.length ? `*${ps.map((p) => p.text).join(' ').replace(/<br>/g, ' ')}*` : '') : parasToMd(ps);
      if (md) out.push({ x, y, title: false, md: monoBlock(box, ctx) ?? md });
    } else if (/^draw:(custom-shape|rect|ellipse|polygon|path|text-box|caption)$/.test(k.name)) {
      const md = parasToMd(paras(k, ctx, false));
      if (md) out.push({ x, y, title: false, md: monoBlock(k, ctx) ?? md });
    }
  }
  return out;
}

/** Caixa toda em fonte de largura fixa: é código. */
function monoBlock(box: XNode, ctx: Ctx): string | null {
  const spans = find(box, 'text:span');
  if (!spans.length || !spans.every((s) => ctx.looks.get(s.attrs['text:style-name'] ?? '')?.code)) return null;
  const lines = find(box, 'text:p').map((p) => {
    let s = '';
    const walk = (n: XNode) => {
      for (const c of n.kids) {
        if (typeof c === 'string') s += c;
        else if (c.name === 'text:s') s += ' '.repeat(Math.max(1, Number(c.attrs['text:c'] ?? 1) || 1));
        else if (c.name === 'text:tab') s += '\t';
        else if (c.name === 'text:line-break') s += '\n';
        else walk(c);
      }
    };
    walk(p);
    return s;
  });
  const fence = lines.some((l) => l.includes('```')) ? '~~~' : '```';
  return `${fence}\n${lines.join('\n').replace(/\s+$/, '')}\n${fence}`;
}

export function odpToMarkdown(bytes: Uint8Array, opts: ConvertOptions): Converted {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('O arquivo não é um .odp válido.');
  }
  if (!zip['content.xml']) throw new Error('Não parece uma apresentação do LibreOffice (.odp).');
  const mime = zip.mimetype ? strFromU8(zip.mimetype).trim() : '';
  if (mime && !mime.includes('presentation')) throw new Error('Este arquivo do LibreOffice não é uma apresentação.');
  const content = parseXml(strFromU8(zip['content.xml']));
  const styles = zip['styles.xml'] ? parseXml(strFromU8(zip['styles.xml'])) : null;
  const docs = styles ? [styles, content] : [content];

  const numbered = new Set<string>();
  const hidden = new Set<string>();
  for (const d of docs) {
    for (const ls of find(d, 'text:list-style')) {
      const first = els(ls)[0];
      if (first?.name === 'text:list-level-style-number' && ls.attrs['style:name']) numbered.add(ls.attrs['style:name']);
    }
    for (const st of find(d, 'style:style')) {
      if (st.attrs['style:family'] !== 'drawing-page') continue;
      if (el(st, 'style:drawing-page-properties')?.attrs['presentation:visibility'] === 'hidden') hidden.add(st.attrs['style:name']!);
    }
  }
  const ctx: Ctx = { zip, bag: new AssetBag(opts.assetDir), looks: readLooks(docs), numbered, hidden };

  const sections: string[] = [];
  const pages = find(content, 'draw:page');
  pages.forEach((page, i) => {
    if (ctx.hidden.has(page.attrs['draw:style-name'] ?? '')) return;
    const blocks = shapes(page, ctx);
    const title = blocks.find((b) => b.title)?.md ?? '';
    const body = blocks
      .filter((b) => !b.title)
      .sort((a, b) => (Math.abs(a.y - b.y) < 12 ? a.x - b.x : a.y - b.y)) // ~3 mm de tolerância na mesma linha
      .map((b) => b.md);
    const notesFrame = find(el(page, 'presentation:notes'), 'draw:frame').find((f) => f.attrs['presentation:class'] === 'notes');
    const notesBox = el(notesFrame, 'draw:text-box');
    const notes = notesBox ? parasToMd(paras(notesBox, ctx, false)).replace(/\n{2,}/g, '\n').trim() : '';

    const name = page.attrs['draw:name'] ?? '';
    const fallback = name && !/^(page|slide|página)\s*\d+$/i.test(name) ? name : `Slide ${i + 1}`;
    let section = `## ${i + 1}. ${title || fallback}`;
    if (body.length) section += `\n\n${body.join('\n\n')}`;
    if (notes) section += `\n\n> [!note] Notas do apresentador\n${notes.split('\n').map((l) => `> ${l}`).join('\n')}`;
    sections.push(section);
  });

  const meta = zip['meta.xml'] ? textOf(find(parseXml(strFromU8(zip['meta.xml'])), 'dc:title')[0] ?? { name: '', attrs: {}, kids: [] }).trim() : '';
  return { title: meta, markdown: tidyMarkdown(sections.join('\n\n---\n\n')), assets: ctx.bag.assets };
}
