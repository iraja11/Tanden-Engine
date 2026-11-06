import { generateTerrain, pintarTerreno, type Regiao, type TerrainOpts } from '@tanden/core';

// Gera e pinta o terreno fora da linha principal (centenas de ms por mapa).
// Mesma semente, mesmo resultado: o worker só faz a conta, quem decide é a tela.

export type PedidoTerreno =
  | { id: number; kind: 'terreno'; seed: number; w: number; h: number; opts: TerrainOpts }
  | { id: number; kind: 'pintar'; seed: number; w: number; h: number; opts: TerrainOpts; outW: number; outH: number; region?: Regiao };

const scope = globalThis as unknown as {
  onmessage: ((e: MessageEvent<PedidoTerreno>) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const q = e.data;
  try {
    const t = generateTerrain(q.seed, q.w, q.h, q.opts);
    if (q.kind === 'terreno') {
      scope.postMessage({ id: q.id, terrain: t });
      return;
    }
    const px = pintarTerreno(t, q.outW, q.outH, q.region);
    scope.postMessage({ id: q.id, px }, [px.buffer]);
  } catch (err) {
    scope.postMessage({ id: q.id, error: String(err) });
  }
};
