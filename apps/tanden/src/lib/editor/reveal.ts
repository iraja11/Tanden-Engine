import type { EditorState, SelectionRange } from '@codemirror/state';

/*
 * Onde a prévia ao vivo mostra o Markdown cru (**, #, >, [[ ]], tabelas,
 * callouts, imagens): só onde há um cursor. Uma seleção com texto não revela
 * nada; antes ela abria todas as linhas que tocava e o texto pulava enquanto
 * você selecionava (ou logo depois de pôr negrito, título…).
 */
export function revealRanges(state: EditorState): readonly SelectionRange[] {
  return state.selection.ranges.filter((r) => r.empty);
}
