import { asList, asText, parseProps, setProps, type Props, type PropValue } from '../caderno/frontmatter';
import { getSection, readRecords, sameTitle, setSection, writeRecords, type Rec } from '../caderno/markdown';
import {
  ARMOR_TRAINING, WEAPON_TRAINING, armorOf, classOf, formatClasses, levelForXp, metres, pactSlots, parseClasses, profForLevel,
  speciesOf, spellSlots, xpForNext, XP_TABLE, type ArmorInfo, type ClassLevel,
} from './regras5e';
import { ATTRS, SHEET_FIELDS, SKILLS_5E, findPropKey, isYes, readSheet, skillBonus, type Sheet } from './sheet';

/*
 * Ficha de personagem completa (modelo da ficha de 2024): tudo o que a
 * ficha de jogo (`sheet.ts`) já lê, mais identidade, XP, dados de vida,
 * testes contra a morte, treinos, idiomas, sintonização, conjuração,
 * espaços de magia, magias e os textos (características, traços, talentos,
 * aparência, história). As contas (nível por XP, proficiência, CD de magia,
 * espaços por classe, PV máximo, CA) saem das tabelas de `regras5e.ts`.
 *
 * Continua sendo uma nota comum: propriedades no topo e seções no texto.
 *
 *   espécie: Elfo                  dados de vida gastos: 1
 *   antecedente: Sábio             espaços gastos: ["1:2"]
 *   classe: Mago                   idiomas: [Comum, Élfico]
 *   xp: 2900                       sintonização: [Anel de Proteção]
 *
 *   ## Magias
 *   | Nível | Nome         | Tempo  | Alcance | C/R/M | Prep. | Notas |
 *   | 0     | Raio de Fogo | 1 ação | 36 m    |       |       | 1d10  |
 */

const CHAR = {
  pronouns: ['pronomes', 'pronouns'],
  species: ['espécie', 'especie', 'raça', 'raca', 'species', 'race', 'ancestralidade'],
  background: ['antecedente', 'background', 'origem'],
  alignment: ['alinhamento', 'alignment', 'tendência', 'tendencia'],
  size: ['tamanho', 'size'],
  xp: ['xp', 'experiência', 'experiencia', 'pontos de experiência'],
  inspiration: ['inspiração', 'inspiracao', 'inspiração heroica', 'inspiracao heroica', 'inspiration'],
  hitDie: ['dado de vida', 'hit die'],
  hitDiceSpent: ['dados de vida gastos', 'dv gastos', 'dados de vida usados', 'hit dice spent'],
  deathSuccess: ['morte sucessos', 'sucessos contra a morte', 'death successes'],
  deathFail: ['morte falhas', 'falhas contra a morte', 'death failures'],
  exhaustion: ['exaustão', 'exaustao', 'exhaustion'],
  conditions: ['condições', 'condicoes', 'conditions'],
  armorTraining: ['treino em armaduras', 'treinamento em armaduras', 'armaduras treinadas', 'armor training'],
  weaponTraining: ['treino em armas', 'treinamento em armas', 'armas treinadas', 'weapon training'],
  weapons: ['outras armas', 'armas', 'weapons'],
  tools: ['ferramentas', 'tools'],
  languages: ['idiomas', 'línguas', 'linguas', 'languages'],
  attunement: ['sintonização', 'sintonizacao', 'itens sintonizados', 'attunement'],
  spellAbility: ['atributo de conjuração', 'atributo de conjuracao', 'conjuração', 'conjuracao', 'spellcasting ability'],
  slots: ['espaços de magia', 'espacos de magia', 'spell slots'],
  slotsSpent: ['espaços gastos', 'espacos gastos', 'spell slots spent'],
  pactSpent: ['pacto gastos', 'espaços de pacto gastos', 'espacos de pacto gastos'],
} as const;

export type CharField = keyof typeof CHAR | 'subclass' | 'armor' | 'shield' | 'klass' | 'level' | 'speed' | 'hp' | 'hpMax' | 'hpTemp' | 'saves';

