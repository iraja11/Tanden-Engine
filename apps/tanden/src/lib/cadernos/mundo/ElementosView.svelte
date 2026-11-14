<script lang="ts">
  import {
    ELEMENT_FAMILIES, asList, elementById, elementCoverage, familyCoverage, provocacao, setProp, typeInfo,
    type CoverLevel, type Element, type Entity, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { cadernos } from '../cadernos.svelte';
  import { typeColor } from '../tipos';

  // A tabela de elementos do mundo: cada quadradinho é um assunto que um mundo
  // pode ter (moedas, tabus, profecias, vulcões...). A cor diz se o mundo já
  // fala dele, e o painel traz perguntas e cria a ficha já marcada.
  let { world, byPath, onopen, oncreate, focus = null }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    oncreate: (name: string, type: string, extra: { props: Record<string, string>; sections: string[] }) => void;
    focus?: string | null;
  } = $props();

  const cov = $derived(elementCoverage(world));
  const fams = $derived(familyCoverage(cov));
  const levelOf = $derived(new Map(cov.map((c) => [c.element.id, c])));
  let sel = $state<string | null>(null);
  $effect(() => { if (focus) sel = focus; });
  let onlyMissing = $state(false);
  const total = $derived(fams.reduce((n, f) => n + f.total, 0));
  const done = $derived(fams.reduce((n, f) => n + f.done, 0));
  const vivos = $derived(cov.filter((c) => c.level === 'vivo').length);
  let seed = $state(Math.floor(Date.now() / 864e5));
  const prov = $derived(provocacao(seed));
  const provEl = $derived(elementById(prov.elemento));
  const current = $derived(sel ? levelOf.get(sel) ?? null : null);

  const LEVEL: Record<CoverLevel, string> = { vazio: 'Ainda nada', iniciado: 'Começado', vivo: 'Vivo', fora: 'Fora deste mundo' };

  let newName = $state('');
  $effect(() => { if (current) newName = current.element.nome; });
  let linkPick = $state('');

  function create(el: Element) {
    const name = newName.trim() || el.nome;
    oncreate(name, el.tipo, { props: { elemento: el.nome }, sections: el.perguntas });
  }
  function toggleOut(el: Element) {
    if (!world.path) return;
    const key = Object.keys(world.props ?? {}).find((k) => /^fora do mundo$/i.test(k.trim())) ?? 'fora do mundo';
    const cur = asList((world.props ?? {})[key]).filter(Boolean);
    const has = cur.some((x) => elementById(x)?.id === el.id);
    const next = has ? cur.filter((x) => elementById(x)?.id !== el.id) : [...cur, el.nome];
    cadernos.update(world.path, (t) => setProp(t, key, next.length ? next : null));
  }
  function mark(path: string, el: Element) {
    const e = byPath.get(path);
    if (!e) return;
    const key = Object.keys(e.props).find((k) => /^elementos?$/i.test(k)) ?? 'elemento';
    const cur = asList(e.props[key]).filter(Boolean);
    if (cur.some((x) => elementById(x)?.id === el.id)) return;
    cadernos.update(path, (t) => setProp(t, key, cur.length ? [...cur, el.nome] : el.nome));
    cadernos.say(`${e.name} agora conta como ${el.nome.toLowerCase()}.`);
    linkPick = '';
  }
  const candidates = (el: Element) => world.entities.filter((e) => (el.tipos.includes(e.type) || e.type === el.tipo) && !levelOf.get(el.id)?.entities.includes(e));
</script>

