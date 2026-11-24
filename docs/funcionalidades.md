# Funcionalidades

O que cada tela e recurso do Tanden faz. Tudo continua sendo arquivo comum
(`.md`, `.canvas`, `.xlsx`), que o Obsidian abre igual. Para a parte técnica
(merge, sync, eventos), veja [../architecture.md](../architecture.md); para
configurar (Drive, Android, atualização), veja
[configuracao.md](configuracao.md).

## Editor de notas

O editor funciona como o Notion, mas o arquivo continua sendo Markdown comum, que o Obsidian abre igual.

- **Prévia ao vivo.** Os títulos, o negrito, os links, as tarefas, as tabelas e as fórmulas já aparecem formatados, e a marcação só volta na linha do cursor. O **Ctrl+Shift+E** alterna para o Markdown puro.
- **Menu `/`.** Ele insere títulos, listas, tarefas, citação, callouts (`> [!dica]`), toggle (`> [!toggle]-`), colunas, tabela, divisor, imagem, vídeo, arquivo, página web, nota embutida, fórmula, cálculo, gráfico, código, data e lembrete. Em **Escrita criativa**: nome sorteado (élfico, anão, nórdico, latino), personalidade sorteada (motivação, medo, segredo…), linha de diálogo e bloco de regras.
- **Buscar e substituir.** **Ctrl+F** (ou **Ctrl+H**) abre a busca dentro da nota, com substituir, maiúsculas/minúsculas, palavra inteira e regex. **F3** e **Ctrl+G** andam entre os resultados; **todos** seleciona cada ocorrência de uma vez.
- **Foco no parágrafo** (**Ctrl+Shift+L**, ou no ⋯ da nota): só o parágrafo do cursor fica aceso, o resto esmaece, e a linha em que você escreve fica no meio da tela, como numa máquina de escrever. Vale também para o texto das fichas dos Mundos.
- **Blocos.**
  - A alça ⋮⋮ à esquerda arrasta o bloco; o + cria um bloco embaixo.
  - O menu da alça transforma, duplica, move, apaga, copia o texto ou copia um link para o bloco (`[[Nota#^id]]`).
  - **Alt+↑/↓** move o bloco e **Ctrl+D** duplica.
- **Seleção.** Selecionar um texto abre uma barra para mudar o tipo do bloco, aplicar negrito, itálico, riscado, código ou realce, e criar um link, um `[[ ]]` ou uma fórmula.
- **Tabelas.** A tabela é editada direto nas células: Tab e as setas andam entre elas, e o + adiciona linha ou coluna. O botão direito insere, apaga, alinha, ordena ou abre a tabela como Markdown.
- **Imagens.**
  - Para inserir uma imagem, cole, arraste ou use `/imagem`.
  - A legenda é editada embaixo da imagem e o canto muda o tamanho. O resultado fica salvo como `![[foto.png|legenda|400]]`.
  - Links do YouTube e do Vimeo viram um player, e `![[Nota#Seção]]` mostra o trecho de outra nota.
- **Links e menções.**
  - `[[` sugere notas e títulos, e cria a nota se ela ainda não existe.
  - Passar o mouse num link mostra a nota, e as propriedades dela num mini-cartão (numa ficha do mundo: o tipo, o líder, a sede...).
  - `@` insere datas (hoje, amanhã, dias da semana) e, dentro de uma tarefa, um lembrete.
  - `#` sugere as tags que já existem.
  - Colar uma página da web converte o conteúdo para Markdown, e colar um link sobre um texto selecionado cria o link.
- **A nota.**
  - O título é o nome do arquivo, e editar o título renomeia a nota e atualiza todos os links para ela.
  - O ⋯ tem as opções favoritar, mover, duplicar, histórico, apagar (que manda a nota para `.trash/`) e Markdown puro.
  - O painel lateral tem o sumário e as conexões: as notas que apontam para esta, com o contexto, e as menções sem link, que um botão transforma em link.
- **Histórico de versões.** O editor guarda uma versão a cada 5 minutos de edição. O histórico compara qualquer versão com a nota atual e restaura a versão escolhida; o **Ctrl+Z** desfaz a restauração.
- **Paleta.**
  - **Ctrl+K** ou **Ctrl+O** procura uma nota pelo nome ou pelo texto.
  - **Ctrl+P** lista os comandos, **Ctrl+Shift+F** busca no texto e **Ctrl+Enter** cria uma nota com o nome digitado.
- **Exportar.** A nota sai como PDF, Word (`.docx`), LibreOffice Writer (`.odt`), página `.html` ou Markdown.
- **Atalhos de formatação.**

  | Atalho | O que faz |
  | --- | --- |
  | Ctrl+B / Ctrl+I / Ctrl+E | negrito, itálico, código |
  | Ctrl+Shift+X / Ctrl+Shift+H | riscado, realce |
  | Ctrl+Shift+M | fórmula |
  | Ctrl+K com texto selecionado | link |
  | Ctrl+Shift+K | link `[[ ]]` |
  | Ctrl+Alt+1 / 2 / 3 | título 1, 2 e 3 |
  | Ctrl+Alt+4…9 | tarefa, lista, lista numerada, toggle, código e citação |
  | Ctrl+Alt+0 | texto comum |
  | Ctrl+Shift+7 / 8 / 9 | lista numerada, lista e tarefa |
  | Ctrl+Enter | marca ou desmarca a tarefa |

## Cadernos: jogos de luta e world building

Os dois cadernos são notas `.md` comuns com propriedades no topo, então o Obsidian abre, busca e liga tudo do mesmo jeito.

**Luta** (`Luta/<jogo>/<personagem>.md`, `tipo: lutador`): combos em notação numpad (`2MK xx 236HP`, `[4]6P`, `j.HK`) que viram ícones de direção e botão, frame data, matchups e uma aba de punições que cruza o bloqueio dos golpes do oponente com o startup dos seus. A nota do jogo (`tipo: jogo`) define a notação: `sf`, `tekken`, `gg`, `kof`, `dbfz` ou `livre` com `botões: [...]`. Frame data entra por CSV ou colando uma tabela de site; nomes de coluna em inglês ou português servem, e reimportar atualiza sem apagar suas notas.

**Mundos** (`Mundos/<mundo>/<Tipo>/<nome>.md`): cada ficha tem `tipo` (personagem, lugar, facção, evento, conflito, item, espécie, cultura, conceito, criatura, divindade, religião, magia, livro, feito, profecia, plano, idioma, história, cena, mapa ou um seu) e `mundo`. Uma propriedade com `[[link]]` vira uma ligação com o nome da propriedade (`afiliação: "[[Ordem do Sol]]"`); links no texto viram "menciona". Datas (`data`, `nascimento`, `morte`, `fundação`, `fim`) montam a linha do tempo e aceitam qualquer calendário: `342`, `-50`, `50 a.C.`, `12/03/342`, `12 de março de 342` ou com meses inventados (`3 de Semeadura de 310`).

