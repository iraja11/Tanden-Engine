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
