import { fromBytes, toBytes } from '@tanden/core';
import { listen } from '@tauri-apps/api/event';
import { engine } from './engine.svelte';
import { isTauri } from './storage-tauri';

/*
 * Snippets de CSS, como no Obsidian: arquivos .css em `Snippets/` (vão junto
 * no sync) ou em `.obsidian/snippets/` (os do Obsidian servem aqui também).
 * Cada aparelho escolhe quais ficam ligados. Valem na hora e podem mexer em
 * tudo: as variáveis do tema (--ember, --void, --f-body...) ou qualquer tela.
 */

const ON = 'tanden.snippets';
export const SNIPPET_DIRS = ['Snippets/', '.obsidian/snippets/'];
const isSnippet = (p: string) => p.endsWith('.css') && SNIPPET_DIRS.some((d) => p.startsWith(d) && !p.slice(d.length).includes('/'));

export const SNIPPET_TEMPLATE = `/* Snippet do Tanden. Ligue em Aparência → Snippets CSS.
   Variáveis do tema: --void (fundo), --surface, --surface-2, --line,
   --ink (texto), --muted, --ember (destaque), --f-body, --f-display, --f-mono. */

:root {
  /* --ember: #ff8a3d; */
}

/* exemplo: notas com letra serifada e linhas mais largas
.cm-content { font-family: Georgia, serif; font-size: 16px; }
*/
`;

function loadOn(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ON) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

class Snippets {
  /** caminhos dos snippets no cofre */
  list = $state<string[]>([]);
  /** ligados neste aparelho */
  on = $state<string[]>(loadOn());
  error = $state('');
  private styles = new Map<string, HTMLStyleElement>();
  private started = false;

  start(): void {
    if (this.started || !engine.ready) return;
    this.started = true;
    void this.reload();
    engine.bus.on('sync.finished', () => void this.reload());
    if (isTauri()) {
      void listen<string[]>('vault-changed', (e) => {
        if (e.payload.some((p) => p.endsWith('.css'))) void this.reload();
      });
    }
  }

  /** Relê a lista e o conteúdo dos ligados (editar o .css em outro programa vale na hora). */
  async reload(): Promise<void> {
    try {
      const all = await engine.storage.list();
      this.list = all.filter(isSnippet).sort((a, b) => name(a).localeCompare(name(b), 'pt-BR'));
      for (const p of [...this.styles.keys()]) if (!this.list.includes(p) || !this.on.includes(p)) this.detach(p);
      for (const p of this.on) if (this.list.includes(p)) await this.attach(p);
      this.error = '';
    } catch (e) {
      this.error = String(e);
    }
  }

  async read(path: string): Promise<string> {
    const b = await engine.storage.read(path);
    return b ? fromBytes(b) : '';
  }

  private async attach(path: string): Promise<void> {
    const css = await this.read(path);
    let el = this.styles.get(path);
    if (!el) {
      el = document.createElement('style');
      el.dataset.snippet = path;
      document.head.appendChild(el);
      this.styles.set(path, el);
    }
    if (el.textContent !== css) el.textContent = css;
  }

  private detach(path: string): void {
    this.styles.get(path)?.remove();
    this.styles.delete(path);
  }

  async toggle(path: string, on = !this.on.includes(path)): Promise<void> {
    this.on = on ? [...new Set([...this.on, path])] : this.on.filter((p) => p !== path);
    try {
      localStorage.setItem(ON, JSON.stringify(this.on));
    } catch {
      /* vale só nesta sessão */
    }
    if (on) await this.attach(path);
    else this.detach(path);
  }

  /** Grava (e aplica, se ligado). O .css vai para o Drive no próximo sync. */
  async save(path: string, css: string): Promise<void> {
    await engine.storage.write(path, toBytes(css));
    if (!this.list.includes(path)) this.list = [...this.list, path].sort((a, b) => name(a).localeCompare(name(b), 'pt-BR'));
    if (this.on.includes(path)) await this.attach(path);
    void engine.syncNow();
  }

  async create(base: string): Promise<string> {
    const clean = base.replace(/[\\/:*?"<>|]/g, '').trim() || 'meu-estilo';
    let p = `Snippets/${clean}.css`;
    let n = 1;
    while (this.list.includes(p)) p = `Snippets/${clean}-${++n}.css`;
    await this.save(p, SNIPPET_TEMPLATE);
    await this.toggle(p, true);
    return p;
  }

  async remove(path: string): Promise<void> {
    await this.toggle(path, false);
    await engine.storage.remove(path);
    this.list = this.list.filter((p) => p !== path);
    void engine.syncNow();
  }

  /** Desliga todos de uma vez (um snippet quebrou a tela). */
  async allOff(): Promise<void> {
    for (const p of [...this.on]) await this.toggle(p, false);
  }
}

export const name = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.css$/, '');
export const snippets = new Snippets();
