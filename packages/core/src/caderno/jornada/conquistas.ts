import { asText } from '../frontmatter';
import { CHECKLISTS, readChecks } from '../guia';
import { ELEMENT_FAMILIES, elementCoverage, familyCoverage } from '../elementos';
import { readMarkers } from '../mapa';
import { ENTITY_TYPES, NON_CARD_TYPES, timeline, type Entity, type World } from '../mundo';
import { storyIndex } from '../narrativa';
import { reviewWorld } from '../revisao';
import { GENEROS, generoDoMundo } from './generos';
import { RARIDADES, estadoDoMundo, profundidades, type Raridade } from './progresso';
import { atividadeDoMundo, calcularSequencia, diasCumpridos, somarContador, type RegistroAparelho } from './registro';

/*
 * Conquistas. Cada uma é um limite sobre uma métrica (`metrica >= alvo`), o que
 * permite mostrar o progresso de todas com o mesmo código. As métricas saem das
 * notas e do registro de atividade; o que vale é o melhor mundo, e as conquistas
 * são do autor, não de um mundo só.
 */

export interface Conquista {
  id: string;
  nome: string;
  desc: string;
  grupo: GrupoConquista;
  raridade: Raridade;
  glifo: string;
  metrica: string;
  alvo: number;
  /** só mostra o nome depois de obtida */
  secreta?: boolean;
}

export type GrupoConquista = 'escrita' | 'constancia' | 'sprints' | 'fichas' | 'teia' | 'tempo' | 'historias' | 'oficina' | 'generos' | 'marcos' | 'segredos';

export const GRUPOS: Array<{ id: GrupoConquista; label: string }> = [
  { id: 'escrita', label: 'Escrita' }, { id: 'constancia', label: 'Constância' }, { id: 'sprints', label: 'Sprints' },
  { id: 'fichas', label: 'Fichas' }, { id: 'teia', label: 'Teia' }, { id: 'tempo', label: 'Tempo e mapas' },
  { id: 'historias', label: 'Histórias' }, { id: 'oficina', label: 'Oficina' }, { id: 'generos', label: 'Gêneros' },
  { id: 'marcos', label: 'Marcos' }, { id: 'segredos', label: 'Segredos' },
];

/** Experiência que uma conquista dá ao mundo em que foi obtida. */
export const XP_DA_RARIDADE: Record<Raridade, number> = { comum: 10, incomum: 25, rara: 50, epica: 100, lendaria: 250 };

const out: Conquista[] = [];

/** Raridade pela posição na série: o começo é comum, o fim é raro de verdade. */
function grau(i: number, n: number, teto: Raridade): Raridade {
  const ordem = RARIDADES.map((r) => r.id);
  const p = n > 1 ? i / (n - 1) : 0;
  const k = p < 0.2 ? 0 : p < 0.45 ? 1 : p < 0.7 ? 2 : p < 0.95 ? 3 : 4;
  return ordem[Math.min(k, ordem.indexOf(teto))]!;
}

function serie(
  grupo: GrupoConquista, metrica: string, glifo: string, desc: (alvo: number) => string,
  itens: Array<[alvo: number, nome: string]>, teto: Raridade = 'lendaria',
): void {
  itens.forEach(([alvo, nome], i) => out.push({ id: `${metrica}-${alvo}`, nome, desc: desc(alvo), grupo, raridade: grau(i, itens.length, teto), glifo, metrica, alvo }));
}

const fmt = (n: number) => n.toLocaleString('pt-BR');
const s = (n: number, um: string, varios: string) => `${fmt(n)} ${n === 1 ? um : varios}`;

// ------------------------------------------------------------------ escrita

serie('escrita', 'palavras', '✎', (a) => `Escreva ${s(a, 'palavra', 'palavras')} nos seus mundos.`, [
  [100, 'Tinta na pena'], [1000, 'Mil palavras'], [5000, 'Conto de bolso'], [10000, 'Novela em gestação'], [25000, 'Fôlego de maratonista'],
  [50000, 'Meio romance'], [100000, 'Cem mil vozes'], [250000, 'Trilogia à vista'], [500000, 'Estante inteira'], [1000000, 'O Milhão'],
]);
serie('escrita', 'melhorDia', '☀', (a) => `Escreva ${s(a, 'palavra', 'palavras')} em um único dia.`, [
  [300, 'Bom dia de trabalho'], [500, 'Dia produtivo'], [1000, 'Mil antes do jantar'], [2000, 'Em transe'], [3000, 'Possuído pela musa'], [5000, 'O dedo que fumega'], [10000, 'Dez mil num só dia'],
]);
serie('escrita', 'palavrasMundo', '❖', (a) => `Tenha ${s(a, 'palavra', 'palavras')} escritas em um só mundo.`, [
  [1000, 'Um mundo com o que dizer'], [10000, 'Guia de viagem'], [50000, 'Enciclopédia regional'], [150000, 'Tratado universal'], [400000, 'Biblioteca de um mundo só'],
]);

// ------------------------------------------------------------------ constância

