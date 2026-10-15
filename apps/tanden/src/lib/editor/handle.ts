import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { ChangeSet } from '@codemirror/state';
import { startCompletion } from '@codemirror/autocomplete';
import { blockAt, type Block } from './blocks';
import { BLOCK_LABELS, deleteBlock, duplicateBlock, lineType, moveBlock, setBlockType, type BlockType } from './format';
import { hostFacet, noteName } from './host';
import { showMenu, type MenuItem } from './menu';

/*
 * Alça de bloco, como no Notion: ao passar o mouse num bloco aparecem "+"
 * (novo bloco abaixo, com o menu /) e "⋮⋮" (arrastar para mover; clicar abre
 * o menu do bloco). No celular a alça fica no bloco onde está o cursor.
 */

const coarse = () => matchMedia('(pointer: coarse)').matches;

const TYPE_ICONS: Record<BlockType, string> = { p: 'T', h1: 'H1', h2: 'H2', h3: 'H3', h4: 'H4', ul: '•', ol: '1.', task: '☑', quote: '❝', callout: 'ℹ', toggle: '▸', code: '</>' };

class Handle {
  dom: HTMLElement;
  plus: HTMLButtonElement;
  grip: HTMLButtonElement;
  drop: HTMLElement;
  block: Block | null = null;
  dragging = false;
  hideTimer = 0;
  scrollTimer = 0;

  constructor(readonly view: EditorView) {
    this.dom = document.createElement('div');
    this.dom.className = 'cm-handle';
    this.dom.setAttribute('aria-hidden', 'true');
    this.plus = document.createElement('button');
    this.plus.className = 'plus';
    this.plus.title = 'Novo bloco abaixo (ou digite /)';
    this.plus.innerHTML = '<svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg>';
    this.grip = document.createElement('button');
    this.grip.className = 'grip';
    this.grip.title = 'Arraste para mover · clique para o menu do bloco';
    this.grip.innerHTML = '<svg viewBox="0 0 16 16"><circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/></svg>';
    this.dom.append(this.plus, this.grip);
    this.drop = document.createElement('div');
    this.drop.className = 'cm-drop-line';
    view.dom.append(this.dom, this.drop);

    this.plus.addEventListener('mousedown', (e) => e.preventDefault());
    this.plus.addEventListener('click', () => this.addBelow());
    this.grip.addEventListener('pointerdown', (e) => this.onGripDown(e));
    view.scrollDOM.addEventListener('mousemove', this.onMove);
    view.dom.addEventListener('mouseleave', this.onLeave);
  }

  onMove = (e: MouseEvent) => {
    if (this.dragging || coarse()) return;
    clearTimeout(this.hideTimer);
    const content = this.view.contentDOM.getBoundingClientRect();
    // a alça fica à esquerda do texto: procura a linha naquela altura
    const pos = this.view.posAtCoords({ x: Math.max(e.clientX, content.left + 30), y: e.clientY }, false);
    const n = this.view.state.doc.lineAt(pos).number;
    if (!this.view.state.doc.line(n).text.trim() && !this.isWidgetLine(n)) {
      this.hideTimer = window.setTimeout(() => this.hide(), 400);
      return;
    }
    const b = blockAt(this.view.state, n);
    if (!b || b.kind === 'frontmatter') return this.hide();
    this.show(b);
  };

  onLeave = (e: MouseEvent) => {
    if (this.dragging) return;
    if (this.dom.contains(e.relatedTarget as Node)) return;
    this.hideTimer = window.setTimeout(() => this.hide(), 300);
  };

  isWidgetLine(n: number): boolean {
    const b = blockAt(this.view.state, n);
    return !!b && (b.kind === 'table' || b.kind === 'embed' || b.kind === 'callout');
  }

