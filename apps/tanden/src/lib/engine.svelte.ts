import { AnnotationStore, BoardStore, DriveRemote, EventBus, Replicator, SheetStore, Vault, fullSync, type Storage, type TandenEvent } from '@tanden/core';
import { listen } from '@tauri-apps/api/event';
import { google } from './google.svelte';
import { BrowserStorage } from './storage-browser';
import { TauriStorage, isTauri, vaultRoot } from './storage-tauri';

// Estado vivo do app. Os componentes leem daqui; o núcleo fala por eventos.

export type Pulse = { id: number; target: 'notes' | 'editor' | 'status'; dir: 'in' | 'out' };

function deviceId(): string {
  try {
    const saved = localStorage.getItem('tanden.device');
    if (saved) return saved;
    const id = `dev-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('tanden.device', id);
    return id;
  } catch {
    return `dev-${Math.random().toString(36).slice(2, 8)}`;
  }
}

const WELCOME = `# Bem-vinda ao Tanden Engine

Este é o seu cofre. Cada nota é um arquivo **.md** comum, então o Obsidian abre a mesma pasta.

- Crie notas no botão **+** ou com **Ctrl+N**
- Use [[links]] entre notas, como no Obsidian
- O tanden gira enquanto trabalha; as veias mostram dados viajando

Edições feitas no celular e no PC ao mesmo tempo se fundem sozinhas.
`;

class Engine {
  readonly bus = new EventBus();
  vault!: Vault;
  boards!: BoardStore;
  /** quadros (.canvas) e um contador que sobe quando chega mudança de fora */
  boardList = $state<string[]>([]);
  boardRev = $state(0);
  /** planilhas (.xlsx); o módulo de planilhas cuida do estado da tela */
  sheets!: SheetStore;
  /** anotações dos PDFs (o PDF em si nunca é reescrito) */
  annots!: AnnotationStore;
  storage!: Storage;
  private replicator: Replicator | null = null;
  /** última falha ao falar com o Drive; o app segue funcionando offline */
  driveError = $state('');
  driveOn = $state(false);
  ready = $state(false);
  location = $state('');
  notes = $state<string[]>([]);
  active = $state<string | null>(null);
  /** conteúdo da nota ativa; muda quando chega edição de outro aparelho */
  content = $state('');
  /** processos em andamento (sync, IA...). Enquanto > 0, as veias fluem. */
  running = $state<Record<string, string>>({});
  lastSync = $state<Date | null>(null);
  pulses = $state<Pulse[]>([]);
  private pulseSeq = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  /** pedido de sync que chegou enquanto outro rodava */
  private syncAgain = false;

  get busy(): boolean {
    return Object.keys(this.running).length > 0;
  }

  async start(): Promise<void> {
    let storage: Storage;
    if (isTauri()) {
      storage = new TauriStorage();
      this.location = await vaultRoot();
    } else {
      storage = new BrowserStorage();
      this.location = 'navegador (IndexedDB)';
    }
    this.storage = storage;
    this.vault = new Vault(storage, deviceId(), this.bus);
    this.boards = new BoardStore(storage, this.vault.deviceId, this.bus);
    this.sheets = new SheetStore(storage, this.vault.deviceId, this.bus);
    this.annots = new AnnotationStore(storage, this.vault.deviceId, this.bus);
    await google.refresh();
    this.connectDrive();
    this.bus.on('*', (e) => this.onEvent(e));
    await this.vault.sync();
    await this.boards.sync();
    await this.sheets.sync();
    await this.annots.sync();
    if (this.vault.list().length === 0) {
      this.vault.create('Bem-vinda.md', WELCOME);
      await this.vault.sync();
    }
    this.refresh();
    this.open(this.notes[0] ?? null);
    this.ready = true;
    setInterval(() => void this.syncNow(), 30_000);
    if (isTauri()) {
      // outro programa (Claude Code, Gemini CLI, Obsidian) mexeu numa nota
      await listen<string[]>('vault-changed', (e) => {
        if (!e.payload.some((p) => p.endsWith('.md') || p.endsWith('.canvas') || p.endsWith('.xlsx'))) return;
        if (this.watchTimer) clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => void this.syncNow(), 400);
      });
    }
  }

  private onEvent(e: TandenEvent): void {
    switch (e.type) {
      case 'process.started':
        this.running = { ...this.running, [e.id]: e.label };
        break;
      case 'process.finished': {
        const { [e.id]: _, ...rest } = this.running;
        this.running = rest;
        break;
      }
      case 'note.changed':
        if (e.origin !== 'local') {
          this.pulse('notes', 'out');
          if (e.path === this.active) {
            this.content = this.vault.read(e.path);
            this.pulse('editor', 'out');
          }
        }
        break;
      case 'note.created':
        this.refresh();
        this.pulse('notes', 'out');
        break;
      case 'board.created':
        this.boardList = this.boards.list();
        break;
      case 'board.changed':
        if (e.origin !== 'local') {
          this.boardRev++;
          this.pulse('editor', 'out');
        }
        break;
      case 'sync.finished':
        this.lastSync = new Date();
        this.refresh();
        break;
    }
  }

  pulse(target: Pulse['target'], dir: Pulse['dir']): void {
    const p = { id: ++this.pulseSeq, target, dir };
    this.pulses = [...this.pulses, p];
    setTimeout(() => (this.pulses = this.pulses.filter((x) => x.id !== p.id)), 1200);
  }

  refresh(): void {
    this.notes = this.vault.list();
  }

  open(path: string | null): void {
    this.active = path;
    this.content = path ? this.vault.read(path) : '';
  }

  /** O editor chama isto a cada digitação. O sync espera uma pausa. */
  edit(text: string): void {
    if (!this.active || text === this.content) return;
    this.content = text;
    this.vault.write(this.active, text);
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.pulse('editor', 'in');
      void this.syncNow();
    }, 1500);
  }

  /** Grava uma nota inteira vinda de fora do editor (ex.: lembretes); cria se não existir. */
  writeNote(path: string, text: string): void {
    if (this.vault.has(path)) this.vault.write(path, text);
    else {
      this.vault.create(path, text);
      this.refresh();
    }
    if (path === this.active) this.content = text;
    void this.syncNow();
  }

  /** Um quadro foi editado aqui: avisa as veias e sincroniza depois de uma pausa. */
  boardEdited(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.pulse('editor', 'in');
      void this.syncNow();
    }, 1500);
  }

  newNote(): void {
    let n = 1;
    let path = 'Nova nota.md';
    while (this.vault.has(path)) path = `Nova nota ${++n}.md`;
    this.vault.create(path, `# ${path.replace(/\.md$/, '')}\n\n`);
    this.refresh();
    this.open(path);
    this.pulse('notes', 'in');
    void this.syncNow();
  }

  /** Liga o sync com o Drive se a conta Google estiver conectada. */
  connectDrive(): void {
    this.replicator = google.status.signed_in
      ? new Replicator(this.storage, new DriveRemote({ getToken: google.token }), this.vault.deviceId)
      : null;
    this.driveOn = this.replicator !== null;
  }

  async syncNow(): Promise<void> {
    if (Object.keys(this.running).some((k) => k.includes('sync:'))) {
      this.syncAgain = true;
      return;
    }
    try {
      await this.syncOnce();
    } finally {
      if (this.syncAgain) {
        this.syncAgain = false;
        void this.syncNow();
      }
    }
  }

  private async syncOnce(): Promise<void> {
    if (!this.replicator) {
      await this.vault.sync();
      await this.boards.sync();
      await this.sheets.sync();
      await this.annots.sync();
      return;
    }
    try {
      await fullSync(this.vault, this.replicator, [this.boards, this.sheets, this.annots]);
      this.driveError = '';
    } catch (e) {
      // sem internet ou token vencido: o cofre local continua íntegro
      this.driveError = String(e);
      await this.vault.sync();
      await this.boards.sync();
      await this.sheets.sync();
      await this.annots.sync();
    }
  }
}

export const engine = new Engine();
