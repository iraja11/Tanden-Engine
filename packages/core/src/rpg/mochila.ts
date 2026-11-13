import { asList, asText, parseProps, setProps, type PropValue } from '../caderno/frontmatter';
import { getSection, sameTitle, setSection } from '../caderno/markdown';
import { catalogCard, catalogEntry, magicBonus, type CatalogEntry, type ItemKind } from './catalogo';
import { readAttackRows, readCharacter, writeAttackRows, type AttackRow } from './ficha';
import {
  addItem, changeQty, itemLabel, readInventory, readItemCard, rarityOf, writeInventory, type InventoryItem, type ItemCard, type NewItem,
} from './items';
import { applyHp, readSheet, splitDamage } from './sheet';

/*
 * O que se faz com os itens da mochila: equipar (a arma vira ataque, a
 * armadura muda a CA, o escudo dá +2), sintonizar, usar consumíveis
 * (poção cura), gastar cargas, passar para outro personagem e editar a
 * nota de um item especial. Tudo grava na ficha e nas notas de item.
 */

export interface ItemInfo {
  label: string;
  kind: ItemKind;
  card: ItemCard;
  /** item do catálogo (comum), se for um */
  entry: CatalogEntry | null;
  /** tem nota própria */
  hasNote: boolean;
}

/** Tipo de item pela entrada do catálogo ou pela categoria escrita na nota. */
export function kindOf(card: ItemCard, entry: CatalogEntry | null): ItemKind {
  if (entry) return entry.kind;
  const c = `${card.category} ${card.name}`.toLowerCase();
  if (/escudo|shield|broquel/.test(c)) return 'escudo';
  if (/armadura|armor|cota|placas|couraça|peitoral|brunea|gibão/.test(c)) return 'armadura';
  if (/arma|weapon|espada|machad|adaga|arco|besta|lan[cç]a|martelo|ma[cç]a|cimitarra|rapieira|glaive|alabarda|tridente|chicote/.test(c)) return 'arma';
  if (/po[cç][aã]o|potion|elixir|consum|pergaminho|scroll|ra[cç][aã]o/.test(c)) return 'consumível';
  if (/muni[cç][aã]o|flecha|virote|ammo/.test(c)) return 'munição';
  if (/ferramenta|tool|kit/.test(c)) return 'ferramenta';
  if (/foco|focus|s[ií]mbolo|varinha|cajado|bast[aã]o|orbe/.test(c)) return 'foco';
  return 'equipamento';
}

/**
 * Tudo sobre um item da mochila. `noteCard` é a carta da nota do item
 * (quando o item tem [[link]] para uma nota); sem nota, vale o catálogo.
 */
export function itemInfo(it: Pick<InventoryItem, 'name' | 'link'>, noteCard: ItemCard | null): ItemInfo {
  const label = itemLabel(it.name);
  const entry = catalogEntry(label);
  if (noteCard) {
    // nota com campos vazios herda do catálogo (uma "Espada Longa +1" só com raridade e foto ainda tem dano)
    const base = entry ? catalogCard(entry, label) : null;
    const card: ItemCard = base ? {
      ...noteCard,
      category: noteCard.category || base.category,
      damage: noteCard.damage || base.damage,
      ac: noteCard.ac || base.ac,
      weight: noteCard.weight ?? base.weight,
      value: noteCard.value ?? base.value,
      valueText: noteCard.valueText || base.valueText,
      properties: noteCard.properties.length ? noteCard.properties : base.properties,
      description: noteCard.description || base.description,
      heal: noteCard.heal || base.heal,
    } : noteCard;
    return { label, kind: kindOf(card, entry), card, entry, hasNote: true };
  }
  const card = entry ? catalogCard(entry, label) : {
    name: label, rarity: rarityOf(''), category: '', damage: '', ac: '', value: null, valueText: '', weight: null, attunement: false,
    properties: [], image: null, description: '', charges: null, heal: '',
  };
  return { label, kind: kindOf(card, entry), card, entry, hasNote: false };
}

// ---------------------------------------------------------------- armas

