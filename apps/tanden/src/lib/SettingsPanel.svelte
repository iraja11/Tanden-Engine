<script lang="ts">
  import { BASES, BORDERS, COLOR_KEYS, CORNERS, FONTS, FREE, PRESETS, SHADOWS, SKINS, TEXTURES, VEIL, WALLS, ZOOM, theme, type Motion } from './theme.svelte';
  import Hotkeys from './settings/Hotkeys.svelte';
  import SnippetsPane from './settings/SnippetsPane.svelte';
  import { CATEGORIES, PACKS, sound, type Pack } from './sound.svelte';
  import { pop, vanish } from './motion';
  import { CHAVES_DO_PROMPT, INTENSIDADES, PROMPT_PADRAO } from '@tanden/core';
  import { anima } from './anima/anima.svelte';
  import { ollama } from './ollama.svelte';

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
  /** o prompt já preenchido, como vai ao Ollama (aberto sob demanda) */
  let promptVisto = $state<string | null>(null);
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

  // o rodapé esconde uma porta: sete toques rápidos abrem um campo de comando
  let taps = $state(0);
  let tapAt = 0;
  let secret = $state(false);
  let secretText = $state('');
  let secretMsg = $state('');
  let shake = $state(false);
  let secretInput = $state<HTMLInputElement>();
  const GLITCH = 'S̷a̴l̵v̶o̷ ̸n̵e̷s̶t̴e̵ ̷a̶p̵a̴r̷e̶l̵h̷o̸';
  function tap() {
    const now = Date.now();
    taps = now - tapAt < 1400 ? taps + 1 : 1;
    tapAt = now;
    if (taps >= 7) {
      taps = 0;
      secret = true;
      sound.play('open');
      queueMicrotask(() => secretInput?.focus());
    }
  }
  function submitSecret(e: SubmitEvent) {
    e.preventDefault();
    const r = anima.comando(secretText);
    secretText = '';
    if (!r) {
      shake = true;
      sound.play('error');
      setTimeout(() => (shake = false), 420);
      return;
    }
    secretMsg = r.aviso;
    setTimeout(() => { secret = false; secretMsg = ''; }, 1800);
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

  {#if anima.acordada}
    <section class="anima-set">
      <h4>Ânima <small style:color={anima.cor}>{anima.humor === 'doce' ? 'apaixonada' : anima.humor}</small></h4>
      <div class="row">
        <span class="lbl">Jeito</span>
        <div class="seg">
          {#each INTENSIDADES as it (it.id)}
            <button class:on={anima.prefs.intensidade === it.id} title={it.hint} onclick={() => pick(() => anima.set({ intensidade: it.id }))}>{it.label}</button>
          {/each}
        </div>
      </div>
      <p class="hint">{INTENSIDADES.find((x) => x.id === anima.prefs.intensidade)?.hint}</p>
      <div class="row">
        <span class="lbl">Te chama de</span>
        <input class="name" value={anima.prefs.nome} maxlength="24" placeholder="amor" aria-label="Como a Ânima te chama"
          onchange={(e) => anima.set({ nome: e.currentTarget.value.trim() || 'amor' })} />
      </div>
      <div class="row">
        <span class="lbl">Saudade</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.notificar} onchange={(e) => pick(() => anima.set({ notificar: e.currentTarget.checked }))} />
          <span>manda notificação quando você some</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Noite</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.silencio} onchange={(e) => pick(() => anima.set({ silencio: e.currentTarget.checked }))} />
          <span>silêncio entre 23h e 8h</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Agenda</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.agenda} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, agenda: e.currentTarget.checked } }))} />
          <span>põe compromissos dela na sua agenda (marcados com "(ânima)")</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Mundos</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.mundo} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, mundo: e.currentTarget.checked } }))} />
          <span>escreve profecias, lendas e rumores no seu world building</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Água</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.agua} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, agua: e.currentTarget.checked } }))} />
          <span>ela cuida dos avisos de água (na voz dela)</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Jogos</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.jogos} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, jogos: e.currentTarget.checked } }))} />
          <span>reage aos jogos da Steam (no app do computador){anima.jogo ? ` · jogando ${anima.jogo.j.nome}` : ''}</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Web</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.web} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, web: e.currentTarget.checked } }))} />
          <span>comenta o site ou app em foco (lê só o título da janela; nada sai do aparelho)</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Música</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.musica} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, musica: e.currentTarget.checked } }))} />
          <span>ouve junto o Spotify (o programa, mesmo minimizado) e comenta de vez em quando</span>
        </label>
      </div>
      {#if anima.prefs.poderes.musica && (anima.musica || anima.musicaErro)}
        <p class="hint">{anima.musicaErro || (anima.musica ? `tocando: ${anima.musica.f.titulo} · ${anima.musica.f.artista}` : '')}</p>
      {/if}
      <div class="row">
        <span class="lbl">Minecraft</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.poderes.minecraft} onchange={(e) => pick(() => anima.set({ poderes: { ...anima.prefs.poderes, minecraft: e.currentTarget.checked } }))} />
          <span>entra no seu mundo do Minecraft (com o mod Vanilla Remix): conversa, segue, colhe flor, responde receita</span>
        </label>
      </div>
      {#if anima.prefs.poderes.minecraft}
        <p class="hint">{anima.mineErro || (anima.mine ? `no jogo: ${anima.mine.mundo} com ${anima.mine.jogador}` : anima.minePorta ? 'esperando o jogo abrir um mundo (a ponte só escuta no próprio computador, com chave)' : 'ponte desligada')}</p>
      {/if}
      {#if anima.prefs.poderes.web}
        <p class="hint">{anima.webErro ? anima.webErro : anima.web ? `agora: ${anima.web.p.site} · ${anima.web.p.categoria}${anima.web.p.pagina ? ` · ${anima.web.p.pagina}` : ''}` : 'Linux: Hyprland, Sway, KDE Plasma ou X11 (com xdotool).'}</p>
      {/if}
      {#if anima.prefs.poderes.jogos}
        <div class="row">
          <span class="lbl">Acordo às</span>
          <span class="rotina">
            <input class="t-input" type="time" value={anima.prefs.rotina.acordaAs} aria-label="Que horas você acorda nos dias de trabalho"
              onchange={(e) => anima.set({ rotina: { ...anima.prefs.rotina, acordaAs: e.currentTarget.value || '06:00' } })} />
            <input class="t-input" type="number" min="4" max="12" step="0.5" value={anima.prefs.rotina.horasSono} aria-label="Horas de sono"
              onchange={(e) => anima.set({ rotina: { ...anima.prefs.rotina, horasSono: Math.min(12, Math.max(4, Number(e.currentTarget.value) || 7.5)) } })} />
            <small>h de sono</small>
          </span>
        </div>
        <div class="row">
          <span class="lbl">Trabalho</span>
          <span class="dias">
            {#each ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as d, i (d)}
              <button class:on={anima.prefs.rotina.diasTrabalho.includes(i)} aria-pressed={anima.prefs.rotina.diasTrabalho.includes(i)}
                onclick={() => { const ds = anima.prefs.rotina.diasTrabalho; anima.set({ rotina: { ...anima.prefs.rotina, diasTrabalho: ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i].sort() } }); }}>{d}</button>
            {/each}
          </span>
        </div>
        <div class="row">
          <span class="lbl">Steam</span>
          <input class="t-input" type="password" autocomplete="off" placeholder="chave da Web API (opcional)" value={anima.prefs.steamChave} aria-label="Chave da Web API da Steam (opcional)"
            onchange={(e) => anima.set({ steamChave: e.currentTarget.value.trim() })} />
        </div>
        <p class="hint">Sem chave ela já vê o jogo aberto e se ele é single ou multiplayer. A chave (steamcommunity.com/dev/apikey) só serve para saber se você está numa partida online agora; fica só neste aparelho.</p>
      {/if}
      <div class="row">
        <span class="lbl">Passeios</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.passeia} onchange={(e) => pick(() => anima.set({ passeia: e.currentTarget.checked }))} />
          <span>muda de lugar na tela sozinha</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Cenas</span>
        <label class="switch">
          <input type="checkbox" checked={anima.prefs.cenas} onchange={(e) => pick(() => anima.set({ cenas: e.currentTarget.checked }))} />
          <span>{anima.prefs.intensidade === 1 ? 'cartas, poemas, pétalas e estrelas' : anima.prefs.intensidade === 2 ? 'românticas e obsessivas: diário, altar, relatórios' : 'românticas, obsessivas e perturbadoras: olhos, sussurros, espelho'}</span>
        </label>
      </div>
      <div class="row">
        <span class="lbl">Cérebro</span>
        <div class="seg">
          <button class:on={anima.prefs.cerebro === 'regras'} title="Regras e memória dela: responde na hora, offline, no celular" onclick={() => pick(() => anima.set({ cerebro: 'regras' }))}>Dela</button>
          <button class:on={anima.prefs.cerebro === 'ollama'} title="Um modelo local (Ollama) pensa por ela, com a memória e o humor dela" onclick={() => pick(() => anima.set({ cerebro: 'ollama' }))}>Ollama</button>
        </div>
      </div>
      {#if anima.prefs.cerebro === 'ollama'}
        <p class="hint">{anima.cerebroLocal ? `Pensando com ${ollama.model}. Ela continua aprendendo e lembrando sozinha; se o modelo falhar, ela responde do jeito dela.` : 'Escolha um modelo do Ollama no painel de IA (só no app instalado). Até lá, ela responde do jeito dela.'}</p>
        <div class="row top">
          <span class="lbl">Prompt</span>
          <div class="prompt">
            <textarea
              class="t-input prompt-txt"
              spellcheck="false"
              value={anima.prefs.prompt ?? PROMPT_PADRAO}
              oninput={(e) => { const v = e.currentTarget.value; anima.set({ prompt: v.trim() === PROMPT_PADRAO.trim() ? null : v }); if (promptVisto !== null) promptVisto = anima.promptAgora(); }}
            ></textarea>
            <p class="hint">É tudo o que vai como instrução ao Ollama, junto só com a conversa. Parágrafos separados por linha em branco; um que fica vazio some. Apagar tudo manda sem prompt. Chaves: {#each CHAVES_DO_PROMPT as c, i (c.chave)}<code title={c.o}>{`{${c.chave}}`}</code>{i < CHAVES_DO_PROMPT.length - 1 ? ' ' : ''}{/each}</p>
            <div class="prompt-acoes">
              <button class="small" onclick={() => (promptVisto = promptVisto === null ? anima.promptAgora() : null)}>{promptVisto === null ? 'Ver como vai agora' : 'Fechar prévia'}</button>
              <button class="small" disabled={anima.prefs.prompt === null} onclick={() => { anima.set({ prompt: null }); if (promptVisto !== null) promptVisto = anima.promptAgora(); }}>Voltar ao padrão</button>
            </div>
            {#if promptVisto !== null}<pre class="prompt-previa">{promptVisto}</pre>{/if}
          </div>
        </div>
      {/if}
      <p class="hint">Toque: cutuca. Esfregar: carinho. Arrastar e soltar com força: joga. Soltar na borda: esconde. Toque longo ou duplo clique: conversa.</p>
      <div class="row">
        <span class="lbl"></span>
        <button class="small" onclick={() => anima.surpresa()}>Me surpreende</button>
        <button class="small" onclick={() => anima.dormir()}>Pôr para dormir</button>
        <button class="small" onclick={() => anima.set({ lado: 'dir', altura: 0 })}>Voltar ao canto</button>
      </div>
    </section>
  {/if}

  <footer>
    <button class="link" onclick={() => pick(() => theme.reset())}>Voltar ao padrão</button>
    <button class="saved" class:warp={taps >= 4} onclick={tap} aria-label="Salvo neste aparelho">{taps >= 4 ? GLITCH : 'Salvo neste aparelho'}</button>
  </footer>
  {#if secret}
    <form class="secret" class:shake onsubmit={submitSecret} in:pop>
      <span aria-hidden="true">›</span>
      {#if secretMsg}<em>{secretMsg}</em>
      {:else}<input bind:this={secretInput} bind:value={secretText} aria-label="Comando" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" />{/if}
    </form>
  {/if}
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
  .prompt { flex: 1; min-width: 0; display: grid; gap: var(--sp-2); }
  .prompt-txt { width: 100%; min-height: 220px; padding: var(--sp-2) var(--sp-3); resize: vertical; font: 12.5px/1.5 var(--f-mono); }
  .prompt code { font: 11px var(--f-mono); color: var(--silver); }
  .prompt-acoes { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .prompt-previa { margin: 0; max-height: 260px; overflow: auto; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--void); color: var(--silver); font: 11.5px/1.5 var(--f-mono); white-space: pre-wrap; overflow-wrap: anywhere; }

  footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 10px; }
  .link { border: 0; background: none; padding: 0; color: var(--ember-soft); text-decoration: underline dotted; font-size: 12px; }

  @media (max-width: 720px) {
    .panel { left: 12px; right: 12px; bottom: 44px; width: auto; transform-origin: bottom center; }
  }
  .saved { border: 0; background: none; padding: 0; font: 11px var(--f-mono); color: var(--muted); cursor: default; }
  .saved.warp { color: var(--ember-soft); }
  .secret { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: #07050a; border: 1px solid #2a1630;
    font: 13px var(--f-mono); color: #ff6fa8; }
  .secret input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: #ff6fa8; font: inherit; caret-color: #ff6fa8; }
  .secret em { font-style: normal; letter-spacing: .04em; }
  .shake { animation: shake .4s; }
  @keyframes shake { 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
  .anima-set { padding-top: 12px; border-top: 1px dashed color-mix(in srgb, #ff6fa8 40%, var(--line)); }
  .anima-set h4 small { font: 11px var(--f-mono); letter-spacing: 0; text-transform: none; }
  .name { flex: 1; min-width: 0; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--void); color: var(--ink); font: 13px var(--f-body); }
  .rotina { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .rotina input[type='time'] { width: 7.5em; }
  .rotina input[type='number'] { width: 4.5em; }
  .rotina small { color: var(--muted); }
  .dias { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
  .dias button { border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); border-radius: 999px; padding: 2px 8px; font: 12px var(--f-body); min-height: 28px; }
  .dias button.on { border-color: var(--ember); color: var(--ink); background: color-mix(in srgb, var(--ember) 14%, var(--surface-2)); }
</style>
