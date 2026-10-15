<script lang="ts">
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { notes } from './notes.svelte';
  import { vida } from '../vida/vida.svelte';
  import { fold, noteName } from './host';
  import { ensureBlockId, instantiate, searchVault } from '@tanden/core';
  import { bases } from '../bases/bases.svelte';
  import { showMenu } from './menu';

  // Paleta (Ctrl+K / Ctrl+P): achar nota pelo nome ou pelo conteúdo e rodar comandos.
  let { go, onclose }: { go: (view: string) => void; onclose: () => void } = $props();

  type Row = { kind: 'nota' | 'texto' | 'cmd'; label: string; hint?: string; snippet?: string; path?: string; run: () => void };

  let q = $state(notes.palette?.mode === 'comandos' ? '>' : '');
  let sel = $state(0);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();

  const cur = () => engine.active;
  const commands: Array<{ label: string; hint?: string; keys?: string; when?: () => unknown; run: () => void }> = [
    { label: 'Nova nota', hint: 'Ctrl+N', run: () => notes.create() },
    { label: 'Nota de hoje (diário)', keys: 'diario daily hoje', run: () => notes.daily(0) },
    { label: 'Nota de ontem', keys: 'diario', run: () => notes.daily(-1) },
    { label: 'Nota de amanhã', keys: 'diario', run: () => notes.daily(1) },
    { label: 'Renomear nota', when: cur, run: () => setTimeout(() => (document.querySelector('.page .title') as HTMLTextAreaElement | null)?.select()) },
    { label: 'Duplicar nota', when: cur, run: () => notes.duplicate(cur()!) },
    { label: 'Favoritar / desfavoritar', when: cur, run: () => notes.toggleFavorite(cur()!) },
    { label: 'Apagar nota', keys: 'excluir deletar lixeira', when: cur, run: () => { if (confirm(`Apagar "${noteName(cur()!)}"? Uma cópia fica na lixeira (.trash).`)) void notes.remove(cur()!); } },
    { label: 'Histórico de versões', keys: 'versao restaurar desfazer', when: cur, run: () => (notes.history = cur()) },
    { label: 'Mostrar sumário', keys: 'indice titulos outline', run: () => notes.setAside('sumario') },
    { label: 'Mostrar conexões e backlinks', keys: 'links grafo', run: () => notes.setAside('conexoes') },
    { label: 'Alternar prévia ao vivo / Markdown', hint: 'Ctrl+Shift+E', keys: 'codigo fonte source modo leitura', run: () => notes.setPreview(!notes.preview) },
    { label: 'Exportar como PDF', when: cur, run: () => void files.exportNote(cur()!, 'pdf') },
    { label: 'Exportar como Word (.docx)', when: cur, run: () => void files.exportNote(cur()!, 'docx') },
    { label: 'Exportar como página (.html)', when: cur, run: () => void files.exportNote(cur()!, 'html') },
    { label: 'Exportar como Markdown (.md)', when: cur, run: () => void files.exportNote(cur()!, 'md') },
    { label: 'Copiar link [[ ]] da nota', when: cur, run: () => void navigator.clipboard?.writeText(`[[${noteName(cur()!)}]]`) },
    { label: 'Anexar arquivo', when: cur, run: () => notes.host.pickFiles?.() },
    { label: 'Salvar página web', keys: 'recortar clipper web clip link artigo', run: () => (files.clipDialog = true) },
    { label: 'Recortador do navegador (favorito ✂)', keys: 'bookmarklet clipper web extensao', run: () => (files.clipDialog = true) },
    { label: 'Juntar destaques da nota', keys: 'highlights marcacoes realces ==', when: cur, run: () => files.gatherHighlights(cur()!) },
    { label: 'Nova tarefa', keys: 'todo tarefa capturar hoje', run: () => { go('hoje'); setTimeout(() => (document.querySelector('.hoje .quick input') as HTMLInputElement | null)?.focus(), 120); } },
    { label: 'Revisão da semana', keys: 'semanal review weekly', run: () => { vida.review(); go('notas'); } },
    { label: 'Montar sistema de vida (tarefas, projetos, hábitos, metas, diário)', keys: 'setup bancos life gtd', run: () => { vida.setup(); go('hoje'); } },
    { label: 'Buscar no cofre (painel)', hint: 'Ctrl+Shift+F', keys: 'procurar pesquisar search', run: () => notes.searchFor(q.trim().startsWith('>') ? '' : q.trim()) },
    { label: 'Explorar tags, links sem nota e notas soltas', keys: 'tags orfas cerebro', run: () => (notes.sidebar = 'tags') },
    { label: 'Abrir nota aleatória', keys: 'random sorte acaso', run: () => { const all = engine.notes.filter((p) => !p.startsWith('Modelos/')); if (all.length) engine.open(all[Math.floor(Math.random() * all.length)]!); } },
    { label: 'Inserir modelo na nota', keys: 'template', when: cur, run: () => setTimeout(() => insertTemplate()) },
    { label: 'Linkar menções desta nota em todo o cofre', keys: 'mencoes sem link backlinks', when: cur, run: () => { const p = cur()!; const u = notes.unlinked(p); for (const x of u) notes.linkMentions(x.path, p); files.say(u.length ? `Links criados em ${u.length} ${u.length === 1 ? 'nota' : 'notas'}.` : 'Nenhuma menção sem link.'); } },
    { label: 'Copiar link do trecho no cursor', keys: 'bloco block referencia', when: cur, run: () => void copyBlockLink() },
    ...[['hoje', 'Hoje'], ['notas', 'Notas'], ['bancos', 'Bancos'], ['grafo', 'Grafo'], ['ia', 'IA'], ['lembretes', 'Lembretes'], ['quadros', 'Quadros'], ['planilhas', 'Planilhas'], ['calculo', 'Cálculo'], ['slides', 'Slides'], ['mundos', 'Mundos'], ['luta', 'Luta'], ['arquivos', 'Arquivos'], ['plugins', 'Plugins']].map(([id, name]) => ({
      label: `Ir para ${name}`,
      keys: 'abrir tela modulo',
      run: () => go(id!),
    })),
  ];

  /** Menu com os modelos (Modelos/ e os prontos); o escolhido entra no cursor. */
  function insertTemplate() {
    const list = bases.templates;
    if (!list.length) return files.say('Nenhum modelo ainda. Crie notas na pasta Modelos/.');
    const at = { x: innerWidth / 2 - 130, y: innerHeight * 0.22 };
    showMenu(at, list.map((t) => ({
      label: t.name,
      icon: t.path ? '❐' : '▫',
      hint: t.target ? `banco ${t.target.replace(/^\[\[|\]\]$/g, '')}` : undefined,
      run: () => {
        const title = noteName(cur() ?? '');
        // o topo do modelo vira propriedades da nota; o corpo entra no cursor
        const text = instantiate(t.text, title);
        const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');
        const head = text.slice(0, text.length - body.length);
        if (head && cur()) {
          const p = cur()!;
          const merged = bases.mergeProps(engine.vault.read(p), head);
          if (merged !== engine.vault.read(p)) engine.writeNote(p, merged);
        }
        setTimeout(() => editorBridge.insert(body.replace(new RegExp(`^# ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n+`), '')), 30);
      },
    })), { title: 'Inserir modelo' });
  }

  /** Copia [[Nota#^id]] da linha do cursor (cria o ^id se faltar). */
  async function copyBlockLink() {
    const p = cur();
    if (!p) return;
    const line = editorBridge.line?.() ?? -1;
    if (line < 0) return;
    const text = engine.vault.read(p);
    const r = ensureBlockId(text, line);
    if (!r.id) return;
    if (r.text !== text) engine.writeNote(p, r.text);
    const link = `[[${noteName(p)}#^${r.id}]]`;
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    files.say(`Copiado: ${link}`);
  }

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
    for (const c of commands) {
      if (c.when && !c.when()) continue;
      const hay = fold(`${c.label} ${c.keys ?? ''}`);
      if (words.length && !words.every((w) => hay.includes(w))) continue;
      if (!words.length && !onlyCmd && out.length > 10) continue;
      out.push({ kind: 'cmd', label: c.label, hint: c.hint, run: c.run });
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
    if (r.kind !== 'cmd' && r.label) go('notas');
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

  const SECTION: Record<Row['kind'], string> = { nota: 'Notas', texto: 'No texto', cmd: 'Comandos' };
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
          <span class="ic">{r.kind === 'cmd' ? '›' : r.kind === 'texto' ? '¶' : '▤'}</span>
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
