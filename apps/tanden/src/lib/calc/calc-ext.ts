import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state';
import { analyzeNote, isCalcNote, type CalcResult, type NoteCalc, type PlotSpec } from '@tanden/core/src/calc';
import type { AnyPlot } from './plot-view';
import { makePlot, sameDim } from './make-plot';
import { renderTex } from './tex';

/*
 * Cálculo, fórmulas e gráficos dentro do editor de notas.
 *
 * - Linhas de ```calc (ou de uma nota "tipo: cálculo") mostram o resultado à
 *   direita; clicar no resultado copia. Erros só aparecem fora da linha do cursor.
 * - ```grafico vira um gráfico interativo logo abaixo do bloco.
 * - $...$ e $$...$$ viram fórmula (KaTeX) quando o cursor sai delas.
 * A conta roda um instante depois da digitação parar, para não pesar.
 */

const RELEVANT = /(`{3,}|~{3,})\s*(calc|c[aá]lculo|calculadora|numerals|gr[aá]fico|plot|graph)\b/i;

function analyze(doc: Text): Fresh | null {
  const text = doc.toString();
  if (!RELEVANT.test(text) && !isCalcNote(text)) return null;
  return { doc, calc: analyzeNote(text) };
}

interface Fresh {
  /** documento analisado: se não for o atual, a análise está atrasada */
  doc: Text;
  calc: NoteCalc;
}

const setCalc = StateEffect.define<Fresh | null>();

const calcData = StateField.define<Fresh | null>({
  create: (s) => analyze(s.doc),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setCalc)) return e.value;
    return v;
  },
});

const scheduler = ViewPlugin.fromClass(
  class {
    timer = 0;
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      if (!u.docChanged) return;
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const doc = this.view.state.doc;
        const fresh = analyze(doc);
        const cur = this.view.state.field(calcData);
        if (!fresh && !cur) return;
        this.view.dispatch({ effects: setCalc.of(fresh) });
      }, 140);
    }
    destroy() {
      clearTimeout(this.timer);
    }
  },
);

// ---------- widgets ----------

class ResultWidget extends WidgetType {
  constructor(readonly r: CalcResult, readonly showError: boolean) {
    super();
  }
  eq(o: ResultWidget) {
    return o.r.kind === this.r.kind && o.r.text === this.r.text && o.r.tex === this.r.tex && o.r.error === this.r.error && o.showError === this.showError;
  }
  toDOM() {
    const el = document.createElement('span');
    const r = this.r;
    if (r.kind === 'error') {
      el.className = 'cm-calc-err';
      el.title = r.error ?? '';
      el.textContent = this.showError ? r.error ?? 'erro' : '·';
      return el;
    }
    if (r.kind === 'function') {
      el.className = 'cm-calc-fn';
      el.textContent = 'ƒ';
      el.title = `Função ${r.name} definida. Use em qualquer conta ou num bloco de gráfico.`;
      return el;
    }
    el.className = `cm-calc-out ${r.kind}`;
    el.title = 'Clique para copiar';
    if (r.tex && (r.kind === 'symbolic' || /bmatrix/.test(r.tex))) {
      const t = document.createElement('span');
      t.className = 'tex';
      t.innerHTML = renderTex(r.tex, false);
      el.append(t);
    } else el.textContent = r.text ?? '';
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', () => {
      void navigator.clipboard?.writeText((r.text ?? '').replace(/ /g, '').replace(/ \+ C$/, ''));
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 900);
    });
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const plots = new WeakMap<HTMLElement, AnyPlot>();

class PlotWidget extends WidgetType {
  constructor(readonly key: string, readonly spec: PlotSpec) {
    super();
  }
  eq(o: PlotWidget) {
    return o.key === this.key;
  }
  toDOM() {
    const pv = makePlot(this.spec, { height: this.spec.dim === 3 ? 340 : 280, wheel: 'ctrl' });
    pv.el.classList.add('cm-plot');
    plots.set(pv.el, pv);
    return pv.el;
  }
  updateDOM(dom: HTMLElement) {
    const pv = plots.get(dom);
    if (!pv || !sameDim(pv, this.spec)) return false;
    pv.setSpec(this.spec);
    return true;
  }
  destroy(dom: HTMLElement) {
    plots.get(dom)?.destroy();
  }
  get estimatedHeight() {
    return this.spec.dim === 3 ? 360 : 300;
  }
  ignoreEvent() {
    return true;
  }
}

class ChipWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(o: ChipWidget) {
    return o.text === this.text;
  }
  toDOM(view: EditorView) {
    const el = document.createElement('div');
    el.className = 'cm-calc-chip';
    el.textContent = this.text;
    el.title = 'Propriedades da nota (clique para ver)';
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(el) + 1 } });
      view.focus();
    });
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

class MathWidget extends WidgetType {
  constructor(readonly src: string, readonly display: boolean) {
    super();
  }
  eq(o: MathWidget) {
    return o.src === this.src && o.display === this.display;
  }
  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? 'div' : 'span');
    el.className = this.display ? 'cm-math-block' : 'cm-math-inline';
    el.innerHTML = renderTex(this.src, this.display);
    el.title = 'Clique para editar';
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(el);
      view.dispatch({ selection: { anchor: pos + (this.display ? 2 : 1) } });
      view.focus();
    });
    return el;
  }
  ignoreEvent() {
    return false;
  }
}

// ---------- decorações ----------

function touches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

function calcDecos(state: EditorState, fresh: Fresh): DecorationSet {
  const { doc } = state;
  const { calc } = fresh;
  const out: Range<Decoration>[] = [];
  const cursorLines = new Set(state.selection.ranges.map((r) => doc.lineAt(r.head).number - 1));
  const lineDeco = (n: number, cls: string) => {
    if (n < doc.lines) out.push(Decoration.line({ class: cls }).range(doc.line(n + 1).from));
  };
  // folha inteira: as propriedades do topo viram uma etiqueta discreta
  if (calc.whole && /^---\s*$/.test(doc.line(1).text)) {
    let end = 0;
    for (let i = 2; i <= Math.min(doc.lines, 40); i++) if (/^---\s*$/.test(doc.line(i).text)) { end = i; break; }
    // o cursor no início (nota recém-aberta) não conta como edição das propriedades
    const head = state.selection.main;
    const editing = touches(state, 0, doc.line(end || 1).to) && !(head.empty && head.head === 0 && state.selection.ranges.length === 1);
    if (end && !editing) {
      out.push(Decoration.replace({ widget: new ChipWidget('folha de cálculo'), block: true }).range(0, doc.line(end).to));
    }
  }
  for (const b of calc.blocks) {
    lineDeco(b.start, 'cm-calc-fence');
    for (let i = b.start + 1; i < b.end; i++) lineDeco(i, 'cm-calc-line');
    lineDeco(b.end, 'cm-calc-fence');
  }
  for (const [n, r] of calc.results) {
    if (n >= doc.lines) continue;
    if (r.kind === 'empty' || r.kind === 'text') continue;
    if (r.kind === 'assign' && r.trivial) continue;
    const line = doc.line(n + 1);
    if (r.kind === 'error' && !line.text.trim()) continue;
    const showError = !cursorLines.has(n);
    // o resultado fica à direita, por cima do recuo que a linha reserva para ele
    const len = r.kind === 'error' ? (showError ? Math.min(48, (r.error ?? '').length) : 1) : r.kind === 'function' ? 1 : Math.min(60, (r.text ?? '').length);
    out.push(Decoration.line({ class: 'cm-calc-row', attributes: { style: `padding-right: calc(${len}ch + 2.5em)` } }).range(line.from));
    out.push(Decoration.widget({ widget: new ResultWidget(r, showError), side: 1 }).range(line.to));
  }
  for (const p of calc.plots) {
    lineDeco(p.start, 'cm-calc-fence');
    for (let i = p.start + 1; i < p.end; i++) lineDeco(i, 'cm-calc-line cm-plot-src');
    lineDeco(p.end, 'cm-calc-fence');
    if (p.end >= doc.lines) continue;
    // a chave muda quando o bloco ou qualquer resultado acima dele muda
    let key = doc.sliceString(doc.line(p.start + 1).from, doc.line(p.end + 1).to);
    for (const [n, r] of calc.results) if (n < p.start) key += `\n${n}:${r.kind}:${r.text ?? ''}:${r.error ?? ''}`;
    out.push(Decoration.widget({ widget: new PlotWidget(key, p.spec), side: 1, block: true }).range(doc.line(p.end + 1).to));
  }
  return Decoration.set(out, true);
}

const INLINE = /(?<![\\$])\$(?=[^\s$])((?:\\.|[^$\\])+?)(?<=[^\s\\])\$(?!\d)/g;

function mathDecos(state: EditorState): DecorationSet {
  const { doc } = state;
  const out: Range<Decoration>[] = [];
  let fence: string | null = null;
  let block: { from: number; lines: string[] } | null = null;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const t = line.text;
    const f = /^\s*(`{3,}|~{3,})/.exec(t);
    if (block) {
      const end = t.lastIndexOf('$$');
      if (end >= 0) {
        block.lines.push(t.slice(0, end));
        const src = block.lines.join('\n').trim();
        const from = block.from;
        const to = line.to;
        if (src) {
          if (touches(state, from, to)) {
            out.push(Decoration.mark({ class: 'cm-math-src' }).range(from, to));
            out.push(Decoration.widget({ widget: new MathWidget(src, true), side: 1, block: true }).range(to));
          } else out.push(Decoration.replace({ widget: new MathWidget(src, true), block: true }).range(from, to));
        }
        block = null;
      } else block.lines.push(t);
      continue;
    }
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f[1]!;
      continue;
    }
    if (!t.includes('$')) continue;
    const dd = /^\s*\$\$(.*)$/.exec(t);
    if (dd) {
      const rest = dd[1]!;
      const close = rest.lastIndexOf('$$');
      if (close >= 0 && rest.slice(close + 2).trim() === '') {
        const src = rest.slice(0, close).trim();
        if (!src) continue;
        if (touches(state, line.from, line.to)) {
          out.push(Decoration.mark({ class: 'cm-math-src' }).range(line.from, line.to));
          out.push(Decoration.widget({ widget: new MathWidget(src, true), side: 1, block: true }).range(line.to));
        } else out.push(Decoration.replace({ widget: new MathWidget(src, true), block: true }).range(line.from, line.to));
      } else block = { from: line.from, lines: [rest] };
      continue;
    }
    // $ dentro de `código` não é fórmula
    const masked = t.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
    for (const m of masked.matchAll(INLINE)) {
      const from = line.from + m.index!;
      const to = from + m[0].length;
      const src = t.slice(m.index! + 1, m.index! + m[0].length - 1);
      if (touches(state, from, to)) out.push(Decoration.mark({ class: 'cm-math-src' }).range(from, to));
      else out.push(Decoration.replace({ widget: new MathWidget(src, false) }).range(from, to));
    }
  }
  return Decoration.set(out, true);
}

