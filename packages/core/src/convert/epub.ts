import { strFromU8, unzipSync } from 'fflate';
import { descendants, zipJoin } from './dom';
import { htmlToMarkdown, tidyMarkdown } from './html';
import { AssetBag, type ConvertOptions, type Converted } from './types';

/*
 * .epub → nota. Lê os capítulos na ordem de leitura (spine), converte cada
 * XHTML para Markdown e guarda as imagens como anexos.
 */

export function epubToMarkdown(bytes: Uint8Array, opts: ConvertOptions): Converted {
  const zip = unzipSync(bytes);
  const parse = opts.parse;
  const container = zip['META-INF/container.xml'];
  if (!container) throw new Error('Não parece um livro .epub.');
  const opfPath = descendants(parse(strFromU8(container), 'application/xml'), 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath || !zip[opfPath]) throw new Error('O .epub não tem índice (OPF).');
  const opf = parse(strFromU8(zip[opfPath]!), 'application/xml');
  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of descendants(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, { href: zipJoin(opfPath, href), type: item.getAttribute('media-type') ?? '' });
  }
  const title = descendants(opf, 'title')[0]?.textContent?.trim() ?? '';
  const author = descendants(opf, 'creator')[0]?.textContent?.trim() ?? '';
  const bag = new AssetBag(opts.assetDir);
  const chapters: string[] = [];

  for (const ref of descendants(opf, 'itemref')) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item || !zip[item.href]) continue;
    const html = strFromU8(zip[item.href]!);
    const md = htmlToMarkdown(html, {
      parse,
      image: (src) => {
        if (/^(https?|data):/i.test(src)) return null;
        const path = zipJoin(item.href, src.split('#')[0]!);
        const data = zip[path];
        return data ? bag.add(path.split('/').pop()!, data, path) : null;
      },
    }).trim();
    // capítulos só com a capa ou vazios não viram seção
    if (md && md.replace(/!\[\[[^\]]*\]\]/g, '').trim().length > 0) chapters.push(md);
    else if (md && chapters.length === 0) chapters.push(md);
  }

  const head = [title ? `# ${title}` : '', author ? `*${author}*` : ''].filter(Boolean).join('\n\n');
  const markdown = tidyMarkdown([head, ...chapters].filter(Boolean).join('\n\n---\n\n'));
  return { title, markdown, assets: bag.assets };
}
