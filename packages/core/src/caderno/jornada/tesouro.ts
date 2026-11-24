import { seededRng } from '../../rpg/dice';
import type { Metricas } from './conquistas';
import type { Raridade } from './progresso';
import { calcularSequencia, diasCumpridos, type RegistroAparelho } from './registro';

/*
 * Tesouro: o que o progresso destrava e o que os baús trazem.
 *
 * Relíquias são enfeites que se ganham por marcos (adornos para o planeta,
 * molduras para as cartas, títulos de autor) e se escolhem por mundo. Baús
 * caem quando se cumprem as três missões do dia, a cada sete dias de sequência
 * e a cada cinco níveis de um mundo; cada um traz uma carta de inspiração, um
 * empurrão de escrita colecionável em seis naipes.
 *
 * A carta de um baú sai de uma semente do próprio baú, então o mesmo baú dá a
 * mesma carta em qualquer aparelho. A coleção é a lista de baús abertos no
 * registro (`.tanden/jornada/`), e as notas continuam intocadas.
 */

// ------------------------------------------------------------------ relíquias

export type TipoReliquia = 'adorno' | 'moldura' | 'titulo';

export interface Reliquia {
  id: string;
  tipo: TipoReliquia;
  nome: string;
  desc: string;
  glifo: string;
  raridade: Raridade;
  metrica: string;
  alvo: number;
  /** como se ganha, para a vitrine */
  como: string;
}

const R = (tipo: TipoReliquia, id: string, nome: string, glifo: string, raridade: Raridade, metrica: string, alvo: number, como: string, desc: string): Reliquia => ({ id, tipo, nome, glifo, raridade, metrica, alvo, como, desc });

