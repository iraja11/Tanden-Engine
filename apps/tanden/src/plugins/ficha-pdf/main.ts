import { buildFicha, characterRank, type Ficha } from './model';
import { Painter } from './paint';
import { jpegPdf, type PdfPage } from './pdf';
import { renderSheet } from './sheet';

/*
 * Plugin "Ficha em PDF": acha as fichas de personagem do cofre, mostra a
 * prévia em páginas A4 e baixa um PDF. A prévia acompanha a nota: editou a
 * ficha no Tanden, a página atualiza sozinha.
 */

const PAGE_W = 794;
const PAGE_H = 1123;
/** resolução do PDF: 3 × 96 dpi ≈ 288 dpi */
const SCALE = 3;

const ACCENTS = [
  { id: 'carmesim', nome: 'Carmesim', cor: '#9b1c31' },
  { id: 'brasa', nome: 'Brasa', cor: '#b4471c' },
  { id: 'floresta', nome: 'Floresta', cor: '#2f6b3a' },
  { id: 'mar', nome: 'Mar', cor: '#1d5f7a' },
  { id: 'arcano', nome: 'Arcano', cor: '#4a3f9f' },
  { id: 'tinta', nome: 'Tinta', cor: '#2a2522' },
];

interface Entry {
  path: string;
  name: string;
  rank: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const api = (): TandenApi | null => window.tanden ?? null;

const state = {
  list: [] as Entry[],
  current: null as Ficha | null,
  text: '',
  accent: ACCENTS[0]!.cor,
  portrait: null as string | null,
  busy: false,
};

function status(msg: string, kind: '' | 'ok' | 'err' = '') {
  const s = $('status');
  s.textContent = msg;
  s.className = `status ${kind}`;
  s.hidden = !msg;
}

async function load<T>(key: string): Promise<T | null> {
  try {
    return ((await api()?.dados.ler(key)) as T | undefined) ?? null;
  } catch {
    return null;
  }
}

async function save(key: string, value: unknown) {
  try {
    if (value === null) await api()?.dados.apagar(key);
    else await api()?.dados.gravar(key, value);
  } catch (err) {
    console.warn('[ficha-pdf]', err);
  }
}

// ---------------------------------------------------------------- fichas do cofre

async function scan(): Promise<void> {
  const t = api();
  if (!t) return;
  const paths = (await t.notas.listar()).filter((p) => !p.startsWith('Plugins/'));
  const found: Entry[] = [];
  for (let i = 0; i < paths.length; i += 24) {
    const chunk = paths.slice(i, i + 24);
    const texts = await Promise.all(chunk.map((p) => t.notas.ler(p).catch(() => null)));
    texts.forEach((text, k) => {
      if (!text) return;
      const rank = characterRank(text);
      if (!rank) return;
      const path = chunk[k]!;
      const h1 = /^#\s+(.+?)\s*$/m.exec(text.replace(/^---\n[\s\S]*?\n---\n?/, ''))?.[1];
      found.push({ path, name: h1 ?? path.split('/').pop()!.replace(/\.md$/i, ''), rank });
    });
  }
  found.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name, 'pt'));
  state.list = found;
  fillPicker();
}

function fillPicker() {
  const sel = $<HTMLSelectElement>('pick');
  const cur = state.current?.path;
  sel.replaceChildren();
  const dup = (n: string) => state.list.filter((e) => e.name === n).length > 1;
  let group: HTMLOptGroupElement | null = null;
  let lastRank = -1;
  for (const e of state.list) {
    if (e.rank !== lastRank) {
      group = document.createElement('optgroup');
      group.label = e.rank === 2 ? 'Personagens' : 'Outras fichas';
      sel.append(group);
      lastRank = e.rank;
    }
    const o = document.createElement('option');
    o.value = e.path;
    const dir = e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '';
    o.textContent = dup(e.name) && dir ? `${e.name} — ${dir}` : e.name;
    group!.append(o);
  }
  if (cur) sel.value = cur;
  const empty = !state.list.length;
  $('empty').hidden = !empty;
  $('stage').hidden = empty;
  for (const id of ['pick', 'pdf', 'photo']) ($(id) as HTMLButtonElement).disabled = empty;
}

async function open(path: string) {
  const t = api();
  if (!t) return;
  const text = await t.notas.ler(path);
  if (text === null) {
    status('Não achei essa nota. Ela foi apagada ou movida?', 'err');
    return;
  }
  state.text = text;
  state.current = buildFicha(path, text);
  state.portrait = await load<string>(`retrato:${path}`);
  $<HTMLSelectElement>('pick').value = path;
  void save('ultima', path);
  updatePhotoButtons();
  render();
}

// ---------------------------------------------------------------- prévia

function render() {
  const f = state.current;
  const host = $('pages');
  if (!f) {
    host.replaceChildren();
    return;
  }
  const pages = renderSheet(f, host, { portrait: state.portrait, accent: state.accent });
  applyAccent(host);
  host.dataset['pages'] = String(pages.length);
  fit();
  $('count').textContent = `${pages.length} ${pages.length === 1 ? 'página' : 'páginas'}`;
}

