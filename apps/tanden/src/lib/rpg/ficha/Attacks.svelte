<script lang="ts">
  import { attackFormula, readAttackRows, resolveBonus, sheetVars, signed, splitDamage, writeAttackRows, type AttackRow } from '@tanden/core';
  import type { FichaCtx } from './ctx';

  // Armas e truques de dano: a tabela "## Ataques" da nota, editável aqui.
  let { x }: { x: FichaCtx } = $props();

  const rows = $derived(readAttackRows(x.text));
  const vars = $derived(sheetVars(x.c.sheet));
  let editing = $state<number | null>(null);
  let draft = $state<AttackRow>({ name: '', hit: '', damage: '', notes: '' });
  let adding = $state(false);

  function save(next: AttackRow[]) {
    x.update((t) => writeAttackRows(t, next));
  }
  function startAdd() {
    adding = true;
    editing = null;
    draft = { name: '', hit: '@for+@prof', damage: '', notes: '' };
  }
  function startEdit(i: number) {
    adding = false;
    editing = i;
    draft = { ...rows[i]! };
  }
  function commit() {
    if (!draft.name.trim()) { adding = false; editing = null; return; }
    const r = { ...draft, name: draft.name.trim(), hit: draft.hit.trim(), damage: draft.damage.trim(), notes: draft.notes.trim() };
    save(editing !== null ? rows.map((v, i) => (i === editing ? r : v)) : [...rows, r]);
    adding = false;
    editing = null;
  }
  function remove(i: number) {
    save(rows.filter((_, j) => j !== i));
    editing = null;
  }
  /** "1d8+@for" → "1d8+3" para mostrar */
  const shown = (f: string) => f.replace(/@([\p{L}_]+)/gu, (m, n: string) => String(vars(n) ?? m)).replace(/\+-/g, '−').replace(/\+0(?!\d)/g, '');
  const crit = (f: string) => f.replace(/(\d*)d(\d+)/gi, (_m, n: string, s: string) => `${Number(n || 1) * 2}d${s}`);
</script>

<div class="atks">
  <div class="thead" aria-hidden="true"><span>Nome</span><span>Acerto / CD</span><span>Dano e tipo</span><span>Notas</span><span></span></div>
  {#each rows as a, i (a._i ?? i)}
    {#if editing === i}
      {@render form()}
    {:else}
      {@const d = splitDamage(a.damage)}
      {@const hit = attackFormula({ name: a.name, hit: a.hit, damage: d.formula, damageType: d.type, notes: a.notes })}
      <div class="tr">
        <button class="nm" onclick={() => startEdit(i)} title="Editar">{a.name}</button>
        <span class="c hitc">{#if hit}<button class="roll-btn pill" onclick={() => x.rollF(hit, `${a.name}: acerto`, true)} title={hit}>{resolveBonus(a.hit, vars)}</button>{:else}<span class="dim">{a.hit || '—'}</span>{/if}</span>
        <span class="c dmgc">
          {#if d.formula}
            <button class="roll-btn pill" onclick={() => x.rollF(d.formula, `${a.name}: dano${d.type ? ` (${d.type})` : ''}`)} title={d.formula}>{shown(d.formula)}</button>
            <button class="roll-btn pill crit" onclick={() => x.rollF(crit(d.formula), `${a.name}: dano crítico`)} title="Crítico (dobra os dados)">×2</button>
            {#if d.type}<small class="dim">{d.type}</small>{/if}
          {:else}<span class="dim">{a.damage || '—'}</span>{/if}
        </span>
        <span class="c notes dim">{a.notes}</span>
        <button class="icon" onclick={() => startEdit(i)} aria-label={`Editar ${a.name}`} title="Editar">✎</button>
      </div>
    {/if}
  {/each}
  {#if x.c.casting}
    <div class="tr spell">
      <span class="nm static">Ataque mágico <small class="dim">({x.c.casting.label})</small></span>
      <span class="c hitc"><button class="roll-btn pill" onclick={() => x.rollD20(x.c.casting!.attack, 'Ataque mágico')}>{signed(x.c.casting.attack)}</button><small class="dim">CD {x.c.casting.dc}</small></span>
      <span class="c dmgc dim">pela magia</span>
      <span class="c notes dim">Bônus de proficiência + {x.c.casting.label}</span>
      <span></span>
    </div>
  {/if}
  {#if adding}{@render form()}{/if}
  {#if !adding && editing === null}
    <button class="ghost sm add" onclick={startAdd}>+ Arma ou ataque</button>
  {/if}
</div>

{#snippet form()}
  <form class="tr edit" onsubmit={(e) => { e.preventDefault(); commit(); }}>
    <!-- svelte-ignore a11y_autofocus -->
    <input class="field" bind:value={draft.name} placeholder="Espada longa" aria-label="Nome" autofocus />
    <input class="field mono" bind:value={draft.hit} placeholder="@for+@prof" aria-label="Acerto" title="Ex.: +5, @for+@prof, @des+@prof+1" />
    <input class="field mono" bind:value={draft.damage} placeholder="1d8+@for cortante" aria-label="Dano e tipo" />
    <input class="field" bind:value={draft.notes} placeholder="Versátil (1d10)" aria-label="Notas" />
    <span class="fa">
      <button class="primary sm">Salvar</button>
      <button type="button" class="ghost sm" onclick={() => { adding = false; editing = null; }}>Cancelar</button>
      {#if editing !== null}<button type="button" class="icon danger" onclick={() => remove(editing!)} aria-label="Apagar" title="Apagar">✕</button>{/if}
    </span>
  </form>
{/snippet}

<style>
  .atks { display: grid; gap: 2px; container-type: inline-size; }
  .thead, .tr { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, .8fr) minmax(0, 1.3fr) minmax(0, 1fr) 28px; gap: 8px; align-items: center; }
  .thead { font: 600 9.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); padding: 0 4px 4px; border-bottom: 1px solid var(--line); }
  .tr { padding: 5px 4px; border-bottom: 1px solid color-mix(in srgb, var(--line) 60%, transparent); min-height: 38px; }
  .tr.spell { background: color-mix(in srgb, var(--ember) 5%, transparent); border-radius: 8px; }
  .nm { border: 0; background: none; padding: 0; text-align: left; font-weight: 600; font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; }
  .nm:hover:not(.static) { color: var(--ember-soft); }
  .c { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; font-size: 12.5px; }
  .notes { font-size: 12px; }
  .pill { padding: 3px 9px !important; font: 600 12.5px var(--f-mono) !important; }
  .crit { color: var(--ember-soft) !important; }
  .edit { grid-template-columns: minmax(0, 1.3fr) minmax(0, .8fr) minmax(0, 1.3fr) minmax(0, 1fr); }
  .edit input { padding: 5px 8px !important; font-size: 13px !important; }
  .fa { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
  .add { justify-self: start; margin-top: 6px; }
  @container (max-width: 560px) {
    .thead { display: none; }
    .tr { grid-template-columns: minmax(0, 1fr) auto 28px; row-gap: 4px; }
    .tr > .dmgc { grid-column: 1 / 3; }
    .tr > .icon { grid-row: 1; grid-column: 3; }
    .tr > .notes { grid-column: 1 / -1; }
    .tr > .notes:empty { display: none; }
    .edit { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  }
</style>
