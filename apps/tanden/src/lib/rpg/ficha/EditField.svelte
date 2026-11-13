<script lang="ts">
  // Campo da ficha: rótulo pequeno em cima, valor que vira campo ao clicar.
  let { label, value, placeholder = '—', auto = '', options = [], mono = false, wide = false, onsave }: {
    label: string;
    value: string;
    placeholder?: string;
    /** valor calculado, mostrado apagado quando o campo está vazio */
    auto?: string;
    /** sugestões (datalist) */
    options?: readonly string[];
    mono?: boolean;
    wide?: boolean;
    onsave: (v: string) => void;
  } = $props();

  let editing = $state(false);
  let draft = $state('');
  const id = `ef-${Math.random().toString(36).slice(2, 9)}`;

  function start() {
    draft = value;
    editing = true;
  }
  function save() {
    if (!editing) return;
    editing = false;
    if (draft.trim() !== value.trim()) onsave(draft.trim());
  }
</script>

<div class="ef" class:wide>
  <span class="ef-l">{label}</span>
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field ef-in" class:mono bind:value={draft} autofocus list={options.length ? id : undefined} aria-label={label}
      onblur={save} onkeydown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') editing = false; }} />
    {#if options.length}<datalist {id}>{#each options as o (o)}<option value={o}></option>{/each}</datalist>{/if}
  {:else}
    <button class="ef-v" class:mono class:empty={!value} onclick={start} title={`Editar ${label.toLowerCase()}`}>
      {#if value}{value}{:else if auto}<span class="ef-auto">{auto}</span>{:else}<span class="ef-ph">{placeholder}</span>{/if}
    </button>
  {/if}
</div>

<style>
  .ef { display: grid; gap: 2px; min-width: 0; }
  .ef.wide { grid-column: 1 / -1; }
  .ef-l { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .ef-v { text-align: left; border: 0; border-bottom: 1px solid var(--line); background: none; padding: 3px 0 4px; color: var(--ink);
    font: 500 14px var(--f-body); min-height: 27px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 0;
    transition: border-color var(--dur); }
  .ef-v:hover { border-bottom-color: var(--ember); }
  .ef-v.mono { font-family: var(--f-mono); font-size: 13px; }
  .ef-auto { color: var(--silver); }
  .ef-auto::after { content: ' · auto'; color: var(--muted); font-size: 11px; }
  .ef-ph { color: var(--muted); opacity: .6; }
  .ef-in { padding: 3px 8px !important; font-size: 14px !important; }
</style>
