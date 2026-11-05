<script lang="ts">
  import { COINS, addCoins, coinsValue, formatMoney, parseCoins, parseMoney, parseProps, purseProps, spendCoins, readPurse, setProps, type CoinKey, type Coins } from '@tanden/core';
  import { cadernos } from '../cadernos/cadernos.svelte';
  import { files } from '../files/files.svelte';
  import { sound } from '../sound.svelte';

  // Bolsa de moedas da ficha: moedas que tilintam, ganhar/gastar com troco automático.
  let { path, text }: { path: string; text: string } = $props();

  const purse = $derived(readPurse(parseProps(text)));
  const total = $derived(coinsValue(purse.coins));
  let amount = $state('');
  let editing = $state<CoinKey | null>(null);
  let draft = $state('');
  /** a última mudança, para a moeda pular e mostrar "+3" */
  let delta = $state<{ seq: number; by: Partial<Record<CoinKey, number>> }>({ seq: 0, by: {} });

  const parsed = $derived(amount.trim() ? parseMoney(amount) : null);
  const bad = $derived(amount.trim() !== '' && parsed === null);

  function save(next: Coins) {
    const by: Partial<Record<CoinKey, number>> = {};
    for (const c of COINS) if (next[c.key] !== purse.coins[c.key]) by[c.key] = next[c.key] - purse.coins[c.key];
    const patch = purseProps(purse, next);
    if (!Object.keys(patch).length) return;
    cadernos.update(path, (t) => setProps(t, patch));
    delta = { seq: delta.seq + 1, by };
  }

  function gain() {
    // entra nas moedas que vieram escritas ("3 po 5 pp" são 3 de ouro e 5 de prata)
    const given = amount.trim() ? parseCoins(amount) : null;
    if (!given || coinsValue(given) <= 0) return;
    save(addCoins(purse.coins, given));
    sound.play('complete');
    amount = '';
  }

  function spend() {
    const written = amount.trim() ? parseCoins(amount) : null;
    if (!written || parsed === null || parsed <= 0) return;
    const next = spendCoins(purse.coins, written);
    if (!next) {
      files.say(`💰 Não dá: a bolsa tem ${formatMoney(total)} e o gasto é ${formatMoney(parsed)}.`, { error: true });
      sound.play('error');
      return;
    }
    save(next);
    sound.play('tick');
    amount = '';
  }

  function startEdit(k: CoinKey) {
    editing = k;
    draft = String(purse.coins[k]);
  }
  function saveEdit() {
    if (!editing) return;
    const n = Math.max(0, Math.floor(Number(draft.replace(/\D/g, '')) || 0));
    save({ ...purse.coins, [editing]: n });
    editing = null;
  }

  const shown = $derived(COINS.filter((c) => c.key !== 'pe' || purse.coins.pe > 0));
  const gold = $derived((total / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
</script>

<div class="purse">
  <div class="coins">
    {#each shown as c (c.key)}
      {@const d = delta.by[c.key]}
      <div class="coin-slot">
        {#key d ? `${delta.seq}` : 'x'}
          <span class="coin" data-coin={c.key} class:bump={!!d} title={c.label}>{c.key.toUpperCase()}</span>
        {/key}
        {#if editing === c.key}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field mono n" bind:value={draft} inputmode="numeric" autofocus onblur={saveEdit}
            onkeydown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') editing = null; }} aria-label={c.label} />
        {:else}
          <button class="n" onclick={() => startEdit(c.key)} title={`Editar ${c.label.toLowerCase()}`}>{purse.coins[c.key].toLocaleString('pt-BR')}</button>
        {/if}
        {#if d}{#key delta.seq}<i class="float" class:neg={d < 0}>{d > 0 ? '+' : ''}{d}</i>{/key}{/if}
      </div>
    {/each}
    <div class="sum" title="Tudo convertido em ouro"><small>total</small><b>{gold} po</b></div>
  </div>
  <form class="move" onsubmit={(e) => { e.preventDefault(); spend(); }}>
    <input class="field mono" class:bad bind:value={amount} placeholder="12 po, 3 pp, 40…" aria-label="Valor" aria-invalid={bad} />
    <button type="button" class="ghost sm" onclick={gain} disabled={!parsed} title="Somar à bolsa">Ganhar</button>
    <button type="submit" class="ghost sm" disabled={!parsed} title="Pagar (com troco automático)">Gastar</button>
  </form>
  {#if parsed && parsed > total}<p class="warn small">Falta {formatMoney(parsed - total)} para esse gasto.</p>{/if}
</div>

<style>
  .purse { display: grid; gap: 8px; }
  .coins { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; }
  .coin-slot { position: relative; display: flex; align-items: center; gap: 6px; }
  .coin { --a: #f6d27a; --b: #b9851f; --t: #5a3d05; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex: none;
    font: 800 10px var(--f-display); letter-spacing: .04em; color: var(--t);
    background: radial-gradient(circle at 32% 28%, #fff8 0 12%, transparent 30%), radial-gradient(circle, var(--a) 0 55%, var(--b) 56% 64%, var(--a) 65% 100%);
    box-shadow: inset 0 -2px 3px rgba(0, 0, 0, .3), inset 0 2px 2px rgba(255, 255, 255, .45), 0 2px 5px rgba(0, 0, 0, .35); }
  .coin[data-coin='pl'] { --a: #e9eef5; --b: #8e9aab; --t: #36404d; }
  .coin[data-coin='pp'] { --a: #d5d9de; --b: #7f868f; --t: #33383e; }
  .coin[data-coin='pe'] { --a: #e6d9a6; --b: #8f8350; --t: #403a1d; }
  .coin[data-coin='pc'] { --a: #e3a06b; --b: #8c4f22; --t: #3d1f08; }
  .coin.bump { animation: flip .6s cubic-bezier(.3, 1.4, .5, 1); }
  @keyframes flip { 0% { transform: rotateY(0) translateY(0); } 40% { transform: rotateY(360deg) translateY(-8px); } 100% { transform: rotateY(720deg); } }
  .n { border: 0; background: none; padding: 0; min-width: 22px; font: 700 17px var(--f-mono); color: var(--ink); font-variant-numeric: tabular-nums; text-align: left; }
  button.n:hover { color: var(--ember); }
  input.n { width: 70px; padding: 2px 6px !important; font-size: 14px !important; }
  .float { position: absolute; left: 10px; top: -14px; font: 700 12px var(--f-mono); font-style: normal; color: var(--ok); pointer-events: none; animation: rise 1.2s ease-out forwards; }
  .float.neg { color: var(--crit); }
  @keyframes rise { from { opacity: 1; transform: translateY(4px); } to { opacity: 0; transform: translateY(-16px); } }
  .sum { margin-left: auto; display: grid; justify-items: end; }
  .sum small { font: 600 9.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .sum b { font: 700 15px var(--f-mono); color: #f6d27a; }
  .move { display: flex; gap: 6px; }
  .move input { flex: 1; min-width: 0; }
  .warn { margin: 0; color: var(--crit); }
  @media (prefers-reduced-motion: reduce) { .coin.bump, .float { animation: none; } }
</style>
