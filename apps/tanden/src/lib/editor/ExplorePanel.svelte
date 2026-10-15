<script lang="ts">
  import { engine } from '../engine.svelte';
  import { notes } from './notes.svelte';
  import { noteName } from './host';

  // O "cérebro" no painel da esquerda: árvore de tags, links para notas que não existem e notas soltas.
  let { onopen }: { onopen: (path: string) => void } = $props();

  type TagNode = { name: string; full: string; count: number; kids: TagNode[] };
  const data = $derived.by(() => {
    void notes.rev;
    void engine.notes;
    const ix = notes.brain;
    const root: TagNode[] = [];
    const byFull = new Map<string, TagNode>();
    const all = ix.tags({ parents: true }).sort((a, b) => a.tag.localeCompare(b.tag, 'pt-BR'));
    for (const t of all) {
      const parts = t.tag.split('/');
      const node: TagNode = { name: parts[parts.length - 1]!, full: t.tag, count: t.count, kids: [] };
      byFull.set(t.tag.toLowerCase(), node);
      const parent = parts.length > 1 ? byFull.get(parts.slice(0, -1).join('/').toLowerCase()) : null;
      (parent ? parent.kids : root).push(node);
    }
    const sortTree = (xs: TagNode[]) => { xs.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')); xs.forEach((x) => sortTree(x.kids)); };
    sortTree(root);
    return { tags: root, unresolved: ix.unresolved(), orphans: ix.orphans().filter((p) => !p.startsWith('Modelos/')) };
  });

  const KEY = 'tanden.explorar';
  let open = $state<Record<string, boolean>>(load());
  function load(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '{"tags":true}') as Record<string, boolean>; } catch { return { tags: true }; }
  }
  function flip(k: string) {
    open = { ...open, [k]: !open[k] };
    try { localStorage.setItem(KEY, JSON.stringify(open)); } catch { /* só nesta sessão */ }
  }

  function create(target: string) {
    notes.openLink(target);
    const p = notes.brain.resolve(target);
    if (p) onopen(p);
  }
</script>

{#snippet tagTree(nodes: TagNode[], depth: number)}
  {#each nodes as t (t.full)}
    <li>
      <div class="row" style:--d={depth}>
        {#if t.kids.length}
          <button class="tw" class:closed={!open[`#${t.full}`]} onclick={() => flip(`#${t.full}`)} aria-label="Abrir">▾</button>
        {:else}<span class="tw"></span>{/if}
        <button class="tag" onclick={() => notes.searchFor(`tag:#${t.full}`)} title="Notas com #{t.full}">#{t.name}</button>
        <span class="n">{t.count}</span>
      </div>
      {#if t.kids.length && open[`#${t.full}`]}<ul>{@render tagTree(t.kids, depth + 1)}</ul>{/if}
    </li>
  {/each}
{/snippet}

<div class="explore">
  <section>
    <button class="h" onclick={() => flip('tags')}><span class:closed={!open.tags}>▾</span>Tags <i>{data.tags.length}</i></button>
    {#if open.tags}
      {#if data.tags.length}
        <ul>{@render tagTree(data.tags, 0)}</ul>
      {:else}
        <p class="empty">Escreva <code>#algo</code> numa nota ou use a propriedade <code>tags</code>.</p>
      {/if}
    {/if}
  </section>
  <section>
    <button class="h" onclick={() => flip('missing')}><span class:closed={!open.missing}>▾</span>Links sem nota <i>{data.unresolved.length}</i></button>
    {#if open.missing}
      <ul>
        {#each data.unresolved.slice(0, 200) as u (u.target)}
          <li class="row">
            <button class="mk" onclick={() => create(u.target)} title="Criar a nota {u.target}">+ {u.target.split('/').pop()}</button>
            <button class="from" onclick={() => onopen(u.from[0]!)} title={u.from.map(noteName).join(', ')}>{u.from.length === 1 ? noteName(u.from[0]!) : `${u.from.length} notas`}</button>
          </li>
        {:else}
          <p class="empty">Todo [[link]] leva a uma nota que existe.</p>
        {/each}
      </ul>
    {/if}
  </section>
  <section>
    <button class="h" onclick={() => flip('orphans')}><span class:closed={!open.orphans}>▾</span>Notas soltas <i>{data.orphans.length}</i></button>
    {#if open.orphans}
      <p class="hint">Sem nenhum link entrando nem saindo.</p>
      <ul>
        {#each data.orphans.slice(0, 200) as p (p)}
          <li><button class="note" onclick={() => onopen(p)} title={p}>{noteName(p)}</button></li>
        {:else}
          <p class="empty">Nenhuma: todas as notas estão ligadas.</p>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .explore { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 16px; }
  ul { list-style: none; margin: 0; padding: 0; }
  section { margin-bottom: 10px; }
  .h { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none; padding: 6px 6px; text-align: left;
    font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .h span { font-size: 10px; transition: transform var(--dur) var(--ease); }
  .h span.closed { transform: rotate(-90deg); }
  .h i { margin-left: auto; font: 11px var(--f-mono); font-style: normal; color: var(--ember); letter-spacing: 0; }
  .row { display: flex; align-items: center; gap: 4px; padding-left: calc(var(--d, 0) * 14px); border-radius: 7px; }
  .row:hover { background: var(--surface-2); }
  .tw { width: 18px; height: 24px; flex: none; border: 0; background: none; color: var(--muted); font-size: 10px; padding: 0; transition: transform var(--dur) var(--ease); }
  .tw.closed { transform: rotate(-90deg); }
  .tag { flex: 1; min-width: 0; text-align: left; border: 0; background: none; padding: 4px 2px; color: var(--ember-soft); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .n { font: 11px var(--f-mono); color: var(--muted); padding-right: 8px; }
  .mk { flex: 1; min-width: 0; text-align: left; border: 0; background: none; padding: 4px 8px; color: var(--muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mk:hover { color: var(--ember); }
  .from { flex: none; max-width: 45%; border: 0; background: none; font: 11px var(--f-mono); color: var(--muted); padding: 2px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .from:hover { color: var(--ink); }
  .note { width: 100%; text-align: left; border: 0; background: none; padding: 4px 8px; border-radius: 7px; color: var(--ink); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note:hover { background: var(--surface-2); }
  .empty, .hint { color: var(--muted); font-size: 12px; line-height: 1.5; padding: 0 8px; margin: 2px 0 6px; }
  code { font: 11px var(--f-mono); color: var(--ember-soft); }
</style>
