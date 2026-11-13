<script lang="ts">
  import {
    CLASSES, CONDITIONS, SPECIES, addSheet, applyHp, deathSave, hasSheet, hpGain, imageOf, initFormula, levelUp, longRest, noteName,
    parseProps, readCharacter, setDeath, setProps, shortRest, signed, spendHitDie, systemOf, toggleInList, type PropValue,
  } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { mesa } from './mesa.svelte';
  import Portrait from './Portrait.svelte';
  import Abilities from './ficha/Abilities.svelte';
  import Attacks from './ficha/Attacks.svelte';
  import EditField from './ficha/EditField.svelte';
  import Features from './ficha/Features.svelte';
  import Gear from './ficha/Gear.svelte';
  import Spells from './ficha/Spells.svelte';
  import Story from './ficha/Story.svelte';
  import Turn from './ficha/Turn.svelte';
  import type { FichaCtx } from './ficha/ctx';
  import './mesa.css';

  let { path, compact = false, portrait = true, onOpenNote }: {
    path: string;
    compact?: boolean;
    /** false quando a tela em volta já mostra o retrato (Mundos) */
    portrait?: boolean;
    onOpenNote?: (p: string) => void;
  } = $props();

  const text = $derived.by(() => { void cadernos.rev; void mesa.rev; return cadernos.read(path); });
  const fm = $derived(parseProps(text));
  const has = $derived(hasSheet(fm));
  const c = $derived(readCharacter(text, mesa.campaign?.system));
  const s = $derived(c.sheet);
  const name = $derived(noteName(path));
  const is5e = $derived(s.system === '5e');
  const playerKey = $derived(Object.keys(fm).find((k) => /^(jogador|jogadora|player)$/i.test(k)) ?? 'jogador');

  type Tab = 'turno' | 'combate' | 'magias' | 'caracteristicas' | 'equipamento' | 'historia';
  const TABS: Array<[Tab, string]> = [['turno', 'Turno'], ['combate', 'Combate'], ['magias', 'Magias'], ['caracteristicas', 'Características'], ['equipamento', 'Equipamento'], ['historia', 'História']];
  const TAB_KEY = 'tanden.ficha.aba';
  let tab = $state<Tab>((() => { try { return (localStorage.getItem(TAB_KEY) as Tab | null) ?? 'combate'; } catch { return 'combate'; } })());
  function pickTab(t: Tab) {
    tab = t;
    try { localStorage.setItem(TAB_KEY, t); } catch { /* sem armazenamento */ }
  }

  let mode = $state<'normal' | 'vantagem' | 'desvantagem'>('normal');
  let amount = $state('');
  let editing = $state<string | null>(null);
  let draft = $state('');
  let xpAdd = $state('');
  let notice = $state('');
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  function flash(m: string) {
    notice = m;
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = ''), 5000);
  }

  // ---------------------------------------------------------------- escrita e rolagens
  function write(patch: Record<string, PropValue | null>) {
    cadernos.update(path, (t) => setProps(t, patch));
  }
  function update(fn: (t: string) => string) {
    cadernos.update(path, fn);
  }
  const penalty = (f: string) => (c.d20Penalty ? `${f}-${c.d20Penalty}` : f);
  const withMode = (f: string) => (mode === 'normal' ? f : `${f} ${mode}`);
  function rollD20(bonus: number, label: string) {
    const b = bonus - c.d20Penalty;
    mesa.roll(withMode(`1d20${b === 0 ? '' : b > 0 ? `+${b}` : b}`), { who: name, label, from: path });
  }
  function rollF(f: string, label: string, d20 = false) {
    return mesa.roll(d20 ? withMode(penalty(f)) : f, { who: name, label, from: path });
  }

  const x: FichaCtx = $derived({ path, name, text, c, compact, write, update, rollD20, rollF, onOpenNote });

  // ---------------------------------------------------------------- PV
  function hp(sign: 1 | -1) {
    const n = Math.abs(Math.round(Number(amount.replace(',', '.'))));
    if (!Number.isFinite(n) || n === 0) return;
    const r = applyHp({ hp: s.hp ?? s.hpMax ?? c.hpMaxAuto, hpMax: s.hpMax ?? c.hpMaxAuto, hpTemp: s.hpTemp }, sign * n);
    const patch: Record<string, PropValue | null> = { [s.keys.hp]: String(r.hp) };
    if (s.hpTemp !== null || r.hpTemp) patch[s.keys.hpTemp] = r.hpTemp ? String(r.hpTemp) : null;
    // cura tira do chão: zera os testes contra a morte
    if (sign < 0 && (s.hp ?? 1) <= 0 && r.hp > 0) Object.assign(patch, { [c.keys.deathSuccess]: null, [c.keys.deathFail]: null });
    write(patch);
    amount = '';
  }
  function setTemp() {
    const n = Math.abs(Math.round(Number(amount.replace(',', '.'))));
    if (!Number.isFinite(n)) return;
    // PV temporários não somam: fica o maior
    write({ [s.keys.hpTemp]: n ? String(Math.max(n, s.hpTemp ?? 0)) : null });
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

  const maxHp = $derived(s.hpMax ?? c.hpMaxAuto);
  const curHp = $derived(s.hp ?? maxHp);
  const pctHp = $derived(curHp !== null && maxHp ? Math.max(0, Math.min(1, curHp / maxHp)) : null);
  const down = $derived(is5e && curHp !== null && curHp <= 0);

  // ---------------------------------------------------------------- XP e nível
  const xpPct = $derived(c.xp !== null && c.xpNext ? Math.max(0, Math.min(1, (c.xp - c.xpFloor) / (c.xpNext - c.xpFloor))) : null);
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  function addXp() {
    const n = Math.round(Number(xpAdd.replace(/\./g, '').replace(',', '.')));
    if (!Number.isFinite(n) || n === 0) return;
    write({ [c.keys.xp]: String(Math.max(0, (c.xp ?? 0) + n)) });
    xpAdd = '';
  }

  let lvDialog = $state(false);
  let lvClass = $state('');
  let lvNew = $state('');
  function openLevelUp() {
    lvClass = c.classes[0]?.name ?? '';
    lvNew = '';
    lvDialog = true;
  }
  const lvTarget = $derived(lvClass === '__nova' ? lvNew : lvClass);
  const lvDie = $derived(
    CLASSES.find((k) => k.name === lvTarget)?.die ?? c.classes.find((k) => k.name === lvTarget)?.info?.die ?? c.hitDice[0]?.die ?? 8,
  );
  const conMod = $derived(s.attrs.find((a) => a.key === 'con')?.mod ?? 0);
  function doLevelUp(rolled: boolean) {
    let r: number | undefined;
    if (rolled) {
      const res = rollF(`1d${lvDie}`, `PV do nível ${c.level + 1}`);
      if (typeof res === 'string' || !res[0]) return;
      r = res[0].total;
    }
    const before = { prof: s.prof, slots: c.slots.map((v) => v.total).join('/') };
    let out = { level: c.level, gain: 0, klass: '', text };
    update((t) => {
      out = levelUp(t, { klass: lvTarget || undefined, roll: r });
      return out.text;
    });
    lvDialog = false;
    const after = readCharacter(out.text, mesa.campaign?.system);
    const extras = [
      `+${out.gain} PV`,
      after.sheet.prof !== before.prof ? `proficiência ${signed(after.sheet.prof)}` : '',
      after.slots.map((v) => v.total).join('/') !== before.slots ? 'novos espaços de magia' : '',
      [4, 8, 12, 16, 19].includes(out.level) ? 'ganha um Talento (ou +2 em atributos)' : '',
    ].filter(Boolean);
    flash(`Nível ${out.level}${out.klass ? ` · ${out.klass}` : ''}! ${extras.join(' · ')}`);
  }

  // ---------------------------------------------------------------- dados de vida, morte, descansos
  function spendDie(die: number) {
    const res = rollF(`1d${die}${conMod ? (conMod > 0 ? `+${conMod}` : conMod) : ''}`, `Dado de vida (d${die})`);
    if (typeof res === 'string' || !res[0]) return;
    const heal = Math.max(0, res[0].total);
    update((t) => {
      let out = spendHitDie(t, die);
      const r = applyHp({ hp: curHp, hpMax: maxHp, hpTemp: s.hpTemp }, -heal);
      out = setProps(out, { [s.keys.hp]: String(r.hp) });
      return out;
    });
  }
  function rollDeath() {
    const res = rollF('1d20', 'Teste contra a morte');
    if (typeof res === 'string' || !res[0]) return;
    const nat = res[0].groups[0]?.dice.find((d) => d.kept)?.value ?? res[0].total;
    const r = deathSave(c.death, nat);
    if (r.revived) {
      update((t) => setProps(setDeath(t, 0, 0), { [s.keys.hp]: '1' }));
      flash('20 natural! Volta com 1 PV');
      return;
    }
    update((t) => setDeath(t, r.success, r.fail));
    if (r.dead) flash('Três falhas: o personagem morreu');
    else if (r.stable) flash('Três sucessos: estável (0 PV, inconsciente)');
  }
  function markDeath(kind: 'success' | 'fail', n: number) {
    const cur = c.death[kind];
    const v = cur === n ? n - 1 : n;
    update((t) => setDeath(t, kind === 'success' ? v : c.death.success, kind === 'fail' ? v : c.death.fail));
  }
  function rest(kind: 'curto' | 'longo') {
    update(kind === 'curto' ? shortRest : longRest);
    flash(kind === 'curto' ? 'Descanso curto: gaste dados de vida para curar (cartão Dados de vida)' : 'Descanso longo: PV cheios, dados de vida e espaços recuperados');
  }

  let condPick = $state('');
  const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);
