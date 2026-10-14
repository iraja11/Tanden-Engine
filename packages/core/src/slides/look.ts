/** Cores de uma apresentação exportada (vêm do tema do app ou do modo claro de impressão). */
export interface SlideLook {
  bg: string;
  surface: string;
  line: string;
  ink: string;
  muted: string;
  accent: string;
  dark: boolean;
}

/** Imagem pronta para entrar no arquivo: o app converte WebP, SVG e páginas de PDF para PNG antes. */
export interface SlideImage {
  data: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  w: number;
  h: number;
}

export interface DeckExportOptions {
  look: SlideLook;
  /** bytes da imagem de um ![[alvo]] (alvo como escrito, com #page=n se houver) */
  image?: (target: string) => SlideImage | null;
  author?: string;
}

/** Tema Núcleo (escuro) e o claro para imprimir. */
export const LOOK_NUCLEO: SlideLook = { bg: '#0c0c0e', surface: '#1c1c20', line: '#2b2a31', ink: '#ecebf0', muted: '#8c8a96', accent: '#ff8a3d', dark: true };
export const LOOK_PAPEL: SlideLook = { bg: '#ffffff', surface: '#f3f1ec', line: '#dcd6c8', ink: '#1d1b18', muted: '#6b665c', accent: '#d9600c', dark: false };

/** Encaixa (w, h) dentro da caixa mantendo a proporção. */
export function contain(w: number, h: number, boxW: number, boxH: number): { w: number; h: number } {
  const k = Math.min(boxW / w, boxH / h);
  return { w: w * k, h: h * k };
}
