# Arquitetura do Tanden Engine

Documento de referência para quem (humano ou agente de IA) vai ler, manter ou
estender o código. Explica **como as peças se encaixam** e **onde mexer**.
Para usar o app, veja o [README](README.md); para as funções, veja
[docs/funcionalidades.md](docs/funcionalidades.md); para configuração
(Drive, Android, releases), veja [docs/configuracao.md](docs/configuracao.md).

---

## 1. O que é

Um "super app" pessoal: notas Markdown compatíveis com Obsidian, mais cadernos,
RPG, slides, planilhas, cálculo, bases de dados, flashcards, leitura de PDFs e
IA — tudo sincronizado entre Linux, Windows, Android e web.

Dois princípios guiam todo o código:

1. **Os dados são arquivos comuns.** Notas são `.md`, quadros `.canvas`,
   planilhas `.xlsx`, apresentações `.md`. O Obsidian abre a mesma pasta. O
   Tanden nunca inventa um formato fechado; o que ele acrescenta (metadados de
   merge, tipo do quadro, anotações de PDF) mora em `.tanden/` ou em campos que
   o Obsidian ignora.
2. **Um aparelho só escreve os arquivos dele.** Nada de "lock" no arquivo
   compartilhado. Cada aparelho grava o próprio histórico em `.tanden/` e os
   textos são fundidos ao ler, com CRDT (Yjs). Sem conflito, sem perder nada.

---

## 2. Camadas

```
┌───────────────────────────────────────────────────────────────────┐
│  apps/tanden  —  interface (Svelte 5 + Vite + Tauri)               │
│  telas, editor, stores ($state), veias/pulsos, sons, temas         │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ eventos (EventBus)            │ chamadas de API
                │                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  packages/core  —  @tanden/core (TypeScript, sem interface)        │
│  cofre + CRDT, sync, índice, e cada domínio (notas, sheet, rpg...) │
└───────────────▲───────────────────────────────┬───────────────────┘
                │ Storage (interface)           │ RemoteStore (interface)
   ┌────────────┴───────────┐        ┌──────────┴───────────────┐
   │ Tauri (Rust, no disco) │        │ Google Drive (REST v3)   │
   │ / IndexedDB (web)      │        │                          │
   └────────────────────────┘        └──────────────────────────┘
```

- **`packages/core`** é puro TypeScript, testável em Node, e **não depende de
  Svelte nem do Tauri**. Ele recebe um `Storage` e devolve dados/eventos. É
  aqui que mora praticamente toda a lógica.
- **`apps/tanden`** é a casca: desenha as telas, guarda estado de interface em
  stores `$state`, e liga o núcleo ao disco (Tauri) ou ao navegador (IndexedDB).
- **`apps/tanden/src-tauri`** é o lado nativo: leitura/escrita de arquivos
  presa à pasta do cofre, vigia de arquivos, terminal (PTY), OAuth do Google,
  janelas de plugin e o recortador do navegador.

Regra de ouro: **lógica nova vai no núcleo**; a interface só mostra e chama.

---

## 3. Estrutura do repositório

```
tanden-engine/
├── architecture.md            este documento
├── AGENTS.md                  guia de operação para agentes de IA
├── README.md                  visão geral e por onde começar
├── docs/
│   ├── README.md              índice da documentação
│   ├── funcionalidades.md     o que cada tela faz (guia do usuário)
│   ├── configuracao.md        Drive, Android, atualização, dependências
│   └── plugins.md             API de plugins (manifesto e permissões)
├── packages/
│   └── core/                  @tanden/core — o núcleo (TypeScript)
│       ├── src/               código
│       └── test/              testes (Vitest)
├── apps/
│   └── tanden/                app Svelte + Vite + Tauri
│       ├── src/               interface
│       │   ├── App.svelte     casca: barra lateral, roteamento de telas
│       │   ├── main.ts        bootstrap (tema + mount)
│       │   ├── plugins/       plugins embutidos (ex.: noticias.html)
│       │   └── lib/           telas, stores e utilidades (ver §8)
│       └── src-tauri/         lado nativo (Rust)
├── scripts/ci-config.mjs      gera a config do build de release
└── .github/workflows/         CI de release (Linux, Windows, Android)
```

