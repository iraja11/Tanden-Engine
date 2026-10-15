import * as Y from 'yjs';
import diff from 'fast-diff';
import { EventBus } from './events';
import { clientIdFor, hashBytesHex, hashHex } from './hash';
import { readText, toBytes, type Storage } from './storage';

/*
 * Cofre do Tanden.
 *
 * Layout na pasta (no Drive ou no disco):
 *   **\/*.md                                notas, legíveis por qualquer app (Obsidian incluso)
 *   .tanden/crdt/<chave>/<aparelho>.bin    estado CRDT completo que aquele aparelho conhece
 *   .tanden/crdt/<chave>/<aparelho>.json   o que aquele aparelho escreveu no .md e quando
 *   .tanden/crdt/<chave>/del/<aparelho>.json  notas que aquele aparelho apagou (lápides)
 *   .trash/                                 cópia de cada nota apagada (a lixeira do Obsidian)
 *
 * Cada aparelho só escreve os próprios arquivos em .tanden/, então dois aparelhos
 * nunca brigam pelo mesmo arquivo. O merge acontece ao ler: o CRDT funde
 * todas as versões sem perder nada.
 *
 * Edições feitas fora do Tanden (Obsidian, editor do Drive) são detectadas
 * comparando o .md com o que os aparelhos declararam ter escrito. A diferença
 * vira operações CRDT sobre a versão de onde ela partiu, com um clientID
 * determinístico: se dois aparelhos detectarem a mesma edição externa, geram
 * operações idênticas e o CRDT não duplica o texto.
 *
 * Apagar: cada nota tem uma geração (gen). Quem apaga grava uma lápide com as
 * gerações que viu e o vetor de estado do momento. Uma geração está morta se a
 * lápide cobre tudo o que existe dela; uma edição feita em outro aparelho ao
 * mesmo tempo (que a lápide não viu) ressuscita a nota, sem perder nada. Criar
 * de novo uma nota no mesmo caminho começa uma geração nova, sem o texto velho.
 *
 * Um .md apagado fora do Tanden (Obsidian, gerenciador de arquivos, terminal)
 * vira um apagar comum, com cópia em .trash/, desde que este aparelho o tenha
 * escrito e nada novo tenha chegado de outro aparelho. Muitos sumiços de uma
 * vez parecem acidente e não apagam nada.
 */

const META_DIR = '.tanden/';
const CRDT_DIR = '.tanden/crdt/';
const LOCAL_DIR = '.tanden/local/';
const TRASH_DIR = '.trash/';
/** subpasta das lápides dentro de .tanden/crdt/<chave>/ */
const TOMB_SUB = 'del/';
const MIRRORS_KEPT = 8;

interface DeviceMeta {
  path: string;
  /** hash do .md que este aparelho escreveu por último */
  mdHash: string;
  writtenAt: number;
  /**
   * Últimos .md que este aparelho escreveu: hash e snapshot Yjs (base64).
   * Um snapshot é pequeno (vetor de estado + apagamentos) e, com o histórico
   * completo do documento, reconstrói exatamente aquele texto. É a base de
   * qualquer edição feita fora do Tanden a partir daquele .md.
   */
  mirrors?: Array<{ h: string; s: string }>;
  /** hashes de .md editados fora do Tanden que este aparelho já incorporou */
  absorbed?: string[];
  /** geração da nota; notas de antes das gerações contam como '' */
  gen?: string;
}

interface Tomb {
  /** gerações que a lápide mata */
  gens: string[];
  /** vetor de estado (base64) de tudo o que quem apagou conhecia */
  sv: string;
  at: number;
}

const TOMBS_KEPT = 10;
/** Acima disso, notas sumidas da pasta ao mesmo tempo parecem acidente (pasta desmontada): nada é apagado. */
const MASS_REMOVAL = 20;

const toB64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode(...b.subarray(i, i + 4096));
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// gc desligado: o documento guarda o que foi apagado, para reconstruir versões antigas
const newDoc = (): Y.Doc => new Y.Doc({ gc: false });

