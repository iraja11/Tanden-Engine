import { fold } from '../regras/parse';
import type { Program, RuleProfession, RuleTrait } from '../regras/parse';
import type { Habilidade, Pessoa } from './tipos';

/*
 * Catálogo da simulação de vidas: traços, gostos e profissões.
 *
 * Cada traço mexe no peso das interações (um luxurioso flerta o dobro, um
 * casto quase nunca), na opinião dos outros (afinidade: honesto gosta de
 * honesto, detesta mentiroso) e no humor. As regras do mundo acrescentam
 * traços e profissões (`traço "Sonâmbulo":`, `profissão "Alquimista":`).
 */

export type TracoCat = 'personalidade' | 'adquirido' | 'congenito' | 'marca' | 'reputacao';

export interface Traco {
  id: string;
  m: string;
  f: string;
  cat: TracoCat;
  oposto?: string;
  desc: string;
  /** chance de um filho herdar de quem tem (0 a 1) */
  herda?: number;
  /** multiplicador do peso das interações (id → ×) */
  peso?: Record<string, number>;
  /** empurrão nos cinco grandes [abertura, consc., extroversão, amabilidade, neuroticismo] */
  big5?: [number, number, number, number, number];
  humor?: number;
  estresse?: number;
  /** opinião extra quando o outro tem o traço (id → pontos; "" = o mesmo traço) */
  afinidade?: Record<string, number>;
  /** opinião de todo mundo sobre quem tem (reputação, beleza) */
  visto?: number;
  /** só quem lê a crônica sabe */
  oculto?: boolean;
  combate?: number;
  /** traço declarado nas regras: surge sozinho quando a condição vale */
  regra?: RuleTrait;
}

const T = (id: string, f: string | null, cat: TracoCat, desc: string, x: Partial<Traco> = {}): Traco => ({ id, m: id, f: f ?? id, cat, desc, ...x });

