<script lang="ts">
  import { name, snippets } from '../snippets.svelte';
  import { sound } from '../sound.svelte';

  // Snippets de CSS: liga, desliga, cria e edita com prévia ao vivo.
  let editing = $state<string | null>(null);
  let draft = $state('');
  let saved = $state('');
  let newName = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function edit(path: string) {
    editing = path;
    draft = saved = await snippets.read(path);
  }

  // grava sozinho meio segundo depois de parar de digitar (com o snippet ligado, a tela muda junto)
  $effect(() => {
    const d = draft;
    const p = editing;
    if (!p || d === saved) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saved = d;
      void snippets.save(p, d);
    }, 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  async function create() {
    const p = await snippets.create(newName || 'meu-estilo');
    newName = '';
    sound.play('create');
    await edit(p);
  }

  async function remove(p: string) {
    if (!confirm(`Apagar o snippet "${name(p)}"?`)) return;
    if (editing === p) editing = null;
    await snippets.remove(p);
  }

  function tab(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const t = e.currentTarget as HTMLTextAreaElement;
    const at = t.selectionStart;
    draft = `${draft.slice(0, at)}  ${draft.slice(t.selectionEnd)}`;
    requestAnimationFrame(() => t.setSelectionRange(at + 2, at + 2));
  }
</script>

<section class="sn">
  <p class="hint">Arquivos <code>.css</code> em <code>Snippets/</code> (vão junto no sync) ou em <code>.obsidian/snippets/</code>. Cada aparelho escolhe quais ficam ligados.</p>
  {#if snippets.list.length}
    <ul>
      {#each snippets.list as p (p)}
        <li class:on={editing === p}>
          <label class="switch">
            <input type="checkbox" checked={snippets.on.includes(p)} onchange={(e) => { void snippets.toggle(p, e.currentTarget.checked); sound.play('tick'); }} />
            <span>{name(p)} {#if p.startsWith('.obsidian/')}<small>Obsidian</small>{/if}</span>
          </label>
          <button class="mini" onclick={() => (editing === p ? (editing = null) : edit(p))}>{editing === p ? 'Fechar' : 'Editar'}</button>
          <button class="mini danger" onclick={() => remove(p)} aria-label="Apagar {name(p)}">×</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">Nenhum snippet ainda.</p>
  {/if}

  {#if editing}
    <textarea bind:value={draft} onkeydown={tab} spellcheck="false" aria-label="CSS de {name(editing)}"></textarea>
    <p class="hint">{draft === saved ? 'Salvo.' : 'Salvando…'} {snippets.on.includes(editing) ? 'A tela já mostra o resultado.' : 'Ligue o snippet para ver o resultado.'}</p>
  {/if}

  <div class="new">
    <input bind:value={newName} placeholder="nome-do-snippet" spellcheck="false" onkeydown={(e) => e.key === 'Enter' && create()} aria-label="Nome do snippet novo" />
    <button onclick={create}>+ Novo snippet</button>
  </div>
  <footer>
    <button class="link" onclick={() => snippets.reload()}>Recarregar</button>
    {#if snippets.on.length}<button class="link" onclick={() => snippets.allOff()}>Desligar todos</button>{/if}
  </footer>
  {#if snippets.error}<p class="hint err">{snippets.error}</p>{/if}
</section>

<style>
  .sn { display: grid; gap: 10px; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
  .hint.err { color: var(--crit); }
  code { font: 11px var(--f-mono); color: var(--ink); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 8px; }
  li.on { background: var(--surface-2); }
  .switch { flex: 1; min-width: 0; display: flex; align-items: center; gap: 9px; font-size: 13px; cursor: pointer; }
  .switch input { accent-color: var(--ember); }
  .switch small { font: 10px var(--f-mono); color: var(--muted); border: 1px solid var(--line); border-radius: 5px; padding: 0 4px; }
  .mini { border: 1px solid var(--line); background: none; color: var(--muted); border-radius: 7px; padding: 2px 8px; font-size: 11.5px; }
  .mini:hover { color: var(--ember); border-color: var(--ember); }
  .mini.danger:hover { color: var(--crit); border-color: var(--crit); }
  textarea { min-height: 180px; resize: vertical; border: 1px solid var(--line); border-radius: 10px; background: var(--void); color: var(--ink);
    font: 12px/1.5 var(--f-mono); padding: 10px; outline: 0; tab-size: 2; }
  textarea:focus { border-color: var(--ember); }
  .new { display: flex; gap: 6px; }
  .new input { flex: 1; min-width: 0; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); color: var(--ink); font: 12px var(--f-mono); padding: 6px 9px; outline: 0; }
  .new input:focus { border-color: var(--ember); }
  .new button { border: 1px solid var(--ember); background: var(--ember); color: var(--on-ember); border-radius: 9px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
  footer { display: flex; gap: 14px; border-top: 1px solid var(--line); padding-top: 10px; }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); text-decoration: underline dotted; font-size: 12px; }
</style>
