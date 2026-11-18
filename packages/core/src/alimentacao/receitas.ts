/*
 * Receitas simples para o cardápio e as sugestões.
 *
 * Cada receita é uma porção para uma pessoa. Os nutrientes não são digitados:
 * saem da soma dos ingredientes, então sempre concordam com a tabela. As
 * restrições também saem dos ingredientes (quem tem "leite" não serve a quem
 * evita lactose), para uma receita nova não precisar marcar nada à mão.
 */
import { ZERO_NUTRIENTS, addNutrients, foldText, foodById, nutrientsOf, type FoodTrait, type Nutrients } from './alimentos';

export type MealKind = 'cafe' | 'almoco' | 'lanche' | 'jantar' | 'ceia';

export const MEAL_KINDS: Array<{ id: MealKind; label: string; share: number; until: string }> = [
  { id: 'cafe', label: 'Café da manhã', share: 0.25, until: '10:30' },
  { id: 'almoco', label: 'Almoço', share: 0.35, until: '15:00' },
  { id: 'lanche', label: 'Lanche', share: 0.1, until: '18:00' },
  { id: 'jantar', label: 'Jantar', share: 0.25, until: '21:30' },
  { id: 'ceia', label: 'Ceia', share: 0.05, until: '24:00' },
];

export const mealLabel = (m: MealKind): string => MEAL_KINDS.find((x) => x.id === m)!.label;

export type Restriction = 'vegetariano' | 'vegano' | 'sem-lactose' | 'sem-gluten' | 'sem-ovo' | 'sem-peixe' | 'sem-amendoim' | 'sem-castanhas' | 'sem-soja';

export const RESTRICTIONS: Array<{ id: Restriction; label: string; blocks: FoodTrait[] }> = [
  { id: 'vegetariano', label: 'Vegetariano', blocks: ['carne', 'peixe'] },
  { id: 'vegano', label: 'Vegano', blocks: ['carne', 'peixe', 'ovo', 'leite', 'mel'] },
  { id: 'sem-lactose', label: 'Sem lactose', blocks: ['leite'] },
  { id: 'sem-gluten', label: 'Sem glúten', blocks: ['gluten'] },
  { id: 'sem-ovo', label: 'Sem ovo', blocks: ['ovo'] },
  { id: 'sem-peixe', label: 'Sem peixe', blocks: ['peixe'] },
  { id: 'sem-amendoim', label: 'Sem amendoim', blocks: ['amendoim'] },
  { id: 'sem-castanhas', label: 'Sem castanhas', blocks: ['castanha'] },
  { id: 'sem-soja', label: 'Sem soja', blocks: ['soja'] },
];

export interface Recipe {
  id: string;
  name: string;
  meals: MealKind[];
  minutes: number;
  /** 1 econômica, 2 média, 3 mais cara */
  cost: 1 | 2 | 3;
  /** [id do alimento, gramas] */
  items: Array<[string, number]>;
  steps: string[];
}

const R = (id: string, name: string, meals: MealKind[], minutes: number, cost: 1 | 2 | 3, items: Array<[string, number]>, steps: string[]): Recipe =>
  ({ id, name, meals, minutes, cost, items, steps });

const MAIN: MealKind[] = ['almoco', 'jantar'];

