/*
 * Estilo de trecho de texto (cor, tamanho, fonte) dentro de uma nota .md.
 *
 * Markdown não tem cor nem fonte; o jeito que o Obsidian (e qualquer leitor de
 * Markdown com HTML) entende é um <span style="…">. Então o Tanden grava:
 *
 *   <span style="color: #e5484d; font-size: 1.25em">texto</span>
 *
 * Só três propriedades, com valores conferidos: nada de CSS arbitrário entra
 * na tela (o estilo lido de uma nota passa por `safeCss`).
 */

export interface TextStyle {
  color?: string;
  /** tamanho relativo ao texto em volta, ex.: "1.25em" */
  size?: string;
  /** família genérica: serif, sans-serif, monospace, cursive */
  font?: string;
}

/** O que mudar: string põe, null tira, ausente mantém. */
export type StylePatch = { [K in keyof TextStyle]?: string | null };

export interface StyleEdit {
  from: number;
  to: number;
  insert: string;
  /** seleção depois da troca (o texto, sem as tags) */
  anchor: number;
  head: number;
}

const PROPS: Array<[keyof TextStyle, string, RegExp]> = [
  ['color', 'color', /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*[\d.,\s%]+\))$/i],
  ['size', 'font-size', /^\d{1,3}(\.\d{1,3})?(em|rem|px|%)$/],
  ['font', 'font-family', /^[\w\s,"'-]{1,80}$/],
];

/** Lê o `style` de um span, só com as propriedades e valores aceitos. */
export function parseStyle(css: string): TextStyle {
  const out: TextStyle = {};
  for (const decl of css.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const name = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    for (const [key, prop, ok] of PROPS) if (name === prop && ok.test(value)) out[key] = value;
  }
  return out;
}

/** Estilo → texto do atributo (vazio se não há nada). */
export function styleCss(s: TextStyle): string {
  return PROPS.filter(([key]) => s[key]).map(([key, prop]) => `${prop}: ${s[key]}`).join('; ');
}

/** O CSS de uma nota, limpo para ir para a tela. */
export const safeCss = (css: string): string => styleCss(parseStyle(css));

/** Um <span style> sem outras tags dentro (o que a prévia ao vivo desenha). */
export const STYLED_SPAN = /<span style="([^"<>]*)">([^<]*?)<\/span>/g;
const OPEN_BEFORE = /<span style="([^"<>]*)">$/;
const WHOLE = /^<span style="([^"<>]*)">([^<]*)<\/span>$/;
const CLOSE = '</span>';

function merge(base: TextStyle, patch: StylePatch): TextStyle {
  const out: TextStyle = { ...base };
  for (const [key] of PROPS) {
    const v = patch[key];
    if (v === null || v === '') delete out[key];
    else if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Marcas de bloco (lista, título, citação, tarefa) ficam fora do span, senão o Markdown quebra. */
const PREFIX = /^(\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?|#{1,6}\s+|>\s?)*)(.*?)(\s*)$/;

function rewrap(from: number, to: number, inner: string, style: TextStyle): StyleEdit {
  const css = styleCss(style);
  if (!css) return { from, to, insert: inner, anchor: from, head: from + inner.length };
  const open = `<span style="${css}">`;
  const lines = inner.split('\n');
  if (lines.length === 1) {
    const insert = `${open}${inner}${CLOSE}`;
    return { from, to, insert, anchor: from + open.length, head: from + open.length + inner.length };
  }
  // várias linhas: um span por linha (um span não atravessa parágrafos)
  const insert = lines
    .map((l) => {
      const m = PREFIX.exec(l)!;
      return m[2] ? `${m[1]}${open}${m[2]}${CLOSE}${m[3]}` : l;
    })
    .join('\n');
  return { from, to, insert, anchor: from, head: from + insert.length };
}

/**
 * Muda o estilo do trecho [from, to) de `text`. Se o trecho já está dentro de
 * um span (ou é um span inteiro), muda o estilo dele; senão, embrulha. Tirar
 * tudo desembrulha. Spans dentro da seleção são absorvidos pelo novo.
 */
export function styleEdit(text: string, from: number, to: number, patch: StylePatch): StyleEdit {
  const before = OPEN_BEFORE.exec(text.slice(Math.max(0, from - 300), from));
  if (before && text.startsWith(CLOSE, to)) {
    const a = from - before[0].length;
    return rewrap(a, to + CLOSE.length, text.slice(from, to), merge(parseStyle(before[1]!), patch));
  }
  const sel = text.slice(from, to);
  const whole = WHOLE.exec(sel);
  if (whole) return rewrap(from, to, whole[2]!, merge(parseStyle(whole[1]!), patch));
  const inner = sel.replace(/<span style="[^"<>]*">([^<]*?)<\/span>/g, '$1');
  return rewrap(from, to, inner, merge({}, patch));
}

/** Estilo do trecho selecionado (para marcar o que já está ativo no menu). */
export function styleAt(text: string, from: number, to: number): TextStyle {
  const before = OPEN_BEFORE.exec(text.slice(Math.max(0, from - 300), from));
  if (before && text.startsWith(CLOSE, to)) return parseStyle(before[1]!);
  const whole = WHOLE.exec(text.slice(from, to));
  return whole ? parseStyle(whole[1]!) : {};
}
