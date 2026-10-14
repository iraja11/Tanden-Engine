import katex from 'katex';
import 'katex/dist/katex.min.css';

// Fórmulas em TeX com o KaTeX, guardadas para não renderizar de novo a cada tecla.

const cache = new Map<string, string>();

export function renderTex(src: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${src}`;
  let html = cache.get(key);
  if (html === undefined) {
    try {
      html = katex.renderToString(src, { displayMode: display, throwOnError: true, strict: false, trust: false, output: 'html' });
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^KaTeX parse error: /, '') : String(e);
      const span = document.createElement('span');
      span.className = 'tex-error';
      span.title = msg;
      span.textContent = display ? `$$${src}$$` : `$${src}$`;
      html = span.outerHTML;
    }
    if (cache.size > 800) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
  }
  return html;
}