function applyAccent(host: HTMLElement) {
  const hex = state.accent.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  host.style.setProperty('--accent', state.accent);
  host.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.07)`);
  host.style.setProperty('--accent-mid', `rgba(${r},${g},${b},0.28)`);
}

/** Encaixa as páginas na largura da janela. */
function fit() {
  const stage = $('stage');
  const host = $('pages');
  const frame = $('frame');
  const n = Number(host.dataset['pages'] ?? 1);
  const gap = 24;
  const s = Math.min(1.25, Math.max(0.3, (stage.clientWidth - 32) / PAGE_W));
  host.style.transform = `scale(${s})`;
  frame.style.width = `${PAGE_W * s}px`;
  frame.style.height = `${(n * PAGE_H + (n - 1) * gap) * s}px`;
}

// ---------------------------------------------------------------- retrato

function updatePhotoButtons() {
  $('photo').textContent = state.portrait ? 'Trocar retrato' : 'Retrato';
  $('nophoto').hidden = !state.portrait;
}

/** Reduz a imagem para caber bem nos dados do plugin (JPEG de até 480 px). */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = 480;
      const s = Math.min(1, side / Math.min(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('não consegui abrir essa imagem'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------- PDF

const fileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Ficha'} - ficha.pdf`;

async function exportPdf() {
  const f = state.current;
  if (!f || state.busy) return;
  state.busy = true;
  const btn = $<HTMLButtonElement>('pdf');
  btn.disabled = true;
  btn.classList.add('busy');
  const off = document.createElement('div');
  off.className = 'sheet-root offscreen';
  document.body.append(off);
  try {
    await document.fonts.ready;
    const pages = renderSheet(f, off, { portrait: state.portrait, accent: state.accent });
    applyAccent(off);
    const canvas = document.createElement('canvas');
    const painter = new Painter(canvas);
    await painter.preload(off);
    const out: PdfPage[] = [];
    for (let i = 0; i < pages.length; i++) {
      status(`Desenhando a página ${i + 1} de ${pages.length}…`);
      await new Promise((r) => setTimeout(r, 0));
      painter.paint(pages[i]!, SCALE);
      const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('o navegador não gerou a imagem da página'))), 'image/jpeg', 0.92));
      out.push({ jpeg: new Uint8Array(await jpeg.arrayBuffer()), width: canvas.width, height: canvas.height });
    }
    const blob = jpegPdf(out, { title: `${f.name} — ficha de personagem`, subject: f.lineage, creator: 'Tanden' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(f.name);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status(`Pronto: “${a.download}” foi para a pasta de downloads.`, 'ok');
  } catch (err) {
    status(`Não deu para gerar o PDF: ${err instanceof Error ? err.message : String(err)}`, 'err');
  } finally {
    off.remove();
    state.busy = false;
    btn.disabled = false;
    btn.classList.remove('busy');
  }
}

// ---------------------------------------------------------------- início

function accents() {
  const box = $('accents');
  for (const a of ACCENTS) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = a.nome;
    b.setAttribute('aria-label', `Cor ${a.nome}`);
    b.style.background = a.cor;
    b.dataset['cor'] = a.cor;
    b.onclick = () => {
      state.accent = a.cor;
      void save('cor', a.cor);
      markAccent();
      render();
    };
    box.append(b);
  }
}

function markAccent() {
  for (const b of $('accents').querySelectorAll<HTMLButtonElement>('.swatch')) b.classList.toggle('on', b.dataset['cor'] === state.accent);
}

async function start() {
  accents();
  const t = api();
  if (!t) {
    status('Este plugin roda dentro do Tanden (tela Plugins).', 'err');
    return;
  }
  state.accent = (await load<string>('cor')) ?? state.accent;
  markAccent();

  $<HTMLSelectElement>('pick').onchange = (e) => void open((e.target as HTMLSelectElement).value);
  $('pdf').onclick = () => void exportPdf();
  $('opennote').onclick = () => state.current && void t.app.abrirNota(state.current.path);
  const file = $<HTMLInputElement>('file');
  $('photo').onclick = () => file.click();
  file.onchange = async () => {
    const fl = file.files?.[0];
    file.value = '';
    if (!fl || !state.current) return;
    try {
      state.portrait = await shrink(fl);
      await save(`retrato:${state.current.path}`, state.portrait);
      updatePhotoButtons();
      render();
    } catch (err) {
      status(String(err instanceof Error ? err.message : err), 'err');
    }
  };
  $('nophoto').onclick = async () => {
    if (!state.current) return;
    state.portrait = null;
    await save(`retrato:${state.current.path}`, null);
    updatePhotoButtons();
    render();
  };
  new ResizeObserver(() => fit()).observe($('stage'));

  status('Procurando fichas no cofre…');
  try {
    await scan();
  } catch (err) {
    status(`Não consegui ler as notas: ${err instanceof Error ? err.message : String(err)}`, 'err');
    return;
  }
  status('');
  const last = await load<string>('ultima');
  const first = state.list.find((e) => e.path === last) ?? state.list[0];
  if (first) await open(first.path);

  // a prévia acompanha a nota aberta; fichas novas entram na lista
  let timer = 0;
  try {
    t.eventos.ouvir((e) => {
      if (!e.path?.endsWith('.md')) return;
      clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (state.current && e.path === state.current.path) {
          const text = await t.notas.ler(e.path!);
          if (text !== null && text !== state.text) {
            state.text = text;
            state.current = buildFicha(e.path!, text);
            render();
          }
        }
        if (e.type === 'note.deleted') {
          if (state.list.some((x) => x.path === e.path)) await scan();
        } else if (!state.list.some((x) => x.path === e.path)) {
          const text = await t.notas.ler(e.path!).catch(() => null);
          if (text && characterRank(text)) await scan();
        }
      }, 400);
    });
  } catch {
    // sem a permissão de eventos: a prévia atualiza ao escolher de novo
  }
}

void start();
