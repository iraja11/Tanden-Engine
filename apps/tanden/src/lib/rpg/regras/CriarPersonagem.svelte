<script lang="ts">
  import {
    ABILITY_NAME_PT, ABILITY_ORDER, CLASS_PT, FEAT_CATEGORY_PT, OPTIONAL_TYPE_PT, POINT_BUDGET, POINT_COST, SCHOOL_PT, SKILL_PT, STANDARD_ARRAY,
    abilityOptions, applyCreation, applyOption, classLevelInfo, entriesToHtml, equipmentGroups, expandPacks, grantedFeats, inventoryName,
    itemsOfType, languagePick, moneyText, pointsSpent, prereqText, scoreMod, skillPick, summaryOf, toolPick,
    type AbilityKey, type CompBase, type CSpell, type Edition, type CFeat, type COptional,
  } from '@tanden/core';
  import { compendio } from '../compendio.svelte';
  import CompEntry from './CompEntry.svelte';
  import PickList from './PickList.svelte';
  import '../mesa.css';

  // Assistente de criação de personagem (D&D 5e) pelo compêndio do 5etools.
  let { askName = true, initialName = '', initialPlayer = '', onapply, oncancel }: {
    /** pedir o nome (ficha nova) ou não (ficha que já existe) */
    askName?: boolean;
    initialName?: string;
    initialPlayer?: string;
    onapply: (name: string, apply: (text: string) => string) => void;
    oncancel: () => void;
  } = $props();

  $effect(() => { void compendio.load(); });
  const comp = $derived(compendio.comp);

  const STEPS = ['Classe', 'Origem', 'Atributos', 'Magias', 'Equipamento', 'Detalhes'] as const;
  type Step = (typeof STEPS)[number];
  let step = $state<Step>('Classe');

  let ed = $state<Edition>(compendio.edition);
  let name = $state(initialName);
  let player = $state(initialPlayer);
  let pronouns = $state('');
  let alignment = $state('');

  // ---------------------------------------------------------------- classe
  let clsName = $state('');
  let subName = $state('');
  const classes = $derived(comp?.classes(ed) ?? []);
  const cls = $derived(classes.find((c) => c.name === clsName) ?? null);
  const subs = $derived(cls && comp ? comp.subclassesFor(cls, ed) : []);
  const sub = $derived(subs.find((s) => s.name === subName) ?? null);

  // ---------------------------------------------------------------- origem
  let spName = $state('');
  let lineage = $state('');
  let bgName = $state('');
  let spQuery = $state('');
  let bgQuery = $state('');
  const speciesList = $derived(comp?.species(ed) ?? []);
  const species = $derived(speciesList.find((s) => s.name === spName) ?? null);
  const bgList = $derived(comp?.backgrounds(ed) ?? []);
  const bg = $derived(bgList.find((b) => b.name === bgName) ?? null);
  const hasLineage = $derived(!!species && JSON.stringify(species.entries).match(/Lineage|Ancestry|Legacy|Heritage/i) !== null);

  // ---------------------------------------------------------------- perícias
  const clsSkills = $derived(skillPick(cls?.skills as Array<Record<string, unknown>> | undefined));
  const bgSkills = $derived(skillPick(bg?.skillProficiencies));
  const spSkills = $derived(skillPick(species?.skillProficiencies));
  let pickCls = $state<string[]>([]);
  let pickBg = $state<string[]>([]);
  let pickSp = $state<string[]>([]);
  const fixedSkills = $derived([...bgSkills.fixed, ...spSkills.fixed]);
  const allSkills = $derived([...new Set([...fixedSkills, ...pickCls, ...pickBg, ...pickSp])]);
  const repeated = $derived(pickCls.filter((s) => fixedSkills.includes(s) || pickBg.includes(s) || pickSp.includes(s)));
  const clsCount = $derived(clsSkills.choose[0]?.count ?? 0);
  const clsFrom = $derived(clsSkills.choose[0]?.from.length ? clsSkills.choose[0].from : Object.keys(SKILL_PT));

  // ---------------------------------------------------------------- atributos
  type Method = 'padrao' | 'pontos' | 'rolagem' | 'manual';
  let method = $state<Method>('padrao');
  let rolls = $state<number[]>([]);
  let rollDice = $state<number[][]>([]);
  let assign = $state<Record<AbilityKey, number | null>>({ str: null, dex: null, con: null, int: null, wis: null, cha: null });
  let points = $state<Record<AbilityKey, number>>({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  let manual = $state<Record<AbilityKey, number>>({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  const pool = $derived(method === 'rolagem' ? rolls : STANDARD_ARRAY);
  const base = $derived.by(() => {
    const out = {} as Record<AbilityKey, number>;
    for (const k of ABILITY_ORDER) {
      if (method === 'pontos') out[k] = points[k];
      else if (method === 'manual') out[k] = manual[k];
      else out[k] = assign[k] !== null ? (pool[assign[k]!] ?? 8) : 8;
    }
    return out;
  });
  const opts = $derived(abilityOptions(ed, species, bg));
  let optIdx = $state(0);
  let picks = $state<AbilityKey[][]>([]);
  const opt = $derived(opts[Math.min(optIdx, opts.length - 1)] ?? null);
  const bonus = $derived(opt ? applyOption(opt, picks) : {});
  const scores = $derived(Object.fromEntries(ABILITY_ORDER.map((k) => [k, Math.min(20, base[k] + (bonus[k] ?? 0))])) as Record<AbilityKey, number>);
  const mods = $derived(Object.fromEntries(ABILITY_ORDER.map((k) => [k, scoreMod(scores[k])])) as Record<AbilityKey, number>);
  const assignedAll = $derived(method === 'pontos' || method === 'manual' || ABILITY_ORDER.every((k) => assign[k] !== null));
  const spent = $derived(pointsSpent(points));

  function rollAll() {
    const d6 = () => 1 + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32) * 6);
    rollDice = Array.from({ length: 6 }, () => Array.from({ length: 4 }, d6));
    rolls = rollDice.map((d) => [...d].sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0));
    assign = { str: null, dex: null, con: null, int: null, wis: null, cha: null };
  }
  function setMethod(m: Method) {
    method = m;
    assign = { str: null, dex: null, con: null, int: null, wis: null, cha: null };
    if (m === 'rolagem' && !rolls.length) rollAll();
  }
  /** valores maiores no atributo principal da classe, depois Con e Des */
  function suggest() {
    if (!cls) return;
    const primary = (cls.primaryAbility ?? []).flatMap((o) => Object.keys(o)) as AbilityKey[];
    const caster = cls.spellcastingAbility as AbilityKey | undefined;
    const order = [...new Set([...primary.slice(0, 1), ...(caster ? [caster] : []), 'con', 'dex', ...primary.slice(1), 'wis', 'cha', 'int', 'str'] as AbilityKey[])];
    if (method === 'pontos') {
      const plan = [15, 15, 15, 8, 8, 8];
      points = Object.fromEntries(order.map((k, i) => [k, plan[i] ?? 8])) as Record<AbilityKey, number>;
      return;
    }
    const idx = pool.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    assign = Object.fromEntries(order.map((k, i) => [k, idx[i] ?? null])) as Record<AbilityKey, number | null>;
  }
  function setAssign(k: AbilityKey, v: string) {
    const i = v === '' ? null : Number(v);
    const next = { ...assign };
    // o mesmo valor (posição) não vai para dois atributos
    for (const o of ABILITY_ORDER) if (o !== k && next[o] === i) next[o] = null;
    next[k] = i;
    assign = next;
  }
  function togglePick(ci: number, k: AbilityKey, count: number) {
    const cur = picks[ci] ?? [];
    let next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    if (next.length > count) next = next.slice(-count);
    const all = [...picks];
    all[ci] = next;
    // +2 e +1 em atributos diferentes
    for (let j = 0; j < all.length; j++) if (j !== ci && !cur.includes(k)) all[j] = (all[j] ?? []).filter((x) => x !== k);
    picks = all;
  }

  // ---------------------------------------------------------------- nível 1 da classe
  const lvl1 = $derived(cls ? classLevelInfo(cls, sub, 1, mods) : null);
  let clsFeat = $state<string[]>([]);
  let optPicks = $state<string[]>([]);
  let expertise = $state<string[]>([]);
  let spFeat = $state<string[]>([]);
  const bgFeats = $derived(ed === '2024' ? grantedFeats(bg?.feats) : []);
  const spFeatChoice = $derived.by(() => {
    const f = species?.feats?.[0];
    if (!f) return null;
    if (f['anyFromCategory']) return { categories: ((f['anyFromCategory'] as { category: string[] }).category ?? ['O']), count: (f['anyFromCategory'] as { count?: number }).count ?? 1 };
    if (f['any']) return { categories: null, count: Number(f['any']) || 1 };
    return null;
  });
  const feats = $derived([...bgFeats, ...spFeat, ...clsFeat]);
  const featList = (cats: string[] | null) => (comp?.feats(ed) ?? []).filter((f) => !cats || cats.includes(f.category ?? ''));

  // ---------------------------------------------------------------- magias
  let cantrips = $state<string[]>([]);
  let spells = $state<string[]>([]);
  let miCantrips = $state<string[]>([]);
  let miSpell = $state<string[]>([]);
  let miClass = $state('Wizard');
  const castsAtOne = $derived(!!lvl1 && ((lvl1.cantrips ?? 0) > 0 || ((lvl1.spells ?? 0) > 0 && lvl1.maxSpellLevel > 0)));
  const classList = $derived(cls && comp ? comp.classSpells(cls.name, ed, 1) : []);
  const magicInitiate = $derived(feats.find((f) => /^magic initiate/i.test(f)) ?? null);
  $effect(() => {
    const m = magicInitiate ? /\((\w+)\)/.exec(magicInitiate) : null;
    if (m?.[1]) miClass = m[1];
  });
  const miList = $derived(magicInitiate && comp ? comp.classSpells(miClass, ed, 1) : []);
  const spellSub = (x: CompBase) => {
    const s = x as CSpell;
    return `${SCHOOL_PT[s.school] ?? s.school}${s.ritual ? ' · ritual' : ''} — ${summaryOf(s.entries, 110)}`;
  };
  const showSpells = $derived(castsAtOne || !!magicInitiate);

  // ---------------------------------------------------------------- equipamento
  const clsGroups = $derived(comp && cls ? equipmentGroups(comp, cls.equipment?.defaultData, ed) : []);
  const bgGroups = $derived(comp && bg ? equipmentGroups(comp, bg.startingEquipment, ed) : []);
  let eqPick = $state<Record<string, string>>({});
  let eqChoose = $state<Record<string, string>>({});
  const pickOf = (gid: string, g: { key: string }[]) => eqPick[gid] ?? g.find((o) => /^a$/i.test(o.key))?.key ?? g[0]?.key ?? '';
  const chosenEquipment = $derived.by(() => {
    const lines: Array<{ name: string; qty: number }> = [];
    let cp = 0;
    const take = (prefix: string, groups: typeof clsGroups) => groups.forEach((g, gi) => {
      const gid = `${prefix}${gi}`;
      const o = g.find((x) => x.key === pickOf(gid, g)) ?? g[0];
      if (!o) return;
      cp += o.cp;
      o.lines.forEach((l, li) => {
        const chosen = l.choose ? eqChoose[`${gid}:${o.key}:${li}`] : null;
        if (l.choose && !chosen) return;
        lines.push({ name: chosen ?? l.name, qty: l.qty });
      });
    });
    take('c', clsGroups);
    take('b', bgGroups);
    return { items: comp ? expandPacks(comp, lines, ed) : lines, cp };
  });
  const missingChoices = $derived.by(() => {
    let n = 0;
    for (const [prefix, groups] of [['c', clsGroups], ['b', bgGroups]] as const) {
      groups.forEach((g, gi) => {
        const gid = `${prefix}${gi}`;
        const o = g.find((x) => x.key === pickOf(gid, g)) ?? g[0];
        o?.lines.forEach((l, li) => { if (l.choose && !eqChoose[`${gid}:${o.key}:${li}`]) n++; });
      });
    }
    return n;
  });

  // ---------------------------------------------------------------- idiomas e ferramentas
  const langPick = $derived.by(() => {
    if (ed === '2024') return { fixed: ['Common'], any: 2 };
    const a = languagePick(species?.languageProficiencies);
    const b = languagePick(bg?.languageProficiencies);
    return { fixed: [...new Set([...a.fixed, ...b.fixed])], any: a.any + b.any };
  });
  let langs = $state<string[]>([]);
  const langList = $derived((comp?.data.languages ?? []).filter((l) => (ed === '2024' ? l.source === 'XPHB' : l.source === 'PHB')).sort((a, b) => (a.type === 'standard' ? 0 : 1) - (b.type === 'standard' ? 0 : 1) || a.name.localeCompare(b.name)));
  const tools = $derived.by(() => {
    const a = toolPick(cls?.tools?.length ? [Object.fromEntries((cls.tools as string[]).map((t) => [t, true]))] : undefined);
    const b = toolPick(bg?.toolProficiencies);
    const c = toolPick(species?.toolProficiencies);
    return { fixed: [...a.fixed, ...b.fixed, ...c.fixed].map((t) => t.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, '$1')), open: [...a.open, ...b.open, ...c.open] };
  });
  let toolsExtra = $state('');
  const ALIGN = ['Leal e Bom', 'Neutro e Bom', 'Caótico e Bom', 'Leal e Neutro', 'Neutro', 'Caótico e Neutro', 'Leal e Mau', 'Neutro e Mau', 'Caótico e Mau'];

  // ---------------------------------------------------------------- validação e criação
  const problems = $derived.by(() => {
    const p: Partial<Record<Step, string>> = {};
    if (!cls) p['Classe'] = 'Escolha uma classe';
    else if (pickCls.length < clsCount) p['Classe'] = `Escolha ${clsCount - pickCls.length} perícia(s) da classe`;
    else if (lvl1?.chooseSubclass && !sub) p['Classe'] = `Escolha ${cls.subclassTitle ?? 'a subclasse'}`;
    else if (lvl1 && lvl1.featChoices.some((f) => f.gained > clsFeat.length)) p['Classe'] = 'Escolha o talento da classe';
    else if (lvl1 && lvl1.options.reduce((n, o) => n + o.gained, 0) > optPicks.length) p['Classe'] = 'Escolha as opções da classe';
    else if (lvl1 && lvl1.expertise > expertise.length) p['Classe'] = `Escolha ${lvl1.expertise} especialidade(s)`;
    if (!species) p['Origem'] = 'Escolha a espécie';
    else if (!bg) p['Origem'] = 'Escolha o antecedente';
    else if (bgSkills.choose.reduce((n, c) => n + c.count, 0) > pickBg.length || spSkills.choose.reduce((n, c) => n + c.count, 0) > pickSp.length) p['Origem'] = 'Faltam perícias da origem';
    else if (spFeatChoice && spFeat.length < spFeatChoice.count) p['Origem'] = 'Escolha o talento da espécie';
    if (!assignedAll) p['Atributos'] = 'Distribua os valores';
    else if (method === 'pontos' && spent > POINT_BUDGET) p['Atributos'] = 'Pontos demais';
    else if (opt && opt.choose.some((c, i) => (picks[i]?.length ?? 0) < c.count)) p['Atributos'] = 'Escolha onde vão os bônus';
    if (showSpells && lvl1) {
      if ((lvl1.cantrips ?? 0) > cantrips.length) p['Magias'] = `Faltam ${lvl1.cantrips! - cantrips.length} truque(s)`;
      else if (lvl1.maxSpellLevel > 0 && (lvl1.spells ?? 0) > spells.length) p['Magias'] = `Faltam ${lvl1.spells! - spells.length} magia(s)`;
    }
    if (missingChoices) p['Equipamento'] = `Escolha ${missingChoices} item(ns)`;
    if (askName && !name.trim()) p['Detalhes'] = 'Dê um nome';
    else if (langs.length < langPick.any) p['Detalhes'] = `Escolha ${langPick.any - langs.length} idioma(s)`;
    return p;
  });
  const ready = $derived(Object.keys(problems).length === 0 || (Object.keys(problems).length === 1 && problems['Magias'] !== undefined && !showSpells));
  const stepIdx = $derived(STEPS.indexOf(step));
  const visibleSteps = $derived(STEPS.filter((s) => s !== 'Magias' || showSpells));
  function go(d: 1 | -1) {
    const i = visibleSteps.indexOf(step);
    const n = visibleSteps[i + d];
    if (n) step = n;
  }

  function create() {
    if (!comp || !cls) return;
    const spellObjs = [...cantrips, ...spells, ...miCantrips, ...miSpell].map((n) => comp.spellFor(n, ed)).filter((s): s is CSpell => !!s);
    const toolList = [...tools.fixed, ...toolsExtra.split(',').map((t) => t.trim()).filter(Boolean)];
    const input = {
      ed, cls, sub, species, lineage, background: bg, scores,
      skills: allSkills, expertise, languages: [...langPick.fixed, ...langs], tools: toolList, feats, options: optPicks,
      spells: spellObjs, items: chosenEquipment.items.map((i) => ({ ...i, name: i.name })), cp: chosenEquipment.cp,
      player: player.trim() || undefined, pronouns: pronouns.trim() || undefined, alignment: alignment || undefined,
    };
    onapply(name.trim(), (t) => applyCreation(t, comp, input));
  }

  function setEd(e: Edition) {
    ed = e;
    clsName = ''; subName = ''; spName = ''; bgName = ''; pickCls = []; pickBg = []; pickSp = []; picks = []; optIdx = 0;
    clsFeat = []; optPicks = []; expertise = []; spFeat = []; cantrips = []; spells = []; miCantrips = []; miSpell = []; eqPick = {}; eqChoose = {}; langs = [];
  }
  const sign = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const AB = ABILITY_NAME_PT;
  const hp = $derived(cls ? Math.max(1, cls.hd + mods.con + (feats.some((f) => /^tough$/i.test(f)) ? 2 : 0) + (/^dwarf/i.test(spName) && ed === '2024' ? 1 : 0)) : 0);
