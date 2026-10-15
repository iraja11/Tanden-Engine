import type { PlotSpec } from '@tanden/core/src/calc';
import { PlotView, type AnyPlot, type PlotOptions } from './plot-view';
import { Plot3DView } from './plot3d-view';

/** Cria o gráfico certo para o bloco: 3D se tiver superfície, curva ou pontos em 3D. */
export function makePlot(spec: PlotSpec, opts: PlotOptions): AnyPlot {
  const p = spec.dim === 3 ? new Plot3DView(opts) : new PlotView(opts);
  p.el.dataset.dim = String(spec.dim ?? 2);
  p.setSpec(spec);
  return p;
}

export const sameDim = (p: AnyPlot, spec: PlotSpec): boolean => p.el.dataset.dim === String(spec.dim ?? 2);
