<script lang="ts">
  // Barras de uma série só (dias ou semanas), com linha de meta opcional.
  // O valor de cada barra aparece ao passar o mouse ou focar com o teclado.
  let { items, goal = null, unit, label }: {
    items: Array<{ key: string; label: string; value: number; title: string; current?: boolean }>;
    goal?: number | null;
    unit: string;
    label: string;
  } = $props();

  const max = $derived(Math.max(goal ?? 0, ...items.map((i) => i.value), 1));
  let hover = $state<string | null>(null);
  const shown = $derived(items.find((i) => i.key === hover) ?? items.find((i) => i.current) ?? items.at(-1));
</script>

<figure class="bars">
  <figcaption aria-live="polite">{#if shown}<b>{Math.round(shown.value)}</b> {unit} <span>{shown.title}</span>{/if}</figcaption>
  <div class="plot" role="list" aria-label={label} style:--n={items.length}>
    {#if goal}<i class="goal" style:bottom="{(goal / max) * 100}%"><em>meta {goal}</em></i>{/if}
    {#each items as it (it.key)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="col" role="listitem" tabindex="0" aria-label="{it.title}: {Math.round(it.value)} {unit}"
        onpointerenter={() => (hover = it.key)} onpointerleave={() => (hover = null)} onfocus={() => (hover = it.key)} onblur={() => (hover = null)}>
        <i class="bar" class:now={it.current} class:empty={it.value <= 0} style:height="{(it.value / max) * 100}%"></i>
      </div>
    {/each}
  </div>
  <div class="axis" aria-hidden="true" style:--n={items.length}>
    {#each items as it (it.key)}<span class:now={it.current}>{it.label}</span>{/each}
  </div>
</figure>

<style>
  .bars { margin: 0; display: grid; gap: var(--sp-1); min-width: 0; }
  figcaption { min-height: 20px; font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  figcaption b { font: 600 var(--fs-md) var(--f-mono); color: var(--ink); }
  figcaption span { margin-left: var(--sp-1); }
  .plot { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); height: 92px; border-bottom: 1px solid var(--line); }
  .col { display: flex; align-items: flex-end; justify-content: center; height: 100%; outline-offset: -2px; border-radius: var(--r-sm); }
  .col:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
  .bar { display: block; width: min(22px, 70%); min-height: 2px; border-radius: 4px 4px 0 0; background: color-mix(in srgb, var(--ember) 50%, var(--surface));
    transition: height var(--dur-slow) var(--ease); }
  .bar.now { background: var(--ember); }
  .bar.empty { background: var(--line); }
  .goal { position: absolute; left: 0; right: 0; height: 0; border-top: 1px dashed var(--muted); pointer-events: none; }
  .goal em { position: absolute; right: 0; bottom: 2px; padding: 0 3px; font: normal 10px var(--f-mono); color: var(--muted); background: var(--surface); }
  .axis { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  .axis span { text-align: center; font: 10px var(--f-mono); color: var(--muted); text-transform: uppercase; }
  .axis span.now { color: var(--ink); font-weight: 700; }
</style>
