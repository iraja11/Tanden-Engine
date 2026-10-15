<script lang="ts">
  import {
    CONDITIONS, addCombatants, appendLog, applyHp, changeHp, endCombat, hasSheet, isOut, nextTurn, parseProps, prevTurn, readEncounter,
    readSheet, removeCombatant, resolveLink, rollInitiative, setProps, sortByInit, toggleCondition, update, writeEncounter,
    type Combatant, type Encounter,
  } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { engine } from '../engine.svelte';
  import { mesa } from './mesa.svelte';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const camp = $derived(mesa.campaign);
  const encounters = $derived(camp?.encounters ?? []);
  let chosen = $state<string | null>(null);
  const path = $derived(chosen && engine.vault.has(chosen) ? chosen : encounters.at(-1)?.path ?? null);
  const enc = $derived.by((): Encounter | null => { void cadernos.rev; void mesa.rev; return path ? readEncounter(cadernos.read(path)) : null; });
  const order = $derived(enc ? sortByInit(enc.list) : []);

  let dialog = $state<null | 'novo' | 'add'>(null);
  let newName = $state('');
  // adicionar combatente
  let addFrom = $state('');
  let addName = $state('');
  let addCount = $state(1);
  let addMod = $state('0');
  let addHp = $state('');
  let addAc = $state('');
  let addSide = $state<'inimigo' | 'aliado' | 'grupo'>('inimigo');
  let amounts = $state<Record<string, string>>({});
  let condFor = $state<string | null>(null);

  function save(next: Encounter, log?: string) {
    if (!path) return;
    cadernos.update(path, (t) => {
      let out = writeEncounter(t, next);
      if (log) out = appendLog(out, log);
      return out;
    });
  }

  /** caminho da ficha por trás de um nome com [[link]] */
  function sheetOf(name: string): string | null {
    const m = /^\[\[([^\]]+)\]\]$/.exec(name.trim());
    if (!m) return null;
    const hit = resolveLink(m[1]!, engine.notes);
    return hit ? hit.path : null;
  }
  const plain = (name: string) => name.replace(/^\[\[|\]\]$/g, '').replace(/^[^|]*\|/, '');

  function createEncounter() {
    const p = mesa.newEncounter(newName);
    if (p) chosen = p;
    dialog = null;
    newName = '';
  }

  function fromSheet(p: string): Omit<Combatant, '_i'> {
    const t = cadernos.read(p);
    const s = readSheet(t, camp?.system);
    const name = p.split('/').pop()!.replace(/\.md$/, '');
    return { name: `[[${name}]]`, init: null, mod: s.init, hp: s.hp ?? s.hpMax, hpMax: s.hpMax ?? s.hp, ac: s.ac, conditions: [], side: s.player ? 'grupo' : 'inimigo' };
  }

  function addParty() {
    if (!enc || !camp) return;
    let next = enc;
    for (const r of camp.sheets.filter((x) => x.pc)) {
      if (next.list.some((c) => sheetOf(c.name) === r.path)) continue;
      next = addCombatants(next, fromSheet(r.path));
    }
    save(next);
  }

  function pickSource(v: string) {
    addFrom = v;
    if (!v) return;
    const c = fromSheet(v);
    addName = plain(c.name);
    addMod = String(c.mod);
    addHp = c.hpMax === null ? '' : String(c.hpMax);
    addAc = c.ac === null ? '' : String(c.ac);
    addSide = c.side === 'grupo' ? 'grupo' : 'inimigo';
  }

  const num = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Math.round(Number(s)));

  function addOne() {
    if (!enc || !addName.trim()) return;
    const hpMax = num(addHp);
    const base: Omit<Combatant, '_i'> = {
      name: addFrom && addCount === 1 ? `[[${addFrom.split('/').pop()!.replace(/\.md$/, '')}]]` : addName.trim(),
      init: null, mod: num(addMod) ?? 0, hp: hpMax, hpMax, ac: num(addAc), conditions: [], side: addSide,
    };
    save(addCombatants(enc, base, Math.max(1, Math.min(30, addCount))));
    dialog = null;
    addFrom = '';
    addName = '';
    addCount = 1;
    addMod = '0';
    addHp = '';
    addAc = '';
  }

  function rollInit(all = false) {
    if (!enc) return;
    const next = rollInitiative(enc, (mod) => {
      const r = mesa.roll(`1d20${mod >= 0 ? `+${mod}` : mod}`, { label: 'Iniciativa', quiet: true });
      return typeof r === 'string' ? 10 + mod : r[0]!.total;
    }, all);
    save(next);
  }

  function rollOne(c: Combatant) {
    if (!enc) return;
    const r = mesa.roll(`1d20${c.mod >= 0 ? `+${c.mod}` : c.mod}`, { who: plain(c.name), label: 'Iniciativa', quiet: true });
    if (typeof r !== 'string') save(update(enc, c.name, { init: r[0]!.total }));
  }

  function setInit(c: Combatant, v: string) {
    if (!enc) return;
    save(update(enc, c.name, { init: num(v) }));
  }

  function hp(c: Combatant, sign: 1 | -1) {
    if (!enc) return;
    const raw = (amounts[c.name] ?? '').trim();
    const n = Math.abs(Math.round(Number(raw)));
    if (!raw || !Number.isFinite(n) || n === 0) return;
    const next = changeHp(enc, c.name, sign * n);
    const after = next.list.find((x) => x.name === c.name)!;
    save(next, `R${Math.max(1, enc.round)} · ${plain(c.name)}: ${sign > 0 ? `−${n}` : `+${n}`} PV (${after.hp}${after.hpMax !== null ? `/${after.hpMax}` : ''})`);
    amounts = { ...amounts, [c.name]: '' };
    // personagem com ficha: o PV da ficha acompanha
    const sp = sheetOf(c.name);
    if (sp && hasSheet(parseProps(cadernos.read(sp)))) {
      const s = readSheet(cadernos.read(sp));
      const r = applyHp({ ...s, hp: s.hp ?? c.hp }, sign * n);
      cadernos.update(sp, (t) => setProps(t, { [s.keys.hp]: String(r.hp), ...(s.hpTemp !== null ? { [s.keys.hpTemp]: r.hpTemp ? String(r.hpTemp) : null } : {}) }));
    }
  }

  function step(dir: 1 | -1) {
    if (!enc) return;
    const next = dir > 0 ? nextTurn(enc) : prevTurn(enc);
    save(next, dir > 0 && next.round !== enc.round && next.round > 0 ? `Rodada ${next.round}` : undefined);
  }

  function onKey(e: KeyboardEvent) {
    if (!enc || dialog) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); step(1); }
    else if (e.key === 'b' || e.key === 'B') { e.preventDefault(); step(-1); }
  }

  const pct = (c: Combatant) => (c.hp !== null && c.hpMax ? Math.max(0, Math.min(1, c.hp / c.hpMax)) : null);
  const sides: Record<string, string> = { grupo: 'Grupo', aliado: 'Aliado', inimigo: 'Inimigo' };
  const withoutSheet = $derived((camp?.sheets ?? []).filter((r) => !enc?.list.some((c) => sheetOf(c.name) === r.path)));