export const TRACOS: Traco[] = [
  // ---- personalidade (em pares de opostos)
  T('corajoso', 'corajosa', 'personalidade', 'Encara o perigo de frente.', { oposto: 'covarde', herda: 0.12, peso: { brigar: 1.5, duelar: 1.8, ameacar: 1.3 }, big5: [5, 0, 5, 0, -15], combate: 3, visto: 3 }),
  T('covarde', null, 'personalidade', 'Foge quando o bicho pega.', { oposto: 'corajoso', herda: 0.12, peso: { brigar: 0.4, duelar: 0.15, assassinar: 0.6, ameacar: 0.5 }, big5: [0, 0, -5, 0, 15], combate: -3, visto: -3 }),
  T('generoso', 'generosa', 'personalidade', 'Divide o que tem.', { oposto: 'ganancioso', peso: { presentear: 2.5, ajudar: 1.7, roubar: 0.2 }, big5: [0, 0, 0, 15, 0], visto: 4, afinidade: { ganancioso: -6 } }),
  T('ganancioso', 'gananciosa', 'personalidade', 'Nunca é o bastante.', { oposto: 'generoso', peso: { presentear: 0.25, ajudar: 0.6, roubar: 2, trabalhar: 1.4 }, big5: [0, 5, 0, -15, 5], visto: -3 }),
  T('honesto', 'honesta', 'personalidade', 'Não sabe mentir, nem quer.', { oposto: 'mentiroso', peso: { seduzir: 0.45, roubar: 0.3, fofocar: 0.7, encontro_secreto: 0.6 }, big5: [0, 10, 0, 10, 0], afinidade: { '': 8, mentiroso: -10 }, estresse: 0 }),
  T('mentiroso', 'mentirosa', 'personalidade', 'Inventa com a cara mais lisa do mundo.', { oposto: 'honesto', peso: { seduzir: 1.4, roubar: 1.5, fofocar: 1.3 }, big5: [0, -5, 0, -10, 0], afinidade: { honesto: -6 } }),
  T('gentil', null, 'personalidade', 'Trata bem até quem não merece.', { oposto: 'cruel', herda: 0.08, peso: { insultar: 0.3, brigar: 0.5, assassinar: 0.1, ajudar: 1.8, elogiar: 1.5, cuidar: 1.4 }, big5: [0, 0, 0, 25, -5], visto: 5, afinidade: { cruel: -10 } }),
  T('cruel', null, 'personalidade', 'Gosta de ver os outros sofrerem.', { oposto: 'gentil', herda: 0.08, peso: { insultar: 2.5, brigar: 1.8, assassinar: 3, ajudar: 0.3, ameacar: 2 }, big5: [0, 0, 0, -30, 5], visto: -8, afinidade: { gentil: -6 } }),
  T('calmo', 'calma', 'personalidade', 'Difícil de tirar do sério.', { oposto: 'irascivel', herda: 0.1, peso: { discutir: 0.5, brigar: 0.4, insultar: 0.6 }, big5: [0, 5, 0, 5, -20] }),
  T('irascivel', 'irascível', 'personalidade', 'Pavio curto.', { oposto: 'calmo', herda: 0.1, peso: { discutir: 2, brigar: 2.2, insultar: 1.6, duelar: 1.3 }, big5: [0, -5, 0, -10, 20], visto: -2 }),
  T('paciente', null, 'personalidade', 'Espera a hora certa.', { oposto: 'impulsivo', peso: { ensinar: 1.6, cuidar: 1.3, assassinar: 1.2 }, big5: [0, 15, 0, 5, -5] }),
  T('impulsivo', 'impulsiva', 'personalidade', 'Faz primeiro, pensa depois.', { oposto: 'paciente', peso: { seduzir: 1.5, brigar: 1.4, flertar: 1.3, viajar: 1.3, ensinar: 0.6 }, big5: [5, -20, 5, 0, 10] }),
  T('humilde', null, 'personalidade', 'Não precisa de plateia.', { oposto: 'orgulhoso', peso: { duelar: 0.4, reconciliar: 1.6, insultar: 0.6 }, big5: [0, 0, 0, 10, 0], visto: 3 }),
  T('orgulhoso', 'orgulhosa', 'personalidade', 'Nunca esquece um desaforo.', { oposto: 'humilde', peso: { duelar: 2, reconciliar: 0.5, insultar: 1.4 }, big5: [0, 0, 5, -10, 5] }),
  T('leal', null, 'personalidade', 'Fica até o fim.', { oposto: 'traicoeiro', peso: { seduzir: 0.25, encontro_secreto: 0.5, fofocar: 0.6 }, big5: [0, 10, 0, 10, 0], afinidade: { '': 10, traicoeiro: -12 }, visto: 3 }),
  T('traicoeiro', 'traiçoeira', 'personalidade', 'Vira a casaca quando convém.', { oposto: 'leal', peso: { seduzir: 2, fofocar: 1.5, assassinar: 1.5, roubar: 1.3 }, big5: [0, -5, 0, -15, 5], visto: -2 }),
  T('casto', 'casta', 'personalidade', 'O corpo é templo.', { oposto: 'luxurioso', peso: { flertar: 0.3, intimidade: 0.35, seduzir: 0.1, encontro_secreto: 0.3 }, big5: [-5, 10, 0, 0, 0] }),
  T('luxurioso', 'luxuriosa', 'personalidade', 'Desejo à flor da pele.', { oposto: 'casto', herda: 0.08, peso: { flertar: 2, intimidade: 2, seduzir: 2.5, encontro_secreto: 1.8 }, big5: [10, -5, 5, 0, 0] }),
  T('sociavel', 'sociável', 'personalidade', 'Conhece todo mundo pelo nome.', { oposto: 'timido', herda: 0.1, peso: { conversar: 1.6, flertar: 1.3, atividade: 1.3, fofocar: 1.2 }, big5: [0, 0, 30, 5, 0], visto: 2 }),
  T('timido', 'tímida', 'personalidade', 'Prefere o canto da sala.', { oposto: 'sociavel', herda: 0.1, peso: { conversar: 0.6, flertar: 0.5, cortejar: 0.6, atividade: 0.8, estudar: 1.3 }, big5: [0, 0, -30, 0, 10] }),
  T('trabalhador', 'trabalhadora', 'personalidade', 'Primeiro a chegar, último a sair.', { oposto: 'preguicoso', peso: { trabalhar: 2, estudar: 1.3, treinar: 1.3, beber: 0.7 }, big5: [0, 25, 0, 0, 0], visto: 2 }),
  T('preguicoso', 'preguiçosa', 'personalidade', 'Amanhã, quem sabe.', { oposto: 'trabalhador', peso: { trabalhar: 0.3, estudar: 0.5, treinar: 0.5, beber: 1.4 }, big5: [0, -25, 0, 0, 0], visto: -2 }),
  T('ambicioso', 'ambiciosa', 'personalidade', 'Quer subir, custe o que custar.', { oposto: 'acomodado', peso: { trabalhar: 1.4, treinar: 1.3, duelar: 1.3, estudar: 1.3 }, big5: [5, 10, 5, -5, 5] }),
  T('acomodado', 'acomodada', 'personalidade', 'Está bom assim.', { oposto: 'ambicioso', peso: { trabalhar: 0.8, viajar: 0.6, duelar: 0.6 }, big5: [-5, 0, 0, 5, -5], humor: 5 }),
  T('vingativo', 'vingativa', 'personalidade', 'A dívida sempre é cobrada.', { oposto: 'clemente', peso: { reconciliar: 0.3, assassinar: 2, duelar: 1.4 }, big5: [0, 0, 0, -10, 10] }),
  T('clemente', null, 'personalidade', 'Perdoa, e às vezes até esquece.', { oposto: 'vingativo', peso: { reconciliar: 2.5, assassinar: 0.2, insultar: 0.7 }, big5: [0, 0, 0, 15, -5], visto: 2 }),
  T('devoto', 'devota', 'personalidade', 'Reza antes de tudo.', { oposto: 'cinico', herda: 0.15, peso: { rezar: 3, divorciar: 0.3, seduzir: 0.6, intimidade: 0.8 }, big5: [-5, 10, 0, 5, 0], afinidade: { '': 10, cinico: -8 } }),
  T('cinico', 'cínica', 'personalidade', 'Não acredita em nada, nem em ninguém.', { oposto: 'devoto', herda: 0.1, peso: { rezar: 0.1, divorciar: 1.3, insultar: 1.2 }, big5: [10, 0, 0, -5, 0], afinidade: { devoto: -6 } }),
  T('curioso', 'curiosa', 'personalidade', 'Pergunta o que ninguém pergunta.', { oposto: 'tradicional', herda: 0.1, peso: { estudar: 1.8, viajar: 1.8, atividade: 1.2, conversar: 1.2 }, big5: [25, 0, 5, 0, 0] }),
  T('tradicional', null, 'personalidade', 'Sempre foi assim, assim vai ser.', { oposto: 'curioso', peso: { viajar: 0.5, estudar: 0.7, divorciar: 0.4 }, big5: [-25, 10, 0, 0, 0], afinidade: { '': 5 } }),
  T('romantico', 'romântica', 'personalidade', 'Acredita em amor de livro.', { oposto: 'pragmatico', peso: { cortejar: 1.8, flertar: 1.3, pedir_casamento: 1.5, presentear: 1.3 }, big5: [10, 0, 0, 5, 5] }),
  T('pragmatico', 'pragmática', 'personalidade', 'Amor é bom, mas paga conta?', { oposto: 'romantico', peso: { cortejar: 0.7, trabalhar: 1.2 }, big5: [-5, 10, 0, 0, -5] }),
  T('desconfiado', 'desconfiada', 'personalidade', 'Sempre tem alguém tramando.', { oposto: 'ingenuo', peso: { confidenciar: 0.4 }, big5: [0, 0, -5, -10, 10] }),
  T('ingenuo', 'ingênua', 'personalidade', 'Acredita em todo mundo.', { oposto: 'desconfiado', peso: { confidenciar: 1.5 }, big5: [0, 0, 5, 10, -5] }),
  T('alegre', null, 'personalidade', 'Ri de tudo, até do azar.', { oposto: 'melancolico', herda: 0.1, peso: { conversar: 1.2, atividade: 1.3 }, big5: [0, 0, 10, 5, -15], humor: 20, visto: 3 }),
  T('melancolico', 'melancólica', 'personalidade', 'Carrega uma nuvem cinza.', { oposto: 'alegre', herda: 0.1, peso: { conversar: 0.8, beber: 1.4, estudar: 1.2 }, big5: [5, 0, -10, 0, 20], humor: -20 }),
  T('fofoqueiro', 'fofoqueira', 'personalidade', 'Sabe da vida de todo mundo.', { oposto: 'discreto', peso: { fofocar: 3, conversar: 1.3 }, big5: [0, 0, 10, -5, 0] }),
  T('discreto', 'discreta', 'personalidade', 'Leva segredos para o túmulo.', { oposto: 'fofoqueiro', peso: { fofocar: 0.15, confidenciar: 1.3 }, big5: [0, 10, -5, 0, 0], afinidade: { '': 4 } }),
  T('ciumento', 'ciumenta', 'personalidade', 'Vê rival em cada sombra.', { oposto: 'desapegado', big5: [0, 0, 0, -5, 15] }),
  T('desapegado', 'desapegada', 'personalidade', 'Não prende ninguém.', { oposto: 'ciumento', peso: { terminar: 1.3 }, big5: [5, 0, 0, 5, -10] }),

  // ---- adquiridos pela vida
  T('veterano', 'veterana', 'adquirido', 'Já viu sangue demais.', { peso: { brigar: 1.2, duelar: 1.2 }, combate: 4, visto: 3 }),
  T('brigao', 'brigona', 'adquirido', 'Resolve tudo no braço.', { peso: { brigar: 1.8, ameacar: 1.5 }, combate: 2, visto: -2 }),
  T('amargurado', 'amargurada', 'adquirido', 'A vida tirou demais.', { peso: { reconciliar: 0.5, conversar: 0.8, insultar: 1.3 }, humor: -15 }),
  T('alcoolatra', 'alcoólatra', 'adquirido', 'Não passa um dia sem beber.', { peso: { beber: 3, brigar: 1.3, trabalhar: 0.7 }, humor: -5, visto: -4 }),
  T('traumatizado', 'traumatizada', 'adquirido', 'Acorda gritando.', { peso: { brigar: 0.5, duelar: 0.4, conversar: 0.8 }, big5: [0, 0, -5, 0, 15], estresse: 10 }),
  T('sabio', 'sábia', 'adquirido', 'Os anos ensinaram.', { peso: { ensinar: 2, confidenciar: 1.2 }, visto: 6 }),
  T('devasso', 'devassa', 'adquirido', 'Coleciona amantes.', { peso: { seduzir: 1.8, flertar: 1.5, encontro_secreto: 1.5 }, visto: -3 }),
  T('assassino', 'assassina', 'adquirido', 'Já matou, e ninguém sabe.', { oculto: true, estresse: 5 }),
  T('heroi', 'heroína', 'reputacao', 'Fez algo que o povo não esquece.', { visto: 12 }),
  T('infame', null, 'reputacao', 'O povo cochicha quando passa.', { visto: -12 }),
  T('enlutado', 'enlutada', 'adquirido', 'Perdeu alguém há pouco.', { peso: { flertar: 0.2, cortejar: 0.2, seduzir: 0.3, atividade: 0.6 }, humor: -25 }),

  // ---- de nascença (vêm dos genes)
  T('genial', null, 'congenito', 'Aprende num dia o que outros levam um ano.', { visto: 3 }),
  T('lento', 'lenta', 'congenito', 'Demora a entender as coisas.', { visto: -2 }),
  T('belo', 'bela', 'congenito', 'Vira cabeças por onde passa.', { visto: 6 }),
  T('feio', 'feia', 'congenito', 'A natureza não ajudou.', { visto: -4 }),
  T('robusto', 'robusta', 'congenito', 'Raramente fica doente.', { combate: 1 }),
  T('fragil', 'frágil', 'congenito', 'Qualquer vento derruba.', { combate: -2 }),
  T('gigante', null, 'congenito', 'Uma cabeça acima de todos.', { combate: 3 }),
  T('miudo', 'miúda', 'congenito', 'Pequeno, mas ninguém precisa saber.', { combate: -1 }),
  T('esteril', 'estéril', 'congenito', 'Não pode ter filhos.'),
  T('longevo', 'longeva', 'congenito', 'Vem de uma linhagem que vive muito.'),
  T('sangue fraco', null, 'congenito', 'Sangra fácil e demora a sarar (doença recessiva).', { combate: -2 }),
  T('consanguineo', 'consanguínea', 'congenito', 'Filho de parentes; a saúde cobra.', { visto: -2 }),
  T('gemeo', 'gêmea', 'marca', 'Nasceu com um irmão do lado.'),

  // ---- marcas do corpo
  T('cicatriz', null, 'marca', 'Uma cicatriz que conta história.', { visto: 1 }),
  T('manco', 'manca', 'marca', 'Uma perna que não obedece.', { combate: -3 }),
  T('caolho', 'caolha', 'marca', 'Perdeu um olho.', { combate: -3, visto: -1 }),
  T('mutilado', 'mutilada', 'marca', 'Perdeu a mão.', { combate: -6 }),
];

