<script lang="ts">
  import {
    chronicleMarkdown, entityFolder, entityTemplate, noteDir, setProps, setSection, simulateWorld,
    type Entity, type SimEvent, type SimKind, type SimResult, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { sound } from '../../sound.svelte';
  import { cadernos } from '../cadernos.svelte';
  import LinkText from './LinkText.svelte';
  import { typeColor } from '../tipos';

  // "E se o mundo andasse sozinho?" Simula as facções por alguns anos e conta
  // o que aconteceu. Nada vira cânone sozinho: cada acontecimento pode virar
  // uma ficha de evento, e a crônica inteira pode virar uma nota.
  let { world, byPath, onopen }: { world: World; byPath: Map<string, Entity>; onopen: (path: string) => void } = $props();

  let years = $state(50);
  let chaos = $state(0.5);
  let seed = $state(Math.floor(Math.random() * 9999) + 1);
  let result = $state<SimResult | null>(null);
  let onlyBig = $state(false);
  let run = $state(0);

  const factions = $derived(world.entities.filter((e) => e.type === 'faccao'));
  // o resultado é de um mundo: trocou de mundo, limpa
  let lastWorld = '';
  $effect(() => { if (world.name !== lastWorld) { lastWorld = world.name; result = null; } });

  function simulate(newSeed = false) {
    if (newSeed) seed = Math.floor(Math.random() * 9999) + 1;
    result = simulateWorld(world, { seed, years, chaos });
    onlyBig = result.events.length > 45;
    run++;
    sound.play(result.problem ? 'close' : 'open');
  }

  const ICON: Record<SimKind, string> = {
    guerra: '⚔', batalha: '🗡', conquista: '🏴', alianca: '🤝', traicao: '🗝', paz: '🕊', crise: '🔥', sucessao: '👑',
    prosperidade: '💰', praga: '☠', descoberta: '✧', heroi: '★', queda: '⛬',
  };
  const KIND: Record<SimKind, string> = {
    guerra: 'Guerra', batalha: 'Batalha', conquista: 'Conquista', alianca: 'Aliança', traicao: 'Traição', paz: 'Paz', crise: 'Crise',
    sucessao: 'Sucessão', prosperidade: 'Prosperidade', praga: 'Calamidade', descoberta: 'Descoberta', heroi: 'Herói', queda: 'Queda',
  };

  const shown = $derived(result ? result.events.filter((e) => !onlyBig || e.weight >= 2) : []);
  const byYear = $derived.by(() => {
    const out: Array<{ year: number; events: SimEvent[] }> = [];
    for (const e of shown) {
      const last = out[out.length - 1];
      if (last?.year === e.year) last.events.push(e);
      else out.push({ year: e.year, events: [e] });
    }
    return out;
  });

  // ---- gráfico do poder
  const PALETTE = ['#ff8a3d', '#7fb6ff', '#7fd1a8', '#ff6b6b', '#b59cff', '#ffc08a', '#6fc3c9', '#d98fb0', '#e6c86e', '#c8c7cf'];
  let chartW = $state(600);
  // largura útil do gráfico (a seção tem 14px de respiro de cada lado)
  const W = $derived(Math.max(200, chartW - 28));
  const H = 150;
  const chart = $derived.by(() => {
    if (!result?.history.length) return null;
    const h = result.history;
    const max = Math.max(10, ...h.flatMap((p) => Object.values(p.power)));
    const span = Math.max(1, h[h.length - 1]!.year - h[0]!.year);
    return result.actors.map((a, i) => ({
      path: a.path, name: a.name, alive: a.alive, color: PALETTE[i % PALETTE.length]!, final: Math.round(a.power), land: a.territory.length,
      d: h.map((p, j) => `${j ? 'L' : 'M'}${(((p.year - h[0]!.year) / span) * W).toFixed(1)},${(H - ((p.power[a.path] ?? 0) / max) * (H - 8)).toFixed(1)}`).join(''),
    })).sort((x, y) => y.final - x.final);
  });

  // ---- virar cânone
  const folder = $derived(world.path ? noteDir(world.path) : `Mundos/${world.name}`);
  function saveChronicle() {
    if (!result) return;
    const r = result;
    const path = cadernos.create(`${folder}/Simulações`, `Crônica ${r.start}–${r.end} (semente ${r.seed})`, () => chronicleMarkdown(world, r, onlyBig ? 2 : 1));
    cadernos.say(`Crônica salva em ${path.replace(/\.md$/, '')}.`);
  }
  function toEvent(e: SimEvent) {
    const place = e.place ? byPath.get(e.place) : undefined;
    const name = `${KIND[e.kind]}${place ? ` de ${place.name}` : ''} (${e.year})`;
    const who = e.actors.map((p) => byPath.get(p)?.name).filter(Boolean).map((n) => `[[${n}]]`);
    const path = cadernos.create(entityFolder(world, 'evento'), name, (n) => {
      let t = setProps(entityTemplate(n, world.name, 'evento'), { data: String(e.year), envolvidos: who.length > 1 ? who : who[0] ?? '', local: place ? `[[${place.name}]]` : '' });
      t = setSection(t, 'O que aconteceu', e.text);
      return t;
    });
    cadernos.say(`Evento criado: ${path.split('/').pop()!.replace(/\.md$/, '')}.`);
  }

  const resolve = (target: string) => world.entities.find((x) => x.name.toLowerCase() === target.toLowerCase()) ?? null;
</script>

<div class="sim">
  <div class="setup">
    <div class="intro">
      <h3>Simulação de facções</h3>
      <p class="dim">Cada facção cresce, guerreia, se alia ou desmorona, a partir do que as fichas dizem: <code>poder</code>, <code>riqueza</code>, <code>estabilidade</code> (1 a 10), território (<code>governante</code>, <code>sede</code>, <code>território</code>) e quem é <code>inimigo</code> ou <code>aliado</code> de quem.</p>
    </div>
    <div class="ctl">
      <label>Anos <span class="val">{years}</span><input type="range" min="10" max="300" step="5" bind:value={years} /></label>
      <label>Acaso <span class="val">{chaos < 0.3 ? 'calmo' : chaos > 0.7 ? 'caótico' : 'normal'}</span><input type="range" min="0" max="1" step="0.1" bind:value={chaos} /></label>
      <label>Semente <span class="seed"><input type="number" min="1" bind:value={seed} /><button class="die" onclick={() => (seed = Math.floor(Math.random() * 9999) + 1)} title="Sortear semente" aria-label="Sortear semente">🎲</button></span></label>
      <div class="go">
        <button class="primary" onclick={() => simulate()} disabled={factions.length < 2}>▶ Simular</button>
        {#if result}<button class="ghost" onclick={() => simulate(true)}>Outra história</button>{/if}
      </div>
    </div>
    {#if factions.length < 2}<p class="warn">Crie pelo menos duas facções para simular (e diga quem é inimigo de quem).</p>{/if}
  </div>

  {#if result?.problem}
    <p class="warn">{result.problem}</p>
  {:else if result}
    {#key run}
      {#if chart}
        <section class="chart" in:rise bind:clientWidth={chartW}>
          <h3>Poder de {result.start} a {result.end}</h3>
          <svg viewBox="0 0 {W} {H}" role="img" aria-label="Poder das facções ao longo do tempo">
            {#each [0.25, 0.5, 0.75] as g (g)}<line x1="0" x2={W} y1={H * g} y2={H * g} class="grid" />{/each}
            {#each chart as l (l.path)}<path d={l.d} pathLength="1" style:--c={l.color} class:dead={!l.alive} />{/each}
          </svg>
          <div class="legend">
            {#each chart as l, i (l.path)}
              <button style:--c={l.color} onclick={() => onopen(l.path)} class:dead={!l.alive}>
                <i></i><b>{i === 0 && l.alive ? '👑 ' : ''}{l.name}</b>
                <small>{l.alive ? `poder ${l.final} · ${l.land} ${l.land === 1 ? 'território' : 'territórios'}` : 'caiu'}</small>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <section class="chron">
        <header>
          <h3>Crônica · {shown.length} {shown.length === 1 ? 'acontecimento' : 'acontecimentos'}</h3>
          <div class="acts">
            <label class="chk"><input type="checkbox" bind:checked={onlyBig} /> só os marcos</label>
            <button class="ghost sm" onclick={saveChronicle}>Salvar como nota</button>
          </div>
        </header>
        <ol>
          {#each byYear as y, i (y.year)}
            <li in:rise={{ delay: Math.min(i, 30) * 45 }}>
              <span class="yr">{y.year}</span>
              <div class="evs">
                {#each y.events as e, j (j)}
                  <div class="ev k-{e.kind}" class:big={e.weight >= 3}>
                    <span class="ic" title={KIND[e.kind]}>{ICON[e.kind]}</span>
                    <span class="tx"><LinkText text={e.text} color={(t) => { const x = resolve(t); return x ? typeColor(x.type) : null; }} onlink={(t) => { const x = resolve(t); if (x) onopen(x.path); }} /></span>
                    <button class="mk" onclick={() => toEvent(e)} title="Criar uma ficha de evento com isto">+ evento</button>
                  </div>
                {/each}
              </div>
            </li>
          {:else}
            <li class="dim">Nada de notável aconteceu. Aumente o acaso ou os anos.</li>
          {/each}
        </ol>
      </section>
    {/key}
  {/if}
</div>

<style>
  .sim { display: grid; gap: 16px; padding-bottom: 40px; }
  h3 { margin: 0 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .setup { border: 1px solid var(--line); border-radius: 14px; background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--ember) 8%, var(--surface)), var(--surface) 60%); padding: 14px 16px; display: grid; gap: 10px; }
  .intro p { margin: 0; font-size: 12.5px; }
  .ctl { display: flex; flex-wrap: wrap; gap: 12px 22px; align-items: flex-end; }
  .ctl label { display: grid; gap: 4px; font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); min-width: 150px; }
  .val { color: var(--ember-soft); font: 12px var(--f-mono); text-transform: none; letter-spacing: 0; margin-left: 6px; }
  input[type='range'] { accent-color: var(--ember); }
  .seed { display: flex; gap: 4px; }
  .seed input { width: 90px; background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 4px 8px; font: 13px var(--f-mono); }
  .die { border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; width: 32px; transition: transform .3s; }
  .die:hover { transform: rotate(180deg); border-color: var(--ember); }
  .go { display: flex; gap: 6px; margin-left: auto; }
  .warn { margin: 0; color: var(--ember-soft); font-size: 12.5px; }
  .chart { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; }
  svg { width: 100%; height: 150px; display: block; overflow: visible; }
  .grid { stroke: var(--line); stroke-dasharray: 3 4; }
  path { fill: none; stroke: var(--c); stroke-width: 2.2; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1;
    animation: draw 1.6s cubic-bezier(.3, .7, .3, 1) forwards; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--c) 60%, transparent)); }
  path.dead { opacity: .55; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 8px; }
  .legend button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; color: var(--ink); font-size: 12.5px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; background: var(--c); }
  .legend small { color: var(--muted); font: 11px var(--f-mono); }
  .legend .dead b { text-decoration: line-through; opacity: .6; }
  .chron header { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
  .acts { display: flex; gap: 10px; align-items: center; }
  .chk { display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--muted); }
  ol { list-style: none; margin: 0; padding: 0; position: relative; }
  ol::before { content: ''; position: absolute; left: 58px; top: 4px; bottom: 4px; width: 1px; background: linear-gradient(var(--ember), var(--line)); }
  li { display: grid; grid-template-columns: 50px 1fr; gap: 18px; padding: 4px 0; }
  .yr { text-align: right; font: 600 12.5px var(--f-mono); color: var(--ember-soft); padding-top: 5px; }
  .evs { display: grid; gap: 4px; }
  .ev { display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: start; padding: 5px 8px; border-radius: 10px; border: 1px solid transparent; font-size: 13.5px; line-height: 1.5; }
  .ev:hover { background: var(--surface); border-color: var(--line); }
  .ev.big { background: color-mix(in srgb, var(--ember) 6%, transparent); }
  .ev.k-traicao, .ev.k-queda { background: color-mix(in srgb, var(--crit) 8%, transparent); }
  .ic { text-align: center; }
  .mk { opacity: 0; border: 1px dashed var(--line); background: none; border-radius: 999px; padding: 1px 8px; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
  .ev:hover .mk, .mk:focus { opacity: 1; }
  .mk:hover { border-color: var(--ember); color: var(--ink); }
  .dim { color: var(--muted); }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .primary { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary:disabled { opacity: .45; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 6px 12px; background: var(--surface-2); color: var(--ink); }
  .ghost.sm { padding: 4px 10px; font-size: 12.5px; }
  .ghost:hover { border-color: var(--ember); }
  @media (hover: none) { .mk { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { path { animation: none; stroke-dashoffset: 0; } }
</style>