Workspaces pnpm: `packages/*` e `apps/*` (`pnpm-workspace.yaml`). O app depende
do núcleo por `"@tanden/core": "workspace:*"` e importa direto do TypeScript-fonte
(`main: src/index.ts`), sem passo de build intermediário.

---

## 4. O núcleo (`packages/core/src`)

A API pública é o `src/index.ts`; o resto é interno. Arquivos raiz:

| Arquivo | Papel |
|---|---|
| `index.ts` | Superfície pública do `@tanden/core`. |
| `vault.ts` | Cofre de notas: `.md`, CRDT (Yjs), merge, gerações e lápides, lixeira. |
| `events.ts` | `EventBus` — o "sistema nervoso" (`note.changed`, `sync.finished`…). |
| `storage.ts` | Interface `Storage` + `MemoryStorage` (testes) + helpers de bytes. |
| `node.ts` | `NodeFsStorage` — `Storage` em disco (testes e dev). |
| `hash.ts` | Hashes e `clientIdFor` (clientID determinístico do Yjs). |
| `replicator.ts` | Replicação arquivo a arquivo local⇄remoto; interface `RemoteStore`. |
| `sync.ts` | `fullSync` — o ciclo completo (funde local, troca com o Drive, funde de novo). |
| `drive.ts` | `DriveRemote` — Google Drive como pasta remota (REST v3). |
| `knowledge.ts` | Índice do cofre: `[[links]]`, tags, tarefas, títulos, blocos, backlinks. |
| `search.ts` | Busca com os operadores do Obsidian (`tag:`, `path:`, `-termo`, `/regex/`). |
| `board.ts` | Quadros `.canvas` (JSON Canvas) com merge por campo. |
| `annotations.ts` | Anotações de PDF (não reescrevem o PDF); `pdf-export.ts` exporta o PDF anotado. |
| `library.ts` | Biblioteca de PDFs: status, estantes, posição, marcadores. |
| `files.ts` | Tipos de arquivo, `fileKind`, caminhos livres, conversão para nota. |
| `webclip.ts` | Recorte de páginas web (texto, imagens, destaques, modelos). |
| `reminders.ts` | Formato e agenda de lembretes (formato Reminder/Tasks do Obsidian). |
| `quick-reminder.ts` | Parser em português de lembretes rápidos ("amanhã 9h comprar pão"). |
| `flashcards.ts` | Flashcards e agendamento SM-2. |
| `hotkeys.ts` | `comboOf` / `normalizeCombo` (atalhos de teclado). |
| `feed.ts` | Leitura de feeds RSS / Atom / JSON Feed. |

Domínios em subpastas (cada um exporta por um `index.ts`):

| Pasta | Domínio |
|---|---|
| `caderno/` | Cadernos de jogos de luta e de world building (frontmatter, `luta`, `mundo`). |
| `calc/` | Cálculo: linguagem, numérico, simbólico, gráficos, formatação, folhas. |
| `sheet/` | Planilhas `.xlsx`/`.ods`/`.csv`: fórmula, funções, valores, workbook, store. |
| `slides/` | Apresentações: deck, modelo, aparência, exportação `.pptx`/`.odp`/PDF. |
| `base/` | Bancos de dados estilo Notion (formato Bases do Obsidian): modelo, query, expr, templates, árvore. |
| `graph/` | Grafo de notas: links, layout de força, conversões (grafo⇄quadro⇄mapa⇄nota). |
| `convert/` | Conversões de arquivo (docx, odt, odp, pptx, epub, HTML⇄Markdown, texto de PDF, `dom`, `xml-lite`). |
| `rpg/` | Mesa de RPG: dados, fichas, combate, tabelas de rolagem, campanhas. |
| `saude/` | Saúde: água/pausas, biblioteca de exercícios, planner/treino. |
| `vida/` | Tela Hoje: tarefas, projetos, hábitos, metas, diário, revisão semanal. |
| `plugins/` | Plugins: manifesto/permissões, host que confere chamadas, SDK injetado. |

