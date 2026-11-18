import type { SpeciesFigure } from './figura';
import type { N, P, Pen } from './pena';

/*
 * Peças que servem a vários corpos: cabeças, olhos, chifres, orelhas, asas,
 * caudas, mãos e os traços que nascem nas costas. Todas olham para a direita.
 */

/** camadas, de trás para a frente */
export const Z = { asaLonge: 0, membroLonge: 1, cauda: 1.5, costas: 1.8, corpo: 2, membro: 3, asa: 3.5, pescoco: 4, cabecaLonge: 5, cabeca: 6, rosto: 7, frente: 8 } as const;

interface HeadForm {
  c: readonly P[];
  /** olho: x, y, raio */
  e: readonly [number, number, number];
  /** distância até o segundo olho */
  sp: number;
  /** linha da boca */
  m: readonly P[];
  /** topo do crânio, onde nascem os chifres */
  top: P;
  /** ponta do focinho */
  nariz: P;
}

const HEADS: Record<string, HeadForm> = {
  humana: {
    c: [[-.95, -.05], [-.85, -.75], [-.2, -1.12], [.5, -1], [.86, -.5], [.86, -.14], [1.2, .22], [.88, .36], [.94, .56], [.82, .68], [.82, .95], [.42, 1.2], [.02, 1.05], [-.22, .75], [-.65, .62]],
    e: [.46, -.2, .17], sp: .36, m: [[.82, .68], [.56, .72]], top: [-.1, -1], nariz: [1.1, .2],
  },
  canina: {
    c: [[-1, .05], [-.8, -.8], [-.1, -1.02], [.5, -.75], [.95, -.42], [1.7, -.34], [2.15, -.16], [2.2, .18], [1.8, .46], [.95, .68], [.4, .98], [-.4, .95]],
    e: [.55, -.32, .19], sp: .34, m: [[2.05, .24], [1.4, .36], [.8, .32]], top: [-.1, -.95], nariz: [2.12, -.05],
  },
  felina: {
    c: [[-1, .05], [-.8, -.82], [-.05, -1.05], [.58, -.82], [.88, -.38], [1.3, -.14], [1.42, .25], [1.15, .66], [.62, .92], [-.1, 1.02], [-.75, .76]],
    e: [.55, -.3, .21], sp: .38, m: [[1.3, .36], [1, .5], [.68, .46]], top: [-.1, -1], nariz: [1.35, .08],
  },
  equina: {
    c: [[-.95, -.1], [-.65, -.9], [.1, -1], [.72, -.66], [1.55, -.22], [2.35, .2], [2.68, .64], [2.5, 1.1], [1.95, 1.2], [1.25, 1], [.5, 1], [-.35, .9]],
    e: [.5, -.34, .19], sp: .32, m: [[2.55, .9], [2.1, .94], [1.7, .88]], top: [-.15, -.95], nariz: [2.55, .55],
  },
  bovina: {
    c: [[-1, -.1], [-.75, -.95], [.1, -1.08], [.78, -.76], [1.35, -.24], [1.98, .2], [2.16, .72], [1.9, 1.16], [1.25, 1.1], [.5, 1.05], [-.35, .9]],
    e: [.55, -.38, .19], sp: .34, m: [[2.05, .9], [1.6, .96], [1.2, .9]], top: [-.1, -1], nariz: [2.05, .55],
  },
  tromba: {
    c: [[-1.05, 0], [-.85, -.9], [0, -1.16], [.72, -.9], [1.08, -.24], [1.05, .42], [.62, .95], [-.22, 1], [-.85, .64]],
    e: [.55, -.2, .15], sp: .28, m: [[.82, .8], [.5, .86]], top: [.1, -1], nariz: [1, .3],
  },
  reptiliana: {
    c: [[-1.05, .05], [-.85, -.62], [-.1, -.86], [.6, -.68], [1.42, -.46], [2.25, -.28], [2.5, 0], [2.28, .28], [1.25, .46], [.42, .66], [-.5, .74]],
    e: [.45, -.42, .2], sp: .3, m: [[2.38, .08], [1.3, .16], [.4, .2]], top: [-.25, -.8], nariz: [2.35, -.12],
  },
  draconica: {
    c: [[-1.1, .1], [-.9, -.58], [-.3, -.95], [.36, -.98], [.84, -.6], [1.5, -.54], [2.25, -.6], [2.75, -.26], [2.7, .12], [2.1, .24], [1.35, .32], [2.05, .58], [1.5, .82], [.62, .9], [-.5, .8]],
    e: [.52, -.5, .2], sp: .3, m: [[2.6, .14], [1.35, .3], [.6, .3]], top: [-.35, -.85], nariz: [2.55, -.3],
  },
  bico: {
    c: [[-1, 0], [-.75, -.82], [0, -1.05], [.72, -.78], [1, 0], [.74, .78], [0, 1], [-.74, .76]],
    e: [.32, -.26, .22], sp: .34, m: [], top: [-.05, -1], nariz: [2, .2],
  },
  tubarao: {
    c: [[-1.15, 0], [-.75, -.85], [.2, -1], [1.25, -.74], [2.4, -.22], [2.45, .12], [1.75, .5], [.82, .95], [-.42, .9]],
    e: [.9, -.34, .14], sp: .24, m: [[2.05, .34], [1.4, .52], [.8, .46]], top: [0, -.95], nariz: [2.4, -.1],
  },
  insetoide: {
    c: [[-.95, 0], [-.7, -.8], [.05, -.98], [.72, -.72], [1, -.05], [.82, .62], [.1, .9], [-.65, .7]],
    e: [.42, -.2, .46], sp: .3, m: [], top: [.05, -.95], nariz: [1, .3],
  },
  caveira: {
    c: [[-.95, -.05], [-.82, -.78], [-.15, -1.14], [.55, -1], [.9, -.48], [.86, .02], [.96, .36], [.72, .52], [.76, .96], [.3, 1.05], [.02, .72], [-.42, .62]],
    e: [.46, -.2, .27], sp: 0, m: [[.76, .72], [.26, .74]], top: [-.1, -1], nariz: [.9, .2],
  },
  'sem rosto': {
    c: [[-.95, 0], [-.75, -.85], [0, -1.12], [.75, -.85], [.95, 0], [.72, .85], [0, 1.15], [-.72, .85]],
    e: [.4, -.2, .18], sp: .36, m: [], top: [0, -1.05], nariz: [.95, .1],
  },
  tentacular: {
    c: [[-1.15, -.3], [-.85, -1.1], [.1, -1.28], [.88, -.9], [1.04, -.12], [.82, .52], [.1, .72], [-.72, .58]],
    e: [.5, -.2, .22], sp: .34, m: [], top: [.05, -1.2], nariz: [1, .1],
  },
};

