import {
  PluginHost,
  hashHex,
  manifestFromHtml,
  missingPermissions,
  pluginDocument,
  type Fetched,
  type PluginManifest,
  type PluginServices,
} from '@tanden/core';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import * as notif from '@tauri-apps/plugin-notification';
import { engine } from '../engine.svelte';
import { files, parse } from '../files/files.svelte';
import { desktop } from '../platform';
import { isTauri } from '../storage-tauri';
import { theme } from '../theme.svelte';
import noticiasHtml from '../../plugins/noticias.html?raw';

/*
 * Plugins: páginas HTML que rodam isoladas e falam com o app pela API do
 * núcleo (PluginHost). Os embutidos vêm com o app; os instalados ficam em
 * Plugins/<id>.html no cofre e chegam aos outros aparelhos pelo sync. As
 * permissões são aprovadas em cada aparelho: um plugin que chega pelo Drive
 * não faz nada até você permitir.
 */

export const PLUGIN_DIR = 'Plugins';
const KEY_GRANTS = 'tanden.plugins';
const KEY_REMOVED = 'tanden.plugins.removidos';
const CHANNEL = 'plugins';
const android = isTauri() && !desktop;

export interface PluginEntry {
  manifest: PluginManifest;
  /** HTML original do plugin */
  html: string;
  source: 'embutido' | 'instalado';
  /** arquivo no cofre (instalados) */
  path: string | null;
  hash: string;
}

interface Grant {
  perms: string[];
  on: boolean;
}

const BUILTIN = [noticiasHtml];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function fetchRaw(url: string): Promise<Fetched> {
  if (isTauri()) {
    const r = await invoke<{ url: string; status: number; content_type: string; body: string }>('web_fetch', { url, allowPrivate: false });
    return { url: r.url, status: r.status, type: r.content_type, data: b64bytes(r.body) };
  }
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('o navegador bloqueou o acesso a esse site. No app instalado (PC e celular) funciona.');
  }
  return { url: res.url || url, status: res.status, type: res.headers.get('content-type') ?? '', data: new Uint8Array(await res.arrayBuffer()) };
}

/** Cores do tema como variáveis CSS, para a janela do plugin seguir o app. */
function themeMessage() {
  const vars: Record<string, string> = {};
  const style = document.documentElement.style;
  for (let i = 0; i < style.length; i++) {
    const k = style[i]!;
    if (k.startsWith('--')) vars[k] = style.getPropertyValue(k);
  }
  return { tanden: 1, tipo: 'tema', tema: { vars, escuro: theme.dark, movimento: theme.motion, destaque: vars['--ember'] ?? '' } };
}

class Plugins {
  list = $state<PluginEntry[]>([]);
  grants = $state<Record<string, Grant>>(load(KEY_GRANTS, {}));
  /** número no botão de cada plugin na barra */
  badges = $state<Record<string, number>>({});
  /** última falha de cada plugin (erro de script, permissão negada...) */
  errors = $state<Record<string, string>>({});
  /** plugins cuja janela já foi aberta nesta sessão (seguem vivos escondidos) */
  opened = $state<Record<string, boolean>>({});
  /** pedido de permissão na tela */
  asking = $state<{ entry: PluginEntry; missing: string[]; then?: () => void } | null>(null);
  /** pedido para o app mostrar a tela de um plugin */
  goto = $state<{ id: string; seq: number } | null>(null);
  private removed = load<Record<string, string>>(KEY_REMOVED, {});
  private hosts = new Map<string, PluginHost>();
  private windows = new Map<string, Window>();
  private shown = new Map<string, boolean>();
  private started = false;
  private seq = 0;
  private channelReady = false;

  /** Plugins ligados e com todas as permissões aprovadas. */
  get active(): PluginEntry[] {
    return this.list.filter((e) => this.grants[e.manifest.id]?.on && this.missing(e).length === 0);
  }

  /** Janelas montadas: as de fundo e as que já foram abertas. */
  get mounted(): PluginEntry[] {
    return this.active.filter((e) => e.manifest.fundo || this.opened[e.manifest.id]);
  }

  /** Plugins com tela, para a barra lateral. */
  get rail(): PluginEntry[] {
    return this.active.filter((e) => e.manifest.tela);
  }

  missing(e: PluginEntry): string[] {
    return missingPermissions(e.manifest.permissoes, this.grants[e.manifest.id]?.perms ?? []);
  }

  status(e: PluginEntry): 'ativo' | 'desligado' | 'permissao' {
    const g = this.grants[e.manifest.id];
    if (!g?.on) return 'desligado';
    return this.missing(e).length ? 'permissao' : 'ativo';
  }

  async start(): Promise<void> {
    if (this.started || !engine.ready) return;
    this.started = true;
    await this.refresh();
    engine.bus.on('sync.finished', () => void this.refresh());
  }