> O núcleo roda em Node e no navegador. Ele **não** cria um `DOMParser` próprio:
> quem precisa de DOM recebe `ParseHtml` por parâmetro (`convert/dom.ts`); o app
> passa o `DOMParser` do navegador e os testes passam o do `linkedom`.

---

## 5. Armazenamento e modelo de dados

### A interface `Storage`

Tudo passa por `Storage` (`storage.ts`): `list`, `read`, `write`, `remove` e um
`stat()` opcional (assinatura + mtime) para o replicador não reler arquivos que
não mudaram. Implementações: `MemoryStorage` (testes), `NodeFsStorage` (dev/testes),
`TauriStorage` (app; bytes crus por IPC, exceto no Android, que usa base64) e
`BrowserStorage` (web, IndexedDB).

### Layout do cofre

```
**/*.md                                  notas (Obsidian lê igual)
**/*.canvas                              quadros (JSON Canvas)
**/*.xlsx                                planilhas
.tanden/crdt/<nota>/<aparelho>.bin       estado CRDT de cada aparelho
.tanden/crdt/<nota>/<aparelho>.json      o que cada aparelho escreveu no .md
.tanden/crdt/<nota>/del/<aparelho>.json  lápides (notas apagadas, por geração)
.tanden/board/<quadro>/...               o mesmo, para quadros .canvas
.tanden/sheet/<planilha>/...             o mesmo, para planilhas
.tanden/annot/<pdf>/<aparelho>.bin       anotações de PDF
.tanden/library/<aparelho>.bin           biblioteca de PDFs (status, posição, marcadores)
.tanden/local/<aparelho>/versoes/        histórico de versões (só neste aparelho)
.trash/                                  cópias de notas apagadas (lixeira do Obsidian)
```

O nome de pasta dentro de `.tanden/` é `hashHex(path)` (ver `hash.ts`), para
caber qualquer caminho. Pastas começando com `.` não contêm notas.

---

## 6. Merge e sincronização

Esta é a parte mais delicada do projeto.

### `Vault` (`vault.ts`) — merge das notas

- Cada nota tem um documento **Yjs** (CRDT) com `gc` desligado, para reconstruir
  versões antigas. O `.md` é o "espelho" legível; o `.bin` é o estado CRDT.
- **Cada aparelho só escreve os próprios arquivos** em `.tanden/crdt/<nota>/`.
  Ao sincronizar, o Vault lê o histórico de todos e funde (sem disputa).
- **Edição externa** (Obsidian, editor do Drive): o Vault compara o `.md` com o
  que os aparelhos declararam ter escrito. A diferença vira operações CRDT sobre
  a versão de onde partiu, com **clientID determinístico** — se dois aparelhos
  detectarem a mesma edição externa, geram operações idênticas e o texto não
  duplica.
- **Apagar** usa **gerações + lápides**. Cada nota tem uma `gen`; quem apaga
  grava uma lápide com as gerações que viu e o vetor de estado do momento. Uma
  edição concorrente (que a lápide não viu) ressuscita a nota. Recriar no mesmo
  caminho começa uma geração nova.
- **Robustez:** se mais de `MASS_REMOVAL` (20) notas somem de uma vez, nada é
  apagado (parece pasta desmontada). Um `.md` apagado por fora vira apagar de
  verdade, com cópia em `.trash/`.

### `Replicator` (`replicator.ts`) + `RemoteStore` — troca de arquivos

O replicador **não entende de notas**: mantém a pasta local e a remota iguais,
arquivo a arquivo, com regras para nunca perder dados:

- Arquivos deste aparelho em `.tanden/<tipo>/` só **sobem**; os dos outros só
  **descem**. `.tanden/local/` nunca sai do aparelho.
- `.md`/`.canvas`/`.xlsx` são espelhos compartilhados: se só um lado mudou, ele
  vence; se os dois mudaram, **desce a versão remota** (o CRDT guarda o que este
  aparelho escreveu e o Vault absorve a remota no próximo passo).
