<script lang="ts">
  import { desktop } from './platform';
  import { engine } from './engine.svelte';
  import { ollama } from './ollama.svelte';
  import Terminal from './Terminal.svelte';

  // Painel de IA. No PC: Claude Code e Gemini CLI rodando na pasta do cofre
  // (pelas suas assinaturas) e um terminal comum. Em todo lugar: Ollama local.
  type Tab = 'claude' | 'gemini' | 'shell' | 'ollama';
  const tabs: { id: Tab; label: string; hint: string; desktopOnly: boolean }[] = [
    { id: 'claude', label: 'Claude', hint: 'Claude Code: código e coisas técnicas', desktopOnly: true },
    { id: 'gemini', label: 'Gemini', hint: 'Gemini CLI: pesquisa, criatividade e Google', desktopOnly: true },
    { id: 'ollama', label: 'Ollama', hint: 'IA local na sua placa, grátis e offline', desktopOnly: false },
    { id: 'shell', label: 'Terminal', hint: 'Terminal na pasta do cofre', desktopOnly: true },
  ];
  const available = tabs.filter((t) => desktop || !t.desktopOnly);

  let tab = $state<Tab>(available[0]!.id);
  /** terminais abertos ficam vivos ao trocar de aba */
  let opened = $state<Tab[]>([]);
  let draft = $state('');
  let log: HTMLElement | undefined = $state();

  $effect(() => {
    if (tab !== 'ollama' && !opened.includes(tab)) opened = [...opened, tab];
    if (tab === 'ollama' && ollama.models.length === 0) void ollama.loadModels();
  });

  $effect(() => {
    ollama.messages.at(-1)?.content;
    log?.scrollTo({ top: log.scrollHeight });
  });

  const program = (t: Tab) => (t === 'shell' ? '' : (t as 'claude' | 'gemini'));

  function submit(e: Event): void {
    e.preventDefault();
    const text = draft;
    draft = '';
    void ollama.send(text);
  }
</script>

<section class="ai">
  <header>
    {#each available as t (t.id)}
      <button class:on={tab === t.id} onclick={() => (tab = t.id)} title={t.hint}>{t.label}</button>
    {/each}
  </header>

  <div class="body">
    {#each opened as t (t)}
      <Terminal program={program(t)} visible={tab === t} />
    {/each}

    {#if tab === 'ollama'}
      <div class="chat">
        <div class="bar">
          <input class="url" bind:value={ollama.url} onchange={() => ollama.loadModels()} aria-label="Endereço do Ollama" />
          <select value={ollama.model} onchange={(e) => ollama.setModel(e.currentTarget.value)} aria-label="Modelo">
            {#each ollama.models as m (m)}<option>{m}</option>{/each}
          </select>
          <button onclick={() => ollama.loadModels()} title="Procurar modelos de novo">↻</button>
          <label title="Manda a nota aberta junto, como contexto">
            <input type="checkbox" bind:checked={ollama.withNote} /> nota aberta
          </label>
          {#if ollama.messages.length}<button onclick={() => ollama.clear()}>Limpar</button>{/if}
        </div>

        <div class="log" bind:this={log}>
          {#if ollama.messages.length === 0}
            <p class="empty">
              {#if engine.active && ollama.withNote}Pergunte algo sobre <b>{engine.active.replace(/\.md$/, '')}</b>, ou sobre qualquer coisa.
              {:else}Pergunte qualquer coisa. Roda na sua placa de vídeo, sem internet.{/if}
            </p>
          {/if}
          {#each ollama.messages as m, i (i)}
            <div class="msg {m.role}">
              <p>{m.content}{#if ollama.thinking && i === ollama.messages.length - 1}<span class="caret"></span>{/if}</p>
              {#if m.role === 'assistant' && m.content && !(ollama.thinking && i === ollama.messages.length - 1) && engine.active}
                <button class="insert" onclick={() => ollama.insert(m.content)}>Inserir na nota</button>
              {/if}
            </div>
          {/each}
          {#if ollama.error}<p class="err">{ollama.error}</p>{/if}
        </div>

        <form onsubmit={submit}>
          <textarea bind:value={draft} rows="2" placeholder={ollama.model ? `Mensagem para ${ollama.model}` : 'Nenhum modelo encontrado'}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) submit(e); }}></textarea>
          <button disabled={ollama.thinking || !ollama.model || !draft.trim()}>Enviar</button>
        </form>
      </div>
    {/if}
  </div>
</section>

<style>
  .ai { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  header { display: flex; gap: 4px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  header button { border: 0; background: none; padding: 6px 12px; border-radius: 9px; color: var(--muted);
    font: 500 11px/1 var(--f-display); letter-spacing: .1em; text-transform: uppercase; }
  header button.on { color: var(--ember); background: color-mix(in srgb, var(--ember) 10%, transparent); }
  .body { flex: 1; min-height: 0; position: relative; }

  .chat { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 14px; font-size: 12px; color: var(--muted); }
  .bar input.url { width: 200px; }
  .bar input.url, .bar select, .bar button, form textarea { background: var(--surface-2); color: var(--ink);
    border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; font: 12px var(--f-mono); }
  .bar button:hover { border-color: var(--ember); }
  .bar label { display: flex; align-items: center; gap: 4px; }
  .log { flex: 1; overflow-y: auto; padding: 4px 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .empty { margin: auto; max-width: 420px; text-align: center; color: var(--muted); }
  .empty b { color: var(--ember-soft); font-weight: 600; }
  .msg { max-width: 760px; width: 100%; margin: 0 auto; }
  .msg p { margin: 0; white-space: pre-wrap; line-height: 1.6; }
  .msg.user p { color: var(--ember-soft); }
  .msg.user p::before { content: '› '; color: var(--ember); }
  .msg.assistant { padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .insert { margin-top: 8px; border: 1px solid var(--line); background: none; border-radius: 8px; padding: 4px 10px; font-size: 12px; color: var(--muted); }
  .insert:hover { color: var(--ember); border-color: var(--ember); }
  .caret { display: inline-block; width: 7px; height: 1em; margin-left: 2px; vertical-align: text-bottom; background: var(--ember);
    animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .err { margin: 0 auto; max-width: 760px; color: var(--crit); font-size: 13px; }
  form { display: flex; gap: 8px; padding: 10px 14px max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); }
  form textarea { flex: 1; resize: none; font: 14px var(--f-body); padding: 8px 10px; }
  form textarea:focus { outline: none; border-color: var(--ember); }
  form button { border: 0; border-radius: 9px; padding: 0 16px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  form button:disabled { opacity: .4; }
</style>
