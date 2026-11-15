import { setProps, type PropValue } from '../../caderno/frontmatter';
import { sameTitle } from '../../caderno/markdown';
import { catalogEntry } from '../catalogo';
import { makeChange } from '../coins';
import { readAttackRows, readCharacter, writeAttackRows } from '../ficha';
import { addItem, readInventory, writeInventory, type InventoryItem } from '../items';
import { equipItem, itemInfo } from '../mochila';
import { ATTRS } from '../sheet';
import {
  ABILITY_ORDER, ABILITY_PT, CLASS_PT, SIZE_PT, SKILL_PT, feetToMetres, type AbilityKey, type Compendium,
} from './compendium';
import { addSpells, classAbilities, hpPerLevelBonus, scoreMod as modOf, subclassSpells, syncAbilities, unarmedStrike } from './progressao';
import { stripTags } from './render';
import type { AbilityGrant, CBackground, CClass, CItem, CSpecies, CSpell, CSubclass, Edition, EquipItem } from './types';

/*
 * Criação de personagem pelo compêndio: as opções de cada passo (perícias,
 * atributos, equipamento inicial) e a ficha pronta no fim, gravada nas
 * propriedades e tabelas que a ficha já lê (`ficha.ts`, `items.ts`).
 */

// ---------------------------------------------------------------- atributos

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
/** custo da compra de pontos (27 pontos, de 8 a 15) */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUDGET = 27;

export function pointsSpent(scores: Record<AbilityKey, number>): number {
  return ABILITY_ORDER.reduce((s, k) => s + (POINT_COST[scores[k]] ?? 99), 0);
}

/** Uma forma de distribuir bônus de atributo: fixos + escolhas ("+2 em um, +1 em outro de..."). */
export interface AbilityOption {
  label: string;
  fixed: Partial<Record<AbilityKey, number>>;
  choose: Array<{ from: AbilityKey[]; count: number; amount: number }>;
}

const ALL = [...ABILITY_ORDER] as AbilityKey[];
const NAME: Record<AbilityKey, string> = { str: 'For', dex: 'Des', con: 'Con', int: 'Int', wis: 'Sab', cha: 'Car' };

function optionOf(g: AbilityGrant): AbilityOption {
  const fixed: Partial<Record<AbilityKey, number>> = {};
  for (const k of ALL) if (typeof g[k] === 'number') fixed[k] = g[k] as number;
  const choose: AbilityOption['choose'] = [];
  const ch = g.choose;
  if (ch?.weighted) {
    const from = ch.weighted.from as AbilityKey[];
    const w = ch.weighted.weights;
    if (w.every((x) => x === w[0])) choose.push({ from, count: w.length, amount: w[0]! });
    else for (const a of w) choose.push({ from, count: 1, amount: a });
  } else if (ch?.from) {
    choose.push({ from: ch.from as AbilityKey[], count: ch.count ?? 1, amount: ch.amount ?? 1 });
  }
  const parts = [
    ...Object.entries(fixed).map(([k, v]) => `${NAME[k as AbilityKey]} +${v}`),
    ...choose.map((c) => `+${c.amount}${c.count > 1 ? ` em ${c.count}` : ''} (${c.from.length === 6 ? 'qualquer' : c.from.map((k) => NAME[k]).join('/')})`),
  ];
  return { label: parts.join(', '), fixed, choose };
}

/**
 * De onde vêm os bônus de atributo: na 2024, do antecedente (+2/+1 ou
 * +1/+1/+1 entre três); na 2014, da espécie. Antecedente antigo na 2024
 * deixa escolher entre os seis.
 */
export function abilityOptions(ed: Edition, species: CSpecies | null, bg: CBackground | null): AbilityOption[] {
  if (ed === '2024') {
    if (bg?.ability?.length) return bg.ability.map(optionOf);
    return [optionOf({ choose: { weighted: { from: ALL, weights: [2, 1] } } }), optionOf({ choose: { weighted: { from: ALL, weights: [1, 1, 1] } } })];
  }
  if (species?.ability?.length) return species.ability.map(optionOf);
  return [optionOf({ choose: { weighted: { from: ALL, weights: [2, 1] } } })];
}

