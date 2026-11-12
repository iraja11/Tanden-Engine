import { asList, asText, bodyOf, parseProps, type Props } from '../caderno/frontmatter';
import { getSection, linkTarget, readRecords, sameTitle, writeRecords, type Rec } from '../caderno/markdown';
import { parseMoney } from './coins';
import { findPropKey } from './sheet';

/*
 * Inventário e cartas de item.
 *
 * O inventário é uma tabela na ficha:
 *
 *   ## Inventário
 *   | Item              | Qtd | Peso | Notas     |
 *   | [[Espada Longa]]  | 1   | 1,5  | equipada  |
 *   | Corda (15 m)      | 1   | 5    |           |
 *
 * Um item com [[link]] aponta para uma nota de item (tipo: item), que vira
 * uma carta com raridade, dano, valor, imagem e descrição:
 *
 *   tipo: item
 *   raridade: raro
 *   categoria: arma
 *   dano: 1d8+1 cortante
 *   valor: 500 po
 *   peso: 1,5
 *   sintonização: sim
 *   imagem: "[[espada.png]]"
 */

export interface InventoryItem {
  name: string;
  /** alvo do [[link]], se o item tem nota */
  link: string | null;
  qty: number;
  /** peso de uma unidade, em kg (null se não informado) */
  weight: number | null;
  notes: string;
  _i?: number;
}

const COLS = {
  name: ['Item', 'Nome', 'Objeto'],
  qty: ['Qtd', 'Qtd.', 'Quantidade', 'Qty'],
  weight: ['Peso', 'Peso (kg)', 'Weight'],
  notes: ['Notas', 'Obs', 'Observações', 'Notes'],
};
type Col = keyof typeof COLS;

export const INVENTORY = 'Inventário';

const num = (s: string): number | null => {
  const m = /^\s*(\d+(?:[.,]\d+)?)/.exec(s);
  return m ? Number(m[1]!.replace(',', '.')) : null;
};
const fmtNum = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/** Alvo de um [[link]] ("[[Espada|minha espada]]" → "Espada"), ou null. */
export function linkOf(cell: string): string | null {
  const m = /^\s*!?\[\[([^\]]+)\]\]\s*$/.exec(cell);
  return m ? linkTarget(m[1]!) : null;
}

/** Nome para mostrar: o apelido do link, ou o texto. */
export const itemLabel = (cell: string): string => {
  const m = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(cell);
  if (!m) return cell.trim();
  const [target, alias] = m[1]!.split('|');
  return (alias ?? target!.split('/').pop()!.split('#')[0]!).trim();
};

export function readInventory(text: string): InventoryItem[] {
  return readRecords(text, INVENTORY, COLS).filter((r) => r.name.trim()).map((r) => ({
    name: r.name.trim(),
    link: linkOf(r.name),
    qty: num(r.qty) ?? 1,
    weight: num(r.weight),
    notes: r.notes.trim(),
    _i: r._i,
  }));
}

export function writeInventory(text: string, items: InventoryItem[]): string {
  const recs = items.map((it): Rec<Col> => ({
    name: it.name,
    qty: String(it.qty),
    weight: it.weight === null ? '' : fmtNum(it.weight),
    notes: it.notes,
    ...(it._i !== undefined ? { _i: it._i } : {}),
  }));
  return writeRecords(text, INVENTORY, COLS, recs);
}

/** Acrescenta (ou soma na quantidade, se já existe com o mesmo nome). */
export function addItem(items: InventoryItem[], it: Omit<InventoryItem, '_i'>): InventoryItem[] {
  const i = items.findIndex((x) => sameTitle(itemLabel(x.name), itemLabel(it.name)));
  if (i < 0) return [...items, it];
  return items.map((x, j) => (j === i ? { ...x, qty: x.qty + it.qty } : x));
}

/** Muda a quantidade; zero tira o item da lista. */
export function changeQty(items: InventoryItem[], index: number, delta: number): InventoryItem[] {
  return items.flatMap((x, i) => (i !== index ? [x] : x.qty + delta <= 0 ? [] : [{ ...x, qty: x.qty + delta }]));
}

/** Peso total (kg). Itens sem peso contam zero. */
export const inventoryWeight = (items: InventoryItem[]): number =>
  items.reduce((s, x) => s + (x.weight ?? 0) * x.qty, 0);

/** Carga (5e, em kg): Força × 7,5. Acima de Força × 2,5 já pesa (regra opcional de carga). */
export function carryCapacity(strength: number): { max: number; encumbered: number; heavy: number } {
  return { max: strength * 7.5, encumbered: strength * 2.5, heavy: strength * 5 };
}

// ---------------------------------------------------------------- cartas

export type Rarity = 'comum' | 'incomum' | 'raro' | 'muito raro' | 'lendário' | 'artefato';
export const RARITIES: Rarity[] = ['comum', 'incomum', 'raro', 'muito raro', 'lendário', 'artefato'];

/** "Very rare", "muito-raro", "Lendario" → raridade conhecida; o resto vira comum. */
export function rarityOf(s: string): Rarity {
  const t = s.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[-_]/g, ' ');
  if (/artefat|artifact/.test(t)) return 'artefato';
  if (/lend|legend/.test(t)) return 'lendário';
  if (/muito raro|very rare/.test(t)) return 'muito raro';
  if (/^raro|^rare/.test(t)) return 'raro';
  if (/incomum|uncommon/.test(t)) return 'incomum';
  return 'comum';
}

