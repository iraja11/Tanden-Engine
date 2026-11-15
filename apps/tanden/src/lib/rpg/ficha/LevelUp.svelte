<script lang="ts">
  import {
    ABILITY_NAME_PT, ABILITY_ORDER, CLASSES, CLASS_PT, FEAT_CATEGORY_PT, SCHOOL_PT, applyLevelUp, classLevelInfo, entriesToHtml, hpGain, hpPerLevelBonus, levelUp,
    modsOf, prereqText, profForLevel, readCharacter, readSpells, scoresOf, signed, summaryOf,
    type AbilityGrant, type AbilityKey, type CFeat, type COptional, type CompBase, type CSpell,
  } from '@tanden/core';
  import { compendio } from '../compendio.svelte';
  import { mesa } from '../mesa.svelte';
  import PickList from '../regras/PickList.svelte';
  import type { FichaCtx } from './ctx';

  // Subir de nível guiado pelo compêndio: o que o nível dá, as escolhas e os PV.
  let { x, onclose, ondone }: { x: FichaCtx; onclose: () => void; ondone: (msg: string) => void } = $props();

  $effect(() => { void compendio.load(); });
  const comp = $derived(compendio.comp);
  const c = $derived(x.c);
  const ed = $derived(c.edition);

  let klass = $state(c.classes[0]?.name ?? '');
  let newClass = $state('');
  const target = $derived(klass === '__nova' ? newClass : klass);
  const cur = $derived(c.classes.find((k) => k.name === target) ?? null);
  const newLevel = $derived((cur?.level ?? 0) + 1);
  const cls = $derived(comp && target ? comp.classFor(target, ed) : null);
  const isFirst = $derived(!!cur && c.classes.indexOf(cur) === 0);
  let subName = $state('');
  const subs = $derived(cls && comp ? comp.subclassesFor(cls, ed) : []);
  const curSub = $derived(cls && comp && isFirst ? comp.subclassFor(cls, c.subclass, ed) : null);
  const sub = $derived(curSub ?? subs.find((s) => s.name === subName) ?? null);
  const scores = $derived(scoresOf(c));
  const info = $derived(cls ? classLevelInfo(cls, sub, newLevel, modsOf(scores)) : null);
  const subInfo = $derived(info?.chooseSubclass && sub && cls ? classLevelInfo(cls, sub, newLevel, modsOf(scores)) : null);
  const features = $derived((subInfo ?? info)?.features ?? []);

  // melhoria de atributo / talento
  let asiMode = $state<'asi' | 'feat'>('asi');
  let asi = $state<Partial<Record<AbilityKey, number>>>({});
  const asiTotal = $derived(Object.values(asi).reduce((s, n) => s + (n ?? 0), 0));
  function bump(k: AbilityKey, d: 1 | -1) {
    const v = Math.max(0, Math.min(2, (asi[k] ?? 0) + d));
    if (d > 0 && (asiTotal >= 2 || scores[k] + v > 20)) return;
    asi = { ...asi, [k]: v };
  }
  let feat = $state<string[]>([]);
  let featAsi = $state<AbilityKey | ''>('');
  const featObj = $derived(feat[0] && comp ? comp.featFor(feat[0], ed) : null);
  const featAbilityFrom = $derived.by(() => {
    const a = featObj?.ability?.[0] as AbilityGrant | undefined;
    if (!a) return [] as AbilityKey[];
    const fixed = ABILITY_ORDER.filter((k) => typeof a[k] === 'number');
    return (a.choose?.from as AbilityKey[] | undefined) ?? fixed;
  });
  const charLevel = $derived(c.level + 1);
  const featPool = $derived.by(() => {
    if (!comp) return [];
    const all = comp.feats(ed);
    if (info?.epicBoon) return all.filter((f) => f.category === 'EB');
    return ed === '2024' ? all.filter((f) => f.category === 'G' && !/^ability score improvement$/i.test(f.name)) : all;
  });
  const featBlock = (f: CompBase): string | null => {
    const p = (f as CFeat).prerequisite;
    if (!p) return null;
    const lv = p.map((q) => (typeof q['level'] === 'number' ? (q['level'] as number) : 0)).reduce((m, n) => Math.max(m, n), 0);
    if (lv > charLevel) return `Pré-requisito: ${prereqText(p)}`;
    if (c.featList.some((n) => n.toLowerCase() === f.name.toLowerCase()) && !(f as CFeat).repeatable) return 'Já tem';
    return null;
  };

  // talentos da classe, opções, especialização
  let clsFeat = $state<string[]>([]);
  let options = $state<string[]>([]);
  let expertise = $state<string[]>([]);

  // magias
  const known = $derived(readSpells(x.text).map((s) => s.name.toLowerCase()));
  const newCantrips = $derived(info && info.cantrips !== null ? Math.max(0, info.cantrips - info.cantripsPrev) : 0);
  const newSpells = $derived(info && info.spells !== null ? Math.max(0, info.spells - info.spellsPrev) : 0);
  const spellList = $derived(cls && comp && info ? comp.classSpells(cls.name, ed, info.maxSpellLevel).filter((s) => !known.includes(s.name.toLowerCase())) : []);
  let cantrips = $state<string[]>([]);
  let spells = $state<string[]>([]);
  const spellSub = (s: CompBase) => `${(s as CSpell).level ? `${(s as CSpell).level}º círculo` : 'Truque'} · ${SCHOOL_PT[(s as CSpell).school] ?? ''} — ${summaryOf(s.entries, 90)}`;

  // PV
  const die = $derived(cls?.hd ?? CLASSES.find((k) => k.name === target)?.die ?? cur?.info?.die ?? c.hitDice[0]?.die ?? 8);
  const conMod = $derived(Math.floor((scores.con - 10) / 2));

  const pending = $derived.by(() => {
    const p: string[] = [];
    if (info?.chooseSubclass && !sub) p.push('subclasse');
    if (info?.asi && asiMode === 'asi' && asiTotal < 2) p.push('pontos de atributo');
    if ((info?.asi || info?.epicBoon) && asiMode === 'feat' && !feat.length) p.push('talento');
    if (featAbilityFrom.length > 1 && asiMode === 'feat' && !featAsi) p.push('atributo do talento');
    if (info && info.featChoices.reduce((n, f) => n + f.gained, 0) > clsFeat.length) p.push('talento da classe');
    return p;
  });

  function confirm(rolled: boolean) {
    let roll: number | undefined;
    if (rolled) {
      const res = x.rollF(`1d${die}`, `PV do nível ${c.level + 1}`) as unknown;
      const first = Array.isArray(res) ? (res[0] as { total: number } | undefined) : undefined;
      if (!first) return;
      roll = first.total;
    }
    const before = { prof: c.sheet.prof, slots: c.slots.map((v) => v.total).join('/') };
    let msg = '';
    x.update((t) => {
      if (!comp) {
        const r = levelUp(t, { klass: target || undefined, roll });
        msg = `Nível ${r.level}! +${r.gain} PV`;
        return r.text;
      }
      const fa: Partial<Record<AbilityKey, number>> = {};
      if (asiMode === 'feat' && featObj?.ability?.[0]) {
        const a = featObj.ability[0] as AbilityGrant;
        const k = (featAsi || featAbilityFrom[0]) as AbilityKey | undefined;
        if (k) fa[k] = typeof a[k] === 'number' ? (a[k] as number) : (a.choose?.amount ?? 1);
      }
      const r = applyLevelUp(t, comp, {
        klass: target || undefined, roll, subclass: info?.chooseSubclass ? sub?.name : undefined,
        asi: info?.asi && asiMode === 'asi' ? asi : undefined,
        feat: (info?.asi || info?.epicBoon) && asiMode === 'feat' ? feat[0] : undefined, featAsi: fa,
        spells: [...cantrips, ...spells], options, extraFeats: clsFeat, expertise,
      });
      const after = readCharacter(r.text, mesa.campaign?.system);
      const bits = [
        `+${r.gain + r.bonusHp} PV`,
        after.sheet.prof !== before.prof ? `proficiência ${signed(after.sheet.prof)}` : '',
        after.slots.map((v) => v.total).join('/') !== before.slots ? 'novos espaços de magia' : '',
        ...features.map((f) => f.name).slice(0, 4),
      ].filter(Boolean);
      msg = `Nível ${r.level}${r.klass ? ` · ${r.klass}` : ''}! ${bits.join(' · ')}`;
      return r.text;
    });
    ondone(msg);
  }
