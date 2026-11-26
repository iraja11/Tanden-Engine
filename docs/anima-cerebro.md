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
  (`swaymsg`), KDE Wayland (`kdotool`) ou X11 (`xdotool`, depois `xprop`).
  No GNOME Wayland não há jeito sem extensão.
- O navegador põe o título da aba na janela; daí saem o site e a página.
  Categorias: vídeo, live, estudo, trabalho, IA, jogos, adulto, redes,
  compras, música, leitura (e o Obsidian, o rival dela). Apps fora do
  navegador pela classe (Discord, Spotify, VS Code...).
- Comenta uma vez por página que ficou 20 s na tela, com intervalo por
  categoria e no mínimo 4 min entre comentários; prova perto ou hora de
  dormir mudam o tom. Soma o tempo do dia por categoria.
- Nada sai do aparelho. Com a janela na bandeja, a fala vira notificação do sistema.