export interface SyncReport {
  /** notas que receberam mudanças de outros aparelhos */
  merged: number;
  /** notas com edições feitas fora do Tanden */
  external: number;
  /** notas cujo .md ou estado foi reescrito por este aparelho */
  written: number;
}

const keyFor = (path: string): string => hashHex(path);
/** pastas que começam com ponto (.tanden, .trash, .obsidian) não têm notas */
const isNotePath = (p: string): boolean => p.endsWith('.md') && !p.split('/').some((s) => s.startsWith('.'));
const newGen = (): string => Math.random().toString(36).slice(2, 10);

/** A lápide (vetor `tomb`) já viu tudo o que o vetor `sv` tem? */
function covers(tomb: Uint8Array, sv: Uint8Array): boolean {
  const t = Y.decodeStateVector(tomb);
  for (const [client, clock] of Y.decodeStateVector(sv)) if (clock > (t.get(client) ?? 0)) return false;
  return true;
}

function textOf(doc: Y.Doc): Y.Text {
  return doc.getText('body');
}

/**
 * Aplica a diferença entre o texto atual de `t` e `target`. Com `semantic`, os
 * trechos são agrupados em palavras inteiras em vez de letras soltas, o que deixa
 * a fusão com edições concorrentes previsível (usado em edições externas).
 */
function applyDiff(t: Y.Text, target: string, semantic = false): void {
  const current = t.toString();
  if (current === target) return;
  let pos = 0;
  for (const [op, chunk] of diff(current, target, undefined, semantic)) {
    if (op === diff.EQUAL) pos += chunk.length;
    else if (op === diff.DELETE) t.delete(pos, chunk.length);
    else {
      t.insert(pos, chunk);
      pos += chunk.length;
    }
  }
}

/** Quantas linhas separam dois textos (inseridas + apagadas). Só para desempate. */
function lineDistance(a: string, b: string): number {
  const ids = new Map<string, string>();
  const enc = (t: string) =>
    t.split('\n').map((l) => ids.get(l) ?? (ids.set(l, String.fromCharCode(0xe000 + ids.size)), ids.get(l)!)).join('');
  let n = 0;
  for (const [op, chunk] of diff(enc(a), enc(b))) if (op !== diff.EQUAL) n += chunk.length;
  return n;
}

export interface SyncOptions {
  /**
   * Notas cujo .md acabou de chegar de outro lugar (ex.: baixado do Drive) e,
   * para cada uma, os conteúdos anteriores daquele arquivo lá, do mais novo ao
   * mais antigo. Diz de qual versão uma edição externa partiu.
   */
  previousVersions?: (path: string) => Promise<string[]>;
  downloaded?: ReadonlySet<string>;
}

export class Vault {
  readonly bus: EventBus;
  private docs = new Map<string, Y.Doc>();
  /** estado que este aparelho gravou por último, para não reescrever à toa */
  private lastWritten = new Map<string, { state: string; mdHash: string }>();
  /** geração de cada nota aberta neste aparelho */
  private gens = new Map<string, string>();
  /** hashes dos .md novos desta rodada de sync (para reconhecer renomeações feitas fora) */
  private movedOutside = new Set<string>();

