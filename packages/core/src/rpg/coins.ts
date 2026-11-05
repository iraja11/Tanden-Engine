import { asText, type Props } from '../caderno/frontmatter';
import { findPropKey } from './sheet';

/*
 * Bolsa de moedas, guardada nas propriedades da ficha (como no Obsidian):
 *
 *   po: 12
 *   pp: 30
 *   pc: 7
 *
 * Valores do D&D 5e (e de quem segue a mesma conta): 1 po = 10 pp = 100 pc;
 * 1 pe = 5 pp; 1 pl = 10 po. Tudo é contado em peças de cobre por dentro,
 * para pagar com troco sem arredondar nada.
 */

export interface CoinType {
  key: 'pl' | 'po' | 'pe' | 'pp' | 'pc';
  label: string;
  /** valor em peças de cobre */
  value: number;
  aliases: string[];
}

/** Da maior para a menor. "pp" é prata (em português); platina é "pl". */
export const COINS: CoinType[] = [
  { key: 'pl', label: 'Platina', value: 1000, aliases: ['pl', 'platina', 'platinum'] },
  { key: 'po', label: 'Ouro', value: 100, aliases: ['po', 'ouro', 'gp', 'gold', 'peças de ouro', 'pecas de ouro'] },
  { key: 'pe', label: 'Electro', value: 50, aliases: ['pe', 'electro', 'electrum', 'ep'] },
  { key: 'pp', label: 'Prata', value: 10, aliases: ['pp', 'prata', 'sp', 'silver', 'peças de prata', 'pecas de prata'] },
  { key: 'pc', label: 'Cobre', value: 1, aliases: ['pc', 'cobre', 'cp', 'copper', 'peças de cobre', 'pecas de cobre'] },
];

export type CoinKey = CoinType['key'];
export type Coins = Record<CoinKey, number>;

export const noCoins = (): Coins => ({ pl: 0, po: 0, pe: 0, pp: 0, pc: 0 });

export interface Purse {
  coins: Coins;
  /** nome da propriedade de cada moeda na nota (para gravar no mesmo lugar) */
  keys: Record<CoinKey, string>;
  /** quais moedas estão escritas na nota */
  present: Record<CoinKey, boolean>;
  /** tem alguma moeda escrita na nota? */
  any: boolean;
}

const coinOf = (key: string): CoinType => COINS.find((c) => c.key === key)!;

/** Lê a bolsa das propriedades. Moedas que não estão lá contam zero. */
export function readPurse(props: Props): Purse {
  const coins = noCoins();
  const keys = {} as Record<CoinKey, string>;
  const present = { pl: false, po: false, pe: false, pp: false, pc: false };
  let any = false;
  for (const c of COINS) {
    const k = findPropKey(props, c.aliases);
    keys[c.key] = k ?? c.key;
    if (!k) continue;
    const m = /^\s*(\d+)/.exec(asText(props[k]).replace(/[.\s](?=\d{3}\b)/g, ''));
    coins[c.key] = m ? Number(m[1]) : 0;
    present[c.key] = true;
    any = true;
  }
  return { coins, keys, present, any };
}

/** Total em peças de cobre. */
export const coinsValue = (c: Coins): number => COINS.reduce((s, x) => s + c[x.key] * x.value, 0);

/**
 * Cobre em moedas, das maiores para as menores. `top` limita a maior moeda
 * usada (ex.: 'po'). Electro nunca entra no troco (quase ninguém usa).
 */
export function makeChange(cp: number, top: CoinKey = 'pl'): Coins {
  const out = noCoins();
  let rest = Math.max(0, Math.round(cp));
  const from = COINS.findIndex((c) => c.key === top);
  for (const c of COINS.slice(from).filter((x) => x.key !== 'pe')) {
    out[c.key] = Math.floor(rest / c.value);
    rest -= out[c.key] * c.value;
  }
  return out;
}

/**
 * Paga `cost` (em cobre) como uma pessoa pagaria: primeiro com as moedas
 * pequenas, depois quebra uma moeda maior e recebe o troco. Devolve a bolsa
 * nova, ou null se não dá.
 */
