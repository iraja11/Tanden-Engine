<script lang="ts">
  import {
    ATTRS, SKILLS_5E, addSheet, applyHp, attackFormula, d20, hasSheet, initFormula, noteName, parseProps, readSheet,
    saveBonus, setProps, signed, skillBonus, systemOf, type PropValue,
  } from '@tanden/core';
  import { untrack } from 'svelte';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { mesa } from './mesa.svelte';
  import './mesa.css';

  let { path, compact = false, onOpenNote }: { path: string; compact?: boolean; onOpenNote?: (p: string) => void } = $props();

  const text = $derived.by(() => { void cadernos.rev; void mesa.rev; return cadernos.read(path); });
  const fm = $derived(parseProps(text));
  const has = $derived(hasSheet(fm));
  const s = $derived(readSheet(text, mesa.campaign?.system));
  const name = $derived(noteName(path));
  let mode = $state<'normal' | 'vantagem' | 'desvantagem'>('normal');
  let amount = $state('');
  let editing = $state<string | null>(null);
  let draft = $state('');
  let showSkills = $state(untrack(() => !compact));

  /** d20 com a vantagem escolhida */
  const withMode = (f: string) => (mode === 'normal' ? f : `${f} ${mode}`);
  function rollD20(bonus: number, label: string) {
    mesa.roll(withMode(d20(bonus)), { who: name, label, from: path });
  }
  function rollF(f: string, label: string, d20roll = false) {
    mesa.roll(d20roll ? withMode(f) : f, { who: name, label, from: path });
  }

  function write(patch: Record<string, PropValue | null>) {
    cadernos.update(path, (t) => setProps(t, patch));
  }

  function hp(sign: 1 | -1) {
    const n = Math.abs(Math.round(Number(amount.replace(',', '.'))));
    if (!Number.isFinite(n) || n === 0) return;
    const r = applyHp(s, sign * n);
    const patch: Record<string, PropValue | null> = { [s.keys.hp]: String(r.hp) };
    if (s.hpTemp !== null || r.hpTemp) patch[s.keys.hpTemp] = r.hpTemp ? String(r.hpTemp) : null;
    write(patch);
    amount = '';
  }

  function startEdit(key: string, value: number | string | null) {
    editing = key;
    draft = value === null ? '' : String(value);
  }
  function saveEdit() {
    if (editing === null) return;
    const v = draft.trim();
    write({ [editing]: v === '' ? null : v });
    editing = null;
  }

  /** marca/desmarca perícia ou salvaguarda; um terceiro clique vira especialidade (5e) */
  function toggleSkill(skill: string) {
    const prof = s.skills.some((x) => x.toLowerCase() === skill.toLowerCase());
    const exp = s.expertise.some((x) => x.toLowerCase() === skill.toLowerCase());
    const skills = s.skills.filter((x) => x.toLowerCase() !== skill.toLowerCase());
    const expertise = s.expertise.filter((x) => x.toLowerCase() !== skill.toLowerCase());
    if (!prof && !exp) skills.push(skill);
    else if (prof && !exp) { skills.push(skill); expertise.push(skill); }
    write({ [s.keys.skills]: skills.length ? skills : null, [s.keys.expertise]: expertise.length ? expertise : null });
  }
  function toggleSave(key: string) {
    const a = ATTRS.find((x) => x.key === key)!;
    const has = s.saves.some((x) => a.aliases.some((al) => al.toLowerCase() === x.toLowerCase()));
    const next = has ? s.saves.filter((x) => !a.aliases.some((al) => al.toLowerCase() === x.toLowerCase())) : [...s.saves, key];
    write({ [s.keys.saves]: next.length ? next : null });
  }

  const pctHp = $derived(s.hp !== null && s.hpMax ? Math.max(0, Math.min(1, s.hp / s.hpMax)) : null);
  const is5e = $derived(s.system === '5e');
  const sysLabel = $derived(systemOf(mesa.campaign?.system) === s.system && !fm['sistema'] ? `${s.system} (da campanha)` : s.system);
</script>

