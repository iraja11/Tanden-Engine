import { describe, expect, it } from 'vitest';
import { MemoryRemote, MemoryStorage, Replicator, Vault, fullSync, readText } from '../src/index';

// Dois aparelhos na mesma pasta, e dois aparelhos passando pelo Drive.
function pair() {
  const drive = new MemoryStorage();
  return { drive, phone: new Vault(drive, 'redmi'), pc: new Vault(drive, 'arch') };
}

function device(drive: MemoryRemote, id: string) {
  const disk = new MemoryStorage();
  const vault = new Vault(disk, id);
  const replicator = new Replicator(disk, drive, id);
  return { disk, vault, replicator, sync: () => fullSync(vault, replicator) };
}

describe('Vault: apagar e renomear', () => {
  it('apaga a nota, guarda uma cópia em .trash/ e não volta no sync', async () => {
    const { drive, pc } = pair();
    pc.create('ideia.md', 'texto importante');
    await pc.sync();
    const trashed = await pc.remove('ideia.md');
    expect(trashed).toBe('.trash/ideia.md');
    expect(await readText(drive, '.trash/ideia.md')).toBe('texto importante');
    expect(pc.has('ideia.md')).toBe(false);
    await pc.sync();
    await pc.sync();
    expect(pc.has('ideia.md')).toBe(false);
    expect(await readText(drive, 'ideia.md')).toBeNull();
    expect(pc.list()).not.toContain('.trash/ideia.md');
  });

  it('o outro aparelho apaga também no próximo sync', async () => {
    const { drive, phone, pc } = pair();
    pc.create('a.md', 'x');
    await pc.sync();
    await phone.sync();
    expect(phone.has('a.md')).toBe(true);
    const seen: string[] = [];
    phone.bus.on('note.deleted', (e) => seen.push(e.path));
    await pc.remove('a.md');
    await pc.sync();
    await phone.sync();
    expect(phone.has('a.md')).toBe(false);
    expect(seen).toEqual(['a.md']);
    expect(await readText(drive, 'a.md')).toBeNull();
  });

  it('uma edição feita ao mesmo tempo em outro aparelho ressuscita a nota, sem perder nada', async () => {
    const { phone, pc } = pair();
    pc.create('a.md', 'base');
    await pc.sync();
    await phone.sync();
    // o celular edita offline enquanto o PC apaga
    phone.write('a.md', 'base + ideia do celular');
    await pc.remove('a.md');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(phone.read('a.md')).toBe('base + ideia do celular');
    expect(pc.read('a.md')).toBe('base + ideia do celular');
  });

  it('criar de novo no mesmo caminho começa do zero, sem o texto apagado', async () => {
    const { drive, phone, pc } = pair();
    pc.create('Nova nota.md', 'velho');
    await pc.sync();
    await phone.sync();
    await pc.remove('Nova nota.md');
    pc.create('Nova nota.md', 'novo');
    await pc.sync();
    await pc.sync();
    expect(pc.read('Nova nota.md')).toBe('novo');
    // o celular ainda tinha a versão velha: ela morre e a nova chega
    await phone.sync();
    expect(await readText(drive, 'Nova nota.md')).toBe('novo');
    await pc.sync();
    await phone.sync();
    expect(phone.read('Nova nota.md')).toBe('novo');
    expect(pc.read('Nova nota.md')).toBe('novo');
  });

  it('um .md novo criado fora do Tanden depois de apagar vira nota nova', async () => {
    const { drive, pc } = pair();
    pc.create('x.md', 'antigo');
    await pc.sync();
    await pc.remove('x.md');
    await pc.sync();
    await drive.write('x.md', new TextEncoder().encode('escrito no Obsidian'));
    await pc.sync();
    expect(pc.read('x.md')).toBe('escrito no Obsidian');
  });

  it('renomeia levando o texto e some com o nome antigo nos dois aparelhos', async () => {
    const { drive, phone, pc } = pair();
    pc.create('rascunho.md', 'conteúdo');
    await pc.sync();
    await phone.sync();
    await pc.rename('rascunho.md', 'Projetos/Plano.md');
    await pc.sync();
    await phone.sync();
    expect(phone.list()).toEqual(['Projetos/Plano.md']);
    expect(phone.read('Projetos/Plano.md')).toBe('conteúdo');
    expect(await readText(drive, 'rascunho.md')).toBeNull();
    expect(await readText(drive, '.trash/rascunho.md')).toBeNull();
  });

  it('notas antigas, sem geração, também podem ser apagadas', async () => {
    const { drive, pc } = pair();
    pc.create('velha.md', 'oi');
    await pc.sync();
    // simula metadados gravados por uma versão anterior do app
    for (const f of await drive.list('.tanden/crdt/')) {
      if (!f.endsWith('.json')) continue;
      const m = JSON.parse((await readText(drive, f))!) as Record<string, unknown>;
      delete m.gen;
      await drive.write(f, new TextEncoder().encode(JSON.stringify(m)));
    }
    const fresh = new Vault(drive, 'arch');
    await fresh.sync();
    await fresh.remove('velha.md');
    await fresh.sync();
    const other = new Vault(drive, 'redmi');
    await other.sync();
    expect(other.has('velha.md')).toBe(false);
  });
});

