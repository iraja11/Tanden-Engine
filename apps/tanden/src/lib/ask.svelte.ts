/*
 * Perguntas ao usuário (confirmar, digitar um nome) num diálogo do próprio app.
 * Substitui confirm() e prompt(), que no WebView do celular podem não aparecer
 * (e quando aparecem, fogem do tema).
 */

export interface AskRequest {
  title: string;
  detail?: string;
  /** texto do botão de confirmar */
  ok: string;
  /** ação que apaga ou desfaz algo: botão vermelho */
  danger?: boolean;
  /** pede um texto (como prompt): valor inicial */
  value?: string;
  placeholder?: string;
  resolve: (v: string | boolean | null) => void;
}

class Ask {
  current = $state<AskRequest | null>(null);

  /** Pergunta sim/não. */
  confirm(title: string, opts: { detail?: string; ok?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.cancel();
      this.current = { title, ok: opts.ok ?? 'Confirmar', detail: opts.detail, danger: opts.danger, resolve: (v) => resolve(v === true) };
    });
  }

  /** Pede um texto. Devolve null se cancelar. */
  text(title: string, value = '', opts: { detail?: string; ok?: string; placeholder?: string } = {}): Promise<string | null> {
    return new Promise((resolve) => {
      this.cancel();
      this.current = {
        title,
        value,
        ok: opts.ok ?? 'OK',
        detail: opts.detail,
        placeholder: opts.placeholder,
        resolve: (v) => resolve(typeof v === 'string' ? v : null),
      };
    });
  }

  answer(v: string | boolean | null): void {
    const c = this.current;
    this.current = null;
    c?.resolve(v);
  }

  cancel(): void {
    if (this.current) this.answer(null);
  }
}

export const ask = new Ask();
