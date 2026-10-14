import { engine } from './engine.svelte';
import { sound } from './sound.svelte';

// Liga o "sistema nervoso" aos sentidos: cada evento do núcleo que importa para
// você vira um gesto do símbolo tanden e, se fizer sentido, um som.
// Ações feitas aqui na tela tocam o próprio som na hora do clique; o que chega
// por evento (outro aparelho, Drive, IA, lembrete) toca daqui.

export type Flash = { kind: 'in' | 'ok' | 'fail'; n: number } | null;

/** peso de cada processo no giro: a IA pensando acelera mais que um sync */
const weight = (id: string) => (id === 'ollama' ? 2.5 : id.startsWith('fullsync') || id.includes('import') || id === 'update' ? 1.4 : 1);

class Feel {
  /** carga de trabalho que faz o símbolo girar (0 = parado) */
  load = $state(0);
  /** sobe para pedir uma volta completa do símbolo */
  kick = $state(0);
  flash = $state<Flash>(null);
  private flashSeq = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private localDepth = 0;
  private lastKick = 0;
  private syncFailed = false;
  private started = false;

  /** Roda uma ação da própria tela: os eventos que ela gerar não tocam som de "chegou". */
  local<T>(fn: () => T): T {
    this.localDepth++;
    try {
      return fn();
    } finally {
      this.localDepth--;
    }
  }

  signal(kind: NonNullable<Flash>['kind']): void {
    this.flash = { kind, n: ++this.flashSeq };
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => (this.flash = null), kind === 'fail' ? 4000 : 900);
  }

  turn(): void {
    const now = performance.now();
    if (now - this.lastKick < 1500) return;
    this.lastKick = now;
    this.kick++;
  }

  /**
   * Carga atual. Processo de menos de 150 ms (o sync local de cada 30 s) não
   * mexe no símbolo: parado continua querendo dizer "tudo em dia".
   */
  private updateLoad(): void {
    const ids = Object.keys(engine.running);
    const next = ids.reduce((s, id) => s + weight(id), 0);
    if (next === 0) {
      if (this.loadTimer) clearTimeout(this.loadTimer);
      this.loadTimer = null;
      this.load = 0;
      return;
    }
    if (this.load > 0) {
      this.load = next;
      return;
    }
    if (this.loadTimer) return;
    this.loadTimer = setTimeout(() => {
      this.loadTimer = null;
      const ids = Object.keys(engine.running);
      this.load = ids.reduce((s, id) => s + weight(id), 0);
    }, 150);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    engine.bus.on('*', (e) => {
      // espera o engine atualizar `running` antes de recalcular a carga
      queueMicrotask(() => this.updateLoad());
      const local = this.localDepth > 0;
      switch (e.type) {
        case 'note.changed':
        case 'board.changed':
        case 'sheet.changed':
        case 'annot.changed':
          if (e.origin !== 'local') {
            sound.play('receive');
            this.signal('in');
          }
          break;
        case 'note.created':
        case 'board.created':
          if (!local && engine.ready) {
            sound.play('receive');
            this.signal('in');
          }
          break;
        case 'sync.finished':
          // algo foi de fato fundido: o símbolo dá uma volta
          if (e.merged > 0 || e.external > 0) this.turn();
          break;
        case 'process.started':
          if (e.id === 'ollama') sound.play('ai-start');
          break;
        case 'process.finished':
          if (e.id === 'ollama') {
            sound.play(e.ok ? 'ai-done' : 'error');
            if (!e.ok) this.signal('fail');
          } else if (e.id.startsWith('fullsync')) {
            if (!e.ok && !this.syncFailed) this.signal('fail');
            else if (e.ok && this.syncFailed) { this.signal('ok'); sound.play('sync'); }
            this.syncFailed = !e.ok;
          }
          break;
        case 'file.imported':
          sound.play('receive');
          this.signal('in');
          break;
        case 'reminder.fired':
          sound.play('alert');
          this.signal('in');
          break;
      }
    });
  }
}

export const feel = new Feel();
