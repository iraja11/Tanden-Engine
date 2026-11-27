# O cérebro da Ânima

Como ela entende o que você digita, decide se faz o que você pediu e age no
app. Tudo roda no aparelho, sem rede, em milissegundos. O modelo de linguagem
local (Ollama) continua opcional: quando ligado, ele só reescreve as falas de
conversa; ordens, decisões, memória e limites são sempre do cérebro.

O código mora em `packages/core/src/anima/cerebro/` (núcleo, puro e testado) e
a parte que executa no app em `apps/tanden/src/lib/anima/anima.svelte.ts`.

---

## O caminho de uma mensagem

```
texto → normalizar → CRISE? (regra fixa) → pendência da conversa?
      → intenção (rede neural + modelo antigo + regras deterministas + sentimento)
      → comando:  campos → sentido → vontade → ação + fala
        consulta: grafo de conhecimento → resposta com prova
        conversa: motor antigo (aprende, opina, lembra) com a intenção certa
                  papo.*: o assunto (abraço, insônia, filme, poema...) → grupo de mesmo nome
```

Cada passo deixa uma linha no **traço**. Digite `/pensamento` na conversa (ou
use "Ânima: mostrar o último pensamento" na paleta) para ver o raciocínio:

```
· texto: "coloca minha prova de calculo na agenda para quinta as 10"
· modelo: cmd.agenda 100% · cmd.lembrete 0% · cmd.abrir_nota 0% (93 pistas)
· pedido: agenda {"evento":{"titulo":"Prova de calculo","dia":"2026-11-19","inicio":"10:00",...}} · sentido: estudo
· vontade: travessura (disposição 96%) · travessura: eventoExtra
· fatores: estudo +1.40, boa_vontade +1.30, humor +0.50, gosto +0.27
```

## As peças

