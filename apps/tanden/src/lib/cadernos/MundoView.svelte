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
  import Icon, { type IconName } from '../ui/Icon.svelte';

  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  type Tab = 'fichas' | 'mapas' | 'tempo' | 'grafo' | 'conflitos' | 'sim' | 'ideias' | 'regras';
  // Abas em três grupos: explorar o que existe, ver o mundo se mexer, e ferramentas.
  // No celular, as quatro de "explorar" ficam na barra de baixo e o resto em "Mais".
  type TabDef = { id: Tab; label: string; icon: IconName; group: 'explorar' | 'dinamica' | 'oficina'; desc: string };
  const TABS: TabDef[] = [
    { id: 'fichas', label: 'Fichas', icon: 'fichas', group: 'explorar', desc: 'Personagens, lugares, facções e o resto' },
    { id: 'mapas', label: 'Mapas', icon: 'mapas', group: 'explorar', desc: 'Continentes, marcadores e territórios' },
    { id: 'tempo', label: 'Tempo', icon: 'tempo', group: 'explorar', desc: 'Tudo o que tem data, em ordem' },
    { id: 'grafo', label: 'Ligações', icon: 'grafo', group: 'explorar', desc: 'Quem se liga a quem' },
    { id: 'conflitos', label: 'Conflitos', icon: 'conflitos', group: 'dinamica', desc: 'Guerras, rivalidades e alianças' },
    { id: 'sim', label: 'Simulação', icon: 'sim', group: 'dinamica', desc: 'Vidas mês a mês ou facções ano a ano' },
    { id: 'ideias', label: 'Ideias', icon: 'ideias', group: 'oficina', desc: 'Revisão, contradições e geradores' },
    { id: 'regras', label: 'Regras', icon: 'regras', group: 'oficina', desc: 'Mecânicas e campos calculados' },
  ];
  const DOCK = TABS.filter((t) => t.group === 'explorar');
  const MORE = TABS.filter((t) => t.group !== 'explorar');
  /** abas em que o filtro por tipo faz sentido */
  const FILTERED: Tab[] = ['fichas', 'tempo', 'grafo'];
  /** folha aberta no celular: trocar de mundo ou as abas de "Mais" */
  let sheet = $state<null | 'mundos' | 'mais'>(null);
  function goTab(t: Tab) { tab = t; sheet = null; entityPath = null; }
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

