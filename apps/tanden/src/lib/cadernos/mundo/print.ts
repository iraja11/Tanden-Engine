import { RESERVED, asList, imageOf, typeInfo, type Entity } from '@tanden/core';
import { files } from '../../files/files.svelte';
import { typeBase, typeGlyph } from '../tipos';

// Imprime as fichas como cartas de baralho (63×88 mm, 9 por folha A4), num
// iframe à parte: a folha não herda o layout do app e o app não pisca.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const plain = (v: string) => v.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1');

function keyFields(e: Entity): Array<[string, string]> {
  const t = typeInfo(e.type);
  const out: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const k of [...t.fields, ...(t.extras ?? []), ...Object.keys(e.props)]) {
    const key = Object.keys(e.props).find((p) => p.toLowerCase() === k.toLowerCase());
    if (!key || seen.has(key) || RESERVED.has(key.toLowerCase())) continue;
    seen.add(key);
    const v = asList(e.props[key]).map(plain).join(', ').trim();
    if (v) out.push([key, v]);
    if (out.length >= 5) break;
  }
  return out;
}

export async function printCards(list: Entity[], title: string): Promise<void> {
  const imgs = await Promise.all(list.map(async (e) => {
    const t = imageOf(e.props);
    return t ? await files.imageUrl(t).catch(() => null) : null;
  }));
  const cards = list.map((e, i) => {
    const c = typeBase(e.type);
    const art = imgs[i] ? `<img src="${esc(imgs[i]!)}" alt="">` : `<span class="glyph">${esc(typeGlyph(e.type))}</span>`;
    const dl = keyFields(e).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    return `<article style="--c:${c}"><h2>${esc(e.name)}</h2><div class="art">${art}</div>
      <div class="rib">${esc(typeInfo(e.type).label)}</div>${dl ? `<dl>${dl}</dl>` : ''}${e.summary ? `<p>${esc(e.summary)}</p>` : ''}</article>`;
  }).join('');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 9pt/1.35 system-ui, sans-serif; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    main { display: grid; grid-template-columns: repeat(3, 63mm); gap: 3mm; justify-content: center; }
    article { width: 63mm; height: 88mm; border: 1.6mm solid var(--c); border-radius: 3mm; padding: 2.4mm; display: flex; flex-direction: column; gap: 1.6mm;
      overflow: hidden; break-inside: avoid; background: linear-gradient(170deg, color-mix(in srgb, var(--c) 14%, #fff), #fff 45%); }
    h2 { margin: 0; font-size: 11pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .art { height: 30mm; border-radius: 1.6mm; overflow: hidden; display: grid; place-items: center; flex: none;
      background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--c) 35%, #fff), color-mix(in srgb, var(--c) 10%, #fff)); border: .3mm solid var(--c); }
    .art img { width: 100%; height: 100%; object-fit: cover; }
    .glyph { font-size: 22pt; color: var(--c); }
    .rib { font-size: 6.5pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--c); border-bottom: .3mm solid var(--c); padding-bottom: .6mm; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: .3mm 2mm; margin: 0; font-size: 7.5pt; }
    dt { color: #666; text-transform: uppercase; font-size: 6pt; letter-spacing: .06em; padding-top: .3mm; }
    dd { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    p { margin: 0; font-size: 7.5pt; color: #333; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; }
  </style></head><body><main>${cards}</main></body></html>`;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    // espera as imagens antes de abrir a impressão
    const doc = frame.contentDocument;
    const waits = [...(doc?.images ?? [])].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })));
    void Promise.all(waits).then(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1500);
    });
  };
  document.body.appendChild(frame);
}