</script>

<svelte:window onkeydown={onKey} />

<div class="combat">
  <header class="head">
    <select class="field" value={path ?? ''} onchange={(e) => (chosen = (e.currentTarget as HTMLSelectElement).value || null)} aria-label="Encontro">
      {#if !encounters.length}<option value="">Nenhum encontro</option>{/if}
      {#each encounters as x (x.path)}<option value={x.path}>{x.name}{x.round ? ` · rodada ${x.round}` : ''}</option>{/each}
    </select>
    <button class="ghost sm" onclick={() => { dialog = 'novo'; newName = `Encontro ${encounters.length + 1}`; }}>Novo encontro</button>
    {#if path}<button class="ghost sm" onclick={() => onOpenNote(path!)}>Abrir nota</button>{/if}
  </header>

  {#if !camp}
    <p class="dim">Crie uma campanha para guardar os encontros dela. Sem campanha, os encontros vão para a pasta <code>Encontros/</code>.</p>
  {/if}

  {#if enc && path}
    <div class="turnbar">
      <div class="round">
        {#if enc.round > 0}<span class="lbl">Rodada</span><b>{enc.round}</b>{:else}<span class="dim small">Combate não começou</span>{/if}
      </div>
      <div class="acts">
        <button class="ghost sm" onclick={() => rollInit(false)} disabled={!enc.list.some((c) => c.init === null)} title="Rola 1d20 + modificador para quem ainda não tem iniciativa">Rolar iniciativa</button>
        <button class="ghost sm" onclick={() => step(-1)} disabled={!enc.turn} title="Voltar um turno (B)">◂ Voltar</button>
        <button class="primary sm" onclick={() => step(1)} disabled={!enc.list.length} title="Próximo turno (N)">{enc.turn ? 'Próximo ▸' : 'Começar ▸'}</button>
        {#if enc.round > 0}<button class="ghost sm" onclick={() => save(endCombat(enc!), 'Fim do combate')}>Encerrar</button>{/if}
      </div>
    </div>

    <ol class="list">
      {#each order as c (c.name)}
        {@const p = pct(c)}
        {@const sp = sheetOf(c.name)}
        <li class:active={enc.turn === c.name} class:out={isOut(c)} class:down={c.hp === 0} data-side={c.side}>
          <div class="init">
            {#if c.init === null}
              <button class="roll-btn sm" onclick={() => rollOne(c)} title={`Rolar 1d20${c.mod >= 0 ? '+' : ''}${c.mod}`}>🎲</button>
            {:else}
              <input class="field mono" value={c.init} onchange={(e) => setInit(c, (e.currentTarget as HTMLInputElement).value)} inputmode="numeric" aria-label={`Iniciativa de ${plain(c.name)}`} />
            {/if}
          </div>
          <div class="who">
            <span class="name">
              {#if sp}<button class="lnk" onclick={() => onOpenNote(sp)}>{plain(c.name)}</button>{:else}{plain(c.name)}{/if}
              <small class="side">{sides[c.side] ?? c.side}</small>
              {#if c.ac !== null}<small class="ac" title="Classe de armadura">CA {c.ac}</small>{/if}
            </span>
            <span class="conds">
              {#each c.conditions as cond (cond)}<span class="tag">{cond}<button onclick={() => save(toggleCondition(enc!, c.name, cond))} aria-label={`Tirar ${cond}`}>×</button></span>{/each}
              <button class="addc" onclick={() => (condFor = condFor === c.name ? null : c.name)} aria-expanded={condFor === c.name}>+ condição</button>
            </span>
            {#if condFor === c.name}
              <div class="condpick">
                {#each CONDITIONS as cond (cond)}
                  <button class="chip" class:on={c.conditions.some((x) => x.toLowerCase() === cond)} onclick={() => { save(toggleCondition(enc!, c.name, cond)); }}>{cond}</button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="hp">
            <span class="hpn mono">{c.hp ?? '—'}{#if c.hpMax !== null}<small>/{c.hpMax}</small>{/if}</span>
            {#if p !== null}<div class="hpbar"><i style:width="{p * 100}%" class:mid={p <= 0.5} class:low={p <= 0.25}></i></div>{/if}
          </div>
          <form class="dmg" onsubmit={(e) => { e.preventDefault(); hp(c, 1); }}>
            <input class="field mono" value={amounts[c.name] ?? ''} oninput={(e) => (amounts = { ...amounts, [c.name]: (e.currentTarget as HTMLInputElement).value })}
              inputmode="numeric" placeholder="0" aria-label={`Quantidade para ${plain(c.name)}`} />
            <button class="icon" type="submit" title="Dano" aria-label="Dano">−</button>
            <button class="icon" type="button" onclick={() => hp(c, -1)} title="Cura" aria-label="Cura">+</button>
          </form>
          <button class="icon danger" onclick={() => save(removeCombatant(enc!, c.name))} title="Tirar do combate" aria-label={`Tirar ${plain(c.name)}`}>✕</button>
        </li>
      {:else}
        <li class="none">Ninguém no combate ainda.</li>
      {/each}
    </ol>

    <div class="adds">
      <button class="ghost sm" onclick={() => { dialog = 'add'; }}>+ Combatente</button>
      {#if camp?.sheets.some((r) => r.pc)}<button class="ghost sm" onclick={addParty}>+ Grupo inteiro</button>{/if}
      <span class="dim small">N passa o turno, B volta. O dano de quem tem ficha também vai para a ficha.</span>
    </div>
  {:else if !encounters.length}
    <div class="empty-state">
      <p>Um encontro guarda a ordem de iniciativa, os PV e as condições numa nota comum. Dá para continuar no Obsidian ou em outro aparelho.</p>
      <button class="primary" onclick={() => { dialog = 'novo'; newName = 'Encontro 1'; }}>Criar encontro</button>
    </div>
  {/if}

  {#if dialog}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dialog = null; }}>
      <div class="dialog" role="dialog" aria-modal="true">
        {#if dialog === 'novo'}
          <h2>Novo encontro{camp ? ` em ${camp.name}` : ''}</h2>
          <form onsubmit={(e) => { e.preventDefault(); createEncounter(); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <label>Nome<input class="field" bind:value={newName} autofocus /></label>
            <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button><button class="primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {:else}
          <h2>Adicionar ao combate</h2>
          <form onsubmit={(e) => { e.preventDefault(); addOne(); }}>
            {#if camp?.sheets.length}
              <label>Da ficha
                <select class="field" value={addFrom} onchange={(e) => pickSource((e.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nenhuma (digitar)</option>
                  {#each withoutSheet.length ? withoutSheet : camp.sheets as r (r.path)}<option value={r.path}>{r.name}{r.pc ? ' (jogador)' : ''}</option>{/each}
                  {#if withoutSheet.length}{#each camp.sheets.filter((r) => !withoutSheet.includes(r)) as r (r.path)}<option value={r.path}>{r.name} (de novo)</option>{/each}{/if}
                </select>
              </label>
            {/if}
            <!-- svelte-ignore a11y_autofocus -->
            <label>Nome<input class="field" bind:value={addName} placeholder="Goblin" autofocus={!camp?.sheets.length} /></label>
            <div class="grid">
              <label>Quantos<input class="field mono" type="number" min="1" max="30" bind:value={addCount} /></label>
              <label>Mod. inic.<input class="field mono" bind:value={addMod} inputmode="numeric" /></label>
              <label>PV<input class="field mono" bind:value={addHp} inputmode="numeric" /></label>
              <label>CA<input class="field mono" bind:value={addAc} inputmode="numeric" /></label>
            </div>
            <div class="chips" role="radiogroup" aria-label="Lado">
              {#each ['inimigo', 'aliado', 'grupo'] as sd (sd)}<button type="button" class="chip" class:on={addSide === sd} onclick={() => (addSide = sd as typeof addSide)}>{sides[sd]}</button>{/each}
            </div>
            {#if addCount > 1}<p class="dim small">Vão entrar numerados: {addName || 'Nome'} 1, {addName || 'Nome'} 2…</p>{/if}
            <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button><button class="primary" disabled={!addName.trim()}>Adicionar</button></div>
          </form>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .combat { display: grid; gap: 12px; align-content: start; }
  .head { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .head select { flex: 1 1 200px; max-width: 360px; }
  .turnbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .round { display: flex; align-items: baseline; gap: 8px; }
  .round .lbl { font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .round b { font: 700 26px/1 var(--f-display); color: var(--ember); }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; }

  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .list li { display: grid; grid-template-columns: 52px minmax(0, 1fr) 110px auto auto; align-items: center; gap: 10px; padding: 8px 10px;
    border: 1px solid var(--line); border-radius: 13px; background: var(--surface); position: relative;
    transition: border-color var(--dur), box-shadow var(--dur), opacity var(--dur); }
  .list li[data-side='grupo'] { box-shadow: inset 3px 0 0 var(--ok); }
  .list li[data-side='aliado'] { box-shadow: inset 3px 0 0 #7fb6ff; }
  .list li[data-side='inimigo'] { box-shadow: inset 3px 0 0 var(--crit); }
  .list li.active { border-color: var(--ember); box-shadow: inset 3px 0 0 var(--ember), 0 0 24px -10px var(--ember-glow); background: color-mix(in srgb, var(--ember) 6%, var(--surface)); }
  .list li.out { opacity: .5; }
  .list li.down .name { text-decoration: line-through; text-decoration-color: var(--crit); }
  .list li.none { display: block; color: var(--muted); font-size: 13px; box-shadow: none; }
  .init input { width: 100%; text-align: center; font-size: 16px; font-weight: 700; padding: 5px 2px; }
  .init .roll-btn { width: 100%; padding: 5px 0; }
  .who { display: grid; gap: 4px; min-width: 0; }
  .name { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font: 600 14.5px var(--f-display); }
  .side, .ac { font: 500 10.5px var(--f-mono); color: var(--muted); }
  .lnk { border: 0; background: none; padding: 0; font: inherit; color: var(--ink); text-decoration: underline dotted color-mix(in srgb, var(--ember) 60%, transparent); }
  .lnk:hover { color: var(--ember); }
  .conds { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .addc { border: 0; background: none; padding: 0 4px; font-size: 11.5px; color: var(--muted); }
  .addc:hover { color: var(--ember); }
  .condpick { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 4px; }
  .condpick .chip { font: 12px var(--f-body); padding: 2px 8px; }
  .hp { display: grid; gap: 4px; }
  .hpn { font-size: 15px; font-weight: 700; }
  .hpn small { color: var(--muted); font-weight: 400; font-size: 12px; }
  .dmg { display: flex; align-items: center; gap: 2px; }
  .dmg input { width: 52px; padding: 4px 6px; font-size: 13px; text-align: center; }
  .dmg .icon { font: 700 16px var(--f-mono); }
  .adds { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }

  @media (max-width: 720px) {
    .list li { grid-template-columns: 46px minmax(0, 1fr) auto; grid-template-areas: "init who x" "hp hp dmg"; row-gap: 6px; }
    .init { grid-area: init; }
    .who { grid-area: who; }
    .hp { grid-area: hp; }
    .dmg { grid-area: dmg; }
    .list li > .danger { grid-area: x; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