<div class="mundo" class:inside={!!entity}>
  <aside class="list" aria-label="Mundos">
    <header>
      <h2 class="t-eyebrow">Mundos</h2>
      <button class="t-btn t-btn--sm t-btn--icon t-btn--quiet" onclick={() => { dialog = 'world'; newName = ''; }} title="Novo mundo" aria-label="Novo mundo"><Icon name="mais_um" size={16} /></button>
    </header>
    <ul>
      {#each worlds as w (w.name)}
        <li><button class="world" class:on={w === world} onclick={() => pickWorld(w.name)}>
          <Icon name="mundo" size={16} /><span>{w.name}</span><small>{w.entities.length}</small>
        </button></li>
      {/each}
    </ul>
  </aside>

  <div class="body">
    {#if !world}
      <div class="empty">
        <div class="orb" aria-hidden="true">✦</div>
        <h1>World building</h1>
        <p>Personagens, lugares, facções, conflitos e mapas, cada um numa nota com propriedades. As ligações montam o grafo, as datas montam a linha do tempo, e as facções podem até ser simuladas. Fica tudo em <code>Mundos/</code>, compatível com o Obsidian.</p>
        <button class="t-btn t-btn--primary" onclick={() => { dialog = 'world'; newName = ''; }}><Icon name="mais_um" size={16} />Criar um mundo</button>
      </div>
    {:else if entity}
      {#key entity.path}
        <header class="top ficha-top" in:rise={{ y: 6 }}>
          <nav class="crumbs" aria-label="Caminho">
            <button class="t-btn t-btn--sm t-btn--quiet back" onclick={() => (entityPath = null)}><Icon name="voltar" size={16} />{world.name}</button>
            <span class="sep">/</span><span>{typeInfo(entity.type).plural}</span>
          </nav>
          <div class="who">
            <Portrait target={imageOf(fm)} name={entity.name} size={64} onpick={(p) => cadernos.update(entity!.path, (t) => setProp(t, 'imagem', `[[${p}]]`))} />
            <div class="whotext">
              <span class="kind" style:--c={typeColor(entity.type)}><i class="dot"></i>{typeInfo(entity.type).label}</span>
              <h1>{entity.name}</h1>
            </div>
            <span class="score" title={`${Math.round(entity.score * 100)}% preenchida: resumo, imagem, campos, seções e ligações`}><Ring value={entity.score} size={30} /><small>{Math.round(entity.score * 100)}%</small></span>
          </div>
          {#if onMaps.length}
            <p class="onmap">{#each onMaps as m (m.path)}<button class="t-chip" onclick={() => { mapFocus = { map: m.path, target: entity!.name }; entityPath = null; tab = 'mapas'; }}><Icon name="mapas" size={14} />no mapa {m.name}</button>{/each}</p>
          {/if}
          <div class="acts">
            {#each ruleActions as a (a)}<button class="t-btn t-btn--sm rule" onclick={() => runRule(a)} title="Ação das regras do mundo">▶ {a}</button>{/each}
            {#if entity.type === 'personagem'}<button class="t-btn t-btn--sm die" onclick={rollPersonality} title="Sorteia motivação, medo, segredo e maneirismo (só os vazios)">🎲 Personalidade</button>{/if}
            {#if questions.length}<button class="t-btn t-btn--sm" class:t-btn--on={showQuestions} onclick={() => (showQuestions = !showQuestions)} title="Perguntas para aprofundar a ficha">✎ Aprofundar</button>{/if}
            <select class="t-select t-btn--sm" value={entity.type} onchange={(e) => setType((e.currentTarget as HTMLSelectElement).value)} aria-label="Tipo">
              {#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
              {#if !types.some((t) => t.id === entity.type)}<option value={entity.type}>{typeInfo(entity.type).label}</option>{/if}
            </select>
            <button class="t-btn t-btn--sm" onclick={() => onOpenNote(entity.path)}><Icon name="nota" size={15} />Abrir nota</button>
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
        <div class="props t-card">
          <h3 class="t-eyebrow">Propriedades</h3>
          {#each fields as k (k)}
            {#if editingKey === k}
              <form class="prop editing" onsubmit={(e) => { e.preventDefault(); saveField(); }}>
                <input class="t-input k" bind:value={keyDraft} aria-label="Nome do campo" />
                <!-- svelte-ignore a11y_autofocus -->
                <input class="t-input v" bind:value={valueDraft} placeholder={hint(k) || 'texto, ou [[Nome]] para ligar a outra ficha'} autofocus
                  onkeydown={(e) => { if (e.key === 'Escape') editingKey = null; }} />
                <span class="pacts"><button class="t-btn t-btn--sm t-btn--primary">OK</button><button type="button" class="t-btn t-btn--sm t-btn--icon t-btn--quiet t-btn--danger" onclick={() => removeField(k)} title="Apagar campo" aria-label="Apagar campo"><Icon name="fechar" size={15} /></button></span>
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
              <input class="t-input k" bind:value={keyDraft} placeholder="campo" autofocus />
              <input class="t-input v" bind:value={valueDraft} placeholder={hint(keyDraft) || 'valor'} />
              <span class="pacts"><button class="t-btn t-btn--sm t-btn--primary" disabled={!keyDraft.trim()}>OK</button><button type="button" class="t-btn t-btn--sm t-btn--icon t-btn--quiet" onclick={() => (editingKey = null)} aria-label="Cancelar"><Icon name="fechar" size={15} /></button></span>
            </form>
          {/if}
          <div class="addf">
            {#each missing as f (f)}<button onclick={() => addField(f)} title={hint(f)}>+ {f}</button>{/each}
            {#each extras as f (f)}<button class="extra" onclick={() => addField(f)} title={hint(f)}>+ {f}</button>{/each}
            <button onclick={() => addField('')}>+ campo</button>
          </div>
        </div>

        <div class="links t-card">
          {#if outgoing.length}
            <h3 class="t-eyebrow">Ligações</h3>
            {#each outgoing as [label, list] (label)}
              <div class="rel"><span class="lbl">{label}</span>{#each list as e (e.path)}<button class="chip" style:--c={typeColor(e.type)} onclick={() => openEntity(e.path)}>{e.name}</button>{/each}</div>
            {/each}
          {/if}
          {#if incoming.length}
            <h3 class="t-eyebrow">Citado por</h3>
            {#each incoming as r, i (i)}
              {@const e = byPath.get(r.from)}
              {#if e}<div class="rel"><button class="chip" style:--c={typeColor(e.type)} onclick={() => openEntity(e.path)}>{e.name}</button><span class="lbl">{r.label}</span></div>{/if}
            {/each}
          {/if}
          {#if broken.length}
            <h3 class="t-eyebrow">Fichas que faltam</h3>
            <div class="rel">{#each broken as r, i (i)}<button class="chip broken" onclick={() => startEntity(r.target, guessTypeFromLabel(r.label))} title="Criar ficha">+ {r.target}</button>{/each}</div>
          {/if}
          {#if !outgoing.length && !incoming.length && !broken.length}
            <h3 class="t-eyebrow">Ligações</h3>
            <p class="dim small">Sem ligações ainda. Escreva <code>[[Nome]]</code> num campo ou no texto para ligar esta ficha a outra.</p>
          {/if}
        </div>
      </div>

      {#if entity.type === 'personagem' || entity.type === 'criatura' || hasSheet(fm)}
        {#key entity.path}
          <div class="game t-card">
            <h3 class="t-eyebrow">Ficha de jogo</h3>
            <SheetPanel path={entity.path} compact portrait={false} {onOpenNote} />
          </div>
        {/key}
      {/if}

      {#if entity.type === 'item'}
        <div class="game t-card">
          <h3 class="t-eyebrow">Carta</h3>
          <ItemCard name={entity.name} card={readItemCard(entity.name, text)} />
          <p class="dim small">Raridade, categoria, dano, valor, peso e <code>sintonização</code> vêm das propriedades; a descrição, da seção <code>## Descrição</code>.</p>
        </div>
      {/if}

      <div class="text">
        <Editor value={body} docKey={entityKey} onchange={typedBody} rich {host} focusMode={notes.focus} />
      </div>
    {:else}
      <header class="top">
        <div class="title">
          <!-- no celular o título troca de mundo; no computador a lista ao lado faz isso -->
          <button class="switch" onclick={() => (sheet = 'mundos')} aria-haspopup="dialog" title="Trocar de mundo">
            <h1>{world.name}</h1><Icon name="abaixo" size={18} />
          </button>
          <h1 class="plain">{world.name}</h1>
          <p class="sub">
            <span>{world.entities.length} fichas</span><span>{world.relations.filter((r) => r.to).length} ligações</span><span>{timeline(world).length} datas</span>
          </p>
          <div class="health" title="Média de preenchimento das fichas">
            <span class="hbar"><i style:width="{Math.round(health * 100)}%"></i></span>
            <small>{Math.round(health * 100)}% vivo</small>
            {#if problems}<button class="warn" onclick={() => goTab('ideias')}><Icon name="alerta" size={13} />{problems} {problems === 1 ? 'contradição' : 'contradições'}</button>{/if}
          </div>
        </div>
        <div class="acts">
          {#if world.path}<button class="t-btn" onclick={() => onOpenNote(world.path!)}><Icon name="nota" size={16} />Nota do mundo</button>{/if}
          <button class="t-btn t-btn--primary" onclick={() => startEntity()}><Icon name="mais_um" size={16} />Nova ficha</button>
        </div>
      </header>

      <div class="tabs" role="tablist" aria-label="Seções do mundo">
        {#each TABS as t, i (t.id)}
          {#if i > 0 && TABS[i - 1]!.group !== t.group}<span class="gsep" aria-hidden="true"></span>{/if}
          <button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => goTab(t.id)} title={t.desc}>
            <Icon name={t.icon} size={16} /><span>{t.label}</span>
            {#if t.id === 'ideias' && problems}<span class="t-badge">{problems}</span>{/if}
          </button>
        {/each}
      </div>

      {#if FILTERED.includes(tab) && typeCounts.some((t) => t.type !== 'mapa')}
        <div class="filters t-scroll-x" role="group" aria-label="Filtrar por tipo">
          <button class="t-chip" class:on={!typeFilter} onclick={() => (typeFilter = null)}>Todas<small>{world.entities.filter((e) => e.type !== 'mapa').length}</small></button>
          {#each typeCounts.filter((t) => t.type !== 'mapa') as t (t.type)}
            <button class="t-chip" class:on={typeFilter === t.type} style:--c={typeColor(t.type)} onclick={() => (typeFilter = typeFilter === t.type ? null : t.type)}>
              <i></i>{typeInfo(t.type).plural}<small>{t.n}</small>
            </button>
          {/each}
        </div>
      {/if}

      <section class="pane" role="tabpanel">
      {#if tab === 'fichas'}
        <div class="tools">
          <label class="t-search search"><Icon name="buscar" size={15} /><input class="t-input" bind:value={query} placeholder="Buscar por nome, apelido ou descrição" aria-label="Buscar fichas" /></label>
          <div class="t-seg" role="radiogroup" aria-label="Aparência">
            <button role="radio" aria-checked={look === 'lista'} class:on={look === 'lista'} onclick={() => (look = 'lista')} title="Lista"><Icon name="lista" size={15} /><span class="seglbl">Lista</span></button>
            <button role="radio" aria-checked={look === 'cartas'} class:on={look === 'cartas'} onclick={() => (look = 'cartas')} title="Cartas"><Icon name="cartas" size={15} /><span class="seglbl">Cartas</span></button>
          </div>
          <select class="t-select" bind:value={order} aria-label="Ordem">
            <option value="nome">A–Z</option>
            <option value="vazias">Menos completas</option>
          </select>
          {#if look === 'cartas' && shown.length}<button class="t-btn t-btn--icon" onclick={() => void printCards(shown, `Cartas de ${world!.name}`)} title="Imprimir cartas de baralho (63×88 mm), 9 por folha A4" aria-label="Imprimir cartas"><Icon name="imprimir" size={16} /></button>{/if}
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
          <div class="none">
            <p class="dim">{world.entities.length ? 'Nada encontrado.' : 'Nenhuma ficha ainda. Comece por uma personagem ou um lugar.'}</p>
            {#if !world.entities.length}<button class="t-btn t-btn--primary" onclick={() => startEntity()}><Icon name="mais_um" size={16} />Criar a primeira ficha</button>{/if}
          </div>
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
                <button class="t-btn t-btn--sm t-btn--primary" onclick={() => openEntity(e.path)}>Abrir ficha</button>
              </div>
            {/if}
          </div>
          <p class="legend dim small">Toque num ponto para ver a ficha · tracejado = citado no texto</p>
        {:else}
          <p class="dim pad">Sem fichas para ligar ainda.</p>
        {/if}
      {:else if tab === 'conflitos'}
        <ConflitosView {world} {byPath} onopen={openEntity} onnew={() => startEntity('', 'conflito')} />
      {:else if tab === 'sim'}
        <SimView {world} {byPath} onopen={openEntity} {onOpenNote} onregras={() => (tab = 'regras')} />
      {:else if tab === 'ideias'}
        <IdeiasView {world} {byPath} onopen={openEntity} oncreate={(n, t) => startEntity(n, t)} />
      {:else if tab === 'regras'}
        <RegrasView {world} {byPath} onopen={openEntity} {onOpenNote} />
      {/if}
      </section>
    {/if}
  </div>

  {#if world && !entity}
    <!-- celular: barra de baixo com as abas de explorar + "Mais", e o botão de nova ficha -->
    {@const extra = MORE.find((t) => t.id === tab)}
    <nav class="dock" aria-label="Seções do mundo">
      {#each DOCK as t (t.id)}
        <button class:on={tab === t.id} aria-current={tab === t.id ? 'page' : undefined} onclick={() => goTab(t.id)}><Icon name={t.icon} size={21} /><span>{t.label}</span></button>
      {/each}
      <button class:on={!!extra} onclick={() => (sheet = 'mais')} aria-haspopup="dialog">
        <span class="ic"><Icon name={extra?.icon ?? 'mais'} size={21} />{#if problems && tab !== 'ideias'}<i class="ping"></i>{/if}</span><span>{extra?.label ?? 'Mais'}</span>
      </button>
    </nav>
    {#if tab === 'fichas' || tab === 'tempo' || tab === 'grafo'}
      <button class="fab t-btn t-btn--primary" onclick={() => startEntity()} aria-label="Nova ficha"><Icon name="mais_um" size={22} /></button>
    {/if}
  {/if}

  {#if sheet}
    <div class="t-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) sheet = null; }}>
      <div class="t-sheet" role="dialog" aria-modal="true" aria-label={sheet === 'mundos' ? 'Mundos' : 'Mais seções'}>
        {#if sheet === 'mundos'}
          <h2>Mundos</h2>
          <div class="rows">
            {#each worlds as w (w.name)}
              <button class="t-row" class:on={w === world} onclick={() => { pickWorld(w.name); sheet = null; }}>
                <Icon name="mundo" size={20} /><span>{w.name}<small>{w.entities.length} fichas</small></span>
              </button>
            {/each}
          </div>
          <div class="t-actions">
            {#if world?.path}<button class="t-btn" onclick={() => { sheet = null; onOpenNote(world!.path!); }}><Icon name="nota" size={16} />Nota do mundo</button>{/if}
            <button class="t-btn t-btn--primary" onclick={() => { sheet = null; dialog = 'world'; newName = ''; }}><Icon name="mais_um" size={16} />Novo mundo</button>
          </div>
        {:else}
          <h2>Mais seções</h2>
          <div class="rows">
            {#each MORE as t (t.id)}
              <button class="t-row" class:on={tab === t.id} onclick={() => goTab(t.id)}>
                <Icon name={t.icon} size={20} /><span>{t.label}<small>{t.desc}</small></span>
                {#if t.id === 'ideias' && problems}<span class="t-badge">{problems}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if dialog}
    <div class="t-scrim" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) dialog = null; }}>
      <div class="t-sheet dialog" role="dialog" aria-modal="true">
        {#if dialog === 'world'}
          <h2>Novo mundo</h2>
          <form onsubmit={(e) => { e.preventDefault(); createWorld(); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <label><span class="t-eyebrow">Nome</span><input class="t-input" bind:value={newName} placeholder="Aerth" autofocus /></label>
            <div class="t-actions"><button type="button" class="t-btn" onclick={() => (dialog = null)}>Cancelar</button><button class="t-btn t-btn--primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {:else}
          <h2>Nova ficha em {world?.name}</h2>
          <form onsubmit={(e) => { e.preventDefault(); createEntity(); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <label><span class="t-eyebrow">Nome</span><input class="t-input" bind:value={newName} placeholder="Kael" autofocus /></label>
            <div class="types" role="radiogroup" aria-label="Tipo">
              {#each types as t (t.id)}
                <button type="button" role="radio" aria-checked={newType === t.id} class="t-chip" class:on={newType === t.id} style:--c={typeColor(t.id)} onclick={() => (newType = t.id)}><span class="g">{typeGlyph(t.id)}</span>{t.label}</button>
              {/each}
            </div>
            <div class="t-actions"><button type="button" class="t-btn" onclick={() => (dialog = null)}>Cancelar</button><button class="t-btn t-btn--primary" disabled={!newName.trim()}>Criar</button></div>
          </form>
        {/if}
      </div>
    </div>
  {/if}

  {#if cadernos.message}<div class="toast" role="status">{cadernos.message}</div>{/if}
</div>

<style>
  /* grade: lista de mundos | conteúdo; no celular a lista some e entra a barra de baixo */
  .mundo { position: relative; flex: 1; min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .dock, .fab, .switch { display: none; }

  /* ── lista de mundos (computador) ── */
  .list { border-right: 1px solid var(--line); overflow-y: auto; padding: var(--sp-4) var(--sp-2); background: color-mix(in srgb, var(--surface) 50%, transparent); }
  .list header { display: flex; justify-content: space-between; align-items: center; padding: 0 var(--sp-2) var(--sp-3); }
  .list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .world { width: 100%; display: flex; align-items: center; gap: var(--sp-2); border: 0; background: none; min-height: var(--h-md); padding: 0 var(--sp-3);
    border-radius: var(--r-md); text-align: left; color: var(--muted); font: 600 13.5px var(--f-body); transition: background var(--dur), color var(--dur); }
  .world span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .world small { font: 11px var(--f-mono); color: var(--muted); }
  .world:hover { background: var(--surface-2); color: var(--ink); }
  .world.on { background: color-mix(in srgb, var(--ember) 11%, transparent); color: var(--ink); box-shadow: inset 2px 0 0 var(--ember); }
  .world.on :global(svg) { color: var(--ember); }

  /* ── área de conteúdo ── */
  .body { overflow-y: auto; padding: var(--sp-6) var(--gutter) 0; min-width: 0; display: flex; flex-direction: column; container-type: inline-size; }
  .body > * { flex-shrink: 0; }
  .pane { display: flex; flex-direction: column; flex: 1 0 auto; min-width: 0; }
  .pane > :global(*) { flex-shrink: 0; }

  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--sp-3) var(--sp-4); flex-wrap: wrap; margin-bottom: var(--sp-4); }
  .title { min-width: 0; }
  h1 { margin: 0; font: 600 var(--fs-2xl)/1.15 var(--f-display); letter-spacing: .01em; overflow-wrap: anywhere; }
  .sub { margin: var(--sp-1) 0 0; color: var(--muted); font-size: var(--fs-sm); display: flex; flex-wrap: wrap; gap: 0 var(--sp-2); }
  .sub span + span::before { content: '·'; margin-right: var(--sp-2); opacity: .6; }
  .acts { display: flex; gap: var(--sp-2); flex-wrap: wrap; align-items: center; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
  .pad { padding: var(--sp-4) 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }

  .health { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
  .hbar { width: 140px; height: 5px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .hbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--ember), var(--ok)); border-radius: 3px; transition: width .8s var(--ease); }
  .health small { font: 11px var(--f-mono); color: var(--muted); }
  .warn { display: inline-flex; align-items: center; gap: 5px; border: 0; background: color-mix(in srgb, var(--crit) 14%, transparent); color: var(--crit);
    border-radius: var(--r-pill); padding: 2px 10px; font-size: 11.5px; }

  /* ── abas (computador): ícone + nome, grupos separados ── */
  .tabs { display: flex; align-items: stretch; gap: 2px; border-bottom: 1px solid var(--line); margin-bottom: var(--sp-3); overflow-x: auto; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button { position: relative; display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; padding: 10px 12px; color: var(--muted); white-space: nowrap;
    font: 600 13px var(--f-body); border-radius: var(--r-sm) var(--r-sm) 0 0; transition: color var(--dur), background var(--dur); }
  .tabs button::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2px; border-radius: 2px; background: var(--ember);
    transform: scaleX(0); transition: transform var(--dur) var(--ease); }
  .tabs button:hover { color: var(--ink); background: color-mix(in srgb, var(--surface-2) 60%, transparent); }
  .tabs button.on { color: var(--ink); }
  .tabs button.on::after { transform: none; }
  .tabs button.on :global(svg) { color: var(--ember); }
  .gsep { width: 1px; margin: 10px 6px; background: var(--line); flex: none; }
  /* conteúdo estreito (janela pequena ou painel lateral aberto): primeiro sai o ícone, que o nome é o que explica */
  @container (max-width: 820px) { .tabs button { padding: 10px; gap: 0; } .tabs button > :global(svg) { display: none; } .tabs button.on > :global(svg) { display: block; margin-right: 6px; } .gsep { margin: 10px 2px; } }
  @container (max-width: 580px) { .tabs button:not(.on) > :global(svg) { display: block; } .tabs button:not(.on) span:not(.t-badge) { display: none; } }

  .filters { margin-bottom: var(--sp-3); flex-wrap: wrap; mask-image: none; -webkit-mask-image: none; }

  /* ── fichas ── */
  .tools { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-3); }
  .search { flex: 1; min-width: min(220px, 100%); max-width: 460px; }
  .none { display: grid; justify-items: start; gap: var(--sp-2); padding: var(--sp-4) 0; }
  .none p { margin: 0; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: var(--sp-3); padding-bottom: 40px; }
  .card { position: relative; overflow: hidden; text-align: left; display: grid; gap: var(--sp-1); align-content: start; border: 1px solid var(--line); background: var(--surface);
    border-radius: var(--r-lg); padding: var(--sp-3) var(--sp-4) var(--sp-3) calc(var(--sp-4) + 2px); color: var(--ink);
    transition: transform .18s var(--ease), border-color .18s, box-shadow .18s; }
  .card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); }
  .card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 60%, var(--line)); box-shadow: 0 10px 24px -16px var(--c); }
  .card.pic { padding-right: 64px; }
  .card .thumb { position: absolute; right: 12px; top: 12px; }
  .kind { display: inline-flex; align-items: center; gap: 6px; font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
  .card b, .peek b { font: 600 16px var(--f-display); }
  .sum { color: var(--muted); font-size: var(--fs-sm); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cnt { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font: 11px var(--f-mono); }
  .g { font-size: 11px; }
  .deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: var(--sp-4); padding: 4px 2px 40px; }
  .fresh { animation: fresh 2.2s ease-out; border-radius: 16px; }
  @keyframes fresh { 0%, 30% { box-shadow: 0 0 0 2px var(--ember), 0 0 30px var(--ember); } 100% { box-shadow: 0 0 0 0 transparent; } }

  /* ── ficha aberta ── */
  .ficha-top { display: grid; gap: var(--sp-3); align-items: start; }
  .crumbs { display: flex; align-items: center; gap: var(--sp-1); color: var(--muted); font-size: var(--fs-sm); margin-left: calc(var(--sp-2) * -1); }
  .crumbs .back { color: var(--ember-soft); }
  .crumbs .sep { opacity: .5; }
  .who { display: flex; align-items: center; gap: var(--sp-4); min-width: 0; }
  .whotext { display: grid; gap: 2px; min-width: 0; }
  .kind .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 10px var(--c); }
  .score { display: inline-flex; align-items: center; gap: 6px; flex: none; }
  .score small { font: 11px var(--f-mono); color: var(--muted); }
  .onmap { margin: 0; display: flex; gap: 6px; flex-wrap: wrap; }
  .onmap .t-chip { --c: #6fc3c9; }
  .acts .rule { border-color: color-mix(in srgb, #7fb6ff 45%, var(--line)); }
  .die:hover { animation: wobble .5s; }
  @keyframes wobble { 30% { transform: rotate(-6deg); } 60% { transform: rotate(5deg); } }

  .questions { border: 1px dashed color-mix(in srgb, var(--ember) 50%, var(--line)); border-radius: var(--r-lg); padding: var(--sp-3); margin-bottom: var(--sp-3);
    background: color-mix(in srgb, var(--ember) 4%, transparent); }
  .questions p { margin: 0 0 var(--sp-2); }
  .qs { display: flex; flex-wrap: wrap; gap: 6px; }
  .qs button { border: 1px solid var(--line); background: var(--surface); border-radius: var(--r-md); padding: 6px 10px; font-size: 13px; text-align: left; color: var(--ink); }
  .qs button:hover:not(:disabled) { border-color: var(--ember); }
  .qs button.done { color: var(--ok); opacity: .7; }

  .sheet { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-3); }
  .props h3, .links h3, .game h3 { margin: var(--sp-3) 0 var(--sp-2); }
  .props h3:first-child, .links h3:first-child, .game h3:first-child { margin-top: var(--sp-1); }
  .prop { display: grid; grid-template-columns: 120px minmax(0, 1fr) 28px; align-items: center; gap: var(--sp-2); min-height: 36px; padding: 3px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
  .prop .k { font: 600 10.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .prop .v { display: flex; flex-wrap: wrap; gap: 4px 8px; min-width: 0; overflow-wrap: anywhere; }
  .item:not(:last-child)::after { content: ','; color: var(--muted); }
  .prop.editing { grid-template-columns: 120px minmax(0, 1fr) auto; padding: 6px 0; }
  .prop.editing .t-input { min-height: var(--h-sm); font-size: 13px; padding: 0 var(--sp-2); border-radius: var(--r-sm); }
  .pacts { display: flex; gap: 4px; }
  .edit { border: 0; background: none; width: 28px; height: 28px; border-radius: var(--r-sm); color: var(--muted); opacity: .5; }
  .prop:hover .edit, .edit:focus { opacity: 1; }
  .edit:hover { background: var(--surface-2); color: var(--ink); opacity: 1; }
  .emptyv { border: 0; background: none; padding: 0; text-align: left; font-style: italic; font-size: var(--fs-sm); color: var(--muted); opacity: .6; }
  .emptyv:hover { opacity: 1; }
  .prop.calc .v { color: var(--ember-soft); font: 13px var(--f-mono); }
  .prop.calc .fx { color: var(--muted); font: italic 13px serif; text-align: center; }
  .addf { display: flex; flex-wrap: wrap; gap: 6px; padding-top: var(--sp-3); }
  .addf button { border: 1px dashed var(--line); background: none; border-radius: var(--r-pill); min-height: 26px; padding: 0 10px; font-size: 12px; color: var(--muted); }
  .addf button:hover { border-color: var(--ember); color: var(--ink); }
  .addf button.extra { border-style: dotted; opacity: .75; }

  .chip { border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); background: color-mix(in srgb, var(--c) 12%, transparent);
    color: var(--ink); border-radius: var(--r-pill); padding: 1px 9px; font-size: var(--fs-sm); }
  .chip:hover { background: color-mix(in srgb, var(--c) 25%, transparent); }
  .chip.broken { --c: var(--muted); border-style: dashed; color: var(--muted); }
  .rel { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin: 4px 0; }
  .lbl { font: 11px var(--f-mono); color: var(--ember-soft); }

  .game { margin-bottom: var(--sp-3); }
  .text { flex: 1 0 auto; min-height: 300px; display: flex; flex-direction: column; border-top: 1px solid var(--line); margin: 0 calc(var(--gutter) * -1); }
  .text :global(.editor) { flex: 1; }

  /* ── linha do tempo ── */
  .timeline { list-style: none; margin: 0; padding: 0 0 40px; position: relative; }
  .timeline::before { content: ''; position: absolute; left: 116px; top: 6px; bottom: 40px; width: 1px; background: linear-gradient(var(--line), var(--ember) 50%, var(--line)); }
  .timeline li { display: grid; grid-template-columns: 100px 32px minmax(0, 1fr); align-items: center; min-height: 42px; }
  .when { text-align: right; font: 12px var(--f-mono); color: var(--ember-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mark { width: 11px; height: 11px; border-radius: 50%; background: var(--void); border: 2px solid var(--c); justify-self: center; position: relative; z-index: 1; }
  .what { text-align: left; border: 1px solid transparent; background: none; border-radius: var(--r-md); padding: 5px 10px; display: grid; color: var(--ink); min-width: 0; }
  .what:hover { border-color: var(--line); background: var(--surface); }
  .what b { font: 600 14px var(--f-display); }
  .what small { color: var(--muted); font-size: 11.5px; }
  .timeline .gap { display: block; padding: 6px 0 6px 140px; color: var(--muted); font: italic 11.5px var(--f-body); min-height: 0; }

  /* ── grafo ── */
  .graphwrap { position: relative; flex: 1; min-height: 420px; display: flex; margin-bottom: var(--sp-2); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; }
  .peek { position: absolute; left: 12px; bottom: 12px; width: min(280px, calc(100% - 24px)); display: grid; gap: 4px; padding: var(--sp-3) var(--sp-4);
    background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid color-mix(in srgb, var(--c) 50%, var(--line)); border-radius: var(--r-lg); backdrop-filter: blur(6px); }
  .peek .t-btn { justify-self: start; margin-top: 4px; }
  .legend { margin: 0 0 var(--sp-6); }

  /* ── vazio ── */
  .empty { max-width: 560px; margin: 8vh auto 0; text-align: center; display: grid; justify-items: center; }
  .empty p { color: var(--muted); margin: var(--sp-3) 0 var(--sp-5); }
  .orb { font-size: 46px; color: var(--ember); filter: drop-shadow(0 0 18px var(--ember)); animation: twinkle 3.2s ease-in-out infinite; }
  @keyframes twinkle { 50% { transform: rotate(18deg) scale(1.12); filter: drop-shadow(0 0 30px var(--ember)); } }

  /* ── diálogos e folhas ── */
  .dialog form { display: grid; gap: var(--sp-3); }
  .dialog label { display: grid; gap: 6px; }
  .types { display: flex; flex-wrap: wrap; gap: 6px; }
  .rows { display: grid; gap: 2px; }
  .rows .t-badge { margin-left: auto; }
  .toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 11; max-width: min(560px, 90%);
    padding: 10px 14px; border-radius: var(--r-md); background: var(--surface-2); border: 1px solid var(--ember); font-size: 13px; box-shadow: var(--elev-2); }

  @media (prefers-reduced-motion: reduce) { .orb, .fresh, .die:hover { animation: none; } }

  /* ── celular ── */
  @media (max-width: 720px) {
    .mundo { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
    .list { display: none; }
    .body { padding-top: var(--sp-4); }
    .mundo:not(.inside) .body { padding-bottom: 76px; } /* espaço para o botão flutuante */

    /* título vira o seletor de mundo */
    .switch { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; color: var(--ink); max-width: 100%; }
    .switch h1 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .switch :global(svg) { color: var(--muted); }
    h1.plain { display: none; }
    h1 { font-size: 22px; }
    .top:not(.ficha-top) .acts { display: none; } /* no celular: nota do mundo na folha, nova ficha no botão flutuante */
    .top { margin-bottom: var(--sp-3); }

    .tabs { display: none; }
    .filters { flex-wrap: nowrap; margin: 0 calc(var(--gutter) * -1) var(--sp-3); padding: 0 var(--gutter);
      mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent); -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent); }
    .tools .t-seg .seglbl { display: none; }
    .tools .search { flex-basis: 100%; max-width: none; }
    .tools .t-select { flex: 1; }

    .dock { display: grid; grid-template-columns: repeat(5, 1fr); grid-row: 2; z-index: var(--z-dock); border-top: 1px solid var(--line);
      background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(10px); padding: 4px 4px 2px; }
    .dock button { display: grid; justify-items: center; gap: 3px; min-height: 52px; padding: 6px 2px 4px; border: 0; background: none; border-radius: var(--r-md);
      color: var(--muted); font: 600 10.5px/1 var(--f-body); min-width: 0; }
    .dock button span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dock button.on { color: var(--ink); }
    .dock button.on :global(svg) { color: var(--ember); }
    .dock button:active { background: var(--surface-2); }
    .dock .ic { position: relative; display: block; }
    .ping { position: absolute; top: -2px; right: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--crit); box-shadow: 0 0 0 2px var(--surface); }
    .fab { display: inline-flex; position: absolute; right: var(--sp-4); bottom: calc(68px + var(--sp-3)); z-index: var(--z-dock); width: 54px; height: 54px; padding: 0;
      border-radius: 18px; box-shadow: 0 10px 28px -8px var(--ember-glow), var(--elev-2); }

    .ficha-top .acts { gap: 6px; }
    .who { gap: var(--sp-3); }
    .sheet { grid-template-columns: minmax(0, 1fr); }
    .prop, .prop.editing { grid-template-columns: 92px minmax(0, 1fr) auto; }
    .prop.editing { grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); }
    .prop.editing .pacts { grid-column: 1 / -1; justify-content: flex-end; }
    .edit { opacity: 1; }
    .graphwrap { min-height: 360px; }
    .timeline::before { left: 76px; }
    .timeline li { grid-template-columns: 60px 32px minmax(0, 1fr); }
    .timeline .gap { padding-left: 100px; }
    .toast { bottom: 84px; }
  }
</style>
