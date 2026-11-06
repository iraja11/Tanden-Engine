<script lang="ts">
  import { BIG5_NAMES, ESTADOS_VIDA, HABILIDADES, TONS_VIDA, genomaTexto, type Comando, type Meta, type Relacao, type Vidas } from '@tanden/core';
  import { rise } from '../../../motion';
  import LinkText from '../LinkText.svelte';
  import { vidas } from './vidas.svelte';

  // Tudo sobre uma pessoa da simulação, e o que dá para fazer com ela.
  let { sim, id, onselect, onopen, onclose }: { sim: Vidas; id: string; onselect: (id: string) => void; onopen: (notePath: string) => void; onclose?: () => void } = $props();

  // cópia rasa a cada mudança: o motor não é reativo, a cópia nova avisa a tela
  const p = $derived.by(() => {
    void vidas.ver;
    const x = sim.pessoa(id);
    return x ? { ...x, tracos: [...x.tracos], big5: [...x.big5] as typeof x.big5, hab: { ...x.hab }, estados: { ...x.estados } } : null;
  });
  const viva = $derived(!!p && p.morte === null);
  const info = $derived.by(() => {
    void vidas.ver;
    if (!p) return null;
    const pai = p.paiOficial ?? p.pais[1];
    return {
      idade: sim.idade(p),
      ap: sim.aparencia(p),
      at: sim.atrib(p),
      onde: sim.ondeEsta(p),
      par: sim.parceiro(p),
      rel: sim.relacoes(p.id, 24),
      seg: sim.segredosDe(p.id),
      mae: p.pais[0],
      pai,
      bio: p.paiOficial && p.pais[1] ? p.pais[1] : null,
      filhos: sim.filhosOficiais(p.id),
      irmaos: sim.irmaos(p.id),
      ev: sim.eventos.filter((e) => e.quem.includes(p.id)).slice(-12).reverse(),
      especie: sim.especieNome(p),
      criatura: sim.criatura(p),
      atributos: [...sim.cat.atributos.values()].map((a) => ({ ...a, v: Number(p.campos[a.id] ?? a.media) })),
      tramas: sim.tramas(p.id),
      itens: sim.itensDe(p),
    };
  });
  const nome = (x: string | null | undefined) => (x ? sim.pessoa(x)?.nome ?? x.split('/').pop()!.replace(/\.md$/, '') : '—');
  const cmd = (c: Comando) => vidas.agir(c);

  const CAT_COR: Record<string, string> = { personalidade: '#7fb6ff', adquirido: '#ffc08a', congenito: '#b59cff', marca: '#c8c7cf', reputacao: '#ff6b6b' };
  const META: Record<Meta['tipo'], string> = {
    amor: 'encontrar um amor', familia: 'ter uma família', riqueza: 'ficar rico', vinganca: 'vingança', fama: 'ficar famoso', paz: 'viver em paz', conquistar: 'conquistar', saber: 'aprender tudo',
  };
  const VINC: Record<string, string> = { namoro: '♥ namoro', noivado: '💍 noivado', amantes: '🤫 amantes', amigos: '🤝 amigos', rivais: '⚡ rivais', inimigos: '⚔ inimigos', ex: 'ex' };
  /** nome do vínculo para mostrar: os de fábrica, ou os do mundo (com símbolo e papel) */
  function vincNome(v: string, outro: string): string {
    if (VINC[v]) return VINC[v]!;
    const d = sim.cat.vinculos.get(v);
    if (!d) return v;
    const papel = d.papeis ? sim.papel(outro, id, v) : null;
    return `${d.simbolo ? `${d.simbolo} ` : ''}${d.secreto ? '🤫 ' : ''}${papel ?? d.nome.toLowerCase()}`;
  }
  const VINC_EDIT = $derived([
    { id: 'casados', nome: '♥ casados' }, { id: 'namoro', nome: '♥ namoro' }, { id: 'noivado', nome: '💍 noivado' }, { id: 'amantes', nome: '🤫 amantes' },
    { id: 'amigos', nome: '🤝 amigos' }, { id: 'rivais', nome: '⚡ rivais' }, { id: 'inimigos', nome: '⚔ inimigos' },
    ...[...sim.cat.vinculos.values()].map((v) => ({ id: v.id, nome: `${v.simbolo ? `${v.simbolo} ` : ''}${v.nome}${v.papeis ? ` (${p?.nome.split(' ')[0]} é ${v.papeis[0]})` : ''}` })),
  ]);
  const temV = (v: string) => { void vidas.ver; return v === 'casados' ? p?.conjuge === alvo : sim.temVinc(id, alvo, v); };
  let acaso = $state('');
  const acasos = $derived.by(() => { void vidas.ver; return p && viva ? [...sim.acontecimentosPara(p.id, null), ...sim.acontecimentosPara(p.id, alvo || null)] : []; });
  const TOMI = Object.fromEntries(TONS_VIDA.map((t) => [t.id, t.icone])) as Record<string, string>;

  // ------------------------------------------------ influência
  let alvo = $state('');
  let acao = $state('conversar');
  let garantir = $state(false);
  let sussurro = $state<'paixao' | 'odio' | 'amizade' | 'desconfianca' | 'respeito' | 'inveja'>('paixao');
  let eixo = $state<'afeto' | 'atracao' | 'confianca' | 'respeito' | 'intimidade'>('afeto');
  let valor = $state(0);
  let novoTraco = $state('');
  let destino = $state('');
  let metaTipo = $state<Meta['tipo'] | ''>('');
  let painel = $state<'agir' | 'sussurrar' | 'relacao' | 'vida'>('agir');

  const outros = $derived.by(() => {
    void vidas.ver;
    if (!p) return [];
    const perto = new Set(sim.aoRedor(p));
    return sim.vivos().filter((x) => x.id !== p.id).map((x) => ({ id: x.id, nome: x.nome, perto: perto.has(x.id) }))
      .sort((a, b) => Number(b.perto) - Number(a.perto) || a.nome.localeCompare(b.nome, 'pt-BR'));
  });
  $effect(() => { if (outros.length && !outros.some((o) => o.id === alvo)) alvo = outros[0]!.id; });
  const acoes = $derived.by(() => { void vidas.ver; return p && viva ? sim.interacoesPara(p.id, alvo || null) : []; });
  const sozinho = $derived.by(() => { void vidas.ver; return p && viva ? sim.interacoesPara(p.id, null) : []; });
  $effect(() => {
    const v = sim.visao(id, alvo);
    valor = Math.round(eixo === 'atracao' ? sim.atracao(id, alvo) : eixo === 'intimidade' ? sim.intimidade(id, alvo) : v[eixo]);
  });
  const tracosDisp = $derived([...sim.cat.tracos.values()].filter((t) => !p?.tracos.includes(t.id)).sort((a, b) => a.m.localeCompare(b.m, 'pt-BR')));

  function fazer(i: string, b: string | null) {
    if (!p) return;
    cmd({ c: 'agir', a: p.id, b, i, ...(garantir ? { garantir: true } : {}) });
  }
  const bar = (v: number, lo = 0, hi = 100) => `${Math.round(((v - lo) / (hi - lo)) * 100)}%`;
  const cor = (o: number) => (o > 30 ? 'var(--ok, #7fd1a8)' : o < -30 ? 'var(--crit, #ff6b6b)' : 'var(--muted)');
  let aberta = $state<string | null>(null);
  const memTexto = (r: Relacao) => r.mem.map((m) => `${m.o} (${m.v > 0 ? '+' : ''}${Math.round(m.v)}, ${sim.data(m.t)})`).join(' · ');
