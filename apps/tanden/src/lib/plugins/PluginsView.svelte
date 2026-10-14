<script lang="ts">
  import { describePermission, PLUGIN_API } from '@tanden/core';
  import { plugins, PLUGIN_DIR, type PluginEntry } from './plugins.svelte';
  import { sound } from '../sound.svelte';
  import { rise } from '../motion';

  // Gerenciar plugins: ligar, desligar, aprovar permissões e instalar novos
  // (um arquivo .html ou um artefato do Claude colado).

  let pasting = $state(false);
  let pasted = $state('');
  let error = $state('');
  let fileInput = $state<HTMLInputElement>();

  const statusLabel = { ativo: 'Ativo', desligado: 'Desligado', permissao: 'Pede permissão nova' } as const;

  function toggle(e: PluginEntry) {
    error = '';
    if (plugins.status(e) === 'ativo') {
      plugins.disable(e);
      sound.play('close');
    } else {
      plugins.enable(e, () => sound.play('create'));
    }
  }

  async function installHtml(html: string, name?: string) {
    error = '';
    try {
      const e = await plugins.install(html, name);
      pasting = false;
      pasted = '';
      sound.play('create');
      plugins.enable(e, () => {
        if (e.manifest.tela) plugins.open(e.manifest.id);
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function pickFile(ev: Event) {
    const f = (ev.currentTarget as HTMLInputElement).files?.[0];
    (ev.currentTarget as HTMLInputElement).value = '';
    if (!f) return;
    await installHtml(await f.text(), f.name.replace(/\.html?$/i, ''));
  }

  async function remove(e: PluginEntry) {
    if (!confirm(`Remover "${e.manifest.nome}" deste aparelho?`)) return;
    await plugins.remove(e);
    sound.play('close');
  }

  const icon = (e: PluginEntry) => e.manifest.icone || e.manifest.nome.slice(0, 1).toUpperCase();
</script>

<section class="plg">
  <header>
    <h2>Plugins <span>{plugins.active.length}/{plugins.list.length}</span></h2>
    <p>Cada plugin roda isolado e só faz o que você permitir, em cada aparelho. Artefatos do Claude (páginas HTML) também viram plugins.</p>
    <div class="actions">
      <button class="primary" onclick={() => fileInput?.click()}>Instalar arquivo .html</button>
      <button onclick={() => { pasting = !pasting; error = ''; }} class:on={pasting}>Colar artefato</button>
      <input bind:this={fileInput} type="file" accept=".html,.htm,text/html" hidden onchange={pickFile} />
    </div>
    {#if pasting}
      <div class="paste" in:rise={{ y: -6 }}>
        <textarea bind:value={pasted} placeholder="Cole aqui o HTML do artefato ou do plugin" spellcheck="false"></textarea>
        <button class="primary" disabled={!pasted.trim()} onclick={() => installHtml(pasted)}>Instalar</button>
      </div>
    {/if}
    {#if error}<p class="err">{error}</p>{/if}
  </header>

  <ul>
    {#each plugins.list as e (e.manifest.id)}
      {@const st = plugins.status(e)}
      {@const err = plugins.errors[e.manifest.id]}
      <li class={st} in:rise={{ y: 6 }}>
        <span class="icon" aria-hidden="true">{icon(e)}</span>
        <div class="body">
          <div class="title">
            <b>{e.manifest.nome}</b>
            <small>v{e.manifest.versao}{e.manifest.autor ? ` · ${e.manifest.autor}` : ''} · {e.source === 'embutido' ? 'vem com o app' : e.path}</small>
          </div>
          {#if e.manifest.descricao}<p>{e.manifest.descricao}</p>{/if}
          <div class="perms">
            {#each e.manifest.permissoes as p}
              <span class="perm" class:new={st === 'permissao' && plugins.missing(e).includes(p)}>{describePermission(p)}</span>
            {:else}
              <span class="perm none">Sem permissões: só mostra a própria tela</span>
            {/each}
            {#if e.manifest.fundo}<span class="perm">Roda em segundo plano</span>{/if}
          </div>
          {#if err}<p class="err">{err}</p>{/if}
        </div>
        <div class="side">
          <span class="state">{statusLabel[st]}</span>
          <button class="switch" class:on={st === 'ativo'} role="switch" aria-checked={st === 'ativo'} aria-label="Ligar {e.manifest.nome}" onclick={() => toggle(e)}><i></i></button>
          {#if st === 'ativo' && e.manifest.tela}<button class="link" onclick={() => plugins.open(e.manifest.id)}>Abrir</button>{/if}
          {#if e.source === 'instalado'}<button class="link danger" onclick={() => remove(e)}>Remover</button>{/if}
        </div>
      </li>
    {/each}
  </ul>

  <footer>
    Plugins instalados ficam em <code>{PLUGIN_DIR}/</code> no cofre e chegam aos outros aparelhos pelo sync, desligados até você permitir lá também. API {PLUGIN_API}: veja <code>docs/plugins.md</code> no código.
  </footer>
</section>

{#if plugins.asking}
  {@const a = plugins.asking}
  <div class="scrim" role="presentation" onclick={() => plugins.deny()}></div>
  <div class="ask" role="dialog" aria-modal="true" aria-labelledby="ask-title" in:rise={{ y: 10 }}>
    <span class="icon big" aria-hidden="true">{icon(a.entry)}</span>
    <h3 id="ask-title">{a.entry.manifest.nome} quer:</h3>
    <ul>
      {#each a.missing as p}<li>{describePermission(p)}</li>{/each}
    </ul>
    <p class="note">{a.entry.source === 'embutido' ? 'Plugin que vem com o Tanden.' : `Plugin instalado de ${a.entry.path}. Só permita se confiar em quem fez.`} Vale só para este aparelho e dá para desfazer desligando o plugin.</p>
    <div class="row">
      <button onclick={() => plugins.deny()}>Agora não</button>
      <button class="primary" onclick={() => { plugins.approve(); sound.play('create'); }}>Permitir</button>
    </div>
  </div>
{/if}

<style>
  .plg { height: 100%; overflow-y: auto; max-width: 820px; width: 100%; margin: 0 auto; padding: 18px 24px 32px; }
  header h2 { margin: 0 0 8px; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  header h2 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; margin-left: 6px; }
  header p { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 10px; padding: 7px 12px; font: 500 13px var(--f-body);
    transition: border-color var(--dur), color var(--dur), background var(--dur); }
  button:hover:not(:disabled) { border-color: var(--ember); }
  button.on { color: var(--ember); border-color: var(--ember); }
  button.primary { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }
  button:disabled { opacity: .45; }
  .paste { display: grid; gap: 8px; margin-top: 10px; }
  textarea { min-height: 140px; resize: vertical; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface);
    color: var(--ink); font: 12px/1.45 var(--f-mono); outline: none; }
  textarea:focus { border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  .paste button { justify-self: end; }
  .err { color: var(--crit); font-size: 13px; margin: 8px 0 0; }

  ul { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 8px; }
  li { display: flex; gap: 14px; align-items: flex-start; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line);
    border-left: 2px solid var(--line); transition: border-color var(--dur); }
  li.ativo { border-left-color: var(--ember); }
  li.permissao { border-left-color: var(--crit); }
  .icon { flex: none; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; background: var(--surface-2);
    color: var(--ember); font: 600 17px var(--f-display); box-shadow: inset 0 0 0 1px var(--line); }
  li.ativo .icon { box-shadow: inset 0 0 0 1px var(--ember), 0 0 18px -8px var(--ember-glow); }
  .body { flex: 1; min-width: 0; }
  .title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .title b { font-weight: 600; font-size: 15px; }
  .title small { font: 11px var(--f-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .body p { margin: 4px 0 0; color: var(--silver); font-size: 13px; }
  .perms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .perm { font: 11px var(--f-mono); color: var(--muted); padding: 3px 8px; border-radius: 7px; background: var(--surface-2); }
  .perm.new { color: var(--crit); box-shadow: inset 0 0 0 1px var(--crit); }
  .perm.none { font-style: italic; }
  .side { display: grid; justify-items: end; gap: 8px; flex: none; }
  .state { font: 10.5px var(--f-mono); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  li.ativo .state { color: var(--ember-soft); }
  li.permissao .state { color: var(--crit); }
  .switch { position: relative; width: 40px; height: 22px; padding: 0; border-radius: 11px; background: var(--surface-2); }
  .switch i { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--muted);
    transition: transform var(--dur) var(--spring), background var(--dur); }
  .switch.on { background: color-mix(in srgb, var(--ember) 22%, var(--surface-2)); border-color: var(--ember); }
  .switch.on i { transform: translateX(18px); background: var(--ember); }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); font-size: 12.5px; text-decoration: underline dotted; }
  .link.danger { color: var(--muted); }
  .link.danger:hover { color: var(--crit); }
  footer { margin-top: 18px; color: var(--muted); font-size: 12px; }
  code { font: 11.5px var(--f-mono); color: var(--silver); }

  .scrim { position: fixed; inset: 0; z-index: 80; background: var(--scrim); backdrop-filter: blur(2px); }
  .ask { position: fixed; z-index: 81; left: 50%; top: 50%; translate: -50% -50%; width: min(420px, calc(100vw - 32px)); padding: 22px;
    border-radius: 16px; background: var(--surface); border: 1px solid var(--line); box-shadow: 0 30px 60px -20px var(--shadow), 0 0 0 1px var(--ember-glow); }
  .ask .big { width: 46px; height: 46px; font-size: 21px; margin-bottom: 12px; }
  .ask h3 { margin: 0 0 10px; font: 600 16px var(--f-display); }
  .ask ul { margin: 0 0 12px; gap: 6px; }
  .ask li { padding: 8px 12px; border-radius: 10px; font-size: 13.5px; border-left-color: var(--ember); }
  .ask .note { margin: 0 0 16px; font-size: 12px; color: var(--muted); }
  .row { display: flex; justify-content: flex-end; gap: 8px; }

  @media (max-width: 720px) {
    .plg { padding: 14px 14px 24px; }
    li { flex-wrap: wrap; }
    .side { grid-auto-flow: column; align-items: center; width: 100%; justify-content: end; }
  }
</style>
