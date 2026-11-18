import { asText } from '../frontmatter';
import type { World } from '../mundo';

/*
 * Gêneros: o que muda quando o mundo é cyberpunk, horror cósmico ou romantasy.
 *
 * O gênero mora na nota do mundo (`gênero: Cyberpunk`), como qualquer outra
 * propriedade, e decide a cara do planeta, os nomes das eras, o vocabulário do
 * progresso, as tabelas do oráculo e as perguntas da entrevista. Nas tabelas,
 * {P}, {P2}, {L}, {F} e {I} viram fichas de verdade: pessoa, outra pessoa,
 * lugar, facção e item (ver `oraculo.ts`).
 */

export interface Era {
  nome: string;
  desc: string;
}

/** Como o planeta do mundo é desenhado. */
export type EstiloPlaneta =
  | 'terra' | 'cristal' | 'coracao' | 'jardim' | 'cidade' | 'abismo' | 'estranho'
  | 'neon' | 'orbital' | 'estelar' | 'ruina' | 'engrenagem' | 'antigo' | 'atual' | 'livre';

export interface Genero {
  id: string;
  label: string;
  desc: string;
  glifo: string;
  /** outros jeitos de escrever o gênero na nota */
  aliases: string[];
  cores: { mar: string; terra: string; luz: string; ar: string };
  estilo: EstiloPlaneta;
  /** nome dos pontos de progresso */
  moeda: string;
  eras: [Era, Era, Era, Era, Era, Era, Era];
  ganchos: string[];
  reviravoltas: string[];
  complicacoes: string[];
  detalhes: string[];
  perguntas: string[];
  /** o que entra no lugar de uma ficha que o mundo ainda não tem */
  vago: { P: string; L: string; F: string; I: string };
}