</script>

{#if p && info}
  <aside class="pessoa" in:rise={{ y: 6 }}>
    <header>
      <div>
        <h3>{p.nome}{#if !viva}<span class="morto"> ✝</span>{/if}</h3>
        <p class="sub">
          {p.sexo === 'f' ? '♀' : '♂'} {info.idade} {info.idade === 1 ? 'ano' : 'anos'}{p.prof ? ` · ${sim.nomeProf(p)}` : ''}
          · {viva ? (info.onde === null ? 'na estrada' : `em ${sim.lugarNome(info.onde)}`) : `morreu ${p.causa ?? ''} em ${sim.data(p.morte!)}`}
          {#if p.orientacao !== 'hetero'} · {({ homo: 'homo', bi: 'bi', ace: 'assexual', hetero: '' })[p.orientacao]}{/if}
          {#if p.casa} · casa {p.casa}{/if}
          {#if sim.etniaNome(p)} · povo {sim.etniaNome(p)}{/if}
          {#if sim.guerras.faccaoDe(p)} · ⚑ {sim.guerras.faccaoDe(p)!.nome}{#if sim.guerras.vivas().some((f) => f.lider === p.id)} 👑{/if}{/if}
        </p>
      </div>
      <div class="hacts">
        {#if p.nota}<button class="mini" onclick={() => onopen(p.nota!)} title="Abrir a ficha">📄 ficha</button>{:else}<span class="tag">figurante</span>{/if}
        {#if onclose}<button class="mini" onclick={onclose} title="Fechar" aria-label="Fechar">✕</button>{/if}
      </div>
    </header>

    {#if viva}
      <div class="flags">
        <button class="flag" class:on={p.conduzido} onclick={() => cmd({ c: 'conduzir', p: p.id, on: !p.conduzido })} title="Você decide o romance e as brigas desta pessoa; propostas a ela viram decisões suas">🎮 {p.conduzido ? 'Conduzida por você' : 'Conduzir'}</button>
        <button class="flag" class:on={p.protegido} onclick={() => cmd({ c: 'proteger', p: p.id, on: !p.protegido })} title="Não morre por acaso (doença, parto, briga, velhice)">🛡 {p.protegido ? 'Protegida' : 'Proteger'}</button>
      </div>

      <div class="bars">
        <div><span>saúde</span><i><b style:width={bar(p.saude)} style:--c="var(--ok, #7fd1a8)"></b></i><small>{Math.round(p.saude)}</small></div>
        <div><span>humor</span><i><b style:width={bar(p.humor, -100, 100)} style:--c={p.humor >= 0 ? '#ffc08a' : '#7fb6ff'}></b></i><small>{Math.round(p.humor)}</small></div>
        <div><span>estresse</span><i><b style:width={bar(p.estresse)} style:--c="var(--crit, #ff6b6b)"></b></i><small>{Math.round(p.estresse)}</small></div>
        <div><span>dinheiro</span><small class="coin">🪙 {Math.round(p.dinheiro)}</small></div>
      </div>
      <p class="meta">🎯 {p.meta ? `${META[p.meta.tipo]}${p.meta.alvo ? `: ${nome(p.meta.alvo)}` : ''}` : 'sem meta ainda'}{#if p.gravidez} · 🤰 grávida há {sim.t - p.gravidez.desde} {sim.t - p.gravidez.desde === 1 ? 'mês' : 'meses'}{/if}
        {#each Object.keys(p.estados) as e (e)}{#if e !== 'bebado' && e !== 'brigou' && (p.estados[e] ?? 0) >= sim.t} · {ESTADOS_VIDA[e] ? `${ESTADOS_VIDA[e].icone} ${ESTADOS_VIDA[e].nome}` : e}{/if}{/each}
        {#if sim.guerras.front(p)} · ⚔ no front ({sim.guerras.front(p)!.nome}){/if}</p>
    {/if}

    <section>
      <h4>Traços</h4>
      <div class="chips">
        {#each p.tracos as t (t)}
          {@const tr = sim.cat.tracos.get(t)}
          <span class="chip" style:--c={CAT_COR[tr?.cat ?? 'personalidade']} title={tr?.desc ?? ''}>{sim.nomeTraco(p, t)}{#if tr?.oculto} 🤫{/if}
            {#if viva}<button class="x" onclick={() => cmd({ c: 'traco', p: p.id, del: t })} aria-label="Tirar traço">×</button>{/if}</span>
        {/each}
        {#if viva}
          <select class="add" bind:value={novoTraco} onchange={() => { if (novoTraco) { cmd({ c: 'traco', p: p.id, add: novoTraco }); novoTraco = ''; } }} aria-label="Dar um traço">
            <option value="">+ traço</option>
            {#each tracosDisp as t (t.id)}<option value={t.id}>{p.genero === 'f' ? t.f : t.m}</option>{/each}
          </select>
        {/if}
      </div>
      {#if p.gostos.length}<p class="gostos">♡ gosta de {p.gostos.join(', ')}</p>{/if}
    </section>

    {#if info.itens.length || (viva && sim.cat.itens.size)}
      <section>
        <h4>Itens</h4>
        <div class="chips">
          {#each info.itens as it, i (i)}
            <span class="chip item" class:unico={it.unico} style:--c={it.unico ? "#e6c86e" : "#c8c7cf"} title={[it.desc, Object.entries(it.mods).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')].filter(Boolean).join(' · ')}>
              {it.unico ? '★ ' : ''}{it.nome}
              {#if viva}<button class="x" onclick={() => cmd({ c: 'item', p: p.id, item: it.id, on: false })} aria-label="Tirar item">×</button>{/if}
            </span>
          {/each}
          {#if viva}
            <select class="add" value="" onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) cmd({ c: 'item', p: p.id, item: v, on: true }); (e.currentTarget as HTMLSelectElement).value = ''; }} aria-label="Dar um item">
              <option value="">+ item</option>
              {#each [...sim.cat.itens.values()] as it (it.id)}<option value={it.id}>{it.unico ? '★ ' : ''}{it.nome}{it.unico && sim.donoDe(it.id) ? ` (com ${sim.donoDe(it.id)!.nome})` : ''}</option>{/each}
            </select>
          {/if}
        </div>
      </section>
    {/if}

    {#if info.atributos.length}
      <section>
        <h4>Atributos</h4>
        {#each info.atributos as a (a.id)}
          <div class="mbar" title={a.desc || a.cat}><span>{a.nome}</span><i><b style:width={bar(a.v, a.min, a.max)}></b></i><small>{Math.round(a.v * 10) / 10}</small></div>
        {/each}
      </section>
    {/if}

    {#if info.tramas.length}
      <section>
        <h4>Tramas em andamento</h4>
        <ul class="tramas">
          {#each info.tramas as t, i (i)}
            <li>
              <b>{t.nome}</b>
              {#if t.quem.length > 1}<span class="dim">{t.quem[0] === p.id ? 'contra' : 'de'} <button class="lk" onclick={() => onselect(t.quem[0] === p.id ? t.quem[1]! : t.quem[0]!)}>{nome(t.quem[0] === p.id ? t.quem[1] : t.quem[0])}</button></span>{/if}
              <span class="passos">{#each { length: t.passos } as _, k (k)}<i class:feito={k < t.passo - 1} class:agora={k === t.passo - 1}></i>{/each}</span>
              <small class="dim">{t.etapa} · há {t.meses} {t.meses === 1 ? 'mês' : 'meses'}</small>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="two">
      <div>
        <h4>Temperamento</h4>
        {#each BIG5_NAMES as n, i (n)}<div class="mbar"><span>{n}</span><i><b style:width={bar(p.big5[i]!)}></b></i></div>{/each}
      </div>
      <div>
        <h4>Habilidades</h4>
        {#each HABILIDADES as h (h.id)}<div class="mbar"><span>{h.nome}</span><i><b style:width={bar(p.hab[h.id], 0, 20)}></b></i><small>{Math.round(p.hab[h.id])}</small></div>{/each}
      </div>
    </section>

    <details>
      <summary>{info.criatura ? '🐾 ' : ''}{info.especie} · olhos {info.ap.olhos}, cabelo {info.ap.cabelo}, {info.ap.altura} cm</summary>
      <p class="dim small">força {Math.round(info.at.forca * 100)} · agilidade {Math.round(info.at.agilidade * 100)} · intelecto {Math.round(info.at.intelecto * 100)} · beleza {Math.round(info.at.beleza * 100)} · fertilidade {Math.round(sim.fertil(p) * 100)}</p>
      <code class="genes">{genomaTexto(p.genes)}</code>
      <p class="dim small">Letras: olhos C castanho &gt; V verde &gt; A azul; cabelo E escuro &gt; L loiro &gt; R ruivo. Números: os dois alelos (0–100). "sangue s" é o alelo da doença recessiva.</p>
    </details>

    <section>
      <h4>Família</h4>
      <div class="fam">
        <span>mãe <button class="lk" onclick={() => info.mae && onselect(info.mae)} disabled={!info.mae || !sim.pessoa(info.mae)}>{nome(info.mae)}</button></span>
        <span>pai <button class="lk" onclick={() => info.pai && onselect(info.pai)} disabled={!info.pai || !sim.pessoa(info.pai)}>{nome(info.pai)}</button>
          {#if info.bio}<button class="lk secret" onclick={() => onselect(info.bio!)} title="Pai biológico (segredo)">🤫 de verdade: {nome(info.bio)}</button>{/if}</span>
        {#if p.conjuge}<span>{sim.g(sim.pessoa(p.conjuge) ?? p, 'marido', 'esposa')} <button class="lk" onclick={() => onselect(p.conjuge!)}>{nome(p.conjuge)}</button></span>
        {:else if info.par}<span>par <button class="lk" onclick={() => onselect(info.par!.id)}>{info.par.nome}</button></span>{/if}
        {#if info.filhos.length}<span>filhos {#each info.filhos as f (f.id)}<button class="lk" class:dead={f.morte !== null} onclick={() => onselect(f.id)}>{f.nome}</button>{/each}</span>{/if}
        {#if info.irmaos.length}<span>irmãos {#each info.irmaos as f (f.id)}<button class="lk" class:dead={f.morte !== null} onclick={() => onselect(f.id)}>{f.nome}</button>{/each}</span>{/if}
      </div>
    </section>

    <section>
      <h4>Relações <small>como {p.nome.split(' ')[0]} vê cada um</small></h4>
      <ul class="rels">
        {#each info.rel as r (r.id)}
          {@const o = sim.pessoa(r.id)}
          <li class:dead={o?.morte !== null}>
            <button class="rn" onclick={() => onselect(r.id)}>{o?.nome ?? r.id}</button>
            <span class="op" title="Opinião, de −100 a 100"><i style:left="50%" style:width={`${Math.abs(r.opiniao) / 2}%`} style:transform={r.opiniao < 0 ? 'translateX(-100%)' : 'none'} style:--c={cor(r.opiniao)}></i></span>
            <small class="num" style:color={cor(r.opiniao)}>{r.opiniao > 0 ? '+' : ''}{r.opiniao}</small>
            <span class="tags">
              {#if r.parentesco}<em>{r.parentesco}</em>{/if}
              {#each r.vinculos as v (v)}{#if v !== 'ex' || r.vinculos.length === 1}<em>{vincNome(v, r.id)}</em>{/if}{/each}
              {#if r.atracao > 40}<em title="Atração">🔥{r.atracao}</em>{/if}
              {#if r.mem.length}<button class="mem" onclick={() => (aberta = aberta === r.id ? null : r.id)} title="Memórias">💭{r.mem.length}</button>{/if}
            </span>
            {#if aberta === r.id}<p class="mems">afeto {r.afeto} · confiança {r.confianca} · respeito {r.respeito} · intimidade {r.intimidade}<br />{memTexto(r)}</p>{/if}
          </li>
        {:else}<li class="dim small">Ainda não conhece ninguém direito.</li>{/each}
      </ul>
    </section>

    {#if info.seg.length}
      <section>
        <h4>Segredos</h4>
        {#each info.seg as s (s.id)}
          <p class="seg">🤫 {s.tipo === 'caso' ? 'caso de' : s.tipo === 'paternidade' ? 'paternidade de' : s.tipo === 'assassinato' ? 'assassinato:' : 'roubo:'} {s.sobre.map(nome).join(s.tipo === 'caso' ? ' e ' : ' · ')}
            <small>{s.publico ? 'todo mundo sabe' : `${s.sabem.length} ${s.sabem.length === 1 ? 'sabe' : 'sabem'}`}{s.sabem.includes(p.id) && !s.sobre.includes(p.id) ? ' (inclusive esta pessoa)' : ''}</small></p>
        {/each}
      </section>
    {/if}

    {#if viva}
      <section class="infl">
        <h4>Sua mão no destino</h4>
        <div class="seg4" role="tablist">
          {#each [['agir', '✋ Agir'], ['sussurrar', '💬 Sussurrar'], ['relacao', '⚖ Relação'], ['vida', '✎ Vida']] as [k, l] (k)}
            <button class:on={painel === k} onclick={() => (painel = k as typeof painel)}>{l}</button>
          {/each}
        </div>
        {#if painel !== 'vida'}
          <label class="alvo">com
            <select bind:value={alvo}>{#each outros as o (o.id)}<option value={o.id}>{o.nome}{o.perto ? '' : ' (longe)'}</option>{/each}</select>
          </label>
        {/if}
        {#if painel === 'agir'}
          <div class="row">
            <select bind:value={acao}>
              {#each acoes as a (a.id)}<option value={a.id} disabled={!a.pode}>{a.nome}{a.pode ? '' : ' (não dá agora)'}</option>{/each}
            </select>
            <button class="primary sm" onclick={() => fazer(acao, alvo)} disabled={!acoes.find((a) => a.id === acao)?.pode}>Fazer</button>
          </div>
          <label class="chk"><input type="checkbox" bind:checked={garantir} /> garantir que dê certo</label>
          <div class="solo">
            {#each sozinho.filter((a) => a.pode) as a (a.id)}<button class="mini" onclick={() => fazer(a.id, null)}>{a.nome}</button>{/each}
          </div>
          <div class="row">
            <select bind:value={acaso} aria-label="Fazer acontecer">
              <option value="">🎲 fazer acontecer…</option>
              {#each TONS_VIDA as t (t.id)}
                <optgroup label={`${t.icone} ${t.nome}`}>
                  {#each acasos.filter((x) => x.tom === t.id) as x (x.id)}<option value={x.id} disabled={!x.pode}>{x.nome}{sim.acontecimentosPara(p.id, alvo || null).some((y) => y.id === x.id) ? ` (com ${sim.pessoa(alvo)?.nome.split(' ')[0] ?? 'o outro'})` : ''}{x.pode ? '' : ' (não cabe agora)'}</option>{/each}
                </optgroup>
              {/each}
            </select>
            <button class="primary sm" disabled={!acaso} onclick={() => { const x = acasos.find((y) => y.id === acaso); if (x) cmd({ c: 'acontecer', id: x.id, a: p.id, b: sim.acontecimentosPara(p.id, alvo || null).some((y) => y.id === x.id) ? alvo : null }); acaso = ''; }}>{acaso ? (TOMI[acasos.find((y) => y.id === acaso)?.tom ?? ''] ?? '') : ''} Acontecer</button>
          </div>
        {:else if painel === 'sussurrar'}
          <div class="row">
            <select bind:value={sussurro}>
              <option value="paixao">paixão por</option><option value="amizade">simpatia por</option><option value="odio">raiva de</option>
              <option value="desconfianca">desconfiança de</option><option value="respeito">admiração por</option><option value="inveja">inveja de</option>
            </select>
            <button class="primary sm" onclick={() => cmd({ c: 'sussurrar', a: p.id, b: alvo, tipo: sussurro })}>Sussurrar</button>
          </div>
          <p class="dim small">Muda o que {p.nome.split(' ')[0]} sente; o que faz com isso é com {p.genero === 'f' ? 'ela' : 'ele'}.</p>
        {:else if painel === 'relacao'}
          <div class="row">
            <select bind:value={eixo}><option value="afeto">afeto</option><option value="atracao">atração</option><option value="confianca">confiança</option><option value="respeito">respeito</option><option value="intimidade">intimidade</option></select>
            <input type="range" min={eixo === 'intimidade' || eixo === 'atracao' ? 0 : -100} max="100" bind:value={valor} />
            <small class="num">{valor}</small>
            <button class="primary sm" onclick={() => cmd({ c: 'relacao', a: p.id, b: alvo, campo: eixo, valor: eixo === 'atracao' ? valor - sim.atracao(p.id, alvo) + sim.visao(p.id, alvo).atracao : eixo === 'intimidade' ? valor - sim.intimidade(p.id, alvo) + sim.visao(p.id, alvo).intimidade : valor })}>Definir</button>
          </div>
          <p class="dim small">Vínculos com {sim.pessoa(alvo)?.nome.split(' ')[0] ?? 'o outro'} (clique para ligar ou desfazer):</p>
          <div class="solo">
            {#each VINC_EDIT as v (v.id)}
              <button class="mini" class:ligado={temV(v.id)} onclick={() => cmd({ c: 'vinculo', a: p.id, b: alvo, v: v.id, on: !temV(v.id) })}>{v.nome}</button>
            {/each}
          </div>
        {:else}
          <div class="row">
            <select bind:value={metaTipo}>
              <option value="">meta…</option>
              {#each Object.entries(META) as [k, l] (k)}<option value={k}>{l}</option>{/each}
            </select>
            <button class="primary sm" disabled={!metaTipo} onclick={() => metaTipo && cmd({ c: 'meta', p: p.id, tipo: metaTipo, ...(metaTipo === 'vinganca' || metaTipo === 'conquistar' ? { alvo } : {}) })}>Dar meta</button>
          </div>
          {#if metaTipo === 'vinganca' || metaTipo === 'conquistar'}
            <label class="alvo">alvo <select bind:value={alvo}>{#each outros as o (o.id)}<option value={o.id}>{o.nome}</option>{/each}</select></label>
          {/if}
          <div class="row">
            <select bind:value={destino}>
              <option value="">mudar para…</option>
              {#each [...sim.lugares] as [k, n] (k)}{#if k !== p.local && !k.startsWith('§')}<option value={k}>{n}</option>{/if}{/each}
            </select>
            <button class="ghost sm" disabled={!destino} onclick={() => { cmd({ c: 'mudar', p: p.id, lugar: destino }); destino = ''; }}>Mudar</button>
          </div>
          {#if sim.cat.etnias.size || sim.guerras.faccoes.size}
            <div class="row">
              {#if sim.cat.etnias.size}
                <select value={p.etnia ?? ''} onchange={(e) => cmd({ c: 'campo', p: p.id, campo: 'etnia', valor: (e.currentTarget as HTMLSelectElement).value || null })} aria-label="Povo">
                  <option value="">sem povo</option>{#each [...sim.cat.etnias.values()] as et (et.id)}<option value={et.id}>{et.nome}</option>{/each}
                </select>
              {/if}
              {#if sim.guerras.faccoes.size}
                <select value={p.faccao ?? ''} onchange={(e) => cmd({ c: 'campo', p: p.id, campo: 'faccao', valor: (e.currentTarget as HTMLSelectElement).value || null })} aria-label="Facção">
                  <option value="">sem facção</option>{#each sim.guerras.vivas() as f (f.id)}<option value={f.id}>⚑ {f.nome}</option>{/each}
                </select>
              {/if}
            </div>
          {/if}
          <div class="row">
            <button class="ghost sm" onclick={() => cmd({ c: 'campo', p: p.id, campo: 'dinheiro', valor: Math.round(p.dinheiro + 50) })}>🪙 +50</button>
            <button class="ghost sm" onclick={() => cmd({ c: 'campo', p: p.id, campo: 'saude', valor: 100 })}>❤ curar</button>
            <button class="ghost sm danger" onclick={() => { if (confirm(`Matar ${p.nome}?`)) cmd({ c: 'matar', p: p.id }); }}>☠ matar</button>
          </div>
        {/if}
      </section>
    {/if}

    {#if info.ev.length}
      <section>
        <h4>O que viveu por último</h4>
        <ul class="ev">
          {#each info.ev as e, i (i)}
            <li><small>{sim.data(e.t)}</small> <LinkText text={e.texto} onlink={(t) => { const x = sim.porNomeDe(t); if (x) onselect(x.id); }} /></li>
          {/each}
        </ul>
      </section>
    {/if}
  </aside>
{/if}

<style>
  .pessoa { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 12px 14px; display: grid; gap: 12px; align-content: start; }
  header { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
  h3 { margin: 0; font: 600 18px var(--f-display); }
  .morto { color: var(--muted); }
  h4 { margin: 0 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  h4 small { text-transform: none; letter-spacing: 0; font: 11px var(--f-body, inherit); margin-left: 4px; }
  .sub { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
  .hacts { display: flex; gap: 4px; align-items: center; }
  .tag { font: 11px var(--f-mono); color: var(--muted); border: 1px dashed var(--line); border-radius: 999px; padding: 2px 8px; }
  .flags { display: flex; gap: 6px; flex-wrap: wrap; }
  .flag { border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); border-radius: 999px; padding: 3px 10px; font-size: 12px; }
  .flag.on { color: var(--ink); border-color: var(--ember); background: color-mix(in srgb, var(--ember) 16%, var(--surface-2)); }
  .bars { display: grid; gap: 4px; }
  .bars div { display: grid; grid-template-columns: 64px 1fr 34px; gap: 8px; align-items: center; font-size: 12px; color: var(--muted); }
  .bars i, .mbar i { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; display: block; }
  .bars b { display: block; height: 100%; background: var(--c); border-radius: 3px; transition: width .4s; }
  .coin { grid-column: 2 / 4; color: var(--ink); font: 12px var(--f-mono); }
  .bars small, .mbar small, .num { font: 11px var(--f-mono); text-align: right; }
  .meta { margin: 0; font-size: 12.5px; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .chip { display: inline-flex; align-items: center; gap: 3px; border-radius: 999px; padding: 2px 9px; font-size: 12px; background: color-mix(in srgb, var(--c) 16%, transparent); border: 1px solid color-mix(in srgb, var(--c) 45%, transparent); }
  .chip .x { border: 0; background: none; color: var(--muted); padding: 0 0 0 2px; font-size: 13px; line-height: 1; }
  .chip .x:hover { color: var(--crit); }
  .add { background: var(--void); border: 1px dashed var(--line); border-radius: 999px; color: var(--muted); font-size: 12px; padding: 2px 6px; max-width: 120px; }
  .gostos { margin: 6px 0 0; font-size: 12.5px; color: var(--muted); }
  .chip.item.unico { border-color: #e6c86e; color: #f3dc8f; }
  .tramas { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
  .tramas li { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: 12.5px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-2); }
  .passos { display: inline-flex; gap: 3px; }
  .passos i { width: 14px; height: 5px; border-radius: 3px; background: var(--line); }
  .passos i.feito { background: color-mix(in srgb, var(--ember) 55%, var(--line)); }
  .passos i.agora { background: var(--ember); box-shadow: 0 0 6px var(--ember); }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .mbar { display: grid; grid-template-columns: 112px 1fr 22px; gap: 6px; align-items: center; font-size: 11.5px; color: var(--muted); margin: 2px 0; }
  .mbar b { display: block; height: 100%; background: var(--ember); border-radius: 3px; }
  details summary { cursor: pointer; font-size: 12.5px; color: var(--muted); }
  .genes { display: block; font: 11px var(--f-mono); color: var(--ember-soft); white-space: normal; margin: 4px 0; }
  .fam { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--muted); }
  .lk { border: 0; background: none; color: var(--ink); padding: 0 3px; box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--ember) 50%, transparent); font: inherit; }
  .lk:disabled { box-shadow: none; color: var(--muted); }
  .lk.dead { text-decoration: line-through; opacity: .6; }
  .lk.secret { color: var(--ember-soft); }
  .rels { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; max-height: 320px; overflow-y: auto; }
  .rels li { display: grid; grid-template-columns: minmax(0, 1fr) 70px 34px; gap: 6px; align-items: center; font-size: 12.5px; }
  .rels li.dead { opacity: .5; }
  .rn { border: 0; background: none; color: var(--ink); text-align: left; padding: 0; font: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rn:hover { color: var(--ember-soft); }
  .op { position: relative; height: 6px; background: var(--surface-2); border-radius: 3px; }
  .op::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--line); }
  .op i { position: absolute; top: 0; bottom: 0; background: var(--c); border-radius: 3px; }
  .tags { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; margin-top: -2px; }
  .tags em { font-style: normal; font-size: 10.5px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 6px; }
  .mem { border: 0; background: none; font-size: 10.5px; color: var(--muted); padding: 0; }
  .mems { grid-column: 1 / -1; margin: 0; font-size: 11.5px; color: var(--muted); background: var(--surface-2); border-radius: 8px; padding: 4px 8px; }
  .seg { margin: 2px 0; font-size: 12.5px; }
  .seg small { color: var(--muted); margin-left: 4px; }
  .infl { border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 8px; }
  .seg4 { display: flex; gap: 3px; flex-wrap: wrap; }
  .seg4 button { border: 1px solid var(--line); background: var(--surface-2); color: var(--muted); border-radius: 8px; padding: 3px 9px; font-size: 12px; }
  .seg4 button.on { color: var(--ink); border-color: var(--ember); }
  .alvo { display: flex; gap: 6px; align-items: center; font-size: 12.5px; color: var(--muted); }
  .row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  select { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 4px 8px; font-size: 12.5px; min-width: 0; max-width: 100%; }
  input[type='range'] { accent-color: var(--ember); flex: 1; min-width: 80px; }
  .chk { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--muted); }
  .solo { display: flex; gap: 4px; flex-wrap: wrap; }
  .ev { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; font-size: 12.5px; }
  .ev small { color: var(--ember-soft); font: 11px var(--f-mono); }
  .dim { color: var(--muted); }
  .small { font-size: 12px; margin: 0; }
  .mini { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 7px; padding: 2px 8px; font-size: 12px; }
  .mini:hover { border-color: var(--ember); }
  .primary { border: 0; border-radius: 8px; padding: 5px 12px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary:disabled { opacity: .45; }
  .ghost { border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; background: var(--surface-2); color: var(--ink); }
  .sm { font-size: 12.5px; }
  .danger:hover { border-color: var(--crit); color: var(--crit); }
  .mini.ligado { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 18%, var(--surface-2)); }
</style>
