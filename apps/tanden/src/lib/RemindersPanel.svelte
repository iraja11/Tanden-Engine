<script lang="ts">
  import { REMINDERS_NOTE, bucketOf, parseQuickReminder, type Bucket, type Reminder } from '@tanden/core';
  import { reminders, repeatLabel, whenLabel } from './reminders.svelte';
  import { desktop } from './platform';
  import { isTauri } from './storage-tauri';

  // Tela de lembretes: captura rápida em português, lista por dia e ações.
  let { onopen }: { onopen: (path: string) => void } = $props();

  let input = $state('');
  let menuFor = $state<string | null>(null);
  let showDone = $state(false);

  const preview = $derived(input.trim() ? parseQuickReminder(input, reminders.now) : null);

  const groups: Array<[Bucket, string]> = [
    ['atrasados', 'Atrasados'],
    ['hoje', 'Hoje'],
    ['amanha', 'Amanhã'],
    ['semana', 'Próximos 7 dias'],
    ['depois', 'Depois'],
  ];
  const byBucket = $derived.by(() => {
    const m = new Map<Bucket, Reminder[]>();
    for (const r of reminders.items) {
      const b = bucketOf(r, reminders.now);
      (m.get(b) ?? m.set(b, []).get(b)!).push(r);
    }
    m.set('feitos', (m.get('feitos') ?? []).sort((a, b) => b.at - a.at).slice(0, 15));
    return m;
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (reminders.add(input)) input = '';
  }

  const tomorrow9 = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9).getTime();
  };
  const snoozes: Array<[string, () => number]> = [
    ['+10 min', () => Date.now() + 10 * 60_000],
    ['+1 hora', () => Date.now() + 3600_000],
    ['Amanhã 9h', tomorrow9],
  ];
  const note = (p: string) => p.replace(/\.md$/, '');
</script>