export const RELIQUIAS: Reliquia[] = [
  // adornos do planeta
  R('adorno', 'lua-prata', 'Lua de prata', '☾', 'comum', 'nivel', 5, 'Leve um mundo ao nível 5', 'Uma lua pálida que gira devagar.'),
  R('adorno', 'cometa', 'Cometa', '☄', 'incomum', 'seqMelhor', 7, 'Escreva 7 dias seguidos', 'Um rastro de luz que cruza o céu de tempos em tempos.'),
  R('adorno', 'aurora', 'Aurora', '≋', 'incomum', 'nivel', 12, 'Leve um mundo ao nível 12', 'Cortinas de luz dançando nos polos.'),
  R('adorno', 'aneis', 'Anéis duplos', '◎', 'rara', 'era', 3, 'Alcance a 4ª era', 'Dois anéis cruzados, como um astrolábio.'),
  R('adorno', 'satelites', 'Enxame de satélites', '∴', 'rara', 'v.colecao', 15, 'Colecione 15 cartas', 'Pontinhos que orbitam como vagalumes.'),
  R('adorno', 'constelacao', 'Constelação', '✦', 'rara', 'total', 40, 'Desbloqueie 40 conquistas', 'As estrelas em volta desenham o nome do mundo.'),
  R('adorno', 'fogos', 'Fogos de festa', '❋', 'epica', 'v.baus', 30, 'Abra 30 baús', 'Faíscas que estouram em volta do planeta.'),
  R('adorno', 'nebulosa', 'Nebulosa', '☁', 'epica', 'nivel', 30, 'Leve um mundo ao nível 30', 'Uma nuvem colorida onde nascem estrelas.'),
  R('adorno', 'coroa-solar', 'Coroa solar', '☀', 'lendaria', 'nivel', 45, 'Leve um mundo ao nível 45', 'Um halo de fogo que respira.'),
  R('adorno', 'olho-cosmico', 'Olho cósmico', '◉', 'lendaria', 'era', 6, 'Desperte um mundo (7ª era)', 'O universo olha de volta.'),
  // molduras das cartas
  R('moldura', 'bronze', 'Moldura de bronze', '▭', 'comum', 'nivel', 3, 'Leve um mundo ao nível 3', 'Borda quente, de metal batido.'),
  R('moldura', 'prata', 'Moldura de prata', '▭', 'incomum', 'nivel', 10, 'Leve um mundo ao nível 10', 'Fria e polida, com cantos gravados.'),
  R('moldura', 'runica', 'Moldura rúnica', 'ᚱ', 'rara', 'palavras', 25000, 'Escreva 25 mil palavras', 'Runas que acendem quando a carta inclina.'),
  R('moldura', 'ouro', 'Moldura de ouro', '▭', 'rara', 'nivel', 20, 'Leve um mundo ao nível 20', 'Ouro velho, digno de relicário.'),
  R('moldura', 'vitral', 'Moldura de vitral', '◈', 'epica', 'v.colecao', 35, 'Colecione 35 cartas', 'Cacos coloridos que pegam a luz.'),
  R('moldura', 'obsidiana', 'Moldura de obsidiana', '◆', 'epica', 'seqMelhor', 30, 'Escreva 30 dias seguidos', 'Vidro vulcânico com brilho de brasa.'),
  R('moldura', 'holo', 'Moldura holográfica', '✧', 'epica', 'lendarias', 1, 'Tenha uma ficha lendária', 'Um arco-íris que segue o olhar.'),
  R('moldura', 'astral', 'Moldura astral', '✶', 'lendaria', 'nivel', 50, 'Leve um mundo ao nível 50', 'Um céu noturno inteiro na borda da carta.'),
  // títulos de autor
  R('titulo', 'aprendiz', 'Aprendiz de mundos', '✎', 'comum', 'mundos', 1, 'Crie um mundo', 'Todo mundo começa com uma página em branco.'),
  R('titulo', 'cronista', 'Cronista', '⧗', 'incomum', 'datas', 25, 'Registre 25 datas', 'Guarda o tempo em ordem.'),
  R('titulo', 'cartografo', 'Cartógrafo', '⌖', 'incomum', 'marcadores', 25, 'Ponha 25 marcadores nos mapas', 'Nada fica sem lugar.'),
  R('titulo', 'bestiarista', 'Bestiarista', '☠', 'rara', 'n.criatura', 12, 'Tenha 12 criaturas num mundo', 'Conhece cada fera pelo cheiro.'),
  R('titulo', 'arcanista', 'Arcanista', '✧', 'rara', 'v.equilibrados', 6, 'Equilibre 6 poderes', 'Todo poder tem preço, e você cobra.'),
  R('titulo', 'mercador', 'Mestre mercador', '⚖', 'rara', 'v.rotas', 8, 'Tenha 8 rotas comerciais', 'Segue o dinheiro até o fim da estrada.'),
  R('titulo', 'tecelao', 'Tecelão de destinos', '⌘', 'rara', 'ligacoes', 150, 'Faça 150 ligações num mundo', 'Tudo está ligado, e você sabe por quê.'),
  R('titulo', 'confidente', 'Confidente', '❝', 'rara', 'v.psiques', 8, 'Dê perfil a 8 personagens', 'Sabe o que cada um esconde.'),
  R('titulo', 'calendarista', 'Guardião do calendário', '☾', 'rara', 'v.festas', 6, 'Marque 6 festas no calendário', 'Os dias têm nome e as noites têm festa.'),
  R('titulo', 'arquiteto', 'Arquiteto de realidades', '▲', 'epica', 'nivel', 25, 'Leve um mundo ao nível 25', 'Desenha as leis antes das casas.'),
  R('titulo', 'colecionador', 'Colecionador de musas', '♣', 'epica', 'v.colecao', 60, 'Colecione 60 cartas', 'Guarda cada faísca de ideia.'),
  R('titulo', 'demiurgo', 'Demiurgo', '◍', 'lendaria', 'nivel', 60, 'Leve um mundo ao nível 60', 'Mundos nascem quando você escreve.'),
];

export const reliquiaPorId = (id: string): Reliquia | undefined => RELIQUIAS.find((r) => r.id === id);

export interface EstadoReliquia { r: Reliquia; ok: boolean; progresso: number }

