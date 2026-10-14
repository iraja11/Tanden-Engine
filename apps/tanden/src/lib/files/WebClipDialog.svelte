<script lang="ts">
  import { engine } from '../engine.svelte';
  import { files } from './files.svelte';

  let { onclose, attachTo = null }: { onclose: () => void; attachTo?: string | null } = $props();

  let url = $state('');
  let mode = $state<'note' | 'card'>('note');
  let attach = $state(true);
  let working = $state(false);
  const noteName = $derived(attachTo?.split('/').pop()?.replace(/\.md$/, '') ?? '');

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!url.trim() || working) return;
    working = true;
    const done = await files.clip(url, mode, attachTo && attach ? attachTo : null);
    working = false;
    if (done !== null || mode === 'card') onclose();
  }

  function grab(el: HTMLInputElement) {
    queueMicrotask(() => el.focus());
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
        <span>O texto do artigo e as imagens ficam no cofre: dá para ler offline, buscar, anotar e mandar para a IA.</span>
      </label>
      <label class:on={mode === 'card'}>
        <input type="radio" bind:group={mode} value="card" />
        <b>Só o link</b>
        <span>Um cartão com título, resumo e site, como um favorito.</span>
      </label>
    </div>
    {#if attachTo}
      <label class="attach"><input type="checkbox" bind:checked={attach} /> Colocar na nota <b>{noteName}</b></label>
    {/if}
    {#if working}<p class="busy"><i></i>{files.busy || 'Baixando…'}</p>{/if}
    <footer>
      <button type="button" onclick={onclose} disabled={working}>Cancelar</button>
      <button class="pri" disabled={!url.trim() || working || (mode === 'card' && !(attachTo && attach))}
        title={mode === 'card' && !(attachTo && attach) ? 'Abra uma nota para colocar o cartão' : ''}>
        {mode === 'note' ? 'Salvar página' : 'Adicionar cartão'}
      </button>
    </footer>
    {#if !engine.ready}<p class="busy">Abrindo o cofre…</p>{/if}
  </form>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px;
    background: color-mix(in srgb, var(--void) 70%, transparent); backdrop-filter: blur(3px); animation: fade .16s; }
  .dialog { width: min(520px, 100%); display: grid; gap: 12px; padding: 18px; border-radius: 16px; background: var(--surface);
    border: 1px solid var(--line); box-shadow: 0 30px 60px -20px #000, 0 0 0 1px var(--ember-glow); animation: rise .2s cubic-bezier(.2, .8, .2, 1); }
  h2 { margin: 0; font: 600 13px var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .url { width: 100%; border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 10px; padding: 10px 12px; font: 14px var(--f-mono); }
  .url:focus { outline: none; border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  .modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .modes label { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; background: var(--void); }
  .modes label.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 7%, var(--void)); }
  .modes input { position: absolute; opacity: 0; pointer-events: none; }
  .modes b { font-weight: 600; }
  .modes span { color: var(--muted); font-size: 12.5px; }
  .attach { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--silver); }
  .attach input { accent-color: var(--ember); }
  .busy { margin: 0; display: flex; gap: 8px; align-items: center; color: var(--ember-soft); font-size: 12.5px; }
  .busy i { width: 8px; height: 8px; border-radius: 50%; background: var(--ember); animation: pulse 1s ease-in-out infinite; }
  footer { display: flex; justify-content: flex-end; gap: 8px; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 9px; padding: 7px 14px; color: var(--ink); }
  button:disabled { opacity: .5; }
  .pri { background: var(--ember); border-color: var(--ember); color: #160b03; font-weight: 600; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  @keyframes pulse { 50% { opacity: .3; transform: scale(.7); } }
  @media (max-width: 520px) { .modes { grid-template-columns: 1fr; } }
</style>