- **Navegação.** As abas ficam em quatro grupos: explorar (Fichas, Mapas, Tempo, Ligações), construir (Elementos, Seres, Sistemas, Escrita), dinâmica (Conflitos, Simulação) e oficina (Guia, Ideias, Regras), mais **Mercado** e **Almanaque**. Em Fichas, Tempo e Ligações, os chips de tipo filtram (Todas, Personagens, Lugares…). No celular, as abas de explorar ficam numa barra embaixo e o resto em **Mais**; tocar no nome do mundo troca de mundo (e abre a nota do mundo), e o botão **+** flutuante cria uma ficha.
- **Fichas.** Cada tipo sugere campos (com uma dica do que escrever) e campos extras como botão: `motivação`, `medo`, `segredo`, `pai`, `mãe` no personagem; `poder`, `riqueza`, `território` na facção. **Aprofundar** traz perguntas por tipo ("Qual mentira ela conta para si mesma?") que viram seções para responder, e **🎲 Personalidade** preenche motivação, medo, segredo e maneirismo vazios. O anel mostra quanto a ficha está preenchida (resumo, imagem, campos, seções, ligações). O texto da ficha usa o editor completo: menu `/`, `[[` com sugestões e prévia ao vivo.
- **Cartas.** Na aba Fichas, **Cartas** mostra cada ficha como uma carta que inclina com o mouse; um clique vira a carta e mostra as ligações no verso. **Menos completas** ordena pelo que falta escrever.
- **Mapas** (`tipo: mapa`). Sem imagem, o mapa é um continente gerado pela `semente`, com hidrologia de verdade: as depressões viram lagos, a água desce morro abaixo e os rios nascem onde ela se junta, escavam o vale e engrossam até a foz (a mesma semente dá o mesmo mapa em todo aparelho). `mar: 55%` e `rios: 2` (0 a 3) na nota, ou nos seletores de baixo, mudam a fração de mar e a densidade de rios. Ao aproximar, a parte visível é redesenhada na resolução da tela (costa recortada, relevo nítido). **Usar minha imagem** troca por uma imagem sua. Os marcadores ficam na tabela `## Marcadores` da nota (`| [[Vale]] | 42.5 | 61 |`, X e Y em %), então o Obsidian lê normal. Lugares aparecem como **estruturas** (capital, cidade, vila, aldeia, castelo, forte, porto, templo, torre, ruínas, mina, caverna, acampamento; `região` vira só o nome por cima do mapa): pelo campo `estrutura` da ficha, pelo nome ("Castelo Negro", "Porto Sal"), pela `população` ou pela água ao lado (cidade na costa vira porto); dá para trocar no cartão do marcador. As `rotas`/`estradas` entre lugares viram **estradas** que contornam água e montanha. **Marcar** põe um marcador, arrastar move, **Medir** dá a distância pela `escala` (largura do mapa) e `unidade`, com o tempo de viagem a pé, a cavalo e de barco. **Espalhar lugares** põe em terra firme os lugares que ainda não estão no mapa. A ficha mostra em que mapas ela aparece.
- **Mundo físico do mapa.** Com `tectônica: sim` o relevo nasce de placas: onde elas se chocam sobem cordilheiras e arcos de ilhas, onde se afastam abrem fendas e fossas. `clima` (temperado, tropical, frio, árido, sul, planeta inteiro ou polar) põe o mapa numa faixa de latitude, e `calor` (em °C, de −20 a +20) esquenta ou esfria tudo. Daí saem temperatura (cai 6,5 °C por km de altitude), chuva (ventos dominantes que chovem na encosta e deixam sombra de chuva atrás da serra) e **25 biomas** (de recife, mangue e selva a taiga, tundra, neve e terra vulcânica), cada um com flora, fauna e perigos, além da rocha do chão. `estilo` escolhe o desenho: **relevo**, **atlas** (curvas de nível a cada 500 m e faixas de profundidade) ou **pergaminho** (tinta, montes e árvores desenhados). As camadas mostram biomas, altitude, temperatura, chuva, placas ou rochas. O atlas acha **acidentes** (vulcões, fontes termais, gêiseres, cachoeiras, cavernas, oásis, crateras, deltas, cânions, fiordes) e **riquezas** (ferro, ouro, sal, pedras preciosas, madeira, pesca…), batiza cordilheiras, mares e desertos no estilo de `nomes`, e **Explorar** mostra tudo de um ponto: bioma, altitude, °C, chuva, latitude, rocha, placa, vida e perigos. **Povoar** sugere onde ficariam a capital, cidades, portos, minas e fortes (e por quê); aceitas, viram marcadores com a coluna `Tipo`. **Escrever a geografia na nota** resume tudo numa seção `## Geografia`.
- **Mapas maiores e outros planos.** `tamanho` decide quanto mundo cabe no mapa: **ilha ou região**, **continente** (o padrão), **vários continentes**, **hemisfério** ou **mundo inteiro** (mais placas, mais continentes e uma grade maior, com a `escala` padrão de 300 a 40.000 km). `natureza` muda o mundo físico para outro plano: **infernal** (mares de lava, planícies de cinza, serras de obsidiana, campos de enxofre, bosques em brasa), **feérico** (bosques que escutam, prados encantados, florestas de fungos, campos de cristal), **umbral** (mar de névoa, ermos sem cor, matas mortas, brejos sombrios), **astral** (ilhas flutuantes sobre o vazio estrelado) ou **subterrâneo** (galerias, abismos, fungos e cristais), cada bioma com flora, fauna e perigos próprios, e o "mar" pintado com a cor do plano. Com `plano: [[Feéria]]`, o mapa entra no **atlas** daquele plano: a barra de mapas agrupa os mapas por plano (o mundo principal primeiro) e o mapa herda a natureza do plano.
- **Elementos.** Uma tabela com mais de cem assuntos que um mundo pode ter, em famílias (ecologia, cultura, organizações, história, linguagem, tecnologia, política, economia, infraestrutura, religião, fantástico, sombrio, terras e águas, cosmos, narrativa). A cor de cada quadradinho diz se o mundo ainda não fala dele, começou ou já está vivo, contando as fichas do tipo certo cujo nome ou propriedades tocam o assunto (ou que declaram `elemento: Tabus`). Cada elemento traz perguntas para pensar e cria a ficha já marcada, com as perguntas como seções; o que não existe no seu mundo vai para `fora do mundo` na nota do mundo.
- **Seres.** Espécies e criaturas numa galeria de silhuetas desenhadas pelas propriedades, **em escala** lado a lado com um humano de 1,75 m, numa **tabela** para comparar altura, peso, vida e maioridade, e numa **teia alimentar** em níveis (`come: [[Presa]]`, `presas`, `predadores`). A **forja** sorteia uma espécie inteira (povo ou fera) para virar ficha. Na ficha da espécie, o **construtor** organiza corpo, anatomia, ciclo de vida, sentidos e dons, mente e ambiente em botões, com características **reais e fantásticas** (filtre por tipo, busque por nome ou escreva a sua em **+ outro**). São 31 planos de corpo, do bípede ao enxame, e o **retrato** muda com cada escolha: cabeça, olhos, chifres, orelhas, dentes, asas, cauda, revestimento, padrão e cores, em modo retrato ou em **escala**. Os **moldes** trazem povos, híbridos, feras míticas, animais reais e seres estranhos prontos para adaptar (dá para desfazer). **🎲 Sortear o que falta** segue o que já foi decidido (o habitat puxa o clima e o revestimento, o tamanho puxa o peso), **Variar a aparência** troca o visual mantendo o corpo, as **notas de biologia** apontam o que não fecha (um voador pesado demais) e sugerem ideias de cultura, e o botão de biologia escreve um parágrafo na seção `## Biologia`.
- **Sistemas.** **Idiomas** (`tipo: idioma`): o `som` (suave, áspero, sibilante, cantado, gutural, nasal, antigo, tupi) e a `semente` fixam como a língua soa; a ficha tem amostra de palavras, nomes de gente, nomes de lugar com significado ("Monte Negro"), um tradutor palavra a palavra e o `## Dicionário` da nota (Palavra, Significado, Classe), que sempre vence o sorteio. A aba lista as línguas, quem fala cada uma e os povos ainda sem língua. **Fé**: religiões (`tipo: religião`, com `divindades`, `seguidores`, `textos sagrados`, `sede` e seções de crenças, ritos, clero, além da vida e heresias) numa árvore de cismas (`cisma de: [[Outra fé]]`), as culturas ainda sem fé, e o **panteão** (`tipo: divindade`, com `panteão` e `domínios`): deuses por panteão, domínios disputados, os que ninguém cuida e os deuses sem culto. **Magia** (`tipo: magia`, com `fonte`, `custo`, `quem usa`, `dureza` e `escolas`): cada sistema mostra se é rígido ou macio e quais das cinco perguntas essenciais já têm resposta (como funciona, custo e limites, quem pode usar, o que a sociedade acha, quando dá errado). **Biblioteca** (`tipo: livro`, com `autor`, `data`, `idioma`, `gênero`, `proibido`): os livros numa estante em ordem de data, com títulos sugeridos a partir das suas fichas. **Feitos** (`tipo: feito`, com `autor`, `data`, `categoria`): uma linha do tempo de façanhas e vergonhas, e quem mais fez história. **Profecias** (`tipo: profecia`, com `profeta`, `sobre` e `status`): pendentes, em curso, cumpridas e falsas. **Planos** (`tipo: plano`, com `natureza`, `acesso`, `governante`, `habitantes`): cada plano com seus mapas e lugares, e um botão para criar o mapa dele.
- **Psique.** A ficha de personagem lê os `traços` em cinco eixos (abertura, disciplina, extroversão, amabilidade, instabilidade), mostra um radar comparado ao **arquétipo** mais próximo (herói, rebelde, sábio, sombra, trapaceiro…), aponta traços em conflito ("corajoso e covarde: em que situação cada lado vence?") e sugere traços para somar. O arco (`quer`, `precisa`, `mentira`, `ferida`) ganha uma barra de completude.
- **Poderes** (`tipo: poder`, Sistemas › Poderes). Cada poder tem `custo`, `fraqueza`, `colateral`, `limites`, `nível`, `requer: [[Outro poder]]` e quem o porta. A **balança do poder** compara preço e força (barato demais, justo, caro) e um radar mostra potência, alcance, duração, custo, controle e raridade. A aba desenha a árvore de poderes como uma constelação e lista os poderes sem custo ou sem portador.
- **Mercado** (`tipo: recurso` e `tipo: moeda`). Lugares dizem o que `produz` e o que `precisa`; recursos têm `valor` e `categoria`; moedas têm `vale: 10 [[Prata]]`. A aba calcula escassez e tendência de cada recurso, rotas de comércio, monopólios (a facção que controla todos os lugares que produzem algo), o **câmbio** entre moedas, a cotação do dia (oscila de forma determinística) e quantos dias de trabalho custa cada coisa. Os preços ficam na tabela `## Preços` da nota do mundo. A ficha de um lugar mostra quem manda, o que produz e as criaturas por perto; a de um recurso, o mercado dele.
- **Calendário** (`tipo: calendário`, Sistemas › Calendário). Meses e dias (`meses: Degelo 36, Semeadura 36…`), semana (`semana: Pedra, Água…`), luas com ciclo (`luas: Prateada 12, Rubra 6`) e festas (`festas: Ano Novo 1/1`). A aba mostra o mês com a fase de cada lua por dia, as festas, as estações e as **noites de presságio** (quando as luas cheias coincidem); a revisão aponta festas em dias que não existem.
- **Encontros** (Seres › Encontros). Criaturas com `habitat` e `perigo`/`nd` montam uma **tabela de encontros** por lugar: role o d100 e veja quem aparece (ou só sinais). O **mapa do perigo** ordena os lugares pelo ser mais perigoso e a **escada de ameaça** agrupa as criaturas de baixa a lendária.
- **Almanaque.** O mundo em números: censo por tipo, demografia (espécies, idades, gênero, afiliação) em roscas, palavras escritas convertidas em páginas de livro, recordes (a ficha mais longa, a mais ligada, o mais velho) e o equilíbrio entre os tipos de ficha.
- **Arauto** (🔔 no pulso). Avisos lidos das fichas: monopólios, escassez, poderes sem custo, feras perto de vilas, luas cheias juntas, ódios no elenco, marcos de população. Cada sinal leva aonde agir (abrir a ficha, ver a aba, criar o que falta); os novos ganham marca até serem lidos.
- **Tesouro** (Crônica › Tesouro). Cumprir as três missões do dia, cada 7 dias de sequência e cada 5 níveis de um mundo dão **baús**. Cada baú revela uma das 96 **cartas de inspiração** (seis naipes: rostos, chão, fios, véus, assombros e cinzas; quanto mais sorte, mais rara), que viram ficha num clique. A **coleção** mostra as que faltam e a **vitrine** usa 30 **relíquias** desbloqueadas por marcos: adornos para o planeta, molduras para as cartas das fichas e títulos sob o nome do mundo. A carta sai do nome do baú, então vale igual em qualquer aparelho.
- **Escrita.** Histórias (`tipo: história`) com uma estrutura (três atos, jornada do herói, quinze batidas, sete pontos, quatro tempos ou mistério) e meta de palavras; cenas (`tipo: cena`, com `história`, `ordem`, `batida`, `pov`, `local`, `status`, `objetivo`, `conflito`, `desfecho`) num quadro por batida. Cada cena abre num editor ao lado, com a situação (ideia, rascunho, revisão, pronta), ponto de vista, local e o texto. **Elenco** mostra quem aparece em que cena (e quem é o ponto de vista), e as fichas ainda não usadas; **Manuscrito** junta as cenas em ordem, para ler, copiar ou salvar como nota. As **ideias de cena** usam motivações, medos e segredos das suas personagens e viram cena num clique.
- **Guia.** O que fazer agora (calculado do que o mundo tem e do que falta), onze **checklists** por tema (fundação, geografia, povos, poder, economia, fé, magia, história, personagens, escrita, consistência), guardados na nota do mundo como tarefas `- [x]` na seção `## Checklist`, e dicas de ofício para construir e escrever.
- **Conflitos.** Fichas `tipo: conflito` com `lados: [[A]], [[B]]`, `status` e `intensidade` (1 a 5). A aba junta os conflitos, as rivalidades (campos como `inimigos`, `rival`, `contra`) e as alianças (`aliados`, `aliança com`), e uma matriz de quem está com quem entre as facções.
- **Simulação de vidas** (Simulação › 👥 Vidas). Gente mês a mês: escolha onde, quando começa (o "agora" do mundo, dito na tela) e quais personagens vivem lá, peça figurantes (em famílias, com profissões e vizinhos) e ande no tempo. Cada pessoa tem genes (Mendel e poligênicos, doença recessiva, consanguinidade), temperamento, ~70 traços, gostos, habilidades, profissão, meta e uma opinião sobre cada outra (afeto, atração, confiança, respeito, intimidade e memórias). Elas conversam, flertam, namoram, casam, traem (o caso é segredo até alguém descobrir, e a descoberta tem consequências), brigam, duelam, roubam, têm filhos, envelhecem e morrem. Você conduz pessoas (as propostas a elas viram decisões suas), sussurra paixões e rancores, força ações, mexe em relações e traços, provoca festas, pestes e guerras e ajusta o mundo. **Gravar nas fichas** leva o resultado para as notas; a nota da simulação refaz a mesma história ao abrir. Guia completo em [vidas.md](vidas.md).
- **Simulação de facções** (Simulação › ⚑ Facções). Roda as facções por N anos a partir do ano escolhido (por padrão o "agora" do mundo): cada uma cresce, ataca inimigos, faz alianças, sofre crises, pestes e traições, a partir de `poder`, `riqueza` e `estabilidade` (1 a 10, ou estimados pelas ligações) e do território (`governante`/`controle` no lugar, `sede`/`território` na facção). Mostra o gráfico do poder e a crônica com `[[links]]`; **+ evento** transforma um acontecimento em ficha de evento, e **Salvar como nota** grava a crônica em `Simulações/` (sem `tipo`, então não vira cânone). A mesma semente conta a mesma história.
- **Ideias.** A **revisão** aponta contradições (morreu antes de nascer, participou de um evento depois de morto, filho que nasce antes do pai, idade além da expectativa de vida da espécie), nomes repetidos, conflitos de um lado só, aliados que também são inimigos e fichas soltas ou citadas sem existir (com o botão de criar). Os **geradores** fazem ganchos de história com as fichas reais, nomes num estilo ou **no estilo do mundo** (aprendidos dos nomes que você já usa) e personalidades.
- **Regras.** Blocos ` ```regras ` nas notas do mundo dão comportamento a ele: tipos novos de ficha, grupos por característica, campos calculados, botões de ação nas fichas, eventos em cadeia e interações entre personagens (cada um se atrai por outro conforme uma expressão, e algo acontece com certa chance), com textos sorteados de bancos (`tipo: tabela`). Rodam nas duas simulações (a de facções passa a funcionar só com regras) e nos botões; também declaram traços, profissões e gostos novos para a simulação de vidas. A aba Regras mostra erros, tem um console e um **construtor de mecânicas** (monta interações, acontecimentos e reações por partes e escreve o código) com receitas prontas. Referência completa em [regras.md](regras.md).
- **Territórios.** No mapa, **Territórios** pinta a região de cada facção (pelos donos dos lugares hoje ou depois da última simulação), com as fronteiras.
- **Imprimir cartas.** Em **Cartas**, o botão de impressora imprime as fichas filtradas como cartas de baralho (63×88 mm, 9 por folha A4).
- **Gênero do mundo.** Quinze gêneros (fantasia medieval, alta fantasia, romantasy, cozy fantasy, super-heróis contemporâneos, horror cósmico, weird fiction, cyberpunk, ficção científica, ópera espacial, pós-apocalipse, steampunk, histórico, contemporâneo realista ou livre) mudam as cores, o nome das eras, a moeda de progresso e os textos do oráculo. O gênero fica na nota do mundo, em `gênero: Horror cósmico`.
- **Pulso e eras.** O cabeçalho mostra o planeta do mundo, que ganha detalhes a cada uma das sete eras, com nível, sequência, missões e conquistas. O progresso vem do que existe no mundo e do que você escreveu. A **Crônica** (clique no pulso) reúne as eras, as conquistas e a constância.
- **Raridade das fichas.** Cada ficha tem uma raridade (comum, incomum, rara, épica ou lendária) calculada pelo preenchimento, pelas palavras e pelas ligações. Ela aparece como selo na lista e como moldura nas cartas.
- **Barra de escrita.** Acima do texto das fichas e das cenas ficam a meta do dia (100 palavras, ajustável), a sequência e as palavras da sessão. Só conta texto novo: colar mais de 150 palavras de uma vez ou reescrever o que já existia não soma. Sete dias seguidos dão um escudo contra um dia perdido (até três). Os avisos esperam você parar de digitar.
- **Sprints.** Escolha duração e meta de palavras. No modo **Escreva ou Desapareça**, o texto esmaece se você parar por muito tempo, mas é só visual: nada é apagado e o texto volta inteiro no fim.
- **Oráculo** (aba Ideias). As cartas combinam as suas fichas com o clima do gênero em gancho, reviravolta, complicação e detalhe, e viram cena ou evento num clique. **Pergunte ao destino** responde sim ou não com um d100, conforme a chance escolhida.
- **Entrevista.** Na ficha, **Entrevistar** faz uma pergunta por vez, e a resposta vai direto para a nota, na propriedade ou seção certa.
- **Missões de hoje** (aba Guia). Três missões por dia, escolhidas pelo que o mundo precisa, com um botão que leva direto à ação.
- **Conquistas.** São 409, épicas e bem-humoradas, com cinco raridades e várias secretas.
- **IA opcional.** Tudo funciona sem IA. No app instalado, com o Ollama ligado, o oráculo e a entrevista ganham botões para improvisar.

## Mesa de RPG

A tela **Mesa** junta o que se usa jogando. Tudo continua sendo nota comum, então o Obsidian abre igual e outro aparelho recebe pelo sync.

- **Dados.** Fórmulas no formato do Roll20 e do plugin Dice Roller: `1d20+5`, `2d20kh1` ou `1d20 vantagem`, `4d6dl1`, `3d6!` (explode), `2d6r1` (rola de novo os 1), `8d10>=7` (conta sucessos), `4dF`, `d%`, `(1d6+2)*2`, `6x 4d6dl1` (repete) e `# rótulo`. A bandeja mostra média, faixa, a distribuição e a chance de tirar um valor. Cada dado cai na bandeja no formato dele (d4 a d20) e assenta; o crítico solta faíscas douradas e a falha crítica treme e racha. O histórico fica no aparelho.
- **Nas notas.** `` `dice: 1d20+5` `` vira um botão de rolar, e `` `dice: [[Geradores#Clima]]` `` rola numa tabela. Numa ficha, a fórmula aceita `@for`, `@des`, `@prof` e `@nível`. No menu `/`, use *Rolagem de dados* ou *Tabela de rolagem*.
- **Campanhas** (`Campanhas/<nome>/`, `tipo: campanha`, `mundo: "[[Aerth]]"`, `sistema: 5e` ou `livre`). Os personagens e criaturas com números de jogo do mundo ligado entram na campanha. A tabela `## Rolagens` da nota da campanha vira atalhos na bandeja.
- **Fichas de jogo.** São propriedades da ficha do Mundo: `nível`, `pv`, `pv máx`, `ca`, `for`…`car`, `salvaguardas`, `perícias`, `especialidades` e `jogador`. Opcionalmente, as tabelas `## Ataques` (Ataque, Acerto, Dano) e `## Rolagens` (Rolagem, Fórmula) completam a ficha. Um clique rola testes, salvaguardas, perícias, ataques e dano (×2 no crítico), com vantagem ou desvantagem. Dano e cura gastam primeiro os PV temporários. A mesma ficha aparece na tela Mundos, e `criatura` é um tipo novo de ficha lá.
- **Ficha completa (5e 2024).** A ficha segue o modelo de papel de 2024 e se divide em abas: *Combate* (atributos com salvaguarda e perícias, armas e truques de dano), *Magias*, *Características* (de classe, traços de espécie, talentos), *Equipamento* (treinos, armadura vestida, sintonização, moedas, inventário) e *História* (aparência, história e personalidade, alinhamento, idiomas). No topo ficam espécie, classe, subclasse, antecedente, pronomes, nível e XP; embaixo, CA, PV, dados de vida, testes contra a morte, proficiência, iniciativa, deslocamento, tamanho, percepção passiva, inspiração heroica, exaustão e condições. Tudo é propriedade (`espécie`, `antecedente`, `subclasse`, `xp`, `armadura vestida`, `escudo`, `dados de vida gastos`, `espaços gastos`, `idiomas`, `sintonização`…) ou seção (`## Magias`, `## Talentos`, `## Aparência`…). As contas são automáticas: proficiência pelo nível, XP avisa quando dá para **subir de nível** (escolhe a classe, inclusive multiclasse como `Guerreiro 3 / Mago 2`, e soma os PV pela média ou rolando), PV máximo sugerido, CA pela armadura e escudo (sem `ca` na nota), deslocamento e tamanho pela espécie, CD e ataque mágico, espaços de magia por classe (completo, meio, terço, pacto e multiclasse), **Conjurar** gasta o menor espaço livre, dados de vida rolam e curam, testes contra a morte com 1 e 20 naturais, exaustão de 2024 nos d20 e os descansos curto e longo.
- **Retrato.** A propriedade `imagem` (ou `retrato`, `capa`) aceita `[[arquivo.png]]` ou um endereço. Ela aparece na ficha, nos cartões do grupo e nas fichas dos Mundos; clicar no retrato escolhe uma imagem do aparelho (vai para `Anexos/`). A imagem não vira ligação no grafo do mundo.
- **Bolsa de moedas.** Também são propriedades da ficha: `po`, `pp` (prata), `pc`, `pe` e `pl` (aceita `ouro`, `prata`, `gp`, `sp`...). Escreva `3 po 5 pp` e toque em *Ganhar* ou *Gastar*. O gasto sai das moedas escritas, se você as tem; senão a bolsa paga com troco, como na mesa (quebra uma moeda maior e devolve o resto em moedas menores, nunca em electro).
- **Inventário e cartas de item.** A tabela `## Inventário` (Item, Qtd, Peso, Notas e, quando algo está em uso, Estado) vira uma mochila: carga contra a capacidade (Força × 7,5 kg), valor total dos itens, busca, filtros (em uso, armas, proteção, consumíveis, mágicos) e duas visões, lista com miniaturas ou cartas. Itens comuns do SRD 2024 (armas com maestria, armaduras, escudo, equipamento de aventura, munição, poções) são reconhecidos pelo nome e já têm carta, peso e preço; o **📖 Catálogo** mostra todos e **Comprar** paga com as moedas da bolsa, com troco. Clicar num item abre as ações: **Equipar** uma arma cria a linha dela em `## Ataques` (Acuidade e distância escolhem o atributo, `+1` no nome soma no acerto e no dano), **Vestir** uma armadura ou **Empunhar** o escudo recalculam a CA, **Sintonizar** respeita o limite de 3, **Beber** uma poção rola a cura e soma nos PV, cargas têm − e +, e **Dar para** passa o item a outra ficha da campanha. **✦ Forjar item** cria um item único (nota em `Itens/`) com foto (clique, arraste ou cole), raridade, dano, CA, cargas, cura, propriedades e descrição, com a carta montando ao vivo; **Editar** reabre a mesma forja, e um item comum pode ser **personalizado** virando carta própria.
- **Combate.** O encontro é uma nota (`tipo: encontro`) com a tabela `## Combatentes`. Dá para adicionar o grupo inteiro ou criaturas em lote ("Goblin 1, 2, 3"), rolar a iniciativa de quem falta e passar turnos com N e B; inimigos com PV 0 são pulados. A tela também marca condições e registra o dano em `## Registro`. Quem tem ficha recebe o dano nela também. Em campanhas 5e, a barra de **dificuldade** soma o XP pelo `nd` das fichas dos inimigos (pelo link ou pelo nome: "Goblin 2" acha a ficha Goblin), aplica o multiplicador pela quantidade e pelo tamanho do grupo e compara com os limites dos níveis do grupo (regras do Livro do Mestre): trivial, fácil, médio, difícil ou mortal, mais o XP de cada um.
- **Tabelas de rolagem.** Qualquer tabela Markdown com um dado no cabeçalho (`d6`, `d20`, `d100`; faixas como `1-2`, `96-00`) é rolável. Numa nota com `tipo: tabela`, cada lista debaixo de um título também é. Num resultado, `{2d4}` rola dados e `{@Outra tabela}` rola outra tabela. *Geradores de exemplo* cria nomes, tavernas, jeito do NPC, ganchos, clima e tesouro.
- **Sessões.** *Nova sessão* cria `Sessão N` com o resumo da anterior e a deixa aberta: cada rolagem entra no `## Registro` dela, com a hora.

