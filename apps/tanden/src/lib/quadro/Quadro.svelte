<script lang="ts">
  import type { BoardData, BoardEdit, BoardKind, BoardStore, CanvasNode, InkStroke } from '@tanden/core';
  import { untrack } from 'svelte';
  import { engine } from '../engine.svelte';
  import {
    PALETTE, arrowHead, center, colorOf, edgePath, facing, inkOutline, layoutMindMap, recognize, shapePath,
    strokeHit, thin, treeOf, uid, type Box, type Pt, type Side,
  } from './geometry';

  // Quadros: mapa mental, workflow e desenho no mesmo espaço infinito.
  // Tudo é gravado em .canvas (JSON Canvas), que o Obsidian também abre.

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  type Tool = 'select' | 'card' | 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'eraser';
  const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
    { id: 'select', label: 'Selecionar e mover', key: 'V', icon: 'M5 3l13 8-6 1.5L9 19z' },
    { id: 'card', label: 'Caixa de texto', key: 'T', icon: 'M4 6h16v12H4z M8 10h8 M8 14h5' },
    { id: 'pen', label: 'Caneta', key: 'P', icon: 'M4 20c3-1 5-4 8-8l4-4 2 2-4 4c-4 3-7 5-8 8z M15 7l2 2' },
    { id: 'line', label: 'Linha', key: 'L', icon: 'M5 19L19 5' },
    { id: 'arrow', label: 'Seta', key: 'A', icon: 'M5 19L19 5 M11 5h8v8' },
    { id: 'rect', label: 'Retângulo', key: 'R', icon: 'M4 6h16v12H4z' },
    { id: 'ellipse', label: 'Elipse', key: 'O', icon: 'M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z' },
    { id: 'eraser', label: 'Borracha', key: 'E', icon: 'M7 19h11 M5 15l8-9 6 6-7 7H9z' },
  ];
  const INK_COLORS = ['#ecebf0', '#ff8a3d', '#ffc08a', '#7fd1a8', '#6cc6e0', '#ff6b6b'];
  const GRID = 20;
  const KINDS: Record<BoardKind, { label: string; hint: string }> = {
    mapa: { label: 'Mapa mental', hint: 'Tab cria um filho, Enter cria um irmão. O mapa se organiza sozinho.' },
    fluxo: { label: 'Workflow', hint: 'Caixas ligadas por setas. Arraste pelos pontos laterais para ligar.' },
    livre: { label: 'Desenho', hint: 'Caneta, formas técnicas e caixas. Com a mesa digitalizadora, a pressão vale.' },
  };

  let path = $state<string | null>(null);
  let data = $state<BoardData | null>(null);
  let view = $state({ x: 0, y: 0, k: 1 });
  let tool = $state<Tool>('select');
  let inkColor = $state(INK_COLORS[0]!);
  let inkWidth = $state(3);
  let snapShapes = $state(true);
  let gridSnap = $state(false);
  let selection = $state<string[]>([]);
  let selEdge = $state<string | null>(null);
  let editing = $state<string | null>(null);
  let draft = $state('');
  let edgeEditing = $state<string | null>(null);
  let edgeDraft = $state('');
  let menu = $state<'boards' | 'notes' | null>(null);
  let newName = $state('');
  let noteQuery = $state('');
  /** caixas que acabaram de chegar de outro aparelho: brilham um instante */
  let arrived = $state<string[]>([]);
  /** dado viajando por uma seta recém-criada (pai → filho) */
  let pulses = $state<{ id: number; edge: string }[]>([]);
  let settling = $state(false);

  // interação em andamento (não precisa ser reativa, exceto as prévias)
  let move = $state<{ ids: string[]; dx: number; dy: number } | null>(null);
  let resize = $state<{ id: string; w: number; h: number } | null>(null);
  let live = $state<InkStroke | null>(null);
  let linking = $state<{ from: string; side: Side; to: Pt; target: string | null } | null>(null);
  let marquee = $state<{ a: Pt; b: Pt } | null>(null);
  let erasing = $state<string[]>([]);

  let stage = $state<HTMLDivElement>();
  let undo: ReturnType<BoardStore['undoManager']> | null = null;
  let pulseSeq = 0;

  const kind = $derived<BoardKind>(data?.kind ?? 'livre');
  const byId = $derived(new Map((data?.nodes ?? []).map((n) => [n.id, n])));
  const tree = $derived(data && kind === 'mapa' && data.nodes.length ? treeOf(data.nodes, data.edges, rootGuess(data)) : null);
  const groups = $derived((data?.nodes ?? []).filter((n) => n.type === 'group'));
  const cards = $derived((data?.nodes ?? []).filter((n) => n.type !== 'group'));
  const title = (p: string) => p.replace(/\.canvas$/, '').split('/').pop()!;

  // ---------- tamanho do texto ----------

  const measureCtx = document.createElement('canvas').getContext('2d');
  /** Tamanho de um tópico pelo texto medido de verdade, na fonte que ele usa. */
  function fitText(text: string, which: 'raiz' | 'ramo'): { width: number; height: number } {
    const root = which === 'raiz';
    const lineH = root ? 22 : 20, pad = root ? 46 : 40;
    const max = root ? 320 : 260, min = root ? 140 : 72;
    const lines = (text || ' ').split('\n').map((l) => l.replace(/^#+\s*/, '').replace(/\*\*|`/g, '') || ' ');
    let widths = lines.map((l) => l.length * (root ? 10.5 : 8));
    if (measureCtx) {
      measureCtx.font = root ? '600 17px "Chakra Petch"' : '400 14px Manrope';
      widths = lines.map((l) => measureCtx.measureText(l).width);
    }
    const width = Math.ceil(Math.min(max, Math.max(min, Math.max(...widths) + pad)));
    const rows = widths.reduce((s, w) => s + Math.max(1, Math.ceil((w - 1) / (width - pad))), 0);
    return { width, height: Math.round(rows * lineH + (root ? 28 : 18)) };
  }

  // ---------- abrir e salvar ----------

  function rootGuess(d: BoardData): string {
    const hasParent = new Set(d.edges.map((e) => e.toNode));
    return d.nodes.find((n) => n.type !== 'group' && !hasParent.has(n.id))?.id ?? d.nodes[0]!.id;
  }

  function open(p: string | null): void {
    undo?.destroy();
    undo = null;
    path = p;
    selection = [];
    selEdge = null;
    editing = null;
    if (!p) {
      data = null;
      return;
    }
    data = engine.boards.read(p);
    undo = engine.boards.undoManager(p);
    try {
      localStorage.setItem('tanden.quadro.last', p);
      const saved = localStorage.getItem(`tanden.quadro.view.${p}`);
      if (saved) view = JSON.parse(saved);
      else requestAnimationFrame(fit);
    } catch {
      requestAnimationFrame(fit);
    }
    tool = data.kind === 'livre' && data.nodes.length === 0 ? 'pen' : 'select';
  }

  // primeira abertura: último quadro usado
  $effect(() => {
    const list = engine.boardList;
    untrack(() => {
      if (path && list.includes(path)) return;
      let last: string | null = null;
      try {
        last = localStorage.getItem('tanden.quadro.last');
      } catch {}
      open(last && list.includes(last) ? last : (list[0] ?? null));
    });
  });

  // mudança vinda de outro aparelho ou do Obsidian
  $effect(() => {
    engine.boardRev;
    untrack(() => {
      if (!path || !engine.boards.has(path)) return;
      const before = new Map((data?.nodes ?? []).map((n) => [n.id, JSON.stringify(n)]));
      data = engine.boards.read(path);
      const changed = data.nodes.filter((n) => before.get(n.id) !== JSON.stringify(n)).map((n) => n.id);
      if (changed.length && before.size) {
        arrived = changed;
        setTimeout(() => (arrived = []), 1400);
      }
      selection = selection.filter((id) => data!.nodes.some((n) => n.id === id));
    });
  });

  $effect(() => {
    const v = view;
    const p = path;
    if (!p) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`tanden.quadro.view.${p}`, JSON.stringify(v));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  });

  function change(fn: (e: BoardEdit) => void): void {
    if (!path) return;
    engine.boards.edit(path, fn);
    data = engine.boards.read(path);
    engine.boardEdited();
  }

  function createBoard(k: BoardKind): void {
    const base = newName.trim().replace(/[\\/:*?"<>|]/g, '') || KINDS[k].label;
    let p = `Quadros/${base}.canvas`;
    let n = 1;
    while (engine.boards.has(p)) p = `Quadros/${base} ${++n}.canvas`;
    const rootId = uid();
    engine.boards.create(p, k, (e) => {
      const rootText = base === KINDS.mapa.label ? 'Ideia central' : base;
      if (k === 'mapa') e.setNode({ id: rootId, type: 'text', text: rootText, x: -90, y: -30, ...fitText(rootText, 'raiz') });
      if (k === 'fluxo') {
        const a = uid(), b = uid();
        e.setNode({ id: a, type: 'text', text: 'Início', x: -260, y: -40, width: 200, height: 80, color: '2' });
        e.setNode({ id: b, type: 'text', text: 'Próxima etapa', x: 60, y: -40, width: 200, height: 80 });
        e.setEdge({ id: uid(), fromNode: a, fromSide: 'right', toNode: b, toSide: 'left', toEnd: 'arrow' });
      }
    });
    engine.boardList = engine.boards.list();
    newName = '';
    menu = null;
    tool = k === 'livre' ? 'pen' : 'select';
    open(p);
    view = { x: (stage?.clientWidth ?? 800) / 2, y: (stage?.clientHeight ?? 600) / 2, k: 1 };
    if (k === 'mapa') {
      selection = [rootId];
      startEdit(rootId);
    }
    engine.boardEdited();
  }

  // ---------- coordenadas ----------

  function toWorld(cx: number, cy: number): Pt {
    const r = stage!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  }
  const snap = (v: number) => (gridSnap ? Math.round(v / GRID) * GRID : v);

  function zoomAt(cx: number, cy: number, factor: number): void {
    const r = stage!.getBoundingClientRect();
    const k = Math.min(4, Math.max(0.15, view.k * factor));
    const px = cx - r.left, py = cy - r.top;
    view = { k, x: px - ((px - view.x) / view.k) * k, y: py - ((py - view.y) / view.k) * k };
  }

  /** Enquadra todo o conteúdo na tela. */
  function fit(): void {
    if (!stage || !data) return;
    const boxes: Box[] = [...data.nodes];
    for (const s of data.ink) {
      const xs = s.points.filter((_, i) => i % 3 === 0), ys = s.points.filter((_, i) => i % 3 === 1);
      if (xs.length) boxes.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
    }
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!boxes.length) {
      view = { x: W / 2, y: H / 2, k: 1 };
      return;
    }
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
    const k = Math.min(1.4, Math.max(0.15, Math.min((W - 80) / Math.max(1, x1 - x0), (H - 140) / Math.max(1, y1 - y0))));
    view = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k + 10 };
  }

  // ---------- caixas ----------

  function shown(n: CanvasNode): Box {
    let { x, y, width, height } = n;
    if (move?.ids.includes(n.id)) {
      x += move.dx;
      y += move.dy;
    }
    if (resize?.id === n.id) {
      width = resize.w;
      height = resize.h;
    }
    if (editing === n.id && kind === 'mapa') {
      // o tópico cresce enquanto você digita, a partir do centro
      const f = fitText(draft || ' ', n.id === tree?.root ? 'raiz' : 'ramo');
      x += (width - f.width) / 2;
      y += (height - f.height) / 2;
      ({ width, height } = f);
    }
    return { x, y, width, height };
  }

  function addCard(at: Pt, text = ''): string {
    const id = uid();
    const size = kind === 'mapa' ? fitText(text || 'Novo', 'ramo') : { width: 220, height: 70 };
    change((e) => e.setNode({ id, type: 'text', text, x: snap(at.x - size.width / 2), y: snap(at.y - size.height / 2), ...size }));
    selection = [id];
    startEdit(id);
    return id;
  }

  /** cor do ramo: filhos da raiz ganham cores em sequência; netos herdam */
  function branchColor(parentId: string): string | undefined {
    if (!tree) return undefined;
    if (parentId === tree.root) {
      const used = (tree.children.get(tree.root) ?? []).length;
      return String((used % 6) + 1);
    }
    return byId.get(parentId)?.color;
  }

  function addChild(parentId: string): void {
    const parent = byId.get(parentId);
    if (!parent) return;
    const id = uid(), edge = uid();
    const size = kind === 'mapa' ? fitText('Novo tópico', 'ramo') : { width: 200, height: 80 };
    const color = kind === 'mapa' ? branchColor(parentId) : undefined;
    const below = kind !== 'mapa';
    // no mapa: o filho vai para o fim da fila dos irmãos, e os galhos da raiz para o lado mais leve
    let x = parent.x, y = parent.y + parent.height + 60;
    if (!below && tree) {
      const root = byId.get(tree.root)!;
      const rc = root.x + root.width / 2;
      const siblings = (tree.children.get(parentId) ?? []).map((k) => byId.get(k)).filter((n): n is CanvasNode => !!n);
      let leftSide = parent.x + parent.width / 2 < rc;
      if (parentId === tree.root) {
        const weight = (left: boolean) => siblings.filter((n) => n.x + n.width / 2 < rc === left).length;
        leftSide = weight(true) < weight(false);
      }
      const same = siblings.filter((n) => n.x + n.width / 2 < rc === leftSide);
      x = leftSide ? parent.x - 70 - size.width : parent.x + parent.width + 70;
      y = same.length ? Math.max(...same.map((n) => n.y)) + 1 : parent.y;
    }
    change((e) => {
      e.setNode({ id, type: 'text', text: '', ...size, color, x, y });
      e.setEdge({
        id: edge, fromNode: parentId, toNode: id,
        fromSide: below ? 'bottom' : undefined, toSide: below ? 'top' : undefined,
        toEnd: kind === 'mapa' ? 'none' : 'arrow',
      });
    });
    if (kind === 'mapa') organize(false);
    firePulse(edge);
    selection = [id];
    startEdit(id);
  }

  function addSibling(id: string): void {
    const p = tree?.parent.get(id);
    if (p) addChild(p);
    else if (byId.get(id)) addCard({ x: byId.get(id)!.x + byId.get(id)!.width / 2, y: byId.get(id)!.y + byId.get(id)!.height + 70 });
  }

  function firePulse(edge: string): void {
    const p = { id: ++pulseSeq, edge };
    pulses = [...pulses, p];
    setTimeout(() => (pulses = pulses.filter((x) => x.id !== p.id)), 900);
  }

  function startEdit(id: string): void {
    const n = byId.get(id) ?? engine.boards.read(path!).nodes.find((x) => x.id === id);
    if (!n || n.type === 'file') return;
    editing = id;
    draft = n.type === 'group' ? (n.label ?? '') : n.type === 'link' ? (n.url ?? '') : (n.text ?? '');
  }

  function commitEdit(): void {
    const id = editing;
    if (!id) return;
    editing = null;
    const n = byId.get(id);
    if (!n) return;
    const text = draft;
    if (kind === 'mapa' && !text.trim() && tree && id !== tree.root && !(tree.children.get(id)?.length)) {
      // tópico novo deixado em branco: some, como no XMind
      const parent = tree.parent.get(id);
      change((e) => e.deleteNode(id));
      selection = parent ? [parent] : [];
      organize(false);
      return;
    }
    change((e) => {
      if (n.type === 'group') e.setNode({ id, label: text });
      else if (n.type === 'link') e.setNode({ id, url: text });
      else if (kind === 'mapa') e.setNode({ id, text, ...fitText(text, id === tree?.root ? 'raiz' : 'ramo') });
      else e.setNode({ id, text, height: Math.max(n.height, fitText(text, 'ramo').height) });
    });
    if (kind === 'mapa') organize(false);
    stage?.focus();
  }

  function organize(animate = true): void {
    if (!data || !tree || !path) return;
    const fresh = engine.boards.read(path);
    const pos = layoutMindMap(fresh.nodes, fresh.edges, selection[0] ?? tree.root);
    if (animate) {
      settling = true;
      setTimeout(() => (settling = false), 450);
    }
    change((e) => {
      for (const [id, p] of pos) {
        const n = fresh.nodes.find((x) => x.id === id)!;
        if (n.x !== p.x || n.y !== p.y) e.setNode({ id, x: p.x, y: p.y });
      }
    });
  }

  function deleteSelection(): void {
    if (selEdge) {
      const id = selEdge;
      change((e) => e.deleteEdge(id));
      selEdge = null;
      return;
    }
    if (!selection.length) return;
    // no mapa, apagar um tópico leva junto os galhos dele
    const ids = new Set(selection);
    if (tree) {
      const stack = [...ids];
      while (stack.length) for (const c of tree.children.get(stack.pop()!) ?? []) if (!ids.has(c)) (ids.add(c), stack.push(c));
    }
    const parent = tree?.parent.get(selection[0]!);
    change((e) => ids.forEach((id) => e.deleteNode(id)));
    selection = parent && byId.has(parent) ? [parent] : [];
    if (kind === 'mapa') organize(false);
  }

  function setColor(c: string | undefined): void {
    if (selEdge) {
      const id = selEdge;
      change((e) => e.setEdge({ id, color: c }));
    } else if (selection.length) {
      const ids = [...selection];
      change((e) => ids.forEach((id) => e.setNode({ id, color: c })));
    }
  }

  function groupSelection(): void {
    const nodes = selection.map((id) => byId.get(id)).filter((n): n is CanvasNode => !!n);
    if (!nodes.length) return;
    const pad = 30;
    const x0 = Math.min(...nodes.map((n) => n.x)) - pad, y0 = Math.min(...nodes.map((n) => n.y)) - pad - 20;
    const x1 = Math.max(...nodes.map((n) => n.x + n.width)) + pad, y1 = Math.max(...nodes.map((n) => n.y + n.height)) + pad;
    const id = uid();
    change((e) => e.setNode({ id, type: 'group', label: 'Grupo', x: x0, y: y0, width: x1 - x0, height: y1 - y0 }));
    selection = [id];
    startEdit(id);
  }

  function insertNote(p: string): void {
    const r = stage!.getBoundingClientRect();
    const at = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const id = uid();
    change((e) => e.setNode({ id, type: 'file', file: p, x: snap(at.x - 130), y: snap(at.y - 70), width: 260, height: 140 }));
    selection = [id];
    menu = null;
  }

  function preview(file: string | undefined): string {
    if (!file || !engine.vault?.has(file)) return file ? 'Nota não encontrada neste aparelho.' : '';
    return engine.vault.read(file).replace(/^#.*\n+/, '').slice(0, 220);
  }

  // ---------- texto das caixas (markdown leve) ----------

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  function md(text: string): string {
    return text
      .split('\n')
      .map((line) => {
        let l = esc(line)
          .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
          .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>')
          .replace(/`(.+?)`/g, '<code>$1</code>')
          .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t: string, a?: string) => `<a data-note="${t}">${a ?? t}</a>`);
        const h = /^(#{1,3})\s+(.*)$/.exec(l);
        if (h) return `<span class="h${h[1]!.length}">${h[2]}</span>`;
        if (/^[-*]\s+/.test(line)) l = `<span class="li">${l.replace(/^[-*]\s+/, '')}</span>`;
        if (/^- \[[ xX]\]\s/.test(line)) l = `<span class="li ${/\[[xX]\]/.test(line) ? 'done' : ''}">${esc(line.slice(6))}</span>`;
        return l || '&nbsp;';
      })
      .join('<br>');
  }

  // ---------- ponteiro: mover, ligar, desenhar, navegar ----------

  const pointers = new Map<number, { x: number; y: number; type: string }>();
  let gesture:
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
    | { kind: 'pinch'; d: number; k: number; cx: number; cy: number; vx: number; vy: number }
    | { kind: 'move'; start: Pt; ids: string[]; moved: boolean }
    | { kind: 'resize'; id: string; start: Pt; w: number; h: number }
    | { kind: 'ink' | 'shape' | 'erase' | 'link' | 'marquee' }
    | null = null;
  let penActive = false;

  function onPointerDown(e: PointerEvent): void {
    const t = e.target as Element;
    if (t.closest('textarea, input, .bar, .tools, .menu')) return;
    // mesa digitalizadora ou caneta ativa: a palma da mão não vale
    if (e.pointerType === 'touch' && penActive) return;
    if (e.pointerType === 'pen') penActive = true;
    stage!.focus({ preventScroll: true });
    if (editing) commitEdit();
    if (edgeEditing) commitEdgeLabel();
    menu = null;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    stage!.setPointerCapture(e.pointerId);

    if (pointers.size === 2) {
      // dois dedos: zoom e arrasto, cancelando o que o primeiro dedo começou
      live = null;
      move = null;
      linking = null;
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: view.k, cx: (a!.x + b!.x) / 2, cy: (a!.y + b!.y) / 2, vx: view.x, vy: view.y };
      return;
    }
    if (pointers.size > 2) return;

    const w = toWorld(e.clientX, e.clientY);
    const pressure = e.pointerType === 'mouse' ? 0.5 : e.pressure || 0.5;
    const nodeEl = t.closest('[data-node]') as HTMLElement | null;
    const nodeId = nodeEl?.dataset.node ?? null;
    const drawTool = tool === 'pen' || tool === 'line' || tool === 'arrow' || tool === 'rect' || tool === 'ellipse';

    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: true };
      return;
    }
    if (tool === 'eraser') {
      gesture = { kind: 'erase' };
      eraseAt(w);
      return;
    }
    // caneta sempre desenha no vazio, mesmo na ferramenta de seleção
    if (drawTool || (e.pointerType === 'pen' && tool === 'select' && !nodeId)) {
      const p = { x: snapIf(w.x), y: snapIf(w.y) };
      const t2: InkStroke['tool'] = drawTool ? (tool as InkStroke['tool']) : 'pen';
      live = { id: uid(), tool: t2, color: inkColor, width: inkWidth, points: t2 === 'pen' ? [w.x, w.y, pressure] : [p.x, p.y, 0.5, p.x, p.y, 0.5] };
      gesture = { kind: t2 === 'pen' ? 'ink' : 'shape' };
      selection = [];
      return;
    }
    const handle = t.closest('[data-handle]') as HTMLElement | null;
    if (handle && nodeId) {
      linking = { from: nodeId, side: handle.dataset.handle as Side, to: w, target: null };
      gesture = { kind: 'link' };
      return;
    }
    if (t.closest('[data-resize]') && nodeId) {
      const n = byId.get(nodeId)!;
      resize = { id: nodeId, w: n.width, h: n.height };
      gesture = { kind: 'resize', id: nodeId, start: w, w: n.width, h: n.height };
      return;
    }
    const edgeEl = t.closest('[data-edge]') as SVGElement | null;
    if (edgeEl) {
      selEdge = edgeEl.dataset.edge!;
      selection = [];
      return;
    }
    if (nodeId) {
      const link = t.closest('[data-note]') as HTMLElement | null;
      if (link && !e.shiftKey && selection.includes(nodeId)) {
        openLinked(link.dataset.note!);
        return;
      }
      selEdge = null;
      if (e.shiftKey) selection = selection.includes(nodeId) ? selection.filter((x) => x !== nodeId) : [...selection, nodeId];
      else if (!selection.includes(nodeId)) selection = [nodeId];
      // mover um grupo leva junto o que está dentro dele
      const ids = new Set(selection);
      for (const id of selection) {
        const g = byId.get(id);
        if (g?.type !== 'group') continue;
        for (const n of data!.nodes) if (n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + n.width <= g.x + g.width && n.y + n.height <= g.y + g.height) ids.add(n.id);
      }
      gesture = { kind: 'move', start: w, ids: [...ids], moved: false };
      return;
    }
    if (tool === 'card') {
      addCard(w);
      tool = 'select';
      gesture = null;
      return;
    }
    selEdge = null;
    if (e.shiftKey) {
      marquee = { a: w, b: w };
      gesture = { kind: 'marquee' };
      return;
    }
    gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }

  const snapIf = (v: number) => (gridSnap ? Math.round(v / GRID) * GRID : v);

  function onPointerMove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (!gesture) return;
    const w = toWorld(e.clientX, e.clientY);
    switch (gesture.kind) {
      case 'pinch': {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = Math.min(4, Math.max(0.15, gesture.k * (d / gesture.d)));
        const r = stage!.getBoundingClientRect();
        const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        const ox = gesture.cx - r.left, oy = gesture.cy - r.top;
        view = { k, x: cx - ((ox - gesture.vx) / gesture.k) * k, y: cy - ((oy - gesture.vy) / gesture.k) * k };
        break;
      }
      case 'pan': {
        const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) gesture.moved = true;
        view = { ...view, x: gesture.vx + dx, y: gesture.vy + dy };
        break;
      }
      case 'move': {
        const dx = w.x - gesture.start.x, dy = w.y - gesture.start.y;
        if (!gesture.moved && Math.hypot(dx, dy) * view.k < 4) return;
        gesture.moved = true;
        const lead = byId.get(gesture.ids[0]!)!;
        const sx = gridSnap ? snap(lead.x + dx) - lead.x : dx, sy = gridSnap ? snap(lead.y + dy) - lead.y : dy;
        move = { ids: gesture.ids, dx: sx, dy: sy };
        break;
      }
      case 'resize':
        resize = { id: gesture.id, w: Math.max(60, snap(gesture.w + w.x - gesture.start.x)), h: Math.max(36, snap(gesture.h + w.y - gesture.start.y)) };
        break;
      case 'ink': {
        if (!live) return;
        const evs = e.getCoalescedEvents?.() ?? [e];
        const pts = [...live.points];
        for (const ev of evs.length ? evs : [e]) {
          const p = toWorld(ev.clientX, ev.clientY);
          pts.push(p.x, p.y, ev.pointerType === 'mouse' ? 0.5 : ev.pressure || 0.5);
        }
        live = { ...live, points: pts };
        break;
      }
      case 'shape': {
        if (!live) return;
        let x = snapIf(w.x), y = snapIf(w.y);
        const [x1 = 0, y1 = 0] = live.points;
        if (e.shiftKey) {
          if (live.tool === 'line' || live.tool === 'arrow') {
            // trava em passos de 15°
            const ang = Math.round(Math.atan2(y - y1, x - x1) / (Math.PI / 12)) * (Math.PI / 12);
            const len = Math.hypot(x - x1, y - y1);
            x = x1 + Math.cos(ang) * len;
            y = y1 + Math.sin(ang) * len;
          } else {
            const s = Math.max(Math.abs(x - x1), Math.abs(y - y1));
            x = x1 + Math.sign(x - x1 || 1) * s;
            y = y1 + Math.sign(y - y1 || 1) * s;
          }
        }
        live = { ...live, points: [x1, y1, 0.5, x, y, 0.5] };
        break;
      }
      case 'erase':
        eraseAt(w);
        break;
      case 'link': {
        if (!linking) return;
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]') as HTMLElement | null;
        const target = el?.dataset.node && el.dataset.node !== linking.from ? el.dataset.node : null;
        linking = { ...linking, to: w, target };
        break;
      }
      case 'marquee':
        if (marquee) marquee = { ...marquee, b: w };
        break;
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (e.pointerType === 'pen') penActive = false;
    if (gesture?.kind === 'pinch') {
      if (pointers.size === 0) gesture = null;
      return;
    }
    const g = gesture;
    gesture = null;
    if (!g) return;
    switch (g.kind) {
      case 'pan':
        if (!g.moved) {
          selection = [];
          selEdge = null;
        }
        break;
      case 'move':
        if (move && g.moved) {
          const m = move;
          change((ed) => m.ids.forEach((id) => {
            const n = byId.get(id);
            if (n) ed.setNode({ id, x: Math.round(n.x + m.dx), y: Math.round(n.y + m.dy) });
          }));
          if (m.ids.length === 1) change((ed) => ed.raise(m.ids[0]!));
        }
        move = null;
        break;
      case 'resize':
        if (resize) {
          const r = resize;
          change((ed) => ed.setNode({ id: r.id, width: Math.round(r.w), height: Math.round(r.h) }));
        }
        resize = null;
        break;
      case 'ink':
      case 'shape':
        if (live) {
          let s: InkStroke = live.tool === 'pen' ? { ...live, points: thin(live.points, 1.5 / view.k) } : live;
          const [x1 = 0, y1 = 0, , x2 = 0, y2 = 0] = s.points;
          const tiny = s.tool !== 'pen' && Math.hypot(x2 - x1, y2 - y1) < 3;
          if (s.tool === 'pen' && snapShapes) s = recognize(s) ?? s;
          if (!tiny) change((ed) => ed.addInk(s));
        }
        live = null;
        break;
      case 'erase':
        if (erasing.length) {
          const ids = erasing;
          change((ed) => ids.forEach((id) => ed.deleteInk(id)));
        }
        erasing = [];
        break;
      case 'link':
        if (linking) {
          const l = linking;
          const from = byId.get(l.from)!;
          if (l.target) {
            const to = byId.get(l.target)!;
            const id = uid();
            change((ed) => ed.setEdge({ id, fromNode: l.from, fromSide: l.side, toNode: l.target!, toSide: facing(to, from), toEnd: kind === 'mapa' ? 'none' : 'arrow' }));
            firePulse(id);
          } else if (Math.hypot(l.to.x - from.x, l.to.y - from.y) > 40) {
            // soltou no vazio: cria a próxima caixa ali, já ligada
            const id = uid(), edge = uid();
            const size = kind === 'mapa' ? fitText('Novo', 'ramo') : { width: 200, height: 80 };
            const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
            change((ed) => {
              ed.setNode({ id, type: 'text', text: '', x: snap(l.to.x - size.width / 2), y: snap(l.to.y - size.height / 2), ...size, color: kind === 'mapa' ? branchColor(l.from) : undefined });
              ed.setEdge({ id: edge, fromNode: l.from, fromSide: l.side, toNode: id, toSide: opposite[l.side], toEnd: kind === 'mapa' ? 'none' : 'arrow' });
            });
            firePulse(edge);
            selection = [id];
            startEdit(id);
          }
        }
        linking = null;
        break;
      case 'marquee':
        if (marquee) {
          const x0 = Math.min(marquee.a.x, marquee.b.x), x1 = Math.max(marquee.a.x, marquee.b.x);
          const y0 = Math.min(marquee.a.y, marquee.b.y), y1 = Math.max(marquee.a.y, marquee.b.y);
          selection = data!.nodes.filter((n) => n.x >= x0 && n.y >= y0 && n.x + n.width <= x1 && n.y + n.height <= y1).map((n) => n.id);
        }
        marquee = null;
        break;
    }
  }

  function eraseAt(p: Pt): void {
    if (!data) return;
    const hit = data.ink.filter((s) => !erasing.includes(s.id) && strokeHit(s, p, 6 / view.k)).map((s) => s.id);
    if (hit.length) erasing = [...erasing, ...hit];
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    // Ctrl + roda (ou pinça do touchpad) aproxima; roda sozinha passeia, como no Obsidian
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    else view = { ...view, x: view.x - e.deltaX, y: view.y - e.deltaY };
  }

  function onDblClick(e: MouseEvent): void {
    // com o ponteiro capturado, o evento chega no palco; o que importa é o que está sob o cursor
    const t = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
    if (t.closest('textarea, input, .bar, .tools')) return;
    const nodeId = (t.closest('[data-node]') as HTMLElement | null)?.dataset.node;
    if (nodeId) {
      const n = byId.get(nodeId);
      if (n?.type === 'file' && n.file) openLinked(n.file);
      else startEdit(nodeId);
      return;
    }
    const edgeId = (t.closest('[data-edge]') as SVGElement | null)?.dataset.edge;
    if (edgeId) {
      edgeEditing = edgeId;
      edgeDraft = data!.edges.find((x) => x.id === edgeId)?.label ?? '';
      return;
    }
    if (tool === 'select') addCard(toWorld(e.clientX, e.clientY));
  }

  function commitEdgeLabel(): void {
    const id = edgeEditing;
    edgeEditing = null;
    if (!id) return;
    const label = edgeDraft.trim();
    change((e) => e.setEdge({ id, label: label || undefined }));
  }

  function openLinked(target: string): void {
    const p = target.endsWith('.md') ? target : `${target}.md`;
    const found = engine.notes.find((n) => n === p || n.endsWith(`/${p}`));
    if (found) onOpenNote(found);
  }

  function onDrop(e: DragEvent): void {
    const p = e.dataTransfer?.getData('text/tanden-note');
    if (!p) return;
    e.preventDefault();
    const w = toWorld(e.clientX, e.clientY);
    const id = uid();
    change((ed) => ed.setNode({ id, type: 'file', file: p, x: snap(w.x - 130), y: snap(w.y - 70), width: 260, height: 140 }));
    selection = [id];
  }

  // ---------- teclado ----------

  let spaceDown = false;

  /** Navega para a caixa mais próxima naquela direção. */
  function nearest(from: CanvasNode, dir: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): string | null {
    const c = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const v = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[dir];
    let best: string | null = null, bestScore = Infinity;
    for (const n of cards) {
      if (n.id === from.id) continue;
      const dx = n.x + n.width / 2 - c.x, dy = n.y + n.height / 2 - c.y;
      const along = dx * v[0]! + dy * v[1]!;
      if (along <= 0) continue;
      const across = Math.abs(dx * v[1]! - dy * v[0]!);
      if (across > along * 1.2) continue;
      const score = along + across * 2;
      if (score < bestScore) [bestScore, best] = [score, n.id];
    }
    return best;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if ((e.target as Element).closest('textarea, input')) return;
    if (editing) {
      // a caixa de texto ainda não pegou o foco: a letra vai para ela, não vira atalho
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        draft += e.key;
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const one = selection.length === 1 ? byId.get(selection[0]!) : undefined;
    if (e.key === ' ') {
      spaceDown = true;
      e.preventDefault();
      return;
    }
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) undo?.redo();
      else undo?.undo();
      data = engine.boards.read(path!);
      engine.boardEdited();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      undo?.redo();
      data = engine.boards.read(path!);
      engine.boardEdited();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selection = cards.map((n) => n.id);
      return;
    }
    if (mod && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      groupSelection();
      return;
    }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (e.key === 'Escape') {
      selection = [];
      selEdge = null;
      tool = 'select';
      return;
    }
    if (one) {
      if (e.key === 'Tab') {
        e.preventDefault();
        addChild(one.id);
        return;
      }
      if (e.key === 'Enter' && kind === 'mapa') {
        e.preventDefault();
        if (e.shiftKey) startEdit(one.id);
        else addSibling(one.id);
        return;
      }
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        startEdit(one.id);
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        if (e.shiftKey) {
          const step = gridSnap ? GRID : 10;
          const d = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key as 'ArrowUp']!;
          const ids = [...selection];
          change((ed) => ids.forEach((id) => {
            const n = byId.get(id)!;
            ed.setNode({ id, x: n.x + d[0]!, y: n.y + d[1]! });
          }));
        } else {
          const next = nearest(one, e.key as 'ArrowUp');
          if (next) selection = [next];
        }
        return;
      }
      if (/^[0-6]$/.test(e.key)) {
        setColor(e.key === '0' ? undefined : e.key);
        return;
      }
    } else if (e.key.startsWith('Arrow') && cards.length) {
      e.preventDefault();
      selection = [tree?.root ?? cards[0]!.id];
      return;
    }
    if (e.key.toLowerCase() === 'f') return fit();
    if (e.key.toLowerCase() === 'g') {
      gridSnap = !gridSnap;
      return;
    }
    const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
    if (t) tool = t.id;
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === ' ') spaceDown = false;
  }

  function editKeys(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Tab' && editing) {
      e.preventDefault();
      const id = editing;
      commitEdit();
      if (byId.has(id)) addChild(id);
    } else if (e.key === 'Enter' && !e.shiftKey && kind === 'mapa' && editing) {
      e.preventDefault();
      const id = editing;
      commitEdit();
      if (byId.has(id)) addSibling(id);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitEdit();
    }
  }

  function focusOnMount(el: HTMLElement): void {
    // na hora, não no próximo quadro: quem digita rápido não perde a primeira letra
    el.focus({ preventScroll: true });
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.select();
  }

  // ---------- desenho das setas ----------

  function depthOf(id: string): number {
    if (!tree) return 1;
    let d = 0, cur = id;
    while (tree.parent.has(cur) && d < 50) (cur = tree.parent.get(cur)!, d++);
    return d;
  }

  const edgeViews = $derived.by(() => {
    if (!data) return [];
    void move;
    void resize;
    return data.edges.flatMap((e) => {
      const a = byId.get(e.fromNode), b = byId.get(e.toNode);
      if (!a || !b) return [];
      const mapa = kind === 'mapa';
      const A = shown(a), B = shown(b);
      // no mapa os galhos saem sempre pelos lados, como numa árvore deitada
      const right = center(B).x >= center(A).x;
      const g = edgePath(mapa ? { ...e, fromSide: right ? 'right' : 'left', toSide: right ? 'left' : 'right' } : e, A, B);
      const color = colorOf(e.color) ?? (mapa ? colorOf(b.color) : undefined) ?? 'var(--edge)';
      const width = mapa ? Math.max(1.5, 4.5 - depthOf(b.id) * 1) : 1.6;
      const head = (e.toEnd ?? 'arrow') === 'arrow' ? arrowHead(g.b, g.angle) : null;
      const tail = e.fromEnd === 'arrow' ? arrowHead(g.a, Math.atan2(g.a.y - g.mid.y, g.a.x - g.mid.x)) : null;
      return [{ e, ...g, color, width, head, tail }];
    });
  });

  const linkPath = $derived.by(() => {
    if (!linking) return '';
    const from = byId.get(linking.from);
    if (!from) return '';
    const target = linking.target ? byId.get(linking.target) : null;
    const to: Box = target ?? { x: linking.to.x, y: linking.to.y, width: 0, height: 0 };
    return edgePath({ id: '', fromNode: '', toNode: '', fromSide: linking.side, toSide: target ? facing(target, from) : undefined }, from, to).d;
  });

  const boardsSorted = $derived([...engine.boardList].sort((a, b) => title(a).localeCompare(title(b))));
  const notesFound = $derived(engine.notes.filter((n) => n.toLowerCase().includes(noteQuery.toLowerCase())).slice(0, 30));
  const nodeColor = (n: CanvasNode) => colorOf(n.color);
  const drawTools = new Set<Tool>(['pen', 'line', 'arrow', 'rect', 'ellipse', 'eraser']);
