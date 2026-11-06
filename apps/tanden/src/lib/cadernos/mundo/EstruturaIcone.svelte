<script lang="ts">
  import type { Estrutura } from '@tanden/core';

  // Ícone de uma estrutura no mapa, no estilo de atlas: traço escuro, miolo
  // de pergaminho e um detalhe na cor do dono (`--c`). 24×24, escala com o tamanho.
  let { kind, size = 26 }: { kind: Estrutura; size?: number } = $props();
</script>

<svg class="ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
  {#if kind === 'capital'}
    <path class="w" d="M3 21V11l2-1.5L7 11v-2l2-1.5L11 9V5l1-2 1 2v4l2-1.5L17 9v2l2-1.5L21 11v10Z" />
    <path class="d" d="M12 3V1.2l3 .9-3 .9" />
    <path class="a" d="M10 21v-4a2 2 0 0 1 4 0v4Z" />
    <path class="l" d="M3 14h18M6 12v2M18 12v2" />
  {:else if kind === 'cidade'}
    <path class="w" d="M2.5 21v-6l3-2 3 2v-4l3.5-3 3.5 3v4l3-2 3 2v6Z" />
    <path class="a" d="M10.5 21v-3a1.5 1.5 0 0 1 3 0v3Z" />
    <path class="l" d="M5.5 17h0M8.5 13l3.5-3 3.5 3M18.5 17h0" />
  {:else if kind === 'vila'}
    <path class="w" d="M3 21v-6l4-3.5 4 3.5v6Z" />
    <path class="w" d="M11 21v-8l5-4 5 4v8Z" />
    <path class="a" d="M14.8 21v-3h2.4v3Z" />
  {:else if kind === 'aldeia'}
    <path class="w" d="M5 21v-7l7-5.5 7 5.5v7Z" />
    <path class="a" d="M10.6 21v-3.6h2.8V21Z" />
  {:else if kind === 'castelo'}
    <path class="w" d="M3 21V8h2v2h2V8h2v4h6V8h2v2h2V8h2v13Z" />
    <path class="w" d="M9.5 12V6h1.3v1.4h2.4V6h1.3v6" />
    <path class="a" d="M10.3 21v-3.5a1.7 1.7 0 0 1 3.4 0V21Z" />
  {:else if kind === 'forte'}
    <path class="w" d="M4 21V9l2-2 2 2v3h8V9l2-2 2 2v12Z" />
    <path class="l" d="M4 15h16" />
    <path class="a" d="M10.5 21v-3h3v3Z" />
  {:else if kind === 'porto'}
    <path class="w" d="M4 13v-3l4-3 4 3v3Z" />
    <path class="a" d="M16 4.5a1.4 1.4 0 1 1 0 .1M16 6v10M13 9h6M11.5 13.5c.6 2.5 2.4 3.6 4.5 3.6s3.9-1.1 4.5-3.6" />
    <path class="water" d="M2 20c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
  {:else if kind === 'templo'}
    <path class="w" d="M3 10 12 4l9 6Z" />
    <path class="w" d="M4.5 21v-1.5h15V21Z" />
    <path class="l" d="M6 11v8M10 11v8M14 11v8M18 11v8" />
    <path class="a" d="M12 6.4v1.8" />
  {:else if kind === 'torre'}
    <path class="w" d="M8.5 21 9.5 8h5l1 13Z" />
    <path class="w" d="M8 8V4.5h1.6V6h1.6V4.5h1.6V6h1.6V4.5H16V8Z" />
    <path class="a" d="M11 12h2v2.5h-2Z" />
  {:else if kind === 'ruina'}
    <path class="w" d="M4 21V9.5l1.6-1 .9 1.6V21Z" />
    <path class="w" d="M10 21v-6.5l1.4-1.2 1.2 1.6V21Z" />
    <path class="w" d="M16 21V11l2-1.4 1.6 2.4-.4 9Z" />
    <path class="l" d="M2.5 21h19M7.5 19.5l1.5-.6M13.8 20l1.4-.4" />
  {:else if kind === 'mina'}
    <path class="w" d="M3 21 12 7l9 14Z" />
    <path class="a" d="M9 21v-4.5a3 3 0 0 1 6 0V21Z" />
    <path class="l" d="M9 16.5h6" />
  {:else if kind === 'caverna'}
    <path class="w" d="M2.5 21c0-6 3-11 9.5-11s9.5 5 9.5 11Z" />
    <path class="a dark" d="M8 21c0-3.6 1.6-6 4-6s4 2.4 4 6Z" />
  {:else if kind === 'floresta'}
    <path class="tree" d="M7 4 2.5 13h3L3 18h8l-2.5-5h3Z" />
    <path class="tree" d="M16.5 6 12 15h3l-2.5 5h8L18 15h3Z" />
    <path class="l" d="M7 18v3M16.5 20v1.5" />
  {:else if kind === 'montanha'}
    <path class="w" d="M1.5 21 9 7l4 6 2.5-3.5L22.5 21Z" />
    <path class="snow" d="M9 7 7 10.7l1.4-.7 1 1.2 1.1-1.6Z" />
  {:else if kind === 'acampamento'}
    <path class="w" d="M2.5 21 12 6l9.5 15Z" />
    <path class="a dark" d="M12 21v-6l-3 6Z" />
    <path class="l" d="M12 6 10.5 3.5M12 6l1.5-2.5" />
  {:else}
    <circle class="w" cx="12" cy="12" r="5" />
    <circle class="a" cx="12" cy="12" r="2" />
  {/if}
</svg>

<style>
  .ico { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px #0009); }
  path, circle { stroke: #2a2018; stroke-width: 1.3; stroke-linejoin: round; stroke-linecap: round; }
  .w { fill: #f1e4c2; }
  .a { fill: var(--c, #c0392b); }
  .a.dark { fill: #2a2018; }
  .d { fill: var(--c, #c0392b); stroke-width: 1; }
  .l { fill: none; }
  .tree { fill: #4f7a45; }
  .snow { fill: #fff; stroke-width: .8; }
  .water { fill: none; stroke: #2f6f9a; stroke-width: 1.5; }
</style>
