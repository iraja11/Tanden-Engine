import { seededRng, type Rng } from '../rpg/dice';
import { blur, type Terrain } from './terreno';

/*
 * Atlas do terreno: clima, biomas, rochas, recursos e acidentes geográficos.
 *
 * Tudo sai do relevo e da semente, então a mesma semente dá o mesmo atlas em
 * qualquer aparelho. As contas são simples, mas seguem o mundo de verdade:
 *
 *  - temperatura pela latitude (a faixa de clima do mapa) e pela altitude
 *    (−6,5 °C por km);
 *  - chuva pela faixa de latitude (equador úmido, desertos perto dos 30°) e
 *    pelo vento dominante: o ar pega umidade no mar, chove ao subir a serra e
 *    chega seco do outro lado (sombra de chuva);
 *  - bioma pela temperatura e pela chuva (diagrama de Whittaker), com
 *    pântano e mangue nas baixadas encharcadas e recife no mar raso quente;
 *  - rochas e recursos pela placa tectônica, pela altitude e pela água;
 *  - vulcões nas bordas em que as placas se chocam, cachoeiras onde o rio
 *    despenca, cavernas no calcário, oásis no deserto...
 */

// ------------------------------------------------------------------ biomas

export type BiomaId =
  | 'fundo' | 'mar' | 'gelo_marinho' | 'recife' | 'lago' | 'praia'
  | 'gelo' | 'tundra' | 'taiga' | 'floresta' | 'floresta_umida' | 'pradaria' | 'mediterraneo'
  | 'deserto_frio' | 'deserto' | 'ermos' | 'savana' | 'floresta_seca' | 'selva'
  | 'pantano' | 'mangue' | 'alpino' | 'montanha' | 'neve' | 'vulcanico'
  // biomas de outros planos (pela `natureza` do mapa)
  | 'lava' | 'cinzas' | 'obsidiana' | 'enxofre' | 'brasa'
  | 'bosque_feerico' | 'prado_encantado' | 'cogumelal' | 'cristal'
  | 'ermo_cinzento' | 'mata_morta' | 'brejo_sombrio' | 'nevoa'
  | 'vazio' | 'campo_astral' | 'abismo' | 'caverna';

export interface BiomaInfo {
  id: BiomaId;
  label: string;
  /** cor no mapa */
  cor: [number, number, number];
  agua?: boolean;
  /** uma frase para quem escreve */
  desc: string;
  flora: string[];
  fauna: string[];
  /** o que torna a vida difícil ali */
  perigos: string[];
}

