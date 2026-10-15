import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { syntaxTree, foldable, foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language';
import { StateField, type EditorState, type Range } from '@codemirror/state';
import { codeLines, frontmatterEnd } from './blocks';
import { hostFacet, linkExists } from './host';

/*
 * Prévia ao vivo, como no Obsidian: a marcação (#, **, [[ ]], - [ ]) some
 * quando o cursor sai dela e o texto aparece formatado. Onde o cursor está,
 * o Markdown fica visível para editar. O arquivo nunca muda por causa disso.
 */

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

class BulletWidget extends WidgetType {
  constructor(readonly depth: number) {
    super();
  }
  eq(o: BulletWidget) {
    return o.depth === this.depth;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = `cm-bullet d${this.depth % 3}`;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }
}

class CheckWidget extends WidgetType {
  constructor(readonly state: string) {
    super();
  }
  eq(o: CheckWidget) {
    return o.state === this.state;
  }
  toDOM(view: EditorView) {
    const b = document.createElement('span');
    b.className = `cm-check${this.state === ' ' ? '' : this.state === '-' ? ' cancel' : ' on'}`;
    b.setAttribute('role', 'checkbox');
    b.setAttribute('aria-checked', String(this.state !== ' '));
    b.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>';
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(b);
      // a posição é a do "[": o caractere de dentro vem logo depois
      const ch = view.state.doc.sliceString(pos + 1, pos + 2);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: ch === ' ' ? 'x' : ' ' }, userEvent: 'input.check' });
    });
    return b;
  }
  ignoreEvent() {
    return true;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-rule';
    return s;
  }
}

class FoldWidget extends WidgetType {
  constructor(readonly folded: boolean) {
    super();
  }
  eq(o: FoldWidget) {
    return o.folded === this.folded;
  }
  toDOM(view: EditorView) {
    const b = document.createElement('span');
    b.className = `cm-hfold${this.folded ? ' folded' : ''}`;
    b.title = this.folded ? 'Mostrar seção' : 'Recolher seção';
    b.innerHTML = '<svg viewBox="0 0 16 16"><path d="M5 6l3 3 3-3"/></svg>';
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const line = view.state.doc.lineAt(view.posAtDOM(b));
      const open = openFold(view.state, line.to);
      if (open) view.dispatch({ effects: unfoldEffect.of(open) });
      else {
        const r = foldable(view.state, line.from, line.to);
        if (r) view.dispatch({ effects: foldEffect.of(r) });
      }
    });
    return b;
  }
  ignoreEvent() {
    return true;
  }
}

function openFold(state: EditorState, at: number): { from: number; to: number } | null {
  let hit: { from: number; to: number } | null = null;
  foldedRanges(state).between(at, at, (from, to) => {
    if (from === at) hit = { from, to };
  });
  return hit;
}

const bullets = [new BulletWidget(0), new BulletWidget(1), new BulletWidget(2)];
const rule = new RuleWidget();
const CALC_LANG = /^(calc|c[aá]lculo|calculadora|numerals|gr[aá]fico|plot|graph)$/;

const LANG_NAMES: Record<string, string> = {
  calc: 'Cálculo', 'cálculo': 'Cálculo', calculo: 'Cálculo', calculadora: 'Cálculo', numerals: 'Cálculo',
  grafico: 'Gráfico', 'gráfico': 'Gráfico', plot: 'Gráfico', graph: 'Gráfico',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', py: 'Python', python: 'Python',
  sh: 'Shell', bash: 'Shell', json: 'JSON', html: 'HTML', css: 'CSS', sql: 'SQL', md: 'Markdown', rust: 'Rust', go: 'Go',
  mermaid: 'Diagrama', base: 'Base', math: 'Fórmula', latex: 'LaTeX', tex: 'LaTeX',
};

/** a cerca ```lang vira uma etiqueta discreta quando o cursor está fora do bloco */
class FenceLabel extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }
  eq(o: FenceLabel) {
    return o.lang === this.lang;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-fence-label';
    const key = this.lang.toLowerCase();
    el.textContent = LANG_NAMES[key] ?? (this.lang || 'Código');
    el.title = 'Clique no bloco para editar';
    return el;
  }
  ignoreEvent() {
    return false;
  }
}
const hidden = Decoration.replace({});

