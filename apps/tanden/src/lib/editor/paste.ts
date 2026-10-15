import { EditorView } from '@codemirror/view';
import { htmlToMarkdown } from '@tanden/core';

/*
 * Colar como no Notion:
 * - texto formatado (de sites, Google Docs, Word) vira Markdown;
 * - um endereço colado sobre texto selecionado vira [texto](endereço);
 * - um endereço de imagem ou de vídeo numa linha vazia vira o embed.
 */

const URL_ONLY = /^https?:\/\/\S+$/;
const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?$/i;
const VIDEO = /(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/|vimeo\.com\/\d)/i;
const RICH = /<(p|h[1-6]|ul|ol|li|table|a\s|b>|strong|em>|i>|img|blockquote|pre|code|br)\b/i;

const parse = (text: string, type: 'text/html' | 'application/xml') => new DOMParser().parseFromString(text, type === 'application/xml' ? 'application/xml' : 'text/html');

export const smartPaste = EditorView.domEventHandlers({
  paste(e, view) {
    const dt = e.clipboardData;
    if (!dt || dt.files.length) return false; // arquivos: o editor anexa
    const plain = dt.getData('text/plain');
    const sel = view.state.selection.main;
    if (URL_ONLY.test(plain.trim())) {
      const url = plain.trim();
      if (!sel.empty) {
        const text = view.state.sliceDoc(sel.from, sel.to);
        if (URL_ONLY.test(text.trim())) return false;
        e.preventDefault();
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${text}](${url})` }, userEvent: 'input.paste' });
        return true;
      }
      const line = view.state.doc.lineAt(sel.head);
      if (!line.text.trim() && (IMAGE.test(url) || VIDEO.test(url))) {
        e.preventDefault();
        const ins = `![](${url})`;
        view.dispatch({ changes: { from: line.from, to: line.to, insert: ins }, selection: { anchor: line.from + ins.length }, userEvent: 'input.paste' });
        return true;
      }
      return false;
    }
    const html = dt.getData('text/html');
    // código copiado de editores (VS Code etc.) chega como HTML de spans: fica o texto puro
    if (!html || !RICH.test(html) || /vscode|monaco|<pre[^>]*class="[^"]*(?:hljs|code)/i.test(html)) return false;
    let md: string;
    try {
      md = htmlToMarkdown(html, { parse }).trim();
    } catch {
      return false;
    }
    if (!md || md === plain.trim()) return false;
    e.preventDefault();
    view.dispatch(view.state.replaceSelection(md), { userEvent: 'input.paste', scrollIntoView: true });
    return true;
  },
});
