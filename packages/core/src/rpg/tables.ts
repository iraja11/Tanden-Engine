import { bodyOf, parseProps, asText } from '../caderno/frontmatter';
import { noteName, sameTitle } from '../caderno/markdown';
import { fairRng, looksLikeDice, parseRoll, rollParsed, type Rng } from './dice';

/*
 * Tabelas de rolagem, escritas como Markdown comum em qualquer nota.
 *
 * 1. Tabela com dado no cabeçalho (o formato dos livros e do Dice Roller):
 *
 *      ## Encontros na estrada
 *      | d6  | Encontro                     |
 *      | --- | ---------------------------- |
 *      | 1-2 | {1d4+1} lobos famintos       |
 *      | 3   | Um mercador de [[Valdren]]   |
 *      | 4-6 | Nada; role {@Clima}          |
 *
 * 2. Listas numa nota com `tipo: tabela`: cada lista debaixo de um título é
 *    uma tabela em que todos os itens têm a mesma chance.
 *
 * O nome da tabela é o título logo acima dela (ou o nome da nota). Dentro
 * de um resultado, {2d4} rola dados e {@Outra tabela} rola outra tabela.
 */

export interface TableEntry {
  from: number;
  to: number;
  text: string;
}

export interface RollTable {
  /** "Caminho.md#Título" */
  id: string;
  path: string;
  /** título acima da tabela, ou o nome da nota */
  name: string;
  note: string;
  /** fórmula do cabeçalho; null nas listas (chances iguais) */
  dice: string | null;
  entries: TableEntry[];
  /** posição na nota (0 = a primeira) */
  order: number;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

function cellsOf(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}
const isRule = (l: string): boolean => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(l);

/** "3" → 3..3, "2-5" / "2–5" → 2..5, "00" → 100, "96-00" → 96..100, "11+" → 11..∞ */
export function parseRange(cell: string, max = 100): { from: number; to: number } | null {
  const s = cell.replace(/\*\*/g, '').replace(/[–—]/g, '-').trim();
  const num = (x: string) => (/^0+$/.test(x) && x.length >= 2 ? max : Number(x));
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(s))) {
    const a = num(m[1]!);
    const b = num(m[2]!);
    return a <= b ? { from: a, to: b } : null;
  }
  if ((m = /^(\d+)\s*\+$/.exec(s)) || (m = /^(\d+)\s*ou\s+mais$/i.exec(s))) return { from: Number(m[1]), to: Number.POSITIVE_INFINITY };
  if ((m = /^(\d+)$/.exec(s))) {
    const a = num(m[1]!);
    return { from: a, to: a };
  }
  return null;
}

/** Maior valor do dado do cabeçalho, para ler "00" como 100 num d100. */
function maxOf(dice: string): number {
  const m = /(\d*)\s*d\s*(\d+|%)/i.exec(dice);
  if (!m) return 100;
  return (m[1] ? Number(m[1]) : 1) * (m[2] === '%' ? 100 : Number(m[2]));
}