export const BIOMAS: BiomaInfo[] = [
  { id: 'fundo', label: 'Mar profundo', cor: [24, 48, 78], agua: true, desc: 'Água escura sem fundo à vista, onde só navios grandes se arriscam.', flora: ['algas à deriva'], fauna: ['baleias', 'lulas gigantes', 'peixes abissais'], perigos: ['tempestades', 'monstros marinhos', 'calmarias'] },
  { id: 'mar', label: 'Mar', cor: [46, 90, 126], agua: true, desc: 'Mar aberto e rotas de navegação.', flora: ['algas', 'sargaço'], fauna: ['golfinhos', 'tubarões', 'cardumes'], perigos: ['piratas', 'naufrágio'] },
  { id: 'gelo_marinho', label: 'Banquisa', cor: [214, 226, 234], agua: true, desc: 'Mar congelado que racha e range; a pé no inverno, de barco só no verão.', flora: [], fauna: ['focas', 'ursos brancos', 'morsas'], perigos: ['gelo fino', 'frio mortal', 'nevasca'] },
  { id: 'recife', label: 'Recife de coral', cor: [84, 168, 168], agua: true, desc: 'Mar raso e morno, cheio de cor e de cascos rasgados.', flora: ['corais', 'anêmonas'], fauna: ['peixes coloridos', 'tartarugas', 'moreias'], perigos: ['cascos rasgados', 'águas-vivas'] },
  { id: 'lago', label: 'Lago', cor: [70, 124, 156], agua: true, desc: 'Água doce parada, com pescadores e lendas no fundo.', flora: ['juncos', 'nenúfares'], fauna: ['peixes de água doce', 'garças', 'sapos'], perigos: ['afogamento', 'o que mora no fundo'] },
  { id: 'praia', label: 'Praia', cor: [222, 206, 156], desc: 'Faixa de areia entre a terra e o mar.', flora: ['coqueiros', 'restinga'], fauna: ['caranguejos', 'gaivotas'], perigos: ['marés', 'contrabandistas'] },
  { id: 'gelo', label: 'Geleira', cor: [236, 241, 247], desc: 'Gelo eterno, branco até onde a vista alcança.', flora: [], fauna: ['quase nada'], perigos: ['fendas', 'avalanches', 'cegueira da neve'] },
  { id: 'tundra', label: 'Tundra', cor: [164, 166, 144], desc: 'Chão congelado, musgo e liquens, verão curto e cheio de mosquitos.', flora: ['musgo', 'líquen', 'arbustos rasteiros'], fauna: ['renas', 'lobos', 'raposas do ártico'], perigos: ['frio', 'fome no inverno'] },
  { id: 'taiga', label: 'Taiga', cor: [70, 100, 82], desc: 'Floresta escura de pinheiros e neve, que vai até o horizonte.', flora: ['pinheiros', 'abetos', 'bétulas'], fauna: ['ursos', 'alces', 'linces'], perigos: ['inverno longo', 'perder-se'] },
  { id: 'floresta', label: 'Floresta temperada', cor: [80, 122, 64], desc: 'Carvalhos e faias que mudam de cor com as estações.', flora: ['carvalhos', 'faias', 'cogumelos'], fauna: ['cervos', 'javalis', 'corujas'], perigos: ['bandidos', 'lobos'] },
  { id: 'floresta_umida', label: 'Floresta úmida', cor: [50, 98, 70], desc: 'Árvores gigantes, musgo em tudo e chuva quase todo dia.', flora: ['sequoias', 'samambaias', 'musgo'], fauna: ['ursos', 'salamandras', 'alces'], perigos: ['neblina', 'deslizamentos'] },
  { id: 'pradaria', label: 'Pradaria', cor: [152, 168, 98], desc: 'Capim a perder de vista, céu enorme e vento constante.', flora: ['gramíneas', 'flores silvestres'], fauna: ['cavalos selvagens', 'bisões', 'gaviões'], perigos: ['incêndios', 'nômades', 'tornados'] },
  { id: 'mediterraneo', label: 'Mato seco', cor: [160, 152, 96], desc: 'Verão quente e seco, inverno de chuva; oliveiras, vinhas e arbustos de cheiro forte.', flora: ['oliveiras', 'vinhas', 'alecrim'], fauna: ['cabras', 'lagartos', 'cigarras'], perigos: ['seca', 'incêndios'] },
  { id: 'deserto_frio', label: 'Deserto frio', cor: [174, 164, 138], desc: 'Planalto seco e varrido de vento, quente de dia e gelado à noite.', flora: ['arbustos espinhosos'], fauna: ['camelos bactrianos', 'águias'], perigos: ['frio da noite', 'sede'] },
  { id: 'deserto', label: 'Deserto', cor: [216, 192, 136], desc: 'Areia, sol e miragens; a água vale mais que o ouro.', flora: ['cactos', 'tamareiras nos oásis'], fauna: ['camelos', 'escorpiões', 'serpentes'], perigos: ['sede', 'tempestade de areia', 'insolação'] },
  { id: 'ermos', label: 'Ermos', cor: [182, 124, 92], desc: 'Terra vermelha rachada, cânions e rochas esculpidas pelo vento.', flora: ['arbustos secos'], fauna: ['abutres', 'coiotes'], perigos: ['enxurradas repentinas', 'emboscadas'] },
  { id: 'savana', label: 'Savana', cor: [184, 172, 96], desc: 'Capim alto e árvores esparsas, com estação de chuva e de seca.', flora: ['acácias', 'baobás', 'capim alto'], fauna: ['grandes manadas', 'leões', 'elefantes'], perigos: ['predadores', 'secas'] },
  { id: 'floresta_seca', label: 'Floresta seca', cor: [118, 140, 66], desc: 'Mata quente que perde as folhas na seca e explode de verde na chuva.', flora: ['ipês', 'teca', 'bambu'], fauna: ['macacos', 'tigres', 'papagaios'], perigos: ['incêndios', 'feras'] },
  { id: 'selva', label: 'Selva', cor: [36, 102, 52], desc: 'Floresta tropical densa, quente e barulhenta; o chão nunca vê o sol.', flora: ['árvores gigantes', 'cipós', 'orquídeas'], fauna: ['onças', 'serpentes', 'aves coloridas'], perigos: ['doenças', 'venenos', 'perder-se'] },
  { id: 'pantano', label: 'Pântano', cor: [84, 106, 78], desc: 'Água parada, lama, névoa e coisas que se mexem embaixo.', flora: ['juncos', 'ciprestes', 'musgo'], fauna: ['sapos', 'crocodilos', 'mosquitos'], perigos: ['atoleiros', 'febres', 'luzes enganosas'] },
  { id: 'mangue', label: 'Mangue', cor: [66, 102, 84], desc: 'Raízes no mar salobro; entre a terra e a maré.', flora: ['mangues', 'raízes aéreas'], fauna: ['caranguejos', 'garças', 'jacarés'], perigos: ['marés', 'lama funda'] },
  { id: 'alpino', label: 'Campos de altitude', cor: [136, 138, 108], desc: 'Prados altos acima das árvores, ar rarefeito e flores pequenas.', flora: ['flores alpinas', 'capim curto'], fauna: ['cabras-monteses', 'marmotas', 'águias'], perigos: ['frio', 'ar rarefeito'] },
  { id: 'montanha', label: 'Montanhas', cor: [122, 112, 102], desc: 'Rocha nua, passagens estreitas e picos que ninguém escalou.', flora: ['líquen'], fauna: ['águias', 'cabras', 'grifos?'], perigos: ['quedas', 'avalanches', 'tempestades'] },
  { id: 'neve', label: 'Picos nevados', cor: [244, 244, 248], desc: 'Neve eterna no topo do mundo.', flora: [], fauna: ['quase nada'], perigos: ['avalanches', 'congelamento'] },
  { id: 'vulcanico', label: 'Terras vulcânicas', cor: [72, 62, 60], desc: 'Rocha negra, cinza e vapor saindo do chão.', flora: ['quase nada', 'musgo nas cinzas antigas'], fauna: ['salamandras', 'insetos'], perigos: ['erupções', 'gases', 'lava'] },
  // ---- infernal
  { id: 'lava', label: 'Mar de lava', cor: [214, 84, 28], agua: true, desc: 'Rocha derretida que corre e borbulha onde, noutro mundo, haveria mar.', flora: ['nenhuma'], fauna: ['salamandras', 'vermes de fogo', 'elementais'], perigos: ['calor que mata à distância', 'jatos de magma', 'gases'] },
  { id: 'cinzas', label: 'Planícies de cinza', cor: [96, 86, 82], desc: 'Chão de cinza fina e quente; cada passo levanta uma nuvem cinzenta.', flora: ['arbustos de carvão', 'líquens negros'], fauna: ['cães de brasa', 'carniçais', 'abutres de fuligem'], perigos: ['tempestades de cinza', 'sede', 'chão que cede'] },
  { id: 'obsidiana', label: 'Serras de obsidiana', cor: [44, 38, 48], desc: 'Paredões de vidro negro, afiados como navalha.', flora: ['nenhuma'], fauna: ['gárgulas', 'demônios menores'], perigos: ['cortes', 'desabamentos', 'reflexos que enganam'] },
  { id: 'enxofre', label: 'Campos de enxofre', cor: [196, 178, 64], desc: 'Fumarolas amarelas, poças ferventes e um cheiro que não sai da roupa.', flora: ['musgo amarelo'], fauna: ['sapos de fogo', 'diabretes'], perigos: ['gases venenosos', 'água fervente', 'explosões'] },
  { id: 'brasa', label: 'Bosques de brasa', cor: [128, 52, 36], desc: 'Árvores que queimam sem nunca se consumir.', flora: ['árvores em brasa', 'flores de fogo'], fauna: ['fênix', 'serpentes de fogo'], perigos: ['incêndios', 'fumaça', 'calor'] },
  // ---- feérico
  { id: 'bosque_feerico', label: 'Bosque feérico', cor: [58, 142, 104], desc: 'Floresta antiga e viva demais: as trilhas mudam de lugar e as árvores escutam.', flora: ['carvalhos que falam', 'flores que brilham', 'cogumelos em círculo'], fauna: ['fadas', 'cervos brancos', 'raposas que mentem'], perigos: ['perder o caminho', 'pactos', 'o tempo que corre diferente'] },
  { id: 'prado_encantado', label: 'Prado encantado', cor: [150, 196, 112], desc: 'Campos de flores impossíveis, sempre em fim de tarde.', flora: ['flores de todas as cores', 'trevos de sete folhas'], fauna: ['borboletas gigantes', 'unicórnios', 'duendes'], perigos: ['sono encantado', 'banquetes que prendem', 'esquecer o nome'] },
  { id: 'cogumelal', label: 'Floresta de fungos', cor: [138, 96, 150], desc: 'Cogumelos do tamanho de torres, esporos que brilham no escuro.', flora: ['cogumelos gigantes', 'bolores luminosos'], fauna: ['lesmas enormes', 'besouros', 'povos de fungo'], perigos: ['esporos alucinógenos', 'podridão', 'mofo que toma o corpo'] },
  { id: 'cristal', label: 'Campos de cristal', cor: [150, 196, 214], desc: 'Cristais que crescem como plantas e cantam com o vento.', flora: ['cristais vivos'], fauna: ['golens de cristal', 'aves de vidro'], perigos: ['estilhaços', 'ressonância que enlouquece', 'luz que cega'] },
  // ---- umbral
  { id: 'ermo_cinzento', label: 'Ermo cinzento', cor: [104, 106, 110], desc: 'Uma terra sem cor, como um desenho apagado do mundo real.', flora: ['grama sem cor', 'árvores secas'], fauna: ['sombras', 'corvos', 'mortos inquietos'], perigos: ['desânimo que pesa', 'esquecimento', 'assombrações'] },
  { id: 'mata_morta', label: 'Mata morta', cor: [70, 72, 66], desc: 'Árvores mortas que ainda não caíram, galhos como dedos.', flora: ['árvores mortas', 'fungos pálidos'], fauna: ['aranhas', 'espectros', 'lobos magros'], perigos: ['sussurros', 'trilhas que voltam', 'emboscadas'] },
  { id: 'brejo_sombrio', label: 'Brejo sombrio', cor: [58, 66, 62], desc: 'Água parada e escura onde os afogados ainda se mexem.', flora: ['juncos negros'], fauna: ['afogados', 'enguias pálidas', 'luzes-fátuas'], perigos: ['afogamento', 'febre', 'luzes que atraem'] },
  { id: 'nevoa', label: 'Mar de névoa', cor: [170, 172, 180], agua: true, desc: 'Névoa densa no lugar do mar; quem entra raramente acha a saída.', flora: ['nenhuma'], fauna: ['vultos', 'navios fantasmas'], perigos: ['perder-se', 'vozes', 'frio da alma'] },
  // ---- astral
  { id: 'vazio', label: 'Vazio', cor: [16, 14, 36], agua: true, desc: 'O nada entre as ilhas: estrelas lá embaixo e nenhum chão.', flora: ['nenhuma'], fauna: ['baleias astrais', 'devoradores de mente'], perigos: ['cair para sempre', 'sem ar', 'tempo parado'] },
  { id: 'campo_astral', label: 'Ilhas flutuantes', cor: [176, 162, 210], desc: 'Pedaços de terra que flutuam, ligados por correntes de luz.', flora: ['árvores de prata', 'flores-estrela'], fauna: ['githes', 'anjos errantes', 'aves de luz'], perigos: ['correntes que arrastam', 'pensamentos que viram coisa'] },
  // ---- subterrâneo
  { id: 'abismo', label: 'Abismo', cor: [12, 12, 16], agua: true, desc: 'Fendas sem fundo entre as galerias.', flora: ['nenhuma'], fauna: ['morcegos gigantes', 'coisas que sobem do fundo'], perigos: ['quedas', 'escuridão total', 'ecos que chamam'] },
  { id: 'caverna', label: 'Galerias', cor: [92, 84, 76], desc: 'Túneis e salões de pedra, escuros e úmidos.', flora: ['líquens', 'fungos luminosos'], fauna: ['morcegos', 'trogloditas', 'vermes cegos'], perigos: ['desabamentos', 'gás', 'perder-se no escuro'] },
];

const BIOMA_IDX = new Map(BIOMAS.map((b, i) => [b.id, i]));
export const biomaIndex = (id: BiomaId): number => BIOMA_IDX.get(id)!;
export const biomaInfo = (id: BiomaId | number): BiomaInfo => (typeof id === 'number' ? BIOMAS[id] ?? BIOMAS[1]! : BIOMAS[BIOMA_IDX.get(id) ?? 1]!);

// ------------------------------------------------------------------ rochas

export type RochaId = 'agua' | 'gelo' | 'basalto' | 'granito' | 'metamorfica' | 'calcario' | 'arenito' | 'aluviao' | 'folhelho';