<div class="els">
  <section class="head">
    <div class="sum">
      <b>{done}<small>/{total}</small></b>
      <span class="dim">elementos tocados · {vivos} vivos</span>
      <span class="bar"><i style:width="{total ? (done / total) * 100 : 0}%"></i></span>
    </div>
    {#if provEl}
      <button class="prov" onclick={() => (sel = provEl.id)} style:--c={ELEMENT_FAMILIES.find((f) => f.id === provEl.family)?.color}>
        <span class="g">{provEl.glyph}</span>
        <span><small>Pergunta do dia · {provEl.nome}</small>{prov.pergunta}</span>
      </button>
      <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (seed += 7)} title="Outra pergunta">🎲</button>
    {/if}
    <label class="t-chip only"><input type="checkbox" bind:checked={onlyMissing} /> Só o que falta</label>
  </section>

  <div class="legend dim">
    <span><i class="lv vazio"></i>ainda nada</span><span><i class="lv iniciado"></i>começado</span><span><i class="lv vivo"></i>vivo (3+ fichas ou uma bem feita)</span><span><i class="lv fora"></i>fora deste mundo</span>
  </div>

  <div class="table">
    {#each fams as f, fi (f.family.id)}
      {@const items = cov.filter((c) => c.element.family === f.family.id && (!onlyMissing || c.level === 'vazio'))}
      {#if items.length}
        <section class="fam" style:--c={f.family.color} in:rise={{ delay: Math.min(fi, 12) * 30, y: 6 }}>
          <header>
            <h3>{f.family.label}</h3>
            <small>{f.done}/{f.total}</small>
            <span class="fbar"><i style:width="{f.total ? (f.done / f.total) * 100 : 0}%"></i></span>
          </header>
          <div class="tiles">
            {#each items as c (c.element.id)}
              <button class="tile {c.level}" class:on={sel === c.element.id} onclick={() => (sel = sel === c.element.id ? null : c.element.id)}
                title={`${c.element.nome}: ${LEVEL[c.level]}${c.entities.length ? ` (${c.entities.length})` : ''}`}>
                <span class="g">{c.element.glyph}</span>
                <span class="n">{c.element.nome}</span>
                {#if c.entities.length}<span class="k">{c.entities.length}</span>{/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>

  {#if current}
    {@const el = current.element}
    {@const fam = ELEMENT_FAMILIES.find((f) => f.id === el.family)}
    <div class="panelwrap">
      <aside class="panel t-card" style:--c={fam?.color} aria-label={el.nome} in:rise={{ y: 10 }}>
        <header>
          <span class="big">{el.glyph}</span>
          <div>
            <small class="fam-l">{fam?.label} · {LEVEL[current.level]}</small>
            <h2>{el.nome}</h2>
          </div>
          <button class="t-btn t-btn--sm t-btn--icon t-btn--quiet x" onclick={() => (sel = null)} aria-label="Fechar">✕</button>
        </header>
        <p>{el.desc}</p>
        <h4>Perguntas para pensar</h4>
        <ol>{#each el.perguntas as q (q)}<li>{q}</li>{/each}</ol>

        {#if current.entities.length}
          <h4>No seu mundo</h4>
          <div class="chips">
            {#each current.entities as e (e.path)}<button class="chip" style:--t={typeColor(e.type)} onclick={() => onopen(e.path)}>{e.name}</button>{/each}
          </div>
        {/if}

        <h4>Criar uma ficha disso</h4>
        <form class="mk" onsubmit={(e) => { e.preventDefault(); create(el); }}>
          <input class="t-input" bind:value={newName} aria-label="Nome da ficha" />
          <button class="t-btn t-btn--primary">Criar {typeInfo(el.tipo).label.toLowerCase()}</button>
        </form>
        <p class="dim small">A ficha nasce marcada com <code>elemento: {el.nome}</code> e com as perguntas acima como seções para responder.</p>

        {#if candidates(el).length}
          <h4>Ou marcar uma ficha que já existe</h4>
          <div class="mk">
            <select class="t-select" bind:value={linkPick} aria-label="Ficha existente">
              <option value="">Escolher…</option>
              {#each candidates(el) as e (e.path)}<option value={e.path}>{e.name} ({typeInfo(e.type).label})</option>{/each}
            </select>
            <button class="t-btn" disabled={!linkPick} onclick={() => mark(linkPick, el)}>Marcar</button>
          </div>
        {/if}

        {#if world.path}
          <button class="t-btn t-btn--sm t-btn--quiet out" onclick={() => toggleOut(el)}>
            {current.level === 'fora' ? '↺ Trazer de volta para o mundo' : '⊘ Não existe neste mundo'}
          </button>
        {/if}
      </aside>
    </div>
  {/if}
</div>

<style>
  .els { display: grid; gap: var(--sp-3); padding-bottom: 40px; }
  .head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .sum { display: grid; grid-template-columns: auto 1fr; align-items: baseline; gap: 2px 8px; min-width: 180px; }
  .sum b { font: 700 26px var(--f-display); }
  .sum b small { font-size: 14px; color: var(--muted); }
  .bar { grid-column: 1 / -1; height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .bar i, .fbar i { display: block; height: 100%; background: var(--ember); }
  .prov { flex: 1; min-width: min(260px, 100%); display: flex; gap: 10px; align-items: center; text-align: left; padding: 8px 12px; border-radius: var(--r-md); border: 1px solid color-mix(in srgb, var(--c) 45%, var(--line)); background: color-mix(in srgb, var(--c) 8%, var(--surface)); color: var(--ink); font-size: 14px; line-height: 1.4; }
  .prov .g { font-size: 22px; }
  .prov small { display: block; color: var(--muted); font-size: 11px; }
  .only { cursor: pointer; }
  .only input { margin: 0; }
  .legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .lv { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--line); display: inline-block; }
  .lv.vazio { background: var(--surface); border-style: dashed; }
  .lv.iniciado { background: color-mix(in srgb, var(--ember) 30%, var(--surface)); }
  .lv.vivo { background: var(--ember); }
  .lv.fora { background: repeating-linear-gradient(45deg, var(--surface-2) 0 3px, var(--surface) 3px 6px); }
  .table { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: var(--sp-3); }
  .fam { border: 1px solid var(--line); border-radius: var(--r-lg); padding: 10px; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 9%, var(--surface)), var(--surface) 70%); }
  .fam header { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 2px 8px; margin-bottom: 8px; }
  .fam h3 { margin: 0; font: 600 11px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: color-mix(in srgb, var(--c) 60%, var(--ink)); }
  .fam small { font: 11px var(--f-mono); color: var(--muted); }
  .fbar { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .fbar i { background: var(--c); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 5px; }
  .tile { position: relative; display: grid; justify-items: center; align-content: center; gap: 2px; aspect-ratio: 1; padding: 4px; border-radius: var(--r-sm); border: 1px dashed color-mix(in srgb, var(--c) 40%, var(--line)); background: var(--surface); color: var(--muted); transition: transform .15s, box-shadow .15s; }
  .tile .g { font-size: 20px; filter: grayscale(.8); opacity: .55; }
  .tile .n { font-size: 10px; line-height: 1.15; text-align: center; hyphens: auto; overflow-wrap: break-word; max-width: 100%; }
  .tile .k { position: absolute; top: 3px; right: 5px; font: 600 9.5px var(--f-mono); }
  .tile.iniciado { border-style: solid; background: color-mix(in srgb, var(--c) 18%, var(--surface)); color: var(--ink); }
  .tile.vivo { border-style: solid; border-color: var(--c); background: color-mix(in srgb, var(--c) 42%, var(--surface)); color: var(--ink); }
  .tile.iniciado .g, .tile.vivo .g { filter: none; opacity: 1; }
  .tile.fora { opacity: .4; text-decoration: line-through; background: repeating-linear-gradient(45deg, var(--surface-2) 0 3px, var(--surface) 3px 6px); }
  .tile:hover { transform: translateY(-2px); box-shadow: 0 6px 16px -10px var(--c); }
  .tile.on { outline: 2px solid var(--c); outline-offset: 1px; }
  .panelwrap { position: sticky; bottom: 8px; z-index: 5; display: flex; justify-content: center; }
  .panel { width: min(560px, 100%); max-height: 70vh; overflow-y: auto; box-shadow: 0 18px 50px -20px #000; display: grid; gap: 8px; border-top: 4px solid var(--c); }
  .panel header { display: flex; gap: 12px; align-items: center; }
  .panel header > div { flex: 1; }
  .big { font-size: 34px; width: 54px; height: 54px; display: grid; place-items: center; border-radius: var(--r-md); background: color-mix(in srgb, var(--c) 25%, var(--surface-2)); }
  .fam-l { color: var(--muted); font-size: 11.5px; }
  .panel h2 { margin: 0; font: 600 22px var(--f-display); }
  .panel p { margin: 0; line-height: 1.5; }
  .panel h4 { margin: 6px 0 0; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .panel ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: 14px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chip { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 12%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 2px 10px; font-size: 13px; }
  .mk { display: flex; gap: 6px; flex-wrap: wrap; }
  .mk .t-input, .mk .t-select { flex: 1; min-width: 160px; }
  .out { justify-self: start; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
</style>
