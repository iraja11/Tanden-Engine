import mammoth from 'mammoth';
import { unzipSync, strFromU8 } from 'fflate';
import { descendants, type ParseHtml } from './dom';
import { htmlToMarkdown } from './html';
import { AssetBag, extForMime, type ConvertOptions, type Converted } from './types';

/*
 * .docx → nota. O mammoth lê a estrutura (títulos, listas, tabelas, negrito,
 * links, notas de rodapé) e ignora a formatação visual; as imagens vão para
 * a pasta de anexos e entram na nota como ![[...]].
 */

// O Word grava os estilos internos em inglês e minúsculas, em qualquer idioma.
const STYLE_MAP = [
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='heading 4'] => h4:fresh",
  "p[style-name='heading 5'] => h5:fresh",
  "p[style-name='heading 6'] => h6:fresh",
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='title'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Código'] => pre:separator('\\n')",
  "p[style-name='Code'] => pre:separator('\\n')",
  "r[style-name='Code'] => code",
  "r[style-name='Code Char'] => code",
  "highlight => mark",
  'u => u',
];

/** Título guardado nas propriedades do arquivo (Arquivo → Informações), se houver. */
export function officeTitle(zip: Record<string, Uint8Array>, parse: ParseHtml): string {
  const core = zip['docProps/core.xml'];
  if (!core) return '';
  try {
    return (descendants(parse(strFromU8(core), 'application/xml'), 'title')[0]?.textContent ?? '').trim();
  } catch {
    return '';
  }
}

export async function docxToMarkdown(bytes: Uint8Array, opts: ConvertOptions): Promise<Converted> {
  const bag = new AssetBag(opts.assetDir);
  let n = 0;
  const input = { buffer: bytes, arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as { arrayBuffer: ArrayBuffer };
  const result = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    convertImage: mammoth.images.imgElement(async (image) => {
      const data = new Uint8Array(await image.readAsArrayBuffer());
      const path = bag.add(`imagem ${++n}.${extForMime(image.contentType)}`, data);
      return { src: `tanden-asset:${encodeURIComponent(path)}` };
    }),
  });
  const markdown = htmlToMarkdown(result.value, {
    parse: opts.parse,
    image: (src) => (src.startsWith('tanden-asset:') ? decodeURIComponent(src.slice('tanden-asset:'.length)) : null),
  });
  let title = '';
  try {
    title = officeTitle(unzipSync(bytes, { filter: (f) => f.name === 'docProps/core.xml' }), opts.parse);
  } catch {
    title = '';
  }
  return { title, markdown, assets: bag.assets };
}
