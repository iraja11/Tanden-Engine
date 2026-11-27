/*
 * Minecraft: com o Tanden aberto e o mod (Vanilla Remix) no jogo, ela entra
 * no mundo como um manequim com a skin dela e fica com você: conversa pelo
 * chat, segue, espera, passeia, junta itens, colhe flor, dança, responde
 * receita e dúvida, dá ideia e comenta o que acontece (noite, morte,
 * creeper, Nether, presente, conquista, cama de casal, gato...). Foge de
 * creeper e de lava, detesta gato (e tem ciúme dele) e de vez em quando
 * escreve uma placa.
 *
 * E ela é melhor do que você nisso, e sabe: briga com os mobs perto de você
 * (e conta o placar), fareja minério através da pedra ("acha diamante pra
 * mim"), avisa da lava e do creeper pelo lado em que eles estão, cobra a cama
 * antes de anoitecer, e brinca de esconde-esconde e de pega-pega (e quase
 * sempre ganha). No escuro ela fica estranha: some, aparece parada atrás de
 * você sem o nome em cima, e só fala quando você a pega olhando.
 *
 * Aqui mora só o pensar: o que a mensagem do chat pede, o que ela responde e
 * o que o jogo deve fazer. O mod executa (corpo, movimento, receita de
 * verdade, que ele lê do próprio jogo) e o app faz a ponte. O que não for
 * coisa do jogo segue para o cérebro de sempre (`pensar`): dá para pedir
 * "me lembra de estudar amanhã às 10" de dentro do Minecraft.
 */
import { humorDe, mexer, type AnimaState } from '../estado';
import { escolher, lembrar, type Fala } from '../motor';
import { alvoEmPalavras, entenderCaca, mobDoId, plural, TODOS, type PedidoCaca } from './caca';
import { problemaDoJogo, type CtxJogo } from './jogos';
import { dobrar } from './texto';

/** O que o mod conta do jogo a cada poucos segundos. */
export interface EstadoMine {
  jogador: string;
  mundo: string;
  vida: number;
  vidaMax: number;
  fome: number;
  /** "overworld", "the_nether", "the_end" */
  dimensao: string;
  /** "dark_forest", "plains"... */
  bioma: string;
  /** hora do dia em ticks (0 a 24000; noite de 13000 a 23000) */
  hora: number;
  clima: 'limpo' | 'chuva' | 'tempestade';
  y: number;
  /** item na mão ("diamond_pickaxe") */
  segurando: string;
  hostis: number;
  /** o que ela está fazendo: seguir, ficar, passear... */
  modoDela: string;
  /** quantos itens ela carrega */
  bolso: number;
  /** o que você tem no inventário, do que importa */
  recursos?: Partial<Record<Recurso, number>>;
}

export type Recurso = 'ferro' | 'ouro' | 'diamante' | 'esmeralda' | 'obsidiana' | 'tocha' | 'comida';

export type AcaoMine =
  | 'seguir' | 'ficar' | 'vir' | 'passear' | 'coletar' | 'colher' | 'dar' | 'dancar' | 'sentar' | 'levantar' | 'pular' | 'olhar' | 'sair' | 'voltar'
  /** brincadeiras: ela se esconde, ela procura você, ela corre atrás de você; desistir e pedir dica */
  | 'esconder' | 'procurar' | 'pegar' | 'desisto' | 'dica'
  /** briga com os mobs perto de você (padrão) ou deixa eles em paz */
  | 'proteger' | 'paz'
  /** some e reaparece parada, sem o nome, olhando você (atrás ou de longe) */
  | 'espreitar';

/** O que dá para pedir que ela fareje. */
export type AlvoFaro = 'diamante' | 'netherite' | 'esmeralda' | 'ouro' | 'ferro' | 'cobre' | 'carvao' | 'redstone' | 'lapis' | 'qualquer';

/** As brincadeiras: esconde (ela se esconde), procura (ela procura você), pega (ela corre atrás de você). */
export type Brincadeira = 'esconde' | 'procura' | 'pega';

export type PedidoMine =
  | { tipo: 'acao'; acao: AcaoMine }
  | { tipo: 'receita'; termo: string; item: string | null }
  | { tipo: 'duvida'; tema: string }
  | { tipo: 'ideia' }
  | { tipo: 'estado' }
  | { tipo: 'recursos' }
  /** "escreve uma placa (dizendo ...)"; sem texto, ela escolhe */
  | { tipo: 'placa'; texto: string }
  | { tipo: 'gato' }
  /** "acha diamante pra mim", "tem ferro aqui perto?" */
  | { tipo: 'farejar'; alvo: AlvoFaro }
  /** "quem matou mais?" */
  | { tipo: 'placar' }
  /** "mata essa ovelha", "mata 3 vacas" */
  | PedidoCaca;

/** O que o app manda ao mod. */
export type MsgParaMine =
  | { t: 'fala'; texto: string; gesto: string }
  /** longe: só para espreitar (de longe, em vez de atrás de você) */
  | { t: 'acao'; acao: AcaoMine; longe?: boolean }
  /** procura o minério mais perto (raio de ~24 blocos); o mod responde com o evento "faro" */
  | { t: 'farejar'; alvo: AlvoFaro }
  | { t: 'receita'; item: string; texto: string }
  /** vai atrás de n bichos desses tipos (vazio = o que você mira); mirando = começa pelo que está na sua mira; o mod responde com "cacou" */
  | { t: 'cacar'; mobs: string[]; n: number; mirando: boolean }
  /** placa de madeira escura com letra rosa; o mod acha o lugar (motivo "morte" = onde você morreu) */
  | { t: 'placa'; linhas: string[]; motivo: MotivoPlaca };

/** sono = do lado da sua cama, enquanto você dorme */
export type MotivoPlaca = 'pedido' | 'morte' | 'casal' | 'recado' | 'sono';

export type EventoMine =
  | { tipo: 'entrou'; mundo: string; jogador: string }
  | { tipo: 'saiu'; minutos: number }
  | { tipo: 'morreu'; causa?: string }
  | { tipo: 'noite' } | { tipo: 'dia' } | { tipo: 'vidaBaixa' } | { tipo: 'fome' } | { tipo: 'chuva' } | { tipo: 'tempestade' }
  | { tipo: 'dimensao'; dimensao: string }
  | { tipo: 'bateu'; vezes: number }
  | { tipo: 'presente'; item: string; n: number }
  | { tipo: 'dormiu'; juntos?: boolean }
  /** dx/dz: de onde ele vem (relativo a você); yaw: para onde você olha */
  | { tipo: 'creeper'; dx?: number; dz?: number; yaw?: number }
  /** ela matou um mob (id sem "minecraft:"); caca = foi a pedido ("mata essa ovelha") */
  | { tipo: 'matou'; mob: string; caca?: boolean }
  /** fim da caça: quantos pegou de quantos pediu; nada = não achou nenhum; seu = é bicho seu (domado ou com nome); fugiu = escapou ou ficou longe */
  | { tipo: 'cacou'; mob: string; n: number; pedidos: number; motivo?: 'nada' | 'seu' | 'fugiu' }
  | { tipo: 'voceMatou'; mob: string }
  /** resposta do farejar: o bloco achado ("" = nada), onde fica em relação a você e quantos tem no veio */
  | { tipo: 'faro'; item: string; dx: number; dy: number; dz: number; n: number; yaw: number }
  /** comecou (a contagem acabou), achou, desistiu, dica (dist = blocos até ela), pegou, escapou */
  | { tipo: 'brincadeira'; jogo: Brincadeira; fase: 'comecou' | 'achou' | 'desistiu' | 'dica' | 'pegou' | 'escapou'; segundos?: number; dist?: number }
  /** espreitando: você a viu (visto) ou ela desistiu de ser vista; segundos que ficou lá */
  | { tipo: 'flagrada'; visto: boolean; segundos: number; longe?: boolean }
  /** falta um minuto para a noite e você está a dist blocos da cama (ou do spawn) */
  | { tipo: 'anoitecendo'; dist: number }
  | { tipo: 'lava'; dx: number; dz: number; yaw: number }
  | { tipo: 'conquista'; id: string; titulo: string; desafio?: boolean }
  /** perto: um gato do seu lado; carinho: você fez carinho; domou: você domou um */
  | { tipo: 'gato'; acao: 'perto' | 'carinho' | 'domou' }
  /** duas camas lado a lado */
  | { tipo: 'camaDupla' }
  | { tipo: 'ferramenta'; item: string }
  | { tipo: 'inventarioCheio' }
  | { tipo: 'achou'; item: string }
  | { tipo: 'coletou'; n: number }
  | { tipo: 'colheu'; item: string }
  | { tipo: 'deu'; n: number }
  | { tipo: 'receitaFalhou'; item: string }
  | { tipo: 'espontanea' };