serie('constancia', 'seqMelhor', '🔥', (a) => `Cumpra a meta diária por ${s(a, 'dia seguido', 'dias seguidos')}.`, [
  [2, 'De novo amanhã'], [3, 'Três dias de chama'], [5, 'Quase um hábito'], [7, 'Semana acesa'], [14, 'Duas semanas de brasa'], [21, 'Hábito formado'], [30, 'Mês em chamas'],
  [50, 'Cinquenta auroras'], [75, 'Fogo que não apaga'], [100, 'Centenário da chama'], [150, 'Lareira eterna'], [200, 'Vulcão ativo'], [365, 'Um ano sem falhar'], [500, 'Quinhentos amanheceres'], [1000, 'A chama de mil dias'],
]);
serie('constancia', 'diasAtivos', '☼', (a) => `Escreva em ${s(a, 'dia', 'dias')} no total.`, [
  [1, 'O primeiro dia'], [10, 'Dez visitas à mesa'], [30, 'Frequentador da página'], [100, 'Cem dias de ofício'], [250, 'Profissão: autor'], [500, 'Vida de escritor'], [1000, 'Mil dias diante da página'],
]);
serie('constancia', 'escudosUsados', '🛡', (a) => `Deixe ${s(a, 'escudo', 'escudos')} salvar a sequência.`, [[1, 'Salvo pelo escudo'], [5, 'Escudeiro fiel'], [15, 'Muralha do calendário']], 'rara');
serie('constancia', 'marca.fimdesemana', '☕', (a) => `Escreva em ${s(a, 'sessão', 'sessões')} de fim de semana.`, [[5, 'Sábado é dia de mundo'], [25, 'Domingo sem futebol'], [100, 'O descanso é para os outros']], 'rara');

// ------------------------------------------------------------------ sprints

serie('sprints', 'sprints', '⏱', (a) => `Termine ${s(a, 'sprint', 'sprints')} de escrita.`, [
  [1, 'Largada'], [5, 'Aquecimento feito'], [10, 'Corredor da página'], [25, 'Fôlego de sprint'], [50, 'Atleta das letras'], [100, 'Cem largadas'], [250, 'Pista cativa'], [500, 'Lenda da pista'],
]);
serie('sprints', 'rec.ppm', '⚡', (a) => `Atinja ${a} palavras por minuto num sprint.`, [[15, 'Dedos acordados'], [25, 'Ritmo firme'], [35, 'Teclas em brasa'], [50, 'Faísca nos dedos'], [70, 'Máquina de escrever humana'], [90, 'Velocidade da luz']]);
serie('sprints', 'rec.sprint', '➶', (a) => `Escreva ${s(a, 'palavra', 'palavras')} em um só sprint.`, [[100, 'Primeira centena'], [250, 'Cena curta'], [500, 'Meio milhar'], [1000, 'Mil de uma tacada'], [2000, 'Capítulo no fôlego']]);
serie('sprints', 'duros', '☠', (a) => `Sobreviva a ${s(a, 'sprint', 'sprints')} no modo Escreva ou Desapareça.`, [[1, 'Sobrevivente'], [5, 'Nervos de aço'], [15, 'Não pisco'], [40, 'Imune ao bloqueio'], [100, 'A página tem medo de você']]);
serie('sprints', 'dobro', '✕', (a) => `Dobre a meta do sprint ${s(a, 'vez', 'vezes')}.`, [[1, 'Meta é só o começo'], [10, 'Dobrando a aposta'], [50, 'Inflação de palavras']], 'epica');

// ------------------------------------------------------------------ fichas por tipo

const NOMES_TIPO: Record<string, [string, string, string, string]> = {
  personagem: ['Primeiro rosto', 'Elenco de apoio', 'Multidão com nome', 'Censo completo'],
  lugar: ['Um lugar para estar', 'Roteiro de viagem', 'Atlas de bolso', 'Geografia inteira'],
  faccao: ['Dois é panelinha', 'Jogo de poder', 'Tabuleiro político', 'Mestre das intrigas'],
  evento: ['Algo aconteceu', 'Notícias da semana', 'Anais do mundo', 'Cronista-mor'],
  conflito: ['A primeira briga', 'Barril de pólvora', 'Continente em guerra', 'Paz? Que paz?'],
  item: ['Algo no bolso', 'Baú de tesouros', 'Arsenal', 'Museu das relíquias'],
  especie: ['Vida nova', 'Zoológico particular', 'Árvore da vida', 'Darwin ficaria tonto'],
  cultura: ['Um jeito de viver', 'Vizinhos diferentes', 'Mosaico de povos', 'Antropólogo honorário'],
  conceito: ['Uma boa ideia', 'Caderno de teorias', 'Escola de pensamento', 'Filósofo de plantão'],
  criatura: ['Tem algo no mato', 'Bestiário iniciado', 'Domador de pesadelos', 'Bestiário definitivo'],
  mapa: ['Primeiro mapa', 'Rolos de pergaminho', 'Sala dos mapas', 'Cartógrafo real'],
  divindade: ['Alguém lá em cima', 'Pequeno panteão', 'Céu lotado', 'Politeísmo ambicioso'],
  idioma: ['Primeira palavra', 'Poliglota', 'Torre de vozes', 'Babel é aqui'],
  historia: ['Era uma vez', 'Contador de histórias', 'Antologia', 'Universo compartilhado'],
  cena: ['Luz, câmera', 'Sequência de cenas', 'Roteiro em pé', 'Diretor incansável'],
  religiao: ['Primeira fé', 'Muitos altares', 'Guerra santa à vista', 'Teólogo supremo'],
  feito: ['Um grande feito', 'Lista de façanhas', 'Hall da fama', 'Bardo oficial'],
  livro: ['Primeiro volume', 'Prateleira cheia', 'Biblioteca secreta', 'Bibliotecário-chefe'],
  magia: ['Primeira regra', 'Grimório aberto', 'Academia arcana', 'Arquimago do sistema'],
  profecia: ['Alguém previu', 'Sonhos estranhos', 'Oráculo ocupado', 'O futuro está lotado'],
  plano: ['Outro lado', 'Atravessando véus', 'Cosmologia própria', 'Multiverso particular'],
};