</script>

<div class="rpg sheet" class:compact>
  {#if !has}
    <div class="nosheet">
      <p class="dim small">Esta ficha ainda não tem números de jogo.</p>
      <button class="ghost sm" onclick={() => update((t) => addSheet(t, systemOf(mesa.campaign?.system)))}>+ Ficha de jogo</button>
    </div>
  {:else}
    <!-- identidade -->
    <header class="id">
      {#if portrait}<Portrait target={imageOf(fm)} {name} size={compact ? 64 : 84} onpick={(p) => write({ imagem: `[[${p}]]` })} />{/if}
      <div class="idmain">
        <div class="nameline">
          <h2 class="cname">{name}</h2>
        </div>
        <div class="idgrid">
          <EditField label="Espécie" value={c.species} options={SPECIES.map((v) => v.name)} onsave={(v) => write({ [c.keys.species]: v || null })} />
          <EditField label="Classe" value={String(fm[c.keys.klass] ?? '')} placeholder="Ex.: Guerreiro ou Guerreiro 3 / Mago 2" options={CLASSES.map((v) => v.name)} onsave={(v) => write({ [c.keys.klass]: v || null })} />
          <EditField label="Antecedente" value={c.background} onsave={(v) => write({ [c.keys.background]: v || null })} />
          <EditField label="Subclasse" value={c.subclass} onsave={(v) => write({ [c.keys.subclass]: v || null })} />
          <EditField label="Pronomes" value={c.pronouns} placeholder="ela/dela, ele/dele…" onsave={(v) => write({ [c.keys.pronouns]: v || null })} />
          <EditField label="Jogador(a)" value={s.player} onsave={(v) => write({ [playerKey]: v || null })} />
        </div>
      </div>
      {#if is5e}
        <div class="lvl">
          {#if editing === c.keys.level}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field mono lvin" bind:value={draft} autofocus inputmode="numeric" aria-label="Nível" onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} />
          {:else}
            <button class="medal" class:ready={c.canLevelUp} onclick={() => startEdit(c.keys.level, c.level)} title="Editar nível"><b>{c.level}</b><span>Nível</span></button>
          {/if}
          <div class="xp">
            {#if xpPct !== null}<div class="xpbar" title={`${fmt(c.xp ?? 0)} XP`}><i style:width="{xpPct * 100}%"></i></div>{/if}
            <span class="xpn mono">{c.xp !== null ? fmt(c.xp) : '0'}{#if c.xpNext} / {fmt(c.xpNext)}{/if} XP</span>
            <form class="xpf" onsubmit={(e) => { e.preventDefault(); addXp(); }}>
              <input class="field mono" bind:value={xpAdd} placeholder="+XP" inputmode="numeric" aria-label="XP ganho" />
            </form>
          </div>
          {#if c.level < 20}
            <button class={c.canLevelUp ? 'primary sm up' : 'ghost sm'} onclick={openLevelUp}>{c.canLevelUp ? '▲ Subir de nível' : '+ Nível'}</button>
          {/if}
        </div>
      {/if}
    </header>

    {#if notice}<p class="notice" role="status">{notice}</p>{/if}

    <!-- vitais -->
    <div class="vitals">
      <div class="card ac" title={s.acAuto ? 'Calculada pela armadura vestida e escudo (aba Equipamento). Clique para fixar um valor.' : 'Clique para editar; apague para voltar ao cálculo automático'}>
        <span class="lbl">CA</span>
        {#if editing === s.keys.ac}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field mono tiny" bind:value={draft} autofocus aria-label="CA" onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} />
        {:else}
          <button class="big" onclick={() => startEdit(s.keys.ac, s.acAuto ? '' : s.ac)}>{s.ac ?? '—'}</button>
        {/if}
        <button class="shieldt" class:on={c.shield} onclick={() => write({ [c.keys.shield]: c.shield ? null : 'sim' })} title="Escudo (+2)"><i></i>Escudo</button>
        {#if s.acAuto}<small class="dim auto">auto</small>{/if}
      </div>

      <div class="card hp" class:down>
        <div class="hphead">
          <span class="lbl">Pontos de vida</span>
          {#if s.hpTemp}<span class="temp" title="PV temporários">+{s.hpTemp} temp.</span>{/if}
        </div>
        <div class="hpnum">
          {#if editing === s.keys.hp}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field mono tiny" bind:value={draft} autofocus aria-label="PV atuais" onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} />
          {:else}
            <button class="big" onclick={() => startEdit(s.keys.hp, curHp)} title="Editar PV atuais">{curHp ?? '—'}</button>
          {/if}
          <span class="dim sl">/</span>
          {#if editing === s.keys.hpMax}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field mono tiny" bind:value={draft} autofocus aria-label="PV máximo" onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} />
          {:else}
            <button class="mid" onclick={() => startEdit(s.keys.hpMax, s.hpMax)} title={s.hpMax === null && c.hpMaxAuto !== null ? 'Calculado pela classe e Constituição' : 'Editar PV máximo'}>{maxHp ?? '—'}</button>
          {/if}
          {#if is5e && c.hpMaxAuto !== null && s.hpMax !== null && s.hpMax !== c.hpMaxAuto}
            <button class="sugg" onclick={() => write({ [s.keys.hpMax]: String(c.hpMaxAuto) })} title="PV máximo pela média do dado de vida + Con por nível">média: {c.hpMaxAuto}</button>
          {/if}
        </div>
        {#if pctHp !== null}<div class="hpbar"><i style:width="{pctHp * 100}%" class:mid={pctHp <= 0.5} class:low={pctHp <= 0.25}></i></div>{/if}
        <form class="dmg" onsubmit={(e) => { e.preventDefault(); hp(1); }}>
          <input class="field mono tiny" bind:value={amount} inputmode="numeric" placeholder="0" aria-label="Quantidade" />
          <button type="submit" class="ghost sm" title="Dano (gasta os PV temporários primeiro)">Dano</button>
          <button type="button" class="ghost sm" onclick={() => hp(-1)} title="Cura (até o máximo)">Cura</button>
          <button type="button" class="ghost sm" onclick={setTemp} title="PV temporários (fica o maior)">Temp.</button>
        </form>
      </div>

      {#if is5e}
        <div class="card hd">
          <span class="lbl">Dados de vida</span>
          {#each c.hitDice as d (d.die)}
            <div class="hdrow">
              <b class="mono">{d.total - d.spent}<small>/{d.total}</small> d{d.die}</b>
              <button class="ghost sm" disabled={d.spent >= d.total} onclick={() => spendDie(d.die)} title={`Rola 1d${d.die}${conMod ? signed(conMod) : ''} e cura`}>Gastar</button>
            </div>
          {/each}
          <small class="dim">gastos: {c.hitDice.reduce((n, d) => n + d.spent, 0)}</small>
        </div>

        <div class="card death" class:alert={down}>
          <span class="lbl">Testes contra a morte</span>
          <div class="drow"><small>Sucessos</small>
            <span class="dias">{#each [1, 2, 3] as n (n)}<button class="dia ok" class:on={n <= c.death.success} onclick={() => markDeath('success', n)} aria-label={`Sucesso ${n}`}></button>{/each}</span>
          </div>
          <div class="drow"><small>Falhas</small>
            <span class="dias">{#each [1, 2, 3] as n (n)}<button class="dia bad" class:on={n <= c.death.fail} onclick={() => markDeath('fail', n)} aria-label={`Falha ${n}`}></button>{/each}</span>
          </div>
          <button class={down ? 'primary sm' : 'ghost sm'} onclick={rollDeath}>Rolar</button>
        </div>
      {/if}
    </div>

    <!-- números de apoio -->
    <div class="strip">
      {#if is5e}<div class="mini"><span class="lbl">Proficiência</span><b>{signed(s.prof)}</b></div>{/if}
      <button class="mini roll-btn" onclick={() => rollF(initFormula(s), 'Iniciativa', true)} title="Rolar iniciativa"><span class="lbl">Iniciativa</span><b>{signed(s.init)}</b></button>
      <div class="mini">
        <span class="lbl">Deslocamento</span>
        {#if editing === c.keys.speed}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field mono tiny" bind:value={draft} autofocus aria-label="Deslocamento" onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} />
        {:else}
          <button class="b" onclick={() => startEdit(c.keys.speed, c.speedAuto ? '' : c.speed)} title={c.speedAuto ? 'Pela espécie' : 'Editar'}>
            {c.speed || '—'}{#if c.exhaustion} <small class="neg">−{String(c.exhaustion * 1.5).replace('.', ',')}</small>{/if}
          </button>
        {/if}
      </div>
      {#if is5e}
        <div class="mini"><span class="lbl">Tamanho</span>
          {#if editing === c.keys.size}
            <!-- svelte-ignore a11y_autofocus -->
            <input class="field tiny" bind:value={draft} autofocus aria-label="Tamanho" onblur={saveEdit} onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} />
          {:else}
            <button class="b sm" onclick={() => startEdit(c.keys.size, c.sizeAuto ? '' : c.size)} title={c.sizeAuto ? 'Pela espécie' : 'Editar'}>{c.size || '—'}</button>
          {/if}
        </div>
        <div class="mini" title={`Intuição passiva ${c.passive.insight} · Investigação passiva ${c.passive.investigation}`}><span class="lbl">Percepção passiva</span><b>{c.passive.perception}</b></div>
        <button class="mini insp" class:on={c.inspiration} onclick={() => write({ [c.keys.inspiration]: c.inspiration ? null : 'sim' })} title="Inspiração heroica: rerrole um dado (clique para ganhar/gastar)">
          <span class="lbl">Inspiração</span><i class="star">✦</i>
        </button>
        <div class="mini exh" class:on={c.exhaustion > 0} title="Exaustão (2024): −2 em testes de d20 e −1,5 m de deslocamento por nível; 6 = morte">
          <span class="lbl">Exaustão</span>
          <span class="step">
            <button onclick={() => write({ [c.keys.exhaustion]: c.exhaustion > 1 ? String(c.exhaustion - 1) : null })} disabled={!c.exhaustion} aria-label="Menos exaustão">−</button>
            <b>{c.exhaustion}</b>
            <button onclick={() => write({ [c.keys.exhaustion]: String(Math.min(6, c.exhaustion + 1)) })} disabled={c.exhaustion >= 6} aria-label="Mais exaustão">+</button>
          </span>
        </div>
      {/if}
    </div>

    <div class="toolbar">
      <div class="conds">
        {#each c.conditions as k (k)}
          <span class="tag">{k}<button onclick={() => update((t) => toggleInList(t, 'conditions', k))} aria-label={`Tirar ${k}`}>×</button></span>
        {/each}
        <select class="field condsel" bind:value={condPick} onchange={() => { if (condPick) update((t) => toggleInList(t, 'conditions', condPick)); condPick = ''; }} aria-label="Adicionar condição">
          <option value="">+ Condição</option>
          {#each CONDITIONS.filter((k) => k !== 'exausto' && !c.conditions.some((v) => v.toLowerCase() === k)) as k (k)}<option value={cap(k)}>{cap(k)}</option>{/each}
        </select>
      </div>
      <div class="acts">
        <span class="modes" role="radiogroup" aria-label="Vantagem nas rolagens de d20">
          {#each [['normal', 'Normal'], ['vantagem', 'Vant.'], ['desvantagem', 'Desv.']] as [id, label] (id)}
            <button role="radio" aria-checked={mode === id} class:on={mode === id} onclick={() => (mode = id as typeof mode)} title={id === 'normal' ? 'Sem vantagem' : id}>{label}</button>
          {/each}
        </span>
        {#if is5e}
          <button class="ghost sm" onclick={() => rest('curto')} title="Devolve espaços de pacto; gaste dados de vida para curar">Descanso curto</button>
          <button class="ghost sm" onclick={() => rest('longo')} title="PV cheios, dados de vida, espaços, testes contra a morte e −1 de exaustão">Descanso longo</button>
        {/if}
      </div>
    </div>

    <!-- abas -->
    <div class="ftabs" role="tablist">
      {#each TABS as [id, label] (id)}
        {#if id !== 'magias' || is5e || c.spells.length}
          <button role="tab" aria-selected={tab === id} class:on={tab === id} onclick={() => pickTab(id)}>
            {label}{#if id === 'magias' && c.slots.length}<small>{c.slots.reduce((n, v) => n + v.total - v.spent, 0) + (c.pact ? c.pact.total - c.pact.spent : 0)}</small>{/if}
          </button>
        {/if}
      {/each}
    </div>

    <div class="tabc">
      {#if tab === 'turno'}
        <Turn {x} />
      {:else if tab === 'combate'}
        <Abilities {x} />
        <h3>Armas e truques de dano</h3>
        <Attacks {x} />
        {#if s.rolls.length}
          <h3>Rolagens</h3>
          <div class="chips">{#each s.rolls as r (r.name)}<button class="chip" onclick={() => rollF(r.formula, r.name, /d20/i.test(r.formula))} title={r.formula}>{r.name}</button>{/each}</div>
        {/if}
        <p class="dim small tip">Fórmulas aceitam <code>@for</code>, <code>@des</code>, <code>@prof</code>, <code>@nível</code>. Tudo fica na própria nota{#if onOpenNote}&nbsp;(<button class="lnk" onclick={() => onOpenNote?.(path)}>abrir</button>){/if}.</p>
      {:else if tab === 'magias'}
        <Spells {x} />
      {:else if tab === 'caracteristicas'}
        <Features {x} />
      {:else if tab === 'equipamento'}
        <Gear {x} />
      {:else}
        <Story {x} />
      {/if}
    </div>
  {/if}

  {#if lvDialog}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) lvDialog = false; }}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Subir de nível">
        <h2>Subir para o nível {c.level + 1}</h2>
        <label>Em qual classe
          <select class="field" bind:value={lvClass}>
            {#each c.classes as k (k.name)}<option value={k.name}>{k.info?.name ?? k.name} ({k.level} → {k.level + 1})</option>{/each}
            {#if !c.classes.length}<option value="">Sem classe</option>{/if}
            <option value="__nova">Outra classe (multiclasse)…</option>
          </select>
        </label>
        {#if lvClass === '__nova'}
          <label>Nova classe
            <select class="field" bind:value={lvNew}>
              <option value="">Escolha…</option>
              {#each CLASSES.filter((k) => !c.classes.some((v) => v.info?.key === k.key)) as k (k.key)}<option value={k.name}>{k.name} (d{k.die})</option>{/each}
            </select>
          </label>
        {/if}
        <p class="dim small">Pontos de vida: d{lvDie} + Con ({signed(conMod)}). Proficiência, espaços de magia e dados de vida se ajustam sozinhos.</p>
        <div class="formacts">
          <button class="ghost" onclick={() => (lvDialog = false)}>Cancelar</button>
          <button class="ghost" disabled={lvClass === '__nova' && !lvNew} onclick={() => doLevelUp(true)}>Rolar d{lvDie}</button>
          <button class="primary" disabled={lvClass === '__nova' && !lvNew} onclick={() => doLevelUp(false)}>Média (+{hpGain(lvDie, conMod)} PV)</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .sheet { display: grid; gap: 12px; container-type: inline-size; }
  .nosheet { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .nosheet p { margin: 0; }
  .lbl { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .card { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 9px 12px; min-width: 0; }
  .tiny { width: 64px; padding: 3px 6px !important; font-size: 13px !important; }

  /* identidade */
  .id { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 12px 14px;
    border: 1px solid var(--line); border-radius: 18px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--ember) 7%, var(--surface)), var(--surface) 60%); }
  .id:not(:has(> :global(.portrait))) { grid-template-columns: minmax(0, 1fr) auto; }
  .idmain { display: grid; gap: 8px; min-width: 0; }
  .nameline { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .cname { margin: 0; font: 600 22px/1.1 var(--f-display) !important; letter-spacing: .02em !important; text-transform: none !important; color: var(--ink) !important; }
  .idgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 8px 16px; }
  .lvl { display: grid; justify-items: center; gap: 6px; min-width: 120px; }
  .medal { width: 74px; height: 74px; border-radius: 50%; border: 2px solid var(--line); background: var(--void); display: grid; place-content: center;
    color: var(--ink); transition: border-color var(--dur), box-shadow var(--dur); }
  .medal b { font: 700 30px/1 var(--f-display); }
  .medal span { font: 600 8.5px var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .medal:hover { border-color: var(--ember); }
  .medal.ready { border-color: var(--ember); box-shadow: 0 0 0 4px color-mix(in srgb, var(--ember) 18%, transparent), 0 0 24px -4px var(--ember-glow, var(--ember)); }
  .lvin { width: 74px; text-align: center; font-size: 20px !important; }
  .xp { display: grid; gap: 4px; justify-items: center; width: 100%; }
  .xpbar { width: 100%; height: 4px; border-radius: 2px; background: var(--void); overflow: hidden; border: 1px solid var(--line); }
  .xpbar i { display: block; height: 100%; background: var(--ember); transition: width var(--dur-slow) var(--ease); }
  .xpn { font-size: 11px; color: var(--silver); white-space: nowrap; }
  .xpf input { width: 84px; padding: 3px 6px; font-size: 12px; text-align: center; }
  .up { animation: glow 2.4s var(--ease) infinite; }
  @keyframes glow { 50% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ember) 22%, transparent); } }
  .notice { margin: 0; padding: 8px 12px; border-radius: 10px; font-size: 13px; background: color-mix(in srgb, var(--ember) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--ember) 40%, transparent); }

  /* vitais */
  .vitals { display: grid; grid-template-columns: 96px minmax(min(240px, 100%), 2fr) minmax(min(140px, 100%), 1fr) minmax(min(150px, 100%), 1fr); gap: 10px; align-items: stretch; }
  .ac { display: grid; justify-items: center; align-content: center; gap: 2px; position: relative;
    border-radius: 14px 14px 46px 46px; padding-bottom: 14px; }
  .big { border: 0; background: none; padding: 0; font: 700 30px/1 var(--f-display); color: var(--ink); font-variant-numeric: tabular-nums; }
  .mid { border: 0; background: none; padding: 0; font: 600 18px var(--f-display); color: var(--muted); }
  button.big:hover, button.mid:hover { color: var(--ember); }
  .auto { font-size: 10px; }
  .shieldt { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; padding: 0; font-size: 11px; color: var(--muted); }
  .shieldt i, .dia { width: 10px; height: 10px; transform: rotate(45deg); border: 1.5px solid var(--muted); border-radius: 2px; flex: none; background: none; padding: 0; }
  .shieldt.on { color: var(--ink); }
  .shieldt.on i { background: var(--ember); border-color: var(--ember); }
  .hp { display: grid; gap: 6px; }
  .hp.down { border-color: var(--crit); }
  .hphead { display: flex; justify-content: space-between; align-items: center; }
  .hpnum { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
  .sl { font-size: 18px; }
  .temp { font: 600 12px var(--f-mono); color: #7fb6ff; }
  .sugg { border: 1px dashed var(--line); background: none; border-radius: 999px; padding: 1px 8px; font: 11px var(--f-mono); color: var(--muted); margin-left: auto; }
  .sugg:hover { border-color: var(--ember); color: var(--ink); }
  .dmg { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
  .hd, .death { display: grid; gap: 6px; align-content: start; }
  .hdrow { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .hdrow b { font-size: 15px; }
  .hdrow small { color: var(--muted); font-weight: 400; }
  .death.alert { border-color: var(--crit); background: color-mix(in srgb, var(--crit) 6%, var(--surface)); }
  .drow { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--silver); }
  .dias { display: flex; gap: 7px; }
  .dia { width: 12px; height: 12px; cursor: pointer; }
  .dia.ok.on { background: var(--ok); border-color: var(--ok); }
  .dia.bad.on { background: var(--crit); border-color: var(--crit); }
  .death > button { justify-self: start; }

  /* faixa de números */
  .strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(84px, 100%), 1fr)); gap: 8px; }
  .strip .lbl { letter-spacing: .08em; }
  .mini { display: grid; justify-items: center; align-content: center; gap: 3px; border: 1px solid var(--line); border-radius: 12px; padding: 7px 6px;
    background: var(--surface); text-align: center; min-height: 58px; color: var(--ink); }
  .mini b { font: 700 18px/1 var(--f-display); font-variant-numeric: tabular-nums; }
  .mini .b { border: 0; background: none; padding: 0; font: 700 16px/1 var(--f-display); color: var(--ink); }
  .mini .b.sm { font: 600 12.5px/1.2 var(--f-body); }
  .mini .b:hover { color: var(--ember); }
  .neg { color: var(--crit); font: 600 11px var(--f-mono); }
  .insp .star { font-style: normal; font-size: 20px; line-height: 1; color: var(--muted); opacity: .4; transition: all var(--dur) var(--spring); }
  .insp.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, var(--surface)); }
  .insp.on .star { color: var(--ember); opacity: 1; transform: scale(1.15); text-shadow: 0 0 12px var(--ember); }
  .exh.on { border-color: color-mix(in srgb, var(--crit) 60%, var(--line)); }
  .step { display: inline-flex; align-items: center; gap: 8px; }
  .step button { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); padding: 0; line-height: 1; }
  .step button:disabled { opacity: .35; }

  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .conds { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .condsel { padding: 3px 8px !important; font-size: 12.5px !important; width: auto; }
  .acts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .modes { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); }
  .modes button { border: 0; background: none; border-radius: 7px; padding: 2px 8px; font-size: 12px; color: var(--muted); }
  .modes button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }

  .ftabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: none; }
  .ftabs button { border: 0; background: none; padding: 8px 12px; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap;
    font: 600 11.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; display: inline-flex; gap: 6px; align-items: center; }
  .ftabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .ftabs small { font: 600 10px var(--f-mono); padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--ember) 20%, transparent); color: var(--ember-soft); }
  .tabc { display: grid; gap: 4px; min-width: 0; }
  .tip { margin: 10px 0 0; }
  .lnk { border: 0; background: none; padding: 0; color: var(--ember-soft); font: inherit; text-decoration: underline dotted; }

  @container (max-width: 760px) {
    .vitals { grid-template-columns: 96px minmax(0, 1fr) minmax(0, 1fr); }
    .vitals .hp { grid-column: 2 / -1; }
    .vitals .hd { grid-column: 1 / 3; }
    .id { grid-template-columns: minmax(0, 1fr) auto; }
    .id > :global(.portrait) { display: none; }
  }
  @container (max-width: 420px) {
    .vitals { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .vitals .hp { grid-column: 1 / -1; order: -1; }
    .vitals .hd { grid-column: auto; }
    .vitals .death { grid-column: 1 / -1; }
    .id { grid-template-columns: minmax(0, 1fr); }
    .lvl { grid-template-columns: auto minmax(0, 1fr) auto; justify-items: start; align-items: center; width: 100%; }
    .medal { width: 58px; height: 58px; }
    .medal b { font-size: 24px; }
    .toolbar .acts { width: 100%; }
  }
</style>
