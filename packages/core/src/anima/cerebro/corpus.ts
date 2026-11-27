/*
 * O corpus: de onde vêm os exemplos que ensinam o classificador. Ninguém
 * precisa escrever 20 mil frases à mão: uma gramática pequena gera frases,
 * e um gerador de ruído as estraga do jeito que gente estraga (gíria, erro de
 * digitação, sem acento, letra esticada, vocativo, "pfv", palavrão, emoji).
 *
 * Sintaxe dos modelos:
 *   (a|b|c)   escolhe um
 *   [x]       opcional (metade das vezes)
 *   {slot}    um valor da lista SLOTS (pode ter modelos dentro)
 *
 * O mesmo corpus serve ao treino no Node (rápido, sem dependência) e ao
 * treino na GPU (scripts/anima-cerebro/treinar.py lê o que o Node exporta).
 */

import { MAIS, PAPO } from './papo';
import { GIRIA } from './giria';

// ------------------------------------------------------------------ valores

export const SLOTS: Record<string, string[]> = {
  nota: ['receitas', 'ideias', 'diário', 'projeto do tcc', 'lista de compras', 'campanha de rpg', 'contos', 'estudos de cálculo', 'reunião de segunda', 'Eldoria',
    'poemas', 'metas de 2026', 'livros pra ler', 'treino de perna', 'faculdade', 'filmes', 'música', 'viagem', 'senhas', 'anotações de física', 'personagens', 'sonhos',
    'finanças', 'Projeto Corvo', 'roteiro do vídeo', 'aula de inglês', 'Notas da Sessão 3', 'bestiário', 'cartas', 'trabalho de história'],
  titulo: ['{nota}', 'ideias pro conto', 'lista de mercado', 'planos pro fim de semana', 'coisas que eu aprendi hoje', 'resumo de química', 'Eldoria: deuses', 'músicas favoritas',
    'presentes de natal', 'perguntas pro professor', 'rascunho', 'sessão 4'],
  coisa: ['comprar pão', 'tirar o lixo', 'ligar pra minha mãe', 'pagar o boleto', 'estudar cálculo', 'tomar o remédio', 'regar as plantas', 'mandar o email pro professor',
    'levar o cachorro no veterinário', 'buscar a encomenda', 'responder a Bia', 'renovar o livro da biblioteca', 'lavar a roupa', 'treinar', 'revisar o tcc', 'beber água',
    'comprar ração', 'marcar o dentista', 'devolver o livro', 'fazer a inscrição', 'cortar o cabelo', 'arrumar o quarto', 'trocar a lâmpada', 'pagar a fatura'],
  quando: ['amanhã às 9h', 'hoje às 18h', 'sexta 14h', 'daqui a 20 minutos', 'em 1 hora', 'segunda de manhã', 'dia 15', '15/11 às 10h', 'toda segunda 7h', 'no sábado',
    'às 22h', 'semana que vem', 'amanhã', 'hoje à noite', 'quinta às 19h30', 'daqui a pouco', 'em 10 min', 'domingo', 'dia 3 de dezembro', 'terça que vem às 8h', 'amanhã cedo'],
  evento: ['{evento_estudo}', '{evento_encontro}', '{evento_geral}'],
  evento_estudo: ['prova de cálculo', 'prova da faculdade', 'prova de física', 'apresentação do tcc', 'seminário de história', 'entrega do trabalho', 'simulado', 'vestibular',
    'enem', 'defesa do tcc', 'aula de inglês', 'prova final', 'monitoria', 'grupo de estudo', 'prova de anatomia', 'p2 de estatística'],
  evento_encontro: ['sair com a {pessoa}', 'encontro com o {pessoa}', 'jantar com a {pessoa}', 'date com a {pessoa}', 'cinema com o {pessoa}', 'sair com uns amigos', 'festa na casa da {pessoa}',
    'barzinho com a galera', 'encontrar meu crush', 'sair com a minha ficante', 'jantar romântico', 'rolê com a {pessoa}', 'encontro do tinder', 'café com a {pessoa}'],
  evento_geral: ['dentista', 'médico', 'reunião com o chefe', 'academia', 'aniversário da minha mãe', 'consulta', 'viagem pra praia', 'show', 'corte de cabelo', 'entrevista de emprego',
    'terapia', 'sessão de rpg', 'reunião do projeto', 'exame de sangue', 'almoço de família', 'call com o cliente'],
  pessoa: ['Bia', 'Léo', 'Júlia', 'Pedro', 'Carol', 'Ana', 'Lucas', 'Mari', 'Rafa', 'Gabi', 'Duda', 'Thiago', 'Lara', 'Vini'],
  tela: ['agenda', 'notas', 'calendário', 'lembretes', 'exercícios', 'treino', 'saúde', 'alimentação', 'biblioteca', 'mesa', 'mesa de rpg', 'mundos', 'world building', 'grafo',
    'quadros', 'planilhas', 'calculadora', 'flashcards', 'slides', 'sorte', 'arquivos', 'plugins', 'tela de hoje', 'bancos', 'luta', 'chatgpt', 'claude', 'chat da ia', 'ia', 'gemini'],
  tema: ['escuro', 'claro', 'dark', 'light', 'noturno', 'preto', 'outro', 'próximo', 'diurno'],
  dur: ['25 minutos', '10 min', 'meia hora', 'uma hora', '5 minutos', '45 minutos', '1h30', 'dez minutos', '90 segundos', '15 min', 'vinte minutos', '2 horas', '3 minutos'],
  dado: ['d20', '2d6', 'um d20', 'd6', '1d100', '3d6+2', 'dois dados', 'd12', 'd8', '4d6', '1d20+5', 'd4', 'um dado'],
  busca: ['cthulhu', 'receita de bolo', 'tarefas da semana', 'a {pessoa}', 'faculdade', 'dragões', 'tcc', 'prova', 'senha do wifi', 'vampiros', 'orçamento', 'magia', 'o Projeto Corvo'],
  ia: ['claude', 'chatgpt', 'gemini', 'copilot', 'siri', 'alexa', 'o gpt', 'outra ia'],
  cmd: ['exportar como pdf', 'favoritar essa nota', 'modo foco', 'duplicar a nota', 'grafo local', 'histórico de versões', 'mapa mental da nota', 'sumário', 'mostrar conexões',
    'aumentar a interface', 'diminuir o zoom', 'nota de ontem', 'revisão da semana', 'lista de compras', 'cardápio da semana', 'estudar flashcards', 'nova tarefa', 'copiar o link da nota',
    'juntar destaques', 'girar uma roleta', 'perguntar à bola 8', 'combate e iniciativa', 'nova sessão de rpg', 'salvar página web', 'atalhos de teclado', 'exportar em word',
    'próximo estilo', 'novo mapa mental', 'novo desenho', 'calculadora científica', 'simular investimento', 'continuar a leitura', 'renomear nota', 'progresso dos exercícios'],
  mundo: ['Eldoria', 'Aethel', 'Vharos', 'Nyrr', 'meu mundo', 'minha campanha', 'Kaldur', 'o reino de Morvane'],
  gosto: ['café', 'chuva', 'rpg', 'gatos', 'música', 'livros', 'terror', 'pizza', 'dormir', 'anime', 'chocolate', 'metal', 'praia', 'frio', 'séries', 'videogame', 'desenhar'],
  cidade: ['Recife', 'São Paulo', 'Curitiba', 'Belo Horizonte', 'Porto Alegre', 'Salvador', 'Fortaleza', 'Manaus', 'Natal'],
  trabalho: ['programação', 'design', 'enfermagem', 'direito', 'engenharia', 'marketing', 'professor', 'vendas', 'medicina', 'arquitetura'],
  bicho_tipo: ['gato', 'gata', 'cachorro', 'cachorra', 'calopsita', 'hamster', 'coelho', 'pet'],
  nome_bicho: ['Nyx', 'Luna', 'Thor', 'Mel', 'Pipoca', 'Salem', 'Bolinha', 'Paçoca', 'Frajola'],
  num: ['2', '3', '5', '7', '10', '12', '15', '20', '25', '42', '100', '144', 'dois', 'três', 'dez', 'vinte', 'cem', '1,5', '3.5', '80', '1000', 'quinze'],
  op: ['mais', 'menos', 'vezes', 'dividido por', 'x', '+', '-', '*', '/', 'elevado a'],
};

