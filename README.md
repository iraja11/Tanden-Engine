# Tanden Engine

Super app pessoal: notas, IA, agenda, planilhas e muito mais, sincronizados entre Android, Linux, Windows e web.

**Versão 0.1 (fase 1, fundação).** Por enquanto: cofre de notas Markdown compatível com o Obsidian, merge automático entre aparelhos, editor e a interface Núcleo (símbolo tanden e veias).

## Estrutura

```
packages/core     núcleo em TypeScript: cofre, merge (CRDT), eventos. Sem interface.
apps/tanden       app (Svelte + Vite) e o lado nativo (src-tauri, Rust)
```

## Rodar

Requisitos: Node 22+, pnpm 10+, Rust estável.

```bash
pnpm install
pnpm test                       # testes do núcleo
pnpm dev                        # versão web em http://localhost:1420
pnpm --filter @tanden/app tauri dev     # app de desktop
pnpm --filter @tanden/app tauri build   # gera AppImage/deb (Linux) ou instalador (Windows)
```

No **Arch Linux**, as bibliotecas do Tauri:

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool gst-plugins-base gst-plugins-good
```

## Onde ficam as notas

- Desktop: `~/Tanden` (mude com a variável `TANDEN_VAULT=/outra/pasta`).
- Web: dentro do navegador (IndexedDB), até o sync com o Drive ficar pronto.

A pasta é um cofre comum do Obsidian: pode abrir a mesma pasta nele.

```
**/*.md                                 suas notas
.tanden/crdt/<nota>/<aparelho>.bin      histórico de edição de cada aparelho
.tanden/crdt/<nota>/<aparelho>.json     o que cada aparelho escreveu no .md
.tanden/annot/<pdf>/<aparelho>.bin      anotações de PDF de cada aparelho
.tanden/library/<aparelho>.bin          biblioteca: status, estantes, posição e marcadores dos PDFs
.tanden/crdt/<nota>/del/<aparelho>.json lápides: notas apagadas (cada geração da nota)
.tanden/local/<aparelho>/versoes/       histórico de versões das notas (só neste aparelho)
.trash/                                 notas apagadas (como a lixeira do Obsidian)
PDFs/  Importados/  Anexos/  Web/       arquivos, conversões e páginas salvas
```

## Editor de notas

O editor funciona como o Notion, mas o arquivo continua sendo Markdown comum, que o Obsidian abre igual.

- **Prévia ao vivo.** Os títulos, o negrito, os links, as tarefas, as tabelas e as fórmulas já aparecem formatados, e a marcação só volta na linha do cursor. O **Ctrl+Shift+E** alterna para o Markdown puro.
- **Menu `/`.** Ele insere títulos, listas, tarefas, citação, callouts (`> [!dica]`), toggle (`> [!toggle]-`), colunas, tabela, divisor, imagem, vídeo, arquivo, página web, nota embutida, fórmula, cálculo, gráfico, código, data e lembrete.
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

## Como o merge funciona

Cada aparelho grava só os próprios arquivos em `.tanden/`, então dois aparelhos nunca disputam o mesmo arquivo no Drive. Ao sincronizar, o Tanden lê o histórico de todos e funde com um CRDT (Yjs): edições feitas offline no celular e no PC se juntam sem perder nada.

Se você editar um `.md` fora do Tanden (Obsidian, editor do Drive), a diferença é detectada e entra no merge também. Dois aparelhos que detectam a mesma edição externa geram operações idênticas, então o texto não duplica. Os casos estão em `packages/core/test/vault.test.ts`.

## Cadernos: jogos de luta e world building

Os dois cadernos são notas `.md` comuns com propriedades no topo, então o Obsidian abre, busca e liga tudo do mesmo jeito.

**Luta** (`Luta/<jogo>/<personagem>.md`, `tipo: lutador`): combos em notação numpad (`2MK xx 236HP`, `[4]6P`, `j.HK`) que viram ícones de direção e botão, frame data, matchups e uma aba de punições que cruza o bloqueio dos golpes do oponente com o startup dos seus. A nota do jogo (`tipo: jogo`) define a notação: `sf`, `tekken`, `gg`, `kof`, `dbfz` ou `livre` com `botões: [...]`. Frame data entra por CSV ou colando uma tabela de site; nomes de coluna em inglês ou português servem, e reimportar atualiza sem apagar suas notas.

**Mundos** (`Mundos/<mundo>/<Tipo>/<nome>.md`): cada ficha tem `tipo` (personagem, lugar, facção, evento, item, espécie, conceito ou um seu) e `mundo`. Uma propriedade com `[[link]]` vira uma ligação com o nome da propriedade (`afiliação: "[[Ordem do Sol]]"`); links no texto viram "menciona". Datas (`data`, `nascimento`, `morte`, `fundação`, `fim`) montam a linha do tempo e aceitam qualquer calendário: `342`, `-50`, `50 a.C.`, `12/03/342`.

O código fica em `packages/core/src/caderno/` (testes em `test/caderno.test.ts`) e `apps/tanden/src/lib/cadernos/`.

## Mesa de RPG

A tela **Mesa** junta o que se usa jogando. Tudo continua sendo nota comum, então o Obsidian abre igual e outro aparelho recebe pelo sync.

- **Dados.** Fórmulas no formato do Roll20 e do plugin Dice Roller: `1d20+5`, `2d20kh1` ou `1d20 vantagem`, `4d6dl1`, `3d6!` (explode), `2d6r1` (rola de novo os 1), `8d10>=7` (conta sucessos), `4dF`, `d%`, `(1d6+2)*2`, `6x 4d6dl1` (repete) e `# rótulo`. A bandeja mostra média, faixa, a distribuição e a chance de tirar um valor. O histórico fica no aparelho.
- **Nas notas.** `` `dice: 1d20+5` `` vira um botão de rolar, e `` `dice: [[Geradores#Clima]]` `` rola numa tabela. Numa ficha, a fórmula aceita `@for`, `@des`, `@prof` e `@nível`. No menu `/`, use *Rolagem de dados* ou *Tabela de rolagem*.
- **Campanhas** (`Campanhas/<nome>/`, `tipo: campanha`, `mundo: "[[Aerth]]"`, `sistema: 5e` ou `livre`). Os personagens e criaturas com números de jogo do mundo ligado entram na campanha. A tabela `## Rolagens` da nota da campanha vira atalhos na bandeja.
- **Fichas de jogo.** São propriedades da ficha do Mundo: `nível`, `pv`, `pv máx`, `ca`, `for`…`car`, `salvaguardas`, `perícias`, `especialidades` e `jogador`. Opcionalmente, as tabelas `## Ataques` (Ataque, Acerto, Dano) e `## Rolagens` (Rolagem, Fórmula) completam a ficha. Um clique rola testes, salvaguardas, perícias, ataques e dano (×2 no crítico), com vantagem ou desvantagem. Dano e cura gastam primeiro os PV temporários. A mesma ficha aparece na tela Mundos, e `criatura` é um tipo novo de ficha lá.
- **Combate.** O encontro é uma nota (`tipo: encontro`) com a tabela `## Combatentes`. Dá para adicionar o grupo inteiro ou criaturas em lote ("Goblin 1, 2, 3"), rolar a iniciativa de quem falta e passar turnos com N e B; inimigos com PV 0 são pulados. A tela também marca condições e registra o dano em `## Registro`. Quem tem ficha recebe o dano nela também.
- **Tabelas de rolagem.** Qualquer tabela Markdown com um dado no cabeçalho (`d6`, `d20`, `d100`; faixas como `1-2`, `96-00`) é rolável. Numa nota com `tipo: tabela`, cada lista debaixo de um título também é. Num resultado, `{2d4}` rola dados e `{@Outra tabela}` rola outra tabela. *Geradores de exemplo* cria nomes, tavernas, jeito do NPC, ganchos, clima e tesouro.
- **Sessões.** *Nova sessão* cria `Sessão N` com o resumo da anterior e a deixa aberta: cada rolagem entra no `## Registro` dela, com a hora.

O código fica em `packages/core/src/rpg/` (testes em `test/rpg.test.ts`) e `apps/tanden/src/lib/rpg/`.

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

O código fica em `packages/core/src/slides/` (testes em `test/slides.test.ts`) e `apps/tanden/src/lib/slides/`.
## Plugins

Um plugin é uma página HTML (um artefato do Claude serve) que roda isolada e só faz o que você permitir, em cada aparelho. Na tela **Plugins** dá para ligar, desligar, instalar um `.html` ou colar um artefato. Os instalados ficam em `Plugins/<id>.html` no cofre e chegam aos outros aparelhos pelo sync, desligados até você permitir lá também.

O primeiro plugin, que vem com o app, é o **Notícias**: lê feeds RSS, Atom e JSON Feed (basta colar o endereço do site), avisa quando chega notícia nova e salva um artigo como nota, com as imagens, em `Notícias/`. As fontes ficam na nota `Notícias/Fontes.md`.

A API, as permissões e um exemplo de manifesto estão em [docs/plugins.md](docs/plugins.md).

## Eventos (sistema nervoso)

Tudo passa pelo `EventBus` do núcleo (`note.created`, `note.changed`, `process.started`, `sync.finished`...). A interface usa esses eventos para as veias: fluxo contínuo enquanto um processo roda, um pulso quando um dado viaja. As automações vão escutar os mesmos eventos.

## Atualização automática

Cada push na branch `main` do GitHub dispara `.github/workflows/release.yml`, que testa, compila para Linux (AppImage), Windows e Android (APK) e publica uma release. No computador, o app verifica ao abrir e a cada 6 horas e mostra **Atualizar e reiniciar**. No Android, mostra **Baixar e instalar**: o navegador baixa o APK novo e o Android instala por cima, sem perder as notas.

Configuração, uma vez só. Tudo fica nos secrets do GitHub (*Settings → Secrets and variables → Actions*); nenhum arquivo do código precisa ser editado.

1. Chave do atualizador do computador (dentro de `apps/tanden`):
   `pnpm tauri signer generate -w ~/.tauri/tanden.key`
   - `TAURI_SIGNING_PRIVATE_KEY`: conteúdo de `~/.tauri/tanden.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: a senha que você escolheu
   - `TAURI_UPDATER_PUBKEY`: conteúdo de `~/.tauri/tanden.key.pub`
2. Chave do APK (precisa do Java; no Arch, `sudo pacman -S jre-openjdk-headless`):
   `keytool -genkeypair -keystore ~/.tauri/tanden-android.jks -alias tanden -keyalg RSA -keysize 2048 -validity 10000`
   - `ANDROID_KEYSTORE`: saída de `base64 -w0 ~/.tauri/tanden-android.jks`
   - `ANDROID_KEY_PASSWORD`: a senha que você escolheu
3. Em *Settings → Actions → General → Workflow permissions*, marque *Read and write permissions*.
4. Faça push. Instale a primeira versão pela página de Releases (no celular, abra o `.apk` e permita que o navegador instale apps); dali em diante ela se atualiza sozinha.

Guarde as duas chaves num lugar seguro fora do repositório. Se a chave do APK se perder, o Android não aceita a próxima versão por cima e será preciso desinstalar e instalar de novo. Sem `ANDROID_KEYSTORE`, o build pula o APK e segue com o computador. O repositório precisa ser público para o app baixar as atualizações sem senha.

## Android

O APK é compilado pelo GitHub Actions (o projeto Android está em `apps/tanden/src-tauri/gen/android`). No celular, o cofre fica na pasta interna do app e conversa com o computador pelo Google Drive. Para compilar na sua máquina, instale o Android Studio (SDK e NDK) e rode `pnpm tauri android dev` dentro de `apps/tanden`.

## Sync com o Google Drive

As notas vão para uma pasta **Tanden** visível no seu Drive, com a mesma árvore da pasta local. O app usa o escopo `drive.file`: ele só enxerga os arquivos que ele mesmo criou, nada além disso no seu Drive. O sync roda ao abrir, 1,5 s depois de você parar de digitar e a cada 30 s. Sem internet, tudo continua funcionando e sobe quando a conexão voltar.

Configuração, uma vez só (é gratuito):

1. Entre em https://console.cloud.google.com e crie um projeto (ex.: "Tanden").
2. Em *APIs e serviços → Biblioteca*, ative a **Google Drive API**.
3. Em *APIs e serviços → Tela de consentimento OAuth* (ou *Google Auth Platform*), escolha **Externo**, preencha nome e e-mail, e em *Público-alvo / Usuários de teste* adicione o seu próprio e-mail.
4. Em *Credenciais → Criar credenciais → ID do cliente OAuth*, escolha o tipo **App para computador**. Copie o *ID do cliente* e a *Chave secreta*.
5. No Tanden, clique em **Conectar Google Drive** na barra de baixo, cole os dois campos e entre com a sua conta.

Enquanto o app estiver em modo "Teste", o Google pede para entrar de novo a cada 7 dias. Para evitar isso, publique o app na tela de consentimento (*Publicar app*); como é só para você, não precisa de verificação, e o Google só mostra um aviso de "app não verificado" no login.

Opcional: para não colar as credenciais em cada aparelho, crie os secrets `TANDEN_GOOGLE_CLIENT_ID` e `TANDEN_GOOGLE_CLIENT_SECRET` no GitHub; o build já as embute. Para um app de computador, o Google não considera essa "chave secreta" confidencial.

## Quadros (mapas mentais, workflow e desenho)

Módulo **Quadros** na barra lateral. Cada quadro é um arquivo `.canvas` no formato JSON Canvas, o mesmo do Obsidian: caixas, notas, links, grupos e setas abrem lá também. O tipo do quadro e os traços de desenho vão no campo `x-tanden`, que o Obsidian ignora; se o Obsidian regravar o arquivo sem esse campo, o desenho continua no Tanden.

- **Mapa mental:** Tab cria um filho, Enter cria um irmão, as setas do teclado navegam e o mapa se organiza sozinho, dividido entre os dois lados. Cada galho da raiz ganha uma cor, e os netos herdam.
- **Workflow:** caixas ligadas por setas. Selecione uma caixa e arraste um dos pontos laterais até outra caixa, ou até o vazio para criar a próxima já ligada. Dois cliques numa seta dão um rótulo a ela.
- **Desenho:** caneta com pressão (mesa digitalizadora), linha, seta, retângulo, elipse e borracha. Com **Ajuste** ligado, um rabisco reto vira linha e um contorno fechado vira retângulo ou elipse. Shift trava ângulos e proporções; **Grade** (G) encaixa tudo em passos de 20.
- **Notas no quadro:** arraste uma nota da lista para o quadro, ou use **+ Nota**. Dois cliques abrem a nota. `[[links]]` dentro das caixas também abrem.
- Atalhos: V, T, P, L, A, R, O, E trocam de ferramenta; 1 a 6 colorem; Delete apaga; Ctrl+Z/Ctrl+Shift+Z; Ctrl+G agrupa; F enquadra tudo. Ctrl+roda aproxima, roda passeia. No celular, um dedo arrasta e dois aproximam; com caneta ativa, a palma da mão é ignorada.

O merge é por campo: um aparelho move a caixa enquanto outro muda o texto, e as duas mudanças ficam. Edições feitas no Obsidian entram por diferença de três vias, então apagar uma caixa lá apaga aqui sem levar junto o que outro aparelho criou no meio tempo. Estado em `.tanden/board/`; casos em `packages/core/test/board.test.ts`.

As veias só se mexem quando há dado viajando: um pulso corre pela seta quando um tópico nasce do outro, e uma caixa brilha um instante quando chega mudança de outro aparelho.

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

- **Blocos de cálculo** (` ```calc `): uma conta por linha, com o resultado à direita (clique copia). Vírgula decimal (`2,5`), milhar com ponto ou espaço (`1.234,56`), `;` entre argumentos, `Rótulo: conta`, variáveis (`L = 6 m`), funções (`f(x) = x^2 - 3x + 2`), `total` (soma desde o último título) e `ans`. As variáveis passam de um bloco para o próximo.
- **Dinheiro:** `preço = R$ 120` ou `120 reais`, e a conta segue normal. Os nomes em inglês (`solve`, `derive`, `integrate`) também valem.
- **Unidades:** `100 km/h em m/s`, `25 °C para °F`, `5 kN/m * (4 m)^2 / 8 em kN*m`, `12 V / 4 kΩ em mA`. Valem as do mathjs mais cv, kgf, tf, mca, rpm, ha, cal e Ah, e constantes curtas (`g0`, `c0`, `NA`, `kB`, `qe`, `Rgas`, `eps0`, `mu0`).
- **Funções em português:** `sen`, `cos`, `tg`, `arcsen`, `raiz`, `log` (base 10), `ln`, `arred`, `media`… Matrizes (`[1, 2; 3, 4]`, `det`, `inv`) e complexos (`raiz(-4)` dá `2i`).
- **Simbólico:** `derivada(f(x); x)`, `integral(x^2; x)` (inclusive por partes simples), `simplificar`, `expandir`, `taylor(sen(x); x; 0; 7)`. **Numérico:** `integral(f(x); x; 0; 2)` (aceita `inf`), `resolver(x^2 = 4; x)` (polinômios exatos, o resto por varredura), `limite(sen(x)/x; x; 0)`, `somatorio(k^2; k; 1; 10)`. `v(t) = derivada(s(t); t)` guarda a derivada como função.
- **Gráficos** (` ```grafico `): `y = sen(x)`, `Nome: f(x)`, paramétrica `(cos(t); sen(t))`, polar `r = 1 + cos(θ)`, `pontos: (1; 2) (3; 4)`, `x = 2`, e intervalos `x: 0..2pi`. Usam o que foi definido nas contas acima. Arrastar move, Ctrl+roda ou pinça aproxima, dois cliques voltam.
- **Fórmulas LaTeX:** `$E = mc^2$` no texto e `$$ … $$` em destaque, desenhadas com o KaTeX quando o cursor sai delas.
- **Aba Cálculo:** folhas em `Cálculo/` (notas com `tipo: cálculo`, onde toda linha é conta, sem precisar de bloco), um gráfico grande com as funções da folha mais uma curva livre, e uma cola de sintaxe que insere o exemplo com um clique.

O código fica em `packages/core/src/calc/` (testes em `test/calc.test.ts`) e `apps/tanden/src/lib/calc/`. O mathjs e o KaTeX só carregam quando o editor abre, num pedaço separado.

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

Cada aparelho lembra quais avisos já mostrou, então um lembrete não repete no mesmo aparelho. Adiar cria um aviso novo. O código está em `packages/core/src/reminders.ts` (formato e agenda), `packages/core/src/quick-reminder.ts` (português) e `apps/tanden/src/lib/reminders.svelte.ts` (avisos).

## Flashcards

Os cartões moram nas notas, no formato do plugin Spaced Repetition do Obsidian, então os dois apps estudam os mesmos cartões com o mesmo agendamento. Toda nota com a tag `#flashcards` entra no estudo; `#flashcards/idiomas/inglês` cria o baralho "idiomas/inglês" (e um baralho inclui os de dentro).

- `Pergunta::Resposta` numa linha; `:::` estuda também ao contrário.
- Várias linhas: a pergunta, uma linha só com `?` (ou `??` para os dois sentidos) e a resposta, até a linha em branco.
- `==realce==` num parágrafo vira lacuna, uma por realce.
- Depois de responder, o cartão ganha `<!--SR:!2026-10-20,3,250-->` (próxima data, intervalo em dias, facilidade). No editor isso aparece como uma etiqueta 🃏 com a data; o texto volta com o cursor na linha.

A aba **Flashcards** mostra os baralhos, a previsão dos próximos 7 dias e um formulário de cartão novo. No estudo: espaço mostra a resposta, **1 a 4** respondem (Errei, Difícil, Bom, Fácil, com o próximo intervalo em cada botão) e **Ctrl+Z** desfaz. Errar traz o cartão de volta na mesma sessão. O agendamento é um SM-2 parecido com o do plugin. Só um lado de cada cartão (invertido ou lacuna) entra por dia, e isso vale em todos os aparelhos porque sai do próprio agendamento. O limite de novos por dia fica em cada aparelho. A tela Hoje e o número na barra mostram quantos cartões há para revisar. Código: `packages/core/src/flashcards.ts` e `apps/tanden/src/lib/flashcards/`.

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
- **Recortador do navegador** (app do computador). Em *Página web → ✂ Recortar direto do navegador*, arraste o botão **✂ Tanden** para a barra de favoritos do Chrome, Firefox ou Edge. Numa página, clique nele: ela chega ao Tanden como está na tela (serve para páginas que pedem login). Com um trecho selecionado, ele vira destaque; clique de novo com outro trecho para juntar mais destaques na mesma nota. O app escuta só em `127.0.0.1:27183` e cada computador tem uma chave própria dentro do favorito, então outro site não consegue mandar nada. Código: `apps/tanden/src-tauri/src/clipper.rs`.

Arquivos grandes sobem para o Drive em partes, e o sync só relê um arquivo quando ele muda. O código está em `packages/core/src/convert/` (conversões), `files.ts`, `webclip.ts`, `annotations.ts`, `pdf-export.ts` e em `apps/tanden/src/lib/files/` e `apps/tanden/src/lib/pdf/`.

## Aparência, movimento e sons

O botão de engrenagem no pé da barra lateral (ou **Ctrl+,**) abre *Aparência e sons*. Tudo vale na hora e fica salvo por aparelho.

- **Temas:** Núcleo, Seth, Satsui, Hadou, Jade (escuros), Papel e Gelo (claros). Dá para trocar só o fundo ou escolher qualquer cor de destaque; no tema claro, o destaque escurece sozinho até ficar legível. Com suporte do sistema, o tema novo se espalha em círculo a partir do clique.
- **O símbolo tanden** só se mexe com motivo: parado e alinhado é "tudo em dia"; gira enquanto há trabalho (mais rápido quando a IA pensa) e desacelera como motor até assentar; dá uma volta quando algo de outro aparelho é fundido; o anel acende quando um dado chega e fica vermelho quando o sync falha. Processos de menos de 150 ms não o movem.
- **Abertura:** as duas metades se encaixam quando o app liga, o símbolo gira enquanto o cofre abre de verdade e depois voa para a barra lateral.
- **Movimento:** Completo, Reduzido (transições curtas, giro lento) ou Parado (o estado aparece só em cor).
- **Sons:** sintetizados na hora, sem arquivos (no Linux, o WebKit toca áudio pelo GStreamer: `gst-plugins-good`). Três estilos (Cristal, Taiko, Circuito), volume e três grupos que ligam e desligam separados: Interface, Atividade e Avisos. Cada som tem limite de repetição e uma variação mínima de altura para não enjoar.

Código: `apps/tanden/src/lib/theme.svelte.ts`, `sound.svelte.ts`, `feel.svelte.ts` (eventos do núcleo viram gesto e som), `motion.ts`, `Orb.svelte` e `Splash.svelte`.

## Próximos passos (fase 1)

1. Agenda com Google Agenda.
2. Ferramentas do Tanden para a IA via MCP (buscar, criar e ligar notas, mexer na agenda).

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

Na paleta (**Ctrl+P**): *Nova tarefa*, *Revisão da semana*, *Montar sistema de vida*, *Salvar página web*, *Recortador do navegador* e *Juntar destaques da nota*. Código: `packages/core/src/vida/` (testes em `test/vida.test.ts`) e `apps/tanden/src/lib/vida/`.

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

O plano pode ser editado à mão (trocar exercício, séries, descanso), e o Tanden lê de novo. Na paleta: *Registrar um copo d'água*, *Registrar pausa* e *Treino de hoje*. O Hoje ganhou um cartão com a água, as pausas e o treino do dia. Código: `packages/core/src/saude/` (testes em `test/saude.test.ts`) e `apps/tanden/src/lib/saude/`.

## Bancos de dados (estilo Notion)

Um banco é um bloco ` ```base ` dentro de uma nota, no formato das **Bases do Obsidian**: o Obsidian abre e mostra o mesmo banco. As linhas são notas comuns e as colunas são as propriedades do topo delas.

- **Views:** tabela, quadro (kanban, arrastar entre colunas), galeria com capa, lista, calendário (arrastar entre dias) e linha do tempo (arrastar e esticar barras). `table`, `cards` e `list` são do Obsidian; `board`, `calendar`, `gallery` e `timeline` são extensões do Tanden.
- **Propriedades tipadas:** texto, número (com formato de moeda e porcentagem), seleção, seleção múltipla, status, data, data e hora, caixa, relação, pessoa, link, e-mail, telefone, arquivos, criação e edição. Tipos, opções e cores ficam em `properties:` no bloco.
- **Filtros, ordenação, agrupamento e cálculos no rodapé** por view; filtros do banco valem para todas.
- **Fórmulas e rollups:** a linguagem das Bases (`if(prazo < today(), "atrasada", "")`, `prazo.format("DD/MM")`, `days(início, fim)`), e uma propriedade pedida de uma relação lê a nota ligada: `tarefas.horas.sum()`.
- **Modelos:** notas em `Modelos/` com `{{title}}`, `{{date}}`, `{{time}}`. Com `modelo-para: "[[Banco]]"` viram opção do botão Novo daquele banco. A tela Bancos tem uma galeria de bancos prontos (tarefas, projetos, metas, leituras, hábitos, reuniões, CRM, gastos, diário).
- **Páginas aninhadas:** as subpáginas de `X.md` moram em `X/`; a barra de notas mostra a árvore e o `+` de cada página cria uma subpágina.
- **Arquivar** marca `arquivado: true` na nota; ela some das views (opção "Mostrar arquivados").

Código: `packages/core/src/base/` (testes em `test/base.test.ts`) e `apps/tanden/src/lib/bases/`.

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

## Quadros: renomear, apagar e conversas com as notas

- O **⋯** ao lado do nome do quadro renomeia, duplica, copia o link `[[ ]]`, transforma o quadro numa nota em tópicos e apaga (com cópia em `.trash/`). Apagar e renomear chegam aos outros aparelhos pelo sync, e um `.canvas` apagado no Obsidian também some aqui.
- Um link `[[Plano.canvas]]` numa nota abre aquele quadro. Imagens do cofre aparecem dentro dos cartões; dois cliques num PDF ou num link abrem no lugar certo.
- **Colar** no quadro: um endereço vira cartão de link, `[[Nota]]` vira cartão da nota e qualquer outro texto vira uma caixa.
- *Mapa mental da nota aberta* (paleta) e *Virar nota em tópicos* (⋯) fazem o caminho de ida e volta entre nota e mapa.

## Personalizar (Ctrl+,)

- **Aparência**: tema, destaque, letra do texto (Manrope, Sistema, Serifada, Mono, Chakra) e tamanho da interface (Ctrl+= / Ctrl+- / Ctrl+0).
- **Atalhos**: todo comando da paleta pode ganhar um ou mais atalhos. Clique no **+**, aperte as teclas e pronto; um atalho repetido sai do comando antigo. Fica salvo por aparelho.
- **Snippets CSS**: arquivos `.css` em `Snippets/` (vão junto no sync) ou em `.obsidian/snippets/`. Cada aparelho liga os que quiser, e o editor embutido mostra o resultado enquanto você digita. Um snippet pode trocar qualquer variável do tema (`--ember`, `--void`, `--f-body`…).
- **Modo foco** (Ctrl+Shift+Enter): esconde as barras; Esc volta.
- Comandos extras na paleta: nota aleatória, próximo tema, claro/escuro, ligar/desligar sons, rolar d20 e 2d6, cara ou coroa, e os da Mesa de RPG (rolar fórmula, combate, fichas, tabelas, nova sessão).

## Robustez do sync

- Um `.md` apagado fora do Tanden (Obsidian, terminal, gerenciador de arquivos) vira um apagar de verdade, com cópia em `.trash/`. Renomear no Obsidian não deixa cópia. Se mais de 20 notas somem de uma vez (pasta desmontada), nada é apagado.
- O sync com o Drive ignora `.git/`, `node_modules/`, o layout de janelas do Obsidian (`.obsidian/workspace*.json`), arquivos temporários e lixo do sistema.
- Se a rede cai no meio do sync, o que já foi enviado fica registrado e não sobe de novo.
