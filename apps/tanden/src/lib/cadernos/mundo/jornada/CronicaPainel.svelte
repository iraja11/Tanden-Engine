<script lang="ts">
  import {
    CONQUISTAS, GENEROS, GRUPOS, MAX_ESCUDOS, NIVEIS_DAS_ERAS, NON_CARD_TYPES, diaLocal, diasCumpridos, generoDoMundo, infoRaridade, reviewWorld, setProp, somarDias, storyIndex,
    type Conquista, type GrupoConquista, type World,
  } from '@tanden/core';
  import { rise } from '../../../motion';
  import Icon from '../../../ui/Icon.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import { jornada, totalDeConquistas } from './jornada.svelte';
  import Planeta from './Planeta.svelte';

  // A crônica do mundo: eras, gênero, conquistas e constância, num painel lateral
  // que abre por cima da tela de construção, sem tirar você dela.
  type AbaCronica = 'mundo' | 'conquistas' | 'constancia';
  let { world, aba = $bindable('mundo'), onclose }: { world: World; aba?: AbaCronica; onclose: () => void } = $props();

  const e = $derived(jornada.estado(world));
  const fichas = $derived(world.entities.filter((x) => !NON_CARD_TYPES.has(x.type)).length);
  const historias = $derived(storyIndex(world).length);
  const tempestades = $derived(reviewWorld(world).filter((i) => i.level === 'erro').length);
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  const partes = $derived([
    ['Fichas e ligações', e.partes.fichas], ['Texto escrito', e.partes.escrita], ['Linha do tempo', e.partes.historia],
    ['Sprints e missões', e.partes.atividade], ['Conquistas', e.partes.conquistas],
  ] as const);
  const maiorParte = $derived(Math.max(1, ...partes.map(([, v]) => v)));

  function escolherGenero(label: string) {
    if (world.path) cadernos.update(world.path, (t) => setProp(t, 'gênero', label));
  }
  const atual = $derived(generoDoMundo(world));

  // ------------------------------------------------ conquistas
  const metricas = $derived.by(() => { void jornada.rev; void cadernos.rev; return aba === 'conquistas' ? jornada.metricas() : {}; });
  const obtidas = $derived(jornada.registro.conquistas);
  let grupo = $state<GrupoConquista | 'todas'>('todas');
  let filtro = $state<'proximas' | 'obtidas' | 'todas'>('proximas');
  let limite = $state(40);
  const progresso = (c: Conquista) => Math.min(1, (metricas[c.metrica] ?? 0) / c.alvo);

  const visiveis = $derived.by(() => {
    let l = CONQUISTAS.filter((c) => grupo === 'todas' || c.grupo === grupo);
    if (filtro === 'obtidas') l = l.filter((c) => obtidas[c.id]);
    if (filtro === 'proximas') l = l.filter((c) => !obtidas[c.id] && !c.secreta);
    const ordenada = [...l];
    if (filtro === 'proximas') ordenada.sort((a, b) => progresso(b) - progresso(a));
    if (filtro === 'obtidas') ordenada.sort((a, b) => (obtidas[b.id]?.em ?? 0) - (obtidas[a.id]?.em ?? 0));
    return ordenada;
  });
  $effect(() => { void grupo; void filtro; limite = 40; });
  const quando = (t: number) => new Date(t).toLocaleDateString('pt-BR');

  // ------------------------------------------------ constância
  const seq = $derived(jornada.sequencia);
  const SEMANAS = 18;
  const calendario = $derived.by(() => {
    const feitos = diasCumpridos(jornada.registro);
    const prot = new Set(seq.protegidos);
    const hoje = new Date();
    const fim = diaLocal(hoje);
    const dias: Array<{ dia: string; n: number; feito: boolean; salvo: boolean; futuro: boolean }> = [];
    for (let d = somarDias(fim, -((SEMANAS - 1) * 7 + hoje.getDay())), k = 0; k < SEMANAS * 7; d = somarDias(d, 1), k++) {
      const total = Object.values(jornada.registro.dias[d] ?? {}).reduce((a, c) => a + (c.palavras ?? 0), 0);
      dias.push({ dia: d, n: total, feito: feitos.has(d), salvo: prot.has(d), futuro: d > fim });
    }
    return dias;
  });
  const METAS = [50, 100, 250, 500, 1000];
</script>

