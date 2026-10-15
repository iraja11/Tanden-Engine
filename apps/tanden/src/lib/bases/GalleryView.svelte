<script lang="ts">
  import { show, Link } from '@tanden/core';
  import Cell from './Cell.svelte';
  import type { ViewCtx } from './ctx';
  import { files } from '../files/files.svelte';
  import { bases } from './bases.svelte';

  let { ctx, list = false }: { ctx: ViewCtx; list?: boolean } = $props();

  const fields = $derived(ctx.columns.filter((c) => c !== 'file.name'));
  const size = $derived(ctx.view.cardSize ?? 230);

  function cover(path: string, rowImage: unknown): string | null {
    const id = ctx.view.image;
    if (id === 'none') return null;
    if (id) {
      const v = rowImage;
      const first = Array.isArray(v) ? v[0] : v;
      if (first instanceof Link) return first.target;
      return first ? show(first as never) : null;
    }
    return bases.index.byPath.get(path)?.image ?? null;
  }

  function img(node: HTMLImageElement, target: string) {
    const load = (t: string) => void files.host.image(t).then((u) => { if (u) node.src = u; else node.closest('.cover')?.classList.add('none'); });
    load(target);
    return { update: load };
  }

  let name = $state('');
</script>

{#if list}
  <div class="list">
    {#each ctx.result.rows as r (r.rec.path)}
      <div class="li">
        <button class="t" onclick={() => ctx.open(r.rec.path)}><span class="pg">▫</span>{r.rec.name}</button>
        <div class="props">
          {#each fields as id (id)}
            {@const v = r.get(id)}
            {#if v !== null && v !== '' && !(Array.isArray(v) && !v.length)}
              <div class="p"><Cell row={r} {id} type={ctx.type(id)} cfg={ctx.cfg(id)} compact onset={(x) => ctx.set(r, id, x)} onconfig={(p) => ctx.config(id, p)} onopen={ctx.open} /></div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
    <input class="newrow" placeholder="+ Nova" bind:value={name} onkeydown={(e) => { if (e.key === 'Enter') { ctx.add({}, name.trim() || undefined); name = ''; } }} />
  </div>
{:else}
  <div class="gallery" style:--w="{size}px">
    {#each ctx.result.rows as r (r.rec.path)}
      {@const c = cover(r.rec.path, ctx.view.image ? r.get(ctx.view.image) : null)}
      <article class="card">
        <button class="cover" class:none={!c} onclick={() => ctx.open(r.rec.path)} aria-label="Abrir {r.rec.name}">
          {#if c}<img alt="" use:img={c} />{:else}<span class="ph">{r.rec.name.slice(0, 1).toUpperCase()}</span>{/if}
        </button>
        <div class="body">
          <button class="t" onclick={() => ctx.open(r.rec.path)}>{r.rec.name}</button>
          {#each fields as id (id)}
            {@const v = r.get(id)}
            {#if v !== null && v !== '' && !(Array.isArray(v) && !v.length)}
              <div class="p"><Cell row={r} {id} type={ctx.type(id)} cfg={ctx.cfg(id)} compact wrap onset={(x) => ctx.set(r, id, x)} onconfig={(p) => ctx.config(id, p)} onopen={ctx.open} /></div>
            {/if}
          {/each}
        </div>
      </article>
    {/each}
    <button class="card new" onclick={() => ctx.add()}>+ Nova</button>
  </div>
{/if}

<style>
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--w), 1fr)); gap: 14px; padding: 4px 2px 18px; }
  .card { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: hidden; display: flex; flex-direction: column;
    transition: border-color var(--dur), transform var(--dur) var(--spring), box-shadow var(--dur); }
  .card:hover { border-color: color-mix(in srgb, var(--ember) 45%, var(--line)); transform: translateY(-2px); box-shadow: 0 18px 30px -22px var(--shadow); }
  .cover { aspect-ratio: 16 / 10; border: 0; padding: 0; background: var(--surface-2); display: grid; place-items: center; overflow: hidden; }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover.none { aspect-ratio: 16 / 6; background: linear-gradient(135deg, color-mix(in srgb, var(--ember) 14%, var(--surface-2)), var(--surface-2)); }
  .ph { font: 600 26px var(--f-display); color: color-mix(in srgb, var(--ember) 60%, var(--muted)); }
  .body { display: grid; gap: 6px; padding: 10px 12px 12px; }
  .t { border: 0; background: none; padding: 0; text-align: left; font: 600 14px/1.3 var(--f-display); color: var(--ink); letter-spacing: .01em; }
  .t:hover { color: var(--ember-soft); }
  .p { font-size: 12.5px; min-width: 0; }
  .new { min-height: 120px; display: grid; place-items: center; color: var(--muted); border-style: dashed; background: none; font: 13px var(--f-body); }
  .new:hover { color: var(--ember); }

  .list { display: grid; padding-bottom: 12px; }
  .li { display: flex; align-items: center; gap: 12px; padding: 7px 8px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); border-radius: 6px; }
  .li:hover { background: color-mix(in srgb, var(--ink) 3%, transparent); }
  .li .t { font: 600 14px var(--f-body); display: flex; gap: 8px; align-items: center; flex: 1; min-width: 0; }
  .pg { color: var(--muted); }
  .props { display: flex; gap: 12px; align-items: center; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; min-width: 0; max-width: 60%; }
  .props .p { max-width: 220px; }
  .newrow { border: 0; background: none; color: var(--ink); padding: 9px 10px; font: 13.5px var(--f-body); outline: none; }
  .newrow::placeholder { color: var(--muted); }
  @media (max-width: 720px) { .li { flex-wrap: wrap; } .props { max-width: 100%; margin-left: 22px; justify-content: flex-start; } }
</style>
