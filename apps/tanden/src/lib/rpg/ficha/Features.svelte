<script lang="ts">
  import { CLASS_PT, entriesToHtml, featuresUpTo, setSheetText, summaryOf, type Entry } from '@tanden/core';
  import { compendio } from '../compendio.svelte';
  import TextBlock from './TextBlock.svelte';
  import type { FichaCtx } from './ctx';

  // Características: o que a classe, a subclasse, a espécie, o antecedente e
  // os talentos dão (texto do compêndio, sempre do nível atual), e as
  // anotações livres da nota.
  let { x }: { x: FichaCtx } = $props();
  const c = $derived(x.c);
  const ed = $derived(c.edition);
  const klass = $derived(c.classes.map((k) => `${k.info?.name ?? k.name} ${k.level}`).join(' / '));

  $effect(() => { if (c.sheet.system === '5e') void compendio.load(); });
  const comp = $derived(compendio.comp);

  interface Item { key: string; name: string; tag: string; entries: Entry[] }
  interface Group { title: string; items: Item[]; ref?: string }

  const groups = $derived.by((): Group[] => {
    if (!comp) return [];
    const out: Group[] = [];
    c.classes.forEach((cl, i) => {
      const cls = comp.classFor(cl.name, ed);
      if (!cls) return;
      const sub = i === 0 ? comp.subclassFor(cls, c.subclass, ed) : null;
      const list = featuresUpTo(cls, sub, cl.level).filter((f) => !/^ability score improvement$/i.test(f.name));
      out.push({
        title: `${CLASS_PT[cls.name] ?? cls.name} ${cl.level}${sub ? ` · ${sub.name}` : ''}`,
        ref: `class|${cls.name}|${cls.source}`,
        items: list.map((f, j) => ({ key: `c${i}-${j}`, name: f.name, tag: `${f.from === 'subclasse' ? 'subclasse · ' : ''}nível ${f.level}`, entries: f.entries })),
      });
    });
    const sp = c.species ? comp.speciesFor(c.species, ed) : null;
    if (sp) {
      const traits = sp.entries.filter((e): e is Exclude<Entry, string> => typeof e === 'object' && !!e.name && !/^(age|size|alignment|language|languages)$/i.test(e.name));
      out.push({ title: `${sp.name}${c.lineage ? ` · ${c.lineage}` : ''}`, ref: `species|${sp.name}|${sp.source}`,
        items: traits.map((t, j) => ({ key: `s${j}`, name: t.name ?? '', tag: 'espécie', entries: t.entries ?? [] })) });
    }
    const bg = c.background ? comp.backgroundFor(c.background, ed) : null;
    if (bg) {
      const feats = bg.entries.filter((e): e is Exclude<Entry, string> => typeof e === 'object' && !!e.name && /feature|característica/i.test(e.name));
      out.push({ title: `Antecedente · ${bg.name}`, ref: `background|${bg.name}|${bg.source}`,
        items: (feats.length ? feats : []).map((t, j) => ({ key: `b${j}`, name: (t.name ?? '').replace(/^Feature:\s*/i, ''), tag: 'antecedente', entries: t.entries ?? [] })) });
    }
    const feats = c.featList.map((n) => comp.featFor(n.replace(/\s*\(.*\)$/, ''), ed)).filter((f) => !!f);
    if (feats.length) out.push({ title: 'Talentos', items: feats.map((f, j) => ({ key: `f${j}`, name: c.featList[j] ?? f!.name, tag: 'talento', entries: f!.entries })) });
    const opts = c.classOptions.map((n) => comp.find('optionalfeature', n, '', ed)).filter((o) => !!o);
    if (opts.length) out.push({ title: 'Opções de classe', items: opts.map((o, j) => ({ key: `o${j}`, name: o!.name, tag: 'opção', entries: o!.entries })) });
    return out;
  });

  let open = $state<Record<string, boolean>>({});
  let allOpen = $state(false);
  const isOpen = (k: string) => open[k] ?? allOpen;
