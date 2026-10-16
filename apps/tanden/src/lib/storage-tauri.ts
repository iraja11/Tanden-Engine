import { invoke } from '@tauri-apps/api/core';
import type { Storage } from '@tanden/core';

// Armazenamento no app (Linux, Windows, Android): a pasta do cofre, via comandos Rust.
// Os bytes vão e voltam crus (sem JSON), o que importa para PDFs e imagens grandes.
// Exceção: o WebView do Android não lê o corpo cru do IPC, então lá a escrita vai em base64.
export const android = /Android/i.test(navigator.userAgent);

const toB64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096));
  return btoa(s);
};

export class TauriStorage implements Storage {
  list(prefix = ''): Promise<string[]> {
    return invoke('vault_list', { prefix });
  }
  async read(path: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await invoke<ArrayBuffer>('vault_read_raw', { path }));
    } catch (e) {
      if (String(e).includes('ENOENT')) return null;
      throw e;
    }
  }
  write(path: string, data: Uint8Array): Promise<void> {
    if (android) return invoke('vault_write_b64', { path, data: toB64(data) });
    return invoke('vault_write_raw', data, { headers: { path: encodeURIComponent(path) } });
  }
  remove(path: string): Promise<void> {
    return invoke('vault_remove', { path });
  }
  stat(): Promise<Record<string, [string, number]>> {
    return invoke('vault_stat');
  }
}

export const vaultRoot = (): Promise<string> => invoke('vault_root');
export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;
