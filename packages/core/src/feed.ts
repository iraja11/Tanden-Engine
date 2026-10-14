import { attr, descendants, kid, kids, ln, type ParseHtml } from './convert/dom';

/*
 * Feeds de notícias: RSS 2.0, RSS 1.0 (RDF), Atom e JSON Feed viram uma lista
 * uniforme de itens. O resumo sai como texto puro (sem HTML), para que nada
 * vindo de um site rode dentro do app.
 */

export interface FeedItem {
  /** identificador estável do item (guid/id; sem ele, o link) */
  id: string;
  titulo: string;
  link: string;
  /** texto puro, no máximo ~400 caracteres */
  resumo: string;
  /** ms desde 1970; 0 quando o feed não diz */
  data: number;
  autor: string;
  /** endereço absoluto de uma imagem do item, quando houver */
  imagem: string;
}

export interface Feed {
  titulo: string;
  /** página do site (não o endereço do feed) */
  site: string;
  descricao: string;
  itens: FeedItem[];
}

const RESUMO_MAX = 400;

const abs = (href: string | null | undefined, base: string): string => {
  if (!href) return '';
  try {
    const u = new URL(href.trim(), base || undefined);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
};

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Texto puro de um trecho que pode ser HTML (ou HTML escapado duas vezes). */
function plain(s: string, parse: ParseHtml): string {
  if (!s) return '';
  let t = s;
  for (let i = 0; i < 2 && /<[a-z!/]|&(lt|gt|amp|quot|#\d+|#x[\da-f]+|[a-z]+);/i.test(t); i++) {
    const doc = parse(`<!doctype html><html><body>${t}</body></html>`, 'text/html');
    for (const el of Array.from(doc.querySelectorAll('script, style, noscript, iframe'))) el.remove();
    // blocos viram espaço, para "</p><p>" não grudar palavras
    for (const el of Array.from(doc.querySelectorAll('p, br, div, li, h1, h2, h3, h4, tr'))) el.append(doc.createTextNode(' '));
    t = doc.body?.textContent ?? '';
  }
  return squash(t);
}

const cut = (s: string, n = RESUMO_MAX): string => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);

/** Primeira imagem de um trecho HTML. */
function firstImage(html: string, base: string, parse: ParseHtml): string {
  if (!/<img/i.test(html)) return '';
  const doc = parse(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = abs(img.getAttribute('src') || img.getAttribute('data-src'), base);
    // pixels de rastreio costumam declarar 1x1
    if (src && img.getAttribute('width') !== '1' && img.getAttribute('height') !== '1') return src;
  }
  return '';
}

function parseDate(s: string | null | undefined): number {
  if (!s) return 0;
  const t = s.trim();
  let ms = Date.parse(t);
  // RFC 822 com fuso por nome que o Date não entende (ex.: "BRT")
  if (Number.isNaN(ms)) ms = Date.parse(t.replace(/\s+[A-Z]{2,5}$/, ' GMT'));
  return Number.isNaN(ms) ? 0 : ms;
}

const text = (el: Element | null): string => (el?.textContent ?? '').trim();

/** Elementos de mídia (media:content, media:thumbnail, enclosure de imagem). */
function mediaImage(item: Element, base: string): string {
  for (const name of ['thumbnail', 'content']) {
    for (const el of descendants(item, name)) {
      const url = attr(el, 'url');
      const medium = attr(el, 'medium') ?? '';
      const type = attr(el, 'type') ?? '';
      if (url && (name === 'thumbnail' || medium === 'image' || type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url))) return abs(url, base);
    }
  }
  for (const enc of kids(item, 'enclosure')) {
    if ((attr(enc, 'type') ?? '').startsWith('image/')) return abs(attr(enc, 'url'), base);
  }
  return '';
}

function rssItem(item: Element, base: string, parse: ParseHtml): FeedItem {
  const link = abs(text(kid(item, 'link')) || attr(kid(item, 'link'), 'href') || (attr(item, 'about') ?? ''), base);
  const guidEl = kid(item, 'guid');
  const guid = text(guidEl);
  const encoded = kids(item, 'encoded')[0];
  const raw = text(kid(item, 'description')) || text(encoded ?? null);
  const html = text(encoded ?? null) || raw;
  return {
    id: guid || link || squash(text(kid(item, 'title'))),
    titulo: plain(text(kid(item, 'title')), parse) || '(sem título)',
    link: link || (attr(guidEl, 'ispermalink') !== 'false' ? abs(guid, base) : ''),
    resumo: cut(plain(raw, parse)),
    data: parseDate(text(kid(item, 'pubdate')) || text(kid(item, 'date')) || text(kid(item, 'updated'))),
    autor: plain(text(kid(item, 'creator')) || text(kid(item, 'author')), parse),
    imagem: mediaImage(item, base) || firstImage(html, base, parse),
  };
}

function atomLink(el: Element, base: string): string {
  const links = kids(el, 'link');
  const alt = links.find((l) => (attr(l, 'rel') ?? 'alternate') === 'alternate' && !(attr(l, 'type') ?? '').includes('xml')) ?? links.find((l) => !attr(l, 'rel'));
  return abs(attr(alt ?? null, 'href'), base);
}

