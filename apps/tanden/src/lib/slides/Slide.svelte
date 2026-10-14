<script lang="ts">
  import { slideHtml, type Slide } from '@tanden/core';
  import { slides } from './slides.svelte';

  // Um slide desenhado numa tela 16:9 que se ajusta ao tamanho de quem o
  // contém (unidades cqw): a mesma peça serve de miniatura, prévia e projeção.
  let { slide, index, total, live = false }: {
    slide: Slide;
    index: number;
    total: number;
    /** modo apresentação: sem contorno, com a linha de progresso */
    live?: boolean;
  } = $props();

  const EMBED_LINE = /^\s*(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\))\s*$/;
  const HEAD = /^#{1,6}\s/;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function image(target: string, alt: string): string {
    const url = slides.urls[target];
    if (!url) {
      slides.want(target);
      return `<span class="img-wait">${esc(alt || target.split('/').pop() || '')}</span>`;
    }
    return `<img src="${esc(url)}" alt="${esc(alt)}" draggable="false">`;
  }
  const html = (md: string) => slideHtml(md, image);

  // título, corpo e imagens separados, para cada arranjo posicionar do seu jeito
  const parts = $derived.by(() => {
    void slides.urls; // imagem nova chegou: redesenha
    const lines = slide.md.split('\n');
    const hi = lines.findIndex((l) => HEAD.test(l));
    const before = hi >= 0 ? lines.slice(0, hi) : [];
    const titleLine = hi >= 0 && before.every((l) => !l.trim() || EMBED_LINE.test(l)) ? lines[hi]! : '';
    const rest = titleLine ? lines.filter((_, i) => i !== hi) : lines;
    const side = slide.layout === 'dividido' || slide.layout === 'imagem';
    const imgs = side ? rest.filter((l) => EMBED_LINE.test(l)) : [];
    const body = side ? rest.filter((l) => !EMBED_LINE.test(l)) : rest;
    return {
      title: titleLine ? html(titleLine.replace(/^#+\s*/, '')).replace(/^<p>|<\/p>\s*$/g, '') : '',
      body: html(body.join('\n')),
      imgs: imgs.map((l) => html(l)).join(''),
    };
  });

  // letra encolhe até o corpo caber (um slide nunca rola)
  let bodyEl = $state<HTMLElement>();
  let fit = $state(1);
  $effect(() => {
    void parts;
    const el = bodyEl;
    if (!el) return;
    fit = 1;
    let raf = 0;
    const step = () => {
      if (el.scrollHeight > el.clientHeight + 1 && fit > 0.5) {
        fit = Math.round((fit - 0.05) * 100) / 100;
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="slide {slide.layout}" class:live class:bare={slide.layout === 'imagem' && !parts.title} style:--fit={fit}>
  <div class="frame">
    {#if slide.layout === 'capa'}
      <div class="cover">
        {#if parts.title}<h1>{@html parts.title}</h1>{/if}
        <i class="rule"></i>
        <div class="body sub" bind:this={bodyEl}>{@html parts.body}</div>
      </div>
      <span class="sigil" aria-hidden="true"></span>
    {:else if slide.layout === 'seção'}
      <div class="section">
        <i class="bar"></i>
        <div>
          {#if parts.title}<h2>{@html parts.title}</h2>{/if}
          <div class="body sub" bind:this={bodyEl}>{@html parts.body}</div>
        </div>
      </div>
    {:else if slide.layout === 'imagem'}
      {#if parts.title}<h2 class="small">{@html parts.title}</h2>{/if}
      <div class="full">{@html parts.imgs}</div>
      <div class="body" hidden bind:this={bodyEl}></div>
    {:else}
      {#if parts.title}<h2>{@html parts.title}</h2><i class="rule left"></i>{/if}
      <div class="content" class:split={slide.layout === 'dividido'}>
        <div class="body" bind:this={bodyEl}>{@html parts.body}</div>
        {#if slide.layout === 'dividido'}<div class="side">{@html parts.imgs}</div>{/if}
      </div>
    {/if}
    <span class="num">{index + 1}</span>
    {#if live}
      <span class="progress" aria-hidden="true"><i style:width="{((index + 1) / total) * 100}%"></i></span>
    {/if}
  </div>
</div>

<style>
  .slide { container-type: inline-size; width: 100%; aspect-ratio: 16 / 9; position: relative; overflow: hidden; border-radius: 1.2cqw;
    background: var(--void); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); user-select: text; }
  .slide.live { border-radius: 0; box-shadow: none; }
  .frame { position: absolute; inset: 0; padding: 5.2cqw 5.8cqw 5.4cqw; display: flex; flex-direction: column; }

  h1, h2 { font-family: var(--f-display); font-weight: 600; margin: 0; line-height: 1.12; letter-spacing: .005em; }
  h1 { font-size: 5.6cqw; }
  h2 { font-size: 3.3cqw; }
  h2.small { font-size: 2.4cqw; margin-bottom: 1.4cqw; }
  .rule { display: block; width: 5.8cqw; height: .32cqw; border-radius: 1cqw; background: var(--ember); box-shadow: 0 0 1.6cqw var(--ember-glow); margin: 2.2cqw auto; }
  .rule.left { margin: 1.4cqw 0 2.4cqw; }

  .body { font-size: calc(2.45cqw * var(--fit)); line-height: 1.42; min-height: 0; overflow: hidden; }
  .body :global(> :first-child) { margin-top: 0; }
  .body :global(p) { margin: 0 0 .55em; }
  .body :global(ul), .body :global(ol) { margin: 0 0 .55em; padding-left: 1.3em; }
  .body :global(li) { margin: .18em 0; }
  .body :global(li::marker) { color: var(--ember); }
  .body :global(li:has(> input)) { list-style: none; margin-left: -1.3em; }
  .body :global(input[type='checkbox']) { appearance: none; display: inline-block; width: .72em; height: .72em; margin: 0 .45em 0 0; vertical-align: -.02em;
    border: .1em solid var(--ember); border-radius: .16em; background: transparent; }
  .body :global(input[type='checkbox']:checked) { background: var(--ember); box-shadow: inset 0 0 0 .1em var(--void); }
  .body :global(h3), .body :global(h4) { font-family: var(--f-display); font-weight: 600; font-size: 1.12em; margin: .6em 0 .3em; }
  .body :global(strong) { color: var(--ink); font-weight: 700; }
  .body :global(a) { color: var(--ember-soft); text-decoration-color: color-mix(in srgb, var(--ember) 50%, transparent); }
  .body :global(code) { font: .9em var(--f-mono); color: var(--ember-soft); }
  .body :global(pre) { margin: 0 0 .6em; padding: .7em 1em; border-radius: .5em; background: var(--surface-2); border-left: .2em solid var(--ember); overflow: hidden; }
  .body :global(pre code) { color: var(--ink); font-size: .78em; line-height: 1.5; white-space: pre; }
  .body :global(blockquote) { margin: 0 0 .6em; padding: .2em 0 .2em .9em; border-left: .18em solid var(--ember); color: var(--muted); font-style: italic; }
  .body :global(mark) { background: color-mix(in srgb, var(--ember) 30%, transparent); color: inherit; padding: 0 .1em; border-radius: .15em; }
  .body :global(table) { border-collapse: collapse; width: 100%; font-size: .8em; margin: 0 0 .6em; }
  .body :global(th), .body :global(td) { text-align: left; padding: .35em .6em; border-bottom: 1px solid var(--line); }
  .body :global(th) { background: var(--surface-2); border-bottom: .12em solid var(--ember); }
  .body :global(img) { max-width: 100%; max-height: 22cqw; border-radius: .4em; }
  .body :global(hr) { display: none; }
  .sub { color: var(--muted); font-size: calc(2cqw * var(--fit)); }

  .cover { margin: auto; text-align: center; max-width: 82%; display: flex; flex-direction: column; align-items: center; }
  .cover .sub { max-height: 16cqw; }
  .sigil { position: absolute; right: 5.8cqw; bottom: 4.6cqw; width: 1.5cqw; height: 1.5cqw; border-radius: 50%; border: .3cqw solid var(--ember); }

  .section { margin: auto 0; display: flex; gap: 3cqw; align-items: stretch; }
  .section .bar { width: .55cqw; border-radius: 1cqw; background: var(--ember); box-shadow: 0 0 2cqw var(--ember-glow); }
  .section h2 { font-size: 4.4cqw; }
  .section .sub { margin-top: 1.4cqw; max-height: 12cqw; }

  .content { flex: 1; min-height: 0; display: flex; }
  .content > .body { flex: 1; }
  .content.split { gap: 3.4cqw; }
  .content.split > .body { flex: 1.15; }
  .side { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 1.2cqw; }
  .side :global(p) { margin: 0; display: flex; justify-content: center; min-height: 0; }
  .side :global(img) { max-width: 100%; max-height: 36cqw; object-fit: contain; border-radius: .6cqw; }

  .full { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
  .full :global(p) { margin: 0; height: 100%; width: 100%; display: flex; align-items: center; justify-content: center; }
  .full :global(img) { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: .4cqw; }
  .imagem .frame { padding: 2.6cqw 2.8cqw 3.4cqw; }
  /* só a imagem (ex.: página de PDF importado): ocupa o slide inteiro */
  .bare .frame { padding: 0; }
  .bare .full :global(img) { border-radius: 0; }

  .slide :global(.img-wait) { display: inline-flex; align-items: center; justify-content: center; min-width: 30%; min-height: 8cqw; padding: 1cqw;
    border: 1px dashed var(--line); border-radius: .6cqw; color: var(--muted); font: 1.3cqw var(--f-mono); }

  .num { position: absolute; right: 5.8cqw; bottom: 1.6cqw; font: 1.05cqw var(--f-mono); color: var(--muted); }
  .capa .num, .bare .num { display: none; }
  .progress { position: absolute; left: 0; right: 0; bottom: 0; height: .32cqw; background: var(--line); }
  .progress i { display: block; height: 100%; background: var(--ember); box-shadow: 0 0 1.2cqw var(--ember); transition: width var(--dur-slow) var(--ease); }
</style>
