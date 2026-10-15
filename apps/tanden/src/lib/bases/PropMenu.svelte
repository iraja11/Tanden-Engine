<script lang="ts">
  import { PROP_TYPES, checkExpr, propKey, type BaseDef, type PropType, type ViewDef } from '@tanden/core';
  import { bases } from './bases.svelte';
  import { setProp as setPropSafe, renameProp as renamePropSafe } from '@tanden/core';

  // Menu de uma coluna: nome, tipo, fórmula, formato, ordenar, agrupar, esconder, excluir.
  let { def, view, id, type, label, rows, mutate, onfilter, onclose }: {
    def: BaseDef;
    view: ViewDef;
    id: string;
    type: string;
    label: string;
    /** notas da view (para renomear ou apagar a propriedade nelas) */
    rows: string[];
    mutate: (fn: (def: BaseDef, view: ViewDef) => void) => void;
    onfilter: () => void;
    onclose: () => void;
  } = $props();

  const isNote = $derived(id.startsWith('note.'));
  const isFormula = $derived(id.startsWith('formula.'));
  const fname = $derived(id.slice(8));
  let formula = $state(isFormula ? def.formulas?.[id.slice(8)] ?? '' : '');
  const fErr = $derived(isFormula && formula.trim() ? checkExpr(formula) : null);
  let newKey = $state(isNote ? id.slice(5) : '');
  let confirmDelete = $state(false);

  const cfgOf = (d: BaseDef) => ((d.properties ??= {})[id] ??= {});

  function setName(v: string) {
    mutate((d) => { const c = cfgOf(d); if (v.trim() && v.trim() !== propKey(id)) c.displayName = v.trim(); else delete c.displayName; });
  }
  function setType(t: string) {
    mutate((d) => { cfgOf(d).type = t as PropType; });
  }
  function saveFormula() {
    if (fErr) return;
    mutate((d) => { (d.formulas ??= {})[fname] = formula.trim(); });
  }
  function sort(dir: 'ASC' | 'DESC') {
    mutate((_, v) => { v.sort = [{ property: id, direction: dir }, ...(v.sort ?? []).filter((s) => s.property !== id)]; });
    onclose();
  }
  function group() {
    mutate((_, v) => { v.groupBy = v.groupBy?.property === id ? undefined : { property: id, direction: 'ASC' }; });
    onclose();
  }
  function hide() {
    mutate((_, v) => { v.order = (v.order ?? []).filter((x) => x !== id); });
    onclose();
  }
  function remove() {
    mutate((d, v) => {
      for (const vw of d.views) {
        vw.order = vw.order?.filter((x) => x !== id);
        vw.sort = vw.sort?.filter((s) => s.property !== id);
        if (vw.groupBy?.property === id) vw.groupBy = undefined;
        if (vw.summaries) delete vw.summaries[id];
      }
      if (d.properties) delete d.properties[id];
      if (isFormula && d.formulas) delete d.formulas[fname];
      void v;
    });
    onclose();
  }
  function eraseFromNotes() {
    const key = id.slice(5);
    for (const p of rows) bases.update(p, (t) => setPropSafe(t, key, null), true);
    remove();
  }
  function renameInNotes() {
    const from = id.slice(5);
    const to = newKey.trim();
    if (!to || to === from) return;
    for (const p of rows) bases.update(p, (t) => renamePropSafe(t, from, to), true);
    const nid = `note.${to}`;
    mutate((d) => {
      if (d.properties?.[id]) { d.properties[nid] = d.properties[id]!; delete d.properties[id]; }
      for (const vw of d.views) {
        vw.order = vw.order?.map((x) => (x === id ? nid : x));
        vw.sort = vw.sort?.map((s) => (s.property === id ? { ...s, property: nid } : s));
        if (vw.groupBy?.property === id) vw.groupBy = { ...vw.groupBy, property: nid };
        if (vw.date === id) vw.date = nid;
        if (vw.endDate === id) vw.endDate = nid;
        if (vw.image === id) vw.image = nid;
      }
    });
    onclose();
  }
  const NUM_FORMATS = [['number', 'Número'], ['number:0', 'Inteiro'], ['number:2', 'Duas casas'], ['percent', 'Porcentagem (barra)'], ['real:2', 'Real (R$)'], ['dolar:2', 'Dólar'], ['euro:2', 'Euro']];
</script>

