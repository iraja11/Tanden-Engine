<script lang="ts">
  import { isoDate } from '@tanden/core';

  // Data (ou data e hora) com atalhos. Grava no formato do Obsidian.
  let { value, time = false, onpick }: { value: Date | null; time?: boolean; onpick: (d: Date | null) => void } = $props();

  let withTime = $state(untrackTime());
  function untrackTime() { return time || (!!value && (value.getHours() !== 0 || value.getMinutes() !== 0)); }

  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const plus = (n: number) => { const d = today(); d.setDate(d.getDate() + n); return d; };
  const nextMonday = () => { const d = today(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; };

  // mês mostrado no mini calendário
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  let month = $state(startOf(value ?? new Date()));
  function startOf(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  const days = $derived.by(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  });
  const same = (a: Date | null, b: Date) => !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function pick(d: Date) {
    const out = new Date(d);
    if (withTime && value) out.setHours(value.getHours(), value.getMinutes());
    else if (withTime) out.setHours(9, 0);
    onpick(out);
  }
  function setTime(s: string) {
    const [h, m] = s.split(':').map(Number);
    const d = new Date(value ?? today());
    d.setHours(h ?? 0, m ?? 0);
    onpick(d);
  }
</script>

<div class="dp">
  <input class="db-input" type={withTime ? 'datetime-local' : 'date'} value={value ? (withTime ? isoDate(value, true) : isoDate(value, false)) : ''}
    onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; onpick(v ? new Date(v.length > 10 ? v : `${v}T00:00`) : null); }} />
  <div class="quick">
    <button class="db-btn line" onclick={() => pick(today())}>Hoje</button>
    <button class="db-btn line" onclick={() => pick(plus(1))}>Amanhã</button>
    <button class="db-btn line" onclick={() => pick(nextMonday())}>Próx. segunda</button>
    <button class="db-btn line" onclick={() => pick(plus(7))}>+1 semana</button>
  </div>
  <div class="cal">
    <header>
      <button class="db-btn" aria-label="Mês anterior" onclick={() => (month = new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
      <b>{cap(month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}</b>
      <button class="db-btn" aria-label="Próximo mês" onclick={() => (month = new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
    </header>
    <div class="grid">
      {#each ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as w, i (i)}<span class="w">{w}</span>{/each}
      {#each days as d (d.getTime())}
        <button class:out={d.getMonth() !== month.getMonth()} class:on={same(value, d)} class:today={same(new Date(), d)} onclick={() => pick(d)}>{d.getDate()}</button>
      {/each}
    </div>
  </div>
  <div class="db-row foot">
    <label class="t"><input type="checkbox" bind:checked={withTime} onchange={() => { if (value) pick(value); }} /> Incluir hora</label>
    {#if withTime}<input class="db-input hm" type="time" value={value ? `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}` : '09:00'} onchange={(e) => setTime((e.currentTarget as HTMLInputElement).value)} />{/if}
    <button class="db-btn danger" onclick={() => onpick(null)}>Limpar</button>
  </div>
</div>

<style>
  .dp { display: grid; gap: 8px; padding: 4px; width: 260px; }
  .quick { display: flex; flex-wrap: wrap; gap: 4px; }
  .quick .db-btn { padding: 3px 8px; font-size: 12px; }
  .cal header { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; }
  .w { font: 600 10px var(--f-display); color: var(--muted); padding: 3px 0; }
  .grid button { border: 0; background: none; border-radius: 7px; height: 28px; font: 12.5px var(--f-body); color: var(--ink); }
  .grid button:hover { background: var(--surface-2); }
  .grid button.out { color: var(--muted); opacity: .55; }
  .grid button.today { color: var(--ember); font-weight: 700; }
  .grid button.on { background: var(--ember); color: var(--on-ember); }
  .foot { justify-content: space-between; flex-wrap: wrap; }
  .t { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .hm { width: 90px; }
</style>
