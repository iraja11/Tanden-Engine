/*
 * Diário alimentar: uma nota por mês (Alimentação/Diário/2026-11.md), uma linha
 * por coisa comida e uma por pesagem:
 *
 *   - 2026-11-18 12:30 🍽 Almoço · Arroz branco cozido · 120 g · 154 kcal · P 3 · C 34 · G 0,2 · F 1,9
 *   - 2026-11-18 07:10 ⚖ 72,4 kg
 *
 * Linhas acrescentadas no fim se juntam sem conflito entre aparelhos, e dá para
 * escrever à mão: sem os números, o Tanden procura o alimento na tabela.
 */
import { ZERO_NUTRIENTS, addNutrients, foldText, foodByName, nutrientsOf, type Food, type Nutrients } from './alimentos';
import { MEAL_KINDS, mealLabel, recipeByName, recipeNutrients, type MealKind, type Recipe } from './receitas';

export const FOOD_DIR = 'Alimentação';
export const FOOD_DIARY_DIR = 'Alimentação/Diário';

export interface DiaryEntry extends Nutrients {
  /** AAAA-MM-DD */
  day: string;
  /** HH:MM */
  time: string;
  meal: MealKind;
  name: string;
  /** gramas, quando se sabe */
  grams: number | null;
  /** porções de receita (×1,5), quando é uma receita */
  factor: number | null;
  /** a linha exata da nota, para apagar */
  raw: string;
}

