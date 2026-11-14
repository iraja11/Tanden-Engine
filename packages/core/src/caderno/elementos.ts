import { asList, asText } from './frontmatter';
import { timeline, type Entity, type World } from './mundo';

/*
 * Tabela de elementos do world building.
 *
 * Uma lista do que um mundo pode ter, em famílias (ecologia, cultura,
 * política, economia, religião, fantástico...). Cada elemento traz o que é,
 * três perguntas para começar e o tipo de ficha em que costuma morar. A tela
 * mostra a tabela inteira e pinta o que o mundo já cobre: um elemento conta
 * como coberto quando alguma ficha diz `elemento: Moedas e comércio` ou
 * quando o tipo e as palavras da ficha batem (uma ficha de conceito chamada
 * "Coroa de prata" com `categoria: moeda` já conta para Moedas).
 *
 * O que não cabe no mundo vai para `fora do mundo:` na nota do mundo e sai
 * da conta.
 */

export interface ElementFamily {
  id: string;
  label: string;
  color: string;
}

export const ELEMENT_FAMILIES: ElementFamily[] = [
  { id: 'geral', label: 'Geral', color: '#b9bcc6' },
  { id: 'ecologia', label: 'Ecologia', color: '#3f86c9' },
  { id: 'cultura', label: 'Cultura', color: '#2f9e58' },
  { id: 'organizacao', label: 'Organizações', color: '#b45a3c' },
  { id: 'historia', label: 'História', color: '#a07850' },
  { id: 'linguagem', label: 'Linguagem', color: '#26a9d8' },
  { id: 'tecnologia', label: 'Tecnologia', color: '#2aa198' },
  { id: 'politica', label: 'Política', color: '#d64541' },
  { id: 'economia', label: 'Economia', color: '#d9b62b' },
  { id: 'infraestrutura', label: 'Infraestrutura', color: '#9b3a7a' },
  { id: 'religiao', label: 'Religião', color: '#e8962e' },
  { id: 'fantastico', label: 'Fantástico', color: '#3d4fb0' },
  { id: 'sombrio', label: 'Sombrio', color: '#6f7178' },
  { id: 'terras', label: 'Terras e águas', color: '#8f9a8a' },
  { id: 'cosmos', label: 'Cosmos e planos', color: '#3a3f55' },
  { id: 'narrativa', label: 'Narrativa', color: '#e8e2d0' },
];

