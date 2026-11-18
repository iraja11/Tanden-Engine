<script lang="ts" generics="T extends string">
  import Icon, { type IconName } from './Icon.svelte';

  // Navegação de um módulo: abas no topo no computador, barra embaixo no celular.
  // Use duas vezes na tela: place="top" no cabeçalho e place="dock" no rodapé.
  let { tabs, value, onchange, place, label }: {
    tabs: Array<{ id: T; label: string; icon: IconName }>;
    value: T;
    onchange: (id: T) => void;
    place: 'top' | 'dock';
    label: string;
  } = $props();
</script>

{#if place === 'top'}
  <div class="t-seg top" role="tablist" aria-label={label}>
    {#each tabs as t (t.id)}
      <button role="tab" aria-selected={value === t.id} class:on={value === t.id} onclick={() => onchange(t.id)}><Icon name={t.icon} size={15} />{t.label}</button>
    {/each}
  </div>
{:else}
  <nav class="dock" aria-label={label} style:--n={tabs.length}>
    {#each tabs as t (t.id)}
      <button class:on={value === t.id} aria-current={value === t.id ? 'page' : undefined} onclick={() => onchange(t.id)}><Icon name={t.icon} size={20} /><span>{t.label}</span></button>
    {/each}
  </nav>
{/if}

<style>
  .dock { display: none; }
  @media (max-width: 720px) {
    .top { display: none; }
    .dock { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); z-index: var(--z-dock); padding: 4px 4px 2px;
      border-top: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(10px); }
    .dock button { display: grid; justify-items: center; gap: 3px; min-width: 0; min-height: 52px; padding: 6px 2px 4px; border: 0; border-radius: var(--r-md);
      background: none; color: var(--muted); font: 600 10.5px/1 var(--f-body); }
    .dock span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dock button.on { color: var(--ink); }
    .dock button.on :global(svg) { color: var(--ember); }
    .dock button:active { background: var(--surface-2); }
  }
</style>
