<script lang="ts">
  import { addDays, byUrgency, parseCapture, propConfig, taskBucket, type LifeTask, type TaskBucket } from '@tanden/core';
  import { flip } from 'svelte/animate';
  import { bases, optionColor } from '../bases/bases.svelte';
  import { files } from '../files/files.svelte';
  import { rise } from '../motion';
  import { dayLabel, vida } from './vida.svelte';
  import { saude } from '../saude/saude.svelte';
  import { flashcards } from '../flashcards/flashcards.svelte';

  // Tela Hoje: tarefas, hábitos, diário, projetos, metas e leituras num lugar só.
  let { onOpenNote }: { onOpenNote: (path: string) => void } = $props();

  vida.tick();
  const snap = $derived(vida.snap);
  const day = $derived(snap.day);
  let input = $state('');
  let inputEl = $state<HTMLInputElement>();
  let showDone = $state(false);
  let showLater = $state(false);
  const preview = $derived(input.trim() ? parseCapture(input, vida.now) : null);
  const missing = $derived(vida.missing());

  const groups: Array<[TaskBucket, string]> = [
    ['atrasadas', 'Atrasadas'],
    ['hoje', 'Hoje'],
    ['semana', 'Próximos 7 dias'],
    ['sem data', 'Sem data'],
  ];
  const byBucket = $derived.by(() => {
    const m = new Map<TaskBucket, LifeTask[]>();
    for (const t of [...snap.tasks].sort(byUrgency)) {
      const b = taskBucket(t, day);
      // sem data só as do banco: as "- [ ]" soltas das notas não são compromissos
      if (b === 'sem data' && t.source === 'nota') continue;
      (m.get(b) ?? m.set(b, []).get(b)!).push(t);
    }
    return m;
  });
  const doneToday = $derived(snap.tasks.filter((t) => t.done && t.doneOn === day));
  const todayCount = $derived((byBucket.get('hoje')?.length ?? 0));
  const lateCount = $derived((byBucket.get('atrasadas')?.length ?? 0));
  const bestStreak = $derived(Math.max(0, ...snap.habits.map((h) => h.streak)));
  const projects = $derived(snap.projects.filter((p) => p.group === 'doing').sort((a, b) => (a.end ?? '9999').localeCompare(b.end ?? '9999')));
  const goals = $derived(snap.goals.filter((g) => g.group !== 'done'));
  const moods = $derived(snap.dbs.diario ? propConfig(snap.dbs.diario.def, 'humor').options ?? [] : []);
  const dailyPath = $derived(vida.dailyPath(day, snap));
  const mood = $derived(dailyPath ? String(bases.index.byPath.get(dailyPath)?.props.humor ?? '') : '');
  const reading = $derived(vida.reading);
  const care = $derived(saude.todayCare);
  const waterPct = $derived(Math.min(1, care.ml / Math.max(1, saude.config.agua.goalMl)));
  const workout = $derived(saude.hasPlan ? saude.nextWorkout : null);
  const cardsDue = $derived(flashcards.pending());

  const hello = $derived.by(() => {
    const h = vida.now.getHours();
    return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  });
  const longDate = $derived(vida.now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
  const name = (p: string) => p.split('/').pop()!.replace(/\.md$/, '');

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const kind = vida.capture(input);
    if (kind) input = '';
  }

  function open(t: { path: string; source?: string }) {
    if (t.source === 'nota') onOpenNote(t.path);
    else bases.peek = t.path;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) {
      e.preventDefault();
      inputEl?.focus();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="hoje">
  <header>
    <div>
      <h2>Hoje</h2>
      <p class="hello">{hello}. <span>{longDate}</span></p>
    </div>
    <div class="stats">
      <span class:hot={todayCount > 0}><b>{todayCount}</b> para hoje</span>
      {#if lateCount}<span class="late"><b>{lateCount}</b> {lateCount === 1 ? 'atrasada' : 'atrasadas'}</span>{/if}
      {#if bestStreak}<span title="Maior sequência de hábito agora"><b>🔥 {bestStreak}</b> {bestStreak === 1 ? 'dia' : 'dias'}</span>{/if}
    </div>
  </header>

  <form class="quick" onsubmit={submit}>
    <input bind:this={inputEl} bind:value={input} placeholder="amanhã revisar slides ! · sexta 18h jogar SF6 · comprar café"
      aria-label="Nova tarefa" autocomplete="off" enterkeyhint="done" />
    <button disabled={!preview} aria-label="Adicionar">+</button>
  </form>
  <p class="preview">
    {#if preview}
      {preview.reminder ? '⏰ Lembrete' : '☑ Tarefa'}: {preview.title}{#if preview.due} · {dayLabel(preview.due, day)}{/if}{#if preview.time} {preview.time}{/if}{#if preview.priority >= 3} · prioridade {preview.priority === 4 ? 'máxima' : 'alta'}{/if}
      · vai para {preview.reminder ? 'Lembretes' : snap.dbs.tarefas ? name(snap.dbs.tarefas.note) : 'Caixa de entrada'}
    {:else}
      Data e hora em português; "!" no fim é prioridade alta. Com hora, vira lembrete com aviso. Atalho: N.
    {/if}
  </p>

  <nav class="acts">
    <button onclick={() => onOpenNote(vida.openDaily())}>✎ Nota do dia</button>
    <button onclick={() => onOpenNote(vida.review())}>◷ Revisão da semana</button>
    <button onclick={() => (files.clipDialog = true)}>✂ Salvar página web</button>
    {#if cardsDue}<button onclick={() => { flashcards.goto++; flashcards.start(); }}>🃏 Revisar {cardsDue} {cardsDue === 1 ? 'flashcard' : 'flashcards'}</button>{/if}
    {#if snap.dbs.tarefas}<button onclick={() => bases.openDatabase(snap.dbs.tarefas!.note)}>▤ Banco de tarefas</button>{/if}
  </nav>

  {#if missing.length}
    <div class="setup" in:rise>
      <div>
        <b>Monte seu sistema</b>
        <p>Cria em <code>Bancos/</code> o que falta: {missing.map((k) => ({ tarefas: 'Tarefas', projetos: 'Projetos', habitos: 'Hábitos', metas: 'Metas', diario: 'Diário' })[k]).join(', ')}. São bancos comuns, que o Obsidian também abre, e esta tela junta tudo.</p>
      </div>
      <button class="pri" onclick={() => vida.setup()}>Criar</button>
    </div>
  {/if}

  <div class="grid">
    <div class="col">
      <section class="card tasks">
        <h3>Tarefas</h3>
        {#each groups as [b, label] (b)}
          {@const all = byBucket.get(b) ?? []}
          {@const list = b === 'sem data' && !showLater ? all.slice(0, 5) : all}
          {#if all.length}
            <h4 class:late={b === 'atrasadas'}>{label} <span>{all.length}</span></h4>
            <ul>
              {#each list as t (t.key)}
                <li class:late={b === 'atrasadas'} class:prio={t.priority >= 3} animate:flip={{ duration: 240 }} in:rise={{ y: -4 }}>
                  <button class="check" onclick={() => vida.setDone(t, true)} aria-label="Marcar como feita" title="Feita"></button>
                  <div class="body">
                    <button class="title" onclick={() => open(t)}>{t.title}</button>
                    <small>
                      {#if t.due}<time>{dayLabel(t.due, day)}{t.time ? ` ${t.time}` : ''}</time>{/if}
                      {#if t.priority >= 3}<span class="p">{t.priority === 4 ? '‼ máxima' : '! alta'}</span>{/if}
                      {#if t.project}<button class="link" onclick={() => (bases.peek = t.project)}>◆ {name(t.project)}</button>{/if}
                      {#if t.source === 'nota'}<button class="link" onclick={() => onOpenNote(t.path)}>{name(t.path)}</button>{/if}
                    </small>
                  </div>
                  {#if t.source === 'banco' && b !== 'semana'}
                    <button class="ghost" title="Passar para amanhã" onclick={() => vida.setDue(t, addDays(day, 1))}>→</button>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if b === 'sem data' && all.length > 5}
              <button class="more" onclick={() => (showLater = !showLater)}>{showLater ? 'Mostrar menos' : `Mais ${all.length - 5}`}</button>
            {/if}
          {/if}
        {/each}
        {#if !snap.tasks.some((t) => !t.done)}
          <p class="empty">Nada pendente. Escreva acima o que precisa fazer, ou marque <code>- [ ] tarefa 📅 2026-10-20</code> em qualquer nota.</p>
        {/if}
        {#if doneToday.length}
          <button class="more" onclick={() => (showDone = !showDone)}>{showDone ? 'Esconder' : 'Ver'} as {doneToday.length} feitas hoje</button>
          {#if showDone}
            <ul class="done">
              {#each doneToday as t (t.key)}
                <li><button class="check on" onclick={() => vida.setDone(t, false)} aria-label="Desmarcar"></button><div class="body"><span class="title">{t.title}</span></div></li>
              {/each}
            </ul>
          {/if}
        {/if}
      </section>
    </div>

    <div class="col">
      {#if snap.dbs.habitos}
        <section class="card">
          <h3>Hábitos <button class="link" onclick={() => bases.openDatabase(snap.dbs.habitos!.note)}>abrir</button></h3>
          {#if snap.habits.length}
            <table class="habits">
              <thead><tr><th></th>{#each snap.habits[0]!.days as d (d.day)}<th class:today={d.day === day}>{dayLabel(d.day, day) === 'hoje' ? 'hoje' : new Date(d.day + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'narrow' })}</th>{/each}<th></th></tr></thead>
              <tbody>
                {#each snap.habits as h (h.key)}
                  <tr>
                    <td class="hl">{h.label}</td>
                    {#each h.days as d (d.day)}
                      <td><button class="dot" class:on={d.done} class:today={d.day === day} onclick={() => vida.toggleHabit(h.key, d.day)}
                        aria-label="{h.label} em {dayLabel(d.day, day)}" aria-pressed={d.done}></button></td>
                    {/each}
                    <td class="streak" title="Sequência (melhor: {h.best}) · {Math.round(h.rate * 100)}% em 30 dias">{h.streak ? `🔥${h.streak}` : ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {:else}
            <p class="empty">Crie propriedades de caixa (✓) no banco de hábitos para cada hábito.</p>
          {/if}
        </section>
      {/if}

      <section class="card health">
        <h3>Saúde <button class="link" onclick={() => saude.openRequests++}>abrir</button></h3>
        <div class="row">
          <span class="wl">💧 <b>{care.ml}</b> / {saude.config.agua.goalMl} ml</span>
          <button class="ghost plus" onclick={() => saude.drink()} title="Registrar {saude.config.agua.cupMl} ml">+ copo</button>
          <button class="ghost plus" onclick={() => saude.stood()} title="Registrar uma pausa">🧍 levantei</button>
        </div>
        <div class="bar water"><i style:width="{waterPct * 100}%"></i></div>
        <small>
          {care.breaks} {care.breaks === 1 ? 'pausa' : 'pausas'} hoje
          {#if saude.doneToday.length} · treino feito 💪
          {:else if workout && saude.trainingToday}<button class="link" onclick={() => saude.openRequests++}>· treino de hoje: {workout.key} · {workout.name}</button>
          {:else if !saude.hasPlan}<button class="link" onclick={() => saude.openRequests++}>· montar plano de treino</button>{/if}
        </small>
      </section>

      <section class="card">
          <h3>Diário</h3>
          {#if moods.length}
            <div class="moods" role="radiogroup" aria-label="Humor de hoje">
              {#each moods as o (o.value)}
                <button class:on={mood === o.value} style:--c={optionColor(propConfig(snap.dbs.diario!.def, 'humor'), o.value)} onclick={() => vida.setMood(o.value)} role="radio" aria-checked={mood === o.value}>{o.value}</button>
              {/each}
            </div>
          {/if}
          <button class="wide" onclick={() => onOpenNote(vida.openDaily())}>{dailyPath ? 'Abrir a nota de hoje' : 'Escrever a nota de hoje'}</button>
        </section>

      {#if projects.length}
        <section class="card">
          <h3>Projetos ativos <span>{projects.length}</span></h3>
          <ul class="bars">
            {#each projects as p (p.path)}
              <li>
                <div class="row"><button class="title" onclick={() => (bases.peek = p.path)}>{p.name}</button><b>{pct(p.progress)}</b></div>
                <div class="bar"><i style:width="{(p.progress ?? 0) * 100}%"></i></div>
                <small>
                  {#if p.tasksTotal}{p.tasksDone}/{p.tasksTotal} tarefas{/if}
                  {#if p.next} · próximo: {p.next}{/if}
                  {#if p.overdue}<span class="lt"> · ⚠ {p.overdue} atrasada{p.overdue > 1 ? 's' : ''}</span>{/if}
                  {#if p.end} · até {dayLabel(p.end, day)}{/if}
                </small>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if goals.length}
        <section class="card">
          <h3>Metas <span>{goals.length}</span></h3>
          <ul class="bars">
            {#each goals as g (g.path)}
              <li>
                <div class="row">
                  <button class="title" onclick={() => (bases.peek = g.path)}>{g.name}</button>
                  {#if g.target !== null}<button class="ghost plus" title="Somar 1" onclick={() => vida.bump(g.path, 1)}>+1</button>{/if}
                  <b>{pct(g.progress)}</b>
                </div>
                <div class="bar goal"><i style:width="{(g.progress ?? 0) * 100}%"></i></div>
                <small>
                  {#if g.target !== null}{g.current ?? 0} de {g.target}{g.unit ? ` ${g.unit}` : ''}{:else if g.projects.length}{g.projects.length} projeto{g.projects.length > 1 ? 's' : ''}{/if}
                  {#if g.due} · até {dayLabel(g.due, day)}{/if}
                </small>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if reading.length}
        <section class="card">
          <h3>Para ler <span>{reading.length}</span></h3>
          <ul class="read">
            {#each reading.slice(0, 6) as r (r.path)}
              <li>
                <button class="title" onclick={() => onOpenNote(r.path)}>{r.title}</button>
                <small>{r.site}</small>
                <button class="ghost" title="Marcar como lido" onclick={() => vida.markRead(r.path)}>✓</button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </div>
</section>

<style>
  .hoje { height: 100%; overflow-y: auto; width: 100%; max-width: 1080px; margin: 0 auto; padding: 18px 24px 32px; box-sizing: border-box; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  h2 { margin: 0 0 6px; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .hello { margin: 0; font: 600 22px var(--f-display); color: var(--ink); }
  .hello span { color: var(--muted); font-weight: 500; font-size: 15px; }
  .stats { display: flex; gap: 8px; flex-wrap: wrap; }
  .stats span { padding: 5px 10px; border-radius: 99px; background: var(--surface); border: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .stats b { color: var(--ink); font-family: var(--f-mono); }
  .stats .hot b { color: var(--ember); }
  .stats .late { border-color: color-mix(in srgb, var(--crit) 50%, var(--line)); }
  .stats .late b { color: var(--crit); }
  .quick { display: flex; gap: 8px; }
  .quick input { flex: 1; min-width: 0; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 15px var(--f-body); outline: none; transition: border-color .2s, box-shadow .2s; }
  .quick input:focus { border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  .quick button { width: 44px; border-radius: 12px; border: 0; background: var(--ember); color: var(--on-ember); font-size: 22px; font-weight: 600; }
  .quick button:disabled { background: var(--surface-2); color: var(--muted); }
  .preview { margin: 8px 2px 10px; min-height: 1.3em; font: 12px var(--f-mono); color: var(--ember-soft); }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
  .acts button, .wide { border: 1px solid var(--line); background: var(--surface); color: var(--silver); border-radius: 10px; padding: 6px 12px; font-size: 13px; transition: border-color var(--dur), color var(--dur); }
  .acts button:hover, .wide:hover { border-color: var(--ember); color: var(--ember); }
  .setup { display: flex; gap: 14px; align-items: center; justify-content: space-between; padding: 14px 16px; margin-bottom: 14px; border-radius: 14px;
    border: 1px dashed color-mix(in srgb, var(--ember) 55%, var(--line)); background: color-mix(in srgb, var(--ember) 6%, var(--surface)); }
  .setup p { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
  .setup code, .empty code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .pri { border: 0; border-radius: 10px; padding: 8px 18px; background: var(--ember); color: var(--on-ember); font-weight: 700; }
  .grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: start; }
  .col { display: grid; gap: 14px; min-width: 0; }
  .card { padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); min-width: 0; }
  h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font: 600 11px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h3 span, h4 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; }
  h3 .link { margin-left: auto; text-transform: none; letter-spacing: 0; font: 11px var(--f-mono); }
  h4 { margin: 12px 0 6px; font: 600 10.5px/1 var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h4:first-of-type { margin-top: 0; }
  h4.late { color: var(--crit); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .tasks li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 10px; background: var(--void); border-left: 2px solid var(--line); }
  .tasks li.late { border-left-color: var(--crit); }
  .tasks li.prio { border-left-color: var(--ember); }
  .check { position: relative; flex: none; width: 19px; height: 19px; border-radius: 50%; border: 1.5px solid var(--muted); background: none; padding: 0; transition: border-color .15s, background .15s, transform var(--dur) var(--spring); }
  .check:hover { border-color: var(--ember); background: var(--ember-glow); }
  .check:active { transform: scale(.85); }
  .check.on { background: var(--ember); border-color: var(--ember); }
  .check.on::after { content: ''; position: absolute; left: 5.5px; top: 2px; width: 5px; height: 10px; border: solid var(--on-ember); border-width: 0 2px 2px 0; transform: rotate(45deg); }
  .body { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .title { border: 0; background: none; padding: 0; color: var(--ink); font: 600 14px var(--f-body); text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  button.title:hover { color: var(--ember); }
  .body small, .bars small, .read small { display: flex; gap: 8px; flex-wrap: wrap; font: 11px var(--f-mono); color: var(--muted); }
  li.late time, .lt { color: var(--crit); }
  .p { color: var(--ember); }
  .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ember-soft); text-decoration: underline dotted; }
  .ghost { border: 0; background: none; color: var(--muted); font-size: 14px; padding: 3px 7px; border-radius: 8px; }
  .ghost:hover { color: var(--ember); background: var(--surface-2); }
  .more { margin-top: 8px; border: 0; background: none; padding: 0; font: 11px var(--f-mono); color: var(--muted); }
  .done li { opacity: .55; }
  .done .title { text-decoration: line-through; font-weight: 500; }
  .empty { color: var(--muted); font-size: 13px; line-height: 1.6; margin: 4px 0 0; }
  .habits { width: 100%; border-collapse: collapse; }
  .habits th { font: 500 10px var(--f-mono); color: var(--muted); text-transform: uppercase; padding-bottom: 6px; }
  .habits th.today { color: var(--ember); }
  .habits td { text-align: center; padding: 3px 0; }
  .habits .hl { text-align: left; font-size: 13px; color: var(--silver); padding-right: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .dot { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid var(--line); background: var(--void); padding: 0; transition: background .15s, border-color .15s, transform var(--dur) var(--spring); }
  .dot:hover { border-color: var(--ember); }
  .dot:active { transform: scale(.8); }
  .dot.today { border-color: color-mix(in srgb, var(--ember) 60%, var(--line)); }
  .dot.on { background: var(--ember); border-color: var(--ember); box-shadow: 0 0 10px -3px var(--ember-glow); }
  .streak { font: 11px var(--f-mono); color: var(--ember-soft); min-width: 34px; }
  .moods { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .moods button { border: 1px solid var(--line); background: var(--void); color: var(--silver); border-radius: 99px; padding: 5px 12px; font-size: 12.5px; }
  .moods button.on { border-color: var(--c); color: var(--c); background: color-mix(in srgb, var(--c) 14%, var(--void)); font-weight: 600; }
  .wide { width: 100%; }
  .bars { gap: 12px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .row .title { flex: 1; }
  .row b { font: 600 12px var(--f-mono); color: var(--ember); }
  .plus { font: 600 11px var(--f-mono); border: 1px solid var(--line); }
  .bar { height: 6px; border-radius: 99px; background: var(--void); overflow: hidden; margin: 6px 0 4px; }
  .bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--ember-soft), var(--ember)); transition: width var(--dur-slow) var(--spring); }
  .bar.water i { background: linear-gradient(90deg, color-mix(in srgb, #4fb3ff 60%, var(--void)), #4fb3ff); }
  .health .wl { flex: 1; font-size: 13px; color: var(--silver); }
  .health .wl b { font-family: var(--f-mono); color: var(--ink); }
  .health small { display: flex; gap: 6px; flex-wrap: wrap; font: 11px var(--f-mono); color: var(--muted); }
  .bar.goal i { background: linear-gradient(90deg, var(--ok), color-mix(in srgb, var(--ok) 60%, var(--ember))); }
  .read li { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 8px; padding: 4px 0; }
  .read .ghost { grid-row: 1 / 3; grid-column: 2; align-self: center; }
  @media (max-width: 860px) {
    .grid { grid-template-columns: 1fr; }
    .hoje { padding: 14px 14px 28px; }
  }
</style>