const formOf = (cabeca: string): HeadForm => HEADS[cabeca] ?? HEADS['humana']!;

// ------------------------------------------------------------------ olhos

/** Olhos num rosto: dois em perfil, mais em fileiras, muitos espalhados. */
export function drawEyes(pen: Pen, fig: SpeciesFigure, z: number, x: number, y: number, r: number, sp: number) {
  const n = fig.olhos;
  if (!n) return;
  const spots: Array<[number, number, number]> = [];
  if (n === 1) spots.push([sp * .3, 0, 1.55]);
  else if (n === 2) spots.push(...(sp ? [[-sp / 2, 0, 1], [sp / 2, 0, 1]] as Array<[number, number, number]> : [[0, 0, 1.12]] as Array<[number, number, number]>));
  else if (n === 3) spots.push([0, 0, 1], [sp, .02, .72], [sp * .35, -sp * 1.05, .78]);
  else if (n <= 8) {
    const cols = Math.ceil(n / 2);
    const step = sp * (n > 4 ? .82 : 1);
    for (let i = 0; i < n; i++) {
      const c = Math.floor(i / 2);
      spots.push([(c - (cols - 1) / 2) * step, i % 2 ? step * .85 : -step * .1, n > 4 ? .62 : .82]);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = i * 2.4;
      const d = Math.sqrt(i / n) * sp * 2.1;
      spots.push([Math.cos(a) * d, Math.sin(a) * d * .85, .5]);
    }
  }
  const glow = fig.pupila === 'brilhante' || fig.brilho;
  for (const [dx, dy, k] of spots) {
    const [cx, cy, er] = [x + dx, y + dy, r * k];
    if (fig.pupila === 'composta' || fig.cabeca === 'insetoide') {
      pen.circle(z, cx, cy, er, 'pupila', { contorno: false });
      pen.circle(z, cx - er * .3, cy - er * .32, er * .28, 'olho', { contorno: false, opacidade: .55 });
      continue;
    }
    if (fig.cabeca === 'caveira') {
      pen.circle(z, cx, cy, er, 'escuro', { contorno: false });
      pen.circle(z, cx, cy, er * .28, 'luz', { contorno: false });
      continue;
    }
    pen.circle(z, cx, cy, er, glow ? 'luz' : 'olho', { contorno: false });
    if (fig.pupila === 'brilhante' || fig.pupila === 'sem pupila') continue;
    if (fig.pupila === 'vertical') pen.ellipse(z, cx + er * .12, cy, er * .22, er * .78, 'pupila', { contorno: false });
    else if (fig.pupila === 'horizontal') pen.ellipse(z, cx + er * .12, cy, er * .72, er * .24, 'pupila', { contorno: false });
    else pen.circle(z, cx + er * .16, cy, er * .55, 'pupila', { contorno: false });
    pen.circle(z, cx + er * .34, cy - er * .3, er * .18, 'olho', { contorno: false });
  }
}

// ------------------------------------------------------------------ chifres e orelhas

