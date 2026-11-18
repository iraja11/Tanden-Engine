/*
 * Tabela de alimentos do dia a dia brasileiro.
 *
 * Valores aproximados por 100 g do alimento como é comido (cozido, quando é o
 * caso), arredondados a partir de tabelas públicas de composição. Servem para
 * acompanhar a alimentação, não para prescrição: rótulos e preparos variam.
 */

export type FoodGroup =
  | 'cereais' | 'paes' | 'leguminosas' | 'verduras' | 'frutas' | 'carnes' | 'peixes' | 'ovos'
  | 'laticinios' | 'gorduras' | 'oleaginosas' | 'doces' | 'prontos' | 'bebidas';

/** O que o alimento contém, para respeitar restrições e alergias. */
export type FoodTrait = 'carne' | 'peixe' | 'ovo' | 'leite' | 'gluten' | 'amendoim' | 'castanha' | 'soja' | 'mel';

export interface Nutrients {
  kcal: number;
  /** proteína, carboidrato, gordura e fibra, em gramas */
  p: number;
  c: number;
  g: number;
  f: number;
}

export interface Food extends Nutrients {
  id: string;
  name: string;
  group: FoodGroup;
  /** medida caseira */
  portion: { label: string; grams: number };
  has: FoodTrait[];
  /** outros nomes pelos quais a pessoa procura */
  aka?: string;
  /** como comprar: nome no mercado e quanto do cru rende 1 g do pronto */
  buy?: { name: string; factor: number };
  /** compra-se por unidade (a medida caseira é uma unidade) */
  unit?: boolean;
}

type Extra = Partial<Pick<Food, 'has' | 'aka' | 'buy' | 'unit'>>;

const F = (id: string, name: string, group: FoodGroup, n: [number, number, number, number, number], portion: [string, number], extra: Extra = {}): Food => ({
  id, name, group, kcal: n[0], p: n[1], c: n[2], g: n[3], f: n[4], portion: { label: portion[0], grams: portion[1] }, has: [], ...extra,
});

const buy = (name: string, factor = 1) => ({ buy: { name, factor } });