export interface Element {
  id: string;
  nome: string;
  family: string;
  glyph: string;
  /** tipo de ficha em que o elemento costuma morar */
  tipo: string;
  desc: string;
  perguntas: string[];
  /** palavras que, no nome ou nas propriedades de uma ficha do tipo certo, contam como cobertura */
  palavras: RegExp | null;
  /** tipos de ficha que contam como cobertura (padrão: o `tipo`) */
  tipos: string[];
  /** tipos em que toda ficha conta, sem precisar das palavras (ex.: toda religião conta em Religiões) */
  inteiros: string[];
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/*
 * Uma linha por elemento:
 *   nome | símbolo | tipo(s) da ficha | palavras | o que é | pergunta; pergunta; pergunta
 * "*" nas palavras: qualquer ficha dos tipos conta.
 */
const DATA: Record<string, string> = {
  geral: `
Mapas | 🧭 | mapa | * | Onde fica cada coisa: distâncias, fronteiras, o caminho entre dois lugares. | Quanto tempo leva para cruzar o mundo conhecido?; Que parte do mapa ninguém desenhou ainda?; Quem fez os mapas, e o que eles escondem?
Linha do tempo | ⏳ | evento | * | A ordem dos acontecimentos: o que veio antes explica o que vem depois. | Qual foi o acontecimento que dividiu a história em antes e depois?; O que aconteceu há cem anos que ainda pesa hoje?; Que data todo mundo comemora, e por quê?
Linhagens | 🧬 | personagem | linhagem|dinastia|casa|fam[ií]lia|herdeir | Famílias, dinastias e heranças que atravessam gerações. | Que família está no poder há mais tempo?; Que herança alguém daria tudo para não ter?; Que bastardo ou herdeiro esquecido pode mudar tudo?
Gênero | 🎭 | conceito | g[eê]nero|fantasia|fic[cç][aã]o|terror|steampunk|cyberpunk | O tipo de história que o mundo conta: fantasia épica, terror, ficção científica, faroeste... | Que emoção o leitor deve sentir ao fechar o livro?; Que convenção do gênero você quer quebrar?; Que obra é a vizinha mais próxima deste mundo?
Tom | ❤ | conceito | tom|clima narrativo|atmosfera | Sombrio ou esperançoso, cômico ou trágico: o ar que se respira nas páginas. | O bem costuma vencer aqui?; Do que as pessoas riem neste mundo?; Que tipo de morte é comum, e qual é rara?
Era do mundo | 📜 | evento | era|idade|[eé]poca|ciclo | Em que momento da história o mundo está: auge, decadência, recomeço, véspera de algo. | O que acabou de terminar, e o que está prestes a começar?; Como as pessoas chamam o tempo em que vivem?; O que os avós contam sobre os bons tempos?
Regras internas | 📏 | conceito | regra|lei natural|f[ií]sica|limite | O que é possível e o que não é: a física, a magia, a morte, a viagem no tempo. | O que nunca pode acontecer neste mundo?; Qual regra os personagens acham que existe, mas não existe?; O que acontece com quem tenta quebrar a regra?`,
  ecologia: `
Povos | 👥 | especie,cultura | * | As espécies e os povos que pensam, falam e constroem. | Quantos povos dividem o mundo, e quem chegou primeiro?; O que um povo inveja no outro?; Que povo sumiu, e por quê?
Criaturas | 🐉 | criatura | * | Bichos, feras e monstros que vivem fora das cidades. | Que criatura assusta as crianças à noite?; Qual delas é caçada até quase sumir?; Qual parece perigosa e não é?
Flora | 🌿 | conceito,especie | planta|flora|[aá]rvore|erva|flor|fungo|cogumelo | Plantas, árvores, fungos: comida, remédio, veneno e paisagem. | Que planta todo mundo planta?; Que erva cura, e qual mata?; Que árvore é sagrada ou proibida?
Ciclo da vida | 🥚 | especie,criatura | reprodu|gesta[cç]|ninhada|ovo|acasal|matur | Como os seres nascem, crescem, se reproduzem e morrem. | Como as crianças são criadas, e por quem?; Que estação é a dos nascimentos?; Como cada espécie lida com os velhos?
Ecossistemas | 🌻 | lugar,conceito | ecossistema|bioma|habitat|ecolog | Quem come quem, quem depende de quem, em cada paisagem. | O que acontece se a espécie-chave sumir?; Que paisagem está morrendo?; Onde a vida é mais rica, e por quê?
Predadores e presas | 🦷 | criatura,especie | predador|presa|ca[cç]a|dieta|come | A cadeia alimentar e o perigo de estar no lugar errado dela. | Quem é o topo da cadeia?; Que povo é presa de alguma coisa?; Que caçada virou esporte ou ritual?
Animais domésticos | 🐑 | criatura,especie | dom[eé]stic|gado|montaria|rebanho|cavalo|c[aã]o | Bichos de carga, montaria, rebanho e companhia. | Em que bicho se viaja?; Que animal é sinal de riqueza?; Que bicho domesticado ainda morde a mão do dono?`,
  cultura: `
Arte | 🖌 | cultura,conceito | arte|pintura|escultura|artista | O que as pessoas criam para ser visto: pintura, escultura, tapeçaria, grafite. | Que obra famosa todo mundo conhece?; Que arte é proibida?; Quem paga os artistas?
Arquitetura | 🏛 | cultura,lugar | arquitetura|constru[cç]|casa|pal[aá]cio|estilo | Como e com que se constrói: casas, templos, muralhas, cidades. | De que material é feita uma casa comum?; Que construção antiga ninguém sabe como foi feita?; Como se reconhece a casa de um rico?
Etiqueta | 🍴 | cultura | etiqueta|cortesia|sauda[cç]|boas maneiras|costume | As regras não escritas: como cumprimentar, comer, pedir, recusar. | Qual a pior gafe à mesa?; Como se cumprimenta alguém mais poderoso?; O que é um insulto sem palavras?
Adornos | 💍 | cultura | adorno|tatuagem|joia|pintura corporal|piercing|cicatriz | Tatuagens, pinturas, joias e cicatrizes que dizem quem a pessoa é. | Que marca no corpo diz a profissão ou a casta?; Que adorno só os nobres podem usar?; O que significa estar sem adorno nenhum?
Música | 🎵 | cultura | m[uú]sica|can[cç][aã]o|instrumento|dan[cç]a | Instrumentos, canções e danças. | Que canção todo mundo sabe de cor?; Que instrumento é proibido em templos?; Quem são os músicos: servos, nobres, sacerdotes?
Moda | 🧥 | cultura | moda|roupa|vestiment|traje|tecido | Roupas, tecidos e o que elas dizem sobre quem as veste. | O que se veste num casamento, e num funeral?; Que cor é só para nobres?; Que roupa estrangeira virou moda?
Tabus | 🚫 | cultura | tabu|proibi|interdito | O que não se faz, não se diz e não se come. | Qual tabu ninguém lembra por que existe?; O que acontece com quem o quebra?; Que tabu de um povo é costume de outro?
Moral | ⚖ | cultura,conceito | moral|virtude|honra|pecado|valor | O que é certo, o que é errado e o que fica no meio. | Qual a maior virtude?; Que crime é perdoado facilmente?; Quando mentir é o certo?
Poesia e prosa | 📖 | livro,cultura,item  | poesia|poema|livro|epopeia|conto|prosa | Histórias contadas e escritas: épicos, contos, peças, poemas. | Qual a história que toda criança ouve?; Quem é o maior poeta, e por que caiu em desgraça?; Que livro foi queimado?
Esportes e jogos | 🎲 | cultura | jogo|esporte|torneio|competi|aposta | Como se joga, compete e aposta. | Que jogo de tabuleiro os generais jogam?; Que esporte para a cidade inteira?; Quem perde fortunas apostando?
Rituais | 🎭 | cultura,conceito | ritual|rito|cerim[oô]nia|passagem|inicia | Ritos de passagem, juramentos, cerimônias. | Como uma criança vira adulta?; Que juramento não pode ser quebrado?; Que ritual ficou vazio de sentido, mas continua?
Culinária | 🍗 | cultura | comida|culin|prato|cozinha|bebida|receita | O que se come, como se cozinha, o que se bebe. | Qual o prato de festa?; Que comida estrangeira dá nojo?; O que os pobres comem no inverno?
Entretenimento | 🎪 | cultura | teatro|circo|espet[aá]culo|divers[aã]o|taverna | Teatro, circo, tavernas, espetáculos: o que se faz para esquecer a vida. | Onde se vai numa noite livre?; Que espetáculo é sangrento?; Quem são as celebridades?
Festas | 🏮 | cultura,evento | festa|festival|feriado|celebra|carnaval | Festivais, feriados e celebrações do calendário. | Qual a maior festa do ano?; Que festa antiga virou outra coisa?; O que é permitido só no dia de festa?`,
  organizacao: `
Guildas | ⚙ | faccao | guilda|corpora[cç]|of[ií]cio|irmandade | Associações de ofício: ferreiros, magos, ladrões, mercadores. | Que guilda manda de verdade na cidade?; Como se entra, e quanto custa?; Que guilda está em guerra com outra?
Hierarquias | 🏅 | faccao,conceito | hierarquia|casta|patente|t[ií]tulo|nobreza | Quem manda em quem: títulos, castas, patentes. | Dá para subir de casta?; Qual o título mais alto, e quem o tem?; Quem está abaixo de todos?
Heráldica | 🛡 | faccao | bras[aã]o|heráldica|bandeira|estandarte|s[ií]mbolo|lema | Brasões, bandeiras, cores e lemas. | Que símbolo todo mundo reconhece?; Que bandeira foi proibida?; O que significa pintar o brasão de cabeça para baixo?
Sociedades secretas | 🗝 | faccao | secret|oculta|conspira|clandestin | Grupos que agem nas sombras. | O que elas querem que ninguém pode saber?; Como os membros se reconhecem?; Quem do alto poder é membro?`,
  historia: `
Medição do tempo | ⏰ | conceito | calend[aá]rio|m[eê]s|ano|esta[cç][aã]o|rel[oó]gio|lua | Calendários, meses, estações e como se contam os anos. | Quando começa o ano?; Quantas luas, e o que cada uma marca?; Que dia é de azar?
Fósseis | 🦴 | conceito,item | f[oó]ssil|ossada|esqueleto|extint | Ossos e restos do que viveu antes. | Que ossada gigante ninguém explica?; Quem coleciona fósseis, e por quê?; O que os fósseis dizem que as lendas negam?
Registros | 🪶 | livro,item,conceito  | registro|cr[oô]nica|arquivo|biblioteca|anal | Quem escreve a história e o que foi apagado. | Quem guarda os registros oficiais?; Que período sumiu dos livros?; Que mentira histórica todos aceitam?
Artefatos | 🏺 | item | * | Objetos antigos que sobreviveram ao tempo. | Que artefato mudou uma guerra?; Qual está perdido, e quem o procura?; Que objeto comum de hoje será relíquia amanhã?
Lendas | 🏹 | feito,conceito,evento  | lenda|mito|f[aá]bula|her[oó]i antigo | Histórias que todos contam e ninguém confirma. | Qual lenda é verdade?; Que herói lendário era, na verdade, um vilão?; Que lenda local atrai forasteiros?
Feitos | 🏆 | !feito,evento | feito|fa[cç]anha|proeza|her[oó]i|vit[oó]ria|conquista | Façanhas e vergonhas que o povo lembra: quem fez, como é contado, o que custou. | Qual o maior feito da história do mundo?; Que feito é contado errado de propósito?; Quem ganhou um título por um feito, e merecia?
Ruínas | 🏚 | lugar | ru[ií]na|abandonad|destru|antig | O que sobrou de quem veio antes. | Quem construiu as ruínas mais antigas?; O que ainda mora nelas?; Por que ninguém reconstrói?`,
  linguagem: `
Idiomas | 🗣 | idioma | * | As línguas faladas: sons, palavras, quem fala o quê. | Qual a língua do comércio?; Que língua está morrendo?; Que palavra não tem tradução?
Expressões | 💬 | idioma,cultura | express[aã]o|ditado|prov[eé]rbio|figura | Ditados, provérbios e figuras de linguagem. | Que ditado todo mundo repete?; Como se diz "boa sorte"?; Que expressão vem de um acontecimento histórico?
Livros | 📚 | !livro,item | livro|tomo|grim[oó]rio|cr[oô]nica|tratado|escritura|pergaminho | Os livros do mundo: crônicas, tratados, grimórios, romances, leis. | Que livro todo mundo conhece?; Que livro foi proibido, e por quê?; Onde fica a maior biblioteca?
Escritas | ✒ | idioma | alfabeto|escrita|runa|glifo|letra | Alfabetos, runas, glifos: como as palavras viram marcas. | Quem sabe ler?; Que escrita ninguém mais decifra?; Em que material se escreve?
Gírias e xingamentos | 🤬 | idioma,cultura | g[ií]ria|xingamento|palavr[aã]o|insulto|jarg[aã]o | O jeito de falar da rua, das guildas, dos soldados. | Qual o pior xingamento?; Que gíria denuncia um ladrão?; Como os jovens falam diferente dos velhos?
Propaganda | 📯 | conceito,faccao | propaganda|boato|mentira|censura|not[ií]cia | Boatos, propaganda e mentiras oficiais. | Que mentira o governo conta?; Como as notícias viajam?; Quem decide o que é verdade?`,
  tecnologia: `
Ferramentas | 🔨 | item,conceito | ferramenta|instrumento|t[eé]cnica|of[ií]cio | Do martelo à máquina: com o que se trabalha. | Qual invenção mudou a vida comum?; Que ferramenta só um povo sabe fazer?; Que trabalho ainda é feito à mão?
Comunicação a distância | 📡 | conceito | mensag|correio|pombo|tel[eé]grafo|sinal|comunica | Como uma mensagem atravessa o mundo. | Quanto tempo leva uma carta entre capitais?; Quem controla as mensagens?; Que meio é secreto?
Armas e armaduras | ⚔ | item | arma|espada|armadura|escudo|arco|lan[cç]a|canh[aã]o | Como se luta e como se protege. | Qual a arma de um soldado comum?; Que arma é proibida?; Que armadura vale um castelo?
Tecnologias novas | 🔮 | conceito | inven[cç]|tecnologia|m[aá]quina|engenho|futur | O que está sendo inventado agora. | Que invenção vai mudar tudo?; Quem tem medo dela?; Quem quer roubá-la?
Medicina | 💉 | conceito | medicina|cura|rem[eé]dio|m[eé]dico|cirurgi|curandeir | Como se cura, quem cura e quanto custa. | Que doença ainda é fatal?; Quem cuida dos pobres?; Que cura é pior que a doença?
Tecnologia alternativa | ⚗ | conceito | alquimia|engenhoca|vapor|cristal|biotec|arcano | Ciência por outros caminhos: alquimia, vapor, cristais, biotecnologia. | De onde vem a energia das máquinas?; Que efeito colateral ninguém admite?; Quem tem o segredo?`,
  politica: `
Governos | 🏛 | faccao | governo|reino|imp[eé]rio|rep[uú]blica|conselho|coroa|trono | Quem governa e como: reinos, impérios, repúblicas, conselhos. | Quem manda de verdade, e quem só parece mandar?; Como se escolhe o próximo governante?; Que lei o povo odeia?
Diplomacia | 🤝 | faccao,conflito | diplomacia|tratado|alian[cç]a|embaixad|acordo | Tratados, alianças, embaixadores e casamentos arranjados. | Que aliança é frágil?; Que tratado vence este ano?; Quem é o melhor diplomata, e quem ele engana?
Acontecimentos políticos | 🗳 | evento | golpe|revolu|elei[cç]|coroa[cç]|abdic|assassinato | Golpes, coroações, revoltas, eleições. | Qual o último golpe?; Que revolta foi esmagada?; Quem será coroado, e quem não aceita?
Guerra | 🪖 | conflito | * | Exércitos, batalhas e o preço de lutar. | Qual a guerra que ninguém esquece?; Quem lucra com a guerra?; Como se recruta um soldado?
Lei e ordem | ⚖ | conceito,faccao | lei|justi[cç]a|tribunal|guarda|pris[aã]o|crime e castigo | Leis, tribunais, guardas e castigos. | Qual o castigo para roubo?; Os nobres respondem à mesma lei?; Quem vigia os vigias?
Fronteiras | 🚧 | lugar,conflito | fronteira|divisa|marca|limite|muralha | Onde um território acaba e outro começa. | Que fronteira é disputada?; Quem atravessa sem permissão?; O que existe na terra de ninguém?`,
  economia: `
Moedas e comércio | 🪙 | conceito,item | moeda|dinheiro|c[aâ]mbio|com[eé]rcio|mercado|pre[cç]o | Dinheiro, trocas e mercados. | De que é feita a moeda, e quem a cunha?; Quanto custa um pão, uma espada, um cavalo?; Que moeda estrangeira vale mais?
Empresas | 🏪 | faccao | companhia|empresa|casa comercial|banco|mercador | Casas comerciais, bancos e companhias. | Que companhia é mais rica que um reino?; Quem empresta dinheiro aos reis?; Que empresa faliu e levou muita gente junto?
Produção | 🏭 | lugar,faccao | f[aá]brica|oficina|armaz[eé]m|manufatura|forja|moinho | Onde e como as coisas são feitas e guardadas. | O que este lugar produz que ninguém mais produz?; Quem trabalha nas oficinas?; Que armazém guarda o que não devia?
Recursos | ⛏ | lugar,item | recurso|min[eé]rio|mina|madeira|metal|ouro|ferro|sal | Minério, madeira, água, terra boa: o que a terra dá. | Que recurso está acabando?; Quem controla as minas?; Que guerra foi por um recurso?
Bens raros | 💎 | item | raro|gema|especiaria|seda|luxo|pr[eé]cios | Especiarias, sedas, gemas: o que vale fortunas. | Que bem raro sustenta uma rota inteira?; Quem pode usá-lo?; O que se faz para consegui-lo?
Mercado negro | 🍾 | item,faccao | contrabando|il[ií]cit|ilegal|droga|mercado negro|proibid | Contrabando, drogas, bens e serviços proibidos. | O que é contrabandeado, e por onde?; Que autoridade faz vista grossa?; Que serviço proibido todos usam?`,
  infraestrutura: `
Água | 🚰 | lugar,conceito | [aá]gua|aqueduto|po[cç]o|cisterna|esgoto|saneamento | De onde vem a água e para onde vai o esgoto. | Quem controla a água da cidade?; O que acontece numa seca?; O que vive nos esgotos?
Energia | 🔥 | conceito | energia|lenha|carv[aã]o|moinho|vapor|cristal|mana | O que move as máquinas e aquece as casas. | O que se queima no inverno?; Quem tem energia de sobra?; Que fonte de energia é perigosa?
Lixo | 🗑 | conceito,lugar | lixo|dejeto|res[ií]duo|monturo | Para onde vai o que ninguém quer. | Onde fica o lixão, e quem vive lá?; O que se recicla?; Que lixo é perigoso?
Transporte | 🛤 | conceito,lugar | estrada|transporte|navio|caravana|carro[cç]a|porto|ponte | Estradas, navios, caravanas e portos. | Qual a rota mais movimentada?; Quanto custa viajar?; Que estrada é perigosa?
Agricultura | 🌽 | conceito,lugar | agricultura|planta[cç]|colheita|fazenda|lavoura|gr[aã]o | O que se planta e como se colhe. | Qual o alimento básico?; O que acontece numa colheita ruim?; Quem é dono da terra?
Saúde | ➕ | conceito,lugar | hospital|sa[uú]de|peste|epidemia|curandeir|enfermari | Hospitais, curandeiros, pestes. | Onde os doentes vão?; Qual a última grande peste?; Quem paga pelo cuidado?
Escolas | 🎓 | lugar,faccao | escola|academia|universidade|mestre|aprendiz|ensino | Quem aprende o quê, com quem. | Quem pode estudar?; Que academia é a mais famosa?; O que é proibido ensinar?
Ritos fúnebres | ⚰ | cultura,conceito | funeral|f[uú]nebre|enterro|cremação|morte|t[uú]mulo | O que se faz com os mortos. | Enterram, queimam ou deixam ao vento?; Onde ficam os túmulos dos reis?; O que acontece com quem morre sem rito?`,
  religiao: `
Deuses | ⛈ | divindade | * | Os deuses, se existem, e o que querem. | Os deuses respondem?; Que deus foi esquecido?; Que deus os outros deuses temem?
Religiões | ☦ | !religiao,conceito,faccao,divindade  | religi|f[eé]|igreja|culto|credo|templo|sacerdo | As crenças organizadas: templos, sacerdotes, dogmas. | Qual a religião oficial?; Que heresia cresce?; Quem lucra com a fé?
Além da vida | ✝ | religiao,conceito,plano  | al[eé]m|p[oó]s-morte|para[ií]so|inferno|reencarna|alma | O que acontece depois da morte. | Para onde vão as almas?; Alguém já voltou?; O que se faz para ter uma boa morte?
Textos sagrados | 📜 | livro,item  | sagrad|escritura|livro santo|c[aâ]non|evangelho|sutra | Os livros e palavras que não se discutem. | Quem escreveu?; Que trecho foi apagado?; Quem pode ler?
Profecias | 🗡 | !profecia,conceito,evento  | profecia|prof[eé]t|press[aá]gio|or[aá]culo|vis[aã]o | O que foi previsto e ainda não aconteceu. | Quem a profecia aponta?; Quem quer que ela falhe?; E se a profecia foi inventada?
Seitas | 👁 | religiao,faccao  | seita|culto|her[eé]tic|fan[aá]tic | Cultos à margem: fanáticos, hereges, adoradores do proibido. | O que eles adoram?; Como recrutam?; Que poder eles têm de verdade?`,
  fantastico: `
Dons únicos | ✨ | magia,conceito  | dom|poder|habilidade|talento|maldi[cç][aã]o|bên[cç][aã]o | Poderes que só alguns têm. | Quem nasce com o dom, e o que acontece com eles?; O dom tem preço?; Quem caça os dotados?
Criaturas mágicas | 🦄 | criatura | m[aá]gic|drag[aã]o|fada|f[eé]nix|unic[oó]rnio|grifo | Seres feitos de magia ou tocados por ela. | De onde vêm?; Que parte deles vale ouro?; Qual é amiga dos mortais?
Magia | 🪄 | !magia,conceito  | magia|feiti[cç]o|encanta|mana|arcano|ritual m[aá]gico | Como a magia funciona: fonte, custo, limites. | De onde vem a magia?; Qual o custo de usá-la?; O que a magia não pode fazer?
Vida alienígena | 🛸 | especie,criatura | alien[ií]gen|extraterrestre|estelar|de outro mundo | Vida de outros mundos. | Por que vieram?; Como se comunicam?; O que eles acham de nós?
Inteligências construídas | 🤖 | especie,personagem | aut[oô]mato|golem|rob[oô]|constru[ií]d|artificial|m[aá]quina pensante | Golens, autômatos, máquinas que pensam. | Quem os fez, e eles obedecem?; Eles sonham?; Têm direitos?
Assombrações | 👻 | criatura | fantasma|esp[ií]rito|assombra|espectro|morto-vivo|alma penada | Fantasmas, espíritos e coisas que não descansam. | Por que não descansam?; O que os prende?; Quem conversa com eles?
Mutações | 🧪 | criatura,especie | muta|aberra[cç]|corrompid|deformad | Seres mudados por magia, radiação, maldição. | O que causou a mudança?; Ela se espalha?; Como os mutantes são tratados?
Itens lendários | 🗡 | item | lend[aá]ri|rel[ií]quia|artefato|[uú]nic | Armas e objetos de poder. | Quem o forjou, e com que preço?; Onde está agora?; O que acontece com quem o usa?
Magia proibida | 🧿 | magia,conceito  | proibid|necromancia|sangue|sombria|demon[ií]ac|maldita | O que os magos juram nunca fazer. | Por que foi proibida?; Quem ainda pratica?; O que aconteceu da última vez?`,
  sombrio: `
Crime | ☠ | faccao,evento | crime|ladr[aã]o|assassin|roubo|gangue|m[aá]fia | Ladrões, assassinos, quadrilhas. | Qual crime é mais comum?; Quem manda no submundo?; Que crime famoso nunca foi resolvido?
Foras da lei | 🏴 | faccao | bandido|pirata|fora da lei|rebelde|salteador|exilad | Bandidos, piratas, rebeldes e exilados. | Onde se escondem?; Quem os protege?; Algum deles é herói do povo?
Armadilhas | 🪤 | conceito,lugar | armadilha|trap|cilada|emboscada | Perigos escondidos em masmorras, estradas e palácios. | Quem a construiu, e o que protege?; Como se desarma?; Quem caiu nela por último?
Enigmas | 🧩 | conceito | enigma|charada|quebra-cabe[cç]a|segredo|mist[eé]rio|c[oó]digo | Charadas, códigos e mistérios a resolver. | Qual o enigma que ninguém resolveu?; O que ganha quem resolver?; Quem plantou as pistas?
Tecnologia proibida | ⛔ | conceito,item | proibid|banid|perigos|destrui | Invenções que foram enterradas por um motivo. | Por que foi proibida?; Quem ainda a constrói?; O que ela fez da última vez?
Colapsos | 💥 | evento | colapso|ru[ií]na|falha|cat[aá]strofe|desastre|queda | Quando a ordem falha: fome, inflação, cidades que caem. | O que pode fazer tudo desmoronar?; Que colapso aconteceu antes?; Quem se prepara para o fim?
Doenças | 🦠 | conceito,evento | doen[cç]a|peste|praga|febre|epidemia|cont[aá]gi | Pestes, febres, maldições que se espalham. | Como se pega?; Tem cura?; Quem é culpado (com razão ou não)?`,
  terras: `
Desertos | 🏜 | lugar | deserto|areia|duna|o[aá]sis | Areia, sede e caravanas. | Onde fica a água?; Quem vive aqui por escolha?; O que a areia esconde?
Ermos | 🪨 | lugar | ermo|terra[s]? devastad|c[aâ]nion|badland|planalto seco | Terras secas e rachadas, cânions e mesetas. | O que destruiu esta terra?; Quem atravessa?; O que cresce aqui?
Florestas | 🌳 | lugar | floresta|bosque|mata|selva | Árvores, sombra e o que se esconde nelas. | Quem é dono da floresta?; Que parte dela ninguém volta?; O que se caça aqui?
Rios e lagos | 🏞 | lugar | rio|lago|lagoa|riacho|cachoeira|delta | Água doce que liga, separa e alimenta. | Que rio é fronteira?; Que lago tem lenda no fundo?; Quem cobra a travessia?
Montanhas | ⛰ | lugar | montanha|serra|pico|monte|cordilheira|desfiladeiro | Picos, passagens e o que mora no alto. | Qual a passagem mais perigosa?; Quem mora no pico?; O que se minera?
Campos | 🌾 | lugar | campo|pradaria|plan[ií]cie|estepe|savana | Planícies abertas, pastos e cavaleiros. | Quem cavalga por aqui?; O que se planta?; De onde vem o perigo numa terra sem esconderijo?
Mares | 🌊 | lugar | mar|oceano|golfo|ba[ií]a|costa|estreito | Mares, costas, rotas e piratas. | Que rota marítima é mais rica?; O que existe além do horizonte?; Quem manda no mar?
Terras geladas | 🧊 | lugar | gelo|neve|tundra|glacial|[aá]rtico|polar | Neve, gelo e noites longas. | Como se sobrevive ao inverno?; O que está congelado no gelo?; Quem vive aqui por exílio?
Selvas | 🌴 | lugar | selva|floresta tropical|mata densa|jungle | Mata densa, quente e cheia de vida (e veneno). | Que cidade a selva engoliu?; Que planta é a mais valiosa?; Quem conhece as trilhas?
Ilhas | 🏝 | lugar | ilha|arquip[eé]lago|atol | Pedaços de terra cercados de mar. | Que ilha não está nos mapas?; Quem chegou primeiro?; Do que vivem?
Subterrâneo | 🕳 | lugar | caverna|gruta|subterr[aâ]ne|t[uú]nel|masmorra|abismo | Cavernas, túneis, cidades sob a terra. | O que vive lá embaixo?; Quem cavou os túneis?; Até onde vai?
Vulcões | 🌋 | lugar | vulc[aã]o|lava|cratera|vulc[aâ]nic | Fogo da terra: lava, cinza e solo fértil. | Quando foi a última erupção?; Quem adora o vulcão?; O que a lava cobriu?
Pântanos | 🐸 | lugar | p[aâ]ntano|brejo|charco|mangue|lama | Água parada, névoa e caminhos que somem. | Quem se esconde no pântano?; Que luz enganosa atrai viajantes?; O que cresce só aqui?
Clima e tempestades | 🌪 | conceito,evento | clima|tempestade|furac[aã]o|mon[cç][aã]o|seca|enchente|esta[cç][aã]o | Estações, ventos e as tempestades que mudam a história. | Que estação é a mais temida?; Que tempestade virou lenda?; Quem lê o tempo?`,
  cosmos: `
Céu noturno | ✦ | conceito | estrela|constela[cç]|c[eé]u|astro|astronom | Estrelas, constelações e o que elas contam. | Que constelação guia os navegantes?; Que estrela nova apareceu?; Quem lê o destino nas estrelas?
Sol e luas | 🌙 | conceito | sol|lua|eclipse|mar[eé] | Quantos sóis, quantas luas, e o que fazem com as marés e as pessoas. | O que acontece num eclipse?; Que lua é de mau agouro?; Como as luas mudam o calendário?
Planetas | 🪐 | lugar,conceito | planeta|mundo|orbe|esfera | O mundo como planeta: forma, tamanho, vizinhos. | O mundo é redondo, plano, oco?; Quem já viu a borda?; Há outros mundos no céu?
Cometas | ☄ | evento,conceito | cometa|meteoro|aster[oó]ide|estrela cadente | Coisas que caem ou passam pelo céu. | Que cometa volta de tempos em tempos?; O que caiu do céu e onde?; O que o povo acha que eles anunciam?
Outros planos | 🌀 | !plano,lugar,conceito  | plano|dimens[aã]o|portal|multiverso|reino espiritual|outro mundo | Planos espirituais, terras feéricas, infernos, outros mundos. | Como se passa de um plano a outro?; O que vive do outro lado?; O que vaza para cá?
Mundos dos mortos | ⚱ | plano,lugar,conceito  | submundo|inferno|reino dos mortos|limbo|hades | Para onde vão os mortos, se vão a algum lugar. | Dá para visitar?; Quem governa lá?; O que se paga para voltar?`,
  narrativa: `
Enredo | 🧵 | historia | * | O que acontece: a cadeia de causas que leva do começo ao fim. | O que muda entre a primeira e a última cena?; Qual a virada do meio?; O que o leitor espera que aconteça e não acontece?
Personagens | 🧑 | personagem | * | Quem vive a história: o que querem, o que temem, como mudam. | Quem muda mais durante a história?; Quem é o antagonista, e por que ele acha que está certo?; Quem o leitor vai amar?
Conflito | ⚡ | conflito,historia | * | O que impede quem quer de conseguir o que quer. | Qual o conflito central, numa frase?; O que está em jogo se o herói falhar?; Qual o conflito interno?
Premissa | 💡 | historia | * | A ideia de partida, numa frase: "e se...?". | E se...?; Por que esta história só acontece neste mundo?; Qual a pergunta que o final responde?`,
};

function parseElements(): Element[] {
  const out: Element[] = [];
  for (const [family, block] of Object.entries(DATA)) {
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const [nome, glyph, tipo, palavras, desc, qs] = line.split(' | ').map((x) => x.trim());
      const marcados = tipo!.split(',').map((x) => x.trim());
      const tipos = marcados.map((x) => x.replace(/^!/, ''));
      out.push({
        id: slug(nome!), nome: nome!, family, glyph: glyph!, tipo: tipos[0]!, tipos, inteiros: marcados.filter((x) => x.startsWith('!')).map((x) => x.slice(1)), desc: desc!,
        perguntas: qs!.split(';').map((q) => q.trim()).filter(Boolean),
        palavras: palavras === '*' ? null : new RegExp(palavras!, 'i'),
      });
    }
  }
  return out;
}