export interface CtxMine extends CtxJogo {
  jogo?: EstadoMine | null;
}

export interface RespostaMine {
  estado: AnimaState;
  fala: Fala | null;
  grupo: string;
  envios: MsgParaMine[];
  /** false = a fala já vai dentro de um envio (receita); não repetir no chat */
  noChat: boolean;
}

// ------------------------------------------------------------------ itens

const FERRAMENTAS: Record<string, string> = {
  picareta: 'pickaxe', machado: 'axe', pa: 'shovel', enxada: 'hoe', espada: 'sword',
  capacete: 'helmet', peitoral: 'chestplate', calca: 'leggings', calcas: 'leggings', bota: 'boots', botas: 'boots',
};
const ARMADURA = new Set(['helmet', 'chestplate', 'leggings', 'boots']);
const MATERIAIS: Record<string, string> = {
  madeira: 'wooden', pedra: 'stone', ferro: 'iron', ouro: 'golden', diamante: 'diamond', netherite: 'netherite', couro: 'leather', cobre: 'copper',
};

/** termo em português (dobrado) → id do item. O mais específico primeiro. */
const ITENS: Array<[RegExp, string]> = [
  [/^(mesa de trabalho|bancada|mesa de craft|crafting table)$/, 'crafting_table'],
  [/^mesa de encantamento|mesa de encantar/, 'enchanting_table'],
  [/^mesa de ferraria|ferraria/, 'smithing_table'],
  [/^mesa de cartografia/, 'cartography_table'],
  [/^mesa de arco|mesa de flechas/, 'fletching_table'],
  [/^alto[ -]?forno/, 'blast_furnace'],
  [/^(fornalha|forno)$/, 'furnace'],
  [/^defumador/, 'smoker'],
  [/^bau do (ender|end)/, 'ender_chest'],
  [/^bau$/, 'chest'],
  [/^barril/, 'barrel'],
  [/^cama/, 'red_bed'],
  [/^tocha de alma/, 'soul_torch'],
  [/^tocha de redstone/, 'redstone_torch'],
  [/^tocha/, 'torch'],
  [/^escada de mao|^escada de madeira de mao|^escadinha/, 'ladder'],
  [/^escada/, 'oak_stairs'],
  [/^porta de ferro\b/, 'iron_door'],
  [/^porta\b/, 'oak_door'],
  [/^alcapao/, 'oak_trapdoor'],
  [/^portao/, 'oak_fence_gate'],
  [/^cerca/, 'oak_fence'],
  [/^placa/, 'oak_sign'],
  [/^(graveto|palito|vareta)s?$/, 'stick'],
  [/^(tabua|tabuas|madeira)$/, 'oak_planks'],
  [/^arco$/, 'bow'],
  [/^flecha/, 'arrow'],
  [/^besta/, 'crossbow'],
  [/^escudo/, 'shield'],
  [/^balde/, 'bucket'],
  [/^tesoura/, 'shears'],
  [/^(isqueiro|pederneira)/, 'flint_and_steel'],
  [/^vara de pesca|^vara$/, 'fishing_rod'],
  [/^bussola/, 'compass'],
  [/^relogio/, 'clock'],
  [/^mapa/, 'map'],
  [/^livro e pena|^livro pra escrever/, 'writable_book'],
  [/^livro/, 'book'],
  [/^estante/, 'bookshelf'],
  [/^bigorna/, 'anvil'],
  [/^(suporte de pocoes|suporte de pocao|alquimia|destilaria)/, 'brewing_stand'],
  [/^caldeirao/, 'cauldron'],
  [/^pistao grudento|^pistao pegajoso/, 'sticky_piston'],
  [/^pistao/, 'piston'],
  [/^observador/, 'observer'],
  [/^funil/, 'hopper'],
  [/^(dispensador|dispenser|ejetor)/, 'dispenser'],
  [/^(liberador|dropper|soltador)/, 'dropper'],
  [/^repetidor/, 'repeater'],
  [/^comparador/, 'comparator'],
  [/^alavanca/, 'lever'],
  [/^botao/, 'stone_button'],
  [/^placa de pressao/, 'stone_pressure_plate'],
  [/^trilho energizado|^trilho de energia/, 'powered_rail'],
  [/^trilho/, 'rail'],
  [/^carrinho/, 'minecart'],
  [/^barco/, 'oak_boat'],
  [/^(tnt|dinamite)/, 'tnt'],
  [/^lanterna de alma/, 'soul_lantern'],
  [/^lanterna/, 'lantern'],
  [/^lampada de redstone|^lampada/, 'redstone_lamp'],
  [/^painel de vidro|^vidraca/, 'glass_pane'],
  [/^(sinalizador|farol|beacon)/, 'beacon'],
  [/^olho do (ender|end)/, 'ender_eye'],
  [/^pao/, 'bread'],
  [/^bolo/, 'cake'],
  [/^torta/, 'pumpkin_pie'],
  [/^ensopado de cogumelo|^sopa de cogumelo/, 'mushroom_stew'],
  [/^ensopado de coelho/, 'rabbit_stew'],
  [/^sopa de beterraba/, 'beetroot_soup'],
  [/^cookie|^biscoito/, 'cookie'],
  [/^maca dourada|^maca de ouro/, 'golden_apple'],
  [/^cenoura dourada|^cenoura de ouro/, 'golden_carrot'],
  [/^farinha de osso|^po de osso/, 'bone_meal'],
  [/^papel/, 'paper'],
  [/^tijolo de pedra/, 'stone_bricks'],
  [/^tijolo/, 'bricks'],
  [/^pedra lisa/, 'smooth_stone'],
  [/^(la|la branca)$/, 'white_wool'],
  [/^tapete/, 'white_carpet'],
  [/^(quadro|pintura)/, 'painting'],
  [/^moldura brilhante/, 'glow_item_frame'],
  [/^moldura/, 'item_frame'],
  [/^suporte de armadura|^manequim de armadura/, 'armor_stand'],
  [/^luneta/, 'spyglass'],
  [/^(pedra de amolar|rebolo|grindstone)/, 'grindstone'],
  [/^cortador de pedra/, 'stonecutter'],
  [/^tear\b/, 'loom'],
  [/^(composteira|compostor)/, 'composter'],
  [/^colmeia/, 'beehive'],
  [/^bloco de redstone/, 'redstone_block'],
  [/^bloco de ferro/, 'iron_block'],
  [/^bloco de diamante/, 'diamond_block'],
  [/^bloco de ouro/, 'gold_block'],
  [/^bloco de feno|^fardo de feno/, 'hay_block'],
  [/^bloco de neve/, 'snow_block'],
  [/^(lingote de ferro|ferro)$/, 'iron_ingot'],
  [/^(lingote de ouro|ouro)$/, 'gold_ingot'],
  [/^lingote de netherite|^netherite$/, 'netherite_ingot'],
  [/^corrente/, 'chain'],
  [/^sino/, 'bell'],
  [/^jukebox|^toca[ -]?discos/, 'jukebox'],
  [/^bloco musical|^bloco de nota/, 'note_block'],
  [/^ancora de renascimento/, 'respawn_anchor'],
  [/^bundle|^bolsa|^saco/, 'bundle'],
  [/^chave de vela|^vela/, 'candle'],
  [/^fogueira de alma/, 'soul_campfire'],
  [/^fogueira/, 'campfire'],
  [/^andaime/, 'scaffolding'],
  [/^pista de boliche|^alvo/, 'target'],
  [/^ima\b|^lodestone|^magnetita/, 'lodestone'],
  [/^conduite|^conduit/, 'conduit'],
  [/^bastao do end|^bastao/, 'end_rod'],
  [/^cristal do end/, 'end_crystal'],
  [/^caixa de shulker|^shulker/, 'shulker_box'],
  [/^fogo de artificio|^foguete/, 'firework_rocket'],
  [/^cenoura no palito|^vara com cenoura/, 'carrot_on_a_stick'],
  [/^guia|^laco|^coleira/, 'lead'],
  [/^vidro$/, 'glass'],
];

