<script lang="ts">
  import { KIND_PT } from '@tanden/core';
  import Icon from '../../ui/Icon.svelte';
  import { compendio } from '../compendio.svelte';
  import CompEntry from './CompEntry.svelte';
  import '../mesa.css';

  // Leitor de regras por cima da tela: abre ao clicar num link de magia,
  // condição, item ou talento em qualquer ficha. Os links de dentro empilham.
  const top = $derived(compendio.stack[compendio.stack.length - 1] ?? null);
  const found = $derived(top && compendio.comp ? compendio.comp.ref(top.ref, top.ed) : null);
  const label = $derived(top ? (top.ref.split('|')[1] ?? '') : '');

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape' && compendio.stack.length) {
      e.stopPropagation();
      compendio.close();
    }
  }
</script>

<svelte:window onkeydown={onkey} />

{#if top}
  <div class="rpg drawer-wrap">
    <div class="scrim-lite" role="presentation" onclick={() => compendio.close()}></div>
    <aside class="drawer" aria-label="Regras">
      <header class="bar">
        {#if compendio.stack.length > 1}
          <button class="icon" onclick={() => compendio.back()} aria-label="Voltar"><Icon name="voltar" /></button>
        {/if}
        <span class="kind">{found ? KIND_PT[found.kind] : 'Regras'}</span>
        <button class="icon" onclick={() => compendio.close()} aria-label="Fechar"><Icon name="fechar" /></button>
      </header>
      <div class="body">
        {#if compendio.status === 'loading' || compendio.status === 'idle'}
          <p class="dim">Abrindo o compêndio…</p>
        {:else if compendio.status === 'missing'}
          <p class="dim">O compêndio de D&amp;D 5e ainda não foi gerado. Rode <code>node scripts/compendio-5e.mjs</code> na pasta do Tanden (precisa da cópia do 5etools ao lado).</p>
        {:else if found}
          {#key top.ref}<CompEntry kind={found.kind} item={found.item} ed={top.ed} />{/key}
        {:else}
          <p class="dim">“{label}” não está no compêndio.</p>
        {/if}
      </div>
    </aside>
  </div>
{/if}

<style>
  .drawer-wrap { position: fixed; inset: 0; z-index: 70; pointer-events: none; }
  .scrim-lite { position: absolute; inset: 0; background: color-mix(in srgb, var(--scrim) 50%, transparent); pointer-events: auto; }
  .drawer { position: absolute; top: 0; right: 0; bottom: 0; width: min(460px, 100%); background: var(--surface); border-left: 1px solid var(--line);
    box-shadow: -20px 0 60px -20px var(--shadow); display: flex; flex-direction: column; pointer-events: auto; animation: slide .18s var(--ease); }
  @keyframes slide { from { transform: translateX(24px); opacity: 0; } }
  .bar { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .kind { flex: 1; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .body { flex: 1; overflow-y: auto; padding: 16px 18px 28px; }
</style>