export function estadoReliquias(m: Metricas): EstadoReliquia[] {
  return RELIQUIAS.map((r) => {
    const v = m[r.metrica] ?? 0;
    return { r, ok: v >= r.alvo, progresso: Math.min(1, v / r.alvo) };
  });
}

/** Quantas relíquias a medição já abriu (a métrica `v.reliquias`). */
export const reliquiasAbertas = (m: Metricas): number => RELIQUIAS.filter((r) => (m[r.metrica] ?? 0) >= r.alvo).length;

// ------------------------------------------------------------------ cartas de inspiração

export type Naipe = 'rosto' | 'chao' | 'fio' | 'veu' | 'assombro' | 'cinza';

export const NAIPES: Array<{ id: Naipe; label: string; glifo: string; cor: string; desc: string }> = [
  { id: 'rosto', label: 'Rostos', glifo: '☺', cor: '#f2a65a', desc: 'Gente: desejos, segredos, máscaras.' },
  { id: 'chao', label: 'Chão', glifo: '⌂', cor: '#5fbf77', desc: 'Lugares: o que se vê, o que se esconde.' },
  { id: 'fio', label: 'Fios', glifo: '⚔', cor: '#e5654b', desc: 'Conflitos, intrigas e alianças frágeis.' },
  { id: 'veu', label: 'Véus', glifo: '◎', cor: '#4f9de8', desc: 'Mistérios, mentiras e verdades enterradas.' },
  { id: 'assombro', label: 'Assombros', glifo: '✧', cor: '#b277ee', desc: 'Maravilhas, magia e o impossível.' },
  { id: 'cinza', label: 'Cinzas', glifo: '✝', cor: '#9aa3ad', desc: 'Perdas, ruínas e o preço das coisas.' },
];

export interface Carta { id: string; naipe: Naipe; nome: string; texto: string; raridade: Raridade }

const RAR: Record<string, Raridade> = { c: 'comum', i: 'incomum', r: 'rara', e: 'epica', l: 'lendaria' };

