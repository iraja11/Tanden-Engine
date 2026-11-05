<script lang="ts">
  import {
    NAME_STYLES, factionName, markovNames, placeName, reviewWorld, rollTraits, seededRng, storyHooks, styledName,
    type Entity, type IssueLevel, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { typeColor } from '../tipos';
  import LinkText from './LinkText.svelte';

  // Sugestões para o mundo: o que está contraditório ou solto (revisão), e
  // geradores para destravar: ganchos com as fichas reais, nomes no estilo
  // do mundo, personalidades.
  let { world, byPath, onopen, oncreate }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    oncreate: (name: string, type: string) => void;
  } = $props();

  const issues = $derived(reviewWorld(world));
  let levelFilter = $state<IssueLevel | null>(null);
  const counts = $derived({
    erro: issues.filter((i) => i.level === 'erro').length,
    aviso: issues.filter((i) => i.level === 'aviso').length,
    ideia: issues.filter((i) => i.level === 'ideia').length,
  });
  let showAll = $state(false);
  const listed = $derived(issues.filter((i) => !levelFilter || i.level === levelFilter));
  const visible = $derived(showAll ? listed : listed.slice(0, 12));

  // geradores: uma semente por clique, para "de novo" trazer outra coisa
  let seed = $state(Math.floor(Math.random() * 1e6));
  const reroll = () => (seed = Math.floor(Math.random() * 1e6));
  const hooks = $derived(storyHooks(world, 5, seededRng(seed)));

  let style = $state('mundo');
  const worldNames = $derived(world.entities.filter((e) => e.type === 'personagem' || e.type === 'lugar').map((e) => e.name));
  const names = $derived.by(() => {
    const rng = seededRng(seed + 1);
    if (style === 'mundo') {
      const m = markovNames(worldNames, 12, rng);
      if (m.length) return m;
    }
    const st = NAME_STYLES.find((s) => s.id === style) ?? NAME_STYLES[0]!;
    return Array.from({ length: 12 }, () => styledName(st, rng));
  });
  const styleObj = $derived(NAME_STYLES.find((s) => s.id === style) ?? NAME_STYLES[0]!);
  const places = $derived.by(() => { const r = seededRng(seed + 2); return Array.from({ length: 4 }, () => placeName(styleObj, r)); });
  const orders = $derived.by(() => { const r = seededRng(seed + 3); return Array.from({ length: 3 }, () => factionName(styleObj, r)); });
  const traits = $derived(rollTraits(seededRng(seed + 4)));
  const learned = $derived(style === 'mundo' && markovNames(worldNames, 1, seededRng(1)).length > 0);

  const ICON: Record<IssueLevel, string> = { erro: '⛔', aviso: '⚠', ideia: '💡' };
  const resolve = (t: string) => world.entities.find((x) => x.name.toLowerCase() === t.toLowerCase()) ?? null;
  const copy = (t: string) => void navigator.clipboard?.writeText(t);
</script>

