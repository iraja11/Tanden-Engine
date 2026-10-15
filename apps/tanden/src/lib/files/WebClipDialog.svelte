<script lang="ts">
  import { clipperBookmarklet, normalizeUrl } from '@tanden/core';
  import { invoke } from '@tauri-apps/api/core';
  import { engine } from '../engine.svelte';
  import { desktop } from '../platform';
  import { files } from './files.svelte';

  let { onclose, attachTo = null }: { onclose: () => void; attachTo?: string | null } = $props();

  let url = $state('');
  let mode = $state<'note' | 'card'>('note');
  let attach = $state(true);
  let working = $state(false);
  let tags = $state('');
  let comment = $state('');
  let highlights = $state('');
  let more = $state(false);
  let again = $state(false);
  let browser = $state(false);
  let clipper = $state<{ port: number; token: string; running: boolean } | null>(null);
  let copied = $state(false);
  const noteName = $derived(attachTo?.split('/').pop()?.replace(/\.md$/, '') ?? '');
  /** a página já está no cofre? */
  const known = $derived(mode === 'note' && normalizeUrl(url) ? files.clipped(url) : null);
  const bookmarklet = $derived(clipper ? clipperBookmarklet(clipper.port, clipper.token) : '');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!url.trim() || working) return;
    working = true;
    const done = await files.clip(url, mode, attachTo && attach ? attachTo : null, {
      tags: tags.split(/[,\s]+/).filter(Boolean),
      comment,
      // um destaque por parágrafo (linha em branco separa)
      highlights: highlights.split(/\n\s*\n/).map((h) => h.trim()).filter(Boolean),
      again,
    });
    working = false;
    if (done !== null || mode === 'card') onclose();
  }

  async function openBrowser() {
    browser = !browser;
    if (browser && !clipper && desktop) clipper = await invoke<{ port: number; token: string; running: boolean }>('clipper_info').catch(() => null);
  }

  async function copy() {
    await navigator.clipboard?.writeText(bookmarklet);
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }

  function grab(el: HTMLInputElement) {
    queueMicrotask(() => el.focus());
    // endereço copiado vem preenchido (no app do computador, sem pedir permissão)
    if (desktop) void navigator.clipboard?.readText?.().then((t) => { if (!url && normalizeUrl(t) && /^https?:\/\//i.test(t.trim())) url = t.trim(); }).catch(() => {});
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !working) onclose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={(e) => { if (e.target === e.currentTarget && !working) onclose(); }}>
  <form class="dialog" onsubmit={submit} aria-label="Página web">
    <h2>Página web</h2>
    <input class="url" bind:value={url} placeholder="https://…" inputmode="url" autocomplete="off" spellcheck="false" use:grab aria-label="Endereço" disabled={working} />
    <div class="modes" role="radiogroup">
      <label class:on={mode === 'note'}>
        <input type="radio" bind:group={mode} value="note" />
        <b>Salvar como nota</b>
        <span>O texto do artigo e as imagens ficam no cofre: dá para ler offline, buscar, destacar e mandar para a IA.</span>
      </label>
      <label class:on={mode === 'card'}>
        <input type="radio" bind:group={mode} value="card" />
        <b>Só o link</b>
        <span>Um cartão com título, resumo e site, como um favorito.</span>
      </label>
    </div>
    {#if known}
      <p class="known">
        Já está no cofre em <button type="button" class="link" onclick={() => { files.openPath(known); onclose(); }}>{known.replace(/\.md$/, '')}</button>.
        {again ? 'Vai salvar uma cópia nova.' : 'Os destaques e a nota abaixo entram nela.'}
        <label><input type="checkbox" bind:checked={again} /> Salvar de novo</label>
      </p>
    {/if}
    {#if mode === 'note'}
      {#if more}
        <div class="more">
          <label>Tags <input bind:value={tags} placeholder="estudo, fgc" autocomplete="off" disabled={working} /></label>
          <label>Sua nota <textarea bind:value={comment} rows="2" placeholder="Por que salvou, o que fazer com isso…" disabled={working}></textarea></label>
          <label>Destaques <textarea bind:value={highlights} rows="3" placeholder="Cole trechos da página. Uma linha em branco separa um destaque do outro." disabled={working}></textarea></label>
        </div>
      {:else}
        <button type="button" class="link small" onclick={() => (more = true)}>+ Tags, sua nota e destaques</button>
      {/if}
    {/if}
    {#if attachTo}
      <label class="attach"><input type="checkbox" bind:checked={attach} /> Colocar na nota <b>{noteName}</b></label>
    {/if}
    {#if working}<p class="busy"><i></i>{files.busy || 'Baixando…'}</p>{/if}
    <footer>
      {#if desktop}<button type="button" class="link small" onclick={openBrowser}>✂ Recortar direto do navegador</button>{/if}
      <span class="grow"></span>
      <button type="button" onclick={onclose} disabled={working}>Cancelar</button>
      <button class="pri" disabled={!url.trim() || working || (mode === 'card' && !(attachTo && attach))}
        title={mode === 'card' && !(attachTo && attach) ? 'Abra uma nota para colocar o cartão' : ''}>
        {mode === 'card' ? 'Adicionar cartão' : known && !again ? 'Atualizar nota' : 'Salvar página'}
      </button>
    </footer>
    {#if browser}
      <div class="browser">
        {#if clipper && !clipper.running}
          <p class="warn">O recortador não conseguiu abrir a porta {clipper.port} (outro programa está nela). Reinicie o Tanden.</p>
        {:else if clipper}
          <p>Arraste o botão para a barra de favoritos do navegador (Chrome, Firefox, Edge). Numa página, clique nele: ela vem para <b>Web/</b> como está na tela, até as que pedem login.
            Com um trecho selecionado, ele vira <b>destaque</b>; clique de novo com outro trecho para juntar mais destaques na mesma nota.</p>
          <div class="bm">
            <!-- svelte-ignore a11y_invalid_attribute -->
            <a href={bookmarklet} draggable="true" onclick={(e) => e.preventDefault()} title="Arraste para a barra de favoritos">✂ Tanden</a>
            <button type="button" onclick={copy}>{copied ? 'Copiado ✓' : 'Copiar código'}</button>
          </div>
          <p class="hint">Se arrastar não funcionar: crie um favorito qualquer, edite e cole o código no lugar do endereço. O Tanden precisa estar aberto (pode estar na bandeja).</p>
        {:else}
          <p class="warn">O recortador só funciona no app do computador.</p>
        {/if}
      </div>
    {/if}
    {#if !engine.ready}<p class="busy">Abrindo o cofre…</p>{/if}
  </form>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px;
    background: color-mix(in srgb, var(--void) 70%, transparent); backdrop-filter: blur(3px); animation: fade .16s; }
  .dialog { width: min(540px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; display: grid; gap: 12px; padding: 18px; border-radius: 16px; background: var(--surface);
    border: 1px solid var(--line); box-shadow: 0 30px 60px -20px #000, 0 0 0 1px var(--ember-glow); animation: rise .2s cubic-bezier(.2, .8, .2, 1); }
  h2 { margin: 0; font: 600 13px var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .url, .more input, .more textarea { width: 100%; border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 10px; padding: 10px 12px; font: 14px var(--f-mono); box-sizing: border-box; }
  .more input, .more textarea { font: 13px var(--f-body); padding: 8px 10px; resize: vertical; }
  .url:focus, .more input:focus, .more textarea:focus { outline: none; border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .modes label { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; background: var(--void); }
  .modes label.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 7%, var(--void)); }
  .modes input { position: absolute; opacity: 0; pointer-events: none; }
  .modes b { font-weight: 600; }
  .modes span { color: var(--muted); font-size: 12.5px; }
  .more { display: grid; gap: 8px; }
  .more label { display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
  .known { margin: 0; padding: 8px 10px; border-radius: 10px; font-size: 12.5px; color: var(--silver); background: color-mix(in srgb, var(--ember) 8%, var(--void)); border: 1px solid color-mix(in srgb, var(--ember) 35%, var(--line)); }
  .known label { display: inline-flex; gap: 4px; align-items: center; margin-left: 6px; }
  .attach { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--silver); }
  input[type='checkbox'] { accent-color: var(--ember); }
  .busy { margin: 0; display: flex; gap: 8px; align-items: center; color: var(--ember-soft); font-size: 12.5px; }
  .busy i { width: 8px; height: 8px; border-radius: 50%; background: var(--ember); animation: pulse 1s ease-in-out infinite; }
  footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .grow { flex: 1; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 9px; padding: 7px 14px; color: var(--ink); }
  button:disabled { opacity: .5; }
  .pri { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); text-decoration: underline dotted; font: inherit; }
  .link.small { font-size: 12.5px; justify-self: start; }
  .browser { display: grid; gap: 8px; padding: 12px; border-radius: 12px; background: var(--void); border: 1px dashed var(--line); font-size: 12.5px; color: var(--silver); }
  .browser p { margin: 0; }
  .bm { display: flex; gap: 8px; align-items: center; }
  .bm a { padding: 7px 14px; border-radius: 9px; background: var(--ember); color: var(--on-ember); font-weight: 700; text-decoration: none; cursor: grab; box-shadow: 0 0 18px -6px var(--ember-glow); }
  .hint { color: var(--muted); }
  .warn { color: var(--crit); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  @keyframes pulse { 50% { opacity: .3; transform: scale(.7); } }
  @media (max-width: 520px) { .modes { grid-template-columns: 1fr; } }
</style>
