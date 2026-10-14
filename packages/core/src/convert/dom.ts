// Utilidades de DOM para os conversores. O núcleo não tem DOM próprio:
// o app passa o DOMParser do navegador e os testes passam o do linkedom.

/** Lê HTML ou XML e devolve um Document (no app: `new DOMParser().parseFromString`). */
export type ParseHtml = (text: string, type: 'text/html' | 'application/xml') => Document;

/** Nome local da tag, sem prefixo de namespace e em minúsculas (a:t → t). */
export function ln(el: Element): string {
  const name = el.localName || el.nodeName;
  const i = name.indexOf(':');
  return (i < 0 ? name : name.slice(i + 1)).toLowerCase();
}

/** Filhos elemento (sem texto nem comentários). */
export function kids(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!name || ln(c as Element) === name)) out.push(c as Element);
  return out;
}

/** Primeiro filho com o nome local dado. */
export const kid = (el: Element | null | undefined, name: string): Element | null => (el ? kids(el, name)[0] ?? null : null);

/** Todos os descendentes com o nome local dado, na ordem do documento. */
export function descendants(el: Element | Document, name: string): Element[] {
  const out: Element[] = [];
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue;
      if (ln(c as Element) === name) out.push(c as Element);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** Atributo pelo nome local (r:embed, xlink:href...), qualquer que seja o prefixo. */
export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const direct = el.getAttribute(name);
  if (direct !== null) return direct;
  for (const a of Array.from(el.attributes)) {
    const n = a.localName || a.name;
    if (n === name || n.endsWith(`:${name}`) || a.name.endsWith(`:${name}`)) return a.value;
  }
  return null;
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Junta um caminho relativo dentro de um zip (word/media/../x.png → word/x.png). */
export function zipJoin(baseFile: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1);
  const parts = baseFile.split('/').slice(0, -1);
  for (const p of decodeURI(rel).split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return parts.join('/');
}