## Sorte

A tela **Sorte** junta as ferramentas de acaso do dia a dia. O sorteio usa o gerador criptográfico do aparelho (o mesmo dos dados da Mesa), então é justo de verdade.

- **Roleta.** Uma opção por linha (ou separadas por vírgula); `*2` no fim de uma opção dá o dobro de chance e uma fatia maior. Toque na roda ou aperte espaço para girar: o ponteiro estala a cada fatia e a roda freia até o resultado. *Tirar da roleta* remove a opção sorteada (para ir eliminando).
- **Sorteio.** *Nomes* tira um ou mais nomes sem repetir; *Times* divide a lista em times equilibrados; *Ordem* embaralha a lista (quem começa, ordem de apresentação); *Números* sorteia num intervalo, com ou sem repetição, e tem atalhos para Mega-Sena e Lotofácil. *Copiar* leva o resultado para a área de transferência.
- **Moeda.** Cara ou coroa com a moeda girando no ar, a contagem de cada lado, a sequência atual e as últimas jogadas. O comando *Cara ou coroa* da paleta entra na mesma contagem.
- **Bola 8.** Escreva a pergunta (ou não), sacuda, e uma das 20 respostas clássicas sobe do líquido. Ela nunca repete a resposta anterior.
- **Listas salvas.** *Salvar como lista* grava as opções na nota `Sorteios.md`, uma seção `## nome` por lista. A roleta e o sorteio escolhem dessas listas, e editar a nota no Obsidian vale na hora.
- **Histórico.** Os resultados recentes ficam na coluna da direita, só neste aparelho.

