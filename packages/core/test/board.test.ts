import { describe, expect, it } from 'vitest';
import {
  BoardStore,
  MemoryRemote,
  MemoryStorage,
  Replicator,
  Vault,
  fullSync,
  parseBoard,
  readText,
  toBytes,
  type InkStroke,
} from '../src/index';

function device(drive: MemoryRemote, id: string) {
  const disk = new MemoryStorage();
  const vault = new Vault(disk, id);
  const boards = new BoardStore(disk, id, vault.bus);
  const replicator = new Replicator(disk, drive, id);
  return { disk, vault, boards, replicator, sync: () => fullSync(vault, replicator, [boards]) };
}

const card = (id: string, text: string, x = 0, y = 0) => ({ id, type: 'text' as const, text, x, y, width: 200, height: 60 });
const stroke = (id: string): InkStroke => ({ id, tool: 'pen', points: [0, 0, 0.5, 10, 10, 0.5], color: '#fff', width: 2 });
const texts = (s: BoardStore, p: string) => s.read(p).nodes.map((n) => n.text).sort();

/** O Obsidian reescreve o arquivo do jeito dele e não conhece o "x-tanden". */
function obsidianRewrite(raw: string, change: (j: { nodes: any[]; edges: any[] }) => void): string {
  const j = JSON.parse(raw);
  delete j['x-tanden'];
  change(j);
  return JSON.stringify(j, null, '\t');
}

