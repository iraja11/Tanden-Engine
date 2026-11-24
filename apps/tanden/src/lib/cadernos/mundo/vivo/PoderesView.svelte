<script lang="ts">
  import {
    CATEGORIAS_PODER, VEREDITOS, arvorePoderes, entityFolder, entityTemplate, equilibrio, forjarPoder, portadores, seededRng, setProps, setSection,
    type CategoriaPoder, type Veredito, type World,
  } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';

  // Poderes do mundo como uma constelação: cada fonte é uma coluna, e os
  // poderes descem pela árvore de pré-requisitos. Embaixo, a balança de cada
  // um e a forja, que sorteia poderes com custo, limite e sinal.
  let { world, onopen }: { world: World; onopen: (path: string) => void } = $props();

  const arv = $derived.by(() => { void cadernos.rev; return arvorePoderes(world, (p) => cadernos.read(p)); });
  const lista = $derived(arv.poderes.map((p) => ({ p, eq: equilibrio(p), quem: portadores(world, p.e.path).length })));
  const cor = (c: CategoriaPoder) => CATEGORIAS_PODER.find((x) => x.id === c)!.cor;
  const glifo = (c: CategoriaPoder) => CATEGORIAS_PODER.find((x) => x.id === c)!.glifo;

  // profundidade de cada poder na árvore (a maior corrente de pré-requisitos)
  const prof = $derived.by(() => {
    const req = new Map(arv.poderes.map((p) => [p.e.path, p.requer]));
    const memo = new Map<string, number>();
    const d = (path: string, pilha: Set<string>): number => {
      if (memo.has(path)) return memo.get(path)!;
      if (pilha.has(path) || pilha.size > 12) return 0;
      pilha.add(path);
      const r = Math.max(-1, ...(req.get(path) ?? []).filter((x) => req.has(x)).map((x) => d(x, pilha))) + 1;
      pilha.delete(path);
      memo.set(path, r);
      return r;
    };
    for (const p of arv.poderes) d(p.e.path, new Set());
    return memo;
  });

  // largura pela quantidade de fontes: cada coluna precisa de espaço para os nomes
  const W = $derived(Math.max(420, Math.min(900, arv.fontes.length * 210)));
  const ROW = 78;
  const maxProf = $derived(Math.max(0, ...prof.values()));
  const H = $derived(Math.max(220, (maxProf + 1) * ROW + 70));
  const pos = $derived.by(() => {
    const m = new Map<string, { x: number; y: number }>();
    const nF = Math.max(1, arv.fontes.length);
    arv.fontes.forEach((f, i) => {
      const col = lista.filter((x) => x.p.fonte === f);
      const porLinha = new Map<number, typeof col>();
      for (const x of col) { const d = prof.get(x.p.e.path) ?? 0; porLinha.set(d, [...(porLinha.get(d) ?? []), x]); }
      const larg = W / nF;
      for (const [d, l] of porLinha) l.forEach((x, k) => m.set(x.p.e.path, { x: i * larg + ((k + 1) / (l.length + 1)) * larg, y: 62 + d * ROW }));
    });
    return m;
  });
  const ciclos = $derived(new Set(arv.ciclos));
  let foco = $state<string | null>(null);

  // filtros da lista
  let filtro = $state<Veredito | 'todos'>('todos');
  const contagem = $derived(Object.fromEntries((Object.keys(VEREDITOS) as Veredito[]).map((v) => [v, lista.filter((x) => x.eq.veredito === v).length])) as Record<Veredito, number>);
  const vistos = $derived(lista.filter((x) => filtro === 'todos' || x.eq.veredito === filtro).sort((a, b) => b.p.nivel - a.p.nivel || a.p.e.name.localeCompare(b.p.e.name, 'pt-BR')));

  // ------------------------------------------------ forja
  let semente = $state(Math.floor(Math.random() * 1e6));
  let catForja = $state<CategoriaPoder | ''>('');
  let fonteForja = $state('');
  let nivelForja = $state(0);
  const forjado = $derived(forjarPoder(seededRng(semente), { ...(catForja ? { categoria: catForja } : {}), ...(fonteForja.trim() ? { fonte: fonteForja.trim() } : {}), ...(nivelForja ? { nivel: nivelForja } : {}) }));
  function reforjar() { semente = Math.floor(Math.random() * 1e6); sound.play('tick'); }
  function criar() {
    const f = forjado;
    const path = cadernos.create(entityFolder(world, 'poder'), f.nome, (n) => setSection(setSection(setProps(entityTemplate(n, world.name, 'poder'), f.props), 'Efeito', f.efeito), 'Limites', f.limites));
    sound.play('complete');
    onopen(path);
  }
  const fontesExistentes = $derived(arv.fontes.filter((f) => f !== 'sem fonte'));
</script>

