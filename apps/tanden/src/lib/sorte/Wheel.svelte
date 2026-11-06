<script lang="ts">
  import { parseOptions, sliceAt, spinWheel, wheelSlices } from '@tanden/core';
  import { ask } from '../ask.svelte';
  import { sound } from '../sound.svelte';
  import { sorte } from './sorte.svelte';

  // Roleta: as opções viram fatias (o peso "*2" dá fatia dobrada); girar
  // sorteia no núcleo e a animação só leva a roda até lá.

  const options = $derived(parseOptions(sorte.wheel));
  const slices = $derived(wheelSlices(options));
  let rot = $state(0);
  let spinning = $state(false);
  let winner = $state<number | null>(null);
  /** o ponteiro balança quando passa uma fatia */
  let nudge = $state(0);
  let frame = 0;

  const R = 150;
  const C = 160;
  const pt = (deg: number, r = R) => {
    const a = (deg * Math.PI) / 180;
    return `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
  };
  const arc = (s: { start: number; end: number }) =>
    `M ${C} ${C} L ${pt(s.start)} A ${R} ${R} 0 ${s.end - s.start > 180 ? 1 : 0} 1 ${pt(s.end)} Z`;
  /** cores espalhadas pelo círculo, sem duas vizinhas iguais */
  const fill = (i: number, n: number) => `hsl(${Math.round((i * 360) / Math.max(n, 1) + 18) % 360} 68% ${i % 2 ? 62 : 70}%)`;
  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const labelSize = $derived(slices.length <= 6 ? 15 : slices.length <= 12 ? 13 : slices.length <= 20 ? 11 : 9);
  const labelMax = $derived(slices.length <= 8 ? 16 : slices.length <= 16 ? 13 : 10);

  function spin() {
    if (spinning) return;
    if (options.length < 2) {
      sound.play('error');
      return;
    }
    const s = spinWheel(options, { from: rot });
    winner = null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      rot = s.rotation;
      done(s.index);
      return;
    }
    spinning = true;
    sound.play('open');
    const from = rot;
    const dur = 4200 + Math.random() * 900;
    const t0 = performance.now();
    let last = sliceAt(slices, from);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      // começa rápido e vai freando devagar (quártica)
      const e = 1 - (1 - t) ** 4;
      rot = from + s.delta * e;
      const cur = sliceAt(slices, rot);
      if (cur !== last) {
        last = cur;
        nudge++;
        sound.play('tick');
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        spinning = false;
        done(s.index);
      }
    };
    frame = requestAnimationFrame(step);
  }

  function done(i: number) {
    winner = i;
    sound.play('complete');
    sorte.record('roleta', options[i]!.label, sorte.wheelList || undefined);
  }

  $effect(() => () => cancelAnimationFrame(frame));

  /** modo eliminação: tira o sorteado da lista e gira de novo depois */
  function removeWinner() {
    if (winner === null) return;
    const label = options[winner]!.label;
    const lines = sorte.wheel.split('\n');
    const i = lines.findIndex((l) => parseOptions(l)[0]?.label === label);
    if (i >= 0) lines.splice(i, 1);
    sorte.wheel = lines.join('\n');
    sorte.wheelList = '';
    winner = null;
    sorte.save();
  }

  function pickList(name: string) {
    sorte.wheelList = name;
    const l = sorte.list(name);
    if (l) sorte.wheel = l.items.join('\n');
    winner = null;
    sorte.save();
  }

  async function saveAs() {
    const name = await ask.text('Salvar lista', sorte.wheelList, { ok: 'Salvar', placeholder: 'Almoço, Filmes, Quem paga…', detail: 'Fica na nota Sorteios.md (vai junto no sync).' });
    if (!name?.trim()) return;
    sorte.saveList(name, sorte.wheel.split('\n').map((l) => l.trim()).filter(Boolean));
    sorte.wheelList = name.trim();
    sorte.save();
    sound.play('create');
  }

  async function remove() {
    const name = sorte.wheelList;
    if (!name || !(await ask.confirm(`Apagar a lista "${name}"?`, { ok: 'Apagar', danger: true, detail: 'Sai da nota Sorteios.md.' }))) return;
    sorte.deleteList(name);
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target;
    // botões e campos já tratam a tecla sozinhos
    const own = t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLButtonElement;
    if ((e.key === ' ' || e.key === 'Enter') && !own && !ask.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      spin();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="wheel-tool">
  <div class="stage">
    <div class="wheelbox">
      <svg class="pointer" class:nudge={nudge % 2 === 1} class:nudge2={nudge % 2 === 0 && nudge > 0} viewBox="0 0 40 46" aria-hidden="true">
        <path d="M20 44 L4 8 Q20 -4 36 8 Z" />
      </svg>
      <button class="wheel" onclick={spin} disabled={spinning} aria-label="Girar a roleta">
        <svg viewBox="0 0 320 320" role="img" aria-label="Roleta com {slices.length} opções">
          <g style:transform="rotate({rot}deg)" style:transform-origin="{C}px {C}px">
            {#if slices.length === 1}
              <circle cx={C} cy={C} r={R} fill={fill(0, 1)} />
            {:else}
              {#each slices as s, i (i)}
                <path d={arc(s)} fill={fill(i, slices.length)} class:win={winner === i} />
              {/each}
            {/if}
            {#each slices as s, i (i)}
              {@const mid = (s.start + s.end) / 2}
              <text x={C} y={C - R + 16} font-size={labelSize} transform="rotate({mid} {C} {C}) rotate(90 {C} {C - R + 16})"
                text-anchor="start" dominant-baseline="middle">{short(s.label, labelMax)}</text>
            {/each}
          </g>
          <circle cx={C} cy={C} r={R} class="rim" />
          <circle cx={C} cy={C} r="22" class="hub" />
        </svg>
        <span class="hub-label">{spinning ? '' : 'Girar'}</span>
      </button>
    </div>
    <div class="result" aria-live="polite">
      {#if winner !== null && options[winner]}
        {#key winner + rot}
          <p class="won">{options[winner].label}</p>
        {/key}
        <div class="ra">
          <button class="ghost sm" onclick={spin}>Girar de novo</button>
          {#if options.length > 2}<button class="ghost sm" onclick={removeWinner} title="Tira esta opção e deixa as outras">Tirar da roleta</button>{/if}
        </div>
      {:else if options.length < 2}
        <p class="dim">Escreva pelo menos duas opções.</p>
      {:else}
        <p class="dim">{spinning ? 'Girando…' : 'Toque na roda ou aperte espaço.'}</p>
      {/if}
    </div>
  </div>

  <div class="opts box">
    <div class="oh">
      <h3>Opções <span class="dim">{options.length}</span></h3>
      <select class="field" value={sorte.wheelList} onchange={(e) => pickList((e.currentTarget as HTMLSelectElement).value)} aria-label="Lista salva">
        <option value="">Texto livre</option>
        {#each sorte.lists as l (l.name)}<option value={l.name}>{l.name}</option>{/each}
      </select>
    </div>
    <textarea class="field" rows="10" bind:value={sorte.wheel} oninput={() => { winner = null; sorte.save(); }} disabled={spinning}
      placeholder="Uma opção por linha&#10;Sushi *2 (peso dobrado)" spellcheck="false" aria-label="Opções da roleta"></textarea>
    <p class="hint dim small">Uma por linha (ou separadas por vírgula). <code>*2</code> no fim dá o dobro de chance.</p>
    <div class="oa">
      <button class="ghost sm" onclick={saveAs} disabled={options.length < 1}>{sorte.wheelList ? 'Salvar' : 'Salvar como lista'}</button>
      {#if sorte.wheelList}<button class="ghost sm" onclick={remove}>Apagar lista</button>{/if}
    </div>
  </div>
</div>

<style>
  .wheel-tool { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 24px; align-items: start; }
  .stage { display: grid; justify-items: center; gap: 14px; }
  .wheelbox { position: relative; width: min(440px, 100%); aspect-ratio: 1; }
  .wheel { all: unset; cursor: pointer; display: block; width: 100%; height: 100%; position: relative; border-radius: 50%; }
  .wheel:focus-visible { outline: 2px solid var(--ember); outline-offset: 6px; }
  .wheel:disabled { cursor: default; }
  .wheel svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 18px 30px var(--shadow)); }
  .wheel path { stroke: color-mix(in srgb, var(--void) 70%, transparent); stroke-width: 1.5; transition: filter var(--dur); }
  .wheel path.win { filter: brightness(1.12) saturate(1.2); }
  .wheel text { fill: #1d1a17; font-family: var(--f-display); font-weight: 600; pointer-events: none; }
  .rim { fill: none; stroke: var(--ink); stroke-opacity: .18; stroke-width: 6; }
  .hub { fill: var(--surface); stroke: var(--line); stroke-width: 2; }
  .hub-label { position: absolute; inset: 0; display: grid; place-items: center; font: 600 10px var(--f-display); letter-spacing: .1em;
    text-transform: uppercase; color: var(--muted); pointer-events: none; }
  .pointer { position: absolute; top: -10px; left: 50%; width: 34px; height: 40px; translate: -50% 0; z-index: 2; transform-origin: 50% 20%;
    filter: drop-shadow(0 3px 4px var(--shadow)); }
  .pointer path { fill: var(--ember); stroke: var(--void); stroke-width: 2; }
  .pointer.nudge { animation: nudge .12s ease-out; }
  .pointer.nudge2 { animation: nudge2 .12s ease-out; }
  @keyframes nudge { 40% { rotate: -14deg; } }
  @keyframes nudge2 { 40% { rotate: -14deg; } }

  .result { min-height: 76px; text-align: center; display: grid; gap: 8px; justify-items: center; }
  .result p { margin: 0; }
  .won { font: 700 30px/1.15 var(--f-display); color: var(--ink); animation: land .5s var(--spring) both; overflow-wrap: anywhere; }
  @keyframes land { from { opacity: 0; scale: .7; } }
  .ra { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

  .opts { display: grid; gap: 8px; }
  .oh { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .oh h3 { margin: 0; }
  .oh select { max-width: 150px; font-size: 13px; padding: 4px 8px; }
  textarea { resize: vertical; font: 13.5px/1.5 var(--f-mono) !important; width: 100%; box-sizing: border-box; }
  .hint { margin: 0; }
  .oa { display: flex; gap: 8px; flex-wrap: wrap; }

  @media (max-width: 900px) {
    .wheel-tool { grid-template-columns: minmax(0, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) {
    .won, .pointer { animation: none !important; }
  }
</style>