export const GOSTOS = [
  'música', 'caça', 'leitura', 'bebida', 'jogos de azar', 'arte', 'natureza', 'festas', 'culinária', 'luta', 'religião', 'viagens',
  'poesia', 'jardinagem', 'cavalos', 'o mar', 'astronomia', 'dança', 'estratégia', 'histórias', 'pesca', 'artesanato',
];

/** Frase para quando duas pessoas fazem juntas o que gostam. */
export const ATIVIDADE: Record<string, string> = {
  'música': 'tocam e cantam até tarde', caça: 'saem para caçar juntos', leitura: 'trocam livros e discutem cada página', bebida: 'esvaziam uma garrafa juntos',
  'jogos de azar': 'apostam a noite inteira', arte: 'passam a tarde desenhando', natureza: 'andam pelos campos', festas: 'são os últimos a sair da festa',
  'culinária': 'cozinham um banquete juntos', luta: 'treinam golpes no pátio', 'religião': 'rezam lado a lado', viagens: 'sonham com terras distantes',
  poesia: 'trocam versos', jardinagem: 'cuidam de um jardim', cavalos: 'cavalgam até o rio', 'o mar': 'passam o dia olhando o mar', astronomia: 'contam estrelas no telhado',
  'dança': 'dançam na praça', 'estratégia': 'jogam um tabuleiro até o amanhecer', 'histórias': 'contam histórias à beira do fogo', pesca: 'pescam em silêncio', artesanato: 'constroem algo juntos',
};

