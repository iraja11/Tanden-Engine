<script lang="ts">
  import ModuleTabs from '../ui/ModuleTabs.svelte';
  import type { IconName } from '../ui/Icon.svelte';
  import CardapioTab from './CardapioTab.svelte';
  import ComprasTab from './ComprasTab.svelte';
  import DiarioTab from './DiarioTab.svelte';
  import MetasTab from './MetasTab.svelte';
  import SugestoesTab from './SugestoesTab.svelte';
  import { alimentacao as a } from './alimentacao.svelte';

  // Tela Alimentação: acompanhamento, planejamento e sugestões.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  type Tab = 'diario' | 'cardapio' | 'compras' | 'sugestoes' | 'metas';
  const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
    { id: 'diario', label: 'Diário', icon: 'prato' },
    { id: 'cardapio', label: 'Cardápio', icon: 'calendario' },
    { id: 'compras', label: 'Compras', icon: 'carrinho' },
    { id: 'sugestoes', label: 'Sugestões', icon: 'faisca' },
    { id: 'metas', label: 'Metas', icon: 'perfil' },
  ];
  // a aba fica no store: a paleta de comandos também escolhe
  const tab = $derived(a.tab as Tab);
  const go = (t: Tab) => (a.tab = t);
</script>

<section class="mod">
  <div class="scroll">
    <header>
      <div>
        <p class="t-eyebrow">Alimentação</p>
        <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
      </div>
      <ModuleTabs tabs={TABS} value={tab} onchange={go} place="top" label="Seções da alimentação" />
    </header>
    {#if tab === 'diario'}<DiarioTab />
    {:else if tab === 'cardapio'}<CardapioTab {onOpenNote} />
    {:else if tab === 'compras'}<ComprasTab ongo={() => go('cardapio')} />
    {:else if tab === 'sugestoes'}<SugestoesTab />
    {:else}<MetasTab {onOpenNote} />{/if}
  </div>
  <ModuleTabs tabs={TABS} value={tab} onchange={go} place="dock" label="Seções da alimentação" />
</section>

<style>
  .mod { position: relative; flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; container: alimentacao / inline-size; }
  .scroll { overflow-y: auto; padding: var(--sp-5) var(--gutter) var(--sp-8); }
  .scroll > :global(*) { max-width: 1120px; margin-inline: auto; }
  header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-4); }
  h1 { margin: 2px 0 0; font: 600 var(--fs-xl) var(--f-display); color: var(--ink); }
</style>
