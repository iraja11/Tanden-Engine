<script lang="ts">
  import { dayDate, dayOf, dayTime, daysApart, layoutDay, monthDays, occurrencesOn, parseEventCapture, shiftDay, weekDays, type Occurrence } from '@tanden/core';
  import { untrack } from 'svelte';
  import { google } from '../google.svelte';
  import { rise } from '../motion';
  import { sound } from '../sound.svelte';
  import EventDialog from './EventDialog.svelte';
  import { agenda, hhmm, TANDEN, TASKS, type Mode } from './agenda.svelte';

  // Agenda: eventos do cofre, do Google Agenda e tarefas com prazo numa grade só.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  /** altura de uma hora na grade da semana (px) */
  const HOUR = 48;
  const MODES: Array<[Mode, string]> = [['mes', 'Mês'], ['semana', 'Semana'], ['dia', 'Dia'], ['lista', 'Lista']];
  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const mode = $derived(agenda.prefs.mode);
  const ws = $derived(agenda.prefs.weekStart);
  const cur = $derived(agenda.cursor);
  const today = $derived(agenda.today);

  /** os dias da tela */
  const days = $derived.by(() => {
    const d = dayDate(cur);
    if (mode === 'mes') return monthDays(d.getFullYear(), d.getMonth(), ws);
    if (mode === 'semana') return weekDays(cur, ws);
    if (mode === 'dia') return [cur];
    return Array.from({ length: 30 }, (_, i) => shiftDay(cur, i));
  });
  const from = $derived(dayTime(days[0]!, null));
  const to = $derived(dayTime(shiftDay(days[days.length - 1]!, 1), null));
  const occs = $derived(agenda.occurrences(from, to));
  const byDay = $derived(new Map(days.map((d) => [d, occurrencesOn(occs, d)])));

  // busca o Google quando a janela anda
  $effect(() => {
    const [f, t] = [from, to];
    void agenda.refresh(f, t);
  });

  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const title = $derived(cap(titleOf()));
  function titleOf(): string {
    const d = dayDate(cur);
    const month = (x: Date, y = true) => x.toLocaleDateString('pt-BR', { month: 'long', ...(y ? { year: 'numeric' } : {}) });
    if (mode === 'mes') return month(d);
    if (mode === 'dia') return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const a = dayDate(days[0]!);
    const b = dayDate(days[days.length - 1]!);
    const short = (x: Date) => x.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
    return `${short(a)} – ${short(b)} ${b.getFullYear()}`;
  }

  function step(n: number) {
    sound.play('tick');
    if (mode === 'mes') {
      const d = dayDate(cur);
      agenda.cursor = dayOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
    } else agenda.cursor = shiftDay(cur, n * (mode === 'semana' ? 7 : mode === 'dia' ? 1 : 30));
  }
  function goToday() {
    sound.play('tick');
    agenda.cursor = dayOf(new Date());
  }
  function setMode(m: Mode) {
    if (m !== mode) sound.play('tick');
    agenda.setPrefs({ mode: m });
  }
  function openDay(day: string) {
    agenda.cursor = day;
    setMode('dia');
  }

  function open(o: Occurrence) {
    if (o.source === 'tarefa') onOpenNote(o.ref);
    else agenda.edit(o);
  }

  const narrow = () => innerWidth < 640;
  const label = (o: Occurrence) => (o.allDay ? o.title : `${hhmm(o.start)} ${o.title}`);
  const dayHead = (day: string) => {
    if (day === today) return 'hoje';
    if (day === shiftDay(today, 1)) return 'amanhã';
    if (day === shiftDay(today, -1)) return 'ontem';
    return dayDate(day).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  };

  // ------------------------------------------------------------ captura rápida
  let quick = $state('');
  let quickEl = $state<HTMLInputElement>();
  const preview = $derived(quick.trim() ? parseEventCapture(quick, new Date(agenda.now)) : null);
  async function submitQuick(e: SubmitEvent) {
    e.preventDefault();
    if (await agenda.quick(quick)) quick = '';
  }

  // ------------------------------------------------------------ grade de horas
  let scroller = $state<HTMLElement>();
  let colsEl = $state<HTMLElement>();
  // só quando a janela muda; o relógio andando não pode puxar a rolagem de volta
  const windowKey = $derived(`${mode}:${days[0]}`);
  $effect(() => {
    void windowKey;
    if (!scroller || (mode !== 'semana' && mode !== 'dia')) return;
    untrack(() => {
      // abre perto do agora (ou às 7h), sem esconder a manhã
      const h = days.includes(today) ? Math.max(0, new Date(agenda.now).getHours() - 2) : 7;
      scroller!.scrollTop = Math.max(0, h * HOUR - 12);
    });
  });

  const nowTop = $derived.by(() => {
    const d = new Date(agenda.now);
    return ((d.getHours() * 60 + d.getMinutes()) * HOUR) / 60;
  });

  function slotClick(e: MouseEvent, day: string) {
    if (e.target !== e.currentTarget) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const half = Math.max(0, Math.min(47, Math.floor(((e.clientY - rect.top) / HOUR) * 2)));
    agenda.create(day, `${String(Math.floor(half / 2)).padStart(2, '0')}:${half % 2 ? '30' : '00'}`, false);
  }

  type Drag = { occ: Occurrence; x0: number; y0: number; colW: number; dDay: number; dMin: number; moved: boolean; movable: boolean };
  let drag = $state<Drag | null>(null);

  function down(e: PointerEvent, o: Occurrence) {
    if (e.button !== 0) return;
    // no toque, tocar abre (arrastar ficaria brigando com a rolagem)
    if (e.pointerType !== 'mouse') return;
    e.preventDefault();
    drag = { occ: o, x0: e.clientX, y0: e.clientY, colW: (colsEl?.clientWidth ?? 700) / days.length, dDay: 0, dMin: 0, moved: false, movable: agenda.movable(o) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moveP(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.movable) return;
    drag.moved = true;
    drag.dDay = Math.round(dx / drag.colW);
    drag.dMin = Math.round(((dy / HOUR) * 60) / 15) * 15;
  }
  /** o clique que vem logo depois de soltar um arrasto não abre o evento */
  let dropped = false;
  function up() {
    const d = drag;
    drag = null;
    if (!d?.moved) return;
    dropped = true;
    setTimeout(() => (dropped = false), 0);
    if (!d.dDay && !d.dMin) return;
    const n = new Date(d.occ.start);
    n.setDate(n.getDate() + d.dDay);
    n.setMinutes(n.getMinutes() + d.dMin);
    void agenda.move(d.occ, n.getTime());
  }

  // ------------------------------------------------------------ mês: arrastar entre dias
  let dragged: Occurrence | null = null;
  let over = $state<string | null>(null);
  function drop(day: string) {
    over = null;
    const o = dragged;
    dragged = null;
    if (!o) return;
    const diff = daysApart(dayOf(o.start), day);
    if (!diff) return;
    const n = new Date(o.start);
    n.setDate(n.getDate() + diff);
    void agenda.move(o, n.getTime());
  }

  function cellClick(e: MouseEvent, day: string) {
    if ((e.target as HTMLElement).closest('.chip, .num, .more')) return;
    if (narrow()) openDay(day);
    else agenda.create(day, null);
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (agenda.draft || e.ctrlKey || e.metaKey || e.altKey || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
    const k = e.key;
    if (k === 'n') { e.preventDefault(); quickEl?.focus(); }
    else if (k === 'e') { e.preventDefault(); agenda.create(); }
    else if (k === 't') goToday();
    else if (k === 'ArrowLeft' || k === 'j') step(-1);
    else if (k === 'ArrowRight' || k === 'k') step(1);
    else if (k === 'm') setMode('mes');
    else if (k === 's') setMode('semana');
    else if (k === 'd') setMode('dia');
    else if (k === 'l') setMode('lista');
  }

  const sources = $derived([
    { id: TANDEN, name: 'Tanden', color: 'var(--ember)' },
    { id: TASKS, name: 'Tarefas', color: 'var(--ok)' },
    ...(agenda.googleOn ? agenda.calendars.map((c) => ({ id: c.id, name: c.name, color: c.color })) : []),
  ]);
</script>

<svelte:window onkeydown={onKey} />

<section class="agenda" class:dragging={!!drag?.moved}>
  <header>
    <div class="t">
      <h2>Agenda</h2>
      <p class="when">{title}{#if agenda.loading}<span class="spin" title="Lendo o Google Agenda">◌</span>{/if}</p>
    </div>
    <div class="nav">
      <button class="ghost" onclick={() => step(-1)} aria-label="Anterior" title="Anterior (←)">‹</button>
      <button class="ghost" onclick={goToday} title="Hoje (T)">Hoje</button>
      <button class="ghost" onclick={() => step(1)} aria-label="Próximo" title="Próximo (→)">›</button>
    </div>
    <div class="modes" role="tablist">
      {#each MODES as [m, l] (m)}
        <button role="tab" aria-selected={mode === m} class:on={mode === m} onclick={() => setMode(m)}>{l}</button>
      {/each}
    </div>
    <button class="pri" onclick={() => agenda.create()} title="Novo evento (E)">+ Evento</button>
  </header>

  <form class="quick" onsubmit={submitQuick}>
    <input bind:this={quickEl} bind:value={quick} placeholder="sexta das 14h às 15h dentista @ clínica · toda segunda 7h academia" aria-label="Novo evento rápido" autocomplete="off" enterkeyhint="done" />
    <button disabled={!preview} aria-label="Adicionar">+</button>
  </form>
  <p class="preview">
    {#if preview}
      📅 {preview.title} · {dayHead(preview.date)}{preview.start ? ` ${preview.start}–${preview.end}` : ' · dia inteiro'}{preview.repeat ? ' · repete' : ''}{preview.location ? ` · ${preview.location}` : ''}
    {:else}
      Escreva o evento em português; "@" marca o local. Atalhos: N escreve, E abre o formulário, T volta para hoje.
    {/if}
  </p>

  <div class="sources">
    {#each sources as s (s.id)}
      <button class="src" class:off={agenda.prefs.hidden.includes(s.id)} style:--c={s.color} onclick={() => agenda.toggle(s.id)} aria-pressed={!agenda.prefs.hidden.includes(s.id)}>
        <i></i>{s.name}
      </button>
    {/each}
    {#if google.available}
      {#if !google.status.signed_in}
        <span class="gmsg">Conecte o Google (barra de baixo) para ver o Google Agenda aqui.</span>
      {:else if agenda.needsConsent}
        <span class="gmsg warn">Falta liberar a agenda na conta Google. <button class="link" onclick={() => agenda.connect()} disabled={google.busy}>{google.busy ? 'esperando o navegador…' : 'Entrar de novo'}</button></span>
      {:else}
        <button class="link sm" onclick={() => agenda.refresh(from, to, true)} title="Ler o Google Agenda de novo">↻ atualizar</button>
      {/if}
    {/if}
    <button class="link sm wk" onclick={() => agenda.setPrefs({ weekStart: ws ? 0 : 1 })} title="Primeiro dia da semana">semana começa {ws ? 'segunda' : 'domingo'}</button>
  </div>
  {#if agenda.error && !agenda.draft}<p class="err">{agenda.error}</p>{/if}

  {#if mode === 'mes'}
    <div class="month" in:rise={{ y: 6 }}>
      <div class="wd">{#each days.slice(0, 7) as d (d)}<span>{WD[dayDate(d).getDay()]}</span>{/each}</div>
      <div class="cells" style:--weeks={days.length / 7}>
        {#each days as d (d)}
          {@const list = byDay.get(d) ?? []}
          {@const inMonth = d.slice(0, 7) === cur.slice(0, 7)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="cell" class:out={!inMonth} class:today={d === today} class:over={over === d} onclick={(e) => cellClick(e, d)}
            ondragover={(e) => { if (dragged) { e.preventDefault(); over = d; } }} ondragleave={() => { if (over === d) over = null; }} ondrop={(e) => { e.preventDefault(); drop(d); }}>
            <button class="num" onclick={() => openDay(d)} title="Ver o dia">{dayDate(d).getDate()}</button>
            {#each list.slice(0, list.length > 4 ? 3 : 4) as o (o.key)}
              <button class="chip" class:all={o.allDay} class:task={o.source === 'tarefa'} style:--c={agenda.colorOf(o)} draggable={agenda.movable(o)}
                ondragstart={(e) => { dragged = o; e.dataTransfer?.setData('text/plain', o.title); }} ondragend={() => { dragged = null; over = null; }}
                onclick={() => open(o)} title={label(o)}>
                <span>{label(o)}</span>
              </button>
            {/each}
            {#if list.length > 4}<button class="more" onclick={() => openDay(d)}>+{list.length - 3}</button>{/if}
          </div>
        {/each}
      </div>
    </div>
  {:else if mode === 'semana' || mode === 'dia'}
    <div class="week" in:rise={{ y: 6 }} style:--n={days.length}>
      <div class="whead">
        <span class="gut"></span>
        {#each days as d (d)}
          <button class="dh" class:today={d === today} onclick={() => openDay(d)}>
            <small>{WD[dayDate(d).getDay()]}</small><b>{dayDate(d).getDate()}</b>
          </button>
        {/each}
      </div>
      <div class="allday">
        <span class="gut">dia</span>
        {#each days as d (d)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="adcol" onclick={(e) => { if (e.target === e.currentTarget) agenda.create(d, null); }}>
            {#each (byDay.get(d) ?? []).filter((o) => o.allDay) as o (o.key)}
              <button class="chip all" class:task={o.source === 'tarefa'} style:--c={agenda.colorOf(o)} onclick={() => open(o)} title={o.title}><span>{o.title}</span></button>
            {/each}
          </div>
        {/each}
      </div>
      <div class="scroll" bind:this={scroller}>
        <div class="grid" style:height="{24 * HOUR}px">
          <div class="gut hours">
            {#each Array.from({ length: 24 }, (_, i) => i) as h (h)}<span style:top="{h * HOUR}px">{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>{/each}
          </div>
          <div class="cols" bind:this={colsEl}>
            {#each days as d (d)}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div class="col" class:today={d === today} style:--hour="{HOUR}px" onclick={(e) => slotClick(e, d)}>
                {#each layoutDay(byDay.get(d) ?? [], d, 22) as p (p.occ.key)}
                  {@const isDrag = drag?.occ.key === p.occ.key && drag.moved}
                  <button class="ev" class:task={p.occ.source === 'tarefa'} class:drag={isDrag} class:short={p.height < 40} style:--c={agenda.colorOf(p.occ)}
                    style:top="{(p.top * HOUR) / 60}px" style:height="{(p.height * HOUR) / 60 - 2}px"
                    style:left="calc({p.lane} * 100% / {p.lanes})" style:width="calc(100% / {p.lanes} - 3px)"
                    style:transform={isDrag ? `translate(${drag!.dDay * drag!.colW}px, ${(drag!.dMin * HOUR) / 60}px)` : null}
                    onpointerdown={(e) => down(e, p.occ)} onpointermove={moveP} onpointerup={up} onpointercancel={() => (drag = null)}
                    onclick={(e) => { e.stopPropagation(); if (!dropped) open(p.occ); }}
                    title="{hhmm(p.occ.start)}–{hhmm(p.occ.end)} {p.occ.title}{p.occ.location ? ` · ${p.occ.location}` : ''}">
                    <b>{p.occ.title}</b>
                    <small>{hhmm(p.occ.start)}–{hhmm(p.occ.end)}{p.occ.location ? ` · ${p.occ.location}` : ''}</small>
                  </button>
                {/each}
                {#if d === today}<div class="nowline" style:top="{nowTop}px"></div>{/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {:else}
    {@const filled = days.filter((d) => (byDay.get(d) ?? []).length)}
    <div class="list" in:rise={{ y: 6 }}>
      {#each filled as d (d)}
        <section>
          <h4 class:today={d === today}>{dayHead(d)}</h4>
          <ul>
            {#each byDay.get(d) ?? [] as o (o.key)}
              <li>
                <button onclick={() => open(o)} style:--c={agenda.colorOf(o)} class:task={o.source === 'tarefa'}>
                  <time>{o.allDay ? 'dia todo' : `${hhmm(o.start)}–${hhmm(o.end)}`}</time>
                  <i></i>
                  <span class="lt"><b>{o.title}</b>{#if o.location}<small>{o.location}</small>{/if}</span>
                  {#if o.recurring}<small class="rp" title="Repete">↻</small>{/if}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {:else}
        <p class="empty">Nada nos próximos 30 dias. Escreva acima ("amanhã 10h café com a Bia") ou clique em <b>+ Evento</b>.</p>
      {/each}
    </div>
  {/if}
</section>

{#if agenda.draft}
  {#key agenda.draft}
    <EventDialog draft={agenda.draft} {onOpenNote} />
  {/key}
{/if}

<style>
  .agenda { height: 100%; width: 100%; max-width: 1280px; margin: 0 auto; padding: 18px 24px 20px; box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
  header { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .t { flex: 1; min-width: 180px; }
  h2 { margin: 0 0 6px; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .when { margin: 0; font: 600 22px var(--f-display); color: var(--ink); display: flex; align-items: center; gap: 8px; }
  .spin { font-size: 14px; color: var(--ember); animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .nav { display: flex; gap: 4px; }
  .ghost { border: 1px solid var(--line); border-radius: 10px; padding: 6px 12px; background: var(--surface); color: var(--silver); font-size: 13px; }
  .ghost:hover { border-color: var(--ember); color: var(--ember); }
  .modes { display: flex; padding: 3px; border-radius: 11px; background: var(--surface); border: 1px solid var(--line); }
  .modes button { border: 0; background: none; color: var(--muted); border-radius: 8px; padding: 5px 11px; font-size: 13px; }
  .modes button.on { background: var(--surface-2); color: var(--ink); font-weight: 600; }
  .pri { border: 0; border-radius: 10px; padding: 8px 14px; background: var(--ember); color: var(--on-ember); font-weight: 700; }
  .quick { display: flex; gap: 8px; }
  .quick input { flex: 1; min-width: 0; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 14.5px var(--f-body); outline: none; transition: border-color .2s, box-shadow .2s; }
  .quick input:focus { border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  .quick button { width: 42px; border-radius: 12px; border: 0; background: var(--ember); color: var(--on-ember); font-size: 22px; font-weight: 600; }
  .quick button:disabled { background: var(--surface-2); color: var(--muted); }
  .preview { margin: 7px 2px 8px; min-height: 1.3em; font: 12px var(--f-mono); color: var(--ember-soft); }
  .sources { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
  .src { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--silver); border-radius: 99px; padding: 4px 10px; font-size: 12px; }
  .src i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); }
  .src.off { opacity: .45; }
  .src.off i { background: none; border: 1.5px solid var(--c); box-sizing: border-box; }
  .gmsg { font-size: 12px; color: var(--muted); }
  .gmsg.warn { color: var(--ember-soft); }
  .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ember-soft); text-decoration: underline dotted; }
  .link.sm { font: 11px var(--f-mono); color: var(--muted); }
  .wk { margin-left: auto; }
  .err { margin: 0 0 8px; font-size: 12.5px; color: var(--crit); }

  /* mês */
  .month { flex: 1; min-height: 420px; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface); }
  .wd, .cells { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .wd span { padding: 6px 8px; font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); }
  .cells { flex: 1; grid-template-rows: repeat(var(--weeks), minmax(84px, 1fr)); }
  .cell { min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 4px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); cursor: pointer; transition: background .15s; }
  .cell:nth-child(7n) { border-right: 0; }
  .cell:hover { background: color-mix(in srgb, var(--surface-2) 60%, transparent); }
  .cell.out { background: color-mix(in srgb, var(--void) 50%, var(--surface)); }
  .cell.out .num { color: var(--muted); opacity: .6; }
  .cell.over { background: var(--ember-glow); }
  .num { align-self: flex-start; border: 0; background: none; padding: 2px 6px; border-radius: 99px; font: 600 12px var(--f-mono); color: var(--silver); }
  .num:hover { color: var(--ember); }
  .cell.today .num { background: var(--ember); color: var(--on-ember); }
  .chip { display: block; width: 100%; min-width: 0; border: 0; text-align: left; padding: 2px 6px; border-radius: 6px; font-size: 11.5px; color: var(--ink);
    background: color-mix(in srgb, var(--c) 14%, transparent); border-left: 3px solid var(--c); }
  .chip span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip.all { background: color-mix(in srgb, var(--c) 70%, var(--void)); color: #fff; border-left-color: transparent; }
  .chip.task { background: none; border-left: 0; padding-left: 4px; color: var(--silver); }
  .chip.task span::before { content: '☐ '; color: var(--c); }
  .chip:hover { filter: brightness(1.15); }
  .more { align-self: flex-start; border: 0; background: none; padding: 0 6px; font: 11px var(--f-mono); color: var(--muted); }
  .more:hover { color: var(--ember); }

  /* semana / dia */
  .week { flex: 1; min-height: 420px; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: var(--surface); }
  /* reserva o espaço da barra de rolagem da grade, para as colunas baterem */
  .whead, .allday { overflow: hidden; scrollbar-gutter: stable; }
  .scroll { scrollbar-gutter: stable; }
  .whead, .allday { display: grid; grid-template-columns: 52px repeat(var(--n), minmax(0, 1fr)); border-bottom: 1px solid var(--line); }
  .gut { font: 10px var(--f-mono); color: var(--muted); padding: 4px 6px; text-align: right; }
  .dh { border: 0; background: none; display: flex; align-items: baseline; justify-content: center; gap: 6px; padding: 6px 2px; color: var(--silver); }
  .dh small { font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .dh b { font: 600 17px var(--f-mono); }
  .dh.today b { color: var(--ember); }
  .dh:hover b { color: var(--ember); }
  .adcol { min-width: 0; min-height: 24px; padding: 3px; display: grid; gap: 2px; align-content: start; border-left: 1px solid var(--line); cursor: pointer; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  .grid { position: relative; display: grid; grid-template-columns: 52px 1fr; }
  .hours { position: relative; padding: 0; }
  .hours span { position: absolute; right: 6px; transform: translateY(-50%); }
  .cols { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
  .col { position: relative; border-left: 1px solid var(--line); cursor: copy;
    background: repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px var(--hour)); }
  .col.today { background-color: color-mix(in srgb, var(--ember) 4%, transparent); }
  .ev { position: absolute; box-sizing: border-box; margin-left: 1px; overflow: hidden; text-align: left; border: 0; border-radius: 7px; padding: 3px 6px; display: flex; flex-direction: column; gap: 1px;
    background: color-mix(in srgb, var(--c) 22%, var(--surface)); border-left: 3px solid var(--c); color: var(--ink); cursor: pointer; z-index: 1; user-select: none;
    transition: box-shadow .15s, filter .15s; }
  .ev:hover { filter: brightness(1.12); z-index: 2; }
  .ev b { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev small { font: 10.5px var(--f-mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ev.short { flex-direction: row; align-items: center; gap: 6px; padding-top: 1px; padding-bottom: 1px; }
  .ev.task { background: color-mix(in srgb, var(--c) 10%, var(--surface)); border-left-style: dashed; }
  .ev.drag { z-index: 5; box-shadow: 0 10px 24px -8px rgb(0 0 0 / .6); opacity: .92; cursor: grabbing; }
  .dragging { cursor: grabbing; }
  .nowline { position: absolute; left: 0; right: 0; height: 2px; background: var(--crit); z-index: 3; pointer-events: none; }
  .nowline::before { content: ''; position: absolute; left: -5px; top: -4px; width: 10px; height: 10px; border-radius: 50%; background: var(--crit); }

  /* lista */
  .list { display: grid; gap: 14px; padding-bottom: 12px; }
  .list h4 { margin: 0 0 6px; font: 600 11px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .list h4.today { color: var(--ember); }
  .list ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .list li button { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 10px; padding: 8px 10px; }
  .list li button:hover { border-color: var(--c); }
  .list time { flex: none; width: 92px; font: 12px var(--f-mono); color: var(--muted); }
  .list i { flex: none; width: 4px; align-self: stretch; border-radius: 2px; background: var(--c); }
  .list .task i { background: none; border-left: 2px dashed var(--c); }
  .lt { flex: 1; min-width: 0; display: grid; }
  .lt b { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lt small { font-size: 12px; color: var(--muted); }
  .rp { color: var(--muted); }
  .empty { color: var(--muted); font-size: 13.5px; line-height: 1.6; }

  @media (max-width: 640px) {
    .agenda { padding: 12px 10px 16px; }
    .when { font-size: 18px; }
    .modes button { padding: 5px 8px; }
    .cells { grid-template-rows: repeat(var(--weeks), minmax(58px, 1fr)); }
    .cell { padding: 2px; }
    .chip { padding: 0; height: 5px; border-left: 0; background: var(--c); }
    .chip span { display: none; }
    .chip.task { height: 5px; background: color-mix(in srgb, var(--c) 50%, transparent); }
    .whead, .allday, .grid { grid-template-columns: 38px repeat(var(--n), minmax(0, 1fr)); }
    .grid { grid-template-columns: 38px 1fr; }
    .gut { font-size: 9px; padding: 4px 2px; }
    .ev { padding: 2px 3px; }
    .ev small { display: none; }
    .wk { display: none; }
  }
</style>