## Apresentações (Slides)

Uma apresentação é uma nota `.md` comum em `Apresentações/` (ou qualquer nota com `tipo: apresentação`). Cada linha com `---` separa um slide, o mesmo formato do plugin Slides do Obsidian:

```markdown
---
tipo: apresentação
transição: núcleo        # núcleo, deslizar, esmaecer ou nenhuma
---

# Título da capa
Subtítulo

---

## Assunto
- um ponto por linha

> [!note] Notas do apresentador
> só aparece para quem apresenta
```

O arranjo de cada slide sai do conteúdo: só um `#` vira capa, só um `##` vira divisória de seção, uma imagem sozinha ocupa o slide e imagem com texto divide em duas colunas. O texto encolhe até caber.

- **Da nota:** em *Exportar ▾ → Slides* (ou *Da nota…* na tela de slides), a nota vira uma apresentação nova: o título vira a capa, cada seção vira um slide e seções longas continuam no slide seguinte. A nota original não muda.
- **Apresentar:** *Apresentar* ou F5. Setas, espaço e clique avançam; Esc sai; **N** abre as notas do apresentador com cronômetro e o próximo slide; **B** apaga a tela; um número + Enter pula para o slide. No celular, arraste para o lado.
- **Importar:** `.pptx` e `.odp` (LibreOffice Impress) viram apresentação (títulos, listas, tabelas, imagens, código e notas). PDF vira uma apresentação com uma página por slide (`![[PDFs/aula.pdf#page=3]]`).
- **Exportar:** `.pptx` (PowerPoint, Google Slides) e `.odp` (Impress) com as notas do apresentador, PDF com o tema do app e PDF claro para imprimir. Ficam em `Exportados/`.

## Plugins

Um plugin é uma página HTML (um artefato do Claude serve) que roda isolada e só faz o que você permitir, em cada aparelho. Na tela **Plugins** dá para ligar, desligar, instalar um `.html` ou colar um artefato. Os instalados ficam em `Plugins/<id>.html` no cofre e chegam aos outros aparelhos pelo sync, desligados até você permitir lá também.

O primeiro plugin, que vem com o app, é o **Notícias**: lê feeds RSS, Atom e JSON Feed (basta colar o endereço do site), avisa quando chega notícia nova e salva um artigo como nota, com as imagens, em `Notícias/`. As fontes ficam na nota `Notícias/Fontes.md`.

O **Ficha em PDF** exporta as fichas de personagem do cofre (D&D 5e, as mesmas da Mesa) num PDF A4 bonito e fácil de ler: cabeçalho com retrato, nível e XP; CA, PV, dados de vida, iniciativa, deslocamento e testes contra a morte; os seis atributos com salvaguardas e perícias já somadas; treinos, idiomas e talentos; e depois, em cartões que correm de coluna em coluna, ataques (com `@for+@prof` já resolvido), habilidades com os usos, conjuração com espaços e magias, características, traços, inventário com carga e moedas, aparência, história e qualquer outra seção `##` da nota. Uma grade de anotações preenche o fim. A prévia acompanha a nota enquanto você edita; dá para escolher a cor da ficha e um retrato (guardado no aparelho, porque a janela do plugin não lê anexos). O PDF vai para a pasta de downloads e é gerado sem internet.

A API, as permissões e um exemplo de manifesto estão em [plugins.md](plugins.md).

## Quadros (mapas mentais, workflow e desenho)

Módulo **Quadros** na barra lateral. Cada quadro é um arquivo `.canvas` no formato JSON Canvas, o mesmo do Obsidian: caixas, notas, links, grupos e setas abrem lá também. O tipo do quadro e os traços de desenho vão no campo `x-tanden`, que o Obsidian ignora; se o Obsidian regravar o arquivo sem esse campo, o desenho continua no Tanden.

- **Mapa mental:** Tab cria um filho, Enter cria um irmão, as setas do teclado navegam e o mapa se organiza sozinho, dividido entre os dois lados. Cada galho da raiz ganha uma cor, e os netos herdam.
- **Workflow:** caixas ligadas por setas. Selecione uma caixa e arraste um dos pontos laterais até outra caixa, ou até o vazio para criar a próxima já ligada. Dois cliques numa seta dão um rótulo a ela.
- **Desenho:** caneta com pressão (mesa digitalizadora), linha, seta, retângulo, elipse e borracha. Com **Ajuste** ligado, um rabisco reto vira linha e um contorno fechado vira retângulo ou elipse. Shift trava ângulos e proporções; **Grade** (G) encaixa tudo em passos de 20.
- **Notas no quadro:** arraste uma nota da lista para o quadro, ou use **+ Nota**. Dois cliques abrem a nota. `[[links]]` dentro das caixas também abrem.
- Atalhos: V, T, P, L, A, R, O, E trocam de ferramenta; 1 a 6 colorem; Delete apaga; Ctrl+Z/Ctrl+Shift+Z; Ctrl+G agrupa; F enquadra tudo. Ctrl+roda aproxima, roda passeia. No celular, um dedo arrasta e dois aproximam; com caneta ativa, a palma da mão é ignorada.

