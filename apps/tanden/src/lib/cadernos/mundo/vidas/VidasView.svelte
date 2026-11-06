<script lang="ts">
  import { anoDe, catalogo, gerarPessoa, idadeDe, pessoaDaFicha, seededRng, type Ajustes, type Categoria, type Efeito, type VidaEvento, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { cadernos } from '../../cadernos.svelte';
  import Graph from '../../Graph.svelte';
  import { typeColor } from '../../tipos';
  import LinkText from '../LinkText.svelte';
  import NovaVida from './NovaVida.svelte';
  import PessoaPainel from './PessoaPainel.svelte';
  import { vidas } from './vidas.svelte';

  // Simulação de vidas: escolha uma simulação do mundo (ou comece outra),
  // ande no tempo, leia a crônica, abra cada pessoa e mexa no destino dela.
  let { world, onopen, onOpenNote, onregras }: {
    world: World;
    onopen: (path: string) => void;
    onOpenNote: (path: string) => void;
    onregras: () => void;
  } = $props();

  let criando = $state(false);
  let sel = $state<string | null>(null);
  let aba = $state<'cronica' | 'teia' | 'numeros' | 'reliquias' | 'mundo'>('cronica');
  let busca = $state('');
  let mostrarMortos = $state(false);

  const sim = $derived.by(() => { void vidas.ver; return vidas.aberta && vidas.aberta.sim.world.name === world.name ? vidas.aberta.sim : null; });
  const sims = $derived((world.sims ?? []).map((p) => ({ path: p, nome: p.split('/').pop()!.replace(/\.md$/, '') })));
  // o motor é um objeto comum: a tela tira uma "foto" do que mostra a cada mudança
  const estado = $derived.by(() => {
    void vidas.ver;
    if (!sim) return null;
    return {
      t: sim.t, data: sim.data(), inicio: sim.data(sim.cfg.inicio), nome: sim.cfg.nome, vivos: sim.vivos().length, issues: [...sim.issues],
      efeitos: sim.efeitos.map((e) => `${e.tipo}${e.lugar ? ` em ${sim.lugarNome(e.lugar)}` : ''} até ${sim.data(e.ate)}`), ajustes: { ...sim.ajustes },
      lugares: [...sim.lugares].filter(([k]) => !k.startsWith('§')),
      eventosAtivos: sim.eventosAtivos.map((e) => `${e.nome}${e.lugar ? ` em ${sim.lugarNome(e.lugar)}` : ''} até ${sim.data(e.ate)}`),
      reliquias: sim.reliquias(),
    };
  });
  const meusEventos = $derived(sim ? [...sim.cat.eventos.values()] : []);
  let largura = $state(1000);
  const tres = $derived(largura >= 1120);
  // trocou de mundo: fecha a simulação do outro
  $effect(() => { if (vidas.aberta && vidas.aberta.sim.world.name !== world.name) vidas.fechar(); });

  function abrir(path: string) {
    sel = null;
    criando = false;
    vidas.abrir(path, world);
  }

  // ------------------------------------------------ tempo
  let ultimo = $state<string>('');
  function andar(meses: number, importante = false) {
    const r = vidas.andar(meses, importante);
    if (!r) return null;
    ultimo = r.parou === 'decisao' ? 'Uma decisão espera por você.' : r.parou === 'evento' ? `Parou num marco depois de ${r.meses} ${r.meses === 1 ? 'mês' : 'meses'}.`
      : r.parou === 'fim' ? 'Não sobrou ninguém vivo.' : `${r.meses} ${r.meses === 1 ? 'mês' : 'meses'}: ${r.novos.filter((e) => e.peso >= 2).length} acontecimentos notáveis.`;
    return r;
  }

  // tocar: o tempo anda sozinho, no ritmo escolhido; para numa decisão (ou num marco, se pedir)
  let tocando = $state(false);
  let ritmo = $state(1);
  let pausarMarcos = $state(true);
  $effect(() => {
    if (!tocando || !sim) return;
    const h = setInterval(() => {
      if (vidas.ocupado) return;
      const r = andar(ritmo, pausarMarcos);
      if (!r || r.parou === 'decisao' || r.parou === 'fim' || (pausarMarcos && r.parou === 'evento')) tocando = false;
    }, 650);
    return () => clearInterval(h);
  });
  const decorrido = $derived.by(() => {
    if (!sim || !estado) return '';
    const m = estado.t - sim.cfg.inicio;
    const a = Math.floor(m / 12);
    const r = m % 12;
    return m === 0 ? 'ainda no primeiro mês' : `${a ? `${a} ${a === 1 ? 'ano' : 'anos'}` : ''}${a && r ? ' e ' : ''}${r ? `${r} ${r === 1 ? 'mês' : 'meses'}` : ''} depois`;
  });

  // ------------------------------------------------ elenco
  const gente = $derived.by(() => {
    void vidas.ver;
    if (!sim) return [];
    const q = busca.trim().toLowerCase();
    return sim.todas()
      .filter((p) => (mostrarMortos || p.morte === null) && (!q || p.nome.toLowerCase().includes(q) || (sim.nomeProf(p) ?? '').toLowerCase().includes(q)))
      .map((p) => ({ p, idade: idadeDe(p, sim.t), par: sim.parceiro(p), amantes: sim.amantes(p).length, onde: sim.ondeEsta(p) }))
      .sort((a, b) => Number(a.p.morte !== null) - Number(b.p.morte !== null) || Number(!!b.p.nota) - Number(!!a.p.nota) || a.p.nome.localeCompare(b.p.nome, 'pt-BR'));
  });

  // ------------------------------------------------ crônica
  const CATS: Array<[Categoria, string]> = [['romance', '♥ romance'], ['familia', '👪 família'], ['conflito', '⚔ conflito'], ['social', '💬 social'], ['vida', '🌱 vida'], ['morte', '✝ morte'], ['mundo', '🌍 mundo'], ['regra', '✎ regras'], ['voce', '✋ você']];
  let cats = $state<Set<Categoria>>(new Set(CATS.map(([c]) => c)));
  let soMarcos = $state(true);
  let soSel = $state(false);
  let segredos = $state(true);
  const eventos = $derived.by(() => {
    void vidas.ver;
    if (!sim) return [];
    const out: VidaEvento[] = [];
    for (let i = sim.eventos.length - 1; i >= 0 && out.length < 400; i--) {
      const e = sim.eventos[i]!;
      if (!cats.has(e.cat) || (soMarcos && e.peso < 2) || (!segredos && e.segredo) || (soSel && sel && !e.quem.includes(sel))) continue;
      out.push(e);
    }
    const grupos: Array<{ ano: number; ev: VidaEvento[] }> = [];
    for (const e of out) {
      const a = anoDe(e.t);
      const g = grupos[grupos.length - 1];
      if (g?.ano === a) g.ev.push(e);
      else grupos.push({ ano: a, ev: [e] });
    }
    return grupos;
  });
  const corDe = (t: string) => {
    const p = sim?.porNomeDe(t);
    if (p) return p.nota ? typeColor('personagem') : 'var(--muted)';
    const e = world.entities.find((x) => x.name.toLowerCase() === t.toLowerCase());
    return e ? typeColor(e.type) : null;
  };
  function link(t: string) {
    const p = sim?.porNomeDe(t);
    if (p) {
      sel = p.id;
      return;
    }
    const e = world.entities.find((x) => x.name.toLowerCase() === t.toLowerCase());
    if (e) onopen(e.path);
  }
  const ICON: Record<Categoria, string> = { romance: '♥', familia: '👪', conflito: '⚔', social: '💬', vida: '🌱', morte: '✝', mundo: '🌍', regra: '✎', voce: '✋', trabalho: '⚒' };

  // ------------------------------------------------ teia
  const VCOR: Record<string, string> = { casados: '♥ casados', namoro: 'namoro', noivado: 'noivado', amantes: '🤫 amantes', amigos: 'amigos', rivais: 'rivais', inimigos: 'inimigos' };
  let teiaSel = $state<string | null>(null);
  const teia = $derived.by(() => {
    void vidas.ver;
    if (!sim || aba !== 'teia') return { nodes: [], edges: [] };
    const vivosIds = new Set(sim.vivos().map((p) => p.id));
    const nodes = sim.vivos().map((p) => ({ id: p.id, label: p.nome, type: p.conduzido ? 'faccao' : p.nota ? 'personagem' : 'item' }));
    const edges: Array<{ from: string; to: string; label: string }> = [];
    for (const [k, set] of sim.vinc) {
      const [a, b] = k.split('|') as [string, string];
      if (!vivosIds.has(a) || !vivosIds.has(b)) continue;
      for (const v of set) if (v !== 'ex') edges.push({ from: a, to: b, label: VCOR[v] ?? v });
    }
    for (const p of sim.vivos()) {
      if (p.conjuge && p.id < p.conjuge && vivosIds.has(p.conjuge)) edges.push({ from: p.id, to: p.conjuge, label: VCOR['casados']! });
      for (const x of [p.pais[0], p.paiOficial ?? p.pais[1]]) if (x && vivosIds.has(x)) edges.push({ from: x, to: p.id, label: 'filho(a)' });
    }
    return { nodes, edges };
  });

  // ------------------------------------------------ números
  const W = 600;
  const H = 120;
  const grafico = $derived.by(() => {
    void vidas.ver;
    const h = sim?.historia ?? [];
    if (h.length < 2) return null;
    const max = Math.max(5, ...h.map((x) => x.vivos));
    const span = h.length - 1;
    const x = (i: number) => (i / span) * W;
    const linha = h.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${(H - (p.vivos / max) * (H - 10)).toFixed(1)}`).join('');
    const tot = h.reduce((s, p) => ({ nasc: s.nasc + p.nasc, mortes: s.mortes + p.mortes, casam: s.casam + p.casam }), { nasc: 0, mortes: 0, casam: 0 });
    return { linha, max, de: h[0]!.ano, ate: h[h.length - 1]!.ano, tot, barras: h.map((p, i) => ({ x: x(i), n: p.nasc, m: p.mortes })) };
  });
  const contagem = $derived.by(() => {
    void vidas.ver;
    if (!sim) return null;
    const v = sim.vivos();
    const adultos = v.filter((p) => sim.adulto(p));
    const profs = new Map<string, number>();
    for (const p of adultos) if (p.prof) profs.set(sim.nomeProf(p), (profs.get(sim.nomeProf(p)) ?? 0) + 1);
    return {
      casados: v.filter((p) => p.conjuge).length / 2, criancas: v.filter((p) => sim.crianca(p)).length, casos: sim.segredos.filter((s) => s.tipo === 'caso' && sim.temVinc(s.sobre[0]!, s.sobre[1]!, 'amantes')).length,
      segredos: sim.segredos.filter((s) => !s.publico).length, profs: [...profs].sort((a, b) => b[1] - a[1]),
    };
  });

  // ------------------------------------------------ mundo
  const AJ: Array<[keyof Ajustes, string]> = [['romance', 'romance'], ['violencia', 'violência'], ['fertilidade', 'fertilidade'], ['mortalidade', 'mortalidade'], ['drama', 'drama (fofoca, descobertas)'], ['social', 'vida social']];
  const EVS: Array<[Efeito['tipo'], string, string]> = [['festa', '🎉 Festa', 'todo mundo se encontra, flerta e bebe'], ['peste', '☠ Peste', 'muita gente adoece'], ['fome', '🌾 Fome', 'menos renda, mais roubo e estresse'], ['guerra', '⚔ Guerra', 'quem sabe lutar vai para o front'], ['fartura', '💰 Fartura', 'mais renda, mais humor']];
  let evLugar = $state<string>('');
  let evMeses = $state(3);
  function novoFigurante() {
    if (!sim) return;
    const cat = catalogo(cadernos.program(world), world.entities);
    const rng = seededRng(sim.t * 7 + sim.todas().length);
    const p = gerarPessoa(rng, cat, { id: sim.novoId(), inicio: sim.t, lugar: sim.cfg.lugar, nomes: { estilo: 'iberico', amostras: [] } });
    p.prof = sim.escolherProf(p);
    p.dinheiro = 20;
    vidas.agir({ c: 'adicionar', pessoa: p });
    sel = p.id;
  }
  const foraDoElenco = $derived.by(() => {
    void vidas.ver;
    if (!sim) return [];
    const ja = new Set(sim.todas().map((p) => p.nota).filter(Boolean));
    return world.entities.filter((e) => e.type === 'personagem' && !ja.has(e.path));
  });
  let fichaNova = $state('');
  function trazerFicha() {
    if (!sim || !fichaNova) return;
    const e = world.entities.find((x) => x.path === fichaNova);
    if (!e) return;
    const p = pessoaDaFicha(e, world, catalogo(cadernos.program(world), world.entities), { inicio: sim.t, lugar: sim.cfg.lugar });
    if (!p) {
      cadernos.say(`${e.name} não está viva em ${sim.data()}.`);
      return;
    }
    vidas.agir({ c: 'adicionar', pessoa: p });
    sel = p.id;
    fichaNova = '';
  }

  // ------------------------------------------------ gravar
  function gravar() {
    const n = vidas.gravarFichas();
    cadernos.say(`${n} ${n === 1 ? 'ficha gravada' : 'fichas gravadas'}: estado de agora, família, laços, genes e a vida contada na seção Registro.`);
  }
  function cronica() {
    const p = vidas.salvarCronica(soMarcos ? 2 : 1);
    if (p) cadernos.say(`Crônica salva em ${p.replace(/\.md$/, '')}.`);
  }
  const decisao = $derived.by(() => { void vidas.ver; return sim?.decisoes[0] ?? null; });
</script>

<div class="vidas">
  {#if !sim}
    {#if sims.length && !criando}
      <section class="lista" in:rise>
        <header>
          <h3>Simulações de {world.name}</h3>
          <button class="primary" onclick={() => (criando = true)}>+ Nova simulação</button>
        </header>
        <div class="sims">
          {#each sims as s (s.path)}
            <div class="simc">
              <button class="abrir" onclick={() => abrir(s.path)}>👥 {s.nome}</button>
              <button class="mini" onclick={() => onOpenNote(s.path)} title="Abrir a nota da simulação">nota</button>
            </div>
          {/each}
        </div>
        {#if vidas.ocupado}<p class="dim small">Refazendo a história…</p>{/if}
      </section>
    {:else}
      <NovaVida {world} oncancel={sims.length ? () => (criando = false) : undefined} />
    {/if}
  {:else}
    <section class="topo">
      <div class="quando">
        <span class="data">{estado?.data}</span>
        <small>{estado?.nome} · começou em {estado?.inicio} · {decorrido} · {estado?.vivos} {estado?.vivos === 1 ? 'vivo' : 'vivos'}</small>
      </div>
      <div class="ctl">
        <button class="go" onclick={() => andar(1)} title="Andar um mês">▶ 1 mês</button>
        <button class="go" onclick={() => andar(12)}>▶▶ 1 ano</button>
        <button class="go" onclick={() => andar(120)}>10 anos</button>
        <button class="go strong" onclick={() => andar(240, true)} title="Anda até o primeiro marco (nascimento, morte, casamento, traição descoberta...) de alguém com ficha ou conduzido por você">⏩ até algo importante</button>
        <span class="play">
          <button class="go" class:on={tocando} onclick={() => (tocando = !tocando)} title="O tempo anda sozinho até você pausar">{tocando ? '⏸ Pausar' : '⏵ Tocar'}</button>
          <select bind:value={ritmo} aria-label="Ritmo">
            <option value={1}>um mês por vez</option><option value={3}>uma estação</option><option value={12}>um ano por vez</option>
          </select>
          <label class="chk" title="Para sozinho num nascimento, morte, casamento ou traição de alguém com ficha"><input type="checkbox" bind:checked={pausarMarcos} /> pausar em marcos</label>
        </span>
      </div>
      <div class="menu">
        <button class="ghost sm" onclick={gravar} title="Grava o estado de agora nas fichas (cria as de quem nasceu)">💾 Gravar nas fichas</button>
        <button class="ghost sm" onclick={cronica}>📜 Salvar crônica</button>
        <button class="ghost sm" onclick={onregras} title="Criar mecânicas novas (traços, profissões, interações, reações)">✎ Mecânicas</button>
        <button class="ghost sm" onclick={() => onOpenNote(vidas.aberta!.path)}>nota</button>
        <button class="ghost sm" onclick={() => { vidas.fechar(); sel = null; }}>fechar</button>
      </div>
      {#if ultimo}<p class="ultimo">{ultimo}</p>{/if}
    </section>

    {#if vidas.aberta?.avisos.length}<div class="aviso">{#each vidas.aberta.avisos as a (a)}<p>⚠ {a}</p>{/each}</div>{/if}
    {#if estado?.issues.length}
      <div class="erro">
        <p><b>Erros nas regras durante a simulação</b> <button class="mini" onclick={onregras}>ver regras</button></p>
        {#each estado.issues.slice(-4) as i, k (k)}<p>{i.path.split('/').pop()?.replace(/\.md$/, '')}{i.line ? `:${i.line}` : ''} · {i.message}</p>{/each}
      </div>
    {/if}

    {#if decisao}
      <div class="decisao" in:rise>
        <p class="q">🎮 <b>{sim.pessoa(decisao.pessoa)?.nome}</b> precisa decidir</p>
        <p>{decisao.texto}</p>
        <div class="ops">
          {#each decisao.opcoes as o (o.id)}<button class:primary={o.id !== 'auto'} class:ghost={o.id === 'auto'} onclick={() => vidas.agir({ c: 'decidir', id: decisao.id, opcao: o.id })}>{o.rotulo}</button>{/each}
        </div>
      </div>
    {/if}

    <div class="corpo" class:comsel={!!sel && tres} bind:clientWidth={largura}>
      <aside class="elenco">
        <input class="busca" bind:value={busca} placeholder="Buscar pessoa ou profissão" />
        <ul>
          {#each gente as g (g.p.id)}
            <li>
              <button class:on={sel === g.p.id} class:dead={g.p.morte !== null} onclick={() => (sel = sel === g.p.id ? null : g.p.id)}>
                <span class="nm">{g.p.conduzido ? '🎮 ' : ''}{g.p.nome}</span>
                <small>{g.idade}{g.p.especie ? ` · ${sim.criatura(g.p) ? '🐾 ' : ''}${sim.especieNome(g.p)}` : ''}{g.p.prof ? ` · ${sim.nomeProf(g.p)}` : ''}{g.par ? (g.p.conjuge ? ' · ♥' : ' · ♡') : ''}{g.amantes ? ' · 🤫' : ''}{g.p.gravidez ? ' · 🤰' : ''}{g.p.morte === null && g.onde === null ? ' · 🐎' : ''}{g.p.estados['enlutado'] ? ' · 🖤' : ''}{g.p.nota ? '' : ' ·  figurante'}</small>
              </button>
            </li>
          {/each}
        </ul>
        <label class="chk"><input type="checkbox" bind:checked={mostrarMortos} /> mostrar quem morreu</label>
        <div class="add">
          <button class="mini" onclick={novoFigurante}>+ figurante</button>
          {#if foraDoElenco.length}
            <select bind:value={fichaNova} onchange={trazerFicha} aria-label="Trazer uma ficha">
              <option value="">+ ficha…</option>
              {#each foraDoElenco as e (e.path)}<option value={e.path}>{e.name}</option>{/each}
            </select>
          {/if}
        </div>
      </aside>

      <div class="centro">
        {#if sel && !tres && sim.pessoa(sel)}
          <PessoaPainel {sim} id={sel} onselect={(id) => (sel = id)} onopen={onOpenNote} onclose={() => (sel = null)} />
        {/if}
        <nav class="abas">
          {#each [['cronica', 'Crônica'], ['teia', 'Teia'], ['numeros', 'Números'], ...(estado?.reliquias.length ? [['reliquias', 'Relíquias']] : []), ['mundo', 'Mundo e ajustes']] as [k, l] (k)}
            <button class:on={aba === k} onclick={() => (aba = k as typeof aba)}>{l}</button>
          {/each}
        </nav>

        {#if aba === 'cronica'}
          <div class="filtros">
            {#each CATS as [c, l] (c)}
              <button class:on={cats.has(c)} onclick={() => { const s = new Set(cats); if (s.has(c)) s.delete(c); else s.add(c); cats = s; }}>{l}</button>
            {/each}
            <label class="chk"><input type="checkbox" bind:checked={soMarcos} /> só o notável</label>
            <label class="chk"><input type="checkbox" bind:checked={segredos} /> 🤫 segredos</label>
            {#if sel}<label class="chk"><input type="checkbox" bind:checked={soSel} /> só {sim.pessoa(sel)?.nome.split(' ')[0]}</label>{/if}
          </div>
          <ol class="cron">
            {#each eventos as g (g.ano)}
              <li>
                <span class="ano">{g.ano}</span>
                <div class="evs">
                  {#each g.ev as e, j (j)}
                    <div class="ev c-{e.cat}" class:marco={e.peso >= 3} class:segredo={e.segredo}>
                      <span class="ic">{ICON[e.cat]}</span>
                      <span class="tx"><small>{sim.data(e.t).split(' ')[0]}</small> <LinkText text={e.texto} color={corDe} onlink={link} /></span>
                    </div>
                  {/each}
                </div>
              </li>
            {:else}
              <li class="dim">Nada ainda. Ande no tempo: ▶ 1 mês, 1 ano, ou até algo importante.</li>
            {/each}
          </ol>
        {:else if aba === 'teia'}
          {#if teia.nodes.length}
            <div class="teia">
              <Graph nodes={teia.nodes} edges={teia.edges} selected={teiaSel} onselect={(id) => { teiaSel = id; if (id) sel = id; }} onopen={(id) => (sel = id)} />
            </div>
            <p class="dim small">Laranja: suas fichas · cinza: figurantes · vermelho: conduzidos por você. Ligações: casamento, namoro, casos, amizades, rivalidades e filhos.</p>
          {:else}<p class="dim">Ninguém vivo.</p>{/if}
        {:else if aba === 'numeros'}
          {#if grafico}
            <section class="graf">
              <h4>População de {grafico.de} a {grafico.ate}</h4>
              <svg viewBox="0 0 {W} {H}" role="img" aria-label="População ao longo dos anos">
                {#each grafico.barras as b, i (i)}
                  {#if b.n}<rect x={b.x - 2} y={H - b.n * 8} width="3" height={b.n * 8} class="nasc" />{/if}
                  {#if b.m}<rect x={b.x + 1} y={H - b.m * 8} width="3" height={b.m * 8} class="mort" />{/if}
                {/each}
                <path d={grafico.linha} class="pop" />
              </svg>
              <p class="dim small">linha: vivos (máx. {grafico.max}) · barras: <span class="nasc-t">nascimentos ({grafico.tot.nasc})</span> e <span class="mort-t">mortes ({grafico.tot.mortes})</span> por ano · {grafico.tot.casam} casamentos</p>
            </section>
          {:else}<p class="dim">Os números aparecem depois do primeiro ano.</p>{/if}
          {#if contagem}
            <div class="cards">
              <div><b>{contagem.casados}</b><small>casais</small></div>
              <div><b>{contagem.criancas}</b><small>crianças</small></div>
              <div><b>{contagem.casos}</b><small>casos em andamento 🤫</small></div>
              <div><b>{contagem.segredos}</b><small>segredos guardados</small></div>
            </div>
            {#if contagem.profs.length}<p class="profs">{#each contagem.profs as [n, c] (n)}<span>{n} <b>{c}</b></span>{/each}</p>{/if}
          {/if}
        {:else if aba === 'reliquias'}
          <section class="relq">
            {#each estado?.reliquias ?? [] as r (r.item.id)}
              <details class="rq">
                <summary>
                  <b>★ {r.item.nome}</b>
                  <span class="dim">{r.item.tipo}{r.item.raridade ? ` · ${r.item.raridade}` : ''} · 🪙 {r.item.valor}</span>
                  <span class="onde">
                    {#if r.destruido}destruído
                    {:else if r.dono}com <button class="lk" onclick={() => (sel = r.dono!.id)}>{r.dono.nome}</button>
                    {:else if r.lugar}largado em {sim.lugarNome(r.lugar)}
                    {:else}fora da história{/if}
                  </span>
                </summary>
                {#if r.item.desc}<p class="dim small">{r.item.desc}</p>{/if}
                <ol class="hist">
                  {#each r.historia as h, i (i)}
                    <li><small>{sim.data(h.t)}</small> {({ inicio: 'começa com', heranca: 'herdado por', roubo: 'roubado por', achou: 'achado por', voce: 'dado a', regra: 'passa a', largado: 'largado em', morte: 'esquecido em', destruido: 'destruído', presente: 'presente para' } as Record<string, string>)[h.como] ?? h.como}
                      {#if h.dono}<button class="lk" onclick={() => (sel = h.dono!)}>{sim.pessoa(h.dono)?.nome ?? h.dono}</button>{:else if h.lugar} {sim.lugarNome(h.lugar)}{/if}</li>
                  {/each}
                </ol>
              </details>
            {/each}
            <p class="dim small">Itens únicos passam por herança, roubo e achados. Dê ou tire itens no painel de cada pessoa; crie itens na aba Regras (🗡 Item) ou com fichas tipo: item.</p>
          </section>
        {:else}
          <section class="mundo">
            {#if meusEventos.length}
              <h4>Eventos do seu mundo</h4>
              <div class="evbtns">
                {#each meusEventos as e (e.id)}<button class="ghost" onclick={() => vidas.agir({ c: 'mundo', id: e.id, lugar: evLugar || null })} title={e.desc}>✦ {e.name}<small>{e.desc || `${e.months} ${e.months === 1 ? 'mês' : 'meses'}${e.global ? ', no mundo todo' : ''}`}</small></button>{/each}
              </div>
              {#if estado?.eventosAtivos.length}<p class="dim small">Agora: {estado.eventosAtivos.join(' · ')}</p>{/if}
            {/if}
            <h4>Acontecimentos</h4>
            <div class="row">
              <select bind:value={evLugar}>
                <option value="">em todo lugar</option>
                {#each estado?.lugares ?? [] as [k, n] (k)}<option value={k}>{n}</option>{/each}
              </select>
              <label class="chk">por <input type="number" min="1" max="60" bind:value={evMeses} /> meses</label>
            </div>
            <div class="evbtns">
              {#each EVS as [t, l, d] (t)}<button class="ghost" onclick={() => vidas.agir({ c: 'evento', tipo: t, lugar: evLugar || null, meses: evMeses })} title={d}>{l}<small>{d}</small></button>{/each}
            </div>
            {#if estado?.efeitos.length}<p class="dim small">Agora: {estado.efeitos.join(' · ')}</p>{/if}
            <h4>Ajustes do mundo</h4>
            <div class="ajustes">
              {#each AJ as [k, l] (k)}
                <label>{l} <span class="val">×{(estado?.ajustes[k] ?? 1).toFixed(1)}</span>
                  <input type="range" min="0" max="3" step="0.1" value={estado?.ajustes[k] ?? 1} onchange={(e) => vidas.agir({ c: 'ajuste', k, v: Number((e.currentTarget as HTMLInputElement).value) })} />
                </label>
              {/each}
            </div>
            <p class="dim small">Tudo o que você faz aqui (e no painel de cada pessoa) fica no registro da simulação: reabrir a nota refaz a mesma história.</p>
          </section>
        {/if}
      </div>

      {#if sel && tres && sim.pessoa(sel)}
        <PessoaPainel {sim} id={sel} onselect={(id) => (sel = id)} onopen={onOpenNote} onclose={() => (sel = null)} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .vidas { display: grid; gap: 12px; padding-bottom: 40px; }
  h3, h4 { margin: 0 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .lista { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; display: grid; gap: 10px; }
  .lista header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .sims { display: flex; flex-wrap: wrap; gap: 8px; }
  .simc { display: flex; gap: 4px; align-items: center; }
  .abrir { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 10px; padding: 8px 14px; font: 600 13.5px var(--f-display); }
  .abrir:hover { border-color: var(--ember); }
  .topo { border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center;
    background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--ember) 10%, var(--surface)), var(--surface) 60%); }
  .quando { display: grid; }
  .data { font: 600 24px var(--f-display); color: var(--ember-soft); letter-spacing: .02em; }
  .quando small { color: var(--muted); font-size: 12px; }
  .ctl, .menu { display: flex; gap: 6px; flex-wrap: wrap; }
  .menu { margin-left: auto; }
  .go { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 9px; padding: 6px 11px; font: 600 12.5px var(--f-display); }
  .go:hover { border-color: var(--ember); }
  .go.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 18%, var(--surface-2)); }
  .play { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .play select { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 4px 6px; font-size: 12px; }
  .relq { display: grid; gap: 6px; }
  .rq { border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px; background: var(--surface-2); }
  .rq summary { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; cursor: pointer; font-size: 13px; }
  .rq .onde { margin-left: auto; font-size: 12.5px; }
  .hist { margin: 6px 0 2px; padding-left: 18px; display: grid; gap: 2px; font-size: 12.5px; }
  .hist small { color: var(--muted); font-family: var(--f-mono); margin-right: 4px; }
  .lk { border: 0; background: none; color: var(--ink); padding: 0 2px; box-shadow: inset 0 -1px 0 var(--ember); font: inherit; }
  .go.strong { background: var(--ember); color: var(--on-ember); border-color: transparent; }
  .ultimo { flex-basis: 100%; margin: 0; font-size: 12.5px; color: var(--muted); }
  .aviso { border: 1px solid color-mix(in srgb, #ffc08a 50%, var(--line)); border-radius: 12px; padding: 6px 12px; font-size: 12.5px; }
  .aviso p, .erro p { margin: 2px 0; }
  .erro { border: 1px solid color-mix(in srgb, var(--crit) 45%, var(--line)); border-radius: 12px; padding: 6px 12px; font-size: 12.5px; color: var(--crit); }
  .decisao { border: 2px solid var(--ember); border-radius: 14px; padding: 12px 16px; background: color-mix(in srgb, var(--ember) 8%, var(--surface)); display: grid; gap: 6px; }
  .decisao p { margin: 0; }
  .decisao .q { font-size: 14px; }
  .ops { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .corpo { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 12px; align-items: start; }
  .corpo.comsel { grid-template-columns: 200px minmax(0, 1fr) minmax(300px, 360px); }
  .elenco { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 8px; display: grid; gap: 6px; position: sticky; top: 8px; max-height: calc(100vh - 120px); overflow: hidden; grid-template-rows: auto 1fr auto auto; }
  .busca { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 5px 8px; font-size: 12.5px; }
  .elenco ul { list-style: none; margin: 0; padding: 0; overflow-y: auto; display: grid; gap: 2px; align-content: start; }
  .elenco li button { width: 100%; text-align: left; border: 1px solid transparent; background: none; color: var(--ink); border-radius: 8px; padding: 4px 6px; display: grid; }
  .elenco li button:hover { background: var(--surface-2); }
  .elenco li button.on { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .elenco li button.dead { opacity: .5; }
  .nm { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .elenco small { color: var(--muted); font-size: 11px; }
  .add { display: flex; gap: 4px; flex-wrap: wrap; }
  .add select { background: var(--void); border: 1px dashed var(--line); border-radius: 7px; color: var(--muted); font-size: 12px; padding: 2px 6px; max-width: 120px; }
  .centro { display: grid; gap: 10px; min-width: 0; }
  .abas { display: flex; gap: 4px; flex-wrap: wrap; }
  .abas button { border: 0; background: none; color: var(--muted); padding: 4px 10px; border-radius: 8px; font: 600 12.5px var(--f-display); }
  .abas button.on { color: var(--ink); background: var(--surface-2); }
  .filtros { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  .filtros button { border: 1px solid var(--line); background: none; color: var(--muted); border-radius: 999px; padding: 2px 9px; font-size: 11.5px; }
  .filtros button.on { color: var(--ink); background: var(--surface-2); }
  .chk { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; color: var(--muted); }
  .chk input[type='number'] { width: 56px; }
  .cron { list-style: none; margin: 0; padding: 0; position: relative; }
  .cron::before { content: ''; position: absolute; left: 46px; top: 4px; bottom: 4px; width: 1px; background: linear-gradient(var(--ember), var(--line)); }
  .cron > li { display: grid; grid-template-columns: 40px 1fr; gap: 16px; padding: 4px 0; }
  .cron > li.dim { display: block; padding-left: 62px; font-size: 13px; }
  .ano { text-align: right; font: 600 12.5px var(--f-mono); color: var(--ember-soft); padding-top: 4px; }
  .evs { display: grid; gap: 3px; }
  .ev { display: grid; grid-template-columns: 22px 1fr; gap: 6px; padding: 4px 8px; border-radius: 9px; font-size: 13.5px; line-height: 1.5; border: 1px solid transparent; }
  .ev:hover { background: var(--surface); border-color: var(--line); }
  .ev.marco { background: color-mix(in srgb, var(--ember) 7%, transparent); }
  .ev.segredo { background: repeating-linear-gradient(-45deg, transparent 0 8px, color-mix(in srgb, #b59cff 6%, transparent) 8px 16px); }
  .ev.c-morte { background: color-mix(in srgb, var(--muted) 10%, transparent); }
  .ev.c-voce { color: var(--muted); font-style: italic; }
  .ev .tx small { color: var(--muted); font: 10.5px var(--f-mono); }
  .ic { text-align: center; }
  .teia { height: min(560px, 65vh); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; position: relative; }
  .graf { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 10px 14px; }
  svg { width: 100%; height: 120px; display: block; overflow: visible; }
  .pop { fill: none; stroke: var(--ember); stroke-width: 2.2; stroke-linejoin: round; }
  .nasc { fill: color-mix(in srgb, #7fd1a8 70%, transparent); }
  .mort { fill: color-mix(in srgb, #ff6b6b 60%, transparent); }
  .nasc-t { color: #7fd1a8; }
  .mort-t { color: #ff6b6b; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
  .cards div { border: 1px solid var(--line); border-radius: 12px; padding: 8px 12px; display: grid; background: var(--surface); }
  .cards b { font: 600 22px var(--f-display); color: var(--ember-soft); }
  .cards small { color: var(--muted); font-size: 12px; }
  .profs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: var(--muted); }
  .profs span { border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; }
  .profs b { color: var(--ink); }
  .mundo { display: grid; gap: 10px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .evbtns { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
  .evbtns button { display: grid; text-align: left; gap: 2px; }
  .evbtns small { color: var(--muted); font-size: 11.5px; }
  .ajustes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 16px; }
  .ajustes label { display: grid; gap: 3px; font-size: 12.5px; color: var(--muted); }
  .val { color: var(--ember-soft); font: 11.5px var(--f-mono); }
  input[type='range'] { accent-color: var(--ember); }
  select, input[type='number'] { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 4px 8px; font-size: 12.5px; }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  .mini { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 7px; padding: 2px 8px; font-size: 12px; }
  .mini:hover { border-color: var(--ember); }
  .primary { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 6px 12px; background: var(--surface-2); color: var(--ink); }
  .ghost:hover { border-color: var(--ember); }
  .ghost.sm { padding: 4px 9px; font-size: 12px; }
  @media (max-width: 720px) {
    .corpo, .corpo.comsel { grid-template-columns: 1fr; }
    .elenco { position: static; max-height: 280px; }
    .menu { margin-left: 0; }
  }
</style>
