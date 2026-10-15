import { asList, asText, parseProps, setProps, type Props, type PropValue } from '../caderno/frontmatter';
import { getSection, parseTable, sameTitle, setSectionTable } from '../caderno/markdown';
import { checkRoll } from './dice';

/*
 * Ficha de jogo: números de RPG em cima de uma ficha comum do world
 * building (ou de qualquer nota). Tudo são propriedades do Obsidian:
 *
 *   nível: 3
 *   pv: 21
 *   pv máx: 24
 *   ca: 16
 *   for: 15
 *   des: 14
 *   ...
 *   salvaguardas: [for, con]
 *   perícias: [Atletismo, Percepção]
 *
 * e duas tabelas opcionais no texto:
 *
 *   ## Ataques                       ## Rolagens
 *   | Ataque | Acerto | Dano    |     | Rolagem   | Fórmula      |
 *   | Espada | +5     | 1d8+3   |     | Fôlego    | 1d10+@nível  |
 *
 * O sistema vem da propriedade `sistema` (da ficha ou da campanha):
 * "5e" (padrão; D&D 5e, Tormenta e afins: modificador = (valor − 10) / 2)
 * ou "livre" (o número do atributo já é o modificador).
 */

export type System = '5e' | 'livre';

export function systemOf(v: string | undefined): System {
  const s = (v ?? '').toLowerCase();
  if (/livre|free|outro|gen[eé]ric|op\b|ordem|cthulhu|gurps|savage|pbta|fate/.test(s)) return 'livre';
  return '5e';
}

export interface Attr {
  key: string;
  label: string;
  /** nome da propriedade na nota (como está escrito) */
  prop: string;
  score: number;
  mod: number;
}

export const ATTRS: Array<{ key: string; label: string; aliases: string[] }> = [
  { key: 'for', label: 'Força', aliases: ['for', 'força', 'forca', 'str', 'strength'] },
  { key: 'des', label: 'Destreza', aliases: ['des', 'destreza', 'dex', 'dexterity'] },
  { key: 'con', label: 'Constituição', aliases: ['con', 'constituição', 'constituicao', 'constitution'] },
  { key: 'int', label: 'Inteligência', aliases: ['int', 'inteligência', 'inteligencia', 'intelligence'] },
  { key: 'sab', label: 'Sabedoria', aliases: ['sab', 'sabedoria', 'wis', 'wisdom'] },
  { key: 'car', label: 'Carisma', aliases: ['car', 'carisma', 'cha', 'charisma'] },
];

export const SKILLS_5E: Array<{ name: string; attr: string }> = [
  { name: 'Acrobacia', attr: 'des' }, { name: 'Adestrar Animais', attr: 'sab' }, { name: 'Arcanismo', attr: 'int' },
  { name: 'Atletismo', attr: 'for' }, { name: 'Atuação', attr: 'car' }, { name: 'Enganação', attr: 'car' },
  { name: 'Furtividade', attr: 'des' }, { name: 'História', attr: 'int' }, { name: 'Intimidação', attr: 'car' },
  { name: 'Intuição', attr: 'sab' }, { name: 'Investigação', attr: 'int' }, { name: 'Medicina', attr: 'sab' },
  { name: 'Natureza', attr: 'int' }, { name: 'Percepção', attr: 'sab' }, { name: 'Persuasão', attr: 'car' },
  { name: 'Prestidigitação', attr: 'des' }, { name: 'Religião', attr: 'int' }, { name: 'Sobrevivência', attr: 'sab' },
];

const FIELDS = {
  level: ['nível', 'nivel', 'level', 'nv'],
  hp: ['pv', 'hp', 'vida', 'pontos de vida'],
  hpMax: ['pv máx', 'pv max', 'pv_max', 'pvmax', 'pv máximo', 'hp max', 'max hp', 'vida máx'],
  hpTemp: ['pv temp', 'pv temporários', 'temp hp', 'pv temporarios'],
  ac: ['ca', 'ac', 'defesa', 'armadura', 'classe de armadura'],
  init: ['iniciativa', 'init', 'inic'],
  prof: ['proficiência', 'proficiencia', 'prof', 'bônus de proficiência', 'bonus de proficiencia'],
  speed: ['deslocamento', 'speed', 'movimento'],
  saves: ['salvaguardas', 'resistências', 'resistencias', 'saves', 'testes de resistência'],
  skills: ['perícias', 'pericias', 'skills'],
  expertise: ['especialidades', 'especialização', 'especializacao', 'expertise'],
  player: ['jogador', 'jogadora', 'player'],
  klass: ['classe', 'class'],
  cr: ['nd', 'cr', 'nível de desafio', 'nivel de desafio'],
  system: ['sistema', 'system'],
} as const;