</script>

<svelte:window onkeyup={onKeyUp} />

<div class="quadro">
  <header class="bar">
    <div class="picker">
      <button class="board-btn" onclick={() => (menu = menu === 'boards' ? null : 'boards')} aria-haspopup="true" aria-expanded={menu === 'boards'}>
        {#if path}
          <span class="kind">{KINDS[kind].label}</span><b>{title(path)}</b>
        {:else}
          <b>Quadros</b>
        {/if}
        <span class="caret">▾</span>
      </button>
      {#if menu === 'boards'}
        <div class="menu boards" role="menu">
          {#each boardsSorted as b (b)}
            <button class:on={b === path} onclick={() => { open(b); menu = null; }} role="menuitem">
              {title(b)}<small>{b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : ''}</small>
            </button>
          {/each}
          <div class="new-board">
            <input placeholder="Nome do quadro novo" bind:value={newName} onkeydown={(e) => e.key === 'Enter' && createBoard('mapa')} />
            <div class="kinds">
              {#each Object.entries(KINDS) as [k, v] (k)}
                <button onclick={() => createBoard(k as BoardKind)}>+ {v.label}</button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
    {#if path}
      <div class="actions">
        {#if kind === 'mapa'}<button onclick={() => organize(true)} title="Reorganiza o mapa a partir da raiz">Organizar</button>{/if}
        <button onclick={() => (menu = menu === 'notes' ? null : 'notes')} title="Coloca uma nota do cofre no quadro">+ Nota</button>
        {#if selection.length > 1}<button onclick={groupSelection} title="Agrupar (Ctrl+G)">Agrupar</button>{/if}
        <button onclick={() => { undo?.undo(); data = engine.boards.read(path!); engine.boardEdited(); }} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
        <button onclick={() => { undo?.redo(); data = engine.boards.read(path!); engine.boardEdited(); }} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
        <button onclick={fit} title="Enquadrar tudo (F)" aria-label="Enquadrar tudo">⤢</button>
        <span class="zoom">{Math.round(view.k * 100)}%</span>
      </div>
      {#if menu === 'notes'}
        <div class="menu notes" role="menu">
          <input placeholder="Buscar nota" bind:value={noteQuery} use:focusOnMount />
          {#each notesFound as n (n)}<button onclick={() => insertNote(n)}>{n.replace(/\.md$/, '')}</button>{/each}
          {#if !notesFound.length}<p>Nenhuma nota com esse nome.</p>{/if}
        </div>
      {/if}
    {/if}
  </header>

  {#if !path}
    <div class="empty">
      <h2>Quadros</h2>
      <p>Cada quadro é um arquivo <code>.canvas</code> no seu cofre. O Obsidian abre o mesmo arquivo.</p>
      <div class="cards">
        {#each Object.entries(KINDS) as [k, v] (k)}
          <button onclick={() => createBoard(k as BoardKind)}>
            <svg viewBox="0 0 120 70" aria-hidden="true">
              {#if k === 'mapa'}
                <path d="M60 35 C75 35 75 15 90 15 M60 35 C75 35 75 55 90 55 M60 35 C45 35 45 20 30 20 M60 35 C45 35 45 50 30 50" />
                <rect x="47" y="28" width="26" height="14" rx="7" class="hot" /><circle cx="94" cy="15" r="4" /><circle cx="94" cy="55" r="4" /><circle cx="26" cy="20" r="4" /><circle cx="26" cy="50" r="4" />
              {:else if k === 'fluxo'}
                <rect x="8" y="26" width="26" height="18" rx="4" class="hot" /><rect x="47" y="26" width="26" height="18" rx="4" /><rect x="86" y="10" width="26" height="18" rx="4" /><rect x="86" y="44" width="26" height="18" rx="4" />
                <path d="M34 35 H47 M73 35 C80 35 80 19 86 19 M73 35 C80 35 80 53 86 53" />
              {:else}
                <path d="M12 52 C25 20 40 58 55 30 S85 18 95 44" class="hot" /><rect x="70" y="10" width="38" height="22" /><path d="M14 14 L44 14" />
              {/if}
            </svg>
            <b>{v.label}</b><span>{v.hint}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else if data}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="stage" bind:this={stage} tabindex="0" role="application" aria-label="Quadro {title(path)}"
      class:drawing={drawTools.has(tool)} class:eraser={tool === 'eraser'} class:carding={tool === 'card'}
      onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={onPointerUp}
      onwheel={onWheel} ondblclick={onDblClick} onkeydown={onKeyDown}
      ondragover={(e) => e.dataTransfer?.types.includes('text/tanden-note') && e.preventDefault()} ondrop={onDrop}
      style:--grid="{GRID * view.k}px" style:--gx="{view.x}px" style:--gy="{view.y}px">
      <div class="world" class:settling style:transform="translate({view.x}px, {view.y}px) scale({view.k})">
        {#each groups as n (n.id)}
          {@const b = shown(n)}
          <div class="node group" data-node={n.id} class:sel={selection.includes(n.id)} class:arrived={arrived.includes(n.id)}
            style:left="{b.x}px" style:top="{b.y}px" style:width="{b.width}px" style:height="{b.height}px" style:--c={nodeColor(n)}>
            {#if editing === n.id}
              <input class="label-edit" bind:value={draft} onkeydown={editKeys} onblur={commitEdit} use:focusOnMount />
            {:else}
              <span class="glabel">{n.label || 'Grupo'}</span>
            {/if}
            {#if selection.includes(n.id) && selection.length === 1}<span class="resize" data-resize></span>{/if}
          </div>
        {/each}

        <svg class="edges" aria-hidden="true">
          {#each edgeViews as v (v.e.id)}
            <g class="edge" class:sel={selEdge === v.e.id} style:--ec={v.color}>
              <path class="hit" d={v.d} data-edge={v.e.id} />
              <path class="line" d={v.d} style:stroke-width={v.width} />
              {#if v.head}<path class="headp" d={v.head} />{/if}
              {#if v.tail}<path class="headp" d={v.tail} />{/if}
              {#if pulses.some((p) => p.edge === v.e.id)}<path class="pulse" d={v.d} pathLength="100" />{/if}
            </g>
          {/each}
          {#if linking}<path class="linking" d={linkPath} />{/if}
        </svg>
        {#each edgeViews as v (v.e.id)}
          {#if edgeEditing === v.e.id}
            <input class="edge-label editing" style:left="{v.mid.x}px" style:top="{v.mid.y}px" bind:value={edgeDraft}
              onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') commitEdgeLabel(); }} onblur={commitEdgeLabel} use:focusOnMount />
          {:else if v.e.label}
            <span class="edge-label" data-edge={v.e.id} style:left="{v.mid.x}px" style:top="{v.mid.y}px">{v.e.label}</span>
          {/if}
        {/each}

        {#each cards as n (n.id)}
          {@const b = shown(n)}
          {@const isRoot = kind === 'mapa' && tree?.root === n.id}
          <div class="node {n.type}" data-node={n.id} class:mapa={kind === 'mapa'} class:root={isRoot}
            class:sel={selection.includes(n.id)} class:target={linking?.target === n.id} class:arrived={arrived.includes(n.id)}
            class:moving={move?.ids.includes(n.id)}
            style:left="{b.x}px" style:top="{b.y}px" style:width="{b.width}px" style:height="{b.height}px" style:--c={nodeColor(n)}>
            {#if editing === n.id}
              {#if n.type === 'link'}
                <input class="text-edit" bind:value={draft} onkeydown={editKeys} onblur={commitEdit} use:focusOnMount placeholder="https://" />
              {:else}
                <textarea class="text-edit" bind:value={draft} onkeydown={editKeys} onblur={commitEdit} use:focusOnMount
                  placeholder={kind === 'mapa' ? 'Tópico' : 'Escreva… (Ctrl+Enter salva)'}></textarea>
              {/if}
            {:else if n.type === 'file'}
              <div class="file">
                <span class="ftitle">◇ {(n.file ?? '').split('/').pop()?.replace(/\.md$/, '')}</span>
                <p>{preview(n.file)}</p>
              </div>
            {:else if n.type === 'link'}
              <div class="file">
                <span class="ftitle">↗ {(() => { try { return new URL(n.url ?? '').host; } catch { return n.url; } })()}</span>
                <a href={n.url} target="_blank" rel="noreferrer noopener">{n.url}</a>
              </div>
            {:else}
              <div class="txt">{@html md(n.text ?? '')}</div>
            {/if}
            {#if selection.includes(n.id) && selection.length === 1 && editing !== n.id && tool === 'select'}
              {#each ['top', 'right', 'bottom', 'left'] as s (s)}<span class="handle {s}" data-handle={s} title="Arraste para ligar"></span>{/each}
              {#if kind !== 'mapa'}<span class="resize" data-resize></span>{/if}
            {/if}
          </div>
        {/each}

        <svg class="ink" aria-hidden="true">
          {#each data.ink as s (s.id)}
            {#if s.tool === 'pen'}
              <path d={inkOutline(s)} fill={s.color} class:erasing={erasing.includes(s.id)} />
            {:else}
              <path d={shapePath(s)} fill="none" stroke={s.color} stroke-width={s.width} stroke-linecap="round" stroke-linejoin="round" class:erasing={erasing.includes(s.id)} />
            {/if}
          {/each}
          {#if live}
            {#if live.tool === 'pen'}<path d={inkOutline(live)} fill={live.color} />
            {:else}<path d={shapePath(live)} fill="none" stroke={live.color} stroke-width={live.width} stroke-linecap="round" stroke-linejoin="round" />{/if}
          {/if}
          {#if marquee}
            <rect class="marquee" x={Math.min(marquee.a.x, marquee.b.x)} y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)} height={Math.abs(marquee.b.y - marquee.a.y)} />
          {/if}
        </svg>
      </div>

      {#if data.nodes.length === 0 && data.ink.length === 0 && !live}
        <p class="hint">{KINDS[kind].hint} Dois cliques criam uma caixa.</p>
      {/if}

      <div class="tools" role="toolbar" aria-label="Ferramentas">
        {#each TOOLS as t (t.id)}
          <button class:on={tool === t.id} onclick={() => (tool = t.id)} title="{t.label} ({t.key})" aria-label={t.label} aria-pressed={tool === t.id}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
          </button>
        {/each}
        <span class="div"></span>
        {#if drawTools.has(tool) && tool !== 'eraser'}
          {#each INK_COLORS as c (c)}
            <button class="swatch" class:on={inkColor === c} style:--sw={c} onclick={() => (inkColor = c)} aria-label="Cor {c}"></button>
          {/each}
          <button class="width" onclick={() => (inkWidth = inkWidth >= 8 ? 1.5 : inkWidth * 2)} title="Espessura" aria-label="Espessura">
            <span style:height="{Math.max(2, inkWidth)}px"></span>
          </button>
          {#if tool === 'pen'}
            <button class="toggle" class:on={snapShapes} onclick={() => (snapShapes = !snapShapes)}
              title="Ajuste de forma: rabiscos retos viram linhas, contornos fechados viram retângulos e elipses">Ajuste</button>
          {/if}
        {:else if selection.length || selEdge}
          {#each Object.entries(PALETTE) as [k, c] (k)}
            <button class="swatch" style:--sw={c} onclick={() => setColor(k)} aria-label="Cor {k}" title="Cor {k}"></button>
          {/each}
          <button class="swatch none" onclick={() => setColor(undefined)} aria-label="Sem cor" title="Sem cor (0)"></button>
        {/if}
        <button class="toggle" class:on={gridSnap} onclick={() => (gridSnap = !gridSnap)} title="Encaixar na grade (G)">Grade</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .quadro { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;
    --edge: color-mix(in srgb, var(--silver) 55%, transparent); }

  .bar { position: relative; z-index: 6; display: flex; align-items: center; gap: 10px; padding: 10px 16px;
    border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .picker { position: relative; }
  .board-btn { display: flex; align-items: baseline; gap: 8px; border: 1px solid var(--line); background: var(--surface);
    border-radius: 10px; padding: 6px 12px; max-width: 70vw; }
  .board-btn b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .kind { font: 500 10px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--ember); }
  .caret { color: var(--muted); }
  .actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .actions button { border: 1px solid var(--line); background: var(--surface); border-radius: 9px; padding: 5px 10px; font-size: 12.5px; }
  .actions button:hover, .board-btn:hover { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .zoom { font: 11px var(--f-mono); color: var(--muted); min-width: 40px; text-align: right; }

  .menu { position: absolute; top: calc(100% + 6px); z-index: 10; background: var(--surface); border: 1px solid var(--line);
    border-radius: 12px; padding: 6px; box-shadow: 0 18px 50px -10px #000; display: grid; gap: 2px;
    max-height: 60vh; overflow: auto; width: min(320px, 90vw); }
  .menu.notes { right: 16px; }
  .menu button { text-align: left; border: 0; background: none; border-radius: 8px; padding: 7px 10px; display: grid; }
  .menu button:hover, .menu button.on { background: var(--surface-2); }
  .menu button.on { box-shadow: inset 2px 0 var(--ember); }
  .menu small { color: var(--muted); font: 10.5px var(--f-mono); }
  .menu input { width: 100%; background: var(--void); border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; color: var(--ink); font: inherit; }
  .menu p { margin: 6px 10px; color: var(--muted); font-size: 12.5px; }
  .new-board { border-top: 1px solid var(--line); margin-top: 4px; padding: 8px 4px 2px; display: grid; gap: 6px; }
  .kinds { display: flex; flex-wrap: wrap; gap: 4px; }
  .kinds button { display: inline-block; border: 1px solid var(--line); padding: 5px 9px; font-size: 12.5px; }
  .kinds button:hover { border-color: var(--ember); color: var(--ember-soft); }

  .empty { margin: auto; padding: 24px; max-width: 760px; text-align: center; }
  .empty h2 { font: 600 13px/1 var(--f-display); letter-spacing: .2em; text-transform: uppercase; color: var(--muted); }
  .empty p { color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 18px; }
  .cards button { display: grid; gap: 6px; text-align: left; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); }
  .cards button:hover { border-color: var(--ember); box-shadow: 0 0 30px -18px var(--ember); }
  .cards svg { width: 100%; height: 70px; fill: none; stroke: var(--silver); stroke-width: 1.4; opacity: .85; }
  .cards svg circle { fill: var(--silver); stroke: none; }
  .cards svg .hot { stroke: var(--ember); }
  .cards b { font: 600 14px var(--f-display); letter-spacing: .04em; }
  .cards span { color: var(--muted); font-size: 12.5px; }

  .stage { position: relative; flex: 1; min-height: 0; overflow: hidden; outline: none; touch-action: none; cursor: grab;
    background-color: var(--void);
    background-image: radial-gradient(circle, color-mix(in srgb, var(--silver) 16%, transparent) 1px, transparent 1.2px);
    background-size: var(--grid) var(--grid); background-position: var(--gx) var(--gy); user-select: none; -webkit-user-select: none; }
  .stage:active { cursor: grabbing; }
  .stage.drawing { cursor: crosshair; }
  .stage.eraser { cursor: cell; }
  .stage.carding { cursor: copy; }
  .world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
  .world.settling .node { transition: left .38s cubic-bezier(.2, .8, .2, 1), top .38s cubic-bezier(.2, .8, .2, 1); }

  .edges, .ink { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
  .edge .line { fill: none; stroke: var(--ec); stroke-linecap: round; }
  .edge .headp { fill: var(--ec); stroke: none; }
  .edge .hit { fill: none; stroke: transparent; stroke-width: 14; pointer-events: stroke; cursor: pointer; }
  .edge.sel .line { stroke: var(--ember); filter: drop-shadow(0 0 4px var(--ember)); }
  .edge.sel .headp { fill: var(--ember); }
  .pulse { fill: none; stroke: var(--ember-soft); stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 12 120;
    filter: drop-shadow(0 0 6px var(--ember)); animation: travel .8s cubic-bezier(.5, 0, .3, 1) forwards; }
  @keyframes travel { from { stroke-dashoffset: 12; } to { stroke-dashoffset: -100; } }
  .linking { fill: none; stroke: var(--ember); stroke-width: 2; stroke-dasharray: 5 5; }
  .ink .erasing { opacity: .25; }
  .marquee { fill: color-mix(in srgb, var(--ember) 8%, transparent); stroke: var(--ember); stroke-width: 1; stroke-dasharray: 4 4; vector-effect: non-scaling-stroke; }

  .edge-label { position: absolute; transform: translate(-50%, -50%); background: var(--void); color: var(--silver);
    font: 12px var(--f-body); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--line); white-space: nowrap; cursor: pointer; }
  input.edge-label { color: var(--ink); outline: none; border-color: var(--ember); min-width: 120px; }

  .node { position: absolute; border-radius: 12px; background: var(--surface); border: 1px solid var(--line);
    box-shadow: 0 8px 24px -16px #000; cursor: default; }
  .node.text, .node.file, .node.link { border-top: 3px solid var(--c, var(--line)); }
  .node:hover { border-color: color-mix(in srgb, var(--c, var(--ember)) 55%, var(--line)); }
  .node.sel { border-color: var(--c, var(--ember)); box-shadow: 0 0 0 1px var(--c, var(--ember)), 0 0 26px -10px var(--c, var(--ember)); }
  .node.target { box-shadow: 0 0 0 2px var(--ember), 0 0 26px -6px var(--ember); }
  .node.moving { opacity: .92; box-shadow: 0 16px 40px -14px #000; }
  /* chegou de outro aparelho: o brilho é o dado entrando, e some quando assenta */
  .node.arrived { animation: arrive 1.3s ease-out; }
  @keyframes arrive { from { box-shadow: 0 0 0 2px var(--ember-soft), 0 0 34px -4px var(--ember); } }

  .txt { padding: 10px 14px; height: 100%; overflow: hidden; line-height: 1.45; word-wrap: break-word; }
  .txt :global(.h1) { font: 600 1.3em/1.25 var(--f-display); }
  .txt :global(.h2) { font: 600 1.12em/1.25 var(--f-display); }
  .txt :global(.h3) { font: 600 1em/1.25 var(--f-display); color: var(--silver); }
  .txt :global(.li)::before { content: '•'; color: var(--c, var(--ember)); margin-right: 6px; }
  .txt :global(.li.done) { color: var(--muted); text-decoration: line-through; }
  .txt :global(code) { font: .9em var(--f-mono); color: var(--ember-soft); }
  .txt :global(a) { color: var(--ember-soft); text-decoration: underline dotted; cursor: pointer; }

  /* mapa mental: tópicos em cápsula, raiz em destaque */
  .node.mapa { border-radius: 999px; border-top-width: 1px; border-color: color-mix(in srgb, var(--c, var(--silver)) 45%, var(--line));
    background: color-mix(in srgb, var(--c, var(--silver)) 7%, var(--surface)); display: flex; align-items: center; justify-content: center; text-align: center; }
  .node.mapa .txt { width: 100%; height: auto; padding: 4px 16px; }
  .node.mapa.root { border: 1.5px solid var(--ember); background: radial-gradient(120% 140% at 50% 0%, color-mix(in srgb, var(--ember) 18%, var(--surface)), var(--surface));
    box-shadow: 0 0 40px -14px var(--ember); font: 600 17px/1.3 var(--f-display); letter-spacing: .02em; }
  .node.mapa.sel { box-shadow: 0 0 0 1px var(--c, var(--ember)), 0 0 26px -8px var(--c, var(--ember)); }

  .node.group { background: color-mix(in srgb, var(--c, var(--silver)) 4%, transparent); border: 1px dashed color-mix(in srgb, var(--c, var(--silver)) 40%, transparent); box-shadow: none; }
  .glabel, .label-edit { position: absolute; top: -26px; left: 0; font: 600 12px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--c, var(--muted)); }
  .label-edit { background: var(--void); border: 1px solid var(--ember); border-radius: 6px; padding: 2px 6px; color: var(--ink); outline: none; }

  .file { padding: 10px 14px; height: 100%; overflow: hidden; display: grid; align-content: start; gap: 6px; }
  .ftitle { font: 600 13px var(--f-display); letter-spacing: .04em; color: var(--ember-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .file p { margin: 0; color: var(--muted); font-size: 12.5px; white-space: pre-wrap; }
  .file a { color: var(--silver); font-size: 12px; word-break: break-all; }

  .text-edit { width: 100%; height: 100%; resize: none; border: 0; outline: none; background: transparent; color: var(--ink);
    font: inherit; padding: 10px 14px; text-align: inherit; border-radius: inherit; }
  .node.mapa .text-edit { padding: 6px 16px; text-align: center; overflow: hidden; }

  .handle { position: absolute; width: 12px; height: 12px; border-radius: 50%; background: var(--void); border: 2px solid var(--ember);
    cursor: crosshair; transform: translate(-50%, -50%); }
  .handle.top { left: 50%; top: 0; } .handle.bottom { left: 50%; top: 100%; }
  .handle.left { left: 0; top: 50%; } .handle.right { left: 100%; top: 50%; }
  .handle:hover { background: var(--ember); }
  .resize { position: absolute; right: -5px; bottom: -5px; width: 12px; height: 12px; border-right: 2px solid var(--ember); border-bottom: 2px solid var(--ember); cursor: nwse-resize; }

  .hint { position: absolute; top: 42%; left: 50%; transform: translate(-50%, -50%); color: var(--muted); text-align: center; max-width: 80%; pointer-events: none; }

  .tools { position: absolute; z-index: 5; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; align-items: center; gap: 2px;
    padding: 5px; border-radius: 14px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(8px); box-shadow: 0 14px 40px -16px #000; max-width: calc(100% - 24px); overflow-x: auto; }
  .tools button { flex: none; border: 0; background: none; width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: var(--muted); }
  .tools button:hover { color: var(--ink); background: var(--surface-2); }
  .tools button.on { color: var(--ember); background: color-mix(in srgb, var(--ember) 12%, transparent); }
  .tools svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .tools .div { width: 1px; height: 22px; background: var(--line); margin: 0 4px; flex: none; }
  .tools .swatch { width: 26px; height: 26px; }
  .tools .swatch::after { content: ''; width: 14px; height: 14px; border-radius: 50%; background: var(--sw); box-shadow: 0 0 0 1px #0006; }
  .tools .swatch.on::after { box-shadow: 0 0 0 2px var(--void), 0 0 0 3.5px var(--sw); }
  .tools .swatch.none::after { background: linear-gradient(135deg, transparent 45%, var(--crit) 45% 55%, transparent 55%); border: 1px solid var(--muted); }
  .tools .width span { width: 18px; border-radius: 4px; background: var(--ink); }
  .tools .toggle { width: auto; padding: 0 9px; font: 500 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; }

  @media (max-width: 720px) {
    .bar { padding: 8px 12px; }
    .actions { margin-left: 0; width: 100%; overflow-x: auto; }
    .tools { bottom: 10px; }
  }
</style>
