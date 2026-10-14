import type { RemoteFile, RemoteStore } from './replicator';

/*
 * Google Drive como pasta remota do cofre (API REST v3, só fetch).
 *
 * Fica tudo numa pasta "Tanden" visível no seu Drive, com a mesma árvore da
 * pasta local. Cada arquivo leva appProperties { tandenVault, tandenPath }, o
 * que permite listar o cofre inteiro numa consulta só, sem varrer pastas.
 *
 * Escopo OAuth esperado: https://www.googleapis.com/auth/drive.file
 * (o app só enxerga o que ele mesmo criou; não tem acesso ao resto do seu Drive).
 */

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';

export interface DriveOptions {
  /** devolve um access token válido (o app cuida de renovar) */
  getToken: () => Promise<string>;
  /** nome da pasta no Drive */
  folderName?: string;
  /** identifica o cofre, caso um dia existam vários */
  vaultId?: string;
  fetch?: typeof fetch;
}

interface Entry {
  id: string;
  rev: string;
  folder: boolean;
}

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class DriveRemote implements RemoteStore {
  private readonly fetch: typeof fetch;
  private readonly vaultId: string;
  private readonly folderName: string;
  /** caminho → arquivo no Drive; '' é a pasta raiz do cofre */
  private index: Map<string, Entry> | null = null;

  constructor(private readonly opts: DriveOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.vaultId = opts.vaultId ?? 'main';
    this.folderName = opts.folderName ?? 'Tanden';
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.opts.getToken();
      const res = await this.fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
      if (res.ok) return res;
      // limite de taxa ou instabilidade do Google: espera e tenta de novo
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
        continue;
      }
      throw new DriveError(res.status, `Drive respondeu ${res.status}: ${await res.text()}`);
    }
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.call(url, init)).json() as Promise<T>;
  }

  async list(): Promise<RemoteFile[]> {
    const index = new Map<string, Entry>();
    const q = `appProperties has { key='tandenVault' and value='${this.vaultId}' } and trashed = false`;
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        spaces: 'drive',
        pageSize: '1000',
        fields: 'nextPageToken,files(id,mimeType,md5Checksum,modifiedTime,appProperties)',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.json<{
        nextPageToken?: string;
        files: Array<{ id: string; mimeType: string; md5Checksum?: string; modifiedTime?: string; appProperties?: Record<string, string> }>;
      }>(`${API}/files?${params}`);
      for (const f of page.files) {
        const path = f.appProperties?.tandenPath;
        if (path === undefined || index.has(path)) continue;
        index.set(path, { id: f.id, rev: f.md5Checksum ?? f.modifiedTime ?? '', folder: f.mimeType === FOLDER });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    this.index = index;
    return [...index].filter(([, e]) => !e.folder).map(([path, e]) => ({ path, rev: e.rev }));
  }

  private async entries(): Promise<Map<string, Entry>> {
    if (!this.index) await this.list();
    return this.index!;
  }

  async download(path: string): Promise<Uint8Array | null> {
    const e = (await this.entries()).get(path);
    if (!e || e.folder) return null;
    const res = await this.call(`${API}/files/${e.id}?alt=media`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async upload(path: string, data: Uint8Array): Promise<string> {
    const index = await this.entries();
    const existing = index.get(path);
    if (existing && !existing.folder) {
      const r = await this.json<{ md5Checksum?: string; modifiedTime?: string }>(
        `${UPLOAD}/files/${existing.id}?uploadType=media&fields=md5Checksum,modifiedTime`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: data as BodyInit },
      );
      existing.rev = r.md5Checksum ?? r.modifiedTime ?? '';
      return existing.rev;
    }
    const slash = path.lastIndexOf('/');
    const parent = await this.folder(slash < 0 ? '' : path.slice(0, slash));
    const name = path.slice(slash + 1);
    const r = await this.createFile(name, parent, path, data);
    index.set(path, { id: r.id, rev: r.rev, folder: false });
    return r.rev;
  }

  async history(path: string, limit: number): Promise<Uint8Array[]> {
    const e = (await this.entries()).get(path);
    if (!e || e.folder) return [];
    const { revisions = [] } = await this.json<{ revisions?: Array<{ id: string }> }>(
      `${API}/files/${e.id}/revisions?fields=revisions(id)&pageSize=200`,
    );
    const older = revisions.slice(0, -1).reverse().slice(0, limit); // sem a atual, da mais nova à mais antiga
    const out: Uint8Array[] = [];
    for (const rev of older) {
      try {
        const res = await this.call(`${API}/files/${e.id}/revisions/${rev.id}?alt=media`);
        out.push(new Uint8Array(await res.arrayBuffer()));
      } catch {
        // revisões antigas podem ter sido descartadas pelo Drive
      }
    }
    return out;
  }

  /** Garante a pasta (e as de cima) e devolve o id dela. */
  private async folder(dir: string): Promise<string> {
    const index = await this.entries();
    const hit = index.get(dir);
    if (hit?.folder) return hit.id;
    let parent: string;
    let name: string;
    if (dir === '') {
      parent = 'root';
      name = this.folderName;
    } else {
      const slash = dir.lastIndexOf('/');
      parent = await this.folder(slash < 0 ? '' : dir.slice(0, slash));
      name = dir.slice(slash + 1);
    }
    const r = await this.json<{ id: string }>(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: FOLDER,
        parents: [parent],
        appProperties: { tandenVault: this.vaultId, tandenPath: dir },
      }),
    });
    index.set(dir, { id: r.id, rev: '', folder: true });
    return r.id;
  }

  private async createFile(name: string, parent: string, path: string, data: Uint8Array): Promise<{ id: string; rev: string }> {
    const boundary = `tanden${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({
      name,
      parents: [parent],
      mimeType: path.endsWith('.md') ? 'text/markdown' : 'application/octet-stream',
      appProperties: { tandenVault: this.vaultId, tandenPath: path },
    });
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + data.length + tail.length);
    body.set(head, 0);
    body.set(data, head.length);
    body.set(tail, head.length + data.length);
    const r = await this.json<{ id: string; md5Checksum?: string; modifiedTime?: string }>(
      `${UPLOAD}/files?uploadType=multipart&fields=id,md5Checksum,modifiedTime`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: body as BodyInit },
    );
    return { id: r.id, rev: r.md5Checksum ?? r.modifiedTime ?? '' };
  }
}