function horn(pen: Pen, fig: SpeciesFigure, z: number, top: P, nariz: P) {
  const [x, y] = top;
  const paint = fig.chifre === 'de cristal' || fig.chifre === 'cristal' ? 'luz' : 'chifre';
  switch (fig.chifre) {
    case 'touro':
      pen.tube(z, [[x, y + .1, .24], [x + .55, y - .22, .2], [x + .98, y - .72, .12], [x + .72, y - 1.28, .02]], paint);
      break;
    case 'carneiro':
      pen.tube(z, [[x, y + .1, .3], [x - .7, y - .34, .3], [x - 1.45, y + .22, .26], [x - 1.4, y + 1.05, .2], [x - .75, y + 1.28, .15], [x - .42, y + .78, .09], [x - .78, y + .55, .03]], paint);
      break;
    case 'galhada': {
      pen.tube(z, [[x, y + .1, .16], [x - .3, y - .8, .13], [x - .1, y - 1.7, .1], [x - .5, y - 2.6, .03]], paint);
      pen.tube(z, [[x - .24, y - .62, .1], [x + .5, y - 1.1, .07], [x + .82, y - 1.75, .02]], paint);
      pen.tube(z, [[x - .14, y - 1.3, .09], [x + .4, y - 1.95, .06], [x + .52, y - 2.5, .02]], paint);
      pen.tube(z, [[x - .22, y - 1.1, .08], [x - .9, y - 1.6, .05], [x - 1.2, y - 2.1, .02]], paint);
      break;
    }
    case 'antilope':
      pen.tube(z, [[x, y + .1, .15], [x - .25, y - .7, .12], [x - .65, y - 1.4, .08], [x - 1.1, y - 1.95, .02]], paint);
      break;
    case 'no focinho':
    case 'focinho':
      pen.tube(z, [[nariz[0] - .35, nariz[1] - .05, .26], [nariz[0] - .2, nariz[1] - .6, .15], [nariz[0] - .32, nariz[1] - 1.15, .02]], paint);
      break;
    case 'unicornio':
      pen.tube(z, [[x + .55, y + .12, .17], [x + 1.2, y - 1.1, .1], [x + 1.95, y - 2.5, .02]], paint);
      for (let i = 1; i < 5; i++) pen.line(z + .1, [[x + .55 + i * .28 - .1, y + .1 - i * .52], [x + .55 + i * .28 + .1, y + .1 - i * .52 + .08]], 'escuro', .04, { opacidade: .4 });
      break;
    case 'demoniacos':
      pen.tube(z, [[x, y + .12, .26], [x - .55, y - .45, .22], [x - 1.45, y - .75, .14], [x - 2.1, y - 1.5, .02]], paint);
      break;
    case 'coroa de chifres':
      for (let i = 0; i < 5; i++) {
        const a = -2.5 + i * .47;
        const [bx, by] = [Math.cos(a) * .92, Math.sin(a) * .92];
        pen.tube(z, [[bx, by, .15], [bx * 1.5, by * 1.5, .1], [bx * 2, by * 2.05, .02]], paint);
      }
      break;
    default:
      pen.poly(z, [[x - .2, y + .15], [x - .42, y - .95], [x - .1, y - 1.75], [x + .22, y - .9], [x + .22, y + .15]], paint, { opacidade: .92 });
      pen.poly(z, [[x + .24, y + .15], [x + .5, y - .5], [x + .82, y - 1.05], [x + .78, y - .3], [x + .55, y + .2]], paint, { opacidade: .92 });
  }
}

function ear(pen: Pen, fig: SpeciesFigure, z: number) {
  const inner = (pts: readonly P[]) => pen.blob(z + .1, pts, 'ventre', { contorno: false, opacidade: .6 });
  switch (fig.orelha) {
    case 'humanas':
      pen.blob(z, [[-.46, -.14], [-.3, -.3], [-.14, -.1], [-.2, .2], [-.38, .22]]);
      break;
    case 'felinas':
      pen.poly(z, [[-.8, -.5], [-.72, -1.62], [-.08, -.9]]);
      inner([[-.66, -.66], [-.66, -1.25], [-.28, -.86]]);
      break;
    case 'caninas':
      pen.blob(z, [[-.85, -.45], [-.82, -1.2], [-.62, -1.75], [-.22, -1.2], [-.05, -.8]]);
      inner([[-.66, -.6], [-.62, -1.3], [-.3, -.92]]);
      break;
    case 'coelho':
      pen.tube(z, [[-.42, -.72, .24], [-.72, -1.7, .3], [-1, -2.75, .14]]);
      pen.tube(z + .1, [[-.46, -.95, .1], [-.72, -1.7, .15], [-.94, -2.5, .05]], 'ventre', { contorno: false, opacidade: .6 });
      break;
    case 'morcego':
      pen.poly(z, [[-.9, -.25], [-1.55, -1.1], [-1.15, -1.1], [-1.2, -1.85], [-.72, -1.4], [-.1, -.8]]);
      inner([[-.78, -.45], [-1.05, -1.2], [-.5, -.95]]);
      break;
    case 'caidas':
      pen.tube(z, [[-.42, -.55, .28], [-.82, .1, .38], [-.82, .95, .22]]);
      break;
    case 'pontudas':
      pen.blob(z, [[-.5, -.3], [-1, -.72], [-1.55, -1.12], [-.95, -.3], [-.42, .2]]);
      break;
    case 'longas':
      pen.blob(z, [[-.5, -.36], [-1.2, -.9], [-2.2, -1.5], [-1.25, -.36], [-.42, .22]]);
      break;
    case 'barbatanas':
      pen.poly(z, [[-.55, -.5], [-1.75, -1.25], [-1.45, -.55], [-1.95, -.1], [-1.3, .15], [-.4, .3]], 'detalhe');
      pen.line(z + .1, [[-.6, -.2], [-1.45, -.55]], 'escuro', .04, { opacidade: .4 });
      pen.line(z + .1, [[-.55, .05], [-1.45, .02]], 'escuro', .04, { opacidade: .4 });
      break;
  }
}

// ------------------------------------------------------------------ dentes

function teeth(pen: Pen, fig: SpeciesFigure, f: HeadForm) {
  if (!f.m.length) return;
  const [mx, my] = f.m[0]!;
  const z = Z.rosto;
  switch (fig.dentes) {
    case 'presas':
      pen.poly(z, [[mx - .3, my], [mx - .2, my + .5], [mx - .06, my]], 'osso');
      break;
    case 'dentes-de-sabre':
      pen.poly(z, [[mx - .42, my], [mx - .34, my + 1.25], [mx - .12, my]], 'osso');
      break;
    case 'serrilhada':
      for (let i = 0; i < 6; i++) pen.poly(z, [[mx - .12 - i * .24, my + i * .03], [mx - .22 - i * .24, my + .26 + i * .03], [mx - .32 - i * .24, my + i * .03]], 'osso', { contorno: false });
      break;
    case 'mandibulas':
      mandibles(pen, mx - .5, my + .15);
      break;
  }
}

