import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOOD_PROFILE, FOODS, MEAL_KINDS, RECIPES, RESTRICTIONS, addCustomFood, addShoppingItem, appendDiary, bestFactor, dayInsights, diaryLine,
  entryFromFood, entryFromRecipe, foodById, foodDiaryPath, foodTargets, frequentFoods, generateMenu, mealAt, mealBudget, mealShares, menuNote,
  parseCustomFoods, parseDiary, parseDiaryLine, parseFoodProfile, parseMenu, parseShopping, parseWeights, recipeAllowed, recipeById, recipeNutrients,
  recipesFor, refreshShopping, removeDiaryLine, removeShoppingItem, searchFoods, setMenuItem, shoppingFromMenu, suggestMeals, swapMenuItem,
  toggleShopping, totalsOf, weightLine, writeFoodProfile,
  type DiaryEntry, type FoodProfile,
} from '../src/index';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime(); // novembro de 2026
const MONDAY = '2026-11-16';

const adult: FoodProfile = {
  ...DEFAULT_FOOD_PROFILE, base: 'feminino', age: 30, heightCm: 165, weightKg: 65, activity: 'leve', goal: 'manter',
};

const entry = (e: Omit<DiaryEntry, 'raw'>): DiaryEntry => ({ ...e, raw: diaryLine(e) });

