/*
 * Ferramentas de sorte: roleta, sorteio de nomes e números, times, moeda e
 * bola 8. Tudo puro e com o gerador por parâmetro (o mesmo `fairRng` dos
 * dados), para os testes usarem uma semente.
 *
 * As listas salvas moram numa nota comum, uma seção por lista:
 *
 *   ## Almoço
 *   - Pizza
 *   - Sushi *2        peso 2: cai duas vezes mais
 *   - Marmita
 *
 * Assim o Obsidian abre e edita sem saber de nada.
 */

import { fairRng, type Rng } from '../rpg/dice';

export class SorteError extends Error {}

/** Inteiro em [0, n). */
export const randIndex = (n: number, rng: Rng = fairRng): number => Math.min(n - 1, Math.floor(rng() * n));

/** Escolhe um índice com chance proporcional ao peso. */
export function weightedIndex(weights: readonly number[], rng: Rng = fairRng): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (!(total > 0)) throw new SorteError('Nada para sortear.');
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    const w = Math.max(0, weights[i]!);
    if (r < w) return i;
    r -= w;
  }
  // arredondamento: o último com peso
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return i;
  return 0;
}

// ---------------------------------------------------------------- roleta

export interface WheelOption {
  label: string;
  weight: number;
}

/** Fatia da roleta em graus: 0 é o topo (onde fica o ponteiro), sentido horário. */
export interface WheelSlice extends WheelOption {
  start: number;
  end: number;
}

const WEIGHT = /\s+(?:\*|x|×)\s*(\d+(?:[.,]\d+)?)$/i;

/** Um item da lista: "Sushi *2" vira { label: "Sushi", weight: 2 }. */
export function parseOption(line: string): WheelOption | null {
  let s = line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, '').replace(/^\[[ xX]\]\s+/, '').trim();
  if (!s || s.startsWith('#') || s.startsWith('//')) return null;
  let weight = 1;
  const m = WEIGHT.exec(s);
  if (m) {
    weight = Number(m[1]!.replace(',', '.'));
    s = s.slice(0, m.index).trim();
  }
  if (!s || !(weight > 0)) return null;
  return { label: s, weight };
}

/**
 * Texto livre em opções: uma por linha, ou separadas por vírgula se vier
 * tudo numa linha só ("pizza, sushi, marmita").
 */
export function parseOptions(text: string): WheelOption[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const parts = lines.length === 1 && lines[0]!.includes(',') ? lines[0]!.split(',') : lines;
  return parts.map(parseOption).filter((o): o is WheelOption => !!o);
}

export function wheelSlices(options: readonly WheelOption[]): WheelSlice[] {
  const total = options.reduce((a, o) => a + o.weight, 0);
  if (!(total > 0)) return [];
  let at = 0;
  return options.map((o) => {
    const start = at;
    at += (o.weight / total) * 360;
    return { ...o, start, end: at };
  });
}

/** Qual fatia fica sob o ponteiro com a roleta girada `rotation` graus no sentido horário. */
export function sliceAt(slices: readonly WheelSlice[], rotation: number): number {
  const a = (((-rotation) % 360) + 360) % 360;
  const i = slices.findIndex((s) => a >= s.start && a < s.end);
  return i < 0 ? slices.length - 1 : i;
}

export interface Spin {
  index: number;
  /** quanto girar a partir de `from`, em graus (sempre positivo, várias voltas) */
  delta: number;
  /** rotação final absoluta */
  rotation: number;
}

/**
 * Sorteia a fatia (pelo peso) e calcula o giro até ela, parando num ponto
 * qualquer dentro da fatia (nunca na beirada, para não haver dúvida).
 */
export function spinWheel(options: readonly WheelOption[], opts: { from?: number; turns?: number; rng?: Rng } = {}): Spin {
  const rng = opts.rng ?? fairRng;
  const slices = wheelSlices(options);
  if (!slices.length) throw new SorteError('A roleta precisa de pelo menos uma opção.');
  const index = weightedIndex(slices.map((s) => s.weight), rng);
  const s = slices[index]!;
  const angle = s.start + (s.end - s.start) * (0.12 + rng() * 0.76);
  const from = opts.from ?? 0;
  const target = (((360 - angle) % 360) + 360) % 360;
  const cur = ((from % 360) + 360) % 360;
  const turns = opts.turns ?? 5 + randIndex(3, rng);
  const delta = turns * 360 + ((target - cur + 360) % 360);
  return { index, delta, rotation: from + delta };
}

