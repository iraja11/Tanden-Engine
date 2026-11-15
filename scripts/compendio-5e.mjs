#!/usr/bin/env node
/*
 * Gera o compêndio de D&D 5e que a Mesa usa (criação de ficha, subida de
 * nível guiada, consulta de regras) a partir de uma cópia local do 5etools.
 *
 *   node scripts/compendio-5e.mjs [pasta do 5etools] [saída]
 *
 * Padrão: ../5e tools  →  apps/tanden/public/compendio/5e.json
 *
 * O arquivo gerado tem o texto dos livros: fica fora do git (.gitignore) e
 * só existe na máquina de quem tem a cópia. O formato é o do 5etools,
 * enxugado e com as referências entre características já resolvidas; quem
 * transforma em texto é `packages/core/src/rpg/compendio/`.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] ?? join(root, '..', '5e tools'));
const out = resolve(process.argv[3] ?? join(root, 'apps/tanden/public/compendio/5e.json'));
const data = existsSync(join(src, 'data')) ? join(src, 'data') : src;
if (!existsSync(join(data, 'class'))) {
  console.error(`Não achei os dados do 5etools em ${data}`);
  process.exit(1);
}
const read = (p) => JSON.parse(readFileSync(join(data, p), 'utf8'));

// livros oficiais que entram (o resto do 5etools fica de fora)
const ED2024 = new Set(['XPHB', 'XDMG', 'XMM', 'FRHoF', 'EFA']);
const SOURCES = new Set([...ED2024, 'PHB', 'DMG', 'XGE', 'TCE', 'MPMM', 'SCAG', 'FTD', 'EGW', 'ERLW', 'BGG', 'SatO', 'AAG', 'VRGR', 'MOT', 'GGR']);
const ok = (x) => x && SOURCES.has(x.source) && !x._copy;
const ed = (x) => (ED2024.has(x.source) || x.edition === 'one' ? '2024' : '2014');
const CLASSES = ['artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];

/** só os campos que interessam, sem undefined */
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const base = (x) => ({ name: x.name, source: x.source, ed: ed(x), ...(x.reprintedAs ? { reprinted: true } : {}), ...(x.srd || x.srd52 ? { srd: true } : {}) });

// ---------------------------------------------------------------- classes

const classes = [];
const subclasses = [];
const optRefs = new Set();

/** troca refClassFeature/refSubclassFeature pelo texto da característica */
function resolveRefs(entries, lookup) {
  if (!Array.isArray(entries)) return entries;
  return entries.map((e) => {
    if (e && typeof e === 'object') {
      if (e.type === 'refClassFeature' || e.type === 'refSubclassFeature') {
        const f = lookup(e.classFeature ?? e.subclassFeature);
        return f ? { type: 'entries', name: f.name, entries: resolveRefs(f.entries, lookup) } : null;
      }
      if (e.type === 'refOptionalfeature') optRefs.add(e.optionalfeature);
      const o = { ...e };
      if (o.entries) o.entries = resolveRefs(o.entries, lookup);
      if (o.items) o.items = resolveRefs(o.items, lookup);
      return o;
    }
    return e;
  }).filter((e) => e !== null);
}

