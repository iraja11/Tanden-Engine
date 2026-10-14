import { Lexer, type Token, type Tokens } from 'marked';
import { obsidianToCommonMark } from '../convert/export';
import type { Layout, Slide } from './deck';

/*
 * Slide em Markdown → blocos simples (título, parágrafos com estilo, listas,
 * código, tabelas e imagens). É o que o .pptx e o PDF desenham; a tela do
 * app usa HTML direto.
 */

export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
  mark?: boolean;
  link?: string;
}

export type Block =
  | { t: 'p'; runs: Run[]; level: number; bullet: string | null; quote?: boolean }
  | { t: 'h'; runs: Run[]; depth: number }
  | { t: 'code'; text: string; lang: string }
  | { t: 'table'; header: Run[][]; rows: Run[][][] }
  | { t: 'img'; target: string; alt: string };

export interface SlideModel {
  layout: Layout;
  title: Run[] | null;
  titleDepth: number;
  blocks: Block[];
  notes: string;
}

export const EMBED = 'tanden-embed:';

/**
 * Markdown do Obsidian → Markdown comum para um slide. Os embeds mantêm o
 * pedaço depois do # (ex.: `PDFs/aula.pdf#page=3`), que diz qual página mostrar.
 */
export function slideCommonMark(md: string): string {
  const parts = md.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$)/m);
  const pre = parts
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alt?: string) => {
            const a = alt && !/^\d+(x\d+)?$/.test(alt) ? alt : '';
            return `![${a.replace(/[[\]]/g, '')}](<${EMBED}${target.trim()}>)`;
          }),
    )
    .join('');
  return obsidianToCommonMark(pre);
}

function runs(tokens: Token[] | undefined, look: Omit<Run, 'text'> = {}): Run[] {
  const out: Run[] = [];
  let mark = false;
  for (const tk of tokens ?? []) {
    const st = { ...look, ...(mark ? { mark: true } : {}) };
    switch (tk.type) {
      case 'strong':
        out.push(...runs((tk as Tokens.Strong).tokens, { ...st, b: true }));
        break;
      case 'em':
        out.push(...runs((tk as Tokens.Em).tokens, { ...st, i: true }));
        break;
      case 'del':
        out.push(...runs((tk as Tokens.Del).tokens, { ...st, s: true }));
        break;
      case 'codespan':
        out.push({ ...st, code: true, text: decode((tk as Tokens.Codespan).text) });
        break;
      case 'link': {
        const l = tk as Tokens.Link;
        out.push(...runs(l.tokens, { ...st, link: l.href }));
        break;
      }
      case 'br':
        out.push({ ...st, text: '\n' });
        break;
      case 'html': {
        const raw = (tk as Tokens.HTML).raw.trim().toLowerCase();
        if (raw === '<mark>') mark = true;
        else if (raw === '</mark>') mark = false;
        else if (raw === '<br>' || raw === '<br/>') out.push({ ...st, text: '\n' });
        break;
      }
      case 'image':
        break; // imagem no meio do texto: o slide mostra só as de linha própria
      case 'text': {
        const t = tk as Tokens.Text;
        if (t.tokens?.length) out.push(...runs(t.tokens, st));
        else out.push({ ...st, text: decode(t.text) });
        break;
      }
      case 'escape':
        out.push({ ...st, text: (tk as Tokens.Escape).text });
        break;
      default:
        if ('text' in tk && typeof tk.text === 'string') out.push({ ...st, text: decode(tk.text) });
    }
  }
  // junta pedaços vizinhos com o mesmo estilo
  const merged: Run[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && same(last, r)) last.text += r.text;
    else if (r.text) merged.push({ ...r });
  }
  return merged;
}

const same = (a: Run, b: Run) => !!a.b === !!b.b && !!a.i === !!b.i && !!a.s === !!b.s && !!a.code === !!b.code && !!a.mark === !!b.mark && a.link === b.link;

