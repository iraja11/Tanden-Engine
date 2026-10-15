<script lang="ts">
  import {
    CARE_NOTE, GEAR_CHOICES, GOALS, LEVELS, LIMITS, MUSCLES, PLAN_NOTE, estimateMinutes, exerciseByName, volumeTarget, weekdayName,
    weeklyVolume, isoWeek, type NudgeKind, type PlanDay, type Profile,
  } from '@tanden/core';
  import { rise } from '../motion';
  import { hhmm, saude, type DraftItem } from './saude.svelte';

  // Tela Saúde: água, pausas e treino.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  const c = $derived(saude.config);
  const t = $derived(saude.todayCare);
  const pct = $derived(Math.min(1, t.ml / Math.max(1, c.agua.goalMl)));
  const week = $derived(saude.week);
  const weekMax = $derived(Math.max(c.agua.goalMl, ...week.map((d) => d.ml)));
  const nextWater = $derived(saude.nextAt('agua'));
  const nextBreak = $derived(saude.nextAt('pausa'));

  const wk = $derived(isoWeek(saude.day));
  const weekSessions = $derived(saude.sessions.filter((s) => s.day >= wk.monday && s.day <= wk.sunday));
  const volume = $derived(weeklyVolume(saude.sessions, saude.day));
  const [vMin, vMax] = $derived(volumeTarget(saude.profile.goal));
  const recent = $derived([...saude.sessions].reverse().slice(0, 6));
  const next = $derived(saude.nextWorkout);

  let showConfig = $state(false);
  let editing = $state(false);
  let form = $state<Profile>({ ...saude.profile });
  let openDay = $state<string | null>(null);

  const R = 52;
  const C = 2 * Math.PI * R;
  const DAYS = [1, 2, 3, 4, 5, 6, 0];
  const dayShort = (d: string) => new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'narrow' });

  function editProfile() {
    form = structuredClone($state.snapshot(saude.profile));
    editing = true;
  }

  function toggle<T>(list: T[], x: T): T[] {
    return list.includes(x) ? list.filter((y) => y !== x) : [...list, x];
  }

  function savePlan(e: SubmitEvent) {
    e.preventDefault();
    if (!form.days.length) return;
    if (saude.hasPlan && saude.plan.days.length && !confirm('Refazer o plano? Mudanças feitas à mão nos exercícios serão substituídas (os treinos já feitos ficam).')) return;
    saude.makePlan($state.snapshot(form) as Profile);
    editing = false;
  }

  function setNudge(kind: NudgeKind, key: 'every' | 'from' | 'to', value: string) {
    saude.setConfig((cfg) => {
      if (key === 'every') cfg[kind].every = Math.max(10, Math.min(240, Math.round(+value) || cfg[kind].every));
      else if (/^\d{2}:\d{2}$/.test(value)) cfg[kind][key] = value;
      if (cfg[kind].to <= cfg[kind].from) cfg[kind].to = cfg[kind].from === '23:00' ? '23:59' : `${String(Math.min(23, +cfg[kind].from.slice(0, 2) + 1)).padStart(2, '0')}${cfg[kind].from.slice(2)}`;
    });
  }

  // ---- treino em andamento
  function tapSet(it: DraftItem, i: number) {
    const s = it.sets[i]!;
    if (!s.done) {
      s.done = true;
      if (s.value === null) s.value = it.target;
    } else {
      s.done = false;
    }
    saude.saveDraft();
  }
  const unitLabel = (u: string) => (u === 's' ? 's' : u === 'min' ? 'min' : 'rep');
  const doneSets = $derived(saude.draft ? saude.draft.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0) : 0);
  const totalSets = $derived(saude.draft ? saude.draft.items.reduce((a, it) => a + it.sets.length, 0) : 0);

  const rangeLabel = (it: PlanDay['items'][number]) =>
    it.unit === 'min' ? `${it.hi} min` : `${it.sets}×${it.lo === it.hi ? it.hi : `${it.lo}-${it.hi}`}${it.unit === 's' ? 's' : ''}`;
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
</script>

