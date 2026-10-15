<script lang="ts">
  import type { SortSpec } from '@tanden/core';

  let { sort, props, label, onchange }: { sort: SortSpec[]; props: string[]; label: (id: string) => string; onchange: (s: SortSpec[]) => void } = $props();
  let list = $state<SortSpec[]>(sort.map((s) => ({ ...s })));
  const emit = () => onchange(list.map((s) => ({ ...s })));
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    emit();
  }
</script>

<div class="sp">
  {#each list as s, i (i)}
    <div class="db-row">
      <select class="db-select p" bind:value={s.property} onchange={emit}>{#each props as p (p)}<option value={p}>{label(p)}</option>{/each}</select>
      <select class="db-select" bind:value={s.direction} onchange={emit}><option value="ASC">Crescente</option><option value="DESC">Decrescente</option></select>
      <button class="db-btn" aria-label="Subir" onclick={() => move(i, -1)}>↑</button>
      <button class="db-btn danger" aria-label="Tirar" onclick={() => { list.splice(i, 1); emit(); }}>×</button>
    </div>
  {/each}
  {#if !list.length}<p class="db-hint">Sem ordenação: em ordem alfabética pelo nome.</p>{/if}
  <button class="db-btn line" onclick={() => { list.push({ property: props.find((p) => !list.some((s) => s.property === p)) ?? 'file.name', direction: 'ASC' }); emit(); }}>+ Ordenação</button>
</div>

<style>
  .sp { display: grid; gap: 6px; padding: 4px; width: 400px; max-width: calc(100vw - 40px); }
  .p { flex: 1; min-width: 0; }
</style>