for (const key of CLASSES) {
  const d = read(`class/class-${key}.json`);
  const cf = new Map();
  for (const f of d.classFeature ?? []) cf.set(`${f.name}|${f.className}|${f.classSource}|${f.level}|${f.source}`.toLowerCase(), f);
  const scf = new Map();
  for (const f of d.subclassFeature ?? []) scf.set(`${f.name}|${f.className}|${f.classSource}|${f.subclassShortName}|${f.subclassSource}|${f.level}|${f.source}`.toLowerCase(), f);
  const findCf = (ref) => {
    const [name, cls, csrc = 'PHB', level, fsrc] = ref.split('|');
    return cf.get(`${name}|${cls}|${csrc}|${level}|${fsrc || csrc}`.toLowerCase());
  };
  const findScf = (ref) => {
    const [name, cls, csrc = 'PHB', sub, ssrc = 'PHB', level, fsrc] = ref.split('|');
    return scf.get(`${name}|${cls}|${csrc || 'PHB'}|${sub}|${ssrc || 'PHB'}|${level}|${fsrc || ssrc || 'PHB'}`.toLowerCase());
  };
  const lookup = (ref) => (ref.split('|').length > 5 ? findScf(ref) : findCf(ref));

  for (const c of d.class ?? []) {
    if (!ok(c)) continue;
    const features = c.classFeatures.map((r) => {
      const ref = typeof r === 'string' ? r : r.classFeature;
      const f = findCf(ref);
      const level = Number(ref.split('|')[3]);
      if (!f) return { name: ref.split('|')[0], level, entries: [] };
      return { name: f.name, level, entries: resolveRefs(f.entries, lookup), ...(typeof r === 'object' && r.gainSubclassFeature ? { sub: true } : {}) };
    });
    const sp = c.startingProficiencies ?? {};
    classes.push({
      ...base(c),
      key,
      hd: c.hd?.faces ?? 8,
      saves: c.proficiency ?? [],
      ...pick(c, ['primaryAbility', 'spellcastingAbility', 'casterProgression', 'preparedSpells', 'preparedSpellsProgression', 'cantripProgression',
        'spellsKnownProgression', 'spellsKnownProgressionFixed', 'spellsKnownProgressionFixedByLevel', 'optionalfeatureProgression', 'featProgression', 'subclassTitle', 'multiclassing']),
      skills: sp.skills ?? [],
      armor: (sp.armor ?? []).map((a) => (typeof a === 'string' ? a : a.proficiency ?? a.full ?? '')).filter(Boolean),
      weapons: (sp.weapons ?? []).map((a) => (typeof a === 'string' ? a : a.proficiency ?? '')).filter(Boolean),
      tools: sp.tools ?? [],
      ...(sp.toolProficiencies ? { toolProficiencies: sp.toolProficiencies } : {}),
      equipment: c.startingEquipment ?? null,
      tables: (c.classTableGroups ?? []).map((g) => ({
        ...(g.title ? { title: g.title } : {}),
        cols: g.colLabels ?? [],
        rows: g.rows ?? g.rowsSpellProgression ?? [],
        ...(g.rowsSpellProgression ? { slots: true } : {}),
      })),
      features,
    });
  }

  for (const s of d.subclass ?? []) {
    if (!SOURCES.has(s.source) || s._copy) continue;
    if (!SOURCES.has(s.classSource)) continue;
    const features = (s.subclassFeatures ?? []).map((ref) => {
      const f = findScf(ref);
      const level = Number(ref.split('|')[5]);
      if (!f) return null;
      return { name: f.name, level, entries: resolveRefs(f.entries, lookup) };
    }).filter(Boolean);
    if (!features.length) continue;
    subclasses.push({
      ...base(s),
      ed: ED2024.has(s.classSource) ? '2024' : '2014',
      short: s.shortName,
      className: s.className,
      classSource: s.classSource,
      ...pick(s, ['spellcastingAbility', 'casterProgression', 'cantripProgression', 'spellsKnownProgression', 'additionalSpells', 'subclassTableGroups', 'optionalfeatureProgression']),
      features,
    });
  }
}

// ---------------------------------------------------------------- espécies

const racesFile = read('races.json');
const species = [];
const SPECIES_KEYS = ['size', 'speed', 'darkvision', 'ability', 'skillProficiencies', 'languageProficiencies', 'toolProficiencies', 'weaponProficiencies',
  'armorProficiencies', 'resist', 'additionalSpells', 'creatureTypes', 'feats', 'sizeEntry'];
for (const r of racesFile.race) {
  if (!ok(r) || r.name.startsWith('Custom')) {
    if (r.source === 'TCE' && r.name === 'Custom Lineage') species.push({ ...base(r), ...pick(r, SPECIES_KEYS), entries: r.entries ?? [] });
    continue;
  }
  const subs = racesFile.subrace.filter((s) => s.raceName === r.name && s.raceSource === r.source && SOURCES.has(s.source) && !s._copy);
  const own = { ...base(r), ...pick(r, SPECIES_KEYS), entries: r.entries ?? [] };
  if (!subs.length) { species.push(own); continue; }
  for (const s of subs) {
    const merged = { ...own, ...pick(s, SPECIES_KEYS) };
    if (r.ability && s.ability) merged.ability = r.ability.map((a, i) => ({ ...a, ...(s.ability[i] ?? s.ability[0]) }));
    for (const k of ['skillProficiencies', 'languageProficiencies', 'resist']) if (r[k] && s[k]) merged[k] = r[k];
    merged.entries = [...(r.entries ?? []), ...(s.entries ?? [])].filter((e, i, arr) => !(e?.data?.overwrite && arr.findIndex((x) => x?.name === e.data.overwrite) >= 0) || true);
    if (s.name) {
      merged.name = `${r.name} (${s.name})`;
      merged.base = r.name;
    }
    species.push(merged);
  }
}

// ---------------------------------------------------------------- antecedentes, talentos, opcionais

const backgrounds = read('backgrounds.json').background.filter(ok).map((b) => ({
  ...base(b),
  ...pick(b, ['ability', 'feats', 'skillProficiencies', 'toolProficiencies', 'languageProficiencies', 'startingEquipment']),
  entries: b.entries ?? [],
}));

