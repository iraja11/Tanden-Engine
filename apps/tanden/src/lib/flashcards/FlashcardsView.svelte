<script lang="ts">
  import { intervalLabel, type Grade } from '@tanden/core';
  import { untrack } from 'svelte';
  import { notes } from '../editor/notes.svelte';
  import { engine } from '../engine.svelte';
  import { rise, pop } from '../motion';
  import { flashcards } from './flashcards.svelte';

  // Flashcards: baralhos tirados das notas com #flashcards e a sessão de estudo.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const decks = $derived(flashcards.decks);
  const totals = $derived(decks.reduce((a, d) => ({ total: a.total + d.total, fresh: a.fresh + d.fresh, due: a.due + d.due, mature: a.mature + d.mature }), { total: 0, fresh: 0, due: 0, mature: 0 }));
  const pendingAll = $derived(flashcards.pending());
  const week = $derived(flashcards.forecast());
  const weekMax = $derived(Math.max(1, ...week));
  const s = $derived(flashcards.session);
  const cur = $derived(flashcards.current);
  const side = $derived(cur ? cur.card.sides[cur.side]! : null);
  const previews = $derived(cur ? flashcards.preview(cur) : []);
  const name = (p: string) => p.split('/').pop()!.replace(/\.md$/, '');
  const dayName = (i: number) => (i === 0 ? 'hoje' : i === 1 ? 'amanhã' : new Date(Date.now() + i * 86_400_000).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''));

  const GRADES: Array<{ g: Grade; label: string; key: string; cls: string }> = [
    { g: 0, label: 'Errei', key: '1', cls: 'again' },
    { g: 1, label: 'Difícil', key: '2', cls: 'hard' },
    { g: 2, label: 'Bom', key: '3', cls: 'good' },
    { g: 3, label: 'Fácil', key: '4', cls: 'easy' },
  ];

  // ------------------------------------------------------------ novo cartão
  let target = $state('');
  let newName = $state('');
  let front = $state('');
  let back = $state('');
  let reversed = $state(false);
  let frontEl = $state<HTMLTextAreaElement>();
  const targets = $derived(flashcards.notesWithCards);

  // ao abrir o formulário: a nota aberta (se tiver cartões) ou a primeira com cartões
  $effect(() => {
    if (!flashcards.adding) return;
    untrack(() => {
      if (!targets.includes(target) && !newName) target = (engine.active && targets.includes(engine.active) ? engine.active : targets[0]) ?? '';
      setTimeout(() => frontEl?.focus(), 60);
    });
  });

  function addCard(e?: Event) {
    e?.preventDefault();
    const where = target === '' ? newName.trim() : target;
    if (!where) {
      newName = newName || 'Meus cartões';
      return;
    }
    const path = flashcards.add(where, front, back, reversed);
    if (!path) return;
    target = path;
    newName = '';
    front = '';
    back = '';
    frontEl?.focus();
  }

  function render(md: string): string {
    return notes.host.render?.(md) ?? md;
  }

  function onCardClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a[data-href]');
    if (!a) return;
    e.preventDefault();
    notes.host.open(a.getAttribute('data-href') ?? '');
  }

  function onKey(e: KeyboardEvent) {
    if (!flashcards.session) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        flashcards.undo();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      flashcards.stop();
    } else if (!flashcards.shown && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      flashcards.reveal();
    } else if (flashcards.shown && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      flashcards.answer(2);
    } else if (flashcards.shown && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      flashcards.answer((Number(e.key) - 1) as Grade);
    } else if (e.key.toLowerCase() === 'u') {
      flashcards.undo();
    }
  }

  function addKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addCard(e);
  }

  const depth = (deck: string) => deck.split('/').length - 1;
</script>

<svelte:window onkeydown={onKey} />

