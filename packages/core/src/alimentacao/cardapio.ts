/*
 * Cardápio da semana e lista de compras. Cada semana é uma nota comum
 * (Alimentação/Cardápios/2026-11-16.md, com a data da segunda-feira):
 *
 *   ## Segunda · 16/11
 *   - Café da manhã: Tapioca com queijo e tomate
 *   - Almoço: Arroz, feijão, frango e salada ×1,25
 *
 *   ## Lista de compras
 *   ### Hortifruti
 *   - [ ] Tomate: 1,2 kg
 *
 * Dá para trocar um prato à mão, inclusive por algo fora das receitas do Tanden.
 * Mesma semana e mesma semente geram o mesmo cardápio.
 */
import { parseProps, setProps, splitFrontmatter, withBody } from '../caderno/frontmatter';
import { addDays } from '../vida';
import { foldText, foodById, type Food, type FoodGroup } from './alimentos';
import { fmtFactor, fmtNum } from './diario';
import { foodTargets, mealShares, type FoodProfile, type FoodTargets } from './perfil';
import { MEAL_KINDS, RECIPES, mealLabel, recipeAllowed, recipeByName, recipeNutrients, type MealKind, type Recipe } from './receitas';

export const MENU_DIR = 'Alimentação/Cardápios';
export const menuPath = (monday: string): string => `${MENU_DIR}/${monday}.md`;

export const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export interface MenuItem {
  meal: MealKind;
  /** nome como está na nota */
  name: string;
  /** receita do Tanden, quando o nome é conhecido */
  recipeId: string | null;
  factor: number;
}

export interface MenuDay {
  /** AAAA-MM-DD */
  day: string;
  items: MenuItem[];
}

export interface Menu {
  monday: string;
  days: MenuDay[];
}

const FACTORS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Gerador pequeno e repetível. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Receitas que a pessoa pode comer nesta refeição. */
export function recipesFor(meal: MealKind, p: Pick<FoodProfile, 'restrictions' | 'dislikes'>): Recipe[] {
  return RECIPES.filter((r) => r.meals.includes(meal) && recipeAllowed(r, p.restrictions, p.dislikes));
}

/** Tamanho da porção que deixa a receita mais perto das calorias pedidas. */
export function bestFactor(r: Recipe, kcal: number): number {
  const base = recipeNutrients(r).kcal || 1;
  return FACTORS.reduce((best, f) => (Math.abs(base * f - kcal) < Math.abs(base * best - kcal) ? f : best), 1);
}

