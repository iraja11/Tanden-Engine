<script lang="ts">
  import {
    abilityMax, actionKind, attackFormula, readAbilities, readAttackRows, readSpells, resolveBonus, sheetVars, slotFor, splitDamage, useSlot,
    writeAbilities, type Ability, type ActionKind,
  } from '@tanden/core';
  import type { FichaCtx } from './ctx';
  import { turnos } from './turno.svelte';

  // Modo turno: economia de ação e tudo o que dá para fazer, em cartas.
  let { x }: { x: FichaCtx } = $props();
  const c = $derived(x.c);
  const st = $derived(turnos.get(x.path));
  const vars = $derived(sheetVars(c.sheet));
  const speed = $derived(Number(/[\d,.]+/.exec(c.speed)?.[0]?.replace(',', '.') ?? 9) - c.exhaustion * 1.5);
  const moveMax = $derived(Math.max(0, speed * (st.dash ? 2 : 1)));
  let filter = $state<'todas' | ActionKind>('todas');
  let msg = $state('');
  let timer: ReturnType<typeof setTimeout> | null = null;
  function flash(m: string) {
    msg = m;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => (msg = ''), 3500);
  }

  const RES: Record<Exclude<ActionKind, 'livre'>, 'action' | 'bonus' | 'reaction'> = { 'ação': 'action', 'bônus': 'bonus', 'reação': 'reaction' };
  const LABEL: Record<ActionKind, string> = { 'ação': 'Ação', 'bônus': 'Ação bônus', 'reação': 'Reação', 'livre': 'Livre' };
  const used = (k: ActionKind) => k !== 'livre' && st[RES[k]];
  /** gasta o recurso; false se já tinha sido gasto */
  function spend(k: ActionKind, what: string): boolean {
    if (k === 'livre') return true;
    if (st[RES[k]]) { flash(`${LABEL[k]} já usada neste turno`); return false; }
    turnos.set(x.path, { [RES[k]]: true });
    flash(`${what}: ${LABEL[k].toLowerCase()} usada`);
    return true;
  }

  type Card = { id: string; kind: 'ataque' | 'magia' | 'habilidade'; cost: ActionKind; name: string; sub: string; notes: string;
    run: () => void; extra?: Array<{ label: string; run: () => void; title?: string }>; pips?: { max: number; spent: number; set: (n: number) => void };
    dim?: boolean };

  const abilities = $derived(readAbilities(x.text));
  function setAbility(i: number, spent: number) {
    x.update((t) => writeAbilities(t, readAbilities(t).map((a, j) => (j === i ? { ...a, spent } : a))));
  }

  const cards = $derived.by((): Card[] => {
    const out: Card[] = [];
    readAttackRows(x.text).forEach((a, i) => {
      const d = splitDamage(a.damage);
      const hit = attackFormula({ name: a.name, hit: a.hit, damage: d.formula, damageType: d.type, notes: a.notes });
      out.push({
        id: `a${i}`, kind: 'ataque', cost: 'ação', name: a.name, sub: `${resolveBonus(a.hit, vars) || '—'} para acertar · ${d.formula.replace(/@/g, '')} ${d.type}`, notes: a.notes,
        run: () => { if (spend('ação', a.name) && hit) x.rollF(hit, `${a.name}: acerto`, true); },
        extra: d.formula ? [{ label: 'Dano', run: () => x.rollF(d.formula, `${a.name}: dano`) }, { label: '×2', title: 'Crítico', run: () => x.rollF(d.formula.replace(/(\d*)d(\d+)/gi, (_m, n: string, f: string) => `${Number(n || 1) * 2}d${f}`), `${a.name}: crítico`) }] : [],
      });
    });
    readSpells(x.text).filter((s) => s.prepared).forEach((s, i) => {
      const cost = actionKind(s.time);
      const slot = slotFor(c, s.level);
      out.push({
        id: `m${i}`, kind: 'magia', cost, name: s.name, sub: `${s.level ? `${s.level}º círculo` : 'Truque'}${s.range ? ` · ${s.range}` : ''}${s.concentration ? ' · concentração' : ''}`, notes: s.notes,
        dim: s.level > 0 && !slot,
        run: () => {
          if (s.level > 0 && !slot) { flash(`Sem espaço para ${s.name}`); return; }
          if (!spend(cost, s.name)) return;
          if (slot) x.update((t) => useSlot(t, slot));
        },
        extra: c.casting && /ataque|attack/i.test(s.notes) ? [{ label: 'Ataque', run: () => x.rollD20(c.casting!.attack, `${s.name}: ataque mágico`) }] : [],
      });
    });
    abilities.forEach((a, i) => {
      const max = abilityMax(a, vars);
      const cost = actionKind(a.time);
      out.push({
        id: `h${i}`, kind: 'habilidade', cost, name: a.name, sub: [max !== null ? `${max - a.spent}/${max} usos` : 'à vontade', a.recharge && `recarga: ${a.recharge}`].filter(Boolean).join(' · '), notes: a.notes,
        dim: max !== null && a.spent >= max,
        run: () => {
          if (max !== null && a.spent >= max) { flash(`${a.name}: sem usos`); return; }
          if (!spend(cost, a.name)) return;
          if (max !== null) setAbility(i, a.spent + 1);
        },
        pips: max !== null ? { max, spent: a.spent, set: (n) => setAbility(i, n) } : undefined,
      });
    });
    return out;
  });
  const shown = $derived(filter === 'todas' ? cards : cards.filter((k) => k.cost === filter));

  // nova habilidade
  let adding = $state(false);
  let draft = $state<Ability>({ name: '', time: '1 ação', uses: '', spent: 0, recharge: 'longo', notes: '' });
  function addAbility() {
    if (!draft.name.trim()) return;
    x.update((t) => writeAbilities(t, [...readAbilities(t), { ...draft, name: draft.name.trim() }]));
    adding = false;
    draft = { name: '', time: '1 ação', uses: '', spent: 0, recharge: 'longo', notes: '' };
  }
  const COMMON: Array<[string, string]> = [['Disparada', 'Deslocamento extra igual ao seu'], ['Desengajar', 'Sem ataques de oportunidade'], ['Esquivar', 'Ataques contra você com desvantagem'],
    ['Ajudar', 'Vantagem para um aliado'], ['Esconder', 'Teste de Furtividade'], ['Preparar', 'Prepara uma reação'], ['Influenciar', 'Teste social'], ['Usar objeto', '']];
  function common(n: string) {
    if (!spend('ação', n)) return;
    if (n === 'Disparada') turnos.set(x.path, { dash: true });
    if (n === 'Esconder') x.rollD20(c.sheet.attrs.find((a) => a.key === 'des')?.mod ?? 0, 'Esconder (Furtividade)');
  }
