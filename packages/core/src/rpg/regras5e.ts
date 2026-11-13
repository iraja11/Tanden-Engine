/*
 * Tabelas do D&D 5e (revisão de 2024, SRD 5.2) que a ficha usa para fazer as
 * contas sozinha: classes (dado de vida, salvaguardas, treinos, conjuração),
 * espécies (tamanho, deslocamento), armaduras (CA), XP por nível e espaços
 * de magia. Só dados e funções puras; quem lê a nota é `ficha.ts`.
 */

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export type CasterKind = 'nenhum' | 'completo' | 'meio' | 'terço' | 'pacto';
export type ArmorTraining = 'leve' | 'média' | 'pesada' | 'escudos';
export type WeaponTraining = 'simples' | 'marciais' | 'de fogo';

export const ARMOR_TRAINING: ArmorTraining[] = ['leve', 'média', 'pesada', 'escudos'];
export const WEAPON_TRAINING: WeaponTraining[] = ['simples', 'marciais', 'de fogo'];

export interface ClassInfo {
  key: string;
  name: string;
  aliases: string[];
  /** faces do dado de vida */
  die: number;
  /** chaves dos atributos das salvaguardas */
  saves: [string, string];
  armor: ArmorTraining[];
  weapons: WeaponTraining[];
  caster: CasterKind;
  /** atributo de conjuração */
  ability: string | null;
  /** defesa sem armadura: 10 + DES + este atributo */
  unarmored?: string;
}

export const CLASSES: ClassInfo[] = [
  { key: 'barbaro', name: 'Bárbaro', aliases: ['barbaro', 'bárbara', 'barbara', 'barbarian'], die: 12, saves: ['for', 'con'], armor: ['leve', 'média', 'escudos'], weapons: ['simples', 'marciais'], caster: 'nenhum', ability: null, unarmored: 'con' },
  { key: 'bardo', name: 'Bardo', aliases: ['barda', 'bard'], die: 8, saves: ['des', 'car'], armor: ['leve'], weapons: ['simples'], caster: 'completo', ability: 'car' },
  { key: 'bruxo', name: 'Bruxo', aliases: ['bruxa', 'warlock'], die: 8, saves: ['sab', 'car'], armor: ['leve'], weapons: ['simples'], caster: 'pacto', ability: 'car' },
  { key: 'clerigo', name: 'Clérigo', aliases: ['clerigo', 'clériga', 'cleriga', 'cleric'], die: 8, saves: ['sab', 'car'], armor: ['leve', 'média', 'escudos'], weapons: ['simples'], caster: 'completo', ability: 'sab' },
  { key: 'druida', name: 'Druida', aliases: ['druid'], die: 8, saves: ['int', 'sab'], armor: ['leve', 'escudos'], weapons: ['simples'], caster: 'completo', ability: 'sab' },
  { key: 'feiticeiro', name: 'Feiticeiro', aliases: ['feiticeira', 'sorcerer'], die: 6, saves: ['con', 'car'], armor: [], weapons: ['simples'], caster: 'completo', ability: 'car' },
  { key: 'guerreiro', name: 'Guerreiro', aliases: ['guerreira', 'fighter', 'lutador'], die: 10, saves: ['for', 'con'], armor: ['leve', 'média', 'pesada', 'escudos'], weapons: ['simples', 'marciais'], caster: 'nenhum', ability: null },
  { key: 'ladino', name: 'Ladino', aliases: ['ladina', 'rogue', 'gatuno'], die: 8, saves: ['des', 'int'], armor: ['leve'], weapons: ['simples'], caster: 'nenhum', ability: null },
  { key: 'mago', name: 'Mago', aliases: ['maga', 'wizard'], die: 6, saves: ['int', 'sab'], armor: [], weapons: ['simples'], caster: 'completo', ability: 'int' },
  { key: 'monge', name: 'Monge', aliases: ['monja', 'monk'], die: 8, saves: ['for', 'des'], armor: [], weapons: ['simples'], caster: 'nenhum', ability: null, unarmored: 'sab' },
  { key: 'paladino', name: 'Paladino', aliases: ['paladina', 'paladin'], die: 10, saves: ['sab', 'car'], armor: ['leve', 'média', 'pesada', 'escudos'], weapons: ['simples', 'marciais'], caster: 'meio', ability: 'car' },
  { key: 'patrulheiro', name: 'Patrulheiro', aliases: ['patrulheira', 'ranger', 'guardiao', 'guardião'], die: 10, saves: ['for', 'des'], armor: ['leve', 'média', 'escudos'], weapons: ['simples', 'marciais'], caster: 'meio', ability: 'sab' },
];