export function pay(have: Coins, cost: number): Coins | null {
  let owe = Math.max(0, Math.round(cost));
  if (coinsValue(have) < owe) return null;
  const left = { ...have };
  for (const c of [...COINS].reverse()) {
    const use = Math.min(left[c.key], Math.floor(owe / c.value));
    left[c.key] -= use;
    owe -= use * c.value;
  }
  if (owe > 0) {
    // sobrou dívida menor que qualquer moeda restante: quebra a menor que cobre
    const coin = [...COINS].reverse().find((c) => left[c.key] > 0 && c.value >= owe)!;
    left[coin.key] -= 1;
    // o troco vem em moedas menores que a quebrada
    const below = COINS[COINS.findIndex((c) => c.key === coin.key) + 1]?.key ?? 'pc';
    const change = makeChange(coin.value - owe, below);
    for (const c of COINS) left[c.key] += change[c.key];
  }
  return left;
}

/**
 * Gasta moedas escritas ("3 pp 5 pc"): se a bolsa tem essas moedas, paga com
 * elas mesmas; senão paga o valor com troco (`pay`). Null se não dá.
 */
export function spendCoins(have: Coins, written: Coins): Coins | null {
  if (COINS.every((c) => have[c.key] >= written[c.key])) {
    const out = { ...have };
    for (const c of COINS) out[c.key] -= written[c.key];
    return out;
  }
  return pay(have, coinsValue(written));
}

/** Soma moedas. */
export function addCoins(a: Coins, b: Partial<Coins>): Coins {
  const out = { ...a };
  for (const c of COINS) out[c.key] = Math.max(0, out[c.key] + (b[c.key] ?? 0));
  return out;
}

/**
 * Lê moedas escritas à mão, do jeito que vieram: "3 po 5 pp" → 3 po e 5 pp;
 * "1.500 po"; "40" (ouro); "2,5 po" → 2 po 5 pp. Devolve null se não entendeu.
 */
export function parseCoins(s: string): Coins | null {
  const text = s.trim().toLowerCase().replace(/(\d)\.(?=\d{3}\b)/g, '$1');
  if (!text) return null;
  const bag = noCoins();
  const put = (n: number, coin: CoinType) => {
    if (Number.isInteger(n)) bag[coin.key] += n;
    else {
      const extra = makeChange(Math.round(n * coin.value), coin.key);
      for (const c of COINS) bag[c.key] += extra[c.key];
    }
  };
  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    put(Number(text.replace(',', '.')), coinOf('po'));
    return bag;
  }
  let found = false;
  let rest = text;
  const re = /(\d+(?:[.,]\d+)?)\s*([a-zçãõáéíóú$]+(?:\s+de\s+[a-zç]+)?)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const word = m[2]!.trim();
    const coin = COINS.find((c) => c.aliases.includes(word) || c.aliases.includes(word.replace(/s$/, '')));
    if (!coin) return null;
    put(Number(m[1]!.replace(',', '.')), coin);
    rest = rest.replace(m[0], '');
    found = true;
  }
  if (!found || rest.replace(/[\s,e+]/g, '')) return null;
  return bag;
}

/** O mesmo valor em cobre ("12 po" → 1200), ou null. */
export function parseMoney(s: string): number | null {
  const c = parseCoins(s);
  return c ? coinsValue(c) : null;
}

/** "12 po 5 pp" (o jeito curto); zero vira "0 po". */
export function formatCoins(c: Coins): string {
  const parts = COINS.filter((x) => c[x.key]).map((x) => `${c[x.key].toLocaleString('pt-BR')} ${x.key}`);
  return parts.length ? parts.join(' ') : '0 po';
}

/** Cobre como texto, na moeda maior que fizer sentido (sem platina): 1234 → "12 po 3 pp 4 pc". */
export const formatMoney = (cp: number): string => formatCoins(makeChange(cp, 'po'));

/** Valor em ouro (com casas), para comparar: 1234 → 12.34. */
export const goldOf = (cp: number): number => cp / 100;

/**
 * Divide um tesouro entre `n` pessoas. Cada parte vem em moedas (ouro para
 * baixo) e o que não divide sobra (para o grupo decidir).
 */
export function splitLoot(cp: number, n: number): { each: Coins; eachCp: number; leftover: Coins; leftoverCp: number } {
  const people = Math.max(1, Math.floor(n));
  const eachCp = Math.floor(cp / people);
  const leftoverCp = cp - eachCp * people;
  return { each: makeChange(eachCp, 'po'), eachCp, leftover: makeChange(leftoverCp, 'po'), leftoverCp };
}

/** O que muda nas propriedades. Moeda que não estava na nota e continua zerada não entra. */
export function purseProps(p: Purse, next: Coins): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of COINS) {
    if (p.present[c.key] ? next[c.key] === p.coins[c.key] : next[c.key] === 0) continue;
    out[p.keys[c.key]] = String(next[c.key]);
  }
  return out;
}

export const coinLabel = (key: CoinKey): string => coinOf(key).label;