function atomItem(entry: Element, base: string, parse: ParseHtml): FeedItem {
  const link = atomLink(entry, base);
  const content = text(kid(entry, 'content'));
  const summary = text(kid(entry, 'summary'));
  const enclosure = kids(entry, 'link').find((l) => attr(l, 'rel') === 'enclosure' && (attr(l, 'type') ?? '').startsWith('image/'));
  return {
    id: text(kid(entry, 'id')) || link,
    titulo: plain(text(kid(entry, 'title')), parse) || '(sem título)',
    link,
    resumo: cut(plain(summary || content, parse)),
    data: parseDate(text(kid(entry, 'published')) || text(kid(entry, 'updated'))),
    autor: plain(text(kid(kid(entry, 'author'), 'name')), parse),
    imagem: mediaImage(entry, base) || abs(attr(enclosure ?? null, 'href'), base) || firstImage(content || summary, base, parse),
  };
}

function parseJsonFeed(src: string, url: string, parse: ParseHtml): Feed {
  const j = JSON.parse(src) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const items = Array.isArray(j.items) ? (j.items as Record<string, unknown>[]) : [];
  const site = abs(str(j.home_page_url), url);
  return {
    titulo: squash(str(j.title)),
    site,
    descricao: squash(str(j.description)),
    itens: items.map((it) => {
      const link = abs(str(it.url) || str(it.external_url), site || url);
      const authors = Array.isArray(it.authors) ? (it.authors as { name?: string }[]) : it.author ? [it.author as { name?: string }] : [];
      return {
        id: str(it.id) || link,
        titulo: plain(str(it.title), parse) || cut(plain(str(it.content_text) || str(it.content_html), parse), 80) || '(sem título)',
        link,
        resumo: cut(plain(str(it.summary) || str(it.content_text) || str(it.content_html), parse)),
        data: parseDate(str(it.date_published) || str(it.date_modified)),
        autor: authors.map((a) => a?.name ?? '').filter(Boolean).join(', '),
        imagem: abs(str(it.image) || str(it.banner_image), link || url) || firstImage(str(it.content_html), link || url, parse),
      };
    }),
  };
}

/** O conteúdo parece um feed? (para distinguir de uma página comum) */
export function looksLikeFeed(src: string): boolean {
  const head = src.slice(0, 2000).trimStart();
  if (head.startsWith('{')) return /"version"\s*:\s*"https:\/\/jsonfeed\.org/.test(head) || /"items"\s*:/.test(src.slice(0, 20000));
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(head);
}

/**
 * Lê um feed. `url` é o endereço de onde ele veio (resolve links relativos).
 * Lança erro se não for RSS, Atom nem JSON Feed.
 */
export function parseFeed(src: string, url: string, parse: ParseHtml): Feed {
  const trimmed = src.replace(/^﻿/, '').trimStart();
  if (trimmed.startsWith('{')) {
    try {
      return parseJsonFeed(trimmed, url, parse);
    } catch {
      throw new Error('o endereço não é um feed (JSON inválido)');
    }
  }
  const doc = parse(trimmed, 'application/xml');
  const root = doc.documentElement;
  const kind = root ? ln(root) : '';
  if (kind === 'feed') {
    const base = attr(root, 'base') ?? url;
    return {
      titulo: plain(text(kid(root, 'title')), parse),
      site: atomLink(root, base),
      descricao: plain(text(kid(root, 'subtitle')), parse),
      itens: kids(root, 'entry').map((e) => atomItem(e, abs(attr(e, 'base'), base) || base, parse)),
    };
  }
  if (kind === 'rss' || kind === 'rdf') {
    const channel = kid(root, 'channel');
    const site = abs(text(kid(channel, 'link')), url);
    // RSS 1.0 põe os itens ao lado do channel; RSS 2.0, dentro dele
    const items = [...kids(channel ?? root, 'item'), ...(kind === 'rdf' ? kids(root, 'item') : [])];
    return {
      titulo: plain(text(kid(channel, 'title')), parse),
      site,
      descricao: plain(text(kid(channel, 'description')), parse),
      itens: items.map((i) => rssItem(i, site || url, parse)),
    };
  }
  throw new Error('o endereço não é um feed');
}

/** Feeds anunciados por uma página (<link rel="alternate" type="application/rss+xml">). */
export function discoverFeeds(html: string, url: string, parse: ParseHtml): { url: string; titulo: string }[] {
  const doc = parse(html, 'text/html');
  const base = doc.querySelector('base[href]')?.getAttribute('href') ?? url;
  const out: { url: string; titulo: string }[] = [];
  for (const l of Array.from(doc.querySelectorAll('link[rel~="alternate"][href]'))) {
    const type = (l.getAttribute('type') ?? '').toLowerCase();
    if (!/(rss|atom|feed)\+xml|application\/feed\+json|application\/json/.test(type)) continue;
    if (type === 'application/json' && !/feed/i.test(l.getAttribute('href') ?? '')) continue;
    const href = abs(l.getAttribute('href'), base);
    if (href && !out.some((f) => f.url === href)) out.push({ url: href, titulo: squash(l.getAttribute('title') ?? '') });
  }
  // comentários costumam vir depois do feed principal; fica por último
  return out.sort((a, b) => Number(/coment|comment/i.test(a.titulo)) - Number(/coment|comment/i.test(b.titulo)));
}