function decode(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const imageOf = (tk: Tokens.Paragraph): Tokens.Image | null => {
  const kids = (tk.tokens ?? []).filter((k) => !(k.type === 'text' && !(k as Tokens.Text).text.trim()));
  return kids.length === 1 && kids[0]!.type === 'image' ? (kids[0] as Tokens.Image) : null;
};

const imgBlock = (im: Tokens.Image): Block => ({
  t: 'img',
  target: im.href.startsWith(EMBED) ? im.href.slice(EMBED.length) : im.href,
  alt: im.text,
});

function walk(tokens: Token[], out: Block[], level = 0, quote = false): void {
  for (const tk of tokens) {
    switch (tk.type) {
      case 'heading': {
        const h = tk as Tokens.Heading;
        out.push({ t: 'h', runs: runs(h.tokens), depth: h.depth });
        break;
      }
      case 'paragraph': {
        const p = tk as Tokens.Paragraph;
        const im = imageOf(p);
        if (im) out.push(imgBlock(im));
        else out.push({ t: 'p', runs: runs(p.tokens), level, bullet: null, ...(quote ? { quote } : {}) });
        break;
      }
      case 'text': {
        // texto solto dentro de item de lista "apertada"
        const t = tk as Tokens.Text;
        out.push({ t: 'p', runs: t.tokens?.length ? runs(t.tokens) : [{ text: decode(t.text) }], level, bullet: null });
        break;
      }
      case 'list': {
        const l = tk as Tokens.List;
        let n = typeof l.start === 'number' ? l.start : 1;
        for (const item of l.items) {
          const bullet = item.task ? (item.checked ? '☑' : '☐') : l.ordered ? `${n++}.` : '•';
          const inner: Block[] = [];
          walk(item.tokens.filter((k) => k.type !== 'checkbox'), inner, level + 1, quote);
          // o primeiro parágrafo do item leva o marcador
          const first = inner.find((b) => b.t === 'p' && b.level === level + 1) as Extract<Block, { t: 'p' }> | undefined;
          if (first) {
            first.bullet = bullet;
            if (item.task && first.runs[0]) first.runs[0].text = first.runs[0].text.replace(/^\[[ xX]\]\s*/, '');
          } else inner.unshift({ t: 'p', runs: [], level: level + 1, bullet });
          out.push(...inner);
        }
        break;
      }
      case 'code': {
        const c = tk as Tokens.Code;
        out.push({ t: 'code', text: c.text, lang: c.lang ?? '' });
        break;
      }
      case 'table': {
        const t = tk as Tokens.Table;
        out.push({ t: 'table', header: t.header.map((c) => runs(c.tokens)), rows: t.rows.map((r) => r.map((c) => runs(c.tokens))) });
        break;
      }
      case 'blockquote':
        walk((tk as Tokens.Blockquote).tokens, out, level, true);
        break;
      default:
        break; // hr, html solto, espaços
    }
  }
}

export function slideModel(slide: Slide): SlideModel {
  const blocks: Block[] = [];
  walk(new Lexer({ gfm: true }).lex(slideCommonMark(slide.md)), blocks);
  // o primeiro título vira o título do slide
  const hi = blocks.findIndex((b) => b.t === 'h');
  let title: Run[] | null = null;
  let titleDepth = 2;
  if (hi >= 0 && blocks.slice(0, hi).every((b) => b.t === 'img')) {
    const h = blocks.splice(hi, 1)[0] as Extract<Block, { t: 'h' }>;
    title = h.runs;
    titleDepth = h.depth;
  }
  return { layout: slide.layout, title, titleDepth, blocks, notes: slide.notes };
}

export const plain = (rs: Run[]): string => rs.map((r) => r.text).join('');

/** Alvos de imagem usados pela apresentação (para quem exporta buscar os bytes antes). */
export function imageTargets(models: SlideModel[]): string[] {
  const set = new Set<string>();
  for (const m of models) for (const b of m.blocks) if (b.t === 'img') set.add(b.target);
  return [...set];
}

/* ------------------------------------------------------------- medidas */

/**
 * Altura aproximada (em linhas de corpo) que os blocos ocupam numa largura
 * de `cols` caracteres. Serve para escolher o tamanho da letra no .pptx,
 * onde não dá para medir o texto de verdade.
 */
export function estimateLines(blocks: Block[], cols: number): number {
  let n = 0;
  for (const b of blocks) {
    if (b.t === 'p') n += Math.max(1, Math.ceil((plain(b.runs).length + b.level * 3) / cols)) + 0.25;
    else if (b.t === 'h') n += 1.5;
    else if (b.t === 'code') n += b.text.split('\n').length * 0.85 + 0.6;
    else if (b.t === 'table') n += (b.rows.length + 1) * 1.15 + 0.4;
  }
  return n;
}