<section class="fc">
  {#if s}
    <!-- sessão de estudo -->
    <header class="top">
      <button class="ghost" onclick={() => flashcards.stop()} title="Sair (Esc)">← Baralhos</button>
      <span class="where">{s.path ? name(s.path) : s.deck ?? 'Todos os baralhos'}</span>
      <span class="count"><b>{s.queue.length}</b> {s.queue.length === 1 ? 'restante' : 'restantes'}</span>
    </header>
    <div class="bar" aria-hidden="true"><i style:width="{s.total ? Math.min(100, (s.done / s.total) * 100) : 100}%"></i></div>

    {#if cur && side}
      {#key `${cur.group}:${cur.side}:${s.done}:${s.wrong}:${s.answers.length}`}
        <article class="card" in:rise={{ y: 14 }}>
          <p class="ctx">
            <button class="link" onclick={() => onOpenNote(cur.card.path)} title="Abrir a nota">{name(cur.card.path)}</button>
            {#each cur.card.context as h, i (i)}<span> › {h}</span>{/each}
            {#if !flashcards.schedOf(cur)}<em class="tag new">novo</em>{/if}
            {#if cur.card.sides.length > 1}<em class="tag">{cur.card.kind === 'lacuna' ? `lacuna ${cur.side + 1}/${cur.card.sides.length}` : cur.side ? 'invertido' : 'frente'}</em>{/if}
          </p>
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <div class="md front" role="presentation" onclick={onCardClick}>{@html render(flashcards.shown && cur.card.kind === 'lacuna' ? side.back : side.front)}</div>
          {#if flashcards.shown}
            {#if cur.card.kind !== 'lacuna'}
              <hr />
              <div class="md back" role="presentation" in:rise={{ y: 6 }} onclick={onCardClick}>{@html render(side.back)}</div>
            {/if}
          {/if}
        </article>
      {/key}

      <footer class="answer">
        {#if !flashcards.shown}
          <button class="pri reveal" onclick={() => flashcards.reveal()}>Mostrar resposta <kbd>espaço</kbd></button>
        {:else}
          <div class="grades" in:pop>
            {#each GRADES as g (g.g)}
              <button class={g.cls} onclick={() => flashcards.answer(g.g)}>
                <span>{g.label}</span>
                <small>{g.g === 0 ? 'de novo' : intervalLabel(previews[g.g]?.interval ?? 1)}</small>
                <kbd>{g.key}</kbd>
              </button>
            {/each}
          </div>
        {/if}
        <div class="aux">
          <button class="ghost" disabled={!s.answers.length} onclick={() => flashcards.undo()} title="Desfazer a última resposta (Ctrl+Z)">↶ Desfazer</button>
          <button class="ghost" onclick={() => onOpenNote(cur.card.path)}>✎ Editar na nota</button>
        </div>
      </footer>
    {:else}
      <div class="done" in:rise>
        <p class="big">✓</p>
        <h3>Sessão concluída</h3>
        <p>{s.done} {s.done === 1 ? 'cartão revisado' : 'cartões revisados'}{#if s.wrong}, {s.wrong} {s.wrong === 1 ? 'erro' : 'erros'} revisto{s.wrong === 1 ? '' : 's'} na hora{/if}.</p>
        <div class="aux">
          <button class="ghost" disabled={!s.answers.length} onclick={() => flashcards.undo()}>↶ Desfazer a última</button>
          <button class="pri" onclick={() => flashcards.stop()}>Voltar aos baralhos</button>
        </div>
      </div>
    {/if}
  {:else}
    <!-- baralhos -->
    <header class="head">
      <div>
        <h2>Flashcards</h2>
        <p class="sub">{totals.total} {totals.total === 1 ? 'cartão' : 'cartões'} em {decks.length} {decks.length === 1 ? 'baralho' : 'baralhos'} · {totals.mature} bem aprendidos</p>
      </div>
      <div class="acts">
        <button class="ghost" onclick={() => (flashcards.adding = !flashcards.adding)}>+ Novo cartão</button>
        <button class="pri" disabled={!pendingAll} onclick={() => flashcards.start()}>Estudar {pendingAll ? `(${pendingAll})` : ''}</button>
      </div>
    </header>

    {#if flashcards.adding}
      <form class="add" onsubmit={addCard} onkeydown={addKey} in:pop>
        <div class="row">
          <label>Guardar em
            <select bind:value={target}>
              {#each targets as t (t)}<option value={t}>{name(t)}</option>{/each}
              <option value="">Nova nota…</option>
            </select>
          </label>
          {#if target === ''}
            <input placeholder="Nome da nota (vai para Flashcards/)" bind:value={newName} aria-label="Nome da nota nova" />
          {/if}
        </div>
        <textarea bind:this={frontEl} bind:value={front} rows="2" placeholder="Frente (pergunta)" aria-label="Frente"></textarea>
        <textarea bind:value={back} rows="2" placeholder="Verso (resposta)" aria-label="Verso"></textarea>
        <div class="row">
          <label class="check"><input type="checkbox" bind:checked={reversed} /> Estudar também ao contrário</label>
          <span class="grow"></span>
          <button type="button" class="ghost" onclick={() => (flashcards.adding = false)}>Fechar</button>
          <button class="pri" disabled={!front.trim() || !back.trim() || (target === '' && !newName.trim())}>Adicionar <kbd>Ctrl+Enter</kbd></button>
        </div>
      </form>
    {/if}

    {#if !decks.length}
      <div class="empty" in:rise>
        <h3>Nenhum cartão ainda</h3>
        <p>Os cartões ficam nas suas notas. Ponha a tag <code>#flashcards</code> numa nota e escreva:</p>
        <pre><code>Capital do Japão::Tóquio
Cachorro:::Dog            (estuda nos dois sentidos)

Pergunta de várias linhas
?
Resposta

A mitocôndria produz ==ATP==.   (lacuna)</code></pre>
        <p>É o formato do plugin Spaced Repetition, então o Obsidian lê os mesmos cartões e o mesmo agendamento.</p>
        <div class="acts">
          <button class="pri" onclick={() => onOpenNote(flashcards.example())}>Abrir nota de exemplo</button>
          {#if engine.active}<button class="ghost" onclick={() => flashcards.markNote(engine.active!)}>Usar a nota aberta ({name(engine.active)})</button>{/if}
        </div>
      </div>
    {:else}
      <div class="grid">
        <section class="panel">
          <h3>Baralhos</h3>
          <ul class="decks">
            {#each decks as d (d.deck)}
              {@const n = flashcards.pending(d.deck)}
              <li style:--depth={depth(d.deck)}>
                <div class="dname">
                  <b>{d.deck.split('/').pop()}</b>
                  {#if depth(d.deck)}<small>{d.deck.split('/').slice(0, -1).join(' › ')}</small>{/if}
                  <small class="notes">
                    {#each d.notes.slice(0, 3) as p (p)}<button class="link" onclick={() => onOpenNote(p)}>{name(p)}</button>{/each}
                    {#if d.notes.length > 3}<span>+{d.notes.length - 3}</span>{/if}
                  </small>
                </div>
                <span class="nums">
                  <span class="due" title="Para revisar">{d.due}</span>
                  <span class="fresh" title="Novos">{d.fresh}</span>
                  <span class="tot" title="Total">{d.total}</span>
                </span>
                <button class="study" disabled={!n} onclick={() => flashcards.start(d.deck)}>{n ? `Estudar ${n}` : 'Em dia'}</button>
              </li>
            {/each}
          </ul>
          <p class="legend"><span class="due">■</span> para revisar <span class="fresh">■</span> novos <span class="tot">■</span> total</p>
        </section>

        <section class="panel">
          <h3>Próximos 7 dias</h3>
          <div class="week">
            {#each week as n, i (i)}
              <div class="day" title="{n} {n === 1 ? 'revisão' : 'revisões'}">
                <span class="n">{n || ''}</span>
                <i style:height="{(n / weekMax) * 100}%" class:today={i === 0}></i>
                <small>{dayName(i)}</small>
              </div>
            {/each}
          </div>
          <label class="limit">Novos por dia
            <input type="number" min="0" max="999" value={flashcards.prefs.newLimit} onchange={(e) => flashcards.setNewLimit(Number((e.currentTarget as HTMLInputElement).value))} />
          </label>
          <p class="hint">Faltam {flashcards.newLeft} novos hoje neste aparelho. Atalhos no estudo: espaço mostra, 1 a 4 respondem, Ctrl+Z desfaz.</p>
          {#if engine.active && !targets.includes(engine.active)}
            <button class="ghost wide" onclick={() => flashcards.markNote(engine.active!)}>Pôr #flashcards em "{name(engine.active)}"</button>
          {/if}
        </section>
      </div>
    {/if}
  {/if}
</section>

<style>
  .fc { flex: 1; min-height: 0; overflow-y: auto; padding: 24px clamp(16px, 4vw, 48px) 40px; display: flex; flex-direction: column; gap: 16px; }
  h2 { margin: 0; font: 600 22px/1.2 var(--f-display); letter-spacing: .04em; }
  h3 { margin: 0 0 10px; font: 600 11px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .sub, .hint, .legend { margin: 4px 0 0; color: var(--muted); font-size: 12.5px; }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; }
  .pri { border: 0; border-radius: 10px; padding: 8px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; transition: transform var(--dur) var(--spring), opacity var(--dur); }
  .pri:hover:not(:disabled) { transform: translateY(-1px); }
  .pri:disabled { opacity: .45; cursor: default; }
  .ghost { border: 1px solid var(--line); border-radius: 10px; padding: 7px 12px; background: var(--surface-2); color: var(--ink); }
  .ghost:hover:not(:disabled) { border-color: var(--ember); color: var(--ember); }
  .ghost:disabled { opacity: .45; cursor: default; }
  .wide { width: 100%; margin-top: 10px; }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); text-decoration: underline dotted; cursor: pointer; }
  kbd { margin-left: 6px; padding: 1px 5px; border-radius: 5px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); font: 10px var(--f-mono); opacity: .75; }

  .grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 16px; align-items: start; }
  .panel { padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); min-width: 0; }
  .decks { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .decks li { display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px calc(8px + var(--depth) * 16px); border-radius: 10px; }
  .decks li:hover { background: var(--surface-2); }
  .dname { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .dname b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dname small { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .notes { display: flex; gap: 8px; }
  .nums { display: flex; gap: 10px; font: 12.5px var(--f-mono); }
  .nums span { min-width: 22px; text-align: right; }
  .due { color: var(--ember); }
  .fresh { color: var(--ok); }
  .tot { color: var(--muted); }
  .study { min-width: 92px; border: 1px solid var(--line); border-radius: 9px; padding: 5px 10px; background: var(--surface-2); color: var(--ink); font-size: 12.5px; }
  .study:not(:disabled):hover { border-color: var(--ember); color: var(--ember); }
  .study:disabled { color: var(--muted); }

  .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 120px; align-items: end; }
  .day { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
  .day i { width: 100%; max-width: 26px; min-height: 2px; border-radius: 5px 5px 2px 2px; background: color-mix(in srgb, var(--ember) 45%, var(--surface-2)); transition: height var(--dur-slow) var(--spring); }
  .day i.today { background: var(--ember); box-shadow: 0 0 14px -4px var(--ember-glow); }
  .day .n { font: 11px var(--f-mono); color: var(--muted); }
  .day small { font-size: 10.5px; color: var(--muted); white-space: nowrap; }
  .limit { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; font-size: 13px; }
  .limit input { width: 70px; }
  input, select, textarea { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 6px 9px; font: 13.5px var(--f-body); outline: none; }
  input:focus, select:focus, textarea:focus { border-color: var(--ember); }

  .add { display: grid; gap: 8px; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--ember); box-shadow: 0 0 24px -14px var(--ember); }
  .add .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .add label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .add textarea { resize: vertical; min-height: 44px; }
  .check { cursor: pointer; }
  .grow { flex: 1; }

  .empty { max-width: 620px; padding: 20px; border-radius: 14px; background: var(--surface); border: 1px dashed var(--line); }
  .empty p { color: var(--muted); }
  .empty pre { padding: 12px; border-radius: 10px; background: var(--void); border: 1px solid var(--line); font: 12.5px/1.6 var(--f-mono); overflow-x: auto; }

  /* estudo */
  .top { display: flex; align-items: center; gap: 12px; }
  .where { font: 600 13px var(--f-display); letter-spacing: .06em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { margin-left: auto; color: var(--muted); font-size: 12.5px; white-space: nowrap; }
  .count b { color: var(--ember); font-family: var(--f-mono); }
  .bar { height: 3px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--ember); box-shadow: 0 0 10px var(--ember-glow); transition: width var(--dur-slow) var(--ease); }
  .card { align-self: center; width: min(720px, 100%); min-height: 220px; margin-top: 8px; padding: 22px 26px; border-radius: 18px;
    background: var(--surface); border: 1px solid var(--line); box-shadow: 0 24px 50px -30px var(--shadow, #000); }
  .ctx { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; margin: 0 0 14px; font-size: 12px; color: var(--muted); }
  .tag { margin-left: 8px; padding: 1px 7px; border-radius: 8px; border: 1px solid var(--line); font: 10.5px var(--f-mono); font-style: normal; }
  .tag.new { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
  .md { font-size: 17px; line-height: 1.55; overflow-wrap: anywhere; }
  .md.front { font-size: 19px; }
  .md :global(p) { margin: 0 0 .6em; }
  .md :global(p:last-child) { margin-bottom: 0; }
  .md :global(mark) { background: color-mix(in srgb, var(--ember) 28%, transparent); color: inherit; border-radius: 4px; padding: 0 3px; }
  .md :global(pre) { padding: 10px; border-radius: 8px; background: var(--void); overflow-x: auto; font-size: 13px; }
  .md :global(img) { max-width: 100%; }
  .md :global(a) { color: var(--ember-soft); cursor: pointer; }
  hr { border: 0; border-top: 1px dashed var(--line); margin: 18px 0; }
  .answer { align-self: center; width: min(720px, 100%); display: grid; gap: 10px; }
  .reveal { padding: 12px; font-size: 15px; }
  .grades { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .grades button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 12px; border: 1px solid var(--line);
    background: var(--surface-2); color: var(--ink); transition: transform var(--dur) var(--spring), border-color var(--dur); }
  .grades button:hover { transform: translateY(-2px); border-color: var(--c); }
  .grades button span { font-weight: 600; color: var(--c); }
  .grades button small { font: 11.5px var(--f-mono); color: var(--muted); }
  .grades kbd { margin: 2px 0 0; }
  .again { --c: var(--crit); }
  .hard { --c: #d9a441; }
  .good { --c: var(--ok); }
  .easy { --c: var(--ember); }
  .aux { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .done { align-self: center; text-align: center; margin-top: 40px; }
  .done .big { margin: 0; font-size: 46px; color: var(--ok); }
  .done p { color: var(--muted); }

  @media (max-width: 720px) {
    .fc { padding: 16px 16px 32px; }
    .grid { grid-template-columns: 1fr; }
    .card { padding: 18px; }
    .md.front { font-size: 17px; }
    .grades { gap: 6px; }
    .grades kbd, .reveal kbd { display: none; }
    .nums .tot { display: none; }
  }
</style>
