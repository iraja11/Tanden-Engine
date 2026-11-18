/*
 * Biblioteca de exercícios para fazer em casa.
 *
 * Tudo cabe numa sala: o equipamento é peso do corpo ou o que já existe na casa
 * (cadeira, parede, sofá, degrau, toalha, mochila, garrafas, mesa). Cada movimento
 * diz se faz barulho (para não incomodar o vizinho de baixo), quais articulações
 * costuma incomodar e tem o passo a passo que a tela mostra durante o treino.
 */
import type { Limit } from '../saude/exercicios';

export type MoveArea = 'pernas' | 'gluteos' | 'peito' | 'costas' | 'ombros' | 'bracos' | 'core' | 'cardio' | 'mobilidade' | 'alongamento' | 'sentado';

export const MOVE_AREAS: Array<{ id: MoveArea; label: string }> = [
  { id: 'pernas', label: 'Pernas' },
  { id: 'gluteos', label: 'Glúteos' },
  { id: 'peito', label: 'Peito' },
  { id: 'costas', label: 'Costas' },
  { id: 'ombros', label: 'Ombros' },
  { id: 'bracos', label: 'Braços' },
  { id: 'core', label: 'Abdômen' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'mobilidade', label: 'Mobilidade' },
  { id: 'alongamento', label: 'Alongamento' },
  { id: 'sentado', label: 'Na cadeira' },
];

export type HomeProp = 'cadeira' | 'parede' | 'sofa' | 'degrau' | 'toalha' | 'mochila' | 'garrafas' | 'mesa';

export const HOME_PROPS: Array<{ id: HomeProp; label: string }> = [
  { id: 'cadeira', label: 'Cadeira firme' },
  { id: 'parede', label: 'Parede livre' },
  { id: 'sofa', label: 'Sofá ou cama' },
  { id: 'degrau', label: 'Degrau ou escada' },
  { id: 'toalha', label: 'Toalha' },
  { id: 'mochila', label: 'Mochila com peso' },
  { id: 'garrafas', label: 'Garrafas de água' },
  { id: 'mesa', label: 'Mesa bem firme' },
];

/** Desenho animado que acompanha o movimento na tela do treino. */
export type MoveFigure =
  | 'agachar' | 'afundo' | 'panturrilha' | 'marcha' | 'polichinelo' | 'boxe' | 'inclinar' | 'remada' | 'rosca' | 'elevar'
  | 'flexao' | 'flexao-parede' | 'prancha' | 'prancha-lateral' | 'escalador' | 'ponte' | 'quatro-apoios' | 'gato'
  | 'abdominal' | 'deitado-pernas' | 'superman' | 'mergulho' | 'cadeira-parede' | 'sentado' | 'along-frente' | 'crianca' | 'torcao' | 'em-pe';

export interface HomeMove {
  id: string;
  name: string;
  area: MoveArea;
  /** 1 iniciante, 2 intermediário, 3 avançado */
  level: 1 | 2 | 3;
  fig: MoveFigure;
  /** gasto relativo ao repouso (MET), para estimar calorias */
  met: number;
  steps: string[];
  /** erro comum ou cuidado */
  tip?: string;
  props?: HomeProp[];
  avoid?: Limit[];
  /** tem salto ou pisada forte */
  noisy?: boolean;
  /** um lado de cada vez: a tela avisa a hora de trocar */
  sides?: boolean;
  easier?: string;
  harder?: string;
}

type Extra = Partial<Pick<HomeMove, 'tip' | 'props' | 'avoid' | 'noisy' | 'sides' | 'easier' | 'harder'>>;

const M = (id: string, name: string, area: MoveArea, level: 1 | 2 | 3, fig: MoveFigure, met: number, steps: string[], extra: Extra = {}): HomeMove =>
  ({ id, name, area, level, fig, met, steps, ...extra });

