<script lang="ts">
  import { getSection, type Campaign } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { mesa } from './mesa.svelte';

  let { campaign, onOpenNote }: { campaign: Campaign; onOpenNote: (path: string) => void } = $props();

  const list = $derived.by(() => {
    void cadernos.rev;
    void mesa.rev;
    return [...campaign.sessions].reverse().map((s) => {
      const text = cadernos.read(s.path);
      const resumo = (getSection(text, 'Resumo') ?? '').trim();
      const log = (getSection(text, 'Registro') ?? '').split('\n').filter((l) => /^\s*-\s/.test(l)).length;
      return { ...s, resumo, log };
    });
  });

  function startNew() {
    const p = mesa.newSession();
    if (p) onOpenNote(p);
  }
</script>

<div class="sessions">
  <div class="top">
    <button class="primary sm" onclick={startNew}>Nova sessão {campaign.sessions.length + 1}</button>
    <span class="dim small">A sessão nova traz o resumo da anterior e fica aberta: cada rolagem entra no <code>## Registro</code> dela.</span>
  </div>
  {#each list as s (s.path)}
    <article class="box" class:on={mesa.sessionPath === s.path}>
      <header>
        <button class="title" onclick={() => onOpenNote(s.path)}>{s.name}</button>
        <span class="dim small mono">{s.date}</span>
        <span class="grow"></span>
        {#if mesa.sessionPath === s.path}
          <span class="live">anotando</span>
          <button class="ghost sm" onclick={() => mesa.setSession(null)}>Fechar</button>
        {:else}
          <button class="ghost sm" onclick={() => { mesa.setSession(s.path); mesa.recording = true; mesa.save(); }} title="As rolagens passam a entrar no registro desta sessão">Anotar rolagens aqui</button>
        {/if}
      </header>
      {#if s.resumo}<p class="resumo">{s.resumo.length > 320 ? `${s.resumo.slice(0, 317)}…` : s.resumo}</p>{:else}<p class="dim small">Sem resumo ainda. Escreva em <code>## Resumo</code> para a próxima sessão já começar com ele.</p>{/if}
      {#if s.log}<p class="dim small">{s.log} {s.log === 1 ? 'linha' : 'linhas'} no registro</p>{/if}
    </article>
  {:else}
    <p class="dim">Nenhuma sessão ainda.</p>
  {/each}
</div>

<style>
  .sessions { display: grid; gap: 10px; align-content: start; }
  .top { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  article { display: grid; gap: 6px; }
  article.on { border-color: color-mix(in srgb, var(--ok) 50%, var(--line)); }
  header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .title { border: 0; background: none; padding: 0; font: 600 15px var(--f-display); color: var(--ink); }
  .title:hover { color: var(--ember); }
  .grow { flex: 1; }
  .live { font: 600 10px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--ok); }
  .resumo { margin: 0; white-space: pre-line; font-size: 13.5px; color: var(--silver); }
  article p { margin: 0; }
</style>
