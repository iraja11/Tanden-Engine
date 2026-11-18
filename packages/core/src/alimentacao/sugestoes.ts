/*
 * Sugestões: o que comer agora, considerando o que já foi comido hoje, a hora,
 * as restrições, o que anda repetindo e, se a pessoa disser, o que tem em casa.
 * Também observa o dia e dá dicas curtas, sem julgar: comida não é nota de prova.
 */
import { FOODS, foldText, foodById, foodByName, type FoodGroup, type Nutrients } from './alimentos';
import { fmtNum, mealAt, totalsOf, type DiaryEntry } from './diario';
import { bestFactor, recipesFor } from './cardapio';
import { mealShares, type FoodProfile, type FoodTargets } from './perfil';
import { MEAL_KINDS, recipeByName, recipeNutrients, type MealKind, type Recipe } from './receitas';

export interface MealSuggestion {
  recipe: Recipe;
  factor: number;
  nutrients: Nutrients;
  /** por que esta receita, em frases curtas */
  reasons: string[];
  /** ingredientes que faltam em casa (só quando a despensa foi informada) */
  missing: string[];
  score: number;
}

export interface SuggestContext {
  profile: FoodProfile;
  targets: FoodTargets;
  /** o que foi comido hoje */
  todayEntries: DiaryEntry[];
  /** nomes comidos nos últimos dias, para variar */
  recentNames: string[];
  /** HH:MM */
  time: string;
  meal?: MealKind;
  /** o que há em casa, em texto livre */
  pantry?: string[];
  /** só receitas até estes minutos */
  maxMinutes?: number;
  limit?: number;
}

/** Temperos e básicos que não contam como "faltando". */
const STAPLES = new Set(['azeite', 'oleo', 'limao', 'manteiga', 'cebola']);

/** Quantas calorias cabem nesta refeição, dividindo o que resta entre as refeições que faltam. */
export function mealBudget(ctx: Pick<SuggestContext, 'profile' | 'targets' | 'todayEntries'>, meal: MealKind): number {
  const shares = mealShares(ctx.profile.meals);
  const eaten = totalsOf(ctx.todayEntries).kcal;
  const left = ctx.targets.kcal - eaten;
  const order = MEAL_KINDS.map((m) => m.id);
  const pending = ctx.profile.meals.filter((m) => order.indexOf(m) >= order.indexOf(meal) && (m === meal || !ctx.todayEntries.some((e) => e.meal === m)));
  const weight = pending.reduce((a, m) => a + shares[m], 0) || 1;
  const fair = left * (shares[meal] / weight);
  const plan = ctx.targets.kcal * shares[meal];
  // nunca sugere uma refeição minúscula só porque o dia passou da meta
  return Math.max(150, Math.min(fair, plan * 1.3));
}

function hasInPantry(pantry: string[], foodId: string): boolean {
  const f = foodById(foodId);
  if (!f) return false;
  const text = foldText(`${f.name} ${f.aka ?? ''} ${f.buy?.name ?? ''}`);
  return pantry.some((w) => text.includes(w));
}

export function suggestMeals(ctx: SuggestContext): MealSuggestion[] {
  const meal = ctx.meal ?? mealAt(ctx.time, ctx.profile.meals);
  const budget = mealBudget(ctx, meal);
  const eaten = totalsOf(ctx.todayEntries);
  const needP = Math.max(0, ctx.targets.p - eaten.p);
  const needF = Math.max(0, ctx.targets.f - eaten.f);
  const recent = new Set(ctx.recentNames.map(foldText));
  const pantry = (ctx.pantry ?? []).map(foldText).filter(Boolean);
  const out: MealSuggestion[] = [];
  for (const recipe of recipesFor(meal, ctx.profile)) {
    if (ctx.maxMinutes && recipe.minutes > ctx.maxMinutes) continue;
    const factor = bestFactor(recipe, budget);
    const n = recipeNutrients(recipe, factor);
    const reasons: string[] = [];
    let score = 1 - Math.min(1, Math.abs(n.kcal - budget) / Math.max(budget, 1));
    // proteína e fibra que faltam no dia valem mais
    const share = mealShares(ctx.profile.meals)[meal] || 0.25;
    const wantP = Math.min(needP, ctx.targets.p * share * 1.3);
    if (wantP > 0) score += Math.min(1, n.p / wantP) * 0.8;
    if (needF > 0) score += Math.min(1, n.f / Math.min(needF, ctx.targets.f * share * 1.3)) * 0.45;
    if (needP >= 15 && n.p >= Math.max(15, wantP * 0.75)) reasons.push(`${Math.round(n.p)} g de proteína, e faltam ${Math.round(needP)} g hoje`);
    if (needF >= 6 && n.f >= 6) reasons.push(`${Math.round(n.f)} g de fibras`);
    if (recipe.minutes <= 10) {
      score += 0.2;
      reasons.push(`pronto em ${recipe.minutes} min`);
    }
    if (recipe.cost === 1) score += 0.08;
    if (recent.has(foldText(recipe.name))) score -= 0.7;
    const missing: string[] = [];
    if (pantry.length) {
      const needed = recipe.items.filter(([id]) => !STAPLES.has(id));
      const have = needed.filter(([id]) => hasInPantry(pantry, id));
      for (const [id] of needed) if (!hasInPantry(pantry, id)) missing.push(foodById(id)?.buy?.name ?? foodById(id)?.name ?? id);
      const cover = needed.length ? have.length / needed.length : 0;
      if (!have.length) continue;
      score += cover * 2.5;
      reasons.unshift(missing.length ? `você tem ${have.length} de ${needed.length} ingredientes` : 'você tem tudo em casa');
    }
    if (!reasons.length) reasons.push(`cabe bem nas ${Math.round(budget)} kcal desta refeição`);
    out.push({ recipe, factor, nutrients: n, reasons: reasons.slice(0, 3), missing, score });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id)).slice(0, ctx.limit ?? 6);
}

