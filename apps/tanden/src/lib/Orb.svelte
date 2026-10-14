<script lang="ts">
  // Símbolo tanden. Só gira enquanto algum processo trabalha.
  let { busy = false, size = 44, onclick }: { busy?: boolean; size?: number; onclick?: () => void } = $props();
</script>

<button class="orb" class:busy style:width="{size}px" style:height="{size}px" {onclick}
  aria-label={busy ? 'Trabalhando' : 'Sincronizar agora'} title={busy ? 'Trabalhando…' : 'Sincronizar agora'}>
  <svg viewBox="-60 -60 120 120" aria-hidden="true">
    <circle r="57" fill="none" stroke="var(--ember)" stroke-width="2.5" />
    <circle r="50" fill="#0b0b0d" stroke="var(--silver)" stroke-width="1.5" />
    <path d="M0,-50 A50,50 0 0 1 0,50 A25,25 0 0 1 0,0 A25,25 0 0 0 0,-50 Z" fill="#ecebf0" />
    <circle cy="-25" r="7.5" fill="#ecebf0" />
    <circle cy="25" r="7.5" fill="#0b0b0d" />
    <circle cy="25" r="3" fill="var(--ember)" />
  </svg>
</button>

<style>
  .orb { border: 0; padding: 0; background: none; border-radius: 50%; flex: none; }
  svg { width: 100%; height: 100%; display: block; filter: drop-shadow(0 0 6px var(--ember-glow)); transition: filter .3s; }
  .busy svg { animation: spin 1.1s linear infinite; filter: drop-shadow(0 0 14px var(--ember)); }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
