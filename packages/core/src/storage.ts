// Onde os arquivos do cofre moram. Implementações: memória (testes),
// sistema de arquivos (desktop/dev) e Google Drive (próxima etapa).
export interface Storage {
  /** Caminhos relativos de todos os arquivos sob `prefix` (recursivo). */
  list(prefix?: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /**
   * Opcional: assinatura (tamanho + data de modificação) e data em ms de cada
   * arquivo, numa chamada só. Com ela o replicador não relê arquivos que não
   * mudaram, o que importa com PDFs e imagens grandes.
   */
  stat?(): Promise<Record<string, [sig: string, mtimeMs: number]>>;
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
  /** quantas leituras cada arquivo teve (para testes) */
  readonly reads = new Map<string, number>();
  private mtimes = new Map<string, number>();
  private clock = 0;

  async list(prefix = ''): Promise<string[]> {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort();
  }
  async read(path: string): Promise<Uint8Array | null> {
    this.reads.set(path, (this.reads.get(path) ?? 0) + 1);
    const b = this.files.get(path);
    return b ? b.slice() : null;
  }
  async write(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, data.slice());
    this.mtimes.set(path, ++this.clock);
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
    this.mtimes.delete(path);
  }
  /** relógio lógico: cada gravação é "mais nova" e nunca está no futuro */
  async stat(): Promise<Record<string, [string, number]>> {
    const out: Record<string, [string, number]> = {};
    for (const [p, b] of this.files) out[p] = [`${b.length}:${this.mtimes.get(p) ?? 0}`, 0];
    return out;
  }
}