describe('Quadros (.canvas)', () => {
  it('grava um .canvas que o Obsidian entende', async () => {
    const disk = new MemoryStorage();
    const s = new BoardStore(disk, 'arch');
    s.create('Quadros/Tanden.canvas', 'mapa', (e) => {
      e.setNode(card('raiz', 'Tanden Engine'));
      e.setNode(card('a', 'Notas', 300, -80));
      e.setEdge({ id: 'e1', fromNode: 'raiz', toNode: 'a', toEnd: 'arrow' });
      e.addInk(stroke('s1'));
    });
    await s.sync();
    const raw = (await readText(disk, 'Quadros/Tanden.canvas'))!;
    const j = JSON.parse(raw);
    expect(j.nodes.map((n: any) => n.id)).toEqual(['raiz', 'a']);
    expect(j.nodes[0]).toEqual({ id: 'raiz', type: 'text', text: 'Tanden Engine', x: 0, y: 0, width: 200, height: 60 });
    expect(j.edges[0]).toEqual({ id: 'e1', fromNode: 'raiz', toNode: 'a', toEnd: 'arrow' });
    expect(j['x-tanden'].kind).toBe('mapa');
    expect(j['x-tanden'].ink).toHaveLength(1);
  });

  it('funde edições offline de dois aparelhos campo a campo', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.boards.create('fluxo.canvas', 'fluxo', (e) => e.setNode(card('n1', 'Ideia')));
    await pc.sync();
    await phone.sync();

    // o PC move a caixa; o celular muda o texto e cria outra
    pc.boards.edit('fluxo.canvas', (e) => e.setNode({ id: 'n1', x: 400, y: 120 }));
    phone.boards.edit('fluxo.canvas', (e) => {
      e.setNode({ id: 'n1', text: 'Ideia boa' });
      e.setNode(card('n2', 'Protótipo', 0, 200));
      e.setEdge({ id: 'e', fromNode: 'n1', toNode: 'n2', toEnd: 'arrow' });
    });
    await pc.sync();
    await phone.sync();
    await pc.sync();

    for (const d of [pc, phone]) {
      const b = d.boards.read('fluxo.canvas');
      expect(b.nodes.find((n) => n.id === 'n1')).toMatchObject({ x: 400, y: 120, text: 'Ideia boa' });
      expect(b.nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
      expect(b.edges).toHaveLength(1);
    }
    expect(drive.text('fluxo.canvas')).toBe(await readText(phone.disk, 'fluxo.canvas'));
  });

  it('absorve edição feita no Obsidian sem perder o desenho', async () => {
    const disk = new MemoryStorage();
    const s = new BoardStore(disk, 'arch');
    s.create('q.canvas', 'livre', (e) => {
      e.setNode(card('a', 'A'));
      e.setNode(card('b', 'B', 0, 100));
      e.addInk(stroke('s1'));
    });
    await s.sync();
    const raw = (await readText(disk, 'q.canvas'))!;
    await disk.write(
      'q.canvas',
      toBytes(
        obsidianRewrite(raw, (j) => {
          j.nodes = j.nodes.filter((n) => n.id !== 'b');
          j.nodes[0].text = 'A editado no Obsidian';
          j.nodes.push(card('c', 'C novo'));
        }),
      ),
    );
    await s.sync();
    expect(texts(s, 'q.canvas')).toEqual(['A editado no Obsidian', 'C novo']);
    expect(s.read('q.canvas').ink).toHaveLength(1); // o Obsidian não sabe do desenho, mas ele fica
    expect(s.read('q.canvas').kind).toBe('livre');
    const back = parseBoard((await readText(disk, 'q.canvas'))!)!;
    expect(back.ink).toHaveLength(1);
  });

  it('caixa apagada no Obsidian não leva junto a caixa criada no celular', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.boards.create('m.canvas', 'mapa', (e) => {
      e.setNode(card('a', 'A'));
      e.setNode(card('b', 'B'));
    });
    await pc.sync();
    await phone.sync();
    phone.boards.edit('m.canvas', (e) => e.setNode(card('c', 'do celular')));
    await phone.sync();
    // Obsidian no PC, antes de o PC sincronizar
    const raw = (await readText(pc.disk, 'm.canvas'))!;
    await pc.disk.write('m.canvas', toBytes(obsidianRewrite(raw, (j) => (j.nodes = j.nodes.filter((n) => n.id !== 'b')))));
    await pc.sync();
    await phone.sync();
    expect(texts(pc.boards, 'm.canvas')).toEqual(['A', 'do celular']);
    expect(texts(phone.boards, 'm.canvas')).toEqual(['A', 'do celular']);
  });

  it('apagar uma caixa apaga as setas dela', async () => {
    const s = new BoardStore(new MemoryStorage(), 'arch');
    s.create('x.canvas', 'fluxo', (e) => {
      e.setNode(card('a', 'A'));
      e.setNode(card('b', 'B'));
      e.setEdge({ id: 'e', fromNode: 'a', toNode: 'b' });
    });
    s.edit('x.canvas', (e) => e.deleteNode('b'));
    expect(s.read('x.canvas').edges).toEqual([]);
  });

  it('ignora um .canvas corrompido e o reescreve', async () => {
    const disk = new MemoryStorage();
    const s = new BoardStore(disk, 'arch');
    s.create('r.canvas', 'mapa', (e) => e.setNode(card('a', 'A')));
    await s.sync();
    await disk.write('r.canvas', toBytes('{"nodes":[{"id":'));
    await s.sync();
    expect(texts(s, 'r.canvas')).toEqual(['A']);
    expect(parseBoard((await readText(disk, 'r.canvas'))!)).not.toBeNull();
  });

  it('importa um .canvas criado só pelo Obsidian', async () => {
    const disk = new MemoryStorage();
    await disk.write('obs.canvas', toBytes(JSON.stringify({ nodes: [card('z', 'feito no Obsidian')], edges: [] }, null, '\t')));
    const s = new BoardStore(disk, 'arch');
    await s.sync();
    expect(texts(s, 'obs.canvas')).toEqual(['feito no Obsidian']);
    expect(s.read('obs.canvas').kind).toBe('livre');
  });

  it('não confunde quadros com notas', async () => {
    const disk = new MemoryStorage();
    const vault = new Vault(disk, 'arch');
    const s = new BoardStore(disk, 'arch', vault.bus);
    vault.create('n.md', 'nota');
    s.create('q.canvas', 'mapa');
    await vault.sync();
    await s.sync();
    await vault.sync();
    expect(vault.list()).toEqual(['n.md']);
    expect(s.list()).toEqual(['q.canvas']);
  });
});

