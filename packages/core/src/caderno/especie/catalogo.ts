/*
 * Catálogo do construtor de espécies: os campos da ficha, as opções de cada um
 * (separadas em seções e marcadas como reais ou fantásticas) e os planos de
 * corpo que o desenho sabe fazer. Tudo vira propriedade comum no frontmatter.
 */

export type SpeciesGroup = 'corpo' | 'anatomia' | 'vida' | 'sentidos' | 'mente' | 'ambiente';

/** "real" existe na natureza; "fantasia" só num mundo inventado. */
export type SpeciesRealm = 'real' | 'fantasia';

export interface SpeciesSection {
  label: string;
  tipo: SpeciesRealm;
  options: string[];
}

export interface SpeciesField {
  key: string;
  label: string;
  group: SpeciesGroup;
  /** todas as opções, em lista corrida */
  options?: string[];
  /** as mesmas opções, organizadas em seções */
  sections?: SpeciesSection[];
  /** aceita várias opções, separadas por vírgula */
  multi?: boolean;
  hint?: string;
  /** muda o desenho da espécie */
  desenha?: boolean;
}

export const SPECIES_GROUPS: Array<{ id: SpeciesGroup; label: string; desc: string }> = [
  { id: 'corpo', label: 'Corpo', desc: 'Forma, tamanho, pele e cores.' },
  { id: 'anatomia', label: 'Anatomia', desc: 'Cabeça, olhos, chifres, asas, cauda e traços.' },
  { id: 'vida', label: 'Ciclo de vida', desc: 'Comer, crescer, reproduzir, morrer.' },
  { id: 'sentidos', label: 'Sentidos e dons', desc: 'Como percebem o mundo, se movem, atacam e se defendem.' },
  { id: 'mente', label: 'Mente e sociedade', desc: 'Como pensam, falam e vivem juntos.' },
  { id: 'ambiente', label: 'Ambiente', desc: 'Onde vivem, de onde vieram e que papel têm na natureza.' },
];

const real = (label: string, ...options: string[]): SpeciesSection => ({ label, tipo: 'real', options });
const fant = (label: string, ...options: string[]): SpeciesSection => ({ label, tipo: 'fantasia', options });

function campo(key: string, label: string, group: SpeciesGroup, sections: SpeciesSection[], extra: Partial<SpeciesField> = {}): SpeciesField {
  return { key, label, group, sections, options: sections.flatMap((s) => s.options), ...extra };
}

