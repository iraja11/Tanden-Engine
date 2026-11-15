<script lang="ts">
  import { KIND_PT, type CompHit, type Edition } from '@tanden/core';
  import { compendio } from '../compendio.svelte';
  import CompEntry from './CompEntry.svelte';

  // Consulta de regras: busca em magias, itens, talentos, classes, condições e regras gerais.
  type Kind = CompHit['kind'];
  const GROUPS: Array<[string, Kind[] | null]> = [
    ['Tudo', null],
    ['Magias', ['spell']],
    ['Itens', ['item', 'itemMastery']],
    ['Talentos', ['feat']],
    ['Classes', ['class', 'subclass', 'optionalfeature']],
    ['Espécies', ['species']],
    ['Antecedentes', ['background']],
    ['Condições', ['condition', 'disease']],
    ['Regras e ações', ['variantrule', 'action', 'skill', 'sense', 'language']],
  ];

  let q = $state('');
  let group = $state(0);
  let picked = $state<CompHit | null>(null);

  $effect(() => { void compendio.load(); });

  const ed = $derived(compendio.edition);
  const hits = $derived.by(() => {
    const comp = compendio.comp;
    if (!comp) return [];
    const kinds = GROUPS[group]?.[1] ?? undefined;
    if (!q.trim() && !kinds) return [];
    return comp.search(q, ed, kinds, 150);
  });

  function setEd(e: Edition) {
    compendio.setEdition(e);
    picked = null;
  }
</script>

<div class="cp">
  {#if compendio.status === 'missing'}
    <div class="empty-state">
      <p>O compêndio de D&amp;D 5e ainda não foi gerado nesta máquina. Com a cópia do 5etools em <code>../5e tools</code>, rode na pasta do Tanden:</p>
      <p><code>node scripts/compendio-5e.mjs</code></p>
      <p class="small">O arquivo fica só aqui (não vai para o git): tem o texto dos livros.</p>
    </div>
  {:else}
    <div class="bar">
      <input class="field q" bind:value={q} placeholder="Buscar magia, item, talento, condição, regra…" aria-label="Buscar no compêndio" />
      <span class="seg" role="radiogroup" aria-label="Edição">
        <button role="radio" aria-checked={ed === '2024'} class:on={ed === '2024'} onclick={() => setEd('2024')} title="Livro do Jogador de 2024 (+ livros antigos sem versão nova)">2024</button>
        <button role="radio" aria-checked={ed === '2014'} class:on={ed === '2014'} onclick={() => setEd('2014')} title="Regras de 2014 (Livro do Jogador, Xanathar, Tasha…)">2014</button>
      </span>
    </div>
    <div class="chips groups">
      {#each GROUPS as [label], i (label)}<button class="chip" class:on={group === i} onclick={() => { group = i; picked = null; }}>{label}</button>{/each}
    </div>

    <div class="split" class:has={!!picked}>
      <ul class="hits" aria-label="Resultados">
        {#if compendio.status !== 'ok'}
          <li class="dim small">Abrindo o compêndio…</li>
        {:else if !hits.length}
          <li class="dim small">{q.trim() || group ? 'Nada encontrado.' : 'Digite para buscar, ou escolha uma categoria.'}</li>
        {/if}
        {#each hits as h (`${h.kind}|${h.name}|${h.source}`)}
          <li>
            <button class:on={picked?.name === h.name && picked?.kind === h.kind} onclick={() => (picked = h)}>
              <b>{h.name}</b>
              <small>{h.sub || KIND_PT[h.kind]}</small>
            </button>
          </li>
        {/each}
      </ul>
      {#if picked}
        <div class="reader box">
          <button class="ghost sm back" onclick={() => (picked = null)}>← Resultados</button>
          {#key `${picked.kind}|${picked.name}|${picked.source}`}<CompEntry kind={picked.kind} item={picked.item} {ed} />{/key}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cp { display: grid; gap: 10px; align-content: start; }
  .bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .q { flex: 1; min-width: min(240px, 100%); }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); }
  .seg button { border: 0; background: none; border-radius: 7px; padding: 4px 10px; font: 12px var(--f-mono); color: var(--muted); }
  .seg button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }
  .groups { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; padding-bottom: 2px; }
  .split { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .split.has { grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); }
  .hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; align-content: start; max-height: 70vh; overflow-y: auto; }
  .hits button { width: 100%; text-align: left; border: 1px solid transparent; background: none; border-radius: 9px; padding: 6px 10px; display: grid; gap: 1px; color: var(--ink); }
  .hits button:hover { background: var(--surface-2); }
  .hits button.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 8%, var(--surface)); }
  .hits b { font-weight: 600; font-size: 13.5px; }
  .hits small { color: var(--muted); font-size: 11.5px; }
  .reader { min-width: 0; align-self: start; max-height: 75vh; overflow-y: auto; }
  .back { display: none; margin-bottom: 8px; }
  @media (max-width: 720px) {
    .split.has { grid-template-columns: minmax(0, 1fr); }
    .split.has .hits { display: none; }
    .back { display: inline-block; }
  }
</style>
