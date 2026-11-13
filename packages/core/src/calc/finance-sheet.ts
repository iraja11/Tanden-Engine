import { fv, irr, npv, nper, pmt, pv, rate, type PayWhen } from '../financas';
import { math } from './math';

/*
 * Funções financeiras nas folhas, com os nomes do Excel em português:
 * pgto, vp, vf, nper, taxa, vpl e tir. A convenção de sinais é a do Excel
 * (o que entra é positivo, o que sai é negativo) e as taxas aceitam "1%".
 */

const when = (t: unknown): PayWhen => (Number(t ?? 0) ? 1 : 0);

/** [a, b, c], uma matriz do mathjs ou argumentos soltos → lista de números */
function flows(args: unknown[]): number[] {
  const out: number[] = [];
  const add = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object' && 'toArray' in v) add((v as { toArray(): unknown[] }).toArray());
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error('Os fluxos precisam ser números');
      out.push(n);
    }
  };
  args.forEach(add);
  if (!out.length) throw new Error('Faltam os fluxos de caixa');
  return out;
}

math.import(
  {
    pgto: (i: number, n: number, vpv: number, vfv?: number, t?: number) => pmt(i, n, vpv, vfv ?? 0, when(t)),
    vp: (i: number, n: number, p: number, vfv?: number, t?: number) => pv(i, n, p, vfv ?? 0, when(t)),
    vf: (i: number, n: number, p: number, vpv?: number, t?: number) => fv(i, n, p, vpv ?? 0, when(t)),
    nper: (i: number, p: number, vpv: number, vfv?: number, t?: number) => nper(i, p, vpv, vfv ?? 0, when(t)),
    taxa: (n: number, p: number, vpv: number, vfv?: number, t?: number) => rate(n, p, vpv, vfv ?? 0, when(t)),
    vpl: (i: number, ...rest: unknown[]) => npv(i, flows(rest)),
    tir: (...rest: unknown[]) => irr(flows(rest)),
  },
  { override: true },
);
