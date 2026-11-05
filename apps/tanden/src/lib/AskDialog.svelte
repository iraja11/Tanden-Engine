<script lang="ts">
  import { onMount } from 'svelte';
  import { ask, type AskRequest } from './ask.svelte';
  import { back } from './back';
  import { pop } from './motion';

  /** Diálogo de confirmação ou de texto (ask.confirm / ask.text). */
  let { req }: { req: AskRequest } = $props();

  // o diálogo é recriado a cada pergunta ({#key} no App): ler o valor inicial uma vez é o certo
  // svelte-ignore state_referenced_locally
  let value = $state(req.value ?? '');
  let input = $state<HTMLInputElement>();
  let okBtn = $state<HTMLButtonElement>();
  const asking = $derived(req.value !== undefined);

  onMount(() => {
    setTimeout(() => {
      if (input) {
        input.focus();
        input.select();
      } else okBtn?.focus();
    }, 30);
    return back.layer(() => ask.cancel());
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    ask.answer(asking ? value : true);
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ask.cancel(); } }} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim ask-scrim" onclick={(e) => { if (e.target === e.currentTarget) ask.cancel(); }}>
  <div class="box" role="alertdialog" aria-modal="true" aria-labelledby="ask-title" in:pop>
  <form onsubmit={submit}>
    <h3 id="ask-title">{req.title}</h3>
    {#if req.detail}<p>{req.detail}</p>{/if}
    {#if asking}
      <input bind:this={input} bind:value placeholder={req.placeholder ?? ''} aria-label={req.title} autocomplete="off" />
    {/if}
    <div class="row">
      <button type="button" onclick={() => ask.cancel()}>Cancelar</button>
      <button bind:this={okBtn} type="submit" class="ok" class:danger={req.danger}>{req.ok}</button>
    </div>
  </form>
  </div>
</div>

<style>
  .ask-scrim { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding-left: 16px; padding-right: 16px;
    background: var(--scrim); animation: fade .15s; }
  .box { width: min(400px, 100%); padding: 18px; border-radius: 16px; background: var(--surface);
    border: 1px solid var(--line); box-shadow: 0 30px 70px -30px #000, 0 0 0 1px var(--ember-glow); }
  form { display: grid; gap: 12px; }
  h3 { margin: 0; font: 600 15px/1.35 var(--f-display); letter-spacing: .01em; color: var(--ink); word-break: break-word; }
  p { margin: 0; color: var(--silver); font-size: 13.5px; }
  input { border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 16px; }
  input:focus { outline: none; border-color: var(--ember); }
  .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 10px; padding: 9px 16px; font-size: 13.5px; min-height: 40px; }
  button:hover { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .ok { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }
  .ok.danger { background: var(--crit); border-color: var(--crit); color: #1a0505; }
  @keyframes fade { from { opacity: 0; } }
</style>
