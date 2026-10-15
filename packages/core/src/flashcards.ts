/*
 * Flashcards com repetição espaçada, escritos nas próprias notas.
 *
 * O formato é o do plugin Spaced Repetition do Obsidian, para a mesma pasta
 * funcionar nos dois apps:
 *   - a nota entra no estudo com a tag #flashcards (ou #flashcards/baralho);
 *   - "Pergunta::Resposta" numa linha; ":::" cria também o cartão invertido;
 *   - em várias linhas, a pergunta, uma linha só com "?" e a resposta
 *     ("??" cria também o invertido); o cartão vai até a linha em branco;
 *   - ==realce== num parágrafo vira lacuna (uma por realce);
 *   - o agendamento fica num comentário que o Obsidian esconde:
 *     <!--SR:!2026-10-20,3,250--> (data, intervalo em dias, facilidade).
 *
 * Nada fica fora das notas: revisar só reescreve esse comentário, e o sync
 * funde as revisões feitas no celular e no PC como qualquer outra edição.
 */
import { noteName } from './caderno/markdown';
import { maskedLines, scanNote } from './knowledge';
import { setProp, parseProps, splitFrontmatter, asList } from './caderno/frontmatter';
import { addDays, today } from './vida';

export const FLASHCARD_TAG = 'flashcards';
/** Data que o plugin do Obsidian usa para "ainda não estudado" num grupo com irmãos já agendados. */
export const NEW_DUMMY_DATE = '2000-01-01';
export const START_EASE = 250;
export const MIN_EASE = 130;
export const MAX_INTERVAL = 36500;

export interface Sched {
  /** AAAA-MM-DD */
  due: string;
  /** dias */
  interval: number;
  /** facilidade em %, 250 = 2,5x */
  ease: number;
}

export type CardKind = 'linha' | 'multilinha' | 'lacuna';

export interface CardSide {
  /** markdown mostrado antes de virar */
  front: string;
  /** markdown mostrado depois de virar */
  back: string;
  /** null = novo */
  sched: Sched | null;
}

export interface Flashcard {
  path: string;
  deck: string;
  kind: CardKind;
  /** primeira e última linha do texto do cartão (0 = primeira linha do arquivo) */
  line: number;
  end: number;
  /** linha do comentário de agendamento (-1 se ainda não tem) */
  schedLine: number;
  /** o comentário está no fim de uma linha com texto (e não numa linha só dele) */
  schedInline: boolean;
  /** texto do cartão sem o agendamento: é o que identifica o cartão depois de edições */
  source: string;
  /** títulos acima do cartão, do mais alto ao mais baixo */
  context: string[];
  /** um lado por cartão de estudo: invertidos e lacunas geram mais de um */
  sides: CardSide[];
}

const SR_ALL = /<!--SR:((?:![^,!>]+,[^,!>]+,[^,!>]+)+)-->/;
const SR_LINE = /^\s*<!--SR:(?:![^,!>]+,[^,!>]+,[^,!>]+)+-->\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const CLOZE = /(^|[^=])==(?!=)(\S(?:[^=\n]*?\S)?)==(?!=)/g;
const LIST = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/;

const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Lê o comentário <!--SR:...-->: um item por lado, null para os ainda novos. */
export function parseSched(comment: string): Array<Sched | null> {
  const m = SR_ALL.exec(comment);
  if (!m) return [];
  return m[1]!
    .split('!')
    .filter(Boolean)
    .map((part) => {
      const [due, iv, ez] = part.split(',').map((x) => x.trim());
      const interval = Math.round(Number(iv));
      const ease = Math.round(Number(ez));
      if (!due || !isDay(due) || due === NEW_DUMMY_DATE || !Number.isFinite(interval) || !Number.isFinite(ease)) return null;
      return { due, interval: Math.max(1, interval), ease: Math.max(MIN_EASE, ease) };
    });
}

/** Escreve o comentário (ou '' quando todos os lados são novos). */
export function formatSched(sides: Array<Sched | null>): string {
  const list = [...sides];
  while (list.length && !list[list.length - 1]) list.pop();
  if (!list.length) return '';
  return `<!--SR:${list.map((s) => (s ? `!${s.due},${s.interval},${s.ease}` : `!${NEW_DUMMY_DATE},1,${START_EASE}`)).join('')}-->`;
}

