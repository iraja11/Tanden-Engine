<script lang="ts">
  import { BASES, FONTS, PRESETS, ZOOM, theme, type Motion } from './theme.svelte';
  import Hotkeys from './settings/Hotkeys.svelte';
  import SnippetsPane from './settings/SnippetsPane.svelte';
  import { CATEGORIES, PACKS, sound, type Pack } from './sound.svelte';
  import { pop, vanish } from './motion';

  // Aparência e sons. Tudo vale na hora e fica salvo neste aparelho.
  type Tab = 'aparencia' | 'atalhos' | 'snippets';
  let { onclose, tab = $bindable('aparencia') }: { onclose: () => void; tab?: Tab } = $props();
  const TABS: { id: Tab; label: string }[] = [
    { id: 'aparencia', label: 'Aparência' },
    { id: 'atalhos', label: 'Atalhos' },
    { id: 'snippets', label: 'Snippets CSS' },
  ];

  const at = (e: MouseEvent) => ({ x: e.clientX, y: e.clientY });
  const motions: { id: Motion; label: string; hint: string }[] = [
    { id: 'completo', label: 'Completo', hint: 'todas as transições e o símbolo girando' },
    { id: 'reduzido', label: 'Reduzido', hint: 'transições curtas, giro lento' },
    { id: 'parado', label: 'Parado', hint: 'nada se mexe; o estado aparece só em cor' },
  ];
  const presetBase = (id: string) => BASES.find((b) => b.id === id)!;

  function pick(fn: () => void) {
    fn();
    sound.play('tick');
  }

  function onkey(e: KeyboardEvent) {
    // gravando um atalho, o Esc é da gravação
    if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onclose(); }
  }
</script>

<svelte:window onkeydown={onkey} />

