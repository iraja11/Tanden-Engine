<script lang="ts">
  import { untrack } from 'svelte';
  import { bodyOf, generoDoMundo, gravarResposta, pedidoResposta, roteiroEntrevista, rotuloEntrevista, countWords, type Entity, type PerguntaEntrevista, type World } from '@tanden/core';
  import { rise } from '../../../motion';
  import { sound } from '../../../sound.svelte';
  import { cadernos } from '../../cadernos.svelte';
  import { iaPronta, improvisar, prepararIa } from './ia';
  import { jornada } from './jornada.svelte';

  // Entrevista com a ficha: uma pergunta por vez, e a resposta já vai para a nota.
  let { world, entity, onclose }: { world: World; entity: Entity; onclose: () => void } = $props();

  const genero = $derived(generoDoMundo(world));
  const rotulo = $derived(rotuloEntrevista(entity.type));
  let semente = $state(Math.floor(Math.random() * 1e6));
  // o roteiro é fixado ao abrir: responder não pode embaralhar as perguntas
  let roteiro = $state<PerguntaEntrevista[]>([]);
  let i = $state(0);
  let resposta = $state('');
  let respondidas = $state(0);
  let pensando = $state(false);
  let campo = $state<HTMLTextAreaElement>();

  $effect(() => { void prepararIa(); });
  $effect(() => {
    void semente;
    untrack(() => {
      roteiro = roteiroEntrevista(entity, genero, cadernos.read(entity.path), semente, 6);
      i = 0;
    });
  });

  const atual = $derived(roteiro[i] ?? null);

  function seguir() {
    resposta = '';
    i++;
    queueMicrotask(() => campo?.focus());
  }

  function responder() {
    if (!atual || !resposta.trim()) return;
    const p = atual;
    const txt = resposta;
    cadernos.update(entity.path, (t) => gravarResposta(t, p, txt));
    jornada.abrirTexto(entity.path, bodyOf(cadernos.read(entity.path)));
    jornada.creditar(world.name, Math.min(countWords(txt), 150));
    jornada.contar(world.name, 'respostas');
    respondidas++;
    sound.play('tick');
    seguir();
  }

  async function sugerir() {
    if (!atual || pensando) return;
    pensando = true;
    resposta = '';
    try {
      await improvisar(pedidoResposta(entity, genero, bodyOf(cadernos.read(entity.path)), atual), (t) => { resposta += t; });
    } catch {
      cadernos.say('A IA não respondeu. Escreva a sua resposta.');
    } finally {
      pensando = false;
    }
  }
</script>

<section class="entrevista" in:rise={{ y: -6 }} style:--luz={genero.cores.luz} aria-label={`${rotulo.titulo} de ${entity.name}`}>
  <header>
    <span class="t-eyebrow">{rotulo.titulo} · {entity.name}</span>
    {#if roteiro.length}<span class="pontos" aria-label={`Pergunta ${Math.min(i + 1, roteiro.length)} de ${roteiro.length}`}>{#each roteiro as _, k (k)}<i class:on={k < i} class:agora={k === i}></i>{/each}</span>{/if}
    <button class="t-btn t-btn--sm t-btn--icon t-btn--quiet" onclick={onclose} aria-label="Fechar a entrevista">✕</button>
  </header>

  {#if atual}
    {#key atual.texto}
      <p class="pergunta" in:rise={{ y: 8 }}>{atual.texto}</p>
    {/key}
    <!-- svelte-ignore a11y_autofocus -->
    <textarea bind:this={campo} class="t-input" rows="3" autofocus bind:value={resposta} placeholder={entity.type === 'personagem' ? 'Responda na voz da personagem...' : 'Escreva o que vier primeiro...'}
      onkeydown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); responder(); } }}></textarea>
    <div class="acoes">
      <button class="t-btn t-btn--primary" disabled={!resposta.trim()} onclick={responder}>Responder</button>
      <button class="t-btn" onclick={seguir}>Pular</button>
      {#if iaPronta()}<button class="t-btn t-btn--quiet" disabled={pensando} onclick={sugerir}>✦ {pensando ? 'Pensando...' : 'Sugerir com a IA'}</button>{/if}
      <small>Ctrl+Enter responde</small>
    </div>
  {:else}
    <p class="pergunta">{respondidas ? `${respondidas} ${respondidas === 1 ? 'resposta guardada' : 'respostas guardadas'} na ficha.` : 'Por enquanto, sem mais perguntas.'}</p>
    <div class="acoes">
      <button class="t-btn" onclick={() => (semente = Math.floor(Math.random() * 1e6))}>Mais perguntas</button>
      <button class="t-btn t-btn--primary" onclick={onclose}>Concluir</button>
    </div>
  {/if}
</section>

<style>
  .entrevista { display: grid; gap: var(--sp-3); margin-bottom: var(--sp-3); padding: var(--sp-4); border: 1px solid color-mix(in srgb, var(--luz) 45%, var(--line)); border-radius: var(--r-lg);
    background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--luz) 12%, var(--surface)), var(--surface) 60%); }
  header { display: flex; align-items: center; gap: var(--sp-3); }
  header .t-eyebrow { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pontos { display: flex; gap: 4px; margin-left: auto; flex: none; }
  .pontos i { width: 7px; height: 7px; border-radius: 50%; background: var(--line); }
  .pontos i.on { background: var(--luz); }
  .pontos i.agora { background: var(--luz); box-shadow: 0 0 0 3px color-mix(in srgb, var(--luz) 28%, transparent); }
  .pergunta { margin: 0; font: 500 clamp(18px, 3cqw, 22px)/1.35 var(--f-display); }
  textarea { width: 100%; min-height: 86px; padding: var(--sp-2) var(--sp-3); resize: vertical; font: 15px/1.55 var(--f-body); }
  .acoes { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  small { margin-left: auto; color: var(--muted); font: 11px var(--f-mono); }
  @media (hover: none) { small { display: none; } }
</style>