- Arquivo apagado aqui e intocado lá vai para a lixeira do remoto; se mudou lá,
  desce de novo. Sumiço em massa local não apaga nada no remoto.

### `fullSync` (`sync.ts`) — o ciclo inteiro

1. Funde o que já está na pasta local (`vault.sync()` + os `Syncable` extras:
   `BoardStore`, `SheetStore`, `AnnotationStore`, `LibraryStore`).
2. Baixa do remoto (`replicator.sync()`).
3. Funde o que chegou (o Vault recebe `downloaded` e as versões anteriores vindo
   do `remote.history`, para o merge de três vias).
4. Envia o resultado se algo mudou.

`DriveRemote` (`drive.ts`) é a implementação de `RemoteStore` para o Google
Drive: tudo dentro de uma pasta `Tanden`, cada arquivo com `appProperties`
`{ tandenVault, tandenPath }` para listar o cofre numa consulta só. Escopo OAuth
`drive.file` (o app só vê o que criou). Arquivos grandes usam envio resumable.

### Store por domínio

`BoardStore`, `SheetStore`, `AnnotationStore` e `LibraryStore` seguem o mesmo
desenho do `Vault`: um arquivo CRDT por aparelho, lápides por geração e um
`sync(opts?)` que devolve `{ written }`. Por isso `Syncable` é a interface que
`fullSync` usa para tratá-los de forma uniforme. O estado do `board.ts` é "por
campo" (mover uma caixa e editar o texto de outra, em aparelhos diferentes, não
conflita).

---

## 7. Eventos — o sistema nervoso

`EventBus` (`events.ts`) é um canal tipado. A interface assina `bus.on('*', …)`
e reage; as automações e plugins escutam os mesmos eventos.

Eventos: `note.created` / `note.changed` / `note.deleted` (com `origin:
'local' | 'remote' | 'external'`), `board.*`, `sheet.changed`, `annot.changed`,
`library.changed`, `file.imported`, `process.started` / `process.finished`,
`sync.finished`, `reminder.fired`.

- Um ouvinte que falha **não** derruba os outros nem quem emitiu.
- `bus.process(id, label, work)` embrulha um trabalho longo em
  `process.started`/`finished` — é o que faz as veias fluírem.
- `origin` distingue o que o usuário acabou de digitar (`local`) do que chegou
  de outro aparelho (`remote`) ou de fora do app (`external`).

---

## 8. A interface (`apps/tanden/src`)

### Bootstrap e casca

- `main.ts` aplica o tema antes da primeira pintura e monta `App.svelte`.
- `App.svelte` é a casca: barra lateral, o marcador que desliza até a tela ativa,
  os painéis (`Palette`, `SearchPanel`, `ExplorePanel`, `SettingsPanel`,
  `DrivePanel`, `AiPanel`, `RemindersPanel`) e a troca de telas. O tipo `View`
  lista todas as telas; telas de plugin entram como `plugin:<id>`.

### Padrão de store (`*.svelte.ts`)

O estado de interface mora em singletons exportados no fim do módulo
(`export const notes = new Notes()`), com campos `$state`. Telas leem daí. Um
`start()` idempotente liga o store (sincroniza, registra comandos, escuta
eventos) quando o `engine.ready` fica verdadeiro — ver os `$effect` em `App.svelte`.

O **`engine`** (`lib/engine.svelte.ts`) é o store raiz: cria `Vault`, `Boards`,
`Sheets`, `Annots`, `Library` sobre o `Storage` certo, conecta o Drive, escuta
`bus.on('*')` e expõe `notes`, `active`, `content`, `running`, `pulses`, etc.
O editor chama `engine.edit(text)`, que grava e agenda um sync após 1,5 s de
pausa. `settings`/`theme`/`sound`/`feel` são por aparelho (localStorage).

### Mapa de `lib/`

Cada pasta costuma ter a(s) tela(s) `.svelte`, o store `.svelte.ts` e a lógica de
interface; a lógica de domínio vem de `@tanden/core`.