<div class="t-scrim fundo" role="presentation" onclick={(ev) => { if (ev.target === ev.currentTarget) onclose(); }} onkeydown={(ev) => { if (ev.key === 'Escape') onclose(); }}>
  <div class="painel" role="dialog" aria-modal="true" aria-label={`Crônica de ${world.name}`} in:rise={{ y: 12 }}>
    <header class="topo">
      <h2>Crônica de {world.name}</h2>
      <button class="t-btn t-btn--sm t-btn--icon t-btn--quiet" onclick={onclose} aria-label="Fechar"><Icon name="fechar" size={16} /></button>
    </header>
    <div class="t-seg abas" role="tablist">
      <button role="tab" aria-selected={aba === 'mundo'} class:on={aba === 'mundo'} onclick={() => (aba = 'mundo')}>Mundo</button>
      <button role="tab" aria-selected={aba === 'conquistas'} class:on={aba === 'conquistas'} onclick={() => (aba = 'conquistas')}>Conquistas</button>
      <button role="tab" aria-selected={aba === 'constancia'} class:on={aba === 'constancia'} onclick={() => (aba = 'constancia')}>Constância</button>
    </div>

    {#if aba === 'mundo'}
      <div class="heroi" style:--luz={e.genero.cores.luz}>
        <Planeta nome={world.name} genero={e.genero} era={e.indiceEra} {fichas} {historias} {tempestades} size={190} />
        <div class="nome">
          <small>Era {e.indiceEra + 1} de 7 · Nível {e.nivel.nivel}</small>
          <b>{e.era.nome}</b>
          <p>{e.era.desc}</p>
          <p class="xp">{fmt(e.nivel.xp)} {e.genero.moeda}{#if e.proximaEra} · {e.proximaEra.era.nome} no nível {e.proximaEra.nivel}{/if}</p>
        </div>
      </div>

      <ol class="eras">
        {#each e.genero.eras as era, i (era.nome)}
          <li class:feita={i < e.indiceEra} class:agora={i === e.indiceEra} style:--luz={e.genero.cores.luz}>
            <i></i><span><b>{i <= e.indiceEra ? era.nome : '???'}</b><small>nível {NIVEIS_DAS_ERAS[i]}</small></span>
          </li>
        {/each}
      </ol>

      <section>
        <h3>De onde vem o progresso</h3>
        <dl class="partes">
          {#each partes as [nome, v] (nome)}<dt>{nome}</dt><dd><span><i style:width="{(v / maiorParte) * 100}%" style:background={e.genero.cores.luz}></i></span><b>{fmt(v)}</b></dd>{/each}
        </dl>
        <p class="nota">Apagar uma ficha tira os pontos dela: o nível sempre reflete o mundo que existe.</p>
      </section>

      <section>
        <h3>Gênero do mundo</h3>
        {#if !world.path}<p class="nota">Crie a nota do mundo para escolher o gênero.</p>{/if}
        <div class="generos">
          {#each GENEROS as g (g.id)}
            <button class="genero" class:on={atual.id === g.id} disabled={!world.path} onclick={() => escolherGenero(g.label)} title={g.desc} style:--luz={g.cores.luz}>
              <span aria-hidden="true">{g.glifo}</span><b>{g.label}</b>
            </button>
          {/each}
        </div>
        <p class="nota">{atual.desc} O gênero muda o planeta, as eras, o oráculo e a entrevista.</p>
      </section>
    {:else if aba === 'conquistas'}
      <p class="resumo"><b>{jornada.totalConquistas}</b> de {totalDeConquistas} conquistas</p>
      <div class="t-seg" role="radiogroup" aria-label="Situação">
        <button role="radio" aria-checked={filtro === 'proximas'} class:on={filtro === 'proximas'} onclick={() => (filtro = 'proximas')}>Próximas</button>
        <button role="radio" aria-checked={filtro === 'obtidas'} class:on={filtro === 'obtidas'} onclick={() => (filtro = 'obtidas')}>Obtidas</button>
        <button role="radio" aria-checked={filtro === 'todas'} class:on={filtro === 'todas'} onclick={() => (filtro = 'todas')}>Todas</button>
      </div>
      <div class="grupos t-scroll-x" role="group" aria-label="Grupo">
        <button class="t-chip" class:on={grupo === 'todas'} onclick={() => (grupo = 'todas')}>Todas</button>
        {#each GRUPOS as g (g.id)}<button class="t-chip" class:on={grupo === g.id} onclick={() => (grupo = g.id)}>{g.label}</button>{/each}
      </div>
      <ul class="lista">
        {#each visiveis.slice(0, limite) as c (c.id)}
          {@const tem = obtidas[c.id]}
          {@const oculta = c.secreta && !tem}
          {@const info = infoRaridade(c.raridade)}
          <li class:tem class:oculta style:--r={info.cor}>
            <span class="glifo" aria-hidden="true">{oculta ? '?' : c.glifo}</span>
            <span class="txt">
              <b>{oculta ? 'Conquista secreta' : c.nome}</b>
              <span>{oculta ? 'Continue escrevendo para descobrir.' : c.desc}</span>
              {#if !tem && !oculta}
                <span class="prog"><i style:width="{progresso(c) * 100}%"></i></span>
                <small>{fmt(Math.min(metricas[c.metrica] ?? 0, c.alvo))} de {fmt(c.alvo)}</small>
              {:else if tem}<small>{info.label} · {quando(tem.em)}</small>{/if}
            </span>
          </li>
        {:else}
          <li class="nada">Nada por aqui ainda.</li>
        {/each}
      </ul>
      {#if visiveis.length > limite}<button class="t-btn" onclick={() => (limite += 60)}>Mostrar mais ({visiveis.length - limite})</button>{/if}
    {:else}
      <div class="chama">
        <span class="fogo" class:apagado={!seq.hojeFeito} aria-hidden="true">🔥</span>
        <div>
          <b>{seq.atual} {seq.atual === 1 ? 'dia seguido' : 'dias seguidos'}</b>
          <p>{seq.hojeFeito ? 'Meta de hoje cumprida.' : `Faltam ${fmt(Math.max(0, jornada.meta - jornada.palavrasHoje()))} palavras para manter a chama hoje.`}</p>
          <p class="nota">Recorde: {seq.melhor} {seq.melhor === 1 ? 'dia' : 'dias'}</p>
        </div>
      </div>

      <section>
        <h3>Escudos</h3>
        <p class="escudos" aria-label={`${seq.escudos} de ${MAX_ESCUDOS} escudos`}>{#each Array.from({ length: MAX_ESCUDOS }) as _, i (i)}<span class:vazio={i >= seq.escudos} aria-hidden="true">🛡</span>{/each}</p>
        <p class="nota">A cada 7 dias seguidos você ganha um escudo, até 3. Cada escudo salva a sequência de um dia perdido.</p>
      </section>

      <section>
        <h3>Últimas semanas</h3>
        <div class="grade t-scroll-x">
          {#each calendario as d (d.dia)}
            <i class:feito={d.feito} class:salvo={d.salvo} class:futuro={d.futuro} class:forte={d.n >= jornada.meta * 3} title={`${d.dia}: ${fmt(d.n)} palavras${d.salvo ? ' (salvo por um escudo)' : ''}`}></i>
          {/each}
        </div>
      </section>

      <section>
        <h3>Meta diária</h3>
        <div class="metas">
          {#each METAS as m (m)}<button class="t-chip" class:on={jornada.meta === m} onclick={() => jornada.definirMeta(m)}>{m}</button>{/each}
          <input class="t-input" type="number" min="1" step="50" value={jornada.meta} aria-label="Meta de palavras por dia" onchange={(ev) => { const v = Number((ev.currentTarget as HTMLInputElement).value); if (v > 0) jornada.definirMeta(v); }} />
        </div>
        <p class="nota">Dias já cumpridos continuam valendo se você mudar a meta.</p>
      </section>

      <section>
        <h3>Recordes de sprint</h3>
        <dl class="recordes">
          <div><dt>Palavras por minuto</dt><dd>{fmt(jornada.registro.recordes.ppm ?? 0)}</dd></div>
          <div><dt>Palavras num sprint</dt><dd>{fmt(jornada.registro.recordes.sprint ?? 0)}</dd></div>
        </dl>
      </section>
    {/if}
  </div>
</div>

<style>
  .fundo { place-items: stretch end; padding: 0; }
  .painel { width: min(560px, 100%); height: 100%; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-4) var(--sp-5) var(--sp-6); background: var(--surface); border-left: 1px solid var(--line); box-shadow: var(--elev-2); }
  .painel > * { flex-shrink: 0; }
  .topo { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2); }
  h2 { margin: 0; font: 600 18px var(--f-display); overflow-wrap: anywhere; }
  h3 { margin: 0 0 var(--sp-2); font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .abas { align-self: flex-start; max-width: 100%; }
  .nota { margin: var(--sp-2) 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }

  .heroi { display: flex; align-items: center; flex-wrap: wrap; justify-content: center; gap: var(--sp-4); padding: var(--sp-4); border-radius: var(--r-lg);
    background: radial-gradient(circle at 30% 50%, color-mix(in srgb, var(--luz) 16%, transparent), transparent 62%), var(--void); }
  .nome { flex: 1 1 180px; display: grid; gap: 3px; min-width: 0; }
  .nome small { font: 11px var(--f-mono); color: var(--muted); }
  .nome b { font: 600 24px/1.15 var(--f-display); }
  .nome p { margin: 0; color: var(--muted); font-size: 13.5px; line-height: 1.45; }
  .nome .xp { font: 12px var(--f-mono); color: var(--luz); margin-top: var(--sp-1); }

  .eras { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .eras li { position: relative; display: flex; align-items: center; gap: var(--sp-3); padding: 5px 0; color: var(--muted); }
  .eras li:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 22px; bottom: -8px; width: 2px; background: var(--line); }
  .eras li.feita:not(:last-child)::before { background: var(--luz); }
  .eras i { position: relative; flex: none; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--line); background: var(--surface); }
  .eras .feita i { background: var(--luz); border-color: var(--luz); }
  .eras .agora i { border-color: var(--luz); box-shadow: 0 0 0 4px color-mix(in srgb, var(--luz) 25%, transparent); }
  .eras span { display: flex; justify-content: space-between; flex: 1; gap: var(--sp-2); }
  .eras b { font: 600 13.5px var(--f-display); }
  .eras .agora b, .eras .feita b { color: var(--ink); }
  .eras small { font: 11px var(--f-mono); flex: none; }

  .partes { margin: 0; display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: 6px var(--sp-3); align-items: center; font-size: 12.5px; }
  .partes dt { color: var(--muted); }
  .partes dd { margin: 0; display: flex; align-items: center; gap: var(--sp-2); }
  .partes dd span { flex: 1; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .partes dd i { display: block; height: 100%; }
  .partes b { font: 600 12px var(--f-mono); min-width: 44px; text-align: right; }

  .generos { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: 6px; }
  .genero { display: flex; align-items: center; gap: var(--sp-2); min-height: 44px; padding: 6px 10px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-2); color: var(--ink); text-align: left; }
  .genero span { flex: none; width: 20px; text-align: center; color: var(--luz); font-size: 15px; }
  .genero b { font: 600 12.5px/1.25 var(--f-body); }
  .genero:hover:not(:disabled), .genero.on { border-color: var(--luz); }
  .genero.on { background: color-mix(in srgb, var(--luz) 14%, var(--surface-2)); box-shadow: inset 0 0 0 1px var(--luz); }

  .resumo { margin: 0; color: var(--muted); font-size: 14px; }
  .resumo b { font: 700 22px var(--f-mono); color: var(--ink); }
  .grupos { display: flex; gap: 4px; flex-wrap: wrap; }
  .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .lista li { display: flex; align-items: flex-start; gap: var(--sp-3); padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-2); }
  .lista li.tem { border-color: color-mix(in srgb, var(--r) 55%, var(--line)); background: color-mix(in srgb, var(--r) 9%, var(--surface)); }
  .lista li.oculta { border-style: dashed; opacity: .75; }
  .lista li.nada { color: var(--muted); font-size: 13px; }
  .glifo { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; font-size: 17px; color: var(--muted); background: var(--surface); filter: grayscale(1); }
  .tem .glifo { color: var(--r); filter: none; background: color-mix(in srgb, var(--r) 16%, transparent); }
  .txt { display: grid; gap: 2px; min-width: 0; flex: 1; font-size: 12.5px; color: var(--muted); line-height: 1.4; }
  .txt b { font: 600 14px var(--f-display); color: var(--ink); }
  .txt small { font: 11px var(--f-mono); }
  .prog { height: 4px; margin-top: 4px; border-radius: 2px; background: var(--line); overflow: hidden; }
  .prog i { display: block; height: 100%; background: var(--r); }

  .chama { display: flex; align-items: center; gap: var(--sp-4); padding: var(--sp-4); border-radius: var(--r-lg); background: color-mix(in srgb, var(--ember) 10%, var(--surface-2)); }
  .fogo { font-size: 52px; line-height: 1; filter: drop-shadow(0 0 16px var(--ember)); }
  .fogo.apagado { filter: grayscale(1); opacity: .55; }
  .chama b { font: 600 22px var(--f-display); }
  .chama p { margin: 2px 0 0; color: var(--muted); font-size: 13.5px; }
  .escudos { margin: 0; display: flex; gap: var(--sp-2); font-size: 26px; }
  .escudos .vazio { filter: grayscale(1); opacity: .28; }
  .grade { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 13px); grid-auto-columns: 13px; gap: 3px; padding-bottom: 4px; }
  .grade i { border-radius: 3px; background: var(--surface-2); }
  .grade i.feito { background: color-mix(in srgb, var(--ember) 70%, transparent); }
  .grade i.forte { background: var(--ember); box-shadow: 0 0 6px -1px var(--ember); }
  .grade i.salvo { background: none; box-shadow: inset 0 0 0 1.5px var(--ok); }
  .grade i.futuro { opacity: .3; }
  .metas { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .metas .t-input { width: 92px; }
  .recordes { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: var(--sp-2); }
  .recordes div { padding: var(--sp-3); border-radius: var(--r-md); background: var(--surface-2); }
  .recordes dt { color: var(--muted); font-size: 12px; }
  .recordes dd { margin: 2px 0 0; font: 700 22px var(--f-mono); }
  @media (max-width: 720px) { .painel { padding: var(--sp-3) var(--sp-4) var(--sp-6); } }
</style>