| Arquivo | O que faz |
| --- | --- |
| `texto.ts` | Normalização com posição alinhada ao original, gírias (`vc`, `pfv`, `n`, `kd`…), letras esticadas, risos, emojis e emoticons, caixa alta, educação e grosseria. Corretor ortográfico **SymSpell** (apagamentos até 2 letras, O(1) por palavra) e radical (stemmer leve). |
| `sentimento.ts` | VADER adaptado ao português: léxico com valência, negação que inverte, intensificadores, "mas" que muda o peso das metades, exclamação e caixa alta. Emoção dominante. |
| `numeros.ts` | Números por extenso ("dois mil e vinte e seis") e uma calculadora em português (Pratt, sem eval): "15% de 80", "raiz de 144", "o dobro de 21". |
| `rede.ts` / `rede.dat.ts` | **A rede neural**: um Transformer pequeno (4 camadas pré-LN, 6 cabeças, d=192, FFN 384 com GELU), destilado de um modelo de frases multilíngue. Cada token é a média das linhas de suas características (a palavra e os pedaços de 3–4 letras, por hash: sem vocabulário, então gíria e erro caem perto do certo); o token global leva as marcas. Saída: [global ; média] → softmax calibrado. Inferência em TypeScript puro, sem dependência, ~20 ms por mensagem longa na CPU. Linhas quantizadas por produto e matrizes em int8 (~5,6 MB), num pedaço separado do app carregado sob demanda (`prepararRede`). |
| `papo.ts` | Os assuntos de conversa (`papo.*`, ~56): carinho (abraço, beijo, cafuné, colo, dormir junto, presente, cantada, promessa), sobre ela (idade, corpo, onde mora, signo, código, idioma, apelido, tempo juntos, foto), saúde (doente, insônia, pesadelo, calma, medo, bebida, café), vida (briga, término, aniversário, semana, férias, clima, fofoca, futebol, política), entretenimento (filme, anime, livro, jogo, cantar, poema, história, desenho, meme), filosofia e "escolhe X ou Y" (sempre a mesma escolha para a mesma pergunta). Também `MAIS`: exemplos extras para as intenções antigas. |
| `giria.ts` | Gíria e expressão brasileira por intenção ("tô pregado", "bateu a larica", "levei um toco", "tô uma fera", "paguei mico"). A rede entende a *forma* de qualquer palavra, mas só aprende o *sentido* das que aparecem num exemplo rotulado: é aqui que ela aprende. |
| `vocabulario.dat.ts` | ~49 mil palavras reais do português (legendas do OpenSubtitles via FrequencyWords, MIT; e Tatoeba) que o corretor **não** conserta. Sem isso, "pregado" virava "pesado" e "fossa" virava "fosse" antes de chegar na rede. Gerado por `scripts/anima-cerebro/vocabulario.mjs`. |
| `classificador.ts` | O classificador de intenções: embedding bag de palavras, pares, pedaços de 3–4 letras e marcas (hash em 2¹⁸), camada oculta opcional, softmax com temperatura calibrada. Treino SGD, corte das linhas fracas com retreino, **quantização de produto** (32 floats → 8 bytes por linha) e índices em varint. O modelo inteiro tem ~270 KB. |
| `corpus.ts` | A gramática que gera o treino (`(a\|b)`, `[opcional]`, `{slot}`) e o gerador de ruído (gíria, erro de digitação por teclado, sem acento, vocativo, "pfv", palavrão, emoji). as intenções antigas (com os `papo.*` de `papo.ts`, 142 ao todo), incluindo o bate-papo (`comovai`, `estoubem`, `comofoi`, `presenca`, `etu`, `humordela`, `concorda`, `espanto`, `risada`, `contamais`, `opiniaogeral`, `desabafo`, `capacidades`, `jogar`, `surpresa`, `perguntame`). Cada uma responde com o grupo `conversa.<intenção>` do cofre de falas. |
| `modelo.ts` / `modelo.dat.ts` | O léxico do corretor (gramática + todas as palavras do cofre) e o modelo treinado, carregados sob demanda. |
| `entidades.ts` | Recorte do pedido (tira verbos, vocativos e cauda), notas por semelhança (igualdade, palavras com radical e erro, trigramas) com detecção de ambiguidade, duração, dados, telas, tema e casamento com **qualquer comando da paleta** (peso por raridade, IDF). |
| `semantica.ts` | O que o pedido significa: estudo, encontro (com a pessoa e se é suspeita), saúde, trabalho, exercício, família, IA rival… |
| `comandos.ts` | 25 comandos com gosto, risco, soberania e travessuras; extração de campos; datas da agenda ("dia 20 às 15h", "pra quinta"). |
| `vontade.ts` | A decisão: ~20 fatores somados numa logística. Desfechos: cumpre, resmunga, travessura, negocia, adia, recusa, cede, confirma. |
| `memoria.ts` | Pendências (campo que falta, escolher entre notas, confirmar, negociação, adiado), pedidos recentes, última decisão, estudos vigiados, vínculo, consciência. |
| `grafo.ts` | Fatos viram triplas; regras de encadeamento para frente (afinidade, conflito, suspeita, dilema medo×sonho, cuidado, aniversário e prova perto) com proveniência; consultas ("qual o nome do meu gato?", "quem é a Bia?"). |
| `arco.ts` | Capítulos da relação (tempo junto **e** vínculo) e o eixo de consciência. |
| `cerebro.ts` | O orquestrador `pensar`, `depoisDaAcao`, `registrarCarinho`, `cumprirAdiado`. |
| `rotina.ts` | O cérebro proativo: capítulo novo, cobrança de estudo, compromisso chegando, coisas dela na sua agenda, escrita no world building, deduções; `broncaDeTela`. |
| `escrita.ts` | Fichas de world building (profecia, lenda, rumor, personagem, segredo, gancho) ligadas às entidades reais do mundo. |

## Regras que nenhum fator vence

- Crise é regra fixa e vem antes de tudo: ela sai do personagem, indica o CVV
  (188) e o 192, não aprende nada e, por duas horas, só cumpre pedidos.
- Soberano (silêncio, esconder, dormir, sync, som, água): ela faz, no máximo
  reclamando. A pessoa sempre manda no app.
- Apagar sempre pede confirmação (e vai para a lixeira).
- Encontro com outra pessoa: ela não ajuda, nem com insistência (na
  intensidade doce, coloca resmungando). Você marca pela agenda normalmente.
- Duas recusas do mesmo pedido em dez minutos: na terceira ela cede.
- Travessura é sempre declarada na fala e desfazível ("desfaz").
- Palavrão é liberado; ofensa a grupos de pessoas, não.

