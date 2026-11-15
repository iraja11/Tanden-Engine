/*
 * Formato do compêndio de D&D 5e gerado por `scripts/compendio-5e.mjs` a
 * partir do 5etools. É o formato do 5etools enxugado: o texto das regras
 * continua como "entries" (listas de blocos com tags {@spell ...}), e quem
 * transforma isso em markdown ou HTML é `render.ts`.
 */

export type Edition = '2014' | '2024';

export type Entry = string | EntryObj;
export interface EntryObj {
  type?: string;
  name?: string;
  entries?: Entry[];
  items?: Entry[];
  entry?: Entry;
  [k: string]: unknown;
}

/** Uma escolha de valores de atributo: fixos (`{dex: 2}`) e/ou "escolha N de...". */
export interface AbilityGrant {
  [ability: string]: unknown;
  choose?: { from?: string[]; count?: number; amount?: number; weighted?: { from: string[]; weights: number[] } };
}

export interface CompBase {
  name: string;
  source: string;
  ed: Edition;
  /** existe versão mais nova (2024) */
  reprinted?: boolean;
  srd?: boolean;
  entries: Entry[];
}

export interface CFeature {
  name: string;
  /** nível da classe */
  level: number;
  entries: Entry[];
  /** aqui entra uma característica da subclasse */
  sub?: boolean;
}

export interface ClassTable {
  title?: string;
  cols: string[];
  rows: unknown[][];
  /** tabela de espaços de magia por círculo */
  slots?: boolean;
}

export type SkillChoice = { choose?: { from: string[]; count?: number }; any?: number } & Record<string, unknown>;

export interface OptionalProgression {
  name: string;
  featureType: string[];
  progression: number[] | Record<string, number>;
}

export interface CClass extends CompBase {
  /** chave do arquivo do 5etools (fighter, wizard...) */
  key: string;
  hd: number;
  saves: string[];
  primaryAbility?: Array<Record<string, boolean>>;
  spellcastingAbility?: string;
  casterProgression?: 'full' | '1/2' | '1/3' | 'pact' | 'artificer';
  /** fórmula de 2014: "<$level$> + <$int_mod$>" */
  preparedSpells?: string;
  preparedSpellsProgression?: number[];
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  spellsKnownProgressionFixed?: number[];
  optionalfeatureProgression?: OptionalProgression[];
  /** talentos que a classe dá (2024: Estilo de Luta) */
  featProgression?: Array<{ name: string; category: string[]; progression: Record<string, number> }>;
  subclassTitle?: string;
  multiclassing?: { requirements?: Record<string, unknown>; proficienciesGained?: Record<string, unknown> };
  skills: SkillChoice[];
  armor: string[];
  weapons: string[];
  tools: unknown[];
  equipment: StartingEquipment | null;
  tables: ClassTable[];
  features: CFeature[];
}

export interface StartingEquipment {
  additionalFromBackground?: boolean;
  default?: string[];
  defaultData?: Array<Record<string, EquipItem[]>>;
  entries?: Entry[];
  goldAlternative?: string;
}

export type EquipItem = string | { item?: string; quantity?: number; value?: number; special?: string; equipmentType?: string; containsValue?: number; displayName?: string };

export interface CSubclass extends CompBase {
  short: string;
  className: string;
  classSource: string;
  spellcastingAbility?: string;
  casterProgression?: CClass['casterProgression'];
  cantripProgression?: number[];
  spellsKnownProgression?: number[];
  additionalSpells?: AdditionalSpells[];
  optionalfeatureProgression?: OptionalProgression[];
  features: CFeature[];
}

export interface AdditionalSpells {
  name?: string;
  prepared?: Record<string, unknown>;
  known?: Record<string, unknown>;
  innate?: Record<string, unknown>;
  expanded?: Record<string, unknown>;
  ability?: unknown;
}

