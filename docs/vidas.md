# Simulação de vidas

Gente de verdade, mês a mês. Na tela **Mundos › Simulação › 👥 Vidas**, cada
pessoa tem genes, temperamento, traços, gostos, profissão e uma opinião sobre
cada uma das outras. Elas conversam, se apaixonam, traem, brigam, têm filhos,
envelhecem e morrem. Você assiste, empurra e, quando quiser, decide por elas.

A simulação de **facções** (ano a ano: guerras, alianças, territórios) continua
na mesma aba, em **⚑ Facções**.

## Começar

1. Crie algumas personagens no mundo (ou nenhuma: os figurantes bastam).
2. Em **Simulação › Vidas**, escolha **onde** (um lugar do mundo ou só um nome),
   **quando começa** e **quem vive lá**.
   - O ano inicial padrão é o "agora" do mundo: o campo `ano` da nota do mundo
     ou, sem ele, a última data da linha do tempo. A tela diz de onde veio.
     Cada passo é um mês.
3. Peça **figurantes** (0 a 60). Eles chegam em famílias (casais, filhos,
   viúvos), com as profissões que uma vila precisa (taberneiro, curandeira,
   guarda, sacerdote, ferreiro, mercador) e vizinhos que já se conhecem.
4. **Começar.** A simulação vira uma nota em `Mundos/<mundo>/Simulações/`.

Exemplo do jeito que dá vontade de jogar: 3 personagens suas (`Kael`, `Mira`,
`Tobias`) numa cidade, mais 10 aleatórios, e ver o que acontece.

### O que a ficha diz (e o que a simulação sorteia)

Tudo é opcional; o que faltar é sorteado de um jeito fixo (a mesma ficha vira
sempre a mesma pessoa):

| Campo da ficha | Vira |
|---|---|
| `sexo` (`feminino`, `masculino`, `não-binário`) | sexo e a gramática da crônica |
| `nascimento`, `idade`, `morte` | idade; uma `morte` no futuro é cumprida ("como estava escrito") |
| `traços` (também `virtude`, `defeito`, `personalidade`) | traços do catálogo, no masculino ou no feminino ("ciumenta" = ciumento) |
| `profissão` | profissão (renda, habilidade, riscos) |
| `local`, `mora em`, `cidade` → `[[Lugar]]` | onde vive |
| `cônjuge`, `pai`, `mãe` | família |
| `amigos`, `inimigos`, `rivais`, `amante`, `namorado(a)`, `noivo(a)` | laços iniciais (o caso com `amante` começa em segredo) |
| `olhos`, `cabelo` | os genes se ajustam para dar essa aparência |
| `orientação` (`hétero`, `homo`, `bi`, `assexual`) | por quem sente atração |
| `espécie` → `Elfo` ou `[[Elfo]]` | espécie (das regras ou de uma ficha `tipo: espécie`): vida, maioridade, corpo, cruzamentos |
| `gostos`, `dinheiro`, `casa` (sobrenome) | gostos, dinheiro, família |
| `for`, `int`, `car` (ficha de 5e) | pistas para combate, saber e lábia |

## O que é simulado

**Pessoas.** Cinco grandes da personalidade (abertura, conscienciosidade,
extroversão, amabilidade, neuroticismo), ~70 traços em quatro famílias
(personalidade em pares de opostos, adquiridos pela vida, de nascença, marcas do
corpo, reputação), gostos, cinco habilidades (combate, lábia, intriga, ofício,
saber), saúde, humor, estresse, dinheiro, uma **meta** (amor, família, riqueza,
fama, saber, paz, conquistar alguém, vingança) e estados que passam (luto,
doença, bebedeira, "vigiado" depois de ser pego traindo).

**Genética.** Olhos (castanho > verde > azul) e cabelo (escuro > loiro > ruivo)
seguem Mendel: dois pais de olhos castanhos podem ter um filho de olhos azuis.
Altura, força, intelecto, beleza, saúde, fertilidade e longevidade são
poligênicos, com mutação; os extremos viram traços (genial, belo, frágil,
gigante, estéril, longevo). Há uma doença recessiva ("sangue fraco") e
consanguinidade: filhos de parentes têm mais chance de herdá-la. Temperamento e
alguns traços (corajoso, devoto, sociável...) passam em parte de pai para filho.

