<script lang="ts">
  import { focus } from './actions';
  import { display, type Group } from '@tanden/core';
  import Cell from './Cell.svelte';
  import { optionColor } from './bases.svelte';
  import type { ViewCtx } from './ctx';
  import { flip } from 'svelte/animate';
  import { theme } from '../theme.svelte';

  let { ctx }: { ctx: ViewCtx } = $props();

  const gid = $derived(ctx.view.groupBy?.property ?? null);
  const cards = $derived(ctx.columns.filter((c) => c !== 'file.name' && c !== gid));
  let dragging = $state<string | null>(null);
  let over = $state<string | null>(null);
  let adding = $state<string | null>(null);
  let name = $state('');

  function drop(g: Group) {
    const path = dragging;
    dragging = null;
    over = null;
    if (!path || !gid) return;
    const row = ctx.result.rows.find((r) => r.rec.path === path);
    if (!row) return;
    const t = ctx.type(gid);
    const cur = row.get(gid);
    if (t === 'multiselect' && Array.isArray(cur)) {
      // muda só o valor da coluna de origem; mantém os outros
      const src = fromGroup;
      const list = cur.map(String).filter((x) => x !== src);
      if (g.label && !list.includes(g.label)) list.push(g.label);
      ctx.set(row, gid, list.length ? list : null);
    } else ctx.set(row, gid, g.label === '' ? null : t === 'checkbox' ? g.key : g.label);
  }
  let fromGroup = '';

  function create(g: Group) {
    ctx.add(ctx.groupDefaults(g), name.trim() || undefined);
    name = '';
    adding = null;
  }
</script>

{#if !gid}
  <p class="db-hint pad">Escolha em <b>Agrupar</b> qual propriedade vira as colunas do quadro (status e seleção funcionam melhor).</p>
{:else}
  <div class="board">
    {#each ctx.result.groups ?? [] as g (g.label)}
      <section class="col" class:over={over === g.label} role="list"
        ondragover={(e) => { if (dragging) { e.preventDefault(); over = g.label; } }}
        ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) over = null; }}
        ondrop={(e) => { e.preventDefault(); drop(g); }}>
        <header>
          {#if g.label}
            {#if ['select', 'status', 'multiselect'].includes(ctx.type(gid))}<span class="db-chip" class:status={ctx.type(gid) === 'status'} style:--c={optionColor(ctx.cfg(gid), g.label)}>{g.label}</span>
            {:else}<b>{display(g.key, ctx.cfg(gid))}</b>{/if}
          {:else}<span class="db-muted">Sem {ctx.label(gid).toLowerCase()}</span>{/if}
          <span class="cnt">{g.rows.length}</span>
          <button class="db-btn plus" aria-label="Nova em {g.label || 'sem grupo'}" onclick={() => (adding = g.label)}>+</button>
        </header>
        <div class="cards">
          {#each g.rows as r (r.rec.path)}
            <div class="card" class:ghost={dragging === r.rec.path} draggable="true" role="listitem" animate:flip={{ duration: theme.ms(200) }}
              ondragstart={(e) => { dragging = r.rec.path; fromGroup = g.label; e.dataTransfer?.setData('text/plain', r.rec.path); }}
              ondragend={() => { dragging = null; over = null; }}>
              <button class="title" onclick={() => ctx.open(r.rec.path)}>{r.rec.name}</button>
              {#each cards as id (id)}
                {@const v = r.get(id)}
                {#if v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(v === false)}
                  <div class="f"><Cell row={r} {id} type={ctx.type(id)} cfg={ctx.cfg(id)} compact wrap onset={(x) => ctx.set(r, id, x)} onconfig={(p) => ctx.config(id, p)} onopen={ctx.open} /></div>
                {/if}
              {/each}
            </div>
          {/each}
          {#if adding === g.label}
            <input class="db-input" placeholder="Nome e Enter" bind:value={name}
              onkeydown={(e) => { if (e.key === 'Enter') create(g); if (e.key === 'Escape') adding = null; }}
              onblur={() => { if (name.trim()) create(g); else adding = null; }} use:focus />
          {:else}
            <button class="db-btn add" onclick={() => (adding = g.label)}>+ Nova</button>
          {/if}
        </div>
      </section>
    {/each}
  </div>
{/if}

<style>
  .pad { padding: 20px 4px; }
  .board { display: flex; gap: 12px; align-items: flex-start; padding: 4px 2px 16px; min-width: max-content; }
  .col { width: 268px; flex: none; border-radius: 12px; padding: 6px; background: color-mix(in srgb, var(--surface) 70%, transparent);
    border: 1px solid transparent; transition: border-color var(--dur), background var(--dur); }
  .col.over { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 6%, var(--surface)); }
  header { display: flex; align-items: center; gap: 8px; padding: 4px 4px 8px; }
  header b { font: 600 13px var(--f-body); }
  .cnt { color: var(--muted); font: 11.5px var(--f-mono); }
  .plus { margin-left: auto; padding: 0 7px; }
  .cards { display: grid; gap: 7px; }
  .card { display: grid; gap: 6px; padding: 10px 11px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); cursor: grab;
    box-shadow: 0 6px 16px -14px var(--shadow); transition: border-color var(--dur), transform var(--dur) var(--spring), box-shadow var(--dur); }
  .card:hover { border-color: color-mix(in srgb, var(--ember) 45%, var(--line)); transform: translateY(-1px); box-shadow: 0 12px 24px -16px var(--shadow); }
  .card.ghost { opacity: .35; }
  .card:active { cursor: grabbing; }
  .title { border: 0; background: none; padding: 0; text-align: left; font: 600 13.5px/1.35 var(--f-body); color: var(--ink); overflow-wrap: anywhere; }
  .title:hover { color: var(--ember-soft); }
  .f { font-size: 12.5px; min-width: 0; }
  .add { justify-content: flex-start; width: 100%; }
</style>
