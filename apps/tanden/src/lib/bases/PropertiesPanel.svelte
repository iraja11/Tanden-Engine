<script lang="ts">
  import { focus } from './actions';
  import './bases.css';
  import { PROP_TYPES, propConfig, propLabel, runView, setProp, type BaseDef, type PropConfig, type PropType, type Value } from '@tanden/core';
  import { bases } from './bases.svelte';
  import Cell from './Cell.svelte';
  import Popover from './Popover.svelte';
  import { typeOf } from './types';
  import { PROP_ICON } from './icons';

  // Propriedades no topo de uma nota, editáveis como no Notion. Se a nota é
  // linha de um banco, os tipos, opções e fórmulas vêm do banco.
  let { path, onopen }: { path: string; onopen: (p: string) => void } = $props();

  const HIDE = new Set(['position', 'cssclasses']);
  const owner = $derived(bases.configFor(path));
  const def = $derived<BaseDef>(owner?.def ?? { views: [] });
  const row = $derived.by(() => {
    void bases.rev;
    const v = { type: 'table', name: '', filters: `file.path == ${JSON.stringify(path)}` };
    return runView({ ...def, filters: undefined }, v, bases.index).rows[0] ?? null;
  });
  const keys = $derived(row ? Object.keys(row.rec.props).filter((k) => !HIDE.has(k)) : []);
  const formulas = $derived(Object.keys(def.formulas ?? {}));
  let open = $state(true);
  let adding = $state<HTMLElement | null>(null);
  let newName = $state('');
  let newType = $state<PropType>('text');

  function set(id: string, v: Value) {
    bases.setCell(path, id, v, propConfig(def, id));
  }
  function config(id: string, patch: Partial<PropConfig>) {
    if (!owner) return;
    const d = structuredClone($state.snapshot(def)) as BaseDef;
    const props = (d.properties ??= {});
    props[id] = { ...(props[id] ?? {}), ...patch };
    bases.saveBlock(owner.notePath, 0, d);
  }
  function create() {
    const k = newName.trim();
    if (!k) return;
    const initial = newType === 'checkbox' ? 'false' : newType === 'multiselect' || newType === 'relation' || newType === 'person' ? [] : '';
    bases.update(path, (t) => setProp(t, k, initial as string | string[]));
    if (owner && newType !== 'text') config(`note.${k}`, { type: newType });
    newName = '';
    adding = null;
  }
</script>

{#if row && keys.length + formulas.length === 0}
  <button class="addp solo" onclick={(e) => (adding = e.currentTarget as HTMLElement)}>+ Propriedade</button>
{:else if row}
  <section class="props">
    <button class="head" onclick={() => (open = !open)}>
      <span class="tw" class:closed={!open}>▾</span> Propriedades <span class="n">{keys.length + formulas.length}</span>
      {#if owner}<span class="db" title="Tipos vindos do banco">· {owner.notePath.split('/').pop()?.replace(/\.md$/, '')}</span>{/if}
    </button>
    {#if open}
      <div class="grid">
        {#each keys as k (k)}
          {@const id = `note.${k}`}
          {@const t = typeOf(def, id, row.get(id))}
          <div class="k"><span class="ic">{PROP_ICON[t] ?? 'Aa'}</span>{propLabel(def, id)}</div>
          <div class="v"><Cell {row} {id} type={t} cfg={propConfig(def, id)} wrap onset={(v) => set(id, v)} onconfig={owner ? (p) => config(id, p) : undefined} {onopen} /></div>
        {/each}
        {#each formulas as f (f)}
          {@const id = `formula.${f}`}
          <div class="k"><span class="ic">ƒ</span>{propLabel(def, id)}</div>
          <div class="v"><Cell {row} {id} type="formula" cfg={propConfig(def, id)} wrap onset={() => {}} {onopen} /></div>
        {/each}
      </div>
      <button class="addp" onclick={(e) => (adding = e.currentTarget as HTMLElement)}>+ Adicionar propriedade</button>
    {/if}
  </section>
{/if}

{#if adding}
  <Popover anchor={adding} onclose={() => (adding = null)}>
    <div class="np">
      <input class="db-input" placeholder="Nome da propriedade" bind:value={newName} onkeydown={(e) => { if (e.key === 'Enter') create(); }} use:focus />
      <select class="db-select" bind:value={newType}>{#each PROP_TYPES.filter((t) => !['created', 'edited'].includes(t.id)) as t (t.id)}<option value={t.id}>{t.icon}  {t.label}</option>{/each}</select>
      <button class="db-btn primary" disabled={!newName.trim()} onclick={create}>Adicionar</button>
    </div>
  </Popover>
{/if}

<style>
  .props { margin: 4px 0 6px; }
  .head { display: flex; align-items: center; gap: 6px; border: 0; background: none; padding: 4px 0; color: var(--muted); font: 600 10.5px var(--f-display);
    letter-spacing: .12em; text-transform: uppercase; }
  .head:hover { color: var(--ink); }
  .tw { transition: transform var(--dur) var(--ease); display: inline-block; }
  .tw.closed { transform: rotate(-90deg); }
  .n { font-family: var(--f-mono); color: var(--ember); letter-spacing: 0; }
  .db { text-transform: none; letter-spacing: 0; font: 11.5px var(--f-body); }
  .grid { display: grid; grid-template-columns: minmax(110px, 170px) minmax(0, 1fr); align-items: stretch; }
  .k { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; padding: 0 8px 0 2px; min-height: 32px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .k .ic { width: 16px; text-align: center; font-size: 11px; flex: none; }
  .v { min-width: 0; border-radius: 6px; }
  .addp { border: 0; background: none; color: var(--muted); font-size: 12.5px; padding: 6px 2px; }
  .addp:hover { color: var(--ember); }
  .addp.solo { opacity: .55; padding: 2px 0; font-size: 12px; }
  .addp.solo:hover { opacity: 1; }
  .np { display: grid; gap: 6px; padding: 4px; width: 240px; }
</style>
