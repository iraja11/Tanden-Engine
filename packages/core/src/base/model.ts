/*
 * Bancos de dados no formato das Bases do Obsidian.
 *
 * Um banco é um bloco ```base dentro de uma nota (o Obsidian também lê assim).
 * As linhas do banco são notas comuns; as colunas são as propriedades do topo
 * delas. O bloco guarda filtros, fórmulas, configuração das propriedades e as
 * visualizações:
 *
 *   ```base
 *   filters:
 *     and:
 *       - file.inFolder("Projetos")
 *   formulas:
 *     atraso: if(prazo < today() && status != "Feito", "atrasado", "")
 *   properties:
 *     status:
 *       displayName: Status
 *       type: status                 ← extensão do Tanden (o Obsidian ignora)
 *       options: [{ value: A fazer, color: gray }, { value: Feito, color: green }]
 *   views:
 *     - type: table                  ← table, cards e list são do Obsidian;
 *       name: Tudo                      board, calendar, gallery e timeline, do Tanden
 *       order: [file.name, status, prazo, formula.atraso]
 *       sort: [{ property: prazo, direction: ASC }]
 *   ```
 *
 * Chaves que o Tanden não conhece são guardadas e regravadas como vieram.
 */
import YAML from 'yaml';

export type PropType =
  | 'text' | 'number' | 'checkbox' | 'date' | 'datetime' | 'select' | 'status' | 'multiselect'
  | 'relation' | 'url' | 'email' | 'phone' | 'files' | 'person' | 'created' | 'edited';

export const PROP_TYPES: Array<{ id: PropType; label: string; icon: string }> = [
  { id: 'text', label: 'Texto', icon: 'Aa' },
  { id: 'number', label: 'Número', icon: '#' },
  { id: 'select', label: 'Seleção', icon: '◉' },
  { id: 'multiselect', label: 'Seleção múltipla', icon: '☰' },
  { id: 'status', label: 'Status', icon: '◐' },
  { id: 'date', label: 'Data', icon: '▦' },
  { id: 'datetime', label: 'Data e hora', icon: '◷' },
  { id: 'checkbox', label: 'Caixa de seleção', icon: '☑' },
  { id: 'relation', label: 'Relação', icon: '↗' },
  { id: 'person', label: 'Pessoa', icon: '☺' },
  { id: 'url', label: 'Link', icon: '🔗' },
  { id: 'email', label: 'E-mail', icon: '@' },
  { id: 'phone', label: 'Telefone', icon: '☏' },
  { id: 'files', label: 'Arquivos e mídia', icon: '⎙' },
  { id: 'created', label: 'Data de criação', icon: '✦' },
  { id: 'edited', label: 'Última edição', icon: '✎' },
];

export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const;
export type OptionColor = (typeof COLORS)[number];
export const COLOR_LABEL: Record<OptionColor, string> = {
  gray: 'Cinza', brown: 'Marrom', orange: 'Laranja', yellow: 'Amarelo', green: 'Verde', blue: 'Azul', purple: 'Roxo', pink: 'Rosa', red: 'Vermelho',
};

export interface SelectOption {
  value: string;
  color?: OptionColor;
  /** status: em que grupo a opção cai (a fazer, em andamento, concluído) */
  group?: 'todo' | 'doing' | 'done';
}

export interface PropConfig {
  displayName?: string;
  type?: PropType;
  options?: SelectOption[];
  /** relação: pasta (ou nota de banco) de onde vêm as opções */
  target?: string;
  /** número: number, percent, real, dolar, euro; com casas: "real:2" */
  format?: string;
  /** largura da coluna na tabela, em px */
  width?: number;
  [k: string]: unknown;
}

export type Filter = string | { and?: Filter[]; or?: Filter[]; not?: Filter[] };

export interface SortSpec {
  property: string;
  direction: 'ASC' | 'DESC';
}

export type ViewType = 'table' | 'board' | 'calendar' | 'gallery' | 'cards' | 'list' | 'timeline';

export const VIEW_TYPES: Array<{ id: ViewType; label: string; icon: string }> = [
  { id: 'table', label: 'Tabela', icon: '▤' },
  { id: 'board', label: 'Quadro', icon: '▥' },
  { id: 'gallery', label: 'Galeria', icon: '▦' },
  { id: 'list', label: 'Lista', icon: '☰' },
  { id: 'calendar', label: 'Calendário', icon: '◫' },
  { id: 'timeline', label: 'Linha do tempo', icon: '═' },
];

