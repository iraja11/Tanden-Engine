import { hashBytesHex } from './hash';
import { fromBytes, readText, toBytes, type Storage } from './storage';

/*
 * Replicador: mantém a pasta local do aparelho e a pasta remota (Google Drive)
 * em dia, arquivo por arquivo. Não entende de notas; quem funde conteúdo é o Vault.
 *
 * Regras, pensadas para nunca perder dados:
 * - Arquivos deste aparelho em .tanden/<tipo>/ (crdt, board...) só sobem (só ele os escreve).
 * - Arquivos de outros aparelhos ali só descem.
 * - Notas .md são espelhos compartilhados. Se só um lado mudou, ele vence.
 *   Se os dois mudaram, desce a versão remota: o histórico CRDT já guarda o
 *   que este aparelho escreveu, e o Vault absorve a remota no próximo sync.
 * - .tanden/local/ nunca sai do aparelho.
 * - Arquivo apagado aqui (nota apagada, plugin removido) e intocado lá: vai
 *   para a lixeira do Drive. Se mudou lá, desce de novo (nada se perde).
 */

export interface RemoteFile {
  path: string;
  /** muda sempre que o conteúdo muda (no Drive, o md5Checksum) */
  rev: string;
}

export interface RemoteStore {
  list(): Promise<RemoteFile[]>;
  download(path: string): Promise<Uint8Array | null>;
  /** devolve a nova rev */
  upload(path: string, data: Uint8Array): Promise<string>;
  /** conteúdos anteriores do arquivo, do mais novo ao mais antigo (sem o atual) */
  history(path: string, limit: number): Promise<Uint8Array[]>;
  /** manda o arquivo para a lixeira (opcional: sem isso, nada é apagado lá) */
  remove?(path: string): Promise<void>;
}

export interface ReplicaReport {
  uploaded: string[];
  downloaded: string[];
  /** apagados no remoto porque foram apagados aqui */
  removed?: string[];
}

/** Acima disso, sumiço em massa na pasta local parece acidente: não apaga nada lá. */
const MASS_REMOVAL = 20;

interface ReplicaState {
  /** rev remota de cada arquivo na última vez que este aparelho o viu ou enviou */
  remote: Record<string, string>;
  /** hash local de cada arquivo na última replicação */
  local: Record<string, string>;
  /** assinatura (tamanho e data) do arquivo quando o hash acima foi calculado */
  stat?: Record<string, string>;
}

/**
 * Um arquivo gravado há menos que isso pode mudar de novo sem mudar a data
 * (resolução do relógio do sistema de arquivos); nesse caso o hash não é guardado.
 */
const RACY_MS = 3000;

const LOCAL_DIR = '.tanden/local/';

export class Replicator {
  private readonly statePath: string;

  constructor(
    readonly local: Storage,
    readonly remote: RemoteStore,
    readonly deviceId: string,
  ) {
    this.statePath = `${LOCAL_DIR}${deviceId}/replica.json`;
  }

  private isOwn(path: string): boolean {
    return path.startsWith('.tanden/') && !path.startsWith(LOCAL_DIR) && /\/([^/]+)\.(bin|json)$/.exec(path)?.[1] === this.deviceId;
  }

  private async loadState(): Promise<ReplicaState> {
    const raw = await readText(this.local, this.statePath);
    if (!raw) return { remote: {}, local: {} };
    try {
      return JSON.parse(raw) as ReplicaState;
    } catch {
      return { remote: {}, local: {} };
    }
  }