  constructor(
    readonly storage: Storage,
    readonly deviceId: string,
    bus?: EventBus,
  ) {
    if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) throw new Error('deviceId deve ter só letras, números, - ou _');
    this.bus = bus ?? new EventBus();
  }

  /** Caminhos das notas conhecidas por este aparelho, em ordem. */
  list(): string[] {
    return [...this.docs.keys()].sort();
  }

  read(path: string): string {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`Nota não encontrada: ${path}`);
    return textOf(doc).toString();
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  /** Cria uma nota nova neste aparelho. Ela vai para a pasta no próximo sync. */
  create(path: string, content = ''): void {
    if (!isNotePath(path)) throw new Error(`Caminho de nota inválido: ${path}`);
    if (this.docs.has(path)) throw new Error(`Nota já existe: ${path}`);
    const doc = newDoc();
    textOf(doc).insert(0, content);
    this.docs.set(path, doc);
    this.gens.set(path, newGen());
    this.bus.emit({ type: 'note.created', path });
  }

  /**
   * Apaga a nota. Uma cópia vai para .trash/ (a mesma lixeira do Obsidian) e os
   * outros aparelhos apagam no próximo sync. Devolve onde ficou a cópia.
   */
  async remove(path: string, opts: { trash?: boolean } = {}): Promise<string | null> {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`Nota não encontrada: ${path}`);
    const text = textOf(doc).toString();
    let trashed: string | null = null;
    if (opts.trash !== false && text.trim()) {
      const all = new Set(await this.storage.list(TRASH_DIR));
      const base = `${TRASH_DIR}${path.replace(/\.md$/, '')}`;
      let n = 1;
      trashed = `${base}.md`;
      while (all.has(trashed)) trashed = `${base} ${++n}.md`;
      await this.storage.write(trashed, toBytes(text));
    }
    const key = keyFor(path);
    const tombPath = `${CRDT_DIR}${key}/${TOMB_SUB}${this.deviceId}.json`;
    let old: Tomb[] = [];
    try {
      old = (JSON.parse((await readText(this.storage, tombPath)) ?? '{}') as { tombs?: Tomb[] }).tombs ?? [];
    } catch {
      old = [];
    }
    // mata a geração deste aparelho e todas as que ele já fundiu
    const metas = await this.metasOf(key);
    const gens = [...new Set([this.gens.get(path) ?? '', ...metas.map((m) => m.gen ?? '')])];
    const tomb: Tomb = { gens, sv: toB64(Y.encodeStateVector(doc)), at: Date.now() };
    await this.storage.write(tombPath, toBytes(JSON.stringify({ path, tombs: [...old, tomb].slice(-TOMBS_KEPT) })));
    await this.storage.remove(path);
    this.forget(path);
    this.bus.emit({ type: 'note.deleted', path });
    return trashed;
  }

  /** Renomeia ou move a nota. Os links nas outras notas ficam por conta de quem chama. */
  async rename(from: string, to: string): Promise<void> {
    if (from === to) return;
    if (!isNotePath(to)) throw new Error(`Caminho de nota inválido: ${to}`);
    if (this.docs.has(to)) throw new Error(`Já existe uma nota em ${to}`);
    this.create(to, this.read(from));
    await this.remove(from, { trash: false });
  }

  private forget(path: string): void {
    this.docs.delete(path);
    this.gens.delete(path);
    this.lastWritten.delete(path);
  }

  private async metasOf(key: string): Promise<Array<DeviceMeta & { device: string }>> {
    const out: Array<DeviceMeta & { device: string }> = [];
    for (const f of await this.storage.list(`${CRDT_DIR}${key}/`)) {
      if (f.includes(`/${TOMB_SUB}`) || !f.endsWith('.json')) continue;
      const m = await this.readMeta(f);
      if (m) out.push({ ...m, device: f.slice(f.lastIndexOf('/') + 1, -5) });
    }
    return out;
  }

  /** Substitui o conteúdo da nota; só a diferença vira operação CRDT. */
  write(path: string, content: string): void {
    this.edit(path, (t) => applyDiff(t, content));
  }

  /** Edição direta no texto CRDT (inserir, apagar em posições). */
  edit(path: string, fn: (text: Y.Text) => void): void {
    const doc = this.docs.get(path);
    if (!doc) throw new Error(`Nota não encontrada: ${path}`);
    doc.transact(() => fn(textOf(doc)), 'local');
    this.bus.emit({ type: 'note.changed', path, origin: 'local' });
  }

  /** Lê a pasta, funde tudo e grava o estado e os .md deste aparelho. */
  sync(opts: SyncOptions = {}): Promise<SyncReport> {
    return this.bus.process(`sync:${this.deviceId}`, 'Sincronizando', () => this.doSync(opts));
  }

  private get diskPath(): string {
    return `${LOCAL_DIR}${this.deviceId}/disk.json`;
  }

  private async doSync(opts: SyncOptions): Promise<SyncReport> {
    const report: SyncReport = { merged: 0, external: 0, written: 0 };
    const all = await this.storage.list();
    // hash do .md que este aparelho deixou no disco no último sync, por nota
    let disk: Record<string, string> = {};
    try {
      disk = JSON.parse((await readText(this.storage, this.diskPath)) ?? '{}') as Record<string, string>;
    } catch {
      disk = {};
    }

    // agrupa os arquivos de estado por nota
    const crdtByKey = new Map<string, string[]>();
    for (const p of all) {
      if (!p.startsWith(CRDT_DIR)) continue;
      const key = p.slice(CRDT_DIR.length).split('/')[0]!;
      (crdtByKey.get(key) ?? crdtByKey.set(key, []).get(key)!).push(p);
    }

    // descobre o caminho de cada nota: .md existentes, metas de outros aparelhos e notas locais
    const paths = new Set<string>(all.filter(isNotePath));
    for (const p of this.docs.keys()) paths.add(p);
    for (const files of crdtByKey.values()) {
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const meta = await this.readMeta(f);
        if (meta) paths.add(meta.path);
      }
    }

    // .md que este aparelho escreveu e que sumiu da pasta: apagado por fora
    const present = new Set(all);
    const missing = [...paths].filter((p) => !present.has(p) && disk[p] !== undefined);
    const mass = missing.length > MASS_REMOVAL && missing.length > Object.keys(disk).length / 2;
    const goneOutside = new Set(mass ? [] : missing);
    // renomear no Obsidian = sumir um .md e aparecer outro igual: não precisa de cópia na lixeira
    const arrived = new Set<string>();
    if (goneOutside.size)
      for (const p of all)
        if (isNotePath(p) && !this.docs.has(p) && disk[p] === undefined) {
          const t = await readText(this.storage, p);
          if (t !== null) arrived.add(hashHex(t));
        }
    this.movedOutside = arrived;

    for (const path of [...paths].sort()) {
      const r = await this.syncNote(path, crdtByKey.get(keyFor(path)) ?? [], disk, opts, goneOutside.has(path));
      if (r.merged) report.merged++;
      if (r.external) report.external++;
      if (r.written) report.written++;
    }
    await this.storage.write(this.diskPath, toBytes(JSON.stringify(disk)));
    this.bus.emit({ type: 'sync.finished', ...report });
    return report;
  }

  /** Tira a nota apagada deste aparelho: o .md e o estado próprio dele. */
  private async dropLocal(path: string, key: string, md: string | null, disk: Record<string, string>): Promise<void> {
    this.forget(path);
    if (md !== null) await this.storage.remove(path);
    for (const f of [`${CRDT_DIR}${key}/${this.deviceId}.bin`, `${CRDT_DIR}${key}/${this.deviceId}.json`]) await this.storage.remove(f);
    delete disk[path];
  }

  private async readMeta(file: string): Promise<DeviceMeta | null> {
    const raw = await readText(this.storage, file);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as DeviceMeta;
    } catch {
      return null;
    }
  }

  private async syncNote(path: string, files: string[], disk: Record<string, string>, opts: SyncOptions, goneOutside = false) {
    const key = keyFor(path);
    const none = { merged: false, external: false, written: false };

    // 0. lê o estado e as lápides de cada aparelho
    const states = new Map<string, Uint8Array>();
    const metas: Array<DeviceMeta & { device: string }> = [];
    const tombs: Tomb[] = [];
    for (const f of files) {
      const device = f.slice(f.lastIndexOf('/') + 1).replace(/\.(bin|json)$/, '');
      if (f.includes(`/${TOMB_SUB}`)) {
        if (!f.endsWith('.json')) continue;
        try {
          tombs.push(...((JSON.parse((await readText(this.storage, f)) ?? '{}') as { tombs?: Tomb[] }).tombs ?? []));
        } catch {
          // lápide ilegível: ignora (nunca apaga por engano)
        }
      } else if (f.endsWith('.bin')) {
        const b = await this.storage.read(f);
        if (b) states.set(device, b);
      } else if (f.endsWith('.json')) {
        const m = await this.readMeta(f);
        if (m) metas.push({ ...m, device });
      }
    }
    const genOf = (device: string) => metas.find((m) => m.device === device)?.gen ?? '';
    let doc = this.docs.get(path);

    // gerações mortas: a lápide cobre tudo o que existe delas
    const dead = new Set<string>();
    let deadText: string | null = null;
    for (const t of tombs) {
      const probe = newDoc();
      for (const [dev, b] of states) if (t.gens.includes(genOf(dev))) Y.applyUpdate(probe, b);
      if (doc && t.gens.includes(this.gens.get(path) ?? '')) Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc));
      if (covers(fromB64(t.sv), Y.encodeStateVector(probe))) {
        for (const g of t.gens) dead.add(g);
        deadText ??= textOf(probe).toString();
      }
    }
    const md0 = dead.size ? await readText(this.storage, path) : null;
    const live = [...states].filter(([dev]) => !dead.has(genOf(dev)));
    let replaced = false;
    if (doc && dead.has(this.gens.get(path) ?? '')) {
      if (!live.length) {
        // apagada em outro aparelho
        await this.dropLocal(path, key, md0, disk);
        this.bus.emit({ type: 'note.deleted', path });
        return none;
      }
      // apagada e criada de novo no mesmo caminho em outro aparelho: o .md já é
      // da nota nova, então fica; a geração nova assume no lugar da velha
      this.forget(path);
      doc = undefined;
      replaced = true;
    }
    if (!doc && dead.size) {
      // o .md que sobrou é da nota apagada, ou uma nota nova criada fora do Tanden?
      const stale =
        md0 === null ||
        md0 === deadText ||
        hashHex(md0) === disk[path] ||
        metas.some((m) => dead.has(m.gen ?? '') && (m.mdHash === hashHex(md0) || m.mirrors?.some((x) => x.h === hashHex(md0))));
      if (!live.length && stale) {
        await this.dropLocal(path, key, md0, disk);
        return none;
      }
    }
    const isNew = !doc;
    if (!doc) {
      doc = newDoc();
      this.docs.set(path, doc);
      const newest = metas.filter((m) => !dead.has(m.gen ?? '') && states.has(m.device)).sort((a, b) => b.writtenAt - a.writtenAt)[0];
      this.gens.set(path, newest ? newest.gen ?? '' : dead.size ? newGen() : '');
    }
    const text = textOf(doc);
    const before = text.toString();

    // 1. funde o estado de todos os aparelhos (menos o das gerações apagadas)
    for (const [, b] of live) Y.applyUpdate(doc, b, 'remote');
    const merged = text.toString() !== before;

    // apagada fora do Tanden, e nada chegou de outro aparelho desde o último .md daqui
    if (goneOutside && hashHex(text.toString()) === disk[path]) {
      await this.remove(path, { trash: !this.movedOutside.has(disk[path]!) });
      delete disk[path];
      return none;
    }

    // 2. o .md mudou fora do Tanden?
    let external = false;
    let absorbedNow: string | null = null;
    const md = await readText(this.storage, path);
    if (md !== null && md !== text.toString()) {
      const mdHash = hashHex(md);
      const liveMetas = metas.filter((m) => !dead.has(m.gen ?? ''));
      const mirrors = liveMetas.flatMap((m) => m.mirrors ?? []);
      // já é um espelho conhecido, ou outro aparelho já incorporou esta mesma edição
      // (as operações dele chegaram junto com o estado que acabamos de fundir)
      const known =
        liveMetas.some((m) => m.mdHash === mdHash || m.absorbed?.includes(mdHash)) || mirrors.some((m) => m.h === mdHash);
      if (!known) {
        // A edição partiu de algum .md que um aparelho escreveu antes. Qual?
        // - .md baixado agora: a versão anterior daquele arquivo no Drive;
        // - .md editado neste disco: o que este aparelho deixou nele no último sync.
        // Se nenhuma for um espelho conhecido, usa o espelho mais parecido.
        const hints: string[] = [];
        if (opts.downloaded?.has(path) && opts.previousVersions) {
          for (const t of await opts.previousVersions(path)) hints.push(hashHex(t));
        } else if (disk[path]) {
          hints.push(disk[path]);
        }
        const rebuild = (m: { h: string; s: string }): Y.Doc | null => {
          try {
            return Y.createDocFromSnapshot(doc, Y.decodeSnapshot(fromB64(m.s)), newDoc());
          } catch {
            return null; // histórico daquele aparelho ainda incompleto aqui
          }
        };
        let base: { h: string; fork: Y.Doc } | null = null;
        for (const h of hints) {
          const m = mirrors.find((x) => x.h === h);
          const fork = m && rebuild(m);
          if (m && fork) {
            base = { h: m.h, fork };
            break;
          }
        }
        if (!base) {
          let best = Infinity;
          for (const m of mirrors) {
            const fork = rebuild(m);
            if (!fork) continue;
            const dist = lineDistance(textOf(fork).toString(), md);
            if (dist < best) [best, base] = [dist, { h: m.h, fork }];
          }
        }
        if (base || text.length === 0) {
          const fork = base?.fork ?? newDoc();
          fork.clientID = clientIdFor(`${path}\0${base?.h ?? ''}\0${md}`);
          applyDiff(textOf(fork), md);
          Y.applyUpdate(doc, Y.encodeStateAsUpdate(fork), 'external');
          external = true;
          absorbedNow = mdHash;
        }
        // sem histórico e com conteúdo local: o .md é antigo, o CRDT vence
      }
    }

    // 3. grava o que este aparelho sabe
    const finalText = text.toString();
    const state = Y.encodeStateAsUpdate(doc);
    const stateSig = hashBytesHex(state);
    const mdHash = hashHex(finalText);
    const prev = this.lastWritten.get(path);
    let written = false;
    if (!prev || prev.state !== stateSig || md !== finalText) {
      await this.storage.write(`${CRDT_DIR}${key}/${this.deviceId}.bin`, state);
      const own = metas.find((m) => m.device === this.deviceId && (m.gen ?? '') === (this.gens.get(path) ?? ''));
      const mirrors = [...(own?.mirrors ?? []).filter((m) => m.h !== mdHash), { h: mdHash, s: toB64(Y.encodeSnapshot(Y.snapshot(doc))) }];
      const absorbed = [...(own?.absorbed ?? []), ...(absorbedNow ? [absorbedNow] : [])].slice(-MIRRORS_KEPT * 2);
      const meta: DeviceMeta = { path, mdHash, writtenAt: Date.now(), mirrors: mirrors.slice(-MIRRORS_KEPT), absorbed, gen: this.gens.get(path) ?? '' };
      await this.storage.write(`${CRDT_DIR}${key}/${this.deviceId}.json`, toBytes(JSON.stringify(meta)));
      if (md !== finalText) await this.storage.write(path, toBytes(finalText));
      this.lastWritten.set(path, { state: stateSig, mdHash });
      written = true;
    }

    disk[path] = mdHash;

    if (replaced) this.bus.emit({ type: 'note.changed', path, origin: 'remote' });
    else if (isNew) this.bus.emit({ type: 'note.created', path });
    else if (merged) this.bus.emit({ type: 'note.changed', path, origin: 'remote' });
    if (external) this.bus.emit({ type: 'note.changed', path, origin: 'external' });
    return { merged, external, written };
  }
}
