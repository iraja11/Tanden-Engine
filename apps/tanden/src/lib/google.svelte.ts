import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './storage-tauri';

// Conexão com a conta Google (só no app instalado; o login roda no lado Rust).
type Status = { configured: boolean; signed_in: boolean; email: string | null };

class Google {
  available = isTauri();
  status = $state<Status>({ configured: false, signed_in: false, email: null });
  busy = $state(false);
  error = $state('');

  async refresh(): Promise<void> {
    if (this.available) this.status = await invoke<Status>('google_status');
  }

  async setCredentials(clientId: string, clientSecret: string): Promise<void> {
    await invoke('google_set_credentials', { clientId, clientSecret });
    await this.refresh();
  }

  async signIn(): Promise<boolean> {
    this.busy = true;
    this.error = '';
    try {
      this.status = await invoke<Status>('google_sign_in');
      return true;
    } catch (e) {
      this.error = String(e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  async signOut(): Promise<void> {
    await invoke('google_sign_out');
    await this.refresh();
  }

  token = (): Promise<string> => invoke<string>('google_access_token');
}

export const google = new Google();
