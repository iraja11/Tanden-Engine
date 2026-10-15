<script lang="ts">
  import { ExprError, Link, display, isoDate, show, type PropConfig, type Row, type SelectOption, type Value } from '@tanden/core';
  import Popover from './Popover.svelte';
  import OptionPicker from './OptionPicker.svelte';
  import RelationPicker from './RelationPicker.svelte';
  import DatePicker from './DatePicker.svelte';
  import { bases, optionColor } from './bases.svelte';
  import { asStrings, isEditable } from './types';
  import { files } from '../files/files.svelte';

  // Uma célula: mostra o valor no jeito do tipo e edita no clique.
  let { row, id, type, cfg, wrap = false, compact = false, onset, onconfig, onopen }: {
    row: Row;
    id: string;
    type: string;
    cfg: PropConfig;
    wrap?: boolean;
    /** cartões e listas: sem caixa de edição grande */
    compact?: boolean;
    onset: (v: Value) => void;
    onconfig?: (patch: Partial<PropConfig>) => void;
    onopen: (path: string) => void;
  } = $props();

  const value = $derived(row.get(id));
  const editable = $derived(isEditable(id, type));
  let editing = $state(false);
  let anchor = $state<HTMLElement>();
  let draft = $state('');
  let input = $state<HTMLInputElement | HTMLTextAreaElement>();

  const textual = $derived(['text', 'number', 'url', 'email', 'phone'].includes(type));
  const strs = $derived(asStrings(value));
  const late = $derived(value instanceof Date && (type === 'date' || type === 'datetime') && value.getTime() < new Date().setHours(0, 0, 0, 0));
  const fraction = $derived(typeof value === 'number' && cfg.format?.startsWith('percent') && value >= 0 && value <= 1.0001);

  function start(e?: Event) {
    if (!editable) return;
    e?.stopPropagation();
    if (type === 'checkbox') { onset(!(value === true)); return; }
    draft = value === null ? '' : typeof value === 'number' ? String(value) : show(value);
    editing = true;
    if (textual) queueMicrotask(() => { input?.focus(); input?.select?.(); });
  }

  function commitText() {
    if (!editing) return;
    editing = false;
    const v = draft.trim();
    if (type === 'number') {
      if (v === '') return onset(null);
      const n = Number(v.replace(/\s/g, '').replace(',', '.'));
      onset(Number.isNaN(n) ? v : n);
    } else onset(v === '' ? null : v);
  }

  function setList(list: string[]) {
    if (type === 'select' || type === 'status') onset(list[0] ?? null);
    else onset(list.length ? list : null);
  }

  function setLinks(list: string[]) {
    onset(list.length ? list.map((t) => new Link(t)) : null);
  }

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const paths: string[] = [];
    for (const f of Array.from(list)) paths.push(await files.attachFile(f));
    onset([...strs, ...paths].map((p) => new Link(p)));
  }

  function imgUrl(node: HTMLImageElement, target: string) {
    void files.host.image(target).then((u) => { if (u) node.src = u; });
    return { update: (t: string) => void files.host.image(t).then((u) => { if (u) node.src = u; }) };
  }

  const isImg = (p: string) => /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(p);
  const suggestions = $derived.by(() => {
    if (!['select', 'status', 'multiselect', 'person'].includes(type)) return [];
    void bases.rev;
    const key = id.slice(5);
    const seen = new Set<string>();
    for (const n of bases.index.notes) {
      const v = n.props[key];
      for (const x of Array.isArray(v) ? v : v ? [v] : []) if (x.trim()) seen.add(x.trim());
    }
    return [...seen].slice(0, 80);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="cell" class:wrap class:editable class:editing class:compact bind:this={anchor} onclick={start}
  role={editable ? 'button' : undefined} tabindex={editable ? 0 : undefined}
  onkeydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !editing && e.target === anchor) { e.preventDefault(); start(); } }}>
  {#if editing && textual}
    {#if type === 'text' && !compact}
      <textarea bind:this={input} class="ed" bind:value={draft} rows="1" onblur={commitText}
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') { e.stopPropagation(); editing = false; } }}></textarea>
    {:else}
      <input bind:this={input} class="ed" bind:value={draft} inputmode={type === 'number' ? 'decimal' : type === 'phone' ? 'tel' : undefined}
        type={type === 'email' ? 'email' : 'text'} onblur={commitText}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } if (e.key === 'Escape') { e.stopPropagation(); editing = false; } }} />
    {/if}
  {:else if value instanceof ExprError}
    <span class="db-err" title={value.message}>#erro</span>
  {:else if type === 'checkbox'}
    <span class="db-check" class:on={value === true} role="checkbox" aria-checked={value === true}></span>
  {:else if type === 'select' || type === 'status' || type === 'multiselect' || type === 'person'}
    <span class="db-chips">
      {#each strs as s (s)}<span class="db-chip" class:status={type === 'status'} style:--c={optionColor(cfg, s)}>{type === 'person' ? '☺ ' : ''}{s}</span>{/each}
    </span>
  {:else if type === 'relation' || (Array.isArray(value) && value.some((x) => x instanceof Link)) || value instanceof Link}
    <span class="db-chips">
      {#each strs as s (s)}
        {@const hit = bases.index.find(s)}
        <button class="db-chip link" onclick={(e) => { e.stopPropagation(); if (hit) onopen(hit.path); else files.openLink(s); }}>{s.split('/').pop()}</button>
      {/each}
    </span>
  {:else if type === 'files'}
    <span class="db-chips">
      {#each strs as s (s)}
        {#if isImg(s)}<img class="db-thumb" alt="" use:imgUrl={s} />{:else}<span class="db-chip">{s.split('/').pop()}</span>{/if}
      {/each}
    </span>
  {:else if type === 'url' && typeof value === 'string'}
    <a class="db-url" href={value} target="_blank" rel="noopener" onclick={(e) => { e.stopPropagation(); e.preventDefault(); files.openLink(value); }}>{value.replace(/^https?:\/\/(www\.)?/, '')}</a>
  {:else if type === 'email' && typeof value === 'string'}
    <a class="db-url" href="mailto:{value}" onclick={(e) => e.stopPropagation()}>{value}</a>
  {:else if type === 'phone' && typeof value === 'string'}
    <a class="db-url" href="tel:{value}" onclick={(e) => e.stopPropagation()}>{value}</a>
  {:else if fraction && typeof value === 'number'}
    <span class="db-bar" class:done={value >= 1}><i><b style:width="{Math.min(100, value * 100)}%"></b></i>{display(value, cfg)}</span>
  {:else if value === null || value === '' || (Array.isArray(value) && !value.length)}
    <span class="db-empty">{compact ? '' : ' '}</span>
  {:else if typeof value === 'boolean'}
    <span class="db-check" class:on={value}></span>
  {:else}
    <span class="txt" class:db-late={late} class:num={typeof value === 'number'}>{display(value, cfg)}</span>
  {/if}
</div>

{#if editing && !textual && anchor}
  <Popover {anchor} onclose={() => (editing = false)}>
    {#if type === 'select' || type === 'status' || type === 'multiselect' || type === 'person'}
      <OptionPicker {cfg} selected={strs} multi={type === 'multiselect' || type === 'person'} {suggestions}
        onpick={(l) => { setList(l); if (type === 'select' || type === 'status') editing = false; }}
        onconfig={onconfig ? (o: SelectOption[]) => onconfig({ options: o }) : undefined} />
    {:else if type === 'relation'}
      <RelationPicker target={cfg.target} selected={strs} onpick={setLinks}
        oncreate={(name, folder) => { const p = bases.newPage(folder ? `${folder}.md` : null, null, name); setLinks([...strs, p.replace(/\.md$/, '').split('/').pop()!]); }} />
    {:else if type === 'date' || type === 'datetime' || type === 'created' || type === 'edited'}
      <DatePicker value={value instanceof Date ? value : null} time={type === 'datetime'} onpick={(d) => { onset(d); if (type === 'date') editing = false; }} />
    {:else if type === 'files'}
      <div class="files">
        {#each strs as s (s)}
          <div class="db-row"><span class="nm">{s.split('/').pop()}</span><button class="db-btn danger" onclick={() => onset(strs.filter((x) => x !== s).map((x) => new Link(x)))}>Tirar</button></div>
        {/each}
        <label class="db-btn line up">Enviar arquivo<input type="file" multiple hidden onchange={(e) => void addFiles((e.currentTarget as HTMLInputElement).files)} /></label>
        <input class="db-input" placeholder="ou cole um link de imagem e Enter" onkeydown={(e) => { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (e.key === 'Enter' && v) { onset([...strs, v].map((x) => new Link(x))); (e.currentTarget as HTMLInputElement).value = ''; } }} />
      </div>
    {:else}
      <input class="db-input" value={value instanceof Date ? isoDate(value) : show(value)} onchange={(e) => onset((e.currentTarget as HTMLInputElement).value || null)} />
    {/if}
  </Popover>
{/if}

<style>
  .cell { position: relative; min-height: 32px; height: 100%; display: flex; align-items: center; padding: 5px 9px; min-width: 0; overflow: hidden; outline: none; }
  .cell.compact { min-height: 0; padding: 0; height: auto; }
  .cell.editable { cursor: default; }
  .cell.editable:not(.compact):hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
  .cell:focus-visible { box-shadow: inset 0 0 0 2px var(--ember); }
  .cell.editing { overflow: visible; z-index: 3; }
  .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .wrap .txt { white-space: normal; overflow-wrap: anywhere; }
  .wrap .db-chips { flex-wrap: wrap; }
  .db-chips { flex-wrap: nowrap; overflow: hidden; }
  .num { margin-left: auto; font-variant-numeric: tabular-nums; }
  .ed { position: absolute; left: -1px; top: -1px; min-width: calc(100% + 2px); width: calc(100% + 2px); min-height: calc(100% + 2px); z-index: 4;
    background: var(--surface); color: var(--ink); border: 2px solid var(--ember); border-radius: 6px; padding: 5px 8px; font: 13.5px/1.45 var(--f-body);
    outline: none; resize: none; box-shadow: 0 12px 30px -12px var(--shadow); field-sizing: content; max-height: 260px; }
  .compact .ed { position: static; min-width: 0; width: 100%; min-height: 0; padding: 2px 6px; }
  textarea.ed { min-width: 260px; }
  .files { display: grid; gap: 6px; padding: 4px; min-width: 240px; }
  .files .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .up { justify-content: center; cursor: pointer; }
</style>
