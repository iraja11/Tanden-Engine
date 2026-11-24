import { describe, expect, it } from 'vitest';
import { parseStyle, safeCss, styleAt, styleEdit, type StyleEdit } from '../src/index';

const apply = (text: string, e: StyleEdit) => text.slice(0, e.from) + e.insert + text.slice(e.to);

describe('estilo de texto (<span style>)', () => {
  it('embrulha a seleção e devolve a seleção no texto', () => {
    const t = 'um texto aqui';
    const e = styleEdit(t, 3, 8, { color: '#e5484d' });
    const out = apply(t, e);
    expect(out).toBe('um <span style="color: #e5484d">texto</span> aqui');
    expect(out.slice(e.anchor, e.head)).toBe('texto');
  });

  it('muda o span em volta em vez de aninhar, e tira quando fica vazio', () => {
    const t = 'um <span style="color: #e5484d">texto</span> aqui';
    const from = t.indexOf('texto');
    const e = styleEdit(t, from, from + 5, { size: '1.25em' });
    const out = apply(t, e);
    expect(out).toBe('um <span style="color: #e5484d; font-size: 1.25em">texto</span> aqui');
    const f2 = out.indexOf('texto');
    const e2 = styleEdit(out, f2, f2 + 5, { color: null, size: null });
    expect(apply(out, e2)).toBe('um texto aqui');
  });

  it('seleção que inclui as tags conta como o mesmo span', () => {
    const t = 'a <span style="font-family: serif">b</span> c';
    const e = styleEdit(t, 2, t.indexOf(' c'), { font: 'monospace' });
    expect(apply(t, e)).toBe('a <span style="font-family: monospace">b</span> c');
    expect(styleAt(t, 2, t.indexOf(' c'))).toEqual({ font: 'serif' });
  });

  it('várias linhas: um span por linha, marcas de lista fora', () => {
    const t = '- um\n- dois\n\n# três';
    const e = styleEdit(t, 0, t.length, { color: '#46a758' });
    expect(apply(t, e)).toBe('- <span style="color: #46a758">um</span>\n- <span style="color: #46a758">dois</span>\n\n# <span style="color: #46a758">três</span>');
  });

  it('só aceita propriedades e valores seguros', () => {
    expect(parseStyle('color: red; background: url(x); font-size: 2em; position: fixed')).toEqual({ color: 'red', size: '2em' });
    expect(safeCss('color: expression(alert(1)); font-family: serif')).toBe('font-family: serif');
  });
});
