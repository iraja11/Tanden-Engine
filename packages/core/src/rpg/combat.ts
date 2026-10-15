import { asText, parseProps, setProps } from '../caderno/frontmatter';
import { getSection, readRecords, setSection, writeRecords, type Rec } from '../caderno/markdown';

/*
 * Encontro (combate): uma nota comum com a ordem de iniciativa numa tabela.
 *
 *   ---
 *   tipo: encontro
 *   campanha: "[[A Mina Perdida]]"
 *   rodada: 2
 *   vez: Goblin 1
 *   ---
 *   # Emboscada na estrada
 *
 *   ## Combatentes
 *   | Nome     | Iniciativa | Mod | PV | PV máx | CA | Condições  | Lado    |
 *   | [[Kael]] | 17         | +2  | 21 | 24     | 16 |            | grupo   |
 *   | Goblin 1 | 12         | +2  | 3  | 7      | 15 | caído      | inimigo |
 *
 *   ## Registro
 *   - R1 · Kael acerta Goblin 1: 4 de dano
 *
 * Abre e edita igual no Obsidian; o Tanden só sabe onde mexer.
 */

export interface Combatant {
  name: string;
  /** null = ainda não rolou */
  init: number | null;
  /** modificador de iniciativa, para rolar e desempatar */
  mod: number;
  hp: number | null;
  hpMax: number | null;
  ac: number | null;
  conditions: string[];
  side: 'grupo' | 'inimigo' | 'aliado' | string;
  /** linha de origem na tabela (colunas extras sobrevivem) */
  _i?: number;
}

export interface Encounter {
  round: number;
  /** nome de quem está na vez; null antes de começar */
  turn: string | null;
  list: Combatant[];
}

const COLS = {
  name: ['Nome', 'Combatente', 'Name'],
  init: ['Iniciativa', 'Inic', 'Init', 'Initiative'],
  mod: ['Mod', 'Mod. inic.', 'Modificador', 'Bônus'],
  hp: ['PV', 'HP', 'Vida'],
  hpMax: ['PV máx', 'PV max', 'HP max', 'Max HP'],
  ac: ['CA', 'AC', 'Defesa'],
  cond: ['Condições', 'Condicoes', 'Conditions', 'Estado'],
  side: ['Lado', 'Side', 'Time'],
};
type Col = keyof typeof COLS;

const SECTION = 'Combatentes';
const LOG = 'Registro';

const int = (s: string): number | null => {
  const m = /^\s*([+−-]?\s*\d+)/.exec(s);
  return m ? Number(m[1]!.replace(/\s/g, '').replace('−', '-')) : null;
};

export function readEncounter(text: string): Encounter {
  const props = parseProps(text);
  const round = int(asText(props['rodada'] ?? props['round'])) ?? 0;
  const turn = asText(props['vez'] ?? props['turn']).trim() || null;
  const list = readRecords(text, SECTION, COLS).filter((r) => r.name.trim()).map((r): Combatant => ({
    name: r.name.trim(),
    init: int(r.init),
    mod: int(r.mod) ?? 0,
    hp: int(r.hp),
    hpMax: int(r.hpMax),
    ac: int(r.ac),
    conditions: r.cond.split(',').map((c) => c.trim()).filter(Boolean),
    side: r.side.trim().toLowerCase() || 'inimigo',
    _i: r._i,
  }));
  return { round, turn, list };
}

const sgn = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function writeEncounter(text: string, e: Encounter): string {
  const recs = e.list.map((c): Rec<Col> => ({
    name: c.name,
    init: c.init === null ? '' : String(c.init),
    mod: sgn(c.mod),
    hp: c.hp === null ? '' : String(c.hp),
    hpMax: c.hpMax === null ? '' : String(c.hpMax),
    ac: c.ac === null ? '' : String(c.ac),
    cond: c.conditions.join(', '),
    side: c.side,
    ...(c._i !== undefined ? { _i: c._i } : {}),
  }));
  let out = writeRecords(text, SECTION, COLS, recs);
  out = setProps(out, { rodada: String(e.round), vez: e.turn ?? null });
  return out;
}

/** Ordem de iniciativa: maior primeiro; empate pelo modificador, depois pelo nome. Quem não rolou vai para o fim. */
export function sortByInit(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    if (a.init === null || b.init === null) return a.init === null ? (b.init === null ? 0 : 1) : -1;
    return b.init - a.init || b.mod - a.mod || a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
  });
}

/** Nome livre na lista: "Goblin" → "Goblin 3" se já existem 1 e 2. */
export function freeName(list: Combatant[], base: string): string {
  const plain = base.replace(/^\[\[|\]\]$/g, '');
  const taken = new Set(list.map((c) => c.name.replace(/^\[\[|\]\]$/g, '').toLowerCase()));
  if (!taken.has(plain.toLowerCase())) return base;
  // "Goblin 1" ocupado → "Goblin 3" (o próximo número livre), não "Goblin 1 2"
  const m = /^(.*\S)\s+(\d+)$/.exec(plain);
  const stem = m ? m[1]! : plain;
  let n = 2;
  while (taken.has(`${stem} ${n}`.toLowerCase())) n++;
  return `${stem} ${n}`;
}

/** Acrescenta `count` cópias; com mais de uma, ganham números ("Goblin 1", "Goblin 2"). */
export function addCombatants(e: Encounter, c: Omit<Combatant, '_i'>, count = 1): Encounter {
  const list = [...e.list];
  const plain = c.name.replace(/^\[\[|\]\]$/g, '').replace(/\|.*$/, '');
  for (let i = 0; i < count; i++) {
    const name = count > 1 ? freeName(list, `${plain} ${i + 1}`) : freeName(list, c.name);
    list.push({ ...c, name, conditions: [...c.conditions] });
  }
  return { ...e, list };
}