**Relações.** Cada pessoa vê cada outra por cinco eixos: **afeto, atração,
confiança, respeito, intimidade**, mais **memórias** ("me traiu", "me ajudou
quando precisei") que pesam na opinião e apagam com o tempo. A opinião junta
tudo isso com a afinidade de traços e gostos e o parentesco. Vínculos: namoro,
noivado, casamento, caso, amizade, rivalidade, inimizade, ex. Segredos (casos,
paternidade, roubos, assassinatos) têm uma lista de quem sabe; com gente
demais sabendo, viram escândalo.

**O mês.** Cada pessoa tem algumas "vezes" (mais se é sociável, menos se é
tímida, mais numa festa), escolhe com quem cruzar no lugar onde está (puxada por
intimidade, vínculos, atração, rancor) e o que fazer:

- social: conversar (e descobrir gostos em comum), fazer algo juntos, elogiar,
  presentear, ajudar, abrir o coração, fofocar, insultar, discutir, fazer as
  pazes, ensinar, brincar, cuidar dos filhos;
- romance (só entre adultos, nunca família próxima): flertar, pedir em namoro,
  passar a noite juntos, pedir em casamento, seduzir alguém comprometido,
  encontros às escondidas, terminar, pedir o divórcio;
- conflito: brigar, desafiar para um duelo, ameaçar, roubar, tramar um
  assassinato;
- sozinho: trabalhar dobrado, treinar, estudar, rezar, beber, viajar.

O peso de cada uma vem da relação, dos traços (um luxurioso flerta o dobro, um
casto quase nunca), da meta, do humor e dos ajustes do mundo.

**Adultério com atrito.** Um caso começa em segredo. Todo mês o par traído pode
descobrir (desconfiados descobrem mais, ingênuos menos; a intriga ajuda; quanto
mais longo o caso, mais fácil), alguém pode ver os dois juntos, a fofoca pode
chegar. A descoberta deixa memórias pesadas, derruba a confiança e provoca uma
reação pelos traços: perdoar, confrontar aos gritos (a vizinhança escuta), pedir
o divórcio ou ir atrás do amante. Filhos de casos nascem com o pai "oficial"
errado; a genética pode entregar (olhos que não puxaram a ninguém).

**Vida e morte.** Gravidez de nove meses, parto com risco (menor com uma
curandeira por perto), gêmeos, bebês que herdam nome de avô ("Kael II"),
maioridade aos 16 (a personalidade se firma e vem a profissão), doenças, pestes,
acidentes de trabalho, velhice, luto, herança, órfãos acolhidos por quem gosta
deles. Viagens seguem as `rotas` entre lugares (ou a distância no mapa), com
bandidos na estrada.

**Evoluções.** A experiência vira traço: vitórias fazem o brigão, lutas o
veterano, traições o desconfiado, perdas o amargurado, bebedeira o alcoólatra,
anos de estudo o sábio. Estresse demais vira crise (bebida, fé, explosões,
pesadelos).

## Sua mão no destino

No painel de cada pessoa (clique no nome):

- **✋ Agir**: mande fazer qualquer interação com alguém (flertar, seduzir,
  brigar, pedir em casamento...), com a opção de **garantir que dê certo**.
- **💬 Sussurrar**: paixão, simpatia, raiva, desconfiança, admiração ou inveja
  por alguém. Muda o que a pessoa sente; o que ela faz com isso é com ela.
- **⚖ Relação**: defina afeto, atração, confiança, respeito ou intimidade.
- **✎ Vida**: dê uma meta, mude de cidade, dê dinheiro, cure, mate.
- Traços: tire com ×, dê com **+ traço**.
- **🎮 Conduzir**: a pessoa para de decidir sozinha romance e brigas, e tudo o
  que pedirem a ela (namoro, casamento, sedução, duelo) e as traições que ela
  descobrir viram **decisões suas**: a simulação para e espera.
- **🛡 Proteger**: não morre por acaso.

Em **Mundo e ajustes**: festas, pestes, fome, guerra (quem sabe lutar vai para o
front) e fartura num lugar, e os ajustes do mundo (romance, violência,
fertilidade, mortalidade, drama, vida social).

Na barra de cima: **▶ 1 mês**, **1 ano**, **10 anos** e **⏩ até algo
importante** (para no primeiro nascimento, morte, casamento ou traição
descoberta de alguém com ficha ou conduzido por você).

## Ver

- **Crônica**: tudo o que aconteceu, por ano, com filtros (romance, família,
  conflito, social, vida, morte, mundo, regras, você), "só o notável" e
  segredos (🤫, com fundo listrado: só você sabe).
- **Teia**: o grafo de quem está com quem (casamentos, casos, amizades,
  rivalidades, filhos).
- **Números**: população por ano, nascimentos, mortes, casamentos, casais,
  crianças, casos em andamento, profissões.

## Guardar

A nota da simulação (`tipo: simulação`) guarda o elenco do primeiro mês, a
semente e as suas intervenções, um item por linha. Ao abrir, a história é
refeita igual. (Ela não guarda a história inteira de propósito: mudaria a cada
mês e incharia o histórico de sincronização.)

- Se as **regras do mundo** mudarem depois, a história é refeita com as regras
  novas e a tela avisa.
- **💾 Gravar nas fichas** grava o estado de agora: cria fichas para quem nasceu
  ou foi gerado e atualiza as que existem (status, morte, local, profissão,
  traços, gostos, família, laços, aparência, personalidade, habilidades,
  genoma) e conta a vida na seção `## Registro`. Uma ficha gravada e relida
  vira a mesma pessoa.
- **📜 Salvar crônica** grava a crônica como nota.

## Criar conteúdo (o construtor)

Na aba **Regras**, o **construtor do mundo** monta por partes, sem código:

- **🤝 Interação**: entre duas pessoas, de uma pessoa só, ou quando algo
  acontece (casamento, traição descoberta, nascimento...). Condições por
  qualquer valor ("ódio por b maior que 50", "sanidade menor que 20", "força
  pelo menos 60", "é Elfo", "tem o traço ciumento"...), chance por ano,
  efeitos (mudar valores da pessoa ou da relação, traços, namorar, casar,
  caso, engravidar, lutar, ferir, matar, lembrar, disparar um evento) e a
  frase da crônica.
- **🧩 Trama em etapas**: uma interação que dura meses. Cada etapa tem uma
  espera, uma condição para seguir (senão falha, tenta de novo ou volta) e o
  que acontece; mais o que acontece no fim e se falhar.
- **✦ Traço**: nome nos dois gêneros, tipo, oposto, herança, o que muda na
  vontade de cada interação, o que pensa de quem tem outros traços, humor,
  estresse e quando surge sozinho.
- **📏 Atributo**: um número que todo mundo tem (sanidade, fé, honra,
  envergadura das asas), com faixa, média, variação, herança e mudança por ano.
- **🧬 Espécie / criatura**: vida, maioridade, fertilidade, gestação, altura,
  ajustes de corpo e atributos, traços de nascença, com quem tem filhos (e de
  que espécie nascem) e quantos figurantes são dela.
- **⚒ Profissão**: renda, habilidade, prestígio, risco e para quem.

Ele mostra o código que vai escrever e confere os erros antes de gravar. As
**receitas prontas** (Conspiração, Elfos e meio-elfos, Lobos na floresta,
Sanidade e loucura, Serenata, Vendeta de família, Casamento arranjado,
Bruxaria, Herança disputada, Febre que pega, Rito de passagem, Alquimista,
Ciúme doentio...) entram com um clique.

Tudo vira um bloco ` ```regras ` comum; a referência completa (inclusive os
campos, funções e eventos da simulação de vidas) está em [regras.md](regras.md).

## Escala: o que dá e o que vem

O motor simula cada pessoa em detalhe, mês a mês. Hoje isso roda bem com
algumas centenas de pessoas: num computador comum, 60 pessoas andam 10 anos em
~0,6 s, 200 em ~2,3 s, 500 em ~8 s. Para mundos do tamanho de um CK3 (milhares
de personagens, várias civilizações) o caminho não é simular todo mundo assim,
e sim **dois níveis de detalhe**, como fazem Dwarf Fortress e o próprio CK3:

1. **Pessoas notáveis** (fichas, nobres, quem você conduz, quem está perto da
   história) no motor de hoje, com tudo.
2. **Populações** por lugar e espécie: números (nascimentos, mortes, cultura,
   fé, riqueza, exércitos) que andam por ano, baratos, ligados às facções.
   Gente "sobe" da população quando vira importante (um herói, um
   conspirador) e "desce" quando sai de cena.

Isso está planejado, não feito: as espécies, atributos e tramas desta versão
já foram desenhados para servir aos dois níveis.
