// O "sistema nervoso" do Tanden: tudo que acontece vira um evento.
// A interface (veias e pulsos) e as automações escutam daqui.
export type TandenEvent =
  | { type: 'note.created'; path: string }
  | { type: 'note.changed'; path: string; origin: 'local' | 'remote' | 'external' }
  | { type: 'note.deleted'; path: string }
  | { type: 'board.created'; path: string }
  | { type: 'board.changed'; path: string; origin: 'local' | 'remote' | 'external' }
  | { type: 'board.deleted'; path: string }
  | { type: 'process.started'; id: string; label: string }
  | { type: 'process.finished'; id: string; ok: boolean }
  | { type: 'sync.finished'; merged: number; external: number; written: number }
  | { type: 'reminder.fired'; path: string; text: string; at: number }
  | { type: 'sheet.changed'; path: string; origin: 'local' | 'remote' | 'external' }
  | { type: 'annot.changed'; path: string; origin: 'local' | 'remote' }
  | { type: 'library.changed'; origin: 'local' | 'remote' }
  | { type: 'file.imported'; path: string; from: string };

export type EventType = TandenEvent['type'];
type Handler<E extends TandenEvent = TandenEvent> = (e: E) => void;

export class EventBus {
  private handlers = new Map<EventType | '*', Set<Handler<any>>>();

  on<T extends EventType>(type: T, fn: Handler<Extract<TandenEvent, { type: T }>>): () => void;
  on(type: '*', fn: Handler): () => void;
  on(type: EventType | '*', fn: Handler<any>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  /**
   * Avisa todos os ouvintes. Um ouvinte que falha não impede os outros nem
   * quem emitiu (um sync não pode parar por causa de um painel com defeito).
   */
  emit(e: TandenEvent): void {
    for (const set of [this.handlers.get(e.type), this.handlers.get('*')])
      for (const fn of [...(set ?? [])]) {
        try {
          fn(e);
        } catch (err) {
          console.error(`[tanden] ouvinte de ${e.type} falhou`, err);
        }
      }
  }

  /** Envolve um trabalho longo em process.started/finished, para a interface mostrar fluxo. */
  async process<T>(id: string, label: string, work: () => Promise<T>): Promise<T> {
    this.emit({ type: 'process.started', id, label });
    try {
      const r = await work();
      this.emit({ type: 'process.finished', id, ok: true });
      return r;
    } catch (err) {
      this.emit({ type: 'process.finished', id, ok: false });
      throw err;
    }
  }
}
