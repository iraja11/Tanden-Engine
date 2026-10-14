import { descendants } from './convert/dom';
import { docxToMarkdown } from './convert/docx';
import { epubToMarkdown } from './convert/epub';
import { htmlToMarkdown, tidyMarkdown } from './convert/html';
import { odtToMarkdown } from './convert/odt';
import { pptxToMarkdown } from './convert/pptx';
import { decodeDataUrl, extForMime, safeFileName, type ConvertOptions, type Converted } from './convert/types';
import { fromBytes } from './storage';

/*
 * Arquivos do cofre que não são notas: o que cada um é, para onde vai quando
 * é importado e como vira nota.
 */

export type FileKind = 'note' | 'pdf' | 'sheet' | 'board' | 'image' | 'document' | 'slides' | 'book' | 'web' | 'text' | 'audio' | 'video' | 'other';

const KINDS: Array<[FileKind, RegExp]> = [
  ['note', /\.md$/i],
  ['pdf', /\.pdf$/i],
  ['sheet', /\.(xlsx|xlsm|csv|tsv|ods)$/i],
  ['board', /\.canvas$/i],
  ['image', /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|heic)$/i],
  ['document', /\.(docx|odt|rtf|doc)$/i],
  ['slides', /\.(pptx|odp|ppt)$/i],
  ['book', /\.epub$/i],
  ['web', /\.(html?|xhtml|mhtml)$/i],
  ['text', /\.(txt|log|json|ya?ml|toml|ini|xml|py|c|cc|cpp|h|hpp|rs|ts|js|java|go|lua|sh)$/i],
  ['audio', /\.(mp3|ogg|oga|wav|flac|m4a|opus|webm)$/i],
  ['video', /\.(mp4|mkv|mov|ogv)$/i],
];

export function fileKind(path: string): FileKind {
  for (const [k, re] of KINDS) if (re.test(path)) return k;
  return 'other';
}

/** Formatos que viram nota ao importar. */
export const CONVERTIBLE = /\.(docx|pptx|odt|epub|html?|xhtml|txt|md|markdown)$/i;

export const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  opus: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const mimeOf = (path: string): string => MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

/** Pastas padrão de cada tipo, como no Obsidian (podem ser mudadas à mão). */
export const FOLDERS = {
  pdf: 'PDFs',
  attachments: 'Anexos',
  imported: 'Importados',
  web: 'Web',
  exported: 'Exportados',
} as const;

/** Caminho livre: "Pasta/Nome.ext", "Pasta/Nome 2.ext"... */
export function freePath(exists: (p: string) => boolean, dir: string, name: string, ext: string): string {
  const stem = safeFileName(name).replace(new RegExp(`\\.${ext}$`, 'i'), '') || 'Sem título';
  const base = dir ? `${dir}/` : '';
  let path = `${base}${stem}.${ext}`;
  for (let n = 2; exists(path) || exists(path.toLowerCase()); n++) path = `${base}${stem} ${n}.${ext}`;
  return path;
}

const stemOf = (name: string): string => name.replace(/\.[^./]+$/, '');

/** Converte um arquivo em nota. Lança erro com mensagem em português se não souber. */
export async function convertToNote(fileName: string, bytes: Uint8Array, opts: ConvertOptions): Promise<Converted> {
  const ext = fileName.split('.').pop()!.toLowerCase();
  const fallback = stemOf(fileName);
  let r: Converted;
  switch (ext) {
    case 'docx':
      r = await docxToMarkdown(bytes, opts);
      break;
    case 'pptx':
      r = pptxToMarkdown(bytes, opts);
      break;
    case 'odt':
      r = odtToMarkdown(bytes, opts);
      break;
    case 'epub':
      r = epubToMarkdown(bytes, opts);
      break;
    case 'html':
    case 'htm':
    case 'xhtml': {
      const html = decodeText(bytes);
      const doc = opts.parse(html, 'text/html');
      const title = (descendants(doc, 'title')[0]?.textContent ?? '').trim();
      const assets: Converted['assets'] = [];
      let n = 0;
      const markdown = htmlToMarkdown(doc, {
        parse: opts.parse,
        image: (src) => {
          const d = src.startsWith('data:') ? decodeDataUrl(src) : null;
          if (!d) return null;
          const path = `${opts.assetDir}/imagem ${++n}.${extForMime(d.mime)}`;
          assets.push({ path, data: d.data });
          return path;
        },
      });
      r = { title, markdown, assets };
      break;
    }
    case 'txt':
    case 'md':
    case 'markdown':
      r = { title: '', markdown: tidyMarkdown(decodeText(bytes)), assets: [] };
      break;
    case 'doc':
    case 'ppt':
      throw new Error(`O formato .${ext} é o antigo do Office. Abra no Word/PowerPoint ou no Google Docs e salve como .${ext}x.`);
    default:
      throw new Error(`Ainda não sei converter arquivos .${ext} em nota.`);
  }
  return { ...r, title: r.title || fallback };
}

/** Texto em UTF-8, com recuo para Windows-1252 (arquivos antigos do Windows). */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = fromBytes(bytes).replace(/^﻿/, '');
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf8;
  }
}

/**
 * Resolve um [[link]] como o Obsidian: caminho exato (com ou sem .md) ou, se
 * não houver, o arquivo com aquele nome em qualquer pasta (o de caminho mais
 * curto ganha). Devolve o caminho, a seção (#...) e a página (#page=n).
 */
export function resolveLink(raw: string, paths: readonly string[]): { path: string; sub: string; page: number | null } | null {
  const target = raw.split('|')[0]!.trim();
  const hash = target.indexOf('#');
  const file = (hash < 0 ? target : target.slice(0, hash)).trim().replace(/^\.?\//, '');
  const sub = hash < 0 ? '' : target.slice(hash + 1);
  const page = /(?:^|&)page=(\d+)/.exec(sub)?.[1];
  if (!file) return null;
  const lower = new Map(paths.map((p) => [p.toLowerCase(), p]));
  const hasExt = /\.[a-z0-9]{1,5}$/i.test(file);
  const candidates = hasExt ? [file] : [`${file}.md`, file];
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return { path: hit, sub, page: page ? Number(page) : null };
  }
  const names = candidates.map((c) => `/${c.toLowerCase()}`);
  const matches = paths.filter((p) => names.some((n) => `/${p.toLowerCase()}`.endsWith(n))).sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length);
  return matches[0] ? { path: matches[0], sub, page: page ? Number(page) : null } : null;
}
