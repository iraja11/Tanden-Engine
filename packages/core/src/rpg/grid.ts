import { asText, type Props } from '../caderno/frontmatter';
import { linkTarget } from '../caderno/markdown';
import { colIndex, colName } from '../sheet/address';

/*
 * Grade de batalha: posição, medição e áreas, em quadrados.
 *
 * Mora no próprio encontro, para continuar legível no Obsidian:
 *
 *   ---
 *   tipo: encontro
 *   grade: 24x16          colunas x linhas
 *   quadrado: 1,5 m       quanto vale um quadrado (ou "5 ft")
 *   diagonal: padrão      padrão | alternada | real | manhattan
 *   mapa: "[[cripta.png]]"
 *   ---
 *
 *   | Nome     | ... | Lado    | Pos | Tam |
 *   | [[Kael]] | ... | grupo   | C4  |     |
 *   | Ogro     | ... | inimigo | J7  | 2   |
 *
 * As casas têm nome de planilha: coluna em letra (A, B, ..., Z, AA) e linha
 * em número (1, 2, ...). A casa (x, y) ocupa o espaço [x, x+1] × [y, y+1];
 * um ponto contínuo (para réguas e áreas) usa a mesma unidade.
 */

export interface Cell {
  x: number;
  y: number;
}

/** ponto contínuo, em quadrados (0,0 é o canto de cima à esquerda) */
export interface Point {
  x: number;
  y: number;
}

/**
 * Como contar a diagonal:
 * - padrao: toda diagonal vale 1 (D&D 5e, livro do jogador)
 * - alternada: 1, 2, 1, 2... (regra opcional do 5e, Pathfinder)
 * - real: distância em linha reta
 * - manhattan: sem diagonal (anda só em cruz)
 */
export type DiagonalRule = 'padrao' | 'alternada' | 'real' | 'manhattan';

export interface GridSettings {
  cols: number;
  rows: number;
  /** quanto vale um quadrado, na unidade abaixo */
  scale: number;
  unit: string;
  diagonal: DiagonalRule;
  /** imagem de fundo (alvo do link, sem [[ ]]); "" sem mapa */
  image: string;
}

export const GRID_MIN = 4;
export const GRID_MAX = 100;
export const DEFAULT_GRID: GridSettings = { cols: 24, rows: 16, scale: 1.5, unit: 'm', diagonal: 'padrao', image: '' };

export const DIAGONAL_RULES: Array<[DiagonalRule, string]> = [
  ['padrao', 'Padrão (diagonal = 1)'],
  ['alternada', 'Alternada (1, 2, 1, 2…)'],
  ['real', 'Linha reta'],
  ['manhattan', 'Sem diagonal'],
];

// ------------------------------------------------------------ nomes de casa

/** "C4" para a casa (2, 3): coluna em letra como na planilha, linha a partir de 1. */
export const cellName = (c: Cell): string => `${colName(c.x)}${c.y + 1}`;

/** "C4" → { x: 2, y: 3 }; aceita minúsculas e espaço ("c 4"). */
export function parseCell(s: string): Cell | null {
  const m = /^\s*([A-Za-z]{1,3})\s*(\d{1,4})\s*$/.exec(s);
  if (!m) return null;
  const y = Number(m[2]);
  if (y < 1) return null;
  return { x: colIndex(m[1]!), y: y - 1 };
}

// ------------------------------------------------------------ configuração

const clampSize = (n: number) => Math.min(GRID_MAX, Math.max(GRID_MIN, Math.round(n)));

function parseDiagonal(s: string): DiagonalRule {
  const t = s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/^(alt|5-10|1-2|variante|pathfinder)/.test(t)) return 'alternada';
  if (/^(real|reta|euclid|linha)/.test(t)) return 'real';
  if (/^(manhattan|cruz|sem|nenhuma|taxi)/.test(t)) return 'manhattan';
  return 'padrao';
}

/** "1,5 m" → { 1.5, 'm' }; "5 ft" / "5 pés" → { 5, 'ft' }. */
export function parseScale(s: string): { scale: number; unit: string } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*([^\d\s].*)?$/.exec(s);
  if (!m) return null;
  const scale = Number(m[1]!.replace(',', '.'));
  if (!(scale > 0)) return null;
  let unit = (m[2] ?? '').trim() || 'm';
  if (/^(p[eé]s?|feet|foot|')$/i.test(unit)) unit = 'ft';
  if (/^(metros?|mts?)$/i.test(unit)) unit = 'm';
  return { scale, unit };
}

/** Lê a grade das propriedades do encontro (com valores-padrão no que faltar). */
export function readGrid(props: Props): GridSettings {
  const g: GridSettings = { ...DEFAULT_GRID };
  const size = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(asText(props['grade'] ?? props['grid']));
  if (size) {
    g.cols = clampSize(Number(size[1]));
    g.rows = clampSize(Number(size[2]));
  }
  const sc = parseScale(asText(props['quadrado'] ?? props['escala'] ?? props['square']));
  if (sc) Object.assign(g, sc);
  const d = asText(props['diagonal']);
  if (d) g.diagonal = parseDiagonal(d);
  const img = asText(props['mapa'] ?? props['map']).trim();
  g.image = img ? linkTarget(img.replace(/^!?\[\[|\]\]$/g, '')) : '';
  return g;
}

const DIAG_WORD: Record<DiagonalRule, string> = { padrao: 'padrão', alternada: 'alternada', real: 'real', manhattan: 'manhattan' };
const numPt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ','));

