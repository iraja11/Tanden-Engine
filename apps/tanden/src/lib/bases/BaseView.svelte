<script lang="ts">
  import { focus } from './actions';
  import './bases.css';
  import {
    FILE_PROPS, PROP_TYPES, VIEW_TYPES, exprToSimple, isEmptyFilter, parseBase, propConfig, propId, propKey, propLabel, runView, serializeBase,
    type BaseDef, type Filter, type Group, type PropConfig, type Row, type Value, type ViewDef, type ViewType,
  } from '@tanden/core';
  import { bases, type TemplateEntry } from './bases.svelte';
  import { typeOf } from './types';
  import type { ViewCtx } from './ctx';
  import Popover from './Popover.svelte';
  import PropMenu from './PropMenu.svelte';
  import FilterPanel from './FilterPanel.svelte';
  import SortPanel from './SortPanel.svelte';
  import TableView from './TableView.svelte';
  import BoardView from './BoardView.svelte';
  import GalleryView from './GalleryView.svelte';
  import CalendarView from './CalendarView.svelte';
  import TimelineView from './TimelineView.svelte';
  import { PROP_ICON } from './icons';
  import { sound } from '../sound.svelte';

  // Um banco de dados (bloco ```base) com as views, a barra de ferramentas e os painéis.
  let { notePath, index = 0, embedded = false, onOpenNote }: {
    notePath: string;
    index?: number;
    /** dentro de uma nota: mais compacto, sem título */
    embedded?: boolean;
    onOpenNote?: (path: string) => void;
  } = $props();

  const block = $derived(bases.block(notePath, index));
  const def = $derived(block?.def ?? { views: [{ type: 'table', name: 'Tabela' }] } as BaseDef);

  const stateKey = $derived(`tanden.base.view:${notePath}#${index}`);
  let active = $state(0);
  $effect(() => {
    try { active = Number(localStorage.getItem(stateKey) ?? 0) || 0; } catch { active = 0; }
  });
  function pick(i: number) {
    active = i;
    sound.play('tick');
    try { localStorage.setItem(stateKey, String(i)); } catch { /* sem armazenamento: só nesta sessão */ }
  }
  const vi = $derived(Math.min(active, def.views.length - 1));
  const view = $derived(def.views[vi]!);

  let search = $state('');
  let searching = $state(false);
  // arquivados: a regra "!arquivado" do banco some só nesta tela
  const effDef = $derived.by<BaseDef>(() => {
    if (!view.showArchived || !def.filters || typeof def.filters === 'string') return def;
    return { ...def, filters: { ...def.filters, and: (def.filters.and ?? []).filter((f) => f !== '!arquivado') } };
  });
  const result = $derived.by(() => {
    void bases.rev;
    return runView(effDef, view, bases.index, { thisPath: notePath, search });
  });

  // ------------------------------------------------ colunas
  const seenKeys = $derived.by(() => {
    const keys = new Set<string>();
    for (const r of result.rows) for (const k of Object.keys(r.rec.props)) keys.add(k);
    return keys;
  });
  const HIDDEN = new Set(['arquivado', 'tags', 'tag', 'aliases', 'cssclasses', 'modelo-para', 'position']);
  const allProps = $derived.by(() => {
    const ids = new Set<string>(['file.name']);
    for (const k of Object.keys(def.properties ?? {})) ids.add(propId(k));
    for (const k of seenKeys) if (!HIDDEN.has(k)) ids.add(`note.${k}`);
    if (seenKeys.has('tags')) ids.add('note.tags');
    for (const f of Object.keys(def.formulas ?? {})) ids.add(`formula.${f}`);
    for (const f of FILE_PROPS) ids.add(f.id);
    return [...ids];
  });
  const columns = $derived.by(() => {
    if (view.order?.length) return ['file.name', ...view.order.filter((c) => c !== 'file.name')];
    // sem ordem: nome + o que estiver configurado ou aparecer nas notas
    return allProps.filter((c) => !c.startsWith('file.') || c === 'file.name').slice(0, 8);
  });

  const sample = (id: string): Value => {
    for (const r of result.rows.slice(0, 20)) {
      const v = r.get(id);
      if (v !== null && v !== '') return v;
    }
    return null;
  };
  const typeCache = $derived.by(() => { void result; return new Map<string, string>(); });
  const typeFn = (id: string) => {
    let t = typeCache.get(id);
    if (!t) { t = typeOf(def, id, sample(id)); typeCache.set(id, t); }
    return t;
  };

  // ------------------------------------------------ gravar
  function mutate(fn: (d: BaseDef, v: ViewDef) => void) {
    const d = structuredClone($state.snapshot(def)) as BaseDef;
    fn(d, d.views[vi]!);
    bases.saveBlock(notePath, index, d);
  }

  function config(id: string, patch: Partial<PropConfig>) {
    mutate((d) => { const props = (d.properties ??= {}); props[id] = { ...(props[id] ?? {}), ...patch }; });
  }

  function set(row: Row, id: string, v: Value) {
    bases.setCell(row.rec.path, id, v, propConfig(def, id));
  }

  function open(path: string) {
    bases.peek = path;
    sound.play('open');
  }

  function defaultsFromFilters(): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    const walk = (f: Filter | undefined) => {
      if (!f) return;
      if (typeof f === 'string') {
        const s = exprToSimple(f);
        if (s && s.prop.startsWith('note.') && (s.op === 'is' || s.op === 'contains' || s.op === 'checked')) {
          const t = typeFn(s.prop);
          out[s.prop.slice(5)] = s.op === 'checked' ? 'true' : t === 'multiselect' ? [s.value] : t === 'relation' ? [`[[${s.value}]]`] : s.value;
        }
        return;
      }
      for (const x of f.and ?? []) walk(x);
    };
    walk(view.filters);
    return out;
  }

  function groupDefaults(g: Group): Record<string, string | string[]> {
    const id = view.groupBy?.property;
    if (!id || !id.startsWith('note.') || !g.label) return {};
    const t = typeFn(id);
    const v = g.key;
    if (t === 'multiselect' || t === 'person') return { [id.slice(5)]: [g.label] };
    if (t === 'relation') return { [id.slice(5)]: [`[[${g.label}]]`] };
    if (t === 'checkbox') return { [id.slice(5)]: v === true ? 'true' : 'false' };
    return { [id.slice(5)]: g.label };
  }

  function add(defaults: Record<string, string | string[]> = {}, name?: string, template?: TemplateEntry | null): string {
    const path = bases.createRow(def, notePath, { name, defaults: { ...defaultsFromFilters(), ...defaults }, template });
    if (!name) {
      bases.fresh = path;
      // o botão que criou perde o foco: Espaço e Enter não criam outra linha
      (document.activeElement as HTMLElement | null)?.blur?.();
      open(path);
    }
    return path;
  }

  let colMenu = $state<{ id: string; el: HTMLElement } | null>(null);
  const ctx = $derived<ViewCtx>({
    def, view, result, columns, notePath,
    label: (id) => propLabel(def, id),
    type: typeFn,
    cfg: (id) => propConfig(def, id),
    set, config, open,
    patchView: (p) => mutate((_, v) => Object.assign(v, p)),
    add: (d, n) => add(d, n),
    groupDefaults,
    columnMenu: (id, el) => (colMenu = { id, el }),
  });

  // ------------------------------------------------ painéis
  type Panel = 'filter' | 'sort' | 'group' | 'props' | 'view' | 'new' | 'addview' | 'yaml' | 'addprop';
  let panel = $state<{ kind: Panel; el: HTMLElement; prop?: string } | null>(null);
  const toggle = (kind: Panel, e: MouseEvent, prop?: string) => {
    panel = panel?.kind === kind ? null : { kind, el: e.currentTarget as HTMLElement, prop };
  };

  const filterCount = $derived.by(() => {
    const f = view.filters;
    if (!f || isEmptyFilter(f)) return 0;
    if (typeof f === 'string') return 1;
    return (f.and?.length ?? 0) + (f.or?.length ?? 0) + (f.not?.length ?? 0);
  });

  function addView(type: ViewType) {
    const label = VIEW_TYPES.find((t) => t.id === type)!.label;
    const statusish = columns.find((c) => ['status', 'select'].includes(typeFn(c)));
    const dateish = columns.find((c) => ['date', 'datetime'].includes(typeFn(c))) ?? allProps.find((c) => ['date', 'datetime'].includes(typeFn(c)));
    const v: ViewDef = { type, name: label, order: view.order ? [...view.order] : undefined };
    if (type === 'board') v.groupBy = statusish ? { property: statusish, direction: 'ASC' } : undefined;
    if (type === 'calendar' || type === 'timeline') v.date = dateish;
    mutate((d) => d.views.push(v));
    pick(def.views.length);
    panel = null;
  }

  function setOrder(order: string[]) {
    mutate((_, v) => { v.order = order.filter((c) => c !== 'file.name'); v.order.unshift('file.name'); });
  }

  let newProp = $state({ name: '', type: 'text', formula: '' });
  function createProp() {
    const name = newProp.name.trim();
    if (!name) return;
    if (newProp.type === 'formula') {
      mutate((d, v) => {
        (d.formulas ??= {})[name] = newProp.formula.trim() || '""';
        v.order = [...(v.order ?? columns), `formula.${name}`];
      });
    } else {
      const id = `note.${name}`;
      mutate((d, v) => {
        (d.properties ??= {})[id] = { ...((d.properties ??= {})[id] ?? {}), type: newProp.type as PropConfig['type'] };
        v.order = [...(v.order ?? columns).filter((c) => c !== id), id];
      });
    }
    newProp = { name: '', type: 'text', formula: '' };
    panel = null;
  }

  let yaml = $state('');
  let yamlErr = $state<string | null>(null);
  function saveYaml() {
    const r = parseBase(yaml);
    if (r.error) { yamlErr = r.error; return; }
    bases.saveBlock(notePath, index, r.def);
    panel = null;
  }

  const templates = $derived.by(() => { void bases.rev; return bases.templatesFor(notePath); });
  function newTemplate() {
    const name = 'Novo modelo';
    const dbName = notePath.split('/').pop()!.replace(/\.md$/, '');
    const path = bases.newPage(`Modelos/${dbName}.md`, { path: null, name, target: dbName, text: `---\nmodelo-para: "[[${dbName}]]"\n---\n# {{title}}\n\n` }, name);
    panel = null;
    bases.peek = path;
  }
  function setDefaultTemplate(t: TemplateEntry | null) {
    mutate((d) => { if (t?.path) d.template = `[[${t.path.replace(/\.md$/, '')}]]`; else delete d.template; });
  }

  const dateProps = $derived(allProps.filter((c) => ['date', 'datetime', 'created', 'edited'].includes(typeFn(c))));
  const groupable = $derived(allProps.filter((c) => c !== 'file.name' && c !== 'file.path' && !['title'].includes(typeFn(c))));
  const viewIcon = (t: string) => VIEW_TYPES.find((x) => x.id === t || (t === 'cards' && x.id === 'gallery'))?.icon ?? '▤';
  const total = $derived(result.total);
  let renaming = $state<number | null>(null);