O merge é por campo: um aparelho move a caixa enquanto outro muda o texto, e as duas mudanças ficam. Edições feitas no Obsidian entram por diferença de três vias. Estado em `.tanden/board/`.

### Quadros: renomear, apagar e conversas com as notas

- O **⋯** ao lado do nome do quadro renomeia, duplica, copia o link `[[ ]]`, transforma o quadro numa nota em tópicos e apaga (com cópia em `.trash/`). Apagar e renomear chegam aos outros aparelhos pelo sync, e um `.canvas` apagado no Obsidian também some aqui.
- Um link `[[Plano.canvas]]` numa nota abre aquele quadro. Imagens do cofre aparecem dentro dos cartões; dois cliques num PDF ou num link abrem no lugar certo.
- **Colar** no quadro: um endereço vira cartão de link, `[[Nota]]` vira cartão da nota e qualquer outro texto vira uma caixa.
- *Mapa mental da nota aberta* (paleta) e *Virar nota em tópicos* (⋯) fazem o caminho de ida e volta entre nota e mapa.

## Planilhas e gráficos

Cada planilha é um `.xlsx` comum no cofre (as novas vão para `Planilhas/`), então abre no Excel, no Google Sheets e no LibreOffice. Um `.xlsx` que já estiver na pasta aparece sozinho na lista e só é regravado quando você edita no Tanden.

- **Fórmulas** em português ou inglês (`=SOMA(A1:A3)` ou `=SUM(A1:A3)`), com `;` ou `,` entre argumentos e vírgula decimal (`=A1*0,8`). São 125 funções: matemática, estatística, lógica, texto, datas, PROCV/PROCX/ÍNDICE/CORRESP, SOMASE/CONT.SES e finanças (PGTO, VF, TAXA, TIR). O autocompletar mostra o que cada função faz e em qual argumento você está.
- **Digitação no padrão brasileiro:** `1.234,56`, `15%`, `R$ 10,50`, `14/10/2026` e `08:30` viram número com o formato certo.
- **Teclado:** setas, Ctrl+setas, Enter/Tab, F2, Ctrl+D/Ctrl+R (preencher), Ctrl+Z/Y, Ctrl+B/I, Ctrl+C/V (com fórmulas deslocadas, e colando tabelas do Sheets ou de sites). Com uma fórmula aberta, clicar ou usar as setas insere a referência.
- **Gráficos:** colunas, barras, linha, área, rosca e dispersão, a partir da seleção. Ficam guardados na planilha e acompanham os dados.
- **Importar/exportar:** `.xlsx`, `.ods` (LibreOffice Calc, com fórmulas, formatos e larguras), `.csv` (vírgula) e o `.csv` do Excel brasileiro (`;`). No app instalado, a exportação vai para `Exportados/` no cofre.

O merge segue o das notas, por célula: duas edições em células diferentes nunca conflitam, e numa mesma célula vence a última. Uma edição feita no Excel ou no Sheets entra no merge só com as células que mudaram lá. Os gráficos ainda não vão para dentro do `.xlsx`.

```
**/*.xlsx                               suas planilhas
.tanden/sheet/<planilha>/<aparelho>.bin histórico de edição de cada aparelho
```

## Cálculo, fórmulas e gráficos

Funciona em qualquer nota, e o Obsidian continua lendo tudo como texto (os blocos aparecem como código). O botão **∑ Inserir** da nota coloca cada tipo de bloco.

- **Blocos de cálculo** (```` ```calc ````): uma conta por linha, com o resultado à direita (clique copia). Vírgula decimal (`2,5`), milhar com ponto ou espaço (`1.234,56`), `;` entre argumentos, `Rótulo: conta`, variáveis (`L = 6 m`), funções (`f(x) = x^2 - 3x + 2`), `total` (soma desde o último título) e `ans`. As variáveis passam de um bloco para o próximo.
- **Dinheiro:** `preço = R$ 120` ou `120 reais`, e a conta segue normal. Os nomes em inglês (`solve`, `derive`, `integrate`) também valem.
- **Unidades:** `100 km/h em m/s`, `25 °C para °F`, `5 kN/m * (4 m)^2 / 8 em kN*m`, `12 V / 4 kΩ em mA`. Valem as do mathjs mais cv, kgf, tf, mca, rpm, ha, cal e Ah, e constantes curtas (`g0`, `c0`, `NA`, `kB`, `qe`, `Rgas`, `eps0`, `mu0`).
- **Funções em português:** `sen`, `cos`, `tg`, `arcsen`, `raiz`, `log` (base 10), `ln`, `arred`, `media`… Matrizes (`[1, 2; 3, 4]`, `det`, `inv`) e complexos (`raiz(-4)` dá `2i`).
- **Simbólico:** `derivada(f(x); x)`, `integral(x^2; x)` (inclusive por partes simples), `simplificar`, `expandir`, `taylor(sen(x); x; 0; 7)`. **Numérico:** `integral(f(x); x; 0; 2)` (aceita `inf`), `resolver(x^2 = 4; x)` (polinômios exatos, o resto por varredura), `limite(sen(x)/x; x; 0)`, `somatorio(k^2; k; 1; 10)`. `v(t) = derivada(s(t); t)` guarda a derivada como função.
- **Gráficos** (```` ```grafico ````): `y = sen(x)`, `Nome: f(x)`, paramétrica `(cos(t); sen(t))`, polar `r = 1 + cos(θ)`, `pontos: (1; 2) (3; 4)`, `x = 2`, e intervalos `x: 0..2pi`. Usam o que foi definido nas contas acima. Arrastar move, Ctrl+roda ou pinça aproxima, dois cliques voltam.
- **Fórmulas LaTeX:** `$E = mc^2$` no texto e `$$ … $$` em destaque, desenhadas com o KaTeX quando o cursor sai delas.
- **Aba Cálculo**, com três modos no topo:
  - **Folhas:** folhas em `Cálculo/` (notas com `tipo: cálculo`, onde toda linha é conta, sem precisar de bloco), um gráfico grande com as funções da folha mais uma curva livre, e uma cola de sintaxe que insere o exemplo com um clique.
  - **Calculadora:** uma conta por vez, com histórico (clique na conta para editar, no resultado para reaproveitar; `↑` volta nas anteriores) e prévia enquanto digita. Usa o mesmo motor das folhas, então valem unidades, variáveis e `ans`. O teclado científico tem trigonometria com **RAD/GRAU**, potências, fatorial e combinação, e as teclas de cálculo **Σ, Π, ∫ₐᵇ, ∫, d/dx, lim, resolver e taylor**, que entram como modelo com o cursor no lugar da expressão. Em GRAU, as linhas de derivada, integral e limite seguem em radianos.
  - **Financeira:** simulador de **investimento** (juros compostos, aporte mensal, taxa a.a. ou a.m., IR regressivo por aporte, gráfico e "quanto aportar para chegar na meta"); **financiamento** Price × SAC lado a lado, com gráfico das parcelas e a tabela de amortização; **valor do dinheiro** no estilo HP-12C (preencha quatro de n, i, VP, PGTO e VF e calcule o quinto; fim ou começo do período); **VPL, TIR e payback** de um fluxo de caixa; **taxas** (equivalente entre mês, trimestre, semestre e ano; real descontada a inflação; % do CDI com IR e equivalência de LCI/LCA; nominal → efetiva); e **porcentagem** (quanto é, que %, variação, aumento e desconto, valor antes do aumento). Tudo aceita `1.234,56`.
- **Funções financeiras nas folhas**, com os nomes do Excel e a mesma convenção de sinais (o que entra é positivo, o que sai é negativo): `pgto(1%; 12; 1000)`, `vp`, `vf`, `nper`, `taxa`, `vpl(10%; [-1000, 300, 400, 500])` (o primeiro fluxo é o do momento zero, como na HP-12C) e `tir(-1000; 300; 400; 500)`.

O mathjs e o KaTeX só carregam quando o editor abre, num pedaço separado.

## IA

A aba **IA** tem quatro painéis:

- **Claude** e **Gemini** (só no computador): abrem o Claude Code e o Gemini CLI num terminal dentro do app, já na pasta do cofre. Eles leem e escrevem as notas direto e usam as suas assinaturas, sem custo extra. Instale uma vez: `npm install -g @anthropic-ai/claude-code @google/gemini-cli`.
- **Ollama**: chat com a IA local da sua placa de vídeo, grátis e offline, com a nota aberta como contexto e um botão para inserir a resposta na nota. No celular, troque o endereço pelo IP do PC (ex.: `http://192.168.0.10:11434`) e, no PC, rode o Ollama com `OLLAMA_HOST=0.0.0.0`.
- **Terminal**: um terminal comum na pasta do cofre.

Quando qualquer programa muda uma nota (IA, Obsidian, terminal), o app percebe na hora e funde a mudança. Os terminais continuam abertos ao trocar de aba.

## Lembretes

A aba **Lembretes** tem uma captura rápida em português: escreva `amanhã 9h comprar pão`, `em 20 min tirar o bolo`, `sexta 18h30 jogar SF5`, `15/11 aniversário da Ana`, `toda segunda 7h30 academia` ou `dias úteis 7h ponto` e aperte Enter. O lembrete vai para a nota `Lembretes.md`.

Qualquer tarefa com data, em qualquer nota, também é um lembrete. O formato é o dos plugins Reminder e Tasks do Obsidian, então os dois apps entendem a mesma linha:

