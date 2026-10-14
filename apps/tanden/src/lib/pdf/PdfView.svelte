<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { PdfAnnotation, PdfTextItem } from '@tanden/core';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { openPdf, type PdfDoc } from './pdfjs';
  import PdfPage, { type Tool } from './PdfPage.svelte';
  import { COLORS, fold, type Rect } from './geometry';

  let { path }: { path: string } = $props();

  const GAP = 14;
  const PAD = 16;

  let scroller = $state<HTMLDivElement>();
  let pagesEl = $state<HTMLDivElement>();
  let doc = $state<PdfDoc | null>(null);
  let error = $state('');
  let sizes = $state<Array<{ w: number; h: number }>>([]);
  let scale = $state(1);
  let fit = $state<'width' | 'page' | 'custom'>('width');
  let current = $state(1);
  let visible = $state<Set<number>>(new Set());
  let tool = $state<Tool>('select');
  let color = $state(COLORS[0]!.hex);
  let penWidth = $state(2);
  let selected = $state<string | null>(null);
  let popAt = $state<{ x: number; y: number } | null>(null);
  let picked = $state<{ page: number; rects: Rect[]; text: string; at: { x: number; y: number } } | null>(null);
  let version = $state(0);
  let side = $state<'annots' | 'outline' | null>(null);
  let outline = $state<Array<{ title: string; dest: unknown; depth: number }>>([]);
  let menu = $state(false);
  let searchOpen = $state(false);
  let query = $state('');
  let hits = $state<Array<{ page: number; k: number }>>([]);
  let active = $state(0);
  let searching = $state(false);
  let pageInput = $state('1');
  let zoomPreview = $state(1);
  let searchInput = $state<HTMLInputElement>();
  let texts: Array<string | null> = [];
  let undo: ReturnType<typeof engine.annots.undoManager> | null = null;

  const annots = $derived.by(() => {
    void version;
    return engine.annots.list(path);
  });
  const byPage = $derived.by(() => {
    const m = new Map<number, PdfAnnotation[]>();
    for (const a of annots) (m.get(a.page) ?? m.set(a.page, []).get(a.page)!).push(a);
    return m;
  });
  const selAnnot = $derived(annots.find((a) => a.id === selected) ?? null);
  const name = $derived(path.split('/').pop()!.replace(/\.pdf$/i, ''));

  // posição de cada página no rolamento, na escala atual
  const tops = $derived.by(() => {
    const out: number[] = [];
    let y = PAD;
    for (const s of sizes) {
      out.push(y);
      y += Math.floor(s.h * scale) + GAP;
    }
    return out;
  });

  const posKey = $derived(`tanden.pdf.pos.${path}`);

  /* ------------------------------------------------------------- abrir */

  $effect(() => {
    const p = path;
    untrack(() => void load(p));
    return () => untrack(() => close());
  });

  async function load(p: string) {
    close();
    error = '';
    try {
      const data = await files.read(p);
      if (!data) throw new Error('arquivo não encontrado');
      const d = await openPdf(data);
      if (p !== path) return void d.loadingTask.destroy();
      doc = d;
      texts = new Array(d.numPages).fill(null);
      // tamanho de todas as páginas (só metadados, rápido)
      const first = await d.getPage(1);
      const v = first.getViewport({ scale: 1 });
      sizes = Array.from({ length: d.numPages }, () => ({ w: v.width, h: v.height }));
      void (async () => {
        for (let i = 2; i <= d.numPages && doc === d; i++) {
          const pg = await d.getPage(i);
          const pv = pg.getViewport({ scale: 1 });
          if (pv.width !== sizes[i - 1]!.w || pv.height !== sizes[i - 1]!.h) sizes[i - 1] = { w: pv.width, h: pv.height };
        }
      })();
      undo = engine.annots.undoManager(p);
      let saved: { page?: number; scale?: number; fit?: typeof fit } = {};
      try {
        saved = JSON.parse(localStorage.getItem(`tanden.pdf.pos.${p}`) ?? '{}');
      } catch {
        saved = {};
      }
      fit = saved.fit ?? 'width';
      if (fit === 'custom' && saved.scale) scale = saved.scale;
      else applyFit();
      await tick();
      goto(files.page?.n ?? saved.page ?? 1, 'auto');
      void d.getOutline().then(async (items) => {
        const flat: typeof outline = [];
        const walk = (list: typeof items, depth: number) => {
          for (const it of list ?? []) {
            flat.push({ title: it.title, dest: it.dest, depth });
            if (depth < 3) walk(it.items, depth + 1);
          }
        };
        walk(items, 0);
        outline = flat;
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function close() {
    void doc?.loadingTask.destroy();
    doc = null;
    sizes = [];
    hits = [];
    selected = null;
    picked = null;
    undo?.destroy();
    undo = null;
  }

  onMount(() => {
    const off = engine.annots.onChange((p) => {
      if (p === path) version++;
    });
    const ro = new ResizeObserver(() => {
      if (fit !== 'custom') {
        const before = current;
        applyFit();
        void tick().then(() => goto(before, 'auto'));
      }
    });
    if (scroller) ro.observe(scroller);
    return () => {
      off();
      ro.disconnect();
    };
  });

  // link #page=n pedido de fora com o PDF já aberto
  $effect(() => {
    const req = files.page;
    if (req && doc) untrack(() => goto(req.n));
  });

  /* ------------------------------------------------------- rolagem e zoom */

  function applyFit() {
    if (!scroller || !sizes.length) return;
    const maxW = Math.max(...sizes.map((s) => s.w));
    const w = (scroller.clientWidth - PAD * 2) / maxW;
    const h = (scroller.clientHeight - PAD * 2) / sizes[current - 1]!.h;
    scale = Math.max(0.25, Math.min(5, fit === 'page' ? Math.min(w, h) : w));
  }

  function savePos() {
    try {
      localStorage.setItem(posKey, JSON.stringify({ page: current, scale, fit }));
    } catch {
      // armazenamento cheio ou bloqueado: só não lembra a posição
    }
  }

  function goto(n: number, behavior: ScrollBehavior = 'smooth', yPdf?: number) {
    if (!scroller || !sizes.length) return;
    const p = Math.max(1, Math.min(sizes.length, Math.round(n)));
    let top = tops[p - 1]! - 8;
    if (yPdf !== undefined) top = tops[p - 1]! + (sizes[p - 1]!.h - yPdf) * scale - scroller.clientHeight / 3;
    scroller.scrollTo({ top, behavior });
    current = p;
    pageInput = String(p);
  }

  let scrollRaf = 0;
  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!scroller) return;
      const mid = scroller.scrollTop + scroller.clientHeight * 0.4;
      let p = 1;
      for (let i = 0; i < tops.length; i++) if (tops[i]! <= mid) p = i + 1;
      // páginas à vista e uma de cada lado
      const top = scroller.scrollTop;
      const bottom = top + scroller.clientHeight;
      const vis = new Set<number>();
      for (let i = 0; i < tops.length; i++) {
        const t = tops[i]!;
        const b = t + sizes[i]!.h * scale;
        if (b >= top - scroller.clientHeight && t <= bottom + scroller.clientHeight) vis.add(i + 1);
      }
      if (p !== current) {
        current = p;
        if (document.activeElement?.getAttribute('name') !== 'page') pageInput = String(p);
      }
      if ([...vis].join() !== [...visible].join()) visible = vis;
      savePos();
    });
  }

  $effect(() => {
    void tops;
    void scroller;
    onScroll();
  });

  function modeFor(n: number): 'render' | 'keep' | 'drop' {
    if (visible.has(n)) return 'render';
    const near = [...visible].some((v) => Math.abs(v - n) <= 4);
    return near ? 'keep' : 'drop';
  }

  /** Muda o zoom mantendo o mesmo ponto do documento no centro da tela. */
  async function setScale(next: number, anchor?: { x: number; y: number }) {
    if (!scroller) return;
    next = Math.max(0.25, Math.min(5, next));
    if (Math.abs(next - scale) < 0.001) return;
    const ax = anchor?.x ?? scroller.clientWidth / 2;
    const ay = anchor?.y ?? scroller.clientHeight / 2;
    // ponto do documento sob o cursor: página e distância dentro dela
    const y = scroller.scrollTop + ay;
    let p = 0;
    for (let i = 0; i < tops.length; i++) if (tops[i]! <= y) p = i;
    const off = (y - tops[p]!) / scale;
    const x = (scroller.scrollLeft + ax) / scale;
    fit = 'custom';
    scale = next;
    await tick();
    scroller.scrollTop = tops[p]! + off * next - ay;
    scroller.scrollLeft = x * next - ax;
    savePos();
  }

  function zoomBy(f: number) {
    void setScale(Math.round(scale * f * 100) / 100);
  }

  function setFit(f: 'width' | 'page') {
    const before = current;
    fit = f;
    applyFit();
    void tick().then(() => goto(before, 'auto'));
    savePos();
  }

  // Ctrl+roda e pinça: prévia por CSS na hora, desenho novo quando para
  let zoomTimer: ReturnType<typeof setTimeout> | null = null;
  let zoomAnchor = { x: 0, y: 0 };
  function previewZoom(factor: number, anchor: { x: number; y: number }) {
    zoomPreview = Math.max(0.25 / scale, Math.min(5 / scale, zoomPreview * factor));
    zoomAnchor = anchor;
    if (pagesEl) pagesEl.style.transformOrigin = `${scroller!.scrollLeft + anchor.x}px ${scroller!.scrollTop + anchor.y}px`;
    if (zoomTimer) clearTimeout(zoomTimer);
    zoomTimer = setTimeout(commitZoom, 180);
  }
  async function commitZoom() {
    const f = zoomPreview;
    zoomPreview = 1;
    await setScale(scale * f, zoomAnchor);
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const r = scroller!.getBoundingClientRect();
    previewZoom(Math.exp(-e.deltaY * 0.0022), { x: e.clientX - r.left, y: e.clientY - r.top });
  }

  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; f: number } | null = null;
  function onTouchDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), f: 1 };
    }
  }
  function onTouchMove(e: PointerEvent) {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = scroller!.getBoundingClientRect();
      previewZoom(d / pinch.d / pinch.f, { x: (a!.x + b!.x) / 2 - r.left, y: (a!.y + b!.y) / 2 - r.top });
      pinch.f = d / pinch.d;
    }
  }
  function onTouchUp(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
  }

  /* ---------------------------------------------------------- anotações */

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function create(a: Omit<PdfAnnotation, 'id' | 'created' | 'device'>): string {
    const id = uid();
    engine.annots.edit(path, (e) => e.add({ ...a, id }));
    undo?.stopCapturing();
    engine.boardEdited();
    return id;
  }

  function update(id: string, patch: Partial<PdfAnnotation>) {
    engine.annots.edit(path, (e) => e.update(id, patch));
    engine.boardEdited();
  }

  function remove(id: string) {
    engine.annots.edit(path, (e) => e.remove(id));
    undo?.stopCapturing();
    if (selected === id) selected = null;
    engine.boardEdited();
  }

  function select(id: string | null, at?: { x: number; y: number }) {
    selected = id;
    popAt = id && at ? at : null;
    picked = null;
  }

  function fromPick(kind: 'highlight' | 'underline' | 'strike', comment = false) {
    if (!picked) return;
    const id = create({ page: picked.page, kind, color, rects: picked.rects, text: picked.text });
    const at = picked.at;
    window.getSelection()?.removeAllRanges();
    picked = null;
    if (comment) {
      select(id, at);
      void tick().then(() => document.querySelector<HTMLTextAreaElement>('.pop textarea')?.focus());
    }
  }

  let commentTimer: ReturnType<typeof setTimeout> | null = null;
  function onComment(id: string, text: string) {
    if (commentTimer) clearTimeout(commentTimer);
    commentTimer = setTimeout(() => update(id, { comment: text }), 350);
  }

  function jumpTo(a: PdfAnnotation) {
    const y = a.rects?.[0]?.[3] ?? a.ink?.[0]?.[1];
    goto(a.page, 'smooth', y);
    selected = a.id;
    popAt = null;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      files.say('Copiado.');
    } catch {
      files.say('Não consegui copiar.', { error: true });
    }
  }

  /* -------------------------------------------------------------- busca */

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const q = query;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => untrack(() => void search(q)), 250);
  });

  async function pageText(i: number): Promise<string> {
    if (texts[i - 1] != null) return texts[i - 1]!;
    const tc = await (await doc!.getPage(i)).getTextContent({ disableNormalization: true });
    const t = fold(tc.items.map((it) => ('str' in it ? it.str : '')).join(''));
    texts[i - 1] = t;
    return t;
  }

  async function search(q: string) {
    const needle = fold(q.trim() ? q : '');
    if (!doc || !needle) {
      hits = [];
      return;
    }
    searching = true;
    const out: typeof hits = [];
    const d = doc;
    for (let i = 1; i <= d.numPages; i++) {
      const t = await pageText(i);
      if (d !== doc || needle !== fold(query.trim() ? query : '')) return;
      let k = 0;
      for (let at = t.indexOf(needle); at >= 0; at = t.indexOf(needle, at + needle.length)) out.push({ page: i, k: k++ });
      if (i % 20 === 0) hits = [...out];
    }
    hits = out;
    searching = false;
    // primeira ocorrência a partir da página atual
    const from = out.findIndex((h) => h.page >= current);
    active = from < 0 ? 0 : from;
    if (out.length) goto(out[active]!.page);
  }

  function step(dir: 1 | -1) {
    if (!hits.length) return;
    active = (active + dir + hits.length) % hits.length;
    const h = hits[active]!;
    if (!visible.has(h.page)) goto(h.page);
  }

  const activeFor = (n: number) => (hits.length && hits[active]?.page === n ? hits[active]!.k : -1);

  /* ------------------------------------------------------------ sumário */

  async function openDest(dest: unknown) {
    if (!doc || !dest) return;
    try {
      const explicit = (typeof dest === 'string' ? await doc.getDestination(dest) : dest) as unknown[] | null;
      if (!explicit) return;
      const ref = explicit[0];
      const index = typeof ref === 'number' ? ref : await doc.getPageIndex(ref as { num: number; gen: number });
      const kind = (explicit[1] as { name?: string } | undefined)?.name;
      const y = kind === 'XYZ' && typeof explicit[3] === 'number' ? (explicit[3] as number) : kind === 'FitH' && typeof explicit[2] === 'number' ? (explicit[2] as number) : undefined;
      goto(index + 1, 'smooth', y);
    } catch {
      // destino quebrado no PDF: ignora
    }
  }

  /* ------------------------------------------------------------ exportar */

  async function extractText() {
    if (!doc) return;
    menu = false;
    const pages: PdfTextItem[][] = [];
    await engine.bus.process(`pdftext:${path}`, 'Extraindo o texto do PDF', async () => {
      for (let i = 1; i <= doc!.numPages; i++) {
        const tc = await (await doc!.getPage(i)).getTextContent();
        pages.push(
          tc.items.flatMap((it) =>
            'str' in it ? [{ str: it.str, x: it.transform[4] as number, y: it.transform[5] as number, h: Math.hypot(it.transform[2] as number, it.transform[3] as number) || it.height, w: it.width, hasEOL: it.hasEOL }] : [],
          ),
        );
      }
    });
    if (!pages.some((p) => p.some((i) => i.str.trim()))) {
      files.say('Este PDF não tem texto (é uma imagem escaneada).', { error: true });
      return;
    }
    await files.pdfToNote(path, pages);
  }

  /* ------------------------------------------------------------- teclado */

  function onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchOpen = true;
      void tick().then(() => searchInput?.select());
      return;
    }
    if (e.key === 'Escape') {
      if (picked || selected) select(null);
      else if (searchOpen) searchOpen = false;
      menu = false;
      return;
    }
    if (typing) return;
    if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomBy(1.2);
    } else if (mod && e.key === '-') {
      e.preventDefault();
      zoomBy(1 / 1.2);
    } else if (mod && e.key === '0') {
      e.preventDefault();
      setFit('width');
    } else if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) undo?.redo();
      else undo?.undo();
      version++;
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      undo?.redo();
      version++;
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      remove(selected);
    } else if (!mod && !e.altKey) {
      const t = ({ v: 'select', h: 'highlight', u: 'underline', s: 'strike', n: 'note', p: 'pen', b: 'box', e: 'eraser' } as Record<string, Tool>)[e.key.toLowerCase()];
      if (t) tool = t;
      else if (/^[1-6]$/.test(e.key)) color = COLORS[Number(e.key) - 1]!.hex;
      else if (e.key === 'Home') goto(1);
      else if (e.key === 'End') goto(sizes.length);
    }
  }

  const TOOLS: Array<{ id: Tool; label: string; key: string; icon: string }> = [
    { id: 'select', label: 'Selecionar', key: 'V', icon: 'M5 3l14 8-6 2-2 6z' },
    { id: 'highlight', label: 'Realçar', key: 'H', icon: 'M4 20h7M14 4l6 6-9 9H5v-6z' },
    { id: 'underline', label: 'Sublinhar', key: 'U', icon: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14' },
    { id: 'strike', label: 'Riscar', key: 'S', icon: 'M5 12h14M16 6a4 3 0 0 0-8 1c0 4 8 2 8 6a4 3 0 0 1-8 1' },
    { id: 'note', label: 'Comentário', key: 'N', icon: 'M4 5h16v11H9l-5 4z' },
    { id: 'pen', label: 'Caneta', key: 'P', icon: 'M3 21l3-1 12-12-2-2L4 18zM14 6l2 2' },
    { id: 'box', label: 'Caixa', key: 'B', icon: 'M4 6h16v12H4z' },
    { id: 'eraser', label: 'Borracha', key: 'E', icon: 'M8 20h12M5 15l8-8 6 6-5 5H9z' },
  ];

  const KIND_LABEL: Record<PdfAnnotation['kind'], string> = {
    highlight: 'Realce',
    underline: 'Sublinhado',
    strike: 'Riscado',
    note: 'Comentário',
    ink: 'Desenho',
    box: 'Caixa',
  };

  // menu flutuante perto do clique, sem sair da tela
  const clampX = (x: number, w: number) => Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2));
  const clampY = (y: number, h: number) => (y + h + 24 > window.innerHeight ? Math.max(8, y - h - 16) : y + 16);
