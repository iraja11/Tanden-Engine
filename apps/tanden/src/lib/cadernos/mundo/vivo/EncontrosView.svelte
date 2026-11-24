<script lang="ts">
  import { FAIXAS_AMEACA, ameacaDe, faixaDe, perigoPorLugar, rolarEncontro, seededRng, semHabitat, tabelaEncontros, type Rolagem, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { jornada } from '../jornada/jornada.svelte';
  import { typeColor } from '../../tipos';

  // O bestiário em jogo: a escada de ameaça, a tabela d100 de cada região
  // (herdando o habitat dos lugares maiores) e a rolagem de um encontro com
  // quantidade, humor, sinal e complicação. Bom para mesa e para destravar cena.
  let { world, onopen }: { world: World; onopen: (path: string) => void } = $props();

  const perigos = $derived(perigoPorLugar(world));
  const lugares = $derived(world.entities.filter((e) => e.type === 'lugar').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  let lugarSel = $state<string>('');
  $effect(() => { if (!lugarSel && perigos[0]) lugarSel = perigos[0].lugar.path; });
  const lugar = $derived(lugares.find((l) => l.path === lugarSel) ?? null);
  const tabela = $derived(tabelaEncontros(world, lugar));
  const vivos = $derived(tabela.linhas.filter((l) => l.criatura));
  const orfas = $derived(semHabitat(world));
  const escada = $derived(FAIXAS_AMEACA.map((f, i) => ({
    f, seres: world.entities.filter((e) => e.type === 'criatura').filter((e) => { const nd = ameacaDe(e); return nd !== null && nd >= f.min && nd < (FAIXAS_AMEACA[i + 1]?.min ?? Infinity); }),
  })));
  const semNd = $derived(world.entities.filter((e) => e.type === 'criatura' && ameacaDe(e) === null));

  // ------------------------------------------------ rolar
  let rolando = $state(false);
  let face = $state(0);
  let resultado = $state<Rolagem | null>(null);
  function rolar() {
    if (rolando) return;
    rolando = true;
    resultado = null;
    sound.play('tick');
    const rng = seededRng(Math.floor(Math.random() * 1e9));
    const r = rolarEncontro(tabela, rng);
    let k = 0;
    const t = setInterval(() => {
      face = 1 + Math.floor(Math.random() * 100);
      if (++k > 12) {
        clearInterval(t);
        face = r.d100;
        resultado = r;
        rolando = false;
        sound.play(r.encontro.criatura ? 'alert' : 'tick');
        jornada.contar(world.name, 'encontros');
      }
    }, 55);
  }
  const corNd = (nd: number | null) => (nd === null ? 'var(--muted)' : faixaDe(nd).cor);
</script>

<section class="enc" in:rise={{ y: 6 }}>
  <div class="mesa t-card">
    <header>
      <h3 class="t-eyebrow">Tabela de encontros</h3>
      <select class="t-select" bind:value={lugarSel} aria-label="Região">
        <option value="">O mundo todo</option>
        {#each lugares as l (l.path)}<option value={l.path}>{l.name}</option>{/each}
      </select>
    </header>
    {#if vivos.length}
      <div class="rolar">
        <button class="dado" class:rolando onclick={rolar} aria-label="Rolar d100">
          <span class="face">{face || 'd100'}</span>
        </button>
        <div class="saida" aria-live="polite">
          {#if resultado}
            <div class="res" style:--c={corNd(resultado.encontro.nd)} in:rise={{ y: 6 }}>
              {#if resultado.encontro.criatura}
                <button class="quem" onclick={() => onopen(resultado!.encontro.criatura!.path)}>
                  {resultado.quantidade > 1 ? `${resultado.quantidade}× ` : ''}{resultado.encontro.criatura.name}
                  {#if resultado.encontro.nd !== null}<small>ND {resultado.encontro.nd} · {faixaDe(resultado.encontro.nd).label}</small>{/if}
                </button>
                <p><b>Humor:</b> {resultado.humor}.</p>
                <p><b>Antes:</b> {resultado.sinal}.</p>
                <p><b>Complicação:</b> {resultado.complicacao}</p>
              {:else}
                <span class="quem calmo">Nada à vista</span>
                <p>Mas há sinais: {resultado.sinal}.</p>
              {/if}
            </div>
          {:else}
            <p class="dim">Toque no dado para rolar um encontro {lugar ? `em ${lugar.name}` : 'no mundo'}. Perigo médio da região: <b style:color={corNd(tabela.perigo)}>ND {tabela.perigo}</b>.</p>
          {/if}
        </div>
      </div>
      <ol class="linhas">
        {#each tabela.linhas as l, i (i)}
          <li class:hit={resultado?.d100 !== undefined && resultado.d100 >= l.de && resultado.d100 <= l.ate} style:--c={corNd(l.nd)}>
            <span class="faixa">{l.de === l.ate ? l.de : `${l.de}–${l.ate}`}</span>
            <span class="barra"><i style:width="{((l.ate - l.de + 1) / 100) * 100}%"></i></span>
            {#if l.criatura}
              <button class="nome" onclick={() => onopen(l.criatura!.path)}>{l.criatura.name}</button>
              <span class="nd">{l.nd === null ? '—' : `ND ${l.nd}`}</span>
            {:else}<span class="nome nada">Nada, só sinais</span><span class="nd"></span>{/if}
          </li>
        {/each}
      </ol>
    {:else}
      <p class="dim small">Nenhuma criatura vive {lugar ? `em ${lugar.name} (nem nos lugares maiores que o contêm)` : 'no mundo'} ainda. Escreva <code>habitat: [[Lugar]]</code> nas criaturas, com <code>nd</code> (nível de desafio) e <code>frequência</code> (comum, rara, praga...).</p>
    {/if}
  </div>

  <div class="lado">
    {#if perigos.length}
      <div class="t-card bloco">
        <h3 class="t-eyebrow">Mapa do perigo</h3>
        {#each perigos.slice(0, 8) as p (p.lugar.path)}
          <button class="lugar" class:on={p.lugar.path === lugarSel} onclick={() => (lugarSel = p.lugar.path)} style:--c={corNd(p.maior?.nd ?? null)}>
            <span class="nm">{p.lugar.name}</span>
            <span class="pz">{p.criaturas} {p.criaturas === 1 ? 'ser' : 'seres'}{p.maior ? ` · ${p.maior.criatura.name}` : ''}</span>
            <span class="sk" title={p.maior ? `ND ${p.maior.nd}` : ''}>{p.maior ? faixaDe(p.maior.nd).label : '—'}</span>
          </button>
        {/each}
      </div>
    {/if}
    <div class="t-card bloco">
      <h3 class="t-eyebrow">Escada de ameaça</h3>
      {#each [...escada].reverse() as x (x.f.label)}
        <div class="degrau" style:--c={x.f.cor}>
          <span class="dl">{x.f.label}<small>ND {x.f.min}+</small></span>
          <span class="seres">{#each x.seres as s (s.path)}<button class="chip" style:--t={typeColor('criatura')} onclick={() => onopen(s.path)}>{s.name}</button>{:else}<span class="dim sm">—</span>{/each}</span>
        </div>
      {/each}
      {#if semNd.length}<p class="dim sm">Sem <code>nd</code>: {semNd.slice(0, 8).map((s) => s.name).join(', ')}{semNd.length > 8 ? '…' : ''}</p>{/if}
    </div>
    {#if orfas.length}
      <div class="t-card bloco">
        <h3 class="t-eyebrow">Sem habitat</h3>
        <p class="dim sm">Não aparecem em nenhuma tabela regional:</p>
        <div class="seres">{#each orfas as o (o.path)}<button class="chip" style:--t={typeColor('criatura')} onclick={() => onopen(o.path)}>+ habitat de {o.name}</button>{/each}</div>
      </div>
    {/if}
  </div>
</section>

<style>
  .enc { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(min(260px, 100%), 1fr); gap: var(--sp-3); align-items: start; }
  @container (max-width: 760px) { .enc { grid-template-columns: minmax(0, 1fr); } }
  .mesa { display: grid; gap: var(--sp-3); background: radial-gradient(ellipse at 0 0, color-mix(in srgb, #d98fb0 12%, var(--surface)), var(--surface) 60%); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .rolar { display: flex; gap: var(--sp-3); align-items: flex-start; flex-wrap: wrap; }
  .dado { flex: none; width: 88px; height: 88px; display: grid; place-items: center; border: 0; color: #fff; cursor: pointer;
    background: linear-gradient(145deg, #d98fb0, #7b3a5c); clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .35)); transition: transform .2s; }
  .dado:hover { transform: rotate(-8deg) scale(1.05); }
  .dado.rolando { animation: rola .25s linear infinite; }
  @keyframes rola { 0% { rotate: 0deg; } 50% { rotate: 14deg; scale: 1.06; } 100% { rotate: 0deg; } }
  .face { font: 700 24px var(--f-display); text-shadow: 0 2px 4px rgba(0, 0, 0, .4); }
  .saida { flex: 1 1 220px; min-width: 0; }
  .saida > p { margin: 0; font-size: 13px; line-height: 1.5; }
  .res { display: grid; gap: 4px; padding: var(--sp-2) var(--sp-3); border-left: 4px solid var(--c); border-radius: 0 var(--r-md) var(--r-md) 0; background: color-mix(in srgb, var(--c) 9%, var(--surface)); }
  .res p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .res b { color: var(--ink); font-weight: 600; }
  .quem { display: grid; border: 0; background: none; padding: 0; text-align: left; color: var(--ink); font: 600 19px var(--f-display); }
  .quem small { font: 11px var(--f-mono); color: var(--c); }
  .quem.calmo { color: var(--muted); }
  .linhas { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 360px; overflow: auto; }
  .linhas li { display: grid; grid-template-columns: 56px 60px minmax(0, 1fr) 52px; gap: 8px; align-items: center; padding: 2px 6px; border-radius: var(--r-sm); font-size: 12.5px; }
  .linhas li.hit { background: color-mix(in srgb, var(--c) 18%, transparent); box-shadow: inset 3px 0 0 var(--c); }
  .faixa { font: 11px var(--f-mono); color: var(--muted); }
  .barra { height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .barra i { display: block; height: 100%; background: var(--c); }
  .nome { border: 0; background: none; padding: 0; text-align: left; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; }
  .nome:not(.nada):hover { text-decoration: underline; }
  .nada { color: var(--muted); font-style: italic; }
  .nd { font: 600 11px var(--f-mono); color: var(--c); text-align: right; }
  .lado { display: grid; gap: var(--sp-2); }
  .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .lugar { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 8px; border: 1px solid transparent; background: none; border-radius: var(--r-sm); padding: 5px 8px; text-align: left; color: var(--ink); }
  .lugar:hover, .lugar.on { background: var(--surface-2); border-color: var(--line); }
  .lugar.on { box-shadow: inset 3px 0 0 var(--c); }
  .nm { font: 600 13px var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pz { grid-row: 2; font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sk { grid-row: 1 / 3; grid-column: 2; align-self: center; font: 600 11px var(--f-display); color: var(--c); border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); border-radius: var(--r-pill); padding: 1px 8px; }
  .degrau { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 8px; align-items: center; padding: 4px 0; border-bottom: 1px dashed var(--line); }
  .dl { display: grid; font: 600 12px var(--f-display); color: var(--c); }
  .dl small { font: 10px var(--f-mono); color: var(--muted); }
  .seres { display: flex; flex-wrap: wrap; gap: 3px; }
  .chip { border: 1px solid color-mix(in srgb, var(--t) 50%, var(--line)); background: color-mix(in srgb, var(--t) 10%, var(--surface)); color: var(--ink); border-radius: 999px; padding: 0 8px; font-size: 12px; }
  .dim { color: var(--muted); }
  .small, .sm { font-size: 12px; margin: 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  @media (prefers-reduced-motion: reduce) { .dado.rolando { animation: none; } }
</style>
