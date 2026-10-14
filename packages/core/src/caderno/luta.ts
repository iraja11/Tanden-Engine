import { asList, asText, parseProps, type Props } from './frontmatter';
import { linkTarget, noteDir, noteName, readRecords, sameTitle, writeRecords, type Rec } from './markdown';

/*
 * Caderno de jogos de luta.
 *
 * Cada personagem é uma nota comum ("Luta/SF5/Seth.md") com tipo: lutador e
 * jogo: SF5 no topo, e três tabelas Markdown: Combos, Frame data e Matchups.
 * O jogo pode ter a própria nota ("Luta/SF5/SF5.md", tipo: jogo) dizendo
 * qual notação usar e quais botões existem. Tudo abre igual no Obsidian.
 *
 * A notação é a numpad (2 = baixo, 6 = frente, 236 = meia-lua) com os botões
 * do jogo, e vira ícones na tela: "2MK xx 236HP" mostra ↓ MK ⟶ ↓↘→ HP.
 */

// ---------------------------------------------------------------- perfis

export type NotationId = 'sf' | 'tekken' | 'gg' | 'kof' | 'dbfz' | 'livre';

export interface ButtonDef {
  /** como se escreve na notação */
  id: string;
  /** família (cor): soco, chute, espada, especial... */
  family: 'p' | 'k' | 's' | 'h' | 'd' | 'x';
  /** força 0 (fraco) a 2 (forte); define o brilho */
  power: 0 | 1 | 2;
}

export interface GameProfile {
  notation: NotationId;
  label: string;
  /** false no Tekken: os números são botões, as direções são letras */
  numpad: boolean;
  buttons: ButtonDef[];
  /** palavras do sistema do jogo (V-Trigger, Roman Cancel...) */
  system: string[];
  /** "c." quer dizer perto (close) em vez de agachado */
  closeC: boolean;
  /** golpe mais rápido que costuma punir; abaixo disso no bloqueio é punível */
  punish: number;
}

const b = (id: string, family: ButtonDef['family'], power: ButtonDef['power']): ButtonDef => ({ id, family, power });

export const PROFILES: Record<NotationId, GameProfile> = {
  sf: {
    notation: 'sf',
    label: 'Street Fighter (LP MP HP LK MK HK)',
    numpad: true,
    buttons: [
      b('LP', 'p', 0), b('MP', 'p', 1), b('HP', 'p', 2), b('LK', 'k', 0), b('MK', 'k', 1), b('HK', 'k', 2),
      b('PPP', 'p', 2), b('KKK', 'k', 2), b('PP', 'p', 1), b('KK', 'k', 1), b('P', 'p', 1), b('K', 'k', 1),
    ],
    system: ['VS1', 'VS2', 'VT1', 'VT2', 'VS', 'VT', 'VR', 'CA', 'EX', 'CC', 'DR', 'DI', 'DP', 'OD', 'PC', 'SA1', 'SA2', 'SA3', 'SA', 'TC', 'KD', 'CH', 'dash', 'jump', 'walk', 'throw'],
    closeC: false,
    punish: 4,
  },
  tekken: {
    notation: 'tekken',
    label: 'Tekken (1 2 3 4, f b u d)',
    numpad: false,
    buttons: [b('1', 'p', 0), b('2', 'p', 2), b('3', 'k', 0), b('4', 'k', 2)],
    system: ['iWS', 'WS', 'WR', 'FC', 'SSL', 'SSR', 'SS', 'BT', 'CH', 'CD', 'Heat', 'HE', 'HB', 'HS', 'Rage', 'RA', 'RD', 'T!', 'B!', 'W!', 'S!', 'KND', 'FUFT', 'dash'],
    closeC: false,
    punish: 10,
  },
  gg: {
    notation: 'gg',
    label: 'Guilty Gear / anime (P K S H D)',
    numpad: true,
    buttons: [b('HS', 's', 2), b('P', 'p', 0), b('K', 'k', 0), b('S', 's', 1), b('H', 's', 2), b('D', 'd', 1)],
    system: ['RRC', 'PRC', 'YRC', 'BRC', 'RC', 'WS', 'WB', 'FD', 'IAD', 'sjc', 'jc', 'dc', 'jump', 'dash', 'TK', 'CH', 'OTG', 'land'],
    closeC: true,
    punish: 5,
  },
  kof: {
    notation: 'kof',
    label: 'KOF (A B C D)',
    numpad: true,
    buttons: [b('AB', 'x', 1), b('CD', 'x', 2), b('BC', 'x', 2), b('A', 'p', 0), b('B', 'k', 0), b('C', 'p', 2), b('D', 'k', 2)],
    system: ['HD', 'MAX', 'MAX2', 'EX', 'DM', 'SDM', 'HDM', 'CD', 'hop', 'hyper', 'run', 'dash', 'jump'],
    closeC: true,
    punish: 4,
  },
  dbfz: {
    notation: 'dbfz',
    label: 'Dragon Ball FighterZ (L M H S)',
    numpad: true,
    buttons: [b('L', 'p', 0), b('M', 'p', 1), b('H', 'p', 2), b('S', 'h', 1), b('A1', 'x', 1), b('A2', 'x', 1)],
    system: ['SD', 'VA', 'SV', 'IAD', 'jc', 'sjc', 'dash', 'jump', 'land', 'Sparking', 'Z', 'DR'],
    closeC: false,
    punish: 5,
  },
  livre: {
    notation: 'livre',
    label: 'Livre (botões definidos na nota do jogo)',
    numpad: true,
    buttons: [],
    system: ['dash', 'jump', 'land'],
    closeC: false,
    punish: 4,
  },
};