<div class="rpg sheet" class:compact>
  {#if !has}
    <div class="nosheet">
      <p class="dim small">Esta ficha ainda não tem números de jogo.</p>
      <button class="ghost sm" onclick={() => cadernos.update(path, (t) => addSheet(t, systemOf(mesa.campaign?.system)))}>+ Ficha de jogo</button>
    </div>
  {:else}
    <div class="bar">
      <div class="hp">
        <div class="hpnum">
          <span class="lbl">PV</span>
          {#if editing === s.keys.hp}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field mono tiny" bind:value={draft} autofocus onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} aria-label="PV" />
          {:else}
            <button class="num" onclick={() => startEdit(s.keys.hp, s.hp)} title="Editar PV">{s.hp ?? '—'}</button>
          {/if}
          <span class="dim">/</span>
          {#if editing === s.keys.hpMax}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field mono tiny" bind:value={draft} autofocus onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} aria-label="PV máximo" />
          {:else}
            <button class="num dim" onclick={() => startEdit(s.keys.hpMax, s.hpMax)} title="Editar PV máximo">{s.hpMax ?? '—'}</button>
          {/if}
          {#if s.hpTemp}<span class="temp" title="PV temporários">+{s.hpTemp}</span>{/if}
        </div>
        {#if pctHp !== null}<div class="hpbar"><i style:width="{pctHp * 100}%" class:mid={pctHp <= 0.5} class:low={pctHp <= 0.25}></i></div>{/if}
        <form class="dmg" onsubmit={(e) => { e.preventDefault(); hp(1); }}>
          <input class="field mono tiny" bind:value={amount} inputmode="numeric" placeholder="0" aria-label="Quantidade" />
          <button type="submit" class="ghost sm" title="Dano (gasta os PV temporários primeiro)">Dano</button>
          <button type="button" class="ghost sm" onclick={() => hp(-1)} title="Cura (até o máximo)">Cura</button>
        </form>
      </div>
      <div class="stat">
        <span class="lbl">CA</span>
        {#if editing === s.keys.ac}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field mono tiny" bind:value={draft} autofocus onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} aria-label="CA" />
        {:else}
          <button class="num" onclick={() => startEdit(s.keys.ac, s.ac)} title="Editar CA">{s.ac ?? '—'}</button>
        {/if}
      </div>
      <button class="stat roll-btn" onclick={() => rollF(initFormula(s), 'Iniciativa', true)} title="Rolar iniciativa">
        <span class="lbl">Inic.</span><span class="num">{signed(s.init)}</span>
      </button>
      {#if s.prof}<div class="stat"><span class="lbl">Prof.</span><span class="num">{signed(s.prof)}</span></div>{/if}
      {#if s.speed}<div class="stat"><span class="lbl">Desl.</span><span class="num sm">{s.speed}</span></div>{/if}
    </div>

    <div class="meta">
      {#if s.level !== null}<span>Nível {s.level}</span>{/if}
      {#if s.klass}<span>{s.klass}</span>{/if}
      {#if s.cr}<span>ND {s.cr}</span>{/if}
      {#if s.player}<span>Jogador: {s.player}</span>{/if}
      <span class="dim" title="Mude com a propriedade sistema: 5e ou livre">Sistema {sysLabel}</span>
      <span class="modes" role="radiogroup" aria-label="Vantagem nas rolagens de d20">
        {#each [['normal', '—'], ['vantagem', 'Vant.'], ['desvantagem', 'Desv.']] as [id, label] (id)}
          <button role="radio" aria-checked={mode === id} class:on={mode === id} onclick={() => (mode = id as typeof mode)} title={id === 'normal' ? 'Sem vantagem' : id}>{label}</button>
        {/each}
      </span>
    </div>

    {#if s.attrs.length}
      <div class="attrs">
        {#each s.attrs as a (a.key)}
          <div class="attr">
            <button class="roll-btn main" onclick={() => rollD20(a.mod, `Teste de ${a.label}`)} title={`Teste de ${a.label}`}>
              <span class="lbl">{a.key}</span>
              <span class="mod">{signed(a.mod)}</span>
            </button>
            {#if editing === a.prop}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="field mono tiny" bind:value={draft} autofocus onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} aria-label={a.label} />
            {:else}
              <button class="score" onclick={() => startEdit(a.prop, a.score)} title="Editar valor">{a.score}</button>
            {/if}
            {#if is5e}
              {@const on = s.saves.some((x) => ATTRS.find((y) => y.key === a.key)!.aliases.includes(x.toLowerCase()))}
              <span class="saverow">
                <button class="dot" class:p1={on} onclick={() => toggleSave(a.key)} title={on ? 'Proficiente na salvaguarda (clique para tirar)' : 'Marcar proficiência na salvaguarda'} aria-label={`Proficiência na salvaguarda de ${a.label}`}></button>
                <button class="save" class:on onclick={() => rollD20(saveBonus(s, a.key), `Salvaguarda de ${a.label}`)} title={`Salvaguarda de ${a.label}`}>TR {signed(saveBonus(s, a.key))}</button>
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if s.attacks.length}
      <h3>Ataques</h3>
      <div class="attacks">
        {#each s.attacks as a, i (i)}
          {@const hit = attackFormula(a)}
          <div class="atk">
            <span class="aname">{a.name}{#if a.notes}<small>{a.notes}</small>{/if}</span>
            {#if hit}<button class="roll-btn" onclick={() => rollF(hit, `${a.name}: acerto`, true)} title={hit}>{a.hit.startsWith('+') || a.hit.startsWith('-') ? a.hit : 'Acerto'}</button>{/if}
            {#if a.damage}
              <button class="roll-btn" onclick={() => rollF(a.damage, `${a.name}: dano${a.damageType ? ` (${a.damageType})` : ''}`)} title={`Dano: ${a.damage}`}>{a.damage}{#if a.damageType} <small>{a.damageType}</small>{/if}</button>
              <button class="roll-btn crit" onclick={() => rollF(a.damage.replace(/(\d*)d(\d+)/gi, (_m, n: string, f: string) => `${(Number(n || 1)) * 2}d${f}`), `${a.name}: dano crítico`)} title="Dano de crítico (dobra os dados)">×2</button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if s.rolls.length}
      <h3>Rolagens</h3>
      <div class="chips">{#each s.rolls as r (r.name)}<button class="chip" onclick={() => rollF(r.formula, r.name, /d20/i.test(r.formula))} title={r.formula}>{r.name}</button>{/each}</div>
    {/if}

    {#if is5e && s.attrs.length >= 6}
      <h3><button class="fold" onclick={() => (showSkills = !showSkills)} aria-expanded={showSkills}>{showSkills ? '▾' : '▸'} Perícias</button></h3>
      {#if showSkills}
        <div class="skills">
          {#each SKILLS_5E as sk (sk.name)}
            {@const b = skillBonus(s, sk)}
            <div class="skill">
              <button class="dot" class:p1={b.level === 1} class:p2={b.level === 2} onclick={() => toggleSkill(sk.name)}
                title={b.level === 2 ? 'Especialidade (clique para tirar)' : b.level === 1 ? 'Proficiente (clique para especialidade)' : 'Marcar proficiência'}
                aria-label={`Proficiência em ${sk.name}`}></button>
              <button class="sk" onclick={() => rollD20(b.bonus, sk.name)}><span>{sk.name} <small>{sk.attr}</small></span><b>{signed(b.bonus)}</b></button>
            </div>
          {/each}
        </div>
        <p class="dim small tip">Passivas: Percepção {10 + skillBonus(s, SKILLS_5E.find((x) => x.name === 'Percepção')!).bonus} · Intuição {10 + skillBonus(s, SKILLS_5E.find((x) => x.name === 'Intuição')!).bonus} · Investigação {10 + skillBonus(s, SKILLS_5E.find((x) => x.name === 'Investigação')!).bonus}</p>
      {/if}
    {/if}
    {#if !compact && onOpenNote}
      <p class="dim small tip">Ataques e rolagens ficam nas tabelas <code>## Ataques</code> e <code>## Rolagens</code> da <button class="lnk" onclick={() => onOpenNote?.(path)}>nota</button>. Fórmulas aceitam <code>@for</code>, <code>@des</code>, <code>@prof</code>, <code>@nível</code>.</p>
    {/if}
  {/if}
</div>

<style>
  .sheet { display: grid; gap: 10px; }
  .nosheet { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .nosheet p { margin: 0; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: stretch; }
  .hp { flex: 1 1 220px; display: grid; gap: 6px; border: 1px solid var(--line); border-radius: 12px; padding: 8px 10px; background: var(--surface); }
  .hpnum { display: flex; align-items: baseline; gap: 6px; }
  .stat { display: grid; justify-items: center; align-content: center; gap: 2px; min-width: 62px; border: 1px solid var(--line); border-radius: 12px; padding: 6px 10px; background: var(--surface); }
  .lbl { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .num { border: 0; background: none; padding: 0; font: 700 22px/1 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; }
  .num.sm { font-size: 14px; }
  button.num:hover { color: var(--ember); }
  .num.dim { color: var(--muted); font-size: 16px; }
  .temp { font: 600 13px var(--f-mono); color: #7fb6ff; }
  .tiny { width: 64px; padding: 3px 6px !important; font-size: 13px !important; }
  .dmg { display: flex; gap: 6px; align-items: center; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; font-size: 12.5px; }
  .modes { display: inline-flex; gap: 2px; margin-left: auto; padding: 2px; border-radius: 9px; border: 1px solid var(--line); }
  .modes button { border: 0; background: none; border-radius: 7px; padding: 2px 8px; font-size: 12px; color: var(--muted); }
  .modes button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }

  .attrs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
  .attr { display: grid; gap: 4px; justify-items: stretch; }
  .attr .main { display: grid; justify-items: center; gap: 2px; padding: 8px 0 6px; }
  .attr .mod { font: 700 20px/1 var(--f-display); }
  .score { border: 0; background: none; font: 12px var(--f-mono); color: var(--muted); padding: 0; }
  .score:hover { color: var(--ember); }
  .saverow { display: flex; align-items: center; gap: 4px; }
  .save { flex: 1; min-width: 0; border: 1px dashed var(--line); background: none; border-radius: 8px; font: 11px var(--f-mono); padding: 2px 0; color: var(--muted); }
  .save.on { border-style: solid; border-color: color-mix(in srgb, var(--ember) 55%, var(--line)); color: var(--ink); }
  .save:hover { border-color: var(--ember); }

  .attacks { display: grid; gap: 6px; }
  .atk { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .aname { flex: 1 1 140px; display: grid; font-weight: 600; font-size: 13.5px; }
  .aname small { font-weight: 400; color: var(--muted); font-size: 11.5px; }
  .atk .roll-btn { padding: 4px 10px; font: 600 12.5px var(--f-mono); }
  .atk .roll-btn small { color: var(--muted); font-weight: 400; font-family: var(--f-body); }
  .atk .crit { color: var(--ember-soft); }

  h3 .fold { border: 0; background: none; padding: 0; font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; }
  .skills { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 2px 12px; }
  .skill { display: flex; align-items: center; gap: 6px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--muted); background: none; padding: 0; flex: none; }
  .dot.p1 { background: var(--ember); border-color: var(--ember); }
  .dot.p2 { background: var(--ember); border-color: var(--ember); box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--ember); }
  .sk { flex: 1; display: flex; justify-content: space-between; gap: 8px; border: 0; background: none; border-radius: 7px; padding: 3px 6px; font-size: 13px; text-align: left; }
  .sk:hover { background: var(--surface-2); }
  .sk small { color: var(--muted); font: 10px var(--f-mono); }
  .sk b { font: 600 12.5px var(--f-mono); }
  .tip { margin: 0; }
  .lnk { border: 0; background: none; padding: 0; color: var(--ember-soft); font: inherit; text-decoration: underline dotted; }

  .compact .attrs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 720px) {
    .attrs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
