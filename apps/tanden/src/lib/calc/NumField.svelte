<script lang="ts">
  import { parseNumberBR } from '@tanden/core';

  /*
   * Campo de número à brasileira (1.234,56). Guarda o texto como foi digitado;
   * quem usa lê com parseNumberBR. Fica vermelho se não for número.
   */

  let { label, value = $bindable(''), prefix = '', suffix = '', hint = '', placeholder = '0' }: {
    label: string;
    value?: string;
    prefix?: string;
    suffix?: string;
    hint?: string;
    placeholder?: string;
  } = $props();

  const bad = $derived(value.trim() !== '' && Number.isNaN(parseNumberBR(value)));
</script>

<label class="nf" class:bad>
  {#if label || hint}<span class="lbl">{label}{#if hint}<small>{hint}</small>{/if}</span>{/if}
  <span class="box">
    {#if prefix}<i>{prefix}</i>{/if}
    <input bind:value inputmode="decimal" {placeholder} spellcheck="false" autocomplete="off" />
    {#if suffix}<i>{suffix}</i>{/if}
  </span>
</label>

<style>
  .nf { display: grid; gap: 4px; min-width: 0; }
  .lbl { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: var(--fs-sm); color: var(--silver); }
  .lbl small { font-size: var(--fs-xs); color: var(--muted); }
  .box { display: flex; align-items: center; gap: 6px; min-height: var(--h-md); padding: 0 10px; border: 1px solid var(--line); border-radius: var(--r-md);
    background: var(--void); transition: border-color var(--dur); }
  .box:focus-within { border-color: var(--ember); }
  .box i { font: normal var(--fs-sm) var(--f-mono); color: var(--muted); white-space: nowrap; }
  input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--ink); font: var(--fs-md) var(--f-mono); padding: 6px 0; }
  .bad .box { border-color: var(--crit); }
</style>
