<script lang="ts">
  import { onMount } from 'svelte';
  import { HOME_PROPS, LIMITS, type HomeProp, type Limit, type MoveSettings } from '@tanden/core';
  import { back } from '../back';
  import { exercicios as ex } from './exercicios.svelte';

  // O que a pessoa tem em casa, o nível e o que evitar.
  let { onclose }: { onclose: () => void } = $props();

  let form = $state<MoveSettings>(structuredClone($state.snapshot(ex.settings)) as MoveSettings);
  const LEVELS: Array<[1 | 2 | 3, string]> = [[1, 'Iniciante'], [2, 'Intermediário'], [3, 'Avançado']];
  const toggle = <T,>(list: T[], x: T): T[] => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  onMount(() => back.layer(onclose));

  function save() {
    ex.saveSettings({
      ...$state.snapshot(form) as MoveSettings,
      minutes: Math.max(3, Math.min(60, Math.round(form.minutes) || 20)),
      weekGoal: Math.max(10, Math.min(1500, Math.round(form.weekGoal) || 150)),
    });
    onclose();
  }
</script>

<div class="t-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="t-sheet" role="dialog" aria-modal="true" aria-label="Ajustes dos treinos">
    <h2>Ajustes dos treinos</h2>

    <p class="t-eyebrow">Nível</p>
    <div class="t-seg" role="radiogroup" aria-label="Nível">
      {#each LEVELS as [n, label] (n)}<button role="radio" aria-checked={form.level === n} class:on={form.level === n} onclick={() => (form.level = n)}>{label}</button>{/each}
    </div>

    <p class="t-eyebrow">O que você tem em casa</p>
    <div class="chips">
      {#each HOME_PROPS as p (p.id)}
        <button class="t-chip" class:on={form.props.includes(p.id)} aria-pressed={form.props.includes(p.id)} onclick={() => (form.props = toggle<HomeProp>(form.props, p.id))}>{p.label}</button>
      {/each}
    </div>

    <p class="t-eyebrow">Poupar</p>
    <div class="chips">
      {#each LIMITS as l (l.id)}
        <button class="t-chip" class:on={form.avoid.includes(l.id)} aria-pressed={form.avoid.includes(l.id)} onclick={() => (form.avoid = toggle<Limit>(form.avoid, l.id))}>{l.label}</button>
      {/each}
    </div>

    <label class="sw"><input type="checkbox" bind:checked={form.quiet} /> Sem saltos, para não incomodar os vizinhos</label>

    <div class="nums">
      <label>Duração do treino (min)<input class="t-input" type="number" min="3" max="60" bind:value={form.minutes} /></label>
      <label>Meta da semana (min)<input class="t-input" type="number" min="10" max="1500" step="10" bind:value={form.weekGoal} /></label>
    </div>

    <p class="note">A OMS recomenda ao menos 150 minutos de atividade moderada por semana e força em 2 dias. Pare se sentir dor forte, tontura ou falta de ar. Com problema de saúde, gestação ou lesão, converse com um profissional antes de começar.</p>

    <div class="t-actions">
      <button class="t-btn t-btn--quiet" onclick={onclose}>Cancelar</button>
      <button class="t-btn t-btn--primary" onclick={save}>Salvar</button>
    </div>
  </div>
</div>

<style>
  .t-seg { display: flex; }
  .t-seg > button { flex: 1; justify-content: center; padding-inline: var(--sp-1); }
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .sw { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); color: var(--silver); }
  .sw input { flex: none; accent-color: var(--ember); }
  .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr)); gap: var(--sp-3); }
  .nums label { display: grid; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--silver); }
  .nums input { width: 100%; }
  .note { margin: 0; font-size: 12px; line-height: 1.5; color: var(--muted); }
</style>
