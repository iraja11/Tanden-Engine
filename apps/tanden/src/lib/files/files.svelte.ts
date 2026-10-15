import {
  CLIP_TEMPLATES_DIR,
  CONVERTIBLE,
  addHighlight,
  findClip,
  parseClipTemplate,
  pickClipTemplate,
  syncHighlights,
  type ClipTemplate,
  FOLDERS,
  annotationsToMarkdown,
  clipToMarkdown,
  convertToNote,
  exportAnnotatedPdf,
  extForMime,
  fileKind,
  freePath,
  linkCard,
  localStamp,
  markdownToDocx,
  markdownToHtml,
  mimeOf,
  normalizeUrl,
  pdfTextToMarkdown,
  prepareClip,
  resolveLink,
  safeFileName,
  type ParseHtml,
  type PdfTextItem,
} from '@tanden/core';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { engine } from '../engine.svelte';
import { quadros } from '../quadro/quadros.svelte';
import { sheets } from '../sheets/sheets.svelte';
import { isTauri } from '../storage-tauri';
import { editorBridge } from './editor-bridge';
import { slides } from '../slides/slides.svelte';
import { bases } from '../bases/bases.svelte';
import { biblioteca } from '../biblioteca/biblioteca.svelte';

/*
 * Arquivos do cofre que não são notas (PDFs, imagens, documentos) e tudo que
 * entra ou sai do Tanden: importar, converter, recortar páginas web, anexar
 * às notas e exportar.
 */

export const parse: ParseHtml = (text, type) => new DOMParser().parseFromString(text, type === 'application/xml' ? 'application/xml' : 'text/html');

/** Imprime uma página (a janela de impressão salva em PDF). */
function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  // espera as imagens embutidas carregarem
  if (doc.readyState === 'complete') setTimeout(go, 150);
  else frame.onload = () => setTimeout(go, 150);
}

export type View = 'notas' | 'planilhas' | 'quadros' | 'arquivos' | 'biblioteca';

interface Fetched {
  url: string;
  status: number;
  content_type: string;
  body: string;
}

const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const stem = (name: string) => name.split('/').pop()!.replace(/\.[^.]+$/, '');
const noteTitle = (p: string) => p.split('/').pop()!.replace(/\.md$/, '');
const isHidden = (p: string) => p.split('/').some((x) => x.startsWith('.'));

/** Baixa um endereço pelo lado nativo (sem CORS); na versão web tenta direto. */
async function fetchUrl(url: string, allowPrivate: boolean): Promise<{ url: string; type: string; data: Uint8Array }> {
  if (isTauri()) {
    const r = await invoke<Fetched>('web_fetch', { url, allowPrivate });
    if (r.status >= 400) throw new Error(`o site respondeu ${r.status}`);
    return { url: r.url, type: r.content_type, data: b64bytes(r.body) };
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('o navegador bloqueou o acesso a esse site. No app instalado (PC e celular) funciona.');
  }
  if (!res.ok) throw new Error(`o site respondeu ${res.status}`);
  return { url: res.url || url, type: res.headers.get('content-type') ?? '', data: new Uint8Array(await res.arrayBuffer()) };
}

