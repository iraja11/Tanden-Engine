<script lang="ts">
  import { tick } from 'svelte';
  import { calcPrefs } from './calc.svelte';
  import { quick } from './quick.svelte';
  import { sound } from '../sound.svelte';

  /*
   * Calculadora rápida: uma conta por vez, com histórico. O mesmo motor das
   * folhas (vírgula decimal, unidades, ;) e as teclas de cálculo (Σ, ∫, d/dx,
   * lim) entram como modelo com o cursor no lugar certo.
   */

  quick.start();

  let inputEl = $state<HTMLInputElement>();
  let logEl = $state<HTMLDivElement>();
  let recall = -1;

  const live = $derived(quick.preview(quick.input));

  /** "|" marca onde o cursor fica; o texto selecionado entra no lugar dele */
  interface Key {
    label: string;
    ins?: string;
    title?: string;
    act?: () => void;
    tone?: 'op' | 'main' | 'fn' | 'calc';
    wide?: boolean;
  }

  const BASIC: Key[] = [
    { label: 'AC', act: () => (quick.input = ''), title: 'Limpar a conta (Esc)', tone: 'fn' },
    { label: '⌫', act: back, title: 'Apagar', tone: 'fn' },
    { label: '(', ins: '(|)', tone: 'fn' },
    { label: ')', ins: ')', tone: 'fn' },
    { label: '÷', ins: ' / ', tone: 'op' },
    { label: '7', ins: '7' }, { label: '8', ins: '8' }, { label: '9', ins: '9' },
    { label: 'xʸ', ins: '^', title: 'Potência', tone: 'fn' },
    { label: '×', ins: ' * ', tone: 'op' },
    { label: '4', ins: '4' }, { label: '5', ins: '5' }, { label: '6', ins: '6' },
    { label: '√', ins: '√(|)', title: 'Raiz quadrada', tone: 'fn' },
    { label: '−', ins: ' - ', tone: 'op' },
    { label: '1', ins: '1' }, { label: '2', ins: '2' }, { label: '3', ins: '3' },
    { label: '%', ins: '%', title: 'Porcentagem: 200 * 15%', tone: 'fn' },
    { label: '+', ins: ' + ', tone: 'op' },
    { label: '0', ins: '0' }, { label: ',', ins: ',', title: 'Vírgula decimal' },
    { label: 'ans', ins: 'ans', title: 'Resultado anterior', tone: 'fn' },
    { label: ';', ins: '; ', title: 'Separa argumentos', tone: 'fn' },
    { label: '=', act: run, title: 'Calcular (Enter)', tone: 'main' },
  ];

  const SCI: Key[] = [
    { label: 'sen', ins: 'sen(|)' }, { label: 'cos', ins: 'cos(|)' }, { label: 'tg', ins: 'tg(|)' },
    { label: 'ln', ins: 'ln(|)', title: 'Logaritmo natural' }, { label: 'log', ins: 'log(|)', title: 'Logaritmo na base 10' },
    { label: 'sen⁻¹', ins: 'arcsen(|)' }, { label: 'cos⁻¹', ins: 'arccos(|)' }, { label: 'tg⁻¹', ins: 'arctg(|)' },
    { label: 'eˣ', ins: 'e^(|)' }, { label: '10ˣ', ins: '10^(|)' },
    { label: 'x²', ins: '^2' }, { label: 'x³', ins: '^3' }, { label: '∛', ins: 'raizc(|)', title: 'Raiz cúbica' },
    { label: '1/x', ins: '1/(|)' }, { label: '|x|', ins: 'abs(|)', title: 'Módulo' },
    { label: 'n!', ins: '!', title: 'Fatorial' }, { label: 'nCr', ins: 'comb(|; )', title: 'Combinação' },
    { label: 'π', ins: 'pi' }, { label: 'e', ins: 'e' }, { label: 'x', ins: 'x', title: 'Variável (para funções e cálculo)' },
  ];

  const CALC: Key[] = [
    { label: 'Σ', ins: 'somatorio(|; k; 1; 10)', title: 'Somatório (expr; k; início; fim)' },
    { label: 'Π', ins: 'produtorio(|; k; 1; 10)', title: 'Produtório (expr; k; início; fim)' },
    { label: '∫ₐᵇ', ins: 'integral(|; x; 0; 1)', title: 'Integral definida (expr; x; a; b) — aceita inf' },
    { label: '∫', ins: 'integral(|; x)', title: 'Integral indefinida (simbólica)' },
    { label: 'd/dx', ins: 'derivada(|; x)', title: 'Derivada simbólica; um 3º argumento dá o valor no ponto' },
    { label: 'lim', ins: 'limite(|; x; 0)', title: 'Limite (expr; x; ponto)' },
    { label: 'resolver', ins: 'resolver(| = 0; x)', title: 'Raízes de uma equação' },
    { label: 'taylor', ins: 'taylor(|; x; 0; 5)', title: 'Série de Taylor (expr; x; ponto; ordem)' },
  ];

  function insert(tpl: string) {
    const el = inputEl;
    const v = quick.input;
    const a = el?.selectionStart ?? v.length;
    const b = el?.selectionEnd ?? v.length;
    const sel = v.slice(a, b);
    const at = tpl.indexOf('|');
    const text = at < 0 ? tpl : tpl.slice(0, at) + sel + tpl.slice(at + 1);
    const caret = at < 0 ? a + text.length : a + at + sel.length;
    quick.input = v.slice(0, a) + text + v.slice(b);
    recall = -1;
    void tick().then(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  }

  function back() {
    const el = inputEl;
    const v = quick.input;
    const a = el?.selectionStart ?? v.length;
    const b = el?.selectionEnd ?? v.length;
    const from = a === b ? Math.max(0, a - 1) : a;
    quick.input = v.slice(0, from) + v.slice(b);
    void tick().then(() => {
      el?.focus();
      el?.setSelectionRange(from, from);
    });
  }

  function press(k: Key) {
    sound.play('tick');
    if (k.act) k.act();
    else if (k.ins) insert(k.ins);
  }

  function run() {
    if (!quick.input.trim()) return;
    const ok = quick.run();
    sound.play(ok ? 'create' : 'close');
    recall = -1;
    void tick().then(() => {
      logEl?.scrollTo({ top: logEl.scrollHeight });
      inputEl?.focus();
    });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    } else if (e.key === 'Escape') {
      quick.input = '';
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // volta pelas contas anteriores, como num terminal
      const n = quick.log.length;
      if (!n) return;
      e.preventDefault();
      recall = e.key === 'ArrowUp' ? (recall < 0 ? n - 1 : Math.max(0, recall - 1)) : recall < 0 ? -1 : recall + 1;
      if (recall >= n) recall = -1;
      quick.input = recall < 0 ? '' : quick.log[recall]!.expr;
    }
  }

  function reuse(text: string) {
    insert(text);
  }

  $effect(() => {
    void quick.log.length;
    logEl?.scrollTo({ top: logEl.scrollHeight });
  });
