import { ExprError, FILE_PROPS, Link, propConfig, show, type BaseDef, type PropConfig, type PropType, type Value } from '@tanden/core';

/** Tipo efetivo de uma coluna: o configurado, o da propriedade de arquivo ou um palpite pelo valor. */
export function typeOf(def: BaseDef, id: string, sample?: Value): PropType | 'formula' | 'title' {
  if (id === 'file.name') return 'title';
  const c = propConfig(def, id);
  if (c.type) return c.type;
  const f = FILE_PROPS.find((x) => x.id === id);
  if (f) return f.type === 'file' ? 'text' : f.type;
  if (id.startsWith('formula.')) return 'formula';
  return guess(sample);
}

export function guess(v: Value | undefined): PropType {
  if (v instanceof Date) return v.getHours() || v.getMinutes() ? 'datetime' : 'date';
  if (typeof v === 'boolean') return 'checkbox';
  if (typeof v === 'number') return 'number';
  if (v instanceof Link) return 'relation';
  if (Array.isArray(v)) return v.some((x) => x instanceof Link) ? 'relation' : 'multiselect';
  if (typeof v === 'string' && /^https?:\/\//.test(v)) return 'url';
  return 'text';
}

/** Lista de textos para seleções e relações. */
export function asStrings(v: Value): string[] {
  if (v === null || v === undefined || v instanceof ExprError) return [];
  if (Array.isArray(v)) return v.map((x) => (x instanceof Link ? x.target : show(x))).filter(Boolean);
  if (v instanceof Link) return [v.target];
  const s = show(v);
  return s ? [s] : [];
}

export const isEditable = (id: string, t: string) => id.startsWith('note.') && t !== 'formula' && t !== 'created' && t !== 'edited';

export type { PropConfig };
