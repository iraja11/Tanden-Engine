<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { buildNoteGraph, graphQuery, neighborhood, type GraphNode, type NoteGraph } from '@tanden/core/src/graph';
  import { serializeBoard } from '@tanden/core';
  import { quadros } from '../quadro/quadros.svelte';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { sound } from '../sound.svelte';
  import { GraphCanvas, type GEdge, type GNode } from './graph-canvas';

  /*
   * Grafo das notas, como o do Obsidian: cada nota é um nó, cada [[link]] uma
   * ligação. Global ou local (em volta de uma nota), com busca, cores por
   * pasta, tags, anexos e links para notas que ainda não existem.
   */

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const KEY = 'tanden.grafo';
  type Settings = {
    mode: 'global' | 'local';
    depth: number;
    tags: boolean;
    files: boolean;
    missing: boolean;
    orphans: boolean;
    arrows: boolean;
    hidden: string[];
    repel: number;
    distance: number;
    gravity: number;
    /** quadros (.canvas) como nós */
    boards: boolean;
    /** só o que bate com esta busca aparece (path:, tag:, file:, -termo) */
    filter: string;
    /** grupos de cor por busca, como no Obsidian: o primeiro que bate pinta o nó */
    colorGroups: { q: string; color: string }[];
    nodeScale: number;
    linkWidth: number;
    labelFade: number;
  };
  const DEFAULTS: Settings = {
    mode: 'global', depth: 2, tags: false, files: false, missing: false, orphans: true, arrows: false, hidden: [], repel: 1.6, distance: 80, gravity: 1,
    boards: true, filter: '', colorGroups: [], nodeScale: 1, linkWidth: 1, labelFade: 1,
  };
  function load(): Settings {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }
  let s = $state<Settings>(load());
  $effect(() => {
    const snap = JSON.stringify(s);
    try { localStorage.setItem(KEY, snap); } catch { /* sem armazenamento: vale só nesta sessão */ }
  });

  let host = $state<HTMLDivElement>();
  let gc: GraphCanvas | null = null;
  let graph = $state<NoteGraph>({ nodes: [], edges: [] });
  let query = $state('');
  let selected = $state<string | null>(null);
  /** centro do grafo local: a nota selecionada ou a aberta */
  let center = $state<string | null>(engine.active);
  let panel = $state(true);
  let forces = $state(false);
  let looks = $state(false);
  let colorsOpen = $state(s.colorGroups.length > 0);
  /** animação de crescimento: quantas notas já apareceram (null = todas) */
  let grow = $state<number | null>(null);
  let growTimer: ReturnType<typeof setInterval> | null = null;

  // cores por pasta de primeiro nível
  const PALETTE = ['#ff8a3d', '#5aa9ff', '#7fd1a8', '#c792ff', '#ffd166', '#ff6b8b', '#4dd0e1', '#b8e986', '#f78fb3', '#a0a4ff'];
  const top = (folder: string) => folder.split('/')[0] || '';
  const groups = $derived.by(() => {
    const count = new Map<string, number>();
    for (const n of graph.nodes) if (n.kind === 'note') count.set(top(n.folder), (count.get(top(n.folder)) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name, n], i) => ({ name, n, color: name ? PALETTE[i % PALETTE.length]! : 'var(--silver)' }));
  });
  const groupColor = $derived(new Map(groups.map((g) => [g.name, g.color])));

  /* ------------------------------------------------------------ dados */

  let rev = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;
  function rebuild() {
    const notes = engine.vault.list().filter((p) => p.endsWith('.md')).map((path) => ({ path, text: engine.vault.read(path) }));
    const boards = s.boards ? engine.boardList.filter((p) => engine.boards.has(p)).map((path) => ({ path, text: serializeBoard(engine.boards.read(path)) })) : [];
    graph = buildNoteGraph(notes, { tags: s.tags, missing: s.missing, files: s.files, allPaths: files.list, boards });
    rev++;
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      rebuild();
    }, 400);
  }
  let off: (() => void) | null = null;
  onMount(() => {
    off = engine.bus.on('*', (e) => {
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'note.deleted' || e.type === 'sync.finished') schedule();
      else if (s.boards && (e.type === 'board.created' || e.type === 'board.changed' || e.type === 'board.deleted')) schedule();
    });
  });
  onDestroy(() => {
    off?.();
    if (timer) clearTimeout(timer);
    if (growTimer) clearInterval(growTimer);
    gc?.destroy();
  });
  // opções que mudam o que entra no grafo
  $effect(() => {
    void s.tags;
    void s.missing;
    void s.files;
    void s.boards;
    void files.list;
    untrack(rebuild);
  });

  /** o que fica visível depois dos filtros */
  const view = $derived.by(() => {
    void rev;
    const hidden = new Set(s.hidden);
    let keep = graph.nodes.filter((n) => (n.kind !== 'note' && n.kind !== 'board') || !hidden.has(top(n.folder)));
    if (s.filter.trim()) {
      const f = graphQuery(s.filter);
      keep = keep.filter((n) => (n.kind !== 'note' && n.kind !== 'board') || f(n));
      // tags e anexos só ficam se ligados a alguma nota que sobrou
      const alive = new Set(keep.filter((n) => n.kind === 'note' || n.kind === 'board').map((n) => n.id));
      const touched = new Set(graph.edges.filter((e) => alive.has(e.from) || alive.has(e.to)).flatMap((e) => [e.from, e.to]));
      keep = keep.filter((n) => alive.has(n.id) || touched.has(n.id));
    }
    if (grow !== null) {
      const order = growOrder.slice(0, grow);
      const shown = new Set(order);
      keep = keep.filter((n) => shown.has(n.id) || ((n.kind === 'tag' || n.kind === 'file' || n.kind === 'missing') && graph.edges.some((e) => shown.has(e.from) && e.to === n.id)));
    }
    if (!s.orphans) keep = keep.filter((n) => n.in + n.out > 0);
    let ids = new Set(keep.map((n) => n.id));
    let edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    if (s.mode === 'local' && center && ids.has(center)) {
      const near = neighborhood({ nodes: keep, edges }, center, s.depth);
      keep = keep.filter((n) => near.has(n.id));
      ids = near;
      edges = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
    }
    return { nodes: keep, edges };
  });

  const stats = $derived({ notes: view.nodes.filter((n) => n.kind === 'note').length, boards: view.nodes.filter((n) => n.kind === 'board').length, links: view.edges.length });

  /** grupos de cor por busca, já compilados */
  const matchers = $derived(s.colorGroups.filter((g) => g.q.trim()).map((g) => ({ test: graphQuery(g.q), color: g.color })));
  function colorFor(n: GraphNode, folders: Map<string, string>): string {
    if (n.kind === 'tag') return 'var(--ember-soft)';
    if (n.kind === 'file' || n.kind === 'missing') return 'var(--muted)';
    for (const m of matchers) if (m.test(n)) return m.color;
    if (n.kind === 'board') return 'var(--ok)';
    return folders.get(top(n.folder)) ?? 'var(--silver)';
  }

  $effect(() => {
    const v = view;
    const colors = groupColor;
    void matchers;
    const arrows = s.arrows;
    untrack(() => {
      if (!host) return;
      if (!gc) {
        gc = new GraphCanvas({
          arrows: arrows ? 'always' : 'lit',
          nodeScale: s.nodeScale,
          linkWidth: s.linkWidth,
          labelFade: s.labelFade,
          onSelect: (id) => {
            selected = id;
            if (id) sound.play('tick');
          },
          onOpen: (id) => open(id),
        });
        host.appendChild(gc.el);
        gc.setParams({ repel: s.repel, linkDistance: s.distance, gravity: s.gravity });
      }
      const nodes: GNode[] = v.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        color: colorFor(n, colors),
        shape: n.kind === 'tag' || n.kind === 'board' ? 'ring' : n.kind === 'missing' ? 'ghost' : 'dot',
        weight: n.id === engine.active ? 4 : 0,
      }));
      const edges: GEdge[] = v.edges.map((e) => ({ from: e.from, to: e.to, dashed: e.kind === 'tag' || e.kind === 'embed' }));
      gc.setData(nodes, edges);
      gc.select(selected);
    });
  });
  $effect(() => {
    const o = { nodeScale: s.nodeScale, linkWidth: s.linkWidth, labelFade: s.labelFade };
    untrack(() => gc?.setOptions(o));
  });
  $effect(() => {
    const a = s.arrows;
    untrack(() => gc?.setOptions({ arrows: a ? 'always' : 'lit' }));
  });
  $effect(() => {
    const p = { repel: s.repel, linkDistance: s.distance, gravity: s.gravity };
    untrack(() => gc?.setParams(p));
  });
  // o modo local volta a enquadrar quando muda de centro
  $effect(() => {
    void center;
    void s.mode;
    void s.depth;
    untrack(() => setTimeout(() => gc?.fit(), 60));
  });

  /* ------------------------------------------------------------ busca */

  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const matches = $derived.by(() => {
    const q = norm(query.trim());
    if (!q) return [];
    return view.nodes
      .filter((n) => norm(n.label).includes(q) || norm(n.id).includes(q) || n.tags.some((t) => norm(t).includes(q.replace(/^#/, ''))))
      .sort((a, b) => Number(norm(b.label) === q) - Number(norm(a.label) === q) || Number(!norm(a.label).startsWith(q)) - Number(!norm(b.label).startsWith(q)) || b.in + b.out - (a.in + a.out));
  });
  $effect(() => {
    const m = matches;
    const q = query.trim();
    untrack(() => gc?.setHighlight(q ? m.map((n) => n.id) : null));
  });
  function pick(id: string) {
    selected = id;
    gc?.select(id, true);
    sound.play('tick');
  }
  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && matches[0]) pick(matches[0].id);
    if (e.key === 'Escape') query = '';
  }

  /* ------------------------------------------------------------ ações */

  const info = $derived(selected ? graph.nodes.find((n) => n.id === selected) ?? null : null);
  const backlinks = $derived(selected ? graph.edges.filter((e) => e.to === selected && e.kind !== 'tag').map((e) => e.from) : []);
  const outlinks = $derived(selected ? graph.edges.filter((e) => e.from === selected).map((e) => e.to) : []);
  const labelOf = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;

  function open(id: string) {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.kind === 'note') onOpenNote(id);
    else if (n.kind === 'board') quadros.open(id);
    else if (n.kind === 'file') files.openLink(id);
    else if (n.kind === 'tag') query = n.label;
    else if (n.kind === 'missing') {
      // link sem nota: cria a nota, como o Obsidian
      const path = `${n.label}.md`;
      if (!engine.vault.has(path)) engine.writeNote(path, `# ${n.label}\n\n`);
      sound.play('create');
      onOpenNote(path);
    }
  }
  function localAround(id: string) {
    center = id;
    s.mode = 'local';
  }
  /* ------------------------------------------------------------ extras */

  /** ordem de aparição na animação: notas mais antigas (pela data do arquivo) primeiro */
  let growOrder: string[] = [];
  async function animate() {
    if (growTimer) {
      clearInterval(growTimer);
      growTimer = null;
      grow = null;
      return;
    }
    const ids = graph.nodes.filter((n) => n.kind === 'note' || n.kind === 'board').map((n) => n.id);
    let times: Record<string, [string, number]> = {};
    try {
      times = (await engine.storage.stat?.()) ?? {};
    } catch {
      times = {};
    }
    const when = (id: string) => {
      const d = /(\d{4}-\d{2}-\d{2})/.exec(id)?.[1];
      return d ? Date.parse(d) : times[id]?.[1] ?? 0;
    };
    growOrder = ids.sort((a, b) => when(a) - when(b) || a.localeCompare(b));
    const step = Math.max(1, Math.ceil(growOrder.length / 90));
    grow = 0;
    sound.play('open');
    growTimer = setInterval(() => {
      grow = (grow ?? 0) + step;
      if (grow >= growOrder.length) {
        clearInterval(growTimer!);
        growTimer = null;
        grow = null;
        sound.play('complete');
        setTimeout(() => gc?.fit(), 300);
      }
    }, 45);
  }

  async function savePng() {
    const blob = await gc?.png();
    if (!blob) return;
    const stamp = new Date().toISOString().slice(0, 10);
    await files.deliver(`Grafo ${stamp}.png`, new Uint8Array(await blob.arrayBuffer()), 'image/png');
    sound.play('complete');
  }

  const MAX_TO_BOARD = 150;
  function toBoard() {
    const v = view;
    if (!v.nodes.length || !gc) return;
    if (v.nodes.length > MAX_TO_BOARD) {
      files.say(`São ${v.nodes.length} itens. Use o grafo local ou o filtro para levar até ${MAX_TO_BOARD} para um quadro.`, { error: true });
      return;
    }
    const pos = gc.positions();
    const items = v.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, ...(pos.get(n.id) ?? { x: 0, y: 0 }) }));
    const c = s.mode === 'local' && center ? center : undefined;
    const name = c ? `Grafo de ${labelOf(c)}` : s.filter.trim() ? `Grafo ${s.filter.trim()}` : 'Grafo';
    quadros.fromGraph(name, items, v.edges.filter((e) => e.kind !== 'tag' || s.tags), c);
    sound.play('create');
  }

  function addColorGroup() {
    const used = new Set(s.colorGroups.map((g) => g.color));
    const color = PALETTE.find((c) => !used.has(c)) ?? PALETTE[s.colorGroups.length % PALETTE.length]!;
    s.colorGroups = [...s.colorGroups, { q: query.trim() || '', color }];
    colorsOpen = true;
  }

  function toggleGroup(name: string) {
    s.hidden = s.hidden.includes(name) ? s.hidden.filter((x) => x !== name) : [...s.hidden, name];
  }
  $effect(() => {
    // no modo local sem seleção, segue a nota aberta
    const a = engine.active;
    if (s.mode === 'local' && a && !untrack(() => selected)) untrack(() => (center = a));
  });
