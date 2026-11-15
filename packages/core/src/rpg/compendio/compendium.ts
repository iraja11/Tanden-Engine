import { classOf } from '../regras5e';
import { stripTags, summaryOf, type RefKind } from './render';
import type {
  CBackground, CClass, CFeat, CItem, COptional, CompBase, CompendiumData, CSpecies, CSpell, CSubclass, Edition,
} from './types';

/*
 * Consultas ao compêndio: por edição (2014 ou 2024), por nome (em inglês ou
 * o nome em português das classes), por referência "tipo|nome|fonte" (as
 * dos links do texto) e uma busca geral para a tela de consulta.
 *
 * Edição: na 2024 valem os livros novos e o que ainda não foi reeditado
 * (Xanathar, Tasha...); na 2014, só o material clássico.
 */

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function inEdition(x: Pick<CompBase, 'ed' | 'reprinted'>, ed: Edition): boolean {
  return ed === '2024' ? x.ed === '2024' || !x.reprinted : x.ed === '2014';
}

// ---------------------------------------------------------------- nomes em português

/** atributo do 5etools (str) → chave da ficha (for) */
export const ABILITY_PT: Record<string, string> = { str: 'for', dex: 'des', con: 'con', int: 'int', wis: 'sab', cha: 'car' };
export const ABILITY_NAME_PT: Record<string, string> = { str: 'Força', dex: 'Destreza', con: 'Constituição', int: 'Inteligência', wis: 'Sabedoria', cha: 'Carisma' };
export const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AbilityKey = (typeof ABILITY_ORDER)[number];

/** perícia do 5etools → nome na ficha */
export const SKILL_PT: Record<string, string> = {
  acrobatics: 'Acrobacia', 'animal handling': 'Adestrar Animais', arcana: 'Arcanismo', athletics: 'Atletismo', performance: 'Atuação',
  deception: 'Enganação', stealth: 'Furtividade', history: 'História', intimidation: 'Intimidação', insight: 'Intuição',
  investigation: 'Investigação', medicine: 'Medicina', nature: 'Natureza', perception: 'Percepção', persuasion: 'Persuasão',
  'sleight of hand': 'Prestidigitação', religion: 'Religião', survival: 'Sobrevivência',
};
export const SKILLS_EN = Object.keys(SKILL_PT);

export const CLASS_PT: Record<string, string> = {
  Artificer: 'Artífice', Barbarian: 'Bárbaro', Bard: 'Bardo', Cleric: 'Clérigo', Druid: 'Druida', Fighter: 'Guerreiro', Monk: 'Monge',
  Paladin: 'Paladino', Ranger: 'Patrulheiro', Rogue: 'Ladino', Sorcerer: 'Feiticeiro', Warlock: 'Bruxo', Wizard: 'Mago',
};

export const SCHOOL_PT: Record<string, string> = {
  A: 'Abjuração', C: 'Conjuração', D: 'Adivinhação', E: 'Encantamento', V: 'Evocação', I: 'Ilusão', N: 'Necromancia', T: 'Transmutação',
};

export const SIZE_PT: Record<string, string> = { T: 'Miúdo', S: 'Pequeno', M: 'Médio', L: 'Grande', H: 'Enorme', G: 'Imenso' };

export const DAMAGE_PT: Record<string, string> = {
  acid: 'ácido', bludgeoning: 'concussão', cold: 'frio', fire: 'fogo', force: 'energia', lightning: 'elétrico', necrotic: 'necrótico',
  piercing: 'perfurante', poison: 'veneno', psychic: 'psíquico', radiant: 'radiante', slashing: 'cortante', thunder: 'trovejante',
  A: 'ácido', B: 'concussão', C: 'frio', F: 'fogo', O: 'energia', L: 'elétrico', N: 'necrótico', P: 'perfurante', I: 'veneno', Y: 'psíquico',
  R: 'radiante', S: 'cortante', T: 'trovejante',
};