<div class="panel" role="dialog" aria-label="Aparência e sons" in:pop out:vanish>
  <header>
    <h3>Personalizar</h3>
    <button class="x" onclick={onclose} aria-label="Fechar">×</button>
  </header>
  <div class="tabs" role="tablist">
    {#each TABS as t (t.id)}
      <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => pick(() => (tab = t.id))}>{t.label}</button>
    {/each}
  </div>

  {#if tab === 'atalhos'}
    <Hotkeys />
  {:else if tab === 'snippets'}
    <SnippetsPane />
  {:else}

  <section>
    <h4>Tema</h4>
    <div class="presets">
      {#each PRESETS as p (p.id)}
        {@const b = presetBase(p.base)}
        <button class="preset" class:on={theme.preset === p.id} onclick={(e) => pick(() => theme.usePreset(p.id, at(e)))}
          style:--pv={b.void} style:--ps={b.surface} style:--pa={p.accent} style:--pi={b.ink}>
          <span class="chip"><i></i><i></i><i></i></span>
          {p.label}
        </button>
      {/each}
    </div>

    <div class="row">
      <span class="lbl">Fundo</span>
      <div class="seg">
        {#each BASES as b (b.id)}
          <button class:on={theme.base === b.id} onclick={(e) => pick(() => theme.set({ base: b.id }, at(e)))}
            style:--sw={b.void} style:--sl={b.line} title={b.dark ? 'escuro' : 'claro'}>
            <span class="dot"></span>{b.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <span class="lbl">Destaque</span>
      <div class="accent">
        <input type="color" value={theme.accent} aria-label="Cor de destaque"
          oninput={(e) => theme.set({ accent: e.currentTarget.value })} />
        <code>{theme.accent}</code>
        {#if theme.preset === 'custom'}<small>personalizado</small>{/if}
      </div>
    </div>

    <div class="row">
      <span class="lbl">Brilho</span>
      <label class="switch">
        <input type="checkbox" checked={theme.glow} onchange={(e) => pick(() => theme.set({ glow: e.currentTarget.checked }))} />
        <span>halo de energia nos destaques</span>
      </label>
    </div>
  </section>

  <section>
    <h4>Texto</h4>
    <div class="row">
      <span class="lbl">Letra</span>
      <div class="seg">
        {#each FONTS as f (f.id)}
          <button class:on={theme.font === f.id} style:font-family={f.css} onclick={() => pick(() => theme.set({ font: f.id }))}>{f.label}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="lbl">Tamanho</span>
      <input class="range" type="range" min={ZOOM.min} max={ZOOM.max} step={ZOOM.step} value={theme.zoom} aria-label="Tamanho da interface"
        onchange={(e) => pick(() => theme.set({ zoom: +e.currentTarget.value }))} />
      <code class="pct">{Math.round(theme.zoom * 100)}%</code>
    </div>
    <p class="hint">Ctrl+= e Ctrl+- também mudam o tamanho; Ctrl+0 volta a 100%.</p>
  </section>

  <section>
    <h4>Movimento</h4>
    <div class="seg wide">
      {#each motions as m (m.id)}
        <button class:on={theme.motion === m.id} title={m.hint} onclick={() => pick(() => theme.set({ motion: m.id }))}>{m.label}</button>
      {/each}
    </div>
    <p class="hint">{motions.find((m) => m.id === theme.motion)?.hint}</p>
  </section>

  <section>
    <h4>
      Sons
      <label class="switch inline">
        <input type="checkbox" checked={sound.on} onchange={(e) => { sound.set({ on: e.currentTarget.checked }); sound.play('open'); }} />
        <span>{sound.on ? 'ligados' : 'desligados'}</span>
      </label>
    </h4>
    <fieldset disabled={!sound.on}>
      <div class="row">
        <span class="lbl">Volume</span>
        <input class="range" type="range" min="0" max="1" step="0.05" value={sound.volume} aria-label="Volume"
          oninput={(e) => sound.set({ volume: +e.currentTarget.value })} onchange={() => sound.play('tick', { force: true })} />
      </div>
      <div class="packs">
        {#each PACKS as p (p.id)}
          <button class:on={sound.pack === p.id} title={p.hint}
            onclick={() => { sound.set({ pack: p.id as Pack }); sound.play('complete', { force: true }); }}>
            <b>{p.label}</b><small>{p.hint}</small>
          </button>
        {/each}
      </div>
      <div class="cats">
        {#each CATEGORIES as c (c.id)}
          <label class="switch" title={c.hint}>
            <input type="checkbox" checked={sound.cats[c.id]} onchange={(e) => sound.setCategory(c.id, e.currentTarget.checked)} />
            <span><b>{c.label}</b> <small>{c.hint}</small></span>
          </label>
        {/each}
      </div>
      <div class="try">
        <span class="lbl">Ouvir</span>
        {#each [['tick', 'toque'], ['create', 'criar'], ['complete', 'concluir'], ['receive', 'chegou'], ['alert', 'lembrete'], ['boot', 'abertura']] as [n, l] (n)}
          <button onclick={() => sound.play(n as Parameters<typeof sound.play>[0], { force: true })}>{l}</button>
        {/each}
      </div>
    </fieldset>
  </section>

  <footer>
    <button class="link" onclick={() => pick(() => theme.reset())}>Voltar ao padrão</button>
    <small>Salvo neste aparelho</small>
  </footer>
  {/if}
</div>

<style>
  .panel { position: absolute; left: 88px; bottom: 40px; z-index: 20; width: min(400px, calc(100vw - 24px)); max-height: calc(100% - 60px);
    overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 16px 12px;
    box-shadow: 0 24px 60px -20px var(--shadow), 0 0 0 1px var(--ember-glow); display: grid; gap: 16px; transform-origin: bottom left; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; font: 600 12px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--ember); }
  h4 { margin: 0 0 8px; display: flex; align-items: center; gap: 10px; font: 600 10.5px/1 var(--f-display); letter-spacing: .14em;
    text-transform: uppercase; color: var(--muted); }
  .x { border: 0; background: none; font-size: 20px; color: var(--muted); }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-top: -6px; }
  .tabs button { border: 0; background: none; padding: 7px 10px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted);
    border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color var(--dur), border-color var(--dur); }
  .tabs button.on { color: var(--ember); border-color: var(--ember); }
  .pct { font: 11px var(--f-mono); color: var(--muted); min-width: 38px; text-align: right; }
  section { display: grid; gap: 10px; }
  fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 10px; transition: opacity var(--dur); }
  fieldset:disabled { opacity: .4; }

  .presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
  .preset { display: grid; gap: 6px; justify-items: start; padding: 8px; border-radius: 11px; border: 1px solid var(--line);
    background: var(--surface-2); font: 600 11px/1 var(--f-display); letter-spacing: .06em; color: var(--ink);
    transition: border-color var(--dur), transform var(--dur) var(--spring); }
  .preset:hover { border-color: var(--muted); }
  .preset:active { transform: scale(.96); }
  .preset.on { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember), 0 0 18px -6px var(--ember-glow); }
  .chip { display: flex; width: 100%; height: 22px; border-radius: 6px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--pi) 15%, transparent); }
  .chip i { flex: 1; }
  .chip i:nth-child(1) { background: var(--pv); }
  .chip i:nth-child(2) { background: var(--ps); }
  .chip i:nth-child(3) { background: var(--pa); flex: .6; }

  .row { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .lbl { flex: none; width: 66px; font: 11px var(--f-mono); color: var(--muted); }
  .seg { display: flex; flex-wrap: wrap; gap: 4px; }
  .seg.wide button { flex: 1; }
  .seg button { display: flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--muted);
    border-radius: 9px; padding: 5px 9px; font-size: 12px; transition: color var(--dur), border-color var(--dur); }
  .seg button:hover { color: var(--ink); }
  .seg button.on { color: var(--ember); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 9%, var(--surface-2)); }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--sw); box-shadow: 0 0 0 1px var(--sl); }
  .accent { display: flex; align-items: center; gap: 8px; }
  .accent input { width: 34px; height: 26px; border: 1px solid var(--line); border-radius: 8px; background: none; padding: 1px; cursor: pointer; }
  .accent code { font: 12px var(--f-mono); color: var(--ink); }
  .accent small { color: var(--ember-soft); font-size: 11px; }

  .switch { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink); cursor: pointer; }
  .switch small { color: var(--muted); }
  .switch.inline { margin-left: auto; text-transform: none; letter-spacing: 0; font: 12px var(--f-body); color: var(--muted); }
  .switch input { appearance: none; flex: none; width: 30px; height: 17px; border-radius: 9px; background: var(--line); position: relative;
    margin: 0; cursor: pointer; transition: background var(--dur); }
  .switch input::after { content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%;
    background: var(--ink); transition: transform var(--dur) var(--spring); }
  .switch input:checked { background: var(--ember); }
  .switch input:checked::after { transform: translateX(13px); background: var(--on-ember); }

  .range { flex: 1; accent-color: var(--ember); }
  .packs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .packs button { display: grid; gap: 3px; text-align: left; padding: 8px 9px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--surface-2); color: var(--ink); }
  .packs button.on { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember); }
  .packs b { font: 600 11.5px/1.1 var(--f-display); letter-spacing: .05em; }
  .packs small { font-size: 10.5px; color: var(--muted); line-height: 1.25; }
  .cats { display: grid; gap: 7px; }
  .try { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .try button { border: 1px solid var(--line); background: none; color: var(--muted); border-radius: 8px; padding: 3px 8px; font: 11px var(--f-mono); }
  .try button:hover { color: var(--ember); border-color: var(--ember); }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }

  footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 10px; }
  footer small { font: 11px var(--f-mono); color: var(--muted); }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); text-decoration: underline dotted; font-size: 12px; }

  @media (max-width: 720px) {
    .panel { left: 12px; right: 12px; bottom: 44px; width: auto; transform-origin: bottom center; }
  }
</style>
