<script lang="ts">
  import type { CompBase, Edition } from '@tanden/core';
  import CompEntry from './CompEntry.svelte';

  // Lista de escolha do compêndio (magias, talentos, invocações...): busca,
  // marcar até um limite e abrir o texto de cada uma sem sair da lista.
  let { items, kind, selected, max = Infinity, ed, sub, onchange, group, disabled }: {
    items: CompBase[];
    kind: string;
    selected: string[];
    /** quantas dá para marcar (Infinity = sem limite) */
    max?: number;
    ed: Edition;
    /** linha de apoio de cada item */
    sub?: (x: CompBase) => string;
    onchange: (next: string[]) => void;
    /** título de grupo (ex.: círculo da magia) */
    group?: (x: CompBase) => string;
    /** itens que não dá para marcar (já tem, falta pré-requisito) e o motivo */
    disabled?: (x: CompBase) => string | null;
  } = $props();

  let q = $state('');
  let open = $state<string | null>(null);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = $derived(q.trim() ? items.filter((x) => norm(x.name).includes(norm(q.trim()))) : items);
  const full = $derived(selected.length >= max);

  function toggle(name: string) {
    const on = selected.includes(name);
    if (on) onchange(selected.filter((x) => x !== name));
    else if (max === 1) onchange([name]);
    else if (!full) onchange([...selected, name]);
  }
</script>

<div class="pl">
  <div class="plbar">
    <input class="field" bind:value={q} placeholder="Filtrar…" aria-label="Filtrar" />
    {#if max !== Infinity}<span class="count mono" class:done={selected.length === max}>{selected.length}/{max}</span>{/if}
  </div>
  {#if selected.length}
    <div class="chips">{#each selected as s (s)}<button class="chip on" onclick={() => toggle(s)} title="Desmarcar">{s} ×</button>{/each}</div>
  {/if}
  <ul>
    {#each shown as x, i (`${x.name}|${x.source}`)}
      {@const on = selected.includes(x.name)}
      {@const why = disabled?.(x) ?? null}
      {@const g = group?.(x) ?? ''}
      {#if g && (i === 0 || group?.(shown[i - 1]!) !== g)}<li class="ghead">{g}</li>{/if}
      <li class:on>
        <div class="row">
          <button class="pick" class:on disabled={(!on && (full && max !== 1)) || (!!why && !on)} onclick={() => toggle(x.name)} aria-pressed={on} aria-label={`${on ? 'Desmarcar' : 'Marcar'} ${x.name}`}><i></i></button>
          <button class="name" onclick={() => (open = open === x.name ? null : x.name)}>
            <b>{x.name}</b>
            <small>{why ?? sub?.(x) ?? ''}</small>
          </button>
        </div>
        {#if open === x.name}<div class="detail"><CompEntry {kind} item={x} {ed} headless /></div>{/if}
      </li>
    {/each}
    {#if !shown.length}<li class="dim small">Nada aqui.</li>{/if}
  </ul>
</div>

<style>
  .pl { display: grid; gap: 8px; min-width: 0; }
  .plbar { display: flex; gap: 8px; align-items: center; }
  .plbar input { flex: 1; }
  .count { font-size: 12px; color: var(--muted); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
  .count.done { color: var(--ok); border-color: var(--ok); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 46vh; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; padding: 4px; background: var(--void); }
  li.on { background: color-mix(in srgb, var(--ember) 8%, transparent); border-radius: 8px; }
  .ghead { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); padding: 8px 8px 2px; }
  .row { display: flex; align-items: center; gap: 4px; }
  .pick { width: 30px; height: 30px; border: 0; background: none; display: grid; place-items: center; flex: none; padding: 0; }
  .pick i { width: 11px; height: 11px; transform: rotate(45deg); border: 1.5px solid var(--muted); border-radius: 2px; }
  .pick.on i { background: var(--ember); border-color: var(--ember); }
  .pick:disabled { opacity: .35; }
  .name { flex: 1; min-width: 0; text-align: left; border: 0; background: none; padding: 4px 6px; display: grid; color: var(--ink); border-radius: 8px; }
  .name:hover { background: var(--surface-2); }
  .name b { font-size: 13.5px; font-weight: 600; }
  .name small { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail { padding: 6px 10px 10px 40px; }
</style>
