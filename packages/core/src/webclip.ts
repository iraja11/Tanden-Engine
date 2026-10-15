import { Readability } from '@mozilla/readability';
import type { ParseHtml } from './convert/dom';
import { htmlToMarkdown } from './convert/html';
import { asList, parseProps, setProps, splitFrontmatter, type PropValue } from './caderno/frontmatter';
import { fillTemplate } from './base/templates';

/*
 * Páginas web dentro das notas.
 *
 * - Recorte: o artigo principal da página (sem menus, anúncios e rodapés)
 *   vira uma nota Markdown com as imagens baixadas para o cofre, para ler
 *   offline e sincronizar. As propriedades no topo seguem o Web Clipper do
 *   Obsidian (title, source, author, published, created, description, tags).
 * - Cartão: só o link, com título, descrição e site, num callout.
 */

export interface PageMeta {
  url: string;
  title: string;
  description: string;
  siteName: string;
  image: string;
  author: string;
  published: string;
  lang: string;
}

const meta = (doc: Document, ...keys: string[]): string => {
  for (const k of keys) {
    const el = doc.querySelector(`meta[property="${k}"], meta[name="${k}"], meta[itemprop="${k}"]`);
    const v = el?.getAttribute('content')?.trim();
    if (v) return v;
  }
  return '';
};

const abs = (href: string, base: string): string => {
  try {
    return href ? new URL(href, base).href : '';
  } catch {
    return '';
  }
};

export function readPageMeta(doc: Document, url: string): PageMeta {
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  const base = doc.querySelector('base[href]')?.getAttribute('href') ?? url;
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();
  return {
    url: abs(canonical, url) || url,
    title: (meta(doc, 'og:title', 'twitter:title') || doc.querySelector('title')?.textContent || host).replace(/\s+/g, ' ').trim(),
    description: meta(doc, 'og:description', 'description', 'twitter:description').replace(/\s+/g, ' '),
    siteName: meta(doc, 'og:site_name', 'application-name') || host,
    image: abs(meta(doc, 'og:image', 'og:image:url', 'twitter:image'), base),
    author: meta(doc, 'author', 'article:author', 'parsely-author'),
    published: meta(doc, 'article:published_time', 'datePublished', 'pubdate', 'date').slice(0, 10),
    lang: doc.documentElement.getAttribute('lang') ?? '',
  };
}

export interface PreparedClip {
  meta: PageMeta;
  /** HTML do artigo, já sem o resto da página */
  content: Document;
  /** imagens do artigo (endereços absolutos), na ordem em que aparecem */
  images: string[];
  /** a página não tinha um artigo claro; o corpo inteiro foi usado */
  whole: boolean;
  /** vídeo da página (YouTube, Vimeo): entra na nota como player */
  video?: string;
}

/** Id do vídeo do YouTube num endereço (watch, youtu.be, shorts, embed, live), ou null. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return /^[\w-]{6,}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{6,}$/.test(v)) return v;
    const m = /^\/(?:shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

/** Texto de uma string JSON achada no meio do HTML ("shortDescription":"..."). */
function jsonField(html: string, key: string): string {
  const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(html);
  if (!m) return '';
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return '';
  }
}

/** Página de vídeo do YouTube: o player, o canal e a descrição inteira (o artigo não serve). */
function prepareYoutube(html: string, url: string, id: string, doc: Document, info: PageMeta, parse: ParseHtml): PreparedClip {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  info.url = watch;
  info.siteName = 'YouTube';
  info.title = (info.title || jsonField(html, 'title')).replace(/\s+-\s+YouTube$/, '');
  info.author = info.author || jsonField(html, 'ownerChannelName') || doc.querySelector('link[itemprop="name"]')?.getAttribute('content') || '';
  info.published = info.published || (doc.querySelector('meta[itemprop="uploadDate"], meta[itemprop="datePublished"]')?.getAttribute('content') ?? jsonField(html, 'publishDate')).slice(0, 10);
  info.image = info.image || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const full = jsonField(html, 'shortDescription') || info.description;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // links e marcas de tempo da descrição continuam clicáveis
  const para = full
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>')}</p>`)
    .join('');
  void url;
  return { meta: info, content: parse(`<!doctype html><html><body>${para}</body></html>`, 'text/html'), images: [], whole: false, video: watch };
}