// ------------------------------------------------------------------ profissões

export interface Profissao {
  id: string;
  m: string;
  f: string;
  /** moedas por mês */
  renda: number;
  hab: Habilidade | string;
  /** prestígio, 0 a 5 */
  status: number;
  /** chance de acidente por mês */
  risco: number;
  viaja?: boolean;
  /** só para quem nasce nela (nobreza) */
  heranca?: boolean;
  /** aptidão: quanto a pessoa combina com a profissão (≥ 0) */
  apto?: (p: Pessoa) => number;
  regra?: RuleProfession;
}

const temT = (p: Pessoa, ...ids: string[]) => ids.some((i) => p.tracos.includes(i));

export const PROFISSOES: Profissao[] = [
  { id: 'camponês', m: 'camponês', f: 'camponesa', renda: 3, hab: 'oficio', status: 1, risco: 0.0008, apto: () => 2 },
  { id: 'ferreiro', m: 'ferreiro', f: 'ferreira', renda: 6, hab: 'oficio', status: 2, risco: 0.0006, apto: (p) => 0.5 + p.hab.oficio / 8 + (temT(p, 'trabalhador') ? 1 : 0) },
  { id: 'mercador', m: 'mercador', f: 'mercadora', renda: 8, hab: 'labia', status: 3, risco: 0.0004, viaja: true, apto: (p) => 0.3 + p.hab.labia / 7 + (temT(p, 'ganancioso', 'ambicioso') ? 1 : 0) },
  { id: 'soldado', m: 'soldado', f: 'soldada', renda: 5, hab: 'combate', status: 2, risco: 0.002, apto: (p) => 0.3 + p.hab.combate / 6 + (temT(p, 'corajoso', 'brigao') ? 1.2 : 0) - (temT(p, 'covarde') ? 1 : 0) },
  { id: 'guarda', m: 'guarda', f: 'guarda', renda: 5, hab: 'combate', status: 2, risco: 0.0012, apto: (p) => 0.3 + p.hab.combate / 7 + (temT(p, 'leal', 'honesto') ? 0.8 : 0) },
  { id: 'sacerdote', m: 'sacerdote', f: 'sacerdotisa', renda: 4, hab: 'saber', status: 3, risco: 0, apto: (p) => (temT(p, 'devoto') ? 3 : 0.1) + p.hab.saber / 10 - (temT(p, 'cinico', 'luxurioso') ? 2 : 0) },
  { id: 'curandeiro', m: 'curandeiro', f: 'curandeira', renda: 5, hab: 'saber', status: 3, risco: 0.0002, apto: (p) => 0.2 + p.hab.saber / 6 + (temT(p, 'gentil', 'paciente') ? 1 : 0) },
  { id: 'bardo', m: 'bardo', f: 'barda', renda: 4, hab: 'labia', status: 2, risco: 0.0004, viaja: true, apto: (p) => 0.2 + p.hab.labia / 8 + (temT(p, 'sociavel', 'romantico') ? 1.2 : 0) + (p.gostos.includes('música') ? 1.5 : 0) },
  { id: 'taberneiro', m: 'taberneiro', f: 'taberneira', renda: 6, hab: 'labia', status: 2, risco: 0.0003, apto: (p) => 0.3 + (temT(p, 'sociavel') ? 1.5 : 0) + (p.gostos.includes('bebida') ? 0.8 : 0) },
  { id: 'caçador', m: 'caçador', f: 'caçadora', renda: 4, hab: 'combate', status: 1, risco: 0.0015, apto: (p) => 0.4 + p.hab.combate / 10 + (p.gostos.includes('caça') ? 2 : 0) },
  { id: 'estudioso', m: 'estudioso', f: 'estudiosa', renda: 5, hab: 'saber', status: 3, risco: 0, apto: (p) => 0.1 + p.hab.saber / 4 + (temT(p, 'curioso', 'genial') ? 1.5 : 0) },
  { id: 'artesão', m: 'artesão', f: 'artesã', renda: 5, hab: 'oficio', status: 2, risco: 0.0003, apto: (p) => 0.4 + p.hab.oficio / 8 + (p.gostos.includes('artesanato') || p.gostos.includes('arte') ? 1.5 : 0) },
  { id: 'pescador', m: 'pescador', f: 'pescadora', renda: 3, hab: 'oficio', status: 1, risco: 0.001, apto: (p) => 0.6 + (p.gostos.includes('pesca') || p.gostos.includes('o mar') ? 2 : 0) },
  { id: 'ladrão', m: 'ladrão', f: 'ladra', renda: 7, hab: 'intriga', status: 0, risco: 0.002, apto: (p) => (temT(p, 'ganancioso', 'traicoeiro', 'mentiroso') ? 0.8 : 0.02) + p.hab.intriga / 12 - (temT(p, 'honesto') ? 1 : 0) },
  { id: 'criado', m: 'criado', f: 'criada', renda: 2, hab: 'oficio', status: 0, risco: 0.0002, apto: () => 0.8 },
  { id: 'nobre', m: 'nobre', f: 'nobre', renda: 15, hab: 'labia', status: 5, risco: 0.0001, heranca: true },
];

