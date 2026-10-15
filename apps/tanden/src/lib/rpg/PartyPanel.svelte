<script lang="ts">
  import { addSheet, entityFolder, entityTemplate, hasSheet, readSheet, setProps, systemOf, typeInfo, type Campaign } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { typeColor } from '../cadernos/tipos';
  import { mesa } from './mesa.svelte';
  import SheetPanel from './SheetPanel.svelte';

  let { campaign, onOpenNote }: { campaign: Campaign; onOpenNote: (path: string) => void } = $props();

  let selected = $state<string | null>(null);
  let dialog = $state(false);
  let kind = $state<'pc' | 'npc' | 'criatura'>('pc');
  let newName = $state('');
  let player = $state('');
  let existing = $state('');

  const sheets = $derived.by(() => {
    void cadernos.rev;
    return campaign.sheets.map((r) => ({ ...r, s: readSheet(cadernos.read(r.path), campaign.system) }));
  });
  const current = $derived(sheets.find((x) => x.path === selected) ?? null);
  const world = $derived(cadernos.worlds.find((w) => w.name.toLowerCase() === campaign.world.toLowerCase()) ?? null);
  /** fichas do mundo que ainda não têm números de jogo */
  const candidates = $derived.by(() => {
    void cadernos.rev;
    return (world?.entities ?? []).filter((e) => (e.type === 'personagem' || e.type === 'criatura') && !hasSheet(e.props));
  });

  function create() {
    const sys = systemOf(campaign.system);
    let path: string;
    if (existing) {
      path = existing;
      cadernos.update(path, (t) => {
        let out = addSheet(t, sys);
        if (kind === 'pc' && player.trim()) out = setProps(out, { jogador: player.trim() });
        return out;
      });
    } else {
      if (!newName.trim()) return;
      const type = kind === 'criatura' ? 'criatura' : 'personagem';
      const folder = world ? entityFolder(world, type) : `${campaign.folder}/${kind === 'criatura' ? 'Criaturas' : 'Personagens'}`;
      path = cadernos.create(folder, newName.trim(), (n) => {
        let t = world ? entityTemplate(n, world.name, type) : `---\ntipo: ${type}\ncampanha: "[[${campaign.name}]]"\n---\n# ${n}\n\n`;
        t = addSheet(t, sys);
        if (kind === 'pc') t = setProps(t, { jogador: player.trim() || 'jogador' });
        return t;
      });
    }
    mesa.rebuild();
    selected = path;
    dialog = false;
    newName = '';
    existing = '';
  }

  const pct = (hp: number | null, max: number | null) => (hp !== null && max ? Math.max(0, Math.min(1, hp / max)) : null);
</script>

<div class="party">
  <div class="cards">
    {#each sheets as x (x.path)}
      {@const p = pct(x.s.hp, x.s.hpMax)}
      <button class="card" class:on={selected === x.path} style:--c={typeColor(x.type)} onclick={() => (selected = selected === x.path ? null : x.path)}>
        <span class="kind">{x.pc ? `Jogador${x.s.player && x.s.player !== 'jogador' ? ` · ${x.s.player}` : ''}` : typeInfo(x.type).label}</span>
        <b>{x.name}</b>
        <span class="nums mono">
          {#if x.s.hp !== null}<span>PV {x.s.hp}{x.s.hpMax !== null ? `/${x.s.hpMax}` : ''}</span>{/if}
          {#if x.s.ac !== null}<span>CA {x.s.ac}</span>{/if}
          {#if x.s.level !== null}<span>Nv {x.s.level}</span>{/if}
        </span>
        {#if p !== null}<span class="hpbar"><i style:width="{p * 100}%" class:mid={p <= 0.5} class:low={p <= 0.25}></i></span>{/if}
      </button>
    {/each}
    <button class="card add" onclick={() => { dialog = true; existing = ''; newName = ''; }}>+ Personagem ou criatura</button>
  </div>

  {#if current}
    <section class="box current">
      <header>
        <h2 style:color={typeColor(current.type)}>{current.name}</h2>
        <button class="ghost sm" onclick={() => onOpenNote(current.path)}>Abrir nota</button>
      </header>
      <SheetPanel path={current.path} {onOpenNote} />
    </section>
  {:else if sheets.length}
    <p class="dim small">Escolha uma ficha para rolar testes, ataques e perícias com um clique.</p>
  {:else}
    <p class="dim">Os personagens são as fichas de {campaign.world ? `${campaign.world} (Mundos)` : 'campanha'} que têm números de jogo (PV, CA, atributos).</p>
  {/if}

  {#if dialog}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dialog = false; }}>
      <div class="dialog" role="dialog" aria-modal="true">
        <h2>Nova ficha de jogo</h2>
        <form onsubmit={(e) => { e.preventDefault(); create(); }}>
          <div class="chips" role="radiogroup" aria-label="Tipo">
            {#each [['pc', 'Personagem de jogador'], ['npc', 'NPC'], ['criatura', 'Criatura']] as [id, label] (id)}
              <button type="button" class="chip" class:on={kind === id} onclick={() => (kind = id as typeof kind)}>{label}</button>
            {/each}
          </div>
          {#if candidates.length}
            <label>Ficha que já existe em {world?.name}
              <select class="field" bind:value={existing}>
                <option value="">Nenhuma (criar nova)</option>
                {#each candidates as e (e.path)}<option value={e.path}>{e.name} ({typeInfo(e.type).label})</option>{/each}
              </select>
            </label>
          {/if}
          {#if !existing}
            <!-- svelte-ignore a11y_autofocus -->
            <label>Nome<input class="field" bind:value={newName} placeholder={kind === 'criatura' ? 'Goblin' : 'Kael'} autofocus /></label>
          {/if}
          {#if kind === 'pc'}
            <label>Jogador<input class="field" bind:value={player} placeholder="quem joga" /></label>
          {/if}
          <p class="dim small">{world ? `Fica em ${entityFolder(world, kind === 'criatura' ? 'criatura' : 'personagem')}/, ligada ao mundo ${world.name}.` : `Fica em ${campaign.folder}/.`} Os números começam padrão; clique neles para editar.</p>
          <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = false)}>Cancelar</button><button class="primary" disabled={!existing && !newName.trim()}>Criar</button></div>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .party { display: grid; gap: 14px; align-content: start; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
  .card { text-align: left; display: grid; gap: 4px; align-content: start; border: 1px solid var(--line); background: var(--surface); border-radius: 13px;
    padding: 10px 12px 10px 14px; position: relative; overflow: hidden; }
  .card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); }
  .card:hover, .card.on { border-color: color-mix(in srgb, var(--c) 60%, var(--line)); }
  .card.on { background: color-mix(in srgb, var(--c) 7%, var(--surface)); }
  .card.add { --c: transparent; border-style: dashed; color: var(--muted); place-content: center; text-align: center; min-height: 72px; }
  .card.add:hover { color: var(--ink); border-color: var(--ember); }
  .kind { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
  .card b { font: 600 15px var(--f-display); }
  .nums { display: flex; gap: 8px; font-size: 11.5px; color: var(--muted); }
  .current header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .current h2 { font-size: 15px; letter-spacing: .06em; }
</style>
