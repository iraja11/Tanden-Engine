<script lang="ts">
  import type { Catalogo, PublicoForm } from '@tanden/core';

  // "Para quem vale": espécies, povos, facções, sexo e faixa de idade.
  // Vira a linha `para ...` das regras; vazio = todo mundo.
  let { publico = $bindable(), cat, faccoes = [], idade = true }: { publico: PublicoForm; cat: Catalogo; faccoes?: string[]; idade?: boolean } = $props();

  const especies = $derived(['Humano', ...[...cat.especies.values()].map((e) => e.nome)]);
  const etnias = $derived([...cat.etnias.values()].map((e) => e.nome));
  function alterna(l: string[], v: string) {
    const i = l.indexOf(v);
    if (i >= 0) l.splice(i, 1);
    else l.push(v);
  }
  const vazio = $derived(!publico.especies.length && !publico.etnias.length && !publico.faccoes.length && !publico.sexo && !publico.idadeMin && !publico.idadeMax);
</script>

<div class="pub">
  {#if vazio}<p class="vazio">todo mundo</p>{/if}
  {#if especies.length > 1}
    <div class="lin"><span class="k">espécie</span>
      {#each especies as e (e)}<button class="op" class:on={publico.especies.includes(e)} onclick={() => alterna(publico.especies, e)}>{e}</button>{/each}
    </div>
  {/if}
  {#if etnias.length}
    <div class="lin"><span class="k">povo</span>
      {#each etnias as e (e)}<button class="op" class:on={publico.etnias.includes(e)} onclick={() => alterna(publico.etnias, e)}>{e}</button>{/each}
    </div>
  {/if}
  {#if faccoes.length}
    <div class="lin"><span class="k">facção</span>
      {#each faccoes as e (e)}<button class="op" class:on={publico.faccoes.includes(e)} onclick={() => alterna(publico.faccoes, e)}>{e}</button>{/each}
    </div>
  {/if}
  <div class="lin">
    <span class="k">sexo</span>
    <select bind:value={publico.sexo} aria-label="Sexo"><option value="">qualquer</option><option value="f">feminino</option><option value="m">masculino</option></select>
    {#if idade}
      <span class="k">idade de</span><input type="number" min="0" bind:value={publico.idadeMin} aria-label="Idade mínima" />
      <span class="k">até</span><input type="number" min="0" bind:value={publico.idadeMax} aria-label="Idade máxima" /><span class="dim">(0 = sem limite)</span>
    {/if}
  </div>
</div>

<style>
  .pub { display: grid; gap: 5px; }
  .vazio { margin: 0; font-size: 12px; color: var(--muted); font-style: italic; }
  .lin { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  .k { font-size: 12.5px; color: var(--ink); }
  .dim { font-size: 11.5px; color: var(--muted); }
  .op { border: 1px solid var(--line); background: none; color: var(--muted); border-radius: 999px; padding: 2px 9px; font-size: 12px; }
  .op.on { color: var(--ink); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 14%, transparent); }
  select, input { background: var(--void); border: 1px solid var(--line); border-radius: 7px; color: var(--ink); padding: 3px 6px; font-size: 12.5px; }
  input[type='number'] { width: 62px; font-family: var(--f-mono); }
</style>
