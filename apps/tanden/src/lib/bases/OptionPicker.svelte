<script lang="ts">
  import { COLORS, COLOR_LABEL, type OptionColor, type PropConfig, type SelectOption } from '@tanden/core';
  import { OPTION_HEX, optionColor } from './bases.svelte';

  // Escolher (ou criar) opções de seleção, seleção múltipla e status.
  let { cfg, selected, multi, suggestions = [], onpick, onconfig }: {
    cfg: PropConfig;
    selected: string[];
    multi: boolean;
    /** valores já usados nas notas, mesmo sem estar nas opções */
    suggestions?: string[];
    onpick: (values: string[]) => void;
    onconfig?: (options: SelectOption[]) => void;
  } = $props();

  let query = $state('');
  let editing = $state<string | null>(null);
  let input = $state<HTMLInputElement>();
  $effect(() => { input?.focus(); });

  const all = $derived.by(() => {
    const opts = [...(cfg.options ?? [])];
    for (const s of suggestions) if (!opts.some((o) => o.value === s)) opts.push({ value: s });
    return opts;
  });
  const shown = $derived(all.filter((o) => o.value.toLowerCase().includes(query.trim().toLowerCase())));
  const exact = $derived(all.some((o) => o.value.toLowerCase() === query.trim().toLowerCase()));
  const groups = cfg.type === 'status'
    ? [{ id: 'todo', label: 'A fazer' }, { id: 'doing', label: 'Em andamento' }, { id: 'done', label: 'Concluído' }] as const
    : null;

  function toggle(v: string) {
    if (multi) onpick(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    else onpick(selected[0] === v ? [] : [v]);
  }

  function create() {
    const v = query.trim();
    if (!v) return;
    const used = new Set((cfg.options ?? []).map((o) => o.color));
    const color = (COLORS.find((c) => !used.has(c) && c !== 'gray') ?? 'gray') as OptionColor;
    onconfig?.([...(cfg.options ?? []), { value: v, color, ...(cfg.type === 'status' ? { group: 'todo' as const } : {}) }]);
    toggle(v);
    query = '';
  }

  function patch(value: string, p: Partial<SelectOption> | null) {
    const list = [...(cfg.options ?? [])];
    const i = list.findIndex((o) => o.value === value);
    if (p === null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = { ...list[i]!, ...p };
    else list.push({ value, ...p });
    onconfig?.(list);
  }

  function move(value: string, d: number) {
    const list = [...(cfg.options ?? [])];
    const i = list.findIndex((o) => o.value === value);
    const j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    onconfig?.(list);
  }
</script>

<div class="picker">
  <div class="db-row sel">
    {#each selected as v (v)}
      <span class="db-chip" class:status={cfg.type === 'status'} style:--c={optionColor(cfg, v)}>{v}
        <button class="x" aria-label="Tirar {v}" onclick={() => toggle(v)}>×</button></span>
    {/each}
    <input bind:this={input} class="q" bind:value={query} placeholder={selected.length ? '' : 'Buscar ou criar opção'}
      onkeydown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (shown[0] && (exact || !query.trim())) toggle(shown.find((o) => o.value.toLowerCase() === query.trim().toLowerCase())?.value ?? shown[0].value); else create(); if (!multi) query = ''; }
        if (e.key === 'Backspace' && !query && selected.length) toggle(selected[selected.length - 1]!);
      }} />
  </div>
  <hr />
  {#snippet option(o: SelectOption)}
    <div class="opt">
      <button class="db-item" class:sel={selected.includes(o.value)} onclick={() => toggle(o.value)}>
        <span class="db-chip" class:status={cfg.type === 'status'} style:--c={optionColor(cfg, o.value)}>{o.value}</span>
        {#if selected.includes(o.value)}<span class="r">✓</span>{/if}
      </button>
      {#if onconfig}
        <button class="more" aria-label="Editar opção" onclick={() => (editing = editing === o.value ? null : o.value)}>⋯</button>
      {/if}
    </div>
    {#if editing === o.value && onconfig}
      <div class="edit">
        <input class="db-input" value={o.value} aria-label="Nome da opção"
          onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v && v !== o.value) { patch(o.value, { value: v }); editing = v; } }} />
        <div class="db-swatches">
          {#each COLORS as c (c)}
            <button class:on={(o.color ?? '') === c} style:--c={OPTION_HEX[c]} title={COLOR_LABEL[c]} aria-label={COLOR_LABEL[c]} onclick={() => patch(o.value, { color: c })}></button>
          {/each}
        </div>
        {#if groups}
          <select class="db-select" value={o.group ?? 'todo'} onchange={(e) => patch(o.value, { group: (e.currentTarget as HTMLSelectElement).value as SelectOption['group'] })}>
            {#each groups as g (g.id)}<option value={g.id}>{g.label}</option>{/each}
          </select>
        {/if}
        <div class="db-row">
          <button class="db-btn" onclick={() => move(o.value, -1)}>↑</button>
          <button class="db-btn" onclick={() => move(o.value, 1)}>↓</button>
          <button class="db-btn danger" onclick={() => { patch(o.value, null); editing = null; }}>Excluir opção</button>
        </div>
      </div>
    {/if}
  {/snippet}
  {#if groups}
    {#each groups as g (g.id)}
      {@const items = shown.filter((o) => (o.group ?? 'todo') === g.id)}
      {#if items.length}<h4>{g.label}</h4>{#each items as o (o.value)}{@render option(o)}{/each}{/if}
    {/each}
  {:else}
    {#each shown as o (o.value)}{@render option(o)}{/each}
  {/if}
  {#if query.trim() && !exact}
    <button class="db-item" onclick={create}><span class="ic">+</span>Criar <span class="db-chip" style:--c={optionColor({}, query.trim())}>{query.trim()}</span></button>
  {/if}
  {#if !shown.length && !query.trim()}<p class="db-hint">Digite para criar a primeira opção.</p>{/if}
</div>

<style>
  .picker { display: grid; min-width: 240px; }
  .sel { flex-wrap: wrap; padding: 4px 6px; }
  .q { flex: 1; min-width: 80px; border: 0; background: none; color: var(--ink); font: 13px var(--f-body); outline: none; padding: 3px 0; }
  .opt { display: flex; align-items: center; }
  .opt .db-item { flex: 1; min-width: 0; }
  .more { border: 0; background: none; color: var(--muted); border-radius: 6px; width: 26px; height: 26px; opacity: 0; }
  .opt:hover .more, .more:focus { opacity: 1; }
  .more:hover { background: var(--surface-2); color: var(--ink); }
  .edit { display: grid; gap: 4px; padding: 6px 8px 8px; margin: 0 4px 4px; border-radius: 8px; background: var(--surface-2); }
</style>