export const FOODS: Food[] = [
  // cereais, raízes e tubérculos
  F('arroz-branco', 'Arroz branco cozido', 'cereais', [128, 2.5, 28.1, 0.2, 1.6], ['escumadeira', 90], buy('Arroz branco', 0.4)),
  F('arroz-integral', 'Arroz integral cozido', 'cereais', [124, 2.6, 25.8, 1, 2.7], ['escumadeira', 90], buy('Arroz integral', 0.4)),
  F('macarrao', 'Macarrão cozido', 'cereais', [158, 5.8, 30.9, 0.9, 1.8], ['pegador', 110], { has: ['gluten'], aka: 'massa espaguete', ...buy('Macarrão', 0.45) }),
  F('cuscuz', 'Cuscuz de milho cozido', 'cereais', [113, 2.2, 25.3, 0.7, 2.1], ['fatia', 100], { aka: 'flocão', ...buy('Flocão de milho', 0.45) }),
  F('tapioca', 'Tapioca (goma)', 'cereais', [240, 0, 60, 0, 0.4], ['tapioca média', 60], { aka: 'beiju', ...buy('Goma de tapioca') }),
  F('aveia', 'Aveia em flocos', 'cereais', [394, 13.9, 66.6, 8.5, 9.1], ['colher de sopa', 15], { has: ['gluten'], ...buy('Aveia em flocos') }),
  F('granola', 'Granola', 'cereais', [420, 10, 66, 13, 7], ['colher de sopa', 12], { has: ['gluten'], ...buy('Granola') }),
  F('batata-inglesa', 'Batata cozida', 'cereais', [52, 1.2, 11.9, 0, 1.3], ['unidade média', 100], { aka: 'batata inglesa', ...buy('Batata-inglesa') }),
  F('pure-batata', 'Purê de batata', 'cereais', [90, 1.9, 13.5, 3.2, 1.2], ['colher de servir', 60], { has: ['leite'] }),
  F('batata-doce', 'Batata-doce cozida', 'cereais', [77, 0.6, 18.4, 0.1, 2.2], ['unidade média', 120], buy('Batata-doce')),
  F('mandioca', 'Mandioca cozida', 'cereais', [125, 0.6, 30.1, 0.3, 1.6], ['pedaço', 100], { aka: 'aipim macaxeira', ...buy('Mandioca') }),
  F('inhame', 'Inhame cozido', 'cereais', [97, 2.1, 23.2, 0.2, 1.7], ['pedaço', 100], buy('Inhame')),
  F('milho-verde', 'Milho verde', 'cereais', [98, 3.2, 17.1, 2.4, 3.9], ['colher de sopa', 25], buy('Milho verde')),
  F('farinha-mandioca', 'Farinha de mandioca', 'cereais', [365, 1.2, 89.2, 0.3, 6.5], ['colher de sopa', 15], buy('Farinha de mandioca')),
  F('farofa', 'Farofa pronta', 'cereais', [406, 2.1, 80.3, 9.1, 7.8], ['colher de sopa', 15]),
  F('pipoca', 'Pipoca', 'cereais', [448, 9.9, 70.3, 15.9, 14.3], ['xícara', 10], buy('Milho de pipoca')),

  // pães e biscoitos
  F('pao-frances', 'Pão francês', 'paes', [300, 8, 58.6, 3.1, 2.3], ['unidade', 50], { has: ['gluten'], aka: 'pão de sal cacetinho', unit: true, ...buy('Pão francês') }),
  F('pao-integral', 'Pão integral', 'paes', [253, 9.4, 49.9, 3.7, 6.9], ['fatia', 25], { has: ['gluten'], aka: 'pão de forma', unit: true, ...buy('Pão integral (fatias)') }),
  F('pao-queijo', 'Pão de queijo', 'paes', [363, 5.1, 34.2, 24.6, 0.6], ['unidade', 40], { has: ['leite', 'ovo'] }),
  F('biscoito-agua-sal', 'Biscoito de água e sal', 'paes', [432, 10.1, 68.7, 14.4, 2.5], ['6 unidades', 36], { has: ['gluten'], aka: 'bolacha cream cracker' }),
  F('biscoito-recheado', 'Biscoito recheado', 'paes', [472, 6.4, 70.5, 19.6, 3], ['3 unidades', 40], { has: ['gluten', 'leite'], aka: 'bolacha' }),
  F('bolo-simples', 'Bolo simples', 'paes', [340, 5, 55, 11, 1], ['fatia', 60], { has: ['gluten', 'leite', 'ovo'] }),

  // leguminosas
  F('feijao-carioca', 'Feijão-carioca cozido', 'leguminosas', [76, 4.8, 13.6, 0.5, 8.5], ['concha', 100], buy('Feijão-carioca', 0.4)),
  F('feijao-preto', 'Feijão-preto cozido', 'leguminosas', [77, 4.5, 14, 0.5, 8.4], ['concha', 100], buy('Feijão-preto', 0.4)),
  F('lentilha', 'Lentilha cozida', 'leguminosas', [93, 6.3, 16.3, 0.5, 7.9], ['concha', 100], buy('Lentilha', 0.4)),
  F('grao-de-bico', 'Grão-de-bico cozido', 'leguminosas', [130, 7, 21, 2.1, 6], ['concha', 100], buy('Grão-de-bico', 0.45)),
  F('ervilha', 'Ervilha cozida', 'leguminosas', [74, 4.6, 13.4, 0.4, 5.1], ['colher de sopa', 25], buy('Ervilha')),
  F('pts', 'Proteína de soja hidratada', 'leguminosas', [105, 15.5, 9.5, 0.3, 4], ['colher de servir', 60], { has: ['soja'], aka: 'pts carne de soja', ...buy('Proteína de soja (PTS)', 0.33) }),
  F('tofu', 'Tofu', 'leguminosas', [64, 6.6, 2.1, 4, 0.8], ['fatia', 60], { has: ['soja'], ...buy('Tofu') }),

  // carnes
  F('frango-peito', 'Peito de frango grelhado', 'carnes', [159, 32, 0, 2.5, 0], ['filé', 100], { has: ['carne'], aka: 'galinha', ...buy('Peito de frango', 1.35) }),
  F('frango-desfiado', 'Frango desfiado', 'carnes', [163, 31.5, 0, 3.2, 0], ['colher de servir', 50], { has: ['carne'], aka: 'galinha', ...buy('Peito de frango', 1.35) }),
  F('frango-coxa', 'Coxa de frango assada', 'carnes', [215, 28.5, 0.1, 10.4, 0], ['unidade', 70], { has: ['carne'], aka: 'sobrecoxa galinha', ...buy('Coxa de frango', 1.5) }),
  F('carne-moida', 'Carne moída refogada', 'carnes', [212, 26.7, 0, 10.9, 0], ['colher de servir', 50], { has: ['carne'], aka: 'patinho', ...buy('Carne moída', 1.3) }),
  F('bife', 'Bife grelhado', 'carnes', [241, 31.9, 0, 11.6, 0], ['bife médio', 100], { has: ['carne'], aka: 'alcatra', ...buy('Alcatra', 1.3) }),
  F('carne-panela', 'Carne de panela', 'carnes', [215, 27.3, 0, 10.9, 0], ['pedaço', 80], { has: ['carne'], aka: 'acém músculo', ...buy('Acém', 1.4) }),
  F('lombo', 'Lombo de porco assado', 'carnes', [210, 35.7, 0, 6.4, 0], ['fatia', 80], { has: ['carne'], aka: 'suíno', ...buy('Lombo de porco', 1.3) }),
  F('linguica', 'Linguiça grelhada', 'carnes', [296, 23.2, 0, 21.3, 0], ['gomo', 60], { has: ['carne'] }),
  F('presunto', 'Presunto', 'carnes', [94, 14.3, 2.1, 2.7, 0], ['fatia', 15], { has: ['carne'] }),
  F('peito-peru', 'Peito de peru', 'carnes', [110, 18, 2, 3, 0], ['fatia', 15], { has: ['carne'] }),

  // peixes
  F('tilapia', 'Tilápia grelhada', 'peixes', [128, 26, 0, 2.7, 0], ['filé', 120], { has: ['peixe'], aka: 'peixe', ...buy('Filé de tilápia', 1.3) }),
  F('salmao', 'Salmão grelhado', 'peixes', [243, 26.1, 0, 14.5, 0], ['posta', 120], { has: ['peixe'], aka: 'peixe', ...buy('Salmão', 1.2) }),
  F('sardinha-lata', 'Sardinha em lata', 'peixes', [285, 15.9, 0, 24, 0], ['lata drenada', 85], { has: ['peixe'], aka: 'peixe', ...buy('Sardinha em lata') }),
  F('atum-lata', 'Atum em lata (em água)', 'peixes', [116, 25.5, 0, 0.8, 0], ['lata drenada', 120], { has: ['peixe'], aka: 'peixe', ...buy('Atum em lata') }),

  // ovos
  F('ovo-cozido', 'Ovo cozido', 'ovos', [146, 13.3, 0.6, 9.5, 0], ['unidade', 50], { has: ['ovo'], unit: true, ...buy('Ovos') }),
  F('ovo-frito', 'Ovo frito', 'ovos', [240, 15.6, 1.2, 18.6, 0], ['unidade', 50], { has: ['ovo'], aka: 'ovo mexido', unit: true, ...buy('Ovos') }),
  F('omelete', 'Omelete com queijo', 'ovos', [268, 15.6, 0.4, 22, 0], ['unidade', 120], { has: ['ovo', 'leite'] }),

  // leite e derivados
  F('leite-integral', 'Leite integral', 'laticinios', [60, 3.1, 4.7, 3.3, 0], ['copo', 200], { has: ['leite'], ...buy('Leite integral') }),
  F('leite-desnatado', 'Leite desnatado', 'laticinios', [35, 3.4, 5, 0.1, 0], ['copo', 200], { has: ['leite'], ...buy('Leite desnatado') }),
  F('bebida-soja', 'Bebida de soja', 'laticinios', [40, 3, 3, 1.8, 0.4], ['copo', 200], { has: ['soja'], aka: 'leite de soja', ...buy('Bebida de soja') }),
  F('iogurte-natural', 'Iogurte natural', 'laticinios', [51, 4.1, 1.9, 3, 0], ['pote', 170], { has: ['leite'], ...buy('Iogurte natural') }),
  F('iogurte-desnatado', 'Iogurte natural desnatado', 'laticinios', [41, 3.8, 5.8, 0.3, 0], ['pote', 170], { has: ['leite'] }),
  F('queijo-minas', 'Queijo minas frescal', 'laticinios', [264, 17.4, 3.2, 20.2, 0], ['fatia', 30], { has: ['leite'], aka: 'queijo branco', ...buy('Queijo minas') }),
  F('mucarela', 'Muçarela', 'laticinios', [330, 22.6, 3, 25.2, 0], ['fatia', 20], { has: ['leite'], aka: 'queijo mussarela', ...buy('Muçarela') }),
  F('requeijao', 'Requeijão', 'laticinios', [257, 9.6, 2.4, 23.4, 0], ['colher de sopa', 20], { has: ['leite'], ...buy('Requeijão') }),
  F('cottage', 'Queijo cottage', 'laticinios', [98, 11, 3.4, 4.3, 0], ['colher de sopa', 25], { has: ['leite'] }),

  // verduras e legumes
  F('alface', 'Alface', 'verduras', [11, 1.3, 1.7, 0.2, 1.8], ['prato de sobremesa', 40], { aka: 'salada folhas', ...buy('Alface') }),
  F('tomate', 'Tomate', 'verduras', [15, 1.1, 3.1, 0.2, 1.2], ['unidade média', 100], { aka: 'salada', ...buy('Tomate') }),
  F('cenoura', 'Cenoura', 'verduras', [34, 1.3, 7.7, 0.2, 3.2], ['colher de sopa ralada', 25], buy('Cenoura')),
  F('brocolis', 'Brócolis cozido', 'verduras', [25, 2.1, 4.4, 0.5, 3.4], ['ramo', 40], buy('Brócolis')),
  F('couve', 'Couve refogada', 'verduras', [90, 1.7, 8.7, 6.6, 5.7], ['colher de servir', 40], buy('Couve', 0.8)),
  F('abobrinha', 'Abobrinha cozida', 'verduras', [15, 1.1, 3, 0.2, 1.6], ['colher de servir', 60], buy('Abobrinha')),
  F('chuchu', 'Chuchu cozido', 'verduras', [19, 0.4, 4.8, 0, 1], ['colher de servir', 60], buy('Chuchu')),
  F('abobora', 'Abóbora cozida', 'verduras', [48, 1.4, 10.8, 0.7, 2.5], ['pedaço', 100], { aka: 'jerimum moranga', ...buy('Abóbora') }),
  F('beterraba', 'Beterraba cozida', 'verduras', [32, 1.3, 7.2, 0.1, 1.9], ['colher de sopa', 25], buy('Beterraba')),
  F('repolho', 'Repolho', 'verduras', [17, 0.9, 3.9, 0.1, 1.9], ['colher de servir', 40], buy('Repolho')),
  F('pepino', 'Pepino', 'verduras', [10, 0.9, 2, 0, 1.1], ['unidade média', 120], buy('Pepino')),
  F('cebola', 'Cebola', 'verduras', [39, 1.7, 8.9, 0.1, 2.2], ['unidade média', 100], buy('Cebola')),
  F('espinafre', 'Espinafre refogado', 'verduras', [67, 2.7, 4.2, 5.4, 2.5], ['colher de servir', 40], buy('Espinafre', 0.9)),
  F('berinjela', 'Berinjela cozida', 'verduras', [19, 0.7, 4.5, 0.1, 2.5], ['fatia', 40], buy('Berinjela')),
  F('pimentao', 'Pimentão', 'verduras', [21, 1.1, 4.9, 0.2, 2.6], ['unidade média', 100], buy('Pimentão')),
  F('vagem', 'Vagem cozida', 'verduras', [25, 1.6, 5.3, 0.4, 2.4], ['colher de servir', 40], buy('Vagem')),
  F('cogumelo', 'Cogumelo', 'verduras', [31, 2.5, 5, 0.3, 2.5], ['colher de servir', 40], { aka: 'champignon shimeji', ...buy('Cogumelos') }),

  // frutas
  F('banana', 'Banana', 'frutas', [98, 1.3, 26, 0.1, 2], ['unidade', 70], { unit: true, aka: 'prata nanica', ...buy('Banana') }),
  F('maca', 'Maçã', 'frutas', [56, 0.3, 15.2, 0, 1.3], ['unidade', 130], { unit: true, ...buy('Maçã') }),
  F('laranja', 'Laranja', 'frutas', [37, 1, 8.9, 0.1, 0.8], ['unidade', 140], { unit: true, ...buy('Laranja') }),
  F('mamao', 'Mamão', 'frutas', [40, 0.5, 10.4, 0.1, 1], ['fatia', 150], { aka: 'papaia formosa', ...buy('Mamão') }),
  F('manga', 'Manga', 'frutas', [72, 0.4, 19.4, 0.2, 1.6], ['fatia', 100], buy('Manga')),
  F('abacaxi', 'Abacaxi', 'frutas', [48, 0.9, 12.3, 0.1, 1], ['fatia', 75], buy('Abacaxi')),
  F('melancia', 'Melancia', 'frutas', [33, 0.9, 8.1, 0, 0.1], ['fatia', 200], buy('Melancia')),
  F('morango', 'Morango', 'frutas', [30, 0.9, 6.8, 0.3, 1.7], ['xícara', 120], buy('Morango')),
  F('uva', 'Uva', 'frutas', [53, 0.7, 13.6, 0.2, 0.9], ['cacho pequeno', 100], buy('Uva')),
  F('abacate', 'Abacate', 'frutas', [96, 1.2, 6, 8.4, 6.3], ['colher de sopa', 30], buy('Abacate')),
  F('pera', 'Pera', 'frutas', [53, 0.6, 14, 0.1, 3], ['unidade', 130], { unit: true, ...buy('Pera') }),
  F('kiwi', 'Kiwi', 'frutas', [51, 1.3, 11.5, 0.6, 2.7], ['unidade', 75], { unit: true, ...buy('Kiwi') }),
  F('goiaba', 'Goiaba', 'frutas', [54, 1.1, 13, 0.4, 6.2], ['unidade', 170], { unit: true, ...buy('Goiaba') }),
  F('limao', 'Limão', 'frutas', [32, 0.9, 11.1, 0.1, 1.2], ['unidade', 60], { unit: true, ...buy('Limão') }),
  F('acai', 'Açaí na tigela', 'frutas', [110, 0.7, 21.5, 3.7, 1.7], ['tigela pequena', 300]),

  // gorduras
  F('azeite', 'Azeite', 'gorduras', [884, 0, 0, 100, 0], ['colher de sopa', 13], buy('Azeite')),
  F('oleo', 'Óleo de soja', 'gorduras', [884, 0, 0, 100, 0], ['colher de sopa', 13], { has: ['soja'] }),
  F('manteiga', 'Manteiga', 'gorduras', [726, 0.4, 0, 82.4, 0], ['ponta de faca', 10], { has: ['leite'], ...buy('Manteiga') }),
  F('margarina', 'Margarina', 'gorduras', [596, 0, 0, 67, 0], ['ponta de faca', 10]),
  F('maionese', 'Maionese', 'gorduras', [302, 0.6, 7.9, 30, 0], ['colher de sopa', 12], { has: ['ovo'] }),

  // castanhas e sementes
  F('amendoim', 'Amendoim torrado', 'oleaginosas', [606, 22.5, 18.7, 54, 7.8], ['punhado', 25], { has: ['amendoim'], ...buy('Amendoim') }),
  F('pasta-amendoim', 'Pasta de amendoim', 'oleaginosas', [589, 25, 20, 50, 6], ['colher de sopa', 15], { has: ['amendoim'], ...buy('Pasta de amendoim') }),
  F('castanha-caju', 'Castanha-de-caju', 'oleaginosas', [570, 18.5, 29.1, 46.3, 3.7], ['punhado', 20], { has: ['castanha'], ...buy('Castanha-de-caju') }),
  F('castanha-para', 'Castanha-do-pará', 'oleaginosas', [643, 14.5, 15.1, 63.5, 7.9], ['unidade', 4], { has: ['castanha'], aka: 'castanha do brasil' }),
  F('nozes', 'Nozes', 'oleaginosas', [620, 14, 18.4, 59.4, 7.2], ['punhado', 20], { has: ['castanha'], ...buy('Nozes') }),
  F('chia', 'Chia', 'oleaginosas', [490, 16.5, 42, 31, 34], ['colher de sopa', 10], buy('Chia')),
  F('linhaca', 'Linhaça', 'oleaginosas', [495, 14.1, 43.3, 32.3, 33.5], ['colher de sopa', 10], buy('Linhaça')),

  // doces
  F('acucar', 'Açúcar', 'doces', [387, 0.3, 99.5, 0, 0], ['colher de chá', 5]),
  F('mel', 'Mel', 'doces', [309, 0, 84, 0, 0], ['colher de sopa', 15], { has: ['mel'], ...buy('Mel') }),
  F('chocolate-leite', 'Chocolate ao leite', 'doces', [540, 7.2, 59.6, 30.3, 2.2], ['quadradinho', 25], { has: ['leite'] }),
  F('chocolate-amargo', 'Chocolate amargo', 'doces', [530, 8, 50, 33, 9], ['quadradinho', 25]),
  F('brigadeiro', 'Brigadeiro', 'doces', [380, 4, 60, 13, 1], ['unidade', 20], { has: ['leite'] }),
  F('sorvete', 'Sorvete', 'doces', [200, 3.5, 24, 10, 0.5], ['bola', 60], { has: ['leite'] }),

  // pratos prontos e lanches
  F('coxinha', 'Coxinha', 'prontos', [283, 9.6, 34.5, 11.8, 5], ['unidade', 110], { has: ['carne', 'gluten', 'leite'], aka: 'salgado' }),
  F('pastel', 'Pastel de carne', 'prontos', [389, 10, 36, 21, 1], ['unidade', 80], { has: ['carne', 'gluten'], aka: 'salgado' }),
  F('pizza', 'Pizza de muçarela', 'prontos', [265, 12, 30, 11, 2], ['fatia', 110], { has: ['gluten', 'leite'] }),
  F('hamburguer', 'Hambúrguer completo', 'prontos', [265, 13, 28, 11, 1.5], ['sanduíche', 200], { has: ['carne', 'gluten', 'leite'], aka: 'x-burguer lanche' }),
  F('batata-frita', 'Batata frita', 'prontos', [267, 5, 35.6, 13.1, 8.1], ['porção pequena', 100]),
  F('lasanha', 'Lasanha', 'prontos', [180, 9, 16, 9, 1.2], ['pedaço', 250], { has: ['carne', 'gluten', 'leite', 'ovo'] }),
  F('feijoada', 'Feijoada', 'prontos', [117, 8.7, 11.6, 6.5, 5.1], ['concha', 200], { has: ['carne'] }),
  F('estrogonofe', 'Estrogonofe de frango', 'prontos', [157, 17.6, 2.6, 8, 0.3], ['colher de servir', 90], { has: ['carne', 'leite'], aka: 'strogonoff', ...buy('Estrogonofe (frango e creme de leite)') }),
  F('sopa-legumes', 'Sopa de legumes', 'prontos', [40, 1.6, 6.5, 0.9, 1.2], ['prato fundo', 300]),
  F('salada-maionese', 'Salada de maionese', 'prontos', [155, 2, 10, 12, 1.5], ['colher de servir', 60], { has: ['ovo'] }),

  // bebidas
  F('cafe', 'Café sem açúcar', 'bebidas', [3, 0.2, 0.5, 0, 0], ['xícara', 50], buy('Café')),
  F('cafe-leite', 'Café com leite', 'bebidas', [40, 1.7, 3.5, 1.9, 0], ['xícara', 150], { has: ['leite'] }),
  F('suco-laranja', 'Suco de laranja', 'bebidas', [45, 0.7, 10.2, 0.1, 0.2], ['copo', 200]),
  F('agua-coco', 'Água de coco', 'bebidas', [22, 0, 5.3, 0, 0.1], ['copo', 200]),
  F('refrigerante', 'Refrigerante', 'bebidas', [40, 0, 10.4, 0, 0], ['lata', 350]),
  F('refrigerante-zero', 'Refrigerante zero', 'bebidas', [1, 0, 0, 0, 0], ['lata', 350]),
  F('cerveja', 'Cerveja', 'bebidas', [41, 0.5, 3.6, 0, 0], ['lata', 350]),
];

