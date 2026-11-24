<script lang="ts">
  import { NAIPES, infoRaridade, type Carta } from '@tanden/core';

  // Uma carta de inspiração, no estilo de tarô: naipe, nome e a faísca de ideia.
  // Fechada (ainda não colecionada), mostra só o verso com a cor da raridade.
  let { carta, oculta = false, grande = false, vezes = 0 }: { carta: Carta; oculta?: boolean; grande?: boolean; vezes?: number } = $props();
  const naipe = $derived(NAIPES.find((n) => n.id === carta.naipe)!);
  const rar = $derived(infoRaridade(carta.raridade));
  const numero = $derived(Number(carta.id.split('-').pop()));
  const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
</script>

<div class="carta {carta.raridade}" class:oculta class:grande style:--n={naipe.cor} style:--r={rar.cor}
  title={oculta ? `${naipe.label} · ${rar.label}: ainda não saiu de nenhum baú` : `${carta.nome} · ${naipe.label} · ${rar.label}`}>
  {#if oculta}
    <span class="verso" aria-hidden="true"><i>{naipe.glifo}</i></span>
    <span class="sr">Carta de {naipe.label} ainda não colecionada</span>
  {:else}
    <span class="topo"><small>{ROMANOS[numero] ?? numero}</small><i class="gema" aria-hidden="true"></i></span>
    <span class="arte" aria-hidden="true"><i>{naipe.glifo}</i></span>
    <b>{carta.nome}</b>
    {#if grande}<p>{carta.texto}</p>{/if}
    <span class="pe"><small>{naipe.label}</small>{#if vezes > 1}<small class="x">×{vezes}</small>{/if}</span>
    {#if carta.raridade === 'epica' || carta.raridade === 'lendaria'}<i class="foil" aria-hidden="true"></i>{/if}
  {/if}
</div>

<style>
  .carta { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 4px; aspect-ratio: 5 / 8; padding: 7px; border-radius: 10px; min-width: 0;
    border: 1.5px solid color-mix(in srgb, var(--r) 70%, var(--line)); color: var(--ink);
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--n) 30%, var(--surface)), var(--surface) 70%);
    box-shadow: 0 8px 20px -14px var(--shadow, #000), inset 0 0 0 3px color-mix(in srgb, var(--n) 10%, transparent); }
  .grande { padding: 14px; gap: 8px; border-radius: 16px; border-width: 2px; box-shadow: 0 24px 50px -20px var(--shadow, #000), 0 0 40px -12px var(--r); }
  .epica, .lendaria { box-shadow: 0 8px 20px -14px var(--shadow, #000), 0 0 16px -6px var(--r); }
  .topo { display: flex; justify-content: space-between; align-items: center; }
  .topo small { font: 600 10px var(--f-display); letter-spacing: .1em; color: var(--n); }
  .grande .topo small { font-size: 13px; }
  .gema { width: 8px; height: 8px; rotate: 45deg; border-radius: 2px; background: var(--r); box-shadow: 0 0 8px var(--r); }
  .arte { flex: 1; display: grid; place-items: center; border-radius: 7px; min-height: 0;
    background: radial-gradient(circle, color-mix(in srgb, var(--n) 26%, transparent), transparent 70%); border: 1px solid color-mix(in srgb, var(--n) 30%, transparent); }
  .arte i { font-style: normal; font-size: clamp(18px, 40%, 34px); color: var(--n); filter: drop-shadow(0 0 10px var(--n)); line-height: 1; }
  .grande .arte i { font-size: 64px; }
  b { font: 600 11.5px/1.2 var(--f-display); text-align: center; overflow-wrap: anywhere; }
  .grande b { font-size: 20px; }
  p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); text-align: center; text-wrap: pretty; }
  .pe { display: flex; justify-content: space-between; font: 9.5px var(--f-mono); color: var(--muted); }
  .grande .pe { font-size: 11px; }
  .x { color: var(--ember-soft); }
  .foil { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color-dodge; opacity: .22;
    background: linear-gradient(115deg, transparent 20%, #ff7ad9 35%, #7af0ff 48%, #fff27a 60%, transparent 76%); background-size: 250% 250%; animation: brilho 5s linear infinite; }
  .lendaria .foil { opacity: .34; }
  @keyframes brilho { to { background-position: 250% 0; } }
  .oculta { border-style: dashed; border-color: color-mix(in srgb, var(--r) 40%, var(--line)); background: var(--surface-2); box-shadow: none; }
  .verso { flex: 1; display: grid; place-items: center; border-radius: 6px;
    background: repeating-linear-gradient(45deg, color-mix(in srgb, var(--n) 9%, transparent) 0 6px, transparent 6px 12px); }
  .verso i { font-style: normal; font-size: 20px; color: color-mix(in srgb, var(--n) 45%, var(--muted)); opacity: .55; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (prefers-reduced-motion: reduce) { .foil { animation: none; } }
</style>
