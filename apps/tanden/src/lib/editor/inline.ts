// Markdown de uma linha (negrito, itálico, código, links) para HTML seguro.
// Usado nas células de tabela, que mostram o texto formatado fora da edição.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderInline(md: string): string {
  const codes: string[] = [];
  let s = md.replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
  s = esc(s);
  s = s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, t: string, a: string) => `<a class="wl" data-href="${t}">${a}</a>`)
    .replace(/\[\[([^\]]+)\]\]/g, (_m, t: string) => `<a class="wl" data-href="${t}">${t}</a>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => `<a data-href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/__([^_]+)__/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/(^|\W)_([^_\s][^_]*)_(?=\W|$)/g, '$1<i>$2</i>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${esc(codes[Number(i)]!)}</code>`);
}
