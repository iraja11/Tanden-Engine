import { Channel, invoke } from '@tauri-apps/api/core';
import { ollama } from '../../../ollama.svelte';
import { isTauri } from '../../../storage-tauri';

// IA local opcional: tudo aqui funciona sem ela. Com o Ollama ligado no app
// instalado, o oráculo e a entrevista ganham um botão para improvisar.

let procurou = false;

/** Procura os modelos uma vez por sessão; sem Ollama, os botões de IA nem aparecem. */
export async function prepararIa(): Promise<void> {
  if (procurou || !isTauri()) return;
  procurou = true;
  await ollama.loadModels().catch(() => undefined);
}

export const iaPronta = (): boolean => isTauri() && !!ollama.model && ollama.models.length > 0;

/** Pede um texto ao modelo, sem passar pelo histórico do painel de IA. */
export async function improvisar(pedido: string, aoEscrever: (trecho: string) => void): Promise<void> {
  const onToken = new Channel<string>();
  onToken.onmessage = aoEscrever;
  await invoke('ollama_chat', { url: ollama.url, model: ollama.model, messages: [{ role: 'user', content: pedido }], onToken });
}
