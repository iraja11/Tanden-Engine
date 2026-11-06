<script lang="ts">
  import { SorteError, drawFrom, drawNumbers, parseOptions, shuffle, splitTeams } from '@tanden/core';
  import { files } from '../files/files.svelte';
  import { sound } from '../sound.svelte';
  import { sorte } from './sorte.svelte';

  // Sorteio: tirar nomes de uma lista, dividir em times, embaralhar a ordem ou
  // sortear números (rifa, mega-sena, amigo da vez).

  type Mode = 'nomes' | 'times' | 'ordem' | 'numeros';
  const MODES: Array<[Mode, string]> = [['nomes', 'Nomes'], ['times', 'Times'], ['ordem', 'Ordem'], ['numeros', 'Números']];

  let mode = $state<Mode>('nomes');
  let list = $state('');
  let howMany = $state(1);
  let teams = $state(2);
  let min = $state(1);
  let max = $state(60);
  let count = $state(6);
  let unique = $state(true);
  let sorted = $state(false);
  let error = $state('');
  let result = $state<{ seq: number; groups: string[][]; flat: boolean } | null>(null);
  let seq = 0;

  const names = $derived(parseOptions(sorte.draw).map((o) => o.label));

  function pickList(name: string) {
    list = name;
    const l = sorte.list(name);
    if (l) sorte.draw = l.items.join('\n');
    sorte.save();
  }

  function run() {
    error = '';
    try {
      let groups: string[][];
      let flat = true;
      let text: string;
      if (mode === 'numeros') {
        let ns = drawNumbers(min, max, count, { unique });
        if (sorted) ns = [...ns].sort((a, b) => a - b);
        groups = [ns.map((n) => n.toLocaleString('pt-BR'))];
        text = groups[0]!.join(', ');
      } else {
        if (!names.length) throw new SorteError('Escreva os nomes, um por linha.');
        if (mode === 'nomes') {
          groups = [drawFrom(names, howMany)];
          text = groups[0]!.join(', ');
        } else if (mode === 'ordem') {
          groups = [shuffle(names)];
          text = groups[0]!.map((n, i) => `${i + 1}. ${n}`).join(' ');
        } else {
          groups = splitTeams(names, teams);
          flat = false;
          text = groups.map((g, i) => `Time ${i + 1}: ${g.join(', ')}`).join(' · ');
        }
      }
      result = { seq: ++seq, groups, flat };
      sound.play('complete');
      sorte.record('sorteio', text, mode === 'numeros' ? `${min}–${max}` : list || undefined);
    } catch (e) {
      error = e instanceof SorteError ? e.message : String(e);
      sound.play('error');
    }
  }

  function asText(): string {
    if (!result) return '';
    if (!result.flat) return result.groups.map((g, i) => `Time ${i + 1}\n${g.map((n) => `- ${n}`).join('\n')}`).join('\n\n');
    return mode === 'ordem' ? result.groups[0]!.map((n, i) => `${i + 1}. ${n}`).join('\n') : result.groups[0]!.join(mode === 'numeros' ? ', ' : '\n');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText());
      files.say('Resultado copiado.');
    } catch {
      files.say('Não consegui copiar.', { error: true });
    }
  }
</script>

