<script lang="ts">
  import { SUMMARIES, display, summarize, type Group, type Row } from '@tanden/core';
  import Cell from './Cell.svelte';
  import Popover from './Popover.svelte';
  import type { ViewCtx } from './ctx';
  import { optionColor } from './bases.svelte';
  import { PROP_ICON } from './icons';

  let { ctx }: { ctx: ViewCtx } = $props();

  const widths = $derived(ctx.columns.map((id) => ctx.cfg(id).width ?? (id === 'file.name' ? 280 : ctx.type(id) === 'checkbox' ? 110 : 180)));
  const template = $derived(`${widths.map((w) => `${w}px`).join(' ')} minmax(40px, 1fr)`);
  let collapsed = $state<Record<string, boolean>>({});
  let sumMenu = $state<{ id: string; el: HTMLElement } | null>(null);
  let newName = $state('');
  let adding = $state<string | null>(null);

  // arrastar a borda do cabeçalho muda a largura da coluna
  let drag: { id: string; x: number; w: number } | null = null;
  let live = $state<{ id: string; w: number } | null>(null);
  function startResize(e: PointerEvent, id: string, w: number) {
    e.preventDefault();
    e.stopPropagation();
    drag = { id, x: e.clientX, w };
    live = { id, w };
    const move = (ev: PointerEvent) => { if (drag) live = { id: drag.id, w: Math.max(70, Math.round(drag.w + ev.clientX - drag.x)) }; };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (drag && live) ctx.config(drag.id, { width: live.w });
      drag = null;
      live = null;
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }
  const liveTemplate = $derived(live ? `${ctx.columns.map((id, i) => `${live && id === live.id ? live.w : widths[i]}px`).join(' ')} minmax(40px, 1fr)` : template);

  const sumOf = (id: string, rows: Row[]) => {
    const kind = ctx.view.summaries?.[id];
    if (!kind) return '';
    const v = summarize(kind, rows.map((r) => r.get(id)));
    const label = SUMMARIES.find((s) => s.id === kind)?.label ?? kind;
    return `${label.replace(/^Contar tudo$/, 'Total')}: ${typeof v === 'number' && ['Sum', 'Average', 'Median', 'Min', 'Max', 'Range'].includes(kind) ? display(v, ctx.cfg(id)) : display(v)}`;
  };

  function setSummary(id: string, kind: string | null) {
    const s = { ...(ctx.view.summaries ?? {}) };
    if (kind) s[id] = kind;
    else delete s[id];
    ctx.patchView({ summaries: s });
    sumMenu = null;
  }

  function quickAdd(defaults: Record<string, string | string[]> = {}) {
    const name = newName.trim();
    ctx.add(defaults, name || undefined);
    newName = '';
  }

  const groups = $derived<Array<Group | null>>(ctx.result.groups ?? [null]);
  const kindsFor = (id: string) => {
    const t = ctx.type(id);
    return SUMMARIES.filter((s) => !s.for || (s.for === 'number' && (t === 'number' || t === 'formula')) || (s.for === 'date' && ['date', 'datetime', 'created', 'edited'].includes(t)) || (s.for === 'checkbox' && t === 'checkbox'));
  };
</script>

