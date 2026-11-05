<script lang="ts">
  import {
    DEEP_QUESTIONS, ENTITY_TYPES, FIELD_HINTS, allTypes, worldYear, RESERVED, asList, backlinks, bodyOf, entityFolder, entityTemplate, getSection, linkTarget,
    normalizeType, parseProps, readMarkers, renameProp, reviewWorld, rollTraits, setProp, setProps, setSection, timeline, typeInfo, withBody,
    worldTemplate, type Entity, type PropValue,
  } from '@tanden/core';
  import { hasSheet, imageOf, readItemCard } from '@tanden/core';
  import ItemCard from '../rpg/ItemCard.svelte';
  import Portrait from '../rpg/Portrait.svelte';
  import Editor from '../Editor.svelte';
  import SheetPanel from '../rpg/SheetPanel.svelte';
  import { notes } from '../editor/notes.svelte';
  import type { EditorHost } from '../editor';
  import { rise } from '../motion';
  import { sound } from '../sound.svelte';
  import { cadernos } from './cadernos.svelte';
  import Graph from './Graph.svelte';
  import { guessTypeFromLabel, typeColor, typeGlyph } from './tipos';
  import ConflitosView from './mundo/ConflitosView.svelte';
  import FichaCarta from './mundo/FichaCarta.svelte';
  import IdeiasView from './mundo/IdeiasView.svelte';
  import MapaView from './mundo/MapaView.svelte';
  import Ring from './mundo/Ring.svelte';
  import SimView from './mundo/SimView.svelte';
  import RegrasView from './mundo/RegrasView.svelte';
  import { printCards } from './mundo/print';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  type Tab = 'fichas' | 'mapas' | 'tempo' | 'grafo' | 'conflitos' | 'sim' | 'ideias' | 'regras';
  const TABS: Array<[Tab, string]> = [
    ['fichas', 'Fichas'], ['mapas', 'Mapas'], ['tempo', 'Linha do tempo'], ['grafo', 'Ligações'], ['conflitos', 'Conflitos'], ['sim', 'Simulação'], ['ideias', 'Ideias'], ['regras', 'Regras'],
  ];
  let worldName = $state<string | null>(null);
  let tab = $state<Tab>('fichas');
  let entityPath = $state<string | null>(null);
  let graphSel = $state<string | null>(null);
  let typeFilter = $state<string | null>(null);
  let query = $state('');
  let dialog = $state<null | 'world' | 'entity'>(null);
  let newName = $state('');
  let newType = $state('personagem');
  let look = $state<'lista' | 'cartas'>('lista');
  let order = $state<'nome' | 'vazias'>('nome');
  let mapFocus = $state<{ map: string; target?: string } | null>(null);
  /** ficha recém-criada: brilha um instante no cartão */
  let fresh = $state<string | null>(null);

  const worlds = $derived(cadernos.worlds);
  const world = $derived(worlds.find((w) => w.name === worldName) ?? worlds[0] ?? null);
  const entity = $derived(world?.entities.find((e) => e.path === entityPath) ?? null);
  // chave estável para o editor: o objeto da ficha é refeito a cada mudança, o caminho não
  const entityKey = $derived(entity?.path ?? null);
  const byPath = $derived(new Map(world?.entities.map((e) => [e.path, e]) ?? []));

  const typeCounts = $derived.by(() => {
    const m = new Map<string, number>();
    for (const e of world?.entities ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    const known = ENTITY_TYPES.map((t) => t.id).filter((t) => m.has(t));
    const extra = [...m.keys()].filter((t) => !ENTITY_TYPES.some((x) => x.id === t)).sort();
    return [...known, ...extra].map((t) => ({ type: t, n: m.get(t)! }));
  });

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const shown = $derived.by(() => {
    const q = norm(query.trim());
    const list = (world?.entities ?? []).filter((e) =>
      e.type !== 'mapa' && (!typeFilter || e.type === typeFilter) && (!q || norm(`${e.name} ${e.aliases.join(' ')} ${e.summary}`).includes(q)));
    return order === 'vazias' ? [...list].sort((a, b) => a.score - b.score) : list;
  });

  const spans = $derived(world ? timeline(world).filter((s) => !typeFilter || s.type === typeFilter) : []);
  const graphNodes = $derived((world?.entities ?? []).filter((e) => e.type !== 'mapa' && (!typeFilter || e.type === typeFilter)).map((e) => ({ id: e.path, label: e.name, type: e.type })));
  const graphEdges = $derived.by(() => {
    const ids = new Set(graphNodes.map((n) => n.id));
    return (world?.relations ?? []).filter((r) => r.to && ids.has(r.from) && ids.has(r.to)).map((r) => ({ from: r.from, to: r.to!, label: r.label }));
  });

  // saúde do mundo: média de completude e o que a revisão encontrou
  const health = $derived.by(() => {
    const list = (world?.entities ?? []).filter((e) => e.type !== 'mapa');
    return list.length ? list.reduce((s, e) => s + e.score, 0) / list.length : 0;
  });
  const problems = $derived(world ? reviewWorld(world).filter((i) => i.level !== 'ideia').length : 0);

  $effect(() => { if (entityPath && world && !world.entities.some((e) => e.path === entityPath)) entityPath = null; });

  function pickWorld(name: string) { worldName = name; entityPath = null; typeFilter = null; graphSel = null; mapFocus = null; }
  function openEntity(path: string) {
    const e = byPath.get(path);
    // mapas abrem na aba de mapas, não como ficha
    if (e?.type === 'mapa') {
      entityPath = null;
      mapFocus = { map: path };
      tab = 'mapas';
      return;
    }
    entityPath = path;
    editingKey = null;
  }

  // ------------------------------------------------ criar
  function createWorld() {
    const name = newName.trim();
    if (!name) return;
    const path = cadernos.create(`Mundos/${name}`, name, (n) => worldTemplate(n));
    worldName = path.split('/').pop()!.replace(/\.md$/, '');
    dialog = null;
    entityPath = null;
  }

  function startEntity(name = '', type = typeFilter ?? 'personagem') {
    newName = name;
    newType = type;
    dialog = 'entity';
  }

  function createEntity() {
    if (!world || !newName.trim()) return;
    const type = normalizeType(newType) || 'personagem';
    const path = cadernos.create(entityFolder(world, type), newName.trim(), (n) => entityTemplate(n, world.name, type));
    dialog = null;
    fresh = path;
    setTimeout(() => { if (fresh === path) fresh = null; }, 2400);
    if (type === 'mapa') {
      mapFocus = { map: path };
      tab = 'mapas';
      entityPath = null;
      return;
    }
    tab = 'fichas';
    openEntity(path);
  }

  // ------------------------------------------------ ficha aberta
  const text = $derived.by(() => { void cadernos.rev; return entity ? cadernos.read(entity.path) : ''; });
  const fm = $derived(parseProps(text));
  const fields = $derived(Object.keys(fm).filter((k) => !RESERVED.has(k.toLowerCase())));
  const has = (k: string) => Object.keys(fm).some((x) => x.toLowerCase() === k.toLowerCase());
  const missing = $derived(entity ? typeInfo(entity.type).fields.filter((f) => !has(f)) : []);
  const extras = $derived(entity ? (typeInfo(entity.type).extras ?? []).filter((f) => !has(f)) : []);
  const incoming = $derived(world && entity ? backlinks(world, entity.path) : []);
  const broken = $derived(entity?.relations.filter((r) => !r.to) ?? []);
  const questions = $derived(entity ? DEEP_QUESTIONS[entity.type] ?? [] : []);
  const answered = (q: string) => getSection(body, q) !== null;
  let showQuestions = $state(false);

  // em quais mapas a ficha aparece
  const onMaps = $derived.by(() => {
    if (!world || !entity) return [];
    void cadernos.rev;
    const names = [entity.name, ...entity.aliases].map(norm);
    return world.entities.filter((m) => m.type === 'mapa' && readMarkers(cadernos.read(m.path)).some((mk) => mk.target && names.includes(norm(mk.target.split('/').pop()!))));
  });

  // texto da ficha no editor: muda na hora ao digitar (como nas notas) e volta
  // a seguir a nota quando ela muda por outro caminho (outro aparelho, Obsidian)
  let body = $derived(bodyOf(text));
  function typedBody(b: string) {
    if (!entity) return;
    body = b;
    cadernos.typed(entity.path, withBody(cadernos.read(entity.path), b));
  }

  // editor completo (menu /, [[links]] com sugestões, prévia ao vivo) nas fichas;
  // links para outras fichas abrem aqui mesmo, o resto vai para as notas
  const host: EditorHost = {
    ...notes.host,
    current: () => entityPath,
    open: (raw) => {
      const target = raw.split('|')[0]!.split('#')[0]!.trim();
      if (/^(https?:|mailto:|www\.)/i.test(target)) return notes.host.open(raw);
      const to = target ? notes.host.resolve?.(target) ?? null : null;
      if (to && byPath.has(to)) openEntity(to);
      else if (to) onOpenNote(to);
      else if (target && !/\.[a-z0-9]{2,5}$/i.test(target)) startEntity(target, 'personagem');
      else notes.host.open(raw);
    },
  };

  function ask(q: string) {
    if (!entity) return;
    showQuestions = false;
    const next = setSection(body, q, '');
    typedBody(next);
    sound.play('tick');
  }

  function rollPersonality() {
    if (!entity) return;
    const t = rollTraits(Math.random);
    const patch: Record<string, string> = {};
    if (!asList(fm['motivação']).join('').trim()) patch['motivação'] = t['motivação'];
    if (!asList(fm['medo']).join('').trim()) patch['medo'] = t.medo;
    if (!asList(fm['segredo']).join('').trim()) patch['segredo'] = t.segredo;
    if (!asList(fm['maneirismo']).join('').trim()) patch['maneirismo'] = t.maneirismo;
    if (!Object.keys(patch).length) {
      cadernos.say('Motivação, medo, segredo e maneirismo já estão preenchidos.');
      return;
    }
    cadernos.update(entity.path, (x) => setProps(x, patch));
    cadernos.say(`Sorteado: ${Object.entries(patch).map(([k, v]) => `${k} "${v}"`).join(', ')}.`);
  }

  let editingKey = $state<string | null>(null);
  let keyDraft = $state('');
  let valueDraft = $state('');

  function editField(k: string) {
    editingKey = k;
    keyDraft = k;
    const v = fm[k];
    valueDraft = Array.isArray(v) ? v.join(', ') : (v ?? '');
  }

  function parseValue(s: string, wasList: boolean): PropValue {
    const parts = s.split(/,(?![^[]*\]\])/).map((x) => x.trim()).filter(Boolean);
    if (wasList || (parts.length > 1 && parts.every((p) => /^\[\[.*\]\]$/.test(p)))) return parts;
    return s.trim();
  }

  function saveField() {
    if (!entity || editingKey === null) return;
    const from = editingKey;
    const to = keyDraft.trim() || from;
    const value = parseValue(valueDraft, Array.isArray(fm[from]));
    cadernos.update(entity.path, (t) => setProp(from === to || from === '' ? t : renameProp(t, from, to), to, value));
    editingKey = null;
  }

  function removeField(k: string) {
    if (!entity) return;
    cadernos.update(entity.path, (t) => setProp(t, k, null));
    editingKey = null;
  }

  function addField(k: string) {
    if (!entity) return;
    if (k) cadernos.update(entity.path, (t) => setProp(t, k, ''));
    editField(k);
  }

  function setType(type: string) {
    if (!entity) return;
    cadernos.update(entity.path, (t) => setProp(t, 'tipo', type));
  }

  /** pedaços de um valor: texto e [[links]] */
  function segments(v: string): Array<{ link: string | null; text: string }> {
    const out: Array<{ link: string | null; text: string }> = [];
    let last = 0;
    for (const m of v.matchAll(/\[\[([^\]]+)\]\]/g)) {
      if (m.index! > last) out.push({ link: null, text: v.slice(last, m.index) });
      const t = linkTarget(m[1]!);
      out.push({ link: t, text: m[1]!.includes('|') ? m[1]!.split('|')[1]! : t });
      last = m.index! + m[0].length;
    }
    if (last < v.length) out.push({ link: null, text: v.slice(last) });
    return out;
  }

  const resolved = (target: string) => entity?.relations.find((r) => r.target === target)?.to ?? null;
  function follow(target: string, label: string) {
    const to = resolved(target);
    if (to && byPath.has(to)) openEntity(to);
    else if (to) onOpenNote(to);
    else startEntity(target, guessTypeFromLabel(label));
  }

  const outgoing = $derived.by(() => {
    const m = new Map<string, Entity[]>();
    for (const r of entity?.relations ?? []) {
      const e = r.to ? byPath.get(r.to) : undefined;
      if (!e) continue;
      m.set(r.label, [...(m.get(r.label) ?? []), e]);
    }
    return [...m.entries()];
  });

  const yearsBetween = (a: number, b: number) => Math.round(b - a);

  // ------------------------------------------------ regras na ficha: campos calculados e botões
  const types = $derived.by(() => { void cadernos.rev; return allTypes(); });
  const ruleRt = $derived.by(() => { void cadernos.rev; return world && entity ? cadernos.rules(world) : null; });
  const ruleActions = $derived(ruleRt && entity ? ruleRt.actionsFor(entity.path) : []);
  const computed = $derived(ruleRt && entity ? ruleRt.computedFor(entity.path) : []);

  function runRule(name: string) {
    if (!world || !entity) return;
    const said: string[] = [];
    const story: string[] = [];
    const year = worldYear(world);
    const rt = cadernos.rules(world, { notify: (t) => said.push(t), chronicle: (t) => story.push(t) });
    rt.runAction(name, entity.path);
    if (rt.issues.length) {
      cadernos.say(`Erro na regra: ${rt.issues[0]!.message}${rt.issues[0]!.line ? ` (linha ${rt.issues[0]!.line})` : ''}`);
      return;
    }
    cadernos.applyChanges(rt.changes(), story.map((line) => ({ path: entity!.path, line: `${year}: ${line}` })));
    sound.play('complete');
    cadernos.say([...said, ...story.map((x) => x.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1'))].join(' · ') || `${name}: feito.`);
  }
  const hint = (k: string) => FIELD_HINTS[k.toLowerCase()] ?? '';
</script>

<div class="mundo">
  <aside class="list">
    <header>
      <h2>Mundos</h2>
      <button class="add" onclick={() => { dialog = 'world'; newName = ''; }} title="Novo mundo" aria-label="Novo mundo">+</button>
    </header>
    {#each worlds as w (w.name)}
      <section class:on={w === world}>
        <button class="world" onclick={() => pickWorld(w.name)}>{w.name}<small>{w.entities.length}</small></button>
        {#if w === world}
          <ul>
            {#each typeCounts as t (t.type)}
              <li><button class:active={typeFilter === t.type} onclick={() => {
                if (t.type === 'mapa') { tab = 'mapas'; entityPath = null; return; }
                typeFilter = typeFilter === t.type ? null : t.type; entityPath = null;
              }}>
                <i style:--c={typeColor(t.type)}></i>{typeInfo(t.type).plural}<small>{t.n}</small></button></li>
            {/each}
            <li><button class="ghost" onclick={() => startEntity()}>+ ficha</button></li>
          </ul>
        {/if}
      </section>
    {/each}
  </aside>

  <div class="body">
    {#if !world}
      <div class="empty">
        <div class="orb" aria-hidden="true">✦</div>
        <h1>World building</h1>
        <p>Personagens, lugares, facções, conflitos e mapas, cada um numa nota com propriedades. As ligações montam o grafo, as datas montam a linha do tempo, e as facções podem até ser simuladas. Fica tudo em <code>Mundos/</code>, compatível com o Obsidian.</p>
        <button class="primary" onclick={() => { dialog = 'world'; newName = ''; }}>Criar um mundo</button>
      </div>
    {:else if entity}
      {#key entity.path}
        <header class="top" in:rise={{ y: 6 }}>
          <div>
            <p class="sub crumbs"><button onclick={() => (entityPath = null)}>{world.name}</button> / {typeInfo(entity.type).plural}</p>
            <div class="who">
              <Portrait target={imageOf(fm)} name={entity.name} size={64} onpick={(p) => cadernos.update(entity!.path, (t) => setProp(t, 'imagem', `[[${p}]]`))} />
              <h1><i class="dot" style:--c={typeColor(entity.type)}></i>{entity.name}</h1>
              <span class="score" title={`${Math.round(entity.score * 100)}% preenchida: resumo, imagem, campos, seções e ligações`}><Ring value={entity.score} size={26} /><small>{Math.round(entity.score * 100)}%</small></span>
            </div>
            {#if onMaps.length}
              <p class="onmap">{#each onMaps as m (m.path)}<button onclick={() => { mapFocus = { map: m.path, target: entity!.name }; entityPath = null; tab = 'mapas'; }}>⌖ no mapa {m.name}</button>{/each}</p>
            {/if}
          </div>
          <div class="acts">
            {#each ruleActions as a (a)}<button class="ghost rule" onclick={() => runRule(a)} title="Ação das regras do mundo">▶ {a}</button>{/each}
            {#if entity.type === 'personagem'}<button class="ghost die" onclick={rollPersonality} title="Sorteia motivação, medo, segredo e maneirismo (só os vazios)">🎲 Personalidade</button>{/if}
            {#if questions.length}<button class="ghost" class:on={showQuestions} onclick={() => (showQuestions = !showQuestions)} title="Perguntas para aprofundar a ficha">✎ Aprofundar</button>{/if}
            <select value={entity.type} onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value)} aria-label="Tipo">
              {#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
              {#if !types.some((t) => t.id === entity.type)}<option value={entity.type}>{typeInfo(entity.type).label}</option>{/if}
            </select>
            <button class="ghost" onclick={() => onOpenNote(entity.path)}>Abrir nota</button>
          </div>
        </header>
      {/key}

      {#if showQuestions}
        <div class="questions" in:rise={{ y: -6 }}>
          <p class="dim small">Escolha uma pergunta: ela vira uma seção no fim do texto, para você responder.</p>
          <div class="qs">
            {#each questions as q, i (q)}
              <button class:done={answered(q)} onclick={() => ask(q)} disabled={answered(q)} in:rise={{ delay: i * 30, y: 4 }}>{answered(q) ? '✓ ' : ''}{q}</button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="sheet">
        <div class="props">
          {#each fields as k (k)}
            {#if editingKey === k}
              <form class="prop editing" onsubmit={(e) => { e.preventDefault(); saveField(); }}>
                <input class="k" bind:value={keyDraft} aria-label="Nome do campo" />
                <!-- svelte-ignore a11y_autofocus -->
                <input class="v" bind:value={valueDraft} placeholder={hint(k) || 'texto, ou [[Nome]] para ligar a outra ficha'} autofocus
                  onkeydown={(e) => { if (e.key === 'Escape') editingKey = null; }} />
                <span class="pacts"><button class="primary sm">OK</button><button type="button" class="x" onclick={() => removeField(k)} title="Apagar campo">✕</button></span>
              </form>
            {:else}
              <div class="prop">
                <span class="k">{k}</span>
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                <span class="v" ondblclick={() => editField(k)}>
                  {#each asList(fm[k]) as item, i (i)}
                    <span class="item">
                      {#each segments(item) as s, j (j)}
                        {#if s.link}<button class="chip" class:broken={!resolved(s.link)} onclick={() => follow(s.link!, k)}
                          style:--c={resolved(s.link) && byPath.get(resolved(s.link)!) ? typeColor(byPath.get(resolved(s.link)!)!.type) : 'var(--muted)'}
                          title={resolved(s.link) ? 'Abrir' : 'Ainda não existe: criar ficha'}>{s.text}</button>{:else}{s.text}{/if}
                      {/each}
                    </span>
                  {:else}<button class="emptyv" onclick={() => editField(k)}>{hint(k) || '—'}</button>{/each}
                </span>
                <button class="edit" onclick={() => editField(k)} title="Editar" aria-label={`Editar ${k}`}>✎</button>
              </div>
            {/if}
          {/each}
          {#each computed as c (c.name)}
            <div class="prop calc" title="Campo calculado pelas regras do mundo"><span class="k">{c.name}</span><span class="v">{c.value}</span><span class="fx">ƒ</span></div>
          {/each}
          {#if editingKey === ''}
            <form class="prop editing" onsubmit={(e) => { e.preventDefault(); saveField(); }}>
              <!-- svelte-ignore a11y_autofocus -->
              <input class="k" bind:value={keyDraft} placeholder="campo" autofocus />
              <input class="v" bind:value={valueDraft} placeholder={hint(keyDraft) || 'valor'} />
              <span class="pacts"><button class="primary sm" disabled={!keyDraft.trim()}>OK</button><button type="button" class="x" onclick={() => (editingKey = null)}>✕</button></span>
            </form>
          {/if}
          <div class="addf">
            {#each missing as f (f)}<button onclick={() => addField(f)} title={hint(f)}>+ {f}</button>{/each}
            {#each extras as f (f)}<button class="extra" onclick={() => addField(f)} title={hint(f)}>+ {f}</button>{/each}
            <button onclick={() => addField('')}>+ campo</button>
          </div>
        </div>

        <div class="links">
          {#if outgoing.length}
            <h3>Ligações</h3>
            {#each outgoing as [label, list] (label)}
              <div class="rel"><span class="lbl">{label}</span>{#each list as e (e.path)}<button class="chip" style:--c={typeColor(e.type)} onclick={() => openEntity(e.path)}>{e.name}</button>{/each}</div>
            {/each}
          {/if}
          {#if incoming.length}
            <h3>Citado por</h3>
            {#each incoming as r, i (i)}
              {@const e = byPath.get(r.from)}
              {#if e}<div class="rel"><button class="chip" style:--c={typeColor(e.type)} onclick={() => openEntity(e.path)}>{e.name}</button><span class="lbl">{r.label}</span></div>{/if}
            {/each}
          {/if}
          {#if broken.length}
            <h3>Fichas que faltam</h3>
            <div class="rel">{#each broken as r, i (i)}<button class="chip broken" onclick={() => startEntity(r.target, guessTypeFromLabel(r.label))} title="Criar ficha">+ {r.target}</button>{/each}</div>
          {/if}
          {#if !outgoing.length && !incoming.length && !broken.length}
            <p class="dim small">Sem ligações ainda. Escreva <code>[[Nome]]</code> num campo ou no texto para ligar esta ficha a outra.</p>
          {/if}
        </div>
      </div>

      {#if entity.type === 'personagem' || entity.type === 'criatura' || hasSheet(fm)}
        {#key entity.path}
          <div class="game">
            <h3>Ficha de jogo</h3>
            <SheetPanel path={entity.path} compact portrait={false} {onOpenNote} />
          </div>
        {/key}
      {/if}

      {#if entity.type === 'item'}
        <div class="game">
          <h3>Carta</h3>
          <ItemCard name={entity.name} card={readItemCard(entity.name, text)} />
          <p class="dim small">Raridade, categoria, dano, valor, peso e <code>sintonização</code> vêm das propriedades; a descrição, da seção <code>## Descrição</code>.</p>
        </div>
      {/if}

      <div class="text">
        <Editor value={body} docKey={entityKey} onchange={typedBody} rich {host} focusMode={notes.focus} />
      </div>
    {:else}
      <header class="top">
        <div>
          <h1>{world.name}</h1>
          <p class="sub">{world.entities.length} fichas · {world.relations.filter((r) => r.to).length} ligações · {timeline(world).length} datas</p>
          <div class="health" title="Média de preenchimento das fichas">
            <span class="hbar"><i style:width="{Math.round(health * 100)}%"></i></span>
            <small>{Math.round(health * 100)}% vivo</small>
            {#if problems}<button class="warn" onclick={() => (tab = 'ideias')}>⚠ {problems} {problems === 1 ? 'contradição' : 'contradições'}</button>{/if}
          </div>
        </div>
        <div class="acts">
          {#if world.path}<button class="ghost" onclick={() => onOpenNote(world.path!)}>Nota do mundo</button>{/if}
          <button class="primary" onclick={() => startEntity()}>Nova ficha</button>
        </div>
      </header>
      <nav class="tabs">
        {#each TABS as [id, label] (id)}<button class:on={tab === id} onclick={() => (tab = id)}>{label}</button>{/each}
      </nav>

      {#if tab === 'fichas'}
        <div class="tools">
          <input class="search" bind:value={query} placeholder="Buscar por nome, apelido ou descrição" />
          <div class="seg" role="radiogroup" aria-label="Aparência">
            <button class:on={look === 'lista'} onclick={() => (look = 'lista')}>☰ Lista</button>
            <button class:on={look === 'cartas'} onclick={() => (look = 'cartas')}>🂠 Cartas</button>
          </div>
          {#if look === 'cartas' && shown.length}<button class="ghost" onclick={() => void printCards(shown, `Cartas de ${world!.name}`)} title="Cartas de baralho (63×88 mm), 9 por folha A4">🖨 Imprimir</button>{/if}
          <select bind:value={order} aria-label="Ordem">
            <option value="nome">por nome</option>
            <option value="vazias">menos completas primeiro</option>
          </select>
        </div>
        {#if shown.length}
          {#key look + (typeFilter ?? '') + order}
            {#if look === 'cartas'}
              <div class="deck">
                {#each shown as e, i (e.path)}
                  <div class:fresh={fresh === e.path} in:rise={{ delay: Math.min(i, 24) * 30, y: 14 }}><FichaCarta entity={e} {byPath} onopen={openEntity} /></div>
                {/each}
              </div>
            {:else}
              <div class="cards">
                {#each shown as e, i (e.path)}
                  {@const img = imageOf(e.props)}
                  <button class="card" class:pic={!!img} class:fresh={fresh === e.path} style:--c={typeColor(e.type)} onclick={() => openEntity(e.path)} in:rise={{ delay: Math.min(i, 24) * 18 }}>
                    {#if img}<span class="thumb"><Portrait target={img} name={e.name} size={44} /></span>{/if}
                    <span class="kind"><span class="g">{typeGlyph(e.type)}</span> {typeInfo(e.type).label}</span>
                    <b>{e.name}</b>
                    {#if e.summary}<span class="sum">{e.summary}</span>{/if}
                    <span class="cnt"><Ring value={e.score} size={14} />{Math.round(e.score * 100)}%{#if e.relations.some((r) => r.to)} · {e.relations.filter((r) => r.to).length} ligações{/if}</span>
                  </button>
                {/each}
              </div>
            {/if}
          {/key}
        {:else}
          <p class="dim pad">{world.entities.length ? 'Nada encontrado.' : 'Nenhuma ficha ainda. Comece por uma personagem ou um lugar.'}</p>
        {/if}
      {:else if tab === 'mapas'}
        <MapaView {world} {byPath} focus={mapFocus} onopen={(p) => (byPath.get(p)?.type === 'mapa' ? onOpenNote(p) : openEntity(p))}
          oncreate={(n, t) => startEntity(n, t)} onnewmap={() => startEntity(`Mapa de ${world!.name}`, 'mapa')} />
      {:else if tab === 'tempo'}
        {#if spans.length}
          <ol class="timeline">
            {#each spans as s, i (s.path + s.field)}
              {#if i > 0 && s.at - spans[i - 1]!.at >= 50}<li class="gap">{yearsBetween(spans[i - 1]!.at, s.at)} anos depois</li>{/if}
              <li style:--c={typeColor(s.type)} in:rise={{ delay: Math.min(i, 30) * 25 }}>
                <span class="when">{s.label}</span>
                <span class="mark"></span>
                <button class="what" onclick={() => { tab = 'tempo'; openEntity(s.path); }}>
                  <b>{s.name}</b>
                  <small>{typeInfo(s.type).label}{s.field !== 'data' ? ` · ${s.field}` : ''}{#if s.end !== undefined} · até {s.endLabel} ({yearsBetween(s.at, s.end)} anos){/if}</small>
                </button>
              </li>
            {/each}
          </ol>
        {:else}
          <p class="dim pad">Nada com data ainda. Preencha <code>data</code> em eventos, ou <code>nascimento</code> e <code>morte</code> em personagens. Vale qualquer calendário: 342, -50, 50 a.C., 12/03/342.</p>
        {/if}
      {:else if tab === 'grafo'}
        {#if graphNodes.length}
          <div class="graphwrap">
            <Graph nodes={graphNodes} edges={graphEdges} selected={graphSel} onselect={(id) => (graphSel = id)} onopen={(id) => openEntity(id)} />
            {#if graphSel && byPath.get(graphSel)}
              {@const e = byPath.get(graphSel)!}
              <div class="peek" style:--c={typeColor(e.type)}>
                <span class="kind">{typeInfo(e.type).label}</span>
                <b>{e.name}</b>
                {#if e.summary}<span class="sum">{e.summary}</span>{/if}
                <button class="primary sm" onclick={() => openEntity(e.path)}>Abrir ficha</button>
              </div>
            {/if}
          </div>
          <div class="legend">{#each typeCounts as t (t.type)}<span><i style:--c={typeColor(t.type)}></i>{typeInfo(t.type).plural}</span>{/each}<span class="dim">· tracejado = citado no texto</span></div>
        {:else}
          <p class="dim pad">Sem fichas para ligar ainda.</p>
        {/if}
      {:else if tab === 'conflitos'}
        <ConflitosView {world} {byPath} onopen={openEntity} onnew={() => startEntity('', 'conflito')} />
      {:else if tab === 'sim'}
        <SimView {world} {byPath} onopen={openEntity} />
      {:else if tab === 'ideias'}
        <IdeiasView {world} {byPath} onopen={openEntity} oncreate={(n, t) => startEntity(n, t)} />
      {:else if tab === 'regras'}
        <RegrasView {world} {byPath} onopen={openEntity} {onOpenNote} />
      {/if}
    {/if}
  </div>

  {#if dialog}
    <div class="scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dialog = null; }}>
      <div class="dialog" role="dialog" aria-modal="true">
        {#if dialog === 'world'}
          <h2>Novo mundo</h2>
          <form onsubmit={(e) => { e.preventDefault(); createWorld(); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <label>Nome<input bind:value={newName} placeholder="Aerth" autofocus /></label>
            <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button><button class="primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {:else}
          <h2>Nova ficha em {world?.name}</h2>
          <form onsubmit={(e) => { e.preventDefault(); createEntity(); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <label>Nome<input bind:value={newName} placeholder="Kael" autofocus /></label>
            <div class="types" role="radiogroup" aria-label="Tipo">
              {#each types as t (t.id)}
                <button type="button" class:on={newType === t.id} style:--c={typeColor(t.id)} onclick={() => (newType = t.id)}><span class="g">{typeGlyph(t.id)}</span>{t.label}</button>
              {/each}
            </div>
            <div class="formacts"><button type="button" class="ghost" onclick={() => (dialog = null)}>Cancelar</button><button class="primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {/if}
      </div>
    </div>
  {/if}

  {#if cadernos.message}<div class="toast" role="status">{cadernos.message}</div>{/if}
</div>

<style>
  .mundo { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
  .list { border-right: 1px solid var(--line); overflow-y: auto; padding: 14px 8px; }
  .list header { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 10px; }
  h2 { margin: 0; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .add { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface-2); }
  .add:hover { border-color: var(--ember); color: var(--ember); }
  .world { width: 100%; display: flex; justify-content: space-between; border: 0; background: none; padding: 8px 10px; border-radius: 9px;
    font: 600 13px var(--f-display); letter-spacing: .04em; text-align: left; }
  .world small, .list li small { color: var(--muted); font: 11px var(--f-mono); margin-left: auto; }
  section.on .world { color: var(--ember); }
  .list ul { list-style: none; margin: 0 0 8px; padding: 0 0 0 8px; }
  .list li button { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: none; padding: 6px 10px; border-radius: 8px; }
  .list li button:hover, .list li button.active { background: var(--surface-2); }
  .list li button.ghost { color: var(--muted); font-size: 12.5px; }
  .list li i, .legend i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex: none; }

  .body { overflow-y: auto; padding: 22px 28px 0; min-width: 0; display: flex; flex-direction: column; }
  .body > * { flex-shrink: 0; }
  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  h1 { margin: 0; font: 600 26px/1.15 var(--f-display); letter-spacing: .02em; display: flex; align-items: center; gap: 10px; }
  .who { display: flex; align-items: center; gap: 14px; }
  h1 .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--c); box-shadow: 0 0 12px var(--c); }
  h3 { margin: 14px 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h3:first-child { margin-top: 0; }
  .sub { margin: 4px 0 0; color: var(--muted); font-size: 12.5px; }
  .crumbs { margin: 0 0 2px; }
  .crumbs button { border: 0; background: none; padding: 0; color: var(--ember-soft); font: inherit; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  select { background: var(--surface-2); border: 1px solid var(--line); border-radius: 9px; color: var(--ink); padding: 6px 10px; font: inherit; }
  .primary { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary.sm { padding: 4px 10px; font-size: 12.5px; }
  .primary:disabled { opacity: .45; cursor: default; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 6px 12px; background: var(--surface-2); }
  .ghost:hover { border-color: var(--ember); }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
  .pad { padding: 18px 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }

  .empty { max-width: 560px; margin: 8vh auto 0; text-align: center; }
  .orb { font-size: 46px; color: var(--ember); filter: drop-shadow(0 0 18px var(--ember)); animation: twinkle 3.2s ease-in-out infinite; }
  @keyframes twinkle { 50% { transform: rotate(18deg) scale(1.12); filter: drop-shadow(0 0 30px var(--ember)); } }
  .score { display: inline-flex; align-items: center; gap: 4px; }
  .score small { font: 11px var(--f-mono); color: var(--muted); }
  .onmap { margin: 6px 0 0; display: flex; gap: 6px; flex-wrap: wrap; }
  .onmap button { border: 1px solid color-mix(in srgb, #6fc3c9 50%, var(--line)); background: color-mix(in srgb, #6fc3c9 10%, transparent); color: var(--ink);
    border-radius: 999px; padding: 1px 10px; font-size: 12px; }
  .ghost.on { border-color: var(--ember); color: var(--ember-soft); }
  .die:hover { animation: wobble .5s; }
  @keyframes wobble { 30% { transform: rotate(-6deg); } 60% { transform: rotate(5deg); } }
  .questions { border: 1px dashed color-mix(in srgb, var(--ember) 50%, var(--line)); border-radius: 14px; padding: 10px 12px; margin-bottom: 10px;
    background: color-mix(in srgb, var(--ember) 4%, transparent); }
  .questions p { margin: 0 0 8px; }
  .qs { display: flex; flex-wrap: wrap; gap: 6px; }
  .qs button { border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 5px 10px; font-size: 13px; text-align: left; color: var(--ink); }
  .qs button:hover:not(:disabled) { border-color: var(--ember); }
  .qs button.done { color: var(--ok); opacity: .7; }
  .health { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .hbar { width: 140px; height: 5px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .hbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--ember), var(--ok)); border-radius: 3px; transition: width .8s var(--ease, ease); }
  .health small { font: 11px var(--f-mono); color: var(--muted); }
  .warn { border: 0; background: color-mix(in srgb, var(--crit) 14%, transparent); color: var(--crit); border-radius: 999px; padding: 1px 9px; font-size: 11.5px; }
  .tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .tools .search { margin: 0; flex: 1; min-width: 180px; }
  .seg { display: flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
  .seg button { border: 0; background: var(--surface); color: var(--muted); padding: 6px 11px; font-size: 12.5px; }
  .seg button.on { background: color-mix(in srgb, var(--ember) 15%, var(--surface)); color: var(--ink); }
  .deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; padding: 4px 2px 40px; }
  .fresh { animation: fresh 2.2s ease-out; border-radius: 16px; }
  @keyframes fresh { 0%, 30% { box-shadow: 0 0 0 2px var(--ember), 0 0 30px var(--ember); } 100% { box-shadow: 0 0 0 0 transparent; } }
  .g { font-size: 11px; }
  .cnt { display: inline-flex; align-items: center; gap: 5px; }
  .emptyv { border: 0; background: none; padding: 0; text-align: left; font-style: italic; font-size: 12.5px; color: var(--muted); opacity: .6; }
  .emptyv:hover { opacity: 1; }
  .addf button.extra { border-style: dotted; opacity: .75; }
  .prop.calc .v { color: var(--ember-soft); font: 13px var(--f-mono); }
  .prop.calc .fx { color: var(--muted); font: italic 13px serif; text-align: center; }
  .ghost.rule { border-color: color-mix(in srgb, #7fb6ff 45%, var(--line)); }
  .ghost.rule:hover { border-color: #7fb6ff; box-shadow: 0 0 14px -6px #7fb6ff; }
  @media (prefers-reduced-motion: reduce) { .orb, .fresh, .die:hover { animation: none; } }
  .empty p { color: var(--muted); margin-bottom: 18px; }

  .tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: 14px; overflow-x: auto; scrollbar-width: none; }
  .tabs button { border: 0; background: none; padding: 9px 12px; color: var(--muted); border-bottom: 2px solid transparent; white-space: nowrap;
    font: 600 12px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .tabs button.on { color: var(--ink); border-bottom-color: var(--ember); }
  .search { width: 100%; max-width: 420px; background: var(--surface); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; color: var(--ink); margin-bottom: 12px; }
  .card { transition: transform .18s var(--ease, ease), border-color .18s, box-shadow .18s; }
  .card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -16px var(--c); }
  .search:focus { border-color: var(--ember); outline: none; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; padding-bottom: 40px; }
  .card { text-align: left; display: grid; gap: 4px; align-content: start; border: 1px solid var(--line); background: var(--surface); border-radius: 14px;
    padding: 12px 14px 12px 16px; position: relative; overflow: hidden; }
  .card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); }
  .card:hover { border-color: color-mix(in srgb, var(--c) 60%, var(--line)); }
  .kind { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
  .card b, .peek b { font: 600 16px var(--f-display); }
  .card { position: relative; }
  .card.pic { padding-right: 64px; }
  .card .thumb { position: absolute; right: 12px; top: 12px; }
  .sum { color: var(--muted); font-size: 12.5px; }
  .cnt { color: var(--muted); font: 11px var(--f-mono); }

  .sheet { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 14px; margin-bottom: 8px; }
  .props, .links { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 10px 12px; }
  .prop { display: grid; grid-template-columns: 120px 1fr 26px; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
  .prop .k { font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .prop .v { display: flex; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
  .item:not(:last-child)::after { content: ','; color: var(--muted); }
  .prop.editing { grid-template-columns: 120px 1fr auto; }
  .prop.editing input { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 5px 8px; font: 13px var(--f-body); min-width: 0; }
  .prop.editing input:focus { border-color: var(--ember); outline: none; }
  .pacts { display: flex; gap: 4px; }
  .edit, .x { border: 0; background: none; width: 26px; height: 26px; border-radius: 7px; color: var(--muted); opacity: .5; }
  .prop:hover .edit, .edit:focus { opacity: 1; }
  .edit:hover, .x:hover { background: var(--surface-2); color: var(--ink); opacity: 1; }
  .x:hover { color: var(--crit); }
  .addf { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 8px; }
  .addf button { border: 1px dashed var(--line); background: none; border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--muted); }
  .addf button:hover { border-color: var(--ember); color: var(--ink); }

  .chip { border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 12%, transparent);
    color: var(--ink); border-radius: 999px; padding: 1px 9px; font-size: 12.5px; }
  .chip:hover { background: color-mix(in srgb, var(--c) 25%, transparent); }
  .chip.broken { --c: var(--muted); border-style: dashed; color: var(--muted); }
  .rel { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 4px 0; }
  .lbl { font: 11px var(--f-mono); color: var(--ember-soft); }

  .game { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 10px 12px; margin-bottom: 8px; }
  .text { flex: 1 0 auto; min-height: 300px; display: flex; flex-direction: column; border-top: 1px solid var(--line); margin: 0 -28px; }
  .text :global(.editor) { flex: 1; }

  .timeline { list-style: none; margin: 0; padding: 0 0 40px; position: relative; }
  .timeline::before { content: ''; position: absolute; left: 116px; top: 6px; bottom: 40px; width: 1px; background: linear-gradient(var(--line), var(--ember) 50%, var(--line)); }
  .timeline li { display: grid; grid-template-columns: 100px 32px 1fr; align-items: center; min-height: 42px; }
  .when { text-align: right; font: 12px var(--f-mono); color: var(--ember-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark { width: 11px; height: 11px; border-radius: 50%; background: var(--void); border: 2px solid var(--c); justify-self: center; position: relative; z-index: 1; }
  .what { text-align: left; border: 1px solid transparent; background: none; border-radius: 10px; padding: 5px 10px; display: grid; }
  .what:hover { border-color: var(--line); background: var(--surface); }
  .what b { font: 600 14px var(--f-display); }
  .what small { color: var(--muted); font-size: 11.5px; }
  .timeline .gap { display: block; padding: 6px 0 6px 140px; color: var(--muted); font: italic 11.5px var(--f-body); min-height: 0; }

  .graphwrap { position: relative; flex: 1; min-height: 420px; display: flex; margin-bottom: 8px; }
  .peek { position: absolute; left: 12px; bottom: 12px; width: min(280px, calc(100% - 24px)); display: grid; gap: 4px; padding: 12px 14px;
    background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid color-mix(in srgb, var(--c) 50%, var(--line)); border-radius: 14px; backdrop-filter: blur(6px); }
  .peek .primary { justify-self: start; margin-top: 4px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; padding-bottom: 24px; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }

  .scrim { position: absolute; inset: 0; z-index: 10; background: var(--scrim); display: grid; place-items: center; padding: 16px; }
  .dialog { width: min(480px, 100%); background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 18px; display: grid; gap: 12px;
    box-shadow: 0 30px 80px -20px var(--shadow); }
  .dialog h2 { font-size: 13px; color: var(--ink); }
  .dialog form { display: grid; gap: 12px; }
  .dialog label { display: grid; gap: 4px; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .dialog input { background: var(--void); border: 1px solid var(--line); border-radius: 9px; color: var(--ink); padding: 7px 10px; font: 14px var(--f-body); }
  .dialog input:focus { border-color: var(--ember); outline: none; }
  .types { display: flex; flex-wrap: wrap; gap: 6px; }
  .types button { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: none; border-radius: 999px; padding: 5px 11px; font-size: 13px; color: var(--muted); }
  .types button.on { border-color: var(--c); color: var(--ink); background: color-mix(in srgb, var(--c) 14%, transparent); }
  .formacts { display: flex; justify-content: flex-end; gap: 8px; }
  .toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 11; max-width: min(560px, 90%);
    padding: 10px 14px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--ember); font-size: 13px; }

  @media (max-width: 720px) {
    .mundo { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .list { border-right: 0; border-bottom: 1px solid var(--line); max-height: 30vh; padding: 8px; }
    .body { padding: 16px 16px 0; }
    .sheet { grid-template-columns: 1fr; }
    .prop, .prop.editing { grid-template-columns: 90px 1fr auto; }
    .edit { opacity: 1; }
    .text { margin: 0 -16px; }
    .timeline::before { left: 86px; }
    .timeline li { grid-template-columns: 70px 32px 1fr; }
    .timeline .gap { padding-left: 110px; }
  }
</style>