<section class="rem">
  <header>
    <h2>Lembretes <span>{reminders.pending.length}</span></h2>
  </header>

  <form class="quick" onsubmit={submit}>
    <input bind:value={input} placeholder="amanhã 9h comprar pão · toda segunda 7h academia · em 20 min…"
      aria-label="Novo lembrete" autocomplete="off" enterkeyhint="done" />
    <button disabled={!preview} aria-label="Adicionar">+</button>
  </form>
  <p class="preview" class:warn={preview && preview.at <= reminders.now}>
    {#if preview}
      {preview.text} · {whenLabel(preview.at, reminders.now)}{#if preview.repeat} · {repeatLabel(preview.repeat)}{/if}
      {#if preview.at <= reminders.now} · esse horário já passou{/if}
    {:else if input.trim()}
      Diga quando: hoje 18h, amanhã 9h, sexta 18h30, 15/11, em 20 min, toda segunda 7h
    {:else}
      Escreva o que e quando, do seu jeito. Enter salva em {note(REMINDERS_NOTE)}.
    {/if}
  </p>

  {#if reminders.error}<p class="err">{reminders.error}</p>{/if}
  {#if reminders.blocked}
    <p class="err">As notificações estão bloqueadas. <button class="link" onclick={() => reminders.askPermission()}>Permitir</button></p>
  {/if}

  <div class="list">
    {#each groups as [b, label] (b)}
      {@const list = byBucket.get(b) ?? []}
      {#if list.length}
        <h3 class:late={b === 'atrasados'}>{label} <span>{list.length}</span></h3>
        <ul>
          {#each list as r (r.key + r.line)}
            <li class:late={b === 'atrasados'} class:prio={r.priority >= 3}>
              <button class="check" onclick={() => reminders.complete(r)}
                title={r.repeat ? 'Feito: vai para a próxima vez' : 'Feito'} aria-label="Marcar como feito"></button>
              <div class="body">
                <b>{r.text}</b>
                <small>
                  <time>{whenLabel(r.at, reminders.now)}</time>
                  {#if r.repeat}<span class="rep">↻ {repeatLabel(r.repeat)}</span>{/if}
                  {#if r.path !== REMINDERS_NOTE}
                    <button class="link" onclick={() => onopen(r.path)}>{note(r.path)}</button>
                  {/if}
                </small>
              </div>
              <div class="snooze">
                <button class="ghost" onclick={() => (menuFor = menuFor === r.key ? null : r.key)} aria-label="Adiar">⏱</button>
                {#if menuFor === r.key}
                  <div class="menu">
                    {#each snoozes as [l, when] (l)}
                      <button onclick={() => { reminders.snooze(r, when()); menuFor = null; }}>{l}</button>
                    {/each}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    {/each}

    {#if !reminders.pending.length}
      <p class="empty">Nenhum lembrete pendente. Qualquer tarefa com data numa nota também vira lembrete:
        <code>- [ ] texto (@2026-10-15 09:00)</code></p>
    {/if}

    {#if (byBucket.get('feitos') ?? []).length}
      <button class="done-toggle" onclick={() => (showDone = !showDone)}>{showDone ? 'Esconder feitos' : 'Mostrar feitos'}</button>
      {#if showDone}
        <ul class="done">
          {#each byBucket.get('feitos') ?? [] as r (r.key + r.line)}
            <li>
              <button class="check on" onclick={() => reminders.reopen(r)} aria-label="Desmarcar"></button>
              <div class="body"><b>{r.text}</b><small>{whenLabel(r.at, reminders.now)}</small></div>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>

  {#if isTauri()}
    <footer>
      {#if desktop}
        <label><input type="checkbox" checked={reminders.background} disabled={!reminders.trayOk}
          onchange={(e) => reminders.setBackground(e.currentTarget.checked)} />
          Continuar na bandeja ao fechar a janela</label>
        <label><input type="checkbox" checked={reminders.autostart}
          onchange={(e) => reminders.setAutostart(e.currentTarget.checked)} />
          Abrir com o sistema, minimizado</label>
        {#if !reminders.trayOk}<small>Sem bandeja neste sistema: os lembretes avisam só com a janela aberta.</small>{/if}
      {:else}
        <small>Os avisos chegam mesmo com o app fechado.</small>
      {/if}
    </footer>
  {/if}
</section>

<style>
  .rem { height: 100%; display: flex; flex-direction: column; max-width: 760px; width: 100%; margin: 0 auto; padding: 18px 24px 0; min-height: 0; }
  header h2 { margin: 0 0 14px; font: 600 11.5px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  header h2 span, h3 span { color: var(--ember); font-family: var(--f-mono); letter-spacing: 0; margin-left: 6px; }

  .quick { display: flex; gap: 8px; }
  .quick input { flex: 1; min-width: 0; padding: 11px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface);
    color: var(--ink); font: 15px var(--f-body); outline: none; transition: border-color .2s, box-shadow .2s; }
  .quick input:focus { border-color: var(--ember); box-shadow: 0 0 0 3px var(--ember-glow); }
  .quick button { width: 44px; border-radius: 12px; border: 0; background: var(--ember); color: #160b03; font-size: 22px; font-weight: 600; }
  .quick button:disabled { background: var(--surface-2); color: var(--muted); }
  .preview { margin: 8px 2px 14px; min-height: 1.3em; font: 12px var(--f-mono); color: var(--ember-soft); }
  .preview.warn, .err { color: var(--crit); }
  .err { font-size: 13px; margin: 0 0 10px; }

  .list { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: 24px; }
  h3 { margin: 16px 0 6px; font: 600 11px/1 var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  h3.late { color: var(--crit); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  li { display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 12px; background: var(--surface);
    border: 1px solid transparent; border-left: 2px solid var(--line); }
  li:hover { border-color: var(--line); }
  li.late { border-left-color: var(--crit); }
  li.prio { border-left-color: var(--ember); }
  .check { flex: none; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--muted); background: none; padding: 0;
    transition: border-color .15s, background .15s; }
  .check:hover { border-color: var(--ember); background: var(--ember-glow); }
  .check.on { background: var(--ember); border-color: var(--ember); }
  .body { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .body b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .body small { display: flex; gap: 10px; flex-wrap: wrap; font: 11px var(--f-mono); color: var(--muted); }
  li.late time { color: var(--crit); }
  .rep { color: var(--ember-soft); }
  .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ember-soft); text-decoration: underline dotted; }

  .snooze { position: relative; }
  .ghost { border: 0; background: none; color: var(--muted); font-size: 15px; padding: 4px 6px; border-radius: 8px; }
  .ghost:hover { color: var(--ember); background: var(--surface-2); }
  .menu { position: absolute; right: 0; top: 100%; z-index: 3; display: grid; min-width: 120px; padding: 4px; border-radius: 10px;
    background: var(--surface-2); border: 1px solid var(--line); box-shadow: 0 8px 24px #0008; }
  .menu button { border: 0; background: none; text-align: left; padding: 7px 10px; border-radius: 7px; color: var(--ink); font-size: 13px; }
  .menu button:hover { background: var(--surface); color: var(--ember); }

  .empty { color: var(--muted); font-size: 14px; line-height: 1.6; margin-top: 24px; }
  .empty code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .done-toggle { margin: 18px 0 6px; border: 0; background: none; padding: 0; font: 11px var(--f-mono); color: var(--muted); }
  .done li { opacity: .55; }
  .done b { text-decoration: line-through; }

  footer { display: grid; gap: 6px; padding: 10px 2px 14px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
  footer label { display: flex; align-items: center; gap: 8px; }
  footer input { accent-color: var(--ember); }
  footer small { font-size: 12px; }

  @media (max-width: 720px) {
    .rem { padding: 14px 14px 0; }
  }
</style>
