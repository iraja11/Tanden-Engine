<script lang="ts">
  import {
    converter, cotacaoDoDia, diaLocal, diasDeTrabalho, formatarPreco, gravarPrecos, lerPreco, linkTarget, mercado, moedaBase, moedasDoMundo, precosDoMundo, readMarkers, ROTULO_TENDENCIA,
    type Entity, type Preco, type World,
  } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import { factionColor, typeColor } from '../../tipos';

  // A economia do mundo, lida das fichas: o que cada lugar produz e precisa
  // vira rotas de comércio; quem controla a origem fica rico; o que poucos
  // produzem e muitos querem fica caro. Moedas, câmbio e o preço das coisas.
  let { world, byPath, onopen, oncreate }: {
    world: World;
    byPath: Map<string, Entity>;
    onopen: (path: string) => void;
    oncreate: (name: string, type: string, extra: { props: Record<string, string>; sections: string[] }) => void;
  } = $props();

  // posições do mapa com mais marcadores (de 0 a 100), para medir as rotas
  const mapa = $derived.by(() => {
    void cadernos.rev;
    let melhor: { nome: string; pos: Map<string, { x: number; y: number }> } | null = null;
    for (const m of world.entities.filter((e) => e.type === 'mapa')) {
      const pos = new Map<string, { x: number; y: number }>();
      for (const mk of readMarkers(cadernos.read(m.path))) {
        if (!mk.target) continue;
        const alvo = world.entities.find((e) => e.name.toLowerCase() === linkTarget(mk.target!).split('/').pop()!.toLowerCase());
        if (alvo) pos.set(alvo.path, { x: mk.x, y: mk.y });
      }
      if (pos.size && (!melhor || pos.size > melhor.pos.size)) melhor = { nome: m.name, pos };
    }
    return melhor;
  });
  const m = $derived(mercado(world, mapa?.pos));
  const moedas = $derived(moedasDoMundo(world));
  const base = $derived(moedaBase(moedas));
  const preco = (n: number | null) => (n === null ? '—' : moedas.length ? formatarPreco(n, moedas) : `${n.toLocaleString('pt-BR')} ✦`);
  const hoje = diaLocal(new Date());
  const pregao = $derived(m.recursos.filter((r) => r.valor !== null).map((r) => ({ r, c: cotacaoDoDia(r, hoje) })));
  const monopolios = $derived(m.recursos.filter((r) => r.monopolio).length);
  const COR_REC = ['#a3c977', '#e9c46a', '#7fb6ff', '#ff8a3d', '#b59cff', '#6fc3c9', '#d98fb0', '#ff6b6b'];
  const corRec = (nome: string) => COR_REC[Math.abs([...nome].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % COR_REC.length]!;
  const faccoes = $derived(world.entities.filter((e) => e.type === 'faccao').map((f) => f.name));
  const maxRiqueza = $derived(Math.max(1, ...m.riqueza.map((r) => r.pontos)));
  let recSel = $state<string | null>(null);
  const rotasVistas = $derived(m.rotas.filter((r) => !recSel || r.recurso === recSel));

  // ------------------------------------------------ câmbio
  let qtd = $state(10);
  let de = $state('');
  let para = $state('');
  $effect(() => { if (moedas.length && !moedas.some((x) => x.nome === de)) de = moedas[0]!.nome; if (moedas.length && !moedas.some((x) => x.nome === para)) para = moedas[moedas.length - 1]!.nome; });
  const cambio = $derived.by(() => {
    const a = moedas.find((x) => x.nome === de);
    const b = moedas.find((x) => x.nome === para);
    return a && b ? Math.round(converter(qtd, a, b) * 100) / 100 : null;
  });
  const maxMoeda = $derived(Math.max(1, ...moedas.map((x) => x.valor)));

  // ------------------------------------------------ preços
  const textoMundo = $derived.by(() => { void cadernos.rev; return world.path ? cadernos.read(world.path) : ''; });
  const precos = $derived(precosDoMundo(textoMundo, moedas));
  const dias = $derived(diasDeTrabalho(precos));
  const maxDias = $derived(Math.max(1, ...dias.values()));
  let rascunho = $state<Preco[] | null>(null);
  const linhas = $derived(rascunho ?? precos);
  let novoItem = $state('');
  let novoPreco = $state('');
  function editar(i: number, raw: string) {
    const v = lerPreco(raw, moedas);
    if (v === null) return;
    rascunho = linhas.map((p, k) => (k === i ? { ...p, preco: v, padrao: false } : p));
  }
  function somar() {
    const v = lerPreco(novoPreco, moedas);
    if (!novoItem.trim() || v === null) return;
    rascunho = [...linhas, { item: novoItem.trim(), preco: v, padrao: false }];
    novoItem = '';
    novoPreco = '';
  }
  function tirar(i: number) { rascunho = linhas.filter((_, k) => k !== i); }
  function salvar() {
    if (!world.path) return;
    cadernos.update(world.path, (t) => gravarPrecos(t, linhas.map((p) => ({ item: p.item, preco: p.preco })), moedas));
    rascunho = null;
    sound.play('complete');
    cadernos.say('Tabela de preços gravada na nota do mundo, seção "Preços".');
  }
</script>

<section class="merc" in:rise={{ y: 6 }}>
  <div class="kpis">
    <div class="kpi"><b>{m.recursos.length}</b><span>recursos</span></div>
    <div class="kpi"><b>{m.rotas.length}</b><span>rotas</span></div>
    <div class="kpi" class:alerta={monopolios > 0}><b>{monopolios}</b><span>monopólios</span></div>
    <div class="kpi"><b>{moedas.length}</b><span>moedas</span></div>
  </div>

  {#if pregao.length}
    <div class="pregao t-card" aria-label="Pregão do dia">
      <span class="tag">Pregão de hoje</span>
      <div class="fita"><div class="corre">
        {#each [...pregao, ...pregao] as x, i (i)}
          <button class="cot" class:sobe={x.c.variacao > 0} class:desce={x.c.variacao < 0} onclick={() => x.r.e && onopen(x.r.e.path)} tabindex={i >= pregao.length ? -1 : 0}>
            <b>{x.r.nome}</b><span>{preco(x.c.preco)}</span><i>{x.c.variacao > 0 ? '▲' : x.c.variacao < 0 ? '▼' : '■'} {Math.abs(x.c.variacao).toLocaleString('pt-BR')}%</i>
          </button>
        {/each}
      </div></div>
    </div>
  {/if}

  {#if m.recursos.length}
    <div class="duo">
      <div class="t-card bloco">
        <header><h3 class="t-eyebrow">Rede comercial{mapa ? ` · ${mapa.nome}` : ''}</h3>
          {#if recSel}<button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (recSel = null)}>Todas</button>{/if}</header>
        {#if mapa && rotasVistas.some((r) => mapa!.pos.has(r.de.path) && mapa!.pos.has(r.para.path))}
          <svg class="rede" viewBox="-4 -4 108 108" role="img" aria-label="Rotas comerciais no mapa">
            <rect x="-4" y="-4" width="108" height="108" rx="4" fill="var(--void)" />
            {#each rotasVistas as r, i (i)}
              {@const a = mapa.pos.get(r.de.path)}
              {@const b = mapa.pos.get(r.para.path)}
              {#if a && b}
                <path class="rota" d="M{a.x} {a.y}Q{(a.x + b.x) / 2 + (b.y - a.y) * 0.15} {(a.y + b.y) / 2 - (b.x - a.x) * 0.15} {b.x} {b.y}" fill="none" stroke={corRec(r.recurso)} stroke-width=".8" stroke-dasharray="2 1.5" style:animation-delay="{i * 0.3}s"><title>{r.recurso}: {r.de.name} → {r.para.name}</title></path>
              {/if}
            {/each}
            {#each [...mapa.pos] as [path, p] (path)}
              {@const e = byPath.get(path)}
              {#if e && e.type === 'lugar'}
                {@const prod = m.recursos.some((r) => r.produtores.some((x) => x.path === path))}
                <g class="no" role="button" tabindex="0" onclick={() => onopen(path)} onkeydown={(ev) => { if (ev.key === 'Enter') onopen(path); }}>
                  <circle cx={p.x} cy={p.y} r={prod ? 2.2 : 1.5} fill={prod ? '#e9c46a' : 'var(--muted)'} stroke="var(--void)" stroke-width=".5" />
                  <text x={p.x} y={p.y - 3} text-anchor="middle">{e.name}</text>
                </g>
              {/if}
            {/each}
          </svg>
        {/if}
        {#if rotasVistas.length}
          <ul class="rotas">
            {#each rotasVistas.slice(0, 14) as r, i (i)}
              <li style:--c={corRec(r.recurso)}>
                <span class="rc">{r.recurso}</span>
                <button onclick={() => onopen(r.de.path)}>{r.de.name}</button><span class="seta">→</span><button onclick={() => onopen(r.para.path)}>{r.para.name}</button>
                {#if r.distancia !== null}<small>{r.distancia} léguas</small>{/if}
                {#if r.controle}<small class="ctrl" style:color={factionColor(r.controle.name, faccoes)}>⚑ {r.controle.name}</small>{/if}
              </li>
            {/each}
          </ul>
          {#if rotasVistas.length > 14}<p class="dim sm">+{rotasVistas.length - 14} rotas</p>{/if}
        {:else}
          <p class="dim sm">Nenhuma rota ainda: uma rota nasce quando um lugar <code>produz</code> o que outro <code>precisa</code>.</p>
        {/if}
      </div>

      <div class="t-card bloco">
        <h3 class="t-eyebrow">Riqueza das facções</h3>
        {#each m.riqueza as r (r.faccao.path)}
          <button class="rq" onclick={() => onopen(r.faccao.path)} style:--c={factionColor(r.faccao.name, faccoes)}>
            <span class="nm">{r.monopolios.length ? '♛ ' : ''}{r.faccao.name}</span>
            <span class="br"><i style:width="{(r.pontos / maxRiqueza) * 100}%"></i></span>
            <small>{[r.recursos.length ? `${r.recursos.length} recursos` : '', r.monopolios.length ? `monopólio de ${r.monopolios.join(', ')}` : '', r.moedas.length ? `cunha ${r.moedas.join(', ')}` : ''].filter(Boolean).join(' · ') || 'sem renda própria'}</small>
          </button>
        {:else}
          <p class="dim sm">A riqueza vem do território: diga quais lugares cada facção controla (<code>território</code> na facção ou <code>controle</code> no lugar).</p>
        {/each}
      </div>
    </div>

    <div class="t-card bloco">
      <h3 class="t-eyebrow">Recursos</h3>
      <div class="tabela t-scroll-x">
        <table>
          <thead><tr><th>Recurso</th><th>Valor</th><th>Quem produz</th><th>Quem precisa</th><th>Escassez</th></tr></thead>
          <tbody>
            {#each m.recursos as r (r.id)}
              <tr class:sel={recSel === r.nome} style:--c={corRec(r.nome)}>
                <td><button class="rn" onclick={() => (recSel = recSel === r.nome ? null : r.nome)} title="Ver as rotas deste recurso"><i></i>{r.nome}</button>
                  {#if r.monopolio}<span class="mono" title={`Monopólio de ${r.monopolio.name}`}>♛ {r.monopolio.name}</span>{/if}
                  {#if !r.e}<button class="falta" onclick={() => oncreate(r.nome, 'recurso', { props: {}, sections: [] })}>+ ficha</button>{/if}</td>
                <td class="num">{preco(r.valor)}</td>
                <td>{#each r.produtores.slice(0, 4) as p (p.path)}<button class="chip" style:--t={typeColor('lugar')} onclick={() => onopen(p.path)}>{p.name}</button>{:else}<span class="dim">ninguém</span>{/each}</td>
                <td>{#each r.consumidores.slice(0, 4) as c (c.path)}<button class="chip" style:--t={typeColor('lugar')} onclick={() => onopen(c.path)}>{c.name}</button>{:else}<span class="dim">—</span>{/each}</td>
                <td><span class="esc" title={`${r.escassez}× (${ROTULO_TENDENCIA[r.tendencia]})`}><span><i style:width="{(Math.log2(r.escassez) + 2) * 25}%" class:alta={r.tendencia === 'alta'} class:baixa={r.tendencia === 'baixa'}></i></span>{r.tendencia === 'alta' ? '▲' : r.tendencia === 'baixa' ? '▼' : '■'}</span></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if m.semFicha.length}
        <div class="row"><span class="dim sm">Citados sem ficha:</span>{#each m.semFicha as n (n)}<button class="chip" style:--t={typeColor('recurso')} onclick={() => oncreate(n, 'recurso', { props: {}, sections: [] })}>+ {n}</button>{/each}</div>
      {/if}
      {#if m.parados.length}<p class="dim sm">Lugares sem nada a oferecer nem a pedir: {m.parados.slice(0, 10).map((p) => p.name).join(', ')}{m.parados.length > 10 ? '…' : ''}.</p>{/if}
    </div>
  {:else}
    <div class="t-card vazio">
      <p><b>A economia ainda está parada.</b> Nos lugares, escreva o que cada um produz (<code>recursos: [[Sal]], madeira</code>) e o que precisa (<code>precisa: [[Ferro]]</code>). As rotas, os preços e a riqueza das facções se montam sozinhos.</p>
      <button class="t-btn t-btn--primary" onclick={() => oncreate('Sal', 'recurso', { props: { valor: '5' }, sections: [] })}>Criar o primeiro recurso</button>
    </div>
  {/if}

  <div class="duo">
    <div class="t-card bloco">
      <h3 class="t-eyebrow">Moedas</h3>
      {#if moedas.length}
        <div class="escada">
          {#each moedas as x (x.e.path)}
            <button class="moeda" onclick={() => onopen(x.e.path)}>
              <span class="disco" aria-hidden="true">{x.simbolo.slice(0, 2) || x.nome.slice(0, 1)}</span>
              <span class="mt"><b>{x.nome}</b><small>{x === base ? 'moeda base' : `= ${x.valor.toLocaleString('pt-BR')} ${base?.nome ?? ''}`}{x.emissor ? ` · ${x.emissor.name}` : ''}</small></span>
              <span class="br"><i style:width="{(Math.log10(x.valor + 1) / Math.log10(maxMoeda + 1)) * 100}%"></i></span>
            </button>
          {/each}
        </div>
        <div class="cambio">
          <input class="t-input" type="number" min="0" bind:value={qtd} aria-label="Quantidade" />
          <select class="t-select" bind:value={de} aria-label="De">{#each moedas as x (x.nome)}<option value={x.nome}>{x.nome}</option>{/each}</select>
          <span>=</span>
          <b>{cambio?.toLocaleString('pt-BR') ?? '—'}</b>
          <select class="t-select" bind:value={para} aria-label="Para">{#each moedas as x (x.nome)}<option value={x.nome}>{x.nome}</option>{/each}</select>
        </div>
      {:else}
        <p class="dim sm">Sem moedas. Crie fichas de <b>Moeda</b> com <code>valor</code> (quantas da menor ela vale): Cobre 1, Prata 10, Coroa 100.</p>
        <button class="t-btn t-btn--sm" onclick={() => oncreate('Cobre', 'moeda', { props: { valor: '1', 'símbolo': 'co', material: 'cobre' }, sections: [] })}>+ Moeda base</button>
      {/if}
    </div>

    <div class="t-card bloco">
      <header><h3 class="t-eyebrow">Quanto custa</h3>{#if precos.every((p) => p.padrao) && !rascunho}<small class="dim">cesta de referência</small>{/if}</header>
      <table class="precos">
        <tbody>
          {#each linhas as p, i (p.item + i)}
            <tr>
              <td>{p.item}</td>
              <td><input class="pv" value={preco(p.preco)} onchange={(ev) => editar(i, (ev.currentTarget as HTMLInputElement).value)} aria-label={`Preço de ${p.item}`} /></td>
              <td class="dias" title="Dias de trabalho de um trabalhador comum"><div><span><i style:width="{Math.min(100, (Math.log10((dias.get(p.item) ?? p.preco / 8) + 1) / Math.log10(maxDias + 1)) * 100)}%"></i></span><small>{(dias.get(p.item) ?? Math.round((p.preco / 8) * 10) / 10).toLocaleString('pt-BR')} d</small></div></td>
              <td><button class="x" onclick={() => tirar(i)} aria-label={`Tirar ${p.item}`}>×</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <form class="novo" onsubmit={(ev) => { ev.preventDefault(); somar(); }}>
        <input class="t-input" bind:value={novoItem} placeholder="Item" aria-label="Item" />
        <input class="t-input" bind:value={novoPreco} placeholder={moedas.length ? '3 pratas' : '12'} aria-label="Preço" />
        <button class="t-btn t-btn--sm" disabled={!novoItem.trim() || !novoPreco.trim()}>+</button>
      </form>
      {#if rascunho}<div class="t-actions"><button class="t-btn t-btn--sm" onclick={() => (rascunho = null)}>Desfazer</button><button class="t-btn t-btn--sm t-btn--primary" disabled={!world.path} onclick={salvar}>Gravar na nota do mundo</button></div>{/if}
      <p class="dim sm">Os preços ficam numa tabela na nota do mundo (seção "Preços"). Escreva em qualquer moeda: "1 coroa e 4 pratas".</p>
    </div>
  </div>
</section>

<style>
  .merc { display: grid; gap: var(--sp-3); padding-bottom: 40px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: 8px; }
  .kpi { display: grid; padding: 10px 14px; border-radius: var(--r-lg); border: 1px solid color-mix(in srgb, #e9c46a 30%, var(--line)); background: linear-gradient(150deg, color-mix(in srgb, #e9c46a 10%, var(--surface)), var(--surface) 70%); }
  .kpi b { font: 700 26px/1.1 var(--f-display); }
  .kpi span { font-size: 12px; color: var(--muted); }
  .kpi.alerta { border-color: color-mix(in srgb, #e5484d 45%, var(--line)); background: linear-gradient(150deg, color-mix(in srgb, #e5484d 10%, var(--surface)), var(--surface) 70%); }
  .pregao { display: flex; align-items: center; gap: 10px; padding: 6px 10px; overflow: hidden; }
  .tag { flex: none; font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: #e9c46a; }
  .fita { flex: 1; min-width: 0; overflow: hidden; mask: linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent); }
  .corre { display: flex; gap: 18px; width: max-content; animation: corre 40s linear infinite; }
  .fita:hover .corre { animation-play-state: paused; }
  @keyframes corre { to { transform: translateX(-50%); } }
  .cot { display: inline-flex; align-items: baseline; gap: 6px; border: 0; background: none; padding: 2px 0; color: var(--ink); white-space: nowrap; font-size: 12.5px; }
  .cot b { font: 600 12.5px var(--f-display); }
  .cot span { font: 12px var(--f-mono); color: var(--muted); }
  .cot i { font: normal 600 11px var(--f-mono); color: var(--muted); }
  .cot.sobe i { color: #e5484d; }
  .cot.desce i { color: #5fbf77; }
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: var(--sp-3); align-items: start; }
  .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; min-width: 0; }
  .bloco header { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; }
  .bloco header small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .rede { width: 100%; height: auto; max-height: 340px; border-radius: var(--r-md); }
  .rede text { font: 600 2.6px var(--f-body); fill: var(--ink); pointer-events: none; }
  .rede .no { cursor: pointer; }
  .rota { animation: fluxo 3s linear infinite; }
  @keyframes fluxo { to { stroke-dashoffset: -7; } }
  .rotas { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; font-size: 12.5px; }
  .rotas li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; padding: 2px 0 2px 8px; border-left: 3px solid var(--c); }
  .rotas button { border: 0; background: none; padding: 0; color: var(--ink); font: inherit; }
  .rotas button:hover { text-decoration: underline; }
  .rc { font: 600 11.5px var(--f-display); color: var(--c); min-width: 60px; }
  .seta { color: var(--muted); }
  .rotas small { font: 10.5px var(--f-mono); color: var(--muted); }
  .rq { display: grid; gap: 3px; border: 0; background: none; padding: 4px; border-radius: var(--r-sm); text-align: left; color: var(--ink); }
  .rq:hover { background: var(--surface-2); }
  .rq .nm { font: 600 13px var(--f-display); }
  .br { height: 7px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
  .br i { display: block; height: 100%; border-radius: 4px; background: var(--c, #e9c46a); transition: width .6s var(--ease); }
  .rq small { font-size: 11.5px; color: var(--muted); }
  .tabela { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 4px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  td { padding: 5px 6px; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); vertical-align: middle; }
  tr.sel td { background: color-mix(in srgb, var(--c) 9%, transparent); }
  .rn { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 0; color: var(--ink); font: 600 13px var(--f-display); }
  .rn i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
  .mono { display: inline-block; margin-left: 6px; font: 600 10.5px var(--f-display); color: #e5484d; }
  .falta { margin-left: 6px; border: 1px dashed var(--line); background: none; border-radius: var(--r-pill); padding: 0 6px; color: var(--ember-soft); font-size: 11px; }
  .num { font-family: var(--f-mono); white-space: nowrap; }
  .chip { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 10%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 0 8px; font-size: 11.5px; margin: 1px; }
  .esc { display: inline-flex; align-items: center; gap: 6px; font: 11px var(--f-mono); color: var(--muted); }
  .esc > span { width: 60px; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .esc i { display: block; height: 100%; background: var(--muted); }
  .esc i.alta { background: #e5484d; }
  .esc i.baixa { background: #5fbf77; }
  .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .vazio { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: center; }
  .vazio p { flex: 1 1 280px; margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .vazio b { color: var(--ink); }
  .escada { display: grid; gap: 4px; }
  .moeda { display: grid; grid-template-columns: 34px minmax(0, 1fr) minmax(50px, 30%); align-items: center; gap: 10px; border: 0; background: none; padding: 4px; border-radius: var(--r-sm); text-align: left; color: var(--ink); }
  .moeda:hover { background: var(--surface-2); }
  .disco { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; font: 700 12px var(--f-display); color: #3d2c00;
    background: radial-gradient(circle at 35% 30%, #fff3b0, #e9c46a 45%, #a07c22); box-shadow: inset 0 0 0 2px #c9a227, 0 2px 6px rgba(0, 0, 0, .3); }
  .mt { display: grid; min-width: 0; }
  .mt b { font: 600 13px var(--f-display); }
  .mt small { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .moeda .br i { background: linear-gradient(90deg, #a07c22, #e9c46a); }
  .cambio { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px dashed var(--line); }
  .cambio .t-input { width: 90px; }
  .cambio b { font: 700 16px var(--f-mono); }
  .precos { table-layout: fixed; }
  .precos td { padding: 4px 4px; }
  .precos td:first-child { width: 36%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .precos td:nth-child(2) { width: 30%; }
  .precos td:last-child { width: 26px; padding: 0; }
  .pv { width: 100%; min-width: 0; border: 1px solid transparent; background: none; color: var(--ink); font: 12px var(--f-mono); padding: 2px 4px; border-radius: var(--r-sm); }
  .pv:hover, .pv:focus { border-color: var(--line); background: var(--surface); outline: none; }
  .dias div { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .dias span { flex: 1; min-width: 12px; height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .dias i { display: block; height: 100%; background: var(--ember); }
  .dias small { font: 10.5px var(--f-mono); color: var(--muted); white-space: nowrap; }
  .x { border: 0; background: none; color: var(--muted); width: 22px; height: 22px; border-radius: 6px; }
  .x:hover { color: var(--crit); background: var(--surface-2); }
  .novo { display: flex; gap: 6px; }
  .novo .t-input { flex: 1; min-width: 0; }
  .dim { color: var(--muted); }
  .sm { font-size: 12px; margin: 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  @media (prefers-reduced-motion: reduce) { .corre, .rota { animation: none; } }
</style>
