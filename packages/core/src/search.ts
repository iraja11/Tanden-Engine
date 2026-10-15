import { asList } from './caderno/frontmatter';
import { maskedLines, type VaultIndex } from './knowledge';

/*
 * Busca no cofre com os operadores do Obsidian (e apelidos em português):
 *
 *   palavra outra        as duas, em qualquer ordem (sem acento e maiúscula)
 *   "frase exata"        o trecho inteiro
 *   -palavra  -tag:x     exclui
 *   a OR b  /  a OU b    uma ou outra
 *   tag:#x   #x          notas com a tag (ou uma filha: #a acha #a/b)
 *   path:x   pasta:x     caminho contém
 *   file:x   nome:x      nome da nota contém
 *   [prop]  [prop:valor] propriedade existe / contém o valor
 *   task:x   tarefa:x    tarefa com o texto (task-todo:/afazer:, task-done:/feita:)
 *   /regex/              expressão regular
 */

type Term =
  | { kind: 'text'; value: string; neg: boolean }
  | { kind: 'regex'; re: RegExp; neg: boolean }
  | { kind: 'tag'; value: string; neg: boolean }
  | { kind: 'path'; value: string; neg: boolean }
  | { kind: 'file'; value: string; neg: boolean }
  | { kind: 'prop'; key: string; value: string | null; neg: boolean }
  | { kind: 'task'; value: string; done: boolean | null; neg: boolean };

export interface ParsedQuery {
  /** grupos ligados por OR; dentro de um grupo, todos os termos valem (AND) */
  groups: Term[][];
}

export interface SearchHit {
  path: string;
  score: number;
  /** linhas que casaram, para mostrar o trecho */
  lines: Array<{ n: number; text: string }>;
  /** onde casou: nome, título, tag... (para a tela explicar) */
  reason: 'name' | 'heading' | 'text' | 'filter';
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Separa a busca em pedaços, respeitando "aspas", [colchetes] e /regex/. */
function tokens(q: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < q.length) {
    if (/\s/.test(q[i]!)) {
      i++;
      continue;
    }
    let j = i;
    const neg = q[j] === '-' ? 1 : 0;
    j += neg;
    const c = q[j];
    const closeOf = c === '"' ? '"' : c === '[' ? ']' : c === '/' ? '/' : null;
    if (closeOf) {
      let k = j + 1;
      while (k < q.length && q[k] !== closeOf) k += q[k] === '\\' && closeOf === '/' ? 2 : 1;
      out.push(q.slice(i, Math.min(k + 1, q.length)));
      i = k + 1;
      continue;
    }
    // op:"valor com espaço"
    let k = j;
    while (k < q.length && !/\s/.test(q[k]!)) {
      if (q[k] === ':' && q[k + 1] === '"') {
        k += 2;
        while (k < q.length && q[k] !== '"') k++;
      }
      k++;
    }
    out.push(q.slice(i, k));
    i = k;
  }
  return out;
}

