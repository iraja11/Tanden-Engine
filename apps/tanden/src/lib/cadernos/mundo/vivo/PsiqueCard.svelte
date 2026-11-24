<script lang="ts">
  import {
    CAMPOS_ARCO, FATORES, arcoDe, asText, generoDaFicha, nomeDoTraco, paresDeTracos, perfilPsique, quimica, seededRng, setProp, sugestoesPsique,
    type Entity, type World,
  } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import { typeColor } from '../../tipos';
  import Radar from './Radar.svelte';

  // A psique de uma personagem: os traços viram cinco grandes fatores e um
  // arquétipo; quer/precisa/mentira/ferida/medo viram a frase do arco; e a
  // química com o resto do elenco mostra quem se atrai e quem se repele.
  let { entity, world, onopen, onfield }: { entity: Entity; world: World; onopen: (path: string) => void; onfield: (campo: string) => void } = $props();

  const p = $derived(perfilPsique(entity));
  const a = $derived(arcoDe(entity));
  const g = $derived(generoDaFicha(entity));
  const dicas = $derived(sugestoesPsique(p, a, entity));
  const eixos = $derived(FATORES.map((f, i) => ({ eixo: f.label === 'Conscienciosidade' ? 'Disciplina' : f.label, v: p.big5[i]! / 100 })));

  // química com as outras personagens (as 40 mais próximas no índice bastam)
  const quim = $derived.by(() => {
    const outros = world.entities.filter((e) => e.type === 'personagem' && e.path !== entity.path).slice(0, 40);
    return outros.map((o) => ({ o, q: quimica(entity, o, world) })).filter((x) => x.q.pontos !== 0).sort((x, y) => Math.abs(y.q.pontos) - Math.abs(x.q.pontos)).slice(0, 6);
  });
  const COR_Q: Record<string, string> = { 'Laço forte': '#5fbf77', Simpatia: '#8fd19e', Neutro: '#9aa3ad', Atrito: '#f2a65a', 'Ódio': '#e5484d' };

  // sugestões de traços para escolher (seis pares, sorteados pelo nome)
  let giro = $state(0);
  const pares = paresDeTracos();
  const sugeridos = $derived.by(() => {
    const rng = seededRng(entity.name.length * 97 + giro * 13 + 1);
    const tem = new Set(p.tracos.map((t) => t.id));
    const livres = pares.filter(([x, y]) => !tem.has(x.id) && !(y && tem.has(y.id)));
    const out: typeof pares = [];
    while (out.length < 5 && livres.length) out.push(livres.splice(Math.floor(rng() * livres.length), 1)[0]!);
    return out;
  });

  function addTraco(nome: string) {
    const key = Object.keys(entity.props).find((k) => /^(traços|tracos|traço|personalidade|traits)$/i.test(k)) ?? 'traços';
    const atual = asText(entity.props[key] ?? '').trim();
    cadernos.update(entity.path, (t) => setProp(t, key, atual ? `${atual}, ${nome}` : nome));
    sound.play('tick');
  }
</script>

