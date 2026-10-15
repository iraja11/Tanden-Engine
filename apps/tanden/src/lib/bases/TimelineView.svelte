<script lang="ts">
  import type { Row } from '@tanden/core';
  import type { ViewCtx } from './ctx';
  import { optionColor } from './bases.svelte';

  let { ctx }: { ctx: ViewCtx } = $props();

  const dates = $derived(ctx.columns.filter((c) => ['date', 'datetime'].includes(ctx.type(c))));
  const startId = $derived(ctx.view.date ?? dates[0] ?? null);
  const endId = $derived(ctx.view.endDate ?? dates.find((d) => d !== startId) ?? null);
  const colorId = $derived(ctx.columns.find((c) => ['select', 'status'].includes(ctx.type(c))) ?? null);
  let scale = $state<'dia' | 'semana' | 'mês'>('dia');
  const DAY = $derived(scale === 'dia' ? 34 : scale === 'semana' ? 12 : 4);

  const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const span = (r: Row): [Date, Date] | null => {
    const s = startId ? r.get(startId) : null;
    const e = endId ? r.get(endId) : null;
    if (!(s instanceof Date)) return null;
    const end = e instanceof Date && e >= s ? e : s;
    return [day0(s), day0(end)];
  };

  const range = $derived.by(() => {
    let min = day0(new Date());
    let max = day0(new Date());
    for (const r of ctx.result.rows) {
      const s = span(r);
      if (!s) continue;
      if (s[0] < min) min = s[0];
      if (s[1] > max) max = s[1];
    }
    const a = new Date(min); a.setDate(a.getDate() - 7);
    const b = new Date(max); b.setDate(b.getDate() + 21);
    return { a, days: Math.round((b.getTime() - a.getTime()) / 864e5) + 1 };
  });
  const x = (d: Date) => Math.round((day0(d).getTime() - range.a.getTime()) / 864e5) * DAY;
  const ticks = $derived(Array.from({ length: range.days }, (_, i) => { const d = new Date(range.a); d.setDate(d.getDate() + i); return d; }));
  const dated = $derived(ctx.result.rows.filter((r) => span(r)));
  const undated = $derived(ctx.result.rows.filter((r) => !span(r)));

  // arrastar a barra move as duas datas; a ponta direita muda só o fim
  let drag = $state<{ path: string; mode: 'move' | 'end'; x0: number; dd: number } | null>(null);
  function start(e: PointerEvent, r: Row, mode: 'move' | 'end') {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { path: r.rec.path, mode, x0: e.clientX, dd: 0 };
  }
  function move(e: PointerEvent) {
    if (drag) drag = { ...drag, dd: Math.round((e.clientX - drag.x0) / DAY) };
  }
  function end() {
    if (!drag) return;
    const d = drag;
    drag = null;
    const r = ctx.result.rows.find((x) => x.rec.path === d.path);
    if (!r || !startId || d.dd === 0) { if (r && d.dd === 0 && d.mode === 'move') ctx.open(r.rec.path); return; }
    const shift = (v: unknown) => { if (!(v instanceof Date)) return null; const n = new Date(v); n.setDate(n.getDate() + d.dd); return n; };
    if (d.mode === 'move') {
      ctx.set(r, startId, shift(r.get(startId)));
      if (endId && r.get(endId) instanceof Date) ctx.set(r, endId, shift(r.get(endId)));
    } else if (endId) {
      const base = r.get(endId) instanceof Date ? r.get(endId) : r.get(startId);
      ctx.set(r, endId, shift(base));
    }
  }
  const off = (r: Row, which: 0 | 1) => (drag && drag.path === r.rec.path && (drag.mode === 'move' || which === 1) ? drag.dd * DAY : 0);
  const today = x(new Date());
  let scroller = $state<HTMLElement>();
  // começa mostrando o primeiro item ou hoje, o que vier antes
  $effect(() => {
    if (!scroller) return;
    const firsts = dated.map((r) => x(span(r)![0]));
    scroller.scrollLeft = Math.max(0, Math.min(today - 120, ...firsts.map((f) => f - DAY * 2)));
  });
</script>

