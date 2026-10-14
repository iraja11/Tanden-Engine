<script lang="ts">
  import { onMount } from 'svelte';
  import { engine } from './lib/engine.svelte';
  import Orb from './lib/Orb.svelte';
  import Veins from './lib/Veins.svelte';
  import Editor from './lib/Editor.svelte';
  import { updater } from './lib/updater.svelte';
  import DrivePanel from './lib/DrivePanel.svelte';
  import AiPanel from './lib/AiPanel.svelte';
  import Quadro from './lib/quadro/Quadro.svelte';

  let host = $state<HTMLElement>();
  let orbWrap = $state<HTMLElement>();
  let notesEl = $state<HTMLElement>();
  let editorEl = $state<HTMLElement>();
  let statusEl = $state<HTMLElement>();
  let drawer = $state(false);
  let drivePanel = $state(false);
  let error = $state('');
  let view = $state<'notas' | 'ia' | 'quadros'>('notas');
  /** o painel de IA fica montado depois de aberto, para não matar as sessões */
  let aiOpened = $state(false);

  const modules = [
    { id: 'notas', label: 'Notas', ready: true },
    { id: 'ia', label: 'IA', ready: true },
    { id: 'quadros', label: 'Quadros', ready: true },
    { id: 'agenda', label: 'Agenda', ready: false },
    { id: 'planilhas', label: 'Planilhas', ready: false },
  ];

  onMount(() => {
    engine.start().catch((e) => (error = String(e)));
    void updater.start();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); engine.newNote(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void engine.syncNow(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const title = (p: string) => p.replace(/\.md$/, '').split('/').pop();
  const folder = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
</script>

<div class="shell" bind:this={host}>
  <Veins {host} orb={orbWrap} targets={{ notes: notesEl, editor: editorEl, status: statusEl }}
    flowing={engine.busy} pulses={engine.pulses} />

  <nav class="rail">
    <div bind:this={orbWrap} class="orb-wrap"><Orb busy={engine.busy} onclick={() => engine.syncNow()} /></div>
    <button class="menu" onclick={() => (drawer = !drawer)} aria-label="Notas">☰</button>
    <ul>
      {#each modules as m (m.id)}
        <li><button class:on={m.id === view} disabled={!m.ready} title={m.ready ? m.label : `${m.label}: em breve`}
          onclick={() => { view = m.id as typeof view; if (view === 'ia') aiOpened = true; }}>{m.label}</button></li>
      {/each}
    </ul>
  </nav>

  <aside class="side" class:open={drawer} bind:this={notesEl}>
    <header>
      <h2>Notas <span>{engine.notes.length}</span></h2>
      <button class="new" onclick={() => { engine.newNote(); drawer = false; }} title="Nova nota (Ctrl+N)" aria-label="Nova nota">+</button>
    </header>
    <ul>
      {#each engine.notes as path (path)}
        <li>
          <button class:active={path === engine.active} draggable="true"
            ondragstart={(e) => e.dataTransfer?.setData('text/tanden-note', path)} onclick={() => { engine.open(path); drawer = false; view = 'notas'; }}>
            <b>{title(path)}</b>{#if folder(path)}<small>{folder(path)}</small>{/if}
          </button>
        </li>
      {/each}
    </ul>
  </aside>

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
    {#if view === 'ia'}
      <!-- o painel de IA ocupa a área -->
    {:else if view === 'quadros' && engine.ready}
      <Quadro onOpenNote={(p) => { engine.open(p); view = 'notas'; }} />
    {:else if error}
      <p class="err">Não consegui abrir o cofre: {error}</p>
    {:else if !engine.ready}
      <p class="loading">Abrindo o cofre…</p>
    {:else if engine.active}
      <div class="crumb">{engine.active}</div>
      <Editor value={engine.content} docKey={engine.active} onchange={(v) => engine.edit(v)} />
    {:else}
      <p class="loading">Nenhuma nota aberta.</p>
    {/if}
  </main>

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
    <button class="drive" class:on={engine.driveOn} class:warn={!!engine.driveError} onclick={() => (drivePanel = !drivePanel)}>
      {engine.driveOn ? (engine.driveError ? 'Drive: sem conexão' : 'Drive conectado') : 'Conectar Google Drive'}
    </button>
    <span class="sep">·</span> {engine.vault?.deviceId ?? ''}
    <span class="sep">·</span> <span class="loc">{engine.location}</span>
  </footer>

  {#if drivePanel}<DrivePanel onclose={() => (drivePanel = false)} />{/if}
</div>

<style>
  .shell { position: relative; height: 100%; display: grid; overflow: hidden;
    grid-template: "rail side main" 1fr "rail side status" auto / 76px 260px 1fr; }
  .rail, .side, .main, .status { position: relative; }

  .rail { grid-area: rail; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 16px 0;
    border-right: 1px solid var(--line); }
  .rail ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .rail ul button { width: 64px; border: 0; background: none; padding: 8px 0; border-radius: 10px;
    font: 500 10.5px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .rail ul button.on { color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .rail ul button:disabled { opacity: .35; cursor: default; }
  .menu { display: none; border: 0; background: none; font-size: 20px; color: var(--muted); }

  .side { grid-area: side; display: flex; flex-direction: column; min-height: 0; background: var(--surface);
    border-right: 1px solid var(--line); }
  .side header { display: flex; align-items: center; justify-content: space-between; padding: 18px 16px 10px; }
  .side h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .side h2 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; margin-left: 6px; }
  .new { width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); font-size: 18px; line-height: 1; }
  .new:hover { border-color: var(--ember); color: var(--ember); }
  .side ul { list-style: none; margin: 0; padding: 0 8px 16px; overflow-y: auto; }
  .side li button { width: 100%; text-align: left; border: 0; background: none; border-radius: 9px; padding: 7px 10px;
    display: grid; gap: 1px; border-left: 2px solid transparent; }
  .side li button:hover { background: var(--surface-2); }
  .side li button.active { background: var(--surface-2); border-left-color: var(--ember); }
  .side b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side small { color: var(--muted); font: 11px var(--f-mono); }

  .main { grid-area: main; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .crumb { padding: 14px 24px 0; font: 11px var(--f-mono); color: var(--muted); max-width: 808px; width: 100%; margin: 0 auto; }
  .main :global(.editor) { flex: 1; }
  .update { display: flex; align-items: center; gap: 12px; justify-content: space-between; margin: 12px 24px 0;
    padding: 10px 14px; border: 1px solid var(--ember); border-radius: 12px; background: color-mix(in srgb, var(--ember) 8%, var(--surface));
    box-shadow: 0 0 24px -12px var(--ember); }
  .update b { color: var(--ember-soft); }
  .update button { border: 0; border-radius: 9px; padding: 6px 12px; background: var(--ember); color: #160b03; font-weight: 600; }
  .ai-host { flex: 1; min-height: 0; }
  .ai-host.hidden { display: none; }
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
  .dot.busy { background: var(--ember); }

  @media (max-width: 720px) {
    .shell { grid-template: "rail" auto "main" 1fr "status" auto / 1fr; }
    .rail { flex-direction: row; padding: 10px 16px; padding-top: max(10px, env(safe-area-inset-top)); border-right: 0; border-bottom: 1px solid var(--line); }
    .rail ul { display: flex; margin-left: auto; }
    .rail ul button { width: auto; padding: 8px 8px; }
    .menu { display: block; }
    .side { position: absolute; z-index: 5; top: 0; bottom: 0; left: 0; width: min(300px, 85vw);
      transform: translateX(-100%); transition: transform .28s cubic-bezier(.2, .8, .2, 1); box-shadow: 0 0 40px #000; }
    .side.open { transform: none; }
    .status { padding-bottom: max(6px, env(safe-area-inset-bottom)); }
  }
</style>
