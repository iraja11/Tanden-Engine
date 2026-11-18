import type { MoveFigure } from '@tanden/core';

/*
 * Bonecos dos exercícios: duas poses por movimento, e a tela anima entre elas.
 * Coordenadas num quadro de 200 × 160, com o chão em y = 140.
 * "A" é o lado de perto e "B" o de longe (desenhado mais apagado).
 */

export type Point = [number, number];
export interface Pose {
  head: Point; neck: Point; hip: Point;
  kneeA: Point; footA: Point; kneeB: Point; footB: Point;
  elbowA: Point; handA: Point; elbowB: Point; handB: Point;
}

export type Scenery = 'cadeira' | 'parede-direita' | 'parede-esquerda' | 'banco';
export interface Figure { a: Pose; b: Pose; scenery?: Scenery }

const STAND: Pose = {
  head: [100, 34], neck: [100, 50], hip: [100, 90],
  kneeA: [104, 114], footA: [104, 138], kneeB: [96, 114], footB: [96, 138],
  elbowA: [106, 68], handA: [108, 86], elbowB: [94, 68], handB: [92, 86],
};

const pose = (base: Pose, o: Partial<Pose>): Pose => ({ ...base, ...o });

/** Corpo de lado, com as duas pernas e os dois braços juntos. */
const side = (head: Point, neck: Point, hip: Point, knee: Point, foot: Point, elbow: Point, hand: Point): Pose => ({
  head, neck, hip, kneeA: knee, footA: foot, kneeB: knee, footB: foot, elbowA: elbow, handA: hand, elbowB: elbow, handB: hand,
});

const up = (p: Point, dy: number): Point => [p[0], p[1] - dy];

const allFours = side([150, 92], [136, 100], [96, 104], [96, 134], [72, 136], [138, 118], [138, 138]);
const plank = side([149, 98], [134, 104], [92, 118], [66, 126], [42, 134], [134, 136], [156, 136]);
const climber = side([154, 92], [140, 100], [92, 116], [66, 127], [42, 136], [140, 118], [140, 138]);
const sideBridge = side([150, 74], [136, 84], [96, 108], [68, 122], [40, 136], [136, 134], [150, 134]);
const childPose = side([138, 118], [124, 112], [88, 122], [124, 134], [78, 136], [150, 132], [170, 134]);
const bridge = side([160, 128], [146, 130], [104, 134], [78, 108], [70, 138], [126, 136], [108, 138]);
const crunch = side([163, 126], [148, 130], [108, 134], [84, 108], [70, 138], [156, 120], [166, 122]);
const lying = pose(side([165, 130], [150, 132], [106, 134], [82, 134], [58, 134], [128, 136], [112, 137]), { kneeA: [80, 134], footA: [56, 134] });
const superman = side([158, 128], [144, 132], [100, 134], [74, 134], [50, 134], [164, 134], [182, 134]);
const dip = side([86, 40], [82, 56], [88, 94], [116, 108], [116, 138], [78, 74], [74, 94]);
const seated = side([98, 46], [96, 62], [92, 104], [118, 104], [118, 138], [104, 84], [116, 92]);
const wallSit = side([82, 52], [78, 68], [78, 108], [104, 108], [104, 136], [92, 88], [102, 100]);
const wallPush = side([130, 42], [120, 54], [96, 92], [83, 115], [70, 138], [135, 56], [150, 58]);
const row = side([136, 68], [120, 74], [84, 90], [94, 112], [96, 138], [120, 88], [120, 106]);