export interface ViewDef {
  type: ViewType | string;
  name: string;
  filters?: Filter;
  /** colunas visíveis, na ordem */
  order?: string[];
  sort?: SortSpec[];
  groupBy?: SortSpec;
  limit?: number;
  /** cálculo no rodapé de cada coluna: Sum, Average, Count... */
  summaries?: Record<string, string>;
  /** galeria: propriedade com a imagem de capa ("capa", "file.image") */
  image?: string;
  /** galeria: tamanho do cartão */
  cardSize?: number;
  /** calendário e linha do tempo: propriedade de data (início) */
  date?: string;
  /** linha do tempo: propriedade do fim */
  endDate?: string;
  /** quadro: esconder colunas sem itens */
  hideEmptyGroups?: boolean;
  /** quebra de texto nas células da tabela */
  wrap?: boolean;
  [k: string]: unknown;
}

export interface BaseDef {
  filters?: Filter;
  formulas?: Record<string, string>;
  properties?: Record<string, PropConfig>;
  views: ViewDef[];
  /** modelo usado em "Novo" (link para uma nota em Modelos/) */
  template?: string;
  [k: string]: unknown;
}

// ------------------------------------------------------------------ ids de propriedades

/** "status" ou "note.status" → "note.status"; "file.x" e "formula.x" ficam iguais. */
export function propId(raw: string): string {
  const s = raw.trim();
  if (/^(file|formula|note)\./.test(s)) return s;
  return `note.${s}`;
}

/** Como o id aparece no YAML: propriedades de nota sem o prefixo. */
export function propKey(id: string): string {
  return id.startsWith('note.') ? id.slice(5) : id;
}

export const FILE_PROPS: Array<{ id: string; label: string; type: PropType | 'file' }> = [
  { id: 'file.name', label: 'Nome', type: 'text' },
  { id: 'file.folder', label: 'Pasta', type: 'text' },
  { id: 'file.path', label: 'Caminho', type: 'text' },
  { id: 'file.tags', label: 'Tags', type: 'multiselect' },
  { id: 'file.links', label: 'Links', type: 'relation' },
  { id: 'file.backlinks', label: 'Mencionado em', type: 'relation' },
  { id: 'file.progress', label: 'Tarefas feitas (%)', type: 'number' },
  { id: 'file.tasks', label: 'Tarefas', type: 'number' },
  { id: 'file.ctime', label: 'Criada em', type: 'created' },
  { id: 'file.mtime', label: 'Editada em', type: 'edited' },
];

/** Configuração de uma propriedade (aceita a chave com ou sem "note."). */
export function propConfig(def: BaseDef, id: string): PropConfig {
  const p = def.properties ?? {};
  return p[id] ?? p[propKey(id)] ?? p[propId(id)] ?? {};
}

export function propLabel(def: BaseDef, id: string): string {
  const c = propConfig(def, id);
  if (c.displayName) return c.displayName;
  const f = FILE_PROPS.find((x) => x.id === id);
  if (f) return f.label;
  return id.replace(/^(note|formula)\./, '');
}

// ------------------------------------------------------------------ YAML

const asArr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v === undefined || v === null ? [] : [v as T]);

