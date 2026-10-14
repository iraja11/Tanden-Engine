// Carrega o pdf.js uma vez só, sob demanda (ele é grande e só importa quando um PDF abre).
// Usa o build "legacy": o WebKitGTK do Linux e o WebView do Android nem sempre têm
// as funções de JavaScript mais novas que o build moderno exige.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loading: Promise<PdfJs> | null = null;

export function pdfjs(): Promise<PdfJs> {
  loading ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  return loading;
}

const asset = (dir: string) => new URL(`/pdfjs/${dir}/`, location.href).href;

export async function openPdf(data: Uint8Array) {
  const lib = await pdfjs();
  // o pdf.js toma posse do buffer; passa uma cópia para o original continuar válido
  return lib.getDocument({
    data: data.slice(),
    cMapUrl: asset('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'),
    wasmUrl: asset('wasm'),
    iccUrl: asset('iccs'),
    enableXfa: true,
  }).promise;
}

export type PdfDoc = Awaited<ReturnType<typeof openPdf>>;
export type PdfPage = Awaited<ReturnType<PdfDoc['getPage']>>;