export const ROCHAS: Array<{ id: RochaId; label: string; cor: [number, number, number]; desc: string }> = [
  { id: 'agua', label: 'Água', cor: [60, 100, 140], desc: '' },
  { id: 'gelo', label: 'Gelo', cor: [236, 241, 247], desc: 'Gelo antigo sobre a rocha.' },
  { id: 'basalto', label: 'Basalto', cor: [60, 58, 64], desc: 'Lava esfriada: escura, dura, solo fértil depois de séculos.' },
  { id: 'granito', label: 'Granito', cor: [196, 160, 150], desc: 'O osso dos continentes: duro, bom para castelos e estátuas.' },
  { id: 'metamorfica', label: 'Xisto e mármore', cor: [150, 120, 170], desc: 'Rocha espremida pelo choque das placas; veios de metal e mármore.' },
  { id: 'calcario', label: 'Calcário', cor: [222, 214, 170], desc: 'Fundo de mar antigo; cavernas, rios subterrâneos e cal.' },
  { id: 'arenito', label: 'Arenito', cor: [214, 150, 96], desc: 'Areia que virou pedra; escarpas e cânions vermelhos.' },
  { id: 'aluviao', label: 'Aluvião', cor: [120, 150, 90], desc: 'Terra trazida pelos rios: a melhor para plantar.' },
  { id: 'folhelho', label: 'Argila e folhelho', cor: [150, 140, 120], desc: 'Planícies de sedimento; argila para tijolo e cerâmica, às vezes carvão.' },
];

// ------------------------------------------------------------------ climas

export interface ClimaInfo {
  id: string;
  label: string;
  /** latitude no alto e no pé do mapa (graus, + norte) */
  top: number;
  bottom: number;
  /** multiplica a chuva */
  chuva: number;
}

export const CLIMAS: ClimaInfo[] = [
  { id: 'temperado', label: 'Temperado (norte)', top: 62, bottom: 22, chuva: 1 },
  { id: 'tropical', label: 'Tropical', top: 24, bottom: -16, chuva: 1.1 },
  { id: 'frio', label: 'Frio (boreal)', top: 80, bottom: 45, chuva: 0.9 },
  { id: 'arido', label: 'Árido', top: 42, bottom: 12, chuva: 0.5 },
  { id: 'sul', label: 'Temperado (sul)', top: -22, bottom: -62, chuva: 1 },
  { id: 'planeta', label: 'Planeta inteiro', top: 78, bottom: -78, chuva: 1 },
  { id: 'polar', label: 'Polar', top: 88, bottom: 60, chuva: 0.7 },
];