/** Ataque de uma arma: acerto e dano em fórmula, com o atributo certo (Acuidade, distância) e o bônus mágico. */
export function weaponAttack(info: Pick<ItemInfo, 'label' | 'card'>, mods: { for: number; des: number }): AttackRow {
  const props = info.card.properties.map((p) => p.toLowerCase());
  const finesse = props.some((p) => p.startsWith('acuidade') || p.startsWith('finesse'));
  const ranged = /dist[aâ]ncia|ranged/i.test(info.card.category) || props.some((p) => p.startsWith('munição') || p.startsWith('ammunition'));
  const attr = ranged ? 'des' : finesse ? (mods.des >= mods.for ? 'des' : 'for') : 'for';
  const bonus = magicBonus(info.label);
  const b = bonus ? `+${bonus}` : '';
  const d = splitDamage(info.card.damage);
  const dice = d.formula.replace(/\s+/g, '');
  const type = d.type;
  const damage = dice ? `${dice}+@${attr}${/[+-]\d+$/.test(dice) ? '' : b} ${type}`.trim() : '';
  const notes = info.card.properties.filter((p) => !/^maestria/i.test(p)).join(', ');
  const mastery = info.card.properties.find((p) => /^maestria/i.test(p));
  return { name: info.label, hit: `@${attr}+@prof${b}`, damage, notes: [notes, mastery].filter(Boolean).join(' · ') };
}

// ---------------------------------------------------------------- equipar

/**
 * Equipa (ou guarda) o item `index` da mochila da ficha `text`:
 * arma → linha em "## Ataques"; armadura → `armadura vestida` (e guarda a
 * anterior); escudo → `escudo: sim`. Devolve o texto novo da ficha.
 */
export function equipItem(text: string, index: number, info: ItemInfo, on: boolean): string {
  let items = readInventory(text);
  if (!items[index]) return text;
  const c = readCharacter(text);
  // só uma armadura e um escudo por vez
  const sameKind = (i: number) => {
    const x = items[i]!;
    const e = catalogEntry(itemLabel(x.name));
    return (e?.kind ?? (/escudo|shield/i.test(x.name) ? 'escudo' : null)) === info.kind;
  };
  items = items.map((x, i) => (i === index ? { ...x, equipped: on } : on && (info.kind === 'armadura' || info.kind === 'escudo') && x.equipped && sameKind(i) ? { ...x, equipped: false } : x));
  let out = writeInventory(text, items);
  const patch: Record<string, PropValue | null> = {};
  if (info.kind === 'armadura') {
    if (on) patch[c.keys.armor] = info.label;
    else if (sameTitle(c.armor, info.label)) patch[c.keys.armor] = null;
  } else if (info.kind === 'escudo') {
    patch[c.keys.shield] = on ? 'sim' : null;
  } else if (info.kind === 'arma' && info.card.damage) {
    const rows = readAttackRows(out).filter((r) => !sameTitle(r.name, info.label));
    const mod = (k: string) => c.sheet.attrs.find((a) => a.key === k)?.mod ?? 0;
    out = writeAttackRows(out, on ? [...rows, weaponAttack(info, { for: mod('for'), des: mod('des') })] : rows);
  }
  return Object.keys(patch).length ? setProps(out, patch) : out;
}

// ---------------------------------------------------------------- sintonização

/** Liga/desliga a sintonização (no máximo 3). `full` quando já há 3 e não deu para sintonizar. */
export function attuneItem(text: string, label: string, on: boolean): { text: string; full: boolean } {
  const c = readCharacter(text);
  const cur = asList(parseProps(text)[c.keys.attunement]).flatMap((x) => x.split(',')).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);
  const has = cur.some((x) => sameTitle(x, label));
  if (on && has) return { text, full: false };
  if (on && cur.length >= 3) return { text, full: true };
  const next = on ? [...cur, label] : cur.filter((x) => !sameTitle(x, label));
  return { text: setProps(text, { [c.keys.attunement]: next.length ? next : null }), full: false };
}

export function isAttuned(text: string, label: string): boolean {
  return readCharacter(text).attunement.some((x) => sameTitle(x, label));
}

// ---------------------------------------------------------------- usar

/** Usa um consumível: −1 na quantidade e, se curou, soma nos PV (até o máximo). */
export function consumeItem(text: string, index: number, heal = 0): string {
  const items = readInventory(text);
  if (!items[index]) return text;
  let out = writeInventory(text, changeQty(items, index, -1));
  if (heal > 0) {
    const s = readSheet(out);
    const c = readCharacter(out);
    const max = s.hpMax ?? c.hpMaxAuto;
    const r = applyHp({ hp: s.hp ?? max, hpMax: max, hpTemp: s.hpTemp }, -heal);
    const patch: Record<string, PropValue | null> = { [s.keys.hp]: String(r.hp) };
    // voltar a ter PV zera os testes contra a morte
    if ((s.hp ?? 1) <= 0 && r.hp > 0) Object.assign(patch, { [c.keys.deathSuccess]: null, [c.keys.deathFail]: null });
    out = setProps(out, patch);
  }
  return out;
}

