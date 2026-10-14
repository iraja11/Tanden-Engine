import { parsePlot, type PlotSpec } from './plot';
import { CalcSheet, type CalcResult } from './sheet';

/*
 * Cálculo dentro de uma nota Markdown.
 *
 * - Blocos ```calc avaliam cada linha; as variáveis passam de um bloco para o próximo.
 * - Blocos ```grafico desenham curvas com o que foi definido acima deles.
 * - Uma nota com "tipo: cálculo" nas propriedades é toda uma folha de cálculo:
 *   cada linha fora de blocos é avaliada, e títulos (#) separam os "total".
 * No Obsidian os blocos aparecem como código e o texto continua legível.
 */

export interface PlotBlock {
  /** linhas (base 0) da cerca de abertura e de fechamento */
  start: number;
  end: number;
  spec: PlotSpec;
}

export interface NoteCalc {
  /** resultado por linha (base 0) */
  results: Map<number, CalcResult>;
  plots: PlotBlock[];
  /** linhas dentro de blocos ```calc (base 0), com as cercas */
  blocks: { start: number; end: number }[];
  whole: boolean;
  sheet: CalcSheet;
}

const CALC_LANG = /^(calc|calculo|cálculo|calculadora|numerals)$/i;
const PLOT_LANG = /^(grafico|gráfico|plot|graph)$/i;
const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;

/** A nota inteira é uma folha de cálculo? (tipo: cálculo nas propriedades) */
export function isCalcNote(text: string): boolean {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return !!fm && /^tipo\s*:\s*["']?(c[aá]lculo|calculadora|calc)["']?\s*$/im.test(fm[1]!);
}

/** Uma linha de texto comum numa folha inteira: sem número nem operador, não vale acusar erro. */
const PROSE = /^[^\d=+*/^()[\]]*$/;

export function analyzeNote(text: string, sheet = new CalcSheet()): NoteCalc {
  const lines = text.split('\n');
  const whole = isCalcNote(text);
  const out: NoteCalc = { results: new Map(), plots: [], blocks: [], whole, sheet };
  let i = 0;
  if (/^---\s*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, k) => k > 0 && /^---\s*$/.test(l));
    if (end > 0) i = end + 1;
  }
  let fence: { kind: 'calc' | 'plot' | 'other'; start: number; mark: string; body: string[] } | null = null;
  let mathBlock = false;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1]![0] === fence.mark[0] && f[1]!.length >= fence.mark.length && !f[2]) {
        if (fence.kind === 'plot') out.plots.push({ start: fence.start, end: i, spec: parsePlot(fence.body, sheet) });
        if (fence.kind === 'calc') out.blocks.push({ start: fence.start, end: i });
        fence = null;
      } else if (fence.kind === 'calc') out.results.set(i, sheet.run(line));
      else if (fence.kind === 'plot') fence.body.push(line);
      continue;
    }
    if (f) {
      const lang = f[2] ?? '';
      const kind = CALC_LANG.test(lang) ? 'calc' : PLOT_LANG.test(lang) ? 'plot' : 'other';
      if (kind === 'calc' && !whole) sheet.resetSection();
      fence = { kind, start: i, mark: f[1]!, body: [] };
      continue;
    }
    if (!whole) continue;
    // folha inteira
    if (/^\s*\$\$/.test(line)) {
      const single = /^\s*\$\$.*\S.*\$\$\s*$/.test(line) && line.trim().length > 4;
      if (!single) mathBlock = !mathBlock;
      continue;
    }
    if (mathBlock) continue;
    if (/^#{1,6}\s/.test(line)) {
      sheet.resetSection();
      continue;
    }
    if (/^\s*(>|\||!\[|<)/.test(line)) continue;
    const body = line.replace(/^\s*[-*+]\s+(?=\D)/, '').replace(/^\s*- \[[ xX]\]\s+/, '');
    const r = sheet.run(body);
    if (r.kind === 'error' && PROSE.test(body)) out.results.set(i, { kind: 'text' });
    else out.results.set(i, r);
  }
  return out;
}
