<script lang="ts">
  import { BASES, BORDERS, COLOR_KEYS, CORNERS, FONTS, FREE, PRESETS, SHADOWS, SKINS, TEXTURES, VEIL, WALLS, ZOOM, theme, type Motion } from './theme.svelte';
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

  // cores livres abertas mesmo antes de mexer numa
  let free = $state(false);
  let wallInput = $state<HTMLInputElement>();
  let wallMsg = $state('');
  async function pickWall(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const kept = await theme.setWallpaper(file);
      wallMsg = kept ? '' : 'A imagem é grande demais para guardar neste aparelho: vale só até fechar o app.';
      sound.play('complete');
    } catch {
      wallMsg = 'Não consegui abrir essa imagem.';
    }
  }

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
    <h4>Estilo {#if theme.tweaked}<button class="link mini" onclick={() => pick(() => theme.resetSkin())}>desfazer ajustes</button>{/if}</h4>
    <div class="skins">
      {#each SKINS as s (s.id)}
        <button class="skin" class:on={theme.skin === s.id} data-k={s.id} title={s.hint} onclick={(e) => pick(() => theme.useSkin(s.id, at(e)))}>
          <span class="mini" aria-hidden="true"><i class="bar"></i><i class="win"><b></b><b></b><b></b></i></span>
          <strong>{s.label}</strong>
          <small>{s.hint}</small>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h4>Cores</h4>
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

    <div class="row top">
      <span class="lbl">Fundo</span>
      <div class="seg">
        {#each BASES as b (b.id)}
          <button class:on={theme.base === b.id} onclick={(e) => pick(() => theme.set({ base: b.id }, at(e)))}
            style:--sw={b.void} style:--sl={b.line} title={b.dark ? 'escuro' : 'claro'}>
            <span class="dot"></span>{b.label}
          </button>
        {/each}
        <button class:on={theme.base === FREE} onclick={() => pick(() => (free = !free))} title="montar as cores à mão">
          <span class="dot rainbow"></span>Livre
        </button>
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

    {#if free || theme.base === FREE}
      <div class="colors">
        {#each COLOR_KEYS as c (c.id)}
          <label class="sw">
            <input type="color" value={theme.current[c.id]} aria-label={c.label}
              oninput={(e) => theme.setColor(c.id, e.currentTarget.value)} />
            <span>{c.label}</span>
          </label>
        {/each}
      </div>
      <p class="hint">Mexer numa cor parte do fundo atual e vira o fundo <b>Livre</b>.</p>
    {/if}
  </section>

  <section>
    <h4>Forma</h4>
    <div class="row">
      <span class="lbl">Cantos</span>
      <div class="seg">
        {#each CORNERS as c (c.id)}
          <button class:on={theme.corners === c.id} title={c.hint} onclick={() => pick(() => theme.set({ corners: c.id }))}>{c.label}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="lbl">Bordas</span>
      <div class="seg">
        {#each BORDERS as c (c.id)}
          <button class:on={theme.borders === c.id} onclick={() => pick(() => theme.set({ borders: c.id }))}>{c.label}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="lbl">Sombras</span>
      <div class="seg">
        {#each SHADOWS as c (c.id)}
          <button class:on={theme.shadows === c.id} title={c.hint} onclick={() => pick(() => theme.set({ shadows: c.id }))}>{c.label}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="lbl">Brilho</span>
      <label class="switch">
        <input type="checkbox" checked={theme.glow} onchange={(e) => pick(() => theme.set({ glow: e.currentTarget.checked }))} />
        <span>halo nos destaques {#if theme.skin === 'terminal'}e no fósforo{/if}</span>
      </label>
    </div>
    <div class="row">
      <span class="lbl">Vidro</span>
      <label class="switch">
        <input type="checkbox" checked={theme.glass} onchange={(e) => pick(() => theme.set({ glass: e.currentTarget.checked }))} />
        <span>painéis translúcidos e desfocados</span>
      </label>
    </div>
  </section>

  <section>
    <h4>Fundo da tela</h4>
    <div class="row">
      <span class="lbl">Textura</span>
      <div class="seg">
        {#each TEXTURES as c (c.id)}
          <button class:on={theme.texture === c.id} onclick={() => pick(() => theme.set({ texture: c.id }))}>{c.label}</button>
        {/each}
      </div>
    </div>
    <div class="row">
      <span class="lbl">Parede</span>
      <div class="seg">
        {#each WALLS as c (c.id)}
          <button class:on={theme.wall === c.id}
            onclick={() => pick(() => (c.id === 'imagem' && !theme.wallImage ? wallInput?.click() : theme.set({ wall: c.id })))}>{c.label}</button>
        {/each}
      </div>
    </div>
    {#if theme.wall === 'imagem' && theme.wallImage}
      <div class="row">
        <span class="lbl"></span>
        <span class="thumb" style:background-image="url({theme.wallImage})"></span>
        <button class="small" onclick={() => wallInput?.click()}>Trocar</button>
        <button class="small" onclick={() => pick(() => theme.clearWallpaper())}>Tirar</button>
      </div>
    {/if}
    {#if theme.wall !== 'liso'}
      <div class="row">
        <span class="lbl">Véu</span>
        <input class="range" type="range" min={VEIL.min} max={VEIL.max} step="0.05" value={theme.veil} aria-label="Quanto o fundo cobre a imagem"
          oninput={(e) => theme.set({ veil: +e.currentTarget.value })} />
        <code class="pct">{Math.round(theme.veil * 100)}%</code>
      </div>
    {/if}
    {#if wallMsg}<p class="hint">{wallMsg}</p>{/if}
    <input bind:this={wallInput} type="file" accept="image/*" hidden onchange={pickWall} />
  </section>

  <section>
    <h4>Texto</h4>
    <div class="row top">
      <span class="lbl">Letra</span>
      <div class="seg">
        {#each FONTS as f (f.id)}
          <button class:on={theme.font === f.id} style:font-family={f.css} onclick={() => pick(() => theme.set({ font: f.id }))}>{f.label}</button>
        {/each}
      </div>
    </div>
    <div class="row top">
      <span class="lbl">Títulos</span>
      <div class="seg">
        {#each FONTS as f (f.id)}
          <button class:on={theme.display === f.id} style:font-family={f.css} onclick={() => pick(() => theme.set({ display: f.id }))}>{f.label}</button>
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
  .panel { position: absolute; left: 88px; bottom: 40px; z-index: 20; width: min(440px, calc(100vw - 24px)); max-height: calc(100% - 60px);
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
  .row.top { align-items: flex-start; }
  .row.top .lbl { padding-top: 6px; }

  /* estilos: cada cartão é uma janelinha desenhada no jeito do estilo, com cores fixas */
  .skins { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: 8px; }
  .skin { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: auto 1fr; column-gap: 10px; row-gap: 2px; align-items: start;
    padding: 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); color: var(--ink); text-align: left;
    transition: border-color var(--dur), transform var(--dur) var(--spring); }
  .skin:hover { border-color: var(--muted); }
  .skin:active { transform: scale(.97); }
  .skin.on { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember), 0 0 18px -6px var(--ember-glow); }
  .skin strong { font: 600 13px/1.2 var(--f-display); }
  .skin small { grid-column: 2; font-size: 11px; line-height: 1.3; color: var(--muted); }
  .mini { grid-row: span 2; position: relative; width: 64px; height: 48px; overflow: hidden; display: flex; }
  .mini i { display: block; font-style: normal; }
  .mini .bar { width: 12px; }
  .mini .win { flex: 1; display: grid; align-content: start; gap: 4px; padding: 6px 5px; }
  .mini .win b { display: block; height: 4px; }
  .mini .win b:nth-child(2) { width: 70%; }
  .mini .win b:nth-child(3) { width: 45%; height: 7px; margin-top: 2px; }

  .skin[data-k='tanden'] .mini { background: #0c0c0e; border-radius: 8px; border: 1px solid #2b2a31; }
  .skin[data-k='tanden'] .bar { border-right: 1px solid #2b2a31; background: linear-gradient(#ff8a3d 0 0) 3px 8px / 6px 6px no-repeat; }
  .skin[data-k='tanden'] .win b { background: #2b2a31; border-radius: 3px; }
  .skin[data-k='tanden'] .win b:nth-child(3) { background: #ff8a3d; box-shadow: 0 0 8px #ff8a3d88; border-radius: 4px; }

  .skin[data-k='aero'] .mini { border-radius: 5px; padding: 3px; gap: 3px; border: 1px solid #1a3d6e;
    background: radial-gradient(80% 60% at 20% 0%, #7cc4ff, transparent 60%), linear-gradient(160deg, #1d5fae, #0a2f63); }
  .skin[data-k='aero'] .bar { width: 9px; border-radius: 2px; background: linear-gradient(rgba(255,255,255,.55), rgba(255,255,255,.15)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.5); }
  .skin[data-k='aero'] .win { background: #fff; border-radius: 3px; border: 1px solid #00000088; padding: 4px; }
  .skin[data-k='aero'] .win b { background: #c9d6e6; border-radius: 1px; }
  .skin[data-k='aero'] .win b:nth-child(3) { border: 1px solid #3c7fb1; border-radius: 2px; height: 8px;
    background: linear-gradient(#eaf6fd 0 49%, #bee6fd 50% 100%); }

  .skin[data-k='terminal'] .mini { background: #020803; border: 3px double #6dff8f; }
  .skin[data-k='terminal'] .mini::after { content: ''; position: absolute; inset: 0;
    background: repeating-linear-gradient(transparent 0 2px, #0006 2px 3px); }
  .skin[data-k='terminal'] .bar { width: 8px; border-right: 1px solid #14522a; }
  .skin[data-k='terminal'] .win b { background: #6dff8f; box-shadow: 0 0 4px #6dff8f; height: 3px; }
  .skin[data-k='terminal'] .win b:nth-child(3) { width: 5px; height: 7px; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }

  .skin[data-k='papel'] .mini { background: #e9e2d0; padding: 4px 6px 6px 3px; }
  .skin[data-k='papel'] .bar { width: 8px; background: linear-gradient(#fde76a 0 0) 0 6px / 8px 5px no-repeat; }
  .skin[data-k='papel'] .win { background: #fffdf7 repeating-linear-gradient(transparent 0 6px, #4a7fc433 6px 7px); border: 1.5px solid #3b352c;
    border-radius: 9px 3px 11px 2px / 3px 10px 2px 9px; box-shadow: 2px 2px 0 #3b352c; }
  .skin[data-k='papel'] .win b { background: #23201a; height: 2px; border-radius: 2px; }
  .skin[data-k='papel'] .win b:nth-child(3) { background: #2546b0; height: 6px; border-radius: 30px 5px 25px 5px / 5px 25px 5px 30px; }

  .colors { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; }
  .sw { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); cursor: pointer; }
  .sw input { flex: none; width: 28px; height: 22px; border: 1px solid var(--line); border-radius: 6px; background: none; padding: 1px; cursor: pointer; }
  .dot.rainbow { background: conic-gradient(#ff5e5e, #ffd25e, #5eff8a, #5ec8ff, #b45eff, #ff5e5e); box-shadow: none; }
  .thumb { width: 64px; height: 36px; border-radius: 6px; border: 1px solid var(--line); background: center / cover no-repeat; flex: none; }
  .small { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px; padding: 4px 10px; font-size: 12px; }
  .small:hover { border-color: var(--ember); }
  .link.mini { margin-left: auto; font: 11px var(--f-body); letter-spacing: 0; text-transform: none; }
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
