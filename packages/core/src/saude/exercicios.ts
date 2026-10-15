/*
 * Biblioteca de exercícios do planner de treino.
 *
 * Cada exercício diz o padrão de movimento (para montar o treino por "vagas"),
 * os músculos (para contar o volume da semana), o equipamento necessário, o
 * nível mínimo e as articulações que ele costuma incomodar. Dentro de cada
 * padrão, a ordem é a preferência: o planner tenta o primeiro que couber.
 */

export type Pattern =
  | 'agachar' | 'dobrar' | 'avanco' | 'flexora' | 'gluteo' | 'panturrilha'
  | 'empurrar-h' | 'empurrar-v' | 'peito-iso' | 'puxar-h' | 'puxar-v'
  | 'ombro-lateral' | 'ombro-posterior' | 'biceps' | 'triceps' | 'core' | 'cardio';

export type Muscle = 'peito' | 'costas' | 'ombros' | 'bíceps' | 'tríceps' | 'quadríceps' | 'posteriores' | 'glúteos' | 'panturrilhas' | 'core';

export const MUSCLES: Muscle[] = ['peito', 'costas', 'ombros', 'bíceps', 'tríceps', 'quadríceps', 'posteriores', 'glúteos', 'panturrilhas', 'core'];

/** Equipamento que um exercício exige (todos os da lista). */
export type Gear = 'corpo' | 'halteres' | 'barra' | 'maquina' | 'polia' | 'elastico' | 'barra-fixa' | 'banco';

/** O que a pessoa marca no perfil, e o que cada opção libera. */
export type GearChoice = 'academia' | 'halteres' | 'elastico' | 'barra-fixa';
export const GEAR_CHOICES: Array<{ id: GearChoice; label: string; gives: Gear[] }> = [
  { id: 'academia', label: 'Academia completa', gives: ['halteres', 'barra', 'maquina', 'polia', 'barra-fixa', 'banco'] },
  { id: 'halteres', label: 'Halteres (e banco)', gives: ['halteres', 'banco'] },
  { id: 'elastico', label: 'Elásticos', gives: ['elastico'] },
  { id: 'barra-fixa', label: 'Barra fixa', gives: ['barra-fixa'] },
];

export type Limit = 'joelho' | 'lombar' | 'ombro' | 'punho';
export const LIMITS: Array<{ id: Limit; label: string }> = [
  { id: 'joelho', label: 'Joelho' },
  { id: 'lombar', label: 'Lombar' },
  { id: 'ombro', label: 'Ombro' },
  { id: 'punho', label: 'Punho' },
];

/** Como o exercício progride: carga (com o passo em kg), repetições, tempo ou minutos. */
export type Load = 'barra' | 'halter' | 'maquina' | 'polia' | 'corpo' | 'elastico' | 'tempo' | 'minutos';

export const LOAD_STEP: Partial<Record<Load, number>> = { barra: 2.5, halter: 2, maquina: 5, polia: 2.5 };

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** principais primeiro; o primeiro conta 1 série, os outros meia */
  muscles: Muscle[];
  gear: Gear[];
  /** 1 iniciante, 2 intermediário, 3 avançado */
  level: 1 | 2 | 3;
  avoid?: Limit[];
  load: Load;
  /** versão mais difícil, para quando a atual ficar fácil (peso do corpo) */
  harder?: string;
  /** bom como apoio, fraco como exercício principal do dia */
  accessory?: boolean;
  /** faixa de repetições própria (movimentos muito duros, como as negativas) */
  reps?: [number, number];
  tip?: string;
}

const E = (id: string, name: string, pattern: Pattern, muscles: Muscle[], gear: Gear[], level: 1 | 2 | 3, load: Load, extra: Partial<Exercise> = {}): Exercise =>
  ({ id, name, pattern, muscles, gear, level, load, ...extra });

