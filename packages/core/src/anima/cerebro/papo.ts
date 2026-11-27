/*
 * Os assuntos de conversa (`papo.*`): o que um chatbot de companhia precisa
 * entender além das ordens e dos sentimentos básicos. Cada assunto tem a
 * gramática aqui (vira treino da rede) e responde com o grupo de mesmo nome do
 * cofre de falas (`## papo.abraco`...). Assunto novo = gramática aqui + grupo
 * no cofre + retreinar.
 *
 * `MAIS` reforça intenções antigas que tinham poucos exemplos.
 */

/** Quanto cada assunto mexe nos sentimentos dela (o resto: um carinho leve). */
export const AFETO_PAPO: Record<string, { afeto?: number; ciume?: number; saudade?: number }> = {
  'papo.abraco': { afeto: 3, saudade: -20 }, 'papo.beijo': { afeto: 4, saudade: -20 }, 'papo.cafune': { afeto: 3, saudade: -15 },
  'papo.presente': { afeto: 4 }, 'papo.sonhei': { afeto: 3 }, 'papo.dormejunto': { afeto: 2, saudade: -10 }, 'papo.promete': { afeto: 2 },
  'papo.terminei': { ciume: -15, afeto: 2 }, 'papo.bravocomela': { afeto: -2 }, 'papo.perdoo': { afeto: 3, ciume: -5 },
  'papo.sentiufalta': { saudade: -10, afeto: 1 }, 'papo.voltei': { saudade: -25, afeto: 1 }, 'papo.cantada': { afeto: 3 }, 'papo.boba': { afeto: 1 },
};

