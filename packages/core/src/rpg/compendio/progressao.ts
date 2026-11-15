import { asText, parseProps, setProps, type PropValue } from '../../caderno/frontmatter';
import { sameTitle } from '../../caderno/markdown';
import {
  levelUp, readAbilities, readAttackRows, readCharacter, readSpells, writeAbilities, writeAttackRows, writeSpells, type Ability, type Character, type LevelUp, type Spell,
} from '../ficha';
import { pactSlots, spellSlots, type CasterKind, type ClassLevel } from '../regras5e';
import { ATTRS } from '../sheet';
import {
  ABILITY_ORDER, ABILITY_PT, CLASS_PT, SKILL_PT, isConcentration, spellNote, spellRange, spellTime, type AbilityKey, type Compendium,
} from './compendium';
import { stripTags, tableCell } from './render';
import type { CClass, CFeature, CSpell, CSubclass, Edition, Entry } from './types';

/*
 * Progressão de nível pelo compêndio: o que um nível de classe dá
 * (características, subclasse, melhoria de atributo/talento, truques,
 * magias, invocações, colunas da tabela da classe) e a gravação da
 * subida de nível com as escolhas feitas.
 */

export interface GainedFeature {
  name: string;
  level: number;
  entries: Entry[];
  from: 'classe' | 'subclasse';
  className: string;
}

export interface ClassLevelInfo {
  cls: CClass;
  sub: CSubclass | null;
  level: number;
  features: GainedFeature[];
  /** escolher a subclasse neste nível */
  chooseSubclass: boolean;
  /** nível em que a classe escolhe a subclasse */
  subclassLevel: number;
  /** melhoria de atributo (ou talento) neste nível */
  asi: boolean;
  /** dádiva épica (2024, nível 19) */
  epicBoon: boolean;
  /** colunas da tabela da classe que não são de magia ("Rages", "Sneak Attack"...) */
  columns: Array<{ label: string; value: string; prev: string }>;
  cantrips: number | null;
  cantripsPrev: number;
  /** magias preparadas (2024) ou conhecidas (2014) */
  spells: number | null;
  spellsPrev: number;
  spellsMode: 'preparadas' | 'conhecidas' | null;
  /** maior círculo de magia que dá para conjurar */
  maxSpellLevel: number;
  /** invocações, manobras, metamagias...: quantas no total e quantas novas */
  options: Array<{ name: string; types: string[]; total: number; gained: number }>;
  /** talentos da classe neste nível (Estilo de Luta de 2024): categorias e quantos */
  featChoices: Array<{ name: string; categories: string[]; gained: number }>;
  /** perícias que viram especialidade neste nível */
  expertise: number;
}

const SPELL_COL = /cantrip|spell|slot|^\d|^(1st|2nd|3rd|\dth)$/i;
const isAsi = (f: CFeature) => /^ability score improvement$/i.test(f.name);

/** Nível em que a classe ganha a subclasse. */
export function subclassLevel(cls: CClass): number {
  return cls.features.filter((f) => f.sub).reduce((m, f) => Math.min(m, f.level), 99);
}

const progAt = (p: number[] | Record<string, number> | undefined, level: number): number => {
  if (!p) return 0;
  if (Array.isArray(p)) return p[Math.max(0, level - 1)] ?? 0;
  return Object.entries(p).filter(([k]) => Number(k) <= level).reduce((m, [, v]) => Math.max(m, v), 0);
};

export function casterKindOf(p: string | undefined): CasterKind {
  if (p === 'full') return 'completo';
  if (p === '1/2' || p === 'artificer') return 'meio';
  if (p === '1/3') return 'terço';
  if (p === 'pact') return 'pacto';
  return 'nenhum';
}

