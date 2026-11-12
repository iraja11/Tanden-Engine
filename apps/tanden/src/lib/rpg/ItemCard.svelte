<script lang="ts">
  import { formatMoney, type ItemCard } from '@tanden/core';
  import Portrait from './Portrait.svelte';

  // Carta de item: moldura pela raridade, brilho que segue o ponteiro, imagem e números.
  let { name, card, qty = 1, onopen, oncreate, onphoto }: {
    name: string;
    /** null: item sem nota (carta simples, com o botão de criar) */
    card: ItemCard | null;
    qty?: number;
    onopen?: () => void;
    oncreate?: () => void;
    /** escolher ou trocar a foto do item */
    onphoto?: () => void;
  } = $props();

  let el = $state<HTMLElement>();
  function tilt(e: PointerEvent) {
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
  }
  function rest() {
    el?.style.removeProperty('--rx');
    el?.style.removeProperty('--ry');
  }
  const rarity = $derived(card?.rarity ?? 'comum');
  const kg = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} kg`;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<article class="card" bind:this={el} data-rarity={rarity} onpointermove={tilt} onpointerleave={rest}>
  <div class="frame">
    <header>
      <h4 title={name}>{name}</h4>
      {#if qty > 1}<span class="qty">×{qty}</span>{/if}
    </header>
    <div class="art">
      {#if card?.image}
        <Portrait target={card.image} {name} square />
      {:else}
        <svg viewBox="0 0 64 64" aria-hidden="true">
          {#if /arma|espada|weapon|machad|adaga|arco|lan[cç]a/i.test(card?.category ?? name)}
            <path d="M46 8h10v10L28 46l-4-4L46 8ZM22 40l6 6-6 6-3-1-5 5-4-4 5-5-1-3 6-6Z" />
          {:else if /armadura|escudo|armor|shield/i.test(card?.category ?? name)}
            <path d="M32 6 52 13v15c0 14-9 24-20 30C21 52 12 42 12 28V13Z" />
          {:else if /po[cç][aã]o|potion|elixir|frasco/i.test(card?.category ?? name)}
            <path d="M26 6h12v4h-2v10l12 16c4 8-2 22-16 22S12 44 16 36l12-16V10h-2Z" />
          {:else if /anel|ring|amuleto|colar/i.test(card?.category ?? name)}
            <path d="M32 18a16 16 0 1 0 .01 0ZM32 24a10 10 0 1 1-.01 0ZM26 6h12l-6 10Z" />
          {:else if /pergaminho|scroll|livro|book|tomo/i.test(card?.category ?? name)}
            <path d="M14 10h32a6 6 0 0 1 6 6v38H20a6 6 0 0 1-6-6ZM20 20h26M20 28h26M20 36h18" />
          {:else}
            <path d="M14 22h36l-4 32H18ZM22 22a10 10 0 0 1 20 0M26 34h12" />
          {/if}
        </svg>
      {/if}
      <span class="gem" title={rarity} aria-hidden="true"></span>
    </div>
    <div class="type">
      <span>{card?.category || 'item'}</span>
      <span class="rar">{rarity}{#if card?.attunement} · sintonização{/if}</span>
    </div>
    {#if card}
      <div class="stats">
        {#if card.damage}<span title="Dano">⚔ {card.damage}</span>{/if}
        {#if card.ac}<span title="Classe de armadura">🛡 {card.ac}</span>{/if}
        {#if card.value !== null}<span title="Valor">◉ {formatMoney(card.value)}</span>{:else if card.valueText}<span title="Valor">◉ {card.valueText}</span>{/if}
        {#if card.weight !== null}<span title="Peso">⚖ {kg(card.weight)}</span>{/if}
        {#if card.charges}<span title="Cargas">✦ {card.charges.left}{#if card.charges.max !== null}/{card.charges.max}{/if}</span>{/if}
      </div>
      {#if card.properties.length}<p class="props">{card.properties.join(' · ')}</p>{/if}
      {#if card.description}<p class="desc">{card.description}</p>{/if}
      {#if onopen}<button class="open" onclick={onopen}>Abrir nota</button>{/if}
      {#if onphoto}<button class="open" onclick={onphoto}>{card.image ? 'Trocar foto' : 'Pôr foto'}</button>{/if}
    {:else}
      <p class="desc dim">Item sem nota. Crie a carta para guardar raridade, valor, imagem e descrição.</p>
      {#if oncreate}<button class="open" onclick={oncreate}>Criar carta</button>{/if}
    {/if}
  </div>
  <i class="shine" aria-hidden="true"></i>
</article>

<style>
  .card { --c: #9aa3ad; --c2: #5d646c; position: relative; width: 210px; border-radius: 14px; padding: 3px; flex: none;
    background: linear-gradient(145deg, var(--c), var(--c2) 45%, var(--c) 100%);
    box-shadow: 0 10px 28px -14px var(--shadow, rgba(0, 0, 0, .6)), 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent);
    transform: perspective(700px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform .25s var(--ease), box-shadow .25s; }
  .card:hover { box-shadow: 0 16px 34px -12px var(--shadow, rgba(0, 0, 0, .6)), 0 0 22px -6px var(--c); }
  .card[data-rarity='incomum'] { --c: #4fc37b; --c2: #1f6a3f; }
  .card[data-rarity='raro'] { --c: #4f9cff; --c2: #1e4f99; }
  .card[data-rarity='muito raro'] { --c: #b07cff; --c2: #5a2ea6; }
  .card[data-rarity='lendário'] { --c: #ffb54a; --c2: #a8601a; }
  .card[data-rarity='artefato'] { --c: #ff5f5f; --c2: #8f1f2a; }
  .frame { position: relative; z-index: 1; display: grid; gap: 7px; border-radius: 11px; padding: 9px 10px 10px; background: var(--surface); min-height: 100%; }
  header { display: flex; align-items: baseline; gap: 6px; }
  h4 { flex: 1; margin: 0; font: 700 14px/1.2 var(--f-display); letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .qty { font: 600 12px var(--f-mono); color: var(--muted); }
  .art { position: relative; height: 112px; border-radius: 8px; overflow: hidden; display: grid; place-items: center;
    background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--c) 30%, var(--surface-2)), var(--void) 85%);
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--line)); }
  .art svg { width: 54px; height: 54px; fill: color-mix(in srgb, var(--c) 30%, transparent); stroke: var(--c); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round;
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--c) 60%, transparent)); }
  .art :global(.portrait) { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 0; }
  .gem { position: absolute; right: 7px; bottom: 7px; width: 11px; height: 11px; transform: rotate(45deg); background: var(--c); border-radius: 2px;
    box-shadow: 0 0 8px var(--c); border: 1px solid rgba(255, 255, 255, .5); }
  .type { display: flex; justify-content: space-between; gap: 6px; font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
    border-bottom: 1px solid color-mix(in srgb, var(--c) 35%, var(--line)); padding-bottom: 5px; }
  .rar { color: var(--c); text-align: right; }
  .stats { display: flex; flex-wrap: wrap; gap: 4px 10px; font: 12px var(--f-mono); }
  .props { margin: 0; font-size: 11.5px; font-style: italic; color: var(--muted); }
  .desc { margin: 0; font-size: 12.5px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 5; line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
  .dim { color: var(--muted); }
  .open { justify-self: start; border: 1px solid color-mix(in srgb, var(--c) 50%, var(--line)); background: none; border-radius: 8px; padding: 3px 9px; font-size: 12px; color: var(--ink); }
  .open:hover { background: color-mix(in srgb, var(--c) 16%, transparent); }
  /* brilho holográfico que segue o ponteiro (raros para cima brilham mais) */
  .shine { position: absolute; inset: 0; z-index: 2; border-radius: inherit; pointer-events: none; opacity: 0; mix-blend-mode: soft-light; transition: opacity .25s;
    background: radial-gradient(circle at var(--mx, 50%) var(--my, 30%), rgba(255, 255, 255, .55), transparent 45%),
      linear-gradient(115deg, transparent 30%, color-mix(in srgb, var(--c) 50%, transparent) 48%, rgba(255, 255, 255, .25) 52%, transparent 70%); }
  .card:hover .shine { opacity: .55; }
  .card:is([data-rarity='raro'], [data-rarity='muito raro'], [data-rarity='lendário'], [data-rarity='artefato']):hover .shine { opacity: .85; }
  .card[data-rarity='lendário'] .gem, .card[data-rarity='artefato'] .gem { animation: pulse 2.4s ease-in-out infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 16px 2px var(--c); } }
  @media (prefers-reduced-motion: reduce) { .card { transform: none !important; } .gem { animation: none !important; } }
</style>
