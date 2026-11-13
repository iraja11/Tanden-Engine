<script lang="ts">
  // Ícone de item pelo tipo ou pela categoria (traço grosso, cor de quem chama em `currentColor`).
  let { hint, size = 24 }: { hint: string; size?: number } = $props();

  const kind = $derived.by(() => {
    const h = hint.toLowerCase();
    if (/escudo|shield|broquel/.test(h)) return 'escudo';
    if (/armadura|armor|cota|placas|couraça|peitoral|brunea|gibão|couro/.test(h)) return 'armadura';
    if (/arco|besta|funda|zarabatana|bow|crossbow|dist[aâ]ncia/.test(h)) return 'arco';
    if (/muni[cç]|flecha|virote|bala/.test(h)) return 'flecha';
    if (/arma|weapon|espada|machad|adaga|lan[cç]a|martelo|ma[cç]a|cimitarra|rapieira|glaive|alabarda|tridente|chicote|clava|bord[aã]o|foice|pique|malho|mangual|picareta|azagaia|dardo/.test(h)) return 'espada';
    if (/po[cç][aã]o|potion|elixir|frasco|ant[ií]toxina|[aá]gua benta|[aá]cido|fogo alqu/.test(h)) return 'pocao';
    if (/anel|ring|amuleto|colar|s[ií]mbolo/.test(h)) return 'anel';
    if (/pergaminho|scroll|livro|book|tomo|grim[oó]rio/.test(h)) return 'livro';
    if (/varinha|cajado|bast[aã]o|wand|staff|foco|cristal|orbe/.test(h)) return 'varinha';
    if (/ferramenta|kit|tool|pé de cabra|gancho/.test(h)) return 'ferramenta';
    if (/tocha|lanterna|vela|torch|lamp|[oó]leo|pederneira/.test(h)) return 'tocha';
    if (/ra[cç][aã]o|comida|cantil|odre|food/.test(h)) return 'comida';
    if (/tesouro|gema|joia|ouro|moeda|treasure|gem/.test(h)) return 'gema';
    return 'bolsa';
  });
</script>

<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" class="ii">
  {#if kind === 'espada'}
    <path d="M46 8h10v10L28 46l-4-4L46 8ZM22 40l6 6-6 6-3-1-5 5-4-4 5-5-1-3 6-6Z" />
  {:else if kind === 'arco'}
    <path d="M14 8c22 6 36 20 42 42M14 8l42 42M14 8l-2 10M14 8l10-2M30 34 10 54M10 54h7M10 54v-7" />
  {:else if kind === 'flecha'}
    <path d="M10 54 46 18M46 18l2-10 8 8-10 2ZM18 46l-8 0 0-8M24 40h-8v-8" />
  {:else if kind === 'armadura'}
    <path d="M22 8h20l4 6 10 4-4 16-6-2v24H18V32l-6 2-4-16 10-4ZM26 8c0 5 3 8 6 8s6-3 6-8" />
  {:else if kind === 'escudo'}
    <path d="M32 6 52 13v15c0 14-9 24-20 30C21 52 12 42 12 28V13ZM32 6v52M12 26h40" />
  {:else if kind === 'pocao'}
    <path d="M26 6h12v4h-2v10l12 16c4 8-2 22-16 22S12 44 16 36l12-16V10h-2ZM18 40h28" />
  {:else if kind === 'anel'}
    <path d="M32 22a16 16 0 1 0 .01 0ZM32 28a10 10 0 1 1-.01 0ZM24 8h16l-8 12Z" />
  {:else if kind === 'livro'}
    <path d="M14 10h32a6 6 0 0 1 6 6v38H20a6 6 0 0 1-6-6ZM20 20h26M20 28h26M20 36h18" />
  {:else if kind === 'varinha'}
    <path d="M12 52 40 24M44 8l3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM52 32l1.5 3.5L57 37l-3.5 1.5L52 42l-1.5-3.5L47 37l3.5-1.5Z" />
  {:else if kind === 'ferramenta'}
    <path d="M40 8a12 12 0 0 0-11 16L10 43l11 11 19-19A12 12 0 0 0 56 24l-8 4-6-6 4-8a12 12 0 0 0-6-6Z" />
  {:else if kind === 'tocha'}
    <path d="M28 30h8l-2 26h-4ZM32 6c8 6 10 12 6 20h-12c-4-8 0-14 6-20Z" />
  {:else if kind === 'comida'}
    <path d="M14 26h36l-3 26H17ZM20 26c0-8 5-14 12-14s12 6 12 14M24 36h16" />
  {:else if kind === 'gema'}
    <path d="M20 10h24l12 14-24 32L8 24ZM8 24h48M26 10l-6 14 12 32 12-32-6-14" />
  {:else}
    <path d="M14 22h36l-4 32H18ZM22 22a10 10 0 0 1 20 0M26 34h12" />
  {/if}
</svg>

<style>
  .ii { fill: color-mix(in srgb, currentColor 22%, transparent); stroke: currentColor; stroke-width: 2.6; stroke-linejoin: round; stroke-linecap: round; flex: none; }
</style>
