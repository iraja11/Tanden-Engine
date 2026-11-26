/*
 * O cofre das falas. As falas da Ânima moram encriptadas em `falas.dat.ts`
 * (para não estragar a surpresa de quem lê o código) e só são abertas na
 * primeira vez que ela fala. Para editar: `node scripts/anima-falas.mjs abrir`.
 *
 * É ofuscação, não segredo militar: a chave vai junto (ela precisa ler as
 * próprias falas). O algoritmo é o mesmo do script; mantenha os dois iguais.
 */
import { FALAS_DAT } from './falas.dat';
import type { Gesto, Humor, Intensidade } from './estado';

/**
 * Uma fala. Marcas: `i` intensidade mínima, `h` humores, `g` expressão,
 * `k` capítulo mínimo da relação, `c` consciência mínima (0 a 100).
 * O texto pode ter variação: {{a|b|c}} escolhe uma (e {{x|}} é opcional).
 */
export type Linha = string | { t: string; h?: Humor[]; i?: Intensidade; g?: Gesto; k?: number; c?: number };

export interface OpcaoPergunta {
  texto: string;
  /** o que ela diz na hora */
  reacao: string;
  /** o que ela lembra dias depois */
  lembra: string;
}

export interface Pergunta {
  id: string;
  texto: string;
  opcoes: OpcaoPergunta[];
}

export interface Banco {
  falas: Record<string, Linha[]>;
  perguntas: Pergunta[];
}

const KEY = 'tanden·ânima·yin·yang·⊘';

/** FNV-1a de 32 bits sobre os bytes UTF-8. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h;
}

function fluxo(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) & 0xff;
  };
}

export function abrirCofre(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  const k = fluxo(fnv(KEY));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) ^ k();
  return new TextDecoder().decode(bytes);
}

let cache: Banco | null = null;

/** As falas, abertas na primeira chamada. */
export function banco(): Banco {
  if (!cache) {
    const raw = JSON.parse(abrirCofre(FALAS_DAT)) as Partial<Banco>;
    cache = { falas: raw.falas ?? {}, perguntas: raw.perguntas ?? [] };
  }
  return cache;
}

/** Expande as variações {{a|b|c}} (de dentro para fora). */
export function variar(t: string, rand: () => number): string {
  let s = t;
  for (let i = 0; i < 8 && s.includes('{{'); i++) {
    // aceita {variáveis} dentro das opções: {{do sono de {personagem}|da vela}}
    s = s.replace(/\{\{((?:[^{}]|\{\w+\})*)\}\}/g, (_, alts: string) => {
      const ops = alts.split('|');
      return ops[Math.floor(rand() * ops.length)] ?? '';
    });
  }
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?…])/g, '$1').trim();
}

/** Texto de uma linha, sem as opções. */
export const textoDe = (l: Linha): string => (typeof l === 'string' ? l : l.t);
