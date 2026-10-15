<script lang="ts">
  import { commands, comboOf } from '../commands.svelte';
  import { fold } from '../editor/host';
  import { sound } from '../sound.svelte';

  // Atalhos: cada comando da paleta pode ter um ou mais atalhos, trocados aqui.
  let q = $state('');
  /** comando gravando um atalho novo */
  let recording = $state<string | null>(null);
  let warn = $state('');

  const rows = $derived.by(() => {
    const words = fold(q.trim()).split(/\s+/).filter(Boolean);
    return [...commands.list]
      .filter((c) => !words.length || words.every((w) => fold(`${c.label} ${c.keys ?? ''} ${commands.hotkeysOf(c.id).join(' ')}`).includes(w)))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  });

  function record(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      recording = null;
      return;
    }
    const combo = comboOf(e);
    if (!combo) return;
    const id = recording;
    recording = null;
    const others = commands.using(combo).filter((c) => c.id !== id);
    commands.setHotkeys(id, [...commands.hotkeysOf(id), combo]);
    // o atalho só pode ser de um comando: sai dos outros
    for (const o of others) commands.setHotkeys(o.id, commands.hotkeysOf(o.id).filter((k) => k !== combo));
    warn = others.length ? `${combo} saiu de "${others.map((o) => o.label).join('", "')}".` : '';
    sound.play('complete');
  }

  function drop(id: string, combo: string) {
    commands.setHotkeys(id, commands.hotkeysOf(id).filter((k) => k !== combo));
    sound.play('tick');
  }
</script>

<svelte:window onkeydowncapture={record} />

<section class="hk">
  <input class="find" bind:value={q} placeholder="Buscar comando ou atalho" spellcheck="false" aria-label="Buscar comando" />
  {#if warn}<p class="warn">{warn}</p>{/if}
  <ul>
    {#each rows as c (c.id)}
      <li class:custom={commands.isCustom(c.id)}>
        <span class="lb">{c.label}</span>
        <span class="keys">
          {#each commands.hotkeysOf(c.id) as k (k)}
            <button class="kbd" onclick={() => drop(c.id, k)} title="Tirar este atalho">{k}<i>×</i></button>
          {/each}
          {#if recording === c.id}
            <span class="kbd rec">aperte as teclas… <small>Esc cancela</small></span>
          {:else}
            <button class="add" onclick={() => { recording = c.id; warn = ''; }} title="Gravar um atalho" aria-label="Gravar um atalho para {c.label}">+</button>
          {/if}
          {#if commands.isCustom(c.id)}
            <button class="add" onclick={() => commands.reset(c.id)} title="Voltar ao atalho padrão" aria-label="Voltar ao padrão">↺</button>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
  <footer>
    <button class="link" onclick={() => { commands.reset(); sound.play('tick'); }}>Todos ao padrão</button>
    <small>Salvo neste aparelho</small>
  </footer>
</section>

<style>
  .hk { display: grid; gap: 8px; }
  .find { border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); color: var(--ink); font: 13px var(--f-body); padding: 7px 10px; outline: 0; }
  .find:focus { border-color: var(--ember); }
  .warn { margin: 0; font-size: 12px; color: var(--ember-soft); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; max-height: 46vh; overflow-y: auto; }
  li { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 8px; }
  li:hover { background: var(--surface-2); }
  .lb { flex: 1; min-width: 0; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  li.custom .lb::after { content: ' •'; color: var(--ember); }
  .keys { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; }
  .kbd { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 6px; padding: 2px 6px;
    font: 10.5px var(--f-mono); white-space: nowrap; }
  .kbd i { font-style: normal; color: var(--muted); display: none; }
  button.kbd:hover { border-color: var(--crit); }
  button.kbd:hover i { display: inline; color: var(--crit); }
  .rec { border-color: var(--ember); color: var(--ember); animation: blink 1s infinite; }
  .rec small { color: var(--muted); }
  @keyframes blink { 50% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ember) 20%, transparent); } }
  .add { width: 22px; height: 22px; padding: 0; border: 1px dashed var(--line); background: none; color: var(--muted); border-radius: 6px; font-size: 13px; line-height: 1; }
  .add:hover { color: var(--ember); border-color: var(--ember); }
  footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 10px; }
  footer small { font: 11px var(--f-mono); color: var(--muted); }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); text-decoration: underline dotted; font-size: 12px; }
</style>
