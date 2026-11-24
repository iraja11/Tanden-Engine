<script lang="ts">
  import {
    NATUREZAS, PHONOLOGIES, asList, asText, getSection, languageNames, languageOf, languageSample, naturezaInfo, parseWorldDate, readDictionary, seededRng,
    type Entity, type World,
  } from '@tanden/core';
  import { rise } from '../../motion';
  import { cadernos } from '../cadernos.svelte';
  import { typeColor } from '../tipos';
  import CalendarioView from './vivo/CalendarioView.svelte';
  import PoderesView from './vivo/PoderesView.svelte';

  // Sistemas do mundo, cada um com sua vitrine: idiomas, fé (religiões e
  // panteão), magia, a biblioteca, os feitos, as profecias e os planos.
  // Tudo continua sendo nota comum; aqui só se junta, cruza e cria.
  let { world, byPath, onopen, oncreate, inicial }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    oncreate: (name: string, type: string, extra: { props: Record<string, string>; sections: string[] }) => void;
    /** seção pedida de fora (um sinal do arauto, por exemplo) */
    inicial?: string | null;
  } = $props();

  type Sec = 'idiomas' | 'fe' | 'magia' | 'poderes' | 'calendario' | 'livros' | 'feitos' | 'profecias' | 'planos';
  const SECS: Array<{ id: Sec; label: string; tipo: string[] }> = [
    { id: 'idiomas', label: 'Idiomas', tipo: ['idioma'] },
    { id: 'fe', label: 'Fé', tipo: ['religiao', 'divindade'] },
    { id: 'magia', label: 'Magia', tipo: ['magia'] },
    { id: 'poderes', label: 'Poderes', tipo: ['poder'] },
    { id: 'calendario', label: 'Calendário', tipo: ['calendario'] },
    { id: 'livros', label: 'Biblioteca', tipo: ['livro'] },
    { id: 'feitos', label: 'Feitos', tipo: ['feito'] },
    { id: 'profecias', label: 'Profecias', tipo: ['profecia'] },
    { id: 'planos', label: 'Planos', tipo: ['plano'] },
  ];
  let sec = $state<Sec>('idiomas');
  $effect(() => { if (inicial && SECS.some((x) => x.id === inicial)) sec = inicial as Sec; });
  const count = (tipos: string[]) => world.entities.filter((e) => tipos.includes(e.type)).length;

  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const val = (e: Entity, ...ks: string[]) => {
    for (const k of ks) {
      const key = Object.keys(e.props).find((x) => fold(x) === fold(k));
      // "mar, luto" vale como dois itens (vírgula fora de [[link]])
      if (key) return asList(e.props[key]).flatMap((x) => x.split(/,(?![^[]*\]\])/)).map((x) => x.trim()).filter(Boolean);
    }
    return [];
  };
  const txt = (e: Entity, ...ks: string[]) => val(e, ...ks).join(', ').replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');
  /** fichas ligadas por um campo (os [[links]] que existem) */
  const linked = (e: Entity, ...labels: string[]) =>
    e.relations.filter((r) => r.to && labels.some((l) => fold(r.label) === fold(l))).map((r) => byPath.get(r.to!)).filter((x): x is Entity => !!x);
  const of = (t: string) => world.entities.filter((e) => e.type === t);

  // ------------------------------------------------ idiomas
  const langs = $derived.by(() => {
    void cadernos.rev;
    return of('idioma').map((e) => {
      const text = cadernos.read(e.path);
      const lang = languageOf(e.name, e.props, text);
      return { e, lang, sample: languageSample(lang, 6), names: languageNames(lang, 4, seededRng(lang.seed)), dict: readDictionary(text).length, speakers: linked(e, 'falado por', 'falantes') };
    });
  });
  const mute = $derived.by(() => {
    const spoken = new Set(langs.flatMap((l) => l.speakers.map((s) => s.path)));
    for (const e of world.entities) for (const r of e.relations) if (/^idiomas?$|^l[ií]nguas?$/i.test(r.label.trim()) && r.to && byPath.get(r.to)?.type === 'idioma') spoken.add(e.path);
    return world.entities.filter((e) => (e.type === 'cultura' || (e.type === 'especie' && /sapien|ancestral|coletiv/i.test(txt(e, 'inteligência')))) && !spoken.has(e.path));
  });
  let newLang = $state('');
  let newSom = $state('suave');
  function createLang(forWho?: Entity) {
    const name = newLang.trim() || (forWho ? `Língua de ${forWho.name}` : '');
    if (!name) return;
    oncreate(name, 'idioma', { props: { som: newSom, ...(forWho ? { 'falado por': `[[${forWho.name}]]` } : {}) }, sections: [] });
    newLang = '';
  }

  // ------------------------------------------------ fé
  const gods = $derived(of('divindade'));
  const religions = $derived(of('religiao').map((r) => ({
    e: r, deuses: linked(r, 'divindades', 'deuses', 'divindade'), livros: linked(r, 'textos sagrados', 'livros'), fieis: linked(r, 'seguidores', 'fiéis'),
    sede: linked(r, 'sede')[0] ?? null, mae: linked(r, 'cisma de')[0] ?? null,
  })));
  // religiões em árvore pelos cismas: as que não vieram de outra ficam na raiz
  const religionTree = $derived.by(() => {
    const kids = new Map<string, typeof religions>();
    for (const r of religions) if (r.mae) kids.set(r.mae.path, [...(kids.get(r.mae.path) ?? []), r]);
    const out: Array<{ r: (typeof religions)[number]; depth: number }> = [];
    const walk = (r: (typeof religions)[number], depth: number) => {
      out.push({ r, depth });
      for (const k of kids.get(r.e.path) ?? []) if (depth < 8) walk(k, depth + 1);
    };
    for (const r of religions) if (!r.mae || !religions.some((x) => x.e.path === r.mae!.path)) walk(r, 0);
    return out;
  });
  const worshipped = $derived(new Set(religions.flatMap((r) => r.deuses.map((d) => d.path))));
  const faithless = $derived(of('cultura').filter((c) => !c.relations.some((r) => /^religi|^f[eé]$/i.test(r.label.trim()) && r.to) && !religions.some((r) => r.fieis.some((f) => f.path === c.path))));
  const pantheons = $derived.by(() => {
    const m = new Map<string, Entity[]>();
    for (const g of gods) {
      const p = txt(g, 'panteão', 'panteao') || 'Sem panteão';
      m.set(p, [...(m.get(p) ?? []), g]);
    }
    return [...m.entries()].sort((a, b) => (a[0] === 'Sem panteão' ? 1 : b[0] === 'Sem panteão' ? -1 : a[0].localeCompare(b[0], 'pt-BR')));
  });
  const domains = $derived.by(() => {
    const m = new Map<string, Entity[]>();
    for (const g of gods) for (const d of val(g, 'domínios', 'dominios', 'domínio')) {
      const k = d.replace(/\[\[|\]\]/g, '').trim().toLowerCase();
      if (k) m.set(k, [...(m.get(k) ?? []), g]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  });
  const COMMON = ['guerra', 'morte', 'amor', 'colheita', 'mar', 'sol', 'lua', 'sabedoria', 'forja', 'caça', 'tempestade', 'trapaça', 'cura', 'destino', 'noite', 'fogo'];
  const unclaimed = $derived(COMMON.filter((d) => !domains.some(([k]) => k === d)));
  let newGod = $state('');
  let newDom = $state('');
  let newRel = $state('');
  function createGod() {
    if (!newGod.trim()) return;
    oncreate(newGod.trim(), 'divindade', { props: { 'domínios': newDom.trim() }, sections: ['Mitos', 'Culto'] });
    newGod = newDom = '';
  }
  function createRel(god?: Entity) {
    const name = newRel.trim() || (god ? `Culto de ${god.name}` : '');
    if (!name) return;
    oncreate(name, 'religiao', { props: god ? { divindades: `[[${god.name}]]` } : {}, sections: [] });
    newRel = '';
  }

  // ------------------------------------------------ magia
  const MAGIC_SECS = ['Como funciona', 'Custo e limites', 'Quem pode usar', 'O que a sociedade acha', 'Quando dá errado'];
  const magics = $derived.by(() => {
    void cadernos.rev;
    return of('magia').map((e) => {
      const text = cadernos.read(e.path);
      const answered = MAGIC_SECS.filter((s) => (getSection(text, s) ?? '').trim().length > 10);
      const d = fold(txt(e, 'dureza'));
      return { e, answered, dureza: /rigid|dura|hard/.test(d) ? 0.85 : /maci|soft|mist/.test(d) ? 0.15 : d ? 0.5 : null, escolas: val(e, 'escolas').map((x) => x.replace(/\[\[|\]\]/g, '')), praticantes: linked(e, 'quem usa', 'praticantes') };
    });
  });
  let newMagic = $state('');
  function createMagic() {
    if (!newMagic.trim()) return;
    oncreate(newMagic.trim(), 'magia', { props: {}, sections: [] });
    newMagic = '';
  }

  // ------------------------------------------------ biblioteca
  const books = $derived(of('livro').map((e) => ({
    e, ano: parseWorldDate(txt(e, 'data')), autor: txt(e, 'autor'), genero: txt(e, 'gênero', 'genero'), idioma: txt(e, 'idioma'),
    proibido: /^(sim|s|true|1)/i.test(txt(e, 'proibido')), raro: /rar|[uú]nic|perdid/i.test(txt(e, 'raridade', 'cópias')),
  })).sort((a, b) => (a.ano ?? 1e9) - (b.ano ?? 1e9) || a.e.name.localeCompare(b.e.name, 'pt-BR')));
  const SPINE = ['#7b3f2c', '#2f4f6f', '#4e6b3a', '#6b4e7b', '#8a6d2f', '#3f5f5a', '#7a2f45', '#5a4632'];
  const spine = (name: string) => SPINE[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % SPINE.length]!;
  let bookSel = $state<string | null>(null);
  const bookCur = $derived(books.find((b) => b.e.path === bookSel) ?? null);
  // títulos sugeridos com as fichas do mundo
  let titleSeed = $state(1);
  const bookTitles = $derived.by(() => {
    const rng = seededRng(titleSeed * 97 + world.entities.length);
    const pick = <T,>(l: T[]): T | undefined => l[Math.floor(rng() * l.length)];
    const P = of('personagem'), L = of('lugar'), F = of('faccao'), D = gods, M = of('magia'), C = of('conflito');
    const forms: Array<() => string | null> = [
      () => { const l = pick(L); return l ? `Crônicas de ${l.name}` : null; },
      () => { const p = pick(P); return p ? `As memórias de ${p.name}` : null; },
      () => { const m = pick(M); return m ? `Tratado sobre ${m.name.toLowerCase()}` : 'Tratado das forças ocultas'; },
      () => { const d = pick(D); return d ? `Os cânticos de ${d.name}` : null; },
      () => { const c = pick(C); return c ? `A verdadeira história d${/a$/.test(c.name) ? 'a' : 'o'} ${c.name}` : null; },
      () => { const f = pick(F); return f ? `Regimento d${/a$/.test(f.name.split(' ')[0]!) ? 'a' : 'o'} ${f.name}` : null; },
      () => { const l = pick(L); return l ? `Bestiário das terras de ${l.name}` : 'Bestiário das terras de além'; },
      () => 'O livro que não deveria existir',
    ];
    const out = new Set<string>();
    for (let k = 0; k < 30 && out.size < 5; k++) { const t = pick(forms)?.(); if (t) out.add(t); }
    return [...out];
  });

  // ------------------------------------------------ feitos
  const deeds = $derived(of('feito').map((e) => ({ e, ano: parseWorldDate(txt(e, 'data')), data: txt(e, 'data'), autores: linked(e, 'autor', 'autores', 'heróis'), cat: txt(e, 'categoria') }))
    .sort((a, b) => (a.ano ?? 1e9) - (b.ano ?? 1e9)));
  const heroes = $derived.by(() => {
    const m = new Map<string, { e: Entity; n: number }>();
    for (const d of deeds) for (const a of d.autores) m.set(a.path, { e: a, n: (m.get(a.path)?.n ?? 0) + 1 });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  });
  const catCor = (c: string) => (/vergonh|crime|trai|massacr/i.test(c) ? 'var(--crit)' : /descobert|inven|ci[eê]nc/i.test(c) ? '#5b9bd5' : /her[oó]i|vit[oó]ri|salv/i.test(c) ? 'var(--ok)' : 'var(--ember)');
  let newDeed = $state('');
  let newDeedBy = $state('');

  // ------------------------------------------------ profecias
  const STATUS = ['pendente', 'em curso', 'cumprida', 'falsa'];
  const prophecies = $derived(of('profecia').map((e) => {
    const st = fold(txt(e, 'status'));
    return { e, st: /cumpr|realiz/.test(st) ? 'cumprida' : /fals|errad/.test(st) ? 'falsa' : /curso|andamento|come/.test(st) ? 'em curso' : 'pendente', sobre: linked(e, 'sobre', 'escolhido'), profeta: linked(e, 'profeta')[0] ?? null };
  }));
  let newProph = $state('');

  // ------------------------------------------------ planos
  const NAT_COR: Record<string, string> = { material: '#7aa36a', infernal: '#d9542a', feerico: '#3fae8a', umbral: '#8a8c94', astral: '#8f7fd8', subterraneo: '#8a6f55' };
  const planes = $derived.by(() => {
    void cadernos.rev;
    return of('plano').map((e) => {
      const nat = naturezaInfo(txt(e, 'natureza'));
      const here = (x: Entity) => x.relations.some((r) => r.to === e.path && /^plano$|^parte de$|^reino$/i.test(r.label.trim()));
      return { e, nat, maps: of('mapa').filter(here), lugares: of('lugar').filter(here), habitantes: linked(e, 'habitantes'), ligado: linked(e, 'ligado a', 'portais') };
    });
  });
  let newPlane = $state('');
  let newNat = $state('feerico');
  function createPlane() {
    if (!newPlane.trim()) return;
    oncreate(newPlane.trim(), 'plano', { props: { natureza: newNat }, sections: [] });
    newPlane = '';
  }
  function mapFor(p: Entity) {
    oncreate(`Mapa de ${p.name}`, 'mapa', { props: { plano: `[[${p.name}]]` }, sections: [] });
  }
</script>

<div class="sis">
  <div class="t-seg secs t-scroll-x" role="tablist" aria-label="Sistemas">
    {#each SECS as s (s.id)}
      <button role="tab" aria-selected={sec === s.id} class:on={sec === s.id} onclick={() => (sec = s.id)}>{s.label}<small>{count(s.tipo)}</small></button>
    {/each}
  </div>

  {#if sec === 'idiomas'}
    <section class="block" in:rise={{ y: 6 }}>
      {#if langs.length}
        <div class="grid">
          {#each langs as l, i (l.e.path)}
            <button class="card t-card" onclick={() => onopen(l.e.path)} in:rise={{ delay: i * 30, y: 6 }} style:--c={typeColor('idioma')}>
              <span class="top"><b>{l.e.name}</b><small>{l.lang.phon.label} · {l.dict} no dicionário</small></span>
              <span class="ws">{#each l.sample as w (w.significado)}<span><i>{w.palavra}</i><small>{w.significado}</small></span>{/each}</span>
              <span class="dim sm">Nomes: {l.names.join(', ')}</span>
              {#if l.speakers.length}<span class="row">{#each l.speakers as s (s.path)}<span class="chip" style:--t={typeColor(s.type)}>{s.name}</span>{/each}</span>{/if}
            </button>
          {/each}
        </div>
      {:else}
        <p class="dim small">Nenhum idioma ainda. Uma língua dá nomes coerentes a pessoas e lugares do mesmo povo, e algumas palavras soltas no texto dão sabor sem cansar.</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); createLang(); }}>
        <input class="t-input" bind:value={newLang} placeholder="Nome da língua: Alto Vereno" aria-label="Nome do idioma" />
        <select class="t-select" bind:value={newSom} aria-label="Som">{#each PHONOLOGIES as p (p.id)}<option value={p.id}>{p.label}</option>{/each}</select>
        <button class="t-btn t-btn--primary" disabled={!newLang.trim()}>Criar idioma</button>
      </form>
      {#if mute.length}
        <div class="row"><span class="dim small">Povos sem língua:</span>{#each mute as m (m.path)}<button class="chip" style:--t={typeColor(m.type)} onclick={() => createLang(m)}>+ língua de {m.name}</button>{/each}</div>
      {/if}
    </section>
  {:else if sec === 'fe'}
    <section class="block" in:rise={{ y: 6 }}>
      <h3>Religiões</h3>
      {#if religionTree.length}
        <div class="tree">
          {#each religionTree as { r, depth } (r.e.path)}
            <button class="rel t-card" style:margin-left="{depth * 26}px" onclick={() => onopen(r.e.path)} style:--c={typeColor('religiao')}>
              {#if depth}<span class="branch" aria-hidden="true">↳ cisma</span>{/if}
              <span class="top"><b>☥ {r.e.name}</b><small>{[txt(r.e, 'símbolo', 'simbolo'), r.sede ? `sede: ${r.sede.name}` : '', txt(r.e, 'fundação', 'fundacao') ? `desde ${txt(r.e, 'fundação', 'fundacao')}` : ''].filter(Boolean).join(' · ')}</small></span>
              <span class="row">
                {#each r.deuses as d (d.path)}<span class="chip" style:--t={typeColor('divindade')}>☀ {d.name}</span>{/each}
                {#each r.livros as b (b.path)}<span class="chip" style:--t={typeColor('livro')}>▤ {b.name}</span>{/each}
                {#each r.fieis as f (f.path)}<span class="chip" style:--t={typeColor(f.type)}>{f.name}</span>{/each}
                {#if !r.deuses.length && !r.fieis.length}<span class="dim sm">Sem deuses nem fiéis ligados ainda: preencha <code>divindades</code> e <code>seguidores</code>.</span>{/if}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="dim small">Nenhuma religião ainda. Uma fé organizada tem crenças, ritos, clero, heresias e, quase sempre, política. Ligue <code>cisma de: [[Outra fé]]</code> para montar a árvore.</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); createRel(); }}>
        <input class="t-input" bind:value={newRel} placeholder="Nome da religião: A Fé das Marés" aria-label="Nome da religião" />
        <button class="t-btn t-btn--primary" disabled={!newRel.trim()}>Criar religião</button>
      </form>
      {#if faithless.length}<div class="row"><span class="dim small">Culturas sem fé ligada:</span>{#each faithless as c (c.path)}<button class="chip" style:--t={typeColor('cultura')} onclick={() => onopen(c.path)}>{c.name}</button>{/each}</div>{/if}

      <h3>Panteão</h3>
      {#if gods.length}
        {#each pantheons as [p, list] (p)}
          <div class="pant">
            <h4>{p}</h4>
            <div class="gods">
              {#each list as g (g.path)}
                <div class="god" style:--c={typeColor('divindade')}>
                  <button class="gb" onclick={() => onopen(g.path)}><span class="sun">☀</span><b>{g.name}</b><small>{txt(g, 'domínios', 'dominios') || 'domínios?'}</small></button>
                  {#if !worshipped.has(g.path)}<button class="t-btn t-btn--sm t-btn--quiet" onclick={() => createRel(g)} title="Ninguém cultua esta divindade numa religião">+ culto</button>{/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
        {#if domains.length}
          <div class="row">{#each domains as [d, list] (d)}<span class="dom" class:crowd={list.length > 1} title={list.map((g) => g.name).join(', ')}>{d}<small>{list.length}</small></span>{/each}</div>
          {#if domains.some(([, l]) => l.length > 1)}<p class="dim small">Domínios com mais de um deus podem virar rivalidade, ou um culto que funde os dois.</p>{/if}
        {/if}
      {:else}
        <p class="dim small">Nenhuma divindade ainda. Deuses podem existir de verdade, ser só crença, ou o leitor nunca saber.</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); createGod(); }}>
        <input class="t-input" bind:value={newGod} placeholder="Nome: Ysolde, a que Pesa" aria-label="Nome da divindade" />
        <input class="t-input" bind:value={newDom} placeholder="domínios: mar, luto" aria-label="Domínios" />
        <button class="t-btn t-btn--primary" disabled={!newGod.trim()}>Criar divindade</button>
      </form>
      {#if unclaimed.length && gods.length}<div class="row"><span class="dim small">Ninguém cuida de:</span>{#each unclaimed.slice(0, 10) as d (d)}<button class="chip" style:--t={typeColor('divindade')} onclick={() => (newDom = d)}>{d}</button>{/each}</div>{/if}
    </section>
  {:else if sec === 'magia'}
    <section class="block" in:rise={{ y: 6 }}>
      {#if magics.length}
        <div class="grid">
          {#each magics as m (m.e.path)}
            <button class="card t-card" onclick={() => onopen(m.e.path)} style:--c={typeColor('magia')}>
              <span class="top"><b>✧ {m.e.name}</b><small>{[txt(m.e, 'fonte') && `fonte: ${txt(m.e, 'fonte')}`, txt(m.e, 'custo') && `custo: ${txt(m.e, 'custo')}`].filter(Boolean).join(' · ') || 'fonte e custo ainda em aberto'}</small></span>
              {#if m.dureza !== null}
                <span class="hard" title="Dureza: rígida (regras claras) a macia (mistério)"><small>macia</small><span class="track"><i style:left="{m.dureza * 100}%"></i></span><small>rígida</small></span>
              {/if}
              {#if m.escolas.length}<span class="row">{#each m.escolas as s (s)}<span class="chip" style:--t={typeColor('magia')}>{s}</span>{/each}</span>{/if}
              {#if m.praticantes.length}<span class="dim sm">Usada por {m.praticantes.map((p) => p.name).join(', ')}</span>{/if}
              <span class="checks">{#each MAGIC_SECS as s (s)}<span class:ok={m.answered.includes(s)}>{m.answered.includes(s) ? '✓' : '○'} {s}</span>{/each}</span>
            </button>
          {/each}
        </div>
        <p class="dim small">As cinco perguntas embaixo de cada sistema são as seções da ficha: magia boa tem fonte, custo, limites, quem pode usar e o que acontece quando dá errado.</p>
      {:else}
        <p class="dim small">Nenhum sistema de magia ainda. Limites valem mais que poderes: o que a magia não pode fazer é o que gera tensão.</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); createMagic(); }}>
        <input class="t-input" bind:value={newMagic} placeholder="Nome do sistema: Cantochão, Sangria, Os Nomes Verdadeiros" aria-label="Nome do sistema de magia" />
        <button class="t-btn t-btn--primary" disabled={!newMagic.trim()}>Criar sistema</button>
      </form>
    </section>
  {:else if sec === 'poderes'}
    <PoderesView {world} {onopen} />
  {:else if sec === 'calendario'}
    <CalendarioView {world} {onopen} />
  {:else if sec === 'livros'}
    <section class="block" in:rise={{ y: 6 }}>
      {#if books.length}
        <div class="shelf t-scroll-x" aria-label="Estante">
          {#each books as b (b.e.path)}
            <button class="book" class:on={bookSel === b.e.path} class:proibido={b.proibido} style:--b={spine(b.e.name)} style:height="{120 + (b.e.name.length % 5) * 10}px"
              onclick={() => (bookSel = bookSel === b.e.path ? null : b.e.path)} title={b.e.name}>
              <span>{b.e.name}</span>{#if b.proibido}<i>⛔</i>{:else if b.raro}<i>✦</i>{/if}
            </button>
          {/each}
        </div>
        {#if bookCur}
          <div class="bookinfo t-card" in:rise={{ y: 6 }}>
            <b>{bookCur.e.name}</b>
            <span class="dim sm">{[bookCur.autor && `por ${bookCur.autor}`, bookCur.genero, bookCur.idioma && `em ${bookCur.idioma}`, txt(bookCur.e, 'data')].filter(Boolean).join(' · ') || 'Sem autor, gênero nem data ainda.'}</span>
            {#if bookCur.e.summary}<p>{bookCur.e.summary}</p>{/if}
            <button class="t-btn t-btn--sm" onclick={() => onopen(bookCur!.e.path)}>Abrir ficha</button>
          </div>
        {/if}
        <p class="dim small">Na estante em ordem de data. ⛔ proibido · ✦ raro ou perdido.</p>
      {:else}
        <p class="dim small">A biblioteca está vazia. Livros dão voz ao passado: uma crônica com mentiras, um grimório proibido, uma lei que ninguém cumpre.</p>
      {/if}
      <div class="sug">
        <span class="dim small">Títulos com o seu mundo:</span>
        {#each bookTitles as t (t)}<button class="chip" style:--t={typeColor('livro')} onclick={() => oncreate(t, 'livro', { props: {}, sections: [] })}>+ {t}</button>{/each}
        <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (titleSeed += 1)} title="Outros títulos">🎲</button>
      </div>
    </section>
  {:else if sec === 'feitos'}
    <section class="block" in:rise={{ y: 6 }}>
      {#if deeds.length}
        <ol class="deeds">
          {#each deeds as d (d.e.path)}
            <li style:--k={catCor(d.cat)}>
              <span class="when">{d.data || '—'}</span>
              <button class="what" onclick={() => onopen(d.e.path)}>
                <b>★ {d.e.name}</b>
                <small>{d.cat ? `${d.cat} · ` : ''}{d.autores.map((a) => a.name).join(', ') || 'autor desconhecido'}</small>
              </button>
            </li>
          {/each}
        </ol>
        {#if heroes.length}
          <h3>Quem mais fez história</h3>
          <div class="row">{#each heroes as h (h.e.path)}<button class="chip" style:--t={typeColor(h.e.type)} onclick={() => onopen(h.e.path)}>{h.e.name} <small>{h.n}</small></button>{/each}</div>
        {/if}
      {:else}
        <p class="dim small">Nenhum feito ainda. Façanhas, descobertas e vergonhas que o povo lembra (ou conta errado). Com <code>data</code>, entram na linha do tempo.</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); if (newDeed.trim()) { oncreate(newDeed.trim(), 'feito', { props: newDeedBy ? { autor: `[[${newDeedBy}]]` } : {}, sections: [] }); newDeed = ''; } }}>
        <input class="t-input" bind:value={newDeed} placeholder="O feito: A travessia do Mar Cinza" aria-label="Nome do feito" />
        <select class="t-select" bind:value={newDeedBy} aria-label="Quem fez">
          <option value="">quem fez?</option>
          {#each [...of('personagem'), ...of('faccao')] as p (p.path)}<option value={p.name}>{p.name}</option>{/each}
        </select>
        <button class="t-btn t-btn--primary" disabled={!newDeed.trim()}>Registrar feito</button>
      </form>
    </section>
  {:else if sec === 'profecias'}
    <section class="block" in:rise={{ y: 6 }}>
      {#if prophecies.length}
        <div class="kanban">
          {#each STATUS as st (st)}
            <div class="kcol">
              <h4>{st}</h4>
              {#each prophecies.filter((p) => p.st === st) as p (p.e.path)}
                <button class="card t-card" onclick={() => onopen(p.e.path)} style:--c={typeColor('profecia')}>
                  <b>◎ {p.e.name}</b>
                  {#if p.e.summary}<small class="quote">“{p.e.summary}”</small>{/if}
                  <small class="dim">{p.profeta ? `por ${p.profeta.name}` : 'profeta desconhecido'}{p.sobre.length ? ` · sobre ${p.sobre.map((x) => x.name).join(', ')}` : ''}</small>
                </button>
              {/each}
            </div>
          {/each}
        </div>
      {:else}
        <p class="dim small">Nenhuma profecia ainda. Boas profecias têm mais de uma leitura, e alguém tentando cumpri-la (e alguém tentando impedir).</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); if (newProph.trim()) { oncreate(newProph.trim(), 'profecia', { props: { status: 'pendente' }, sections: [] }); newProph = ''; } }}>
        <input class="t-input" bind:value={newProph} placeholder="A Profecia da Sétima Maré" aria-label="Nome da profecia" />
        <button class="t-btn t-btn--primary" disabled={!newProph.trim()}>Criar profecia</button>
      </form>
    </section>
  {:else}
    <section class="block" in:rise={{ y: 6 }}>
      {#if planes.length}
        <div class="grid">
          {#each planes as p (p.e.path)}
            <div class="card t-card plane" style:--c={NAT_COR[p.nat.id]}>
              <button class="ptop" onclick={() => onopen(p.e.path)}><b>◍ {p.e.name}</b><small>{p.nat.label} · {p.nat.desc}</small></button>
              <span class="dim sm">{[txt(p.e, 'acesso') && `acesso: ${txt(p.e, 'acesso')}`, txt(p.e, 'governante') && `governa: ${txt(p.e, 'governante')}`].filter(Boolean).join(' · ')}</span>
              {#if p.habitantes.length || p.ligado.length}
                <span class="row">{#each p.habitantes as h (h.path)}<span class="chip" style:--t={typeColor(h.type)}>{h.name}</span>{/each}{#each p.ligado as l (l.path)}<span class="chip" style:--t={typeColor(l.type)}>↔ {l.name}</span>{/each}</span>
              {/if}
              <span class="row">
                {#each p.maps as m (m.path)}<button class="chip" style:--t={typeColor('mapa')} onclick={() => onopen(m.path)}>⌖ {m.name}</button>{/each}
                <button class="t-btn t-btn--sm" onclick={() => mapFor(p.e)}>+ Mapa deste plano</button>
              </span>
              {#if p.lugares.length}<span class="dim sm">{p.lugares.length} {p.lugares.length === 1 ? 'lugar' : 'lugares'}: {p.lugares.slice(0, 6).map((l) => l.name).join(', ')}</span>{/if}
            </div>
          {/each}
        </div>
        <p class="dim small">Mapas e lugares entram num plano com <code>plano: [[Nome]]</code>. O mapa de um plano herda a natureza dele: lava no infernal, névoa no umbral, vazio no astral.</p>
      {:else}
        <p class="dim small">Só o mundo material por enquanto. Planos são outros lugares de existência: o reino das fadas, o inferno, o mundo dos mortos, o espaço entre as estrelas. Cada um pode ter seus próprios mapas.</p>
      {/if}
      <form class="mk" onsubmit={(e) => { e.preventDefault(); createPlane(); }}>
        <input class="t-input" bind:value={newPlane} placeholder="Nome do plano: Feéria, O Fundo, A Cinza" aria-label="Nome do plano" />
        <select class="t-select" bind:value={newNat} aria-label="Natureza">{#each NATUREZAS as n (n.id)}<option value={n.id}>{n.label}</option>{/each}</select>
        <button class="t-btn t-btn--primary" disabled={!newPlane.trim()}>Criar plano</button>
      </form>
    </section>
  {/if}
</div>

<style>
  .sis { display: grid; gap: var(--sp-4); padding-bottom: 40px; }
  .secs { max-width: 100%; }
  .secs small { margin-left: 5px; font: 10px var(--f-mono); color: var(--muted); }
  .block { display: grid; gap: 10px; }
  h3 { margin: 8px 0 0; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h4 { margin: 0 0 6px; font: 600 14px var(--f-display); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 8px; }
  .card { display: grid; gap: 6px; text-align: left; color: var(--ink); border-left: 3px solid var(--c); align-content: start; }
  button.card:hover { border-color: var(--c); }
  .top, .ptop { display: grid; text-align: left; }
  .ptop { border: 0; background: none; padding: 0; color: var(--ink); }
  .top b, .ptop b { font: 600 17px var(--f-display); }
  .top small, .ptop small { color: var(--muted); font-size: 12px; }
  .ws { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .ws span { display: grid; }
  .ws i { font: italic 600 14px var(--f-display); }
  .ws small { font-size: 10.5px; color: var(--muted); }
  .row, .sug { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .chip { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 10%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 1px 9px; font-size: 12px; }
  .chip small { font: 10px var(--f-mono); color: var(--muted); }
  .mk { display: flex; gap: 6px; flex-wrap: wrap; }
  .mk .t-input { flex: 1; min-width: min(180px, 100%); }
  .tree { display: grid; gap: 6px; }
  .rel { display: grid; gap: 4px; text-align: left; color: var(--ink); border-left: 3px solid var(--c); max-width: calc(100% - 0px); }
  .branch { font: 11px var(--f-mono); color: var(--muted); }
  .pant { display: grid; gap: 4px; }
  .gods { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 6px; }
  .god { display: grid; justify-items: center; gap: 2px; padding: 10px 8px; border-radius: var(--r-lg); border: 1px solid color-mix(in srgb, var(--c) 40%, var(--line)); background: radial-gradient(circle at 50% 0, color-mix(in srgb, var(--c) 20%, var(--surface)), var(--surface) 70%); text-align: center; }
  .gb { display: grid; justify-items: center; border: 0; background: none; color: var(--ink); padding: 0; }
  .sun { font-size: 22px; color: var(--c); }
  .gb b { font: 600 15px var(--f-display); }
  .gb small { color: var(--muted); font-size: 11.5px; }
  .dom { border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; background: var(--surface); }
  .dom small { margin-left: 5px; font: 10px var(--f-mono); color: var(--muted); }
  .dom.crowd { border-color: var(--ember); }
  .hard { display: grid; grid-template-columns: auto 1fr auto; gap: 6px; align-items: center; font-size: 10.5px; color: var(--muted); }
  .track { position: relative; height: 4px; border-radius: 2px; background: linear-gradient(90deg, #8f7fd8, #5b9bd5); }
  .track i { position: absolute; top: -4px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--surface); border: 2px solid var(--ink); }
  .checks { display: grid; gap: 1px; font-size: 12px; color: var(--muted); }
  .checks .ok { color: var(--ok); }
  .shelf { display: flex; align-items: flex-end; gap: 3px; padding: 12px 10px 0; border-bottom: 8px solid color-mix(in srgb, #6b4a2b 70%, var(--surface)); border-radius: 4px; background: linear-gradient(180deg, transparent, color-mix(in srgb, #6b4a2b 12%, transparent)); min-height: 180px; }
  .book { position: relative; flex: none; width: 34px; border: 0; border-radius: 3px 3px 0 0; background: linear-gradient(90deg, color-mix(in srgb, var(--b) 70%, #000), var(--b) 30%, color-mix(in srgb, var(--b) 85%, #fff) 50%, var(--b) 70%, color-mix(in srgb, var(--b) 70%, #000)); color: #f3ead6; padding: 8px 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; box-shadow: inset 0 6px 0 -3px #d4b06a, inset 0 -6px 0 -3px #d4b06a; transition: transform .15s; }
  .book span { writing-mode: vertical-rl; transform: rotate(180deg); font: 600 11.5px var(--f-display); letter-spacing: .03em; overflow: hidden; text-overflow: ellipsis; max-height: 100%; white-space: nowrap; }
  .book i { font-style: normal; font-size: 11px; }
  .book:hover, .book.on { transform: translateY(-8px); }
  .book.proibido { box-shadow: inset 0 6px 0 -3px #c0392b, inset 0 -6px 0 -3px #c0392b; }
  .bookinfo { display: grid; gap: 4px; }
  .bookinfo b { font: 600 18px var(--f-display); }
  .bookinfo p { margin: 0; }
  .bookinfo button { justify-self: start; }
  .deeds { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; border-left: 2px solid var(--line); margin-left: 70px; }
  .deeds li { display: grid; grid-template-columns: 70px 1fr; margin-left: -72px; gap: 10px; align-items: center; }
  .when { font: 12px var(--f-mono); color: var(--muted); text-align: right; }
  .what { display: grid; text-align: left; border: 1px solid var(--line); border-left: 3px solid var(--k); border-radius: var(--r-md); background: var(--surface); color: var(--ink); padding: 6px 10px; }
  .what small { color: var(--muted); font-size: 12px; }
  .kanban { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 8px; }
  .kcol { display: grid; gap: 6px; align-content: start; padding: 8px; border-radius: var(--r-md); background: var(--surface-2); }
  .kcol h4 { text-transform: capitalize; font-size: 13px; }
  .quote { font-style: italic; }
  .plane { background: linear-gradient(160deg, color-mix(in srgb, var(--c) 14%, var(--surface)), var(--surface) 60%); }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  .sm { font-size: 12.5px; }
</style>
