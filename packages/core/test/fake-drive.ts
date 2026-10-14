import { createHash } from 'node:crypto';

// Imitação do pedaço da API do Google Drive v3 que o DriveRemote usa.
// Responde como o Drive real (formatos, md5Checksum, revisões, paginação).

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
  data: Uint8Array;
  revisions: Array<{ id: string; data: Uint8Array }>;
  trashed: boolean;
}

const md5 = (b: Uint8Array) => createHash('md5').update(b).digest('hex');

export class FakeDrive {
  files = new Map<string, FakeFile>();
  requests: string[] = [];
  /** responde 429 nas próximas N chamadas, para testar novas tentativas */
  throttle = 0;
  pageSize = 3; // páginas pequenas para exercitar a paginação
  private seq = 0;
  /** sessões de envio resumable abertas: endereço → o que fazer com o conteúdo */
  private sessions = new Map<string, { method: string; fileId?: string; meta?: Partial<FakeFile> }>();

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    this.requests.push(`${method} ${url.pathname}`);
    if (!String((init.headers as Record<string, string>)?.Authorization ?? '').startsWith('Bearer ')) return new Response('sem token', { status: 401 });
    if (this.throttle > 0) {
      this.throttle--;
      return new Response('rate limit', { status: 429 });
    }
    const path = url.pathname.replace(/^\/(upload\/)?drive\/v3/, '');
    const body: Uint8Array = init.body instanceof Uint8Array ? init.body : typeof init.body === "string" ? new TextEncoder().encode(init.body) : new Uint8Array();
    if (body.length > 5 * 1024 * 1024 && url.searchParams.get('uploadType') !== null && url.searchParams.get('uploadType') !== 'resumable')
      return new Response('arquivo grande demais para envio simples', { status: 413 });
    let m: RegExpMatchArray | null;

    if (path === '/files' && method === 'GET') {
      const all = [...this.files.values()].filter((f) => !f.trashed && f.appProperties.tandenVault);
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const page = all.slice(start, start + this.pageSize);
      return Response.json({
        nextPageToken: start + this.pageSize < all.length ? String(start + this.pageSize) : undefined,
        files: page.map((f) => ({ id: f.id, mimeType: f.mimeType, md5Checksum: f.mimeType.includes('folder') ? undefined : md5(f.data), appProperties: f.appProperties })),
      });
    }
    if (url.searchParams.get('uploadType') === 'resumable' && (method === 'POST' || method === 'PATCH')) {
      const id = `s${++this.seq}`;
      const fileId = path.match(/^\/files\/([^/]+)$/)?.[1];
      this.sessions.set(id, { method, fileId, meta: body.length ? JSON.parse(new TextDecoder().decode(body)) : {} });
      return new Response(null, { status: 200, headers: { Location: `https://www.googleapis.com/upload/drive/v3/sessao/${id}` } });
    }
    if ((m = path.match(/^\/sessao\/([^/]+)$/)) && method === 'PUT') {
      const s = this.sessions.get(m[1]!);
      if (!s) return new Response('sessão expirada', { status: 404 });
      this.sessions.delete(m[1]!);
      const data = body.slice();
      if (s.fileId) {
        const f = this.files.get(s.fileId)!;
        f.data = data;
        f.revisions.push({ id: `r${++this.seq}`, data });
        return Response.json({ id: f.id, md5Checksum: md5(data) });
      }
      const f: FakeFile = {
        id: `f${++this.seq}`,
        name: s.meta!.name!,
        mimeType: s.meta!.mimeType ?? 'application/octet-stream',
        parents: s.meta!.parents ?? ['root'],
        appProperties: s.meta!.appProperties ?? {},
        data,
        revisions: [{ id: `r${++this.seq}`, data }],
        trashed: false,
      };
      this.files.set(f.id, f);
      return Response.json({ id: f.id, md5Checksum: md5(data) });
    }
    if (path === '/files' && method === 'POST') {
      let meta: Partial<FakeFile>;
      let data = new Uint8Array();
      if (url.searchParams.get('uploadType') === 'multipart') {
        const boundary = /boundary=(\S+)/.exec((init.headers as Record<string, string>)['Content-Type']!)![1]!;
        const text = Buffer.from(body).toString('latin1');
        const parts = text.split(`--${boundary}`);
        meta = JSON.parse(Buffer.from(parts[1]!.split('\r\n\r\n')[1]!.trim(), 'latin1').toString('utf8'));
        const raw = parts[2]!.slice(parts[2]!.indexOf('\r\n\r\n') + 4, -2);
        data = new Uint8Array(Buffer.from(raw, 'latin1'));
      } else {
        meta = JSON.parse(new TextDecoder().decode(body));
      }
      const f: FakeFile = {
        id: `f${++this.seq}`,
        name: meta.name!,
        mimeType: meta.mimeType ?? 'application/octet-stream',
        parents: meta.parents ?? ['root'],
        appProperties: meta.appProperties ?? {},
        data,
        revisions: [{ id: `r${++this.seq}`, data }],
        trashed: false,
      };
      this.files.set(f.id, f);
      return Response.json({ id: f.id, md5Checksum: md5(data) });
    }
    if ((m = path.match(/^\/files\/([^/]+)$/)) && method === 'PATCH') {
      const f = this.files.get(m[1]!)!;
      f.data = body.slice();
      f.revisions.push({ id: `r${++this.seq}`, data: f.data });
      return Response.json({ id: f.id, md5Checksum: md5(f.data) });
    }
    if ((m = path.match(/^\/files\/([^/]+)$/)) && url.searchParams.get('alt') === 'media') {
      const f = this.files.get(m[1]!);
      return f ? new Response(f.data.slice()) : new Response('não existe', { status: 404 });
    }
    if ((m = path.match(/^\/files\/([^/]+)\/revisions$/))) {
      return Response.json({ revisions: this.files.get(m[1]!)!.revisions.map((r) => ({ id: r.id })) });
    }
    if ((m = path.match(/^\/files\/([^/]+)\/revisions\/([^/]+)$/))) {
      const r = this.files.get(m[1]!)!.revisions.find((x) => x.id === m![2]);
      return r ? new Response(r.data.slice()) : new Response('não existe', { status: 404 });
    }
    return new Response(`rota não simulada: ${method} ${path}`, { status: 400 });
  };

  /** alguém edita o arquivo pelo site do Drive */
  editByPath(tandenPath: string, text: string): void {
    const f = [...this.files.values()].find((x) => x.appProperties.tandenPath === tandenPath)!;
    f.data = new TextEncoder().encode(text);
    f.revisions.push({ id: `r${++this.seq}`, data: f.data });
  }

  textByPath(tandenPath: string): string | null {
    const f = [...this.files.values()].find((x) => x.appProperties.tandenPath === tandenPath);
    return f ? new TextDecoder().decode(f.data) : null;
  }

  /** caminho de pastas visível no Drive, ex.: "Tanden/mundo/aurath.md" */
  visiblePath(tandenPath: string): string {
    let f = [...this.files.values()].find((x) => x.appProperties.tandenPath === tandenPath);
    const names: string[] = [];
    while (f) {
      names.unshift(f.name);
      f = this.files.get(f.parents[0]!);
    }
    return names.join('/');
  }
}