```markdown
- [ ] Comprar pão (@2026-10-15 09:00)
- [ ] Academia 🔁 every week on Monday, Thursday (@2026-10-19 07:30)
- [ ] Entregar relatório ⏫ 📅 2026-10-20        (sem hora, avisa às 9h)
```

Como os lembretes moram nas notas, eles sincronizam pelo mesmo merge do cofre: marcar como feito no celular tira o aviso do PC. Um lembrete repetido, ao ser marcado como feito, pula para a próxima vez. O aviso tem os botões **Feito** e **Adiar 10 min**.

- **Computador:** ao fechar a janela, o Tanden continua na bandeja e avisa na hora. Ele abre com o sistema, já minimizado (dá para desligar nas opções da aba Lembretes). Abrir o app de novo traz a janela de volta. Se o app ficou fechado, os lembretes das últimas 12 horas avisam assim que ele abre.
- **Android:** cada lembrete vai para o agendador do sistema, que avisa no horário exato mesmo com o app fechado e depois de reiniciar o celular. Na primeira vez, o Android pede permissão para notificações. Em celulares Xiaomi (MIUI/HyperOS), vale liberar *Inicialização automática* e tirar a restrição de bateria do Tanden nas configurações do app.
- **Web:** avisa enquanto a aba estiver aberta.

Cada aparelho lembra quais avisos já mostrou, então um lembrete não repete no mesmo aparelho. Adiar cria um aviso novo.

## Agenda

A aba **Agenda** junta numa grade só os eventos do cofre, o Google Agenda e as tarefas com prazo. Mês, semana, dia e lista (os próximos 30 dias).

**Eventos do cofre** são notas em `Agenda/`, no formato do plugin **Full Calendar** do Obsidian, então o mesmo evento aparece no calendário dele e sincroniza como qualquer nota:

```markdown
---
title: Dentista
allDay: false
date: 2026-11-10
startTime: "14:00"
endTime: "15:30"
local: Clínica Sorriso
---
Levar os exames.
```

Repetição: `type: recurring` com `daysOfWeek: [M, W]` (letras U M T W R F S, de domingo a sábado), ou `type: rrule` com `rrule: FREQ=MONTHLY;INTERVAL=1` para o resto. Apagar só um dia de um evento repetido grava `skipDates`. Chaves que o Tanden não conhece (tags, links, outros plugins) ficam como estão quando você edita pela agenda.

- **Escrever em português:** o campo do topo entende "sexta das 14h às 15h30 dentista @ clínica", "amanhã 9h reunião", "15/11 aniversário da Ana" (dia inteiro) e "toda segunda e quarta 7h academia". O que vem depois de "@" é o local.
- **Arrastar:** no computador, arraste um evento na semana/dia para mudar a hora (de 15 em 15 min) ou o dia; no mês, arraste entre dias. Eventos repetidos do cofre mudam pelo formulário (vale para todos os dias).
- **Clicar:** num horário vazio cria um evento ali; num dia vazio do mês, um evento de dia inteiro. No celular, tocar num dia do mês abre aquele dia.
- **Fontes:** os botões coloridos acima da grade escondem ou mostram Tanden, Tarefas e cada agenda do Google.
- **Atalhos:** N escreve um evento, E abre o formulário, T volta para hoje, ← e → andam, M/S/D/L trocam a visão.
- **Hoje:** a tela Hoje mostra os eventos do dia (com o que está acontecendo agora) e os de amanhã.

