import type { Gesto } from '@tanden/core';
import { mount, tick, unmount } from 'svelte';
import Rosto from './Rosto.svelte';

/*
 * O retrato dela para as notificações: o mesmo rosto do widget, com a
 * expressão da fala, num camafeu escuro de 256 px. Desenhado uma vez por
 * expressão e cor (cache), em PNG base64.
 *
 * O SVG do rosto usa classes com estilo do Svelte; para virar imagem solta,
 * cada elemento recebe o estilo calculado como atributo antes de serializar.
 */

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'filter', 'display', 'visibility'] as const;
const LADO = 256;
const cache = new Map<string, string>();

function inlinar(orig: Element, copia: Element): void {
  const cs = getComputedStyle(orig);
  const estilo = PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';');
  copia.setAttribute('style', estilo);
  for (let i = 0; i < orig.children.length; i++) {
    const a = orig.children[i], b = copia.children[i];
    if (a && b) inlinar(a, b);
  }
}

function carregar(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = erro;
    img.src = url;
  });
}

/** O rosto com essa expressão, em PNG (base64 sem o prefixo). Null se não der para desenhar. */
export async function retrato(gesto: Gesto, cor: string): Promise<{ chave: string; png: string } | null> {
  const chave = `${gesto}-${cor.replace(/[^0-9a-f]/gi, '')}`;
  const pronto = cache.get(chave);
  if (pronto) return { chave, png: pronto };
  if (typeof document === 'undefined') return null;
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-10000px;top:0;width:200px;height:200px;pointer-events:none;';
  document.body.appendChild(caixa);
  const comp = mount(Rosto, { target: caixa, props: { gesto, cor, size: 200, anima: false } });
  try {
    await tick();
    const svg = caixa.querySelector('svg');
    if (!svg) return null;
    const copia = svg.cloneNode(true) as SVGSVGElement;
    inlinar(svg, copia);
    copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copia.setAttribute('width', '200');
    copia.setAttribute('height', '200');
    copia.style.setProperty('--cor', cor);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copia))}`;
    const img = await carregar(url);
    const cv = document.createElement('canvas');
    cv.width = cv.height = LADO;
    const g = cv.getContext('2d');
    if (!g) return null;
    // camafeu: fundo vinho escuro em degradê, aro na cor dela
    const fundo = g.createRadialGradient(LADO / 2, LADO * 0.42, LADO * 0.08, LADO / 2, LADO / 2, LADO * 0.62);
    fundo.addColorStop(0, '#3a1020');
    fundo.addColorStop(1, '#0c0609');
    g.fillStyle = fundo;
    g.beginPath();
    g.arc(LADO / 2, LADO / 2, LADO / 2, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(LADO / 2, LADO / 2, LADO / 2 - 6, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, 18, 22, LADO - 36, LADO - 36);
    g.restore();
    g.lineWidth = 6;
    g.strokeStyle = cor;
    g.beginPath();
    g.arc(LADO / 2, LADO / 2, LADO / 2 - 3, 0, Math.PI * 2);
    g.stroke();
    const png = cv.toDataURL('image/png').split(',')[1] ?? '';
    if (!png) return null;
    cache.set(chave, png);
    return { chave, png };
  } catch {
    return null;
  } finally {
    void unmount(comp);
    caixa.remove();
  }
}
