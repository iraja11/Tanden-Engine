import { noteSection } from '@tanden/core';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateField, type EditorState, type Range } from '@codemirror/state';

/*
 * Anexos dentro do editor: ![[imagem.png]] e ![](https://...) viram a imagem
 * (com legenda e tamanho ajustável arrastando a borda); ![[arquivo.pdf]] vira um
 * cartão; vídeos do YouTube/Vimeo e arquivos de áudio e vídeo tocam ali mesmo;
 * ![[Outra nota]] mostra a outra nota dentro desta. Fora do cursor só aparece o
 * resultado; com o cursor na linha, o Markdown aparece em cima para editar.
 * O texto continua o mesmo Markdown que o Obsidian lê: ![[foto.png|legenda|300]].
 */

export interface EmbedHost {
  /** endereço para mostrar uma imagem (ou outro arquivo) do cofre (blob:) ou null */
  image(target: string): Promise<string | null>;
  open(target: string): void;
  /** texto de outra nota, para ![[nota]] */
  noteText?(target: string): string | null;
  /** Markdown → HTML */
  render?(md: string): string;
}

const IMG = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)$/i;
const AUDIO = /\.(mp3|wav|ogg|m4a|flac|opus|aac)$/i;
const LINE = /!\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]|!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;
const ONLY = /^\s*(!\[\[[^\]]+\]\]|!\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\))\s*$/;

/** O rótulo depois da barra: "legenda|300", "300", "300x200" ou "legenda". */
function parseLabel(label: string): { caption: string; width: number | null } {
  const parts = label.split('|');
  const last = parts[parts.length - 1]!.trim();
  const size = /^(\d+)(?:x\d+)?$/.exec(last);
  if (size) return { caption: parts.slice(0, -1).join('|').trim(), width: Number(size[1]) };
  return { caption: label.trim(), width: null };
}

function videoEmbed(url: string): string | null {
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

interface Found {
  /** posição do embed no documento */
  from: number;
  to: number;
  wiki: boolean;
  target: string;
  sub: string;
  caption: string;
  width: number | null;
}

/** Reescreve o embed com outra legenda ou largura, no formato que já estava. */
function rewrite(view: EditorView, dom: HTMLElement, at: Found, next: { caption?: string; width?: number | null }): void {
  const caption = (next.caption ?? at.caption).replace(/[|\]\n]/g, ' ').trim();
  const width = next.width === undefined ? at.width : next.width;
  const label = [caption, width ? String(width) : ''].filter(Boolean).join('|');
  const text = at.wiki
    ? `![[${at.target}${at.sub}${label ? `|${label}` : ''}]]`
    : `![${label}](${/\s/.test(at.target) ? `<${at.target}>` : at.target})`;
  // o texto pode ter mudado de lugar: procura de novo na linha do widget
  let pos: number;
  try {
    pos = view.posAtDOM(dom);
  } catch {
    return;
  }
  const line = view.state.doc.lineAt(pos);
  let best: { from: number; to: number } | null = null;
  for (const m of line.text.matchAll(LINE)) {
    const t = (m[1] ?? m[5]!.replace(/^<|>$/g, '')).trim();
    const from = line.from + m.index!;
    if (t === at.target && !best) best = { from, to: from + m[0].length };
  }
  if (best) view.dispatch({ changes: { ...best, insert: text }, userEvent: 'input.embed' });
}