/** Separa o artigo da página e lista as imagens dele, para o app baixar. */
export function prepareClip(html: string, url: string, parse: ParseHtml): PreparedClip {
  const doc = parse(html, 'text/html');
  const info = readPageMeta(doc, url);
  const yt = youtubeId(url) ?? youtubeId(info.url);
  if (yt) return prepareYoutube(html, url, yt, doc, info, parse);
  const base = doc.querySelector('base[href]')?.getAttribute('href') ?? url;
  // imagens preguiçosas: o endereço real fica em data-src/srcset
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const lazy = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    const best = srcset
      ?.split(',')
      .map((s) => s.trim().split(/\s+/))
      .filter((p) => p[0])
      .sort((a, b) => parseFloat(b[1] ?? '1') - parseFloat(a[1] ?? '1'))[0]?.[0];
    const src = lazy || (!img.getAttribute('src') || img.getAttribute('src')!.startsWith('data:') ? best : '') || img.getAttribute('src') || '';
    if (src) img.setAttribute('src', abs(src, base));
  }
  const clone = parse(doc.documentElement.outerHTML, 'text/html');
  let article: ReturnType<Readability<string>['parse']> = null;
  try {
    article = new Readability(clone, { charThreshold: 300, keepClasses: true }).parse();
  } catch {
    article = null;
  }
  const whole = !article?.content;
  const content = parse(`<!doctype html><html><body>${article?.content ?? doc.body?.innerHTML ?? ''}</body></html>`, 'text/html');
  if (article) {
    if (article.title && !info.title) info.title = article.title;
    if (article.byline && !info.author) info.author = article.byline.replace(/\s+/g, ' ').trim();
    if (article.excerpt && !info.description) info.description = article.excerpt.replace(/\s+/g, ' ').trim();
    if (article.siteName && info.siteName === '') info.siteName = article.siteName;
  }
  const images: string[] = [];
  for (const img of Array.from(content.querySelectorAll('img'))) {
    const src = abs(img.getAttribute('src') ?? '', base);
    if (/^https?:/.test(src) && !images.includes(src)) images.push(src);
  }
  return { meta: info, content, images, whole };
}

/** Valor de propriedade YAML: sem aspas quando dá (como o Obsidian grava), com aspas quando precisa. */
const yamlString = (s: string): string =>
  s && s.trim() === s && !/^[\s"'#&*!|>%@`{}[\],?:-]/.test(s) && !/: |\s#|:$|^\d|[\n"\\]/.test(s) && !/^(true|false|null|yes|no|~)$/i.test(s)
    ? s
    : JSON.stringify(s);

/** Data e hora local no formato das propriedades do Obsidian (2026-10-14T21:30). */
export function localStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export interface ClipOptions {
  parse: ParseHtml;
  /** onde cada imagem baixada ficou no cofre; as que faltam apontam para a web */
  images?: Map<string, string>;
  now?: Date;
  /** tags além de "web" */
  tags?: string[];
  /** trechos para destacar (==assim==) e listar em "Destaques" */
  highlights?: string[];
  /** comentário seu, num callout no topo */
  comment?: string;
  /** modelo de recorte (Modelos/Recortes/) */
  template?: ClipTemplate | null;
}

export const HIGHLIGHTS_TITLE = 'Destaques';
/** status inicial: o recorte entra na lista de leitura */
export const CLIP_UNREAD = 'Para ler';