function normSort(v: unknown): SortSpec[] {
  return asArr<unknown>(v).flatMap((x) => {
    if (typeof x === 'string') return [{ property: propId(x), direction: 'ASC' as const }];
    if (x && typeof x === 'object' && 'property' in x) {
      const o = x as { property: string; direction?: string };
      return [{ property: propId(String(o.property)), direction: String(o.direction ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' as const : 'ASC' as const }];
    }
    return [];
  });
}

/** Lê o YAML de um bloco base. Nunca lança: YAML quebrado vira banco vazio com o erro. */
export function parseBase(src: string): { def: BaseDef; error: string | null } {
  let raw: unknown;
  try {
    raw = YAML.parse(src) ?? {};
  } catch (e) {
    return { def: { views: [{ type: 'table', name: 'Tabela' }] }, error: (e as Error).message.split('\n')[0]! };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { def: { views: [{ type: 'table', name: 'Tabela' }] }, error: 'o bloco não é um mapa YAML' };
  const o = raw as Record<string, unknown>;
  const def: BaseDef = { ...o, views: [] };
  if (o.formulas && typeof o.formulas === 'object') {
    def.formulas = Object.fromEntries(Object.entries(o.formulas as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]));
  }
  if (o.properties && typeof o.properties === 'object') {
    const props: Record<string, PropConfig> = {};
    for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) {
      const c: PropConfig = { ...(v && typeof v === 'object' ? (v as PropConfig) : {}) };
      if (c.options) {
        c.options = asArr<unknown>(c.options).map((x) => (typeof x === 'object' && x !== null ? { ...(x as SelectOption), value: String((x as SelectOption).value ?? '') } : { value: String(x) }));
      }
      props[propId(k)] = c;
    }
    def.properties = props;
  }
  for (const v of asArr<Record<string, unknown>>(o.views)) {
    if (!v || typeof v !== 'object') continue;
    const view: ViewDef = { ...v, type: String(v.type ?? 'table'), name: String(v.name ?? 'Tabela') };
    if (v.order) view.order = asArr<unknown>(v.order).map((x) => propId(String(x)));
    if (v.sort) view.sort = normSort(v.sort);
    if (v.groupBy) view.groupBy = normSort(v.groupBy)[0];
    if (v.summaries && typeof v.summaries === 'object') {
      view.summaries = Object.fromEntries(Object.entries(v.summaries as Record<string, unknown>).map(([k, x]) => [propId(k), String(x)]));
    }
    if (typeof v.image === 'string') view.image = propId(v.image);
    if (typeof v.date === 'string') view.date = propId(v.date);
    if (typeof v.endDate === 'string') view.endDate = propId(v.endDate);
    def.views.push(view);
  }
  if (def.views.length === 0) def.views.push({ type: 'table', name: 'Tabela' });
  return { def, error: null };
}

function cleanView(v: ViewDef): Record<string, unknown> {
  const out: Record<string, unknown> = { type: v.type, name: v.name };
  for (const [k, x] of Object.entries(v)) {
    if (k === 'type' || k === 'name' || x === undefined) continue;
    if (k === 'order') out.order = (x as string[]).map(propKey);
    else if (k === 'sort') { if ((x as SortSpec[]).length) out.sort = (x as SortSpec[]).map((s) => ({ property: propKey(s.property), direction: s.direction })); }
    else if (k === 'groupBy') out.groupBy = { property: propKey((x as SortSpec).property), direction: (x as SortSpec).direction };
    else if (k === 'summaries') { if (Object.keys(x as object).length) out.summaries = Object.fromEntries(Object.entries(x as Record<string, string>).map(([p, s]) => [propKey(p), s])); }
    else if (k === 'image' || k === 'date' || k === 'endDate') out[k] = propKey(x as string);
    else if (k === 'filters' && isEmptyFilter(x as Filter)) continue;
    else out[k] = x;
  }
  return out;
}

export function isEmptyFilter(f: Filter | undefined): boolean {
  if (f === undefined || f === '') return true;
  if (typeof f === 'string') return f.trim() === '';
  return (['and', 'or', 'not'] as const).every((k) => !f[k] || f[k]!.length === 0);
}

/** Grava o banco de volta em YAML, mantendo as chaves desconhecidas. */
export function serializeBase(def: BaseDef): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(def)) {
    if (v === undefined || k === 'views') continue;
    if (k === 'filters' && isEmptyFilter(v as Filter)) continue;
    if (k === 'formulas' && Object.keys(v as object).length === 0) continue;
    if (k === 'properties') {
      const props = Object.entries(v as Record<string, PropConfig>)
        .map(([id, c]) => [propKey(id), Object.fromEntries(Object.entries(c).filter(([, x]) => x !== undefined && !(Array.isArray(x) && x.length === 0)))] as const)
        .filter(([, c]) => Object.keys(c).length > 0);
      if (props.length) out.properties = Object.fromEntries(props);
      continue;
    }
    out[k] = v;
  }
  out.views = def.views.map(cleanView);
  return YAML.stringify(out, { lineWidth: 0, flowCollectionPadding: true }).trimEnd() + '\n';
}

