import {
  DEFAULT_FOOD_PROFILE, FOODS, FOOD_DIARY_DIR, FOOD_NOTE, addCustomFood, addDays, addShoppingItem, appendDiary, clockOf, dayInsights, diaryLine,
  entriesOfDay, entryFromFood, entryFromRecipe, foodDiaryPath, foodTargets, frequentFoods, generateMenu, isoWeek, mealAt, menuNote, menuPath, parseCustomFoods,
  parseDiary, parseFoodProfile, parseMenu, parseShopping, parseWeights, recipeById, recipeByName, refreshShopping, removeDiaryLine, removeShoppingItem,
  setMenuItem, suggestMeals, swapMenuItem, today, toggleShopping, totalsOf, weightLine, writeFoodProfile,
  type CustomFood, type CustomFoodInput, type DiaryEntry, type Food, type FoodProfile, type FrequentFood, type MealKind, type MenuItem, type Recipe, type SuggestContext,
  type WeightEntry,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { feel } from '../feel.svelte';
import { files } from '../files/files.svelte';
import { sound } from '../sound.svelte';

/*
 * Alimentação: diário, metas, cardápio da semana, compras e sugestões.
 * Tudo mora em notas da pasta Alimentação/, que sincronizam e abrem no Obsidian.
 */

export type AnyFood = Food | CustomFood;

/** Meio-dia de um dia, com a hora de agora quando o dia é hoje. */
function stampFor(day: string): number {
  const now = new Date();
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, now.getHours(), now.getMinutes()).getTime();
}

class Alimentacao {
  profile = $state<FoodProfile>({ ...DEFAULT_FOOD_PROFILE });
  custom = $state<CustomFood[]>([]);
  entries = $state<DiaryEntry[]>([]);
  weights = $state<WeightEntry[]>([]);
  menuText = $state('');
  now = $state(Date.now());
  /** dia aberto no diário */
  cursor = $state(today());
  /** segunda-feira da semana aberta no cardápio */
  monday = $state(isoWeek(today()).monday);
  /** sobe a cada pedido para abrir a tela */
  openRequests = $state(0);
  /** aba aberta (a paleta de comandos também escolhe) */
  tab = $state('diario');

  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private swaps = new Map<string, number>();

  readonly day = $derived(today(new Date(this.now)));
  readonly clock = $derived(clockOf(this.now));
  readonly targets = $derived(foodTargets(this.profile));
  readonly foods = $derived<AnyFood[]>([...this.custom, ...FOODS]);
  readonly dayEntries = $derived(entriesOfDay(this.entries, this.cursor));
  readonly dayTotals = $derived(totalsOf(this.dayEntries));
  readonly insights = $derived(dayInsights(entriesOfDay(this.entries, this.day), this.targets, this.clock));
  readonly menu = $derived(parseMenu(this.menuText, this.monday));
  readonly hasMenu = $derived(this.menu.days.some((d) => d.items.length > 0));
  readonly shopping = $derived(parseShopping(this.menuText));
  /** refeição mais provável agora */
  readonly mealNow = $derived(mealAt(this.clock, this.profile.meals));

  /** calorias dos últimos 7 dias, do mais antigo para hoje */
  readonly week = $derived(Array.from({ length: 7 }, (_, i) => {
    const day = addDays(this.day, i - 6);
    const list = entriesOfDay(this.entries, day);
    return { day, kcal: totalsOf(list).kcal, count: list.length };
  }));

  start(): void {
    if (this.started) return;
    this.started = true;
    this.reload();
    const touch = (p: string) => {
      if (p.startsWith('Alimentação/')) this.reloadSoon();
    };
    engine.bus.on('note.changed', (e) => touch(e.path));
    engine.bus.on('note.created', (e) => touch(e.path));
    engine.bus.on('note.deleted', (e) => touch(e.path));
    engine.bus.on('sync.finished', () => this.reloadSoon());
    // a virada do dia e as dicas dependem da hora
    setInterval(() => (this.now = Date.now()), 60_000);
  }