/** chave da propriedade na nota, procurando pelos apelidos */
export function findPropKey(props: Props, aliases: readonly string[]): string | null {
  for (const a of aliases) {
    const k = Object.keys(props).find((p) => sameTitle(p, a));
    if (k) return k;
  }
  return null;
}

const numOf = (v: PropValue | undefined): number | null => {
  const m = /^\s*([+-]?\d+(?:[.,]\d+)?)/.exec(asText(v));
  return m ? Number(m[1]!.replace(',', '.')) : null;
};

export interface Attack {
  name: string;
  /** bônus de acerto, como fórmula: "+5", "@for+@prof" */
  hit: string;
  /** dano, como fórmula: "1d8+3 cortante" → fórmula "1d8+3" e tipo "cortante" */
  damage: string;
  damageType: string;
  notes: string;
}

export interface CustomRoll {
  name: string;
  formula: string;
}

export interface Sheet {
  system: System;
  level: number | null;
  klass: string;
  player: string;
  cr: string;
  hp: number | null;
  hpMax: number | null;
  hpTemp: number | null;
  ac: number | null;
  speed: string;
  prof: number;
  init: number;
  attrs: Attr[];
  saves: string[];
  skills: string[];
  expertise: string[];
  attacks: Attack[];
  rolls: CustomRoll[];
  /** nomes das propriedades na nota, para gravar no mesmo lugar */
  keys: { hp: string; hpMax: string; hpTemp: string; ac: string };
}

/** Tem números de jogo? (PV, CA ou atributos) */
export function hasSheet(props: Props): boolean {
  if (findPropKey(props, FIELDS.hp) || findPropKey(props, FIELDS.ac)) return true;
  return ATTRS.filter((a) => findPropKey(props, a.aliases)).length >= 3;
}

export const modOf = (score: number, system: System): number => (system === 'livre' ? score : Math.floor((score - 10) / 2));
export const signed = (n: number): string => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Separa "1d8+3 cortante" em fórmula e tipo de dano: o maior começo que for fórmula. */
export function splitDamage(s: string): { formula: string; type: string } {
  const words = s.trim().split(/\s+/).filter(Boolean);
  for (let i = words.length; i > 0; i--) {
    const f = words.slice(0, i).join(' ');
    if (!f.includes('#') && !checkRoll(f)) return { formula: f, type: words.slice(i).join(' ') };
  }
  return { formula: '', type: s.trim() };
}

function table(body: string, title: string): string[][] {
  const sec = getSection(body, title);
  const t = sec === null ? null : parseTable(sec);
  return t ? t.rows.filter((r) => r.some((c) => c)) : [];
}

/** Lê a ficha da nota. `fallbackSystem` vem da campanha. */
export function readSheet(text: string, fallbackSystem?: string): Sheet {
  const props = parseProps(text);
  const key = (f: keyof typeof FIELDS) => findPropKey(props, FIELDS[f]);
  const num = (f: keyof typeof FIELDS) => {
    const k = key(f);
    return k ? numOf(props[k]) : null;
  };
  const sysKey = key('system');
  const system = systemOf(sysKey ? asText(props[sysKey]) : fallbackSystem);
  const attrs: Attr[] = [];
  for (const a of ATTRS) {
    const k = findPropKey(props, a.aliases);
    const score = k ? numOf(props[k]) : null;
    if (k && score !== null) attrs.push({ key: a.key, label: a.label, prop: k, score, mod: modOf(score, system) });
  }
  const level = num('level');
  const prof = num('prof') ?? (level !== null && system === '5e' ? 2 + Math.floor((Math.max(1, level) - 1) / 4) : 0);
  const des = attrs.find((a) => a.key === 'des');
  const init = num('init') ?? des?.mod ?? 0;
  const list = (f: keyof typeof FIELDS) => {
    const k = key(f);
    return k ? asList(props[k]).flatMap((x) => x.split(',')).map((x) => x.trim()).filter(Boolean) : [];
  };
  const attacks: Attack[] = table(text, 'Ataques').map((r) => {
    const d = splitDamage(r[2] ?? '');
    return { name: r[0] ?? '', hit: (r[1] ?? '').trim(), damage: d.formula, damageType: d.type, notes: r.slice(3).filter(Boolean).join(' · ') };
  }).filter((a) => a.name);
  const rolls: CustomRoll[] = table(text, 'Rolagens').map((r) => ({ name: r[0] ?? '', formula: (r[1] ?? '').trim() })).filter((r) => r.name && r.formula);
  return {
    system,
    level,
    klass: asText(props[key('klass') ?? '']),
    player: asText(props[key('player') ?? '']).replace(/^\[\[|\]\]$/g, ''),
    cr: asText(props[key('cr') ?? '']),
    hp: num('hp'),
    hpMax: num('hpMax'),
    hpTemp: num('hpTemp'),
    ac: num('ac'),
    speed: asText(props[key('speed') ?? '']),
    prof,
    init,
    attrs,
    saves: list('saves'),
    skills: list('skills'),
    expertise: list('expertise'),
    attacks,
    rolls,
    keys: { hp: key('hp') ?? 'pv', hpMax: key('hpMax') ?? 'pv máx', hpTemp: key('hpTemp') ?? 'pv temp', ac: key('ac') ?? 'ca' },
  };
}

