import type { ParseHtml } from './dom';

/** Arquivo extra que a conversão gerou (imagens), com o caminho final no cofre. */
export interface Asset {
  path: string;
  data: Uint8Array;
}

export interface Converted {
  /** título sugerido para a nota */
  title: string;
  markdown: string;
  assets: Asset[];
}

export interface ConvertOptions {
  parse: ParseHtml;
  /** pasta do cofre onde as imagens vão morar, ex.: "Anexos/Relatório" */
  assetDir: string;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-emf': 'emf',
  'image/x-wmf': 'wmf',
  'image/tiff': 'tiff',
  'image/avif': 'avif',
};
export const extForMime = (mime: string): string => MIME_EXT[mime.split(';')[0]!.trim().toLowerCase()] ?? 'bin';

/** Junta imagens sem repetir nomes dentro da pasta. */
export class AssetBag {
  readonly assets: Asset[] = [];
  private names = new Set<string>();
  private byKey = new Map<string, string>();

  constructor(readonly dir: string) {}

  /** Guarda a imagem e devolve o caminho no cofre. `key` evita guardar a mesma duas vezes. */
  add(name: string, data: Uint8Array, key?: string): string {
    if (key && this.byKey.has(key)) return this.byKey.get(key)!;
    const clean = safeFileName(name) || 'imagem';
    const dot = clean.lastIndexOf('.');
    const stem = dot > 0 ? clean.slice(0, dot) : clean;
    const ext = dot > 0 ? clean.slice(dot) : '';
    let file = `${stem}${ext}`;
    for (let n = 2; this.names.has(file.toLowerCase()); n++) file = `${stem} ${n}${ext}`;
    this.names.add(file.toLowerCase());
    const path = `${this.dir}/${file}`;
    this.assets.push({ path, data });
    if (key) this.byKey.set(key, path);
    return path;
  }
}

/** Nome de arquivo aceito no Windows, no Android e no Drive (sem / \ : * ? " < > | # ^ [ ]). */
export function safeFileName(name: string, max = 80): string {
  const cleaned = name
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/ +(\.[A-Za-z0-9]{1,5})$/, '$1')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (cleaned.length <= max) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : '';
  return `${cleaned.slice(0, max - ext.length).trim()}${ext}`;
}

/** Bytes de um data: URL (base64 ou texto), com o tipo. */
export function decodeDataUrl(url: string): { mime: string; data: Uint8Array } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*?)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const mime = m[1] || 'text/plain';
  try {
    if (m[3]) return { mime, data: Uint8Array.from(atob(m[4]!.replace(/\s/g, '')), (c) => c.charCodeAt(0)) };
    return { mime, data: new TextEncoder().encode(decodeURIComponent(m[4]!)) };
  } catch {
    return null;
  }
}

export type { ParseHtml };
