<script lang="ts">
  import { asList, imageOf, typeInfo, RESERVED, type Entity } from '@tanden/core';
  import Portrait from '../../rpg/Portrait.svelte';
  import { typeColor, typeGlyph } from '../tipos';
  import Ring from './Ring.svelte';

  // Carta de uma ficha do mundo. Na frente: retrato, tipo, campos-chave e a
  // primeira frase. Clicar vira a carta: no verso, as ligações. Inclina e
  // brilha seguindo o ponteiro, como as cartas de item da mesa.
  let { entity, byPath, onopen }: { entity: Entity; byPath: Map<string, Entity>; onopen: (path: string) => void } = $props();

  let el = $state<HTMLElement>();
  let flipped = $state(false);

  function tilt(e: PointerEvent) {
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - y) * 9}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 11}deg`);
  }
  function rest() {
    el?.style.removeProperty('--rx');
    el?.style.removeProperty('--ry');
  }

  const plain = (v: string) => v.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');
  const keyFields = $derived.by(() => {
    const t = typeInfo(entity.type);
    const order = [...t.fields, ...(t.extras ?? []), ...Object.keys(entity.props)];
    const seen = new Set<string>();
    const out: Array<[string, string]> = [];
    for (const k of order) {
      const key = Object.keys(entity.props).find((p) => p.toLowerCase() === k.toLowerCase());
      if (!key || seen.has(key) || RESERVED.has(key.toLowerCase())) continue;
      seen.add(key);
      const v = asList(entity.props[key]).map(plain).join(', ').trim();
      if (v) out.push([key, v]);
      if (out.length >= 4) break;
    }
    return out;
  });

  const links = $derived.by(() => {
    const m = new Map<string, Entity[]>();
    for (const r of entity.relations) {
      const e = r.to ? byPath.get(r.to) : undefined;
      if (!e) continue;
      const l = m.get(r.label) ?? [];
      if (!l.includes(e)) l.push(e);
      m.set(r.label, l);
    }
    return [...m.entries()].slice(0, 7);
  });
  const img = $derived(imageOf(entity.props));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="slot" bind:this={el} onpointermove={tilt} onpointerleave={rest} style:--c={typeColor(entity.type)}>
  <div class="card" class:flipped>
    <!-- frente -->
    <div class="face front" role="button" tabindex="0" onclick={() => (flipped = true)}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipped = true; } }}
      aria-label={`${entity.name}: virar a carta`}>
      <header>
        <b title={entity.name}>{entity.name}</b>
        <Ring value={entity.score} size={18} />
      </header>
      <div class="art">
        {#if img}<Portrait target={img} name={entity.name} square />{:else}<span class="glyph" aria-hidden="true">{typeGlyph(entity.type)}</span>{/if}
      </div>
      <div class="ribbon"><span>{typeInfo(entity.type).label}</span>{#if entity.aliases[0]}<span class="alias">“{entity.aliases[0]}”</span>{/if}</div>
      {#if keyFields.length}
        <dl>{#each keyFields as [k, v] (k)}<dt>{k}</dt><dd title={v}>{v}</dd>{/each}</dl>
      {/if}
      {#if entity.summary}<p class="sum">{entity.summary}</p>{/if}
    </div>
    <!-- verso -->
    <div class="face back">
      <header><b>{entity.name}</b><button class="flip" onclick={() => (flipped = false)} title="Desvirar" aria-label="Desvirar">↺</button></header>
      {#if links.length}
        <ul>
          {#each links as [label, list] (label)}
            <li><span class="lbl">{label}</span>
              {#each list as e (e.path)}<button class="chip" style:--c={typeColor(e.type)} onclick={() => onopen(e.path)}>{e.name}</button>{/each}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="dim">Sem ligações ainda.</p>
      {/if}
      <p class="meta">{entity.words} palavras · {Math.round(entity.score * 100)}% preenchida</p>
      <button class="open" onclick={() => onopen(entity.path)}>Abrir ficha</button>
    </div>
  </div>
  <i class="shine" aria-hidden="true"></i>
</div>

<style>
  .slot { position: relative; perspective: 900px; transform: perspective(800px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
    transition: transform .25s var(--ease, ease); border-radius: 16px; }
  .card { position: relative; display: grid; transform-style: preserve-3d; transition: transform .55s cubic-bezier(.2, .8, .2, 1); min-height: 290px; }
  .card.flipped { transform: rotateY(180deg); }
  .face { grid-area: 1 / 1; display: flex; flex-direction: column; gap: 7px; padding: 10px 11px 12px; border-radius: 16px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
    background: linear-gradient(170deg, color-mix(in srgb, var(--c) 10%, var(--surface)), var(--surface) 40%);
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--line));
    box-shadow: 0 12px 30px -18px var(--shadow, #000), inset 0 0 0 3px color-mix(in srgb, var(--c) 8%, transparent); text-align: left; cursor: pointer; }
  .slot:hover .face { box-shadow: 0 18px 36px -16px var(--shadow, #000), 0 0 24px -8px var(--c); }
  .back { transform: rotateY(180deg); cursor: default; }
  header { display: flex; align-items: center; gap: 6px; }
  header b { flex: 1; min-width: 0; font: 700 14.5px/1.2 var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .art { position: relative; height: 110px; border-radius: 10px; overflow: hidden; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--c) 32%, var(--surface-2)), var(--void) 85%); border: 1px solid color-mix(in srgb, var(--c) 35%, var(--line)); }
  .art :global(.portrait) { position: absolute; inset: 0; width: 100%; height: 100%; }
  .glyph { font-size: 44px; color: var(--c); filter: drop-shadow(0 0 12px color-mix(in srgb, var(--c) 70%, transparent)); line-height: 1; }
  .ribbon { display: flex; justify-content: space-between; gap: 6px; font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--c);
    border-bottom: 1px solid color-mix(in srgb, var(--c) 30%, var(--line)); padding-bottom: 4px; }
  .alias { color: var(--muted); text-transform: none; letter-spacing: 0; font: italic 11px var(--f-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; margin: 0; font-size: 11.5px; }
  dt { color: var(--muted); font: 600 9.5px/1.7 var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sum { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; overflow: auto; }
  li { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .lbl { font: 11px var(--f-mono); color: var(--ember-soft); margin-right: 2px; }
  .chip { border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--ink);
    border-radius: 999px; padding: 0 8px; font-size: 12px; }
  .chip:hover { background: color-mix(in srgb, var(--c) 25%, transparent); }
  .dim { color: var(--muted); font-size: 12px; margin: 0; }
  .meta { margin: auto 0 0; font: 11px var(--f-mono); color: var(--muted); }
  .flip { border: 0; background: none; color: var(--muted); width: 24px; height: 24px; border-radius: 6px; }
  .flip:hover { color: var(--ink); background: var(--surface-2); }
  .open { align-self: flex-start; border: 1px solid color-mix(in srgb, var(--c) 50%, var(--line)); background: none; border-radius: 8px; padding: 4px 10px; font-size: 12px; color: var(--ink); }
  .open:hover { background: color-mix(in srgb, var(--c) 16%, transparent); }
  .shine { position: absolute; inset: 0; border-radius: 16px; pointer-events: none; opacity: 0; mix-blend-mode: soft-light; transition: opacity .25s;
    background: radial-gradient(circle at var(--mx, 50%) var(--my, 30%), rgba(255, 255, 255, .5), transparent 45%); }
  .slot:hover .shine { opacity: 1; }
  @media (prefers-reduced-motion: reduce) { .card, .slot { transition: none; } }
</style>