const HL = /(^|[^=])(==)(?=\S)([^=\n]+?)(==)(?!=)/g;
const WIKI = /(!?)\[\[([^\[\]\n]+?)\]\]/g;
const TAG = /(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const COMMENT = /%%[^\n]*?%%/g;
const FOOT = /\[\^[^\]\s]+\]/g;

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  const host = state.facet(hostFacet);
  const touches = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);
  const activeLines = new Set<number>();
  for (const r of sel) {
    const a = doc.lineAt(r.from).number;
    const b = doc.lineAt(r.to).number;
    for (let i = a; i <= Math.min(b, a + 400); i++) activeLines.add(i);
  }
  const lineActive = (pos: number) => activeLines.has(doc.lineAt(pos).number);
  const hide = (from: number, to: number) => {
    if (to > from) out.push(hidden.range(from, to));
  };
  const fm = frontmatterEnd(doc);
  const fmTo = fm ? doc.line(fm).to : -1;
  const tree = syntaxTree(state);
  const depthOf = (n: SyntaxNode) => {
    let d = 0;
    for (let p = n.parent; p; p = p.parent) if (p.name === 'BulletList' || p.name === 'OrderedList') d++;
    return d - 1;
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (n) => {
        if (n.from <= fmTo) return n.to > fmTo ? undefined : false;
        const name = n.name;
        if (name === 'FencedCode') {
          const open = doc.lineAt(n.from);
          const close = doc.lineAt(n.to);
          const m = /^\s*(?:`{3,}|~{3,})\s*([^\s`{]*)/.exec(open.text);
          const lang = (m?.[1] ?? '').toLowerCase();
          // cálculo e gráfico têm o visual deles (calc-ext); o resto ganha caixa de código
          if (!CALC_LANG.test(lang) && lang !== 'base') {
            for (let i = open.number; i <= close.number; i++) {
              const cls = i === open.number ? 'cm-code cm-code-first' : i === close.number ? 'cm-code cm-code-last' : 'cm-code';
              out.push(Decoration.line({ class: cls }).range(doc.line(i).from));
            }
          }
          if (m && !touches(n.from, n.to) && close.number > open.number && lang !== 'base') {
            out.push(Decoration.replace({ widget: new FenceLabel(m[1]!) }).range(open.from, open.to));
            if (/^\s*(?:`{3,}|~{3,})\s*$/.test(close.text)) {
              hide(close.from, close.to);
              out.push(Decoration.line({ class: 'cm-fence-end' }).range(close.from));
            }
          }
          return false;
        }
        if (name === 'FencedCode' || name === 'CodeBlock' || name === 'HTMLBlock' || name === 'Table' || name === 'Image' || name === 'CommentBlock') return false;
        if (name.startsWith('ATXHeading')) {
          const line = doc.lineAt(n.from);
          out.push(Decoration.line({ class: `cm-h cm-h${name.slice(10)}` }).range(line.from));
          if (foldable(state, line.from, line.to) || openFold(state, line.to)) {
            out.push(Decoration.widget({ widget: new FoldWidget(!!openFold(state, line.to)), side: -1 }).range(line.from));
          }
          if (!lineActive(n.from)) {
            const mark = n.node.firstChild;
            if (mark?.name === 'HeaderMark') hide(mark.from, Math.min(mark.to + 1, line.to));
            const close = n.node.lastChild;
            if (close && close !== mark && close.name === 'HeaderMark') hide(close.from, close.to);
          }
          return;
        }
        if (name === 'SetextHeading1' || name === 'SetextHeading2') {
          out.push(Decoration.line({ class: `cm-h cm-h${name.slice(-1)}` }).range(doc.lineAt(n.from).from));
          return;
        }
        if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough') {
          if (name === 'Strikethrough') out.push(Decoration.mark({ class: 'cm-strike' }).range(n.from, n.to));
          if (!touches(n.from, n.to)) {
            for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === 'EmphasisMark' || c.name === 'StrikethroughMark') hide(c.from, c.to);
          }
          return;
        }
        if (name === 'InlineCode') {
          out.push(Decoration.mark({ class: 'cm-inline-code' }).range(n.from, n.to));
          if (!touches(n.from, n.to)) for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === 'CodeMark') hide(c.from, c.to);
          return false;
        }
        if (name === 'Link') {
          const marks = n.node.getChildren('LinkMark');
          const url = n.node.getChild('URL');
          if (marks.length >= 2 && url) {
            const href = doc.sliceString(url.from, url.to).replace(/^<|>$/g, '');
            const labelFrom = marks[0]!.to;
            const labelTo = marks[1]!.from;
            if (!touches(n.from, n.to) && labelTo > labelFrom) {
              hide(n.from, labelFrom);
              hide(labelTo, n.to);
              out.push(Decoration.mark({ class: 'cm-live-link', attributes: { 'data-href': href, title: href } }).range(labelFrom, labelTo));
            } else out.push(Decoration.mark({ class: 'cm-link-src' }).range(n.from, n.to));
          }
          return false;
        }
        if (name === 'URL' && n.node.parent?.name !== 'Link' && n.node.parent?.name !== 'Image') {
          const href = doc.sliceString(n.from, n.to).replace(/^<|>$/g, '');
          if (/^(https?:|mailto:|www\.)/i.test(href)) {
            out.push(Decoration.mark({ class: 'cm-live-link', attributes: touches(n.from, n.to) ? {} : { 'data-href': href.startsWith('www.') ? `https://${href}` : href } }).range(n.from, n.to));
          }
          return;
        }
        if (name === 'Blockquote') {
          const first = doc.lineAt(n.from);
          if (/^\s*>\s*\[!/.test(first.text)) return; // callout: a caixa é de outra extensão; aqui só o texto de dentro
          for (let l = first.number; l <= doc.lineAt(n.to).number; l++) {
            const line = doc.line(l);
            out.push(Decoration.line({ class: 'cm-quote' }).range(line.from));
            if (!activeLines.has(l)) {
              const m = /^(\s*>\s?)+/.exec(line.text);
              if (m) hide(line.from, line.from + m[0].length);
            }
          }
          return;
        }
        if (name === 'ListItem') {
          const mark = n.node.firstChild;
          if (!mark || mark.name !== 'ListMark') return;
          const task = n.node.getChild('Task');
          const line = doc.lineAt(mark.from);
          if (task) {
            const tm = task.getChild('TaskMarker');
            if (!tm) return;
            const st = doc.sliceString(tm.from + 1, tm.from + 2);
            out.push(Decoration.line({ class: `cm-task${st === ' ' ? '' : ' cm-task-done'}` }).range(line.from));
            if (!touches(mark.from, tm.to)) {
              hide(mark.from, Math.min(mark.to + 1, tm.from));
              out.push(Decoration.replace({ widget: new CheckWidget(st) }).range(tm.from, tm.to));
            }
          } else if (n.node.parent?.name === 'BulletList') {
            if (!touches(mark.from, mark.to)) out.push(Decoration.replace({ widget: bullets[depthOf(n.node) % 3]! }).range(mark.from, mark.to));
          } else {
            out.push(Decoration.mark({ class: 'cm-ol-mark' }).range(mark.from, mark.to));
          }
          return;
        }
        if (name === 'HorizontalRule') {
          if (!lineActive(n.from)) out.push(Decoration.replace({ widget: rule }).range(n.from, n.to));
          return false;
        }
        if (name === 'Escape') {
          if (!touches(n.from, n.to)) hide(n.from, n.from + 1);
          return false;
        }
        return;
      },
    });

    // o que o Markdown padrão não conhece: ==realce==, [[links]], #tags, %%comentários%%
    const code = codeLines(doc);
    const inCode = (pos: number) => {
      for (let c: SyntaxNode | null = tree.resolveInner(pos, 1); c; c = c.parent) {
        if (c.name === 'InlineCode' || c.name === 'URL' || c.name === 'FencedCode' || c.name === 'CodeBlock') return true;
      }
      return false;
    };
    for (let l = doc.lineAt(from).number; l <= doc.lineAt(to).number; l++) {
      if (code.has(l)) continue;
      const line = doc.line(l);
      const t = line.text;
      if (!t) continue;
      if (t.includes('==')) {
        for (const m of t.matchAll(HL)) {
          const a = line.from + m.index! + m[1]!.length;
          const b = a + m[0].length - m[1]!.length;
          if (inCode(a)) continue;
          out.push(Decoration.mark({ class: 'cm-hl' }).range(a + 2, b - 2));
          if (!touches(a, b)) {
            hide(a, a + 2);
            hide(b - 2, b);
          }
        }
      }
      if (t.includes('[[')) {
        for (const m of t.matchAll(WIKI)) {
          if (m[1]) continue; // ![[embed]]: a extensão de anexos mostra
          const a = line.from + m.index!;
          const b = a + m[0].length;
          if (inCode(a)) continue;
          const inner = m[2]!;
          const bar = inner.indexOf('|');
          const target = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
          const ok = linkExists(host, target);
          if (!touches(a, b)) {
            const labelFrom = bar >= 0 ? a + 2 + bar + 1 : a + 2;
            hide(a, labelFrom);
            hide(b - 2, b);
            const hash = bar < 0 ? target.indexOf('#') : -1;
            out.push(Decoration.mark({ class: `cm-wikilink${ok ? '' : ' missing'}`, attributes: { 'data-href': target, title: ok ? target : `${target} (ainda não existe: clique para criar)` } }).range(labelFrom, b - 2));
            if (hash > 0) out.push(Decoration.mark({ class: 'cm-wikilink-sub' }).range(a + 2 + hash, a + 2 + hash + 1));
          } else out.push(Decoration.mark({ class: 'cm-link-src' }).range(a, b));
        }
      }
      if (t.includes('#')) {
        for (const m of t.matchAll(TAG)) {
          const a = line.from + m.index! + m[1]!.length;
          const b = a + 1 + m[2]!.length;
          if (/^\d+$/.test(m[2]!) || inCode(a)) continue;
          out.push(Decoration.mark({ class: 'cm-tag', attributes: { 'data-tag': m[2]! } }).range(a, b));
        }
      }
      if (t.includes('%%')) for (const m of t.matchAll(COMMENT)) out.push(Decoration.mark({ class: 'cm-comment' }).range(line.from + m.index!, line.from + m.index! + m[0].length));
      if (t.includes('[^')) for (const m of t.matchAll(FOOT)) if (!/^\[\^[^\]]+\]:/.test(t.slice(m.index!))) out.push(Decoration.mark({ class: 'cm-footref' }).range(line.from + m.index!, line.from + m.index! + m[0].length));
    }
  }

  // propriedades no topo: um painel discreto
  if (fm) {
    for (let l = 1; l <= fm; l++) {
      const cls = l === 1 ? 'cm-fm cm-fm-first' : l === fm ? 'cm-fm cm-fm-last' : 'cm-fm';
      out.push(Decoration.line({ class: cls }).range(doc.line(l).from));
      if (l > 1 && l < fm) {
        const line = doc.line(l);
        const k = /^([^:#\s][^:]*):/.exec(line.text);
        if (k) out.push(Decoration.mark({ class: 'cm-fm-key' }).range(line.from, line.from + k[1]!.length));
      }
    }
  }
  return Decoration.set(out, true);
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))) || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        if (e.button !== 0 || e.shiftKey || e.altKey) return false;
        const el = (e.target as HTMLElement).closest?.('[data-href]') as HTMLElement | null;
        if (!el || !view.contentDOM.contains(el)) return false;
        const host = view.state.facet(hostFacet);
        if (!host) return false;
        e.preventDefault();
        host.open(el.dataset.href!);
        return true;
      },
    },
  },
);

/**
 * As propriedades (frontmatter) já aparecem editáveis no painel acima do texto,
 * então no texto elas somem; voltam como código quando o cursor entra nelas.
 */
function fmDeco(state: EditorState): DecorationSet {
  const fm = frontmatterEnd(state.doc);
  if (!fm) return Decoration.none;
  const to = state.doc.line(fm).to;
  if (state.selection.ranges.some((r) => r.from <= to)) return Decoration.none;
  return Decoration.set([Decoration.replace({ block: true }).range(0, to)]);
}

export const hideFrontmatter = StateField.define<DecorationSet>({
  create: fmDeco,
  update: (d, tr) => (tr.docChanged || tr.selection ? fmDeco(tr.state) : d),
  provide: (f) => EditorView.decorations.from(f),
});