/** Propriedades para `setProps` (o que for padrão sai da nota, para não sujar). */
export function gridProps(g: GridSettings): Record<string, string | null> {
  const d = DEFAULT_GRID;
  return {
    grade: `${clampSize(g.cols)}x${clampSize(g.rows)}`,
    quadrado: g.scale === d.scale && g.unit === d.unit ? null : `${numPt(g.scale)} ${g.unit}`,
    diagonal: g.diagonal === d.diagonal ? null : DIAG_WORD[g.diagonal],
    mapa: g.image ? `[[${g.image}]]` : null,
  };
}

// ------------------------------------------------------------ tamanho de criatura

const SIZE_WORDS: Array<[RegExp, number]> = [
  [/^(mi[uú]d|min[uú]sc|tiny|pequen|small|m[eé]di|medium)/, 1],
  [/^(grand|large)/, 2],
  [/^(enorm|huge)/, 3],
  [/^(imens|colossal|gargant|descomun)/, 4],
];

/** Quantos quadrados de lado a ficha ocupa ("grande" → 2, "3" → 3). */
export function parseTokenSize(s: string): number {
  const t = s.trim().toLowerCase();
  if (!t) return 1;
  const n = Number(t.replace(',', '.'));
  if (Number.isFinite(n) && n > 0) return Math.min(6, Math.max(1, Math.round(n)));
  for (const [re, v] of SIZE_WORDS) if (re.test(t)) return v;
  return 1;
}

/** As casas que uma ficha de lado `size` ocupa a partir do canto `c`. */
export function footprint(c: Cell, size = 1): Cell[] {
  const out: Cell[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: c.x + dx, y: c.y + dy });
  return out;
}

/** Põe a ficha dentro da grade (ficha grande no canto não vaza). */
export function clampCell(c: Cell, g: Pick<GridSettings, 'cols' | 'rows'>, size = 1): Cell {
  return {
    x: Math.min(g.cols - size, Math.max(0, Math.round(c.x))),
    y: Math.min(g.rows - size, Math.max(0, Math.round(c.y))),
  };
}

// ------------------------------------------------------------ distância

/**
 * Custo de um trecho em quadrados. `diagonals` é quantas diagonais já foram
 * andadas antes (a regra alternada lembra da paridade entre trechos).
 */
export function stepDistance(a: Cell, b: Cell, rule: DiagonalRule, diagonals = 0): { squares: number; diagonals: number } {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const diag = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diag;
  switch (rule) {
    case 'manhattan':
      return { squares: dx + dy, diagonals };
    case 'real':
      return { squares: Math.hypot(dx, dy), diagonals };
    case 'alternada': {
      // a 2ª, 4ª, 6ª... diagonal do caminho todo custam 2
      const extra = Math.floor((diagonals + diag) / 2) - Math.floor(diagonals / 2);
      return { squares: straight + diag + extra, diagonals: diagonals + diag };
    }
    default:
      return { squares: straight + diag, diagonals: diagonals + diag };
  }
}

export const gridDistance = (a: Cell, b: Cell, rule: DiagonalRule): number => stepDistance(a, b, rule).squares;

/** Distância de um caminho com paradas (régua com vários pontos, ou um movimento). */
export function pathDistance(path: Cell[], rule: DiagonalRule): number {
  let total = 0;
  let diagonals = 0;
  for (let i = 1; i < path.length; i++) {
    const s = stepDistance(path[i - 1]!, path[i]!, rule, diagonals);
    total += s.squares;
    diagonals = s.diagonals;
  }
  return total;
}

/**
 * Distância entre duas fichas (de borda a borda, como se mede alcance):
 * a menor distância entre quaisquer casas das duas.
 */
export function tokenDistance(a: Cell, sa: number, b: Cell, sb: number, rule: DiagonalRule): number {
  const gap = (a0: number, a1: number, b0: number, b1: number) => (b0 > a1 ? b0 - a1 : a0 > b1 ? a0 - b1 : 0);
  const dx = gap(a.x, a.x + sa - 1, b.x, b.x + sb - 1);
  const dy = gap(a.y, a.y + sa - 1, b.y, b.y + sb - 1);
  return gridDistance({ x: 0, y: 0 }, { x: dx, y: dy }, rule);
}