/** Os textos longos da ficha: cada um é uma seção "## título" da nota. */
export const SHEET_TEXTS = [
  { key: 'features', title: 'Características de classe' },
  { key: 'traits', title: 'Traços de espécie' },
  { key: 'feats', title: 'Talentos' },
  { key: 'appearance', title: 'Aparência' },
  { key: 'story', title: 'História e personalidade' },
] as const;
export type SheetTextKey = (typeof SHEET_TEXTS)[number]['key'];

export const SPELLS = 'Magias';
const SPELL_COLS = {
  level: ['nível', 'nivel', 'nv', 'círculo', 'circulo', 'level'],
  name: ['nome', 'magia', 'name'],
  time: ['tempo', 'tempo de conjuração', 'conjuração', 'casting time'],
  range: ['alcance', 'range'],
  marks: ['c/r/m', 'crm', 'marcas', 'componentes'],
  prepared: ['prep.', 'prep', 'preparada', 'preparado', 'prepared'],
  notes: ['notas', 'efeito', 'notes'],
};

export interface Spell {
  /** 0 = truque */
  level: number;
  name: string;
  time: string;
  range: string;
  concentration: boolean;
  ritual: boolean;
  material: boolean;
  prepared: boolean;
  notes: string;
  _i?: number;
}

export interface SlotState {
  level: number;
  total: number;
  spent: number;
}

export interface HitDie {
  die: number;
  total: number;
  spent: number;
}

export interface Casting {
  ability: string;
  label: string;
  mod: number;
  /** CD de resistência: 8 + prof + mod */
  dc: number;
  /** bônus de ataque mágico: prof + mod */
  attack: number;
}

export interface Character {
  sheet: Sheet;
  pronouns: string;
  species: string;
  background: string;
  subclass: string;
  alignment: string;
  size: string;
  sizeAuto: boolean;
  speed: string;
  speedAuto: boolean;
  classes: ClassLevel[];
  /** nível do personagem (soma das classes) */
  level: number;
  xp: number | null;
  /** nível que o XP já permite */
  xpLevel: number | null;
  /** XP do começo do nível atual e do próximo */
  xpFloor: number;
  xpNext: number | null;
  canLevelUp: boolean;
  inspiration: boolean;
  shield: boolean;
  armor: string;
  armorInfo: ArmorInfo | null;
  hitDice: HitDie[];
  /** PV máximo pela regra (máximo do dado no 1º nível, média depois) */
  hpMaxAuto: number | null;
  death: { success: number; fail: number };
  exhaustion: number;
  conditions: string[];
  armorTraining: string[];
  weaponTraining: string[];
  weapons: string;
  tools: string;
  languages: string[];
  attunement: string[];
  casting: Casting | null;
  slots: SlotState[];
  pact: SlotState | null;
  spells: Spell[];
  passive: { perception: number; insight: number; investigation: number };
  /** penalidade nos testes de d20 (exaustão: −2 por nível) */
  d20Penalty: number;
  texts: Record<SheetTextKey, string>;
  /** nome da propriedade na nota para cada campo (o que existe, ou o nome padrão) */
  keys: Record<CharField, string>;
}

const ALL: Record<CharField, readonly string[]> = {
  ...CHAR,
  subclass: SHEET_FIELDS.subclass,
  armor: SHEET_FIELDS.armor,
  shield: SHEET_FIELDS.shield,
  klass: SHEET_FIELDS.klass,
  level: SHEET_FIELDS.level,
  speed: SHEET_FIELDS.speed,
  hp: SHEET_FIELDS.hp,
  hpMax: SHEET_FIELDS.hpMax,
  hpTemp: SHEET_FIELDS.hpTemp,
  saves: SHEET_FIELDS.saves,
};

const numOf = (v: PropValue | undefined): number | null => {
  const m = /^\s*([+-]?\d+(?:[.,]\d+)?)/.exec(asText(v).replace(/\./g, (d, i: number, s: string) => (/^\d{3}\b/.test(s.slice(i + 1)) ? '' : d)));
  return m ? Number(m[1]!.replace(',', '.')) : null;
};

const listOf = (v: PropValue | undefined): string[] =>
  asList(v).flatMap((x) => x.split(',')).map((x) => x.replace(/^\[\[|\]\]$/g, '').trim()).filter(Boolean);

