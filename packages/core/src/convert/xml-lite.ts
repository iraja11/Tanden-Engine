/*
 * XML pequeno e tolerante, sem DOM: serve para ler os arquivos do LibreOffice
 * (content.xml, styles.xml) em qualquer lugar, inclusive fora do navegador.
 * Os nomes ficam como no arquivo, com prefixo ("table:table-cell").
 */

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  kids: Array<XNode | string>;
}

const ENT: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function unescXml(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

/** Texto seguro para XML 1.0 (sem caracteres de controle). */
export function escXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lê um documento XML. Tags mal fechadas não derrubam a leitura. */
export function parseXml(text: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, kids: [] };
  const stack: XNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.kids.push(m[1]);
    else if (m[2] !== undefined) {
      const i = stack.map((n) => n.name).lastIndexOf(m[2]);
      if (i > 0) stack.length = i;
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of m[4]!.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = unescXml(a[2] ?? a[3] ?? '');
      const node: XNode = { name: m[3], attrs, kids: [] };
      top.kids.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) {
      top.kids.push(unescXml(m[6]));
    }
  }
  return root;
}

/** Filhos que são elementos (opcionalmente só os de um nome). */
export function els(n: XNode | null | undefined, name?: string): XNode[] {
  if (!n) return [];
  const out: XNode[] = [];
  for (const k of n.kids) if (typeof k !== 'string' && (!name || k.name === name)) out.push(k);
  return out;
}

export const el = (n: XNode | null | undefined, name: string): XNode | null => els(n, name)[0] ?? null;

/** Todos os descendentes com esse nome, na ordem do documento. */
export function find(n: XNode | null | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!n) return out;
  for (const k of n.kids) {
    if (typeof k === 'string') continue;
    if (k.name === name) out.push(k);
    find(k, name, out);
  }
  return out;
}

/** Texto de tudo que está dentro. */
export function textOf(n: XNode | string): string {
  if (typeof n === 'string') return n;
  return n.kids.map(textOf).join('');
}