export const climaInfo = (id?: string): ClimaInfo => {
  const k = (id ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  return CLIMAS.find((c) => c.id === k || c.label.toLowerCase().startsWith(k) && k.length > 2) ?? CLIMAS[0]!;
};

// ------------------------------------------------------------------ recursos e acidentes

export type RecursoId =
  | 'ferro' | 'cobre' | 'ouro' | 'prata' | 'estanho' | 'carvao' | 'sal' | 'gemas' | 'marmore' | 'obsidiana' | 'enxofre'
  | 'madeira' | 'peles' | 'especiarias' | 'perolas' | 'peixe' | 'cavalos' | 'graos' | 'vinho' | 'incenso';

export const RECURSOS: Record<RecursoId, { label: string; glyph: string; desc: string }> = {
  ferro: { label: 'Ferro', glyph: '⛏', desc: 'Veios de ferro nas rochas antigas: armas, arados e pregos.' },
  cobre: { label: 'Cobre', glyph: '⛏', desc: 'Cobre dos arcos vulcânicos: bronze, moedas, telhados verdes.' },
  ouro: { label: 'Ouro', glyph: '✦', desc: 'Ouro nos veios e no cascalho dos rios: corridas e cobiça.' },
  prata: { label: 'Prata', glyph: '✧', desc: 'Prata nas serras: moeda forte e armas contra certos monstros.' },
  estanho: { label: 'Estanho', glyph: '⛏', desc: 'Estanho no granito: sem ele não há bronze.' },
  carvao: { label: 'Carvão', glyph: '◼', desc: 'Florestas antigas soterradas: fogo para forjas e máquinas.' },
  sal: { label: 'Sal', glyph: '◇', desc: 'Salinas e leitos secos: conserva comida e paga soldados.' },
  gemas: { label: 'Gemas', glyph: '◆', desc: 'Rubis, safiras e cristais nas rochas espremidas.' },
  marmore: { label: 'Mármore', glyph: '▤', desc: 'Pedra branca para templos e palácios.' },
  obsidiana: { label: 'Obsidiana', glyph: '▲', desc: 'Vidro vulcânico negro: lâminas afiadíssimas e espelhos.' },
  enxofre: { label: 'Enxofre', glyph: '☄', desc: 'Cheiro de ovo podre, pólvora e alquimia.' },
  madeira: { label: 'Madeira nobre', glyph: '🌲', desc: 'Árvores grandes para navios, casas e arcos.' },
  peles: { label: 'Peles', glyph: '🐾', desc: 'Peles quentes que valem fortunas no sul.' },
  especiarias: { label: 'Especiarias', glyph: '✿', desc: 'Pimenta, canela, cravo: rotas inteiras existem por elas.' },
  perolas: { label: 'Pérolas', glyph: '○', desc: 'Mergulhadores, recifes e colares de rainha.' },
  peixe: { label: 'Pesca farta', glyph: '≈', desc: 'Cardumes que alimentam vilas inteiras.' },
  cavalos: { label: 'Cavalos e gado', glyph: '♞', desc: 'Pastos sem fim: cavalaria, couro e carne.' },
  graos: { label: 'Terra fértil', glyph: '❀', desc: 'Trigo, arroz ou milho: o celeiro de um reino.' },
  vinho: { label: 'Vinho e azeite', glyph: '🍇', desc: 'Encostas de sol para vinhas e oliveiras.' },
  incenso: { label: 'Resinas raras', glyph: '♨', desc: 'Incenso e mirra das árvores do deserto.' },
};

export type AcidenteId = 'vulcao' | 'fonte_termal' | 'geiser' | 'cachoeira' | 'caverna' | 'oasis' | 'cratera' | 'delta' | 'canion' | 'fiorde';

export const ACIDENTES: Record<AcidenteId, { label: string; desc: string; nome: string[] }> = {
  vulcao: { label: 'Vulcão', desc: 'Onde as placas se chocam, a rocha derrete e sobe.', nome: ['Monte', 'Pico', 'Boca de'] },
  fonte_termal: { label: 'Fonte termal', desc: 'Água quente que brota perto dos vulcões; banhos e curas.', nome: ['Fontes de', 'Águas de', 'Banhos de'] },
  geiser: { label: 'Gêiser', desc: 'Jatos de vapor que saem do chão de tempos em tempos.', nome: ['Gêiser de', 'Sopro de'] },
  cachoeira: { label: 'Cachoeira', desc: 'O rio despenca do planalto.', nome: ['Quedas de', 'Cachoeira de', 'Véu de'] },
  caverna: { label: 'Cavernas', desc: 'O calcário dissolvido pela água deixa grutas e rios subterrâneos.', nome: ['Grutas de', 'Cavernas de', 'Covil de'] },
  oasis: { label: 'Oásis', desc: 'Água no meio do deserto: parada obrigatória das caravanas.', nome: ['Oásis de', 'Poço de'] },
  cratera: { label: 'Cratera', desc: 'Algo caiu do céu aqui, há muito tempo.', nome: ['Cratera de', 'Ferida de', 'Estrela de'] },
  delta: { label: 'Delta', desc: 'O rio grande se abre em braços antes do mar: terra fértil e alagada.', nome: ['Delta do', 'Bocas do'] },
  canion: { label: 'Cânion', desc: 'O rio cortou a rocha macia por milhões de anos.', nome: ['Cânion de', 'Garganta de'] },
  fiorde: { label: 'Fiorde', desc: 'Vale de geleira invadido pelo mar, entre paredões.', nome: ['Fiorde de', 'Braço de'] },
};

export interface PontoAtlas<K extends string> {
  kind: K;
  /** em % da largura e da altura */
  x: number;
  y: number;
}

export type RegiaoKind = 'cordilheira' | 'deserto' | 'floresta' | 'selva' | 'pantano' | 'tundra' | 'pradaria' | 'mar' | 'lago' | 'ilha' | 'continente' | 'geleira';

export interface RegiaoAtlas {
  kind: RegiaoKind;
  /** ponto do rótulo, em % */
  x: number;
  y: number;
  /** fração do mapa */
  area: number;
  /** ângulo do eixo maior, em graus (−40 a 40), para o rótulo seguir a serra */
  angle: number;
  /** comprimento do eixo maior, em % da largura */
  length: number;
}

export interface Atlas {
  clima: ClimaInfo;
  /** temperatura média anual em °C, por célula */
  temp: Float32Array;
  /** chuva em mm por ano, por célula */
  rain: Float32Array;
  /** índice em BIOMAS, por célula */
  biome: Uint8Array;
  /** índice em ROCHAS, por célula */
  rock: Uint8Array;
  features: Array<PontoAtlas<AcidenteId>>;
  resources: Array<PontoAtlas<RecursoId>>;
  regions: RegiaoAtlas[];
  /** natureza do plano (material, infernal, feérico...) */
  natureza: NaturezaInfo;
}

// ------------------------------------------------------------------ naturezas (planos)

export type NaturezaId = 'material' | 'infernal' | 'feerico' | 'umbral' | 'astral' | 'subterraneo';

export interface NaturezaInfo {
  id: NaturezaId;
  label: string;
  desc: string;
  /** graus somados à temperatura depois de decidir os biomas */
  calor: number;
  /** cores do "mar" deste plano: raso, aberto e fundo; sem isso, água comum */
  liquido?: { raso: [number, number, number]; mar: [number, number, number]; fundo: [number, number, number]; nome: string };
  /** troca de biomas do mundo comum pelos deste plano */
  troca: Partial<Record<BiomaId, BiomaId>>;
}

export const NATUREZAS: NaturezaInfo[] = [
  { id: 'material', label: 'Material', desc: 'O mundo comum: mares, florestas, desertos e gelo.', calor: 0, troca: {} },
  {
    id: 'infernal', label: 'Infernal', desc: 'Mares de lava, cinza no lugar de campos, serras de obsidiana e fumarolas de enxofre.', calor: 32,
    liquido: { raso: [250, 160, 60], mar: [214, 84, 28], fundo: [120, 28, 18], nome: 'lava' },
    troca: {
      fundo: 'lava', mar: 'lava', gelo_marinho: 'lava', recife: 'lava', praia: 'cinzas', gelo: 'obsidiana', tundra: 'cinzas', taiga: 'brasa', floresta: 'brasa', floresta_umida: 'brasa',
      pradaria: 'cinzas', mediterraneo: 'cinzas', deserto_frio: 'cinzas', deserto: 'cinzas', ermos: 'obsidiana', savana: 'cinzas', floresta_seca: 'brasa', selva: 'brasa',
      pantano: 'enxofre', mangue: 'enxofre', alpino: 'obsidiana', montanha: 'obsidiana', neve: 'obsidiana',
    },
  },
  {
    id: 'feerico', label: 'Feérico', desc: 'Tudo mais vivo e mais estranho: bosques que escutam, prados encantados, fungos gigantes e cristais.', calor: 3,
    liquido: { raso: [120, 220, 210], mar: [46, 150, 170], fundo: [30, 70, 120], nome: 'águas encantadas' },
    troca: {
      taiga: 'bosque_feerico', floresta: 'bosque_feerico', floresta_umida: 'bosque_feerico', selva: 'bosque_feerico', floresta_seca: 'bosque_feerico', pradaria: 'prado_encantado',
      mediterraneo: 'prado_encantado', savana: 'prado_encantado', tundra: 'prado_encantado', pantano: 'cogumelal', mangue: 'cogumelal', ermos: 'cristal', deserto: 'cristal',
      deserto_frio: 'cristal', alpino: 'cristal', gelo: 'cristal',
    },
  },
  {
    id: 'umbral', label: 'Umbral', desc: 'Um reflexo apagado do mundo: sem cor, frio, com névoa no lugar do mar e matas mortas.', calor: -6,
    liquido: { raso: [190, 192, 198], mar: [150, 152, 160], fundo: [92, 94, 104], nome: 'névoa' },
    troca: {
      fundo: 'nevoa', mar: 'nevoa', recife: 'nevoa', gelo_marinho: 'nevoa', praia: 'ermo_cinzento', tundra: 'ermo_cinzento', taiga: 'mata_morta', floresta: 'mata_morta',
      floresta_umida: 'mata_morta', selva: 'mata_morta', floresta_seca: 'mata_morta', pradaria: 'ermo_cinzento', mediterraneo: 'ermo_cinzento', savana: 'ermo_cinzento',
      deserto: 'ermo_cinzento', deserto_frio: 'ermo_cinzento', ermos: 'ermo_cinzento', pantano: 'brejo_sombrio', mangue: 'brejo_sombrio',
    },
  },
  {
    id: 'astral', label: 'Astral', desc: 'Ilhas que flutuam sobre o vazio estrelado, campos de cristal nas alturas.', calor: -4,
    liquido: { raso: [70, 60, 130], mar: [26, 22, 64], fundo: [8, 6, 20], nome: 'vazio' },
    troca: {
      fundo: 'vazio', mar: 'vazio', recife: 'vazio', gelo_marinho: 'vazio', lago: 'vazio', praia: 'campo_astral', tundra: 'campo_astral', taiga: 'campo_astral', floresta: 'campo_astral',
      floresta_umida: 'campo_astral', selva: 'campo_astral', floresta_seca: 'campo_astral', pradaria: 'campo_astral', mediterraneo: 'campo_astral', savana: 'campo_astral',
      deserto: 'campo_astral', deserto_frio: 'campo_astral', ermos: 'cristal', pantano: 'campo_astral', mangue: 'campo_astral', alpino: 'cristal', montanha: 'cristal', neve: 'cristal', gelo: 'cristal',
    },
  },
  {
    id: 'subterraneo', label: 'Subterrâneo', desc: 'O mundo de baixo: galerias, abismos, florestas de fungos e lagos negros.', calor: 0,
    liquido: { raso: [40, 40, 52], mar: [18, 18, 26], fundo: [4, 4, 8], nome: 'abismo' },
    troca: {
      fundo: 'abismo', mar: 'abismo', recife: 'abismo', gelo_marinho: 'abismo', praia: 'caverna', tundra: 'caverna', taiga: 'cogumelal', floresta: 'cogumelal', floresta_umida: 'cogumelal',
      selva: 'cogumelal', floresta_seca: 'caverna', pradaria: 'caverna', mediterraneo: 'caverna', savana: 'caverna', deserto: 'caverna', deserto_frio: 'caverna', ermos: 'caverna',
      pantano: 'cogumelal', mangue: 'cogumelal', alpino: 'cristal', montanha: 'caverna', neve: 'cristal', gelo: 'cristal',
    },
  },
];

const foldN = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
/** Natureza pelo nome ("Infernal", "feérico", "inferno", "fadas"...). */
export function naturezaInfo(raw: string | null | undefined): NaturezaInfo {
  const k = foldN(raw ?? '');
  if (!k) return NATUREZAS[0]!;
  const alias: Array<[RegExp, NaturezaId]> = [[/infern|inferno|abiss|fogo|demon/, 'infernal'], [/feer|fada|fae|encant/, 'feerico'], [/umbr|sombr|sombra|morto|cinzent/, 'umbral'],
    [/astral|celest|estrel|etere/, 'astral'], [/subterr|subsol|underdark|profund|caverna/, 'subterraneo']];
  return NATUREZAS.find((n) => n.id === k || foldN(n.label) === k) ?? NATUREZAS.find((n) => n.id === alias.find(([r]) => r.test(k))?.[1]) ?? NATUREZAS[0]!;
}

// ------------------------------------------------------------------ contas

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function lerpTable(t: Array<[number, number]>, x: number): number {
  if (x <= t[0]![0]) return t[0]![1];
  for (let i = 1; i < t.length; i++) {
    const [x1, y1] = t[i]!;
    const [x0, y0] = t[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return t[t.length - 1]![1];
}

const T_LAT: Array<[number, number]> = [[0, 27], [15, 26], [30, 20], [45, 11], [60, 1], [75, -12], [90, -24]];
const P_LAT: Array<[number, number]> = [[0, 2400], [10, 1900], [20, 900], [28, 450], [38, 800], [50, 950], [62, 650], [75, 300], [90, 160]];

/** Altitude em metros de uma altura 0..1 (abaixo do mar, profundidade negativa). */
export function altitudeM(h: number, sea = 0.42): number {
  return h < sea ? -((sea - h) / sea) * 6000 : Math.pow((h - sea) / (1 - sea), 1.25) * 5600;
}

/** Latitude (graus) de uma linha do mapa, 0 no topo e 1 no pé. */
export const latitudeAt = (c: ClimaInfo, v: number): number => c.top + (c.bottom - c.top) * v;

/** Bioma pelo clima. `wet` (0..1) separa as baixadas encharcadas; `rugged`, o terreno acidentado. */
export function biomaPorClima(T: number, P: number, alt: number, o: { wet?: number; rugged?: number; coast?: number } = {}): BiomaId {
  if (alt > 2300) return T < -7 ? 'neve' : 'montanha';
  if (T < -9) return 'gelo';
  if (alt > 1700 && T < 12) return P < 300 ? 'deserto_frio' : 'alpino';
  if (T < -1) return 'tundra';
  if (T < 4) return P > 320 ? 'taiga' : 'tundra';
  const wet = o.wet ?? 0;
  if (alt < 140 && P > 1000 && wet > 0.58 && T > 2) return T > 20 && (o.coast ?? 0) > 0.35 ? 'mangue' : 'pantano';
  if (P < 260) return T < 11 ? 'deserto_frio' : (o.rugged ?? 0) > 0.5 ? 'ermos' : 'deserto';
  if (T < 17) {
    if (P < 420) return (o.rugged ?? 0) > 0.6 ? 'ermos' : 'pradaria';
    if (P < 560) return T > 12 ? 'mediterraneo' : 'pradaria';
    if (P > 1700) return 'floresta_umida';
    return 'floresta';
  }
  if (P < 520) return (o.rugged ?? 0) > 0.55 ? 'ermos' : 'savana';
  if (P < 1150) return 'savana';
  if (P < 1750) return 'floresta_seca';
  return 'selva';
}

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ruído de valor suave, 0..1 (o mesmo desenho do terreno, sem depender dele). */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function buildAtlas(t: Terrain, opts: { clima?: string; calor?: number; natureza?: string } = {}, down?: Int32Array): Atlas {
  const { w, h, height, sea } = t;
  const N = w * h;
  const clima = climaInfo(opts.clima);
  const calor = clamp(opts.calor ?? 0, -20, 20);
  const aspect = w / h;
  const temp = new Float32Array(N);
  const rain = new Float32Array(N);
  const alt = new Float32Array(N);
  for (let i = 0; i < N; i++) alt[i] = altitudeM(height[i]!, sea);

  // temperatura: latitude, altitude e um pouco de ruído
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(latitudeAt(clima, (y + 0.5) / h));
    const t0 = lerpTable(T_LAT, lat);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const n = (vnoise((x / w) * aspect * 4, (y / h) * 4, t.seed + 401) - 0.5) * 4;
      temp[i] = t0 - Math.max(0, alt[i]!) * 0.0065 + n + calor;
    }
  }

  // chuva: o vento leva a umidade do mar terra adentro e a serra a "espreme"
  const hum = new Float32Array(N);
  // a umidade se perde por distância de verdade: num mapa maior (escala), cada célula é mais longe
  const r = (720 / w) * (t.escala ?? 1);
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(latitudeAt(clima, (y + 0.5) / h));
    // alísios (de leste) até 30°, ventos de oeste até 60°, de leste nos polos
    const dir = lat < 30 || lat > 62 ? -1 : 1;
    let q = 0.75;
    let prevH = height[y * w + (dir > 0 ? 0 : w - 1)]!;
    for (let k = 0; k < w; k++) {
      const x = dir > 0 ? k : w - 1 - k;
      const i = y * w + x;
      const e = height[i]!;
      if (e < sea || t.lake[i]) {
        q = Math.min(1, q + (1 - q) * 0.05 * r);
        hum[i] = q;
      } else {
        const up = Math.max(0, e - prevH) * 55;
        const fall = q * (0.012 * r + up * 0.9);
        hum[i] = q * (1 + up * 6);
        q = Math.max(0.04, q - Math.min(q * 0.6, fall * 0.8) - 0.0015 * r * q);
      }
      prevH = Math.max(e, sea);
    }
  }
  blur(hum, w, h, Math.max(1, Math.round(3 / r)));
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(latitudeAt(clima, (y + 0.5) / h));
    const p0 = lerpTable(P_LAT, lat) * clima.chuva;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = t.moisture[i]!;
      const temper = 0.6 + Math.min(1.6, hum[i]!) * 0.9;
      rain[i] = Math.max(30, p0 * temper * (0.55 + m * 0.9));
    }
  }

  // inclinação (para "terreno acidentado")
  const slope = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      slope[i] = Math.hypot(height[i + 1]! - height[i - 1]!, height[i + w]! - height[i - w]!) * w * 0.25;
    }
  }
  blur(slope, w, h, Math.max(1, Math.round(2 / r)));

  // biomas
  const biome = new Uint8Array(N);
  const B = (id: BiomaId) => BIOMA_IDX.get(id)!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const e = height[i]!;
      const T = temp[i]!;
      if (t.lake[i]) biome[i] = B(T < -4 ? 'gelo' : 'lago');
      else if (e < sea) {
        const Ts = T + Math.max(0, -alt[i]!) * 0; // mar: a temperatura da superfície
        if (Ts < -5) biome[i] = B('gelo_marinho');
        else if (e > sea - 0.022 && Ts > 21 && vnoise((x / w) * aspect * 18, (y / h) * 18, t.seed + 503) > 0.45) biome[i] = B('recife');
        else biome[i] = B(e < sea - 0.12 ? 'fundo' : 'mar');
      } else if (e < sea + 0.008 && t.shore[i]! > 0.6 && T > 0 && slope[i]! < 1.2) biome[i] = B('praia');
      else {
        const wet = vnoise((x / w) * aspect * 7, (y / h) * 7, t.seed + 601) * 0.6 + t.moisture[i]! * 0.4 + (t.flow[i]! > t.riverMin * 3 ? 0.15 : 0);
        biome[i] = B(biomaPorClima(T, rain[i]!, alt[i]!, { wet, rugged: clamp(slope[i]! / 2.2, 0, 1), coast: t.shore[i]! }));
      }
    }
  }

  const rng = seededRng(t.seed * 7 + 13);
  const features = acidentes(t, temp, rain, alt, biome, slope, rng, down);

  // terras vulcânicas em volta dos vulcões
  for (const f of features) {
    if (f.kind !== 'vulcao') continue;
    const cx = Math.floor((f.x / 100) * w);
    const cy = Math.floor((f.y / 100) * h);
    const R = Math.max(2, Math.round(h * 0.022));
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        const d = Math.hypot(dx, dy) / R;
        if (d > 1 || height[i]! < sea || t.lake[i]) continue;
        if (d < 0.55 + vnoise(x * 0.4, y * 0.4, t.seed + 77) * 0.45 && BIOMAS[biome[i]!]!.id !== 'neve') biome[i] = B('vulcanico');
      }
    }
  }

  const rock = rochas(t, alt, rain, biome, features);
  const resources = recursos(t, temp, rain, alt, biome, rock, rng);
  const regions = regioes(t, biome, alt);
  // outros planos: troca os biomas e o calor depois de decidir a geografia
  const natureza = naturezaInfo(opts.natureza);
  if (natureza.id !== 'material') {
    const map = new Uint8Array(BIOMAS.length).map((_, i) => i);
    for (const [from, to] of Object.entries(natureza.troca)) map[B(from as BiomaId)] = B(to!);
    for (let i = 0; i < N; i++) {
      biome[i] = map[biome[i]!]!;
      temp[i] = natureza.id === 'subterraneo' ? 14 + (temp[i]! - 14) * 0.2 : temp[i]! + natureza.calor;
    }
  }
  return { clima, temp, rain, biome, rock, features, resources, regions, natureza };
}