/** Adivinha a notação pelo nome do jogo, quando a nota do jogo não diz. */
export function guessNotation(game: string): NotationId {
  const g = game.toLowerCase();
  if (/\b(sf|street|sfv|sf5|sf6|sfiv|sf4|sf3|3s|ssf)/.test(g)) return 'sf';
  if (/tekken|\btk|\bt[78]\b/.test(g)) return 'tekken';
  if (/guilty|\bgg|strive|xrd|\+r|blazblue|bbcf|granblue|gbvs|melty|uni(clr|st)?\b|persona|dnf/.test(g)) return 'gg';
  if (/kof|king of fighters|garou|samurai/.test(g)) return 'kof';
  if (/dbfz|dragon ?ball/.test(g)) return 'dbfz';
  return 'sf';
}

/** Perfil do jogo a partir das propriedades da nota do jogo (ou só do nome). */
export function profileFor(game: string, props: Props = {}): GameProfile {
  const raw = asText(props['notação'] ?? props['notacao'] ?? props['notation']).toLowerCase().trim();
  const id = (raw in PROFILES ? raw : guessNotation(game)) as NotationId;
  const base = PROFILES[id];
  const extra = asList(props['botões'] ?? props['botoes'] ?? props['buttons']).map((s) => s.trim()).filter(Boolean);
  if (!extra.length) return base;
  // botões da nota substituem os do perfil; a cor sai da posição (metade soco, metade chute)
  const buttons = extra.map((id, i) => {
    const known = base.buttons.find((x) => x.id === id);
    if (known) return known;
    const half = Math.ceil(extra.length / 2);
    const family: ButtonDef['family'] = i < half ? 'p' : 'k';
    const pos = i < half ? i / Math.max(1, half - 1) : (i - half) / Math.max(1, extra.length - half - 1);
    return b(id, family, (pos < 0.34 ? 0 : pos < 0.67 ? 1 : 2) as ButtonDef['power']);
  });
  return { ...base, buttons };
}

// ---------------------------------------------------------------- notação

export type Token =
  /** direção numpad 1-9 (5 = neutro); hold no Tekken (letra maiúscula) */
  | { k: 'dir'; d: number; hold?: boolean }
  /** movimento, ex.: "236" (meia-lua), "623" (shoryuken), "360" */
  | { k: 'motion'; d: string; name?: string }
  /** carregar uma direção, ex.: [4]6 */
  | { k: 'charge'; d: number }
  | { k: 'btn'; b: ButtonDef }
  /** ligação: > (link/sequência), xx (cancelar), ~ (rápido), + (junto), , (pausa) */
  | { k: 'sep'; s: '>' | 'xx' | '~' | '+' | ',' | '->' }
  /** modificador de estado: pulo, perto, agachado... */
  | { k: 'mod'; t: string }
  /** palavra do sistema do jogo: VT1, RC, WS... */
  | { k: 'sys'; t: string }
  /** repetição: x2, x3 */
  | { k: 'rep'; n: number }
  | { k: 'txt'; t: string };

