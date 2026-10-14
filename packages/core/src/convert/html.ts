import TurndownService from 'turndown';
import { ln, type ParseHtml } from './dom';

/*
 * HTML → Markdown no padrão do Obsidian (GFM: tabelas, ~~riscado~~, - [ ] tarefas).
 * Usado por tudo que chega como HTML: páginas web, .docx (via mammoth), .epub.
 */

export interface HtmlToMdOptions {
  parse: ParseHtml;
  /** endereço da página, para resolver links e imagens relativos */
  baseUrl?: string;
  /**
   * Decide o que fazer com cada imagem (src já absoluto). Devolve o caminho no
   * cofre para virar `![[caminho]]`, ou null para manter o link remoto.
   */
  image?: (src: string) => string | null;
}

const BLOCK_DROP = ['script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'canvas', 'svg', 'form', 'button', 'input', 'select', 'textarea'];

function absolute(href: string, base?: string): string {
  if (!href) return href;
  if (/^(data:|mailto:|tel:|#)/i.test(href)) return href;
  try {
    return base ? new URL(href, base).href : href;
  } catch {
    return href;
  }
}

/** Texto de uma célula em uma linha só (tabelas Markdown não aceitam quebra). */
const cellText = (md: string): string => md.trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|');

function service(opts: HtmlToMdOptions): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
    linkStyle: 'inlined',
  });
  td.remove(BLOCK_DROP as Array<keyof HTMLElementTagNameMap>);

  td.addRule('strike', {
    filter: ['del', 's', 'strike' as keyof HTMLElementTagNameMap],
    replacement: (c) => (c.trim() ? `~~${c}~~` : c),
  });

  td.addRule('taskItem', {
    filter: (n) => ln(n) === 'input' && (n as HTMLInputElement).getAttribute('type') === 'checkbox' && !!n.parentNode && ln(n.parentNode as Element) === 'li',
    replacement: (_c, n) => ((n as HTMLInputElement).hasAttribute('checked') ? '[x] ' : '[ ] '),
  });

  td.addRule('link', {
    filter: (n) => ln(n) === 'a' && !!(n as HTMLElement).getAttribute('href'),
    replacement: (content, n) => {
      const href = absolute((n as HTMLElement).getAttribute('href')!, opts.baseUrl);
      const text = content.trim();
      if (!text) return '';
      if (href.startsWith('#')) return text;
      const title = (n as HTMLElement).getAttribute('title');
      return `[${text}](${href.replace(/[()\s]/g, encodeURIComponent)}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`;
    },
  });

  td.addRule('image', {
    filter: 'img',
    replacement: (_c, n) => {
      const el = n as HTMLElement;
      const raw = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original') || '';
      if (!raw) return '';
      const src = absolute(raw, opts.baseUrl);
      const alt = (el.getAttribute('alt') || '').replace(/[[\]\n|]/g, ' ').replace(/\s+/g, ' ').trim();
      const local = opts.image?.(src) ?? null;
      if (local) return `![[${local}${alt ? `|${alt}` : ''}]]`;
      if (src.startsWith('data:')) return ''; // imagem embutida sem destino: não polui a nota
      return `![${alt}](${src.replace(/[()\s]/g, encodeURIComponent)})`;
    },
  });

  td.addRule('figcaption', {
    filter: 'figcaption',
    replacement: (c) => (c.trim() ? `\n\n*${c.trim()}*\n\n` : ''),
  });

  td.addRule('fencedCode', {
    filter: (n) => ln(n) === 'pre',
    replacement: (_c, n) => {
      const el = n as HTMLElement;
      const code = el.querySelector('code') ?? el;
      const cls = `${code.getAttribute('class') ?? ''} ${el.getAttribute('class') ?? ''}`;
      const lang = /(?:language|lang|highlight-source)-([\w+#-]+)/.exec(cls)?.[1] ?? '';
      const text = (code.textContent ?? '').replace(/\n$/, '');
      const fence = text.includes('```') ? '~~~~' : '```';
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  });

  // tabelas sempre viram Markdown; a primeira linha é o cabeçalho
  td.addRule('tableCell', {
    filter: ['th', 'td'],
    replacement: (c) => ` ${cellText(c)} |`,
  });
  td.addRule('tableRow', {
    filter: 'tr',
    replacement: (c) => `|${c}\n`,
  });
  td.addRule('tableSection', {
    filter: ['thead', 'tbody', 'tfoot'],
    replacement: (c) => c,
  });
  td.addRule('caption', { filter: 'caption', replacement: (c) => (c.trim() ? `*${c.trim()}*\n\n` : '') });
  td.addRule('table', {
    filter: 'table',
    replacement: (c) => {
      const rows = c.split('\n').filter((r) => r.trim().startsWith('|'));
      const caption = c.split('\n').filter((r) => r.trim() && !r.trim().startsWith('|')).join(' ');
      if (!rows.length) return c;
      const cols = Math.max(...rows.map((r) => (r.match(/(?<!\\)\|/g)?.length ?? 1) - 1));
      const pad = (r: string) => r + ' |'.repeat(Math.max(0, cols - ((r.match(/(?<!\\)\|/g)?.length ?? 1) - 1)));
      // tabela de uma coluna só costuma ser layout, não dado: vira parágrafos
      if (cols <= 1) return `\n\n${rows.map((r) => r.replace(/^\|\s?|\s?\|$/g, '').replace(/<br>/g, '\n')).join('\n\n')}\n\n`;
      const sep = `|${' --- |'.repeat(cols)}`;
      return `\n\n${caption ? `${caption}\n\n` : ''}${pad(rows[0]!)}\n${sep}\n${rows.slice(1).map(pad).join('\n')}\n\n`;
    },
  });

  // "- item" com o recuo que o Obsidian usa (o padrão do turndown é "-   item")
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, n) => {
      const parent = n.parentNode as Element | null;
      let prefix = '- ';
      if (parent && ln(parent) === 'ol') {
        const start = Number(parent.getAttribute('start') ?? 1) || 1;
        const index = Array.prototype.filter.call(parent.childNodes, (c: Node) => c.nodeType === 1 && ln(c as Element) === 'li').indexOf(n);
        prefix = `${start + Math.max(0, index)}. `;
      }
      const body = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/^(\[[ x]\])\s+/, '$1 ');
      const indented = body.replace(/\n(?=.)/g, `\n${' '.repeat(prefix.length)}`);
      return `${prefix}${indented}${n.nextSibling && !/\n$/.test(indented) ? '\n' : ''}`;
    },
  });

  // marcadores <mark> viram ==realce== (sintaxe do Obsidian)
  td.addRule('mark', { filter: 'mark' as keyof HTMLElementTagNameMap, replacement: (c) => (c.trim() ? `==${c}==` : c) });
  td.addRule('sup', { filter: 'sup', replacement: (c) => (c.trim() ? `^${c}` : '') });
  return td;
}

/** Limpa o Markdown: no máximo uma linha em branco seguida, sem espaços no fim. */
export function tidyMarkdown(md: string): string {
  return `${md
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ /g, ' ')
    .trim()}\n`;
}

export function htmlToMarkdown(input: string | Document | Element, opts: HtmlToMdOptions): string {
  let root: Element;
  if (typeof input === 'string') {
    const doc = opts.parse(/<(html|body)[\s>]/i.test(input) ? input : `<!doctype html><html><body>${input}</body></html>`, 'text/html');
    root = doc.body ?? doc.documentElement;
  } else if ('documentElement' in input) {
    root = input.body ?? input.documentElement;
  } else {
    root = input;
  }
  return tidyMarkdown(service(opts).turndown(root as unknown as HTMLElement));
}
