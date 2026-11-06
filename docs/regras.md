# Regras do mundo

Uma linguagem pequena, em português, para dar comportamento ao mundo: tipos
novos de ficha, campos calculados, botões nas fichas, eventos, interações entre
personagens, traços, profissões e acontecimentos que surgem sozinhos na
**Simulação** (de facções e de [vidas](vidas.md)).

As regras moram em blocos ` ```regras ` em qualquer nota do mundo (dentro de
`Mundos/<mundo>/` ou com `mundo: <mundo>`). O Obsidian mostra o bloco como
código comum. A aba **Regras** da tela Mundos mostra o que está declarado, os
erros (com nota e linha) e um console para testar. **Começar com um exemplo**
cria `Regras/Regras.md` e o banco `Regras/Textos.md`.

Nada muda nas notas sem você pedir: os botões das fichas gravam na hora (e
deixam uma linha na seção `## Registro`), e a Simulação mostra o que mudou com
um botão **Aplicar às fichas**.

> Por que uma linguagem e não JavaScript? As notas chegam pelo sync. Código
> arbitrário numa nota rodaria no seu app vindo de qualquer lugar. A linguagem
> só lê e muda fichas do mundo, não acessa rede nem arquivos, para sozinha em
> laços sem fim e repete o mesmo resultado com a mesma semente.

## Exemplo

```regras
tipo relíquia "Relíquia" "Relíquias":
  símbolo ✶
  campo dono
  campo valor = 10

calcular idade em personagem = ano - nascimento

ação "Treinar" em personagem:
  habilidade += 1
  crônica "{personagem} treina até a exaustão."

interação "Cobiça" entre ladrão em personagem, vítima em personagem onde vítima.tesouro existe e ladrão.tesouro não existe:
  atração = ladrão.ambição + vítima.tesouro.valor / 10
  chance = 15%
  seja coisa = vítima.tesouro
  coisa.dono = ladrão
  ladrão.tesouro = coisa
  vítima.tesouro = vazio
  liga vítima, "inimigos", ladrão
  crônica tabela("Roubos")
  disparar roubo(ladrão, vítima, coisa)

quando roubo(ladrão, vítima, coisa):
  vítima.rancor += 2
  se vítima.rancor pelo menos 4:
    disparar vingança(vítima, ladrão)
```

## Declarações (no começo da linha)

