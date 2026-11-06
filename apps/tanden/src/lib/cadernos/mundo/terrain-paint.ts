import { generateTerrain, pintarTerreno, type Biome, type Regiao, type Terrain, type TerrainOpts } from '@tanden/core';
import type { PedidoTerreno } from './terrain.worker';

// Terreno do mapa: gerado e pintado num worker (sem travar a tela), com
// volta para a linha principal se o worker não existir. A pintura em si mora
// no núcleo (`pintarTerreno`); aqui só se joga os pixels no canvas.

export const BIOME_LABEL: Record<Biome, string> = {
  fundo: 'mar profundo', mar: 'mar', lago: 'lago', praia: 'praia', deserto: 'deserto', campo: 'campos', floresta: 'floresta',
  pantano: 'pântano', colina: 'colinas', montanha: 'montanhas', neve: 'picos nevados',
};

type Resposta = { id: number; terrain?: Terrain; px?: Uint8ClampedArray; error?: string };

let worker: Worker | null | undefined;
let seq = 0;
const esperando = new Map<number, { ok: (r: Resposta) => void; erro: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<Resposta>) => {
      const w = esperando.get(e.data.id);
      if (!w) return;
      esperando.delete(e.data.id);
      if (e.data.error) w.erro(new Error(e.data.error));
      else w.ok(e.data);
    };
    worker.onerror = () => {
      // worker quebrado: o que estava esperando passa a ser feito aqui
      worker = null;
      for (const w of esperando.values()) w.erro(new Error('worker'));
      esperando.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

type SemId<T> = T extends unknown ? Omit<T, 'id'> : never;

function pedir(q: SemId<PedidoTerreno>): Promise<Resposta> {
  const w = getWorker();
  const id = ++seq;
  const local = (): Resposta => {
    const t = generateTerrain(q.seed, q.w, q.h, q.opts);
    return q.kind === 'terreno' ? { id, terrain: t } : { id, px: pintarTerreno(t, q.outW, q.outH, q.region) };
  };
  if (!w) return new Promise((ok) => setTimeout(() => ok(local()), 0));
  return new Promise((ok) => {
    esperando.set(id, { ok, erro: () => ok(local()) });
    w.postMessage({ ...q, id });
  });
}

export const GRADE = { w: 720, h: 480 };

export async function carregarTerreno(seed: number, opts: TerrainOpts): Promise<Terrain> {
  return (await pedir({ kind: 'terreno', seed, ...GRADE, opts })).terrain!;
}

export async function pintar(seed: number, opts: TerrainOpts, outW: number, outH: number, region?: Regiao): Promise<Uint8ClampedArray> {
  return (await pedir({ kind: 'pintar', seed, ...GRADE, opts, outW, outH, region })).px!;
}

export function porNoCanvas(canvas: HTMLCanvasElement, px: Uint8ClampedArray, w: number, h: number): void {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
}