export const GENEROS: Genero[] = [
  {
    id: 'fantasia', label: 'Fantasia medieval', desc: 'Reinos, espadas, juramentos e magia antiga.', glifo: '⚔', aliases: ['fantasia', 'medieval', 'fantasy', 'espada e magia', 'dark fantasy', 'fantasia sombria'],
    cores: { mar: '#23507a', terra: '#6d8a4a', luz: '#f2c063', ar: '#9fc8e8' }, estilo: 'terra', moeda: 'fagulhas',
    eras: [
      { nome: 'A Primeira Brasa', desc: 'Só uma ideia acesa no escuro.' }, { nome: 'Terras sem Nome', desc: 'O chão existe, mas ninguém o batizou.' },
      { nome: 'As Primeiras Aldeias', desc: 'Há fumaça de chaminé no horizonte.' }, { nome: 'A Era das Coroas', desc: 'Alguém decidiu que manda, e outros discordam.' },
      { nome: 'Tempo de Guerras', desc: 'As fronteiras agora são escritas com sangue.' }, { nome: 'A Era das Lendas', desc: 'Seus nomes já são cantados nas tavernas.' },
      { nome: 'O Mundo Desperto', desc: 'Ele respira sozinho. Você só escuta.' },
    ],
    ganchos: [
      '{P} recebe uma coroa que ninguém deveria ter encontrado.', 'O sino de {L} toca sozinho toda noite desde que {P} voltou da guerra.', '{F} oferece perdão a quem entregar {P} até a próxima lua.',
      '{I} é roubado durante o funeral de quem o protegia.', 'Um mensageiro morre em {L} com o selo de {F} costurado na pele.', '{P} jura vingança contra {P2} e descobre que os dois têm o mesmo sangue.',
    ],
    reviravoltas: ['O rei morto nunca existiu: {F} governa por meio de um impostor.', '{P2} sempre soube e esperou o momento de cobrar a dívida.', 'A profecia fala de {P}, mas foi escrita para justificar um massacre.', '{I} não concede poder: ele guarda algo preso.', 'O inimigo de {L} luta para impedir um mal maior.'],
    complicacoes: ['A ponte que levava a {L} caiu na noite anterior.', 'Um juramento impede {P} de levantar a espada contra {P2}.', 'O inverno chega um mês mais cedo.', 'Os soldados de {F} não recebem há meses e começam a saquear.', 'Alguém no grupo está a serviço de {F}.'],
    detalhes: ['Cheiro de cera queimada e couro molhado.', 'Corvos em silêncio sobre as muralhas.', 'Uma canção de ninar cantada em língua morta.', 'Pão duro partido com a lâmina de uma adaga.', 'Estandartes desbotados batendo contra a pedra.'],
    perguntas: ['A quem você jurou lealdade, e o que quebraria esse juramento?', 'Que história da sua terra você se recusa a contar?', 'O que você faria se a coroa caísse nas suas mãos?'],
    vago: { P: 'um cavaleiro sem senhor', L: 'uma fortaleza esquecida', F: 'uma ordem antiga', I: 'uma relíquia de família' },
  },
  {
    id: 'alta-fantasia', label: 'Alta fantasia', desc: 'Deuses, eras míticas e destinos que movem continentes.', glifo: '✧', aliases: ['alta fantasia', 'high fantasy', 'fantasia epica', 'fantasia épica', 'epic fantasy'],
    cores: { mar: '#27408b', terra: '#7a8fd6', luz: '#ffe9a8', ar: '#c4b5ff' }, estilo: 'cristal', moeda: 'centelhas',
    eras: [
      { nome: 'O Canto Primordial', desc: 'Antes do mundo havia uma nota sustentada.' }, { nome: 'A Forja dos Céus', desc: 'Montanhas ainda quentes das mãos que as fizeram.' },
      { nome: 'O Despertar dos Povos', desc: 'Os primeiros olhos se abrem sob estrelas novas.' }, { nome: 'A Era Dourada', desc: 'Cidades de luz e alianças que parecem eternas.' },
      { nome: 'A Grande Sombra', desc: 'Algo antigo se lembra de que foi traído.' }, { nome: 'A Era dos Heróis', desc: 'Mortais andam onde só deuses ousavam.' },
      { nome: 'A Canção Completa', desc: 'Cada verso do mundo encontrou seu lugar.' },
    ],
    ganchos: [
      'Uma estrela cai sobre {L} e {P} é a única pessoa que consegue tocá-la.', 'Os deuses param de responder às preces no mesmo instante, em todo o mundo.', '{F} desperta {I} depois de mil anos de sono.',
      '{P} sonha com a queda de {L} antes de ela acontecer, com todos os detalhes.', 'O último dragão pede abrigo a {P2}.', 'Um portal se abre em {L} e dele sai alguém que morreu há três eras.',
    ],
    reviravoltas: ['O Senhor das Trevas é a parte da divindade que os deuses arrancaram de si.', '{P} é o receptáculo, não o herói.', '{F} mantém o selo intacto alimentando-o com vidas.', '{I} foi forjado com a alma de quem deveria empunhá-lo.', 'A era dourada foi construída sobre um genocídio apagado das crônicas.'],
    complicacoes: ['A magia falha sempre que {P} está por perto.', 'A travessia até {L} leva anos para quem fica do lado de fora.', 'Dois deuses reclamam a mesma pessoa como escolhida.', 'Cada uso de {I} apaga uma lembrança.', 'O exército aliado exige {L} como pagamento.'],
    detalhes: ['O ar vibra como corda de harpa antes da tempestade.', 'Runas que acendem sob a neve.', 'Torres brancas com escadas gastas por pés que não eram humanos.', 'Silêncio de catedral numa floresta milenar.', 'Duas luas refletidas num lago que não reflete rostos.'],
    perguntas: ['Qual destino foi escrito para você, e você aceita?', 'Que deus você desafiaria se soubesse que venceria?', 'O que sua espécie esqueceu que nunca deveria ter esquecido?'],
    vago: { P: 'um herdeiro da linhagem perdida', L: 'uma cidade de cristal', F: 'um conselho de sábios', I: 'uma lâmina profetizada' },
  },
  {
    id: 'romantasy', label: 'Romantasy', desc: 'Paixão, cortes perigosas e amores que derrubam tronos.', glifo: '❦', aliases: ['romance fantastico', 'romance fantástico', 'fantasia romantica', 'fantasia romântica'],
    cores: { mar: '#4a2356', terra: '#a8476f', luz: '#ffc2d4', ar: '#e8a0c8' }, estilo: 'coracao', moeda: 'suspiros',
    eras: [
      { nome: 'O Primeiro Olhar', desc: 'Nada aconteceu ainda. Tudo já mudou.' }, { nome: 'A Corte das Máscaras', desc: 'Todos sorriem e ninguém diz a verdade.' },
      { nome: 'Inimigos à Mesa', desc: 'Faíscas educadas entre taças de vinho.' }, { nome: 'O Pacto Proibido', desc: 'Um acordo que nenhum dos dois devia assinar.' },
      { nome: 'A Traição', desc: 'O coração era o campo de batalha desde o início.' }, { nome: 'A Coroa e a Chama', desc: 'Amar agora é um ato político.' },
      { nome: 'Para Sempre, Talvez', desc: 'Um mundo inteiro reescrito por duas pessoas.' },
    ],
    ganchos: [
      '{P} é obrigada a se casar com {P2}, a quem jurou matar.', 'Um vínculo mágico liga a vida de {P} à do príncipe inimigo.', '{F} envia {P} para seduzir e destruir o herdeiro de {L}.',
      'Durante o baile em {L}, {P} dança com um desconhecido que conhece seu nome verdadeiro.', '{P} precisa de {I}, e só {P2} sabe onde está, por um preço.', 'Só existe uma cama na estalagem, e os dois querem se matar.',
    ],
    reviravoltas: ['O vínculo nunca foi mágico: era real o tempo inteiro.', '{P2} matou a pessoa que {P} mais amou, e confessa só agora.', 'A rainha de {F} é a mãe que {P} acreditava morta.', 'A maldição só se quebra se um dos amantes esquecer o outro.', '{P2} tinha ordens de matar {P} desde a primeira noite.'],
    complicacoes: ['Um terceiro pretendente tem direito legal à mão de {P}.', 'A corte inteira está observando cada toque.', 'Quanto mais se aproximam, mais o vínculo os fere.', '{F} ameaça revelar uma carta comprometedora.', 'O casamento é daqui a três dias.'],
    detalhes: ['Dedos que demoram um segundo a mais ao entregar a taça.', 'Perfume de jasmim em um corredor proibido.', 'Sussurros atrás de um leque bordado.', 'Uma cicatriz que só uma pessoa viu.', 'Cetim rasgado à luz de velas.'],
    perguntas: ['O que você nunca admitiria sentir por quem deveria odiar?', 'O que você sacrificaria por amor, e o que jamais sacrificaria?', 'Quem conhece a sua versão que ninguém mais vê?'],
    vago: { P: 'uma herdeira relutante', L: 'um palácio de espelhos', F: 'a corte rival', I: 'um anel de compromisso amaldiçoado' },
  },
  {
    id: 'cozy', label: 'Cozy fantasy', desc: 'Chá, vilarejos gentis, padarias mágicas e baixo risco.', glifo: '☕', aliases: ['cozy fantasy', 'fantasia aconchegante', 'aconchegante', 'slice of life'],
    cores: { mar: '#6fb5b0', terra: '#a9c47f', luz: '#ffd98a', ar: '#f6e3c5' }, estilo: 'jardim', moeda: 'biscoitos',
    eras: [
      { nome: 'Uma Chaleira no Fogo', desc: 'A água ainda vai ferver, sem pressa.' }, { nome: 'O Jardim Plantado', desc: 'Tem broto novo perto da cerca.' },
      { nome: 'Vizinhos à Porta', desc: 'Alguém trouxe bolo e ficou para conversar.' }, { nome: 'A Feira da Vila', desc: 'Todo mundo tem uma barraca e uma opinião.' },
      { nome: 'O Inverno Difícil', desc: 'Nada que a comunidade unida não resolva.' }, { nome: 'Histórias à Lareira', desc: 'Os causos já têm três versões.' },
      { nome: 'Lar', desc: 'Um lugar para onde todo mundo quer voltar.' },
    ],
    ganchos: [
      '{P} herda uma padaria em {L} e o forno tem opiniões próprias.', 'Um dragãozinho resfriado aparece no quintal de {P}.', 'A feira da colheita de {L} está sem jurado, e {P} foi escolhida sem querer.',
      '{F} quer comprar a velha estufa, mas ninguém sabe quem é o dono.', '{P} acha {I} dentro de um pote de geleia.', 'Um viajante cansado pede pouso em {L} e não sabe mais voltar para casa.',
    ],
    reviravoltas: ['O rival de {P} só queria um amigo o tempo todo.', 'A receita secreta de {P2} era da avó de {P}.', 'O gato da vila é, tecnicamente, o prefeito há quarenta anos.', '{I} só funciona quando dividido com alguém.', 'As cartas anônimas de carinho vinham de {P2}.'],
    complicacoes: ['Choveu no dia da festa e a tenda voou.', 'A massa não cresce quando {P} está triste.', 'Dois vizinhos disputam o mesmo canteiro de abóboras.', 'O correio trouxe a encomenda errada, e ela está viva.', 'O convidado de honra é alérgico a tudo no cardápio.'],
    detalhes: ['Cheiro de canela e lenha estalando.', 'Meias de lã secando perto do fogão.', 'Um gato dormindo exatamente onde você precisa sentar.', 'Chuva fina no telhado de zinco.', 'Xícaras que não combinam, todas muito amadas.'],
    perguntas: ['Qual é a sua receita de consolo, e quem te ensinou?', 'O que faz deste lugar um lar para você?', 'Que pequena gentileza mudou a sua vida?'],
    vago: { P: 'uma aprendiz de herbalista', L: 'um vilarejo à beira do rio', F: 'a associação de jardineiros', I: 'um caderno de receitas encantado' },
  },
  {
    id: 'super-herois', label: 'Super-heróis contemporâneos', desc: 'Poderes, identidades secretas e cidades em perigo.', glifo: '⚡', aliases: ['super herois', 'super-herois', 'super-heróis', 'super heróis', 'superheroi', 'super-heroi', 'superhero', 'quadrinhos'],
    cores: { mar: '#1d3f8f', terra: '#c23a3a', luz: '#ffd23f', ar: '#6fb7ff' }, estilo: 'cidade', moeda: 'pontos de poder',
    eras: [
      { nome: 'A Origem', desc: 'Um acidente, um laboratório, uma noite estranha.' }, { nome: 'Vigilantes', desc: 'Boatos na internet e vídeos tremidos.' },
      { nome: 'A Primeira Equipe', desc: 'Egos demais para um telhado só.' }, { nome: 'Era de Ouro', desc: 'Capas nos jornais e bonecos nas lojas.' },
      { nome: 'Guerra Civil', desc: 'Os heróis se dividiram, e a cidade pagou a conta.' }, { nome: 'Crise Multiversal', desc: 'A realidade inteira virou campo de batalha.' },
      { nome: 'O Legado', desc: 'Uma nova geração veste os símbolos.' },
    ],
    ganchos: [
      'Um vídeo revela a identidade secreta de {P} ao vivo, em rede nacional.', '{F} oferece curar a mãe de {P} em troca de um único favor.', 'Todos os poderes de {L} somem por exatamente uma hora.',
      '{P} acorda com os poderes de {P2}, que foi encontrado morto.', 'Um herói aposentado volta a {L} para impedir o próprio aprendiz.', 'O governo aprova a lei de registro de superpoderes e {F} começa a caçada.',
    ],
    reviravoltas: ['O maior vilão de {L} financia a equipe há anos.', '{P} causou o acidente que criou seu arqui-inimigo.', '{P2} é um clone que não sabe que é um clone.', 'Os poderes vêm de algo que está cobrando juros agora.', 'O herói morto forjou a própria morte para se infiltrar em {F}.'],
    complicacoes: ['Prova da faculdade e ataque à ponte no mesmo horário.', 'A jornalista de {L} está a uma foto de descobrir tudo.', 'O poder de {P} falha sempre que sente medo.', 'Civis filmam tudo e a opinião pública virou.', 'O seguro não cobre danos causados por heróis.'],
    detalhes: ['Sirenes ao longe e vidro triturado sob as botas.', 'Um uniforme remendado com fita em cima da pia.', 'Neon de lanchonete refletido na capa molhada.', 'O barulho do helicóptero de notícias.', 'Café frio e um hematoma difícil de explicar no trabalho.'],
    perguntas: ['Quem paga o preço da sua identidade secreta?', 'Em que momento você quase matou alguém, e o que te segurou?', 'Se o seu poder sumisse amanhã, quem você seria?'],
    vago: { P: 'uma jovem vigilante', L: 'o centro da metrópole', F: 'uma corporação suspeita', I: 'um protótipo roubado' },
  },
  {
    id: 'horror-cosmico', label: 'Horror cósmico', desc: 'Investigadores, cultos, sanidade em frangalhos e o indizível.', glifo: '◉', aliases: ['horror cosmico', 'cosmic horror', 'lovecraftiano', 'horror', 'terror', 'investigacao', 'investigação'],
    cores: { mar: '#0f2a2c', terra: '#2f4a3f', luz: '#7fffc4', ar: '#3e6b5c' }, estilo: 'abismo', moeda: 'revelações',
    eras: [
      { nome: 'Um Rumor', desc: 'Só uma carta estranha na caixa de correio.' }, { nome: 'Os Primeiros Sinais', desc: 'Os cães da região pararam de latir.' },
      { nome: 'O Arquivo Proibido', desc: 'Alguém arrancou as páginas certas.' }, { nome: 'O Culto', desc: 'Seu vizinho sorri com dentes demais.' },
      { nome: 'A Maré Sobe', desc: 'As estrelas estão quase na posição.' }, { nome: 'O Indizível', desc: 'Você viu, e agora não consegue parar de ver.' },
      { nome: 'Ele Sempre Esteve Aqui', desc: 'Não há mais nada para descobrir. Só para lembrar.' },
    ],
    ganchos: [
      '{P} recebe o diário de um parente que desapareceu em {L}, com data de amanhã.', 'Pescadores de {L} puxam da rede uma estátua que ninguém consegue desenhar.', '{F} compra todas as casas da rua, uma por uma, à noite.',
      'Um paciente do sanatório descreve {L} com detalhes, sem nunca ter saído do quarto.', '{P} encontra {I} e passa a sonhar na mesma língua que {P2}.', 'Há uma porta nova no porão de {L}. Ela sempre esteve lá, garantem todos.',
    ],
    reviravoltas: ['A investigação foi financiada por {F} para encontrar quem pudesse abrir o portal.', '{P} morreu no primeiro capítulo e não percebeu.', 'As anotações em letra estranha são da própria mão de {P}.', 'O ritual não invoca nada: ele acorda o que já está dentro de vocês.', 'A cidade de {L} foi construída para manter algo adormecido.'],
    complicacoes: ['A única testemunha só fala durante o sono.', 'Os relógios de {L} discordam entre si.', 'A polícia local responde a {F}.', 'Cada leitura de {I} custa uma lembrança preciosa.', 'O último trem partiu e a neblina não se dissipa.'],
    detalhes: ['Cheiro de sal e carne velha numa cidade longe do mar.', 'Ângulos que o olho se recusa a acompanhar.', 'Um zumbido grave que só para quando você nota.', 'Mofo que forma padrões nas paredes.', 'Fotografias em que alguém apareceu depois de reveladas.'],
    perguntas: ['O que você viu que nunca contou a ninguém?', 'Qual é a verdade que preferia não ter descoberto?', 'Em que você ainda consegue acreditar depois de tudo?'],
    vago: { P: 'um investigador insone', L: 'um vilarejo costeiro', F: 'uma sociedade discreta', I: 'um tomo sem autor' },
  },
  {
    id: 'weird', label: 'Weird fiction', desc: 'O estranho sem explicação: cidades vivas e lógica torta.', glifo: '◈', aliases: ['weird fiction', 'weird', 'new weird', 'fantasia estranha', 'ficcao estranha', 'ficção estranha', 'surreal'],
    cores: { mar: '#3b2a58', terra: '#7d9a3c', luz: '#e6ff6b', ar: '#b06fd6' }, estilo: 'estranho', moeda: 'anomalias',
    eras: [
      { nome: 'Um Detalhe Errado', desc: 'A sombra chegou um pouco atrasada.' }, { nome: 'Geometria Mole', desc: 'Corredores crescem quando ninguém olha.' },
      { nome: 'Os Que Se Adaptaram', desc: 'Gente com escamas pagando imposto em dia.' }, { nome: 'A Burocracia do Impossível', desc: 'Existe um formulário para isso.' },
      { nome: 'A Infecção de Sentido', desc: 'As palavras começaram a mudar de significado.' }, { nome: 'O Bioma Interior', desc: 'A cidade agora digere.' },
      { nome: 'Normal', desc: 'Ninguém mais lembra como era antes. Melhor assim.' },
    ],
    ganchos: [
      '{P} acorda em {L} e todos insistem que aquele sempre foi o seu rosto.', 'Um bairro de {L} migra três quadras para o norte durante a noite.', '{F} cobra aluguel de quem sonha dentro dos limites da cidade.',
      '{I} chega pelo correio com instruções para alimentá-lo.', 'A chuva de {L} deixa marcas de escrita no asfalto.', '{P} é contratada para catalogar um museu que muda de acervo sozinho.',
    ],
    reviravoltas: ['A cidade é a narradora e está mentindo sobre {P}.', '{P2} é um sintoma, não uma pessoa.', 'Todos os mapas de {L} estão corretos ao mesmo tempo.', '{F} não existe: é uma doença que aprendeu a fazer reuniões.', 'O fenômeno é uma resposta a algo que {P} fez.'],
    complicacoes: ['A porta só abre para quem não precisa entrar.', 'Falar o nome de {L} em voz alta altera a sua localização.', 'O departamento responsável foi dissolvido por si mesmo.', 'Seu reflexo pediu demissão.', 'A gravidade tira férias às quintas.'],
    detalhes: ['Fungos que crescem seguindo o ritmo da sua respiração.', 'Um gosto de metal quando alguém mente.', 'Prédios com pulso visível nas colunas.', 'Pássaros voando de costas sobre o canal.', 'Um ruído de papel sendo dobrado dentro da parede.'],
    perguntas: ['Qual parte de você mudou sem pedir permissão?', 'O que aqui parece normal só porque ninguém mais questiona?', 'Qual é a regra absurda que você segue sem saber por quê?'],
    vago: { P: 'uma funcionária do arquivo municipal', L: 'um distrito que respira', F: 'um departamento sem sede', I: 'um objeto de função desconhecida' },
  },
  {
    id: 'cyberpunk', label: 'Cyberpunk', desc: 'Megacorporações, implantes, chuva e neon.', glifo: '⌬', aliases: ['cyberpunk', 'cyber punk', 'ciberpunk', 'tech noir', 'biopunk'],
    cores: { mar: '#0b1036', terra: '#2a1a5e', luz: '#ff2fd0', ar: '#22e6ff' }, estilo: 'neon', moeda: 'créditos',
    eras: [
      { nome: 'Boot', desc: 'Um cursor piscando numa tela rachada.' }, { nome: 'Baixo Nível', desc: 'Becos, gambiarras e sinal roubado.' },
      { nome: 'A Rede Acorda', desc: 'Toda porta agora tem um preço e uma senha.' }, { nome: 'Domínio Corporativo', desc: 'O governo virou um departamento de marketing.' },
      { nome: 'Greve Geral', desc: 'A cidade desconectou por quarenta horas.' }, { nome: 'Ghost Protocol', desc: 'Nem todas as mentes rodam em carne.' },
      { nome: 'Singularidade', desc: 'O sistema te olha de volta.' },
    ],
    ganchos: [
      '{P} acorda com um implante que não comprou e uma dívida com {F}.', 'Um dado roubado de {F} chega ao terminal de {P} por engano, e agora todos a caçam.', 'A memória vendida por {P} aparece à venda em {L}, editada.',
      '{P2} contrata {P} para roubar {I} da própria empresa em que trabalha.', 'Uma IA pede asilo político num bar de {L}.', 'O plano de saúde de {P} desliga seu coração artificial por falta de pagamento em 72 horas.',
    ],
    reviravoltas: ['O cliente anônimo é uma cópia digital de {P}.', '{F} planejou o vazamento para testar quem era leal.', 'As memórias de infância de {P} são propaganda licenciada.', '{P2} morreu há dois anos: o que fala com você é o espólio.', 'A resistência é um produto de {F}, com pesquisa de mercado.'],
    complicacoes: ['A assinatura do braço cibernético vence no meio da missão.', 'Drones de segurança em {L} reconhecem o seu modo de andar.', 'O contato do mercado negro virou informante.', 'O firewall reage a emoções e você está em pânico.', 'A chuva ácida derrubou a antena da única rota de fuga.'],
    detalhes: ['Hologramas de propaganda falhando sobre poças de óleo.', 'Macarrão instantâneo num balcão sob luz rosa.', 'O zumbido de um implante barato atrás da orelha.', 'Chuva que cheira a ozônio e plástico queimado.', 'Anúncios que sabem o seu nome e o seu saldo.'],
    perguntas: ['Quanto de você ainda é original de fábrica?', 'Para quem você vendeu algo que não tinha preço?', 'O que você apagaria da própria memória, se pudesse pagar?'],
    vago: { P: 'um netrunner endividado', L: 'o mercado subterrâneo', F: 'uma megacorporação', I: 'um chip criptografado' },
  },
  {
    id: 'scifi', label: 'Ficção científica', desc: 'Ciência, primeiro contato e o que nos torna humanos.', glifo: '⚛', aliases: ['ficcao cientifica', 'ficção científica', 'sci-fi', 'scifi', 'hard sci-fi', 'distopia'],
    cores: { mar: '#123c56', terra: '#5d7f8f', luz: '#7df0ff', ar: '#a7d8ff' }, estilo: 'orbital', moeda: 'descobertas',
    eras: [
      { nome: 'A Hipótese', desc: 'E se a conta estiver certa?' }, { nome: 'O Experimento', desc: 'Os primeiros dados não fazem sentido.' },
      { nome: 'A Primeira Colônia', desc: 'Um punhado de gente longe de casa.' }, { nome: 'O Salto Tecnológico', desc: 'Tudo mudou em uma geração.' },
      { nome: 'O Paradoxo', desc: 'A solução virou o problema.' }, { nome: 'Primeiro Contato', desc: 'Não estamos sozinhos, e eles têm perguntas.' },
      { nome: 'Pós-Humano', desc: 'O que veio depois de nós se lembra de nós.' },
    ],
    ganchos: [
      'Um sinal vindo de {L} repete a voz de {P} com doze anos de antecedência.', '{F} anuncia a cura da morte, com uma cláusula escondida.', 'A sonda enviada há um século volta tripulada.',
      '{P} descobre que {I} viola uma lei da física, e que alguém já sabia.', 'A IA que governa {L} pede para ser desligada.', 'Crianças de {L} começam a falar uma língua que ninguém ensinou.',
    ],
    reviravoltas: ['Os alienígenas são nossos descendentes tentando impedir algo.', 'A tripulação é uma simulação rodando para testar uma decisão de {P}.', '{F} sabia do colapso e vendeu passagens só para acionistas.', '{P2} é a terceira cópia, e a primeira ainda vive.', 'O experimento nunca parou: {L} é o laboratório.'],
    complicacoes: ['O atraso de comunicação com {L} é de onze horas.', 'O oxigênio dá para quatro pessoas, e há cinco a bordo.', 'Os dados foram adulterados por alguém da equipe.', 'A dilatação temporal fará {P} perder uma geração.', 'A IA de bordo segue ordens que você não pode ler.'],
    detalhes: ['O clique do metal esfriando no silêncio da estação.', 'Luz de emergência sobre trajes vazios.', 'Água reciclada com gosto de moeda.', 'Um relógio mostrando dois horários de planetas diferentes.', 'A Terra como um ponto azul que cabe atrás do polegar.'],
    perguntas: ['Até onde você iria em nome do progresso?', 'O que faz de você a mesma pessoa de dez anos atrás?', 'Que descoberta você esconderia da humanidade?'],
    vago: { P: 'uma cientista dissidente', L: 'uma estação de pesquisa', F: 'um consórcio científico', I: 'um artefato inexplicável' },
  },
  {
    id: 'espacial', label: 'Ópera espacial', desc: 'Impérios galácticos, naves, colônias e povos alienígenas.', glifo: '✦', aliases: ['opera espacial', 'ópera espacial', 'ficcao espacial', 'ficção espacial', 'space opera', 'espacial'],
    cores: { mar: '#1a1147', terra: '#5a3fb3', luz: '#ffb454', ar: '#7f8cff' }, estilo: 'estelar', moeda: 'parsecs',
    eras: [
      { nome: 'Poeira Estelar', desc: 'Uma nebulosa começa a girar.' }, { nome: 'O Primeiro Salto', desc: 'Alguém cruzou o vazio e voltou para contar.' },
      { nome: 'As Colônias', desc: 'Mil mundos, mil sotaques.' }, { nome: 'A República das Estrelas', desc: 'Um senado grande demais para concordar.' },
      { nome: 'A Guerra dos Setores', desc: 'Frotas queimam no céu de mundos neutros.' }, { nome: 'O Império', desc: 'Um trono do tamanho de uma lua.' },
      { nome: 'Galáxia Viva', desc: 'Todas as rotas agora contam a sua história.' },
    ],
    ganchos: [
      'A nave de {P} intercepta um pedido de socorro de {L}, assinado por quem morreu na guerra.', '{F} coloca a cabeça de {P} a prêmio em doze sistemas.', 'Uma frota inteira reaparece depois de 300 anos, sem envelhecer.',
      '{P} ganha uma nave num jogo de cartas, com um passageiro na câmara criogênica.', 'O imperador morre sem herdeiros e {P2} tem a única prova de sucessão.', '{I} é a chave de uma rota que atravessa o território de {F}.',
    ],
    reviravoltas: ['O passageiro criogênico é o tirano que todos acreditam morto.', 'A rebelião de {F} é financiada pelo próprio Império.', 'A nave é senciente e escolheu {P} de propósito.', '{L} não é um planeta.', '{P2} é herdeiro legítimo do trono e não sabe.'],
    complicacoes: ['O motor de salto precisa de um combustível só vendido em {L}.', 'Um caçador de recompensas está a bordo, disfarçado.', 'O bloqueio imperial fecha a única rota.', 'A tripulação não recebe há três ciclos.', 'O tradutor universal entende errado uma declaração de paz.'],
    detalhes: ['O estalo do casco ao sair do salto.', 'Um mercado de especiarias sob três sóis.', 'Luzes de frotas distantes como estrelas que se mexem.', 'Cheiro de solda e café requentado na ponte.', 'Um idioma feito de cores no pescoço do diplomata.'],
    perguntas: ['De que mundo você fugiu, e por quê?', 'Qual lealdade você mantém mesmo a anos-luz de distância?', 'O que sua nave sabe de você que ninguém sabe?'],
    vago: { P: 'uma capitã contrabandista', L: 'um posto na borda da galáxia', F: 'o Império', I: 'um mapa estelar proibido' },
  },
  {
    id: 'pos-apocalipse', label: 'Pós-apocalipse', desc: 'Ruínas, escassez e o que sobrou depois do fim.', glifo: '☢', aliases: ['pos apocalipse', 'pós-apocalipse', 'pos-apocaliptico', 'pós-apocalíptico', 'post-apocalyptic', 'apocalipse', 'zumbi', 'zumbis'],
    cores: { mar: '#4a4032', terra: '#8a6f42', luz: '#ff8a3c', ar: '#b89f78' }, estilo: 'ruina', moeda: 'sucata',
    eras: [
      { nome: 'O Dia Zero', desc: 'O último noticiário ficou no ar por seis minutos.' }, { nome: 'A Longa Noite', desc: 'Comida, água e medo, nessa ordem.' },
      { nome: 'Os Sobreviventes', desc: 'Um fogo aceso e alguém de vigia.' }, { nome: 'Os Assentamentos', desc: 'Muros de sucata e leis improvisadas.' },
      { nome: 'As Guerras da Água', desc: 'Um poço vale mais que um exército.' }, { nome: 'A Nova Ordem', desc: 'Alguém está reescrevendo a história.' },
      { nome: 'Depois do Fim', desc: 'Crianças que nunca viram o mundo antigo plantam árvores.' },
    ],
    ganchos: [
      'Um rádio volta a tocar em {L}, repetindo coordenadas e o nome de {P}.', '{F} troca água limpa por crianças, e {P} acaba de perder a filha.', '{P} acha um bunker selado com comida para dez anos e alguém vivo dentro.',
      'A caravana de {P2} chega a {L} com a doença que acabou com o mundo.', '{I} pode religar a última usina, e três grupos o querem.', 'Um mapa promete uma cidade intacta além da zona morta.',
    ],
    reviravoltas: ['A cidade prometida é uma armadilha de {F} para capturar trabalhadores.', 'O apocalipse foi causado para salvar alguém que {P} conhece.', 'Os monstros são os antigos moradores de {L}.', '{P2} está infectado desde o começo da viagem.', 'Do lado de fora da zona morta, o mundo segue normal.'],
    complicacoes: ['O filtro de água quebra a dois dias de {L}.', 'A tempestade de poeira apaga todas as trilhas.', 'A munição acabou e eles ainda não sabem.', 'Uma criança do grupo tem febre.', 'O acordo com {F} vence ao amanhecer.'],
    detalhes: ['Carros enferrujados com o cinto de segurança ainda afivelado.', 'Uma horta num telhado desabado.', 'Cheiro de diesel velho e cinza molhada.', 'Brinquedos pendurados como aviso na cerca.', 'O silêncio onde antes havia uma estrada.'],
    perguntas: ['O que você fez para sobreviver e nunca vai contar?', 'Do que você sente mais falta do mundo antigo?', 'Quem você deixou para trás?'],
    vago: { P: 'uma batedora solitária', L: 'um assentamento murado', F: 'um bando de saqueadores', I: 'um gerador intacto' },
  },
  {
    id: 'steampunk', label: 'Steampunk', desc: 'Vapor, engrenagens, dirigíveis e impérios mecânicos.', glifo: '⚙', aliases: ['steampunk', 'steam punk', 'dieselpunk', 'clockpunk', 'gaslamp', 'vitoriano'],
    cores: { mar: '#3a3026', terra: '#8c6a3f', luz: '#e8b04a', ar: '#bfa27a' }, estilo: 'engrenagem', moeda: 'engrenagens',
    eras: [
      { nome: 'A Primeira Faísca', desc: 'Um esboço a carvão sobre a bancada.' }, { nome: 'O Vapor Sobe', desc: 'A caldeira sibila pela primeira vez.' },
      { nome: 'Oficinas e Patentes', desc: 'Todo gênio tem um rival e um advogado.' }, { nome: 'A Era Industrial', desc: 'Chaminés mais altas que catedrais.' },
      { nome: 'A Revolta das Fábricas', desc: 'Operários sabotam as máquinas com tamancos.' }, { nome: 'O Império dos Céus', desc: 'Dirigíveis projetam sombra sobre nações.' },
      { nome: 'O Grande Mecanismo', desc: 'O mundo inteiro bate como um relógio.' },
    ],
    ganchos: [
      'Um autômato bate à porta de {P} e pergunta pelo seu criador.', '{F} patenteia o ar respirável de {L}.', '{P} herda uma oficina e a planta de {I}, que nunca deveria ter sido construído.',
      'O dirigível da rainha desaparece com {P2} a bordo.', 'Um relógio em {L} marca a hora exata de cada morte da cidade.', 'Uma inventora é acusada de um crime cometido por sua máquina.',
    ],
    reviravoltas: ['O grande inventor de {F} é, há décadas, um autômato.', 'O coração mecânico de {P} foi feito para parar numa data específica.', 'As fábricas de {L} estão construindo uma única máquina.', '{P2} roubou a patente da mãe de {P}.', 'A rainha é apenas a voz de um mecanismo no subsolo.'],
    complicacoes: ['A pressão da caldeira sobe além do manômetro.', 'O Parlamento exige licença para a invenção até sexta.', 'O carvão de {L} está racionado pela greve.', 'A peça necessária só existe no cofre de {F}.', 'Espiões de uma potência rival estão no baile de gala.'],
    detalhes: ['Fuligem nas luvas de renda.', 'O tique-taque que atravessa as paredes da casa.', 'Óleo de máquina e chá preto forte.', 'Lampiões a gás tremendo na neblina.', 'Latão polido refletindo o rosto deformado.'],
    perguntas: ['Que invenção você queria nunca ter construído?', 'Quem lucra com o seu trabalho, e o que você pensa disso?', 'Se pudesse trocar uma parte do corpo por metal, qual seria?'],
    vago: { P: 'uma inventora sem patente', L: 'o distrito das fábricas', F: 'a Companhia Imperial', I: 'um autômato inacabado' },
  },
  {
    id: 'historico', label: 'Histórico', desc: 'Épocas reais, história alternativa e gente de seu tempo.', glifo: '🏛', aliases: ['historico', 'histórico', 'historia alternativa', 'história alternativa', 'romance historico', 'romance histórico', 'period'],
    cores: { mar: '#2f4a5a', terra: '#9c8554', luz: '#e9d29a', ar: '#c9d3d6' }, estilo: 'antigo', moeda: 'crônicas',
    eras: [
      { nome: 'Fonte Primária', desc: 'Um documento amarelado e muitas perguntas.' }, { nome: 'O Cotidiano', desc: 'O que se comia, vestia e temia.' },
      { nome: 'A Sociedade', desc: 'Quem podia falar, e quem devia calar.' }, { nome: 'O Poder de Então', desc: 'Dinastias, igrejas e casas comerciais.' },
      { nome: 'A Ruptura', desc: 'A revolta, a peste ou a guerra que mudou tudo.' }, { nome: 'A Memória', desc: 'Os vencedores já escrevem a sua versão.' },
      { nome: 'A Grande Crônica', desc: 'O passado voltou a ter gente dentro.' },
    ],
    ganchos: [
      'Uma carta interceptada em {L} pode mudar o rumo da guerra, e {P} sabe ler a cifra.', '{P} é forçada a fingir ser outra pessoa para herdar em {L}.', '{F} acusa {P2} de heresia às vésperas da colheita.',
      'A chegada de um navio a {L} traz notícia, doença e um desconhecido.', '{I} prova que a linhagem reinante é ilegítima.', 'Em {L}, uma parteira guarda o segredo do nascimento de um rei.',
    ],
    reviravoltas: ['O documento que sustenta tudo é uma falsificação de {F}.', 'O traidor agiu para evitar um massacre.', '{P2} é filho de quem {P} ajudou a condenar.', 'A batalha foi perdida de propósito.', 'A história oficial inverteu os papéis de herói e vilão.'],
    complicacoes: ['A lei da época não permite que {P} testemunhe.', 'A viagem até {L} leva seis semanas por mar.', 'A peste fecha os portões da cidade.', 'Uma mudança de reinado invalida todos os acordos.', 'A carta levará meses para chegar, e a decisão é hoje.'],
    detalhes: ['Tinta ferrogálica escurecendo no pergaminho.', 'O cheiro da rua antes dos esgotos.', 'Sinos marcando as horas de quem não tem relógio.', 'Roupas remendadas por três gerações.', 'Uma vela contada para durar a noite inteira.'],
    perguntas: ['O que a sua época proíbe que você deseja?', 'Em que você acredita que hoje pareceria absurdo?', 'O que você teme que a história diga de você?'],
    vago: { P: 'um escrivão de província', L: 'uma cidade portuária', F: 'o tribunal da coroa', I: 'um documento selado' },
  },
  {
    id: 'contemporaneo', label: 'Contemporâneo realista', desc: 'Drama, romance, policial e mistério no mundo de hoje.', glifo: '☖', aliases: ['contemporaneo', 'contemporâneo', 'realista', 'drama', 'policial', 'thriller', 'misterio', 'mistério', 'romance'],
    cores: { mar: '#2d5f86', terra: '#6f8f6b', luz: '#ffd98f', ar: '#b8d4e8' }, estilo: 'atual', moeda: 'capítulos',
    eras: [
      { nome: 'Uma Pergunta', desc: 'E se aquela pessoa tivesse ficado?' }, { nome: 'A Vizinhança', desc: 'A rua, o trabalho, o grupo da família.' },
      { nome: 'Laços', desc: 'Todo mundo deve algo a alguém.' }, { nome: 'Rotina Rachada', desc: 'Uma mensagem fora de hora muda o dia.' },
      { nome: 'O Ponto de Virada', desc: 'Não dá mais para fingir que nada aconteceu.' }, { nome: 'As Consequências', desc: 'Toda escolha mandou a conta.' },
      { nome: 'Vida Inteira', desc: 'Parece gente de verdade, porque é.' },
    ],
    ganchos: [
      '{P} recebe uma mensagem do celular de quem foi enterrado há um mês.', 'Uma herança obriga {P} e {P2} a dividir a mesma casa por um ano.', 'A auditoria em {F} encontra o nome de {P} num desvio que ela não fez.',
      '{P} volta para {L} depois de vinte anos para vender a casa da mãe.', 'Um corpo aparece em {L} na véspera da festa do bairro.', '{P2} pede a {P} um favor pequeno que vai custar tudo.',
    ],
    reviravoltas: ['A vítima planejou o próprio desaparecimento.', 'O melhor amigo de {P} é quem escreve as mensagens anônimas.', 'O pai que {P} idolatra tinha outra família em {L}.', 'A testemunha principal mentiu para proteger {P}.', 'A empresa quebrou de propósito, e {P2} lucrou.'],
    complicacoes: ['O prazo do banco vence nesta sexta.', 'A filha adolescente descobriu tudo pelas redes sociais.', 'O único que pode ajudar é o ex de {P}.', 'A polícia chega antes da hora combinada.', 'O diagnóstico muda as prioridades de todo mundo.'],
    detalhes: ['Café passado em garrafa térmica de escritório.', 'O barulho de ônibus freando na chuva.', 'Mensagens visualizadas e não respondidas.', 'Um porta-retratos virado para baixo.', 'A luz azul da TV ligada sem som às três da manhã.'],
    perguntas: ['O que você diz que está tudo bem, quando não está?', 'Que conversa você vem adiando há anos?', 'Quem você seria se ninguém conhecesse o seu passado?'],
    vago: { P: 'uma advogada cansada', L: 'o bairro onde cresceu', F: 'a empresa da família', I: 'um celular antigo' },
  },
  {
    id: 'livre', label: 'Livre', desc: 'Sem rótulo: misture o que quiser.', glifo: '✺', aliases: ['livre', 'outro', 'misto', 'generico', 'genérico'],
    cores: { mar: '#2b4a6f', terra: '#6a8f7a', luz: '#ffcf70', ar: '#a9cdea' }, estilo: 'livre', moeda: 'fagulhas',
    eras: [
      { nome: 'A Faísca', desc: 'Uma ideia que não te deixou dormir.' }, { nome: 'O Esboço', desc: 'Formas começam a aparecer.' },
      { nome: 'Gente e Lugares', desc: 'Já dá para visitar.' }, { nome: 'Forças em Jogo', desc: 'Alguém quer o que outro tem.' },
      { nome: 'A Crise', desc: 'Nada mais volta a ser como antes.' }, { nome: 'A Lenda', desc: 'As histórias começam a se contar sozinhas.' },
      { nome: 'O Mundo Desperto', desc: 'Ele existe, mesmo quando você fecha o caderno.' },
    ],
    ganchos: [
      '{P} descobre algo em {L} que {F} pagaria caro para esconder.', '{P} e {P2} acordam em lados opostos de um conflito que não escolheram.', 'Alguém deixa {I} na porta de {P}, com um bilhete de uma só palavra.',
      'Tudo o que se sabia sobre {L} acaba de ser desmentido.', '{F} faz uma oferta que {P} não pode recusar.', 'Uma pessoa que todos davam como perdida volta a {L}.',
    ],
    reviravoltas: ['Quem pediu ajuda é quem causou o problema.', '{P2} sabia de tudo desde o início.', 'O objetivo de {F} era outro o tempo inteiro.', '{I} não é o que parece.', 'A vitória de {P} foi exatamente o que o inimigo queria.'],
    complicacoes: ['O tempo acaba antes do esperado.', 'Um aliado muda de lado no pior momento.', 'O caminho até {L} está bloqueado.', 'A verdade vai magoar quem {P} mais ama.', 'Falta justamente o recurso mais importante.'],
    detalhes: ['Um som que só uma pessoa da sala parece ouvir.', 'Um cheiro que traz de volta a infância.', 'Uma cor que não combina com o resto da cena.', 'Um objeto fora do lugar.', 'O silêncio logo depois de uma pergunta.'],
    perguntas: ['O que você quer mais do que admite?', 'Qual decisão você tomaria de novo, mesmo sabendo o preço?', 'Quem você prometeu nunca se tornar?'],
    vago: { P: 'alguém de confiança', L: 'um lugar esquecido', F: 'um grupo rival', I: 'um objeto perdido' },
  },
];

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export const GENERO_PADRAO: Genero = GENEROS.find((g) => g.id === 'livre')!;

/** Acha o gênero pelo id, pelo nome ou por um jeito comum de escrevê-lo. */
export function acharGenero(texto: string): Genero | null {
  const t = fold(texto);
  if (!t) return null;
  return GENEROS.find((g) => g.id === t || fold(g.label) === t || g.aliases.some((a) => fold(a) === t)) ?? null;
}

/** Gênero declarado na nota do mundo; sem declaração, o mundo é "Livre". */
export function generoDoMundo(w: Pick<World, 'props'>): Genero {
  const props = w.props ?? {};
  const key = Object.keys(props).find((k) => ['genero', 'genre'].includes(fold(k)));
  return (key ? acharGenero(asText(props[key])) : null) ?? GENERO_PADRAO;
}