describe('Quadros: estresse', () => {
  it('três aparelhos e o Obsidian convergem para o mesmo quadro', async () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let round = 0; round < 150; round++) {
      const drive = new MemoryRemote();
      const devs = ['arch', 'redmi', 'win'].map((id) => device(drive, id));
      devs[0]!.boards.create('s.canvas', 'mapa', (e) => e.setNode(card('r', 'raiz')));
      for (const d of devs) await d.sync();
      let n = 0;
      for (let step = 0; step < 12; step++) {
        const d = devs[Math.floor(rnd() * devs.length)]!;
        const ids = d.boards.read('s.canvas').nodes.map((x) => x.id);
        const r = rnd();
        if (r < 0.35) d.boards.edit('s.canvas', (e) => e.setNode(card(`n${round}-${n++}`, `t${n}`, n * 10, n * 5)));
        else if (r < 0.55 && ids.length) d.boards.edit('s.canvas', (e) => e.setNode({ id: ids[Math.floor(rnd() * ids.length)]!, x: Math.round(rnd() * 500) }));
        else if (r < 0.7 && ids.length > 1) d.boards.edit('s.canvas', (e) => e.deleteNode(ids[1 + Math.floor(rnd() * (ids.length - 1))]!));
        else if (r < 0.75 && ids.length > 1) d.boards.edit('s.canvas', (e) => e.setEdge({ id: `e${n++}`, fromNode: ids[0]!, toNode: ids[ids.length - 1]! }));
        else if (r < 0.8) d.boards.edit('s.canvas', (e) => e.addInk(stroke(`k${round}-${n++}`)));
        else if (r < 0.9) {
          const raw = await readText(d.disk, 's.canvas');
          if (raw) await d.disk.write('s.canvas', toBytes(obsidianRewrite(raw, (j) => j.nodes.push(card(`o${round}-${n++}`, 'obs')))));
        } else await d.sync();
      }
      for (let i = 0; i < 2; i++) for (const d of devs) await d.sync();
      const want = await readText(devs[0]!.disk, 's.canvas');
      for (const d of devs) {
        expect(await readText(d.disk, 's.canvas')).toBe(want);
        expect(d.boards.read('s.canvas')).toEqual(devs[0]!.boards.read('s.canvas'));
      }
      expect(drive.text('s.canvas')).toBe(want);
      const b = devs[0]!.boards.read('s.canvas');
      const ids = new Set(b.nodes.map((x) => x.id));
      for (const e of b.edges) expect(ids.has(e.fromNode) && ids.has(e.toNode)).toBe(true);
    }
  });
});

describe('Quadros: desfazer', () => {
  it('desfaz a edição local e não a que veio de outro aparelho', async () => {
    const drive = new MemoryRemote();
    const pc = device(drive, 'arch');
    const phone = device(drive, 'redmi');
    pc.boards.create('u.canvas', 'mapa', (e) => e.setNode(card('a', 'A')));
    await pc.sync();
    await phone.sync();
    const undo = pc.boards.undoManager('u.canvas');
    pc.boards.edit('u.canvas', (e) => e.setNode(card('b', 'B')));
    phone.boards.edit('u.canvas', (e) => e.setNode(card('c', 'C')));
    await phone.sync();
    await pc.sync();
    undo.undo();
    expect(texts(pc.boards, 'u.canvas')).toEqual(['A', 'C']);
    undo.redo();
    expect(texts(pc.boards, 'u.canvas')).toEqual(['A', 'B', 'C']);
  });
});

