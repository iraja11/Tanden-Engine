<script lang="ts" module>
  // Ícones de traço do Tanden (24×24, traço 1.7, cantos redondos). Herdam a cor
  // do texto (currentColor). Para um ícone novo, acrescente o caminho aqui.
  const PATHS = {
    fichas: '<rect x="3.5" y="6" width="12" height="14.5" rx="2"/><path d="M8 3.5h10.5a2 2 0 0 1 2 2V17"/>',
    mapas: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    tempo: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    grafo: '<circle cx="6" cy="6.5" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="m8.5 6.8 7 .9M6.8 9l2.4 6.6M16.4 10.1l-4.8 5.9"/>',
    conflitos: '<path d="M4 4l9.5 9.5M20 4l-9.5 9.5M13.5 13.5l3 3M10.5 13.5l-3 3M15 19.5l4.5-4.5M9 19.5 4.5 15"/>',
    sim: '<circle cx="12" cy="12" r="2.6"/><path d="M19.5 12a7.5 7.5 0 0 1-12.6 5.5M4.5 12a7.5 7.5 0 0 1 12.6-5.5"/><path d="M17.5 3.5v3.3h-3.3M6.5 20.5v-3.3h3.3"/>',
    ideias: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.1v.1h5v-.1c0-.8.4-1.5 1.1-2.1A6 6 0 0 0 12 3z"/>',
    regras: '<path d="M8.5 4H7.5a2 2 0 0 0-2 2v3.5L3.5 12l2 2.5V18a2 2 0 0 0 2 2h1M15.5 4h1a2 2 0 0 1 2 2v3.5l2 2.5-2 2.5V18a2 2 0 0 1-2 2h-1"/>',
    mais: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    mundo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.3 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.3-3.5-8.5s1-6 3.5-8.5z"/>',
    mais_um: '<path d="M12 5v14M5 12h14"/>',
    voltar: '<path d="m14.5 18-6-6 6-6"/>',
    abaixo: '<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>',
    nota: '<path d="M6.5 3.5h8l4 4v13h-12z"/><path d="M14 3.5v4.5h4.5M9.5 12.5h5M9.5 16h5"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    lista: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="17.5" r=".9"/>',
    cartas: '<rect x="4" y="4" width="7" height="9.5" rx="1.5"/><rect x="13" y="4" width="7" height="9.5" rx="1.5"/><path d="M4 17h16M4 20.5h10"/>',
    imprimir: '<path d="M7 8.5V3.5h10v5"/><rect x="3.5" y="8.5" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    exportar: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M4.5 14v4.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V14"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    alerta: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17v.3"/>',
    elementos: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.3"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.3"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.3"/><path d="M17 14.5v5M14.5 17h5"/>',
    escrita: '<path d="M15 5.5l3.5 3.5M4.5 19.5l1.2-4.7L16.3 4.2a2.1 2.1 0 0 1 3 3L8.7 17.8z"/><path d="M13 20h7"/>',
    seres: '<circle cx="6.5" cy="9.5" r="1.8"/><circle cx="12" cy="6" r="1.8"/><circle cx="17.5" cy="9.5" r="1.8"/><path d="M12 12c-3 0-5.5 3-5.5 5.2 0 1.6 1.3 2.3 2.7 2.3 1.1 0 1.8-.6 2.8-.6s1.7.6 2.8.6c1.4 0 2.7-.7 2.7-2.3C17.5 15 15 12 12 12z"/>',
    sistemas: '<path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z"/><path d="M8 9h8M8 12h5"/>',
    guia: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    prato: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
    carrinho: '<path d="M3.5 4.5h2.2l2.2 11h10l2-8H6.6"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>',
    faisca: '<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z"/><path d="M19 16.5v3.5M17.2 18.2h3.6"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    halter: '<path d="M8 12h8M5.5 8v8M8 6.5v11M16 6.5v11M18.5 8v8M3 10.5v3M21 10.5v3"/>',
    tocar: '<path d="M7.5 4.5v15l12-7.5z"/>',
    pausar: '<path d="M8.5 5v14M15.5 5v14"/>',
    seguir: '<path d="M5.5 5v14l10-7zM18.5 5v14"/>',
    recuar: '<path d="M18.5 5v14l-10-7zM5.5 5v14"/>',
    certo: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    lixo: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
    trocar: '<path d="M19.5 9A8 8 0 0 0 5.8 6.5L4 8.5M4.5 15a8 8 0 0 0 13.7 2.5l1.8-2"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
    ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    grafico: '<path d="M4 20.5h16M7 17v-5M12 17V6M17 17v-8"/>',
    mercado: '<path d="M12 4v16M7 20.5h10M5 7.5h14"/><path d="M5 7.5 2.8 13a2.6 2.6 0 0 0 4.4 0zM19 7.5 16.8 13a2.6 2.6 0 0 0 4.4 0z"/><circle cx="12" cy="4" r=".9"/>',
    sino: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    bau: '<path d="M3.5 10.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2.5"/><rect x="3.5" y="10.5" width="17" height="9.5" rx="1.6"/><path d="M3.5 13.5h17"/><rect x="10.3" y="12" width="3.4" height="4" rx=".8"/>',
    almanaque: '<path d="M4.5 5.5c2.5-1.3 5-1.3 7.5 0v14c-2.5-1.3-5-1.3-7.5 0zM19.5 5.5c-2.5-1.3-5-1.3-7.5 0v14c2.5-1.3 5-1.3 7.5 0z"/><path d="M14.5 15.5v-2M16.5 15.5v-4M7 9h2.5M7 12h2.5"/>',
    poder: '<path d="M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5z"/>',
    lua: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
    dado: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.1"/><circle cx="15.5" cy="15.5" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="15.5" cy="8.5" r="1.1"/><circle cx="8.5" cy="15.5" r="1.1"/>',
    coroa: '<path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z"/><path d="M4.5 20.5h15"/>',
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg class="t-icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
  {@html PATHS[name]}
</svg>

<style>
  .t-icon { flex: none; display: block; }
</style>
