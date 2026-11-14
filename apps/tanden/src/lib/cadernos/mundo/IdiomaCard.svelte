<script lang="ts">
  import {
    CORE_WORDS, PHONOLOGIES, addToDictionary, languageNames, languageOf, languagePlaces, languageSample, readDictionary, seededRng, setProp, translate, wordFor,
    type Entity, type PropValue,
  } from '@tanden/core';
  import { sound } from '../../sound.svelte';
  import { cadernos } from '../cadernos.svelte';

  // Oficina de idioma na ficha: o som (fonologia), uma semente que fixa as
  // palavras, amostra, nomes de gente e de lugar que significam algo, um
  // tradutor palavra a palavra e o dicionário da nota (que sempre vence o sorteio).
  let { entity, fm, text, oncreate }: { entity: Entity; fm: Record<string, PropValue>; text: string; oncreate: (name: string, type: string) => void } = $props();

  const lang = $derived(languageOf(entity.name, fm, text));
  const dict = $derived(readDictionary(text));
  let seed = $state(1);
  const sample = $derived(languageSample(lang, 16));
  const people = $derived(languageNames(lang, 10, seededRng(lang.seed + seed * 31)));
  const places = $derived(languagePlaces(lang, 6, seededRng(lang.seed + seed * 57)));
  let phrase = $state('');
  const tr = $derived(phrase.trim() ? translate(lang, phrase) : []);
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const inDict = (m: string) => dict.some((d) => fold(d.significado) === fold(m));

  const put = (k: string, v: string) => cadernos.update(entity.path, (t) => setProp(t, k, v));
  function save(entries: Array<{ palavra: string; significado: string }>) {
    const fresh = entries.filter((e) => !inDict(e.significado));
    if (!fresh.length) return cadernos.say('Essas palavras já estão no dicionário.');
    cadernos.update(entity.path, (t) => addToDictionary(t, fresh));
    sound.play('tick');
    cadernos.say(`${fresh.length} ${fresh.length === 1 ? 'palavra guardada' : 'palavras guardadas'} no dicionário.`);
  }
  function basics() {
    save(CORE_WORDS.slice(0, 40).map((m) => ({ significado: m, palavra: wordFor(lang, m) })));
  }
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); cadernos.say(`Copiado: ${t}`); };
</script>

<div class="idi t-card">
  <header>
    <h3 class="t-eyebrow">Oficina do idioma</h3>
    <span class="grow"></span>
    <small class="dim">{dict.length} no dicionário</small>
    <button class="t-btn t-btn--sm" onclick={basics} title="Guarda as 40 palavras básicas (eu, água, fogo, mãe...) no dicionário da nota">+ Palavras básicas</button>
  </header>

  <div class="som">
    <span class="lbl">Som</span>
    <div class="opts">
      {#each PHONOLOGIES as p (p.id)}
        <button class="t-chip" class:on={lang.phon.id === p.id} onclick={() => put('som', p.id)} title={p.desc}>{p.label}</button>
      {/each}
    </div>
    <p class="dim small">{lang.phon.desc} Sílabas: {lang.phon.silabas.join(' · ')}. A <code>semente</code> fixa as palavras; troque para ouvir outra língua com o mesmo som.</p>
    <div class="row">
      <span class="lbl">Semente</span><code>{lang.seed}</code>
      <button class="t-btn t-btn--sm" onclick={() => put('semente', String(Math.floor(Math.random() * 1e6)))} title="Outra língua com o mesmo som (as palavras do dicionário ficam)">🎲 Outra</button>
    </div>
  </div>

  <div class="cols">
    <section>
      <h4 class="lbl">Como soa</h4>
      <div class="words">
        {#each sample as w (w.significado)}
          <button class="w" class:saved={inDict(w.significado)} onclick={() => save([w])} title={inDict(w.significado) ? 'Já está no dicionário' : 'Guardar no dicionário'}>
            <b>{w.palavra}</b><small>{w.significado}</small>
          </button>
        {/each}
      </div>
    </section>
    <section>
      <h4 class="lbl">Nomes <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (seed += 1)} title="Outros nomes">🎲</button></h4>
      <div class="names">
        {#each people as n (n)}<button class="t-chip" onclick={() => copy(n)} title="Copiar">{n}</button>{/each}
      </div>
      <h4 class="lbl">Lugares que significam algo</h4>
      <ul class="places">
        {#each places as p (p.nome)}
          <li><b>{p.nome}</b><span class="dim">“{p.sentido}”</span><button class="t-btn t-btn--sm t-btn--quiet" onclick={() => oncreate(p.nome, 'lugar')} title="Criar ficha de lugar">+ lugar</button></li>
        {/each}
      </ul>
    </section>
  </div>

  <section class="tr">
    <h4 class="lbl">Tradutor</h4>
    <input class="t-input" bind:value={phrase} placeholder="Escreva uma frase: o rei morreu na montanha" aria-label="Frase para traduzir" />
    {#if tr.length}
      <div class="out">
        <p class="said">{tr.map((x) => x.to).join(' ')}</p>
        <div class="gloss">{#each tr as x, i (i)}<span><b>{x.to}</b><small>{x.from}</small></span>{/each}</div>
        <button class="t-btn t-btn--sm" onclick={() => save(tr.map((x) => ({ palavra: x.to, significado: x.from.toLowerCase() })))}>Guardar estas palavras</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .idi { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-3); }
  header { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .grow { flex: 1; }
  .lbl { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .opts, .names { display: flex; flex-wrap: wrap; gap: 4px; }
  .opts .t-chip, .names .t-chip { min-height: 26px; padding: 2px 10px; font-size: 12.5px; }
  .names .t-chip { font-family: var(--f-display); }
  .som { display: grid; gap: 6px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: var(--sp-4); }
  section { display: grid; gap: 6px; align-content: start; }
  .words { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 4px; }
  .w { display: grid; gap: 1px; text-align: left; padding: 5px 8px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface-2); color: var(--ink); }
  .w b { font: 600 14px var(--f-display); }
  .w small { color: var(--muted); font-size: 11px; }
  .w.saved { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
  .w:hover { border-color: var(--ember); }
  .places { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .places li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 13.5px; }
  .places b { font-family: var(--f-display); }
  .out { display: grid; gap: 6px; }
  .said { margin: 0; font: italic 600 17px var(--f-display); }
  .gloss { display: flex; flex-wrap: wrap; gap: 10px; }
  .gloss span { display: grid; }
  .gloss small { color: var(--muted); font-size: 11px; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
</style>