<div class="table" style:--cols={liveTemplate}>
  <div class="head" role="row">
    {#each ctx.columns as id, i (id)}
      <div class="th" role="columnheader">
        <button class="hb" onclick={(e) => ctx.columnMenu(id, e.currentTarget as HTMLElement)}>
          <span class="ic">{PROP_ICON[ctx.type(id)] ?? 'Aa'}</span><span class="nm">{ctx.label(id)}</span>
          {#if ctx.view.sort?.some((s) => s.property === id)}<span class="srt">{ctx.view.sort.find((s) => s.property === id)?.direction === 'DESC' ? '↓' : '↑'}</span>{/if}
        </button>
        <span class="grip" role="separator" aria-orientation="vertical" onpointerdown={(e) => startResize(e, id, widths[i]!)}></span>
      </div>
    {/each}
    <div class="th end"></div>
  </div>

  {#each groups as g, gi (g ? `g:${g.label}` : 'all')}
    {@const rows = g ? g.rows : ctx.result.rows}
    {#if g}
      {@const gid = ctx.view.groupBy!.property}
      <div class="ghead">
        <button class="tog" aria-label={collapsed[g.label] ? 'Abrir grupo' : 'Fechar grupo'} class:closed={collapsed[g.label]} onclick={() => (collapsed[g.label] = !collapsed[g.label])}>▾</button>
        {#if g.label}
          {#if ['select', 'status', 'multiselect'].includes(ctx.type(gid))}<span class="db-chip" class:status={ctx.type(gid) === 'status'} style:--c={optionColor(ctx.cfg(gid), g.label)}>{g.label}</span>
          {:else}<b>{display(g.key, ctx.cfg(gid))}</b>{/if}
        {:else}<span class="db-muted">Sem {ctx.label(gid).toLowerCase()}</span>{/if}
        <span class="cnt">{g.rows.length}</span>
        <button class="db-btn add-g" onclick={() => ctx.add(ctx.groupDefaults(g))}>+</button>
      </div>
    {/if}
    {#if !g || !collapsed[g.label]}
      {#each rows as r (r.rec.path)}
        <div class="tr" role="row">
          {#each ctx.columns as id (id)}
            <div class="td" class:title={id === 'file.name'} role="cell">
              {#if id === 'file.name'}
                <button class="name" onclick={() => ctx.open(r.rec.path)} title="Abrir {r.rec.name}">
                  <span class="pg">▫</span><span>{r.rec.name}</span><span class="open">ABRIR</span>
                </button>
              {:else}
                <Cell row={r} {id} type={ctx.type(id)} cfg={ctx.cfg(id)} wrap={!!ctx.view.wrap}
                  onset={(v) => ctx.set(r, id, v)} onconfig={(p) => ctx.config(id, p)} onopen={ctx.open} />
              {/if}
            </div>
          {/each}
          <div class="td end"></div>
        </div>
      {/each}
      {#if !g}
        <div class="tr new">
          <input class="newrow" placeholder="+ Nova" bind:value={newName} onfocus={() => (adding = 'all')} onblur={() => (adding = null)}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); quickAdd(); } }} />
          {#if adding === 'all' && newName.trim()}<span class="db-hint">Enter cria "{newName.trim()}"</span>{/if}
        </div>
      {/if}
      {#if ctx.view.summaries && Object.keys(ctx.view.summaries).length}
        <div class="tr sums">
          {#each ctx.columns as id (id)}<div class="td sum">{sumOf(id, rows)}</div>{/each}
          <div class="td end"></div>
        </div>
      {/if}
    {/if}
    {#if gi === groups.length - 1}
      <div class="tr foot">
        {#each ctx.columns as id (id)}
          <button class="td calc" onclick={(e) => (sumMenu = { id, el: e.currentTarget as HTMLElement })}>
            {#if !ctx.view.summaries?.[id]}<span class="hint">Calcular ▾</span>{:else if ctx.result.groups}{sumOf(id, ctx.result.rows)}{/if}
          </button>
        {/each}
        <div class="td end"></div>
      </div>
    {/if}
  {/each}
</div>

{#if sumMenu}
  <Popover anchor={sumMenu.el} onclose={() => (sumMenu = null)}>
    <h4>Calcular {ctx.label(sumMenu.id)}</h4>
    <button class="db-item" onclick={() => setSummary(sumMenu!.id, null)}><span class="ic">∅</span>Nada</button>
    {#each kindsFor(sumMenu.id) as s (s.id)}
      <button class="db-item" class:on={ctx.view.summaries?.[sumMenu.id] === s.id} onclick={() => setSummary(sumMenu!.id, s.id)}><span class="ic">{ctx.view.summaries?.[sumMenu.id] === s.id ? '✓' : ''}</span>{s.label}</button>
    {/each}
  </Popover>
{/if}

<style>
  .table { display: grid; min-width: max-content; font-size: 13.5px; }
  .head, .tr { display: grid; grid-template-columns: var(--cols); }
  .head { position: sticky; top: 0; z-index: 4; background: var(--void); border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); }
  .th { position: relative; border-right: 1px solid color-mix(in srgb, var(--line) 60%, transparent); min-width: 0; }
  .th.end, .td.end { border-right: 0; }
  .hb { width: 100%; height: 33px; display: flex; align-items: center; gap: 7px; border: 0; background: none; padding: 0 9px; color: var(--muted);
    font: 500 12.5px var(--f-body); text-align: left; }
  .hb:hover { background: var(--surface-2); color: var(--ink); }
  .hb .ic { font-size: 11px; width: 16px; text-align: center; opacity: .8; flex: none; }
  .hb .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .srt { color: var(--ember); margin-left: auto; }
  .grip { position: absolute; right: -3px; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 2; }
  .grip:hover { background: color-mix(in srgb, var(--ember) 50%, transparent); }
  .tr { border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); }
  .tr:not(.foot):not(.sums):not(.new):hover { background: color-mix(in srgb, var(--ink) 2%, transparent); }
  .td { border-right: 1px solid color-mix(in srgb, var(--line) 60%, transparent); min-width: 0; }
  .name { width: 100%; height: 100%; min-height: 32px; display: flex; align-items: center; gap: 7px; border: 0; background: none; padding: 5px 9px; text-align: left;
    font: 600 13.5px var(--f-body); color: var(--ink); }
  .name span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pg { color: var(--muted); font-size: 12px; }
  .open { margin-left: auto; font: 600 9.5px var(--f-display); letter-spacing: .1em; color: var(--muted); border: 1px solid var(--line); border-radius: 5px;
    padding: 2px 5px; opacity: 0; transition: opacity var(--dur); background: var(--surface); }
  .tr:hover .open { opacity: 1; }
  .name:hover .open { color: var(--ember); border-color: var(--ember); }
  .new { display: flex; align-items: center; gap: 8px; border-bottom: 0; }
  .newrow { border: 0; background: none; color: var(--ink); padding: 8px 10px; font: 13.5px var(--f-body); outline: none; width: 280px; }
  .newrow::placeholder { color: var(--muted); }
  .newrow:focus { background: var(--surface); border-radius: 6px; }
  .ghead { display: flex; align-items: center; gap: 8px; padding: 14px 4px 6px; position: sticky; left: 0; width: max-content; }
  .ghead b { font: 600 13px var(--f-body); }
  .tog { border: 0; background: none; color: var(--muted); width: 22px; height: 22px; border-radius: 6px; transition: transform var(--dur) var(--ease); }
  .tog.closed { transform: rotate(-90deg); }
  .tog:hover { background: var(--surface-2); }
  .cnt { color: var(--muted); font: 11.5px var(--f-mono); }
  .add-g { opacity: 0; padding: 0 7px; }
  .ghead:hover .add-g { opacity: 1; }
  .sums .td, .foot .td { font: 11.5px var(--f-mono); color: var(--muted); text-align: right; padding: 6px 9px; border-right: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .foot { border-bottom: 0; }
  .calc { border: 0; background: none; min-height: 30px; }
  .calc .hint { opacity: 0; transition: opacity var(--dur); }
  .table:hover .calc .hint { opacity: .7; }
  .calc:hover { color: var(--ink); background: var(--surface-2); }
</style>