</script>

<div class="rpg scrim" role="presentation">
  <div class="dialog wiz" role="dialog" aria-modal="true" aria-label="Criar personagem">
    <header class="whead">
      <div>
        <h2>Criar personagem · D&amp;D 5e</h2>
        <p class="dim small">Tudo sai do compêndio: características, magias, equipamento e as contas da ficha.</p>
      </div>
      <span class="seg" role="radiogroup" aria-label="Edição das regras">
        <button role="radio" aria-checked={ed === '2024'} class:on={ed === '2024'} onclick={() => setEd('2024')} title="Livro do Jogador de 2024">Regras 2024</button>
        <button role="radio" aria-checked={ed === '2014'} class:on={ed === '2014'} onclick={() => setEd('2014')} title="Livro do Jogador de 2014 (+ Xanathar, Tasha)">2014</button>
      </span>
    </header>

    <nav class="steps" aria-label="Passos">
      {#each visibleSteps as s, i (s)}
        <button class:on={step === s} class:bad={!!problems[s] && STEPS.indexOf(s) < stepIdx} onclick={() => (step = s)}>
          <b>{i + 1}</b>{s}{#if !problems[s]}<i class="ok">✓</i>{/if}
        </button>
      {/each}
    </nav>

    <div class="wbody">
      {#if compendio.status === 'missing'}
        <p>O compêndio ainda não foi gerado. Rode <code>node scripts/compendio-5e.mjs</code> na pasta do Tanden.</p>
      {:else if !comp}
        <p class="dim">Abrindo o compêndio…</p>

      {:else if step === 'Classe'}
        <div class="cards">
          {#each classes as k (k.name)}
            <button class="ccard" class:on={clsName === k.name} onclick={() => { clsName = k.name; subName = ''; pickCls = []; clsFeat = []; optPicks = []; expertise = []; cantrips = []; spells = []; eqPick = {}; eqChoose = {}; }}>
              <b>{CLASS_PT[k.name] ?? k.name}</b>
              <small>{k.name} · d{k.hd}{k.spellcastingAbility ? ` · magia (${AB[k.spellcastingAbility]?.slice(0, 3)})` : ''}</small>
              <small class="prim">{(k.primaryAbility ?? []).map((o) => Object.keys(o).map((x) => AB[x]).join(' + ')).join(' ou ')}</small>
            </button>
          {/each}
        </div>
        {#if cls && lvl1}
          <section class="box sec">
            <h3>Perícias da classe · escolha {clsCount}</h3>
            <div class="chips">
              {#each clsFrom as sk (sk)}
                {@const fixed = fixedSkills.includes(sk)}
                <button class="chip" class:on={pickCls.includes(sk)} disabled={fixed || (!pickCls.includes(sk) && pickCls.length >= clsCount)}
                  title={fixed ? 'Já vem da origem' : ''}
                  onclick={() => (pickCls = pickCls.includes(sk) ? pickCls.filter((x) => x !== sk) : [...pickCls, sk])}>{SKILL_PT[sk]}</button>
              {/each}
            </div>
            {#if repeated.length}<p class="warn small">Repetida com a origem: {repeated.map((s) => SKILL_PT[s]).join(', ')} — troque por outra.</p>{/if}
            <p class="dim small">Salvaguardas: {cls.saves.map((s) => AB[s]).join(' e ')} · Armaduras: {cls.armor.map((a) => a.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, '$1')).join(', ') || 'nenhuma'} · Armas: {cls.weapons.map((a) => a.replace(/\{@\w+ ([^|}]+)[^}]*\}/g, '$1')).join(', ')}</p>
          </section>

          {#if lvl1.chooseSubclass}
            <section class="box sec">
              <h3>{cls.subclassTitle ?? 'Subclasse'} (no 1º nível)</h3>
              <select class="field" bind:value={subName}>
                <option value="">Escolha…</option>
                {#each subs as s (s.name + s.source)}<option value={s.name}>{s.name} ({s.source})</option>{/each}
              </select>
              {#if sub}<div class="preview"><CompEntry kind="subclass" item={sub} {ed} headless /></div>{/if}
            </section>
          {/if}

          {#each lvl1.featChoices as fc (fc.name)}
            <section class="box sec">
              <h3>{fc.name} · talento de {fc.categories.map((c) => FEAT_CATEGORY_PT[c] ?? c).join('/')}</h3>
              <PickList items={featList(fc.categories)} kind="feat" selected={clsFeat} max={fc.gained} {ed} onchange={(v) => (clsFeat = v)} sub={(x) => summaryOf(x.entries, 100)} />
            </section>
          {/each}

          {#each lvl1.options.filter((o) => o.gained > 0) as o (o.name)}
            <section class="box sec">
              <h3>{o.name} · escolha {o.gained}</h3>
              <PickList items={comp.optionals(ed, o.types)} kind="optionalfeature" selected={optPicks} max={o.gained} {ed} onchange={(v) => (optPicks = v)}
                sub={(x) => { const p = (x as COptional).prerequisite; return p ? `Pré-requisito: ${prereqText(p)}` : summaryOf(x.entries, 100); }}
                disabled={(x) => { const p = (x as COptional).prerequisite; return p && /nível [2-9]|nível 1\d/.test(prereqText(p)) ? `Pré-requisito: ${prereqText(p)}` : null; }} />
            </section>
          {/each}

          {#if lvl1.expertise}
            <section class="box sec">
              <h3>Especialização · escolha {lvl1.expertise}</h3>
              <div class="chips">
                {#each allSkills as sk (sk)}
                  <button class="chip" class:on={expertise.includes(sk)} disabled={!expertise.includes(sk) && expertise.length >= lvl1.expertise}
                    onclick={() => (expertise = expertise.includes(sk) ? expertise.filter((x) => x !== sk) : [...expertise, sk])}>{SKILL_PT[sk]}</button>
                {/each}
              </div>
              <p class="dim small">Dobra a proficiência nessas perícias. Escolha a origem antes para ver todas as perícias.</p>
            </section>
          {/if}

          <section class="box sec">
            <h3>{CLASS_PT[cls.name]} no 1º nível</h3>
            {#each lvl1.features as f, i (i)}
              <details class="feat"><summary><b>{f.name}</b> <span class="dim small">{summaryOf(f.entries, 120)}</span></summary>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div class="rules" onclick={(e) => compendio.click(e, ed)}>{@html entriesToHtml(f.entries)}</div>
              </details>
            {/each}
          </section>
        {/if}

      {:else if step === 'Origem'}
        <div class="two">
          <section class="box sec">
            <h3>Espécie</h3>
            <input class="field" bind:value={spQuery} placeholder="Filtrar espécies…" />
            <div class="list">
              {#each speciesList.filter((s) => !spQuery || norm(s.name).includes(norm(spQuery))) as s (s.name + s.source)}
                <button class:on={spName === s.name} onclick={() => { spName = s.name; pickSp = []; spFeat = []; picks = []; }}>{s.name} <small>{s.source}</small></button>
              {/each}
            </div>
            {#if species}
              {#if spSkills.choose.length}
                <h4>Perícia da espécie</h4>
                <div class="chips">
                  {#each spSkills.choose[0]!.from.length ? spSkills.choose[0]!.from : Object.keys(SKILL_PT) as sk (sk)}
                    <button class="chip" class:on={pickSp.includes(sk)} disabled={!pickSp.includes(sk) && pickSp.length >= spSkills.choose[0]!.count}
                      onclick={() => (pickSp = pickSp.includes(sk) ? pickSp.filter((x) => x !== sk) : [...pickSp, sk])}>{SKILL_PT[sk]}</button>
                  {/each}
                </div>
              {/if}
              {#if hasLineage}
                <label class="lbl">Linhagem / herança <input class="field" bind:value={lineage} placeholder="Ex.: Alto Elfo, Dracônico Vermelho, Infernal…" /></label>
              {/if}
              {#if spFeatChoice}
                <h4>Talento da espécie</h4>
                <PickList items={featList(spFeatChoice.categories)} kind="feat" selected={spFeat} max={spFeatChoice.count} {ed} onchange={(v) => (spFeat = v)} sub={(x) => summaryOf(x.entries, 90)} />
              {/if}
              <details class="feat" open><summary><b>Traços</b></summary><div class="preview"><CompEntry kind="species" item={species} {ed} headless /></div></details>
            {/if}
          </section>

          <section class="box sec">
            <h3>Antecedente</h3>
            <input class="field" bind:value={bgQuery} placeholder="Filtrar antecedentes…" />
            <div class="list">
              {#each bgList.filter((s) => !bgQuery || norm(s.name).includes(norm(bgQuery))) as b (b.name + b.source)}
                <button class:on={bgName === b.name} onclick={() => { bgName = b.name; pickBg = []; picks = []; optIdx = 0; }}>{b.name} <small>{b.source}</small></button>
              {/each}
            </div>
            {#if bg}
              <p class="small">Perícias: <b>{bgSkills.fixed.map((s) => SKILL_PT[s]).join(', ') || '—'}</b>{#if bgFeats.length} · Talento: <b>{bgFeats.join(', ')}</b>{/if}</p>
              {#each bgSkills.choose as ch, ci (ci)}
                <div class="chips">
                  {#each ch.from.length ? ch.from : Object.keys(SKILL_PT) as sk (sk)}
                    <button class="chip" class:on={pickBg.includes(sk)} disabled={!pickBg.includes(sk) && pickBg.length >= ch.count}
                      onclick={() => (pickBg = pickBg.includes(sk) ? pickBg.filter((x) => x !== sk) : [...pickBg, sk])}>{SKILL_PT[sk]}</button>
                  {/each}
                </div>
              {/each}
              <details class="feat"><summary><b>Texto do antecedente</b></summary><div class="preview"><CompEntry kind="background" item={bg} {ed} headless /></div></details>
              {#each bgFeats as fname (fname)}
                {@const f = comp.featFor(fname.replace(/\s*\(.*\)$/, ''), ed)}
                {#if f}<details class="feat"><summary><b>{fname}</b> <span class="dim small">{summaryOf(f.entries, 90)}</span></summary><div class="preview"><CompEntry kind="feat" item={f} {ed} headless /></div></details>{/if}
              {/each}
            {/if}
          </section>
        </div>

      {:else if step === 'Atributos'}
        <section class="box sec">
          <div class="mhead">
            <span class="seg" role="radiogroup" aria-label="Método">
              {#each [['padrao', 'Padrão'], ['pontos', 'Compra de pontos'], ['rolagem', 'Rolar 4d6'], ['manual', 'Manual']] as [id, label] (id)}
                <button role="radio" aria-checked={method === id} class:on={method === id} onclick={() => setMethod(id as Method)}>{label}</button>
              {/each}
            </span>
            <span class="acts">
              {#if method === 'rolagem'}<button class="ghost sm" onclick={rollAll}>Rolar de novo</button>{/if}
              {#if method !== 'manual'}<button class="ghost sm" onclick={suggest} disabled={!cls} title="Valores maiores no atributo principal da classe, depois Constituição e Destreza">Sugerir pela classe</button>{/if}
            </span>
          </div>
          {#if method === 'padrao'}<p class="dim small">Distribua 15, 14, 13, 12, 10 e 8.</p>{/if}
          {#if method === 'pontos'}<p class="small" class:warn={spent > POINT_BUDGET}>Pontos: <b class="mono">{spent}/{POINT_BUDGET}</b> · cada valor de 8 a 15 (14 e 15 custam mais).</p>{/if}
          {#if method === 'rolagem' && rolls.length}
            <p class="small">Rolagens (4d6, tira o menor): {#each rollDice as d, i (i)}<span class="mono roll">{rolls[i]} <small class="dim">[{d.join(',')}]</small></span>{/each}</p>
          {/if}
          <div class="abgrid">
            {#each ABILITY_ORDER as k (k)}
              {@const isPrimary = (cls?.primaryAbility ?? []).some((o) => o[k])}
              <div class="ab" class:prim={isPrimary}>
                <span class="lbl">{AB[k]}{isPrimary ? ' ★' : ''}</span>
                {#if method === 'padrao' || method === 'rolagem'}
                  <select class="field mono" value={assign[k] === null ? '' : String(assign[k])} onchange={(e) => setAssign(k, (e.currentTarget as HTMLSelectElement).value)}>
                    <option value="">—</option>
                    {#each pool as v, i (i)}<option value={String(i)} disabled={ABILITY_ORDER.some((o) => o !== k && assign[o] === i)}>{v}</option>{/each}
                  </select>
                {:else if method === 'pontos'}
                  <span class="step">
                    <button onclick={() => (points = { ...points, [k]: Math.max(8, points[k] - 1) })} disabled={points[k] <= 8}>−</button>
                    <b class="mono">{points[k]}</b>
                    <button onclick={() => (points = { ...points, [k]: Math.min(15, points[k] + 1) })} disabled={points[k] >= 15 || spent - (POINT_COST[points[k]] ?? 0) + (POINT_COST[points[k] + 1] ?? 99) > POINT_BUDGET}>+</button>
                  </span>
                {:else}
                  <input class="field mono" type="number" min="1" max="30" value={manual[k]} oninput={(e) => (manual = { ...manual, [k]: Number((e.currentTarget as HTMLInputElement).value) || 10 })} />
                {/if}
                {#if bonus[k]}<small class="plus">+{bonus[k]}</small>{/if}
                <b class="final">{scores[k]} <small>({sign(mods[k])})</small></b>
              </div>
            {/each}
          </div>
        </section>
        <section class="box sec">
          <h3>Bônus de atributo · {ed === '2024' ? `do antecedente${bg ? ` (${bg.name})` : ''}` : `da espécie${species ? ` (${species.name})` : ''}`}</h3>
          {#if opts.length > 1}
            <div class="chips">{#each opts as o, i (i)}<button class="chip" class:on={optIdx === i} onclick={() => { optIdx = i; picks = []; }}>{o.label}</button>{/each}</div>
          {/if}
          {#if opt}
            {#each opt.choose as c, ci (ci)}
              <div class="bonusrow">
                <span class="small">+{c.amount}{c.count > 1 ? ` em ${c.count}` : ''}:</span>
                <div class="chips">
                  {#each c.from as k (k)}<button class="chip" class:on={picks[ci]?.includes(k)} onclick={() => togglePick(ci, k, c.count)}>{AB[k]}</button>{/each}
                </div>
              </div>
            {/each}
            {#if Object.keys(opt.fixed).length}<p class="small">Fixos: {Object.entries(opt.fixed).map(([k, v]) => `${AB[k]} +${v}`).join(', ')}</p>{/if}
          {/if}
          <p class="dim small">Nenhum atributo passa de 20. PV no 1º nível: <b>{hp}</b> (d{cls?.hd ?? '?'} no máximo + Con).</p>
        </section>

      {:else if step === 'Magias' && lvl1}
        {#if castsAtOne}
          <section class="box sec">
            <p class="small">Atributo de conjuração: <b>{cls?.spellcastingAbility ? AB[cls.spellcastingAbility] : '—'}</b>
              {#if cls?.spellcastingAbility}· CD {8 + 2 + mods[cls.spellcastingAbility as AbilityKey]} · ataque {sign(2 + mods[cls.spellcastingAbility as AbilityKey])}{/if}</p>
          </section>
          {#if lvl1.cantrips}
            <section class="box sec">
              <h3>Truques · escolha {lvl1.cantrips}</h3>
              <PickList items={classList.filter((s) => s.level === 0)} kind="spell" selected={cantrips} max={lvl1.cantrips} {ed} onchange={(v) => (cantrips = v)} sub={spellSub} />
            </section>
          {/if}
          {#if lvl1.spells && lvl1.maxSpellLevel > 0}
            <section class="box sec">
              <h3>Magias de 1º círculo · {lvl1.spellsMode === 'conhecidas' ? 'conhecidas' : 'preparadas'}: {lvl1.spells}</h3>
              <PickList items={classList.filter((s) => s.level === 1)} kind="spell" selected={spells} max={lvl1.spells} {ed} onchange={(v) => (spells = v)} sub={spellSub} />
            </section>
          {/if}
        {/if}
        {#if magicInitiate}
          <section class="box sec">
            <h3>{magicInitiate}: 2 truques e 1 magia de 1º círculo</h3>
            {#if !/\(/.test(magicInitiate)}
              <select class="field" bind:value={miClass}>{#each ['Cleric', 'Druid', 'Wizard', 'Bard', 'Sorcerer', 'Warlock'] as k (k)}<option value={k}>{CLASS_PT[k]}</option>{/each}</select>
            {/if}
            <PickList items={miList.filter((s) => s.level === 0 && !cantrips.includes(s.name))} kind="spell" selected={miCantrips} max={2} {ed} onchange={(v) => (miCantrips = v)} sub={spellSub} />
            <PickList items={miList.filter((s) => s.level === 1 && !spells.includes(s.name))} kind="spell" selected={miSpell} max={1} {ed} onchange={(v) => (miSpell = v)} sub={spellSub} />
          </section>
        {/if}

      {:else if step === 'Equipamento'}
        {#each [['c', clsGroups, `Da classe (${cls ? CLASS_PT[cls.name] : '—'})`], ['b', bgGroups, `Do antecedente (${bg?.name ?? '—'})`]] as const as [prefix, groups, title] (prefix)}
          <section class="box sec">
            <h3>{title}</h3>
            {#if !groups.length}<p class="dim small">Escolha {prefix === 'c' ? 'a classe' : 'o antecedente'} antes.</p>{/if}
            {#each groups as g, gi (gi)}
              {@const gid = `${prefix}${gi}`}
              <div class="eqg">
                {#each g as o (o.key)}
                  <label class="eqo" class:on={pickOf(gid, g) === o.key}>
                    {#if g.length > 1}<input type="radio" name={gid} checked={pickOf(gid, g) === o.key} onchange={() => (eqPick = { ...eqPick, [gid]: o.key })} />{/if}
                    <span>
                      {#if g.length > 1}<b>{o.key === '_' ? 'Sempre' : o.key.toUpperCase()}</b>{/if}
                      {o.lines.map((l) => `${l.qty > 1 ? `${l.qty} × ` : ''}${inventoryName(l.name)}`).join(', ')}{o.cp ? `${o.lines.length ? ' + ' : ''}${moneyText(o.cp)}` : ''}
                    </span>
                  </label>
                  {#if pickOf(gid, g) === o.key}
                    {#each o.lines as l, li (li)}
                      {#if l.choose}
                        <select class="field sm" value={eqChoose[`${gid}:${o.key}:${li}`] ?? ''} onchange={(e) => (eqChoose = { ...eqChoose, [`${gid}:${o.key}:${li}`]: (e.currentTarget as HTMLSelectElement).value })}>
                          <option value="">Escolha {l.name}…</option>
                          {#each itemsOfType(comp, l.choose, ed) as it (it.name)}<option value={it.name}>{inventoryName(it.name)}{it.dmg1 ? ` (${it.dmg1})` : ''}</option>{/each}
                        </select>
                      {/if}
                    {/each}
                  {/if}
                {/each}
              </div>
            {/each}
          </section>
        {/each}
        <p class="small">Total: <b>{chosenEquipment.items.length}</b> itens + <b>{moneyText(chosenEquipment.cp) || '0 po'}</b>. Armadura, escudo e armas já entram equipados (CA e ataques calculados).</p>

      {:else if step === 'Detalhes'}
        <section class="box sec grid2">
          {#if askName}<label class="lbl">Nome<input class="field" bind:value={name} placeholder="Kael" /></label>{/if}
          <label class="lbl">Jogador(a)<input class="field" bind:value={player} placeholder="quem joga" /></label>
          <label class="lbl">Pronomes<input class="field" bind:value={pronouns} placeholder="ela/dela, ele/dele…" /></label>
          <label class="lbl">Alinhamento
            <select class="field" bind:value={alignment}><option value="">—</option>{#each ALIGN as a (a)}<option value={a}>{a}</option>{/each}</select>
          </label>
        </section>
        <section class="box sec">
          <h3>Idiomas · {langPick.fixed.join(', ')}{langPick.any ? ` + escolha ${langPick.any}` : ''}</h3>
          <div class="chips">
            {#each langList.filter((l) => !langPick.fixed.includes(l.name)) as l (l.name)}
              <button class="chip" class:on={langs.includes(l.name)} disabled={!langs.includes(l.name) && langs.length >= langPick.any}
                onclick={() => (langs = langs.includes(l.name) ? langs.filter((x) => x !== l.name) : [...langs, l.name])} title={l.type ?? ''}>{l.name}</button>
            {/each}
          </div>
        </section>
        <section class="box sec">
          <h3>Ferramentas</h3>
          <p class="small">{tools.fixed.join(', ') || 'Nenhuma fixa'}{#if tools.open.length}<span class="dim"> · a escolher: {tools.open.join('; ')}</span>{/if}</p>
          <input class="field" bind:value={toolsExtra} placeholder="Ferramentas escolhidas (separe por vírgula)" />
        </section>
        <section class="box sec summary">
          <h3>Resumo</h3>
          <p><b>{name || 'Sem nome'}</b> — {species?.name ?? '?'}{lineage ? ` (${lineage})` : ''}, {cls ? CLASS_PT[cls.name] : '?'} 1{sub ? ` (${sub.name})` : ''}, {bg?.name ?? '?'} · regras {ed}</p>
          <p class="mono small">{ABILITY_ORDER.map((k) => `${AB[k].slice(0, 3)} ${scores[k]} (${sign(mods[k])})`).join(' · ')}</p>
          <p class="small">PV {hp} · Perícias: {allSkills.map((s) => SKILL_PT[s]).join(', ') || '—'}{expertise.length ? ` · Especialidades: ${expertise.map((s) => SKILL_PT[s]).join(', ')}` : ''}</p>
          {#if feats.length}<p class="small">Talentos: {feats.join(', ')}</p>{/if}
          {#if optPicks.length}<p class="small">Opções: {optPicks.join(', ')}</p>{/if}
          {#if cantrips.length || spells.length}<p class="small">Magias: {[...cantrips, ...spells, ...miCantrips, ...miSpell].join(', ')}</p>{/if}
          {#each Object.entries(problems) as [s, msg] (s)}<p class="warn small">{s}: {msg}</p>{/each}
        </section>
      {/if}
    </div>

    <footer class="formacts">
      <button class="ghost" onclick={oncancel}>Cancelar</button>
      <span class="grow"></span>
      {#if visibleSteps.indexOf(step) > 0}<button class="ghost" onclick={() => go(-1)}>Voltar</button>{/if}
      {#if step !== 'Detalhes'}
        <button class="primary" onclick={() => go(1)}>Próximo{problems[step] ? ` (${problems[step]})` : ''}</button>
      {:else}
        <button class="primary" disabled={!ready} onclick={create}>Criar ficha</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .wiz { width: min(920px, 100%); max-height: calc(100vh - 24px); grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; padding: 16px 18px; }
  .whead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .whead p { margin: 4px 0 0; }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); flex-wrap: wrap; }
  .seg button { border: 0; background: none; border-radius: 7px; padding: 4px 10px; font-size: 12.5px; color: var(--muted); }
  .seg button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }
  .steps { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .steps button { border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); border-radius: 999px; padding: 4px 12px 4px 4px; display: inline-flex; gap: 6px; align-items: center; font-size: 12.5px; white-space: nowrap; }
  .steps button b { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--void); font: 600 11px var(--f-mono); }
  .steps button.on { border-color: var(--ember); color: var(--ink); }
  .steps button.on b { background: var(--ember); color: var(--on-ember); }
  .steps button.bad { border-color: color-mix(in srgb, var(--crit) 60%, var(--line)); }
  .steps .ok { font-style: normal; color: var(--ok); font-size: 11px; }
  .wbody { overflow-y: auto; min-height: 0; display: grid; gap: 12px; align-content: start; padding-right: 4px; }
  .sec { display: grid; gap: 8px; min-width: 0; }
  .sec h3 { margin: 0; }
  .sec h4 { margin: 6px 0 0; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 8px; }
  .ccard { text-align: left; border: 1px solid var(--line); background: var(--surface); border-radius: 12px; padding: 9px 11px; display: grid; gap: 2px; color: var(--ink); }
  .ccard:hover { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .ccard.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, var(--surface)); }
  .ccard b { font: 600 15px var(--f-display); }
  .ccard small { color: var(--muted); font-size: 11.5px; }
  .ccard .prim { color: var(--ember-soft); }
  .chip:disabled { opacity: .4; cursor: default; }
  .warn { color: var(--crit); margin: 0; }
  .preview { padding: 6px 2px; }
  details.feat { border-top: 1px solid var(--line); padding: 6px 0; }
  details.feat summary { cursor: pointer; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  details.feat .rules { padding: 6px 0 2px; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 12px; align-items: start; }
  .list { display: grid; gap: 2px; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; padding: 4px; background: var(--void); }
  .list button { text-align: left; border: 0; background: none; border-radius: 7px; padding: 5px 8px; color: var(--ink); font-size: 13.5px; }
  .list button:hover { background: var(--surface-2); }
  .list button.on { background: color-mix(in srgb, var(--ember) 16%, transparent); }
  .list small { color: var(--muted); font: 10.5px var(--f-mono); }
  .lbl { display: grid; gap: 4px; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .mhead { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .acts { display: flex; gap: 6px; }
  .abgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(130px, 100%), 1fr)); gap: 8px; }
  .ab { display: grid; gap: 4px; justify-items: center; border: 1px solid var(--line); border-radius: 12px; padding: 8px; background: var(--surface); position: relative; }
  .ab.prim { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .ab select, .ab input { width: 80px; text-align: center; }
  .ab .final { font: 700 18px var(--f-display); }
  .ab .final small { font: 500 12px var(--f-mono); color: var(--silver); }
  .ab .plus { position: absolute; top: 6px; right: 8px; font: 600 11px var(--f-mono); color: var(--ok); }
  .step { display: inline-flex; align-items: center; gap: 8px; }
  .step button { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); padding: 0; }
  .step button:disabled { opacity: .35; }
  .roll { margin-right: 10px; white-space: nowrap; }
  .bonusrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .eqg { display: grid; gap: 4px; padding: 6px 0; border-top: 1px solid var(--line); }
  .eqg:first-of-type { border-top: 0; }
  .eqo { display: flex !important; gap: 8px; align-items: flex-start; font: 13px var(--f-body) !important; letter-spacing: 0 !important; text-transform: none !important; color: var(--ink) !important; padding: 4px 6px; border-radius: 8px; }
  .eqo.on { background: color-mix(in srgb, var(--ember) 8%, transparent); }
  .eqo b { margin-right: 6px; color: var(--ember-soft); }
  select.sm { padding: 4px 8px; font-size: 13px; max-width: 320px; }
  .grid2 { grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); }
  .summary p { margin: 0; }
  .formacts { align-items: center; padding-top: 8px; border-top: 1px solid var(--line); flex-wrap: wrap; }
  .grow { flex: 1; }
</style>
