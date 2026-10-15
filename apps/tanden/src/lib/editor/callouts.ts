import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import { CALLOUT, parseBlocks } from './blocks';
import { hostFacet } from './host';

/*
 * Callouts do Obsidian (> [!dica] Título) viram caixas coloridas, e os com
 * + ou - viram toggles (abrem e fecham). [!toggle] é o toggle do Notion, sem
 * caixa. [!colunas] com [!coluna] dentro põe o conteúdo lado a lado.
 */

type Family = 'note' | 'tip' | 'warn' | 'danger' | 'question' | 'example' | 'quote' | 'abstract' | 'todo' | 'toggle' | 'columns';

const FAMILIES: Record<string, Family> = {
  note: 'note', nota: 'note', info: 'note', informação: 'note', informacao: 'note',
  todo: 'todo', tarefa: 'todo',
  tip: 'tip', dica: 'tip', hint: 'tip', important: 'tip', importante: 'tip', success: 'tip', sucesso: 'tip', check: 'tip', done: 'tip', feito: 'tip',
  question: 'question', pergunta: 'question', help: 'question', ajuda: 'question', faq: 'question', dúvida: 'question', duvida: 'question',
  warning: 'warn', aviso: 'warn', caution: 'warn', cuidado: 'warn', attention: 'warn', atenção: 'warn', atencao: 'warn',
  failure: 'danger', fail: 'danger', missing: 'danger', danger: 'danger', perigo: 'danger', error: 'danger', erro: 'danger', bug: 'danger',
  example: 'example', exemplo: 'example',
  quote: 'quote', cite: 'quote', citação: 'quote', citacao: 'quote',
  abstract: 'abstract', summary: 'abstract', tldr: 'abstract', resumo: 'abstract',
  toggle: 'toggle', alternar: 'toggle', recolher: 'toggle',
  colunas: 'columns', columns: 'columns', 'multi-column': 'columns',
};

const ICONS: Record<Family, string> = {
  note: '<path d="M4 3h6l3 3v7H4z"/><path d="M6.5 8.5h4M6.5 11h3"/>',
  todo: '<circle cx="8" cy="8" r="5.5"/><path d="M5.5 8.2l1.8 1.8 3.3-3.6"/>',
  tip: '<path d="M8 2.5a4 4 0 0 1 2.4 7.2c-.5.4-.7.9-.7 1.4V12H6.3v-.9c0-.5-.2-1-.7-1.4A4 4 0 0 1 8 2.5z"/><path d="M6.5 14h3"/>',
  question: '<circle cx="8" cy="8" r="5.5"/><path d="M6.4 6.4a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1v.4M8 11.3v.1"/>',
  warn: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.3v.1"/>',
  danger: '<circle cx="8" cy="8" r="5.5"/><path d="M6 6l4 4M10 6l-4 4"/>',
  example: '<path d="M3 4.5h10M3 8h10M3 11.5h6"/>',
  quote: '<path d="M4 10.5c0-2.5 1-4 3-5M9 10.5c0-2.5 1-4 3-5"/>',
  abstract: '<path d="M3 4h10M3 7h10M3 10h7M3 13h5"/>',
  toggle: '',
  columns: '<path d="M3 3h4v10H3zM9 3h4v10H9z"/>',
};

const LABELS: Partial<Record<Family, string>> = { note: 'Nota', todo: 'A fazer', tip: 'Dica', question: 'Pergunta', warn: 'Atenção', danger: 'Perigo', example: 'Exemplo', quote: 'Citação', abstract: 'Resumo', toggle: '', columns: 'Colunas' };

export const familyOf = (type: string): Family => FAMILIES[type.toLowerCase()] ?? 'note';

/** abre ou fecha o callout cuja primeira linha começa em `pos` */
export const toggleCallout = StateEffect.define<number>({ map: (p, m) => m.mapPos(p) });

/** callouts que o usuário abriu ou fechou (o contrário do que o + ou - manda) */
const flipped = StateField.define<Set<number>>({
  create: () => new Set(),
  update(v, tr) {
    let next = v;
    if (tr.docChanged) next = new Set([...v].map((p) => tr.changes.mapPos(p)));
    for (const e of tr.effects) {
      if (!e.is(toggleCallout)) continue;
      next = new Set(next);
      if (next.has(e.value)) next.delete(e.value);
      else next.add(e.value);
    }
    return next;
  },
});

