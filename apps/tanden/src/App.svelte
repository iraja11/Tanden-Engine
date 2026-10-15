<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { engine } from './lib/engine.svelte';
  import Orb from './lib/Orb.svelte';
  import Veins from './lib/Veins.svelte';
  import Editor from './lib/Editor.svelte';
  import { updater } from './lib/updater.svelte';
  import DrivePanel from './lib/DrivePanel.svelte';
  import AiPanel from './lib/AiPanel.svelte';
  import RemindersPanel from './lib/RemindersPanel.svelte';
  import { reminders } from './lib/reminders.svelte';
  import Quadro from './lib/quadro/Quadro.svelte';
  import SheetsView from './lib/sheets/SheetsView.svelte';
  import { sheets } from './lib/sheets/sheets.svelte';
  import FilesView from './lib/files/FilesView.svelte';
  import NoteTools from './lib/files/NoteTools.svelte';
  import { files } from './lib/files/files.svelte';
  import LutaView from './lib/cadernos/LutaView.svelte';
  import MundoView from './lib/cadernos/MundoView.svelte';
  import { cadernos } from './lib/cadernos/cadernos.svelte';
  import SlidesView from './lib/slides/SlidesView.svelte';
  import Presenter from './lib/slides/Presenter.svelte';
  import { slides } from './lib/slides/slides.svelte';
  import PluginsView from './lib/plugins/PluginsView.svelte';
  import PluginFrame from './lib/plugins/PluginFrame.svelte';
  import { plugins } from './lib/plugins/plugins.svelte';
  import DatabasesView from './lib/bases/DatabasesView.svelte';
  import PageTree from './lib/bases/PageTree.svelte';
  import PagePeek from './lib/bases/PagePeek.svelte';
  import PropertiesPanel from './lib/bases/PropertiesPanel.svelte';
  import Popover from './lib/bases/Popover.svelte';
  import { bases } from './lib/bases/bases.svelte';
  import Splash from './lib/Splash.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import { feel } from './lib/feel.svelte';
  import { sound } from './lib/sound.svelte';
  import { theme } from './lib/theme.svelte';
  import { pop, rise, vanish } from './lib/motion';

  let host = $state<HTMLElement>();
  let orbWrap = $state<HTMLElement>();
  let notesEl = $state<HTMLElement>();
  let editorEl = $state<HTMLElement>();
  let statusEl = $state<HTMLElement>();
  let drawer = $state(false);
  let drivePanel = $state(false);
  let settings = $state(false);
  let splash = $state(true);
  let railList = $state<HTMLElement>();
  let railBtns = $state<Record<string, HTMLElement>>({});
  /** marcador que desliza até o módulo ativo na barra */
  let mark = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let error = $state('');
  type View = 'notas' | 'bancos' | 'ia' | 'lembretes' | 'quadros' | 'planilhas' | 'calculo' | 'arquivos' | 'luta' | 'mundos' | 'slides' | 'plugins' | `plugin:${string}`;
  let view = $state<View>('notas');
  /** id do plugin cuja tela está aberta */
  const pluginView = $derived(view.startsWith('plugin:') ? view.slice(7) : null);
  /** o painel de IA fica montado depois de aberto, para não matar as sessões */
  let aiOpened = $state(false);

  const modules = [
    { id: 'notas', label: 'Notas', ready: true },
    { id: 'bancos', label: 'Bancos', ready: true },
    { id: 'ia', label: 'IA', ready: true },
    { id: 'lembretes', label: 'Lembretes', ready: true },
    { id: 'quadros', label: 'Quadros', ready: true },
    { id: 'agenda', label: 'Agenda', ready: false },
    { id: 'planilhas', label: 'Planilhas', ready: true },
    { id: 'calculo', label: 'Cálculo', ready: true },
    { id: 'slides', label: 'Slides', ready: true },
    { id: 'mundos', label: 'Mundos', ready: true },
    { id: 'luta', label: 'Luta', ready: true },
    { id: 'arquivos', label: 'Arquivos', ready: true },
  ];
  /** cada plugin com tela ganha um botão, depois dos módulos */
  const railItems = $derived([
    ...modules,
    ...plugins.rail.map((e) => ({ id: `plugin:${e.manifest.id}`, label: e.manifest.nome, ready: true })),
    { id: 'plugins', label: 'Plugins', ready: true },
  ]);
  const badgeOf = (id: string) => (id === 'lembretes' ? reminders.attention : id.startsWith('plugin:') ? plugins.badges[id.slice(7)] ?? 0 : 0);

  $effect(() => { if (engine.ready) void reminders.start(); });
  $effect(() => { if (engine.ready) sheets.start(); });
  $effect(() => { if (engine.ready) cadernos.start(); });
  $effect(() => { if (engine.ready) files.start(); });
  $effect(() => { if (engine.ready) slides.start(); });
  $effect(() => { if (engine.ready) bases.start(); });
  // "abrir banco" de outras telas
  $effect(() => { if (bases.goto) untrack(() => go('bancos')); });
  // "criar slides da nota" e importações de .pptx abrem a tela de slides
  $effect(() => { if (slides.goto) untrack(() => go('slides')); });
  $effect(() => { if (engine.ready) void plugins.start(); });
  // abrir um plugin (pela tela de plugins ou por um aviso dele)
  $effect(() => { const g = plugins.goto; if (g) untrack(() => go(`plugin:${g.id}`)); });
  // plugin desligado com a tela aberta: volta para a lista
  $effect(() => { if (pluginView && !plugins.active.some((e) => e.manifest.id === pluginView)) view = 'plugins'; });
  // links e importações pedem para trocar de tela
  $effect(() => { if (files.goto) view = files.goto.view; });
  // clicar num aviso de lembrete abre a tela de lembretes
  $effect(() => { if (reminders.openRequests) view = 'lembretes'; });

  function placeMark() {
    const b = railBtns[view];
    mark = b ? { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight } : null;
  }
  $effect(() => {
    view;
    placeMark();
  });
  $effect(() => {
    if (!railList) return;
    const ro = new ResizeObserver(placeMark);
    ro.observe(railList);
    return () => ro.disconnect();
  });

  function go(id: View) {
    if (id !== view) sound.play('tick');
    view = id;
    if (view === 'ia') aiOpened = true;
    if (id.startsWith('plugin:') && !plugins.opened[id.slice(7)]) plugins.opened = { ...plugins.opened, [id.slice(7)]: true };
  }

  let treeFilter = $state('');
  let newMenu = $state<HTMLElement | null>(null);
  function openNote(p: string) {
    if (p !== engine.active) sound.play('tick');
    engine.open(p);
    drawer = false;
    view = 'notas';
  }
  function pageFrom(t: (typeof bases.templates)[number] | null) {
    newMenu = null;
    openNote(bases.newPage(null, t));
  }

  function newNote() {
    feel.local(() => engine.newNote());
    sound.play('create');
  }

  async function syncByHand() {
    sound.play('tick');
    feel.turn();
    await engine.syncNow();
  }

  function toggleSettings() {
    settings = !settings;
    sound.play(settings ? 'open' : 'close');
    if (settings) drivePanel = false;
  }

  function toggleDrive() {
    drivePanel = !drivePanel;
    sound.play(drivePanel ? 'open' : 'close');
    if (drivePanel) settings = false;
  }

  onMount(() => {
    feel.start();
    engine.start().catch((e) => (error = String(e)));
    void updater.start();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); newNote(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void syncByHand(); }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); toggleSettings(); }
      if (e.key === 'Escape' && drivePanel) { drivePanel = false; sound.play('close'); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
</script>

<div class="shell" bind:this={host}>
  <Veins {host} orb={orbWrap} targets={{ notes: notesEl, editor: editorEl, status: statusEl }}
    flowing={engine.busy} pulses={engine.pulses} />

  <nav class="rail">
    <div bind:this={orbWrap} class="orb-wrap" class:hide={splash}>
      <Orb load={feel.load} kick={feel.kick} flash={feel.flash} onclick={syncByHand} />
    </div>
    <button class="menu" onclick={() => { drawer = !drawer; sound.play(drawer ? 'open' : 'close'); }} aria-label="Notas">☰</button>
    <ul bind:this={railList}>
      {#if mark}
        <span class="mark" aria-hidden="true" style:transform="translate({mark.x}px, {mark.y}px)"
          style:width="{mark.w}px" style:height="{mark.h}px"></span>
      {/if}
      {#each railItems as m (m.id)}
        {@const badge = badgeOf(m.id)}
        <li><button bind:this={railBtns[m.id]} class:on={m.id === view} class:plugin={m.id.startsWith('plugin:')} disabled={!m.ready} title={m.ready ? m.label : `${m.label}: em breve`}
          onclick={() => go(m.id as View)}>{m.label}{#if badge}{#key badge}<i class="badge" in:pop={{ from: .5 }}>{badge > 99 ? '99+' : badge}</i>{/key}{/if}</button></li>
      {/each}
    </ul>
    <button class="gear" class:on={settings} onclick={toggleSettings} title="Aparência e sons (Ctrl+,)" aria-label="Aparência e sons">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
    </button>
  </nav>

  <aside class="side" class:open={drawer} bind:this={notesEl}>
    <header>
      <h2>Notas <span>{engine.notes.length}</span></h2>
      <span class="hb">
        <button class="new" onclick={() => { newNote(); drawer = false; }} title="Nova nota (Ctrl+N)" aria-label="Nova nota">+</button>
        <button class="new more" onclick={(e) => (newMenu = newMenu ? null : e.currentTarget as HTMLElement)} title="Nova a partir de modelo" aria-label="Mais opções de criação">▾</button>
      </span>
    </header>
    <input class="find" placeholder="Filtrar notas" bind:value={treeFilter} aria-label="Filtrar notas" />
    <div class="treewrap"><PageTree notes={engine.notes} active={view === 'notas' ? engine.active : null} filter={treeFilter} onopen={openNote} /></div>
  </aside>
  {#if newMenu}
    <Popover anchor={newMenu} onclose={() => (newMenu = null)}>
      <h4>Nova página</h4>
      <button class="db-item" onclick={() => pageFrom(null)}><span class="ic">▫</span>Em branco</button>
      {#each bases.templates.filter((t) => !t.target) as t (t.path ?? t.name)}
        <button class="db-item" onclick={() => pageFrom(t)}><span class="ic">❐</span>{t.name}</button>
      {/each}
      <hr />
      <button class="db-item" onclick={() => { newMenu = null; drawer = false; go('bancos'); }}><span class="ic">▤</span>Banco de dados…</button>
    </Popover>
  {/if}

  <main class="main" bind:this={editorEl}>
    {#if updater.available}
      <div class="update" role="status">
        {#if updater.error}
          <span>{updater.error}</span>
        {:else if updater.progress !== null}
          <span>Baixando a versão {updater.available.version}… {Math.round(updater.progress * 100)}%</span>
        {:else}
          <span>Versão <b>{updater.available.version}</b> disponível</span>
          <button onclick={() => updater.install()}>{updater.android ? 'Baixar e instalar' : 'Atualizar e reiniciar'}</button>
        {/if}
      </div>
    {/if}
    {#if aiOpened}
      <div class="ai-host" class:hidden={view !== 'ia'}><AiPanel /></div>
    {/if}
    {#each plugins.mounted as p (p.manifest.id)}
      <!-- janelas de plugins ficam vivas escondidas, para avisar e buscar em segundo plano -->
      <div class="plugin-host" class:hidden={pluginView !== p.manifest.id}><PluginFrame entry={p} visible={pluginView === p.manifest.id} /></div>
    {/each}
    {#key view}
      <div class="view" class:empty={view === 'ia' || !!pluginView} in:rise={{ y: 10 }}>
        {#if view === 'ia' || pluginView}
          <!-- o painel de IA ou a janela do plugin ocupa a área -->
        {:else if view === 'plugins' && engine.ready}
          <PluginsView />
        {:else if view === 'lembretes' && engine.ready}
          <RemindersPanel onopen={(p) => { engine.open(p); go('notas'); }} />
        {:else if view === 'planilhas' && engine.ready}
          <SheetsView />
        {:else if view === 'calculo' && engine.ready}
          <!-- o cálculo (mathjs, KaTeX) carrega só quando a aba abre -->
          {#await import('./lib/calc/CalcView.svelte') then m}
            <m.default onOpenNote={(p: string) => { engine.open(p); go('notas'); }} />
          {/await}
        {:else if view === 'bancos' && engine.ready}
          <DatabasesView onOpenNote={openNote} />
        {:else if view === 'slides' && engine.ready}
          <SlidesView />
        {:else if view === 'arquivos' && engine.ready}
          <FilesView />
        {:else if view === 'luta' && engine.ready}
          <LutaView onOpenNote={(p) => { engine.open(p); go('notas'); }} />
        {:else if view === 'mundos' && engine.ready}
          <MundoView onOpenNote={(p) => { engine.open(p); go('notas'); }} />
        {:else if view === 'quadros' && engine.ready}
          <Quadro onOpenNote={(p) => { engine.open(p); go('notas'); }} />
        {:else if error}
          <p class="err">Não consegui abrir o cofre: {error}</p>
        {:else if !engine.ready}
          <p class="loading">Abrindo o cofre…</p>
        {:else if engine.active}
          {#key engine.active}
            <div class="note" in:rise={{ y: 4, duration: 200 }}>
              <div class="crumb"><span>{engine.active}</span><NoteTools path={engine.active} /></div>
              <div class="propbox"><PropertiesPanel path={engine.active} onopen={(p) => (bases.peek = p)} /></div>
              <Editor value={engine.content} docKey={engine.active} onchange={(v) => engine.edit(v)}
                host={files.host} onfiles={(f) => void files.importFiles(f, { attach: true })} />
            </div>
          {/key}
        {:else}
          <p class="loading">Nenhuma nota aberta.</p>
        {/if}
      </div>
    {/key}
  </main>

  {#if files.notice || files.busy}
    <div class="toast" class:error={files.notice?.error} role="status" aria-live="polite">
      {#if files.notice}
        <span>{files.notice.text}</span>
        {#if files.notice.path}
          {@const p = files.notice.path}
          <button onclick={() => { files.openPath(p); files.notice = null; }}>Abrir</button>
        {/if}
        <button class="x" aria-label="Fechar" onclick={() => (files.notice = null)}>×</button>
      {:else}
        <i></i><span>{files.busy}</span>
      {/if}
    </div>
  {/if}

  <footer class="status" bind:this={statusEl}>
    <span class="dot" class:busy={engine.busy}></span>
    {#if engine.busy}
      {Object.values(engine.running).join(' · ')}…
    {:else if engine.lastSync}
      Sincronizado às {hhmm(engine.lastSync)}
    {:else}
      Aguardando
    {/if}
    <span class="sep">·</span>
    <button class="drive" class:on={engine.driveOn} class:warn={!!engine.driveError} onclick={toggleDrive}>
      {engine.driveOn ? (engine.driveError ? 'Drive: sem conexão' : 'Drive conectado') : 'Conectar Google Drive'}
    </button>
    <span class="sep">·</span> {engine.vault?.deviceId ?? ''}
    <span class="sep">·</span> <span class="loc">{engine.location}</span>
  </footer>

  {#if drivePanel}<DrivePanel onclose={toggleDrive} />{/if}
  {#if settings}<SettingsPanel onclose={toggleSettings} />{/if}
</div>

{#if bases.peek}
  {#key bases.peek}<PagePeek path={bases.peek} onOpenNote={openNote} />{/key}
{/if}

{#if slides.presenting}
  <Presenter path={slides.presenting.path} start={slides.presenting.index} />
{/if}

{#if splash}
  <Splash ready={engine.ready} {error} target={orbWrap} ondone={() => (splash = false)} />
{/if}

<style>
  .shell { position: relative; height: 100%; display: grid; overflow: hidden;
    grid-template: "rail side main" 1fr "rail side status" auto / 76px 260px 1fr; }
  .rail, .side, .main, .status { position: relative; }

  .rail { grid-area: rail; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 16px 0;
    border-right: 1px solid var(--line); }
  .rail ul { position: relative; list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .rail ul button { width: 64px; border: 0; background: none; padding: 8px 0; border-radius: 10px;
    font: 500 10.5px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
    transition: color var(--dur) var(--ease), transform var(--dur) var(--spring); }
  .rail ul button:hover:not(:disabled) { color: var(--ink); }
  .rail ul button:active:not(:disabled) { transform: scale(.94); }
  .rail ul button.on { color: var(--ember); }
  .mark { position: absolute; left: 0; top: 0; border-radius: 10px; pointer-events: none;
    background: color-mix(in srgb, var(--ember) 11%, transparent); box-shadow: inset 2px 0 0 var(--ember), 0 0 18px -8px var(--ember-glow);
    transition: transform var(--dur-slow) var(--spring), width var(--dur-slow) var(--spring), height var(--dur-slow) var(--spring); }
  .orb-wrap.hide { visibility: hidden; }
  .gear { margin-top: auto; width: 34px; height: 34px; display: grid; place-items: center; border: 0; border-radius: 10px;
    background: none; color: var(--muted); transition: color var(--dur), background var(--dur), transform var(--dur-slow) var(--spring); }
  .gear svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .gear:hover { color: var(--ink); background: var(--surface-2); }
  .gear.on { color: var(--ember); transform: rotate(60deg); }
  .rail ul button:disabled { opacity: .35; cursor: default; }
  .rail ul button { position: relative; width: 70px; letter-spacing: .05em; }
  .badge { position: absolute; top: -6px; right: 0; min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px; background: var(--ember);
    color: var(--on-ember); font: 600 9.5px/15px var(--f-mono); font-style: normal; letter-spacing: 0; box-shadow: 0 0 10px -2px var(--ember-glow); }
  .menu { display: none; border: 0; background: none; font-size: 20px; color: var(--muted); }

  .side { grid-area: side; display: flex; flex-direction: column; min-height: 0; background: var(--surface);
    border-right: 1px solid var(--line); }
  .side header { display: flex; align-items: center; justify-content: space-between; padding: 18px 16px 10px; }
  .side h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .side h2 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; margin-left: 6px; }
  .new { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 18px; line-height: 1; }
  .new { transition: border-color var(--dur), color var(--dur), transform var(--dur) var(--spring); }
  .new:hover { border-color: var(--ember); color: var(--ember); transform: rotate(90deg); }
  .hb { display: flex; gap: 4px; }
  .new.more { font-size: 11px; width: 22px; }
  .new.more:hover { transform: none; }
  .find { margin: 0 12px 8px; background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 6px 9px; font: 12.5px var(--f-body); outline: none; }
  .find:focus { border-color: var(--ember); }
  .treewrap { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px 16px; }
  .propbox { max-width: 808px; width: 100%; margin: 0 auto; padding: 4px 24px 0; }

  .main { grid-area: main; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .crumb { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px 0; font: 11px var(--f-mono); color: var(--muted); max-width: 808px; width: 100%; margin: 0 auto; }
  .main :global(.editor) { flex: 1; }
  .view { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .view.empty { display: none; }
  .note { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .ai-host:not(.hidden) { animation: view-in var(--dur) var(--ease); }
  @keyframes view-in { from { opacity: 0; transform: translateY(10px); } }
  .update { display: flex; align-items: center; gap: 12px; justify-content: space-between; margin: 12px 24px 0;
    padding: 10px 14px; border: 1px solid var(--ember); border-radius: 12px; background: color-mix(in srgb, var(--ember) 8%, var(--surface));
    box-shadow: 0 0 24px -12px var(--ember); }
  .update b { color: var(--ember-soft); }
  .update button { border: 0; border-radius: 9px; padding: 6px 12px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .ai-host { flex: 1; min-height: 0; }
  .ai-host.hidden { display: none; }
  .plugin-host { flex: 1; min-height: 0; animation: view-in var(--dur) var(--ease); }
  .plugin-host.hidden { display: none; }
  .loading, .err { margin: auto; color: var(--muted); }
  .err { color: var(--crit); }

  .status { grid-area: status; display: flex; align-items: center; gap: 8px; padding: 6px 16px; border-top: 1px solid var(--line);
    font: 11px var(--f-mono); color: var(--muted); white-space: nowrap; overflow: hidden; }
  .loc { overflow: hidden; text-overflow: ellipsis; }
  .drive { border: 0; background: none; padding: 0; font: inherit; color: var(--ember-soft); text-decoration: underline dotted; }
  .drive.on { color: var(--ok); text-decoration: none; }
  .drive.warn { color: var(--crit); }
  .sep { opacity: .5; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex: none; }
  .dot.busy { background: var(--ember); animation: beat 1s var(--ease) infinite; }
  @keyframes beat { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ember) 18%, transparent); } }

  @media (max-width: 720px) {
    .shell { grid-template: "rail" auto "main" 1fr "status" auto / 1fr; }
    .rail { flex-direction: row; padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top)); border-right: 0; border-bottom: 1px solid var(--line); }
    .rail { min-width: 0; }
    .rail ul { display: flex; margin-left: auto; min-width: 0; overflow-x: auto; scrollbar-width: none; padding-top: 6px; }
    .rail ul button { width: auto; padding: 8px 8px; }
    .menu { display: block; }
    .gear { margin: 0; flex: none; }
    .mark { box-shadow: inset 0 -2px 0 var(--ember); }
    .side { position: absolute; z-index: 5; top: 0; bottom: 0; left: 0; width: min(300px, 85vw);
      transform: translateX(-100%); transition: transform var(--dur-slow) var(--ease); box-shadow: 0 0 40px var(--shadow); }
    .side.open { transform: none; }
    .status { padding-bottom: max(6px, env(safe-area-inset-bottom)); }
  }
  .toast { position: fixed; z-index: 70; left: 50%; bottom: 44px; transform: translateX(-50%); max-width: min(560px, calc(100vw - 32px));
    display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 14px; border-radius: 12px; font-size: 13px;
    background: var(--surface); border: 1px solid var(--line); box-shadow: 0 18px 40px -16px #000, 0 0 0 1px var(--ember-glow); animation: toast .2s ease-out; }
  .toast.error { border-color: color-mix(in srgb, #e5484d 60%, var(--line)); }
  .toast span { overflow: hidden; text-overflow: ellipsis; }
  .toast button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ember); border-radius: 8px; padding: 3px 10px; font-size: 12px; white-space: nowrap; }
  .toast button.x { border: none; background: none; color: var(--muted); font-size: 16px; padding: 0 4px; }
  .toast i { width: 8px; height: 8px; border-radius: 50%; background: var(--ember); animation: pulse 1s ease-in-out infinite; flex: none; }
  @keyframes toast { from { opacity: 0; transform: translate(-50%, 8px); } }
  @keyframes pulse { 50% { opacity: .3; } }
</style>
