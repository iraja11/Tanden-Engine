<script lang="ts">
  import { engine } from '../engine.svelte';
  import { hhmm, mesa, plainDetail } from './mesa.svelte';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const session = $derived.by(() => {
    void mesa.rev;
    const p = mesa.sessionPath;
    return p && engine.vault.has(p) ? { path: p, name: mesa.nameOf(p) } : null;
  });

  function again(e: (typeof mesa.log)[number]) {
    if (e.kind === 'tabela') mesa.rollTable(e.label);
    else mesa.roll(e.formula, { who: e.who || undefined, label: e.label || undefined, from: e.from });
  }
</script>

<div class="log">
  <header>
    <h2>Histórico</h2>
    {#if mesa.log.length}<button class="icon" onclick={() => { if (confirm('Limpar o histórico deste aparelho? O registro das sessões fica.')) mesa.clearLog(); }} title="Limpar histórico" aria-label="Limpar histórico">⌫</button>{/if}
  </header>
  {#if session}
    <div class="rec">
      <label><input type="checkbox" checked={mesa.recording} onchange={(e) => { mesa.recording = (e.currentTarget as HTMLInputElement).checked; mesa.save(); }} />
        Anotar na <button class="lnk" onclick={() => onOpenNote(session.path)}>{session.name}</button></label>
      <button class="icon" onclick={() => mesa.setSession(null)} title="Fechar a sessão (parar de anotar)" aria-label="Fechar sessão">✕</button>
    </div>
  {/if}
  <ol>
    {#each mesa.log as e (e.id)}
      <li class:crit={e.critical === 'max'} class:fumble={e.critical === 'min'}>
        <button onclick={() => again(e)} title="Rolar de novo">
          <span class="top">
            <span class="who">{#if e.who}<b>{e.who}</b> · {/if}{e.label || e.formula}</span>
            <time>{hhmm(e.at)}</time>
          </span>
          <span class="val" class:txt={typeof e.total !== 'number'}>{e.total}</span>
          <span class="det">{e.kind === 'tabela' ? e.detail : e.label ? `${e.formula} · ${plainDetail(e.detail)}` : plainDetail(e.detail)}</span>
        </button>
      </li>
    {:else}
      <li class="none">As rolagens aparecem aqui. Clique numa para rolar de novo.</li>
    {/each}
  </ol>
</div>

<style>
  .log { display: flex; flex-direction: column; min-height: 0; height: 100%; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0 0 8px; min-height: 28px; }
  .rec { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; padding: 6px 8px; border-radius: 10px;
    background: color-mix(in srgb, var(--ok) 10%, transparent); border: 1px solid color-mix(in srgb, var(--ok) 35%, transparent); font-size: 12.5px; }
  .rec label { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .lnk { border: 0; background: none; padding: 0; color: var(--ok); font: inherit; text-decoration: underline dotted; }
  ol { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; min-height: 0; display: grid; gap: 6px; align-content: start; }
  li button { width: 100%; text-align: left; display: grid; gap: 2px; border: 1px solid var(--line); background: var(--surface); border-radius: 11px; padding: 7px 10px; }
  li button:hover { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  li.crit button { border-color: var(--ember); box-shadow: inset 3px 0 0 var(--ember); }
  li.fumble button { box-shadow: inset 3px 0 0 var(--crit); }
  .top { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--muted); }
  .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .who b { color: var(--ink); font-weight: 600; }
  time { font: 10.5px var(--f-mono); flex: none; }
  .val { font: 700 20px/1.2 var(--f-display); font-variant-numeric: tabular-nums; }
  .val.txt { font: 500 13.5px/1.35 var(--f-body); }
  li.crit .val { color: var(--ember); }
  li.fumble .val { color: var(--crit); }
  .det { font: 11px var(--f-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .none { color: var(--muted); font-size: 12.5px; padding: 8px 2px; }
</style>
