import type { Entry, EntryObj } from './types';

/*
 * Texto do 5etools → markdown (para gravar na nota) ou HTML (para mostrar
 * na ficha). O 5etools escreve as regras como uma árvore de blocos
 * ("entries", listas, tabelas) com tags em linha: {@spell Fireball|XPHB},
 * {@damage 2d6}, {@condition Prone|XPHB}... As tags de coisas consultáveis
 * (magia, item, condição, talento...) viram links no HTML:
 *
 *   <a class="cref" data-ref="spell|Fireball|XPHB">Fireball</a>
 *
 * e a interface abre a entrada do compêndio ao clicar.
 */

export type RefKind =
  | 'spell' | 'item' | 'condition' | 'feat' | 'action' | 'skill' | 'sense' | 'variantrule' | 'class' | 'species' | 'background'
  | 'optionalfeature' | 'disease' | 'language' | 'itemMastery' | 'itemProperty';

const LINKS: Record<string, RefKind> = {
  spell: 'spell', item: 'item', condition: 'condition', status: 'condition', feat: 'feat', action: 'action', skill: 'skill', sense: 'sense',
  variantrule: 'variantrule', class: 'class', race: 'species', background: 'background', optfeature: 'optionalfeature', disease: 'disease',
  language: 'language', itemMastery: 'itemMastery', itemProperty: 'itemProperty',
};

const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const ATK: Record<string, string> = {
  mw: 'Melee Weapon Attack:', rw: 'Ranged Weapon Attack:', ms: 'Melee Spell Attack:', rs: 'Ranged Spell Attack:', 'mw,rw': 'Melee or Ranged Weapon Attack:',
  'ms,rs': 'Melee or Ranged Spell Attack:', m: 'Melee Attack Roll:', r: 'Ranged Attack Roll:', 'm,r': 'Melee or Ranged Attack Roll:',
};

type Mode = 'md' | 'html';

const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "Sphere [Area of Effect]" → "Sphere" */
const bare = (s: string) => s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();

function tag(name: string, arg: string, mode: Mode, esc: (s: string) => string): string {
  const parts = arg.split('|');
  const first = parts[0] ?? '';
  const b = (s: string) => (mode === 'html' ? `<b>${esc(s)}</b>` : `**${s}**`);
  const i = (s: string) => (mode === 'html' ? `<i>${esc(s)}</i>` : `*${s}*`);
  switch (name) {
    case 'b': case 'bold': return b(first);
    case 'i': case 'italic': return i(first);
    case 's': case 'strike': return mode === 'html' ? `<s>${esc(first)}</s>` : `~~${first}~~`;
    case 'u': case 'underline': case 'sup': case 'sub': case 'kbd': case 'code': case 'style': case 'font': case 'color': case 'highlight':
    case 'note': case 'tip': case 'help': case 'unit':
      return esc(first);
    case 'dice': case 'damage': case 'autodice':
      return esc(parts[1] && name === 'dice' && parts[1] !== first ? parts[1] : first.replace(/;/g, ' / '));
    case 'd20': case 'hit': {
      const n = Number(first);
      return esc(parts[1] ?? (Number.isFinite(n) ? (n >= 0 ? `+${n}` : `−${Math.abs(n)}`) : first));
    }
    case 'chance': return esc(parts[1] ?? `${first}%`);
    case 'recharge': return esc(first ? `(Recharge ${first}${first === '6' ? '' : '–6'})` : '(Recharge 6)');
    case 'dc': return esc(`DC ${parts[1] ?? first}`);
    case 'dcYourSpellSave': return esc(first || 'your spell save DC');
    case 'hitYourSpellAttack': return esc(first || 'your spell attack modifier');
    case 'scaledice': case 'scaledamage': return esc(parts[2] ?? first);
    case 'atk': case 'atkr': return i(ATK[first] ?? 'Attack:');
    case 'h': return i('Hit:') + ' ';
    case 'm': return i('Miss:') + ' ';
    case 'hom': return i('Hit or Miss:') + ' ';
    case 'actSave': return i(`${ABIL[first] ?? first} Saving Throw:`);
    case 'actSaveFail': return i(first ? `Failure by ${first} or More:` : 'Failure:');
    case 'actSaveSuccess': return i('Success:');
    case 'actSaveSuccessOrFail': return i('Failure or Success:');
    case 'actTrigger': return i('Trigger:');
    case 'actResponse': return i('Response:') + ' ';
    case 'coinflip': return esc(first || 'flip a coin');
    case 'filter': case 'book': case 'adventure': case '5etools': case 'area': case 'loader': case 'deity': case 'table': case 'creature': case 'vehicle':
    case 'object': case 'trap': case 'hazard': case 'reward': case 'psionic': case 'boon': case 'cult': case 'card': case 'deck': case 'legroup':
    case 'recipe': case 'facility': case 'charoption': case 'quickref': {
      const display = name === 'quickref' ? parts[4] : name === 'creature' || name === 'deity' ? parts[2] : name === 'area' ? parts[0] : undefined;
      return esc(display || first);
    }
    case 'classFeature': return esc(parts[5] || first);
    case 'subclassFeature': return esc(parts[7] || first);
    default: {
      const kind = LINKS[name];
      const display = (name === 'class' ? parts[2] : parts[2]) || (name === 'variantrule' ? bare(first) : first);
      if (!kind || mode === 'md') return esc(display);
      const ref = `${kind}|${first}|${parts[1] ?? ''}`;
      return `<a class="cref" href="#" data-ref="${escHtml(ref)}">${esc(display)}</a>`;
    }
  }
}

