import type { Rng } from '../../rpg/dice';
import { SPECIES_FIELDS, SPECIES_PLANS, speciesPlan, type SpeciesPlan } from './catalogo';
import { fold } from './figura';

const pick = <T>(rng: Rng, l: readonly T[]): T => l[Math.floor(rng() * l.length)]!;

export interface SpeciesSeed {
  sapiente?: boolean;
  /** bioma onde vive (id de clima.ts: deserto, taiga, selva...) */
  bioma?: string;
  /** só o que existe na natureza */
  realista?: boolean;
}

/** Corpos que têm tronco com braços. */
const TRONCO = /bipede|centauroide|naga|sereiano|aracnoide|colosso|primata/;
/** Corpos que têm rosto de verdade para pôr orelha, chifre e dentes. */
const ROSTO = /bipede|quadrupede|teropode|saltador|primata|quelonio|alado|serpentino|centauroide|naga|sereiano|aracnoide|dragao|colosso/;

/** Peso provável pelo tamanho e pelo corpo (lei do cubo), em kg. */
export function speciesWeightGuess(plano: SpeciesPlan, medida: number, porte = 1): number {
  const densidade: Partial<Record<SpeciesPlan, number>> = {
    bipede: 13, primata: 20, quadrupede: 60, teropode: 45, saltador: 18, quelonio: 120, alado: 7, serpentino: .8, miriapode: .6, verme: 2, molusco: 40,
    hexapode: 18, octopode: 12, crustaceo: 30, aquatico: 28, cetaceo: 10, cefalopode: 30, radial: 6, centauroide: 40, naga: 16, sereiano: 22, aracnoide: 22,
    dragao: 35, arboreo: 40, fungoide: 12, colosso: 120, amorfo: 90, espectral: .01, orbe: 8, elemental: .5, enxame: .3,
  };
  const kg = Math.pow(medida, 3) * (densidade[plano] ?? 15) * porte * porte;
  if (kg < 1) return Math.max(0.01, Math.round(kg * 100) / 100);
  const mag = Math.pow(10, Math.floor(Math.log10(kg)) - 1);
  return Math.round(Math.round(kg / mag) * mag);
}

function bodyPool(sea: boolean, sap: boolean, realista: boolean): string[] {
  if (sea) return realista ? ['aquático', 'aquático', 'cetáceo', 'cefalópode', 'radial', 'crustáceo'] : ['aquático', 'aquático', 'cetáceo', 'cefalópode', 'radial', 'crustáceo', 'sereiano', 'sereiano'];
  if (sap) return realista ? ['bípede', 'bípede', 'bípede', 'primata', 'quadrúpede', 'alado'] : ['bípede', 'bípede', 'bípede', 'bípede', 'centauroide', 'naga', 'alado', 'quadrúpede', 'aracnoide', 'fungoide', 'arbóreo'];
  const animais = ['quadrúpede', 'quadrúpede', 'quadrúpede', 'terópode', 'saltador', 'hexápode', 'octópode', 'serpentino', 'alado', 'alado', 'miriápode', 'quelônio', 'verme', 'molusco', 'primata'];
  return realista ? animais : [...animais, 'dragão', 'amorfo', 'colosso', 'espectral', 'orbe', 'elemental', 'enxame'];
}

function coatFor(plano: SpeciesPlan, rng: Rng, cold: boolean, hot: boolean, sea: boolean, realista: boolean): string {
  if (plano === 'elemental') return pick(rng, ['chamas', 'lava', 'gelo', 'névoa', 'luz']);
  if (plano === 'espectral') return pick(rng, ['névoa', 'sombra', 'luz']);
  if (plano === 'colosso') return pick(rng, ['pedra', 'metal', 'cristal', 'gelo']);
  if (plano === 'amorfo') return 'gosma';
  if (plano === 'arboreo') return pick(rng, ['casca vegetal', 'musgo']);
  if (plano === 'fungoide') return 'pele nua';
  if (plano === 'orbe') return pick(rng, ['cristal', 'metal', 'luz', 'pele nua']);
  if (/hexapode|octopode|crustaceo|miriapode|enxame/.test(plano)) return 'quitina';
  if (/verme|molusco|cefalopode|radial/.test(plano)) return plano === 'verme' ? 'pele nua' : 'gosma';
  if (plano === 'cetaceo') return 'pele nua';
  if (plano === 'quelonio') return 'casca';
  if (/serpentino|dragao|naga|teropode/.test(plano)) return pick(rng, ['escamas', 'escamas', 'placas ósseas']);
  if (cold) return pick(rng, ['pelos', 'penas', 'pelos', 'lã']);
  if (hot) return pick(rng, ['escamas', 'couro grosso', 'pele nua', 'quitina']);
  if (sea) return pick(rng, ['escamas', 'pele nua', 'gosma']);
  if (plano === 'alado') return pick(rng, ['penas', 'penas', 'couro grosso', 'pelos']);
  return pick(rng, realista ? ['pele nua', 'pelos', 'escamas', 'penas', 'couro grosso'] : ['pele nua', 'pelos', 'escamas', 'penas', 'couro grosso', 'cristal', 'pedra', 'casca vegetal']);
}

