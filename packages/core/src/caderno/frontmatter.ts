/*
 * Propriedades no topo da nota, no formato que o Obsidian lê e grava:
 *
 *   ---
 *   tipo: personagem
 *   mundo: Aerth
 *   afiliação: "[[Ordem do Sol]]"
 *   apelidos:
 *     - Lâmina
 *     - O Último
 *   ---
 *
 * É um pedaço pequeno de YAML: texto, número, listas em bloco e listas
 * [a, b]. Ao mudar uma propriedade, só as linhas dela são reescritas;
 * o resto do topo (comentários, chaves que o Tanden não conhece) fica
 * como estava, para não brigar com o Obsidian nem com outros plugins.
 */

export type PropValue = string | string[];
export type Props = Record<string, PropValue>;

const FENCE = /^---[ \t]*$/;

export interface Split {
  /** linhas entre as duas cercas, sem elas; null quando a nota não tem topo */
  head: string[] | null;
  body: string;
}

export function splitFrontmatter(text: string): Split {
  const lines = text.split('\n');
  if (!FENCE.test(lines[0] ?? '')) return { head: null, body: text };
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i]!) || /^\.\.\.[ \t]*$/.test(lines[i]!)) {
      return { head: lines.slice(1, i), body: lines.slice(i + 1).join('\n') };
    }
  }
  return { head: null, body: text };
}

function joinFrontmatter(head: string[] | null, body: string): string {
  if (!head || head.length === 0) return body;
  return `---\n${head.join('\n')}\n---\n${body}`;
}

/** Só o corpo da nota, sem o topo. */
export const bodyOf = (text: string): string => splitFrontmatter(text).body;

/** Troca o corpo e mantém o topo intacto. */
export function withBody(text: string, body: string): string {
  return joinFrontmatter(splitFrontmatter(text).head, body);
}

const KEY_LINE = /^([^\s#:][^:]*?):(?:[ \t]+(.*))?[ \t]*$/;

function unquote(v: string): string {
  v = v.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  // comentário no fim de um valor sem aspas
  const hash = v.search(/\s#/);
  return hash >= 0 ? v.slice(0, hash).trimEnd() : v;
}

/** Divide "a, "b, c", d" respeitando aspas. */
function splitFlow(s: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      cur += c;
      if (c === '\\' && q === '"') cur += s[++i] ?? '';
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map(unquote).filter((x) => x !== '');
}

function parseScalar(raw: string): PropValue {
  const v = raw.trim();
  // [[link]] sem aspas: o Obsidian não grava assim, mas pessoas escrevem
  if (v.startsWith('[') && v.endsWith(']') && !/^\[\[[^\]]*\]\]$/.test(v)) return splitFlow(v.slice(1, -1));
  return unquote(v);
}

interface Entry {
  key: string;
  start: number;
  /** exclusivo */
  end: number;
}

function entries(head: string[]): Entry[] {
  const out: Entry[] = [];
  for (let i = 0; i < head.length; i++) {
    const m = KEY_LINE.exec(head[i]!);
    if (!m || /^\s/.test(head[i]!)) continue;
    let end = i + 1;
    while (end < head.length && (/^\s/.test(head[end]!) || /^-\s|^-$/.test(head[end]!) || head[end]!.trim() === '')) end++;
    // linhas em branco no fim pertencem a ninguém
    while (end > i + 1 && head[end - 1]!.trim() === '') end--;
    out.push({ key: m[1]!.trim(), start: i, end });
    i = end - 1;
  }
  return out;
}

function readEntry(head: string[], e: Entry): PropValue {
  const m = KEY_LINE.exec(head[e.start]!)!;
  const inline = m[2]?.trim() ?? '';
  const rest = head.slice(e.start + 1, e.end);
  if (inline === '|' || inline === '>' || inline === '|-' || inline === '>-') {
    const lines = rest.map((l) => l.replace(/^\s{1,2}/, ''));
    return inline.startsWith('>') ? lines.join(' ').trim() : lines.join('\n').trim();
  }
  if (inline !== '') return parseScalar(inline);
  const items = rest.filter((l) => /^\s*-(\s|$)/.test(l)).map((l) => unquote(l.replace(/^\s*-\s?/, '')));
  if (items.length) return items.filter((x) => x !== '');
  return '';
}

export function parseProps(text: string): Props {
  const { head } = splitFrontmatter(text);
  const out: Props = {};
  if (!head) return out;
  for (const e of entries(head)) out[e.key] = readEntry(head, e);
  return out;
}

const NEEDS_QUOTES = /^[\s\-?:,[\]{}#&*!|>'"%@`]|[:#]\s|:$|\s$|^(true|false|null|yes|no|~)$/i;

function quote(v: string): string {
  if (v === '') return '""';
  if (!NEEDS_QUOTES.test(v) && !v.includes('\n') && !/^\[\[/.test(v)) return v;
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function formatEntry(key: string, value: PropValue): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}: []`];
    return [`${key}:`, ...value.map((v) => `  - ${quote(v)}`)];
  }
  return [`${key}: ${quote(value)}`];
}

/** Grava (ou apaga, com null) uma propriedade, mexendo só nas linhas dela. */
export function setProp(text: string, key: string, value: PropValue | null): string {
  return setProps(text, { [key]: value });
}

export function setProps(text: string, patch: Record<string, PropValue | null>): string {
  const { head, body } = splitFrontmatter(text);
  let lines = head ? [...head] : [];
  for (const [key, value] of Object.entries(patch)) {
    const e = entries(lines).find((x) => x.key === key);
    const repl = value === null ? [] : formatEntry(key, value);
    if (e) lines = [...lines.slice(0, e.start), ...repl, ...lines.slice(e.end)];
    else if (value !== null) {
      // depois da última linha com conteúdo
      let at = lines.length;
      while (at > 0 && lines[at - 1]!.trim() === '') at--;
      lines = [...lines.slice(0, at), ...repl, ...lines.slice(at)];
    }
  }
  if (lines.every((l) => l.trim() === '')) return head ? body : text;
  return joinFrontmatter(lines, head ? body : text);
}

/** Renomeia uma chave mantendo a posição e o valor. */
export function renameProp(text: string, from: string, to: string): string {
  if (from === to) return text;
  const { head, body } = splitFrontmatter(text);
  if (!head) return text;
  const e = entries(head).find((x) => x.key === from);
  if (!e) return text;
  const lines = [...head];
  lines[e.start] = lines[e.start]!.replace(/^[^:]+:/, `${to.includes(':') ? quote(to) : to}:`);
  return joinFrontmatter(lines, body);
}

/** Valor como lista (texto sozinho vira lista de um). */
export const asList = (v: PropValue | undefined): string[] => (v === undefined || v === '' ? [] : Array.isArray(v) ? v : [v]);
export const asText = (v: PropValue | undefined): string => (v === undefined ? '' : Array.isArray(v) ? v.join(', ') : v);