function mandibles(pen: Pen, x: number, y: number) {
  pen.tube(Z.rosto, [[x, y, .16], [x + .62, y + .3, .13], [x + .98, y - .05, .03]], 'chifre');
  pen.tube(Z.rosto, [[x - .1, y + .3, .14], [x + .42, y + .72, .11], [x + .88, y + .55, .03]], 'chifre');
}

// ------------------------------------------------------------------ cabeça inteira

export interface HeadPos {
  x: number;
  y: number;
  r: number;
  rot?: number;
}

/** Traços que nascem atrás da cabeça. */
function headBack(pen: Pen, fig: SpeciesFigure) {
  const m = (re: RegExp) => fig.marcas.some((t) => re.test(t));
  if (fig.juba) {
    const pts: P[] = [];
    for (let i = 0; i < 16; i++) {
      const a = 1.9 + (i / 15) * 3.3;
      const r = i % 2 ? 1.5 : 1.95;
      pts.push([-.2 + Math.cos(a) * r, .1 + Math.sin(a) * r]);
    }
    pts.push([.1, 1.1], [.3, .4]);
    pen.poly(Z.cabecaLonge, pts, 'detalhe');
  }
  if (m(/cabelo longo/)) pen.tube(Z.cabecaLonge, [[-.35, -.5, .62], [-.95, .55, .62], [-1.05, 1.9, .5], [-.9, 3, .12]], 'detalhe');
  if (m(/crista/)) {
    pen.poly(Z.cabecaLonge, [[.45, -.8], [.3, -1.65], [-.1, -1.15], [-.4, -1.85], [-.65, -1.1], [-1.15, -1.6], [-1, -.5]], 'detalhe');
  }
  if (m(/cabelos de serpente/)) {
    for (let i = 0; i < 7; i++) {
      const a = -2.9 + i * .42;
      const [bx, by] = [Math.cos(a) * .85, Math.sin(a) * .85];
      const [ox, oy] = [Math.cos(a), Math.sin(a)];
      pen.tube(Z.cabecaLonge, [[bx, by, .13], [bx + ox * .55 - oy * .28, by + oy * .55 + ox * .28, .12], [bx + ox * 1.1 + oy * .25, by + oy * 1.1 - ox * .25, .1], [bx + ox * 1.55, by + oy * 1.55, .15]], 'detalhe');
    }
  }
  if (m(/galhos/)) {
    pen.tube(Z.cabecaLonge, [[-.1, -.85, .15], [-.3, -1.7, .1], [.1, -2.5, .04]], 'chifre');
    pen.tube(Z.cabecaLonge, [[-.28, -1.45, .08], [-.95, -2, .04]], 'chifre');
    pen.tube(Z.cabecaLonge, [[-.2, -1.95, .07], [.45, -2.35, .03]], 'chifre');
    for (const [x, y] of [[.15, -2.6], [-1, -2.1], [.55, -2.4]] as const) pen.circle(Z.cabecaLonge, x, y, .26, 'folha');
  }
}

/** Traços que ficam na frente do rosto. */
function headFront(pen: Pen, fig: SpeciesFigure, f: HeadForm) {
  const m = (re: RegExp) => fig.marcas.some((t) => re.test(t));
  if (fig.antenas || fig.cabeca === 'insetoide') {
    pen.line(Z.rosto, [[.3, -.85], [.5, -1.8], [1.3, -2.5]], 'chifre', .09);
    pen.line(Z.cabecaLonge, [[.05, -.9], [-.05, -1.9], [.55, -2.75]], 'chifre', .09);
  }
  if (m(/barba/)) pen.poly(Z.rosto, [[.82, .72], [.62, 1.9], [.3, 1.35], [.05, 1.75], [.1, .95]], 'detalhe');
  if (m(/bigode/)) {
    const [x, y] = f.nariz;
    for (const dy of [-.05, .12, .3]) pen.line(Z.rosto, [[x - .3, y + .15], [x + .55, y + dy + .05], [x + 1.05, y + dy * 2.2 + .1]], 'osso', .035);
  }
  if (m(/guelras/)) for (let i = 0; i < 3; i++) pen.line(Z.rosto, [[-.55 - i * .16, .1 + i * .08], [-.42 - i * .16, .7 + i * .04]], 'escuro', .07, { opacidade: .65 });
  if (m(/tentaculos faciais/)) {
    for (let i = 0; i < 4; i++) {
      const x = f.nariz[0] * .55 - i * .24;
      pen.tube(Z.rosto, [[x, .62, .14], [x + .1, 1.25, .12], [x - .22, 1.8, .08], [x + .1, 2.3, .03]], 'detalhe');
    }
  }
  if (m(/terceiro olho/)) {
    pen.ellipse(Z.rosto, f.e[0] + .1, -.72, .15, .21, 'luz', { contorno: false });
    pen.circle(Z.rosto, f.e[0] + .1, -.72, .07, 'pupila', { contorno: false });
  }
  if (m(/^halo$/)) pen.line(Z.frente, Array.from({ length: 17 }, (_, i) => [Math.cos((i / 16) * Math.PI * 2) * 1.15, -2.05 + Math.sin((i / 16) * Math.PI * 2) * .3] as P), 'luz', .13);
  if (m(/coroa de chamas/)) {
    for (let i = 0; i < 5; i++) {
      const x = -.8 + i * .4;
      const h = i % 2 ? 2.1 : 1.75;
      pen.blob(Z.cabecaLonge, [[x - .22, -.8], [x - .12, -h * .8], [x + .05, -h], [x + .2, -h * .72], [x + .22, -.8]], 'luz', { contorno: false });
    }
  }
}

