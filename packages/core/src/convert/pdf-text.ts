import { tidyMarkdown } from './html';

/*
 * Texto de um PDF → Markdown. O pdf.js entrega pedaços de texto soltos com
 * posição e tamanho; aqui eles viram linhas, parágrafos e títulos (fonte
 * bem maior que a do corpo). Hifenização no fim da linha é desfeita.
 */

export interface PdfTextItem {
  str: string;
  /** canto inferior esquerdo, em pontos (origem embaixo, como no PDF) */
  x: number;
  y: number;
  /** altura da fonte em pontos */
  h: number;
  w: number;
  hasEOL?: boolean;
}

interface Line {
  y: number;
  x: number;
  h: number;
  text: string;
}

function lines(items: PdfTextItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim() || i.hasEOL).sort((a, b) => b.y - a.y || a.x - b.x);
  const out: Line[] = [];
  let cur: (Line & { end: number }) | null = null;
  for (const it of sorted) {
    if (!it.str) continue;
    const sameLine = cur && Math.abs(cur.y - it.y) <= Math.max(2, Math.min(cur.h, it.h) * 0.45);
    if (cur && sameLine) {
      const gap = it.x - cur.end;
      const needsSpace = gap > it.h * 0.15 && !cur.text.endsWith(' ') && !it.str.startsWith(' ');
      cur.text += (needsSpace ? ' ' : '') + it.str;
      cur.end = Math.max(cur.end, it.x + it.w);
      cur.h = Math.max(cur.h, it.h);
    } else {
      if (cur) out.push(cur);
      cur = { y: it.y, x: it.x, h: it.h, text: it.str, end: it.x + it.w };
    }
  }
  if (cur) out.push(cur);
  return out.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
}

/** Altura de fonte mais comum (o corpo do texto), ponderada pelo tamanho da linha. */
function bodySize(all: Line[]): number {
  const count = new Map<number, number>();
  for (const l of all) count.set(Math.round(l.h), (count.get(Math.round(l.h)) ?? 0) + l.text.length);
  let best = 10;
  let n = -1;
  for (const [h, c] of count) if (c > n) [best, n] = [h, c];
  return best;
}

/** Páginas (lista de itens cada) → Markdown com "<!-- página n -->" entre elas. */
export function pdfTextToMarkdown(pages: PdfTextItem[][], opts: { title?: string; source?: string } = {}): string {
  const perPage = pages.map(lines);
  const body = bodySize(perPage.flat());
  const out: string[] = [];
  if (opts.title) out.push(`# ${opts.title}`);
  if (opts.source) out.push(`> Texto extraído de [[${opts.source}]]`);

  perPage.forEach((ls, pi) => {
    if (pages.length > 1) out.push(`<!-- página ${pi + 1} -->`);
    let para = '';
    let prev: Line | null = null;
    const flush = () => {
      if (para.trim()) out.push(para.trim());
      para = '';
    };
    for (const l of ls) {
      const ratio = l.h / body;
      // número de página solto no rodapé/cabeçalho
      if (/^\d{1,4}$/.test(l.text) && (l === ls[0] || l === ls[ls.length - 1])) continue;
      if (ratio >= 1.25 && l.text.length < 120) {
        flush();
        const level = ratio >= 1.8 ? 1 : ratio >= 1.45 ? 2 : 3;
        // título que continua na linha de baixo, com a mesma fonte
        const last = out[out.length - 1];
        if (prev && Math.abs(prev.h - l.h) < 0.5 && last?.startsWith('#') && prev.y - l.y < l.h * 1.6) out[out.length - 1] = `${last} ${l.text}`;
        else out.push(`${'#'.repeat(level)} ${l.text}`);
        prev = l;
        continue;
      }
      const bullet = /^[•●▪◦‣∙·\-–]\s*/.test(l.text);
      const numbered = /^\(?\d{1,3}[.)]\s/.test(l.text);
      const gap = prev ? prev.y - l.y : 0;
      const newPara = !prev || gap > Math.max(l.h, prev.h) * 1.7 || bullet || numbered || prev.h / body >= 1.25;
      if (newPara) {
        flush();
        para = bullet ? `- ${l.text.replace(/^[•●▪◦‣∙·\-–]\s*/, '')}` : l.text;
      } else if (/[A-Za-zÀ-ÿ]-$/.test(para) && /^[a-zà-ÿ]/.test(l.text)) {
        para = para.slice(0, -1) + l.text; // hifenização no fim da linha
      } else {
        para += ` ${l.text}`;
      }
      prev = l;
    }
    flush();
  });
  return tidyMarkdown(out.join('\n\n'));
}