/** Monta a semana: acerta as calorias de cada refeição e evita repetir pratos. */
export function generateMenu(p: FoodProfile, monday: string, seed = '', targets: FoodTargets = foodTargets(p)): Menu {
  const rand = rng(`${monday}|${seed}`);
  const shares = mealShares(p.meals);
  const lastUsed = new Map<string, number>();
  const days: MenuDay[] = [];
  for (let d = 0; d < 7; d++) {
    const items: MenuItem[] = [];
    for (const m of MEAL_KINDS) {
      if (!p.meals.includes(m.id)) continue;
      const want = targets.kcal * shares[m.id];
      const wantP = targets.p * shares[m.id];
      const pool = recipesFor(m.id, p);
      if (!pool.length) continue;
      const gap = m.id === 'almoco' || m.id === 'jantar' ? 4 : 2;
      let best: Recipe | null = null;
      let bestScore = Infinity;
      for (const r of pool) {
        const factor = bestFactor(r, want);
        const n = recipeNutrients(r, factor);
        const since = d - (lastUsed.get(r.id) ?? -99);
        const repeat = since < gap ? 3 * (gap - since) : 0;
        const score = Math.abs(n.kcal - want) / Math.max(want, 1) + Math.max(0, wantP - n.p) / Math.max(wantP, 1) * 0.6 + repeat + rand() * 0.45;
        if (score < bestScore) {
          bestScore = score;
          best = r;
        }
      }
      if (!best) continue;
      lastUsed.set(best.id, d);
      items.push({ meal: m.id, name: best.name, recipeId: best.id, factor: bestFactor(best, want) });
    }
    days.push({ day: addDays(monday, d), items });
  }
  return { monday, days };
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export const menuItemLine = (it: MenuItem): string => `- ${mealLabel(it.meal)}: ${it.name}${it.factor !== 1 ? ` ×${fmtFactor(it.factor)}` : ''}`;

const SHOP_HEAD = '## Lista de compras';

function menuBody(menu: Menu): string {
  const lines = [`# Cardápio · ${dm(menu.monday)} a ${dm(addDays(menu.monday, 6))}`, ''];
  menu.days.forEach((d, i) => {
    lines.push(`## ${WEEKDAY_NAMES[i]} · ${dm(d.day)}`, ...d.items.map(menuItemLine), '');
  });
  return lines.join('\n');
}

/** Nota inteira da semana: cardápio mais a lista de compras. */
export function menuNote(menu: Menu, people = 1, previous = ''): string {
  const list = shoppingFromMenu(menu, people);
  const kept = parseShopping(previous);
  const merged = mergeShopping(list, kept);
  return setProps(`${menuBody(menu)}\n${shoppingBlock(merged)}`, { tipo: 'cardápio', semana: menu.monday, tags: ['cardapio'] });
}

export function parseMenu(text: string, fallbackMonday = ''): Menu {
  const props = parseProps(text);
  const raw = props.semana;
  const monday = (Array.isArray(raw) ? raw[0] : raw)?.trim() || fallbackMonday;
  const days: MenuDay[] = Array.from({ length: 7 }, (_, i) => ({ day: monday ? addDays(monday, i) : '', items: [] }));
  let cur: MenuDay | null = null;
  for (const line of splitFrontmatter(text).body.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const word = foldText(h[1]!.split('·')[0] ?? '');
      const i = WEEKDAY_NAMES.findIndex((w) => foldText(w) === word || word.startsWith(foldText(w).slice(0, 3)));
      cur = i >= 0 ? days[i]! : null;
      continue;
    }
    if (!cur) continue;
    const m = /^\s*[-*+]\s+(?!\[[ xX]\])([^:]+):\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const meal = MEAL_KINDS.find((k) => foldText(k.label) === foldText(m[1]!))?.id;
    if (!meal) continue;
    const fm = /^(.*?)\s*×\s*(\d+(?:[.,]\d+)?)$/.exec(m[2]!);
    const name = (fm ? fm[1]! : m[2]!).trim();
    cur.items.push({ meal, name, recipeId: recipeByName(name)?.id ?? null, factor: fm ? Number(fm[2]!.replace(',', '.')) || 1 : 1 });
  }
  return { monday, days };
}

/** Troca o prato de uma refeição de um dia, mantendo o resto da nota igual. */
export function setMenuItem(text: string, dayIndex: number, item: MenuItem): string {
  const lines = text.split('\n');
  let inDay = false;
  let lastOfDay = -1;
  for (let k = 0; k < lines.length; k++) {
    const h = /^##\s+(.+?)\s*$/.exec(lines[k]!);
    if (h) {
      if (inDay) break;
      inDay = foldText(h[1]!.split('·')[0] ?? '') === foldText(WEEKDAY_NAMES[dayIndex]!);
      if (inDay) lastOfDay = k;
      continue;
    }
    if (!inDay) continue;
    const m = /^\s*[-*+]\s+(?!\[[ xX]\])([^:]+):/.exec(lines[k]!);
    if (!m) continue;
    lastOfDay = k;
    if (foldText(m[1]!) === foldText(mealLabel(item.meal))) {
      lines[k] = menuItemLine(item);
      return lines.join('\n');
    }
  }
  if (lastOfDay >= 0) lines.splice(lastOfDay + 1, 0, menuItemLine(item));
  return lines.join('\n');
}