export function drawHead(pen: Pen, fig: SpeciesFigure, h: HeadPos) {
  const f = formOf(fig.cabeca);
  pen.at({ x: h.x, y: h.y, s: h.r, ...(h.rot !== undefined ? { rot: h.rot } : {}) }, () => {
    headBack(pen, fig);
    if (fig.chifre) {
      pen.longe(() => pen.at({ x: .3, y: .02 }, () => horn(pen, fig, Z.cabecaLonge, f.top, f.nariz)));
    }
    const paint = fig.cabeca === 'caveira' ? 'osso' : 'base';
    pen.blob(Z.cabeca, f.c, paint);
    // bico, tromba e bocas especiais
    if (fig.cabeca === 'bico') {
      pen.blob(Z.rosto, [[.72, -.55], [1.42, -.42], [2.2, .12], [2.1, .52], [1.5, .2], [.84, .3]], 'chifre');
      pen.blob(Z.rosto, [[.82, .26], [1.5, .3], [1.62, .62], [.76, .66]], 'chifre');
    } else if (fig.cabeca === 'tromba') {
      pen.tube(Z.rosto, [[.82, .1, .36], [1.5, .55, .3], [1.72, 1.4, .24], [1.42, 2.25, .18], [1.88, 2.75, .13]]);
      for (let i = 0; i < 6; i++) pen.line(Z.rosto, [[1.26 + i * .08, .55 + i * .34], [1.74 + i * .03, .68 + i * .34]], 'escuro', .04, { opacidade: .35 });
      pen.tube(Z.rosto, [[.72, .55, .1], [1.05, 1.1, .08], [1.45, 1.25, .02]], 'osso');
    } else if (fig.cabeca === 'insetoide') {
      mandibles(pen, .72, .5);
    } else if (fig.cabeca === 'tentacular') {
      for (let i = 0; i < 5; i++) {
        const x = .72 - i * .34;
        pen.tube(Z.rosto, [[x, .55, .17], [x + .15, 1.2, .15], [x - .22, 1.85, .11], [x + .2, 2.5, .03]], i % 2 ? 'base' : 'detalhe');
      }
    } else if (fig.cabeca === 'caveira') {
      for (let i = 0; i < 4; i++) pen.line(Z.rosto, [[.72 - i * .15, .55], [.72 - i * .15, .92]], 'escuro', .04);
      pen.poly(Z.rosto, [[.86, .1], [.62, .36], [.82, .38]], 'escuro', { contorno: false });
    }
    if (fig.marcas.some((t) => /^cabelo/.test(t))) pen.blob(Z.rosto, [[-1.04, .28], [-1.02, -.75], [-.3, -1.26], [.52, -1.14], [.9, -.62], [.42, -.74], [-.08, -.6], [-.4, -.14], [-.58, .36]], 'detalhe');
    if (f.m.length) pen.line(Z.rosto, f.m, 'escuro', .06, { opacidade: .7 });
    if (fig.cabeca !== 'bico' && f.nariz[0] > 1.3 && fig.cabeca !== 'caveira') pen.circle(Z.rosto, f.nariz[0] - .12, f.nariz[1], .08, 'escuro', { contorno: false });
    teeth(pen, fig, f);
    if (fig.orelha) ear(pen, fig, Z.rosto);
    // de perfil, dois olhos mostram um só
    drawEyes(pen, fig, Z.rosto + .2, f.e[0], f.e[1], f.e[2], fig.olhos === 2 ? 0 : f.sp);
    if (fig.chifre) horn(pen, fig, Z.rosto + .3, f.top, f.nariz);
    headFront(pen, fig, f);
  });
}

// ------------------------------------------------------------------ mãos e pés

/** Ponta de um membro, apoiada em (x, y). `chao`: é um pé no chão. */
export function drawHand(pen: Pen, fig: SpeciesFigure, z: number, x: number, y: number, r: number, chao: boolean) {
  const claw = (dx: number, dy: number) => pen.tube(z + .1, [[x + dx * r, y + dy * r, r * .3], [x + (dx + .5) * r, y + (dy + .2) * r, r * .22], [x + (dx + .9) * r, y + (dy + .55) * r, .05]], 'osso', { contorno: false });
  switch (fig.extremidade) {
    case 'cascos':
      if (chao) pen.poly(z, [[x - r * 1.05, y - r * .35], [x + r * 1.15, y - r * .35], [x + r * 1.5, y + r * .78], [x - r * 1.2, y + r * .78]], 'escuro');
      else pen.circle(z, x, y, r * 1.1);
      break;
    case 'garras':
      pen.tube(z, chao ? [[x - r * .4, y, r * .9], [x + r * 1.1, y + r * .3, r * .62]] : [[x, y - r * .3, r * .95], [x + r * .4, y + r * .6, r * .7]]);
      claw(.9, .2);
      claw(.5, .5);
      claw(1.15, -.15);
      break;
    case 'pincas':
      pen.tube(z, [[x, y, r * 1.1], [x + r * 1.5, y - r * .65, r * .85], [x + r * 2.7, y - r * .35, r * .1]], 'detalhe');
      pen.tube(z, [[x, y + r * .4, r * .8], [x + r * 1.45, y + r * .85, r * .55], [x + r * 2.4, y + r * .42, r * .08]], 'detalhe');
      break;
    case 'nadadeiras':
      pen.blob(z, [[x - r, y - r * .4], [x + r * 1.6, y + r * .2], [x + r * 2.1, y + r * 1.5], [x + r * .2, y + r * 1.6], [x - r * .9, y + r * .9]], 'detalhe');
      break;
    case 'ventosas':
      pen.circle(z, x + r * .25, y + r * .15, r * 1.25);
      pen.circle(z + .1, x + r * .25, y + r * .15, r * .62, 'ventre', { contorno: false });
      break;
    case 'raizes':
      for (const a of [-.3, .35, 1.1]) pen.tube(z, [[x, y - r * .2, r * .8], [x + Math.cos(a) * r * 1.5, y + r * .4, r * .5], [x + Math.cos(a) * r * 3, y + r * (chao ? .9 : 2), r * .1]], 'base');
      break;
    case 'laminas':
      pen.poly(z, [[x - r * .6, y - r * .4], [x + r * .6, y - r * .4], [x + r * 2.4, y + r * 4.2], [x + r * .1, y + r * 1.6]], 'osso');
      break;
    case 'maos':
      if (chao) pen.tube(z, [[x - r * .3, y, r * .9], [x + r * 1.5, y + r * .32, r * .58]]);
      else {
        pen.tube(z, [[x, y - r * .4, r * .85], [x + r * .1, y + r * .7, r * .95], [x, y + r * 1.7, r * .5]]);
        pen.tube(z, [[x + r * .6, y - r * .1, r * .36], [x + r * 1.25, y + r * .6, r * .24]]);
      }
      break;
    default:
      pen.tube(z, chao ? [[x - r * .5, y, r * 1.05], [x + r * 1.25, y + r * .34, r * .78]] : [[x, y - r * .2, r], [x + r * .25, y + r * .8, r * .8]]);
  }
}