// ------------------------------------------------------------------ blocos na nota

export interface BaseBlock {
  /** índice do bloco na nota (0, 1, ...) */
  index: number;
  /** linha da cerca de abertura (0-based) */
  startLine: number;
  /** linha da cerca de fechamento (0-based) */
  endLine: number;
  source: string;
}

const OPEN = /^(\s*)(`{3,}|~{3,})\s*base\s*$/;

/** Blocos ```base de uma nota. */
export function findBaseBlocks(text: string): BaseBlock[] {
  const lines = text.split('\n');
  const out: BaseBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = OPEN.exec(lines[i]!);
    if (!m) {
      // pula outros blocos de código inteiros
      const other = /^\s*(`{3,}|~{3,})/.exec(lines[i]!);
      if (other) {
        const close = new RegExp(`^\\s*${other[1]![0]}{${other[1]!.length},}\\s*$`);
        let j = i + 1;
        while (j < lines.length && !close.test(lines[j]!)) j++;
        i = j;
      }
      continue;
    }
    const close = new RegExp(`^\\s*${m[2]![0]}{${m[2]!.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j]!)) j++;
    out.push({ index: out.length, startLine: i, endLine: Math.min(j, lines.length), source: lines.slice(i + 1, j).join('\n') });
    i = j;
  }
  return out;
}

/** Troca o conteúdo do bloco base número `index`. */
export function replaceBaseBlock(text: string, index: number, source: string): string {
  const b = findBaseBlocks(text)[index];
  if (!b) return text;
  const lines = text.split('\n');
  const body = source.replace(/\n+$/, '').split('\n');
  if (b.endLine >= lines.length) lines.push('```');
  lines.splice(b.startLine + 1, b.endLine - b.startLine - 1, ...body);
  return lines.join('\n');
}

/** Pasta das linhas, pelo filtro file.inFolder("...") do banco. */
export function baseFolder(def: BaseDef): string | null {
  const walk = (f: Filter | undefined): string | null => {
    if (!f) return null;
    if (typeof f === 'string') {
      const m = /^\s*file\.inFolder\(\s*["']([^"']*)["']\s*\)\s*$/.exec(f);
      return m ? m[1]! : null;
    }
    for (const x of f.and ?? []) {
      const r = walk(x);
      if (r !== null) return r;
    }
    return null;
  };
  return walk(def.filters);
}

// ------------------------------------------------------------------ filtros simples

/** Operadores que a tela de filtros sabe montar; o resto fica como expressão livre. */
export const FILTER_OPS = [
  { id: 'is', label: 'é', needs: true },
  { id: 'isnt', label: 'não é', needs: true },
  { id: 'contains', label: 'contém', needs: true },
  { id: 'notContains', label: 'não contém', needs: true },
  { id: 'startsWith', label: 'começa com', needs: true },
  { id: 'gt', label: '>', needs: true },
  { id: 'lt', label: '<', needs: true },
  { id: 'gte', label: '≥', needs: true },
  { id: 'lte', label: '≤', needs: true },
  { id: 'empty', label: 'está vazio', needs: false },
  { id: 'filled', label: 'não está vazio', needs: false },
  { id: 'checked', label: 'marcado', needs: false },
  { id: 'unchecked', label: 'desmarcado', needs: false },
  { id: 'today', label: 'é hoje', needs: false },
  { id: 'past', label: 'já passou', needs: false },
  { id: 'next7', label: 'nos próximos 7 dias', needs: false },
] as const;
export type FilterOp = (typeof FILTER_OPS)[number]['id'];

export interface SimpleFilter {
  prop: string;
  op: FilterOp;
  value: string;
}

/** Como a propriedade aparece numa expressão: status, note["meu campo"], formula.x */
export function propRef(id: string): string {
  const key = propKey(id);
  if (id.startsWith('file.') || id.startsWith('formula.')) {
    const [ns, ...rest] = id.split('.');
    const name = rest.join('.');
    return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(name) ? `${ns}.${name}` : `${ns}[${JSON.stringify(name)}]`;
  }
  return /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(key) && !/^(and|or|not|e|ou|true|false|null|file|formula|note|this|if|se)$/i.test(key)
    ? key
    : `note[${JSON.stringify(key)}]`;
}

const lit = (v: string) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? v.trim() : /^(true|false)$/.test(v.trim()) ? v.trim() : JSON.stringify(v));