export const FEAT_CATEGORY_PT: Record<string, string> = { O: 'Origem', G: 'Geral', FS: 'Estilo de luta', 'FS:P': 'Estilo de luta (Paladino)', 'FS:R': 'Estilo de luta (Patrulheiro)', EB: 'Dádiva épica' };

export const OPTIONAL_TYPE_PT: Record<string, string> = {
  EI: 'Invocação mística', MM: 'Metamagia', 'MV:B': 'Manobra', 'FS:F': 'Estilo de luta', 'FS:R': 'Estilo de luta', 'FS:P': 'Estilo de luta', 'FS:B': 'Estilo de luta',
  PB: 'Dádiva do pacto', AI: 'Infusão', AS: 'Disparo arcano', ED: 'Disciplina elemental', RN: 'Runa', RP: 'Tradição',
};

/** pés → metros, como nos livros em português (5 pés = 1,5 m) */
export function feetToMetres(ft: number): string {
  const m = Math.round(ft * 0.3 * 10) / 10;
  return `${String(m).replace('.', ',')} m`;
}

// ---------------------------------------------------------------- magias em texto curto

const UNIT_PT: Record<string, [string, string]> = {
  action: ['ação', 'ações'], bonus: ['ação bônus', 'ações bônus'], reaction: ['reação', 'reações'], minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'], round: ['rodada', 'rodadas'], day: ['dia', 'dias'], turn: ['turno', 'turnos'], year: ['ano', 'anos'], week: ['semana', 'semanas'],
};
const plural = (n: number, unit: string) => {
  const u = UNIT_PT[unit];
  return u ? `${n} ${n === 1 ? u[0] : u[1]}` : `${n} ${unit}`;
};

export function spellTime(s: Pick<CSpell, 'time'>): string {
  return s.time.map((t) => plural(t.number, t.unit)).join(' ou ');
}

export function spellRange(s: Pick<CSpell, 'range'>): string {
  const r = s.range;
  const d = r.distance;
  if (!d) return r.type;
  if (d.type === 'self') return r.type === 'point' ? 'Pessoal' : `Pessoal`;
  if (d.type === 'touch') return 'Toque';
  if (d.type === 'sight') return 'Visão';
  if (d.type === 'unlimited') return 'Ilimitado';
  if (d.type === 'feet') return feetToMetres(d.amount ?? 0) + (r.type !== 'point' ? ` (${AREA_PT[r.type] ?? r.type})` : '');
  if (d.type === 'miles') return `${d.amount} ${d.amount === 1 ? 'milha' : 'milhas'}`;
  return d.type;
}
const AREA_PT: Record<string, string> = { radius: 'raio', sphere: 'esfera', cone: 'cone', line: 'linha', cube: 'cubo', emanation: 'emanação', hemisphere: 'hemisfério', cylinder: 'cilindro' };

export function spellDuration(s: Pick<CSpell, 'duration'>): string {
  return s.duration.map((d) => {
    if (d.type === 'instant') return 'Instantânea';
    if (d.type === 'permanent') return d.ends?.length ? 'Até ser dissipada' : 'Permanente';
    if (d.type === 'special') return 'Especial';
    if (d.type === 'timed' && d.duration) {
      const t = plural(d.duration.amount ?? 1, d.duration.type);
      return d.concentration ? `Concentração, até ${t}` : t;
    }
    return d.type;
  }).join(' ou ');
}

export function spellComponents(s: Pick<CSpell, 'components'>): string {
  const c = s.components ?? {};
  const m = typeof c.m === 'string' ? c.m : c.m?.text;
  return [c.v && 'V', c.s && 'S', m !== undefined && (m ? `M (${m})` : 'M')].filter(Boolean).join(', ');
}

export const isConcentration = (s: Pick<CSpell, 'duration'>): boolean => s.duration.some((d) => d.concentration);

