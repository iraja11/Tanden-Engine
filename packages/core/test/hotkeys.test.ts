import { describe, expect, it } from 'vitest';
import { comboOf, normalizeCombo } from '../src/hotkeys';

const ev = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
  key, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
});

describe('atalhos', () => {
  it('lê a tecla física: Shift+7 no ABNT continua sendo 7', () => {
    expect(comboOf(ev('&', 'Digit7', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+7');
    expect(comboOf(ev('k', 'KeyK', { metaKey: true }))).toBe('Ctrl+K');
    expect(comboOf(ev('=', 'Equal', { ctrlKey: true }))).toBe('Ctrl+=');
    expect(comboOf(ev(',', 'Comma', { ctrlKey: true }))).toBe('Ctrl+,');
    expect(comboOf(ev('F5', 'F5'))).toBe('F5');
    expect(comboOf(ev('Escape', 'Escape', { altKey: true }))).toBe('Alt+Esc');
    expect(comboOf(ev('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
  });

  it('normaliza o que se escreve à mão', () => {
    expect(normalizeCombo('shift+ctrl+k')).toBe('Ctrl+Shift+K');
    expect(normalizeCombo('Cmd+Alt+p')).toBe('Ctrl+Alt+P');
    expect(normalizeCombo('F2')).toBe('F2');
  });
});
