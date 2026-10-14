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

## Próximos passos (fase 1)

1. Sync direto com o Google Drive (API), com a pasta visível no seu Drive.
2. Build para Android.
3. Painel de IA: Claude Code e Gemini CLI no PC (pelas suas assinaturas), Ollama local.
4. Agenda com Google Agenda.
5. Links `[[ ]]` clicáveis, busca e grafo.