// ------------------------------------------------------------------ asas

function scallop(a: P, b: P, c: P, depth: number): P[] {
  const m: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const q: P = [m[0] + (c[0] - m[0]) * depth, m[1] + (c[1] - m[1]) * depth];
  return Array.from({ length: 6 }, (_, i) => {
    const t = i / 6;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * q[0] + t * t * b[0], u * u * a[1] + 2 * u * t * q[1] + t * t * b[1]] as P;
  });
}

function featherFan(pen: Pen, z: number, wrist: P, paint: 'base' | 'detalhe' | 'luz', o: { contorno?: boolean; opacidade?: number } = {}) {
  const n = 9;
  for (let i = n - 1; i >= 0; i--) {
    const t = i / (n - 1);
    const a = -.62 + t * 1.85;
    const len = 62 - t * 30;
    const base: P = [wrist[0] - t * 30, wrist[1] + t * 14];
    const tip: P = [base[0] + Math.cos(a) * len, base[1] + Math.sin(a) * len];
    pen.tube(z, [[base[0], base[1], 1.5], [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, 4.6], [tip[0], tip[1], .5]], i % 3 === 2 && paint === 'base' ? 'detalhe' : paint, { pele: false, ...o });
  }
}

/** Asa aberta, nascendo em (0, 0), crescendo para +x e para cima. */
export function drawWing(pen: Pen, fig: SpeciesFigure, z: number) {
  const elbow: P = [13, -24];
  const wrist: P = [32, -44];
  const arm: N[] = [[0, 0, 4.2], [elbow[0], elbow[1], 3.2], [wrist[0], wrist[1], 2]];
  const tips: P[] = [[78, -44], [80, -10], [62, 18], [36, 34]];
  switch (fig.asa) {
    case 'penas':
      featherFan(pen, z, wrist, 'base');
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const base: P = [wrist[0] - t * 30, wrist[1] + t * 28];
        pen.tube(z + .1, [[base[0], base[1], 1.5], [base[0] + 11 - t * 6, base[1] + 5 + t * 5, 4], [base[0] + 22 - t * 12, base[1] + 11 + t * 8, .5]], 'detalhe', { pele: false });
      }
      pen.tube(z + .2, arm, 'base');
      break;
    case 'inseto':
      pen.blob(z, [[0, 0], [28, -32], [70, -46], [88, -34], [60, -10], [22, 6]], 'vidro');
      pen.blob(z, [[0, 3], [34, 4], [70, 8], [80, 22], [44, 28], [12, 16]], 'vidro');
      for (const [x, y] of [[80, -36], [66, -22], [50, -30], [70, 16], [44, 20]] as const) pen.line(z + .1, [[2, 2], [x * .55, y * .62 - 3], [x, y]], 'escuro', .7, { opacidade: .45 });
      break;
    case 'borboleta':
      pen.blob(z, [[0, 0], [14, -40], [52, -62], [84, -48], [78, -14], [34, 4]], 'detalhe');
      pen.blob(z, [[0, 4], [36, 6], [64, 22], [58, 50], [28, 54], [8, 28]]);
      pen.circle(z + .1, 56, -32, 11, 'ventre', { contorno: false });
      pen.circle(z + .1, 56, -32, 6, 'escuro', { contorno: false });
      pen.circle(z + .1, 38, 32, 7, 'ventre', { contorno: false });
      pen.circle(z + .1, 38, 32, 3.5, 'escuro', { contorno: false });
      break;
    case 'energia':
      featherFan(pen, z, wrist, 'luz', { contorno: false, opacidade: .68 });
      break;
    case 'cristal':
      for (let i = 0; i < 6; i++) {
        const a = -.75 + i * .34;
        const l = 74 - i * 7;
        const b: P = [wrist[0] * (.5 + (5 - i) * .1), wrist[1] * (.5 + (5 - i) * .1)];
        const [ca, sa] = [Math.cos(a), Math.sin(a)];
        pen.poly(z, [[b[0] - sa * 4, b[1] + ca * 4], [b[0] + ca * l * .72 - sa * 8, b[1] + sa * l * .72 + ca * 8], [b[0] + ca * l, b[1] + sa * l], [b[0] + ca * l * .6 + sa * 6, b[1] + sa * l * .6 - ca * 6], [b[0] + sa * 4, b[1] - ca * 4]], i % 2 ? 'detalhe' : 'vidro');
      }
      break;
    case 'ossos':
      pen.tube(z, arm, 'osso');
      for (const t of tips) pen.tube(z, [[wrist[0], wrist[1], 1.7], [(wrist[0] + t[0]) / 2, (wrist[1] + t[1]) / 2 - 2, 1.2], [t[0], t[1], .3]], 'osso');
      pen.poly(z - .1, [[10, -8], [wrist[0], wrist[1]], [52, -14], [38, 2], [46, 14], [24, 8], [16, 20]], 'membrana', { opacidade: .4, contorno: false });
      break;
    default: {
      // membrana (e a de sombra, rasgada)
      const shadow = fig.asa === 'sombra';
      const outline: P[] = [[0, -2], elbow, wrist, tips[0]!];
      for (let i = 0; i < tips.length - 1; i++) outline.push(...scallop(tips[i]!, tips[i + 1]!, wrist, shadow ? .6 : .42));
      outline.push(...scallop(tips[3]!, [2, 12], wrist, .24));
      pen.poly(z, outline, shadow ? 'escuro' : 'membrana', shadow ? { opacidade: .86 } : {});
      if (!shadow) {
        for (const t of tips) pen.tube(z + .1, [[wrist[0], wrist[1], 1.7], [(wrist[0] + t[0]) / 2 + 2, (wrist[1] + t[1]) / 2 - 3, 1.15], [t[0], t[1], .3]], 'base', { pele: false });
        pen.tube(z + .2, arm, 'base');
        pen.tube(z + .2, [[wrist[0], wrist[1], 1.4], [wrist[0] - 1, wrist[1] - 6, .9], [wrist[0] + 3, wrist[1] - 10, .2]], 'osso', { contorno: false });
      }
    }
  }
}

