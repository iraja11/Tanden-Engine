import { describe, expect, it } from 'vitest';
import { DriveRemote, MemoryStorage, Replicator, Vault, fullSync, toBytes } from '../src/index';
import { FakeDrive } from './fake-drive';

function device(drive: FakeDrive, id: string) {
  const disk = new MemoryStorage();
  const vault = new Vault(disk, id);
  const remote = new DriveRemote({ getToken: async () => 'token-de-teste', fetch: drive.fetch });
  return { disk, vault, sync: () => fullSync(vault, new Replicator(disk, remote, id)) };
}

describe('DriveRemote (API simulada)', () => {
  it('cria a pasta Tanden com a mesma árvore e o .md legível', async () => {
    const drive = new FakeDrive();
    const pc = device(drive, 'arch');
    pc.vault.create('mundo/aurath.md', '# Aurath');
    await pc.sync();
    expect(drive.visiblePath('mundo/aurath.md')).toBe('Tanden/mundo/aurath.md');
    expect(drive.textByPath('mundo/aurath.md')).toBe('# Aurath');
  });

  it('sincroniza dois aparelhos e funde edições offline', async () => {
    const drive = new FakeDrive();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.vault.create('n.md', 'a\nb\n');
    await pc.sync();
    await phone.sync();
    pc.vault.write('n.md', 'a PC\nb\n');
    phone.vault.write('n.md', 'a\nb\nc celular\n');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.vault.read('n.md')).toBe('a PC\nb\nc celular\n');
    expect(phone.vault.read('n.md')).toBe('a PC\nb\nc celular\n');
    expect(drive.textByPath('n.md')).toBe('a PC\nb\nc celular\n');
  });

  it('usa o histórico de revisões do Drive para uma edição feita no site', async () => {
    const drive = new FakeDrive();
    const pc = device(drive, 'arch');
    pc.vault.create('n.md', 'linha 1\n');
    await pc.sync();
    drive.editByPath('n.md', 'linha 1\nescrito no site do Drive\n');
    pc.vault.write('n.md', 'linha 0\nlinha 1\n');
    await pc.sync();
    expect(pc.vault.read('n.md')).toBe('linha 0\nlinha 1\nescrito no site do Drive\n');
    expect(drive.requests.some((r) => r.includes('/revisions'))).toBe(true);
  });

  it('tenta de novo quando o Google limita a taxa', async () => {
    const drive = new FakeDrive();
    const pc = device(drive, 'arch');
    pc.vault.create('n.md', 'x');
    drive.throttle = 2;
    await pc.sync();
    expect(drive.textByPath('n.md')).toBe('x');
  });

  it('lista com paginação e não reenvia o que não mudou', async () => {
    const drive = new FakeDrive();
    const pc = device(drive, 'arch');
    for (let i = 0; i < 5; i++) pc.vault.create(`n${i}.md`, `nota ${i}`);
    await pc.sync();
    const before = drive.requests.filter((r) => r.startsWith('PATCH') || r.startsWith('POST')).length;
    await pc.sync();
    const after = drive.requests.filter((r) => r.startsWith('PATCH') || r.startsWith('POST')).length;
    expect(after).toBe(before);
    const phone = device(drive, 'redmi');
    await phone.sync();
    expect(phone.vault.list()).toHaveLength(5);
  });

  it('lida com binários sem corromper', async () => {
    const drive = new FakeDrive();
    const remote = new DriveRemote({ getToken: async () => 't', fetch: drive.fetch });
    const bytes = new Uint8Array(256).map((_, i) => i);
    await remote.upload('.tanden/crdt/k/arch.bin', bytes);
    const fresh = new DriveRemote({ getToken: async () => 't', fetch: drive.fetch });
    expect(await fresh.download('.tanden/crdt/k/arch.bin')).toEqual(bytes);
    await remote.upload('a.md', toBytes('ção'));
    expect(drive.textByPath('a.md')).toBe('ção');
  });
});

describe('arquivos grandes', () => {
  it('envia PDFs acima de 5 MB pelo envio resumable, criando e atualizando', async () => {
    const drive = new FakeDrive();
    const disk = new MemoryStorage();
    const remote = new DriveRemote({ getToken: async () => 't', fetch: drive.fetch });
    const rep = new Replicator(disk, remote, 'arch');
    const big = new Uint8Array(6 * 1024 * 1024).map((_, i) => i % 251);
    await disk.write('PDFs/livro.pdf', big);
    await rep.sync();
    expect(drive.requests.filter((r) => r.startsWith('PUT'))).toHaveLength(1);
    const f = [...drive.files.values()].find((x) => x.appProperties.tandenPath === 'PDFs/livro.pdf')!;
    expect(f.mimeType).toBe('application/pdf');
    expect(f.data.length).toBe(big.length);

    big[10] = 99;
    await disk.write('PDFs/livro.pdf', big);
    await rep.sync();
    expect(f.data[10]).toBe(99);
    expect(f.revisions).toHaveLength(2);

    // outro aparelho baixa igual
    const other = new MemoryStorage();
    await new Replicator(other, new DriveRemote({ getToken: async () => 't', fetch: drive.fetch }), 'redmi').sync();
    expect((await other.read('PDFs/livro.pdf'))!.length).toBe(big.length);
  });
});
