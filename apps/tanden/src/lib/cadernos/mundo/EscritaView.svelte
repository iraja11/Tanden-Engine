<script lang="ts">
  import {
    BEAT_SHEETS, SCENE_STATUS, bodyOf, castGrid, countWords, entityFolder, manuscript, sceneTemplate, scenePrompts, scenesByBeat, seededRng, setProp, setProps,
    storyIndex, storyTemplate, suggestBeat, unusedInStory, withBody,
    type Entity, type Scene, type SceneStatus, type Story, type World,
  } from '@tanden/core';
  import Editor from '../../Editor.svelte';
  import type { EditorHost } from '../../editor';
  import { notes } from '../../editor/notes.svelte';
  import { rise } from '../../motion';
  import { sound } from '../../sound.svelte';
  import { cadernos } from '../cadernos.svelte';
  import { typeColor } from '../tipos';

  // Escrita: histórias com estrutura (três atos, jornada...), cenas num quadro
  // por batida, editor de cena com objetivo/conflito/desfecho, quem aparece
  // onde, ideias de cena com as fichas do mundo e o manuscrito montado.
  let { world, byPath, onopen, onOpenNote, focus = null }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    onOpenNote: (path: string) => void;
    /** história ou cena para abrir ao chegar */
    focus?: string | null;
  } = $props();

  const stories = $derived(storyIndex(world));
  let storyPath = $state<string | null>(null);
  const story = $derived(stories.find((s) => s.path === storyPath) ?? stories[0] ?? null);
  let look = $state<'quadro' | 'elenco' | 'manuscrito'>('quadro');
  let scenePath = $state<string | null>(null);
  const scene = $derived(story?.scenes.find((s) => s.path === scenePath) ?? null);
  $effect(() => {
    if (!focus) return;
    const st = stories.find((x) => x.path === focus || x.scenes.some((c) => c.path === focus));
    if (st) { storyPath = st.path; scenePath = st.path === focus ? null : focus; }
  });
  $effect(() => { if (scenePath && story && !story.scenes.some((s) => s.path === scenePath)) scenePath = null; });

  // ------------------------------------------------ nova história
  let creating = $state(false);
  let nName = $state('');
  let nSheet = $state('tres-atos');
  let nGenre = $state('');
  let nGoal = $state(80000);
  let nPremise = $state('');
  function createStory() {
    const name = nName.trim();
    if (!name) return;
    const path = cadernos.create(entityFolder(world, 'historia'), name, (n) => storyTemplate(n, world.name, { estrutura: nSheet, genero: nGenre.trim(), meta: nGoal, premissa: nPremise.trim() }));
    storyPath = path;
    creating = false;
    nName = nPremise = nGenre = '';
    sound.play('complete');
  }

  // ------------------------------------------------ cenas
  function newScene(s: Story, opts: { beat?: string; pov?: string | null; local?: string | null; text?: string; name?: string } = {}) {
    const order = (s.scenes.length ? Math.max(...s.scenes.map((x) => (x.order === 9999 ? 0 : x.order))) : 0) + 1;
    const beat = opts.beat ?? (s.sheet ? suggestBeat(s.sheet, s.scenes.length, Math.max(s.scenes.length + 1, s.sheet.beats.length)).nome : undefined);
    const name = opts.name ?? `Cena ${s.scenes.length + 1}`;
    const path = cadernos.create(s.folder, name, (n) => sceneTemplate(n, world.name, s.name, order, { beat, pov: opts.pov ?? undefined, local: opts.local ?? undefined }) + (opts.text ? `${opts.text}\n` : ''));
    scenePath = path;
    sound.play('tick');
  }
  function move(s: Story, sc: Scene, dir: -1 | 1) {
    const list = [...s.scenes];
    const i = list.findIndex((x) => x.path === sc.path);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    list.forEach((x, k) => { if (x.order !== k + 1) cadernos.update(x.path, (t) => setProp(t, 'ordem', String(k + 1))); });
  }
  const put = (path: string, k: string, v: string) => cadernos.update(path, (t) => setProp(t, k, v));
  const link = (name: string) => (name ? `[[${name}]]` : '');
  const nameOf = (p: string | null) => (p ? byPath.get(p)?.name ?? '' : '');

  // texto da cena aberta
  const sText = $derived.by(() => { void cadernos.rev; return scene ? cadernos.read(scene.path) : ''; });
  let sBody = $derived(bodyOf(sText));
  const liveWords = $derived(countWords(sBody));
  function typed(b: string) {
    if (!scene) return;
    sBody = b;
    cadernos.typed(scene.path, withBody(cadernos.read(scene.path), b));
  }
  const host: EditorHost = {
    ...notes.host,
    current: () => scenePath,
    open: (raw) => {
      const target = raw.split('|')[0]!.split('#')[0]!.trim();
      const to = target ? notes.host.resolve?.(target) ?? null : null;
      if (to && byPath.has(to)) onopen(to);
      else notes.host.open(raw);
    },
  };

  const people = $derived(world.entities.filter((e) => e.type === 'personagem' || e.type === 'criatura' || e.type === 'divindade'));
  const places = $derived(world.entities.filter((e) => e.type === 'lugar'));

  // ------------------------------------------------ números
  const STATUS_C: Record<SceneStatus, string> = { ideia: 'var(--muted)', rascunho: 'var(--ember)', 'revisão': '#5b9bd5', pronta: 'var(--ok)' };
  const byStatus = (s: Story) => SCENE_STATUS.map((st) => ({ st, n: s.scenes.filter((x) => x.status === st).length }));
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  // ideias de cena
  let seed = $state(Math.floor(Math.random() * 1e6));
  const prompts = $derived(scenePrompts(world, seededRng(seed), 5));
  const plain = (t: string) => t.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');
  const titleOf = (t: string) => plain(t).split(/[,.:]/)[0]!.split(' ').slice(0, 6).join(' ');

  // manuscrito
  const ms = $derived.by(() => { void cadernos.rev; return story ? manuscript(story, (p) => cadernos.read(p)) : ''; });
  function exportMs() {
    if (!story) return;
    const path = cadernos.create(story.folder, `${story.name} (manuscrito)`, () => ms);
    cadernos.say('Manuscrito salvo como nota.');
    onOpenNote(path);
  }
  const msBlocks = $derived(ms.split('\n'));

  function setStatus(sc: Scene, st: SceneStatus) {
    cadernos.update(sc.path, (t) => setProps(t, { status: st }));
    if (st === 'pronta') sound.play('complete');
  }