export const SPECIES_FIELDS: SpeciesField[] = [
  // ------------------------------------------------------------------ corpo
  campo('corpo', 'Plano do corpo', 'corpo', [
    real('Em terra', 'bípede', 'quadrúpede', 'terópode', 'saltador', 'primata', 'quelônio'),
    real('No ar', 'alado'),
    real('Rastejantes', 'serpentino', 'miriápode', 'verme', 'molusco'),
    real('Artrópodes', 'hexápode', 'octópode', 'crustáceo'),
    real('Na água', 'aquático', 'cetáceo', 'cefalópode', 'radial'),
    fant('Híbridos', 'centauroide', 'naga', 'sereiano', 'aracnoide'),
    fant('Míticos', 'dragão', 'arbóreo', 'fungoide', 'colosso'),
    fant('Sem forma fixa', 'amorfo', 'espectral', 'orbe', 'elemental', 'enxame'),
  ], { desenha: true }),
  campo('porte', 'Porte', 'corpo', [real('Constituição', 'esguio', 'ágil', 'médio', 'robusto', 'massivo')], { desenha: true }),
  { key: 'altura', label: 'Tamanho', group: 'corpo', hint: 'em metros: 1,7', desenha: true },
  { key: 'peso', label: 'Peso', group: 'corpo', hint: 'em kg: 70' },
  campo('revestimento', 'Revestimento', 'corpo', [
    real('Macios', 'pele nua', 'pelos', 'lã', 'penas', 'couro grosso', 'gosma'),
    real('Duros', 'escamas', 'placas ósseas', 'quitina', 'casca'),
    real('Vivos', 'casca vegetal', 'musgo', 'coral'),
    fant('Minerais', 'cristal', 'pedra', 'metal', 'gelo', 'osso exposto'),
    fant('Impossíveis', 'chamas', 'lava', 'sombra', 'luz', 'névoa'),
  ], { desenha: true }),
  campo('padrão', 'Padrão', 'corpo', [
    real('Na natureza', 'liso', 'listras', 'manchas', 'pintas', 'rosetas', 'anéis', 'ventre claro', 'máscara', 'sela'),
    fant('Sobrenaturais', 'runas', 'veios brilhantes', 'constelações', 'iridescente'),
  ], { desenha: true }),
  { key: 'cor', label: 'Cores', group: 'corpo', hint: 'principal, detalhe e ventre: verde, dourado e creme', desenha: true },

  // ------------------------------------------------------------------ anatomia
  campo('cabeça', 'Cabeça', 'anatomia', [
    real('Mamíferos', 'humana', 'canina', 'felina', 'equina', 'bovina', 'tromba'),
    real('Outros bichos', 'reptiliana', 'bico', 'tubarão', 'insetoide', 'sem rosto'),
    fant('Fantásticas', 'dracônica', 'caveira', 'tentacular'),
  ], { desenha: true }),
  campo('cabeças', 'Quantas cabeças', 'anatomia', [real('Normal', 'uma'), fant('A mais', 'duas', 'três', 'cinco', 'sete')], { desenha: true }),
  campo('olhos', 'Olhos', 'anatomia', [
    real('Quantidade', 'nenhum', 'dois', 'quatro', 'seis', 'oito'),
    fant('Estranhos', 'um', 'três', 'muitos'),
  ], { desenha: true }),
  campo('pupila', 'Pupila', 'anatomia', [
    real('Forma', 'redonda', 'vertical', 'horizontal', 'composta'),
    fant('Estranhas', 'brilhante', 'sem pupila'),
  ], { desenha: true }),
  campo('orelhas', 'Orelhas', 'anatomia', [
    real('Forma', 'sem orelhas', 'humanas', 'felinas', 'caninas', 'de coelho', 'de morcego', 'caídas'),
    fant('Fantásticas', 'pontudas', 'longas', 'barbatanas'),
  ], { desenha: true }),
  campo('chifres', 'Chifres', 'anatomia', [
    real('Na natureza', 'sem chifres', 'de touro', 'de carneiro', 'galhada', 'de antílope', 'no focinho'),
    fant('Fantásticos', 'unicórnio', 'demoníacos', 'coroa de chifres', 'de cristal'),
  ], { desenha: true }),
  campo('dentição', 'Dentição', 'anatomia', [
    real('Tipo', 'dentes comuns', 'presas', 'dentes-de-sabre', 'serrilhada', 'mandíbulas', 'sem dentes'),
  ], { desenha: true }),
  campo('braços', 'Braços', 'anatomia', [
    real('Pares', 'nenhum', 'dois'),
    fant('A mais', 'quatro', 'seis'),
  ], { desenha: true, hint: 'vale para corpos com tronco' }),
  campo('extremidades', 'Mãos e pés', 'anatomia', [
    real('Tipo', 'mãos', 'garras', 'cascos', 'patas', 'pinças', 'nadadeiras', 'ventosas'),
    fant('Fantásticas', 'raízes', 'lâminas'),
  ], { desenha: true }),
  campo('asas', 'Asas', 'anatomia', [
    real('Na natureza', 'sem asas', 'de penas', 'de membrana', 'de inseto', 'de borboleta'),
    fant('Fantásticas', 'de energia', 'de sombra', 'de cristal', 'de ossos'),
  ], { desenha: true }),
  campo('cauda', 'Cauda', 'anatomia', [
    real('Na natureza', 'sem cauda', 'curta', 'chicote', 'felpuda', 'de lagarto', 'preênsil', 'clava', 'ferrão', 'leque de penas', 'de peixe'),
    fant('Fantásticas', 'dupla', 'de chamas', 'lâmina'),
  ], { desenha: true }),
  campo('traços físicos', 'Traços', 'anatomia', [
    real('Na cabeça', 'cabelo curto', 'cabelo longo', 'juba', 'crista', 'barba', 'bigodes', 'antenas', 'guelras', 'tentáculos faciais'),
    real('No corpo', 'espinhos', 'barbatana dorsal', 'vela dorsal', 'placas dorsais', 'carapaça', 'corcova', 'tentáculos', 'brilho'),
    real('Por dentro', 'ferrão venenoso', 'glândula de tinta', 'sangue ácido', 'bolsa marsupial', 'ossos ocos', 'segundo estômago', 'dois corações'),
    fant('Sobrenaturais', 'halo', 'coroa de chamas', 'terceiro olho', 'cristais nas costas', 'galhos na cabeça', 'flores no corpo', 'cabelos de serpente', 'aura', 'fumaça', 'corpo translúcido', 'olhos pela pele', 'coração visível'),
  ], { multi: true, desenha: true }),

  // ------------------------------------------------------------------ vida
  campo('dieta', 'Dieta', 'vida', [
    real('Plantas e luz', 'herbívoro', 'frugívoro', 'fotossintético', 'quimiossintético'),
    real('Carne', 'carnívoro', 'insetívoro', 'piscívoro', 'hematófago', 'parasita'),
    real('De tudo', 'onívoro', 'necrófago', 'detritívoro', 'filtrador'),
    fant('Impossíveis', 'de magia', 'de emoções', 'de memórias', 'de sonhos', 'de almas', 'de luz', 'de minerais', 'de som'),
  ]),
  campo('alimentação', 'Como consegue comida', 'vida', [
    real('Estratégia', 'pastoreio', 'coleta', 'emboscada', 'perseguição', 'caça em grupo', 'armadilhas', 'filtragem', 'cultivo', 'roubo de comida'),
    fant('Sobrenatural', 'atração hipnótica', 'absorção à distância'),
  ]),
  campo('metabolismo', 'Metabolismo', 'vida', [
    real('Na natureza', 'sangue quente', 'sangue frio', 'hiberna', 'estiva', 'torpor diário', 'não dorme'),
    fant('Fantásticos', 'movido a magia', 'não respira', 'não envelhece'),
  ]),
  campo('reprodução', 'Reprodução', 'vida', [
    real('Na natureza', 'vivíparo', 'ovíparo', 'ovovivíparo', 'marsupial', 'esporos', 'brotamento', 'sementes', 'partenogênese', 'fissão', 'parasitária'),
    fant('Fantástica', 'ritual mágico', 'renasce das cinzas', 'nasce da pedra', 'nasce dos sonhos', 'é construído'),
  ]),
  campo('crescimento', 'Crescimento', 'vida', [
    real('Da cria ao adulto', 'direto', 'metamorfose', 'larva e pupa', 'mudas de pele', 'cresce a vida toda', 'neotenia'),
    fant('Fantástico', 'muda com a lua', 'absorve os ancestrais'),
  ]),
  campo('sexos', 'Sexos', 'vida', [
    real('Na natureza', 'dois', 'um só', 'hermafrodita', 'muda com a idade', 'muda com a estação', 'três ou mais', 'nenhum'),
  ]),
  campo('cuidado', 'Quem cria os filhos', 'vida', [
    real('Cuidado', 'ninguém', 'a mãe', 'o pai', 'o casal', 'o grupo todo', 'ninhos coletivos', 'outra espécie'),
  ]),
  { key: 'gestação', label: 'Gestação', group: 'vida', hint: 'meses: 9' },
  { key: 'ninhada', label: 'Filhos por vez', group: 'vida', hint: '1, 2-4, centenas' },
  { key: 'maioridade', label: 'Maioridade', group: 'vida', hint: 'anos: 16' },
  { key: 'expectativa de vida', label: 'Vive', group: 'vida', hint: 'anos: 80' },
  campo('fim da vida', 'Como morrem', 'vida', [
    real('Na natureza', 'velhice', 'morrem ao procriar', 'nunca por idade'),
    fant('Fantástico', 'viram pedra', 'viram árvore', 'desfazem-se em luz', 'renascem', 'voltam como espíritos'),
  ]),

  // ------------------------------------------------------------------ sentidos e dons
  campo('sentidos', 'Sentidos especiais', 'sentidos', [
    real('Visão', 'visão no escuro', 'visão ultravioleta', 'sente calor', 'visão telescópica', 'visão quase total', 'cego'),
    real('Outros', 'faro aguçado', 'audição fina', 'ecolocalização', 'sente tremores', 'eletrorrecepção', 'sente o magnetismo', 'linha lateral', 'feromônios'),
    fant('Sobrenaturais', 'sente magia', 'telepatia', 'sente emoções', 'vê espíritos', 'pressente o perigo', 'sente mentiras', 'vê o futuro próximo'),
  ], { multi: true }),
  campo('locomoção', 'Locomoção', 'sentidos', [
    real('Na natureza', 'anda', 'corre', 'salta', 'escala', 'cava', 'nada', 'voa', 'plana', 'rasteja'),
    fant('Sobrenatural', 'levita', 'atravessa paredes', 'teleporta', 'anda nas sombras'),
  ], { multi: true }),
  campo('ataques', 'Ataques', 'sentidos', [
    real('Na natureza', 'mordida', 'garras', 'coice', 'chifrada', 'constrição', 'ferrão', 'veneno', 'cuspe ácido', 'choque elétrico', 'teia', 'jato de água'),
    fant('Sobrenaturais', 'sopro de fogo', 'sopro de gelo', 'olhar petrificante', 'canto hipnótico', 'drena vida', 'raios'),
  ], { multi: true }),
  campo('defesas', 'Defesas', 'sentidos', [
    real('Na natureza', 'camuflagem', 'mimetismo', 'couraça', 'solta a cauda', 'finge de morto', 'jato de tinta', 'cheiro repelente', 'cores de alerta', 'regeneração', 'vive em bando'),
    fant('Sobrenaturais', 'invisibilidade', 'ilusões', 'pele antimagia', 'imune ao fogo', 'reflete magia'),
  ], { multi: true }),
  campo('dons', 'Dons', 'sentidos', [
    real('Sem dons', 'nenhum'),
    fant('Magia', 'magia inata', 'muda de forma', 'controla um elemento', 'fala com animais', 'cura pelo toque', 'invoca tempestades', 'fala com os mortos', 'viaja em sonhos', 'dobra o tempo'),
  ], { multi: true }),
  campo('fraquezas', 'Fraquezas', 'sentidos', [
    real('Na natureza', 'frio intenso', 'calor intenso', 'seca', 'fogo', 'sal', 'luz forte', 'sons agudos', 'fome constante', 'reprodução lenta'),
    fant('Sobrenaturais', 'prata', 'ferro frio', 'luz do sol', 'água corrente', 'solo sagrado', 'nome verdadeiro'),
  ], { multi: true }),

  // ------------------------------------------------------------------ mente e sociedade
  campo('inteligência', 'Inteligência', 'mente', [
    real('Nível', 'animal', 'astuta', 'sapiente'),
    fant('Estranha', 'mente coletiva', 'ancestral'),
  ]),
  campo('sociedade', 'Vive em', 'mente', [
    real('Grupo', 'solidão', 'casais', 'bandos', 'clãs', 'tribos', 'colmeia', 'cidades', 'nação', 'nômade'),
  ]),
  campo('hierarquia', 'Quem manda', 'mente', [
    real('Poder', 'ninguém manda', 'o mais forte', 'as matriarcas', 'os patriarcas', 'os anciãos', 'castas de nascença', 'uma rainha', 'um conselho', 'sacerdotes', 'todos votam'),
  ]),
  campo('comunicação', 'Comunicação', 'mente', [
    real('Na natureza', 'fala', 'canto', 'gestos', 'cheiros', 'cores', 'luzes', 'vibrações', 'danças', 'escrita'),
    fant('Sobrenatural', 'telepatia', 'sonhos partilhados'),
  ], { multi: true }),
  campo('temperamento', 'Temperamento', 'mente', [
    real('Índole', 'pacífico', 'curioso', 'desconfiado', 'territorial', 'agressivo', 'brincalhão', 'solene', 'covarde', 'orgulhoso', 'melancólico'),
  ]),
  campo('tecnologia', 'Tecnologia', 'mente', [
    real('Nível', 'nenhuma', 'ferramentas simples', 'pedra', 'bronze', 'ferro', 'pólvora', 'industrial', 'avançada'),
    fant('Outras vias', 'biotecnologia viva', 'arcana'),
  ]),
  campo('crença', 'Crença', 'mente', [
    real('Fé', 'nenhuma', 'animismo', 'ancestrais', 'politeísmo', 'monoteísmo', 'filosofia', 'culto à natureza'),
  ]),
  campo('relação com os outros', 'Com outros povos', 'mente', [
    real('Postura', 'isolados', 'pacíficos', 'comerciantes', 'conquistadores', 'saqueadores', 'protetores', 'parasitas', 'servos'),
  ]),

  // ------------------------------------------------------------------ ambiente
  { key: 'habitat', label: 'Habitat', group: 'ambiente', hint: '[[Lugar]] ou bioma: floresta, deserto...' },
  campo('clima', 'Clima', 'ambiente', [real('Temperatura', 'gelado', 'frio', 'temperado', 'quente', 'tórrido', 'qualquer')]),
  campo('atividade', 'Ativo de', 'ambiente', [real('Horário', 'dia', 'noite', 'crepúsculo', 'qualquer hora')]),
  campo('deslocamento', 'Fixação', 'ambiente', [real('Território', 'sedentário', 'territorial', 'migratório', 'nômade')]),
  campo('adaptações', 'Adaptações', 'ambiente', [
    real('Na natureza', 'reserva de gordura', 'reserva de água', 'suporta o frio', 'suporta o calor', 'suporta a pressão', 'suporta altitude', 'tolera sal', 'anfíbio', 'vive sem luz'),
    fant('Extremas', 'vive na lava', 'vive no vácuo', 'vive entre planos', 'imune a venenos'),
  ], { multi: true }),
  campo('papel ecológico', 'Papel na natureza', 'ambiente', [
    real('Nicho', 'predador de topo', 'predador médio', 'presa', 'grande pastador', 'polinizador', 'dispersor de sementes', 'decompositor', 'engenheiro do ambiente', 'parasita', 'simbionte'),
  ]),
  campo('frequência', 'Quantos há', 'ambiente', [real('População', 'lendário', 'raríssimo', 'raro', 'incomum', 'comum', 'abundante', 'praga')]),
  campo('origem', 'Origem', 'ambiente', [
    real('Natural', 'evolução natural', 'domesticação'),
    fant('Inventada', 'criação divina', 'experimento mágico', 'experimento científico', 'veio de outro mundo', 'maldição', 'filhos de um deus', 'despertou sozinho'),
  ]),
];