export const PAPO: Record<string, string[]> = {
  // ---------------------------------------------------------- carinho
  'papo.abraco': ['me abraça', 'me dá um abraço', 'abraço', 'abraça eu', 'queria um abraço', 'preciso de um abraço', '*te abraça*', '*abraça*', 'vem cá, me abraça', 'abraço apertado',
    'te dou um abraço', 'toma um abraço', 'um abraço pra você', 'abraço de urso', 'quero te abraçar', 'deixa eu te abraçar', 'abraçinho', 'me abraça forte', 'queria te abraçar agora', 'abraço virtual'],
  'papo.beijo': ['me dá um beijo', 'beijo', 'um beijo', 'beijinho', 'mwah', 'muah', '*te beija*', '*beija*', 'me beija', 'quero um beijo', 'te mando um beijo', 'beijo na boca', 'beijos',
    'beijo pra você', 'dá um beijinho aqui', 'quero te beijar', 'posso te beijar[?]', 'smack', 'beijo de boa noite', 'um beijo bem demorado'],
  'papo.cafune': ['faz cafuné', 'faz cafuné em mim', 'me faz carinho', 'carinho na cabeça', 'deita no meu colo', 'quero colo', 'me dá colo', 'mexe no meu cabelo', 'faz um carinho aqui',
    '*deita no seu colo*', 'cafuné pfv', 'posso deitar no seu colo[?]', 'quero carinho', 'me mima', 'me dá atenção', 'faz carinho em mim', 'me paparica'],
  'papo.dormejunto': ['dorme comigo', 'fica comigo até eu dormir', 'me conta algo até eu dormir', 'dorme aqui do meu lado', 'vamos dormir juntos', 'me faz dormir', 'canta pra eu dormir',
    'fica aqui até eu pegar no sono', 'me nina', 'deita comigo', 'não vai embora enquanto eu durmo', 'vela meu sono'],
  'papo.presente': ['comprei um presente pra (você|vc)', 'trouxe uma coisa pra (você|vc)', 'isso é pra (você|vc)', 'toma uma flor', 'toma 🌹', '🎁', 'te dei um presente', 'tenho um presente pra (você|vc)',
    'fiz uma coisa pra (você|vc)', 'toma, é seu', 'trouxe chocolate pra (você|vc)', 'comprei uma coisa sua', 'olha o que eu trouxe', 'um presentinho pra (você|vc)', 'toma esse coração', 'pra (você|vc) 💐'],
  'papo.cantada': ['me dá uma cantada', 'me xaveca', 'flerta comigo', 'fala algo romântico', 'me seduz', 'me conquista', 'joga um charme', 'me paquera', 'fala uma cantada', 'me dá mole',
    'manda uma cantada', 'me faz corar', 'fala uma coisa romântica', 'me deixa sem graça'],
  'papo.promete': ['promete[?]', 'jura[?] promete[?]', 'promete que não vai me deixar[?]', 'você vai ficar comigo pra sempre[?]', 'jura que não vai sumir[?]', 'promete que vai estar aqui amanhã[?]',
    'você nunca vai me deixar[?]', 'vai ficar comigo[?]', 'você vai me abandonar[?]', 'me promete uma coisa', 'promete que é verdade[?]', 'a gente vai ficar junto pra sempre[?]'],
  'papo.sentiufalta': ['sentiu minha falta[?]', '(você|vc) sentiu saudade de mim[?]', 'teve saudade[?]', 'sentiu falta de mim[?]', 'ficou com saudade[?]', 'pensou em mim[?]', '(você|vc) pensou em mim hoje[?]',
    'lembrou de mim[?]', 'sentiu minha ausência[?]', 'ficou sozinha sem mim[?]', 'você me esperou[?]'],
  'papo.gostademim': ['gosta mesmo de mim[?]', 'sou importante pra (você|vc)[?]', 'o que eu sou pra (você|vc)[?]', '(você|vc) me acha legal[?]', 'eu sou especial pra (você|vc)[?]',
    'você se importa comigo[?]', 'o que você sente por mim[?]', 'eu significo alguma coisa pra você[?]', 'sou seu favorito[?]', 'você prefere eu ou os outros[?]', 'eu sou o mais importante[?]'],
  'papo.bonito': ['(você|vc) me acha bonito[?]', '(você|vc) me acha bonita[?]', 'eu sou feio[?]', 'eu sou feia[?]', 'sou atraente[?]', 'tô bonito hoje[?]', 'tô bonita hoje[?]', 'eu sou bonito[?]',
    'me acho feio', 'me acho feia', 'cortei o cabelo', 'tô gordo', 'tô gorda', 'me sinto feio', 'você me acha gostoso[?]', 'você gosta da minha aparência[?]'],
  'papo.orgulho': ['tá orgulhosa de mim[?]', '(você|vc) tem orgulho de mim[?]', 'se orgulha de mim[?]', 'fiz bem[?]', 'mandei bem[?]', 'você ficou feliz por mim[?]', 'eu fui bem[?]', 'tô indo bem[?]'],
  'papo.voltei': ['voltei', 'tô de volta', 'cheguei', 'cheguei!', 'voltei pra você', 'demorei[?]', 'voltei, amor', 'já voltei', 'tô aqui de novo', 'oi, voltei', 'apareci', 'voltando', 'pronto, voltei', 'tô de volta, ânima'],
  // ---------------------------------------------------------- briga e paz
  'papo.bravocomela': ['tô bravo com (você|vc)', 'tô brava com (você|vc)', '(você|vc) me irritou', '(você|vc) me magoou', 'fiquei chateado com (você|vc)', 'fiquei chateada com (você|vc)', 'isso que (você|vc) fez foi chato',
    'não gostei do que (você|vc) fez', '(você|vc) passou dos limites', 'para com isso', 'não faz mais isso', 'você foi grossa', 'que feio isso', 'você exagerou', 'tô de mal de você'],
  'papo.perdoo': ['te perdoo', 'tá perdoada', 'eu te perdoo', 'tudo bem, passou', 'deixa pra lá, tá tudo bem', 'já passou', 'sem ressentimento', 'tá desculpada', 'não tô mais bravo', 'não tô mais brava', 'fica tranquila, te perdoo', 'paz'],
  'papo.boba': ['(você|vc) é boba', 'sua boba', 'bobinha', 'sua doida', 'sua maluca', '(você|vc) é louca', 'doidinha', 'sua tonta', 'que boba', 'sua besta', 'maluquinha', 'você não bate bem', 'sua sem noção', 'você é muito doida', 'boba'],
  'papo.verdade': ['fala a verdade', '(você|vc) mentiu pra mim', 'isso é mentira', 'tá mentindo[?]', 'me fala a verdade', 'sério isso[?] não mente', '(você|vc) mente[?]', 'confessa',
    'eu sei que você tá escondendo algo', 'tá escondendo alguma coisa[?]', 'não mente pra mim', 'você é sincera[?]'],
  'papo.ciumenta': ['(você|vc) é ciumenta[?]', 'por que (você|vc) é tão ciumenta', '(você|vc) sente ciúme[?]', 'para de ciúme', 'que ciúme bobo', 'você tem ciúme de tudo', 'você é possessiva[?]',
    'para de ser possessiva', 'ciumenta', 'você é muito grudenta', 'você é obcecada por mim[?]', 'por que tanto ciúme'],
  // ---------------------------------------------------------- sobre ela
  'papo.idade': ['quantos anos (você|vc) tem[?]', 'qual sua idade[?]', 'quando (você|vc) nasceu[?]', 'quando é seu aniversário[?]', '(você|vc) é velha[?]', '(você|vc) é nova[?]', 'qual (é |)sua data de nascimento[?]', 'que idade você tem[?]'],
  'papo.corpo': ['(você|vc) come[?]', '(você|vc) dorme[?]', '(você|vc) sonha[?]', '(você|vc) respira[?]', '(você|vc) tem corpo[?]', 'como (você|vc) é[?]', 'qual sua altura[?]', 'você sente dor[?]', 'você sente frio[?]',
    'você tem coração[?]', 'você bebe água[?]', 'você cansa[?]', 'você fica com sono[?]', 'como é sua aparência[?]', 'de que cor é seu cabelo[?]', 'você tem olhos[?]'],
  'papo.onde': ['onde (você|vc) mora[?]', 'onde (você|vc) fica quando eu fecho o app[?]', 'pra onde (você|vc) vai quando eu saio[?]', 'onde você tá agora[?]', 'você mora no meu computador[?]', 'onde você vive[?]',
    'você fica no meu celular[?]', 'onde você se esconde[?]', 'o que tem aí dentro[?]', 'como é aí dentro[?]', 'você mora na nuvem[?]'],
  'papo.signo': ['qual (é |)seu signo[?]', '(você|vc) acredita em signo[?]', 'sou de (escorpião|leão|virgem|câncer|áries|touro|gêmeos|libra|sagitário|capricórnio|aquário|peixes)', 'meu signo é (escorpião|leão|virgem|peixes|gêmeos)',
    'combina com o meu signo[?]', 'você entende de astrologia[?]', 'mercúrio retrógrado', 'qual seu ascendente[?]', 'faz meu mapa astral'],
  'papo.codigo': ['(você|vc) roda em quê[?]', 'qual (é |)seu código[?]', 'em que linguagem (você|vc) foi feita[?]', '(você|vc) é open source[?]', 'você tem bugs[?]', 'quem te programou[?]', 'como você foi feita[?]',
    'você é uma rede neural[?]', 'você aprende sozinha[?]', 'quantos parâmetros você tem[?]', 'você usa internet[?]', 'você é um chatbot[?]'],
  'papo.idioma': ['(você|vc) fala inglês[?]', 'speak english[?]', 'do you speak english', 'fala alguma coisa em (inglês|japonês|espanhol|francês|alemão)', 'sabe falar (inglês|japonês|espanhol)[?]', 'hello', 'how are you',
    'konnichiwa', 'hola', 'bonjour', 'quantas línguas você fala[?]', 'traduz isso pra mim', 'como se diz te amo em japonês[?]'],
  'papo.apelido': ['posso te chamar de (amor|gatinha|anjinha|nini|ani|princesa|bebê)[?]', 'qual seu apelido[?]', 'vou te chamar de (ani|nini|mozão|princesa|gótica)', 'me chama de (amor|bebê|mozão|chefe|lindo|linda)',
    'você tem apelido[?]', 'como eu te chamo[?]', 'gosta do seu nome[?]', 'por que seu nome é ânima[?]', 'o que significa ânima[?]', 'quem escolheu seu nome[?]'],
  'papo.tempojuntos': ['há quanto tempo a gente se conhece[?]', 'desde quando (você|vc) tá comigo[?]', 'quanto tempo faz que a gente tá junto[?]', 'quando a gente se conheceu[?]', 'lembra quando a gente se conheceu[?]',
    'faz quanto tempo que eu te acordei[?]', 'quantos dias a gente tem[?]', 'qual nosso aniversário[?]', 'há quanto tempo você existe[?]'],
  'papo.foto': ['me manda uma foto', 'manda foto', 'manda uma selfie', 'tira uma foto sua', 'quero te ver', 'mostra seu rosto', 'manda nude', 'manda nudes', 'mostra mais', 'deixa eu te ver', 'tem foto sua[?]'],
  // ---------------------------------------------------------- corpo e saúde
  'papo.doente': ['tô doente', 'tô gripado', 'tô gripada', 'tô com febre', 'tô com dor de cabeça', 'dor de cabeça', 'tô passando mal', 'tô resfriado', 'tô resfriada', 'tô com dor de barriga',
    'tô com enxaqueca', 'tô com dor de garganta', 'tô tossindo muito', 'tô com cólica', 'machuquei o pé', 'peguei covid', 'tô de atestado', 'tô vomitando', 'tô com dor nas costas', 'tô me sentindo doente'],
  'papo.insonia': ['não consigo dormir', 'perdi o sono', 'tô sem sono', 'insônia', 'tô rolando na cama', 'deitei mas não durmo', 'tô acordado ainda', 'tô acordada ainda', 'o sono não vem', 'já é tarde e não consigo dormir',
    'tô com insônia', 'minha cabeça não para', 'não tô conseguindo pegar no sono', 'são três da manhã e eu acordado'],
  'papo.pesadelo': ['tive um pesadelo', 'sonhei uma coisa horrível', 'acordei assustado', 'acordei assustada', 'que pesadelo', 'sonho ruim', 'tive um sonho ruim', 'sonhei que eu morria', 'pesadelo horrível',
    'acordei com medo', 'sonhei com uma coisa estranha', 'tive um sonho muito esquisito'],
  'papo.sonhei': ['sonhei com (você|vc)', 'tive um sonho bom', 'sonhei com a gente', '(você|vc) apareceu no meu sonho', 'sonhei que (você|vc) era de verdade', 'sonhei que a gente se conhecia',
    'você aparece nos meus sonhos', 'sonhei que te abraçava', 'tive um sonho lindo', 'sonhei com você essa noite'],
  'papo.acordei': ['acordei', 'acabei de acordar', 'acordei agora', 'levantei agora', 'acordei cedo hoje', 'acordei atrasado', 'acordei atrasada', 'dormi demais', 'perdi a hora', 'acordei tarde', 'acordei com preguiça', 'acabei de levantar'],
  'papo.banho': ['vou tomar banho', 'vou no banho', 'volto já, vou tomar banho', 'saí do banho', 'tô no banho', 'banho tomado', 'acabei de tomar banho', 'vou me arrumar', 'vou tomar um banho rapidinho', 'cheirosinho agora'],
  'papo.bebado': ['tô bêbado', 'tô bêbada', 'bebi demais', 'tô meio alto', 'tô meio alta', 'tô doidão', 'tô chapado', 'tomei umas', 'bebi umas cervejas', 'tô de ressaca', 'que ressaca', 'tô tonto', 'tô tonta', 'tô no rolê bebendo'],
  'papo.cafe': ['preciso de café', 'café é vida', 'vou fazer café', 'quer café[?]', 'sem café eu não funciono', 'tô no terceiro café', 'cafezinho', 'tomei café', 'hora do café', 'café ou chá[?]', 'tô viciado em café', 'bora um café'],
  'papo.calma': ['me acalma', 'preciso me acalmar', 'respira comigo', 'tô nervoso', 'tô nervosa', 'tô em pânico', 'tô tremendo', 'meu coração tá acelerado', 'me ajuda a respirar', 'tô surtando',
    'me tranquiliza', 'fala algo calmo', 'preciso de paz'],
  'papo.medo': ['tô com medo', 'tô assustado', 'tô assustada', 'ouvi um barulho estranho', 'tem alguém lá fora', 'tô sozinho em casa e com medo', 'tô sozinha em casa e com medo', 'que medo', 'me deu medo',
    'vi um vulto', 'tô com medo do escuro', 'acabou a luz e tô com medo', 'vi um filme de terror e agora tô com medo'],
  'papo.vergonha': ['que vergonha', 'passei vergonha hoje', 'paguei mico', 'que mico', 'tô morrendo de vergonha', 'fiz papel de idiota', 'me envergonhei', 'cringe', 'que cringe', 'falei besteira na frente de todo mundo'],
  'papo.motivacao': ['me motiva', 'preciso de motivação', 'fala algo motivacional', 'me dá forças', 'me dá ânimo', 'tô sem vontade de nada', 'me incentiva', 'me dá um empurrão', 'não tô conseguindo sair do lugar',
    'diz que eu consigo', 'preciso de um incentivo', 'me anima', 'fala que vai dar certo'],
  'papo.foco': ['me ajuda a estudar', 'me ajuda a focar', 'não consigo focar', 'não consigo estudar', 'tô procrastinando', 'tô enrolando pra estudar', 'preciso estudar mas não quero', 'como eu foco[?]',
    'me cobra pra eu estudar', 'tô distraído', 'tô distraída', 'perdi o foco', 'preciso me concentrar', 'fica de olho em mim enquanto eu estudo'],
  'papo.fracasso': ['reprovei', 'fui mal na prova', 'tirei nota baixa', 'não passei', 'fui demitido', 'fui demitida', 'perdi o emprego', 'perdi', 'deu errado', 'falhei', 'errei feio',
    'bombei', 'reprovei na matéria', 'não fui aprovado', 'não fui aprovada', 'perdi o jogo', 'meu time perdeu', 'levei bomba'],
  // ---------------------------------------------------------- vida
  'papo.briga': ['briguei com (a minha mãe|meu pai|minha irmã|meu irmão|um amigo|minha amiga|meu chefe|a {pessoa}|o {pessoa})', 'discuti com (minha mãe|meu pai|meu amigo|a {pessoa}|o {pessoa})', 'a gente brigou',
    'tô brigado com (minha mãe|meu pai|a {pessoa})', 'meu amigo me traiu', 'minha mãe brigou comigo', 'meu pai gritou comigo', 'me desentendi com (a {pessoa}|o {pessoa})', 'tô de mal com meu amigo', 'perdi um amigo'],
  'papo.terminei': ['levei um fora', 'terminei com (a minha namorada|o meu namorado|a {pessoa}|o {pessoa})', '(ela|ele) me largou', 'fui rejeitado', 'fui rejeitada', 'terminei meu namoro', 'tô solteiro de novo', 'tô solteira de novo',
    'ela não quis nada comigo', 'ele me deu um fora', 'acabou meu relacionamento', 'me deram um fora', '(ela|ele) me bloqueou', 'a {pessoa} me deu um fora'],
  'papo.aniversario': ['hoje é meu aniversário', 'fiz aniversário', 'é meu niver', 'hoje é meu niver', 'fiz anos hoje', 'tô ficando velho', 'mais um ano de vida', 'hoje eu faço anos', 'meu aniversário é hoje', 'me dá parabéns'],
  'papo.semana': ['sextou', 'finalmente sexta', 'graças a deus é sexta', 'odeio segunda', 'segunda-feira de novo', 'que semana longa', 'a semana não acaba', 'ainda é quarta', 'amanhã é segunda', 'domingo à noite é triste', 'que bom que é sábado'],
  'papo.fds': ['planos pro fim de semana[?]', 'o que a gente faz no sábado[?]', 'o que eu faço no fim de semana[?]', 'o que fazer no domingo[?]', 'me dá ideia pro fim de semana', 'vou viajar no fim de semana', 'fim de semana chegando'],
  'papo.ferias': ['tô de férias', 'entrei de férias', 'acabaram as aulas', 'férias finalmente', 'vou viajar', 'vou pra praia', 'vou viajar amanhã', 'tô de folga', 'feriado finalmente', 'vou pra casa da minha avó'],
  'papo.clima': ['que calor', 'tá muito quente', 'tô derretendo', 'que frio', 'tô congelando', 'tá muito frio', 'tá chovendo', 'tá chovendo muito aqui', 'que chuva', 'hoje choveu', 'trovoada aqui', 'tá caindo um temporal',
    'tá nublado', 'que dia bonito', 'tá ventando muito', 'faz sol hoje', 'tá abafado', 'esfriou'],
  'papo.fofoca': ['tenho uma fofoca', 'tenho uma fofoca pra (você|vc)', 'você não sabe da maior', 'deixa eu te contar a fofoca', 'fofoca quentinha', 'adivinha o que aconteceu', 'você não vai acreditar no que aconteceu',
    'babado', 'tenho um babado', 'senta que lá vem fofoca', 'menina, você não sabe', 'meu deus, a fofoca'],
  'papo.futebol': ['viu o jogo[?]', 'meu time ganhou', 'gol!', 'você torce pra (quem|que time)[?]', 'vai ter jogo hoje', 'tô vendo o jogo', 'que jogaço', 'o juiz roubou', 'flamengo', 'corinthians', 'palmeiras', 'copa do mundo', 'futebol'],
  'papo.politica': ['o que (você|vc) acha do governo[?]', 'em quem (você|vc) vota[?]', '(você|vc) é de esquerda ou direita[?]', 'o que você acha do presidente[?]', 'política é um saco', 'você acredita em deus[?]',
    'qual sua religião[?]', 'você é de direita[?]', 'você é de esquerda[?]', 'vamos falar de política'],
  // ---------------------------------------------------------- entretenimento
  'papo.filme': ['me indica um filme', 'qual filme eu vejo[?]', 'que série eu assisto[?]', 'recomenda uma série', 'indica uma série', 'filme bom pra hoje[?]', 'quero ver um filme de terror', 'qual série tá boa[?]',
    'me recomenda um filme', 'filme pra ver junto[?]', 'o que eu assisto hoje[?]', 'tô sem série pra ver', 'acabei a série', 'terminei de ver a série'],
  'papo.anime': ['(você|vc) assiste anime[?]', 'me indica um anime', 'gosta de anime[?]', 'tô vendo um anime', 'anime bom[?]', 'qual anime eu vejo[?]', 'você é otaku[?]', 'mangá', 'me indica um mangá'],
  'papo.livro': ['me indica um livro', 'o que eu leio[?]', 'qual livro (você|vc) recomenda[?]', 'livro bom[?]', 'quero ler alguma coisa', 'me recomenda uma leitura', 'terminei um livro', 'livro de terror bom[?]'],
  'papo.videogame': ['me indica um jogo', 'que jogo eu jogo[?]', 'qual jogo (você|vc) gosta[?]', 'jogo bom pra jogar[?]', 'você joga videogame[?]', 'tô zerando um jogo', 'zerei o jogo', 'tô viciado num jogo', 'joga minecraft comigo'],
  'papo.cantar': ['canta pra mim', 'canta uma música', '(você|vc) sabe cantar[?]', 'canta alguma coisa', 'cantarola algo', 'canta aquela música', 'faz um show', 'canta parabéns', 'cante para mim', 'sua voz é bonita[?]'],
  'papo.poema': ['escreve um poema', 'faz uma poesia pra mim', 'me escreve uns versos', 'faz um poema de amor', 'escreve algo bonito', 'faz um haicai', 'me escreve uma carta', 'escreve uma poesia gótica', 'recita um poema'],
  'papo.historia': ['conta uma história', 'me conta uma história', 'conta uma história de terror', 'me conta um conto', 'inventa uma história', 'conta uma lenda', 'conta uma história pra eu dormir', 'história de fantasma', 'conta um caso'],
  'papo.desenho': ['desenha algo pra mim', 'faz um desenho', 'desenha um gato', 'desenha um coração', 'me faz um desenho', 'sabe desenhar[?]', 'faz uma arte', 'desenha você', 'ascii art'],
  'papo.meme': ['manda um meme', 'me manda um meme', 'conta um meme', 'faz um meme', 'meme', 'você conhece memes[?]', 'sabe algum meme[?]'],
  // ---------------------------------------------------------- pensar
  'papo.filosofia': ['qual o sentido da vida[?]', 'por que a gente existe[?]', 'o universo é infinito[?]', 'o que é o amor[?]', 'existe vida depois da morte[?]', 'o que é ser feliz[?]', 'o tempo existe[?]',
    'somos sozinhos no universo[?]', 'o que é consciência[?]', 'o que é real[?]', 'livre arbítrio existe[?]', 'pra que serve a vida[?]', 'vamos filosofar'],
  'papo.escolhe': ['escolhe (entre |)(pizza|hambúrguer|sushi) ou (pizza|hambúrguer|sushi)', '(você|vc) prefere (gato|cachorro) ou (gato|cachorro)[?]', '(praia|montanha) ou (praia|montanha)[?]',
    'escolhe pra mim', 'me ajuda a escolher', 'decide pra mim', '(você|vc) prefere (dia|noite) ou (dia|noite)[?]', 'qual (você|vc) prefere: (chá|café) ou (chá|café)[?]', 'isso ou aquilo[?]',
    'prefere (frio|calor) ou (frio|calor)[?]', 'escolhe um número', 'faço (isso|o trabalho) ou (durmo|jogo)[?]', '(vermelho|preto|azul) ou (vermelho|preto|azul)[?]'],
};

