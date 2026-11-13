# Sistema de design do Tanden

Como a interface é desenhada: tokens, componentes base e regras para o celular.
Vale para telas novas e para quem for mexer nas antigas. A meta é que tudo
pareça a mesma peça, em qualquer tema e de 320px até o monitor grande.

Arquivos:

| Arquivo | O que tem |
|---|---|
| `apps/tanden/src/styles.css` | Tokens (cores do tema Núcleo e as escalas). |
| `apps/tanden/src/lib/theme.svelte.ts` | Reescreve as **cores** conforme o tema e marca o `<html>` com o estilo e as peças de forma (`data-skin`, `data-corners`…). |
| `apps/tanden/src/ui.css` | Componentes base globais, com prefixo `t-`. |
| `apps/tanden/src/skins.css` | Os estilos (Aero, Terminal, Papel) e as peças de forma: cantos, bordas, sombras, textura, papel de parede, vidro. |
| `apps/tanden/src/lib/ui/Icon.svelte` | Ícones de traço (24×24, `currentColor`). |

---

## 1. Tokens

### Cor (mudam com o tema)

| Token | Uso |
|---|---|
| `--void` | Fundo do app e dos campos. |
| `--surface`, `--surface-2` | Painéis e cartões; `-2` para botões e hover. |
| `--line` | Bordas e divisórias. |
| `--ink`, `--silver`, `--muted` | Texto principal, secundário forte, apagado. |
| `--ember`, `--ember-soft`, `--ember-glow`, `--on-ember` | Destaque (a cor escolhida no tema), texto de destaque, brilho, texto sobre o destaque. |
| `--ok`, `--crit` | Sucesso e erro. |
| `--shadow`, `--scrim` | Sombras e o véu atrás de diálogos. |

Nunca escreva uma cor fixa para fundo, texto ou borda: use os tokens, senão o
tema claro (Papel, Gelo) quebra. Cores de **categoria** (tipos de ficha, facções)
podem ser fixas, como em `cadernos/tipos.ts`.

### Escalas (fixas)

