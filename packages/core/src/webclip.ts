import { Readability } from '@mozilla/readability';
import type { ParseHtml } from './convert/dom';
import { htmlToMarkdown } from './convert/html';

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
}

/** Separa o artigo da página e lista as imagens dele, para o app baixar. */
export function prepareClip(html: string, url: string, parse: ParseHtml): PreparedClip {
  const doc = parse(html, 'text/html');
  const info = readPageMeta(doc, url);
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

/**
 * Nota do recorte. `images` diz onde cada imagem baixada ficou no cofre;
 * as que não baixaram continuam apontando para a web.
 */
export function clipToMarkdown(clip: PreparedClip, opts: { parse: ParseHtml; images?: Map<string, string>; now?: Date }): string {
  const m = clip.meta;
  const props = [
    ['title', m.title],
    ['source', m.url],
    ['author', m.author],
    ['published', m.published],
    ['created', localStamp(opts.now)],
    ['description', m.description.slice(0, 300)],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${yamlString(v!)}`);
  const body = htmlToMarkdown(clip.content, {
    parse: opts.parse,
    baseUrl: m.url,
    image: (src) => opts.images?.get(src) ?? null,
  }).trim();
  const head = `# ${m.title}\n\n> [!info] [${m.siteName || 'Fonte'}](${m.url})${m.author ? ` · ${m.author}` : ''}${m.published ? ` · ${m.published}` : ''}`;
  // o recorte não repete o título se o artigo já começa com ele
  const cleanBody = body.replace(new RegExp(`^#{1,2} ${m.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '');
  return `---\n${props.join('\n')}\ntags:\n  - web\n---\n\n${head}\n\n${cleanBody}\n`;
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
