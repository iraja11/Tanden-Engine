<script lang="ts">
  import {
    PROFILES, arrows, fighterTemplate, frameNum, gameFolder, gameTemplate, importFrames, mergeFrames, punishers,
    readCombos, readFrames, readMatchups, safety, writeCombos, writeFrames, writeMatchups,
    type ComboRow, type FrameRow, type MatchupRow, type NotationId,
  } from '@tanden/core';
  import { cadernos } from './cadernos.svelte';
  import Notation from './Notation.svelte';
  import NotationInput from './NotationInput.svelte';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  type Tab = 'combos' | 'frames' | 'matchups' | 'punir';
  let gameName = $state<string | null>(null);
  let fighterPath = $state<string | null>(null);
  let tab = $state<Tab>('combos');
  let dialog = $state<null | 'game' | 'fighter' | 'import'>(null);
  let newName = $state('');
  let newNotation = $state<NotationId>('sf');
  let importText = $state('');
  let fileInput = $state<HTMLInputElement>();

  const games = $derived(cadernos.games);
  const game = $derived(games.find((g) => g.name === gameName) ?? games[0] ?? null);
  const profile = $derived(game?.profile ?? PROFILES.sf);
  const fighter = $derived(game?.fighters.find((f) => f.path === fighterPath) ?? null);
  const text = $derived.by(() => { void cadernos.rev; return fighter ? cadernos.read(fighter.path) : ''; });
  const combos = $derived(readCombos(text));
  const frames = $derived(readFrames(text));
  const matchups = $derived(readMatchups(text));

  // personagem apagada ou jogo trocado
  $effect(() => { if (fighterPath && game && !game.fighters.some((f) => f.path === fighterPath)) fighterPath = null; });

  function pickGame(name: string) { gameName = name; fighterPath = null; }
  function pickFighter(path: string) { fighterPath = path; tab = 'combos'; editing = null; }

  // ------------------------------------------------ criar
  const PRESETS: Array<{ name: string; notation: NotationId }> = [
    { name: 'SF5', notation: 'sf' }, { name: 'SF6', notation: 'sf' }, { name: 'Tekken 8', notation: 'tekken' }, { name: 'GG Strive', notation: 'gg' },
  ];

  function createGame(name = newName, notation = newNotation) {
    if (!name.trim()) return;
    const path = cadernos.create(`Luta/${name.trim()}`, name.trim(), (n) => gameTemplate(n, notation));
    dialog = null;
    newName = '';
    gameName = path.split('/').pop()!.replace(/\.md$/, '');
    fighterPath = null;
  }

  function createFighter() {
    if (!game || !newName.trim()) return;
    const path = cadernos.create(gameFolder(game), newName.trim(), (n) => fighterTemplate(n, game.name));
    dialog = null;
    newName = '';
    pickFighter(path);
  }

  // ------------------------------------------------ combos
  let editing = $state<null | { kind: 'combo' | 'frame' | 'matchup'; index: number }>(null);
  let comboDraft = $state<ComboRow>({ combo: '', dano: '', barra: '', situacao: '', notas: '' });
  let frameDraft = $state<FrameRow>(emptyFrame());
  let matchDraft = $state<MatchupRow>({ oponente: '', nivel: '', notas: '' });
  let situ = $state<string | null>(null);

  function emptyFrame(): FrameRow {
    return { golpe: '', comando: '', dano: '', startup: '', ativo: '', recuperacao: '', bloqueio: '', hit: '', notas: '' };
  }

  const situations = $derived([...new Set(combos.map((c) => c.situacao.trim()).filter(Boolean))]);
  const shownCombos = $derived(combos.map((c, i) => ({ c, i })).filter(({ c }) => !situ || c.situacao.trim() === situ));

  function editCombo(i: number) {
    comboDraft = i < 0 ? { combo: '', dano: '', barra: '', situacao: situ ?? '', notas: '' } : { ...combos[i]! };
    editing = { kind: 'combo', index: i };
  }
  function saveCombo() {
    if (!fighter || !comboDraft.combo.trim()) return;
    const at = editing!.index;
    cadernos.update(fighter.path, (t) => {
      const rows = readCombos(t);
      if (at < 0) rows.push({ ...comboDraft });
      else rows[at] = { ...comboDraft, _i: rows[at]?._i };
      return writeCombos(t, rows);
    });
    editing = null;
  }
  function moveRow<K extends 'combo' | 'frame' | 'matchup'>(kind: K, i: number, delta: number) {
    if (!fighter) return;
    cadernos.update(fighter.path, (t) => {
      const [read, write] = kind === 'combo' ? [readCombos, writeCombos] : kind === 'frame' ? [readFrames, writeFrames] : [readMatchups, writeMatchups];
      const rows = (read as (t: string) => Array<Record<string, string>>)(t);
      const j = i + delta;
      if (delta === 0) rows.splice(i, 1);
      else if (j >= 0 && j < rows.length) [rows[i], rows[j]] = [rows[j]!, rows[i]!];
      return (write as (t: string, r: Array<Record<string, string>>) => string)(t, rows);
    });
    editing = null;
  }
  async function copyCombo(c: ComboRow) {
    try { await navigator.clipboard.writeText(`${c.combo}\n${arrows(c.combo, profile)}`); cadernos.say('Combo copiado (texto e setas).'); }
    catch { cadernos.say('Não consegui copiar.'); }
  }

  // ------------------------------------------------ frame data
  type SortKey = 'golpe' | 'startup' | 'bloqueio' | 'dano';
  let sort = $state<{ key: SortKey; dir: 1 | -1 } | null>(null);
  let frameFilter = $state('');
  const shownFrames = $derived.by(() => {
    const q = frameFilter.trim().toLowerCase();
    let rows = frames.map((f, i) => ({ f, i })).filter(({ f }) => !q || `${f.golpe} ${f.comando} ${f.notas}`.toLowerCase().includes(q));
    if (sort) {
      const { key, dir } = sort;
      rows = [...rows].sort((a, b) => {
        if (key === 'golpe') return dir * a.f.golpe.localeCompare(b.f.golpe, 'pt-BR');
        const x = frameNum(a.f[key], key === 'bloqueio') ?? (dir > 0 ? Infinity : -Infinity);
        const y = frameNum(b.f[key], key === 'bloqueio') ?? (dir > 0 ? Infinity : -Infinity);
        return dir * (x - y);
      });
    }
    return rows;
  });
  function sortBy(key: SortKey) { sort = sort?.key === key ? (sort.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }; }
  const arrow = (key: SortKey) => (sort?.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  function editFrame(i: number) {
    frameDraft = i < 0 ? emptyFrame() : { ...frames[i]! };
    editing = { kind: 'frame', index: i };
  }
  function saveFrame() {
    if (!fighter || !(frameDraft.golpe.trim() || frameDraft.comando.trim())) return;
    const at = editing!.index;
    cadernos.update(fighter.path, (t) => {
      const rows = readFrames(t);
      if (at < 0) rows.push({ ...frameDraft });
      else rows[at] = { ...frameDraft, _i: rows[at]?._i };
      return writeFrames(t, rows);
    });
    editing = null;
  }

  async function onImportFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) importText = await f.text();
    (e.currentTarget as HTMLInputElement).value = '';
  }
  function runImport() {
    if (!fighter) return;
    const imp = importFrames(importText);
    if (!imp.rows.length) {
      cadernos.say('Não achei linhas de frame data. A primeira linha precisa ter os títulos (Golpe/Move, Startup, Bloqueio/On block...).');
      return;
    }
    let report = '';
    cadernos.update(fighter.path, (t) => {
      const m = mergeFrames(readFrames(t), imp.rows);
      report = `${m.added} golpes novos, ${m.updated} atualizados`;
      return writeFrames(t, m.rows);
    });
    cadernos.say(`Frame data importado: ${report}.${imp.ignored.length ? ` Colunas ignoradas: ${imp.ignored.join(', ')}.` : ''}`);
    importText = '';
    dialog = null;
    tab = 'frames';
  }

  const SAFETY_LABEL = { vantagem: 'vantagem', neutro: 'neutro', seguro: 'seguro', punivel: 'punível', desconhecido: '' };

  // ------------------------------------------------ matchups
  const LEVELS = ['-2', '-1', '0', '+1', '+2'];
  const others = $derived(game?.fighters.filter((f) => f.path !== fighter?.path) ?? []);
  const unlink = (s: string) => s.replace(/^\s*\[\[|\]\]\s*$/g, '').split('|')[0]!.trim();
  const fighterByName = (name: string) => game?.fighters.find((f) => f.name.toLowerCase() === unlink(name).toLowerCase()) ?? null;

  function editMatch(i: number) {
    matchDraft = i < 0 ? { oponente: '', nivel: '0', notas: '' } : { ...matchups[i]!, oponente: unlink(matchups[i]!.oponente) };
    editing = { kind: 'matchup', index: i };
  }
  function saveMatch() {
    if (!fighter || !matchDraft.oponente.trim()) return;
    const at = editing!.index;
    const row = { ...matchDraft, oponente: `[[${unlink(matchDraft.oponente)}]]` };
    cadernos.update(fighter.path, (t) => {
      const rows = readMatchups(t);
      if (at < 0) rows.push(row);
      else rows[at] = { ...row, _i: rows[at]?._i };
      return writeMatchups(t, rows);
    });
    editing = null;
  }
  const levelNum = (s: string) => frameNum(s) ?? 0;

  // ------------------------------------------------ punições
  let rivalPath = $state<string | null>(null);
  const rivals = $derived(others.filter((f) => f.frames > 0));
  const rival = $derived(rivals.find((f) => f.path === rivalPath) ?? rivals[0] ?? null);
  const rivalFrames = $derived.by(() => { void cadernos.rev; return rival ? readFrames(cadernos.read(rival.path)) : []; });
  const punishTable = $derived(
    rivalFrames
      .filter((r) => (frameNum(r.bloqueio, true) ?? 0) < 0)
      .map((r) => ({ r, mine: punishers(r.bloqueio, frames) }))
      .sort((a, b) => (frameNum(a.r.bloqueio, true) ?? 0) - (frameNum(b.r.bloqueio, true) ?? 0)),
  );
  const myRisky = $derived(frames.filter((r) => safety(r.bloqueio, profile) === 'punivel'));
