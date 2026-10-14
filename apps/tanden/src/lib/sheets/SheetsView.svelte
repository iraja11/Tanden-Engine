<script lang="ts">
  import { NF, formatGeneral, parseRect, type ChartType } from '@tanden/core';
  import { sheets } from './sheets.svelte';
  import { SheetCtl } from './ctl.svelte';
  import Grid from './Grid.svelte';
  import FormulaBar from './FormulaBar.svelte';
  import Chart from './Chart.svelte';
  import { chartData } from './chartdata';

  const ctl = new SheetCtl();
  let fileInput = $state<HTMLInputElement>();
  let menu = $state<'export' | 'nf' | 'chart' | null>(null);
  let renaming = $state<string | null>(null);
  let renameText = $state('');
  let chartsOpen = $state(true);

  // troca de pasta aberta
  $effect(() => {
    const wb = sheets.workbook;
    if (wb && ctl.wb !== wb) ctl.open(wb);
  });

  const version = $derived(sheets.version);
  const wb = $derived(ctl.wb);
  const tabs = $derived.by(() => { void version; return wb?.sheets() ?? []; });
  // aba apagada em outro aparelho
  $effect(() => { if (wb && tabs.length && !tabs.some((t) => t.id === ctl.sheet)) ctl.setSheet(tabs[0]!.id); });
  const charts = $derived.by(() => { void version; return wb ? wb.chartList(ctl.sheet) : []; });
  const stats = $derived.by(() => { void version; void ctl.sel; return ctl.stats(); });
  const fmt = $derived.by(() => { void version; return wb ? wb.format(ctl.sheet, ctl.sel.fr, ctl.sel.fc) : {}; });
  const title = (p: string) => p.split('/').pop()!.replace(/\.xlsx$/i, '');

  const NUMBER_FORMATS: Array<{ label: string; nf: string | undefined; ex: string }> = [
    { label: 'Automático', nf: undefined, ex: '1234,5' },
    { label: 'Número', nf: NF.num2, ex: '1.234,50' },
    { label: 'Inteiro', nf: NF.int, ex: '1.235' },
    { label: 'Moeda (R$)', nf: NF.brl, ex: 'R$ 1.234,50' },
    { label: 'Porcentagem', nf: NF.pct, ex: '12%' },
    { label: 'Porcentagem 0,00', nf: NF.pct2, ex: '12,35%' },
    { label: 'Data', nf: NF.date, ex: '14/10/2026' },
    { label: 'Data e hora', nf: NF.datetime, ex: '14/10/2026 08:30' },
    { label: 'Hora', nf: NF.time, ex: '08:30' },
    { label: 'Data por extenso', nf: 'd "de" mmmm "de" yyyy', ex: '14 de outubro de 2026' },
  ];
  const CHART_TYPES: Array<{ type: ChartType; label: string; icon: string }> = [
    { type: 'column', label: 'Colunas', icon: 'M3 21V11h4v10M10 21V5h4v16M17 21v-7h4v7' },
    { type: 'bar', label: 'Barras', icon: 'M3 3h10v4H3M3 10h16v4H3M3 17h7v4H3' },
    { type: 'line', label: 'Linha', icon: 'M3 17l5-6 4 3 8-9' },
    { type: 'area', label: 'Área', icon: 'M3 20V15l5-6 4 3 8-8v16z' },
    { type: 'pie', label: 'Rosca', icon: 'M12 3a9 9 0 1 0 9 9h-9z' },
    { type: 'scatter', label: 'Dispersão', icon: 'M5 17h.01M9 11h.01M13 14h.01M17 7h.01M19 12h.01' },
  ];

  function newChart(type: ChartType) {
    menu = null;
    if (!ctl.addChart(type)) sheets.say('Selecione os dados do gráfico (com os títulos), ou clique dentro de uma tabela.');
    chartsOpen = true;
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    for (const f of input.files ?? []) await sheets.importFile(f);
    input.value = '';
  }

  function onGlobalKey(e: KeyboardEvent) {
    if (e.key === 'Escape') menu = null;
  }

  function grab(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  const brief = (n: number) => formatGeneral(Math.round(n * 1e4) / 1e4);
</script>

<svelte:window onkeydown={onGlobalKey} onpointerdown={(e) => { if (!(e.target as Element).closest?.('.menu-wrap')) menu = null; }} />

<div class="sheets">
  <header class="sheet-tools">
    <div class="book">
      <select value={sheets.active ?? ''} onchange={(e) => sheets.open(e.currentTarget.value)} aria-label="Planilha aberta" disabled={!sheets.list.length}>
        {#if !sheets.list.length}<option value="">Nenhuma planilha</option>{/if}
        {#each sheets.list as p (p)}<option value={p}>{title(p)}</option>{/each}
      </select>
      <button class="icon" onclick={() => sheets.create()} title="Nova planilha" aria-label="Nova planilha">+</button>
      <button onclick={() => fileInput?.click()} title="Importar .xlsx ou .csv">Importar</button>
      <input bind:this={fileInput} type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv" multiple hidden onchange={onFile} />
      <div class="menu-wrap">
        <button onclick={() => (menu = menu === 'export' ? null : 'export')} disabled={!wb} aria-haspopup="menu">Exportar ▾</button>
        {#if menu === 'export'}
          <div class="menu" role="menu">
            <button role="menuitem" onclick={() => { menu = null; void sheets.export('xlsx'); }}>Excel / Sheets (.xlsx)</button>
            <button role="menuitem" onclick={() => { menu = null; void sheets.export('csv', ctl.sheet); }}>CSV (vírgula)</button>
            <button role="menuitem" onclick={() => { menu = null; void sheets.export('csv-br', ctl.sheet); }}>CSV do Excel brasileiro (;)</button>
          </div>
        {/if}
      </div>
    </div>

    {#if wb}
      <div class="fmt">
        <button class="icon" class:on={fmt.b} onclick={() => ctl.toggle('b')} title="Negrito (Ctrl+B)" aria-label="Negrito"><b>B</b></button>
        <button class="icon" class:on={fmt.i} onclick={() => ctl.toggle('i')} title="Itálico (Ctrl+I)" aria-label="Itálico"><i>I</i></button>
        {#each [['l', 'Esquerda', 'M4 6h16M4 12h10M4 18h13'], ['c', 'Centro', 'M4 6h16M7 12h10M5 18h14'], ['r', 'Direita', 'M4 6h16M10 12h10M7 18h13']] as [al, label, d] (al)}
          <button class="icon al" class:on={fmt.al === al} onclick={() => ctl.align(fmt.al === al ? undefined : (al as 'l' | 'c' | 'r'))} title={label} aria-label={label}>
            <svg viewBox="0 0 24 24" width="15" height="15"><path {d} /></svg>
          </button>
        {/each}
        <div class="menu-wrap">
          <button onclick={() => (menu = menu === 'nf' ? null : 'nf')} title="Formato de número" aria-haspopup="menu">
            {NUMBER_FORMATS.find((f) => f.nf === fmt.nf)?.label ?? 'Personalizado'} ▾
          </button>
          {#if menu === 'nf'}
            <div class="menu" role="menu">
              {#each NUMBER_FORMATS as f (f.label)}
                <button role="menuitem" class:on={f.nf === fmt.nf} onclick={() => { ctl.numberFormat(f.nf); menu = null; }}>{f.label}<small>{f.ex}</small></button>
              {/each}
            </div>
          {/if}
        </div>
        <span class="div"></span>
        <div class="menu-wrap">
          <button class="accent" onclick={() => (menu = menu === 'chart' ? null : 'chart')} aria-haspopup="menu">Gráfico ▾</button>
          {#if menu === 'chart'}
            <div class="menu grid2" role="menu">
              {#each CHART_TYPES as t (t.type)}
                <button role="menuitem" onclick={() => newChart(t.type)}>
                  <svg viewBox="0 0 24 24" width="18" height="18"><path d={t.icon} /></svg>{t.label}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="icon" onclick={() => wb.undo.undo()} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
        <button class="icon" onclick={() => wb.undo.redo()} title="Refazer (Ctrl+Y)" aria-label="Refazer">↷</button>
      </div>
    {/if}
  </header>

  {#if wb}
    <FormulaBar {ctl} {version} />
    <div class="work">
      {#key ctl.sheet + (sheets.active ?? '')}<Grid {ctl} {version} />{/key}
      {#if charts.length}
        <aside class="charts" class:closed={!chartsOpen}>
          <button class="toggle" onclick={() => (chartsOpen = !chartsOpen)} aria-expanded={chartsOpen}>
            {chartsOpen ? '›' : '‹'} <span>Gráficos {charts.length}</span>
          </button>
          {#if chartsOpen}
            <div class="list">
              {#each charts as c (c.id)}
                {@const d = chartData(wb, c)}
                <section class="chart-card">
                  <header>
                    <input class="ctitle" value={c.title ?? ''} placeholder="Título do gráfico" aria-label="Título"
                      onchange={(e) => wb.updateChart(c.id, { title: e.currentTarget.value })} />
                    <button class="x" onclick={() => wb.removeChart(c.id)} title="Apagar gráfico" aria-label="Apagar gráfico">×</button>
                  </header>
                  {#if 'error' in d}
                    <p class="cerr">{d.error}</p>
                  {:else}
                    <Chart data={d} type={c.type} stacked={c.stacked} />
                  {/if}
                  <footer>
                    <select value={c.type} onchange={(e) => wb.updateChart(c.id, { type: e.currentTarget.value as ChartType })} aria-label="Tipo">
                      {#each CHART_TYPES as t (t.type)}<option value={t.type}>{t.label}</option>{/each}
                    </select>
                    <input class="range" value={c.range} aria-label="Intervalo" title="Intervalo dos dados"
                      onchange={(e) => { const v = e.currentTarget.value.toUpperCase().replace(/\s/g, ''); if (parseRect(v)) wb.updateChart(c.id, { range: v }); }} />
                    <button class="mini" onclick={() => ctl.selectRect(parseRect(c.range)!)} title="Selecionar os dados na grade">Ver dados</button>
                    {#if c.type === 'column' || c.type === 'bar' || c.type === 'area'}
                      <label><input type="checkbox" checked={!!c.stacked} onchange={(e) => wb.updateChart(c.id, { stacked: e.currentTarget.checked })} /> Empilhar</label>
                    {/if}
                    <label><input type="checkbox" checked={!!c.byRow} onchange={(e) => wb.updateChart(c.id, { byRow: e.currentTarget.checked })} /> Séries nas linhas</label>
                  </footer>
                </section>
              {/each}
            </div>
          {/if}
        </aside>
      {/if}
    </div>
    <footer class="tabs">
      <div class="tablist" role="tablist">
        {#each tabs as t (t.id)}
          {#if renaming === t.id}
            <form onsubmit={(e) => { e.preventDefault(); wb.renameSheet(t.id, renameText); renaming = null; }}>
              <input class="tabname" bind:value={renameText} use:grab onblur={() => { wb.renameSheet(t.id, renameText); renaming = null; }} />
            </form>
          {:else}
            <button role="tab" class="tab" class:on={t.id === ctl.sheet} aria-selected={t.id === ctl.sheet}
              onclick={() => ctl.setSheet(t.id)} ondblclick={() => { renaming = t.id; renameText = t.name; }}
              title="Duplo clique para renomear">{t.name}</button>
          {/if}
        {/each}
        <button class="tab add" onclick={() => ctl.setSheet(wb.addSheet())} title="Nova aba" aria-label="Nova aba">+</button>
        {#if tabs.length > 1}
          <button class="tab del" onclick={() => { if (confirm(`Apagar a aba "${tabs.find((t) => t.id === ctl.sheet)?.name}"?`)) wb.removeSheet(ctl.sheet); }} title="Apagar esta aba" aria-label="Apagar aba">🗑</button>
        {/if}
      </div>
      <div class="info">
        {#if sheets.notice}<span class="notice">{sheets.notice}</span>
        {:else if stats && stats.count}
          {#if stats.nums}<span>Soma <b>{brief(stats.sum)}</b></span><span>Média <b>{brief(stats.sum / stats.nums)}</b></span>{/if}
          <span>Contagem <b>{stats.count}</b></span>
        {/if}
      </div>
    </footer>
  {:else}
    <div class="empty">
      <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><rect x="8" y="10" width="48" height="44" rx="6" /><path d="M8 24h48M8 38h48M24 10v44M40 10v44" /></svg>
      <h2>Planilhas</h2>
      <p>Fórmulas em português (SOMA, PROCV, SE…) ou em inglês, gráficos e arquivos .xlsx que abrem no Excel e no Sheets. Tudo sincroniza entre seus aparelhos.</p>
      <div class="row">
        <button class="pri" onclick={() => sheets.create()}>Nova planilha</button>
        <button onclick={() => fileInput?.click()}>Importar .xlsx ou .csv</button>
      </div>
      {#if sheets.notice}<p class="notice">{sheets.notice}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .sheets { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .sheet-tools { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  .book, .fmt { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .fmt { margin-left: auto; }
  button, select { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 5px 10px; font-size: 12.5px; color: var(--ink); }
  button:hover:not(:disabled), select:hover:not(:disabled) { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  button:disabled, select:disabled { opacity: .5; }
  select { max-width: 220px; font-weight: 600; }
  .icon { min-width: 30px; padding: 5px 7px; display: inline-grid; place-items: center; }
  .icon.on, .menu .on { color: var(--ember); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, var(--surface-2)); }
  .icon svg, .menu svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .accent { color: var(--ember-soft); }
  .div { width: 1px; height: 20px; background: var(--line); }
  .menu-wrap { position: relative; }
  .menu { position: absolute; z-index: 30; top: calc(100% + 6px); right: 0; min-width: 210px; display: grid; gap: 2px; padding: 6px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 40px -16px var(--shadow), 0 0 0 1px var(--ember-glow);
    animation: rise .14s cubic-bezier(.2, .8, .2, 1); }
  .book .menu { left: 0; right: auto; }
  .menu.grid2 { grid-template-columns: 1fr 1fr; min-width: 250px; }
  .menu button { border: 0; background: none; text-align: left; display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .menu.grid2 button { justify-content: flex-start; }
  .menu button:hover { background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .menu small { color: var(--muted); font: 11px var(--f-mono); }
  @keyframes rise { from { opacity: 0; transform: translateY(-4px); } }

  .work { flex: 1; min-height: 0; display: flex; position: relative; }
  .charts { width: min(440px, 42%); border-left: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; min-height: 0; }
  .charts.closed { width: 34px; }
  .toggle { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none; text-align: left; padding: 8px 12px;
    font: 600 11px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .charts.closed .toggle span { display: none; }
  .list { overflow-y: auto; padding: 10px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-content: start; }
  .chart-card { min-width: 0; background: var(--void); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; display: grid; gap: 8px;
    animation: rise .25s cubic-bezier(.2, .8, .2, 1); }
  .chart-card header { display: flex; gap: 6px; align-items: center; }
  .ctitle { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); font: 600 14px var(--f-display); letter-spacing: .02em; padding: 2px 0; outline: none; }
  .ctitle:focus { border-bottom: 1px solid var(--ember); }
  .ctitle::placeholder { color: var(--muted); }
  .x { border: 0; background: none; color: var(--muted); font-size: 18px; padding: 0 4px; }
  .chart-card footer { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--muted); }
  .chart-card footer select { font-weight: 400; padding: 3px 6px; }
  .range { width: 92px; border: 1px solid var(--line); background: var(--surface-2); border-radius: 7px; padding: 3px 6px; color: var(--ink); font: 11.5px var(--f-mono); }
  .mini { padding: 3px 8px; font-size: 11.5px; }
  label { display: inline-flex; gap: 4px; align-items: center; }
  input[type='checkbox'] { accent-color: var(--ember); }
  .cerr { margin: 8px 0; color: var(--muted); font-size: 12.5px; }

  .tabs { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--line); padding: 4px 8px; background: var(--surface); min-height: 34px; }
  .tablist { display: flex; gap: 2px; overflow-x: auto; flex: 1; min-width: 0; }
  .tab { border: 0; border-radius: 0 0 8px 8px; background: none; padding: 5px 12px; color: var(--muted); white-space: nowrap; border-top: 2px solid transparent; }
  .tab.on { color: var(--ink); background: var(--void); border-top-color: var(--ember); }
  .tab.add, .tab.del { color: var(--muted); }
  .tabname { width: 120px; background: var(--void); border: 1px solid var(--ember); border-radius: 6px; color: var(--ink); padding: 4px 8px; font: inherit; }
  .info { display: flex; gap: 14px; font: 11.5px var(--f-mono); color: var(--muted); white-space: nowrap; overflow: hidden; }
  .info b { color: var(--ink); font-weight: 400; }
  .notice { color: var(--ember-soft); overflow: hidden; text-overflow: ellipsis; }

  .empty { margin: auto; max-width: 440px; text-align: center; display: grid; justify-items: center; gap: 12px; padding: 24px; }
  .empty svg { fill: none; stroke: var(--ember); stroke-width: 1.6; filter: drop-shadow(0 0 10px var(--ember-glow)); }
  .empty h2 { margin: 0; font: 600 18px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .empty p { margin: 0; color: var(--muted); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .pri { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }

  @media (max-width: 720px) {
    .al, .div { display: none; }
    .fmt { margin-left: 0; }
    .work { flex-direction: column; }
    .charts { width: 100%; max-height: 45%; border-left: 0; border-top: 1px solid var(--line); }
    .charts.closed { width: 100%; max-height: 34px; }
  }
</style>