/** subclasses que conjuram como um terço de conjurador (INT) */
const THIRD_CASTERS = ['cavaleiro arcano', 'eldritch knight', 'trapaceiro arcano', 'arcane trickster'];

export function classOf(name: string): ClassInfo | null {
  const n = norm(name);
  if (!n) return null;
  return CLASSES.find((c) => norm(c.name) === n || c.aliases.some((a) => norm(a) === n)) ?? null;
}

export interface ClassLevel {
  /** como está escrito na nota */
  name: string;
  info: ClassInfo | null;
  level: number;
  /** conjuração desta classe, já contando a subclasse */
  caster: CasterKind;
  ability: string | null;
}

/**
 * Lê "Guerreiro", "Guerreiro 3 / Mago 2" ou "Mago 5". Uma classe só, sem
 * número, fica com o nível da ficha. `subclass` vale para a primeira classe
 * (ou para a que tiver o nome entre parênteses: "Ladino 3 (Trapaceiro Arcano)").
 */
export function parseClasses(text: string, level: number | null, subclass = ''): ClassLevel[] {
  const parts = text.split(/[/;+]|,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean);
  const out: ClassLevel[] = [];
  for (const p of parts) {
    const sub = /\(([^)]*)\)/.exec(p)?.[1] ?? '';
    const clean = p.replace(/\([^)]*\)/g, '').trim();
    const m = /^(.*?)\s*(\d+)\s*$/.exec(clean);
    const name = (m ? m[1]! : clean).trim();
    if (!name) continue;
    const info = classOf(name);
    out.push({ name, info, level: m ? Math.max(0, Number(m[2])) : -1, caster: info?.caster ?? 'nenhum', ability: info?.ability ?? null });
    const last = out[out.length - 1]!;
    const subName = sub || (out.length === 1 ? subclass : '');
    if (last.caster === 'nenhum' && THIRD_CASTERS.some((t) => norm(subName).includes(t))) {
      last.caster = 'terço';
      last.ability = 'int';
    }
  }
  const known = out.filter((c) => c.level >= 0).reduce((s, c) => s + c.level, 0);
  const missing = out.filter((c) => c.level < 0);
  if (missing.length) {
    const rest = Math.max(missing.length, (level ?? 1) - known);
    missing.forEach((c, i) => { c.level = i === 0 ? rest - (missing.length - 1) : 1; });
  }
  return out;
}

/** Escreve as classes de volta: "Guerreiro" (uma só) ou "Guerreiro 3 / Mago 2". */
export function formatClasses(cs: Array<Pick<ClassLevel, 'name' | 'level'>>, keepBare = false): string {
  if (cs.length === 1 && keepBare) return cs[0]!.name;
  return cs.map((c) => `${c.name} ${c.level}`).join(' / ');
}

// ---------------------------------------------------------------- nível e XP

/** XP mínimo de cada nível (índice 0 = nível 1). */
export const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 0; i < XP_TABLE.length; i++) if (xp >= XP_TABLE[i]!) l = i + 1;
  return l;
}

