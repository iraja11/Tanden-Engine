import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, Vault, readText, toBytes, type TandenEvent } from '../src/index';
import { NodeFsStorage } from '../src/node';

// Dois aparelhos apontando para a mesma pasta (o "Drive").
function pair() {
  const drive = new MemoryStorage();
  return { drive, phone: new Vault(drive, 'redmi'), pc: new Vault(drive, 'arch') };
}

describe('Vault: um aparelho', () => {
  it('cria a nota e grava o .md legível e o estado CRDT', async () => {
    const { drive, pc } = pair();
    pc.create('ideias/seth.md', '# Seth\n\nTanden Engine.');
    await pc.sync();
    expect(await readText(drive, 'ideias/seth.md')).toBe('# Seth\n\nTanden Engine.');
    const files = await drive.list('.tanden/crdt/');
    expect(files.some((f) => f.endsWith('/arch.bin'))).toBe(true);
    expect(files.some((f) => f.endsWith('/arch.json'))).toBe(true);
  });

  it('não reescreve nada quando não houve mudança', async () => {
    const { pc } = pair();
    pc.create('a.md', 'x');
    expect((await pc.sync()).written).toBe(1);
    expect((await pc.sync()).written).toBe(0);
  });
});

describe('Vault: merge entre aparelhos', () => {
  it('funde edições offline feitas em partes diferentes da nota', async () => {
    const { drive, phone, pc } = pair();
    pc.create('agenda.md', 'Segunda: aula\nTerça: estágio\n');
    await pc.sync();
    await phone.sync();
    expect(phone.read('agenda.md')).toBe('Segunda: aula\nTerça: estágio\n');

    // os dois editam sem internet
    pc.write('agenda.md', 'Segunda: aula de Cálculo\nTerça: estágio\n');
    phone.write('agenda.md', 'Segunda: aula\nTerça: estágio\nQuarta: treino SF5\n');

    await pc.sync();
    await phone.sync();
    await pc.sync();

    const expected = 'Segunda: aula de Cálculo\nTerça: estágio\nQuarta: treino SF5\n';
    expect(pc.read('agenda.md')).toBe(expected);
    expect(phone.read('agenda.md')).toBe(expected);
    expect(await readText(drive, 'agenda.md')).toBe(expected);
  });

  it('converge quando os dois digitam no mesmo lugar, sem perder nenhum texto', async () => {
    const { phone, pc } = pair();
    pc.create('n.md', 'início fim');
    await pc.sync();
    await phone.sync();
    pc.edit('n.md', (t) => t.insert(7, 'PC '));
    phone.edit('n.md', (t) => t.insert(7, 'CEL '));
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.read('n.md')).toBe(phone.read('n.md'));
    expect(pc.read('n.md')).toContain('PC ');
    expect(pc.read('n.md')).toContain('CEL ');
  });

  it('recebe notas criadas no outro aparelho', async () => {
    const { phone, pc } = pair();
    phone.create('diario/2026-10-14.md', 'Ideia no ônibus');
    await phone.sync();
    await pc.sync();
    expect(pc.list()).toEqual(['diario/2026-10-14.md']);
    expect(pc.read('diario/2026-10-14.md')).toBe('Ideia no ônibus');
  });

  it('não confunde o .md escrito por outro aparelho com uma edição externa', async () => {
    const { drive, phone, pc } = pair();
    pc.create('n.md', 'linha 1\n');
    await pc.sync();
    await phone.sync();
    phone.write('n.md', 'linha 1\nlinha do celular\n');
    await phone.sync(); // o celular reescreve o .md
    pc.write('n.md', 'linha 0\nlinha 1\n');
    const r = await pc.sync(); // o PC vê um .md diferente, mas sabe que foi o celular
    expect(r.external).toBe(0);
    expect(pc.read('n.md')).toBe('linha 0\nlinha 1\nlinha do celular\n');
    expect(await readText(drive, 'n.md')).toBe('linha 0\nlinha 1\nlinha do celular\n');
  });
});

