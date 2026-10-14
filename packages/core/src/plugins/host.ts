import type { ParseHtml } from '../convert/dom';
import type { TandenEvent } from '../events';
import { discoverFeeds, looksLikeFeed, parseFeed, type Feed } from '../feed';
import { PLUGIN_API, splitPermission, type PluginManifest } from './manifest';

/*
 * Lado do app da API de plugins. A janela do plugin manda {m: "notas.ler",
 * a: [...]}; o host confere a permissão, valida os argumentos e chama o
 * serviço do app. Nada aqui conhece a interface: o app passa os serviços.
 */

export interface Fetched {
  url: string;
  status: number;
  type: string;
  data: Uint8Array;
}

/** O que o app oferece aos plugins. Uma instância por plugin. */
export interface PluginServices {
  parse: ParseHtml;
  notes: {
    list(): string[];
    read(path: string): string | null;
    /** cria ou substitui */
    write(path: string, text: string): void;
  };
  /** página web → nota (com imagens), na pasta dada; devolve o caminho */
  clip(url: string, folder: string): Promise<string | null>;
  fetch(url: string): Promise<Fetched>;
  notify(title: string, body: string): void;
  /** dados do próprio plugin neste aparelho */
  store: { get(key: string): unknown; set(key: string, value: unknown): void; remove(key: string): void; keys(): string[] };
  openNote(path: string): void;
  openLink(url: string): void;
  badge(count: number): void;
  subscribe(fn: (e: TandenEvent) => void): () => void;
  /** manda uma mensagem para a janela do plugin */
  push(msg: unknown): void;
}

type Args = unknown[];
interface Method {
  perms: string[];
  run(this: PluginHost, ...a: Args): unknown;
}

const TEXT_MAX = 5 * 1024 * 1024;
const IMAGE_MAX = 3 * 1024 * 1024;
const STORE_MAX = 2 * 1024 * 1024;
const NOTIFY_PER_MIN = 6;

export class PluginError extends Error {}

const str = (v: unknown, what: string, max = 10_000): string => {
  if (typeof v !== 'string' || !v.trim()) throw new PluginError(`${what} precisa ser um texto`);
  if (v.length > max) throw new PluginError(`${what} grande demais`);
  return v;
};

/** Caminho de nota seguro: relativo, sem "..", sem pastas ocultas, terminando em .md. */
export function notePath(v: unknown): string {
  const p = str(v, 'o caminho', 500).trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  if (p.startsWith('/') || p.split('/').some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) {
    throw new PluginError(`caminho inválido: ${p}`);
  }
  if (!p.endsWith('.md')) throw new PluginError('o caminho de uma nota termina em .md');
  return p;
}

function folderPath(v: unknown): string {
  const p = str(v, 'a pasta', 300).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (p.split('/').some((s) => !s || s === '..' || s.startsWith('.'))) throw new PluginError(`pasta inválida: ${p}`);
  return `${p}/`;
}