describe('Quadros: apagar, renomear e duplicar', () => {
  function pair() {
    const disk = new MemoryStorage();
    return { disk, pc: new BoardStore(disk, 'arch'), phone: new BoardStore(disk, 'redmi') };
  }

  it('apaga com cópia na lixeira e o outro aparelho apaga também', async () => {
    const { disk, pc, phone } = pair();
    pc.create('Quadros/plano.canvas', 'fluxo', (e) => e.setNode(card('a', 'A')));
    await pc.sync();
    await phone.sync();
    expect(phone.has('Quadros/plano.canvas')).toBe(true);
    const trashed = await pc.remove('Quadros/plano.canvas');
    expect(trashed).toBe('.trash/Quadros/plano.canvas');
    expect(parseBoard((await readText(disk, trashed!))!)!.nodes[0]!.text).toBe('A');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(pc.has('Quadros/plano.canvas')).toBe(false);
    expect(phone.has('Quadros/plano.canvas')).toBe(false);
    expect(await readText(disk, 'Quadros/plano.canvas')).toBeNull();
  });

  it('uma edição feita ao mesmo tempo em outro aparelho ressuscita o quadro', async () => {
    const { pc, phone } = pair();
    pc.create('q.canvas', 'livre', (e) => e.setNode(card('a', 'A')));
    await pc.sync();
    await phone.sync();
    phone.edit('q.canvas', (e) => e.setNode(card('b', 'B do celular')));
    await pc.remove('q.canvas');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(texts(phone, 'q.canvas')).toEqual(['A', 'B do celular']);
    expect(texts(pc, 'q.canvas')).toEqual(['A', 'B do celular']);
  });

  it('criar de novo no mesmo caminho começa do zero', async () => {
    const { disk, pc, phone } = pair();
    pc.create('q.canvas', 'livre', (e) => e.setNode(card('a', 'velho')));
    await pc.sync();
    await phone.sync();
    await pc.remove('q.canvas');
    pc.create('q.canvas', 'mapa', (e) => e.setNode(card('n', 'novo')));
    await pc.sync();
    await phone.sync();
    expect(parseBoard((await readText(disk, 'q.canvas'))!)!.nodes.map((n) => n.text)).toEqual(['novo']);
    await pc.sync();
    await phone.sync();
    expect(texts(phone, 'q.canvas')).toEqual(['novo']);
    expect(texts(pc, 'q.canvas')).toEqual(['novo']);
  });

  it('um .canvas apagado no Obsidian não volta', async () => {
    const { disk, pc, phone } = pair();
    pc.create('q.canvas', 'livre', (e) => e.setNode(card('a', 'A')));
    await pc.sync();
    await phone.sync();
    await disk.remove('q.canvas');
    await pc.sync();
    await phone.sync();
    await pc.sync();
    expect(await readText(disk, 'q.canvas')).toBeNull();
    expect(pc.has('q.canvas')).toBe(false);
    expect(phone.has('q.canvas')).toBe(false);
  });

  it('renomeia levando tudo, inclusive o desenho', async () => {
    const { disk, pc, phone } = pair();
    pc.create('a.canvas', 'livre', (e) => {
      e.setNode(card('x', 'X'));
      e.addInk(stroke('k1'));
    });
    await pc.sync();
    await phone.sync();
    await pc.rename('a.canvas', 'Quadros/b.canvas');
    await pc.sync();
    await phone.sync();
    expect(phone.list()).toEqual(['Quadros/b.canvas']);
    expect(phone.read('Quadros/b.canvas').ink.map((k) => k.id)).toEqual(['k1']);
    expect(await readText(disk, 'a.canvas')).toBeNull();
    expect(await disk.list('.trash/')).toEqual([]);
  });

  it('duplica sem mexer no original', async () => {
    const { pc } = pair();
    pc.create('a.canvas', 'mapa', (e) => e.setNode(card('x', 'X')));
    pc.duplicate('a.canvas', 'a 2.canvas');
    pc.edit('a 2.canvas', (e) => e.setNode({ id: 'x', text: 'Y' }));
    expect(texts(pc, 'a.canvas')).toEqual(['X']);
    expect(texts(pc, 'a 2.canvas')).toEqual(['Y']);
    expect(pc.read('a 2.canvas').kind).toBe('mapa');
  });

  it('apagar passando pelo Drive', async () => {
    const drive = new MemoryRemote();
    const a = device(drive, 'arch');
    const b = device(drive, 'redmi');
    a.boards.create('m.canvas', 'mapa', (e) => e.setNode(card('r', 'raiz')));
    await a.sync();
    await b.sync();
    expect(b.boards.has('m.canvas')).toBe(true);
    await a.boards.remove('m.canvas');
    await a.sync();
    await b.sync();
    await b.sync();
    expect(b.boards.has('m.canvas')).toBe(false);
    expect(await readText(b.disk, 'm.canvas')).toBeNull();
    await a.sync();
    expect(drive.text('m.canvas')).toBeNull();
  });
});
