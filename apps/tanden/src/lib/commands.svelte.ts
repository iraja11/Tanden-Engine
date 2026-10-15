/*
 * Comandos do Tanden: tudo que a paleta (Ctrl+P) lista e que pode ter um
 * atalho. Cada comando tem atalhos padrão; quem usa pode trocar, tirar ou
 * acrescentar atalhos (Aparência → Atalhos). A escolha fica salva por
 * aparelho, como o tema: o teclado do PC e o do celular são diferentes.
 *
 * Os atalhos de formatação de dentro do editor (Ctrl+B, Ctrl+Alt+1...) são
 * do próprio editor e não passam por aqui.
 */

export interface Command {
  /** identificador estável (é ele que guarda o atalho escolhido) */
  id: string;
  label: string;
  /** palavras extras para a busca da paleta */
  keys?: string;
  /** atalhos padrão, como "Ctrl+Shift+K" (Ctrl vale também o Cmd do Mac) */
  hotkeys?: string[];
  /** só aparece e só roda quando isto for verdadeiro */
  when?: () => unknown;
  run: () => void;
}

import { comboOf, normalizeCombo } from '@tanden/core';

export { comboOf, normalizeCombo };

const KEY = 'tanden.atalhos';

const editable = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"], .cm-editor');

function load(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [id, v] of Object.entries(raw)) if (Array.isArray(v)) out[id] = v.filter((x): x is string => typeof x === 'string').map(normalizeCombo);
    return out;
  } catch {
    return {};
  }
}

class Commands {
  /** comandos registrados (a paleta lista estes) */
  list = $state.raw<Command[]>([]);
  /** atalhos trocados por quem usa: id → atalhos (lista vazia = sem atalho) */
  custom = $state<Record<string, string[]>>(load());

  /** Registra comandos; devolve a função que tira eles de novo. Um id repetido substitui o antigo. */
  register(cmds: Command[]): () => void {
    const ids = new Set(cmds.map((c) => c.id));
    this.list = [...this.list.filter((c) => !ids.has(c.id)), ...cmds];
    return () => {
      this.list = this.list.filter((c) => !cmds.includes(c));
    };
  }

  hotkeysOf(id: string): string[] {
    return this.custom[id] ?? this.list.find((c) => c.id === id)?.hotkeys?.map(normalizeCombo) ?? [];
  }

  isCustom(id: string): boolean {
    return id in this.custom;
  }

  /** Comandos que usam este atalho (para avisar de conflito). */
  using(combo: string): Command[] {
    const c = normalizeCombo(combo);
    return this.list.filter((x) => this.hotkeysOf(x.id).includes(c));
  }

  run(id: string): boolean {
    const c = this.list.find((x) => x.id === id);
    if (!c || (c.when && !c.when())) return false;
    c.run();
    return true;
  }

  /**
   * Teclado global: roda o comando daquele atalho. Não rouba o que outro
   * componente já tratou (Ctrl+K com texto selecionado vira link no editor), e
   * atalho sem Ctrl/Alt não dispara enquanto se digita.
   */
  handle(e: KeyboardEvent): boolean {
    if (e.defaultPrevented || e.isComposing) return false;
    const combo = comboOf(e);
    if (!combo) return false;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (plain && editable(e.target) && !/^F\d+$/.test(combo.replace(/^Shift\+/, ''))) return false;
    for (const c of this.list) {
      if (!this.hotkeysOf(c.id).includes(combo) || (c.when && !c.when())) continue;
      e.preventDefault();
      c.run();
      return true;
    }
    return false;
  }

  setHotkeys(id: string, combos: string[]): void {
    this.custom = { ...this.custom, [id]: [...new Set(combos.map(normalizeCombo))] };
    this.save();
  }

  reset(id?: string): void {
    if (id === undefined) this.custom = {};
    else {
      const { [id]: _, ...rest } = this.custom;
      this.custom = rest;
    }
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.custom));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
}

export const commands = new Commands();
