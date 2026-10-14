<script lang="ts">
  import { engine } from './engine.svelte';
  import { google } from './google.svelte';

  // Conectar o Google Drive: colar a credencial (uma vez) e entrar com a conta.
  let { onclose }: { onclose: () => void } = $props();
  let clientId = $state('');
  let clientSecret = $state('');

  async function saveCreds(e: SubmitEvent) {
    e.preventDefault();
    await google.setCredentials(clientId, clientSecret);
  }
  async function signIn() {
    if (await google.signIn()) {
      engine.connectDrive();
      void engine.syncNow();
    }
  }
  async function signOut() {
    await google.signOut();
    engine.connectDrive();
  }
</script>

<div class="panel" role="dialog" aria-label="Google Drive">
  <header><h3>Google Drive</h3><button class="x" onclick={onclose} aria-label="Fechar">×</button></header>

  {#if !google.available}
    <p>O sync com o Drive funciona no app instalado (Linux, Windows, Android). A versão web chega depois.</p>
  {:else if google.status.signed_in}
    <p>Conectado como <b>{google.status.email ?? 'sua conta'}</b>. As notas ficam na pasta <b>Tanden</b> do seu Drive.</p>
    {#if engine.driveError}<p class="err">Última tentativa falhou: {engine.driveError}</p>{/if}
    <div class="row">
      <button class="pri" onclick={() => engine.syncNow()}>Sincronizar agora</button>
      <button onclick={signOut}>Desconectar</button>
    </div>
  {:else if !google.status.configured}
    <p>Cole a credencial "App para computador" que você criou no Google Cloud. Só precisa fazer isso uma vez.</p>
    <form onsubmit={saveCreds}>
      <label for="gid">Client ID</label>
      <input id="gid" bind:value={clientId} placeholder="…apps.googleusercontent.com" autocomplete="off" required />
      <label for="gsecret">Client secret</label>
      <input id="gsecret" bind:value={clientSecret} type="password" autocomplete="off" required />
      <button class="pri" type="submit">Salvar</button>
    </form>
  {:else}
    <p>O navegador vai abrir para você entrar com sua conta Google e permitir que o Tanden crie e edite a própria pasta no seu Drive. Ele não vê o resto do seu Drive.</p>
    {#if google.error}<p class="err">{google.error}</p>{/if}
    <button class="pri" onclick={signIn} disabled={google.busy}>{google.busy ? 'Esperando o navegador…' : 'Entrar com Google'}</button>
  {/if}
</div>

<style>
  .panel { position: absolute; right: 16px; bottom: 40px; z-index: 10; width: min(360px, calc(100vw - 32px));
    background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px;
    box-shadow: 0 20px 50px -20px #000, 0 0 0 1px var(--ember-glow); display: grid; gap: 10px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h3 { margin: 0; font: 600 12px/1 var(--f-display); letter-spacing: .16em; text-transform: uppercase; color: var(--ember); }
  .x { border: 0; background: none; font-size: 20px; color: var(--muted); }
  p { margin: 0; color: var(--muted); }
  b { color: var(--ink); font-weight: 600; }
  form { display: grid; gap: 6px; }
  label { font: 11px var(--f-mono); color: var(--muted); }
  input { background: var(--surface-2); border: 1px solid var(--line); border-radius: 9px; padding: 8px 10px; color: var(--ink); font: inherit; }
  .row { display: flex; gap: 8px; }
  button { border: 1px solid var(--line); background: var(--surface-2); border-radius: 9px; padding: 7px 12px; }
  .pri { background: var(--ember); border-color: var(--ember); color: #160b03; font-weight: 600; }
  .pri:disabled { opacity: .6; }
  .err { color: var(--crit); }
</style>