// ------------------------------------------------------------------ rochas

function rochas(t: Terrain, alt: Float32Array, rain: Float32Array, biome: Uint8Array, features: Array<PontoAtlas<AcidenteId>>): Uint8Array {
  const { w, h, height, sea } = t;
  const N = w * h;
  const R = (id: RochaId) => ROCHAS.findIndex((r) => r.id === id);
  const out = new Uint8Array(N);
  const vulc = features.filter((f) => f.kind === 'vulcao').map((f) => ({ x: Math.floor((f.x / 100) * w), y: Math.floor((f.y / 100) * h) }));
  const near = Math.max(3, Math.round(h * 0.05));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (height[i]! < sea || t.lake[i]) {
        out[i] = R('agua');
        continue;
      }
      const b = BIOMAS[biome[i]!]!.id;
      const s = t.stress?.[i] ?? 0;
      const oceanicPlate = t.plates && t.plate ? t.plates[t.plate[i]!]!.oceanic : false;
      const n = vnoise(x * 0.06, y * 0.06, t.seed + 909);
      let k: RochaId;
      if (b === 'gelo' || b === 'neve') k = 'gelo';
      else if (b === 'vulcanico' || oceanicPlate || s < -0.25 || vulc.some((v) => Math.abs(v.x - x) + Math.abs(v.y - y) < near)) k = 'basalto';
      else if (s > 0.18 || (!t.stress && alt[i]! > 2000 && n > 0.5)) k = 'metamorfica';
      else if (t.flow[i]! > t.riverMin * 2.5 && alt[i]! < 700) k = 'aluviao';
      else if (alt[i]! > 1800) k = 'granito';
      else if (rain[i]! < 420) k = 'arenito';
      else if (alt[i]! < 600 && t.shore[i]! > 0.05 && n > 0.35) k = 'calcario';
      else k = n > 0.55 ? 'granito' : n > 0.3 ? 'folhelho' : 'calcario';
      out[i] = R(k);
    }
  }
  return out;
}

