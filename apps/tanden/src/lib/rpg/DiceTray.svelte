<script lang="ts">
  import { checkRoll, chanceAtLeast, getSection, parseTable, rollStats, type RollStats } from '@tanden/core';
  import { mesa, type LogEntry } from './mesa.svelte';

  let { autofocus = false }: { autofocus?: boolean } = $props();

  const DICE = [4, 6, 8, 10, 12, 20, 100];
  let formula = $state('');
  let mode = $state<'normal' | 'vantagem' | 'desvantagem'>('normal');
  let input = $state<HTMLInputElement>();
  let target = $state('');

  $effect(() => { if (autofocus) input?.focus(); });

  /** fórmula que vai rolar de fato (com vantagem/desvantagem) */
  const full = $derived(formula.trim() && mode !== 'normal' && /(^|[^\d])1?d20(?![\d])/i.test(formula) ? `${formula.trim()} ${mode}` : formula.trim());
  const error = $derived(full ? checkRoll(full) : null);
  const stats = $derived.by((): RollStats | null => {
    if (!full || error || /@/.test(full)) return null;
    try {
      return rollStats(full, { samples: 6000 });
    } catch {
      return null;
    }
  });
  const peak = $derived(stats ? Math.max(...stats.dist.map((d) => d.p)) : 0);
  // poucos valores: barras; muitos: agrupa
  const bars = $derived.by(() => {
    if (!stats) return [];
    const d = stats.dist;
    if (d.length <= 40) return d.map((x) => ({ from: x.value, to: x.value, p: x.p }));
    const n = Math.ceil(d.length / 40);
    const out: Array<{ from: number; to: number; p: number }> = [];
    for (let i = 0; i < d.length; i += n) {
      const chunk = d.slice(i, i + n);
      out.push({ from: chunk[0]!.value, to: chunk.at(-1)!.value, p: chunk.reduce((a, x) => a + x.p, 0) });
    }
    return out;
  });
  const barPeak = $derived(Math.max(0, ...bars.map((b) => b.p)));
  const chance = $derived(stats && target.trim() !== '' && Number.isFinite(Number(target)) ? chanceAtLeast(stats, Number(target)) : null);
  const pct = (p: number) => `${(p * 100).toLocaleString('pt-BR', { maximumFractionDigits: p < 0.1 ? 1 : 0 })}%`;
  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

  /** clicar num dado soma um dele na fórmula ("d6" → "2d6" → "2d6+1d8") */
  function addDie(sides: number) {
    const tag = sides === 100 ? 'd100' : `d${sides}`;
    const f = formula.replace(/\s+/g, '');
    const re = new RegExp(`(^|[+\\-])(\\d*)${tag}(?![\\d!a-z<>=])`, 'i');
    const m = re.exec(f);
    if (m) {
      const n = (m[2] ? Number(m[2]) : 1) + 1;
      formula = f.slice(0, m.index) + m[1] + `${n}${tag}` + f.slice(m.index + m[0].length);
    } else {
      // dados antes do modificador: "1d20+5" + d6 → "1d20+1d6+5"
      const mod = /([+-]\d+)$/.exec(f);
      formula = mod ? `${f.slice(0, mod.index)}+1${tag}${mod[1]}` : f ? `${f}+1${tag}` : `1${tag}`;
    }
    input?.focus();
  }

  function addMod(delta: number) {
    const f = formula.replace(/\s+/g, '');
    const m = /([+-]\d+)$/.exec(f);
    const cur = m && /d/i.test(f.slice(0, m.index)) ? Number(m[1]) : 0;
    const base = m && /d/i.test(f.slice(0, m.index)) ? f.slice(0, m.index) : f;
    const next = cur + delta;
    formula = `${base || '1d20'}${next === 0 ? '' : next > 0 ? `+${next}` : next}`;
  }

  function go(f = full) {
    if (!f.trim()) {
      input?.focus();
      return;
    }
    mesa.roll(f);
  }

  function quick(f: string) {
    formula = f.replace(/\s+(vantagem|desvantagem)$/i, '');
    go(f);
  }

  // favoritos da campanha: tabela "## Rolagens" da nota da campanha
  const favorites = $derived.by(() => {
    void mesa.rev;
    const c = mesa.campaign;
    if (!c) return [];
    const sec = getSection(mesa.read(c.path), 'Rolagens');
    const t = sec ? parseTable(sec) : null;
    return t ? t.rows.filter((r) => r[0] && r[1]).map((r) => ({ name: r[0]!, formula: r[1]! })) : [];
  });

  // animação: números embaralhando antes de assentar
  let shown = $state<LogEntry[] | null>(null);
  let spinning = $state(false);
  let scramble = $state<number[]>([]);
  let lastSeq = 0;
  $effect(() => {
    const l = mesa.last;
    if (!l || l.seq === lastSeq) return;
    lastSeq = l.seq;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    shown = l.entries;
    if (reduce) return;
    spinning = true;
    let n = 0;
    const tick = setInterval(() => {
      scramble = l.entries.map((e) => (typeof e.total === 'number' ? Math.round(e.total + (Math.random() - 0.5) * Math.max(6, Math.abs(e.total))) : 0));
      if (++n > 7) {
        clearInterval(tick);
        spinning = false;
      }
    }, 45);
    return () => clearInterval(tick);
  });

  const faceText = (v: number, sides: number) => (sides === 0 ? (v > 0 ? '+' : v < 0 ? '−' : '0') : String(v));
  /** a conta sem os dados abertos: "1d20 + 5" */
  const plainOps = (detail: string) => detail.replace(/\s*\[[^\]]*\]/g, '');