// ---------------------------------------------------------------- sorteios

/** Embaralha (Fisher–Yates) sem mexer no original. */
export function shuffle<T>(items: readonly T[], rng: Rng = fairRng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randIndex(i + 1, rng);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Tira `n` itens sem repetir. */
export function drawFrom<T>(items: readonly T[], n: number, rng: Rng = fairRng): T[] {
  if (!items.length) throw new SorteError('A lista está vazia.');
  return shuffle(items, rng).slice(0, Math.max(0, Math.min(n, items.length)));
}

/** Divide em `k` times do mesmo tamanho (a diferença máxima é 1). */
export function splitTeams<T>(items: readonly T[], k: number, rng: Rng = fairRng): T[][] {
  const n = Math.floor(k);
  if (n < 1) throw new SorteError('Precisa de pelo menos um time.');
  if (items.length < n) throw new SorteError(`Só ${items.length} ${items.length === 1 ? 'nome' : 'nomes'} para ${n} times.`);
  const teams: T[][] = Array.from({ length: n }, () => []);
  shuffle(items, rng).forEach((x, i) => teams[i % n]!.push(x));
  return teams;
}

/** Números inteiros entre `min` e `max` (inclusive). */
export function drawNumbers(min: number, max: number, count: number, opts: { unique?: boolean; rng?: Rng } = {}): number[] {
  const rng = opts.rng ?? fairRng;
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw new SorteError('Intervalo inválido.');
  const n = Math.floor(count);
  if (n < 1) throw new SorteError('Sorteie pelo menos um número.');
  if (n > 10000) throw new SorteError('No máximo 10.000 números de uma vez.');
  const span = hi - lo + 1;
  const unique = opts.unique ?? true;
  if (unique && n > span) throw new SorteError(`Só existem ${span} números entre ${lo} e ${hi}.`);
  if (!unique) return Array.from({ length: n }, () => lo + randIndex(span, rng));
  // poucos de muitos: sorteia e descarta repetidos; muitos: embaralha o intervalo
  if (n * 4 < span) {
    const seen = new Set<number>();
    const out: number[] = [];
    while (out.length < n) {
      const x = lo + randIndex(span, rng);
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }
  return drawFrom(Array.from({ length: span }, (_, i) => lo + i), n, rng);
}

// ---------------------------------------------------------------- moeda

export type CoinSide = 'cara' | 'coroa';

export const flipCoin = (rng: Rng = fairRng): CoinSide => (rng() < 0.5 ? 'cara' : 'coroa');

/** Sequência atual: quantas vezes seguidas o último lado saiu. */
export function coinStreak(history: readonly CoinSide[]): { side: CoinSide; n: number } | null {
  const last = history.at(-1);
  if (!last) return null;
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === last; i--) n++;
  return { side: last, n };
}

// ---------------------------------------------------------------- bola 8

export type EightBallMood = 'sim' | 'talvez' | 'nao';

/** As 20 respostas clássicas: 10 sim, 5 talvez, 5 não. */
export const EIGHT_BALL: ReadonlyArray<{ text: string; mood: EightBallMood }> = [
  { text: 'É certo.', mood: 'sim' },
  { text: 'Decididamente sim.', mood: 'sim' },
  { text: 'Sem dúvida.', mood: 'sim' },
  { text: 'Sim, com certeza.', mood: 'sim' },
  { text: 'Pode contar com isso.', mood: 'sim' },
  { text: 'Do jeito que eu vejo, sim.', mood: 'sim' },
  { text: 'Provavelmente.', mood: 'sim' },
  { text: 'As perspectivas são boas.', mood: 'sim' },
  { text: 'Sim.', mood: 'sim' },
  { text: 'Os sinais apontam que sim.', mood: 'sim' },
  { text: 'Resposta nebulosa, tente de novo.', mood: 'talvez' },
  { text: 'Pergunte mais tarde.', mood: 'talvez' },
  { text: 'Melhor não te contar agora.', mood: 'talvez' },
  { text: 'Não dá para prever agora.', mood: 'talvez' },
  { text: 'Concentre-se e pergunte de novo.', mood: 'talvez' },
  { text: 'Não conte com isso.', mood: 'nao' },
  { text: 'Minha resposta é não.', mood: 'nao' },
  { text: 'Minhas fontes dizem que não.', mood: 'nao' },
  { text: 'As perspectivas não são boas.', mood: 'nao' },
  { text: 'Muito duvidoso.', mood: 'nao' },
];

/** Sacode a bola. Evita repetir a resposta anterior, que parece defeito. */
export function shakeEightBall(rng: Rng = fairRng, last?: string): { text: string; mood: EightBallMood } {
  const pool = EIGHT_BALL.filter((a) => a.text !== last);
  return pool[randIndex(pool.length, rng)]!;
}

// ---------------------------------------------------------------- listas salvas

export const SORTE_NOTE = 'Sorteios.md';

export interface SorteList {
  name: string;
  /** itens como estão na nota ("Sushi *2") */
  items: string[];
}

const HEAD = /^##\s+(.+?)\s*#*\s*$/;

/** As listas da nota: cada `## Título` com os itens (linhas com `-`, `*` ou número) abaixo. */
export function parseLists(md: string): SorteList[] {
  const out: SorteList[] = [];
  let cur: SorteList | null = null;
  for (const line of md.split(/\r?\n/)) {
    const h = HEAD.exec(line);
    if (h) {
      cur = { name: h[1]!, items: [] };
      out.push(cur);
      continue;
    }
    if (/^#\s/.test(line)) {
      cur = null;
      continue;
    }
    if (!cur) continue;
    const m = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*\S)\s*$/.exec(line);
    if (m) cur.items.push(m[1]!);
  }
  return out;
}

