import {
  DECK_FOLDER,
  FOLDERS,
  convertToNote,
  deckFromImported,
  deckFromNote,
  deckFromPdf,
  deckToPdf,
  deckToPptx,
  freePath,
  imageSize,
  imageTargets,
  isDeck,
  mimeOf,
  parseDeck,
  resolveLink,
  safeFileName,
  setProp,
  slideModel,
  LOOK_PAPEL,
  type Deck,
  type SlideImage,
  type SlideLook,
  type Transition,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { files, parse } from '../files/files.svelte';
import { openPdf, type PdfDoc } from '../pdf/pdfjs';
import { sound } from '../sound.svelte';

/*
 * Apresentações: notas .md com slides separados por ---. Este módulo acha
 * as apresentações do cofre, cria a partir de notas, importa .pptx e PDF,
 * exporta e guarda o pedido de "apresentar" que o App mostra em tela cheia.
 */

const stem = (p: string) => p.split('/').pop()!.replace(/\.[^.]+$/, '');

const TEMPLATE = `---
tipo: apresentação
transição: núcleo
---

# Título da apresentação

Subtítulo ou seu nome

---

## Primeiro assunto

- Um ponto por linha
- **Negrito**, *itálico* e \`código\` funcionam
- Arraste uma imagem para cá ou use ![[imagem.png]]

> [!note] Notas do apresentador
> Só você vê isto, no modo apresentação (tecla N).

---

## Seção nova
`;

/** Página de PDF dentro de um embed: "PDFs/aula.pdf#page=3". */
function pdfPage(target: string): { file: string; page: number } | null {
  const m = /^(.+\.pdf)(?:#page=(\d+))?$/i.exec(target.trim());
  return m ? { file: m[1]!, page: Math.max(1, Number(m[2] ?? 1)) } : null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('imagem não carregou'));
    img.src = url;
  });
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((ok, fail) =>
    canvas.toBlob((b) => (b ? void b.arrayBuffer().then((a) => ok(new Uint8Array(a))) : fail(new Error('não deu para gerar a imagem'))), 'image/png'),
  );
}