export const RECIPES: Recipe[] = [
  // café da manhã
  R('pao-ovo', 'Pão com ovo e tomate', ['cafe'], 8, 1, [['pao-frances', 50], ['ovo-cozido', 100], ['tomate', 40], ['manteiga', 4]], ['Mexa os ovos numa frigideira com a manteiga.', 'Sirva no pão com rodelas de tomate.']),
  R('tapioca-queijo', 'Tapioca com queijo e tomate', ['cafe', 'lanche'], 8, 1, [['tapioca', 60], ['queijo-minas', 40], ['tomate', 40]], ['Espalhe a goma na frigideira quente até firmar.', 'Recheie com queijo e tomate e dobre.']),
  R('tapioca-ovo', 'Tapioca com ovo', ['cafe', 'jantar'], 10, 1, [['tapioca', 60], ['ovo-cozido', 100], ['tomate', 40]], ['Faça a tapioca na frigideira.', 'Recheie com os ovos mexidos e o tomate.']),
  R('tapioca-banana', 'Tapioca de banana e pasta de amendoim', ['cafe', 'lanche'], 8, 1, [['tapioca', 60], ['banana', 70], ['pasta-amendoim', 15]], ['Faça a tapioca na frigideira.', 'Recheie com banana em rodelas e a pasta.']),
  R('mingau-aveia', 'Mingau de aveia com banana', ['cafe', 'ceia'], 8, 1, [['aveia', 30], ['leite-integral', 200], ['banana', 70]], ['Cozinhe a aveia no leite, mexendo, por 4 minutos.', 'Sirva com a banana e canela a gosto.']),
  R('mingau-soja', 'Mingau de aveia com maçã', ['cafe', 'ceia'], 8, 1, [['aveia', 40], ['bebida-soja', 200], ['maca', 100], ['chia', 5]], ['Cozinhe a aveia na bebida de soja por 4 minutos.', 'Junte a maçã picada, a chia e canela a gosto.']),
  R('aveia-noturna', 'Aveia da noite com morango', ['cafe'], 5, 2, [['aveia', 40], ['iogurte-natural', 120], ['morango', 80], ['chia', 10]], ['Misture aveia, iogurte e chia num pote.', 'Deixe na geladeira de um dia para o outro e cubra com morango.']),
  R('vitamina-banana', 'Vitamina de banana com aveia', ['cafe', 'lanche'], 5, 1, [['banana', 70], ['leite-integral', 200], ['aveia', 15], ['pasta-amendoim', 15]], ['Bata tudo no liquidificador.']),
  R('iogurte-granola', 'Iogurte com granola e mamão', ['cafe', 'lanche'], 4, 2, [['iogurte-natural', 170], ['granola', 30], ['mamao', 120]], ['Monte numa tigela: iogurte, mamão e granola por cima.']),
  R('cuscuz-ovo', 'Cuscuz com ovo', ['cafe', 'jantar'], 12, 1, [['cuscuz', 130], ['ovo-cozido', 100], ['tomate', 30]], ['Hidrate o flocão e cozinhe no vapor por 8 minutos.', 'Sirva com ovos mexidos e tomate.']),
  R('crepioca', 'Crepioca de queijo', ['cafe', 'lanche', 'jantar'], 8, 1, [['ovo-cozido', 100], ['tapioca', 25], ['queijo-minas', 30]], ['Bata os ovos com a goma.', 'Doure dos dois lados e recheie com o queijo.']),
  R('torrada-abacate', 'Torrada com abacate e ovo', ['cafe', 'lanche'], 10, 2, [['pao-integral', 50], ['abacate', 60], ['ovo-cozido', 50], ['tomate', 30]], ['Toste o pão e amasse o abacate com limão e sal.', 'Cubra com o ovo e o tomate.']),
  R('batata-doce-ovo', 'Batata-doce com ovos', ['cafe', 'jantar'], 20, 1, [['batata-doce', 150], ['ovo-cozido', 100], ['tomate', 40]], ['Cozinhe a batata-doce até ficar macia.', 'Sirva com ovos cozidos ou mexidos.']),
  R('salada-frutas', 'Salada de frutas com aveia', ['cafe', 'lanche'], 6, 1, [['mamao', 100], ['banana', 70], ['maca', 80], ['aveia', 15]], ['Pique as frutas e misture com a aveia.']),

  // almoço e jantar com carne
  R('prato-frango', 'Arroz, feijão, frango e salada', MAIN, 30, 1, [['arroz-branco', 120], ['feijao-carioca', 100], ['frango-peito', 120], ['alface', 30], ['tomate', 60], ['azeite', 5]], ['Grelhe o frango temperado com alho e limão.', 'Sirva com arroz, feijão e a salada temperada.']),
  R('prato-bife', 'Bife acebolado com arroz, feijão e couve', MAIN, 30, 2, [['arroz-branco', 120], ['feijao-preto', 100], ['bife', 100], ['cebola', 40], ['couve', 40]], ['Grelhe o bife e doure a cebola na mesma frigideira.', 'Sirva com arroz, feijão e couve refogada.']),
  R('carne-abobrinha', 'Carne moída com abobrinha', MAIN, 25, 2, [['carne-moida', 100], ['abobrinha', 120], ['tomate', 60], ['arroz-branco', 120], ['feijao-carioca', 80]], ['Refogue a carne com alho e cebola.', 'Junte abobrinha e tomate e cozinhe por 8 minutos.']),
  R('tilapia-pure', 'Tilápia com batata e brócolis', MAIN, 25, 2, [['tilapia', 130], ['batata-inglesa', 170], ['brocolis', 80], ['azeite', 6], ['limao', 15]], ['Tempere a tilápia com limão e grelhe.', 'Cozinhe batata e brócolis e regue com azeite.']),
  R('sopa-frango', 'Sopa de frango com legumes', ['jantar', 'ceia'], 35, 1, [['frango-desfiado', 80], ['batata-inglesa', 110], ['cenoura', 60], ['abobrinha', 60], ['macarrao', 40]], ['Cozinhe batata e cenoura em caldo de frango.', 'Junte abobrinha, macarrão e o frango desfiado.']),
  R('macarrao-atum', 'Macarrão com atum e tomate', MAIN, 18, 1, [['macarrao', 170], ['atum-lata', 70], ['tomate', 110], ['cebola', 25], ['azeite', 5]], ['Cozinhe o macarrão.', 'Refogue cebola e tomate, junte o atum e misture.']),
  R('macarrao-bolonhesa', 'Macarrão à bolonhesa', MAIN, 25, 1, [['macarrao', 170], ['carne-moida', 90], ['tomate', 110], ['cebola', 25]], ['Refogue a carne com cebola e alho.', 'Junte o tomate, cozinhe e misture ao macarrão.']),
  R('escondidinho', 'Escondidinho de frango com mandioca', MAIN, 45, 2, [['mandioca', 180], ['frango-desfiado', 100], ['requeijao', 20], ['tomate', 50]], ['Cozinhe e amasse a mandioca com o requeijão.', 'Faça camadas com o frango refogado e leve ao forno.']),
  R('ovo-arroz-feijao', 'Arroz, feijão, ovo e couve', MAIN, 20, 1, [['arroz-branco', 130], ['feijao-carioca', 120], ['ovo-frito', 50], ['couve', 40]], ['Frite ou cozinhe o ovo.', 'Sirva com arroz, feijão e couve refogada.']),
  R('sardinha-arroz', 'Sardinha com arroz, feijão e vinagrete', MAIN, 15, 1, [['sardinha-lata', 80], ['arroz-branco', 120], ['feijao-preto', 80], ['tomate', 60], ['cebola', 20]], ['Pique tomate e cebola com limão para o vinagrete.', 'Sirva a sardinha com arroz, feijão e o vinagrete.']),
  R('frango-batata-doce', 'Frango com batata-doce e brócolis', MAIN, 30, 2, [['frango-peito', 130], ['batata-doce', 170], ['brocolis', 80], ['azeite', 5]], ['Asse a batata-doce em cubos por 25 minutos.', 'Grelhe o frango e cozinhe o brócolis no vapor.']),
  R('sanduiche-natural', 'Sanduíche natural de frango', ['lanche', 'jantar'], 10, 1, [['pao-integral', 50], ['frango-desfiado', 70], ['cenoura', 30], ['alface', 15], ['requeijao', 20]], ['Misture frango, cenoura e requeijão.', 'Monte no pão com a alface.']),
  R('cuscuz-frango', 'Cuscuz com frango e legumes', MAIN, 25, 1, [['cuscuz', 160], ['frango-desfiado', 100], ['tomate', 50], ['pimentao', 40]], ['Cozinhe o cuscuz no vapor.', 'Refogue frango, tomate e pimentão e misture.']),
  R('salmao-integral', 'Salmão com arroz integral e brócolis', MAIN, 25, 3, [['salmao', 120], ['arroz-integral', 120], ['brocolis', 90], ['limao', 15]], ['Grelhe o salmão com sal e limão.', 'Sirva com arroz integral e brócolis no vapor.']),
  R('carne-mandioca', 'Carne de panela com mandioca', MAIN, 50, 2, [['carne-panela', 110], ['mandioca', 130], ['cenoura', 60], ['couve', 30]], ['Cozinhe a carne na pressão com temperos por 30 minutos.', 'Junte mandioca e cenoura e cozinhe até amaciar.']),
  R('lombo-abobora', 'Lombo com purê de abóbora', MAIN, 40, 2, [['lombo', 110], ['abobora', 150], ['arroz-branco', 100], ['repolho', 60]], ['Asse o lombo temperado.', 'Amasse a abóbora cozida e sirva com arroz e repolho.']),
  R('estrogonofe-arroz', 'Estrogonofe de frango com arroz', MAIN, 30, 2, [['estrogonofe', 180], ['arroz-branco', 130], ['alface', 30], ['tomate', 50]], ['Doure o frango em cubos e junte molho de tomate e creme de leite.', 'Sirva com arroz e salada.']),
  R('omelete-salada', 'Omelete de legumes com salada', ['jantar', 'almoco'], 12, 1, [['ovo-cozido', 100], ['queijo-minas', 30], ['tomate', 60], ['alface', 40], ['pao-integral', 25], ['azeite', 4]], ['Bata os ovos com tomate e queijo e doure na frigideira.', 'Sirva com salada e uma fatia de pão.']),

  // pratos sem carne
  R('sopa-lentilha', 'Sopa de lentilha com legumes', ['jantar', 'almoco', 'ceia'], 30, 1, [['lentilha', 200], ['cenoura', 60], ['batata-inglesa', 90], ['cebola', 30], ['azeite', 5]], ['Refogue a cebola e junte lentilha, cenoura e batata.', 'Cubra com água e cozinhe até amaciar.']),
  R('grao-bico-curry', 'Grão-de-bico ao curry com espinafre', MAIN, 25, 2, [['grao-de-bico', 150], ['arroz-branco', 110], ['tomate', 90], ['espinafre', 60], ['azeite', 5]], ['Refogue tomate com curry e alho.', 'Junte grão-de-bico e espinafre e cozinhe por 10 minutos.']),
  R('lentilha-arroz', 'Arroz com lentilha e cebola dourada', MAIN, 30, 1, [['lentilha', 140], ['arroz-branco', 130], ['cebola', 50], ['pepino', 70], ['azeite', 8]], ['Cozinhe arroz e lentilha juntos.', 'Cubra com a cebola dourada e sirva com pepino.']),
  R('tofu-legumes', 'Tofu salteado com legumes', MAIN, 20, 2, [['tofu', 150], ['brocolis', 90], ['cenoura', 60], ['arroz-integral', 130], ['azeite', 6]], ['Doure o tofu em cubos.', 'Salteie os legumes e misture com shoyu a gosto.']),
  R('pts-bolonhesa', 'Macarrão à bolonhesa de soja', MAIN, 25, 1, [['pts', 120], ['macarrao', 170], ['tomate', 110], ['cebola', 25], ['azeite', 5]], ['Hidrate a soja em água quente e esprema.', 'Refogue com cebola e tomate e misture ao macarrão.']),
  R('salada-grao-bico', 'Salada de grão-de-bico', ['almoco', 'jantar', 'lanche'], 10, 1, [['grao-de-bico', 150], ['tomate', 90], ['pepino', 90], ['cebola', 20], ['azeite', 8], ['limao', 15]], ['Pique tudo e misture.', 'Tempere com azeite, limão e sal.']),
  R('berinjela-recheada', 'Berinjela recheada com lentilha', MAIN, 40, 2, [['berinjela', 220], ['lentilha', 120], ['tomate', 70], ['mucarela', 30], ['arroz-branco', 90]], ['Asse a berinjela e retire o miolo.', 'Misture o miolo com lentilha e tomate, recheie, cubra com queijo e gratine.']),
  R('creme-abobora', 'Creme de abóbora com lentilha', ['jantar', 'ceia'], 30, 1, [['abobora', 220], ['lentilha', 110], ['cebola', 30], ['azeite', 5]], ['Cozinhe abóbora e cebola e bata até virar creme.', 'Junte a lentilha cozida e acerte o sal.']),
  R('feijao-tropeiro-veg', 'Feijão com farinha, couve e ovo', MAIN, 20, 1, [['feijao-carioca', 150], ['farinha-mandioca', 20], ['couve', 50], ['ovo-cozido', 50], ['arroz-branco', 90]], ['Refogue o feijão escorrido com alho.', 'Misture a farinha e sirva com couve e ovo.']),

  // lanches e ceia
  R('fruta-castanha', 'Maçã com castanhas', ['lanche'], 2, 2, [['maca', 130], ['castanha-caju', 15]], ['Sirva a fruta com as castanhas.']),
  R('iogurte-mel', 'Iogurte com mel e aveia', ['lanche', 'ceia'], 3, 1, [['iogurte-natural', 170], ['mel', 10], ['aveia', 10]], ['Misture tudo numa tigela.']),
  R('banana-amendoim', 'Banana com pasta de amendoim', ['lanche'], 2, 1, [['banana', 70], ['pasta-amendoim', 15]], ['Corte a banana e cubra com a pasta.']),
  R('ovos-tomate', 'Ovos cozidos com tomate', ['lanche', 'ceia'], 10, 1, [['ovo-cozido', 100], ['tomate', 60]], ['Cozinhe os ovos por 9 minutos e sirva com tomate.']),
  R('pao-queijo-minas', 'Pão integral com queijo minas', ['lanche', 'cafe'], 3, 1, [['pao-integral', 50], ['queijo-minas', 30], ['tomate', 30]], ['Monte o sanduíche e, se quiser, aqueça.']),
  R('pipoca-simples', 'Pipoca na panela', ['lanche'], 6, 1, [['pipoca', 30]], ['Estoure o milho numa panela tampada com pouco óleo.']),
  R('homus-cenoura', 'Homus com palitos de cenoura', ['lanche'], 10, 1, [['grao-de-bico', 80], ['azeite', 5], ['limao', 10], ['cenoura', 90]], ['Bata grão-de-bico, azeite, limão e sal.', 'Sirva com a cenoura em palitos.']),
  R('vitamina-mamao', 'Vitamina de mamão', ['lanche', 'cafe'], 4, 1, [['mamao', 150], ['leite-integral', 150], ['aveia', 10]], ['Bata tudo no liquidificador.']),
  R('morango-iogurte', 'Morango com iogurte', ['lanche', 'ceia'], 3, 2, [['morango', 120], ['iogurte-natural', 120]], ['Corte os morangos e cubra com o iogurte.']),
  R('goiaba-amendoim', 'Goiaba com amendoim', ['lanche'], 2, 1, [['goiaba', 170], ['amendoim', 15]], ['Sirva a fruta com o amendoim.']),
  R('laranja-nozes', 'Laranja com nozes', ['lanche', 'ceia'], 3, 2, [['laranja', 140], ['nozes', 12]], ['Descasque a laranja e sirva com as nozes.']),
  R('banana-chia', 'Banana amassada com chia', ['ceia', 'lanche'], 3, 1, [['banana', 70], ['chia', 8]], ['Amasse a banana, junte a chia e canela a gosto.']),
];

