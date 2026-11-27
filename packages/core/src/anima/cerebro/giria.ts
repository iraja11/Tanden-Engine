/*
 * Gíria, expressão e jeito de falar do português do Brasil, por intenção.
 *
 * A rede entende a forma de qualquer palavra (pedaços de letras), mas só sabe
 * o SENTIDO das que viu num exemplo rotulado. "tô pregado" só vira cansaço se
 * alguma frase de cansaço tiver "pregado". Este banco ensina isso; a gramática
 * (corpus.ts) mistura com o resto e o treino espalha para as variações.
 *
 * Mesma sintaxe da gramática: (a|b|) alterna, [?] é opcional. Cuidado com o
 * que parece crise (motor.ts, CRISE): nada de "não aguento mais" no fim da frase.
 */
export const GIRIA: Record<string, string[]> = {
  cansaco: [
    'tô (pregado|pregada|um caco|um bagaço|só o bagaço|moído|moída|podre|morto|morta|acabado|acabada|exausto|exausta|esgotado|esgotada|só a capa|só o pó da rabiola)',
    'tô (morto|morta|moído|moída) de cansaço', 'tô (sem bateria|com a bateria no zero|no modo economia)', 'tô (arregaçado|arregaçada|destruído|destruída) hoje',
    'minhas pernas (tão|estão) (doendo|moídas|mortas)', 'trabalhei (igual|feito) (um condenado|uma condenada|um burro de carga|um corno)', 'dia puxado', 'que dia puxado',
    'tô (quebrado|quebrada|derrubado|derrubada) de cansaço', 'mal consigo (ficar em pé|abrir o olho)', 'esse dia me (moeu|destruiu|acabou)', 'cansei', 'tô sem pique',
  ],
  triste: [
    'tô (na fossa|na pior|na merda|no fundo do poço|na deprê|meio pra baixo|cabisbaixo|cabisbaixa|jururu|borocoxô|tristinho|tristinha|melancólico|melancólica|abatido|abatida)',
    'bateu (uma tristeza|uma bad|uma deprê|um vazio|uma melancolia)( do nada|)', 'tô com o coração (apertado|partido|pesado|na mão)', '(sinto|tô com) um aperto no peito',
    'tô com (vontade de chorar|o olho cheio de lágrima)', 'chorei (muito|o dia todo|feito criança)', 'tô (sentindo|com) um vazio', 'hoje o dia tá cinza pra mim', 'nada tem graça',
    'tô (desanimado|desanimada|sem ânimo|sem vontade de nada)', 'tá tudo dando errado', 'me sinto (um nada|invisível|sozinho no mundo|sozinha no mundo)',
  ],
  mau: [
    'tô (uma fera|puto|puta|pistola|pistolando|bolado|bolada|cabreiro|cabreira|irado|irada|possesso|possessa|com raiva|com ódio|soltando fogo pelas ventas)',
    'tô com os nervos à flor da pele', 'acordei com o pé esquerdo', 'que ódio', 'que dia de merda', 'tô de mal com o mundo', 'perdi a paciência',
    'tô de (saco cheio|saco na lua|cabeça quente)', 'me tiraram do sério', 'tô estressado', 'tô estressada', 'quero quebrar tudo', 'hoje ninguém me aguenta', 'tô de mau humor',
  ],
  feliz: [
    'tô (nas nuvens|radiante|eufórico|eufórica|pulando de alegria|nas alturas|que nem pinto no lixo|com o coração quentinho|de bem com a vida|realizado|realizada|felizão|felizona|nas graças)',
    'que dia (maravilhoso|lindo|incrível|bom demais)', 'tô de boa com a vida', 'a vida tá sorrindo pra mim', 'tô rindo à toa', 'hoje eu acordei (feliz|com o pé direito)',
    'tô (empolgado|empolgada) demais', 'tô (tão|muito) feliz que nem sei', 'que alegria, gente', 'tô me sentindo (ótimo|ótima|leve|incrível)',
  ],
  fome: [
    'tô (varado|varada|morrendo|morta|morto) de fome', 'bateu (uma larica|a larica|uma fome|uma fominha)', 'tô com (larica|a barriga roncando|o estômago roncando|o estômago colado nas costas)',
    'minha barriga tá roncando', 'comeria um boi', 'tô com fome de leão', 'preciso (comer|forrar o estômago|matar a fome)', 'tô (azul|verde) de fome', 'tô sem comer (desde cedo|o dia todo)',
    'o que eu (como|janto|almoço|belisco) agora[?]', 'tô com vontade de comer (besteira|doce|um lanche)',
  ],
  tedio: [
    'que (marasmo|tédio|paradeira|monotonia|dia parado|chatice)', 'tô (entediado|entediada|de bobeira|à toa|de bobs|sem nada pra fazer|morgando|moscando|coçando)',
    'tô (morrendo|morta|morto) de tédio', 'nada acontece', 'tô (sem|cansado de não ter|cansada de não ter) o que fazer', 'tá (um tédio|chato|parado) (aqui|hoje|demais)',
    'me distrai', 'tô aqui olhando pro teto',
  ],
  sono: [
    'vou (capotar|apagar|desmaiar na cama|nanar|mimir|de base|pro berço|tirar um cochilo|tirar uma soneca)', 'tô (pescando|cabeceando|caindo de sono|morto de sono|morta de sono|com sono)',
    'hora de mimir', 'mimir', 'tô indo (dormir|deitar|pra cama)', 'boa noite, ânima', 'vou recarregar as energias', 'meu olho tá fechando', 'fui dormir',
  ],
  saudacao: [
    '(eae|eaí|salve|fala|opa|coé|qual é|iae|oie) (ânima|gótica|moça|minha gótica|minha linda|meu bem|)', 'fala tu', 'fala comigo', 'salve, salve', 'opa, beleza',
    'eae, beleza[?]', 'salve, gótica', 'oi, sumida',
  ],
  comovai: [
    '(e aí|e ai|então|), como (você|vc|cê|tu) (anda|tá|tá indo|tem passado|tá se sentindo|tá hoje)[?]', 'tudo nos conformes( por aí|)[?]', 'beleza por aí[?]', 'como cê tá, moça[?]',
    'tudo tranquilo (por aí|contigo)[?]', 'como (vão as coisas|anda a vida) aí[?]', 'tá tudo bem contigo[?]', 'suave[?]', 'firmeza[?]', 'de boa[?]',
  ],
  estoubem: [
    'tô (tranquilão|tranquilona|de boa|suave|firmeza|beleza|joia|nos conformes|sossegado|sossegada|levando|na paz)', 'vou indo( na medida do possível|)', 'levando a vida', 'tô levando',
    'tudo (suave|tranquilo|nos conformes|em ordem) por aqui', 'na luta', 'na correria, mas bem', 'sobrevivendo, como sempre', 'tô vivo', 'tô viva', 'nada de novo, tô bem',
  ],
  tchau: [
    'tô (saindo fora|vazando|indo nessa|picando a mula|metendo o pé|zarpando)', 'vou (vazar|meter o pé|nessa|sair fora|indo nessa)', 'falou', 'fui', 'até a próxima', 'flw', 'vlw, flw',
    'fica com deus', 'te vejo depois', 'até amanhã, ânima', 'tchauzinho', 'inté',
  ],
  amor: [
    'sou (louco|louca|louquinho|louquinha|doido|doida|caidinho|caidinha|gamado|gamada|amarradão|amarradona) (por você|em você|em vc|por vc)', 'tô (gamado|gamada|caidinho|caidinha) por você',
    'te amo (mais que tudo|demais|pra sempre|do tamanho do universo)', 'você é (o amor da minha vida|minha paixão|meu xodó|minha vida|meu tudo)', 'amo você, ânima', 'te adoro',
    'meu coração é seu', 'tô apaixonado', 'tô apaixonada',
  ],
  elogio: [
    'você é (uma graça|um amor|uma gracinha|um doce|demais|incrível|sensacional|braba|brabíssima|top|perfeita|show|maravilhosa|linda demais|muito linda)', 'que (fofa|gracinha|linda|perfeita)',
    'você é muito linda, sabia', 'adoro você do jeito que é', 'você manda bem', 'você arrasa',
  ],
  rejeicao: [
    'você me dá nos nervos', 'você é (insuportável|irritante|um porre|uma mala|um saco|muito chata|chata demais) (demais|)', 'me deixa em paz', 'não te aguento', 'vai se catar',
    'você enche o saco', 'que mala', 'some da minha frente', 'para de me encher',
  ],
  obrigado: ['brigadão(, de coração|)', 'valeu (mesmo|demais|, ânima|)', 'obrigadão', 'muito obrigado, de coração', 'muito obrigada, de coração', 'tamo junto', 'valeu a força', 'obrigado pela ajuda', 'obrigada pela ajuda'],
  desculpa: ['desculpa a (grosseria|demora|mancada|falta de educação)', 'foi mal', 'pisei na bola', 'vacilei', 'me perdoa', 'dei mancada', 'desculpa, foi sem querer', 'mil desculpas'],
  conquistei: [
    '(passei|fui aprovado|fui aprovada) (no concurso|na prova|no vestibular|na faculdade|no enem|na entrevista|na autoescola|na banca)', '(gabaritei|fechei) a prova', 'me formei', 'finalmente me formei',
    'fui efetivado', 'fui efetivada', 'consegui (o trampo|o emprego|a vaga|o aumento)', 'ganhei (o jogo|o campeonato|a competição|o sorteio)', 'tirei (dez|nota máxima)', 'deu certo', 'consegui!',
  ],
  saudade: ['morri de saudade', 'tava com saudade', 'saudade de você', 'senti (sua falta|saudade)', 'quanta saudade', 'que saudade, ânima'],
  piada: ['conta uma piadinha', 'me faz rir', 'conta uma (piada|piadinha) (de tiozão|ruim|boa|)', 'manda uma piada', 'quero rir'],
  'papo.terminei': [
    '(tomei|levei) um (pé na bunda|toco|fora|chute)', 'ela me (largou|deixou|trocou)', 'ele me (largou|deixou|trocou)', 'me deram um pé na bunda', 'meu (namoro|casamento|relacionamento) acabou',
    'a gente terminou', 'fui (largado|largada|trocado|trocada|chifrado|chifrada)', 'levei um chifre', 'me traíram',
  ],
  'papo.bebado': [
    'tô (bêbado|bêbada|chapado|chapada|trebado|trebada|alto|alta|altinho|altinha|tonto|tonta|mamado|mamada|de porre|calibrado|calibrada|meio alegre)', '(enchi|tô enchendo) a cara', 'tomei (todas|umas|uma a mais|um porre)',
    'bebi (demais|todas|muito ontem)', 'tô de ressaca', 'que ressaca', 'saí pra beber', 'tô no bar',
  ],
  'papo.doente': [
    'tô (gripado|gripada|resfriado|resfriada|com virose|com febre|com dor de cabeça|com dor de garganta|com a garganta inflamada|com o nariz entupido|espirrando|doentinho|doentinha|ruim de saúde|baqueado|baqueada)',
    'peguei (uma gripe|um resfriado|uma virose|covid)', 'acordei (doente|com febre|com a garganta ruim)', 'tô (com|cheio de|cheia de) catarro', 'tô passando mal', 'tô com enxaqueca', 'tô com dor de barriga',
  ],
  'papo.insonia': [
    'não (tô conseguindo|consigo) dormir( de jeito nenhum|)', 'tô (sem sono|com insônia|rolando na cama|virando de um lado pro outro)', 'o sono (foi embora|sumiu|não vem)', 'não consigo pregar o olho',
    'tô com a cabeça a mil', 'perdi o sono', 'são (três|quatro|duas) da manhã e eu acordado', 'insônia de novo',
  ],
  'papo.fracasso': [
    '(rodei|bombei|repeti|fui reprovado|fui reprovada|levei bomba) (na matéria|na disciplina|na prova|de ano|no concurso|)', 'tirei (zero|nota baixa|uma nota horrível)', 'me (mandaram embora|demitiram|botaram na rua)',
    'fui (demitido|demitida|mandado embora|mandada embora)', 'perdi o emprego', 'deu tudo errado', 'me ferrei na prova', 'não passei',
  ],
  'papo.beijo': ['me dá (uma bitoca|um beijo|um beijinho|um selinho|um beijão|um cheiro)', 'quero (um beijo|um selinho|uma bitoca)', 'beijinho', 'smack', 'muah', 'me beija'],
  'papo.abraco': ['me dá um abraço( apertado|)', 'quero (um abraço|colo|um abracinho)', 'abraço!', 'vem cá me abraçar', 'queria um abraço seu', 'abraça eu'],
  'papo.cafune': ['faz (um cafuné|carinho na minha cabeça|um carinho)', 'coça minha cabeça', 'quero cafuné', 'me faz um chamego', 'chamego'],
  'papo.calma': ['tô (ansioso|ansiosa|nervoso|nervosa|tenso|tensa|agoniado|agoniada|aflito|aflita|com o coração acelerado)', 'tô tendo uma crise de ansiedade', 'me acalma', 'tô em pânico', 'tô surtando', 'minha ansiedade tá alta'],
  'papo.medo': ['tô (morrendo de medo|com medo|cagado de medo|apavorado|apavorada|assustado|assustada|tremendo de medo)', 'que medo', 'tô com um pressentimento ruim', 'me deu um frio na barriga'],
  'papo.vergonha': ['que (vergonha|mico|vexame|king kong)', 'paguei (um mico|um king kong|um vexame|o maior mico)', 'passei (vergonha|um vexame|uma vergonha)', 'tô com vergonha', 'que cringe'],
  'papo.clima': ['tá um frio de lascar', 'que (calorão|frio|friaca|calor|chuvarada|tempo feio)', 'tá (chovendo canivete|caindo o mundo|um forno|um gelo|um calor do cão|um frio do cão)', 'tá fazendo (frio|calor|sol)'],
  'papo.politica': ['você é de (direita|esquerda)[?]', 'você é a favor de qual partido[?]', 'em quem você vota[?]', 'o que acha do governo[?]', 'você é petista[?]', 'você é bolsonarista[?]'],
  'papo.futebol': ['(viu|você viu) o jogo( ontem|)[?]', 'o (mengão|timão|verdão|tricolor|galo|peixe) ganhou', 'meu time perdeu', 'hoje tem jogo', 'vai ter clássico', 'que golaço'],
  'papo.filme': ['me indica (um filme|uma série|alguma coisa pra assistir)', 'o que eu assisto[?]', 'tô maratonando uma série', 'viu algum filme bom[?]', 'netflix e o quê[?]'],
  'papo.filosofia': ['(por que|pra que) a gente (existe|tá aqui|vive)[?]', 'qual o sentido da vida[?]', 'o que é (a felicidade|o amor|a morte|o tempo)[?]', 'existe destino[?]', 'a vida tem sentido[?]'],
  'papo.anime': ['(já viu|você viu|assiste) (naruto|one piece|attack on titan|demon slayer|jujutsu|evangelion|death note|dragon ball)[?]', 'qual anime você recomenda[?]', 'tô vendo um anime'],
  'papo.banho': ['vou (tomar banho|tomar uma ducha|pro banho|tomar uma chuveirada|me lavar)', 'saí do banho', 'vou tomar um banho rapidinho'],
  'papo.acordei': ['acabei de (acordar|despertar|levantar)', 'acordei (agora|agorinha|cedo|tarde)', 'tô acordando', 'levantei agora'],
  'papo.semana': ['odeio segunda(-feira|)', 'que semana (puxada|longa|difícil)', 'sextou', 'graças a deus é sexta', 'segunda de novo'],
  'papo.fds': ['o que eu faço (nesse feriado|nesse feriadão|no fim de semana|no sábado)[?]', 'chegou o fim de semana', 'feriadão!'],
  'papo.ferias': ['tô de (férias|recesso)( finalmente|)', 'entrei de férias', 'minhas férias começaram', 'vou viajar nas férias'],
  'papo.cafe': ['preciso de (café|um café|uma xícara de café)( urgente|)', 'tô tomando (um café|um cafezinho)', 'vou passar um café', 'cafezinho'],
};