<div class="pm">
  <input class="db-input" value={label} aria-label="Nome da coluna" onchange={(e) => setName((e.currentTarget as HTMLInputElement).value)}
    onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
  {#if isNote}
    <h4>Tipo</h4>
    <select class="db-select full" value={def.properties?.[id]?.type ?? type} onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value)}>
      {#each PROP_TYPES as t (t.id)}<option value={t.id}>{t.icon}  {t.label}</option>{/each}
    </select>
    {#if (def.properties?.[id]?.type ?? type) === 'number'}
      <h4>Formato</h4>
      <select class="db-select full" value={def.properties?.[id]?.format ?? 'number'} onchange={(e) => mutate((d) => { cfgOf(d).format = (e.currentTarget as HTMLSelectElement).value; })}>
        {#each NUM_FORMATS as [v, l] (v)}<option value={v}>{l}</option>{/each}
      </select>
    {/if}
    {#if (def.properties?.[id]?.type ?? type) === 'relation'}
      <h4>Ligar com notas de</h4>
      <input class="db-input" list="db-targets" placeholder="Pasta ou banco (vazio = todas)" value={def.properties?.[id]?.target ?? ''}
        onchange={(e) => mutate((d) => { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) cfgOf(d).target = v; else delete cfgOf(d).target; })} />
      <datalist id="db-targets">{#each bases.databases as db (db.path)}<option value={db.name}></option>{/each}</datalist>
      <p class="db-hint">Para somar algo das notas ligadas (rollup), crie uma fórmula como <code>{propKey(id)}.horas.sum()</code>.</p>
    {/if}
  {/if}
  {#if isFormula}
    <h4>Fórmula</h4>
    <textarea class="db-input" rows="3" bind:value={formula} onblur={saveFormula} spellcheck="false"
      onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveFormula(); }}></textarea>
    {#if fErr}<p class="db-err">{fErr}</p>{/if}
    <p class="db-hint">Ex.: <code>if(prazo &lt; today(), "atrasada", "")</code>, <code>horas * valor</code>, <code>tarefas.horas.sum()</code>, <code>prazo.format("DD/MM")</code>, <code>days(início, fim)</code>. Ctrl+Enter salva.</p>
    <h4>Formato</h4>
    <select class="db-select full" value={def.properties?.[id]?.format ?? 'number'} onchange={(e) => mutate((d) => { cfgOf(d).format = (e.currentTarget as HTMLSelectElement).value; })}>
      {#each NUM_FORMATS as [v, l] (v)}<option value={v}>{l}</option>{/each}
    </select>
  {/if}
  <hr />
  <button class="db-item" onclick={() => sort('ASC')}><span class="ic">↑</span>Ordenar crescente</button>
  <button class="db-item" onclick={() => sort('DESC')}><span class="ic">↓</span>Ordenar decrescente</button>
  <button class="db-item" onclick={() => { onfilter(); }}><span class="ic">⏷</span>Filtrar por esta</button>
  {#if id !== 'file.name'}
    <button class="db-item" class:on={view.groupBy?.property === id} onclick={group}><span class="ic">▤</span>{view.groupBy?.property === id ? 'Desagrupar' : 'Agrupar por esta'}</button>
    <button class="db-item" onclick={hide}><span class="ic">◌</span>Esconder nesta view</button>
  {/if}
  <button class="db-item" onclick={() => mutate((_, v) => { v.wrap = !v.wrap; })}><span class="ic">↵</span>{view.wrap ? 'Não quebrar texto' : 'Quebrar texto nas células'}</button>
  {#if isNote}
    <hr />
    <h4>Chave nas notas</h4>
    <div class="db-row"><input class="db-input" bind:value={newKey} aria-label="Nova chave" /><button class="db-btn line" disabled={!newKey.trim() || newKey.trim() === id.slice(5)} onclick={renameInNotes}>Renomear</button></div>
    <p class="db-hint">Renomeia <code>{id.slice(5)}:</code> no topo de {rows.length} notas.</p>
  {/if}
  {#if id !== 'file.name'}
    <hr />
    {#if !confirmDelete}
      <button class="db-item danger" onclick={() => (confirmDelete = true)}><span class="ic">✕</span>Excluir coluna</button>
    {:else}
      <p class="db-hint">Tirar a coluna do banco{isNote ? ' (os valores continuam nas notas)' : ''}?</p>
      <div class="db-row">
        <button class="db-btn line" onclick={remove}>Só do banco</button>
        {#if isNote}<button class="db-btn line danger" onclick={eraseFromNotes}>Apagar das {rows.length} notas</button>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .pm { display: grid; gap: 2px; width: 280px; padding: 2px; }
  .full { width: 100%; }
  textarea { font-family: var(--f-mono); }
</style>
