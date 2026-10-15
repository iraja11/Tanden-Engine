<script lang="ts">
  import { engine } from '../engine.svelte';
  import { editorBridge } from '../files/editor-bridge';
  import { notes } from './notes.svelte';
  import { noteName } from './host';
  import { renderInline } from './inline';

  // Painel ao lado da nota: sumário (títulos) e conexões (backlinks, links, menções sem link).
  let { path, line }: { path: string; line: number } = $props();

  const heads = $derived.by(() => {
    const out: Array<{ level: number; text: string; n: number }> = [];
    let code = false;
    engine.content.split('\n').forEach((l, n) => {
      if (/^\s*(```|~~~)/.test(l)) code = !code;
      const h = !code && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
      if (h) out.push({ level: h[1]!.length, text: h[2]!.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').replace(/[*_`=~]/g, ''), n });
    });
    return out;
  });
  const top = $derived(Math.min(...heads.map((h) => h.level), 6));
  const current = $derived.by(() => {
    let c = -1;
    for (const h of heads) if (h.n <= line) c = h.n;
    return c;
  });

  const back = $derived.by(() => {
    notes.rev;
    return notes.backlinks(path);
  });
  const out = $derived.by(() => {
    notes.rev;
    return notes.outgoing(path);
  });
  let showUnlinked = $state(false);
  const unlinked = $derived.by(() => {
    notes.rev;
    return showUnlinked ? notes.unlinked(path) : [];
  });
  const tags = $derived([...new Set([...engine.content.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)].map((m) => m[1]!))]);

  function openAt(p: string, n: number) {
    engine.open(p);
    setTimeout(() => editorBridge.goto(n), 80);
  }
</script>