export interface CSpecies extends CompBase {
  /** nome da raça base quando é sub-raça ("Elf (High)" → Elf) */
  base?: string;
  size?: string[];
  speed?: number | Record<string, number | boolean>;
  darkvision?: number;
  ability?: AbilityGrant[];
  skillProficiencies?: Array<Record<string, unknown>>;
  languageProficiencies?: Array<Record<string, unknown>>;
  toolProficiencies?: Array<Record<string, unknown>>;
  weaponProficiencies?: Array<Record<string, unknown>>;
  armorProficiencies?: Array<Record<string, unknown>>;
  resist?: unknown[];
  additionalSpells?: AdditionalSpells[];
  creatureTypes?: string[];
  feats?: Array<Record<string, unknown>>;
}

export interface CBackground extends CompBase {
  ability?: AbilityGrant[];
  feats?: Array<Record<string, boolean>>;
  skillProficiencies?: Array<Record<string, unknown>>;
  toolProficiencies?: Array<Record<string, unknown>>;
  languageProficiencies?: Array<Record<string, unknown>>;
  startingEquipment?: Array<Record<string, EquipItem[]>>;
}

export interface CFeat extends CompBase {
  /** O origem, G geral, FS estilo de luta, EB dádiva épica (2024) */
  category?: string;
  prerequisite?: Array<Record<string, unknown>>;
  ability?: AbilityGrant[];
  repeatable?: boolean;
  additionalSpells?: AdditionalSpells[];
}

export interface COptional extends CompBase {
  /** EI invocação, MM metamagia, MV:B manobra, FS:F estilo de luta... */
  type: string[];
  prerequisite?: Array<Record<string, unknown>>;
}

export interface SpellTime { number: number; unit: string; condition?: string }
export interface SpellRange { type: string; distance?: { type: string; amount?: number } }
export interface SpellDuration { type: string; duration?: { type: string; amount?: number; upTo?: boolean }; concentration?: boolean; ends?: string[] }

export interface CSpell extends CompBase {
  level: number;
  school: string;
  time: SpellTime[];
  range: SpellRange;
  components: { v?: boolean; s?: boolean; m?: string | { text: string; cost?: number; consume?: boolean | string }; r?: boolean };
  duration: SpellDuration[];
  ritual?: boolean;
  /** classes que têm a magia na lista (nome em inglês) */
  classes: string[];
  entriesHigherLevel?: Entry[];
  damageInflict?: string[];
  savingThrow?: string[];
  spellAttack?: string[];
  scalingLevelDice?: unknown;
  conditionInflict?: string[];
}

export interface CItem extends CompBase {
  type?: string;
  rarity?: string;
  weight?: number;
  /** em peças de cobre */
  value?: number;
  reqAttune?: boolean | string;
  weaponCategory?: string;
  property?: Array<string | { uid: string; note?: string }>;
  mastery?: string[];
  dmg1?: string;
  dmg2?: string;
  dmgType?: string;
  range?: string;
  ac?: number;
  strength?: string | null;
  stealth?: boolean;
  bonusWeapon?: string;
  bonusAc?: string;
  charges?: number;
  wondrous?: boolean;
  armor?: boolean;
  weapon?: boolean;
  /** item comum do capítulo de equipamento */
  base?: boolean;
  packContents?: EquipItem[];
}

export interface CItemProperty { abbreviation: string; source: string; ed: Edition; name: string; entries: Entry[] }

export interface CompendiumData {
  version: number;
  generated?: string;
  classes: CClass[];
  subclasses: CSubclass[];
  species: CSpecies[];
  backgrounds: CBackground[];
  feats: CFeat[];
  optionalfeatures: COptional[];
  spells: CSpell[];
  items: CItem[];
  itemProperties: CItemProperty[];
  itemMastery: CompBase[];
  conditions: CompBase[];
  diseases: CompBase[];
  actions: Array<CompBase & { time?: unknown }>;
  languages: Array<CompBase & { type?: string }>;
  skills: Array<CompBase & { ability: string }>;
  senses: CompBase[];
  variantrules: Array<CompBase & { ruleType?: string }>;
}