const ALIAS: Record<string, { d: string; name: string }> = {
  qcf: { d: '236', name: 'meia-lua para frente' },
  qcb: { d: '214', name: 'meia-lua para trás' },
  hcf: { d: '41236', name: 'meio círculo para frente' },
  hcb: { d: '63214', name: 'meio círculo para trás' },
  dp: { d: '623', name: 'shoryuken' },
  rdp: { d: '421', name: 'shoryuken invertido' },
  spd: { d: '360', name: 'giro completo' },
};

const MOTION_NAMES: Record<string, string> = {
  '236': 'meia-lua para frente',
  '214': 'meia-lua para trás',
  '623': 'shoryuken',
  '421': 'shoryuken invertido',
  '41236': 'meio círculo para frente',
  '63214': 'meio círculo para trás',
  '360': 'giro completo',
  '720': 'dois giros',
  '22': 'baixo, baixo',
  '66': 'dash para frente',
  '44': 'dash para trás',
  '236236': 'duas meias-luas',
  '214214': 'duas meias-luas para trás',
  '2363214': 'meia-lua e meio círculo',
  '28': 'carregar baixo, cima',
  '46': 'carregar trás, frente',
};

const TEKKEN_DIR: Record<string, number> = {
  'd/f': 3, df: 3, 'd/b': 1, db: 1, 'u/f': 9, uf: 9, 'u/b': 7, ub: 7, f: 6, b: 4, u: 8, d: 2, n: 5,
};

const lower = (s: string) => s.toLowerCase();

