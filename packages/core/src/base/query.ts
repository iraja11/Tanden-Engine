/*
 * Executa um banco sobre as notas do cofre: filtra, calcula fórmulas, ordena,
 * agrupa e resume. Tudo em memória, a partir do texto das notas.
 */
import { asList, setProp, splitFrontmatter, type PropValue, type Props } from '../caderno/frontmatter';
import { scanNote, type NoteScan } from '../knowledge';
import { noteDir, noteName } from '../caderno/markdown';
import {
  ExprError, Link, autoValue, compare, evaluate, isEmpty, isoDate, isObj, parseDate, show, truthy,
  type Obj, type Scope, type Value,
} from './expr';
import { propConfig, propId, propKey, type BaseDef, type Filter, type PropConfig, type PropType, type ViewDef } from './model';

export interface NoteRec {
  path: string;
  name: string;
  folder: string;
  props: Props;
  tags: string[];
  links: string[];
  /** data de modificação (ms), quando o armazenamento informa */
  mtime?: number;
  /** data de criação (ms): propriedade "criado"/"created", ou a modificação */
  ctime?: number;
  /** primeira imagem da nota, para capas de galeria */
  image?: string;
}

const IMG_RE = /!\[\[([^\]|#]+\.(?:png|jpe?g|gif|webp|avif|svg|bmp))(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\((<[^>]+>|[^)\s]+)/i;

/** Lê uma nota para o índice dos bancos (tags e links contam como no resto do app). */
export function noteRecord(path: string, text: string, mtime?: number, scanned?: NoteScan): NoteRec {
  const scan = scanned ?? scanNote(text);
  const props = scan.props;
  const { body } = splitFrontmatter(text);
  const links = new Set<string>();
  for (const l of scan.links) {
    if (l.target && !/\.(png|jpe?g|gif|webp|avif|svg|bmp|pdf)$/i.test(l.target)) links.add(l.target);
  }
  const img = IMG_RE.exec(body);
  const created = parseDate(String(props.criado ?? props.created ?? props['criado em'] ?? ''));
  return {
    path,
    name: noteName(path),
    folder: noteDir(path),
    props,
    tags: scan.tags,
    links: [...links],
    mtime,
    ctime: created?.getTime() ?? mtime,
    image: img ? (img[1] ?? img[2]!.replace(/^<|>$/g, '')) : (typeof props.capa === 'string' ? props.capa : typeof props.cover === 'string' ? props.cover : undefined),
  };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todas as notas, com busca por nome para resolver links e backlinks. */
export class NoteIndex {
  readonly byPath = new Map<string, NoteRec>();
  private byName = new Map<string, NoteRec>();
  private back = new Map<string, string[]>();

  /**
   * `resolve`: o resolvedor de [[links]] do app (com apelidos e caminhos
   * parciais). Sem ele, resolve pelo nome, como antes.
   */
  constructor(readonly notes: NoteRec[], private resolver?: (target: string) => string | null) {
    for (const n of notes) {
      this.byPath.set(n.path, n);
      const k = fold(n.name);
      // nome repetido em pastas diferentes: fica o caminho mais curto, como o Obsidian
      const cur = this.byName.get(k);
      if (!cur || n.path.length < cur.path.length) this.byName.set(k, n);
    }
    for (const n of notes) {
      for (const l of n.links) {
        const t = this.find(l);
        if (t && t.path !== n.path) (this.back.get(t.path) ?? this.back.set(t.path, []).get(t.path)!).push(n.path);
      }
    }
  }

  /** Nota por link: "Nome", "Pasta/Nome", "Pasta/Nome.md". */
  find(target: string): NoteRec | null {
    if (this.resolver) {
      const hit = this.resolver(target);
      if (hit) return this.byPath.get(hit) ?? null;
    }
    const t = target.replace(/\.md$/i, '').trim();
    return this.byPath.get(`${t}.md`) ?? this.byName.get(fold(t.split('/').pop()!)) ?? null;
  }

  backlinks(path: string): string[] {
    return this.back.get(path) ?? [];
  }
}

// ------------------------------------------------------------------ valor de uma propriedade

/** Converte o texto da propriedade para o tipo configurado na coluna. */
export function typedValue(raw: PropValue | undefined, type: PropType | undefined): Value {
  if (raw === undefined) return null;
  switch (type) {
    case 'number': {
      const s = Array.isArray(raw) ? raw[0] ?? '' : raw;
      if (s.trim() === '') return null;
      const n = Number(s.replace(',', '.'));
      return Number.isNaN(n) ? s : n;
    }
    case 'checkbox': {
      const s = (Array.isArray(raw) ? raw[0] ?? '' : raw).trim().toLowerCase();
      return s === 'true' || s === 'sim' || s === 'x' || s === 'yes' || s === '1';
    }
    case 'date': case 'datetime': case 'created': case 'edited': {
      const s = Array.isArray(raw) ? raw[0] ?? '' : raw;
      return s.trim() === '' ? null : parseDate(s) ?? s;
    }
    case 'multiselect': case 'relation': case 'files': case 'person':
      return asList(raw).filter((x) => x !== '').map((x) => autoValue(x));
    case 'text': case 'url': case 'email': case 'phone': case 'select': case 'status':
      return Array.isArray(raw) ? raw.join(', ') : raw === '' ? null : raw;
  }
  return autoValue(raw);
}

/** Valor tipado → como ele vai para o topo da nota. */
export function rawValue(v: Value, type: PropType | undefined): PropValue | null {
  if (v === null || v === undefined || v instanceof ExprError) return null;
  if (Array.isArray(v)) {
    const items = v.map((x) => (x instanceof Link ? `[[${x.target}]]` : x instanceof Date ? isoDate(x) : show(x))).filter((x) => x !== '');
    return items;
  }
  if (v instanceof Link) return type === 'relation' ? [`[[${v.target}]]`] : `[[${v.target}]]`;
  if (v instanceof Date) return isoDate(v, type === 'datetime' ? true : type === 'date' ? false : undefined);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (isObj(v)) return v.label ?? null;
  if (v === '' ) return null;
  return String(v);
}

// ------------------------------------------------------------------ execução

export interface Row {
  rec: NoteRec;
  /** valor de uma coluna ("note.x", "file.x", "formula.x") */
  get(id: string): Value;
}

export interface Group {
  key: Value;
  label: string;
  rows: Row[];
}

export interface ViewResult {
  rows: Row[];
  /** só quando a view agrupa */
  groups: Group[] | null;
  /** total antes do limite */
  total: number;
  /** erro de um filtro (a linha é mantida, como no Obsidian) */
  errors: string[];
}

export interface RunOptions {
  /** nota onde o bloco está (this.*) */
  thisPath?: string;
  /** busca rápida por texto na tela */
  search?: string;
  now?: Date;
}

class Ctx {
  private rows = new Map<string, Row>();
  readonly errors = new Set<string>();
  constructor(readonly def: BaseDef, readonly index: NoteIndex, readonly opts: RunOptions) {}

  row(rec: NoteRec): Row {
    let r = this.rows.get(rec.path);
    if (!r) {
      r = makeRow(rec, this);
      this.rows.set(rec.path, r);
    }
    return r;
  }
}

function fileObj(rec: NoteRec, ctx: Ctx): Obj {
  return {
    kind: 'obj',
    label: rec.name,
    get(name) {
      switch (name) {
        case 'name': case 'basename': case 'nome': return rec.name;
        case 'path': case 'caminho': return rec.path;
        case 'folder': case 'pasta': return rec.folder;
        case 'ext': case 'extension': return 'md';
        case 'tags': return rec.tags;
        case 'links': return rec.links.map((l) => new Link(l));
        case 'backlinks': return ctx.index.backlinks(rec.path).map((p) => new Link(p.replace(/\.md$/, '')));
        case 'mtime': return rec.mtime ? new Date(rec.mtime) : null;
        case 'ctime': return rec.ctime ? new Date(rec.ctime) : null;
        case 'image': case 'capa': return rec.image ?? null;
        case 'file': return this;
        case 'properties': return noteObj(rec, ctx);
      }
      return null;
    },
    call(name, args) {
      const a = args.map(show);
      switch (name) {
        case 'hasTag': return a.some((t) => rec.tags.some((x) => fold(x) === fold(t.replace(/^#/, '')) || fold(x).startsWith(`${fold(t.replace(/^#/, ''))}/`)));
        case 'inFolder': return a.some((f) => { const d = f.replace(/^\/|\/$/g, ''); return d === '' || rec.folder === d || rec.folder.startsWith(`${d}/`); });
        case 'hasLink': return args.some((x) => { const t = x instanceof Link ? x.target : show(x); const target = ctx.index.find(t); return rec.links.some((l) => (target ? ctx.index.find(l)?.path === target.path : fold(l) === fold(t))); });
        case 'hasProperty': return a.some((p) => Object.keys(rec.props).some((k) => fold(k) === fold(p)));
        case 'asLink': return new Link(rec.path.replace(/\.md$/, ''), rec.name);
      }
      return undefined;
    },
  };
}

function noteObj(rec: NoteRec, ctx: Ctx): Obj {
  return {
    kind: 'obj',
    label: rec.name,
    get(name) {
      return propValue(rec, name, ctx);
    },
  };
}

function propValue(rec: NoteRec, name: string, ctx: Ctx): Value {
  let raw = rec.props[name];
  if (raw === undefined) {
    const k = Object.keys(rec.props).find((x) => fold(x) === fold(name));
    if (k) raw = rec.props[k];
  }
  return typedValue(raw, propConfig(ctx.def, `note.${name}`).type);
}

function formulaObj(rec: NoteRec, ctx: Ctx, stack: Set<string>): Obj {
  return {
    kind: 'obj',
    get(name) {
      const src = ctx.def.formulas?.[name];
      if (src === undefined) return null;
      if (stack.has(name)) return new ExprError(`a fórmula "${name}" depende dela mesma`);
      stack.add(name);
      try {
        return evaluate(src, scopeFor(rec, ctx, stack));
      } finally {
        stack.delete(name);
      }
    },
  };
}

function scopeFor(rec: NoteRec, ctx: Ctx, stack = new Set<string>()): Scope {
  const file = fileObj(rec, ctx);
  const note = noteObj(rec, ctx);
  const formula = formulaObj(rec, ctx, stack);
  return {
    now: ctx.opts.now,
    lookup(name) {
      switch (name) {
        case 'file': case 'arquivo': return file;
        case 'note': case 'nota': return note;
        case 'formula': case 'formula_': return formula;
        case 'this': case 'esta': {
          const t = ctx.opts.thisPath ? ctx.index.byPath.get(ctx.opts.thisPath) : null;
          if (!t) return null;
          const f = fileObj(t, ctx);
          const n = noteObj(t, ctx);
          return { kind: 'obj', label: t.name, get: (k) => (k === 'file' ? f : n.get(k)) } satisfies Obj;
        }
      }
      return propValue(rec, name, ctx);
    },
    resolve(link) {
      const t = ctx.index.find(link.target);
      if (!t) return null;
      const s = scopeFor(t, ctx, stack);
      const f = fileObj(t, ctx);
      return {
        kind: 'obj',
        label: t.name,
        get: (k) => {
          if (k === 'file') return f;
          if (k.startsWith('file.')) return f.get(k.slice(5));
          if (k.startsWith('formula.')) return (s.lookup('formula') as Obj).get(k.slice(8));
          return s.lookup(k) ?? null;
        },
      };
    },
  };
}

function makeRow(rec: NoteRec, ctx: Ctx): Row {
  const cache = new Map<string, Value>();
  let scope: Scope | null = null;
  return {
    rec,
    get(id) {
      if (cache.has(id)) return cache.get(id)!;
      scope ??= scopeFor(rec, ctx);
      let v: Value;
      const [ns, ...rest] = id.split('.');
      const name = rest.join('.');
      if (ns === 'file') v = (scope.lookup('file') as Obj).get(name);
      else if (ns === 'formula') v = (scope.lookup('formula') as Obj).get(name);
      else if (ns === 'note') v = propValue(rec, name, ctx);
      else v = propValue(rec, id, ctx);
      if (v instanceof ExprError) ctx.errors.add(v.message);
      cache.set(id, v);
      return v;
    },
  };
}

function passes(f: Filter | undefined, rec: NoteRec, ctx: Ctx): boolean {
  if (f === undefined || f === null) return true;
  if (typeof f === 'string') {
    if (f.trim() === '') return true;
    const v = evaluate(f, scopeFor(rec, ctx));
    if (v instanceof ExprError) {
      ctx.errors.add(`${f}: ${v.message}`);
      return true;
    }
    return truthy(v);
  }
  if (f.and && !f.and.every((x) => passes(x, rec, ctx))) return false;
  if (f.or && f.or.length && !f.or.some((x) => passes(x, rec, ctx))) return false;
  if (f.not && f.not.some((x) => passes(x, rec, ctx))) return false;
  return true;
}

const groupLabel = (v: Value) => (isEmpty(v) ? '' : show(v));

/** Linhas de uma view, já filtradas, ordenadas e agrupadas. */
export function runView(def: BaseDef, view: ViewDef, index: NoteIndex, opts: RunOptions = {}): ViewResult {
  const ctx = new Ctx(def, index, opts);
  const q = fold(opts.search?.trim() ?? '');
  let rows = index.notes
    .filter((rec) => !(opts.thisPath && rec.path === opts.thisPath && !def.filters))
    .filter((rec) => passes(def.filters, rec, ctx) && passes(view.filters, rec, ctx))
    .map((rec) => ctx.row(rec));
  if (q) {
    const cols = view.order ?? [];
    rows = rows.filter((r) => fold(`${r.rec.name} ${cols.map((c) => show(r.get(c))).join(' ')}`).includes(q));
  }
  const sort = view.sort ?? [];
  rows.sort((a, b) => {
    for (const s of sort) {
      const c = compare(a.get(s.property), b.get(s.property));
      if (c !== 0) return s.direction === 'DESC' ? (isEmpty(a.get(s.property)) || isEmpty(b.get(s.property)) ? c : -c) : c;
    }
    return a.rec.name.localeCompare(b.rec.name, 'pt-BR', { numeric: true });
  });
  const total = rows.length;
  if (view.limit && view.limit > 0) rows = rows.slice(0, view.limit);

  let groups: Group[] | null = null;
  if (view.groupBy) {
    const g = view.groupBy;
    const cfg = propConfig(def, g.property);
    const map = new Map<string, Group>();
    // opções de seleção/status aparecem na ordem configurada, mesmo vazias
    for (const o of cfg.options ?? []) map.set(o.value, { key: o.value, label: o.value, rows: [] });
    for (const r of rows) {
      const v = r.get(g.property);
      // listas (tags, seleção múltipla): a linha entra em cada grupo
      const keys = Array.isArray(v) ? (v.length ? v : [null]) : [v];
      for (const k of keys) {
        const label = groupLabel(k);
        const gr = map.get(label) ?? map.set(label, { key: k, label, rows: [] }).get(label)!;
        gr.rows.push(r);
      }
    }
    const configured = new Set((cfg.options ?? []).map((o) => o.value));
    groups = [...map.values()];
    const rest = groups.filter((x) => !configured.has(x.label)).sort((a, b) => {
      if (a.label === '') return 1;
      if (b.label === '') return -1;
      const c = compare(a.key, b.key);
      return g.direction === 'DESC' ? -c : c;
    });
    groups = [...groups.filter((x) => configured.has(x.label)), ...rest];
    if (g.direction === 'DESC' && configured.size) groups = [...groups.filter((x) => configured.has(x.label)).reverse(), ...rest];
    if (view.hideEmptyGroups) groups = groups.filter((x) => x.rows.length > 0);
  }
  return { rows, groups, total, errors: [...ctx.errors] };
}

// ------------------------------------------------------------------ resumos do rodapé

export const SUMMARIES: Array<{ id: string; label: string; for?: 'number' | 'date' | 'checkbox' }> = [
  { id: 'Count', label: 'Contar tudo' },
  { id: 'Filled', label: 'Preenchidos' },
  { id: 'Empty', label: 'Vazios' },
  { id: 'Unique', label: 'Valores únicos' },
  { id: 'PercentFilled', label: '% preenchidos' },
  { id: 'Sum', label: 'Soma', for: 'number' },
  { id: 'Average', label: 'Média', for: 'number' },
  { id: 'Median', label: 'Mediana', for: 'number' },
  { id: 'Min', label: 'Mínimo', for: 'number' },
  { id: 'Max', label: 'Máximo', for: 'number' },
  { id: 'Range', label: 'Amplitude', for: 'number' },
  { id: 'Earliest', label: 'Mais antiga', for: 'date' },
  { id: 'Latest', label: 'Mais recente', for: 'date' },
  { id: 'Checked', label: 'Marcados', for: 'checkbox' },
  { id: 'Unchecked', label: 'Desmarcados', for: 'checkbox' },
  { id: 'PercentChecked', label: '% marcados', for: 'checkbox' },
];

export function summarize(kind: string, values: Value[]): Value {
  const filled = values.filter((v) => !isEmpty(v));
  const ns = filled.flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => (typeof v === 'number' ? v : Number(show(v)))).filter((n) => !Number.isNaN(n));
  const ds = filled.filter((v): v is Date => v instanceof Date);
  const pct = (a: number) => (values.length ? `${Math.round((a / values.length) * 100)}%` : '0%');
  switch (kind) {
    case 'Count': return values.length;
    case 'Filled': return filled.length;
    case 'Empty': return values.length - filled.length;
    case 'Unique': return new Set(filled.flatMap((v) => (Array.isArray(v) ? v : [v])).map(show)).size;
    case 'PercentFilled': return pct(filled.length);
    case 'Sum': return round(ns.reduce((a, b) => a + b, 0));
    case 'Average': return ns.length ? round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;
    case 'Median': { const x = [...ns].sort((a, b) => a - b); if (!x.length) return null; const m = x.length >> 1; return x.length % 2 ? x[m]! : (x[m - 1]! + x[m]!) / 2; }
    case 'Min': return ns.length ? Math.min(...ns) : null;
    case 'Max': return ns.length ? Math.max(...ns) : null;
    case 'Range': return ns.length ? round(Math.max(...ns) - Math.min(...ns)) : null;
    case 'Earliest': return ds.length ? ds.reduce((a, b) => (a < b ? a : b)) : null;
    case 'Latest': return ds.length ? ds.reduce((a, b) => (a > b ? a : b)) : null;
    case 'Checked': return values.filter((v) => v === true).length;
    case 'Unchecked': return values.filter((v) => v !== true).length;
    case 'PercentChecked': return pct(values.filter((v) => v === true).length);
  }
  return null;
}

const round = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ escrever

/** Grava uma célula na nota da linha. Fórmulas e propriedades de arquivo não se editam. */
export function writeCell(text: string, id: string, value: Value, cfg: PropConfig = {}): string {
  const pid = propId(id);
  if (!pid.startsWith('note.')) return text;
  return setProp(text, propKey(pid), rawValue(value, cfg.type));
}

/** Formata um número conforme a coluna ("real:2", "percent", "number:0"). */
export function formatBaseNumber(n: number, format?: string): string {
  const [kind, dec] = (format ?? 'number').split(':');
  const digits = dec !== undefined ? Number(dec) : undefined;
  const opts: Intl.NumberFormatOptions = digits !== undefined ? { minimumFractionDigits: digits, maximumFractionDigits: digits } : { maximumFractionDigits: 4 };
  switch (kind) {
    case 'percent': return new Intl.NumberFormat('pt-BR', { style: 'percent', ...opts }).format(n);
    case 'real': return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', ...opts }).format(n);
    case 'dolar': return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', ...opts }).format(n);
    case 'euro': return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', ...opts }).format(n);
    case 'plain': return digits !== undefined ? n.toFixed(digits) : String(n);
  }
  return new Intl.NumberFormat('pt-BR', opts).format(n);
}

/** Valor para mostrar numa célula, seguindo o tipo da coluna. */
export function display(v: Value, cfg: PropConfig = {}): string {
  if (v instanceof ExprError) return v.toString();
  if (typeof v === 'number') return formatBaseNumber(v, cfg.format);
  if (v instanceof Date) {
    const withTime = cfg.type === 'datetime' || cfg.type === 'created' || cfg.type === 'edited' || (cfg.type === undefined && (v.getHours() || v.getMinutes()));
    return v.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '') +
      (withTime ? ` ${v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '');
  }
  if (Array.isArray(v)) return v.map((x) => display(x, { ...cfg, type: undefined })).join(', ');
  return show(v);
}

/** Valores já usados numa propriedade (para sugerir opções de seleção). */
export function usedValues(index: NoteIndex, key: string, paths?: Set<string>): string[] {
  const seen = new Map<string, number>();
  for (const n of index.notes) {
    if (paths && !paths.has(n.path)) continue;
    for (const v of asList(n.props[key])) if (v.trim()) seen.set(v.trim(), (seen.get(v.trim()) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}