export interface ItemCard {
  name: string;
  rarity: Rarity;
  /** arma, armadura, poção, maravilhoso... */
  category: string;
  damage: string;
  ac: string;
  /** valor em cobre (null se não tem) e como estava escrito */
  value: number | null;
  valueText: string;
  weight: number | null;
  attunement: boolean;
  properties: string[];
  /** alvo da imagem (arquivo do cofre ou endereço) */
  image: string | null;
  description: string;
  /** cargas: restantes e máximo (varinhas, cajados...) */
  charges: { left: number; max: number | null } | null;
}

const ITEM_FIELDS = {
  rarity: ['raridade', 'rarity'],
  category: ['categoria', 'tipo de item', 'category', 'subtipo'],
  damage: ['dano', 'damage'],
  ac: ['ca', 'ac', 'defesa', 'bônus de ca'],
  value: ['valor', 'preço', 'preco', 'custo', 'value', 'price', 'cost'],
  weight: ['peso', 'weight'],
  attune: ['sintonização', 'sintonizacao', 'sintonia', 'attunement'],
  props: ['propriedades', 'properties'],
  charges: ['cargas', 'charges'],
};

/** Imagem da nota: `imagem`, `retrato`, `capa`, `image`... aceita [[arquivo]], ![[arquivo]] ou endereço. */
export function imageOf(props: Props): string | null {
  const k = findPropKey(props, ['imagem', 'retrato', 'capa', 'image', 'portrait', 'cover', 'img', 'foto']);
  const v = k ? asText(props[k]).trim() : '';
  if (!v) return null;
  return linkOf(v) ?? (v.replace(/^<|>$/g, '') || null);
}

/** Primeiro parágrafo de "Descrição" (ou do texto). */
function describe(text: string): string {
  const sec = getSection(text, 'Descrição') ?? getSection(text, 'Description') ?? bodyOf(text);
  const para: string[] = [];
  for (const raw of sec.split('\n')) {
    const l = raw.trim();
    if (/^(#|\||```|!\[)/.test(l)) {
      if (para.length) break;
      continue;
    }
    if (!l) {
      if (para.length) break;
      continue;
    }
    para.push(l.replace(/^[-*+]\s+/, '').replace(/^>\s?/, ''));
  }
  const s = para.join(' ').replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/[*_`]/g, '');
  return s.length > 320 ? `${s.slice(0, 317).trimEnd()}…` : s;
}

export function readItemCard(name: string, text: string): ItemCard {
  const props = parseProps(text);
  const get = (f: keyof typeof ITEM_FIELDS) => {
    const k = findPropKey(props, ITEM_FIELDS[f]);
    return k ? asText(props[k]).trim() : '';
  };
  const valueText = get('value');
  const attune = get('attune').toLowerCase();
  const pk = findPropKey(props, ITEM_FIELDS.props);
  return {
    name,
    rarity: rarityOf(get('rarity')),
    category: get('category'),
    damage: get('damage'),
    ac: get('ac'),
    value: valueText ? parseMoney(valueText) : null,
    valueText,
    weight: num(get('weight')),
    attunement: !!attune && !/^(n[aã]o|no|false|-)$/.test(attune),
    properties: pk ? asList(props[pk]).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean) : [],
    image: imageOf(props),
    description: describe(text),
    charges: (() => {
      const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?/.exec(get('charges'));
      return m ? { left: Number(m[1]), max: m[2] ? Number(m[2]) : null } : null;
    })(),
  };
}

/** Nota nova de item, pronta para virar carta. */
export function itemTemplate(name: string, opts: { rarity?: Rarity; category?: string; world?: string } = {}): string {
  return `---
tipo: item${opts.world ? `\nmundo: ${opts.world}` : ''}
raridade: ${opts.rarity ?? 'comum'}
categoria: ${opts.category ?? ''}
valor: 
peso: 
imagem: 
---
# ${name}

## Descrição

`;
}

export interface NewItem {
  name: string;
  rarity: Rarity;
  category: string;
  value: string;
  weight: string;
  damage: string;
  ac: string;
  attunement: boolean;
  properties: string;
  /** "3/7" ou "7" */
  charges: string;
  /** caminho do arquivo da imagem no cofre */
  image: string;
  description: string;
  world?: string;
}

/** Nota completa de um item especial (o Obsidian lê as propriedades normalmente). */
export function itemNote(it: NewItem): string {
  const lines = ['---', 'tipo: item'];
  if (it.world) lines.push(`mundo: ${it.world}`);
  const add = (k: string, v: string) => { if (v.trim()) lines.push(`${k}: ${/[:#]|^[\[{"'!&*@]/.test(v.trim()) && !/^\[\[.*\]\]$/.test(v.trim()) ? JSON.stringify(v.trim()) : v.trim()}`); };
  lines.push(`raridade: ${it.rarity}`);
  add('categoria', it.category);
  add('valor', it.value);
  add('peso', it.weight.replace(/\s*kg$/i, ''));
  add('dano', it.damage);
  add('ca', it.ac);
  if (it.attunement) lines.push('sintonização: sim');
  const props = it.properties.split(',').map((x) => x.trim()).filter(Boolean);
  if (props.length) lines.push('propriedades:', ...props.map((x) => `  - ${x}`));
  add('cargas', it.charges);
  if (it.image.trim()) lines.push(`imagem: "[[${it.image.trim()}]]"`);
  lines.push('---', `# ${it.name}`, '', '## Descrição', '', it.description.trim(), '');
  return lines.join('\n');
}