| Pasta / arquivo | Tela ou papel |
|---|---|
| `engine.svelte.ts` | Store raiz; liga núcleo, sync e eventos à interface. |
| `editor/` | Editor de notas (CodeMirror): `NotePage`, `Editor`, prévia ao vivo, blocos, tabelas, menu `/`, paleta, busca, histórico de versões, painel lateral. |
| `bases/` | Bancos estilo Notion: tabela, quadro, galeria, lista, calendário, linha do tempo, propriedades, filtros. |
| `grafo/` | Tela Grafo (`GraphView`) e o canvas. |
| `quadro/` | Tela Quadros (`Quadro.svelte`): mapa mental, workflow, desenho. |
| `sheets/` | Planilhas (`SheetsView`, `Grid`, `Chart`). |
| `calc/` | Cálculo: `CalcView`, gráficos 2D/3D, KaTeX. |
| `slides/` | Apresentações (`SlidesView`, `Presenter`, `Slide`). |
| `biblioteca/` | Biblioteca de PDFs. |
| `pdf/` | Leitor de PDF (`PdfView`, `PdfPage`). |
| `files/` | Arquivos, importação, ferramentas da nota, recorte de web. |
| `cadernos/` | Cadernos de luta (`LutaView`) e mundos (`MundoView`). |
| `rpg/` | Mesa (`MesaView`, bandeja de dados, combate, fichas, sessões, tabelas). |
| `vida/` | Tela Hoje. |
| `saude/` | Saúde (água, pausas, treino). |
| `flashcards/` | Flashcards (baralhos e estudo). |
| `plugins/` | Registro, aprovação e a janela (`<iframe sandbox>`) dos plugins. |
| `settings/` | Atalhos e snippets. |
| `theme.svelte.ts`, `sound.svelte.ts`, `feel.svelte.ts`, `motion.ts`, `Orb.svelte`, `Splash.svelte`, `Veins.svelte` | Aparência, sons, gestos do símbolo e as veias/pulsos. |
| `commands.svelte.ts`, `app-commands.ts`, `embeds.ts`, `platform.ts` | Paleta/comandos, embeds, detecção de plataforma. |
| `storage-tauri.ts`, `storage-browser.ts` | `Storage` do app (Tauri e web). |
| `google.svelte.ts`, `ollama.svelte.ts`, `updater.svelte.ts`, `reminders.svelte.ts`, `snippets.svelte.ts` | Integrações e serviços do app. |

O `AiPanel.svelte` roda Claude Code, Gemini CLI, Ollama e um terminal comum
(PTY), já na pasta do cofre.

---

## 9. Camada nativa (`apps/tanden/src-tauri`, Rust)

O Rust **não** tem lógica de notas: só expõe o que o sistema oferece, sempre
preso à pasta do cofre. Arquivos de `src/`:

| Arquivo | Papel |
|---|---|
| `lib.rs` | Monta o `Builder` do Tauri, os plugins, o esquema `tplugin://` e a lista de comandos. |
| `main.rs` | Ponto de entrada (`run()`). |
| `vault.rs` | Comandos da pasta do cofre (`vault_list/read/write/remove/stat`), com `resolve` que recusa sair da raiz. Escrita atômica (tmp + rename). |
| `watch.rs` | Vigia de arquivos; emite `vault-changed` quando algo muda por fora. |
| `background.rs` | Bandeja, "abrir com o sistema" e janela oculta. |
| `pty.rs` | Terminal (PTY) para o painel IA. |
| `google.rs` | OAuth do Google Drive e refresh do token. |
| `ollama.rs` | Chamadas ao Ollama local. |
| `web.rs` | `web_fetch` / `web_open` (buscar páginas sem CORS, abrir no navegador). |
| `plugin.rs` | Serve as páginas de plugin em `tplugin://localhost/<id>`. |
| `clipper.rs` | Recortador do navegador (escuta em `127.0.0.1`, com chave própria). |
| `release.rs` | Informações de release e checagem do APK. |

Configuração em `src-tauri/tauri.conf.json` (janela, CSP, bundle, updater). A CSP
restringe `connect-src`/`frame-src` de propósito; plugins só rodam em `tplugin:`.
`capabilities/` limita o que a interface pode chamar. `gen/android/` é o projeto
Android (compilado no CI).

