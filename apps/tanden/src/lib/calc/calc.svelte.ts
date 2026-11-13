/*
 * Escolhas da aba Cálculo que ficam só no aparelho: qual modo está aberto
 * (folhas, calculadora ou financeira) e a ferramenta financeira da vez.
 * Sem mathjs aqui: este arquivo entra no pacote principal (paleta de comandos).
 */

export type CalcMode = 'folhas' | 'calculadora' | 'financas';
export type FinTool = 'investir' | 'financiar' | 'hp' | 'fluxo' | 'taxas' | 'porcento';

const KEY = 'tanden.calc';

interface Saved {
  mode: CalcMode;
  fin: FinTool;
  sci: boolean;
}

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

class CalcPrefs {
  mode = $state<CalcMode>('folhas');
  fin = $state<FinTool>('investir');
  /** teclado científico aberto */
  sci = $state(true);

  constructor() {
    const s = load();
    if (s.mode === 'folhas' || s.mode === 'calculadora' || s.mode === 'financas') this.mode = s.mode;
    if (s.fin) this.fin = s.fin;
    if (typeof s.sci === 'boolean') this.sci = s.sci;
  }

  set(p: Partial<Saved>): void {
    if (p.mode) this.mode = p.mode;
    if (p.fin) this.fin = p.fin;
    if (typeof p.sci === 'boolean') this.sci = p.sci;
    try {
      localStorage.setItem(KEY, JSON.stringify({ mode: this.mode, fin: this.fin, sci: this.sci }));
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
}

export const calcPrefs = new CalcPrefs();