// ------------------------------------------------------------------ dicas do dia

export type InsightKind = 'bom' | 'atencao' | 'ideia';

export interface FoodInsight {
  kind: InsightKind;
  text: string;
}

/** Grupos alimentares que apareceram no dia (direto ou pelos ingredientes). */
export function groupsEaten(entries: DiaryEntry[]): Set<FoodGroup> {
  const out = new Set<FoodGroup>();
  for (const e of entries) {
    const food = foodByName(e.name);
    if (food) out.add(food.group);
    const recipe = recipeByName(e.name);
    for (const [id] of recipe?.items ?? []) {
      const g = foodById(id)?.group;
      if (g) out.add(g);
    }
  }
  return out;
}

const minutesOf = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);

/** Quanto do dia alimentar (das 7h às 21h) já passou, de 0 a 1. */
const dayProgress = (time: string) => Math.max(0, Math.min(1, (minutesOf(time) - 7 * 60) / (14 * 60)));

export function dayInsights(entries: DiaryEntry[], targets: FoodTargets, time: string): FoodInsight[] {
  const out: FoodInsight[] = [];
  if (!entries.length) return [{ kind: 'ideia', text: 'Nada registrado hoje ainda. Comece pela última refeição que você fez.' }];
  const t = totalsOf(entries);
  const pace = dayProgress(time);
  const groups = groupsEaten(entries);
  if (t.p >= targets.p) out.push({ kind: 'bom', text: `Meta de proteína batida: ${Math.round(t.p)} g.` });
  else if (pace > 0.45 && t.p < targets.p * pace * 0.7) out.push({ kind: 'atencao', text: `Proteína abaixo do ritmo: ${Math.round(t.p)} de ${targets.p} g. Ovos, frango, feijão ou iogurte ajudam.` });
  if (t.f >= targets.f) out.push({ kind: 'bom', text: `Fibras em dia: ${Math.round(t.f)} g.` });
  else if (pace > 0.6 && t.f < targets.f * 0.5) out.push({ kind: 'ideia', text: `Só ${Math.round(t.f)} g de fibras até agora. Feijão, aveia, frutas e verduras sobem esse número.` });
  const over = t.kcal - targets.kcal;
  if (over > targets.kcal * 0.1) out.push({ kind: 'ideia', text: `Passou ${fmtNum(Math.round(over))} kcal da estimativa de hoje. Um dia não define nada: amanhã segue normal.` });
  if (pace > 0.5 && !groups.has('verduras')) out.push({ kind: 'ideia', text: 'Ainda sem verduras ou legumes hoje. Que tal uma salada na próxima refeição?' });
  if (pace > 0.6 && !groups.has('frutas')) out.push({ kind: 'ideia', text: 'Nenhuma fruta hoje. Uma fruta é um lanche fácil.' });
  if (groups.has('leguminosas') && groups.has('cereais')) out.push({ kind: 'bom', text: 'Cereal com leguminosa no prato: boa combinação.' });
  return out.slice(0, 4);
}

/** Alimentos ricos em um nutriente, para a pessoa conhecer opções. */
export function foodsRichIn(key: 'p' | 'f', limit = 8): string[] {
  return FOODS.filter((f) => f.group !== 'prontos' && f.group !== 'doces')
    .map((f) => ({ f, v: (f[key] * f.portion.grams) / 100 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit)
    .map((x) => x.f.name);
}