</script>

<div class="calc-q" class:sci={calcPrefs.sci}>
  <section class="screen">
    <div class="log" bind:this={logEl}>
      {#if !quick.log.length}
        <div class="hello">
          <p>Digite uma conta ou use o teclado. <kbd>Enter</kbd> calcula, <kbd>↑</kbd> volta nas anteriores.</p>
          <p>Vale tudo das folhas: <code>12,5% * 300</code>, <code>100 km/h em m/s</code>, <code>r = 3</code> e depois <code>pi * r^2</code>.</p>
        </div>
      {/if}
      {#each quick.log as l, i (i)}
        <div class="entry" class:error={l.error}>
          <button class="expr" onclick={() => (quick.input = l.expr)} title="Editar esta conta">{l.expr}</button>
          {#if l.error}
            <span class="res">{l.text}</span>
          {:else}
            <button class="res" onclick={() => reuse(l.text)} title="Usar este resultado">= {l.text}</button>
          {/if}
        </div>
      {/each}
    </div>
    <div class="entry-line">
      <input
        bind:this={inputEl}
        bind:value={quick.input}
        onkeydown={onkey}
        class="input"
        placeholder="2 + 2, derivada(x^3; x), somatorio(1/k^2; k; 1; 100)…"
        spellcheck="false"
        autocomplete="off"
        aria-label="Conta"
      />
      <p class="preview" class:err={live.kind === 'error'} aria-live="polite">
        {#if live.kind === 'error' && quick.input.trim()}{live.error}
        {:else if live.kind !== 'empty' && live.text}= {live.text}
        {:else}&nbsp;{/if}
      </p>
    </div>
  </section>

  <section class="pad">
    <div class="tools">
      <div class="t-seg" role="group" aria-label="Unidade de ângulo">
        <button class:on={quick.angle === 'rad'} onclick={() => quick.setAngle('rad')} title="sen, cos e tg em radianos">RAD</button>
        <button class:on={quick.angle === 'deg'} onclick={() => quick.setAngle('deg')} title="sen, cos e tg em graus">GRAU</button>
      </div>
      <button class="t-btn t-btn--sm" class:t-btn--on={calcPrefs.sci} onclick={() => calcPrefs.set({ sci: !calcPrefs.sci })}>Científica</button>
      <button class="t-btn t-btn--sm t-btn--quiet" onclick={() => quick.clear()} title="Esquece o histórico, as variáveis e o ans" disabled={!quick.log.length}>Limpar histórico</button>
    </div>

    {#if calcPrefs.sci}
      <div class="sci-keys">
      <p class="t-eyebrow">Cálculo</p>
      <div class="keys calc">
        {#each CALC as k (k.label)}<button class="key calc" title={k.title ?? k.ins} onclick={() => press(k)}>{k.label}</button>{/each}
      </div>
      <p class="t-eyebrow">Funções</p>
      <div class="keys fns">
        {#each SCI as k (k.label)}<button class="key fn" title={k.title ?? k.ins} onclick={() => press(k)}>{k.label}</button>{/each}
      </div>
      </div>
    {/if}
    <div class="keys basic">
      {#each BASIC as k (k.label)}
        <button class="key {k.tone ?? ''}" title={k.title} onclick={() => press(k)}>{k.label}</button>
      {/each}
    </div>
  </section>
</div>

<style>
  .calc-q { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(min(380px, 100%), 440px); }
  .screen { min-width: 0; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--line); }
  .log { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-6) var(--gutter) var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-3); }
  .hello { margin: auto 0 0; color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; }
  .hello p { margin: 0 0 6px; }
  kbd { font: 11px var(--f-mono); border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; background: var(--surface-2); }
  code { font: 12px var(--f-mono); color: var(--ember-soft); }
  .entry { display: grid; justify-items: end; gap: 2px; }
  .entry:first-child { margin-top: auto; }
  .entry button { border: 0; background: none; padding: 2px 6px; border-radius: var(--r-sm); text-align: right; max-width: 100%;
    overflow-wrap: anywhere; transition: background var(--dur), color var(--dur); }
  .entry button:hover { background: var(--surface-2); }
  .expr { font: var(--fs-sm) var(--f-mono); color: var(--muted); }
  .res { font: 500 var(--fs-xl) var(--f-mono); color: var(--ink); padding: 2px 6px; overflow-wrap: anywhere; text-align: right; }
  button.res:hover { color: var(--ember); }
  .entry.error .res { font-size: var(--fs-sm); color: var(--crit); }

  .entry-line { padding: var(--sp-3) var(--gutter) var(--sp-4); border-top: 1px solid var(--line); background: var(--surface); }
  .input { width: 100%; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--void); color: var(--ink);
    font: var(--fs-lg) var(--f-mono); padding: 10px 12px; outline: 0; transition: border-color var(--dur); text-align: right; }
  .input:focus { border-color: var(--ember); }
  .preview { margin: 6px 2px 0; min-height: 1.4em; text-align: right; font: var(--fs-md) var(--f-mono); color: var(--silver); overflow-wrap: anywhere; }
  .preview.err { color: var(--muted); font-size: var(--fs-xs); }

  .pad { min-width: 0; min-height: 0; overflow-y: auto; padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); }
  .tools { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-1); }
  .tools .t-seg button { font: 600 11px var(--f-mono); }
  .sci-keys { display: flex; flex-direction: column; gap: var(--sp-2); }
  .t-eyebrow { margin-top: var(--sp-1); }
  .keys { display: grid; gap: 6px; }
  .keys.basic { grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: var(--sp-2); }
  .keys.fns { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .keys.calc { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .key { min-height: var(--h-lg); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-2); color: var(--ink);
    font: 500 var(--fs-md) var(--f-mono); padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    transition: border-color var(--dur), color var(--dur), background var(--dur), transform 80ms; }
  .key:hover { border-color: var(--ember); }
  .key:active { transform: scale(.96); }
  .key.fn { background: var(--surface); color: var(--silver); font-size: var(--fs-sm); }
  .key.op { color: var(--ember); font-size: var(--fs-lg); }
  .key.calc { background: color-mix(in srgb, var(--ember) 8%, var(--surface)); color: var(--ember-soft); font-size: var(--fs-sm); }
  .key.main { background: var(--ember); border-color: var(--ember); color: var(--on-ember); font-size: var(--fs-lg); }
  .keys.basic .key { min-height: calc(var(--h-lg) + 6px); }

  @media (max-width: 720px) {
    .calc-q { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(140px, 1fr) auto; }
    .screen { border-right: 0; }
    .log { padding: var(--sp-3) var(--gutter); }
    .pad { overflow: visible; padding: var(--sp-3) var(--gutter) var(--sp-4); border-top: 1px solid var(--line); }
    .calc-q.sci { grid-template-rows: minmax(120px, 1fr) minmax(0, 60%); }
    .calc-q.sci .pad { overflow-y: auto; }
    /* no celular os números vêm primeiro; as teclas científicas ficam embaixo */
    .keys.basic { order: 1; margin-top: 0; }
    .sci-keys { order: 2; }
    .tools { order: 0; }
  }
</style>