/** Profissões que uma cidade quer ter pelo menos uma (o gerador preenche primeiro). */
export const ESSENCIAIS = ['taberneiro', 'curandeiro', 'guarda', 'sacerdote', 'ferreiro', 'mercador'];

// ------------------------------------------------------------------ nomes

export const NOMES_F = ['Ana', 'Beatriz', 'Catarina', 'Inês', 'Leonor', 'Mafalda', 'Teresa', 'Urraca', 'Branca', 'Constança', 'Elvira', 'Isabel', 'Joana',
  'Maria', 'Mécia', 'Sancha', 'Violante', 'Guiomar', 'Brites', 'Aldonça', 'Filipa', 'Margarida', 'Oriana', 'Dulce', 'Helena', 'Lia', 'Rosa', 'Clara'];
export const NOMES_M = ['Afonso', 'Álvaro', 'Bento', 'Duarte', 'Fernão', 'Gonçalo', 'Henrique', 'João', 'Lourenço', 'Martim', 'Nuno', 'Paio', 'Pero',
  'Rodrigo', 'Sancho', 'Tomé', 'Vasco', 'Diogo', 'Egas', 'Estêvão', 'Gil', 'Tristão', 'Simão', 'Rui', 'Lopo', 'Mem', 'Garcia', 'Telmo'];
