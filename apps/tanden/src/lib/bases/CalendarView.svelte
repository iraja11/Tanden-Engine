<script lang="ts">
  import { isoDate, type Row } from '@tanden/core';
  import type { ViewCtx } from './ctx';
  import { optionColor } from './bases.svelte';

  let { ctx }: { ctx: ViewCtx } = $props();

  const dateId = $derived(ctx.view.date ?? ctx.columns.find((c) => ['date', 'datetime'].includes(ctx.type(c))) ?? null);
  // cor do cartão: a primeira coluna de seleção/status visível
  const colorId = $derived(ctx.columns.find((c) => ['select', 'status'].includes(ctx.type(c))) ?? null);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let month = $state(first(new Date()));
  function first(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }

  const days = $derived.by(() => {
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7));
    const weeks = Math.ceil((((month.getDay() + 6) % 7) + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
    return Array.from({ length: weeks * 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  });

  const byDay = $derived.by(() => {
    const m = new Map<string, Row[]>();
    if (!dateId) return m;
    for (const r of ctx.result.rows) {
      const v = r.get(dateId);
      if (!(v instanceof Date)) continue;
      const k = isoDate(v, false);
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  });
  const undated = $derived(dateId ? ctx.result.rows.filter((r) => !(r.get(dateId) instanceof Date)) : []);

  let dragging = $state<string | null>(null);
  let over = $state<string | null>(null);
  function drop(d: Date) {
    const row = ctx.result.rows.find((r) => r.rec.path === dragging);
    dragging = null;
    over = null;
    if (!row || !dateId) return;
    const cur = row.get(dateId);
    const next = new Date(d);
    if (cur instanceof Date) next.setHours(cur.getHours(), cur.getMinutes());
    ctx.set(row, dateId, next);
  }
  const todayKey = isoDate(new Date(), false);
  const time = (v: unknown) => (v instanceof Date && (v.getHours() || v.getMinutes()) ? v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
</script>

{#if !dateId}
  <p class="db-hint pad">Este banco ainda não tem uma propriedade de data. Crie uma coluna do tipo <b>Data</b> e escolha ela nas opções da view.</p>
{:else}
  <div class="cal">
    <header>
      <b>{cap(month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</b>
      <span class="db-muted">por {ctx.label(dateId).toLowerCase()}</span>
      <div class="nav">
        <button class="db-btn" aria-label="Mês anterior" onclick={() => (month = new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <button class="db-btn line" onclick={() => (month = first(new Date()))}>Hoje</button>
        <button class="db-btn" aria-label="Próximo mês" onclick={() => (month = new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
    </header>
    <div class="grid">
      {#each ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'] as w (w)}<span class="w">{w}</span>{/each}
      {#each days as d (d.getTime())}
        {@const k = isoDate(d, false)}
        <div class="day" class:out={d.getMonth() !== month.getMonth()} class:today={k === todayKey} class:over={over === k} role="gridcell" tabindex="-1"
          ondragover={(e) => { if (dragging) { e.preventDefault(); over = k; } }} ondrop={(e) => { e.preventDefault(); drop(d); }}>
          <div class="n"><span>{d.getDate()}</span><button class="db-btn plus" aria-label="Nova em {k}" onclick={() => ctx.add({ [dateId.slice(5)]: k })}>+</button></div>
          {#each byDay.get(k) ?? [] as r (r.rec.path)}
            {@const c = colorId ? r.get(colorId) : null}
            <button class="ev" draggable="true" style:--c={c ? optionColor(ctx.cfg(colorId!), String(c)) : 'var(--ember)'}
              ondragstart={() => (dragging = r.rec.path)} ondragend={() => { dragging = null; over = null; }} onclick={() => ctx.open(r.rec.path)}>
              {#if time(r.get(dateId))}<i>{time(r.get(dateId))}</i>{/if}{r.rec.name}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    {#if undated.length}
      <details class="undated"><summary>{undated.length} sem data</summary>
        {#each undated as r (r.rec.path)}<button class="ev" draggable="true" style:--c="var(--muted)" ondragstart={() => (dragging = r.rec.path)} onclick={() => ctx.open(r.rec.path)}>{r.rec.name}</button>{/each}
      </details>
    {/if}
  </div>
{/if}

<style>
  .pad { padding: 20px 4px; }
  .cal { padding-bottom: 16px; min-width: 640px; }
  header { display: flex; align-items: baseline; gap: 10px; padding: 4px 2px 10px; }
  header b { font: 600 17px var(--f-display); }
  .nav { margin-left: auto; display: flex; gap: 4px; }
  .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border-top: 1px solid var(--line); border-left: 1px solid var(--line); }
  .w { font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); padding: 6px 8px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .day { min-height: 104px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 4px; display: flex; flex-direction: column; gap: 3px; min-width: 0;
    transition: background var(--dur); }
  .day.out { background: color-mix(in srgb, var(--surface) 55%, transparent); }
  .day.out .n span { opacity: .45; }
  .day.over { background: color-mix(in srgb, var(--ember) 8%, transparent); }
  .n { display: flex; align-items: center; justify-content: space-between; font: 12px var(--f-mono); color: var(--muted); padding: 1px 3px; }
  .today .n span { background: var(--ember); color: var(--on-ember); border-radius: 999px; padding: 1px 7px; font-weight: 700; }
  .plus { padding: 0 6px; opacity: 0; }
  .day:hover .plus { opacity: 1; }
  .ev { display: block; width: 100%; text-align: left; border: 0; border-left: 3px solid var(--c); border-radius: 5px; padding: 3px 6px; font: 12px/1.3 var(--f-body); color: var(--ink);
    background: color-mix(in srgb, var(--c) 16%, var(--surface)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .ev:hover { background: color-mix(in srgb, var(--c) 28%, var(--surface)); }
  .ev i { font-style: normal; color: var(--muted); margin-right: 5px; font-family: var(--f-mono); font-size: 11px; }
  .undated { margin-top: 10px; display: grid; gap: 4px; max-width: 320px; }
  .undated summary { color: var(--muted); font-size: 12.5px; cursor: pointer; padding: 4px 0; }
  .undated .ev { margin-bottom: 3px; }
</style>