class ImageWidget extends WidgetType {
  constructor(readonly at: Found, readonly host: EmbedHost) {
    super();
  }
  eq(o: ImageWidget) {
    return o.at.target === this.at.target && o.at.width === this.at.width && o.at.caption === this.at.caption && o.at.wiki === this.at.wiki && o.at.sub === this.at.sub;
  }
  toDOM(view: EditorView) {
    const fig = document.createElement('figure');
    fig.className = 'cm-embed cm-embed-img';
    const frame = document.createElement('div');
    frame.className = 'frame';
    const img = document.createElement('img');
    img.alt = this.at.caption;
    img.loading = 'lazy';
    img.draggable = false;
    if (this.at.width) frame.style.width = `${this.at.width}px`;
    const src = this.at.target;
    if (/^(https?:|data:)/i.test(src)) img.src = src;
    else {
      void this.host.image(src).then((u) => {
        if (u) img.src = u;
        else {
          fig.classList.add('missing');
          fig.textContent = `Imagem não encontrada: ${src}`;
        }
      });
    }
    img.addEventListener('dblclick', () => this.host.open(src));
    frame.append(img);
    // alça na borda direita: arrastar muda a largura (grava |largura no link)
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.title = 'Arraste para mudar o tamanho (duplo clique: tamanho original)';
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      const start = e.clientX;
      const w0 = frame.getBoundingClientRect().width;
      const max = (fig.parentElement?.getBoundingClientRect().width ?? 800) - 4;
      let w = w0;
      fig.classList.add('resizing');
      const move = (ev: PointerEvent) => {
        w = Math.round(Math.min(max, Math.max(60, w0 + ev.clientX - start)));
        frame.style.width = `${w}px`;
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        fig.classList.remove('resizing');
        if (Math.abs(w - w0) > 2) rewrite(view, fig, this.at, { width: w });
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', (e) => {
      e.preventDefault();
      rewrite(view, fig, this.at, { width: null });
    });
    frame.append(grip);
    fig.append(frame);
    const cap = document.createElement('figcaption');
    cap.contentEditable = 'true';
    cap.spellcheck = true;
    cap.textContent = this.at.caption;
    cap.dataset.placeholder = 'Escreva uma legenda';
    if (!this.at.caption) cap.classList.add('empty');
    cap.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        cap.blur();
      }
    });
    cap.addEventListener('input', () => cap.classList.toggle('empty', !cap.textContent));
    cap.addEventListener('blur', () => {
      const t = (cap.textContent ?? '').trim();
      if (t !== this.at.caption) rewrite(view, fig, this.at, { caption: t });
    });
    fig.append(cap);
    return fig;
  }
  ignoreEvent() {
    return true;
  }
}