/* Uma linha por carta: raridade | nome | texto. Dezesseis por naipe: 7 comuns, 4 incomuns, 3 raras, 1 épica, 1 lendária. */
const DATA: Record<Naipe, string> = {
  rosto: `
c | O Estranho na Porta | Alguém bate à porta de uma personagem e diz que é da família. Ninguém nunca ouviu falar dele.
c | Mãos Calejadas | Escreva sobre o trabalho que uma personagem faz todos os dias, e o que ela pensa enquanto faz.
c | A Promessa Antiga | Uma personagem prometeu algo há anos. Hoje cobram.
c | O Riso Errado | Alguém ri na hora errada, num lugar errado. Por quê?
c | Carta Nunca Enviada | Escreva a carta que uma personagem escreveu e nunca mandou.
c | O Vizinho | Descreva a pessoa que mora ao lado da sua protagonista, e o que ela sabe.
c | Primeiro Emprego | Como uma personagem ganhou o primeiro dinheiro da vida?
i | Duas Caras | Uma personagem respeitada tem uma segunda vida. Mostre uma noite dessa vida.
i | O Rival Gentil | Crie alguém que quer a mesma coisa que a protagonista, e é uma pessoa melhor que ela.
i | Herança Indesejada | Uma personagem herda algo que não queria: uma dívida, um título, uma criança, um inimigo.
i | O Nome Verdadeiro | Alguém usa um nome falso. Qual é o verdadeiro, e quem ainda o lembra?
r | O Juramento Partido | Uma personagem quebra o juramento mais importante da vida. Escreva o minuto antes.
r | Espelho Torto | Crie uma personagem que é o reflexo distorcido da sua protagonista.
r | Quem Ficou para Trás | Alguém foi abandonado numa fuga. Agora tem o próprio ponto de vista.
e | A Confissão | Uma personagem conta a verdade mais perigosa que conhece, para a pessoa errada.
l | O Coração do Mundo | Escreva a cena em que sua protagonista entende o que realmente quer. Ninguém mais está lá.`,
  chao: `
c | Cheiro de Chegada | Como cheira o lugar onde a próxima cena acontece? Comece pelo cheiro.
c | A Taverna Fechada | Uma taverna que sempre esteve aberta amanhece fechada. Por quê?
c | Mercado ao Amanhecer | Descreva um mercado antes de abrir: quem chega primeiro, o que se arma.
c | A Ponte Velha | Toda cidade tem uma ponte que todos evitam. Conte a dela.
c | O Caminho Curto | Existe um atalho que só os locais usam. Aonde ele leva, e o que custa?
c | Lugar de Rezar | Descreva um lugar sagrado pequeno, desses que não aparecem nos mapas.
c | A Casa da Infância | Volte ao lugar onde uma personagem cresceu. O que mudou?
i | A Rua Sem Saída | Uma rua termina num muro que antes não estava lá.
i | Fronteira Viva | Uma fronteira que se mexe: rio que muda de leito, floresta que avança, areia que engole.
i | O Porão | Debaixo de um lugar conhecido há outro. Quem desceu por último?
i | Cidade Vista de Cima | Descreva uma cidade do alto de uma torre, ao entardecer, por quem a governa.
r | A Ruína Habitada | Alguém mora nas ruínas de uma civilização que veio antes. Como vive?
r | Mapa Errado | O mapa oficial mente sobre um lugar. Quem desenhou, e por quê?
r | O Lugar Proibido | Existe um lugar onde ninguém entra. Escreva a primeira pessoa que entrou e voltou.
e | Cidade que Dorme | Uma cidade inteira adormece ao mesmo tempo, todas as noites, menos uma pessoa.
l | O Fim do Mapa | Escreva o que existe exatamente onde o mapa do seu mundo termina.`,
  fio: `
c | Dívida de Jogo | Alguém perdeu mais do que tinha. Quem cobra?
c | Boato | Um boato corre pela cidade. É falso, mas vai mudar tudo.
c | Briga de Família | Dois irmãos discutem por algo pequeno que esconde algo enorme.
c | O Imposto Novo | Um imposto novo é anunciado. Quem paga, quem lucra, quem se revolta?
c | O Contrato | Escreva as letras miúdas de um acordo entre duas facções.
c | Desafio Público | Alguém é desafiado em público e não pode recusar.
c | A Testemunha | Alguém viu o que não devia. Quem sabe disso?
i | Aliança de Conveniência | Dois inimigos precisam trabalhar juntos por um dia.
i | O Traidor Leal | Alguém trai a facção para salvá-la de si mesma.
i | Sucessão | O líder morre sem herdeiro claro. Quem se move primeiro?
i | Moeda Falsa | Moedas falsas inundam o mercado. Quem ganha com isso?
r | A Guerra Pequena | Uma guerra acontece por um motivo ridículo. Mostre como começou.
r | Refém | Alguém valioso é levado. O resgate pedido não é dinheiro.
r | O Acordo Secreto | Duas facções em guerra pública têm um acordo escondido.
e | Golpe | Escreva a noite em que o poder troca de mãos, vista por um criado.
l | O Grande Fio | Escolha duas fichas que nunca se cruzaram e escreva o fio que as ligava desde sempre.`,
  veu: `
c | O Objeto Fora de Lugar | Algo aparece onde não deveria estar. Quem o deixou?
c | A Pergunta Proibida | Existe uma pergunta que ninguém faz em voz alta. Qual?
c | Diário Rasgado | Faltam páginas no diário de alguém. O que estava escrito?
c | Sumiço | Uma pessoa comum desaparece. Ninguém procura. Por quê?
c | A Mentira Pequena | Uma mentira contada para proteger alguém cresce até ficar perigosa.
c | O Sinal | Um símbolo aparece pintado nas paredes da cidade, toda manhã.
c | Quem Bateu | Batidas na porta à noite. Ninguém do outro lado.
i | O Morto que Escreve | Chegam cartas de alguém que morreu há anos.
i | A Verdade Oficial | A história que todo mundo aprende tem um buraco. Encontre-o.
i | Duas Testemunhas | Duas pessoas contam o mesmo fato de jeitos opostos. As duas estão certas.
i | O Livro em Branco | Um livro famoso, quando aberto, está vazio.
r | Memória Emprestada | Alguém lembra de algo que nunca viveu.
r | O Assassino Educado | Um crime perfeito, e o culpado deixa um bilhete pedindo desculpas.
r | Arquivo Selado | Existe um arquivo que só pode ser aberto por três pessoas juntas. Uma morreu.
e | A Grande Farsa | Algo que todo o mundo acredita é inventado. Quem inventou ainda vive.
l | O Segredo do Mundo | Escreva o segredo que explica o seu mundo inteiro, mesmo que nunca vá contá-lo.`,
  assombro: `
c | Chuva Estranha | Chove algo que não é água.
c | O Animal que Fala | Um animal diz uma única frase e nunca mais fala.
c | Luz no Lago | Uma luz brilha no fundo de um lago toda lua cheia.
c | Remédio Impossível | Um curandeiro cura algo incurável. Qual é o preço?
c | A Canção | Uma canção antiga faz algo acontecer quando cantada inteira.
c | Sementes | Alguém planta sementes que crescem do dia para a noite.
c | O Mapa Vivo | Um mapa muda sozinho para mostrar algo.
i | O Dom Inesperado | Uma pessoa comum acorda com um poder que não queria.
i | Porta para Outro Lugar | Uma porta comum, aberta do jeito certo, leva a outro lugar.
i | O Relógio Parado | Num lugar, o tempo para. Quem está preso lá?
i | Criatura Nova | Escreva a primeira vez que alguém vê uma criatura que ninguém viu.
r | Milagre Público | Algo impossível acontece diante de uma multidão. Cada um vê uma coisa.
r | A Cidade Flutuante | Algo enorme e antigo flutua sobre o mundo. Hoje desceu um pouco.
r | Magia Errada | Um feitiço dá errado do jeito mais bonito possível.
e | O Deus Pequeno | Uma divindade esquecida pede ajuda a alguém comum.
l | Nascimento de uma Lei | Escreva o momento em que uma regra do seu mundo (magia, física, morte) foi criada.`,
  cinza: `
c | O Último Dia | Escreva o último dia normal antes de tudo mudar.
c | Colheita Ruim | A colheita falhou. Quem passa fome primeiro?
c | Despedida | Alguém parte e sabe que não volta.
c | A Cicatriz | Conte a história de uma cicatriz.
c | Cidade Vazia | Uma cidade foi abandonada às pressas. O que ficou para trás?
c | O Funeral | Descreva um funeral e quem não foi.
c | Dívida de Sangue | Alguém morreu no lugar de outra pessoa. Ela carrega isso.
i | A Praga | Uma doença chega. Quem ela poupa revela algo.
i | O Herói Velho | Um herói de outros tempos não é mais lembrado. Mostre um dia dele.
i | Exílio | Alguém é expulso de casa para sempre. O que leva?
i | A Queda | Uma família poderosa perde tudo em uma noite.
r | Guerra que Acabou | A guerra terminou. Escreva o primeiro dia de paz de um soldado.
r | O Sacrifício | Alguém dá algo que não pode recuperar, para salvar quem não sabe.
r | Ruína de um Ideal | Uma causa justa vira o que combatia.
e | O Fim de uma Era | Escreva a noite em que uma era do seu mundo termina.
l | O Que Sobra | Depois do pior, escreva o que ainda floresce.`,
};