describe('Vault: edições feitas fora do Tanden (Obsidian, Drive)', () => {
  it('incorpora a edição externa junto com edições locais ainda não sincronizadas', async () => {
    const { drive, pc } = pair();
    pc.create('mundo/aurath.md', 'Continente: Aurath\nClima: árido\n');
    await pc.sync();

    // alguém edita o .md no Obsidian...
    await drive.write('mundo/aurath.md', toBytes('Continente: Aurath\nClima: árido\nCapital: Veyra\n'));
    // ...enquanto o Tanden edita outra parte
    pc.write('mundo/aurath.md', 'Continente de Aurath\nClima: árido\n');

    const r = await pc.sync();
    expect(r.external).toBe(1);
    expect(pc.read('mundo/aurath.md')).toBe('Continente de Aurath\nClima: árido\nCapital: Veyra\n');
  });

  it('importa um .md novo sem duplicar quando dois aparelhos o veem pela primeira vez', async () => {
    const { drive, phone, pc } = pair();
    await drive.write('obsidian/antiga.md', toBytes('Nota que já existia no Obsidian'));
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.read('obsidian/antiga.md')).toBe('Nota que já existia no Obsidian');
    expect(phone.read('obsidian/antiga.md')).toBe('Nota que já existia no Obsidian');
  });

  it('não duplica quando dois aparelhos detectam a mesma edição externa', async () => {
    const { drive, phone, pc } = pair();
    pc.create('n.md', 'A\n');
    await pc.sync();
    await phone.sync();
    await drive.write('n.md', toBytes('A\nB externo\n'));
    await pc.sync();
    // o celular ainda não viu o estado novo do PC? veja o pior caso:
    // ele lê o .md já reescrito pelo PC e o estado do PC, sem duplicar
    await phone.sync();
    await pc.sync();
    expect(pc.read('n.md')).toBe('A\nB externo\n');
    expect(phone.read('n.md')).toBe('A\nB externo\n');
  });
});

describe('Vault: pior caso de edição externa', () => {
  it('dois aparelhos detectam a mesma edição externa ao mesmo tempo, sem duplicar', async () => {
    const drive = new MemoryStorage();
    const pc = new Vault(drive, 'arch');
    pc.create('n.md', 'A\n');
    await pc.sync();
    const phoneDrive = new MemoryStorage();
    const phone = new Vault(phoneDrive, 'redmi');
    for (const [k, v] of drive.files) phoneDrive.files.set(k, v);
    await phone.sync();

    // a mesma edição externa chega aos dois antes de qualquer um gravar de volta
    const edited = toBytes('A\nB externo\n');
    await drive.write('n.md', edited);
    await phoneDrive.write('n.md', edited);
    expect((await pc.sync()).external).toBe(1);
    expect((await phone.sync()).external).toBe(1);

    // as pastas se reencontram (o Drive junta os arquivos .tanden de cada um)
    for (const [k, v] of phoneDrive.files) if (k.includes('/redmi.')) drive.files.set(k, v);
    const phone2 = new Vault(drive, 'redmi');
    await pc.sync();
    await phone2.sync();
    expect(pc.read('n.md')).toBe('A\nB externo\n');
    expect(phone2.read('n.md')).toBe('A\nB externo\n');
  });
});

describe('Vault: eventos', () => {
  it('avisa o início e o fim do sync e as notas que mudaram', async () => {
    const { phone, pc } = pair();
    pc.create('n.md', 'oi');
    await pc.sync();
    const seen: TandenEvent['type'][] = [];
    phone.bus.on('*', (e) => seen.push(e.type));
    await phone.sync();
    expect(seen).toEqual(['process.started', 'note.created', 'sync.finished', 'process.finished']);
  });
});

describe('NodeFsStorage', () => {
  it('funciona com uma pasta real no disco', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tanden-'));
    try {
      const pc = new Vault(new NodeFsStorage(dir), 'arch');
      pc.create('pasta/n.md', 'no disco');
      await pc.sync();
      expect(await readFile(join(dir, 'pasta/n.md'), 'utf8')).toBe('no disco');
      await writeFile(join(dir, 'pasta/n.md'), 'no disco, editado no Obsidian');
      await pc.sync();
      expect(pc.read('pasta/n.md')).toBe('no disco, editado no Obsidian');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
