/*
 * Minecraft: "mata essa ovelha", "mata 3 vacas pra mim", "pode matar aquele
 * zumbi?". Aqui o cérebro entende qual bicho, quantos e se é o que você está
 * mirando ("essa", "aquele", "isso"); o mod acha o bicho, vai atrás e bate,
 * e conta no fim quantos pegou (evento "cacou").
 *
 * Ordem genérica ("me protege", "mata os monstros") continua sendo o modo
 * guarda (`proteger`), que só briga com hostis perto de você.
 */
import { numeroExtenso } from './numeros';
import { dobrar } from './texto';

export type GeneroMob = 'm' | 'f';
/** o que ela sente sobre a caça: bicho de fazenda dá dó; gato ela adora odiar; creeper ela recusa */
export type TipoMob = 'animal' | 'hostil' | 'aldeao' | 'gato' | 'creeper' | 'outro';

export interface Mob {
  /** ids do jogo (sem "minecraft:") */
  ids: string[];
  /** o nome no singular, como ela fala */
  nome: string;
  genero: GeneroMob;
  tipo: TipoMob;
}

/** [regex no texto dobrado (começo do nome, singular ou plural), mob]. O mais específico primeiro. */
const MOBS: Array<[RegExp, Mob]> = [
  [/^(aranhas? (da|de) caverna|aranhas? azu(l|is))\b/, { ids: ['cave_spider'], nome: 'aranha da caverna', genero: 'f', tipo: 'hostil' }],
  [/^aranhas?\b/, { ids: ['spider', 'cave_spider'], nome: 'aranha', genero: 'f', tipo: 'hostil' }],
  [/^(esqueletos? wither|wither skeletons?|esqueletos? do nether)\b/, { ids: ['wither_skeleton'], nome: 'esqueleto wither', genero: 'm', tipo: 'hostil' }],
  [/^(esqueletos? da neve|strays?)\b/, { ids: ['stray'], nome: 'esqueleto da neve', genero: 'm', tipo: 'hostil' }],
  [/^(esqueletos? do pantano|bogged)\b/, { ids: ['bogged'], nome: 'esqueleto do pântano', genero: 'm', tipo: 'hostil' }],
  [/^(esqueletos?|skeletons?)\b/, { ids: ['skeleton', 'stray', 'bogged'], nome: 'esqueleto', genero: 'm', tipo: 'hostil' }],
  [/^(zumbis? piglin|piglins? zumbis?|zombified piglins?)\b/, { ids: ['zombified_piglin'], nome: 'piglin zumbi', genero: 'm', tipo: 'hostil' }],
  [/^(aldeao|aldeoes|aldeaos) zumbis?\b|^zumbis? aldeao\b/, { ids: ['zombie_villager'], nome: 'aldeão zumbi', genero: 'm', tipo: 'hostil' }],
  [/^(zumbis? do deserto|husks?)\b/, { ids: ['husk'], nome: 'zumbi do deserto', genero: 'm', tipo: 'hostil' }],
  [/^(afogados?|drowned)\b/, { ids: ['drowned'], nome: 'afogado', genero: 'm', tipo: 'hostil' }],
  [/^(zumbis?|zombies?)\b/, { ids: ['zombie', 'husk', 'drowned', 'zombie_villager'], nome: 'zumbi', genero: 'm', tipo: 'hostil' }],
  [/^(creepers?|crepers?)\b/, { ids: ['creeper'], nome: 'creeper', genero: 'm', tipo: 'creeper' }],
  [/^(endermans?|endermen|enderm[ae]ns?)\b/, { ids: ['enderman'], nome: 'enderman', genero: 'm', tipo: 'hostil' }],
  [/^endermites?\b/, { ids: ['endermite'], nome: 'endermite', genero: 'm', tipo: 'hostil' }],
  [/^(bruxas?|witch(es)?)\b/, { ids: ['witch'], nome: 'bruxa', genero: 'f', tipo: 'hostil' }],
  [/^(cubos? de magma|magma cubes?)\b/, { ids: ['magma_cube'], nome: 'cubo de magma', genero: 'm', tipo: 'hostil' }],
  [/^slimes?\b/, { ids: ['slime'], nome: 'slime', genero: 'm', tipo: 'hostil' }],
  [/^(phantoms?|fantasmas?)\b/, { ids: ['phantom'], nome: 'phantom', genero: 'm', tipo: 'hostil' }],
  [/^(saqueador(es)?|pillagers?)\b/, { ids: ['pillager'], nome: 'saqueador', genero: 'm', tipo: 'hostil' }],
  [/^(vingador(es)?|vindicators?)\b/, { ids: ['vindicator'], nome: 'vingador', genero: 'm', tipo: 'hostil' }],
  [/^(evocador(es)?|evokers?)\b/, { ids: ['evoker'], nome: 'evocador', genero: 'm', tipo: 'hostil' }],
  [/^(devastador(es)?|ravagers?)\b/, { ids: ['ravager'], nome: 'devastador', genero: 'm', tipo: 'hostil' }],
  [/^(piglins? brutos?|piglin brutes?)\b/, { ids: ['piglin_brute'], nome: 'piglin bruto', genero: 'm', tipo: 'hostil' }],
  [/^piglins?\b/, { ids: ['piglin', 'piglin_brute'], nome: 'piglin', genero: 'm', tipo: 'hostil' }],
  [/^hoglins?\b/, { ids: ['hoglin'], nome: 'hoglin', genero: 'm', tipo: 'hostil' }],
  [/^zoglins?\b/, { ids: ['zoglin'], nome: 'zoglin', genero: 'm', tipo: 'hostil' }],
  [/^blazes?\b/, { ids: ['blaze'], nome: 'blaze', genero: 'm', tipo: 'hostil' }],
  [/^ghasts?\b/, { ids: ['ghast'], nome: 'ghast', genero: 'm', tipo: 'hostil' }],
  [/^(guardi(ao|oes|aes) ancia(o|os|es)|elder guardians?)\b/, { ids: ['elder_guardian'], nome: 'guardião ancião', genero: 'm', tipo: 'hostil' }],
  [/^(guardi(ao|oes|aes)|guardians?)\b/, { ids: ['guardian'], nome: 'guardião', genero: 'm', tipo: 'hostil' }],
  [/^(tracas?|silverfish)\b/, { ids: ['silverfish'], nome: 'traça', genero: 'f', tipo: 'hostil' }],
  [/^shulkers?\b/, { ids: ['shulker'], nome: 'shulker', genero: 'm', tipo: 'hostil' }],
  [/^breezes?\b/, { ids: ['breeze'], nome: 'breeze', genero: 'm', tipo: 'hostil' }],
  [/^wardens?\b/, { ids: ['warden'], nome: 'warden', genero: 'm', tipo: 'hostil' }],
  [/^vex\b/, { ids: ['vex'], nome: 'vex', genero: 'm', tipo: 'hostil' }],
  [/^(rangedor(es)?|creakings?)\b/, { ids: ['creaking'], nome: 'rangedor', genero: 'm', tipo: 'hostil' }],
  [/^(vacas? de cogumelo|mooshrooms?)\b/, { ids: ['mooshroom'], nome: 'vaca de cogumelo', genero: 'f', tipo: 'animal' }],
  [/^(vacas?|bois?|cows?)\b/, { ids: ['cow', 'mooshroom'], nome: 'vaca', genero: 'f', tipo: 'animal' }],
  [/^(ovelhas?|carneiros?|sheep)\b/, { ids: ['sheep'], nome: 'ovelha', genero: 'f', tipo: 'animal' }],
  [/^(porcos?|porquinhos?|pigs?)\b/, { ids: ['pig'], nome: 'porco', genero: 'm', tipo: 'animal' }],
  [/^(galinhas?|frangos?|chickens?)\b/, { ids: ['chicken'], nome: 'galinha', genero: 'f', tipo: 'animal' }],
  [/^(coelhos?|coelhinhos?|rabbits?)\b/, { ids: ['rabbit'], nome: 'coelho', genero: 'm', tipo: 'animal' }],
  [/^(cavalos?|horses?)\b/, { ids: ['horse'], nome: 'cavalo', genero: 'm', tipo: 'animal' }],
  [/^(burros?|jumentos?|donkeys?)\b/, { ids: ['donkey'], nome: 'burro', genero: 'm', tipo: 'animal' }],
  [/^(mulas?|mules?)\b/, { ids: ['mule'], nome: 'mula', genero: 'f', tipo: 'animal' }],
  [/^(lhamas?|llamas?)\b/, { ids: ['llama', 'trader_llama'], nome: 'lhama', genero: 'f', tipo: 'animal' }],
  [/^(cabras?|bodes?|goats?)\b/, { ids: ['goat'], nome: 'cabra', genero: 'f', tipo: 'animal' }],
  [/^(lobos?|wolf|wolves)\b/, { ids: ['wolf'], nome: 'lobo', genero: 'm', tipo: 'animal' }],
  [/^(raposas?|foxes|fox)\b/, { ids: ['fox'], nome: 'raposa', genero: 'f', tipo: 'animal' }],
  [/^(ursos? polar(es)?|ursos?|polar bears?)\b/, { ids: ['polar_bear'], nome: 'urso polar', genero: 'm', tipo: 'animal' }],
  [/^pandas?\b/, { ids: ['panda'], nome: 'panda', genero: 'm', tipo: 'animal' }],
  [/^(papagaios?|parrots?)\b/, { ids: ['parrot'], nome: 'papagaio', genero: 'm', tipo: 'animal' }],
  [/^(morcegos?|bats?)\b/, { ids: ['bat'], nome: 'morcego', genero: 'm', tipo: 'animal' }],
  [/^(abelhas?|bees?)\b/, { ids: ['bee'], nome: 'abelha', genero: 'f', tipo: 'animal' }],
  [/^(tartarugas?|turtles?)\b/, { ids: ['turtle'], nome: 'tartaruga', genero: 'f', tipo: 'animal' }],
  [/^(golfinhos?|dolphins?)\b/, { ids: ['dolphin'], nome: 'golfinho', genero: 'm', tipo: 'animal' }],
  [/^(lulas? brilhantes?|glow squids?)\b/, { ids: ['glow_squid'], nome: 'lula brilhante', genero: 'f', tipo: 'animal' }],
  [/^(lulas?|squids?)\b/, { ids: ['squid', 'glow_squid'], nome: 'lula', genero: 'f', tipo: 'animal' }],
  [/^(bacalhaus?|cods?)\b/, { ids: ['cod'], nome: 'bacalhau', genero: 'm', tipo: 'animal' }],
  [/^(salm(ao|oes)|salmons?)\b/, { ids: ['salmon'], nome: 'salmão', genero: 'm', tipo: 'animal' }],
  [/^(baiacus?|pufferfish)\b/, { ids: ['pufferfish'], nome: 'baiacu', genero: 'm', tipo: 'animal' }],
  [/^(peix(e|es)|peixinhos?|fish)\b/, { ids: ['cod', 'salmon', 'tropical_fish', 'pufferfish'], nome: 'peixe', genero: 'm', tipo: 'animal' }],
  [/^(axolotes?|axolotls?)\b/, { ids: ['axolotl'], nome: 'axolote', genero: 'm', tipo: 'animal' }],
  [/^(sapos?|ras?|frogs?)\b/, { ids: ['frog'], nome: 'sapo', genero: 'm', tipo: 'animal' }],
  [/^(camelos?|camels?)\b/, { ids: ['camel'], nome: 'camelo', genero: 'm', tipo: 'animal' }],
  [/^(tatus?|armadillos?)\b/, { ids: ['armadillo'], nome: 'tatu', genero: 'm', tipo: 'animal' }],
  [/^(farejador(es)?|sniffers?)\b/, { ids: ['sniffer'], nome: 'farejador', genero: 'm', tipo: 'animal' }],
  [/^(strider|striders|lavadores?)\b/, { ids: ['strider'], nome: 'strider', genero: 'm', tipo: 'animal' }],
  [/^(gat[oa]s?|gatinh[oa]s?|cats?)\b/, { ids: ['cat'], nome: 'gato', genero: 'm', tipo: 'gato' }],
  [/^(jaguatiricas?|ocelotes?|ocelots?)\b/, { ids: ['ocelot'], nome: 'jaguatirica', genero: 'f', tipo: 'gato' }],
  [/^(mercador(es)?|vendedor(es)? ambulante|wandering traders?)\b/, { ids: ['wandering_trader'], nome: 'mercador', genero: 'm', tipo: 'aldeao' }],
  [/^(aldeao|aldeoes|aldeaos|villagers?)\b/, { ids: ['villager'], nome: 'aldeão', genero: 'm', tipo: 'aldeao' }],
  [/^(golens? de ferro|golem de ferro|golem|golens|iron golems?)\b/, { ids: ['iron_golem'], nome: 'golem de ferro', genero: 'm', tipo: 'aldeao' }],
  [/^(golens? de neve|bonecos? de neve|snow golems?)\b/, { ids: ['snow_golem'], nome: 'boneco de neve', genero: 'm', tipo: 'outro' }],
  [/^allays?\b/, { ids: ['allay'], nome: 'allay', genero: 'm', tipo: 'outro' }],
];