/** "1:2, 2:1" / ["1:2"] / "2/1" → círculo → quantidade */
export function parseSlotMap(v: PropValue | undefined): Map<number, number> {
  const out = new Map<number, number>();
  const raw = asList(v).flatMap((x) => x.split(','));
  const pairs = raw.filter((x) => /\d\s*[:=]\s*\d/.test(x));
  if (pairs.length) {
    for (const p of pairs) {
      const m = /(\d+)\D*[:=]\s*(\d+)/.exec(p)!;
      out.set(Number(m[1]), Number(m[2]));
    }
  } else {
    raw.join(' ').split(/[/\s]+/).filter(Boolean).forEach((n, i) => {
      if (/^\d+$/.test(n)) out.set(i + 1, Number(n));
    });
  }
  return out;
}

const formatSlotMap = (m: Map<number, number>): string[] | null => {
  const xs = [...m.entries()].filter(([, n]) => n > 0).sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}:${n}`);
  return xs.length ? xs : null;
};

/** "2" / "d10:1, d6:2" → gasto por dado (um número só cai nos dados maiores primeiro) */
function parseHitDiceSpent(v: PropValue | undefined, dice: HitDie[]): Map<number, number> {
  const out = new Map<number, number>();
  const raw = asList(v).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean);
  const pairs = raw.filter((x) => /d\d+\s*[:=]/i.test(x));
  if (pairs.length) {
    for (const p of pairs) {
      const m = /d(\d+)\s*[:=]\s*(\d+)/i.exec(p);
      if (m) out.set(Number(m[1]), Number(m[2]));
    }
    return out;
  }
  let n = raw.reduce((s, x) => s + (Number(/\d+/.exec(x)?.[0]) || 0), 0);
  for (const d of [...dice].sort((a, b) => b.die - a.die)) {
    const take = Math.min(d.total, n);
    if (take) out.set(d.die, take);
    n -= take;
  }
  return out;
}

const attrLabel = (key: string): string => ATTRS.find((a) => a.key === key)?.label ?? key;
const attrKey = (s: string): string | null => {
  const a = ATTRS.find((x) => x.aliases.some((al) => sameTitle(al, s)) || sameTitle(x.label, s));
  return a?.key ?? null;
};

/** Lê a ficha completa. */
export function readCharacter(text: string, fallbackSystem?: string): Character {
  const props = parseProps(text);
  const keyOf = (f: CharField) => findPropKey(props, ALL[f]);
  const keys = Object.fromEntries((Object.keys(ALL) as CharField[]).map((f) => [f, keyOf(f) ?? ALL[f][0]!])) as Record<CharField, string>;
  const get = (f: CharField): PropValue | undefined => {
    const k = keyOf(f);
    return k ? props[k] : undefined;
  };
  const txt = (f: CharField) => asText(get(f)).trim();
  const base = readSheet(text, fallbackSystem);
  const subclass = txt('subclass');
  const classes = parseClasses(txt('klass'), base.level, subclass);
  const explicit = /\d/.test(txt('klass'));
  const level = Math.max(1, Math.min(20, explicit && classes.length ? classes.reduce((s, c) => s + c.level, 0) : base.level ?? 1));
  const profProp = findPropKey(props, SHEET_FIELDS.prof);
  const sheet: Sheet = base.system === '5e' && !profProp ? { ...base, level: base.level ?? (explicit ? level : null), prof: profForLevel(level) } : base;
  const mod = (k: string) => sheet.attrs.find((a) => a.key === k)?.mod ?? 0;

  // XP
  const xp = numOf(get('xp'));
  const xpLevel = xp === null ? null : levelForXp(xp);

  // identidade
  const species = txt('species').replace(/^\[\[|\]\]$/g, '');
  const sp = speciesOf(species);
  const sizeTxt = txt('size');
  const speedTxt = sheet.speed;

  // dados de vida
  const dieProp = numOf(txt('hitDie').replace(/^d/i, ''));
  const byDie = new Map<number, number>();
  if (classes.length) for (const c of classes) byDie.set(c.info?.die ?? dieProp ?? 8, (byDie.get(c.info?.die ?? dieProp ?? 8) ?? 0) + c.level);
  else byDie.set(dieProp ?? 8, level);
  const dice: HitDie[] = [...byDie.entries()].sort((a, b) => b[0] - a[0]).map(([die, total]) => ({ die, total, spent: 0 }));
  const spent = parseHitDiceSpent(get('hitDiceSpent'), dice);
  for (const d of dice) d.spent = Math.min(d.total, spent.get(d.die) ?? 0);

  // PV máximo pela regra
  let hpMaxAuto: number | null = null;
  if (sheet.system === '5e' && sheet.attrs.length) {
    const con = mod('con');
    const seq = classes.length ? classes : [{ level, info: null } as Pick<ClassLevel, 'level' | 'info'>];
    let total = 0;
    let first = true;
    for (const c of seq) {
      const die = c.info?.die ?? dieProp ?? 8;
      for (let i = 0; i < c.level; i++) {
        total += Math.max(1, (first ? die : die / 2 + 1) + con);
        first = false;
      }
    }
    hpMaxAuto = total;
  }

  // conjuração
  const abilityProp = attrKey(txt('spellAbility'));
  const ability = abilityProp ?? classes.find((c) => c.ability)?.ability ?? null;
  const casting: Casting | null = ability
    ? { ability, label: attrLabel(ability), mod: mod(ability), dc: 8 + sheet.prof + mod(ability), attack: sheet.prof + mod(ability) }
    : null;

  // espaços
  const auto = spellSlots(classes);
  const over = parseSlotMap(get('slots'));
  const used = parseSlotMap(get('slotsSpent'));
  const slots: SlotState[] = [];
  for (let l = 1; l <= 9; l++) {
    const total = over.get(l) ?? auto[l - 1] ?? 0;
    if (total > 0) slots.push({ level: l, total, spent: Math.min(total, used.get(l) ?? 0) });
  }
  const p = pactSlots(classes);
  const pact = p ? { level: p.level, total: p.total, spent: Math.min(p.total, numOf(get('pactSpent')) ?? 0) } : null;

  const sk = (n: string) => skillBonus(sheet, SKILLS_5E.find((x) => x.name === n)!).bonus;
  const exhaustion = Math.max(0, Math.min(6, numOf(get('exhaustion')) ?? 0));

  const texts = Object.fromEntries(SHEET_TEXTS.map((t) => [t.key, (getSection(text, t.title) ?? '').replace(/^\n+|\n+$/g, '')])) as Record<SheetTextKey, string>;

  return {
    sheet,
    pronouns: txt('pronouns'),
    species,
    background: txt('background').replace(/^\[\[|\]\]$/g, ''),
    subclass,
    alignment: txt('alignment'),
    size: sizeTxt || sp?.size || '',
    sizeAuto: !sizeTxt && !!sp,
    speed: speedTxt || (sp ? metres(sp.speed) : sheet.system === '5e' ? metres(9) : ''),
    speedAuto: !speedTxt,
    classes,
    level,
    xp,
    xpLevel,
    xpFloor: XP_TABLE[level - 1] ?? 0,
    xpNext: xpForNext(level),
    canLevelUp: xpLevel !== null && xpLevel > level && level < 20,
    inspiration: isYes(get('inspiration')),
    shield: isYes(get('shield')),
    armor: txt('armor'),
    armorInfo: armorOf(txt('armor')),
    hitDice: dice,
    hpMaxAuto,
    death: { success: Math.min(3, numOf(get('deathSuccess')) ?? 0), fail: Math.min(3, numOf(get('deathFail')) ?? 0) },
    exhaustion,
    conditions: listOf(get('conditions')),
    armorTraining: listOf(get('armorTraining')),
    weaponTraining: listOf(get('weaponTraining')),
    weapons: txt('weapons'),
    tools: txt('tools'),
    languages: listOf(get('languages')),
    attunement: listOf(get('attunement')).slice(0, 3),
    casting,
    slots,
    pact,
    spells: readSpells(text),
    passive: { perception: 10 + sk('Percepção'), insight: 10 + sk('Intuição'), investigation: 10 + sk('Investigação') },
    d20Penalty: exhaustion * 2,
    texts,
    keys,
  };
}

// ---------------------------------------------------------------- magias

const mark = (s: string, ch: string) => new RegExp(`(^|[^a-z])${ch}([^a-z]|$)`, 'i').test(s);

export function readSpells(text: string): Spell[] {
  return readRecords(text, SPELLS, SPELL_COLS)
    .filter((r) => r.name.trim())
    .map((r) => {
      const lv = /truque|cantrip/i.test(r.level) ? 0 : Number(/\d/.exec(r.level)?.[0] ?? 0);
      return {
        level: lv,
        name: r.name.trim(),
        time: r.time.trim(),
        range: r.range.trim(),
        concentration: mark(r.marks, 'c'),
        ritual: mark(r.marks, 'r'),
        material: mark(r.marks, 'm'),
        prepared: lv === 0 || isYes(r.prepared),
        notes: r.notes.trim(),
        _i: r._i,
      };
    });
}

export function writeSpells(text: string, spells: Spell[]): string {
  const sorted = [...spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'pt'));
  const recs = sorted.map((s): Rec<keyof typeof SPELL_COLS> => ({
    level: String(s.level),
    name: s.name,
    time: s.time,
    range: s.range,
    marks: [s.concentration && 'C', s.ritual && 'R', s.material && 'M'].filter(Boolean).join(' '),
    prepared: s.level > 0 && s.prepared ? 'x' : '',
    notes: s.notes,
    ...(s._i !== undefined ? { _i: s._i } : {}),
  }));
  return writeRecords(text, SPELLS, SPELL_COLS, recs);
}

/** Que espaço gastar para conjurar uma magia desse círculo: o menor livre (o de pacto se servir). */
export function slotFor(c: Pick<Character, 'slots' | 'pact'>, level: number): { kind: 'slot' | 'pact'; level: number } | null {
  if (level <= 0) return null;
  const s = c.slots.find((x) => x.level >= level && x.spent < x.total);
  const p = c.pact && c.pact.level >= level && c.pact.spent < c.pact.total ? c.pact : null;
  if (s && p) return s.level <= p.level ? { kind: 'slot', level: s.level } : { kind: 'pact', level: p.level };
  if (s) return { kind: 'slot', level: s.level };
  if (p) return { kind: 'pact', level: p.level };
  return null;
}

/** Marca (+1) ou devolve (−1) um espaço. */
export function useSlot(text: string, which: { kind: 'slot' | 'pact'; level: number }, delta = 1): string {
  const c = readCharacter(text);
  if (which.kind === 'pact') {
    if (!c.pact) return text;
    const n = Math.max(0, Math.min(c.pact.total, c.pact.spent + delta));
    return setProps(text, { [c.keys.pactSpent]: n ? String(n) : null });
  }
  const s = c.slots.find((x) => x.level === which.level);
  if (!s) return text;
  return setSlotsSpent(text, c, which.level, Math.max(0, Math.min(s.total, s.spent + delta)));
}

function setSlotsSpent(text: string, c: Character, level: number, n: number): string {
  const m = new Map(c.slots.map((s) => [s.level, s.spent]));
  m.set(level, n);
  return setProps(text, { [c.keys.slotsSpent]: formatSlotMap(m) });
}

// ---------------------------------------------------------------- nível

export interface LevelUp {
  text: string;
  level: number;
  /** PV ganhos */
  gain: number;
  /** classe que subiu */
  klass: string;
}

/** Média do dado de vida + CON (mínimo 1). `roll` usa um valor rolado no lugar da média. */
export function hpGain(die: number, con: number, roll?: number): number {
  return Math.max(1, (roll ?? die / 2 + 1) + con);
}

/**
 * Sobe um nível: na classe dada (ou na única/primeira), ou entra numa classe
 * nova (multiclasse). Soma os PV (média ou o valor rolado) ao máximo e ao atual.
 */
export function levelUp(text: string, opts: { klass?: string; roll?: number } = {}): LevelUp {
  const c = readCharacter(text);
  if (c.level >= 20) return { text, level: c.level, gain: 0, klass: c.classes[0]?.name ?? '' };
  const raw = asText(parseProps(text)[c.keys.klass]).trim();
  let classes = c.classes.map((x) => ({ name: x.name, level: x.level, info: x.info }));
  let target = opts.klass ? classes.find((x) => sameTitle(x.name, opts.klass!) || (x.info && x.info === classOf(opts.klass!))) : classes[0];
  if (!target && opts.klass) {
    target = { name: classOf(opts.klass)?.name ?? opts.klass.trim(), level: 0, info: classOf(opts.klass) };
    classes = [...classes, target];
  }
  const patch: Record<string, PropValue | null> = {};
  if (target) {
    target.level++;
    const keepBare = classes.length === 1 && !/\d/.test(raw);
    patch[c.keys.klass] = formatClasses(classes, keepBare);
  }
  const level = c.level + 1;
  patch[c.keys.level] = String(level);
  const die = target?.info?.die ?? (numOf(asText(parseProps(text)[c.keys.hitDie]).replace(/^d/i, '')) || 8);
  const con = c.sheet.attrs.find((a) => a.key === 'con')?.mod ?? 0;
  const gain = hpGain(die, con, opts.roll);
  if (c.sheet.system === '5e') {
    const max = c.sheet.hpMax ?? c.hpMaxAuto;
    if (max !== null) patch[c.sheet.keys.hpMax] = String(max + gain);
    if (c.sheet.hp !== null || max !== null) patch[c.sheet.keys.hp] = String((c.sheet.hp ?? max ?? 0) + gain);
  }
  return { text: setProps(text, patch), level, gain, klass: target?.name ?? '' };
}

// ---------------------------------------------------------------- descansos e dados de vida

function hitDiceProp(c: Character, spent: Map<number, number>): PropValue | null {
  const total = [...spent.values()].reduce((s, n) => s + n, 0);
  if (!total) return null;
  if (c.hitDice.length === 1) return String(total);
  return c.hitDice.filter((d) => (spent.get(d.die) ?? 0) > 0).map((d) => `d${d.die}:${spent.get(d.die)}`);
}

/** Gasta um dado de vida (descanso curto). Quem rola e cura é a interface. */
export function spendHitDie(text: string, die: number, delta = 1): string {
  const c = readCharacter(text);
  const d = c.hitDice.find((x) => x.die === die);
  if (!d) return text;
  const m = new Map(c.hitDice.map((x) => [x.die, x.spent]));
  m.set(die, Math.max(0, Math.min(d.total, d.spent + delta)));
  return setProps(text, { [c.keys.hitDiceSpent]: hitDiceProp(c, m) });
}

/** Descanso curto: devolve os espaços de pacto. */
export function shortRest(text: string): string {
  const c = readCharacter(text);
  return c.pact ? setProps(text, { [c.keys.pactSpent]: null }) : text;
}

/**
 * Descanso longo (2024): PV no máximo, sem PV temporários, todos os dados de
 * vida e espaços de volta, testes contra a morte zerados e um nível de
 * exaustão a menos.
 */
export function longRest(text: string): string {
  const c = readCharacter(text);
  const patch: Record<string, PropValue | null> = {
    [c.keys.hitDiceSpent]: null,
    [c.keys.slotsSpent]: null,
    [c.keys.pactSpent]: null,
    [c.keys.deathSuccess]: null,
    [c.keys.deathFail]: null,
    [c.sheet.keys.hpTemp]: null,
  };
  const max = c.sheet.hpMax ?? c.hpMaxAuto;
  if (max !== null) patch[c.sheet.keys.hp] = String(max);
  if (c.exhaustion > 0) patch[c.keys.exhaustion] = c.exhaustion > 1 ? String(c.exhaustion - 1) : null;
  // só mexe no que existe (não cria propriedades vazias)
  const props = parseProps(text);
  for (const [k, v] of Object.entries(patch)) if (v === null && !(k in props)) delete patch[k];
  return setProps(text, patch);
}

// ---------------------------------------------------------------- testes contra a morte

export interface DeathResult {
  success: number;
  fail: number;
  /** 20 natural: volta com 1 PV */
  revived: boolean;
  /** três sucessos: estável */
  stable: boolean;
  /** três falhas */
  dead: boolean;
}

/** Resultado de um teste contra a morte com o d20 natural. */
export function deathSave(cur: { success: number; fail: number }, natural: number): DeathResult {
  if (natural >= 20) return { success: 0, fail: 0, revived: true, stable: false, dead: false };
  let { success, fail } = cur;
  if (natural <= 1) fail += 2;
  else if (natural < 10) fail += 1;
  else success += 1;
  success = Math.min(3, success);
  fail = Math.min(3, fail);
  return { success, fail, revived: false, stable: success >= 3, dead: fail >= 3 };
}

export function setDeath(text: string, success: number, fail: number): string {
  const c = readCharacter(text);
  return setProps(text, { [c.keys.deathSuccess]: success ? String(success) : null, [c.keys.deathFail]: fail ? String(fail) : null });
}

// ---------------------------------------------------------------- classe

/**
 * Preenche o que a classe dá e ainda está vazio: salvaguardas, treino em
 * armaduras e armas, atributo de conjuração. Nunca apaga nada.
 */
export function applyClassDefaults(text: string): string {
  const c = readCharacter(text);
  const first = c.classes.find((x) => x.info)?.info;
  if (!first) return text;
  const props = parseProps(text);
  const has = (f: CharField) => findPropKey(props, ALL[f]) !== null && listOf(props[findPropKey(props, ALL[f])!]).length > 0;
  const patch: Record<string, PropValue> = {};
  if (!has('saves')) patch[c.keys.saves] = [...first.saves];
  const armor = new Set(c.classes.flatMap((x) => x.info?.armor ?? []));
  if (!has('armorTraining') && armor.size) patch[c.keys.armorTraining] = ARMOR_TRAINING.filter((a) => armor.has(a));
  const weapons = new Set(c.classes.flatMap((x) => x.info?.weapons ?? []));
  if (!has('weaponTraining') && weapons.size) patch[c.keys.weaponTraining] = WEAPON_TRAINING.filter((a) => weapons.has(a));
  return Object.keys(patch).length ? setProps(text, patch) : text;
}

/** Grava um texto longo (seção) da ficha. */
export function setSheetText(text: string, key: SheetTextKey, content: string): string {
  const t = SHEET_TEXTS.find((x) => x.key === key)!;
  if (!content.trim() && getSection(text, t.title) === null) return text;
  return setSection(text, t.title, content);
}

/** Liga/desliga um item numa propriedade de lista (idiomas, condições, treinos...). */
export function toggleInList(text: string, field: CharField, item: string): string {
  const c = readCharacter(text);
  const props: Props = parseProps(text);
  const cur = listOf(props[c.keys[field]]);
  const on = cur.some((x) => sameTitle(x, item));
  const next = on ? cur.filter((x) => !sameTitle(x, item)) : [...cur, item];
  return setProps(text, { [c.keys[field]]: next.length ? next : null });
}

// ---------------------------------------------------------------- ataques

const ATTACK_COLS = {
  name: ['ataque', 'nome', 'arma', 'name'],
  hit: ['acerto', 'bônus', 'bonus', 'atk', 'acerto/cd'],
  damage: ['dano', 'damage', 'dano e tipo'],
  notes: ['notas', 'propriedades', 'notes'],
};

export interface AttackRow {
  name: string;
  hit: string;
  damage: string;
  notes: string;
  _i?: number;
}

export function readAttackRows(text: string): AttackRow[] {
  return readRecords(text, 'Ataques', ATTACK_COLS).filter((r) => r.name.trim());
}

export function writeAttackRows(text: string, rows: AttackRow[]): string {
  return writeRecords<keyof typeof ATTACK_COLS>(text, 'Ataques', ATTACK_COLS, rows.map((r) => ({ ...r })));
}

/**
 * Bônus de acerto já somado, quando dá: "@for+@prof" → "+5"; "+3" → "+3".
 * Fórmulas com dados ou valores desconhecidos voltam como estão.
 */
export function resolveBonus(hit: string, vars: (name: string) => number | undefined): string {
  const h = hit.replace(/\s+/g, '');
  if (!h) return '';
  let bad = false;
  const expr = h.replace(/@([\p{L}_]+)/gu, (_m, n: string) => {
    const v = vars(n);
    if (v === undefined) bad = true;
    return `+${v ?? 0}`;
  });
  if (bad || !/^[+\-\d]+$/.test(expr)) return hit.trim();
  const terms = expr.match(/[+-]?\d+/g) ?? [];
  const sum = terms.reduce((s, t) => s + Number(t), 0);
  return sum >= 0 ? `+${sum}` : `−${Math.abs(sum)}`;
}