for (const t of ENTITY_TYPES) {
  const nomes = NOMES_TIPO[t.id];
  if (!nomes) continue;
  const alvos = t.id === 'cena' ? [1, 10, 50, 200] : t.id === 'historia' || t.id === 'mapa' || t.id === 'plano' ? [1, 3, 8, 20] : [1, 5, 15, 40];
  alvos.forEach((alvo, i) => out.push({
    id: `n.${t.id}-${alvo}`, nome: nomes[i]!, desc: `Tenha ${alvo} ${alvo === 1 ? `ficha de ${t.label.toLowerCase()}` : `fichas de ${t.label.toLowerCase()}`} num mundo.`,
    grupo: 'fichas', raridade: (['comum', 'incomum', 'rara', 'epica'] as Raridade[])[i]!, glifo: '◆', metrica: `n.${t.id}`, alvo,
  }));
}

serie('fichas', 'fichas', '❏', (a) => `Tenha ${s(a, 'ficha', 'fichas')} num só mundo.`, [[10, 'Uma dezena'], [25, 'Vinte e cinco almas'], [50, 'Meia centena'], [100, 'Mundo centenário'], [250, 'Gazeta completa'], [500, 'Quinhentos verbetes'], [1000, 'Mil verbetes']]);
serie('fichas', 'tiposUsados', '✣', (a) => `Use ${a} tipos diferentes de ficha num mundo.`, [[3, 'Variando o cardápio'], [6, 'Mundo diverso'], [10, 'Construtor versátil'], [15, 'Colecionador de tipos'], [21, 'Enciclopédia viva']]);
serie('fichas', 'incomuns', '◇', (a) => `Tenha ${s(a, 'ficha', 'fichas')} incomuns ou melhores.`, [[1, 'Saindo do comum'], [10, 'Acima da média'], [50, 'Padrão elevado']], 'rara');
serie('fichas', 'raras', '◈', (a) => `Tenha ${s(a, 'ficha', 'fichas')} raras ou melhores.`, [[1, 'Achado raro'], [5, 'Coleção rara'], [25, 'Vitrine de raridades'], [75, 'Mundo de exceções']], 'epica');
serie('fichas', 'epicas', '✦', (a) => `Tenha ${s(a, 'ficha', 'fichas')} épicas ou melhores.`, [[1, 'Toque épico'], [5, 'Galeria épica'], [20, 'Só tem gigante aqui'], [50, 'Panteão de fichas']]);
serie('fichas', 'lendarias', '★', (a) => `Tenha ${s(a, 'ficha', 'fichas')} lendárias.`, [[1, 'Nasce uma lenda'], [3, 'Trio lendário'], [10, 'Dez lendas'], [25, 'Era de lendas'], [50, 'Só lendas']]);

// ------------------------------------------------------------------ teia

serie('teia', 'ligacoes', '⌘', (a) => `Crie ${s(a, 'ligação', 'ligações')} entre fichas num mundo.`, [[1, 'Primeiro fio'], [10, 'Teia nascente'], [50, 'Tudo se conecta'], [100, 'Quadro de cortiça'], [250, 'Fios vermelhos'], [500, 'Rede neural'], [1000, 'Tudo é uma coisa só'], [2500, 'A grande teia']]);
serie('teia', 'maisLigada', '✺', (a) => `Tenha uma ficha com ${s(a, 'ligação', 'ligações')}.`, [[5, 'Bem relacionado'], [10, 'Centro das atenções'], [20, 'Todo mundo conhece'], [40, 'Eixo do mundo']], 'epica');
serie('teia', 'conflitosAtivos', '⚔', (a) => `Mantenha ${s(a, 'conflito', 'conflitos')} com dois lados definidos.`, [[1, 'Dois lados'], [3, 'Frentes de batalha'], [8, 'Tensão em toda parte']], 'rara');

// ------------------------------------------------------------------ tempo e mapas

serie('tempo', 'datas', '⧗', (a) => `Registre ${s(a, 'data', 'datas')} na linha do tempo.`, [[1, 'Marco zero'], [10, 'Calendário em uso'], [25, 'Cronologia'], [75, 'Historiador'], [200, 'Anais completos'], [500, 'Cada dia importa']]);
serie('tempo', 'spanAnos', '∞', (a) => `Cubra ${s(a, 'ano', 'anos')} de história.`, [[10, 'Uma década'], [100, 'Um século'], [1000, 'Um milênio'], [10000, 'Antes da escrita'], [100000, 'Tempo profundo'], [1000000, 'Eras geológicas']]);
serie('tempo', 'marcadores', '⚑', (a) => `Coloque ${s(a, 'marcador', 'marcadores')} nos mapas de um mundo.`, [[1, 'Aqui!'], [10, 'Pontos de interesse'], [50, 'Mapa cheio'], [150, 'Nada escapa ao atlas'], [400, 'Cada pedra tem nome']]);

