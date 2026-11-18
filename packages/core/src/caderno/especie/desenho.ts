import { mixHex, type SpeciesFigure } from './figura';
import { drawBack, drawEyes, drawHand, drawHead, drawTail, drawWing, Z, type HeadPos, type TailRoot } from './partes';
import { Pen, type N, type P, type SpeciesPaint, type SpeciesShape } from './pena';

/*
 * O desenho das espécies: cada plano de corpo monta o esqueleto em tubos e diz
 * onde ficam a cabeça, a cauda, as asas e as costas. O resto (chifres, orelhas,
 * asas, traços) é peça comum, então qualquer combinação sai coerente.
 */

interface Rig {
  /** cabeça articulada, com o pescoço que chega nela */
  head?: HeadPos;
  neck?: readonly N[];
  /** rosto pintado direto no corpo */
  face?: { x: number; y: number; r: number; sp: number };
  tail?: TailRoot;
  wing?: P;
  /** tamanho da asa (1 = padrão) */
  wingSize?: number;
  spine?: readonly P[];
  /** o corpo não toca o chão */
  flutua?: boolean;
}

type Plan = (pen: Pen, fig: SpeciesFigure, k: number) => Rig;

const belly = (pen: Pen, z: number, nodes: readonly N[]) => pen.tube(z + .05, nodes, 'ventre', { contorno: false, preso: true, opacidade: .8 });

/** Perna de três juntas apoiada no chão. */
function leg(pen: Pen, fig: SpeciesFigure, z: number, nodes: readonly N[]) {
  pen.tube(z, nodes);
  const f = nodes[nodes.length - 1]!;
  drawHand(pen, fig, z, f[0], f[1], f[2] * 1.15, true);
}

/** Tronco humano a partir da cintura, com braços. Devolve pescoço e cabeça. */
function torso(pen: Pen, fig: SpeciesFigure, k: number, x: number, y: number): Rig {
  pen.tube(Z.corpo, [[x - .5, y + 2, 8 * k], [x + .5, y - 10, 6.6 * k], [x + 2.5, y - 23, 9 * k], [x + 2.5, y - 30, 5.6 * k]]);
  belly(pen, Z.corpo, [[x + 5, y, 3.4 * k], [x + 6, y - 11, 3.4 * k], [x + 9, y - 23, 4.4 * k]]);
  const pairs = Math.round(fig.bracos / 2);
  for (let i = 0; i < pairs; i++) {
    const [sx, sy] = [x + 2, y - 26 + i * 8];
    const open = i * 4;
    pen.longe(() => {
      pen.tube(Z.membroLonge, [[sx + 3, sy, 3.3 * k], [sx + 10 + open, sy + 13 - i * 2, 2.7 * k], [sx + 18 + open, sy + 22 - i * 4, 2.1 * k]]);
      drawHand(pen, fig, Z.membroLonge, sx + 19 + open, sy + 24 - i * 4, 2.2 * k, false);
    });
    pen.tube(Z.membro, [[sx - 1, sy, 4.2 * k], [sx - 9 - open, sy + 14 - i * 2, 3.1 * k], [sx - 12 - open, sy + 28 - i * 4, 2.4 * k]]);
    drawHand(pen, fig, Z.membro, sx - 12 - open, sy + 30 - i * 4, 2.5 * k, false);
  }
  return {
    head: { x: x + 5, y: y - 42, r: 8 }, neck: [[x + 2.5, y - 29, 4 * k], [x + 4, y - 36, 3.3 * k]],
    spine: [[x - 7 * k, y - 4], [x - 7 * k, y - 22], [x - 3 * k, y - 32]], wing: [x - 3, y - 25], wingSize: .85,
  };
}

/** Corpo de quatro patas: base para quadrúpede, centauro e dragão. */
function fourLegs(pen: Pen, fig: SpeciesFigure, k: number, thick = 1) {
  const t = k * thick;
  const far = (dx: number) => pen.at({ x: dx, y: -2 }, () => pen.longe(() => {
    leg(pen, fig, Z.membroLonge, [[-30, 50, 8 * t], [-38, 66, 5.4 * t], [-29, 81, 3.4 * t], [-32, 96, 2.9 * t]]);
    leg(pen, fig, Z.membroLonge, [[26, 52, 6.6 * t], [30, 72, 4.3 * t], [28, 96, 2.9 * t]]);
  }));
  far(9);
  pen.tube(Z.corpo, [[-34, 42, 13 * t], [-14, 42, 13.5 * t], [8, 42, 14 * t], [24, 40, 14.5 * t]]);
  belly(pen, Z.corpo, [[-30, 56 * 1, 8 * t], [-8, 56, 9 * t], [22, 55, 9 * t]]);
  leg(pen, fig, Z.membro, [[-32, 48, 10 * t], [-40, 66, 6 * t], [-31, 82, 3.6 * t], [-34, 96, 3.1 * t]]);
  leg(pen, fig, Z.membro, [[22, 50, 8 * t], [26, 72, 4.7 * t], [23, 96, 3.1 * t]]);
}

