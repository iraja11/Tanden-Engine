import { asText, parseProps, splitFrontmatter } from '@tanden/core/src/caderno/frontmatter';
import { sameTitle } from '@tanden/core/src/caderno/markdown';
import { readPurse, COINS, type CoinKey } from '@tanden/core/src/rpg/coins';
import {
  abilityMax, readAbilities, readAttackRows, readCharacter, resolveBonus, SHEET_TEXTS, SPELLS, type Character, type SheetTextKey,
} from '@tanden/core/src/rpg/ficha';
import { carryCapacity, inventoryWeight, itemLabel, readInventory, INVENTORY } from '@tanden/core/src/rpg/items';
import { formatClasses } from '@tanden/core/src/rpg/regras5e';
import { ATTRS, SKILLS_5E, hasSheet, saveBonus, sheetVars, signed, skillBonus } from '@tanden/core/src/rpg/sheet';

/*
 * Tudo o que a ficha impressa mostra, já calculado. As contas são as mesmas
 * da Mesa (readCharacter do núcleo): CA pela armadura vestida, proficiência
 * pelo nível, perícias, passivas, conjuração. Aqui só se arruma para a página.
 */

export interface AttrView {
  key: string;
  label: string;
  score: number | null;
  mod: string;
  save: string;
  saveProf: boolean;
  skills: Array<{ name: string; bonus: string; level: 0 | 1 | 2 }>;
}

export interface Uses {
  max: number | null;
  spent: number;
}

export interface Ficha {
  path: string;
  name: string;
  /** "Golias · Guerreiro 2" */
  lineage: string;
  chips: Array<{ label: string; value: string }>;
  level: number;
  xp: { have: number; floor: number; next: number | null } | null;
  canLevelUp: boolean;
  system: '5e' | 'livre';
  ac: string;
  acNote: string;
  shield: boolean;
  hp: { cur: string; max: string; temp: string };
  hitDice: Array<{ die: number; total: number; spent: number }>;
  init: string;
  speed: string;
  size: string;
  prof: string;
  passive: { perception: number; insight: number; investigation: number };
  inspiration: boolean;
  death: { success: number; fail: number };
  exhaustion: number;
  conditions: string[];
  attrs: AttrView[];
  training: { armor: string[]; weapons: string[]; tools: string; languages: string[]; otherWeapons: string };
  attacks: Array<{ name: string; hit: string; damage: string; notes: string }>;
  abilities: Array<{ name: string; time: string; uses: Uses; recharge: string; notes: string }>;
  casting: Character['casting'];
  slots: Character['slots'];
  pact: Character['pact'];
  spells: Character['spells'];
  attunement: string[];
  feats: string[];
  classOptions: string[];
  texts: Record<SheetTextKey, string>;
  inventory: Array<{ name: string; qty: number; weight: number | null; notes: string; equipped: boolean }>;
  load: { weight: number; max: number | null };
  coins: Array<{ key: CoinKey; label: string; value: number }>;
  hasCoins: boolean;
  /** outras seções "## título" com texto que a ficha não usa em outro lugar */
  extras: Array<{ title: string; body: string }>;
  /** imagem da propriedade `imagem` (só o nome; o plugin não lê anexos) */
  imageRef: string;
}

/**
 * A nota tem números de ficha? 0 = não; 2 = personagem (tipo: personagem);
 * 1 = outra coisa com PV, CA ou atributos (criatura, PdM...).
 */
export function characterRank(text: string): 0 | 1 | 2 {
  const props = parseProps(text);
  if (!hasSheet(props)) return 0;
  return /personagem|character|jogador|player/i.test(asText(props['tipo'] ?? props['type'])) ? 2 : 1;
}

const USED_SECTIONS = ['Ataques', 'Habilidades', INVENTORY, SPELLS, 'Rolagens', ...SHEET_TEXTS.map((t) => t.title)];

/** Seções de nível 2 do corpo, na ordem: título e conteúdo. */
function sections(body: string): Array<{ title: string; body: string }> {
  const out: Array<{ title: string; body: string }> = [];
  let cur: { title: string; lines: string[] } | null = null;
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const m = fence ? null : /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      if (cur) out.push({ title: cur.title, body: cur.lines.join('\n').trim() });
      cur = { title: m[1]!, lines: [] };
    } else if (!fence && /^#\s/.test(line)) {
      if (cur) out.push({ title: cur.title, body: cur.lines.join('\n').trim() });
      cur = null;
    } else if (cur) cur.lines.push(line);
  }
  if (cur) out.push({ title: cur.title, body: cur.lines.join('\n').trim() });
  return out;
}

