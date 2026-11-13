import { QuickCalc, type AngleMode, type QuickEntry } from '@tanden/core/src/calc';

/*
 * Estado da calculadora rápida. Mora fora do componente para sobreviver à troca
 * de aba (variáveis, ans e histórico continuam). O histórico fica no aparelho.
 */

const KEY = 'tanden.calc.quick';

interface Saved {
  angle: AngleMode;
  log: { expr: string; text: string; error?: boolean }[];
}

export interface LogLine {
  expr: string;
  text: string;
  error?: boolean;
}

function load(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

const show = (e: QuickEntry): LogLine =>
  e.result.kind === 'error' ? { expr: e.expr, text: e.result.error ?? 'Erro', error: true } : { expr: e.expr, text: e.result.text ?? '' };

class Quick {
  private calc = new QuickCalc();
  input = $state('');
  angle = $state<AngleMode>('rad');
  log = $state<LogLine[]>([]);
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    const s = load();
    if (s.angle === 'deg' || s.angle === 'rad') this.angle = s.angle;
    this.calc.angle = this.angle;
    // o histórico volta como texto; as contas sem erro são refeitas para valerem as variáveis e o ans
    for (const l of (s.log ?? []).slice(-60)) {
      if (!l.error) this.calc.run(l.expr);
    }
    this.log = (s.log ?? []).slice(-60);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ angle: this.angle, log: this.log.slice(-60) }));
    } catch {
      /* sem armazenamento */
    }
  }

  preview(expr: string) {
    return this.calc.preview(expr);
  }

  run(): boolean {
    const expr = this.input.trim();
    if (!expr) return false;
    this.calc.run(expr);
    const last = this.calc.history.at(-1);
    if (!last) return false;
    this.log = [...this.log, show(last)].slice(-200);
    const ok = last.result.kind !== 'error';
    if (ok) this.input = '';
    this.save();
    return ok;
  }

  setAngle(a: AngleMode): void {
    this.angle = a;
    this.calc.angle = a;
    this.save();
  }

  clear(): void {
    this.calc.clear();
    this.log = [];
    this.save();
  }
}

export const quick = new Quick();