describe('alimentos e receitas', () => {
  it('ids únicos e números coerentes', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
    for (const f of FOODS) {
      // 4/4/9 kcal por grama: a tabela não pode fugir muito disso (bebidas alcoólicas ficam de fora)
      if (f.id === 'cerveja') continue;
      const est = f.p * 4 + (f.c - f.f) * 4 + f.f * 2 + f.g * 9;
      expect(Math.abs(est - f.kcal), f.id).toBeLessThan(Math.max(40, f.kcal * 0.3));
      expect(f.portion.grams, f.id).toBeGreaterThan(0);
    }
  });

  it('toda receita usa alimentos da tabela e tem nutrientes plausíveis', () => {
    for (const r of RECIPES) {
      for (const [id, g] of r.items) {
        expect(foodById(id), `${r.id}: ${id}`).toBeDefined();
        expect(g).toBeGreaterThan(0);
      }
      const n = recipeNutrients(r);
      expect(n.kcal, r.id).toBeGreaterThan(80);
      expect(n.kcal, r.id).toBeLessThan(950);
      expect(r.steps.length, r.id).toBeGreaterThan(0);
    }
  });

  it('cada restrição tem opções em todas as refeições', () => {
    for (const x of RESTRICTIONS) {
      for (const m of MEAL_KINDS) {
        expect(recipesFor(m.id, { restrictions: [x.id], dislikes: [] }).length, `${x.id} em ${m.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('respeita restrições e o que a pessoa não come', () => {
    const frango = recipeById('prato-frango')!;
    expect(recipeAllowed(frango, ['vegetariano'])).toBe(false);
    expect(recipeAllowed(frango, ['sem-lactose'])).toBe(true);
    expect(recipeAllowed(recipeById('mingau-aveia')!, ['sem-lactose'])).toBe(false);
    expect(recipeAllowed(recipeById('iogurte-mel')!, ['vegano'])).toBe(false);
    expect(recipeAllowed(recipeById('macarrao-atum')!, ['sem-gluten'])).toBe(false);
    expect(recipeAllowed(frango, [], ['Tomate'])).toBe(false);
    expect(recipeAllowed(frango, [], ['jiló'])).toBe(true);
  });

  it('busca sem acento, por apelido e com prioridade para o começo do nome', () => {
    expect(searchFoods('maca', FOODS)[0]!.id).toBe('maca');
    expect(searchFoods('aipim', FOODS)[0]!.id).toBe('mandioca');
    expect(searchFoods('frango grelhado', FOODS)[0]!.id).toBe('frango-peito');
    expect(searchFoods('', FOODS)).toEqual([]);
  });
});

describe('diário', () => {
  it('grava, lê de volta e soma o dia', () => {
    const arroz = entryFromFood(foodById('arroz-branco')!, 120, 'almoco', at(18, 12, 30));
    const prato = entryFromRecipe(recipeById('prato-frango')!, 1.5, 'jantar', at(18, 19));
    let text = appendDiary('', diaryLine(arroz), at(18, 12, 30));
    text = appendDiary(text, diaryLine(prato), at(18, 19));
    expect(text.startsWith('# Diário alimentar 2026-11')).toBe(true);
    const log = parseDiary(text);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ day: '2026-11-18', time: '12:30', meal: 'almoco', name: 'Arroz branco cozido', grams: 120, kcal: 154 });
    expect(log[1]).toMatchObject({ meal: 'jantar', factor: 1.5 });
    expect(totalsOf(log).kcal).toBeCloseTo(154 + Math.round(prato.kcal), 0);
    expect(parseDiary(removeDiaryLine(text, log[0]!.raw))).toHaveLength(1);
    expect(foodDiaryPath(at(18, 12))).toBe('Alimentação/Diário/2026-11.md');
  });

  it('linha escrita à mão é completada pela tabela', () => {
    const e = parseDiaryLine('- 2026-11-18 08:00 🍽 Café da manhã · Banana · 140 g')!;
    expect(e.meal).toBe('cafe');
    expect(e.kcal).toBeCloseTo(137.2, 1);
    const r = parseDiaryLine('- 2026-11-18 13:00 🍽 Almoço · Sopa de lentilha com legumes')!;
    expect(r.kcal).toBeGreaterThan(200);
    const unknown = parseDiaryLine('- 2026-11-18 13:00 🍽 Almoço · Comida da vó')!;
    expect(unknown).toMatchObject({ name: 'Comida da vó', kcal: 0 });
    expect(parseDiaryLine('- [ ] tarefa qualquer')).toBeNull();
  });

  it('pesagens ficam na mesma nota sem virar refeição', () => {
    const text = appendDiary('', weightLine(72.4, at(18, 7)), at(18, 7));
    expect(parseWeights(text)).toMatchObject([{ day: '2026-11-18', kg: 72.4 }]);
    expect(parseDiary(text)).toEqual([]);
  });

  it('refeição pela hora, respeitando as refeições escolhidas', () => {
    expect(mealAt('08:00')).toBe('cafe');
    expect(mealAt('13:00')).toBe('almoco');
    expect(mealAt('16:30')).toBe('lanche');
    expect(mealAt('20:00')).toBe('jantar');
    expect(mealAt('23:00')).toBe('ceia');
    expect(mealAt('23:00', ['cafe', 'almoco', 'jantar'])).toBe('jantar');
    expect(mealAt('16:30', ['cafe', 'almoco', 'jantar'])).toBe('jantar');
  });

  it('frequentes trazem a porção mais recente', () => {
    const a = entry(entryFromFood(foodById('banana')!, 70, 'lanche', at(16, 16)));
    const b = entry(entryFromFood(foodById('banana')!, 140, 'lanche', at(17, 16)));
    const c = entry(entryFromFood(foodById('maca')!, 130, 'lanche', at(17, 17)));
    const top = frequentFoods([a, b, c], 5);
    expect(top[0]).toMatchObject({ name: 'Banana', count: 2, grams: 140 });
    expect(top).toHaveLength(2);
  });
});

describe('perfil e metas', () => {
  it('grava e lê o perfil', () => {
    const p: FoodProfile = { ...adult, goal: 'perder', restrictions: ['sem-lactose', 'vegetariano'], dislikes: ['jiló', 'quiabo'], meals: ['cafe', 'almoco', 'jantar'], people: 3 };
    const text = writeFoodProfile('', p);
    expect(text).toContain('# Alimentação');
    expect(parseFoodProfile(text)).toEqual(p);
    // regravar não duplica nem apaga o corpo
    expect(writeFoodProfile(text, p).match(/objetivo:/g)).toHaveLength(1);
  });

  it('sem perfil usa a referência de 2000 kcal', () => {
    const t = foodTargets(DEFAULT_FOOD_PROFILE);
    expect(t).toMatchObject({ kcal: 2000, personal: false });
  });

  it('calcula pela fórmula de Mifflin-St Jeor', () => {
    const t = foodTargets(adult);
    // 10×65 + 6,25×165 − 5×30 − 161 = 1370,25; × 1,375 = 1884
    expect(t.bmr).toBe(1370);
    expect(t.tdee).toBe(1884);
    expect(t.kcal).toBe(1880);
    expect(t.p).toBe(78);
    expect(t.personal).toBe(true);
  });

  it('nunca propõe comer abaixo do gasto em repouso nem cortes bruscos', () => {
    const small: FoodProfile = { ...adult, age: 60, heightCm: 150, weightKg: 45, activity: 'sedentario', goal: 'perder' };
    const t = foodTargets(small);
    expect(t.kcal).toBeGreaterThanOrEqual(1200);
    expect(t.kcal).toBeGreaterThanOrEqual(Math.floor(t.bmr! / 10) * 10);
    const big: FoodProfile = { ...adult, base: 'masculino', age: 25, heightCm: 190, weightKg: 120, activity: 'intenso', goal: 'perder' };
    const b = foodTargets(big);
    expect(b.tdee! - b.kcal).toBeLessThanOrEqual(505);
  });

  it('metas manuais vencem o cálculo, e menores de idade ficam sem cálculo', () => {
    expect(foodTargets({ ...adult, manualKcal: 2400, manualProtein: 130 })).toMatchObject({ kcal: 2400, p: 130 });
    expect(parseFoodProfile('---\nidade: 15\n---\n').age).toBeNull();
    expect(parseFoodProfile('---\nmeta_kcal: 500\n---\n').manualKcal).toBeNull();
  });

  it('as partes das refeições somam 100%', () => {
    const s = mealShares(['cafe', 'almoco', 'jantar']);
    expect(s.cafe + s.almoco + s.jantar).toBeCloseTo(1, 5);
    expect(s.lanche).toBe(0);
  });

  it('meus alimentos: números da porção viram por 100 g', () => {
    const text = addCustomFood(writeFoodProfile('', adult), { name: 'Whey da marca X', grams: 30, kcal: 120, p: 24, c: 3, g: 1.5, f: 0 });
    const list = parseCustomFoods(text);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'Whey da marca X', kcal: 400, p: 80, portion: { grams: 30 } });
    const two = addCustomFood(text, { name: 'Barrinha', grams: 25, kcal: 90, p: 3, c: 12, g: 3, f: 2 });
    expect(parseCustomFoods(two).map((f) => f.name)).toEqual(['Whey da marca X', 'Barrinha']);
    expect(parseFoodProfile(two)).toEqual(adult);
  });
});

describe('cardápio', () => {
  it('é repetível, cobre a semana e chega perto da meta', () => {
    const a = generateMenu(adult, MONDAY, 's');
    expect(generateMenu(adult, MONDAY, 's')).toEqual(a);
    expect(generateMenu(adult, MONDAY, 'outra')).not.toEqual(a);
    expect(a.days).toHaveLength(7);
    expect(a.days[6]!.day).toBe('2026-11-22');
    const target = foodTargets(adult).kcal;
    for (const d of a.days) {
      expect(d.items.map((i) => i.meal)).toEqual(adult.meals);
      const kcal = d.items.reduce((s, it) => s + recipeNutrients(recipeById(it.recipeId!)!, it.factor).kcal, 0);
      expect(Math.abs(kcal - target) / target, d.day).toBeLessThan(0.2);
    }
  });

  it('não repete almoço ou jantar em dias seguidos', () => {
    const m = generateMenu(adult, MONDAY, 'x');
    for (let i = 1; i < 7; i++) {
      for (const meal of ['almoco', 'jantar'] as const) {
        const cur = m.days[i]!.items.find((x) => x.meal === meal)!.recipeId;
        const prev = m.days[i - 1]!.items.find((x) => x.meal === meal)!.recipeId;
        expect(cur).not.toBe(prev);
      }
    }
  });

  it('respeita restrições em todos os pratos', () => {
    const vegan: FoodProfile = { ...adult, restrictions: ['vegano', 'sem-gluten'] };
    for (const d of generateMenu(vegan, MONDAY).days) {
      expect(d.items.length).toBeGreaterThan(0);
      for (const it of d.items) expect(recipeAllowed(recipeById(it.recipeId!)!, vegan.restrictions), it.name).toBe(true);
    }
  });

  it('a nota vai e volta, e aceita prato escrito à mão', () => {
    const m = generateMenu(adult, MONDAY, 'n');
    const text = menuNote(m);
    expect(parseMenu(text)).toEqual(m);
    const edited = text.replace(/- Almoço: .*/, '- Almoço: Churrasco na casa da tia');
    const back = parseMenu(edited);
    expect(back.days[0]!.items.find((i) => i.meal === 'almoco')).toMatchObject({ name: 'Churrasco na casa da tia', recipeId: null, factor: 1 });
  });

  it('troca só o prato pedido', () => {
    const m = generateMenu(adult, MONDAY, 'n');
    const text = menuNote(m);
    const next = swapMenuItem(m, 2, 'jantar', adult)!;
    expect(next.recipeId).not.toBe(m.days[2]!.items.find((i) => i.meal === 'jantar')!.recipeId);
    const after = parseMenu(setMenuItem(text, 2, next));
    expect(after.days[2]!.items.find((i) => i.meal === 'jantar')).toMatchObject({ name: next.name, factor: next.factor });
    expect(after.days[3]).toEqual(m.days[3]);
    expect(after.days[2]!.items.find((i) => i.meal === 'almoco')).toEqual(m.days[2]!.items.find((i) => i.meal === 'almoco'));
  });

  it('a porção escolhida fica perto das calorias pedidas', () => {
    const r = recipeById('prato-frango')!;
    expect(bestFactor(r, recipeNutrients(r).kcal * 1.5)).toBe(1.5);
    expect(bestFactor(r, 1)).toBe(0.75);
  });
});

describe('lista de compras', () => {
  const menu = { monday: MONDAY, days: [{ day: MONDAY, items: [
    { meal: 'almoco' as const, name: 'Arroz, feijão, frango e salada', recipeId: 'prato-frango', factor: 1 },
    { meal: 'jantar' as const, name: 'Arroz, feijão, ovo e couve', recipeId: 'ovo-arroz-feijao', factor: 2 },
    { meal: 'cafe' as const, name: 'Pão com ovo e tomate', recipeId: 'pao-ovo', factor: 1 },
    { meal: 'lanche' as const, name: 'Algo fora da lista', recipeId: null, factor: 1 },
  ] }] };

  it('soma ingredientes, converte cozido em cru e conta unidades', () => {
    const list = shoppingFromMenu(menu);
    const get = (n: string) => list.find((x) => x.name === n);
    // 120 g + 260 g de arroz cozido = 380 g, que vêm de 152 g de arroz cru
    expect(get('Arroz branco')).toMatchObject({ amount: '160 g', aisle: 'Mercearia' });
    // 2 ovos do pão + 2 do prato (factor 2 de 1 ovo)
    expect(get('Ovos')).toMatchObject({ amount: '4 unidades', aisle: 'Frios, ovos e laticínios' });
    // 120 g grelhados vêm de 162 g crus
    expect(get('Peito de frango')).toMatchObject({ amount: '170 g', aisle: 'Açougue e peixaria' });
    expect(get('Tomate')!.aisle).toBe('Hortifruti');
    expect(shoppingFromMenu(menu, 4).find((x) => x.name === 'Ovos')!.amount).toBe('16 unidades');
  });

  it('marca, acrescenta, remove e guarda ao refazer', () => {
    let text = menuNote(generateMenu(adult, MONDAY, 'c'));
    const first = parseShopping(text)[0]!;
    text = toggleShopping(text, first.name);
    text = addShoppingItem(text, 'Papel toalha');
    text = addShoppingItem(text, 'papel toalha');
    let list = parseShopping(text);
    expect(list.find((x) => x.name === first.name)!.done).toBe(true);
    expect(list.filter((x) => x.name === 'Papel toalha')).toMatchObject([{ aisle: 'Outros', amount: '' }]);
    text = refreshShopping(text);
    list = parseShopping(text);
    expect(list.find((x) => x.name === first.name)!.done).toBe(true);
    expect(list.some((x) => x.name === 'Papel toalha')).toBe(true);
    // a seção de compras nunca bagunça o cardápio
    expect(parseMenu(text)).toEqual(generateMenu(adult, MONDAY, 'c'));
    expect(parseShopping(removeShoppingItem(text, 'Papel toalha')).some((x) => x.name === 'Papel toalha')).toBe(false);
  });
});

describe('sugestões', () => {
  const base = { profile: adult, targets: foodTargets(adult), todayEntries: [] as DiaryEntry[], recentNames: [] as string[], time: '12:30' };

  it('sugere para a refeição da hora, dentro das restrições', () => {
    const vegan = { ...adult, restrictions: ['vegano' as const] };
    const list = suggestMeals({ ...base, profile: vegan });
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.recipe.meals).toContain('almoco');
      expect(recipeAllowed(s.recipe, ['vegano'])).toBe(true);
      expect(s.reasons.length).toBeGreaterThan(0);
    }
  });

  it('evita o que foi comido nos últimos dias', () => {
    const first = suggestMeals(base)[0]!;
    const next = suggestMeals({ ...base, recentNames: [first.recipe.name] })[0]!;
    expect(next.recipe.id).not.toBe(first.recipe.id);
  });

  it('prioriza o que há em casa e diz o que falta', () => {
    const list = suggestMeals({ ...base, pantry: ['arroz', 'feijão', 'ovo', 'couve'] });
    expect(list[0]!.recipe.id).toBe('ovo-arroz-feijao');
    expect(list[0]!.missing).toEqual([]);
    expect(list[0]!.reasons[0]).toBe('você tem tudo em casa');
    for (const s of list) expect(s.recipe.items.some(([id]) => ['arroz-branco', 'arroz-integral', 'feijao-carioca', 'feijao-preto', 'ovo-cozido', 'ovo-frito', 'couve'].includes(id))).toBe(true);
  });

  it('limita pelo tempo de preparo', () => {
    for (const s of suggestMeals({ ...base, maxMinutes: 15 })) expect(s.recipe.minutes).toBeLessThanOrEqual(15);
  });

  it('o orçamento da refeição acompanha o que já foi comido e não some', () => {
    const fresh = mealBudget(base, 'almoco');
    const big = entry({ ...entryFromRecipe(recipeById('prato-frango')!, 1, 'cafe', at(18, 8)), kcal: 1500 });
    const after = mealBudget({ ...base, todayEntries: [big] }, 'almoco');
    expect(after).toBeLessThan(fresh);
    const huge = entry({ ...big, kcal: 5000 });
    expect(mealBudget({ ...base, todayEntries: [huge] }, 'jantar')).toBe(150);
  });

  it('dicas do dia falam do que falta sem julgar', () => {
    expect(dayInsights([], base.targets, '09:00')[0]!.kind).toBe('ideia');
    const cafe = entry(entryFromFood(foodById('pao-frances')!, 50, 'cafe', at(18, 8)));
    const tips = dayInsights([cafe], base.targets, '19:00').map((t) => t.text).join(' ');
    expect(tips).toMatch(/Proteína abaixo do ritmo/);
    expect(tips).toMatch(/verduras/);
    const fartura = entry({ ...cafe, kcal: 4000, p: 200, f: 40 });
    const ok = dayInsights([fartura], base.targets, '20:00');
    expect(ok.some((t) => t.kind === 'bom' && /proteína/.test(t.text))).toBe(true);
    expect(ok.some((t) => /Um dia não define nada/.test(t.text))).toBe(true);
  });
});