/** Baralho da nota (a parte depois de #flashcards/, ou o nome da nota), ou null se a nota não tem a tag. */
export function flashcardDeck(path: string, text: string): string | null {
  if (!text.includes(FLASHCARD_TAG)) return null;
  for (const t of scanNote(text).tags) {
    const low = t.toLowerCase();
    if (low === FLASHCARD_TAG) return noteName(path);
    if (low.startsWith(`${FLASHCARD_TAG}/`)) return t.slice(FLASHCARD_TAG.length + 1);
  }
  return null;
}

const stripSched = (l: string) => l.replace(SR_ALL, '').trimEnd();
const unlist = (l: string) => l.replace(LIST, '$1');
const plainClozes = (s: string) => s.replace(CLOZE, '$1$2');

/** Os cartões de uma nota com #flashcards. Notas sem a tag não têm cartões. */
export function parseFlashcards(path: string, text: string): Flashcard[] {
  const deck = flashcardDeck(path, text);
  if (deck === null) return [];
  const lines = text.split('\n');
  const { head } = splitFrontmatter(text);
  const bodyLine = head ? head.length + 2 : 0;
  const { text: masked, code } = maskedLines(lines, bodyLine);
  const cards: Flashcard[] = [];
  const context: string[] = [];
  let para: number[] = [];

  const flush = () => {
    if (para.length) readParagraph(para);
    para = [];
  };

  const readParagraph = (idx: number[]) => {
    const ctx = [...context];
    const srOnly = (i: number) => !code[i] && SR_LINE.test(lines[i]!);
    // 1) várias linhas: uma linha só com ? ou ??
    const sepAt = idx.findIndex((i) => !code[i] && /^\s*\?\??\s*$/.test(masked[i]!));
    if (sepAt > 0) {
      const sep = idx[sepAt]!;
      const reversed = masked[sep]!.trim() === '??';
      const q = idx.slice(0, sepAt).filter((i) => !srOnly(i));
      const rest = idx.slice(sepAt + 1);
      const schedIdx = rest.find((i) => srOnly(i) || (!code[i] && SR_ALL.test(lines[i]!)));
      const a = rest.filter((i) => !srOnly(i));
      if (!q.length || !a.length) return;
      const front = q.map((i) => stripSched(lines[i]!)).join('\n').trim();
      const back = a.map((i) => stripSched(lines[i]!)).join('\n').trim();
      if (!front || !back) return;
      const sched = schedIdx === undefined ? [] : parseSched(lines[schedIdx]!);
      const sides: CardSide[] = [{ front, back, sched: sched[0] ?? null }];
      if (reversed) sides.push({ front: back, back: front, sched: sched[1] ?? null });
      const own = idx.filter((i) => !srOnly(i));
      cards.push({
        path, deck, kind: 'multilinha', line: own[0]!, end: own[own.length - 1]!,
        schedLine: schedIdx ?? -1, schedInline: schedIdx !== undefined && !srOnly(schedIdx),
        source: own.map((i) => stripSched(lines[i]!)).join('\n').trim(), context: ctx, sides,
      });
      return;
    }
    // 2) uma linha: Pergunta::Resposta (ou ::: para os dois sentidos)
    let found = false;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k]!;
      if (code[i]) continue;
      const m = masked[i]!;
      const tri = m.indexOf(':::');
      const at = tri >= 0 ? tri : m.indexOf('::');
      if (at < 0) continue;
      const len = tri >= 0 ? 3 : 2;
      const raw = lines[i]!;
      const inline = SR_ALL.test(raw);
      const front = unlist(raw.slice(0, at)).trim();
      const back = stripSched(raw.slice(at + len)).trim();
      if (!front || !back) continue;
      found = true;
      const next = idx[k + 1];
      const schedIdx = inline ? i : next !== undefined && srOnly(next) ? next : -1;
      const sched = schedIdx >= 0 ? parseSched(lines[schedIdx]!) : [];
      const sides: CardSide[] = [{ front, back, sched: sched[0] ?? null }];
      if (tri >= 0) sides.push({ front: back, back: front, sched: sched[1] ?? null });
      cards.push({
        path, deck, kind: 'linha', line: i, end: i, schedLine: schedIdx, schedInline: inline,
        source: stripSched(raw).trim(), context: ctx, sides,
      });
    }
    if (found) return;
    // 3) lacunas: cada ==realce== do parágrafo vira um lado
    const own = idx.filter((i) => !srOnly(i));
    const spans: Array<{ i: number; from: number; to: number; inner: string }> = [];
    for (const i of own) {
      if (code[i]) continue;
      for (const m of masked[i]!.matchAll(CLOZE)) {
        const from = m.index! + m[1]!.length;
        const to = from + m[2]!.length + 4;
        spans.push({ i, from, to, inner: lines[i]!.slice(from + 2, to - 2) });
      }
    }
    if (!spans.length) return;
    const schedIdx = idx.find((i) => srOnly(i)) ?? own.find((i) => !code[i] && SR_ALL.test(lines[i]!));
    const sched = schedIdx === undefined ? [] : parseSched(lines[schedIdx]!);
    const render = (hide: number, reveal: boolean) =>
      own
        .map((i) => {
          let l = lines[i]!;
          // da direita para a esquerda, para as colunas continuarem valendo
          for (let s = spans.length - 1; s >= 0; s--) {
            const sp = spans[s]!;
            if (sp.i !== i) continue;
            const shown = s === hide ? (reveal ? `==${sp.inner}==` : '==[…]==') : sp.inner;
            l = l.slice(0, sp.from) + shown + l.slice(sp.to);
          }
          return stripSched(l);
        })
        .join('\n')
        .trim();
    cards.push({
      path, deck, kind: 'lacuna', line: own[0]!, end: own[own.length - 1]!,
      schedLine: schedIdx ?? -1, schedInline: schedIdx !== undefined && !srOnly(schedIdx),
      source: own.map((i) => stripSched(lines[i]!)).join('\n').trim(), context: ctx,
      sides: spans.map((_, s) => ({ front: render(s, false), back: render(s, true), sched: sched[s] ?? null })),
    });
  };

  for (let i = bodyLine; i < lines.length; i++) {
    const l = lines[i]!;
    if (!code[i]) {
      const h = HEADING.exec(l);
      if (h) {
        flush();
        const level = h[1]!.length;
        context.length = Math.min(context.length, level - 1);
        while (context.length < level - 1) context.push('');
        context.push(h[2]!);
        continue;
      }
      if (!l.trim()) {
        flush();
        continue;
      }
    }
    para.push(i);
  }
  flush();
  for (const c of cards) c.context = c.context.filter(Boolean);
  return cards;
}