</script>

<div class="feat">
  {#if c.sheet.system === '5e' && (c.classes.length || c.species)}
    <section class="auto wide">
      <header>
        <h4>Do livro · {klass || 'sem classe'}</h4>
        {#if groups.length}<button class="ghost sm" onclick={() => { allOpen = !allOpen; open = {}; }}>{allOpen ? 'Recolher tudo' : 'Abrir tudo'}</button>{/if}
      </header>
      {#if compendio.status === 'missing'}
        <p class="dim small">Gere o compêndio (<code>node scripts/compendio-5e.mjs</code>) para ver aqui o texto de cada característica.</p>
      {:else if !comp}
        <p class="dim small">Abrindo o compêndio…</p>
      {:else if !groups.length}
        <p class="dim small">Classe e espécie não encontradas no compêndio ({ed}). Use os nomes do livro (ex.: Guerreiro, Elf, Soldier).</p>
      {/if}
      {#each groups as g (g.title)}
        <div class="grp">
          <h5>{#if g.ref}<button class="lnk" onclick={() => compendio.open(g.ref!, ed)}>{g.title}</button>{:else}{g.title}{/if}</h5>
          {#each g.items as it (it.key)}
            <div class="fi" class:on={isOpen(it.key)}>
              <button class="fh" onclick={() => (open = { ...open, [it.key]: !isOpen(it.key) })} aria-expanded={isOpen(it.key)}>
                <b>{it.name}</b><small>{it.tag}</small>
                {#if !isOpen(it.key)}<span class="sum">{summaryOf(it.entries, 140)}</span>{/if}
              </button>
              {#if isOpen(it.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <div class="rules" onclick={(e) => compendio.click(e, ed)}>{@html entriesToHtml(it.entries)}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/each}
    </section>
  {/if}

  <div class="wide">
    <TextBlock title={`Anotações de classe${klass ? ` · ${klass}` : ''}`} value={c.texts.features} rows={6}
      placeholder={'Escolhas e lembretes: maestrias de armas, estilo de luta, alvos de Inimigo Favorito…'}
      onsave={(v) => x.update((t) => setSheetText(t, 'features', v))} />
  </div>
  <TextBlock title={`Traços de espécie${c.species ? ` · ${c.species}` : ''}`} value={c.texts.traits} rows={5}
    placeholder="Anotações da espécie e da linhagem…" onsave={(v) => x.update((t) => setSheetText(t, 'traits', v))} />
  <TextBlock title="Talentos (anotações)" value={c.texts.feats} rows={5}
    placeholder={`Os talentos da lista "talentos" aparecem acima com o texto do livro.`} onsave={(v) => x.update((t) => setSheetText(t, 'feats', v))} />
</div>

<style>
  .feat { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 14px; }
  .wide { grid-column: 1 / -1; min-width: 0; }
  .auto { display: grid; gap: 10px; min-width: 0; }
  .auto header { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  h4 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h5 { margin: 0 0 4px; font: 600 14px var(--f-display); letter-spacing: .02em; }
  .lnk { border: 0; background: none; padding: 0; color: var(--ink); font: inherit; }
  .lnk:hover { color: var(--ember); }
  .grp { display: grid; gap: 2px; min-width: 0; }
  .fi { border: 1px solid transparent; border-radius: 10px; min-width: 0; }
  .fi.on { border-color: var(--line); background: var(--surface); }
  .fh { width: 100%; text-align: left; border: 0; background: none; padding: 6px 10px; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; color: var(--ink); border-radius: 10px; }
  .fh:hover { background: var(--surface-2); }
  .fh b { font-weight: 600; font-size: 13.5px; }
  .fh small { font: 10.5px var(--f-mono); color: var(--ember-soft); }
  .fh .sum { flex-basis: 100%; min-width: 0; max-width: 100%; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fi .rules { padding: 2px 12px 10px; }
</style>
