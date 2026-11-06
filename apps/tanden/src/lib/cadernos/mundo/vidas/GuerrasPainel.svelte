<script lang="ts">
  import type { Guerra, Vidas } from '@tanden/core';
  import { factionColor } from '../../tipos';
  import LinkText from '../LinkText.svelte';
  import { vidas } from './vidas.svelte';

  // Guerras ao mesmo tempo que a vida das pessoas: facções (poder, riqueza,
  // estabilidade, território, líder), as guerras em andamento com placar e
  // batalhas, posturas entre facções, e a sua mão: declarar guerra, fazer a
  // paz, mexer na diplomacia, criar uma facção nova.
  let { sim, onselect }: { sim: Vidas; onselect: (id: string) => void } = $props();

  const g = $derived(sim.guerras);
  const estado = $derived.by(() => {
    void vidas.ver;
    const fs = [...g.faccoes.values()];
    const nomes = fs.map((f) => f.nome);
    return {
      faccoes: fs.map((f) => ({
        ...f, territorio: [...f.territorio], cor: factionColor(f.nome, nomes), membros: g.membros(f.id).length, noFront: g.membros(f.id).filter((p) => g.front(p)).length,
        guerras: g.emGuerra(f.id).length, lider: f.lider ? sim.pessoa(f.lider) ?? null : null,
      })).sort((a, b) => Number(b.viva) - Number(a.viva) || b.poder - a.poder),
      ativas: g.emAndamento().map((x) => ({ ...x, soldados: soldados(x) })),
      passadas: g.guerras.filter((x) => x.fim !== null).slice(-12).reverse().map((x) => ({ ...x })),
      cor: (id: string) => factionColor(g.nome(id), nomes),
    };
  });
  function soldados(x: Guerra) {
    const pre = `§front:${x.id}:`;
    const l = sim.vivos().filter((p) => p.viagem?.para.startsWith(pre));
    return { a: l.filter((p) => p.viagem!.para.endsWith(':a')), d: l.filter((p) => p.viagem!.para.endsWith(':d')) };
  }
  const vivas = $derived(estado.faccoes.filter((f) => f.viva));

  // ------------------------------------------------ sua mão
  let atk = $state('');
  let def = $state('');
  let motivo = $state('');
  $effect(() => {
    if (vivas.length >= 2 && (!atk || !vivas.some((f) => f.id === atk))) atk = vivas[0]!.id;
    if (vivas.length >= 2 && (!def || def === atk || !vivas.some((f) => f.id === def))) def = vivas.find((f) => f.id !== atk)!.id;
  });
  const postura = $derived.by(() => { void vidas.ver; return atk && def ? Math.round(g.postura(atk, def)) : 0; });
  function declarar() {
    if (!atk || !def || atk === def) return;
    vidas.agir({ c: 'guerra', a: atk, b: def, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) });
    motivo = '';
  }
  let novaNome = $state('');
  let novaLugar = $state('');
  let novaLider = $state('');
  const lugares = $derived([...sim.lugares].filter(([k]) => !k.startsWith('§')));
  function criar() {
    if (!novaNome.trim()) return;
    const id = `faccao:${novaNome.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-')}`;
    vidas.agir({ c: 'faccao', id, nome: novaNome.trim(), lugares: novaLugar ? [novaLugar] : [], lider: novaLider || null });
    novaNome = '';
    novaLugar = '';
    novaLider = '';
  }
  const bar = (v: number, max = 100) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const placar = (v: number) => `${50 + v / 2}%`;
  const corDe = () => null;
  const link = (t: string) => {
    const p = sim.porNomeDe(t);
    if (p) onselect(p.id);
  };
</script>

