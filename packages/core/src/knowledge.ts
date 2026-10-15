import { asList, parseProps, splitFrontmatter, type Props } from './caderno/frontmatter';

/*
 * O "segundo cérebro": um índice único do cofre que todas as telas usam.
 *
 * Lê cada nota uma vez (e de novo só quando o texto muda) e guarda links,
 * embeds, tags, apelidos (aliases), títulos, blocos (^id) e tarefas, com a
 * linha de cada um. Em cima disso: resolver [[links]] como o Obsidian,
 * backlinks com contexto, links sem nota, notas órfãs, contagem de tags
 * (com as tags-pai de #a/b/c) e o trecho de uma nota para ![[nota#seção]].
 *
 * Código (``` e `trechos`), fórmulas ($$) e comentários (%% %%) não contam,
 * do mesmo jeito que no Obsidian.
 */

export interface LinkRef {
  /** alvo sem seção nem apelido: "Pasta/Nota", "foto.png" */
  target: string;
  /** depois do #: "Título", "Título#Sub", "^bloco" (vazio se não tem) */
  sub: string;
  /** texto depois do | */
  alias: string;
  embed: boolean;
  /** de onde veio: [[wiki]], [md](link) ou uma propriedade do topo */
  kind: 'wiki' | 'md' | 'prop';
  /** linha (0-based) na nota */
  line: number;
}

export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface TaskRef {
  line: number;
  done: boolean;
  /** caractere entre os colchetes: ' ', 'x', '/', '-' ... */
  mark: string;
  text: string;
}

export interface NoteScan {
  props: Props;
  aliases: string[];
  /** tags sem o #, como escritas (sem repetir, ignorando maiúsculas) */
  tags: string[];
  links: LinkRef[];
  headings: Heading[];
  /** ids de bloco (^id) e a linha onde estão */
  blocks: Array<{ id: string; line: number }>;
  tasks: TaskRef[];
  /** linha em que o corpo começa (depois do topo) */
  bodyLine: number;
}

const WIKI = /(!?)\[\[([^\]\n]+?)\]\]/g;
const MDLINK = /(!?)\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g;
const TAG = /(?:^|[\s(,;])#([\p{L}\p{N}\p{Extended_Pictographic}_/-]+)/gu;
const BLOCK_ID = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;
const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s?(.*)$/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Divide "Nota#Seção|apelido" nas partes. */
export function splitLink(raw: string): { target: string; sub: string; alias: string } {
  const bar = raw.indexOf('|');
  const main = bar < 0 ? raw : raw.slice(0, bar);
  const alias = bar < 0 ? '' : raw.slice(bar + 1).trim();
  const hash = main.indexOf('#');
  return {
    target: (hash < 0 ? main : main.slice(0, hash)).trim(),
    sub: hash < 0 ? '' : main.slice(hash + 1).trim(),
    alias,
  };
}

/** Uma tag válida para o Obsidian tem pelo menos um caractere que não é número. */
const validTag = (t: string): boolean => /[^\d/]/.test(t) && !/^[/-]/.test(t);

/** Troca por espaços o que não conta como texto (mantém as colunas). */
function blank(s: string): string {
  return s.replace(/[^\n]/g, ' ');
}

/**
 * Linhas do corpo "limpas": blocos de código, $$fórmulas$$ e %%comentários%%
 * viram linhas vazias; `código` e $fórmula$ na linha viram espaços.
 * Devolve também quais linhas estavam dentro de código (para títulos e tarefas).
 */
export function maskedLines(lines: readonly string[], from = 0): { text: string[]; code: boolean[] } {
  const text: string[] = [];
  const code: boolean[] = [];
  let fence: string | null = null;
  let math = false;
  let comment = false;
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i]!;
    if (i < from) {
      text.push('');
      code.push(false);
      continue;
    }
    if (fence) {
      text.push('');
      code.push(true);
      if (new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(l)) fence = null;
      continue;
    }
    if (math) {
      text.push('');
      code.push(true);
      if (/\$\$\s*$/.test(l)) math = false;
      continue;
    }
    const f = /^\s*(`{3,}|~{3,})/.exec(l);
    if (f && !comment) {
      fence = f[1]!;
      text.push('');
      code.push(true);
      continue;
    }
    if (!comment && /^\s*\$\$/.test(l) && !/^\s*\$\$.*\$\$\s*$/.test(l)) {
      math = true;
      text.push('');
      code.push(true);
      continue;
    }
    // comentários %% que atravessam linhas
    let out = '';
    let rest = l;
    while (rest.length) {
      if (comment) {
        const end = rest.indexOf('%%');
        if (end < 0) {
          out += blank(rest);
          rest = '';
        } else {
          out += blank(rest.slice(0, end + 2));
          rest = rest.slice(end + 2);
          comment = false;
        }
      } else {
        const start = rest.indexOf('%%');
        if (start < 0) {
          out += rest;
          rest = '';
        } else {
          out += rest.slice(0, start) + '  ';
          rest = rest.slice(start + 2);
          comment = true;
        }
      }
    }
    l = out
      .replace(/(`+)(?:(?!\1)[^\n])+?\1/g, blank)
      .replace(/\$\$[^\n]+?\$\$/g, blank)
      .replace(/(^|[^\\$])\$(?=\S)([^$\n]*?\S)\$(?!\d)/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
    text.push(l);
    code.push(false);
  }
  return { text, code };
}