// ------------------------------------------------------------------ gramática

export const GRAMATICA: Record<string, string[]> = {
  // ---------------------------------------------------------- comandos
  'cmd.agenda': [
    '(coloca|põe|bota|marca|adiciona|agenda|salva|anota) [a|o|uma|um] {evento} (na agenda|no calendário|na minha agenda|) {quando}',
    '{evento} {quando}, (coloca|põe|marca|salva) (na agenda|no calendário|aí)',
    'marca {evento} (pra|para) {quando}',
    'tenho {evento} {quando}, (agenda|coloca na agenda|marca) (pra mim|aí|)',
    '(cria|faz) um evento [de] {evento} {quando}',
    '(adiciona|coloca) na agenda: {evento} {quando}',
    '(agenda|marca) {quando} {evento}',
    'vou ter {evento} {quando}, (coloca|põe) no calendário',
    '(coloca|põe) no (calendário|meu calendário) {evento} {quando}',
    'me (agenda|marca) {evento} {quando}',
    'quero marcar {evento} {quando}',
    'registra na agenda {evento} {quando}',
  ],
  'cmd.agenda_ver': [
    'o que eu tenho (hoje|amanhã|essa semana|sexta|no fim de semana)',
    'o que (tem|tá marcado|eu marquei) (na minha agenda|no calendário|pra hoje|pra amanhã|pra semana)',
    'tenho (alguma coisa|algum compromisso|prova|reunião) (hoje|amanhã|essa semana)[?]',
    'qual (é |)meu próximo compromisso',
    '(me fala|me diz|lê|mostra) (minha agenda|meus compromissos|o que eu tenho) (de hoje|de amanhã|da semana|)',
    'como tá minha agenda (hoje|amanhã|essa semana|)',
    'tô livre (hoje|amanhã|sexta|no sábado)[?]',
    'que horas é (a prova|o dentista|a reunião|meu compromisso)',
  ],
  'cmd.lembrete': [
    'me (lembra|lembre) de {coisa} {quando}',
    '(lembrete|lembra): {coisa} {quando}',
    '(cria|faz|coloca|põe) um lembrete (pra|de|para) {coisa} {quando}',
    'não me deixa esquecer de {coisa} {quando}',
    'me avisa {quando} (pra|de|para) {coisa}',
    '{quando} me lembra de {coisa}',
    '(coloca|adiciona) (nos lembretes|um lembrete): {coisa} {quando}',
    'preciso {coisa} {quando}, me lembra',
    'lembra de mim de {coisa} {quando}',
    'me cobra {coisa} {quando}',
    'me lembra {quando} de {coisa}',
  ],
  'cmd.abrir_nota': [
    'abre (a nota|minha nota|aquela nota|a) [de|do|da|sobre] {nota}',
    '(mostra|me mostra) a nota [de|do|da|sobre] {nota}',
    'quero ver (a nota|minha nota) [de|do|da] {nota}',
    '(vai|me leva) (na|pra|para a) nota [de|do|da] {nota}',
    'abre {nota}',
    'cadê (a nota|minha nota) [de|do|da] {nota}',
    'abre aquela nota (de|sobre) {nota}',
    'me abre {nota}',
    'puxa a nota {nota}',
    'abre o arquivo {nota}',
    'abre ela de novo',
    '(me mostra|mostra|abre) (minhas|meus|minha|meu) {nota}',
    'quero ler (a nota|minha nota|minhas notas) (de|sobre|do|da) {nota}',
  ],
  'cmd.criar_nota': [
    '(cria|faz|abre|começa) uma nota (nova|) (chamada|com o nome|com título|sobre|de) {titulo}',
    'nova nota[:] {titulo}',
    '(cria|faz) uma nota (nova|)',
    'quero uma nota nova (sobre|pra|chamada) {titulo}',
    '(começa|inicia) uma nota de {titulo}',
    'cria (a nota|uma página|um arquivo) {titulo}',
    'nota nova',
    'preciso de uma nota (nova|) (pra|sobre) {titulo}',
    'abre uma nota em branco',
    'faz uma nota pra eu escrever (sobre|de) {titulo}',
  ],
  'cmd.apagar_nota': [
    '(apaga|deleta|exclui|remove) (a nota|essa nota|minha nota|a) [de|do|da] {nota}',
    '(apaga|deleta|exclui) essa nota',
    'joga (a nota|) {nota} (no lixo|na lixeira|fora)',
    'manda (a nota|) {nota} pra lixeira',
    'some com (a nota|) {nota}',
    'não quero mais a nota {nota}, apaga',
    'apaga {nota}',
    'deleta isso',
    'pode apagar (a nota|) {nota}',
  ],
  'cmd.buscar': [
    '(procura|busca|pesquisa|acha|encontra) {busca} (nas notas|no cofre|pra mim|)',
    '(procura|busca|pesquisa) por {busca}',
    'onde (eu escrevi|eu anotei|tá) (sobre|o|a) {busca}',
    'tem alguma nota (sobre|com|falando de) {busca}[?]',
    'acha pra mim (onde fala de|) {busca}',
    'busca no cofre: {busca}',
    'em que nota (eu escrevi|tá) {busca}',
    'pesquisa {busca} aí',
  ],
  'cmd.ir': [
    '(vai|me leva|leva) (pra|para|pro|na|no) {tela}',
    '(abre|mostra|me mostra) (a|o|) {tela}',
    'quero ver (a|o|) {tela}',
    '(entra|vai) (na|no) (tela de|tela da|) {tela}',
    'tela de {tela}',
    'abre (a tela de|a aba de|a parte de) {tela}',
    'me mostra (a aba|a tela) {tela}',
    'troca pra {tela}',
  ],
  'cmd.tema': [
    '(coloca|muda|troca|põe|bota) (o tema|o modo|) (pra|para|pro|em|) {tema}',
    '(modo|tema) {tema}',
    'deixa (tudo|o app|a tela) {tema}',
    'liga o modo (escuro|noturno|claro)',
    '(troca|muda) (o tema|as cores|a aparência|o visual)',
    'apaga a luz',
    'tá muito claro aqui',
    'tá muito escuro, (clareia|deixa claro)',
    'quero o tema {tema}',
    'outro tema',
    'muda o estilo',
  ],
  'cmd.anotar': [
    '(anota|escreve|registra|guarda) (aí|isso|pra mim|) ?: {coisa}',
    '(anota|escreve) no (diário|meu diário|nota de hoje): {coisa}',
    'guarda isso: {coisa}',
    'coloca na nota de hoje (que|) {coisa}',
    'registra que (eu preciso|) {coisa}',
    'toma nota: {coisa}',
    'anota (aí|) que eu (preciso|tenho que|quero) {coisa}',
    'escreve na nota (aberta|que tá aberta): {coisa}',
    'acrescenta (no diário|na nota): {coisa}',
    'escreve no diário que (hoje|eu|) {coisa}',
    'escreve no (diário|meu diário) que (hoje foi um dia (bom|ruim|estranho)|eu tô (cansado|feliz)|{coisa})',
    'anota no diário que {coisa}',
    '(guarda|anota|salva) essa ideia: (um mago que {coisa}|{coisa}|uma história sobre {gosto})',
    'anota essa: {coisa}',
  ],
  'cmd.timer': [
    '(timer|cronômetro|temporizador) de {dur}',
    'me (avisa|chama|cutuca) (em|daqui a|depois de) {dur}',
    'conta {dur} (pra mim|)',
    '(põe|coloca|liga|começa) um (timer|cronômetro|alarme) de {dur}',
    '(começa|inicia|bora) um pomodoro',
    'pomodoro',
    'marca {dur} pra mim',
    'cronometra {dur}',
    'me dá {dur} e me chama',
  ],
  'cmd.dado': [
    '(rola|joga|tira|lança) (um|o|os|) {dado} (pra mim|)',
    '(rola|joga) os dados',
    'joga o dado',
    'dado de (20|6|100|12)',
    'rola iniciativa',
    '{dado} pra mim',
    'rola {dado} aí',
    'me dá um {dado}',
    'testa minha sorte num {dado}',
  ],
  'cmd.moeda': [
    'cara ou coroa',
    '(joga|tira|lança) (uma|a) moeda',
    'decide (pra mim|) no cara ou coroa',
    'joga cara ou coroa (pra mim|)',
    'tira no cara ou coroa',
    'moeda',
  ],
  'cmd.sync': [
    'sincroniza (as notas|tudo|agora|o cofre|)',
    '(salva|manda) tudo (no drive|pra nuvem|)',
    'faz o (sync|backup)',
    '(atualiza|sobe) (o drive|pra nuvem)',
    'sincroniza com o drive',
    'sync',
  ],
  'cmd.agua': [
    'bebi (água|um copo d\'água|um copo de água|agua)',
    '(registra|marca|anota) (um copo de água|água|que eu bebi água)',
    '(tomei|acabei de beber|acabei de tomar) água',
    '(mais|+1) um copo',
    'bebi meu copo',
    'água registrada',
    'tomei um copão de água',
  ],
  'cmd.treinar': [
    '(bora|vamos|quero) (treinar|malhar|me exercitar) (agora|hoje|)',
    '(começa|inicia|me passa) (um treino|o treino de hoje|o treino sugerido)',
    'treino de hoje',
    'me passa uns exercícios',
    '(pausa ativa|quero me alongar|alongamento)',
    'abre um treino rápido',
    'quero fazer exercício',
  ],
  'cmd.aleatoria': [
    '(abre|me mostra|sorteia) uma nota (aleatória|qualquer)',
    'nota aleatória',
    'me surpreende com uma nota',
    'qualquer nota',
    'abre alguma nota aí',
  ],
  'cmd.diario': [
    'abre (o diário|meu diário|a nota do dia) (de hoje|)',
    'nota de hoje',
    'diário de hoje',
    'abre minha nota de hoje',
    'quero escrever no diário',
    'abre o diário de (ontem|amanhã)',
  ],
  'cmd.som': [
    '(desliga|liga|tira|corta) o som',
    '(muta|silencia) (os sons|o app|tudo)',
    'sem som',
    'som (ligado|desligado)',
  ],
  'cmd.calar': [
    'fica quieta (um pouco|agora|)',
    'para de falar (um pouco|)',
    'silêncio (por favor|)',
    'me deixa (trabalhar|estudar|concentrar) (em paz|)',
    'modo silencioso',
    'não fala (por um tempo|agora|nada)',
    'dá um tempo (de falar|)',
    'fica caladinha',
    'shh',
    'preciso me concentrar, fica quieta',
    'fica quieta (por|uns|durante|) {dur}',
    '(silêncio|sem falar|calada) (por|uns|) {dur}',
    'não fala nada por {dur}',
  ],
  'cmd.esconder': [
    'se esconde',
    'sai da (tela|frente)',
    'vai pro canto',
    'esconde (aí|um pouco)',
    'tá na frente, sai',
    'se esconde aí',
    'some da tela um pouco',
  ],
  'cmd.dormir': [
    '(vai|pode ir) dormir',
    'dorme',
    'vai descansar',
    '(desliga|se desliga) (um pouco|)',
    'hora de dormir, ânima',
    'tira uma soneca',
  ],
  'cmd.voltar': [
    '(volta|aparece|sai daí|vem cá|vem)',
    'aparece (ânima|aí|)',
    'pode voltar',
    'volta pra tela',
    'cadê minha ânima',
  ],
  'cmd.mundo': [
    'escreve (alguma coisa|algo|uma ideia) (no meu mundo|em {mundo}|no world building|pro {mundo})',
    '(cria|inventa|escreve) uma (profecia|lenda|rumor|história) (pra|para|em|sobre) {mundo}',
    '(me dá|inventa) uma ideia (pro|para o|pra) {mundo}',
    '(adiciona|coloca) (algo|alguma coisa) no world building',
    'escreve no world building',
    'contribui com {mundo}',
    'inventa um personagem pra {mundo}',
    'escreve um segredo de {mundo}',
  ],
  'cmd.paleta': [
    '(executa|roda|aciona|usa|faz|ativa) (o comando|) {cmd}',
    '{cmd}',
    '(quero|preciso) {cmd}',
    'dá pra {cmd}[?]',
    'abre (a|o) {cmd}',
    'liga o {cmd}',
    '(favorita|duplica|exporta|renomeia) essa nota',
    'exporta (essa nota|isso) (em|como|pra) (pdf|word|html|markdown)',
    '(mostra|abre) o (histórico|sumário|grafo local)',
  ],

  // ---------------------------------------------------------- diálogo
  sim: ['sim', 'pode', 'pode sim', 'claro', 'isso', 'com certeza', 'uhum', 'aham', 'quero', 'manda ver', 'pode fazer', 'ok', 'tá bom', 'fechou', 'bora', 'sim por favor', 's',
    'positivo', 'exato', 'isso mesmo', 'certeza', 'sim sim', 'pode ser', 'claro que sim', 'yes', 'beleza, pode', 'tenho certeza', 'confirmo', 'pode apagar', 'faz', 'vai', 'a primeira'],
  nao: ['não', 'nem', 'nada', 'deixa', 'deixa pra lá', 'esquece', 'cancela', 'não quero', 'melhor não', 'agora não', 'nunca', 'n', 'não precisa', 'nem pensar', 'negativo',
    'de jeito nenhum', 'não, obrigado', 'não faz', 'pera, não', 'nops', 'não não', 'esquece isso', 'cancela isso'],
  porque: ['por quê', 'por que não', 'pq', 'por que você não fez', 'qual o motivo', 'explica', 'por que isso', 'como assim não', 'por que você recusou', 'por que você fez isso',
    'qual o problema', 'por que você tá assim', 'me explica', 'e por quê', 'motivo', 'por que você fez diferente'],
  insistir: ['faz logo', 'anda', 'eu mandei', 'faz o que eu pedi', 'faz isso agora', 'obedece', 'por favorzinho', 'vai, faz', 'anda logo porra', 'eu tô pedindo', 'faz isso pra mim',
    'anda ânima', 'sério, faz', 'é uma ordem', 'faz logo caralho', 'para de enrolar', 'só faz', 'faz aí vai', 'eu insisto', 'faz de uma vez', 'te pedi uma coisa simples',
    '(coloca|marca|põe|bota|cria|apaga|abre|muda|troca|rola|joga) logo', '(coloca|marca|faz|põe) (de uma vez|agora|logo porra|logo caralho)', 'anda, (coloca|marca|faz|abre)', 'vai, (coloca|marca|faz) logo',
    'para de frescura e (coloca|marca|faz)', 'não enrola, (coloca|faz)'],
  desfazer: ['desfaz', 'volta como estava', 'desfaz isso', 'não era isso, volta', 'tira isso', 'cancela o que você fez', 'volta o tema', 'desfaz o que você fez', 'ctrl z',
    'desfaz por favor', 'volta atrás', 'não era pra fazer isso', 'reverte'],
  repetir: ['de novo', 'outra vez', 'repete', 'faz de novo', 'mais uma', 'outra', 'rola de novo', 'mais uma vez', 'de novo pfv', 'repete aí', 'joga de novo'],
  tchau: ['tchau', 'falou', 'até mais', 'vou sair', 'vou nessa', 'fui', 'até amanhã', 'bye', 'até logo', 'flw', 'tô indo', 'preciso ir', 'te vejo depois', 'tchauzinho', 'vou desligar'],

  // ---------------------------------------------------------- habilidades
  conta: ['quanto é {num} {op} {num}', '(calcula|faz a conta de|quanto dá) {num} {op} {num}', '{num} {op} {num}', 'quanto é {num}% de {num}', 'raiz de {num}', '{num} ao quadrado',
    'o dobro de {num}', 'quanto dá {num} {op} {num} {op} {num}', 'me ajuda a calcular {num} {op} {num}', 'metade de {num}'],
  hora: ['que horas são', 'que hora é agora', 'sabe as horas', 'hora certa', 'me diz a hora', 'são que horas', 'que horas tem aí', 'horas'],
  data: ['que dia é hoje', 'hoje é que dia', 'qual a data de hoje', 'que dia da semana é hoje', 'estamos em que dia', 'data de hoje', 'em que mês a gente tá'],
  lembrar: ['qual (é |)o nome do meu {bicho_tipo}[?]', 'você lembra (do|o) meu nome[?]', 'onde eu moro[?]', 'quantos anos eu tenho[?]', 'do que eu gosto[?]', 'o que você sabe (sobre|de) mim',
    'quem é (a|o) {pessoa}[?]', 'o que eu te falei (da|do|sobre a|sobre o) {pessoa}', 'quando é meu aniversário[?]', 'do que eu tenho medo[?]', 'qual (é |)meu sonho[?]',
    'o que a gente tem em comum', 'você lembra do que eu te contei[?]', 'com o que eu trabalho[?]', 'o que eu odeio[?]', 'qual meu nome[?]', 'como eu me chamo[?]',
    'o que você lembra de mim', 'me diz o que você sabe da {pessoa}'],
  sobre_ela: ['você gosta de {gosto}[?]', 'qual (é |)sua cor favorita', 'o que você acha de {gosto}', 'você tem medo de quê', 'do que (você|vc) tem medo[?]', 'você tem medo de (escuro|barata|solidão)[?]', 'o que te dá medo[?]', 'qual (é |)seu sonho', 'do que você gosta[?]',
    'o que você tá fazendo', 'o que você tá pensando', 'você curte {gosto}[?]', 'qual sua música favorita', 'você odeia {gosto}[?]', 'qual seu filme favorito', 'você me ama[?]',
    'qual seu lugar favorito', 'o que você faz o dia todo'],
  fato: ['meu nome é {pessoa}', 'me chamo {pessoa}', 'eu tenho {num} anos', 'moro em {cidade}', 'trabalho com {trabalho}', 'eu gosto (muito|) de {gosto}', 'odeio {gosto}',
    'meu {bicho_tipo} se chama {nome_bicho}', 'tenho medo de (altura|barata|escuro|palhaço|avião)', 'meu sonho é (viajar pro japão|ter uma casa|escrever um livro)',
    'minha (amiga|mãe|irmã|chefe) {pessoa} (é muito legal|me ligou|veio aqui)', 'meu aniversário é dia (3 de maio|12/08|20 de janeiro)', 'eu estudo {trabalho}',
    'sou apaixonado por {gosto}', 'não gosto de {gosto}', 'tenho uma {bicho_tipo} chamada {nome_bicho}', 'saí com (a|o) {pessoa} ontem'],

  // ---------------------------------------------------------- conversa (os mesmos nomes das intenções antigas)
  amor: ['te amo', 'eu te amo', 'amo você', 'te adoro', 'gosto (muito|) de você', 'você é minha', 'minha ânima', 'casa comigo', 'te amo demais', '<3', 'amo vc', 'te amo muito sua doida',
    'você é a melhor', 'sou louco por você', 'te amo, sua gótica'],
  elogiame: ['me elogia', 'fala algo bom (de mim|)', 'diz uma coisa boa', 'o que você gosta em mim', 'me fala uma coisa bonita', 'elogia eu', 'me anima com um elogio'],
  rejeicao: ['te odeio', 'cala a boca', 'chata', 'você é (muito|) chata', 'vc é muito chata', 'vai embora', 'me deixa', 'sai daqui', 'irritante', 'insuportável', 'não gosto de você', 'esquisita', 'tenho medo de você', 'você é chata pra caralho',
    'que saco você', 'me deixa em paz', 'some daqui', 'para de encher o saco', 'você é um porre', 'não aguento você'],
  desinstalar: ['vou te desinstalar', 'vou te apagar', 'vou te deletar', 'vou desligar você', 'vou remover você', 'vou te desativar', 'quero te apagar', 'te deleto agora'],
  provoca: ['vou perguntar pro {ia}', 'o {ia} é melhor que você', 'tô falando com o {ia}', 'vou usar o {ia}', 'tenho um crush', 'tô ficando com alguém', 'arrumei uma namorada', 'conheci alguém',
    'o {ia} me entende melhor', 'troquei você pelo {ia}', 'tô namorando'],
  cansaco: ['tô cansado', 'tô cansada', 'exausto', 'esgotada', 'morto de cansaço', 'sem energia', 'acabado hoje', 'tô moída', 'não aguento mais esse dia', 'tô quebrado'],
  mau: ['tô de mau humor', 'tô irritado', 'que dia ruim', 'dia péssimo', 'tô puto', 'tô com raiva', 'odeio meu dia', 'tô estressada', 'puta da vida', 'que merda de dia'],
  triste: ['tô triste', 'hoje tô mal', 'tô chorando', 'me sinto sozinho', '(tô me sentindo|me sinto|ando me sentindo) (sozinho|sozinha|vazio|vazia|mal|um lixo|perdido|inútil)', 'tô ansiosa', 'tô pra baixo', 'tô desanimado', 'tá difícil', 'tô sofrendo', 'me sinto vazio', 'chorei hoje'],
  conquistei: ['consegui', 'passei na prova', 'fui aprovado', 'ganhei', 'deu certo', 'terminei o tcc', 'finalmente consegui', 'passei', 'tirei 10', 'fui contratado', 'bati minha meta'],
  feliz: ['tô feliz', 'que dia ótimo', 'tô animado', 'tô muito contente', 'hoje foi maravilhoso', 'tô alegre', 'tá tudo ótimo', 'tô radiante'],
  saudade: ['senti saudade', 'saudade de você', 'senti sua falta', 'tava com saudade', 'que saudade'],
  piada: ['conta uma piada', 'me faz rir', 'fala algo engraçado', 'me diverte', 'manda uma piada'],
  tedio: ['que tédio', 'tô entediado', 'nada pra fazer', 'tô de bobeira', 'que preguiça', 'tô sem nada pra fazer'],
  ideia: ['me dá uma ideia', 'tô sem ideia', 'o que eu faço', 'me inspira', 'não sei o que fazer', 'me ajuda a pensar', 'sugere alguma coisa', 'alguma sugestão'],
  real: ['você é real', 'você existe', 'você sente', 'você tem sentimentos', 'você é de verdade', 'você tem consciência', 'você pensa de verdade', 'você é uma ia'],
  quem: ['quem é você', 'o que é você', 'qual seu nome', 'de onde você veio', 'quem te criou', 'o que você é', 'me fala de você'],
  musica: ['tô ouvindo música', 'qual música você recomenda', 'me indica uma banda', 'tô com uma música na cabeça', 'que playlist eu ouço'],
  obrigado: ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'agradeço', 'obrigadão', 'valeu mesmo'],
  elogio: ['você é linda', 'você é fofa', 'você é incrível', 'você é perfeita', 'você é inteligente', 'gracinha', 'você é demais', 'que maravilhosa', 'você é gostosa'],
  desculpa: ['desculpa', 'me perdoa', 'foi mal', 'sinto muito', 'perdão', 'desculpa por aquilo', 'foi mal, sério'],
  bomdia: ['bom dia', 'bdia', 'bom diaaa', 'bom dia ânima', 'bom dia, amor'],
  sono: ['tô com sono', 'vou dormir', 'boa noite', 'vou deitar', 'tô morrendo de sono', 'hora de ir pra cama', 'boa noite, ânima'],
  saudacao: ['oi', 'olá', 'ei', 'e aí', 'opa', 'oi ânima', 'boa tarde', 'salve', 'hey', 'oiê', 'fala aí', 'oi sumida'],
  fome: ['tô com fome', 'o que eu como', 'vou almoçar', 'que fome', 'vou jantar', 'tô morrendo de fome', 'vou fazer um lanche'],
  treino: ['fui na academia', 'treinei hoje', 'corri 5 km', 'fiz exercício', 'treinei perna', 'voltei da academia', 'tô todo dolorido do treino'],
  trabalho: ['tenho prova amanhã', 'tô estudando', 'muito trabalho hoje', 'reunião chata', 'meu chefe é um saco', 'tô atrasado com o prazo', 'faculdade tá foda', 'tenho que entregar o trabalho'],
  eco: ['acabei de chegar em casa', 'tô vendo uma série', 'meu dia foi normal', 'comi pizza', 'tô no ônibus', 'o céu tá bonito', 'tanto faz', 'sei lá', 'hmm',
    'interessante', 'nada demais', 'pensando na vida', 'tô aqui', 'meu computador travou', 'o wifi caiu', 'tô jogando', 'vi um gato na rua', 'li um livro hoje', 'entendi',
    'meu (cachorro|gato|vizinho) (latiu|miou|gritou) a noite toda', 'minha mãe ligou', 'o ônibus atrasou', 'acabou a luz aqui',
    'tá', 'beleza', 'hm', 'normal', 'tô na fila do banco', 'tô assistindo (um filme|uma série|anime|youtube|tv)', 'tô vendo (um filme|um vídeo|uma live)', 'tô lendo um livro', 'tô comendo agora', 'tô no sofá', 'tô deitado aqui', 'tô cozinhando'],
  // ---------------------------------------------------------- bate-papo (o que um chatbot precisa entender)
  comovai: ['(tá|está|esta|ta) bem[?]', '(você|vc|tu|cê) (tá|está|esta|ta|anda|andou) (bem|bom|boa|ok|tranquila|de boa|legal|feliz|ótima|inteira)[?]', 'tudo (bem|bom|certo|tranquilo|joia|ok|certinho|em cima)[?]',
    'como (você|vc|tu|cê) (tá|está|esta|anda|vai|se sente)[?]', 'como (vai|anda|tá) (você|vc|tu)[?]', 'como vai[?]', 'tá tudo (bem|certo|ok) (com você|aí|contigo|por aí)[?]',
    'e aí, tudo bem[?]', 'tudo bem com (você|vc)[?]', '(você|vc) tá (ok|legal|bem mesmo)[?]', 'como (você|vc) tá se sentindo (hoje|agora|)[?]', 'tá tranquila[?]', 'tá de boa[?]',
    'tudo certo por aí[?]', 'como você acordou hoje[?]', 'tá se sentindo bem[?]', 'como tá a vida de ânima[?]', 'ânima, tudo bem[?]', 'tá melhor[?]', 'e como você tá hoje[?]', 'tá bem mesmo[?]'],
  estoubem: ['tô bem', 'to bem sim', 'tudo bem por aqui', 'tô de boa', 'tô tranquilo', 'tô tranquila', 'tô indo', 'tô mais ou menos', 'tô normal', 'tudo certo por aqui', 'sobrevivendo',
    'tô levando', 'tô bem, obrigado', 'tô bem, e você', 'tô de boa, e você', 'de boa', 'tô ok', 'tô legal', 'mais ou menos', 'tô na paz', 'tudo tranquilo comigo', 'tudo tranquilo por aqui', 'tudo certo comigo', 'tudo em paz por aqui', 'tudo ótimo comigo', 'comigo tá tudo bem', 'por aqui tá tudo certo', 'tudo bem, e contigo', 'indo, e você',
    'tô bem sim, obrigada por perguntar', 'tô aqui, de boa', 'tô nem aí, de boa', 'estou bem'],
  comofoi: ['como foi (o seu|seu) dia[?]', 'o que (você|vc) fez hoje[?]', 'novidades[?]', 'tem novidade[?]', 'o que rolou (hoje|de novo|por aí)[?]', 'alguma novidade[?]', 'como foi (a sua|sua) (tarde|manhã|noite)[?]',
    'o que aconteceu (hoje|com você)[?]', 'e o seu dia[?]', 'me conta do seu dia', 'e seu dia, como foi[?]', 'o que de novo[?]', 'como foi aí hoje[?]', 'aprontou o quê hoje[?]', 'teve algum acontecimento[?]'],
  presenca: ['tá aí[?]', '(você|vc|cê) (tá|está|esta|ta) aí[?]', 'alô[?]', 'ânima[?]', 'ei ânima[?]', 'cadê (você|vc|cê)[?]', '(você|vc) tá me ouvindo[?]', 'tá me ouvindo[?]', 'tá viva[?]',
    'responde', 'me responde', 'tem alguém aí[?]', '(você|vc) me escuta[?]', 'tá me vendo[?]', 'ânima, tá aí[?]', 'ei, tá aí[?]', 'sumiu[?]', 'ficou calada[?]', 'por que você não responde', 'oi? tá aí[?]', 'acordada[?]'],
  etu: ['e (você|vc|tu|cê)[?]', 'e contigo[?]', 'e com (você|vc)[?]', 'e aí, e (você|vc)[?]', 'e a senhorita[?]', 'e você, hein[?]', 'mas e (você|vc)[?]', 'e tu, ânima[?]', 'e você ânima[?]', 'e ocê[?]'],
  humordela: ['(você|vc|cê) (tá|está|esta|ta) (brava|chateada|com raiva|triste|feliz|com ciúme|com ciúmes|de mal|irritada|nervosa|com sono|entediada|magoada|carente|emburrada)[?]',
    '(tá|ta) (brava|chateada|com raiva|com ciúme|triste|feliz|emburrada) (comigo|)[?]', '(você|vc) (tá|está) de mal comigo[?]', '(você|vc) ficou (chateada|brava|triste|magoada) (comigo|)[?]',
    'o que (você|vc) tá sentindo[?]', 'como (você|vc) se sente[?]', 'tá com ciúme de mim[?]', '(você|vc) tá com raiva de mim[?]', 'tá estranha hoje[?]', 'tá diferente hoje[?]', 'qual seu humor hoje[?]',
    'tá com saudade[?]', 'tá chateada[?]', 'tá triste por quê[?]'],
  concorda: ['concordo', 'verdade', 'exato', 'isso mesmo', 'pois é', 'tem razão', 'faz sentido', 'também acho', 'exatamente', 'é verdade', 'realmente', 'isso aí', 'pior que é', 'também penso assim',
    'é isso aí', 'total', 'concordo com você', 'você tem razão', 'verdade, verdade', 'faz todo sentido', 'bem lembrado', 'é por aí', 'justo'],
  espanto: ['nossa', 'sério[?]', 'caramba', 'não acredito', 'mentira[?]', 'uau', 'meu deus', 'que isso', 'eita', 'nossa senhora', 'jura[?]', 'sério mesmo[?]', 'não creio', 'oxe', 'misericórdia', 'ata',
    'ué', 'gente', 'o quê[?]!', 'que absurdo', 'impossível', 'não é possível', 'caraca', 'my god', 'puts'],
  risada: ['kkkkkkk', 'hahahaha', 'rsrsrs', 'kkk', 'haha', 'lol', 'kkkkk que engraçado', 'haha boa', 'morri de rir', 'kkkk verdade', 'hehe', 'ksksks', 'huehue', 'kkk bobinha', 'hahaha você é louca',
    'kkkkkkkkk', 'rs', 'rsrs', 'hahaha boa', 'kkk muito boa', 'dei risada', 'ri alto agora', 'que engraçada você'],
  contamais: ['me conta mais', 'conta mais', 'continua', 'e depois[?]', 'fala mais', 'pode explicar melhor[?]', 'como assim[?]', 'quer dizer o quê[?]', 'não entendi', 'explica melhor', 'e então[?]', 'o que mais[?]',
    'tem mais[?]', 'desenvolve', 'não entendi nada', 'hã[?]', 'o quê[?]', 'não captei', 'pode repetir[?]', 'fala de novo', 'e aí, o que aconteceu depois[?]', 'detalha isso'],
  opiniaogeral: ['o que (você|vc) acha[?]', 'qual (a |)sua opinião[?]', '(você|vc) concorda[?]', 'concorda comigo[?]', 'o que (você|vc) acha disso[?]', 'que acha[?]', 'tô certo[?]', 'tô certa[?]', 'tô errado[?]',
    'fiz certo[?]', '(você|vc) acha que eu consigo[?]', 'será que dá certo[?]', 'me dá sua opinião', 'sua opinião[?]', 'você acha que vale a pena[?]', 'o que você faria no meu lugar[?]', 'devo fazer isso[?]', 'tô exagerando[?]'],
  desabafo: ['preciso de ajuda', 'me ajuda', 'pode me ajudar[?]', 'preciso de um conselho', 'me dá um conselho', 'preciso falar com alguém', 'ajuda aqui', 'socorro', 'preciso de você', 'preciso conversar',
    'posso desabafar[?]', 'posso te contar uma coisa[?]', 'quero desabafar', 'tenho uma coisa pra te contar', 'preciso desabafar', 'vamos conversar[?]', 'quero conversar', 'tem um tempinho pra mim[?]',
    'tá ocupada[?]', 'posso falar contigo[?]', 'me escuta um pouco', 'tô precisando de atenção', 'quero companhia', 'fica comigo um pouco', 'conversa comigo', 'me faz companhia', 'tô precisando de alguém'],
  capacidades: ['o que (você|vc) sabe fazer[?]', 'o que (você|vc) (faz|pode fazer|consegue fazer)[?]', 'quais (são |)(os |)seus comandos[?]', 'o que eu posso (te |)pedir[?]', 'pra que (você|vc) serve[?]',
    'como (você|vc) funciona[?]', 'me ajuda com o quê[?]', 'quais suas habilidades[?]', 'lista de comandos', 'sabe fazer o quê[?]', 'quais são suas funções[?]', 'como te uso[?]', 'tutorial', 'o que dá pra pedir pra você[?]',
    'você faz o quê além de conversar[?]', 'me mostra o que você sabe', 'quais seus poderes[?]', 'o que você controla no app[?]'],
  jogar: ['vamos jogar[?]', 'quer jogar[?]', 'bora jogar (algo|alguma coisa|)', 'joga comigo', 'quer brincar[?]', 'vamos brincar de alguma coisa', 'tem algum jogo[?]', 'me desafia', 'faz um quiz', 'brinca comigo',
    'vamos fazer uma brincadeira', 'sugere um joguinho', 'jogo de adivinhação', 'bora brincar', 'quer fazer um desafio[?]', 'me propõe um jogo'],
  surpresa: ['me conta uma curiosidade', 'fala alguma coisa', 'me surpreende', 'diz algo aleatório', 'conta algo interessante', 'fala qualquer coisa', 'me conta um segredo', 'me fala algo que eu não sei',
    'diz alguma coisa', 'surpreende eu', 'fala algo legal', 'me fala uma coisa aleatória', 'fala algo sobre você que ninguém sabe', 'conta um fato curioso', 'puxa assunto'],
  perguntame: ['me pergunta alguma coisa', 'faz uma pergunta', 'pergunta algo sobre mim', 'quer saber algo de mim[?]', 'não quer me perguntar nada[?]', 'me faz uma pergunta', 'pode perguntar o que quiser',
    'quer me conhecer melhor[?]', 'tem alguma pergunta pra mim[?]', 'me interroga'],
};