/** "6 q · 9 m" — quadrados e a medida da mesa. */
export function distanceLabel(squares: number, g: Pick<GridSettings, 'scale' | 'unit'>): string {
  const r1 = (n: number) => numPt(Math.round(n * 10) / 10);
  return `${r1(squares)} q · ${r1(squares * g.scale)} ${g.unit}`;
}

/**
 * Deslocamento da ficha em quadrados ("9 m", "30 ft", "9 m, voo 18 m" → o
 * primeiro). Converte metro e pé pela conta da mesa (1,5 m = 5 ft); sem
 * unidade, vale a da grade.
 */
export function speedSquares(speed: string, g: Pick<GridSettings, 'scale' | 'unit'>): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(m\b|metros?|ft\b|p[eé]s?\b|q\b|quadrados?)?/i.exec(speed);
  if (!m) return null;
  let v = Number(m[1]!.replace(',', '.'));
  const u = (m[2] ?? '').toLowerCase();
  if (/^q/.test(u)) return Math.floor(v);
  const unit = !u ? g.unit : /^(ft|p)/.test(u) ? 'ft' : 'm';
  if (unit !== g.unit) {
    if (unit === 'ft' && g.unit === 'm') v *= 0.3;
    else if (unit === 'm' && g.unit === 'ft') v /= 0.3;
    else return null;
  }
  return Math.floor(v / g.scale + 1e-6);
}

// ------------------------------------------------------------ áreas

export type AreaShape = 'circulo' | 'cone' | 'linha' | 'quadrado';

export const AREA_SHAPES: Array<[AreaShape, string]> = [
  ['circulo', 'Círculo'],
  ['cone', 'Cone'],
  ['linha', 'Linha'],
  ['quadrado', 'Cubo'],
];

export interface Area {
  shape: AreaShape;
  origin: Point;
  /** tamanho em quadrados (raio do círculo, comprimento do cone/linha, lado do cubo) */
  size: number;
  /** direção, em radianos (cone e linha) */
  angle: number;
  /** cubo: para que lado cresce a partir da origem */
  sx: 1 | -1;
  sy: 1 | -1;
}

/** meia abertura do cone de D&D: a largura no fim é igual ao comprimento */
const CONE_HALF = Math.atan(0.5);
const EPS = 1e-6;

/** Prende o ponto a meio quadrado (cantos e centros das casas). */
export const snapHalf = (p: Point): Point => ({ x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 });

/** Monta a área arrastando da origem até `target` (tamanho em quadrados inteiros, mínimo 1). */
export function makeArea(shape: AreaShape, origin: Point, target: Point): Area {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = shape === 'quadrado' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
  return {
    shape,
    origin,
    size: Math.max(1, Math.round(len)),
    angle: Math.atan2(dy, dx),
    sx: dx < 0 ? -1 : 1,
    sy: dy < 0 ? -1 : 1,
  };
}

/** Se o centro da casa está dentro da área (o critério "metade da casa coberta"). */
export function inArea(a: Area, c: Cell): boolean {
  const px = c.x + 0.5 - a.origin.x;
  const py = c.y + 0.5 - a.origin.y;
  switch (a.shape) {
    case 'circulo':
      return Math.hypot(px, py) <= a.size + EPS;
    case 'quadrado': {
      const u = px * a.sx;
      const v = py * a.sy;
      return u >= -EPS && v >= -EPS && u <= a.size + EPS && v <= a.size + EPS;
    }
    case 'linha': {
      const along = px * Math.cos(a.angle) + py * Math.sin(a.angle);
      const across = -px * Math.sin(a.angle) + py * Math.cos(a.angle);
      return along >= -EPS && along <= a.size + EPS && Math.abs(across) <= 0.5 + EPS;
    }
    case 'cone': {
      const d = Math.hypot(px, py);
      if (d < EPS || d > a.size + EPS) return false;
      let diff = Math.atan2(py, px) - a.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      return Math.abs(diff) <= CONE_HALF + EPS;
    }
  }
}

/** As casas que a área cobre, dentro da grade. */
export function areaCells(a: Area, g: Pick<GridSettings, 'cols' | 'rows'>): Cell[] {
  const r = a.size + 1;
  const x0 = Math.max(0, Math.floor(a.origin.x - r));
  const x1 = Math.min(g.cols - 1, Math.ceil(a.origin.x + r));
  const y0 = Math.max(0, Math.floor(a.origin.y - r));
  const y1 = Math.min(g.rows - 1, Math.ceil(a.origin.y + r));
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inArea(a, { x, y })) out.push({ x, y });
  return out;
}

/** Quem a área atinge: qualquer casa da ficha dentro dela. */
export function tokensHit<T extends { pos?: Cell | null; size?: number }>(cells: Cell[], tokens: T[]): T[] {
  const set = new Set(cells.map((c) => `${c.x},${c.y}`));
  return tokens.filter((t) => t.pos && footprint(t.pos, t.size ?? 1).some((c) => set.has(`${c.x},${c.y}`)));
}
