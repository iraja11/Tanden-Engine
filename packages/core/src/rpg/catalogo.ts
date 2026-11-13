import { sameTitle } from '../caderno/markdown';
import { parseMoney } from './coins';
import { ARMORS } from './regras5e';
import type { ItemCard, Rarity } from './items';

/*
 * Catálogo do equipamento comum do D&D 5e (SRD 5.2, revisão de 2024):
 * armas com maestria, armaduras, escudo, equipamento de aventura, munição,
 * poções e outros consumíveis. Pesos em kg e alcances em metros.
 *
 * Serve para três coisas: sugerir nomes ao escrever no inventário, mostrar
 * uma carta para um item comum mesmo sem nota, e saber o que um item faz
 * ao ser equipado (vira ataque, muda a CA) ou usado (cura).
 */

export type ItemKind = 'arma' | 'armadura' | 'escudo' | 'munição' | 'consumível' | 'ferramenta' | 'foco' | 'equipamento';

export interface CatalogEntry {
  name: string;
  aliases: string[];
  kind: ItemKind;
  /** como aparece na carta: "Arma marcial corpo a corpo" */
  category: string;
  rarity: Rarity;
  damage: string;
  ac: string;
  properties: string[];
  /** maestria da arma (2024) */
  mastery: string;
  /** kg */
  weight: number;
  /** "15 po" */
  price: string;
  /** cura ao usar: "2d4+2" */
  heal: string;
  description: string;
}

/** O que cada maestria faz (resumo). */
export const MASTERIES: Record<string, string> = {
  Trespassar: 'Ao acertar, pode atacar outra criatura a até 1,5 m do alvo (uma vez por turno); esse dano não soma o modificador, a não ser que seja negativo.',
  Raspão: 'Ao errar, o alvo ainda sofre dano igual ao modificador do atributo usado no ataque.',
  'Corte Rápido': 'O ataque extra da propriedade Leve sai junto da ação Atacar, sem gastar a ação bônus (uma vez por turno).',
  Empurrão: 'Ao acertar, empurra o alvo (Grande ou menor) até 3 m para longe de você.',
  Enfraquecer: 'Ao acertar, o alvo tem desvantagem na próxima jogada de ataque dele antes do seu próximo turno.',
  Lentidão: 'Ao acertar e causar dano, o deslocamento do alvo cai 3 m até o começo do seu próximo turno.',
  Derrubar: 'Ao acertar, o alvo faz salvaguarda de Constituição (CD 8 + modificador + proficiência) ou fica Caído.',
  Atormentar: 'Ao acertar e causar dano, você tem vantagem no próximo ataque contra esse alvo até o fim do seu próximo turno.',
};

type W = [name: string, cat: string, damage: string, props: string, mastery: string, kg: number, price: string, aliases?: string];

const SM = 'Arma simples corpo a corpo';
const SR = 'Arma simples à distância';
const MM = 'Arma marcial corpo a corpo';
const MR = 'Arma marcial à distância';

