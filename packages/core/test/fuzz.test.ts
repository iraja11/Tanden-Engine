import { describe, expect, it } from 'vitest';
import { MemoryRemote, MemoryStorage, Replicator, Vault, fullSync, readText, toBytes } from '../src/index';

// Teste de estresse: aparelhos editando, Drive e Obsidian mexendo no .md,
// syncs em ordem aleatória. No fim, todos precisam concordar, e nada inserido some.

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

async function scenario(seed: number, withDeletes: boolean) {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const drive = new MemoryRemote();
  const devices = ['arch', 'redmi', 'win'].map((id) => {
    const disk = new MemoryStorage();
    const vault = new Vault(disk, id);
    return { id, disk, vault, sync: () => fullSync(vault, new Replicator(disk, drive, id)) };
  });
  const tokens: string[] = [];
  let n = 0;
  const token = () => {
    // um caractere único por inserção: não dá para picotar nem confundir
    const t = String.fromCharCode(0x4e00 + ++n);
    tokens.push(t);
    return t;
  };
  const insertAt = (text: string, t: string) => {
    const lines = text.split('\n');
    const i = Math.floor(rand() * (lines.length + 1));
    lines.splice(i, 0, t);
    return lines.join('\n');
  };

  devices[0]!.vault.create('n.md', 'início\n');
  await devices[0]!.sync();
  for (const d of devices.slice(1)) await d.sync();

  for (let step = 0; step < STEPS; step++) {
    const d = pick(devices);
    const r = rand();
    if (r < 0.35) {
      if (!d.vault.has('n.md')) continue;
      const cur = d.vault.read('n.md');
      if (withDeletes && rand() < 0.3 && cur.length > 4) {
        const at = Math.floor(rand() * (cur.length - 2));
        d.vault.edit('n.md', (t) => t.delete(at, 2));
      } else d.vault.write('n.md', insertAt(cur, token()));
    } else if (r < 0.45) {
      const cur = drive.text('n.md');
      if (cur !== null) await drive.editText('n.md', insertAt(cur, token())); // editor do Drive
    } else if (r < 0.55) {
      const cur = await readText(d.disk, 'n.md');
      if (cur !== null) await d.disk.write('n.md', toBytes(insertAt(cur, token()))); // Obsidian
    } else {
      await d.sync();
    }
  }
  for (let round = 0; round < 3; round++) for (const d of devices) await d.sync();

  const texts = devices.map((d) => d.vault.read('n.md'));
  return { texts, drive: drive.text('n.md'), tokens };
}

// FUZZ_SEEDS=200 pnpm test roda uma bateria maior
const SEEDS = Number(process.env.FUZZ_SEEDS ?? 10);
const STEPS = Number(process.env.FUZZ_STEPS ?? 60);

describe('estresse de sync', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`só inserções (semente ${seed}): converge e não perde nada`, async () => {
      const { texts, drive, tokens } = await scenario(seed, false);
      expect(new Set(texts).size).toBe(1);
      expect(drive).toBe(texts[0]);
      for (const t of tokens) {
        expect(texts[0]).toContain(t);
        expect(texts[0]!.split(t).length - 1).toBe(1); // sem duplicar
      }
    });
    it(`com apagamentos (semente ${seed}): converge`, async () => {
      const { texts, drive } = await scenario(seed + 100000, true);
      expect(new Set(texts).size).toBe(1);
      expect(drive).toBe(texts[0]);
    });
  }
});
