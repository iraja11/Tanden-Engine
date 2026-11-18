<script lang="ts">
  import {
    CHECKLISTS, DICAS, elementCoverage, proximosPassos, readChecks, toggleCheck,
    type AcaoMissao, type PassoGuia, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { sound } from '../../sound.svelte';
  import { cadernos } from '../cadernos.svelte';
  import MissoesHoje from './jornada/MissoesHoje.svelte';

  // Guia de construção: o que fazer agora (calculado do mundo), checklists por
  // tema (guardados na nota do mundo como tarefas do markdown) e dicas de ofício.
  let { world, onopen, ongo, oncreate, onelement, onacao }: {
    world: World;
    onopen: (path: string) => void;
    ongo: (tab: string) => void;
    oncreate: (name: string, type: string) => void;
    onelement: (id: string) => void;
    onacao: (a: AcaoMissao) => void;
  } = $props();

  const passos = $derived(proximosPassos(world, elementCoverage(world), 8));
  const text = $derived.by(() => { void cadernos.rev; return world.path ? cadernos.read(world.path) : ''; });
  const checks = $derived(readChecks(text));
  const totalItems = CHECKLISTS.reduce((n, c) => n + c.itens.length, 0);
  const doneItems = $derived(CHECKLISTS.reduce((n, c) => n + c.itens.filter((i) => checks.has(i)).length, 0));
  let open = $state<string | null>('fundacao');

  function act(p: PassoGuia) {
    if (p.acao === 'criar') oncreate(p.nome ?? '', p.tipo);
    else if (p.acao === 'aba') ongo(p.aba);
    else if (p.acao === 'abrir') onopen(p.path);
    else onelement(p.elemento);
  }
  const ACT: Record<PassoGuia['acao'], string> = { criar: 'Criar', aba: 'Ir', abrir: 'Abrir', elemento: 'Ver' };

  function toggle(item: string) {
    if (!world.path) return;
    const on = !checks.has(item);
    cadernos.update(world.path, (t) => toggleCheck(t, item, on));
    if (on) sound.play('tick');
  }

  const temas = [...new Set(DICAS.map((d) => d.tema))];
  let tema = $state<string | null>(null);
  let dicaSeed = $state(Math.floor(Math.random() * DICAS.length));
  const dicaDoDia = $derived(DICAS[dicaSeed % DICAS.length]!);
</script>

<div class="guia">
  <MissoesHoje {world} {onacao} />

  <section class="passos">
    <h3>O que fazer agora</h3>
    {#if passos.length}
      <ol>
        {#each passos as p, i (p.texto)}
          <li in:rise={{ delay: i * 35, y: 4 }}>
            <span class="n">{i + 1}</span>
            <span class="t">{p.texto}</span>
            <button class="t-btn t-btn--sm" onclick={() => act(p)}>{ACT[p.acao]}</button>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="ok">✓ O básico está todo de pé. Agora é aprofundar: veja os checklists e a tabela de elementos.</p>
    {/if}
  </section>

  <section class="dica t-card">
    <small>{dicaDoDia.tema}</small>
    <b>{dicaDoDia.titulo}</b>
    <p>{dicaDoDia.texto}</p>
    <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (dicaSeed += 1)}>Outra dica →</button>
  </section>

  <section class="checks">
    <header>
      <h3>Checklists</h3>
      <span class="dim">{doneItems} de {totalItems}</span>
      <span class="bar"><i style:width="{(doneItems / totalItems) * 100}%"></i></span>
    </header>
    {#if !world.path}<p class="dim small">Este mundo não tem nota própria; crie <code>Mundos/{world.name}/{world.name}.md</code> para guardar os checklists.</p>{/if}
    <p class="dim small">Marcados ficam na nota do mundo, na seção <code>## Checklist</code> (o Obsidian também mostra).</p>
    <div class="lists">
      {#each CHECKLISTS as c (c.id)}
        {@const n = c.itens.filter((i) => checks.has(i)).length}
        <div class="cl t-card" class:open={open === c.id} class:full={n === c.itens.length}>
          <button class="clh" onclick={() => (open = open === c.id ? null : c.id)} aria-expanded={open === c.id}>
            <span class="ring" style:--p={n / c.itens.length}></span>
            <span class="tt"><b>{c.titulo}</b><small>{c.desc}</small></span>
            <span class="cnt">{n}/{c.itens.length}</span>
          </button>
          {#if open === c.id}
            <ul in:rise={{ y: -4 }}>
              {#each c.itens as it (it)}
                <li><label class:done={checks.has(it)}><input type="checkbox" checked={checks.has(it)} disabled={!world.path} onchange={() => toggle(it)} />{it}</label></li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <section class="dicas">
    <header>
      <h3>Dicas de ofício</h3>
      <div class="chips">
        <button class="t-chip" class:on={!tema} onclick={() => (tema = null)}>Todas</button>
        {#each temas as t (t)}<button class="t-chip" class:on={tema === t} onclick={() => (tema = tema === t ? null : t)}>{t}</button>{/each}
      </div>
    </header>
    <div class="dgrid">
      {#each DICAS.filter((d) => !tema || d.tema === tema) as d, i (d.titulo)}
        <article class="t-card" in:rise={{ delay: Math.min(i, 12) * 20, y: 4 }}>
          <small>{d.tema}</small>
          <b>{d.titulo}</b>
          <p>{d.texto}</p>
        </article>
      {/each}
    </div>
  </section>
</div>

<style>
  .guia { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--sp-4); padding-bottom: 40px; align-items: start; }
  h3 { margin: 0 0 8px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .passos ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .passos li { display: grid; grid-template-columns: 26px 1fr auto; gap: 10px; align-items: center; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); font-size: 14px; line-height: 1.4; }
  .passos li:first-child { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); background: color-mix(in srgb, var(--ember) 6%, var(--surface)); }
  .n { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font: 600 12px var(--f-mono); background: var(--surface-2); color: var(--muted); }
  .ok { color: var(--ok); margin: 0; }
  .dica { display: grid; gap: 4px; background: radial-gradient(circle at 100% 0, color-mix(in srgb, var(--ember) 12%, var(--surface)), var(--surface) 60%); }
  .dica small, article small { color: var(--ember-soft); font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; }
  .dica b { font: 600 18px var(--f-display); }
  .dica p { margin: 0; line-height: 1.55; }
  .dica button { justify-self: end; }
  .checks, .dicas { grid-column: 1 / -1; }
  .checks header, .dicas header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .checks header h3, .dicas header h3 { margin: 0; }
  .bar { flex: 1; min-width: 80px; max-width: 240px; height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--ok); }
  .lists { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 8px; align-items: start; margin-top: 8px; }
  .cl { padding: 0; overflow: hidden; }
  .cl.full { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
  .clh { width: 100%; display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 10px 12px; border: 0; background: none; color: var(--ink); text-align: left; }
  .tt { display: grid; gap: 1px; }
  .tt small { color: var(--muted); font-size: 12px; }
  .cnt { font: 12px var(--f-mono); color: var(--muted); }
  .ring { width: 24px; height: 24px; border-radius: 50%; background: conic-gradient(var(--ok) calc(var(--p) * 360deg), var(--surface-2) 0); mask: radial-gradient(circle, transparent 7px, #000 8px); }
  .cl ul { list-style: none; margin: 0; padding: 4px 12px 12px; display: grid; gap: 4px; border-top: 1px solid var(--line); }
  .cl li label { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; line-height: 1.4; padding: 3px 0; cursor: pointer; }
  .cl li input { margin-top: 3px; accent-color: var(--ok); }
  .cl li label.done { color: var(--muted); text-decoration: line-through; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips .t-chip { min-height: 26px; padding: 2px 10px; font-size: 12.5px; }
  .dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: 8px; margin-top: 8px; }
  article { display: grid; gap: 4px; align-content: start; }
  article b { font: 600 15px var(--f-display); }
  article p { margin: 0; font-size: 13.5px; line-height: 1.5; color: color-mix(in srgb, var(--ink) 88%, var(--muted)); }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  @media (max-width: 800px) { .guia { grid-template-columns: 1fr; } }
</style>
