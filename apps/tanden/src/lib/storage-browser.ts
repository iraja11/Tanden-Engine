import type { Storage } from '@tanden/core';

// Armazenamento no navegador (versão web e desenvolvimento): IndexedDB, chave = caminho.
export class BrowserStorage implements Storage {
  private db: Promise<IDBDatabase>;

  constructor(name = 'tanden-vault') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const req = fn(db.transaction('files', mode).objectStore('files'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async list(prefix = ''): Promise<string[]> {
    const keys = (await this.tx('readonly', (s) => s.getAllKeys())) as string[];
    return keys.filter((k) => k.startsWith(prefix)).sort();
  }
  async read(path: string): Promise<Uint8Array | null> {
    const v = (await this.tx('readonly', (s) => s.get(path))) as Uint8Array | undefined;
    return v ?? null;
  }
  async write(path: string, data: Uint8Array): Promise<void> {
    await this.tx('readwrite', (s) => s.put(data, path));
  }
  async remove(path: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(path));
  }
}