<section class="gw">
  {#if !estado.faccoes.length}
    <p class="dim">Este mundo ainda não tem facções. Crie fichas <code>tipo: facção</code> (e diga quem governa cada lugar com <code>governante: [[Facção]]</code>), ou crie uma aqui embaixo.</p>
  {/if}

  {#if estado.ativas.length}
    <h4>Guerras em andamento <small>{estado.ativas.length} ao mesmo tempo</small></h4>
    <div class="guerras">
      {#each estado.ativas as w (w.id)}
        <article class="guerra">
          <header>
            <b>⚔ {w.nome}</b>
            <small class="dim">desde {sim.data(w.desde)} · {w.batalhas} {w.batalhas === 1 ? 'batalha' : 'batalhas'} · cansaço {w.cansaco}</small>
            <button class="ghost sm" onclick={() => vidas.agir({ c: 'paz', guerra: w.id })} title="Paz agora, com os termos do placar de hoje">☮ Fazer a paz</button>
          </header>
          <p class="motivo">por causa de {w.motivo}{w.alvo ? ` · cerco a ${sim.lugarNome(w.alvo)}` : ''}</p>
          <div class="lados">
            <span class="lado" style:--c={estado.cor(w.atacantes[0] ?? '')}>{w.atacantes.map((f) => g.nome(f)).join(' + ')}</span>
            <div class="placar" title="Placar: quem está vencendo">
              <i style:left={placar(w.placar)}></i>
              <span class="meio"></span>
            </div>
            <span class="lado dir" style:--c={estado.cor(w.defensores[0] ?? '')}>{w.defensores.map((f) => g.nome(f)).join(' + ')}</span>
          </div>
          <div class="front">
            {#each [['a', w.soldados.a], ['d', w.soldados.d]] as [lado, ps] (lado)}
              <div>
                <small class="dim">{lado === 'a' ? 'atacantes' : 'defensores'} no front: {(ps as typeof w.soldados.a).length}</small>
                <div class="chips">
                  {#each (ps as typeof w.soldados.a).slice(0, 14) as p (p.id)}<button class="chip" onclick={() => onselect(p.id)}>{p.nome}{p.tracos.includes('heroi') ? ' 🏅' : ''}</button>{/each}
                </div>
              </div>
            {/each}
          </div>
          {#if w.diario.length}
            <ol class="diario">
              {#each w.diario.slice(-4).reverse() as b, i (i)}
                <li><small>{sim.data(b.t)}</small> {b.lugar ? sim.lugarNome(b.lugar) : 'campo aberto'}: vitória {b.venceu === 'a' ? 'do ataque' : 'da defesa'}{b.mortos.length ? ` · ${b.mortos.length} ${b.mortos.length === 1 ? 'morto' : 'mortos'}` : ''}</li>
              {/each}
            </ol>
          {/if}
        </article>
      {/each}
    </div>
  {/if}

  {#if estado.faccoes.length}
    <h4>Facções</h4>
    <div class="faccoes">
      {#each estado.faccoes as f (f.id)}
        <article class="fac" class:morta={!f.viva} style:--c={f.cor}>
          <header><b>⚑ {f.nome}</b>{#if !f.viva}<small> ☠ caiu</small>{:else if f.guerras}<small class="war"> ⚔ {f.guerras} {f.guerras === 1 ? 'guerra' : 'guerras'}</small>{/if}</header>
          <div class="mb"><span>poder</span><i><b style:width={bar(f.poder, 150)}></b></i><small>{Math.round(f.poder)}</small></div>
          <div class="mb"><span>riqueza</span><i><b style:width={bar(f.riqueza)}></b></i><small>{Math.round(f.riqueza)}</small></div>
          <div class="mb"><span>estabilidade</span><i><b style:width={bar(f.estabilidade)}></b></i><small>{Math.round(f.estabilidade)}</small></div>
          <p class="small">
            {#if f.lider}👑 <button class="lk" onclick={() => onselect(f.lider!.id)}>{f.lider.nome}</button> · {/if}
            {f.membros} {f.membros === 1 ? 'leal' : 'leais'} na simulação{f.noFront ? ` (${f.noFront} no front)` : ''}
          </p>
          {#if f.territorio.length}<p class="small dim">⌂ {f.territorio.map((l) => sim.lugarNome(l)).join(', ')}</p>{/if}
        </article>
      {/each}
    </div>
  {/if}

  <h4>Sua mão na guerra</h4>
  {#if vivas.length >= 2}
    <div class="row">
      <select bind:value={atk} aria-label="Quem ataca">{#each vivas as f (f.id)}<option value={f.id}>{f.nome}</option>{/each}</select>
      <span class="dim">contra</span>
      <select bind:value={def} aria-label="Quem defende">{#each vivas.filter((f) => f.id !== atk) as f (f.id)}<option value={f.id}>{f.nome}</option>{/each}</select>
      <input bind:value={motivo} placeholder="motivo (vazio: o destino escolhe)" />
      <button class="primary sm" onclick={declarar} disabled={!!g.guerraEntre(atk, def)}>⚔ Declarar guerra</button>
    </div>
    <label class="post">Postura entre os dois <span class="val">{postura > 0 ? '+' : ''}{postura}</span> <small class="dim">({postura <= -60 ? 'ódio' : postura <= -25 ? 'hostis' : postura < 25 ? 'neutros' : postura < 60 ? 'amistosos' : 'aliados'})</small>
      <input type="range" min="-100" max="100" step="5" value={postura} onchange={(e) => vidas.agir({ c: 'postura', a: atk, b: def, v: Number((e.currentTarget as HTMLInputElement).value) })} />
    </label>
  {/if}
  <div class="row">
    <input bind:value={novaNome} placeholder="Nova facção (Irmandade do Corvo...)" />
    <select bind:value={novaLugar} aria-label="Sede">
      <option value="">sem território</option>
      {#each lugares as [k, n] (k)}<option value={k}>{n}{g.dono(k) ? ` (de ${g.dono(k)!.nome})` : ''}</option>{/each}
    </select>
    <select bind:value={novaLider} aria-label="Líder">
      <option value="">líder: o destino escolhe</option>
      {#each sim.vivos().filter((p) => sim.adulto(p) && !sim.criatura(p)) as p (p.id)}<option value={p.id}>{p.nome}</option>{/each}
    </select>
    <button class="ghost sm" onclick={criar} disabled={!novaNome.trim()}>⚑ Criar facção</button>
  </div>
  <p class="dim small">Ajuste a vontade de guerra em <b>Mundo e ajustes</b>. Casamentos entre casas aproximam facções; o assassinato de um líder pode começar uma guerra. Quem morre no front deixa família que lembra de quem matou.</p>

  {#if estado.passadas.length}
    <details>
      <summary>Guerras que acabaram ({estado.passadas.length})</summary>
      <ul class="passadas">
        {#each estado.passadas as w (w.id)}
          <li><b>{w.nome}</b> <small class="dim">{sim.data(w.desde)} → {sim.data(w.fim!)} · {w.resultado} · {w.batalhas} batalhas{w.conquistas.length ? ` · conquistas: ${w.conquistas.map((l) => sim.lugarNome(l)).join(', ')}` : ''}</small></li>
        {/each}
      </ul>
    </details>
  {/if}
  {#if sim.eventos.some((e) => e.cat === 'guerra')}
    <details>
      <summary>Últimos acontecimentos da guerra</summary>
      <ul class="passadas">
        {#each sim.eventos.filter((e) => e.cat === 'guerra').slice(-12).reverse() as e, i (i)}
          <li><small class="dim">{sim.data(e.t)}</small> <LinkText text={e.texto} color={corDe} onlink={link} /></li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .gw { display: grid; gap: 10px; }
  h4 { margin: 4px 0 0; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h4 small { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .guerras, .faccoes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 8px; }
  .guerra, .fac { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 8px 10px; display: grid; gap: 6px; min-width: 0; }
  .guerra { border-left: 3px solid var(--crit, #ff6b6b); }
  .fac { border-left: 3px solid var(--c); }
  .fac.morta { opacity: .5; }
  .guerra header, .fac header { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
  .guerra header button { margin-left: auto; }
  .motivo { margin: 0; font-size: 12.5px; color: var(--muted); font-style: italic; }
  .lados { display: grid; grid-template-columns: minmax(0, 1fr) 90px minmax(0, 1fr); gap: 6px; align-items: center; font-size: 12px; }
  .lado { color: var(--c); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .lado.dir { text-align: right; }
  .placar { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, color-mix(in srgb, var(--crit, #ff6b6b) 35%, transparent), var(--surface-2), color-mix(in srgb, #7fb6ff 35%, transparent)); }
  .placar i { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--ink); }
  .placar .meio { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--muted); }
  .front { display: grid; gap: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chip { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 999px; padding: 1px 8px; font-size: 11.5px; }
  .diario, .passadas { margin: 0; padding-left: 16px; font-size: 12px; display: grid; gap: 2px; }
  .diario small { color: var(--muted); font-family: var(--f-mono); }
  .mb { display: grid; grid-template-columns: 78px 1fr 30px; gap: 6px; align-items: center; font-size: 11.5px; color: var(--muted); }
  .mb i { height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .mb i b { display: block; height: 100%; background: var(--c); }
  .mb small { text-align: right; font-family: var(--f-mono); }
  .war { color: var(--crit, #ff6b6b); }
  .small { font-size: 12px; margin: 0; }
  .dim { color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .row input { flex: 1; min-width: min(160px, 100%); }
  .post { display: grid; gap: 3px; font-size: 12.5px; color: var(--muted); max-width: 420px; }
  .val { color: var(--ember-soft); font: 11.5px var(--f-mono); }
  input[type='range'] { accent-color: var(--ember); }
  select, input:not([type='range']) { background: var(--void); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); padding: 4px 8px; font-size: 12.5px; min-width: 0; max-width: 100%; }
  .lk { border: 0; background: none; color: var(--ink); padding: 0 2px; box-shadow: inset 0 -1px 0 var(--ember); font: inherit; }
  .primary { border: 0; border-radius: 9px; padding: 6px 12px; background: var(--ember); color: var(--on-ember); font-weight: 600; }
  .primary:disabled { opacity: .45; }
  .ghost { border: 1px solid var(--line); border-radius: 9px; padding: 5px 10px; background: var(--surface-2); color: var(--ink); }
  .ghost:hover { border-color: var(--ember); }
  .sm { padding: 3px 10px; font-size: 12px; }
  details summary { cursor: pointer; font-size: 12.5px; color: var(--muted); }
  code { font: 11.5px var(--f-mono); color: var(--ember-soft); }
</style>
