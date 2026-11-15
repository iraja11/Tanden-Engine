<script lang="ts">
  import {
    ABILITY_NAME_PT, CLASS_PT, DAMAGE_PT, FEAT_CATEGORY_PT, KIND_PT, OPTIONAL_TYPE_PT, SCHOOL_PT, SIZE_PT, entriesToHtml, feetToMetres, itemLine,
    moneyText, prereqText, spellComponents, spellDuration, spellRange, spellTime, subclassLevel,
    type CBackground, type CClass, type CFeat, type CItem, type COptional, type CompBase, type CSpecies, type CSpell, type CSubclass, type Edition,
  } from '@tanden/core';
  import { compendio } from '../compendio.svelte';

  // Uma entrada do compêndio (magia, item, talento, classe...) com o texto das regras.
  let { kind, item, ed = '2024', headless = false }: { kind: string; item: CompBase; ed?: Edition; headless?: boolean } = $props();

  const sp = $derived(kind === 'spell' ? (item as CSpell) : null);
  const it = $derived(kind === 'item' ? (item as CItem) : null);
  const ft = $derived(kind === 'feat' ? (item as CFeat) : null);
  const op = $derived(kind === 'optionalfeature' ? (item as COptional) : null);
  const cl = $derived(kind === 'class' ? (item as CClass) : null);
  const sc = $derived(kind === 'subclass' ? (item as CSubclass) : null);
  const spc = $derived(kind === 'species' ? (item as CSpecies) : null);
  const bg = $derived(kind === 'background' ? (item as CBackground) : null);

  const propList = $derived.by(() => {
    if (!it?.property?.length) return '';
    const comp = compendio.comp;
    return it.property.map((p) => {
      const abbr = (typeof p === 'string' ? p : p.uid).split('|')[0] ?? '';
      const found = comp?.data.itemProperties.find((x) => x.abbreviation === abbr);
      return found?.name ?? abbr;
    }).join(', ');
  });

  const speedText = (s: CSpecies['speed']) => {
    if (s === undefined) return '';
    if (typeof s === 'number') return feetToMetres(s);
    return Object.entries(s).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k === 'walk' ? '' : `${k} `}${feetToMetres(v as number)}`).join(', ');
  };

  /** classe: características agrupadas por nível */
  const byLevel = $derived.by(() => {
    const list = cl?.features ?? sc?.features ?? [];
    const m = new Map<number, string[]>();
    for (const f of list) m.set(f.level, [...(m.get(f.level) ?? []), f.name]);
    return [...m.entries()];
  });
  let openFeature = $state<string | null>(null);
  const acNote = (t: string) => (t.startsWith('LA') ? ' + Des' : t.startsWith('MA') ? ' + Des (máx. 2)' : t === 'S' || t.startsWith('S|') ? ' (bônus)' : '');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<article class="centry" onclick={(e) => compendio.click(e, ed)}>
  {#if !headless}
    <header>
      <h3 class="ctitle">{item.name}</h3>
      <span class="csrc mono" title="Livro de origem">{item.source}{item.ed === '2024' ? ' · 2024' : ' · 2014'}</span>
    </header>
  {/if}

  {#if sp}
    <p class="csub">{sp.level === 0 ? 'Truque' : `${sp.level}º círculo`} de {SCHOOL_PT[sp.school] ?? sp.school}{sp.ritual ? ' (ritual)' : ''}</p>
    <dl class="meta">
      <div><dt>Tempo</dt><dd>{spellTime(sp)}{sp.time[0]?.condition ? ` — ${sp.time[0].condition}` : ''}</dd></div>
      <div><dt>Alcance</dt><dd>{spellRange(sp)}</dd></div>
      <div><dt>Componentes</dt><dd>{spellComponents(sp)}</dd></div>
      <div><dt>Duração</dt><dd>{spellDuration(sp)}</dd></div>
      {#if sp.classes.length}<div class="wide"><dt>Classes</dt><dd>{sp.classes.map((c) => CLASS_PT[c] ?? c).join(', ')}</dd></div>{/if}
    </dl>
    <div class="rules">{@html entriesToHtml(sp.entries)}</div>
    {#if sp.entriesHigherLevel?.length}<div class="rules higher">{@html entriesToHtml(sp.entriesHigherLevel)}</div>{/if}
  {:else if it}
    <p class="csub">{itemLine(it)}</p>
    <dl class="meta">
      {#if it.dmg1}<div><dt>Dano</dt><dd>{it.dmg1} {DAMAGE_PT[it.dmgType ?? ''] ?? it.dmgType ?? ''}{it.dmg2 ? ` (versátil ${it.dmg2})` : ''}</dd></div>{/if}
      {#if it.ac}<div><dt>CA</dt><dd>{it.ac}{acNote(it.type ?? '')}</dd></div>{/if}
      {#if it.strength}<div><dt>Força</dt><dd>{it.strength}</dd></div>{/if}
      {#if it.stealth}<div><dt>Furtividade</dt><dd>desvantagem</dd></div>{/if}
      {#if it.range}<div><dt>Alcance</dt><dd>{it.range.split('/').map((n) => feetToMetres(Number(n))).join(' / ')}</dd></div>{/if}
      {#if propList}<div class="wide"><dt>Propriedades</dt><dd>{propList}</dd></div>{/if}
      {#if it.mastery?.length}<div><dt>Maestria</dt><dd>{#each it.mastery as m (m)}<a class="cref" href="#" data-ref={`itemMastery|${m.split('|')[0]}|${m.split('|')[1] ?? ''}`}>{m.split('|')[0]}</a>{/each}</dd></div>{/if}
      {#if it.weight}<div><dt>Peso</dt><dd>{String(Math.round(it.weight * 0.45 * 100) / 100).replace('.', ',')} kg</dd></div>{/if}
      {#if it.value}<div><dt>Preço</dt><dd>{moneyText(it.value)}</dd></div>{/if}
    </dl>
    <div class="rules">{@html entriesToHtml(it.entries)}</div>
  {:else if ft || op}
    {@const pre = (ft ?? op)!.prerequisite}
    <p class="csub">{ft ? `Talento${ft.category ? ` de ${FEAT_CATEGORY_PT[ft.category] ?? ft.category}` : ''}` : op!.type.map((t) => OPTIONAL_TYPE_PT[t] ?? t).join(', ')}{pre ? ` · Pré-requisito: ${prereqText(pre)}` : ''}</p>
    <div class="rules">{@html entriesToHtml(item.entries)}</div>
  {:else if cl}
    <p class="csub">Dado de vida d{cl.hd} · Salvaguardas: {cl.saves.map((s) => ABILITY_NAME_PT[s] ?? s).join(', ')}{cl.spellcastingAbility ? ` · Conjura com ${ABILITY_NAME_PT[cl.spellcastingAbility]}` : ''}</p>
    <p class="dim small">Subclasse no {subclassLevel(cl)}º nível.</p>
    <ol class="levels">
      {#each byLevel as [lv, names] (lv)}
        <li><b>{lv}º</b>
          <span>{#each names as n, i (i)}<button class="flink" onclick={() => (openFeature = openFeature === `${lv}:${n}` ? null : `${lv}:${n}`)}>{n}</button>{#if i < names.length - 1}, {/if}{/each}</span>
          {#each cl.features.filter((f) => f.level === lv && openFeature === `${lv}:${f.name}`) as f (f.name)}
            <div class="rules sub">{@html entriesToHtml(f.entries)}</div>
          {/each}
        </li>
      {/each}
    </ol>
  {:else if sc}
    <p class="csub">Subclasse de {CLASS_PT[sc.className] ?? sc.className}</p>
    {#each sc.features as f, i (i)}
      <section class="feat"><h4>{f.name} <small class="dim">· nível {f.level}</small></h4><div class="rules">{@html entriesToHtml(f.entries)}</div></section>
    {/each}
  {:else if spc}
    <dl class="meta">
      {#if spc.size?.length}<div><dt>Tamanho</dt><dd>{spc.size.map((s) => SIZE_PT[s] ?? s).join(' ou ')}</dd></div>{/if}
      {#if spc.speed !== undefined}<div><dt>Deslocamento</dt><dd>{speedText(spc.speed)}</dd></div>{/if}
      {#if spc.darkvision}<div><dt>Visão no escuro</dt><dd>{feetToMetres(spc.darkvision)}</dd></div>{/if}
      {#if spc.ability?.length && spc.ed === '2014'}<div><dt>Atributos</dt><dd>{spc.ability.map((a) => Object.entries(a).filter(([k]) => k !== 'choose').map(([k, v]) => `${ABILITY_NAME_PT[k]} +${v}`).join(', ') + (a.choose ? `${Object.keys(a).length > 1 ? ', ' : ''}+${a.choose.amount ?? 1} em ${a.choose.count ?? 1} à escolha` : '')).join(' ou ')}</dd></div>{/if}
    </dl>
    <div class="rules">{@html entriesToHtml(spc.entries)}</div>
  {:else if bg}
    <div class="rules">{@html entriesToHtml(bg.entries)}</div>
  {:else}
    <p class="csub">{KIND_PT[kind as keyof typeof KIND_PT] ?? ''}</p>
    <div class="rules">{@html entriesToHtml(item.entries)}</div>
  {/if}
</article>

<style>
  .centry { display: grid; gap: 8px; min-width: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .ctitle { margin: 0 !important; font: 600 20px/1.15 var(--f-display) !important; letter-spacing: .01em !important; text-transform: none !important; color: var(--ink) !important; }
  .csrc { font-size: 10.5px; color: var(--muted); }
  .csub { margin: 0; font-style: italic; color: var(--silver); font-size: 13px; }
  .meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(140px, 100%), 1fr)); gap: 6px 14px; margin: 2px 0; padding: 8px 10px;
    border: 1px solid var(--line); border-radius: 10px; background: var(--void); }
  .meta div { min-width: 0; }
  .meta .wide { grid-column: 1 / -1; }
  dt { font: 600 9.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  dd { margin: 0; font-size: 13px; }
  dd :global(a.cref) { margin-right: 6px; }
  .levels { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
  .levels li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 2px 8px; font-size: 13px; }
  .levels li b { font: 600 12px var(--f-mono); color: var(--ember-soft); }
  .levels .sub { grid-column: 2; }
  .flink { border: 0; background: none; padding: 0; color: var(--ink); font: inherit; text-decoration: underline dotted color-mix(in srgb, var(--ink) 40%, transparent); }
  .flink:hover { color: var(--ember); }
  .feat h4 { margin: 10px 0 4px; font: 600 14px var(--f-display); }
  .higher { border-top: 1px dashed var(--line); padding-top: 6px; }
</style>