// ------------------------------------------------------------------ caudas

export interface TailRoot {
  x: number;
  y: number;
  r: number;
  /** comprimento */
  len?: number;
  /** giro: positivo aponta para baixo */
  tilt?: number;
}

export function drawTail(pen: Pen, fig: SpeciesFigure, t: TailRoot) {
  const L = t.len ?? 42;
  const r = t.r;
  const z = Z.cauda;
  const lizard: N[] = [[-4, 0, r], [L * .36, 2, r * .72], [L * .72, 7, r * .4], [L * 1.08, 3, .4]];
  pen.at({ x: t.x, y: t.y, flip: true, rot: t.tilt ?? 0 }, () => {
    switch (fig.rabo) {
      case 'curta':
        pen.tube(z, [[-3, 0, r * .9], [L * .18, 1, r * .6], [L * .32, 4, .6]]);
        break;
      case 'felpuda':
        pen.tube(z, [[-3, 0, r * .6], [L * .3, -3, r * 1.1], [L * .68, 3, r * 1.45], [L * 1.02, -3, .6]], 'base');
        pen.tube(z + .1, [[L * .68, 2, r * 1.2], [L * .86, 0, r * .9], [L * 1.02, -3, .5]], 'detalhe', { contorno: false });
        break;
      case 'de lagarto':
      case 'lagarto':
        pen.tube(z, lizard);
        break;
      case 'preensil':
        pen.tube(z, [[-3, 0, r * .75], [L * .4, 4, r * .5], [L * .78, 0, r * .36], [L * .94, -12, r * .28], [L * .8, -21, r * .2], [L * .66, -14, r * .13], [L * .73, -9, .3]]);
        break;
      case 'clava':
        pen.tube(z, [[-4, 0, r], [L * .36, 2, r * .62], [L * .72, 4, r * .36]]);
        for (const a of [0, 1.2, 2.5, 3.8, 5]) pen.tube(z, [[L * .84 + Math.cos(a) * 5, 4 + Math.sin(a) * 5, 2.4], [L * .84 + Math.cos(a) * 11, 4 + Math.sin(a) * 11, .2]], 'chifre');
        pen.circle(z + .1, L * .84, 4, r * .95 + 2, 'chifre');
        break;
      case 'ferrao':
        pen.tube(z, [[-3, 0, r * .85], [L * .4, -2, r * .66], [L * .74, -16, r * .52], [L * .7, -36, r * .42], [L * .38, -44, r * .3]]);
        pen.poly(z + .1, [[L * .42, -49], [L * .36, -39], [L * .04, -35]], 'chifre');
        break;
      case 'leque de penas':
      case 'leque':
        for (let i = 0; i < 7; i++) {
          const a = -.5 + i * .17;
          pen.tube(z, [[-2, 0, 1.8], [Math.cos(a) * L * .55, Math.sin(a) * L * .55, 4.2], [Math.cos(a) * L, Math.sin(a) * L, .8]], i % 2 ? 'detalhe' : 'base', { pele: false });
        }
        break;
      case 'de peixe':
      case 'peixe':
        pen.tube(z, [[-3, 0, r * .9], [L * .4, 1, r * .55], [L * .7, 1, r * .28]]);
        pen.blob(z, [[L * .64, 0], [L * 1.08, -18], [L * .98, 1], [L * 1.08, 20]], 'detalhe');
        break;
      case 'dupla':
        pen.tube(z, [[-4, -2, r * .8], [L * .4, -7, r * .55], [L * .82, -13, r * .3], [L * 1.1, -22, .4]]);
        pen.tube(z, [[-4, 2, r * .8], [L * .4, 7, r * .55], [L * .82, 13, r * .3], [L * 1.1, 8, .4]]);
        break;
      case 'de chamas':
      case 'chamas':
        pen.tube(z, [[-3, 0, r * .7], [L * .3, 0, r * .45], [L * .55, 3, r * .2]]);
        pen.blob(z, [[L * .4, -6], [L * .7, -12], [L * 1.1, -20], [L * .92, -6], [L * 1.2, 5], [L * .72, 9], [L * .42, 7]], 'luz', { contorno: false });
        break;
      case 'lamina':
        pen.tube(z, [[-4, 0, r], [L * .36, 2, r * .6], [L * .7, 4, r * .3]]);
        pen.poly(z + .1, [[L * .64, 4], [L * .76, -4], [L * 1.02, 1], [L * .78, 8]], 'chifre');
        break;
      default:
        // chicote
        pen.tube(z, [[-3, 0, r * .72], [L * .34, -3, r * .42], [L * .7, 5, r * .25], [L * 1.06, -2, .4]]);
    }
  });
}