/** Todas as tabelas de rolagem de uma nota. */
export function findTables(path: string, text: string): RollTable[] {
  const note = noteName(path);
  const props = parseProps(text);
  const listsCount = sameTitle(asText(props['tipo'] ?? props['type']), 'tabela');
  const body = bodyOf(text);
  const lines = body.split('\n');
  const out: RollTable[] = [];
  let heading = note;
  let fence = false;
  let list: string[] | null = null;
  let listName = note;
  const used = new Map<string, number>();
  const push = (name: string, dice: string | null, entries: TableEntry[]) => {
    if (!entries.length) return;
    const n = (used.get(name.toLowerCase()) ?? 0) + 1;
    used.set(name.toLowerCase(), n);
    const shown = n > 1 ? `${name} ${n}` : name;
    out.push({ id: `${path}#${shown}`, path, name: shown, note, dice, entries, order: out.length });
  };
  const flushList = () => {
    if (list && list.length) push(listName, null, list.map((t, i) => ({ from: i + 1, to: i + 1, text: t })));
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (FENCE.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const h = HEADING.exec(l);
    if (h) {
      flushList();
      heading = h[2]!.replace(/\s\^[\w-]+$/, '');
      continue;
    }
    if (l.includes('|') && i + 1 < lines.length && isRule(lines[i + 1]!)) {
      flushList();
      const header = cellsOf(l);
      const first = header[0]!.replace(/\*\*/g, '');
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && lines[j]!.includes('|') && lines[j]!.trim()) rows.push(cellsOf(lines[j++]!));
      i = j - 1;
      if (!looksLikeDice(first)) continue;
      const max = maxOf(first);
      const entries: TableEntry[] = [];
      for (const r of rows) {
        const range = parseRange(r[0] ?? '', max);
        const textCells = r.slice(1).filter((c) => c !== '');
        if (!range || !textCells.length) continue;
        entries.push({ ...range, text: textCells.join(' — ') });
      }
      push(heading, first.replace(/\s+/g, ''), entries);
      continue;
    }
    if (listsCount) {
      // só os itens de primeiro nível; subitens são detalhes do item de cima
      const item = /^\s?(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l);
      if (item) {
        if (!list) {
          list = [];
          listName = heading;
        }
        const t = item[1]!.replace(/^\[[ xX]\]\s*/, '').trim();
        if (t) list.push(t);
        continue;
      }
      if (l.trim() && !/^\s{2,}/.test(l)) flushList();
    }
  }
  flushList();
  return out;
}

/** Tabelas do cofre inteiro. */
export function tableIndex(notes: Array<{ path: string; text: string }>): RollTable[] {
  const out: RollTable[] = [];
  for (const n of notes) {
    if (!n.text.includes('|') && !/tipo:\s*tabela/i.test(n.text)) continue;
    out.push(...findTables(n.path, n.text));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.path.localeCompare(b.path));
}

/**
 * Acha a tabela por "Nota#Título", "Título" ou "Nota" (sem acento nem
 * maiúsculas). Com nomes repetidos, prefere a da mesma nota.
 */
export function findTable(tables: RollTable[], ref: string, fromPath?: string): RollTable | null {
  // "[[Nota^id]]" (bloco, formato do Dice Roller) cai na primeira tabela da nota
  const r = ref.trim().replace(/^\[\[|\]\]$/g, '').split('|')[0]!.replace(/\^[\w-]+$/, '').trim();
  const [a, b] = r.includes('#') ? [r.slice(0, r.indexOf('#')), r.slice(r.indexOf('#') + 1)] : [r, null];
  const noteMatch = (t: RollTable, n: string) => sameTitle(t.note, n) || sameTitle(t.path.replace(/\.md$/i, ''), n) || sameTitle(t.path, n);
  let hits: RollTable[];
  if (b !== null) hits = tables.filter((t) => (!a || noteMatch(t, a)) && sameTitle(t.name, b));
  else {
    hits = tables.filter((t) => sameTitle(t.name, a));
    // só o nome da nota: a primeira tabela dela
    if (!hits.length) hits = tables.filter((t) => noteMatch(t, a)).sort((x, y) => x.order - y.order);
  }
  if (!hits.length) return null;
  return hits.find((t) => t.path === fromPath) ?? hits[0]!;
}

export interface TableRoll {
  table: RollTable;
  /** valor do dado (ou posição sorteada na lista) */
  value: number;
  /** resultado com os {dados} e {@tabelas} já rolados */
  text: string;
  /** linha como está escrita na nota */
  raw: string;
}

/** Rola os {2d4} e {@Tabela} de um texto. */
export function expandRolls(text: string, opts: { rng?: Rng; tables?: RollTable[]; from?: string; depth?: number } = {}): string {
  const depth = opts.depth ?? 0;
  return text.replace(/\{([^{}]+)\}/g, (whole, inner: string) => {
    const s = inner.trim();
    if (s.startsWith('@')) {
      const t = depth < 6 && opts.tables ? findTable(opts.tables, s.slice(1), opts.from) : null;
      return t ? rollTable(t, { ...opts, depth: depth + 1 }).text : whole;
    }
    try {
      return String(rollParsed(parseRoll(s), { rng: opts.rng })[0]!.total);
    } catch {
      return whole;
    }
  });
}

