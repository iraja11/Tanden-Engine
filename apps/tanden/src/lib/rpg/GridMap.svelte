<script lang="ts">
  import {
    AREA_SHAPES, DIAGONAL_RULES, GRID_MAX, GRID_MIN, appendLog, areaCells, autoPlace, cellName, clampCell, colName, distanceLabel,
    gridProps, hasSheet, isOut, makeArea, moveCombatant, nextTurn, parseProps, pathDistance, readEncounter, readGrid, readSheet,
    resolveLink, setProps, snapHalf, sortByInit, speedSquares, tokenDistance, tokensHit, update, writeEncounter,
    type Area, type AreaShape, type Cell, type Combatant, type DiagonalRule, type Encounter, type Point,
  } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import Icon, { type IconName } from '../ui/Icon.svelte';
  import { mesa } from './mesa.svelte';

  /*
   * Grade de batalha do encontro: põe as fichas nas casas, mede distâncias
   * (régua com trechos, distância entre fichas, movimento contra o
   * deslocamento da ficha) e marca áreas de efeito. Tudo que dura vai para a
   * nota do encontro (colunas Pos/Tam e as propriedades da grade); régua e
   * área são só da tela.
   */

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  /** lado de uma casa, em unidades do desenho (o zoom multiplica) */
  const CELL = 40;
  const K_MIN = 0.2;
  const K_MAX = 4;
  type Tool = 'mover' | 'regua' | 'area';

  const camp = $derived(mesa.campaign);
  const encounters = $derived(camp?.encounters ?? []);
  const path = $derived(mesa.encounter);
  const text = $derived.by(() => { void cadernos.rev; void mesa.rev; return path ? cadernos.read(path) : ''; });
  const enc = $derived(path ? readEncounter(text) : null);
  const grid = $derived(readGrid(parseProps(text)));
  const W = $derived(grid.cols * CELL);
  const H = $derived(grid.rows * CELL);
  const unplaced = $derived(enc ? sortByInit(enc.list.filter((c) => !c.pos)) : []);

  const plain = (name: string) => name.replace(/^\[\[|\]\]$/g, '').replace(/^[^|]*\|/, '');
  function initials(name: string): string {
    const p = plain(name).trim();
    const m = /^(.*\S)\s+(\d+)$/.exec(p);
    if (m) return `${(m[1]![0] ?? '?').toUpperCase()}${m[2]}`;
    const w = p.split(/\s+/).filter(Boolean);
    return w.length > 1 ? `${w[0]![0]}${w[1]![0]}`.toUpperCase() : p.slice(0, 2);
  }
  const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  function save(next: Encounter, log?: string) {
    if (!path) return;
    cadernos.update(path, (t) => {
      let out = writeEncounter(t, next);
      if (log) out = appendLog(out, log);
      return out;
    });
  }

  // ------------------------------------------------------------ fichas e deslocamento

  function sheetFor(c: Combatant): string | null {
    const m = /^\[\[([^\]|]+)/.exec(c.name.trim());
    if (m) return resolveLink(m[1]!, engine.notes)?.path ?? null;
    const stem = plain(c.name).replace(/\s+\d+$/, '').toLowerCase();
    return camp?.sheets.find((r) => r.name.toLowerCase() === stem)?.path ?? null;
  }
  function speedOf(c: Combatant): number | null {
    const p = sheetFor(c);
    if (!p) return null;
    const t = cadernos.read(p);
    if (!hasSheet(parseProps(t))) return null;
    return speedSquares(readSheet(t, camp?.system).speed, grid);
  }

  // ------------------------------------------------------------ imagem de fundo

  let imgUrl = $state<string | null>(null);
  $effect(() => {
    const target = grid.image;
    imgUrl = null;
    if (!target) return;
    let alive = true;
    void files.imageUrl(target).then((u) => { if (alive) imgUrl = u; });
    return () => { alive = false; };
  });

  // ------------------------------------------------------------ vista (zoom e arrasto)

  let svg = $state<SVGSVGElement>();
  let k = $state(1);
  let tx = $state(24);
  let ty = $state(24);
  let fitted = '';
  /** a pessoa mexeu na vista: não reenquadrar sozinho ao redimensionar */
  let touched = false;

  function fit() {
    touched = false;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pad = 30;
    k = clamp(Math.min((r.width - pad * 2) / W, (r.height - pad * 2) / H), K_MIN, K_MAX);
    tx = (r.width - W * k) / 2;
    ty = (r.height - H * k) / 2;
  }
  // enquadra ao trocar de encontro ou de tamanho de grade
  $effect(() => {
    const key = `${path}|${grid.cols}x${grid.rows}`;
    if (!svg || key === fitted) return;
    fitted = key;
    fit();
  });
  $effect(() => {
    if (!svg) return;
    const ro = new ResizeObserver(() => { if (!touched) fit(); });
    ro.observe(svg);
    return () => ro.disconnect();
  });

  function zoomAt(f: number, cx?: number, cy?: number) {
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left;
    const py = (cy ?? r.top + r.height / 2) - r.top;
    const nk = clamp(k * f, K_MIN, K_MAX);
    touched = true;
    tx = px - (px - tx) * (nk / k);
    ty = py - (py - ty) * (nk / k);
    k = nk;
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    // trackpad: arrastar com dois dedos move; pinça (ctrl) ou roda do mouse dá zoom
    if (!e.ctrlKey && e.deltaMode === 0 && Math.abs(e.deltaX) > 0) {
      touched = true;
      tx -= e.deltaX;
      ty -= e.deltaY;
      return;
    }
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
  }

  function toPoint(e: { clientX: number; clientY: number }): Point {
    const r = svg!.getBoundingClientRect();
    return { x: (e.clientX - r.left - tx) / (k * CELL), y: (e.clientY - r.top - ty) / (k * CELL) };
  }
  const cellAt = (p: Point): Cell => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
  const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < grid.cols && c.y < grid.rows;
  const inGrid = (c: Cell): Cell => ({ x: clamp(c.x, 0, grid.cols - 1), y: clamp(c.y, 0, grid.rows - 1) });

  // ------------------------------------------------------------ ferramentas

  let tool = $state<Tool>('mover');
  let shape = $state<AreaShape>('circulo');
  let sel = $state<string | null>(null);
  /** ficha de fora esperando um toque numa casa */
  let placing = $state<string | null>(null);
  let hover = $state<Cell | null>(null);
  let drag = $state<{ name: string; from: Cell; at: Cell; size: number; off: Point } | null>(null);
  let ruler = $state<Cell[]>([]);
  let rulerLive = $state(false);
  let area = $state<Area | null>(null);
  let areaLive = $state(false);

  const pts = new Map<number, { x: number; y: number }>();
  let pan: { x: number; y: number; tx: number; ty: number } | null = null;
  let pinch: { d: number; k: number; cx: number; cy: number; tx: number; ty: number } | null = null;

  function pickTool(t: Tool) {
    tool = t;
    placing = null;
  }

  function cancelLive() {
    drag = null;
    if (rulerLive) { ruler = []; rulerLive = false; }
    if (areaLive) { area = null; areaLive = false; }
  }

  function startPinch() {
    const [a, b] = [...pts.values()];
    if (!a || !b) return;
    pan = null;
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k, tx, ty, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  function doPinch() {
    const [a, b] = [...pts.values()];
    if (!a || !b || !pinch || !svg) return;
    const r = svg.getBoundingClientRect();
    const nk = clamp((pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, K_MIN, K_MAX);
    const c0x = pinch.cx - r.left;
    const c0y = pinch.cy - r.top;
    const c1x = (a.x + b.x) / 2 - r.left;
    const c1y = (a.y + b.y) / 2 - r.top;
    // o ponto que estava sob os dedos continua sob os dedos
    tx = c1x - (c0x - pinch.tx) * (nk / pinch.k);
    ty = c1y - (c0y - pinch.ty) * (nk / pinch.k);
    k = nk;
    touched = true;
  }

  function placeAt(name: string, c: Cell) {
    if (!enc) return;
    const t = enc.list.find((x) => x.name === name);
    if (!t) return;
    save(moveCombatant(enc, name, clampCell(c, grid, t.size ?? 1)));
    placing = null;
    sel = name;
  }

  function down(e: PointerEvent) {
    if (!svg || !enc) return;
    svg.focus({ preventScroll: true });
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (pts.size === 2) {
      cancelLive();
      startPinch();
      return;
    }
    if (pts.size > 2) return;
    const p = toPoint(e);
    const c = cellAt(p);
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      pan = { x: e.clientX, y: e.clientY, tx, ty };
      return;
    }
    if (e.button !== 0) return;
    if (placing) {
      if (inside(c)) placeAt(placing, c);
      return;
    }
    const tokName = (e.target as Element).closest('[data-token]')?.getAttribute('data-token') ?? null;
    if (tool === 'mover') {
      const t = tokName ? enc.list.find((x) => x.name === tokName) : null;
      if (t?.pos) {
        sel = t.name;
        drag = { name: t.name, from: t.pos, at: t.pos, size: t.size ?? 1, off: { x: p.x - t.pos.x, y: p.y - t.pos.y } };
        return;
      }
      sel = null;
      pan = { x: e.clientX, y: e.clientY, tx, ty };
      return;
    }
    if (tool === 'regua') {
      const at = inGrid(c);
      const last = ruler.at(-1);
      // começar no fim da régua emenda um trecho novo
      ruler = last && same(last, at) ? [...ruler, at] : [at, at];
      rulerLive = true;
      return;
    }
    const o = snapHalf(p);
    area = makeArea(shape, o, o);
    areaLive = true;
  }

  function move(e: PointerEvent) {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (pts.size >= 2) doPinch();
      return;
    }
    if (!svg) return;
    const p = toPoint(e);
    const c = cellAt(p);
    hover = inside(c) ? c : null;
    if (drag) {
      const at = clampCell({ x: p.x - drag.off.x, y: p.y - drag.off.y }, grid, drag.size);
      if (!same(at, drag.at)) drag = { ...drag, at };
    } else if (rulerLive) {
      const at = inGrid(c);
      if (!same(at, ruler.at(-1)!)) ruler = [...ruler.slice(0, -1), at];
    } else if (areaLive && area) {
      area = makeArea(shape, area.origin, p);
    } else if (pan) {
      touched = true;
      tx = pan.tx + e.clientX - pan.x;
      ty = pan.ty + e.clientY - pan.y;
    }
  }

  function up(e: PointerEvent, cancel = false) {
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) pinch = null;
      return;
    }
    pan = null;
    if (drag) {
      const d = drag;
      drag = null;
      if (!cancel && enc && !same(d.at, d.from)) save(moveCombatant(enc, d.name, d.at));
    }
    if (rulerLive) {
      rulerLive = false;
      // um toque sem arrastar não mede nada
      if (ruler.length === 2 && same(ruler[0]!, ruler[1]!)) ruler = [];
      else if (ruler.length > 2 && same(ruler.at(-1)!, ruler.at(-2)!)) ruler = ruler.slice(0, -1);
    }
    if (areaLive) {
      areaLive = false;
      if (cancel) area = null;
    }
  }

  function step() {
    if (!enc) return;
    const next = nextTurn(enc);
    save(next, next.round !== enc.round && next.round > 0 ? `Rodada ${next.round}` : undefined);
    if (next.turn) sel = next.turn;
  }

  function nudge(name: string, dx: number, dy: number) {
    const t = enc?.list.find((x) => x.name === name);
    if (!enc || !t?.pos) return;
    const at = clampCell({ x: t.pos.x + dx, y: t.pos.y + dy }, grid, t.size ?? 1);
    if (!same(at, t.pos)) save(moveCombatant(enc, name, at));
  }

  function key(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = arrows[e.key];
    if (dir && sel) {
      e.preventDefault();
      nudge(sel, dir[0], dir[1]);
      return;
    }
    const k2 = e.key.toLowerCase();
    if (e.key === 'Escape') { placing = null; ruler = []; area = null; sel = null; cancelLive(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && enc) save(moveCombatant(enc, sel, null));
    else if (k2 === 'm') pickTool('mover');
    else if (k2 === 'r') pickTool('regua');
    else if (k2 === 'a') pickTool('area');
    else if (k2 === 'n') step();
    else if (e.key === '+' || e.key === '=') zoomAt(1.2);
    else if (e.key === '-') zoomAt(1 / 1.2);
    else if (e.key === '0') fit();
    else return;
    e.preventDefault();
  }

  // ------------------------------------------------------------ medições derivadas

  const rulerSquares = $derived(ruler.length >= 2 ? pathDistance(ruler, grid.diagonal) : 0);
  const dragInfo = $derived.by(() => {
    if (!drag || !enc) return null;
    const t = enc.list.find((x) => x.name === drag!.name);
    const squares = pathDistance([drag.from, drag.at], grid.diagonal);
    const speed = t ? speedOf(t) : null;
    return { squares, speed, over: speed !== null && squares > speed };
  });
  const cells = $derived(area ? areaCells(area, grid) : []);
  const hit = $derived(enc && area ? tokensHit(cells, enc.list) : []);
  const selected = $derived(enc && sel ? enc.list.find((c) => c.name === sel) ?? null : null);
  const selSpeed = $derived(selected ? speedOf(selected) : null);
  const distances = $derived.by(() => {
    if (!enc || !selected?.pos) return [];
    const s = selected;
    return enc.list
      .filter((c) => c.pos && c.name !== s.name)
      .map((c) => ({ c, d: tokenDistance(s.pos!, s.size ?? 1, c.pos!, c.size ?? 1, grid.diagonal) }))
      .sort((a, b) => a.d - b.d);
  });

  const gridPath = $derived.by(() => {
    let d = '';
    for (let x = 0; x <= grid.cols; x++) d += `M${x * CELL} 0V${H}`;
    for (let y = 0; y <= grid.rows; y++) d += `M0 ${y * CELL}H${W}`;
    return d;
  });
  const labels = $derived(k * CELL >= 16);
  /** tamanho de fonte que fica igual na tela, qualquer que seja o zoom */
  const fs = (px: number) => px / k;
  const center = (c: Cell, size = 1) => ({ x: (c.x + size / 2) * CELL, y: (c.y + size / 2) * CELL });

  function areaOutline(a: Area): string {
    const ox = a.origin.x * CELL;
    const oy = a.origin.y * CELL;
    const L = a.size * CELL;
    if (a.shape === 'cone') {
      const h = Math.atan(0.5);
      const p1 = { x: ox + Math.cos(a.angle - h) * L, y: oy + Math.sin(a.angle - h) * L };
      const p2 = { x: ox + Math.cos(a.angle + h) * L, y: oy + Math.sin(a.angle + h) * L };
      return `M${ox} ${oy}L${p1.x} ${p1.y}A${L} ${L} 0 0 1 ${p2.x} ${p2.y}Z`;
    }
    if (a.shape === 'linha') {
      const c = Math.cos(a.angle);
      const s = Math.sin(a.angle);
      const w = CELL / 2;
      const pts2 = [[0, -w], [L, -w], [L, w], [0, w]].map(([u, v]) => `${ox + u! * c - v! * s} ${oy + u! * s + v! * c}`);
      return `M${pts2.join('L')}Z`;
    }
    if (a.shape === 'quadrado') {
      const x0 = a.sx > 0 ? ox : ox - L;
      const y0 = a.sy > 0 ? oy : oy - L;
      return `M${x0} ${y0}h${L}v${L}h${-L}Z`;
    }
    return `M${ox - L} ${oy}a${L} ${L} 0 1 0 ${2 * L} 0a${L} ${L} 0 1 0 ${-2 * L} 0Z`;
  }
  const SHAPE_NAME: Record<AreaShape, string> = { circulo: 'Círculo', cone: 'Cone', linha: 'Linha', quadrado: 'Cubo' };
  const sizeWord = (a: Area) => (a.shape === 'circulo' ? 'raio' : a.shape === 'quadrado' ? 'lado' : 'comprimento');

  const TOOLS: Array<[Tool, IconName, string, string]> = [
    ['mover', 'mover', 'Mover', 'Arrasta fichas e a vista (M)'],
    ['regua', 'regua', 'Régua', 'Arraste para medir; recomece do fim para emendar trechos (R)'],
    ['area', 'area', 'Área', 'Arraste da origem para marcar uma área de efeito (A)'],
  ];
  const sides: Record<string, string> = { grupo: 'Grupo', aliado: 'Aliado', inimigo: 'Inimigo' };
  const SIZES: Array<[number, string]> = [[1, 'Médio ou menor (1)'], [2, 'Grande (2×2)'], [3, 'Enorme (3×3)'], [4, 'Imenso (4×4)']];

  function setSize(c: Combatant, size: number) {
    if (!enc) return;
    const pos = c.pos ? clampCell(c.pos, grid, size) : c.pos;
    save(update(enc, c.name, { size, pos }));
  }

  // ------------------------------------------------------------ configuração

  let settings = $state(false);
  let fCols = $state(24);
  let fRows = $state(16);
  let fScale = $state('1,5');
  let fUnit = $state('m');
  let fDiag = $state<DiagonalRule>('padrao');
  let fImage = $state('');
  const images = $derived(files.list.filter((p) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(p)));

  function openSettings() {
    fCols = grid.cols;
    fRows = grid.rows;
    fScale = String(grid.scale).replace('.', ',');
    fUnit = grid.unit;
    fDiag = grid.diagonal;
    fImage = grid.image;
    settings = true;
  }
  function saveSettings() {
    if (!path) return;
    const scale = Number(fScale.replace(',', '.'));
    const g = {
      cols: clamp(Math.round(fCols) || grid.cols, GRID_MIN, GRID_MAX),
      rows: clamp(Math.round(fRows) || grid.rows, GRID_MIN, GRID_MAX),
      scale: scale > 0 ? scale : grid.scale,
      unit: fUnit.trim() || 'm',
      diagonal: fDiag,
      image: fImage.trim().replace(/^!?\[\[|\]\]$/g, ''),
    };
    cadernos.update(path, (t) => {
      const out = setProps(t, gridProps(g));
      // grade menor: quem ficou de fora volta para dentro
      const e = readEncounter(out);
      return writeEncounter(out, { ...e, list: e.list.map((c) => (c.pos ? { ...c, pos: clampCell(c.pos, g, c.size ?? 1) } : c)) });
    });
    settings = false;
  }
</script>

<div class="grade">
  <header class="head">
    <select class="field" value={path ?? ''} onchange={(e) => mesa.pickEncounter((e.currentTarget as HTMLSelectElement).value || null)} aria-label="Encontro">
      {#if !encounters.length}<option value={path ?? ''}>{path ? mesa.nameOf(path) : 'Nenhum encontro'}</option>{/if}
      {#each encounters as x (x.path)}<option value={x.path}>{x.name}{x.round ? ` · rodada ${x.round}` : ''}</option>{/each}
    </select>
    {#if path}
      <div class="seg" role="radiogroup" aria-label="Ferramenta">
        {#each TOOLS as [id, icon, label, hint] (id)}
          <button role="radio" aria-checked={tool === id} class:on={tool === id} onclick={() => pickTool(id)} title={hint}>
            <Icon name={icon} size={16} /><span>{label}</span>
          </button>
        {/each}
      </div>
      <div class="zoom">
        <button class="icon" onclick={() => zoomAt(1 / 1.25)} title="Afastar (−)" aria-label="Afastar"><Icon name="menos" size={16} /></button>
        <span class="mono small dim">{Math.round(k * 100)}%</span>
        <button class="icon" onclick={() => zoomAt(1.25)} title="Aproximar (+)" aria-label="Aproximar"><Icon name="mais_um" size={16} /></button>
        <button class="icon" onclick={fit} title="Enquadrar a grade (0)" aria-label="Enquadrar"><Icon name="enquadrar" size={16} /></button>
        <button class="icon" onclick={openSettings} title="Tamanho, escala, diagonal e mapa de fundo" aria-label="Configurar grade"><Icon name="ajustes" size={16} /></button>
      </div>
    {/if}
  </header>

  {#if tool === 'area' && path}
    <div class="chips shapes">
      {#each AREA_SHAPES as [id, label] (id)}
        <button class="chip" class:on={shape === id} onclick={() => { shape = id; if (area) area = { ...area, shape: id }; }}>{label}</button>
      {/each}
    </div>
  {/if}

  {#if !path || !enc}
    <div class="empty-state">
      <p>A grade mostra um encontro: as fichas dele vão para as casas, e dá para medir distâncias e marcar áreas de efeito.</p>
      <button class="primary" onclick={() => mesa.newEncounter(`Encontro ${encounters.length + 1}`)}>Criar encontro</button>
    </div>
  {:else}
    <div class="body">
      <div class="wrap" style:--ar={grid.cols / grid.rows}>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
        <svg
          bind:this={svg}
          class="board"
          class:placing={!!placing}
          data-tool={tool}
          role="application"
          aria-label="Grade de batalha"
          tabindex="0"
          onpointerdown={down}
          onpointermove={move}
          onpointerup={(e) => up(e)}
          onpointercancel={(e) => up(e, true)}
          onpointerleave={() => (hover = null)}
          onwheel={wheel}
          onkeydown={key}
        >
          <g transform="translate({tx} {ty}) scale({k})">
            <rect class="floor" width={W} height={H} />
            {#if imgUrl}<image href={imgUrl} width={W} height={H} preserveAspectRatio="none" />{/if}
            <path class="lines" d={gridPath} vector-effect="non-scaling-stroke" />

            {#if labels}
              {#each { length: grid.cols } as _, x (x)}
                <text class="coord" x={(x + 0.5) * CELL} y={-fs(7)} font-size={fs(10)} text-anchor="middle">{colName(x)}</text>
              {/each}
              {#each { length: grid.rows } as _, y (y)}
                <text class="coord" x={-fs(6)} y={(y + 0.5) * CELL} font-size={fs(10)} text-anchor="end" dominant-baseline="central">{y + 1}</text>
              {/each}
            {/if}

            {#if hover && (placing || tool !== 'mover')}
              <rect class="hover" x={hover.x * CELL} y={hover.y * CELL} width={CELL} height={CELL} />
            {/if}

            {#if area}
              {#each cells as c (`${c.x},${c.y}`)}<rect class="acell" x={c.x * CELL} y={c.y * CELL} width={CELL} height={CELL} />{/each}
              <path class="aline" d={areaOutline(area)} vector-effect="non-scaling-stroke" />
              <circle class="aorigin" cx={area.origin.x * CELL} cy={area.origin.y * CELL} r={fs(4)} />
            {/if}

            {#each enc.list as c (c.name)}
              {#if c.pos}
                {@const at = drag && drag.name === c.name ? drag.at : c.pos}
                {@const size = c.size ?? 1}
                {@const r = (size * CELL) / 2 - 3}
                {@const frac = c.hp !== null && c.hpMax ? clamp(c.hp / c.hpMax, 0, 1) : null}
                {#if drag && drag.name === c.name}
                  <rect class="from" x={c.pos.x * CELL + 2} y={c.pos.y * CELL + 2} width={size * CELL - 4} height={size * CELL - 4} rx={size * 8} />
                {/if}
                <g
                  class="tok"
                  class:sel={sel === c.name}
                  class:turn={enc.turn === c.name}
                  class:out={isOut(c)}
                  class:hit={hit.includes(c)}
                  class:dragging={drag?.name === c.name}
                  data-side={c.side}
                  data-token={c.name}
                  style:transform="translate({(at.x + size / 2) * CELL}px, {(at.y + size / 2) * CELL}px)"
                >
                  {#if enc.turn === c.name}<circle class="ring" r={r + 3} />{/if}
                  <circle class="disc" {r} />
                  {#if frac !== null}
                    <circle class="hpring" class:mid={frac <= 0.5} class:low={frac <= 0.25} r={r - 2} pathLength="100" stroke-dasharray="{frac * 100} 100" transform="rotate(-90)" />
                  {/if}
                  <text class="ini" font-size={Math.min(15, r * 0.75)} text-anchor="middle" dominant-baseline="central">{initials(c.name)}</text>
                  {#if k * CELL >= 30 || sel === c.name || enc.turn === c.name}
                    <text class="tname" y={r + fs(10)} font-size={fs(10.5)} text-anchor="middle">{plain(c.name).slice(0, 18)}</text>
                  {/if}
                  <title>{plain(c.name)}{c.hp !== null ? ` · PV ${c.hp}${c.hpMax !== null ? `/${c.hpMax}` : ''}` : ''}{c.ac !== null ? ` · CA ${c.ac}` : ''} · {cellName(c.pos)}</title>
                </g>
              {/if}
            {/each}

            {#if drag && dragInfo && !same(drag.at, drag.from)}
              {@const a = center(drag.from, drag.size)}
              {@const b = center(drag.at, drag.size)}
              <line class="mline" class:over={dragInfo.over} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vector-effect="non-scaling-stroke" />
              <g transform="translate({b.x} {b.y - (drag.size * CELL) / 2 - fs(14)})">
                <text class="mlabel" class:over={dragInfo.over} font-size={fs(12)} text-anchor="middle">
                  {distanceLabel(dragInfo.squares, grid)}{dragInfo.speed !== null ? ` / ${dragInfo.speed} q` : ''}
                </text>
              </g>
            {/if}

            {#if ruler.length >= 2}
              {@const ps = ruler.map((c) => center(c))}
              {@const end = ps.at(-1)!}
              <polyline class="rline" points={ps.map((p) => `${p.x},${p.y}`).join(' ')} vector-effect="non-scaling-stroke" />
              {#each ps as p, i (i)}<circle class="rdot" cx={p.x} cy={p.y} r={fs(3.5)} />{/each}
              <text class="mlabel" x={end.x} y={end.y - fs(12)} font-size={fs(12)} text-anchor="middle">{distanceLabel(rulerSquares, grid)}</text>
            {/if}
          </g>
        </svg>
        <div class="status mono small" aria-live="polite">
          {#if placing}Toque numa casa para pôr <b>{plain(placing)}</b> · Esc cancela
          {:else if hover}{cellName(hover)}{/if}
        </div>
      </div>

      <aside class="panel">
        <section class="box turnbox">
          <div>
            {#if enc.round > 0}<span class="dim small">Rodada {enc.round}</span><b class="who">{enc.turn ? plain(enc.turn) : '—'}</b>
            {:else}<span class="dim small">Combate não começou</span>{/if}
          </div>
          <button class="primary sm" onclick={step} disabled={!enc.list.length} title="Próximo turno (N)">{enc.turn ? 'Próximo ▸' : 'Começar ▸'}</button>
        </section>

        {#if tool === 'regua'}
          <section class="box">
            <h3>Régua</h3>
            {#if ruler.length >= 2}
              <p class="big mono">{distanceLabel(rulerSquares, grid)}</p>
              <p class="dim small">{ruler.map(cellName).join(' → ')}</p>
              <button class="ghost sm" onclick={() => (ruler = [])}>Limpar</button>
            {:else}
              <p class="dim small">Arraste entre duas casas. Para emendar outro trecho, comece a arrastar do fim da régua.</p>
            {/if}
          </section>
        {:else if tool === 'area'}
          <section class="box">
            <h3>Área</h3>
            {#if area}
              <p><b>{SHAPE_NAME[area.shape]}</b> · {sizeWord(area)} <span class="mono">{distanceLabel(area.size, grid)}</span></p>
              <p class="dim small">{cells.length} {cells.length === 1 ? 'casa' : 'casas'}</p>
              {#if hit.length}
                <p class="small">Atinge:</p>
                <div class="chips">{#each hit as c (c.name)}<span class="tag" data-side={c.side}>{plain(c.name)}</span>{/each}</div>
              {:else}<p class="dim small">Ninguém dentro.</p>{/if}
              <button class="ghost sm" onclick={() => (area = null)}>Limpar</button>
            {:else}
              <p class="dim small">Escolha a forma e arraste do ponto de origem. Círculo e cone saem de um cruzamento ou do centro de uma casa.</p>
            {/if}
          </section>
        {/if}

        {#if selected}
          <section class="box">
            <h3>Selecionado</h3>
            <p class="selname">
              {#if sheetFor(selected)}<button class="lnk" onclick={() => onOpenNote(sheetFor(selected)!)}>{plain(selected.name)}</button>{:else}<b>{plain(selected.name)}</b>{/if}
              <small class="dim">{sides[selected.side] ?? selected.side}</small>
            </p>
            <p class="dim small mono">
              {selected.pos ? cellName(selected.pos) : 'fora da grade'}{selected.hp !== null ? ` · PV ${selected.hp}${selected.hpMax !== null ? `/${selected.hpMax}` : ''}` : ''}{selected.ac !== null ? ` · CA ${selected.ac}` : ''}{selSpeed !== null ? ` · desloc. ${distanceLabel(selSpeed, grid)}` : ''}
            </p>
            <label class="row small">Tamanho
              <select class="field" value={selected.size ?? 1} onchange={(e) => setSize(selected, Number((e.currentTarget as HTMLSelectElement).value))}>
                {#each SIZES as [n, label] (n)}<option value={n}>{label}</option>{/each}
              </select>
            </label>
            {#if distances.length}
              <h3>Distância até</h3>
              <ul class="dist">
                {#each distances as { c, d } (c.name)}
                  <li data-side={c.side}><span>{plain(c.name)}</span><span class="mono dim">{distanceLabel(d, grid)}</span></li>
                {/each}
              </ul>
            {/if}
            <div class="acts">
              {#if selected.pos}<button class="ghost sm" onclick={() => save(moveCombatant(enc!, selected.name, null))}>Tirar da grade</button>{/if}
            </div>
            <p class="dim small">Setas movem uma casa · Delete tira da grade</p>
          </section>
        {/if}

        <section class="box">
          <h3>Fora da grade</h3>
          {#if unplaced.length}
            <ul class="out-list">
              {#each unplaced as c (c.name)}
                <li data-side={c.side}>
                  <button class="chip" class:on={placing === c.name} onclick={() => { placing = placing === c.name ? null : c.name; sel = c.name; }}>{plain(c.name)}</button>
                </li>
              {/each}
            </ul>
            <button class="ghost sm" onclick={() => save(autoPlace(enc!, grid))} title="Grupo pela esquerda, inimigos pela direita">Distribuir todos</button>
          {:else if enc.list.length}
            <p class="dim small">Todo mundo está na grade.</p>
          {:else}
            <p class="dim small">Sem combatentes. Acrescente na aba <b>Combate</b>.</p>
          {/if}
        </section>

        <p class="dim small legend">{grid.cols}×{grid.rows} · 1 q = {String(grid.scale).replace('.', ',')} {grid.unit} · diagonal {DIAGONAL_RULES.find(([d]) => d === grid.diagonal)?.[1].toLowerCase()}</p>
      </aside>
    </div>
  {/if}

  {#if settings}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) settings = false; }}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Configurar grade">
        <h2>Grade</h2>
        <form onsubmit={(e) => { e.preventDefault(); saveSettings(); }}>
          <div class="pair">
            <label>Colunas<input class="field" type="number" min={GRID_MIN} max={GRID_MAX} bind:value={fCols} /></label>
            <label>Linhas<input class="field" type="number" min={GRID_MIN} max={GRID_MAX} bind:value={fRows} /></label>
          </div>
          <div class="pair">
            <label>Um quadrado vale<input class="field" inputmode="decimal" bind:value={fScale} /></label>
            <label>Unidade
              <select class="field" bind:value={fUnit}>
                <option value="m">metros</option>
                <option value="ft">pés (ft)</option>
                {#if fUnit !== 'm' && fUnit !== 'ft'}<option value={fUnit}>{fUnit}</option>{/if}
              </select>
            </label>
          </div>
          <label>Diagonal
            <select class="field" bind:value={fDiag}>
              {#each DIAGONAL_RULES as [id, label] (id)}<option value={id}>{label}</option>{/each}
            </select>
            <span class="hint dim">Padrão é a do livro do jogador do 5e; alternada é a regra opcional (e a do Pathfinder).</span>
          </label>
          <label>Mapa de fundo
            <input class="field" list="grade-imagens" bind:value={fImage} placeholder="cripta.png" />
            <datalist id="grade-imagens">{#each images as p (p)}<option value={p}></option>{/each}</datalist>
            <span class="hint dim">Uma imagem do cofre, esticada sobre a grade toda. Deixe vazio para só a grade.</span>
          </label>
          <div class="formacts">
            {#if path}<button type="button" class="ghost" onclick={() => { settings = false; onOpenNote(path!); }}>Abrir nota</button>{/if}
            <button type="button" class="ghost" onclick={() => (settings = false)}>Cancelar</button>
            <button class="primary">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .grade { display: flex; flex-direction: column; gap: 10px; min-height: 0; container-type: inline-size; }
  .head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .head > select { max-width: min(280px, 100%); }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--surface-2); }
  .seg button { border: 0; background: none; color: var(--muted); padding: 5px 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on { color: var(--ink); background: color-mix(in srgb, var(--ember) 16%, transparent); }
  .zoom { display: inline-flex; align-items: center; gap: 2px; margin-left: auto; }
  .shapes { margin-top: -2px; }

  .body { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 12px; min-height: 0; }
  /* a altura acompanha a proporção da grade, sem passar da tela */
  .wrap { position: relative; min-width: 0; width: 100%; aspect-ratio: var(--ar, 1.5); min-height: 260px; max-height: calc(100vh - 240px);
    border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--void); }
  .board { display: block; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; outline: none; }
  .board:focus-visible { box-shadow: inset 0 0 0 2px var(--ember); }
  .board[data-tool='regua'], .board[data-tool='area'], .board.placing { cursor: crosshair; }
  .status { position: absolute; left: 10px; bottom: 8px; padding: 2px 8px; border-radius: 8px; background: color-mix(in srgb, var(--surface) 85%, transparent);
    color: var(--muted); pointer-events: none; max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status:empty { display: none; }

  .floor { fill: var(--surface); }
  .lines { fill: none; stroke: color-mix(in srgb, var(--ink) 16%, transparent); stroke-width: 1; }
  .coord { fill: var(--muted); font-family: var(--f-mono); }
  .hover { fill: color-mix(in srgb, var(--ember) 14%, transparent); stroke: var(--ember); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
  .acell { fill: color-mix(in srgb, var(--ember) 26%, transparent); pointer-events: none; }
  .aline { fill: none; stroke: var(--ember); stroke-width: 2; stroke-dasharray: 6 4; pointer-events: none; }
  .aorigin { fill: var(--ember); pointer-events: none; }

  .tok { cursor: grab; transition: transform var(--dur) var(--ease); }
  .tok.dragging { cursor: grabbing; transition: none; }
  .board[data-tool='regua'] .tok, .board[data-tool='area'] .tok { cursor: crosshair; }
  .tok .disc { fill: var(--surface-2); stroke: var(--muted); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .tok[data-side='grupo'] .disc { fill: color-mix(in srgb, var(--ok) 30%, var(--surface)); stroke: var(--ok); }
  .tok[data-side='aliado'] .disc { fill: color-mix(in srgb, #7fb6ff 30%, var(--surface)); stroke: #7fb6ff; }
  .tok[data-side='inimigo'] .disc { fill: color-mix(in srgb, var(--crit) 28%, var(--surface)); stroke: var(--crit); }
  .tok .hpring { fill: none; stroke: var(--ok); stroke-width: 2.5; opacity: .85; pointer-events: none; }
  .tok .hpring.mid { stroke: #f5c26b; }
  .tok .hpring.low { stroke: var(--crit); }
  .tok .ini { fill: var(--ink); font-family: var(--f-display); font-weight: 700; pointer-events: none; }
  .tok .tname { fill: var(--ink); font-family: var(--f-body); paint-order: stroke; stroke: var(--void); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
  .tok .ring { fill: none; stroke: var(--ember); stroke-width: 2.5; stroke-dasharray: 5 4; vector-effect: non-scaling-stroke; animation: spin 6s linear infinite; }
  .tok.sel .disc { stroke: var(--ink); stroke-width: 3; }
  .tok.hit .disc { stroke: var(--ember); stroke-width: 3.5; }
  .tok.out { opacity: .4; }
  .from { fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 4 3; vector-effect: non-scaling-stroke; }
  .mline, .rline { fill: none; stroke: var(--ember); stroke-width: 2.5; stroke-dasharray: 7 5; vector-effect: non-scaling-stroke; pointer-events: none; }
  .mline.over { stroke: var(--crit); }
  .rdot { fill: var(--ember); pointer-events: none; }
  .mlabel { fill: var(--ink); font-family: var(--f-mono); font-weight: 600; paint-order: stroke; stroke: var(--void); stroke-width: 4px; stroke-linejoin: round; pointer-events: none; }
  .mlabel.over { fill: var(--crit); }
  @keyframes spin { to { stroke-dashoffset: -36; } }
  @media (prefers-reduced-motion: reduce) { .tok .ring { animation: none; } .tok { transition: none; } }

  .panel { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .panel .box { display: grid; gap: 6px; padding: 10px 12px; }
  .panel h3 { margin: 0; }
  .panel p { margin: 0; }
  .turnbox { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
  .turnbox > div { display: grid; min-width: 0; }
  .who { font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .big { font-size: 18px; font-weight: 600; }
  .selname { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .lnk { border: 0; background: none; padding: 0; color: var(--ink); font-weight: 600; text-decoration: underline dotted var(--muted); }
  .lnk:hover { color: var(--ember); }
  .row { display: flex; gap: 8px; align-items: center; justify-content: space-between; color: var(--muted); }
  .row select { flex: 1; min-width: 0; }
  .dist { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 200px; overflow-y: auto; }
  .dist li { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 2px 0 2px 8px; }
  .dist li span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dist li[data-side='grupo'], .out-list li[data-side='grupo'] { box-shadow: inset 3px 0 0 var(--ok); }
  .dist li[data-side='aliado'], .out-list li[data-side='aliado'] { box-shadow: inset 3px 0 0 #7fb6ff; }
  .dist li[data-side='inimigo'], .out-list li[data-side='inimigo'] { box-shadow: inset 3px 0 0 var(--crit); }
  .out-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .out-list li { padding-left: 6px; border-radius: 4px; }
  .out-list .chip { font-family: var(--f-body); }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .legend { padding: 0 4px; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 12px; }

  /* pouco espaço (barra de notas e histórico abertos, tablet): o painel desce */
  @container (max-width: 860px) {
    .body { grid-template-columns: minmax(0, 1fr); }
    .panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); align-items: start; }
  }
  @container (max-width: 520px) {
    .seg span { display: none; }
    .zoom { margin-left: 0; }
  }
</style>
