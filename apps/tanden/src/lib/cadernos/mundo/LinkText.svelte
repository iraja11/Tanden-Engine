<script lang="ts">
  import { linkTarget } from '@tanden/core';

  // Uma frase com [[links]]: cada link vira um chip clicável (cor do tipo, se houver).
  let { text, color, onlink }: { text: string; color?: (target: string) => string | null; onlink?: (target: string) => void } = $props();

  const parts = $derived.by(() => {
    const out: Array<{ link: string | null; text: string }> = [];
    let last = 0;
    for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
      if (m.index! > last) out.push({ link: null, text: text.slice(last, m.index) });
      const t = linkTarget(m[1]!);
      out.push({ link: t, text: m[1]!.includes('|') ? m[1]!.split('|')[1]! : t });
      last = m.index! + m[0].length;
    }
    if (last < text.length) out.push({ link: null, text: text.slice(last) });
    return out;
  });
</script>

<span class="lt">{#each parts as p, i (i)}{#if p.link}<button class="ln" style:--c={color?.(p.link) ?? 'var(--ember-soft)'} onclick={(e) => { e.stopPropagation(); onlink?.(p.link!); }}>{p.text}</button>{:else}{p.text}{/if}{/each}</span>

<style>
  .ln { border: 0; background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--ink); padding: 0 5px; border-radius: 5px; font: inherit;
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--c) 60%, transparent); }
  .ln:hover { background: color-mix(in srgb, var(--c) 28%, transparent); }
</style>