</script>

<div class="esc">
  <!-- histórias -->
  <div class="stories">
    {#each stories as s (s.path)}
      <button class="st" class:on={story?.path === s.path} onclick={() => { storyPath = s.path; scenePath = null; }} style:--c={typeColor('historia')}>
        <b>{s.name}</b>
        <small>{s.scenes.length} {s.scenes.length === 1 ? 'cena' : 'cenas'} · {fmt(s.words)} palavras</small>
      </button>
    {/each}
    <button class="st new" onclick={() => (creating = !creating)}><b>+ Nova história</b><small>romance, conto, campanha</small></button>
  </div>

  {#if creating || !stories.length}
    <form class="newstory t-card" onsubmit={(e) => { e.preventDefault(); createStory(); }} in:rise={{ y: -6 }}>
      <h3>{stories.length ? 'Nova história' : 'Comece uma história'}</h3>
      {#if !stories.length}<p class="dim small">Uma história junta cenas em ordem, cada uma numa nota. Escolha uma estrutura para ter as batidas como guia (dá para mudar depois).</p>{/if}
      <div class="row2">
        <label><span class="t-eyebrow">Título</span><input class="t-input" bind:value={nName} placeholder="A Queda de Porto Sal" /></label>
        <label><span class="t-eyebrow">Gênero</span><input class="t-input" bind:value={nGenre} placeholder="fantasia sombria" /></label>
        <label><span class="t-eyebrow">Meta de palavras</span><input class="t-input" type="number" min="0" step="1000" bind:value={nGoal} /></label>
      </div>
      <label><span class="t-eyebrow">Premissa (uma frase)</span><input class="t-input" bind:value={nPremise} placeholder="E se o último mapa do mundo estivesse errado de propósito?" /></label>
      <span class="t-eyebrow">Estrutura</span>
      <div class="sheets">
        {#each BEAT_SHEETS as b (b.id)}
          <button type="button" class="sheet" class:on={nSheet === b.id} onclick={() => (nSheet = b.id)}>
            <b>{b.label}</b><small>{b.desc}</small>
            <span class="beats">{#each b.beats as bt (bt.id)}<i style:left="{bt.pos * 100}%" title={bt.nome}></i>{/each}</span>
          </button>
        {/each}
      </div>
      <div class="t-actions">
        {#if stories.length}<button type="button" class="t-btn" onclick={() => (creating = false)}>Cancelar</button>{/if}
        <button class="t-btn t-btn--primary" disabled={!nName.trim()}>Criar história</button>
      </div>
    </form>
  {/if}

  {#if story}
    {@const s = story}
    <header class="shead">
      <div class="sinfo">
        <h2>{s.name}</h2>
        <div class="meta">
          <select class="t-select" value={s.sheet?.id ?? ''} onchange={(e) => put(s.path, 'estrutura', (e.currentTarget as HTMLSelectElement).value)} aria-label="Estrutura">
            <option value="">Sem estrutura</option>
            {#each BEAT_SHEETS as b (b.id)}<option value={b.id}>{b.label}</option>{/each}
          </select>
          <span class="statbar" title="Cenas por situação">
            {#each byStatus(s) as x (x.st)}{#if x.n}<i style:flex={x.n} style:background={STATUS_C[x.st]} title="{x.n} {x.st}"></i>{/if}{/each}
          </span>
          {#each byStatus(s) as x (x.st)}{#if x.n}<small class="dim"><i class="dot" style:background={STATUS_C[x.st]}></i>{x.n} {x.st}</small>{/if}{/each}
        </div>
        {#if s.goal}
          <div class="goal" title="Palavras escritas nas cenas, contra a meta da história">
            <span class="gbar"><i style:width="{Math.min(100, (s.words / s.goal) * 100)}%"></i></span>
            <small>{fmt(s.words)} / {fmt(s.goal)} palavras · {Math.round((s.words / s.goal) * 100)}%</small>
          </div>
        {/if}
      </div>
      <div class="acts">
        <div class="t-seg" role="radiogroup" aria-label="Visão">
          <button role="radio" aria-checked={look === 'quadro'} class:on={look === 'quadro'} onclick={() => (look = 'quadro')}>Quadro</button>
          <button role="radio" aria-checked={look === 'elenco'} class:on={look === 'elenco'} onclick={() => (look = 'elenco')}>Elenco</button>
          <button role="radio" aria-checked={look === 'manuscrito'} class:on={look === 'manuscrito'} onclick={() => (look = 'manuscrito')}>Manuscrito</button>
        </div>
        <button class="t-btn" onclick={() => onopen(s.path)}>Ficha da história</button>
        <button class="t-btn t-btn--primary" onclick={() => newScene(s)}>+ Cena</button>
      </div>
    </header>

    {#if look === 'quadro'}
      <div class="work" class:with={!!scene}>
        <div class="board t-scroll-x">
          {#each scenesByBeat(s) as col, ci (col.beat?.id ?? 'solta')}
            <section class="col" in:rise={{ delay: Math.min(ci, 10) * 25, y: 6 }}>
              <header title={col.beat?.desc ?? 'Cenas sem batida'}>
                <b>{col.beat?.nome ?? (s.sheet ? 'Sem batida' : 'Cenas')}</b>
                {#if col.beat}<small>{col.beat.desc}</small>{/if}
              </header>
              {#each col.scenes as sc (sc.path)}
                <button class="sc" class:on={scenePath === sc.path} style:--s={STATUS_C[sc.status]} onclick={() => (scenePath = scenePath === sc.path ? null : sc.path)}>
                  <span class="nm"><i class="dot"></i>{sc.name}</span>
                  {#if sc.goal}<small class="g">{sc.goal}</small>{/if}
                  <small class="dim">{sc.status} · {fmt(sc.words)} pal.{#if sc.pov} · {nameOf(sc.pov)}{/if}</small>
                </button>
              {/each}
              <button class="add" onclick={() => newScene(s, { beat: col.beat?.nome })}>+ cena aqui</button>
            </section>
          {/each}
        </div>

        {#if scene}
          {@const sc = scene}
          <aside class="editor t-card" in:rise={{ y: 8 }}>
            <header>
              <input class="t-input title" value={sc.name} readonly title="Para renomear, abra a nota" aria-label="Nome da cena" />
              <span class="t-seg">
                <button onclick={() => move(s, sc, -1)} title="Mover para antes" aria-label="Mover para antes">↑</button>
                <button onclick={() => move(s, sc, 1)} title="Mover para depois" aria-label="Mover para depois">↓</button>
              </span>
              <button class="t-btn t-btn--sm" onclick={() => onopen(sc.path)}>Ficha</button>
              <button class="t-btn t-btn--sm t-btn--icon t-btn--quiet" onclick={() => (scenePath = null)} aria-label="Fechar">✕</button>
            </header>
            <div class="t-seg status" role="radiogroup" aria-label="Situação">
              {#each SCENE_STATUS as st (st)}<button role="radio" aria-checked={sc.status === st} class:on={sc.status === st} style:--s={STATUS_C[st]} onclick={() => setStatus(sc, st)}><i class="dot"></i>{st}</button>{/each}
            </div>
            <div class="fields">
              <label><span>Batida</span>
                <select class="t-select" value={sc.beat ?? ''} onchange={(e) => put(sc.path, 'batida', (e.currentTarget as HTMLSelectElement).value)}>
                  <option value="">—</option>
                  {#each s.sheet?.beats ?? [] as b (b.id)}<option value={b.nome}>{b.nome}</option>{/each}
                  {#if sc.beat && !s.sheet?.beats.some((b) => b.nome === sc.beat)}<option value={sc.beat}>{sc.beat}</option>{/if}
                </select>
              </label>
              <label><span>Ponto de vista</span>
                <select class="t-select" value={nameOf(sc.pov)} onchange={(e) => put(sc.path, 'pov', link((e.currentTarget as HTMLSelectElement).value))}>
                  <option value="">—</option>
                  {#each people as p (p.path)}<option value={p.name}>{p.name}</option>{/each}
                </select>
              </label>
              <label><span>Local</span>
                <select class="t-select" value={nameOf(sc.local)} onchange={(e) => put(sc.path, 'local', link((e.currentTarget as HTMLSelectElement).value))}>
                  <option value="">—</option>
                  {#each places as p (p.path)}<option value={p.name}>{p.name}</option>{/each}
                </select>
              </label>
              <label><span>Data</span><input class="t-input" value={sc.date} placeholder="ano 342, outono" onchange={(e) => put(sc.path, 'data', (e.currentTarget as HTMLInputElement).value)} /></label>
            </div>
            <div class="gco">
              <label><span>Objetivo</span><input class="t-input" value={sc.goal} placeholder="O que o ponto de vista quer nesta cena?" onchange={(e) => put(sc.path, 'objetivo', (e.currentTarget as HTMLInputElement).value)} /></label>
              <label><span>Conflito</span><input class="t-input" value={sc.conflict} placeholder="O que está no caminho?" onchange={(e) => put(sc.path, 'conflito', (e.currentTarget as HTMLInputElement).value)} /></label>
              <label><span>Desfecho</span><input class="t-input" value={sc.outcome} placeholder="Como termina? (sim, mas… / não, e pior…)" onchange={(e) => put(sc.path, 'desfecho', (e.currentTarget as HTMLInputElement).value)} /></label>
            </div>
            {#if sc.beat && s.sheet}
              {@const b = s.sheet.beats.find((x) => x.nome === sc.beat)}
              {#if b}<p class="beatdesc"><b>{b.nome}:</b> {b.desc}</p>{/if}
            {/if}
            <div class="text">
              {#key sc.path}<Editor value={sBody} docKey={sc.path} onchange={typed} rich {host} focusMode={notes.focus} />{/key}
            </div>
            <small class="dim wc">{fmt(liveWords)} palavras nesta cena</small>
          </aside>
        {/if}
      </div>

      <section class="ideas">
        <header><h3>Ideias de cena com o seu mundo</h3><button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (seed += 1)} title="Outras ideias">🎲</button></header>
        {#if prompts.length}
          <ul>
            {#each prompts as p (p.text)}
              <li>
                <span>{plain(p.text)}</span>
                <button class="t-btn t-btn--sm" onclick={() => newScene(s, { pov: p.pov, local: p.local, text: p.text, name: titleOf(p.text) })}>Virar cena</button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="dim small">Crie personagens e lugares (com motivação, medo e segredo) e as ideias aparecem aqui.</p>
        {/if}
      </section>
    {:else if look === 'elenco'}
      {@const grid = castGrid(s, world)}
      {@const un = unusedInStory(s, world)}
      {#if grid.length}
        <div class="cast t-scroll-x">
          <table>
            <thead><tr><th>Quem</th>{#each s.scenes as sc, i (sc.path)}<th title={sc.name}><button class="cn" onclick={() => { look = 'quadro'; scenePath = sc.path; }}>{i + 1}</button></th>{/each}<th>POV</th></tr></thead>
            <tbody>
              {#each grid as row (row.entity.path)}
                <tr>
                  <th><button class="who" style:--t={typeColor(row.entity.type)} onclick={() => onopen(row.entity.path)}>{row.entity.name}</button></th>
                  {#each row.scenes as on, i (i)}<td>{#if on}<i class="pip" class:pov={s.scenes[i]?.pov === row.entity.path} style:--t={typeColor(row.entity.type)}></i>{/if}</td>{/each}
                  <td class="dim">{row.povs || ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="dim small">Cada coluna é uma cena, em ordem. Ponto cheio com anel = é o ponto de vista. Some por muito tempo? Talvez o leitor esqueça a personagem.</p>
      {:else}
        <p class="dim pad">Ninguém aparece ainda. Escolha o ponto de vista das cenas ou cite <code>[[Nome]]</code> nas propriedades.</p>
      {/if}
      {#if un.personagens.length || un.lugares.length}
        <section class="unused">
          <h3>Esperando a vez</h3>
          <p class="dim small">Fichas do mundo que nenhuma cena usou ainda.</p>
          <div class="chips">
            {#each un.personagens as e (e.path)}<button class="chip" style:--t={typeColor(e.type)} onclick={() => onopen(e.path)}>{e.name}</button>{/each}
            {#each un.lugares as e (e.path)}<button class="chip" style:--t={typeColor(e.type)} onclick={() => onopen(e.path)}>{e.name}</button>{/each}
          </div>
        </section>
      {/if}
    {:else}
      <div class="msacts">
        <button class="t-btn" onclick={() => { void navigator.clipboard?.writeText(ms); cadernos.say('Manuscrito copiado.'); }}>Copiar</button>
        <button class="t-btn t-btn--primary" onclick={exportMs}>Salvar como nota</button>
      </div>
      <article class="ms">
        {#each msBlocks as line, i (i)}
          {#if line.startsWith('### ')}<h4>{line.slice(4)}</h4>
          {:else if line.startsWith('## ')}<h3>{line.slice(3)}</h3>
          {:else if line.startsWith('# ')}<h2>{line.slice(2)}</h2>
          {:else if line.trim()}<p>{plain(line)}</p>{/if}
        {/each}
      </article>
    {/if}
  {/if}
</div>

<style>
  .esc { display: grid; gap: var(--sp-3); padding-bottom: 40px; }
  h3 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .stories { display: flex; gap: 6px; flex-wrap: wrap; }
  .st { display: grid; gap: 1px; text-align: left; padding: 8px 14px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface); color: var(--ink); min-width: 160px; }
  .st small { color: var(--muted); font-size: 11.5px; }
  .st.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 10%, var(--surface)); }
  .st.new { border-style: dashed; color: var(--muted); }
  .newstory { display: grid; gap: 10px; }
  .newstory label { display: grid; gap: 4px; }
  .row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 8px; }
  .sheets { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 6px; }
  .sheet { display: grid; gap: 4px; text-align: left; padding: 10px; border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); }
  .sheet small { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .sheet.on { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember) inset; }
  .beats { position: relative; height: 8px; margin-top: 4px; border-top: 1px solid var(--line); }
  .beats i { position: absolute; top: -4px; width: 7px; height: 7px; margin-left: -3px; border-radius: 50%; background: var(--ember); }
  .shead { display: flex; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; align-items: flex-start; }
  .sinfo { display: grid; gap: 6px; min-width: 0; }
  .shead h2 { margin: 0; font: 600 22px var(--f-display); }
  .meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .statbar { display: flex; width: 120px; height: 6px; border-radius: 3px; overflow: hidden; background: var(--surface-2); }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; background: var(--s, var(--muted)); }
  .goal { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .gbar { width: 200px; max-width: 100%; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .gbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--ember), var(--ok)); }
  .goal small { color: var(--muted); font: 12px var(--f-mono); }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .work { display: grid; gap: var(--sp-3); }
  .work.with { grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr); align-items: start; }
  .board { display: flex; gap: 8px; align-items: flex-start; padding-bottom: 8px; }
  .work.with .board { flex-direction: column; align-items: stretch; max-height: 78vh; overflow-y: auto; }
  .col { flex: 0 0 210px; display: grid; gap: 5px; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--line); }
  .work.with .col { flex: none; }
  .col header { display: grid; gap: 2px; margin-bottom: 2px; }
  .col header b { font: 600 13px var(--f-display); }
  .col header small { color: var(--muted); font-size: 11px; line-height: 1.35; }
  .sc { display: grid; gap: 2px; text-align: left; padding: 7px 9px; border-radius: var(--r-sm); border: 1px solid var(--line); border-left: 3px solid var(--s); background: var(--surface); color: var(--ink); }
  .sc .nm { font-size: 13.5px; font-weight: 600; }
  .sc .nm .dot { display: none; }
  .sc .g { font-size: 12px; color: color-mix(in srgb, var(--ink) 80%, var(--muted)); }
  .sc small { font-size: 11px; }
  .sc.on { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember); }
  .add { border: 1px dashed var(--line); border-radius: var(--r-sm); background: none; color: var(--muted); padding: 5px; font-size: 12px; }
  .add:hover { color: var(--ink); border-color: var(--ember); }
  .editor { display: grid; gap: 8px; position: sticky; top: 8px; }
  .editor header { display: flex; gap: 6px; align-items: center; }
  .editor .title { flex: 1; font: 600 16px var(--f-display); }
  .status { flex-wrap: wrap; }
  .status button { text-transform: capitalize; }
  .fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 6px; }
  .gco { display: grid; gap: 6px; }
  .fields label, .gco label { display: grid; gap: 3px; }
  .fields span, .gco span { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .beatdesc { margin: 0; font-size: 12.5px; color: var(--muted); padding: 6px 10px; border-left: 2px solid var(--ember); background: var(--surface-2); border-radius: 0 var(--r-sm) var(--r-sm) 0; }
  .text { min-height: 280px; border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; display: flex; flex-direction: column; }
  .text :global(> *) { flex: 1; }
  .wc { font: 11.5px var(--f-mono); justify-self: end; }
  .ideas header { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
  .ideas ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .ideas li { display: flex; gap: 10px; justify-content: space-between; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface); font-size: 14px; line-height: 1.4; }
  .cast table { border-collapse: collapse; font-size: 13px; }
  .cast th, .cast td { padding: 3px 5px; text-align: center; border-bottom: 1px solid var(--line); }
  .cast tbody th { text-align: left; white-space: nowrap; }
  .cn { border: 0; background: none; color: var(--muted); font: 11px var(--f-mono); }
  .who, .chip { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 10%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 1px 9px; font-size: 12.5px; }
  .pip { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--t); }
  .pip.pov { box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--t); }
  .unused { display: grid; gap: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .msacts { display: flex; gap: 6px; justify-content: flex-end; }
  .ms { max-width: 68ch; margin: 0 auto; padding: 24px 28px; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); font: 16px/1.75 var(--f-body); }
  .ms h2 { font: 600 28px var(--f-display); text-align: center; margin: 0 0 24px; }
  .ms h3 { font: 600 20px var(--f-display); text-transform: none; letter-spacing: 0; color: var(--ink); text-align: center; margin: 28px 0 12px; }
  .ms h4 { font: 600 13px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); margin: 22px 0 8px; text-align: center; }
  .ms p { margin: 0 0 .9em; text-indent: 1.5em; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  .pad { padding: 12px 0; }
  @media (max-width: 900px) {
    .work.with { grid-template-columns: 1fr; }
    .work.with .board { max-height: none; flex-direction: row; overflow-x: auto; }
    .work.with .col { flex: 0 0 210px; }
    .editor { position: static; }
    .ms { padding: 16px; }
  }
</style>