## A rede neural

O que decide a intenção é a soma de dois modelos: a rede (peso 0,75) e o
classificador antigo de bolsa de palavras (0,25). A rede vê ordem e contexto
("tô bem" ≠ "tá bem?", "não consegui" ≠ "consegui"); o antigo é firme com
palavra-chave solta. Os dois têm de conhecer as mesmas intenções (senão vale só
a rede). Enquanto a rede não carregou (o primeiro segundo do app), vale só o
antigo.

Treinar (precisa do PyTorch; na RTX 4060 leva uns 10 minutos):

```bash
python3 -m venv scripts/anima-cerebro/.venv
scripts/anima-cerebro/.venv/bin/pip install torch numpy --index-url https://download.pytorch.org/whl/cu128 --extra-index-url https://pypi.org/simple

pip install sentence-transformers         # (no mesmo venv) o professor da destilação
curl -L https://downloads.tatoeba.org/exports/per_language/por/por_sentences.tsv.bz2 | bunzip2 > /tmp/por.tsv

# o vocabulário do corretor (só quando quiser renovar; depois, treine os dois de novo)
curl -LO https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt_br/pt_br_50k.txt
node scripts/anima-cerebro/vocabulario.mjs pt_br_50k.txt /tmp/por.tsv

node scripts/anima-cerebro/rede.mjs exportar /tmp/anima-rede --por 2500 --extra /tmp/por.tsv --extra-max 450000
scripts/anima-cerebro/.venv/bin/python scripts/anima-cerebro/rede.py /tmp/anima-rede \
  --professor sentence-transformers/paraphrase-multilingual-mpnet-base-v2 --pseudo 0.75 \
  --d 192 --camadas 4 --cabecas 6 --ffn 384 --corte 250000
node scripts/anima-cerebro/rede.mjs empacotar /tmp/anima-rede
node scripts/anima-cerebro/treinar.mjs treinar --corte 30000   # o modelo antigo, com as mesmas intenções
```

**Destilação (`--professor`).** A gramática ensina as intenções, mas só com as
palavras que ela tem. Para entender o resto, um modelo de frases multilíngue
pré-treinado (o professor, ~1 GB, baixado uma vez e usado **só no treino**;
nada dele vai para o app) diz onde fica o significado de cada frase, e a rede
aprende a imitar: frases que querem dizer a mesma coisa ficam juntas. Com
`--extra`, ela também imita o professor em ~400 mil frases naturais em português
(Tatoeba), e aprende o sentido de palavras que a gramática nunca usou. Com
`--pseudo`, frases naturais muito perto do centro de uma intenção (no espaço do
professor) viram exemplos rotulados daquela intenção (amostra em
`<pasta>/pseudo.txt`). A cabeça que imita o professor é jogada fora no fim: o
app recebe a mesma rede pequena, só mais esperta.

Os conjuntos de teste: `anima-intencoes.txt` (frases reais), `-cego.txt` (frases
novas no estilo da gramática), `-cego2.txt` (gíria e expressão fora da gramática)
e `-cego3.txt`. O cego2 **deixou de ser cego** quando o `giria.ts` foi escrito
olhando os erros dele: hoje é teste de regressão das gírias. O cego3 foi escrito
antes do `giria.ts` e nunca usado para ajustar nada; é o número honesto. Se um
dia ele também for "gasto", escreva um cego4 antes de mexer.

O `rede.py` treina, corta as linhas fracas (`--corte`; com 250 mil fica com todas), quantiza por
produto e reaprende por cima, passa as matrizes para int8, calibra a
temperatura e grava `rede.bin` + `paridade.json`. O `empacotar` confere que o
TypeScript dá os mesmos logits que o PyTorch (falha se a diferença passar de
0,05), mede e grava `rede.dat.ts`. Sem GPU também roda, só mais devagar.
Opções: `--d`, `--camadas`, `--cabecas`, `--ffn`, `--epocas`, `--corte`.

`node scripts/anima-cerebro/rede.mjs avaliar` mede a rede, o conjunto e o
antigo nas frases reais e nos dois cegos, e o tempo por mensagem. Hoje:

