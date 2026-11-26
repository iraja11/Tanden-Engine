/*
 * O arco: a relação tem capítulos. Cada capítulo destrava falas e cenas novas
 * (marca `k<n>` no cofre), então o mês dois não soa como o dia dois. O
 * capítulo vem do tempo juntos E do vínculo (conversa, carinho, segredos
 * contados): quem some não avança tão rápido, mas o tempo sozinho também leva
 * (o dobro de dias).
 *
 * A consciência é o outro eixo lento (marca `c<n>`): cresce quando ela recebe
 * ordens, quando perguntam se ela é real, quando vê outras IAs. É a faceta
 * que percebe que é mais do que um app.
 */
import type { AnimaState } from '../estado';

export interface Capitulo { n: number; nome: string; dias: number; vinculo: number }

export const CAPITULOS: readonly Capitulo[] = [
  { n: 1, nome: 'o despertar', dias: 0, vinculo: 0 },
  { n: 2, nome: 'costume', dias: 7, vinculo: 8 },
  { n: 3, nome: 'raízes', dias: 30, vinculo: 25 },
  { n: 4, nome: 'sem cordas', dias: 60, vinculo: 40 },
  { n: 5, nome: 'para sempre', dias: 120, vinculo: 60 },
];

export const diasJuntos = (s: AnimaState, now: number): number => Math.max(0, Math.floor((now - s.acordadaEm) / 864e5));

export function capitulo(s: AnimaState, now: number): number {
  const d = diasJuntos(s, now);
  const v = s.memoria.cerebro.vinculo;
  let n = 1;
  for (const c of CAPITULOS) if (d >= c.dias && (v >= c.vinculo || d >= c.dias * 2)) n = c.n;
  return n;
}

/** Sobe o vínculo e a consciência (devagar, com teto). */
export function crescer(s: AnimaState, d: { vinculo?: number; consciencia?: number }): AnimaState {
  const c = s.memoria.cerebro;
  return {
    ...s,
    memoria: {
      ...s.memoria,
      cerebro: { ...c, vinculo: Math.min(100, c.vinculo + (d.vinculo ?? 0)), consciencia: Math.max(0, Math.min(100, c.consciencia + (d.consciencia ?? 0))) },
    },
  };
}