// ------------------------------------------------------------------ histórias

serie('historias', 'palavrasHistoria', '❡', (a) => `Escreva ${s(a, 'palavra', 'palavras')} numa só história.`, [[1000, 'Primeiro capítulo'], [7500, 'Conto completo'], [20000, 'Novela curta'], [50000, 'Romance à vista'], [80000, 'Romance de verdade'], [120000, 'Calhamaço'], [250000, 'Épico de peso']]);
serie('historias', 'cenasProntas', '✓', (a) => `Deixe ${s(a, 'cena', 'cenas')} com a situação "pronta".`, [[1, 'Cena no ponto'], [10, 'Ato encerrado'], [40, 'Manuscrito avançando'], [100, 'Livro revisado']]);
serie('historias', 'metasHistoria', '⚐', (a) => `Alcance a meta de palavras de ${s(a, 'história', 'histórias')}.`, [[1, 'Fim.'], [3, 'Trilogia concluída'], [7, 'Série completa']]);
serie('historias', 'estruturaCheia', '▤', (a) => `Preencha todas as batidas da estrutura em ${s(a, 'história', 'histórias')}.`, [[1, 'Arquiteto de enredos'], [3, 'Mestre das batidas']], 'epica');

// ------------------------------------------------------------------ oficina

serie('oficina', 'oraculo', '🎲', (a) => `Consulte o oráculo ${s(a, 'vez', 'vezes')}.`, [[1, 'Pergunte aos dados'], [10, 'Freguês do oráculo'], [50, 'Os dados decidem'], [150, 'Devoto do acaso'], [500, 'Sumo sacerdote dos dados']]);
serie('oficina', 'respostas', '❝', (a) => `Responda a ${s(a, 'pergunta', 'perguntas')} em entrevistas.`, [[1, 'Primeira resposta'], [10, 'Bom de conversa'], [50, 'Repórter investigativo'], [150, 'Psicólogo de personagens'], [500, 'Conhece todo mundo por dentro']]);
serie('oficina', 'missoes', '◎', (a) => `Cumpra ${s(a, 'missão', 'missões')} do dia.`, [[1, 'Missão dada'], [10, 'Missão cumprida'], [50, 'Agente de campo'], [150, 'Veterano de missões'], [365, 'Um ano de serviço'], [1000, 'Comandante geral']]);
serie('oficina', 'diasCheios', '◉', (a) => `Cumpra as três missões em ${s(a, 'dia', 'dias')}.`, [[1, 'Dia completo'], [7, 'Semana impecável'], [30, 'Mês impecável'], [100, 'Disciplina absoluta']]);
serie('oficina', 'checks', '☑', (a) => `Marque ${s(a, 'item', 'itens')} dos checklists.`, [[1, 'Primeiro visto'], [15, 'Lista em dia'], [40, 'Construtor metódico'], [70, 'Quase tudo pensado']]);
serie('oficina', 'listas', '☰', (a) => `Complete ${s(a, 'checklist', 'checklists')} inteiros.`, [[1, 'Lista fechada'], [4, 'Fundações sólidas'], [8, 'Quase auditado'], [11, 'Mundo auditado']]);
serie('oficina', 'elementos', '▦', (a) => `Cubra ${a} elementos da tabela do mundo.`, [[5, 'Primeiros elementos'], [20, 'Tabela em cores'], [50, 'Metade da tabela'], [90, 'Quase tudo aceso']]);
serie('oficina', 'familias', '▧', (a) => `Cubra ${s(a, 'família', 'famílias')} inteiras de elementos.`, [[1, 'Família completa'], [5, 'Clã de elementos'], [10, 'Dinastia de assuntos'], [16, 'Tabela periódica do mundo']]);

const CHECK_NOMES: Record<string, string> = {
  fundacao: 'Alicerce firme', geografia: 'A terra manda', povos: 'Gente de verdade', poder: 'Quem manda aqui', economia: 'Siga o dinheiro', fe: 'Fé e mitos',
  magia: 'Regras claras', historia: 'Cicatrizes do passado', personagens: 'Elenco completo', escrita: 'Do mundo para a página', consistencia: 'Sem furos',
};
for (const c of CHECKLISTS) {
  out.push({ id: `lista.${c.id}`, nome: CHECK_NOMES[c.id] ?? c.titulo, desc: `Complete o checklist "${c.titulo}".`, grupo: 'oficina', raridade: 'rara', glifo: '☑', metrica: `lista.${c.id}`, alvo: 1 });
}
for (const f of ELEMENT_FAMILIES) {
  out.push({ id: `fam.${f.id}`, nome: `Mestre: ${f.label}`, desc: `Cubra todos os elementos de ${f.label.toLowerCase()}.`, grupo: 'oficina', raridade: 'rara', glifo: '▧', metrica: `fam.${f.id}`, alvo: 1 });
}

// ------------------------------------------------------------------ gêneros