/** Outro prato para a mesma refeição, com porção ajustada. Null se não há opção. */
export function swapMenuItem(menu: Menu, dayIndex: number, meal: MealKind, p: FoodProfile, step = 1): MenuItem | null {
  const day = menu.days[dayIndex];
  const cur = day?.items.find((x) => x.meal === meal);
  if (!day) return null;
  const week = new Set(menu.days.flatMap((d) => d.items.map((x) => x.recipeId)));
  const pool = recipesFor(meal, p).filter((r) => r.id !== cur?.recipeId);
  if (!pool.length) return null;
  const fresh = pool.filter((r) => !week.has(r.id));
  const list = fresh.length ? fresh : pool;
  const want = foodTargets(p).kcal * mealShares(p.meals)[meal];
  const sorted = [...list].sort((a, b) => Math.abs(recipeNutrients(a, bestFactor(a, want)).kcal - want) - Math.abs(recipeNutrients(b, bestFactor(b, want)).kcal - want) || a.id.localeCompare(b.id));
  const pick = sorted[Math.abs(step - 1) % Math.min(sorted.length, 6)]!;
  return { meal, name: pick.name, recipeId: pick.id, factor: bestFactor(pick, want) };
}

// ------------------------------------------------------------------ compras

export type Aisle = 'Hortifruti' | 'Açougue e peixaria' | 'Frios, ovos e laticínios' | 'Padaria' | 'Mercearia' | 'Outros';

const AISLE_ORDER: Aisle[] = ['Hortifruti', 'Açougue e peixaria', 'Frios, ovos e laticínios', 'Padaria', 'Mercearia', 'Outros'];

const AISLE_OF: Record<FoodGroup, Aisle> = {
  verduras: 'Hortifruti', frutas: 'Hortifruti', carnes: 'Açougue e peixaria', peixes: 'Açougue e peixaria', ovos: 'Frios, ovos e laticínios',
  laticinios: 'Frios, ovos e laticínios', paes: 'Padaria', cereais: 'Mercearia', leguminosas: 'Mercearia', gorduras: 'Mercearia',
  oleaginosas: 'Mercearia', doces: 'Mercearia', prontos: 'Mercearia', bebidas: 'Mercearia',
};

const FRESH_ROOTS = new Set(['batata-inglesa', 'batata-doce', 'mandioca', 'inhame']);

export interface ShoppingItem {
  name: string;
  /** "1,2 kg", "8 unidades" ou vazio para itens manuais */
  amount: string;
  aisle: Aisle;
  done: boolean;
}

function amountOf(food: Food, grams: number): string {
  if (food.unit) {
    const n = Math.ceil(grams / food.portion.grams - 0.01);
    return `${n} ${n === 1 ? 'unidade' : 'unidades'}`;
  }
  const step = grams >= 1000 ? 100 : grams >= 200 ? 50 : 10;
  const g = Math.ceil(grams / step) * step;
  return g >= 1000 ? `${fmtNum(g / 1000)} kg` : `${g} g`;
}

/** Soma os ingredientes da semana, já em quantidade de compra (cru). */
export function shoppingFromMenu(menu: Menu, people = 1): ShoppingItem[] {
  const sum = new Map<string, { food: Food; grams: number }>();
  for (const d of menu.days) {
    for (const it of d.items) {
      const r = it.recipeId ? RECIPES.find((x) => x.id === it.recipeId) : undefined;
      if (!r) continue;
      for (const [id, g] of r.items) {
        const food = foodById(id);
        if (!food) continue;
        const key = food.buy?.name ?? food.name;
        const grams = g * it.factor * people * (food.buy?.factor ?? 1);
        const cur = sum.get(key);
        if (cur) cur.grams += grams;
        else sum.set(key, { food, grams });
      }
    }
  }
  return [...sum.entries()]
    .map(([name, { food, grams }]): ShoppingItem => ({
      name,
      amount: amountOf(food, grams),
      aisle: FRESH_ROOTS.has(food.id) ? 'Hortifruti' : AISLE_OF[food.group],
      done: false,
    }))
    .sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name, 'pt-BR'));
}