const PLANS: Record<SpeciesFigure['plano'], Plan> = {
  bipede(pen, fig, k) {
    pen.longe(() => leg(pen, fig, Z.membroLonge, [[1, 56, 6 * k], [8, 75, 4.5 * k], [5, 95, 2.8 * k]]));
    leg(pen, fig, Z.corpo, [[-1, 56, 7.4 * k], [-5, 76, 5 * k], [-9, 95, 3 * k]]);
    const up = torso(pen, fig, k, 0, 56);
    return { ...up, tail: { x: -5 * k, y: 54, r: 4.5 * k, len: 36, tilt: -.5 } };
  },

  quadrupede(pen, fig, k) {
    fourLegs(pen, fig, k);
    return {
      neck: [[26, 38, 11 * k], [36, 26, 8 * k], [44, 18, 6.5 * k]], head: { x: 49, y: 15, r: 10 },
      tail: { x: -44, y: 37, r: 5 * k, len: 38, tilt: -.1 }, wing: [-2, 30], spine: [[-42, 30], [-20, 28], [4, 27], [24, 25]],
    };
  },

  teropode(pen, fig, k) {
    pen.longe(() => leg(pen, fig, Z.membroLonge, [[2, 52, 9 * k], [14, 68, 5.4 * k], [3, 84, 3 * k], [9, 96, 2.7 * k]]));
    pen.tube(Z.corpo, [[-16, 44, 10.5 * k], [0, 46, 13 * k], [18, 42, 10.5 * k]]);
    belly(pen, Z.corpo, [[-8, 56, 6 * k], [14, 52, 6 * k]]);
    leg(pen, fig, Z.membro, [[-4, 52, 11 * k], [8, 70, 6.2 * k], [-5, 85, 3.4 * k], [1, 96, 3 * k]]);
    pen.tube(Z.membro, [[20, 48, 2.8 * k], [27, 55, 2 * k], [32, 53, 1.5 * k]]);
    drawHand(pen, fig, Z.membro + .1, 33, 53, 1.6, false);
    return {
      neck: [[20, 40, 8 * k], [30, 29, 5.6 * k], [36, 22, 4.6 * k]], head: { x: 41, y: 18, r: 8.5 },
      tail: { x: -18, y: 42, r: 8 * k, len: 62, tilt: .03 }, wing: [4, 34], spine: [[-16, 33], [0, 33], [18, 31], [28, 24]],
    };
  },

  saltador(pen, fig, k) {
    pen.longe(() => pen.tube(Z.membroLonge, [[-2, 64, 9 * k], [10, 78, 5.5 * k], [-3, 92, 2.8 * k], [17, 97, 2.2 * k]]));
    pen.tube(Z.corpo, [[-10, 62, 13 * k], [-1, 49, 11 * k], [9, 35, 8 * k]]);
    belly(pen, Z.corpo, [[0, 66, 8 * k], [10, 50, 6 * k], [15, 38, 4 * k]]);
    pen.tube(Z.membro, [[-8, 68, 11.5 * k], [6, 80, 6.5 * k], [-8, 93, 3 * k], [14, 97, 2.5 * k]]);
    drawHand(pen, fig, Z.membro + .1, 15, 97, 2.5, true);
    pen.tube(Z.membro, [[12, 38, 2.6 * k], [20, 46, 2 * k], [20, 54, 1.6 * k]]);
    drawHand(pen, fig, Z.membro + .1, 20, 55, 1.8, false);
    return {
      neck: [[10, 33, 6 * k], [14, 25, 4.4 * k]], head: { x: 18, y: 19, r: 8 },
      tail: { x: -18, y: 68, r: 7.5 * k, len: 52, tilt: .34 }, wing: [0, 42], spine: [[-22, 60], [-12, 46], [0, 32]],
    };
  },

  primata(pen, fig, k) {
    pen.longe(() => {
      leg(pen, fig, Z.membroLonge, [[-10, 58, 7 * k], [0, 76, 5.5 * k], [-4, 96, 3.6 * k]]);
      leg(pen, fig, Z.membroLonge, [[20, 40, 6 * k], [34, 62, 5 * k], [32, 95, 4.6 * k]]);
    });
    pen.tube(Z.corpo, [[-16, 54, 12 * k], [-2, 44, 14 * k], [14, 36, 15 * k]]);
    belly(pen, Z.corpo, [[-6, 62, 7 * k], [12, 50, 9 * k]]);
    leg(pen, fig, Z.membro, [[-14, 60, 9 * k], [-6, 77, 6.2 * k], [-12, 96, 4 * k]]);
    leg(pen, fig, Z.membro, [[12, 40, 7.5 * k], [24, 64, 5.6 * k], [20, 95, 5 * k]]);
    return { neck: [[20, 30, 7 * k], [27, 26, 6 * k]], head: { x: 31, y: 23, r: 9.5 }, tail: { x: -26, y: 52, r: 3 * k, len: 34, tilt: .2 }, wing: [0, 28], spine: [[-24, 44], [-10, 32], [8, 22]] };
  },

  quelonio(pen, fig, k) {
    pen.longe(() => {
      leg(pen, fig, Z.membroLonge, [[-14, 80, 6], [-16, 96, 5]]);
      leg(pen, fig, Z.membroLonge, [[26, 80, 6], [28, 96, 5]]);
    });
    leg(pen, fig, Z.membro, [[-26, 80, 7], [-30, 96, 6]]);
    leg(pen, fig, Z.membro, [[16, 80, 7], [18, 96, 6]]);
    const dome: P[] = [[-46, 80], [-40, 58], [-22, 42], [4, 38], [28, 46], [42, 64], [44, 80], [0, 86]];
    pen.blob(Z.membro + .5, dome, 'detalhe');
    for (const [x, y, r] of [[-22, 62, 10], [2, 56, 11], [26, 64, 9]] as const) {
      pen.line(Z.membro + .6, Array.from({ length: 7 }, (_, i) => [x + Math.cos(i * 1.047) * r, y + Math.sin(i * 1.047) * r] as P), 'escuro', 1, { opacidade: .5 });
    }
    pen.line(Z.membro + .6, [[-45, 79], [0, 84], [43, 79]], 'osso', 2);
    return { neck: [[40, 76, 7], [52, 64, 5.4], [60, 58, 5]], head: { x: 65, y: 55, r: 8 }, tail: { x: -44, y: 80, r: 4, len: 22, tilt: .1 } };
  },

  alado(pen, fig, k) {
    pen.longe(() => {
      pen.tube(Z.membroLonge, [[4, 70, 5 * k], [10, 83, 2.6 * k], [6, 96, 1.9 * k]]);
      drawHand(pen, fig, Z.membroLonge + .1, 6, 96, 2.2, true);
    });
    pen.tube(Z.corpo, [[-12, 66, 9 * k], [0, 58, 13 * k], [13, 45, 12 * k]]);
    belly(pen, Z.corpo, [[-2, 70, 7 * k], [12, 58, 8 * k], [20, 46, 5 * k]]);
    pen.tube(Z.membro, [[-3, 70, 6 * k], [3, 83, 2.8 * k], [-2, 96, 2 * k]]);
    drawHand(pen, fig, Z.membro + .1, -2, 96, 2.4, true);
    return {
      neck: [[14, 40, 8 * k], [20, 30, 5.6 * k], [25, 23, 4.8 * k]], head: { x: 29, y: 18, r: 8.5 },
      tail: { x: -16, y: 68, r: 5.5 * k, len: 42, tilt: .32 }, wing: [4, 45], wingSize: 1.05, spine: [[-16, 56], [-2, 46], [10, 34]],
    };
  },

  serpentino(pen, fig, k) {
    const body: N[] = [[-92, 94, .6], [-74, 90, 4 * k], [-50, 94, 7 * k], [-24, 90, 8.6 * k], [0, 94, 9.4 * k], [24, 88, 9 * k], [34, 70, 8 * k], [20, 54, 7 * k], [12, 38, 6 * k], [22, 22, 5 * k], [34, 16, 4.6 * k]];
    pen.tube(Z.corpo, body);
    belly(pen, Z.corpo, body.slice(1).map(([x, y, r]) => [x + r * .4, y + r * .62, r * .45] as N));
    return { head: { x: 40, y: 14, r: 8.5 }, spine: [[-50, 86], [-24, 81], [0, 85], [20, 78]] };
  },

  miriapode(pen, fig, k) {
    const n = 13;
    for (let i = 0; i < n; i++) {
      const x = -70 + i * 11;
      const y = 76 + Math.sin(i * .9) * 3;
      pen.longe(() => pen.line(Z.membroLonge, [[x + 3, y], [x + 8, y + 8], [x + 5, 99]], 'base', 1.6));
      pen.line(Z.membro, [[x, y + 4], [x - 5, y + 10], [x - 8, 99]], 'chifre', 1.8);
      pen.ellipse(Z.corpo + i * .01, x, y, 8 * k, 9 * k, 'base');
    }
    return { neck: [[66, 74, 7], [76, 66, 6]], head: { x: 82, y: 60, r: 8 }, spine: [[-70, 66], [-20, 66], [40, 66]] };
  },

  verme(pen, fig, k) {
    const body: N[] = [[-58, 96, 3], [-36, 88, 10 * k], [-12, 94, 13 * k], [10, 86, 14 * k], [24, 62, 14 * k], [20, 34, 13.5 * k], [26, 14, 15 * k]];
    pen.tube(Z.corpo, body);
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const x = -40 + t * 66;
      const y = t < .55 ? 92 - t * 10 : 88 - (t - .55) * 150;
      pen.line(Z.corpo + .1, [[x - 11, y - 4 + (t > .55 ? 2 : 0)], [x, y + (t > .55 ? 5 : 9)], [x + 12, y - 2]], 'escuro', 1, { opacidade: .35 });
    }
    pen.ellipse(Z.rosto, 33, 11, 9 * k, 13 * k, 'escuro');
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const [x, y] = [33 + Math.cos(a) * 8 * k, 11 + Math.sin(a) * 12 * k];
      pen.poly(Z.rosto + .1, [[x - 1.6, y], [33 + Math.cos(a) * 3 * k, 11 + Math.sin(a) * 5 * k], [x + 1.6, y + 1]], 'osso', { contorno: false });
    }
    return { spine: [[-36, 78], [-12, 81], [10, 72]] };
  },

  molusco(pen, fig, k) {
    pen.blob(Z.corpo, [[-58, 98], [-30, 86], [10, 80], [36, 66], [48, 58], [58, 66], [56, 86], [40, 98]]);
    belly(pen, Z.corpo, [[-48, 97, 3], [40, 96, 5]]);
    pen.circle(Z.membro, -4, 56, 32 * k, 'detalhe');
    const spiral: P[] = Array.from({ length: 30 }, (_, i) => {
      const a = i * .42;
      const r = 29 * k * (1 - i / 32);
      return [-4 + Math.cos(a) * r, 56 + Math.sin(a) * r];
    });
    pen.line(Z.membro + .1, spiral, 'escuro', 1.6, { opacidade: .55 });
    pen.line(Z.corpo + .2, [[46, 60], [50, 42], [58, 32]], 'base', 3.4, { contorno: true });
    pen.line(Z.corpo + .2, [[52, 62], [64, 48], [72, 40]], 'base', 3.4, { contorno: true });
    pen.circle(Z.rosto, 58, 31, 5, 'olho');
    pen.circle(Z.rosto + .1, 59, 31, 2.6, 'pupila', { contorno: false });
    pen.circle(Z.rosto, 72, 39, 5, 'olho');
    pen.circle(Z.rosto + .1, 73, 39, 2.6, 'pupila', { contorno: false });
    return {};
  },

  hexapode(pen, fig, k) {
    const legs: Array<[number, number]> = [[-6, -18], [4, 6], [14, 26]];
    for (const [x, dx] of legs) {
      pen.longe(() => pen.line(Z.membroLonge, [[x + 3, 60], [x + dx * .5 + 7, 40], [x + dx + 6, 99]], 'base', 2.4));
      pen.line(Z.membro, [[x, 64], [x + dx * .7, 44], [x + dx * 1.15, 99]], 'chifre', 3);
    }
    pen.tube(Z.corpo, [[-52, 58, 8 * k], [-34, 56, 15 * k], [-16, 56, 15 * k], [-4, 58, 7 * k]]);
    for (let i = 0; i < 4; i++) pen.line(Z.corpo + .1, [[-44 + i * 10, 43], [-41 + i * 10, 57], [-44 + i * 10, 71]], 'escuro', 1, { opacidade: .45 });
    pen.tube(Z.corpo, [[0, 57, 8 * k], [10, 55, 11 * k], [20, 56, 8 * k]]);
    return { head: { x: 31, y: 54, r: 9.5 }, wing: [4, 45], wingSize: .75, spine: [[-46, 44], [-26, 41], [-6, 43]] };
  },

  octopode(pen, fig, k) {
    const legs: Array<[number, number, number]> = [[12, 46, 30], [8, 26, 22], [2, 2, 18], [-4, -24, 26]];
    for (const [x, dx, up] of legs) {
      pen.longe(() => pen.line(Z.membroLonge, [[x + 4, 54], [x + dx * .6 + 6, 56 - up - 6], [x + dx * 1.05 + 8, 72], [x + dx * 1.2 + 6, 99]], 'base', 2.4));
      pen.line(Z.membro, [[x, 58], [x + dx * .5, 58 - up], [x + dx, 74], [x + dx * 1.2, 99]], 'chifre', 3);
    }
    pen.circle(Z.corpo, -30, 54, 24 * k);
    pen.ellipse(Z.corpo + .1, 14, 56, 16 * k, 13 * k);
    pen.at({ x: 0, y: 0 }, () => {
      pen.tube(Z.rosto, [[24, 66, 2.4], [29, 72, 1.8], [26, 78, .3]], 'chifre');
      pen.tube(Z.rosto, [[19, 67, 2.4], [22, 74, 1.8], [18, 79, .3]], 'chifre');
    });
    return { face: { x: 21, y: 52, r: 2.6, sp: 5 }, spine: [[-46, 34], [-30, 30], [-14, 36]] };
  },

  crustaceo(pen, fig, k) {
    for (let i = 0; i < 4; i++) {
      const x = -22 + i * 11;
      pen.longe(() => pen.line(Z.membroLonge, [[x + 4, 66], [x + 12, 76], [x + 8, 99]], 'base', 2.6));
      pen.line(Z.membro, [[x, 70], [x - 7, 82], [x - 10, 99]], 'chifre', 3);
    }
    for (let i = 0; i < 5; i++) pen.ellipse(Z.corpo - .1 + i * .01, -38 - i * 8, 64 + i * 3, 9 - i * .9, 10 - i, 'base');
    pen.blob(Z.corpo, [[-34, 68], [-28, 50], [-6, 42], [22, 44], [38, 56], [36, 70], [0, 76]]);
    belly(pen, Z.corpo, [[-24, 76, 6], [28, 74, 6]]);
    pen.tube(Z.membro, [[28, 60, 5], [46, 54, 4], [52, 38, 4.5]], 'base');
    pen.blob(Z.membro + .1, [[48, 36], [44, 16], [58, 2], [62, 14], [56, 22], [66, 24], [64, 38], [54, 42]], 'detalhe');
    pen.longe(() => {
      pen.tube(Z.membroLonge, [[34, 60, 4], [56, 62, 3.4], [64, 50, 3.6]], 'base');
      pen.blob(Z.membroLonge + .1, [[60, 48], [58, 32], [70, 22], [73, 32], [68, 38], [77, 40], [74, 50], [66, 54]], 'detalhe');
    });
    pen.line(Z.rosto, [[30, 46], [36, 34]], 'base', 2);
    pen.line(Z.rosto, [[34, 48], [44, 40]], 'base', 2);
    pen.line(Z.rosto, [[36, 50], [56, 44], [78, 24]], 'chifre', 1.2);
    return { face: { x: 36, y: 33, r: 3.6, sp: 8 }, spine: [[-26, 48], [-6, 40], [18, 42]] };
  },

  aquatico(pen, fig, k) {
    const h = 24 * k;
    pen.blob(Z.membroLonge, [[-6, 50 - h + 2], [8, 50 - h - 18], [26, 50 - h - 20], [30, 50 - h + 6]], 'detalhe');
    pen.blob(Z.membroLonge, [[-14, 50 + h - 3], [-6, 50 + h + 16], [8, 50 + h + 8], [8, 50 + h - 2]], 'detalhe');
    pen.blob(Z.corpo, [[-60, 50], [-34, 50 - h * .78], [0, 50 - h], [36, 50 - h * .82], [64, 50 - h * .22], [70, 52], [62, 50 + h * .32], [34, 50 + h * .86], [0, 50 + h], [-34, 50 + h * .72]]);
    belly(pen, Z.corpo, [[-46, 50 + h * .7, 8], [0, 50 + h * .95, 14 * k], [56, 50 + h * .45, 7]]);
    pen.line(Z.corpo + .1, [[36, 50 - h * .55], [30, 50], [36, 50 + h * .55]], 'escuro', 1.4, { opacidade: .5 });
    pen.line(Z.corpo + .1, [[70, 53], [58, 57], [48, 55]], 'escuro', 1.3, { opacidade: .7 });
    pen.blob(Z.membro, [[26, 54], [8, 62], [-2, 76], [12, 76], [28, 64]], 'detalhe');
    return { face: { x: 50, y: 42, r: 5, sp: 9 }, tail: { x: -56, y: 50, r: 9 * k, len: 40 }, spine: [[-28, 50 - h * .8], [0, 50 - h], [28, 50 - h * .85]], flutua: true };
  },

  cetaceo(pen, fig, k) {
    const body: N[] = [[-70, 48, 5], [-46, 46, 11 * k], [-14, 46, 19 * k], [24, 48, 23 * k], [62, 52, 19 * k], [84, 56, 12 * k]];
    pen.tube(Z.corpo, body);
    belly(pen, Z.corpo, [[-20, 62, 10 * k], [24, 70, 15 * k], [76, 68, 10 * k]]);
    for (let i = 0; i < 5; i++) pen.line(Z.corpo + .1, [[80 - i * 8, 62 + i * 1.6], [40 - i * 6, 70 + i * .8]], 'escuro', .7, { opacidade: .3 });
    pen.line(Z.corpo + .1, [[94, 58], [76, 62], [62, 56]], 'escuro', 1.4, { opacidade: .7 });
    pen.blob(Z.membro, [[42, 64], [24, 74], [14, 92], [30, 90], [50, 74]]);
    pen.blob(Z.costas, [[-22, 30], [-30, 16], [-14, 26], [-6, 30]]);
    pen.blob(Z.cauda, [[-68, 48], [-92, 28], [-98, 34], [-82, 48], [-98, 62], [-92, 68]], 'base');
    return { face: { x: 60, y: 54, r: 2.8, sp: 7 }, spine: [[-14, 30], [24, 26], [58, 34]], flutua: true };
  },

  cefalopode(pen, fig, k) {
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const x0 = -16 + t * 34;
      const dir = t - .5;
      const w = i % 2 ? 1 : -1;
      const z = i % 2 ? Z.membroLonge : Z.membro;
      const arm = (): void => pen.tube(z, [[x0, 54, 6 * k], [x0 + dir * 42, 70, 4.6 * k], [x0 + dir * 80 + w * 8, 84, 3 * k], [x0 + dir * 104 - w * 8, 96, 1.5], [x0 + dir * 120, 88, .4]]);
      if (i % 2) pen.longe(arm);
      else arm();
    }
    pen.blob(Z.corpo, [[-24, 52], [-30, 22], [-14, 0], [12, -6], [32, 12], [32, 40], [22, 58], [-12, 60]]);
    belly(pen, Z.corpo, [[-14, 56, 8], [20, 54, 8]]);
    return { face: { x: 18, y: 36, r: 5.5, sp: 10 }, flutua: true };
  },

  radial(pen, fig, k) {
    for (let i = 0; i < 9; i++) {
      const x = -30 + i * 7.5;
      const w = i % 2 ? 7 : -7;
      pen.line(Z.membroLonge, [[x, 40], [x + w, 58], [x - w, 76], [x + w * .7, 96]], 'detalhe', 2.6, { opacidade: .8 });
    }
    for (let i = 0; i < 4; i++) {
      const x = -15 + i * 10;
      pen.tube(Z.membro, [[x, 40, 4], [x + (i % 2 ? 6 : -6), 58, 3], [x + (i % 2 ? -3 : 3), 74, 1.6], [x, 86, .4]], 'ventre');
    }
    pen.blob(Z.corpo, [[-42, 44], [-40, 18], [-18, 2], [18, 2], [40, 18], [42, 44], [28, 40], [14, 46], [0, 41], [-14, 46], [-28, 40]]);
    for (let i = 0; i < 5; i++) pen.line(Z.corpo + .1, [[-22 + i * 11, 40], [-14 + i * 7, 18], [-4 + i * 2, 5]], 'escuro', .8, { opacidade: .3 });
    return { face: { x: 4, y: 24, r: 4, sp: 12 }, flutua: true };
  },

  centauroide(pen, fig, k) {
    pen.at({ y: 34, s: .66 }, () => {
      pen.at({ x: 0 }, () => fourLegs(pen, fig, k, 1.05));
    });
    const up = torso(pen, fig, k * .92, 22, 46);
    return { ...up, tail: { x: -29, y: 58, r: 4 * k, len: 30, tilt: .3 }, spine: [[-26, 50], [-6, 50], [10, 50]], wing: [18, 22] };
  },

  naga(pen, fig, k) {
    const coil: N[] = [[-82, 92, .6], [-60, 89, 4.5 * k], [-36, 93, 7.5 * k], [-8, 90, 9.5 * k], [18, 90, 10.5 * k], [26, 76, 10 * k], [10, 66, 9 * k], [4, 54, 8 * k]];
    pen.tube(Z.corpo, coil);
    belly(pen, Z.corpo, coil.slice(1).map(([x, y, r]) => [x + r * .3, y + r * .62, r * .42] as N));
    const up = torso(pen, fig, k, 4, 52);
    return { ...up, spine: [[-36, 85], [-8, 80], [14, 79]] };
  },

  sereiano(pen, fig, k) {
    const up = torso(pen, fig, k, 16, 42);
    const tail: N[] = [[16, 42, 7.2 * k], [10, 56, 8.5 * k], [-6, 70, 7 * k], [-30, 74, 4.6 * k], [-52, 66, 2.4 * k]];
    pen.tube(Z.corpo - .1, tail);
    pen.blob(Z.cauda, [[-50, 67], [-76, 44], [-70, 66], [-84, 84]], 'detalhe');
    pen.blob(Z.membro, [[-8, 68], [-20, 82], [-4, 84]], 'detalhe');
    return { ...up, spine: [[-4, 58], [-22, 62], [-40, 60]], flutua: true };
  },

  aracnoide(pen, fig, k) {
    const legs: Array<[number, number, number]> = [[20, 46, 26], [14, 24, 20], [6, 0, 16], [0, -24, 26]];
    for (const [x, dx, up] of legs) {
      pen.longe(() => pen.line(Z.membroLonge, [[x + 4, 66], [x + dx * .6 + 6, 66 - up - 4], [x + dx + 8, 82], [x + dx * 1.2 + 6, 99]], 'base', 2.3));
      pen.line(Z.membro, [[x, 70], [x + dx * .5, 70 - up], [x + dx, 84], [x + dx * 1.2, 99]], 'chifre', 2.8);
    }
    pen.circle(Z.corpo - .1, -26, 62, 20 * k);
    pen.ellipse(Z.corpo - .1, 12, 66, 15 * k, 11 * k);
    const up = torso(pen, fig, k * .9, 16, 58);
    return { ...up, spine: [[-40, 44], [-26, 42], [-12, 46]] };
  },

  dragao(pen, fig, k) {
    fourLegs(pen, fig, k, .96);
    return {
      neck: [[26, 36, 11 * k], [42, 24, 7.5 * k], [40, 4, 5.8 * k], [50, -12, 4.8 * k]], head: { x: 56, y: -16, r: 9.5 },
      tail: { x: -44, y: 38, r: 9 * k, len: 74, tilt: .12 }, wing: [6, 28], wingSize: 1.25, spine: [[-44, 28], [-22, 27], [2, 26], [22, 24]],
    };
  },

  arboreo(pen, fig, k) {
    for (const [dx, far] of [[-30, 0], [28, 0], [-14, 1], [14, 1]] as const) {
      const root = () => pen.tube(far ? Z.membroLonge : Z.membro, [[dx * .4, 84, 7 * k], [dx * .8, 92, 5 * k], [dx * 1.4, 99, 1.4]]);
      if (far) pen.longe(root);
      else root();
    }
    pen.tube(Z.corpo, [[0, 98, 15 * k], [-2, 70, 13 * k], [2, 46, 12 * k], [0, 30, 14 * k]]);
    for (let i = 0; i < 5; i++) pen.line(Z.corpo + .1, [[-9 + i * 4.5, 94], [-8 + i * 4, 66], [-6 + i * 3, 44]], 'escuro', 1, { opacidade: .4 });
    pen.tube(Z.membro, [[-8, 44, 5 * k], [-28, 34, 3.6 * k], [-40, 44, 2.6 * k], [-48, 60, 1.2]]);
    pen.tube(Z.membro, [[8, 44, 5 * k], [28, 36, 3.6 * k], [38, 46, 2.6 * k], [44, 62, 1.2]]);
    for (const [x, y, r] of [[-30, 18, 20], [28, 18, 20], [0, 4, 24], [-16, -14, 18], [16, -14, 18], [0, 26, 18]] as const) pen.circle(Z.cabeca, x, y, r, 'folha');
    for (const [x, y] of [[-34, 8], [-8, -16], [24, 2], [8, 14], [-20, 26], [30, 24]] as const) pen.circle(Z.rosto, x, y, 4.4, 'detalhe', { contorno: false, opacidade: .7 });
    return { face: { x: 4, y: 58, r: 3.4, sp: 8 } };
  },

  fungoide(pen, fig, k) {
    pen.longe(() => leg(pen, fig, Z.membroLonge, [[6, 80, 4.5], [10, 96, 3.5]]));
    leg(pen, fig, Z.membro, [[-6, 80, 5], [-10, 96, 4]]);
    pen.tube(Z.corpo, [[0, 84, 13 * k], [0, 60, 11 * k], [0, 40, 10 * k]]);
    pen.tube(Z.membro, [[-9, 56, 3], [-18, 68, 2.4], [-16, 78, 1.8]]);
    pen.blob(Z.cabeca, [[-46, 40], [-38, 12], [-14, -6], [14, -6], [38, 12], [46, 40], [20, 44], [0, 42], [-20, 44]], 'detalhe');
    for (let i = 0; i < 9; i++) pen.line(Z.rosto, [[-30 + i * 7.5, 42], [-20 + i * 5, 36]], 'escuro', .9, { opacidade: .45 });
    for (const [x, y, r] of [[-22, 18, 6], [2, 8, 7.5], [26, 20, 5.5], [-6, 28, 4]] as const) pen.circle(Z.rosto, x, y, r, 'ventre', { contorno: false });
    return { face: { x: 4, y: 58, r: 3.8, sp: 7 } };
  },

  colosso(pen, fig, k) {
    const K = 1 + (k - 1) * .4;
    pen.longe(() => {
      leg(pen, fig, Z.membroLonge, [[12, 66, 10 * K], [17, 80, 8 * K], [17, 94, 7 * K]]);
      pen.tube(Z.membroLonge, [[32, 26, 10 * K], [46, 44, 7.5 * K], [50, 62, 10 * K]]);
    });
    pen.poly(Z.corpo, [[-20, 68], [-34, 34], [-30, 18], [-10, 10], [22, 10], [36, 20], [34, 38], [20, 68], [0, 72]]);
    leg(pen, fig, Z.corpo, [[-10, 68, 11 * K], [-14, 82, 9 * K], [-15, 94, 8 * K]]);
    pen.tube(Z.membro, [[-30, 24, 11 * K], [-46, 42, 8 * K], [-48, 62, 11 * K]]);
    for (const [a, b] of [[[-12, 28], [4, 40]], [[4, 40], [-4, 56]], [[18, 22], [4, 40]], [[-24, 44], [-12, 28]]] as const) pen.line(Z.corpo + .1, [a, b], 'escuro', 1.2, { opacidade: .5 });
    return { head: { x: 4, y: 2, r: 9 }, neck: [[2, 12, 7]], spine: [[-28, 16], [-6, 8], [22, 8]], wing: [-8, 22] };
  },

  amorfo(pen, fig, k) {
    pen.blob(Z.corpo, [[-52, 98], [-58, 80], [-44, 62], [-36, 40], [-16, 24], [10, 20], [32, 34], [40, 56], [56, 76], [54, 98], [32, 99], [24, 90], [12, 99], [-10, 99], [-18, 88], [-30, 99]]);
    pen.blob(Z.corpo + .1, [[-30, 40], [-14, 30], [-6, 34], [-22, 50]], 'luz', { contorno: false, opacidade: .24 });
    for (const [x, y, r] of [[-30, 76, 4], [18, 74, 5.5], [34, 86, 3], [-8, 84, 2.5]] as const) pen.circle(Z.corpo + .1, x, y, r, 'ventre', { contorno: false, opacidade: .45 });
    return { face: { x: 2, y: 48, r: 6, sp: 14 }, spine: [[-36, 44], [-10, 24], [24, 30]] };
  },

  espectral(pen, fig, k) {
    pen.blob(Z.corpo, [[-24, 40], [-22, 12], [-6, -2], [14, 0], [26, 16], [28, 44], [30, 70], [20, 86], [12, 76], [2, 98], [-10, 78], [-24, 92], [-30, 68]], 'base', { opacidade: .86 });
    pen.blob(Z.corpo + .1, [[-6, 34], [-6, 14], [8, 8], [22, 16], [22, 34], [8, 42]], 'escuro', { contorno: false });
    pen.tube(Z.membro, [[-18, 34, 5], [-34, 50, 3.6], [-40, 66, 1]], 'base', { opacidade: .86 });
    pen.tube(Z.membro, [[24, 34, 5], [40, 48, 3.6], [46, 62, 1]], 'base', { opacidade: .86 });
    return { face: { x: 9, y: 24, r: 3.4, sp: 8 }, wing: [-14, 30], flutua: true };
  },

  orbe(pen, fig, k) {
    for (let i = 0; i < 5; i++) {
      const x = -18 + i * 9;
      pen.line(Z.membroLonge, [[x, 66], [x + (i % 2 ? 5 : -5), 78], [x, 92]], 'detalhe', 2.2);
    }
    pen.circle(Z.corpo, 0, 38, 32 * k);
    belly(pen, Z.corpo, [[-18, 62, 12], [18, 62, 12]]);
    pen.blob(Z.corpo + .1, [[-22, 22], [-10, 10], [0, 12], [-14, 28]], 'luz', { contorno: false, opacidade: .3 });
    pen.line(Z.cabecaLonge, Array.from({ length: 25 }, (_, i) => [Math.cos((i / 24) * Math.PI * 2) * 48, 38 + Math.sin((i / 24) * Math.PI * 2) * 11] as P), 'detalhe', 1.6, { opacidade: .8 });
    return { face: { x: 4, y: 36, r: 9, sp: 20 }, flutua: true };
  },

  elemental(pen, fig, k) {
    const flame = (z: number, w: number, top: number, p: SpeciesPaint, o: { contorno?: boolean; opacidade?: number }) =>
      pen.blob(z, [[-w, 96], [-w * 1.08, 66], [-w * .6, 44], [-w * .95, 18], [-w * .3, 32], [-w * .1, top], [w * .35, 24], [w * .9, 6], [w * .7, 44], [w * 1.12, 68], [w, 96], [0, 100]], p, o);
    flame(Z.corpo, 30 * k, -8, 'base', {});
    flame(Z.corpo + .1, 19 * k, 14, 'detalhe', { contorno: false, opacidade: .9 });
    flame(Z.corpo + .2, 9 * k, 42, 'luz', { contorno: false, opacidade: .9 });
    return { face: { x: 3, y: 56, r: 5, sp: 12 } };
  },

  enxame(pen) {
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39996;
      const d = Math.sqrt(i / 90);
      const x = Math.cos(a) * d * 48;
      const y = 50 + Math.sin(a) * d * 44;
      const r = 1.7 + (i % 5) * .3;
      pen.ellipse(Z.corpo, x, y, r * 1.5, r, i % 4 ? 'base' : 'detalhe', { pele: false });
      pen.line(Z.corpo + .1, [[x - r, y], [x - r * 2.2, y - r * 1.5]], 'vidro', .8);
    }
    return { flutua: true };
  },
};