const calcDeco = StateField.define<DecorationSet>({
  create(s) {
    const c = s.field(calcData);
    return c ? calcDecos(s, c) : Decoration.none;
  },
  update(deco, tr) {
    const c = tr.state.field(calcData);
    const changed = tr.effects.some((e) => e.is(setCalc));
    if (!c) return Decoration.none;
    if (changed || (c.doc === tr.state.doc && (tr.selection || tr.docChanged))) return calcDecos(tr.state, c);
    return tr.docChanged ? deco.map(tr.changes) : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const mathDeco = StateField.define<DecorationSet>({
  create: (s) => mathDecos(s),
  update: (deco, tr) => (tr.docChanged || tr.selection ? mathDecos(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.baseTheme({
  '.cm-calc-line': { fontFamily: 'var(--f-mono)', fontSize: '13.5px', backgroundColor: 'color-mix(in srgb, var(--ink) 3.5%, transparent)', paddingLeft: '12px !important', borderLeft: '2px solid color-mix(in srgb, var(--ember) 45%, transparent)' },
  '.cm-calc-fence': { fontFamily: 'var(--f-mono)', fontSize: '11px', color: 'var(--muted)', opacity: '.6' },
  '.cm-calc-row': { position: 'relative' },
  '.cm-calc-out': { position: 'absolute', right: '4px', top: '0', padding: '0 8px', borderRadius: '6px', color: 'var(--ember-soft)', fontFamily: 'var(--f-mono)', fontSize: '13px', cursor: 'copy', transition: 'background .2s, color .2s', whiteSpace: 'nowrap', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 'inherit' },
  '.cm-calc-out:hover': { backgroundColor: 'color-mix(in srgb, var(--ember) 14%, transparent)' },
  '.cm-calc-out.copied': { backgroundColor: 'color-mix(in srgb, var(--ok) 22%, transparent)', color: 'var(--ok)' },
  '.cm-calc-out.symbolic, .cm-calc-out.solutions': { color: 'var(--ink)' },
  '.cm-calc-out .tex': { fontSize: '.95em' },
  '.cm-calc-out .katex-display': { margin: '0' },
  '.cm-calc-err': { position: 'absolute', right: '4px', top: '0', color: 'color-mix(in srgb, var(--crit) 80%, var(--muted))', fontFamily: 'var(--f-mono)', fontSize: '11.5px', opacity: '.85', maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.cm-calc-fn': { position: 'absolute', right: '8px', top: '0', color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'serif', fontSize: '15px', cursor: 'help' },
  '.cm-calc-chip': { display: 'inline-block', margin: '4px 0', padding: '2px 10px', borderRadius: '999px', border: '1px solid var(--line)', color: 'var(--muted)', fontFamily: 'var(--f-mono)', fontSize: '11px', cursor: 'pointer' },
  '.cm-plot': { margin: '6px 0 14px' },
  '.cm-math-src': { fontFamily: 'var(--f-mono)', fontSize: '.92em', color: 'var(--ember-soft)' },
  '.cm-math-inline': { cursor: 'text', padding: '0 1px' },
  '.cm-math-block': { cursor: 'text', padding: '6px 0', textAlign: 'center', overflowX: 'auto', overflowY: 'hidden' },
  '.cm-math-block .katex-display': { margin: '0' },
  '.tex-error': { color: 'var(--crit)', fontFamily: 'var(--f-mono)', fontSize: '12px' },
});

export const calcExtension: Extension = [calcData, scheduler, calcDeco, mathDeco, theme];