/** Quem está "fora" (PV 0 de inimigo) é pulado na vez. */
export const isOut = (c: Combatant): boolean => c.hp !== null && c.hp <= 0 && c.side !== 'grupo';

/** Começa (rodada 1, vez do primeiro) ou passa para o próximo; dá a volta e soma a rodada. */
export function nextTurn(e: Encounter): Encounter {
  const order = sortByInit(e.list).filter((c) => !isOut(c));
  if (!order.length) return e;
  if (!e.turn || e.round < 1) return { ...e, list: sortByInit(e.list), round: Math.max(1, e.round), turn: order[0]!.name };
  const all = sortByInit(e.list);
  const at = all.findIndex((c) => c.name === e.turn);
  // procura o próximo que não está fora, a partir de onde estava
  for (let k = 1; k <= all.length; k++) {
    const i = (Math.max(at, -1) + k) % all.length;
    const wrapped = at >= 0 && i <= at;
    if (!isOut(all[i]!)) return { ...e, list: all, turn: all[i]!.name, round: wrapped ? e.round + 1 : e.round };
  }
  return e;
}

/** Volta uma vez (para corrigir um clique). */
export function prevTurn(e: Encounter): Encounter {
  if (!e.turn) return e;
  const all = sortByInit(e.list);
  const at = all.findIndex((c) => c.name === e.turn);
  for (let k = 1; k <= all.length; k++) {
    const i = (((at < 0 ? 0 : at) - k) % all.length + all.length) % all.length;
    const wrapped = at < 0 || i >= at;
    if (!isOut(all[i]!)) {
      const round = wrapped ? e.round - 1 : e.round;
      if (round < 1) return { ...e, list: all, turn: null, round: 0 };
      return { ...e, list: all, turn: all[i]!.name, round };
    }
  }
  return e;
}

/** Dano (positivo) ou cura (negativo); PV fica entre 0 e o máximo. */
export function changeHp(e: Encounter, name: string, amount: number): Encounter {
  return {
    ...e,
    list: e.list.map((c) => {
      if (c.name !== name) return c;
      const cur = c.hp ?? c.hpMax ?? 0;
      let hp = Math.max(0, cur - amount);
      if (c.hpMax !== null) hp = Math.min(c.hpMax, hp);
      const conditions = hp > 0 ? c.conditions.filter((x) => x.toLowerCase() !== 'caído') : c.conditions;
      return { ...c, hp, conditions };
    }),
  };
}

export function update(e: Encounter, name: string, patch: Partial<Combatant>): Encounter {
  let turn = e.turn;
  if (patch.name !== undefined && patch.name !== name) {
    patch = { ...patch, name: freeName(e.list.filter((c) => c.name !== name), patch.name) };
    if (turn === name) turn = patch.name!;
  }
  return { ...e, turn, list: e.list.map((c) => (c.name === name ? { ...c, ...patch } : c)) };
}

export function removeCombatant(e: Encounter, name: string): Encounter {
  let next = e;
  if (e.turn === name) {
    const moved = nextTurn(e);
    next = moved.turn === name ? { ...e, turn: null } : moved;
  }
  return { ...next, list: next.list.filter((c) => c.name !== name) };
}

export function toggleCondition(e: Encounter, name: string, cond: string): Encounter {
  return {
    ...e,
    list: e.list.map((c) => {
      if (c.name !== name) return c;
      const has = c.conditions.some((x) => x.toLowerCase() === cond.toLowerCase());
      return { ...c, conditions: has ? c.conditions.filter((x) => x.toLowerCase() !== cond.toLowerCase()) : [...c.conditions, cond] };
    }),
  };
}

/** Rola iniciativa para quem ainda não tem (ou para todos). `roll` recebe o modificador. */
export function rollInitiative(e: Encounter, roll: (mod: number, c: Combatant) => number, all = false): Encounter {
  return { ...e, list: sortByInit(e.list.map((c) => (all || c.init === null ? { ...c, init: roll(c.mod, c) } : c))) };
}

/** Fim do combate: volta a rodada a zero (os combatentes ficam). */
export const endCombat = (e: Encounter): Encounter => ({ ...e, round: 0, turn: null });

export const CONDITIONS = [
  'caído', 'agarrado', 'amedrontado', 'atordoado', 'cego', 'concentrando', 'contido', 'enfeitiçado', 'envenenado',
  'impedido', 'incapacitado', 'inconsciente', 'invisível', 'paralisado', 'petrificado', 'surdo', 'exausto',
];

/** Acrescenta uma linha no "## Registro" (o diário do combate ou da sessão). */
export function appendLog(text: string, line: string, title = LOG): string {
  const cur = getSection(text, title);
  const body = (cur ?? '').replace(/\n+$/, '');
  const clean = line.replace(/\n/g, ' ').trim();
  return setSection(text, title, `${body.trim() ? `${body}\n` : ''}- ${clean}`);
}

export function encounterTemplate(name: string, campaign?: string): string {
  return `---
tipo: encontro${campaign ? `\ncampanha: "[[${campaign}]]"` : ''}
rodada: 0
---
# ${name}

## Combatentes

| Nome | Iniciativa | Mod | PV | PV máx | CA | Condições | Lado |
| ---- | ---------- | --- | -- | ------ | -- | --------- | ---- |

## Registro

`;
}