/** XP para chegar ao próximo nível (null no 20). */
export const xpForNext = (level: number): number | null => (level >= 20 ? null : XP_TABLE[Math.max(0, level)] ?? null);

export const profForLevel = (level: number): number => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);

// ---------------------------------------------------------------- magia

/** Espaços de magia do conjurador completo por nível de conjurador (1..20). */
const FULL_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Nível de conjurador (regra de multiclasse de 2024: meio arredonda para cima, terço para baixo). */
export function casterLevel(cs: ClassLevel[]): number {
  const casters = cs.filter((c) => c.caster === 'completo' || c.caster === 'meio' || c.caster === 'terço');
  if (casters.length === 1) {
    const c = casters[0]!;
    if (c.caster === 'completo') return c.level;
    if (c.caster === 'meio') return Math.ceil(c.level / 2);
    return c.level >= 3 ? Math.ceil(c.level / 3) : 0;
  }
  return casters.reduce((s, c) => s + (c.caster === 'completo' ? c.level : c.caster === 'meio' ? Math.ceil(c.level / 2) : Math.floor(c.level / 3)), 0);
}

/** Espaços por círculo (índice 0 = 1º círculo), sem a magia de pacto. */
export function spellSlots(cs: ClassLevel[]): number[] {
  const l = Math.min(20, casterLevel(cs));
  return l > 0 ? [...FULL_SLOTS[l - 1]!] : [];
}

/** Magia de pacto (Bruxo): quantos espaços e de que círculo. */
export function pactSlots(cs: ClassLevel[]): { total: number; level: number } | null {
  const w = cs.find((c) => c.caster === 'pacto');
  if (!w || w.level < 1) return null;
  const l = Math.min(20, w.level);
  const total = l >= 17 ? 4 : l >= 11 ? 3 : l >= 2 ? 2 : 1;
  const level = Math.min(5, Math.ceil(l / 2));
  return { total, level };
}

// ---------------------------------------------------------------- espécies

export interface SpeciesInfo {
  name: string;
  aliases: string[];
  size: string;
  /** deslocamento em metros */
  speed: number;
}

export const SPECIES: SpeciesInfo[] = [
  { name: 'Aasimar', aliases: [], size: 'Médio ou Pequeno', speed: 9 },
  { name: 'Anão', aliases: ['anao', 'anã', 'ana', 'dwarf'], size: 'Médio', speed: 9 },
  { name: 'Draconato', aliases: ['draconata', 'dragonborn'], size: 'Médio', speed: 9 },
  { name: 'Elfo', aliases: ['elfa', 'elf'], size: 'Médio', speed: 9 },
  { name: 'Gnomo', aliases: ['gnoma', 'gnome'], size: 'Pequeno', speed: 9 },
  { name: 'Golias', aliases: ['goliath'], size: 'Médio', speed: 10.5 },
  { name: 'Halfling', aliases: ['pequenino', 'hobbit'], size: 'Pequeno', speed: 9 },
  { name: 'Humano', aliases: ['humana', 'human'], size: 'Médio ou Pequeno', speed: 9 },
  { name: 'Orc', aliases: ['orque'], size: 'Médio', speed: 9 },
  { name: 'Tiefling', aliases: ['tiferino', 'tiferina'], size: 'Médio ou Pequeno', speed: 9 },
  { name: 'Meio-elfo', aliases: ['meio elfo', 'meia-elfa', 'half-elf'], size: 'Médio', speed: 9 },
  { name: 'Meio-orc', aliases: ['meio orc', 'meia-orc', 'half-orc'], size: 'Médio', speed: 9 },
];

/** Espécie pelo começo do nome ("Elfo da Floresta" → Elfo). */
export function speciesOf(name: string): SpeciesInfo | null {
  const n = norm(name);
  if (!n) return null;
  let best: SpeciesInfo | null = null;
  let len = 0;
  for (const s of SPECIES) {
    for (const a of [s.name, ...s.aliases]) {
      const x = norm(a);
      if ((n === x || n.startsWith(`${x} `) || n.startsWith(`${x}-`)) && x.length > len) {
        best = s;
        len = x.length;
      }
    }
  }
  if (best && best.name === 'Elfo' && /floresta|wood/.test(n)) return { ...best, speed: 10.5 };
  return best;
}

