<script lang="ts">
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { notes } from './notes.svelte';
  import { fold, noteName } from './host';
  import { searchVault } from '@tanden/core';
  import { commands } from '../commands.svelte';
  import { quadros, boardTitle } from '../quadro/quadros.svelte';

  // Paleta (Ctrl+K / Ctrl+P): achar nota pelo nome ou pelo conteúdo e rodar comandos.
  let { go, onclose }: { go: (view: string) => void; onclose: () => void } = $props();

  type Row = { kind: 'nota' | 'quadro' | 'texto' | 'cmd'; label: string; hint?: string; snippet?: string; path?: string; run: () => void };

  let q = $state(notes.palette?.mode === 'comandos' ? '>' : '');
  let sel = $state(0);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();


  const rows = $derived.by((): Row[] => {
    const raw = q.trim();
    const onlyCmd = raw.startsWith('>');
    const query = fold(onlyCmd ? raw.slice(1).trim() : raw);
    const words = query.split(/\s+/).filter(Boolean);
    const out: Row[] = [];
    if (!onlyCmd) {
      const scored: Array<{ p: string; s: number }> = [];
      if (!words.length) {
        const recent = notes.recent.filter((p) => engine.notes.includes(p));
        const fav = notes.favorites.filter((p) => engine.notes.includes(p) && !recent.slice(0, 8).includes(p));
        for (const p of [...recent.slice(0, 8), ...fav]) out.push({ kind: 'nota', label: noteName(p), hint: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : notes.favorites.includes(p) ? '★' : 'recente', run: () => engine.open(p) });
      } else {
        for (const p of engine.notes) {
          const name = fold(noteName(p));
          const full = fold(p);
          let s = 0;
          if (name === query) s = 100;
          else if (name.startsWith(query)) s = 80;
          else if (name.includes(query)) s = 60;
          else if (words.every((w) => full.includes(w))) s = 40;
          else {
            // letras na ordem (busca difusa)
            let i = 0;
            for (const ch of name) if (ch === query[i]) i++;
            if (i === query.length && query.length > 2) s = 15;
          }
          if (s) scored.push({ p, s: s - p.length / 200 });
        }
        scored.sort((a, b) => b.s - a.s);
        for (const { p } of scored.slice(0, 12)) out.push({ kind: 'nota', label: noteName(p), hint: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '', path: p, run: () => engine.open(p) });
        // apelidos
        for (const a of notes.brain.allAliases()) {
          if (out.length > 16 || !words.every((w) => fold(a.alias).includes(w)) || out.some((r) => r.path === a.path)) continue;
          out.push({ kind: 'nota', label: noteName(a.path), hint: `apelido: ${a.alias}`, path: a.path, run: () => engine.open(a.path) });
        }
        // quadros (.canvas) pelo nome
        for (const b of engine.boardList.filter((b) => words.every((w) => fold(b).includes(w))).slice(0, 6))
          out.push({ kind: 'quadro', label: boardTitle(b), hint: b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : '', run: () => quadros.open(b) });
        // dentro das notas (aceita os operadores da busca: #tag, pasta:, "frase"...)
        if (raw.length >= 3 || /[:#["]/.test(raw)) {
          const named = new Set(out.map((r) => r.path));
          for (const h of searchVault(notes.brain, raw, { limit: 40 })) {
            if (named.has(h.path) && !h.lines.length) continue;
            const l = h.lines[0];
            out.push({ kind: 'texto', label: noteName(h.path), snippet: l ? l.text.replace(/\s\^[A-Za-z0-9-]+\s*$/, '').slice(0, 160) : h.path, run: () => { engine.open(h.path); if (l) setTimeout(() => editorBridge.goto(l.n), 90); } });
            if (out.filter((r) => r.kind === 'texto').length >= 25) break;
          }
        }
        if (!/[:#[\]"/]/.test(raw)) out.push({ kind: 'cmd', label: `Criar nota "${raw}"`, hint: 'Ctrl+Enter', run: () => notes.create('', raw) });
      }
    }
    for (const c of commands.list) {
      if (c.when && !c.when()) continue;
      const hay = fold(`${c.label} ${c.keys ?? ''}`);
      if (words.length && !words.every((w) => hay.includes(w))) continue;
      if (!words.length && !onlyCmd && out.length > 10) continue;
      out.push({ kind: 'cmd', label: c.label, hint: commands.hotkeysOf(c.id)[0], run: c.run });
    }
    return out;
  });

  $effect(() => {
    q;
    sel = 0;
  });
  $effect(() => {
    list?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  });
  $effect(() => {
    input?.focus();
  });

  function pick(r: Row | undefined) {
    if (!r) return;
    onclose();
    if (r.kind !== 'cmd' && r.kind !== 'quadro' && r.label) go('notas');
    r.run();
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(rows.length - 1, sel + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(0, sel - 1);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && q.trim() && !q.startsWith('>')) {
      e.preventDefault();
      onclose();
      go('notas');
      notes.create('', q.trim());
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(rows[sel]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  const SECTION: Record<Row['kind'], string> = { nota: 'Notas', quadro: 'Quadros', texto: 'No texto', cmd: 'Comandos' };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const mark = (s: string) => {
    const words = fold(q.replace(/^>/, '')).split(/\s+/).filter((w) => w.length > 1);
    let h = esc(s);
    for (const w of words) {
      const i = fold(h).indexOf(w);
      if (i >= 0) h = `${h.slice(0, i)}<mark>${h.slice(i, i + w.length)}</mark>${h.slice(i + w.length)}`;
    }
    return h;
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="box" role="dialog" aria-label="Buscar e comandos">
    <input bind:this={input} bind:value={q} onkeydown={key} placeholder="Buscar notas e texto… (> para comandos)" spellcheck="false" />
    <div class="list" bind:this={list}>
      {#each rows as r, i (i)}
        {#if i === 0 || rows[i - 1]!.kind !== r.kind}<div class="sec">{SECTION[r.kind]}</div>{/if}
        <button class:on={i === sel} onmousemove={() => (sel = i)} onclick={() => pick(r)}>
          <span class="ic">{r.kind === 'cmd' ? '›' : r.kind === 'texto' ? '¶' : r.kind === 'quadro' ? '▦' : '▤'}</span>
          <span class="txt">
            <span class="lb">{@html mark(r.label)}</span>
            {#if r.snippet}<span class="sn">{@html mark(r.snippet)}</span>{/if}
          </span>
          {#if r.hint}<span class="ht">{r.hint}</span>{/if}
        </button>
      {:else}
        <p class="empty">Nada encontrado.</p>
      {/each}
    </div>
    <footer><span><kbd>↑↓</kbd> escolher</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl+Enter</kbd> criar nota</span><span><kbd>&gt;</kbd> comandos</span></footer>
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 85; display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; background: var(--scrim);
    backdrop-filter: blur(3px); animation: fade .12s; }
  @keyframes fade { from { opacity: 0; } }
  .box { width: min(640px, 94vw); max-height: 70vh; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
    box-shadow: 0 40px 80px -30px var(--shadow), 0 0 0 1px var(--ember-glow); overflow: hidden; animation: pop .16s var(--ease); }
  @keyframes pop { from { transform: translateY(-8px) scale(.98); opacity: 0; } }
  input { border: 0; outline: none; background: none; padding: 16px 18px; font: 17px var(--f-body); color: var(--ink); border-bottom: 1px solid var(--line); }
  .list { overflow-y: auto; padding: 6px; }
  .sec { padding: 8px 10px 4px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  button { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; border: 0; background: none; padding: 7px 10px; border-radius: 9px; color: var(--ink); }
  button.on { background: color-mix(in srgb, var(--ember) 13%, transparent); }
  .ic { width: 22px; text-align: center; color: var(--muted); }
  .txt { flex: 1; min-width: 0; display: grid; }
  .lb { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sn { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ht { font: 11px var(--f-mono); color: var(--muted); max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.box mark) { background: none; color: var(--ember); font-weight: 600; }
  .empty { padding: 18px; color: var(--muted); }
  footer { display: flex; gap: 14px; padding: 8px 14px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--muted); flex-wrap: wrap; }
  kbd { font: 10.5px var(--f-mono); padding: 1px 5px; border: 1px solid var(--line); border-radius: 4px; }
  @media (max-width: 720px) { .scrim { padding-top: 6vh; } footer { display: none; } }
</style>