| Declaração | O que faz |
|---|---|
| `tipo navio "Navio" "Navios":` | Tipo novo de ficha. Dentro: `campo nome`, `campo velas = 2` (valor inicial), `extra carga` (sugerido como botão), `seção "Viagens"`, `símbolo ⚓`, `cor #6fc3c9`. |
| `grupo nobres = personagem onde título existe` | Conjunto que se atualiza sozinho. Vale onde um tipo vale: `em nobres`, `contar(nobres)`. |
| `calcular idade em personagem = ano - nascimento` | Campo calculado, mostrado na ficha com ƒ. Não grava. |
| `ação "Coroar" em personagem onde título não existe:` | Botão na ficha (só onde a condição vale). |
| `quando ano:` / `quando ano em facção onde poder < 3:` | Roda a cada ano da simulação (com `em`, uma vez por ficha do tipo). |
| `quando batalha(vencedor, perdedor):` | Reage a um evento. Da simulação: `inicio`, `batalha`, `conquista(vencedor, perdedor, lugar)`, `guerra`, `alianca`, `traicao(traidor, vítima)`, `paz`, `crise`, `sucessao`, `queda(caída, vencedora)`, `praga`, `descoberta`, `heroi`, `prosperidade`. Ou um seu, chamado com `disparar`. |
| `interação "Nome" entre a em X, b em Y onde ...:` | A cada ano, cada `a` escolhe um `b`, sorteado com peso pela `atração`, e o efeito acontece com a `chance`. Dentro, antes do efeito: `atração = expressão` (padrão 1; zero ou menos = não se atrai) e `chance = 15%` (padrão 10%). |
| `interação "Visões" de p em personagem onde fé > 8:` | Acontecimento ocasional de uma ficha só. |
| `seja limite = 7` | Constante do mundo. |
| `traço "Nome":`, `profissão "Nome":`, `gosto "Nome"` | Catálogo da simulação de vidas (ver abaixo). |
| `atributo "Sanidade":`, `espécie "Elfo":`, `criatura "Lobo":` | Valores numéricos das pessoas, espécies e criaturas (ver abaixo). |
| `item "Espada de Aurora":`, `evento "Lua de Sangue":` | Itens (comuns ou únicos) e eventos do mundo com duração (ver abaixo). |
| `trama "Nome" entre a em X, b em Y onde ...:` | Interação em **etapas** que dura meses (ver [Tramas](#tramas-em-etapas)). |

## Comandos (dentro dos blocos, recuados)

| Comando | Exemplo |
|---|---|
| mudar campo | `p.ouro += 10`, `p.status = "morto"`, `x.inimigos -= y` (tira da lista). Sem o `p.`, muda a ficha do bloco (`habilidade += 1` numa ação). Numa lista, muda todas: `[p em nobres].imposto += 1`. |
| variável | `seja alvo = maior(inimigos, "poder")` |
| condição | `se ...:` / `senão se ...:` / `senão:` |
| repetição | `para cada p em personagem onde p.fé > 5:` (`parar` sai do laço) |
| crônica | `crônica "{p} encontra {q}."`: entra na crônica da simulação ou no `## Registro` da ficha. `{p}` vira `[[link]]`. |
| aviso | `avisar "..."`: mensagem na tela (botões). |
| evento | `disparar vingança(vítima, ladrão)` |
| ação | `convocar "Treinar" em p` |
| ligações | `liga a, "aliados", b` / `desliga a, "aliados", b` |
| facções | `guerra a, b` / `aliança a, b` / `paz a, b` (na simulação) |

## Expressões

- **Campos**: `p.ambição`, `p.afiliação.líder.nome` (um `[[link]]` vira a ficha ligada). Campo com espaço: `p.expectativa_de_vida` ou `p["expectativa de vida"]`. Também: `.nome`, `.tipo`, e numa lista `.tamanho`.
- **Valores**: números (`3`, `2.5`, `20%`), textos (`"..."` com `{expr}` dentro), `sim`/`verdadeiro`, `falso`, `vazio`, listas `[a, b]`.
- **Listas filtradas**: `[p em personagem onde p.espécie = "Elfo"]`. `personagem` sozinho é a lista de todas as personagens.
- **Comparação**: `=` (ou `==`), `!=`, `<`, `>`, `maior que`, `menor que`, `pelo menos`, `no máximo`, `diferente de`, `tem`, `não tem`, `existe`, `não existe`, `é facção`, `não é lugar`.
- **Lógica**: `e`, `ou`, `não`. Conta: `+ - * /`, `mod`.
- Acento e maiúsculas não importam nos nomes (`ambição` = `ambicao`). O `é` com acento compara tipo; sem acento, `e` é o "e" lógico.

## Funções

| Função | O que devolve |
|---|---|
| `chance(20%)` | sim, 20% das vezes |
| `dado("2d6+1")` | rolagem (mesmo formato da Mesa) |
| `entre(1, 10)`, `sortear(lista)` | número ou item sorteado |
| `tabela("Encontros")` | texto sorteado de um banco (abaixo), com `{a.nome}` preenchido |
| `contar(lista)`, `soma(lista, "campo")`, `média(lista, "campo")` | números |
| `maior(lista, "campo")`, `menor(...)`, `primeiro(lista)`, `último(lista)` | a ficha ou o item |
| `quem("afiliação", f)` | fichas que apontam para `f` por esse campo (os membros) |
| `ficha("Kael")` | a ficha pelo nome ou apelido |
| `distância(a, b)` | distância em % no mapa (as duas precisam ter marcador) |
| `min`, `max`, `arred(x, casas)`, `abs`, `piso`, `teto`, `limitar(x, mín, máx)` | números |
| `existe(x)`, `nome(x)`, `texto(x)`, `número(x)` | conversões |

Variáveis prontas: `ano` (o ano da simulação; fora dela, o `ano` da nota do
mundo ou a última data da linha do tempo) e `mundo`. Na simulação,
`facção.poder`, `riqueza` e `estabilidade` são os da simulação, na escala 1 a 10
das fichas.

## Texto com variação

Em qualquer texto entre aspas (crônica, aviso, descrição) e nos bancos de texto:

| Escreva | Sai |
|---|---|
| `{a}`, `{a.nome}`, `{dado("1d6")}` | o valor |
| `{rico\|abastado\|cheio da grana}` | uma das opções, sorteada (cada uma pode ter `{a}` dentro: `{{a} ri\|{a} chora}`) |
| `{a:cansado/cansada}` | a forma do gênero de quem é `a` (masculino/feminino; uma terceira forma vale para quem é neutro: `{a:o/a/e}`) |

```regras
quando mês em personagem onde personagem.estresse > 80:
  crônica "{personagem} anda {nervos|irritad{personagem:o/a}|à flor da pele} e {ninguém ousa falar com {personagem:ele/ela}|a vizinhança evita a casa}."
```

## Bancos de texto

Qualquer nota com `tipo: tabela` vira banco: cada lista debaixo de um título é
sorteada com chance igual por `tabela("Título")`. Tabelas com dado no cabeçalho
(`| d6 | Resultado |`) funcionam em qualquer nota. Dentro do texto:

- `{viajante}`, `{ladrão.nome}`, `{coisa}`: variáveis da regra que sorteou;
- `{1d4+1}`: dados;
- `{@Estranhos}`: sorteia em outro banco.

```markdown
---
tipo: tabela
---
## Encontros
- {viajante} cruza com um mercador que vende mapas de lugares que não existem.
- Uma tempestade obriga {viajante} a dividir abrigo com {@Estranhos}.
```

Notas `tipo: tabela` dentro da pasta do mundo não viram fichas.

## Na simulação de vidas

As mesmas regras rodam na [simulação de vidas](vidas.md), mês a mês, com as
pessoas da simulação no lugar das fichas de personagem (inclusive figurantes e
quem nasceu lá). `personagem` é quem está vivo.

- **Interações** acontecem todo mês, só entre quem está no mesmo lugar; a
  `chance` continua sendo **por ano** (15% ao ano ≈ 1,3% ao mês).
- `quando mês:` roda todo mês; `quando ano:` em janeiro.

### Declarações novas

```regras
traço "Sonâmbulo" "Sonâmbula":
  descrição "Anda dormindo."
  oposto "insone"
  herdável 25%
  categoria personalidade      # ou adquirido, congenito, marca, reputacao
  peso flertar -50%            # muda a vontade de uma interação (+50%, -30%, * 2)
  afinidade "devoto" -10       # opinião sobre quem tem outro traço ("" = o mesmo)
  humor -5
  estresse +5
  surge onde isto.idade > 30 e isto.estresse > 70
  chance 20%                   # por ano, quando a condição vale

profissão "Alquimista" "Alquimista":
  renda 12                     # moedas por mês
  habilidade saber             # combate, lábia, intriga, ofício ou saber
  status 3                     # prestígio, 0 a 5
  risco 1%                     # acidente por mês
  viaja                        # vive na estrada (como mercadores e bardos)
  requer isto.saber pelo menos 6

gosto "Falcoaria"
gostos "Xadrez", "Ópera"
```

### Atributos, espécies e criaturas

```regras
atributo "Sanidade":
  faixa 0 a 100              # ou numa linha só: atributo "Fé" 0 a 10
  média 70                   # ao nascer
  desvio 12                  # 2 em cada 3 nascem entre 58 e 82
  herdável 40%               # quanto vem da média dos pais
  categoria mental           # físico, mental, social... (só para mostrar)
  por ano -1                 # muda sozinho todo janeiro
  descrição "O quanto ainda se agarra à realidade."

espécie "Elfo" "Elfos":
  vida 700                   # expectativa de vida em anos
  maioridade 100             # adulto aos 100 (sem isto, proporcional à vida)
  fertilidade 30%
  gestação 12 meses
  altura 185                 # cm, em média
  beleza +15                 # força, agilidade, intelecto, beleza, fertilidade
  sanidade +10               # ou qualquer atributo declarado
  traços "longevo"           # de nascença, todo elfo tem
  cruza com "Humano" gera "Meio-elfo"
  frequência 15%             # dos figurantes gerados

criatura "Lobo" "Lobos":     # = espécie com "criatura"
  vida 13
  maioridade 2
  gestação 2 meses
  frequência 8%
```

- Todo mundo nasce com um valor de cada atributo (sorteado de um jeito fixo por pessoa, então acrescentar um atributo não muda o resto da história). Leia e mude como qualquer campo: `p.sanidade < 20`, `p.sanidade -= 5`. O valor fica sempre dentro da faixa.
- Quem não tem espécie escrita é **humano**: uma `espécie "Humano"` com ajustes vale para essa gente, e `cruza com "Humano"` funciona.
- A espécie da ficha vem de `espécie: Elfo` ou `espécie: "[[Elfo]]"`. Fichas `tipo: espécie`/`criatura` também contam (`expectativa de vida`, `maioridade`, `fertilidade`, `gestação`, `altura`, `cruza com`, `frequência`); o que a regra disser vale por cima.
- Espécies diferentes só têm filhos com `cruza com`; os filhos são da espécie do `gera` (ou da mãe).
- **Criaturas** não conversam, não namoram gente, não trabalham e não têm profissão. Com gente de outra espécie, só conflito (as suas regras dizem como atacam: veja a receita *Lobos na floresta*). Entre si, vivem, brigam e se reproduzem.
- Nos figurantes, famílias inteiras sorteiam uma espécie com `frequência`, com as idades na escala dela (um elfo adulto tem mais de 100 anos); criaturas entram soltas.
- Campos: `p.espécie` (nome) e `p.criatura` (sim/não). Função: `espécie(p)`.

- Espécies podem ter traços **possíveis**: `pode ter "irascivel" 40%, "belo" 10%` (cada um sorteia ao nascer).
- Atributo de uma espécie só: `só para "Dragão", "Wyvern"` dentro de `atributo`.
- Traços mexem em números: `ajuste força +10`, `ajuste sanidade -5` dentro de `traço`.

### Itens

```regras
item "Anel do Rei Morto":
  único                      # só existe um (fichas tipo: item já são únicas)
  tipo joia
  raridade lendária          # lendária/única também deixam único
  valor 800
  cobiçado                   # ladrões vão atrás
  descrição "Frio ao toque, quente na ganância."
  dono "Kael"                # com quem começa (ou: em "Pedravale", largado lá)
  lábia +5                   # ajustes enquanto tem: habilidades, força, beleza, atributos...
  por mês humor -2           # muda todo mês enquanto tem (maldição)
  traços "ganancioso"        # ganha enquanto tem; perde junto com o item
  ao ganhar:
    crônica "{dono} põe o anel no dedo."
  ao perder:
    dono.humor += 20
  todo mês:
    se chance(5%):
      crônica "{dono} ouve sussurros vindos do anel."
```

- Dentro dos blocos, `dono` é quem tem e `item` é o nome; em `ao ganhar`, `como` diz de onde veio (`heranca`, `roubo`, `achou`, `regra`, `voce`).
- **Fichas `tipo: item`** viram itens únicos: `dono: "[[Kael]]"`, `valor`, `raridade`, `categoria`, `ajustes: "combate +5, sanidade -10"`, `concede: corajoso`, `por mês: "humor -1"`, `local: "[[Pedravale]]"`, `cobiçado: sim` (`único: não` para um item comum).
- Na simulação: quem morre deixa os itens para o filho adulto mais velho (senão o cônjuge, senão outro herdeiro); sem ninguém, o item fica largado onde a pessoa estava. Quem passa por um lugar pode **achar** o que está largado (curiosos acham mais). Ladrões preferem quem carrega coisas valiosas e às vezes levam o item. Um item único sem dono começa largado no lugar da simulação.
- Funções: `dar_item(p, "Anel")`, `tirar_item(p, "Anel")` (fica largado ali), `destruir_item("Anel")`, `tem_item(p, "Anel")`, `dono("Anel")`. Campo `p.itens` (nomes). Eventos: `quando item_ganho(p, nome, como)`, `item_perdido(p, nome, como)`.
- A aba **Relíquias** da simulação mostra cada item único, com quem está e por quem passou.

### Eventos do mundo

```regras
evento "Lua de Sangue":
  chance 5%                  # por ano; 0 (ou sem chance) = só à mão
  dura 2 meses
  descrição "o céu fica vermelho"
  global                     # no mundo todo (sem isto: num lugar sorteado entre os que têm gente)
  onde lugar.perigos existe  # só começa onde isto vale (`lugar`)
  peso brigar * 3            # enquanto dura, muda a vontade das interações
  ao começar:
    crônica "Um uivo corta {lugar}."
  todo mês:                  # para cada pessoa no lugar: `personagem`
    personagem.medo += 1
  ao acabar:
    crônica "A lua volta a ser branca."
```

Os eventos declarados aparecem como botões em **Mundo e ajustes**. Nas regras: `começar_evento("Lua de Sangue", lugar)`, `evento_ativo("Lua de Sangue")`, e `quando lua_de_sangue(lugar):` reage ao começo.

### Povos (etnias)

Um povo dentro de uma espécie: aparência, nomes, traços, gostos e o que pensa
dos outros povos. Fichas `tipo: cultura` também viram povos (`espécie`,
`frequência`, `nomes`, `nomes femininos`, `sobrenomes`, `traços`, `gostos`,
`olhos`, `cabelo`). A ficha de uma personagem diz o povo com `etnia`, `povo` ou
`cultura` (texto ou `[[link]]`).

```regras
etnia "Nórdico" "Nórdicos":     # também: povo, cultura
  descrição "Gente do gelo."
  espécie "Humano"               # (opcional) só gente desta espécie
  olhos "azul" 60%, "verde" 20%  # a cor mais comum (os genes se ajustam)
  cabelo "loiro" 55%
  altura +6                      # cm
  força +5                       # ajustes de corpo e atributos
  nomes "Bjorn", "Erik"
  nomes femininos "Astrid", "Freya"
  sobrenomes "Ragnarsson"
  traços "corajoso"              # todos têm
  pode ter "curioso" 20%         # cada um sorteia
  gostos "o mar"
  frequência 40%                 # dos figurantes (por família)
  afinidade +10                  # opinião sobre gente do próprio povo
  afinidade "Sulista" -20        # e sobre outro povo ("*" = qualquer outro)
```

Filhos herdam o povo dos pais (de um deles, se forem de povos diferentes), e
muitas vezes um nome do povo. Nas regras: `p.etnia`, `etnia(p)`.

### Filtros: para quem vale

Traço, atributo, profissão, evento e vínculo aceitam uma linha `para` (junte com
`e`). Tudo vazio = todo mundo.

```regras
traço "Sangue de dragão" "Sangue de dragão":
  categoria congenito
  nasce com 8%                   # chance de nascer com (só quem passa no filtro)
  para etnia "Nórdico" e sexo feminino

atributo "Fúria":
  faixa 0 a 10
  para idade 16 a 60             # aparece quando a idade chega

profissão "Valquíria":
  renda 14
  habilidade combate
  para sexo feminino e idade 18 a 45
```

Critérios: `espécie "A", "B"`, `etnia "X"` (ou `povo`), `facção "Coroa"`,
`sexo feminino`/`masculino` (ou `mulheres`, `homens`), `idade 16 a 60`,
`idade > 30`, `idade até 12`, `adultos`, `crianças`, `idosos`.

### Vínculos e status novos

Além de namoro, noivado, casamento, caso, amizade, rivalidade e inimizade, o
mundo inventa os seus:

```regras
vínculo "Mentor e aprendiz":     # também: laço, status
  símbolo 🎓
  descrição "O ofício passa de mão em mão."
  papéis "mentor", "aprendiz"    # dois lados diferentes (opcional)
  exclusivo                      # um de cada vez por pessoa
  secreto                        # só quem lê a crônica sabe (🤫)
  romântico                      # conta como estar comprometido
  opinião +10                    # entre os dois
  peso brigar -80%               # entre os dois, muda a vontade das interações
  por mês respeito +1            # afeto, confiança, respeito, intimidade, atração, humor, estresse
  surge onde a.idade > 35 e b.idade < 22    # entre quem se cruza no mês
  chance 40%                     # por ano
  acaba onde b.idade > 30
  para espécie "Humano"          # os dois precisam passar
  ao formar:
    crônica "{a} toma {b} como aprendiz."
  ao acabar:
    crônica "{b} já não precisa de {a}."
```

Nas regras: `vincular(a, b, "Mentor e aprendiz")` (o primeiro fica com o
primeiro papel), `desvincular(a, b, "...")`, `vínculo(a, b, "...")`,
`vinculados(p, "...")`, `papel(p, outro, "...")`, `p.mentor_e_aprendiz` (com
quem tem), e `quando mentor_e_aprendiz(a, b):` quando forma. No painel da
pessoa, **⚖ Relação** liga e desfaz qualquer vínculo à mão.

### Tom: fantasia, cômico, adulto, sério

Interações, tramas e eventos podem dizer o tom. O mundo regula quanto quer de
cada um em **Mundo e ajustes** (0 = nunca, 3 = o triplo): a chance é
multiplicada pelo ajuste.

```regras
interação "Bebedeira épica" entre a em personagem, b em personagem onde a.amigos tem b:
  tom cômico
  chance = 20%
  crônica "{a} e {b} bebem até {acordar no telhado|batizar uma cabra}."
```

### Tramas em etapas

Uma interação que dura meses: começa como uma interação comum (`entre`, `onde`, `atração`, `chance` por ano), mas o corpo é uma sequência de **etapas**. Cada etapa roda quando chega a vez dela e espera `dura N meses` (padrão 1) antes da próxima. As variáveis (`seja`) valem de uma etapa para a outra.

```regras
trama "Sedução lenta" entre a em personagem, b em personagem onde atração(a, b) > 60 e não trama(a):
  chance = 15%
  etapa "Olhares":
    dura 2 meses
    relação(b, a).atração += 5
    crônica "{a} começa a rondar {b}."
  etapa "Convite":
    se atração(b, a) < 40:
      falhar "{b} recusa o convite de {a}."
    se chance(30%):
      repetir                # tenta de novo depois de "dura"
    crônica "{b} aceita o convite de {a}."
  etapa "Noite":
    caso(a, b)
  ao concluir:
    crônica "{a} conquista {b}."
  ao falhar:
    a.humor -= 20
```

| Dentro de uma etapa | O que faz |
|---|---|
| (nada) | vai para a próxima etapa depois de `dura`; depois da última, a trama acaba bem (`ao concluir`) |
| `seguir` | idem, na hora |
| `esperar 3` | vai para a próxima, mas daqui a 3 meses |
| `repetir` / `repetir 2` | roda esta etapa de novo (depois de `dura`, ou de 2 meses) |
| `ir para "Convite"` | pula para outra etapa |
| `falhar` / `falhar "texto"` | acaba mal: roda `ao falhar` (o texto entra na crônica) |
| `concluir` / `concluir "texto"` | acaba bem: roda `ao concluir` |

- Quem já puxa uma trama não começa outra igual; `trama(p)` ou `trama(p, "Sedução lenta")` diz se `p` está numa (bom para o `onde`).
- Se alguém da trama morre, ela acaba sem alarde.
- Na simulação de facções (ano a ano) as tramas também rodam; `dura` em meses vira anos arredondados (no mínimo 1).
- O painel de cada pessoa mostra as tramas em andamento e em que etapa estão.

### Valores e relações

- `ódio(a, b)` (0 a 100) é a opinião negativa: `ódio(a, b) > 50`. Também `relação(a, b).ódio`.
- Relações aceitam **campos livres**: `relação(a, b).dívida += 10`, `relação(a, b).juramento = sim`. Leia igual: `relação(a, b).dívida > 0`.
- Compare com `>`, `<`, `>=`, `<=`, `=`, `!=` ou em português (`pelo menos`, `no máximo`...).

Os ids das interações para `peso`: `conversar`, `atividade`, `elogiar`,
`presentear`, `ajudar`, `confidenciar`, `fofocar`, `insultar`, `discutir`,
`reconciliar`, `ensinar`, `brincar`, `cuidar`, `flertar`, `cortejar`,
`intimidade`, `pedir_casamento`, `seduzir`, `encontro_secreto`, `terminar`,
`divorciar`, `brigar`, `duelar`, `ameacar`, `roubar`, `assassinar`,
`trabalhar`, `treinar`, `estudar`, `rezar`, `beber`, `viajar`.

### Campos das pessoas

Leitura: `idade`, `sexo`, `gênero`, `orientação`, `vivo`, `morto`, `adulto`,
`criança`, `local` (onde está agora), `casa` (onde mora), `viajando`,
`profissão`, `dinheiro`, `saúde`, `humor`, `estresse`, `traços`, `gostos`,
`força`, `agilidade`, `intelecto`, `beleza`, `fertilidade`, `altura`, `olhos`,
`cabelo`, `combate`, `lábia`, `intriga`, `ofício`, `saber`, `abertura`,
`conscienciosidade`, `extroversão`, `amabilidade`, `neuroticismo`, `cônjuge`,
`parceiro` (cônjuge, noivo ou namorado), `mãe`, `pai` (o oficial),
`pai_biológico`, `pais`, `filhos`, `irmãos`, `amantes`, `amigos`, `rivais`,
`inimigos`, `grávida`, `família` (sobrenome), `meta`, `alvo`, `comprometido`,
`casado`, `conduzido`, `protegido`, `perto` (quem está no mesmo lugar),
`etnia` (ou `povo`), `facção`, `em_guerra` (no front), `líder` (lidera uma
facção), `vínculos`, `estados` e, para cada vínculo do mundo, a lista de quem
tem (`p.irmãos_de_sangue`).

Dá para mudar: `dinheiro`, `saúde`, `humor`, `estresse`, as habilidades, os
cinco grandes, `traços` (`p.traços += "ciumento"`), `gostos`, `profissão`,
`local`, `família`, `conduzido`, `protegido`, `etnia`, `facção`. Qualquer outro nome vira um campo
livre da pessoa (`p.rancor += 1`). Família, casamento e morte mudam pelas
funções abaixo.

Nos traços, o nome sem acento e no masculino é o que a lista guarda
(`p.traços tem "irascivel"`); `traço(p, "irascível")` aceita qualquer forma.

### Relações

`relação(a, b)` é como `a` vê `b`, com os campos `afeto`, `atração`,
`confiança`, `respeito`, `intimidade`, `opinião` (só leitura), `vínculos` e
`parentesco`:

```regras
relação(a, b).afeto += 20
se relação(b, a).confiança < 0:
  crônica "{b} não acredita numa palavra de {a}."
```

### Funções

| Função | O que faz |
|---|---|
| `opinião(a, b)`, `atração(a, b)` | números de −100 a 100 / 0 a 100 |
| `traço(p, "nome")` | p tem o traço? |
| `ganhar(p, "traço")`, `perder(p, "traço")` | dá ou tira um traço |
| `namorar(a, b)`, `noivar(a, b)`, `casar(a, b)`, `terminar(a, b)`, `divorciar(a, b)` | romance (só entre adultos que podem) |
| `caso(a, b)` | começa um caso em segredo |
| `engravidar(mãe, pai)` | engravida, se der |
| `lutar(a, b, "duelo")` | luta (`briga`, `duelo`, `emboscada`); devolve quem venceu |
| `ferir(p)`, `ferir(p, "manco")`, `matar(p, "envenenado")` | corpo e morte |
| `lembrar(a, b, "me salvou", 30)` | memória de `a` sobre `b` (pontos; meia-vida opcional em meses) |
| `meta(p, "vinganca", alvo)` | dá uma meta |
| `mudar(p, lugar)`, `viajar(p, lugar)` | muda de vez ou viaja |
| `parente(a, b)` | "irmão", "mãe", "primo"... ou vazio |
| `parentes(p)`, `presentes(p ou lugar)` | listas de pessoas |
| `segredo(p)`, `segredo(p, quem)` | p está num segredo (que `quem` sabe)? |
| `revelar(p)` | os segredos de p caem na boca do povo |
| `atividade(a, b)` | o que os dois gostam de fazer juntos (texto) |
| `vincular(a, b, "nome")`, `desvincular(...)`, `vínculo(a, b, "nome")`, `vinculados(p, "nome")`, `papel(p, outro, "nome")` | vínculos do mundo |
| `etnia(p)`, `facção(p)` | povo e facção (a ficha da facção, se houver) |
| `em_guerra(f)`, `em_guerra(f1, f2)` | a facção está em guerra (com a outra)? |
| `declarar_guerra(f1, f2, "motivo")`, `fazer_paz(f1, f2)` | guerra e paz entre facções |
| `postura(f1, f2)`, `postura(f1, f2, -80)` | lê ou muda a postura (−100 ódio a 100 aliança) |
| `líder(f)` | quem lidera a facção |
| `acontecer("sapo", p)`, `acontecer("noite_proibida", a, b)` | faz um acontecimento do acaso acontecer |
| `estado(p, "preso", 12)`, `estado(p, "preso")` | dá um estado por N meses (0 tira) / está nele? |

### Eventos

`quando nascimento(bebê, mãe, pai)`, `morte(morto)`, `casamento(a, b)`,
`namoro(a, b)`, `noivado(a, b)`, `divorcio(quem pediu, outro)`,
`termino(quem terminou, outro)`, `caso(a, b)`, `descoberta(vítima, traidor,
amante)`, `traicao(traidor, vítima, amante)`, `gravidez(mãe, pai)`,
`paternidade(pai oficial, filho, pai biológico)`, `flerte(a, b)`,
`briga(vencedor, perdedor)`, `duelo(...)`, `emboscada(...)`,
`assassinato(assassino, vítima)`, `atentado(assassino, alvo)`,
`roubo(ladrão, vítima)`, `amizade(a, b)`, `rivalidade(a, b)`,
`inimizade(a, b)`, `reconciliacao(a, b)`, `maioridade(p)`, `doenca(p)`,
`crise(p)`, `traco(p, "nome")`, `viagem(p, "lugar")`, `festa`, `peste`,
`fome`, `guerra`, `fartura`, `inicio`, `mes`, `ano`.

Das guerras entre facções (os valores são as facções): `guerra(atacante,
defensor)`, `batalha(vencedora, perdedora, lugar)`, `conquista(nova, velha,
lugar)`, `paz(a, b)`, `alianca(a, b)`, `queda(caída, vencedora)`,
`sucessao(novo líder, facção)`, `convocado(p, facção)`. Do acaso:
`acontecimento(a, b, "nome")` e um evento com o id de cada acontecimento
(`quando sapo(p):`).

### O construtor

A aba **Regras** tem um construtor que escreve estes blocos por você, com abas
para interação, trama em etapas, traço, atributo, espécie/criatura, povo,
vínculo, item, evento e profissão, filtro "para quem" e tom
(condições e efeitos escolhidos em listas, inclusive qualquer valor da pessoa
ou da relação), e receitas prontas. O texto gerado é esta mesma linguagem: dá
para abrir a nota e ajustar.

## Limites

- Cada regra roda até 200 mil passos (400 mil na simulação); eventos em cadeia
  param na 16ª volta. Passou disso, aparece um erro e o resto continua.
- Regras não criam nem apagam notas: mudam campos e ligações de fichas que
  existem.
- Erros de uma regra não param as outras. Eles aparecem na aba Regras (ao ler) e
  na Simulação (ao rodar).