// ------------------------------------------------------------------ acidentes

function spaced<T extends { x: number; y: number }>(list: T[], min: number, max: number, taken: Array<{ x: number; y: number }> = []): T[] {
  const out: T[] = [];
  for (const p of list) {
    if (out.length >= max) break;
    if ([...taken, ...out].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < min)) continue;
    out.push(p);
  }
  return out;
}

const pct = (t: Terrain, i: number) => ({ x: Math.round((((i % t.w) + 0.5) / t.w) * 1000) / 10, y: Math.round(((((i / t.w) | 0) + 0.5) / t.h) * 1000) / 10 });

function acidentes(t: Terrain, temp: Float32Array, rain: Float32Array, alt: Float32Array, biome: Uint8Array, slope: Float32Array, rng: Rng, down?: Int32Array): Array<PontoAtlas<AcidenteId>> {
  const { w, h, height, sea } = t;
  const N = w * h;
  const out: Array<PontoAtlas<AcidenteId>> = [];
  const add = (kind: AcidenteId, pts: Array<{ x: number; y: number }>) => out.push(...pts.map((p) => ({ kind, x: p.x, y: p.y })));
  const step = Math.max(1, Math.round(w / 180));
  const id = (i: number) => BIOMAS[biome[i]!]!.id;

  // vulcões: picos onde as placas se chocam (ou, sem placas, alguns picos ao acaso)
  const cand: Array<{ i: number; score: number }> = [];
  for (let y = 2; y < h - 2; y += step) {
    for (let x = 2; x < w - 2; x += step) {
      const i = y * w + x;
      const s = t.stress?.[i] ?? 0;
      const land = height[i]! >= sea && !t.lake[i];
      const oceanArc = !land && height[i]! > sea - 0.06 && s > 0.45;
      if (!land && !oceanArc) continue;
      const score = t.stress ? s * (land ? 1 + alt[i]! / 3000 : 0.8) : alt[i]! > 2200 ? hash2(x, y, t.seed + 3) * 0.6 : 0;
      if (score > 0.32) cand.push({ i, score: score + rng() * 0.2 });
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const vulcoes = spaced(cand.map((c) => pct(t, c.i)), 10, t.stress ? 7 : 3);
  // ponto quente: um vulcão longe das bordas, às vezes
  if (rng() < 0.55) {
    for (let k = 0; k < 200; k++) {
      const i = Math.floor(rng() * N);
      if (height[i]! > sea + 0.04 && !t.lake[i]) {
        vulcoes.push(...spaced([pct(t, i)], 12, 1, vulcoes));
        break;
      }
    }
  }
  add('vulcao', vulcoes);

  // fontes termais e gêiseres perto dos vulcões
  for (const v of vulcoes) {
    for (let k = 0; k < 12; k++) {
      const a = rng() * Math.PI * 2;
      const d = 2.5 + rng() * 4;
      const p = { x: clamp(v.x + Math.cos(a) * d, 1, 99), y: clamp(v.y + Math.sin(a) * d * aspectInv(t), 1, 99) };
      const i = cellOf(t, p);
      if (height[i]! < sea || t.lake[i]) continue;
      if (rng() < 0.6) add(temp[i]! < 10 && rng() < 0.5 ? 'geiser' : 'fonte_termal', [p]);
      break;
    }
  }

  // cachoeiras: onde o rio desce muito em pouco espaço
  const quedas: Array<{ x: number; y: number; s: number }> = [];
  for (const r of t.rivers) {
    if (r.w < 0.16) continue;
    for (let k = 2; k < r.pts.length; k += 2) {
      const a = r.pts[k - 2]!;
      const b = r.pts[k]!;
      const ha = height[cellOf(t, a)]!;
      const hb = height[cellOf(t, b)]!;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 0.01;
      const drop = (ha - hb) / d;
      if (drop > 0.03 && hb > sea + 0.02) quedas.push({ x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, s: drop });
    }
  }
  quedas.sort((a, b) => b.s - a.s);
  add('cachoeira', spaced(quedas, 6, 7));

  // deltas: a foz dos rios largos
  const deltas = t.rivers.filter((r) => r.w >= 0.34).map((r) => r.pts[r.pts.length - 1]!).filter((p) => height[cellOf(t, p)]! < sea + 0.01);
  add('delta', spaced(deltas.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })), 10, 4));

  // por amostragem: cavernas, oásis, cânions, fiordes
  const sample = (n: number, ok: (i: number) => boolean): Array<{ x: number; y: number }> => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let k = 0; k < n * 300 && pts.length < n * 6; k++) {
      const i = Math.floor(rng() * N);
      if (ok(i)) pts.push(pct(t, i));
    }
    return pts;
  };
  const taken = () => out.map((f) => ({ x: f.x, y: f.y }));
  add('caverna', spaced(sample(6, (i) => height[i]! > sea + 0.03 && slope[i]! > 0.9 && alt[i]! < 2400 && (id(i) === 'floresta' || id(i) === 'floresta_umida' || id(i) === 'selva' || id(i) === 'mediterraneo' || id(i) === 'alpino' || id(i) === 'floresta_seca')), 8, 6, taken()));
  add('oasis', spaced(sample(4, (i) => id(i) === 'deserto' && t.moisture[i]! > 0.42), 9, 4, taken()));
  add('canion', spaced(sample(3, (i) => t.flow[i]! > t.riverMin * 1.5 && rain[i]! < 600 && alt[i]! > 500), 10, 3, taken()));
  add('fiorde', spaced(sample(3, (i) => height[i]! < sea && height[i]! > sea - 0.03 && temp[i]! < 3 && neighborsMax(t, i, 3) > sea + 0.18), 10, 3, taken()));
  if (rng() < 0.4) add('cratera', spaced(sample(1, (i) => height[i]! > sea + 0.05 && slope[i]! < 0.8 && !t.lake[i]), 10, 1, taken()));
  void down;
  return out;
}

const aspectInv = (t: Terrain) => t.w / t.h;
function cellOf(t: Terrain, p: { x: number; y: number }): number {
  return clamp(Math.floor((p.y / 100) * t.h), 0, t.h - 1) * t.w + clamp(Math.floor((p.x / 100) * t.w), 0, t.w - 1);
}
function neighborsMax(t: Terrain, i: number, r: number): number {
  const x0 = i % t.w;
  const y0 = (i / t.w) | 0;
  let m = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx;
    const y = y0 + dy;
    if (x >= 0 && y >= 0 && x < t.w && y < t.h) m = Math.max(m, t.height[y * t.w + x]!);
  }
  return m;
}

// ------------------------------------------------------------------ recursos

