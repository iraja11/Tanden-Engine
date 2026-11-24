<script lang="ts">
  import { CATEGORIAS_PODER, VEREDITOS, assinatura, equilibrio, lerPoder, portadores, type Entity, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { typeColor } from '../../tipos';
  import Radar from './Radar.svelte';

  // A balança de um poder: a força (nível, alcance, duração) contra o preço
  // (custo, limites, fraqueza, efeito colateral). Mostra o veredito, a
  // assinatura em seis eixos, quem tem o poder e o que ele exige antes.
  let { entity, world, text, byPath, onopen, onfield }: {
    entity: Entity; world: World; text: string; byPath: Map<string, Entity>; onopen: (path: string) => void; onfield: (campo: string) => void;
  } = $props();

  const p = $derived(lerPoder(entity, text));
  const eq = $derived(equilibrio(p));
  const v = $derived(VEREDITOS[eq.veredito]);
  const cat = $derived(CATEGORIAS_PODER.find((c) => c.id === p.categoria)!);
  const eixos = $derived(assinatura(p));
  const quem = $derived(portadores(world, entity.path));
  const exige = $derived(p.requer.map((r) => byPath.get(r)).filter((x): x is Entity => !!x));
  const abre = $derived(world.entities.filter((e) => e.type === 'poder' && e.relations.some((r) => r.to === entity.path && /^(requer|pré-?requisito|pre-?requisito|exige|depois de)$/i.test(r.label.trim()))));
  // posição do ponteiro na régua (razão preço/força de 0 a 2)
  const pos = $derived(Math.min(100, (eq.razao / 2) * 100));
  const FAIXAS = [
    { de: 0, ate: 15, cor: VEREDITOS.quebrado.cor },
    { de: 15, ate: 27.5, cor: VEREDITOS.forte.cor },
    { de: 27.5, ate: 62.5, cor: VEREDITOS.equilibrado.cor },
    { de: 62.5, ate: 100, cor: VEREDITOS.caro.cor },
  ];
</script>

<section class="poder t-card" style:--k={cat.cor} style:--v={v.cor} in:rise={{ y: 6 }}>
  <header>
    <h3 class="t-eyebrow">Balança do poder</h3>
    <span class="cat"><span aria-hidden="true">{cat.glifo}</span>{cat.label} · nível {p.nivel}</span>
  </header>

  <div class="corpo">
    <div class="veredito">
      <div class="selo"><b>{v.label}</b><small>preço {eq.preco} · força {eq.forca}</small></div>
      <p>{v.desc}</p>
      <div class="regua" role="img" aria-label={`Razão preço/força: ${eq.razao}`}>
        {#each FAIXAS as f (f.de)}<i style:left="{f.de}%" style:width="{f.ate - f.de}%" style:background={f.cor}></i>{/each}
        <span class="ponteiro" style:left="{pos}%"></span>
      </div>
      <div class="rotulos"><span>barato</span><span>justo</span><span>caro</span></div>
      <dl class="contas">
        <dt>Custo</dt><dd>{#if p.custo}{p.custo}{:else}<button class="falta" onclick={() => onfield('custo')}>+ dar um custo</button>{/if}</dd>
        <dt>Fraqueza</dt><dd>{#if p.fraqueza}{p.fraqueza}{:else}<button class="falta" onclick={() => onfield('fraqueza')}>+ fraqueza</button>{/if}</dd>
        <dt>Colateral</dt><dd>{#if p.colateral}{p.colateral}{:else}<button class="falta" onclick={() => onfield('efeito colateral')}>+ efeito colateral</button>{/if}</dd>
        <dt>Limites</dt><dd>{p.limites ? `${p.limites} palavras em "Limites"` : 'escreva a seção "Limites"'}</dd>
      </dl>
    </div>
    <div class="assin">
      <Radar {eixos} cor={cat.cor} size={160} rotulo={`Assinatura de ${entity.name}`} />
    </div>
  </div>

  {#if eq.dicas.length}
    <ul class="dicas">{#each eq.dicas as d (d)}<li>{d}</li>{/each}</ul>
  {/if}

  <div class="lig">
    <div><span class="lbl">Quem tem</span>
      {#each quem as e (e.path)}<button class="chip" style:--c={typeColor(e.type)} onclick={() => onopen(e.path)}>{e.name}</button>{:else}<button class="chip vazio" onclick={() => onfield('quem tem')}>+ portador</button>{/each}
    </div>
    <div><span class="lbl">Exige antes</span>
      {#each exige as e (e.path)}<button class="chip" style:--c={typeColor('poder')} onclick={() => onopen(e.path)}>{e.name}</button>{:else}<span class="dim">nada</span>{/each}
    </div>
    {#if abre.length}
      <div><span class="lbl">Abre caminho para</span>{#each abre as e (e.path)}<button class="chip" style:--c={typeColor('poder')} onclick={() => onopen(e.path)}>{e.name}</button>{/each}</div>
    {/if}
  </div>
</section>

<style>
  .poder { display: grid; gap: var(--sp-3); border-top: 3px solid var(--k); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cat { display: inline-flex; align-items: center; gap: 6px; font: 600 12px var(--f-display); color: var(--k); }
  .corpo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: var(--sp-3); align-items: center; }
  .veredito { display: grid; gap: 8px; }
  .selo { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .selo b { font: 700 26px/1 var(--f-display); color: var(--v); text-shadow: 0 0 22px color-mix(in srgb, var(--v) 45%, transparent); }
  .selo small { font: 11px var(--f-mono); color: var(--muted); }
  .veredito p { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.45; }
  .regua { position: relative; height: 10px; border-radius: 5px; overflow: visible; margin-top: 4px; }
  .regua i { position: absolute; top: 0; bottom: 0; opacity: .75; }
  .regua i:first-child { border-radius: 5px 0 0 5px; }
  .regua i:nth-child(4) { border-radius: 0 5px 5px 0; }
  .ponteiro { position: absolute; top: -5px; width: 4px; height: 20px; margin-left: -2px; border-radius: 2px; background: var(--ink); box-shadow: 0 0 0 2px var(--surface); transition: left .6s var(--ease); }
  .rotulos { display: flex; justify-content: space-between; font: 10px var(--f-mono); color: var(--muted); }
  .contas { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 3px 10px; font-size: 12.5px; }
  .contas dt { color: var(--muted); font: 600 10px/1.9 var(--f-display); letter-spacing: .08em; text-transform: uppercase; }
  .contas dd { margin: 0; overflow-wrap: anywhere; }
  .falta { border: 1px dashed var(--line); background: none; border-radius: var(--r-pill); padding: 0 8px; color: var(--ember-soft); font-size: 12px; }
  .falta:hover { border-color: var(--ember); }
  .assin { display: grid; justify-items: center; }
  .dicas { margin: 0; padding: 0 0 0 18px; display: grid; gap: 3px; font-size: 12.5px; color: var(--muted); }
  .dicas li::marker { content: '⚖  '; color: var(--v); }
  .lig { display: grid; gap: 6px; }
  .lig > div { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
  .lbl { font: 11px var(--f-mono); color: var(--ember-soft); margin-right: 4px; }
  .chip { border: 1px solid color-mix(in srgb, var(--c, var(--line)) 55%, transparent); background: color-mix(in srgb, var(--c, var(--line)) 12%, transparent); color: var(--ink); border-radius: 999px; padding: 0 9px; font-size: 12px; }
  .chip.vazio { border-style: dashed; color: var(--muted); }
  .dim { color: var(--muted); font-size: 12px; }
</style>