const WEAPONS: W[] = [
  ['Adaga', SM, '1d4 perfurante', 'Acuidade, Leve, Arremesso (6/18 m)', 'Corte Rápido', 0.5, '2 po', 'punhal, dagger'],
  ['Azagaia', SM, '1d6 perfurante', 'Arremesso (9/36 m)', 'Lentidão', 1, '5 pp', 'dardo de arremesso, javelin'],
  ['Bordão', SM, '1d6 concussão', 'Versátil (1d8)', 'Derrubar', 2, '2 pp', 'cajado, quarterstaff'],
  ['Clava', SM, '1d4 concussão', 'Leve', 'Lentidão', 1, '1 pp', 'porrete, club'],
  ['Clava Grande', SM, '1d8 concussão', 'Duas Mãos', 'Empurrão', 5, '2 pp', 'greatclub'],
  ['Foice Curta', SM, '1d4 cortante', 'Leve', 'Corte Rápido', 1, '1 po', 'foice, sickle'],
  ['Lança', SM, '1d6 perfurante', 'Arremesso (6/18 m), Versátil (1d8)', 'Enfraquecer', 1.5, '1 po', 'spear'],
  ['Maça', SM, '1d6 concussão', '', 'Enfraquecer', 2, '5 po', 'mace'],
  ['Machadinha', SM, '1d6 cortante', 'Leve, Arremesso (6/18 m)', 'Atormentar', 1, '5 po', 'handaxe, machado de mão'],
  ['Martelo Leve', SM, '1d4 concussão', 'Leve, Arremesso (6/18 m)', 'Corte Rápido', 1, '2 po', 'light hammer'],
  ['Arco Curto', SR, '1d6 perfurante', 'Munição (24/96 m; flecha), Duas Mãos', 'Atormentar', 1, '25 po', 'shortbow'],
  ['Besta Leve', SR, '1d8 perfurante', 'Munição (24/96 m; virote), Recarga, Duas Mãos', 'Lentidão', 2.5, '25 po', 'light crossbow'],
  ['Dardo', SR, '1d4 perfurante', 'Acuidade, Arremesso (6/18 m)', 'Atormentar', 0.1, '5 pc', 'dart'],
  ['Funda', SR, '1d4 concussão', 'Munição (9/36 m; bala)', 'Lentidão', 0, '1 pp', 'sling, estilingue'],
  ['Alabarda', MM, '1d10 cortante', 'Pesada, Alcance, Duas Mãos', 'Trespassar', 3, '20 po', 'halberd'],
  ['Chicote', MM, '1d4 cortante', 'Acuidade, Alcance', 'Lentidão', 1.5, '2 po', 'whip'],
  ['Cimitarra', MM, '1d6 cortante', 'Acuidade, Leve', 'Corte Rápido', 1.5, '25 po', 'scimitar'],
  ['Espada Curta', MM, '1d6 perfurante', 'Acuidade, Leve', 'Atormentar', 1, '10 po', 'shortsword, gládio'],
  ['Espada Grande', MM, '2d6 cortante', 'Pesada, Duas Mãos', 'Raspão', 3, '50 po', 'montante, espadão, greatsword'],
  ['Espada Longa', MM, '1d8 cortante', 'Versátil (1d10)', 'Enfraquecer', 1.5, '15 po', 'longsword'],
  ['Glaive', MM, '1d10 cortante', 'Pesada, Alcance, Duas Mãos', 'Raspão', 3, '20 po', 'glaive'],
  ['Lança de Montaria', MM, '1d10 perfurante', 'Pesada, Alcance, Duas Mãos (exceto montado)', 'Derrubar', 3, '10 po', 'lance'],
  ['Maça Estrela', MM, '1d8 perfurante', '', 'Enfraquecer', 2, '15 po', 'morningstar, estrela da manhã'],
  ['Machado de Batalha', MM, '1d8 cortante', 'Versátil (1d10)', 'Derrubar', 2, '10 po', 'battleaxe'],
  ['Machado Grande', MM, '1d12 cortante', 'Pesada, Duas Mãos', 'Trespassar', 3.5, '30 po', 'greataxe, machado de guerra'],
  ['Malho', MM, '2d6 concussão', 'Pesada, Duas Mãos', 'Derrubar', 5, '10 po', 'maul, marreta'],
  ['Mangual', MM, '1d8 concussão', '', 'Enfraquecer', 1, '10 po', 'flail'],
  ['Martelo de Guerra', MM, '1d8 concussão', 'Versátil (1d10)', 'Empurrão', 2.5, '15 po', 'warhammer'],
  ['Picareta de Guerra', MM, '1d8 perfurante', 'Versátil (1d10)', 'Enfraquecer', 1, '5 po', 'war pick, picareta'],
  ['Pique', MM, '1d10 perfurante', 'Pesada, Alcance, Duas Mãos', 'Empurrão', 9, '5 po', 'pike'],
  ['Rapieira', MM, '1d8 perfurante', 'Acuidade', 'Atormentar', 1, '25 po', 'rapier, florete'],
  ['Tridente', MM, '1d8 perfurante', 'Arremesso (6/18 m), Versátil (1d10)', 'Derrubar', 2, '5 po', 'trident'],
  ['Arco Longo', MR, '1d8 perfurante', 'Munição (45/180 m; flecha), Pesada, Duas Mãos', 'Lentidão', 1, '50 po', 'longbow'],
  ['Besta de Mão', MR, '1d6 perfurante', 'Munição (9/36 m; virote), Leve, Recarga', 'Atormentar', 1.5, '75 po', 'hand crossbow'],
  ['Besta Pesada', MR, '1d10 perfurante', 'Munição (30/120 m; virote), Pesada, Recarga, Duas Mãos', 'Empurrão', 9, '50 po', 'heavy crossbow'],
  ['Mosquete', MR, '1d12 perfurante', 'Munição (12/36 m; bala), Recarga, Duas Mãos', 'Lentidão', 5, '500 po', 'musket, arcabuz'],
  ['Pistola', MR, '1d10 perfurante', 'Munição (9/27 m; bala), Recarga', 'Atormentar', 1.5, '250 po', 'pistol'],
  ['Zarabatana', MR, '1 perfurante', 'Munição (7,5/30 m; agulha), Recarga', 'Atormentar', 0.5, '10 po', 'blowgun'],
];