export const ELEMENTS: Element[] = parseElements();

export const elementById = (id: string): Element | undefined => ELEMENTS.find((e) => e.id === id || fold(e.nome) === fold(id));

export type CoverLevel = 'vazio' | 'iniciado' | 'vivo' | 'fora';

export interface ElementCoverage {
  element: Element;
  level: CoverLevel;
  entities: Entity[];
}

/** Texto em que as palavras do elemento são procuradas: nome, apelidos, resumo e propriedades. */
function haystack(e: Entity): string {
  const props = Object.entries(e.props)
    .filter(([k]) => !/^(mundo|world|tipo|type|imagem)$/i.test(k))
    .map(([k, v]) => `${k} ${asList(v).join(' ')}`)
    .join(' ');
  return `${e.name} ${e.aliases.join(' ')} ${e.summary} ${props}`;
}

/** Elementos que a ficha declara em `elemento:` (ou `elementos:`). */
export function declaredElements(e: Entity): Element[] {
  const key = Object.keys(e.props).find((k) => /^elementos?$/i.test(k));
  if (!key) return [];
  return asList(e.props[key]).map((v) => elementById(v.replace(/^\[\[|\]\]$/g, ''))).filter((x): x is Element => !!x);
}

/** Elementos fora do mundo (`fora do mundo:` na nota do mundo). */
export function ignoredElements(w: World): Set<string> {
  const p = w.props ?? {};
  const key = Object.keys(p).find((k) => /^fora do mundo$/i.test(k.trim()));
  return new Set(key ? asList(p[key]).map((v) => elementById(v)?.id ?? slug(v)) : []);
}

