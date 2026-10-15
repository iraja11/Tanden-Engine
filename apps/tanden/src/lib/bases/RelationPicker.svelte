<script lang="ts">
  import { bases } from './bases.svelte';

  // Liga notas: escolhe entre as notas da pasta alvo (ou de todo o cofre).
  let { target, selected, multi = true, onpick, oncreate }: {
    /** pasta ou nota de banco; vazio = todas as notas */
    target?: string;
    /** nomes/caminhos já ligados */
    selected: string[];
    multi?: boolean;
    onpick: (targets: string[]) => void;
    /** cria uma nota nova na pasta alvo e liga */
    oncreate?: (name: string, folder: string | null) => void;
  } = $props();

  let query = $state('');
  let input = $state<HTMLInputElement>();
  $effect(() => { input?.focus(); });

  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const folder = $derived.by(() => {
    void bases.rev;
    if (!target) return null;
    const t = target.replace(/^\[\[|\]\]$/g, '').replace(/\.md$/, '');
    // alvo é uma nota de banco: usa a pasta das linhas dela
    const db = bases.databases.find((d) => d.name.toLowerCase() === t.toLowerCase() || d.path === `${t}.md`);
    if (db) {
      const b = bases.block(db.path, 0);
      if (b) return bases.rowsFolder(b.def, db.path);
    }
    return t;
  });

  const pool = $derived(bases.index.notes.filter((n) => !folder || n.folder === folder || n.folder.startsWith(`${folder}/`) || (!bases.index.notes.some((x) => x.folder.startsWith(folder)) && fold(n.folder).includes(fold(folder)))));
  const isSel = (name: string, path: string) => selected.some((s) => fold(s) === fold(name) || fold(s) === fold(path.replace(/\.md$/, '')));
  const shown = $derived(pool.filter((n) => fold(n.name).includes(fold(query.trim()))).slice(0, 60));

  function toggle(name: string, path: string) {
    const on = isSel(name, path);
    if (on) onpick(selected.filter((s) => fold(s) !== fold(name) && fold(s) !== fold(path.replace(/\.md$/, ''))));
    else onpick(multi ? [...selected, name] : [name]);
  }
</script>

<div class="rel">
  <input bind:this={input} class="db-input" bind:value={query} placeholder={folder ? `Buscar em ${folder.split('/').pop()}` : 'Buscar nota'}
    onkeydown={(e) => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); toggle(shown[0].name, shown[0].path); } }} />
  {#if selected.length}
    <h4>Ligadas</h4>
    {#each selected as s (s)}
      <button class="db-item sel" onclick={() => onpick(selected.filter((x) => x !== s))}><span class="ic">↗</span>{s.split('/').pop()}<span class="r">×</span></button>
    {/each}
    <hr />
  {/if}
  {#each shown as n (n.path)}
    {#if !isSel(n.name, n.path)}
      <button class="db-item" onclick={() => toggle(n.name, n.path)}><span class="ic">▫</span><span class="nm">{n.name}</span>{#if n.folder && !folder}<span class="r">{n.folder}</span>{/if}</button>
    {/if}
  {/each}
  {#if !shown.length}<p class="db-hint">Nenhuma nota{folder ? ` em ${folder}` : ''}.</p>{/if}
  {#if oncreate && query.trim() && !pool.some((n) => fold(n.name) === fold(query.trim()))}
    <button class="db-item" onclick={() => { oncreate(query.trim(), folder); query = ''; }}><span class="ic">+</span>Criar "{query.trim()}"</button>
  {/if}
</div>

<style>
  .rel { display: grid; gap: 1px; min-width: 260px; }
  .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
