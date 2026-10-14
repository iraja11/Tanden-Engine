import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { RangeSetBuilder, StateField, type EditorState } from '@codemirror/state';

/*
 * Prévia dos anexos dentro do editor: ![[imagem.png]] e ![](https://...) viram
 * a imagem logo abaixo da linha; ![[arquivo.pdf]] vira um cartão que abre o PDF.
 * O texto continua igual (é o mesmo Markdown que o Obsidian lê).
 */

export interface EmbedHost {
  /** endereço para mostrar uma imagem do cofre (blob:) ou null */
  image(target: string): Promise<string | null>;
  open(target: string): void;
}

const IMG = /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i;
const LINE = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]|!\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g;

class ImageWidget extends WidgetType {
  constructor(readonly target: string, readonly alt: string, readonly width: number | null, readonly host: EmbedHost) {
    super();
  }
  eq(o: ImageWidget) {
    return o.target === this.target && o.width === this.width && o.alt === this.alt;
  }
  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'cm-embed cm-embed-img';
    const img = document.createElement('img');
    img.alt = this.alt;
    img.loading = 'lazy';
    if (this.width) img.style.width = `${this.width}px`;
    if (/^https?:/i.test(this.target)) img.src = this.target;
    else {
      void this.host.image(this.target).then((u) => {
        if (u) img.src = u;
        else {
          wrap.classList.add('missing');
          wrap.textContent = `Imagem não encontrada: ${this.target}`;
        }
      });
    }
    img.addEventListener('dblclick', () => this.host.open(this.target));
    wrap.appendChild(img);
    return wrap;
  }
  ignoreEvent() {
    return false;
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

function build(state: EditorState, host: EmbedHost): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  let inCode = false;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    if (/^\s*(```|~~~)/.test(line.text)) inCode = !inCode;
    if (inCode || !line.text.includes('![')) continue;
    for (const m of line.text.matchAll(LINE)) {
      const wiki = m[1];
      const target = (wiki ?? m[4]!.replace(/^<|>$/g, '')).trim();
      const label = (wiki ? m[2] : m[3]) ?? '';
      const width = /^\d+$/.test(label) ? Number(label) : null;
      if (IMG.test(target.split('?')[0]!) || (!wiki && /^https?:/i.test(target))) {
        b.add(line.to, line.to, Decoration.widget({ widget: new ImageWidget(target, width ? '' : label, width, host), side: 1, block: true }));
      } else if (wiki && /\.[a-z0-9]{2,5}$/i.test(target)) {
        b.add(line.to, line.to, Decoration.widget({ widget: new FileWidget(target, host), side: 1, block: true }));
      }
    }
  }
  return b.finish();
}

export function embeds(host: EmbedHost) {
  return StateField.define<DecorationSet>({
    create: (s) => build(s, host),
    update: (deco, tr) => (tr.docChanged ? build(tr.state, host) : deco),
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