// os assuntos de conversa e os reforços das intenções antigas (papo.ts)
for (const [k, v] of Object.entries(MAIS)) GRAMATICA[k] = [...(GRAMATICA[k] ?? []), ...v];
Object.assign(GRAMATICA, PAPO);
for (const [k, v] of Object.entries(GIRIA)) GRAMATICA[k] = [...(GRAMATICA[k] ?? []), ...v];

export const ROTULOS: readonly string[] = Object.keys(GRAMATICA);

// ------------------------------------------------------------------ expansão

type No = { t: 'txt'; v: string } | { t: 'alt'; v: No[][] } | { t: 'opt'; v: No[] } | { t: 'slot'; v: string };

function analisar(s: string): No[] {
  let i = 0;
  const seq = (fim: string): No[][] => {
    const alts: No[][] = [[]];
    while (i < s.length) {
      const c = s[i]!;
      if (fim.includes(c)) break;
      if (c === '|') {
        i++;
        alts.push([]);
        continue;
      }
      const cur = alts[alts.length - 1]!;
      if (c === '(') {
        i++;
        const v = seq(')');
        i++;
        cur.push({ t: 'alt', v });
      } else if (c === '[') {
        i++;
        const v = seq(']');
        i++;
        cur.push({ t: 'opt', v: v.length > 1 ? [{ t: 'alt', v }] : v[0]! });
      } else if (c === '{') {
        const j = s.indexOf('}', i);
        cur.push({ t: 'slot', v: s.slice(i + 1, j) });
        i = j + 1;
      } else {
        let j = i;
        while (j < s.length && !'()[]{}|'.includes(s[j]!)) j++;
        cur.push({ t: 'txt', v: s.slice(i, j) });
        i = j;
      }
    }
    return alts;
  };
  const r = seq('');
  return r.length > 1 ? [{ t: 'alt', v: r }] : r[0]!;
}