</script>

<div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="dialog lvup" role="dialog" aria-modal="true" aria-label="Subir de nível">
    <h2>Subir para o nível {c.level + 1}</h2>
    <label>Em qual classe
      <select class="field" bind:value={klass}>
        {#each c.classes as k (k.name)}<option value={k.name}>{k.info?.name ?? k.name} ({k.level} → {k.level + 1})</option>{/each}
        {#if !c.classes.length}<option value="">Sem classe</option>{/if}
        <option value="__nova">Outra classe (multiclasse)…</option>
      </select>
    </label>
    {#if klass === '__nova'}
      <label>Nova classe
        <select class="field" bind:value={newClass}>
          <option value="">Escolha…</option>
          {#each CLASSES.filter((k) => !c.classes.some((v) => v.info?.key === k.key)) as k (k.key)}<option value={k.name}>{k.name} (d{k.die})</option>{/each}
        </select>
      </label>
      {#if cls?.multiclassing?.requirements}
        <p class="dim small">Requisito: {Object.entries(cls.multiclassing.requirements).filter(([k]) => ABILITY_NAME_PT[k]).map(([k, v]) => `${ABILITY_NAME_PT[k]} ${v}`).join(' e ')} (e os da classe atual).</p>
      {/if}
    {/if}

    {#if compendio.status === 'missing'}
      <p class="dim small">Sem o compêndio, só os PV, a proficiência e os espaços sobem sozinhos.</p>
    {:else if !info}
      {#if target}<p class="dim small">{compendio.status === 'ok' ? 'Classe fora do compêndio: só PV e números.' : 'Abrindo o compêndio…'}</p>{/if}
    {:else}
      <section class="news">
        <h3>{CLASS_PT[info.cls.name] ?? info.cls.name} {newLevel} traz</h3>
        <ul class="gains">
          {#if profForLevel(c.level + 1) !== c.sheet.prof}<li>Bônus de proficiência vira <b>{signed(profForLevel(c.level + 1))}</b></li>{/if}
          {#each info.columns.filter((k) => k.value !== k.prev && k.prev !== '') as k (k.label)}<li>{k.label}: {k.prev} → <b>{k.value}</b></li>{/each}
          {#if info.maxSpellLevel && cls && classLevelInfo(cls, sub, newLevel - 1).maxSpellLevel < info.maxSpellLevel && newLevel > 1}<li>Magias de <b>{info.maxSpellLevel}º círculo</b></li>{/if}
        </ul>
        {#each features as f, i (i)}
          <details class="feat" open={features.length <= 2}>
            <summary><b>{f.name}</b>{f.from === 'subclasse' ? ' (subclasse)' : ''} <span class="dim small">{summaryOf(f.entries, 100)}</span></summary>
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="rules" onclick={(e) => compendio.click(e, ed)}>{@html entriesToHtml(f.entries)}</div>
          </details>
        {/each}
        {#if !features.length}<p class="dim small">Nenhuma característica nova neste nível.</p>{/if}
      </section>

      {#if info.chooseSubclass && !curSub}
        <section class="ch">
          <h3>{cls?.subclassTitle ?? 'Subclasse'}</h3>
          <select class="field" bind:value={subName}>
            <option value="">Escolha…</option>
            {#each subs as s (s.name + s.source)}<option value={s.name}>{s.name} ({s.source})</option>{/each}
          </select>
          {#if sub}<p class="dim small">{summaryOf(sub.features[0]?.entries, 220)}</p>{/if}
        </section>
      {/if}

      {#if info.asi || info.epicBoon}
        <section class="ch">
          <h3>{info.epicBoon ? 'Dádiva épica' : 'Melhoria de atributo ou talento'}</h3>
          {#if info.asi}
            <span class="seg">
              <button class:on={asiMode === 'asi'} onclick={() => (asiMode = 'asi')}>+2 em atributos</button>
              <button class:on={asiMode === 'feat'} onclick={() => (asiMode = 'feat')}>Talento</button>
            </span>
          {/if}
          {#if asiMode === 'asi' && info.asi}
            <div class="asi">
              {#each ABILITY_ORDER as k (k)}
                <div class="ab"><span>{ABILITY_NAME_PT[k]?.slice(0, 3)}</span><b class="mono">{scores[k]}{#if asi[k]}<i>+{asi[k]}</i>{/if}</b>
                  <span class="st"><button onclick={() => bump(k, -1)} disabled={!asi[k]}>−</button><button onclick={() => bump(k, 1)} disabled={asiTotal >= 2 || scores[k] + (asi[k] ?? 0) >= 20}>+</button></span>
                </div>
              {/each}
            </div>
            <p class="dim small">+2 num atributo ou +1 em dois (máximo 20). Se a Constituição subir, o PV máximo sobe junto.</p>
          {:else}
            <PickList items={featPool} kind="feat" selected={feat} max={1} {ed} onchange={(v) => { feat = v; featAsi = ''; }}
              sub={(f) => `${(f as CFeat).category ? `${FEAT_CATEGORY_PT[(f as CFeat).category!] ?? ''} · ` : ''}${summaryOf(f.entries, 90)}`} disabled={featBlock} />
            {#if featAbilityFrom.length > 1}
              <div class="chips">{#each featAbilityFrom as k (k)}<button class="chip" class:on={featAsi === k} onclick={() => (featAsi = k)}>{ABILITY_NAME_PT[k]} +1</button>{/each}</div>
            {/if}
          {/if}
        </section>
      {/if}

      {#each info.featChoices as fc (fc.name)}
        <section class="ch">
          <h3>{fc.name}</h3>
          <PickList items={(comp?.feats(ed) ?? []).filter((f) => fc.categories.includes(f.category ?? ''))} kind="feat" selected={clsFeat} max={fc.gained} {ed} onchange={(v) => (clsFeat = v)} sub={(f) => summaryOf(f.entries, 90)} />
        </section>
      {/each}

      {#each info.options.filter((o) => o.gained > 0) as o (o.name)}
        <section class="ch">
          <h3>{o.name} · +{o.gained}</h3>
          <PickList items={(comp?.optionals(ed, o.types) ?? []).filter((v) => !c.classOptions.some((n) => n.toLowerCase() === v.name.toLowerCase()))} kind="optionalfeature" selected={options} max={o.gained} {ed}
            onchange={(v) => (options = v)} sub={(v) => { const p = (v as COptional).prerequisite; return p ? `Pré-requisito: ${prereqText(p)}` : summaryOf(v.entries, 90); }} />
        </section>
      {/each}

      {#if info.expertise}
        <section class="ch">
          <h3>Especialização · {info.expertise}</h3>
          <div class="chips">
            {#each c.sheet.skills.filter((s) => !c.sheet.expertise.some((e) => e.toLowerCase() === s.toLowerCase())) as sk (sk)}
              <button class="chip" class:on={expertise.includes(sk)} disabled={!expertise.includes(sk) && expertise.length >= info.expertise}
                onclick={() => (expertise = expertise.includes(sk) ? expertise.filter((v) => v !== sk) : [...expertise, sk])}>{sk}</button>
            {/each}
          </div>
        </section>
      {/if}

      {#if newCantrips > 0}
        <section class="ch">
          <h3>Truques novos · {newCantrips}</h3>
          <PickList items={spellList.filter((s) => s.level === 0)} kind="spell" selected={cantrips} max={newCantrips} {ed} onchange={(v) => (cantrips = v)} sub={spellSub} />
        </section>
      {/if}
      {#if newSpells > 0 && info.maxSpellLevel > 0}
        <section class="ch">
          <h3>Magias novas · {newSpells} ({info.spellsMode}, até {info.maxSpellLevel}º círculo)</h3>
          <PickList items={spellList.filter((s) => s.level > 0)} kind="spell" selected={spells} max={newSpells} {ed} onchange={(v) => (spells = v)} sub={spellSub}
            group={(s) => `${(s as CSpell).level}º círculo`} />
        </section>
      {/if}
    {/if}

    <p class="dim small">Pontos de vida: d{die} + Con ({signed(conMod)}){hpPerLevelBonus(c) ? ` + ${hpPerLevelBonus(c)} (talento/espécie)` : ''}. Proficiência, espaços de magia, dados de vida e usos das habilidades se ajustam sozinhos.</p>
    {#if pending.length}<p class="warn small">Falta escolher: {pending.join(', ')}</p>{/if}
    <div class="formacts">
      <button class="ghost" onclick={onclose}>Cancelar</button>
      <button class="ghost" disabled={(klass === '__nova' && !newClass) || pending.length > 0} onclick={() => confirm(true)}>Rolar d{die}</button>
      <button class="primary" disabled={(klass === '__nova' && !newClass) || pending.length > 0} onclick={() => confirm(false)}>Média (+{hpGain(die, conMod) + hpPerLevelBonus(c)} PV)</button>
    </div>
  </div>
</div>

<style>
  .lvup { width: min(680px, 100%); }
  section { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 10px; }
  section h3 { margin: 0; }
  .gains { margin: 0; padding-left: 1.1em; font-size: 13px; }
  details.feat { border-top: 1px dashed var(--line); padding: 6px 0; }
  details.feat summary { cursor: pointer; }
  details.feat .rules { padding-top: 6px; }
  .seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; border: 1px solid var(--line); justify-self: start; }
  .seg button { border: 0; background: none; border-radius: 7px; padding: 4px 10px; font-size: 12.5px; color: var(--muted); }
  .seg button.on { background: color-mix(in srgb, var(--ember) 18%, transparent); color: var(--ink); }
  .asi { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; }
  .ab { display: grid; justify-items: center; gap: 3px; border: 1px solid var(--line); border-radius: 10px; padding: 6px; }
  .ab span { font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .ab b i { font-style: normal; color: var(--ok); font-size: 12px; margin-left: 2px; }
  .st { display: flex; gap: 4px; }
  .st button { width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); padding: 0; }
  .st button:disabled { opacity: .35; }
  .chip:disabled { opacity: .4; }
  .warn { color: var(--crit); margin: 0; }
</style>