export function simpleToExpr(f: SimpleFilter): string {
  const p = propRef(f.prop);
  const v = lit(f.value);
  switch (f.op) {
    case 'is': return `${p} == ${v}`;
    case 'isnt': return `${p} != ${v}`;
    case 'contains': return `${p}.contains(${JSON.stringify(f.value)})`;
    case 'notContains': return `!${p}.contains(${JSON.stringify(f.value)})`;
    case 'startsWith': return `${p}.startsWith(${JSON.stringify(f.value)})`;
    case 'gt': return `${p} > ${v}`;
    case 'lt': return `${p} < ${v}`;
    case 'gte': return `${p} >= ${v}`;
    case 'lte': return `${p} <= ${v}`;
    case 'empty': return `${p}.isEmpty()`;
    case 'filled': return `!${p}.isEmpty()`;
    case 'checked': return `${p} == true`;
    case 'unchecked': return `${p} != true`;
    case 'today': return `${p} == today()`;
    case 'past': return `${p} < today()`;
    case 'next7': return `${p} >= today() && ${p} <= today() + "7d"`;
  }
}

const REF = String.raw`(note\[(?:"(?:[^"\\]|\\.)*")\]|(?:file|formula)\[(?:"(?:[^"\\]|\\.)*")\]|(?:file|formula)\.[\p{L}\p{N}_$]+|[\p{L}_$][\p{L}\p{N}_$]*)`;
const VAL = String.raw`("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false)`;

function refToId(ref: string): string {
  const m = /^(note|file|formula)\[("(?:[^"\\]|\\.)*")\]$/.exec(ref);
  if (m) return `${m[1]}.${JSON.parse(m[2]!) as string}`;
  return propId(ref);
}

const unlit = (v: string) => (v.startsWith('"') ? (JSON.parse(v) as string) : v);

/** Lê de volta uma expressão que a tela montou; null se for expressão livre. */
export function exprToSimple(expr: string): SimpleFilter | null {
  const e = expr.trim();
  const tries: Array<[RegExp, FilterOp]> = [
    [new RegExp(`^${REF} >= today\\(\\) && \\1 <= today\\(\\) \\+ "7d"$`, 'u'), 'next7'],
    [new RegExp(`^${REF} == ${VAL}$`, 'u'), 'is'],
    [new RegExp(`^${REF} != ${VAL}$`, 'u'), 'isnt'],
    [new RegExp(`^!${REF}\\.contains\\(${VAL}\\)$`, 'u'), 'notContains'],
    [new RegExp(`^${REF}\\.contains\\(${VAL}\\)$`, 'u'), 'contains'],
    [new RegExp(`^${REF}\\.startsWith\\(${VAL}\\)$`, 'u'), 'startsWith'],
    [new RegExp(`^${REF} > ${VAL}$`, 'u'), 'gt'],
    [new RegExp(`^${REF} < ${VAL}$`, 'u'), 'lt'],
    [new RegExp(`^${REF} >= ${VAL}$`, 'u'), 'gte'],
    [new RegExp(`^${REF} <= ${VAL}$`, 'u'), 'lte'],
    [new RegExp(`^!${REF}\\.isEmpty\\(\\)$`, 'u'), 'filled'],
    [new RegExp(`^${REF}\\.isEmpty\\(\\)$`, 'u'), 'empty'],
    [new RegExp(`^${REF} == today\\(\\)$`, 'u'), 'today'],
    [new RegExp(`^${REF} < today\\(\\)$`, 'u'), 'past'],
  ];
  for (const [re, op] of tries) {
    const m = re.exec(e);
    if (!m) continue;
    let real: FilterOp = op;
    let value = m[2] !== undefined && op !== 'next7' ? unlit(m[2]) : '';
    if (op === 'is' && value === 'true' && m[2] === 'true') { real = 'checked'; value = ''; }
    if (op === 'isnt' && m[2] === 'true') { real = 'unchecked'; value = ''; }
    return { prop: refToId(m[1]!), op: real, value };
  }
  return null;
}