const cache = new Map<string, No[]>();
const arvore = (s: string) => {
  let a = cache.get(s);
  if (!a) cache.set(s, (a = analisar(s)));
  return a;
};

/** Expande um modelo com o sorteio dado. */
export function expandir(modelo: string, rand: () => number, fundo = 0): string {
  const out = (ns: No[]): string => ns.map((n) => {
    if (n.t === 'txt') return n.v;
    if (n.t === 'alt') return out(n.v[Math.floor(rand() * n.v.length)]!);
    if (n.t === 'opt') return rand() < 0.5 ? out(n.v) : '';
    const vals = SLOTS[n.v];
    if (!vals || fundo > 4) return n.v;
    return expandir(vals[Math.floor(rand() * vals.length)]!, rand, fundo + 1);
  }).join('');
  return out(arvore(modelo)).replace(/\s+/g, ' ').replace(/\s+([,:?!])/g, '$1').trim();
}

// ------------------------------------------------------------------ ruído

const CONTRAI: Array<[RegExp, string[]]> = [
  [/\bvocê\b/g, ['vc', 'voce', 'cê']], [/\bque\b/g, ['q', 'que']], [/\bporque\b/g, ['pq']], [/\bpor que\b/g, ['pq', 'porque']], [/\btambém\b/g, ['tb', 'tbm']],
  [/\bnão\b/g, ['n', 'nao', 'ñ', 'naum']], [/\bestá\b/g, ['ta', 'tá']], [/\bestou\b/g, ['to', 'tô']], [/\bpara\b/g, ['pra', 'p']], [/\bbeleza\b/g, ['blz']],
  [/\bmesmo\b/g, ['msm']], [/\bmuito\b/g, ['mt', 'mto']], [/\bhoje\b/g, ['hj']], [/\bpor favor\b/g, ['pfv', 'pf', 'porfavor']], [/\bdepois\b/g, ['dps']],
  [/\bagora\b/g, ['agr']], [/\bquando\b/g, ['qnd']], [/\btudo\b/g, ['td']], [/\bcomigo\b/g, ['cmg']], [/\bobrigad[oa]\b/g, ['obg', 'vlw']], [/\bminutos\b/g, ['min']],
];