</script>

<div class="luta">
  <aside class="list">
    <header>
      <h2>Jogos</h2>
      <button class="add" onclick={() => { dialog = 'game'; newName = ''; }} title="Novo jogo" aria-label="Novo jogo">+</button>
    </header>
    {#each games as g (g.name)}
      <section class:on={g === game}>
        <button class="game" onclick={() => pickGame(g.name)}>{g.name}<small>{g.fighters.length}</small></button>
        {#if g === game}
          <ul>
            {#each g.fighters as f (f.path)}
              <li><button class:active={f.path === fighterPath} onclick={() => pickFighter(f.path)}>{f.name}</button></li>
            {/each}
            <li><button class="ghost" onclick={() => { dialog = 'fighter'; newName = ''; }}>+ personagem</button></li>
          </ul>
        {/if}
      </section>
    {/each}
  </aside>

  <div class="body">
    {#if !game}
      <div class="empty">
        <h1>Caderno de luta</h1>
        <p>Combos em ícones, frame data e matchups por personagem. Tudo fica em notas comuns na pasta <code>Luta/</code>, que o Obsidian também abre.</p>
        <div class="presets">
          {#each PRESETS as p (p.name)}<button onclick={() => createGame(p.name, p.notation)}>{p.name}</button>{/each}
          <button class="ghost" onclick={() => { dialog = 'game'; newName = ''; }}>Outro jogo…</button>
        </div>
      </div>
    {:else if !fighter}
      <header class="top">
        <div>
          <h1>{game.name}</h1>
          <p class="sub">Notação {profile.label}</p>
        </div>
        <div class="acts">
          {#if game.path}<button class="ghost" onclick={() => onOpenNote(game.path!)}>Abrir nota</button>{/if}
          <button class="primary" onclick={() => { dialog = 'fighter'; newName = ''; }}>Nova personagem</button>
        </div>
      </header>
      <div class="legend">
        {#each profile.buttons as b (b.id)}<Notation text={b.id} {profile} size="sm" />{/each}
        <span class="dim">· contorno = fraco, cheio = forte · <Notation text="xx" {profile} size="sm" /> cancelar · <Notation text=">" {profile} size="sm" /> link</span>
      </div>
      {#if game.fighters.length}
        <div class="cards">
          {#each game.fighters as f (f.path)}
            <button class="card" onclick={() => pickFighter(f.path)}>
              <b>{f.name}</b>
              <span>{f.combos} combos · {f.frames} golpes · {f.matchups} matchups</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="dim pad">Nenhuma personagem ainda. Crie a primeira para anotar combos e frame data.</p>
      {/if}
    {:else}
      <header class="top">
        <div>
          <p class="sub crumbs"><button onclick={() => (fighterPath = null)}>{game.name}</button> /</p>
          <h1>{fighter.name}</h1>
        </div>
        <div class="acts">
          <button class="ghost" onclick={() => onOpenNote(fighter.path)}>Abrir nota</button>
        </div>
      </header>
      <nav class="tabs">
        <button class:on={tab === 'combos'} onclick={() => { tab = 'combos'; editing = null; }}>Combos <i>{combos.length}</i></button>
        <button class:on={tab === 'frames'} onclick={() => { tab = 'frames'; editing = null; }}>Frame data <i>{frames.length}</i></button>
        <button class:on={tab === 'matchups'} onclick={() => { tab = 'matchups'; editing = null; }}>Matchups <i>{matchups.length}</i></button>
        <button class:on={tab === 'punir'} onclick={() => { tab = 'punir'; editing = null; }}>Punições</button>
      </nav>

      {#if tab === 'combos'}
        <div class="bar">
          {#if situations.length}
            <div class="chips">
              <button class:on={!situ} onclick={() => (situ = null)}>Todos</button>
              {#each situations as s (s)}<button class:on={situ === s} onclick={() => (situ = situ === s ? null : s)}>{s}</button>{/each}
            </div>
          {/if}
          <button class="primary" onclick={() => editCombo(-1)}>Novo combo</button>
        </div>
        {#snippet comboForm()}
          <form class="form" onsubmit={(e) => { e.preventDefault(); saveCombo(); }}>
            <NotationInput bind:value={comboDraft.combo} {profile} autofocus onsubmit={saveCombo} />
            <div class="grid4">
              <label>Dano<input bind:value={comboDraft.dano} placeholder="2100" /></label>
              <label>Barra<input bind:value={comboDraft.barra} placeholder="1 EX, VT1" /></label>
              <label>Situação<input bind:value={comboDraft.situacao} placeholder="meio da tela, canto, punição" list="situacoes" /></label>
              <label>Notas<input bind:value={comboDraft.notas} placeholder="link de 1 frame" /></label>
            </div>
            <datalist id="situacoes">{#each situations as s (s)}<option value={s}></option>{/each}</datalist>
            <div class="formacts"><button type="button" class="ghost" onclick={() => (editing = null)}>Cancelar</button><button class="primary">Salvar</button></div>
          </form>
        {/snippet}
        {#if editing?.kind === 'combo' && editing.index < 0}{@render comboForm()}{/if}
        <ol class="combos">
          {#each shownCombos as { c, i } (i)}
            <li>
              {#if editing?.kind === 'combo' && editing.index === i}
                {@render comboForm()}
              {:else}
                <div class="seq"><Notation text={c.combo} {profile} size="lg" /></div>
                <div class="meta">
                  {#if c.dano}<span class="tag dmg">{c.dano} dano</span>{/if}
                  {#if c.barra}<span class="tag">{c.barra}</span>{/if}
                  {#if c.situacao}<span class="tag">{c.situacao}</span>{/if}
                  {#if c.notas}<span class="note">{c.notas}</span>{/if}
                  <span class="rowacts">
                    <button onclick={() => copyCombo(c)} title="Copiar">⧉</button>
                    <button onclick={() => moveRow('combo', i, -1)} title="Subir" disabled={i === 0}>↑</button>
                    <button onclick={() => moveRow('combo', i, 1)} title="Descer" disabled={i === combos.length - 1}>↓</button>
                    <button onclick={() => editCombo(i)} title="Editar">✎</button>
                    <button class="del" onclick={() => moveRow('combo', i, 0)} title="Apagar">✕</button>
                  </span>
                </div>
              {/if}
            </li>
          {:else}
            {#if !editing}<li class="dim">Nenhum combo{situ ? ` em "${situ}"` : ''} ainda. Escreva em notação numpad (2MK xx 236HP) ou use o teclado de luta.</li>{/if}
          {/each}
        </ol>

      {:else if tab === 'frames'}
        <div class="bar">
          <input class="search" bind:value={frameFilter} placeholder="Filtrar golpes" />
          <div class="acts">
            <button class="ghost" onclick={() => { dialog = 'import'; importText = ''; }}>Importar</button>
            <button class="primary" onclick={() => editFrame(-1)}>Novo golpe</button>
          </div>
        </div>
        {#snippet frameForm()}
          <form class="form" onsubmit={(e) => { e.preventDefault(); saveFrame(); }}>
            <div class="grid4">
              <label>Golpe<input bind:value={frameDraft.golpe} placeholder="Tanden Engine" /></label>
              <label class="wide">Comando<NotationInput bind:value={frameDraft.comando} {profile} placeholder="236PP" /></label>
            </div>
            <div class="grid6">
              <label>Dano<input bind:value={frameDraft.dano} /></label>
              <label>Startup<input bind:value={frameDraft.startup} inputmode="numeric" /></label>
              <label>Ativo<input bind:value={frameDraft.ativo} /></label>
              <label>Recuperação<input bind:value={frameDraft.recuperacao} /></label>
              <label>Bloqueio<input bind:value={frameDraft.bloqueio} placeholder="-3" /></label>
              <label>Hit<input bind:value={frameDraft.hit} placeholder="+2" /></label>
            </div>
            <label>Notas<input bind:value={frameDraft.notas} /></label>
            <div class="formacts">
              {#if editing && editing.index >= 0}<button type="button" class="ghost del" onclick={() => moveRow('frame', editing!.index, 0)}>Apagar</button>{/if}
              <button type="button" class="ghost" onclick={() => (editing = null)}>Cancelar</button><button class="primary">Salvar</button>
            </div>
          </form>
        {/snippet}
        {#if editing?.kind === 'frame'}{@render frameForm()}{/if}
        {#if frames.length}
          <div class="tablewrap">
            <table>
              <thead><tr>
                <th><button onclick={() => sortBy('golpe')}>Golpe{arrow('golpe')}</button></th><th>Comando</th>
                <th class="n"><button onclick={() => sortBy('dano')}>Dano{arrow('dano')}</button></th>
                <th class="n"><button onclick={() => sortBy('startup')}>Startup{arrow('startup')}</button></th>
                <th class="n">Ativo</th><th class="n">Rec.</th>
                <th class="n"><button onclick={() => sortBy('bloqueio')}>Bloqueio{arrow('bloqueio')}</button></th>
                <th class="n">Hit</th><th>Notas</th>
              </tr></thead>
              <tbody>
                {#each shownFrames as { f, i } (i)}
                  {@const s = safety(f.bloqueio, profile)}
                  <tr class:editing={editing?.kind === 'frame' && editing.index === i} onclick={() => editFrame(i)}>
                    <td>{f.golpe}</td>
                    <td>{#if f.comando}<Notation text={f.comando} {profile} size="sm" />{/if}</td>
                    <td class="n">{f.dano}</td><td class="n">{f.startup}</td><td class="n">{f.ativo}</td><td class="n">{f.recuperacao}</td>
                    <td class="n"><span class="adv {s}" title={SAFETY_LABEL[s]}>{f.bloqueio}</span></td>
                    <td class="n">{f.hit}</td><td class="dim">{f.notas}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="dim small">Bloqueio: <span class="adv vantagem">vantagem</span> <span class="adv seguro">seguro</span> <span class="adv punivel">punível</span> (a partir de −{profile.punish}). Clique numa linha para editar.</p>
        {:else if !editing}
          <p class="dim pad">Sem frame data ainda. Use <b>Importar</b> para colar uma tabela de um site ou abrir um CSV, ou adicione golpe por golpe.</p>
        {/if}

      {:else if tab === 'matchups'}
        <div class="bar"><span></span><button class="primary" onclick={() => editMatch(-1)}>Novo matchup</button></div>
        {#if editing?.kind === 'matchup'}
          <form class="form" onsubmit={(e) => { e.preventDefault(); saveMatch(); }}>
            <label>Oponente<input bind:value={matchDraft.oponente} list="oponentes" placeholder="nome da personagem" /></label>
            <datalist id="oponentes">{#each others as o (o.path)}<option value={o.name}></option>{/each}</datalist>
            <div class="levels" role="radiogroup" aria-label="Nível">
              {#each LEVELS as l (l)}<button type="button" class:on={matchDraft.nivel === l} class="lv l{l.replace('+', 'p').replace('-', 'm')}" onclick={() => (matchDraft.nivel = l)}>{l}</button>{/each}
            </div>
            <label>Plano de jogo<input bind:value={matchDraft.notas} placeholder="o que fazer nesse matchup" /></label>
            <div class="formacts">
              {#if editing.index >= 0}<button type="button" class="ghost del" onclick={() => moveRow('matchup', editing!.index, 0)}>Apagar</button>{/if}
              <button type="button" class="ghost" onclick={() => (editing = null)}>Cancelar</button><button class="primary">Salvar</button>
            </div>
          </form>
        {/if}
        <ul class="matchups">
          {#each matchups as m, i (i)}
            {@const lv = levelNum(m.nivel)}
            {@const other = fighterByName(m.oponente)}
            <li>
              <button class="mname" onclick={() => (other ? pickFighter(other.path) : editMatch(i))}>{unlink(m.oponente)}</button>
              <span class="meter" title={`nível ${m.nivel}`}><i style:--v={lv} class:pos={lv > 0} class:neg={lv < 0}></i></span>
              <span class="lvtext">{m.nivel}</span>
              <span class="note">{m.notas}</span>
              <button class="edit" onclick={() => editMatch(i)} title="Editar">✎</button>
            </li>
          {:else}
            {#if !editing}<li class="dim">Nenhum matchup anotado.</li>{/if}
          {/each}
        </ul>

      {:else}
        {#if !frames.length}
          <p class="dim pad">Para calcular punições, {fighter.name} precisa de frame data (startup de cada golpe).</p>
        {:else if !rivals.length}
          <p class="dim pad">Nenhuma outra personagem de {game.name} tem frame data ainda. Importe a de um oponente para ver o que punir.</p>
        {:else}
          <div class="bar">
            <label class="inline">Contra
              <select value={rival?.path} onchange={(e) => (rivalPath = (e.currentTarget as HTMLSelectElement).value)}>{#each rivals as r (r.path)}<option value={r.path}>{r.name}</option>{/each}</select>
            </label>
          </div>
          <div class="tablewrap">
            <table>
              <thead><tr><th>Golpe de {rival?.name}</th><th class="n">Bloqueio</th><th>Pune com</th></tr></thead>
              <tbody>
                {#each punishTable as { r, mine }, i (i)}
                  <tr>
                    <td>{r.golpe} {#if r.comando}<Notation text={r.comando} {profile} size="sm" />{/if}</td>
                    <td class="n"><span class="adv {safety(r.bloqueio, profile)}">{r.bloqueio}</span></td>
                    <td>
                      {#if mine.length}
                        <span class="pun">{#each mine.slice(0, 3) as p, j (j)}<span>{#if p.comando}<Notation text={p.comando} {profile} size="sm" />{:else}{p.golpe}{/if}<small>{p.startup}f{p.dano ? ` · ${p.dano}` : ''}</small></span>{/each}</span>
                      {:else}<span class="dim">nada rápido o bastante</span>{/if}
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="3" class="dim">Nenhum golpe de {rival?.name} fica em desvantagem no bloqueio.</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
        {#if myRisky.length}
          <h3>Golpes de {fighter.name} que levam punição</h3>
          <div class="risky">{#each myRisky as r, i (i)}<span>{#if r.comando}<Notation text={r.comando} {profile} size="sm" />{:else}{r.golpe}{/if}<b class="adv punivel">{r.bloqueio}</b></span>{/each}</div>
        {/if}
      {/if}
    {/if}
  </div>

  {#if dialog}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dialog = null; }}>
      <div class="dialog" role="dialog" aria-modal="true">
        {#if dialog === 'game'}
          <h2>Novo jogo</h2>
          <form onsubmit={(e) => { e.preventDefault(); createGame(); }}>
            <label>Nome<input bind:value={newName} placeholder="Street Fighter V" /></label>
            <label>Notação
              <select bind:value={newNotation}>{#each Object.values(PROFILES) as p (p.notation)}<option value={p.notation}>{p.label}</option>{/each}</select>
            </label>
            <p class="dim small">No modo livre, liste os botões na nota do jogo, em <code>botões</code>.</p>
            <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button><button class="primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {:else if dialog === 'fighter'}
          <h2>Nova personagem em {game?.name}</h2>
          <form onsubmit={(e) => { e.preventDefault(); createFighter(); }}>
            <label>Nome<input bind:value={newName} placeholder="Seth" /></label>
            <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button><button class="primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {:else}
          <h2>Importar frame data</h2>
          <p class="dim small">Cole uma tabela copiada de um site (wiki, FAT, Supercombo) ou abra um CSV. A primeira linha precisa dos títulos; nomes em inglês ou português servem. Golpes que já existem são atualizados, sem perder suas notas.</p>
          <textarea bind:value={importText} rows="8" placeholder={'Move\tStartup\tActive\tRecovery\tOn Block\tOn Hit\nStand LP\t3\t2\t7\t+2\t+4'}></textarea>
          <input type="file" accept=".csv,.tsv,.txt,text/csv" bind:this={fileInput} onchange={onImportFile} hidden />
          <div class="formacts">
            <button type="button" class="ghost" onclick={() => fileInput?.click()}>Abrir arquivo…</button>
            <button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button>
            <button class="primary" disabled={!importText.trim()} onclick={runImport}>Importar</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if cadernos.message}<div class="toast" role="status">{cadernos.message}</div>{/if}
</div>

<style>
  .luta { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
  .list { border-right: 1px solid var(--line); overflow-y: auto; padding: 14px 8px; }
  .list header { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 10px; }
  h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .add { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); }
  .add:hover { border-color: var(--ember); color: var(--ember); }
  .game { width: 100%; display: flex; justify-content: space-between; border: 0; background: none; padding: 8px 10px; border-radius: 9px;
    font: 600 13px var(--f-display); letter-spacing: .04em; text-align: left; }
  .game small { color: var(--muted); font: 11px var(--f-mono); }
  section.on .game { color: var(--ember); }
  .list ul { list-style: none; margin: 0 0 8px; padding: 0 0 0 8px; }
  .list li button { width: 100%; text-align: left; border: 0; background: none; padding: 6px 10px; border-radius: 8px; border-left: 2px solid transparent; }
  .list li button:hover { background: var(--surface-2); }
  .list li button.active { background: var(--surface-2); border-left-color: var(--ember); }
  .list li button.ghost { color: var(--muted); font-size: 12.5px; }

  .body { overflow-y: auto; padding: 22px 28px 60px; min-width: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  h1 { margin: 0; font: 600 26px/1.15 var(--f-display); letter-spacing: .02em; }
  h3 { margin: 26px 0 10px; font: 600 13px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .sub { margin: 4px 0 0; color: var(--muted); font-size: 12.5px; }
  .crumbs { margin: 0 0 2px; }
  .crumbs button { border: 0; background: none; padding: 0; color: var(--ember-soft); font: inherit; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .primary { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: #160b03; font-weight: 600; }
  .primary:disabled { opacity: .45; cursor: default; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 6px 12px; background: var(--surface-2); }
  .ghost:hover { border-color: var(--ember); }
  .del, .ghost.del { color: var(--crit); }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
  .pad { padding: 18px 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }

  .empty { max-width: 560px; margin: 8vh auto 0; text-align: center; }
  .empty p { color: var(--muted); }
  .presets { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 18px; }
  .presets button { border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 12px 16px; font: 600 13px var(--f-display); }
  .presets button:hover { border-color: var(--ember); box-shadow: 0 0 22px -12px var(--ember); }

  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 16px; font-size: 12px; }
  .legend .dim { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .card { text-align: left; display: grid; gap: 4px; border: 1px solid var(--line); background: var(--surface); border-radius: 14px; padding: 14px; }
  .card:hover { border-color: var(--ember); }
  .card b { font: 600 16px var(--f-display); }
  .card span { color: var(--muted); font-size: 12px; }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 14px; overflow-x: auto; scrollbar-width: none; }
  .tabs button { border: 0; background: none; padding: 9px 12px; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap;
    font: 600 12px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .tabs i { font: 11px var(--f-mono); font-style: normal; color: var(--ember-soft); margin-left: 4px; }

  .bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { border: 1px solid var(--line); background: none; border-radius: 999px; padding: 4px 11px; font-size: 12.5px; color: var(--muted); }
  .chips button.on { border-color: var(--ember); color: var(--ink); background: color-mix(in srgb, var(--ember) 12%, transparent); }
  .search { background: var(--surface); border: 1px solid var(--line); border-radius: 9px; padding: 7px 10px; color: var(--ink); min-width: 180px; }

  .form { display: grid; gap: 10px; padding: 14px; border: 1px solid color-mix(in srgb, var(--ember) 45%, var(--line)); border-radius: 14px;
    background: var(--surface); margin-bottom: 12px; }
  .form label, .dialog label { display: grid; gap: 4px; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .form input, .dialog input, .dialog select, select, .dialog textarea { background: var(--void); border: 1px solid var(--line); border-radius: 9px;
    color: var(--ink); padding: 7px 10px; font: 14px var(--f-body); text-transform: none; letter-spacing: 0; }
  .form input:focus, .dialog input:focus, textarea:focus { border-color: var(--ember); outline: none; }
  .grid4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .grid4 .wide { grid-column: span 3; }
  .grid6 { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 10px; }
  .formacts { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

  .combos { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .combos > li:not(.dim) { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; display: grid; gap: 8px; }
  .combos > li:has(.form) { padding: 0; border: 0; background: none; }
  .combos .form { margin: 0; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .tag { font: 11.5px var(--f-mono); padding: 2px 8px; border-radius: 999px; background: var(--surface-2); color: var(--silver); }
  .tag.dmg { color: var(--ember-soft); }
  .note { color: var(--muted); font-size: 12.5px; }
  .rowacts { margin-left: auto; display: flex; gap: 2px; opacity: .5; transition: opacity .15s; }
  li:hover .rowacts, .rowacts:focus-within { opacity: 1; }
  .rowacts button, .edit { border: 0; background: none; width: 26px; height: 26px; border-radius: 7px; color: var(--muted); }
  .rowacts button:hover:not(:disabled), .edit:hover { background: var(--surface-2); color: var(--ink); }
  .rowacts button:disabled { opacity: .3; }
  .rowacts .del:hover { color: var(--crit); }

  .tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
    padding: 8px 10px; border-bottom: 1px solid var(--line); background: var(--surface); white-space: nowrap; }
  th button { border: 0; background: none; padding: 0; font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit; }
  td { padding: 7px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); vertical-align: middle; }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--surface); }
  tr.editing { background: color-mix(in srgb, var(--ember) 8%, transparent); }
  .n { text-align: right; font-family: var(--f-mono); white-space: nowrap; }
  .adv { font-family: var(--f-mono); padding: 1px 6px; border-radius: 6px; }
  .adv.vantagem { color: var(--ok); background: color-mix(in srgb, var(--ok) 12%, transparent); }
  .adv.seguro { color: var(--silver); background: var(--surface-2); }
  .adv.punivel { color: var(--crit); background: color-mix(in srgb, var(--crit) 12%, transparent); }

  .levels { display: flex; gap: 4px; }
  .lv { flex: 1; border: 1px solid var(--line); background: var(--surface-2); border-radius: 8px; padding: 6px 0; font: 600 13px var(--f-mono); }
  .lv.on.lm2, .lv.on.lm1 { border-color: var(--crit); color: var(--crit); }
  .lv.on.l0 { border-color: var(--silver); }
  .lv.on.lp1, .lv.on.lp2 { border-color: var(--ok); color: var(--ok); }
  .matchups { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .matchups li { display: grid; grid-template-columns: 140px 120px 30px 1fr 30px; align-items: center; gap: 10px; padding: 8px 12px;
    border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .matchups li.dim { display: block; border: 0; background: none; }
  .mname { border: 0; background: none; padding: 0; text-align: left; font: 600 14px var(--f-display); color: var(--ink); }
  .mname:hover { color: var(--ember); }
  .meter { position: relative; height: 6px; border-radius: 3px; background: var(--surface-2); }
  .meter::after { content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--muted); }
  .meter i { position: absolute; top: 0; bottom: 0; border-radius: 3px; }
  .meter i.pos { left: 50%; width: calc(var(--v) * 25%); background: var(--ok); }
  .meter i.neg { right: 50%; width: calc(var(--v) * -25%); background: var(--crit); }
  .lvtext { font: 12px var(--f-mono); color: var(--muted); }

  .inline { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
  .pun { display: flex; flex-wrap: wrap; gap: 10px; }
  .pun > span { display: inline-flex; align-items: center; gap: 5px; }
  .pun small { color: var(--muted); font: 11px var(--f-mono); }
  .risky { display: flex; flex-wrap: wrap; gap: 8px; }
  .risky > span { display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 10px; }

  .scrim { position: absolute; inset: 0; z-index: 10; background: rgba(0, 0, 0, .55); display: grid; place-items: center; padding: 16px; }
  .dialog { width: min(520px, 100%); max-height: 100%; overflow-y: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
    padding: 18px; display: grid; gap: 12px; box-shadow: 0 30px 80px -20px #000; }
  .dialog h2 { font-size: 13px; color: var(--ink); }
  .dialog form { display: grid; gap: 12px; }
  .dialog textarea { font: 12.5px var(--f-mono); resize: vertical; }
  .toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 11; max-width: min(560px, 90%);
    padding: 10px 14px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--ember); font-size: 13px; }

  @media (max-width: 720px) {
    .luta { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .list { border-right: 0; border-bottom: 1px solid var(--line); max-height: 30vh; padding: 8px; }
    .body { padding: 16px 16px 60px; }
    .grid4 .wide { grid-column: auto; }
    .matchups li { grid-template-columns: 1fr 80px 30px; }
    .matchups .note { grid-column: 1 / -1; }
    .matchups .edit { grid-row: 1; grid-column: 3; }
    .lvtext { display: none; }
    .rowacts { opacity: 1; }
  }
</style>
