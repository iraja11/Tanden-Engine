import { heightAt, lakeAt, moistureAt, shoreAt, terrainDetail, type Terrain } from './terreno';

/*
 * Pintura do terreno em pixels (RGBA), sem DOM: a tela joga o resultado num
 * canvas. Cor pela altura e umidade (misturada, sem degraus), relevo com luz
 * do noroeste, água rasa clara perto da costa e linha escura no litoral.
 *
 * `region` (em %) desenha só um pedaço, em qualquer resolução: perto, entra
 * um detalhe fino de ruído que recorta a costa e dá textura ao chão. É assim
 * que o mapa continua nítido no zoom.
 */

export interface Regiao {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type RGB = [number, number, number];

const C = {
  abismo: [22, 44, 70] as RGB,
  mar: [44, 86, 120] as RGB,
  raso: [86, 140, 160] as RGB,
  lago: [74, 128, 158] as RGB,
  areia: [222, 204, 152] as RGB,
  deserto: [210, 184, 128] as RGB,
  estepe: [176, 172, 108] as RGB,
  campo: [126, 160, 86] as RGB,
  floresta: [58, 104, 60] as RGB,
  pantano: [82, 102, 74] as RGB,
  colina: [146, 136, 98] as RGB,
  rocha: [120, 110, 100] as RGB,
  neve: [242, 242, 246] as RGB,
};

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function corTerra(e: number, m: number, sea: number): RGB {
  const h = (e - sea) / (1 - sea);
  let c = mix(C.deserto, C.estepe, sm(0.28, 0.38, m));
  c = mix(c, C.campo, sm(0.36, 0.46, m));
  c = mix(c, C.floresta, sm(0.5, 0.64, m));
  if (m > 0.64) c = mix(c, C.pantano, sm(0.07, 0.02, h) * sm(0.64, 0.75, m));
  c = mix(c, C.colina, sm(0.3, 0.45, h));
  c = mix(c, C.rocha, sm(0.5, 0.62, h));
  c = mix(c, C.neve, sm(0.84, 0.92, h));
  // praia
  return mix(c, C.areia, sm(0.022, 0.006, h) * (1 - sm(0.6, 0.8, m) * 0.6));
}

/** Pixels RGBA do terreno (ou de um pedaço dele) em `outW` × `outH`. */
export function pintarTerreno(t: Terrain, outW: number, outH: number, region: Regiao = { x0: 0, y0: 0, x1: 100, y1: 100 }): Uint8ClampedArray {
  const px = new Uint8ClampedArray(outW * outH * 4);
  const aspect = t.w / t.h;
  const u0 = region.x0 / 100;
  const v0 = region.y0 / 100;
  const du = (region.x1 - region.x0) / 100 / outW;
  const dv = (region.y1 - region.y0) / 100 / outH;
  // quantos pixels cabem numa célula da grade: perto, entra o detalhe fino
  const zoom = 1 / (du * t.w);
  const fine = Math.min(1, Math.max(0, (zoom - 2) / 2));
  const finer = Math.min(1, Math.max(0, (zoom - 4) / 4));
  const cu = 1 / t.w;
  const cv = 1 / t.h;
  // luz do noroeste
  const L = [-0.6, -0.6, 0.53];
  const sea = t.sea;
  for (let y = 0; y < outH; y++) {
    const v = v0 + (y + 0.5) * dv;
    for (let x = 0; x < outW; x++) {
      const u = u0 + (x + 0.5) * du;
      let e = heightAt(t, u, v);
      const m = moistureAt(t, u, v);
      let det = 0;
      if (fine > 0) {
        det = terrainDetail(t.seed, u, v, aspect, t.h * 0.45) * 0.016 * fine;
        if (finer > 0) det += terrainDetail(t.seed + 5, u, v, aspect, t.h * 2.2) * 0.007 * finer;
        // o detalhe só move a linha d'água perto do mar (não abre poças nos leitos dos rios)
        const sh = shoreAt(t, u, v);
        e += det * sh + (sh < 1 && e < sea + 0.03 ? Math.max(0, -det) * (1 - sh) : 0);
      }
      const lk = lakeAt(t, u, v) + det * 8;
      let c: RGB;
      if (e < sea) {
        // água: mais clara no raso, mais escura no fundo
        const raso = sm(sea - 0.07, sea, e);
        c = mix(mix(C.abismo, C.mar, sm(0.1, sea - 0.07, e)), C.raso, raso * raso);
        // espuma/linha de costa
        if (e > sea - 0.0035) c = mix(c, [190, 210, 210], 0.35);
      } else if (lk > 0.5) {
        c = mix(C.lago, C.raso, sm(0.85, 0.5, lk) * 0.7);
      } else {
        c = corTerra(e, m, sea);
        // relevo: normal pela diferença de altura em volta (na escala da célula)
        const hr = heightAt(t, u + cu, v);
        const hl = heightAt(t, u - cu, v);
        const hd = heightAt(t, u, v + cv);
        const hu = heightAt(t, u, v - cv);
        const ex = hr - hl;
        const ey = hd - hu;
        const k = 26;
        const nx = -ex * k;
        const ny = -ey * k;
        const len = Math.hypot(nx, ny, 1);
        const lum = (nx * L[0]! + ny * L[1]! + L[2]!) / len;
        const shade = 0.55 + lum * 0.75 + det * 12;
        c = [c[0] * shade, c[1] * shade, c[2] * shade];
        // litoral e margem dos lagos: um traço escuro
        const costa = e < sea + 0.0025 && Math.min(hr, hl, hd, hu) < sea;
        if (costa || (lk > 0.38 && lk <= 0.5)) c = mix(c, [40, 46, 42], 0.55);
      }
      const i = (y * outW + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  return px;
}