/** Resumo para a coluna Notas da ficha: dano/cura, salvaguarda ou ataque. */
export function spellNote(s: CSpell): string {
  const parts: string[] = [];
  const first = (s.entries ?? []).map((e) => (typeof e === 'string' ? e : '')).join(' ');
  const dmg = /\{@damage ([^}|]+)/.exec(first)?.[1];
  if (dmg && s.damageInflict?.length) parts.push(`${dmg} ${s.damageInflict.map((d) => DAMAGE_PT[d] ?? d).join('/')}`);
  else if (/\{@dice ([^}|]+)\}[^.]*(?:hit points|Hit Points)/.exec(first)) parts.push(`cura ${/\{@dice ([^}|]+)/.exec(first)![1]}`);
  if (s.savingThrow?.length) parts.push(`salv. ${s.savingThrow.map((x) => ABILITY_NAME_PT[x.slice(0, 3)] ?? x).join('/')}`);
  if (s.spellAttack?.length) parts.push('ataque');
  return parts.join(' · ');
}

// ---------------------------------------------------------------- o compêndio

export interface CompHit {
  kind: RefKind | 'subclass';
  name: string;
  source: string;
  ed: Edition;
  /** linha de apoio: "Magia de 3º círculo · Evocação" */
  sub: string;
  item: CompBase;
}

export const KIND_PT: Record<CompHit['kind'], string> = {
  spell: 'Magia', item: 'Item', condition: 'Condição', feat: 'Talento', action: 'Ação', skill: 'Perícia', sense: 'Sentido', variantrule: 'Regra',
  class: 'Classe', subclass: 'Subclasse', species: 'Espécie', background: 'Antecedente', optionalfeature: 'Opção de classe', disease: 'Doença',
  language: 'Idioma', itemMastery: 'Maestria', itemProperty: 'Propriedade',
};

export class Compendium {
  readonly data: CompendiumData;
  private byKind = new Map<string, Map<string, CompBase[]>>();

  constructor(data: CompendiumData) {
    this.data = data;
    const lists: Array<[RefKind | 'subclass', CompBase[]]> = [
      ['spell', data.spells], ['item', data.items], ['condition', data.conditions], ['feat', data.feats], ['action', data.actions],
      ['skill', data.skills], ['sense', data.senses], ['variantrule', data.variantrules], ['class', data.classes], ['subclass', data.subclasses],
      ['species', data.species], ['background', data.backgrounds], ['optionalfeature', data.optionalfeatures], ['disease', data.diseases],
      ['language', data.languages], ['itemMastery', data.itemMastery],
    ];
    for (const [k, list] of lists) {
      const m = new Map<string, CompBase[]>();
      for (const x of list ?? []) {
        const key = norm(x.name);
        m.set(key, [...(m.get(key) ?? []), x]);
      }
      this.byKind.set(k, m);
    }
  }