/** peso (kg) e preço das armaduras, na ordem de ARMORS */
const ARMOR_EXTRA: Record<string, [number, string]> = {
  'Acolchoada': [4, '5 po'], 'Couro': [5, '10 po'], 'Couro batido': [6.5, '45 po'],
  'Gibão de peles': [6, '10 po'], 'Camisão de malha': [10, '50 po'], 'Brunea': [22.5, '50 po'], 'Peitoral': [10, '400 po'], 'Meia-armadura': [20, '750 po'],
  'Cota de anéis': [20, '30 po'], 'Cota de malha': [27.5, '75 po'], 'Cota de talas': [30, '200 po'], 'Placas': [32.5, '1500 po'],
};

type G = [name: string, kind: ItemKind, kg: number, price: string, description: string, extra?: { heal?: string; damage?: string; rarity?: Rarity; aliases?: string }];

const GEAR: G[] = [
  ['Mochila', 'equipamento', 2.5, '2 po', 'Guarda até 15 kg de equipamento.', { aliases: 'backpack' }],
  ['Saco de Dormir', 'equipamento', 3.5, '1 po', 'Para dormir ao relento sem passar frio.', { aliases: 'bedroll' }],
  ['Barraca', 'equipamento', 10, '2 po', 'Abriga até duas criaturas Pequenas ou Médias.', { aliases: 'tent' }],
  ['Corda de Cânhamo (15 m)', 'equipamento', 2.5, '1 po', 'Corda resistente; dá para amarrar alguém (CD 15 para se soltar).', { aliases: 'corda, rope' }],
  ['Gancho de Escalada', 'equipamento', 2, '2 po', 'Preso numa corda, ajuda a subir paredes e muros.', { aliases: 'grappling hook' }],
  ['Pé de Cabra', 'equipamento', 2.5, '2 po', 'Vantagem em testes de Força quando a alavanca ajuda.', { aliases: 'crowbar' }],
  ['Tocha', 'consumível', 0.5, '1 pc', 'Queima por 1 hora: luz plena num raio de 6 m e penumbra por mais 6 m.', { aliases: 'torch' }],
  ['Lanterna Coberta', 'equipamento', 1, '5 po', 'Queima 1 frasco de óleo por 6 horas: luz plena de 9 m e penumbra por mais 9 m.', { aliases: 'lanterna, hooded lantern' }],
  ['Óleo (frasco)', 'consumível', 0.5, '1 pp', 'Combustível de lanterna; espalhado no chão, pega fogo.', { aliases: 'óleo, oil' }],
  ['Pederneira', 'equipamento', 0.5, '5 pp', 'Acende uma tocha ou fogueira com uma ação bônus.', { aliases: 'isqueiro, tinderbox' }],
  ['Rações (1 dia)', 'consumível', 1, '5 pp', 'Comida seca para um dia de viagem.', { aliases: 'rações, ração, rations' }],
  ['Cantil', 'equipamento', 2.5, '2 pp', 'Leva 2 litros de líquido (o peso é cheio).', { aliases: 'odre, waterskin' }],
  ['Algemas', 'equipamento', 3, '2 po', 'Prendem uma criatura Pequena ou Média (CD 20 para escapar).', { aliases: 'manacles' }],
  ['Espelho', 'equipamento', 0.25, '5 po', 'Espelho de aço, de mão.', { aliases: 'mirror' }],
  ['Kit de Curandeiro', 'consumível', 1.5, '5 po', '10 usos. Uma ação e um uso estabilizam uma criatura com 0 PV, sem teste.', { aliases: 'healer kit' }],
  ['Kit de Escalada', 'ferramenta', 6, '25 po', 'Pitões, luvas e arreio: você não cai mais de 7,5 m.', { aliases: 'climber kit' }],
  ['Ferramentas de Ladrão', 'ferramenta', 0.5, '25 po', 'Abrir fechaduras e desarmar armadilhas.', { aliases: 'thieves tools' }],
  ['Livro de Magias', 'foco', 1.5, '50 po', 'Onde o mago guarda as magias que conhece.', { aliases: 'grimório, spellbook' }],
  ['Bolsa de Componentes', 'foco', 1, '25 po', 'Substitui componentes materiais sem custo.', { aliases: 'component pouch' }],
  ['Foco Arcano (Cristal)', 'foco', 0.5, '10 po', 'Foco de conjuração para bruxos, feiticeiros e magos.', { aliases: 'foco arcano, cristal, orbe' }],
  ['Símbolo Sagrado (Amuleto)', 'foco', 0.5, '5 po', 'Foco de conjuração para clérigos e paladinos.', { aliases: 'símbolo sagrado, holy symbol' }],
  ['Flechas (20)', 'munição', 0.5, '1 po', 'Munição para arcos.', { aliases: 'flechas, arrows' }],
  ['Virotes (20)', 'munição', 0.75, '1 po', 'Munição para bestas.', { aliases: 'virotes, bolts' }],
  ['Balas de Funda (20)', 'munição', 0.75, '4 pc', 'Munição para fundas.', { aliases: 'balas, bullets' }],
  ['Antitoxina', 'consumível', 0, '50 po', 'Ao beber, vantagem nas salvaguardas contra veneno por 1 hora.', { aliases: 'antitoxin' }],
  ['Fogo Alquímico', 'consumível', 0.5, '50 po', 'Arremessado (6 m): 1d4 de fogo no início de cada turno até alguém apagar.', { damage: '1d4 fogo', aliases: 'alchemist fire' }],
  ['Ácido (frasco)', 'consumível', 0.5, '25 po', 'Arremessado (6 m): salvaguarda de Destreza ou 2d6 de ácido.', { damage: '2d6 ácido', aliases: 'ácido, acid' }],
  ['Água Benta (frasco)', 'consumível', 0.5, '25 po', 'Arremessada (6 m) em corruptor ou morto-vivo: salvaguarda de Destreza ou 2d8 radiante.', { damage: '2d8 radiante', aliases: 'água benta, holy water' }],
  ['Poção de Cura', 'consumível', 0.25, '50 po', 'Ao beber, recupera 2d4 + 2 PV.', { heal: '2d4+2', aliases: 'potion of healing' }],
  ['Poção de Cura Maior', 'consumível', 0.25, '', 'Ao beber, recupera 4d4 + 4 PV.', { heal: '4d4+4', rarity: 'incomum', aliases: 'greater healing' }],
  ['Poção de Cura Superior', 'consumível', 0.25, '', 'Ao beber, recupera 8d4 + 8 PV.', { heal: '8d4+8', rarity: 'raro', aliases: 'superior healing' }],
  ['Poção de Cura Suprema', 'consumível', 0.25, '', 'Ao beber, recupera 10d4 + 20 PV.', { heal: '10d4+20', rarity: 'muito raro', aliases: 'supreme healing' }],
];