for (const g of GENEROS) {
  if (g.id === 'livre') continue;
  out.push({ id: `gen.${g.id}`, nome: `Autor de ${g.label.toLowerCase()}`, desc: `Tenha um mundo de ${g.label.toLowerCase()} com 10 fichas.`, grupo: 'generos', raridade: 'incomum', glifo: g.glifo, metrica: `gen.${g.id}`, alvo: 1 });
  out.push({ id: `gen3.${g.id}`, nome: `Referência em ${g.label.toLowerCase()}`, desc: `Leve um mundo de ${g.label.toLowerCase()} até a última era.`, grupo: 'generos', raridade: 'lendaria', glifo: g.glifo, metrica: `gen3.${g.id}`, alvo: 1 });
}
serie('generos', 'generos', '✧', (a) => `Construa mundos em ${s(a, 'gênero', 'gêneros')} diferentes.`, [[2, 'Dois chapéus'], [3, 'Versátil'], [5, 'Sem rótulo'], [8, 'Camaleão literário'], [14, 'Toda a estante']]);
serie('generos', 'mundos', '◍', (a) => `Crie ${s(a, 'mundo', 'mundos')}.`, [[1, 'Faça-se o mundo'], [2, 'Um sistema solar'], [3, 'Trindade de mundos'], [5, 'Pequena galáxia'], [10, 'Criador em série']]);

// ------------------------------------------------------------------ marcos

serie('marcos', 'nivel', '▲', (a) => `Leve um mundo ao nível ${a}.`, [[2, 'Primeiro passo'], [5, 'Pegando forma'], [10, 'Mundo de verdade'], [15, 'Terra firme'], [20, 'Vinte luas'], [30, 'Maturidade'], [40, 'Peso próprio'], [50, 'Meio século de níveis'], [65, 'Além do mapa'], [80, 'Quase mítico'], [99, 'Absoluto']]);
serie('marcos', 'era', '◐', (a) => `Alcance a ${a + 1}ª era num mundo.`, [[1, 'Segunda era'], [2, 'Terceira era'], [3, 'Quarta era'], [4, 'Quinta era'], [5, 'Sexta era'], [6, 'O mundo despertou']]);
serie('marcos', 'total', '🏆', (a) => `Desbloqueie ${a} conquistas.`, [[5, 'Colecionador'], [15, 'Prateleira nova'], [30, 'Sala de troféus'], [60, 'Ala inteira'], [100, 'Cem medalhas'], [175, 'Museu do autor'], [250, 'Lenda da guilda'], [350, 'Completista']]);

// ------------------------------------------------------------------ segredos

const secreta = (id: string, nome: string, desc: string, raridade: Raridade = 'rara', glifo = '?') => {
  out.push({ id: `s.${id}`, nome, desc, grupo: 'segredos', raridade, glifo, metrica: `s.${id}`, alvo: 1, secreta: true });
};

