# Plugins do Tanden (API 1)

Um plugin é **uma página HTML**. Qualquer artefato do Claude já é um plugin: instale pela tela **Plugins** (arquivo `.html` ou "Colar artefato") e ele ganha um botão na barra lateral.

O plugin roda numa janela isolada, sem acesso ao app, à rede ou ao armazenamento dele. Tudo o que ele faz fora da própria tela passa pelo objeto `tanden`, e cada capacidade precisa de uma permissão que você aprova **em cada aparelho**.

## Manifesto

Opcional. Sem ele, o plugin vira um mini-app sem permissões, com o nome do `<title>`.

```html
<script type="application/tanden+json">
{
  "id": "meu-plugin",
  "nome": "Meu plugin",
  "versao": "1.0.0",
  "api": 1,
  "autor": "Girlene",
  "icone": "M",
  "descricao": "O que ele faz, numa frase.",
  "tela": true,
  "fundo": false,
  "permissoes": ["notas:ler", "notas:escrever:Diário/", "rede:*.wikipedia.org", "avisos"]
}
</script>
```

| Campo | |
|---|---|
| `id` | 2 a 40 letras minúsculas, números ou `-`. Identifica o plugin entre aparelhos. |
| `api` | Versão da API que o plugin usa. Um Tanden mais velho recusa a instalação com uma explicação. |
| `tela` | `false` para um plugin só de fundo (sem botão na barra). |
| `fundo` | `true` para rodar desde a abertura do app, mesmo sem a tela aberta (avisos, buscas periódicas). |

## Permissões

| Permissão | O que libera |
|---|---|
| `notas:ler` | `notas.listar`, `notas.ler` |
| `notas:escrever` | `notas.escrever`, `notas.acrescentar`, `notas.recortar` (com `rede`) |
| `rede` | `rede.buscar`, `rede.feed`, `rede.imagem` |
| `avisos` | `avisos.notificar` (até 6 por minuto) |
| `eventos` | `eventos.ouvir` |

Escopos estreitam uma permissão: `notas:ler:Diário/` só lê notas dentro de `Diário/`; `rede:*.exemplo.com` só acessa esse domínio e os subdomínios (redirecionamentos para fora do escopo são recusados). Peça o mínimo: o pedido mostra exatamente o que você escreveu.

Se uma versão nova do plugin pedir permissões a mais, ele para até você aprovar de novo. Permissões já dadas continuam valendo.

## API

Toda chamada devolve uma Promise. Erros (permissão negada, caminho inválido, site fora do ar) chegam como `Error` com a mensagem em português.

```js
// notas (caminhos relativos ao cofre, terminando em .md; pastas ocultas e ".." são recusados)
await tanden.notas.listar('Diário/')            // → ['Diário/2026-10-14.md', ...]
await tanden.notas.ler('Diário/hoje.md')        // → texto ou null
await tanden.notas.escrever('Diário/hoje.md', '# Hoje\n')   // cria ou substitui
await tanden.notas.acrescentar('Diário/hoje.md', '- [ ] tarefa')
await tanden.notas.recortar('https://site/artigo', 'Leituras')  // página → nota com imagens; → caminho

// rede (pelo lado nativo do app, sem CORS; endereços da rede local são recusados)
await tanden.rede.buscar(url)   // → { url, status, tipo, texto }
await tanden.rede.feed(url)     // RSS, Atom ou JSON Feed; aceita o endereço do site → { url, feed: { titulo, site, descricao, itens } }
await tanden.rede.imagem(url)   // → 'data:image/...' (a janela só mostra imagens embutidas)

// avisos
await tanden.avisos.notificar('Título', 'texto')

// dados do próprio plugin, neste aparelho (sem permissão)
await tanden.dados.gravar('chave', { qualquer: 'coisa' })
await tanden.dados.ler('chave')
await tanden.dados.apagar('chave')
await tanden.dados.chaves()

// app (sem permissão)
await tanden.app.abrirNota('Diário/hoje.md')
await tanden.app.abrirLink('https://...')    // no navegador do sistema
await tanden.app.selo(3)                     // número no botão do plugin; 0 apaga
await tanden.app.info()                      // → { api, id, permissoes }

// eventos do app (note.created, note.changed, sync.finished, reminder.fired...)
const parar = tanden.eventos.ouvir((e) => console.log(e.type, e.path))

// tema e visibilidade
tanden.tema()                   // → { vars, escuro, movimento, destaque }
tanden.aoMudarTema((t) => ...)  // as cores também já viram variáveis CSS: var(--ember), var(--surface)...
tanden.aoMostrar((visivel) => ...)  // a tela do plugin apareceu ou foi escondida
```

Itens de feed: `{ id, titulo, link, resumo, data, autor, imagem }`. O `resumo` é texto puro (o HTML do site é removido); `data` é em milissegundos (0 quando o feed não informa).

## Variáveis de tema

`--void` (fundo), `--surface`, `--surface-2`, `--line`, `--ink` (texto), `--muted`, `--silver`, `--ember` (destaque), `--ember-soft`, `--ember-glow`, `--on-ember`, `--ok`, `--crit`, `--dur`, `--ease`, `--spring`. O atributo `data-theme` (`dark`/`light`) e `data-motion` (`completo`/`reduzido`/`parado`) ficam no `<html>`.

## O que a janela pode e não pode

- Pode: scripts e estilos do próprio HTML; bibliotecas de `cdnjs.cloudflare.com`, `cdn.jsdelivr.net` e `unpkg.com`; Google Fonts; `alert`/`confirm`; baixar arquivos que ela mesma gera.
- Não pode: `fetch` direto, imagens de fora, formulários, cookies, `localStorage`, acesso à janela do app ou aos comandos nativos. Se a página navegar para outro endereço, ela é fechada.

## Onde ficam

- Embutidos: vêm com o app (`apps/tanden/src/plugins/`). O primeiro é o **Notícias**.
- Instalados: `Plugins/<id>.html` no cofre, sincronizados com os outros aparelhos, desligados lá até você permitir.
- Dados (`tanden.dados`): no aparelho.

## Como funciona por dentro

- `packages/core/src/plugins/`: manifesto e permissões (`manifest.ts`), o host que confere cada chamada (`host.ts`) e o SDK injetado na janela (`sdk.ts`). Testes em `packages/core/test/plugins.test.ts`.
- `apps/tanden/src/lib/plugins/`: registro, aprovação e a janela (`<iframe sandbox="allow-scripts">`).
- No app instalado, a página é servida por `tplugin://localhost/<id>` (`src-tauri/src/plugin.rs`), uma origem separada da do app. No navegador, vai por `srcdoc`. Nos dois casos a política de segurança vai no topo do documento, antes de qualquer script do plugin.
