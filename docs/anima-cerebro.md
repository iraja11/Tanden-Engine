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
      → intenção (modelo + regras deterministas + sentimento)
      → comando:  campos → sentido → vontade → ação + fala
        consulta: grafo de conhecimento → resposta com prova
        conversa: motor antigo (aprende, opina, lembra) com a intenção certa
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
| `classificador.ts` | O classificador de intenções: embedding bag de palavras, pares, pedaços de 3–4 letras e marcas (hash em 2¹⁸), camada oculta opcional, softmax com temperatura calibrada. Treino SGD, corte das linhas fracas com retreino, **quantização de produto** (32 floats → 8 bytes por linha) e índices em varint. O modelo inteiro tem ~270 KB. |
| `corpus.ts` | A gramática que gera o treino (`(a\|b)`, `[opcional]`, `{slot}`) e o gerador de ruído (gíria, erro de digitação por teclado, sem acento, vocativo, "pfv", palavrão, emoji). 65 intenções. |
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

## Treinar o modelo

Na CPU (uns 20 s), avalia e grava `modelo.dat.ts`:

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
| o resto | "me lembra de estudar amanhã às 10" | o cérebro de sempre (`pensar`), e a resposta volta para o chat do jogo |

**Eventos do jogo** viram fala (`reagirMine`): entrou (primeira vez, saudade,
e as broncas de hora do `problemaDoJogo`), saiu, morreu (por causa, e marcos
de 10 mortes), noite, dia, vida e fome baixas, chuva, tempestade, dimensão,
creeper do lado, dormiu, bateu nela, presente (flor, joia, comida, lixo),
achou diamante, detrito antigo ou esmeralda, conquista (pelo título no idioma
do jogo; `mine.conquista.<tema>` para diamante, Nether, End, dragão, domar,
todos os gatos...), gato perto/carinho/domado, cama de casal achada, dormir
junto, ferramenta quase quebrando e inventário cheio. Com o chat quieto por 7 a 12 min,
ela puxa assunto pelo que vê. O tempo no jogo conta como jogo (horas, rival,
broncas de prova e de sono).

Memória: `minecraft.sessoes/minutos/mortes/presentes`.