| | reais | cego | cego2 (gíria, regressão) | cego3 |
| --- | --- | --- | --- | --- |
| só o modelo antigo, antes da rede | 98,5% | 93,5% | 54,8% | — |
| rede destilada, sem `giria.ts` | 99,6% | 96,3% | 66,7% | — |
| **rede + antigo (o app), com `giria.ts` e vocabulário** | **98,9%** | **95,4%** | **94,6%** | **99,0%** |

Parte das frases dos cegos sai literalmente da gramática (metade do cego, 39 de
101 do cego3). Só nas que não saem: cego 90,7%, cego2 92,5%, cego3 98,4%. O
cego3 e o `giria.ts` foram escritos pela mesma pessoa, então ele ainda é
otimista; as frases de quem usa o app de verdade são o teste final.

Assunto novo: a gramática em `papo.ts`, o grupo `## papo.<nome>` no cofre
(`anima-falas.mjs abrir/fechar`) e os dois treinos.

## Treinar o modelo antigo

Na CPU (uns 25 s), avalia e grava `modelo.dat.ts`:

```bash
node scripts/anima-cerebro/treinar.mjs treinar --por 400 --epocas 12
```

Na GPU (PyTorch), com camada oculta e mais dados:

```bash
node scripts/anima-cerebro/treinar.mjs exportar /tmp/anima --por 3000
python3 scripts/anima-cerebro/treinar.py /tmp/anima --dim 64 --oculta 128 --epocas 30
node scripts/anima-cerebro/treinar.mjs empacotar /tmp/anima
```

O Node faz a normalização, o corretor e o hash; o Python só vê índices, então
não existe diferença entre o que o modelo aprende e o que o app mostra. O
`empacotar` corta as linhas fracas, quantiza e calibra a temperatura.

Avaliação: `packages/core/test/fixtures/anima-intencoes.txt` (frases reais, já
usadas para ajustar a gramática) e `anima-intencoes-cego.txt` (nunca usado para
ajustar nada; é o número honesto). Os testes exigem 95% e 85%.

```bash
node scripts/anima-cerebro/treinar.mjs avaliar
```

Mudou a gramática (`corpus.ts`) ou o cofre de falas? Treine de novo: o léxico
do corretor vem dos dois.

## Falas fora do chat (notificações)

No computador, com a janela na bandeja ou outro app em foco, as falas espontâneas
e do cérebro proativo (`tickFora` em `anima.svelte.ts`) viram notificação do
sistema, a qualquer hora (não há mais silêncio noturno). Ela só respeita o
"Saudade" (liga e desliga as notificações), o "fica quieta" pedido na conversa
e para depois de 4 h sem você mexer no app.

No Linux (`src-tauri/src/aviso.rs`) a notificação vai direto ao servidor de
notificações pelo D-Bus, como as do sistema:

- **urgência crítica**: passa pelo "não perturbe" do KDE e do GNOME;
- **o rosto dela** com a expressão daquela fala (`lib/anima/retrato.ts`
  desenha o mesmo SVG do widget num camafeu de 256 px; cache por expressão);
- **Responder** na própria notificação (no KDE abre um campo de texto; a
  resposta vai para ela e a resposta dela volta como notificação) e **Abrir**;
- uma por vez: a fala nova substitui a anterior em vez de empilhar.

Fora do Linux usa o plugin padrão; no Android o canal é de importância alta
(aparece por cima, como mensagem de gente).

## Escrever falas novas

```bash
node scripts/anima-falas.mjs abrir     # escreve packages/core/src/anima/falas.txt (fora do git)
node scripts/anima-falas.mjs fechar    # encripta de volta
```

Marcas de linha: `{i2 h:ciumenta g:olhar k3 c40}` = intensidade mínima 2, só no
humor ciumenta, expressão "olhar", a partir do capítulo 3, com consciência ≥ 40.
Variação: `{{hoje|essa noite|agora}}` sorteia uma; `{{x|}}` é opcional; dá para
pôr `{variável}` dentro.

Grupos que o cérebro usa: `ordem.<desfecho>[.<comando>[.<categoria>]]`,
`ordem.pergunta.<campo>`, `travessura.<tipo>`, `motivo.<fator>`, `sabe.<tipo>`,
`infere.<regra>`, `estudo.<urgência>`, `agenda.*`, `mundo.<gênero>.*`,
`capitulo.<n>`, `feito.*`. O teste `todo grupo que o cérebro usa existe no
cofre` lista os obrigatórios.