// ------------------------------------------------------------------ montagem

export interface SpeciesPalette {
  claro: string;
  base: string;
  sombra: string;
  contorno: string;
  paints: Record<SpeciesPaint, string>;
}

function palette(fig: SpeciesFigure): SpeciesPalette {
  const base = fig.cor;
  const contorno = mixHex(base, '#0b0a0d', 0.72);
  return {
    claro: mixHex(base, '#ffffff', 0.2), base, sombra: mixHex(base, '#0b0a0d', 0.3), contorno,
    paints: {
      base, longe: mixHex(base, '#0b0a0d', 0.42), detalhe: fig.cor2, ventre: fig.cor3, chifre: mixHex(fig.cor2, '#e9dfc6', 0.55), osso: '#ece4cf',
      escuro: '#17151a', olho: '#fff6dc', pupila: '#121014', luz: mixHex(fig.cor2, '#fff2b8', 0.65), membrana: mixHex(fig.cor2, base, 0.3),
      vidro: mixHex(fig.cor3, '#cfeaf2', 0.6), folha: mixHex(fig.cor2, '#3f7a3a', 0.35),
    },
  };
}

export interface SpeciesDrawing {
  /** camadas em ordem, de trás para a frente */
  camadas: SpeciesShape[][];
  box: { x: number; y: number; w: number; h: number };
  flutua: boolean;
  cores: SpeciesPalette;
}