export const FIGURES: Record<MoveFigure, Figure> = {
  'em-pe': { a: STAND, b: pose(STAND, { elbowA: [110, 66], handA: [118, 82], elbowB: [90, 66], handB: [82, 82] }) },
  agachar: {
    a: pose(STAND, { kneeA: [106, 114], footA: [100, 138], kneeB: [104, 114], footB: [98, 138], elbowA: [112, 62], handA: [130, 62], elbowB: [112, 62], handB: [130, 62] }),
    b: pose(STAND, { head: [102, 61], neck: [96, 76], hip: [80, 112], kneeA: [108, 114], footA: [100, 138], kneeB: [106, 114], footB: [98, 138], elbowA: [114, 78], handA: [133, 78], elbowB: [114, 78], handB: [133, 78] }),
  },
  afundo: {
    a: { head: [92, 38], neck: [92, 54], hip: [92, 94], kneeA: [107, 116], footA: [122, 138], kneeB: [77, 116], footB: [62, 138], elbowA: [104, 74], handA: [96, 90], elbowB: [104, 74], handB: [96, 90] },
    b: { head: [98, 50], neck: [98, 66], hip: [98, 106], kneeA: [122, 114], footA: [122, 138], kneeB: [84, 128], footB: [62, 138], elbowA: [110, 86], handA: [102, 102], elbowB: [110, 86], handB: [102, 102] },
  },
  panturrilha: {
    a: STAND,
    b: pose(STAND, { head: up(STAND.head, 8), neck: up(STAND.neck, 8), hip: up(STAND.hip, 8), kneeA: up(STAND.kneeA, 8), kneeB: up(STAND.kneeB, 8), elbowA: up(STAND.elbowA, 8), handA: up(STAND.handA, 8), elbowB: up(STAND.elbowB, 8), handB: up(STAND.handB, 8) }),
  },
  marcha: {
    a: pose(STAND, { kneeA: [125, 84], footA: [122, 108], kneeB: [98, 114], footB: [98, 138], elbowA: [92, 70], handA: [84, 82], elbowB: [110, 68], handB: [120, 56] }),
    b: pose(STAND, { kneeA: [102, 114], footA: [102, 138], kneeB: [125, 84], footB: [122, 108], elbowA: [110, 68], handA: [120, 56], elbowB: [92, 70], handB: [84, 82] }),
  },
  polichinelo: {
    a: pose(STAND, { kneeA: [106, 114], footA: [108, 138], kneeB: [94, 114], footB: [92, 138], elbowA: [112, 66], handA: [116, 86], elbowB: [88, 66], handB: [84, 86] }),
    b: pose(STAND, { kneeA: [116, 112], footA: [130, 136], kneeB: [84, 112], footB: [70, 136], elbowA: [118, 38], handA: [128, 20], elbowB: [82, 38], handB: [72, 20] }),
  },
  boxe: {
    a: pose(STAND, { kneeA: [110, 114], footA: [112, 138], kneeB: [90, 114], footB: [86, 138], elbowA: [120, 56], handA: [140, 54], elbowB: [108, 68], handB: [114, 54] }),
    b: pose(STAND, { kneeA: [110, 114], footA: [112, 138], kneeB: [90, 114], footB: [86, 138], elbowA: [108, 68], handA: [114, 54], elbowB: [120, 56], handB: [140, 54] }),
  },
  inclinar: {
    a: STAND,
    b: side([133, 62], [118, 68], [84, 88], [94, 112], [96, 138], [118, 88], [118, 106]),
  },
  remada: { a: row, b: pose(row, { elbowA: [100, 72], handA: [112, 90], elbowB: [100, 72], handB: [112, 90] }) },
  rosca: {
    a: pose(STAND, { elbowA: [104, 70], handA: [106, 90], elbowB: [96, 70], handB: [94, 90] }),
    b: pose(STAND, { elbowA: [104, 70], handA: [118, 56], elbowB: [96, 70], handB: [82, 56] }),
  },
  elevar: {
    a: pose(STAND, { elbowA: [116, 56], handA: [116, 38], elbowB: [84, 56], handB: [84, 38] }),
    b: pose(STAND, { elbowA: [110, 30], handA: [108, 12], elbowB: [90, 30], handB: [92, 12] }),
  },
  flexao: {
    a: side([154, 92], [138, 98], [90, 118], [64, 127], [42, 136], [139, 118], [140, 138]),
    b: side([151, 118], [136, 122], [88, 130], [63, 133], [42, 136], [122, 112], [140, 138]),
  },
  'flexao-parede': { a: wallPush, b: pose(wallPush, { head: [143, 47], neck: [132, 58], hip: [102, 94], elbowA: [140, 74], elbowB: [140, 74] }), scenery: 'parede-direita' },
  prancha: { a: plank, b: pose(plank, { hip: [92, 114] }) },
  'prancha-lateral': {
    a: pose(sideBridge, { elbowB: [138, 66], handB: [140, 48] }),
    b: pose(sideBridge, { hip: [96, 100], elbowB: [138, 66], handB: [140, 48] }),
  },
  escalador: {
    a: pose(climber, { kneeA: [112, 118], footA: [92, 128] }),
    b: pose(climber, { kneeB: [112, 118], footB: [92, 128] }),
  },
  ponte: { a: bridge, b: pose(bridge, { hip: [106, 108], kneeA: [78, 106], kneeB: [78, 106] }) },
  'quatro-apoios': { a: allFours, b: pose(allFours, { kneeB: [76, 90], footB: [56, 72], elbowB: [158, 94], handB: [176, 90] }) },
  gato: { a: pose(allFours, { head: [146, 112] }), b: pose(allFours, { head: [150, 86], hip: [96, 100] }) },
  abdominal: { a: crunch, b: pose(crunch, { head: [152, 96], neck: [142, 108], elbowA: [150, 96], handA: [158, 90], elbowB: [150, 96], handB: [158, 90] }) },
  'deitado-pernas': { a: lying, b: pose(lying, { kneeA: [90, 112], footA: [76, 92] }) },
  superman: { a: superman, b: pose(superman, { head: [158, 118], neck: [144, 124], kneeA: [74, 128], footA: [52, 120], kneeB: [74, 128], footB: [52, 120], elbowA: [162, 116], handA: [180, 108], elbowB: [162, 116], handB: [180, 108] }) },
  mergulho: { a: dip, b: pose(dip, { head: [88, 60], neck: [84, 76], hip: [90, 114], elbowA: [64, 84], elbowB: [64, 84] }), scenery: 'banco' },
  'cadeira-parede': { a: wallSit, b: pose(wallSit, { head: [82, 50], neck: [78, 66] }), scenery: 'parede-esquerda' },
  sentado: { a: seated, b: pose(seated, { kneeA: [120, 94], footA: [128, 122], elbowA: [106, 72], handA: [112, 60] }), scenery: 'cadeira' },
  'along-frente': {
    a: STAND,
    b: side([120, 128], [116, 112], [90, 88], [96, 112], [98, 138], [118, 124], [116, 136]),
  },
  crianca: { a: childPose, b: pose(childPose, { head: [136, 112], neck: [122, 108], hip: [86, 118] }) },
  torcao: {
    a: pose(STAND, { elbowA: [118, 62], handA: [110, 74], elbowB: [82, 58], handB: [66, 62] }),
    b: pose(STAND, { elbowA: [118, 58], handA: [134, 62], elbowB: [82, 62], handB: [90, 74] }),
  },
};