<section class="psique t-card" in:rise={{ y: 6 }}>
  <header>
    <h3 class="t-eyebrow">Psique</h3>
    {#if p.tracos.length}<span class="conf" title="Quanto do perfil vem de traços reconhecidos">{Math.round(p.confianca * 100)}% de certeza</span>{/if}
  </header>

  <div class="topo">
    <div class="arq">
      <small>Arquétipo</small>
      <b>{p.arquetipo.nome}</b>
      <p>{p.arquetipo.desc}</p>
      <p class="dica">✎ {p.arquetipo.naHistoria}</p>
      <small class="seg">com traços de {p.segundo.nome.replace(/^(O|A) /, '')}</small>
    </div>
    <div class="teia">
      <Radar {eixos} cor={typeColor('personagem')} outra={p.arquetipo.v.map((x) => x / 100)} size={170} rotulo={`Cinco grandes de ${entity.name}`} />
      <p class="leg"><i class="eu"></i>{entity.name} <i class="arqt"></i>{p.arquetipo.nome}</p>
    </div>
  </div>

  <div class="fatores">
    {#each FATORES as f, i (f.id)}
      {@const v = p.big5[i]!}
      <div class="fator" title={`${f.label}: ${v}`}>
        <span class="lbl">{f.label === 'Conscienciosidade' ? 'Disciplina' : f.label}</span>
        <span class="trilho"><i style:left="{v}%"></i></span>
        <span class="desc">{v >= 62 ? f.alto : v <= 38 ? f.baixo : 'no meio-termo'}</span>
      </div>
    {/each}
  </div>

  <div class="tracos">
    {#each p.tracos as t (t.id)}
      {@const choca = p.contradicoes.some(([x, y]) => x === t || y === t)}
      <span class="tr" class:choca title={t.desc}>{nomeDoTraco(t, g)}</span>
    {/each}
    {#each p.soltos as s (s)}<span class="tr solto" title="Traço livre (o catálogo não conhece)">{s}</span>{/each}
    {#if !p.tracos.length && !p.soltos.length}<span class="dim">Sem traços ainda. Escolha alguns abaixo ou escreva em <code>traços</code>.</span>{/if}
  </div>
  {#each p.contradicoes as [x, y] (x.id)}
    <p class="choque">⚡ <b>{nomeDoTraco(x, g)}</b> e <b>{nomeDoTraco(y, g)}</b>: conflito interno. Em que situação cada lado vence?</p>
  {/each}

  <div class="escolher">
    <span class="dim sm">Somar um traço:</span>
    {#each sugeridos as [x, y] (x.id)}
      <span class="par">
        <button class="t-chip" onclick={() => addTraco(nomeDoTraco(x, g))} title={x.desc}>+ {nomeDoTraco(x, g)}</button>
        {#if y}<button class="t-chip" onclick={() => addTraco(nomeDoTraco(y, g))} title={y.desc}>+ {nomeDoTraco(y, g)}</button>{/if}
      </span>
    {/each}
    <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => giro++} title="Outros traços">↻</button>
  </div>

  <div class="arco">
    <h4>Arco <span class="pontos">{#each CAMPOS_ARCO as c (c.campo)}<i class:ok={!a.faltam.includes(c)} title={c.label}></i>{/each}</span></h4>
    {#if a.frase}<blockquote>{a.frase}</blockquote>{:else}<p class="dim sm">O arco nasce de cinco respostas. Comece pelo que a personagem quer.</p>{/if}
    {#if a.faltam.length}
      <div class="faltam">
        {#each a.faltam as f (f.campo)}<button class="t-chip" onclick={() => onfield(f.campo)} title={f.pergunta}>+ {f.label.toLowerCase()}</button>{/each}
      </div>
    {/if}
  </div>

  {#if quim.length}
    <div class="quim">
      <h4>Química com o elenco</h4>
      {#each quim as x (x.o.path)}
        <button class="q" onclick={() => onopen(x.o.path)} title={x.q.razoes.join(' · ')} style:--q={COR_Q[x.q.rotulo]}>
          <span class="nome">{x.o.name}</span>
          <span class="barra"><span class="meio"></span><i style:left={x.q.pontos < 0 ? `${50 + x.q.pontos / 2}%` : '50%'} style:width="{Math.abs(x.q.pontos) / 2}%"></i></span>
          <span class="rot">{x.q.rotulo}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if dicas.length}
    <ul class="dicas">{#each dicas as d (d)}<li>{d}</li>{/each}</ul>
  {/if}
</section>

<style>
  .psique { display: grid; gap: var(--sp-3); }
  header { display: flex; justify-content: space-between; align-items: center; }
  .conf { font: 11px var(--f-mono); color: var(--muted); }
  .topo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: var(--sp-3); align-items: center; }
  .arq { display: grid; gap: 3px; }
  .arq small { font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .arq b { font: 600 24px/1.1 var(--f-display); color: color-mix(in srgb, #ff8a3d 70%, var(--ink)); }
  .arq p { margin: 0; font-size: 13.5px; line-height: 1.45; }
  .arq .dica { color: var(--muted); font-style: italic; }
  .arq .seg { text-transform: none; letter-spacing: 0; font: italic 12px var(--f-body); }
  .teia { display: grid; justify-items: center; }
  .leg { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); flex-wrap: wrap; justify-content: center; }
  .leg i { width: 14px; height: 3px; border-radius: 2px; }
  .leg .eu { background: #ff8a3d; }
  .leg .arqt { background: repeating-linear-gradient(90deg, var(--muted) 0 4px, transparent 4px 7px); margin-left: 8px; }
  .fatores { display: grid; gap: 5px; }
  .fator { display: grid; grid-template-columns: 92px minmax(60px, 1fr) minmax(0, 150px); gap: 10px; align-items: center; font-size: 12px; }
  .fator .lbl { color: var(--muted); font: 600 11px var(--f-display); }
  .trilho { position: relative; height: 6px; border-radius: 3px; background: linear-gradient(90deg, color-mix(in srgb, #7fb6ff 40%, var(--line)), var(--line) 50%, color-mix(in srgb, #ff8a3d 50%, var(--line))); }
  .trilho i { position: absolute; top: -4px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--surface); border: 2.5px solid var(--ink); transition: left .5s var(--ease); }
  .fator .desc { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 520px) { .fator { grid-template-columns: 80px minmax(0, 1fr); } .fator .desc { display: none; } }
  .tracos, .escolher, .faltam { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .tr { padding: 2px 10px; border-radius: var(--r-pill); font-size: 12.5px; border: 1px solid color-mix(in srgb, #ff8a3d 45%, var(--line)); background: color-mix(in srgb, #ff8a3d 10%, var(--surface)); }
  .tr.solto { border-style: dashed; border-color: var(--line); background: none; color: var(--muted); }
  .tr.choca { border-color: #e8c547; box-shadow: 0 0 0 1px color-mix(in srgb, #e8c547 40%, transparent); }
  .choque { margin: 0; font-size: 12.5px; color: var(--muted); padding: 6px 10px; border-left: 3px solid #e8c547; border-radius: 0 var(--r-sm) var(--r-sm) 0; background: color-mix(in srgb, #e8c547 8%, transparent); }
  .choque b { color: var(--ink); }
  .par { display: inline-flex; gap: 2px; }
  .dim { color: var(--muted); }
  .sm { font-size: 12px; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  h4 { margin: 0 0 6px; display: flex; align-items: center; gap: 8px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .pontos { display: inline-flex; gap: 3px; }
  .pontos i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
  .pontos i.ok { background: #ff8a3d; box-shadow: 0 0 6px #ff8a3d; }
  blockquote { margin: 0 0 6px; padding: 8px 12px; border-left: 3px solid #ff8a3d; font: italic 15px/1.5 var(--f-display); background: color-mix(in srgb, #ff8a3d 6%, transparent); border-radius: 0 var(--r-md) var(--r-md) 0; text-wrap: pretty; }
  .quim { display: grid; gap: 3px; }
  .q { display: grid; grid-template-columns: minmax(0, 130px) minmax(60px, 1fr) 76px; gap: 10px; align-items: center; border: 0; background: none; padding: 3px 4px; border-radius: var(--r-sm); color: var(--ink); text-align: left; font-size: 12.5px; }
  .q:hover { background: var(--surface-2); }
  .q .nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .barra { position: relative; height: 8px; border-radius: 4px; background: var(--surface-2); }
  .barra .meio { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--line); }
  .barra i { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--q); }
  .rot { font: 600 11px var(--f-display); color: var(--q); text-align: right; }
  .dicas { margin: 0; padding: 0 0 0 18px; display: grid; gap: 3px; font-size: 12.5px; color: var(--muted); }
  .dicas li::marker { content: '✦  '; color: var(--ember); }
</style>
