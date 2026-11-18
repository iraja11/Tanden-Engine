<script lang="ts">
  import { HOME_MOVES, MOVE_AREAS, foldText, moveAllowed, type HomeMove, type MoveArea } from '@tanden/core';
  import Icon from '../ui/Icon.svelte';
  import Figura from './Figura.svelte';
  import MoveSheet from './MoveSheet.svelte';
  import { exercicios as ex } from './exercicios.svelte';

  // Todos os exercícios, com filtros por região e pelo que há em casa.
  let query = $state('');
  let area = $state<MoveArea | null>(null);
  let mine = $state(false);
  let open = $state<HomeMove | null>(null);

  const LEVELS = ['Iniciante', 'Intermediário', 'Avançado'];
  const list = $derived.by(() => {
    const q = foldText(query);
    const s = ex.settings;
    return HOME_MOVES.filter((m) =>
      (!area || m.area === area)
      && (!q || foldText(m.name).includes(q))
      && (!mine || moveAllowed(m, { level: s.level, props: s.props, avoid: s.avoid, quiet: s.quiet })));
  });
</script>

<div class="filters">
  <label class="t-search"><Icon name="buscar" size={15} /><input class="t-input" placeholder="Buscar exercício" aria-label="Buscar exercício" bind:value={query} /></label>
  <label class="sw"><input type="checkbox" bind:checked={mine} /> Só o que serve para mim</label>
</div>
<div class="t-scroll-x areas" role="radiogroup" aria-label="Região do corpo">
  <button class="t-chip" class:on={!area} role="radio" aria-checked={!area} onclick={() => (area = null)}>Todos</button>
  {#each MOVE_AREAS as a (a.id)}
    <button class="t-chip" class:on={area === a.id} role="radio" aria-checked={area === a.id} onclick={() => (area = a.id)}>{a.label}</button>
  {/each}
</div>

<p class="count">{list.length} {list.length === 1 ? 'exercício' : 'exercícios'}</p>
<div class="grid">
  {#each list as m (m.id)}
    <button class="t-card move" onclick={() => (open = m)}>
      <span class="thumb"><Figura fig={m.fig} playing={false} label="" /></span>
      <span class="txt"><b>{m.name}</b><small>{MOVE_AREAS.find((a) => a.id === m.area)?.label} · {LEVELS[m.level - 1]}</small></span>
    </button>
  {:else}
    <p class="none">Nenhum exercício com esses filtros.</p>
  {/each}
</div>

{#if open}<MoveSheet move={open} onclose={() => (open = null)} onpick={(m) => (open = m)} />{/if}

<style>
  .filters { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2); }
  .filters .t-search { flex: 1 1 220px; }
  .sw { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--silver); }
  .sw input { accent-color: var(--ember); }
  .count { margin: var(--sp-2) 0; font-size: 12px; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: var(--sp-2); }
  .move { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); text-align: left; color: var(--ink); min-width: 0; }
  .move:hover { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .thumb { flex: none; width: 72px; height: 58px; border-radius: var(--r-sm); background: var(--void); padding: 2px; }
  .txt { min-width: 0; display: grid; gap: 2px; }
  .txt b { font: 600 13.5px/1.3 var(--f-body); overflow-wrap: anywhere; }
  .txt small { font-size: 12px; color: var(--muted); }
  .none { color: var(--muted); font-size: var(--fs-md); }
</style>