/** Valores que as fórmulas da ficha podem usar: @for, @des, @prof, @nível... */
export function sheetVars(s: Sheet): (name: string) => number | undefined {
  return (name: string) => {
    const n = name.toLowerCase();
    const attr = ATTRS.find((a) => a.aliases.some((x) => sameTitle(x, n)));
    if (attr) return s.attrs.find((a) => a.key === attr.key)?.mod;
    if (sameTitle(n, 'prof') || sameTitle(n, 'proficiência')) return s.prof;
    if (sameTitle(n, 'nível') || sameTitle(n, 'nivel') || n === 'nv') return s.level ?? undefined;
    if (sameTitle(n, 'inic') || sameTitle(n, 'iniciativa')) return s.init;
    if (n === 'ca') return s.ac ?? undefined;
    if (n === 'pv') return s.hp ?? undefined;
    return undefined;
  };
}

const plus = (n: number): string => (n === 0 ? '' : n > 0 ? `+${n}` : `${n}`);

/** Bônus de um atributo, salvaguarda ou perícia, já somado. */
export function attrBonus(s: Sheet, key: string): number {
  return s.attrs.find((a) => a.key === key)?.mod ?? 0;
}

export function saveBonus(s: Sheet, key: string): number {
  const a = ATTRS.find((x) => x.key === key)!;
  const prof = s.saves.some((x) => a.aliases.some((al) => sameTitle(al, x)) || sameTitle(x, a.label));
  return attrBonus(s, key) + (prof ? s.prof : 0);
}

export function skillBonus(s: Sheet, skill: { name: string; attr: string }): { bonus: number; level: 0 | 1 | 2 } {
  const exp = s.expertise.some((x) => sameTitle(x, skill.name));
  const prof = exp || s.skills.some((x) => sameTitle(x, skill.name));
  const level = exp ? 2 : prof ? 1 : 0;
  return { bonus: attrBonus(s, skill.attr) + s.prof * level, level };
}

/** Fórmula d20 com o bônus: "1d20+5". */
export const d20 = (bonus: number): string => `1d20${plus(bonus)}`;

/** Fórmula do acerto de um ataque ("+5" → "1d20+5"; "@for+@prof" → "1d20+@for+@prof"). */
export function attackFormula(a: Attack): string | null {
  const h = a.hit.replace(/\s+/g, '');
  if (!h) return null;
  const f = /^[+-]/.test(h) ? `1d20${h}` : /d/i.test(h) && !h.startsWith('@') ? h : `1d20+${h}`;
  return checkRoll(f) ? null : f;
}

/** Iniciativa: "1d20+2". */
export const initFormula = (s: Sheet): string => d20(s.init);

/** Põe números de jogo numa nota (sem apagar nada que já esteja lá). */
export function addSheet(text: string, system: System = '5e'): string {
  const props = parseProps(text);
  const patch: Record<string, PropValue> = {};
  const want: Array<[readonly string[], string]> = [
    [FIELDS.level, '1'], [FIELDS.hp, '10'], [FIELDS.hpMax, '10'], [FIELDS.ac, '10'],
    ...ATTRS.map((a): [readonly string[], string] => [a.aliases, system === 'livre' ? '0' : '10']),
  ];
  for (const [aliases, v] of want) if (!findPropKey(props, aliases)) patch[aliases[0]!] = v;
  let out = Object.keys(patch).length ? setProps(text, patch) : text;
  if (getSection(out, 'Ataques') === null) out = setSectionTable(out, 'Ataques', { header: ['Ataque', 'Acerto', 'Dano', 'Notas'], rows: [['Desarmado', '+0', '1', '']] });
  return out;
}

/** Novo PV depois de dano (positivo) ou cura (negativo). O dano gasta primeiro os PV temporários. */
export function applyHp(s: Pick<Sheet, 'hp' | 'hpMax' | 'hpTemp'>, amount: number): { hp: number; hpTemp: number } {
  let hp = s.hp ?? s.hpMax ?? 0;
  let temp = s.hpTemp ?? 0;
  if (amount > 0) {
    const fromTemp = Math.min(temp, amount);
    temp -= fromTemp;
    hp = Math.max(0, hp - (amount - fromTemp));
  } else if (amount < 0) {
    hp = s.hpMax !== null && s.hpMax !== undefined ? Math.min(s.hpMax, hp - amount) : hp - amount;
  }
  return { hp, hpTemp: temp };
}
