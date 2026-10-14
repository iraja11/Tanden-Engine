import { asText, parseProps, splitFrontmatter } from '../caderno/frontmatter';

/*
 * Apresentação = nota .md comum. Os slides são separados por uma linha com
 * `---`, como no plugin Slides do Obsidian, então a mesma nota abre lá.
 * Sem nenhum `---`, cada título # ou ## começa um slide.
 *
 *   ---
 *   tipo: apresentação
 *   transição: núcleo
 *   ---
 *
 *   # Título da capa
 *   subtítulo
 *
 *   ---
 *
 *   ## Primeiro assunto
 *   - ponto
 *
 *   > [!note] Notas do apresentador
 *   > só aparece para quem apresenta
 *
 * As notas do apresentador ficam num callout `[!note]` (formato que o
 * importador de .pptx já gera) ou depois de uma linha `nota:`/`notas:`
 * (formato do Advanced Slides).
 */

export type Transition = 'núcleo' | 'deslizar' | 'esmaecer' | 'nenhuma';
export const TRANSITIONS: Array<{ id: Transition; label: string; hint: string }> = [
  { id: 'núcleo', label: 'Núcleo', hint: 'o slide novo nasce do centro, com um pulso de energia' },
  { id: 'deslizar', label: 'Deslizar', hint: 'os slides correm para o lado, na direção em que você anda' },
  { id: 'esmaecer', label: 'Esmaecer', hint: 'um some enquanto o outro aparece' },
  { id: 'nenhuma', label: 'Nenhuma', hint: 'troca na hora' },
];

/** Como o slide se arruma, deduzido do conteúdo. */
export type Layout = 'capa' | 'seção' | 'imagem' | 'dividido' | 'conteúdo';

export interface Slide {
  /** Markdown do slide, sem as notas do apresentador */
  md: string;
  notes: string;
  title: string;
  layout: Layout;
  /** linha (a partir de 0) da nota inteira onde o slide começa */
  line: number;
}

export interface Deck {
  title: string;
  transition: Transition;
  slides: Slide[];
}

export const DECK_TYPE = 'apresentação';
export const DECK_FOLDER = 'Apresentações';

const FENCE_RE = /^(```|~~~)/;
const SEP_RE = /^---[ \t]*$/;
const HEAD_RE = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;
const EMBED_LINE = /^\s*(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\))\s*$/;

/** É uma apresentação? (tipo no topo ou dentro da pasta Apresentações/) */
export function isDeck(path: string, text: string): boolean {
  if (path.startsWith(`${DECK_FOLDER}/`)) return true;
  const tipo = asText(parseProps(text).tipo).toLowerCase();
  return tipo === DECK_TYPE || tipo === 'apresentacao' || tipo === 'slides';
}

function transitionOf(v: string): Transition {
  const t = v.trim().toLowerCase();
  if (t === 'nucleo' || t === 'núcleo') return 'núcleo';
  if (t === 'deslizar' || t === 'slide') return 'deslizar';
  if (t === 'esmaecer' || t === 'fade') return 'esmaecer';
  if (t === 'nenhuma' || t === 'none') return 'nenhuma';
  return 'núcleo';
}

/** Separa as notas do apresentador do conteúdo do slide. */
function splitNotes(lines: string[]): { body: string[]; notes: string[] } {
  const body: string[] = [];
  const notes: string[] = [];
  let fence = false;
  let inCallout = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (FENCE_RE.test(l.trim())) fence = !fence;
    if (!fence) {
      if (/^(nota|notas|note|notes):\s*$/i.test(l.trim())) {
        notes.push(...lines.slice(i + 1));
        break;
      }
      const head = /^>\s*\[!(note|notas?)\][+-]?\s*(.*)$/i.exec(l);
      if (head && (/apresentador|speaker/i.test(head[2]!) || /^notas?$/i.test(head[1]!) || !head[2])) {
        inCallout = true;
        if (head[2] && !/apresentador|speaker/i.test(head[2])) notes.push(head[2]);
        continue;
      }
      if (inCallout) {
        if (/^>/.test(l)) {
          notes.push(l.replace(/^>\s?/, ''));
          continue;
        }
        inCallout = false;
      }
    }
    body.push(l);
  }
  return { body, notes };
}

const clean = (s: string) =>
  s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_m, t: string) => t.split('/').pop()!.replace(/\.md$/, ''))
    .replace(/[*_`~=]/g, '')
    .trim();