/** "mata isso", "mata esse bicho": o que você estiver mirando */
const GENERICO = /^(bicho|bichos|bichinho|bichinhos|animal|animais|mob|mobs|coisa|coisas|criatura|criaturas|treco|negocio)\b/;
/** "mata os monstros": é o modo guarda, não uma caça */
const HOSTIS = /^(monstro|monstros|inimigo|inimigos|hostil|hostis|mobs hostis)\b/;

/** O mob pelo nome em português (ou como o jogo chama). */
export function mobDoTermo(termo: string): Mob | null {
  const t = termo.trim();
  for (const [re, m] of MOBS) if (re.test(t)) return m;
  return null;
}

/** O mob pelo id do jogo ("minecraft:sheep" → ovelha). */
export function mobDoId(id: string): Mob | null {
  const x = id.replace(/^minecraft:/, '');
  return MOBS.find(([, m]) => m.ids[0] === x)?.[1] ?? MOBS.find(([, m]) => m.ids.includes(x))?.[1] ?? null;
}

/** "ovelha" → "ovelhas"; "aldeão" → "aldeões"; "cubo de magma" → "cubos de magma". */
export function plural(nome: string): string {
  const [cabeca, ...resto] = nome.split(' ');
  const w = cabeca!;
  const p = /ão$/.test(w) ? w.replace(/ão$/, 'ões')
    : /[rzs]$/.test(w) ? `${w}es`
    : /l$/.test(w) ? w.replace(/l$/, 'is')
    : /m$/.test(w) ? w.replace(/m$/, 'ns')
    : `${w}s`;
  return [p, ...resto.map((x) => (x === 'polar' ? 'polares' : x === 'brilhante' ? 'brilhantes' : x === 'bruto' ? 'brutos' : x === 'zumbi' ? 'zumbis' : x))].join(' ');
}