function recursos(t: Terrain, temp: Float32Array, rain: Float32Array, alt: Float32Array, biome: Uint8Array, rock: Uint8Array, rng: Rng): Array<PontoAtlas<RecursoId>> {
  const { w, h, height, sea } = t;
  const out: Array<PontoAtlas<RecursoId>> = [];
  const gap = 6.5;
  const per: Partial<Record<RecursoId, number>> = {};
  const cap = 4;
  const S = Math.max(2, Math.round(h * 0.045));
  for (let y = Math.floor(S / 2); y < h; y += S) {
    for (let x = Math.floor(S / 2); x < w; x += S) {
      const jx = clamp(x + Math.floor((rng() - 0.5) * S), 0, w - 1);
      const jy = clamp(y + Math.floor((rng() - 0.5) * S), 0, h - 1);
      const i = jy * w + jx;
      const water = height[i]! < sea || !!t.lake[i];
      const b = BIOMAS[biome[i]!]!.id;
      const r = ROCHAS[rock[i]!]!.id;
      const T = temp[i]!;
      const P = rain[i]!;
      const A = alt[i]!;
      const opts: Array<[RecursoId, number]> = [];
      if (water) {
        if (b === 'recife') opts.push(['perolas', 0.25]);
        if (height[i]! > sea - 0.05 && t.shore[i]! > 0.5) opts.push(['peixe', T < 18 ? 0.08 : 0.04]);
      } else {
        if (r === 'metamorfica') opts.push(['ferro', 0.12], ['gemas', 0.06], ['prata', 0.06], ['marmore', 0.07], ['ouro', 0.04]);
        if (r === 'granito') opts.push(['estanho', 0.07], ['ferro', 0.05], ['ouro', 0.02]);
        if (r === 'basalto' && (b === 'vulcanico' || (t.stress?.[i] ?? 0) > 0.2)) opts.push(['obsidiana', 0.12], ['enxofre', 0.1], ['cobre', 0.1]);
        if (r === 'aluviao') opts.push(['graos', T > 4 && P > 450 ? 0.16 : 0], ['ouro', A > 300 ? 0.04 : 0.01]);
        if (r === 'folhelho' && P > 600) opts.push(['carvao', 0.08]);
        if (r === 'calcario') opts.push(['marmore', 0.03]);
        if (b === 'deserto' || b === 'deserto_frio' || b === 'ermos') opts.push(['sal', 0.08], ['incenso', b === 'deserto' ? 0.04 : 0]);
        if (b === 'taiga' || b === 'tundra') opts.push(['peles', 0.1]);
        if (b === 'floresta' || b === 'floresta_umida' || b === 'taiga') opts.push(['madeira', 0.08]);
        if (b === 'selva' || b === 'floresta_seca') opts.push(['especiarias', 0.1], ['madeira', 0.05]);
        if (b === 'pradaria' || b === 'savana') opts.push(['cavalos', 0.1], ['graos', 0.05]);
        if (b === 'mediterraneo') opts.push(['vinho', 0.16]);
      }
      for (const [k, p] of opts) {
        if ((per[k] ?? 0) >= cap || rng() > p) continue;
        const pt = pct(t, i);
        if (out.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < gap)) continue;
        out.push({ kind: k, ...pt });
        per[k] = (per[k] ?? 0) + 1;
        break;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ regiões com nome

const REGIAO_DE: Partial<Record<BiomaId, RegiaoKind>> = {
  montanha: 'cordilheira', neve: 'cordilheira', alpino: 'cordilheira', vulcanico: 'cordilheira',
  deserto: 'deserto', deserto_frio: 'deserto', ermos: 'deserto',
  floresta: 'floresta', floresta_umida: 'floresta', taiga: 'floresta', floresta_seca: 'floresta',
  selva: 'selva', pantano: 'pantano', mangue: 'pantano', tundra: 'tundra', pradaria: 'pradaria', savana: 'pradaria', gelo: 'geleira',
};

/** Manchas grandes de um mesmo tipo de terreno (serras, desertos, florestas, mares, ilhas), para pôr nome. */
function regioes(t: Terrain, biome: Uint8Array, alt: Float32Array): RegiaoAtlas[] {
  const S = Math.max(1, Math.round(t.w / 160));
  const gw = Math.floor(t.w / S);
  const gh = Math.floor(t.h / S);
  const G = gw * gh;
  const kindOf = new Array<RegiaoKind | null>(G);
  const isLand = new Uint8Array(G);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = (y * S + (S >> 1)) * t.w + x * S + (S >> 1);
      const b = BIOMAS[biome[i]!]!;
      const k = y * gw + x;
      if (b.id === 'lago') kindOf[k] = 'lago';
      else if (b.agua) kindOf[k] = 'mar';
      else {
        isLand[k] = 1;
        kindOf[k] = alt[i]! > 1500 ? 'cordilheira' : REGIAO_DE[b.id] ?? null;
      }
    }
  }
  const out: RegiaoAtlas[] = [];
  const seen = new Uint8Array(G);
  const comp = (start: number, same: (k: number) => boolean): number[] => {
    const cells: number[] = [];
    const st = [start];
    seen[start] = 1;
    while (st.length) {
      const k = st.pop()!;
      cells.push(k);
      const x = k % gw;
      const y = (k / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const j = ny * gw + nx;
        if (!seen[j] && same(j)) {
          seen[j] = 1;
          st.push(j);
        }
      }
    }
    return cells;
  };
  const shape = (cells: number[], kind: RegiaoKind): RegiaoAtlas => {
    let sx = 0;
    let sy = 0;
    for (const k of cells) {
      sx += k % gw;
      sy += (k / gw) | 0;
    }
    const mx = sx / cells.length;
    const my = sy / cells.length;
    let cxx = 0;
    let cyy = 0;
    let cxy = 0;
    for (const k of cells) {
      const dx = (k % gw) - mx;
      const dy = ((k / gw) | 0) - my;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
    const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const l1 = (cxx + cyy) / 2 + Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy * cxy);
    const length = (Math.sqrt(l1 / cells.length) * 3.4 * 100) / gw;
    // o rótulo vai na célula da mancha mais perto do centro (a mancha pode ser torta)
    let best = cells[0]!;
    let bd = Infinity;
    for (const k of cells) {
      const d = ((k % gw) - mx) ** 2 + (((k / gw) | 0) - my) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    const deg = clamp((ang * 180) / Math.PI, -40, 40);
    const elong = kind === 'cordilheira' || kind === 'floresta' || kind === 'deserto';
    return {
      kind, x: Math.round((((best % gw) + 0.5) / gw) * 1000) / 10, y: Math.round(((((best / gw) | 0) + 0.5) / gh) * 1000) / 10,
      area: cells.length / G, angle: elong ? Math.round(deg) : 0, length: Math.round(length * 10) / 10,
    };
  };
  // manchas de terreno
  const MIN: Record<RegiaoKind, number> = { cordilheira: 0.004, deserto: 0.01, floresta: 0.014, selva: 0.012, pantano: 0.004, tundra: 0.015, pradaria: 0.02, mar: 0.02, lago: 0.0012, ilha: 0.0006, continente: 0.12, geleira: 0.01 };
  for (let k = 0; k < G; k++) {
    const kind = kindOf[k];
    if (seen[k] || !kind || kind === 'mar') continue;
    const cells = comp(k, (j) => kindOf[j] === kind);
    if (cells.length / G >= MIN[kind]) out.push(shape(cells, kind));
  }
  // massas de terra: ilhas e continentes
  seen.fill(0);
  const land: Array<{ cells: number[] }> = [];
  for (let k = 0; k < G; k++) if (isLand[k] && !seen[k]) land.push({ cells: comp(k, (j) => !!isLand[j]) });
  for (const l of land) {
    const a = l.cells.length / G;
    if (a >= MIN.continente) out.push(shape(l.cells, 'continente'));
    else if (a >= MIN.ilha && a < 0.04) out.push(shape(l.cells, 'ilha'));
  }
  // mares: o oceano todo é uma mancha só; o rótulo vai nos pontos mais longe da terra
  seen.fill(0);
  const dist = new Float32Array(G).fill(Infinity);
  const q: number[] = [];
  for (let k = 0; k < G; k++) if (kindOf[k] !== 'mar') {
    dist[k] = 0;
    q.push(k);
  }
  for (let head = 0; head < q.length; head++) {
    const k = q[head]!;
    const x = k % gw;
    const y = (k / gw) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
      const j = ny * gw + nx;
      if (dist[j]! > dist[k]! + 1) {
        dist[j] = dist[k]! + 1;
        q.push(j);
      }
    }
  }
  const mares = [...dist.keys()].filter((k) => kindOf[k] === 'mar' && dist[k]! >= 6).sort((a, b) => dist[b]! - dist[a]!);
  const picked: Array<{ x: number; y: number }> = [];
  for (const k of mares) {
    const p = { x: Math.round((((k % gw) + 0.5) / gw) * 1000) / 10, y: Math.round(((((k / gw) | 0) + 0.5) / gh) * 1000) / 10 };
    if (p.x < 8 || p.x > 92 || p.y < 6 || p.y > 94) continue;
    if (picked.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 30)) continue;
    picked.push(p);
    out.push({ kind: 'mar', ...p, area: dist[k]! / Math.max(gw, gh), angle: 0, length: 20 });
    if (picked.length >= 3) break;
  }
  // as maiores primeiro (rótulos maiores e com prioridade)
  return out.sort((a, b) => b.area - a.area).slice(0, 28);
}

// ------------------------------------------------------------------ símbolos de mapa

export type SimboloKind = 'monte' | 'colina' | 'pinheiro' | 'arvore' | 'palmeira' | 'capim' | 'duna' | 'cacto' | 'pedra' | 'cogumelo' | 'cristal';

export interface Simbolo {
  k: SimboloKind;
  x: number;
  y: number;
  /** tamanho em % da altura do mapa */
  s: number;
  /** variação do desenho (0..2) */
  v: number;
}

/**
 * Símbolos de mapa desenhado (montanhas, árvores, dunas, capim) espalhados
 * numa grade com tremido, sem sobrepor. `dens` 0,5 a 2. Ordenados de cima
 * para baixo, para os de baixo cobrirem os de cima como num mapa à mão.
 */
