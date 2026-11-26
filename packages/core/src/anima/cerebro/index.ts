/*
 * O cérebro da Ânima (ver cerebro.ts para o caminho de uma mensagem).
 * Exportado como namespace (`cerebro.pensar`, `cerebro.rotina`…) para não
 * brigar com nomes do resto do núcleo.
 */
export { pensar, depoisDaAcao, registrarCarinho, cumprirAdiado, quietaAte } from './cerebro';
export type { Acao, CtxCerebro, Ocorrencia, Pensamento, ResultadoAcao } from './cerebro';
export { rotina, broncaDeTela, eventoCriado, type Poderes } from './rotina';
export { escreverNoMundo, type EscritoMundo, type GeneroEscrito, type MundoInfo } from './escrita';
export { capitulo, CAPITULOS, diasJuntos } from './arco';
export { montarGrafo, deducoes, entenderConsulta, responderConsulta, type Tripla } from './grafo';
export { decidir, motivos, type Decisao, type Desfecho, type Fator } from './vontade';
export { entenderPedido, COMANDOS, type ComandoId, type Pedido, type EventoPedido } from './comandos';
export { sentido, type Sentido, type Categoria } from './semantica';
export { candidatosNota, casarComando, duracaoMs, formulaDado, telaDe, type ComandoApp } from './entidades';
export { normalizar, Lexico, distancia, radical, type Texto } from './texto';
export { sentimento, type Sentimento } from './sentimento';
export { calcular, numeroExtenso } from './numeros';
export { classificar, modeloPadrao, usarModelo, lexicoBase, amostrar } from './modelo';
export { treinar, avaliar, calibrar, carregar, serializar, prever, indices, type Modelo, type Previsao } from './classificador';
export { gerarCorpus, ROTULOS, GRAMATICA, SLOTS } from './corpus';
export { lerMemoriaCerebro, novaMemoriaCerebro, type MemoriaCerebro, type Pendencia } from './memoria';
export { reagirJogo, problemaDoJogo, sono, rival, ROTINA_PADRAO, type JogoAtual, type Rotina, type ProblemaJogo, type ReacaoJogo, type CtxJogo } from './jogos';
export { lerJanela, reagirWeb, contarWeb, type Pagina, type CategoriaWeb } from './web';