/** O mesmo cartão no texto atual (depois de edições): mesmo texto e tipo, o mais perto da linha antiga. */
export function findCard(cards: readonly Flashcard[], card: Pick<Flashcard, 'source' | 'kind' | 'line'>): Flashcard | null {
  let best: Flashcard | null = null;
  for (const c of cards) {
    if (c.source !== card.source || c.kind !== card.kind) continue;
    if (!best || Math.abs(c.line - card.line) < Math.abs(best.line - card.line)) best = c;
  }
  return best;
}

/**
 * Grava o agendamento de um lado do cartão na nota. Devolve o texto novo,
 * ou null se o cartão não existe mais (foi editado ou apagado).
 */
export function writeSched(text: string, path: string, card: Pick<Flashcard, 'source' | 'kind' | 'line'>, side: number, sched: Sched | null): string | null {
  const cur = findCard(parseFlashcards(path, text), card);
  if (!cur || side < 0 || side >= cur.sides.length) return null;
  const all = cur.sides.map((s) => s.sched);
  all[side] = sched;
  const comment = formatSched(all);
  const lines = text.split('\n');
  if (cur.schedLine >= 0) {
    if (cur.schedInline) {
      const l = lines[cur.schedLine]!;
      lines[cur.schedLine] = comment ? l.replace(SR_ALL, comment) : l.replace(SR_ALL, '').trimEnd();
    } else if (comment) {
      lines[cur.schedLine] = comment;
    } else {
      lines.splice(cur.schedLine, 1);
    }
  } else if (comment) {
    if (cur.kind === 'linha') lines[cur.line] = `${lines[cur.line]!.trimEnd()} ${comment}`;
    else lines.splice(cur.end + 1, 0, comment);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------ agendamento

/** 0 errei, 1 difícil, 2 bom, 3 fácil */
export type Grade = 0 | 1 | 2 | 3;

const dayNum = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y!, m! - 1, dd!) / 86_400_000;
};
export const daysBetween = (from: string, to: string): number => Math.round(dayNum(to) - dayNum(from));

