// O "sistema nervoso" do Tanden: tudo que acontece vira um evento.
// A interface (veias e pulsos) e as automações escutam daqui.
export type TandenEvent =
  | { type: 'note.created'; path: string }
  | { type: 'note.changed'; path: string; origin: 'local' | 'remote' | 'external' }
  | { type: 'process.started'; id: string; label: string }
  | { type: 'process.finished'; id: string; ok: boolean }
  | { type: 'sync.finished'; merged: number; external: number; written: number };

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

  emit(e: TandenEvent): void {
    this.handlers.get(e.type)?.forEach((fn) => fn(e));
    this.handlers.get('*')?.forEach((fn) => fn(e));
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
