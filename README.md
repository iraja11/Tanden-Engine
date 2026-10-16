# Tanden Engine

Super app pessoal: notas, IA, agenda, planilhas e muito mais, sincronizados
entre Android, Linux, Windows e web.

**Versão 0.1 (fase 1, fundação).** Por enquanto: cofre de notas Markdown
compatível com o Obsidian, merge automático entre aparelhos, editor e a
interface Núcleo (símbolo tanden e veias).

## Por onde começar

| Documento | O que tem |
|---|---|
| [architecture.md](architecture.md) | Como o projeto é feito: camadas, núcleo, merge/sync, eventos, camada nativa. |
| [AGENTS.md](AGENTS.md) | Guia de operação para agentes de IA (e humanos): comandos, mapa, regras. |
| [docs/funcionalidades.md](docs/funcionalidades.md) | O que cada tela e recurso faz. |
| [docs/configuracao.md](docs/configuracao.md) | Rodar, Google Drive, Android, atualização automática. |
| [docs/plugins.md](docs/plugins.md) | API de plugins (manifesto e permissões). |
| [docs/](docs/README.md) | Índice de toda a documentação. |

## Estrutura

```
packages/core     núcleo em TypeScript: cofre, merge (CRDT), eventos. Sem interface.
apps/tanden       app (Svelte + Vite) e o lado nativo (src-tauri, Rust)
```

## Rodar

Requisitos: Node 22+, pnpm 10+, Rust estável.

```bash
pnpm install
pnpm test                              # testes do núcleo
pnpm dev                               # versão web em http://localhost:1420
pnpm --filter @tanden/app tauri dev     # app de desktop
pnpm --filter @tanden/app tauri build   # gera AppImage/deb (Linux) ou instalador (Windows)
```

No **Arch Linux**, as bibliotecas do Tauri:

```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool gst-plugins-base gst-plugins-good
```

As notas ficam em `~/Tanden` (mude com `TANDEN_VAULT=/outra/pasta`) ou, na web,
no navegador. A pasta é um cofre comum do Obsidian: pode abrir a mesma pasta
nele. O layout completo está em [architecture.md](architecture.md#5-armazenamento-e-modelo-de-dados).

## Próximos passos (fase 1)

1. Agenda com Google Agenda.
2. Ferramentas do Tanden para a IA via MCP (buscar, criar e ligar notas, mexer na agenda).
