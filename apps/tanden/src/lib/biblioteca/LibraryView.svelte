<script lang="ts">
  import { READ_STATUS, bookProgress, type Book } from '@tanden/core';
  import { untrack } from 'svelte';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { fold } from '../pdf/geometry';
  import PdfView from '../pdf/PdfView.svelte';
  import { biblioteca, type ContentHit, type Shelf, type Sort } from './biblioteca.svelte';
  import BookDetails from './BookDetails.svelte';
  import Cover from './Cover.svelte';

  let input = $state<HTMLInputElement>();
  let query = $state('');
  let inContent = $state(false);
  let hits = $state<ContentHit[]>([]);
  let searched = $state('');
  let dragging = $state(0);

  const books = $derived(biblioteca.books);
  const recency = (b: Book) => Math.max(b.opened ?? 0, b.pageAt ?? 0);

  const counts = $derived.by(() => {
    const c: Record<string, number> = { todos: books.length, lendo: 0, quero: 0, lido: 0, pausado: 0, favoritos: 0 };
    for (const b of books) {
      if (b.status) c[b.status]!++;
      if (b.favorite) c.favoritos!++;
      for (const s of b.shelves) c[`estante:${s}`] = (c[`estante:${s}`] ?? 0) + 1;
      for (const t of b.tags) c[`tag:${t}`] = (c[`tag:${t}`] ?? 0) + 1;
    }
    return c;
  });
  const shelves = $derived([...new Set(books.flatMap((b) => b.shelves))].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  const tags = $derived([...new Set(books.flatMap((b) => b.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR')));

  function inShelf(b: Book, s: Shelf): boolean {
    if (s === 'todos') return true;
    if (s === 'favoritos') return !!b.favorite;
    if (s.startsWith('estante:')) return b.shelves.includes(s.slice(8));
    if (s.startsWith('tag:')) return b.tags.includes(s.slice(4));
    return b.status === s;
  }

  const visible = $derived.by(() => {
    const q = inContent ? '' : fold(query.trim());
    const list = books.filter((b) => inShelf(b, biblioteca.shelf)).filter((b) => {
      if (!q) return true;
      const hay = fold([biblioteca.title(b), biblioteca.author(b), b.path, ...b.shelves, ...b.tags.map((t) => `#${t}`)].join(' '));
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    const by = biblioteca.sort;
    const t = (b: Book) => biblioteca.title(b);
    return list.sort((a, b) =>
      by === 'titulo' ? t(a).localeCompare(t(b), 'pt-BR', { numeric: true })
      : by === 'autor' ? (biblioteca.author(a) || '￿').localeCompare(biblioteca.author(b) || '￿', 'pt-BR') || t(a).localeCompare(t(b), 'pt-BR')
      : by === 'adicionados' ? b.added - a.added || t(a).localeCompare(t(b), 'pt-BR')
      : by === 'progresso' ? bookProgress(b) - bookProgress(a) || t(a).localeCompare(t(b), 'pt-BR')
      : recency(b) - recency(a) || b.added - a.added || t(a).localeCompare(t(b), 'pt-BR'));
  });

  /** "Continuar lendo": os que estão sendo lidos, do mais recente. */
  const continuing = $derived(books.filter((b) => b.status === 'lendo').sort((a, b) => recency(b) - recency(a)).slice(0, 8));
  const showContinue = $derived(biblioteca.shelf === 'todos' && !query.trim() && continuing.length > 0);

  const SHELVES: Array<[Shelf, string]> = [
    ['todos', 'Todos'], ['lendo', READ_STATUS.lendo], ['quero', READ_STATUS.quero], ['lido', 'Lidos'], ['pausado', READ_STATUS.pausado], ['favoritos', 'Favoritos'],
  ];
  const SORTS: Array<[Sort, string]> = [['recentes', 'Recentes'], ['titulo', 'Título'], ['autor', 'Autor'], ['adicionados', 'Adicionados'], ['progresso', 'Progresso']];

  // busca dentro dos PDFs
  let searchSeq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const q = query.trim();
    const on = inContent;
    if (timer) clearTimeout(timer);
    if (!on || q.length < 2) {
      untrack(() => { hits = []; searched = ''; });
      return;
    }
    timer = setTimeout(() => untrack(() => void runSearch(q)), 350);
  });
  async function runSearch(q: string) {
    const seq = ++searchSeq;
    hits = [];
    searched = '';
    const all = await biblioteca.searchContent(q, (h) => { if (seq === searchSeq) hits = h; }, () => seq === searchSeq);
    if (seq === searchSeq) {
      hits = all;
      searched = q;
    }
  }
  const hitGroups = $derived.by(() => {
    const m = new Map<string, ContentHit[]>();
    for (const h of hits) (m.get(h.path) ?? m.set(h.path, []).get(h.path)!).push(h);
    return [...m].map(([path, list]) => ({ book: books.find((b) => b.path === path)!, list })).filter((g) => g.book);
  });

  async function onPick(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    if (el.files?.length) await files.importFiles(el.files);
    el.value = '';
    void biblioteca.scan();
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = 0;
    const list = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (list.length) void files.importFiles(list).then(() => biblioteca.scan());
    else if (e.dataTransfer?.files.length) files.say('A Biblioteca guarda PDFs. Outros arquivos vão pela tela Arquivos.', { error: true });
  }

  const where = (list: ContentHit[]) => {
    const n = new Set(list.map((h) => h.page)).size;
    return n === 1 ? `na p. ${list[0]!.page}` : `em ${n} páginas`;
  };
  const pct = (b: Book) => Math.round(bookProgress(b) * 100);
  const reading = $derived(biblioteca.reading ? books.find((b) => b.path === biblioteca.reading) ?? null : null);
</script>

{#if biblioteca.reading}
  <div class="reader">
    <header class="rhead">
      <button class="back" onclick={() => biblioteca.close()} title="Voltar para a Biblioteca">‹ Biblioteca</button>
      {#if reading}
        <span class="rt"><b>{biblioteca.title(reading)}</b>{#if biblioteca.author(reading)}<small>{biblioteca.author(reading)}</small>{/if}</span>
        <select value={reading.status ?? ''} onchange={(e) => engine.library.update(reading.path, { status: (e.currentTarget.value || undefined) as Book['status'] })} aria-label="Status de leitura">
          <option value="">Sem status</option>
          {#each Object.entries(READ_STATUS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
        </select>
        <span class="rp" title="Progresso">{pct(reading)}%</span>
        <button class="info" onclick={() => (biblioteca.details = reading.path)} title="Detalhes do livro" aria-label="Detalhes do livro">ⓘ</button>
      {/if}
    </header>
    {#key biblioteca.reading}<PdfView path={biblioteca.reading} />{/key}
  </div>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="lib"
    ondragenter={(e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); dragging++; } }}
    ondragover={(e) => { if (dragging) e.preventDefault(); }}
    ondragleave={() => (dragging = Math.max(0, dragging - 1))}
    ondrop={onDrop}>
    <aside class="nav" aria-label="Estantes">
      <h2>Biblioteca</h2>
      <ul>
        {#each SHELVES as [id, label] (id)}
          <li><button class:on={biblioteca.shelf === id} onclick={() => (biblioteca.shelf = id)}>{label}<span>{counts[id] ?? 0}</span></button></li>
        {/each}
      </ul>
      {#if shelves.length}
        <h3>Estantes</h3>
        <ul>
          {#each shelves as s (s)}
            <li><button class:on={biblioteca.shelf === `estante:${s}`} onclick={() => (biblioteca.shelf = `estante:${s}`)}>{s}<span>{counts[`estante:${s}`]}</span></button></li>
          {/each}
        </ul>
      {/if}
      {#if tags.length}
        <h3>Etiquetas</h3>
        <ul>
          {#each tags as t (t)}
            <li><button class:on={biblioteca.shelf === `tag:${t}`} onclick={() => (biblioteca.shelf = `tag:${t}`)}>#{t}<span>{counts[`tag:${t}`]}</span></button></li>
          {/each}
        </ul>
      {/if}
    </aside>

    <section class="main">
      <header class="top">
        <div class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 21 21" /></svg>
          <input bind:value={query} placeholder={inContent ? 'Buscar dentro dos PDFs' : 'Buscar título, autor, estante, #etiqueta'} aria-label="Buscar na biblioteca" />
          <label class="toggle" title="Procura o texto dentro de todos os PDFs">
            <input type="checkbox" bind:checked={inContent} /> no conteúdo
          </label>
        </div>
        <div class="tools">
          <select bind:value={biblioteca.sort} onchange={() => biblioteca.savePrefs()} aria-label="Ordenar">
            {#each SORTS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
          <button class="icon" onclick={() => { biblioteca.layout = biblioteca.layout === 'grade' ? 'lista' : 'grade'; biblioteca.savePrefs(); }}
            title={biblioteca.layout === 'grade' ? 'Ver em lista' : 'Ver em grade'} aria-label="Trocar visualização">
            {#if biblioteca.layout === 'grade'}
              <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            {:else}
              <svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
            {/if}
          </button>
          <button class="pri" onclick={() => input?.click()}>Adicionar PDF</button>
        </div>
      </header>
      {#if biblioteca.scanning}
        <div class="scan" role="status"><span>Lendo capas e títulos… {biblioteca.scanning.done}/{biblioteca.scanning.total}</span><i style:width="{(biblioteca.scanning.done / biblioteca.scanning.total) * 100}%"></i></div>
      {/if}

      <div class="scroll">
        {#if inContent && query.trim().length >= 2}
          {#if biblioteca.indexing}
            <p class="note">Lendo o texto dos PDFs pela primeira vez ({biblioteca.indexing.done}/{biblioteca.indexing.total}). Depois a busca é instantânea.</p>
          {/if}
          {#each hitGroups as g (g.book.path)}
            <section class="hits">
              <button class="hb" onclick={() => biblioteca.open(g.book.path, g.list[0]!.page, query.trim())}>
                <span class="mini"><Cover book={g.book} /></span>
                <span><b>{biblioteca.title(g.book)}</b><small>{where(g.list)}</small></span>
              </button>
              <ul>
                {#each g.list.slice(0, 6) as h, i (i)}
                  <li><button onclick={() => biblioteca.open(h.path, h.page, query.trim())}><em>p. {h.page}</em><span>{h.snippet[0]}<mark>{h.snippet[1]}</mark>{h.snippet[2]}</span></button></li>
                {/each}
              </ul>
            </section>
          {:else}
            {#if searched && !biblioteca.indexing}<p class="none">Nenhum PDF tem "{searched}".</p>{/if}
          {/each}
        {:else}
          {#if showContinue}
            <h3 class="sec">Continuar lendo</h3>
            <div class="continue">
              {#each continuing as b (b.path)}
                <button class="cont" onclick={() => biblioteca.open(b.path)}>
                  <span class="mini"><Cover book={b} /></span>
                  <span class="ci">
                    <b>{biblioteca.title(b)}</b>
                    {#if biblioteca.author(b)}<small>{biblioteca.author(b)}</small>{/if}
                    <span class="bar"><i style:width="{pct(b)}%"></i></span>
                    <small>p. {b.page ?? 1}{b.pages ? ` de ${b.pages}` : ''} · {pct(b)}%</small>
                  </span>
                </button>
              {/each}
            </div>
            <h3 class="sec">Todos os livros</h3>
          {/if}

          {#if !books.length}
            <div class="empty">
              <svg viewBox="0 0 64 64" width="58" height="58" aria-hidden="true"><path d="M10 12h16a6 6 0 0 1 6 6v36a5 5 0 0 0-5-5H10zM54 12H38a6 6 0 0 0-6 6v36a5 5 0 0 1 5-5h17z" /></svg>
              <h2>Sua biblioteca está vazia</h2>
              <p>Adicione PDFs (ou solte aqui). Cada um vira um livro com capa, progresso, marcadores e anotações que sincronizam entre o PC e o celular. O arquivo continua em PDFs/, aberto para o Obsidian e qualquer leitor.</p>
              <button class="pri" onclick={() => input?.click()}>Adicionar PDF</button>
            </div>
          {:else if !visible.length}
            <p class="none">Nenhum livro aqui{query.trim() ? ` com "${query.trim()}"` : ''}.</p>
          {:else if biblioteca.layout === 'grade'}
            <ul class="grid">
              {#each visible as b (b.path)}
                <li class="card">
                  <button class="open" onclick={() => biblioteca.open(b.path)} title={b.path}>
                    <Cover book={b} broken={!!biblioteca.broken(b.path)} />
                    {#if b.status}<span class="st {b.status}">{READ_STATUS[b.status]}</span>{/if}
                    {#if b.favorite}<span class="heart" aria-label="Favorito">♥</span>{/if}
                    {#if pct(b) > 0 && b.status !== 'lido'}<span class="prog"><i style:width="{pct(b)}%"></i></span>{/if}
                  </button>
                  <div class="meta">
                    <span class="tx"><b>{biblioteca.title(b)}</b><small>{biblioteca.author(b) || (b.pages ? `${b.pages} páginas` : '')}</small></span>
                    <button class="more" onclick={() => (biblioteca.details = b.path)} aria-label="Detalhes de {biblioteca.title(b)}" title="Detalhes">⋯</button>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <ul class="rows">
              {#each visible as b (b.path)}
                <li>
                  <button class="open" onclick={() => biblioteca.open(b.path)}>
                    <span class="mini"><Cover book={b} broken={!!biblioteca.broken(b.path)} /></span>
                    <span class="tx"><b>{biblioteca.title(b)}</b><small>{biblioteca.author(b) || b.path}</small></span>
                    <span class="col st-t">{b.status ? READ_STATUS[b.status] : ''}</span>
                    <span class="col"><span class="bar"><i style:width="{pct(b)}%"></i></span>{pct(b)}%</span>
                    <span class="col stars">{b.rating ? '★'.repeat(b.rating) : ''}</span>
                  </button>
                  <button class="more" onclick={() => (biblioteca.details = b.path)} aria-label="Detalhes de {biblioteca.title(b)}" title="Detalhes">⋯</button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </div>
    </section>

    {#if dragging}
      <div class="drop" aria-hidden="true"><div><b>Solte os PDFs</b><span>entram na biblioteca e ficam em PDFs/</span></div></div>
    {/if}
    <input bind:this={input} type="file" accept="application/pdf,.pdf" multiple hidden onchange={onPick} />
  </div>
{/if}

{#if biblioteca.details}
  <BookDetails path={biblioteca.details} onclose={() => (biblioteca.details = null)} />
{/if}

<style>
  .reader { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .rhead { display: flex; align-items: center; gap: 10px; padding: 5px 10px; border-bottom: 1px solid var(--line); background: var(--surface); min-height: 38px; }
  .back { border: 0; background: none; color: var(--ember-soft); padding: 4px 6px; font-size: 13px; white-space: nowrap; }
  .rt { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; overflow: hidden; white-space: nowrap; }
  .rt b { font: 600 13px var(--f-display); letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; }
  .rt small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .rp { font: 11.5px var(--f-mono); color: var(--muted); }
  .info { border: 0; background: none; color: var(--muted); font-size: 16px; padding: 2px 6px; }
  .info:hover { color: var(--ember); }
  select { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px; padding: 5px 8px; font: inherit; font-size: 12.5px; }

  .lib { flex: 1; min-height: 0; display: flex; position: relative; }
  .nav { width: 220px; flex: none; border-right: 1px solid var(--line); background: var(--surface); padding: 14px 10px; overflow-y: auto; }
  .nav h2 { margin: 0 6px 12px; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .nav h3 { margin: 16px 6px 4px; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; }
  .nav li button { width: 100%; display: flex; justify-content: space-between; gap: 8px; text-align: left; border: 0; border-left: 2px solid transparent;
    background: none; border-radius: 7px; padding: 6px 9px; color: var(--silver); overflow: hidden; }
  .nav li button:hover { background: var(--surface-2); color: var(--ink); }
  .nav li button.on { background: var(--surface-2); color: var(--ink); border-left-color: var(--ember); }
  .nav li span { font: 11px var(--f-mono); color: var(--muted); }
  .nav li button.on span { color: var(--ember); }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
  .top { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .search { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--void); border-radius: 10px; padding: 0 10px; }
  .search:focus-within { border-color: var(--ember); }
  .search svg { width: 16px; height: 16px; fill: none; stroke: var(--muted); stroke-width: 1.8; stroke-linecap: round; flex: none; }
  .search > input { flex: 1; min-width: 0; border: 0; background: none; color: var(--ink); padding: 8px 0; font: inherit; }
  .search > input:focus { outline: none; }
  .toggle { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); white-space: nowrap; cursor: pointer; }
  .toggle input { accent-color: var(--ember); }
  .tools { display: flex; gap: 6px; align-items: center; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 6px 11px; font-size: 12.5px; color: var(--ink); }
  button:hover { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .pri { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; white-space: nowrap; }
  .icon { width: 32px; height: 32px; padding: 0; display: grid; place-items: center; }
  .icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .scan { position: relative; padding: 5px 16px; font: 11.5px var(--f-mono); color: var(--muted); border-bottom: 1px solid var(--line); overflow: hidden; }
  .scan i { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--ember); transition: width .3s; }

  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 18px 40px; }
  .sec { margin: 14px 0 10px; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .continue { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; scroll-snap-type: x proximity; }
  .cont { flex: none; width: 280px; display: flex; gap: 12px; text-align: left; padding: 10px; border-radius: 12px; scroll-snap-align: start; }
  .cont:hover { background: color-mix(in srgb, var(--ember) 6%, var(--surface-2)); }
  .mini { width: 64px; flex: none; }
  .ci { display: grid; gap: 4px; align-content: start; min-width: 0; flex: 1; }
  .ci b, .tx b { font: 600 13px/1.3 var(--f-display); letter-spacing: .01em; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
  .ci small, .tx small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { display: block; height: 4px; border-radius: 4px; background: var(--line); overflow: hidden; margin-top: 4px; }
  .bar i { display: block; height: 100%; background: var(--ember); border-radius: 4px; }

  .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 22px 18px; }
  .card { display: grid; gap: 8px; min-width: 0; }
  .card .open { position: relative; border: 0; background: none; padding: 0; border-radius: 6px; transition: transform .18s cubic-bezier(.2, .8, .2, 1); }
  .card .open:hover { transform: translateY(-3px); }
  .card .open:hover :global(.cover) { box-shadow: 0 0 0 1px var(--ember), 0 18px 34px -16px #000, 0 0 24px -8px var(--ember-glow); }
  .st { position: absolute; left: 6px; top: 6px; font: 600 9.5px/1 var(--f-mono); letter-spacing: .06em; text-transform: uppercase; padding: 4px 6px; border-radius: 5px;
    background: rgb(12 12 14 / .78); color: #fff; backdrop-filter: blur(4px); }
  .st.lendo { color: var(--ember-soft); }
  .st.lido { color: var(--ok); }
  .heart { position: absolute; right: 8px; top: 5px; color: var(--ember); text-shadow: 0 1px 4px #000; }
  .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: rgb(0 0 0 / .45); border-radius: 0 0 6px 6px; overflow: hidden; }
  .prog i { display: block; height: 100%; background: var(--ember); box-shadow: 0 0 8px var(--ember); }
  .meta { display: flex; gap: 4px; align-items: start; min-width: 0; }
  .tx { display: grid; gap: 2px; min-width: 0; flex: 1; }
  .more { border: 0; background: none; padding: 0 6px; color: var(--muted); font-size: 16px; line-height: 1.2; }
  .more:hover { color: var(--ember); }

  .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .rows li { display: flex; align-items: center; border-radius: 10px; }
  .rows li:hover { background: var(--surface-2); }
  .rows .open { flex: 1; min-width: 0; display: grid; grid-template-columns: 40px minmax(0, 1fr) 90px 120px 70px; gap: 14px; align-items: center; border: 0; background: none; text-align: left; padding: 6px 8px; }
  .rows .mini { width: 40px; }
  .col { font: 11.5px var(--f-mono); color: var(--muted); display: flex; align-items: center; gap: 8px; }
  .col .bar { flex: 1; margin: 0; }
  .stars { color: var(--ember); letter-spacing: 1px; }

  .hits { margin: 8px 0 18px; }
  .hb { display: flex; align-items: center; gap: 12px; border: 0; background: none; padding: 4px; text-align: left; }
  .hb .mini { width: 34px; }
  .hb b { display: block; font: 600 13.5px var(--f-display); }
  .hb small { color: var(--muted); font-size: 11.5px; }
  .hits ul { list-style: none; margin: 4px 0 0 46px; padding: 0; display: grid; gap: 2px; }
  .hits li button { width: 100%; display: flex; gap: 12px; text-align: left; border: 0; background: none; padding: 6px 8px; color: var(--silver); font-size: 13px; }
  .hits li button:hover { background: var(--surface-2); color: var(--ink); }
  .hits em { font: normal 11px var(--f-mono); color: var(--ember); flex: none; min-width: 44px; padding-top: 2px; }
  mark { background: color-mix(in srgb, var(--ember) 35%, transparent); color: var(--ink); border-radius: 3px; padding: 0 1px; }
  .note, .none { color: var(--muted); font-size: 13px; }

  .empty { max-width: 460px; margin: 60px auto; text-align: center; display: grid; justify-items: center; gap: 12px; }
  .empty svg { fill: none; stroke: var(--ember); stroke-width: 1.6; stroke-linejoin: round; filter: drop-shadow(0 0 10px var(--ember-glow)); }
  .empty h2 { margin: 0; font: 600 18px var(--f-display); }
  .empty p { margin: 0; color: var(--muted); }

  .drop { position: absolute; inset: 10px; z-index: 50; display: grid; place-items: center; pointer-events: none; border-radius: 18px;
    border: 2px dashed var(--ember); background: color-mix(in srgb, var(--void) 78%, transparent); backdrop-filter: blur(2px); }
  .drop div { display: grid; gap: 4px; text-align: center; }
  .drop b { font: 600 16px var(--f-display); letter-spacing: .06em; color: var(--ember-soft); }
  .drop span { color: var(--muted); font-size: 12.5px; }

  @media (max-width: 720px) {
    .lib { flex-direction: column; }
    .nav { width: auto; border-right: 0; border-bottom: 1px solid var(--line); padding: 8px 10px; display: flex; gap: 6px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; flex: none; }
    .nav h2, .nav h3 { display: none; }
    .nav ul { display: flex; gap: 6px; }
    .nav li button { white-space: nowrap; border: 1px solid var(--line); border-radius: 20px; padding: 5px 11px; }
    .nav li button.on { border-color: var(--ember); }
    .top { padding: 10px 12px; }
    .search { min-width: 100%; }
    .tools { margin-left: auto; }
    .scroll { padding: 6px 12px 40px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 18px 12px; }
    .cont { width: 250px; }
    .rows .open { grid-template-columns: 36px minmax(0, 1fr) 64px; }
    .rows .col:not(.st-t) { display: none; }
    .rt small, .rp { display: none; }
  }
</style>
