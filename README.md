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
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool
```

## Onde ficam as notas

- Desktop: `~/Tanden` (mude com a variável `TANDEN_VAULT=/outra/pasta`).
- Web: dentro do navegador (IndexedDB), até o sync com o Drive ficar pronto.

A pasta é um cofre comum do Obsidian: pode abrir a mesma pasta nele.

```
**/*.md                                 suas notas
.tanden/crdt/<nota>/<aparelho>.bin      histórico de edição de cada aparelho
.tanden/crdt/<nota>/<aparelho>.json     o que cada aparelho escreveu no .md
```

## Como o merge funciona

Cada aparelho grava só os próprios arquivos em `.tanden/`, então dois aparelhos nunca disputam o mesmo arquivo no Drive. Ao sincronizar, o Tanden lê o histórico de todos e funde com um CRDT (Yjs): edições feitas offline no celular e no PC se juntam sem perder nada.

Se você editar um `.md` fora do Tanden (Obsidian, editor do Drive), a diferença é detectada e entra no merge também. Dois aparelhos que detectam a mesma edição externa geram operações idênticas, então o texto não duplica. Os casos estão em `packages/core/test/vault.test.ts`.

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

## IA

A aba **IA** tem quatro painéis:

- **Claude** e **Gemini** (só no computador): abrem o Claude Code e o Gemini CLI num terminal dentro do app, já na pasta do cofre. Eles leem e escrevem as notas direto e usam as suas assinaturas, sem custo extra. Instale uma vez: `npm install -g @anthropic-ai/claude-code @google/gemini-cli`.
- **Ollama**: chat com a IA local da sua placa de vídeo, grátis e offline, com a nota aberta como contexto e um botão para inserir a resposta na nota. No celular, troque o endereço pelo IP do PC (ex.: `http://192.168.0.10:11434`) e, no PC, rode o Ollama com `OLLAMA_HOST=0.0.0.0`.
- **Terminal**: um terminal comum na pasta do cofre.

Quando qualquer programa muda uma nota (IA, Obsidian, terminal), o app percebe na hora e funde a mudança. Os terminais continuam abertos ao trocar de aba.

## Próximos passos (fase 1)

1. Agenda com Google Agenda.
2. Ferramentas do Tanden para a IA via MCP (buscar, criar e ligar notas, mexer na agenda).
3. Links `[[ ]]` clicáveis, busca e grafo.
