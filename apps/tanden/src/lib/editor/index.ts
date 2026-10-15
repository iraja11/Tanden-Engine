import { EditorView, keymap } from '@codemirror/view';
import { Compartment, type Extension } from '@codemirror/state';
import { codeFolding, foldKeymap } from '@codemirror/language';
import { completionKeymap } from '@codemirror/autocomplete';
import { bubble } from './bubble';
import { callouts } from './callouts';
import { formatKeymap } from './format';
import { blockHandle } from './handle';
import { hostFacet, type EditorHost } from './host';
import { hideFrontmatter, livePreview } from './live';
import { linkPreview } from './hover';
import { smartPaste } from './paste';
import { slashMenu } from './slash';
import { tables } from './tables';
import './editor.css';

export type { EditorHost } from './host';

/** Prévia ao vivo liga/desliga sem recriar o editor (modo "código-fonte"). */
export const previewSlot = new Compartment();

/** O que muda a cara da nota (some no modo código-fonte). */
export const preview: Extension = [livePreview, hideFrontmatter, callouts, tables, blockHandle];

/**
 * Tudo o que faz do editor de notas um editor "de verdade": prévia ao vivo,
 * menu /, [[links]], alça de bloco, barra de seleção, tabelas, atalhos.
 * Outras frentes podem somar extensões aqui (ex.: blocos de banco de dados).
 */
export function notionLike(host: EditorHost, opts: { preview?: boolean } = {}): Extension {
  return [
    hostFacet.of(host),
    previewSlot.of(opts.preview === false ? [] : preview),
    slashMenu,
    bubble,
    smartPaste,
    linkPreview,
    codeFolding({
      placeholderDOM: (_view, onclick) => {
        const s = document.createElement('span');
        s.className = 'cm-fold-pill';
        s.textContent = '⋯';
        s.title = 'Mostrar o que está recolhido';
        s.onclick = onclick;
        return s;
      },
    }),
    keymap.of([...completionKeymap, ...formatKeymap, ...foldKeymap]),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', autocapitalize: 'sentences' }),
  ];
}
