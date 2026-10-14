// Armazenamento em disco (Node). Usado nos testes e no desenvolvimento;
// no app, o lado Rust do Tauri expõe o mesmo contrato.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { Storage } from './storage';

export class NodeFsStorage implements Storage {
  constructor(readonly root: string) {}

  async list(prefix = ''): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else out.push(relative(this.root, full).split(sep).join('/'));
      }
    };
    await walk(this.root);
    return out.filter((p) => p.startsWith(prefix)).sort();
  }
  async read(path: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(join(this.root, path)));
    } catch {
      return null;
    }
  }
  async write(path: string, data: Uint8Array): Promise<void> {
    const full = join(this.root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
  }
  async remove(path: string): Promise<void> {
    await rm(join(this.root, path), { force: true });
  }
}
