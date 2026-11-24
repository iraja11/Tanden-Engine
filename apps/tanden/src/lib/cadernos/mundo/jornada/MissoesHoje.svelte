<script lang="ts">
  import { medirMissao, type AcaoMissao, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { jornada } from './jornada.svelte';

  // As três missões do dia, tiradas do que falta neste mundo.
  let { world, onacao }: { world: World; onacao: (a: AcaoMissao) => void } = $props();

  $effect(() => { jornada.garantirMissoes(world); });
  const m = $derived(jornada.missoes(world.name));
  const hoje = $derived(jornada.registro.dias[jornada.hoje]?.[world.name] ?? {});
  const moeda = $derived(jornada.estado(world).genero.moeda);
  const completo = $derived(m.lista.length > 0 && m.feitas.length >= m.lista.length);
  const bau = $derived.by(() => { void jornada.rev; return jornada.baus().find((b) => b.id === `m:${jornada.hoje}:${world.name}`); });
  const ROTULO: Record<AcaoMissao['tipo'], string> = { abrir: 'Abrir', aba: 'Ir', criar: 'Criar', sprint: 'Escrever', entrevista: 'Entrevistar' };
</script>

<section class="missoes">
  <header>
    <h3>Missões de hoje</h3><span class="dim">{m.feitas.length} de {m.lista.length}</span>
    <span class="premio" class:pronto={completo && !bau?.aberto} class:aberto={!!bau?.aberto}>
      {#if completo && bau && !bau.aberto}
        <button class="t-btn t-btn--sm" onclick={() => (jornada.pedido = { tipo: 'tesouro' })}><span aria-hidden="true">⛋</span> Abrir o baú do dia</button>
      {:else if bau?.aberto}
        <span aria-hidden="true">⛋</span> Baú do dia aberto
      {:else}
        <span aria-hidden="true">⛋</span> Cumpra as três para ganhar um baú
      {/if}
    </span>
  </header>
  <ul>
    {#each m.lista as x, i (x.id)}
      {@const feita = m.feitas.includes(x.id)}
      {@const v = medirMissao(x, world, hoje)}
      <li class:feita in:rise={{ delay: i * 40, y: 4 }}>
        <span class="marca" aria-hidden="true">{feita ? '✓' : '◎'}</span>
        <span class="t">
          <span>{x.texto}</span>
          {#if !feita && x.alvo > 1}<span class="p"><i style:width="{(v / x.alvo) * 100}%"></i></span>{/if}
          <small>+{x.xp} {moeda}{#if !feita && x.alvo > 1} · {v} de {x.alvo}{/if}</small>
        </span>
        {#if !feita}<button class="t-btn t-btn--sm" onclick={() => onacao(x.acao)}>{ROTULO[x.acao.tipo]}</button>{/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .missoes { grid-column: 1 / -1; }
  header { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-bottom: 8px; }
  .premio { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
  .premio.pronto .t-btn { border-color: #e8c547; background: color-mix(in srgb, #e8c547 16%, var(--surface)); animation: brilho 2s ease-in-out infinite; }
  .premio.aberto { color: var(--ok); }
  @keyframes brilho { 50% { box-shadow: 0 0 14px -2px #e8c547; } }
  @media (prefers-reduced-motion: reduce) { .premio.pronto .t-btn { animation: none; } }
  h3 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .dim { color: var(--muted); font: 12px var(--f-mono); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 8px; }
  li { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--ember) 32%, var(--line)); border-radius: var(--r-md);
    background: color-mix(in srgb, var(--ember) 5%, var(--surface)); font-size: 13.5px; line-height: 1.4; }
  li.feita { border-color: color-mix(in srgb, var(--ok) 45%, var(--line)); background: color-mix(in srgb, var(--ok) 6%, var(--surface)); color: var(--muted); }
  .marca { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; color: var(--ember); background: var(--surface-2); }
  .feita .marca { color: var(--ok); }
  .t { display: grid; gap: 3px; min-width: 0; }
  .p { height: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .p i { display: block; height: 100%; background: var(--ember); transition: width .4s var(--ease); }
  small { color: var(--muted); font: 11px var(--f-mono); }
</style>