// ------------------------------------------------------------------ o que nasce nas costas

/** `spine`: pontos das costas, de trás para a frente. */
export function drawBack(pen: Pen, fig: SpeciesFigure, spine: readonly P[]) {
  if (spine.length < 2) return;
  const has = (re: RegExp) => fig.marcas.some((t) => re.test(t));
  const z = Z.costas;
  const at = (t: number): P => {
    const f = t * (spine.length - 1);
    const i = Math.min(spine.length - 2, Math.floor(f));
    const u = f - i;
    return [spine[i]![0] + (spine[i + 1]![0] - spine[i]![0]) * u, spine[i]![1] + (spine[i + 1]![1] - spine[i]![1]) * u];
  };
  if (fig.espinhos) {
    for (let i = 0; i < 9; i++) {
      const [x, y] = at(i / 8);
      const h = 7 + Math.sin((i / 8) * Math.PI) * 6;
      pen.poly(z, [[x - 2.6, y + 3], [x - 1, y - h], [x + 2.6, y + 3]], 'chifre');
    }
  }
  if (has(/placas dorsais/)) {
    for (let i = 0; i < 7; i++) {
      const [x, y] = at(i / 6);
      const h = 7 + Math.sin((i / 6) * Math.PI) * 8;
      pen.blob(z, [[x - 5, y + 4], [x - 4, y - h * .5], [x, y - h], [x + 4, y - h * .5], [x + 5, y + 4]], 'detalhe');
    }
  }
  if (has(/barbatana dorsal/)) {
    const [x, y] = at(.5);
    pen.blob(z, [[x - 12, y + 3], [x - 6, y - 12], [x - 10, y - 22], [x + 4, y - 12], [x + 12, y + 3]], 'detalhe');
  }
  if (has(/vela dorsal/)) {
    const top: P[] = [];
    for (let i = 0; i <= 8; i++) {
      const [x, y] = at(i / 8);
      top.push([x, y - 8 - Math.sin((i / 8) * Math.PI) * 18]);
    }
    pen.blob(z, [at(0), ...top, at(1)], 'detalhe');
    for (let i = 1; i < 8; i++) {
      const [x, y] = at(i / 8);
      pen.line(z + .05, [[x, y], top[i]!], 'escuro', .7, { opacidade: .4 });
    }
  }
  if (has(/corcova/)) {
    const [x, y] = at(.5);
    pen.blob(z, [[x - 13, y + 7], [x - 9, y - 8], [x, y - 14], [x + 9, y - 8], [x + 13, y + 7]]);
  }
  if (has(/cristais nas costas/)) {
    for (let i = 0; i < 6; i++) {
      const [x, y] = at(.1 + (i / 5) * .8);
      const h = 10 + (i % 2) * 8;
      pen.poly(z, [[x - 3.5, y + 3], [x - 2, y - h * .7], [x + .5, y - h], [x + 3.2, y - h * .6], [x + 3.5, y + 3]], 'luz', { opacidade: .9 });
    }
  }
  if (has(/^tentaculos$/) && fig.plano !== 'radial' && fig.plano !== 'cefalopode') {
    for (let i = 0; i < 4; i++) {
      const [x, y] = at(.2 + i * .2);
      pen.tube(z, [[x, y + 2, 2.6], [x - 6, y - 12, 2], [x + 2, y - 22, 1.5], [x - 5, y - 30, .4]], 'detalhe');
    }
  }
  if (has(/fumaca/)) {
    for (let i = 0; i < 3; i++) {
      const [x, y] = at(.25 + i * .25);
      pen.tube(z, [[x, y, 3], [x - 6, y - 14, 5], [x + 3, y - 27, 6], [x - 4, y - 42, .6]], 'longe', { contorno: false, opacidade: .45 });
    }
  }
  if (has(/flores no corpo/)) {
    for (let i = 0; i < 5; i++) {
      const [x, y] = at(.08 + i * .21);
      for (let p = 0; p < 5; p++) pen.circle(Z.frente, x + Math.cos(p * 1.26) * 2.3, y + 1 + Math.sin(p * 1.26) * 2.3, 1.7, 'detalhe', { contorno: false });
      pen.circle(Z.frente, x, y + 1, 1.2, 'luz', { contorno: false });
    }
  }
  if (has(/olhos pela pele/)) {
    for (let i = 0; i < 5; i++) {
      const [x, y] = at(.1 + i * .2);
      const [ex, ey] = [x + 5 + (i % 2) * 3, y + 5 + (i % 2) * 3];
      pen.ellipse(Z.frente, ex, ey, 2.4, 1.7, 'olho', { contorno: false });
      pen.circle(Z.frente, ex, ey, 1, 'pupila', { contorno: false });
    }
  }
}