export function mapSymbols(t: Terrain, dens = 1): Simbolo[] {
  const a = t.atlas;
  if (!a) return [];
  const rng = seededRng(t.seed * 3 + 5);
  const out: Simbolo[] = [];
  const step = 1.55 / clamp(dens, 0.4, 2.5);
  const aspect = t.w / t.h;
  for (let py = step / 2; py < 100; py += step) {
    for (let px = step / 2 / aspect; px < 100; px += step / aspect) {
      const x = px + (rng() - 0.5) * (step / aspect) * 0.9;
      const y = py + (rng() - 0.5) * step * 0.9;
      if (x < 0.5 || y < 0.8 || x > 99.5 || y > 99.5) continue;
      const i = cellOf(t, { x, y });
      if (t.height[i]! < t.sea || t.lake[i] || t.flow[i]! >= t.riverMin) continue;
      const b = BIOMAS[a.biome[i]!]!.id;
      const A = altitudeM(t.height[i]!, t.sea);
      const r = rng();
      const v = Math.floor(rng() * 3);
      let k: SimboloKind | null = null;
      let s = step;
      if (A > 1500 || b === 'neve' || b === 'montanha') {
        k = 'monte';
        s = step * (1.05 + Math.min(1.1, (A - 1500) / 2600));
      } else if (A > 800 && r < 0.75) {
        k = 'colina';
        s = step * 0.85;
      } else if (b === 'taiga') k = r < 0.85 ? 'pinheiro' : null;
      else if (b === 'floresta' || b === 'floresta_umida') k = r < 0.85 ? (b === 'floresta_umida' && r < 0.3 ? 'pinheiro' : 'arvore') : null;
      else if (b === 'selva') k = r < 0.9 ? (r < 0.35 ? 'palmeira' : 'arvore') : null;
      else if (b === 'floresta_seca') k = r < 0.6 ? 'arvore' : null;
      else if (b === 'savana') k = r < 0.18 ? 'arvore' : r < 0.4 ? 'capim' : null;
      else if (b === 'pantano' || b === 'mangue') k = r < 0.6 ? 'capim' : null;
      else if (b === 'deserto') k = r < 0.32 ? 'duna' : r < 0.36 ? 'cacto' : null;
      else if (b === 'ermos') k = r < 0.3 ? 'pedra' : null;
      else if (b === 'pradaria') k = r < 0.14 ? 'capim' : null;
      else if (b === 'mediterraneo') k = r < 0.25 ? 'arvore' : null;
      else if (b === 'tundra') k = r < 0.1 ? 'capim' : null;
      else if (b === 'deserto_frio') k = r < 0.12 ? 'pedra' : null;
      else if (b === 'vulcanico' || b === 'alpino') k = r < 0.3 ? 'pedra' : null;
      else if (b === 'bosque_feerico') k = r < 0.85 ? 'arvore' : null;
      else if (b === 'brasa' || b === 'mata_morta') k = r < 0.55 ? 'arvore' : null;
      else if (b === 'cogumelal') k = r < 0.6 ? 'cogumelo' : null;
      else if (b === 'prado_encantado') k = r < 0.22 ? 'capim' : null;
      else if (b === 'cristal' || b === 'obsidiana') k = r < 0.4 ? 'cristal' : null;
      else if (b === 'cinzas' || b === 'ermo_cinzento' || b === 'caverna') k = r < 0.12 ? 'pedra' : null;
      else if (b === 'enxofre' || b === 'brejo_sombrio') k = r < 0.3 ? 'capim' : null;
      else if (b === 'campo_astral') k = r < 0.2 ? 'arvore' : null;
      if (!k) continue;
      if (k === 'arvore' || k === 'pinheiro' || k === 'palmeira') s = step * (0.62 + rng() * 0.2);
      out.push({ k, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, s: Math.round(s * 100) / 100, v });
    }
  }
  return out.sort((p, q) => p.y - q.y);
}

// ------------------------------------------------------------------ leitura num ponto

export interface Sondagem {
  bioma: BiomaInfo;
  altitude: number;
  temperatura: number;
  chuva: number;
  rocha: (typeof ROCHAS)[number];
  latitude: number;
  placa: { oceanic: boolean; borda: 'convergente' | 'divergente' | null } | null;
  recursos: Array<PontoAtlas<RecursoId>>;
  acidentes: Array<PontoAtlas<AcidenteId>>;
}

/** Tudo o que o atlas sabe de um ponto (em %): para o "explorar" do mapa. */
export function sondar(t: Terrain, x: number, y: number): Sondagem | null {
  const a = t.atlas;
  if (!a) return null;
  const i = cellOf(t, { x, y });
  const s = t.stress?.[i] ?? 0;
  const near = <K extends string>(l: Array<PontoAtlas<K>>, r: number) => l.filter((p) => Math.hypot(p.x - x, p.y - y) < r);
  return {
    bioma: BIOMAS[a.biome[i]!]!,
    altitude: Math.round(altitudeM(t.height[i]!, t.sea)),
    temperatura: Math.round(a.temp[i]! * 10) / 10,
    chuva: Math.round(a.rain[i]! / 10) * 10,
    rocha: ROCHAS[a.rock[i]!]!,
    latitude: Math.round(latitudeAt(a.clima, y / 100)),
    placa: t.plates && t.plate ? { oceanic: t.plates[t.plate[i]!]!.oceanic, borda: s > 0.12 ? 'convergente' : s < -0.12 ? 'divergente' : null } : null,
    recursos: near(a.resources, 5),
    acidentes: near(a.features, 4),
  };
}

/** Quanto da terra é de cada bioma (fração), do maior para o menor. */
export function biomeShares(t: Terrain): Array<{ bioma: BiomaInfo; share: number }> {
  const a = t.atlas;
  if (!a) return [];
  const n = new Array<number>(BIOMAS.length).fill(0);
  let land = 0;
  for (let i = 0; i < a.biome.length; i++) {
    const b = BIOMAS[a.biome[i]!]!;
    if (b.agua) continue;
    n[a.biome[i]!]!++;
    land++;
  }
  return n.map((c, i) => ({ bioma: BIOMAS[i]!, share: land ? c / land : 0 })).filter((x) => x.share > 0.002).sort((p, q) => q.share - p.share);
}

/**
 * Texto de geografia do mapa, em markdown, para quem escreve: clima, biomas
 * principais, serras, vulcões, recursos. Vai para a seção "Geografia" da nota.
 */
export function geografiaTexto(t: Terrain, nomes: Map<string, string> = new Map()): string {
  const a = t.atlas;
  if (!a) return '';
  let land = 0;
  let hi = 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < t.height.length; i++) {
    if (t.height[i]! < t.sea || t.lake[i]) continue;
    land++;
    hi = Math.max(hi, t.height[i]!);
    tMin = Math.min(tMin, a.temp[i]!);
    tMax = Math.max(tMax, a.temp[i]!);
  }
  const shares = biomeShares(t).slice(0, 5);
  const lines: string[] = [];
  lines.push(`- **Clima:** ${a.clima.label.toLowerCase()}, de ${Math.round(tMin)} °C a ${Math.round(tMax)} °C de média anual.`);
  lines.push(`- **Terra:** ${Math.round((land / t.height.length) * 100)}% do mapa; ponto mais alto a ${Math.round(altitudeM(hi, t.sea)).toLocaleString('pt-BR')} m.`);
  if (shares.length) lines.push(`- **Paisagens:** ${shares.map((s) => `${s.bioma.label.toLowerCase()} (${Math.round(s.share * 100)}%)`).join(', ')}.`);
  const count = <K extends string>(l: Array<PontoAtlas<K>>, k: K) => l.filter((f) => f.kind === k).length;
  const ac = (Object.keys(ACIDENTES) as AcidenteId[]).filter((k) => count(a.features, k)).map((k) => `${count(a.features, k)} ${ACIDENTES[k].label.toLowerCase()}${count(a.features, k) > 1 && !/s$/.test(ACIDENTES[k].label) ? 's' : ''}`);
  if (ac.length) lines.push(`- **Acidentes:** ${ac.join(', ')}.`);
  const rec = [...new Set(a.resources.map((r) => RECURSOS[r.kind].label.toLowerCase()))];
  if (rec.length) lines.push(`- **Riquezas:** ${rec.join(', ')}.`);
  if (t.rivers.length) lines.push(`- **Rios:** ${t.rivers.filter((r) => r.w >= 0.24).length} rios grandes e muitos afluentes.`);
  const named = [...nomes.values()];
  if (named.length) lines.push(`- **Nomes no mapa:** ${named.slice(0, 14).join(', ')}.`);
  return lines.join('\n');
}