  /** topo da primeira linha do bloco, relativo ao editor */
  topOf(b: Block): { top: number; height: number } | null {
    const line = this.view.state.doc.line(b.start);
    const lb = this.view.lineBlockAt(line.from);
    const editorTop = this.view.dom.getBoundingClientRect().top;
    const c = this.view.coordsAtPos(line.from, 1);
    if (c && c.bottom > c.top) {
      const h = Math.min(c.bottom - c.top, 40);
      return { top: c.top - editorTop, height: h };
    }
    return { top: this.view.documentTop + lb.top - editorTop, height: Math.min(lb.height, 28) };
  }

  show(b: Block): void {
    this.place(b, this.where(b));
  }

  /** só lê o layout (pode rodar na fase de leitura do CodeMirror) */
  where(b: Block): { x: number; y: number } | null {
    const t = this.topOf(b);
    if (!t) return null;
    const content = this.view.contentDOM;
    const cs = getComputedStyle(content);
    const left = content.getBoundingClientRect().left - this.view.dom.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
    const w = coarse() ? 24 : 46;
    return { x: Math.max(2, left - w - 4), y: t.top + t.height / 2 - 12 };
  }

  place(b: Block, at: { x: number; y: number } | null): void {
    this.block = b;
    if (!at) return this.hide();
    this.dom.style.transform = `translate(${at.x}px, ${at.y}px)`;
    this.dom.classList.add('on');
    this.dom.classList.toggle('touch', coarse());
  }

  hide(): void {
    if (this.dragging) return;
    this.dom.classList.remove('on');
  }

  update(u: ViewUpdate): void {
    if (this.dragging) return;
    if (u.docChanged) this.hide();
    // no celular a alça acompanha o cursor
    if (coarse() && (u.selectionSet || u.docChanged) && u.view.hasFocus) {
      const n = u.state.doc.lineAt(u.state.selection.main.head).number;
      const b = blockAt(u.state, n);
      if (b && b.kind !== 'frontmatter' && u.state.doc.line(n).text.trim()) this.later(b);
      else this.hide();
    } else if (u.geometryChanged && this.block && this.dom.classList.contains('on')) {
      const b = this.block;
      if (b.end <= u.state.doc.lines) this.later(b);
    }
  }

  /** durante um update não dá para medir: posiciona no próximo ciclo de medida */
  later(b: Block): void {
    this.block = b;
    this.view.requestMeasure({
      key: this,
      read: () => (this.view.state.doc.lines >= b.end ? this.where(b) : null),
      write: (at) => { if (at) this.place(b, at); },
    });
  }

  addBelow(): void {
    const b = this.block;
    if (!b) return;
    const doc = this.view.state.doc;
    const end = doc.line(Math.min(b.end, doc.lines)).to;
    const sep = b.kind === 'list' ? '\n' : '\n\n';
    this.view.dispatch({ changes: { from: end, insert: `${sep}/` }, selection: { anchor: end + sep.length + 1 }, scrollIntoView: true, userEvent: 'input' });
    this.view.focus();
    this.hide();
    startCompletion(this.view);
  }

  onGripDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const b = this.block;
    if (!b) return;
    const start = { x: e.clientX, y: e.clientY };
    let target: number | null = null;
    this.grip.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (!this.dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 5) return;
      if (!this.dragging) {
        this.dragging = true;
        this.view.dom.classList.add('cm-dragging');
        this.markSource(b, true);
      }
      target = this.dropTarget(b, ev.clientY);
      this.autoScroll(ev.clientY);
    };
    const up = () => {
      this.grip.removeEventListener('pointermove', move);
      this.grip.removeEventListener('pointerup', up);
      this.grip.removeEventListener('pointercancel', up);
      clearInterval(this.scrollTimer);
      if (!this.dragging) {
        this.openMenu(b);
        return;
      }
      this.dragging = false;
      this.view.dom.classList.remove('cm-dragging');
      this.markSource(b, false);
      this.drop.classList.remove('on');
      if (target !== null) this.moveTo(b, target);
      this.hide();
    };
    this.grip.addEventListener('pointermove', move);
    this.grip.addEventListener('pointerup', up);
    this.grip.addEventListener('pointercancel', up);
  }

  markSource(b: Block, on: boolean): void {
    const doc = this.view.state.doc;
    for (let i = b.start; i <= b.end && i <= doc.lines; i++) {
      const el = this.view.domAtPos(doc.line(i).from).node;
      const line = (el.nodeType === 1 ? (el as HTMLElement) : el.parentElement)?.closest('.cm-line, .cm-embed, .cm-table-wrap, .cm-columns');
      line?.classList.toggle('cm-drag-src', on);
    }
  }

  autoScroll(y: number): void {
    clearInterval(this.scrollTimer);
    // quem rola pode ser a página da nota, e não o editor
    let sc: HTMLElement = this.view.scrollDOM;
    for (let p = this.view.dom.parentElement; p; p = p.parentElement) if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) { sc = p; break; }
    const r = sc.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, innerHeight);
    const speed = y < top + 50 ? -12 : y > bottom - 50 ? 12 : 0;
    if (speed) this.scrollTimer = window.setInterval(() => (sc.scrollTop += speed), 16);
  }

  /** Linha antes da qual o bloco vai entrar (doc.lines + 1 = no fim). Mostra a linha-guia. */
  dropTarget(src: Block, y: number): number | null {
    const view = this.view;
    const doc = view.state.doc;
    const content = view.contentDOM.getBoundingClientRect();
    const pos = view.posAtCoords({ x: content.left + content.width / 2, y }, false);
    const n = doc.lineAt(pos).number;
    let b = blockAt(view.state, n);
    if (!b || b.kind === 'frontmatter') {
      // linha em branco: entra antes do próximo bloco
      let k = n;
      while (k <= doc.lines && !doc.line(k).text.trim()) k++;
      b = k <= doc.lines ? blockAt(view.state, k) : null;
      if (!b) return this.guide(doc.lines + 1);
    }
    if (b.start >= src.start && b.end <= src.end) return null;
    const top = view.lineBlockAt(doc.line(b.start).from).top;
    const bottom = view.lineBlockAt(doc.line(b.end).from).bottom;
    const mid = view.documentTop + (top + bottom) / 2;
    const at = y < mid ? b.start : b.end + 1;
    if (at > src.start && at <= src.end + 1) return null;
    return this.guide(at, b);
  }

  guide(at: number, b?: Block): number {
    const view = this.view;
    const doc = view.state.doc;
    const editorTop = view.dom.getBoundingClientRect().top;
    const y = at > doc.lines ? view.lineBlockAt(doc.length).bottom : view.lineBlockAt(doc.line(at).from).top;
    const content = view.contentDOM;
    const cs = getComputedStyle(content);
    const left = content.getBoundingClientRect().left - view.dom.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
    // itens de lista mais recuados: a guia recua junto
    const indent = b && b.kind === 'list' ? (/^\s*/.exec(doc.line(b.start).text)![0].length * 8) : 0;
    this.drop.style.transform = `translate(${left + indent}px, ${view.documentTop + y - editorTop - 1}px)`;
    this.drop.style.width = `${content.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - indent}px`;
    this.drop.classList.add('on');
    return at;
  }

  moveTo(b: Block, at: number): void {
    const view = this.view;
    const doc = view.state.doc;
    const from = doc.line(b.start).from;
    const end = doc.line(b.end).to;
    const text = doc.sliceString(from, end);
    const isList = b.kind === 'list';
    // tira o bloco com a quebra de linha (e uma linha em branco sobrando)
    let delFrom = from;
    let delTo = end;
    if (b.end < doc.lines) {
      delTo = doc.line(b.end + 1).from;
      if (!isList && b.end + 1 < doc.lines && !doc.line(b.end + 1).text.trim()) delTo = doc.line(b.end + 2).from;
    } else if (b.start > 1) {
      delFrom = doc.line(b.start - 1).to;
    }
    const neighborList = (k: number) => k >= 1 && k <= doc.lines && /^\s*([-*+]|\d+[.)])\s/.test(doc.line(k).text);
    let insert: string;
    let insAt: number;
    if (at > doc.lines) {
      insAt = doc.length;
      insert = (isList && neighborList(doc.lines) ? '\n' : '\n\n') + text;
    } else {
      insAt = doc.line(at).from;
      const tight = isList && (neighborList(at) || neighborList(at - 1));
      insert = text + (tight ? '\n' : '\n\n');
    }
    const changes = ChangeSet.of(
      [
        { from: delFrom, to: delTo },
        { from: insAt, insert },
      ],
      doc.length,
    );
    // cursor no começo do bloco movido
    const start = changes.mapPos(insAt, -1) + (at > doc.lines ? insert.length - text.length : 0);
    view.dispatch({ changes, selection: { anchor: start }, userEvent: 'move.drop' });
    view.focus();
  }

  openMenu(b: Block): void {
    const view = this.view;
    const doc = view.state.doc;
    const r = this.grip.getBoundingClientRect();
    const cur = lineType(doc.line(b.start).text);
    const lines = { from: b.start, to: b.kind === 'list' ? b.start : b.end };
    const types: BlockType[] = ['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'task', 'toggle', 'callout', 'quote', 'code'];
    const convertible = b.kind === 'paragraph' || b.kind === 'heading' || b.kind === 'list' || b.kind === 'quote' || b.kind === 'callout';
    const host = view.state.facet(hostFacet);
    const items: Array<MenuItem | null> = [
      ...(convertible
        ? [{ label: 'Transformar em', icon: '⇄', items: types.map((t) => ({ label: BLOCK_LABELS[t], icon: TYPE_ICONS[t], on: t === cur, run: () => setBlockType(view, t, lines) })) }]
        : []),
      { label: 'Duplicar', icon: '⧉', hint: 'Ctrl+D', run: () => duplicateBlock(view, b.start) },
      { label: 'Mover para cima', icon: '↑', hint: 'Alt+↑', run: () => moveBlock(view, -1, b.start) },
      { label: 'Mover para baixo', icon: '↓', hint: 'Alt+↓', run: () => moveBlock(view, 1, b.start) },
      null,
      { label: 'Copiar link para o bloco', icon: '🔗', run: () => copyBlockLink(view, b, host?.current?.() ?? null) },
      { label: 'Copiar texto', icon: '⎘', run: () => void navigator.clipboard?.writeText(doc.sliceString(doc.line(b.start).from, doc.line(b.end).to)) },
      null,
      { label: 'Apagar', icon: '🗑', hint: 'Del', danger: true, run: () => deleteBlock(view, b.start) },
    ];
    this.dom.classList.add('menu-open');
    showMenu({ x: r.left, y: r.bottom + 4 }, items, { onClose: () => this.dom.classList.remove('menu-open') });
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener('mousemove', this.onMove);
    this.view.dom.removeEventListener('mouseleave', this.onLeave);
    this.dom.remove();
    this.drop.remove();
  }
}

/** Link para o bloco no formato do Obsidian: [[Nota#^id]]. Cria o ^id se faltar. */
function copyBlockLink(view: EditorView, b: Block, path: string | null): void {
  const doc = view.state.doc;
  const last = doc.line(b.end);
  const has = /\s\^([\w-]+)\s*$/.exec(last.text);
  let id = has?.[1];
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    // tabela, callout e código levam o ^id numa linha própria logo abaixo
    const own = b.kind === 'table' || b.kind === 'callout' || b.kind === 'quote' || b.kind === 'code' || b.kind === 'math';
    view.dispatch({ changes: { from: last.to, insert: own ? `\n^${id}` : ` ^${id}` }, userEvent: 'input' });
  }
  const name = path ? noteName(path) : '';
  void navigator.clipboard?.writeText(`[[${name}#^${id}]]`);
}

export const blockHandle = ViewPlugin.fromClass(Handle);
