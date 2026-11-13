<script lang="ts">
  import {
    amortize, applyPercent, beforePercent, change, effectiveRate, equivalentRate, formatBRL, formatPercent, incomeTaxRate, irr,
    monthlyFor, npv, parseNumberBR, payback, realRate, shareOf, simulateInvestment, solveTvm, type AmortTable, type TvmKey,
  } from '@tanden/core';
  import { calcPrefs, type FinTool } from './calc.svelte';
  import FinChart from './FinChart.svelte';
  import NumField from './NumField.svelte';
  import { sound } from '../sound.svelte';

  /*
   * Aba Financeira: investimento com aportes, financiamento (Price × SAC),
   * valor do dinheiro no estilo HP-12C, VPL/TIR, taxas e porcentagens.
   * As contas moram no núcleo (@tanden/core, financas); aqui só campos e gráficos.
   */

  const TOOLS: { id: FinTool; label: string; note: string }[] = [
    { id: 'investir', label: 'Investimento', note: 'juros compostos, aportes e IR' },
    { id: 'financiar', label: 'Financiamento', note: 'Price × SAC, tabela de parcelas' },
    { id: 'hp', label: 'Valor do dinheiro', note: 'n, i, VP, PGTO, VF (como a HP-12C)' },
    { id: 'fluxo', label: 'VPL e TIR', note: 'fluxo de caixa e payback' },
    { id: 'taxas', label: 'Taxas', note: 'equivalente, real, % do CDI' },
    { id: 'porcento', label: 'Porcentagem', note: 'aumento, desconto, variação' },
  ];

  const num = (s: string) => parseNumberBR(s);
  const pct = (s: string) => parseNumberBR(s) / 100;
  const ok = (...v: number[]) => v.every(Number.isFinite);
  const money = formatBRL;
  const perc = (v: number, d = 2) => formatPercent(v, d);
  const plain = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: d }) : '—');

  type Out<T> = { ok: true; v: T } | { ok: false; error: string };
  function attempt<T>(fn: () => T | null): Out<T> | null {
    try {
      const v = fn();
      return v === null ? null : { ok: true, v };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  function pick(t: FinTool) {
    if (t !== calcPrefs.fin) sound.play('tick');
    calcPrefs.set({ fin: t });
  }

  // ---------- investimento ----------
  let inv = $state({ initial: '1.000', monthly: '500', rate: '10,5', rateUnit: 'ano' as 'ano' | 'mes', term: '5', termUnit: 'anos' as 'anos' | 'meses', ir: true, goal: '' });
  const invAnnual = $derived(inv.rateUnit === 'ano' ? pct(inv.rate) : equivalentRate(pct(inv.rate), 12));
  const invMonths = $derived(Math.round(inv.termUnit === 'anos' ? num(inv.term) * 12 : num(inv.term)));
  const invRes = $derived(
    attempt(() => {
      const initial = inv.initial.trim() ? num(inv.initial) : 0;
      const monthly = inv.monthly.trim() ? num(inv.monthly) : 0;
      if (!ok(initial, monthly, invAnnual, invMonths)) return null;
      return simulateInvestment({ initial, monthly, annualRate: invAnnual, months: invMonths, incomeTax: inv.ir });
    }),
  );
  const invGoal = $derived(
    attempt(() => {
      const g = num(inv.goal);
      const initial = inv.initial.trim() ? num(inv.initial) : 0;
      if (!inv.goal.trim() || !ok(g, initial, invAnnual, invMonths) || invMonths < 1) return null;
      return monthlyFor(g, initial, invAnnual, invMonths);
    }),
  );
  const monthLabel = (m: number) => (invMonths > 24 ? (m % 12 === 0 ? `ano ${m / 12}` : m < 12 ? `${m} meses` : `${Math.floor(m / 12)}a ${m % 12}m`) : `mês ${m}`);

  // ---------- financiamento ----------
  let fin = $state({ value: '300.000', down: '60.000', rate: '0,9', rateUnit: 'mes' as 'mes' | 'ano', n: '360', show: 'price' as 'price' | 'sac', all: false });
  const finMonthly = $derived(fin.rateUnit === 'mes' ? pct(fin.rate) : equivalentRate(pct(fin.rate), 1 / 12));
  const finRes = $derived(
    attempt((): { price: AmortTable; sac: AmortTable; principal: number } | null => {
      const principal = num(fin.value) - (fin.down.trim() ? num(fin.down) : 0);
      const n = num(fin.n);
      if (!ok(principal, n, finMonthly)) return null;
      if (principal <= 0) throw new Error('A entrada cobre o valor todo: não há o que financiar');
      return { price: amortize('price', principal, finMonthly, n), sac: amortize('sac', principal, finMonthly, n), principal };
    }),
  );
  const SYSTEMS = ['price', 'sac'] as const;
  const finRows = $derived(finRes?.ok ? (fin.all ? finRes.v[fin.show].rows : finRes.v[fin.show].rows.slice(0, 12)) : []);

  // ---------- valor do dinheiro ----------
  let hp = $state({ n: '12', i: '1', pv: '1.000', pmt: '', fv: '0', when: 0 as 0 | 1 });
  let hpMsg = $state<{ key: TvmKey; text: string; error?: boolean } | null>(null);
  const HP_FIELDS: { key: TvmKey; label: string; hint: string; suffix?: string }[] = [
    { key: 'n', label: 'n', hint: 'períodos' },
    { key: 'i', label: 'i', hint: 'taxa por período', suffix: '%' },
    { key: 'pv', label: 'VP', hint: 'valor presente' },
    { key: 'pmt', label: 'PGTO', hint: 'parcela' },
    { key: 'fv', label: 'VF', hint: 'valor futuro' },
  ];
  function solveHp(key: TvmKey) {
    const t = { n: num(hp.n), i: pct(hp.i), pv: num(hp.pv || '0'), pmt: num(hp.pmt || '0'), fv: num(hp.fv || '0'), when: hp.when };
    const need = HP_FIELDS.filter((f) => f.key !== key && !Number.isFinite(f.key === 'i' ? t.i : t[f.key]));
    if (need.length) {
      hpMsg = { key, text: `Preencha ${need.map((f) => f.label).join(', ')}`, error: true };
      return;
    }
    try {
      const r = solveTvm(key, t);
      const v = key === 'i' ? r.i * 100 : r[key];
      hp[key] = v.toLocaleString('pt-BR', { maximumFractionDigits: key === 'i' ? 6 : key === 'n' ? 4 : 2 });
      hpMsg = { key, text: key === 'i' ? `i = ${perc(r.i, 4)} por período (${perc(equivalentRate(r.i, 12))} em 12 períodos)` : `${HP_FIELDS.find((f) => f.key === key)!.label} = ${key === 'n' ? plain(v, 4) : money(v)}` };
      sound.play('create');
    } catch (e) {
      hpMsg = { key, text: e instanceof Error ? e.message : String(e), error: true };
      sound.play('close');
    }
  }

  // ---------- fluxo de caixa ----------
  let flow = $state({ rate: '10', flows: ['-10.000', '3.000', '4.000', '5.000', '2.000'] });
  const flowRes = $derived(
    attempt(() => {
      const fs = flow.flows.map((s) => (s.trim() ? num(s) : 0));
      const r = pct(flow.rate);
      if (!ok(...fs) || fs.length < 2) return null;
      const out: { npv: number | null; irr: number | null; irrError?: string; pay: number | null; payD: number | null } = { npv: null, irr: null, pay: payback(fs), payD: null };
      if (Number.isFinite(r)) {
        out.npv = npv(r, fs);
        out.payD = payback(fs, r);
      }
      try {
        out.irr = irr(fs);
      } catch (e) {
        out.irrError = e instanceof Error ? e.message : String(e);
      }
      return out;
    }),
  );

  // ---------- taxas ----------
  const PERIODS: [string, number][] = [['mês', 1], ['bimestre', 2], ['trimestre', 3], ['semestre', 6], ['ano', 12]];
  let eq = $state({ rate: '1', from: 1, to: 12 });
  const eqRes = $derived(ok(pct(eq.rate)) ? equivalentRate(pct(eq.rate), eq.to / eq.from) : NaN);
  let real = $state({ nominal: '12', inflation: '4,5' });
  const realRes = $derived(ok(pct(real.nominal), pct(real.inflation)) ? realRate(pct(real.nominal), pct(real.inflation)) : NaN);
  let cdi = $state({ cdi: '10,65', share: '110', days: '365' });
  const cdiRes = $derived.by(() => {
    const annual = pct(cdi.cdi) * pct(cdi.share);
    const days = num(cdi.days);
    if (!ok(annual)) return null;
    const ir = ok(days) ? incomeTaxRate(days) : NaN;
    return { annual, monthly: equivalentRate(annual, 1 / 12), ir, net: annual * (1 - ir), cdbEquiv: pct(cdi.share) / (1 - ir) };
  });
  let nominal = $state({ rate: '12', per: '12' });
  const nominalRes = $derived(ok(pct(nominal.rate), num(nominal.per)) && num(nominal.per) > 0 ? effectiveRate(pct(nominal.rate), num(nominal.per)) : NaN);

  // ---------- porcentagem ----------
  let pc = $state({ p: '15', x: '200', part: '30', whole: '120', a: '80', b: '100', base: '250', change: '10', after: '110', rise: '10' });
  const pcOf = $derived(ok(pct(pc.p), num(pc.x)) ? pct(pc.p) * num(pc.x) : NaN);
  const pcShare = $derived(attempt(() => (ok(num(pc.part), num(pc.whole)) ? shareOf(num(pc.part), num(pc.whole)) : null)));
  const pcChange = $derived(attempt(() => (ok(num(pc.a), num(pc.b)) ? change(num(pc.a), num(pc.b)) : null)));
  const pcUp = $derived(ok(num(pc.base), pct(pc.change)) ? applyPercent(num(pc.base), pct(pc.change)) : NaN);
  const pcDown = $derived(ok(num(pc.base), pct(pc.change)) ? applyPercent(num(pc.base), -pct(pc.change)) : NaN);
  const pcBefore = $derived(attempt(() => (ok(num(pc.after), pct(pc.rise)) ? beforePercent(num(pc.after), pct(pc.rise)) : null)));
</script>

<div class="fin">
  <nav class="tools" aria-label="Ferramentas financeiras">
    {#each TOOLS as t (t.id)}
      <button class="tool" class:on={calcPrefs.fin === t.id} onclick={() => pick(t.id)}>
        <b>{t.label}</b><small>{t.note}</small>
      </button>
    {/each}
  </nav>

  <section class="body">
    {#if calcPrefs.fin === 'investir'}
      <h2>Investimento</h2>
      <p class="lead">Quanto o dinheiro rende com juros compostos e aportes todo mês. O IR segue a tabela regressiva da renda fixa, cada aporte pelo prazo dele.</p>
      <div class="form">
        <NumField label="Valor inicial" prefix="R$" bind:value={inv.initial} />
        <NumField label="Aporte mensal" prefix="R$" bind:value={inv.monthly} hint="no fim de cada mês" />
        <div class="pair">
          <NumField label="Rentabilidade" suffix="%" bind:value={inv.rate} />
          <div class="t-seg unit" role="group" aria-label="Período da taxa">
            <button class:on={inv.rateUnit === 'ano'} onclick={() => (inv.rateUnit = 'ano')}>a.a.</button>
            <button class:on={inv.rateUnit === 'mes'} onclick={() => (inv.rateUnit = 'mes')}>a.m.</button>
          </div>
        </div>
        <div class="pair">
          <NumField label="Prazo" bind:value={inv.term} />
          <div class="t-seg unit" role="group" aria-label="Unidade do prazo">
            <button class:on={inv.termUnit === 'anos'} onclick={() => (inv.termUnit = 'anos')}>anos</button>
            <button class:on={inv.termUnit === 'meses'} onclick={() => (inv.termUnit = 'meses')}>meses</button>
          </div>
        </div>
      </div>
      <label class="check"><input type="checkbox" bind:checked={inv.ir} /> Descontar IR (renda fixa tributada, como CDB e Tesouro)</label>

      {#if invRes && !invRes.ok}<p class="err">{invRes.error}</p>{/if}
      {#if invRes?.ok}
        {@const r = invRes.v}
        <div class="stats">
          <div class="stat"><span>Total investido</span><b>{money(r.invested)}</b></div>
          <div class="stat"><span>Juros</span><b>{money(r.interest)}</b></div>
          <div class="stat"><span>Valor bruto</span><b>{money(r.gross)}</b></div>
          {#if inv.ir}<div class="stat"><span>IR</span><b>− {money(r.tax)}</b></div>{/if}
          <div class="stat main"><span>{inv.ir ? 'Líquido' : 'Valor final'}</span><b>{money(r.net)}</b></div>
        </div>
        <p class="note">Taxa mensal equivalente: {perc(r.monthlyRate, 4)} · anual: {perc(invAnnual)}{#if r.invested > 0} · o dinheiro {r.net >= r.invested ? 'cresceu' : 'mudou'} {perc(r.net / r.invested - 1)}{/if}</p>
        {#if r.points.length > 1}
          <FinChart
            series={[
              { label: 'Saldo', color: 'var(--ember)', values: r.points.map((p) => p.balance), area: true },
              { label: 'Investido', color: 'var(--silver)', values: r.points.map((p) => p.invested) },
            ]}
            xLabel={monthLabel}
            fmt={money}
          />
        {/if}
      {/if}
      <div class="goal">
        <NumField label="Meta (opcional)" prefix="R$" bind:value={inv.goal} placeholder="100.000" hint="quanto aportar por mês para chegar lá" />
        {#if invGoal?.ok}
          <p class="answer">{invGoal.v <= 0 ? 'O valor inicial já chega lá sozinho, sem aportes.' : `Aporte ${money(invGoal.v)} por mês (antes do IR).`}</p>
        {:else if invGoal && !invGoal.ok}<p class="err">{invGoal.error}</p>{/if}
      </div>

    {:else if calcPrefs.fin === 'financiar'}
      <h2>Financiamento</h2>
      <p class="lead">Price tem parcela fixa; SAC começa mais alta e vai caindo, e no total paga menos juros.</p>
      <div class="form">
        <NumField label="Valor do bem" prefix="R$" bind:value={fin.value} />
        <NumField label="Entrada" prefix="R$" bind:value={fin.down} />
        <div class="pair">
          <NumField label="Juros" suffix="%" bind:value={fin.rate} />
          <div class="t-seg unit" role="group" aria-label="Período da taxa">
            <button class:on={fin.rateUnit === 'mes'} onclick={() => (fin.rateUnit = 'mes')}>a.m.</button>
            <button class:on={fin.rateUnit === 'ano'} onclick={() => (fin.rateUnit = 'ano')}>a.a.</button>
          </div>
        </div>
        <NumField label="Parcelas" bind:value={fin.n} hint="meses" />
      </div>
      {#if finRes && !finRes.ok}<p class="err">{finRes.error}</p>{/if}
      {#if finRes?.ok}
        {@const r = finRes.v}
        <p class="note">Financiado: <b>{money(r.principal)}</b> · juros de {perc(finMonthly, 4)} a.m. ({perc(equivalentRate(finMonthly, 12))} a.a.)</p>
        <div class="compare">
          {#each SYSTEMS as id (id)}
            {@const t = r[id]}
            <button class="sys" class:on={fin.show === id} onclick={() => (fin.show = id)}>
              <h3>{id === 'price' ? 'Price (parcela fixa)' : 'SAC (parcela caindo)'}</h3>
              <dl>
                <dt>1ª parcela</dt><dd>{money(t.rows[0]!.payment)}</dd>
                <dt>Última</dt><dd>{money(t.rows.at(-1)!.payment)}</dd>
                <dt>Total de juros</dt><dd>{money(t.totalInterest)}</dd>
                <dt>Total pago</dt><dd>{money(t.totalPaid)}</dd>
              </dl>
            </button>
          {/each}
        </div>
        <p class="note">No SAC você paga <b>{money(r.price.totalInterest - r.sac.totalInterest)}</b> a menos de juros, mas a primeira parcela é <b>{money(r.sac.rows[0]!.payment - r.price.rows[0]!.payment)}</b> maior.</p>
        <FinChart
          series={[
            { label: 'Parcela Price', color: 'var(--silver)', values: r.price.rows.map((x) => x.payment) },
            { label: 'Parcela SAC', color: 'var(--ember)', values: r.sac.rows.map((x) => x.payment) },
          ]}
          xLabel={(i) => `parcela ${i + 1}`}
          fmt={money}
        />
        <div class="table-head">
          <h3>Tabela {fin.show === 'price' ? 'Price' : 'SAC'}</h3>
          <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => (fin.all = !fin.all)}>{fin.all ? 'Só as 12 primeiras' : `Ver as ${r[fin.show].rows.length}`}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nº</th><th>Parcela</th><th>Juros</th><th>Amortização</th><th>Saldo</th></tr></thead>
            <tbody>
              {#each finRows as row (row.k)}
                <tr><td>{row.k}</td><td>{money(row.payment)}</td><td>{money(row.interest)}</td><td>{money(row.amortization)}</td><td>{money(row.balance)}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

    {:else if calcPrefs.fin === 'hp'}
      <h2>Valor do dinheiro</h2>
      <p class="lead">Preencha quatro valores e toque em <b>Calcular</b> no que falta, como na HP-12C. Sinais: dinheiro que <b>entra</b> é positivo, o que <b>sai</b> é negativo (pegar R$ 1.000 emprestado: VP = 1000, a parcela sai negativa).</p>
      <div class="hp">
        {#each HP_FIELDS as f (f.key)}
          <div class="hp-row" class:solved={hpMsg?.key === f.key && !hpMsg.error}>
            <NumField label={f.label} hint={f.hint} suffix={f.suffix ?? ''} bind:value={hp[f.key]} placeholder="" />
            <button class="t-btn" onclick={() => solveHp(f.key)}>Calcular</button>
          </div>
        {/each}
      </div>
      <div class="t-seg" role="group" aria-label="Quando paga">
        <button class:on={hp.when === 0} onclick={() => (hp.when = 0)} title="Parcela no fim de cada período">Pagamento no fim</button>
        <button class:on={hp.when === 1} onclick={() => (hp.when = 1)} title="Parcela no começo (com entrada)">No começo</button>
      </div>
      {#if hpMsg}<p class={hpMsg.error ? 'err' : 'answer'}>{hpMsg.text}</p>{/if}
      <p class="note">Nas folhas de cálculo as mesmas contas existem como função: <code>pgto(1%; 12; 1000)</code>, <code>vf</code>, <code>vp</code>, <code>nper</code>, <code>taxa</code>.</p>

    {:else if calcPrefs.fin === 'fluxo'}
      <h2>VPL e TIR</h2>
      <p class="lead">Um valor por período, começando pelo momento zero (o investimento, negativo). Valores em branco contam como zero.</p>
      <div class="form narrow">
        <NumField label="Taxa de desconto" suffix="% por período" bind:value={flow.rate} hint="o custo do dinheiro (TMA)" />
      </div>
      <ol class="flows">
        {#each flow.flows as _, i (i)}
          <li>
            <span class="k">{i === 0 ? 'Hoje' : `Período ${i}`}</span>
            <input class="t-input" bind:value={flow.flows[i]} inputmode="decimal" aria-label={`Fluxo do período ${i}`} class:bad={flow.flows[i]!.trim() !== '' && Number.isNaN(num(flow.flows[i]!))} />
            <button class="t-btn t-btn--sm t-btn--quiet t-btn--icon" onclick={() => flow.flows.splice(i, 1)} disabled={flow.flows.length <= 2} aria-label="Tirar este período" title="Tirar">×</button>
          </li>
        {/each}
      </ol>
      <button class="t-btn t-btn--sm" onclick={() => flow.flows.push('')}>+ Período</button>
      {#if flowRes?.ok}
        {@const r = flowRes.v}
        <div class="stats">
          <div class="stat main"><span>VPL</span><b class:neg={r.npv !== null && r.npv < 0}>{r.npv === null ? '—' : money(r.npv)}</b></div>
          <div class="stat"><span>TIR</span><b>{r.irr === null ? '—' : perc(r.irr)}</b></div>
          <div class="stat"><span>Payback</span><b>{r.pay === null ? 'não paga' : `${plain(r.pay)} períodos`}</b></div>
          <div class="stat"><span>Payback descontado</span><b>{r.payD === null ? 'não paga' : `${plain(r.payD)} períodos`}</b></div>
        </div>
        {#if r.irrError}<p class="note">{r.irrError}</p>{/if}
        {#if r.npv !== null}<p class="answer">{r.npv >= 0 ? 'VPL positivo: o projeto rende mais que a taxa de desconto.' : 'VPL negativo: rende menos que a taxa de desconto.'}</p>{/if}
      {/if}

    {:else if calcPrefs.fin === 'taxas'}
      <h2>Taxas</h2>
      <div class="cards">
        <article class="t-card card">
          <h3>Taxa equivalente</h3>
          <NumField label="Taxa" suffix="%" bind:value={eq.rate} />
          <div class="sel-row">
            <label>ao <select class="t-select" bind:value={eq.from}>{#each PERIODS as [n, v] (n)}<option value={v}>{n}</option>{/each}</select></label>
            <span>→</span>
            <label>ao <select class="t-select" bind:value={eq.to}>{#each PERIODS as [n, v] (n)}<option value={v}>{n}</option>{/each}</select></label>
          </div>
          <p class="big">{perc(eqRes, 4)}</p>
        </article>
        <article class="t-card card">
          <h3>Taxa real</h3>
          <NumField label="Rendimento" suffix="%" bind:value={real.nominal} />
          <NumField label="Inflação no período" suffix="%" bind:value={real.inflation} />
          <p class="big">{perc(realRes)}</p>
          <small>Quanto o poder de compra cresceu de verdade (Fisher).</small>
        </article>
        <article class="t-card card">
          <h3>% do CDI</h3>
          <NumField label="CDI" suffix="% a.a." bind:value={cdi.cdi} />
          <NumField label="Rende" suffix="% do CDI" bind:value={cdi.share} />
          <NumField label="Prazo" suffix="dias" bind:value={cdi.days} hint="para o IR" />
          {#if cdiRes}
            <p class="big">{perc(cdiRes.annual)} a.a.</p>
            <small>{perc(cdiRes.monthly, 3)} a.m. · líquido de IR ({perc(cdiRes.ir, 1)}): {perc(cdiRes.net)} a.a.</small>
            {#if Number.isFinite(cdiRes.cdbEquiv)}<small>Se for isento (LCI, LCA), equivale a um CDB de <b>{perc(cdiRes.cdbEquiv, 1)} do CDI</b>.</small>{/if}
          {/if}
        </article>
        <article class="t-card card">
          <h3>Nominal → efetiva</h3>
          <NumField label="Taxa nominal" suffix="% a.a." bind:value={nominal.rate} />
          <NumField label="Capitalizações por ano" bind:value={nominal.per} hint="12 = mensal" />
          <p class="big">{perc(nominalRes, 4)} a.a.</p>
        </article>
      </div>

    {:else}
      <h2>Porcentagem</h2>
      <div class="cards">
        <article class="t-card card">
          <h3>Quanto é</h3>
          <div class="inline"><NumField label="" suffix="%" bind:value={pc.p} /><span>de</span><NumField label="" bind:value={pc.x} /></div>
          <p class="big">{plain(pcOf, 4)}</p>
        </article>
        <article class="t-card card">
          <h3>Que porcentagem</h3>
          <div class="inline"><NumField label="" bind:value={pc.part} /><span>é de</span><NumField label="" bind:value={pc.whole} /></div>
          <p class="big">{pcShare?.ok ? perc(pcShare.v, 4) : '—'}</p>
          {#if pcShare && !pcShare.ok}<small class="err">{pcShare.error}</small>{/if}
        </article>
        <article class="t-card card">
          <h3>Variação</h3>
          <div class="inline"><span>de</span><NumField label="" bind:value={pc.a} /><span>para</span><NumField label="" bind:value={pc.b} /></div>
          <p class="big">{pcChange?.ok ? `${pcChange.v > 0 ? '+' : ''}${perc(pcChange.v, 4)}` : '—'}</p>
          {#if pcChange && !pcChange.ok}<small class="err">{pcChange.error}</small>{/if}
        </article>
        <article class="t-card card">
          <h3>Aumento e desconto</h3>
          <div class="inline"><NumField label="" bind:value={pc.base} /><span>±</span><NumField label="" suffix="%" bind:value={pc.change} /></div>
          <p class="big">{plain(pcUp, 4)} <small>com aumento</small></p>
          <p class="big">{plain(pcDown, 4)} <small>com desconto</small></p>
        </article>
        <article class="t-card card">
          <h3>Valor antes do aumento</h3>
          <div class="inline"><NumField label="" bind:value={pc.after} /><span>depois de</span><NumField label="" suffix="%" bind:value={pc.rise} /></div>
          <p class="big">{pcBefore?.ok ? plain(pcBefore.v, 4) : '—'}</p>
          <small>Para tirar um desconto, use a porcentagem negativa (−20).</small>
        </article>
      </div>
    {/if}
  </section>
</div>

<style>
  .fin { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px minmax(0, 1fr); }
  .tools { display: flex; flex-direction: column; gap: 2px; padding: var(--sp-4) var(--sp-2); border-right: 1px solid var(--line); overflow-y: auto; }
  .tool { display: grid; gap: 1px; text-align: left; border: 0; border-left: 2px solid transparent; background: none; border-radius: var(--r-sm);
    padding: 8px 10px; color: var(--ink); transition: background var(--dur), border-color var(--dur); }
  .tool:hover { background: var(--surface-2); }
  .tool.on { background: var(--surface-2); border-left-color: var(--ember); }
  .tool b { font-weight: 600; font-size: var(--fs-md); }
  .tool small { font-size: var(--fs-xs); color: var(--muted); }

  .body { min-width: 0; min-height: 0; overflow-y: auto; padding: var(--sp-6) var(--gutter) var(--sp-8); display: flex; flex-direction: column; gap: var(--sp-4); }
  .body > * { max-width: 920px; width: 100%; }
  .body > .t-seg { width: auto; align-self: flex-start; }
  h2 { margin: 0; font: 600 var(--fs-xl) var(--f-display); }
  h3 { margin: 0; font: 600 var(--fs-sm) var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--silver); }
  .lead { margin: -8px 0 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.55; }
  .form { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); }
  .form.narrow { max-width: 320px; }
  .pair { display: flex; align-items: end; gap: 6px; min-width: 0; }
  .pair > :global(.nf) { flex: 1; }
  .unit > button { font-size: var(--fs-xs); padding: 0 8px; }
  .check { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--silver); }
  .check input { accent-color: var(--ember); }

  .stats { display: grid; gap: var(--sp-2); grid-template-columns: repeat(auto-fill, minmax(min(160px, 100%), 1fr)); }
  .stat { display: grid; gap: 4px; padding: var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); min-width: 0; }
  .stat span { font-size: var(--fs-xs); color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
  .stat b { font: 600 var(--fs-lg) var(--f-mono); overflow-wrap: anywhere; }
  .stat.main { border-color: var(--ember); background: color-mix(in srgb, var(--ember) 7%, var(--surface)); }
  .stat.main b { color: var(--ember); }
  b.neg { color: var(--crit) !important; }
  .note { margin: 0; font-size: var(--fs-sm); color: var(--muted); line-height: 1.55; }
  .note b { color: var(--ink); font-family: var(--f-mono); font-weight: 500; }
  .answer { margin: 0; font-size: var(--fs-md); color: var(--ink); }
  .err { margin: 0; color: var(--crit); font-size: var(--fs-sm); }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .goal { display: grid; gap: var(--sp-2); max-width: 420px; padding-top: var(--sp-2); border-top: 1px dashed var(--line); }

  .compare { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); }
  .sys { text-align: left; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); padding: var(--sp-4); color: var(--ink);
    display: grid; gap: var(--sp-2); transition: border-color var(--dur); }
  .sys:hover { border-color: var(--muted); }
  .sys.on { border-color: var(--ember); }
  dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: var(--fs-sm); }
  dt { color: var(--muted); }
  dd { margin: 0; text-align: right; font-family: var(--f-mono); }
  .table-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--r-md); }
  table { width: 100%; border-collapse: collapse; font: var(--fs-sm) var(--f-mono); }
  th, td { padding: 6px 10px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--line); }
  th { font: 600 var(--fs-xs) var(--f-display); text-transform: uppercase; letter-spacing: .08em; color: var(--muted); background: var(--surface); position: sticky; top: 0; }
  th:first-child, td:first-child { text-align: left; color: var(--muted); }
  tbody tr:last-child td { border-bottom: 0; }

  .hp { display: grid; gap: var(--sp-2); max-width: 520px; }
  .hp-row { display: flex; align-items: end; gap: var(--sp-2); }
  .hp-row > :global(.nf) { flex: 1; }
  .hp-row.solved :global(.box) { border-color: var(--ok); }

  .flows { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; max-width: 420px; }
  .flows li { display: grid; grid-template-columns: 86px minmax(0, 1fr) auto; align-items: center; gap: var(--sp-2); }
  .flows .k { font: var(--fs-xs) var(--f-mono); color: var(--muted); }
  .flows input { font-family: var(--f-mono); }
  .flows input.bad { border-color: var(--crit); }

  .cards { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); }
  .card { display: grid; gap: var(--sp-2); align-content: start; padding: var(--sp-4); }
  .card small { font-size: var(--fs-xs); color: var(--muted); line-height: 1.5; }
  .card small b { color: var(--ink); }
  .big { margin: 0; font: 600 var(--fs-xl) var(--f-mono); color: var(--ember); overflow-wrap: anywhere; }
  .big small { font: var(--fs-xs) var(--f-body); color: var(--muted); }
  .sel-row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-sm); color: var(--muted); }
  .sel-row label { display: flex; align-items: center; gap: 6px; }
  .inline { display: flex; align-items: end; gap: var(--sp-2); flex-wrap: wrap; }
  .inline > :global(.nf) { flex: 1 1 90px; }
  .inline > span { font-size: var(--fs-sm); color: var(--muted); padding-bottom: 9px; }

  @media (max-width: 720px) {
    .fin { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .tools { flex-direction: row; flex-wrap: wrap; gap: 6px; padding: var(--sp-3) var(--gutter); border-right: 0; border-bottom: 1px solid var(--line); }
    .tool { border: 1px solid var(--line); border-radius: var(--r-pill); padding: 5px 12px; }
    .tool.on { border-color: var(--ember); color: var(--ember); }
    .tool b { font-size: var(--fs-sm); font-weight: 500; }
    .tool small { display: none; }
    .body { padding-top: var(--sp-4); }
  }
</style>
