// Onde os arquivos do cofre moram. Implementações: memória (testes),
// sistema de arquivos (desktop/dev) e Google Drive (próxima etapa).
export interface Storage {
  /** Caminhos relativos de todos os arquivos sob `prefix` (recursivo). */
  list(prefix?: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
export const toBytes = (s: string): Uint8Array => enc.encode(s);
export const fromBytes = (b: Uint8Array): string => dec.decode(b);

export async function readText(s: Storage, path: string): Promise<string | null> {
  const b = await s.read(path);
  return b === null ? null : fromBytes(b);
}

export class MemoryStorage implements Storage {
  readonly files = new Map<string, Uint8Array>();

  async list(prefix = ''): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async read(path: string): Promise<Uint8Array | null> {
    const b = this.files.get(path);
    return b ? b.slice() : null;
  }
  async write(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data.slice());
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
}