  private reloadSoon(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.reload(), 300);
  }

  private read(path: string): string {
    return engine.vault.has(path) ? engine.vault.read(path) : '';
  }

  reload(): void {
    if (!engine.vault) return;
    const note = this.read(FOOD_NOTE);
    this.profile = parseFoodProfile(note);
    this.custom = parseCustomFoods(note);
    const entries: DiaryEntry[] = [];
    const weights: WeightEntry[] = [];
    for (const p of engine.vault.list()) {
      if (!p.startsWith(`${FOOD_DIARY_DIR}/`)) continue;
      const text = engine.vault.read(p);
      entries.push(...parseDiary(text));
      weights.push(...parseWeights(text));
    }
    const order = (a: { day: string; time: string }, b: { day: string; time: string }) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time);
    this.entries = entries.sort(order);
    this.weights = weights.sort(order);
    this.menuText = this.read(menuPath(this.monday));
  }

  private write(path: string, text: string): void {
    feel.local(() => engine.writeNote(path, text));
    engine.pulse('notes', 'in');
    this.reload();
  }

  // ------------------------------------------------------------ diário

  private addLine(line: string, at: number): void {
    const path = foodDiaryPath(at);
    this.write(path, appendDiary(this.read(path), line, at));
  }

  addFood(food: AnyFood, grams: number, meal: MealKind): void {
    const at = stampFor(this.cursor);
    this.addLine(diaryLine(entryFromFood(food, grams, meal, at)), at);
    sound.play('complete');
  }

  addRecipe(recipe: Recipe, factor: number, meal: MealKind, day = this.cursor): void {
    const at = stampFor(day);
    this.addLine(diaryLine(entryFromRecipe(recipe, factor, meal, at)), at);
    sound.play('complete');
  }

  /** Anota algo que não está na tabela, sem números. */
  addFree(name: string, meal: MealKind, day = this.cursor): void {
    const at = stampFor(day);
    const clean = name.replace(/\s*·\s*/g, ', ').trim();
    if (!clean) return;
    this.addLine(diaryLine({ day, time: clockOf(at), meal, name: clean, grams: null, factor: null, kcal: 0, p: 0, c: 0, g: 0, f: 0 }), at);
    sound.play('complete');
  }

  /** Repete um registro frequente, com a mesma porção. */
  addFrequent(f: FrequentFood, meal: MealKind): void {
    const at = stampFor(this.cursor);
    this.addLine(diaryLine({ day: this.cursor, time: clockOf(at), meal, name: f.name, grams: f.grams, factor: f.factor, ...f.nutrients }), at);
    sound.play('complete');
  }

  remove(e: DiaryEntry): void {
    const [y, m, d] = e.day.split('-').map(Number);
    const path = foodDiaryPath(new Date(y!, m! - 1, d!).getTime());
    this.write(path, removeDiaryLine(this.read(path), e.raw));
    sound.play('tick');
    files.say(`"${e.name}" tirado do diário.`, { action: { label: 'Desfazer', run: () => this.write(path, appendDiary(this.read(path), e.raw, new Date(y!, m! - 1, d!).getTime())) } });
  }

  frequent(meal: MealKind, limit = 8): FrequentFood[] {
    return frequentFoods(this.entries, limit, meal);
  }

  /** Registra o peso e atualiza o perfil, para as metas acompanharem. */
  logWeight(kg: number): void {
    const at = Date.now();
    const path = foodDiaryPath(at);
    this.write(path, appendDiary(this.read(path), weightLine(kg, at), at));
    this.saveProfile({ ...$state.snapshot(this.profile) as FoodProfile, weightKg: kg });
    sound.play('complete');
  }

  // ------------------------------------------------------------ perfil

  saveProfile(p: FoodProfile): void {
    this.write(FOOD_NOTE, writeFoodProfile(this.read(FOOD_NOTE), p));
  }

  addCustom(x: CustomFoodInput): void {
    this.write(FOOD_NOTE, addCustomFood(this.read(FOOD_NOTE), x));
    sound.play('create');
    files.say(`"${x.name}" entrou em Meus alimentos.`);
  }

  // ------------------------------------------------------------ cardápio

  goWeek(delta: number): void {
    this.monday = addDays(this.monday, delta * 7);
    this.menuText = this.read(menuPath(this.monday));
    sound.play('tick');
  }

  generate(): void {
    const menu = generateMenu($state.snapshot(this.profile) as FoodProfile, this.monday, String(Date.now()));
    this.write(menuPath(this.monday), menuNote(menu, this.profile.people, this.menuText));
    sound.play('create');
  }

  private saveMenu(text: string): void {
    this.write(menuPath(this.monday), refreshShopping(text, this.profile.people));
  }

  /** Troca o prato por outro da mesma refeição. */
  swap(dayIndex: number, meal: MealKind): void {
    const key = `${this.monday}|${dayIndex}|${meal}`;
    const step = (this.swaps.get(key) ?? 0) + 1;
    this.swaps.set(key, step);
    const next = swapMenuItem(this.menu, dayIndex, meal, $state.snapshot(this.profile) as FoodProfile, step);
    if (!next) {
      files.say('Não há outro prato para essa refeição com as suas restrições.');
      return;
    }
    this.saveMenu(setMenuItem(this.menuText, dayIndex, next));
    sound.play('tick');
  }

  /** Põe um prato escrito à mão ou escolhido nas receitas. */
  setDish(dayIndex: number, meal: MealKind, name: string, factor = 1): void {
    const clean = name.replace(/\s*·\s*/g, ', ').trim();
    if (!clean) return;
    const item: MenuItem = { meal, name: clean, recipeId: recipeByName(clean)?.id ?? null, factor };
    this.saveMenu(setMenuItem(this.menuText, dayIndex, item));
  }

  eaten(day: string, item: MenuItem): boolean {
    return this.entries.some((e) => e.day === day && e.meal === item.meal && e.name === item.name);
  }

  /** Marca o prato do cardápio como comido: vai para o diário daquele dia. */
  eat(day: string, item: MenuItem): void {
    const r = item.recipeId ? recipeById(item.recipeId) : undefined;
    if (r) this.addRecipe(r, item.factor, item.meal, day);
    else this.addFree(item.name, item.meal, day);
    files.say(`${item.name} foi para o diário.`);
  }

  // ------------------------------------------------------------ compras

  toggleBuy(name: string): void {
    this.write(menuPath(this.monday), toggleShopping(this.menuText, name));
    sound.play('tick');
  }

  addBuy(name: string): void {
    this.write(menuPath(this.monday), addShoppingItem(this.menuText, name));
  }

  removeBuy(name: string): void {
    this.write(menuPath(this.monday), removeShoppingItem(this.menuText, name));
  }

  // ------------------------------------------------------------ sugestões

  suggest(opts: Pick<SuggestContext, 'meal' | 'pantry' | 'maxMinutes' | 'limit'> = {}) {
    const from = addDays(this.day, -3);
    return suggestMeals({
      profile: $state.snapshot(this.profile) as FoodProfile,
      targets: this.targets,
      todayEntries: entriesOfDay(this.entries, this.day),
      recentNames: this.entries.filter((e) => e.day >= from).map((e) => e.name),
      time: this.clock,
      ...opts,
    });
  }
}

export const alimentacao = new Alimentacao();
