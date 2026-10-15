/*
 * Atalhos de teclado como texto ("Ctrl+Shift+K"), iguais em qualquer layout.
 * A tela de atalhos e o teclado global do app usam isto.
 */

const CODE: Record<string, string> = {
  Equal: '=', Minus: '-', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Space: 'Space',
  NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadEnter: 'Enter',
};
const KEYNAME: Record<string, string> = { ' ': 'Space', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

/**
 * O atalho de um evento de teclado, no formato "Ctrl+Alt+Shift+Tecla". Usa a
 * tecla física para letras, números e pontuação: Ctrl+Shift+7 continua sendo
 * "7" em qualquer layout (no ABNT, Shift+7 é "&").
 */
export function comboOf(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(e.key)) return null;
  let key: string;
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (letter) key = letter[1]!;
  else if (digit) key = digit[1]!;
  else if (CODE[e.code]) key = CODE[e.code]!;
  else key = KEYNAME[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key);
  const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean);
  return [...mods, key].join('+');
}

/** Normaliza um atalho escrito à mão ("shift+ctrl+k" → "Ctrl+Shift+K"). */
export function normalizeCombo(c: string): string {
  const parts = c.split('+').map((p) => p.trim()).filter(Boolean);
  const low = parts.map((p) => p.toLowerCase());
  const key = parts.filter((_, i) => !['ctrl', 'cmd', 'meta', 'alt', 'option', 'shift'].includes(low[i]!)).pop() ?? '';
  const mods = [low.some((p) => p === 'ctrl' || p === 'cmd' || p === 'meta') ? 'Ctrl' : '', low.includes('alt') || low.includes('option') ? 'Alt' : '', low.includes('shift') ? 'Shift' : ''].filter(Boolean);
  return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
}
