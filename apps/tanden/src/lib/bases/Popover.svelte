<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { pop } from '../motion';

  // Painel flutuante preso a um elemento. Vai para o <body> (para não ser
  // cortado por rolagens) e fecha com Esc ou clique fora.
  let { anchor, onclose, children, width, align = 'start' }: {
    anchor: HTMLElement | null | undefined;
    onclose: () => void;
    children: Snippet;
    width?: number;
    align?: 'start' | 'end';
  } = $props();

  let el = $state<HTMLDivElement>();
  let pos = $state({ x: 0, y: 0 });

  function place() {
    if (!anchor || !el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = align === 'end' ? r.right - w : r.left;
    let y = r.bottom + 4;
    x = Math.max(8, Math.min(x, innerWidth - w - 8));
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 4);
    pos = { x, y };
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => {
    place();
    const ro = new ResizeObserver(place);
    if (el) ro.observe(el);
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el?.contains(t) || anchor?.contains(t)) return;
      // outro popover aberto por cima deste (ex.: escolher cor dentro do menu)
      if ((t as HTMLElement).closest?.('.db-pop')) return;
      onclose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onclose(); } };
    addEventListener('pointerdown', down, true);
    addEventListener('keydown', key, true);
    addEventListener('resize', place);
    return () => {
      ro.disconnect();
      removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key, true);
      removeEventListener('resize', place);
    };
  });
</script>

<div class="db-pop" bind:this={el} use:portal transition:pop={{ duration: 160, from: .97 }}
  style:left="{pos.x}px" style:top="{pos.y}px" style:width={width ? `${width}px` : undefined}>
  {@render children()}
</div>
