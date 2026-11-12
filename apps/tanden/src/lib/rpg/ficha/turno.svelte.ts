/** Estado do turno de cada ficha (só nesta tela; não vai para a nota). */
export interface TurnState {
  round: number;
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  /** metros já andados */
  moved: number;
  /** Disparada: deslocamento extra */
  dash: boolean;
}

class Turnos {
  by = $state<Record<string, TurnState>>({});
  get(path: string): TurnState {
    return this.by[path] ?? { round: 1, action: false, bonus: false, reaction: false, moved: 0, dash: false };
  }
  set(path: string, patch: Partial<TurnState>) {
    this.by[path] = { ...this.get(path), ...patch };
  }
  /** novo turno: tudo volta, a reação também (2024: volta no começo do seu turno) */
  next(path: string) {
    this.by[path] = { round: this.get(path).round + 1, action: false, bonus: false, reaction: false, moved: 0, dash: false };
  }
  reset(path: string) {
    delete this.by[path];
  }
}

export const turnos = new Turnos();