/** Paleta pronta do construtor (as palavras que o desenho reconhece). */
export const SPECIES_COLORS: Record<string, string> = {
  branco: '#ece8df', creme: '#efe1bf', marfim: '#e6dcc0', areia: '#d6bd8c', ocre: '#c08a3e', dourado: '#d4a53c', amarelo: '#e2c044', mostarda: '#b8952b',
  laranja: '#d9772b', coral: '#e0705a', vermelho: '#b23a3a', carmesim: '#8f1f33', vinho: '#5e1f2d', rosa: '#d77fa1', magenta: '#b83a8e',
  lilás: '#a98ad0', violeta: '#7e57c2', roxo: '#6e4c9a', índigo: '#3f3f8f', azul: '#3f6fb0', celeste: '#7fb6dc', ciano: '#46b4c4', turquesa: '#3aa6a0',
  jade: '#3f8f6f', esmeralda: '#2f8a57', verde: '#4f8a4b', oliva: '#747a34', musgo: '#5d6b3a', marrom: '#7a5236', castanho: '#5f3f2a', ferrugem: '#a4502a',
  terracota: '#b5623f', bronze: '#a8713a', cobre: '#b86f45', prateado: '#b8c0c8', cinza: '#8a8c92', chumbo: '#55585f', grafite: '#3a3b40', preto: '#2b2a2e',
};

