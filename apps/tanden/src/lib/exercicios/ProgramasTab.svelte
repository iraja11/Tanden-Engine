<script lang="ts">
  import { HOME_PROGRAMS, focusLabel, programLength, type HomeProgram } from '@tanden/core';
  import { ask } from '../ask.svelte';
  import Icon from '../ui/Icon.svelte';
  import { exercicios as ex } from './exercicios.svelte';

  // Programas de várias semanas: cada treino concluído avança um passo.
  const nextOf = (p: HomeProgram) => {
    const i = Math.min(ex.programNext(p), programLength(p) - 1);
    return p.session(Math.floor(i / p.perWeek), i % p.perWeek);
  };

  async function start(p: HomeProgram) {
    const other = ex.program;
    if (other && other.id !== p.id && !(await ask.confirm(`Trocar "${other.name}" por "${p.name}"?`, { detail: 'O que você já fez continua no registro.', ok: 'Trocar' }))) return;
    ex.startProgram(p);
  }
</script>

<div class="grid">
  {#each HOME_PROGRAMS as p (p.id)}
    {@const total = programLength(p)}
    {@const done = Math.min(total, ex.programNext(p))}
    {@const active = ex.settings.program === p.id}
    {@const next = nextOf(p)}
    <section class="t-card prog" class:active>
      <div class="head">
        <h3>{p.name}</h3>
        {#if active}<span class="t-badge">Em andamento</span>{/if}
      </div>
      <p class="hint">{p.hint}</p>
      <p class="meta">{p.weeks} semanas · {p.perWeek} treinos por semana</p>
      <div class="meter" role="meter" aria-label="Treinos concluídos em {p.name}" aria-valuenow={done} aria-valuemin="0" aria-valuemax={total}><i style:width="{(done / total) * 100}%"></i></div>
      <p class="meta">{done} de {total} treinos{#if done < total} · próximo: {focusLabel(next.focus)}, {next.minutes} min{/if}</p>
      {#if done >= total}
        <p class="done"><Icon name="certo" size={16} />Programa concluído</p>
      {:else}
        <button class="t-btn" class:t-btn--primary={active} onclick={() => start(p)}><Icon name="tocar" size={16} />{done ? 'Continuar' : 'Começar'}</button>
      {/if}
    </section>
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: var(--sp-3); align-items: start; }
  .prog { display: grid; gap: var(--sp-2); justify-items: start; }
  .prog.active { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--sp-2); width: 100%; }
  h3 { margin: 0; font: 600 var(--fs-lg) var(--f-display); color: var(--ink); }
  .hint { margin: 0; font-size: var(--fs-md); line-height: 1.45; color: var(--silver); }
  .meta { margin: 0; font-size: 12px; color: var(--muted); }
  .meter { width: 100%; height: 6px; border-radius: var(--r-pill); background: var(--void); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: inherit; background: var(--ember); }
  .done { display: flex; align-items: center; gap: var(--sp-1); margin: 0; font-size: var(--fs-sm); color: var(--ink); }
  .done :global(svg) { color: var(--ok); }
</style>