  /** Entrada pelo nome (e fonte, se houver), preferindo a da edição pedida. */
  find<T extends CompBase = CompBase>(kind: RefKind | 'subclass', name: string, source = '', ed: Edition = '2024'): T | null {
    const n = norm(name.replace(/\s*\[[^\]]*\]\s*$/, ''));
    const list = this.byKind.get(kind)?.get(n);
    if (!list?.length) {
      if (kind === 'itemProperty') {
        const p = this.data.itemProperties.find((x) => norm(x.abbreviation) === n || norm(x.name) === n);
        return (p ? { ...p, name: p.name } : null) as T | null;
      }
      return null;
    }
    if (source) {
      const s = list.find((x) => x.source.toLowerCase() === source.toLowerCase());
      if (s) return s as T;
    }
    return (list.find((x) => x.ed === ed && inEdition(x, ed)) ?? list.find((x) => inEdition(x, ed)) ?? list[0]!) as T;
  }

  /** "spell|Fireball|XPHB" (dos links do texto) → entrada. */
  ref(ref: string, ed: Edition = '2024'): { kind: RefKind | 'subclass'; item: CompBase } | null {
    const [kind = '', name = '', source = ''] = ref.split('|');
    const item = this.find(kind as RefKind, name, source, ed);
    return item ? { kind: kind as RefKind, item } : null;
  }

  classes(ed: Edition): CClass[] {
    return this.data.classes.filter((c) => c.ed === ed).sort((a, b) => (CLASS_PT[a.name] ?? a.name).localeCompare(CLASS_PT[b.name] ?? b.name, 'pt'));
  }

  /** Classe pelo nome em inglês ou em português ("Guerreiro" → Fighter). */
  classFor(name: string, ed: Edition): CClass | null {
    const info = classOf(name);
    const en = info ? Object.entries(CLASS_PT).find(([, pt]) => pt === info.name)?.[0] : null;
    const n = norm(en ?? name);
    return this.data.classes.find((c) => norm(c.name) === n && c.ed === ed) ?? this.data.classes.find((c) => norm(c.name) === n) ?? null;
  }

  /** Subclasses de uma classe na edição (na 2024, também as antigas que não foram reeditadas). */
  subclassesFor(cls: CClass, ed: Edition): CSubclass[] {
    const all = this.data.subclasses.filter((s) => s.className === cls.name);
    const own = all.filter((s) => s.classSource === cls.source);
    if (ed === '2014') return own.sort(byName);
    const names = new Set(own.map((s) => norm(s.short)));
    const legacy = all.filter((s) => s.classSource !== cls.source && !s.reprinted && !names.has(norm(s.short)));
    // a mesma subclasse antiga aparece uma vez só
    const seen = new Set<string>();
    return [...own, ...legacy.filter((s) => (seen.has(norm(s.short)) ? false : (seen.add(norm(s.short)), true)))].sort(byName);
  }

  subclassFor(cls: CClass, name: string, ed: Edition): CSubclass | null {
    const n = norm(name);
    if (!n) return null;
    const list = this.subclassesFor(cls, ed);
    return list.find((s) => norm(s.name) === n || norm(s.short) === n) ?? list.find((s) => norm(s.name).includes(n) || n.includes(norm(s.short))) ?? null;
  }

  species(ed: Edition): CSpecies[] { return dedupe(this.data.species.filter((x) => inEdition(x, ed))); }
  backgrounds(ed: Edition): CBackground[] { return dedupe(this.data.backgrounds.filter((x) => inEdition(x, ed))); }
  feats(ed: Edition): CFeat[] { return dedupe(this.data.feats.filter((x) => inEdition(x, ed))); }
  spells(ed: Edition): CSpell[] { return dedupe(this.data.spells.filter((x) => inEdition(x, ed))); }
  items(ed: Edition): CItem[] { return dedupe(this.data.items.filter((x) => inEdition(x, ed))); }
  optionals(ed: Edition, types: string[]): COptional[] {
    return dedupe(this.data.optionalfeatures.filter((x) => inEdition(x, ed) && x.type.some((t) => types.includes(t))));
  }

  speciesFor(name: string, ed: Edition): CSpecies | null { return this.find<CSpecies>('species', name, '', ed); }
  backgroundFor(name: string, ed: Edition): CBackground | null { return this.find<CBackground>('background', name, '', ed); }
  featFor(name: string, ed: Edition): CFeat | null { return this.find<CFeat>('feat', name.replace(/;.*$/, '').trim(), '', ed); }
  spellFor(name: string, ed: Edition): CSpell | null { return this.find<CSpell>('spell', name, '', ed); }
  itemFor(name: string, ed: Edition): CItem | null { return this.find<CItem>('item', name, '', ed); }

  /** Magias da lista de uma classe (nome em inglês), até um círculo. */
  classSpells(className: string, ed: Edition, maxLevel = 9): CSpell[] {
    return this.spells(ed).filter((s) => s.level <= maxLevel && s.classes.includes(className)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  /** Busca em tudo (nome começa com > contém), da edição pedida. */
  search(q: string, ed: Edition, kinds?: Array<CompHit['kind']>, limit = 80): CompHit[] {
    const n = norm(q);
    const out: Array<CompHit & { score: number }> = [];
    for (const [kind, map] of this.byKind) {
      if (kinds && !kinds.includes(kind as CompHit['kind'])) continue;
      for (const [key, list] of map) {
        const score = !n ? 1 : key === n ? 0 : key.startsWith(n) ? 1 : key.includes(n) ? 2 : -1;
        if (score < 0) continue;
        const pick = list.find((x) => x.ed === ed && inEdition(x, ed)) ?? list.find((x) => inEdition(x, ed));
        if (!pick) continue;
        out.push({ kind: kind as CompHit['kind'], name: pick.name, source: pick.source, ed: pick.ed, sub: subtitle(kind as CompHit['kind'], pick), item: pick, score });
      }
    }
    return out.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, limit);
  }
}