</script>

<div class="grafo" class:closed={!panel}>
  <aside class="side">
    <header>
      <h2>Grafo</h2>
      <button class="icon" onclick={() => (panel = !panel)} title={panel ? 'Esconder o painel' : 'Mostrar o painel'} aria-label="Painel">{panel ? '‹' : '›'}</button>
    </header>
    {#if panel}
      <div class="body">
        <label class="search">
          <span aria-hidden="true">⌕</span>
          <input bind:value={query} onkeydown={onSearchKey} placeholder="Buscar nota ou #tag" spellcheck="false" />
          {#if query}<button class="clear" onclick={() => (query = '')} aria-label="Limpar">×</button>{/if}
        </label>
        {#if query.trim()}
          <ul class="hits">
            {#each matches.slice(0, 8) as m (m.id)}
              <li><button onclick={() => pick(m.id)}><i style:background={m.kind === 'note' ? groupColor.get(top(m.folder)) : 'var(--muted)'}></i>{m.label}<small>{m.in + m.out}</small></button></li>
            {:else}
              <li class="none">Nada encontrado.</li>
            {/each}
            {#if matches.length > 8}<li class="none">e mais {matches.length - 8}</li>{/if}
          </ul>
        {/if}

        <div class="seg" role="group" aria-label="Modo">
          <button class:on={s.mode === 'global'} onclick={() => (s.mode = 'global')}>Global</button>
          <button class:on={s.mode === 'local'} onclick={() => { center = selected ?? engine.active; s.mode = 'local'; }}>Local</button>
        </div>
        {#if s.mode === 'local'}
          <div class="local">
            <span>Em volta de <b>{center ? labelOf(center) : 'nenhuma nota'}</b></span>
            <label class="range"><span>Distância</span><input type="range" min="1" max="4" bind:value={s.depth} /><b>{s.depth}</b></label>
          </div>
        {/if}

        <h3>Filtro</h3>
        <label class="search" title="path:Pasta  tag:#tag  file:nome  -termo exclui">
          <span aria-hidden="true">⧩</span>
          <input bind:value={s.filter} placeholder="path:Projetos -tag:#arquivo" spellcheck="false" aria-label="Filtro do grafo" />
          {#if s.filter}<button class="clear" onclick={() => (s.filter = '')} aria-label="Limpar filtro">×</button>{/if}
        </label>

        <h3>Mostrar</h3>
        <label class="tog"><input type="checkbox" bind:checked={s.boards} /> Quadros</label>
        <label class="tog"><input type="checkbox" bind:checked={s.tags} /> Tags</label>
        <label class="tog"><input type="checkbox" bind:checked={s.files} /> Anexos</label>
        <label class="tog"><input type="checkbox" bind:checked={s.missing} /> Notas que ainda não existem</label>
        <label class="tog"><input type="checkbox" bind:checked={s.orphans} /> Notas sem ligação</label>
        <label class="tog"><input type="checkbox" bind:checked={s.arrows} /> Setas</label>

        {#if groups.length > 1}
          <h3>Pastas</h3>
          <div class="groups">
            {#each groups as g (g.name)}
              <button class:off={s.hidden.includes(g.name)} onclick={() => toggleGroup(g.name)} title="Mostrar ou esconder">
                <i style:background={g.color}></i>{g.name || 'Raiz'}<small>{g.n}</small>
              </button>
            {/each}
          </div>
        {/if}

        <button class="more" onclick={() => (colorsOpen = !colorsOpen)} aria-expanded={colorsOpen}>Grupos de cor {colorsOpen ? '▾' : '▸'}</button>
        {#if colorsOpen}
          {#each s.colorGroups as g, i (i)}
            <div class="cgroup">
              <input type="color" bind:value={g.color} aria-label="Cor do grupo" />
              <input bind:value={g.q} placeholder="path:Mundos ou #tag" spellcheck="false" aria-label="Busca do grupo" />
              <button class="clear" onclick={() => (s.colorGroups = s.colorGroups.filter((_, j) => j !== i))} aria-label="Tirar o grupo">×</button>
            </div>
          {/each}
          <button class="link" onclick={addColorGroup}>+ Novo grupo{query.trim() ? ` com "${query.trim()}"` : ''}</button>
        {/if}

        <button class="more" onclick={() => (looks = !looks)} aria-expanded={looks}>Aparência {looks ? '▾' : '▸'}</button>
        {#if looks}
          <label class="range"><span>Nós</span><input type="range" min="0.5" max="2.5" step="0.1" bind:value={s.nodeScale} /></label>
          <label class="range"><span>Linhas</span><input type="range" min="0.3" max="3" step="0.1" bind:value={s.linkWidth} /></label>
          <label class="range" title="Mais à direita, os nomes só aparecem bem de perto"><span>Nomes</span><input type="range" min="-1" max="3" step="0.25" bind:value={s.labelFade} /><b>{s.labelFade < 0 ? 'nunca' : s.labelFade === 0 ? 'sempre' : ''}</b></label>
          <button class="link" onclick={() => { s.nodeScale = 1; s.linkWidth = 1; s.labelFade = 1; }}>Voltar ao padrão</button>
        {/if}

        <button class="more" onclick={() => (forces = !forces)} aria-expanded={forces}>Forças {forces ? '▾' : '▸'}</button>
        {#if forces}
          <label class="range"><span>Repulsão</span><input type="range" min="0.2" max="4" step="0.1" bind:value={s.repel} /></label>
          <label class="range"><span>Distância</span><input type="range" min="20" max="220" step="5" bind:value={s.distance} /></label>
          <label class="range"><span>Gravidade</span><input type="range" min="0" max="4" step="0.1" bind:value={s.gravity} /></label>
          <button class="link" onclick={() => { s.repel = DEFAULTS.repel; s.distance = DEFAULTS.distance; s.gravity = DEFAULTS.gravity; }}>Voltar ao padrão</button>
        {/if}
        <p class="stats">{stats.notes} {stats.notes === 1 ? 'nota' : 'notas'}{stats.boards ? ` · ${stats.boards} ${stats.boards === 1 ? 'quadro' : 'quadros'}` : ''} · {stats.links} {stats.links === 1 ? 'ligação' : 'ligações'}</p>
      </div>
    {/if}
  </aside>

  <section class="stage">
    <div class="canvas" bind:this={host}></div>
    <div class="tools">
      <button onclick={() => gc?.fit()} title="Enquadrar tudo (dois cliques no fundo)">⤢</button>
      <button onclick={() => gc?.zoomBy(1.4)} title="Aproximar">+</button>
      <button onclick={() => gc?.zoomBy(1 / 1.4)} title="Afastar">−</button>
      <button class:on={grow !== null} onclick={animate} title="Ver o cofre crescer, das notas mais antigas às mais novas">{grow !== null ? '■' : '▶'}</button>
      <button onclick={toBoard} title="Levar o que está no grafo para um quadro novo (cartões ligados)">▦</button>
      <button onclick={savePng} title="Salvar o grafo como imagem PNG">⇩</button>
    </div>
    {#if !view.nodes.length}
      <p class="empty">{graph.nodes.length ? 'Nada aparece com esses filtros.' : 'Ainda não há notas. Crie notas e ligue com [[links]].'}</p>
    {/if}
    {#if info}
      <div class="peek">
        <span class="kind">{info.kind === 'tag' ? 'Tag' : info.kind === 'file' ? 'Anexo' : info.kind === 'missing' ? 'Ainda não existe' : info.kind === 'board' ? `Quadro · ${info.folder || 'Raiz'}` : info.folder || 'Raiz'}</span>
        <b>{info.label}</b>
        {#if info.tags.length}<span class="tags">{#each info.tags.slice(0, 6) as t}<button onclick={() => (query = `#${t}`)}>#{t}</button>{/each}</span>{/if}
        <span class="counts">{outlinks.length} {outlinks.length === 1 ? 'link' : 'links'} · {backlinks.length} {backlinks.length === 1 ? 'menção' : 'menções'}</span>
        {#if backlinks.length}
          <div class="back">
            <small>Citada em</small>
            {#each backlinks.slice(0, 6) as b (b)}<button onclick={() => pick(b)}>{labelOf(b)}</button>{/each}
            {#if backlinks.length > 6}<small>e mais {backlinks.length - 6}</small>{/if}
          </div>
        {/if}
        <div class="acts">
          <button class="primary" onclick={() => open(info.id)}>{info.kind === 'missing' ? 'Criar nota' : info.kind === 'tag' ? 'Buscar a tag' : 'Abrir'}</button>
          {#if info.kind !== 'tag'}<button onclick={() => localAround(info.id)}>Grafo local</button>{/if}
          {#if info.kind === 'note'}<button onclick={() => { quadros.fromNote(info.id); sound.play('create'); }} title="Os títulos e listas da nota viram um mapa mental">Mapa mental</button>{/if}
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .grafo { flex: 1; min-height: 0; display: grid; grid-template-columns: 260px minmax(0, 1fr); transition: grid-template-columns var(--dur) var(--ease); }
  .grafo.closed { grid-template-columns: 52px minmax(0, 1fr); }
  .side { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--line); }
  .side header { display: flex; align-items: center; justify-content: space-between; padding: 16px 14px 8px; }
  .closed .side header h2 { display: none; }
  h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  h3 { margin: 14px 0 4px; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .icon { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); padding: 0; }
  .icon:hover { color: var(--ember); border-color: var(--ember); }
  .body { overflow-y: auto; padding: 0 14px 14px; display: flex; flex-direction: column; gap: 4px; }
  .body > * { flex-shrink: 0; }

  .search { display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 10px; padding: 2px 8px; background: var(--surface);
    color: var(--muted); transition: border-color var(--dur); }
  .search:focus-within { border-color: var(--ember); }
  .search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--ink); font: 13px var(--f-body); padding: 6px 0; }
  .clear { border: 0; background: none; color: var(--muted); font-size: 16px; padding: 0 2px; }
  .hits { list-style: none; margin: 4px 0 6px; padding: 0; display: grid; gap: 1px; }
  .hits button { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; border-radius: 8px; padding: 5px 8px; color: var(--ink);
    font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .hits button:hover { background: var(--surface-2); }
  .hits small { margin-left: auto; color: var(--muted); font: 11px var(--f-mono); }
  .hits i, .groups i { flex: none; width: 8px; height: 8px; border-radius: 50%; }
  .none { color: var(--muted); font-size: 12px; padding: 4px 8px; }

  .seg { display: flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-top: 6px; }
  .seg button { flex: 1; border: 0; background: none; padding: 6px; font: 500 11px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
    transition: color var(--dur), background var(--dur); }
  .seg button.on { color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .local { display: grid; gap: 4px; font-size: 12px; color: var(--muted); padding: 6px 2px 0; }
  .local b { color: var(--ink); font-weight: 600; }

  .tog { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 3px 0; cursor: pointer; }
  .tog input { accent-color: var(--ember); }
  .groups { display: grid; gap: 1px; }
  .groups button { display: flex; align-items: center; gap: 8px; border: 0; background: none; border-radius: 8px; padding: 4px 6px; color: var(--ink); font-size: 13px; text-align: left;
    transition: opacity var(--dur), background var(--dur); }
  .groups button:hover { background: var(--surface-2); }
  .groups button.off { opacity: .4; }
  .groups small { margin-left: auto; color: var(--muted); font: 11px var(--f-mono); }

  .range { display: grid; grid-template-columns: 74px 1fr auto; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .range input { accent-color: var(--ember); width: 100%; }
  .range b { font: 11px var(--f-mono); color: var(--ink); }
  .more, .link { align-self: flex-start; border: 0; background: none; color: var(--muted); font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; padding: 14px 0 4px; }
  .link { text-transform: none; letter-spacing: 0; font: 12px var(--f-body); padding: 4px 0; text-decoration: underline; }
  .more:hover, .link:hover { color: var(--ember); }
  .stats { margin: 12px 0 0; font: 11px var(--f-mono); color: var(--muted); }

  .stage { position: relative; min-width: 0; min-height: 0;
    background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--ember) 5%, var(--void)), var(--void) 70%); }
  .canvas { position: absolute; inset: 0; }
  .tools { position: absolute; top: 12px; right: 12px; display: flex; flex-direction: column; gap: 4px; }
  .tools button { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 85%, transparent);
    color: var(--ink); font: 600 15px/1 var(--f-mono); padding: 0; backdrop-filter: blur(6px); }
  .tools button:hover, .tools button.on { border-color: var(--ember); color: var(--ember); }
  .cgroup { display: flex; align-items: center; gap: 6px; }
  .cgroup input[type='color'] { flex: none; width: 26px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: none; }
  .cgroup input:not([type]) { flex: 1; min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: 12px var(--f-mono); padding: 5px 7px; outline: 0; }
  .cgroup input:not([type]):focus { border-color: var(--ember); }
  .empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); pointer-events: none; padding: 20px; text-align: center; }

  .peek { position: absolute; left: 14px; bottom: 14px; width: min(320px, calc(100% - 28px)); display: grid; gap: 6px; padding: 14px; border-radius: 14px;
    border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(10px);
    box-shadow: 0 18px 40px -20px var(--shadow); animation: rise .22s var(--ease); }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  .kind { font: 600 10px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .peek b { font: 600 16px var(--f-body); overflow-wrap: anywhere; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tags button { border: 1px solid var(--line); background: none; border-radius: 999px; padding: 1px 8px; font: 11px var(--f-mono); color: var(--ember-soft); }
  .counts { font: 11.5px var(--f-mono); color: var(--muted); }
  .back { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .back small { color: var(--muted); font-size: 11.5px; }
  .back button { border: 0; background: var(--surface-2); border-radius: 7px; padding: 2px 8px; font-size: 12px; color: var(--ink); }
  .back button:hover { color: var(--ember); }
  .acts { display: flex; gap: 6px; margin-top: 4px; }
  .acts button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 9px; padding: 6px 12px; font-size: 12.5px; color: var(--ink); }
  .acts button:hover { border-color: var(--ember); }
  .acts .primary { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-weight: 600; }

  @media (max-width: 760px) {
    .grafo, .grafo.closed { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .side { border-right: 0; border-bottom: 1px solid var(--line); max-height: 46vh; }
    .closed .side header h2 { display: block; }
  }
</style>