<div class="ideias">
  <section class="review">
    <header>
      <h3>Revisão do mundo</h3>
      <div class="filters">
        {#each ['erro', 'aviso', 'ideia'] as const as l (l)}
          <button class="lvl {l}" class:on={levelFilter === l} onclick={() => (levelFilter = levelFilter === l ? null : l)} disabled={!counts[l]}>
            {ICON[l]} {counts[l]} {l === 'erro' ? (counts[l] === 1 ? 'erro' : 'erros') : l === 'aviso' ? (counts[l] === 1 ? 'aviso' : 'avisos') : (counts[l] === 1 ? 'ideia' : 'ideias')}
          </button>
        {/each}
      </div>
    </header>
    {#if issues.length}
      <ul>
        {#each visible as it, i (i)}
          <li class={it.level} in:rise={{ delay: Math.min(i, 12) * 25 }}>
            <span class="ic">{ICON[it.level]}</span>
            <span class="msg">{it.message}</span>
            <span class="acts">
              {#if it.create}<button class="ghost sm" onclick={() => oncreate(it.create!.name, it.create!.type)}>Criar ficha</button>{/if}
              {#if byPath.has(it.path)}<button class="ghost sm" onclick={() => onopen(it.path)}>Abrir</button>{/if}
            </span>
          </li>
        {/each}
      </ul>
      {#if listed.length > 12}<button class="more" onclick={() => (showAll = !showAll)}>{showAll ? 'Mostrar menos' : `Mostrar todas (${listed.length})`}</button>{/if}
    {:else}
      <p class="clean">✓ Nada contraditório nem solto. Mundo nos trinques.</p>
    {/if}
  </section>

  <div class="gens">
    <section class="box hooks">
      <header><h3>Ganchos de história</h3><button class="die" onclick={reroll} title="Outros" aria-label="Sortear de novo">🎲</button></header>
      {#if hooks.length}
        {#key seed}
          <ol>
            {#each hooks as h, i (h)}
              <li in:rise={{ delay: i * 60 }}>
                <LinkText text={h} color={(t) => { const x = resolve(t); return x ? typeColor(x.type) : null; }} onlink={(t) => { const x = resolve(t); if (x) onopen(x.path); }} />
                <button class="cp" onclick={() => copy(h)} title="Copiar (com os [[links]])" aria-label="Copiar">⧉</button>
              </li>
            {/each}
          </ol>
        {/key}
      {:else}
        <p class="dim small">Crie algumas fichas (personagens, lugares, facções) e os ganchos aparecem aqui.</p>
      {/if}
    </section>

    <section class="box">
      <header>
        <h3>Nomes</h3>
        <span class="row">
          <select bind:value={style} aria-label="Estilo">
            <option value="mundo">No estilo do mundo</option>
            {#each NAME_STYLES as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
          </select>
          <button class="die" onclick={reroll} title="Outros" aria-label="Sortear de novo">🎲</button>
        </span>
      </header>
      {#if style === 'mundo' && !learned}<p class="dim small">Com uns 6 nomes de personagens e lugares, o Tanden aprende o som do seu mundo. Por enquanto, élfico.</p>{/if}
      {#key seed + style}
        <div class="names">
          {#each names as n, i (n + i)}
            <button in:rise={{ delay: i * 20, y: 4 }} onclick={() => oncreate(n, 'personagem')} title="Criar personagem com este nome">{n}</button>
          {/each}
        </div>
        <div class="names alt">
          {#each places as n, i (n + i)}<button onclick={() => oncreate(n, 'lugar')} title="Criar lugar">⌂ {n}</button>{/each}
          {#each orders as n, i (n + i)}<button onclick={() => oncreate(n, 'faccao')} title="Criar facção">⚑ {n}</button>{/each}
        </div>
      {/key}
    </section>

    <section class="box">
      <header><h3>Personalidade</h3><button class="die" onclick={reroll} title="Outra" aria-label="Sortear de novo">🎲</button></header>
      {#key seed}
        <dl>
          {#each Object.entries(traits) as [k, v], i (k)}
            <div in:rise={{ delay: i * 40, y: 4 }}><dt>{k}</dt><dd>{v}</dd></div>
          {/each}
        </dl>
      {/key}
      <p class="dim small">Na ficha de um personagem, o botão 🎲 preenche motivação, medo e segredo vazios.</p>
    </section>
  </div>
</div>

<style>
  .ideias { display: grid; gap: 18px; padding-bottom: 40px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  h3 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .filters { display: flex; gap: 4px; flex-wrap: wrap; }
  .lvl { border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--muted); }
  .lvl.on { color: var(--ink); border-color: var(--ember); }
  .lvl:disabled { opacity: .4; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); font-size: 13px; }
  li.erro { border-color: color-mix(in srgb, var(--crit) 45%, var(--line)); background: color-mix(in srgb, var(--crit) 6%, var(--surface)); }
  li.aviso { border-color: color-mix(in srgb, var(--ember) 40%, var(--line)); }
  .acts { display: flex; gap: 4px; }
  .more { border: 0; background: none; color: var(--ember-soft); font-size: 12.5px; padding: 6px 0; }
  .clean { color: var(--ok); margin: 0; }
  .gens { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .box { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; }
  .hooks { grid-column: 1 / -1; background: radial-gradient(circle at 100% 0, color-mix(in srgb, var(--ember) 9%, var(--surface)), var(--surface) 55%); }
  ol { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  ol li { display: list-item; border: 0; background: none; padding: 2px 0; font-size: 14px; line-height: 1.55; }
  .cp { border: 0; background: none; color: var(--muted); opacity: 0; margin-left: 4px; }
  ol li:hover .cp { opacity: 1; }
  .row { display: flex; gap: 6px; align-items: center; }
  select { background: var(--surface-2); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 4px 8px; font: inherit; font-size: 12.5px; }
  .die { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; width: 30px; height: 28px; transition: transform .35s cubic-bezier(.3, 1.6, .5, 1); }
  .die:hover { transform: rotate(200deg) scale(1.1); border-color: var(--ember); }
  .die:active { transform: rotate(380deg) scale(.9); }
  .names { display: flex; flex-wrap: wrap; gap: 5px; }
  .names.alt { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .names button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 999px; padding: 3px 11px; font: 600 13px var(--f-display); letter-spacing: .02em; color: var(--ink); }
  .names button:hover { border-color: var(--ember); box-shadow: 0 0 12px -4px var(--ember); }
  .names.alt button { font: 12.5px var(--f-body); }
  dl { margin: 0; display: grid; gap: 6px; }
  dl div { display: grid; grid-template-columns: 90px 1fr; gap: 8px; }
  dt { font: 600 10px/1.9 var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  dd { margin: 0; font-size: 13.5px; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 6px 0 0; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); color: var(--ink); }
  .ghost.sm { padding: 3px 9px; font-size: 12px; }
  .ghost:hover { border-color: var(--ember); }
  @media (hover: none) { .cp { opacity: 1; } }
</style>