<div class="draw-tool">
  <div class="cfg box">
    <div class="modes" role="tablist">
      {#each MODES as [id, label] (id)}
        <button role="tab" aria-selected={mode === id} class="chip" class:on={mode === id} onclick={() => { mode = id; error = ''; result = null; }}>{label}</button>
      {/each}
    </div>

    {#if mode === 'numeros'}
      <div class="nums">
        <label>De<input class="field" type="number" bind:value={min} /></label>
        <label>Até<input class="field" type="number" bind:value={max} /></label>
        <label>Quantos<input class="field" type="number" min="1" bind:value={count} /></label>
      </div>
      <label class="check"><input type="checkbox" bind:checked={unique} /> Sem repetir</label>
      <label class="check"><input type="checkbox" bind:checked={sorted} /> Em ordem crescente</label>
      <div class="chips presets">
        <button class="chip" onclick={() => { min = 1; max = 60; count = 6; unique = true; sorted = true; }}>Mega-Sena</button>
        <button class="chip" onclick={() => { min = 1; max = 25; count = 15; unique = true; sorted = true; }}>Lotofácil</button>
        <button class="chip" onclick={() => { min = 1; max = 100; count = 1; }}>1 a 100</button>
      </div>
    {:else}
      <div class="lh">
        <h3>Nomes <span class="dim">{names.length}</span></h3>
        {#if sorte.lists.length}
          <select class="field" value={list} onchange={(e) => pickList((e.currentTarget as HTMLSelectElement).value)} aria-label="Lista salva">
            <option value="">Texto livre</option>
            {#each sorte.lists as l (l.name)}<option value={l.name}>{l.name}</option>{/each}
          </select>
        {/if}
      </div>
      <textarea class="field" rows="9" bind:value={sorte.draw} oninput={() => { list = ''; sorte.save(); }} placeholder="Ana&#10;Bia&#10;Caio&#10;…" spellcheck="false" aria-label="Nomes"></textarea>
      {#if mode === 'nomes'}
        <label class="inline">Tirar <input class="field n" type="number" min="1" max={Math.max(1, names.length)} bind:value={howMany} /> {howMany === 1 ? 'nome' : 'nomes'}</label>
      {:else if mode === 'times'}
        <label class="inline">Dividir em <input class="field n" type="number" min="2" bind:value={teams} /> times</label>
      {/if}
    {/if}

    {#if error}<p class="err small">{error}</p>{/if}
    <button class="primary go" onclick={run}>Sortear</button>
  </div>

  <div class="out" aria-live="polite">
    {#if result}
      {#key result.seq}
        {#if result.flat}
          <ol class="flat" class:numbers={mode === 'numeros'} class:ordered={mode === 'ordem'}>
            {#each result.groups[0]! as n, i (i)}
              <li style:animation-delay="{Math.min(i, 30) * 70}ms">{n}</li>
            {/each}
          </ol>
        {:else}
          <div class="teams">
            {#each result.groups as g, t (t)}
              <div class="team box" style:animation-delay="{t * 120}ms">
                <h3>Time {t + 1} <span class="dim">· {g.length}</span></h3>
                <ul>{#each g as n, i (i)}<li style:animation-delay="{t * 120 + i * 60}ms">{n}</li>{/each}</ul>
              </div>
            {/each}
          </div>
        {/if}
      {/key}
      <div class="oa">
        <button class="ghost sm" onclick={run}>Sortear de novo</button>
        <button class="ghost sm" onclick={copy}>Copiar</button>
      </div>
    {:else}
      <p class="dim empty">O resultado aparece aqui.</p>
    {/if}
  </div>
</div>

<style>
  .draw-tool { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 24px; align-items: start; }
  .cfg { display: grid; gap: 10px; }
  .modes { display: flex; flex-wrap: wrap; gap: 6px; }
  .modes .chip { font-family: var(--f-body); }
  .lh { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .lh h3 { margin: 0; }
  .lh select { max-width: 150px; font-size: 13px; padding: 4px 8px; }
  textarea { resize: vertical; font: 13.5px/1.5 var(--f-mono) !important; width: 100%; box-sizing: border-box; }
  .nums { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .nums label { display: grid; gap: 4px; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .nums input { width: 100%; box-sizing: border-box; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
  .inline { display: flex; gap: 8px; align-items: center; font-size: 13.5px; }
  .field.n { width: 70px; }
  .presets { margin-top: 2px; }
  .err { color: var(--crit); margin: 0; }
  .go { justify-self: stretch; padding: 9px 14px; }

  .out { min-width: 0; display: grid; gap: 14px; align-content: start; }
  .empty { margin: 8vh 0 0; text-align: center; }
  .flat { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
  .flat li { border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 10px 16px;
    font: 600 20px/1.2 var(--f-display); animation: drop .42s var(--spring) both; overflow-wrap: anywhere; }
  .flat.ordered { flex-direction: column; counter-reset: n; }
  .flat.ordered li { counter-increment: n; font-size: 17px; }
  .flat.ordered li::before { content: counter(n) '.'; color: var(--muted); margin-right: 10px; font-family: var(--f-mono); font-size: 14px; }
  .flat.numbers li { width: 52px; height: 52px; padding: 0; border-radius: 50%; display: grid; place-items: center; font-size: 18px;
    background: color-mix(in srgb, var(--ember) 14%, var(--surface)); border-color: color-mix(in srgb, var(--ember) 45%, transparent); }
  .teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
  .team { animation: drop .42s var(--spring) both; }
  .team h3 { margin: 0 0 6px; }
  .team ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .team li { font-size: 15px; animation: drop .35s var(--spring) both; }
  @keyframes drop { from { opacity: 0; translate: 0 -10px; scale: .9; } }
  .oa { display: flex; gap: 8px; flex-wrap: wrap; }

  @media (max-width: 900px) {
    .draw-tool { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .flat li, .team, .team li { animation: none; }
  }
</style>
