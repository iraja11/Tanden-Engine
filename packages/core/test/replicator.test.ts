import { describe, expect, it } from 'vitest';
import { MemoryRemote, MemoryStorage, Replicator, Vault, fullSync, readText, toBytes } from '../src/index';

// Cada aparelho tem a própria pasta local; o "Drive" é compartilhado.
function device(drive: MemoryRemote, id: string) {
  const disk = new MemoryStorage();
  const vault = new Vault(disk, id);
  const replicator = new Replicator(disk, drive, id);
  return { disk, vault, replicator, sync: () => fullSync(vault, replicator) };
}

describe('Replicator + Vault com o Drive', () => {
  it('leva uma nota do PC ao celular passando pelo Drive', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.vault.create('ideias.md', 'Tanden Engine');
    await pc.sync();
    expect(drive.text('ideias.md')).toBe('Tanden Engine');
    await phone.sync();
    expect(phone.vault.read('ideias.md')).toBe('Tanden Engine');
  });

  it('funde edições offline dos dois aparelhos', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.vault.create('agenda.md', 'seg: aula\nter: estágio\n');
    await pc.sync();
    await phone.sync();

    pc.vault.write('agenda.md', 'seg: aula de Cálculo\nter: estágio\n');
    phone.vault.write('agenda.md', 'seg: aula\nter: estágio\nqua: treino SF5\n');
    await pc.sync();
    await phone.sync();
    await pc.sync();

    const expected = 'seg: aula de Cálculo\nter: estágio\nqua: treino SF5\n';
    expect(pc.vault.read('agenda.md')).toBe(expected);
    expect(phone.vault.read('agenda.md')).toBe(expected);
    expect(drive.text('agenda.md')).toBe(expected);
    expect(await readText(pc.disk, 'agenda.md')).toBe(expected);
    expect(await readText(phone.disk, 'agenda.md')).toBe(expected);
  });

  it('absorve uma edição feita no editor do Drive', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    pc.vault.create('n.md', 'linha 1\n');
    await pc.sync();
    await drive.editText('n.md', 'linha 1\nescrito no Drive\n');
    pc.vault.write('n.md', 'linha 0\nlinha 1\n'); // edição local ao mesmo tempo
    await pc.sync();
    expect(pc.vault.read('n.md')).toBe('linha 0\nlinha 1\nescrito no Drive\n');
    expect(drive.text('n.md')).toBe('linha 0\nlinha 1\nescrito no Drive\n');
  });

  it('absorve uma edição feita no Obsidian do PC e leva ao celular', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.vault.create('mundo.md', 'Aurath\n');
    await pc.sync();
    await phone.sync();
    await pc.disk.write('mundo.md', toBytes('Aurath\nCapital: Veyra\n')); // Obsidian salvou
    phone.vault.write('mundo.md', 'Aurath (continente)\n');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.vault.read('mundo.md')).toBe('Aurath (continente)\nCapital: Veyra\n');
    expect(phone.vault.read('mundo.md')).toBe('Aurath (continente)\nCapital: Veyra\n');
  });

  it('para de trocar arquivos quando tudo já está igual', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.vault.create('a.md', 'x');
    phone.vault.create('b.md', 'y');
    for (let i = 0; i < 3; i++) {
      await pc.sync();
      await phone.sync();
    }
    const r1 = await pc.sync();
    const r2 = await phone.sync();
    expect(r1.replica).toEqual({ uploaded: [], downloaded: [] });
    expect(r2.replica).toEqual({ uploaded: [], downloaded: [] });
    expect(pc.vault.list()).toEqual(['a.md', 'b.md']);
  });

  it('recupera tudo num aparelho reinstalado', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    pc.vault.create('a.md', 'meu texto');
    await pc.sync();
    const again = device(drive, 'arch'); // mesmo aparelho, disco vazio
    await again.sync();
    expect(again.vault.read('a.md')).toBe('meu texto');
    again.vault.write('a.md', 'meu texto, continuado');
    await again.sync();
    expect(drive.text('a.md')).toBe('meu texto, continuado');
  });

  it('nunca envia .tanden/local para o Drive', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    pc.vault.create('a.md', 'x');
    await pc.sync();
    expect([...drive.files.keys()].some((p) => p.startsWith('.tanden/local/'))).toBe(false);
  });
});

describe('Replicator com arquivos grandes', () => {
  it('não relê arquivos que não mudaram desde o último sync', async () => {
    const drive = new MemoryRemote();
    const disk = new MemoryStorage();
    const rep = new Replicator(disk, drive, 'arch');
    await disk.write('PDFs/a.pdf', new Uint8Array(1000).fill(7));
    await disk.write('n.md', toBytes('oi'));
    await rep.sync();
    disk.reads.clear();
    await rep.sync();
    expect(disk.reads.get('PDFs/a.pdf')).toBeUndefined();

    // mudou: relê e envia
    await disk.write('PDFs/a.pdf', new Uint8Array(1000).fill(8));
    const r = await rep.sync();
    expect(r.uploaded).toEqual(['PDFs/a.pdf']);
    expect(drive.files.get('PDFs/a.pdf')!.data[0]).toBe(8);

    // chegou do Drive: grava e relê uma vez só no sync seguinte
    await drive.upload('PDFs/a.pdf', new Uint8Array(10).fill(9));
    expect((await rep.sync()).downloaded).toEqual(['PDFs/a.pdf']);
    disk.reads.clear();
    expect(await rep.sync()).toEqual({ uploaded: [], downloaded: [] });
    expect(disk.reads.get('PDFs/a.pdf')).toBe(1);
    disk.reads.clear();
    await rep.sync();
    expect(disk.reads.get('PDFs/a.pdf')).toBeUndefined();
  });
});

describe('Replicator: o que não vai para o Drive', () => {
  it('ignora .git, o layout do Obsidian, lixo do sistema e arquivos pela metade', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    for (const p of ['.git/HEAD', '.git/objects/ab/cd', '.obsidian/workspace.json', '.obsidian/app.json', 'nota.md.tmp', 'Anexos/.DS_Store', 'Anexos/foto.png', '~$relatorio.docx'])
      await pc.disk.write(p, toBytes('x'));
    await pc.replicator.sync();
    const up = [...drive.files.keys()].sort();
    expect(up).toContain('Anexos/foto.png');
    expect(up).toContain('.obsidian/app.json');
    for (const p of ['.git/HEAD', '.git/objects/ab/cd', '.obsidian/workspace.json', 'nota.md.tmp', 'Anexos/.DS_Store', '~$relatorio.docx']) expect(up).not.toContain(p);
  });

  it('não baixa o que outro aparelho mandou por engano', async () => {
    const drive = new MemoryRemote();
    await drive.upload('.git/config', toBytes('[core]'));
    await drive.upload('.obsidian/workspace-mobile.json', toBytes('{}'));
    const phone = device(drive, 'redmi');
    await phone.replicator.sync();
    expect(await phone.disk.list()).toEqual(['.tanden/local/redmi/replica.json']);
  });

  it('a rede caindo no meio não perde o que já foi enviado', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    for (const p of ['a.md', 'b.md', 'c.md']) await pc.disk.write(p, toBytes(p));
    const upload = drive.upload.bind(drive);
    let calls = 0;
    drive.upload = async (p, d) => {
      if (++calls === 3) throw new Error('sem internet');
      return upload(p, d);
    };
    await expect(pc.replicator.sync()).rejects.toThrow('sem internet');
    drive.upload = upload;
    const r = await pc.replicator.sync();
    expect(r.uploaded).toEqual(['c.md']);
  });
});