</script>

<div class="base" class:embedded>
  {#if block?.error}
    <p class="db-err">O bloco base tem um erro de YAML: {block.error}. Corrija no texto da nota.</p>
  {/if}
  <div class="bar">
    <div class="tabs" role="tablist">
      {#each def.views as v, i (i)}
        {#if renaming === i}
          <input class="db-input tabin" value={v.name} aria-label="Nome da view"
            onblur={(e) => { const n = (e.currentTarget as HTMLInputElement).value.trim(); if (n && n !== v.name) mutate((d) => { d.views[i]!.name = n; }); renaming = null; }}
            onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); if (e.key === 'Escape') renaming = null; }} use:focus />
        {:else}
          <button class="tab" class:on={i === vi} role="tab" aria-selected={i === vi} onclick={() => pick(i)} ondblclick={() => (renaming = i)}>
            <span class="vic">{viewIcon(v.type)}</span>{v.name}
          </button>
        {/if}
      {/each}
      <button class="tab add" aria-label="Nova view" onclick={(e) => toggle('addview', e)}>+</button>
    </div>
    <div class="tools">
      {#if searching || search}
        <input class="db-input find" placeholder="Buscar" bind:value={search} onblur={() => { if (!search) searching = false; }} use:focus />
      {:else}
        <button class="db-btn" aria-label="Buscar" onclick={() => (searching = true)}>⌕</button>
      {/if}
      <button class="db-btn" class:on={filterCount > 0} onclick={(e) => toggle('filter', e)}>Filtrar{filterCount ? ` · ${filterCount}` : ''}</button>
      <button class="db-btn" class:on={!!view.sort?.length} onclick={(e) => toggle('sort', e)}>Ordenar{view.sort?.length ? ` · ${view.sort.length}` : ''}</button>
      <button class="db-btn" class:on={!!view.groupBy} onclick={(e) => toggle('group', e)}>Agrupar</button>
      <button class="db-btn" onclick={(e) => toggle('props', e)}>Propriedades</button>
      <button class="db-btn" aria-label="Opções da view" onclick={(e) => toggle('view', e)}>⋯</button>
      <span class="split">
        <button class="db-btn primary" onclick={() => add()}>Novo</button>
        <button class="db-btn primary caret" aria-label="Modelos" onclick={(e) => toggle('new', e)}>▾</button>
      </span>
    </div>
  </div>

  <div class="body" class:board={view.type === 'board'}>
    {#if view.type === 'board'}
      <BoardView {ctx} />
    {:else if view.type === 'gallery' || view.type === 'cards'}
      <GalleryView {ctx} />
    {:else if view.type === 'list'}
      <GalleryView {ctx} list />
    {:else if view.type === 'calendar'}
      <CalendarView {ctx} />
    {:else if view.type === 'timeline'}
      <TimelineView {ctx} />
    {:else}
      <TableView {ctx} />
    {/if}
  </div>
  <div class="foot">
    <span>{total} {total === 1 ? 'nota' : 'notas'}{view.limit && total > view.limit ? ` (mostrando ${view.limit})` : ''}</span>
    {#if result.errors.length}<span class="db-err" title={result.errors.join('\n')}>⚠ {result.errors.length} {result.errors.length === 1 ? 'erro' : 'erros'} em fórmulas ou filtros</span>{/if}
  </div>
</div>

{#if colMenu}
  {@const cm = colMenu}
  <Popover anchor={cm.el} onclose={() => (colMenu = null)}>
    <PropMenu {def} {view} id={cm.id} type={typeFn(cm.id)} label={propLabel(def, cm.id)} rows={result.rows.map((r) => r.rec.path)} {mutate}
      onfilter={() => { colMenu = null; panel = { kind: 'filter', el: cm.el, prop: cm.id }; }} onclose={() => (colMenu = null)} />
  </Popover>
{/if}

{#if panel}
  {@const p = panel}
  <Popover anchor={p.el} onclose={() => (panel = null)} align={p.kind === 'new' || p.kind === 'view' ? 'end' : 'start'}>
    {#if p.kind === 'filter'}
      <h4>Filtros desta view</h4>
      <FilterPanel filter={view.filters} props={allProps} label={(id) => propLabel(def, id)} type={typeFn} initialProp={p.prop ?? null}
        onchange={(f) => mutate((_, v) => { v.filters = f; })} />
      <hr />
      <details class="global">
        <summary>Filtros do banco (todas as views)</summary>
        <FilterPanel filter={def.filters} props={allProps} label={(id) => propLabel(def, id)} type={typeFn}
          onchange={(f) => mutate((d) => { d.filters = f; })} />
      </details>
    {:else if p.kind === 'sort'}
      <h4>Ordenar</h4>
      <SortPanel sort={view.sort ?? []} props={allProps} label={(id) => propLabel(def, id)} onchange={(s) => mutate((_, v) => { v.sort = s.length ? s : undefined; })} />
    {:else if p.kind === 'group'}
      <h4>{view.type === 'board' ? 'Colunas do quadro' : 'Agrupar por'}</h4>
      <button class="db-item" class:on={!view.groupBy} onclick={() => { mutate((_, v) => { v.groupBy = undefined; }); panel = null; }}><span class="ic">{!view.groupBy ? '✓' : ''}</span>Nenhum</button>
      {#each groupable as id (id)}
        <button class="db-item" class:on={view.groupBy?.property === id} onclick={() => { mutate((_, v) => { v.groupBy = { property: id, direction: v.groupBy?.direction ?? 'ASC' }; }); panel = null; }}>
          <span class="ic">{view.groupBy?.property === id ? '✓' : PROP_ICON[typeFn(id)] ?? 'Aa'}</span>{propLabel(def, id)}</button>
      {/each}
      {#if view.groupBy}
        <hr />
        <div class="db-row">
          <select class="db-select" value={view.groupBy.direction} onchange={(e) => mutate((_, v) => { v.groupBy = { ...v.groupBy!, direction: (e.currentTarget as HTMLSelectElement).value as 'ASC' | 'DESC' }; })}>
            <option value="ASC">Crescente</option><option value="DESC">Decrescente</option>
          </select>
          <label class="chk"><input type="checkbox" checked={!!view.hideEmptyGroups} onchange={() => mutate((_, v) => { v.hideEmptyGroups = !v.hideEmptyGroups || undefined; })} /> Esconder grupos vazios</label>
        </div>
      {/if}
    {:else if p.kind === 'props'}
      <h4>Visíveis</h4>
      {#each columns as id, i (id)}
        <div class="prow">
          <span class="ic">{PROP_ICON[typeFn(id)] ?? 'Aa'}</span><span class="nm">{propLabel(def, id)}</span>
          {#if id !== 'file.name'}
            <button class="db-btn" aria-label="Subir" disabled={i <= 1} onclick={() => { const o = [...columns]; [o[i - 1], o[i]] = [o[i]!, o[i - 1]!]; setOrder(o); }}>↑</button>
            <button class="db-btn" aria-label="Esconder" onclick={() => setOrder(columns.filter((c) => c !== id))}>◉</button>
          {/if}
        </div>
      {/each}
      {#if allProps.some((c) => !columns.includes(c))}
        <h4>Escondidas</h4>
        {#each allProps.filter((c) => !columns.includes(c)) as id (id)}
          <div class="prow dim">
            <span class="ic">{PROP_ICON[typeFn(id)] ?? 'Aa'}</span><span class="nm">{propLabel(def, id)}</span>
            <button class="db-btn" aria-label="Mostrar" onclick={() => setOrder([...columns, id])}>◌</button>
          </div>
        {/each}
      {/if}
      <hr />
      <button class="db-item" onclick={(e) => { panel = { kind: 'addprop', el: p.el }; e.stopPropagation(); }}><span class="ic">+</span>Nova propriedade</button>
    {:else if p.kind === 'addprop'}
      <div class="addp">
        <h4>Nova propriedade</h4>
        <input class="db-input" placeholder="Nome" bind:value={newProp.name} onkeydown={(e) => { if (e.key === 'Enter' && newProp.type !== 'formula') createProp(); }} use:focus />
        <div class="types">
          {#each [...PROP_TYPES.filter((t) => !['created', 'edited'].includes(t.id)), { id: 'formula', label: 'Fórmula', icon: 'ƒ' }] as t (t.id)}
            <button class="db-item" class:sel={newProp.type === t.id} onclick={() => (newProp.type = t.id)}><span class="ic">{t.icon}</span>{t.label}</button>
          {/each}
        </div>
        {#if newProp.type === 'formula'}
          <textarea class="db-input" rows="2" placeholder={'ex.: if(prazo < today(), "atrasada", "")'} bind:value={newProp.formula} spellcheck="false"></textarea>
        {/if}
        <button class="db-btn primary" disabled={!newProp.name.trim()} onclick={createProp}>Criar</button>
      </div>
    {:else if p.kind === 'view'}
      <div class="vm">
        <input class="db-input" value={view.name} aria-label="Nome da view" onchange={(e) => { const n = (e.currentTarget as HTMLInputElement).value.trim(); if (n) mutate((_, v) => { v.name = n; }); }} />
        <h4>Layout</h4>
        <div class="layouts">
          {#each VIEW_TYPES as t (t.id)}
            <button class="lay" class:on={view.type === t.id || (view.type === 'cards' && t.id === 'gallery')} onclick={() => mutate((_, v) => {
              v.type = t.id;
              if (t.id === 'board' && !v.groupBy) { const s = columns.find((c) => ['status', 'select'].includes(typeFn(c))); if (s) v.groupBy = { property: s, direction: 'ASC' }; }
              if ((t.id === 'calendar' || t.id === 'timeline') && !v.date && dateProps[0]) v.date = dateProps[0];
            })}><span>{t.icon}</span>{t.label}</button>
          {/each}
        </div>
        {#if view.type === 'calendar' || view.type === 'timeline'}
          <h4>{view.type === 'timeline' ? 'Início' : 'Data'}</h4>
          <select class="db-select" value={view.date ?? ''} onchange={(e) => mutate((_, v) => { v.date = (e.currentTarget as HTMLSelectElement).value || undefined; })}>
            <option value="">Automático</option>{#each dateProps as d (d)}<option value={d}>{propLabel(def, d)}</option>{/each}
          </select>
          {#if view.type === 'timeline'}
            <h4>Fim</h4>
            <select class="db-select" value={view.endDate ?? ''} onchange={(e) => mutate((_, v) => { v.endDate = (e.currentTarget as HTMLSelectElement).value || undefined; })}>
              <option value="">Nenhum</option>{#each dateProps as d (d)}<option value={d}>{propLabel(def, d)}</option>{/each}
            </select>
          {/if}
        {/if}
        {#if view.type === 'gallery' || view.type === 'cards'}
          <h4>Capa</h4>
          <select class="db-select" value={view.image ?? ''} onchange={(e) => mutate((_, v) => { v.image = (e.currentTarget as HTMLSelectElement).value || undefined; })}>
            <option value="">Primeira imagem da nota</option><option value="none">Sem capa</option>
            {#each allProps.filter((c) => c.startsWith('note.') || c.startsWith('formula.')) as c (c)}<option value={c}>{propLabel(def, c)}</option>{/each}
          </select>
          <h4>Tamanho dos cartões</h4>
          <input type="range" min="160" max="360" step="10" value={view.cardSize ?? 230} onchange={(e) => mutate((_, v) => { v.cardSize = Number((e.currentTarget as HTMLInputElement).value); })} />
        {/if}
        <h4>Limite</h4>
        <input class="db-input" type="number" min="0" placeholder="Sem limite" value={view.limit ?? ''} onchange={(e) => mutate((_, v) => { const n = Number((e.currentTarget as HTMLInputElement).value); v.limit = n > 0 ? n : undefined; })} />
        <label class="chk"><input type="checkbox" checked={!!view.showArchived} onchange={() => mutate((_, v) => { v.showArchived = v.showArchived ? undefined : true; })} /> Mostrar arquivados</label>
        <hr />
        <button class="db-item" onclick={() => { mutate((d) => d.views.splice(vi + 1, 0, { ...structuredClone($state.snapshot(view)), name: `${view.name} (cópia)` })); pick(vi + 1); panel = null; }}><span class="ic">⧉</span>Duplicar view</button>
        <button class="db-item" disabled={vi === 0} onclick={() => { mutate((d) => { const [x] = d.views.splice(vi, 1); d.views.splice(vi - 1, 0, x!); }); pick(vi - 1); }}><span class="ic">←</span>Mover para a esquerda</button>
        <button class="db-item" onclick={(e) => { yaml = block?.source ?? serializeBase(def); yamlErr = null; panel = { kind: 'yaml', el: p.el }; e.stopPropagation(); }}><span class="ic">{'{}'}</span>Editar YAML do banco</button>
        {#if !embedded && onOpenNote}<button class="db-item" onclick={() => onOpenNote(notePath)}><span class="ic">✎</span>Abrir a nota do banco</button>{/if}
        {#if def.views.length > 1}
          <button class="db-item danger" onclick={() => { mutate((d) => d.views.splice(vi, 1)); pick(Math.max(0, vi - 1)); panel = null; }}><span class="ic">✕</span>Excluir view</button>
        {/if}
      </div>
    {:else if p.kind === 'yaml'}
      <div class="yaml">
        <h4>YAML do banco (formato Obsidian Bases)</h4>
        <textarea class="db-input" rows="16" bind:value={yaml} spellcheck="false"></textarea>
        {#if yamlErr}<p class="db-err">{yamlErr}</p>{/if}
        <button class="db-btn primary" onclick={saveYaml}>Salvar</button>
      </div>
    {:else if p.kind === 'new'}
      <h4>Criar com modelo</h4>
      <button class="db-item" onclick={() => { add({}, undefined, null); panel = null; }}><span class="ic">▫</span>Página em branco</button>
      {#each templates as t (t.path)}
        <div class="trow">
          <button class="db-item" onclick={() => { add({}, undefined, t); panel = null; }}><span class="ic">❐</span>{t.name}{#if def.template && def.template.includes(t.path!.replace(/\.md$/, ''))}<span class="r">padrão</span>{/if}</button>
          <button class="db-btn" title="Editar modelo" onclick={() => { bases.peek = t.path; panel = null; }}>✎</button>
          <button class="db-btn" title="Usar como padrão" onclick={() => setDefaultTemplate(def.template?.includes(t.path!.replace(/\.md$/, '')) ? null : t)}>★</button>
        </div>
      {/each}
      <hr />
      <button class="db-item" onclick={newTemplate}><span class="ic">+</span>Novo modelo</button>
      <p class="db-hint">Modelos ficam em <code>Modelos/</code> com <code>modelo-para</code> apontando para este banco; aceitam {'{{title}}'} e {'{{date}}'}.</p>
    {:else if p.kind === 'addview'}
      <h4>Nova view</h4>
      {#each VIEW_TYPES as t (t.id)}<button class="db-item" onclick={() => addView(t.id)}><span class="ic">{t.icon}</span>{t.label}</button>{/each}
    {/if}
  </Popover>
{/if}

<style>
  .base { display: flex; flex-direction: column; min-width: 0; }
  .bar { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; flex-wrap: wrap; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
  .tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
  .tab { display: flex; align-items: center; gap: 6px; border: 0; background: none; padding: 7px 10px; color: var(--muted); border-bottom: 2px solid transparent;
    font: 500 13px var(--f-body); white-space: nowrap; margin-bottom: -1px; transition: color var(--dur), border-color var(--dur); }
  .tab:hover { color: var(--ink); }
  .tab.on { color: var(--ink); border-bottom-color: var(--ember); }
  .vic { font-size: 11px; opacity: .8; }
  .tab.add { padding: 7px 9px; }
  .tabin { width: 140px; margin-bottom: 4px; }
  .tools { display: flex; align-items: center; gap: 2px; padding-bottom: 5px; flex-wrap: wrap; }
  .find { width: 160px; padding: 4px 8px; }
  .split { display: inline-flex; margin-left: 6px; }
  .split .db-btn { border-radius: 8px 0 0 8px; padding: 4px 11px; }
  .split .caret { border-radius: 0 8px 8px 0; padding: 4px 6px; border-left: 1px solid color-mix(in srgb, var(--on-ember) 25%, transparent); }
  .body { overflow-x: auto; min-width: 0; }
  .embedded .body { max-height: 70vh; overflow-y: auto; }
  .foot { display: flex; gap: 14px; padding: 6px 2px; font: 11.5px var(--f-mono); color: var(--muted); }
  .global summary { color: var(--muted); font-size: 12.5px; cursor: pointer; padding: 4px 8px; }
  .prow { display: flex; align-items: center; gap: 8px; padding: 2px 6px; font-size: 13px; }
  .prow .ic { width: 18px; text-align: center; color: var(--muted); font-size: 12px; }
  .prow .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prow.dim .nm { color: var(--muted); }
  .addp, .vm, .yaml { display: grid; gap: 6px; padding: 4px; width: 300px; }
  .yaml { width: min(520px, calc(100vw - 40px)); }
  .types { display: grid; grid-template-columns: 1fr 1fr; max-height: 240px; overflow: auto; }
  .types .db-item { padding: 5px 6px; font-size: 12.5px; }
  .layouts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .lay { display: grid; place-items: center; gap: 3px; border: 1px solid var(--line); border-radius: 9px; background: none; padding: 8px 4px; font-size: 11.5px; color: var(--muted); }
  .lay span { font-size: 16px; }
  .lay:hover { color: var(--ink); border-color: var(--muted); }
  .lay.on { color: var(--ember); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 8%, transparent); }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); padding: 4px 2px; }
  .trow { display: flex; align-items: center; }
  .trow .db-item { flex: 1; min-width: 0; }
  .trow .db-btn { padding: 2px 7px; opacity: .6; }
  .trow .db-btn:hover { opacity: 1; }
  @media (max-width: 720px) {
    .tools { width: 100%; }
    .split { margin-left: auto; }
  }
</style>