/** Cargas da nota do item: muda as restantes (entre 0 e o máximo). */
export function setCharges(itemText: string, left: number): string {
  const props = parseProps(itemText);
  const key = Object.keys(props).find((k) => sameTitle(k, 'cargas') || sameTitle(k, 'charges')) ?? 'cargas';
  const m = /^\s*\d+\s*(?:\/\s*(\d+))?/.exec(asText(props[key]));
  const max = m?.[1] ? Number(m[1]) : null;
  const n = Math.max(0, max !== null ? Math.min(max, left) : left);
  return setProps(itemText, { [key]: max !== null ? `${n}/${max}` : String(n) });
}

// ---------------------------------------------------------------- passar adiante

/**
 * Passa `qty` unidades do item `index` da ficha `from` para a ficha `to`.
 * Se sair tudo e o item estava equipado, ele é guardado antes.
 */
export function transferItem(from: string, to: string, index: number, qty: number, info?: ItemInfo): { from: string; to: string } {
  const items = readInventory(from);
  const it = items[index];
  if (!it) return { from, to };
  const n = Math.max(1, Math.min(it.qty, qty));
  let src = from;
  if (n >= it.qty && it.equipped && info) src = equipItem(src, index, info, false);
  src = writeInventory(src, changeQty(readInventory(src), index, -n));
  const dst = writeInventory(to, addItem(readInventory(to), { name: it.name, link: it.link, qty: n, weight: it.weight, notes: it.notes }));
  return { from: src, to: dst };
}

// ---------------------------------------------------------------- editar a nota do item

const FORGE_KEYS: Array<[keyof NewItem, string[]]> = [
  ['rarity', ['raridade', 'rarity']], ['category', ['categoria', 'category']], ['value', ['valor', 'preço', 'value']], ['weight', ['peso', 'weight']],
  ['damage', ['dano', 'damage']], ['ac', ['ca', 'ac']], ['charges', ['cargas', 'charges']], ['heal', ['cura', 'heal']], ['properties', ['propriedades', 'properties']],
];

const keyIn = (props: Record<string, PropValue>, aliases: string[]) => Object.keys(props).find((k) => aliases.some((a) => sameTitle(k, a)));

/** Lê a nota de um item nos campos da forja (para editar). */
export function forgeFromNote(name: string, text: string): NewItem {
  const props = parseProps(text);
  const card = readItemCard(name, text);
  const get = (aliases: string[]) => { const k = keyIn(props, aliases); return k ? asText(props[k]).trim() : ''; };
  const desc = getSection(text, 'Descrição');
  return {
    name, rarity: card.rarity, category: get(['categoria', 'category']), value: get(['valor', 'preço', 'value']), weight: get(['peso', 'weight']),
    damage: get(['dano', 'damage']), ac: get(['ca', 'ac']), attunement: card.attunement, properties: card.properties.join(', '),
    charges: get(['cargas', 'charges']), heal: get(['cura', 'heal']), image: card.image ?? '',
    description: (desc ?? card.description).replace(/^\n+|\n+$/g, ''),
  };
}

/** Grava os campos da forja numa nota de item que já existe (o resto da nota fica). */
export function updateItemNote(text: string, it: NewItem): string {
  const props = parseProps(text);
  const patch: Record<string, PropValue | null> = {};
  for (const [field, aliases] of FORGE_KEYS) {
    const k = keyIn(props, aliases) ?? aliases[0]!;
    const v = String(it[field] ?? '').trim();
    if (field === 'properties') {
      const list = v.split(',').map((x) => x.trim()).filter(Boolean);
      patch[k] = list.length ? list : null;
    } else patch[k] = v ? (field === 'weight' ? v.replace(/\s*kg$/i, '') : v) : null;
  }
  const att = keyIn(props, ['sintonização', 'sintonizacao', 'attunement']) ?? 'sintonização';
  patch[att] = it.attunement ? 'sim' : null;
  const img = keyIn(props, ['imagem', 'retrato', 'capa', 'image', 'foto']) ?? 'imagem';
  patch[img] = it.image.trim() ? `[[${it.image.trim()}]]` : null;
  // só apaga o que existe
  for (const [k, v] of Object.entries(patch)) if (v === null && !(k in props)) delete patch[k];
  let out = setProps(text, patch);
  if (it.description.trim() || getSection(out, 'Descrição') !== null) out = setSection(out, 'Descrição', it.description.trim());
  return out;
}

/** Valor total da mochila (em cobre), contando quantidades. */
export function inventoryValue(items: Array<{ qty: number; card: ItemCard | null }>): number {
  return items.reduce((s, x) => s + (x.card?.value ?? 0) * x.qty, 0);
}
