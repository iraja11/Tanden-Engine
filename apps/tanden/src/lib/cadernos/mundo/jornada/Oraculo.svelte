<script lang="ts">
  import { CHANCES, fairRng, generoDoMundo, lerOraculo, pedidoImproviso, perguntarOraculo, type ChanceOraculo, type LeituraOraculo, type Resposta, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import LinkText from '../LinkText.svelte';
  import { iaPronta, improvisar, prepararIa } from './ia';
  import { jornada } from './jornada.svelte';

  // Oráculo: cartas com as fichas reais do mundo e dados para decidir a história.
  let { world, onopen, oncena, onevento }: {
    world: World;
    onopen: (path: string) => void;
    oncena: (titulo: string, texto: string) => void;
    onevento: (titulo: string, texto: string) => void;
  } = $props();

  const genero = $derived(generoDoMundo(world));
  let leitura = $state<LeituraOraculo | null>(null);
  let giro = $state(0);
  let improviso = $state('');
  let pensando = $state(false);
  let erroIa = $state('');

  $effect(() => { void prepararIa(); });

  function rolar() {
    leitura = lerOraculo(world, genero, fairRng);
    giro++;
    improviso = '';
    erroIa = '';
    sound.play('tick');
    jornada.contar(world.name, 'oraculo');
  }

  let pergunta = $state('');
  let chance = $state<ChanceOraculo>('talvez');
  let resposta = $state<Resposta | null>(null);
  function perguntar() {
    resposta = perguntarOraculo(chance, fairRng);
    giro++;
    sound.play('tick');
    jornada.contar(world.name, 'oraculo');
    if (resposta.critico) jornada.contar(world.name, resposta.sim ? 'sorte' : 'azar');
  }

  const sem = (t: string) => t.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');
  const titulo = (t: string) => sem(t).split(/[,.:]/)[0]!.split(' ').slice(0, 6).join(' ');
  const achar = (t: string) => world.entities.find((e) => e.name.toLowerCase() === t.toLowerCase());
  const texto = $derived(leitura ? `${leitura.gancho}\n\n**Reviravolta:** ${leitura.reviravolta}\n\n**Complicação:** ${leitura.complicacao}\n\n**Detalhe:** ${leitura.detalhe}` : '');

  async function improvisarCena() {
    if (!leitura || pensando) return;
    pensando = true;
    improviso = '';
    erroIa = '';
    try {
      await improvisar(pedidoImproviso(world, genero, leitura), (t) => { improviso += t; });
    } catch (e) {
      erroIa = String(e);
    } finally {
      pensando = false;
    }
  }

  const CARTAS = [['gancho', 'Gancho'], ['reviravolta', 'Reviravolta'], ['complicacao', 'Complicação'], ['detalhe', 'Detalhe']] as const;
</script>

<section class="oraculo" style:--luz={genero.cores.luz}>
  <header>
    <div>
      <h3>Oráculo</h3>
      <p>{genero.glifo} {genero.label}</p>
    </div>
    <button class="t-btn t-btn--primary dado" onclick={rolar}><span class="d" aria-hidden="true">🎲</span>{leitura ? 'Rolar de novo' : 'Rolar as cartas'}</button>
  </header>

  {#if leitura}
    {@const l = leitura}
    {#key giro}
      <div class="cartas">
        {#each CARTAS as [k, rotulo], i (k)}
          <article class={k} in:rise={{ delay: i * 90, y: 14 }}>
            <small>{rotulo}</small>
            <p><LinkText text={l[k]} color={() => genero.cores.luz} onlink={(t) => { const e = achar(t); if (e) onopen(e.path); }} /></p>
          </article>
        {/each}
      </div>
    {/key}
    {#if improviso || pensando}
      <blockquote>{improviso || 'Improvisando...'}</blockquote>
    {/if}
    {#if erroIa}<p class="erro">A IA não respondeu. As cartas continuam valendo.</p>{/if}
    <div class="acoes">
      <button class="t-btn t-btn--sm t-btn--primary" onclick={() => oncena(titulo(l.gancho), improviso || texto)}>Virar cena</button>
      <button class="t-btn t-btn--sm" onclick={() => onevento(titulo(l.gancho), texto)}>Virar evento</button>
      <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => { void navigator.clipboard?.writeText(texto); cadernos.say('Leitura copiada.'); }}>Copiar</button>
      {#if iaPronta()}<button class="t-btn t-btn--sm t-btn--quiet" disabled={pensando} onclick={improvisarCena}>✦ Improvisar com a IA</button>{/if}
    </div>
  {:else}
    <p class="vazio">Sem ideia para a próxima cena? As cartas combinam as suas fichas com o clima de {genero.label.toLowerCase()}.</p>
  {/if}

  <form class="pergunta" onsubmit={(e) => { e.preventDefault(); perguntar(); }}>
    <label class="campo"><span class="t-eyebrow">Pergunte ao destino</span><input class="t-input" bind:value={pergunta} placeholder="A carta chega a tempo?" /></label>
    <div class="t-seg" role="radiogroup" aria-label="Chance">
      {#each CHANCES as c (c.id)}<button type="button" role="radio" aria-checked={chance === c.id} class:on={chance === c.id} onclick={() => (chance = c.id)}>{c.label}</button>{/each}
    </div>
    <button class="t-btn">Rolar d100</button>
  </form>
  {#if resposta}
    {#key giro}
      <p class="veredito" class:sim={resposta.sim} class:critico={resposta.critico} in:rise={{ y: 6 }}>
        <span class="n">{resposta.d100}</span>
        <span><b>{resposta.titulo}</b> {resposta.texto}</span>
      </p>
    {/key}
  {/if}
</section>

<style>
  .oraculo { display: grid; gap: var(--sp-3); padding: var(--sp-4); border: 1px solid color-mix(in srgb, var(--luz) 38%, var(--line)); border-radius: var(--r-lg);
    background: radial-gradient(circle at 100% 0, color-mix(in srgb, var(--luz) 13%, var(--surface)), var(--surface) 58%); }
  header { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  h3 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  header p { margin: 2px 0 0; font: 600 15px var(--f-display); }
  .dado:hover .d { display: inline-block; animation: rola .5s ease-out; }
  @keyframes rola { to { transform: rotate(360deg); } }
  .vazio { margin: 0; color: var(--muted); font-size: 14px; }
  .cartas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-2); }
  article.detalhe { grid-column: 1 / -1; }
  @media (max-width: 560px) { .cartas { grid-template-columns: minmax(0, 1fr); } }
  article { display: grid; align-content: start; gap: 4px; padding: var(--sp-3); border-radius: var(--r-md); border: 1px solid var(--line); background: var(--surface); }
  article.gancho { grid-column: 1 / -1; border-color: color-mix(in srgb, var(--luz) 55%, var(--line)); }
  article.gancho p { font: 500 17px/1.45 var(--f-display); }
  article small { font: 600 10px var(--f-display); letter-spacing: .1em; text-transform: uppercase; color: var(--luz); }
  article p { margin: 0; font-size: 13.5px; line-height: 1.5; }
  blockquote { margin: 0; padding: var(--sp-2) var(--sp-3); border-left: 2px solid var(--luz); color: var(--ink); font: italic 14.5px/1.6 var(--f-body); white-space: pre-wrap; }
  .erro { margin: 0; color: var(--crit); font-size: 12.5px; }
  .acoes { display: flex; flex-wrap: wrap; gap: 6px; }
  .pergunta { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--sp-2); padding-top: var(--sp-3); border-top: 1px dashed var(--line); }
  .campo { flex: 1 1 200px; display: grid; gap: 4px; min-width: 0; }
  .veredito { margin: 0; display: flex; align-items: center; gap: var(--sp-3); font-size: 14px; color: var(--muted); }
  .veredito b { color: var(--crit); font: 600 16px var(--f-display); margin-right: 4px; }
  .veredito.sim b { color: var(--ok); }
  .n { flex: none; width: 44px; height: 44px; display: grid; place-items: center; rotate: 45deg; border-radius: 8px; font: 700 14px var(--f-mono); color: var(--ink); background: var(--surface-2); border: 1px solid var(--line); }
  .critico .n { border-color: var(--luz); box-shadow: 0 0 16px -2px var(--luz); }
  @media (prefers-reduced-motion: reduce) { .dado:hover .d { animation: none; } }
</style>