const byId = new Map(FOODS.map((f) => [f.id, f]));
export const foodById = (id: string): Food | undefined => byId.get(id);

export const foldText = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const byName = new Map(FOODS.map((f) => [foldText(f.name), f]));
export const foodByName = (name: string): Food | undefined => byName.get(foldText(name));

/** Nutrientes de uma quantidade em gramas. */
export function nutrientsOf(n: Nutrients, grams: number): Nutrients {
  const k = grams / 100;
  return { kcal: n.kcal * k, p: n.p * k, c: n.c * k, g: n.g * k, f: n.f * k };
}

export const ZERO_NUTRIENTS: Nutrients = { kcal: 0, p: 0, c: 0, g: 0, f: 0 };

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return { kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, g: a.g + b.g, f: a.f + b.f };
}

/** Procura por nome ou apelido: quem começa com o texto vem primeiro. */
export function searchFoods<T extends Pick<Food, 'name' | 'aka'>>(query: string, pool: T[], limit = 12): T[] {
  const words = foldText(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored: Array<{ f: T; s: number }> = [];
  for (const f of pool) {
    const name = foldText(f.name);
    const all = `${name} ${foldText(f.aka ?? '')}`;
    if (!words.every((w) => all.includes(w))) continue;
    scored.push({ f, s: name.startsWith(words[0]!) ? 0 : name.split(' ').some((p) => p.startsWith(words[0]!)) ? 1 : 2 });
  }
  return scored.sort((a, b) => a.s - b.s || a.f.name.length - b.f.name.length).slice(0, limit).map((x) => x.f);
}
