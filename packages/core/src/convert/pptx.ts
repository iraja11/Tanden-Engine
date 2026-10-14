import { strFromU8, unzipSync } from 'fflate';
import { attr, descendants, kid, kids, ln, zipJoin, type ParseHtml } from './dom';
import { officeTitle } from './docx';
import { tidyMarkdown } from './html';
import { AssetBag, type ConvertOptions, type Converted } from './types';

/*
 * .pptx → nota. Cada slide vira uma seção "## n. Título", com os textos na
 * ordem de leitura (de cima para baixo, da esquerda para a direita), tabelas
 * em Markdown, imagens como anexos e as notas do apresentador num callout.
 */

type Zip = Record<string, Uint8Array>;

interface Rel {
  target: string;
  type: string;
}

function rels(zip: Zip, part: string, parse: ParseHtml): Map<string, Rel> {
  const relPath = zipJoin(part, `_rels/${part.split('/').pop()}.rels`);
  const out = new Map<string, Rel>();
  const raw = zip[relPath];
  if (!raw) return out;
  for (const r of descendants(parse(strFromU8(raw), 'application/xml'), 'relationship')) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (!id || !target) continue;
    const external = r.getAttribute('TargetMode') === 'External';
    out.set(id, { target: external ? target : zipJoin(part, target), type: (r.getAttribute('Type') ?? '').split('/').pop() ?? '' });
  }
  return out;
}