/** Maior círculo que a classe (sozinha) conjura nesse nível. */
export function maxSpellLevelFor(cls: CClass, sub: CSubclass | null, level: number, ed: Edition): number {
  const caster = casterKindOf(cls.casterProgression ?? sub?.casterProgression);
  if (caster === 'nenhum') return 0;
  const cl: ClassLevel = { name: cls.name, info: null, level, caster, ability: null };
  if (caster === 'pacto') return pactSlots([cl])?.level ?? 0;
  if (cls.key === 'artificer') cl.info = { key: 'artifice' } as ClassLevel['info'];
  return spellSlots([cl], ed).length;
}

/** "<$level$> / 2 + <$cha_mod$>" com nível e modificadores (2014). */
export function evalPrepared(formula: string, level: number, mods: Partial<Record<AbilityKey, number>>): number {
  const expr = formula
    .replace(/<\$level\$>/g, String(level))
    .replace(/<\$(\w+)_mod\$>/g, (_, k: string) => String(mods[k as AbilityKey] ?? 0))
    .replace(/\s+/g, '');
  const total = expr.split('+').reduce((s, term) => {
    const [first = '0', ...divs] = term.split('/');
    let v = Number(first);
    for (const d of divs) v = Math.floor(v / Number(d));
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
  return Math.max(1, total);
}

/** Tudo o que um nível de classe dá. `mods` entra na conta das magias preparadas de 2014. */
export function classLevelInfo(cls: CClass, sub: CSubclass | null, level: number, mods: Partial<Record<AbilityKey, number>> = {}): ClassLevelInfo {
  const subLv = subclassLevel(cls);
  const features: GainedFeature[] = [];
  for (const f of cls.features.filter((x) => x.level === level)) {
    if (f.sub && level > subLv) continue; // o lugar da característica da subclasse
    features.push({ name: f.name, level, entries: f.entries, from: 'classe', className: cls.name });
  }
  if (sub) for (const f of sub.features.filter((x) => x.level === level)) features.push({ name: f.name, level, entries: f.entries, from: 'subclasse', className: cls.name });

  const columns: ClassLevelInfo['columns'] = [];
  for (const t of cls.tables) {
    if (t.slots) continue;
    t.cols.forEach((raw, i) => {
      const label = stripTags(raw);
      if (SPELL_COL.test(label)) return;
      const value = tableCell(t.rows[level - 1]?.[i]);
      const prev = level > 1 ? tableCell(t.rows[level - 2]?.[i]) : '';
      columns.push({ label, value, prev });
    });
  }

  const cantripProg = cls.cantripProgression ?? sub?.cantripProgression;
  const known = cls.spellsKnownProgression ?? sub?.spellsKnownProgression;
  let spells: number | null = null;
  let spellsPrev = 0;
  let spellsMode: ClassLevelInfo['spellsMode'] = null;
  if (cls.preparedSpellsProgression) {
    spells = progAt(cls.preparedSpellsProgression, level);
    spellsPrev = level > 1 ? progAt(cls.preparedSpellsProgression, level - 1) : 0;
    spellsMode = 'preparadas';
  } else if (known) {
    spells = progAt(known, level);
    spellsPrev = level > 1 ? progAt(known, level - 1) : 0;
    spellsMode = 'conhecidas';
  } else if (cls.preparedSpells) {
    spells = evalPrepared(cls.preparedSpells, level, mods);
    spellsPrev = level > 1 ? evalPrepared(cls.preparedSpells, level - 1, mods) : 0;
    spellsMode = 'preparadas';
  }
  const ed = cls.ed;
  const maxSpellLevel = maxSpellLevelFor(cls, sub, level, ed);
  if (spells !== null && maxSpellLevel === 0) spells = 0;

  const options = [...(cls.optionalfeatureProgression ?? []), ...(sub?.optionalfeatureProgression ?? [])].map((p) => {
    const total = progAt(p.progression, level);
    return { name: p.name, types: p.featureType, total, gained: total - (level > 1 ? progAt(p.progression, level - 1) : 0) };
  }).filter((o) => o.total > 0);

  const featChoices = (cls.featProgression ?? []).map((p) => ({
    name: p.name, categories: p.category, gained: progAt(p.progression, level) - (level > 1 ? progAt(p.progression, level - 1) : 0),
  })).filter((f) => f.gained > 0);
  const expertise = features.reduce((n, f) => n + (/^expertise$/i.test(f.name) ? 2 : /^deft explorer$/i.test(f.name) ? 1 : 0), 0);

  return {
    cls, sub, level, features, featChoices, expertise,
    chooseSubclass: level === subLv && !sub,
    subclassLevel: subLv,
    asi: cls.features.some((f) => f.level === level && isAsi(f)),
    epicBoon: cls.features.some((f) => f.level === level && /epic boon/i.test(f.name)),
    columns,
    cantrips: cantripProg ? progAt(cantripProg, level) : null,
    cantripsPrev: cantripProg && level > 1 ? progAt(cantripProg, level - 1) : 0,
    spells, spellsPrev, spellsMode, maxSpellLevel, options,
  };
}

/** Todas as características até o nível (para a aba Características). */
export function featuresUpTo(cls: CClass, sub: CSubclass | null, level: number): GainedFeature[] {
  const out: GainedFeature[] = [];
  for (let l = 1; l <= level; l++) out.push(...classLevelInfo(cls, sub, l).features);
  return out;
}

// ---------------------------------------------------------------- usos das habilidades

interface UseRule {
  cls: string;
  feature: RegExp;
  /** nome na tabela Habilidades */
  name: string;
  col?: RegExp;
  uses?: (level: number, ed: Edition) => number | string;
  recharge: (level: number, ed: Edition) => 'curto' | 'longo';
  time: (ed: Edition) => string;
  notes?: (cols: Record<string, string>, level: number, ed: Edition) => string;
}

const col = (cols: Record<string, string>, re: RegExp) => Object.entries(cols).find(([k]) => re.test(k))?.[1] ?? '';
const byLevel = (steps: Array<[number, number]>) => (l: number) => steps.filter(([lv]) => l >= lv).reduce((m, [, v]) => v, 0);
const always = (r: 'curto' | 'longo') => () => r;

/**
 * Habilidades com usos contados das classes do Livro do Jogador. Os
 * números saem da tabela da classe quando ela tem a coluna.
 */
const USE_RULES: UseRule[] = [
  { cls: 'Barbarian', feature: /^Rage$/, name: 'Fúria', col: /^Rages$/, recharge: always('longo'), time: () => '1 ação bônus',
    notes: (c, _l, ed) => `+${col(c, /Rage Damage/).replace(/^\+/, '')} de dano (For), resistência a concussão/cortante/perfurante, vantagem em For${ed === '2024' ? '; 2024: volta 1 uso no descanso curto' : ''}` },
  { cls: 'Bard', feature: /^Bardic Inspiration$/, name: 'Inspiração de Bardo', uses: () => '@car', recharge: (l) => (l >= 5 ? 'curto' : 'longo'), time: () => '1 ação bônus',
    notes: (c) => `dado ${col(c, /Bardic Die|Bardic Inspiration/) || 'd6'} para um aliado somar num teste de d20` },
  { cls: 'Cleric', feature: /^Channel Divinity$/, name: 'Canalizar Divindade', col: /Channel Divinity/, uses: (l) => byLevel([[2, 1], [6, 2], [18, 3]])(l), recharge: always('curto'), time: () => '1 ação' },
  { cls: 'Paladin', feature: /^Channel Divinity$/, name: 'Canalizar Divindade', col: /Channel Divinity/, uses: () => 1, recharge: always('curto'), time: () => '1 ação' },
  { cls: 'Druid', feature: /^Wild Shape$/, name: 'Forma Selvagem', col: /Wild Shape/, uses: () => 2, recharge: always('curto'), time: (ed) => (ed === '2024' ? '1 ação bônus' : '1 ação'),
    notes: (c) => (col(c, /Max CR|CR/) ? `ND máx. ${col(c, /Max CR|CR/)}` : '') },
  { cls: 'Fighter', feature: /^Second Wind$/, name: 'Retomar o Fôlego', col: /Second Wind/, uses: () => 1, recharge: always('curto'), time: () => '1 ação bônus',
    notes: (_c, l) => `cura 1d10+${l}` },
  { cls: 'Fighter', feature: /^Action Surge/, name: 'Surto de Ação', uses: (l) => (l >= 17 ? 2 : 1), recharge: always('curto'), time: () => 'livre', notes: () => 'uma ação a mais no turno' },
  { cls: 'Fighter', feature: /^Indomitable/, name: 'Indomável', uses: (l) => byLevel([[9, 1], [13, 2], [17, 3]])(l), recharge: always('longo'), time: () => 'livre',
    notes: (_c, l, ed) => (ed === '2024' ? `rerrola salvaguarda com +${l}` : 'rerrola uma salvaguarda') },
  { cls: 'Monk', feature: /^(Monk's Focus|Ki)$/, name: 'Pontos de Foco', col: /Focus Points|Ki Points/, recharge: always('curto'), time: () => 'livre',
    notes: (c) => `artes marciais ${col(c, /Martial Arts/)}` },
  { cls: 'Paladin', feature: /^Lay on Hands$/, name: 'Cura pelas Mãos', uses: (l) => 5 * l, recharge: always('longo'), time: (ed) => (ed === '2024' ? '1 ação bônus' : '1 ação'),
    notes: () => 'reserva de PV; 5 pontos curam uma doença/veneno' },
  { cls: 'Paladin', feature: /^Divine Sense$/, name: 'Sentido Divino', uses: () => '1+@car', recharge: always('longo'), time: () => '1 ação' },
  { cls: 'Ranger', feature: /^Favored Enemy$/, name: 'Marca do Caçador (grátis)', col: /Favored Enemy/, recharge: always('longo'), time: () => '1 ação bônus',
    notes: () => 'conjura Marca do Caçador sem gastar espaço' },
  { cls: 'Sorcerer', feature: /^Font of Magic$/, name: 'Pontos de Feitiçaria', col: /Sorcery Points/, recharge: always('longo'), time: () => 'livre' },
  { cls: 'Sorcerer', feature: /^Innate Sorcery$/, name: 'Feitiçaria Inata', uses: () => 2, recharge: always('longo'), time: () => '1 ação bônus',
    notes: () => '1 minuto: +1 na CD e vantagem nos ataques mágicos' },
  { cls: 'Warlock', feature: /^Magical Cunning$/, name: 'Astúcia Mágica', uses: () => 1, recharge: always('longo'), time: () => '1 minuto', notes: () => 'recupera metade dos espaços de pacto' },
  { cls: 'Wizard', feature: /^Arcane Recovery$/, name: 'Recuperação Arcana', uses: () => 1, recharge: always('longo'), time: () => 'descanso curto',
    notes: (_c, l) => `recupera espaços somando até ${Math.ceil(l / 2)} círculos (nenhum de 6º+)` },
  { cls: 'Artificer', feature: /^Flash of Genius$/, name: 'Lampejo de Genialidade', uses: () => '@int', recharge: always('longo'), time: () => 'reação', notes: () => '+Int num teste ou salvaguarda' },
];

/** Linhas da tabela Habilidades que as classes da ficha pedem nesse nível. */
export function classAbilities(comp: Compendium, c: Pick<Character, 'classes' | 'edition'>): Ability[] {
  const out: Ability[] = [];
  for (const cl of c.classes) {
    const cls = comp.classFor(cl.name, c.edition);
    if (!cls) continue;
    const cols: Record<string, string> = {};
    for (const t of cls.tables) if (!t.slots) t.cols.forEach((raw, i) => { cols[stripTags(raw)] = tableCell(t.rows[cl.level - 1]?.[i]); });
    for (const r of USE_RULES) {
      if (r.cls !== cls.name) continue;
      if (!cls.features.some((f) => f.level <= cl.level && r.feature.test(f.name))) continue;
      const fromCol = r.col ? col(cols, r.col) : '';
      const uses = fromCol && fromCol !== '—' && fromCol !== '-' ? fromCol.replace(/^∞$|^Unlimited$/i, '') : r.uses ? String(r.uses(cl.level, c.edition)) : '';
      if (!uses && r.col && !r.uses) continue;
      out.push({ name: r.name, time: r.time(c.edition), uses, spent: 0, recharge: r.recharge(cl.level, c.edition), notes: r.notes?.(cols, cl.level, c.edition) ?? '' });
    }
  }
  return out;
}

/** Junta as habilidades da classe na tabela (atualiza usos/recarga das que já existem, mantém os gastos). */
export function syncAbilities(text: string, rows: Ability[]): string {
  if (!rows.length) return text;
  const cur = readAbilities(text);
  const next = [...cur];
  for (const r of rows) {
    const i = next.findIndex((a) => sameTitle(a.name, r.name));
    if (i < 0) next.push(r);
    else next[i] = { ...next[i]!, uses: r.uses, recharge: r.recharge, time: next[i]!.time || r.time, notes: r.notes || next[i]!.notes };
  }
  return writeAbilities(text, next);
}

// ---------------------------------------------------------------- magias

/** Uma magia do compêndio como linha da tabela Magias. */
export function spellRow(s: CSpell, prepared = true): Spell {
  return {
    level: s.level,
    name: s.name,
    time: spellTime(s),
    range: spellRange(s),
    concentration: isConcentration(s),
    ritual: !!s.ritual,
    material: s.components?.m !== undefined,
    prepared: s.level === 0 || prepared,
    notes: spellNote(s),
  };
}

/** Acrescenta magias à tabela (as que já estão ficam como estão). */
export function addSpells(text: string, list: CSpell[], prepared = true): string {
  if (!list.length) return text;
  const cur = readSpells(text);
  const add = list.filter((s) => !cur.some((x) => sameTitle(x.name, s.name))).map((s) => spellRow(s, prepared));
  return add.length ? writeSpells(text, [...cur, ...add]) : text;
}

/** Magias sempre preparadas da subclasse (domínio, juramento, patrono...) até o nível. */
export function subclassSpells(comp: Compendium, sub: CSubclass, level: number, ed: Edition): CSpell[] {
  const out: CSpell[] = [];
  for (const a of sub.additionalSpells ?? []) {
    for (const key of ['prepared', 'known'] as const) {
      const m = a[key];
      if (!m) continue;
      for (const [lv, list] of Object.entries(m)) {
        const n = Number(/\d+/.exec(lv)?.[0] ?? 0);
        if (n > level || !Array.isArray(list)) continue;
        for (const ref of list) {
          if (typeof ref !== 'string') continue;
          const [name = '', src = ''] = ref.replace(/#c$/, '').split('|');
          const s = comp.find<CSpell>('spell', name, src, ed);
          if (s) out.push(s);
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- atributos e PV

const PT_KEY = (k: AbilityKey) => ABILITY_PT[k]!;

/** Valores atuais dos seis atributos (chaves do 5etools). */
export function scoresOf(c: Pick<Character, 'sheet'>): Record<AbilityKey, number> {
  const out = {} as Record<AbilityKey, number>;
  for (const k of ABILITY_ORDER) out[k] = c.sheet.attrs.find((a) => a.key === PT_KEY(k))?.score ?? 10;
  return out;
}
const modOf = (score: number): number => Math.floor((score - 10) / 2);
export { modOf as scoreMod };
export const modsOf = (scores: Record<AbilityKey, number>): Record<AbilityKey, number> =>
  Object.fromEntries(ABILITY_ORDER.map((k) => [k, modOf(scores[k])])) as Record<AbilityKey, number>;

/** Linha do ataque desarmado de 2024, com os talentos que mudam o dano. */
export const UNARMED_FEATS = /^(unarmed fighting|tavern brawler|grappler)/i;

export function unarmedStrike(feats: string[]): { name: string; hit: string; damage: string; notes: string } {
  const has = (re: RegExp) => feats.some((f) => re.test(f));
  const fighting = has(/^unarmed fighting/i);
  const brawler = has(/^tavern brawler/i);
  const die = fighting ? '1d8' : brawler ? '1d4' : '1';
  const notes: string[] = [];
  if (fighting) notes.push('d6 com arma/escudo na mão · 1d4 no agarrado no início do turno');
  if (brawler) notes.push('rerrola os 1 · empurra 1,5 m (1×/turno)');
  if (has(/^grappler/i)) notes.push('dano e agarrar no mesmo golpe (1×/turno) · vantagem contra o agarrado');
  notes.push('ou Agarrar/Empurrar: CD 8 + For + prof.');
  return { name: 'Desarmado', hit: '@for+@prof', damage: `${die}+@for concussão`, notes: notes.join(' · ') };
}

/** PV extras por nível: Tough (+2), Dwarven Toughness (+1), Draconic Resilience (+1). */
export function hpPerLevelBonus(c: { featList: string[]; species: string; subclass: string; classes: Array<{ name: string }> }): number {
  let n = 0;
  if (c.featList.some((f) => /^tough$/i.test(f.trim()))) n += 2;
  if (/^(dwarf|anão|anã)\b/i.test(c.species) && !/mountain|montanha|duergar/i.test(c.species)) n += 1;
  if (/draconic|dracônic|draconica/i.test(c.subclass) && c.classes.some((k) => /sorcerer|feiticeir/i.test(k.name))) n += 1;
  return n;
}

/** Soma bônus nos atributos (máximo 20, ou `cap`) e ajusta o PV máximo se a Constituição mudar. */
export function raiseScores(text: string, bonus: Partial<Record<AbilityKey, number>>, cap = 20): string {
  const c = readCharacter(text);
  const before = scoresOf(c);
  const patch: Record<string, PropValue | null> = {};
  let conDelta = 0;
  for (const k of ABILITY_ORDER) {
    const add = bonus[k] ?? 0;
    if (!add) continue;
    const next = Math.min(Math.max(cap, before[k]), before[k] + add);
    const prop = c.sheet.attrs.find((a) => a.key === PT_KEY(k))?.prop ?? ATTRS.find((a) => a.key === PT_KEY(k))!.aliases[0]!;
    patch[prop] = String(next);
    if (k === 'con') conDelta = modOf(next) - modOf(before[k]);
  }
  if (conDelta && c.sheet.hpMax !== null) {
    patch[c.sheet.keys.hpMax] = String(c.sheet.hpMax + conDelta * c.level);
    if (c.sheet.hp !== null) patch[c.sheet.keys.hp] = String(c.sheet.hp + conDelta * c.level);
  }
  return Object.keys(patch).length ? setProps(text, patch) : text;
}

/** Acrescenta nomes numa propriedade de lista (talentos, opções de classe), sem repetir. */
export function addToList(text: string, key: string, names: string[]): string {
  if (!names.length) return text;
  const props = parseProps(text);
  const raw = props[key];
  const cur = (Array.isArray(raw) ? raw.map(String) : asText(raw).split(',')).map((x) => x.trim()).filter(Boolean);
  const next = [...cur];
  for (const n of names) if (!next.some((x) => sameTitle(x, n))) next.push(n);
  return setProps(text, { [key]: next });
}

// ---------------------------------------------------------------- subir de nível

export interface LevelUpChoices {
  /** classe (nome em português ou inglês); vazio = a primeira */
  klass?: string;
  /** PV rolados (sem a Con); vazio = média */
  roll?: number;
  subclass?: string;
  /** melhoria de atributo: { str: 2 } ou { str: 1, dex: 1 } */
  asi?: Partial<Record<AbilityKey, number>>;
  /** talento escolhido (no lugar da melhoria, ou dádiva épica) */
  feat?: string;
  /** +1 de atributo que o talento dá */
  featAsi?: Partial<Record<AbilityKey, number>>;
  /** magias e truques novos (nomes do compêndio) */
  spells?: string[];
  /** invocações, manobras, metamagias novas */
  options?: string[];
  /** talentos que a classe dá no nível (Estilo de Luta) */
  extraFeats?: string[];
  /** perícias que viram especialidade (nomes do 5etools ou da ficha) */
  expertise?: string[];
}

export interface LevelUpResult extends LevelUp {
  /** PV extras de talento/espécie/subclasse */
  bonusHp: number;
  info: ClassLevelInfo | null;
}

/** Sobe um nível com tudo o que a classe dá e as escolhas feitas. */
export function applyLevelUp(text: string, comp: Compendium, ch: LevelUpChoices): LevelUpResult {
  const before = readCharacter(text);
  const r = levelUp(text, { klass: ch.klass, roll: ch.roll });
  let out = r.text;
  let c = readCharacter(out);
  const ed = c.edition;
  const cl = c.classes.find((k) => sameTitle(k.name, r.klass) || k.info?.name === r.klass) ?? c.classes[0];
  const cls = cl ? comp.classFor(cl.name, ed) : null;

  // PV extras por nível
  const bonusHp = hpPerLevelBonus(c);
  if (bonusHp && c.sheet.hpMax !== null) {
    out = setProps(out, { [c.sheet.keys.hpMax]: String(c.sheet.hpMax + bonusHp), [c.sheet.keys.hp]: String((c.sheet.hp ?? c.sheet.hpMax) + bonusHp) });
  }
  // subclasse (só da primeira classe: é a que a ficha guarda)
  if (ch.subclass && cl && c.classes.indexOf(cl) === 0) out = setProps(out, { [c.keys.subclass]: ch.subclass });
  if (ch.asi) out = raiseScores(out, ch.asi);
  if (ch.feat) {
    const hadTough = hpPerLevelBonus(readCharacter(out));
    out = addToList(out, c.keys.featList, [ch.feat]);
    if (ch.featAsi) out = raiseScores(out, ch.featAsi, ed === '2024' && /epic|boon/i.test(ch.feat) ? 30 : 20);
    const c2 = readCharacter(out);
    const extra = hpPerLevelBonus(c2) - hadTough;
    if (extra > 0 && c2.sheet.hpMax !== null) out = setProps(out, { [c2.sheet.keys.hpMax]: String(c2.sheet.hpMax + extra * c2.level), [c2.sheet.keys.hp]: String((c2.sheet.hp ?? c2.sheet.hpMax) + extra * c2.level) });
  }
  if (ch.options?.length) out = addToList(out, c.keys.classOptions, ch.options);
  if (ch.extraFeats?.length) out = addToList(out, c.keys.featList, ch.extraFeats);
  // talento que muda o soco: refaz a linha do ataque desarmado
  if ([ch.feat ?? '', ...(ch.extraFeats ?? [])].some((f) => UNARMED_FEATS.test(f))) {
    const rows = readAttackRows(out);
    if (rows.some((r) => sameTitle(r.name, 'Desarmado'))) {
      out = writeAttackRows(out, rows.map((r) => (sameTitle(r.name, 'Desarmado') ? unarmedStrike(readCharacter(out).featList) : r)));
    }
  }
  if (ch.expertise?.length) out = addToList(out, c.sheet.keys.expertise, ch.expertise.map((x) => SKILL_PT[x] ?? x));
  c = readCharacter(out);
  if (ch.spells?.length) out = addSpells(out, ch.spells.map((n) => comp.spellFor(n, ed)).filter((s): s is CSpell => !!s));
  // magias sempre preparadas da subclasse
  const sub = cls ? comp.subclassFor(cls, c.subclass, ed) : null;
  if (sub && cls && cl) out = addSpells(out, subclassSpells(comp, sub, cl.level, ed));
  out = syncAbilities(out, classAbilities(comp, readCharacter(out)));
  const info = cls && cl ? classLevelInfo(cls, sub, cl.level, modsOf(scoresOf(readCharacter(out)))) : null;
  void before;
  return { ...r, text: out, bonusHp, info };
}

/** Nome da classe em português, como a ficha escreve. */
export const classNamePt = (cls: Pick<CClass, 'name'>): string => CLASS_PT[cls.name] ?? cls.name;
