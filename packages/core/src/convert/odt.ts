import { strFromU8, unzipSync } from 'fflate';
import { attr, descendants, kid, kids, ln, type ParseHtml } from './dom';
import { tidyMarkdown } from './html';
import { AssetBag, type ConvertOptions, type Converted } from './types';

/*
 * .odt (LibreOffice Writer) → nota: títulos, parágrafos, listas, tabelas,
 * negrito/itálico (pelos estilos automáticos), links e imagens.
 */

type Zip = Record<string, Uint8Array>;
interface Look {
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
}

const escMd = (s: string) => s.replace(/([*_`[\]\\])/g, '\\$1');

function styles(doc: Document): Map<string, Look> {
  const out = new Map<string, Look>();
  for (const st of descendants(doc, 'style')) {
    const name = attr(st, 'name');
    const tp = kid(st, 'text-properties');
    if (!name || !tp) continue;
    const font = attr(tp, 'font-name') ?? '';
    out.set(name, {
      b: attr(tp, 'font-weight') === 'bold',
      i: attr(tp, 'font-style') === 'italic',
      s: !!attr(tp, 'text-line-through-style') && attr(tp, 'text-line-through-style') !== 'none',
      code: /mono|courier|consolas|code/i.test(font),
    });
  }
  return out;
}

interface Ctx {
  zip: Zip;
  bag: AssetBag;
  looks: Map<string, Look>;
  /** estilos de lista numerada (text:list-level-style-number) */
  numbered: Set<string>;
}

function inline(el: Element, ctx: Ctx): string {
  let out = '';
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (c.nodeType === 3) {
      out += escMd(c.textContent ?? '');
      continue;
    }
    if (c.nodeType !== 1) continue;
    const e = c as Element;
    switch (ln(e)) {
      case 's':
        out += ' '.repeat(Number(attr(e, 'c') ?? 1) || 1);
        break;
      case 'tab':
        out += '\t';
        break;
      case 'line-break':
        out += '<br>';
        break;
      case 'span': {
        const look = ctx.looks.get(attr(e, 'style-name') ?? '') ?? {};
        let t = inline(e, ctx);
        const lead = t.match(/^\s*/)![0];
        const trail = t.match(/\s*$/)![0];
        let core = t.trim();
        if (core) {
          if (look.code) core = `\`${core.replace(/\\([*_`[\]\\])/g, '$1')}\``;
          else {
            if (look.b) core = `**${core}**`;
            if (look.i) core = `*${core}*`;
            if (look.s) core = `~~${core}~~`;
          }
          t = `${lead}${core}${trail}`;
        }
        out += t;
        break;
      }
      case 'a': {
        const href = attr(e, 'href') ?? '';
        const text = inline(e, ctx).trim();
        out += href && text ? `[${text}](${href.replace(/[()\s]/g, encodeURIComponent)})` : text;
        break;
      }
      case 'frame':
        out += frame(e, ctx);
        break;
      case 'note': {
        const body = kid(e, 'note-body');
        const text = body ? kids(body).map((p) => inline(p, ctx)).join(' ').trim() : '';
        if (text) out += `^[${text}]`;
        break;
      }
      case 'bookmark':
      case 'bookmark-start':
      case 'bookmark-end':
      case 'soft-page-break':
        break;
      default:
        out += inline(e, ctx);
    }
  }
  return out.replace(/\*\*(\s*)\*\*/g, '$1');
}

function frame(e: Element, ctx: Ctx): string {
  const img = kid(e, 'image');
  const href = attr(img, 'href');
  if (!href || /^https?:/.test(href)) return '';
  const data = ctx.zip[href.replace(/^\.\//, '')];
  if (!data) return '';
  const alt = (kid(e, 'desc')?.textContent ?? kid(e, 'title')?.textContent ?? '').replace(/[[\]\n|]/g, ' ').trim();
  const path = ctx.bag.add(href.split('/').pop()!, data, href);
  return `![[${path}${alt ? `|${alt}` : ''}]]`;
}

function list(el: Element, ctx: Ctx, depth: number, ordered: boolean): string {
  const lines: string[] = [];
  let n = 0;
  for (const item of kids(el)) {
    if (ln(item) !== 'list-item' && ln(item) !== 'list-header') continue;
    const parts: string[] = [];
    for (const k of kids(item)) {
      if (ln(k) === 'list') parts.push(list(k, ctx, depth + 1, ordered));
      else {
        const t = blocks([k], ctx).trim();
        if (t) parts.push(parts.length ? `${'  '.repeat(depth + 1)}${t}` : t);
      }
    }
    if (!parts.length) continue;
    const marker = ordered ? `${++n}. ` : '- ';
    const first = parts[0]!.startsWith('  ') || parts[0]!.startsWith('- ') ? '' : parts.shift()!;
    lines.push(`${'  '.repeat(depth)}${marker}${first}`, ...parts);
  }
  return lines.join('\n');
}

function table(el: Element, ctx: Ctx): string {
  const rows: string[][] = [];
  for (const r of descendants(el, 'table-row')) {
    rows.push(kids(r, 'table-cell').map((c) => blocks(kids(c), ctx).trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|')));
  }
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array(cols - r.length).fill('')].join(' | ')} |`;
  return [line(rows[0]!), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line)].join('\n');
}

function blocks(els: Element[], ctx: Ctx): string {
  const out: string[] = [];
  for (const e of els) {
    switch (ln(e)) {
      case 'h': {
        const level = Math.min(6, Math.max(1, Number(attr(e, 'outline-level') ?? 1) || 1));
        const t = inline(e, ctx).replace(/<br>/g, ' ').trim();
        if (t) out.push(`${'#'.repeat(level)} ${t}`);
        break;
      }
      case 'p': {
        const t = inline(e, ctx).trim();
        if (t) out.push(t);
        break;
      }
      case 'list':
        out.push(list(e, ctx, 0, ctx.numbered.has(attr(e, 'style-name') ?? '')));
        break;
      case 'table':
        out.push(table(e, ctx));
        break;
      case 'section':
        out.push(blocks(kids(e), ctx));
        break;
      default:
        break;
    }
  }
  return out.filter(Boolean).join('\n\n');
}

export function odtToMarkdown(bytes: Uint8Array, opts: ConvertOptions): Converted {
  const zip: Zip = unzipSync(bytes);
  const content = zip['content.xml'];
  if (!content) throw new Error('Não parece um documento do LibreOffice (.odt).');
  const parse: ParseHtml = opts.parse;
  const doc = parse(strFromU8(content), 'application/xml');
  const stylesXml = zip['styles.xml'] ? parse(strFromU8(zip['styles.xml']), 'application/xml') : null;
  const looks = styles(doc);
  const numbered = new Set<string>();
  for (const d of [doc, stylesXml]) {
    if (!d) continue;
    for (const ls of descendants(d, 'list-style')) {
      const first = kids(ls)[0];
      if (first && ln(first) === 'list-level-style-number') numbered.add(attr(ls, 'name') ?? '');
    }
  }
  const ctx: Ctx = { zip, bag: new AssetBag(opts.assetDir), looks, numbered };
  const body = descendants(doc, 'text')[0] ?? doc.documentElement;
  const md = blocks(kids(body), ctx);
  const meta = zip['meta.xml'] ? descendants(parse(strFromU8(zip['meta.xml']), 'application/xml'), 'title')[0]?.textContent?.trim() ?? '' : '';
  return { title: meta, markdown: tidyMarkdown(md), assets: ctx.bag.assets };
}
