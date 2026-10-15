<script lang="ts">
  import { pageTree, type PageNode } from '@tanden/core';
  import { bases } from './bases.svelte';
  import { slide } from 'svelte/transition';
  import { theme } from '../theme.svelte';

  // Notas em árvore: subpáginas de "X.md" moram em "X/", como no Notion.
  let { notes, active, onopen, filter = '' }: {
    notes: string[];
    active: string | null;
    onopen: (path: string) => void;
    filter?: string;
  } = $props();

  const KEY = 'tanden.tree.open';
  let open = $state<Record<string, boolean>>(load());
  function load(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
  }
  function toggle(dir: string) {
    open = { ...open, [dir]: !open[dir] };
    try { localStorage.setItem(KEY, JSON.stringify(open)); } catch { /* só nesta sessão */ }
  }

  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visible = $derived(filter.trim() ? notes.filter((p) => fold(p).includes(fold(filter.trim()))) : notes);
  const tree = $derived(pageTree(visible));
  const dbs = $derived(new Set(bases.databases.map((d) => d.path)));

  // a nota ativa fica sempre visível: abre os pais dela
  $effect(() => {
    if (!active || !active.includes('/')) return;
    const parts = active.split('/').slice(0, -1);
    const need = parts.map((_, i) => parts.slice(0, i + 1).join('/')).filter((d) => !open[d]);
    if (need.length) open = { ...open, ...Object.fromEntries(need.map((d) => [d, true])) };
  });

  function sub(n: PageNode, e: MouseEvent) {
    e.stopPropagation();
    const parent = n.path ?? `${n.dir}.md`;
    const p = bases.newPage(parent);
    open = { ...open, [n.dir]: true };
    onopen(p);
  }
</script>

{#snippet branch(nodes: PageNode[], depth: number)}
  {#each nodes as n (n.dir + (n.path ?? ''))}
    {@const kids = n.children.length > 0}
    {@const isOpen = !!filter.trim() || !!open[n.dir]}
    <li>
      <div class="row" class:active={!!n.path && n.path === active} style:--d={depth}>
        {#if kids}
          <button class="tw" class:closed={!isOpen} aria-label={isOpen ? 'Fechar' : 'Abrir'} onclick={() => toggle(n.dir)}>▾</button>
        {:else}<span class="tw sp"></span>{/if}
        <button class="nm" draggable={!!n.path} title={n.path ?? n.dir}
          ondragstart={(e) => n.path && e.dataTransfer?.setData('text/tanden-note', n.path)}
          onclick={() => (n.path ? onopen(n.path) : toggle(n.dir))}>
          <span class="ic">{n.path ? (dbs.has(n.path) ? '▤' : kids ? '❐' : '▫') : '▸'}</span><span class="t">{n.name}</span>
        </button>
        <button class="plus" title="Nova subpágina" aria-label="Nova subpágina em {n.name}" onclick={(e) => sub(n, e)}>+</button>
      </div>
      {#if kids && isOpen}
        <ul transition:slide={{ duration: theme.ms(180) }}>{@render branch(n.children, depth + 1)}</ul>
      {/if}
    </li>
  {/each}
{/snippet}

<ul class="tree">{@render branch(tree, 0)}</ul>

<style>
  ul { list-style: none; margin: 0; padding: 0; }
  .row { display: flex; align-items: center; border-radius: 8px; padding-left: calc(var(--d) * 14px); border-left: 2px solid transparent;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease); }
  .row:hover { background: var(--surface-2); }
  .row.active { background: var(--surface-2); border-left-color: var(--ember); }
  .tw { width: 20px; height: 26px; flex: none; border: 0; background: none; color: var(--muted); font-size: 11px; padding: 0; transition: transform var(--dur) var(--ease); }
  .tw.closed { transform: rotate(-90deg); }
  .tw:hover { color: var(--ink); }
  .nm { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; border: 0; background: none; padding: 6px 4px; text-align: left; color: var(--ink); }
  .ic { color: var(--muted); font-size: 11.5px; width: 12px; text-align: center; flex: none; }
  .row.active .ic { color: var(--ember); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: 13.5px; }
  .row.active .t { font-weight: 600; }
  .plus { width: 22px; height: 22px; margin-right: 4px; border: 0; border-radius: 6px; background: none; color: var(--muted); opacity: 0; flex: none; }
  .row:hover .plus, .plus:focus-visible { opacity: 1; }
  .plus:hover { background: var(--surface); color: var(--ember); }
  @media (hover: none) { .plus { opacity: .6; } }
</style>