export const SOBRENOMES = ['Ferreira', 'Moleiro', 'da Ponte', 'do Vale', 'Coelho', 'Lobo', 'Raposo', 'Carvalho', 'Pereira', 'Valente', 'Cardoso', 'Bravo',
  'Torres', 'Pinheiro', 'Serra', 'Monteiro', 'Rocha', 'Barros', 'Prado', 'Fontes', 'Corvo', 'Salgueiro', 'Mendes', 'Godinho', 'Teles'];

// ------------------------------------------------------------------ catálogo do mundo (fábrica + regras)

export interface Catalogo {
  tracos: Map<string, Traco>;
  profs: Map<string, Profissao>;
  gostos: string[];
}

/** Catálogo de fábrica somado ao que as regras do mundo declararam. */
export function catalogo(prog?: Program | null): Catalogo {
  const tracos = new Map(TRACOS.map((t) => [t.id, t]));
  for (const r of prog?.traits ?? []) {
    const base = tracos.get(r.id);
    tracos.set(r.id, {
      ...(base ?? {}), id: r.id, m: r.m, f: r.f, cat: (['personalidade', 'adquirido', 'congenito', 'marca', 'reputacao'].includes(r.category) ? r.category : 'personalidade') as TracoCat,
      desc: r.desc || base?.desc || '', herda: r.inherit || base?.herda, peso: { ...(base?.peso ?? {}), ...r.weights },
      afinidade: { ...(base?.afinidade ?? {}), ...r.affinity }, humor: r.mood || base?.humor, estresse: r.stress || base?.estresse, regra: r,
      ...(r.opposite ? { oposto: r.opposite } : base?.oposto ? { oposto: base.oposto } : {}),
    });
    // o oposto também passa a apontar de volta
    if (r.opposite && tracos.has(r.opposite) && !tracos.get(r.opposite)!.oposto) tracos.set(r.opposite, { ...tracos.get(r.opposite)!, oposto: r.id });
  }
  const profs = new Map(PROFISSOES.map((p) => [p.id, p]));
  for (const r of prog?.professions ?? []) {
    profs.set(r.id, { id: r.id, m: r.m, f: r.f, renda: r.income, hab: r.skill, status: r.status, risco: r.risk, viaja: r.travels, regra: r, apto: () => 1 });
  }
  const gostos = [...new Set([...GOSTOS, ...(prog?.tastes ?? [])])];
  return { tracos, profs, gostos };
}

