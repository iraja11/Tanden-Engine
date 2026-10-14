<script lang="ts">
  import { onDestroy } from 'svelte';
  import { plugins, type PluginEntry } from './plugins.svelte';
  import { theme } from '../theme.svelte';

  // Janela isolada de um plugin. Sem "allow-same-origin": a página não vê o
  // app, os cookies nem o armazenamento dele; só conversa por mensagens.

  let { entry, visible }: { entry: PluginEntry; visible: boolean } = $props();

  let frame = $state<HTMLIFrameElement>();
  let source = $state<{ src: string } | { srcdoc: string } | null>(null);
  let loads = 0;
  const id = $derived(entry.manifest.id);

  $effect(() => {
    const e = entry;
    loads = 0;
    void plugins.frameSource(e).then((s) => (source = s)).catch((err) => {
      plugins.errors = { ...plugins.errors, [e.manifest.id]: `não consegui abrir o plugin: ${err}` };
    });
  });

  function onload() {
    if (!frame?.contentWindow) return;
    // a página do plugin só carrega uma vez; se ela navegar para outro lugar, é fechada
    if (++loads > 1) {
      plugins.errors = { ...plugins.errors, [id]: 'o plugin tentou sair da própria página e foi fechado' };
      plugins.detach(id);
      source = null;
      return;
    }
    plugins.attach(entry, frame.contentWindow);
  }

  const onMessage = (e: MessageEvent) => {
    if (!frame || e.source !== frame.contentWindow) return;
    void plugins.handle(id, e.data);
  };
  addEventListener('message', onMessage);
  onDestroy(() => {
    removeEventListener('message', onMessage);
    plugins.detach(id);
  });

  $effect(() => {
    theme.rev;
    plugins.broadcastTheme();
  });
  $effect(() => {
    plugins.visible(id, visible);
  });
</script>

{#if source}
  <iframe
    bind:this={frame}
    title={entry.manifest.nome}
    sandbox="allow-scripts allow-modals allow-downloads"
    referrerpolicy="no-referrer"
    allow="clipboard-write"
    {...source}
    {onload}
  ></iframe>
{/if}

<style>
  iframe { display: block; width: 100%; height: 100%; border: 0; background: var(--void); }
</style>