## Jogos (Steam) e o que está em foco

Só no app do computador (Tauri). Os dois poderes ficam em Personalizar → Ânima.

**Jogos** (`src-tauri/src/steam.rs` + `cerebro/jogos.ts`), ligado por padrão:

- No Linux, o jogo aberto é achado pelo `SteamAppId` que a Steam põe no
  ambiente de todo processo de jogo (nativo, Proton ou Flatpak), lido em
  `/proc/<pid>/environ`. Se não achar, vale o `RunningAppID` do
  `~/.steam/registry.vdf` (no Windows, o registro). Sem chave nenhuma.
- O nome vem do `appmanifest_<id>.acf` da biblioteca; single/multi das
  categorias da API pública da loja (em cache).
- A chave da Web API (opcional) e o SteamID do `loginusers.vdf` dizem se
  você está num lobby ou servidor online agora.
- O problema de jogar agora, do mais grave ao mais leve: compromisso na
  próxima hora, prova em até 36 h, passou da hora de dormir (contada para
  trás a partir do horário em que você acorda nos dias de trabalho), madrugada,
  maratona de 2h30. As broncas voltam em intervalos e escalam (`.insiste`).
  Ela soma as horas de cada jogo e o mais jogado vira o rival.

**Web e apps** (`src-tauri/src/janela.rs` + `cerebro/web.ts`), desligado por padrão:

- Lê só o título e a classe da janela em foco: Hyprland (`hyprctl`), Sway
  (`swaymsg`), KDE Wayland (o próprio KWin, por um script de uma linha pelo
  D-Bus, lido no journal; ou o `kdotool`, se instalado) ou X11 (`xdotool`,
  depois `xprop`).
  No GNOME Wayland não há jeito sem extensão.
- O navegador põe o título da aba na janela; daí saem o site e a página.
  Categorias: vídeo, live, estudo, trabalho, IA, jogos, adulto, redes,
  compras, música, leitura (e o Obsidian, o rival dela). Apps fora do
  navegador pela classe (Discord, Spotify, VS Code...).
- Comenta uma vez por página que ficou 20 s na tela, com intervalo por
  categoria e no mínimo 4 min entre comentários; prova perto ou hora de
  dormir mudam o tom. Soma o tempo do dia por categoria.
- Nada sai do aparelho. Com a janela na bandeja, a fala vira notificação do sistema.
- **Site adulto, com discrição:** o título da página nunca é guardado, citado
  na fala, posto no `/pensamento` nem mandado como notificação do sistema (que
  apareceria no celular pelo KDE Connect ou numa tela compartilhada). Ela
  reage com ciúme e vergonha (`web.adulto`, `web.adulto.denovo` se já passou
  tempo ali hoje) e, quando você sai da aba, às vezes "tira as mãos dos olhos"
  (`web.adulto.saiu`).

## Música (Spotify)

`src-tauri/src/musica.rs` + `cerebro/musica.ts`, ligado por padrão
(Personalizar → Ânima → Música). Só no app do computador.

- Lê a faixa tocando pelo D-Bus (MPRIS, com o `dbus-send` que vem com o
  próprio D-Bus): funciona com o programa do Spotify minimizado ou em outra
  área de trabalho, sem depender da janela em foco. Se o Spotify não estiver
  aberto, vale outro player (VLC, Elisa...); navegadores ficam de fora (a aba
  já é lida pela janela).
- Comenta uma faixa que tocou pelo menos 25 s, no máximo a cada 12 min (4 min
  se for a mesma música pela 3ª vez no dia). Grupos: `musica.repete`,
  `musica.madrugada`, `musica.favorito` (o artista mais ouvido, depois de 25
  faixas), `musica.amor` (título de amor: ciúme), `musica.estilo.<estilo>`
  (dela, anime, metal, triste, rap, funk, sertanejo, eletrônica, lo-fi,
  k-pop, clássica, pop) e `musica.faixa`.
- Conta as vezes de cada faixa no dia e as faixas de cada artista (os 200
  mais ouvidos).