class MediaWidget extends WidgetType {
  constructor(readonly target: string, readonly kind: 'video' | 'audio' | 'frame', readonly host: EmbedHost) {
    super();
  }
  eq(o: MediaWidget) {
    return o.target === this.target && o.kind === this.kind;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = `cm-embed cm-embed-media ${this.kind}`;
    if (this.kind === 'frame') {
      const f = document.createElement('iframe');
      f.src = videoEmbed(this.target)!;
      f.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.loading = 'lazy';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      wrap.append(f);
      return wrap;
    }
    const el = document.createElement(this.kind);
    el.controls = true;
    el.preload = 'metadata';
    void this.host.image(this.target).then((u) => {
      if (u) el.src = u;
    });
    wrap.append(el);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
  get estimatedHeight() {
    return this.kind === 'audio' ? 60 : 360;
  }
}

class NoteWidget extends WidgetType {
  constructor(readonly target: string, readonly sub: string, readonly html: string, readonly host: EmbedHost, readonly empty = '') {
    super();
  }
  eq(o: NoteWidget) {
    return o.target === this.target && o.sub === this.sub && o.html === this.html && o.empty === this.empty;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-embed cm-embed-note';
    const head = document.createElement('button');
    head.className = 'head';
    head.textContent = `${this.target.split('/').pop()}${this.sub ? ` › ${this.sub.slice(1).split('#').join(' › ')}` : ''}`;
    head.title = 'Abrir a nota';
    head.addEventListener('mousedown', (e) => e.preventDefault());
    head.addEventListener('click', () => this.host.open(this.target + this.sub));
    const body = document.createElement('div');
    body.className = 'md-render';
    if (this.html) body.innerHTML = this.html;
    else {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = this.empty || 'Nota vazia.';
      body.append(p);
    }
    wrap.append(head, body);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

class FileWidget extends WidgetType {
  constructor(readonly target: string, readonly host: EmbedHost) {
    super();
  }
  eq(o: FileWidget) {
    return o.target === this.target;
  }
  toDOM() {
    const b = document.createElement('button');
    b.className = 'cm-embed cm-embed-file';
    b.type = 'button';
    const ext = this.target.split('.').pop()!.toUpperCase();
    b.innerHTML = `<span class="ext"></span><span class="name"></span><span class="go">Abrir</span>`;
    b.querySelector('.ext')!.textContent = ext.length <= 5 ? ext : 'ARQ';
    b.querySelector('.name')!.textContent = this.target.split('/').pop()!;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => this.host.open(this.target));
    return b;
  }
  ignoreEvent() {
    return true;
  }
}

/** Trecho de uma nota: a nota toda (sem o topo), um título (#Seção, #A#B) ou um bloco (#^id). */
function section(text: string, sub: string): string | null {
  if (!sub) return text.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return noteSection(text, sub.slice(1));
}

function widgetFor(f: Found, host: EmbedHost): WidgetType | null {
  const bare = f.target.split('?')[0]!;
  if (!f.wiki && videoEmbed(f.target)) return new MediaWidget(f.target, 'frame', host);
  if (IMG.test(bare) || (!f.wiki && /^https?:/i.test(f.target))) return new ImageWidget(f, host);
  if (VIDEO.test(bare)) return new MediaWidget(f.target, 'video', host);
  if (AUDIO.test(bare)) return new MediaWidget(f.target, 'audio', host);
  if (f.wiki && /\.[a-z0-9]{2,5}$/i.test(f.target) && !/\.md$/i.test(f.target)) return new FileWidget(f.target, host);
  if (f.wiki && host.noteText && host.render) {
    const text = host.noteText(f.target);
    const md = text === null ? null : section(text, f.sub);
    const empty = text === null ? 'Esta nota ainda não existe.' : md === null ? `Não achei "${f.sub.slice(1)}" nessa nota.` : 'Trecho vazio.';
    return new NoteWidget(f.target.replace(/\.md$/i, ''), f.sub, md ? host.render(md.length > 20000 ? md.slice(0, 20000) : md) : '', host, empty);
  }
  return null;
}

function build(state: EditorState, host: EmbedHost): DecorationSet {
  const out: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  let inCode = false;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (/^\s*(```|~~~)/.test(line.text)) inCode = !inCode;
    if (inCode || !line.text.includes('![')) continue;
    const active = sel.some((r) => r.from <= line.to && r.to >= line.from);
    const only = ONLY.test(line.text);
    for (const m of line.text.matchAll(LINE)) {
      const wiki = m[1] !== undefined;
      const { caption, width } = parseLabel((wiki ? m[3] : m[4]) ?? '');
      const f: Found = {
        from: line.from + m.index!,
        to: line.from + m.index! + m[0].length,
        wiki,
        target: (wiki ? m[1]! : m[5]!.replace(/^<|>$/g, '')).trim(),
        sub: wiki ? m[2] ?? '' : '',
        caption,
        width,
      };
      const w = widgetFor(f, host);
      if (!w) continue;
      if (only && !active) out.push(Decoration.replace({ widget: w, block: true }).range(line.from, line.to));
      else out.push(Decoration.widget({ widget: w, side: 1, block: true }).range(line.to));
    }
  }
  return Decoration.set(out, true);
}

export function embeds(host: EmbedHost) {
  return StateField.define<DecorationSet>({
    create: (s) => build(s, host),
    update: (deco, tr) => (tr.docChanged || tr.selection ? build(tr.state, host) : deco),
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** Link sob a posição: [[alvo]], ![[alvo]], [texto](alvo) ou um endereço solto. */
export function linkAt(state: EditorState, pos: number): string | null {
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  const patterns = [/!?\[\[([^\]]+)\]\]/g, /!?\[[^\]]*\]\((<[^>]+>|[^)\s]+)[^)]*\)/g, /https?:\/\/[^\s)>\]]+/g];
  for (const re of patterns) {
    for (const m of line.text.matchAll(re)) {
      if (col >= m.index! && col <= m.index! + m[0].length) return (m[1] ?? m[0]).replace(/^<|>$/g, '').split('|')[0]!.trim();
    }
  }
  return null;
}