const listBlock = (name: string, items: readonly string[]) =>
  `## ${name}\n${items.map((i) => `- ${i.replace(/\n/g, ' ').trim()}`).filter((l) => l !== '- ').join('\n')}\n`;

/** Seções da nota: [início, fim) de cada `## ` (o fim é o próximo título de nível 1 ou 2). */
function sections(lines: string[]): Array<{ name: string; from: number; to: number }> {
  const out: Array<{ name: string; from: number; to: number }> = [];
  lines.forEach((l, i) => {
    const h = HEAD.exec(l);
    if (h || /^#\s/.test(l)) {
      const prev = out.at(-1);
      if (prev && prev.to < 0) prev.to = i;
      if (h) out.push({ name: h[1]!, from: i, to: -1 });
    }
  });
  const prev = out.at(-1);
  if (prev && prev.to < 0) prev.to = lines.length;
  return out;
}

/**
 * Grava a lista na nota: troca a seção de mesmo nome (sem mexer no resto) ou
 * acrescenta no fim.
 */
export function setList(md: string, name: string, items: readonly string[]): string {
  const title = name.trim().replace(/\s+/g, ' ');
  if (!title) throw new SorteError('A lista precisa de um nome.');
  const lines = md.split('\n');
  const sec = sections(lines).find((s) => s.name.toLowerCase() === title.toLowerCase());
  const block = listBlock(title, items);
  if (!sec) {
    const base = md.replace(/\s+$/, '');
    return `${base ? `${base}\n\n` : ''}${block}`;
  }
  // texto que não é item (uma explicação embaixo do título) fica
  const body = lines.slice(sec.from + 1, sec.to);
  const extra = body.filter((l) => l.trim() && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(l));
  const tail = sec.to < lines.length ? '\n' : '';
  const replaced = `${block}${extra.length ? `\n${extra.join('\n')}\n` : ''}${tail}`;
  return [...lines.slice(0, sec.from), replaced.replace(/\n$/, ''), ...lines.slice(sec.to)].join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Tira a seção da lista da nota. */
export function removeList(md: string, name: string): string {
  const lines = md.split('\n');
  const sec = sections(lines).find((s) => s.name.toLowerCase() === name.trim().toLowerCase());
  if (!sec) return md;
  return [...lines.slice(0, sec.from), ...lines.slice(sec.to)].join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

export const SORTE_TEMPLATE = `# Sorteios

Listas da tela **Sorte** (roleta e sorteio). Cada \`## título\` é uma lista; \`*2\` no fim de um item dá peso dobrado.

## Almoço
- Pizza
- Sushi
- Hambúrguer
- Comida caseira *2
`;