</script>

<div class="turn">
  <div class="eco">
    <div class="round"><span class="lbl">Rodada</span><b>{st.round}</b></div>
    {#each [['action', 'Ação', 'ação'], ['bonus', 'Ação bônus', 'bônus'], ['reaction', 'Reação', 'reação']] as [k, label, kind] (k)}
      <button class="res {kind === 'ação' ? 'k-acao' : kind === 'bônus' ? 'k-bonus' : 'k-reacao'}" class:spent={st[k as 'action']}
        onclick={() => turnos.set(x.path, { [k]: !st[k as 'action'] })} title="Clique para marcar ou desmarcar">
        <i></i><span>{label}</span><small>{st[k as 'action'] ? 'usada' : 'disponível'}</small>
      </button>
    {/each}
    <div class="move">
      <span class="lbl">Movimento</span>
      <div class="mbar"><i style:width="{moveMax ? Math.min(100, (st.moved / moveMax) * 100) : 100}%"></i></div>
      <span class="mono small">{String(Math.max(0, moveMax - st.moved)).replace('.', ',')} m livres{st.dash ? ' · disparada' : ''}</span>
      <span class="mbtns">
        {#each [1.5, 3, 4.5, 9] as m (m)}<button class="chip" onclick={() => turnos.set(x.path, { moved: Math.min(moveMax, st.moved + m) })}>−{String(m).replace('.', ',')}</button>{/each}
        <button class="chip" onclick={() => turnos.set(x.path, { moved: 0 })} title="Zerar">↺</button>
      </span>
    </div>
    <div class="turnacts">
      <button class="primary sm" onclick={() => { turnos.next(x.path); flash('Novo turno: tudo disponível'); }}>Próximo turno</button>
      <button class="ghost sm" onclick={() => turnos.reset(x.path)} title="Volta para a rodada 1">Fim do combate</button>
    </div>
  </div>

  {#if c.slots.length || c.pact}
    <div class="slotsline">
      <span class="lbl">Espaços</span>
      {#each c.slots as s (s.level)}<span class="sb" class:out={s.spent >= s.total}>{s.level}º <b>{s.total - s.spent}</b>/{s.total}</span>{/each}
      {#if c.pact}<span class="sb pact" class:out={c.pact.spent >= c.pact.total}>Pacto {c.pact.level}º <b>{c.pact.total - c.pact.spent}</b>/{c.pact.total}</span>{/if}
    </div>
  {/if}

  {#if msg}<p class="toast" role="status">{msg}</p>{/if}

  <div class="filters">
    {#each [['todas', 'Tudo'], ['ação', 'Ação'], ['bônus', 'Bônus'], ['reação', 'Reação'], ['livre', 'Livre']] as [id, label] (id)}
      <button class="chip" class:on={filter === id} onclick={() => (filter = id as typeof filter)}>{label} <small>{id === 'todas' ? cards.length : cards.filter((k) => k.cost === id).length}</small></button>
    {/each}
  </div>

  <div class="cards">
    {#each shown as k (k.id)}
      <article class="card {k.cost === 'ação' ? 'k-acao' : k.cost === 'bônus' ? 'k-bonus' : k.cost === 'reação' ? 'k-reacao' : 'k-livre'}" class:blocked={used(k.cost) || k.dim}>
        <header><span class="kind">{k.kind}</span><span class="cost">{LABEL[k.cost]}</span></header>
        <h4>{k.name}</h4>
        <p class="sub">{k.sub}</p>
        {#if k.notes}<p class="notes">{k.notes}</p>{/if}
        {#if k.pips}
          <span class="pips">{#each Array.from({ length: Math.min(k.pips.max, 12) }, (_, i) => i + 1) as n (n)}<button class="pip" class:on={n <= k.pips.spent} onclick={() => k.pips!.set(k.pips!.spent === n ? n - 1 : n)} aria-label={`Uso ${n}`}></button>{/each}</span>
        {/if}
        <footer>
          <button class="primary sm" onclick={k.run}>{k.kind === 'ataque' ? 'Atacar' : k.kind === 'magia' ? 'Conjurar' : 'Usar'}</button>
          {#each k.extra ?? [] as e (e.label)}<button class="ghost sm" onclick={e.run} title={e.title}>{e.label}</button>{/each}
        </footer>
      </article>
    {/each}
    {#if !adding}
      <button class="card addc" onclick={() => (adding = true)}>+ Habilidade<small>Fúria, Retomar o Fôlego, Inspiração de Bardo…</small></button>
    {:else}
      <form class="card addf" onsubmit={(e) => { e.preventDefault(); addAbility(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="field" bind:value={draft.name} placeholder="Nome" autofocus aria-label="Nome" />
        <select class="field" bind:value={draft.time} aria-label="Custo">
          <option value="1 ação">Ação</option><option value="1 ação bônus">Ação bônus</option><option value="1 reação">Reação</option><option value="livre">Livre</option>
        </select>
        <input class="field mono" bind:value={draft.uses} placeholder="Usos (vazio = à vontade; @prof, @car…)" aria-label="Usos" />
        <select class="field" bind:value={draft.recharge} aria-label="Recarga"><option value="curto">Descanso curto</option><option value="longo">Descanso longo</option></select>
        <input class="field" bind:value={draft.notes} placeholder="Efeito" aria-label="Efeito" />
        <footer><button type="button" class="ghost sm" onclick={() => (adding = false)}>Cancelar</button><button class="primary sm">Adicionar</button></footer>
      </form>
    {/if}
  </div>

  <div class="commonw">
    <span class="lbl">Ações comuns</span>
    <div class="chips">{#each COMMON as [n, t] (n)}<button class="chip" disabled={st.action} onclick={() => common(n)} title={t}>{n}</button>{/each}</div>
  </div>
</div>

<style>
  .turn { display: grid; gap: 12px; --acao: var(--ember); --bonus: #5fcf9a; --reacao: #7fb6ff; --livre: var(--muted); }
  .k-acao { --k: var(--acao); } .k-bonus { --k: var(--bonus); } .k-reacao { --k: var(--reacao); } .k-livre { --k: var(--livre); }
  .lbl { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .small { font-size: 11.5px; }
  .eco { display: grid; grid-template-columns: auto repeat(3, minmax(0, 1fr)) minmax(min(200px, 100%), 1.4fr); gap: 8px; align-items: stretch; }
  .round { display: grid; place-items: center; padding: 6px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .round b { font: 700 24px/1 var(--f-display); }
  .res { display: grid; justify-items: center; align-content: center; gap: 4px; border: 1px solid color-mix(in srgb, var(--k) 55%, var(--line)); border-radius: 12px;
    background: color-mix(in srgb, var(--k) 10%, var(--surface)); color: var(--ink); padding: 8px 4px; transition: all var(--dur); }
  .res i { width: 14px; height: 14px; border-radius: 50%; background: var(--k); box-shadow: 0 0 10px var(--k); transition: all var(--dur); }
  .res span { font: 600 11px var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .res small { font-size: 10.5px; color: var(--muted); }
  .res.spent { background: var(--surface); border-color: var(--line); opacity: .6; }
  .res.spent i { background: none; border: 1.5px solid var(--k); box-shadow: none; }
  .move { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .mbar { height: 5px; border-radius: 3px; background: color-mix(in srgb, var(--ok) 70%, var(--void)); overflow: hidden; }
  .mbar i { display: block; height: 100%; background: var(--void); margin-left: auto; transition: width var(--dur); float: right; }
  .mbtns { display: flex; gap: 4px; flex-wrap: wrap; }
  .mbtns .chip { padding: 1px 7px; font-size: 11px; }
  .turnacts { grid-column: 1 / -1; display: flex; gap: 6px; justify-content: flex-end; }
  .slotsline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .sb { font: 12px var(--f-mono); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--silver); }
  .sb b { color: var(--ink); }
  .sb.out { opacity: .4; }
  .sb.pact { border-color: color-mix(in srgb, var(--ember) 45%, var(--line)); }
  .toast { margin: 0; padding: 6px 10px; border-radius: 9px; font-size: 12.5px; background: color-mix(in srgb, var(--ember) 12%, transparent); border: 1px solid color-mix(in srgb, var(--ember) 35%, transparent); }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .filters small { color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr)); gap: 10px; }
  .card { position: relative; display: flex; flex-direction: column; gap: 6px; min-height: 190px; padding: 12px 12px 10px; border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--k, var(--line)) 40%, var(--line));
    background: linear-gradient(170deg, color-mix(in srgb, var(--k, var(--line)) 14%, var(--surface)) 0%, var(--surface) 45%);
    box-shadow: 0 10px 24px -18px var(--shadow); transition: transform var(--dur) var(--spring), opacity var(--dur), border-color var(--dur); }
  .card:not(.blocked):not(.addc):hover { transform: translateY(-3px); border-color: var(--k); }
  .card.blocked { opacity: .45; filter: saturate(.4); }
  .card header { display: flex; justify-content: space-between; gap: 6px; }
  .kind { font: 600 9px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .cost { font: 600 9.5px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--k); padding: 1px 7px; border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--k) 50%, transparent); }
  .card h4 { margin: 2px 0 0; font: 600 16px/1.2 var(--f-display); color: var(--ink); }
  .sub { margin: 0; font-size: 12px; color: var(--silver); }
  .notes { margin: 0; font-size: 12px; color: var(--muted); flex: 1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; }
  .card footer { display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 6px; border-top: 1px dashed var(--line); }
  .pips { display: flex; gap: 4px; flex-wrap: wrap; }
  .pip { width: 11px; height: 11px; transform: rotate(45deg); border: 1.5px solid var(--k); border-radius: 2px; background: none; padding: 0; }
  .pip.on { background: var(--k); opacity: .35; }
  .addc { align-items: center; justify-content: center; text-align: center; border-style: dashed; background: none; color: var(--muted); font-weight: 600; gap: 4px; }
  .addc small { font-weight: 400; font-size: 11.5px; }
  .addc:hover { border-color: var(--ember); color: var(--ink); }
  .addf { gap: 6px; }
  .addf .field { padding: 5px 8px; font-size: 12.5px; }
  .addf footer { justify-content: flex-end; }
  .commonw { display: grid; gap: 6px; }
  .chip:disabled { opacity: .4; }
  @media (max-width: 720px) {
    .eco { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .round { grid-column: 1 / -1; grid-auto-flow: column; gap: 10px; justify-content: start; }
    .move { grid-column: 1 / -1; }
  }
</style>