| Grupo | Tokens |
|---|---|
| Espaço | `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 |
| Raio | `--r-sm` 7 · `--r-md` 10 · `--r-lg` 14 (cartões) · `--r-xl` 18 (folhas) · `--r-pill` |
| Texto | `--fs-xs` 11 · `--fs-sm` 12.5 · `--fs-md` 14 · `--fs-lg` 16 · `--fs-xl` 20 · `--fs-2xl` 26 |
| Controles | `--h-sm` 28 · `--h-md` 34 · `--h-lg` 40 (no toque: 34 · 40 · 46) |
| Margem da tela | `--gutter` 28 (16 no celular) |
| Sombra | `--elev-1` (relevo sutil) · `--elev-2` (menus, toasts) · `--elev-3` (diálogos) |
| Camadas | `--z-dock` · `--z-drawer` · `--z-scrim` · `--z-toast` |
| Movimento | `--dur`, `--dur-slow`, `--ease`, `--spring` (o tema "parado" zera tudo) |

As alturas de controle crescem sozinhas em telas de toque (`pointer: coarse`), então
um botão `t-btn` já tem alvo de dedo no celular sem CSS extra.

### Tipografia

- `--f-display` (Chakra Petch): títulos, rótulos de seção em caixa alta, números grandes.
- `--f-body` (Manrope, ou a letra escolhida no tema): texto, botões, campos.
- `--f-mono` (JetBrains Mono): contagens, datas, código, a barra de status.

Rótulo de seção: `.t-eyebrow` (10.5px, caixa alta, espaçado, `--muted`).

---

### Estilos e peças de forma (`skins.css`)

Além das cores, o tema marca o `<html>` com atributos que o `skins.css` desenha:

| Atributo | Valores |
|---|---|
| `data-skin` | `tanden`, `aero`, `terminal`, `papel` |
| `data-corners` | `redondos`, `retos` (zera todo `border-radius`), `mao` (contorno torto nos `t-*` e diálogos) |
| `data-borders` | `finas`, `grossas` (toda borda existente vira 2px) |
| `data-shadows` | `suaves`, `nenhuma` (zera `--shadow` e `--elev-*`), `solidas` (sombra dura deslocada) |
| `data-texture` | `nenhuma`, `crt`, `grao`, `pauta`, `quadriculado` (camada por cima de tudo, sem pegar clique) |
| `data-wall` | `liso`, `aurora`, `imagem` (o véu `--wall-veil` cobre o fundo) |
| `data-glass`, `data-glow` | `on` / `off` |
| `data-fit` | presente quando a letra tem olho pequeno (VT323, à mão, máquina): iguala a altura das minúsculas |

Para a tela nova seguir os estilos de graça, use os componentes `t-*` e os
tokens. Regras de estilo começam em `:root[data-skin='x']` para vencer o CSS
escopado das telas, e a casca é mirada como `.shell > .rail/.side/.main/.status`.
Diálogos com `role="dialog"` (menos `.back`, que é o véu de tela cheia) ganham
a moldura do estilo.

## 2. Componentes base (`ui.css`)

Classes globais com prefixo `t-`, para não colidir com o CSS de cada tela.

| Classe | O que é | Variações |
|---|---|---|
| `t-btn` | Botão | `--primary` (ação principal, uma por área), `--quiet` (sem borda), `--danger`, `--on` (ligado), `--sm`, `--icon` (quadrado) |
| `t-input`, `t-select` | Campo e seleção | — |
| `t-search` | `<label>` com ícone de lupa + `t-input` | — |
| `t-seg` | Controle segmentado (botões filhos com `.on`) | — |
| `t-chip` | Chip de filtro ou de escolha; `--c` dá a cor, `<i>` vira bolinha, `<small>` a contagem | `.on` |
| `t-scroll-x` | Linha que rola de lado, com a borda direita esmaecendo | — |
| `t-card` | Painel com borda | — |
| `t-badge` | Selo numérico (avisos) | — |
| `t-scrim` + `t-sheet` | Diálogo: caixa central no computador, **folha que sobe de baixo** no celular | `.t-actions` para os botões do rodapé |
| `t-row` | Linha clicável numa folha ou menu: ícone + título + `<small>` | `.on` |

Exemplo:

```svelte
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
</script>

<button class="t-btn t-btn--primary" onclick={criar}><Icon name="mais_um" size={16} />Nova ficha</button>
<label class="t-search"><Icon name="buscar" size={15} /><input class="t-input" placeholder="Buscar" /></label>
```

Ícones: `<Icon name="…" size={18} label="…" />`. Sem `label` o ícone é decorativo
(`aria-hidden`); botões só de ícone precisam de `aria-label`. Para um ícone novo,
acrescente o caminho em `Icon.svelte` no mesmo estilo (traço 1.7, cantos redondos).

---

## 3. Regras de layout

1. **Nada sai da tela.** Grades com `minmax(min(220px, 100%), 1fr)`, nunca
   `minmax(220px, 1fr)` puro; colunas de texto com `minmax(0, 1fr)`; `min-width` fixo
   só com `min(…, 100%)`. Teste a 360px e a 320px.
2. **Celular é ≤ 720px** (a mesma quebra da casca do app). Para áreas que mudam de
   largura no computador (painel de notas aberto ou fechado), prefira `@container`.
3. **Navegação no celular:** até 5 destinos numa barra embaixo, o resto em
   **Mais** (uma folha com nome e uma linha de descrição de cada um). Abas que
   rolam de lado escondem opções: evite para navegação principal.
4. **Uma ação principal por área.** No celular ela pode virar botão flutuante
   (`fab`) acima da barra de baixo.
5. **Diálogos viram folhas** no celular (`t-sheet`), com os botões ocupando a largura.
6. **Rótulos antes de ícones.** Se faltar espaço, esconda o ícone e mantenha o nome;
   só ícone quando não houver outro jeito, e sempre com `title`/`aria-label`.
7. Textos em português, frases curtas, sem ponto final em botões.

A tela **Mundos** (`lib/cadernos/MundoView.svelte`) é a referência de tudo isso:
abas em grupos, chips de filtro, barra de baixo com "Mais", troca de mundo por
folha e botão flutuante.
