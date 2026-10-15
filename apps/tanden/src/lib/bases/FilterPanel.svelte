<script lang="ts">
  import { FILTER_OPS, checkExpr, exprToSimple, simpleToExpr, type Filter, type FilterOp, type SimpleFilter } from '@tanden/core';

  // Filtros de uma view (ou do banco todo). Linhas simples viram expressões
  // das Bases ("status == \"Feito\""); expressões livres ficam editáveis como texto.
  let { filter, props, label, type, onchange, initialProp = null }: {
    filter: Filter | undefined;
    /** colunas que dá para filtrar */
    props: string[];
    label: (id: string) => string;
    type: (id: string) => string;
    onchange: (f: Filter | undefined) => void;
    /** abre já com uma linha nova nesta coluna */
    initialProp?: string | null;
  } = $props();

  type Item = { kind: 'simple'; f: SimpleFilter } | { kind: 'expr'; src: string } | { kind: 'group'; raw: Filter };

  function read(f: Filter | undefined): { mode: 'and' | 'or'; items: Item[] } {
    if (!f) return { mode: 'and', items: [] };
    if (typeof f === 'string') return { mode: 'and', items: [toItem(f)] };
    const mode = f.or && f.or.length && !(f.and && f.and.length) ? 'or' : 'and';
    const list = (mode === 'or' ? f.or : f.and) ?? [];
    const items = list.map((x) => (typeof x === 'string' ? toItem(x) : { kind: 'group' as const, raw: x }));
    if (f.not?.length) items.push({ kind: 'group', raw: { not: f.not } });
    return { mode, items };
  }
  function toItem(s: string): Item {
    const f = exprToSimple(s);
    return f ? { kind: 'simple', f } : { kind: 'expr', src: s };
  }

  let state = $state(read(filter));
  // linha nova pedida pelo menu da coluna
  if (initialProp) state.items.push({ kind: 'simple', f: { prop: initialProp, op: defaultOp(initialProp), value: '' } });

  function defaultOp(p: string): FilterOp {
    const t = type(p);
    if (t === 'checkbox') return 'checked';
    if (t === 'date' || t === 'datetime') return 'past';
    if (t === 'number' || t === 'formula') return 'gt';
    if (t === 'multiselect' || t === 'relation' || t === 'text' || t === 'title') return 'contains';
    return 'is';
  }

  function emit() {
    const list: Filter[] = state.items.flatMap((i) => {
      if (i.kind === 'simple') {
        const op = FILTER_OPS.find((o) => o.id === i.f.op)!;
        if (op.needs && i.f.value.trim() === '') return [];
        return [simpleToExpr(i.f)];
      }
      if (i.kind === 'expr') return i.src.trim() && !checkExpr(i.src) ? [i.src.trim()] : [];
      return [i.raw];
    });
    onchange(list.length ? { [state.mode]: list } : undefined);
  }

  function opsFor(p: string) {
    const t = type(p);
    return FILTER_OPS.filter((o) => {
      if (['checked', 'unchecked'].includes(o.id)) return t === 'checkbox';
      if (['today', 'past', 'next7'].includes(o.id)) return ['date', 'datetime', 'created', 'edited', 'formula'].includes(t);
      if (['gt', 'lt', 'gte', 'lte'].includes(o.id)) return ['number', 'date', 'datetime', 'formula', 'created', 'edited'].includes(t);
      return t !== 'checkbox';
    });
  }
</script>

<div class="fp">
  {#if state.items.length > 1}
    <div class="db-row mode">
      Mostrar quando
      <select class="db-select" bind:value={state.mode} onchange={emit}><option value="and">todas</option><option value="or">qualquer uma</option></select>
      das regras valer
    </div>
  {/if}
  {#each state.items as it, i (i)}
    <div class="rule">
      {#if it.kind === 'simple'}
        <select class="db-select p" value={it.f.prop} onchange={(e) => { it.f.prop = (e.currentTarget as HTMLSelectElement).value; it.f.op = defaultOp(it.f.prop); emit(); }}>
          {#each props as p (p)}<option value={p}>{label(p)}</option>{/each}
        </select>
        <select class="db-select o" value={it.f.op} onchange={(e) => { it.f.op = (e.currentTarget as HTMLSelectElement).value as FilterOp; emit(); }}>
          {#each opsFor(it.f.prop) as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
        </select>
        {#if FILTER_OPS.find((o) => o.id === it.f.op)?.needs}
          <input class="db-input v" type={['date', 'datetime'].includes(type(it.f.prop)) ? 'date' : 'text'} bind:value={it.f.value} placeholder="valor" oninput={emit} />
        {/if}
      {:else if it.kind === 'expr'}
        <input class="db-input expr" bind:value={it.src} placeholder={'ex.: horas > 2 && !file.hasTag("arquivo")'} spellcheck="false" onchange={emit} />
        {#if it.src.trim() && checkExpr(it.src)}<span class="db-err">{checkExpr(it.src)}</span>{/if}
      {:else}
        <code class="grp">{JSON.stringify(it.raw)}</code>
      {/if}
      <button class="db-btn danger" aria-label="Tirar regra" onclick={() => { state.items.splice(i, 1); emit(); }}>×</button>
    </div>
  {/each}
  {#if !state.items.length}<p class="db-hint">Nenhum filtro. Tudo aparece.</p>{/if}
  <div class="db-row">
    <button class="db-btn line" onclick={() => { const p = props[0] ?? 'file.name'; state.items.push({ kind: 'simple', f: { prop: p, op: defaultOp(p), value: '' } }); }}>+ Regra</button>
    <button class="db-btn" onclick={() => state.items.push({ kind: 'expr', src: '' })}>+ Expressão</button>
  </div>
</div>

<style>
  .fp { display: grid; gap: 6px; padding: 4px; width: min(560px, calc(100vw - 40px)); }
  .mode { font-size: 12.5px; color: var(--muted); }
  .rule { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
  .p { width: 150px; }
  .o { width: 140px; }
  .v { flex: 1; min-width: 100px; width: auto; }
  .expr { flex: 1; font-family: var(--f-mono); font-size: 12px; }
  .grp { flex: 1; font: 11px var(--f-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