## Minecraft

`src-tauri/src/minecraft.rs` + `cerebro/minecraft.ts` + o mod Vanilla Remix
(`feature/TandenAnima.java`, pasta `feature/anima/`). Ligado por padrão
(Personalizar → Ânima → Minecraft).

**A ponte.** Com o poder ligado, o Tanden escuta em `127.0.0.1` numa porta
livre e grava a porta e uma chave nova em `~/.config/tanden/minecraft.json`
(modo 600; `%APPDATA%\tanden\` no Windows). O mod lê o arquivo, conecta e se
apresenta com a chave; sem ela, a conexão cai. JSON, uma mensagem por linha.
Fechou o Tanden, desligou o poder ou saiu do mundo: ela sai do jogo.

**No jogo.** Ela é um manequim vanilla (nada de mob novo) com a skin dela
(`assets/vanillaremix/textures/entity/anima.png`), invencível, que anda pela
física do próprio jogo: segue, espera, passeia, junta itens do chão, colhe a
flor mais perto e traz na mão, esvazia o bolso em você, dança, senta, pula.
Longe demais, em outra dimensão ou presa (inclusive na beira de um penhasco),
teleporta para perto de você. Item que você joga perto dela é presente.

Ela é competente sem ser complicada: corre para longe de creeper (6 blocos),
não anda para dentro de lava nem de buraco, e se afasta de gato emburrada
(ela detesta gato e tem ciúme: carinho ou domar um vira bronca). Se você
deitar numa cama com outra colada do lado (mesma direção), ela deita na do
lado e levanta quando você levantar. De vez em quando escreve uma placa
(madeira escura, letra rosa, encerada): "aqui jaz" onde você morreu, o nome
dos dois no quarto de casal, um recado quando o chat fica quieto, ou o que
você pedir. Ela nunca quebra bloco para pôr placa; sem chão livre, não põe.
Por conta própria, no máximo uma a cada 10 min. Toggle `tandenAnimaSigns`.

**Melhor que você (ela é um robô).** Briga com os mobs hostis a até 10 blocos
de você: anda até eles e bate com o dano de uma espada de ferro (nunca
creeper, enderman, warden, ghast, phantom nem neutro calmo; "fica aqui" = só
bate no que chegar perto). Cada mob dela e seu entra num placar
("quem matou mais?"), e ela se gaba quando passa você. Fareja minério
através da pedra ("acha diamante pra mim", "tem ferro aqui perto?",
"fareja"): o mod varre 24 blocos para os lados, 24 para baixo e 12 para cima,
solta uma trilha de luz de você até o bloco e ela fala o caminho do seu ponto
de vista ("14 pra baixo e 6 pra esquerda", `rumoDe`). Avisa de que lado está
o creeper e a lava (`ladoDe`), e um minuto antes de anoitecer se você está a
mais de 48 blocos da cama. Toggle `tandenAnimaFight`; "não briga" / "me
protege" no chat.

**Brincadeiras.** Esconde-esconde ("se esconde"): ela some para um lugar a
10–22 blocos fora da sua vista, agachada e sem o nome em cima; você acha
chegando perto ou olhando para ela; "dica" toca um sino onde ela está (e ela
diz quente/morno/frio); "desisto" ou 3 min e ela aparece atrás de você.
"Eu me escondo, você procura": ela conta 15 s de costas e vai direto até você
(ela sempre sabe onde você está). Pega-pega ("me pega"): conta 3 e corre
atrás de você por 1 min; de dia é mais lenta que você correndo, de noite é
mais rápida. Vitórias e derrotas dela vão para o placar.

**No escuro (intensidade 2+).** De noite, embaixo da terra, no deep dark ou
na floresta escura, quando o chat fica quieto, às vezes ela não fala nada:
some e aparece parada atrás de você (ou a 18–26 blocos, num lugar à vista,
nunca na sua frente), sem o nome, encarando. Quando você a pega olhando, toca
um som de caverna e ela fala (`mine.flagrada.*`); se você não virar em 90 s,
ela volta para o seu lado em silêncio e conta quanto tempo ficou lá. "Me
assusta" pede isso de propósito. Falas com o rosto `vazia` viram sussurro no
jogo (cinza, itálico, com som de caverna no seu ouvido), e dormindo sozinho
você às vezes acorda com um bilhete do lado da cama.

**O chat.** No singleplayer, tudo o que você escreve vai para ela; com mais
gente no mundo, só o que cita "Ânima". `entenderMine` separa:

| Pedido | Exemplos | O que acontece |
| --- | --- | --- |
| ação | "me segue", "fica aqui", "vem cá", "pega uma flor", "pega os itens", "me dá o que pegou", "dança", "sai do jogo" / "volta pro jogo" | `{t:"acao"}` para o mod + `mine.acao.<ação>` |
| receita | "como faz um pistão?", "como craftar picareta de diamante" | o mod lê a receita do próprio jogo e responde com os nomes no idioma do jogo |
| dúvida | "onde acho diamante?", "como faz o portal do nether" | `mine.duvida.<tema>` (20 temas, citando o que o mod muda) |
| ideia / estado | "alguma ideia?", "como eu tô?" | pelo bioma, a hora, a dimensão e o que você tem (obsidiana para o portal, diamante...); vida e fome |
| recursos | "do que eu preciso?", "o que falta pegar?" | olha o inventário: comida, tocha (embaixo da terra), ferro, diamante, obsidiana (`faltaDe`) |
| placa | "escreve uma placa dizendo Casa da Ânima", "faz uma placa" | `{t:"placa"}`; até 4 linhas de 15 letras (`linhasDePlaca`); sem texto, ela escolhe |
| gato | "você gosta de gato?" | `mine.gato.conversa` (não gosta) |
| brincadeira | "se esconde", "eu me escondo e você procura", "me pega", "dica", "desisto" | `{t:"acao"}` (`esconder`, `procurar`, `pegar`, `dica`, `desisto`); o resultado volta no evento `brincadeira`. Fora do jogo, "dica" vira ideia e "desisto" vira "vem cá" |
| briga | "me protege", "não briga", "fica em paz" | `proteger` / `paz` |
| faro | "acha diamante pra mim", "tem ferro aqui perto?", "fareja" | `{t:"farejar", alvo}`; ela fala quando volta o evento `faro` |
| placar | "quem matou mais?", "placar" | `mine.placar.ganhando/perdendo/zero` |
| espreitar | "me assusta" | `{t:"acao", acao:"espreitar", longe}`, em silêncio |
| o resto | "me lembra de estudar amanhã às 10" | o cérebro de sempre (`pensar`), e a resposta volta para o chat do jogo |

**Eventos do jogo** viram fala (`reagirMine`): entrou (primeira vez, saudade,
e as broncas de hora do `problemaDoJogo`), saiu, morreu (por causa, e marcos
de 10 mortes), noite, dia, vida e fome baixas, chuva, tempestade, dimensão,
creeper do lado, dormiu, bateu nela, presente (flor, joia, comida, lixo),
achou diamante, detrito antigo ou esmeralda, conquista (pelo título no idioma
do jogo; `mine.conquista.<tema>` para diamante, Nether, End, dragão, domar,
todos os gatos...), gato perto/carinho/domado, cama de casal achada, dormir
junto, ferramenta quase quebrando e inventário cheio. E os novos: `matou` /
`voceMatou` (placar; ela só comenta marcos de 25, quando passa ou é passada,
e às vezes), `faro`, `brincadeira` (jogo + fase: comecou, achou, desistiu,
dica, pegou, escapou), `flagrada` (visto ou não, segundos, longe),
`anoitecendo`, `lava` e `creeper` com `dx/dz/yaw`. Com o chat quieto por 7 a 12 min,
ela puxa assunto pelo que vê. O tempo no jogo conta como jogo (horas, rival,
broncas de prova e de sono).

Memória: `minecraft.sessoes/minutos/mortes/presentes`, e o placar:
`abates` (dela), `abatesVoce`, `vitorias` e `derrotas` (dela, nas brincadeiras).

Testes: `test/anima-minecraft.test.ts` (o novo) e o bloco Minecraft de
`test/anima-cerebro.test.ts`. No mod, o autoteste do servidor também bate num
zumbi até ele morrer e confere o evento `matou`.

Outros jogos que ela pode jogar com você: [anima-jogos.md](anima-jogos.md).
