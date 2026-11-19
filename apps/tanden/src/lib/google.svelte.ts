import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './storage-tauri';

// Conexão com a conta Google (só no app instalado; o login roda no lado Rust).
type Status = {
  configured: boolean;
  signed_in: boolean;
  email: string | null;
  calendar: boolean;
  /** o celular entra pelo cliente Android e volta sozinho ao app (deep link) */
  mobile_client: boolean;
  mobile: boolean;
  /** há um login esperando a volta do navegador */
  pending: boolean;
};

const EMPTY: Status = { configured: false, signed_in: false, email: null, calendar: false, mobile_client: false, mobile: false, pending: false };

class Google {
  available = isTauri();
  status = $state<Status>({ ...EMPTY });
  busy = $state(false);
  error = $state('');
  /** quem precisa saber que a conta mudou (o Drive liga/desliga, a Agenda relê) */
  private listeners = new Set<() => void>();
  private listening = false;

  /** Avisa quando a conta entra, sai ou perde o acesso. Devolve como parar de ouvir. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  async refresh(): Promise<void> {
    if (!this.available) return;
    this.status = await invoke<Status>('google_status');
    if (!this.listening) {
      this.listening = true;
      // o login terminou por deep link (app reaberto) ou o Google revogou o acesso
      void listen<string>('google-changed', async (e) => {
        if (e.payload) this.error = e.payload;
        this.status = await invoke<Status>('google_status');
        this.changed();
      });
    }
  }

  async setCredentials(clientId: string, clientSecret: string, androidClientId?: string): Promise<void> {
    await invoke('google_set_credentials', { clientId, clientSecret, androidClientId: androidClientId ?? null });
    await this.refresh();
  }

  async signIn(): Promise<boolean> {
    this.busy = true;
    this.error = '';
    try {
      this.status = await invoke<Status>('google_sign_in');
      this.changed();
      return true;
    } catch (e) {
      this.error = String(e);
      // o login pode ter terminado por outro caminho (endereço colado, deep link)
      await this.refresh().catch(() => {});
      if (this.status.signed_in) {
        this.error = '';
        this.changed();
        return true;
      }
      return false;
    } finally {
      this.busy = false;
    }
  }

  /** Termina o login com o endereço que o navegador mostrou depois de entrar. */
  async finishWithUrl(url: string): Promise<boolean> {
    this.error = '';
    try {
      this.status = await invoke<Status>('google_finish_url', { url });
      if (this.status.signed_in) this.changed();
      return true;
    } catch (e) {
      this.error = String(e);
      return false;
    }
  }

  async cancel(): Promise<void> {
    await invoke('google_cancel').catch(() => {});
    await this.refresh();
  }

  async signOut(): Promise<void> {
    await invoke('google_sign_out');
    await this.refresh();
    this.changed();
  }

  token = async (): Promise<string> => {
    try {
      return await invoke<string>('google_access_token');
    } catch (e) {
      // acesso revogado: o Rust já saiu da conta; a tela passa a pedir o login
      void this.refresh().catch(() => {});
      throw new Error(String(e));
    }
  };
}

export const google = new Google();