/** Rola na tabela. */
export function rollTable(t: RollTable, opts: { rng?: Rng; tables?: RollTable[]; depth?: number } = {}): TableRoll {
  const rng = opts.rng ?? fairRng;
  let value: number;
  let entry: TableEntry | undefined;
  if (t.dice) {
    value = rollParsed(parseRoll(t.dice), { rng })[0]!.total;
    entry = t.entries.find((e) => value >= e.from && value <= e.to);
  } else {
    value = 1 + Math.floor(rng() * t.entries.length);
    entry = t.entries[value - 1];
  }
  if (!entry) return { table: t, value, text: `(nada na tabela para ${value})`, raw: '' };
  return { table: t, value, raw: entry.text, text: expandRolls(entry.text, { rng, tables: opts.tables, from: t.path, depth: opts.depth ?? 0 }) };
}

/** Tabela de exemplo para começar (geradores comuns de mesa). */
export function starterTables(): string {
  return `---
tipo: tabela
tags: [rpg]
---
# Geradores

Cada lista abaixo é uma tabela: todos os itens têm a mesma chance. Tabelas com
um dado no cabeçalho (\`d6\`, \`d20\`, \`d100\`) usam as faixas da primeira coluna.
Dentro de um resultado, \`{2d4}\` rola dados e \`{@Nome da tabela}\` rola outra tabela.

## Nome
- {@Começo de nome}{@Fim de nome}

## Começo de nome
- Ael
- Bran
- Cael
- Dor
- Eli
- Fen
- Gar
- Hal
- Is
- Jor
- Kae
- Lir
- Mor
- Nyr
- Or
- Thal
- Val
- Zan

## Fim de nome
- dric
- wen
- ion
- ara
- mir
- oth
- iel
- unn
- essa
- ak
- ith
- or

## Taverna
- O {@Bicho} {@Adjetivo}
- A Caneca {@Adjetivo}
- {@Bicho} e {@Bicho}
- O Descanso do {@Bicho}

## Bicho
- Javali
- Corvo
- Grifo
- Dragão
- Texugo
- Lobo
- Bode

## Adjetivo
- Dourado
- Bêbado
- Risonho
- Manco
- Prateado
- Faminto
- Adormecido

## Jeito do NPC
- desconfiado, fala pouco e olha para as saídas
- simpático demais, quer algo em troca
- nervoso, esconde um segredo pequeno
- orgulhoso, se ofende com facilidade
- cansado, só quer terminar o dia
- curioso, faz perguntas sobre tudo
- supersticioso, vê presságios em qualquer coisa
- generoso e ingênuo

## Gancho
- Um mensageiro chega ferido com uma carta lacrada para alguém do grupo
- Crianças da vila somem uma por noite, sempre na lua nova
- Um mapa antigo aparece no meio de um livro comprado por acaso
- A guarda oferece {1d6*10} peças de ouro por um fugitivo que parece inocente
- Uma ponte essencial desabou, e há marcas de garras nas pedras
- Um nobre quer que alguém roube de volta o que ele mesmo vendeu

## Clima
| d6  | Clima                                   |
| --- | --------------------------------------- |
| 1-2 | Céu limpo                               |
| 3   | Vento forte                             |
| 4   | Chuva fina o dia todo                   |
| 5   | Neblina densa até o meio-dia            |
| 6   | Tempestade; viagem leva o dobro do tempo |

## Tesouro
| d20   | Tesouro                                  |
| ----- | ---------------------------------------- |
| 1-6   | {2d6} peças de cobre                     |
| 7-12  | {1d10+2} peças de prata                  |
| 13-17 | {1d6+1} peças de ouro e uma gema pequena |
| 18-19 | Uma poção de cura                        |
| 20    | Um item curioso: role {@Item curioso}    |

## Item curioso
- Uma bússola que aponta para o que você mais quer
- Um anel que esquenta perto de mentiras
- Uma vela que não apaga com vento
- Um dado que sempre cai no mesmo número quando ninguém olha
- Uma pena que escreve sozinha o que se ouve por perto
`;
}
