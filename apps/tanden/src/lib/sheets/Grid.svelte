<script lang="ts">
  import { colName, isErr, type Rect } from '@tanden/core';
  import { flushSync } from 'svelte';
  import type { SheetCtl } from './ctl.svelte';

  // Grade virtualizada: só desenha as células que estão na tela.
  let { ctl, version }: { ctl: SheetCtl; version: number } = $props();

  const ROW_H = 26;
  const HEAD_H = 24;
  const ROWHEAD_W = 46;

  let scroller = $state<HTMLDivElement>();
  let editor = $state<HTMLInputElement>();
  let top = $state(0);
  let left = $state(0);
  let viewH = $state(600);
  let viewW = $state(900);
  let extraRows = $state(0);
  /** largura sendo arrastada (antes de gravar) */
  let resizing = $state<{ c: number; w: number; x0: number; w0: number } | null>(null);
  let fillTarget = $state<Rect | null>(null);
  let drag: 'select' | 'ref' | 'fill' | null = null;

  const wb = $derived(ctl.wb!);
  const sheet = $derived(ctl.sheet);

  const bounds = $derived.by(() => { void version; return wb.bounds(sheet); });
  const nRows = $derived(Math.max(200, bounds.rows + 60, ctl.sel.fr + 40, ctl.sel.ar + 40) + extraRows);
  const nCols = $derived(Math.max(26, bounds.cols + 6, ctl.sel.fc + 6, ctl.sel.ac + 6));

  /** posição x do início de cada coluna (prefixos) */
  const xs = $derived.by(() => {
    void version;
    const widths = wb.colWidths(sheet);
    const out = new Float64Array(nCols + 1);
    for (let c = 0; c < nCols; c++) {
      const w = resizing?.c === c ? resizing.w : (widths.get(c) ?? 100);
      out[c + 1] = out[c]! + w;
    }
    return out;
  });

  const colAt = (x: number) => {
    let lo = 0, hi = nCols - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (xs[m]! <= x) lo = m; else hi = m - 1; }
    return lo;
  };

  const vis = $derived({
    r0: Math.max(0, Math.floor(top / ROW_H) - 2),
    r1: Math.min(nRows - 1, Math.ceil((top + viewH) / ROW_H) + 2),
    c0: Math.max(0, colAt(left) - 1),
    c1: Math.min(nCols - 1, colAt(left + viewW) + 1),
  });

  type CellView = { r: number; c: number; text: string; cls: string; title?: string };
  const cells = $derived.by(() => {
    void version;
    const out: CellView[] = [];
    for (let r = vis.r0; r <= vis.r1; r++) {
      for (let c = vis.c0; c <= vis.c1; c++) {
        if (wb.raw(sheet, r, c) === '' && !Object.keys(wb.format(sheet, r, c)).length) continue;
        const v = wb.value(sheet, r, c);
        const f = wb.format(sheet, r, c);
        let cls = typeof v === 'number' ? 'n' : typeof v === 'boolean' ? 'b' : isErr(v) ? 'e' : '';
        if (f.al) cls = `al-${f.al}${isErr(v) ? ' e' : ''}`;
        if (f.b) cls += ' bold';
        if (f.i) cls += ' it';
        out.push({ r, c, text: wb.display(sheet, r, c), cls, title: isErr(v) ? (v.why ?? v.code) : undefined });
      }
    }
    return out;
  });

  const rect = $derived(ctl.rect);
  const box = (x: Rect) => ({
    x: xs[x.c0]!, y: x.r0 * ROW_H, w: xs[Math.min(x.c1 + 1, nCols)]! - xs[x.c0]!, h: (x.r1 - x.r0 + 1) * ROW_H,
  });
  const selBox = $derived(box(rect));
  const fillBox = $derived(fillTarget ? box(fillTarget) : null);

  function onScroll() {
    if (!scroller) return;
    top = scroller.scrollTop;
    left = scroller.scrollLeft;
    if (top + viewH > nRows * ROW_H - 400) extraRows += 200;
  }

  $effect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => { viewH = scroller!.clientHeight - HEAD_H; viewW = scroller!.clientWidth - ROWHEAD_W; });
    ro.observe(scroller);
    return () => ro.disconnect();
  });

  // mantém a célula ativa à vista
  $effect(() => {
    const { fr, fc } = ctl.sel;
    if (!scroller) return;
    const y = fr * ROW_H;
    const x0 = xs[fc] ?? 0, x1 = xs[fc + 1] ?? x0 + 100;
    if (y < scroller.scrollTop) scroller.scrollTop = y;
    else if (y + ROW_H > scroller.scrollTop + viewH) scroller.scrollTop = y + ROW_H - viewH;
    if (x0 < scroller.scrollLeft) scroller.scrollLeft = x0;
    else if (x1 > scroller.scrollLeft + viewW) scroller.scrollLeft = x1 - viewW;
  });

  // foco: a grade quando não edita; o campo da célula quando edita por aqui
  $effect(() => {
    void ctl.focusTick;
    if (ctl.edit && editor && document.activeElement?.closest('.fbar') === null) {
      editor.focus();
      editor.setSelectionRange(ctl.caret, ctl.caret);
    }
  });
  $effect(() => {
    if (!ctl.edit && scroller && !document.activeElement?.closest('.fbar, .sheet-tools, dialog, .chart-card')) scroller.focus({ preventScroll: true });
  });

  function cellFromEvent(e: PointerEvent | MouseEvent): { r: number; c: number } | null {
    const b = scroller!.getBoundingClientRect();
    const x = e.clientX - b.left - ROWHEAD_W + scroller!.scrollLeft;
    const y = e.clientY - b.top - HEAD_H + scroller!.scrollTop;
    if (x < 0 || y < 0) return null;
    return { r: Math.floor(y / ROW_H), c: colAt(x) };
  }

  let touchStart: { x: number; y: number } | null = null;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') { touchStart = { x: e.clientX, y: e.clientY }; return; }
    const at = cellFromEvent(e);
    if (!at) return;
    if (ctl.edit && ctl.wantsRef() && !(at.r === ctl.edit.r && at.c === ctl.edit.c)) {
      e.preventDefault();
      ctl.insertRef(at.r, at.c);
      drag = 'ref';
    } else {
      if (ctl.edit) ctl.commit(0, 0);
      ctl.select(at.r, at.c, e.shiftKey);
      drag = 'select';
    }
    scroller!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (resizing) {
      resizing = { ...resizing, w: Math.max(24, resizing.w0 + e.clientX - resizing.x0) };
      return;
    }
    if (!drag) return;
    const at = cellFromEvent(e);
    if (!at) return;
    if (drag === 'select') ctl.select(at.r, at.c, true);
    else if (drag === 'ref') ctl.insertRef(at.r, at.c, true);
    else if (drag === 'fill') {
      const x = ctl.rect;
      const dr = at.r > x.r1 ? at.r - x.r1 : at.r < x.r0 ? at.r - x.r0 : 0;
      const dc = at.c > x.c1 ? at.c - x.c1 : at.c < x.c0 ? at.c - x.c0 : 0;
      if (Math.abs(dr) >= Math.abs(dc) && dr) fillTarget = { ...x, r0: Math.min(x.r0, at.r), r1: Math.max(x.r1, at.r) };
      else if (dc) fillTarget = { ...x, c0: Math.min(x.c0, at.c), c1: Math.max(x.c1, at.c) };
      else fillTarget = null;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (resizing) {
      wb.setColWidth(sheet, resizing.c, resizing.w);
      resizing = null;
      return;
    }
    if (e.pointerType === 'touch' && touchStart) {
      const moved = Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > 8;
      touchStart = null;
      const at = cellFromEvent(e);
      if (!moved && at) {
        if (ctl.edit && ctl.wantsRef()) ctl.insertRef(at.r, at.c);
        else {
          if (ctl.edit) ctl.commit(0, 0);
          const same = ctl.sel.fr === at.r && ctl.sel.fc === at.c;
          ctl.select(at.r, at.c);
          if (same) ctl.begin();
        }
      }
      return;
    }
    if (drag === 'fill' && fillTarget) ctl.fillTo(fillTarget);
    fillTarget = null;
    drag = null;
  }

  function startFill(e: PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    drag = 'fill';
    scroller!.setPointerCapture(e.pointerId);
  }

  function startResize(e: PointerEvent, c: number) {
    e.stopPropagation();
    e.preventDefault();
    const w = xs[c + 1]! - xs[c]!;
    resizing = { c, w, x0: e.clientX, w0: w };
    scroller!.setPointerCapture(e.pointerId);
  }

  function selectCol(e: MouseEvent, c: number) {
    if (ctl.edit) ctl.commit(0, 0);
    if (e.shiftKey) ctl.sel = { ...ctl.sel, fc: c, fr: Math.max(nRows, bounds.rows) - 1, ar: 0 };
    else ctl.sel = { ar: 0, ac: c, fr: Math.max(0, bounds.rows - 1, 99), fc: c };
  }
  function selectRow(e: MouseEvent, r: number) {
    if (ctl.edit) ctl.commit(0, 0);
    if (e.shiftKey) ctl.sel = { ...ctl.sel, fr: r, fc: nCols - 1, ac: 0 };
    else ctl.sel = { ar: r, ac: 0, fr: r, fc: Math.max(0, bounds.cols - 1, 25) };
  }

  function onKey(e: KeyboardEvent) {
    if (ctl.edit) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc] = arrows[k]!;
      if (mod) ctl.jump(dr, dc, e.shiftKey);
      else ctl.move(dr, dc, e.shiftKey);
    } else if (k === 'Enter') { e.preventDefault(); if (mod) ctl.begin(); else ctl.move(e.shiftKey ? -1 : 1, 0); }
    else if (k === 'Tab') { e.preventDefault(); ctl.move(0, e.shiftKey ? -1 : 1); }
    else if (k === 'F2') { e.preventDefault(); ctl.begin(); flushSync(); editor?.focus(); }
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); ctl.clear(); }
    else if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); ctl.move((k === 'PageDown' ? 1 : -1) * Math.floor(viewH / ROW_H), 0, e.shiftKey); }
    else if (k === 'Home') { e.preventDefault(); ctl.select(mod ? 0 : ctl.sel.fr, 0, e.shiftKey); }
    else if (mod && !e.altKey) {
      const kk = k.toLowerCase();
      if (kk === 'z') { e.preventDefault(); if (e.shiftKey) wb.undo.redo(); else wb.undo.undo(); }
      else if (kk === 'y') { e.preventDefault(); wb.undo.redo(); }
      else if (kk === 'd') { e.preventDefault(); ctl.fillFrom('down'); }
      else if (kk === 'r') { e.preventDefault(); ctl.fillFrom('right'); }
      else if (kk === 'b') { e.preventDefault(); ctl.toggle('b'); }
      else if (kk === 'i') { e.preventDefault(); ctl.toggle('i'); }
      else if (kk === 'a') { e.preventDefault(); ctl.selectAll(); }
    } else if (k.length === 1 && !e.altKey) {
      // digitar já começa a editar a célula; o foco vai na hora para o campo,
      // senão as próximas teclas (digitação rápida) cairiam na grade
      e.preventDefault();
      ctl.begin(k);
      flushSync();
      editor?.focus();
      editor?.setSelectionRange(k.length, k.length);
    }
  }

  function onCopy(e: ClipboardEvent, cut = false) {
    if (ctl.edit) return;
    e.preventDefault();
    e.clipboardData?.setData('text/plain', ctl.copy(cut));
  }
  function onPaste(e: ClipboardEvent) {
    if (ctl.edit) return;
    e.preventDefault();
    ctl.paste(e.clipboardData?.getData('text/plain') ?? '');
  }

  const editBox = $derived(ctl.edit ? box({ r0: ctl.edit.r, c0: ctl.edit.c, r1: ctl.edit.r, c1: ctl.edit.c }) : null);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="grid" bind:this={scroller} tabindex="0" role="grid" aria-label="Planilha" aria-rowcount={nRows} aria-colcount={nCols}
  onscroll={onScroll} onkeydown={onKey} oncopy={(e) => onCopy(e)} oncut={(e) => onCopy(e, true)} onpaste={onPaste}
  onpointerdown={onPointerDown} onpointermove={onPointerMove} onpointerup={onPointerUp}
  ondblclick={(e) => { const at = cellFromEvent(e); if (at && !ctl.edit) { ctl.select(at.r, at.c); ctl.begin(); } }}>
  <div class="space" style:width="{xs[nCols]! + ROWHEAD_W}px" style:height="{nRows * ROW_H + HEAD_H}px">
    <div class="cols">
      <div class="corner"></div>
      {#each { length: vis.c1 - vis.c0 + 1 } as _, i (vis.c0 + i)}
        {@const c = vis.c0 + i}
        <div class="ch" class:on={c >= rect.c0 && c <= rect.c1} style:left="{ROWHEAD_W + xs[c]!}px" style:width="{xs[c + 1]! - xs[c]!}px"
          onpointerdown={(e) => { e.stopPropagation(); }} onclick={(e) => selectCol(e, c)} role="columnheader" tabindex="-1" onkeydown={() => {}}>
          {colName(c)}
          <span class="grip" onpointerdown={(e) => startResize(e, c)} role="separator" aria-orientation="vertical"></span>
        </div>
      {/each}
    </div>
    <div class="rows" style:height="{nRows * ROW_H}px">
      {#each { length: vis.r1 - vis.r0 + 1 } as _, i (vis.r0 + i)}
        {@const r = vis.r0 + i}
        <div class="rh" class:on={r >= rect.r0 && r <= rect.r1} style:top="{r * ROW_H}px"
          onpointerdown={(e) => e.stopPropagation()} onclick={(e) => selectRow(e, r)} role="rowheader" tabindex="-1" onkeydown={() => {}}>{r + 1}</div>
      {/each}
    </div>
    <div class="body" style:left="{ROWHEAD_W}px" style:top="{HEAD_H}px">
      {#each cells as cell (cell.r * 100000 + cell.c)}
        <div class="cell {cell.cls}" title={cell.title}
          style:left="{xs[cell.c]}px" style:top="{cell.r * ROW_H}px" style:width="{xs[cell.c + 1]! - xs[cell.c]!}px">{cell.text}</div>
      {/each}
      <div class="sel" style:left="{selBox.x}px" style:top="{selBox.y}px" style:width="{selBox.w}px" style:height="{selBox.h}px">
        <div class="focus" style:left="{xs[ctl.sel.fc]! - selBox.x}px" style:top="{(ctl.sel.fr - rect.r0) * ROW_H}px"
          style:width="{xs[ctl.sel.fc + 1]! - xs[ctl.sel.fc]!}px"></div>
        {#if !ctl.edit}<span class="handle" onpointerdown={startFill} role="button" tabindex="-1" aria-label="Preencher"></span>{/if}
      </div>
      {#if fillBox}<div class="fill" style:left="{fillBox.x}px" style:top="{fillBox.y}px" style:width="{fillBox.w}px" style:height="{fillBox.h}px"></div>{/if}
      {#if ctl.edit && editBox}
        <input class="editor" bind:this={editor} value={ctl.edit.text} spellcheck="false" autocomplete="off"
          style:left="{editBox.x}px" style:top="{editBox.y}px" style:min-width="{editBox.w}px"
          style:width="{Math.max(editBox.w, ctl.edit.text.length * 8 + 16)}px"
          oninput={(e) => ctl.setText(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
          onkeyup={(e) => (ctl.caret = e.currentTarget.selectionStart ?? 0)}
          onclick={(e) => (ctl.caret = e.currentTarget.selectionStart ?? 0)}
          onkeydown={(e) => { e.stopPropagation(); ctl.onEditKey(e); }}
          oncopy={(e) => e.stopPropagation()} oncut={(e) => e.stopPropagation()} onpaste={(e) => e.stopPropagation()}
          onpointerdown={(e) => e.stopPropagation()} />
      {/if}
    </div>
  </div>
</div>

<style>
  .grid { position: relative; overflow: auto; flex: 1; min-height: 0; outline: none; background: var(--void);
    font: 13px/1 var(--f-body); user-select: none; -webkit-user-select: none; overscroll-behavior: contain; }
  .space { position: relative; }
  .cols { position: sticky; top: 0; height: 24px; z-index: 3; }
  .corner { position: sticky; left: 0; width: 46px; height: 24px; background: var(--surface); border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line); z-index: 4; }
  .ch { position: absolute; top: 0; height: 24px; display: grid; place-items: center; background: var(--surface);
    border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); font: 500 11px/1 var(--f-mono); color: var(--muted); cursor: s-resize; }
  .rows { position: sticky; left: 0; width: 46px; z-index: 2; }
  .rh { position: absolute; left: 0; width: 46px; height: 26px; display: grid; place-items: center; background: var(--surface);
    border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); font: 11px/1 var(--f-mono); color: var(--muted); cursor: e-resize; }
  .ch.on, .rh.on { color: var(--ember); background: color-mix(in srgb, var(--ember) 9%, var(--surface)); }
  .grip { position: absolute; right: -4px; top: 0; bottom: 0; width: 8px; cursor: col-resize; z-index: 1; }
  .grip:hover { background: linear-gradient(90deg, transparent 3px, var(--ember) 3px, var(--ember) 5px, transparent 5px); }

  .body { position: absolute; right: 0; bottom: 0;
    background-image: linear-gradient(to bottom, var(--line) 1px, transparent 1px);
    background-size: 100% 26px; }
  .cell { position: absolute; height: 26px; padding: 0 7px; display: flex; align-items: center; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; color: var(--ink); border-right: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
    font-variant-numeric: tabular-nums; }
  .cell.n, .cell.al-r { justify-content: flex-end; }
  .cell.b, .cell.al-c { justify-content: center; }
  .cell.al-l { justify-content: flex-start; }
  .cell.e { color: var(--crit); font-family: var(--f-mono); font-size: 12px; }
  .cell.bold { font-weight: 700; }
  .cell.it { font-style: italic; }

  .sel { position: absolute; border: 1.5px solid var(--ember); background: color-mix(in srgb, var(--ember) 7%, transparent);
    pointer-events: none; box-shadow: 0 0 14px -6px var(--ember); z-index: 1; }
  .focus { position: absolute; height: 26px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ember) 60%, transparent); }
  .handle { position: absolute; right: -5px; bottom: -5px; width: 9px; height: 9px; border-radius: 2px; background: var(--ember);
    border: 2px solid var(--void); pointer-events: auto; cursor: crosshair; }
  .fill { position: absolute; border: 1.5px dashed var(--ember-soft); pointer-events: none; z-index: 1; }
  .editor { position: absolute; height: 26px; z-index: 5; padding: 0 6px; border: 2px solid var(--ember); border-radius: 2px;
    background: var(--surface-2); color: var(--ink); font: 13px var(--f-body); outline: none;
    box-shadow: 0 8px 24px -8px var(--shadow), 0 0 18px -6px var(--ember); }
</style>