/** Mantém o que já foi marcado e os itens que a pessoa acrescentou. */
function mergeShopping(fresh: ShoppingItem[], kept: ShoppingItem[]): ShoppingItem[] {
  const seen = new Map(kept.map((k) => [foldText(k.name), k]));
  const out = fresh.map((x) => ({ ...x, done: seen.get(foldText(x.name))?.done ?? false }));
  const names = new Set(out.map((x) => foldText(x.name)));
  for (const k of kept) if (k.aisle === 'Outros' && !names.has(foldText(k.name))) out.push(k);
  return out;
}

const itemLine = (x: ShoppingItem) => `- [${x.done ? 'x' : ' '}] ${x.name}${x.amount ? `: ${x.amount}` : ''}`;

function shoppingBlock(items: ShoppingItem[]): string {
  const lines = [SHOP_HEAD, ''];
  for (const aisle of AISLE_ORDER) {
    const group = items.filter((x) => x.aisle === aisle);
    if (!group.length) continue;
    lines.push(`### ${aisle}`, ...group.map(itemLine), '');
  }
  return lines.join('\n');
}

export function parseShopping(text: string): ShoppingItem[] {
  const out: ShoppingItem[] = [];
  let inside = false;
  let aisle: Aisle = 'Outros';
  for (const line of splitFrontmatter(text).body.split('\n')) {
    if (/^##\s/.test(line)) {
      inside = line.trim() === SHOP_HEAD;
      continue;
    }
    if (!inside) continue;
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      aisle = AISLE_ORDER.find((a) => foldText(a) === foldText(h[1]!)) ?? 'Outros';
      continue;
    }
    const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const i = m[2]!.lastIndexOf(': ');
    out.push({ name: (i > 0 ? m[2]!.slice(0, i) : m[2]!).trim(), amount: i > 0 ? m[2]!.slice(i + 2).trim() : '', aisle, done: m[1] !== ' ' });
  }
  return out;
}

/** Reescreve só a seção de compras da nota. */
function replaceShopping(text: string, items: ShoppingItem[]): string {
  const { body } = splitFrontmatter(text);
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === SHOP_HEAD);
  const before = (start >= 0 ? lines.slice(0, start) : lines).join('\n').replace(/\s*$/, '');
  let after = '';
  if (start >= 0) {
    const end = lines.findIndex((l, k) => k > start && /^##\s/.test(l));
    if (end >= 0) after = `\n${lines.slice(end).join('\n')}`;
  }
  return withBody(text, `${before}\n\n${shoppingBlock(items).replace(/\s*$/, '\n')}${after}`);
}

export function toggleShopping(text: string, name: string): string {
  const items = parseShopping(text).map((x) => (foldText(x.name) === foldText(name) ? { ...x, done: !x.done } : x));
  return replaceShopping(text, items);
}

export function addShoppingItem(text: string, name: string): string {
  const clean = name.trim();
  const items = parseShopping(text);
  if (!clean || items.some((x) => foldText(x.name) === foldText(clean))) return text;
  return replaceShopping(text, [...items, { name: clean, amount: '', aisle: 'Outros', done: false }]);
}

export function removeShoppingItem(text: string, name: string): string {
  return replaceShopping(text, parseShopping(text).filter((x) => foldText(x.name) !== foldText(name)));
}

/** Refaz as quantidades a partir do cardápio atual, guardando o que foi marcado. */
export function refreshShopping(text: string, people = 1): string {
  return replaceShopping(text, mergeShopping(shoppingFromMenu(parseMenu(text), people), parseShopping(text)));
}
