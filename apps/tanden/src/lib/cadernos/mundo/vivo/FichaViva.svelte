<script lang="ts">
  import {
    ameacaDe, cotacaoDoDia, diaLocal, donoDoLugar, faixaDe, formatarPreco, habitatsDe, lerCalendario, mercado, moedasDoMundo, precoLocal, ROTULO_TENDENCIA, tabelaEncontros, trocasDoLugar,
    type Entity, type World,
  } from '@tanden/core';
  import { rise } from '../../../motion';
  import { typeColor } from '../../tipos';

  // O que a ficha significa nos sistemas do mundo: o comércio de um lugar, o
  // mercado de um recurso, o câmbio de uma moeda, o resumo de um calendário e
  // o perigo de uma criatura. Só leitura: tudo vem das propriedades.
  let { entity, world, text, byPath, onopen, onaba }: {
    entity: Entity; world: World; text: string; byPath: Map<string, Entity>; onopen: (path: string) => void; onaba: (aba: string) => void;
  } = $props();

  const m = $derived(entity.type === 'lugar' || entity.type === 'recurso' ? mercado(world) : null);
  const moedas = $derived(moedasDoMundo(world));
  const preco = (n: number | null) => (n === null ? '—' : moedas.length ? formatarPreco(n, moedas) : `${n.toLocaleString('pt-BR')}`);

  // lugar
  const trocas = $derived(m && entity.type === 'lugar' ? trocasDoLugar(m, entity) : null);
  const dono = $derived(entity.type === 'lugar' ? donoDoLugar(world, entity, byPath) : null);
  const encontros = $derived(entity.type === 'lugar' ? tabelaEncontros(world, entity).linhas.filter((l) => l.criatura) : []);

  // recurso
  const rec = $derived(m && entity.type === 'recurso' ? m.recursos.find((r) => r.e?.path === entity.path) ?? null : null);
  const cot = $derived(rec ? cotacaoDoDia(rec, diaLocal(new Date())) : null);
  const locais = $derived(rec ? [...rec.produtores, ...rec.consumidores].map((l) => ({ l, p: precoLocal(rec, l, m!.rotas, 100) })) : []);

  // moeda
  const moeda = $derived(entity.type === 'moeda' ? moedas.find((x) => x.e.path === entity.path) ?? null : null);

  // calendário
  const cal = $derived(entity.type === 'calendario' ? lerCalendario(entity, text) : null);

  // criatura
  const nd = $derived(entity.type === 'criatura' ? ameacaDe(entity) : null);
  const habitats = $derived(entity.type === 'criatura' ? habitatsDe(entity).map((p) => byPath.get(p)).filter((x): x is Entity => !!x) : []);
  const mostra = $derived((entity.type === 'lugar' && (trocas?.produz.length || trocas?.precisa.length || dono || encontros.length)) || entity.type === 'recurso' || entity.type === 'moeda' || entity.type === 'calendario' || entity.type === 'criatura');
</script>

