<script lang="ts">
  import { MOVE_BADGE_GROUPS, infoRaridade, type BadgeState, type MoveBadgeGroup } from '@tanden/core';
  import { exercicios as ex } from './exercicios.svelte';

  // Conquistas: todas as metas, com o progresso das que faltam.
  let group = $state<MoveBadgeGroup | 'todas'>('todas');
  let onlyOpen = $state(false);
  const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  const shown = $derived(ex.badges.filter((s) => (group === 'todas' || s.badge.group === group) && (!onlyOpen || !s.done)));
  const pct = $derived(Math.round((ex.badgesDone / Math.max(1, ex.badges.length)) * 100));
  const count = (g: MoveBadgeGroup) => ex.badges.filter((s) => s.badge.group === g && s.done).length;
  const hidden = (s: BadgeState) => s.badge.secret && !s.done;
</script>

<section class="t-card head">
  <div class="sum">
    <b>{ex.badgesDone}</b><span>de {ex.badges.length} conquistas</span>
  </div>
  <div class="meter" role="meter" aria-label="Conquistas obtidas" aria-valuenow={ex.badgesDone} aria-valuemin="0" aria-valuemax={ex.badges.length}><i style:width="{pct}%"></i></div>
  {#if ex.nextBadge}
    {@const n = ex.nextBadge}
    <p class="next">Mais perto: <b>{n.badge.glyph} {n.badge.name}</b> · {fmt(n.value)} de {fmt(n.badge.target)}</p>
  {/if}
</section>

<div class="filters t-scroll-x">
  <button class="t-chip" class:on={group === 'todas'} onclick={() => (group = 'todas')}>Todas</button>
  {#each MOVE_BADGE_GROUPS as g (g.id)}
    <button class="t-chip" class:on={group === g.id} onclick={() => (group = g.id)}>{g.label}<small>{count(g.id)}</small></button>
  {/each}
  <button class="t-chip" class:on={onlyOpen} onclick={() => (onlyOpen = !onlyOpen)}>Só as que faltam</button>
</div>

<ul class="grid">
  {#each shown as s (s.badge.id)}
    {@const r = infoRaridade(s.badge.rarity)}
    <li class="badge" class:done={s.done} style:--r={r.cor}>
      <span class="glyph" aria-hidden="true">{hidden(s) ? '?' : s.badge.glyph}</span>
      <span class="txt">
        <small>{r.label}{s.badge.secret ? ' · secreta' : ''}</small>
        <b>{hidden(s) ? 'Conquista secreta' : s.badge.name}</b>
        <span>{hidden(s) ? 'Continue treinando para descobrir.' : s.badge.desc}</span>
        {#if s.done}
          <em>{s.since ? `obtida em ${dm(s.since)}` : 'obtida'}</em>
        {:else if !hidden(s)}
          <span class="bar"><i style:width="{s.progress * 100}%"></i></span>
          <em>{fmt(s.value)} / {fmt(s.badge.target)}</em>
        {/if}
      </span>
    </li>
  {/each}
</ul>

<style>
  .head { display: grid; gap: var(--sp-2); margin-bottom: var(--sp-3); }
  .sum { display: flex; align-items: baseline; gap: var(--sp-2); color: var(--muted); }
  .sum b { font: 700 var(--fs-2xl) var(--f-display); color: var(--ink); }
  .meter, .bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .meter i, .bar i { display: block; height: 100%; border-radius: inherit; background: var(--ember); }
  .bar i { background: var(--r); }
  .next { margin: 0; font-size: var(--fs-sm); color: var(--muted); overflow-wrap: anywhere; }
  .next b { color: var(--ink); font-weight: 600; }
  .filters { margin-bottom: var(--sp-3); }
  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: var(--sp-2); }
  .badge { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); opacity: .78; }
  .badge.done { opacity: 1; border-color: color-mix(in srgb, var(--r) 55%, var(--line)); background: linear-gradient(120deg, color-mix(in srgb, var(--r) 10%, var(--surface)), var(--surface) 70%); }
  .glyph { flex: none; width: 40px; height: 40px; display: grid; place-items: center; font-size: 19px; border-radius: 50%; background: var(--surface-2); filter: grayscale(1); }
  .done .glyph { filter: none; background: color-mix(in srgb, var(--r) 16%, transparent); box-shadow: 0 0 18px -8px var(--r); }
  .txt { flex: 1; min-width: 0; display: grid; gap: 3px; font-size: 12.5px; line-height: 1.35; color: var(--muted); }
  .txt small { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--r); }
  .txt b { font: 600 var(--fs-md) var(--f-display); color: var(--ink); }
  .txt em { font: normal 11px var(--f-mono); color: var(--muted); }
</style>
