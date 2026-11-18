/*
 * Perfil e metas da alimentação. Moram nas propriedades de
 * Alimentação/Alimentação.md, que também guarda os "meus alimentos":
 *
 *   ## Meus alimentos
 *   - Whey da marca X · 30 g · 120 kcal · P 24 · C 3 · G 1,5 · F 0
 *
 * As metas são uma estimativa (Mifflin-St Jeor) e têm um piso: o Tanden nunca
 * propõe comer menos que o gasto em repouso nem cortes bruscos. Valem para
 * adultos; gestação, doenças e transtornos alimentares pedem acompanhamento.
 */
import { asList, parseProps, setProps, splitFrontmatter, withBody, type PropValue } from '../caderno/frontmatter';
import { foldText, type Food } from './alimentos';
import { fmtNum } from './diario';
import { MEAL_KINDS, RESTRICTIONS, type MealKind, type Restriction } from './receitas';

export const FOOD_NOTE = 'Alimentação/Alimentação.md';

export type BodyBase = 'feminino' | 'masculino';
export type Activity = 'sedentario' | 'leve' | 'moderado' | 'intenso';
export type FoodGoal = 'perder' | 'manter' | 'ganhar';

export const ACTIVITIES: Array<{ id: Activity; label: string; hint: string; factor: number }> = [
  { id: 'sedentario', label: 'Pouco ativo', hint: 'quase sempre sentado', factor: 1.2 },
  { id: 'leve', label: 'Leve', hint: 'exercício 1 a 3 vezes por semana', factor: 1.375 },
  { id: 'moderado', label: 'Moderado', hint: 'exercício 3 a 5 vezes por semana', factor: 1.55 },
  { id: 'intenso', label: 'Intenso', hint: 'exercício quase todo dia', factor: 1.725 },
];

export const FOOD_GOALS: Array<{ id: FoodGoal; label: string; word: string }> = [
  { id: 'perder', label: 'Perder peso aos poucos', word: 'perder' },
  { id: 'manter', label: 'Manter o peso', word: 'manter' },
  { id: 'ganhar', label: 'Ganhar massa', word: 'ganhar' },
];

export interface FoodProfile {
  base: BodyBase | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: Activity;
  goal: FoodGoal;
  meals: MealKind[];
  restrictions: Restriction[];
  /** alimentos que a pessoa não come (texto livre) */
  dislikes: string[];
  /** pessoas na casa, para a lista de compras */
  people: number;
  /** metas escritas à mão, que vencem o cálculo */
  manualKcal: number | null;
  manualProtein: number | null;
}

export const DEFAULT_FOOD_PROFILE: FoodProfile = {
  base: null, age: null, heightCm: null, weightKg: null, activity: 'leve', goal: 'manter',
  meals: ['cafe', 'almoco', 'lanche', 'jantar'], restrictions: [], dislikes: [], people: 1, manualKcal: null, manualProtein: null,
};

const str = (v: PropValue | undefined) => (Array.isArray(v) ? v[0] ?? '' : v ?? '').trim();
const num = (v: PropValue | undefined, min: number, max: number): number | null => {
  const s = str(v).replace(',', '.');
  const n = Number(s);
  return s && Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const words = (v: PropValue | undefined) => asList(v).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean);