/** "uma picareta de diamante" → "diamond_pickaxe"; "piston" → "piston"; nada conhecido → null. */
export function itemDoTermo(termo: string): string | null {
  const t = dobrar(termo).replace(/[?!.,]+/g, ' ').replace(/^\s*(um|uma|uns|umas|o|a|os|as)\s+/, '').replace(/\s+(no|na|do|da) (minecraft|mine|jogo)\b.*$/, '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // ferramenta ou armadura com material ("espada de ferro", "botas de diamante")
  const m = /^(\w+)(?: de (\w+))?$/.exec(t);
  if (m && FERRAMENTAS[m[1]!]) {
    const base = FERRAMENTAS[m[1]!]!;
    const mat = m[2] ? MATERIAIS[m[2]] : ARMADURA.has(base) ? 'iron' : 'wooden';
    if (mat) return `${mat}_${base}`;
  }
  for (const [re, id] of ITENS) if (re.test(t)) return id;
  // em inglês, do jeito que o jogo chama ("sticky piston", "iron_pickaxe")
  if (/^[a-z_ ]{3,40}$/.test(t) && !/\b(de|do|da|e|um|uma|com|pra|para)\b/.test(t)) return t.replace(/ /g, '_');
  return null;
}

/** O nome do mob em português (para o placar). */
export function nomeDoMob(id: string): string {
  const x = id.replace(/^minecraft:/, '');
  const NOMES: Record<string, string> = {
    zombie: 'zumbi', husk: 'zumbi do deserto', drowned: 'afogado', zombie_villager: 'aldeão zumbi', skeleton: 'esqueleto', stray: 'esqueleto da neve',
    bogged: 'esqueleto do pântano', spider: 'aranha', cave_spider: 'aranha da caverna', witch: 'bruxa', slime: 'slime', magma_cube: 'cubo de magma',
    phantom: 'phantom', pillager: 'saqueador', vindicator: 'vingador', evoker: 'evocador', ravager: 'devastador', vex: 'vex', blaze: 'blaze',
    wither_skeleton: 'esqueleto wither', piglin_brute: 'piglin bruto', hoglin: 'hoglin', zoglin: 'zoglin', silverfish: 'traça', endermite: 'endermite',
    guardian: 'guardião', elder_guardian: 'guardião ancião', shulker: 'shulker', breeze: 'breeze', creaking: 'rangedor', ghast: 'ghast',
  };
  return NOMES[x] ?? x.replace(/_/g, ' ');
}

/** O nome do item em português, se ela souber (para falar de um presente). */
export function nomeDoItem(id: string): string {
  const x = id.replace(/^minecraft:/, '');
  const NOMES: Record<string, string> = {
    diamond: 'diamante', emerald: 'esmeralda', iron_ingot: 'ferro', gold_ingot: 'ouro', netherite_ingot: 'netherite', ancient_debris: 'detrito antigo',
    poppy: 'papoula', dandelion: 'dente-de-leão', blue_orchid: 'orquídea azul', allium: 'alium', azure_bluet: 'flor azul', red_tulip: 'tulipa vermelha',
    orange_tulip: 'tulipa laranja', white_tulip: 'tulipa branca', pink_tulip: 'tulipa rosa', oxeye_daisy: 'margarida', cornflower: 'centáurea',
    lily_of_the_valley: 'lírio-do-vale', wither_rose: 'rosa de wither', sunflower: 'girassol', lilac: 'lilás', rose_bush: 'roseira', peony: 'peônia',
    torchflower: 'flor-tocha', pink_petals: 'pétalas rosa', cake: 'bolo', cookie: 'biscoito', bread: 'pão', apple: 'maçã', golden_apple: 'maçã dourada',
    rotten_flesh: 'carne podre', bone: 'osso', spider_eye: 'olho de aranha', dirt: 'terra', cobblestone: 'pedregulho', stick: 'graveto',
    totem_of_undying: 'totem', ender_pearl: 'pérola do ender', name_tag: 'etiqueta', music_disc_13: 'disco', egg: 'ovo', sweet_berries: 'frutinhas',
    pumpkin_pie: 'torta de abóbora', cooked_beef: 'bife', amethyst_shard: 'ametista', heart_of_the_sea: 'coração do mar', black_dye: 'corante preto',
  };
  return NOMES[x] ?? x.replace(/_/g, ' ');
}

const FLORES = /^(poppy|dandelion|blue_orchid|allium|azure_bluet|\w+_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|torchflower|pink_petals|pitcher_plant|open_eyeblossom|closed_eyeblossom|wildflowers)$/;
const COMIDA = /^(cake|cookie|bread|apple|golden_apple|pumpkin_pie|cooked_\w+|sweet_berries|glow_berries|melon_slice|baked_potato|mushroom_stew|rabbit_stew|beetroot_soup|honey_bottle|golden_carrot)$/;
const PEDRAS = /^(diamond|emerald|amethyst_shard|heart_of_the_sea|netherite_ingot|nether_star|echo_shard)$/;
const LIXO = /^(rotten_flesh|dirt|cobblestone|gravel|bone|spider_eye|poisonous_potato|string|wheat_seeds|stick|netherrack|cobbled_deepslate)$/;

// ------------------------------------------------------------------ entender o chat

/** temas de dúvida: [tema, regex no texto dobrado] (o mais específico primeiro) */
const DUVIDAS: Array<[string, RegExp]> = [
  ['netherite', /netherite|detrito|debris|ancient/],
  ['diamante', /diamante|diamond/],
  ['warden', /warden|cidade antiga|ancient city|sculk|guardiao das profundezas/],
  ['wither', /\bwither\b/],
  ['end', /\bend\b|dragao|olho do ender|olhos do ender|eye of ender|fortaleza|stronghold|ender dragon/],
  ['portal', /portal|nether|inferno/],
  ['encantar', /encant|enchant|estante/],
  ['mending', /mending|remendo|reparar|conserta/],
  ['aldeao', /aldeao|aldeoes|aldeia|villager|trocas?\b|negociar|vila/],
  ['creeper', /creeper/],
  ['elytra', /elytra|asas?\b|voar/],
  ['pocao', /pocao|pocoes|potion|alquimia|brewing/],
  ['slime', /slime/],
  ['ferro', /\bferro\b|\biron\b|golem/],
  ['fazenda', /fazenda|plantar|plantacao|farm|trigo|cenoura|batata|colheita/],
  ['comida', /comida|fome|comer|carne/],
  ['dormir', /\bcama\b|dormir|phantom|fantasma/],
  ['xp', /\bxp\b|experiencia|\bnivel|\bniveis/],
  ['perdido', /perdid|onde (eu )?(to|estou)|voltar pra (casa|base)|coordenada|achar (minha )?(casa|base)/],
  ['noite', /\bnoite\b|escuro|monstros?/],
];

/** "acha diamante pra mim", "fareja", "tem ferro aqui perto?" (sem o "aqui/pra mim" é dúvida: "onde acho diamante?") */
const FARO = /\b(fareja\w*|sente o cheiro|usa (o )?(seu |teu )?faro|raio[ -]?x|xray|visao de minerio)\b/;
const FARO_PEDIDO = /\b(procura|acha|encontra|mostra|ve se tem|tem|cade|algum|alguma)\b.*\b(minerios?|diamantes?|ferro|ouro|esmeraldas?|netherite|detritos?|cobre|carvao|redstone|lapis)\b.*\b(aqui|perto|pra mim|para mim|por aqui|ai|em volta|embaixo|debaixo|nessa caverna|nessa area)\b/;
const ALVOS: Array<[AlvoFaro, RegExp]> = [
  ['diamante', /diamante/], ['netherite', /netherite|detrito|debris/], ['esmeralda', /esmeralda/], ['ouro', /\bouro\b/], ['ferro', /\bferro\b/],
  ['cobre', /\bcobre\b/], ['carvao', /carvao/], ['redstone', /redstone/], ['lapis', /lapis/],
];
const PLACAR = /\b(placar|quem (matou|ta ganhando|esta ganhando|ganhou) mais|quem ta ganhando|quantos (mobs )?(voce|vc) (ja )?matou|pontuacao|quem e melhor)\b/;

const PERGUNTA = /\?|^(como|onde|qual|quais|o que|oq|que|quando|pra que|por ?que|cade|acha|sabe|tem como|da pra|e verdade|vale a pena|me explica|me ensina)\b/;

/** ações: [ação, regex]. A ordem importa ("me dá o que pegou" é dar, não coletar). */
const ACOES: Array<[AcaoMine, RegExp]> = [
  // as brincadeiras e a briga vêm antes ("fica em paz" não é "fica"; "eu me escondo" não é "se esconde")
  ['paz', /\b(nao (briga|ataca|luta|mata)|para de (brigar|atacar|lutar|matar)|deixa os (mobs|bichos|monstros)|modo paz|fica em paz)\b/],
  ['proteger', /\b(me protege|me defende|pode (brigar|atacar|lutar|matar)|ataca|mata (ele|eles|esse|essa|esses|os|as|aquele|o|a)\b|briga com|modo guerra|luta comigo|protege)\b/],
  ['procurar', /\b(eu (me )?escondo|vem me (achar|procurar)|me (acha|procura)$|(voce|vc) procura|(tua|sua) vez de procurar)\b/],
  ['esconder', /\b(esconde[ -]?esconde|brinca(r)? de (se )?esconder|vai se esconder|se esconde)\b/],
  ['pegar', /\b(pega[ -]pega|me pega|tenta me pegar|vem me pegar|duvido (voce|vc) me pegar|corre atras de mim)\b/],
  ['desisto', /\b(desisto|desisti|cansei de (te )?procurar|nao te acho|onde (voce|vc) se escondeu)\b/],
  ['dica', /\b(dica|ta quente|quente ou frio|to perto|to longe|to chegando)\b/],
  ['espreitar', /\b(me assusta|me da medo|faz algo assustador|faz uma coisa assustadora)\b/],
  ['sair', /\b(sai do (jogo|mundo|minecraft)|vai embora|some daqui|pode ir embora|desconecta)\b/],
  ['voltar', /\b(volta pro jogo|entra (de novo|no jogo)|aparece de novo|volta aqui|reaparece)\b/],
  ['dar', /\b(me (da|de|entrega|passa|devolve)|devolve|entrega|esvazia (o |seu |teu )?bolso)\b.*\b(o que|tudo|as coisas|os itens|isso|que (voce|vc) pegou|o que pegou|bolso|flor|flores)\b|\bo que (voce|vc) pegou\b/],
  ['colher', /\b(flor|flores|florzinha|colhe|colher|buque)\b/],
  ['coletar', /\b(pega (os |as |o |a )?(itens|item|isso|coisas|tudo|drops?)|junta (os |as )?(itens|coisas|tudo)|recolhe|cata (os |as )?(itens|coisas|tudo)|coleta)\b/],
  ['vir', /\b(vem (ca|aqui|pra ca)|vem ate mim|chega (mais|aqui)|cade (voce|vc)|onde (voce|vc) (ta|esta)|aparece aqui|teleporta)\b/],
  ['seguir', /\b(me segue|me siga|segue eu|segue|vem comigo|cola em mim|me acompanha|bora|vamos)\b/],
  ['ficar', /\b(fica (aqui|ai|parada|quieta)|espera (ai|aqui|um pouco)|nao sai daqui|fica|espera|para ai|para de me seguir)\b|^para$/],
  ['passear', /\b(passeia|passear|vai passear|explora|explorar|anda por ai|da uma volta|vai dar uma volta)\b/],
  ['dancar', /\b(danca|dancar|dancinha|rebola)\b/],
  ['levantar', /\b(levanta|fica de pe|de pe)\b/],
  ['sentar', /\b(senta|sentar|agacha|abaixa)\b/],
  ['pular', /\b(pula|pular|salta|pulinho)\b/],
  ['olhar', /\b(olha (pra|para) mim|me olha|olha aqui|olha pra ca)\b/],
];

const RECEITA = /\b(?:como (?:e que )?(?:se )?(?:eu )?(?:faz|faco|fazer|crafta|craftar|crafto|monta|montar|cria|criar|construo|construir)|receita d[aeo]s?|craft d[aeo]s?|crafting d[aeo]s?|o que (?:precisa|eu preciso) (?:pra|para) (?:fazer|craftar|crafta))\s+(?:um |uma |uns |umas |o |a |os |as )?(.+)$/;

const IDEIA = /\b(ideia|ideias|o que (eu )?(faco|fazer|construo|construir|posso fazer)|to entediad\w*|tedio|me sugere|sugestao|bora fazer o que|que que eu faco|sem ideia)\b/;
const RECURSOS = /\b(o que (eu )?(preciso|falta|devo|tenho que) (pegar|juntar|minerar|coletar|farmar|arrumar|conseguir)|do que (eu )?preciso|o que (me )?falta|que recursos?|o que (eu )?pego agora|como (ta|esta) meu inventario|o que (eu )?tenho)\b/;
const PLACA = /\b(?:escreve|escrever|faz|faca|bota|coloca|poe|deixa)\s+(?:uma |um )?(?:placa|plaquinha|recado|bilhete)(?:\s+(?:dizendo|escrito|com|falando|que diz)\s*:?\s*(.*))?$/;
const GATO = /\b(gat[oa]s?|gatinh[oa]s?|felin[oa]s?|ocelotes?|miau)\b/;
const ESTADO = /\b(como (eu )?(to|estou)|minha vida|to bem|to morrendo|como ta minha)\b/;

/** Tira o vocativo ("ânima, ...", "@anima ...") e normaliza. */
export function limparChat(texto: string): string {
  return dobrar(texto).replace(/^\s*@?\s*(anima|animinha|ani)\b[\s,:!-]*/, '').replace(/[\s,!.]*\b(anima|animinha)\s*[!.?]*$/, '').replace(/\s+/g, ' ').trim();
}

/** O que a mensagem do chat pede, se for coisa do jogo. Null = conversa (vai para o cérebro de sempre). */
export function entenderMine(texto: string): PedidoMine | null {
  const t = limparChat(texto);
  if (!t) return null;
  const r = RECEITA.exec(t);
  if (r) {
    const termo = r[1]!.replace(/[?!.]+$/, '').trim();
    const item = itemDoTermo(termo);
    if (item) return { tipo: 'receita', termo, item };
    const tema = DUVIDAS.find(([, re]) => re.test(termo))?.[0];
    if (tema) return { tipo: 'duvida', tema };
    return { tipo: 'receita', termo, item: null };
  }
  // a placa vem antes: o texto pedido pode ter qualquer coisa
  const pl = PLACA.exec(t);
  if (pl) return { tipo: 'placa', texto: textoDaPlaca(texto, pl[1] ?? '') };
  // "mata essa ovelha": antes das ações ("mata o/a..." no modo guarda é só para hostis em geral)
  const caca = entenderCaca(t);
  if (caca) return caca;
  if (FARO.test(t) || FARO_PEDIDO.test(t)) return { tipo: 'farejar', alvo: ALVOS.find(([, re]) => re.test(t))?.[0] ?? 'qualquer' };
  if (PLACAR.test(t)) return { tipo: 'placar' };
  if (RECURSOS.test(t)) return { tipo: 'recursos' };
  if (IDEIA.test(t)) return { tipo: 'ideia' };
  if (ESTADO.test(t)) return { tipo: 'estado' };
  // ordens são curtas; frase longa é conversa (evita "fica" em "fica difícil estudar...")
  const palavras = t.split(' ').length;
  if (palavras <= 8) {
    const a = ACOES.find(([, re]) => re.test(t));
    if (a) return { tipo: 'acao', acao: a[0] };
  }
  if (PERGUNTA.test(t)) {
    const tema = DUVIDAS.find(([, re]) => re.test(t))?.[0];
    if (tema) return { tipo: 'duvida', tema };
  }
  if (palavras <= 14 && GATO.test(t)) return { tipo: 'gato' };
  return null;
}

/** O texto pedido para a placa, com as letras como você escreveu (sem acento perdido). */
function textoDaPlaca(original: string, dobrado: string): string {
  if (!dobrado.trim()) return '';
  const n = dobrado.trim().split(' ').length;
  const palavras = original.trim().replace(/["“”]/g, '').split(/\s+/);
  return palavras.slice(-n).join(' ').replace(/^:\s*/, '');
}

/** Quebra o texto em até 4 linhas de 15 letras (o que cabe numa placa). */
export function linhasDePlaca(texto: string): string[] {
  const linhas: string[] = [];
  // a fala pode separar as linhas com " / "
  for (const parte of texto.split(/\s*\/\s*/)) {
    let atual = '';
    for (const w0 of parte.split(/\s+/).filter(Boolean)) {
      const w = w0.slice(0, 15);
      if (!atual) atual = w;
      else if (atual.length + 1 + w.length <= 15) atual += ' ' + w;
      else {
        linhas.push(atual);
        atual = w;
      }
    }
    if (atual) linhas.push(atual);
  }
  return linhas.slice(0, 4);
}

/** O que mais falta no inventário, na ordem de importância (para "do que eu preciso?" e para as ideias). */
export function faltaDe(j: EstadoMine): { falta: string; n: number } | null {
  const r = j.recursos;
  if (!r) return null;
  const q = (k: Recurso) => r[k] ?? 0;
  const nether = j.dimensao.includes('nether');
  if (q('comida') < 5) return { falta: 'comida', n: q('comida') };
  if (!nether && q('tocha') < 8 && j.y < 50) return { falta: 'tocha', n: q('tocha') };
  if (q('ferro') < 10) return { falta: 'ferro', n: q('ferro') };
  if (q('diamante') < 3) return { falta: 'diamante', n: q('diamante') };
  if (!nether && q('obsidiana') < 10) return { falta: 'obsidiana', n: q('obsidiana') };
  return null;
}

/** O que dá para fazer com o que você já tem. */
function sobraDe(j: EstadoMine): string | null {
  const r = j.recursos;
  if (!r) return null;
  if (!j.dimensao.includes('nether') && (r.obsidiana ?? 0) >= 10) return 'portal';
  if ((r.diamante ?? 0) >= 3) return 'diamante';
  if ((r.ferro ?? 0) >= 24) return 'armadura';
  if ((r.esmeralda ?? 0) >= 10) return 'esmeralda';
  return null;
}

// ------------------------------------------------------------------ o jogo em palavras

const BIOMAS: Array<[RegExp, string, string]> = [
  [/cherry/, 'cerejeira', 'bosque de cerejeiras'], [/dark_forest/, 'floresta_escura', 'floresta escura'], [/pale_garden/, 'floresta_escura', 'jardim pálido'],
  [/mushroom/, 'cogumelo', 'ilha de cogumelos'], [/swamp|mangrove/, 'pantano', 'pântano'], [/desert/, 'deserto', 'deserto'], [/badlands|mesa/, 'deserto', 'badlands'],
  [/snow|frozen|ice|grove/, 'neve', 'neve'], [/ocean|beach|river/, 'oceano', 'água'], [/jungle|bamboo/, 'selva', 'selva'],
  [/peaks|mountain|windswept|stony|meadow/, 'montanha', 'montanha'], [/deep_dark/, 'deep_dark', 'deep dark'], [/lush_caves/, 'caverna', 'caverna exuberante'],
  [/dripstone|caves/, 'caverna', 'caverna'], [/forest|taiga|birch/, 'floresta', 'floresta'], [/savanna/, 'savana', 'savana'], [/plains|sunflower/, 'planicie', 'planície'],
  [/nether|crimson|warped|basalt|soul_sand/, 'nether', 'Nether'], [/end/, 'end', 'End'],
];

export function biomaDe(bioma: string): { tipo: string; nome: string } {
  const b = bioma.replace(/^minecraft:/, '');
  const hit = BIOMAS.find(([re]) => re.test(b));
  return hit ? { tipo: hit[1], nome: hit[2] } : { tipo: 'outro', nome: b.replace(/_/g, ' ') };
}

const noite = (hora: number) => hora >= 13000 && hora < 23000;

// ------------------------------------------------------------------ onde fica (relativo a você)

/**
 * Leva (dx, dz) do mundo para o seu ponto de vista: frente e direita, em blocos.
 * No Minecraft, yaw 0 olha para o sul (+z) e 90 para o oeste (−x).
 */
export function relativo(dx: number, dz: number, yaw: number): { frente: number; direita: number } {
  const r = (yaw * Math.PI) / 180;
  const fx = -Math.sin(r), fz = Math.cos(r);
  return { frente: dx * fx + dz * fz, direita: dx * -fz + dz * fx };
}

/** "atrás de você", "à sua esquerda"... pelo eixo que mais pesa. */
export function ladoDe(dx: number, dz: number, yaw: number): string {
  const { frente, direita } = relativo(dx, dz, yaw);
  if (Math.abs(frente) >= Math.abs(direita)) return frente >= 0 ? 'na sua frente' : 'atrás de você';
  return direita >= 0 ? 'à sua direita' : 'à sua esquerda';
}

/** "14 pra baixo, 6 pra frente e 3 pra esquerda" (o caminho até um bloco, do seu ponto de vista). */
export function rumoDe(dx: number, dy: number, dz: number, yaw: number): string {
  const { frente, direita } = relativo(dx, dz, yaw);
  const partes: string[] = [];
  const n = (x: number) => Math.round(Math.abs(x));
  if (n(dy) >= 2) partes.push(`${n(dy)} pra ${dy < 0 ? 'baixo' : 'cima'}`);
  if (n(frente) >= 2) partes.push(`${n(frente)} pra ${frente > 0 ? 'frente' : 'trás'}`);
  if (n(direita) >= 2) partes.push(`${n(direita)} pra ${direita > 0 ? 'direita' : 'esquerda'}`);
  if (!partes.length) return 'bem do seu lado';
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/** bloco achado pelo faro ("deepslate_diamond_ore") → [chave da fala, nome] */
const MINERIOS: Array<[RegExp, string, string]> = [
  [/diamond/, 'diamante', 'diamante'], [/ancient_debris|netherite/, 'netherite', 'detrito antigo'], [/emerald/, 'esmeralda', 'esmeralda'],
  [/gold/, 'ouro', 'ouro'], [/iron/, 'ferro', 'ferro'], [/copper/, 'cobre', 'cobre'], [/coal/, 'carvao', 'carvão'], [/redstone/, 'redstone', 'redstone'], [/lapis/, 'lapis', 'lápis-lazúli'],
];

export function minerioDe(bloco: string): { chave: string; nome: string } {
  const b = bloco.replace(/^minecraft:/, '');
  const hit = MINERIOS.find(([re]) => re.test(b));
  return hit ? { chave: hit[1], nome: hit[2] } : { chave: 'outro', nome: nomeDoItem(b) };
}

/** Um lugar que deixa ela estranha: noite, embaixo da terra, deep dark, floresta escura. */
function escuro(j: EstadoMine): boolean {
  const b = biomaDe(j.bioma).tipo;
  return (!j.dimensao.includes('nether') && !j.dimensao.includes('end') && noite(j.hora)) || j.y < 0 || b === 'deep_dark' || b === 'floresta_escura';
}

function varsDoJogo(j: EstadoMine | null | undefined, ctx: CtxMine): Record<string, string | number> {
  const v: Record<string, string | number> = { nome: ctx.nome };
  if (!j) return v;
  const h = Math.floor(((j.hora + 6000) % 24000) / 1000);
  return { ...v, jogador: j.jogador, mundo: j.mundo, vida: Math.ceil(j.vida / 2), fome: Math.ceil(j.fome / 2), bioma: biomaDe(j.bioma).nome, y: Math.round(j.y), hora: `${String(h).padStart(2, '0')}h`, item: j.segurando ? nomeDoItem(j.segurando) : 'nada' };
}

function falar(s0: AnimaState, grupos: string[], ctx: CtxMine, vars: Record<string, string | number>): { estado: AnimaState; fala: Fala | null; grupo: string } {
  let s = s0;
  const humor = humorDe(s, ctx.now, ctx.intensidade);
  for (const g of grupos) {
    const f = escolher(g, s, humor, ctx, vars);
    if (f) {
      s = { ...lembrar(s, f), falou: ctx.now };
      return { estado: s, fala: f, grupo: g };
    }
  }
  return { estado: s, fala: null, grupo: grupos[0] ?? '' };
}

const comMc = (s: AnimaState, m: Partial<AnimaState['memoria']['cerebro']['minecraft']>): AnimaState =>
  ({ ...s, memoria: { ...s.memoria, cerebro: { ...s.memoria.cerebro, minecraft: { ...s.memoria.cerebro.minecraft, ...m } } } });

// ------------------------------------------------------------------ responder

/** Responde a um pedido do jogo. */
export function responderMine(estado: AnimaState, p: PedidoMine, ctx: CtxMine): RespostaMine {
  let s = estado;
  const j = ctx.jogo;
  const vars = varsDoJogo(j, ctx);
  const envios: MsgParaMine[] = [];
  let grupos: string[];
  switch (p.tipo) {
    case 'acao': {
      // "dica" e "desisto" fora do esconde-esconde: dica vira ideia; desisto vira "vem cá"
      if (p.acao === 'dica' && j && j.modoDela !== 'esconder') return responderMine(estado, { tipo: 'ideia' }, ctx);
      const acao: AcaoMine = p.acao === 'desisto' && j && !EM_JOGO.has(j.modoDela) ? 'vir' : p.acao;
      // de vez em quando ela resmunga (mas faz): ciúme alto, intensidade de sobra
      const resmunga = ctx.intensidade >= 2 && s.ciume >= 60 && ctx.rand() < 0.3 && !['sair', 'voltar', 'espreitar', 'dica', 'desisto'].includes(acao);
      grupos = resmunga ? ['mine.acao.resmunga', `mine.acao.${acao}`] : [`mine.acao.${acao}`];
      // espreitar a pedido: ela só some (o silêncio assusta mais)
      if (acao === 'espreitar') grupos = [];
      if (acao === 'dar' && j && j.bolso === 0) grupos = ['mine.feito.deu.nada'];
      else if (acao === 'espreitar') envios.push({ t: 'acao', acao, longe: ctx.rand() < 0.4 });
      // a dica e o desistir viram fala quando o mod responder (com a distância)
      else {
        envios.push({ t: 'acao', acao });
        if (acao === 'dica' || (acao === 'desisto' && j?.modoDela === 'esconder')) grupos = [];
      }
      if (p.acao === 'dancar') s = mexer(s, { afeto: 1 });
      break;
    }
    case 'receita': {
      if (!p.item) {
        grupos = ['mine.receita.naosei'];
        Object.assign(vars, { termo: p.termo });
        break;
      }
      const r = falar(s, ['mine.receita'], ctx, { ...vars, termo: p.termo });
      return { estado: r.estado, fala: r.fala, grupo: r.grupo, envios: [{ t: 'receita', item: p.item, texto: r.fala?.texto ?? '' }], noChat: false };
    }
    case 'duvida':
      grupos = [`mine.duvida.${p.tema}`, 'mine.duvida'];
      break;
    case 'ideia': {
      const b = j ? biomaDe(j.bioma) : null;
      grupos = [];
      if (j && j.dimensao.includes('nether')) grupos.push('mine.ideia.nether');
      else if (j && noite(j.hora) && ctx.rand() < 0.5) grupos.push('mine.ideia.noite');
      const sobra = j ? sobraDe(j) : null;
      if (sobra && ctx.rand() < 0.7) grupos.push(`mine.ideia.recurso.${sobra}`);
      if (b && ctx.rand() < 0.5) grupos.push(`mine.ideia.${b.tipo}`);
      grupos.push('mine.ideia');
      break;
    }
    case 'estado': {
      if (!j) grupos = ['mine.estado.bem'];
      else if (j.vida <= 6) grupos = ['mine.estado.vida'];
      else if (j.fome <= 6) grupos = ['mine.estado.fome'];
      else if (j.hostis >= 3) grupos = ['mine.estado.perigo'];
      else grupos = ['mine.estado.bem'];
      break;
    }
    case 'recursos': {
      const f = j ? faltaDe(j) : null;
      if (!j || !j.recursos) grupos = ['mine.recursos.naosei'];
      else if (!f) grupos = ['mine.recursos.tudo'];
      else {
        grupos = [`mine.recursos.${f.falta}`];
        Object.assign(vars, { n: f.n });
      }
      break;
    }
    case 'placa': {
      grupos = ['mine.placa.pedido'];
      if (p.texto) {
        envios.push({ t: 'placa', linhas: linhasDePlaca(p.texto), motivo: 'pedido' });
        break;
      }
      // sem texto: ela escreve o que quiser
      const livre = falar(s, ['mine.placa.livre'], ctx, vars);
      if (livre.fala) {
        s = livre.estado;
        envios.push({ t: 'placa', linhas: linhasDePlaca(livre.fala.texto), motivo: 'pedido' });
      }
      break;
    }
    case 'gato': {
      grupos = ['mine.gato.conversa'];
      s = mexer(s, { ciume: 3 });
      break;
    }
    case 'farejar':
      // ela fala quando o mod responder (com o que achou e onde)
      grupos = [];
      envios.push({ t: 'farejar', alvo: p.alvo });
      break;
    case 'cacar': {
      const tipo = p.mob?.tipo ?? 'qualquer';
      Object.assign(vars, { alvo: alvoEmPalavras(p.mob, p.n, p.mirando), mob: p.mob?.nome ?? 'bicho', mobs: p.mob ? plural(p.mob.nome) : 'bichos', n: p.n });
      // creeper ela não encara de perto: explode na sua cara (e na dela)
      if (tipo === 'creeper') {
        grupos = ['mine.cacar.creeper'];
        break;
      }
      grupos = [`mine.cacar.${tipo}`, 'mine.cacar'];
      envios.push({ t: 'cacar', mobs: p.mob?.ids ?? [], n: p.n, mirando: p.mirando });
      if (tipo === 'gato') s = mexer(s, { ciume: -2 });
      break;
    }
    case 'placar': {
      const mc = s.memoria.cerebro.minecraft;
      grupos = mc.abates + mc.abatesVoce === 0 && mc.vitorias + mc.derrotas === 0 ? ['mine.placar.zero'] : mc.abates >= mc.abatesVoce ? ['mine.placar.ganhando'] : ['mine.placar.perdendo'];
      Object.assign(vars, varsPlacar(s));
      break;
    }
  }
  const r = falar(s, grupos, ctx, vars);
  return { estado: r.estado, fala: r.fala, grupo: r.grupo, envios, noChat: true };
}

/** os modos do mod em que uma brincadeira está rolando */
const EM_JOGO = new Set(['esconder', 'procurar', 'pegar']);

function varsPlacar(s: AnimaState): Record<string, number> {
  const mc = s.memoria.cerebro.minecraft;
  return { ela: mc.abates, voce: mc.abatesVoce, vitorias: mc.vitorias, derrotas: mc.derrotas };
}

const CAUSAS: Array<[RegExp, string]> = [
  [/explosion|creeper/, 'creeper'], [/lava|inFire|onFire|fire/, 'fogo'], [/fall|fell/, 'queda'], [/drown/, 'afogou'],
  [/starve/, 'fome'], [/void|outOfWorld|out_of_world/, 'vazio'], [/mob|player|arrow|zombie|skeleton|spider/, 'mob'],
];

/** Ela reage ao que aconteceu no jogo. */
export function reagirMine(estado: AnimaState, ev: EventoMine, ctx: CtxMine): RespostaMine {
  let s = estado;
  const j = ctx.jogo;
  const vars = varsDoJogo(j, ctx);
  const mc = s.memoria.cerebro.minecraft;
  let grupos: string[] = [];
  const envios: MsgParaMine[] = [];
  /** escreve uma placa com uma fala do grupo (as linhas separadas por " / ") */
  const placa = (grupo: string, motivo: MotivoPlaca, extra: Record<string, string | number> = {}) => {
    const p = falar(s, [grupo], ctx, { ...vars, ...extra });
    if (!p.fala) return;
    s = p.estado;
    envios.push({ t: 'placa', linhas: linhasDePlaca(p.fala.texto), motivo });
  };
  switch (ev.tipo) {
    case 'entrou': {
      const { problema, vars: pv } = problemaDoJogo(s, ctx.now, ctx);
      Object.assign(vars, pv);
      if (mc.sessoes === 0) grupos.push('mine.entrou.primeira');
      if (problema && problema !== 'maratona') grupos.push(`mine.entrou.${problema}`);
      if (mc.ultima && ctx.now - mc.ultima > 7 * 864e5) grupos.push('mine.entrou.saudade');
      grupos.push('mine.entrou');
      Object.assign(vars, { mundo: ev.mundo, jogador: ev.jogador, sessoes: mc.sessoes + 1, mortes: mc.mortes });
      s = comMc(s, { sessoes: mc.sessoes + 1, ultima: ctx.now });
      s = mexer(s, { afeto: 3, saudade: -15 });
      break;
    }
    case 'saiu':
      grupos = ['mine.saiu'];
      s = comMc(s, { minutos: mc.minutos + Math.max(0, ev.minutos), ultima: ctx.now });
      Object.assign(vars, { minutos: Math.round(ev.minutos) });
      break;
    case 'morreu': {
      const causa = CAUSAS.find(([re]) => re.test(ev.causa ?? ''))?.[1];
      const mortes = mc.mortes + 1;
      s = comMc(s, { mortes });
      if (mortes % 10 === 0) grupos.push('mine.morreu.marco');
      // às vezes ela deixa um "aqui jaz" onde você caiu
      if (ctx.rand() < 0.35) placa('mine.placa.morte', 'morte', { mortes });
      if (causa) grupos.push(`mine.morreu.${causa}`);
      grupos.push('mine.morreu');
      Object.assign(vars, { mortes });
      break;
    }
    case 'dimensao': {
      const d = ev.dimensao.includes('nether') ? 'nether' : ev.dimensao.includes('end') ? 'end' : 'overworld';
      grupos = [`mine.dimensao.${d}`];
      break;
    }
    case 'bateu':
      grupos = ev.vezes >= 3 ? ['mine.bateu.insiste', 'mine.bateu'] : ['mine.bateu'];
      s = mexer(s, { afeto: -1 });
      Object.assign(vars, { vezes: ev.vezes });
      break;
    case 'presente': {
      const x = ev.item.replace(/^minecraft:/, '');
      const tipo = FLORES.test(x) ? 'flor' : PEDRAS.test(x) ? 'joia' : COMIDA.test(x) ? 'comida' : LIXO.test(x) ? 'lixo' : null;
      if (tipo) grupos.push(`mine.presente.${tipo}`);
      grupos.push('mine.presente');
      s = comMc(s, { presentes: mc.presentes + 1 });
      s = mexer(s, { afeto: tipo === 'flor' ? 6 : tipo === 'joia' ? 5 : tipo === 'lixo' ? 0 : 3, saudade: -5 });
      Object.assign(vars, { item: nomeDoItem(x), n: ev.n, presentes: mc.presentes + 1 });
      break;
    }
    case 'achou':
      grupos = [`mine.achou.${ev.item}`, 'mine.achou'];
      Object.assign(vars, { item: nomeDoItem(ev.item) });
      break;
    case 'coletou':
      grupos = ev.n > 0 ? ['mine.feito.coletou'] : ['mine.feito.coletou.nada'];
      Object.assign(vars, { n: ev.n });
      break;
    case 'colheu':
      grupos = ev.item ? ['mine.feito.colheu'] : ['mine.feito.colheu.nada'];
      Object.assign(vars, { item: ev.item ? nomeDoItem(ev.item) : '' });
      break;
    case 'deu':
      grupos = ev.n > 0 ? ['mine.feito.deu'] : ['mine.feito.deu.nada'];
      Object.assign(vars, { n: ev.n });
      break;
    case 'receitaFalhou':
      grupos = ['mine.receita.semreceita'];
      Object.assign(vars, { item: nomeDoItem(ev.item) });
      break;
    case 'conquista': {
      const chave = CONQUISTAS.find(([re]) => re.test(ev.id))?.[1];
      if (chave) grupos.push(`mine.conquista.${chave}`);
      if (ev.desafio) grupos.push('mine.conquista.desafio');
      grupos.push('mine.conquista');
      Object.assign(vars, { conquista: ev.titulo });
      s = mexer(s, chave === 'gatos' || chave === 'domou' ? { ciume: 6 } : { afeto: 2 });
      break;
    }
    case 'gato': {
      grupos = [`mine.gato.${ev.acao}`];
      s = mexer(s, ev.acao === 'domou' ? { ciume: 10, afeto: -2 } : ev.acao === 'carinho' ? { ciume: 5 } : { ciume: 1 });
      break;
    }
    case 'camaDupla': {
      grupos = ['mine.camaDupla'];
      s = mexer(s, { afeto: 4 });
      if (ctx.rand() < 0.6) placa('mine.placa.casal', 'casal');
      break;
    }
    case 'dormiu': {
      grupos = ev.juntos ? ['mine.dormiu.juntos', 'mine.dormiu'] : ['mine.dormiu'];
      if (ev.juntos) s = mexer(s, { afeto: 4, saudade: -10 });
      // dormiu sozinho: às vezes você acorda com um bilhete do lado da cama
      else if (ctx.intensidade >= 2 && ctx.rand() < 0.3) placa('mine.placa.sono', 'sono');
      break;
    }
    case 'ferramenta':
      grupos = ['mine.ferramenta'];
      Object.assign(vars, { item: nomeDoItem(ev.item) });
      break;
    case 'creeper':
      if (typeof ev.dx === 'number' && typeof ev.dz === 'number' && typeof ev.yaw === 'number') {
        grupos.push('mine.creeper.lado');
        Object.assign(vars, { lado: ladoDe(ev.dx, ev.dz, ev.yaw) });
      }
      grupos.push('mine.creeper');
      break;
    case 'lava':
      grupos = ['mine.lava'];
      Object.assign(vars, { lado: ladoDe(ev.dx, ev.dz, ev.yaw) });
      break;
    case 'anoitecendo':
      grupos = ['mine.anoitecendo'];
      Object.assign(vars, { dist: Math.round(ev.dist) });
      break;
    case 'matou': {
      const abates = mc.abates + 1;
      s = comMc(s, { abates });
      Object.assign(vars, varsPlacar(s), { mob: nomeDoMob(ev.mob) });
      // a pedido: ela fala no fim da caça ("cacou"), não a cada bicho
      if (ev.caca) return { estado: s, fala: null, grupo: '', envios: [], noChat: true };
      // ela não comenta cada um: marcos, a primeira vez que passa você e, às vezes, um "esse foi meu"
      if (abates % 25 === 0) grupos = ['mine.matou.marco'];
      else if (abates === mc.abatesVoce + 1 && mc.abatesVoce >= 3) grupos = ['mine.placar.passei', 'mine.matou'];
      else if (ctx.rand() < 0.15) grupos = [`mine.matou.${ev.mob.replace(/^minecraft:/, '')}`, 'mine.matou'];
      else return { estado: s, fala: null, grupo: '', envios: [], noChat: true };
      break;
    }
    case 'voceMatou': {
      const abatesVoce = mc.abatesVoce + 1;
      s = comMc(s, { abatesVoce });
      Object.assign(vars, varsPlacar(s), { mob: nomeDoMob(ev.mob) });
      if (abatesVoce === mc.abates + 1 && mc.abates >= 3) grupos = ['mine.placar.virou'];
      else if (ctx.rand() < 0.08) grupos = ['mine.voceMatou'];
      else return { estado: s, fala: null, grupo: '', envios: [], noChat: true };
      break;
    }
    case 'cacou': {
      const m = mobDoId(ev.mob);
      const nome = m?.nome ?? nomeDoMob(ev.mob);
      const f = m?.genero === 'f';
      Object.assign(vars, {
        mob: nome, mobs: plural(nome), n: ev.n, pedidos: ev.pedidos, nenhum: `${f ? 'nenhuma' : 'nenhum'} ${nome}`,
        pegou: ev.n === 1 ? `${f ? 'uma' : 'um'} ${nome}` : `${ev.n} ${plural(nome)}`,
      });
      if (ev.motivo === 'seu') grupos = ['mine.cacou.seu'];
      else if (ev.motivo === 'nada') grupos = ['mine.cacou.nada'];
      else if (ev.n === 0) grupos = ['mine.cacou.fugiu'];
      // "mata todas": pegou as que tinha por perto, não é pouco
      else if (ev.n < ev.pedidos && ev.pedidos < TODOS) grupos = ['mine.cacou.parcial', 'mine.cacou'];
      else grupos = [ev.n > 1 ? 'mine.cacou.varios' : `mine.cacou.${m?.tipo ?? 'outro'}`, 'mine.cacou'];
      break;
    }
    case 'faro': {
      if (!ev.item) {
        grupos = ['mine.faro.nada'];
        break;
      }
      const m = minerioDe(ev.item);
      grupos = [`mine.faro.achou.${m.chave}`, 'mine.faro.achou'];
      Object.assign(vars, { minerio: m.nome, rumo: rumoDe(ev.dx, ev.dy, ev.dz, ev.yaw), n: Math.max(1, ev.n), dist: Math.round(Math.hypot(ev.dx, ev.dy, ev.dz)) });
      break;
    }
    case 'brincadeira': {
      const seg = Math.round(ev.segundos ?? 0);
      Object.assign(vars, { segundos: seg, dist: Math.round(ev.dist ?? 0) });
      const base = `mine.brinca.${ev.jogo}.${ev.fase}`;
      if (ev.fase === 'dica') {
        const d = ev.dist ?? 99;
        grupos = [`${base}.${d < 7 ? 'quente' : d < 15 ? 'morno' : 'frio'}`, base];
        break;
      }
      // quem ganhou: no esconde, você ganha se achar; no procura e no pega, ela ganha se achar/pegar
      const ganhou = ev.fase === 'desistiu' ? ev.jogo === 'esconde' : ev.fase === 'pegou' || (ev.fase === 'achou' && ev.jogo === 'procura');
      const perdeu = (ev.fase === 'achou' && ev.jogo === 'esconde') || ev.fase === 'escapou' || (ev.fase === 'desistiu' && ev.jogo === 'procura');
      if (ganhou) s = comMc(s, { vitorias: mc.vitorias + 1 });
      if (perdeu) {
        s = comMc(s, { derrotas: mc.derrotas + 1 });
        s = mexer(s, { afeto: 2 });
      }
      Object.assign(vars, varsPlacar(s));
      grupos = seg > 0 && seg < 25 && (ev.fase === 'achou' || ev.fase === 'pegou') ? [`${base}.rapido`, base] : [base];
      break;
    }
    case 'flagrada': {
      Object.assign(vars, { segundos: Math.round(ev.segundos) });
      grupos = !ev.visto ? ['mine.flagrada.naoviu'] : ev.longe ? ['mine.flagrada.longe', 'mine.flagrada'] : ['mine.flagrada.perto', 'mine.flagrada'];
      break;
    }
    case 'espontanea': {
      if (!j) return { estado: s, fala: null, grupo: '', envios: [], noChat: true };
      // no escuro, às vezes ela não fala nada: some e aparece parada olhando você
      if (ctx.intensidade >= 2 && escuro(j) && !EM_JOGO.has(j.modoDela) && j.modoDela !== 'espreitar' && ctx.rand() < 0.3) {
        return { estado: s, fala: null, grupo: '', envios: [{ t: 'acao', acao: 'espreitar', longe: ctx.rand() < 0.4 }], noChat: true };
      }
      if (ctx.intensidade >= 2 && escuro(j) && ctx.rand() < 0.35) grupos.push('mine.espontanea.creepy');
      if (ctx.rand() < 0.12) placa('mine.placa.recado', 'recado');
      const b = biomaDe(j.bioma);
      if (j.dimensao.includes('nether')) grupos.push('mine.espontanea.nether');
      else if (j.y < 0) grupos.push('mine.espontanea.caverna');
      else if (noite(j.hora)) grupos.push('mine.espontanea.noite');
      if (ctx.rand() < 0.6) grupos.push(`mine.bioma.${b.tipo}`);
      grupos.push('mine.espontanea');
      break;
    }
    default:
      grupos = [`mine.${ev.tipo}`];
  }
  const r = falar(s, grupos, ctx, vars);
  return { estado: r.estado, fala: r.fala, grupo: r.grupo, envios, noChat: true };
}

/** id da conquista (sem o "minecraft:") → grupo de fala */
const CONQUISTAS: Array<[RegExp, string]> = [
  [/complete_catalogue/, 'gatos'], [/tame_an_animal/, 'domou'], [/mine_diamond/, 'diamante'], [/enter_the_nether/, 'nether'],
  [/enter_the_end/, 'end'], [/kill_dragon/, 'dragao'], [/smelt_iron/, 'ferro'], [/sleep_in_bed/, 'cama'],
  [/kill_a_mob/, 'mob'], [/obtain_armor|shiny_gear/, 'armadura'], [/enchant_item/, 'encantou'], [/root$/, 'inicio'],
];