export const CARTAS: readonly Carta[] = (Object.keys(DATA) as Naipe[]).flatMap((naipe) =>
  DATA[naipe].trim().split('\n').map((linha, i) => {
    const [r, nome, texto] = linha.split('|').map((x) => x.trim()) as [string, string, string];
    return { id: `${naipe}-${i + 1}`, naipe, nome, texto, raridade: RAR[r] ?? 'comum' };
  }),
);

export const cartaPorId = (id: string): Carta | undefined => CARTAS.find((c) => c.id === id);

const PESOS: Record<Raridade, number> = { comum: 52, incomum: 26, rara: 14, epica: 6, lendaria: 2 };
const ORDEM: Raridade[] = ['comum', 'incomum', 'rara', 'epica', 'lendaria'];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A carta de um baú. Mesma semente, mesma carta: o baú vale igual em todo
 * aparelho. `sorte` (0 a 2) empurra a raridade para cima nos baús especiais.
 * Prefere uma carta que a coleção ainda não tem, da mesma raridade sorteada.
 */
export function sortearCarta(bauId: string, tem: ReadonlySet<string> = new Set(), sorte = 0): Carta {
  const rng = seededRng(hash(bauId));
  const pesos = ORDEM.map((r, i) => PESOS[r] * (i >= 2 ? 1 + sorte : 1) * (i === 0 ? 1 / (1 + sorte * 0.6) : 1));
  let x = rng() * pesos.reduce((a, b) => a + b, 0);
  let k = 0;
  while (k < pesos.length - 1 && x >= pesos[k]!) { x -= pesos[k]!; k++; }
  for (let d = 0; d < ORDEM.length; d++) {
    const r = ORDEM[Math.max(0, k - d)]!;
    const novas = CARTAS.filter((c) => c.raridade === r && !tem.has(c.id));
    if (novas.length) return novas[Math.floor(rng() * novas.length)]!;
  }
  const mesma = CARTAS.filter((c) => c.raridade === ORDEM[k]);
  return mesma[Math.floor(rng() * mesma.length)]!;
}

