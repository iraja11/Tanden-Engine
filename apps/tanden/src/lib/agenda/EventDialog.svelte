<script lang="ts">
  import { eventRepeatLabel, type EventRepeat, type Freq } from '@tanden/core';
  import { pop } from '../motion';
  import { agenda, TANDEN, type Draft } from './agenda.svelte';

  // Formulário de evento: criar, mudar, mover de agenda e apagar.
  let { draft, onOpenNote }: { draft: Draft; onOpenNote: (path: string) => void } = $props();

  // cópia local; só vai para o store ao salvar
  // svelte-ignore state_referenced_locally
  let d = $state<Draft>(structuredClone($state.snapshot(draft)) as Draft);
  let saving = $state(false);
  let confirmDel = $state(false);
  let titleEl = $state<HTMLInputElement>();

  const occ = $derived(draft.occ);
  const isNew = $derived(!occ);
  /** ocorrência de uma repetição do Google: só este dia muda */
  const googleInstance = $derived(occ?.source === 'google' && occ.recurring);
  const recurringLocal = $derived(occ?.source === 'tanden' && occ.recurring);
  const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const WD_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  const freq = $derived<Freq | ''>(d.input.repeat?.freq ?? '');
  const targets = $derived([{ id: TANDEN, name: 'Tanden (nota em Agenda/)', color: 'var(--ember)' }, ...agenda.writable.map((c) => ({ id: c.id, name: c.name, color: c.color }))]);

  $effect(() => {
    setTimeout(() => titleEl?.focus(), 40);
  });

  function setFreq(f: Freq | '') {
    if (!f) {
      d.input.repeat = null;
      return;
    }
    const weekday = new Date(`${d.input.date}T12:00`).getDay();
    const prev = d.input.repeat;
    d.input.repeat = { freq: f, interval: prev?.interval ?? 1, weekdays: f === 'weekly' ? (prev?.weekdays.length ? prev.weekdays : [weekday]) : [], until: prev?.until ?? null, count: null } satisfies EventRepeat;
  }

  function toggleDay(i: number) {
    const r = d.input.repeat;
    if (!r) return;
    const has = r.weekdays.includes(i);
    if (has && r.weekdays.length === 1) return;
    r.weekdays = has ? r.weekdays.filter((x) => x !== i) : [...r.weekdays, i].sort();
  }

  function setAllDay(v: boolean) {
    d.input.allDay = v;
    if (!v && !d.input.start) {
      d.input.start = '09:00';
      d.input.end = '10:00';
    }
  }

  /** mudar o início leva o fim junto (mantém a duração) */
  function setStart(v: string) {
    const old = d.input.start;
    d.input.start = v || null;
    if (!old || !v || !d.input.end) return;
    const min = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const dur = (min(d.input.end) - min(old) + 1440) % 1440 || 60;
    const e = (min(v) + dur) % 1440;
    d.input.end = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`;
  }

  async function submit(e?: Event) {
    e?.preventDefault();
    if (saving) return;
    saving = true;
    await agenda.save(d);
    saving = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      agenda.draft = null;
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="back" role="dialog" aria-modal="true" aria-label={isNew ? 'Novo evento' : 'Editar evento'} tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) agenda.draft = null; }} onkeydown={onKey}>
  <form class="dlg" onsubmit={submit} transition:pop>
    <input class="title" bind:this={titleEl} bind:value={d.input.title} placeholder="Título do evento" aria-label="Título" autocomplete="off" />

    <div class="row">
      <label class="chk"><input type="checkbox" checked={d.input.allDay} onchange={(e) => setAllDay(e.currentTarget.checked)} /> Dia inteiro</label>
    </div>

    <div class="row when">
      <label>
        <span>{d.input.allDay ? 'De' : 'Dia'}</span>
        <input type="date" bind:value={d.input.date} required />
      </label>
      {#if !d.input.allDay}
        <label><span>Início</span><input type="time" value={d.input.start ?? ''} oninput={(e) => setStart(e.currentTarget.value)} /></label>
        <label><span>Fim</span><input type="time" bind:value={d.input.end} /></label>
      {/if}
      {#if d.input.allDay || d.input.endDate}
        <label>
          <span>{d.input.allDay ? 'Até' : 'Termina em'}</span>
          <input type="date" value={d.input.endDate ?? ''} min={d.input.date} oninput={(e) => (d.input.endDate = e.currentTarget.value || null)} />
        </label>
      {:else}
        <button type="button" class="link" onclick={() => (d.input.endDate = d.input.date)}>termina em outro dia</button>
      {/if}
    </div>

    {#if googleInstance}
      <p class="note">Repetição do Google: o que mudar aqui vale só para este dia.</p>
    {:else}
      <div class="row rep">
        <label>
          <span>Repetir</span>
          <select value={freq} onchange={(e) => setFreq(e.currentTarget.value as Freq | '')}>
            <option value="">Não repete</option>
            <option value="daily">Todo dia</option>
            <option value="weekly">Toda semana</option>
            <option value="monthly">Todo mês</option>
            <option value="yearly">Todo ano</option>
          </select>
        </label>
        {#if d.input.repeat}
          <label class="n"><span>A cada</span><input type="number" min="1" max="99" bind:value={d.input.repeat.interval} /></label>
          <label><span>Até</span><input type="date" value={d.input.repeat.until ?? ''} min={d.input.date} oninput={(e) => { if (d.input.repeat) d.input.repeat.until = e.currentTarget.value || null; }} /></label>
        {/if}
      </div>
      {#if d.input.repeat?.freq === 'weekly'}
        <div class="days" role="group" aria-label="Dias da semana">
          {#each WD as w, i (i)}
            <button type="button" class:on={d.input.repeat.weekdays.includes(i)} onclick={() => toggleDay(i)} aria-pressed={d.input.repeat.weekdays.includes(i)} aria-label={WD_LONG[i]} title={WD_LONG[i]}>{w}</button>
          {/each}
        </div>
      {/if}
      {#if d.input.repeat}<p class="note">{eventRepeatLabel(d.input.repeat)}</p>{/if}
    {/if}

    <input bind:value={d.input.location} placeholder="Local" aria-label="Local" autocomplete="off" />
    <textarea bind:value={d.input.description} placeholder="Descrição" aria-label="Descrição" rows="3"></textarea>

    {#if targets.length > 1}
      <label class="where">
        <span>Salvar em</span>
        <select bind:value={d.target}>
          {#each targets as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
        </select>
      </label>
      {#if occ && d.target !== (occ.source === 'tanden' ? TANDEN : occ.calendar)}
        <p class="note">O evento sai de onde está e vai para a agenda escolhida{occ.recurring ? ' (só este dia, se for uma repetição do Google)' : ''}.</p>
      {/if}
    {/if}

    {#if agenda.error && !saving}<p class="err">{agenda.error}</p>{/if}

    <footer>
      {#if occ}
        {#if confirmDel}
          {#if occ.recurring}
            <button type="button" class="danger" onclick={() => agenda.remove(occ, 'uma')}>Só este dia</button>
            {#if occ.source === 'tanden' || occ.series}<button type="button" class="danger" onclick={() => agenda.remove(occ, 'todas')}>Todos</button>{/if}
          {:else}
            <button type="button" class="danger" onclick={() => agenda.remove(occ)}>Apagar mesmo</button>
          {/if}
          <button type="button" class="ghost" onclick={() => (confirmDel = false)}>Não</button>
        {:else}
          <button type="button" class="ghost del" onclick={() => (confirmDel = true)} title="Apagar evento">🗑</button>
          {#if occ.source === 'tanden'}<button type="button" class="ghost" onclick={() => { agenda.draft = null; onOpenNote(occ.ref); }}>Abrir nota</button>{/if}
        {/if}
      {/if}
      <span class="sp"></span>
      {#if recurringLocal && !confirmDel}<small class="hint">muda todos os dias</small>{/if}
      <button type="button" class="ghost" onclick={() => (agenda.draft = null)}>Cancelar</button>
      <button class="pri" disabled={saving || !d.input.date}>{saving ? 'Salvando…' : 'Salvar'}</button>
    </footer>
  </form>
</div>

<style>
  .back { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--void) 55%, transparent); backdrop-filter: blur(3px); }
  .dlg { width: min(520px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; box-sizing: border-box; display: grid; gap: 10px; padding: 16px; border-radius: 16px;
    background: var(--surface); border: 1px solid var(--line); box-shadow: 0 24px 60px -20px rgb(0 0 0 / .55); }
  input, select, textarea { min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--void); color: var(--ink); font: 14px var(--f-body); outline: none; box-sizing: border-box; }
  input:focus, select:focus, textarea:focus { border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  textarea { resize: vertical; width: 100%; }
  .title { font: 600 18px var(--f-display); border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: none; padding: 6px 2px; }
  .title:focus { box-shadow: none; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
  label { display: grid; gap: 4px; }
  label span { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  label.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--silver); }
  .chk input { width: 16px; height: 16px; accent-color: var(--ember); }
  .n input { width: 64px; }
  .where { grid-template-columns: auto 1fr; align-items: center; gap: 10px; }
  .days { display: flex; gap: 6px; }
  .days button { width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line); background: var(--void); color: var(--silver); font: 600 12px var(--f-mono); padding: 0; }
  .days button.on { background: var(--ember); border-color: var(--ember); color: var(--on-ember); }
  .note { margin: 0; font: 12px var(--f-mono); color: var(--ember-soft); }
  .err { margin: 0; font-size: 12.5px; color: var(--crit); }
  .hint { font: 11px var(--f-mono); color: var(--muted); }
  footer { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
  .sp { flex: 1; }
  .pri { border: 0; border-radius: 10px; padding: 8px 18px; background: var(--ember); color: var(--on-ember); font-weight: 700; }
  .pri:disabled { opacity: .5; }
  .ghost { border: 1px solid var(--line); border-radius: 10px; padding: 7px 12px; background: var(--surface-2); color: var(--ink); }
  .ghost:hover { border-color: var(--ember); color: var(--ember); }
  .del:hover { border-color: var(--crit); color: var(--crit); }
  .danger { border: 0; border-radius: 10px; padding: 8px 12px; background: var(--crit); color: #fff; font-weight: 600; }
  .link { border: 0; background: none; padding: 0 0 9px; font: 12px var(--f-mono); color: var(--ember-soft); text-decoration: underline dotted; }
</style>
