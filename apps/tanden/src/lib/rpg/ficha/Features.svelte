<script lang="ts">
  import { setSheetText } from '@tanden/core';
  import TextBlock from './TextBlock.svelte';
  import type { FichaCtx } from './ctx';

  // Características de classe, traços de espécie e talentos (seções da nota).
  let { x }: { x: FichaCtx } = $props();
  const c = $derived(x.c);
  const klass = $derived(c.classes.map((k) => `${k.info?.name ?? k.name} ${k.level}`).join(' / '));
</script>

<div class="feat">
  <div class="wide">
    <TextBlock title={`Características de classe${klass ? ` · ${klass}` : ''}`} value={c.texts.features} rows={12}
      placeholder={'Uma por parágrafo, com o nível em que veio:\n\nFúria (1º) — 2 usos por descanso longo. Vantagem em testes de Força…'}
      onsave={(v) => x.update((t) => setSheetText(t, 'features', v))} />
  </div>
  <TextBlock title={`Traços de espécie${c.species ? ` · ${c.species}` : ''}`} value={c.texts.traits} rows={8}
    placeholder="Visão no escuro, ancestralidade feérica, transe…" onsave={(v) => x.update((t) => setSheetText(t, 'traits', v))} />
  <TextBlock title="Talentos" value={c.texts.feats} rows={8}
    placeholder={`Talento de origem${c.background ? ` (${c.background})` : ''}, talentos gerais dos níveis 4, 8, 12…`} onsave={(v) => x.update((t) => setSheetText(t, 'feats', v))} />
</div>

<style>
  .feat { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 14px; }
  .wide { grid-column: 1 / -1; }
</style>
