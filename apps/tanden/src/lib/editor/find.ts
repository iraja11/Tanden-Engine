import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { closeSearchPanel, findNext, findPrevious, gotoLine, highlightSelectionMatches, openSearchPanel, search } from '@codemirror/search';

/*
 * Buscar e substituir dentro da nota (Ctrl+F / Ctrl+H), com o painel em
 * português e no visual do app. Sem o Ctrl+D do CodeMirror: no Tanden ele
 * já é atalho do app.
 */

const phrases = EditorState.phrases.of({
  Find: 'Buscar',
  Replace: 'Substituir por',
  next: 'próximo',
  previous: 'anterior',
  all: 'todos',
  'match case': 'maiúsc./minúsc.',
  'by word': 'palavra inteira',
  regexp: 'regex',
  replace: 'substituir',
  'replace all': 'substituir todos',
  close: 'fechar',
  'current match': 'resultado atual',
  'replaced $ matches': '$ trocas feitas',
  'replaced match on line $': 'troca feita na linha $',
  'on line': 'na linha',
  'Go to line': 'Ir para a linha',
  go: 'ir',
});

const look = EditorView.theme({
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--ember) 24%, transparent)', borderRadius: '3px', outline: '1px solid color-mix(in srgb, var(--ember) 45%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--ember) 55%, transparent)', color: 'var(--ink)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--ember-soft) 16%, transparent)', borderRadius: '3px' },
});

export const findReplace: Extension = [
  phrases,
  look,
  search({ top: true }),
  highlightSelectionMatches({ minSelectionLength: 3, wholeWords: true }),
  keymap.of([
    { key: 'Mod-f', run: openSearchPanel, scope: 'editor search-panel' },
    { key: 'Mod-h', run: openSearchPanel, scope: 'editor search-panel' },
    { key: 'F3', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
    { key: 'Mod-g', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
    { key: 'Mod-Alt-g', run: gotoLine },
    { key: 'Escape', run: closeSearchPanel, scope: 'editor search-panel' },
  ]),
];