/** Total de bônus de uma opção com as escolhas feitas (`picks[i]` = atributos da escolha i). */
export function applyOption(opt: AbilityOption, picks: AbilityKey[][]): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = { ...opt.fixed };
  opt.choose.forEach((c, i) => {
    for (const k of (picks[i] ?? []).slice(0, c.count)) out[k] = (out[k] ?? 0) + c.amount;
  });
  return out;
}

// ---------------------------------------------------------------- perícias, idiomas, ferramentas

export interface SkillPick {
  /** já vêm (fixas) */
  fixed: string[];
  /** escolhas: quantas e de quais (vazio = qualquer) */
  choose: Array<{ count: number; from: string[] }>;
}

/** Perícias de uma lista de proficiências do 5etools ({athletics: true}, {choose: {...}}, {any: 1}). */
export function skillPick(list: Array<Record<string, unknown>> | undefined): SkillPick {
  const out: SkillPick = { fixed: [], choose: [] };
  const first = list?.[0];
  if (!first) return out;
  for (const [k, v] of Object.entries(first)) {
    if (k === 'choose') {
      const c = v as { from?: string[]; count?: number };
      out.choose.push({ count: c.count ?? 1, from: (c.from ?? []).filter((x) => SKILL_PT[x]) });
    } else if (k === 'any') out.choose.push({ count: Number(v) || 1, from: [] });
    else if (SKILL_PT[k]) out.fixed.push(k);
  }
  return out;
}

/** Idiomas fixos e quantos mais escolher. */
export function languagePick(list: Array<Record<string, unknown>> | undefined): { fixed: string[]; any: number } {
  const out = { fixed: [] as string[], any: 0 };
  for (const [k, v] of Object.entries(list?.[0] ?? {})) {
    if (/^any/.test(k)) out.any += Number(v) || 1;
    else if (k === 'choose') out.any += Number((v as { count?: number }).count ?? 1);
    else if (v === true) out.fixed.push(k.replace(/\b\w/g, (x) => x.toUpperCase()));
  }
  return out;
}

/** Ferramentas fixas (texto) e escolhas em aberto (texto do tipo). */
export function toolPick(list: Array<Record<string, unknown>> | undefined): { fixed: string[]; open: string[] } {
  const out = { fixed: [] as string[], open: [] as string[] };
  for (const [k, v] of Object.entries(list?.[0] ?? {})) {
    if (k === 'choose') out.open.push(`escolha de: ${((v as { from?: string[] }).from ?? []).join(', ')}`);
    else if (/^any/.test(k)) out.open.push(k === 'anyMusicalInstrument' ? 'instrumento musical' : k === 'anyArtisansTool' ? 'ferramenta de artesão' : 'ferramenta');
    else if (v === true) out.fixed.push(k);
    else if (typeof v === 'number') out.open.push(k);
  }
  return out;
}

/** Talento(s) que o antecedente (2024) ou a espécie dão: "magic initiate; wizard|xphb" → nome. */
export function grantedFeats(list: Array<Record<string, unknown>> | undefined): string[] {
  return Object.keys(list?.[0] ?? {}).filter((k) => k !== 'any' && k !== 'anyFromCategory').map((k) => {
    const name = k.split('|')[0]!;
    const [base, variant] = name.split(';').map((x) => x.trim());
    const title = (s: string) => s.replace(/\b\w/g, (x) => x.toUpperCase());
    return variant ? `${title(base!)} (${title(variant)})` : title(base!);
  });
}

// ---------------------------------------------------------------- equipamento inicial

export interface EquipLine {
  name: string;
  qty: number;
  /** "qualquer arma marcial": a interface pede para escolher */
  choose?: string;
}
export interface EquipOption { key: string; lines: EquipLine[]; cp: number }
export type EquipGroup = EquipOption[];

