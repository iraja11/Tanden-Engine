import {
  SORTE_NOTE, SORTE_TEMPLATE, coinStreak, flipCoin, parseLists, removeList, setList, shakeEightBall,
  type CoinSide, type EightBallMood, type SorteList,
} from '@tanden/core';
import { engine } from '../engine.svelte';

/*
 * Tela Sorte: roleta, sorteio, moeda e bola 8. As listas salvas moram na nota
 * `Sorteios.md` (vão junto no sync e abrem no Obsidian); o histórico recente e
 * as escolhas da tela ficam só no aparelho.
 */

export type SorteTab = 'roleta' | 'sorteio' | 'moeda' | 'bola8';
export type SorteTool = 'roleta' | 'sorteio' | 'moeda' | 'bola8';

export interface SorteEntry {
  id: number;
  at: number;
  tool: SorteTool;
  /** o resultado, curto */
  text: string;
  /** de onde veio (nome da lista, pergunta feita) */
  detail?: string;
}

const KEY = 'tanden.sorte';
const MAX_LOG = 80;
const MAX_COIN = 200;

interface Saved {
  tab: SorteTab;
  wheel: string;
  wheelList: string;
  draw: string;
  log: SorteEntry[];
  coins: CoinSide[];
}

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

const DEFAULT_WHEEL = 'Pizza\nSushi\nHambúrguer\nComida caseira\nTaco\nMacarrão';

class Sorte {
  tab = $state<SorteTab>('roleta');
  /** opções da roleta, uma por linha */
  wheel = $state(DEFAULT_WHEEL);
  /** lista salva que a roleta está usando ('' = texto livre) */
  wheelList = $state('');
  /** nomes do sorteio, um por linha */
  draw = $state('');
  lists = $state<SorteList[]>([]);
  log = $state<SorteEntry[]>([]);
  coins = $state<CoinSide[]>([]);
  /** pedido para o App abrir a tela */
  goto = $state(0);
  private seq = 0;
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const s = load();
    this.tab = s.tab ?? 'roleta';
    this.wheel = typeof s.wheel === 'string' ? s.wheel : DEFAULT_WHEEL;
    this.wheelList = s.wheelList ?? '';
    this.draw = s.draw ?? '';
    this.log = Array.isArray(s.log) ? s.log.slice(0, MAX_LOG) : [];
    this.coins = Array.isArray(s.coins) ? s.coins.filter((c) => c === 'cara' || c === 'coroa').slice(-MAX_COIN) : [];
    this.seq = this.log.reduce((m, e) => Math.max(m, e.id), 0);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      if ((e.type === 'note.changed' || e.type === 'note.created' || e.type === 'note.deleted') && e.path === SORTE_NOTE) this.schedule();
      else if (e.type === 'sync.finished') this.schedule();
    });
    this.rebuild();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.rebuild();
    }, 200);
  }

  rebuild(): void {
    if (!engine.ready) return;
    this.lists = parseLists(this.note());
  }

  save(): void {
    try {
      const s: Saved = { tab: this.tab, wheel: this.wheel, wheelList: this.wheelList, draw: this.draw, log: this.log, coins: this.coins };
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // sem espaço: o histórico é descartável
    }
  }

  open(tab?: SorteTab): void {
    if (tab) this.tab = tab;
    this.save();
    this.goto++;
  }

  note(): string {
    return engine.vault.has(SORTE_NOTE) ? engine.vault.read(SORTE_NOTE) : '';
  }

  list(name: string): SorteList | undefined {
    return this.lists.find((l) => l.name === name);
  }

  /** Grava (ou troca) a lista na nota `Sorteios.md`, criando a nota se precisar. */
  saveList(name: string, items: string[]): void {
    const cur = engine.vault.has(SORTE_NOTE) ? this.note() : SORTE_TEMPLATE.replace(/\n## Almoço[\s\S]*$/, '\n');
    engine.writeNote(SORTE_NOTE, setList(cur, name, items));
    this.rebuild();
  }

  deleteList(name: string): void {
    if (!engine.vault.has(SORTE_NOTE)) return;
    engine.writeNote(SORTE_NOTE, removeList(this.note(), name));
    if (this.wheelList === name) this.wheelList = '';
    this.rebuild();
    this.save();
  }

  record(tool: SorteTool, text: string, detail?: string): SorteEntry {
    const e: SorteEntry = { id: ++this.seq, at: Date.now(), tool, text, detail };
    this.log = [e, ...this.log].slice(0, MAX_LOG);
    this.save();
    return e;
  }

  clearLog(): void {
    this.log = [];
    this.save();
  }

  /** Joga a moeda e guarda no histórico (a animação é da tela). */
  flip(): CoinSide {
    const side = flipCoin();
    this.coins = [...this.coins, side].slice(-MAX_COIN);
    const st = coinStreak(this.coins);
    this.record('moeda', side === 'cara' ? 'Cara' : 'Coroa', st && st.n > 2 ? `${st.n} seguidas` : undefined);
    return side;
  }

  resetCoins(): void {
    this.coins = [];
    this.save();
  }

  private lastAnswer = '';
  /** Pergunta à bola 8. */
  shake(question: string): { text: string; mood: EightBallMood } {
    const a = shakeEightBall(undefined, this.lastAnswer);
    this.lastAnswer = a.text;
    this.record('bola8', a.text, question.trim() || undefined);
    return a;
  }
}

export const sorte = new Sorte();

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
