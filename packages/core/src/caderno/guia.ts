import { getSection, setSection } from './markdown';
import { NON_CARD_TYPES, timeline, typeInfo, type World } from './mundo';
import { ELEMENTS, ELEMENT_FAMILIES, type ElementCoverage } from './elementos';

/*
 * Guia de construção: checklists, dicas de ofício e "próximos passos".
 *
 * Os checklists ficam na nota do mundo, numa seção "Checklist" com tarefas
 * do markdown (`- [x] Defini a premissa`), então o Obsidian também mostra e
 * marca. Os próximos passos são calculados do que o mundo tem e do que falta.
 */

export interface Checklist {
  id: string;
  titulo: string;
  desc: string;
  itens: string[];
}

export const CHECKLISTS: Checklist[] = [
  { id: 'fundacao', titulo: 'Fundação', desc: 'O que decidir antes de tudo, nem que seja a lápis.', itens: [
    'Escrevi a premissa numa frase ("e se...?")', 'Escolhi o gênero e o tom', 'Sei qual é a escala: uma cidade, um reino, um continente, um planeta',
    'Defini o "agora" do mundo (o ano em que as histórias acontecem)', 'Listei três coisas que tornam este mundo diferente de todos os outros',
    'Sei o que é impossível aqui', 'Tenho um mapa, mesmo que rascunho',
  ] },
  { id: 'geografia', titulo: 'Geografia e clima', desc: 'A terra decide onde as cidades nascem e por que as guerras começam.', itens: [
    'Sei onde ficam as montanhas, e por que os rios correm para onde correm', 'As cidades grandes estão perto de água', 'Cada região tem um clima e uma estação difícil',
    'Sei quanto tempo leva para viajar entre os lugares principais', 'Há pelo menos um lugar perigoso e um lugar esquecido', 'As fronteiras seguem rios, serras ou guerras antigas',
    'Escolhi os recursos que cada região tem (e os que faltam)',
  ] },
  { id: 'povos', titulo: 'Povos e culturas', desc: 'Gente que come, reza, ama, briga e enterra os mortos de jeitos diferentes.', itens: [
    'Cada povo tem um jeito de cumprimentar, comer e enterrar os mortos', 'Os povos têm opiniões (erradas) uns sobre os outros', 'Há pelo menos um tabu e uma festa por cultura',
    'Sei que língua cada povo fala, e qual é a do comércio', 'As culturas mudam por região, classe e idade (não são monólitos)', 'Cada espécie tem um ciclo de vida e um lugar na cadeia alimentar',
  ] },
  { id: 'poder', titulo: 'Política e poder', desc: 'Quem manda, por que obedecem e quem quer derrubar.', itens: [
    'Sei quem manda de verdade (e quem só parece mandar)', 'Cada facção tem um objetivo, um recurso e um inimigo', 'Existe um conflito ativo, e um que está para estourar',
    'Sei como funciona a lei para ricos e para pobres', 'Há uma sucessão em disputa ou um trono frágil', 'As alianças têm motivo (e prazo de validade)',
  ] },
  { id: 'economia', titulo: 'Economia', desc: 'Siga o dinheiro: ele explica metade das histórias.', itens: [
    'Sei de que é feita a moeda e quem a cunha', 'Sei quanto custa um pão, uma noite na estalagem e uma espada', 'Há uma rota comercial importante e quem a controla',
    'Existe um bem raro que move intrigas', 'Sei o que é contrabandeado, e por onde', 'Os pobres e os ricos vivem vidas visivelmente diferentes',
  ] },
  { id: 'fe', titulo: 'Religião e mitos', desc: 'O que as pessoas acreditam muda o que elas fazem.', itens: [
    'Sei se os deuses existem (e se o leitor vai descobrir)', 'Há um mito de criação e um de fim do mundo', 'A religião tem gente boa e gente corrupta',
    'Sei o que acontece com os mortos (ou o que acham que acontece)', 'Existe uma heresia ou seita perigosa', 'Feriados e ritos aparecem na vida comum',
  ] },
  { id: 'magia', titulo: 'Magia e tecnologia', desc: 'Regras claras rendem soluções boas; custos rendem drama.', itens: [
    'Sei de onde vem a magia (ou a tecnologia avançada)', 'Usar tem um custo que dói', 'Existem limites que nem o mais poderoso quebra',
    'Sei quem pode usar, e o que a sociedade acha disso', 'A magia mudou a guerra, a medicina e a economia', 'Pensei no que acontece quando dá errado',
    'O leitor entende as regras antes de elas resolverem o clímax',
  ] },
  { id: 'historia', titulo: 'História do mundo', desc: 'O passado deixa cicatrizes no presente.', itens: [
    'Há uma linha do tempo com as grandes eras', 'Sei qual foi a última guerra grande e quem venceu', 'Existem ruínas de alguém que veio antes',
    'Pelo menos uma "verdade histórica" é mentira', 'O passado explica um conflito de hoje',
  ] },
  { id: 'personagens', titulo: 'Personagens', desc: 'O mundo existe para eles terem onde tropeçar.', itens: [
    'O protagonista quer algo concreto e precisa de algo diferente', 'O antagonista acha que está certo', 'Cada personagem principal tem medo, segredo e contradição',
    'Os personagens pertencem ao mundo: cultura, classe, fé e sotaque', 'Os coadjuvantes têm vida fora da cena', 'Alguém muda de lado',
  ] },
  { id: 'escrita', titulo: 'História (escrita)', desc: 'Do mundo para a página.', itens: [
    'Escolhi uma estrutura (três atos, jornada, sete pontos...)', 'Sei o final, ou pelo menos a pergunta que ele responde', 'Cada cena tem objetivo, conflito e desfecho',
    'O mundo aparece pelos olhos dos personagens, não em aulas', 'Cortei a explicação que o leitor não precisa', 'O ponto médio muda o jogo',
    'A primeira página tem uma pergunta', 'Reli em voz alta as cenas mais importantes',
  ] },
  { id: 'consistencia', titulo: 'Consistência', desc: 'Antes de mostrar a alguém.', itens: [
    'Ninguém morre antes de nascer (veja a revisão em Ideias)', 'Os nomes soam como vindos da mesma língua quando deviam', 'As distâncias batem com o tempo de viagem',
    'As estações e o clima batem com o mapa', 'Cada regra de magia foi respeitada até o fim',
  ] },
];