/** Deduz o arranjo do slide pelo que ele contém. */
export function layoutOf(md: string): Layout {
  const lines = md.split('\n').filter((l) => l.trim() && !/^<!--.*-->$/.test(l.trim()));
  if (!lines.length) return 'conteúdo';
  const heads = lines.map((l) => HEAD_RE.exec(l));
  const images = lines.filter((l) => EMBED_LINE.test(l));
  const text = lines.filter((l, i) => !heads[i] && !EMBED_LINE.test(l));
  const firstHead = heads.find(Boolean);
  if (images.length === 1 && text.length === 0 && heads.filter(Boolean).length <= 1) return 'imagem';
  if (images.length === 1 && text.length > 0) return 'dividido';
  if (heads.filter(Boolean).length === 1 && !images.length && text.length <= 2 && text.join(' ').length < 220 && !text.some((l) => /^\s*([-*+]|\d+\.)\s|^\s*\|/.test(l))) {
    return firstHead![1]!.length === 1 ? 'capa' : 'seção';
  }
  return 'conteúdo';
}

function slideFrom(lines: string[], line: number): Slide | null {
  const { body, notes } = splitNotes(lines);
  const md = body.join('\n').trim();
  const note = notes.join('\n').trim();
  if (!md && !note) return null;
  const head = body.map((l) => HEAD_RE.exec(l)).find(Boolean);
  return { md, notes: note, title: head ? clean(head[2]!) : '', layout: layoutOf(md), line };
}

/** Lê a nota inteira (com o topo) e devolve os slides. */
export function parseDeck(text: string, fallbackTitle = ''): Deck {
  const { head, body } = splitFrontmatter(text.replace(/\r\n/g, '\n'));
  const props = parseProps(text);
  const offset = head ? head.length + 2 : 0;
  const lines = body.split('\n');

  // procura separadores fora dos blocos de código
  const seps: number[] = [];
  const heads: number[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (FENCE_RE.test(l.trim())) fence = !fence;
    if (fence) return;
    if (SEP_RE.test(l)) seps.push(i);
    const h = HEAD_RE.exec(l);
    if (h && h[1]!.length <= 2) heads.push(i);
  });

  const cuts = seps.length ? seps : heads;
  const slides: Slide[] = [];
  let start = 0;
  const push = (from: number, to: number) => {
    const s = slideFrom(lines.slice(from, to), offset + from);
    if (s) slides.push(s);
  };
  for (const c of cuts) {
    if (seps.length) {
      push(start, c);
      start = c + 1;
    } else if (c > start) {
      push(start, c);
      start = c;
    }
  }
  push(start, lines.length);

  const title = asText(props.título ?? props.titulo ?? props.title) || slides.find((s) => s.title)?.title || fallbackTitle;
  return { title, transition: transitionOf(asText(props.transição ?? props.transicao ?? props.transition)), slides };
}

/** Em que slide está a linha `line` da nota (para seguir o cursor do editor). */
export function slideAtLine(deck: Deck, line: number): number {
  let idx = 0;
  deck.slides.forEach((s, i) => {
    if (s.line <= line) idx = i;
  });
  return idx;
}

/* ------------------------------------------------- nota → apresentação */

/** Peso aproximado de um bloco em linhas de slide. */
function weight(block: string): number {
  const lines = block.split('\n');
  if (FENCE_RE.test(lines[0]!.trim())) return Math.min(lines.length, 14) * 0.8;
  if (/^\s*\|/.test(lines[0]!)) return lines.length * 0.9;
  if (EMBED_LINE.test(block)) return 6;
  return lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.trim().length / 70)), 0);
}

/** Corta o texto em blocos: parágrafos, itens de lista, tabelas e código ficam inteiros. */
function blocks(body: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let fence = false;
  const flush = () => {
    if (cur.join('').trim()) out.push(cur.join('\n').trim());
    cur = [];
  };
  for (const l of body.split('\n')) {
    if (FENCE_RE.test(l.trim())) {
      if (!fence) flush();
      fence = !fence;
      cur.push(l);
      if (!fence) flush();
      continue;
    }
    if (fence) {
      cur.push(l);
      continue;
    }
    if (!l.trim()) {
      flush();
      continue;
    }
    // cada item de lista de primeiro nível é um bloco (sub-itens vão junto)
    if (/^([-*+]|\d+[.)])\s/.test(l) || (/^\s*\|/.test(l) && cur.length && !/^\s*\|/.test(cur[cur.length - 1]!))) flush();
    cur.push(l);
  }
  flush();
  return out;
}