<section class="saude">
  <header>
    <div>
      <h2>Saúde</h2>
      <p class="hello">Água, pausas e treino</p>
    </div>
    <div class="stats">
      <span class:ok={t.ml >= c.agua.goalMl}><b>{t.ml}</b> / {c.agua.goalMl} ml</span>
      <span><b>{t.breaks}</b> {t.breaks === 1 ? 'pausa' : 'pausas'} hoje</span>
      {#if saude.hasPlan}<span class:ok={weekSessions.length >= saude.profile.days.length}><b>{weekSessions.length}</b> / {saude.profile.days.length} treinos na semana</span>{/if}
    </div>
  </header>

  {#if saude.error}<p class="err">{saude.error}</p>{/if}

  <div class="grid">
    <div class="col">
      <!-- água -->
      <section class="card water">
        <h3>Água <button class="link" onclick={() => onOpenNote(CARE_NOTE)}>nota</button></h3>
        <div class="wrow">
          <svg class="ring" viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r={R} class="track" />
            <circle cx="64" cy="64" r={R} class="fill" stroke-dasharray={C} stroke-dashoffset={C * (1 - pct)} />
            <text x="64" y="60" class="big">{Math.round(pct * 100)}%</text>
            <text x="64" y="80" class="small">{t.ml} ml</text>
          </svg>
          <div class="wact">
            <button class="pri" onclick={() => saude.drink()}>+ Copo ({c.agua.cupMl} ml)</button>
            <div class="chips">
              {#each [150, 500] as ml (ml)}<button onclick={() => saude.drink(ml)}>+{ml}</button>{/each}
              <button disabled={!t.cups} onclick={() => saude.undoDrink()} title="Desfazer o último copo">↶ desfazer</button>
            </div>
            <small>
              {#if t.ml >= c.agua.goalMl}Meta batida hoje. 💧
              {:else if saude.behindMl >= c.agua.cupMl}{saude.behindMl} ml atrás do ritmo do dia.
              {:else}No ritmo. Faltam {c.agua.goalMl - t.ml} ml.{/if}
              {#if t.lastDrink} · último às {hhmm(t.lastDrink)}{/if}
            </small>
            <small class="next">
              {#if !saude.local.notify.agua}Avisos de água desligados neste aparelho.
              {:else if saude.quietToday('agua')}Sem avisos hoje. <button class="link" onclick={() => saude.setQuietToday('agua', false)}>voltar a avisar</button>
              {:else if nextWater}Próximo aviso: {hhmm(nextWater)}{new Date(nextWater).getDate() !== new Date(saude.now).getDate() ? ' (amanhã)' : ''}
              {:else}Sem avisos marcados.{/if}
            </small>
          </div>
        </div>
        <div class="bars7" aria-label="Água nos últimos 7 dias">
          {#each week as d (d.day)}
            <div class="b" title="{dm(d.day)}: {d.ml} ml">
              <i style:height="{(d.ml / weekMax) * 100}%" class:ok={d.ml >= c.agua.goalMl}></i>
              <span>{dayShort(d.day)}</span>
            </div>
          {/each}
        </div>
      </section>

      <!-- pausas -->
      <section class="card">
        <h3>Pausas</h3>
        <div class="brow">
          <button class="pri" onclick={() => saude.stood()}>🧍 Levantei</button>
          <div>
            <small><b>{t.breaks}</b> hoje{#if t.lastBreak} · a última às {hhmm(t.lastBreak)}{/if}</small>
            <small class="next">
              {#if !saude.local.notify.pausa}Avisos de pausa desligados neste aparelho.
              {:else if saude.quietToday('pausa')}Sem avisos hoje. <button class="link" onclick={() => saude.setQuietToday('pausa', false)}>voltar a avisar</button>
              {:else if nextBreak}Próximo aviso: {hhmm(nextBreak)}{new Date(nextBreak).getDate() !== new Date(saude.now).getDate() ? ' (outro dia)' : ''}
              {:else}Fora do horário de pausas.{/if}
            </small>
          </div>
        </div>
        <div class="chips">
          <button onclick={() => saude.snooze('pausa')}>Adiar 15 min</button>
          <button onclick={() => saude.snooze('agua')}>Adiar água 30 min</button>
          {#if !saude.quietToday('pausa')}<button onclick={() => saude.setQuietToday('pausa', true)}>Sem pausas hoje</button>{/if}
          {#if !saude.quietToday('agua')}<button onclick={() => saude.setQuietToday('agua', true)}>Sem água hoje</button>{/if}
        </div>
      </section>

      <!-- configuração -->
      <section class="card">
        <h3><button class="fold" onclick={() => (showConfig = !showConfig)} aria-expanded={showConfig}>{showConfig ? '▾' : '▸'} Lembretes de água e pausa</button></h3>
        {#if showConfig}
          <div class="cfg" in:rise={{ y: -4 }}>
            {#each [['agua', 'Água'], ['pausa', 'Pausa']] as [k, label] (k)}
              {@const kind = k as NudgeKind}
              {@const n = c[kind]}
              <fieldset>
                <legend>{label}</legend>
                <label class="sw"><input type="checkbox" checked={n.on} onchange={(e) => saude.setConfig((cfg) => (cfg[kind].on = e.currentTarget.checked))} /> Lembrar (todos os aparelhos)</label>
                <label class="sw"><input type="checkbox" checked={saude.local.notify[kind]} onchange={(e) => saude.setNotify(kind, e.currentTarget.checked)} /> Avisar neste aparelho</label>
                <div class="line">
                  <label>A cada
                    <select value={String(n.every)} onchange={(e) => setNudge(kind, 'every', e.currentTarget.value)}>
                      {#each [...new Set([20, 30, 45, 50, 60, 90, 120, n.every])].sort((a, b) => a - b) as m (m)}<option value={String(m)}>{m} min</option>{/each}
                    </select>
                  </label>
                  <label>das <input type="time" value={n.from} onchange={(e) => setNudge(kind, 'from', e.currentTarget.value)} /></label>
                  <label>às <input type="time" value={n.to} onchange={(e) => setNudge(kind, 'to', e.currentTarget.value)} /></label>
                </div>
                <div class="days">
                  {#each DAYS as d (d)}
                    <button class:on={n.days.includes(d)} aria-pressed={n.days.includes(d)}
                      onclick={() => saude.setConfig((cfg) => { const next = toggle(cfg[kind].days, d); if (next.length) cfg[kind].days = next.sort(); })}>{weekdayName(d)}</button>
                  {/each}
                </div>
                {#if kind === 'agua'}
                  <div class="line">
                    <label>Meta <input type="number" min="250" max="8000" step="250" value={c.agua.goalMl}
                      onchange={(e) => saude.setConfig((cfg) => (cfg.agua.goalMl = Math.max(250, Math.min(8000, Math.round(+e.currentTarget.value) || cfg.agua.goalMl))))} /> ml</label>
                    <label>Copo <input type="number" min="50" max="2000" step="50" value={c.agua.cupMl}
                      onchange={(e) => saude.setConfig((cfg) => (cfg.agua.cupMl = Math.max(50, Math.min(2000, Math.round(+e.currentTarget.value) || cfg.agua.cupMl))))} /> ml</label>
                  </div>
                {/if}
              </fieldset>
            {/each}
            <p class="hint">A contagem recomeça a cada copo ou pausa registrada, e a água para de avisar quando a meta do dia é batida. No celular, os botões do aviso registram sem abrir o app.</p>
          </div>
        {/if}
      </section>
    </div>

    <div class="col">
      {#if saude.draft}
        {@const d = saude.draft}
        <!-- treino em andamento -->
        <section class="card live" in:rise>
          <h3>Treinando <span>{d.title}</span><span class="prog">{doneSets}/{totalSets} séries</span></h3>
          <ol class="log">
            {#each d.items as it, i (i)}
              {@const ex = exerciseByName(it.name)}
              <li class:all={it.sets.every((s) => s.done)}>
                <div class="lh">
                  <b>{it.name}</b>
                  {#if it.unit !== 'min' && it.unit !== 's' && (it.load !== null || (ex && ['barra', 'halter', 'maquina', 'polia'].includes(ex.load)))}
                    <label class="kg"><input type="number" min="0" step="0.5" inputmode="decimal" value={it.load ?? ''} placeholder="kg"
                      onchange={(e) => { const v = parseFloat(e.currentTarget.value.replace(',', '.')); it.load = Number.isFinite(v) ? v : null; saude.saveDraft(); }} /> kg</label>
                  {/if}
                </div>
                <small class="sg sg-{it.suggestion.kind}">{it.suggestion.hint}{#if ex?.tip} · {ex.tip}{/if}</small>
                <div class="sets">
                  {#each it.sets as s, k (k)}
                    <span class="set" class:done={s.done}>
                      <button onclick={() => tapSet(it, k)} aria-pressed={s.done} title={s.done ? 'Desmarcar' : 'Feita'}>{s.done ? '✓' : k + 1}</button>
                      <input type="number" min="0" inputmode="numeric" value={s.value ?? ''} placeholder={String(it.target)}
                        aria-label="{it.name}, série {k + 1}"
                        onchange={(e) => { const v = parseFloat(e.currentTarget.value.replace(',', '.')); s.value = Number.isFinite(v) ? v : null; s.done = s.value !== null && s.value > 0; saude.saveDraft(); }} />
                      <em>{unitLabel(it.unit)}</em>
                    </span>
                  {/each}
                  {#if it.rest}<small class="rest">descanso {it.rest >= 120 ? `${Math.round(it.rest / 60 * 10) / 10} min` : `${it.rest}s`}</small>{/if}
                </div>
              </li>
            {/each}
          </ol>
          <div class="line">
            <label>Esforço
              <select value={d.effort === null ? '' : String(d.effort)} onchange={(e) => { d.effort = e.currentTarget.value ? +e.currentTarget.value : null; saude.saveDraft(); }}>
                <option value="">—</option>
                {#each [4, 5, 6, 7, 8, 9, 10] as n (n)}<option value={String(n)}>{n} {n <= 5 ? '(leve)' : n <= 7 ? '(moderado)' : n <= 9 ? '(pesado)' : '(máximo)'}</option>{/each}
              </select>
            </label>
          </div>
          <textarea rows="2" placeholder="Notas do treino (opcional)" value={d.notes} oninput={(e) => { d.notes = e.currentTarget.value; saude.saveDraft(); }}></textarea>
          <div class="end">
            <button class="ghost" onclick={() => { if (confirm('Descartar este treino?')) saude.cancelWorkout(); }}>Descartar</button>
            <button class="pri" onclick={() => { const p = saude.finishWorkout(); if (p) openDay = null; }}>Concluir treino</button>
          </div>
        </section>
      {:else if !saude.hasPlan || !saude.plan.days.length || editing}
        <!-- perfil -->
        <form class="card profile" onsubmit={savePlan} in:rise>
          <h3>{saude.hasPlan && saude.plan.days.length ? 'Refazer meu plano' : 'Montar meu plano de treino'}</h3>
          {#if saude.hasPlan && !saude.plan.days.length && !editing}
            <p class="hint">A nota <button type="button" class="link" onclick={() => onOpenNote(PLAN_NOTE)}>Saúde/Treino</button> existe, mas não achei treinos nela (seções <code>## A · Nome</code> com linhas <code>- Exercício · 3×8-12 · 90s</code>).</p>
          {/if}
          <p class="q">Objetivo</p>
          <div class="chips">
            {#each GOALS as g (g.id)}<button type="button" class:on={form.goal === g.id} onclick={() => (form.goal = g.id)}>{g.label}</button>{/each}
          </div>
          <p class="q">Nível</p>
          <div class="chips">
            {#each LEVELS as l, i (l)}<button type="button" class:on={form.level === i + 1} onclick={() => (form.level = (i + 1) as 1 | 2 | 3)}>{l}</button>{/each}
          </div>
          <p class="q">Dias de treino <small>({form.days.length} por semana{form.days.length > 6 ? ', no máximo 6 viram treino' : ''})</small></p>
          <div class="days">
            {#each DAYS as d (d)}<button type="button" class:on={form.days.includes(d)} onclick={() => (form.days = toggle(form.days, d).sort())}>{weekdayName(d)}</button>{/each}
          </div>
          <p class="q">Tempo por treino</p>
          <div class="chips">
            {#each [20, 30, 45, 60, 75, 90] as m (m)}<button type="button" class:on={form.minutes === m} onclick={() => (form.minutes = m)}>{m} min</button>{/each}
          </div>
          <p class="q">Equipamento <small>(nada marcado: só peso do corpo)</small></p>
          <div class="chips">
            {#each GEAR_CHOICES as g (g.id)}<button type="button" class:on={form.gear.includes(g.id)} onclick={() => (form.gear = toggle(form.gear, g.id))}>{g.label}</button>{/each}
          </div>
          <p class="q">Poupar <small>(evita exercícios que costumam incomodar)</small></p>
          <div class="chips">
            {#each LIMITS as l (l.id)}<button type="button" class:on={form.avoid.includes(l.id)} onclick={() => (form.avoid = toggle(form.avoid, l.id))}>{l.label}</button>{/each}
          </div>
          <p class="q">Lembrete nos dias de treino</p>
          <div class="line">
            <label class="sw"><input type="checkbox" checked={form.time !== null} onchange={(e) => (form.time = e.currentTarget.checked ? form.time ?? '07:00' : null)} /> Avisar às</label>
            <input type="time" value={form.time ?? '07:00'} disabled={form.time === null} onchange={(e) => (form.time = e.currentTarget.value || null)} />
          </div>
          <div class="end">
            {#if editing}<button type="button" class="ghost" onclick={() => (editing = false)}>Cancelar</button>{/if}
            <button class="pri" disabled={!form.days.length}>{saude.hasPlan && saude.plan.days.length ? 'Refazer o plano' : 'Montar o plano'}</button>
          </div>
          <p class="hint">O plano vira a nota Saúde/Treino, que você pode editar à mão. Não substitui orientação profissional: com dor ou condição de saúde, fale com um médico ou educador físico.</p>
        </form>
      {:else}
        <!-- hoje -->
        <section class="card today" in:rise>
          <h3>Treino</h3>
          {#if saude.doneToday.length}
            <p class="big">Treino de hoje feito. 💪</p>
            <small>{saude.doneToday.map((s) => s.title).join(', ')}{#if next} · próximo: {next.key} · {next.name}{/if}</small>
          {:else if next}
            <p class="big">{saude.trainingToday ? 'Hoje é dia de' : 'Hoje é descanso. Próximo:'} <b>{next.key} · {next.name}</b></p>
            <small>{next.items.length} exercícios · cerca de {estimateMinutes(next)} min</small>
          {/if}
          {#if next}
            <div class="end">
              <button class="pri" onclick={() => saude.startWorkout(next)}>{saude.trainingToday && !saude.doneToday.length ? 'Começar' : 'Treinar mesmo assim'}</button>
            </div>
          {/if}
        </section>

        <section class="card">
          <h3>Meu plano <button class="link" onclick={() => onOpenNote(PLAN_NOTE)}>nota</button><button class="link" onclick={editProfile}>refazer</button></h3>
          <ul class="days-list">
            {#each saude.plan.days as d (d.key)}
              <li>
                <button class="dh" onclick={() => (openDay = openDay === d.key ? null : d.key)} aria-expanded={openDay === d.key}>
                  <b>{d.key}</b> {d.name} <small>{d.items.length} exercícios · ~{estimateMinutes(d)} min</small>
                  {#if next?.key === d.key}<em>próximo</em>{/if}
                </button>
                {#if openDay === d.key}
                  <ol class="ex" in:rise={{ y: -4 }}>
                    {#each d.items as it, i (i)}
                      {@const sg = saude.suggestionFor(it.name, it)}
                      <li>
                        <div class="er"><span>{it.name}</span><code>{rangeLabel(it)}</code>
                          <button class="ghost" title="Trocar por outro do mesmo tipo" onclick={() => saude.swap(d.key, i)}>↻</button>
                        </div>
                        {#if sg.kind !== 'novo'}<small class="sg sg-{sg.kind}">{sg.hint}</small>{/if}
                      </li>
                    {/each}
                  </ol>
                  <div class="end"><button class="pri" onclick={() => saude.startWorkout(d)}>Fazer o treino {d.key}</button></div>
                {/if}
              </li>
            {/each}
          </ul>
        </section>

        <section class="card">
          <h3>Semana <span>{weekSessions.length}/{saude.profile.days.length}</span></h3>
          <div class="wk">
            {#each DAYS as d (d)}
              {@const date = (() => { const [y, m, dd] = wk.monday.split('-').map(Number); const x = new Date(y!, m! - 1, dd! + ((d + 6) % 7)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; })()}
              {@const did = weekSessions.some((s) => s.day === date)}
              <span class="wd" class:plan={saude.profile.days.includes(d)} class:did class:today={date === saude.day} title={did ? 'Treinou' : saude.profile.days.includes(d) ? 'Dia de treino' : 'Descanso'}>{weekdayName(d)}</span>
            {/each}
          </div>
          <p class="q">Séries por músculo (7 dias) <small>alvo {vMin}–{vMax}</small></p>
          <ul class="vol">
            {#each MUSCLES as m (m)}
              {@const v = volume[m]}
              <li><span>{m}</span><div class="bar"><i style:width="{Math.min(1, v / vMax) * 100}%" class:low={v < vMin} class:ok={v >= vMin && v <= vMax}></i><u style:left="{(vMin / vMax) * 100}%"></u></div><b>{Math.round(v * 10) / 10}</b></li>
            {/each}
          </ul>
          {#if recent.length}
            <p class="q">Últimos treinos</p>
            <ul class="recent">
              {#each recent as s (s.path)}
                <li><button class="link" onclick={() => onOpenNote(s.path)}>{dm(s.day)} · {s.title}</button><small>{s.items.filter((x) => x.done).length} exercícios{s.minutes ? ` · ${s.minutes} min` : ''}{s.effort ? ` · esforço ${s.effort}` : ''}</small></li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </div>
  </div>
</section>

<style>
  .saude { height: 100%; overflow-y: auto; width: 100%; max-width: 1080px; margin: 0 auto; padding: 18px 24px 32px; box-sizing: border-box; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  h2 { margin: 0 0 6px; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .hello { margin: 0; font: 600 22px var(--f-display); color: var(--ink); }
  .stats { display: flex; gap: 8px; flex-wrap: wrap; }
  .stats span { padding: 5px 10px; border-radius: 99px; background: var(--surface); border: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .stats b { color: var(--ink); font-family: var(--f-mono); }
  .stats .ok b { color: var(--ok); }
  .err { color: var(--crit); font-size: 13px; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
  .col { display: grid; gap: 14px; min-width: 0; }
  .card { padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); min-width: 0; }
  h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font: 600 11px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h3 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; text-transform: none; }
  h3 .link { text-transform: none; letter-spacing: 0; font: 11px var(--f-mono); }
  h3 .link:first-of-type { margin-left: auto; }
  h3 .prog { margin-left: auto; color: var(--muted); }
  .fold { border: 0; background: none; padding: 0; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; }
  .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ember-soft); text-decoration: underline dotted; }
  .ghost { border: 0; background: none; color: var(--muted); font-size: 14px; padding: 3px 7px; border-radius: 8px; }
  .ghost:hover { color: var(--ember); background: var(--surface-2); }
  .pri { border: 0; border-radius: 10px; padding: 9px 16px; background: var(--ember); color: var(--on-ember); font-weight: 700; transition: transform var(--dur) var(--spring); }
  .pri:active { transform: scale(.95); }
  .pri:disabled { background: var(--surface-2); color: var(--muted); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chips button, .days button { border: 1px solid var(--line); background: var(--void); color: var(--silver); border-radius: 99px; padding: 5px 11px; font-size: 12.5px; }
  .chips button:hover:not(:disabled), .days button:hover { border-color: var(--ember); color: var(--ember); }
  .chips button.on, .days button.on { border-color: var(--ember); color: var(--ember); background: color-mix(in srgb, var(--ember) 12%, var(--void)); font-weight: 600; }
  .chips button:disabled { opacity: .45; }
  small { font: 11.5px/1.5 var(--f-mono); color: var(--muted); }
  .next { color: var(--ember-soft); }
  .hint { margin: 10px 0 0; font-size: 12px; color: var(--muted); line-height: 1.55; }
  .hint code { font: 11px var(--f-mono); color: var(--ember-soft); }

  .wrow { display: flex; gap: 16px; align-items: center; }
  .ring { width: 118px; height: 118px; flex: none; transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 10; }
  .ring .track { stroke: var(--void); }
  .ring .fill { stroke: #4fb3ff; stroke-linecap: round; transition: stroke-dashoffset var(--dur-slow) var(--spring); filter: drop-shadow(0 0 6px rgba(79, 179, 255, .35)); }
  .ring text { transform: rotate(90deg); transform-origin: 64px 64px; text-anchor: middle; fill: var(--ink); }
  .ring .big { font: 700 24px var(--f-display); }
  .ring .small { font: 12px var(--f-mono); fill: var(--muted); }
  .wact { display: grid; gap: 8px; min-width: 0; }
  .bars7 { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 74px; margin-top: 12px; align-items: end; }
  .bars7 .b { display: grid; grid-template-rows: 1fr auto; height: 100%; align-items: end; justify-items: center; gap: 3px; }
  .bars7 i { width: 100%; max-width: 22px; min-height: 2px; max-height: 100%; border-radius: 5px 5px 2px 2px; background: color-mix(in srgb, #4fb3ff 45%, var(--void)); align-self: end; }
  .bars7 i.ok { background: #4fb3ff; }
  .bars7 span { font: 10px var(--f-mono); color: var(--muted); text-transform: uppercase; }

  .brow { display: flex; gap: 14px; align-items: center; margin-bottom: 10px; }
  .brow div { display: grid; gap: 2px; }
  .brow b { color: var(--ink); }

  .cfg { display: grid; gap: 12px; }
  fieldset { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px 12px; display: grid; gap: 8px; margin: 0; }
  legend { padding: 0 6px; font: 600 12px var(--f-display); color: var(--silver); }
  .sw { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--silver); }
  .line { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; font-size: 13px; color: var(--silver); }
  .line label { display: flex; align-items: center; gap: 6px; }
  select, input[type='time'], input[type='number'], textarea { background: var(--void); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 5px 7px; font: 13px var(--f-body); }
  input[type='number'] { width: 74px; }
  .days { display: flex; gap: 4px; flex-wrap: wrap; }
  .days button { padding: 4px 9px; font-size: 12px; }

  .profile .q { margin: 12px 0 6px; font: 600 12px var(--f-display); color: var(--silver); }
  .profile .q:first-of-type { margin-top: 0; }
  .end { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .q { margin: 14px 0 6px; font: 600 12px var(--f-display); color: var(--silver); }

  .today .big { margin: 0 0 4px; font: 600 17px var(--f-display); color: var(--ink); }
  .today .big b { color: var(--ember); }

  .days-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .dh { width: 100%; display: flex; align-items: baseline; gap: 8px; text-align: left; border: 1px solid var(--line); background: var(--void); border-radius: 10px; padding: 8px 10px; color: var(--ink); font-size: 14px; }
  .dh b { color: var(--ember); font-family: var(--f-mono); }
  .dh small { margin-left: auto; }
  .dh em { font: normal 600 10px var(--f-mono); color: var(--on-ember); background: var(--ember); border-radius: 99px; padding: 1px 7px; }
  .ex { margin: 6px 0 4px; padding-left: 22px; display: grid; gap: 6px; font-size: 13.5px; color: var(--silver); }
  .er { display: flex; align-items: center; gap: 8px; }
  .er span { flex: 1; min-width: 0; }
  .er code { font: 11.5px var(--f-mono); color: var(--ember-soft); }
  .sg { display: block; }
  .sg-subir { color: var(--ok); }
  .sg-reduzir { color: var(--crit); }

  .wk { display: flex; gap: 4px; margin-bottom: 4px; }
  .wd { flex: 1; text-align: center; padding: 6px 0; border-radius: 8px; border: 1px solid var(--line); font: 11px var(--f-mono); color: var(--muted); text-transform: uppercase; }
  .wd.plan { border-style: dashed; border-color: color-mix(in srgb, var(--ember) 55%, var(--line)); color: var(--silver); }
  .wd.did { background: var(--ember); border: 1px solid var(--ember); color: var(--on-ember); font-weight: 700; }
  .wd.today { box-shadow: 0 0 0 2px var(--ember-glow); }
  .vol { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .vol li { display: grid; grid-template-columns: 92px 1fr 32px; gap: 8px; align-items: center; font-size: 12.5px; color: var(--silver); }
  .vol b { font: 11px var(--f-mono); color: var(--muted); text-align: right; }
  .bar { position: relative; height: 7px; border-radius: 99px; background: var(--void); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: inherit; background: var(--muted); transition: width var(--dur-slow) var(--spring); }
  .bar i.low { background: color-mix(in srgb, var(--ember) 55%, var(--void)); }
  .bar i.ok { background: var(--ok); }
  .bar u { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--silver); opacity: .5; }
  .recent { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .recent li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 13px; }

  .live { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .log { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .log > li { padding: 9px 10px; border-radius: 10px; background: var(--void); border-left: 2px solid var(--line); display: grid; gap: 5px; }
  .log > li.all { border-left-color: var(--ok); }
  .lh { display: flex; align-items: center; gap: 8px; }
  .lh b { flex: 1; min-width: 0; font-size: 14px; color: var(--ink); }
  .kg { display: flex; align-items: center; gap: 4px; font: 11px var(--f-mono); color: var(--muted); }
  .kg input { width: 64px; }
  .sets { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .set { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px 2px 2px; border: 1px solid var(--line); border-radius: 99px; background: var(--surface); }
  .set button { width: 24px; height: 24px; border-radius: 50%; border: 1.5px solid var(--muted); background: none; color: var(--muted); font: 600 11px var(--f-mono); padding: 0; transition: background .15s, border-color .15s, transform var(--dur) var(--spring); }
  .set button:active { transform: scale(.85); }
  .set.done { border-color: color-mix(in srgb, var(--ember) 50%, var(--line)); }
  .set.done button { background: var(--ember); border-color: var(--ember); color: var(--on-ember); }
  .set input { width: 44px; border: 0; background: none; padding: 2px; text-align: right; }
  .set em { font: normal 10px var(--f-mono); color: var(--muted); }
  .rest { margin-left: 4px; }
  textarea { width: 100%; box-sizing: border-box; margin-top: 8px; resize: vertical; }

  @media (max-width: 860px) {
    .grid { grid-template-columns: 1fr; }
    .saude { padding: 14px 14px 28px; }
    .wrow { gap: 12px; }
    .ring { width: 100px; height: 100px; }
  }
</style>