/** HTML com o charset certo (cabeçalho, <meta charset> ou UTF-8). */
function decodeHtml(data: Uint8Array, type: string): string {
  let charset = /charset=([\w-]+)/i.exec(type)?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(data.subarray(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(data);
  } catch {
    return new TextDecoder().decode(data);
  }
}

/** Tipo de imagem pelos primeiros bytes (o servidor nem sempre diz). */
function sniffImage(data: Uint8Array): string | null {
  const h = Array.from(data.subarray(0, 12));
  if (h[0] === 0x89 && h[1] === 0x50) return 'image/png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg';
  if (h[0] === 0x47 && h[1] === 0x49) return 'image/gif';
  if (h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) return 'image/webp';
  if (h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70) return 'image/avif';
  if (new TextDecoder().decode(data.subarray(0, 200)).includes('<svg')) return 'image/svg+xml';
  return null;
}

class Files {
  /** arquivos do cofre que não são notas */
  list = $state<string[]>([]);
  /** arquivo aberto na tela Arquivos e a página pedida (links #page=n) */
  open = $state<string | null>(null);
  page = $state<{ n: number; seq: number } | null>(null);
  /** pedido para o app trocar de tela (o App observa) */
  goto = $state<{ view: View; seq: number } | null>(null);
  notice = $state<{ text: string; error?: boolean; path?: string } | null>(null);
  /** janela "Página web" aberta fora de uma nota (paleta, tela Hoje) */
  clipDialog = $state(false);
  busy = $state('');
  private started = false;
  private seq = 0;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private urls = new Map<string, string>();

  start(): void {
    if (this.started || !engine.ready) return;
    this.started = true;
    void this.refresh();
    engine.bus.on('sync.finished', () => void this.refresh());
    if (isTauri()) {
      // o favorito do navegador mandou uma página (com o trecho selecionado)
      void listen<{ url: string; title: string; html: string; selection: string }>('clip-request', (e) => {
        const r = e.payload;
        void this.clip(r.url, 'note', null, { html: r.html || undefined, highlights: r.selection ? [r.selection] : [] });
      });
      void listen<string[]>('vault-changed', (e) => {
        if (e.payload.some((p) => !p.endsWith('.md') && !p.endsWith('.tmp'))) void this.refresh();
        // arquivo trocado por fora: a imagem em cache fica velha
        for (const p of e.payload) this.forget(p);
      });
    }
  }

  async refresh(): Promise<void> {
    const all = await engine.storage.list();
    this.list = all.filter((p) => !isHidden(p) && !p.endsWith('.md') && !p.endsWith('.tmp')).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  say(text: string, opts: { error?: boolean; path?: string } = {}): void {
    this.notice = { text, ...opts };
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), opts.error ? 12000 : 7000);
  }

  private navigate(view: View): void {
    this.goto = { view, seq: ++this.seq };
  }

  exists = (p: string): boolean => this.list.includes(p) || engine.vault.has(p);

  async read(path: string): Promise<Uint8Array | null> {
    return engine.storage.read(path);
  }

  /** Endereço blob: para mostrar uma imagem do cofre. */
  async url(path: string): Promise<string | null> {
    const hit = this.urls.get(path);
    if (hit) return hit;
    const data = await this.read(path);
    if (!data) return null;
    const u = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeOf(path) }));
    this.urls.set(path, u);
    return u;
  }

  /** Imagem de um ![[embed]] ou ![](url) dentro de uma nota. */
  async imageUrl(target: string): Promise<string | null> {
    if (/^(https?:|data:|blob:)/i.test(target)) return target;
    const hit = resolveLink(safeDecode(target), this.list);
    return hit ? this.url(hit.path) : null;
  }

  /** O que o editor precisa para mostrar embeds e abrir links. */
  readonly host = {
    image: (t: string) => this.imageUrl(t),
    open: (t: string) => void this.openLink(t),
  };

  private forget(path: string): void {
    const u = this.urls.get(path);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(path);
  }

  private async write(path: string, data: Uint8Array): Promise<void> {
    await engine.storage.write(path, data);
    this.forget(path);
    if (!this.list.includes(path) && !path.endsWith('.md')) this.list = [...this.list, path].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /** Grava uma nota nova pelo cofre (para entrar no merge e no sync). */
  private createNote(path: string, text: string): void {
    engine.writeNote(path, text);
  }

  /** Abre um arquivo no lugar certo: nota no editor, planilha na aba dela, PDF na Biblioteca, o resto aqui. */
  openPath(path: string, page?: number | null): void {
    const kind = fileKind(path);
    if (kind === 'note') {
      engine.open(path);
      this.navigate('notas');
    } else if (kind === 'sheet' && path.toLowerCase().endsWith('.xlsx') && sheets.store?.has(path)) {
      sheets.open(path);
      this.navigate('planilhas');
    } else if (kind === 'board') {
      if (engine.boards.has(path)) quadros.open(path);
      this.navigate('quadros');
    } else if (kind === 'pdf') {
      // PDFs abrem no leitor da Biblioteca (posição, marcadores e status sincronizados)
      biblioteca.open(path, page);
      this.navigate('biblioteca');
    } else {
      this.open = path;
      if (page) this.page = { n: page, seq: ++this.seq };
      this.navigate('arquivos');
    }
  }

  /** Ctrl+clique num [[link]] ou num link Markdown dentro de uma nota. */
  openLink(target: string): boolean {
    const url = /^https?:\/\//i.test(target) ? target : null;
    if (url) {
      if (isTauri()) void invoke('web_open', { url }).catch((e) => this.say(String(e), { error: true }));
      else window.open(url, '_blank', 'noopener');
      return true;
    }
    const hit = resolveLink(safeDecode(target), [...engine.notes, ...this.list]);
    if (!hit) {
      this.say(`Não achei "${target}" no cofre.`, { error: true });
      return false;
    }
    this.openPath(hit.path, hit.page);
    return true;
  }

  /* ------------------------------------------------------------ importar */

  /**
   * Importa arquivos. Sem `attach`, cada um vai para a pasta do tipo dele
   * (PDFs/, Importados/, Anexos/) e o primeiro abre. Com `attach`, ficam em
   * Anexos/ e a nota ganha um ![[...]] no cursor.
   */
  async importFiles(list: File[] | FileList, opts: { attach?: boolean; convert?: boolean } = {}): Promise<void> {
    const files = Array.from(list);
    const inserts: string[] = [];
    let opened = false;
    for (const f of files) {
      try {
        this.busy = `Importando ${f.name}…`;
        const r = await engine.bus.process(`import:${f.name}`, `Importando ${f.name}`, () => this.importOne(f, opts));
        if (r.insert) inserts.push(r.insert);
        engine.bus.emit({ type: 'file.imported', path: r.open ?? '', from: f.name });
        if (!opened && r.open && !opts.attach) {
          opened = true;
          this.openPath(r.open);
        }
        if (files.length === 1 && r.open) this.say(r.message, { path: r.open });
      } catch (e) {
        this.say(`Não consegui importar ${f.name}: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      }
    }
    this.busy = '';
    if (inserts.length) editorBridge.insert(inserts.join('\n'));
    if (files.length > 1) this.say(`Importei ${files.length} arquivos.`);
    void engine.syncNow();
  }

  /** Salva um arquivo em Anexos/ e devolve o caminho (capas e propriedades de arquivo dos bancos). */
  async attachFile(f: File): Promise<string> {
    const r = await this.importOne(f, { attach: true });
    void engine.syncNow();
    return r.open!;
  }

  private async importOne(f: File, opts: { attach?: boolean; convert?: boolean }): Promise<{ open?: string; insert?: string; message: string }> {
    const name = safeFileName(f.name) || 'arquivo';
    const kind = fileKind(name);
    const bytes = new Uint8Array(await f.arrayBuffer());

    if (opts.attach) {
      const path = freePath(this.exists, FOLDERS.attachments, stem(name), name.split('.').pop()!.toLowerCase());
      await this.write(path, bytes);
      return { open: path, insert: `![[${path}]]`, message: `Anexei ${f.name}.` };
    }
    if (kind === 'sheet' && /\.(xlsx|csv|tsv)$/i.test(name)) {
      await sheets.importFile(f);
      this.navigate('planilhas');
      return { message: `Importei ${f.name} nas planilhas.` };
    }
    if (kind === 'pdf') {
      const path = freePath(this.exists, FOLDERS.pdf, stem(name), 'pdf');
      await this.write(path, bytes);
      return { open: path, message: `PDF salvo em ${path}.` };
    }
    if (kind === 'slides' && /\.pptx$/i.test(name) && opts.convert !== false) {
      // .pptx vira apresentação (nota com --- entre slides), que também se lê como nota
      const path = await slides.importFile(f);
      if (!path) throw new Error('o arquivo não pôde ser lido');
      return { message: `${f.name} virou a apresentação ${path}.` };
    }
    if (CONVERTIBLE.test(name) && opts.convert !== false) return this.convert(name, bytes);
    const path = freePath(this.exists, FOLDERS.attachments, stem(name), name.split('.').pop()!.toLowerCase());
    await this.write(path, bytes);
    return { open: path, message: `Salvei em ${path}.` };
  }

  /** Arquivo → nota em Importados/, com as imagens e o original em Anexos/<título>/. */
  private async convert(name: string, bytes: Uint8Array): Promise<{ open: string; message: string }> {
    const plain = /\.(md|markdown|txt)$/i.test(name);
    const title0 = stem(name);
    const folder = freePath(this.exists, FOLDERS.attachments, title0, 'dir').replace(/\.dir$/, '');
    const r = await convertToNote(name, bytes, { parse, assetDir: folder });
    const title = safeFileName(r.title || title0) || title0;
    const notePath = freePath(this.exists, plain ? '' : FOLDERS.imported, title, 'md');
    for (const a of r.assets) await this.write(a.path, a.data);
    let text = r.markdown;
    if (!plain) {
      const original = `${folder}/${safeFileName(name)}`;
      await this.write(original, bytes);
      const props = `---\noriginal: "[[${original}]]"\ncreated: "${localStamp()}"\ntags:\n  - importado\n---\n\n`;
      text = props + (/^# /m.test(text.slice(0, 400)) ? text : `# ${title}\n\n${text}`);
    }
    this.createNote(notePath, text);
    const imgs = r.assets.length ? ` com ${r.assets.length} imagem${r.assets.length > 1 ? 'ns' : ''}` : '';
    return { open: notePath, message: `${name} virou a nota ${notePath}${imgs}.` };
  }

  /* --------------------------------------------------------- páginas web */

  /** Modelos de recorte do cofre (Modelos/Recortes/ ou com "recorte-sites"). */
  clipTemplates(): ClipTemplate[] {
    const out: ClipTemplate[] = [];
    for (const p of engine.vault.list()) {
      if (!p.startsWith('Modelos/')) continue;
      const t = parseClipTemplate(p, engine.vault.read(p));
      if (t) out.push(t);
    }
    return out;
  }

  /** Nota que já guarda essa página, se houver. */
  clipped(url: string): string | null {
    const u = normalizeUrl(url);
    return u ? findClip(bases.index.notes, u) : null;
  }

  /**
   * Página web → nota em Web/ (texto e imagens, para ler offline) ou só um
   * cartão com o link. Nos dois casos, a nota aberta ganha o cartão.
   * Página já salva não duplica: os destaques novos entram na nota que existe.
   * `html` é a página como o navegador mostrou (o recortador do navegador manda),
   * o que serve também para páginas que pedem login.
   */
  async clip(
    input: string,
    mode: 'note' | 'card',
    attachTo: string | null,
    opts: {
      folder?: string; open?: boolean; allowPrivate?: boolean; html?: string; tags?: string[];
      comment?: string; highlights?: string[]; again?: boolean;
    } = {},
  ): Promise<string | null> {
    const url = normalizeUrl(input);
    if (!url) {
      this.say('Esse endereço não parece uma página (comece com https://).', { error: true });
      return null;
    }
    const highlights = (opts.highlights ?? []).map((h) => h.trim()).filter(Boolean);
    const known = mode === 'note' && !opts.again ? this.clipped(url) : null;
    if (known) {
      if (highlights.length || opts.comment?.trim()) {
        let n = 0;
        this.update(known, (t) => {
          for (const h of highlights) {
            const r = addHighlight(t, h);
            if (r.added) n++;
            t = r.text;
          }
          if (opts.comment?.trim()) t = t.replace(/\n*$/, `\n\n> [!quote] Minha nota\n${opts.comment.trim().split('\n').map((l) => `> ${l}`).join('\n')}\n`);
          return t;
        });
        this.say(n ? `${n === 1 ? 'Destaque adicionado' : `${n} destaques adicionados`} em "${noteTitle(known)}".` : `"${noteTitle(known)}" atualizada.`, { path: known });
      } else {
        this.say(`Essa página já está no cofre: ${known}.`, { path: known });
      }
      if (attachTo && attachTo !== known) this.insertInto(attachTo, `> [!link] [[${known.replace(/\.md$/, '')}]]\n`);
      else if (!attachTo && opts.open !== false) this.openPath(known);
      return known;
    }
    try {
      return await engine.bus.process(`clip:${url}`, 'Baixando a página', async () => {
        let page: { url: string; type: string; data: Uint8Array };
        if (opts.html) {
          page = { url, type: 'text/html; charset=utf-8', data: new TextEncoder().encode(opts.html) };
        } else {
          this.busy = 'Baixando a página…';
          page = await fetchUrl(url, opts.allowPrivate ?? true);
        }
        // link direto para um PDF ou imagem: vira arquivo, não recorte
        const kind = page.type.includes('pdf') ? 'pdf' : page.type.startsWith('image/') ? 'image' : null;
        if (kind) {
          const fromUrl = safeDecode(new URL(page.url).pathname.split('/').pop() || 'arquivo');
          const ext = kind === 'pdf' ? 'pdf' : extForMime(page.type);
          const path = freePath(this.exists, kind === 'pdf' ? FOLDERS.pdf : FOLDERS.attachments, stem(fromUrl) || 'arquivo', ext);
          await this.write(path, page.data);
          if (attachTo) this.insertInto(attachTo, `![[${path}]]`);
          this.say(`Baixei ${path}.`, { path });
          return path;
        }
        const clip = prepareClip(decodeHtml(page.data, page.type), page.url, parse);
        if (mode === 'card') {
          if (attachTo) this.insertInto(attachTo, linkCard(clip.meta));
          this.say(`Cartão de "${clip.meta.title}" adicionado.`);
          return null;
        }
        const template = pickClipTemplate(this.clipTemplates(), clip.meta.url);
        const title = safeFileName(clip.meta.title) || 'Página';
        const folder = opts.folder ?? template?.folder ?? FOLDERS.web;
        const notePath = freePath(this.exists, folder, title, 'md');
        const dir = `${FOLDERS.attachments}/${folder}/${stem(notePath)}`;
        const images = new Map<string, string>();
        let n = 0;
        const queue = clip.images.slice(0, 40);
        if (queue.length) this.busy = `Baixando ${queue.length} ${queue.length === 1 ? 'imagem' : 'imagens'}…`;
        const worker = async () => {
          for (let src = queue.shift(); src; src = queue.shift()) {
            try {
              const img = await fetchUrl(src, false);
              const type = img.type.startsWith('image/') ? img.type : sniffImage(img.data);
              if (!type || img.data.length < 200) continue; // pixel de rastreio
              const path = `${dir}/imagem ${++n}.${extForMime(type)}`;
              await this.write(path, img.data);
              images.set(src, path);
            } catch {
              // imagem que não baixou fica apontando para a web
            }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        this.createNote(notePath, clipToMarkdown(clip, { parse, images, tags: opts.tags, comment: opts.comment, highlights, template }));
        engine.bus.emit({ type: 'file.imported', path: notePath, from: url });
        if (attachTo) this.insertInto(attachTo, linkCard(clip.meta, { note: notePath.replace(/\.md$/, '') }));
        this.say(`"${clip.meta.title}" salva em ${notePath}${images.size ? ` com ${images.size} ${images.size === 1 ? 'imagem' : 'imagens'}` : ''}.`, { path: notePath });
        if (!attachTo && opts.open !== false) this.openPath(notePath);
        return notePath;
      });
    } catch (e) {
      this.say(`Não consegui baixar a página: ${e instanceof Error ? e.message : String(e)}`, { error: true });
      return null;
    } finally {
      this.busy = '';
      void engine.syncNow();
    }
  }

  /** Refaz a seção Destaques da nota a partir dos ==trechos== marcados. */
  gatherHighlights(path: string): void {
    const before = engine.vault.has(path) ? engine.vault.read(path) : '';
    this.update(path, syncHighlights);
    this.say(engine.vault.read(path) === before ? 'Nenhum ==destaque== novo nesta nota.' : 'Destaques juntados no topo da nota.', { path });
  }

  /** Lê, aplica e grava uma nota (aberta ou não). */
  private update(path: string, fn: (t: string) => string): void {
    const cur = engine.vault.has(path) ? engine.vault.read(path) : '';
    const next = fn(cur);
    if (next !== cur) engine.writeNote(path, next);
  }

  /** Coloca um trecho na nota: no cursor, se ela está aberta; senão, no fim. */
  insertInto(notePath: string, text: string): void {
    if (engine.active === notePath && editorBridge.insert(text)) return;
    const cur = engine.vault.has(notePath) ? engine.vault.read(notePath) : '';
    engine.writeNote(notePath, `${cur.replace(/\s*$/, '')}\n\n${text}`);
  }

  /* ------------------------------------------------------------ exportar */

  /** Salva bytes onde a pessoa vai achar: Exportados/ no app; download no navegador. */
  async deliver(fileName: string, data: Uint8Array, mime: string): Promise<string | null> {
    if (isTauri()) {
      const path = freePath(this.exists, FOLDERS.exported, stem(fileName), fileName.split('.').pop()!);
      await this.write(path, data);
      this.say(`Salvei em ${engine.location}/${path}`, { path });
      return path;
    }
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return null;
  }

  /** Nota → .html (abre em qualquer lugar), .docx, PDF (pela impressão) ou o próprio .md. */
  async exportNote(notePath: string, format: 'html' | 'docx' | 'pdf' | 'md'): Promise<void> {
    try {
      const md = engine.vault.read(notePath);
      const title = stem(notePath);
      if (format === 'md') {
        await this.deliver(`${title}.md`, new TextEncoder().encode(md), 'text/markdown');
        return;
      }
      const all = [...engine.notes, ...this.list];
      const images = new Map<string, { data: Uint8Array; mime: string }>();
      for (const m of md.matchAll(/!\[\[([^\]|#]+)/g)) {
        const hit = resolveLink(m[1]!, all);
        if (hit && fileKind(hit.path) === 'image') {
          const data = await this.read(hit.path);
          if (data) images.set(m[1]!.trim(), { data, mime: mimeOf(hit.path) });
        }
      }
      const opts = { title, image: (t: string) => images.get(t.trim()) ?? null };
      if (format === 'pdf') printHtml(markdownToHtml(md, opts));
      else if (format === 'html') await this.deliver(`${title}.html`, new TextEncoder().encode(markdownToHtml(md, opts)), 'text/html');
      else await this.deliver(`${title}.docx`, markdownToDocx(md, opts), mimeOf('x.docx'));
    } catch (e) {
      this.say(`Não consegui exportar: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  /** PDF com as anotações gravadas dentro, em Exportados/. */
  async exportAnnotated(pdfPath: string): Promise<void> {
    try {
      await engine.bus.process(`export:${pdfPath}`, 'Gravando o PDF anotado', async () => {
        const data = await this.read(pdfPath);
        if (!data) throw new Error('o PDF sumiu da pasta');
        const out = await exportAnnotatedPdf(data, engine.annots.list(pdfPath), { author: engine.vault.deviceId });
        await this.deliver(`${stem(pdfPath)} (anotado).pdf`, out, 'application/pdf');
      });
    } catch (e) {
      this.say(`Não consegui gravar o PDF: ${e instanceof Error ? e.message : String(e)}`, { error: true });
    }
  }

  /** Nota com as anotações do PDF (links que voltam para a página). */
  annotationsNote(pdfPath: string): void {
    const list = engine.annots.list(pdfPath);
    if (!list.length) {
      this.say('Este PDF ainda não tem anotações.');
      return;
    }
    const path = `${FOLDERS.pdf}/Anotações - ${stem(pdfPath)}.md`;
    engine.writeNote(path, annotationsToMarkdown(pdfPath, list));
    this.say(`Anotações em ${path}. Gere de novo para atualizar.`, { path });
    this.openPath(path);
  }

  /** Texto do PDF → nota (para buscar, citar e mandar para a IA). */
  async pdfToNote(pdfPath: string, pages: PdfTextItem[][]): Promise<void> {
    const md = pdfTextToMarkdown(pages, { title: stem(pdfPath), source: pdfPath });
    const path = freePath(this.exists, FOLDERS.imported, stem(pdfPath), 'md');
    this.createNote(path, md);
    this.say(`Texto do PDF em ${path}.`, { path });
    this.openPath(path);
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

export const files = new Files();
