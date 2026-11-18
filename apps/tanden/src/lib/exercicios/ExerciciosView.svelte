<script lang="ts">
  import Icon, { type IconName } from '../ui/Icon.svelte';
  import ModuleTabs from '../ui/ModuleTabs.svelte';
  import AjustesSheet from './AjustesSheet.svelte';
  import Avisos from './Avisos.svelte';
  import ConquistasTab from './ConquistasTab.svelte';
  import BibliotecaTab from './BibliotecaTab.svelte';
  import Player from './Player.svelte';
  import ProgramasTab from './ProgramasTab.svelte';
  import ProgressoTab from './ProgressoTab.svelte';
  import TreinarTab from './TreinarTab.svelte';
  import { exercicios as ex } from './exercicios.svelte';

  // Tela Exercícios: treinos guiados para fazer em casa.
  type Tab = 'treinar' | 'biblioteca' | 'programas' | 'progresso' | 'conquistas';
  const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
    { id: 'treinar', label: 'Treinar', icon: 'halter' },
    { id: 'biblioteca', label: 'Exercícios', icon: 'lista' },
    { id: 'programas', label: 'Programas', icon: 'calendario' },
    { id: 'progresso', label: 'Progresso', icon: 'grafico' },
    { id: 'conquistas', label: 'Conquistas', icon: 'faisca' },
  ];
  const tab = $derived(ex.tab as Tab);
  let settings = $state(false);
</script>

<section class="mod">
  <div class="scroll">
    <header>
      <div>
        <p class="t-eyebrow">Exercícios em casa</p>
        <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
      </div>
      <div class="tools">
        <ModuleTabs tabs={TABS} value={tab} onchange={(t) => (ex.tab = t)} place="top" label="Seções dos exercícios" />
        <button class="t-btn t-btn--icon" aria-label="Ajustes dos treinos" title="Ajustes dos treinos" onclick={() => (settings = true)}><Icon name="ajustes" /></button>
      </div>
    </header>
    {#if tab === 'treinar'}<TreinarTab />
    {:else if tab === 'biblioteca'}<BibliotecaTab />
    {:else if tab === 'programas'}<ProgramasTab />
    {:else if tab === 'conquistas'}<ConquistasTab />
    {:else}<ProgressoTab />{/if}
  </div>
  <ModuleTabs tabs={TABS} value={tab} onchange={(t) => (ex.tab = t)} place="dock" label="Seções dos exercícios" />
  <Avisos onopen={() => (ex.tab = 'conquistas')} />
  {#if settings}<AjustesSheet onclose={() => (settings = false)} />{/if}
</section>

{#if ex.playing && ex.session}
  {#key ex.session.routine}<Player session={ex.session} />{/key}
{/if}

<style>
  .mod { position: relative; flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; container: exercicios / inline-size; }
  .scroll { overflow-y: auto; padding: var(--sp-5) var(--gutter) var(--sp-8); }
  .scroll > :global(*) { max-width: 1120px; margin-inline: auto; }
  header { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-4); }
  .tools { display: flex; align-items: center; gap: var(--sp-2); }
  h1 { margin: 2px 0 0; font: 600 var(--fs-xl) var(--f-display); color: var(--ink); }
</style>
