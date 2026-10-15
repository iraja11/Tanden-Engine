import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, Prec, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { checkRoll } from '@tanden/core';
import { mesa } from './mesa.svelte';

/*
 * Rolagens dentro das notas, no formato do plugin Dice Roller do Obsidian:
 *
 *   `dice: 1d20+5`              botão que rola a fórmula
 *   `dice: 1d20+@des`           numa ficha, usa os valores dela
 *   `dice: [[Geradores#Clima]]` rola numa tabela
 *
 * Com o cursor dentro do código, o texto aparece para editar.
 */

const INLINE = /^`+\s*(?:dice|dado|dados|rolar|roll)\s*:\s*(.+?)\s*`+$/i;

/** último resultado de cada rolagem, para o botão lembrar depois de redesenhar */
const lastResult = new Map<string, { text: string; tone: '' | 'crit' | 'fumble' }>();

/** "1d20+5|nodice" → "1d20+5" (as opções do Dice Roller depois do | não importam aqui) */
function clean(src: string): string {
  const s = src.trim();
  if (s.startsWith('[[')) return s.replace(/\]\].*$/, ']]');
  return s.replace(/\|.*$/, '').trim();
}

class DiceWidget extends WidgetType {
  constructor(readonly src: string, readonly path: string | null) {
    super();
  }
  eq(o: DiceWidget) {
    return o.src === this.src && o.path === this.path;
  }
  private get key() {
    return `${this.path ?? ''}::${this.src}`;
  }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-dice';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-dice-btn';
    const formula = clean(this.src);
    const isTable = formula.startsWith('[[');
    const bad = isTable ? null : checkRoll(formula);
    btn.textContent = `🎲 ${isTable ? formula.slice(2, -2).split('|').pop() : formula}`;
    btn.title = bad ?? (isTable ? 'Rolar na tabela' : `Rolar ${formula}`);
    if (bad) btn.classList.add('bad');
    const out = document.createElement('span');
    out.className = 'cm-dice-out';
    const show = (r: { text: string; tone: '' | 'crit' | 'fumble' } | undefined) => {
      out.textContent = r ? r.text : '';
      out.className = `cm-dice-out${r?.tone ? ` ${r.tone}` : ''}`;
    };
    show(lastResult.get(this.key));
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let r: { text: string; tone: '' | 'crit' | 'fumble' };
      if (isTable) {
        const t = mesa.rollTable(formula, this.path ?? undefined);
        if (typeof t === 'string') return;
        r = { text: t.text.replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2'), tone: '' };
      } else {
        const rs = mesa.roll(formula, { from: this.path ?? undefined, label: '' });
        if (typeof rs === 'string') return;
        r = {
          text: rs.map((x) => String(x.total)).join(', '),
          tone: rs.some((x) => x.critical === 'max') ? 'crit' : rs.some((x) => x.critical === 'min') ? 'fumble' : '',
        };
      }
      lastResult.set(this.key, r);
      show(r);
      out.animate?.([{ transform: 'translateY(3px)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.34,1.4,.64,1)' });
    });
    wrap.append(btn, out);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

function build(view: EditorView, path: string | null): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.ranges;
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (n) => {
        if (n.name !== 'InlineCode') return;
        const text = view.state.doc.sliceString(n.from, n.to);
        const m = INLINE.exec(text);
        if (!m) return false;
        if (sel.some((r) => r.from <= n.to && r.to >= n.from)) return false;
        b.add(n.from, n.to, Decoration.replace({ widget: new DiceWidget(m[1]!, path) }));
        return false;
      },
    });
  }
  return b.finish();
}

/** Extensão do editor; `path` diz qual nota está aberta (para os valores @ da ficha). */
export function diceRolls(path: () => string | null): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      deco: DecorationSet;
      constructor(view: EditorView) {
        this.deco = build(view, path());
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.deco = build(u.view, path());
      }
    },
    { decorations: (v) => v.deco },
  );
  const theme = EditorView.baseTheme({
    '.cm-dice': { display: 'inline-flex', alignItems: 'baseline', gap: '6px' },
    '.cm-dice-btn': {
      font: '600 0.88em var(--f-mono)', border: '1px solid color-mix(in srgb, var(--ember) 45%, var(--line))', borderRadius: '8px',
      background: 'color-mix(in srgb, var(--ember) 10%, var(--surface-2))', color: 'var(--ink)', padding: '0 7px', cursor: 'pointer', lineHeight: '1.6',
    },
    '.cm-dice-btn:hover': { borderColor: 'var(--ember)' },
    '.cm-dice-btn.bad': { borderColor: 'var(--crit)', borderStyle: 'dashed' },
    '.cm-dice-out': { font: '700 0.95em var(--f-display)', color: 'var(--ember-soft)', display: 'inline-block' },
    '.cm-dice-out.crit': { color: 'var(--ember)', textShadow: '0 0 12px var(--ember-glow)' },
    '.cm-dice-out.fumble': { color: 'var(--crit)' },
  });
  return [Prec.highest(plugin), theme];
}
