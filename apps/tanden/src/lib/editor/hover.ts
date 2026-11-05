import { hoverTooltip } from '@codemirror/view';
import { ENTITY_TYPES, asList, normalizeType, noteSection, parseProps, splitLink } from '@tanden/core';
import { hostFacet } from './host';

/*
 * Prévia de página ao passar o mouse num [[link]], como o "Page preview" do
 * Obsidian: mostra a nota (ou a seção/bloco do link) sem sair de onde está.
 */

const LINKS = /(?<!!)\[\[([^\]\n]+?)\]\]|\[[^\]\n]*\]\((?!https?:|mailto:)([^)\s]+\.md(?:#[^)\s]*)?)\)/g;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// propriedades que não ajudam numa prévia
const SKIP = new Set(['aliases', 'apelidos', 'cssclasses', 'imagem', 'retrato', 'capa', 'image', 'cover', 'img', 'foto', 'semente', 'mundo', 'world']);
const plain = (v: string) => v.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');

/** As propriedades da nota em poucas linhas (o tipo vira um selo), como uma ficha. */
function propsBox(text: string): HTMLElement | null {
  if (!text.startsWith('---')) return null;
  const p = parseProps(text);
  const keys = Object.keys(p).filter((k) => !SKIP.has(k.toLowerCase()) && asList(p[k]).join('').trim());
  if (!keys.length) return null;
  const box = document.createElement('div');
  box.className = 'props';
  const type = keys.find((k) => /^(tipo|type)$/i.test(k));
  if (type) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    // "faccao" vira "Facção" quando é um tipo do world building
    const raw = asList(p[type]).join(', ');
    badge.textContent = ENTITY_TYPES.find((t) => t.id === normalizeType(raw))?.label ?? raw;
    box.append(badge);
  }
  const dl = document.createElement('dl');
  for (const k of keys.filter((k) => k !== type).slice(0, 6)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = asList(p[k]).map(plain).join(', ');
    dl.append(dt, dd);
  }
  if (dl.childElementCount) box.append(dl);
  return box;
}

export const linkPreview = hoverTooltip(
  (view, pos) => {
    const host = view.state.facet(hostFacet);
    if (!host?.noteText || !host.render) return null;
    const line = view.state.doc.lineAt(pos);
    for (const m of line.text.matchAll(LINKS)) {
      const from = line.from + m.index!;
      const to = from + m[0].length;
      if (pos < from || pos > to) continue;
      const { target, sub } = splitLink(m[1] ?? decode(m[2]!));
      if (/^https?:/i.test(target) || (/\.[a-z0-9]{2,5}$/i.test(target) && !/\.md$/i.test(target))) return null;
      const text = host.noteText(target);
      const md = text === null ? null : sub ? noteSection(text, sub) : text.replace(/^---\n[\s\S]*?\n---\n?/, '');
      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-link-preview';
          const head = document.createElement('button');
          head.className = 'head';
          const real = (target ? host.resolve?.(target) ?? target : host.current?.() ?? '') || '';
          head.textContent = `${real.replace(/\.md$/i, '').split('/').pop()}${sub ? ` › ${sub.split('#').join(' › ')}` : ''}`;
          head.title = 'Abrir';
          head.onmousedown = (e) => e.preventDefault();
          head.onclick = () => host.open(m[1] ?? decode(m[2]!));
          const body = document.createElement('div');
          body.className = 'md-render';
          if (text === null) body.textContent = 'Esta nota ainda não existe. Clique no link para criar.';
          else if (md === null) body.textContent = `Não achei "${sub}" nessa nota.`;
          else if (!md.trim()) body.textContent = 'Nota vazia.';
          else body.innerHTML = host.render!(md.length > 6000 ? `${md.slice(0, 6000)}\n\n…` : md);
          if (text === null || md === null || !md.trim()) body.classList.add('muted');
          const props = text === null || sub ? null : propsBox(text);
          dom.append(head, ...(props ? [props] : []), body);
          return { dom };
        },
      };
    }
    return null;
  },
  { hoverTime: 450 },
);
