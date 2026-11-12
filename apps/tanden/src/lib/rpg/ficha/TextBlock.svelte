<script lang="ts">
  // Bloco de texto livre da ficha (uma seção da nota), em papel quadriculado.
  let { title, value, placeholder = '', rows = 6, onsave }: {
    title: string;
    value: string;
    placeholder?: string;
    rows?: number;
    onsave: (v: string) => void;
  } = $props();

  let draft = $state('');
  let focused = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    // segue a nota enquanto ninguém está digitando aqui
    if (!focused) draft = value;
  });

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (draft !== value) onsave(draft);
  }
  function oninput() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 700);
  }
</script>

<section class="tb">
  <h4>{title}</h4>
  <textarea class="grid-paper" bind:value={draft} {placeholder} {rows} aria-label={title}
    onfocus={() => (focused = true)} onblur={() => { focused = false; flush(); }} {oninput}></textarea>
</section>

<style>
  .tb { display: grid; gap: 6px; min-width: 0; }
  h4 { margin: 0; font: 600 10.5px var(--f-display); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); text-align: center;
    padding-bottom: 6px; border-bottom: 1px solid var(--line); }
  textarea { width: 100%; resize: vertical; border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; color: var(--ink);
    font: 13.5px/24px var(--f-body); min-height: 96px; box-sizing: border-box; }
  textarea:focus { outline: none; border-color: var(--ember); }
  .grid-paper {
    background-color: var(--void);
    background-image:
      linear-gradient(color-mix(in srgb, var(--line) 55%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--line) 35%, transparent) 1px, transparent 1px);
    background-size: 24px 24px;
    background-position: -1px 8px;
    background-attachment: local;
  }
</style>
