import { strToU8, zipSync, type Zippable } from 'fflate';

/*
 * Pacote OpenDocument (.odt, .ods, .odp): um zip cujo primeiro arquivo é
 * "mimetype", gravado sem compressão, mais o manifesto com cada parte.
 * Sem isso o LibreOffice abre o arquivo como "corrompido, reparar?".
 */

export const ODF_MIME = {
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
} as const;

export const ODF_NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"',
  'xmlns:smil="urn:oasis:names:tc:opendocument:xmlns:smil-compatible:1.0"',
  'xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ');

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

/** Data fixa nos arquivos do zip: o mesmo conteúdo gera os mesmos bytes. */
const FIXED_TIME = new Date(Date.UTC(2020, 0, 1));

export function metaXml(title: string, esc: (s: string) => string): string {
  return `${XML_HEAD}<office:document-meta ${ODF_NS} office:version="1.3"><office:meta><meta:generator>Tanden Engine</meta:generator>${title ? `<dc:title>${esc(title)}</dc:title>` : ''}</office:meta></office:document-meta>`;
}

/**
 * Monta o pacote. `parts` são os arquivos (content.xml, styles.xml, imagens...);
 * `types` dá o tipo de cada um no manifesto (padrão: text/xml).
 */
export function odfPackage(mime: string, parts: Record<string, Uint8Array | string>, types: Record<string, string> = {}): Uint8Array {
  const files: Zippable = {};
  // o mimetype vem primeiro e sem compressão (exigência do formato)
  files.mimetype = [strToU8(mime), { level: 0, mtime: FIXED_TIME }];
  const entries = [`<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${mime}"/>`];
  for (const [path, data] of Object.entries(parts)) {
    const bytes = typeof data === 'string' ? strToU8(data) : data;
    const image = /\.(png|jpe?g|gif|svg|webp)$/i.test(path);
    files[path] = [bytes, { level: image ? 0 : 6, mtime: FIXED_TIME }];
    const type = types[path] ?? (image ? imageMime(path) : 'text/xml');
    entries.push(`<manifest:file-entry manifest:full-path="${path}" manifest:media-type="${type}"/>`);
  }
  files['META-INF/manifest.xml'] = [
    strToU8(`${XML_HEAD}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">${entries.join('')}</manifest:manifest>`),
    { level: 6, mtime: FIXED_TIME },
  ];
  return zipSync(files);
}

function imageMime(path: string): string {
  const ext = path.split('.').pop()!.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
}

/** Comprimento ODF ("2.5cm", "1in", "12pt", "96px") → pixels CSS. */
export function lengthToPx(v: string | undefined): number | null {
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?\s*$/i.exec(v ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'px').toLowerCase();
  const k = unit === 'cm' ? 96 / 2.54 : unit === 'mm' ? 96 / 25.4 : unit === 'in' ? 96 : unit === 'pt' ? 96 / 72 : unit === 'pc' ? 16 : 1;
  return Number.isFinite(n) ? n * k : null;
}

/** Pixels → centímetros com 3 casas, como o LibreOffice grava. */
export const pxToCm = (px: number): string => `${(Math.round((px * 2.54 * 1000) / 96) / 1000).toString()}cm`;