  /** Relê os embutidos e a pasta Plugins/ do cofre. */
  async refresh(): Promise<void> {
    const out: PluginEntry[] = [];
    for (const html of BUILTIN) {
      out.push({ manifest: manifestFromHtml(html), html, source: 'embutido', path: null, hash: hashHex(html) });
    }
    const builtinIds = new Set(out.map((e) => e.manifest.id));
    const paths = (await engine.storage.list(`${PLUGIN_DIR}/`)).filter((p) => p.toLowerCase().endsWith('.html'));
    for (const path of paths) {
      const bytes = await engine.storage.read(path);
      if (!bytes) continue;
      const html = new TextDecoder().decode(bytes);
      const hash = hashHex(html);
      try {
        const manifest = manifestFromHtml(html, path.split('/').pop()!.replace(/\.html$/i, ''));
        // removido neste aparelho: o sync pode trazer o arquivo de volta
        if (this.removed[manifest.id] === hash) {
          void engine.storage.remove(path).catch(() => {});
          continue;
        }
        if (builtinIds.has(manifest.id) || out.some((e) => e.manifest.id === manifest.id)) continue;
        out.push({ manifest, html, source: 'instalado', path, hash });
      } catch (err) {
        this.errors = { ...this.errors, [path]: String(err instanceof Error ? err.message : err) };
      }
    }
    // plugin que mudou de versão: a janela recarrega com o código novo
    for (const e of out) {
      const old = this.list.find((x) => x.manifest.id === e.manifest.id);
      if (old && old.hash !== e.hash) this.unload(e.manifest.id);
    }
    this.list = out;
  }

  /** Liga um plugin; pede as permissões que faltam. */
  enable(e: PluginEntry, then?: () => void): void {
    const missing = this.missing(e);
    if (missing.length) {
      this.asking = { entry: e, missing, then };
      return;
    }
    this.setGrant(e.manifest.id, { perms: this.grants[e.manifest.id]?.perms ?? [], on: true });
    then?.();
  }

  approve(): void {
    const a = this.asking;
    if (!a) return;
    const id = a.entry.manifest.id;
    const perms = [...new Set([...(this.grants[id]?.perms ?? []), ...a.missing])];
    this.setGrant(id, { perms, on: true });
    this.asking = null;
    a.then?.();
  }

  deny(): void {
    this.asking = null;
  }

  disable(e: PluginEntry): void {
    const id = e.manifest.id;
    this.setGrant(id, { perms: this.grants[id]?.perms ?? [], on: false });
    this.unload(id);
  }

  /** Esquece as permissões dadas (o plugin volta a pedir ao ligar). */
  revoke(e: PluginEntry): void {
    const id = e.manifest.id;
    this.setGrant(id, { perms: [], on: false });
    this.unload(id);
  }

  private setGrant(id: string, g: Grant): void {
    this.grants = { ...this.grants, [id]: g };
    save(KEY_GRANTS, this.grants);
  }

  open(id: string): void {
    this.opened = { ...this.opened, [id]: true };
    this.goto = { id, seq: ++this.seq };
  }

  /** Instala um HTML (arquivo ou artefato colado). Devolve o plugin instalado. */
  async install(html: string, fileName = 'mini-app'): Promise<PluginEntry> {
    if (html.length > 16 * 1024 * 1024) throw new Error('arquivo grande demais (mais de 16 MB)');
    if (!/<[a-z!]/i.test(html)) throw new Error('isso não parece HTML');
    const manifest = manifestFromHtml(html, fileName);
    const existing = this.list.find((e) => e.manifest.id === manifest.id);
    if (existing?.source === 'embutido') throw new Error(`"${manifest.id}" é o id de um plugin que já vem com o app`);
    const path = existing?.path ?? `${PLUGIN_DIR}/${manifest.id}.html`;
    await engine.storage.write(path, new TextEncoder().encode(html));
    delete this.removed[manifest.id];
    save(KEY_REMOVED, this.removed);
    await this.refresh();
    void engine.syncNow();
    return this.list.find((e) => e.manifest.id === manifest.id)!;
  }

  async remove(e: PluginEntry): Promise<void> {
    if (e.source !== 'instalado' || !e.path) return;
    this.revoke(e);
    this.removed[e.manifest.id] = e.hash;
    save(KEY_REMOVED, this.removed);
    await engine.storage.remove(e.path);
    const { [e.manifest.id]: _, ...rest } = this.grants;
    this.grants = rest;
    save(KEY_GRANTS, this.grants);
    await this.refresh();
  }

  /* ------------------------------------------------------------- janelas */

  /** Endereço da janela (app instalado) ou documento para srcdoc (navegador). */
  async frameSource(e: PluginEntry): Promise<{ src: string } | { srcdoc: string }> {
    const doc = pluginDocument(e.html);
    if (!isTauri()) return { srcdoc: doc };
    await invoke('plugin_stage', { id: e.manifest.id, html: doc });
    return { src: `${convertFileSrc(e.manifest.id, 'tplugin')}?v=${e.hash.slice(0, 12)}` };
  }

