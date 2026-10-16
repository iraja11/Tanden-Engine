# AGENTS.md — como trabalhar no Tanden Engine

Guia curto e operacional para agentes de IA (e humanos) que forem mexer neste
repositório. Leia isto **antes** de explorar o código. Para a visão de
arquitetura, veja [architecture.md](architecture.md).

---

## Comandos

Requisitos: Node 22+, pnpm 10+, Rust estável.

```bash
pnpm install                  # instala tudo (workspaces)
pnpm test                     # testes do núcleo (Vitest) — sempre rode antes de commitar
pnpm typecheck                # tsc no núcleo + svelte-check no app
pnpm dev                      # app web em http://localhost:1420

# app de desktop (a partir da raiz, ou dentro de apps/tanden sem --filter)
pnpm --filter @tanden/app tauri dev
pnpm --filter @tanden/app tauri build

# escopos
pnpm --filter @tanden/core test          # só o núcleo
pnpm --filter @tanden/app typecheck      # só o app
pnpm --filter @tanden/core test -- vault # um arquivo de teste
```

Rust: `cargo check` dentro de `apps/tanden/src-tauri` (o app web **não** precisa
do Rust; só o lado Tauri).

---

## Mapa do repositório (resumo)

| Caminho | O que é |
|---|---|
| `packages/core/` | `@tanden/core` — o núcleo em TypeScript (cofre, CRDT, sync, domínios). Sem Svelte, sem Tauri. |
| `packages/core/src/index.ts` | API pública do núcleo. **Exporte aqui** o que a interface precisa. |
| `packages/core/test/` | Testes do núcleo (Vitest). Um arquivo por domínio. |
| `apps/tanden/src/` | Interface (Svelte 5 + Vite). `App.svelte` é a casca. |
| `apps/tanden/src/lib/` | Telas e stores (`*.svelte.ts`), uma pasta por módulo. |
| `apps/tanden/src-tauri/` | Lado nativo (Rust). Só E/S e recursos do sistema. |
| `docs/` | Documentação (funcionalidades, configuração, plugins). |

O documento [architecture.md](architecture.md) tem o mapa completo e as camadas.

---

## Regras de ouro (não quebrar)

1. **Lógica de domínio vai no núcleo.** A interface mostra e chama; ela não
   reimplementa merge, parsing ou conversão.
2. **Um aparelho só escreve os próprios arquivos em `.tanden/`.** O merge é feito
   na leitura (CRDT). Nunca faça dois aparelhos escreverem o mesmo arquivo.
3. **Nunca mude o formato dos arquivos do usuário.** Notas são `.md`, quadros
   `.canvas`, planilhas `.xlsx`; o Obsidian tem de continuar abrindo tudo.
4. **O núcleo não importa Svelte nem o Tauri.** Se precisar de DOM, receba um
   `ParseHtml` por parâmetro (`convert/dom.ts`).
5. **O Rust nunca escreve fora da pasta do cofre** (use `vault.rs::resolve`).
6. **Comentários e textos de interface em português.** Identificadores técnicos
   em inglês quando fizer sentido.

---

## Onde mexer (receitas)

- **Nova tela:** pasta em `apps/tanden/src/lib/<nome>/` com `<Nome>View.svelte` e
  um store `<nome>.svelte.ts` (`$state` + `start()`); adicione ao tipo `View` e a
  `modules` em `App.svelte`, e chame `start()` num `$effect` com `engine.ready`.
- **Nova lógica/domínio:** `packages/core/src/<dominio>/` com `index.ts` + testes
  em `packages/core/test/<dominio>.test.ts`; exporte em `packages/core/src/index.ts`.
- **Documento novo com merge:** copie o desenho de `board.ts` / `sheet/` (arquivo
  CRDT por aparelho, lápides por geração, `sync(opts?)`), implemente `Syncable`
  e registre no array passado a `fullSync` em `apps/tanden/src/lib/engine.svelte.ts`.
- **Comando da paleta:** registre em `apps/tanden/src/lib/app-commands.ts`.
- **Evento novo:** acrescente a `TandenEvent` em `packages/core/src/events.ts`,
  emita pelo `bus`, e reaja em `engine.onEvent`.

---

## Convenções de código

- TypeScript estrito (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`. Sem `any` gratuito.
- Estores de interface: singleton `export const x = new X()` no fim do módulo,
  estado em campos `$state`, `start()` idempotente.
- Importe tipos com `import type` (verbatimModuleSyntax).
- Prefira arquivos pequenos e coesos; um `index.ts` por domínio do núcleo.
- Antes de terminar: `pnpm test` e `pnpm typecheck` passando.

---

## Testes

- Núcleo: Vitest. Use `MemoryStorage` (`storage.ts`) ou `NodeFsStorage`
  (`node.ts`) nos testes; `test/fake-drive.ts` simula o `RemoteStore`. Casos de
  merge e de sincronização estão em `test/vault.test.ts` e `test/replicator.test.ts`.
- Sem testes de UI automatizados. Em modo dev, `globalThis.__tanden` expõe o
  `engine` para inspeção manual.
- Mudança no núcleo quase sempre pede um teste em `packages/core/test/`.

---

## Armadilhas

- **Não edite `.tanden/` na mão** — é o histórico de merge. Para recomeçar, apague
  a pasta inteira do cofre.
- **`dist/`, `target/`, `node_modules/`** são ignorados; não commite build.
- **`TANDEN_VAULT`** troca a pasta do cofre (útil em dev para não mexer nas notas
  reais): `TANDEN_VAULT=/tmp/cofre pnpm dev`.
- A CSP e as `capabilities/` do Tauri são restritas de propósito; não afrouxe sem
  necessidade.
- Textos de interface são em português — mantenha o tom e o idioma.
