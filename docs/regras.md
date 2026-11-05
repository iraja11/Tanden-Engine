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
`casado`, `conduzido`, `protegido`, `perto` (quem está no mesmo lugar).

Dá para mudar: `dinheiro`, `saúde`, `humor`, `estresse`, as habilidades, os
cinco grandes, `traços` (`p.traços += "ciumento"`), `gostos`, `profissão`,
`local`, `família`, `conduzido`, `protegido`. Qualquer outro nome vira um campo
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

### O construtor

A aba **Regras** tem um construtor que escreve estes blocos por você (condições
e efeitos escolhidos em listas) e receitas prontas. O texto gerado é esta mesma
linguagem: dá para abrir a nota e ajustar.

## Limites

- Cada regra roda até 200 mil passos (400 mil na simulação); eventos em cadeia
  param na 16ª volta. Passou disso, aparece um erro e o resto continua.
- Regras não criam nem apagam notas: mudam campos e ligações de fichas que
  existem.
- Erros de uma regra não param as outras. Eles aparecem na aba Regras (ao ler) e
  na Simulação (ao rodar).
