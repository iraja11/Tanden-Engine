<script lang="ts">
  import { ATTRS, SKILLS_5E, saveBonus, signed, skillBonus } from '@tanden/core';
  import type { FichaCtx } from './ctx';

  // Atributos como na ficha de papel: modificador grande, valor, salvaguarda e as perícias de cada um.
  let { x }: { x: FichaCtx } = $props();

  const s = $derived(x.c.sheet);
  const is5e = $derived(s.system === '5e');
  let editing = $state<string | null>(null);
  let draft = $state('');

  function save(prop: string) {
    const v = draft.trim();
    editing = null;
    x.write({ [prop]: v === '' ? null : v });
  }

  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  /** perícia: nada → proficiente → especialista → nada */
  function toggleSkill(skill: string) {
    const prof = s.skills.some((v) => same(v, skill));
    const exp = s.expertise.some((v) => same(v, skill));
    const skills = s.skills.filter((v) => !same(v, skill));
    const expertise = s.expertise.filter((v) => !same(v, skill));
    if (!prof && !exp) skills.push(skill);
    else if (prof && !exp) { skills.push(skill); expertise.push(skill); }
    x.write({ [s.keys.skills]: skills.length ? skills : null, [s.keys.expertise]: expertise.length ? expertise : null });
  }
  function toggleSave(key: string) {
    const a = ATTRS.find((v) => v.key === key)!;
    const has = s.saves.some((v) => a.aliases.some((al) => same(al, v)));
    const next = has ? s.saves.filter((v) => !a.aliases.some((al) => same(al, v))) : [...s.saves, key];
    x.write({ [s.keys.saves]: next.length ? next : null });
  }

  /** todos os seis no 5e (os que faltam aparecem vazios, prontos para preencher) */
  const cards = $derived(
    (is5e ? ATTRS : ATTRS.filter((a) => s.attrs.some((v) => v.key === a.key))).map((a) => {
      const have = s.attrs.find((v) => v.key === a.key);
      return { ...a, prop: have?.prop ?? a.aliases[0]!, score: have?.score ?? null, mod: have?.mod ?? null };
    }),
  );
</script>

<div class="abilities">
  {#each cards as a (a.key)}
    {@const saveOn = s.saves.some((v) => a.aliases.some((al) => same(al, v)))}
    <article class="ab">
      <h4>{a.label}</h4>
      <div class="nums">
        <button class="modc roll-btn" disabled={a.mod === null} onclick={() => x.rollD20(a.mod ?? 0, `Teste de ${a.label}`)} title={`Teste de ${a.label}`}>
          <b>{a.mod === null ? '—' : signed(a.mod)}</b><small>mod.</small>
        </button>
        {#if editing === a.key}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="field score-in mono" bind:value={draft} autofocus inputmode="numeric" aria-label={`Valor de ${a.label}`}
            onblur={() => save(a.prop)} onkeydown={(e) => { if (e.key === 'Enter') save(a.prop); if (e.key === 'Escape') editing = null; }} />
        {:else}
          <button class="score" onclick={() => { editing = a.key; draft = a.score === null ? '' : String(a.score); }} title="Editar valor">
            <b>{a.score ?? '—'}</b><small>valor</small>
          </button>
        {/if}
      </div>
      {#if is5e && a.mod !== null}
        <ul>
          <li class="save">
            <button class="pip" class:p1={saveOn} onclick={() => toggleSave(a.key)} aria-label={`Proficiência na salvaguarda de ${a.label}`}
              title={saveOn ? 'Proficiente (clique para tirar)' : 'Marcar proficiência'}></button>
            <button class="row" onclick={() => x.rollD20(saveBonus(s, a.key), `Salvaguarda de ${a.label}`)}>
              <b class="bn">{signed(saveBonus(s, a.key))}</b><span>Salvaguarda</span>
            </button>
          </li>
          {#each SKILLS_5E.filter((k) => k.attr === a.key) as sk (sk.name)}
            {@const b = skillBonus(s, sk)}
            <li>
              <button class="pip" class:p1={b.level === 1} class:p2={b.level === 2} onclick={() => toggleSkill(sk.name)} aria-label={`Proficiência em ${sk.name}`}
                title={b.level === 2 ? 'Especialista (clique para tirar)' : b.level === 1 ? 'Proficiente (clique: especialista)' : 'Marcar proficiência'}></button>
              <button class="row" onclick={() => x.rollD20(b.bonus, sk.name)}><b class="bn">{signed(b.bonus)}</b><span>{sk.name}</span></button>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  {/each}
</div>

<style>
  .abilities { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 10px; align-items: start; }
  .ab { border: 1px solid var(--line); border-radius: var(--r-lg, 14px); background: var(--surface); padding: 10px 10px 8px; display: grid; gap: 8px; }
  h4 { margin: 0; text-align: center; font: 600 11px var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--silver); }
  .nums { display: flex; align-items: center; justify-content: center; gap: 0; }
  .modc { width: 64px; height: 64px; border-radius: 50% !important; display: grid; place-content: center; gap: 0; z-index: 1;
    border-width: 1.5px !important; }
  .modc b { font: 700 22px/1 var(--f-display); font-variant-numeric: tabular-nums; }
  .modc small, .score small { font: 600 8.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .score { margin-left: -10px; padding: 4px 12px 4px 16px; border: 1px solid var(--line); border-left: 0; border-radius: 0 12px 12px 0;
    background: var(--void); display: grid; justify-items: center; color: var(--ink); min-width: 52px; }
  .score b { font: 600 15px var(--f-mono); }
  .score:hover { border-color: var(--ember); }
  .score-in { width: 58px; margin-left: 6px; text-align: center; }
  ul { list-style: none; margin: 0; padding: 6px 0 0; border-top: 1px solid var(--line); display: grid; gap: 1px; }
  li { display: flex; align-items: center; gap: 6px; }
  li.save { padding-bottom: 4px; margin-bottom: 3px; border-bottom: 1px dashed var(--line); }
  .row { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; border: 0; background: none; border-radius: 7px; padding: 3px 6px;
    font-size: 13px; text-align: left; color: var(--ink); }
  .row:hover { background: var(--surface-2); }
  .row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bn { font: 600 12px var(--f-mono); min-width: 26px; text-align: right; color: var(--silver); }
  .pip { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--muted); background: none; padding: 0; flex: none; }
  .pip.p1 { background: var(--ember); border-color: var(--ember); }
  .pip.p2 { background: var(--ember); border-color: var(--ember); box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--ember); }
</style>