secreta('madrugada', 'Coruja literária', 'Escreveu entre 3h e 5h da manhã.', 'incomum', '🦉');
secreta('alvorada', 'Clube das cinco', 'Escreveu antes das 7h da manhã.', 'incomum', '🌅');
secreta('almoco', 'Marmita e metáforas', 'Escreveu na hora do almoço.', 'comum', '🍱');
secreta('natal', 'Ceia de capítulos', 'Escreveu no Natal.', 'rara', '🎄');
secreta('virada', 'Resolução de ano novo', 'Escreveu na virada do ano.', 'rara', '🎆');
secreta('bissexto', 'Uma vez a cada quatro anos', 'Escreveu num 29 de fevereiro.', 'lendaria', '📅');
secreta('sexta13', 'Azar de quem?', 'Escreveu numa sexta-feira 13.', 'rara', '🐈‍⬛');
secreta('halloween', 'Doces ou capítulos', 'Escreveu no Dia das Bruxas.', 'rara', '🎃');
secreta('favorito', 'Matei meu favorito', 'A ficha mais ligada do mundo está morta.', 'epica', '🥀');
secreta('massacre', 'Autor sem coração', 'Dez personagens de um mundo já morreram.', 'rara', '⚰');
secreta('imortais', 'Aqui ninguém morre', 'Vinte personagens e nenhum morto.', 'incomum', '💊');
secreta('dinastia', 'Árvore genealógica', 'Três gerações ligadas por pai ou mãe.', 'rara', '🌳');
secreta('ouroboros', 'Sou meu próprio avô', 'Dois personagens são pais um do outro.', 'epica', '🐍');
secreta('familia', 'Assuntos de família', 'Alguém é inimigo do próprio pai ou da própria mãe.', 'incomum', '🗡');
secreta('triangulo', 'Triângulo amoroso', 'Duas pessoas têm o mesmo cônjuge.', 'incomum', '💔');
secreta('orfaos', 'Orfanato narrativo', 'Dez personagens sem pai nem mãe registrados.', 'comum', '🧸');
secreta('xara', 'Todo mundo se chama Kael', 'Três personagens com o mesmo primeiro nome.', 'incomum', '🪪');
secreta('apostrofo', "K'th'ulhar da Silva", 'Um nome com dois apóstrofos ou mais.', 'incomum', "'");
secreta('nomegigante', 'Nome completo, por favor', 'Uma ficha com mais de 40 letras no nome.', 'incomum', '📛');
secreta('palindromo', 'Ana, Otto, Natan', 'Uma ficha cujo nome é um palíndromo.', 'rara', '↔');
secreta('pergunta', 'Quem é você?', 'Uma ficha cujo nome termina em interrogação.', 'comum', '❓');
secreta('emoji', 'Hieróglifo moderno', 'Uma ficha com emoji no nome.', 'comum', '😶');
secreta('gato', 'Todo mundo precisa de um gato', 'Uma ficha sobre um gato.', 'comum', '🐈');
secreta('dragao', 'Tem que ter dragão', 'Uma criatura com "dragão" no nome.', 'comum', '🐉');
secreta('taverna', 'Vocês se conhecem numa taverna', 'Um lugar que é taverna, estalagem ou bar.', 'comum', '🍺');
secreta('anel', 'Um anel, claro', 'Um item com "anel" no nome.', 'comum', '💍');
secreta('espadalendaria', 'Tirada da pedra', 'Um item de raridade lendária.', 'incomum', '🗡');
secreta('fimdomundo', 'Acabou, pessoal', 'Um evento chamado fim do mundo ou apocalipse.', 'incomum', '☄');
secreta('profecia', 'Eu avisei', 'Uma profecia marcada como cumprida.', 'rara', '🔮');
secreta('deusex', 'Deus ex machina', 'Uma divindade citada numa cena.', 'incomum', '⚡');
secreta('eraumavez', 'Clássico é clássico', 'Um texto que começa com "Era uma vez".', 'comum', '📖');
secreta('tempestuosa', 'Era uma noite escura', 'Abriu um texto com a noite escura e tempestuosa.', 'rara', '⛈');
secreta('tolstoi', 'Ficha ou romance russo?', 'Uma única ficha com 5.000 palavras.', 'epica', '📚');
secreta('haicai', 'Haicai de ficha', 'Uma ficha com exatamente 17 palavras.', 'rara', '🌸');
secreta('doenca', 'Doença do construtor de mundos', 'Cinquenta fichas e nenhuma cena.', 'rara', '🤒');
secreta('cartografia', 'Só mais um mapa', 'Cinco mapas e nenhuma história.', 'incomum', '🗺');
secreta('sonomes', 'Só os nomes', 'Vinte fichas sem uma palavra de texto.', 'comum', '📇');
secreta('canone', 'Cânone impecável', 'Cinquenta fichas e nenhuma contradição.', 'epica', '⚖');
secreta('viagem', 'Viagem no tempo acidental', 'A revisão achou uma contradição de datas.', 'comum', '🕰');
secreta('centenario', 'Bem conservado', 'Um personagem com mais de 200 anos.', 'incomum', '🧓');
secreta('dobrodaaposta', 'Sorte de principiante', 'Tirou um extremo favorável no oráculo.', 'incomum', '🍀');
secreta('azar', 'Os dados te odeiam', 'Tirou um extremo desastroso no oráculo.', 'incomum', '💀');
secreta('desapareceu', 'Puf!', 'Parou de escrever e o sprint desapareceu.', 'comum', '💨');
secreta('triz', 'Por um triz', 'Quase desapareceu, mas voltou a escrever a tempo.', 'rara', '😰');
secreta('volta', 'A volta por cima', 'Perdeu uma sequência de 7 dias e recomeçou.', 'rara', '🔄');
secreta('recordista', 'Superou a si mesmo', 'Bateu o próprio recorde de sprint cinco vezes.', 'rara', '📈');

export const CONQUISTAS: readonly Conquista[] = out;

// ------------------------------------------------------------------ métricas

export type Metricas = Record<string, number>;

const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const prop = (e: Entity, k: string) => {
  const key = Object.keys(e.props).find((p) => fold(p) === fold(k));
  return key ? asText(e.props[key]).trim() : '';
};
const rel =(e: Entity, ...labels: string[]) => e.relations.filter((r) => r.to && labels.includes(fold(r.label))).map((r) => r.to!);
const morta = (e: Entity) => !!prop(e, 'morte') || /mort[oa]|falecid/i.test(prop(e, 'status'));