// ------------------------------------------------------------------ baús

export type OrigemBau = 'missoes' | 'sequencia' | 'nivel';

export interface Bau {
  id: string;
  origem: OrigemBau;
  titulo: string;
  mundo?: string;
  sorte: number;
  /** já aberto: quando e com qual carta */
  aberto?: { em: number; carta: string };
}

/** Todos os baús que o autor já ganhou, abertos ou não (os fechados primeiro, os mais novos antes). */
export function bausDoAutor(r: RegistroAparelho, niveis: Array<{ mundo: string; nivel: number }>, hoje: string): Bau[] {
  const out: Bau[] = [];
  const dia = (d: string) => d.split('-').reverse().join('/');
  for (const [d, mundos] of Object.entries(r.missoes)) {
    for (const [mundo, m] of Object.entries(mundos)) {
      if (m.lista.length && m.feitas.length >= m.lista.length) out.push({ id: `m:${d}:${mundo}`, origem: 'missoes', titulo: `Missões de ${dia(d)}`, mundo, sorte: 0 });
    }
  }
  const seq = calcularSequencia(diasCumpridos(r), hoje);
  for (let k = 7; k <= seq.melhor; k += 7) out.push({ id: `s:${k}`, origem: 'sequencia', titulo: `${k} dias de sequência`, sorte: Math.min(2, k / 21) });
  for (const { mundo, nivel } of niveis) {
    for (let k = 5; k <= nivel; k += 5) out.push({ id: `n:${mundo}:${k}`, origem: 'nivel', titulo: `${mundo} chegou ao nível ${k}`, mundo, sorte: k % 25 === 0 ? 2 : 0.5 });
  }
  for (const b of out) { const a = r.baus[b.id]; if (a) b.aberto = { em: a.em, carta: a.carta }; }
  return out.sort((a, b) => Number(!!a.aberto) - Number(!!b.aberto) || (b.aberto?.em ?? 0) - (a.aberto?.em ?? 0) || b.id.localeCompare(a.id));
}

/** Cartas da coleção (de baús abertos), com a data em que cada uma chegou primeiro. */
export function colecaoDe(r: RegistroAparelho): Map<string, { em: number; vezes: number }> {
  const m = new Map<string, { em: number; vezes: number }>();
  for (const b of Object.values(r.baus)) {
    const cur = m.get(b.carta);
    m.set(b.carta, { em: Math.min(cur?.em ?? Infinity, b.em), vezes: (cur?.vezes ?? 0) + 1 });
  }
  return m;
}
