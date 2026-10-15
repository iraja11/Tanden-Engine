<script lang="ts">
  import { READ_STATUS, bookProgress, readingTime, type ReadStatus } from '@tanden/core';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { biblioteca } from './biblioteca.svelte';
  import Cover from './Cover.svelte';

  /** Painel com tudo de um livro: dados, status, estantes, marcadores e ações. */
  let { path, onclose }: { path: string; onclose: () => void } = $props();

  const book = $derived(biblioteca.books.find((b) => b.path === path) ?? null);
  const annots = $derived.by(() => {
    void biblioteca.rev;
    return engine.annots.list(path).length;
  });
  const allShelves = $derived.by(() => {
    void biblioteca.rev;
    return engine.library.shelves();
  });
  const allTags = $derived.by(() => {
    void biblioteca.rev;
    return engine.library.tags();
  });
  let shelfInput = $state('');
  let tagInput = $state('');

  const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  function field(f: 'title' | 'author', v: string) {
    if (!book) return;
    const auto = f === 'title' ? biblioteca.title({ ...book, title: undefined }) : biblioteca.author({ ...book, author: undefined });
    engine.library.update(path, { [f]: v.trim() === auto ? undefined : v.trim() });
  }

  function addTo(kind: 'shelves' | 'tags', v: string) {
    const x = v.trim().replace(/^#/, '');
    if (!book || !x) return;
    engine.library.update(path, { [kind]: [...book[kind], x] });
  }

  function removeFrom(kind: 'shelves' | 'tags', v: string) {
    if (!book) return;
    engine.library.update(path, { [kind]: book[kind].filter((s) => s !== v) });
  }

  const STATUSES = Object.entries(READ_STATUS) as Array<[ReadStatus, string]>;
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input')) onclose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>
<aside class="details" aria-label="Detalhes do livro">
  {#if book}
    <header>
      <div class="cv"><Cover {book} /></div>
      <div class="head">
        <input class="title" value={biblioteca.title(book)} onchange={(e) => field('title', e.currentTarget.value)} aria-label="Título" />
        <input class="author" value={biblioteca.author(book)} placeholder="Autor" onchange={(e) => field('author', e.currentTarget.value)} aria-label="Autor" />
        <small>{path}</small>
        <button class="pri" onclick={() => biblioteca.open(path)}>{book.page && book.page > 1 ? `Continuar na p. ${book.page}` : 'Ler'}</button>
      </div>
      <button class="x" onclick={onclose} aria-label="Fechar">×</button>
    </header>

    <section>
      <h4>Status</h4>
      <div class="seg" role="radiogroup" aria-label="Status de leitura">
        {#each STATUSES as [id, label] (id)}
          <button role="radio" aria-checked={book.status === id} class:on={book.status === id}
            onclick={() => engine.library.update(path, { status: book.status === id ? undefined : id })}>{label}</button>
        {/each}
      </div>
      <div class="row">
        <div class="stars" role="radiogroup" aria-label="Nota">
          {#each [1, 2, 3, 4, 5] as n (n)}
            <button role="radio" aria-checked={book.rating === n} class:on={(book.rating ?? 0) >= n} aria-label="{n} estrela{n > 1 ? 's' : ''}"
              onclick={() => engine.library.update(path, { rating: book.rating === n ? undefined : n })}>★</button>
          {/each}
        </div>
        <button class="fav" class:on={book.favorite} onclick={() => engine.library.update(path, { favorite: !book.favorite })} aria-pressed={!!book.favorite}>
          {book.favorite ? '♥ Favorito' : '♡ Favoritar'}
        </button>
      </div>
    </section>

    <section>
      <h4>Progresso</h4>
      <div class="bar"><i style:width="{Math.round(bookProgress(book) * 100)}%"></i></div>
      <dl>
        <dt>Onde parou</dt><dd>{book.page ? `p. ${book.page}${book.pages ? ` de ${book.pages}` : ''}` : 'não começou'}{#if book.pageDevice && book.pageDevice !== engine.vault.deviceId}<small> · em outro aparelho</small>{/if}</dd>
        <dt>Lido</dt><dd>{Math.round(bookProgress(book) * 100)}%</dd>
        {#if book.readMs}<dt>Tempo de leitura</dt><dd>{readingTime(book.readMs)}</dd>{/if}
        {#if book.started}<dt>Começou</dt><dd>{day(book.started)}</dd>{/if}
        {#if book.finished}<dt>Terminou</dt><dd>{day(book.finished)}</dd>{/if}
        {#if book.added}<dt>Adicionado</dt><dd>{day(book.added)}</dd>{/if}
        <dt>Anotações</dt><dd>{annots}</dd>
      </dl>
    </section>

    <section>
      <h4>Estantes</h4>
      <div class="chips">
        {#each book.shelves as s (s)}<span class="chip">{s}<button onclick={() => removeFrom('shelves', s)} aria-label="Tirar de {s}">×</button></span>{/each}
        <form onsubmit={(e) => { e.preventDefault(); addTo('shelves', shelfInput); shelfInput = ''; }}>
          <input bind:value={shelfInput} list="bib-shelves" placeholder="+ estante" aria-label="Adicionar estante" />
        </form>
      </div>
      <datalist id="bib-shelves">{#each allShelves.filter((s) => !book.shelves.includes(s)) as s (s)}<option value={s}></option>{/each}</datalist>
      <h4>Etiquetas</h4>
      <div class="chips">
        {#each book.tags as t (t)}<span class="chip tag">#{t}<button onclick={() => removeFrom('tags', t)} aria-label="Tirar #{t}">×</button></span>{/each}
        <form onsubmit={(e) => { e.preventDefault(); addTo('tags', tagInput); tagInput = ''; }}>
          <input bind:value={tagInput} list="bib-tags" placeholder="+ etiqueta" aria-label="Adicionar etiqueta" />
        </form>
      </div>
      <datalist id="bib-tags">{#each allTags.filter((t) => !book.tags.includes(t)) as t (t)}<option value={t}></option>{/each}</datalist>
    </section>

    {#if book.bookmarks.length}
      <section>
        <h4>Marcadores</h4>
        <ul class="marks">
          {#each book.bookmarks as m (m.id)}
            <li><button onclick={() => biblioteca.open(path, m.page)}><b>p. {m.page}</b>{m.label || 'Sem nome'}</button></li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="acts">
      <button onclick={() => biblioteca.bookNote(path)}>Nota do livro<small>Livros/, com propriedades</small></button>
      <button onclick={() => files.annotationsNote(path)} disabled={!annots}>Nota com as anotações</button>
      <button onclick={() => void files.exportAnnotated(path)} disabled={!annots}>PDF com as anotações</button>
    </section>
  {/if}
</aside>

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: var(--scrim); animation: fade .15s; }
  .details { position: fixed; z-index: 61; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); overflow-y: auto; background: var(--surface);
    border-left: 1px solid var(--line); box-shadow: -30px 0 60px -30px #000; padding: 16px 16px 30px; display: grid; gap: 18px; align-content: start;
    animation: slide .22s cubic-bezier(.2, .8, .2, 1); }
  header { display: flex; gap: 14px; position: relative; }
  .cv { width: 104px; flex: none; }
  .head { display: grid; gap: 6px; align-content: start; min-width: 0; flex: 1; padding-right: 22px; }
  .head input { border: 1px solid transparent; background: none; color: var(--ink); border-radius: 7px; padding: 3px 6px; margin-left: -6px; font: inherit; width: 100%; }
  .head input:hover { border-color: var(--line); }
  .head input:focus { outline: none; border-color: var(--ember); background: var(--void); }
  .title { font: 600 16px/1.3 var(--f-display) !important; }
  .author { color: var(--silver) !important; font-size: 13px !important; }
  .head small { color: var(--muted); font: 10.5px var(--f-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .head .pri { justify-self: start; margin-top: 4px; }
  .x { position: absolute; top: -4px; right: -4px; border: 0; background: none; font-size: 20px; color: var(--muted); padding: 2px 8px; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 6px 11px; font-size: 12.5px; color: var(--ink); }
  button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  button:disabled { opacity: .45; }
  .pri { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }
  section { display: grid; gap: 8px; }
  h4 { margin: 4px 0 0; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .seg button { padding: 7px 4px; }
  .seg button.on { border-color: var(--ember); color: var(--ember); background: color-mix(in srgb, var(--ember) 12%, var(--surface-2)); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .stars { display: flex; }
  .stars button { border: 0; background: none; font-size: 20px; padding: 0 3px; color: var(--line); }
  .stars button.on { color: var(--ember); text-shadow: 0 0 10px var(--ember-glow); }
  .fav.on { color: var(--ember); border-color: var(--ember); }
  .bar { height: 6px; border-radius: 6px; background: var(--surface-2); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--ember); box-shadow: 0 0 10px var(--ember-glow); border-radius: 6px; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; margin: 4px 0 0; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  dd small { color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 2px; padding: 3px 4px 3px 10px; border-radius: 20px; font-size: 12.5px;
    background: color-mix(in srgb, var(--ember) 14%, var(--surface-2)); border: 1px solid color-mix(in srgb, var(--ember) 35%, var(--line)); }
  .chip.tag { background: var(--surface-2); border-color: var(--line); color: var(--silver); }
  .chip button { border: 0; background: none; padding: 0 5px; color: var(--muted); font-size: 14px; line-height: 1; }
  .chips input { width: 120px; border: 1px dashed var(--line); background: none; color: var(--ink); border-radius: 20px; padding: 4px 10px; font: inherit; font-size: 12.5px; }
  .chips input:focus { outline: none; border-color: var(--ember); border-style: solid; }
  .marks { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .marks button { width: 100%; text-align: left; border: 0; background: none; display: flex; gap: 10px; padding: 6px 8px; }
  .marks button:hover { background: var(--surface-2); }
  .marks b { font: 600 11px var(--f-mono); color: var(--ember); min-width: 42px; }
  .acts { gap: 6px; }
  .acts button { text-align: left; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 12px; }
  .acts small { color: var(--muted); font: 10.5px var(--f-mono); }
  @keyframes slide { from { transform: translateX(30px); opacity: 0; } }
  @keyframes fade { from { opacity: 0; } }
</style>