const byName = (a: CompBase, b: CompBase) => a.name.localeCompare(b.name);

/** um por nome, preferindo a fonte mais nova da mesma edição */
function dedupe<T extends CompBase>(list: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of list) {
    const k = norm(x.name);
    const cur = m.get(k);
    if (!cur || (cur.ed !== '2024' && x.ed === '2024') || (cur.ed === x.ed && cur.reprinted && !x.reprinted)) m.set(k, x);
  }
  return [...m.values()].sort(byName);
}

export const ordinalPt = (n: number): string => `${n}º`;

/** Linha de apoio de uma entrada (tipo, círculo, raridade...). */
export function subtitle(kind: CompHit['kind'], x: CompBase): string {
  const k = KIND_PT[kind];
  if (kind === 'spell') {
    const s = x as CSpell;
    return `${s.level === 0 ? 'Truque' : `Magia de ${s.level}º círculo`} · ${SCHOOL_PT[s.school] ?? s.school}${s.ritual ? ' · ritual' : ''}${isConcentration(s) ? ' · concentração' : ''}`;
  }
  if (kind === 'item') return itemLine(x as CItem);
  if (kind === 'feat') {
    const f = x as CFeat;
    return `Talento${f.category ? ` de ${FEAT_CATEGORY_PT[f.category] ?? f.category}` : ''}${f.prerequisite ? ` · ${prereqText(f.prerequisite)}` : ''}`;
  }
  if (kind === 'optionalfeature') {
    const o = x as COptional;
    return `${o.type.map((t) => OPTIONAL_TYPE_PT[t] ?? t).join(', ')}${o.prerequisite ? ` · ${prereqText(o.prerequisite)}` : ''}`;
  }
  if (kind === 'subclass') return `Subclasse de ${CLASS_PT[(x as CSubclass).className] ?? (x as CSubclass).className}`;
  if (kind === 'class') return `Classe · d${(x as CClass).hd}`;
  return k;
}

export const RARITY_PT: Record<string, string> = {
  none: 'comum', common: 'comum', uncommon: 'incomum', rare: 'raro', 'very rare': 'muito raro', legendary: 'lendário', artifact: 'artefato', varies: 'variável', unknown: '',
};

export function itemLine(i: CItem): string {
  const type = (i.type ?? '').split('|')[0] ?? '';
  const TYPE: Record<string, string> = {
    M: 'Arma corpo a corpo', R: 'Arma à distância', LA: 'Armadura leve', MA: 'Armadura média', HA: 'Armadura pesada', S: 'Escudo', A: 'Munição',
    P: 'Poção', SC: 'Pergaminho', RG: 'Anel', WD: 'Varinha', RD: 'Bastão', ST: 'Cajado', G: 'Equipamento', AT: 'Ferramenta de artesão',
    T: 'Ferramenta', GS: 'Jogo', INS: 'Instrumento', SCF: 'Foco de conjuração', MNT: 'Montaria', TAH: 'Arreio', FD: 'Comida', TG: 'Mercadoria',
    $C: 'Moeda', $G: 'Gema', $A: 'Objeto de arte', OTH: 'Outro', VEH: 'Veículo', SHP: 'Navio',
  };
  const t = TYPE[type] ?? (i.wondrous ? 'Item maravilhoso' : 'Item');
  const rar = RARITY_PT[i.rarity ?? 'none'] ?? i.rarity ?? '';
  const att = i.reqAttune ? ` · sintonização${typeof i.reqAttune === 'string' ? ` (${i.reqAttune})` : ''}` : '';
  return [t, i.rarity && i.rarity !== 'none' ? rar : '', i.value ? moneyText(i.value) : ''].filter(Boolean).join(' · ') + att;
}

