<script lang="ts">
  import {
    CALENDARIO_PADRAO, anoDoCalendario, conjuncoes, entityFolder, entityTemplate, estacaoDe, faseDaLua, gradeDoMes, lerCalendario, marcosDoMes, nomeDaFase, setProp, setProps, setSection,
    asText, type MarcoDoDia, type World,
  } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';

  // O calendário do mundo: meses com nomes próprios, semana, várias luas com
  // fases, estações e festas. A grade do mês mostra as luas de cada noite, as
  // festas e os aniversários de tudo que tem data no mundo.
  let { world, onopen }: { world: World; onopen: (path: string) => void } = $props();

  const cals = $derived(world.entities.filter((e) => e.type === 'calendario'));
  const citado = $derived(asText(world.props?.['calendário'] ?? world.props?.['calendario'] ?? '').replace(/\[\[|\]\]/g, '').split('|')[0]!.trim());
  let escolhido = $state<string | null>(null);
  const atualE = $derived(cals.find((c) => c.path === escolhido) ?? cals.find((c) => c.name === citado) ?? cals[0] ?? null);
  const cal = $derived.by(() => { void cadernos.rev; return atualE ? lerCalendario(atualE, cadernos.read(atualE.path)) : CALENDARIO_PADRAO; });

  let ano = $state(0);
  let mes = $state(0);
  let iniciado = false;
  $effect(() => { if (!iniciado) { iniciado = true; ano = anoDoCalendario(world); } });
  $effect(() => { if (mes >= cal.meses.length) mes = 0; });
  function passo(d: number) {
    let m = mes + d;
    let a = ano;
    if (m < 0) { m = cal.meses.length - 1; a--; }
    if (m >= cal.meses.length) { m = 0; a++; }
    mes = m;
    ano = a;
    sound.play('tick');
  }

  const grade = $derived(gradeDoMes(cal, ano, mes));
  const marcos = $derived(marcosDoMes(world, cal, ano, mes));
  const porDia = $derived.by(() => {
    const m = new Map<number, MarcoDoDia[]>();
    for (const x of marcos) m.set(x.dia, [...(m.get(x.dia) ?? []), x]);
    return m;
  });
  const conj = $derived(conjuncoes(cal, ano));
  const conjDoMes = $derived(new Set(conj.filter((c) => c.mes === mes).map((c) => c.dia)));
  const estacao = $derived(estacaoDe(cal, mes));
  const festasPorMes = $derived(cal.meses.map((_, i) => cal.festas.filter((f) => f.mes === i).length));
  const ICONE: Record<MarcoDoDia['tipo'], string> = { festa: '✦', evento: '◆', nascimento: '☺', morte: '✝', fundacao: '⌂' };
  const COR: Record<MarcoDoDia['tipo'], string> = { festa: '#e8c547', evento: '#ffc08a', nascimento: '#7fd1a8', morte: '#9aa3ad', fundacao: '#7fb6ff' };
  const LUA_COR = ['#dfe6ee', '#ef8f8f', '#9ad7ff', '#c6b3ff'];
  let diaSel = $state<number | null>(null);
  const marcosSel = $derived(diaSel ? porDia.get(diaSel) ?? [] : marcos);

  // ------------------------------------------------ criar
  function criarCalendario() {
    const path = cadernos.create(entityFolder(world, 'calendario'), `Calendário de ${world.name}`, (n) => {
      let t = setProps(entityTemplate(n, world.name, 'calendario'), {
        meses: 'Degelo, Semeadura, Flor, Sol Alto, Colheita, Brumas, Geada, Longa Noite', 'dias por mês': '36', semana: 'Pedra, Água, Vento, Fogo, Folha, Lua',
        luas: 'Prateada:27, Rubra:45:12', era: 'D.F.', 'estações': 'Primavera:Degelo, Verão:Sol Alto, Outono:Brumas, Inverno:Longa Noite',
      });
      t = setSection(t, 'Festas', '- 1 de Degelo: Ano Novo\n- 18 de Sol Alto: Festa do Sol\n- 36 de Longa Noite: Noite das Lanternas');
      return t;
    });
    if (world.path && !citado) cadernos.update(world.path, (t) => setProp(t, 'calendário', `[[${path.split('/').pop()!.replace(/\.md$/, '')}]]`));
    sound.play('complete');
    onopen(path);
  }
  const fmtAno = (a: number) => `${a < 0 ? `${-a} antes` : a}${cal.era ? ` ${cal.era}` : ''}`;
