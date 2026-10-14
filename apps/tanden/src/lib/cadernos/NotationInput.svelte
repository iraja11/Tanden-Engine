<script lang="ts">
  import { PROFILES, type GameProfile } from '@tanden/core';
  import Notation from './Notation.svelte';

  // Campo de notação com prévia em ícones e um teclado de toque (direções,
  // movimentos, botões do jogo), para montar combos no celular sem digitar.
  let { value = $bindable(''), profile = PROFILES.sf, placeholder = '2MK xx 236HP', autofocus = false, onsubmit }:
    { value?: string; profile?: GameProfile; placeholder?: string; autofocus?: boolean; onsubmit?: () => void } = $props();

  let input = $state<HTMLInputElement>();
  let pad = $state(false);

  $effect(() => { if (autofocus) input?.focus(); });

  const numpadDirs = [7, 8, 9, 4, 5, 6, 1, 2, 3];
  const tekkenDirs: Record<number, string> = { 7: 'u/b', 8: 'u', 9: 'u/f', 4: 'b', 5: 'n', 6: 'f', 1: 'd/b', 2: 'd', 3: 'd/f' };
  const MOTIONS = ['236', '214', '623', '421', '41236', '63214', '22', '66', '44', '360', '[4]6', '[2]8'];
  const SEPS = [{ s: ' > ', t: 'link' }, { s: ' xx ', t: 'cancelar' }, { s: ' ~ ', t: 'emendar' }, { s: '+', t: 'junto' }, { s: ', ', t: 'pausa' }];

  function insert(piece: string) {
    const el = input!;
    const a = el.selectionStart ?? value.length;
    const b = el.selectionEnd ?? value.length;
    value = value.slice(0, a) + piece + value.slice(b);
    const at = a + piece.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at, at); });
  }

  function back() {
    const el = input!;
    const a = el.selectionStart ?? value.length;
    const b = el.selectionEnd ?? value.length;
    if (a !== b) value = value.slice(0, a) + value.slice(b);
    else if (a > 0) value = value.slice(0, a - 1) + value.slice(a);
    const at = a === b ? Math.max(0, a - 1) : a;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at, at); });
  }
</script>

<div class="ni">
  <div class="row">
    <input bind:this={input} bind:value {placeholder} spellcheck="false" autocomplete="off"
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onsubmit?.(); } }} />
    <button type="button" class="padbtn" class:on={pad} onclick={() => (pad = !pad)} title="Teclado de luta" aria-label="Teclado de luta">
      <svg viewBox="0 0 20 20"><circle cx="6" cy="10" r="3.4" /><circle cx="13" cy="7" r="1.6" /><circle cx="16" cy="10" r="1.6" /><circle cx="13" cy="13" r="1.6" /></svg>
    </button>
  </div>
  <div class="preview">{#if value.trim()}<Notation text={value} {profile} />{:else}<span class="hint">prévia em ícones</span>{/if}</div>
  {#if pad}
    <div class="pad" role="group" aria-label="Teclado de luta">
      <div class="dirs">
        {#each numpadDirs as d (d)}
          <button type="button" onclick={() => insert(profile.numpad ? String(d) : d === 5 ? 'n' : tekkenDirs[d]!)}>
            <Notation text={profile.numpad ? String(d) : tekkenDirs[d]!} {profile} size="sm" />
          </button>
        {/each}
      </div>
      <div class="col">
        {#if profile.numpad}
          <div class="chips">
            {#each MOTIONS as m (m)}<button type="button" onclick={() => insert(m)}><Notation text={m} {profile} size="sm" /></button>{/each}
          </div>
        {/if}
        <div class="chips">
          {#each profile.buttons as b (b.id)}<button type="button" onclick={() => insert(b.id)}><Notation text={b.id} {profile} size="sm" /></button>{/each}
        </div>
        <div class="chips">
          {#each SEPS as s (s.s)}<button type="button" title={s.t} onclick={() => insert(s.s)}><Notation text={s.s.trim() || ','} {profile} size="sm" /><small>{s.t}</small></button>{/each}
          <button type="button" onclick={() => insert(profile.numpad ? 'j.' : 'ws')}><small>{profile.numpad ? 'pulo' : 'ws'}</small></button>
          <button type="button" class="bk" onclick={back} aria-label="Apagar">⌫</button>
        </div>
        <div class="chips sys">
          {#each profile.system.slice(0, 12) as w (w)}<button type="button" onclick={() => insert(` ${w} `)}><small>{w}</small></button>{/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .ni { display: grid; gap: 6px; }
  .row { display: flex; gap: 6px; }
  input { flex: 1; min-width: 0; background: var(--void); border: 1px solid var(--line); border-radius: 9px; color: var(--ink);
    padding: 8px 10px; font: 14px var(--f-mono); }
  input:focus { border-color: var(--ember); outline: none; }
  .padbtn { width: 38px; border-radius: 9px; border: 1px solid var(--line); background: var(--surface-2); display: grid; place-items: center; }
  .padbtn svg { width: 20px; fill: none; stroke: var(--muted); stroke-width: 1.5; }
  .padbtn.on { border-color: var(--ember); }
  .padbtn.on svg { stroke: var(--ember); }
  .preview { min-height: 26px; display: flex; align-items: center; }
  .hint { color: var(--muted); font-size: 12px; opacity: .6; }
  .pad { display: flex; gap: 10px; flex-wrap: wrap; padding: 10px; border-radius: 12px; background: var(--surface-2); border: 1px solid var(--line); }
  .dirs { display: grid; grid-template-columns: repeat(3, 34px); gap: 4px; align-content: start; }
  .dirs button, .chips button { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; min-height: 34px;
    display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 3px 6px; }
  .dirs button:hover, .chips button:hover { border-color: var(--ember); }
  .col { flex: 1; min-width: 200px; display: grid; gap: 6px; align-content: start; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  small { font: 600 10px/1 var(--f-display); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
  .sys small { color: var(--ember-soft); }
  .bk { color: var(--muted); }
</style>