  async sync(): Promise<ReplicaReport> {
    const state = await this.loadState();
    const stats = this.local.stat ? await this.local.stat().catch(() => null) : null;
    const knownStat = state.stat ?? {};
    const nextStat: Record<string, string> = {};
    const report: ReplicaReport = { uploaded: [], downloaded: [], removed: [] };
    const remoteRevs = new Map((await this.remote.list()).map((f) => [f.path, f.rev]));
    const localPaths = (await this.local.list()).filter((p) => !p.startsWith(LOCAL_DIR));
    const paths = new Set([...localPaths, ...remoteRevs.keys()]);
    const now = Date.now();
    // apagados aqui desde a última vez, sem mudança lá
    const present = new Set(localPaths);
    const gone = [...remoteRevs].filter(([p, rev]) => !present.has(p) && state.local[p] !== undefined && state.remote[p] === rev).map(([p]) => p);
    const known = Object.keys(state.local).length;
    const removeGone = !!this.remote.remove && !(gone.length > MASS_REMOVAL && gone.length > known / 2);
    const goneSet = new Set(removeGone ? gone : []);

    for (const path of [...paths].sort()) {
      if (path.startsWith(LOCAL_DIR)) continue;
      if (goneSet.has(path)) {
        await this.remote.remove!(path);
        delete state.local[path];
        delete state.remote[path];
        report.removed!.push(path);
        continue;
      }
      // arquivo grande que não mudou desde a última vez: usa o hash guardado, sem ler
      const st = stats?.[path];
      let data: Uint8Array | null | undefined;
      let lHash: string | null;
      if (st && knownStat[path] === st[0] && state.local[path]) {
        lHash = state.local[path]!;
        nextStat[path] = st[0];
      } else {
        data = await this.local.read(path);
        lHash = data ? hashBytesHex(data) : null;
        if (st && data && now - st[1] > RACY_MS) nextStat[path] = st[0];
      }
      const rRev = remoteRevs.get(path) ?? null;
      const localChanged = lHash !== null && lHash !== state.local[path];
      const remoteChanged = rRev !== null && rRev !== state.remote[path];
      const has = lHash !== null;

      let action: 'up' | 'down' | null = null;
      if (this.isOwn(path)) {
        if (has && (localChanged || rRev === null)) action = 'up';
        else if (!has && rRev !== null) action = 'down'; // aparelho reinstalado: recupera o próprio histórico
      } else if (path.startsWith('.tanden/')) {
        if (rRev !== null && (remoteChanged || !has)) action = 'down';
      } else if (has && rRev === null) {
        action = 'up';
      } else if (!has && rRev !== null) {
        action = 'down';
      } else if (remoteChanged) {
        action = 'down';
      } else if (localChanged) {
        action = 'up';
      }

      if (action === 'up' && data === undefined) data = await this.local.read(path);
      if (action === 'up' && data) {
        state.remote[path] = await this.remote.upload(path, data);
        state.local[path] = lHash!;
        report.uploaded.push(path);
      } else if (action === 'down') {
        const got = await this.remote.download(path);
        if (got) {
          await this.local.write(path, got);
          state.local[path] = hashBytesHex(got);
          report.downloaded.push(path);
          delete nextStat[path]; // a data mudou com a gravação; o próximo sync relê uma vez
        }
        state.remote[path] = rRev!;
      } else {
        if (rRev !== null) state.remote[path] = rRev;
        if (lHash !== null) state.local[path] = lHash;
      }
    }

    if (!report.removed!.length) delete report.removed;
    state.stat = nextStat;
    await this.local.write(this.statePath, toBytes(JSON.stringify(state)));
    return report;
  }
}

/** Remoto em memória, para testes e para simular o Drive. */
export class MemoryRemote implements RemoteStore {
  readonly files = new Map<string, { data: Uint8Array; rev: string }>();
  private past = new Map<string, Uint8Array[]>();
  private seq = 0;

  async history(path: string, limit: number): Promise<Uint8Array[]> {
    return (this.past.get(path) ?? []).slice(-limit).reverse();
  }

  async list(): Promise<RemoteFile[]> {
    return [...this.files].map(([path, f]) => ({ path, rev: f.rev }));
  }
  async remove(path: string): Promise<void> {
    const old = this.files.get(path);
    if (old) this.past.set(path, [...(this.past.get(path) ?? []), old.data]);
    this.files.delete(path);
  }
  async download(path: string): Promise<Uint8Array | null> {
    return this.files.get(path)?.data.slice() ?? null;
  }
  async upload(path: string, data: Uint8Array): Promise<string> {
    const rev = `${++this.seq}:${hashBytesHex(data)}`;
    const old = this.files.get(path);
    if (old) this.past.set(path, [...(this.past.get(path) ?? []), old.data]);
    this.files.set(path, { data: data.slice(), rev });
    return rev;
  }
  /** simula alguém editando o arquivo direto no Drive */
  async editText(path: string, text: string): Promise<void> {
    await this.upload(path, toBytes(text));
  }
  text(path: string): string | null {
    const f = this.files.get(path);
    return f ? fromBytes(f.data) : null;
  }
}