export function parseFoodProfile(text: string): FoodProfile {
  const p = parseProps(text);
  const d = DEFAULT_FOOD_PROFILE;
  const base = foldText(str(p.base ?? p.sexo));
  const act = foldText(str(p.atividade));
  const goal = foldText(str(p.objetivo));
  const meals = words(p['refeições'] ?? p.refeicoes)
    .map((w) => MEAL_KINDS.find((m) => foldText(m.label) === foldText(w) || m.id === foldText(w))?.id)
    .filter((m): m is MealKind => !!m);
  const restrictions = words(p['restrições'] ?? p.restricoes)
    .map((w) => RESTRICTIONS.find((r) => foldText(r.label) === foldText(w) || r.id === foldText(w))?.id)
    .filter((r): r is Restriction => !!r);
  return {
    base: base === 'feminino' || base === 'masculino' ? base : null,
    age: num(p.idade, 18, 110),
    heightCm: num(p.altura_cm, 120, 230),
    weightKg: num(p.peso_kg, 35, 300),
    activity: ACTIVITIES.find((a) => a.id === act || foldText(a.label) === act)?.id ?? d.activity,
    goal: FOOD_GOALS.find((g) => g.id === goal)?.id ?? d.goal,
    meals: meals.length ? MEAL_KINDS.map((m) => m.id).filter((m) => meals.includes(m)) : [...d.meals],
    restrictions: [...new Set(restrictions)],
    dislikes: words(p.evitar),
    people: Math.round(num(p.pessoas, 1, 12) ?? d.people),
    manualKcal: num(p.meta_kcal, 1200, 6000),
    manualProtein: num(p['meta_proteína_g'] ?? p.meta_proteina_g, 20, 300),
  };
}

export function foodProfileProps(p: FoodProfile): Record<string, PropValue | null> {
  return {
    tipo: 'perfil alimentar',
    base: p.base,
    idade: p.age === null ? null : String(p.age),
    altura_cm: p.heightCm === null ? null : String(p.heightCm),
    peso_kg: p.weightKg === null ? null : fmtNum(p.weightKg),
    atividade: p.activity,
    objetivo: p.goal,
    'refeições': p.meals.map((m) => MEAL_KINDS.find((x) => x.id === m)!.label),
    'restrições': p.restrictions.map((r) => RESTRICTIONS.find((x) => x.id === r)!.label),
    evitar: p.dislikes.length ? p.dislikes : null,
    pessoas: String(p.people),
    meta_kcal: p.manualKcal === null ? null : String(p.manualKcal),
    'meta_proteína_g': p.manualProtein === null ? null : String(p.manualProtein),
  };
}

const NOTE_BODY = `# Alimentação

Este é o seu perfil alimentar. O Tanden lê as propriedades do topo desta nota.

As metas são estimativas para adultos saudáveis e não substituem um nutricionista.

## Meus alimentos

`;

export function writeFoodProfile(text: string, p: FoodProfile): string {
  return setProps(text.trim() ? text : NOTE_BODY, foodProfileProps(p));
}

// ------------------------------------------------------------------ metas

export interface FoodTargets {
  kcal: number;
  p: number;
  c: number;
  g: number;
  f: number;
  /** gasto em repouso e gasto total estimados (null sem perfil completo) */
  bmr: number | null;
  tdee: number | null;
  /** true: veio do perfil; false: valores de referência */
  personal: boolean;
}

/** Referência de rótulos brasileiros, para quem ainda não preencheu o perfil. */
const REFERENCE: FoodTargets = { kcal: 2000, p: 75, c: 300, g: 55, f: 25, bmr: null, tdee: null, personal: false };

export function profileComplete(p: FoodProfile): boolean {
  return p.base !== null && p.age !== null && p.heightCm !== null && p.weightKg !== null;
}

