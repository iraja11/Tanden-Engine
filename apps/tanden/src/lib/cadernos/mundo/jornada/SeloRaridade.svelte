<script lang="ts">
  import { infoRaridade, type Profundidade } from '@tanden/core';

  // Selo da raridade de uma ficha: mede profundidade, não sorte.
  let { p, compacto = false }: { p: Profundidade; compacto?: boolean } = $props();
  const info = $derived(infoRaridade(p.raridade));
  const dica = $derived(p.proxima ? `${info.label} · ${p.pontos} de 100 pontos. Faltam ${p.proxima.faltam} para ${infoRaridade(p.proxima.raridade).label}. ${p.dica}` : `${info.label} · ${p.pontos} de 100 pontos.`);
</script>

<span class="selo {p.raridade}" class:compacto style:--r={info.cor} title={dica}>
  <i aria-hidden="true"></i>{#if !compacto}{info.label}{:else}<span class="sr">{info.label}</span>{/if}
</span>

<style>
  .selo { display: inline-flex; align-items: center; gap: 5px; flex: none; padding: 1px 8px 1px 6px; border-radius: var(--r-pill); font: 600 10.5px/1.6 var(--f-display); letter-spacing: .05em;
    color: var(--r); border: 1px solid color-mix(in srgb, var(--r) 45%, transparent); background: color-mix(in srgb, var(--r) 11%, transparent); }
  .selo.compacto { padding: 3px; border-color: transparent; background: none; }
  i { width: 8px; height: 8px; rotate: 45deg; border-radius: 1.5px; background: var(--r); }
  .epica i, .lendaria i { box-shadow: 0 0 7px var(--r); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
