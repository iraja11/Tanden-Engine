/*
 * Dificuldade de encontros (regras do Livro do Mestre do D&D 5e).
 *
 * Soma o XP dos inimigos, multiplica pela quantidade deles (muitos inimigos
 * fracos dão mais trabalho que um forte) e compara com os limites do grupo.
 */

export type Difficulty = 'trivial' | 'fácil' | 'médio' | 'difícil' | 'mortal';
export const DIFFICULTIES: Difficulty[] = ['trivial', 'fácil', 'médio', 'difícil', 'mortal'];

/** limites de XP por nível de personagem: fácil, médio, difícil, mortal */
const THRESHOLDS: Array<[number, number, number, number]> = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];

const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
  '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000,
  '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000, '26': 90000,
  '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

/** "1/4", "0,25", "ND 2", "2" → a chave da tabela ("1/4", "2"); null se não é um ND. */
export function normalizeCr(raw: string | number): string | null {
  const s = String(raw).trim().toLowerCase().replace(/^(nd|cr)\s*/, '').replace(',', '.');
  if (!s) return null;
  if (s in CR_XP) return s;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const frac: Record<string, string> = { '0.125': '1/8', '0.25': '1/4', '0.5': '1/2' };
  const k = frac[String(n)] ?? String(n);
  return k in CR_XP ? k : null;
}

/** XP de um ND; null se o ND não existe. */
export function crXp(raw: string | number): number | null {
  const k = normalizeCr(raw);
  return k === null ? null : CR_XP[k]!;
}

const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

/** Multiplicador pela quantidade de inimigos, ajustado pelo tamanho do grupo. */
export function encounterMultiplier(monsters: number, partySize: number): number {
  if (monsters <= 0) return 1;
  let i = monsters === 1 ? 1 : monsters === 2 ? 2 : monsters <= 6 ? 3 : monsters <= 10 ? 4 : monsters <= 14 ? 5 : 6;
  if (partySize > 0 && partySize < 3) i++;
  else if (partySize >= 6) i--;
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, i))]!;
}

export interface EncounterBudget {
  easy: number;
  medium: number;
  hard: number;
  deadly: number;
}

/** Limites do grupo inteiro (soma dos limites de cada personagem). */
export function partyThresholds(levels: number[]): EncounterBudget {
  const b = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const l of levels) {
    const t = THRESHOLDS[Math.max(1, Math.min(20, Math.round(l))) - 1]!;
    b.easy += t[0];
    b.medium += t[1];
    b.hard += t[2];
    b.deadly += t[3];
  }
  return b;
}

export interface EncounterRating {
  /** XP de verdade (o que o grupo ganha) */
  xp: number;
  /** XP ajustado pela quantidade, o que mede a dificuldade */
  adjusted: number;
  multiplier: number;
  budget: EncounterBudget;
  difficulty: Difficulty;
  /** XP para cada personagem */
  xpEach: number;
  /** inimigos sem ND conhecido (ficam fora da conta) */
  unknown: number;
}

/** Avalia um encontro: níveis do grupo e o ND de cada inimigo. */
export function rateEncounter(levels: number[], crs: Array<string | number | null>): EncounterRating {
  const xps = crs.map((c) => (c === null ? null : crXp(c)));
  const known = xps.filter((x): x is number => x !== null);
  const xp = known.reduce((a, b) => a + b, 0);
  const multiplier = encounterMultiplier(known.length, levels.length);
  const adjusted = Math.round(xp * multiplier);
  const budget = partyThresholds(levels);
  const difficulty: Difficulty = !levels.length || adjusted < budget.easy ? 'trivial'
    : adjusted < budget.medium ? 'fácil' : adjusted < budget.hard ? 'médio' : adjusted < budget.deadly ? 'difícil' : 'mortal';
  return { xp, adjusted, multiplier, budget, difficulty, xpEach: levels.length ? Math.floor(xp / levels.length) : 0, unknown: xps.length - known.length };
}