// ------------------------------------------------------------------ planos do corpo

export type SpeciesPlan =
  | 'bipede' | 'quadrupede' | 'teropode' | 'saltador' | 'primata' | 'quelonio' | 'alado'
  | 'serpentino' | 'miriapode' | 'verme' | 'molusco' | 'hexapode' | 'octopode' | 'crustaceo'
  | 'aquatico' | 'cetaceo' | 'cefalopode' | 'radial'
  | 'centauroide' | 'naga' | 'sereiano' | 'aracnoide' | 'dragao' | 'arboreo' | 'fungoide' | 'colosso'
  | 'amorfo' | 'espectral' | 'orbe' | 'elemental' | 'enxame';

export interface SpeciesPlanInfo {
  id: SpeciesPlan;
  /** como aparece em "X são ..." */
  plural: string;
  /** o tamanho digitado é o comprimento, e a altura visível é esta fração dele */
  comprido?: number;
  /** cabeça que o plano usa quando a ficha não diz */
  cabeca?: string;
  /** cauda que o plano usa quando a ficha não diz */
  cauda?: string;
  /** pode ter asas, cauda, cabeça articulada? */
  semCabeca?: boolean;
  /** altura padrão, em metros */
  altura: number;
}

export const SPECIES_PLANS: Record<SpeciesPlan, SpeciesPlanInfo> = {
  bipede: { id: 'bipede', plural: 'bípedes', cabeca: 'humana', altura: 1.7 },
  quadrupede: { id: 'quadrupede', plural: 'quadrúpedes', cabeca: 'canina', cauda: 'chicote', altura: 1.8 },
  teropode: { id: 'teropode', plural: 'terópodes', cabeca: 'reptiliana', cauda: 'de lagarto', altura: 3 },
  saltador: { id: 'saltador', plural: 'saltadores', cabeca: 'canina', cauda: 'de lagarto', altura: 1.5 },
  primata: { id: 'primata', plural: 'primatas', cabeca: 'humana', altura: 1.5 },
  quelonio: { id: 'quelonio', plural: 'quelônios', comprido: 0.5, cabeca: 'reptiliana', cauda: 'curta', altura: 1 },
  alado: { id: 'alado', plural: 'alados', cabeca: 'bico', cauda: 'leque de penas', altura: 1 },
  serpentino: { id: 'serpentino', plural: 'serpentinos', comprido: 0.3, cabeca: 'reptiliana', altura: 3 },
  miriapode: { id: 'miriapode', plural: 'miriápodes', comprido: 0.3, cabeca: 'insetoide', altura: 1 },
  verme: { id: 'verme', plural: 'vermes', comprido: 0.55, semCabeca: true, altura: 3 },
  molusco: { id: 'molusco', plural: 'moluscos', comprido: 0.6, semCabeca: true, altura: 0.5 },
  hexapode: { id: 'hexapode', plural: 'hexápodes', comprido: 0.5, cabeca: 'insetoide', altura: 0.6 },
  octopode: { id: 'octopode', plural: 'octópodes', comprido: 0.6, semCabeca: true, altura: 0.8 },
  crustaceo: { id: 'crustaceo', plural: 'crustáceos', comprido: 0.55, semCabeca: true, altura: 0.6 },
  aquatico: { id: 'aquatico', plural: 'aquáticos', comprido: 0.42, semCabeca: true, cauda: 'de peixe', altura: 1.6 },
  cetaceo: { id: 'cetaceo', plural: 'cetáceos', comprido: 0.3, semCabeca: true, altura: 8 },
  cefalopode: { id: 'cefalopode', plural: 'cefalópodes', semCabeca: true, altura: 2 },
  radial: { id: 'radial', plural: 'seres radiais', semCabeca: true, altura: 1 },
  centauroide: { id: 'centauroide', plural: 'centauroides', cabeca: 'humana', cauda: 'felpuda', altura: 2.2 },
  naga: { id: 'naga', plural: 'nagas', cabeca: 'humana', altura: 2 },
  sereiano: { id: 'sereiano', plural: 'sereianos', comprido: 0.8, cabeca: 'humana', altura: 2 },
  aracnoide: { id: 'aracnoide', plural: 'aracnoides', cabeca: 'humana', altura: 2.2 },
  dragao: { id: 'dragao', plural: 'dragões', cabeca: 'dracônica', cauda: 'de lagarto', altura: 6 },
  arboreo: { id: 'arboreo', plural: 'seres arbóreos', semCabeca: true, altura: 5 },
  fungoide: { id: 'fungoide', plural: 'fungoides', semCabeca: true, altura: 1 },
  colosso: { id: 'colosso', plural: 'colossos', semCabeca: true, altura: 4 },
  amorfo: { id: 'amorfo', plural: 'seres amorfos', semCabeca: true, altura: 1 },
  espectral: { id: 'espectral', plural: 'espectros', semCabeca: true, altura: 1.8 },
  orbe: { id: 'orbe', plural: 'orbes vivos', semCabeca: true, altura: 1 },
  elemental: { id: 'elemental', plural: 'elementais', semCabeca: true, altura: 2.5 },
  enxame: { id: 'enxame', plural: 'enxames', semCabeca: true, altura: 2 },
};

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Plano do corpo a partir do texto da ficha; o que não for reconhecido vira bípede. */
export function speciesPlan(corpo: string): SpeciesPlan {
  const c = fold(corpo);
  if (!c) return 'bipede';
  const ids = Object.keys(SPECIES_PLANS) as SpeciesPlan[];
  return ids.find((p) => c === p) ?? ids.find((p) => c.startsWith(p.slice(0, 5))) ?? 'bipede';
}

/** Marcos de tamanho para escolher a altura com um clique. */
export const SPECIES_SIZES: Array<{ label: string; altura: string }> = [
  { label: 'inseto', altura: '0,03' }, { label: 'rato', altura: '0,1' }, { label: 'gato', altura: '0,3' }, { label: 'criança', altura: '1,1' },
  { label: 'humano', altura: '1,75' }, { label: 'urso', altura: '2,5' }, { label: 'elefante', altura: '4' }, { label: 'girafa', altura: '6' },
  { label: 'baleia', altura: '25' }, { label: 'titã', altura: '60' },
];
