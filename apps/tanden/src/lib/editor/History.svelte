<script lang="ts">
  import diff from 'fast-diff';
  import { untrack } from 'svelte';
  import { engine } from '../engine.svelte';
  import { files } from '../files/files.svelte';
  import { versions, type Version } from './versions.svelte';
  import { noteName } from './host';

  // Histórico de versões da nota: escolhe uma, vê o que muda e restaura.
  let { path, onclose }: { path: string; onclose: () => void } = $props();

  let list = $state<Version[]>([]);
  let pick = $state(0);
  void versions.list(untrack(() => path)).then((l) => {
    list = [...l].reverse();
  });
  const chosen = $derived(list[pick]);

  /** linhas com o que sai (-) e o que entra (+) para chegar na versão escolhida */
  const lines = $derived.by(() => {
    if (!chosen) return [];
    const cur = engine.content;
    const ids = new Map<string, string>();
    const enc = (t: string) => t.split('\n').map((l) => ids.get(l) ?? (ids.set(l, String.fromCharCode(0xe000 + ids.size)), ids.get(l)!)).join('');
    const back = new Map([...ids].map(([k, v]) => [v, k]));
    const a = enc(cur);
    const b = enc(chosen.text);
    for (const [k, v] of ids) back.set(v, k);
    const out: Array<{ op: -1 | 0 | 1; text: string }> = [];
    for (const [op, chunk] of diff(a, b)) for (const ch of chunk) out.push({ op: op as -1 | 0 | 1, text: back.get(ch) ?? '' });
    return out;
  });
  const changed = $derived(lines.filter((l) => l.op !== 0).length);
  /** trechos iguais longe das mudanças viram uma linha "… N linhas iguais" */
  const shown = $derived.by(() => {
    if (!changed) return lines.map((l) => ({ ...l, gap: 0 }));
    const near = lines.map(() => false);
    lines.forEach((l, i) => { if (l.op !== 0) for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + 3); k++) near[k] = true; });
    const out: Array<{ op: -1 | 0 | 1; text: string; gap: number }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (near[i]) { out.push({ ...lines[i]!, gap: 0 }); continue; }
      let j = i;
      while (j < lines.length && !near[j]) j++;
      out.push({ op: 0, text: '', gap: j - i });
      i = j - 1;
    }
    return out;
  });

  const when = (t: number) => {
    const d = new Date(t);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const day = same ? 'Hoje' : d.toDateString() === y.toDateString() ? 'Ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
    return `${day}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  function restore() {
    if (!chosen) return;
    void versions.snapshot(path, engine.content, true);
    engine.writeNote(path, chosen.text);
    files.say(`Versão de ${when(chosen.at)} restaurada. Ctrl+Z desfaz.`);
    onclose();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') onclose(); }} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="box" role="dialog" aria-label="Histórico de versões">
    <header>
      <h3>Histórico de versões <span>{noteName(path)}</span></h3>
      <button class="x" onclick={onclose} aria-label="Fechar">×</button>
    </header>
    {#if !list.length}
      <p class="empty">Ainda não há versões guardadas desta nota neste aparelho. Elas aparecem conforme você edita (uma a cada 5 minutos de edição).</p>
    {:else}
      <div class="cols">
        <ul>
          {#each list as v, i (v.at)}
            <li><button class:on={i === pick} onclick={() => (pick = i)}>{when(v.at)}<small>{v.text.length.toLocaleString('pt-BR')} caracteres</small></button></li>
          {/each}
        </ul>
        <div class="view">
          <div class="bar">
            <span>{changed ? `${changed} ${changed === 1 ? 'linha muda' : 'linhas mudam'}` : 'Igual à nota atual'}</span>
            <button class="go" disabled={!changed} onclick={restore}>Restaurar esta versão</button>
          </div>
          <pre>{#each shown as l, i (i)}{#if l.gap}<div class="gap">··· {l.gap} {l.gap === 1 ? 'linha igual' : 'linhas iguais'}</div>{:else}<div class="l" class:add={l.op === 1} class:del={l.op === -1}>{l.op === 1 ? '+ ' : l.op === -1 ? '− ' : '  '}{l.text || ' '}</div>{/if}{/each}</pre>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; background: var(--scrim); backdrop-filter: blur(3px); animation: fade .15s; }
  @keyframes fade { from { opacity: 0; } }
  .box { width: min(980px, 94vw); height: min(680px, 88vh); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
    box-shadow: 0 40px 80px -30px var(--shadow); overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  h3 { margin: 0; font: 600 15px var(--f-display); }
  h3 span { color: var(--muted); font: 12px var(--f-mono); margin-left: 8px; }
  .x { border: 0; background: none; font-size: 22px; color: var(--muted); }
  .empty { padding: 30px; color: var(--muted); }
  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px 1fr; }
  ul { list-style: none; margin: 0; padding: 8px; overflow-y: auto; border-right: 1px solid var(--line); }
  li button { width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 9px; display: grid; gap: 2px; color: var(--ink); font-size: 13.5px; }
  li button:hover { background: var(--surface-2); }
  li button.on { background: color-mix(in srgb, var(--ember) 13%, transparent); }
  small { color: var(--muted); font: 11px var(--f-mono); }
  .view { min-width: 0; display: flex; flex-direction: column; }
  .bar { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
  .go { border: 0; border-radius: 9px; padding: 7px 14px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .go:disabled { opacity: .4; cursor: default; }
  pre { flex: 1; margin: 0; overflow: auto; padding: 10px 0; font: 12.5px/1.55 var(--f-mono); }
  .l { padding: 0 14px; white-space: pre-wrap; word-break: break-word; color: var(--muted); }
  .gap { padding: 4px 14px; margin: 4px 0; color: var(--muted); opacity: .7; font-size: 11.5px; background: var(--void); }
  .l.add { background: color-mix(in srgb, var(--ok) 13%, transparent); color: var(--ink); }
  .l.del { background: color-mix(in srgb, var(--crit) 12%, transparent); color: var(--ink); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--crit) 60%, transparent); }
  @media (max-width: 720px) { .cols { grid-template-columns: 1fr; grid-template-rows: 160px 1fr; } ul { border-right: 0; border-bottom: 1px solid var(--line); } }
</style>
