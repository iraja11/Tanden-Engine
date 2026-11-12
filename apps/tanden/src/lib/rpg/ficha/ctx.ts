import type { Character, PropValue } from '@tanden/core';

/** O que as abas da ficha recebem da ficha em volta. */
export interface FichaCtx {
  path: string;
  name: string;
  text: string;
  c: Character;
  compact: boolean;
  /** grava propriedades (null apaga) */
  write: (patch: Record<string, PropValue | null>) => void;
  /** troca o texto da nota inteira */
  update: (fn: (t: string) => string) => void;
  /** d20 + bônus, com vantagem e exaustão */
  rollD20: (bonus: number, label: string) => void;
  /** fórmula qualquer; `d20` aplica vantagem e exaustão */
  rollF: (f: string, label: string, d20?: boolean) => void;
  onOpenNote?: (p: string) => void;
}