const escMd = (s: string) => s.replace(/([*_`[\]\\])/g, '\\$1');

/** Texto de um parágrafo do DrawingML (a:p), com negrito, itálico e links. */
function runsText(p: Element, links: Map<string, Rel>): string {
  let out = '';
  for (const r of kids(p)) {
    const name = ln(r);
    if (name === 'br') {
      out += '<br>';
      continue;
    }
    if (name !== 'r' && name !== 'fld') continue;
    const t = kid(r, 't')?.textContent ?? '';
    if (!t) continue;
    const pr = kid(r, 'rpr');
    let s = escMd(t);
    const lead = s.match(/^\s*/)![0];
    const trail = s.match(/\s*$/)![0];
    let core = s.trim();
    if (core) {
      if (pr?.getAttribute('b') === '1') core = `**${core}**`;
      if (pr?.getAttribute('i') === '1') core = `*${core}*`;
      if (pr?.getAttribute('strike') && pr.getAttribute('strike') !== 'noStrike') core = `~~${core}~~`;
      const hl = kid(pr, 'hlinkclick');
      const link = hl?.getAttribute('r:id') ?? attr(hl, 'id');
      const href = link ? links.get(link)?.target : undefined;
      if (href && /^(https?|mailto):/i.test(href)) core = `[${core}](${href.replace(/[()\s]/g, encodeURIComponent)})`;
      s = `${lead}${core}${trail}`;
    }
    out += s;
  }
  // marcadores vizinhos se fundem: **a** **b** → **a b**
  return out.replace(/\*\*(\s*)\*\*/g, '$1').trim();
}

interface Block {
  y: number;
  x: number;
  title: boolean;
  md: string;
}

function offset(el: Element): { x: number; y: number } {
  const off = descendants(kid(el, 'sppr') ?? kid(el, 'grpsppr') ?? kid(el, 'xfrm') ?? el, 'off')[0];
  return { x: Number(off?.getAttribute('x') ?? 0), y: Number(off?.getAttribute('y') ?? 0) };
}

function placeholder(sp: Element): string | null {
  const nv = kids(sp).find((k) => ln(k).startsWith('nv'));
  const ph = nv ? descendants(nv, 'ph')[0] : undefined;
  if (!ph) return null;
  return (ph.getAttribute('type') ?? 'body').toLowerCase();
}

function textBody(body: Element, links: Map<string, Rel>, bulletsByDefault: boolean): string {
  const lines: string[] = [];
  let num = 0;
  for (const p of kids(body, 'p')) {
    const text = runsText(p, links);
    if (!text) {
      num = 0;
      continue;
    }
    const pr = kid(p, 'ppr');
    const lvl = Number(pr?.getAttribute('lvl') ?? 0) || 0;
    const indent = '  '.repeat(lvl);
    const none = !!kid(pr, 'bunone');
    const auto = kid(pr, 'buautonum');
    const char = kid(pr, 'buchar');
    if (auto && !none) lines.push(`${indent}${++num}. ${text}`);
    else if ((char || bulletsByDefault) && !none) lines.push(`${indent}- ${text}`);
    else {
      num = 0;
      lines.push(lines.length && !/^\s*(-|\d+\.)\s/.test(lines[lines.length - 1]!) ? `\n${text}` : text);
    }
  }
  return lines.join('\n');
}

function table(tbl: Element, links: Map<string, Rel>): string {
  const rows = kids(tbl, 'tr').map((tr) =>
    kids(tr, 'tc')
      .filter((tc) => tc.getAttribute('hMerge') !== '1')
      .map((tc) => {
        const body = kid(tc, 'txbody');
        return body ? kids(body, 'p').map((p) => runsText(p, links)).filter(Boolean).join('<br>').replace(/\|/g, '\\|') : '';
      }),
  );
  if (!rows.length) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${[...r, ...Array(cols - r.length).fill('')].join(' | ')} |`;
  return [line(rows[0]!), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line)].join('\n');
}

const MONO = /mono|consol|courier|menlo|monaco|code|inconsolata/i;

/** Caixa de texto toda em fonte de largura fixa: é código. */
function monospace(body: Element): boolean {
  const runs = descendants(body, 'r');
  return runs.length > 0 && runs.every((r) => MONO.test(attr(kid(kid(r, 'rpr'), 'latin'), 'typeface') ?? ''));
}

function codeBlock(body: Element): string {
  const lines = kids(body, 'p').flatMap((p) => {
    let line = '';
    const out: string[] = [];
    for (const r of kids(p)) {
      if (ln(r) === 'br') {
        out.push(line);
        line = '';
      } else if (ln(r) === 'r') line += kid(r, 't')?.textContent ?? '';
    }
    out.push(line);
    return out;
  });
  const fence = lines.some((l) => l.includes('```')) ? '~~~' : '```';
  return `${fence}\n${lines.join('\n').replace(/\s+$/, '')}\n${fence}`;
}

function shapes(tree: Element, ctx: { zip: Zip; rels: Map<string, Rel>; bag: AssetBag; seen: Map<string, string> }): Block[] {
  const out: Block[] = [];
  for (const el of kids(tree)) {
    const name = ln(el);
    const { x, y } = offset(el);
    if (name === 'sp') {
      const body = kid(el, 'txbody');
      if (!body) continue;
      const ph = placeholder(el);
      const isTitle = ph === 'title' || ph === 'ctrtitle';
      if (isTitle) {
        const md = kids(body, 'p').map((p) => runsText(p, ctx.rels)).filter(Boolean).join(' ').replace(/<br>/g, ' ');
        if (md) out.push({ x, y, title: true, md });
        continue;
      }
      if (!ph && monospace(body)) {
        out.push({ x, y, title: false, md: codeBlock(body) });
        continue;
      }
      const isBody = ph === 'body' || ph === 'obj' || (ph !== null && ph !== 'subtitle' && !['dt', 'ftr', 'sldnum', 'hdr'].includes(ph));
      if (ph && ['dt', 'ftr', 'sldnum', 'hdr'].includes(ph)) continue; // data, rodapé e número do slide
      const md = textBody(body, ctx.rels, isBody);
      if (md) out.push({ x, y, title: false, md: ph === 'subtitle' ? `*${md.replace(/\n+/g, ' ')}*` : md });
    } else if (name === 'grpsp') {
      out.push(...shapes(el, ctx));
    } else if (name === 'graphicframe') {
      const tbl = descendants(el, 'tbl')[0];
      if (tbl) out.push({ x, y, title: false, md: table(tbl, ctx.rels) });
    } else if (name === 'pic') {
      const blip = descendants(el, 'blip')[0];
      const id = attr(blip, 'embed');
      const target = id ? ctx.rels.get(id)?.target : undefined;
      const data = target ? ctx.zip[target] : undefined;
      if (!target || !data) continue;
      const alt = (descendants(el, 'cnvpr')[0]?.getAttribute('descr') ?? '').replace(/[[\]\n|]/g, ' ').trim();
      let path = ctx.seen.get(target);
      if (!path) {
        path = ctx.bag.add(target.split('/').pop()!, data);
        ctx.seen.set(target, path);
      }
      out.push({ x, y, title: false, md: `![[${path}${alt ? `|${alt}` : ''}]]` });
    }
  }
  return out;
}

export function pptxToMarkdown(bytes: Uint8Array, opts: ConvertOptions): Converted {
  const zip: Zip = unzipSync(bytes);
  const parse = opts.parse;
  const pres = 'ppt/presentation.xml';
  if (!zip[pres]) throw new Error('Não parece um arquivo do PowerPoint (.pptx).');
  const presRels = rels(zip, pres, parse);
  const presDoc = parse(strFromU8(zip[pres]!), 'application/xml');
  const slidePaths = descendants(presDoc, 'sldid')
    .map((s) => presRels.get(s.getAttribute('r:id') ?? attr(s, 'id') ?? '')?.target)
    .filter((p): p is string => !!p && !!zip[p]);
  const bag = new AssetBag(opts.assetDir);
  const seen = new Map<string, string>();
  const sections: string[] = [];

  slidePaths.forEach((path, i) => {
    const doc = parse(strFromU8(zip[path]!), 'application/xml');
    const slideRels = rels(zip, path, parse);
    if (doc.documentElement.getAttribute('show') === '0') return; // slide oculto
    const tree = descendants(doc, 'sptree')[0];
    const blocks = tree ? shapes(tree, { zip, rels: slideRels, bag, seen }) : [];
    const title = blocks.find((b) => b.title)?.md ?? '';
    const body = blocks
      .filter((b) => !b.title)
      .sort((a, b) => (Math.abs(a.y - b.y) < 120000 ? a.x - b.x : a.y - b.y)) // ~3 mm de tolerância na mesma linha
      .map((b) => b.md);

    const notesPath = [...slideRels.values()].find((r) => r.type === 'notesSlide')?.target;
    let notes = '';
    if (notesPath && zip[notesPath]) {
      const nd = parse(strFromU8(zip[notesPath]!), 'application/xml');
      const parts = descendants(nd, 'sp')
        .filter((sp) => placeholder(sp) === 'body')
        .map((sp) => {
          const b = kid(sp, 'txbody');
          return b ? textBody(b, new Map(), false) : '';
        })
        .filter(Boolean);
      notes = parts.join('\n').trim();
    }

    let section = `## ${i + 1}. ${title || `Slide ${i + 1}`}`;
    if (body.length) section += `\n\n${body.join('\n\n')}`;
    if (notes) section += `\n\n> [!note] Notas do apresentador\n${notes.split('\n').map((l) => `> ${l}`).join('\n')}`;
    sections.push(section);
  });

  const title = officeTitle(zip, parse);
  return { title, markdown: tidyMarkdown(sections.join('\n\n---\n\n')), assets: bag.assets };
}