/** Lê tudo o que interessa ao índice numa nota. */
export function scanNote(text: string): NoteScan {
  const props = parseProps(text);
  const { head } = splitFrontmatter(text);
  const lines = text.split('\n');
  const bodyLine = head ? head.length + 2 : 0;
  const links: LinkRef[] = [];
  const tagSeen = new Map<string, string>();
  const addTag = (t: string) => {
    const clean = t.replace(/^#/, '').replace(/\/+$/, '').trim();
    if (!clean || !validTag(clean)) return;
    const k = clean.toLowerCase();
    if (!tagSeen.has(k)) tagSeen.set(k, clean);
  };

  // topo: tags, apelidos e propriedades com [[link]]
  const keyLine = (key: string): number => {
    if (!head) return 0;
    const i = head.findIndex((l) => l.startsWith(`${key}:`) || l.startsWith(`"${key}":`));
    return i < 0 ? 0 : i + 1;
  };
  const aliases: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    const key = k.toLowerCase();
    if (key === 'tags' || key === 'tag') {
      for (const t of asList(v)) for (const one of t.split(/[,\s]+/)) addTag(one);
      continue;
    }
    if (key === 'aliases' || key === 'alias') {
      for (const a of asList(v)) for (const one of Array.isArray(v) ? [a] : a.split(',')) if (one.trim()) aliases.push(one.trim());
      continue;
    }
    for (const item of asList(v)) {
      for (const m of item.matchAll(WIKI)) {
        const s = splitLink(m[2]!);
        if (s.target) links.push({ ...s, embed: false, kind: 'prop', line: keyLine(k) });
      }
    }
  }

  const { text: clean, code } = maskedLines(lines, bodyLine);
  const headings: Heading[] = [];
  const blocks: NoteScan['blocks'] = [];
  const tasks: TaskRef[] = [];
  for (let i = bodyLine; i < lines.length; i++) {
    const l = clean[i]!;
    if (code[i]) continue;
    const h = HEADING.exec(lines[i]!);
    if (h) headings.push({ level: h[1]!.length, text: h[2]!.trim(), line: i });
    const b = BLOCK_ID.exec(lines[i]!);
    if (b) blocks.push({ id: b[1]!, line: i });
    const t = TASK.exec(lines[i]!);
    if (t) tasks.push({ line: i, mark: t[1]!, done: t[1]! !== ' ', text: t[2]!.trim() });
    if (!l.trim()) continue;
    for (const m of l.matchAll(WIKI)) {
      const s = splitLink(m[2]!);
      // [[#Título]] aponta para a própria nota
      if (s.target || s.sub) links.push({ ...s, embed: m[1] === '!', kind: 'wiki', line: i });
    }
    for (const m of l.matchAll(MDLINK)) {
      let raw = m[2]!.trim().replace(/^<|>$/g, '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) continue;
      raw = safeDecode(raw);
      const s = splitLink(raw);
      if (s.target) links.push({ ...s, alias: '', embed: m[1] === '!', kind: 'md', line: i });
    }
    if (l.includes('#')) for (const m of l.replace(WIKI, blank).replace(MDLINK, blank).matchAll(TAG)) addTag(m[1]!);
  }
  return { props, aliases, tags: [...tagSeen.values()], links, headings, blocks, tasks, bodyLine };
}

/* ------------------------------------------------------------------ trechos */

const foldKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[*_`=~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Linhas [início, fim) de um trecho da nota: "Título", "Título#Subtítulo"
 * (caminho de títulos, como no Obsidian) ou "^bloco". null se não achar.
 */
export function sectionRange(text: string, sub: string): { from: number; to: number } | null {
  const lines = text.split('\n');
  const scan = scanNote(text);
  const want = sub.trim();
  if (!want) return { from: scan.bodyLine, to: lines.length };
  if (want.startsWith('^')) {
    const id = want.slice(1);
    const b = scan.blocks.find((x) => x.id === id);
    if (!b) return null;
    const line = lines[b.line]!;
    // id sozinho na linha: vale para o bloco de cima (tabela, citação, lista)
    if (/^\s*\^[A-Za-z0-9-]+\s*$/.test(line)) {
      let to = b.line;
      while (to > scan.bodyLine && !lines[to - 1]!.trim()) to--;
      let from = to;
      while (from > scan.bodyLine && lines[from - 1]!.trim()) from--;
      return from < to ? { from, to } : null;
    }
    // item de lista: ele e os filhos (mais recuados)
    const item = /^(\s*)(?:[-*+]|\d+[.)])\s/.exec(line);
    if (item) {
      const indent = item[1]!.length;
      let to = b.line + 1;
      while (to < lines.length && lines[to]!.trim() && /^(\s*)/.exec(lines[to]!)![1]!.length > indent) to++;
      return { from: b.line, to };
    }
    // parágrafo: as linhas seguidas sem linha em branco
    let from = b.line;
    while (from > scan.bodyLine && lines[from - 1]!.trim() && !HEADING.test(lines[from - 1]!)) from--;
    return { from, to: b.line + 1 };
  }
  const path = want.split('#').map(foldKey).filter(Boolean);
  let start = -1;
  let level = 0;
  let searchFrom = 0;
  for (const part of path) {
    const h = scan.headings.find((x) => x.line >= searchFrom && foldKey(x.text) === part && (start < 0 || x.level > level));
    if (!h) return null;
    start = h.line;
    level = h.level;
    searchFrom = h.line + 1;
  }
  const next = scan.headings.find((x) => x.line > start && x.level <= level);
  return { from: start, to: next ? next.line : lines.length };
}

/** O texto de um trecho (sem os ^ids), para ![[nota#seção]] e prévias. */
export function noteSection(text: string, sub: string): string | null {
  const r = sectionRange(text, sub);
  if (!r) return null;
  return text
    .split('\n')
    .slice(r.from, r.to)
    .filter((l) => !/^\s*\^[A-Za-z0-9-]+\s*$/.test(l))
    .map((l) => l.replace(/\s\^[A-Za-z0-9-]+\s*$/, ''))
    .join('\n')
    .replace(/\s+$/, '');
}

/** Um id de bloco novo que ainda não existe na nota. */
export function newBlockId(text: string): string {
  const used = new Set(scanNote(text).blocks.map((b) => b.id));
  let id = '';
  do id = Math.random().toString(36).slice(2, 8);
  while (used.has(id) || /^\d+$/.test(id));
  return id;
}

/** Garante um ^id no fim da linha `line` (Obsidian faz isso ao linkar um bloco). */
export function ensureBlockId(text: string, line: number): { text: string; id: string } {
  const lines = text.split('\n');
  const cur = lines[line];
  if (cur === undefined) return { text, id: '' };
  const has = BLOCK_ID.exec(cur);
  if (has) return { text, id: has[1]! };
  const id = newBlockId(text);
  // tabelas e citações levam o id numa linha própria logo depois
  if (/^\s*[|>]/.test(cur)) {
    let end = line;
    const kind = cur.trim()[0];
    while (end + 1 < lines.length && lines[end + 1]!.trim().startsWith(kind!)) end++;
    lines.splice(end + 1, 0, '', `^${id}`);
  } else lines[line] = `${cur.replace(/\s+$/, '')} ^${id}`;
  return { text: lines.join('\n'), id };
}

/* ------------------------------------------------------------------ renomear */

/**
 * Reescreve os links que apontam para uma nota que mudou de nome ou lugar.
 * `pointsOld(alvo)` diz se o alvo de um link era a nota antiga; `newTarget`
 * é o novo alvo (nome curto ou caminho sem .md). Mantém seção, apelido e o
 * ! dos embeds; links Markdown ganham o caminho novo.
 */
export function retargetLinks(text: string, pointsOld: (target: string) => boolean, newTarget: string, newPath: string): string {
  return text
    .replace(/(!?)\[\[([^\]\n]+?)\]\]/g, (m, bang: string, raw: string) => {
      const bar = raw.indexOf('|');
      const main = bar < 0 ? raw : raw.slice(0, bar);
      const alias = bar < 0 ? '' : raw.slice(bar);
      const hash = main.indexOf('#');
      const target = (hash < 0 ? main : main.slice(0, hash)).trim();
      const sub = hash < 0 ? '' : main.slice(hash);
      if (!target || !pointsOld(target)) return m;
      return `${bang}[[${newTarget}${sub}${alias}]]`;
    })
    .replace(/(!?\[[^\]\n]*\]\()(\s*<[^>\n]+>|[^)\s]+)((?:\s+"[^"\n]*")?\s*\))/g, (m, pre: string, href: string, post: string) => {
      const raw = href.trim().replace(/^<|>$/g, '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return m;
      const dec = safeDecode(raw);
      const hash = dec.indexOf('#');
      const target = hash < 0 ? dec : dec.slice(0, hash);
      if (!pointsOld(target)) return m;
      const sub = hash < 0 ? '' : raw.slice(raw.indexOf('#'));
      const enc = newPath.split('/').map(encodeURIComponent).join('/');
      return `${pre}${href.trim().startsWith('<') ? `<${newPath}${sub ? safeDecode(sub) : ''}>` : enc + sub}${post}`;
    });
}

/* ------------------------------------------------------------------ índice */

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/i, '');
const NOTE_EXT = /\.md$/i;
const HAS_EXT = /\.[a-z0-9]{1,5}$/i;

export interface Backref {
  path: string;
  /** linhas que citam a nota, com o texto */
  lines: Array<{ n: number; text: string; embed: boolean }>;
}

interface Entry {
  text: string;
  scan: NoteScan;
}

/**
 * O índice vivo do cofre. Alimente com `set` (ou `sync` com todos os
 * caminhos) e consulte; só as notas cujo texto mudou são relidas.
 */
export class VaultIndex {
  private notes = new Map<string, Entry>();
  private files: string[] = [];
  private rev = 0;
  private cache: {
    rev: number;
    exact: Map<string, string>;
    byName: Map<string, string>;
    byAlias: Map<string, string>;
    out: Map<string, Set<string>>;
    back: Map<string, Set<string>>;
    unresolved: Map<string, Set<string>>;
  } | null = null;

  /** Atualiza uma nota; devolve true se mudou algo. */
  set(path: string, text: string): boolean {
    const cur = this.notes.get(path);
    if (cur && cur.text === text) return false;
    this.notes.set(path, { text, scan: scanNote(text) });
    this.rev++;
    return true;
  }

  delete(path: string): boolean {
    if (!this.notes.delete(path)) return false;
    this.rev++;
    return true;
  }

  /** Acerta o índice com a lista atual de notas; lê só o que mudou. */
  sync(paths: readonly string[], read: (path: string) => string | null): boolean {
    let changed = false;
    const keep = new Set(paths);
    for (const p of [...this.notes.keys()]) if (!keep.has(p)) changed = this.delete(p) || changed;
    for (const p of paths) {
      const t = read(p);
      if (t === null) continue;
      changed = this.set(p, t) || changed;
    }
    return changed;
  }

  /** Arquivos que não são notas (PDF, imagens...), para resolver anexos. */
  setFiles(paths: readonly string[]): void {
    const next = [...paths].filter((p) => !NOTE_EXT.test(p)).sort();
    if (next.length === this.files.length && next.every((p, i) => p === this.files[i])) return;
    this.files = next;
    this.rev++;
  }

  get version(): number {
    return this.rev;
  }

  paths(): string[] {
    return [...this.notes.keys()].sort();
  }

  has(path: string): boolean {
    return this.notes.has(path);
  }

  text(path: string): string | null {
    return this.notes.get(path)?.text ?? null;
  }

  scan(path: string): NoteScan | null {
    return this.notes.get(path)?.scan ?? null;
  }

  private build() {
    if (this.cache && this.cache.rev === this.rev) return this.cache;
    const exact = new Map<string, string>();
    const byName = new Map<string, string>();
    const byAlias = new Map<string, string>();
    const all = [...this.notes.keys(), ...this.files].sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length || a.localeCompare(b));
    for (const p of all) {
      const low = p.toLowerCase();
      if (!exact.has(low)) exact.set(low, p);
      const name = low.slice(low.lastIndexOf('/') + 1);
      if (!byName.has(name)) byName.set(name, p);
    }
    for (const p of all) {
      const e = this.notes.get(p);
      if (!e) continue;
      for (const a of e.scan.aliases) {
        const k = fold(a);
        if (!byAlias.has(k)) byAlias.set(k, p);
      }
    }
    this.cache = { rev: this.rev, exact, byName, byAlias, out: new Map(), back: new Map(), unresolved: new Map() };
    const c = this.cache;
    for (const [p, e] of this.notes) {
      const out = new Set<string>();
      for (const l of e.scan.links) {
        if (!l.target) continue;
        const hit = this.resolveIn(c, l.target);
        if (hit) {
          if (hit !== p) {
            out.add(hit);
            (c.back.get(hit) ?? c.back.set(hit, new Set()).get(hit)!).add(p);
          }
        } else if (!HAS_EXT.test(l.target) || NOTE_EXT.test(l.target)) {
          const k = l.target.replace(NOTE_EXT, '');
          (c.unresolved.get(k) ?? c.unresolved.set(k, new Set()).get(k)!).add(p);
        }
      }
      c.out.set(p, out);
    }
    return c;
  }

  private resolveIn(c: NonNullable<VaultIndex['cache']>, raw: string): string | null {
    const file = raw.trim().replace(/^\.?\//, '').toLowerCase();
    if (!file) return null;
    const hasExt = HAS_EXT.test(file);
    const candidates = hasExt ? [file, `${file}.md`] : [`${file}.md`, file];
    for (const k of candidates) {
      const hit = c.exact.get(k);
      if (hit) return hit;
    }
    for (const k of candidates) {
      if (k.includes('/')) {
        let best: string | null = null;
        for (const [low, p] of c.exact) if (low.endsWith(`/${k}`) && (!best || p.length < best.length)) best = p;
        if (best) return best;
        continue;
      }
      const hit = c.byName.get(k);
      if (hit) return hit;
    }
    // apelido (aliases:) de uma nota: o Tanden aceita [[apelido]] direto
    if (!hasExt || NOTE_EXT.test(file)) return c.byAlias.get(fold(raw.trim().replace(NOTE_EXT, ''))) ?? null;
    return null;
  }

  /** Caminho para onde um [[alvo]] leva (aceita "Nota#seção|apelido"), ou null. */
  resolve(raw: string): string | null {
    const { target, sub } = splitLink(raw);
    if (!target) return null;
    void sub;
    return this.resolveIn(this.build(), target);
  }

  /** Notas para onde esta nota leva (resolvidas, sem repetir). */
  outgoing(path: string): string[] {
    return [...(this.build().out.get(path) ?? [])].sort();
  }

  /** Notas que levam a esta, com as linhas que a citam. */
  backlinks(path: string): Backref[] {
    const c = this.build();
    const from = c.back.get(path);
    if (!from) return [];
    const out: Backref[] = [];
    for (const p of from) {
      const e = this.notes.get(p)!;
      const lines = e.text.split('\n');
      const seen = new Set<number>();
      const refs: Backref['lines'] = [];
      for (const l of e.scan.links) {
        if (seen.has(l.line) || !l.target || this.resolveIn(c, l.target) !== path) continue;
        seen.add(l.line);
        refs.push({ n: l.line, text: (lines[l.line] ?? '').trim(), embed: l.embed });
      }
      out.push({ path: p, lines: refs });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR', { numeric: true }));
  }

  /** Quantas notas levam a esta. */
  backlinkCount(path: string): number {
    return this.build().back.get(path)?.size ?? 0;
  }

  /** Links para notas que ainda não existem: alvo → notas que citam. */
  unresolved(): Array<{ target: string; from: string[] }> {
    return [...this.build().unresolved]
      .map(([target, from]) => ({ target, from: [...from].sort() }))
      .sort((a, b) => b.from.length - a.from.length || a.target.localeCompare(b.target, 'pt-BR'));
  }

  /** Notas sem nenhum link entrando nem saindo. */
  orphans(): string[] {
    const c = this.build();
    return this.paths().filter((p) => !(c.out.get(p)?.size) && !(c.back.get(p)?.size));
  }

  aliases(path: string): string[] {
    return this.notes.get(path)?.scan.aliases ?? [];
  }

  /** Apelidos de todas as notas (para sugerir [[Nota|apelido]]). */
  allAliases(): Array<{ alias: string; path: string }> {
    const out: Array<{ alias: string; path: string }> = [];
    for (const [p, e] of this.notes) for (const a of e.scan.aliases) out.push({ alias: a, path: p });
    return out;
  }

  /**
   * Tags do cofre e em quantas notas aparecem. Uma nota com #a/b/c conta
   * também para #a e #a/b, como no painel de tags do Obsidian.
   */
  tags(opts: { parents?: boolean } = {}): Array<{ tag: string; count: number }> {
    const count = new Map<string, { tag: string; n: number }>();
    for (const e of this.notes.values()) {
      const mine = new Map<string, string>();
      for (const t of e.scan.tags) {
        const parts = t.split('/');
        for (let i = opts.parents ? 1 : parts.length; i <= parts.length; i++) {
          const tag = parts.slice(0, i).join('/');
          mine.set(tag.toLowerCase(), tag);
        }
      }
      for (const [k, tag] of mine) {
        const cur = count.get(k);
        if (cur) cur.n++;
        else count.set(k, { tag, n: 1 });
      }
    }
    return [...count.values()].map((x) => ({ tag: x.tag, count: x.n })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pt-BR'));
  }

  /** Notas com a tag (ou uma filha dela: #a acha #a/b). */
  withTag(tag: string): string[] {
    const want = tag.replace(/^#/, '').toLowerCase();
    return this.paths().filter((p) =>
      this.notes.get(p)!.scan.tags.some((t) => {
        const low = t.toLowerCase();
        return low === want || low.startsWith(`${want}/`);
      }),
    );
  }

  /** Menções do nome (ou de um apelido) da nota em outras notas, sem link. */
  unlinkedMentions(path: string, limit = 30): Backref[] {
    const names = [nameOf(path), ...this.aliases(path)].filter((n) => n.length >= 3);
    if (!names.length) return [];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${names.map(esc).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu');
    const c = this.build();
    const linked = c.back.get(path) ?? new Set();
    const out: Backref[] = [];
    for (const p of this.paths()) {
      if (p === path || linked.has(p)) continue;
      const e = this.notes.get(p)!;
      if (!re.test(e.text)) continue;
      const raw = e.text.split('\n');
      const { text: clean } = maskedLines(raw, e.scan.bodyLine);
      const refs: Backref['lines'] = [];
      clean.forEach((l, n) => {
        if (refs.length >= 3 || !l.trim()) return;
        // tira links e embeds antes de procurar
        const plain = l.replace(/!?\[\[[^\]\n]*\]\]/g, blank).replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, blank).replace(/https?:\/\/\S+/g, blank);
        if (re.test(plain)) refs.push({ n, text: raw[n]!.trim(), embed: false });
      });
      if (refs.length) out.push({ path: p, lines: refs });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Tarefas abertas ou feitas de todo o cofre. */
  tasks(opts: { done?: boolean } = {}): Array<TaskRef & { path: string }> {
    const out: Array<TaskRef & { path: string }> = [];
    for (const p of this.paths()) {
      for (const t of this.notes.get(p)!.scan.tasks) {
        if (opts.done !== undefined && t.done !== opts.done) continue;
        out.push({ ...t, path: p });
      }
    }
    return out;
  }
}