export function foodTargets(p: FoodProfile): FoodTargets {
  const complete = profileComplete(p);
  if (!complete && p.manualKcal === null) return { ...REFERENCE, p: p.manualProtein ?? REFERENCE.p };
  let bmr: number | null = null;
  let tdee: number | null = null;
  let kcal = p.manualKcal ?? 2000;
  if (complete) {
    bmr = 10 * p.weightKg! + 6.25 * p.heightCm! - 5 * p.age! + (p.base === 'masculino' ? 5 : -161);
    tdee = bmr * ACTIVITIES.find((a) => a.id === p.activity)!.factor;
    if (p.manualKcal === null) {
      // déficit e superávit moderados, com teto em kcal
      const delta = p.goal === 'perder' ? -Math.min(500, tdee * 0.15) : p.goal === 'ganhar' ? Math.min(300, tdee * 0.1) : 0;
      kcal = Math.max(tdee + delta, bmr, p.base === 'masculino' ? 1500 : 1200);
    }
  }
  kcal = Math.round(kcal / 10) * 10;
  const perKg = p.goal === 'perder' ? 1.6 : p.goal === 'ganhar' ? 1.8 : 1.2;
  const protein = p.manualProtein ?? (p.weightKg !== null ? Math.round(p.weightKg * perKg) : Math.round((kcal * 0.18) / 4));
  const fat = Math.round((kcal * 0.28) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fiber = Math.max(25, Math.round((kcal / 1000) * 14));
  return { kcal, p: protein, c: carbs, g: fat, f: fiber, bmr: bmr === null ? null : Math.round(bmr), tdee: tdee === null ? null : Math.round(tdee), personal: true };
}

/** Parte da meta do dia que cabe a cada refeição escolhida. */
export function mealShares(meals: MealKind[]): Record<MealKind, number> {
  const total = MEAL_KINDS.filter((m) => meals.includes(m.id)).reduce((a, m) => a + m.share, 0) || 1;
  return Object.fromEntries(MEAL_KINDS.map((m) => [m.id, meals.includes(m.id) ? m.share / total : 0])) as Record<MealKind, number>;
}

// ------------------------------------------------------------------ meus alimentos

const CUSTOM_HEAD = /^##\s+Meus alimentos\s*$/i;

/** Alimento próprio: os números valem para 100 g, como na tabela. */
export type CustomFood = Pick<Food, 'name' | 'kcal' | 'p' | 'c' | 'g' | 'f' | 'portion'> & { id: string; aka?: string; custom: true };

export function parseCustomFoods(text: string): CustomFood[] {
  const out: CustomFood[] = [];
  let inside = false;
  for (const line of splitFrontmatter(text).body.split('\n')) {
    if (/^#{1,2}\s/.test(line)) inside = CUSTOM_HEAD.test(line);
    if (!inside) continue;
    const m = /^\s*[-*+]\s+(.+?)\s+·\s+(\d+(?:[.,]\d+)?)\s*g\s+·\s+(.+)$/.exec(line);
    if (!m) continue;
    const grams = Number(m[2]!.replace(',', '.'));
    if (!(grams > 0)) continue;
    const val = (re: RegExp) => Number(re.exec(m[3]!)?.[1]?.replace(',', '.') ?? 0);
    const k = 100 / grams;
    out.push({
      id: `meu:${foldText(m[1]!)}`, name: m[1]!.trim(), custom: true,
      kcal: val(/(\d+(?:[.,]\d+)?)\s*kcal/i) * k, p: val(/\bP\s*(\d+(?:[.,]\d+)?)/) * k, c: val(/\bC\s*(\d+(?:[.,]\d+)?)/) * k,
      g: val(/\bG\s*(\d+(?:[.,]\d+)?)/) * k, f: val(/\bF\s*(\d+(?:[.,]\d+)?)/) * k,
      portion: { label: 'porção', grams },
    });
  }
  return out;
}

export interface CustomFoodInput {
  name: string;
  grams: number;
  kcal: number;
  p: number;
  c: number;
  g: number;
  f: number;
}

export function addCustomFood(text: string, x: CustomFoodInput): string {
  const line = `- ${x.name.replace(/\s*·\s*/g, ' ').trim()} · ${fmtNum(x.grams)} g · ${Math.round(x.kcal)} kcal · P ${fmtNum(x.p)} · C ${fmtNum(x.c)} · G ${fmtNum(x.g)} · F ${fmtNum(x.f)}`;
  const base = text.trim() ? text : NOTE_BODY;
  const { body } = splitFrontmatter(base);
  const lines = body.split('\n');
  const i = lines.findIndex((l) => CUSTOM_HEAD.test(l));
  if (i < 0) return withBody(base, `${body.replace(/\n*$/, '\n')}\n## Meus alimentos\n\n${line}\n`);
  // entra no fim da seção, antes do próximo título
  let end = lines.findIndex((l, k) => k > i && /^#{1,2}\s/.test(l));
  if (end < 0) end = lines.length;
  while (end > i + 1 && !lines[end - 1]!.trim()) end--;
  lines.splice(end, 0, line);
  return withBody(base, lines.join('\n'));
}