/** "1d8+@for concussão" → "1d8+3 concussão" */
function resolveDamage(s: string, vars: (n: string) => number | undefined): string {
  return s
    .replace(/([+-]?)\s*@([\p{L}_]+)/gu, (m, sign: string, n: string) => {
      const v = vars(n);
      if (v === undefined) return m;
      const neg = (sign === '-') !== v < 0;
      return `${sign || v < 0 ? (neg ? '−' : '+') : ''}${Math.abs(v)}`;
    })
    .replace(/[+−]0(?![\d,.])/g, '');
}

const plainLink = (s: string) => s.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t: string, a?: string) => a ?? t.split('/').pop()!);

export function buildFicha(path: string, text: string): Ficha {
  const c = readCharacter(text);
  const s = c.sheet;
  const props = parseProps(text);
  const vars = sheetVars(s);
  const body = splitFrontmatter(text).body;
  const h1 = /^#\s+(.+?)\s*$/m.exec(body)?.[1];
  const name = plainLink(h1 ?? path.split('/').pop()!.replace(/\.md$/i, ''));

  const klass = c.classes.length ? formatClasses(c.classes) : s.klass;
  const lineage = [c.species, c.lineage].filter(Boolean).join(' ');
  const head = [lineage, [klass, c.subclass && `(${c.subclass})`].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

  const chips: Ficha['chips'] = [];
  const chip = (label: string, value: string) => value && chips.push({ label, value: plainLink(value) });
  chip('Origem', c.background);
  chip('Alinhamento', c.alignment);
  chip('Pronomes', c.pronouns);
  chip('Jogador', s.player);
  chip('Edição', c.edition);

  const attrs: AttrView[] = ATTRS.map((a) => {
    const at = s.attrs.find((x) => x.key === a.key);
    const saveProf = s.saves.some((x) => a.aliases.some((al) => sameTitle(al, x)) || sameTitle(x, a.label));
    return {
      key: a.key,
      label: a.label,
      score: at?.score ?? null,
      mod: at ? signed(at.mod) : '—',
      save: signed(saveBonus(s, a.key)),
      saveProf,
      skills: s.system === '5e'
        ? SKILLS_5E.filter((k) => k.attr === a.key).map((k) => {
          const b = skillBonus(s, k);
          return { name: k.name, bonus: signed(b.bonus), level: b.level };
        })
        : [],
    };
  });

  const acNote = [c.armorInfo?.name ?? (c.armor ? plainLink(c.armor) : ''), c.shield ? 'escudo' : ''].filter(Boolean).join(' + ');
  const inventory = readInventory(text).map((it) => ({ name: itemLabel(it.name), qty: it.qty, weight: it.weight, notes: plainLink(it.notes), equipped: it.equipped }));
  const str = s.attrs.find((a) => a.key === 'for')?.score;
  const purse = readPurse(props);

  return {
    path,
    name,
    lineage: head,
    chips,
    level: c.level,
    xp: c.xp === null ? null : { have: c.xp, floor: c.xpFloor, next: c.xpNext },
    canLevelUp: c.canLevelUp,
    system: s.system,
    ac: s.ac === null ? '—' : String(s.ac),
    acNote,
    shield: c.shield,
    hp: {
      cur: s.hp === null ? '' : String(s.hp),
      max: String(s.hpMax ?? c.hpMaxAuto ?? ''),
      temp: s.hpTemp ? String(s.hpTemp) : '',
    },
    hitDice: c.hitDice,
    init: signed(s.init),
    speed: c.speed,
    size: c.size,
    prof: signed(s.prof),
    passive: c.passive,
    inspiration: c.inspiration,
    death: c.death,
    exhaustion: c.exhaustion,
    conditions: c.conditions,
    attrs,
    training: {
      armor: c.armorTraining,
      weapons: c.weaponTraining,
      tools: plainLink(c.tools),
      languages: c.languages,
      otherWeapons: plainLink(c.weapons),
    },
    attacks: readAttackRows(text).map((r) => ({
      name: plainLink(r.name),
      hit: resolveBonus(r.hit, vars),
      damage: resolveDamage(r.damage, vars),
      notes: plainLink(r.notes),
    })),
    abilities: readAbilities(text).map((a) => ({
      name: plainLink(a.name),
      time: a.time,
      uses: { max: abilityMax(a, vars), spent: a.spent },
      recharge: a.recharge,
      notes: plainLink(a.notes),
    })),
    casting: c.casting,
    slots: c.slots,
    pact: c.pact,
    spells: c.spells,
    attunement: c.attunement.map(plainLink),
    feats: c.featList,
    classOptions: c.classOptions,
    texts: c.texts,
    inventory,
    load: { weight: inventoryWeight(readInventory(text)), max: str ? carryCapacity(str).max : null },
    coins: COINS.map((k) => ({ key: k.key, label: k.label, value: purse.coins[k.key] })),
    hasCoins: purse.any,
    extras: sections(body).filter((x) => x.body && !USED_SECTIONS.some((t) => sameTitle(t, x.title))),
    imageRef: asText(props['imagem'] ?? props['image'] ?? props['retrato']),
  };
}