export interface WeightEntry {
  day: string;
  time: string;
  kg: number;
  raw: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const clockOf = (at: number): string => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayOf = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const foodDiaryPath = (at: number): string => `${FOOD_DIARY_DIR}/${dayOf(at).slice(0, 7)}.md`;

/** Número com vírgula e no máximo uma casa decimal. */
export const fmtNum = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');
/** Tamanho de porção: guarda as duas casas (×1,75). */
export const fmtFactor = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');
const toNum = (s: string) => Number(s.replace(',', '.'));

/** Refeição mais provável para uma hora do dia. */
export function mealAt(time: string, allowed: MealKind[] = MEAL_KINDS.map((m) => m.id)): MealKind {
  const hit = MEAL_KINDS.find((m) => allowed.includes(m.id) && time < m.until);
  return hit?.id ?? allowed[allowed.length - 1] ?? 'lanche';
}

function mealFromText(s: string): MealKind | null {
  const t = foldText(s);
  return MEAL_KINDS.find((m) => foldText(m.label) === t || m.id === t)?.id ?? (t === 'cafe' ? 'cafe' : null);
}

export function diaryLine(e: Omit<DiaryEntry, 'raw'>): string {
  const parts = [mealLabel(e.meal), e.name];
  if (e.factor !== null && e.factor !== 1) parts.push(`×${fmtFactor(e.factor)}`);
  if (e.grams !== null) parts.push(`${Math.round(e.grams)} g`);
  parts.push(`${Math.round(e.kcal)} kcal`, `P ${fmtNum(e.p)}`, `C ${fmtNum(e.c)}`, `G ${fmtNum(e.g)}`, `F ${fmtNum(e.f)}`);
  return `- ${e.day} ${e.time} 🍽 ${parts.join(' · ')}`;
}

export function entryFromFood(food: Pick<Food, 'name' | 'kcal' | 'p' | 'c' | 'g' | 'f'>, grams: number, meal: MealKind, at: number): Omit<DiaryEntry, 'raw'> {
  return { day: dayOf(at), time: clockOf(at), meal, name: food.name, grams, factor: null, ...nutrientsOf(food, grams) };
}

export function entryFromRecipe(r: Recipe, factor: number, meal: MealKind, at: number): Omit<DiaryEntry, 'raw'> {
  return { day: dayOf(at), time: clockOf(at), meal, name: r.name, grams: null, factor, ...recipeNutrients(r, factor) };
}

const LINE_RE = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+🍽️?\s*(.+?)\s*$/u;
const WEIGHT_RE = /^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+⚖️?\s*(\d+(?:[.,]\d+)?)\s*kg/iu;

export function parseDiaryLine(line: string): DiaryEntry | null {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const parts = m[3]!.split(/\s+·\s+/);
  const meal = mealFromText(parts[0] ?? '');
  const rest = meal ? parts.slice(1) : parts;
  const name = rest[0]?.trim();
  if (!name) return null;
  let grams: number | null = null;
  let factor: number | null = null;
  const n: Partial<Nutrients> = {};
  for (const token of rest.slice(1)) {
    const t = token.trim();
    let x: RegExpExecArray | null;
    if ((x = /^×\s*(\d+(?:[.,]\d+)?)$/.exec(t))) factor = toNum(x[1]!);
    else if ((x = /^(\d+(?:[.,]\d+)?)\s*g$/i.exec(t))) grams = toNum(x[1]!);
    else if ((x = /^(\d+(?:[.,]\d+)?)\s*kcal$/i.exec(t))) n.kcal = toNum(x[1]!);
    else if ((x = /^([PCGF])\s*(\d+(?:[.,]\d+)?)$/i.exec(t))) n[x[1]!.toLowerCase() as 'p' | 'c' | 'g' | 'f'] = toNum(x[2]!);
  }
  // linha escrita à mão: completa com a tabela
  let filled: Nutrients = { ...ZERO_NUTRIENTS, ...n };
  if (n.kcal === undefined) {
    const food = foodByName(name);
    const recipe = recipeByName(name);
    if (food) filled = nutrientsOf(food, grams ?? food.portion.grams);
    else if (recipe) filled = recipeNutrients(recipe, factor ?? 1);
  }
  const time = m[2]!.padStart(5, '0');
  return { day: m[1]!, time, meal: meal ?? mealAt(time), name, grams, factor, ...filled, raw: line };
}

export function parseDiary(text: string): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  for (const line of text.split('\n')) {
    const e = parseDiaryLine(line);
    if (e) out.push(e);
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
}

export function parseWeights(text: string): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (const line of text.split('\n')) {
    const m = WEIGHT_RE.exec(line);
    if (m) out.push({ day: m[1]!, time: m[2]!.padStart(5, '0'), kg: toNum(m[3]!), raw: line });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
}

export const weightLine = (kg: number, at: number): string => `- ${dayOf(at)} ${clockOf(at)} ⚖ ${fmtNum(kg)} kg`;

/** Acrescenta uma linha no fim da nota do mês (cria o título se a nota é nova). */
export function appendDiary(text: string, line: string, at: number): string {
  const head = text.trim() ? text.replace(/\n*$/, '\n') : `# Diário alimentar ${dayOf(at).slice(0, 7)}\n\n`;
  return `${head}${line}\n`;
}

/** Tira uma linha (a primeira igual) sem mexer no resto. */
export function removeDiaryLine(text: string, raw: string): string {
  const lines = text.split('\n');
  const i = lines.indexOf(raw);
  if (i >= 0) lines.splice(i, 1);
  return lines.join('\n');
}

export function totalsOf(entries: Array<Nutrients>): Nutrients {
  return entries.reduce<Nutrients>((a, e) => addNutrients(a, { kcal: e.kcal, p: e.p, c: e.c, g: e.g, f: e.f }), ZERO_NUTRIENTS);
}

export const entriesOfDay = (entries: DiaryEntry[], day: string): DiaryEntry[] => entries.filter((e) => e.day === day);

export interface FrequentFood {
  name: string;
  meal: MealKind;
  grams: number | null;
  factor: number | null;
  count: number;
  nutrients: Nutrients;
}

/** O que a pessoa mais come, para registrar com um toque. */
export function frequentFoods(entries: DiaryEntry[], limit = 8, meal?: MealKind): FrequentFood[] {
  const map = new Map<string, FrequentFood & { last: string }>();
  for (const e of entries) {
    const key = foldText(e.name);
    const stamp = `${e.day} ${e.time}`;
    const cur = map.get(key);
    const nutrients = { kcal: e.kcal, p: e.p, c: e.c, g: e.g, f: e.f };
    if (!cur) map.set(key, { name: e.name, meal: e.meal, grams: e.grams, factor: e.factor, count: 1, nutrients, last: stamp });
    else {
      cur.count++;
      if (stamp >= cur.last) Object.assign(cur, { meal: e.meal, grams: e.grams, factor: e.factor, nutrients, last: stamp });
    }
  }
  const score = (f: FrequentFood) => f.count + (meal && f.meal === meal ? 3 : 0);
  return [...map.values()].sort((a, b) => score(b) - score(a) || b.last.localeCompare(a.last)).slice(0, limit)
    .map(({ last: _last, ...f }) => f);
}