const MAX_WEIGHT = 9;

/**
 * Transforma uma nota qualquer numa apresentação: o título vira a capa, cada
 * seção (## ou ###) vira um slide e seções longas continuam no slide seguinte.
 * Uma nota que já tem `---` entre slides é mantida como está.
 */
export function deckFromNote(text: string, opts: { title: string; source?: string }): string {
  const { body } = splitFrontmatter(text.replace(/\r\n/g, '\n'));
  const top = [`---`, `tipo: ${DECK_TYPE}`, `transição: núcleo`];
  if (opts.source) top.push(`fonte: "[[${opts.source.replace(/\.md$/, '')}]]"`);
  top.push('---', '');
  const header = top.join('\n');

  const hasSeps = body.split('\n').some((l) => SEP_RE.test(l));
  if (hasSeps) return `${header}\n${body.trim()}\n`;

  const lines = body.split('\n');
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  const title = h1 >= 0 ? HEAD_RE.exec(lines[h1]!)![2]! : opts.title;
  const rest = h1 >= 0 ? [...lines.slice(0, h1), ...lines.slice(h1 + 1)] : lines;

  // nível que separa as seções: ## se houver, senão ###
  let level = 0;
  for (const n of [2, 3]) {
    if (rest.some((l) => new RegExp(`^#{${n}}\\s`).test(l))) {
      level = n;
      break;
    }
  }

  const sections: Array<{ head: string; body: string }> = [];
  let cur = { head: '', body: [] as string[] };
  let fence = false;
  for (const l of rest) {
    if (FENCE_RE.test(l.trim())) fence = !fence;
    const h = !fence && level ? HEAD_RE.exec(l) : null;
    if (h && h[1]!.length === level) {
      sections.push({ head: cur.head, body: cur.body.join('\n') });
      cur = { head: h[2]!, body: [] };
    } else cur.body.push(l);
  }
  sections.push({ head: cur.head, body: cur.body.join('\n') });

  const slides: string[] = [];
  // capa: título e, se houver, um parágrafo curto de abertura
  const intro = blocks(sections[0]!.body);
  const lead = intro[0] && !/^([-*+]|\d+\.|\||#|!\[|```)/.test(intro[0]) && intro[0].length <= 200 ? intro.shift()! : '';
  slides.push(`# ${title}${lead ? `\n\n${lead}` : ''}`);
  if (intro.length) sections[0] = { head: 'Introdução', body: intro.join('\n\n') };
  else sections.shift();

  for (const s of sections) {
    const parts = blocks(s.body);
    if (!parts.length) {
      if (s.head) slides.push(`## ${s.head}`);
      continue;
    }
    let page: string[] = [];
    let w = 0;
    let n = 0;
    const flush = () => {
      if (!page.length) return;
      const head = s.head ? `## ${s.head}${n > 0 ? ' (cont.)' : ''}\n\n` : '';
      slides.push(`${head}${page.join('\n\n')}`);
      page = [];
      w = 0;
      n++;
    };
    for (const p of parts) {
      const pw = weight(p);
      if (page.length && w + pw > MAX_WEIGHT) flush();
      page.push(p);
      w += pw;
    }
    flush();
  }
  return `${header}\n${slides.join('\n\n---\n\n')}\n`;
}

/** Apresentação feita de um PDF: cada página vira um slide (a página é mostrada como imagem). */
export function deckFromPdf(pdfPath: string, pages: number, title: string): string {
  const slides = Array.from({ length: pages }, (_, i) => `![[${pdfPath}#page=${i + 1}]]`);
  return [`---`, `tipo: ${DECK_TYPE}`, `transição: esmaecer`, `original: "[[${pdfPath}]]"`, `título: "${title.replace(/"/g, "'")}"`, `---`, '', slides.join('\n\n---\n\n'), ''].join('\n');
}

/** Nota gerada pelo importador de .pptx → apresentação (tira a numeração "1. " dos títulos). */
export function deckFromImported(markdown: string, original: string): string {
  const body = markdown.replace(/^## \d+\. /gm, '## ');
  // o primeiro slide do pptx costuma ser a capa: ## vira #
  const first = body.split(/\n---\n/)[0]!;
  const cover = layoutOf(first) === 'seção' ? first.replace(/^## /m, '# ') : first;
  const rest = body.slice(first.length);
  return [`---`, `tipo: ${DECK_TYPE}`, `transição: núcleo`, `original: "[[${original}]]"`, `---`, '', `${cover}${rest}`.trim(), ''].join('\n');
}
