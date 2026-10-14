<script lang="ts">
  import { PROFILES, tokenize, type GameProfile, type Token } from '@tanden/core';

  // Uma sequência de luta em ícones: setas para direções, círculos para botões.
  // O preenchimento do círculo é a força (fraco = contorno, forte = cheio) e a cor é a família.
  let { text, profile = PROFILES.sf, size = 'md' }: { text: string; profile?: GameProfile; size?: 'sm' | 'md' | 'lg' } = $props();

  const tokens = $derived(tokenize(text, profile));
  const ANGLE: Record<number, number> = { 6: 0, 3: 45, 2: 90, 1: 135, 4: 180, 7: 225, 8: 270, 9: 315 };
  const DIR_NAME: Record<number, string> = { 1: 'trás-baixo', 2: 'baixo', 3: 'frente-baixo', 4: 'trás', 5: 'neutro', 6: 'frente', 7: 'trás-cima', 8: 'cima', 9: 'frente-cima' };
  const SEP: Record<string, string> = { '>': 'em seguida (link)', '->': 'em seguida', xx: 'cancelar no próximo', '~': 'emendar rápido', '+': 'ao mesmo tempo', ',': 'em sequência' };
  const FAMILY: Record<string, string> = { p: 'soco', k: 'chute', s: 'corte', h: 'especial', d: 'dust', x: 'botões juntos' };
  const POWER = ['fraco', 'médio', 'forte'];

  function motionDirs(t: Extract<Token, { k: 'motion' }>): Array<number | 'spin'> {
    return [...t.d].map((c) => (c === '0' ? 'spin' : Number(c)));
  }
</script>

{#snippet arrow(d: number, hold = false, title = '')}
  <span class="dir" class:hold class:neutral={d === 5} title={title || DIR_NAME[d]}>
    {#if d === 5}
      <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.2" /></svg>
    {:else}
      <svg viewBox="0 0 20 20" style:transform={`rotate(${ANGLE[d]}deg)`}><path d="M3.5 10h11M10.5 5.5 15 10l-4.5 4.5" /></svg>
    {/if}
  </span>
{/snippet}

<span class="seq {size}" aria-label={text}>
  {#each tokens as t, i (i)}
    {#if t.k === 'dir'}
      {@render arrow(t.d, t.hold, t.hold ? `segurar ${DIR_NAME[t.d]}` : '')}
    {:else if t.k === 'motion'}
      <span class="motion" title={t.name ?? t.d}>
        {#each motionDirs(t) as d, j (j)}
          {#if d === 'spin'}<span class="dir spin" title="giro"><svg viewBox="0 0 20 20"><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9M14.5 3v3.5H11" /></svg></span>
          {:else}{@render arrow(d)}{/if}
        {/each}
      </span>
    {:else if t.k === 'charge'}
      <span class="charge" title={`carregar ${DIR_NAME[t.d]}`}>{@render arrow(t.d, true)}</span>
    {:else if t.k === 'btn'}
      <span class="btn f-{t.b.family} p{t.b.power}" class:wide={t.b.id.length > 2} title={`${t.b.id}: ${FAMILY[t.b.family]} ${POWER[t.b.power]}`}>{t.b.id}</span>
    {:else if t.k === 'sep'}
      <span class="sep s-{t.s === 'xx' ? 'xx' : t.s === '>' || t.s === '->' ? 'link' : 'other'}" title={SEP[t.s]}>
        {#if t.s === 'xx'}<svg viewBox="0 0 24 12"><path d="M1 6h19M16 2l4 4-4 4" /></svg>
        {:else if t.s === '>' || t.s === '->'}<svg viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" /></svg>
        {:else}{t.s}{/if}
      </span>
    {:else if t.k === 'mod'}
      <span class="mod" title={t.t}>{t.t}</span>
    {:else if t.k === 'sys'}
      <span class="sys" title="mecânica do jogo">{t.t}</span>
    {:else if t.k === 'rep'}
      <span class="rep" title={`${t.n} vezes`}>×{t.n}</span>
    {:else}
      <span class="txt">{t.t}</span>
    {/if}
  {/each}
</span>

<style>
  .seq { --u: 22px; display: inline-flex; flex-wrap: wrap; align-items: center; gap: 3px 4px; line-height: 1; vertical-align: middle; }
  .seq.sm { --u: 19px; }
  .seq.lg { --u: 28px; }
  .dir { width: var(--u); height: var(--u); display: inline-grid; place-items: center; border-radius: 6px;
    background: var(--surface-2); border: 1px solid var(--line); }
  .dir svg { width: 72%; height: 72%; fill: none; stroke: var(--ink); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .dir.neutral svg { fill: var(--muted); stroke: none; }
  .dir.hold { background: color-mix(in srgb, var(--ink) 16%, var(--surface-2)); border-color: var(--silver); }
  .dir.hold svg { stroke-width: 2.8; }
  .motion { display: inline-flex; gap: 1px; padding: 1px; border-radius: 8px; background: color-mix(in srgb, var(--ember) 9%, transparent); }
  .motion .dir { border-color: transparent; background: transparent; width: calc(var(--u) * .86); }
  .spin svg { stroke: var(--ember-soft); }
  .charge { display: inline-flex; padding: 1px; border-radius: 8px; outline: 1px dashed var(--silver); outline-offset: 1px; }

  .btn { min-width: var(--u); height: var(--u); padding: 0 4px; border-radius: 999px; display: inline-grid; place-items: center;
    font: 700 max(9px, calc(var(--u) * .44))/1 var(--f-mono); letter-spacing: -.02em; border: 1.6px solid var(--c); color: var(--c); }
  .btn.wide { padding: 0 6px; }
  .btn.p1 { background: color-mix(in srgb, var(--c) 28%, transparent); color: var(--ink); }
  .btn.p2 { background: var(--c); color: var(--on-ember); box-shadow: 0 0 10px -3px var(--c); }
  .f-p { --c: var(--ember); }
  .f-k { --c: var(--silver); }
  .f-s { --c: var(--ember-soft); }
  .f-h { --c: color-mix(in srgb, #7fb6ff 78%, var(--ink)); }
  .f-d { --c: color-mix(in srgb, #e7d27a 78%, var(--ink)); }
  .f-x { --c: var(--ok); }

  .sep { display: inline-grid; place-items: center; color: var(--muted); font: 600 calc(var(--u) * .55)/1 var(--f-mono); min-width: 8px; }
  .sep svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; height: calc(var(--u) * .5); }
  .sep.s-link svg { width: calc(var(--u) * .5); }
  .sep.s-xx { color: var(--ember); }
  .sep.s-xx svg { width: calc(var(--u) * 1); }
  .mod, .sys { font: 600 calc(var(--u) * .4)/1 var(--f-display); letter-spacing: .08em; text-transform: uppercase; padding: 4px 6px; border-radius: 6px; }
  .mod { color: var(--muted); background: var(--surface-2); }
  .sys { color: var(--ember-soft); border: 1px solid color-mix(in srgb, var(--ember) 45%, transparent); }
  .rep { font: 600 calc(var(--u) * .5)/1 var(--f-mono); color: var(--ember-soft); }
  .txt { color: var(--muted); font-size: calc(var(--u) * .55); }
</style>