const split = (s: string) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);

export const CATALOG: CatalogEntry[] = [
  ...WEAPONS.map(([name, category, damage, props, mastery, weight, price, aliases]): CatalogEntry => ({
    name, aliases: aliases ? split(aliases) : [], kind: 'arma', category, rarity: 'comum', damage, ac: '', properties: split(props), mastery, weight, price,
    heal: '', description: MASTERIES[mastery] ?? '',
  })),
  ...ARMORS.map((a): CatalogEntry => {
    const [weight, price] = ARMOR_EXTRA[a.name] ?? [0, ''];
    const dex = a.kind === 'leve' ? ' + Des' : a.kind === 'média' ? ' + Des (máx. 2)' : '';
    return {
      name: a.name, aliases: a.aliases, kind: 'armadura', category: `Armadura ${a.kind}`, rarity: 'comum', damage: '', ac: `${a.base}${dex}`,
      properties: [...(a.str ? [`Força ${a.str}`] : []), ...(a.stealth ? ['Desvantagem em Furtividade'] : [])], mastery: '', weight, price, heal: '',
      description: `Vestir leva ${a.kind === 'leve' ? '1 minuto' : a.kind === 'média' ? '5 minutos' : '10 minutos'}; tirar, ${a.kind === 'pesada' ? '5 minutos' : '1 minuto'}.`,
    };
  }),
  { name: 'Escudo', aliases: ['broquel', 'shield'], kind: 'escudo', category: 'Escudo', rarity: 'comum', damage: '', ac: '+2', properties: ['Uma mão'], mastery: '',
    weight: 3, price: '10 po', heal: '', description: 'Empunhar ou guardar leva uma ação (Utilizar).' },
  ...GEAR.map(([name, kind, weight, price, description, x]): CatalogEntry => ({
    name, aliases: x?.aliases ? split(x.aliases) : [], kind, category: kind === 'consumível' ? (x?.heal ? 'Poção' : 'Consumível') : kind === 'munição' ? 'Munição'
      : kind === 'ferramenta' ? 'Ferramenta' : kind === 'foco' ? 'Foco de conjuração' : 'Equipamento de aventura',
    rarity: x?.rarity ?? 'comum', damage: x?.damage ?? '', ac: '', properties: [], mastery: '', weight, price, heal: x?.heal ?? '', description,
  })),
];

