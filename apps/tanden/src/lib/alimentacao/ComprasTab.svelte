<script lang="ts">
  import { addDays } from '@tanden/core';
  import Icon from '../ui/Icon.svelte';
  import { alimentacao as a } from './alimentacao.svelte';

  // Lista de compras da semana, separada por setor do mercado.
  let { ongo }: { ongo: () => void } = $props();

  let item = $state('');
  const aisles = $derived([...new Set(a.shopping.map((x) => x.aisle))]);
  const done = $derived(a.shopping.filter((x) => x.done).length);
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  function add(e: SubmitEvent) {
    e.preventDefault();
    if (!item.trim()) return;
    a.addBuy(item);
    item = '';
  }
</script>

<div class="bar">
  <button class="t-btn t-btn--quiet t-btn--icon" aria-label="Semana anterior" onclick={() => a.goWeek(-1)}><Icon name="voltar" /></button>
  <b>{dm(a.monday)} a {dm(addDays(a.monday, 6))}</b>
  <button class="t-btn t-btn--quiet t-btn--icon next" aria-label="Próxima semana" onclick={() => a.goWeek(1)}><Icon name="voltar" /></button>
  {#if a.shopping.length}<small>{done} de {a.shopping.length} no carrinho</small>{/if}
</div>

{#if !a.hasMenu}
  <section class="t-card empty">
    <Icon name="carrinho" size={28} />
    <h3>A lista nasce do cardápio</h3>
    <p>Monte o cardápio da semana e os ingredientes aparecem aqui somados, em quantidade de compra.</p>
    <button class="t-btn t-btn--primary" onclick={ongo}>Ir para o cardápio</button>
  </section>
{:else}
  <form class="add" onsubmit={add}>
    <input class="t-input" placeholder="Acrescentar item (papel toalha, café…)" aria-label="Acrescentar item à lista" bind:value={item} />
    <button class="t-btn" disabled={!item.trim()}><Icon name="mais_um" size={15} />Acrescentar</button>
  </form>
  <p class="hint">Para {a.profile.people} {a.profile.people === 1 ? 'pessoa' : 'pessoas'}. Arroz, feijão e carnes já estão na quantidade crua.</p>
  <div class="grid">
    {#each aisles as aisle (aisle)}
      <section class="t-card">
        <h3>{aisle}</h3>
        <ul>
          {#each a.shopping.filter((x) => x.aisle === aisle) as x (x.name)}
            <li class:done={x.done}>
              <label><input type="checkbox" checked={x.done} onchange={() => a.toggleBuy(x.name)} /><span>{x.name}</span></label>
              {#if x.amount}<small>{x.amount}</small>{/if}
              {#if aisle === 'Outros'}<button class="t-btn t-btn--quiet t-btn--sm t-btn--icon" aria-label="Tirar {x.name}" onclick={() => a.removeBuy(x.name)}><Icon name="fechar" size={14} /></button>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-1) var(--sp-2); margin-bottom: var(--sp-3); }
  .bar b { font: 600 var(--fs-md) var(--f-mono); white-space: nowrap; }
  .bar .next :global(svg) { transform: rotate(180deg); }
  .bar small { margin-left: auto; font-size: 12px; color: var(--muted); }
  .empty { display: grid; justify-items: center; gap: var(--sp-2); padding: var(--sp-8) var(--sp-4); text-align: center; color: var(--muted); }
  .empty h3 { margin: 0; font: 600 var(--fs-lg) var(--f-display); color: var(--ink); text-transform: none; letter-spacing: 0; }
  .empty p { margin: 0; max-width: 46ch; line-height: 1.5; font-size: var(--fs-md); }
  .add { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-2); }
  .add input { flex: 1; width: 100%; }
  .hint { margin: 0 0 var(--sp-3); font-size: var(--fs-sm); color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: var(--sp-3); align-items: start; }
  h3 { margin: 0 0 var(--sp-2); font: 600 11px/1.2 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; }
  li { display: flex; align-items: center; gap: var(--sp-2); min-height: var(--h-md); border-top: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  li:first-child { border-top: 0; }
  label { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); cursor: pointer; }
  label input { flex: none; width: 17px; height: 17px; accent-color: var(--ember); }
  label span { min-width: 0; overflow-wrap: anywhere; }
  li.done span { color: var(--muted); text-decoration: line-through; }
  small { font: 11.5px var(--f-mono); color: var(--muted); white-space: nowrap; }
</style>