{#if mostra}
  <section class="viva t-card" style:--c={typeColor(entity.type)} in:rise={{ y: 6 }}>
    {#if entity.type === 'lugar' && trocas}
      <h3 class="t-eyebrow">No mundo</h3>
      {#if dono}<p class="linha"><span class="lbl">Quem manda</span><button class="chip" style:--t={typeColor(dono.type)} onclick={() => onopen(dono!.path)}>⚑ {dono.name}</button></p>{/if}
      {#if trocas.produz.length}<p class="linha"><span class="lbl">Produz</span>{#each trocas.produz as r (r.id)}<button class="chip" style:--t={typeColor('recurso')} onclick={() => r.e && onopen(r.e.path)}>{r.nome}{r.valor !== null ? ` · ${preco(precoLocal(r, entity))}` : ''}</button>{/each}</p>{/if}
      {#if trocas.precisa.length}<p class="linha"><span class="lbl">Precisa</span>{#each trocas.precisa as r (r.id)}<button class="chip falta" style:--t={typeColor('recurso')} onclick={() => r.e && onopen(r.e.path)}>{r.nome}{r.valor !== null ? ` · ${preco(precoLocal(r, entity, m?.rotas ?? [], 100))}` : ''}</button>{/each}</p>{/if}
      {#if encontros.length}
        <p class="linha"><span class="lbl">Vive por aqui</span>{#each encontros.slice(0, 6) as l (l.criatura!.path)}<button class="chip" style:--t={l.nd !== null ? faixaDe(l.nd).cor : typeColor('criatura')} onclick={() => onopen(l.criatura!.path)}>{l.criatura!.name}{l.nd !== null ? ` · ND ${l.nd}` : ''}</button>{/each}</p>
      {/if}
      <div class="acoes"><button class="t-btn t-btn--sm" onclick={() => onaba('mercado')}>⚖ Mercado</button>{#if encontros.length}<button class="t-btn t-btn--sm" onclick={() => onaba('seres')}>☠ Encontros</button>{/if}</div>
    {:else if entity.type === 'recurso'}
      <h3 class="t-eyebrow">Mercado</h3>
      {#if rec}
        <div class="kpis">
          <div><small>Valor</small><b>{preco(rec.valor)}</b></div>
          {#if cot && cot.preco !== null}<div><small>Hoje</small><b class:sobe={cot.variacao > 0} class:desce={cot.variacao < 0}>{preco(cot.preco)} <i>{cot.variacao > 0 ? '▲' : cot.variacao < 0 ? '▼' : '■'}{Math.abs(cot.variacao)}%</i></b></div>{/if}
          <div><small>Escassez</small><b>{rec.escassez}× <i>{ROTULO_TENDENCIA[rec.tendencia]}</i></b></div>
        </div>
        {#if rec.monopolio}<p class="mono">♛ Monopólio de <button onclick={() => onopen(rec!.monopolio!.path)}>{rec.monopolio.name}</button>: quem controla a fonte dita o preço.</p>{/if}
        {#if locais.length}
          <ul class="locais">
            {#each locais as x (x.l.path)}
              <li><button onclick={() => onopen(x.l.path)}>{x.l.name}</button><span class="tag" class:prod={rec.produtores.includes(x.l)}>{rec.produtores.includes(x.l) ? 'produz' : 'compra'}</span><b>{preco(x.p)}</b></li>
            {/each}
          </ul>
        {:else}<p class="dim sm">Ninguém produz nem compra ainda. Nos lugares: <code>recursos: [[{entity.name}]]</code> ou <code>precisa: [[{entity.name}]]</code>.</p>{/if}
      {/if}
      <div class="acoes"><button class="t-btn t-btn--sm" onclick={() => onaba('mercado')}>⚖ Ver o mercado</button></div>
    {:else if entity.type === 'moeda' && moeda}
      <h3 class="t-eyebrow">Câmbio</h3>
      <div class="cambio">
        {#each moedas.filter((x) => x !== moeda) as x (x.e.path)}
          <button class="tx" onclick={() => onopen(x.e.path)}><b>1 {moeda.nome}</b><span>=</span><b>{(Math.round((moeda.valor / x.valor) * 100) / 100).toLocaleString('pt-BR')} {x.nome}</b></button>
        {:else}<p class="dim sm">É a única moeda do mundo. Crie outras com <code>valor</code> para montar o câmbio.</p>{/each}
      </div>
      {#if !moeda.emissor}<p class="dim sm">Quem cunha esta moeda? Ligue com <code>emissor: [[Facção]]</code>.</p>{/if}
    {:else if entity.type === 'calendario' && cal}
      <h3 class="t-eyebrow">Calendário</h3>
      <div class="meses">{#each cal.meses as mm, i (i)}<span title={`${mm.dias} dias`}>{mm.nome}<small>{mm.dias}</small></span>{/each}</div>
      <p class="dim sm">{cal.diasNoAno} dias no ano · semana de {cal.semana.length} ({cal.semana.join(', ')}) · {cal.luas.map((l) => `${l.nome} (${l.ciclo} d)`).join(', ') || 'sem luas'} · {cal.festas.length} festas</p>
      {#if cal.avisos.length}<ul class="avisos">{#each cal.avisos as a (a)}<li>{a}</li>{/each}</ul>{/if}
      <div class="acoes"><button class="t-btn t-btn--sm t-btn--primary" onclick={() => onaba('sistemas:calendario')}>☾ Abrir a grade</button></div>
    {:else if entity.type === 'criatura'}
      <h3 class="t-eyebrow">Ameaça</h3>
      {#if nd !== null}
        {@const f = faixaDe(nd)}
        <div class="ameaca" style:--a={f.cor}><b>{f.label}</b><span>ND {nd}</span><span class="escala"><i style:width="{Math.min(100, (nd / 20) * 100)}%"></i></span></div>
      {:else}<p class="dim sm">Sem nível de desafio. Escreva <code>nd: 3</code> (ou <code>perigo: alto</code>) para entrar na escada de ameaça.</p>{/if}
      <p class="linha"><span class="lbl">Habitat</span>{#each habitats as h (h.path)}<button class="chip" style:--t={typeColor('lugar')} onclick={() => onopen(h.path)}>{h.name}</button>{:else}<span class="dim sm">nenhum: não aparece nas tabelas de encontro</span>{/each}</p>
      <div class="acoes"><button class="t-btn t-btn--sm" onclick={() => onaba('seres')}>☠ Tabela de encontros</button></div>
    {/if}
  </section>
{/if}

<style>
  .viva { display: grid; gap: 8px; border-left: 3px solid var(--c); }
  .linha { margin: 0; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .lbl { font: 11px var(--f-mono); color: var(--ember-soft); margin-right: 4px; min-width: 80px; }
  .chip { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 10%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 0 9px; font-size: 12px; }
  .chip.falta { border-style: dashed; }
  .acoes { display: flex; flex-wrap: wrap; gap: 6px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .kpis div { display: grid; }
  .kpis small { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .kpis b { font: 600 17px var(--f-display); }
  .kpis i { font: normal 11px var(--f-mono); color: var(--muted); }
  .sobe i { color: #e5484d; }
  .desce i { color: #5fbf77; }
  .mono { margin: 0; font-size: 12.5px; color: var(--muted); }
  .mono button { border: 0; background: none; padding: 0; color: #e5484d; font: 600 12.5px var(--f-display); }
  .locais { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; font-size: 12.5px; }
  .locais li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; }
  .locais button { border: 0; background: none; padding: 0; text-align: left; color: var(--ink); font: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { font: 10.5px var(--f-mono); color: var(--muted); }
  .tag.prod { color: #5fbf77; }
  .locais b { font: 12px var(--f-mono); }
  .cambio { display: grid; gap: 3px; }
  .tx { display: flex; gap: 8px; align-items: baseline; border: 0; background: none; padding: 2px 0; color: var(--ink); text-align: left; font-size: 13px; }
  .tx span { color: var(--muted); }
  .meses { display: flex; flex-wrap: wrap; gap: 4px; }
  .meses span { padding: 2px 9px; border-radius: var(--r-pill); border: 1px solid color-mix(in srgb, var(--c) 40%, var(--line)); font-size: 12px; }
  .meses small { margin-left: 4px; font: 10px var(--f-mono); color: var(--muted); }
  .avisos { margin: 0; padding-left: 18px; font-size: 12px; color: var(--crit); }
  .ameaca { display: grid; grid-template-columns: auto auto minmax(60px, 1fr); gap: 10px; align-items: center; }
  .ameaca b { font: 700 20px var(--f-display); color: var(--a); }
  .ameaca span { font: 12px var(--f-mono); color: var(--muted); }
  .escala { height: 7px; border-radius: 4px; background: linear-gradient(90deg, #5fbf77, #e8c547, #f2a65a, #e5484d, #b277ee); opacity: .35; position: relative; overflow: hidden; }
  .escala i { position: absolute; inset: 0 auto 0 0; background: var(--a); opacity: 1; border-radius: 4px; }
  .dim { color: var(--muted); }
  .sm { font-size: 12px; margin: 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
</style>