export const HOME_MOVES: HomeMove[] = [
  // pernas
  M('sentar-levantar', 'Sentar e levantar da cadeira', 'pernas', 1, 'agachar', 3.5, ['Fique de pé em frente à cadeira, pés na largura do quadril.', 'Desça devagar até encostar no assento e levante empurrando o chão.'], { props: ['cadeira'], tip: 'Não se jogue na cadeira: controle a descida.', harder: 'agachamento' }),
  M('agachamento', 'Agachamento', 'pernas', 1, 'agachar', 5, ['Pés na largura dos ombros, pontas levemente para fora.', 'Leve o quadril para trás e para baixo, peito aberto.', 'Suba empurrando o chão com o pé inteiro.'], { avoid: ['joelho'], tip: 'Joelhos seguem a direção dos pés.', easier: 'sentar-levantar', harder: 'agachamento-pausa' }),
  M('agachamento-sumo', 'Agachamento sumô', 'pernas', 1, 'agachar', 5, ['Pés bem afastados, pontas para fora.', 'Desça com o tronco alto e suba apertando os glúteos.'], { avoid: ['joelho'] }),
  M('agachamento-pausa', 'Agachamento com pausa', 'pernas', 2, 'agachar', 5.5, ['Desça em 3 segundos.', 'Segure 2 segundos embaixo e suba com firmeza.'], { avoid: ['joelho'], easier: 'agachamento', harder: 'agachamento-mochila' }),
  M('agachamento-mochila', 'Agachamento com mochila', 'pernas', 2, 'agachar', 6, ['Abrace a mochila com peso junto ao peito.', 'Agache mantendo o tronco alto e suba.'], { props: ['mochila'], avoid: ['joelho'], easier: 'agachamento-pausa' }),
  M('afundo-tras', 'Afundo para trás', 'pernas', 1, 'afundo', 5, ['Dê um passo longo para trás e desça o joelho perto do chão.', 'Volte empurrando com o pé da frente.'], { sides: true, avoid: ['joelho'], tip: 'Tronco reto, sem bater o joelho no chão.', harder: 'bulgaro-sofa' }),
  M('afundo-lateral', 'Afundo lateral', 'pernas', 2, 'afundo', 5, ['Dê um passo largo para o lado e sente o quadril para trás.', 'A outra perna fica esticada. Volte ao centro.'], { sides: true, avoid: ['joelho'] }),
  M('bulgaro-sofa', 'Agachamento búlgaro no sofá', 'pernas', 2, 'afundo', 6, ['Apoie o peito de um pé no sofá, atrás de você.', 'Desça com a perna da frente e suba.'], { props: ['sofa'], sides: true, avoid: ['joelho'], easier: 'afundo-tras' }),
  M('subida-degrau', 'Subida no degrau', 'pernas', 1, 'marcha', 6, ['Suba no degrau com o pé inteiro apoiado.', 'Desça devagar, sem pular.'], { props: ['degrau'], sides: true, avoid: ['joelho'] }),
  M('cadeira-parede', 'Cadeirinha na parede', 'pernas', 1, 'cadeira-parede', 4, ['Encoste as costas na parede e deslize até as coxas ficarem quase paralelas ao chão.', 'Segure a posição respirando normalmente.'], { props: ['parede'], avoid: ['joelho'], tip: 'Se doer o joelho, fique mais alto.' }),
  M('panturrilha', 'Elevação de panturrilha', 'pernas', 1, 'panturrilha', 3, ['Fique de pé, com a mão na parede se precisar.', 'Suba na ponta dos pés, segure 1 segundo e desça devagar.'], { harder: 'panturrilha-unilateral' }),
  M('panturrilha-unilateral', 'Panturrilha com uma perna', 'pernas', 2, 'panturrilha', 3.5, ['Apoie só um pé no chão e segure na parede.', 'Suba o máximo que conseguir e desça devagar.'], { sides: true, easier: 'panturrilha' }),
  M('agachamento-unilateral', 'Agachamento de uma perna na cadeira', 'pernas', 3, 'agachar', 6.5, ['De pé em frente à cadeira, levante uma perna.', 'Desça até sentar devagar e suba com a mesma perna.'], { props: ['cadeira'], sides: true, avoid: ['joelho'], easier: 'sentar-levantar' }),

  // glúteos e posteriores
  M('ponte', 'Ponte de glúteo', 'gluteos', 1, 'ponte', 3.5, ['Deite de barriga para cima, joelhos dobrados.', 'Suba o quadril apertando os glúteos e desça devagar.'], { tip: 'Force com os calcanhares, sem arquear a lombar.', harder: 'ponte-unilateral' }),
  M('ponte-unilateral', 'Ponte com uma perna', 'gluteos', 2, 'ponte', 4, ['Na posição da ponte, estique uma perna.', 'Suba o quadril sem deixar ele girar.'], { sides: true, easier: 'ponte', harder: 'elevacao-quadril-sofa' }),
  M('elevacao-quadril-sofa', 'Elevação de quadril no sofá', 'gluteos', 2, 'ponte', 4.5, ['Apoie a parte alta das costas na beira do sofá.', 'Desça o quadril e suba até alinhar com os joelhos.'], { props: ['sofa'], easier: 'ponte' }),
  M('coice', 'Coice em quatro apoios', 'gluteos', 1, 'quatro-apoios', 3.5, ['De quatro, com o joelho dobrado, leve o calcanhar para o teto.', 'Volte devagar sem arquear as costas.'], { sides: true, avoid: ['punho'] }),
  M('hidrante', 'Abertura lateral em quatro apoios', 'gluteos', 1, 'quatro-apoios', 3.5, ['De quatro, abra o joelho para o lado, sem girar o tronco.', 'Volte com controle.'], { sides: true, avoid: ['punho'] }),
  M('abducao-deitado', 'Abdução de perna deitado', 'gluteos', 1, 'deitado-pernas', 3, ['Deite de lado com as pernas esticadas.', 'Suba a perna de cima sem girar o quadril e desça devagar.'], { sides: true }),
  M('concha', 'Concha', 'gluteos', 1, 'deitado-pernas', 2.8, ['Deite de lado com os joelhos dobrados e pés juntos.', 'Abra o joelho de cima como uma concha e feche.'], { sides: true }),
  M('terra-mochila', 'Levantamento terra com mochila', 'gluteos', 2, 'inclinar', 5, ['Segure a mochila à frente das coxas.', 'Leve o quadril para trás com a coluna reta e volte apertando os glúteos.'], { props: ['mochila'], avoid: ['lombar'], tip: 'Coluna sempre neutra: pare antes de arredondar.' }),
  M('bom-dia', 'Inclinação de quadril', 'gluteos', 1, 'inclinar', 3.5, ['Mãos atrás da cabeça, joelhos levemente dobrados.', 'Incline o tronco levando o quadril para trás e volte.'], { avoid: ['lombar'] }),
  M('terra-unilateral', 'Terra de uma perna', 'gluteos', 3, 'inclinar', 4.5, ['Apoiado em uma perna, incline o tronco e leve a outra para trás.', 'Volte devagar, mantendo o equilíbrio.'], { sides: true, avoid: ['lombar'] }),

  // peito e tríceps
  M('flexao-parede', 'Flexão na parede', 'peito', 1, 'flexao-parede', 3, ['Mãos na parede na altura do peito, corpo reto.', 'Dobre os cotovelos até o peito chegar perto e empurre.'], { props: ['parede'], harder: 'flexao-mesa' }),
  M('flexao-mesa', 'Flexão com as mãos na mesa', 'peito', 1, 'flexao-parede', 3.8, ['Mãos na beira de uma mesa firme, corpo em linha reta.', 'Desça o peito até a mesa e empurre.'], { props: ['mesa'], avoid: ['punho'], easier: 'flexao-parede', harder: 'flexao-joelhos' }),
  M('flexao-joelhos', 'Flexão com joelhos no chão', 'peito', 1, 'flexao', 4, ['Mãos abaixo dos ombros, joelhos apoiados.', 'Desça o peito com o corpo reto e empurre.'], { avoid: ['punho'], easier: 'flexao-mesa', harder: 'flexao' }),
  M('flexao', 'Flexão de braço', 'peito', 2, 'flexao', 5, ['Mãos abaixo dos ombros, corpo em linha reta.', 'Desça o peito perto do chão e empurre.'], { avoid: ['punho'], tip: 'Abdômen firme: o quadril não cai.', easier: 'flexao-joelhos', harder: 'flexao-declinada' }),
  M('flexao-fechada', 'Flexão fechada', 'bracos', 3, 'flexao', 5.5, ['Mãos mais próximas que os ombros.', 'Desça com os cotovelos rentes ao corpo e empurre.'], { avoid: ['punho', 'ombro'], easier: 'flexao' }),
  M('flexao-declinada', 'Flexão com pés no sofá', 'peito', 3, 'flexao', 6, ['Apoie os pés no sofá e as mãos no chão.', 'Desça o peito com o corpo reto e empurre.'], { props: ['sofa'], avoid: ['punho', 'ombro'], easier: 'flexao' }),
  M('mergulho-cadeira', 'Mergulho na cadeira', 'bracos', 2, 'mergulho', 4.5, ['Mãos na beira da cadeira, quadril à frente do assento.', 'Dobre os cotovelos para trás e empurre.'], { props: ['cadeira'], avoid: ['ombro', 'punho'], tip: 'Use uma cadeira que não deslize.' }),

  // costas e ombros
  M('superman', 'Super-homem', 'costas', 1, 'superman', 3, ['Deite de bruços, braços à frente.', 'Tire braços e pernas do chão por 2 segundos e desça.'], { avoid: ['lombar'] }),
  M('y-t', 'Y e T de bruços', 'costas', 1, 'superman', 2.8, ['De bruços, levante os braços em forma de Y.', 'Desça, abra em T e levante de novo, juntando as escápulas.'] ),
  M('remada-mochila', 'Remada com mochila', 'costas', 1, 'remada', 4.5, ['Incline o tronco à frente com a coluna reta.', 'Puxe a mochila até a barriga e desça devagar.'], { props: ['mochila'], avoid: ['lombar'] }),
  M('remada-garrafa', 'Remada com garrafas', 'costas', 1, 'remada', 3.8, ['Com uma garrafa em cada mão, incline o tronco.', 'Puxe os cotovelos para trás e junte as escápulas.'], { props: ['garrafas'], avoid: ['lombar'] }),
  M('puxada-toalha', 'Puxada com toalha', 'costas', 1, 'elevar', 3, ['Segure a toalha esticada acima da cabeça, puxando as pontas para fora.', 'Traga a toalha até o peito sem soltar a tensão.'], { props: ['toalha'] }),
  M('remada-mesa', 'Remada invertida na mesa', 'costas', 3, 'remada', 5.5, ['Deite sob uma mesa muito firme e segure a beira.', 'Puxe o peito até a mesa com o corpo reto.'], { props: ['mesa'], avoid: ['ombro'], tip: 'Teste a mesa antes: ela não pode virar.' }),
  M('pulso-bracos', 'Pulsos com braços abertos', 'ombros', 1, 'elevar', 3, ['Abra os braços na altura dos ombros, palmas para baixo.', 'Faça pulsos pequenos para cima, sem baixar os braços.'], { tip: 'Ombros longe das orelhas.' }),
  M('anjo-parede', 'Anjo na parede', 'ombros', 1, 'elevar', 2.5, ['Costas e braços encostados na parede.', 'Deslize os braços para cima e para baixo sem descolar.'], { props: ['parede'] }),
  M('elevacao-lateral', 'Elevação lateral com garrafas', 'ombros', 1, 'elevar', 3.5, ['Garrafas ao lado do corpo, cotovelos levemente dobrados.', 'Suba até a altura dos ombros e desça devagar.'], { props: ['garrafas'], avoid: ['ombro'] }),
  M('desenvolvimento-garrafa', 'Desenvolvimento com garrafas', 'ombros', 1, 'elevar', 4, ['Garrafas na altura dos ombros.', 'Empurre para cima e desça com controle.'], { props: ['garrafas'], avoid: ['ombro'] }),
  M('desenvolvimento-mochila', 'Desenvolvimento com mochila', 'ombros', 2, 'elevar', 4.5, ['Segure a mochila na frente do peito.', 'Empurre acima da cabeça e desça devagar.'], { props: ['mochila'], avoid: ['ombro', 'lombar'] }),
  M('flexao-pike', 'Flexão em V invertido', 'ombros', 3, 'flexao', 5.5, ['Quadril alto, corpo em V invertido.', 'Dobre os cotovelos levando a cabeça ao chão e empurre.'], { avoid: ['ombro', 'punho'] }),

  // braços
  M('rosca-mao', 'Rosca contra a própria mão', 'bracos', 1, 'rosca', 2.8, ['Dobre um braço e segure o punho com a outra mão.', 'Puxe para cima enquanto a outra mão resiste, com força constante.'], { sides: true }),
  M('rosca-garrafa', 'Rosca com garrafas', 'bracos', 1, 'rosca', 3.3, ['Cotovelos colados ao corpo.', 'Dobre os braços e desça devagar.'], { props: ['garrafas'] }),
  M('rosca-mochila', 'Rosca com mochila', 'bracos', 1, 'rosca', 3.8, ['Segure a alça da mochila com as duas mãos.', 'Dobre os cotovelos sem balançar o corpo.'], { props: ['mochila'] }),
  M('rosca-toalha', 'Rosca isométrica com toalha', 'bracos', 1, 'rosca', 2.8, ['Pise no meio da toalha e segure as pontas.', 'Puxe para cima contra o pé, com força constante.'], { props: ['toalha'] }),
  M('triceps-garrafa', 'Tríceps com garrafa', 'bracos', 1, 'elevar', 3.3, ['Segure a garrafa acima da cabeça com as duas mãos.', 'Dobre os cotovelos levando a garrafa atrás da cabeça e estenda.'], { props: ['garrafas'], avoid: ['ombro'] }),

  // abdômen
  M('prancha-joelhos', 'Prancha com joelhos no chão', 'core', 1, 'prancha', 2.8, ['Antebraços e joelhos no chão, corpo reto.', 'Contraia o abdômen e respire.'], { harder: 'prancha' }),
  M('prancha', 'Prancha', 'core', 1, 'prancha', 3.3, ['Antebraços no chão, corpo em linha reta da cabeça aos pés.', 'Aperte abdômen e glúteos e respire.'], { tip: 'Se a lombar reclamar, apoie os joelhos.', easier: 'prancha-joelhos', harder: 'prancha-ombro' }),
  M('prancha-ombro', 'Prancha tocando o ombro', 'core', 2, 'prancha', 4, ['Em prancha alta, toque o ombro oposto.', 'Alterne sem balançar o quadril.'], { avoid: ['punho'], easier: 'prancha' }),
  M('prancha-lateral', 'Prancha lateral', 'core', 2, 'prancha-lateral', 3.3, ['Apoie um antebraço e a lateral do pé.', 'Suba o quadril e mantenha o corpo reto.'], { sides: true, avoid: ['ombro'] }),
  M('dead-bug', 'Inseto morto', 'core', 1, 'deitado-pernas', 3, ['Deite com braços para o teto e joelhos a 90 graus.', 'Estique braço e perna opostos, sem tirar a lombar do chão.'], { tip: 'A lombar fica colada no chão o tempo todo.' }),
  M('perdigueiro', 'Perdigueiro', 'core', 1, 'quatro-apoios', 3, ['De quatro, estique braço e perna opostos.', 'Segure 2 segundos e troque.'], { avoid: ['punho'] }),
  M('abdominal-curto', 'Abdominal curto', 'core', 1, 'abdominal', 3, ['Deite com os joelhos dobrados, mãos ao lado da cabeça.', 'Tire só os ombros do chão e desça devagar.'], { tip: 'Não puxe o pescoço com as mãos.' }),
  M('abdominal-bicicleta', 'Abdominal bicicleta', 'core', 2, 'abdominal', 4.5, ['Deitado, leve o cotovelo ao joelho oposto.', 'Alterne num ritmo controlado.'], { avoid: ['lombar'] }),
  M('elevacao-pernas', 'Elevação de pernas', 'core', 2, 'deitado-pernas', 3.5, ['Deite com as mãos sob o quadril.', 'Suba as pernas e desça sem encostar no chão.'], { avoid: ['lombar'] }),
  M('canoa', 'Canoa', 'core', 3, 'abdominal', 4, ['Deitado, tire ombros e pernas do chão.', 'Segure o corpo em forma de canoa, com a lombar pressionada.'], { avoid: ['lombar'] }),
  M('giro-russo', 'Giro russo', 'core', 2, 'torcao', 4, ['Sente com o tronco inclinado para trás e pés no chão.', 'Gire o tronco de um lado para o outro.'], { avoid: ['lombar'] }),

  // cardio sem impacto
  M('marcha-parada', 'Marcha parada', 'cardio', 1, 'marcha', 3.5, ['Marche no lugar balançando os braços.', 'Suba os joelhos num ritmo confortável.'], { harder: 'joelho-alto' }),
  M('joelho-alto', 'Joelhos altos sem salto', 'cardio', 1, 'marcha', 5, ['Suba um joelho de cada vez até a altura do quadril.', 'Acelere o ritmo sem pular.'], { easier: 'marcha-parada' }),
  M('passo-lateral', 'Passo lateral', 'cardio', 1, 'polichinelo', 4, ['Dê um passo para o lado e junte os pés.', 'Vá de um lado ao outro abrindo os braços.'] ),
  M('polichinelo-sem-salto', 'Polichinelo sem salto', 'cardio', 1, 'polichinelo', 4.5, ['Abra uma perna para o lado enquanto sobe os braços.', 'Volte e troque o lado.'], { harder: 'polichinelo' }),
  M('boxe', 'Boxe no ar', 'cardio', 1, 'boxe', 5, ['Pés afastados, joelhos soltos.', 'Alterne socos para a frente, girando o tronco.'], { avoid: ['ombro'] }),
  M('agachamento-soco', 'Agachamento com soco', 'cardio', 2, 'agachar', 6, ['Agache e, ao subir, solte um soco para a frente.', 'Alterne os braços a cada repetição.'], { avoid: ['joelho'] }),
  M('escalador-lento', 'Escalador lento', 'cardio', 2, 'escalador', 5.5, ['Em prancha alta, leve um joelho ao peito.', 'Volte e troque, sem pular.'], { avoid: ['punho'], harder: 'escalador' }),
  M('patinador-lento', 'Patinador sem salto', 'cardio', 2, 'afundo', 5.5, ['Dê um passo diagonal para trás, cruzando a perna.', 'Troque de lado num ritmo contínuo.'], { avoid: ['joelho'] }),
  M('burpee-sem-salto', 'Burpee sem salto', 'cardio', 2, 'prancha', 6.5, ['Agache, apoie as mãos e leve um pé de cada vez para trás.', 'Volte um pé de cada vez e levante.'], { avoid: ['punho'] }),

  // cardio com impacto
  M('polichinelo', 'Polichinelo', 'cardio', 2, 'polichinelo', 8, ['Salte abrindo pernas e braços.', 'Salte de volta, pousando macio.'], { noisy: true, avoid: ['joelho'], easier: 'polichinelo-sem-salto' }),
  M('corrida-parada', 'Corrida parada', 'cardio', 2, 'marcha', 8, ['Corra no lugar na ponta dos pés.', 'Mantenha os braços ativos.'], { noisy: true, avoid: ['joelho'] }),
  M('escalador', 'Escalador', 'cardio', 3, 'escalador', 8, ['Em prancha alta, alterne os joelhos ao peito.', 'Acelere mantendo o quadril baixo.'], { noisy: true, avoid: ['punho'], easier: 'escalador-lento' }),
  M('agachamento-salto', 'Agachamento com salto', 'cardio', 3, 'agachar', 9, ['Agache e salte para cima.', 'Pouse macio e já desça para o próximo.'], { noisy: true, avoid: ['joelho'], easier: 'agachamento' }),
  M('burpee', 'Burpee', 'cardio', 3, 'prancha', 10, ['Agache, salte os pés para trás e faça uma flexão.', 'Volte com um salto e pule para cima.'], { noisy: true, avoid: ['joelho', 'punho'], easier: 'burpee-sem-salto' }),

  // mobilidade e aquecimento
  M('circulo-bracos', 'Círculos com os braços', 'mobilidade', 1, 'elevar', 2.5, ['Braços abertos, faça círculos pequenos.', 'Aumente aos poucos e inverta o sentido.'] ),
  M('rolar-ombros', 'Rolar os ombros', 'mobilidade', 1, 'em-pe', 2, ['Suba os ombros até as orelhas.', 'Role para trás e para baixo, bem devagar.'] ),
  M('giro-tronco', 'Giro de tronco', 'mobilidade', 1, 'torcao', 2.5, ['Pés afastados, braços soltos.', 'Gire o tronco de um lado para o outro.'] ),
  M('circulo-quadril', 'Círculos com o quadril', 'mobilidade', 1, 'em-pe', 2.5, ['Mãos na cintura.', 'Desenhe círculos largos com o quadril, nos dois sentidos.'] ),
  M('gato-vaca', 'Gato e vaca', 'mobilidade', 1, 'gato', 2.3, ['De quatro, arredonde as costas olhando o umbigo.', 'Depois afunde a coluna olhando à frente.'], { avoid: ['punho'] }),
  M('joelho-peito', 'Joelho ao peito em pé', 'mobilidade', 1, 'marcha', 2.8, ['Abrace um joelho junto ao peito.', 'Solte e troque de perna.'] ),
  M('balanco-perna', 'Balanço de perna', 'mobilidade', 1, 'marcha', 2.8, ['Segure na parede e balance a perna para a frente e para trás.', 'Aumente a amplitude aos poucos.'], { sides: true }),
  M('agachamento-lento', 'Agachamento lento de aquecimento', 'mobilidade', 1, 'agachar', 3, ['Desça só até onde estiver confortável.', 'Suba devagar, soltando o quadril.'], { avoid: ['joelho'] }),
  M('minhoca', 'Caminhada das mãos', 'mobilidade', 2, 'along-frente', 3.5, ['De pé, dobre o tronco e caminhe com as mãos até a prancha.', 'Volte caminhando com as mãos e levante.'], { avoid: ['punho', 'lombar'] }),
  M('abertura-peito', 'Abertura de peito', 'mobilidade', 1, 'elevar', 2.3, ['Abrace o próprio corpo.', 'Abra bem os braços e junte as escápulas.'] ),

  // alongamento
  M('along-frente', 'Alongar posteriores em pé', 'alongamento', 1, 'along-frente', 2, ['Com os joelhos soltos, deixe o tronco cair à frente.', 'Respire fundo sem forçar.'], { avoid: ['lombar'] }),
  M('along-quadriceps', 'Alongar a frente da coxa', 'alongamento', 1, 'em-pe', 2, ['Segure o pé atrás, joelhos próximos.', 'Empurre o quadril levemente à frente.'], { sides: true, avoid: ['joelho'] }),
  M('along-panturrilha', 'Alongar a panturrilha na parede', 'alongamento', 1, 'afundo', 2, ['Mãos na parede, uma perna atrás.', 'Mantenha o calcanhar no chão e incline o corpo.'], { props: ['parede'], sides: true }),
  M('along-peito', 'Alongar o peito na porta', 'alongamento', 1, 'em-pe', 2, ['Apoie o antebraço no batente.', 'Gire o tronco para o lado oposto até sentir o peito.'], { props: ['parede'], sides: true }),
  M('along-crianca', 'Postura da criança', 'alongamento', 1, 'crianca', 2, ['Ajoelhe, sente nos calcanhares e leve os braços à frente.', 'Solte a respiração e relaxe as costas.'], { avoid: ['joelho'] }),
  M('along-borboleta', 'Borboleta', 'alongamento', 1, 'sentado', 2, ['Sente com as solas dos pés juntas.', 'Deixe os joelhos caírem e incline o tronco à frente.'] ),
  M('along-lombar', 'Joelhos ao peito deitado', 'alongamento', 1, 'deitado-pernas', 2, ['Deite e abrace os dois joelhos.', 'Balance suavemente de um lado para o outro.'] ),
  M('along-torcao', 'Torção deitada', 'alongamento', 1, 'deitado-pernas', 2, ['Deite, leve os joelhos para um lado e olhe para o outro.', 'Ombros no chão, respiração lenta.'], { sides: true }),
  M('along-cobra', 'Cobra', 'alongamento', 1, 'superman', 2, ['De bruços, apoie as mãos sob os ombros.', 'Suba o peito sem forçar a lombar.'], { avoid: ['lombar', 'punho'] }),
  M('along-ombro', 'Alongar o ombro', 'alongamento', 1, 'em-pe', 2, ['Cruze um braço à frente do peito.', 'Puxe com a outra mão, ombros baixos.'], { sides: true }),
  M('along-triceps', 'Alongar o tríceps', 'alongamento', 1, 'elevar', 2, ['Leve a mão às costas, cotovelo para cima.', 'Empurre o cotovelo com a outra mão.'], { sides: true, avoid: ['ombro'] }),
  M('along-pescoco', 'Alongar o pescoço', 'alongamento', 1, 'em-pe', 1.8, ['Incline a orelha em direção ao ombro.', 'Respire e deixe o ombro oposto pesar.'], { sides: true }),

  // pausa na cadeira
  M('s-marcha', 'Marcha sentada', 'sentado', 1, 'sentado', 2.3, ['Sente na ponta da cadeira, costas retas.', 'Levante um joelho de cada vez.'], { props: ['cadeira'] }),
  M('s-extensao', 'Estender os joelhos sentado', 'sentado', 1, 'sentado', 2, ['Sentado, estique uma perna e segure 2 segundos.', 'Desça devagar e troque.'], { props: ['cadeira'] }),
  M('s-ombros', 'Encolher e soltar os ombros', 'sentado', 1, 'sentado', 1.8, ['Suba os ombros e segure 3 segundos.', 'Solte de uma vez, expirando.'] ),
  M('s-torcao', 'Torção sentada', 'sentado', 1, 'sentado', 1.8, ['Segure o encosto da cadeira.', 'Gire o tronco devagar para o lado.'], { props: ['cadeira'], sides: true }),
  M('s-pescoco', 'Sim e não com a cabeça', 'sentado', 1, 'sentado', 1.5, ['Olhe para cima e para baixo devagar.', 'Depois olhe para um lado e para o outro.'] ),
  M('s-punhos', 'Girar os punhos', 'sentado', 1, 'sentado', 1.5, ['Entrelace os dedos e gire os punhos.', 'Depois estenda os braços e puxe os dedos para trás.'] ),
  M('s-peito', 'Abrir o peito sentado', 'sentado', 1, 'sentado', 1.8, ['Entrelace as mãos atrás das costas.', 'Abra o peito e olhe levemente para cima.'] ),
  M('s-tornozelo', 'Círculos com os tornozelos', 'sentado', 1, 'sentado', 1.5, ['Levante um pé do chão.', 'Faça círculos nos dois sentidos.'], { sides: true }),
];

const byId = new Map(HOME_MOVES.map((m) => [m.id, m]));
export const homeMoveById = (id: string): HomeMove | undefined => byId.get(id);