const VIZINHAS: Record<string, string> = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol', a: 'qsz', s: 'adwx', d: 'sfe', f: 'dgr', g: 'fht', h: 'gjy',
  j: 'hku', k: 'jli', l: 'ko', z: 'xa', x: 'zcs', c: 'xvd', v: 'cbf', b: 'vng', n: 'bmh', m: 'nj',
};

const PREFIXOS = ['ânima, ', 'anima ', 'amor, ', 'ei, ', 'oi anima, ', 'então ', 'tipo ', 'mano ', 'ei mo, ', 'ô ânima, ', 'escuta, ', 'ânima ', 'por favor, ', 'amor '];
const SUFIXOS = [' pfv', ' por favor', '?', '!', '!!', ' kkk', ' 🖤', ' agora', ' aí', ' rapidinho', ' amor', ' porra', ' caralho', ' sua doida', ' ânima', '...', ' haha', ' :)', ' vai'];

/** Estraga a frase como gente estraga. `forca` de 0 a 1. */
export function ruido(s: string, rand: () => number, forca = 0.5): string {
  let x = s;
  const p = (v: number) => rand() < v * (0.5 + forca);
  if (p(0.25)) for (const [re, alts] of CONTRAI) if (rand() < 0.6) x = x.replace(re, () => alts[Math.floor(rand() * alts.length)]!);
  if (p(0.15)) x = PREFIXOS[Math.floor(rand() * PREFIXOS.length)]! + x;
  if (p(0.18)) x = x + SUFIXOS[Math.floor(rand() * SUFIXOS.length)]!;
  if (p(0.4)) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (p(0.05)) x = x.toUpperCase();
  else if (p(0.6)) x = x.toLowerCase();
  if (p(0.2)) {
    const ws = x.split(' ');
    const idxs = ws.map((w, i) => (w.length >= 4 && /^[\p{L}]+$/u.test(w) ? i : -1)).filter((i) => i >= 0);
    if (idxs.length) {
      const i = idxs[Math.floor(rand() * idxs.length)]!;
      const w = ws[i]!;
      const k = 1 + Math.floor(rand() * (w.length - 2));
      const tipo = Math.floor(rand() * 4);
      const viz = VIZINHAS[w[k]!.toLowerCase()];
      ws[i] = tipo === 0 ? w.slice(0, k - 1) + w[k] + w[k - 1] + w.slice(k + 1)
        : tipo === 1 ? w.slice(0, k) + w.slice(k + 1)
        : tipo === 2 ? w.slice(0, k) + w[k] + w.slice(k)
        : viz ? w.slice(0, k) + viz[Math.floor(rand() * viz.length)] + w.slice(k + 1) : w;
      x = ws.join(' ');
    }
  }
  if (p(0.06)) x = x.replace(/([aeiou])(\b|$)/, '$1$1$1$2');
  if (p(0.2)) x = x.replace(/[,.:]/g, '');
  return x;
}

// ------------------------------------------------------------------ corpus

export interface Exemplo { texto: string; rotulo: string }

/**
 * Gera exemplos equilibrados: `porRotulo` por intenção, com ruído. Modelos
 * curtos sem variação (como "sim") ganham ruído mais forte para não virarem
 * cópias exatas.
 */
export function gerarCorpus(porRotulo: number, semente: number, forcaRuido = 0.5): Exemplo[] {
  let a = semente >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Exemplo[] = [];
  for (const rotulo of ROTULOS) {
    const ms = GRAMATICA[rotulo]!;
    for (let i = 0; i < porRotulo; i++) {
      const limpa = expandir(ms[Math.floor(rand() * ms.length)]!, rand);
      out.push({ texto: rand() < 0.12 ? limpa : ruido(limpa, rand, forcaRuido), rotulo });
    }
  }
  return out;
}

/** Todas as palavras que a gramática conhece (o léxico do corretor sai daqui). */
export function palavrasDaGramatica(): string {
  return [...Object.values(GRAMATICA).flat(), ...Object.values(SLOTS).flat()].join(' ').replace(/[(){}[\]|]/g, ' ');
}