class HeadWidget extends WidgetType {
  constructor(readonly fam: Family, readonly foldable: boolean, readonly folded: boolean, readonly fallback: string) {
    super();
  }
  eq(o: HeadWidget) {
    return o.fam === this.fam && o.foldable === this.foldable && o.folded === this.folded && o.fallback === this.fallback;
  }
  toDOM(view: EditorView) {
    const s = document.createElement('span');
    s.className = 'cm-co-icon';
    if (this.foldable) {
      const c = document.createElement('span');
      c.className = `cm-co-chev${this.folded ? ' folded' : ''}`;
      c.innerHTML = '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>';
      c.title = this.folded ? 'Abrir' : 'Fechar';
      c.addEventListener('mousedown', (e) => {
        e.preventDefault();
        view.dispatch({ effects: toggleCallout.of(view.state.doc.lineAt(view.posAtDOM(s)).from) });
      });
      s.append(c);
    }
    if (ICONS[this.fam]) {
      const i = document.createElement('span');
      i.className = 'cm-co-svg';
      i.innerHTML = `<svg viewBox="0 0 16 16">${ICONS[this.fam]}</svg>`;
      s.append(i);
    }
    if (this.fallback) {
      const t = document.createElement('span');
      t.className = 'cm-co-fallback';
      t.textContent = this.fallback;
      s.append(t);
    }
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

/** [!colunas] fora do cursor: cada [!coluna] vira uma coluna, lado a lado. */
class ColumnsWidget extends WidgetType {
  constructor(readonly cols: string[], readonly title: string) {
    super();
  }
  eq(o: ColumnsWidget) {
    return o.title === this.title && o.cols.join('\u0000') === this.cols.join('\u0000');
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-columns';
    const host = view.state.facet(hostFacet);
    if (this.title) {
      const h = document.createElement('div');
      h.className = 'cm-columns-title';
      h.textContent = this.title;
      wrap.append(h);
    }
    const row = document.createElement('div');
    row.className = 'cm-columns-row';
    this.cols.forEach((md, i) => {
      const c = document.createElement('div');
      c.className = 'cm-column md-render';
      if (host?.render) c.innerHTML = host.render(md);
      else c.textContent = md;
      c.title = 'Clique para editar';
      c.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).closest('a')) return;
        e.preventDefault();
        // o cursor vai para a coluna clicada, no texto
        const start = view.posAtDOM(wrap);
        const doc = view.state.doc;
        let n = doc.lineAt(start).number;
        let seen = -1;
        for (; n <= doc.lines; n++) {
          if (/^\s*>\s*>\s*\[!/.test(doc.line(n).text) && ++seen === i) break;
        }
        const line = doc.line(Math.min(n + 1, doc.lines));
        view.dispatch({ selection: { anchor: line.to } });
        view.focus();
      });
      row.append(c);
    });
    wrap.append(row);
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

/** Conteúdo de cada [!coluna] dentro de um [!colunas] (sem os > ). */
export function columnsOf(lines: string[]): string[] {
  const cols: string[][] = [];
  for (const raw of lines.slice(1)) {
    const t = raw.replace(/^\s*>\s?/, '');
    if (/^\s*>\s*\[![\w-]+\]/.test(t)) {
      cols.push([]);
      const title = /^\s*>\s*\[![\w-]+\][+-]?\s*(.*)$/.exec(t)![1]!;
      if (title.trim()) cols[cols.length - 1]!.push(`**${title.trim()}**`);
      continue;
    }
    if (!cols.length) cols.push([]);
    cols[cols.length - 1]!.push(t.replace(/^\s*>\s?/, ''));
  }
  return cols.map((c) => c.join('\n').trim());
}

function build(state: EditorState): DecorationSet {
  const doc = state.doc;
  const out: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  const flips = state.field(flipped);
  const touchesLine = (n: number) => {
    const l = doc.line(n);
    return sel.some((r) => r.from <= l.to && r.to >= l.from);
  };
  const touchesRange = (from: number, to: number) => sel.some((r) => r.from <= to && r.to >= from);
  for (const b of parseBlocks(doc)) {
    if (b.kind !== 'callout') continue;
    const head = doc.line(b.start);
    const m = CALLOUT.exec(head.text)!;
    const fam = familyOf(m[1]!);
    const foldable = m[2] === '+' || m[2] === '-';
    const folded = foldable && (m[2] === '-') !== flips.has(head.from);
    const from = head.from;
    const to = doc.line(b.end).to;
    if (fam === 'columns' && !touchesRange(from, to)) {
      const lines: string[] = [];
      for (let i = b.start; i <= b.end; i++) lines.push(doc.line(i).text);
      out.push(Decoration.replace({ widget: new ColumnsWidget(columnsOf(lines), m[3]!.trim()), block: true }).range(from, to));
      continue;
    }
    const base = `cm-callout cm-co-${fam}`;
    const single = b.start === b.end || folded;
    out.push(Decoration.line({ class: `${base} cm-callout-head${single ? ' cm-callout-last' : ''}` }).range(head.from));
    if (!touchesLine(b.start)) {
      const titleAt = head.text.length - m[3]!.length;
      out.push(Decoration.replace({ widget: new HeadWidget(fam, foldable, folded, m[3]!.trim() ? '' : LABELS[fam] ?? m[1]!) }).range(head.from, head.from + titleAt));
    }
    if (b.end === b.start) continue;
    const bodyFrom = doc.line(b.start + 1).from;
    if (folded && !touchesRange(bodyFrom, to)) {
      out.push(Decoration.replace({ block: true }).range(head.to, to));
      continue;
    }
    for (let i = b.start + 1; i <= b.end; i++) {
      const line = doc.line(i);
      out.push(Decoration.line({ class: `${base} cm-callout-body${i === b.end ? ' cm-callout-last' : ''}` }).range(line.from));
      if (!touchesLine(i)) {
        const q = /^\s*>\s?/.exec(line.text);
        if (q) out.push(Decoration.replace({}).range(line.from, line.from + q[0].length));
      }
    }
  }
  return Decoration.set(out, true);
}

const deco = StateField.define<DecorationSet>({
  create: build,
  update: (v, tr) => (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(toggleCallout)) ? build(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});

export const callouts = [flipped, deco];
