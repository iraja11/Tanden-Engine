import { heightAt, lakeAt, moistureAt, shoreAt, terrainDetail, type Terrain } from './terreno';
import { BIOMAS, ROCHAS, altitudeM } from './clima';

/*
 * Pintura do terreno em pixels (RGBA), sem DOM: a tela joga o resultado num
 * canvas. Cor pela altura e umidade (misturada, sem degraus), relevo com luz
 * do noroeste, água rasa clara perto da costa e linha escura no litoral.
 *
 * `region` (em %) desenha só um pedaço, em qualquer resolução: perto, entra
 * um detalhe fino de ruído que recorta a costa e dá textura ao chão. É assim
 * que o mapa continua nítido no zoom.
 *
 * Estilos: `relevo` (como visto do alto), `atlas` (cores chapadas e curvas de
 * nível) e `pergaminho` (tinta sobre papel, para os símbolos desenhados por
 * cima). Camadas trocam a cor da terra por um dado: altitude, temperatura,
 * chuva, placas, rochas ou biomas sem mistura.
 */

export type EstiloMapa = 'relevo' | 'atlas' | 'pergaminho';
export type CamadaMapa = 'nenhuma' | 'biomas' | 'altitude' | 'temperatura' | 'chuva' | 'placas' | 'rochas';

export interface PinturaOpts {
  estilo?: EstiloMapa;
  camada?: CamadaMapa;
}

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

/** Valor de uma grade por célula, interpolado. */
function bil(a: ArrayLike<number>, w: number, h: number, u: number, v: number): number {
  const fx = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const fy = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const p = a[y0 * w + x0]!;
  const q = a[y0 * w + x1]!;
  const r = a[y1 * w + x0]!;
  const s = a[y1 * w + x1]!;
  return (p + (q - p) * tx) * (1 - ty) + (r + (s - r) * tx) * ty;
}

/** Cor dos biomas misturada entre as quatro células em volta (sem degrau). */
function biomaCor(t: Terrain, u: number, v: number): RGB {
  const a = t.atlas!;
  const w = t.w;
  const h = t.h;
  const fx = Math.min(w - 1, Math.max(0, u * w - 0.5));
  const fy = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const out: RGB = [0, 0, 0];
  let tw = 0;
  const add = (i: number, wt: number) => {
    const b = BIOMAS[a.biome[i]!]!;
    // água não entra na mistura da terra (a costa é desenhada à parte)
    if (b.agua && b.id !== 'lago' || wt <= 0) return;
    out[0] += b.cor[0] * wt;
    out[1] += b.cor[1] * wt;
    out[2] += b.cor[2] * wt;
    tw += wt;
  };
  add(y0 * w + x0, (1 - tx) * (1 - ty));
  add(y0 * w + x1, tx * (1 - ty));
  add(y1 * w + x0, (1 - tx) * ty);
  add(y1 * w + x1, tx * ty);
  if (!tw) return BIOMAS[a.biome[Math.round(fy) * w + Math.round(fx)]!]!.cor.slice() as RGB;
  return [out[0] / tw, out[1] / tw, out[2] / tw];
}

const ramp = (stops: Array<[number, RGB]>, x: number): RGB => {
  if (x <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [x1, c1] = stops[i]!;
    const [x0, c0] = stops[i - 1]!;
    if (x <= x1) return mix(c0, c1, (x - x0) / (x1 - x0));
  }
  return stops[stops.length - 1]![1];
};
const HIPSO: Array<[number, RGB]> = [[0, [92, 140, 84]], [300, [140, 170, 96]], [800, [204, 196, 128]], [1500, [184, 146, 96]], [2400, [150, 112, 86]], [3400, [196, 186, 180]], [4400, [250, 250, 252]]];
const TERMO: Array<[number, RGB]> = [[-25, [70, 60, 160]], [-10, [90, 130, 210]], [0, [200, 226, 246]], [10, [180, 214, 140]], [18, [250, 220, 110]], [26, [236, 120, 60]], [34, [170, 30, 40]]];
const PLUVIO: Array<[number, RGB]> = [[0, [176, 120, 70]], [300, [222, 196, 130]], [700, [180, 200, 110]], [1300, [90, 160, 90]], [2200, [50, 130, 140]], [3400, [40, 70, 160]]];
const PAPEL: RGB = [236, 222, 188];
const TINTA: RGB = [74, 52, 34];