/**
 * Quanto o mundo cobre de cada elemento: `vazio`, `iniciado` (uma ficha ou
 * duas), `vivo` (três ou mais, ou uma bem preenchida) ou `fora`.
 */
export function elementCoverage(w: World): ElementCoverage[] {
  const ignored = ignoredElements(w);
  const declared = new Map<string, Entity[]>();
  for (const e of w.entities) for (const el of declaredElements(e)) declared.set(el.id, [...(declared.get(el.id) ?? []), e]);
  const dated = timeline(w).length;
  return ELEMENTS.map((el) => {
    if (ignored.has(el.id)) return { element: el, level: 'fora' as const, entities: [] };
    const found = new Set<Entity>(declared.get(el.id) ?? []);
    for (const e of w.entities) {
      if (!el.tipos.includes(e.type)) continue;
      if (!el.palavras || el.inteiros.includes(e.type) || el.palavras.test(haystack(e))) found.add(e);
    }
    const list = [...found];
    let n = list.length;
    // a linha do tempo conta datas, não só eventos
    if (el.id === 'linha-do-tempo') n = Math.max(n, Math.floor(dated / 2));
    const level: CoverLevel = n === 0 ? 'vazio' : n >= 3 || list.some((e) => e.score >= 0.6) ? 'vivo' : 'iniciado';
    return { element: el, level, entities: list };
  });
}

/** Resumo por família: quantos elementos cobertos de quantos (sem os de fora). */
export function familyCoverage(cov: ElementCoverage[]): Array<{ family: ElementFamily; done: number; total: number }> {
  return ELEMENT_FAMILIES.map((f) => {
    const l = cov.filter((c) => c.element.family === f.id && c.level !== 'fora');
    return { family: f, done: l.filter((c) => c.level !== 'vazio').length, total: l.length };
  });
}

/** Modelo de ficha nascida de um elemento: já marcada com `elemento` e com as perguntas como seções. */
export function elementSections(el: Element): string[] {
  return el.perguntas;
}

/** Valor de texto de uma propriedade (para a tela, sem importar o frontmatter). */
export const propText = (e: Entity, k: string): string => {
  const key = Object.keys(e.props).find((x) => fold(x) === fold(k));
  return key ? asText(e.props[key]) : '';
};