/** Acha o traço do catálogo por um texto livre ("ciumenta", "covarde no aperto", "Leal"). */
export function tracoDoTexto(cat: Catalogo, texto: string): string | null {
  const k = fold(texto).replace(/[^a-z\s]/g, ' ').trim();
  if (!k) return null;
  for (const t of cat.tracos.values()) if (fold(t.m) === k || fold(t.f) === k || t.id === k) return t.id;
  // "covarde no aperto" → covarde; "mentiroso compulsivo" → mentiroso
  const words = k.split(/\s+/);
  for (const t of cat.tracos.values()) if (words.includes(fold(t.m)) || words.includes(fold(t.f))) return t.id;
  return null;
}

/** Acha a profissão por um texto livre ("ferreira", "Curandeiro da vila"). */
export function profDoTexto(cat: Catalogo, texto: string): string | null {
  const k = fold(texto).trim();
  if (!k) return null;
  for (const p of cat.profs.values()) if (fold(p.m) === k || fold(p.f) === k || fold(p.id) === k) return p.id;
  for (const p of cat.profs.values()) if (k.split(/\s+/).some((w) => w === fold(p.m) || w === fold(p.f))) return p.id;
  return null;
}

/** Nome do traço na forma certa para a pessoa. */
export function nomeTraco(cat: Catalogo, id: string, genero: 'f' | 'm' | 'n'): string {
  const t = cat.tracos.get(id);
  return t ? (genero === 'f' ? t.f : t.m) : id;
}

export function nomeProf(cat: Catalogo, id: string | null, genero: 'f' | 'm' | 'n'): string {
  if (!id) return '';
  const p = cat.profs.get(id);
  return p ? (genero === 'f' ? p.f : p.m) : id;
}
