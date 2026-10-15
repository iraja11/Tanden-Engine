<script lang="ts">
  import { hashHex, type Book } from '@tanden/core';
  import { onMount } from 'svelte';
  import { biblioteca } from './biblioteca.svelte';

  /** Capa do livro: a primeira página do PDF ou, enquanto não há, uma capa gerada. */
  let { book, broken = false }: { book: Book; broken?: boolean } = $props();

  let el = $state<HTMLDivElement>();
  let seen = $state(false);
  const url = $derived(biblioteca.covers[book.path]);
  const title = $derived(biblioteca.title(book));
  const author = $derived(biblioteca.author(book));
  const hue = $derived(parseInt(hashHex(title).slice(0, 4), 16) % 360);

  onMount(() => {
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        seen = true;
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(el!);
    return () => io.disconnect();
  });

  // carrega quando aparece e de novo quando a varredura acaba de fazer a capa
  $effect(() => {
    void biblioteca.rev;
    if (seen && !url && biblioteca.hasCover(book.path)) void biblioteca.cover(book.path);
  });
</script>

<div class="cover" bind:this={el} style:--h={hue}>
  {#if url}
    <img src={url} alt="" draggable="false" />
  {:else}
    <div class="gen">
      <b>{title}</b>
      {#if author}<span>{author}</span>{/if}
      <i>{broken ? 'não abriu' : 'PDF'}</i>
    </div>
  {/if}
</div>

<style>
  .cover { position: relative; aspect-ratio: 3 / 4; width: 100%; border-radius: 6px; overflow: hidden; background: var(--surface-2);
    box-shadow: 0 1px 0 var(--line), 0 14px 28px -18px #000; }
  img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; background: #fff; animation: fade .3s; }
  .gen { position: absolute; inset: 0; padding: 14px 12px; display: flex; flex-direction: column; gap: 6px;
    background: linear-gradient(160deg, hsl(var(--h) 38% 30%), hsl(calc(var(--h) + 40) 42% 16%)); color: #fff; }
  .gen::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: rgb(255 255 255 / .12); }
  .gen b { font: 600 14px/1.25 var(--f-display); letter-spacing: .02em; display: -webkit-box; -webkit-line-clamp: 5; line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
  .gen span { font-size: 11.5px; opacity: .8; }
  .gen i { margin-top: auto; font: normal 10px var(--f-mono); letter-spacing: .14em; text-transform: uppercase; opacity: .55; }
  @keyframes fade { from { opacity: 0; } }
</style>
