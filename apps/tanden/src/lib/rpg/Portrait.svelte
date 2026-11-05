<script lang="ts">
  import { files } from '../files/files.svelte';

  // Retrato de personagem, criatura ou item: a imagem da propriedade `imagem`
  // (arquivo do cofre ou endereço), ou as iniciais num medalhão.
  let { target, name, size = 72, square = false, onpick }: {
    target: string | null;
    name: string;
    size?: number;
    /** a imagem ocupa o quadro todo (cartas) em vez do medalhão redondo */
    square?: boolean;
    /** com isto, clicar escolhe uma imagem do aparelho */
    onpick?: (path: string) => void;
  } = $props();

  let url = $state<string | null>(null);
  let broken = $state(false);
  $effect(() => {
    const t = target;
    url = null;
    broken = false;
    if (!t) return;
    let alive = true;
    void files.imageUrl(t).then((u) => { if (alive) url = u; });
    return () => { alive = false; };
  });

  const initials = $derived(name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join(''));

  function pick() {
    if (!onpick) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (f) onpick!(await files.attachFile(f));
    };
    input.click();
  }
</script>

{#if onpick}
  <button class="portrait" class:square style:--p="{size}px" onclick={pick} title={target ? 'Trocar a imagem' : 'Escolher uma imagem'} aria-label="Imagem">
    {#if url && !broken}<img src={url} alt={name} onerror={() => (broken = true)} />{:else}<span>{initials || '?'}</span>{/if}
    <i class="edit" aria-hidden="true">✎</i>
  </button>
{:else}
  <span class="portrait" class:square style:--p="{size}px">
    {#if url && !broken}<img src={url} alt={name} onerror={() => (broken = true)} />{:else}<span>{initials || '?'}</span>{/if}
  </span>
{/if}

<style>
  .portrait { position: relative; display: grid; place-items: center; width: var(--p); height: var(--p); flex: none; padding: 0; overflow: hidden;
    border-radius: 50%; border: 2px solid color-mix(in srgb, var(--ember) 55%, var(--line)); color: var(--ember-soft);
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--ember) 22%, var(--surface-2)), var(--void));
    box-shadow: 0 0 0 3px var(--surface), 0 0 0 4px color-mix(in srgb, var(--ember) 25%, transparent), 0 8px 20px -10px var(--shadow, #000); }
  .portrait.square { border-radius: 0; border: 0; box-shadow: none; }
  img { width: 100%; height: 100%; object-fit: cover; }
  span > span, .portrait > span { font: 700 calc(var(--p) * .36)/1 var(--f-display); letter-spacing: .02em; }
  .edit { position: absolute; inset: auto 0 0; padding: 2px 0 4px; font-style: normal; font-size: 12px; text-align: center; color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, .65)); opacity: 0; transition: opacity var(--dur); }
  button.portrait:hover .edit, button.portrait:focus-visible .edit { opacity: 1; }
  @media (hover: none) { .edit { opacity: .8; } }
</style>