/** Desenho completo da espécie, em unidades locais (só dados, sem SVG). */
export function speciesDrawing(fig: SpeciesFigure): SpeciesDrawing {
  const pen = new Pen();
  const rig = PLANS[fig.plano](pen, fig, fig.porte);

  if (rig.tail && fig.rabo) drawTail(pen, fig, rig.tail);
  if (rig.wing && fig.asa) {
    const s = rig.wingSize ?? 1;
    pen.longe(() => pen.at({ x: rig.wing![0] + 5, y: rig.wing![1] - 2, s: s * .9, flip: true, rot: .24 }, () => drawWing(pen, fig, Z.asaLonge)));
    pen.at({ x: rig.wing[0], y: rig.wing[1], s, flip: true, rot: -.08 }, () => drawWing(pen, fig, Z.asa));
  }
  if (rig.spine) drawBack(pen, fig, rig.spine);

  if (rig.head) {
    const { head, neck } = rig;
    const base = neck?.[0];
    // cabeças extras abrem em leque a partir da base do pescoço
    for (let i = 0; i < fig.cabecas; i++) {
      const n = fig.cabecas;
      const a = n > 1 ? (i / (n - 1) - .62) * Math.min(1.7, .62 * (n - 1)) : 0;
      const reach = n > 1 ? 1.3 : 1;
      const turn = ([x, y]: P): P => {
        if (!base) return [x + (i - (n - 1) / 2) * head.r * 2.1, y];
        const [dx, dy] = [(x - base[0]) * reach, (y - base[1]) * reach];
        return [base[0] + dx * Math.cos(a) - dy * Math.sin(a), base[1] + dx * Math.sin(a) + dy * Math.cos(a)];
      };
      const body = () => {
        if (neck) {
          const nodes = [...neck.map((p) => [...turn([p[0], p[1]]), p[2]] as N), [...turn([head.x, head.y]), head.r * .5] as N];
          pen.tube(n > 1 ? Z.pescoco : Z.corpo, nodes);
          if (fig.juba && nodes.length > 2) pen.tube(Z.costas, nodes.map(([x, y, r]) => [x - r * .55, y - r * .7, r * .62] as N), 'detalhe');
        }
        const [x, y] = turn([head.x, head.y]);
        drawHead(pen, fig, { x, y, r: head.r * (fig.cabecas > 1 ? .86 : 1), rot: a * .7 });
      };
      body();
    }
  } else if (rig.face) {
    const { x, y, r, sp } = rig.face;
    drawEyes(pen, fig, Z.rosto + .3, x, y, r, sp);
  }

  if (fig.marcas.some((m) => /coracao visivel/.test(m))) {
    const [x, y] = rig.head ? [rig.head.x - 3, rig.head.y + 24] : [0, 50];
    pen.blob(Z.frente, [[x, y + 4], [x - 4, y - 1], [x - 2, y - 3.5], [x, y - 1.5], [x + 2, y - 3.5], [x + 4, y - 1]], 'luz', { contorno: false });
  }

  const byZ = new Map<number, SpeciesShape[]>();
  for (const s of pen.shapes) {
    const list = byZ.get(s.z);
    if (list) list.push(s);
    else byZ.set(s.z, [s]);
  }
  const camadas = [...byZ.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const flutua = !!rig.flutua;
  const y1 = flutua ? pen.y1 : Math.max(pen.y1, 100);
  return { camadas, box: { x: pen.x0, y: pen.y0, w: pen.x1 - pen.x0, h: y1 - pen.y0 }, flutua, cores: palette(fig) };
}