const TYPE_LABEL: Record<string, string> = {
  weaponSimple: 'arma simples', weaponMartial: 'arma marcial', weaponSimpleMelee: 'arma simples corpo a corpo', weaponMartialMelee: 'arma marcial corpo a corpo',
  weaponSimpleRanged: 'arma simples à distância', weaponMartialRanged: 'arma marcial à distância', instrumentMusical: 'instrumento musical',
  setGaming: 'jogo', toolArtisan: 'ferramenta de artesão', focusSpellcastingArcane: 'foco arcano', focusSpellcastingDruidic: 'foco druídico',
  focusSpellcastingHoly: 'símbolo sagrado', focusSpellcasting: 'foco de conjuração',
};

/** Itens comuns que servem num "qualquer ..." do equipamento inicial. */
export function itemsOfType(comp: Compendium, type: string, ed: Edition): CItem[] {
  const base = comp.items(ed).filter((i) => i.base || !i.rarity || i.rarity === 'none');
  const t = (i: CItem) => (i.type ?? '').split('|')[0];
  const cat = (i: CItem) => i.weaponCategory;
  const f: Record<string, (i: CItem) => boolean> = {
    weaponSimple: (i) => cat(i) === 'simple', weaponMartial: (i) => cat(i) === 'martial',
    weaponSimpleMelee: (i) => cat(i) === 'simple' && t(i) === 'M', weaponMartialMelee: (i) => cat(i) === 'martial' && t(i) === 'M',
    weaponSimpleRanged: (i) => cat(i) === 'simple' && t(i) === 'R', weaponMartialRanged: (i) => cat(i) === 'martial' && t(i) === 'R',
    instrumentMusical: (i) => t(i) === 'INS', setGaming: (i) => t(i) === 'GS', toolArtisan: (i) => t(i) === 'AT',
    focusSpellcastingArcane: (i) => t(i) === 'SCF' && /orb|crystal|rod|staff|wand/i.test(i.name),
    focusSpellcastingDruidic: (i) => t(i) === 'SCF' && /sprig|totem|yew|wooden staff/i.test(i.name),
    focusSpellcastingHoly: (i) => t(i) === 'SCF' && /amulet|emblem|reliquary/i.test(i.name),
    focusSpellcasting: (i) => t(i) === 'SCF',
  };
  const fn = f[type];
  return fn ? base.filter((i) => fn(i) && (i.base || !/^weapon/.test(type))).sort((a, b) => a.name.localeCompare(b.name)) : [];
}

/** Nome do item como fica na mochila: o nome em português do catálogo quando existe. */
export function inventoryName(name: string): string {
  return catalogEntry(name)?.name ?? name;
}

function lineOf(comp: Compendium, it: EquipItem, ed: Edition): EquipLine | { cp: number } | null {
  if (typeof it === 'string') {
    const [name = '', src = ''] = it.split('|');
    const item = comp.find<CItem>('item', name, src, ed);
    return { name: item?.name ?? name, qty: 1 };
  }
  if (it.value !== undefined && !it.item && !it.special && !it.equipmentType) return { cp: it.value };
  if (it.item) {
    const [name = '', src = ''] = it.item.split('|');
    const item = comp.find<CItem>('item', name, src, ed);
    return { name: it.displayName ?? item?.name ?? name, qty: it.quantity ?? 1 };
  }
  if (it.special) return { name: it.special.replace(/^\w/, (x) => x.toUpperCase()), qty: it.quantity ?? 1 };
  if (it.equipmentType) return { name: TYPE_LABEL[it.equipmentType] ?? it.equipmentType, qty: it.quantity ?? 1, choose: it.equipmentType };
  return null;
}

/** Grupos de escolha do equipamento inicial (cada grupo: opções A, B...; "_" é o que vem sempre). */
export function equipmentGroups(comp: Compendium, data: Array<Record<string, EquipItem[]>> | undefined, ed: Edition): EquipGroup[] {
  return (data ?? []).map((g) => Object.entries(g).map(([key, list]) => {
    const lines: EquipLine[] = [];
    let cp = 0;
    for (const it of list) {
      const l = lineOf(comp, it, ed);
      if (!l) continue;
      if ('cp' in l) cp += l.cp;
      else lines.push(l);
      if (typeof it === 'object' && it.containsValue) cp += it.containsValue;
    }
    return { key, lines, cp };
  }));
}