</script>

<div class="tray">
  <form class="entry" onsubmit={(e) => { e.preventDefault(); go(); }}>
    <input bind:this={input} class="field mono" class:bad={!!error} bind:value={formula} placeholder="1d20+5, 4d6dl1, 2d6!, 8d10>=7…" spellcheck="false"
      autocomplete="off" aria-label="Fórmula" aria-invalid={!!error} />
    <button class="primary go" disabled={!!error}>Rolar</button>
  </form>

  <div class="pad">
    {#each DICE as d (d)}
      <button class="roll-btn die" onclick={() => addDie(d)} title={`Somar um d${d} à fórmula`}><svg viewBox="0 0 24 24" aria-hidden="true">
        {#if d === 4}<path d="M12 3 21 19H3Z" />{:else if d === 6}<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />{:else if d === 8}<path d="M12 2.5 20.5 12 12 21.5 3.5 12Z" />{:else if d === 10}<path d="M12 2.5 20.5 10 12 21.5 3.5 10Z" />{:else if d === 12}<path d="M12 2.5 20.5 8.7 17.3 19H6.7L3.5 8.7Z" />{:else}<path d="M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3Z" />{/if}
      </svg><span>d{d}</span></button>
    {/each}
    <button class="roll-btn mod" onclick={() => addMod(1)} title="Somar 1 ao modificador">+1</button>
    <button class="roll-btn mod" onclick={() => addMod(-1)} title="Tirar 1 do modificador">−1</button>
    <button class="roll-btn mod" onclick={() => { formula = ''; input?.focus(); }} title="Limpar a fórmula">Limpar</button>
  </div>

  <div class="modes" role="radiogroup" aria-label="Vantagem">
    {#each [['normal', 'Normal'], ['vantagem', 'Vantagem'], ['desvantagem', 'Desvantagem']] as [id, label] (id)}
      <button role="radio" aria-checked={mode === id} class:on={mode === id} onclick={() => (mode = id as typeof mode)}>{label}</button>
    {/each}
    <span class="dim small hint">{mode !== 'normal' && formula && !/(^|[^\d])1?d20(?![\d])/i.test(formula) ? 'Vale só para fórmulas com um d20.' : ''}</span>
  </div>

  {#if error && formula.trim()}
    <p class="err small">{error}</p>
  {:else if stats}
    <div class="stats">
      <div class="nums">
        <span><b>{fmt(stats.mean)}</b><small>média{stats.approx ? ' (simulada)' : ''}</small></span>
        <span><b>{fmt(stats.min)}–{fmt(stats.max)}</b><small>faixa</small></span>
        <label class="atleast"><small>chance de tirar</small><input class="field mono" bind:value={target} inputmode="numeric" placeholder="≥ ?" aria-label="Valor mínimo" />
          {#if chance !== null}<b>{pct(chance)}</b>{/if}</label>
      </div>
      <div class="dist" aria-hidden="true">
        {#each bars as b (b.from)}
          <i style:height="{Math.max(2, (b.p / (barPeak || peak || 1)) * 100)}%" class:hit={target !== '' && b.to >= Number(target)}
            title={`${b.from === b.to ? b.from : `${b.from}–${b.to}`}: ${pct(b.p)}`}></i>
        {/each}
      </div>
    </div>
  {/if}

  {#if shown}
    <div class="result" class:spin={spinning}>
      {#each shown as e, i (e.id)}
        <div class="res" class:crit={e.critical === 'max' && !spinning} class:fumble={e.critical === 'min' && !spinning}>
          <span class="total">{spinning && typeof e.total === 'number' ? scramble[i] ?? '' : e.total}</span>
          <span class="what">
            {#if e.label}<b>{e.label}</b>{/if}
            <span class="faces">
              {#each e.groups ?? [] as g, j (j)}
                <span class="grp" title={g.notation}>
                  {#each g.dice as d, k (k)}
                    <span class="face" class:drop={!d.kept} class:hit={d.success} class:boom={d.exploded} class:max={g.sides > 1 && d.value === g.sides && d.kept}
                      title={d.rerolled?.length ? `rolado de novo: ${d.rerolled.join(', ')}` : undefined}>{faceText(d.value, g.sides)}{#if d.rerolled?.length}<sup>↻</sup>{/if}</span>
                  {/each}
                </span>
              {/each}
              <span class="op">{plainOps(e.detail)}</span>
            </span>
            {#if e.critical === 'max' && !spinning}<em>Crítico!</em>{:else if e.critical === 'min' && !spinning}<em>Falha crítica</em>{/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if favorites.length}
    <h3>Rolagens da campanha</h3>
    <div class="chips">{#each favorites as f (f.name)}<button class="chip" onclick={() => quick(f.formula)} title={f.formula}>{f.name}</button>{/each}</div>
  {/if}
  <h3>Rápidas</h3>
  <div class="chips">
    {#each ['1d20', '1d20 vantagem', '1d20 desvantagem', '2d6', '1d100', '4d6dl1', '6x 4d6dl1', '4dF'] as f (f)}
      <button class="chip" onclick={() => quick(f)}>{f.replace(' vantagem', ' ▲').replace(' desvantagem', ' ▼')}</button>
    {/each}
  </div>
  {#if mesa.recent.length}
    <h3>Recentes</h3>
    <div class="chips">{#each mesa.recent as f (f)}<button class="chip" onclick={() => quick(f)}>{f}</button>{/each}</div>
  {/if}

  <details class="help">
    <summary>Como escrever fórmulas</summary>
    <ul class="small">
      <li><code>1d20+5</code> soma e modificador · <code>(1d6+2)*2</code> parênteses, × e ÷</li>
      <li><code>2d20kh1</code> mantém o maior (vantagem) · <code>2d20kl1</code> o menor · <code>4d6dl1</code> descarta o menor</li>
      <li><code>3d6!</code> explode no máximo · <code>2d6r1</code> rola de novo os 1 · <code>2d6ro&lt;2</code> só uma vez</li>
      <li><code>8d10&gt;=7</code> conta sucessos · <code>4dF</code> dados Fudge · <code>d%</code> percentual</li>
      <li><code>6x 4d6dl1</code> repete seis vezes · <code>1d20+5 # ataque</code> dá um nome</li>
      <li>Numa nota, escreva <code>`dice: 1d20+5`</code> para virar um botão de rolar (igual ao plugin Dice Roller do Obsidian). Numa ficha, vale <code>@des</code>, <code>@prof</code>, <code>@nível</code>.</li>
    </ul>
  </details>
</div>

<style>
  .tray { display: grid; gap: 12px; align-content: start; }
  .entry { display: flex; gap: 8px; }
  .entry input { flex: 1; font-size: 16px; padding: 10px 12px; }
  .go { padding: 0 20px; }
  .pad { display: flex; flex-wrap: wrap; gap: 6px; }
  .die { display: grid; justify-items: center; gap: 2px; width: 58px; padding: 8px 0 6px; }
  .die svg { width: 24px; height: 24px; fill: color-mix(in srgb, var(--ember) 14%, transparent); stroke: var(--ember); stroke-width: 1.4; stroke-linejoin: round; }
  .die span { font: 600 12px var(--f-mono); }
  .mod { padding: 0 12px; font: 600 12.5px var(--f-mono); }
  .modes { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .modes button { border: 1px solid var(--line); background: none; border-radius: 999px; padding: 4px 12px; font-size: 12.5px; color: var(--muted); }
  .modes button.on { border-color: var(--ember); color: var(--ink); background: color-mix(in srgb, var(--ember) 14%, transparent); }
  .hint { margin-left: 6px; }
  .err { color: var(--crit); margin: 0; }

  .stats { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: end; }
  .nums { display: flex; gap: 16px; align-items: end; flex-wrap: wrap; }
  .nums span, .atleast { display: grid; gap: 2px; }
  .nums b { font: 600 18px var(--f-mono); }
  .nums small, .atleast small { color: var(--muted); font-size: 11px; }
  .atleast { grid-template-columns: 64px auto; align-items: center; column-gap: 8px; }
  .atleast small { grid-column: 1 / -1; }
  .atleast input { padding: 3px 6px; font-size: 13px; }
  .atleast b { font: 600 15px var(--f-mono); color: var(--ember-soft); }
  .dist { height: 48px; display: flex; align-items: flex-end; gap: 1px; min-width: 0; }
  .dist i { flex: 1; min-width: 1px; background: color-mix(in srgb, var(--muted) 45%, transparent); border-radius: 2px 2px 0 0; transition: height var(--dur) var(--ease); }
  .dist i.hit { background: var(--ember); }

  .result { display: grid; gap: 8px; max-height: 340px; overflow-y: auto; padding: 4px 2px; }
  .res { display: flex; align-items: center; gap: 16px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface);
    animation: land .35s var(--spring); }
  .res.crit { border-color: var(--ember); box-shadow: 0 0 28px -8px var(--ember-glow), inset 0 0 0 1px var(--ember-glow); }
  .res.fumble { border-color: color-mix(in srgb, var(--crit) 60%, var(--line)); }
  .total { min-width: 64px; text-align: center; font: 700 34px/1 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; }
  .spin .total { color: var(--muted); }
  .res.crit .total { color: var(--ember); text-shadow: 0 0 18px var(--ember-glow); }
  .res.fumble .total { color: var(--crit); }
  .what { display: grid; gap: 4px; min-width: 0; }
  .what b { font: 600 13px var(--f-display); letter-spacing: .04em; }
  .what em { font: 600 11px var(--f-display); letter-spacing: .1em; text-transform: uppercase; font-style: normal; color: var(--ember); }
  .res.fumble em { color: var(--crit); }
  .faces { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font: 12.5px var(--f-mono); color: var(--muted); }
  .face { min-width: 24px; height: 24px; padding: 0 5px; display: inline-grid; place-items: center; border-radius: 7px; color: var(--ink);
    border: 1px solid var(--line); background: var(--surface-2); }
  .face.drop { opacity: .45; text-decoration: line-through; }
  .face.hit { border-color: var(--ok); color: var(--ok); }
  .face.max { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .face.boom { border-style: dashed; border-color: var(--ember); }
  .face sup { font-size: 9px; color: var(--ember-soft); margin-left: 1px; }
  .grp { display: inline-flex; flex-wrap: wrap; gap: 3px; }
  .grp + .grp { padding-left: 6px; border-left: 1px solid var(--line); }
  .op { margin-left: 4px; }
  @keyframes land { from { transform: translateY(6px) scale(.98); opacity: .3; } }

  .help summary { cursor: pointer; color: var(--muted); font-size: 12.5px; }
  .help ul { margin: 8px 0 0; padding-left: 18px; color: var(--muted); display: grid; gap: 4px; }

  @media (max-width: 720px) {
    .stats { grid-template-columns: 1fr; }
    .die { width: calc((100% - 18px) / 4); }
  }
</style>