/**
 * SM-2 com os ajustes do plugin do Obsidian: o atraso conta a favor de quem
 * lembrou mesmo assim, "difícil" encurta e baixa a facilidade, "fácil" dá um bônus.
 */
export function nextSched(prev: Sched | null, grade: Grade, day: string): Sched {
  let interval: number;
  let ease = prev?.ease ?? START_EASE;
  if (!prev) {
    interval = [1, 1, 2, 4][grade]!;
    if (grade === 3) ease += 15;
  } else {
    const late = Math.max(0, daysBetween(prev.due, day));
    const good = Math.max(prev.interval + 1, Math.round(((prev.interval + late / 2) * ease) / 100));
    if (grade === 0) {
      interval = 1;
      ease -= 20;
    } else if (grade === 1) {
      interval = Math.max(1, Math.min(good - 1, Math.round((prev.interval + late / 4) * 1.2)));
      ease -= 15;
    } else if (grade === 2) {
      interval = good;
    } else {
      interval = Math.max(good + 1, Math.round(((prev.interval + late) * ease * 1.3) / 100));
      ease += 15;
    }
  }
  interval = Math.min(MAX_INTERVAL, Math.max(1, interval));
  return { due: addDays(day, interval), interval, ease: Math.max(MIN_EASE, ease) };
}