const TAG = /\{@(\w+)(?:\s+([^{}]*?))?\s*\}/;

/** Uma linha com tags → texto em markdown ou HTML seguro. */
export function renderInline(s: string, mode: Mode = 'md'): string {
  const slots: string[] = [];
  const esc = (x: string) => (mode === 'html' ? escHtml(x) : x);
  let cur = s;
  for (let guard = 0; guard < 500; guard++) {
    const m = TAG.exec(cur);
    if (!m) break;
    slots.push(tag(m[1]!, m[2] ?? '', mode, esc));
    cur = `${cur.slice(0, m.index)}\u0000${slots.length - 1}\u0000${cur.slice(m.index + m[0].length)}`;
  }
  const fill = (x: string): string => x.replace(/\u0000(\d+)\u0000/g, (_, n: string) => fill(slots[Number(n)] ?? ''));
  return fill(esc(cur));
}

/** Tira as tags e deixa o texto puro (para buscas e resumos). */
export function stripTags(s: string): string {
  return renderInline(s, 'md').replace(/\*\*?|~~/g, '');
}

const isObj = (e: unknown): e is EntryObj => !!e && typeof e === 'object' && !Array.isArray(e);

function cellText(c: unknown, mode: Mode): string {
  if (typeof c === 'string') return renderInline(c, mode);
  if (typeof c === 'number') return String(c);
  if (isObj(c)) {
    if (c.type === 'cell' && isObj(c['roll'])) {
      const r = c['roll'] as { exact?: number; min?: number; max?: number; pad?: boolean };
      return r.exact !== undefined ? String(r.exact) : `${r.min ?? ''}–${r.max ?? ''}`;
    }
    if (c.type === 'cell' && c.entry !== undefined) return cellText(c.entry, mode);
    if (c.type === 'bonus') return `+${String(c['value'])}`;
    if (c.type === 'bonusSpeed') return `+${String(c['value'])} ft.`;
    if (c.type === 'dice') {
      const r = (c['toRoll'] as Array<{ number: number; faces: number }> | undefined) ?? [];
      return r.map((d) => `${d.number}d${d.faces}`).join('+');
    }
    if (c.entries) return c.entries.map((x) => cellText(x, mode)).join(' ');
    if (c.entry !== undefined) return cellText(c.entry, mode);
  }
  return '';
}

/** Valor de uma célula de tabela do 5etools como texto ("{@dice 1d6}" → "1d6", {type:'bonus', value:2} → "+2"). */
export const tableCell = (c: unknown): string => cellText(c, 'md').replace(/\*\*?/g, '');

// ---------------------------------------------------------------- markdown

