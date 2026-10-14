<script lang="ts">
  import { parseRect } from '@tanden/core';
  import type { SheetCtl } from './ctl.svelte';

  // Caixa de nome + campo da fórmula, com autocompletar e ajuda da função.
  let { ctl, version }: { ctl: SheetCtl; version: number } = $props();
  let input = $state<HTMLInputElement>();
  let nameText = $state('');
  let naming = $state(false);

  const value = $derived.by(() => { void version; return ctl.edit ? ctl.edit.text : ctl.rawAtFocus; });
  const sug = $derived(ctl.suggestions);
  const help = $derived(ctl.callHelp);

  // devolve o foco depois de aceitar uma sugestão, se a edição está aqui
  $effect(() => {
    void ctl.focusTick;
    if (input && document.activeElement === input) input.setSelectionRange(ctl.caret, ctl.caret);
  });

  function goTo(e: SubmitEvent) {
    e.preventDefault();
    const r = parseRect(nameText.trim().toUpperCase());
    if (r) ctl.selectRect(r);
    naming = false;
    (document.querySelector('.grid') as HTMLElement | null)?.focus();
  }

  /** foco e seleção assim que o campo aparece */
  function grab(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  const args = (sig: string) => sig.split(/;\s*/).filter(Boolean);
</script>

<div class="fbar">
  {#if naming}
    <form onsubmit={goTo}>
      <input class="name" bind:value={nameText} onblur={() => (naming = false)} use:grab aria-label="Ir para célula" />
    </form>
  {:else}
    <button class="name" onclick={() => { nameText = ctl.name; naming = true; }} title="Ir para…">{ctl.name}</button>
  {/if}
  <span class="fx">fx</span>
  <div class="field">
    <input bind:this={input} {value} spellcheck="false" autocomplete="off" aria-label="Conteúdo da célula"
      placeholder="Digite um valor ou =fórmula (=SOMA, =PROCV, =SE…)"
      onfocus={() => { if (!ctl.edit) ctl.begin(undefined, 'edit'); }}
      oninput={(e) => ctl.setText(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
      onkeyup={(e) => (ctl.caret = e.currentTarget.selectionStart ?? 0)}
      onclick={(e) => (ctl.caret = e.currentTarget.selectionStart ?? 0)}
      onkeydown={(e) => { ctl.onEditKey(e); if (!ctl.edit) input?.blur(); }} />

    {#if ctl.edit && (sug.length || help)}
      <div class="pop" role="listbox">
        {#if sug.length}
          {#each sug as f, i (f.name)}
            <button class="opt" class:on={i === ctl.pick} role="option" aria-selected={i === ctl.pick}
              onpointerdown={(e) => { e.preventDefault(); ctl.accept(f); input?.focus(); }}>
              <b>{f.pt}</b><span class="sig">({f.sig})</span>
              <small>{f.desc}{f.name !== f.pt ? ` · Excel: ${f.name}` : ''}</small>
            </button>
          {/each}
          <div class="tip">Tab ou Enter para escolher</div>
        {:else if help}
          <div class="help">
            <b>{help.fn.pt}</b>(<!--
            -->{#each args(help.fn.sig) as a, i}<span class:cur={i === Math.min(help.arg, args(help.fn.sig).length - 1)}>{a}</span>{#if i < args(help.fn.sig).length - 1}; {/if}{/each})
            <small>{help.fn.desc}</small>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .fbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .name { width: 92px; flex: none; border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 5px 8px;
    font: 12px var(--f-mono); color: var(--ink); text-align: left; }
  .fx { font: italic 600 13px var(--f-display); color: var(--ember); }
  .field { position: relative; flex: 1; min-width: 0; }
  .field input { width: 100%; border: 1px solid var(--line); background: var(--void); border-radius: 8px; padding: 6px 10px;
    color: var(--ink); font: 13px var(--f-mono); outline: none; }
  .field input:focus { border-color: var(--ember); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ember) 15%, transparent); }
  .pop { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; width: min(520px, 100%); background: var(--surface);
    border: 1px solid var(--line); border-radius: 12px; padding: 6px; box-shadow: 0 20px 40px -16px var(--shadow), 0 0 0 1px var(--ember-glow);
    animation: rise .14s cubic-bezier(.2, .8, .2, 1); }
  @keyframes rise { from { opacity: 0; transform: translateY(-4px); } }
  .opt { display: grid; grid-template-columns: auto 1fr; gap: 2px 6px; width: 100%; text-align: left; border: 0; background: none;
    border-radius: 8px; padding: 6px 8px; }
  .opt.on { background: color-mix(in srgb, var(--ember) 12%, transparent); }
  .opt b { font: 600 12.5px var(--f-mono); color: var(--ember-soft); }
  .sig { font: 11.5px var(--f-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opt small, .help small { grid-column: 1 / -1; color: var(--muted); font-size: 12px; }
  .tip { padding: 4px 8px 2px; font: 10.5px var(--f-mono); color: var(--muted); opacity: .7; }
  .help { padding: 6px 8px; font: 12.5px var(--f-mono); color: var(--muted); display: grid; gap: 4px; }
  .help b { color: var(--ember-soft); }
  .help .cur { color: var(--ink); background: color-mix(in srgb, var(--ember) 18%, transparent); border-radius: 4px; padding: 0 2px; }
  @media (max-width: 720px) { .name { width: 64px; } .fx { display: none; } }
</style>
