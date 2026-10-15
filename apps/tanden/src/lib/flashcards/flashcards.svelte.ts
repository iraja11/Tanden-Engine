import {
  FLASHCARD_TAG, addFlashcardTag, appendCard, cardMarkdown, deckStats, forecast, nextSched, parseFlashcards, studyDay, studyQueue, writeSched,
  type Flashcard, type Grade, type Sched, type StudyItem,
} from '@tanden/core';
import { engine } from '../engine.svelte';
import { notes } from '../editor/notes.svelte';
import { files } from '../files/files.svelte';
import { feel } from '../feel.svelte';
import { sound } from '../sound.svelte';

/*
 * Flashcards: os cartões moram nas notas com #flashcards (formato do plugin
 * Spaced Repetition do Obsidian). Esta camada só lê o índice, monta a sessão
 * e grava o agendamento de volta na nota a cada resposta.
 */

const KEY = 'tanden.flashcards';
export const EXAMPLE_NOTE = 'Flashcards/Como usar.md';

interface Prefs {
  newLimit: number;
  /** quantos novos já entraram hoje neste aparelho */
  day: string;
  newDone: number;
}

function load(): Prefs {
  try {
    return { newLimit: 20, day: '', newDone: 0, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { newLimit: 20, day: '', newDone: 0 };
  }
}

interface Answer {
  item: StudyItem;
  prev: Sched | null;
  requeued: boolean;
  wasNew: boolean;
}

interface Session {
  /** baralho (null = todos) ou a nota estudada */
  deck: string | null;
  path: string | null;
  queue: StudyItem[];
  total: number;
  done: number;
  wrong: number;
  answers: Answer[];
  /** agendamento mais recente de cada lado respondido nesta sessão */
  latest: Map<string, Sched>;
}

const sideKey = (it: StudyItem) => `${it.group}\u0000${it.side}`;

class Flashcards {
  prefs = $state<Prefs>(load());
  session = $state<Session | null>(null);
  /** a resposta do cartão da vez está à mostra */
  shown = $state(false);
  /** outra tela pediu para abrir os flashcards */
  goto = $state(0);
  /** formulário de cartão novo aberto */
  adding = $state(false);
  private cache = new Map<string, { text: string; cards: Flashcard[] }>();

  /** Todos os cartões do cofre, relidos só nas notas que mudaram. */
  get cards(): Flashcard[] {
    void notes.rev;
    void engine.notes;
    const paths = notes.brain.withTag(FLASHCARD_TAG);
    const out: Flashcard[] = [];
    const keep = new Set<string>();
    for (const p of [...paths].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      if (!engine.vault.has(p)) continue;
      keep.add(p);
      const text = engine.vault.read(p);
      let hit = this.cache.get(p);
      if (!hit || hit.text !== text) this.cache.set(p, (hit = { text, cards: parseFlashcards(p, text) }));
      out.push(...hit.cards);
    }
    for (const p of [...this.cache.keys()]) if (!keep.has(p)) this.cache.delete(p);
    return out;
  }

  get day(): string {
    return studyDay(new Date());
  }

  /** Novos que ainda cabem hoje. */
  get newLeft(): number {
    const p = this.prefs;
    return Math.max(0, p.newLimit - (p.day === this.day ? p.newDone : 0));
  }

  get decks() {
    return deckStats(this.cards, this.day);
  }

  /** Para revisar agora (vencidos + novos que cabem hoje), no baralho ou em todos. */
  pending(deck: string | null = null, path: string | null = null): number {
    const cards = path ? this.cards.filter((c) => c.path === path) : this.cards;
    return studyQueue(cards, this.day, { deck, newLimit: this.newLeft }).length;
  }

  forecast(deck: string | null = null): number[] {
    return forecast(this.cards, this.day, 7, deck);
  }

  setNewLimit(n: number): void {
    this.prefs = { ...this.prefs, newLimit: Math.max(0, Math.min(999, Math.round(n) || 0)) };
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      // sem armazenamento: só não lembra
    }
  }

  // ---------------------------------------------------------------- sessão

  get current(): StudyItem | null {
    return this.session?.queue[0] ?? null;
  }

  /** Agendamento atual do lado da vez (já com as respostas desta sessão). */
  schedOf(it: StudyItem): Sched | null {
    return this.session?.latest.get(sideKey(it)) ?? it.card.sides[it.side]!.sched;
  }

  /** Como fica o próximo intervalo para cada resposta (para os botões). */
  preview(it: StudyItem): Sched[] {
    const prev = this.schedOf(it);
    return ([0, 1, 2, 3] as Grade[]).map((g) => nextSched(prev, g, this.day));
  }

  start(deck: string | null = null, path: string | null = null): boolean {
    const cards = path ? this.cards.filter((c) => c.path === path) : this.cards;
    const queue = studyQueue(cards, this.day, { deck, newLimit: this.newLeft });
    if (!queue.length) {
      files.say(path || deck ? 'Nada para revisar aqui agora.' : 'Nada para revisar agora. Volte amanhã!');
      return false;
    }
    this.session = { deck, path, queue, total: queue.length, done: 0, wrong: 0, answers: [], latest: new Map() };
    this.shown = false;
    sound.play('open');
    return true;
  }

  stop(): void {
    this.session = null;
    this.shown = false;
    sound.play('close');
  }

  reveal(): void {
    if (!this.current || this.shown) return;
    this.shown = true;
    sound.play('tick');
  }

  /** Grava o agendamento de um lado na nota. false se o cartão mudou na nota. */
  private store(it: StudyItem, sched: Sched | null): boolean {
    if (!engine.vault.has(it.card.path)) return false;
    const text = engine.vault.read(it.card.path);
    const out = writeSched(text, it.card.path, it.card, it.side, sched);
    if (out === null) return false;
    if (out !== text) feel.local(() => engine.writeNote(it.card.path, out));
    return true;
  }

  answer(grade: Grade): void {
    const s = this.session;
    const it = this.current;
    if (!s || !it || !this.shown) return;
    const prev = this.schedOf(it);
    const next = nextSched(prev, grade, this.day);
    const queue = s.queue.slice(1);
    if (!this.store(it, next)) {
      files.say('Esse cartão foi editado ou apagado na nota; pulei.', { path: it.card.path });
      s.queue = queue;
      s.total--;
      this.shown = false;
      if (!queue.length) this.finish();
      return;
    }
    const wasNew = !it.card.sides[it.side]!.sched && !s.latest.has(sideKey(it));
    if (wasNew) {
      const p = this.prefs;
      this.prefs = { ...p, day: this.day, newDone: (p.day === this.day ? p.newDone : 0) + 1 };
      this.save();
    }
    s.latest.set(sideKey(it), next);
    // errou: volta daqui a pouco, nesta mesma sessão
    const requeued = grade === 0;
    if (requeued) queue.splice(Math.min(3, queue.length), 0, it);
    else s.done++;
    if (grade === 0) s.wrong++;
    s.answers = [...s.answers, { item: it, prev, requeued, wasNew }];
    s.queue = queue;
    this.shown = false;
    sound.play(grade === 0 ? 'tick' : 'complete');
    if (!queue.length) this.finish();
  }

  /** Desfaz a última resposta: o agendamento anterior volta para a nota. */
  undo(): void {
    const s = this.session;
    const last = s?.answers[s.answers.length - 1];
    if (!s || !last) return;
    this.store(last.item, last.prev);
    const queue = [...s.queue];
    if (last.requeued) {
      const i = queue.findIndex((q) => sideKey(q) === sideKey(last.item));
      if (i >= 0) queue.splice(i, 1);
      s.wrong--;
    } else s.done--;
    if (last.prev) s.latest.set(sideKey(last.item), last.prev);
    else s.latest.delete(sideKey(last.item));
    if (last.wasNew) {
      this.prefs = { ...this.prefs, newDone: Math.max(0, this.prefs.newDone - 1) };
      this.save();
    }
    s.answers = s.answers.slice(0, -1);
    s.queue = [last.item, ...queue];
    this.shown = true;
    sound.play('tick');
  }

  private finish(): void {
    sound.play('complete');
  }

  // ---------------------------------------------------------------- criar

  /** Notas com cartões, para escolher onde guardar um cartão novo. */
  get notesWithCards(): string[] {
    void notes.rev;
    return [...notes.brain.withTag(FLASHCARD_TAG)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /** Guarda um cartão no fim da nota (criando Flashcards/<nome>.md se for nova). */
  add(target: string, front: string, back: string, reversed: boolean): string | null {
    if (!front.trim() || !back.trim()) return null;
    let path = target.trim();
    if (!path) return null;
    if (!path.endsWith('.md')) path = `Flashcards/${path.replace(/[\\/:*?"<>|#^[\]]/g, '-').trim()}.md`;
    const exists = engine.vault.has(path);
    const name = path.split('/').pop()!.replace(/\.md$/, '');
    const cur = exists ? engine.vault.read(path) : `# ${name}\n`;
    const text = appendCard(addFlashcardTag(cur), cardMarkdown(front, back, reversed));
    feel.local(() => engine.writeNote(path, text));
    sound.play('create');
    engine.pulse('notes', 'in');
    return path;
  }

  /** Põe #flashcards na nota, para os cartões dela entrarem no estudo. */
  markNote(path: string): void {
    const text = engine.vault.read(path);
    const out = addFlashcardTag(text);
    if (out === text) {
      files.say('Essa nota já está nos flashcards.');
      return;
    }
    feel.local(() => engine.writeNote(path, out));
    sound.play('create');
    files.say('Nota marcada com #flashcards. Escreva "pergunta::resposta" e ela entra no estudo.');
  }

  /** Cria (ou abre) uma nota curta com cada tipo de cartão, para aprender o formato. */
  example(): string {
    if (!engine.vault.has(EXAMPLE_NOTE)) {
      feel.local(() => engine.writeNote(EXAMPLE_NOTE, EXAMPLE));
      sound.play('create');
    }
    return EXAMPLE_NOTE;
  }
}

const EXAMPLE = `---
tags: [flashcards]
---
# Como usar os flashcards

Toda nota com a tag \`#flashcards\` entra no estudo. Use \`#flashcards/idiomas/inglês\` para separar em baralhos. É o mesmo formato do plugin Spaced Repetition do Obsidian.

## Uma linha

Capital do Japão::Tóquio
Cachorro em inglês:::Dog

(Com três dois-pontos, o cartão também é estudado ao contrário.)

## Várias linhas

Quais são as três leis de Newton?
?
1. Inércia
2. F = m · a
3. Ação e reação

## Lacunas

A mitocôndria produz ==ATP== pela ==respiração celular==.

## Agendamento

Depois de cada revisão aparece um comentário como \`<!--SR:!2026-10-20,3,250-->\` no cartão. Ele guarda a próxima data, o intervalo em dias e a facilidade, e fica escondido na leitura.
`;

export const flashcards = new Flashcards();