const dedupe = (xs: string[]) => [...new Set(xs.map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];

/** Corpo do artigo em Markdown (com o player, se for vídeo). */
function clipBody(clip: PreparedClip, opts: ClipOptions): string {
  const m = clip.meta;
  const body = htmlToMarkdown(clip.content, {
    parse: opts.parse,
    baseUrl: m.url,
    image: (src) => opts.images?.get(src) ?? null,
  }).trim();
  // o recorte não repete o título se o artigo já começa com ele
  const clean = body.replace(new RegExp(`^#{1,2} ${m.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '');
  return clip.video ? `![](${clip.video})\n\n${clean}`.trim() : clean;
}

/**
 * Nota do recorte. Sem modelo, as propriedades seguem o Web Clipper do
 * Obsidian (title, source, author, published, created, description, tags),
 * mais site e status para a lista de leitura.
 */
export function clipToMarkdown(clip: PreparedClip, opts: ClipOptions): string {
  const m = clip.meta;
  const body = clipBody(clip, opts);
  const tags = dedupe(['web', ...(opts.tags ?? [])]);
  let text: string;
  if (opts.template) {
    text = renderClipTemplate(opts.template, clip, body, { ...opts, tags });
  } else {
    const props = [
      ['title', m.title],
      ['source', m.url],
      ['author', m.author],
      ['published', m.published],
      ['created', localStamp(opts.now)],
      ['description', m.description.slice(0, 300)],
      ['site', m.siteName],
      ['status', CLIP_UNREAD],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${yamlString(v!)}`);
    const head = `# ${m.title}\n\n> [!info] [${m.siteName || 'Fonte'}](${m.url})${m.author ? ` · ${m.author}` : ''}${m.published ? ` · ${m.published}` : ''}`;
    const note = opts.comment?.trim() ? `\n\n> [!quote] Minha nota\n${opts.comment.trim().split('\n').map((l) => `> ${l}`).join('\n')}` : '';
    text = `---\n${props.join('\n')}\ntags:\n${tags.map((t) => `  - ${yamlString(t)}`).join('\n')}\n---\n\n${head}${note}\n\n${body}\n`;
  }
  for (const h of opts.highlights ?? []) text = addHighlight(text, h).text;
  return text;
}

// ------------------------------------------------------------------ destaques

const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Regex que acha o trecho no Markdown: espaços viram \s+ e cada caractere que
 * o conversor costuma escapar (\*, \_, \[) aceita a barra antes.
 */
function passageRe(p: string): RegExp {
  let src = '';
  for (const ch of p) {
    if (/\s/.test(ch)) {
      if (!src.endsWith('\\s+')) src += '\\s+';
    } else if (/[\\`*_{}[\]()#+\-.!|>~<]/.test(ch)) src += `\\\\?${reEsc(ch)}`;
    else src += reEsc(ch);
  }
  return new RegExp(src);
}

/** Trechos ==destacados== do corpo (fora de código e da própria seção Destaques). */
export function collectHighlights(text: string): string[] {
  const out: string[] = [];
  let inCode = false;
  const lines = splitFrontmatter(text).body.split('\n');
  const sect = findHighlights(lines);
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode || (sect && i >= sect.head && i < sect.end)) return;
    for (const m of line.matchAll(/==([^=\n](?:[^=\n]|=(?!=))*?)==/g)) {
      const t = m[1]!.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  });
  return out;
}

/** Itens da seção "## Destaques" (sem o "- "). */
function sectionItems(lines: string[], r: { head: number; end: number } | null): string[] {
  if (!r) return [];
  return lines.slice(r.head + 1, r.end).filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => l.replace(/^\s*[-*]\s+/, '').trim());
}

/** A seção "## Destaques": o título e a lista logo abaixo dele (o texto que vem depois não faz parte). */
function findHighlights(lines: string[]): { head: number; end: number } | null {
  const i = lines.findIndex((l) => new RegExp(`^##\\s+${HIGHLIGHTS_TITLE}\\s*$`).test(l));
  if (i < 0) return null;
  let end = i + 1;
  let last = i + 1;
  while (end < lines.length) {
    const l = lines[end]!;
    if (/^\s*[-*]\s+/.test(l) || (/^\s{2,}\S/.test(l) && last === end)) last = end + 1;
    else if (l.trim() !== '') break;
    end++;
  }
  return { head: i, end: last };
}

/** Linha onde a seção Destaques nasce: depois do título, do callout de fonte e da sua nota. */
function highlightsAnchor(lines: string[], start: number): number {
  let i = start;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  if (/^#\s/.test(lines[i] ?? '')) i++;
  for (;;) {
    let j = i;
    while (j < lines.length && lines[j]!.trim() === '') j++;
    if (!/^>\s*\[!(info|quote|link)\]/i.test(lines[j] ?? '')) break;
    while (j < lines.length && /^>/.test(lines[j]!)) j++;
    i = j;
  }
  return i;
}

/**
 * Destaca um trecho na nota: marca ==assim== onde ele aparece no texto e
 * acrescenta à seção "Destaques" (criada no topo, como no Web Clipper).
 * Trechos com mais de um parágrafo são marcados parágrafo por parágrafo.
 */
export function addHighlight(text: string, passage: string): { text: string; marked: boolean; added: boolean } {
  const clean = passage.replace(/\u00a0/g, ' ').trim();
  if (!clean) return { text, marked: false, added: false };
  const { head } = splitFrontmatter(text);
  const offset = head ? head.length + 2 : 0;
  const lines = text.split('\n');
  let marked = false;
  const pieces = clean.split(/\n\s*\n|\n/).map((p) => p.trim()).filter((p) => p.length >= 3);
  const sect = findHighlights(lines);
  for (const piece of pieces.length ? pieces : [clean]) {
    const re = passageRe(piece);
    let inCode = false;
    for (let i = offset; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
      if (inCode || (sect && i >= sect.head && i < sect.end)) continue;
      const m = re.exec(line);
      if (!m) continue;
      // já está dentro de um destaque?
      const before = line.slice(0, m.index);
      if ((before.match(/==/g)?.length ?? 0) % 2 === 1) {
        marked = true;
        break;
      }
      lines[i] = `${before}==${m[0]}==${line.slice(m.index + m[0].length)}`;
      marked = true;
      break;
    }
  }
  const item = clean.replace(/\s+/g, ' ');
  const cur = findHighlights(lines);
  if (sectionItems(lines, cur).includes(item)) return { text: lines.join('\n'), marked, added: false };
  if (cur) {
    let at = cur.end;
    while (at > cur.head + 1 && lines[at - 1]!.trim() === '') at--;
    lines.splice(at, 0, `- ${item}`);
  } else {
    const at = highlightsAnchor(lines, offset);
    lines.splice(at, 0, '', `## ${HIGHLIGHTS_TITLE}`, '', `- ${item}`);
  }
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), marked, added: true };
}

/** Refaz a seção Destaques a partir dos ==trechos== marcados na nota. */
export function syncHighlights(text: string): string {
  const found = collectHighlights(text);
  const lines = text.split('\n');
  const cur = findHighlights(lines);
  const have = sectionItems(lines, cur);
  let out = text;
  for (const h of found) if (!have.includes(h.replace(/\s+/g, ' '))) out = addHighlight(out, h).text;
  return out;
}

// ------------------------------------------------------------------ modelos de recorte

/**
 * Modelo de recorte: uma nota em Modelos/Recortes/ (ou com "recorte-sites" no
 * topo). As propriedades "recorte-*" configuram; o resto vira o topo da nota,
 * com as variáveis {{title}}, {{url}}, {{site}}, {{author}}, {{published}},
 * {{description}}, {{image}}, {{content}}, {{highlights}}, {{comment}},
 * {{date}} e {{time}}.
 */
export interface ClipTemplate {
  name: string;
  path?: string;
  /** domínios ("youtube.com" vale para m.youtube.com também); "*" vale para todos */
  sites: string[];
  folder: string | null;
  text: string;
}

export const CLIP_TEMPLATES_DIR = 'Modelos/Recortes';

export function parseClipTemplate(path: string, text: string): ClipTemplate | null {
  const p = parseProps(text);
  const inDir = path.startsWith(`${CLIP_TEMPLATES_DIR}/`);
  if (!inDir && p['recorte-sites'] === undefined) return null;
  const sites = asList(p['recorte-sites']).map((s) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean);
  const folder = typeof p['recorte-pasta'] === 'string' && p['recorte-pasta'].trim() ? p['recorte-pasta'].trim().replace(/^\/+|\/+$/g, '') : null;
  return { name: path.split('/').pop()!.replace(/\.md$/, ''), path, sites: sites.length ? sites : ['*'], folder, text };
}

/** O modelo que vale para o endereço: o domínio mais específico ganha; "*" fica por último. */
export function pickClipTemplate(list: ClipTemplate[], url: string): ClipTemplate | null {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  let best: ClipTemplate | null = null;
  let score = -1;
  for (const t of list) {
    for (const s of t.sites) {
      const sc = s === '*' ? 0 : host === s || host.endsWith(`.${s}`) ? s.length : -1;
      if (sc > score) {
        score = sc;
        best = t;
      }
    }
  }
  return best;
}

function renderClipTemplate(t: ClipTemplate, clip: PreparedClip, body: string, opts: ClipOptions & { tags: string[] }): string {
  const m = clip.meta;
  const vars: Record<string, string> = {
    url: m.url, source: m.url, site: m.siteName, author: m.author, published: m.published,
    description: m.description, image: m.image, content: body, comment: opts.comment?.trim() ?? '',
    highlights: '', tags: opts.tags.join(', '),
  };
  const fill = (s: string) =>
    fillTemplate(s.replace(/\{\{\s*(url|source|site|author|published|description|image|content|comment|highlights|tags)\s*\}\}/gi, (_, k: string) => vars[k.toLowerCase()] ?? ''), { title: m.title, now: opts.now });
  const props = parseProps(t.text);
  const out: Record<string, PropValue | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('recorte-')) continue;
    out[k] = Array.isArray(v) ? v.map(fill).filter(Boolean) : fill(v);
  }
  // sem source o Tanden não reconhece a página de novo
  if (!out.source) out.source = m.url;
  if (!out.created) out.created = localStamp(opts.now);
  out.tags = dedupe([...asList((out.tags as PropValue | undefined) ?? []), ...opts.tags]);
  const filledBody = fill(splitFrontmatter(t.text).body).replace(/^\n+/, '');
  const head = Object.fromEntries(Object.entries(out).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)));
  return setProps(`\n${filledBody.replace(/\n*$/, '\n')}`, head);
}