</script>

<svelte:window onkeydown={onKey} onpointerdown={(e) => {
  const t = e.target as Element;
  if (menu && !t.closest('.menu-wrap')) menu = false;
  if (popAt && !t.closest('.pop, .page')) select(null);
  if (picked && !t.closest('.pick, .page')) picked = null;
}} />

<div class="pdf">
  <header class="bar">
    <div class="group">
      <button class="icon" class:on={side !== null} onclick={() => (side = side ? null : 'annots')} title="Painel de anotações e sumário" aria-label="Painel">
        <svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM10 5v14" /></svg>
      </button>
      <form class="pageno" onsubmit={(e) => { e.preventDefault(); goto(Number(pageInput) || 1); (document.activeElement as HTMLElement)?.blur(); }}>
        <input name="page" bind:value={pageInput} inputmode="numeric" aria-label="Página" />
        <span>/ {sizes.length || '–'}</span>
      </form>
      <span class="div"></span>
      <button class="icon" onclick={() => zoomBy(1 / 1.2)} title="Diminuir (Ctrl −)" aria-label="Diminuir">−</button>
      <button class="zoom" onclick={() => setFit(fit === 'width' ? 'page' : 'width')} title="Ajustar à largura / à página (Ctrl 0)">
        {Math.round(scale * zoomPreview * 100)}%
      </button>
      <button class="icon" onclick={() => zoomBy(1.2)} title="Aumentar (Ctrl +)" aria-label="Aumentar">+</button>
    </div>

    <div class="group tools" role="toolbar" aria-label="Ferramentas de anotação">
      {#each TOOLS as t (t.id)}
        <button class="icon" class:on={tool === t.id} onclick={() => (tool = t.id)} title="{t.label} ({t.key})" aria-label={t.label} aria-pressed={tool === t.id}>
          <svg viewBox="0 0 24 24"><path d={t.icon} /></svg>
        </button>
      {/each}
      <span class="div"></span>
      {#each COLORS as c, i (c.hex)}
        <button class="swatch" class:on={color === c.hex} style:--c={c.hex} onclick={() => { color = c.hex; if (selAnnot) update(selAnnot.id, { color: c.hex }); }}
          title="{c.name} ({i + 1})" aria-label={c.name}></button>
      {/each}
      {#if tool === 'pen'}
        <input class="width" type="range" min="0.5" max="8" step="0.5" bind:value={penWidth} title="Espessura" aria-label="Espessura da caneta" />
      {/if}
    </div>

    <div class="group end">
      <button class="icon" class:on={searchOpen} onclick={() => { searchOpen = !searchOpen; if (searchOpen) void tick().then(() => searchInput?.focus()); }} title="Buscar (Ctrl+F)" aria-label="Buscar">
        <svg viewBox="0 0 24 24"><path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 21 21" /></svg>
      </button>
      <div class="menu-wrap">
        <button onclick={() => (menu = !menu)} aria-haspopup="menu" disabled={!doc}>Exportar ▾</button>
        {#if menu}
          <div class="menu" role="menu">
            <button role="menuitem" onclick={() => { menu = false; files.annotationsNote(path); }}>Nota com as anotações<small>{annots.length}</small></button>
            <button role="menuitem" onclick={() => { menu = false; void files.exportAnnotated(path); }}>PDF com as anotações<small>abre em qualquer leitor</small></button>
            <button role="menuitem" onclick={() => void extractText()}>Texto do PDF para nota</button>
            <button role="menuitem" onclick={() => { menu = false; void copy(`[[${path}#page=${current}]]`); }}>Copiar link desta página<small>p. {current}</small></button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  {#if searchOpen}
    <div class="search">
      <input bind:this={searchInput} bind:value={query} placeholder="Buscar no PDF" aria-label="Buscar no PDF"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } }} />
      <span class="count">{#if searching}buscando…{:else if query.trim()}{hits.length ? `${active + 1} de ${hits.length}` : 'nada encontrado'}{/if}</span>
      <button class="icon" onclick={() => step(-1)} disabled={!hits.length} aria-label="Anterior">↑</button>
      <button class="icon" onclick={() => step(1)} disabled={!hits.length} aria-label="Próxima">↓</button>
      <button class="icon" onclick={() => { searchOpen = false; query = ''; }} aria-label="Fechar busca">×</button>
    </div>
  {/if}

  <div class="body">
    {#if side}
      <aside class="side">
        <div class="tabs" role="tablist">
          <button role="tab" class:on={side === 'annots'} aria-selected={side === 'annots'} onclick={() => (side = 'annots')}>Anotações <b>{annots.length}</b></button>
          <button role="tab" class:on={side === 'outline'} aria-selected={side === 'outline'} onclick={() => (side = 'outline')} disabled={!outline.length}>Sumário</button>
        </div>
        {#if side === 'annots'}
          {#if !annots.length}
            <p class="hint">Selecione um trecho e escolha <b>Realçar</b>, ou use as ferramentas acima. As anotações sincronizam entre os aparelhos e o PDF original não é alterado.</p>
          {/if}
          <ul class="alist">
            {#each annots as a (a.id)}
              <li>
                <button class:on={a.id === selected} onclick={() => jumpTo(a)} style:--c={a.color}>
                  <span class="meta"><i></i>{KIND_LABEL[a.kind]} · p. {a.page}</span>
                  {#if a.text}<span class="quote">{a.text}</span>{/if}
                  {#if a.comment}<span class="comment">{a.comment}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <ul class="outline">
            {#each outline as o, i (i)}
              <li style:padding-left="{8 + o.depth * 14}px"><button onclick={() => void openDest(o.dest)}>{o.title}</button></li>
            {/each}
          </ul>
        {/if}
      </aside>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scroller" class:pan={tool === 'select'} bind:this={scroller} onscroll={onScroll} onwheel={onWheel}
      onpointerdown={onTouchDown} onpointermove={onTouchMove} onpointerup={onTouchUp} onpointercancel={onTouchUp}>
      {#if error}
        <p class="err">Não consegui abrir o PDF: {error}</p>
      {:else if !doc}
        <p class="loading">Abrindo {name}…</p>
      {:else}
        <div class="pages" bind:this={pagesEl} style:transform={zoomPreview !== 1 ? `scale(${zoomPreview})` : ''} style:padding="{PAD}px">
          {#each sizes as s, i (i)}
            <div class="slot" style:height="{Math.floor(s.h * scale)}px" style:margin-bottom="{GAP}px">
              <PdfPage {doc} num={i + 1} {scale} base={s} mode={modeFor(i + 1)} annots={byPage.get(i + 1) ?? []} {tool} {color} {penWidth}
                {selected} query={searchOpen ? query.trim() : ''} activeHit={activeFor(i + 1)}
                onCreate={create} onSelect={select} onErase={remove} onTextPicked={(p) => (picked = p)} />
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if picked}
    <div class="pick" role="toolbar" aria-label="Trecho selecionado" style:left="{clampX(picked.at.x, 330)}px" style:top="{clampY(picked.at.y, 40)}px">
      <button onclick={() => fromPick('highlight')}><i style:--c={color}></i>Realçar</button>
      <button onclick={() => fromPick('underline')}>Sublinhar</button>
      <button onclick={() => fromPick('strike')}>Riscar</button>
      <button onclick={() => fromPick('highlight', true)}>Comentar</button>
      <button onclick={() => { void copy(picked!.text); picked = null; }}>Copiar</button>
    </div>
  {/if}

  {#if selAnnot && popAt}
    {#key selAnnot.id}
      <div class="pop" role="dialog" aria-label="Anotação" style:left="{clampX(popAt.x, 290)}px" style:top="{clampY(popAt.y, 210)}px">
        <header>
          <span>{KIND_LABEL[selAnnot.kind]} · p. {selAnnot.page}</span>
          <button class="x" onclick={() => select(null)} aria-label="Fechar">×</button>
        </header>
        {#if selAnnot.text}<blockquote>{selAnnot.text}</blockquote>{/if}
        <textarea placeholder="Escreva um comentário…" value={selAnnot.comment ?? ''} oninput={(e) => onComment(selAnnot.id, e.currentTarget.value)}
          use:focusIf={selAnnot.kind === 'note' && !selAnnot.comment}></textarea>
        <footer>
          <div class="colors">
            {#each COLORS as c (c.hex)}
              <button class="swatch" class:on={selAnnot.color === c.hex} style:--c={c.hex} onclick={() => update(selAnnot.id, { color: c.hex })} aria-label={c.name}></button>
            {/each}
          </div>
          {#if selAnnot.text}<button onclick={() => void copy(selAnnot.text ?? '')}>Copiar</button>{/if}
          <button class="danger" onclick={() => remove(selAnnot.id)}>Apagar</button>
        </footer>
      </div>
    {/key}
  {/if}
</div>

<script module lang="ts">
  function focusIf(el: HTMLTextAreaElement, yes: boolean) {
    if (yes) queueMicrotask(() => el.focus());
  }
</script>

<style>
  .pdf { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 7px 10px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .group { display: flex; align-items: center; gap: 4px; }
  .tools { flex-wrap: wrap; }
  .end { margin-left: auto; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 5px 10px; font-size: 12.5px; color: var(--ink); }
  button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  button:disabled { opacity: .45; }
  .icon { min-width: 30px; height: 30px; padding: 0 6px; display: inline-grid; place-items: center; font-size: 15px; }
  .icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .icon.on { color: var(--ember); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 12%, var(--surface-2)); }
  .zoom { min-width: 58px; font: 12px var(--f-mono); }
  .div { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
  .pageno { display: flex; align-items: center; gap: 4px; font: 12px var(--f-mono); color: var(--muted); }
  .pageno input { width: 42px; text-align: center; border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 7px; padding: 5px 4px; font: inherit; }
  .swatch { width: 20px; height: 20px; padding: 0; border-radius: 50%; background: var(--c); border: 2px solid transparent; box-shadow: inset 0 0 0 1px rgb(0 0 0 / .25); }
  .swatch.on { border-color: var(--ink); box-shadow: 0 0 0 2px var(--void), 0 0 10px var(--c); }
  .width { width: 80px; accent-color: var(--ember); }
  .menu-wrap { position: relative; }
  .menu { position: absolute; z-index: 30; top: calc(100% + 6px); right: 0; min-width: 250px; display: grid; gap: 2px; padding: 6px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 20px 40px -16px #000, 0 0 0 1px var(--ember-glow);
    animation: rise .14s cubic-bezier(.2, .8, .2, 1); }
  .menu button { border: 0; background: none; text-align: left; display: flex; justify-content: space-between; gap: 10px; }
  .menu button:hover { background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .menu small { color: var(--muted); font: 11px var(--f-mono); }
  @keyframes rise { from { opacity: 0; transform: translateY(-4px); } }

  .search { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--surface);
    animation: rise .16s cubic-bezier(.2, .8, .2, 1); }
  .search input { flex: 1; max-width: 360px; border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 8px; padding: 6px 10px; font: inherit; }
  .search input:focus { outline: none; border-color: var(--ember); }
  .count { font: 11.5px var(--f-mono); color: var(--muted); min-width: 90px; }

  .body { flex: 1; min-height: 0; display: flex; }
  .side { width: 290px; flex: none; border-right: 1px solid var(--line); background: var(--surface); display: flex; flex-direction: column; min-height: 0; }
  .tabs { display: flex; gap: 2px; padding: 8px 8px 0; border-bottom: 1px solid var(--line); }
  .tabs button { border: 0; border-radius: 8px 8px 0 0; background: none; color: var(--muted); border-bottom: 2px solid transparent;
    font: 600 11px/1 var(--f-display); letter-spacing: .12em; text-transform: uppercase; padding: 9px 10px; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .tabs b { color: var(--ember); font-family: var(--f-mono); }
  .hint { margin: 14px; color: var(--muted); font-size: 12.5px; }
  .alist, .outline { list-style: none; margin: 0; padding: 6px; overflow-y: auto; display: grid; gap: 4px; align-content: start; }
  .alist button { width: 100%; text-align: left; display: grid; gap: 4px; border-color: transparent; background: none; padding: 8px 10px;
    border-left: 3px solid var(--c); border-radius: 6px; }
  .alist button:hover, .alist button.on { background: var(--surface-2); }
  .meta { display: flex; align-items: center; gap: 6px; font: 10.5px var(--f-mono); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  .quote { font-size: 12.5px; color: var(--silver); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .comment { font-size: 12.5px; color: var(--ink); white-space: pre-wrap; }
  .outline button { width: 100%; text-align: left; border: 0; background: none; padding: 6px 8px; color: var(--silver); }
  .outline button:hover { background: var(--surface-2); color: var(--ink); }

  .scroller { flex: 1; min-width: 0; overflow: auto; position: relative; background: var(--void); touch-action: pan-x pan-y; }
  .pages { transform-origin: 0 0; width: max-content; min-width: 100%; box-sizing: border-box; transition: none; }
  .slot { display: flex; justify-content: center; }
  .loading, .err { margin: 40px auto; text-align: center; color: var(--muted); }
  .err { color: var(--crit); }

  .pick, .pop { position: fixed; z-index: 40; background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: 0 20px 40px -16px #000, 0 0 0 1px var(--ember-glow); animation: rise .14s cubic-bezier(.2, .8, .2, 1); }
  .pick { display: flex; gap: 2px; padding: 4px; }
  .pick button { border: 0; background: none; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .pick button:hover { background: color-mix(in srgb, var(--ember) 12%, transparent); }
  .pick i { width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
  .pop { width: 290px; padding: 10px; display: grid; gap: 8px; }
  .pop header { display: flex; justify-content: space-between; align-items: center; font: 10.5px var(--f-mono); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
  .pop .x { border: 0; background: none; font-size: 17px; padding: 0 4px; color: var(--muted); }
  .pop blockquote { margin: 0; padding: 4px 8px; border-left: 3px solid var(--ember); color: var(--silver); font-size: 12.5px; max-height: 90px; overflow: auto; }
  .pop textarea { width: 100%; min-height: 72px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; background: var(--void); color: var(--ink); padding: 8px; font: inherit; }
  .pop textarea:focus { outline: none; border-color: var(--ember); }
  .pop footer { display: flex; align-items: center; gap: 6px; }
  .colors { display: flex; gap: 4px; margin-right: auto; }
  .danger { color: var(--crit); }

  @media (max-width: 720px) {
    .side { position: absolute; z-index: 20; top: 0; bottom: 0; left: 0; width: min(300px, 86vw); box-shadow: 0 0 40px #000; }
    .body { position: relative; }
    .bar { gap: 6px; }
    .tools { order: 3; width: 100%; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
    .div { display: none; }
  }
</style>
