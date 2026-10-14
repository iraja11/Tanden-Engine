import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { engine } from './engine.svelte';
import { isTauri } from './storage-tauri';

// Procura versões novas nas releases do GitHub e instala sem reinstalar o app.
// No desktop o próprio app troca os arquivos e reinicia. No Android o sistema
// não deixa: o app abre o APK novo e o Android instala por cima, sem perder nada.

interface Available {
  version: string;
  /** desktop: baixa, instala e reinicia; Android: abre o APK */
  run: (onProgress: (p: number | null) => void) => Promise<void>;
}

class Updater {
  available = $state<Available | null>(null);
  progress = $state<number | null>(null);
  error = $state('');
  android = $state(false);

  async start(): Promise<void> {
    if (!isTauri()) return;
    const info = await invoke<{ os: string }>('release_info');
    this.android = info.os === 'android';
    void this.check();
    setInterval(() => void this.check(), 6 * 60 * 60 * 1000);
  }

  async check(): Promise<void> {
    try {
      this.available = this.android ? await this.checkAndroid() : await this.checkDesktop();
    } catch (e) {
      // sem internet ou atualizador ainda não configurado: tenta de novo mais tarde
      console.warn('Atualização indisponível:', e);
    }
  }

  private async checkDesktop(): Promise<Available | null> {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      run: async (onProgress) => {
        let total = 0, done = 0;
        await update.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? 0;
          else if (e.event === 'Progress') { done += e.data.chunkLength; onProgress(total ? done / total : null); }
        });
        await relaunch();
      },
    };
  }

  private async checkAndroid(): Promise<Available | null> {
    const r = await invoke<{ version: string; url: string } | null>('release_android_check');
    if (!r) return null;
    return { version: r.version, run: () => invoke('release_open_apk', { url: r.url }) };
  }

  async install(): Promise<void> {
    const update = this.available;
    if (!update) return;
    this.error = '';
    try {
      await engine.bus.process('update', `Baixando a versão ${update.version}`, () => update.run((p) => (this.progress = p)));
    } catch (e) {
      this.error = `Não consegui atualizar: ${e}`;
      this.progress = null;
    }
  }
}

export const updater = new Updater();