**Google Agenda** (app instalado, com a conta Google conectada): o Tanden lê as suas agendas para a janela na tela e grava direto lá quando você cria, muda, arrasta ou apaga um evento. No formulário, *Salvar em* escolhe entre o cofre e cada agenda do Google onde você pode escrever; trocar move o evento. Num evento repetido do Google, mudar ou apagar vale só para aquele dia ("Todos" apaga a série). Os eventos do Google não viram notas: o Google já sincroniza os seus aparelhos, e o Tanden só guarda uma cópia da última leitura neste aparelho para abrir rápido. Quem conectou o Google antes da agenda existir vê o aviso *Falta liberar a agenda* e entra de novo uma vez (veja [configuração](configuracao.md#google-agenda)).

## Flashcards

Os cartões moram nas notas, no formato do plugin Spaced Repetition do Obsidian, então os dois apps estudam os mesmos cartões com o mesmo agendamento. Toda nota com a tag `#flashcards` entra no estudo; `#flashcards/idiomas/inglês` cria o baralho "idiomas/inglês" (e um baralho inclui os de dentro).

- `Pergunta::Resposta` numa linha; `:::` estuda também ao contrário.
- Várias linhas: a pergunta, uma linha só com `?` (ou `??` para os dois sentidos) e a resposta, até a linha em branco.
- `==realce==` num parágrafo vira lacuna, uma por realce.
- Depois de responder, o cartão ganha `<!--SR:!2026-10-20,3,250-->` (próxima data, intervalo em dias, facilidade). No editor isso aparece como uma etiqueta 🃏 com a data; o texto volta com o cursor na linha.

A aba **Flashcards** mostra os baralhos, a previsão dos próximos 7 dias e um formulário de cartão novo. No estudo: espaço mostra a resposta, **1 a 4** respondem (Errei, Difícil, Bom, Fácil, com o próximo intervalo em cada botão) e **Ctrl+Z** desfaz. Errar traz o cartão de volta na mesma sessão. O agendamento é um SM-2 parecido com o do plugin. Só um lado de cada cartão (invertido ou lacuna) entra por dia, e isso vale em todos os aparelhos porque sai do próprio agendamento. O limite de novos por dia fica em cada aparelho. A tela Hoje e o número na barra mostram quantos cartões há para revisar.

## Arquivos, PDFs e páginas web

A aba **Arquivos** lista tudo no cofre que não é nota: PDFs, documentos, imagens, áudio e vídeo. **Importar** (ou arrastar para a janela) leva cada arquivo para o lugar dele:

- **PDF** vai para `PDFs/` e abre no leitor da Biblioteca.
- **Word (.docx), PowerPoint (.pptx), LibreOffice (.odt e .odp), ePub, HTML e texto** viram nota em `Importados/`, com títulos, listas, tabelas, links, notas de rodapé e imagens. O original e as imagens ficam em `Anexos/<título>/`, e a nota aponta para o original no campo `original`. Em apresentações, cada slide vira uma seção e as notas do apresentador viram um bloco `[!note]`. Os formatos antigos `.doc`, `.xls` e `.ppt` não entram: salve como `.docx`/`.xlsx`/`.pptx` ou `.odt`/`.ods`/`.odp` antes.
- **Planilhas** vão para a aba Planilhas, como antes.
- O resto fica em `Anexos/`.

**Leitor de PDF.** Abre livros grandes sem travar (só as páginas visíveis são desenhadas), com zoom (Ctrl + roda, pinça no celular), sumário, busca no documento inteiro e posição lembrada. As ferramentas são realçar, sublinhar, riscar, nota, caneta, retângulo e borracha, em seis cores, com Ctrl+Z. Selecionar um trecho mostra um menu para realçar, comentar ou copiar. As anotações não alteram o PDF: ficam em `.tanden/annot/` e sincronizam entre aparelhos pelo mesmo merge das notas. Em **Exportar** dá para gerar uma nota com todos os realces e comentários (com links `[[livro.pdf#page=12]]` que abrem o PDF na página), um PDF anotado que outros leitores entendem, ou uma nota com o texto do PDF.

**Biblioteca.** Todo PDF do cofre aparece na aba **Biblioteca** como um livro, com a capa (a primeira página), título e autor lidos do próprio PDF (editáveis). Cada livro tem status (*Quero ler*, *Lendo*, *Lido*, *Pausado*), nota de 1 a 5, favorito, estantes e etiquetas, e a biblioteca filtra por eles, busca por título, autor e estante, ordena por recentes, título, autor, adicionados ou progresso, e mostra em grade ou lista. *Continuar lendo* abre cada um na página onde parou, mesmo que você tenha parado no outro aparelho; a posição, os marcadores, o tempo de leitura e o resto sincronizam pelo mesmo merge das notas (`.tanden/library/`). A opção **no conteúdo** procura o texto dentro de todos os PDFs e abre o leitor no trecho achado (o texto é extraído uma vez e fica guardado neste aparelho). Mover ou renomear um PDF por fora (no Drive ou no gerenciador de arquivos) não perde nada: a biblioteca reconhece o arquivo e leva leitura e anotações junto. **Nota do livro** cria `Livros/<título>.md` com propriedades (autor, status, progresso, estantes, datas), marcadores e anotações, no formato que o Obsidian e os Bancos leem. A tela Hoje mostra os livros em leitura.

**No leitor**, o painel lateral tem **Páginas** (miniaturas), **Sumário**, **Marcadores** (Ctrl+D marca a página com o nome do capítulo) e **Anotações**. As cores da página alternam entre normal, sépia e noite, F liga a tela cheia, e ao chegar na última página o app pergunta se o livro terminou.

**Nas notas.** O botão **Anexar** coloca um arquivo ou uma página web na nota aberta; arrastar ou colar um arquivo no editor faz o mesmo. Imagens aparecem dentro da nota e PDFs viram um cartão. Ctrl+clique (Cmd no Mac) em um link abre a nota, o arquivo ou o site. **Exportar** gera um `.docx` (Word, Google Docs), um `.odt` (LibreOffice Writer, com os estilos dele: títulos, citações, listas e tabelas) ou uma página `.html`, com as imagens dentro.

**Páginas web.** Cole um endereço em **Página web** (botão Anexar, tela Hoje ou *Salvar página web* na paleta; um endereço copiado já vem preenchido). *Salvar como nota* guarda o texto do artigo e as imagens em `Web/`, com título, site, autor e data no topo, no mesmo formato do Obsidian Web Clipper, e `status: Para ler`, que coloca a página na lista *Para ler* da tela Hoje. *Só o link* coloca um cartão com título e resumo na nota aberta. Um link direto para um PDF ou imagem vira arquivo do cofre.

- **Tags, sua nota e destaques.** Antes de salvar dá para pôr tags, um comentário (vira um callout *Minha nota*) e trechos para destacar. Cada trecho é marcado `==assim==` no texto e listado numa seção **Destaques** no topo. Depois, marcar `==trechos==` à mão e rodar *Juntar destaques da nota* na paleta atualiza a seção.
- **Sem duplicar.** Salvar de novo uma página que já está no cofre (mesmo com `?utm_…`, `#seção` ou `www.` diferentes) não cria outra nota: os destaques e o comentário novos entram na que existe. *Salvar de novo* força uma cópia.
- **YouTube** vira nota com o player, o canal, a data e a descrição inteira, com os links clicáveis.
- **Modelos de recorte.** Uma nota em `Modelos/Recortes/` com `recorte-sites: [youtube.com]` (e, se quiser, `recorte-pasta: Vídeos`) vale para aquele site; `*` vale para todos. O resto do topo e o corpo viram a nota, com `{{title}}`, `{{url}}`, `{{site}}`, `{{author}}`, `{{published}}`, `{{description}}`, `{{image}}`, `{{content}}`, `{{comment}}`, `{{date}}` e `{{time}}`.
- **Recortador do navegador** (app do computador). Em *Página web → ✂ Recortar direto do navegador*, arraste o botão **✂ Tanden** para a barra de favoritos do Chrome, Firefox ou Edge. Numa página, clique nele: ela chega ao Tanden como está na tela (serve para páginas que pedem login). Com um trecho selecionado, ele vira destaque; clique de novo com outro trecho para juntar mais destaques na mesma nota. O app escuta só em `127.0.0.1:27183` e cada computador tem uma chave própria dentro do favorito, então outro site não consegue mandar nada.

Arquivos grandes sobem para o Drive em partes, e o sync só relê um arquivo quando ele muda.

## Aparência, movimento e sons

O botão de engrenagem no pé da barra lateral (ou **Ctrl+,**) abre *Aparência e sons*. Tudo vale na hora e fica salvo por aparelho.

- **Estilos:** mudam a cara inteira do app, não só a cor.
  - *Tanden* — o original: escuro, macio, com brilho.
  - *Aero* — PC dos anos 2000: aurora azul de papel de parede, barra lateral e barra de tarefas de vidro, a área de trabalho como janela branca, botões envernizados, seleção azul do Explorer e diálogos com moldura de vidro.
  - *Terminal* — fósforo verde (ou âmbar) com brilho, letra VT323, linhas de tubo CRT com a faixa que desce, nada arredondado, botões `[ ENTRE COLCHETES ]` em vídeo inverso, títulos como prompt `>` e a barra de estado do vim.
  - *Papel* — caderno: folha solta com sombra de recorte, bloco pautado com margem vermelha, títulos à mão (Caveat), contornos tortos de caneta, campos como linha de preencher, marca-texto, fita adesiva nos diálogos e avisos em post-it.
- **Peças avulsas:** escolher um estilo ajusta tudo de uma vez; depois cada peça muda sozinha (o painel avisa e oferece *desfazer ajustes*):
  - *Cores:* paletas prontas (Núcleo, Seth, Satsui, Hadou, Jade, Fósforo, Âmbar, Areia, Gelo, Vista, Caneta), o fundo, qualquer cor de destaque e o fundo **Livre**, com as 7 cores do fundo escolhidas à mão. No tema claro, o destaque escurece sozinho até ficar legível.
  - *Forma:* cantos (redondos, retos, à mão), bordas (finas, grossas), sombras (suaves, nenhuma, sólidas), brilho e vidro (painéis translúcidos e desfocados).
  - *Fundo da tela:* textura por cima de tudo (tubo CRT, grão, pauta, quadriculado), papel de parede (liso, aurora ou uma **imagem sua**, reduzida para caber no aparelho) e o véu, que cobre a imagem com a cor de fundo para o texto continuar legível.
  - *Texto:* letra do texto e letra dos títulos, separadas (Manrope, Sistema, Segoe, Serifada, Mono, Chakra, VT323, Máquina, À mão), e o tamanho da interface.
- Com suporte do sistema, a troca de tema se espalha em círculo a partir do clique.
- **O símbolo tanden** só se mexe com motivo: parado e alinhado é "tudo em dia"; gira enquanto há trabalho (mais rápido quando a IA pensa) e desacelera como motor até assentar; dá uma volta quando algo de outro aparelho é fundido; o anel acende quando um dado chega e fica vermelho quando o sync falha. Processos de menos de 150 ms não o movem.
- **Abertura:** as duas metades se encaixam quando o app liga, o símbolo gira enquanto o cofre abre de verdade e depois voa para a barra lateral.
- **Movimento:** Completo, Reduzido (transições curtas, giro lento) ou Parado (o estado aparece só em cor).
- **Sons:** sintetizados na hora, sem arquivos (no Linux, o WebKit toca áudio pelo GStreamer: `gst-plugins-good`). Três estilos (Cristal, Taiko, Circuito), volume e três grupos que ligam e desligam separados: Interface, Atividade e Avisos. Cada som tem limite de repetição e uma variação mínima de altura para não enjoar.

## Hoje: tarefas, projetos, hábitos e metas

A tela **Hoje** (primeira da barra) junta o dia num lugar só. Ela não tem formato próprio: lê os bancos do cofre e as tarefas das notas, e cada clique grava na nota de onde o dado veio, então tudo sincroniza e abre igual no Obsidian.

- **Montar meu sistema.** Na primeira vez, um botão cria em `Bancos/` o que faltar: Tarefas, Projetos, Hábitos, Metas e Diário (sem linhas de exemplo). Os bancos são reconhecidos pelas propriedades, não pelo nome: um banco com `prazo` e `status` é de tarefas, com `alvo` é de metas, com caixas e `data` é de hábitos, com `humor` é o diário.
- **Captura rápida** (tecla **N**): `amanhã revisar slides !`, `comprar café`, `sexta 18h30 jogar SF6`. Sem hora vira tarefa no banco (com prazo e prioridade; `!` é alta, `!!` é máxima); com hora vira lembrete com aviso.
- **Tarefas**: atrasadas, hoje, próximos 7 dias e sem data, juntando as do banco e as `- [ ]` com data de qualquer nota (formato do plugin Tasks). Marcar como feita troca o status e grava `concluída` (no banco) ou `✅ data` (na nota). **→** passa a tarefa para amanhã.
- **Hábitos**: os últimos 7 dias de cada hábito (cada caixa do banco é um hábito), clique para marcar qualquer dia e a sequência 🔥 ao lado.
- **Diário**: humor do dia com um clique e a nota de hoje (com o modelo do banco Diário).
- **Projetos ativos**: progresso pelas tarefas ligadas (`projeto: [[X]]`) mais as caixas `- [ ]` da nota do projeto, a próxima tarefa e quantas atrasaram.
- **Metas**: `alvo` e `atual` (o **+1** soma), ou a média dos projetos ligados (`meta: [[Y]]` no projeto).
- **Para ler**: as páginas da web salvas que ainda estão `Para ler`; ✓ marca como lida.
- **Revisão da semana**: gera `Revisões/2026-W42.md` com o que foi feito, o que atrasou, os próximos dias, a tabela dos hábitos, projetos, metas e espaço para pensar a semana seguinte.

Na paleta (**Ctrl+P**): *Nova tarefa*, *Revisão da semana*, *Montar sistema de vida*, *Salvar página web*, *Recortador do navegador* e *Juntar destaques da nota*.

## Saúde: água, pausas e treino

A aba **Saúde** cuida de três coisas: beber água, levantar da cadeira e treinar. Como o resto do Tanden, tudo mora em notas comuns, que sincronizam e abrem no Obsidian.

- **Água.** O botão **+ Copo** registra um copo (o tamanho é configurável; também há +150 e +500, e **desfazer**). O anel mostra quanto falta para a meta do dia e se você está atrás do ritmo, e as barras mostram os últimos 7 dias. Bater a meta marca o hábito *Água* do dia, se o banco de hábitos tiver essa caixa.
- **Pausas.** **Levantei** registra uma pausa. O aviso sugere um movimento rápido (alongar, 10 agachamentos, descansar os olhos).
- **Avisos inteligentes.** A água e a pausa avisam a cada intervalo, só dentro do horário e dos dias escolhidos. A contagem recomeça a cada copo ou pausa registrada, a água para de avisar quando a meta é batida, e dá para adiar ou silenciar só hoje. No aviso, **Bebi um copo** e **Levantei** registram sem abrir o app.
- **Por aparelho.** A configuração (intervalo, janela, dias, meta) vale para todos, mas cada aparelho escolhe se avisa. No celular, a pausa começa desligada, para não avisar em dobro com o PC. No Android, os avisos vão para o agendador do sistema e chegam com o app fechado; no computador, chegam com o Tanden na bandeja.
- **Planner de treino.** Você escolhe objetivo (massa, força, condicionamento, emagrecer, saúde), nível, dias da semana, tempo por treino, equipamento (academia, halteres, elásticos, barra fixa, ou só o peso do corpo) e o que poupar (joelho, lombar, ombro, punho). O Tanden monta a divisão da semana (corpo inteiro, superiores e inferiores, ou empurrar, puxar e pernas), escolhe os exercícios de uma biblioteca com mais de 70, define séries, faixas de repetição e descanso pelo objetivo e corta o que não cabe no tempo. **↻** troca um exercício por outro do mesmo tipo.
- **Treinar.** O próximo treino segue o rodízio (A → B → C), mesmo se você pulou um dia. Cada exercício já vem com a carga e as repetições sugeridas pela progressão dupla: fez o topo da faixa em todas as séries, a carga sobe; ficou abaixo da faixa duas vezes seguidas, ela baixa 10%; no peso do corpo, as repetições sobem até a hora de uma variação mais difícil. Toque em cada série para marcar (o número já vem preenchido e pode ser editado). O treino em andamento sobrevive a fechar o app. **Concluir** grava a sessão e marca o hábito *Exercício*.
- **Semana.** Dias treinados contra os planejados, séries por músculo nos últimos 7 dias comparadas com a faixa do objetivo, e os últimos treinos.
- **Lembrete de treino.** Com um horário no perfil, o plano cria em `Lembretes.md` a linha `Hora do treino 🏋` repetida nos dias de treino, que avisa como qualquer lembrete.

```
Saúde/Saúde.md                 configuração dos avisos (propriedades no topo)
Saúde/Registro/2026-10.md      - 2026-10-15 14:30 💧 250 ml   /   - 2026-10-15 15:10 🧍 pausa
Saúde/Treino.md                perfil no topo; plano em "## A · Corpo inteiro" + "- Leg press · 3×6-10 · 120s"
Saúde/Treinos/2026-10-15 A.md  - [x] Leg press: 10, 10, 9 @ 80 kg
```

O plano pode ser editado à mão (trocar exercício, séries, descanso), e o Tanden lê de novo. Na paleta: *Registrar um copo d'água*, *Registrar pausa* e *Treino de hoje*. O Hoje ganhou um cartão com a água, as pausas e o treino do dia.

## Alimentação: diário, cardápio e sugestões

A aba **Nutrição** acompanha o que você come, planeja a semana e sugere o que preparar. Os valores são estimativas para orientar o dia a dia e não substituem um nutricionista.

- **Diário.** Busque entre os alimentos brasileiros da tabela, escolha a porção e registre na refeição. O que você repete aparece para lançar com um toque, e dá para anotar algo fora da tabela sem números. O dia mostra calorias, proteína, carboidrato, gordura, fibra, água, dicas, os últimos 7 dias e a evolução do peso.
- **Metas.** Com base de cálculo, idade, altura, peso, atividade e objetivo, o Tanden estima o gasto pela fórmula de Mifflin-St Jeor. O déficit é limitado e a meta nunca fica abaixo do gasto em repouso. O cálculo vale só para adultos, e você pode definir uma meta própria.
- **Cardápio.** Monta os sete dias pela sua meta, respeitando restrições (vegetariano, vegano, sem lactose, sem glúten e outras) e o que você não come. **↻** sugere outro prato, o lápis aceita um prato escrito à mão e o círculo manda o prato para o diário.
- **Compras.** A lista nasce do cardápio, somada por setor do mercado e na quantidade de compra (arroz e feijão crus, por exemplo). Trocar um prato atualiza a lista e mantém o que já foi marcado.
- **Sugestões.** Indica pratos para a refeição pelo que ainda falta no dia, pelo que você comeu nos últimos dias, pelos ingredientes que há em casa e pelo tempo disponível.

```
Alimentação/Alimentação.md              perfil nas propriedades; "Meus alimentos" no corpo
Alimentação/Diário/2026-11.md           - 2026-11-18 12:30 🍽 Almoço · Arroz branco cozido · 120 g · 154 kcal · P 3 · C 34 · G 0,2 · F 1,9
Alimentação/Cardápios/2026-11-16.md     pratos da semana e lista de compras com caixas de seleção
```

Na paleta: *Diário alimentar de hoje*, *Cardápio da semana*, *Lista de compras da semana* e *O que comer agora*.

## Exercícios em casa

A aba **Treinos** guia treinos por tempo usando o peso do corpo e o que já existe em casa: cadeira, parede, sofá, degrau, toalha, mochila, garrafas e mesa. Ela complementa o planner de academia da aba Saúde, e os minutos das duas contam para a mesma meta semanal.

- **Treinar.** O Tanden sugere o treino do dia pelo que você fez nos últimos dias, ou monta um pelo foco (corpo inteiro, pernas, superior, abdômen, cardio, mobilidade, alongamento, pausa na cadeira) e pela duração. Cada treino tem aquecimento, circuito e volta à calma.
- **Treino guiado.** Boneco animado, contagem regressiva, passo a passo, aviso sonoro nos últimos segundos e na hora de trocar de lado. A tela fica acesa, dá para pausar, voltar e pular, e o treino pela metade pode ser retomado depois.
- **Exercícios.** Mais de 150 movimentos com instruções, cuidados e variações mais fáceis ou mais difíceis, com filtro por região e pelo que serve para você.
- **Ajustes.** Nível, objetos disponíveis, articulações a poupar (joelho, lombar, ombro, punho) e **sem saltos**, para não incomodar os vizinhos.
- **Programas.** Comece do zero, Força em casa, Cardio de apartamento, Coluna e postura, 14 dias de alongamento, Pernas de aço, Braços, peito e costas, Pausas de escritório e 28 dias seguidos. Cada treino completo avança um passo.
- **Sequência.** 🔥 dias seguidos com atividade (hoje ainda vazio não quebra; a chama avisa quando a sequência acaba hoje), recorde, semanas seguidas batendo a meta e o próximo marco (3, 7, 14, 21, 30… dias). Os marcos ganham comemoração.
- **Progresso.** Minutos da semana contra a meta, dias de força, a sequência, um calendário de calor das últimas 15 semanas, as últimas 8 semanas e o registro, onde também dá para anotar caminhada, bicicleta e outras atividades. Concluir um treino marca o hábito *Exercício*.
- **Conquistas.** 77 conquistas em seis grupos (constância, volume, variedade, programas, horários e segredos), com raridade, progresso das que faltam e a data em que cada uma saiu. Tudo é calculado do registro, então todos os aparelhos chegam às mesmas conquistas sem sincronizar nada a mais.

```
Exercícios/Exercícios.md          ajustes nas propriedades
Exercícios/Registro/2026-11.md    - 2026-11-18 07:30 🏃 Corpo inteiro · 20 min · 140 kcal · esforço 6 · foco corpo
```

Na paleta: *Treinar em casa*, *Começar o treino sugerido de hoje*, *Pausa ativa de 5 minutos na cadeira* e *Progresso dos exercícios*.

## Bancos de dados (estilo Notion)

Um banco é um bloco ` ```base ` dentro de uma nota, no formato das **Bases do Obsidian**: o Obsidian abre e mostra o mesmo banco. As linhas são notas comuns e as colunas são as propriedades do topo delas.

- **Views:** tabela, quadro (kanban, arrastar entre colunas), galeria com capa, lista, calendário (arrastar entre dias) e linha do tempo (arrastar e esticar barras). `table`, `cards` e `list` são do Obsidian; `board`, `calendar`, `gallery` e `timeline` são extensões do Tanden.
- **Propriedades tipadas:** texto, número (com formato de moeda e porcentagem), seleção, seleção múltipla, status, data, data e hora, caixa, relação, pessoa, link, e-mail, telefone, arquivos, criação e edição. Tipos, opções e cores ficam em `properties:` no bloco.
- **Filtros, ordenação, agrupamento e cálculos no rodapé** por view; filtros do banco valem para todas.
- **Fórmulas e rollups:** a linguagem das Bases (`if(prazo < today(), "atrasada", "")`, `prazo.format("DD/MM")`, `days(início, fim)`), e uma propriedade pedida de uma relação lê a nota ligada: `tarefas.horas.sum()`.
- **Modelos:** notas em `Modelos/` com `{{title}}`, `{{date}}`, `{{time}}`. Com `modelo-para: "[[Banco]]"` viram opção do botão Novo daquele banco. A tela Bancos tem uma galeria de bancos prontos (tarefas, projetos, metas, leituras, hábitos, reuniões, CRM, gastos, diário).
- **Páginas aninhadas:** as subpáginas de `X.md` moram em `X/`; a barra de notas mostra a árvore e o `+` de cada página cria uma subpágina.
- **Arquivar** marca `arquivado: true` na nota; ela some das views (opção "Mostrar arquivados").

## Grafo

Tela **Grafo**: cada nota é um nó e cada `[[link]]` uma ligação, como no Obsidian. Os quadros (`.canvas`) entram como anéis ligados às notas que mostram.

- **Global ou local** (em volta da nota aberta, de 1 a 4 ligações). O comando *Grafo local da nota aberta* abre direto.
- **Filtro** com a busca do Obsidian: `path:Projetos`, `tag:#estudo` (ou `#estudo`), `file:ata`, `-termo` exclui e aspas juntam palavras.
- **Grupos de cor**: cada grupo é uma busca e uma cor; o primeiro que bate pinta o nó.
- **Aparência**: tamanho dos nós, espessura das linhas e quando os nomes aparecem (sempre, de perto ou nunca).
- **▶ Animar**: o cofre cresce na tela, das notas mais antigas às mais novas.
- **▦ Para quadro**: o que está no grafo (até 150 itens) vira um quadro novo, com as notas como cartões ligados.
- **⇩ PNG**: salva a imagem do grafo em `Exportados/`.
- No cartão de uma nota, *Mapa mental* transforma os títulos e listas dela num mapa.

## Personalizar (Ctrl+,)

- **Aparência**: estilo (Tanden, Aero, Terminal, Papel), cores, forma, fundo da tela, letras do texto e dos títulos e tamanho da interface (Ctrl+= / Ctrl+- / Ctrl+0). Veja *Aparência, movimento e sons*.
- **Atalhos**: todo comando da paleta pode ganhar um ou mais atalhos. Clique no **+**, aperte as teclas e pronto; um atalho repetido sai do comando antigo. Fica salvo por aparelho.
- **Snippets CSS**: arquivos `.css` em `Snippets/` (vão junto no sync) ou em `.obsidian/snippets/`. Cada aparelho liga os que quiser, e o editor embutido mostra o resultado enquanto você digita. Um snippet pode trocar qualquer variável do tema (`--ember`, `--void`, `--f-body`…).
- **Modo foco** (Ctrl+Shift+Enter): esconde as barras; Esc volta.
- Há algo dormindo dentro do símbolo. Quem insistir no rodapé desta janela talvez consiga acordar.
- Comandos extras na paleta: nota aleatória, próximo tema, próximo estilo, *Estilo: Aero/Terminal/Papel/Tanden*, claro/escuro, ligar/desligar sons, rolar d20 e 2d6, cara ou coroa, roleta, sorteio, bola 8, e os da Mesa de RPG (rolar fórmula, combate, fichas, tabelas, nova sessão).
