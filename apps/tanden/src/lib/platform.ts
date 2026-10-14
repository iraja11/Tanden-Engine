import { isTauri } from './storage-tauri';

/** App instalado no computador: tem terminal, Claude Code e Gemini CLI. */
export const desktop = isTauri() && !/Android|iPhone|iPad/i.test(navigator.userAgent);