/** "1d", "12d", "3 sem", "4 m", "1,5 a" */
export function intervalLabel(days: number): string {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)} sem`;
  if (days < 365) return `${Math.round(days / 30)} m`;
  const y = Math.round((days / 365) * 10) / 10;
  return `${String(y).replace('.', ',')} a`;
}

// ------------------------------------------------------------------ sessão

export interface StudyItem {
  card: Flashcard;
  side: number;
  /** cartões do mesmo grupo (invertido, lacunas) têm a mesma chave de grupo */
  group: string;
}

export const groupKey = (c: Pick<Flashcard, 'path' | 'source'>) => `${c.path}\u0000${c.source}`;

export const isDue = (s: Sched | null, day: string): boolean => !!s && s.due <= day;

/** Baralho dentro de outro: "idiomas/inglês" está em "idiomas". */
export const inDeck = (deck: string, want: string | null): boolean =>
  !want || deck.toLowerCase() === want.toLowerCase() || deck.toLowerCase().startsWith(`${want.toLowerCase()}/`);

/**
 * Fila do estudo: primeiro os vencidos (os mais atrasados antes), depois os
 * novos na ordem das notas, até o limite. Só um lado de cada grupo por dia,
 * como no Anki, para o invertido não entregar a resposta.
 */
export function studyQueue(cards: readonly Flashcard[], day: string, opts: { deck?: string | null; newLimit?: number } = {}): StudyItem[] {
  const due: StudyItem[] = [];
  const fresh: StudyItem[] = [];
  // grupo com um lado respondido hoje (data - intervalo = hoje) espera até amanhã,
  // em qualquer aparelho, sem guardar nada além do próprio agendamento
  const seen = new Set<string>(cards.filter((c) => c.sides.some((s) => s.sched && addDays(s.sched.due, -s.sched.interval) === day)).map(groupKey));
  for (const card of cards) {
    if (!inDeck(card.deck, opts.deck ?? null)) continue;
    const group = groupKey(card);
    if (seen.has(group)) continue;
    card.sides.forEach((s, side) => {
      if (isDue(s.sched, day)) due.push({ card, side, group });
    });
  }
  due.sort((a, b) => a.card.sides[a.side]!.sched!.due.localeCompare(b.card.sides[b.side]!.sched!.due));
  const out: StudyItem[] = [];
  for (const it of due) {
    if (seen.has(it.group)) continue;
    seen.add(it.group);
    out.push(it);
  }
  const limit = opts.newLimit ?? Infinity;
  for (const card of cards) {
    if (fresh.length >= limit) break;
    if (!inDeck(card.deck, opts.deck ?? null)) continue;
    const group = groupKey(card);
    if (seen.has(group)) continue;
    const side = card.sides.findIndex((s) => !s.sched);
    if (side < 0) continue;
    seen.add(group);
    fresh.push({ card, side, group });
  }
  return [...out, ...fresh];
}

export interface DeckStats {
  deck: string;
  total: number;
  fresh: number;
  due: number;
  /** cartões com intervalo de 21 dias ou mais */
  mature: number;
  notes: string[];
}

/** Números de cada baralho (cada lado conta como um cartão). Ordem alfabética. */
export function deckStats(cards: readonly Flashcard[], day: string): DeckStats[] {
  const map = new Map<string, DeckStats>();
  for (const c of cards) {
    const key = c.deck.toLowerCase();
    let s = map.get(key);
    if (!s) map.set(key, (s = { deck: c.deck, total: 0, fresh: 0, due: 0, mature: 0, notes: [] }));
    if (!s.notes.includes(c.path)) s.notes.push(c.path);
    for (const side of c.sides) {
      s.total++;
      if (!side.sched) s.fresh++;
      else {
        if (side.sched.due <= day) s.due++;
        if (side.sched.interval >= 21) s.mature++;
      }
    }
  }
  return [...map.values()].sort((a, b) => a.deck.localeCompare(b.deck, 'pt-BR'));
}

/** Quantos lados vencem em cada um dos próximos dias (o índice 0 inclui os atrasados). */
export function forecast(cards: readonly Flashcard[], day: string, days = 7, deck: string | null = null): number[] {
  const out = new Array<number>(days).fill(0);
  for (const c of cards) {
    if (!inDeck(c.deck, deck)) continue;
    for (const s of c.sides) {
      if (!s.sched) continue;
      const d = Math.max(0, daysBetween(day, s.sched.due));
      if (d < days) out[d]!++;
    }
  }
  return out;
}

// ------------------------------------------------------------------ criar

/** Põe #flashcards (ou #flashcards/baralho) nas tags do topo da nota, se ainda não tiver. */
export function addFlashcardTag(text: string, deck = ''): string {
  const tag = deck.trim() ? `${FLASHCARD_TAG}/${deck.trim().replace(/\s+/g, '-')}` : FLASHCARD_TAG;
  if (flashcardDeck('x.md', text) !== null && !deck.trim()) return text;
  const tags = asList(parseProps(text).tags);
  const flat = tags.flatMap((t) => t.split(/[,\s]+/)).map((t) => t.replace(/^#/, '')).filter(Boolean);
  if (flat.some((t) => t.toLowerCase() === tag.toLowerCase())) return text;
  return setProp(text, 'tags', [...flat, tag]);
}

/** Texto de um cartão novo: uma linha quando cabe, senão o formato com "?". */
export function cardMarkdown(front: string, back: string, reversed = false): string {
  const f = front.trim();
  const b = back.trim();
  if (f.includes('\n') || b.includes('\n') || f.includes('::') || b.includes('::')) return `${f}\n${reversed ? '??' : '?'}\n${b}`;
  return `${f}${reversed ? ':::' : '::'}${b}`;
}

/** Acrescenta um cartão no fim da nota, separado por uma linha em branco. */
export function appendCard(text: string, card: string): string {
  const base = text.replace(/\s+$/, '');
  return base ? `${base}\n\n${card}\n` : `${card}\n`;
}

/** Hoje no fuso local (reexportado para quem só importa os flashcards). */
export const studyDay = (now = new Date()): string => today(now);