/** "a ovelha", "essa ovelha", "3 vacas", "todas as galinhas" — como ela diz o alvo. */
export function alvoEmPalavras(m: Mob | null, n: number, mirando: boolean): string {
  if (!m) return mirando ? 'isso' : 'esse bicho';
  const f = m.genero === 'f';
  if (n >= TODOS) return `${f ? 'todas as' : 'todos os'} ${plural(m.nome)}`;
  if (n > 1) return `${n} ${plural(m.nome)}`;
  return `${mirando ? (f ? 'essa' : 'esse') : f ? 'a' : 'o'} ${m.nome}`;
}

/** "todas": o mod caça até acabar os daquele tipo por perto (com um teto) */
export const TODOS = 16;

export interface PedidoCaca {
  tipo: 'cacar';
  /** null = o que você estiver mirando, seja o que for */
  mob: Mob | null;
  n: number;
  /** "essa", "aquele", "isso": o que está na sua mira primeiro */
  mirando: boolean;
}

const VERBO = /\b(?:mata|matar|mate|mato|matem|ataca|atacar|ataque|bate|bater|caca|cacar|abate|abater|elimina|eliminar|acaba com|acabar com|derruba|derrubar|mete a espada (?:n[aoe]s?|em)|da um jeito n[aoe]s?)\b\s*(.*)$/;
const MIRA = new Set(['essa', 'esse', 'esta', 'este', 'aquela', 'aquele', 'essas', 'esses', 'estas', 'estes', 'aquelas', 'aqueles', 'isso', 'isto', 'aquilo', 'ela', 'ele', 'eles', 'elas']);
const ARTIGO = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'mais', 'outra', 'outro', 'outras', 'outros']);
const POUCOS = new Set(['umas', 'uns', 'algumas', 'alguns', 'varias', 'varios']);
const TUDO = new Set(['todas', 'todos', 'toda', 'todo']);
/** o que vem depois do bicho e não é parte do nome */
const FIM = /\s+(pra|para|por|ai|aqui|ali|la|perto|que|com|logo|agora|rapido|de novo|tambem|ja|ok|pf|pfv|pfvr|favor)\b.*$/;

