<script lang="ts">
  import { ARMORS, ARMOR_TRAINING, WEAPON_TRAINING, applyClassDefaults, toggleInList } from '@tanden/core';
  import CoinPurse from '../CoinPurse.svelte';
  import Inventory from '../Inventory.svelte';
  import EditField from './EditField.svelte';
  import type { FichaCtx } from './ctx';

  // Equipamento: treinos e proficiências, armadura vestida, sintonização, moedas e inventário.
  let { x }: { x: FichaCtx } = $props();
  const c = $derived(x.c);
  const has = (list: string[], v: string) => list.some((y) => y.toLowerCase() === v.toLowerCase());
  const ARMOR_LABEL: Record<string, string> = { leve: 'Leve', média: 'Média', pesada: 'Pesada', escudos: 'Escudos' };
  const WEAPON_LABEL: Record<string, string> = { simples: 'Simples', marciais: 'Marciais', 'de fogo': 'De fogo' };

  function setAttune(i: number, v: string) {
    const next = [...c.attunement];
    while (next.length < 3) next.push('');
    next[i] = v;
    const clean = next.map((s) => s.trim()).filter(Boolean);
    x.write({ [c.keys.attunement]: clean.length ? clean : null });
  }
  const str = $derived(c.sheet.attrs.find((a) => a.key === 'for')?.score ?? null);
  const heavyWarn = $derived(c.armorInfo?.str && str !== null && str < c.armorInfo.str ? `Força ${c.armorInfo.str} exigida: −3 m de deslocamento` : '');
</script>

<div class="gear">
  <section class="card train">
    <header><h4>Treinos e proficiências</h4>
      {#if c.classes.some((k) => k.info)}<button class="ghost sm" onclick={() => x.update(applyClassDefaults)} title="Preenche salvaguardas, armaduras e armas da classe (só o que estiver vazio)">Preencher pela classe</button>{/if}
    </header>
    <div class="line">
      <span class="lbl">Armaduras</span>
      <span class="opts">
        {#each ARMOR_TRAINING as a (a)}
          <button class="opt" class:on={has(c.armorTraining, a)} onclick={() => x.update((t) => toggleInList(t, 'armorTraining', a))}><i></i>{ARMOR_LABEL[a]}</button>
        {/each}
      </span>
    </div>
    <div class="line">
      <span class="lbl">Armas</span>
      <span class="opts">
        {#each WEAPON_TRAINING as a (a)}
          <button class="opt" class:on={has(c.weaponTraining, a)} onclick={() => x.update((t) => toggleInList(t, 'weaponTraining', a))}><i></i>{WEAPON_LABEL[a]}</button>
        {/each}
      </span>
    </div>
    <div class="fields">
      <EditField label="Outras armas" value={c.weapons} placeholder="Ex.: espadas curtas, bestas de mão" onsave={(v) => x.write({ [c.keys.weapons]: v || null })} />
      <EditField label="Ferramentas" value={c.tools} placeholder="Ex.: ferramentas de ladrão, alaúde" onsave={(v) => x.write({ [c.keys.tools]: v || null })} />
    </div>
  </section>

  <section class="card">
    <header><h4>Armadura e escudo</h4></header>
    <div class="fields two">
      <EditField label="Armadura vestida" value={c.armor} placeholder="Nenhuma" options={ARMORS.map((a) => a.name)} onsave={(v) => x.write({ [c.keys.armor]: v || null })} />
      <div class="shield">
        <span class="lbl">Escudo</span>
        <button class="opt" class:on={c.shield} onclick={() => x.write({ [c.keys.shield]: c.shield ? null : 'sim' })}><i></i>{c.shield ? 'Empunhando (+2)' : 'Sem escudo'}</button>
      </div>
    </div>
    <p class="dim small note">
      {#if c.armorInfo}{c.armorInfo.name}: {c.armorInfo.kind}, CA base {c.armorInfo.base}{c.armorInfo.kind === 'leve' ? ' + Des' : c.armorInfo.kind === 'média' ? ' + Des (máx. 2)' : ''}{c.armorInfo.stealth ? ' · desvantagem em Furtividade' : ''}{:else if c.armor}Armadura desconhecida: escreva a CA no cartão de CA.{:else}Sem armadura: 10 + Des{c.classes.some((k) => k.info?.unarmored) ? ' + defesa sem armadura da classe' : ''}.{/if}
      {#if heavyWarn} <b class="warn">{heavyWarn}</b>{/if}
      {#if c.armorInfo && !has(c.armorTraining, c.armorInfo.kind)} <b class="warn">Sem treino em armadura {c.armorInfo.kind}: desvantagem em testes de For e Des, sem magias.</b>{/if}
    </p>
  </section>

  <section class="card">
    <header><h4>Itens sintonizados</h4><small class="dim">{c.attunement.length}/3</small></header>
    <div class="att">
      {#each [0, 1, 2] as i (i)}
        <div class="arow"><span class="dia" class:on={!!c.attunement[i]}></span>
          <EditField label={`Sintonização ${i + 1}`} value={c.attunement[i] ?? ''} placeholder="Vazio" onsave={(v) => setAttune(i, v)} />
        </div>
      {/each}
    </div>
  </section>

  <section class="card">
    <header><h4>Moedas</h4></header>
    <CoinPurse path={x.path} text={x.text} />
  </section>

  <section class="card wide">
    <header><h4>Equipamento</h4></header>
    <Inventory path={x.path} text={x.text} compact={x.compact} onOpenNote={x.onOpenNote} strength={c.sheet.system === '5e' ? str : null} />
  </section>
</div>

<style>
  .gear { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 12px; align-items: start; }
  .card { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); padding: 10px 12px 12px; display: grid; gap: 10px; min-width: 0; }
  .wide { grid-column: 1 / -1; }
  header .ghost { white-space: nowrap; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  h4 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .lbl { font: 600 9.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .line .lbl { min-width: 74px; }
  .opts { display: flex; gap: 4px 12px; flex-wrap: wrap; }
  .opt { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 3px 0; color: var(--silver); font-size: 13px; }
  .opt i, .dia { width: 10px; height: 10px; transform: rotate(45deg); border: 1.5px solid var(--muted); border-radius: 2px; flex: none; transition: background var(--dur); }
  .opt.on { color: var(--ink); }
  .opt.on i, .dia.on { background: var(--ember); border-color: var(--ember); }
  .opt:hover i { border-color: var(--ember); }
  .fields { display: grid; gap: 10px; }
  .fields.two { grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); align-items: end; }
  .shield { display: grid; gap: 2px; }
  .note { margin: 0; line-height: 1.5; }
  .warn { color: var(--crit); font-weight: 600; }
  .att { display: grid; gap: 8px; }
  .arow { display: grid; grid-template-columns: 14px minmax(0, 1fr); align-items: end; gap: 8px; }
  .arow .dia { margin-bottom: 9px; }
</style>
