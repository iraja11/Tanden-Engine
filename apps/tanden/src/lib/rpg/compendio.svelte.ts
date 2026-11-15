import { Compendium, type CompendiumData, type Edition } from '@tanden/core';

/*
 * O compêndio de D&D 5e (classes, magias, itens, regras) gerado do 5etools
 * por `scripts/compendio-5e.mjs`. Carrega na primeira vez que alguém
 * precisa (assistente, subida de nível, consulta) e fica na memória.
 *
 * Também guarda a pilha do leitor de regras: clicar num link de magia,
 * condição ou item em qualquer ficha abre a entrada por cima da tela.
 */

const ED_KEY = 'tanden.compendio.edicao';

class CompendioStore {
  comp = $state.raw<Compendium | null>(null);
  status = $state<'idle' | 'loading' | 'ok' | 'missing'>('idle');
  /** edição da tela de consulta (as fichas usam a delas) */
  edition = $state<Edition>((() => { try { return localStorage.getItem(ED_KEY) === '2014' ? '2014' : '2024'; } catch { return '2024'; } })());
  /** referências abertas no leitor ("spell|Fireball|XPHB"), a última por cima */
  stack = $state<Array<{ ref: string; ed: Edition }>>([]);
  private pending: Promise<Compendium | null> | null = null;

  /** Carrega uma vez; devolve null se o arquivo não foi gerado. */
  load(): Promise<Compendium | null> {
    if (this.comp) return Promise.resolve(this.comp);
    if (this.pending) return this.pending;
    this.status = 'loading';
    this.pending = fetch('/compendio/5e.json')
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as CompendiumData;
        this.comp = new Compendium(data);
        this.status = 'ok';
        return this.comp;
      })
      .catch(() => {
        this.status = 'missing';
        this.pending = null;
        return null;
      });
    return this.pending;
  }

  setEdition(ed: Edition): void {
    this.edition = ed;
    try { localStorage.setItem(ED_KEY, ed); } catch { /* sem armazenamento */ }
  }

  /** Abre uma entrada no leitor ("tipo|nome|fonte"). */
  open(ref: string, ed: Edition = this.edition): void {
    void this.load();
    const top = this.stack[this.stack.length - 1];
    if (top?.ref === ref) return;
    this.stack = [...this.stack, { ref, ed }];
  }

  back(): void {
    this.stack = this.stack.slice(0, -1);
  }

  close(): void {
    this.stack = [];
  }

  /** Trata cliques em links do texto das regras (<a class="cref">). Devolve true se abriu algo. */
  click(e: MouseEvent, ed: Edition = this.edition): boolean {
    const a = (e.target as HTMLElement | null)?.closest?.('a.cref') as HTMLElement | null;
    const ref = a?.dataset['ref'];
    if (!ref) return false;
    e.preventDefault();
    e.stopPropagation();
    this.open(ref, ed);
    return true;
  }
}

export const compendio = new CompendioStore();
