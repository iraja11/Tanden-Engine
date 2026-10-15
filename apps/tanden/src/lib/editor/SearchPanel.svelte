<script lang="ts">
  import { highlightRanges, searchVault, type SearchHit } from '@tanden/core';
  import { untrack } from 'svelte';
  import { engine } from '../engine.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { notes } from './notes.svelte';
  import { noteName } from './host';

  // Busca do cofre no painel da esquerda, com os operadores do Obsidian.
  let { onopen }: { onopen: (path: string) => void } = $props();

  const KEY = 'tanden.busca';
  let q = $state(load());
  let input = $state<HTMLInputElement>();
  let help = $state(false);
  let debounced = $state(untrack(() => q));
  let timer: ReturnType<typeof setTimeout> | null = null;
  function load(): string {
    try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
  }

  // pedido vindo de fora (clique numa #tag, "buscar" da paleta)
  $effect(() => {
    const s = notes.search;
    if (!s) return;
    untrack(() => {
      // Ctrl+Shift+F sem texto mantém a última busca
      if (s.q || !q) {
        q = s.q;
        debounced = s.q;
      }
      setTimeout(() => input?.focus(), 30);
    });
  });
  $effect(() => {
    const v = q;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      debounced = v;
      try { localStorage.setItem(KEY, v); } catch { /* só nesta sessão */ }
    }, 160);
  });

  const hits = $derived.by((): SearchHit[] => {
    void notes.rev;
    void engine.notes;
    return debounced.trim() ? searchVault(notes.brain, debounced, { limit: 300 }) : [];
  });

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function mark(line: string): string {
    const text = line.length > 240 ? `${line.slice(0, 240)}…` : line;
    let out = '';
    let at = 0;
    for (const [a, b] of highlightRanges(text, debounced)) {
      out += esc(text.slice(at, a)) + `<mark>${esc(text.slice(a, b))}</mark>`;
      at = b;
    }
    return out + esc(text.slice(at));
  }

  function go(path: string, line?: number) {
    onopen(path);
    if (line !== undefined) setTimeout(() => editorBridge.goto(line), 90);
  }

  const EXAMPLES: Array<[string, string]> = [
    ['palavra outra', 'as duas, em qualquer ordem'],
    ['"frase exata"', 'o trecho inteiro'],
    ['-palavra', 'sem essa palavra'],
    ['a OU b', 'uma ou outra'],
    ['#tag', 'notas com a tag (e as filhas)'],
    ['pasta:Projetos', 'caminho contém'],
    ['nome:reunião', 'nome da nota contém'],
    ['[status:feito]', 'propriedade com o valor'],
    ['[prazo]', 'tem a propriedade'],
    ['afazer:', 'tarefas abertas'],
    ['feita:', 'tarefas concluídas'],
    ['/regex/', 'expressão regular'],
  ];
</script>

<div class="search">
  <div class="box">
    <input bind:this={input} bind:value={q} placeholder="Buscar no cofre" aria-label="Buscar no cofre" spellcheck="false"
      onkeydown={(e) => { if (e.key === 'Escape') q = ''; if (e.key === 'Enter' && hits[0]) go(hits[0].path, hits[0].lines[0]?.n); }} />
    <button class="q" class:on={help} onclick={() => (help = !help)} title="Como buscar" aria-label="Como buscar">?</button>
  </div>
  {#if help}
    <div class="help">
      {#each EXAMPLES as [ex, what] (ex)}
        <button onclick={() => { q = `${q.trim()} ${ex}`.trim(); input?.focus(); }}><code>{ex}</code><span>{what}</span></button>
      {/each}
    </div>
  {/if}
  {#if debounced.trim()}
    <p class="count">{hits.length === 300 ? '300+' : hits.length} {hits.length === 1 ? 'nota' : 'notas'}</p>
  {/if}
  <ul>
    {#each hits as h (h.path)}
      <li>
        <button class="name" class:on={h.path === engine.active} onclick={() => go(h.path)} title={h.path}>
          <span>{noteName(h.path)}</span>{#if h.path.includes('/')}<i>{h.path.slice(0, h.path.lastIndexOf('/'))}</i>{/if}
        </button>
        {#each h.lines.slice(0, 3) as l (l.n)}
          <button class="line" onclick={() => go(h.path, l.n)}>{@html mark(l.text)}</button>
        {/each}
      </li>
    {:else}
      {#if debounced.trim()}
        <li class="empty">Nada encontrado. <button class="mk" onclick={() => notes.create('', debounced.trim().replace(/[#[\]"/:]/g, ' ').trim())}>Criar nota "{debounced.trim()}"</button></li>
      {:else}
        <li class="empty">Digite para buscar no texto de todas as notas. O <b>?</b> mostra os filtros (tags, pastas, propriedades, tarefas).</li>
      {/if}
    {/each}
  </ul>
</div>

<style>
  .search { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .box { display: flex; gap: 4px; margin: 0 12px 8px; }
  .box input { flex: 1; min-width: 0; background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 6px 9px; font: 12.5px var(--f-body); outline: none; }
  .box input:focus { border-color: var(--ember); }
  .q { width: 28px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--muted); font: 600 12px var(--f-mono); }
  .q.on, .q:hover { color: var(--ember); border-color: var(--ember); }
  .help { margin: 0 12px 10px; display: grid; gap: 2px; padding: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--void); }
  .help button { display: flex; gap: 8px; align-items: baseline; text-align: left; border: 0; background: none; padding: 3px 6px; border-radius: 6px; color: var(--muted); font-size: 12px; }
  .help button:hover { background: var(--surface-2); color: var(--ink); }
  .help code { font: 11.5px var(--f-mono); color: var(--ember-soft); white-space: nowrap; }
  .count { margin: 0 16px 6px; font: 11px var(--f-mono); color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0 8px 16px; overflow-y: auto; flex: 1; min-height: 0; }
  li { margin-bottom: 6px; }
  .name { display: flex; align-items: baseline; gap: 6px; width: 100%; border: 0; background: none; padding: 5px 8px; border-radius: 8px; text-align: left; color: var(--ink); font: 600 13px var(--f-body); }
  .name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name i { font: 10.5px var(--f-mono); font-style: normal; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name:hover, .name.on { background: var(--surface-2); }
  .name.on span { color: var(--ember); }
  .line { display: block; width: 100%; border: 0; background: none; text-align: left; padding: 3px 8px 3px 16px; border-radius: 6px; color: var(--muted); font: 12px/1.45 var(--f-body);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .line:hover { background: var(--surface-2); color: var(--ink); }
  .line :global(mark) { background: color-mix(in srgb, var(--ember) 30%, transparent); color: var(--ink); border-radius: 3px; padding: 0 1px; }
  .empty { color: var(--muted); font-size: 12.5px; line-height: 1.5; padding: 4px 8px; }
  .mk { display: block; margin-top: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ember); border-radius: 8px; padding: 4px 10px; font-size: 12px; }
</style>