function headFor(plano: SpeciesPlan, rev: string, sap: boolean, rng: Rng, realista: boolean): string {
  if (SPECIES_PLANS[plano].semCabeca) return 'sem rosto';
  if (plano === 'hexapode' || plano === 'miriapode') return 'insetoide';
  if (plano === 'dragao') return 'dracônica';
  if (/serpentino|teropode|quelonio/.test(plano)) return 'reptiliana';
  if (/pena/.test(rev)) return 'bico';
  if (/escama|placa/.test(rev)) return realista ? 'reptiliana' : pick(rng, ['reptiliana', 'reptiliana', 'dracônica']);
  if (sap && /bipede|centauroide|naga|sereiano|aracnoide/.test(plano)) return pick(rng, ['humana', 'humana', 'humana', 'felina', 'canina', 'bovina']);
  return pick(rng, ['canina', 'felina', 'equina', 'bovina', 'canina', 'felina']);
}

/**
 * Sorteia o que falta de uma espécie, coerente com o que já existe:
 * o bioma puxa o clima, o revestimento e a atividade; o tamanho puxa o
 * peso, a vida longa puxa a maioridade tardia e a ninhada pequena.
 */
export function rollSpecies(rng: Rng, have: Record<string, string> = {}, seed: SpeciesSeed = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const cur = (k: string) => out[k] ?? have[k] ?? '';
  const set = (k: string, v: string) => {
    if (!cur(k)) out[k] = v;
  };
  const bio = fold(seed.bioma ?? have['habitat'] ?? '');
  const cold = /gelo|tundra|taiga|neve|artic|polar|gelad/.test(bio);
  const hot = /desert|ermo|savana|vulcan/.test(bio);
  const wet = /selva|pantano|mangue|floresta/.test(bio);
  const sea = /\bmar\b|oceano|recife|lago|\brio\b/.test(bio);
  const realista = !!seed.realista;
  const sap = seed.sapiente ?? /sapiente|coletiva|ancestral/.test(fold(have['inteligência'] ?? have['inteligencia'] ?? ''));
  /** só traz opções fantásticas quando o mundo permite, e raramente */
  const fantasia = (chance: number) => !realista && rng() < chance;

  set('corpo', pick(rng, bodyPool(sea, sap, realista)));
  const plano = speciesPlan(cur('corpo'));
  const info = SPECIES_PLANS[plano];
  set('revestimento', coatFor(plano, rng, cold, hot, sea, realista));
  const rev = fold(cur('revestimento'));
  set('porte', pick(rng, ['esguio', 'ágil', 'médio', 'médio', 'robusto', 'massivo']));
  const fator = ({ esguio: .8, agil: .9, medio: 1, robusto: 1.2, massivo: 1.42 } as Record<string, number>)[fold(cur('porte'))] ?? 1;

  const size = sap ? 1.1 + rng() * 1.2 : info.altura * Math.exp((rng() - 0.5) * 2.4);
  set('altura', (Math.round(size * 100) / 100).toLocaleString('pt-BR'));
  const h = Number(cur('altura').replace(',', '.')) || size;
  set('peso', String(speciesWeightGuess(plano, h, fator)));

  const cores = cold ? ['branco', 'cinza', 'prateado', 'celeste'] : hot ? ['ocre', 'dourado', 'marrom', 'areia', 'terracota'] : wet ? ['verde', 'marrom', 'musgo', 'esmeralda', 'jade'] : sea ? ['azul', 'prateado', 'turquesa', 'ciano'] : ['marrom', 'cinza', 'vermelho', 'preto', 'dourado', 'roxo', 'castanho', 'ferrugem', 'índigo', 'oliva'];
  set('cor', `${pick(rng, cores)}, ${pick(rng, ['preto', 'branco', 'dourado', 'vermelho', 'azul', 'laranja', 'ferrugem', 'violeta'])} e ${pick(rng, ['creme', 'marfim', 'areia', 'branco'])}`);
  set('padrão', pick(rng, ['liso', 'liso', 'listras', 'manchas', 'pintas', 'ventre claro', 'máscara', 'sela', 'anéis', ...(fantasia(.3) ? ['runas', 'veios brilhantes', 'constelações'] : [])]));

  // anatomia: cada corpo só ganha o que faz sentido nele
  const rosto = ROSTO.test(plano);
  set('cabeça', headFor(plano, rev, sap, rng, realista));
  const cabeca = fold(cur('cabeça'));
  set('cabeças', fantasia(.06) && /quadrupede|dragao|serpentino|naga/.test(plano) ? pick(rng, ['duas', 'três', 'cinco']) : 'uma');
  set('olhos', plano === 'octopode' ? 'oito' : fantasia(.15) ? pick(rng, ['um', 'três', 'quatro', 'seis', 'muitos']) : 'dois');
  set('pupila', cabeca === 'insetoide' ? 'composta' : /noite/.test(fold(cur('atividade'))) || /escama/.test(rev) ? 'vertical' : pick(rng, ['redonda', 'redonda', 'vertical', 'horizontal', ...(fantasia(.3) ? ['brilhante', 'sem pupila'] : [])]));
  set('orelhas', !rosto || /pena|escama|quitina/.test(rev) ? 'sem orelhas' : cabeca === 'humana' ? pick(rng, ['humanas', 'humanas', ...(realista ? [] : ['pontudas', 'longas'])]) : cabeca === 'felina' ? 'felinas' : pick(rng, ['caninas', 'caídas', 'de morcego', 'de coelho']));
  set('chifres', !rosto || rng() < .55 ? 'sem chifres' : pick(rng, ['de touro', 'de carneiro', 'galhada', 'de antílope', ...(fantasia(.5) ? ['unicórnio', 'demoníacos', 'coroa de chifres', 'de cristal'] : [])]));
  set('dentição', !rosto ? 'sem dentes' : /pena/.test(rev) ? 'sem dentes' : pick(rng, ['dentes comuns', 'presas', 'serrilhada', 'dentes-de-sabre']));
  set('braços', !TRONCO.test(plano) ? 'nenhum' : fantasia(.14) ? pick(rng, ['quatro', 'seis']) : 'dois');
  set('extremidades', /aquatico|cetaceo/.test(plano) ? 'nadadeiras' : plano === 'crustaceo' ? 'pinças' : cabeca === 'equina' || cabeca === 'bovina' ? 'cascos' : sap ? 'mãos' : pick(rng, ['patas', 'garras', 'garras']));
  set('asas', plano === 'alado' ? (/pena/.test(rev) ? 'de penas' : 'de membrana') : plano === 'dragao' ? 'de membrana' : plano === 'hexapode' && rng() < .5 ? 'de inseto' : fantasia(.1) && rosto ? pick(rng, ['de penas', 'de membrana', 'de energia', 'de sombra']) : 'sem asas');
  set('cauda', info.cauda ?? (/bipede|colosso/.test(plano) ? (rng() < .75 ? 'sem cauda' : pick(rng, ['chicote', 'de lagarto', 'felpuda'])) : 'sem cauda'));

  const tr = new Set<string>();
  const n = 1 + Math.floor(rng() * 3);
  const pool = [...(sea ? ['guelras', 'barbatana dorsal', 'brilho'] : []), ...(cold ? ['juba', 'barba'] : []), ...(hot ? ['espinhos', 'vela dorsal', 'corcova'] : []), ...(rosto ? ['crista', 'bigodes', 'espinhos', 'placas dorsais', 'dois corações', 'ossos ocos'] : ['brilho', 'tentáculos']), ...(fantasia(.5) ? ['halo', 'cristais nas costas', 'terceiro olho', 'flores no corpo', 'aura'] : [])];
  for (let i = 0; i < n * 3 && tr.size < n; i++) tr.add(pick(rng, pool));
  if (cabeca === 'humana' && !/pena|escama|quitina/.test(rev)) tr.add(pick(rng, ['cabelo curto', 'cabelo longo']));
  set('traços físicos', [...tr].join(', '));

  // ciclo de vida
  set('dieta', plano === 'arboreo' ? 'fotossintético' : plano === 'fungoide' ? 'detritívoro' : sap ? pick(rng, ['onívoro', 'onívoro', 'herbívoro', 'carnívoro']) : h > 2.5 ? pick(rng, ['herbívoro', 'carnívoro', 'filtrador']) : pick(rng, ['herbívoro', 'carnívoro', 'onívoro', 'necrófago', 'insetívoro', 'frugívoro', 'filtrador', ...(fantasia(.3) ? ['de magia', 'de emoções', 'de sonhos'] : [])]));
  const dieta = fold(cur('dieta'));
  set('alimentação', /herb|frug/.test(dieta) ? pick(rng, ['pastoreio', 'coleta']) : /carn|pisc|inset/.test(dieta) ? pick(rng, ['emboscada', 'perseguição', 'caça em grupo', 'armadilhas']) : /filtr/.test(dieta) ? 'filtragem' : sap ? 'cultivo' : 'coleta');
  set('metabolismo', cold ? pick(rng, ['sangue quente', 'hiberna']) : /escama|quitina/.test(rev) ? 'sangue frio' : 'sangue quente');
  set('reprodução', /fungoide/.test(plano) ? 'esporos' : plano === 'arboreo' ? 'sementes' : /escama|pena|quitina/.test(rev) ? 'ovíparo' : pick(rng, ['vivíparo', 'vivíparo', 'ovíparo', 'marsupial', 'brotamento']));
  set('crescimento', /quitina/.test(rev) ? pick(rng, ['metamorfose', 'larva e pupa', 'mudas de pele']) : /escama/.test(rev) ? pick(rng, ['mudas de pele', 'cresce a vida toda']) : 'direto');
  set('sexos', pick(rng, ['dois', 'dois', 'dois', 'um só', 'hermafrodita', 'muda com a idade', 'três ou mais']));
  set('cuidado', /quitina/.test(rev) ? pick(rng, ['ninguém', 'ninhos coletivos']) : sap ? pick(rng, ['o casal', 'o grupo todo', 'a mãe']) : pick(rng, ['a mãe', 'o casal', 'ninguém', 'o grupo todo']));
  // vida: bicho grande e mente grande vivem mais
  const life = Math.round((sap ? 60 + rng() * 240 : 4 + h * 12 + rng() * 30) / 5) * 5;
  set('expectativa de vida', String(life));
  const L = Number(cur('expectativa de vida').replace(/\D/g, '')) || life;
  set('maioridade', String(Math.max(1, Math.round(L * (0.14 + rng() * 0.08)))));
  set('gestação', String(Math.max(1, Math.round((Math.min(h, 6) * 4 + rng() * 4) * (fold(cur('reprodução')) === 'oviparo' ? 0.5 : 1)))));
  set('ninhada', L > 120 ? '1' : h < 0.5 ? `${2 + Math.floor(rng() * 6)}-${8 + Math.floor(rng() * 10)}` : pick(rng, ['1', '1-2', '2-4']));
  set('fim da vida', fantasia(.25) ? pick(rng, ['viram pedra', 'viram árvore', 'desfazem-se em luz', 'renascem']) : 'velhice');

  // sentidos e dons
  const sens = new Set<string>();
  if (/noite/.test(fold(cur('atividade'))) || hot) sens.add('visão no escuro');
  sens.add(pick(rng, ['faro aguçado', 'audição fina', 'sente tremores', 'sente calor', 'ecolocalização', 'visão ultravioleta', 'sente o magnetismo', ...(fantasia(.4) ? ['sente magia', 'sente emoções', 'vê espíritos'] : [])]));
  set('sentidos', [...sens].join(', '));
  const moves = sea ? ['nada'] : /alado|dragao/.test(plano) ? ['voa', 'anda'] : /serpentino|verme|molusco|miriapode|naga/.test(plano) ? ['rasteja'] : plano === 'saltador' ? ['salta', 'corre'] : plano === 'espectral' || plano === 'orbe' ? ['levita'] : ['anda', pick(rng, ['corre', 'escala', 'nada', 'cava'])];
  set('locomoção', moves.join(', '));
  set('ataques', pick(rng, /quitina/.test(rev) ? ['mordida', 'ferrão', 'veneno', 'teia'] : ['mordida', 'garras', 'coice', 'chifrada', 'constrição', ...(fantasia(.3) ? ['sopro de fogo', 'canto hipnótico', 'drena vida'] : [])]));
  set('defesas', pick(rng, ['camuflagem', 'couraça', 'vive em bando', 'cheiro repelente', 'cores de alerta', 'finge de morto', 'regeneração', ...(fantasia(.3) ? ['ilusões', 'invisibilidade'] : [])]));
  set('dons', fantasia(.35) ? pick(rng, ['magia inata', 'muda de forma', 'controla um elemento', 'fala com animais', 'cura pelo toque', 'viaja em sonhos']) : 'nenhum');
  set('fraquezas', cold ? 'calor intenso' : hot ? 'frio intenso' : pick(rng, ['fogo', 'luz forte', 'sons agudos', 'seca', 'reprodução lenta', ...(fantasia(.4) ? ['prata', 'ferro frio', 'luz do sol'] : [])]));

  // mente e sociedade
  set('inteligência', sap ? (realista ? 'sapiente' : pick(rng, ['sapiente', 'sapiente', 'mente coletiva', 'ancestral'])) : pick(rng, ['animal', 'animal', 'astuta']));
  set('sociedade', sap ? pick(rng, ['clãs', 'tribos', 'cidades', 'nação', 'nômade', 'colmeia']) : pick(rng, ['solidão', 'casais', 'bandos', 'bandos', 'colmeia']));
  set('hierarquia', sap ? pick(rng, ['as matriarcas', 'os patriarcas', 'os anciãos', 'castas de nascença', 'um conselho', 'sacerdotes', 'todos votam']) : pick(rng, ['ninguém manda', 'o mais forte', 'uma rainha']));
  set('comunicação', sap ? pick(rng, ['fala', 'fala, gestos', 'canto', 'fala, escrita', 'cores, luzes', 'vibrações', 'danças']) : pick(rng, ['cheiros', 'canto', 'gestos', 'cores']));
  set('temperamento', pick(rng, ['pacífico', 'curioso', 'desconfiado', 'territorial', 'agressivo', 'brincalhão', 'solene', 'covarde', 'orgulhoso']));
  set('tecnologia', sap ? pick(rng, ['ferramentas simples', 'pedra', 'bronze', 'ferro', 'pólvora', ...(fantasia(.5) ? ['arcana', 'biotecnologia viva'] : [])]) : 'nenhuma');
  set('crença', sap ? pick(rng, ['animismo', 'ancestrais', 'politeísmo', 'monoteísmo', 'filosofia', 'culto à natureza']) : 'nenhuma');
  set('relação com os outros', sap ? pick(rng, ['isolados', 'pacíficos', 'comerciantes', 'conquistadores', 'saqueadores', 'protetores']) : 'isolados');

  // ambiente
  set('clima', cold ? 'frio' : hot ? 'quente' : pick(rng, ['temperado', 'quente', 'frio', 'qualquer']));
  set('atividade', hot ? pick(rng, ['noite', 'crepúsculo']) : pick(rng, ['dia', 'dia', 'noite', 'crepúsculo']));
  set('deslocamento', pick(rng, ['sedentário', 'territorial', 'migratório', 'nômade']));
  set('adaptações', cold ? 'suporta o frio, reserva de gordura' : hot ? 'suporta o calor, reserva de água' : sea ? 'suporta a pressão, tolera sal' : pick(rng, ['suporta altitude', 'anfíbio', 'vive sem luz', 'reserva de gordura']));
  set('papel ecológico', /carn|pisc/.test(dieta) ? (h > 2 ? 'predador de topo' : 'predador médio') : /herb/.test(dieta) ? (h > 2 ? 'grande pastador' : 'presa') : /necro|detrit/.test(dieta) ? 'decompositor' : pick(rng, ['dispersor de sementes', 'polinizador', 'engenheiro do ambiente', 'presa']));
  set('frequência', sap ? pick(rng, ['comum', 'incomum', 'raro']) : pick(rng, ['comum', 'abundante', 'incomum', 'raro', 'raríssimo']));
  set('origem', fantasia(.45) ? pick(rng, ['criação divina', 'experimento mágico', 'veio de outro mundo', 'maldição', 'filhos de um deus']) : 'evolução natural');
  return out;
}

/** Campos do desenho: o que um molde troca por inteiro. */
export const SPECIES_LOOK_KEYS = SPECIES_FIELDS.filter((f) => f.group === 'corpo' || f.group === 'anatomia').map((f) => f.key);
