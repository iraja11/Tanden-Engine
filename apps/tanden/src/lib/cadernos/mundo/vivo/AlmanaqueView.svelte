<script lang="ts">
  import { NON_CARD_TYPES, censo, demografia, numeroCurto, palavrasPorTipo, recordes, timeline, typeInfo, type NoCenso, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { typeColor } from '../../tipos';
  import Rosca from './Rosca.svelte';

  // O almanaque: o mundo em números, tudo calculado das fichas na hora.
  // Censo pela hierarquia dos lugares, quem são as personagens, quanto se
  // escreveu de cada coisa e os recordes do mundo.
  let { world, onopen, onaba }: { world: World; onopen: (path: string) => void; onaba: (aba: string) => void } = $props();

  const c = $derived(censo(world));
  const d = $derived(demografia(world));
  const pal = $derived(palavrasPorTipo(world).filter((x) => !NON_CARD_TYPES.has(x.type) || x.type === 'historia'));
  const rec = $derived(recordes(world));
  const fichas = $derived(world.entities.filter((e) => !NON_CARD_TYPES.has(e.type)).length);
  const palavras = $derived(world.entities.reduce((s, e) => s + e.words, 0));
  const ligacoes = $derived(world.relations.filter((r) => r.to).length);
  const datas = $derived(timeline(world).length);
  const maxPal = $derived(Math.max(1, ...pal.map((x) => x.palavras)));
  const maxIdade = $derived(Math.max(1, ...d.idades.map((x) => x.n)));
  // páginas de um livro comum (~250 palavras por página)
  const paginas = $derived(Math.round(palavras / 250));
  const fmt = (n: number) => n.toLocaleString('pt-BR');

  let abertos = $state<Set<string>>(new Set());
  function alternar(p: string) { const s = new Set(abertos); if (s.has(p)) s.delete(p); else s.add(p); abertos = s; }
  const CORES_CENSO = ['#7fd1a8', '#7fb6ff', '#e6c86e', '#ff8a3d', '#b59cff', '#6fc3c9', '#d98fb0', '#a3c977'];
</script>

{#snippet no(n: NoCenso, nivel: number, maior: number)}
  <li style:--n={nivel}>
    <div class="linha">
      {#if n.filhos.length}<button class="abre" onclick={() => alternar(n.lugar.path)} aria-expanded={abertos.has(n.lugar.path)} aria-label={abertos.has(n.lugar.path) ? 'Recolher' : 'Expandir'}>{abertos.has(n.lugar.path) ? '▾' : '▸'}</button>{:else}<span class="abre"></span>{/if}
      <button class="nm" onclick={() => onopen(n.lugar.path)}>{n.lugar.name}</button>
      <span class="br"><i style:width="{(n.total / Math.max(1, maior)) * 100}%"></i></span>
      <span class="v" title={n.propria === null ? 'Soma dos lugares de dentro' : n.propria < n.total ? `A ficha diz ${fmt(n.propria)}; os lugares de dentro somam mais` : ''}>{n.total ? numeroCurto(n.total) : '—'}{n.propria === null && n.total ? '*' : ''}</span>
    </div>
    {#if n.filhos.length && abertos.has(n.lugar.path)}
      <ul>{#each n.filhos as f (f.lugar.path)}{@render no(f, nivel + 1, maior)}{/each}</ul>
    {/if}
  </li>
{/snippet}

<section class="alma" in:rise={{ y: 6 }}>
  <div class="herois">
    <div class="heroi grande"><small>Habitantes</small><b>{c.total ? numeroCurto(c.total) : '—'}</b><span>{c.contados} {c.contados === 1 ? 'lugar contado' : 'lugares contados'}</span></div>
    <div class="heroi"><small>Fichas</small><b>{fmt(fichas)}</b><span>{fmt(ligacoes)} ligações</span></div>
    <div class="heroi"><small>Palavras</small><b>{numeroCurto(palavras)}</b><span>{paginas < 1 ? 'menos de uma página de livro' : `~${fmt(paginas)} ${paginas === 1 ? 'página' : 'páginas'} de livro`}</span></div>
    <div class="heroi"><small>Personagens</small><b>{fmt(d.pessoas)}</b><span>{d.vivas} vivas · {d.mortas} mortas</span></div>
    <div class="heroi"><small>Datas</small><b>{fmt(datas)}</b><span>na linha do tempo</span></div>
  </div>

  {#if rec.length}
    <div class="recordes">
      {#each rec as r, i (r.id)}
        <button class="rec t-card" onclick={() => onopen(r.e.path)} style:--c={typeColor(r.e.type)} in:rise={{ delay: i * 40, y: 6 }}>
          <span class="g" aria-hidden="true">{r.glifo}</span>
          <span class="t"><small>{r.titulo}</small><b>{r.e.name}</b><em>{r.valor}</em></span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="duo">
    <div class="t-card bloco">
      <h3 class="t-eyebrow">Censo</h3>
      {#if c.total}
        <div class="pilha" role="img" aria-label="População por região">
          {#each c.raizes.filter((r) => r.total > 0) as r, i (r.lugar.path)}
            <button style:flex-grow={r.total} style:background={CORES_CENSO[i % CORES_CENSO.length]} title={`${r.lugar.name}: ${fmt(r.total)}`} onclick={() => alternar(r.lugar.path)}>
              {#if r.total / c.total > 0.12}<span>{r.lugar.name}</span>{/if}
            </button>
          {/each}
        </div>
        <ul class="arvore">{#each c.raizes.filter((r) => r.total > 0) as r (r.lugar.path)}{@render no(r, 0, c.raizes[0]?.total ?? 1)}{/each}</ul>
        <p class="dim sm">* soma dos lugares de dentro. Escreva <code>população</code> nos lugares e <code>parte de: [[Lugar maior]]</code> para a hierarquia.</p>
      {:else}
        <p class="dim sm">Ninguém contado ainda. Escreva <code>população: 12 mil</code> nos lugares (vale "1.200", "3k", "2 milhões"); quem é <code>parte de</code> outro lugar soma no maior.</p>
      {/if}
    </div>

    <div class="t-card bloco">
      <h3 class="t-eyebrow">Quanto se escreveu</h3>
      {#each pal as x (x.type)}
        <div class="pal" style:--c={typeColor(x.type)}>
          <span class="nm">{typeInfo(x.type).plural}<small>{x.n}</small></span>
          <span class="br"><i style:width="{(x.palavras / maxPal) * 100}%"></i></span>
          <span class="v">{numeroCurto(x.palavras)}</span>
        </div>
      {/each}
      {#if !pal.length}<p class="dim sm">Nada escrito ainda.</p>{/if}
    </div>
  </div>

  {#if d.pessoas}
    <div class="t-card bloco">
      <h3 class="t-eyebrow">Quem vive aqui</h3>
      <div class="roscas">
        <Rosca titulo="Espécies" fatias={d.especies} onclick={onopen} />
        <Rosca titulo="Culturas" fatias={d.culturas} onclick={onopen} />
        <Rosca titulo="Facções" fatias={d.faccoes} onclick={onopen} />
        <Rosca titulo="Gênero" fatias={d.sexos} />
      </div>
      {#if d.idades.length}
        <div class="idades">
          <h4>Idades no agora do mundo{#if d.idadeMedia !== null}<small> · média {d.idadeMedia} anos</small>{/if}</h4>
          <div class="hist">
            {#each d.idades as f (f.nome)}
              <div class="col"><span class="barra" style:height="{(f.n / maxIdade) * 100}%"><b>{f.n}</b></span><small>{f.nome}</small></div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="atalhos">
    <button class="t-btn" onclick={() => onaba('mercado')}>⚖ Ver a economia</button>
    <button class="t-btn" onclick={() => onaba('seres')}>☠ Bestiário e encontros</button>
    <button class="t-btn" onclick={() => onaba('sistemas')}>☾ Calendário e poderes</button>
  </div>
</section>

<style>
  .alma { display: grid; gap: var(--sp-3); padding-bottom: 40px; }
  .herois { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 8px; }
  .heroi { display: grid; gap: 1px; padding: 12px 14px; border-radius: var(--r-lg); border: 1px solid var(--line); background: var(--surface); }
  .heroi small { font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .heroi b { font: 700 28px/1.1 var(--f-display); }
  .heroi span { font-size: 11.5px; color: var(--muted); }
  .heroi.grande { border-color: color-mix(in srgb, #7fd1a8 45%, var(--line)); background: linear-gradient(150deg, color-mix(in srgb, #7fd1a8 14%, var(--surface)), var(--surface) 70%); }
  .heroi.grande b { color: color-mix(in srgb, #7fd1a8 70%, var(--ink)); }
  .recordes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 8px; }
  .rec { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 10px; align-items: center; text-align: left; color: var(--ink); border-left: 3px solid var(--c); }
  .rec .g { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; font-size: 19px; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  .rec .t { display: grid; min-width: 0; }
  .rec small { font: 600 10px var(--f-display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .rec b { font: 600 15px var(--f-display); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rec em { font: normal 12px var(--f-mono); color: var(--c); }
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: var(--sp-3); align-items: start; }
  .bloco { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; min-width: 0; }
  .pilha { display: flex; height: 30px; border-radius: var(--r-md); overflow: hidden; gap: 2px; }
  .pilha button { flex-basis: 0; min-width: 4px; border: 0; padding: 0 6px; color: #10131a; font: 600 11px var(--f-display); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .arvore, .arvore ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .linha { display: grid; grid-template-columns: 18px minmax(0, 140px) minmax(40px, 1fr) 64px; gap: 6px; align-items: center; padding-left: calc(var(--n) * 14px); font-size: 12.5px; }
  .abre { border: 0; background: none; padding: 0; color: var(--muted); width: 18px; font-size: 11px; }
  .nm { border: 0; background: none; padding: 0; text-align: left; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; }
  .nm:hover { text-decoration: underline; }
  .br { height: 7px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
  .br i { display: block; height: 100%; border-radius: 4px; background: var(--c, #7fd1a8); transition: width .6s var(--ease); }
  .v { font: 11.5px var(--f-mono); color: var(--muted); text-align: right; white-space: nowrap; }
  .pal { display: grid; grid-template-columns: minmax(0, 130px) minmax(40px, 1fr) 56px; gap: 8px; align-items: center; font-size: 12.5px; }
  .pal .nm small { margin-left: 5px; font: 10px var(--f-mono); color: var(--muted); }
  .roscas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: var(--sp-4); }
  h4 { margin: var(--sp-2) 0 6px; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  h4 small { text-transform: none; letter-spacing: 0; font: 11px var(--f-mono); }
  .hist { display: flex; align-items: flex-end; gap: 8px; height: 120px; padding-top: 14px; }
  .col { flex: 1; height: 100%; display: grid; grid-template-rows: 1fr auto; gap: 4px; min-width: 0; }
  .col .barra { align-self: end; position: relative; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #ff8a3d, color-mix(in srgb, #ff8a3d 40%, var(--surface))); min-height: 4px; }
  .col b { position: absolute; top: -16px; left: 0; right: 0; text-align: center; font: 600 11px var(--f-mono); color: var(--muted); }
  .col small { font-size: 10.5px; color: var(--muted); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .atalhos { display: flex; flex-wrap: wrap; gap: 6px; }
  .dim { color: var(--muted); }
  .sm { font-size: 12px; margin: 0; }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
</style>
