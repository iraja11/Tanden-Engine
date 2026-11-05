import { biomeAt, type Biome, type Terrain } from '@tanden/core';

// Pinta o terreno gerado num canvas: cor do bioma, relevo sombreado (luz
// vindo do noroeste) e uma linha escura na costa. Paleta de atlas antigo,
// que funciona igual nos temas claro e escuro (o mapa é uma imagem).

const COLORS: Record<Biome, [number, number, number]> = {
  fundo: [28, 52, 78],
  mar: [46, 86, 116],
  praia: [214, 196, 146],
  deserto: [205, 178, 120],
  campo: [130, 160, 92],
  floresta: [70, 118, 72],
  pantano: [86, 108, 82],
  colina: [140, 132, 96],
  montanha: [120, 108, 98],
  neve: [236, 236, 240],
};

export const BIOME_LABEL: Record<Biome, string> = {
  fundo: 'mar profundo', mar: 'mar', praia: 'praia', deserto: 'deserto', campo: 'campos', floresta: 'floresta',
  pantano: 'pântano', colina: 'colinas', montanha: 'montanhas', neve: 'picos nevados',
};

export function paintTerrain(canvas: HTMLCanvasElement, t: Terrain): void {
  canvas.width = t.w;
  canvas.height = t.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(t.w, t.h);
  const H = (x: number, y: number) => t.height[Math.min(t.h - 1, Math.max(0, y)) * t.w + Math.min(t.w - 1, Math.max(0, x))]!;
  for (let y = 0; y < t.h; y++) {
    for (let x = 0; x < t.w; x++) {
      const b = biomeAt(t, x, y);
      let [r, g, bl] = COLORS[b];
      const e = H(x, y);
      if (e >= t.sea) {
        // relevo: diferença de altura na direção da luz
        const shade = (H(x - 1, y - 1) - H(x + 1, y + 1)) * 9;
        const k = 1 + Math.max(-0.35, Math.min(0.35, shade)) + (e - 0.6) * 0.25;
        r *= k;
        g *= k;
        bl *= k;
        // costa: escurece a terra que encosta no mar
        if (H(x + 1, y) < t.sea || H(x - 1, y) < t.sea || H(x, y + 1) < t.sea || H(x, y - 1) < t.sea) {
          r *= 0.55;
          g *= 0.55;
          bl *= 0.55;
        }
      } else {
        // mar mais claro perto da costa
        const depth = (t.sea - e) / t.sea;
        const k = 1.25 - depth * 0.9;
        r *= k;
        g *= k;
        bl *= k;
      }
      const i = (y * t.w + x) * 4;
      img.data[i] = Math.min(255, r);
      img.data[i + 1] = Math.min(255, g);
      img.data[i + 2] = Math.min(255, bl);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