const feats = read('feats.json').feat.filter(ok).map((f) => ({
  ...base(f),
  ...pick(f, ['category', 'prerequisite', 'ability', 'repeatable', 'additionalSpells', 'skillProficiencies']),
  entries: f.entries ?? [],
}));

const optionalfeatures = read('optionalfeatures.json').optionalfeature.filter(ok).map((o) => ({
  ...base(o),
  type: o.featureType,
  ...pick(o, ['prerequisite', 'consumes']),
  entries: o.entries ?? [],
}));

// ---------------------------------------------------------------- magias

const lookupSpell = read('generated/gendata-spell-source-lookup.json');
const spells = [];
const spellIndex = read('spells/index.json');
for (const file of Object.values(spellIndex)) {
  for (const s of read(`spells/${file}`).spell ?? []) {
    if (!ok(s)) continue;
    const look = lookupSpell[s.source.toLowerCase()]?.[s.name.toLowerCase()] ?? {};
    const cls = new Set();
    for (const [csrc, byName] of Object.entries(look.class ?? {})) {
      if (!SOURCES.has(csrc)) continue;
      for (const n of Object.keys(byName)) cls.add(n);
    }
    for (const [csrc, byName] of Object.entries(look.classVariant ?? {})) {
      if (!SOURCES.has(csrc)) continue;
      for (const n of Object.keys(byName)) cls.add(n);
    }
    spells.push({
      ...base(s),
      level: s.level,
      school: s.school,
      time: s.time,
      range: s.range,
      components: s.components,
      duration: s.duration,
      ...(s.meta?.ritual ? { ritual: true } : {}),
      classes: [...cls].sort(),
      ...pick(s, ['entriesHigherLevel', 'damageInflict', 'savingThrow', 'spellAttack', 'scalingLevelDice', 'conditionInflict']),
      entries: s.entries ?? [],
    });
  }
}

// ---------------------------------------------------------------- itens

const ib = read('items-base.json');
const ITEM_KEYS = ['type', 'rarity', 'weight', 'value', 'reqAttune', 'weaponCategory', 'property', 'mastery', 'dmg1', 'dmg2', 'dmgType', 'range', 'ac', 'strength',
  'stealth', 'bonusWeapon', 'bonusAc', 'bonusSpellAttack', 'bonusSavingThrow', 'charges', 'wondrous', 'tier', 'armor', 'weapon', 'ammoType', 'packContents'];
const items = [
  ...ib.baseitem.filter(ok).map((i) => ({ ...base(i), ...pick(i, ITEM_KEYS), entries: i.entries ?? [], base: true })),
  ...read('items.json').item.filter(ok).map((i) => ({ ...base(i), ...pick(i, ITEM_KEYS), entries: i.entries ?? [] })),
];
const itemProperties = ib.itemProperty.filter((p) => SOURCES.has(p.source)).map((p) => ({
  abbreviation: p.abbreviation, source: p.source, ed: ed(p), name: p.name ?? p.entries?.[0]?.name ?? p.abbreviation, entries: p.entries ?? [],
}));
const itemMastery = (ib.itemMastery ?? []).filter(ok).map((m) => ({ ...base(m), entries: m.entries ?? [] }));

// ---------------------------------------------------------------- regras

const cd = read('conditionsdiseases.json');
const conditions = [...cd.condition, ...(cd.status ?? [])].filter(ok).map((c) => ({ ...base(c), entries: c.entries ?? [] }));
const diseases = cd.disease.filter(ok).map((c) => ({ ...base(c), entries: c.entries ?? [] }));
const actions = read('actions.json').action.filter(ok).map((a) => ({ ...base(a), ...pick(a, ['time']), entries: a.entries ?? [] }));
const languages = read('languages.json').language.filter(ok).map((l) => ({ ...base(l), ...pick(l, ['type', 'typicalSpeakers', 'script']), entries: l.entries ?? [] }));
const skills = read('skills.json').skill.filter(ok).map((s) => ({ ...base(s), ability: s.ability, entries: s.entries ?? [] }));
const senses = read('senses.json').sense.filter(ok).map((s) => ({ ...base(s), entries: s.entries ?? [] }));
const variantrules = read('variantrules.json').variantrule.filter(ok).map((v) => ({ ...base(v), ...pick(v, ['ruleType']), entries: v.entries ?? [] }));

const comp = {
  version: 1,
  generated: new Date().toISOString(),
  classes, subclasses, species, backgrounds, feats, optionalfeatures, spells, items, itemProperties, itemMastery,
  conditions, diseases, actions, languages, skills, senses, variantrules,
};

mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(comp);
writeFileSync(out, json);
const count = Object.fromEntries(Object.entries(comp).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
console.log(`Compêndio 5e: ${(json.length / 1024 / 1024).toFixed(1)} MB → ${out}`);
console.log(count);