const unq = (s: string) => (s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

export function parseQuery(query: string): ParsedQuery {
  const groups: Term[][] = [[]];
  for (const tok of tokens(query.trim())) {
    if (tok === 'OR' || tok === 'OU' || tok === '|') {
      if (groups[groups.length - 1]!.length) groups.push([]);
      continue;
    }
    const neg = tok.startsWith('-') && tok.length > 1;
    const t = neg ? tok.slice(1) : tok;
    const cur = groups[groups.length - 1]!;
    if (t.startsWith('"')) {
      const v = unq(t);
      if (v) cur.push({ kind: 'text', value: fold(v), neg });
      continue;
    }
    if (t.length > 2 && t.startsWith('/') && t.endsWith('/')) {
      try {
        cur.push({ kind: 'regex', re: new RegExp(t.slice(1, -1), 'i'), neg });
      } catch {
        cur.push({ kind: 'text', value: fold(t), neg });
      }
      continue;
    }
    if (t.startsWith('[') && t.endsWith(']')) {
      const inner = t.slice(1, -1);
      const colon = inner.indexOf(':');
      const key = (colon < 0 ? inner : inner.slice(0, colon)).trim();
      const value = colon < 0 ? null : unq(inner.slice(colon + 1).trim());
      if (key) cur.push({ kind: 'prop', key: fold(key), value: value === null ? null : fold(value), neg });
      continue;
    }
    if (/^#[^\s#]/.test(t)) {
      cur.push({ kind: 'tag', value: fold(t.slice(1)), neg });
      continue;
    }
    const op = /^([\p{L}-]+):(.*)$/u.exec(t);
    if (op) {
      const name = fold(op[1]!);
      const v = unq(op[2]!);
      const val = fold(v);
      switch (name) {
        case 'tag': cur.push({ kind: 'tag', value: val.replace(/^#/, ''), neg }); continue;
        case 'path': case 'pasta': case 'caminho': cur.push({ kind: 'path', value: val, neg }); continue;
        case 'file': case 'nome': case 'arquivo': cur.push({ kind: 'file', value: val, neg }); continue;
        case 'task': case 'tarefa': cur.push({ kind: 'task', value: val, done: null, neg }); continue;
        case 'task-todo': case 'afazer': case 'pendente': cur.push({ kind: 'task', value: val, done: false, neg }); continue;
        case 'task-done': case 'feita': case 'feito': cur.push({ kind: 'task', value: val, done: true, neg }); continue;
        case 'content': case 'conteudo': case 'texto': if (val) cur.push({ kind: 'text', value: val, neg }); continue;
      }
    }
    cur.push({ kind: 'text', value: fold(t), neg });
  }
  return { groups: groups.filter((g) => g.length) };
}

/** A busca só tem filtros (tag, pasta...) e nenhum texto? */
const onlyFilters = (g: Term[]) => g.every((t) => t.kind !== 'text' && t.kind !== 'regex');

interface Doc {
  path: string;
  name: string;
  folded: string;
  lines: string[];
  foldedLines: string[];
}

function matchTerm(t: Term, d: Doc, index: VaultIndex): boolean {
  const scan = index.scan(d.path)!;
  switch (t.kind) {
    case 'text': return d.folded.includes(t.value) || fold(d.path).includes(t.value);
    case 'regex': return t.re.test(d.lines.join('\n')) || t.re.test(d.name);
    case 'tag': return scan.tags.some((x) => { const f = fold(x); return f === t.value || f.startsWith(`${t.value}/`); });
    case 'path': return fold(d.path).includes(t.value);
    case 'file': return fold(d.name).includes(t.value);
    case 'prop': {
      const k = Object.keys(scan.props).find((x) => fold(x) === t.key);
      if (k === undefined) return false;
      if (t.value === null) return true;
      const vals = asList(scan.props[k]);
      return t.value === '' ? vals.length === 0 : vals.some((v) => fold(v).includes(t.value!));
    }
    case 'task': return scan.tasks.some((x) => (t.done === null || x.done === t.done) && fold(x.text).includes(t.value));
  }
}

/** Linhas que mostram por que a nota casou. */
function hitLines(g: Term[], d: Doc, index: VaultIndex): Array<{ n: number; text: string }> {
  const scan = index.scan(d.path)!;
  const out: Array<{ n: number; text: string }> = [];
  const add = (n: number) => {
    if (out.length < 5 && !out.some((x) => x.n === n) && d.lines[n]?.trim()) out.push({ n, text: d.lines[n]!.trim() });
  };
  const masked = maskedLines(d.lines, 0).text.map(fold);
  for (const t of g) {
    if (t.neg) continue;
    if (t.kind === 'text') {
      // prefere linhas fora de código; se não houver, aceita qualquer uma
      let found = false;
      masked.forEach((l, n) => { if (l.includes(t.value)) { add(n); found = true; } });
      if (!found) d.foldedLines.forEach((l, n) => { if (l.includes(t.value)) add(n); });
    } else if (t.kind === 'regex') d.lines.forEach((l, n) => { if (t.re.test(l)) add(n); });
    else if (t.kind === 'task') for (const x of scan.tasks) if ((t.done === null || x.done === t.done) && fold(x.text).includes(t.value)) add(x.line);
  }
  return out.sort((a, b) => a.n - b.n);
}

/**
 * Procura no índice. Ordena por onde casou (nome > título > texto) e por
 * quantas vezes. Sem nenhum termo, devolve vazio.
 */
export function searchVault(index: VaultIndex, query: string, opts: { limit?: number } = {}): SearchHit[] {
  const { groups } = parseQuery(query);
  if (!groups.length) return [];
  const limit = opts.limit ?? 200;
  const hits: SearchHit[] = [];
  for (const path of index.paths()) {
    const text = index.text(path)!;
    const lines = text.split('\n');
    const d: Doc = { path, name: path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, ''), folded: fold(text), lines, foldedLines: lines.map(fold) };
    const g = groups.find((grp) => grp.every((t) => matchTerm(t, d, index) !== t.neg));
    if (!g) continue;
    const words = g.filter((t): t is Extract<Term, { kind: 'text' }> => t.kind === 'text' && !t.neg).map((t) => t.value);
    const name = fold(d.name);
    let score = 0;
    let reason: SearchHit['reason'] = onlyFilters(g) ? 'filter' : 'text';
    if (words.length) {
      const joined = words.join(' ');
      if (name === joined) score += 120;
      else if (name.startsWith(joined)) score += 90;
      else if (words.every((w) => name.includes(w))) score += 70;
      if (score) reason = 'name';
      const heads = index.scan(path)!.headings.map((h) => fold(h.text));
      if (heads.some((h) => words.every((w) => h.includes(w)))) {
        score += 25;
        if (reason === 'text') reason = 'heading';
      }
      for (const w of words) {
        let n = 0;
        for (let at = d.folded.indexOf(w); at >= 0 && n < 20; at = d.folded.indexOf(w, at + w.length)) n++;
        score += n;
      }
    }
    score -= path.split('/').length * 0.01;
    hits.push({ path, score, lines: reason === 'filter' && !g.some((t) => t.kind === 'task') ? [] : hitLines(g, d, index), reason });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path, 'pt-BR', { numeric: true }));
  return hits.slice(0, limit);
}

/** Pedaços do texto que casaram, para destacar na tela: [início, fim) por linha. */
export function highlightRanges(line: string, query: string): Array<[number, number]> {
  const { groups } = parseQuery(query);
  const words = groups.flat().filter((t): t is Extract<Term, { kind: 'text' | 'regex' }> => !t.neg && (t.kind === 'text' || t.kind === 'regex'));
  const f = fold(line);
  const out: Array<[number, number]> = [];
  for (const t of words) {
    if (t.kind === 'text') {
      for (let at = f.indexOf(t.value); at >= 0; at = f.indexOf(t.value, at + Math.max(1, t.value.length))) out.push([at, at + t.value.length]);
    } else {
      const re = new RegExp(t.re.source, 'gi');
      for (const m of line.matchAll(re)) if (m[0]) out.push([m.index!, m.index! + m[0].length]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
