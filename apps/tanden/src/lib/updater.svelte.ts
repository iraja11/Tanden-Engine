import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { engine } from './engine.svelte';
import { isTauri } from './storage-tauri';

// Procura versões novas nas releases do GitHub e instala sem reinstalar o app.
class Updater {
  available = $state<Update | null>(null);
  progress = $state<number | null>(null);
  error = $state('');

  start(): void {
    if (!isTauri()) return;
    void this.check();
    setInterval(() => void this.check(), 6 * 60 * 60 * 1000);
  }

  async check(): Promise<void> {
    try {
      this.available = await check();
    } catch (e) {
      // sem internet ou atualizador ainda não configurado: tenta de novo mais tarde
      console.warn('Atualização indisponível:', e);
    }
  }

  async install(): Promise<void> {
    const update = this.available;
    if (!update) return;
    this.error = '';
    try {
      await engine.bus.process('update', `Baixando a versão ${update.version}`, async () => {
        let total = 0, done = 0;
        await update.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? 0;
          else if (e.event === 'Progress') { done += e.data.chunkLength; this.progress = total ? done / total : null; }
        });
      });
      await relaunch();
    } catch (e) {
      this.error = `Não consegui atualizar: ${e}`;
      this.progress = null;
    }
  }
}

export const updater = new Updater();