const byId = new Map(RECIPES.map((r) => [r.id, r]));
const byName = new Map(RECIPES.map((r) => [foldText(r.name), r]));

export const recipeById = (id: string): Recipe | undefined => byId.get(id);
export const recipeByName = (name: string): Recipe | undefined => byName.get(foldText(name));

/** Nutrientes de uma porção da receita, multiplicados por `factor`. */
export function recipeNutrients(r: Recipe, factor = 1): Nutrients {
  let total = ZERO_NUTRIENTS;
  for (const [id, grams] of r.items) {
    const food = foodById(id);
    if (food) total = addNutrients(total, nutrientsOf(food, grams * factor));
  }
  return total;
}

export function recipeTraits(r: Recipe): Set<FoodTrait> {
  return new Set(r.items.flatMap(([id]) => foodById(id)?.has ?? []));
}

/** A receita serve a quem tem estas restrições e não gosta destes alimentos? */
export function recipeAllowed(r: Recipe, restrictions: Restriction[], dislikes: string[] = []): boolean {
  const traits = recipeTraits(r);
  for (const id of restrictions) {
    if (RESTRICTIONS.find((x) => x.id === id)?.blocks.some((b) => traits.has(b))) return false;
  }
  const words = dislikes.map(foldText).filter(Boolean);
  if (!words.length) return true;
  return !r.items.some(([id]) => {
    const f = foodById(id);
    const text = foldText(`${f?.name ?? ''} ${f?.aka ?? ''}`);
    return words.some((w) => text.includes(w));
  });
}
