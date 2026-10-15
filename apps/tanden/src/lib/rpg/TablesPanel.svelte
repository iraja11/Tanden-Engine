<script lang="ts">
  import type { RollTable, TableRoll } from '@tanden/core';
  import { renderInline } from '../editor/inline';
  import { files } from '../files/files.svelte';
  import { mesa } from './mesa.svelte';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  let query = $state('');
  let results = $state<Record<string, TableRoll>>({});
  let open = $state<string | null>(null);

  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const groups = $derived.by(() => {
    const q = norm(query.trim());
    const m = new Map<string, RollTable[]>();
    for (const t of mesa.tables) {
      if (q && !norm(`${t.name} ${t.note}`).includes(q)) continue;
      m.set(t.path, [...(m.get(t.path) ?? []), t]);
    }
    return [...m.entries()].map(([path, list]) => ({ path, note: list[0]!.note, list: [...list].sort((a, b) => a.order - b.order) }));
  });

  function go(t: RollTable) {
    const r = mesa.rollTable(t);
    if (typeof r !== 'string') results = { ...results, [t.id]: r };
  }

  /** [[links]] clicáveis no resultado */
  function follow(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a[data-href]') as HTMLElement | null;
    if (!a) return;
    e.preventDefault();
    files.openLink(a.dataset['href']!);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="tables" onclick={follow}>
  <div class="top">
    <input class="field" bind:value={query} placeholder="Buscar tabela" aria-label="Buscar tabela" />
    <button class="ghost sm" onclick={() => onOpenNote(mesa.createStarterTables())} title="Cria Tabelas/Geradores.md com nomes, tavernas, ganchos, clima e tesouro">Geradores de exemplo</button>
  </div>

  {#if !mesa.tables.length}
    <div class="empty-state">
      <p>Qualquer tabela Markdown com um dado no cabeçalho (<code>d6</code>, <code>d20</code>, <code>d100</code>) vira uma tabela de rolagem, em qualquer nota.
        Numa nota com <code>tipo: tabela</code>, cada lista debaixo de um título também vira uma tabela.</p>
      <button class="primary" onclick={() => onOpenNote(mesa.createStarterTables())}>Criar geradores de exemplo</button>
    </div>
  {:else}
    {#each groups as g (g.path)}
      <section>
        <h3><button class="lnk" onclick={() => onOpenNote(g.path)} title="Abrir a nota">{g.note}</button></h3>
        <div class="grid">
          {#each g.list as t (t.id)}
            {@const r = results[t.id]}
            <div class="card">
              <div class="row">
                <button class="roll-btn go" onclick={() => go(t)} title={t.dice ? `Rolar ${t.dice}` : 'Sortear um item'}>🎲</button>
                <span class="nm"><b>{t.name}</b><small>{t.dice ?? 'lista'} · {t.entries.length} {t.entries.length === 1 ? 'item' : 'itens'}</small></span>
                <button class="icon" onclick={() => (open = open === t.id ? null : t.id)} aria-expanded={open === t.id} title="Ver itens">{open === t.id ? '▾' : '▸'}</button>
              </div>
              {#if r}
                {#key r}
                  <p class="out">{#if t.dice}<span class="v mono">{r.value}</span> {/if}{@html renderInline(r.text)}</p>
                {/key}
              {/if}
              {#if open === t.id}
                <ol class="entries">
                  {#each t.entries as e, i (i)}
                    <li class:hit={r && r.value >= e.from && r.value <= e.to && (t.dice || r.value === i + 1)}>
                      <span class="mono">{t.dice ? (e.from === e.to ? e.from : `${e.from}–${Number.isFinite(e.to) ? e.to : '+'}`) : i + 1}</span>
                      <span>{@html renderInline(e.text)}</span>
                    </li>
                  {/each}
                </ol>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
    <p class="dim small">Dentro de um resultado, <code>{'{2d4}'}</code> rola dados e <code>{'{@Outra tabela}'}</code> rola outra tabela. Numa nota, <code>`dice: [[Geradores#Taverna]]`</code> vira um botão.</p>
  {/if}
</div>

<style>
  .tables { display: grid; gap: 12px; align-content: start; }
  .top { display: flex; gap: 8px; flex-wrap: wrap; }
  .top input { flex: 1 1 220px; max-width: 360px; }
  .lnk { border: 0; background: none; padding: 0; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; }
  .lnk:hover { color: var(--ember); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
  .card { border: 1px solid var(--line); border-radius: 13px; background: var(--surface); padding: 8px 10px; display: grid; gap: 6px; align-content: start; }
  .row { display: flex; align-items: center; gap: 8px; }
  .go { width: 34px; height: 34px; font-size: 16px; flex: none; }
  .nm { flex: 1; display: grid; min-width: 0; }
  .nm b { font: 600 14px var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nm small { font: 11px var(--f-mono); color: var(--muted); }
  .out { margin: 0; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--ember) 8%, var(--surface-2)); border: 1px solid color-mix(in srgb, var(--ember) 30%, var(--line));
    font-size: 14px; animation: land .3s var(--spring); }
  .out .v { color: var(--ember); font-weight: 700; margin-right: 6px; }
  .out :global(a) { color: var(--ember-soft); }
  .entries { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; max-height: 240px; overflow-y: auto; font-size: 12.5px; }
  .entries li { display: grid; grid-template-columns: 44px 1fr; gap: 6px; padding: 2px 4px; border-radius: 6px; }
  .entries li.hit { background: color-mix(in srgb, var(--ember) 14%, transparent); }
  .entries .mono { color: var(--muted); font-size: 11.5px; }
  @keyframes land { from { transform: translateY(4px); opacity: .3; } }
</style>