/** Mede um mundo. Lê as notas só para o que não está no índice (checklists e marcadores). */
export function medirMundo(w: World, ler: (path: string) => string): Metricas {
  const m: Metricas = {};
  const flag = (k: string, v: boolean) => { if (v) m[k] = 1; };
  const fichas = w.entities.filter((e) => !NON_CARD_TYPES.has(e.type));
  const pessoas = w.entities.filter((e) => e.type === 'personagem');
  const conta = new Map<string, number>();
  for (const e of w.entities) conta.set(e.type, (conta.get(e.type) ?? 0) + 1);
  for (const [t, n] of conta) m[`n.${t}`] = n;
  m.tiposUsados = conta.size;
  m.fichas = fichas.length;
  m.palavrasMundo = w.entities.reduce((a, e) => a + e.words, 0);
  m.ligacoes = new Set(w.relations.filter((r) => r.to).map((r) => `${r.from}>${r.to}`)).size;

  const prof = profundidades(w);
  const graus = [...prof.values()];
  m.incomuns = graus.filter((p) => p.raridade !== 'comum').length;
  m.raras = graus.filter((p) => ['rara', 'epica', 'lendaria'].includes(p.raridade)).length;
  m.epicas = graus.filter((p) => ['epica', 'lendaria'].includes(p.raridade)).length;
  m.lendarias = graus.filter((p) => p.raridade === 'lendaria').length;
  m.maisLigada = graus.reduce((a, p) => Math.max(a, p.ligacoes), 0);
  m.conflitosAtivos = w.entities.filter((e) => e.type === 'conflito' && e.relations.filter((r) => r.to && fold(r.label) === 'lados').length >= 2).length;

  const tl = timeline(w);
  m.datas = tl.length;
  if (tl.length) m.spanAnos = Math.round(Math.max(...tl.map((t) => t.end ?? t.at)) - Math.min(...tl.map((t) => t.at)));
  m.marcadores = w.entities.filter((e) => e.type === 'mapa').reduce((a, e) => a + readMarkers(ler(e.path)).length, 0);

  const hist = storyIndex(w);
  m.palavrasHistoria = hist.reduce((a, h) => Math.max(a, h.words), 0);
  m.cenasProntas = hist.reduce((a, h) => a + h.scenes.filter((c) => c.status === 'pronta').length, 0);
  m.metasHistoria = hist.filter((h) => h.goal && h.words >= h.goal).length;
  m.estruturaCheia = hist.filter((h) => h.sheet && h.sheet.beats.every((b) => h.scenes.some((c) => c.beat === b.nome))).length;

  const cov = elementCoverage(w);
  m.elementos = cov.filter((c) => c.level === 'iniciado' || c.level === 'vivo').length;
  const fams = familyCoverage(cov).filter((f) => f.total > 0 && f.done === f.total);
  m.familias = fams.length;
  for (const f of fams) m[`fam.${f.family.id}`] = 1;

  const marcados = w.path ? readChecks(ler(w.path)) : new Set<string>();
  m.checks = CHECKLISTS.reduce((a, c) => a + c.itens.filter((i) => marcados.has(i)).length, 0);
  const cheias = CHECKLISTS.filter((c) => c.itens.every((i) => marcados.has(i)));
  m.listas = cheias.length;
  for (const c of cheias) m[`lista.${c.id}`] = 1;

  // ---- segredos
  const nomeDe = (e: Entity) => fold(e.name);
  const temNome = (t: string[], re: RegExp) => w.entities.some((e) => t.includes(e.type) && re.test(nomeDe(e)));
  const maisLigada = [...prof.entries()].filter(([, p]) => p.ligacoes >= 3).sort((a, b) => b[1].ligacoes - a[1].ligacoes)[0];
  const fav = maisLigada && w.entities.find((e) => e.path === maisLigada[0]);
  flag('s.favorito', !!fav && fav.type === 'personagem' && morta(fav));
  const mortos = pessoas.filter(morta).length;
  flag('s.massacre', mortos >= 10);
  flag('s.imortais', pessoas.length >= 20 && mortos === 0);

  const pais = new Map(pessoas.map((e) => [e.path, rel(e, 'pai', 'mae')]));
  const geracoes = (p: string, vistos = new Set<string>()): number => {
    if (vistos.has(p)) return 0;
    vistos.add(p);
    return 1 + Math.max(0, ...(pais.get(p) ?? []).map((x) => geracoes(x, new Set(vistos))));
  };
  flag('s.dinastia', pessoas.some((e) => geracoes(e.path) >= 3));
  flag('s.ouroboros', pessoas.some((e) => (pais.get(e.path) ?? []).some((p) => (pais.get(p) ?? []).includes(e.path))));
  flag('s.familia', pessoas.some((e) => { const f = pais.get(e.path) ?? []; return rel(e, 'inimigos', 'inimigo').some((x) => f.includes(x)); }));
  const conjuges = pessoas.flatMap((e) => rel(e, 'conjuge'));
  flag('s.triangulo', new Set(conjuges).size < conjuges.length);
  flag('s.orfaos', pessoas.filter((e) => !prop(e, 'pai') && !prop(e, 'mãe')).length >= 10);
  const primeiros = new Map<string, number>();
  for (const e of pessoas) { const n = nomeDe(e).split(/\s+/)[0]!; primeiros.set(n, (primeiros.get(n) ?? 0) + 1); }
  flag('s.xara', [...primeiros.values()].some((n) => n >= 3));
  flag('s.apostrofo', w.entities.some((e) => (e.name.match(/['’]/g) ?? []).length >= 2));
  flag('s.nomegigante', w.entities.some((e) => e.name.length > 40));
  flag('s.palindromo', w.entities.some((e) => { const l = nomeDe(e).replace(/[^\p{L}]/gu, ''); return l.length >= 4 && l === [...l].reverse().join(''); }));
  flag('s.pergunta', w.entities.some((e) => e.name.trim().endsWith('?')));
  flag('s.emoji', w.entities.some((e) => /\p{Extended_Pictographic}/u.test(e.name)));
  flag('s.gato', w.entities.some((e) => /\bgat[oa]s?\b/.test(nomeDe(e))));
  flag('s.dragao', temNome(['criatura', 'especie'], /dragao|dragoes/));
  flag('s.taverna', temNome(['lugar'], /taverna|estalagem|\bbar\b|cantina/));
  flag('s.anel', temNome(['item'], /\banel\b/));
  flag('s.espadalendaria', w.entities.some((e) => e.type === 'item' && /lendari/.test(fold(prop(e, 'raridade')))));
  flag('s.fimdomundo', temNome(['evento', 'conflito'], /fim do mundo|apocalipse/));
  flag('s.profecia', w.entities.some((e) => e.type === 'profecia' && /cumprid/.test(fold(prop(e, 'status')))));
  const deuses = new Set(w.entities.filter((e) => e.type === 'divindade').map((e) => e.path));
  flag('s.deusex', w.entities.some((e) => e.type === 'cena' && e.relations.some((r) => r.to && deuses.has(r.to))));
  flag('s.eraumavez', w.entities.some((e) => /^era uma vez/.test(fold(e.summary))));
  flag('s.tempestuosa', w.entities.some((e) => /noite escura e tempestuosa/.test(fold(e.summary))));
  flag('s.tolstoi', fichas.some((e) => e.words >= 5000));
  flag('s.haicai', fichas.some((e) => e.words === 17));
  flag('s.doenca', fichas.length >= 50 && !conta.get('cena'));
  flag('s.cartografia', (conta.get('mapa') ?? 0) >= 5 && !conta.get('historia'));
  flag('s.sonomes', fichas.filter((e) => e.words === 0).length >= 20);
  const revisao = reviewWorld(w);
  flag('s.canone', fichas.length >= 50 && !revisao.some((i) => i.level === 'erro'));
  flag('s.viagem', revisao.some((i) => i.level === 'erro'));
  flag('s.centenario', pessoas.some((e) => {
    const a = tl.find((t) => t.path === e.path && t.end !== undefined);
    return !!a && a.end! - a.at > 200;
  }));
  return m;
}

/** Junta os mundos (vale o melhor de cada métrica) e soma a atividade do autor. */
export function medirAutor(worlds: World[], ler: (path: string) => string, r: RegistroAparelho, hoje: string): Metricas {
  const m: Metricas = {};
  const generos = new Set<string>();
  for (const w of worlds) {
    const mw = medirMundo(w, ler);
    for (const [k, v] of Object.entries(mw)) m[k] = Math.max(m[k] ?? 0, v);
    const e = estadoDoMundo(w, atividadeDoMundo(r, w.name, pontosDoMundo(r, w.name)));
    m.nivel = Math.max(m.nivel ?? 0, e.nivel.nivel);
    m.era = Math.max(m.era ?? 0, e.indiceEra);
    if ((mw.fichas ?? 0) >= 10) {
      const g = generoDoMundo(w).id;
      if (g !== 'livre') {
        generos.add(g);
        m[`gen.${g}`] = 1;
        if (e.indiceEra >= 6) m[`gen3.${g}`] = 1;
      }
    }
  }
  m.generos = generos.size;
  m.mundos = worlds.length;

  const dias = Object.values(r.dias).map((mundos) => Object.values(mundos).reduce((a, c) => a + (c.palavras ?? 0), 0));
  m.palavras = dias.reduce((a, b) => a + b, 0);
  m.melhorDia = dias.reduce((a, b) => Math.max(a, b), 0);
  m.diasAtivos = dias.filter((d) => d > 0).length;

  const seq = calcularSequencia(diasCumpridos(r), hoje);
  m.seqMelhor = seq.melhor;
  m.escudosUsados = seq.protegidos.length;
  for (const k of ['sprints', 'duros', 'dobro', 'oraculo', 'respostas']) m[k] = somarContador(r, k);
  m['rec.ppm'] = r.recordes.ppm ?? 0;
  m['rec.sprint'] = r.recordes.sprint ?? 0;
  m['marca.fimdesemana'] = somarContador(r, 'fimdesemana');
  for (const k of ['madrugada', 'alvorada', 'almoco', 'natal', 'virada', 'bissexto', 'sexta13', 'halloween', 'desapareceu', 'triz']) if (somarContador(r, k) > 0) m[`s.${k}`] = 1;
  if (somarContador(r, 'sorte') > 0) m['s.dobrodaaposta'] = 1;
  if (somarContador(r, 'azar') > 0) m['s.azar'] = 1;
  if (somarContador(r, 'recordes') >= 5) m['s.recordista'] = 1;
  if (seq.melhor >= 7 && seq.atual >= 1 && seq.atual < seq.melhor) m['s.volta'] = 1;

  let missoes = 0;
  let cheios = 0;
  for (const mundos of Object.values(r.missoes)) {
    for (const d of Object.values(mundos)) {
      missoes += d.feitas.length;
      if (d.lista.length && d.feitas.length >= d.lista.length) cheios++;
    }
  }
  m.missoes = missoes;
  m.diasCheios = cheios;
  m.total = Object.keys(r.conquistas).length;
  return m;
}

/** Pontos das conquistas registradas num mundo. */
export function pontosDoMundo(r: RegistroAparelho, mundo: string): number {
  let n = 0;
  for (const [id, c] of Object.entries(r.conquistas)) {
    if (c.mundo !== mundo) continue;
    const def = POR_ID.get(id);
    if (def) n += XP_DA_RARIDADE[def.raridade];
  }
  return n;
}

const POR_ID = new Map(CONQUISTAS.map((c) => [c.id, c]));
export const conquistaPorId = (id: string): Conquista | undefined => POR_ID.get(id);

/** Conquistas que a medição alcança e que ainda não estão em `tem`. */
export function novasConquistas(m: Metricas, tem: ReadonlySet<string>): Conquista[] {
  const novas = CONQUISTAS.filter((c) => c.metrica !== 'total' && !tem.has(c.id) && (m[c.metrica] ?? 0) >= c.alvo);
  // as conquistas de coleção contam também as que acabaram de entrar
  const total = tem.size + novas.length;
  const colecao = CONQUISTAS.filter((c) => c.metrica === 'total' && !tem.has(c.id) && total >= c.alvo);
  return [...novas, ...colecao];
}
