<script lang="ts">
  import type { PdfAnnotation } from '@tanden/core';
  import { pdfjs, type PdfDoc, type PdfPage } from './pdfjs';
  import { foldWithMap, hitTest, mergeLineRects, simplify, type Rect } from './geometry';

  export type Tool = 'select' | 'highlight' | 'underline' | 'strike' | 'note' | 'pen' | 'box' | 'eraser';

  let {
    doc, num, scale, base, mode, annots, tool, color, penWidth, selected, query, activeHit,
    onCreate, onSelect, onErase, onTextPicked,
  }: {
    doc: PdfDoc;
    num: number;
    scale: number;
    /** tamanho da página em escala 1 (px CSS) */
    base: { w: number; h: number };
    /** render: desenha; keep: mantém o que tem; drop: libera a memória */
    mode: 'render' | 'keep' | 'drop';
    annots: PdfAnnotation[];
    tool: Tool;
    color: string;
    penWidth: number;
    selected: string | null;
    query: string;
    /** qual ocorrência da busca nesta página está ativa (-1: nenhuma) */
    activeHit: number;
    onCreate: (a: Omit<PdfAnnotation, 'id' | 'created' | 'device'>) => string | void;
    onSelect: (id: string | null, at?: { x: number; y: number }) => void;
    onErase: (id: string) => void;
    /** texto selecionado com a ferramenta de seleção: o pai mostra o menu */
    onTextPicked: (pick: { page: number; rects: Rect[]; text: string; at: { x: number; y: number } } | null) => void;
  } = $props();

  let host = $state<HTMLDivElement>();
  let holder = $state<HTMLDivElement>();
  let textDiv = $state<HTMLDivElement>();
  let page = $state<PdfPage | null>(null);
  let rendered = $state(0); // escala desenhada no canvas atual
  let textReady = $state(0);
  let drawing = $state<number[] | null>(null);
  let boxing = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  let searchRects = $state<Array<{ r: [number, number, number, number]; active: boolean }>>([]);
  let task: { cancel(): void; promise: Promise<unknown> } | null = null;
  let textLayer: { cancel(): void } | null = null;
  let renderSeq = 0;

  const vp = $derived(page ? page.getViewport({ scale }) : null);
  const w = $derived(Math.floor(base.w * scale));
  const h = $derived(Math.floor(base.h * scale));

  $effect(() => {
    if (mode === 'render' && !page) void doc.getPage(num).then((p) => (page = p));
  });

  // desenha (ou redesenha no zoom novo) quando a página está à vista
  $effect(() => {
    if (mode === 'render' && page && rendered !== scale) void draw(scale);
  });

  // longe da vista: devolve a memória do canvas (importante no celular)
  $effect(() => {
    if (mode === 'drop' && rendered) release();
  });

  function release() {
    task?.cancel();
    textLayer?.cancel();
    holder?.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; c.remove(); });
    if (textDiv) textDiv.replaceChildren();
    rendered = 0;
    textReady = 0;
    searchRects = [];
  }

  async function draw(s: number) {
    if (!page || !holder || !textDiv) return;
    const seq = ++renderSeq;
    task?.cancel();
    textLayer?.cancel();
    const lib = await pdfjs();
    const viewport = page.getViewport({ scale: s });
    // limita os pixels por página (memória do celular)
    const maxPixels = 16_000_000;
    let ratio = window.devicePixelRatio || 1;
    if (viewport.width * viewport.height * ratio * ratio > maxPixels) ratio = Math.sqrt(maxPixels / (viewport.width * viewport.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const t = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
      transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      annotationMode: lib.AnnotationMode.ENABLE,
    });
    task = t;
    try {
      await t.promise;
    } catch {
      return; // cancelado por um zoom novo ou por sair da vista
    }
    if (seq !== renderSeq) return;
    // troca o canvas só quando o novo está pronto: o zoom não pisca
    holder.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; c.remove(); });
    holder.appendChild(canvas);
    rendered = s;

    textDiv.replaceChildren();
    const tl = new lib.TextLayer({
      textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: textDiv,
      viewport,
    });
    textLayer = tl;
    try {
      await tl.render();
    } catch {
      return;
    }
    if (seq !== renderSeq) return;
    const end = document.createElement('div');
    end.className = 'endOfContent';
    textDiv.appendChild(end);
    textReady = s;
  }

  /* ----------------------------------------------------- coordenadas */

  function toPdf(clientX: number, clientY: number): [number, number] {
    const r = host!.getBoundingClientRect();
    return vp!.convertToPdfPoint(clientX - r.left, clientY - r.top) as [number, number];
  }

  /** Retângulo do PDF → px na página. */
  function px(rect: number[]): [number, number, number, number] {
    const [a, b] = vp!.convertToViewportPoint(rect[0]!, rect[1]!);
    const [c, d] = vp!.convertToViewportPoint(rect[2]!, rect[3]!);
    return [Math.min(a!, c!), Math.min(b!, d!), Math.abs(c! - a!), Math.abs(d! - b!)];
  }

  function inkPath(points: number[]): string {
    if (!vp || points.length < 2) return '';
    let d = '';
    for (let i = 0; i + 1 < points.length; i += 2) {
      const [x, y] = vp.convertToViewportPoint(points[i]!, points[i + 1]!);
      d += `${i ? 'L' : 'M'}${x!.toFixed(1)} ${y!.toFixed(1)}`;
    }
    return points.length === 2 ? `${d}l0.1 0` : d;
  }

  /* ----------------------------------------------------- seleção de texto */

  /** Retângulos (PDF) e texto da seleção atual que caem nesta página. */
  function pickSelection(): { rects: Rect[]; text: string } | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !textDiv || !vp) return null;
    const range = sel.getRangeAt(0);
    if (!textDiv.contains(range.commonAncestorContainer) && !range.intersectsNode(textDiv)) return null;
    const box = host!.getBoundingClientRect();
    const rects: Rect[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) continue;
      // só o que está dentro desta página
      if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) continue;
      const [x1, y1] = vp.convertToPdfPoint(r.left - box.left, r.bottom - box.top);
      const [x2, y2] = vp.convertToPdfPoint(r.right - box.left, r.top - box.top);
      rects.push([x1!, y1!, x2!, y2!]);
    }
    const merged = mergeLineRects(rects);
    if (!merged.length) return null;
    // o texto: só a parte desta página
    const pageRange = range.cloneRange();
    if (!textDiv.contains(range.startContainer)) pageRange.setStart(textDiv, 0);
    if (!textDiv.contains(range.endContainer)) pageRange.setEnd(textDiv, textDiv.childNodes.length);
    const text = pageRange.toString().replace(/\s+/g, ' ').trim();
    return { rects: merged, text };
  }

  function onPointerDown(e: PointerEvent) {
    if (!vp) return;
    if (tool === 'select' || tool === 'highlight' || tool === 'underline' || tool === 'strike') {
      textDiv?.classList.add('selecting');
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const [x, y] = toPdf(e.clientX, e.clientY);
    if (tool === 'pen') drawing = [x, y];
    else if (tool === 'box') boxing = { x0: x, y0: y, x1: x, y1: y };
    else if (tool === 'eraser') erase(x, y);
    else if (tool === 'note') {
      const id = onCreate({ page: num, kind: 'note', color, rects: [[x, y, x, y]] });
      if (id) onSelect(id, { x: e.clientX, y: e.clientY });
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!vp || (!drawing && !boxing && !(tool === 'eraser' && e.buttons === 1))) return;
    // traços de caneta: usa os pontos intermediários que o sistema juntou
    const events = drawing && 'getCoalescedEvents' in e ? e.getCoalescedEvents() : [e];
    for (const ev of events.length ? events : [e]) {
      const [x, y] = toPdf(ev.clientX, ev.clientY);
      if (drawing) drawing.push(x, y);
      else if (boxing) boxing = { ...boxing, x1: x, y1: y };
      else if (tool === 'eraser') erase(x, y);
    }
  }

  function onPointerUp(e: PointerEvent) {
    textDiv?.classList.remove('selecting');
    if (drawing) {
      const pts = simplify(drawing, 0.35 / Math.max(0.5, scale));
      drawing = null;
      onCreate({ page: num, kind: 'ink', color, width: penWidth, ink: [pts] });
      return;
    }
    if (boxing) {
      const { x0, y0, x1, y1 } = boxing;
      boxing = null;
      if (Math.abs(x1 - x0) > 3 && Math.abs(y1 - y0) > 3) {
        const id = onCreate({ page: num, kind: 'box', color, width: 1.5, rects: [[Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]] });
        if (id) onSelect(id, { x: e.clientX, y: e.clientY });
      }
      return;
    }
    if (tool === 'select' || tool === 'highlight' || tool === 'underline' || tool === 'strike') {
      const pick = pickSelection();
      if (pick) {
        if (tool === 'select') onTextPicked({ page: num, ...pick, at: { x: e.clientX, y: e.clientY } });
        else {
          onCreate({ page: num, kind: tool, color, rects: pick.rects, text: pick.text });
          window.getSelection()?.removeAllRanges();
        }
        return;
      }
      // clique simples: escolhe a anotação sob o cursor
      if (!vp) return;
      const [x, y] = toPdf(e.clientX, e.clientY);
      const hit = hitTest(annots, x, y, 6 / scale);
      onSelect(hit?.id ?? null, { x: e.clientX, y: e.clientY });
    }
  }

  function erase(x: number, y: number) {
    const hit = hitTest(annots, x, y, 8 / scale);
    if (hit) onErase(hit.id);
  }

  /* ----------------------------------------------------------- busca */

  $effect(() => {
    void textReady;
    const q = query;
    const active = activeHit;
    if (!textDiv || !textReady || !vp) {
      searchRects = [];
      return;
    }
    if (!q) {
      searchRects = [];
      return;
    }
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(textDiv, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    const starts: number[] = [];
    let all = '';
    for (const n of nodes) {
      starts.push(all.length);
      all += n.data;
    }
    const { text, map } = foldWithMap(all);
    const needle = foldWithMap(q).text;
    const out: Array<{ r: [number, number, number, number]; active: boolean }> = [];
    const box = host!.getBoundingClientRect();
    let k = 0;
    for (let i = text.indexOf(needle); i >= 0 && needle; i = text.indexOf(needle, i + needle.length)) {
      const s = map[i]!;
      const en = map[i + needle.length] ?? all.length;
      const locate = (off: number) => {
        let idx = starts.findIndex((st, j) => off >= st && (j === starts.length - 1 || off < starts[j + 1]!));
        if (idx < 0) idx = nodes.length - 1;
        return { node: nodes[idx]!, offset: Math.min(off - starts[idx]!, nodes[idx]!.data.length) };
      };
      const a = locate(s);
      const b = locate(en);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width < 1) continue;
        out.push({ r: [r.left - box.left, r.top - box.top, r.width, r.height], active: k === active });
      }
      k++;
    }
    searchRects = out;
  });

  $effect(() => {
    // a ocorrência ativa entrou na vista: centraliza
    if (searchRects.some((s) => s.active)) queueMicrotask(() => host?.querySelector('.hit.active')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  });

  const interactive = $derived(tool === 'note' || tool === 'pen' || tool === 'box' || tool === 'eraser');
</script>

<div
  class="page"
  bind:this={host}
  data-page={num}
  style:width="{w}px"
  style:height="{h}px"
  style:--scale-factor={scale}
  style:--total-scale-factor={scale * (vp?.userUnit ?? 1)}
  style:--user-unit={vp?.userUnit ?? 1}
>
  <div class="holder" bind:this={holder}></div>
  {#if !rendered}<div class="placeholder"><span>{num}</span></div>{/if}

  {#if vp}
    <svg class="marks" viewBox="0 0 {vp.width} {vp.height}" aria-hidden="true">
      {#each searchRects as s, i (i)}
        <rect class="hit" class:active={s.active} x={s.r[0] - 1} y={s.r[1] - 1} width={s.r[2] + 2} height={s.r[3] + 2} rx="2" />
      {/each}
      {#each annots as a (a.id)}
        {@const sel = a.id === selected}
        <g class="annot {a.kind}" class:sel style:--c={a.color}>
          {#if a.kind === 'highlight' && a.rects}
            {#each a.rects as r, i (i)}{@const [x, y, rw, rh] = px(r)}<rect {x} {y} width={rw} height={rh} rx="1.5" />{/each}
          {:else if (a.kind === 'underline' || a.kind === 'strike') && a.rects}
            {#each a.rects as r, i (i)}
              {@const [x, y, rw, rh] = px(r)}
              {@const ly = a.kind === 'underline' ? y + rh - Math.max(1, rh * 0.08) : y + rh * 0.55}
              <line x1={x} y1={ly} x2={x + rw} y2={ly} stroke-width={Math.max(1.2, rh * 0.08)} />
              {#if sel}<rect class="outline" x={x - 2} y={y - 2} width={rw + 4} height={rh + 4} rx="3" />{/if}
            {/each}
          {:else if a.kind === 'box' && a.rects?.[0]}
            {@const [x, y, rw, rh] = px(a.rects[0])}
            <rect class="frame" {x} {y} width={rw} height={rh} rx="2" stroke-width={(a.width ?? 1.5) * scale} />
          {:else if a.kind === 'ink' && a.ink}
            {#each a.ink as s, i (i)}<path d={inkPath(s)} stroke-width={(a.width ?? 2) * scale} />{/each}
          {:else if a.kind === 'note' && a.rects?.[0]}
            {@const [nx, ny] = vp.convertToViewportPoint(a.rects[0][0]!, a.rects[0][1]!)}
            <g class="pin" transform="translate({nx} {ny}) scale({Math.max(0.8, Math.min(1.4, scale))})">
              <path d="M0 0h20v14h-12l-5 5v-5h-3z" />
              <path class="lines" d="M4 5h12M4 9h8" />
            </g>
          {/if}
          {#if a.comment && a.kind !== 'note' && a.rects?.[0]}
            {@const [cx, cy] = px(a.rects[0])}
            <circle class="dot" cx={cx - 5} cy={cy + 4} r="3.2" />
          {/if}
        </g>
      {/each}
      {#if drawing}<path class="live" d={inkPath(drawing)} stroke={color} stroke-width={penWidth * scale} />{/if}
      {#if boxing}
        {@const [x, y, rw, rh] = px([boxing.x0, boxing.y0, boxing.x1, boxing.y1])}
        <rect class="live-box" {x} {y} width={rw} height={rh} stroke={color} />
      {/if}
    </svg>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="textLayer" class:off={interactive} bind:this={textDiv} onpointerdown={onPointerDown} onpointerup={onPointerUp}></div>
  {#if interactive}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ink-input" class:eraser={tool === 'eraser'} class:note={tool === 'note'}
      onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp} onpointercancel={() => { drawing = null; boxing = null; }}></div>
  {/if}
</div>

<style>
  .page { position: relative; margin: 0 auto; background: #fff; box-shadow: 0 1px 0 var(--line), 0 18px 40px -22px #000;
    border-radius: 3px; overflow: hidden; }
  .holder, .holder :global(canvas) { position: absolute; inset: 0; display: block; }
  .placeholder { position: absolute; inset: 0; display: grid; place-items: center; background: #f4f3f6; }
  .placeholder span { font: 600 28px var(--f-display); color: #c9c7d1; }
  .marks { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: visible; }
  .hit { fill: rgb(255 138 61 / .28); }
  .hit.active { fill: rgb(255 138 61 / .55); stroke: #ff8a3d; stroke-width: 1.5; }
  .annot.highlight rect { fill: var(--c); opacity: .42; mix-blend-mode: multiply; }
  .annot.underline line, .annot.strike line { stroke: var(--c); }
  .annot.box .frame { fill: none; stroke: var(--c); }
  .annot.ink path { fill: none; stroke: var(--c); stroke-linecap: round; stroke-linejoin: round; }
  .annot.note .pin path { fill: var(--c); stroke: rgb(0 0 0 / .45); stroke-width: .8; }
  .annot.note .pin .lines { fill: none; stroke: rgb(0 0 0 / .55); stroke-width: 1.2; }
  .annot .dot { fill: var(--c); stroke: rgb(0 0 0 / .4); stroke-width: .8; }
  .annot.sel.highlight rect { opacity: .6; stroke: var(--c); stroke-width: 1.2; }
  .annot.sel .outline { fill: none; stroke: var(--c); stroke-dasharray: 3 2; }
  .annot.sel.box .frame, .annot.sel.ink path { filter: drop-shadow(0 0 3px var(--c)); }
  .annot.sel.note .pin { filter: drop-shadow(0 0 4px var(--c)); }
  .live { fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: .9; }
  .live-box { fill: none; stroke-dasharray: 4 3; stroke-width: 1.5; }

  /* camada de texto do pdf.js (seleção), adaptada de pdf_viewer.css */
  .textLayer { position: absolute; inset: 0; overflow: clip; opacity: 1; line-height: 1; z-index: 2; text-align: initial;
    -webkit-text-size-adjust: none; text-size-adjust: none; forced-color-adjust: none; transform-origin: 0 0; caret-color: CanvasText;
    --min-font-size: 1; --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size)); --min-font-size-inv: calc(1 / var(--min-font-size)); }
  .textLayer.off { pointer-events: none; }
  .textLayer :global(:is(span, br)) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; user-select: text; -webkit-user-select: text; }
  .textLayer :global(> :not(.markedContent)), .textLayer :global(.markedContent span:not(.markedContent)) {
    z-index: 1; --font-height: 0; font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1; --rotate: 0deg; transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv)); }
  .textLayer :global(.markedContent) { display: contents; }
  .textLayer :global(span[role='img']) { user-select: none; -webkit-user-select: none; cursor: default; }
  .textLayer :global(::selection) { background: rgb(255 138 61 / .35); color: transparent; }
  .textLayer :global(br::selection) { background: transparent; }
  .textLayer :global(.endOfContent) { display: block; position: absolute; inset: 100% 0 0; z-index: 0; cursor: default; user-select: none; -webkit-user-select: none; }
  .textLayer:global(.selecting) :global(.endOfContent) { top: 0; }
  .textLayer:global([data-main-rotation='90']) { transform: rotate(90deg) translateY(-100%); }
  .textLayer:global([data-main-rotation='180']) { transform: rotate(180deg) translate(-100%, -100%); }
  .textLayer:global([data-main-rotation='270']) { transform: rotate(270deg) translateX(-100%); }

  .ink-input { position: absolute; inset: 0; z-index: 3; touch-action: none; cursor: crosshair; }
  .ink-input.eraser { cursor: cell; }
  .ink-input.note { cursor: copy; }
</style>