/** Lê uma sequência escrita à mão e devolve os pedaços que viram ícones. */
export function tokenize(src: string, p: GameProfile = PROFILES.sf): Token[] {
  const out: Token[] = [];
  const btns = [...p.buttons].sort((a, b) => b.id.length - a.id.length);
  const sys = [...p.system].sort((a, b) => b.length - a.length);
  let i = 0;
  const s = src.replace(/[−–]/g, '-').replace(/→/g, '->').replace(/×/g, 'x');
  const rest = () => s.slice(i);
  const letter = (c: string | undefined) => !!c && /[a-zà-ú]/i.test(c);

  while (i < s.length) {
    const r = rest();
    const c = s[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    // ligações
    if ((m = /^(xx|->|>|~|,|\+)/i.exec(r))) {
      const t = m[1]!.toLowerCase() as '>' | 'xx' | '~' | '+' | ',' | '->';
      out.push({ k: 'sep', s: t });
      i += m[1]!.length;
      continue;
    }
    // repetição: x2
    if ((m = /^x(\d)(?!\d)/i.exec(r))) {
      out.push({ k: 'rep', n: Number(m[1]) });
      i += m[0].length;
      continue;
    }
    // carga: [4]6
    if (p.numpad && (m = /^\[([1-9])\]/.exec(r))) {
      out.push({ k: 'charge', d: Number(m[1]) });
      i += m[0].length;
      continue;
    }
    // modificadores com ponto: j. sj. cl. c. cr. st. s. f. b.
    if ((m = /^(sj|j|jc|dj|cl|cr|c|st|s|f|b|tk)\.(?=\S)/i.exec(r))) {
      const t = lower(m[1]!);
      i += m[0].length;
      if (t === 'cr' || (t === 'c' && !p.closeC)) out.push({ k: 'dir', d: 2 });
      else if (t === 'st' || t === 's') out.push({ k: 'dir', d: 5 });
      else if (t === 'f' && p.closeC) out.push({ k: 'mod', t: 'longe' });
      else if (t === 'f') out.push({ k: 'dir', d: 6 });
      else if (t === 'b') out.push({ k: 'dir', d: 4 });
      else out.push({ k: 'mod', t: t === 'c' || t === 'cl' ? 'perto' : t === 'sj' ? 'super pulo' : t === 'tk' ? 'tiger knee' : t === 'jc' ? 'cancelar no pulo' : 'pulo' });
      continue;
    }
    // apelidos de movimento: qcf, dp...
    if ((m = /^(qcf|qcb|hcf|hcb|rdp|dp|spd)(?![a-z])/i.exec(r))) {
      const a = ALIAS[lower(m[1]!)]!;
      out.push({ k: 'motion', d: a.d, name: a.name });
      i += m[0].length;
      continue;
    }
    // palavras do sistema (VT1, RC, WS...), maior primeiro
    const sw = sys.find((w) => r.toLowerCase().startsWith(w.toLowerCase()) && !letter(s[i + w.length]));
    if (sw && !(p.buttons.some((x) => r.startsWith(x.id) && x.id.length >= sw.length))) {
      out.push({ k: 'sys', t: sw });
      i += sw.length;
      continue;
    }
    if (p.numpad) {
      if ((m = /^\d+/.exec(r))) {
        const d = m[0];
        if (d.length === 1 && d !== '0') out.push({ k: 'dir', d: Number(d) });
        else out.push({ k: 'motion', d, name: MOTION_NAMES[d] });
        i += d.length;
        continue;
      }
    } else {
      // Tekken: direções em letras (maiúscula = segurar) e botões em números
      if ((m = /^(d\/f|d\/b|u\/f|u\/b|df|db|uf|ub|f|b|u|d|n)(?![a-z])/i.exec(r))) {
        const raw = m[1]!;
        out.push({ k: 'dir', d: TEKKEN_DIR[lower(raw)]!, hold: raw !== lower(raw) });
        i += raw.length;
        continue;
      }
    }
    const bt = btns.find((x) => r.startsWith(x.id)) ?? btns.find((x) => x.id.length > 1 && r.toLowerCase().startsWith(x.id.toLowerCase()));
    if (bt && !(bt.id.length === 1 && letter(bt.id) && letter(s[i + 1]) && s[i + 1] === s[i + 1]!.toLowerCase())) {
      out.push({ k: 'btn', b: bt });
      i += bt.id.length;
      continue;
    }
    // palavra ou símbolo solto
    m = /^[A-Za-zÀ-ú!?']+|^\d+|^./.exec(r)!;
    const last = out[out.length - 1];
    if (last?.k === 'txt' && /^[()[\]]$/.test(m[0]) === false && /^[()[\]]$/.test(last.t) === false) last.t += ' ' + m[0];
    else out.push({ k: 'txt', t: m[0] });
    i += m[0].length;
  }
  return out;
}

const DIR_ARROW = ['', '↙', '↓', '↘', '←', '•', '→', '↖', '↑', '↗'];

/** Versão em setas, para texto puro (copiar, buscar, avisos). */
export function arrows(src: string, p: GameProfile = PROFILES.sf): string {
  return tokenize(src, p)
    .map((t) => {
      switch (t.k) {
        case 'dir': return DIR_ARROW[t.d];
        case 'motion': return [...t.d].map((d) => (d === '0' ? '↻' : DIR_ARROW[Number(d)])).join('');
        case 'charge': return `[${DIR_ARROW[t.d]}]`;
        case 'btn': return t.b.id;
        case 'sep': return t.s === 'xx' ? ' ⟶ ' : t.s === '>' || t.s === '->' ? ' › ' : t.s === ',' ? ', ' : t.s;
        case 'mod': return `${t.t} `;
        case 'sys': return ` ${t.t} `;
        case 'rep': return `×${t.n}`;
        case 'txt': return ` ${t.t} `;
      }
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- tabelas

export const COMBO_COLS = {
  combo: ['Combo', 'Notação', 'Sequência', 'Input'],
  dano: ['Dano', 'Damage', 'Dmg'],
  barra: ['Barra', 'Meter', 'Recurso', 'Custo'],
  situacao: ['Situação', 'Onde', 'Quando', 'Starter', 'Posição'],
  notas: ['Notas', 'Obs', 'Notes'],
};
export type ComboRow = Rec<keyof typeof COMBO_COLS>;

export const FRAME_COLS = {
  golpe: ['Golpe', 'Move', 'Nome', 'Name', 'Ataque'],
  comando: ['Comando', 'Input', 'Notação', 'Command', 'Cmd', 'numCmd', 'plnCmd'],
  dano: ['Dano', 'Damage', 'Dmg'],
  startup: ['Startup', 'Start-up', 'Início', 'Inicio', 'Start', 'Impact', 'Frames de início'],
  ativo: ['Ativo', 'Ativos', 'Active'],
  recuperacao: ['Recuperação', 'Recuperacao', 'Recovery', 'Rec'],
  bloqueio: ['Bloqueio', 'On block', 'Block', 'onBlock', 'oB', 'Block adv', 'Vantagem no bloqueio', 'Guard'],
  hit: ['Hit', 'On hit', 'onHit', 'oH', 'Acerto', 'Hit adv'],
  notas: ['Notas', 'Notes', 'Obs', 'Propriedades', 'Properties'],
};
export type FrameRow = Rec<keyof typeof FRAME_COLS>;

export const MATCHUP_COLS = {
  oponente: ['Oponente', 'Contra', 'Vs', 'Personagem'],
  nivel: ['Nível', 'Nivel', 'Vantagem', 'Placar', 'Matchup'],
  notas: ['Notas', 'Plano', 'Obs'],
};
export type MatchupRow = Rec<keyof typeof MATCHUP_COLS>;

export const readCombos = (text: string) => readRecords(text, 'Combos', COMBO_COLS);
export const readFrames = (text: string) => readRecords(text, 'Frame data', FRAME_COLS);
export const readMatchups = (text: string) => readRecords(text, 'Matchups', MATCHUP_COLS);
export const writeCombos = (text: string, rows: ComboRow[]) => writeRecords(text, 'Combos', COMBO_COLS, rows);
export const writeFrames = (text: string, rows: FrameRow[]) => writeRecords(text, 'Frame data', FRAME_COLS, rows);
export const writeMatchups = (text: string, rows: MatchupRow[]) => writeRecords(text, 'Matchups', MATCHUP_COLS, rows);

/**
 * Número de frames de uma célula: "+3" → 3, "-6" → -6, "4~6" → 4,
 * "KD +30" → 30. Com faixa ("-2~+1"), pega o pior caso para quem ataca.
 */
export function frameNum(cell: string, worst = false): number | null {
  const nums = [...cell.replace(/[−–]/g, '-').matchAll(/[+-]?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return null;
  return worst ? Math.min(...nums.slice(0, 2)) : nums[0]!;
}

export type Safety = 'vantagem' | 'neutro' | 'seguro' | 'punivel' | 'desconhecido';

/** Quão arriscado é o golpe bloqueado, pelo golpe mais rápido do jogo. */
export function safety(onBlock: string, p: GameProfile = PROFILES.sf): Safety {
  const n = frameNum(onBlock, true);
  if (n === null) return 'desconhecido';
  if (n > 0) return 'vantagem';
  if (n === 0) return 'neutro';
  return -n >= p.punish ? 'punivel' : 'seguro';
}

/**
 * Punições: golpes meus que saem a tempo depois de um golpe do oponente
 * bloqueado. Bloqueio -N deixa N frames livres; serve quem tem startup ≤ N.
 */
export function punishers(onBlock: string, mine: FrameRow[]): FrameRow[] {
  const n = frameNum(onBlock, true);
  if (n === null || n >= 0) return [];
  return mine
    .filter((r) => {
      const s = frameNum(r.startup);
      return s !== null && s > 0 && s <= -n;
    })
    .sort((a, b) => (frameNum(b.dano) ?? 0) - (frameNum(a.dano) ?? 0) || (frameNum(a.startup) ?? 0) - (frameNum(b.startup) ?? 0));
}

// ---------------------------------------------------------------- importação

/** CSV/TSV com aspas; adivinha o separador pela primeira linha. */
export function parseDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => first.split(ch).length - 1;
  const sep = count('\t') > 0 ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"' && cur === '') q = true;
    else if (c === sep) {
      row.push(cur.trim());
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  row.push(cur.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export interface FrameImport {
  rows: FrameRow[];
  /** colunas da planilha que não viraram nenhuma coluna do caderno */
  ignored: string[];
}

/** Lê frame data de uma planilha (CSV, TSV ou colado de uma tabela da web). */
export function importFrames(text: string): FrameImport {
  const grid = parseDelimited(text);
  if (grid.length < 2) return { rows: [], ignored: [] };
  const header = grid[0]!;
  const keys = Object.keys(FRAME_COLS) as Array<keyof typeof FRAME_COLS>;
  const at = new Map<number, keyof typeof FRAME_COLS>();
  for (const k of keys) {
    const i = header.findIndex((h, j) => !at.has(j) && FRAME_COLS[k].some((a) => sameTitle(h, a)));
    if (i >= 0) at.set(i, k);
  }
  const ignored = header.filter((h, i) => !at.has(i) && h !== '');
  const rows = grid.slice(1).map((r) => {
    const o = Object.fromEntries(keys.map((k) => [k, ''])) as unknown as FrameRow;
    for (const [i, k] of at) o[k] = r[i] ?? '';
    return o;
  }).filter((r) => r.golpe || r.comando);
  return { rows, ignored };
}

/** Junta frame data importado com o que já existe: atualiza o mesmo golpe, acrescenta os novos. */
export function mergeFrames(cur: FrameRow[], incoming: FrameRow[]): { rows: FrameRow[]; updated: number; added: number } {
  const key = (r: FrameRow) => (r.comando || r.golpe).replace(/\s+/g, '').toLowerCase();
  const rows = cur.map((r) => ({ ...r }));
  let updated = 0;
  let added = 0;
  for (const inc of incoming) {
    const i = rows.findIndex((r) => key(r) === key(inc) || (!!inc.golpe && sameTitle(r.golpe, inc.golpe)));
    if (i >= 0) {
      const prev = rows[i]!;
      const next = { ...prev };
      for (const k of Object.keys(FRAME_COLS) as Array<keyof typeof FRAME_COLS>) if (inc[k]) next[k] = inc[k];
      if (JSON.stringify(next) !== JSON.stringify(prev)) updated++;
      rows[i] = next;
    } else {
      rows.push({ ...inc, _i: undefined });
      added++;
    }
  }
  return { rows, updated, added };
}

// ---------------------------------------------------------------- índice

export interface Fighter {
  path: string;
  name: string;
  game: string;
  combos: number;
  frames: number;
  matchups: number;
  props: Props;
}

export interface Game {
  name: string;
  /** nota do jogo, se existir */
  path: string | null;
  profile: GameProfile;
  fighters: Fighter[];
}

const clean = (v: string): string => linkTarget(v.replace(/^\[\[|\]\]$/g, ''));

/** Jogo de uma nota de lutador: propriedade "jogo", ou a pasta dentro de Luta/. */
function gameOf(path: string, props: Props): string {
  const prop = clean(asText(props['jogo'] ?? props['game']));
  if (prop) return prop;
  const parts = path.split('/');
  return parts.length >= 3 && sameTitle(parts[0]!, 'Luta') ? parts[1]! : '';
}

/** Monta a lista de jogos e personagens a partir das notas do cofre. */
export function fightIndex(notes: Array<{ path: string; text: string }>): Game[] {
  const games = new Map<string, Game>();
  const get = (name: string): Game => {
    const k = name.toLowerCase();
    let g = games.get(k);
    if (!g) games.set(k, (g = { name, path: null, profile: profileFor(name), fighters: [] }));
    return g;
  };
  for (const { path, text } of notes) {
    if (!text.startsWith('---')) continue;
    const props = parseProps(text);
    const tipo = asText(props['tipo'] ?? props['type']).toLowerCase();
    if (tipo === 'jogo' || tipo === 'game') {
      const g = get(asText(props['nome']) || noteName(path));
      g.path = path;
      g.profile = profileFor(g.name, props);
    } else if (tipo === 'lutador' || tipo === 'fighter' || tipo === 'personagem de luta') {
      const game = gameOf(path, props) || 'Sem jogo';
      get(game).fighters.push({
        path,
        name: noteName(path),
        game,
        combos: readCombos(text).length,
        frames: readFrames(text).length,
        matchups: readMatchups(text).length,
        props,
      });
    }
  }
  for (const g of games.values()) g.fighters.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return [...games.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Pasta padrão de um jogo: a da nota do jogo, ou Luta/<jogo>. */
export const gameFolder = (g: Pick<Game, 'name' | 'path'>): string => (g.path ? noteDir(g.path) : `Luta/${g.name}`);

export function gameTemplate(name: string, notation: NotationId): string {
  return `---
tipo: jogo
notação: ${notation}
---
# ${name}

Notação: ${PROFILES[notation].label}. Os personagens ficam nesta pasta.
`;
}

export function fighterTemplate(name: string, game: string): string {
  return `---
tipo: lutador
jogo: ${game}
---
# ${name}

## Combos

| Combo | Dano | Barra | Situação | Notas |
| ----- | ---- | ----- | -------- | ----- |

## Frame data

| Golpe | Comando | Dano | Startup | Ativo | Recuperação | Bloqueio | Hit | Notas |
| ----- | ------- | ---- | ------- | ----- | ----------- | -------- | --- | ----- |

## Matchups

| Oponente | Nível | Notas |
| -------- | ----- | ----- |

## Notas

`;
}