  attach(e: PluginEntry, win: Window): void {
    const id = e.manifest.id;
    this.hosts.get(id)?.dispose();
    this.windows.set(id, win);
    const grant = this.grants[id]?.perms ?? [];
    this.hosts.set(id, new PluginHost(e.manifest, grant, this.services(e)));
    const { [id]: _, ...rest } = this.errors;
    this.errors = rest;
  }

  detach(id: string): void {
    this.hosts.get(id)?.dispose();
    this.hosts.delete(id);
    this.windows.delete(id);
    if (isTauri()) void invoke('plugin_unstage', { id }).catch(() => {});
  }

  private unload(id: string): void {
    const { [id]: _, ...rest } = this.opened;
    this.opened = rest;
    const { [id]: __, ...b } = this.badges;
    this.badges = b;
  }

  /** Mensagem vinda da janela de um plugin (o componente já conferiu a origem). */
  async handle(id: string, data: unknown): Promise<void> {
    const win = this.windows.get(id);
    const host = this.hosts.get(id);
    if (!win || !host || !data || typeof data !== 'object') return;
    const d = data as { tanden?: unknown; tipo?: unknown; id?: unknown; m?: unknown; a?: unknown; erro?: unknown };
    if (d.tanden !== 1) return;
    if (d.tipo === 'pronto') {
      win.postMessage(themeMessage(), '*');
      win.postMessage({ tanden: 1, tipo: 'visivel', visivel: this.shown.get(id) ?? false }, '*');
      return;
    }
    if (d.tipo === 'erro') {
      this.errors = { ...this.errors, [id]: String(d.erro).slice(0, 300) };
      return;
    }
    if (d.tipo !== 'chamada' || typeof d.id !== 'number') return;
    try {
      const valor = await host.call(d.m, d.a);
      win.postMessage({ tanden: 1, tipo: 'resposta', id: d.id, ok: true, valor }, '*');
    } catch (err) {
      win.postMessage({ tanden: 1, tipo: 'resposta', id: d.id, ok: false, erro: err instanceof Error ? err.message : String(err) }, '*');
    }
  }

  /** Manda o tema atual para todas as janelas (o app chama quando o tema muda). */
  broadcastTheme(): void {
    const msg = themeMessage();
    for (const w of this.windows.values()) w.postMessage(msg, '*');
  }

  visible(id: string, on: boolean): void {
    this.shown.set(id, on);
    this.windows.get(id)?.postMessage({ tanden: 1, tipo: 'visivel', visivel: on }, '*');
  }

  private services(e: PluginEntry): PluginServices {
    const id = e.manifest.id;
    const storeKey = `tanden.plugin.${id}`;
    let data = load<Record<string, unknown>>(storeKey, {});
    return {
      parse,
      notes: {
        list: () => engine.vault.list(),
        read: (p) => (engine.vault.has(p) ? engine.vault.read(p) : null),
        write: (p, text) => engine.writeNote(p, text),
      },
      clip: (url, folder) => files.clip(url, 'note', null, { folder, open: false, allowPrivate: false }),
      fetch: (url) => engine.bus.process(`plugin:${id}:${url}`, e.manifest.nome, () => fetchRaw(url)),
      notify: (title, body) => void this.notify(e, title, body),
      store: {
        get: (k) => data[k],
        set: (k, v) => {
          data = { ...data, [k]: v };
          save(storeKey, data);
        },
        remove: (k) => {
          const { [k]: _, ...rest } = data;
          data = rest;
          save(storeKey, data);
        },
        keys: () => Object.keys(data),
      },
      openNote: (p) => files.openPath(p),
      openLink: (url) => void files.openLink(url),
      badge: (n) => (this.badges = { ...this.badges, [id]: n }),
      subscribe: (fn) => engine.bus.on('*', fn),
      push: (msg) => this.windows.get(id)?.postMessage(msg, '*'),
    };
  }

  private async notify(e: PluginEntry, title: string, body: string): Promise<void> {
    const text = body ? `${body}\n${e.manifest.nome}` : e.manifest.nome;
    if (isTauri()) {
      if (!(await notif.isPermissionGranted()) && (await notif.requestPermission()) !== 'granted') return;
      if (android && !this.channelReady) {
        await notif.createChannel({ id: CHANNEL, name: 'Plugins', description: 'Avisos dos plugins do Tanden', importance: notif.Importance.Default });
        this.channelReady = true;
      }
      notif.sendNotification({ title, body: text, channelId: android ? CHANNEL : undefined, autoCancel: true });
    } else if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission !== 'granted') return;
      const n = new Notification(title, { body: text, icon: '/tanden.svg', tag: `${e.manifest.id}:${title}` });
      n.onclick = () => {
        window.focus();
        this.open(e.manifest.id);
      };
    }
  }
}

export const plugins = new Plugins();