export const CHECK_SECTION = 'Checklist';

/** Itens marcados (`- [x] ...`) na seção de checklist da nota do mundo. */
export function readChecks(text: string): Set<string> {
  const sec = getSection(text, CHECK_SECTION) ?? '';
  const out = new Set<string>();
  for (const line of sec.split('\n')) {
    const m = /^\s*[-*]\s*\[([xX ])\]\s*(.+?)\s*$/.exec(line);
    if (m && m[1]!.toLowerCase() === 'x') out.add(m[2]!.trim());
  }
  return out;
}

/** Marca ou desmarca um item, mantendo os outros (e os escritos à mão) no lugar. */
export function toggleCheck(text: string, item: string, on: boolean): string {
  const sec = getSection(text, CHECK_SECTION);
  const lines = (sec ?? '').split('\n').filter((l, i, a) => l.trim() || i < a.length - 1);
  const idx = lines.findIndex((l) => {
    const m = /^\s*[-*]\s*\[[xX ]\]\s*(.+?)\s*$/.exec(l);
    return m && m[1]!.trim() === item;
  });
  const line = `- [${on ? 'x' : ' '}] ${item}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  return setSection(text, CHECK_SECTION, lines.filter((l) => l.trim()).join('\n'));
}

// ------------------------------------------------------------------ dicas

export interface Dica {
  tema: string;
  titulo: string;
  texto: string;
}

export const DICAS: Dica[] = [
  { tema: 'Começo', titulo: 'Comece pequeno', texto: 'Uma vila bem pensada vale mais que um continente vazio. Construa o que a primeira história pisa; o resto pode esperar.' },
  { tema: 'Começo', titulo: 'Construa para a história', texto: 'Antes de inventar o sistema tributário, pergunte: alguma cena precisa disso? Se não precisa, anote a ideia e siga.' },
  { tema: 'Começo', titulo: 'Uma pergunta por vez', texto: 'Mundo bom nasce de perguntas: por que esta cidade fica aqui? Quem se beneficia desta lei? Cada resposta puxa outra pergunta.' },
  { tema: 'Geografia', titulo: 'A água manda', texto: 'Cidades nascem em rios, portos e oásis. Rios descem das serras para o mar e quase nunca se dividem no caminho (só nos deltas).' },
  { tema: 'Geografia', titulo: 'Montanhas fazem desertos', texto: 'O vento úmido sobe a serra, chove de um lado e chega seco do outro. Um deserto atrás de uma cordilheira parece de verdade.' },
  { tema: 'Geografia', titulo: 'Distância é tempo', texto: 'A pé, uns 30 km por dia; a cavalo, 60; de barco, mais. Use a régua do mapa: a viagem vira cena, e o atraso, conflito.' },
  { tema: 'Cultura', titulo: 'Cultura vem do lugar', texto: 'Quem vive no frio valoriza abrigo e hospitalidade; quem vive em rotas de comércio fala muitas línguas. Deixe o mapa moldar os costumes.' },
  { tema: 'Cultura', titulo: 'Nada de povo monolítico', texto: 'Dentro de cada povo há ricos e pobres, devotos e céticos, jovens que acham os velhos antiquados. A variação é o que dá vida.' },
  { tema: 'Cultura', titulo: 'Mostre pelo cotidiano', texto: 'Um ritual à mesa, um xingamento, uma superstição antes de dormir dizem mais sobre a cultura que um parágrafo de enciclopédia.' },
  { tema: 'Política', titulo: 'Siga o dinheiro', texto: 'Quem paga os soldados manda. Quem controla o sal, o ferro ou a água tem poder mesmo sem coroa.' },
  { tema: 'Política', titulo: 'Todo vilão tem razão', texto: 'Facções querem coisas que fazem sentido para elas. O conflito mais rico é entre dois lados que têm um pouco de razão.' },
  { tema: 'Magia', titulo: 'Limites valem mais que poderes', texto: 'O que a magia não pode fazer é o que gera tensão. Um poder sem custo resolve tudo, e uma história em que tudo se resolve não prende.' },
  { tema: 'Magia', titulo: 'Explique antes de usar', texto: 'Se a magia vai salvar o dia no clímax, o leitor precisa conhecer a regra antes. Magia misteriosa serve para criar problemas, não para resolvê-los.' },
  { tema: 'Magia', titulo: 'Magia muda a sociedade', texto: 'Se dá para curar com feitiço, como é a medicina? Se dá para voar, para que servem muralhas? Pense nas consequências de segunda ordem.' },
  { tema: 'História', titulo: 'O passado é contado por alguém', texto: 'Toda crônica tem um autor com interesses. Deixe versões diferentes do mesmo acontecimento: é ouro para intriga.' },
  { tema: 'História', titulo: 'Ruínas contam histórias', texto: 'Quem construiu, por que foi embora, o que ficou para trás. Uma ruína bem pensada é uma aventura pronta.' },
  { tema: 'Espécies', titulo: 'Biologia vira cultura', texto: 'Uma espécie que vive 400 anos pensa a política de outro jeito. Uma que põe ovos cria os filhos em ninhos comunais. Comece pelo corpo.' },
  { tema: 'Espécies', titulo: 'Mais que humanos com chapéu', texto: 'Pergunte o que a espécie percebe que nós não percebemos (cheiro, calor, magia) e como isso muda a arte, a guerra e o amor.' },
  { tema: 'Idiomas', titulo: 'Nomes da mesma língua', texto: 'Nomes de um mesmo povo soam parecidos. Use o gerador do idioma para que a capital, o rei e o rio pareçam vir do mesmo lugar.' },
  { tema: 'Idiomas', titulo: 'Poucas palavras, bem usadas', texto: 'Três ou quatro palavras inventadas que voltam sempre (um cumprimento, um palavrão, um título) dão sabor sem cansar o leitor.' },
  { tema: 'Escrita', titulo: 'O iceberg', texto: 'Mostre um décimo do mundo. O leitor sente o resto pelo peso do que você sabe e não diz.' },
  { tema: 'Escrita', titulo: 'Nada de aula', texto: 'Informação entra quando o personagem precisa dela, misturada à ação. Se dois personagens explicam algo que ambos sabem, corte.' },
  { tema: 'Escrita', titulo: 'Cena = objetivo, conflito, desfecho', texto: 'Toda cena tem alguém querendo algo, algo no caminho e uma mudança no fim (geralmente para pior). Se nada muda, a cena talvez não precise existir.' },
  { tema: 'Escrita', titulo: 'Detalhe específico', texto: '"Uma cidade bonita" não fica; "telhados de cobre verde e o cheiro de peixe frito no cais" fica. Um detalhe concreto vale cinco adjetivos.' },
  { tema: 'Escrita', titulo: 'Personagem é escolha', texto: 'Mostre quem a pessoa é pelo que ela escolhe sob pressão, especialmente quando custa caro.' },
  { tema: 'Escrita', titulo: 'Termine o rascunho', texto: 'O primeiro rascunho é para você descobrir a história. Revise depois; mundo perfeito com livro inacabado não ajuda ninguém.' },
  { tema: 'Poderes', titulo: 'O custo é a cena', texto: 'Um poder que cobra caro obriga a personagem a escolher. É nessa escolha (usar e pagar, ou não usar e perder) que mora o drama.' },
  { tema: 'Poderes', titulo: 'Limite antes de efeito', texto: 'Antes de decidir o que o poder faz, decida o que ele não faz. Limites claros rendem soluções criativas; efeitos sem fim rendem tédio.' },
  { tema: 'Poderes', titulo: 'Poder deixa rastro', texto: 'Cheiro de ozônio, geada nas bordas, cães latindo: um sinal visível transforma o poder em parte da cena, e dá aos inimigos como reagir.' },
  { tema: 'Poderes', titulo: 'Escada de poderes', texto: 'Ligue poderes com "requer": quem aprende o segundo precisa do primeiro. A árvore mostra a jornada de um aprendiz até mestre.' },
  { tema: 'Economia', titulo: 'Quem controla a fonte', texto: 'Quem controla o sal, o ferro ou a água controla as guerras. Marque o que cada lugar produz e precisa: as rotas e os monopólios aparecem sozinhos.' },
  { tema: 'Economia', titulo: 'O preço do pão', texto: 'Saber quanto custa um pão e uma noite na estalagem diz mais sobre o mundo que um tratado de economia. A diária de um trabalhador é a régua de tudo.' },
  { tema: 'Economia', titulo: 'Escassez é enredo', texto: 'Um recurso que muitos precisam e poucos produzem é uma história pronta: contrabando, alta de preço, cerco, revolta.' },
  { tema: 'Economia', titulo: 'Moeda é política', texto: 'Quem cunha a moeda manda nela. Moeda falsa, moeda desvalorizada, moeda proibida: cada uma é um conflito.' },
  { tema: 'Calendário', titulo: 'Dias com nome', texto: 'Meses e dias da semana com nomes próprios fazem o tempo parecer daqui. Comece pelos meses: o nome costuma vir do clima, da colheita ou de um deus.' },
  { tema: 'Calendário', titulo: 'Festas mostram valores', texto: 'O que um povo comemora revela o que ele valoriza. E o que ele proíbe nas festas revela o que ele teme.' },
  { tema: 'Calendário', titulo: 'Luas diferentes', texto: 'Duas luas com ciclos diferentes ficam cheias juntas de tempos em tempos. Essa noite rara pede uma profecia, um ritual, um crime.' },
  { tema: 'Criaturas', titulo: 'Toda fera tem motivo', texto: 'Criatura que ataca por atacar é cenário. A que ataca por fome, território ou ordem de alguém é personagem.' },
  { tema: 'Criaturas', titulo: 'Onde vive importa', texto: 'Dê um habitat a cada criatura: as tabelas de encontros de cada região se montam sozinhas, e o perigo de cada lugar fica claro.' },
  { tema: 'Criaturas', titulo: 'Perigo perto de gente', texto: 'Uma vila ao lado de um ninho de dragão precisa explicar por que ainda existe: um pacto, um tributo, um herói cansado.' },
  { tema: 'Personagens', titulo: 'Três traços bastam', texto: 'Três traços bem escolhidos (um deles contraditório) desenham uma pessoa inteira. Mais que isso vira lista de compras.' },
  { tema: 'Personagens', titulo: 'A mentira do arco', texto: 'Toda personagem que muda acredita numa mentira no começo. O arco é o caminho até perceber a verdade, ou até ser destruída por ela.' },
  { tema: 'Personagens', titulo: 'Química é atrito', texto: 'Dois personagens que concordam em tudo não rendem cena. Coloque juntos quem tem traços que se repelem e veja as faíscas.' },
  { tema: 'Personagens', titulo: 'Quer x precisa', texto: 'O que a personagem quer move a trama; o que ela precisa move o coração. Quando os dois se opõem, o leitor não larga o livro.' },
  { tema: 'Povos', titulo: 'Conte as pessoas', texto: 'Escreva a população dos lugares e o almanaque soma tudo pela hierarquia. Uma capital com 300 habitantes e um vilarejo com 50 mil denunciam um erro, ou um mistério.' },
  { tema: 'Povos', titulo: 'Ninguém é monólito', texto: 'Dentro de um povo há ricos e pobres, devotos e céticos, jovens e velhos. Dê pelo menos duas opiniões diferentes sobre o mesmo costume.' },
  { tema: 'Recompensas', titulo: 'Baús e cartas', texto: 'Cumpra as três missões do dia para ganhar um baú. Cada baú traz uma carta de inspiração: use-a como ponto de partida para a próxima cena.' },
  { tema: 'Revisão', titulo: 'Contradições são sementes', texto: 'Achou algo que não bate? Às vezes a correção é virar mistério: por que o registro diz uma coisa e a ruína outra?' },
];

// ------------------------------------------------------------------ próximos passos

export type PassoGuia =
  | { texto: string; acao: 'criar'; tipo: string; nome?: string }
  | { texto: string; acao: 'aba'; aba: string }
  | { texto: string; acao: 'abrir'; path: string }
  | { texto: string; acao: 'elemento'; elemento: string };

/** O que fazer agora, pelo estado do mundo. Até `max` sugestões, as mais básicas primeiro. */
export function proximosPassos(w: World, cov: ElementCoverage[] = [], max = 8): PassoGuia[] {
  const out: PassoGuia[] = [];
  const n = (t: string) => w.entities.filter((e) => e.type === t).length;
  const add = (p: PassoGuia) => {
    if (out.length < max * 2) out.push(p);
  };
  if (!n('mapa')) add({ texto: 'Crie um mapa: o Tanden gera um continente com placas, clima, biomas e nomes.', acao: 'criar', tipo: 'mapa', nome: `Mapa de ${w.name}` });
  if (!n('lugar')) add({ texto: 'Crie o primeiro lugar: onde a história começa?', acao: 'criar', tipo: 'lugar' });
  if (!n('personagem')) add({ texto: 'Crie uma personagem: quem vai sofrer neste mundo?', acao: 'criar', tipo: 'personagem' });
  if (!n('especie') && !n('cultura')) add({ texto: 'Crie um povo: uma espécie no construtor de seres, ou uma cultura.', acao: 'aba', aba: 'seres' });
  if (!n('faccao')) add({ texto: 'Crie uma facção: quem disputa o poder?', acao: 'criar', tipo: 'faccao' });
  if (!n('conflito') && n('faccao') >= 2) add({ texto: 'Ponha duas facções em conflito: o que uma quer que a outra tem?', acao: 'criar', tipo: 'conflito' });
  if (timeline(w).length < 3) add({ texto: 'Dê datas às coisas: nascimento, fundação, batalhas. A linha do tempo se monta sozinha.', acao: 'aba', aba: 'tempo' });
  if (n('cultura') && !n('idioma')) add({ texto: 'Dê uma língua a um povo: o gerador de idiomas cria palavras e nomes coerentes.', acao: 'aba', aba: 'sistemas' });
  if (!n('divindade') && !w.entities.some((e) => /religi|f[eé]|deus|culto/i.test(`${e.name} ${JSON.stringify(e.props)}`))) add({ texto: 'Em que este mundo acredita? Crie uma divindade ou uma religião.', acao: 'criar', tipo: 'divindade' });
  if (n('personagem') >= 2 && !n('historia')) add({ texto: 'Comece uma história: escolha uma estrutura e escreva a primeira cena.', acao: 'aba', aba: 'escrita' });
  const broken = new Set(w.relations.filter((r) => !r.to).map((r) => r.target));
  if (broken.size >= 3) add({ texto: `${broken.size} fichas são citadas e ainda não existem. Crie as que importam.`, acao: 'aba', aba: 'ideias' });
  const species = w.entities.filter((e) => e.type === 'especie' && !Object.keys(e.props).some((k) => /^corpo$|^dieta$/i.test(k)));
  if (species[0]) add({ texto: `${species[0].name} ainda não tem corpo nem dieta: use o construtor de espécies.`, acao: 'abrir', path: species[0].path });
  const weak = w.entities.filter((e) => !NON_CARD_TYPES.has(e.type)).sort((a, b) => a.score - b.score).slice(0, 2);
  for (const e of weak) if (e.score < 0.35) add({ texto: `Aprofunde ${e.name} (${typeInfo(e.type).label.toLowerCase()}): está só ${Math.round(e.score * 100)}% preenchida.`, acao: 'abrir', path: e.path });
  // famílias inteiras vazias: sugere o primeiro elemento delas
  if (cov.length) {
    for (const f of ELEMENT_FAMILIES) {
      if (f.id === 'narrativa' || f.id === 'cosmos') continue;
      const l = cov.filter((c) => c.element.family === f.id && c.level !== 'fora');
      if (l.length && l.every((c) => c.level === 'vazio')) {
        const el = l[0]!.element;
        add({ texto: `Nada de ${f.label.toLowerCase()} ainda. Que tal começar por ${el.nome.toLowerCase()}? ${el.perguntas[0] ?? ''}`, acao: 'elemento', elemento: el.id });
      }
    }
  }
  return out.slice(0, max);
}

/** Um elemento e uma pergunta ao acaso, para o "e se eu pensasse em...?" do dia. */
export function provocacao(seed: number): { elemento: string; pergunta: string } {
  const el = ELEMENTS[Math.abs(seed) % ELEMENTS.length]!;
  return { elemento: el.id, pergunta: el.perguntas[Math.abs(seed >> 3) % el.perguntas.length]! };
}