/** peças de cobre → "15 po", "5 pp" */
export function moneyText(cp: number): string {
  if (cp >= 100 && cp % 100 === 0) return `${(cp / 100).toLocaleString('pt-BR')} po`;
  if (cp >= 100) return `${(cp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} po`;
  if (cp % 10 === 0) return `${cp / 10} pp`;
  return `${cp} pc`;
}

/** Pré-requisito em texto curto: "Nível 4+", "For 13", "Conjuração"... */
export function prereqText(pre: Array<Record<string, unknown>>): string {
  return pre.map((p) => {
    const parts: string[] = [];
    if (p['level']) {
      const l = p['level'];
      parts.push(typeof l === 'number' ? `nível ${l}+` : `nível ${(l as { level: number }).level}+${(l as { class?: { name: string } }).class ? ` (${CLASS_PT[(l as { class: { name: string } }).class.name] ?? (l as { class: { name: string } }).class.name})` : ''}`);
    }
    if (Array.isArray(p['ability'])) {
      parts.push((p['ability'] as Array<Record<string, number>>).map((a) => Object.entries(a).map(([k, v]) => `${ABILITY_NAME_PT[k] ?? k} ${v}`).join(' e ')).join(' ou '));
    }
    if (p['spellcasting'] || p['spellcasting2020'] || p['spellcastingFeature']) parts.push('conjuração');
    if (Array.isArray(p['race'])) parts.push((p['race'] as Array<{ name: string; subrace?: string }>).map((r) => `${r.name}${r.subrace ? ` (${r.subrace})` : ''}`).join(' ou '));
    if (Array.isArray(p['feat'])) parts.push((p['feat'] as string[]).map((f) => stripTags(`{@feat ${f}}`)).join(', '));
    if (Array.isArray(p['proficiency'])) parts.push((p['proficiency'] as Array<Record<string, string>>).map((x) => Object.values(x).join(' ')).join(', '));
    if (p['pact']) parts.push(`Pacto ${String(p['pact'])}`);
    if (p['patron']) parts.push(`Patrono ${String(p['patron'])}`);
    if (Array.isArray(p['spell'])) parts.push((p['spell'] as string[]).map((x) => stripTags(`{@spell ${x.replace(/#c$/, '')}}`)).join(', '));
    if (typeof p['other'] === 'string') parts.push(p['other']);
    if (Array.isArray(p['otherSummary'])) parts.push(String((p['otherSummary'] as Array<{ entrySummary?: string }>)[0]?.entrySummary ?? ''));
    return parts.join(', ');
  }).filter(Boolean).join(' ou ');
}

export { summaryOf };

const CONDITION_EN: Record<string, string> = {
  caido: 'Prone', agarrado: 'Grappled', amedrontado: 'Frightened', atordoado: 'Stunned', cego: 'Blinded', contido: 'Restrained', impedido: 'Restrained',
  enfeiticado: 'Charmed', envenenado: 'Poisoned', incapacitado: 'Incapacitated', inconsciente: 'Unconscious', invisivel: 'Invisible',
  paralisado: 'Paralyzed', petrificado: 'Petrified', surdo: 'Deafened', exausto: 'Exhaustion', exaustao: 'Exhaustion',
};

/** Condição escrita na ficha ("Caído") → referência do compêndio. */
export function conditionRef(name: string): string {
  const n = norm(name);
  if (/^concentr/.test(n)) return 'variantrule|Concentration|';
  return `condition|${CONDITION_EN[n] ?? name}|`;
}