/** Pixels RGBA do terreno (ou de um pedaço dele) em `outW` × `outH`. */
export function pintarTerreno(t: Terrain, outW: number, outH: number, region: Regiao = { x0: 0, y0: 0, x1: 100, y1: 100 }, opts: PinturaOpts = {}): Uint8ClampedArray {
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
  const atlas = t.atlas;
  // planos com outro "mar" (lava, névoa, vazio): cores próprias para a água
  const liq = atlas?.natureza?.liquido ?? null;
  const estilo = opts.estilo ?? 'relevo';
  const camada = atlas ? opts.camada ?? 'nenhuma' : 'nenhuma';
  const papel = estilo === 'pergaminho';
  const chapado = estilo === 'atlas';
  // células da grade por pixel (para as linhas finas terem 1 px)
  const pxCell = du * t.w;
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
      const hr = heightAt(t, u + cu, v);
      const hl = heightAt(t, u - cu, v);
      const hd = heightAt(t, u, v + cv);
      const hu = heightAt(t, u, v - cv);
      // quanto a altura muda de um pixel para o vizinho (para linhas de 1 px)
      const gpx = (Math.max(Math.abs(hr - hl), Math.abs(hd - hu)) / 2) * pxCell + 1e-6;
      // grão do papel
      const grain = papel ? terrainDetail(t.seed + 9, u, v, aspect, 420) * 6 : 0;
      let c: RGB;
      if (e < sea) {
        if (papel) {
          // mar de pergaminho: papel azulado, ondinhas paralelas à costa
          const depth = (sea - e) / sea;
          c = mix([214, 214, 194], [192, 200, 190], Math.min(1, depth * 2));
          if (liq) c = mix(c, mix(liq.mar, liq.fundo, Math.min(1, depth * 1.5)), 0.42);
          const ring = (sea - e) / 0.012;
          const f = ring - Math.floor(ring);
          if (ring > 0.6 && ring < 4 && f < (gpx / 0.012) * 1.2) c = mix(c, TINTA, 0.42 * (1 - ring / 4));
          if (e > sea - 0.0025) c = mix(c, TINTA, 0.55);
        } else {
          // água: mais clara no raso, mais escura no fundo
          const raso = sm(sea - 0.07, sea, e);
          c = liq
            ? mix(mix(liq.fundo, liq.mar, sm(0.1, sea - 0.07, e)), liq.raso, raso * raso)
            : mix(mix(C.abismo, C.mar, sm(0.1, sea - 0.07, e)), C.raso, raso * raso);
          // lava brilha em veios
          if (liq && atlas?.natureza.id === 'infernal') c = mix(c, [255, 210, 90], Math.max(0, det * 3 - 0.6) * 0.5);
          if (chapado && !liq) {
            const band = Math.floor((sea - e) / 0.03);
            c = mix([168, 210, 230], [70, 120, 170], Math.min(1, band * 0.16));
          }
          if (atlas && camada === 'nenhuma') {
            const b = BIOMAS[atlas.biome[Math.min(t.h - 1, Math.floor(v * t.h)) * t.w + Math.min(t.w - 1, Math.floor(u * t.w))]!]!;
            if (b.id === 'recife') c = mix(c, b.cor, 0.55);
            else if (b.id === 'gelo_marinho') c = mix(c, b.cor, 0.85);
          }
          // espuma/linha de costa
          if (e > sea - 0.0035) c = mix(c, liq ? liq.raso : [190, 210, 210], 0.35);
        }
      } else if (lk > 0.5) {
        c = papel ? [180, 192, 186] : liq ? mix(liq.mar, liq.raso, 0.4) : mix(C.lago, C.raso, sm(0.85, 0.5, lk) * 0.7);
        if (atlas && bil(atlas.temp, t.w, t.h, u, v) < -4) c = mix(c, [232, 238, 244], 0.8);
      } else {
        // cor da terra: pelo bioma (com atlas), pela camada pedida, ou o jeito antigo
        if (!atlas) c = corTerra(e, m, sea);
        else if (camada === 'altitude') c = ramp(HIPSO, altitudeM(e, sea));
        else if (camada === 'temperatura') c = ramp(TERMO, bil(atlas.temp, t.w, t.h, u, v));
        else if (camada === 'chuva') c = ramp(PLUVIO, bil(atlas.rain, t.w, t.h, u, v));
        else if (camada === 'rochas') c = ROCHAS[atlas.rock[Math.min(t.h - 1, Math.floor(v * t.h)) * t.w + Math.min(t.w - 1, Math.floor(u * t.w))]!]!.cor.slice() as RGB;
        else if (camada === 'placas' && t.plate && t.plates) {
          const ci = Math.min(t.h - 1, Math.floor(v * t.h)) * t.w + Math.min(t.w - 1, Math.floor(u * t.w));
          const p = t.plate[ci]!;
          const hue = (p * 137.5) % 360;
          c = hsl(hue, t.plates[p]!.oceanic ? 0.25 : 0.45, t.plates[p]!.oceanic ? 0.62 : 0.66);
          const st = bil(t.stress!, t.w, t.h, u, v);
          if (Math.abs(st) > 0.18) c = mix(c, st > 0 ? [200, 50, 40] : [40, 80, 200], Math.min(0.85, (Math.abs(st) - 0.18) * 2.5));
        } else if (camada === 'biomas') {
          // jitter fino: a fronteira entre biomas fica orgânica de perto
          const ju = u + det * 3 * cu * 40;
          const jv = v + det * 3 * cv * 40;
          c = BIOMAS[atlas.biome[Math.min(t.h - 1, Math.max(0, Math.floor(jv * t.h))) * t.w + Math.min(t.w - 1, Math.max(0, Math.floor(ju * t.w)))]!]!.cor.slice() as RGB;
        } else {
          const ju = u + det * cu * 60;
          const jv = v + det * cv * 60;
          c = biomaCor(t, ju, jv);
          if (chapado) c = mix(c, [244, 240, 224], 0.32);
          if (papel) c = mix(PAPEL, mix(c, [255, 255, 255], 0.3), 0.16);
        }
        if (papel && camada !== 'nenhuma') c = mix(PAPEL, c, 0.55);
        // relevo: normal pela diferença de altura em volta (na escala da célula)
        const ex = hr - hl;
        const ey = hd - hu;
        const k = 26;
        const nx = -ex * k;
        const ny = -ey * k;
        const len = Math.hypot(nx, ny, 1);
        const lum = (nx * L[0]! + ny * L[1]! + L[2]!) / len;
        const amp = papel ? 0.3 : chapado ? 0.2 : 0.75;
        const shade = (papel ? 0.9 : chapado ? 0.93 : 0.55) + lum * amp + det * (papel ? 4 : 12);
        if (papel) c = shade < 1 ? mix(c, TINTA, (1 - shade) * 0.9) : mix(c, [250, 244, 228], Math.min(0.5, (shade - 1) * 1.2));
        else c = [c[0] * shade, c[1] * shade, c[2] * shade];
        // curvas de nível a cada ~500 m (atlas e pergaminho)
        if ((chapado || papel) && atlas) {
          const a = altitudeM(e, sea) / 500;
          const f = a - Math.floor(a);
          const da = (altitudeM(e + gpx, sea) - altitudeM(e, sea)) / 500;
          if (a > 0.4 && f < da * 1.1) c = mix(c, papel ? TINTA : [90, 70, 50], papel ? 0.22 : 0.3);
        }
        // litoral e margem dos lagos: um traço escuro
        const costa = e < sea + 0.0025 && Math.min(hr, hl, hd, hu) < sea;
        if (costa || (lk > 0.38 && lk <= 0.5)) c = mix(c, papel ? TINTA : [40, 46, 42], papel ? 0.7 : 0.55);
      }
      const i = (y * outW + x) * 4;
      px[i] = c[0] + grain;
      px[i + 1] = c[1] + grain;
      px[i + 2] = c[2] + grain;
      px[i + 3] = 255;
    }
  }
  return px;
}

function hsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