function mdBlock(e: Entry, depth: number): string[] {
  if (typeof e === 'string') return [renderInline(e, 'md')];
  if (!isObj(e)) return [];
  const t = e.type ?? 'entries';
  switch (t) {
    case 'list': {
      return [(e.items ?? []).map((it) => {
        if (typeof it === 'string') return `- ${renderInline(it, 'md')}`;
        if (isObj(it) && (it.type === 'item' || it.type === 'itemSub' || it.type === 'itemSpell')) {
          const body = [...(it.entry !== undefined ? [it.entry] : []), ...(it.entries ?? [])].flatMap((x) => mdBlock(x, depth + 1)).join(' ');
          return `- ${it.name ? `**${renderInline(it.name, 'md').replace(/[.:]?$/, '.')}** ` : ''}${body}`;
        }
        return mdBlock(it, depth + 1).map((l, i) => (i === 0 ? `- ${l}` : `  ${l}`)).join('\n');
      }).join('\n')];
    }
    case 'table': {
      const cols = ((e['colLabels'] as unknown[] | undefined) ?? []).map((c) => cellText(c, 'md'));
      const rows = ((e['rows'] as unknown[][] | undefined) ?? []).map((r) => (Array.isArray(r) ? r : isObj(r) && Array.isArray(r['row']) ? (r['row'] as unknown[]) : []).map((c) => cellText(c, 'md').replace(/\|/g, '\\|').replace(/\n/g, ' ')));
      const width = Math.max(cols.length, ...rows.map((r) => r.length));
      if (!width) return [];
      const head = cols.length ? cols : Array.from({ length: width }, () => ' ');
      const out = [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
      return [...(e['caption'] ? [`**${renderInline(String(e['caption']), 'md')}**`] : []), out];
    }
    case 'tableGroup': return ((e['tables'] as Entry[] | undefined) ?? []).flatMap((x) => mdBlock(x, depth));
    case 'quote': return [(e.entries ?? []).map((x) => `> ${typeof x === 'string' ? renderInline(x, 'md') : mdBlock(x, depth).join(' ')}`).join('\n>\n') + (e['by'] ? `\n> — ${String(e['by'])}` : '')];
    case 'abilityDc': return [`**${e.name ?? 'Spell'} save DC** = 8 + your proficiency bonus + your ${abilList(e['attributes'])} modifier`];
    case 'abilityAttackMod': return [`**${e.name ?? 'Spell'} attack modifier** = your proficiency bonus + your ${abilList(e['attributes'])} modifier`];
    case 'abilityGeneric': return [renderInline(String(e['text'] ?? ''), 'md')];
    case 'inline': case 'inlineBlock': return [(e.entries ?? []).map((x) => (typeof x === 'string' ? renderInline(x, 'md') : mdBlock(x, depth).join(' '))).join('')];
    case 'link': return [renderInline(String(e['text'] ?? ''), 'md')];
    case 'hr': return ['---'];
    case 'image': case 'gallery': case 'flowchart': case 'statblockInline': return [];
    case 'refOptionalfeature': return [`- ${String(e['optionalfeature'] ?? '').split('|')[0]}`];
    case 'refClassFeature': case 'refSubclassFeature': return [`- ${String(e['classFeature'] ?? e['subclassFeature'] ?? '').split('|')[0]}`];
    case 'statblock': return [`*${String(e['name'] ?? e['tag'] ?? '')}*`];
    case 'item': case 'itemSub': {
      const body = [...(e.entry !== undefined ? [e.entry] : []), ...(e.entries ?? [])].flatMap((x) => mdBlock(x, depth + 1)).join(' ');
      return [`**${renderInline(e.name ?? '', 'md')}** ${body}`];
    }
    default: {
      const kids = (e.entries ?? (e.entry !== undefined ? [e.entry] : [])).flatMap((x) => mdBlock(x, depth + 1));
      if (!e.name) return kids;
      const title = renderInline(e.name, 'md');
      if (kids.length && !/^[|>\-*]/.test(kids[0]!)) return [`***${title.replace(/[.:]?$/, '.')}*** ${kids[0]}`, ...kids.slice(1)];
      return [`***${title}***`, ...kids];
    }
  }
}

const abilList = (a: unknown): string => (Array.isArray(a) ? a.map((x) => ABIL[String(x)] ?? String(x)).join(' or ') : '');

/** Blocos do 5etools → markdown (parágrafos separados por linha em branco). */
export function entriesToMarkdown(entries: Entry[] | Entry | undefined): string {
  if (entries === undefined) return '';
  const list = Array.isArray(entries) ? entries : [entries];
  return list.flatMap((e) => mdBlock(e, 0)).filter((x) => x.trim()).join('\n\n');
}

// ---------------------------------------------------------------- HTML

function htmlBlock(e: Entry, depth: number): string {
  if (typeof e === 'string') return `<p>${renderInline(e, 'html')}</p>`;
  if (!isObj(e)) return '';
  const t = e.type ?? 'entries';
  switch (t) {
    case 'list': {
      const lis = (e.items ?? []).map((it) => {
        if (typeof it === 'string') return `<li>${renderInline(it, 'html')}</li>`;
        if (isObj(it) && (it.type === 'item' || it.type === 'itemSub' || it.type === 'itemSpell')) {
          const body = [...(it.entry !== undefined ? [it.entry] : []), ...(it.entries ?? [])].map((x) => (typeof x === 'string' ? renderInline(x, 'html') : htmlBlock(x, depth + 1))).join(' ');
          return `<li>${it.name ? `<b>${renderInline(it.name, 'html')}</b> ` : ''}${body}</li>`;
        }
        return `<li>${htmlBlock(it, depth + 1)}</li>`;
      }).join('');
      return `<ul>${lis}</ul>`;
    }
    case 'table': {
      const cols = ((e['colLabels'] as unknown[] | undefined) ?? []).map((c) => `<th>${cellText(c, 'html')}</th>`).join('');
      const rows = ((e['rows'] as unknown[][] | undefined) ?? []).map((r) => `<tr>${(Array.isArray(r) ? r : isObj(r) && Array.isArray(r['row']) ? (r['row'] as unknown[]) : []).map((c) => `<td>${cellText(c, 'html')}</td>`).join('')}</tr>`).join('');
      const cap = e['caption'] ? `<caption>${renderInline(String(e['caption']), 'html')}</caption>` : '';
      return `<div class="ctable"><table>${cap}${cols ? `<thead><tr>${cols}</tr></thead>` : ''}<tbody>${rows}</tbody></table></div>`;
    }
    case 'tableGroup': return ((e['tables'] as Entry[] | undefined) ?? []).map((x) => htmlBlock(x, depth)).join('');
    case 'quote': return `<blockquote>${(e.entries ?? []).map((x) => htmlBlock(x, depth)).join('')}${e['by'] ? `<cite>— ${escHtml(String(e['by']))}</cite>` : ''}</blockquote>`;
    case 'abilityDc': return `<p class="formula"><b>${escHtml(e.name ?? 'Spell')} save DC</b> = 8 + your proficiency bonus + your ${escHtml(abilList(e['attributes']))} modifier</p>`;
    case 'abilityAttackMod': return `<p class="formula"><b>${escHtml(e.name ?? 'Spell')} attack modifier</b> = your proficiency bonus + your ${escHtml(abilList(e['attributes']))} modifier</p>`;
    case 'abilityGeneric': return `<p class="formula">${renderInline(String(e['text'] ?? ''), 'html')}</p>`;
    case 'inline': case 'inlineBlock': return `<p>${(e.entries ?? []).map((x) => (typeof x === 'string' ? renderInline(x, 'html') : htmlBlock(x, depth))).join('')}</p>`;
    case 'link': return renderInline(String(e['text'] ?? ''), 'html');
    case 'hr': return '<hr>';
    case 'image': case 'gallery': case 'flowchart': case 'statblockInline': return '';
    case 'refOptionalfeature': {
      const [n = '', src = ''] = String(e['optionalfeature'] ?? '').split('|');
      return `<p>• <a class="cref" href="#" data-ref="${escHtml(`optionalfeature|${n}|${src}`)}">${escHtml(n)}</a></p>`;
    }
    case 'refClassFeature': case 'refSubclassFeature': return `<p>• ${escHtml(String(e['classFeature'] ?? e['subclassFeature'] ?? '').split('|')[0] ?? '')}</p>`;
    case 'statblock': return `<p><i>${escHtml(String(e['name'] ?? e['tag'] ?? ''))}</i></p>`;
    case 'item': case 'itemSub': {
      const body = [...(e.entry !== undefined ? [e.entry] : []), ...(e.entries ?? [])].map((x) => (typeof x === 'string' ? renderInline(x, 'html') : htmlBlock(x, depth + 1))).join(' ');
      return `<p><b>${renderInline(e.name ?? '', 'html')}</b> ${body}</p>`;
    }
    case 'inset': case 'insetReadaloud': case 'variant': case 'variantInner': case 'variantSub': {
      const kids = (e.entries ?? []).map((x) => htmlBlock(x, depth + 1)).join('');
      return `<aside class="inset">${e.name ? `<h6>${renderInline(e.name, 'html')}</h6>` : ''}${kids}</aside>`;
    }
    default: {
      const list = e.entries ?? (e.entry !== undefined ? [e.entry] : []);
      if (!e.name) return list.map((x) => htmlBlock(x, depth + 1)).join('');
      const title = renderInline(e.name, 'html');
      // primeiro parágrafo junto do título, como nos livros
      if (typeof list[0] === 'string') {
        return `<p><b class="ename">${title.replace(/[.:]?$/, '.')}</b> ${renderInline(list[0], 'html')}</p>${list.slice(1).map((x) => htmlBlock(x, depth + 1)).join('')}`;
      }
      return `<div class="esec"><h6>${title}</h6>${list.map((x) => htmlBlock(x, depth + 1)).join('')}</div>`;
    }
  }
}

/** Blocos do 5etools → HTML seguro (texto escapado; só tags conhecidas). */
export function entriesToHtml(entries: Entry[] | Entry | undefined): string {
  if (entries === undefined) return '';
  const list = Array.isArray(entries) ? entries : [entries];
  return list.map((e) => htmlBlock(e, 0)).join('');
}

/** Primeira frase do texto, sem tags (para resumos em listas). */
export function summaryOf(entries: Entry[] | undefined, max = 160): string {
  const first = (entries ?? []).map((e) => (typeof e === 'string' ? e : '')).find((s) => s.trim()) ?? '';
  const flat = stripTags(first).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}