{#if !startId}
  <p class="db-hint pad">A linha do tempo precisa de uma propriedade de data (início e, se quiser, fim).</p>
{:else}
  <div class="tl">
    <div class="tools">
      <span class="db-muted">{ctx.label(startId)}{endId ? ` → ${ctx.label(endId)}` : ''}</span>
      <div class="seg">
        {#each ['dia', 'semana', 'mês'] as const as s (s)}<button class="db-btn" class:on={scale === s} onclick={() => (scale = s)}>{s}</button>{/each}
      </div>
    </div>
    <div class="wrap">
      <div class="names">
        <div class="hd"></div>
        {#each dated as r (r.rec.path)}<button class="nm" onclick={() => ctx.open(r.rec.path)}>{r.rec.name}</button>{/each}
      </div>
      <div class="scroll" bind:this={scroller}>
        <div class="canvas" style:width="{range.days * DAY}px">
          <div class="hd">
            {#each ticks as d, i (i)}
              {#if scale === 'dia' || d.getDate() === 1 || (scale === 'semana' && d.getDay() === 1)}
                <span class="tick" class:month={d.getDate() === 1} style:left="{i * DAY}px">
                  {d.getDate() === 1 || i === 0 ? d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') : ''} {scale !== 'mês' ? d.getDate() : ''}
                </span>
              {/if}
            {/each}
          </div>
          <div class="now" style:left="{today + DAY / 2}px"></div>
          {#each dated as r (r.rec.path)}
            {@const s = span(r)!}
            {@const c = colorId ? r.get(colorId) : null}
            <div class="lane">
              <div class="bar" role="button" tabindex="0" style:--c={c ? optionColor(ctx.cfg(colorId!), String(c)) : 'var(--ember)'}
                style:left="{x(s[0]) + off(r, 0)}px" style:width="{Math.max(DAY, x(s[1]) - x(s[0]) + DAY + off(r, 1) - off(r, 0))}px"
                onpointerdown={(e) => start(e, r, 'move')} onpointermove={move} onpointerup={end}
                onkeydown={(e) => { if (e.key === 'Enter') ctx.open(r.rec.path); }}>
                <span>{r.rec.name}</span>
                {#if endId}<i class="h" role="separator" aria-orientation="vertical" onpointerdown={(e) => start(e, r, 'end')} onpointermove={move} onpointerup={end}></i>{/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
    {#if undated.length}
      <details class="undated"><summary>{undated.length} sem data</summary>
        {#each undated as r (r.rec.path)}<button class="db-item" onclick={() => ctx.open(r.rec.path)}>{r.rec.name}</button>{/each}
      </details>
    {/if}
  </div>
{/if}

<style>
  .pad { padding: 20px 4px; }
  .tl { padding-bottom: 16px; }
  .tools { display: flex; justify-content: space-between; align-items: center; padding: 2px 2px 8px; font-size: 12.5px; }
  .seg { display: flex; gap: 2px; }
  .wrap { display: grid; grid-template-columns: 200px minmax(0, 1fr); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .names { border-right: 1px solid var(--line); background: var(--surface); }
  .names .hd, .canvas .hd { height: 30px; border-bottom: 1px solid var(--line); }
  .nm { display: block; width: 100%; height: 36px; border: 0; background: none; text-align: left; padding: 0 10px; font: 600 13px var(--f-body); color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
  .nm:hover { color: var(--ember-soft); }
  .scroll { overflow-x: auto; }
  .canvas { position: relative; min-height: 100%; }
  .canvas .hd { position: relative; }
  .tick { position: absolute; top: 8px; font: 10.5px var(--f-mono); color: var(--muted); white-space: nowrap; padding-left: 4px; border-left: 1px solid color-mix(in srgb, var(--line) 50%, transparent); height: 22px; }
  .tick.month { color: var(--ink); border-left-color: var(--line); text-transform: capitalize; }
  .now { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ember); opacity: .55; z-index: 1; }
  .lane { position: relative; height: 36px; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
  .bar { position: absolute; top: 6px; height: 24px; border-radius: 7px; background: color-mix(in srgb, var(--c) 30%, var(--surface)); border: 1px solid color-mix(in srgb, var(--c) 70%, transparent);
    display: flex; align-items: center; padding: 0 8px; font: 600 12px var(--f-body); color: var(--ink); cursor: grab; z-index: 2; touch-action: none; user-select: none; }
  .bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: sticky; left: 6px; }
  .bar:active { cursor: grabbing; }
  .h { position: absolute; right: 0; top: 0; bottom: 0; width: 8px; cursor: ew-resize; border-radius: 0 7px 7px 0; }
  .h:hover { background: color-mix(in srgb, var(--c) 60%, transparent); }
  .undated { margin-top: 10px; max-width: 320px; }
  .undated summary { color: var(--muted); font-size: 12.5px; cursor: pointer; padding: 4px 0; }
</style>