export const metres = (m: number): string => `${String(m).replace('.', ',')} m`;

// ---------------------------------------------------------------- armaduras

export interface ArmorInfo {
  name: string;
  aliases: string[];
  kind: 'leve' | 'média' | 'pesada';
  base: number;
  /** Força mínima (pesadas) */
  str?: number;
  /** desvantagem em Furtividade */
  stealth?: boolean;
}

export const ARMORS: ArmorInfo[] = [
  { name: 'Acolchoada', aliases: ['armadura acolchoada', 'padded'], kind: 'leve', base: 11, stealth: true },
  { name: 'Couro', aliases: ['armadura de couro', 'leather'], kind: 'leve', base: 11 },
  { name: 'Couro batido', aliases: ['couro cravejado', 'armadura de couro batido', 'studded leather'], kind: 'leve', base: 12 },
  { name: 'Gibão de peles', aliases: ['gibao de peles', 'peles', 'hide'], kind: 'média', base: 12 },
  { name: 'Camisão de malha', aliases: ['camisao de malha', 'chain shirt'], kind: 'média', base: 13 },
  { name: 'Brunea', aliases: ['cota de escamas', 'scale mail'], kind: 'média', base: 14, stealth: true },
  { name: 'Peitoral', aliases: ['couraça', 'couraca', 'breastplate'], kind: 'média', base: 14 },
  { name: 'Meia-armadura', aliases: ['meia armadura', 'half plate'], kind: 'média', base: 15, stealth: true },
  { name: 'Cota de anéis', aliases: ['cota de aneis', 'ring mail'], kind: 'pesada', base: 14, stealth: true },
  { name: 'Cota de malha', aliases: ['chain mail'], kind: 'pesada', base: 16, str: 13, stealth: true },
  { name: 'Cota de talas', aliases: ['talas', 'splint'], kind: 'pesada', base: 17, str: 15, stealth: true },
  { name: 'Placas', aliases: ['armadura de placas', 'placa', 'plate'], kind: 'pesada', base: 18, str: 15, stealth: true },
];

export function armorOf(name: string): ArmorInfo | null {
  const n = norm(name.replace(/^\[\[|\]\]$/g, '').replace(/\s*\+\d+\s*$/, ''));
  if (!n) return null;
  return ARMORS.find((a) => norm(a.name) === n || a.aliases.some((x) => norm(x) === n)) ?? null;
}

/** bônus mágico escrito no nome: "Placas +1" */
export const armorBonus = (name: string): number => Number(/\+(\d+)\s*(\]\])?\s*$/.exec(name)?.[1] ?? 0);

/**
 * CA calculada: armadura vestida (ou defesa sem armadura da classe) + escudo.
 * `mods` são os modificadores dos atributos por chave (for, des...).
 */
export function computeAc(opts: { mods: Record<string, number>; armor: string; shield: boolean; classes: ClassLevel[] }): number {
  const des = opts.mods['des'] ?? 0;
  const a = armorOf(opts.armor);
  let ac: number;
  if (a) ac = a.base + (a.kind === 'leve' ? des : a.kind === 'média' ? Math.min(2, des) : 0) + armorBonus(opts.armor);
  else {
    const extra = opts.classes
      .map((c) => c.info?.unarmored)
      .filter((x): x is string => !!x && !(x === 'sab' && opts.shield))
      .map((k) => opts.mods[k] ?? 0);
    ac = 10 + des + (extra.length ? Math.max(0, ...extra) : 0);
  }
  return ac + (opts.shield ? 2 : 0);
}
