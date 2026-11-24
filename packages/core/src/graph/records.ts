import { AGENDA_FOLDER } from '../agenda/model';

/*
 * Notas que os módulos do app criam como registro (um evento da agenda, um
 * item de RPG, o diário de treino...). São muitas e quase não têm ligação de
 * ideia com o resto, então o grafo esconde por padrão; cada tipo tem a chave
 * dele na tela.
 */

export type RecordKind = 'agenda' | 'rpg' | 'registro' | 'modelo';

export const RECORD_KINDS: ReadonlyArray<{ id: RecordKind; label: string }> = [
  { id: 'agenda', label: 'Eventos da agenda' },
  { id: 'rpg', label: 'Itens, encontros e tabelas de RPG' },
  { id: 'registro', label: 'Registros (saúde, treinos, alimentação)' },
  { id: 'modelo', label: 'Modelos' },
];

/** pastas onde os módulos gravam um arquivo por dia ou por entrada */
const LOG_DIRS = ['Saúde/Registro/', 'Saúde/Treinos/', 'Exercícios/Registro/', 'Alimentação/Diário/', 'Alimentação/Cardápios/'];
/** `tipo:` do frontmatter que é dado de jogo, não ideia */
const RPG_TYPES = new Set(['item', 'encontro', 'tabela']);

/** Tipo de registro da nota, ou null se é uma nota comum. */
export function recordKind(path: string, text: string): RecordKind | null {
  if (path.startsWith(`${AGENDA_FOLDER}/`)) return 'agenda';
  if (LOG_DIRS.some((d) => path.startsWith(d))) return 'registro';
  if (path.startsWith('Modelos/')) return 'modelo';
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    const fm = end > 0 ? text.slice(0, end) : '';
    const m = /^tipo:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(fm);
    if (m && RPG_TYPES.has(m[1]!.trim().toLowerCase())) return 'rpg';
  }
  return null;
}