<section class="poderes" in:rise={{ y: 6 }}>
  {#if lista.length}
    <div class="ceu t-card" style:--h="{H}px">
      <svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="Constelação de poderes por fonte e pré-requisito">
        <defs>
          <radialGradient id="pd-brilho"><stop offset="0" stop-color="#fff" stop-opacity=".9" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></radialGradient>
        </defs>
        {#each Array.from({ length: 70 }) as _, i (i)}
          <circle cx={(i * 97.13) % W} cy={(i * 53.71) % H} r={(i % 3) * 0.35 + 0.3} fill="var(--muted)" opacity=".35" />
        {/each}
        {#each arv.fontes as f, i (f)}
          <text x={(i + 0.5) * (W / Math.max(1, arv.fontes.length))} y="24" text-anchor="middle" class="fonte">{f}</text>
          {#if i > 0}<line x1={i * (W / arv.fontes.length)} x2={i * (W / arv.fontes.length)} y1="12" y2={H - 10} stroke="var(--line)" stroke-dasharray="2 6" />{/if}
        {/each}
        {#each arv.ligacoes as l, i (i)}
          {@const a = pos.get(l.de)}
          {@const b = pos.get(l.para)}
          {#if a && b}
            <path d="M{a.x} {a.y}C{a.x} {(a.y + b.y) / 2} {b.x} {(a.y + b.y) / 2} {b.x} {b.y}" fill="none"
              stroke={ciclos.has(l.de) && ciclos.has(l.para) ? '#e5484d' : 'var(--muted)'} stroke-width={foco === l.de || foco === l.para ? 2.2 : 1.2}
              stroke-dasharray={ciclos.has(l.de) && ciclos.has(l.para) ? '5 4' : undefined} opacity={foco && foco !== l.de && foco !== l.para ? 0.25 : 0.8} />
          {/if}
        {/each}
        {#each lista as x (x.p.e.path)}
          {@const q = pos.get(x.p.e.path)}
          {#if q}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <g class="estrela" role="button" tabindex="0" aria-label={`${x.p.e.name}: ${VEREDITOS[x.eq.veredito].label}`}
              onclick={() => onopen(x.p.e.path)} onkeydown={(ev) => { if (ev.key === 'Enter') onopen(x.p.e.path); }}
              onpointerenter={() => (foco = x.p.e.path)} onpointerleave={() => (foco = null)} opacity={foco && foco !== x.p.e.path && !arv.ligacoes.some((l) => (l.de === foco && l.para === x.p.e.path) || (l.para === foco && l.de === x.p.e.path)) ? 0.45 : 1}>
              <circle cx={q.x} cy={q.y} r={10 + x.p.nivel * 1.6} fill="url(#pd-brilho)" opacity=".18" />
              <circle cx={q.x} cy={q.y} r={7 + x.p.nivel * 0.8} fill={cor(x.p.categoria)} fill-opacity=".22" stroke={VEREDITOS[x.eq.veredito].cor} stroke-width="2" />
              <text x={q.x} y={q.y + 4} text-anchor="middle" class="g" fill={cor(x.p.categoria)}>{glifo(x.p.categoria)}</text>
              <text x={q.x} y={q.y + 20 + x.p.nivel * 0.8} text-anchor="middle" class="nome">{x.p.e.name.length > 18 ? `${x.p.e.name.slice(0, 17)}…` : x.p.e.name}</text>
            </g>
          {/if}
        {/each}
      </svg>
      <p class="leg">
        {#each Object.entries(VEREDITOS) as [id, v] (id)}<span><i style:border-color={v.cor}></i>{v.label}</span>{/each}
        {#if arv.ciclos.length}<span class="ciclo">— — ciclo de pré-requisitos</span>{/if}
      </p>
    </div>

    <div class="filtros t-scroll-x" role="group" aria-label="Filtrar pela balança">
      <button class="t-chip" class:on={filtro === 'todos'} onclick={() => (filtro = 'todos')}>Todos<small>{lista.length}</small></button>
      {#each Object.entries(VEREDITOS) as [id, v] (id)}
        <button class="t-chip" class:on={filtro === id} style:--c={v.cor} onclick={() => (filtro = id as Veredito)}><i></i>{v.label}<small>{contagem[id as Veredito]}</small></button>
      {/each}
    </div>
    <div class="grid">
      {#each vistos as x, i (x.p.e.path)}
        <button class="card t-card" style:--k={cor(x.p.categoria)} style:--v={VEREDITOS[x.eq.veredito].cor} onclick={() => onopen(x.p.e.path)} in:rise={{ delay: Math.min(i, 12) * 25, y: 6 }}>
          <span class="top"><span class="gl" aria-hidden="true">{glifo(x.p.categoria)}</span><b>{x.p.e.name}</b><span class="ver">{VEREDITOS[x.eq.veredito].label}</span></span>
          <span class="niv" title={`Nível ${x.p.nivel} de 10`}>{#each Array.from({ length: 10 }) as _, k (k)}<i class:on={k < x.p.nivel}></i>{/each}</span>
          <span class="meta">{x.p.fonte} · {x.p.custo ? `custo: ${x.p.custo}` : 'sem custo'}{x.quem ? ` · ${x.quem} ${x.quem === 1 ? 'portador' : 'portadores'}` : ''}</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="dim small">Nenhum poder ainda. Um poder bom tem preço: o que custa, o que não consegue fazer e como alguém percebe que está sendo usado. Use a forja para começar.</p>
  {/if}

  <div class="forja t-card">
    <h3 class="t-eyebrow">⚒ Forja de poderes</h3>
    <div class="ctrl">
      <select class="t-select" bind:value={catForja} aria-label="Categoria">
        <option value="">Qualquer categoria</option>
        {#each CATEGORIAS_PODER as c (c.id)}<option value={c.id}>{c.glifo} {c.label}</option>{/each}
      </select>
      <input class="t-input" bind:value={fonteForja} list="pd-fontes" placeholder="Fonte: sangue, estrelas, pacto…" aria-label="Fonte" />
      <datalist id="pd-fontes">{#each fontesExistentes as f (f)}<option value={f}></option>{/each}</datalist>
      <label class="niv-ctrl"><span>Nível {nivelForja || 'livre'}</span><input type="range" min="0" max="10" bind:value={nivelForja} aria-label="Nível" /></label>
    </div>
    {#key semente + catForja + fonteForja + nivelForja}
      <div class="previa" style:--k={cor((CATEGORIAS_PODER.find((c) => c.label.toLowerCase() === forjado.props.categoria)?.id ?? 'utilidade') as CategoriaPoder)} in:rise={{ y: 4 }}>
        <b>{forjado.nome}</b>
        <p>{forjado.efeito}</p>
        <dl>
          <dt>Custo</dt><dd>{forjado.props.custo}</dd>
          <dt>Limite</dt><dd>{forjado.limites}</dd>
          <dt>Sinal</dt><dd>{forjado.props.sinal}</dd>
          <dt>Nível</dt><dd>{forjado.props['nível']} · {forjado.props.alcance} · {forjado.props['duração']}</dd>
        </dl>
      </div>
    {/key}
    <div class="t-actions">
      <button class="t-btn" onclick={reforjar}>🎲 Forjar outro</button>
      <button class="t-btn t-btn--primary" onclick={criar}>Criar ficha</button>
    </div>
  </div>
</section>

<style>
  .poderes { display: grid; gap: var(--sp-3); }
  .ceu { padding: 6px; background: radial-gradient(ellipse at 50% 0, color-mix(in srgb, #c084fc 12%, var(--surface)), var(--void) 80%); overflow-x: auto; }
  .ceu svg { display: block; width: 100%; min-width: 420px; height: auto; max-height: var(--h); }
  .fonte { font: 600 12px var(--f-display); letter-spacing: .12em; text-transform: uppercase; fill: var(--muted); }
  .estrela { cursor: pointer; transition: opacity .2s; }
  .estrela:focus-visible { outline: none; }
  .estrela:focus-visible circle:nth-child(2) { stroke-width: 4; }
  .g { font-size: 13px; pointer-events: none; }
  .nome { font: 600 12px var(--f-body); fill: var(--ink); pointer-events: none; }
  .leg { margin: 4px 6px; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--muted); }
  .leg span { display: inline-flex; align-items: center; gap: 5px; }
  .leg i { width: 10px; height: 10px; border-radius: 50%; border: 2px solid; }
  .leg .ciclo { color: #e5484d; }
  .filtros { display: flex; gap: 4px; }
  .filtros small { margin-left: 4px; font: 10px var(--f-mono); color: var(--muted); }
  .filtros i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); margin-right: 2px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr)); gap: 8px; }
  .card { display: grid; gap: 6px; text-align: left; color: var(--ink); border-left: 3px solid var(--k); }
  .top { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .gl { color: var(--k); font-size: 16px; }
  .top b { flex: 1; min-width: 0; font: 600 15px var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ver { flex: none; font: 600 10.5px var(--f-display); color: var(--v); border: 1px solid color-mix(in srgb, var(--v) 50%, transparent); border-radius: var(--r-pill); padding: 0 7px; }
  .niv { display: flex; gap: 2px; }
  .niv i { flex: 1; height: 4px; border-radius: 2px; background: var(--line); }
  .niv i.on { background: var(--k); }
  .meta { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .forja { display: grid; gap: var(--sp-3); border: 1px solid color-mix(in srgb, #f2a65a 35%, var(--line)); background: linear-gradient(160deg, color-mix(in srgb, #f2a65a 8%, var(--surface)), var(--surface) 60%); }
  .ctrl { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .ctrl .t-input { flex: 1; min-width: min(180px, 100%); }
  .niv-ctrl { display: grid; font: 11px var(--f-mono); color: var(--muted); min-width: 120px; }
  .previa { display: grid; gap: 6px; padding: var(--sp-3); border-radius: var(--r-md); border: 1px solid color-mix(in srgb, var(--k) 45%, var(--line)); background: var(--surface); box-shadow: 0 0 24px -12px var(--k); }
  .previa b { font: 600 20px var(--f-display); color: color-mix(in srgb, var(--k) 70%, var(--ink)); }
  .previa p { margin: 0; font-size: 14px; line-height: 1.5; }
  .previa dl { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 10px; font-size: 12.5px; }
  .previa dt { color: var(--muted); font: 600 10px/1.9 var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .previa dd { margin: 0; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; }
</style>
