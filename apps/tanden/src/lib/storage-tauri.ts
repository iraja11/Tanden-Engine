import { invoke } from '@tauri-apps/api/core';
import type { Storage } from '@tanden/core';

// Armazenamento no app (Linux, Windows, Android): a pasta do cofre, via comandos Rust.
export class TauriStorage implements Storage {
  list(prefix = ''): Promise<string[]> {
    return invoke('vault_list', { prefix });
  }
  async read(path: string): Promise<Uint8Array | null> {
    const data = await invoke<number[] | null>('vault_read', { path });
    return data ? Uint8Array.from(data) : null;
  }
  write(path: string, data: Uint8Array): Promise<void> {
    return invoke('vault_write', { path, data: Array.from(data) });
  }
  remove(path: string): Promise<void> {
    return invoke('vault_remove', { path });
  }
}

export const vaultRoot = (): Promise<string> => invoke('vault_root');
export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;