class Slides {
  /** apresentações do cofre */
  list = $state<string[]>([]);
  active = $state<string | null>(null);
  /** sobe quando o app deve trocar para a tela de slides */
  goto = $state(0);
  /** apresentação em tela cheia */
  presenting = $state<{ path: string; index: number } | null>(null);
  /** endereços das imagens já resolvidas (alvo do embed → blob:) */
  urls = $state<Record<string, string>>({});
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Set<string>();
  private pdfs = new Map<string, Promise<PdfDoc>>();

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      if (e.type === 'note.created' || e.type === 'note.changed' || e.type === 'sync.finished') this.schedule();
    });
    this.refresh();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, 200);
  }

  refresh(): void {
    const list = engine.vault
      .list()
      .filter((p) => isDeck(p, engine.vault.read(p)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (list.join('\n') !== this.list.join('\n')) this.list = list;
    if (this.active && !engine.vault.has(this.active)) this.active = null;
  }

  text(path: string): string {
    return engine.vault.has(path) ? engine.vault.read(path) : '';
  }

  deck(path: string): Deck {
    return parseDeck(this.text(path), stem(path));
  }

  /** Abre a apresentação na tela de slides (vira a nota ativa, para o editor). */
  open(path: string): void {
    this.active = path;
    if (engine.active !== path) engine.open(path);
  }

  show(path: string): void {
    this.open(path);
    this.goto++;
  }

  private newPath(title: string): string {
    return freePath((p) => engine.vault.has(p), DECK_FOLDER, safeFileName(title) || 'Apresentação', 'md');
  }

  create(): void {
    const path = this.newPath('Nova apresentação');
    engine.writeNote(path, TEMPLATE);
    sound.play('create');
    this.refresh();
    this.show(path);
  }

  /** Nota → apresentação nova em Apresentações/ (a nota original fica como está). */
  fromNote(notePath: string): void {
    const title = stem(notePath);
    const path = this.newPath(title);
    engine.writeNote(path, deckFromNote(engine.vault.read(notePath), { title, source: notePath }));
    sound.play('create');
    this.refresh();
    this.show(path);
    files.say(`Slides criados em ${path}. Ajuste o texto à esquerda; cada --- separa um slide.`);
  }

  setTransition(path: string, t: Transition): void {
    const next = setProp(this.text(path), 'transição', t);
    if (engine.active === path) engine.edit(next);
    else engine.writeNote(path, next);
  }

  /* ------------------------------------------------------------ importar */

  async importFile(f: File): Promise<string | null> {
    const name = safeFileName(f.name) || 'apresentação';
    const bytes = new Uint8Array(await f.arrayBuffer());
    try {
      return await engine.bus.process(`slides-import:${name}`, `Importando ${name}`, async () => {
        files.busy = `Importando ${name}…`;
        let path: string;
        if (/\.pdf$/i.test(name)) {
          const pdfPath = freePath(files.exists, FOLDERS.pdf, stem(name), 'pdf');
          await engine.storage.write(pdfPath, bytes);
          await files.refresh();
          const doc = await openPdf(bytes);
          const pages = doc.numPages;
          path = this.newPath(stem(name));
          engine.writeNote(path, deckFromPdf(pdfPath, pages, stem(name)));
          files.say(`${name} virou uma apresentação de ${pages} slide${pages > 1 ? 's' : ''}. O PDF ficou em ${pdfPath}.`, { path });
        } else if (/\.pptx$/i.test(name)) {
          const folder = freePath(files.exists, FOLDERS.attachments, stem(name), 'dir').replace(/\.dir$/, '');
          const r = await convertToNote(name, bytes, { parse, assetDir: folder });
          const original = `${folder}/${name}`;
          for (const a of r.assets) await engine.storage.write(a.path, a.data);
          await engine.storage.write(original, bytes);
          await files.refresh();
          path = this.newPath(r.title || stem(name));
          engine.writeNote(path, deckFromImported(r.markdown, original));
          const n = parseDeck(engine.vault.read(path)).slides.length;
          files.say(`${name} virou uma apresentação de ${n} slide${n > 1 ? 's' : ''}${r.assets.length ? ` com ${r.assets.length} imagens` : ''}.`, { path });
        } else throw new Error('use um arquivo .pptx ou .pdf');
        engine.bus.emit({ type: 'file.imported', path, from: f.name });
        sound.play('create');
        this.refresh();
        this.show(path);
        return path;
      });
    } catch (e) {
      files.say(`Não consegui importar ${f.name}: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      return null;
    } finally {
      files.busy = '';
      void engine.syncNow();
    }
  }

  /* ------------------------------------------------------------ imagens */

  private pdf(file: string): Promise<PdfDoc> {
    let p = this.pdfs.get(file);
    if (!p) {
      p = files.read(file).then((data) => {
        if (!data) throw new Error(`${file} não está no cofre`);
        return openPdf(data);
      });
      this.pdfs.set(file, p);
      p.catch(() => this.pdfs.delete(file));
    }
    return p;
  }

  /** Desenha uma página de PDF num canvas (largura `width` px). */
  private async pdfCanvas(file: string, page: number, width: number): Promise<HTMLCanvasElement> {
    const doc = await this.pdf(file);
    const pg = await doc.getPage(Math.min(page, doc.numPages));
    const base = pg.getViewport({ scale: 1 });
    const viewport = pg.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await pg.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
    return canvas;
  }

  private resolve(target: string): string | null {
    const hit = resolveLink(target.replace(/#.*$/, ''), files.list);
    return hit?.path ?? null;
  }

  /** Pede o endereço de uma imagem do slide; quando chega, `urls` muda e o slide redesenha. */
  want(target: string): void {
    if (this.urls[target] || this.pending.has(target)) return;
    this.pending.add(target);
    void (async () => {
      try {
        let url: string | null;
        const pg = pdfPage(target);
        if (/^(https?:|data:|blob:)/i.test(target)) url = target;
        else if (pg) {
          const file = this.resolve(pg.file);
          if (!file) throw new Error('sem PDF');
          const canvas = await this.pdfCanvas(file, pg.page, 1600);
          url = URL.createObjectURL(new Blob([(await canvasPng(canvas)) as BlobPart], { type: 'image/png' }));
        } else url = await files.imageUrl(target);
        if (url) this.urls = { ...this.urls, [target]: url };
      } catch {
        // imagem que não existe fica com o aviso no slide
      } finally {
        this.pending.delete(target);
      }
    })();
  }

  /** Imagem pronta para o .pptx/PDF: PNG ou JPEG, com tamanho. */
  private async exportImage(target: string): Promise<SlideImage | null> {
    try {
      const pg = pdfPage(target);
      if (pg) {
        const file = this.resolve(pg.file);
        if (!file) return null;
        const canvas = await this.pdfCanvas(file, pg.page, 1920);
        return { data: await canvasPng(canvas), mime: 'image/png', w: canvas.width, h: canvas.height };
      }
      const path = /^https?:/i.test(target) ? null : this.resolve(target);
      if (path) {
        const mime = mimeOf(path);
        const data = await files.read(path);
        if (data && (mime === 'image/png' || mime === 'image/jpeg')) {
          const size = imageSize(data);
          if (size) return { data, mime, w: size.w, h: size.h };
        }
      }
      // WebP, SVG, GIF, link da web: passa por um canvas e vira PNG
      const url = path ? await files.url(path) : target;
      if (!url) return null;
      const img = await loadImage(url);
      const w = img.naturalWidth || 1280;
      const h = img.naturalHeight || 720;
      const canvas = document.createElement('canvas');
      const k = Math.min(1, 2400 / Math.max(w, h));
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { data: await canvasPng(canvas), mime: 'image/png', w: canvas.width, h: canvas.height };
    } catch {
      return null;
    }
  }

  /* ------------------------------------------------------------ exportar */

  /** Cores do tema atual, para o arquivo sair com a cara do app. */
  look(): SlideLook {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
      bg: v('--void', '#0c0c0e'),
      surface: v('--surface-2', '#1c1c20'),
      line: v('--line', '#2b2a31'),
      ink: v('--ink', '#ecebf0'),
      muted: v('--muted', '#8c8a96'),
      accent: v('--ember', '#ff8a3d'),
      dark: document.documentElement.dataset.theme !== 'light',
    };
  }

  async export(path: string, format: 'pptx' | 'pdf' | 'pdf-claro'): Promise<void> {
    const deck = this.deck(path);
    const label = format === 'pptx' ? 'PowerPoint' : 'PDF';
    try {
      await engine.bus.process(`slides-export:${path}`, `Gerando ${label}`, async () => {
        files.busy = `Gerando ${label}…`;
        const images = new Map<string, SlideImage>();
        for (const t of imageTargets(deck.slides.map(slideModel))) {
          const img = await this.exportImage(t);
          if (img) images.set(t, img);
        }
        const opts = { look: format === 'pdf-claro' ? { ...LOOK_PAPEL, accent: this.look().dark ? LOOK_PAPEL.accent : this.look().accent } : this.look(), image: (t: string) => images.get(t) ?? null, author: engine.vault.deviceId };
        const name = deck.title || stem(path);
        if (format === 'pptx') await files.deliver(`${name}.pptx`, deckToPptx(deck, opts), mimeOf('x.pptx'));
        else await files.deliver(`${name}${format === 'pdf-claro' ? ' (claro)' : ''}.pdf`, await deckToPdf(deck, opts), 'application/pdf');
      });
    } catch (e) {
      files.say(`Não consegui exportar: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    } finally {
      files.busy = '';
    }
  }

  /* ---------------------------------------------------------- apresentar */

  present(path: string, index = 0): void {
    sound.play('open');
    this.presenting = { path, index };
  }

  stop(): void {
    sound.play('close');
    this.presenting = null;
  }
}

export const slides = new Slides();
