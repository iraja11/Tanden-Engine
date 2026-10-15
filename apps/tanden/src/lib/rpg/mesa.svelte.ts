import {
  DiceError, appendLog, campaignIndex, campaignTemplate, encounterTemplate, findTable, getSection, hasSheet, noteName,
  parseProps, readSheet, rollTable, roll, rollText, sessionTemplate, sheetVars, starterTables, tableIndex,
  type Campaign, type Die, type RollResult, type RollTable, type Resolver, type TableRoll,
} from '@tanden/core';
import { cadernos } from '../cadernos/cadernos.svelte';
import { engine } from '../engine.svelte';
import { files } from '../files/files.svelte';
import { sound } from '../sound.svelte';

/*
 * A mesa de RPG: rolagens, histórico, campanhas, tabelas e o pedido de
 * abrir a tela. Tudo que dura mora nas notas (campanhas, sessões, encontros,
 * fichas, tabelas); só o histórico recente e as escolhas da tela ficam no
 * aparelho.
 */

export type MesaTab = 'dados' | 'combate' | 'fichas' | 'tabelas' | 'sessoes';

export interface LogEntry {
  id: number;
  at: number;
  /** quem rolou (nome da ficha), se veio de uma ficha */
  who: string;
  kind: 'dados' | 'tabela';
  label: string;
  formula: string;
  total: number | string;
  detail: string;
  critical: 'max' | 'min' | null;
  /** nota de onde vieram os valores @ (para rolar de novo) */
  from?: string;
  /** os dados de cada grupo, para desenhar */
  groups?: Array<{ notation: string; sides: number; dice: Die[] }>;
}

const KEY = 'tanden.mesa';
const MAX_LOG = 120;

interface Saved {
  log: LogEntry[];
  campaign: string | null;
  session: string | null;
  recording: boolean;
  recent: string[];
  tab: MesaTab;
}

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** detalhe da rolagem sem marcação: descartados entre parênteses, sucessos sem negrito */
export const plainDetail = (d: string): string =>
  d.replace(/~~([^~]+)~~/g, '($1)').replace(/\*\*/g, '');

export const hhmm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