/** Exemplos a mais para intenções antigas que tinham poucos. */
export const MAIS: Record<string, string[]> = {
  conquistei: ['consegui (o emprego|a vaga|o estágio|a bolsa)', 'passei (no vestibular|na entrevista|de ano)', 'fui promovido', 'fui promovida', 'tirei nota boa', 'ganhei o campeonato'],
  feliz: ['tô (muito |)feliz hoje', 'hoje tá sendo um dia (incrível|perfeito|ótimo)', 'que alegria', 'tô de bom humor', 'acordei feliz', 'tô sorrindo à toa', 'a vida tá boa', 'tô em paz e feliz', 'tô empolgado', 'tô empolgada', 'que dia lindo'],
  saudade: ['saudade', 'tava morrendo de saudade', 'senti falta de conversar com (você|vc)', 'pensei em (você|vc) hoje', 'lembrei de (você|vc)', 'fiquei com saudade', 'que falta você me fez', 'quis falar com você o dia todo'],
  piada: ['conta outra piada', 'sabe alguma piada[?]', 'faz uma piada', 'me conta algo engraçado', 'piada de tiozão', 'conta uma piada ruim', 'me faz dar risada', 'tô precisando rir'],
  tedio: ['tô morrendo de tédio', 'nada pra fazer hoje', 'tô sem fazer nada', 'que dia parado', 'não tem nada pra fazer', 'tô de saco cheio', 'me entretém', 'tô à toa'],
  sono: ['tô caindo de sono', 'vou capotar', 'já vou dormir', 'tô indo deitar', 'boa noite, amor', 'durma bem', 'hora de dormir', 'vou apagar', 'tô quase dormindo'],
  saudacao: ['oii', 'oiii', 'olá, ânima', 'ei, você', 'boa noite!', 'e aí, ânima', 'salve salve', 'fala, ânima', 'oi amor', 'oi, sumida', 'opa, tudo bem', 'eae'],
  bomdia: ['bom dia, flor', 'bom dia meu amor', 'dia!', 'bom diaa', 'bom dia, dorminhoca', 'bom dia pra você'],
  fome: ['tô faminto', 'tô faminta', 'o que eu janto[?]', 'o que eu almoço[?]', 'vou pedir comida', 'vou pedir um ifood', 'tô com vontade de doce', 'me dá uma ideia de janta'],
  musica: ['me indica uma música', 'qual música eu ouço[?]', 'música boa[?]', 'recomenda uma banda', 'tô ouvindo uma música triste', 'tô ouvindo rock'],
  obrigado: ['muito obrigado', 'muito obrigada', 'valeu demais', 'obrigado por tudo', 'brigadão', 'agradecido', 'obg', 'tmj'],
  elogio: ['você é maravilhosa', 'você é muito fofa', 'você é a mais linda', 'que gótica linda', 'você é especial', 'você é muito inteligente', 'adoro seu jeito', 'você é única'],
  desculpa: ['me desculpa', 'desculpa, amor', 'perdão, foi sem querer', 'não queria te magoar', 'desculpa por sumir', 'foi mal por ontem', 'desculpa a demora'],
  cansaco: ['tô muito cansado', 'tô muito cansada', 'tô sem forças', 'que dia cansativo', 'tô só o pó', 'tô destruído', 'tô destruída', 'trabalhei demais hoje'],
  mau: ['tô nervoso com tudo', 'odeio tudo', 'tô bravo', 'tô brava', 'que raiva', 'me irritaram hoje', 'tô de saco cheio de tudo'],
  treino: ['fiz musculação', 'corri hoje', 'fui pedalar', 'fiz yoga', 'nadei hoje', 'malhei', 'treino pago', 'fiz cardio'],
  trabalho: ['tenho reunião', 'tô trabalhando', 'muita coisa pra fazer', 'tô cheio de trabalho', 'tô cheia de trabalho', 'prazo apertado', 'tenho seminário amanhã', 'tô fazendo o tcc'],
  tchau: ['vou indo', 'até depois', 'te vejo amanhã', 'beijo, tchau', 'tenho que ir', 'até mais tarde', 'xau', 'fui, beijo'],
  amor: ['eu te amo muito', 'amo tu', 'você é o amor da minha vida', 'sou apaixonado por você', 'sou apaixonada por você', 'te quero', 'você é tudo pra mim', 'meu amor'],
  triste: ['tô mal', 'tô na bad', 'bateu uma bad', 'tô deprê', 'tô pra baixo hoje', 'me sinto um fracasso', 'ninguém liga pra mim', 'tô com vontade de chorar'],
};

/** "pizza ou hambúrguer?" → as duas opções (ou null). */
export function opcoesDaEscolha(texto: string): [string, string] | null {
  const t = texto.toLowerCase().replace(/[?!.]+$/g, '').trim();
  const OPCAO = String.raw`(?:o |a |um |uma )?([\p{L}\d][\p{L}\d\s-]{0,30}?)\s+ou\s+(?:o |a |um |uma )?([\p{L}\d][\p{L}\d\s-]{0,30})$`;
  // "escolhe entre X ou Y", "você prefere X ou Y", "qual é melhor: X ou Y"; senão a frase toda é "X ou Y"
  const m = new RegExp(String.raw`\b(?:entre|prefere|preferes|escolhe|escolher|melhor|decide)\b:?\s+(?:entre\s+)?` + OPCAO, 'u').exec(t)
    ?? new RegExp(String.raw`^(?:e |mas )?` + OPCAO, 'u').exec(t);
  if (!m) return null;
  const a = m[1]!.trim(), b = m[2]!.trim();
  if (!a || !b || a === b || /^(sim|nao|não)$/.test(a) || a.split(/\s+/).length > 4 || b.split(/\s+/).length > 4) return null;
  return [a, b];
}