---

## 10. Build, testes e release

- **Toolchain:** Node 22+, pnpm 10+, Rust estável.
- **Scripts da raiz** (`package.json`): `pnpm test` (`pnpm -r test`),
  `pnpm typecheck` (`pnpm -r typecheck`), `pnpm dev` e `pnpm build` (filtram
  `@tanden/app`).
- **Testes:** Vitest, em `packages/core/test/` (um arquivo por domínio: `vault`,
  `board`, `sheet`, `rpg`, `caderno`, `slides`, `calc`, `base`, `saude`, `vida`,
  `flashcards`, `knowledge`, `search`…). A interface é checada por tipo com
  `svelte-check`; não há testes de UI automatizados, mas `import.meta.env.DEV`
  expõe `globalThis.__tanden` para testes manuais.
- **Release (`.github/workflows/release.yml`):** cada push em `main`/`master`
  monta uma matriz Linux + Windows (Tauri) e um job Android (APK), publica uma
  release no GitHub e o `latest.json`/`android.json` que o app instalado consulta
  para se atualizar. `scripts/ci-config.mjs` gera `tauri.ci.conf.json` com a
  versão da execução e a chave pública do updater.

Detalhes de configuração (Drive, Android, chaves, dependências do Arch) em
[docs/configuracao.md](docs/configuracao.md).

---

## 11. Convenções e invariantes

**Invariantes (não quebrar):**

1. Um aparelho só escreve os próprios arquivos em `.tanden/`; o merge é sempre na
   leitura.
2. Nada reescreve um arquivo que o usuário pode abrir em outro app sem manter o
   formato padrão (`.md`, `.canvas`, `.xlsx`).
3. Apagar é reversível (`.trash/`) e protegido contra sumiço em massa.
4. O núcleo não importa Svelte nem Tauri; a interface não reimplementa lógica de
   domínio.
5. O Rust nunca escreve fora da pasta do cofre.

**Estilo:**

- Comentários e textos de interface em **português**; identificadores em inglês
  quando o termo é técnico, português nos pontos de domínio.
- Prefira módulos pequenos e coesos, com um `index.ts` por domínio que reexporta
  a API pública. Tudo que a interface usa precisa sair pelo `src/index.ts` do
  núcleo.
- TypeScript estrito (`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`).
- Sem dependências novas no núcleo sem necessidade; o núcleo é o que mais pesa.

---

## 12. Como estender

- **Nova tela:** crie a pasta em `apps/tanden/src/lib/<nome>/` com
  `<Nome>View.svelte` e um `<nome>.svelte.ts` (store `$state` + `start()`), some
  ao tipo `View` e a `modules` em `App.svelte`, e ligue o `start()` num `$effect`
  com `engine.ready`. Se a tela grava dados, registre um `Syncable` no `engine`.
- **Nova lógica de domínio:** crie `packages/core/src/<dominio>/` com
  `index.ts` e testes em `packages/core/test/<dominio>.test.ts`; exporte a API
  pública em `packages/core/src/index.ts`.
- **Novo tipo de documento com merge próprio:** siga o padrão de `BoardStore` /
  `SheetStore` (arquivo CRDT por aparelho, lápides por geração, `sync(opts?)`),
  implemente `Syncable` e acrescente ao array passado a `fullSync` no `engine`.
- **Novo comando da paleta / atalho:** registre em `app-commands.ts` (comando
  `{ id, label, hotkeys?, when?, run }`); o usuário pode trocar o atalho.
- **Nova conversão de arquivo:** `packages/core/src/convert/` (receba `ParseHtml`
  em vez de criar DOM) e exporte em `convert/export.ts` + `index.ts`.
- **Novo evento:** acrescente ao tipo `TandenEvent` em `events.ts` e emita pelo
  `bus`. A interface reage em `engine.onEvent`.

---

## 13. Próximos passos (fase 1)

1. Agenda com Google Agenda.
2. Ferramentas do Tanden para a IA via MCP (buscar, criar e ligar notas, mexer
   na agenda).
