import { Channel, invoke } from '@tauri-apps/api/core';
import { engine } from './engine.svelte';
import { isTauri } from './storage-tauri';

// Chat com o Ollama (IA local, grátis e offline). No celular, aponte o
// endereço para o PC, ex.: http://192.168.0.10:11434 (no PC, rode o Ollama
// com OLLAMA_HOST=0.0.0.0 para aceitar a rede de casa).

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const KEY = 'tanden.ollama';

function saved(): { url: string; model: string } {
  try {
    return { url: 'http://localhost:11434', model: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { url: 'http://localhost:11434', model: '' };
  }
}

class Ollama {
  url = $state(saved().url);
  model = $state(saved().model);
  models = $state<string[]>([]);
  messages = $state<ChatMessage[]>([]);
  /** manda a nota aberta junto, como contexto */
  withNote = $state(true);
  thinking = $state(false);
  error = $state('');

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ url: this.url, model: this.model }));
    } catch {
      // sem armazenamento: só não lembra a escolha
    }
  }

  async loadModels(): Promise<void> {
    this.error = '';
    if (!isTauri()) {
      this.error = 'O Ollama funciona no app instalado.';
      return;
    }
    try {
      this.models = await invoke<string[]>('ollama_models', { url: this.url });
      if (!this.models.includes(this.model)) this.model = this.models[0] ?? '';
      if (this.models.length === 0) this.error = 'Nenhum modelo instalado. No PC: ollama pull llama3.1:8b';
      this.save();
    } catch (e) {
      this.models = [];
      this.error = String(e);
    }
  }

  setModel(m: string): void {
    this.model = m;
    this.save();
  }

  clear(): void {
    this.messages = [];
    this.error = '';
  }

  async send(text: string): Promise<void> {
    if (!text.trim() || this.thinking || !this.model) return;
    this.error = '';
    this.messages = [...this.messages, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    const answer = this.messages.length - 1;
    const context =
      this.withNote && engine.active
        ? [{ role: 'system', content: `Nota aberta no Tanden ("${engine.active}"):\n\n${engine.content}` }]
        : [];
    const history = this.messages.slice(0, -1).map(({ role, content }) => ({ role, content }));
    const onToken = new Channel<string>();
    onToken.onmessage = (t) => {
      this.messages[answer]!.content += t;
    };
    this.thinking = true;
    try {
      // enquanto o modelo escreve, as veias fluem
      await engine.bus.process('ollama', `${this.model} pensando`, () =>
        invoke('ollama_chat', { url: this.url, model: this.model, messages: [...context, ...history], onToken }),
      );
      engine.pulse('editor', 'out');
    } catch (e) {
      this.error = String(e);
      if (!this.messages[answer]!.content) this.messages = this.messages.slice(0, -1);
    } finally {
      this.thinking = false;
    }
  }

  /** acrescenta uma resposta ao fim da nota aberta */
  insert(content: string): void {
    if (!engine.active) return;
    engine.edit(`${engine.content.replace(/\s*$/, '')}\n\n${content.trim()}\n`);
    engine.pulse('editor', 'in');
  }
}

export const ollama = new Ollama();