export const EXERCISES: Exercise[] = [
  // pernas: agachar
  E('agachamento-barra', 'Agachamento livre com barra', 'agachar', ['quadríceps', 'glúteos', 'core'], ['barra'], 2, 'barra', { avoid: ['joelho', 'lombar'], tip: 'Desça até a coxa ficar paralela ao chão, joelhos na direção dos pés.' }),
  E('leg-press', 'Leg press', 'agachar', ['quadríceps', 'glúteos'], ['maquina'], 1, 'maquina', { tip: 'Não tire a lombar do encosto no fim da descida.' }),
  E('agachamento-goblet', 'Agachamento goblet', 'agachar', ['quadríceps', 'glúteos', 'core'], ['halteres'], 1, 'halter', { tip: 'Halter junto ao peito, tronco alto.' }),
  E('agachamento-elastico', 'Agachamento com elástico', 'agachar', ['quadríceps', 'glúteos'], ['elastico'], 1, 'elastico'),
  E('agachamento-livre', 'Agachamento (peso do corpo)', 'agachar', ['quadríceps', 'glúteos'], ['corpo'], 1, 'corpo', { avoid: ['joelho'], harder: 'bulgaro-corpo' }),
  E('agachamento-caixa', 'Sentar e levantar da cadeira', 'agachar', ['quadríceps', 'glúteos'], ['corpo'], 1, 'corpo', { harder: 'agachamento-livre', tip: 'Amplitude controlada, boa para joelhos sensíveis.', accessory: true }),

  // pernas: dobrar o quadril
  E('terra-romeno-barra', 'Levantamento terra romeno com barra', 'dobrar', ['posteriores', 'glúteos', 'costas'], ['barra'], 2, 'barra', { avoid: ['lombar'], tip: 'Quadril para trás, barra rente às pernas, coluna neutra.' }),
  E('terra-romeno-halteres', 'Terra romeno com halteres', 'dobrar', ['posteriores', 'glúteos'], ['halteres'], 1, 'halter', { avoid: ['lombar'] }),
  E('elevacao-pelvica', 'Elevação pélvica com barra', 'dobrar', ['glúteos', 'posteriores'], ['barra', 'banco'], 1, 'barra'),
  E('terra-elastico', 'Levantamento terra com elástico', 'dobrar', ['posteriores', 'glúteos'], ['elastico'], 1, 'elastico', { avoid: ['lombar'] }),
  E('ponte-gluteo', 'Ponte de glúteo', 'dobrar', ['glúteos', 'posteriores'], ['corpo'], 1, 'corpo', { harder: 'ponte-unilateral', accessory: true }),
  E('ponte-unilateral', 'Ponte de glúteo unilateral', 'dobrar', ['glúteos', 'posteriores'], ['corpo'], 2, 'corpo', { accessory: true }),

  // pernas: unilateral
  E('afundo-halteres', 'Afundo para trás com halteres', 'avanco', ['quadríceps', 'glúteos'], ['halteres'], 1, 'halter'),
  E('bulgaro-halteres', 'Agachamento búlgaro com halteres', 'avanco', ['quadríceps', 'glúteos'], ['halteres', 'banco'], 2, 'halter', { avoid: ['joelho'] }),
  E('subida-banco', 'Subida no banco (step-up)', 'avanco', ['quadríceps', 'glúteos'], ['corpo'], 1, 'corpo', { harder: 'bulgaro-corpo', accessory: true }),
  E('afundo-corpo', 'Afundo para trás (peso do corpo)', 'avanco', ['quadríceps', 'glúteos'], ['corpo'], 1, 'corpo', { harder: 'bulgaro-corpo' }),
  E('bulgaro-corpo', 'Agachamento búlgaro (peso do corpo)', 'avanco', ['quadríceps', 'glúteos'], ['corpo'], 2, 'corpo', { avoid: ['joelho'] }),

  // posteriores e glúteos isolados
  E('mesa-flexora', 'Mesa flexora', 'flexora', ['posteriores'], ['maquina'], 1, 'maquina'),
  E('flexora-elastico', 'Flexão de joelho com elástico', 'flexora', ['posteriores'], ['elastico'], 1, 'elastico'),
  E('nordica', 'Flexão nórdica (só a descida)', 'flexora', ['posteriores'], ['corpo'], 3, 'corpo', { avoid: ['joelho'], reps: [3, 6] }),
  E('abducao-maquina', 'Abdução na máquina', 'gluteo', ['glúteos'], ['maquina'], 1, 'maquina'),
  E('abducao-elastico', 'Abdução de quadril com elástico', 'gluteo', ['glúteos'], ['elastico'], 1, 'elastico'),
  E('ponte-gluteo-g', 'Ponte de glúteo com pausa', 'gluteo', ['glúteos'], ['corpo'], 1, 'corpo'),

  // panturrilha
  E('panturrilha-maquina', 'Panturrilha na máquina', 'panturrilha', ['panturrilhas'], ['maquina'], 1, 'maquina'),
  E('panturrilha-halter', 'Panturrilha unilateral com halter', 'panturrilha', ['panturrilhas'], ['halteres'], 1, 'halter'),
  E('panturrilha-pe', 'Elevação de panturrilha em pé', 'panturrilha', ['panturrilhas'], ['corpo'], 1, 'corpo'),

  // empurrar na horizontal
  E('supino-barra', 'Supino reto com barra', 'empurrar-h', ['peito', 'tríceps', 'ombros'], ['barra', 'banco'], 2, 'barra', { avoid: ['ombro'], tip: 'Escápulas juntas, barra desce na linha do mamilo.' }),
  E('supino-halteres', 'Supino reto com halteres', 'empurrar-h', ['peito', 'tríceps', 'ombros'], ['halteres', 'banco'], 1, 'halter'),
  E('supino-maquina', 'Supino na máquina', 'empurrar-h', ['peito', 'tríceps', 'ombros'], ['maquina'], 1, 'maquina'),
  E('supino-inclinado-halteres', 'Supino inclinado com halteres', 'empurrar-h', ['peito', 'ombros', 'tríceps'], ['halteres', 'banco'], 1, 'halter'),
  E('supino-chao', 'Supino no chão com halteres', 'empurrar-h', ['peito', 'tríceps'], ['halteres'], 1, 'halter', { tip: 'Amplitude menor, mais gentil com o ombro.' }),
  E('supino-elastico', 'Supino com elástico', 'empurrar-h', ['peito', 'tríceps'], ['elastico'], 1, 'elastico'),
  E('flexao-inclinada', 'Flexão inclinada (mãos num apoio alto)', 'empurrar-h', ['peito', 'tríceps'], ['corpo'], 1, 'corpo', { avoid: ['punho'], harder: 'flexao' }),
  E('flexao', 'Flexão de braço', 'empurrar-h', ['peito', 'tríceps', 'ombros'], ['corpo'], 1, 'corpo', { avoid: ['punho'], harder: 'flexao-declinada' }),
  E('flexao-declinada', 'Flexão declinada (pés no apoio)', 'empurrar-h', ['peito', 'ombros', 'tríceps'], ['corpo'], 2, 'corpo', { avoid: ['punho', 'ombro'] }),

  // isolado de peito
  E('crucifixo-polia', 'Crucifixo na polia', 'peito-iso', ['peito'], ['polia'], 1, 'polia'),
  E('crucifixo-halteres', 'Crucifixo com halteres', 'peito-iso', ['peito'], ['halteres', 'banco'], 1, 'halter', { avoid: ['ombro'] }),
  E('crucifixo-elastico', 'Crucifixo com elástico', 'peito-iso', ['peito'], ['elastico'], 1, 'elastico'),

  // empurrar na vertical
  E('desenvolvimento-halteres', 'Desenvolvimento com halteres', 'empurrar-v', ['ombros', 'tríceps'], ['halteres'], 1, 'halter', { avoid: ['ombro'] }),
  E('desenvolvimento-barra', 'Desenvolvimento em pé com barra', 'empurrar-v', ['ombros', 'tríceps', 'core'], ['barra'], 2, 'barra', { avoid: ['ombro', 'lombar'] }),
  E('desenvolvimento-maquina', 'Desenvolvimento na máquina', 'empurrar-v', ['ombros', 'tríceps'], ['maquina'], 1, 'maquina', { avoid: ['ombro'] }),
  E('desenvolvimento-elastico', 'Desenvolvimento com elástico', 'empurrar-v', ['ombros', 'tríceps'], ['elastico'], 1, 'elastico', { avoid: ['ombro'] }),
  E('flexao-pike', 'Flexão pike', 'empurrar-v', ['ombros', 'tríceps'], ['corpo'], 2, 'corpo', { avoid: ['ombro', 'punho'] }),

  // puxar na horizontal
  E('remada-halter', 'Remada unilateral com halter', 'puxar-h', ['costas', 'bíceps'], ['halteres'], 1, 'halter', { tip: 'Puxe o cotovelo em direção ao quadril.' }),
  E('remada-curvada', 'Remada curvada com barra', 'puxar-h', ['costas', 'bíceps'], ['barra'], 2, 'barra', { avoid: ['lombar'] }),
  E('remada-baixa', 'Remada baixa na polia', 'puxar-h', ['costas', 'bíceps'], ['polia'], 1, 'polia'),
  E('remada-elastico', 'Remada com elástico', 'puxar-h', ['costas', 'bíceps'], ['elastico'], 1, 'elastico'),
  E('remada-invertida', 'Remada invertida (sob uma mesa firme)', 'puxar-h', ['costas', 'bíceps'], ['corpo'], 1, 'corpo'),

  // puxar na vertical
  E('puxada-frente', 'Puxada na frente (polia alta)', 'puxar-v', ['costas', 'bíceps'], ['polia'], 1, 'polia'),
  E('barra-fixa', 'Barra fixa', 'puxar-v', ['costas', 'bíceps'], ['barra-fixa'], 2, 'corpo'),
  E('barra-fixa-negativa', 'Barra fixa negativa (só a descida, 3 s)', 'puxar-v', ['costas', 'bíceps'], ['barra-fixa'], 1, 'corpo', { harder: 'barra-fixa', reps: [3, 6] }),
  E('puxada-elastico', 'Puxada alta com elástico', 'puxar-v', ['costas', 'bíceps'], ['elastico'], 1, 'elastico'),
  E('pullover-halter', 'Pullover com halter', 'puxar-v', ['costas', 'peito'], ['halteres', 'banco'], 1, 'halter', { avoid: ['ombro'], accessory: true }),

  // ombros
  E('elevacao-lateral', 'Elevação lateral com halteres', 'ombro-lateral', ['ombros'], ['halteres'], 1, 'halter'),
  E('elevacao-lateral-polia', 'Elevação lateral na polia', 'ombro-lateral', ['ombros'], ['polia'], 1, 'polia'),
  E('elevacao-lateral-elastico', 'Elevação lateral com elástico', 'ombro-lateral', ['ombros'], ['elastico'], 1, 'elastico'),
  E('face-pull', 'Face pull na polia', 'ombro-posterior', ['ombros', 'costas'], ['polia'], 1, 'polia'),
  E('crucifixo-inverso', 'Crucifixo inverso com halteres', 'ombro-posterior', ['ombros', 'costas'], ['halteres'], 1, 'halter'),
  E('face-pull-elastico', 'Face pull com elástico', 'ombro-posterior', ['ombros', 'costas'], ['elastico'], 1, 'elastico'),
  E('y-t-chao', 'Y e T deitado de bruços', 'ombro-posterior', ['ombros', 'costas'], ['corpo'], 1, 'corpo'),

  // braços
  E('rosca-alternada', 'Rosca alternada com halteres', 'biceps', ['bíceps'], ['halteres'], 1, 'halter'),
  E('rosca-barra', 'Rosca direta com barra', 'biceps', ['bíceps'], ['barra'], 1, 'barra', { avoid: ['punho'] }),
  E('rosca-elastico', 'Rosca com elástico', 'biceps', ['bíceps'], ['elastico'], 1, 'elastico'),
  E('triceps-polia', 'Tríceps na polia', 'triceps', ['tríceps'], ['polia'], 1, 'polia'),
  E('triceps-frances', 'Tríceps francês com halter', 'triceps', ['tríceps'], ['halteres'], 1, 'halter', { avoid: ['ombro'] }),
  E('triceps-elastico', 'Tríceps com elástico', 'triceps', ['tríceps'], ['elastico'], 1, 'elastico'),
  E('flexao-diamante', 'Flexão fechada (tríceps)', 'triceps', ['tríceps', 'peito'], ['corpo'], 2, 'corpo', { avoid: ['punho'] }),
  E('mergulho-banco', 'Mergulho no banco', 'triceps', ['tríceps'], ['corpo'], 1, 'corpo', { avoid: ['ombro', 'punho'] }),

  // core
  E('prancha', 'Prancha', 'core', ['core'], ['corpo'], 1, 'tempo', { avoid: ['punho'] }),
  E('dead-bug', 'Dead bug', 'core', ['core'], ['corpo'], 1, 'corpo', { tip: 'Lombar colada no chão o tempo todo.' }),
  E('prancha-lateral', 'Prancha lateral', 'core', ['core'], ['corpo'], 1, 'tempo'),
  E('pallof', 'Pallof press', 'core', ['core'], ['polia'], 1, 'polia'),
  E('bird-dog', 'Perdigueiro (bird dog)', 'core', ['core', 'glúteos'], ['corpo'], 1, 'corpo'),
  E('elevacao-pernas', 'Elevação de pernas deitado', 'core', ['core'], ['corpo'], 2, 'corpo', { avoid: ['lombar'] }),

  // cardio
  E('bicicleta', 'Bicicleta ergométrica', 'cardio', [], ['maquina'], 1, 'minutos'),
  E('caminhada', 'Caminhada rápida ou trote leve', 'cardio', [], ['corpo'], 1, 'minutos'),
  E('intervalado', 'Intervalado: 30 s forte, 30 s leve (polichinelo, corrida parada)', 'cardio', [], ['corpo'], 2, 'minutos', { avoid: ['joelho'] }),
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const byName = new Map(EXERCISES.map((e) => [fold(e.name), e]));
const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export const exerciseById = (id: string): Exercise | undefined => byId.get(id);

/** Acha pelo nome escrito na nota (sem diferenciar acento e maiúscula). */
export function exerciseByName(name: string): Exercise | undefined {
  return byName.get(fold(name));
}

export const sameExercise = (a: string, b: string): boolean => fold(a) === fold(b);
