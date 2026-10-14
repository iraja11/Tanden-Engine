import { PLUGIN_API } from './manifest';
import { PLUGIN_METHODS } from './host';

/*
 * O que vai dentro da janela do plugin: a política de segurança (sem rede
 * direta, sem imagens de fora) e o objeto `tanden`, que transforma cada
 * chamada numa mensagem para o app.
 *
 *   const nota = await tanden.notas.ler('Diário/hoje.md');
 *   tanden.eventos.ouvir((e) => console.log(e.type));
 *   tanden.aoMudarTema((cores) => ...);   // as cores também viram variáveis CSS
 */

/**
 * Política da janela: scripts e estilos do próprio HTML ou das CDNs que os
 * artefatos do Claude usam; nada de rede direta nem imagens de fora (dados só
 * saem pela API, com permissão).
 */
const CDN = 'https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com';
export const PLUGIN_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' blob: ${CDN}`,
  `style-src 'unsafe-inline' ${CDN} https://fonts.googleapis.com`,
  `font-src data: ${CDN} https://fonts.gstatic.com`,
  'img-src data: blob:',
  'media-src data: blob:',
  'worker-src blob:',
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function sdkSource(methods: string[]): string {
  // roda dentro da janela isolada; não pode depender de nada do app
  return `(() => {
  'use strict';
  const pending = new Map();
  const listeners = { evento: new Set(), tema: new Set(), visivel: new Set() };
  let seq = 0;
  let theme = null;
  const send = (msg) => parent.postMessage(Object.assign({ tanden: 1 }, msg), '*');
  const call = (m, a) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    send({ tipo: 'chamada', id, m, a });
  });
  const applyTheme = (t) => {
    theme = t;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
    root.style.colorScheme = t.escuro ? 'dark' : 'light';
    root.dataset.theme = t.escuro ? 'dark' : 'light';
    root.dataset.motion = t.movimento;
  };
  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const d = e.data;
    if (!d || d.tanden !== 1) return;
    if (d.tipo === 'resposta') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.ok) p.resolve(d.valor); else p.reject(new Error(d.erro));
    } else if (d.tipo === 'tema') {
      applyTheme(d.tema);
      listeners.tema.forEach((f) => f(d.tema));
    } else if (d.tipo === 'evento') {
      listeners.evento.forEach((f) => f(d.evento));
    } else if (d.tipo === 'visivel') {
      listeners.visivel.forEach((f) => f(d.visivel));
    }
  });
  const api = { api: ${PLUGIN_API} };
  for (const m of ${JSON.stringify(methods)}) {
    const [ns, fn] = m.split('.');
    (api[ns] = api[ns] || {})[fn] = (...a) => call(m, a);
  }
  const ouvir = api.eventos && api.eventos.ouvir;
  api.eventos = {
    ouvir(fn) {
      listeners.evento.add(fn);
      ouvir().catch((err) => console.warn('[tanden]', err.message));
      return () => listeners.evento.delete(fn);
    },
  };
  api.tema = () => theme;
  api.aoMudarTema = (fn) => { listeners.tema.add(fn); if (theme) fn(theme); return () => listeners.tema.delete(fn); };
  /** a tela do plugin apareceu (true) ou foi escondida (false) */
  api.aoMostrar = (fn) => { listeners.visivel.add(fn); return () => listeners.visivel.delete(fn); };
  Object.freeze(api);
  Object.defineProperty(window, 'tanden', { value: api, writable: false, configurable: false });
  addEventListener('error', (e) => send({ tipo: 'erro', erro: String(e.message || e.error) }));
  addEventListener('unhandledrejection', (e) => send({ tipo: 'erro', erro: String((e.reason && e.reason.message) || e.reason) }));
  const ready = () => send({ tipo: 'pronto' });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ready); else ready();
})();`;
}

/** Estilo mínimo para um artefato qualquer já sair com as cores do tema. */
const BASE_STYLE = `:root{color-scheme:dark}html,body{margin:0;background:var(--void,#0c0c0e);color:var(--ink,#ecebf0);font:14px/1.5 "Manrope","Segoe UI",system-ui,sans-serif}`;

/**
 * Documento que a janela do plugin carrega: política de segurança e SDK
 * primeiro, antes de qualquer script do plugin.
 */
export function pluginDocument(html: string): string {
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PLUGIN_CSP}"><style>${BASE_STYLE}</style><script>${sdkSource(PLUGIN_METHODS)}</script>`;
  // a política precisa vir antes de tudo; um <meta> do próprio plugin só poderia restringir mais
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)?.[0] ?? '<!doctype html>';
  const rest = html.replace(/^\s*<!doctype[^>]*>/i, '');
  const m = /<head[^>]*>/i.exec(rest);
  if (m) return `${doctype}${rest.slice(0, m.index + m[0].length)}${head}${rest.slice(m.index + m[0].length)}`;
  const h = /<html[^>]*>/i.exec(rest);
  if (h) return `${doctype}${rest.slice(0, h.index + h[0].length)}<head>${head}</head>${rest.slice(h.index + h[0].length)}`;
  return `${doctype}<html><head>${head}</head><body>${rest}</body></html>`;
}