/**
 * "mata essa ovelha", "pode matar 3 vacas?", "caça umas galinhas pra mim".
 * Null = não é caça (sem verbo, negado, "os monstros" é o modo guarda, ou bicho desconhecido).
 */
export function entenderCaca(t: string): PedidoCaca | null {
  if (/\bnao\b/.test(t) || t.split(' ').length > 12) return null;
  const v = VERBO.exec(t);
  if (!v) return null;
  const resto = v[1]!.replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const toks = resto ? resto.split(' ') : [];
  let i = 0;
  let mirando = false;
  let n: number | null = null;
  let plural = false;
  while (i < toks.length) {
    const w = toks[i]!;
    if (MIRA.has(w)) {
      mirando = true;
      if (/s$/.test(w)) plural = true;
      i++;
    } else if (TUDO.has(w)) {
      n = TODOS;
      i++;
    } else if (POUCOS.has(w)) {
      n ??= 3;
      i++;
    } else if (ARTIGO.has(w)) {
      if (/s$/.test(w) && w !== 'mais') plural = true;
      i++;
    } else {
      const num = numeroExtenso(toks, i);
      // "um"/"uma" já saíram como artigo; número aqui é quantidade
      if (!num) break;
      n = Math.max(1, Math.min(TODOS, Math.round(num.valor)));
      i += num.usados;
    }
  }
  const nome = toks.slice(i).join(' ').replace(FIM, '').trim();
  if (HOSTIS.test(nome)) return null;
  // "mata ele", "mata isso", "mata esse bicho": o que você está mirando
  if (!nome || GENERICO.test(nome)) {
    if (!mirando && !GENERICO.test(nome)) return null;
    return { tipo: 'cacar', mob: null, n: n ?? 1, mirando: true };
  }
  const mob = mobDoTermo(nome);
  if (!mob) return null;
  // plural sem número ("mata as vacas", "mata essas ovelhas"): todas as de perto
  const primeira = nome.split(' ')[0]!;
  const pl = plural || (primeira !== dobrar(mob.nome.split(' ')[0]!) && /s$/.test(primeira));
  return { tipo: 'cacar', mob, n: n ?? (pl ? TODOS : 1), mirando };
}
