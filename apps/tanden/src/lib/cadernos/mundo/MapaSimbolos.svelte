<svelte:options namespace="svg" />

<script lang="ts">
  import type { Simbolo } from '@tanden/core';

  // Símbolos de mapa desenhado (montanhas, colinas, árvores, dunas, capim),
  // dentro do <svg> do mapa. Cada desenho mora numa caixa de 1×1 com a base
  // em (0, 0); o `s` do símbolo é o tamanho em % da altura do mapa.
  let { list, aspect }: { list: Simbolo[]; aspect: number } = $props();
</script>

<defs>
  <g id="sym-monte-0">
    <path class="f" d="M-.62 0 -.1-.92.06-.66.16-.78.62 0Z" />
    <path class="sh" d="M-.1-.92.02-.5-.08-.22.04 0H.62L.16-.78.06-.66Z" />
    <path class="k" d="M-.62 0 -.1-.92.06-.66.16-.78.62 0M-.1-.92.02-.5-.08-.22" />
    <path class="snow" d="M-.1-.92-.24-.68-.14-.7-.08-.62.0-.72.06-.66Z" />
  </g>
  <g id="sym-monte-1">
    <path class="f" d="M-.66 0-.28-.62-.12-.5.08-.96.66 0Z" />
    <path class="sh" d="M.08-.96.0-.6.1-.3 0 0H.66Z" />
    <path class="k" d="M-.66 0-.28-.62-.12-.5.08-.96.66 0M.08-.96 0-.6.1-.3" />
    <path class="snow" d="M.08-.96-.04-.74.04-.76.08-.68.14-.78.2-.76Z" />
  </g>
  <g id="sym-monte-2">
    <path class="f" d="M-.6 0-.06-.86.6 0Z" />
    <path class="sh" d="M-.06-.86.1-.46-.02-.2.08 0H.6Z" />
    <path class="k" d="M-.6 0-.06-.86.6 0M-.06-.86.1-.46-.02-.2" />
    <path class="snow" d="M-.06-.86-.18-.66-.08-.68 0-.6.06-.7.12-.68Z" />
  </g>
  <g id="sym-colina">
    <path class="f" d="M-.6 0C-.4-.5.4-.5.6 0Z" />
    <path class="sh" d="M.05-.37C.3-.34.5-.2.6 0H.1C.2-.15.15-.28.05-.37Z" />
    <path class="k" d="M-.6 0C-.4-.5.4-.5.6 0" />
  </g>
  <g id="sym-arvore">
    <path class="trunk" d="M0 0V-.3" />
    <circle class="leaf" cx="0" cy="-.55" r=".32" />
    <path class="leafsh" d="M.06-.84A.32.32 0 0 1 .06-.26.36.36 0 0 0 .06-.84Z" />
    <circle class="k" cx="0" cy="-.55" r=".32" />
  </g>
  <g id="sym-pinheiro">
    <path class="trunk" d="M0 0V-.18" />
    <path class="leaf" d="M0-1 .3-.18H-.3Z" />
    <path class="leafsh" d="M0-1 .3-.18H.04Z" />
    <path class="k" d="M0-1 .3-.18H-.3Z" />
  </g>
  <g id="sym-palmeira">
    <path class="trunk" d="M0 0C.05-.25.02-.5-.04-.7" />
    <path class="k leafk" d="M-.04-.7C-.2-.82-.38-.74-.46-.6M-.04-.7C.12-.84.32-.8.42-.64M-.04-.7C-.12-.9-.06-1 .06-1.04M-.04-.7C-.3-.7-.42-.56-.42-.46" />
  </g>
  <g id="sym-capim">
    <path class="k grass" d="M-.24 0-.32-.32M-.12 0-.12-.42M0 0 .08-.36M.14 0 .26-.28" />
  </g>
  <g id="sym-duna">
    <path class="k" d="M-.7 0C-.4-.34.1-.4.6-.08" />
    <path class="k thin" d="M-.2-.06C0-.2.22-.22.4-.06" />
  </g>
  <g id="sym-cacto">
    <path class="k cact" d="M0 0V-.6M0-.36H-.18V-.5M0-.28H.16V-.44" />
  </g>
  <g id="sym-pedra">
    <path class="f" d="M-.3 0-.22-.18-.04-.26.18-.2.3 0Z" />
    <path class="k" d="M-.3 0-.22-.18-.04-.26.18-.2.3 0" />
  </g>
  <g id="sym-cogumelo">
    <path class="k" d="M-.04 0V-.32M.04 0V-.32" />
    <path class="f" d="M-.34-.3C-.3-.62.3-.62.34-.3Z" />
    <path class="k" d="M-.34-.3C-.3-.62.3-.62.34-.3Z" />
  </g>
  <g id="sym-cristal">
    <path class="f" d="M-.12 0-.2-.36-.08-.6.04-.34ZM.02 0 .08-.42.2-.24.22 0Z" />
    <path class="k" d="M-.12 0-.2-.36-.08-.6.04-.34ZM.02 0 .08-.42.2-.24.22 0Z" />
  </g>
</defs>

<g class="syms">
  {#each list as s, i (i)}
    <use href={s.k === 'monte' ? `#sym-monte-${s.v}` : `#sym-${s.k}`} transform="translate({(s.x * aspect).toFixed(2)} {s.y.toFixed(2)}) scale({s.s})" />
  {/each}
</g>

<style>
  .syms { pointer-events: none; }
  .f { fill: var(--sym-fill); }
  .sh { fill: var(--sym-shade); }
  .snow { fill: var(--sym-snow); }
  .k { fill: none; stroke: var(--sym-ink); stroke-width: .06; stroke-linejoin: round; stroke-linecap: round; }
  .k.thin { stroke-width: .04; opacity: .7; }
  .trunk { fill: none; stroke: var(--sym-trunk); stroke-width: .09; stroke-linecap: round; }
  .leaf { fill: var(--sym-leaf); }
  .leafsh { fill: var(--sym-leafsh); }
  .leafk, .grass { stroke: var(--sym-leafink); }
  .cact { stroke: var(--sym-leafink); stroke-width: .08; }
</style>
