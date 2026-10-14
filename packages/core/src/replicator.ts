import { hashBytesHex } from './hash';
import { fromBytes, readText, toBytes, type Storage } from './storage';

/*
 * Replicador: mantém a pasta local do aparelho e a pasta remota (Google Drive)
 * em dia, arquivo por arquivo. Não entende de notas; quem funde conteúdo é o Vault.
 *
 * Regras, pensadas para nunca perder dados:
 * - Arquivos deste aparelho em .tanden/crdt/ só sobem (só ele os escreve).
 * - Arquivos de outros aparelhos em .tanden/crdt/ só descem.
 * - Notas .md são espelhos compartilhados. Se só um lado mudou, ele vence.
 *   Se os dois mudaram, desce a versão remota: o histórico CRDT já guarda o
 *   que este aparelho escreveu, e o Vault absorve a remota no próximo sync.
 * - .tanden/local/ nunca sai do aparelho.
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
}

export interface ReplicaReport {
  uploaded: string[];
  downloaded: string[];
}

interface ReplicaState {
  /** rev remota de cada arquivo na última vez que este aparelho o viu ou enviou */
  remote: Record<string, string>;
  /** hash local de cada arquivo na última replicação */
  local: Record<string, string>;
}

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
    return path.startsWith('.tanden/crdt/') && /\/([^/]+)\.(bin|json)$/.exec(path)?.[1] === this.deviceId;
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
    const report: ReplicaReport = { uploaded: [], downloaded: [] };
    const remoteRevs = new Map((await this.remote.list()).map((f) => [f.path, f.rev]));
    const localPaths = (await this.local.list()).filter((p) => !p.startsWith(LOCAL_DIR));
    const paths = new Set([...localPaths, ...remoteRevs.keys()]);

    for (const path of [...paths].sort()) {
      if (path.startsWith(LOCAL_DIR)) continue;
      const data = await this.local.read(path);
      const lHash = data ? hashBytesHex(data) : null;
      const rRev = remoteRevs.get(path) ?? null;
      const localChanged = lHash !== null && lHash !== state.local[path];
      const remoteChanged = rRev !== null && rRev !== state.remote[path];

      let action: 'up' | 'down' | null = null;
      if (this.isOwn(path)) {
        if (data && (localChanged || rRev === null)) action = 'up';
        else if (!data && rRev !== null) action = 'down'; // aparelho reinstalado: recupera o próprio histórico
      } else if (path.startsWith('.tanden/')) {
        if (rRev !== null && (remoteChanged || !data)) action = 'down';
      } else if (data && rRev === null) {
        action = 'up';
      } else if (!data && rRev !== null) {
        action = 'down';
      } else if (remoteChanged) {
        action = 'down';
      } else if (localChanged) {
        action = 'up';
      }

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
        }
        state.remote[path] = rRev!;
      } else {
        if (rRev !== null) state.remote[path] = rRev;
        if (lHash !== null) state.local[path] = lHash;
      }
    }

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
