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

Cada push na branch `main` do GitHub dispara `.github/workflows/release.yml`, que testa, compila para Linux (AppImage) e Windows e publica uma release com o `latest.json`. O app instalado verifica ao abrir e a cada 6 horas; quando há versão nova, mostra **Atualizar e reiniciar**.

Configuração, uma vez só:

1. Gere a chave de assinatura no seu computador (dentro de `apps/tanden`):
   `pnpm tauri signer generate -w ~/.tauri/tanden.key`
2. No GitHub, em *Settings → Secrets and variables → Actions*, crie:
   - `TAURI_SIGNING_PRIVATE_KEY` com o conteúdo de `~/.tauri/tanden.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` com a senha que você escolheu
3. Em `apps/tanden/src-tauri/tauri.conf.json`, troque `PREENCHER_COM_A_CHAVE_PUBLICA` pelo conteúdo de `~/.tauri/tanden.key.pub` e `PREENCHER_USUARIO/PREENCHER_REPOSITORIO` pelo seu repositório.
4. Em *Settings → Actions → General → Workflow permissions*, marque *Read and write permissions*.
5. Faça push. Instale a primeira versão pela página de Releases; dali em diante ela se atualiza sozinha.

O repositório precisa ser público para o app baixar as atualizações sem senha. Nunca coloque a chave privada no repositório.

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

## Próximos passos (fase 1)

1. Build para Android (com login Google e atualização do APK).
2. Painel de IA: Claude Code e Gemini CLI no PC (pelas suas assinaturas), Ollama local.
3. Agenda com Google Agenda.
4. Links `[[ ]]` clicáveis, busca e grafo.