<aside class="aside">
  <div class="tabs" role="tablist">
    <button role="tab" class:on={notes.aside === 'sumario'} onclick={() => notes.setAside('sumario')}>Sumário</button>
    <button role="tab" class:on={notes.aside === 'conexoes'} onclick={() => notes.setAside('conexoes')}>Conexões{#if back.length}<i>{back.length}</i>{/if}</button>
    <button class="x" aria-label="Fechar painel" onclick={() => notes.setAside(null)}>×</button>
  </div>
  <div class="scroll">
    {#if notes.aside === 'sumario'}
      {#if heads.length}
        <nav class="toc">
          {#each heads as h (h.n)}
            <button class:cur={h.n === current} style:padding-left="{(h.level - top) * 14 + 10}px" onclick={() => editorBridge.goto(h.n)}>{h.text}</button>
          {/each}
        </nav>
      {:else}
        <p class="empty">Os títulos da nota (#, ##, ###) aparecem aqui. Digite <kbd>/</kbd> e escolha um título.</p>
      {/if}
    {:else}
      <section>
        <h4>Links para esta nota <span>{back.length}</span></h4>
        {#each back as b (b.path)}
          <div class="ref">
            <button class="name" onclick={() => engine.open(b.path)}>{noteName(b.path)}</button>
            {#each b.lines as l (l.n)}
              <button class="ctx" onclick={() => openAt(b.path, l.n)}>{@html renderInline(l.text.slice(0, 220))}</button>
            {/each}
          </div>
        {:else}
          <p class="empty">Nenhuma nota tem link para esta ainda. Use <kbd>[[</kbd> em outra nota.</p>
        {/each}
      </section>
      {#if out.length}
        <section>
          <h4>Esta nota leva a <span>{out.length}</span></h4>
          {#each out as o (o)}
            <button class="chip" onclick={() => notes.openLink(o)}>{noteName(o)}</button>
          {/each}
        </section>
      {/if}
      {#if tags.length}
        <section>
          <h4>Tags</h4>
          {#each tags as t (t)}
            <button class="chip tag" onclick={() => notes.openPalette('busca')} title="Buscar #{t}">#{t}</button>
          {/each}
        </section>
      {/if}
      <section>
        <h4>
          <button class="toggle" onclick={() => (showUnlinked = !showUnlinked)}>{showUnlinked ? '▾' : '▸'} Menções sem link</button>
        </h4>
        {#if showUnlinked}
          {#each unlinked as u (u.path)}
            <div class="ref">
              <div class="row">
                <button class="name" onclick={() => engine.open(u.path)}>{noteName(u.path)}</button>
                <button class="link" onclick={() => notes.linkMentions(u.path, path)} title="Trocar as menções por [[{noteName(path)}]]">Linkar</button>
              </div>
              {#each u.lines as l (l.n)}
                <button class="ctx" onclick={() => openAt(u.path, l.n)}>{l.text.slice(0, 200)}</button>
              {/each}
            </div>
          {:else}
            <p class="empty">Nenhuma nota cita "{noteName(path)}" sem link.</p>
          {/each}
        {/if}
      </section>
    {/if}
  </div>
</aside>

<style>
  .aside { width: 290px; flex: none; display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--line); background: var(--surface); animation: slide .2s var(--ease); }
  @keyframes slide { from { opacity: 0; transform: translateX(10px); } }
  .tabs { display: flex; align-items: center; gap: 2px; padding: 10px 10px 6px; }
  .tabs button { border: 0; background: none; padding: 5px 10px; border-radius: 8px; color: var(--muted); font: 600 11px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .tabs button.on { color: var(--ink); background: var(--surface-2); }
  .tabs i { font-style: normal; margin-left: 6px; color: var(--ember); font-family: var(--f-mono); }
  .tabs .x { margin-left: auto; font-size: 17px; text-transform: none; }
  .scroll { flex: 1; overflow-y: auto; padding: 4px 10px 30px; }
  .toc { display: grid; gap: 1px; }
  .toc button { text-align: left; border: 0; background: none; border-radius: 7px; padding: 4px 10px; color: var(--muted); font: 13px/1.4 var(--f-body);
    border-left: 2px solid transparent; }
  .toc button:hover { color: var(--ink); background: var(--surface-2); }
  .toc button.cur { color: var(--ink); border-left-color: var(--ember); }
  section { margin-bottom: 18px; }
  h4 { margin: 6px 4px 8px; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  h4 span { color: var(--ember); font-family: var(--f-mono); margin-left: 4px; }
  .ref { margin-bottom: 10px; padding: 6px; border-radius: 9px; border: 1px solid var(--line); background: var(--void); }
  .row { display: flex; align-items: center; justify-content: space-between; }
  .name { border: 0; background: none; padding: 2px 4px; font: 600 13px var(--f-body); color: var(--ember-soft); text-align: left; }
  .name:hover { text-decoration: underline; }
  .ctx { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 4px 6px; border-radius: 6px; color: var(--muted); font: 12.5px/1.45 var(--f-body);
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; }
  .ctx:hover { background: var(--surface-2); color: var(--ink); }
  .ctx :global(a) { color: var(--ember-soft); }
  .chip { border: 1px solid var(--line); background: var(--void); color: var(--ink); border-radius: 999px; padding: 3px 10px; margin: 0 4px 6px 0; font-size: 12.5px; }
  .chip:hover { border-color: var(--ember); color: var(--ember); }
  .chip.tag { color: var(--ember-soft); }
  .toggle { border: 0; background: none; padding: 0; font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; }
  .link { border: 1px solid var(--line); background: var(--surface-2); color: var(--ember); border-radius: 7px; padding: 2px 8px; font-size: 11.5px; }
  .empty { color: var(--muted); font-size: 12.5px; line-height: 1.5; padding: 0 4px; }
  kbd { font: 11px var(--f-mono); padding: 1px 5px; border: 1px solid var(--line); border-radius: 4px; }
  @media (max-width: 900px) {
    .aside { position: absolute; z-index: 8; right: 0; top: 0; bottom: 0; box-shadow: -20px 0 40px -20px var(--shadow); }
  }
</style>