</script>

<section class="cal" in:rise={{ y: 6 }}>
  {#if !atualE}
    <div class="aviso t-card">
      <p><b>Sem calendário próprio.</b> A grade abaixo usa o calendário comum. Um calendário inventado (meses com nomes, semana de seis dias, duas luas) diz muito sobre a cultura: o que se festeja, o que se teme, quando se planta.</p>
      <button class="t-btn t-btn--primary" onclick={criarCalendario}>☾ Criar calendário</button>
    </div>
  {:else if cals.length > 1}
    <div class="escolha t-scroll-x">{#each cals as c (c.path)}<button class="t-chip" class:on={c === atualE} onclick={() => (escolhido = c.path)}>{c.name}</button>{/each}</div>
  {/if}

  <div class="painel t-card">
    <header>
      <button class="t-btn t-btn--icon t-btn--quiet" onclick={() => passo(-1)} aria-label="Mês anterior">‹</button>
      <div class="titulo">
        <b>{cal.meses[mes]?.nome}</b>
        <span><input class="ano" type="number" bind:value={ano} aria-label="Ano" />{cal.era}{#if estacao} · {estacao}{/if}</span>
      </div>
      <button class="t-btn t-btn--icon t-btn--quiet" onclick={() => passo(1)} aria-label="Próximo mês">›</button>
      {#if atualE}<button class="t-btn t-btn--sm editar" onclick={() => onopen(atualE!.path)}>Editar</button>{/if}
    </header>

    <div class="meses t-scroll-x" role="group" aria-label="Meses">
      {#each cal.meses as m, i (i)}
        <button class:on={i === mes} onclick={() => { mes = i; diaSel = null; }} title={`${m.nome}: ${m.dias} dias${festasPorMes[i] ? `, ${festasPorMes[i]} festas` : ''}`}>
          {m.nome.slice(0, 3)}{#if festasPorMes[i]}<i></i>{/if}
        </button>
      {/each}
    </div>

    <div class="grade" style:--w={cal.semana.length}>
      {#each cal.semana as s (s)}<span class="sem" title={s}>{s.slice(0, 3)}</span>{/each}
      {#each grade as linha, li (li)}
        {#each linha as d, k (k)}
          {#if d}
            {@const ms = porDia.get(d.dia) ?? []}
            <button class="dia" class:sel={diaSel === d.dia} class:festa={ms.some((x) => x.tipo === 'festa')} class:conj={conjDoMes.has(d.dia)} onclick={() => (diaSel = diaSel === d.dia ? null : d.dia)}
              aria-label={`${d.dia} de ${cal.meses[mes]?.nome}${ms.length ? `: ${ms.map((x) => x.nome).join(', ')}` : ''}`}>
              <span class="n">{d.dia}</span>
              <span class="luas">
                {#each cal.luas.slice(0, 4) as l, j (l.nome)}
                  {@const f = faseDaLua(l, d.abs)}
                  <i class="lua" style:--l={LUA_COR[j]} style:--f={f} title={`${l.nome}: ${nomeDaFase(f).nome}`}></i>
                {/each}
              </span>
              {#if ms.length}<span class="marcas">{#each ms.slice(0, 3) as x, j (j)}<i style:background={COR[x.tipo]}></i>{/each}</span>{/if}
            </button>
          {:else}<span class="vazia"></span>{/if}
        {/each}
      {/each}
    </div>
    <p class="leg">
      {#each cal.luas.slice(0, 4) as l, j (l.nome)}<span><i class="lua" style:--l={LUA_COR[j]} style:--f=".5"></i>{l.nome} ({l.ciclo} dias)</span>{/each}
      {#if conj.length}<span class="cj">✧ luas cheias juntas</span>{/if}
    </p>
  </div>

  <div class="lado">
    <div class="t-card bloco">
      <h3 class="t-eyebrow">{diaSel ? `${diaSel} de ${cal.meses[mes]?.nome}` : `Em ${cal.meses[mes]?.nome}`}</h3>
      {#each marcosSel as x, i (i)}
        <button class="marco" disabled={!x.path} onclick={() => x.path && onopen(x.path)} style:--c={COR[x.tipo]}>
          <span class="ic" aria-hidden="true">{ICONE[x.tipo]}</span>
          <span class="t"><b>{x.nome}</b><small>{diaSel ? '' : `dia ${x.dia} · `}{x.tipo === 'festa' ? 'festa' : x.tipo}{x.anos ? ` · faz ${x.anos} ${x.anos === 1 ? 'ano' : 'anos'}` : ''}</small></span>
        </button>
      {:else}
        <p class="dim sm">{diaSel ? 'Nada marcado neste dia.' : 'Nada neste mês. Datas como "12 de ' + (cal.meses[mes]?.nome ?? 'Brumal') + ' de ' + ano + '" em eventos e personagens aparecem aqui.'}</p>
      {/each}
    </div>
    {#if conj.length}
      <div class="t-card bloco presagio">
        <h3 class="t-eyebrow">Noites de presságio em {fmtAno(ano)}</h3>
        <div class="cjs">{#each conj.slice(0, 12) as c, i (i)}<button class="t-chip" onclick={() => { mes = c.mes; diaSel = c.dia; }}>{c.dia} de {cal.meses[c.mes]?.nome}</button>{/each}</div>
        <p class="dim sm">Todas as luas cheias ao mesmo tempo. Ótimo dia para uma profecia, um ritual ou uma batalha.</p>
      </div>
    {/if}
    {#if cal.estacoes.length}
      <div class="t-card bloco">
        <h3 class="t-eyebrow">Estações</h3>
        <div class="roda">
          {#each cal.estacoes as s, i (i)}<button class="est" class:on={s.nome === estacao} onclick={() => (mes = s.mes)}><b>{s.nome}</b><small>{cal.meses[s.mes]?.nome}</small></button>{/each}
        </div>
      </div>
    {/if}
    {#if cal.avisos.length}
      <div class="t-card bloco erros">
        <h3 class="t-eyebrow">A conferir</h3>
        <ul>{#each cal.avisos as a (a)}<li>{a}</li>{/each}</ul>
      </div>
    {/if}
    <p class="dim sm resumo">{cal.meses.length} meses · {cal.diasNoAno} dias no ano · semana de {cal.semana.length} dias · {cal.luas.length} {cal.luas.length === 1 ? 'lua' : 'luas'} · {cal.festas.length} festas</p>
  </div>
</section>

<style>
  .cal { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(min(260px, 100%), 1fr); gap: var(--sp-3); align-items: start; }
  @container (max-width: 760px) { .cal { grid-template-columns: minmax(0, 1fr); } }
  .aviso, .escolha { grid-column: 1 / -1; }
  .aviso { display: flex; gap: var(--sp-3); align-items: center; flex-wrap: wrap; border-color: color-mix(in srgb, #8ecae6 45%, var(--line)); }
  .aviso p { flex: 1 1 260px; margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .aviso b { color: var(--ink); }
  .escolha { display: flex; gap: 4px; }
  .painel { display: grid; gap: var(--sp-2); background: radial-gradient(ellipse at 50% -20%, color-mix(in srgb, #8ecae6 14%, var(--surface)), var(--surface) 60%); }
  header { display: flex; align-items: center; gap: 6px; }
  .titulo { flex: 1; display: grid; justify-items: center; text-align: center; min-width: 0; }
  .titulo b { font: 600 22px/1.15 var(--f-display); overflow-wrap: anywhere; }
  .titulo span { display: inline-flex; align-items: center; gap: 4px; font: 12px var(--f-mono); color: var(--muted); }
  .ano { width: 7ch; border: 0; border-bottom: 1px dashed var(--line); background: none; color: var(--ink); font: inherit; text-align: right; padding: 0; }
  .editar { margin-left: 4px; }
  .meses { display: flex; gap: 2px; }
  .meses button { position: relative; flex: 1 0 auto; min-width: 40px; border: 1px solid transparent; background: none; color: var(--muted); border-radius: var(--r-sm); padding: 4px 6px; font: 600 11.5px var(--f-display); }
  .meses button.on { color: var(--ink); background: var(--surface-2); border-color: var(--line); }
  .meses i { position: absolute; top: 3px; right: 4px; width: 4px; height: 4px; border-radius: 50%; background: #e8c547; }
  .grade { display: grid; grid-template-columns: repeat(var(--w), minmax(0, 1fr)); gap: 3px; }
  .sem { font: 600 10px var(--f-display); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); text-align: center; padding: 2px 0; overflow: hidden; }
  .dia { position: relative; min-height: 54px; display: grid; grid-template-rows: auto 1fr auto; padding: 4px; border-radius: var(--r-sm); border: 1px solid var(--line); background: var(--surface); color: var(--ink); text-align: left; overflow: hidden; }
  .dia:hover { border-color: color-mix(in srgb, #8ecae6 60%, var(--line)); }
  .dia.sel { border-color: var(--ember); box-shadow: 0 0 0 1px var(--ember); }
  .dia.festa { background: linear-gradient(160deg, color-mix(in srgb, #e8c547 16%, var(--surface)), var(--surface) 70%); }
  .dia.conj { box-shadow: inset 0 0 14px -4px #c6b3ff; border-color: color-mix(in srgb, #c6b3ff 60%, var(--line)); }
  .n { font: 600 12px var(--f-mono); }
  .luas { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; }
  /* a fase: uma sombra que corre por cima do disco */
  .lua { --s: calc((var(--f) - .5) * 2); width: 9px; height: 9px; border-radius: 50%; flex: none; background: var(--l);
    box-shadow: inset calc(var(--s) * 9px) 0 0 0 color-mix(in srgb, var(--void) 88%, transparent); opacity: calc(.45 + (1 - (var(--s) * var(--s))) * .55); }
  .marcas { display: flex; gap: 2px; }
  .marcas i { width: 6px; height: 6px; border-radius: 50%; }
  .vazia { min-height: 54px; }
  .leg { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: var(--muted); }
  .leg span { display: inline-flex; align-items: center; gap: 5px; }
  .leg .cj { color: #c6b3ff; }
  .lado { display: grid; gap: var(--sp-2); }
  .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .marco { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 8px; align-items: center; border: 0; background: none; padding: 3px; border-radius: var(--r-sm); text-align: left; color: var(--ink); }
  .marco:not(:disabled):hover { background: var(--surface-2); }
  .marco .ic { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  .marco .t { display: grid; min-width: 0; }
  .marco b { font: 600 13px var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .marco small { font-size: 11.5px; color: var(--muted); }
  .presagio { border-color: color-mix(in srgb, #c6b3ff 45%, var(--line)); background: linear-gradient(160deg, color-mix(in srgb, #c6b3ff 10%, var(--surface)), var(--surface)); }
  .cjs { display: flex; flex-wrap: wrap; gap: 4px; }
  .roda { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100px, 100%), 1fr)); gap: 4px; }
  .est { display: grid; border: 1px solid var(--line); background: var(--surface); border-radius: var(--r-md); padding: 6px 8px; text-align: left; color: var(--ink); }
  .est.on { border-color: #8ecae6; background: color-mix(in srgb, #8ecae6 12%, var(--surface)); }
  .est b { font: 600 12.5px var(--f-display); }
  .est small { font-size: 11px; color: var(--muted); }
  .erros ul { margin: 0; padding-left: 18px; font-size: 12px; color: var(--muted); display: grid; gap: 3px; }
  .erros { border-color: color-mix(in srgb, var(--crit) 40%, var(--line)); }
  .dim { color: var(--muted); }
  .sm { font-size: 12px; margin: 0; }
  .resumo { font-family: var(--f-mono); font-size: 11px; }
</style>
