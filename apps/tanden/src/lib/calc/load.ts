import type { Extension } from '@codemirror/state';

// O cálculo (mathjs) e o KaTeX ficam num pedaço separado, baixado depois que o editor abre.

let ext: Extension | null = null;
let loading: Promise<Extension> | null = null;

export const calcLoaded = () => ext;

export function loadCalc(): Promise<Extension> {
  return (loading ??= import('./calc-ext').then((m) => (ext = m.calcExtension)));
}
