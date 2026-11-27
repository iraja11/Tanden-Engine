/*
 * As intenções que só fazem sentido DENTRO de uma conversa: a pessoa reage ao
 * que ela acabou de dizer. A rede só diz "isto é um pedido de esclarecimento";
 * QUEM é "ela" em "ela quem?" quem resolve é o gerente de diálogo
 * (dialogo.ts), olhando o que ela mesma falou.
 *
 *   esclarecer  "como assim?", "ela quem?", "do que você tá falando?"
 *   corrige     "você entendeu errado", "eu nunca disse isso", "não sei quem é X"
 *   converter   unidades ("quantos km são 10 milhas")
 *   datas       contagem e calendário ("quantos dias faltam pro natal")
 *
 * Mesma sintaxe da gramática (corpus.ts).
 */
export const DIALOGO: Record<string, string[]> = {
  esclarecer: [
    'como assim[?]', 'como assim (ela|ele|isso|essa|esse)[?]', 'não entendi', 'não entendi nada', 'hã[?]', 'hein[?]', 'o quê[?]', 'quê[?]', 'oi[?] como assim', 'que[?]',
    '(ela|ele|elas|eles) quem[?]', 'quem[?]', 'quem é (ela|ele)[?]', 'qual[?]', 'isso o quê[?]', 'que (vídeo|música|jogo|coisa|nota|história|site|menina|pessoa|lista)[?]',
    'do que (você|vc|cê) (tá|está) falando[?]', 'de quem (você|vc) (tá|está) falando[?]', 'falando de quem[?]', 'falando do quê[?]', 'não sei do que (você|vc) (tá|está) falando',
    'não captei', 'não peguei', 'boiei', 'tô boiando', 'viajou[?]', 'que papo é esse[?]', 'de onde saiu isso[?]', 'quê que tem[?]', 'e daí[?]', 'que que tem isso[?]',
    'explica o que (você|vc) quis dizer', 'o que (você|vc) quis dizer (com isso|)[?]', 'como é que é[?]', 'perdão[?]', 'oi[?]', 'pode repetir[?]', 'repete o que (você|vc) disse',
    'isso foi pra mim[?]', 'tá falando comigo[?]', 'quem é essa[?]', 'que mentira[?]', 'qual mentira[?]', 'que número[?]', 'quais números[?]',
  ],
  corrige: [
    '(você|vc) entendeu errado', 'não foi isso que eu disse', 'eu nunca disse isso', 'eu não disse isso', 'não falei isso', 'de onde (você|vc) tirou isso[?]', '(você|vc) inventou isso',
    'nada a ver', 'tá errado', 'isso tá errado', 'não é bem assim', 'não é isso', 'errou', 'errado', '(você|vc) confundiu', 'confundiu tudo', 'trocou as bolas',
    'não sei (quem|o que) é {gosto}', 'nem sei (quem|o que) é {gosto}', 'eu não gosto de {gosto}', 'nunca gostei de {gosto}', 'eu não tenho {bicho_tipo}', 'não moro em {cidade}',
    'meu nome não é {pessoa}', 'não conheço (nenhuma|nenhum) {pessoa}', 'não trabalho com {trabalho}', 'esquece isso que (você|vc) anotou', 'apaga isso da sua memória',
    'esquece que eu falei (isso|de {gosto})', 'não, eu (disse|falei) outra coisa', 'não era isso', 'lembrou errado', '(você|vc) lembrou errado', 'sua memória tá errada',
    'isso não é verdade', 'mentira, eu nunca falei isso', 'quem te disse isso[?]', 'para de inventar coisa', 'tá viajando, eu não (disse|falei) isso',
  ],
  converter: [
    'quantos (km|quilômetros|metros|centímetros) (são|é|tem|dá) {num} (milhas|pés|polegadas|jardas|metros|km)', 'converte {num} (graus|°) (celsius|fahrenheit) (pra|em|para) (fahrenheit|celsius)',
    '{num} (libras|onças|kg|quilos|gramas) em (kg|quilos|gramas|libras)', 'quanto é {num} (milhas|pés|polegadas|litros|galões|xícaras|colheres) em (km|metros|cm|ml|litros)',
    'quantos (segundos|minutos|horas) tem (um dia|uma semana|um ano|um mês)', '{num} (gb|mb|tb|kb) (são|é) quantos (mb|gb|kb|tb)', '(converte|transforma|passa) {num} (km|metros|kg|litros|horas|minutos) (pra|em|para) (milhas|pés|libras|ml|minutos|segundos)',
    '{num} (km/h|quilômetros por hora) em (m/s|milhas por hora|mph)', 'quantas (polegadas|xícaras|gramas|colheres) (tem|são|dá) {num} (cm|ml|kg|litros)', '{num} fahrenheit é quanto em celsius[?]',
    'quanto (dá|é) {num} (horas|minutos|dias) em (minutos|segundos|horas)', 'quanto pesa {num} libras em kg[?]', 'quantos (ml|mililitros) tem (uma xícara|uma colher de sopa|um copo)',
  ],
  datas: [
    'quantos dias faltam (pro|para o|pra) (natal|ano novo|carnaval|páscoa|halloween|dia dos namorados|meu aniversário|fim do ano|dia {num})',
    'quanto tempo falta (pro|para o|pra) (natal|ano novo|carnaval|páscoa|meu aniversário|fim do mês|fim do ano)', 'falta muito (pro|pra) (natal|carnaval|meu aniversário)[?]',
    'que dia (da semana |)(cai|vai ser) (o natal|o carnaval|a páscoa|dia {num}|{num} de (dezembro|janeiro|março|maio|outubro))', 'quando é (o carnaval|a páscoa|o natal) (esse ano|ano que vem|)[?]',
    'que dia vai ser daqui a {num} dias', 'que dia foi há {num} dias', 'quantos dias (tem|faltam|até) (até |)(o fim do mês|o fim do ano|dia {num})', 'em que dia da semana eu nasci se foi (em|dia) {num} de (maio|julho|agosto)',
    'quantos anos tem quem nasceu em (1998|2004|2010|1987)', 'se eu nasci em (2000|2003|1995) quantos anos eu tenho[?]', 'quantos dias tem (esse mês|fevereiro|esse ano)', '(esse|este) ano é bissexto[?]',
    'quantas semanas faltam (pro|pra) (natal|fim do ano|minhas férias|o carnaval)', 'que semana do ano é hoje', 'quantos dias já passaram esse ano', 'faltam quantos dias (pro|pra) (natal|ano novo|páscoa)',
  ],
};