// ------------------------------------------------------------------ mesmo endereço

const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|mc_[ce]id|igshid|ref|ref_src|si|feature|spm|_hsenc|_hsmi)$/i;

/** Endereço comparável: sem #, sem parâmetros de rastreio, sem www e sem a barra final. */
export function canonicalUrl(input: string): string {
  try {
    const yt = youtubeId(input);
    if (yt) return `youtube.com/watch?v=${yt}`;
    const u = new URL(input);
    const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const q = keep.length ? `?${new URLSearchParams(keep).toString()}` : '';
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${q}`;
  } catch {
    return input.trim();
  }
}

/** Nota que já guarda esse endereço (propriedade source/url/fonte), ou null. */
export function findClip(notes: Iterable<{ path: string; props: Record<string, PropValue> }>, url: string): string | null {
  const want = canonicalUrl(url);
  for (const n of notes) {
    for (const k of ['source', 'url', 'fonte']) {
      const v = n.props[k];
      const s = Array.isArray(v) ? v[0] : v;
      if (s && /^https?:/i.test(s) && canonicalUrl(s) === want) return n.path;
    }
  }
  return null;
}

/** Cartão do link para colar numa nota (callout que o Obsidian também desenha). */
export function linkCard(m: PageMeta, opts: { note?: string } = {}): string {
  const lines = [`> [!link] [${m.title.replace(/[[\]]/g, '')}](${m.url})`];
  if (m.description) lines.push(`> ${m.description.slice(0, 280)}`);
  if (opts.note) lines.push(`> → [[${opts.note}]]`);
  lines.push(`> *${m.siteName}*`);
  return `${lines.join('\n')}\n`;
}

/** É um endereço de página (http/https)? Aceita "site.com/x" sem o https. */
export function normalizeUrl(input: string): string | null {
  const t = input.trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(t) ? `https://${t}` : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}