function httpUrl(v: unknown): URL {
  let u: URL;
  try {
    u = new URL(str(v, 'o endereço', 4000).trim());
  } catch {
    throw new PluginError('endereço inválido');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new PluginError('só endereços http:// ou https://');
  return u;
}

const hostMatches = (host: string, scope: string) =>
  scope.startsWith('*.') ? host === scope.slice(2) || host.endsWith(scope.slice(1)) : host === scope;

/** Texto de uma resposta, no charset que ela declara (cabeçalho, <?xml?> ou <meta>). */
export function decodeBody(data: Uint8Array, type: string): string {
  let charset = /charset=["']?([\w-]+)/i.exec(type)?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(data.subarray(0, 2048));
    charset = /<\?xml[^>]+encoding=["']([\w-]+)/i.exec(head)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(data);
  } catch {
    return new TextDecoder().decode(data);
  }
}

const toBase64 = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

function imageType(data: Uint8Array, declared: string): string | null {
  const h = Array.from(data.subarray(0, 12));
  if (h[0] === 0x89 && h[1] === 0x50) return 'image/png';
  if (h[0] === 0xff && h[1] === 0xd8) return 'image/jpeg';
  if (h[0] === 0x47 && h[1] === 0x49) return 'image/gif';
  if (h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50) return 'image/webp';
  if (h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70) return 'image/avif';
  // SVG fica de fora de propósito: é um documento, pode carregar scripts
  return /^image\/(png|jpeg|gif|webp|avif)$/.test(declared) ? declared : null;
}

const METHODS: Record<string, Method> = {
  'app.info': {
    perms: [],
    run() {
      return { api: PLUGIN_API, id: this.manifest.id, permissoes: [...this.granted] };
    },
  },
  'app.abrirNota': {
    perms: [],
    run(p) {
      this.services.openNote(notePath(p));
    },
  },
  'app.abrirLink': {
    perms: [],
    run(u) {
      this.services.openLink(httpUrl(u).href);
    },
  },
  'app.selo': {
    perms: [],
    run(n) {
      this.services.badge(typeof n === 'number' && n > 0 ? Math.min(Math.floor(n), 9999) : 0);
    },
  },

  'notas.listar': {
    perms: ['notas:ler'],
    run(folder) {
      const prefix = folder === undefined || folder === null || folder === '' ? '' : folderPath(folder);
      return this.services.notes.list().filter((p) => p.startsWith(prefix) && this.canRead(p));
    },
  },
  'notas.ler': {
    perms: ['notas:ler'],
    run(p) {
      const path = notePath(p);
      this.need('notas:ler', path);
      return this.services.notes.read(path);
    },
  },
  'notas.escrever': {
    perms: ['notas:escrever'],
    run(p, text) {
      const path = notePath(p);
      this.need('notas:escrever', path);
      if (typeof text !== 'string') throw new PluginError('o texto da nota precisa ser um texto');
      if (text.length > TEXT_MAX) throw new PluginError('nota grande demais');
      this.services.notes.write(path, text);
      return path;
    },
  },
  'notas.acrescentar': {
    perms: ['notas:escrever'],
    run(p, text) {
      const path = notePath(p);
      this.need('notas:escrever', path);
      const add = str(text, 'o texto', TEXT_MAX);
      // acrescentar não revela o conteúdo, então não pede notas:ler
      const old = this.services.notes.read(path) ?? '';
      this.services.notes.write(path, old && !old.endsWith('\n') ? `${old}\n${add}` : `${old}${add}`);
      return path;
    },
  },
  'notas.recortar': {
    perms: ['notas:escrever', 'rede'],
    async run(u, folder) {
      const url = httpUrl(u);
      this.needHost(url);
      const dir = folder === undefined || folder === null || folder === '' ? this.writeScope() ?? 'Web/' : folderPath(folder);
      this.need('notas:escrever', `${dir}x.md`);
      return this.services.clip(url.href, dir.slice(0, -1));
    },
  },

  'rede.buscar': {
    perms: ['rede'],
    async run(u) {
      const r = await this.get(httpUrl(u));
      if (r.data.length > TEXT_MAX) throw new PluginError('resposta grande demais (mais de 5 MB)');
      return { url: r.url, status: r.status, tipo: r.type, texto: decodeBody(r.data, r.type) };
    },
  },
  'rede.feed': {
    perms: ['rede'],
    async run(u) {
      return this.feed(httpUrl(u));
    },
  },
  'rede.imagem': {
    perms: ['rede'],
    async run(u) {
      const r = await this.get(httpUrl(u));
      if (r.status >= 400) throw new PluginError(`o site respondeu ${r.status}`);
      if (r.data.length > IMAGE_MAX) throw new PluginError('imagem grande demais');
      const type = imageType(r.data, r.type.split(';')[0]!.trim().toLowerCase());
      if (!type) throw new PluginError('não é uma imagem');
      return `data:${type};base64,${toBase64(r.data)}`;
    },
  },

  'avisos.notificar': {
    perms: ['avisos'],
    run(title, body) {
      const now = Date.now();
      this.notified = this.notified.filter((t) => now - t < 60_000);
      if (this.notified.length >= NOTIFY_PER_MIN) throw new PluginError('avisos demais em pouco tempo');
      this.notified.push(now);
      this.services.notify(str(title, 'o título', 200), typeof body === 'string' ? body.slice(0, 500) : '');
    },
  },

  'dados.ler': {
    perms: [],
    run(k) {
      return this.services.store.get(str(k, 'a chave', 200)) ?? null;
    },
  },
  'dados.gravar': {
    perms: [],
    run(k, v) {
      const key = str(k, 'a chave', 200);
      let json: string | undefined;
      try {
        json = JSON.stringify(v);
      } catch {
        throw new PluginError('o valor precisa ser um dado simples (texto, número, lista ou objeto)');
      }
      if (json === undefined) return this.services.store.remove(key);
      if (json.length > STORE_MAX) throw new PluginError('dado grande demais (mais de 2 MB)');
      this.services.store.set(key, JSON.parse(json));
    },
  },
  'dados.apagar': {
    perms: [],
    run(k) {
      this.services.store.remove(str(k, 'a chave', 200));
    },
  },
  'dados.chaves': {
    perms: [],
    run() {
      return this.services.store.keys();
    },
  },

  'eventos.ouvir': {
    perms: ['eventos'],
    run() {
      if (this.unsubscribe) return;
      this.unsubscribe = this.services.subscribe((e) => {
        // eventos de notas fora do escopo de leitura não chegam ao plugin
        if ('path' in e && e.path.endsWith('.md') && !this.canRead(e.path)) return;
        this.services.push({ tanden: 1, tipo: 'evento', evento: { ...e } });
      });
    },
  },
};

/** Nomes dos métodos da API (o SDK dentro da janela do plugin é gerado daqui). */
export const PLUGIN_METHODS = Object.keys(METHODS);

export class PluginHost {
  notified: number[] = [];
  unsubscribe: (() => void) | null = null;

  constructor(
    readonly manifest: PluginManifest,
    /** permissões aprovadas neste aparelho */
    readonly granted: string[],
    readonly services: PluginServices,
  ) {}

  /** Executa uma chamada do plugin. Erros viram mensagens legíveis para ele. */
  async call(method: unknown, args: unknown): Promise<unknown> {
    if (typeof method !== 'string' || !Object.hasOwn(METHODS, method)) throw new PluginError(`a API não tem "${String(method)}"`);
    const m = METHODS[method]!;
    for (const p of m.perms) {
      if (!this.has(p)) throw new PluginError(`sem permissão: ${p}`);
    }
    return m.run.apply(this, Array.isArray(args) ? args.slice(0, 8) : []);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Escopos aprovados de uma permissão ("" = sem restrição; null = não tem). */
  private scopes(base: string): string[] | null {
    const out: string[] = [];
    for (const g of this.granted) {
      const s = splitPermission(g);
      if (s.base === base) out.push(s.scope);
    }
    return out.length ? out : null;
  }

  has(base: string): boolean {
    return this.scopes(base) !== null;
  }

  canRead(path: string): boolean {
    const s = this.scopes('notas:ler');
    return !!s && s.some((x) => !x || path.startsWith(x));
  }

  /** Confere o escopo de pasta de uma permissão de notas. */
  need(base: 'notas:ler' | 'notas:escrever', path: string): void {
    const s = this.scopes(base) ?? [];
    if (!s.some((x) => !x || path.startsWith(x))) throw new PluginError(`sem permissão para ${path}`);
  }

  writeScope(): string | null {
    return this.scopes('notas:escrever')?.find((x) => x) ?? null;
  }

  needHost(url: URL): void {
    const s = this.scopes('rede') ?? [];
    if (!s.some((x) => !x || hostMatches(url.hostname, x))) throw new PluginError(`sem permissão para acessar ${url.hostname}`);
  }

  async get(url: URL): Promise<Fetched> {
    this.needHost(url);
    const r = await this.services.fetch(url.href);
    // um redirecionamento não pode levar para fora do escopo aprovado
    this.needHost(new URL(r.url || url.href));
    return r;
  }

  /** Feed do endereço; se for uma página, procura o feed que ela anuncia. */
  async feed(url: URL): Promise<{ url: string; feed: Feed }> {
    const r = await this.get(url);
    if (r.status >= 400) throw new PluginError(`o site respondeu ${r.status}`);
    const body = decodeBody(r.data, r.type);
    if (looksLikeFeed(body)) return { url: r.url || url.href, feed: parseFeed(body, r.url || url.href, this.services.parse) };
    const found = discoverFeeds(body, r.url || url.href, this.services.parse);
    if (!found.length) throw new PluginError('não achei um feed nesse endereço');
    const f = await this.get(new URL(found[0]!.url));
    if (f.status >= 400) throw new PluginError(`o feed respondeu ${f.status}`);
    return { url: f.url || found[0]!.url, feed: parseFeed(decodeBody(f.data, f.type), f.url || found[0]!.url, this.services.parse) };
  }
}