/** Abre os pacotes (Pacote de Explorador → os itens dele). */
export function expandPacks(comp: Compendium, lines: Array<{ name: string; qty: number }>, ed: Edition): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  for (const l of lines) {
    const item = comp.itemFor(l.name, ed);
    if (item?.packContents?.length) {
      for (const p of item.packContents) {
        const x = lineOf(comp, p, ed);
        if (x && !('cp' in x)) out.push({ name: x.name, qty: x.qty * l.qty });
      }
    } else out.push(l);
  }
  return out;
}

// ---------------------------------------------------------------- a ficha

export interface CreationInput {
  ed: Edition;
  cls: CClass;
  sub: CSubclass | null;
  species: CSpecies | null;
  lineage?: string;
  background: CBackground | null;
  /** valores finais (já com os bônus) */
  scores: Record<AbilityKey, number>;
  /** perícias (nomes do 5etools: "sleight of hand") */
  skills: string[];
  expertise?: string[];
  languages: string[];
  tools: string[];
  feats: string[];
  options?: string[];
  /** truques e magias (as de círculo entram preparadas) */
  spells: CSpell[];
  items: Array<{ name: string; qty: number }>;
  /** dinheiro em peças de cobre */
  cp: number;
  player?: string;
  pronouns?: string;
  alignment?: string;
}

const ARMOR_PT: Array<[RegExp, string]> = [[/light/i, 'leve'], [/medium/i, 'média'], [/heavy/i, 'pesada'], [/shield/i, 'escudos']];
const WEAPON_PT: Array<[RegExp, string]> = [[/^simple/i, 'simples'], [/^martial/i, 'marciais'], [/firearm/i, 'de fogo']];

function speedOf(sp: CSpecies | null): string | null {
  if (!sp?.speed) return null;
  const walk = typeof sp.speed === 'number' ? sp.speed : typeof sp.speed['walk'] === 'number' ? (sp.speed['walk'] as number) : null;
  if (walk === null) return null;
  const extra = typeof sp.speed === 'object'
    ? Object.entries(sp.speed).filter(([k, v]) => k !== 'walk' && typeof v === 'number').map(([k, v]) => `${({ fly: 'voo', swim: 'natação', climb: 'escalada', burrow: 'escavação' } as Record<string, string>)[k] ?? k} ${feetToMetres(v as number)}`)
    : [];
  return [feetToMetres(walk), ...extra].join(', ');
}

