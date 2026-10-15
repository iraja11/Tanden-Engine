<script lang="ts">
  import './bases.css';
  import { DB_TEMPLATES, templatePreview } from '@tanden/core';
  import BaseView from './BaseView.svelte';
  import { bases } from './bases.svelte';
  import { pop } from '../motion';

  // Tela "Bancos": todos os bancos do cofre, a galeria para criar um novo e os modelos de página.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  let selected = $state<string | null>(null);
  let creating = $state(false);
  let tab = $state<'bancos' | 'modelos'>('bancos');
  let name = $state('');
  let tpl = $state('tarefas');
  let folder = $state('Bancos');

  $effect(() => { const g = bases.goto; if (g) { selected = g.path; tab = 'bancos'; } });
  const current = $derived(bases.databases.find((d) => d.path === selected) ?? bases.databases[0] ?? null);

  function create() {
    const path = bases.createDatabase(name.trim() || DB_TEMPLATES.find((t) => t.id === tpl)!.name, tpl, folder.trim().replace(/^\/|\/$/g, ''));
    selected = path;
    creating = false;
    name = '';
  }
  const pageTemplates = $derived(bases.templates.filter((t) => !t.target));
  const rowTemplates = $derived(bases.templates.filter((t) => t.target));
</script>

<div class="dbs">
  <nav class="list">
    <header>
      <h2>Bancos <span>{bases.databases.length}</span></h2>
      <button class="add" title="Novo banco" aria-label="Novo banco" onclick={() => (creating = true)}>+</button>
    </header>
    <ul>
      {#each bases.databases as db (db.path)}
        <li><button class:on={tab === 'bancos' && current?.path === db.path} onclick={() => { selected = db.path; tab = 'bancos'; }}>
          <span class="ic">▤</span><b>{db.name}</b>{#if db.path.includes('/')}<small>{db.path.slice(0, db.path.lastIndexOf('/'))}</small>{/if}
        </button></li>
      {/each}
    </ul>
    <button class="tpl" class:on={tab === 'modelos'} onclick={() => (tab = 'modelos')}><span class="ic">❐</span>Modelos <small>{bases.templates.length}</small></button>
  </nav>

  <section class="main">
    {#if tab === 'modelos'}
      <div class="page">
        <h1>Modelos</h1>
        <p class="sub">Notas em <code>Modelos/</code>, a mesma pasta do plugin Templates do Obsidian. Use <code>{'{{title}}'}</code>, <code>{'{{date}}'}</code>, <code>{'{{time}}'}</code> e <code>{'{{date:DD/MM/YYYY}}'}</code>. Na barra de notas, o menu do <b>+</b> cria páginas com eles.</p>
        <h3>Páginas</h3>
        <div class="tgrid">
          {#each pageTemplates as t (t.path ?? t.name)}
            <article class="tcard">
              <b>{t.name}</b>
              <pre>{templatePreview(t.text)}</pre>
              <div class="db-row">
                <button class="db-btn line" onclick={() => onOpenNote(bases.newPage(null, t, t.name === 'Nota diária' ? new Date().toLocaleDateString('pt-BR').replace(/\//g, '-') : 'Sem título'))}>Usar</button>
                <button class="db-btn" onclick={() => (bases.peek = bases.saveTemplate(t))}>Editar</button>
                {#if !t.path}<span class="db-muted small">embutido</span>{/if}
              </div>
            </article>
          {/each}
          <button class="tcard new" onclick={() => (bases.peek = bases.newPage('Modelos.md', null, 'Novo modelo'))}>+ Novo modelo</button>
        </div>
        {#if rowTemplates.length}
          <h3>Linhas de bancos</h3>
          <div class="tgrid">
            {#each rowTemplates as t (t.path)}
              <article class="tcard">
                <b>{t.name}</b><small class="db-muted">para {t.target}</small>
                <pre>{templatePreview(t.text)}</pre>
                <div class="db-row"><button class="db-btn" onclick={() => (bases.peek = t.path)}>Editar</button></div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {:else if current}
      {#key current.path}
        <div class="page">
          <div class="titlebar">
            <h1>{current.name}</h1>
            <div class="db-row">
              <button class="db-btn" onclick={() => onOpenNote(current.path)} title="Abrir a nota do banco no editor">Abrir nota</button>
            </div>
          </div>
          {#each Array.from({ length: current.blocks }, (_, i) => i) as i (i)}
            <BaseView notePath={current.path} index={i} {onOpenNote} />
          {/each}
        </div>
      {/key}
    {:else}
      <div class="empty">
        <h1>Bancos de dados</h1>
        <p>Tabelas, quadros, calendários e galerias feitos das suas notas. Cada linha é uma nota <code>.md</code> e cada coluna, uma propriedade no topo dela: o Obsidian abre tudo igual (Bases).</p>
        <button class="db-btn primary big" onclick={() => (creating = true)}>Criar o primeiro banco</button>
      </div>
    {/if}
  </section>
</div>

{#if creating}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="scrim" onclick={() => (creating = false)}>
    <div class="dialog" role="dialog" aria-label="Novo banco" tabindex="-1" onclick={(e) => e.stopPropagation()} transition:pop>
      <h2>Novo banco de dados</h2>
      <div class="gal">
        {#each DB_TEMPLATES as t (t.id)}
          <button class="opt" class:on={tpl === t.id} onclick={() => (tpl = t.id)}>
            <span class="big-ic">{t.icon}</span><b>{t.name}</b><small>{t.description}</small>
            <span class="views">{t.views.map((v) => v.name).join(' · ')}</span>
          </button>
        {/each}
      </div>
      <div class="fields">
        <label>Nome<input class="db-input" bind:value={name} placeholder={DB_TEMPLATES.find((t) => t.id === tpl)?.name} onkeydown={(e) => { if (e.key === 'Enter') create(); }} /></label>
        <label>Pasta<input class="db-input" bind:value={folder} placeholder="raiz do cofre" /></label>
      </div>
      <p class="db-hint">Cria <code>{folder ? `${folder}/` : ''}{name.trim() || DB_TEMPLATES.find((t) => t.id === tpl)?.name}.md</code> com o banco e as linhas em <code>{folder ? `${folder}/` : ''}{name.trim() || DB_TEMPLATES.find((t) => t.id === tpl)?.name}/</code>.</p>
      <div class="db-row end">
        <button class="db-btn" onclick={() => (creating = false)}>Cancelar</button>
        <button class="db-btn primary" onclick={create}>Criar banco</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dbs { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); }
  .list { border-right: 1px solid var(--line); padding: 14px 8px; display: flex; flex-direction: column; min-height: 0; }
  .list header { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 10px; }
  h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  h2 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; margin-left: 6px; }
  .add { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); transition: transform var(--dur) var(--spring); }
  .add:hover { border-color: var(--ember); color: var(--ember); transform: rotate(90deg); }
  ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
  li button, .tpl { width: 100%; display: grid; grid-template-columns: 18px 1fr; column-gap: 8px; align-items: center; text-align: left; border: 0; background: none;
    padding: 7px 10px; border-radius: 9px; border-left: 2px solid transparent; }
  li button:hover, .tpl:hover { background: var(--surface-2); }
  li button.on, .tpl.on { background: var(--surface-2); border-left-color: var(--ember); }
  .ic { color: var(--muted); font-size: 12px; grid-row: span 2; }
  li b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li small, .tpl small { color: var(--muted); font: 11px var(--f-mono); }
  .tpl { grid-template-columns: 18px 1fr auto; margin-top: 8px; border-top: 1px solid var(--line); border-radius: 0 0 9px 9px; padding-top: 10px; }
  .main { overflow: auto; min-width: 0; }
  .page { padding: 22px 28px 40px; min-width: 0; }
  .titlebar { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
  h1 { margin: 0; font: 600 28px/1.15 var(--f-display); letter-spacing: .01em; }
  h3 { margin: 22px 0 10px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .sub { color: var(--muted); max-width: 720px; margin: 6px 0 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .small { font-size: 11px; }
  .empty { max-width: 560px; margin: 10vh auto 0; text-align: center; padding: 0 20px; }
  .empty p { color: var(--muted); margin: 12px 0 22px; }
  .big { padding: 9px 18px; font-size: 14px; }
  .tgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .tcard { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 12px 14px; display: grid; gap: 6px; align-content: start; }
  .tcard b { font: 600 15px var(--f-display); }
  .tcard pre { margin: 0; font: 11px/1.5 var(--f-mono); color: var(--muted); white-space: pre-wrap; max-height: 110px; overflow: hidden; }
  .tcard.new { place-items: center; min-height: 140px; border-style: dashed; background: none; color: var(--muted); }
  .tcard.new:hover { color: var(--ember); border-color: var(--ember); }
  .scrim { position: fixed; inset: 0; z-index: 80; background: var(--scrim); display: grid; place-items: center; padding: 16px; animation: fade .2s; }
  .dialog { width: min(820px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px 22px;
    box-shadow: 0 30px 80px -30px #000; display: grid; gap: 14px; }
  .dialog h2 { font-size: 13px; color: var(--ink); }
  .gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
  .opt { display: grid; gap: 4px; align-content: start; text-align: left; border: 1px solid var(--line); border-radius: 12px; background: var(--void); padding: 12px;
    transition: border-color var(--dur), transform var(--dur) var(--spring); }
  .opt:hover { border-color: var(--muted); transform: translateY(-1px); }
  .opt.on { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember), 0 0 24px -12px var(--ember-glow); }
  .big-ic { font-size: 20px; color: var(--ember); }
  .opt b { font: 600 14px var(--f-display); }
  .opt small { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .views { font: 10.5px var(--f-mono); color: var(--muted); opacity: .8; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fields label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .end { justify-content: flex-end; }
  @keyframes fade { from { opacity: 0; } }
  @media (max-width: 720px) {
    .dbs { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    .list { border-right: 0; border-bottom: 1px solid var(--line); max-height: 30vh; }
    .page { padding: 16px 14px 30px; }
    .fields { grid-template-columns: 1fr; }
  }
</style>
