<script lang="ts">
  import { onMount } from 'svelte';
  import type { PdfDoc } from './pdfjs';

  /*
   * Miniaturas das páginas no painel lateral. Só desenha as que aparecem
   * (PDFs de 1000 páginas no celular) e solta a memória das que saem.
   */

  let { doc, sizes, current, marked, annotated, onpick }: {
    doc: PdfDoc;
    sizes: Array<{ w: number; h: number }>;
    current: number;
    /** páginas com marcador */
    marked: Set<number>;
    /** páginas com anotação */
    annotated: Set<number>;
    onpick: (page: number) => void;
  } = $props();

  const W = 112;
  let list = $state<HTMLDivElement>();
  let shown = $state<Set<number>>(new Set());
  const urls = new Map<number, string>();
  let drawn = $state<Record<number, string>>({});
  const queue: number[] = [];
  let busy = false;
  let alive = true;

  onMount(() => {
    const io = new IntersectionObserver((entries) => {
      const next = new Set(shown);
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.n);
        if (e.isIntersecting) next.add(n);
        else next.delete(n);
      }
      shown = next;
      for (const n of next) if (!drawn[n] && !queue.includes(n)) queue.push(n);
      void pump();
    }, { root: list, rootMargin: '300px 0px' });
    for (const el of list!.querySelectorAll<HTMLElement>('[data-n]')) io.observe(el);
    // a página atual à vista quando o painel abre
    list!.querySelector<HTMLElement>(`[data-n="${current}"]`)?.scrollIntoView({ block: 'center' });
    return () => {
      alive = false;
      io.disconnect();
      for (const u of urls.values()) URL.revokeObjectURL(u);
    };
  });

  // segue a página que está sendo lida
  $effect(() => {
    const n = current;
    const el = list?.querySelector<HTMLElement>(`[data-n="${n}"]`);
    if (!el || !list) return;
    const r = el.getBoundingClientRect();
    const box = list.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length && alive) {
        // as que estão à vista primeiro
        const i = queue.findIndex((n) => shown.has(n));
        const n = queue.splice(i < 0 ? 0 : i, 1)[0]!;
        if (drawn[n] || !shown.has(n)) continue;
        const url = await render(n).catch(() => null);
        if (!alive) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (url) {
          urls.set(n, url);
          drawn = { ...drawn, [n]: url };
        }
        // mantém no máximo ~120 miniaturas na memória
        if (urls.size > 120) {
          for (const [k, u] of urls) {
            if (shown.has(k)) continue;
            URL.revokeObjectURL(u);
            urls.delete(k);
            const { [k]: _, ...rest } = drawn;
            drawn = rest;
            if (urls.size <= 100) break;
          }
        }
      }
    } finally {
      busy = false;
    }
  }

  async function render(n: number): Promise<string | null> {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: (W / base.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.75));
    canvas.width = 0;
    canvas.height = 0;
    return blob ? URL.createObjectURL(blob) : null;
  }
</script>

<div class="thumbs" bind:this={list}>
  {#each sizes as s, i (i)}
    {@const n = i + 1}
    <button data-n={n} class:on={n === current} onclick={() => onpick(n)} aria-label="Página {n}" aria-current={n === current ? 'page' : undefined}>
      <span class="img" style:aspect-ratio="{s.w} / {s.h}">
        {#if drawn[n]}<img src={drawn[n]} alt="" />{/if}
        {#if marked.has(n)}<i class="bm" title="Marcador"></i>{/if}
      </span>
      <span class="n">{n}{#if annotated.has(n)}<b title="Tem anotações">•</b>{/if}</span>
    </button>
  {/each}
</div>

<style>
  .thumbs { overflow-y: auto; padding: 10px 8px 20px; display: grid; justify-items: center; gap: 10px; align-content: start; }
  button { width: 132px; border: 0; background: none; padding: 6px; border-radius: 9px; display: grid; justify-items: center; gap: 5px; color: var(--muted); }
  button:hover { background: var(--surface-2); }
  button.on { background: color-mix(in srgb, var(--ember) 12%, transparent); color: var(--ink); }
  .img { position: relative; width: 112px; background: #f4f3f6; border-radius: 3px; overflow: hidden;
    box-shadow: 0 1px 0 var(--line), 0 8px 18px -12px #000; outline: 2px solid transparent; outline-offset: 2px; }
  button.on .img { outline-color: var(--ember); }
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .bm { position: absolute; top: 0; right: 8px; width: 10px; height: 16px; background: var(--ember);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%); }
  .n { font: 11px var(--f-mono); display: inline-flex; gap: 4px; }
  .n b { color: var(--ember); }
</style>