const clean = (s: string) => s.replace(/^\s*!?\[\[|\]\]\s*$/g, '').split('|').pop()!.replace(/\s*\+\d+\s*$/, '').trim();

/** Entrada do catálogo pelo nome ("Espada Longa +1" → Espada Longa). */
export function catalogEntry(name: string): CatalogEntry | null {
  const n = clean(name);
  if (!n) return null;
  return CATALOG.find((e) => sameTitle(e.name, n) || e.aliases.some((a) => sameTitle(a, n))) ?? null;
}

/** Bônus mágico escrito no nome: "Espada Longa +1" → 1. */
export const magicBonus = (name: string): number => Number(/\+(\d+)\s*(?:\]\])?\s*$/.exec(name.replace(/\|.*$/, ''))?.[1] ?? 0);

/** Carta de um item comum (sem nota). */
export function catalogCard(e: CatalogEntry, label = e.name): ItemCard {
  const bonus = magicBonus(label);
  return {
    name: label,
    rarity: bonus >= 3 ? 'muito raro' : bonus === 2 ? 'raro' : bonus === 1 ? 'incomum' : e.rarity,
    category: e.category,
    damage: e.damage,
    ac: e.ac,
    value: e.price ? parseMoney(e.price) : null,
    valueText: e.price,
    weight: e.weight || null,
    attunement: false,
    properties: [...e.properties, ...(e.mastery ? [`Maestria: ${e.mastery}`] : [])],
    image: null,
    description: e.description,
    charges: null,
    heal: e.heal,
  };
}