describe('Apagar passando pelo Drive', () => {
  it('a nota apagada some do Drive e do celular, e a cópia fica na lixeira', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.vault.create('lista.md', 'compras');
    await pc.sync();
    await phone.sync();
    expect(phone.vault.read('lista.md')).toBe('compras');

    await pc.vault.remove('lista.md');
    await pc.sync();
    expect(drive.text('lista.md')).toBeNull();
    expect(drive.text('.trash/lista.md')).toBe('compras');

    await phone.sync();
    await phone.sync();
    expect(phone.vault.has('lista.md')).toBe(false);
    expect(await readText(phone.disk, 'lista.md')).toBeNull();
    await pc.sync();
    expect(drive.text('lista.md')).toBeNull();
    expect(pc.vault.has('lista.md')).toBe(false);
  });

  it('não apaga nada no Drive quando a pasta local some inteira', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    for (let i = 0; i < 30; i++) pc.vault.create(`n${i}.md`, `nota ${i}`);
    await pc.sync();
    for (const p of await pc.disk.list()) if (!p.startsWith('.tanden/local/')) await pc.disk.remove(p);
    await pc.replicator.sync();
    expect(drive.text('n7.md')).toBe('nota 7');
  });
});

describe('Apagar fora do Tanden (Obsidian, terminal)', () => {
  it('um .md apagado na pasta vira um apagar de verdade, com cópia na lixeira', async () => {
    const { drive, phone, pc } = pair();
    pc.create('rascunho.md', 'texto');
    await pc.sync();
    await phone.sync();
    await drive.remove('rascunho.md');
    const seen: string[] = [];
    pc.bus.on('note.deleted', (e) => seen.push(e.path));
    await pc.sync();
    expect(pc.has('rascunho.md')).toBe(false);
    expect(seen).toEqual(['rascunho.md']);
    expect(await readText(drive, '.trash/rascunho.md')).toBe('texto');
    await phone.sync();
    await pc.sync();
    expect(phone.has('rascunho.md')).toBe(false);
    expect(await readText(drive, 'rascunho.md')).toBeNull();
  });

  it('vale também depois de reabrir o app', async () => {
    const disk = new MemoryStorage();
    const before = new Vault(disk, 'arch');
    before.create('x.md', 'conteúdo');
    await before.sync();
    await disk.remove('x.md');
    const after = new Vault(disk, 'arch');
    await after.sync();
    expect(after.has('x.md')).toBe(false);
    await after.sync();
    expect(await readText(disk, 'x.md')).toBeNull();
  });

  it('renomear no Obsidian não deixa cópia na lixeira', async () => {
    const disk = new MemoryStorage();
    const v = new Vault(disk, 'arch');
    v.create('velho.md', 'mesmo texto');
    await v.sync();
    await disk.remove('velho.md');
    await disk.write('novo.md', new TextEncoder().encode('mesmo texto'));
    await v.sync();
    expect(v.list()).toEqual(['novo.md']);
    expect(await disk.list('.trash/')).toEqual([]);
  });

  it('edição chegando de outro aparelho ao mesmo tempo ressuscita a nota', async () => {
    const { drive, phone, pc } = pair();
    pc.create('a.md', 'base');
    await pc.sync();
    await phone.sync();
    phone.write('a.md', 'base + celular');
    await phone.sync();
    await drive.remove('a.md');
    await pc.sync();
    expect(pc.read('a.md')).toBe('base + celular');
    expect(await readText(drive, 'a.md')).toBe('base + celular');
  });

  it('muitas notas sumindo de uma vez não apagam nada', async () => {
    const disk = new MemoryStorage();
    const v = new Vault(disk, 'arch');
    for (let i = 0; i < 30; i++) v.create(`n${i}.md`, `nota ${i}`);
    await v.sync();
    for (let i = 0; i < 30; i++) await disk.remove(`n${i}.md`);
    await v.sync();
    expect(v.list()).toHaveLength(30);
    expect(await readText(disk, 'n7.md')).toBe('nota 7');
  });
});