/** Grava o personagem pronto (1º nível) na nota. Nunca apaga o texto que já existe. */
export function applyCreation(text: string, comp: Compendium, inp: CreationInput): string {
  const cur = readCharacter(text);
  const patch: Record<string, PropValue | null> = {};
  const k = cur.keys;
  patch[k.edition] = inp.ed;
  patch[k.klass] = CLASS_PT[inp.cls.name] ?? inp.cls.name;
  patch[k.subclass] = inp.sub?.name ?? null;
  patch[k.level] = '1';
  patch[k.xp] = '0';
  patch[k.species] = inp.species?.name ?? null;
  patch[k.lineage] = inp.lineage?.trim() || null;
  patch[k.background] = inp.background?.name ?? null;
  if (inp.alignment) patch[k.alignment] = inp.alignment;
  if (inp.pronouns) patch[k.pronouns] = inp.pronouns;
  if (inp.player) patch['jogador'] = inp.player;

  for (const a of ABILITY_ORDER) {
    const prop = cur.sheet.attrs.find((x) => x.key === ABILITY_PT[a])?.prop ?? ATTRS.find((x) => x.key === ABILITY_PT[a])!.aliases[0]!;
    patch[prop] = String(inp.scores[a]);
  }
  patch[k.saves] = inp.cls.saves.map((s) => ABILITY_PT[s] ?? s);
  const skills = [...new Set(inp.skills)].map((s) => SKILL_PT[s] ?? s);
  patch[cur.sheet.keys.skills] = skills.length ? skills : null;
  const exp = (inp.expertise ?? []).map((s) => SKILL_PT[s] ?? s);
  patch[cur.sheet.keys.expertise] = exp.length ? exp : null;

  const armor = ARMOR_PT.filter(([re]) => inp.cls.armor.some((a) => re.test(stripTags(a)))).map(([, v]) => v);
  patch[k.armorTraining] = armor.length ? armor : null;
  const weapons = inp.cls.weapons.map((w) => stripTags(w));
  const wTrain = WEAPON_PT.filter(([re]) => weapons.some((w) => re.test(w))).map(([, v]) => v);
  patch[k.weaponTraining] = wTrain.length ? wTrain : null;
  const otherW = weapons.filter((w) => !WEAPON_PT.some(([re]) => re.test(w)));
  patch[k.weapons] = otherW.length ? otherW.join(', ') : null;
  patch[k.tools] = inp.tools.length ? inp.tools.join(', ') : null;
  patch[k.languages] = inp.languages.length ? [...new Set(inp.languages)] : null;
  patch[k.featList] = inp.feats.length ? [...new Set(inp.feats)] : null;
  patch[k.classOptions] = inp.options?.length ? inp.options : null;

  const speed = speedOf(inp.species);
  if (speed) patch[k.speed] = speed;
  if (inp.species?.size?.length) patch[k.size] = inp.species.size.map((s) => SIZE_PT[s] ?? s).join(' ou ');

  // PV do 1º nível: máximo do dado + Con (+ talentos/espécie)
  const con = modOf(inp.scores.con);
  const bonus = hpPerLevelBonus({ featList: inp.feats, species: inp.species?.name ?? '', subclass: inp.sub?.name ?? '', classes: [{ name: inp.cls.name }] });
  const hp = Math.max(1, inp.cls.hd + con + bonus);
  patch[cur.sheet.keys.hpMax] = String(hp);
  patch[cur.sheet.keys.hp] = String(hp);
  patch[cur.sheet.keys.ac] = null; // CA calculada pela armadura vestida

  // dinheiro
  const coins = makeChange(Math.max(0, Math.round(inp.cp)), 'po');
  for (const [c, n] of Object.entries(coins)) if (n) patch[c] = String(n);

  let out = setProps(text, patch);

  // inventário e o que vai equipado
  let inv: InventoryItem[] = readInventory(out);
  for (const it of inp.items) {
    const item = comp.itemFor(it.name, inp.ed);
    inv = addItem(inv, { name: inventoryName(it.name), link: null, qty: it.qty, weight: item?.weight ? Math.round(item.weight * 0.45 * 100) / 100 : null, notes: '' });
  }
  out = writeInventory(out, inv);
  // ataque desarmado de 2024 no lugar do padrão
  const atk = readAttackRows(out).filter((r) => !(sameTitle(r.name, 'Desarmado') && r.hit === '+0'));
  out = writeAttackRows(out, [unarmedStrike(inp.feats), ...atk.filter((r) => !sameTitle(r.name, 'Desarmado'))]);
  let armorOn = false;
  let shieldOn = false;
  readInventory(out).forEach((it, i) => {
    const info = itemInfo(it, null);
    if (info.kind === 'armadura' && !armorOn && armor.length) { out = equipItem(out, i, info, true); armorOn = true; }
    else if (info.kind === 'escudo' && !shieldOn && armor.includes('escudos')) { out = equipItem(out, i, info, true); shieldOn = true; }
    else if (info.kind === 'arma' && info.card.damage) out = equipItem(out, i, info, true);
  });

  // magias e habilidades
  out = addSpells(out, inp.spells);
  if (inp.sub) out = addSpells(out, subclassSpells(comp, inp.sub, 1, inp.ed));
  out = syncAbilities(out, classAbilities(comp, readCharacter(out)));
  return out;
}

export function modLabel(score: number): string {
  const m = modOf(score);
  return m >= 0 ? `+${m}` : `−${Math.abs(m)}`;
}