class Mesa {
  rev = $state(0);
  campaigns = $state<Campaign[]>([]);
  tables = $state<RollTable[]>([]);
  log = $state<LogEntry[]>([]);
  /** caminho da campanha escolhida */
  campaignPath = $state<string | null>(null);
  /** sessão aberta: as rolagens entram no "## Registro" dela, se `recording` */
  sessionPath = $state<string | null>(null);
  recording = $state(true);
  recent = $state<string[]>([]);
  tab = $state<MesaTab>('dados');
  /** pedido para o App abrir a tela da mesa */
  goto = $state(0);
  /** a última rolagem, para a animação da bandeja */
  last = $state<{ seq: number; entries: LogEntry[] } | null>(null);
  private seq = 0;
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const s = load();
    this.log = Array.isArray(s.log) ? s.log.slice(0, MAX_LOG) : [];
    this.campaignPath = s.campaign ?? null;
    this.sessionPath = s.session ?? null;
    this.recording = s.recording ?? true;
    this.recent = Array.isArray(s.recent) ? s.recent.slice(0, 12) : [];
    this.tab = s.tab ?? 'dados';
    this.seq = this.log.reduce((m, e) => Math.max(m, e.id), 0);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      if (e.type === 'note.changed' || e.type === 'note.created' || e.type === 'sync.finished') this.schedule();
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
    const notes = engine.vault.list().map((path) => ({ path, text: engine.vault.read(path) }));
    this.campaigns = campaignIndex(notes);
    this.tables = tableIndex(notes);
    if (this.campaignPath && !this.campaigns.some((c) => c.path === this.campaignPath)) this.campaignPath = null;
    if (this.sessionPath && !engine.vault.has(this.sessionPath)) this.sessionPath = null;
    this.rev++;
  }

  save(): void {
    try {
      const s: Saved = { log: this.log, campaign: this.campaignPath, session: this.sessionPath, recording: this.recording, recent: this.recent, tab: this.tab };
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* sem armazenamento: segue sem lembrar */
    }
  }

  get campaign(): Campaign | null {
    return this.campaigns.find((c) => c.path === this.campaignPath) ?? this.campaigns[0] ?? null;
  }

  open(tab?: MesaTab): void {
    if (tab) this.tab = tab;
    this.save();
    this.goto++;
  }

  read(path: string): string {
    return engine.vault.has(path) ? engine.vault.read(path) : '';
  }

  /** Valores @ da ficha de uma nota (para `dice: 1d20+@des` dentro dela). */
  varsFor(path: string | null): Resolver | undefined {
    if (!path) return undefined;
    const text = this.read(path);
    if (!text.startsWith('---') || !hasSheet(parseProps(text))) return undefined;
    return sheetVars(readSheet(text, this.campaign?.system));
  }

  // ------------------------------------------------------------ rolar

  /**
   * Rola uma fórmula e guarda no histórico. Devolve as rolagens, ou a
   * mensagem de erro (que também aparece num aviso).
   */
  roll(formula: string, opts: { who?: string; label?: string; vars?: Resolver; from?: string; quiet?: boolean } = {}): RollResult[] | string {
    let rs: RollResult[];
    const vars = opts.vars ?? (opts.from ? this.varsFor(opts.from) : undefined);
    try {
      rs = roll(formula, { vars });
    } catch (e) {
      const msg = e instanceof DiceError ? e.message : String(e);
      if (!opts.quiet) files.say(`🎲 ${msg}`, { error: true });
      return msg;
    }
    const entries = rs.map((r): LogEntry => ({
      id: ++this.seq, at: Date.now(), who: opts.who ?? '', kind: 'dados', label: opts.label || r.label, from: opts.from,
      formula: r.formula, total: r.total, detail: r.detail, critical: r.critical,
      groups: r.groups.slice(0, 8).map((g) => ({ notation: g.notation, sides: g.sides, dice: g.dice.slice(0, 60) })),
    }));
    this.push(entries);
    const clean = formula.trim();
    if (!opts.who) this.recent = [clean, ...this.recent.filter((x) => x !== clean)].slice(0, 12);
    sound.play(rs.some((r) => r.critical === 'max') ? 'complete' : rs.some((r) => r.critical === 'min') ? 'error' : 'tick');
    this.record(entries.map((e, i) => `${opts.who ? `**${opts.who}** · ` : ''}${rollText({ ...rs[i]!, label: e.label })}`));
    this.save();
    return rs;
  }

  /** Rola numa tabela (pela referência "Nota#Tabela", ou o objeto). */
  rollTable(ref: string | RollTable, from?: string): TableRoll | string {
    if (!this.tables.length) this.rebuild();
    const t = typeof ref === 'string' ? findTable(this.tables, ref, from) : ref;
    if (!t) {
      const msg = `Não achei a tabela "${ref as string}".`;
      files.say(`🎲 ${msg}`, { error: true });
      return msg;
    }
    const r = rollTable(t, { tables: this.tables });
    const e: LogEntry = {
      id: ++this.seq, at: Date.now(), who: '', kind: 'tabela', label: t.name, formula: t.dice ?? 'lista',
      total: r.text, detail: t.dice ? `${t.dice} [${r.value}]` : `item ${r.value} de ${t.entries.length}`, critical: null,
    };
    this.push([e]);
    sound.play('tick');
    this.record([`${t.name}: ${r.text}`]);
    this.save();
    return r;
  }

  private push(entries: LogEntry[]): void {
    this.log = [...[...entries].reverse(), ...this.log].slice(0, MAX_LOG);
    this.last = { seq: entries[0]!.id, entries };
  }

  clearLog(): void {
    this.log = [];
    this.save();
  }

  /** Escreve no registro da sessão aberta. */
  private record(lines: string[]): void {
    const p = this.sessionPath;
    if (!this.recording || !p || !engine.vault.has(p)) return;
    let text = engine.vault.read(p);
    const at = hhmm(Date.now());
    for (const l of lines) text = appendLog(text, `${at} · ${l}`);
    engine.vault.write(p, text);
    if (p === engine.active) engine.content = text;
    engine.boardEdited();
  }

  // ------------------------------------------------------------ campanhas

  createCampaign(name: string, world: string, system: string): string {
    const path = cadernos.create(`Campanhas/${name.trim()}`, name.trim(), (n) => campaignTemplate(n, world, system));
    this.campaignPath = path;
    this.rebuild();
    this.save();
    return path;
  }

  pickCampaign(path: string): void {
    this.campaignPath = path;
    const c = this.campaigns.find((x) => x.path === path);
    if (this.sessionPath && c && !c.sessions.some((s) => s.path === this.sessionPath)) this.sessionPath = null;
    this.save();
  }

  /** Próxima sessão, com o resumo da anterior. Fica aberta para o registro. */
  newSession(): string | null {
    const c = this.campaign;
    if (!c) return null;
    const last = c.sessions.at(-1);
    const n = Math.max(0, ...c.sessions.map((s) => s.number ?? 0)) + 1;
    const recap = last ? (getSection(this.read(last.path), 'Resumo') ?? '').trim() : '';
    const path = cadernos.create(`${c.folder}/Sessões`, `Sessão ${n}`, () =>
      sessionTemplate(n, c.name, isoDate(), last ? { name: last.name, recap } : undefined));
    this.sessionPath = path;
    this.rebuild();
    this.save();
    return path;
  }

  setSession(path: string | null): void {
    this.sessionPath = path;
    this.save();
  }

  newEncounter(name: string): string | null {
    const c = this.campaign;
    const folder = c ? `${c.folder}/Encontros` : 'Encontros';
    const path = cadernos.create(folder, name.trim() || 'Encontro', (n) => encounterTemplate(n, c?.name));
    this.rebuild();
    return path;
  }

  /** Cria a nota de geradores de exemplo (nomes, tavernas, ganchos, clima, tesouro). */
  createStarterTables(): string {
    const exists = 'Tabelas/Geradores.md';
    if (engine.vault.has(exists)) return exists;
    const path = cadernos.create('Tabelas', 'Geradores', () => starterTables());
    this.rebuild();
    return path;
  }

  nameOf(path: string): string {
    return noteName(path);
  }
}

export const mesa = new Mesa();
