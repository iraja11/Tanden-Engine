import { PROP_TYPES } from '@tanden/core';

/** Ícone curto de cada tipo de coluna. */
export const PROP_ICON: Record<string, string> = {
  ...Object.fromEntries(PROP_TYPES.map((t) => [t.id, t.icon])),
  title: 'Aa', formula: 'ƒ',
};
